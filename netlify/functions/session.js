import { getStore } from '@netlify/blobs';

const TOKEN_URL = 'https://identity.xero.com/connect/token';

// Validates the shared password and ensures a fresh Xero access token.
// The front end calls this ONCE before firing its parallel data requests,
// so the token is refreshed a single time (avoids concurrent-refresh races).
export const handler = async (event) => {
  const pw = event.headers['x-app-password'] || '';
  if (!process.env.APP_PASSWORD || pw !== process.env.APP_PASSWORD) {
    return { statusCode: 401, body: JSON.stringify({ error: 'unauthorized' }) };
  }

  const store = getStore({ name: 'xero-auth', consistency: 'strong' });
  let bundle = await store.get('tokens', { type: 'json' });
  if (!bundle || !bundle.refresh_token) {
    return { statusCode: 409, body: JSON.stringify({ error: 'not_connected' }) };
  }

  // Refresh if the access token is within 2 minutes of expiry
  if (Date.now() > (bundle.expires_at || 0) - 120000) {
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
    if (!r.ok) {
      return { statusCode: 502, body: JSON.stringify({ error: 'refresh_failed', detail: await r.text() }) };
    }
    const t = await r.json();
    bundle.access_token = t.access_token;
    bundle.refresh_token = t.refresh_token || bundle.refresh_token;
    bundle.expires_at = Date.now() + (t.expires_in * 1000);
    await store.setJSON('tokens', bundle);
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, orgs: Object.keys(bundle.tenants || {}), tenantNames: bundle.tenantNames || [] }),
  };
};
