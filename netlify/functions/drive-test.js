// Endpoint debug sementara - DELETE setelah upload berhasil
// Akses: /api/drive-test
exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };

  try {
    // Step 1: Cek env var
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT;
    if (!raw) return { statusCode: 200, headers, body: JSON.stringify({ step: 1, error: 'GOOGLE_SERVICE_ACCOUNT tidak ada di env vars' }) };

    let creds;
    try { creds = JSON.parse(raw); }
    catch(e) { return { statusCode: 200, headers, body: JSON.stringify({ step: 1, error: 'JSON parse gagal: ' + e.message, rawLength: raw.length, rawStart: raw.substring(0, 50) }) }; }

    // Step 2: Cek credentials
    if (!creds.private_key) return { statusCode: 200, headers, body: JSON.stringify({ step: 2, error: 'private_key tidak ada', keys: Object.keys(creds) }) };
    if (!creds.client_email) return { statusCode: 200, headers, body: JSON.stringify({ step: 2, error: 'client_email tidak ada' }) };

    // Step 3: Buat JWT
    const crypto = require('crypto');
    const now = Math.floor(Date.now() / 1000);
    const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      iss: creds.client_email, scope: 'https://www.googleapis.com/auth/drive',
      aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now
    })).toString('base64url');
    const input = `${header}.${payload}`;
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(input);
    const jwt = `${input}.${signer.sign(creds.private_key, 'base64url')}`;

    // Step 4: Get token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return { statusCode: 200, headers, body: JSON.stringify({ step: 4, error: 'Token gagal', detail: tokenData }) };

    // Step 5: Test upload file kecil (1 byte txt)
    const token = tokenData.access_token;
    const ROOT = '1WYRRcm5oxbCaPx8s9XNUkTUe1b85wuDG';
    const testContent = Buffer.from('SPM test file');
    const boundary = 'SPMboundary1234567890';
    const metaJson = JSON.stringify({ name: 'test-debug.txt', parents: [ROOT] });

    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`),
      Buffer.from(metaJson),
      Buffer.from(`\r\n--${boundary}\r\nContent-Type: text/plain\r\n\r\n`),
      testContent,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    const uploadRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
        body
      }
    );
    const uploadText = await uploadRes.text();
    let uploadData;
    try { uploadData = JSON.parse(uploadText); } catch(e) { uploadData = { rawText: uploadText.substring(0, 300) }; }

    return { statusCode: 200, headers, body: JSON.stringify({
      step: 5, success: !!uploadData.id,
      fileId: uploadData.id, fileName: uploadData.name,
      uploadStatus: uploadRes.status,
      detail: uploadData.id ? 'UPLOAD BERHASIL!' : uploadData,
      clientEmail: creds.client_email
    })};

  } catch(e) {
    return { statusCode: 200, headers, body: JSON.stringify({ error: e.message, stack: e.stack?.split('\n').slice(0,3) }) };
  }
};
