const crypto = require('crypto');

async function getAccessToken() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKeyRaw = process.env.GOOGLE_PRIVATE_KEY_BASE || '';
  let privateKey = Buffer.from(privateKeyRaw, 'base64').toString('utf8');
  privateKey = privateKey.replace(/\\n/g, '\n');
  if (!privateKey.includes('\n')) {
    privateKey = privateKey
      .replace('-----BEGIN PRIVATE KEY-----', '-----BEGIN PRIVATE KEY-----\n')
      .replace('-----END PRIVATE KEY-----', '\n-----END PRIVATE KEY-----')
      .replace('-----BEGIN RSA PRIVATE KEY-----', '-----BEGIN RSA PRIVATE KEY-----\n')
      .replace('-----END RSA PRIVATE KEY-----', '\n-----END RSA PRIVATE KEY-----');
  }
  const now = Math.floor(Date.now() / 1000);
  const headerB64 = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  const payloadB64 = Buffer.from(JSON.stringify({ iss: clientEmail, scope: 'https://www.googleapis.com/auth/drive', aud: 'https://oauth2.googleapis.com/token', exp: now+3600, iat: now })).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  const sigInput = `${headerB64}.${payloadB64}`;
  const sign = crypto.createSign('SHA256');
  sign.update(sigInput);
  sign.end();
  const sigB64 = sign.sign(privateKey, 'base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  const jwt = `${sigInput}.${sigB64}`;
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt })
  });
  const data = await tokenRes.json();
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
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
    });
    if (res.status === 204 || res.ok) return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    const err = await res.json().catch(() => ({}));
    return { statusCode: res.status, headers, body: JSON.stringify({ success: false, error: err.error?.message || 'Gagal hapus' }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: err.message }) };
  }
};
