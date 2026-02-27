const { ok, err, cors } = require('./db');

async function getAccessToken() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT belum dikonfigurasi di Netlify Environment Variables');
  let creds;
  try { creds = JSON.parse(raw); } 
  catch(e) { throw new Error('Format GOOGLE_SERVICE_ACCOUNT tidak valid (harus JSON): ' + e.message); }
  if (!creds.private_key || !creds.client_email) throw new Error('credentials tidak lengkap (butuh private_key dan client_email)');

  const crypto = require('crypto');
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: creds.client_email,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600, iat: now
  })).toString('base64url');

  const input = `${header}.${payload}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(input);
  const jwt = `${input}.${sign.sign(creds.private_key, 'base64url')}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Gagal dapat token: ' + JSON.stringify(data));
  return data.access_token;
}

async function findOrCreateFolder(token, name, parentId) {
  const q = `name='${name.replace(/'/g,"\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  if (data.files?.length > 0) return data.files[0].id;
  
  const cr = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
  });
  const cd = await cr.json();
  if (!cd.id) throw new Error('Gagal buat folder "' + name + '": ' + JSON.stringify(cd));
  return cd.id;
}

async function uploadFile(token, fileName, mimeType, base64Data, folderId) {
  const fileBuf = Buffer.from(base64Data, 'base64');
  const meta = JSON.stringify({ name: fileName, parents: [folderId] });
  const metaBuf = Buffer.from(meta, 'utf8');
  const mime = mimeType || 'application/octet-stream';

  // Multipart upload — lebih reliable dari resumable untuk file <5MB
  const boundary = '--spm--boundary--';
  const body = Buffer.concat([
    Buffer.from(`\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`),
    metaBuf,
    Buffer.from(`\r\n--${boundary}\r\nContent-Type: ${mime}\r\nContent-Transfer-Encoding: base64\r\n\r\n`),
    Buffer.from(base64Data),  // kirim base64 langsung, pakai Transfer-Encoding: base64
    Buffer.from(`\r\n--${boundary}--`)
  ]);

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary="${boundary}"`
      },
      body
    }
  );

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch(e) { throw new Error('Response bukan JSON: ' + text.substring(0, 200)); }
  if (!data.id) throw new Error('Upload gagal: ' + JSON.stringify(data));

  // Set permission: siapa saja bisa lihat
  await fetch(`https://www.googleapis.com/drive/v3/files/${data.id}/permissions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' })
  });

  return { id: data.id, url: `https://drive.google.com/file/d/${data.id}/view` };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();
  if (event.httpMethod !== 'POST') return err('Method tidak diizinkan', 405);

  try {
    const body = JSON.parse(event.body || '{}');
    const { kodePKM, tahun, bulan, namaBulan, noIndikator, fileName, mimeType, fileData } = body;
    if (!kodePKM || !tahun || !bulan || !fileName || !fileData)
      return err('Data tidak lengkap (butuh kodePKM, tahun, bulan, fileName, fileData)');

    // Cek ukuran — Netlify limit ~6MB decoded, base64 ~4.5MB raw file
    if (fileData.length > 6 * 1024 * 1024)
      return err('File terlalu besar. Maksimal 4.5MB per file.');

    const token = await getAccessToken();
    const ROOT = '1WYRRcm5oxbCaPx8s9XNUkTUe1b85wuDG';

    const pkmId   = await findOrCreateFolder(token, String(kodePKM), ROOT);
    const tahunId = await findOrCreateFolder(token, String(tahun), pkmId);
    const bulanId = await findOrCreateFolder(token, `${String(bulan).padStart(2,'0')}-${namaBulan||bulan}`, tahunId);
    const destId  = noIndikator ? await findOrCreateFolder(token, `Indikator-${noIndikator}`, bulanId) : bulanId;

    const result = await uploadFile(token, fileName, mimeType, fileData, destId);

    return ok({
      fileId: result.id,
      fileName,
      fileUrl: result.url,
      folderUrl: `https://drive.google.com/drive/folders/${destId}`
    });
  } catch (e) {
    console.error('[drive-upload]', e.message);
    return err(e.message, 500);
  }
};
