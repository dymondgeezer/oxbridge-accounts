exports.handler = async (event) => {
  const token = event.headers.authorization?.replace('Bearer ', '');
  if (!token) return { statusCode: 401, body: 'No token' };

  try {
    const response = await fetch('https://api.xero.com/connections', {
      headers: { Authorization: 'Bearer ' + token }
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
