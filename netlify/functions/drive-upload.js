const { ok, err, cors } = require('./db');

async function getAccessToken() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('ENV_MISSING: GOOGLE_SERVICE_ACCOUNT belum dikonfigurasi di Netlify');
  let credentials;
  try { credentials = JSON.parse(raw); } 
  catch(e) { throw new Error('ENV_INVALID: Format JSON tidak valid - ' + e.message); }
  if (!credentials.private_key) throw new Error('ENV_NO_KEY: private_key tidak ditemukan');
  if (!credentials.client_email) throw new Error('ENV_NO_EMAIL: client_email tidak ditemukan');

  const crypto = require('crypto');
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  })).toString('base64url');

  const signingInput = `${header}.${payload}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signingInput);
  const signature = sign.sign(credentials.private_key, 'base64url');
  const jwt = `${signingInput}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('TOKEN_FAIL: ' + JSON.stringify(data));
  return data.access_token;
}

async function findOrCreateFolder(token, name, parentId) {
  const q = `name='${name.replace(/'/g,"\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  if (data.files && data.files.length > 0) return data.files[0].id;
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
  });
  const createData = await createRes.json();
  if (!createData.id) throw new Error('FOLDER_FAIL: ' + JSON.stringify(createData));
  return createData.id;
}

async function uploadFile(token, fileName, mimeType, base64Data, folderId) {
  // Step 1: Initiate resumable upload
  const metadata = { name: fileName, parents: [folderId] };
  const initRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mimeType || 'application/octet-stream',
      },
      body: JSON.stringify(metadata)
    }
  );
  
  if (!initRes.ok) {
    const t = await initRes.text();
    throw new Error('INIT_FAIL: ' + t);
  }
  
  const uploadUrl = initRes.headers.get('location');
  if (!uploadUrl) throw new Error('INIT_NO_URL: No upload URL returned');

  // Step 2: Upload file content
  const fileContent = Buffer.from(base64Data, 'base64');
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': mimeType || 'application/octet-stream',
      'Content-Length': String(fileContent.length)
    },
    body: fileContent
  });

  const uploadData = await uploadRes.json();
  if (!uploadData.id) throw new Error('UPLOAD_FAIL: ' + JSON.stringify(uploadData));

  // Step 3: Set public read permission
  await fetch(`https://www.googleapis.com/drive/v3/files/${uploadData.id}/permissions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' })
  });

  return { id: uploadData.id, name: uploadData.name, url: `https://drive.google.com/file/d/${uploadData.id}/view` };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();
  if (event.httpMethod !== 'POST') return err('Method tidak diizinkan', 405);

  try {
    const body = JSON.parse(event.body || '{}');
    const { kodePKM, tahun, bulan, namaBulan, noIndikator, fileName, mimeType, fileData } = body;
    if (!kodePKM || !tahun || !bulan || !fileName || !fileData) return err('Data tidak lengkap');

    const token = await getAccessToken();
    const ROOT = '1WYRRcm5oxbCaPx8s9XNUkTUe1b85wuDG';

    const pkmId = await findOrCreateFolder(token, kodePKM, ROOT);
    const tahunId = await findOrCreateFolder(token, String(tahun), pkmId);
    const bulanId = await findOrCreateFolder(token, `${String(bulan).padStart(2,'0')}-${namaBulan||bulan}`, tahunId);
    const targetId = noIndikator ? await findOrCreateFolder(token, `Indikator-${noIndikator}`, bulanId) : bulanId;

    const result = await uploadFile(token, fileName, mimeType || 'application/octet-stream', fileData, targetId);

    return ok({ fileId: result.id, fileName: result.name, fileUrl: result.url, folderUrl: `https://drive.google.com/drive/folders/${targetId}` });
  } catch (e) {
    console.error('Drive upload error:', e.message);
    return err(e.message, 500);
  }
};
