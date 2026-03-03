// Endpoint debug Drive — test koneksi service account
exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  try {
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKeyRaw = process.env.GOOGLE_PRIVATE_KEY_BASE;
    if (!clientEmail) return { statusCode: 200, headers, body: JSON.stringify({ step: 1, error: 'GOOGLE_SERVICE_ACCOUNT_EMAIL tidak ada' }) };
    if (!privateKeyRaw) return { statusCode: 200, headers, body: JSON.stringify({ step: 1, error: 'GOOGLE_PRIVATE_KEY_BASE tidak ada' }) };

    const privateKey = Buffer.from(privateKeyRaw, 'base64').toString('utf8');
    const crypto = require('crypto');
    const now = Math.floor(Date.now() / 1000);
    const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      iss: clientEmail, scope: 'https://www.googleapis.com/auth/drive',
      aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now
    })).toString('base64url');
    const input = `${header}.${payload}`;
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(input);
    const jwt = `${input}.${signer.sign(privateKey, 'base64url')}`;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return { statusCode: 200, headers, body: JSON.stringify({ step: 4, error: 'Token gagal', detail: tokenData }) };

    const token = tokenData.access_token;
    const ROOT  = '1WYRRcm5oxbCaPx8s9XNUkTUe1b85wuDG';
    const boundary = 'SPMboundary1234567890';
    const metaJson = JSON.stringify({ name: 'test-debug.txt', parents: [ROOT] });
    const fileBytes = Buffer.from('SPM test file - ' + new Date().toISOString());
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`),
      Buffer.from(metaJson),
      Buffer.from(`\r\n--${boundary}\r\nContent-Type: text/plain\r\n\r\n`),
      fileBytes,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);
    const uploadRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name&supportsAllDrives=true',
      { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` }, body }
    );
    const uploadText = await uploadRes.text();
    let uploadData;
    try { uploadData = JSON.parse(uploadText); } catch(e) { uploadData = { raw: uploadText.substring(0, 300) }; }
    return { statusCode: 200, headers, body: JSON.stringify({
      success: !!uploadData.id,
      result: uploadData.id ? `✅ BERHASIL! File ID: ${uploadData.id}` : uploadData,
      clientEmail
    })};
  } catch(e) {
    return { statusCode: 200, headers, body: JSON.stringify({ error: e.message }) };
  }
};
