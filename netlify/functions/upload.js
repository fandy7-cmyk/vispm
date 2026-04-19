const https = require('https');
const crypto = require('crypto');

function cloudinaryRequest(path, data) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(data);
    const req = https.request({
      hostname: 'api.cloudinary.com',
      path, method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': body.length,
      },
    }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch(e) { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const { fileName, fileBase64, kodePKM, namaPKM, tahun, bulan, namaBulan, noIndikator, namaIndikator } = JSON.parse(event.body || '{}');
    if (!fileName || !fileBase64) return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'fileName dan fileBase64 diperlukan' }) };

    const cloudName  = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey     = process.env.CLOUDINARY_API_KEY;
    const apiSecret  = process.env.CLOUDINARY_API_SECRET;

    const dotIdx  = fileName.lastIndexOf('.');
    const baseName = dotIdx > -1 ? fileName.substring(0, dotIdx) : fileName;
    const ext      = dotIdx > -1 ? fileName.substring(dotIdx + 1).toLowerCase() : '';

    // Helper: sanitasi nama untuk Cloudinary folder (hapus karakter tidak aman)
    const sanitize = (str) => (str || '').replace(/[^a-zA-Z0-9\s\-_.]/g, '').replace(/\s+/g, '_').substring(0, 50).trim();

    // Folder: VISPM / KodePKM_NamaPKM / Tahun / BulanFolder / IndFolder
    const pkmFolder   = kodePKM
      ? (namaPKM ? `${kodePKM}_${sanitize(namaPKM)}` : kodePKM)
      : 'PKM';
    const bulanFolder = namaBulan
      ? `${String(bulan).padStart(2,'0')}_${sanitize(namaBulan)}`
      : (bulan ? String(bulan).padStart(2,'0') : 'Bulan');

    const hasIndikator = noIndikator !== null && noIndikator !== undefined && noIndikator !== '';
    const indFolder = hasIndikator
      ? (namaIndikator
          ? `Ind${String(noIndikator).padStart(2,'0')}_${sanitize(namaIndikator)}`
          : `Indikator_${String(noIndikator).padStart(2,'0')}`)
      : 'Lainnya';

    const folderParts = ['VISPM', pkmFolder, tahun || 'Unknown', bulanFolder, indFolder].filter(p => p && String(p).trim() !== '');
    const folder = folderParts.join('/');

    const ts        = Math.floor(Date.now() / 1000);
    const imageExts  = ['jpg','jpeg','png','gif','webp','bmp','svg'];
    const resourceType = imageExts.includes(ext) ? 'image' : 'raw';

    const safeBase  = (baseName + '_' + ts).replace(/[^a-zA-Z0-9_\-]/g, '_').substring(0, 60);
    // Untuk raw file: sertakan ekstensi di publicId agar URL Cloudinary punya ekstensi
    // Office Online & Google Docs Viewer butuh URL berakhiran .docx/.xlsx/.pptx dll
    const publicId  = folder + '/' + safeBase + (resourceType === 'raw' && ext ? ('.' + ext) : '');
    const timestamp = ts;

    console.log('[upload] folder:', folder);
    console.log('[upload] publicId:', publicId);
    console.log('[upload] noIndikator:', noIndikator, '| namaIndikator:', namaIndikator);

    // ─── SIGNATURE ────────────────────────────────────────────────────────────
    // Cloudinary menghitung signature dari nilai RAW (tidak di-encode).
    // Parameter harus urut abjad dan di-concat tanpa separator sebelum apiSecret.
    let sigParts;
    if (resourceType === 'raw') {
      sigParts = `access_mode=public&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
    } else {
      sigParts = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
    }
    const signature = crypto.createHash('sha1').update(sigParts).digest('hex');

    // ─── ENCODING public_id untuk form body ───────────────────────────────────
    // Format: application/x-www-form-urlencoded → SEMUA karakter khusus harus
    // di-encode termasuk slash (/). encodeURIComponent sudah benar di sini karena
    // kita mengirim sebagai nilai form field, BUKAN sebagai URL path.
    // BUG LAMA: encode per-segmen (biarkan slash literal) → Cloudinary menerima
    // public_id tanpa folder karena slash tidak di-encode dalam form body,
    // sehingga server menginterpretasikan slash sebagai pemisah query string.
    const fileDataUri = 'data:application/octet-stream;base64,' + fileBase64;
    const params = [
      `api_key=${encodeURIComponent(apiKey)}`,
      `file=${encodeURIComponent(fileDataUri)}`,
      `public_id=${encodeURIComponent(publicId)}`,   // ← FIX: encode penuh termasuk slash
      `signature=${encodeURIComponent(signature)}`,
      `timestamp=${encodeURIComponent(timestamp)}`,
    ];
    if (resourceType === 'raw') params.push(`access_mode=public`);
    const paramStr = params.join('&');

    console.log('[upload] publicId encoded:', encodeURIComponent(publicId));

    const result = await cloudinaryRequest(`/v1_1/${cloudName}/${resourceType}/upload`, paramStr);
    if (result.status !== 200) {
      console.error('Cloudinary error:', result.body);
      throw new Error((result.body?.error?.message) || `Cloudinary error ${result.status}`);
    }

    const fileUrl = result.body.secure_url;
    console.log('[upload] success, url:', fileUrl, '| public_id:', result.body.public_id);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, fileUrl, publicId: result.body.public_id, originalName: fileName }),
    };
  } catch (e) {
    console.error('Upload error:', e);
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: e.message }) };
  }
};