exports.handler = async (event) => {
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
      }
    });
    const data = await response.text();
    return {
      statusCode: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: data,
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
