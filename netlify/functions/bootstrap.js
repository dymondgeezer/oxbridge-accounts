import { getStore } from '@netlify/blobs';

const TOKEN_URL = 'https://identity.xero.com/connect/token';

// One-time "connect Xero" step (admin only). The browser sends the OAuth code;
// this exchanges it server-side using the secret env var, discovers the three
// organisations, and stores the refresh token + tenant map in Blobs.
export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  const pw = event.headers['x-app-password'] || '';
  if (!process.env.APP_PASSWORD || pw !== process.env.APP_PASSWORD) {
    return { statusCode: 401, body: JSON.stringify({ error: 'unauthorized' }) };
  }

  let payload = {};
  try { payload = JSON.parse(event.body || '{}'); } catch (e) { /* ignore */ }
  const { code, redirect_uri, code_verifier } = payload;
  if (!code || !redirect_uri) {
    return { statusCode: 400, body: JSON.stringify({ error: 'missing code or redirect_uri' }) };
  }

  // Exchange the authorization code for tokens (confidential client, server-side secret)
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri,
    client_id: process.env.XERO_CLIENT_ID,
    client_secret: process.env.XERO_CLIENT_SECRET,
  });
  if (code_verifier) body.set('code_verifier', code_verifier);

  const tr = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!tr.ok) {
    return { statusCode: 502, body: JSON.stringify({ error: 'token_exchange_failed', detail: await tr.text() }) };
  }
  const t = await tr.json();

  // Discover connected organisations
  const cr = await fetch('https://api.xero.com/connections', {
    headers: { Authorization: 'Bearer ' + t.access_token },
  });
  const tenants = await cr.json();
  if (!Array.isArray(tenants) || !tenants.length) {
    return { statusCode: 502, body: JSON.stringify({ error: 'no_organisations' }) };
  }

  // Map tenant names to org keys
  const hints = {
    uk:  ['oxbridge associates limited', 'uk ltd', 'oxbridge ltd'],
    bv:  ['b.v', 'oxbridge associates bv', 'oxbridge bv', 'netherlands'],
    ard: ['ard international', 'a.r.d'],
  };
  const map = {};
  for (const ten of tenants) {
    const name = (ten.tenantName || '').toLowerCase();
    for (const [k, hs] of Object.entries(hints)) {
      if (!map[k] && hs.some(h => name.includes(h))) { map[k] = ten.tenantId; break; }
    }
  }
  // Assign any remaining unmatched tenants to free slots
  for (const ten of tenants) {
    if (Object.values(map).includes(ten.tenantId)) continue;
    for (const k of ['uk', 'bv', 'ard']) {
      if (!map[k]) { map[k] = ten.tenantId; break; }
    }
  }

  const store = getStore({ name: 'xero-auth', consistency: 'strong' });
  await store.setJSON('tokens', {
    refresh_token: t.refresh_token,
    access_token: t.access_token,
    expires_at: Date.now() + (t.expires_in * 1000),
    tenants: map,
    tenantNames: tenants.map(x => x.tenantName),
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, mapped: map, tenantNames: tenants.map(x => x.tenantName) }),
  };
};
