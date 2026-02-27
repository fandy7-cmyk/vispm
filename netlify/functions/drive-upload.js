const { ok, err, cors } = require('./db');

async function getAccessToken() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT belum dikonfigurasi di environment variables');
  
  let credentials;
  try { credentials = JSON.parse(raw); } 
  catch(e) { throw new Error('Format GOOGLE_SERVICE_ACCOUNT tidak valid (harus JSON)'); }

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
  if (!data.access_token) throw new Error('Token error: ' + JSON.stringify(data));
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
  if (!createData.id) throw new Error('Gagal buat folder: ' + JSON.stringify(createData));
  return createData.id;
}

async function uploadFile(token, fileName, mimeType, base64Data, folderId) {
  const metadata = { name: fileName, parents: [folderId] };
  const boundary = '-------314159265358979323846';
  const fileContent = Buffer.from(base64Data, 'base64');

  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`),
    Buffer.from(JSON.stringify(metadata)),
    Buffer.from(`\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    fileContent,
    Buffer.from(`\r\n--${boundary}--`)
  ]);

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary="${boundary}"`,
      'Content-Length': body.length
    },
    body
  });
  const data = await res.json();
  if (!data.id) throw new Error('Upload gagal: ' + JSON.stringify(data));
  
  // Make file publicly readable
  await fetch(`https://www.googleapis.com/drive/v3/files/${data.id}/permissions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' })
  });

  return { id: data.id, name: data.name, url: `https://drive.google.com/file/d/${data.id}/view` };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();
  if (event.httpMethod !== 'POST') return err('Method tidak diizinkan', 405);

  try {
    const body = JSON.parse(event.body || '{}');
    const { kodePKM, tahun, bulan, namaBulan, noIndikator, fileName, mimeType, fileData } = body;

    if (!kodePKM || !tahun || !bulan || !fileName || !fileData) {
      return err('Data tidak lengkap');
    }

    const token = await getAccessToken();
    const ROOT_FOLDER_ID = '1WYRRcm5oxbCaPx8s9XNUkTUe1b85wuDG';

    // Buat struktur: ROOT / PKM / Tahun / Bulan / Indikator-N
    const pkmFolderId = await findOrCreateFolder(token, kodePKM, ROOT_FOLDER_ID);
    const tahunFolderId = await findOrCreateFolder(token, tahun.toString(), pkmFolderId);
    const bulanFolderId = await findOrCreateFolder(token, `${String(bulan).padStart(2,'0')}-${namaBulan||bulan}`, tahunFolderId);
    const indFolderId = noIndikator 
      ? await findOrCreateFolder(token, `Indikator-${noIndikator}`, bulanFolderId)
      : bulanFolderId;

    const result = await uploadFile(token, fileName, mimeType || 'application/octet-stream', fileData, indFolderId);

    return ok({ 
      fileId: result.id, 
      fileName: result.name, 
      fileUrl: result.url,
      folderUrl: `https://drive.google.com/drive/folders/${indFolderId}`
    });
  } catch (e) {
    console.error('Drive upload error:', e);
    return err('Upload error: ' + e.message, 500);
  }
};
