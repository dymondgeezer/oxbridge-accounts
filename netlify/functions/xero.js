export const handler = async (event) => {
  const token = event.headers.authorization?.replace('Bearer ', '');
  const tenantId = event.headers['xero-tenant-id'];
  const path = event.queryStringParameters?.path || '';

  if (!token || !tenantId) return { statusCode: 401, body: 'Missing credentials' };

  try {
    const response = await fetch(`https://api.xero.com/api.xro/2.0${path}`, {
      headers: {
        Authorization: 'Bearer ' + token,
        'Xero-Tenant-Id': tenantId,
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
      }
    });
    const data = await response.text();
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
      body: data,
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
