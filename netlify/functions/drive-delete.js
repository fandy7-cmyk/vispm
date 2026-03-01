const { createSign } = require('crypto');

function makeJWT(clientEmail, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  })).toString('base64url');
  const sign = createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  return `${header}.${payload}.${sign.sign(privateKey, 'base64url')}`;
}

async function getAccessToken() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = Buffer.from(process.env.GOOGLE_PRIVATE_KEY_BASE64 || '', 'base64').toString('utf8');
  const jwt = makeJWT(clientEmail, privateKey);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt })
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Token error: ' + JSON.stringify(data));
  return data.access_token;
}

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  try {
    const { fileId } = JSON.parse(event.body || '{}');
    if (!fileId) return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'fileId diperlukan' }) };
    const token = await getAccessToken();
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.status === 204 || res.ok) return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    const err = await res.json().catch(() => ({}));
    return { statusCode: res.status, headers, body: JSON.stringify({ success: false, error: err.error?.message || 'Gagal hapus' }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: err.message }) };
  }
};
