const crypto = require('crypto');

async function getAccessToken() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKeyRaw = process.env.GOOGLE_PRIVATE_KEY_BASE;
  if (!clientEmail || !privateKeyRaw) throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL atau GOOGLE_PRIVATE_KEY_BASE belum dikonfigurasi');
  // Decode base64, lalu fix newlines jika hilang saat encode
  let privateKey = Buffer.from(privateKeyRaw, 'base64').toString('utf8');
  // Kalau private key tidak punya newline (sering terjadi saat paste), tambahkan manual
  if (!privateKey.includes('\n')) {
    privateKey = privateKey
      .replace('-----BEGIN RSA PRIVATE KEY-----', '-----BEGIN RSA PRIVATE KEY-----\n')
      .replace('-----END RSA PRIVATE KEY-----', '\n-----END RSA PRIVATE KEY-----')
      .replace('-----BEGIN PRIVATE KEY-----', '-----BEGIN PRIVATE KEY-----\n')
      .replace('-----END PRIVATE KEY-----', '\n-----END PRIVATE KEY-----');
  }
  // Ganti literal \n (string) dengan newline asli
  privateKey = privateKey.replace(/\\n/g, '\n');

  const now = Math.floor(Date.now() / 1000);

  // Build JWT header + payload
  const headerB64 = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const payloadB64 = Buffer.from(JSON.stringify({
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  })).toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const sigInput = `${headerB64}.${payloadB64}`;

  // Sign with RS256
  const sign = crypto.createSign('SHA256');
  sign.update(sigInput);
  sign.end();
  const sigB64 = sign.sign(privateKey, 'base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const jwt = `${sigInput}.${sigB64}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error('Token error: ' + JSON.stringify(tokenData));
  return tokenData.access_token;
}

async function findOrCreateFolder(token, folderName, parentId) {
  const q = `name='${folderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) return searchData.files[0].id;

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
  });
  const folder = await createRes.json();
  if (!folder.id) throw new Error('Gagal buat folder: ' + folderName);
  return folder.id;
}

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    const body = JSON.parse(event.body || '{}');
    const { fileName, fileBase64, folderId, folderPath } = body;
    if (!fileName || !fileBase64 || !folderId) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Missing required fields' }) };
    }

    const token = await getAccessToken();

    let targetFolderId = folderId;
    if (folderPath && Array.isArray(folderPath) && folderPath.length > 0) {
      for (const name of folderPath) {
        targetFolderId = await findOrCreateFolder(token, name, targetFolderId);
      }
    }

    const base64Data = fileBase64.includes(',') ? fileBase64.split(',')[1] : fileBase64;
    const fileBytes = Buffer.from(base64Data, 'base64');
    const ext = fileName.split('.').pop().toLowerCase();
    const mimeMap = { pdf:'application/pdf', jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', doc:'application/msword', docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls:'application/vnd.ms-excel', xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
    const mimeType = mimeMap[ext] || 'application/octet-stream';

    const boundary = 'spm_bndry_' + Date.now();
    const metadata = JSON.stringify({ name: fileName, parents: [targetFolderId] });
    const multipart = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
      fileBytes,
      Buffer.from(`\r\n--${boundary}--`)
    ]);

    const uploadRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
          'Content-Length': String(multipart.length)
        },
        body: multipart
      }
    );

    const result = await uploadRes.json();
    if (!uploadRes.ok || !result.id) {
      return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: result.error?.message || 'Upload gagal' }) };
    }

    // Set anyone can view
    await fetch(`https://www.googleapis.com/drive/v3/files/${result.id}/permissions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' })
    });

    const fileUrl = `https://drive.google.com/file/d/${result.id}/view`;
    return {
      statusCode: 200, headers,
      body: JSON.stringify({ success: true, data: { fileId: result.id, name: result.name, fileUrl }, fileId: result.id, fileUrl })
    };

  } catch (err) {
    console.error('UPLOAD ERROR:', err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: err.message }) };
  }
};
