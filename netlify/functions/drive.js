const { ok, err, cors } = require('./db');

// Baca credentials dari 2 env var kecil (bukan full JSON)
function getCredentials() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKeyRaw = process.env.GOOGLE_PRIVATE_KEY_BASE;
  if (!clientEmail || !privateKeyRaw) throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL atau GOOGLE_PRIVATE_KEY_BASE belum dikonfigurasi');
  // Decode base64 → PEM
  const privateKey = Buffer.from(privateKeyRaw, 'base64').toString('utf8');
  return { clientEmail, privateKey };
}

async function getAccessToken() {
  const { clientEmail, privateKey } = getCredentials();
  const crypto = require('crypto');
  const now = Math.floor(Date.now() / 1000);
  const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  })).toString('base64url');
  const signingInput = `${header}.${payload}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signingInput);
  const signature = sign.sign(privateKey, 'base64url');
  const jwt = `${signingInput}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Gagal mendapat access token: ' + JSON.stringify(data));
  return data.access_token;
}

async function findOrCreateFolder(token, name, parentId) {
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${encodeURIComponent(name)}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) return searchData.files[0].id;

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
  });
  const createData = await createRes.json();
  if (!createData.id) throw new Error('Gagal membuat folder: ' + JSON.stringify(createData));
  return createData.id;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();
  const params = event.queryStringParameters || {};
  const { kodePKM, tahun, bulan, namaBulan } = params;
  if (!kodePKM || !tahun || !bulan) return err('Parameter kodePKM, tahun, bulan diperlukan');
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) return err('Google Service Account belum dikonfigurasi');

  try {
    const ROOT_FOLDER_ID = '1WYRRcm5oxbCaPx8s9XNUkTUe1b85wuDG';
    const token = await getAccessToken();
    const pkmFolderId   = await findOrCreateFolder(token, kodePKM, ROOT_FOLDER_ID);
    const tahunFolderId = await findOrCreateFolder(token, tahun.toString(), pkmFolderId);
    const bulanFolderId = await findOrCreateFolder(token, `${String(bulan).padStart(2,'0')}-${namaBulan || bulan}`, tahunFolderId);
    return ok({ folderId: bulanFolderId, folderUrl: `https://drive.google.com/drive/folders/${bulanFolderId}` });
  } catch (e) {
    console.error('Drive error:', e);
    return err('Error Google Drive: ' + e.message, 500);
  }
};
