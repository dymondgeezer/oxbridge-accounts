import { getStore } from '@netlify/blobs';

const API = 'https://api.xero.com/api.xro/2.0';
const TOKEN_URL = 'https://identity.xero.com/connect/token';

// Gated Xero proxy. Holds tokens server-side (in Netlify Blobs); the browser
// only ever sends the shared password + which org + which Xero path it wants.
export const handler = async (event) => {
  const pw = event.headers['x-app-password'] || '';
  if (!process.env.APP_PASSWORD || pw !== process.env.APP_PASSWORD) {
    return { statusCode: 401, body: JSON.stringify({ error: 'unauthorized' }) };
  }

  const org = event.queryStringParameters?.org;
  const path = event.queryStringParameters?.path || '';
  if (!org || !path) {
    return { statusCode: 400, body: JSON.stringify({ error: 'missing org or path' }) };
  }

  const store = getStore({
    name: 'xero-auth',
    consistency: 'strong',
    siteID: process.env.BLOBS_SITE_ID || process.env.SITE_ID,
    token: process.env.BLOBS_TOKEN,
  });
  let bundle = await store.get('tokens', { type: 'json' });
  if (!bundle || !bundle.refresh_token) {
    return { statusCode: 409, body: JSON.stringify({ error: 'not_connected' }) };
  }

  // Fallback refresh (session.js normally refreshes first; this is belt-and-braces)
  if (Date.now() > (bundle.expires_at || 0) - 60000) {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: bundle.refresh_token,
      client_id: process.env.XERO_CLIENT_ID,
      client_secret: process.env.XERO_CLIENT_SECRET,
    });
    const r = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (r.ok) {
      const t = await r.json();
      bundle.access_token = t.access_token;
      bundle.refresh_token = t.refresh_token || bundle.refresh_token;
      bundle.expires_at = Date.now() + (t.expires_in * 1000);
      await store.setJSON('tokens', bundle);
    }
  }

  const tenantId = bundle.tenants?.[org];
  if (!tenantId) {
    return { statusCode: 409, body: JSON.stringify({ error: 'org_not_mapped', org }) };
  }

  try {
    const resp = await fetch(`${API}${path}`, {
      headers: {
        Authorization: 'Bearer ' + bundle.access_token,
        'Xero-Tenant-Id': tenantId,
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
      },
    });
    const data = await resp.text();
    return {
      statusCode: resp.status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
      body: data,
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
