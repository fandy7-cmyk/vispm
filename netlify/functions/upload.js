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
    const { fileName, fileBase64, kodePKM, tahun, bulan, noIndikator } = JSON.parse(event.body || '{}');
    if (!fileName || !fileBase64) return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'fileName dan fileBase64 diperlukan' }) };

    // Validasi tipe file: hanya PDF dan gambar
    const dotIdx  = fileName.lastIndexOf('.');
    const baseName = dotIdx > -1 ? fileName.substring(0, dotIdx) : fileName;
    const ext      = dotIdx > -1 ? fileName.substring(dotIdx + 1).toLowerCase() : '';
    const allowedExts = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
    if (!allowedExts.includes(ext)) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: `Format file tidak didukung (.${ext}). Hanya PDF dan gambar (PNG, JPG, GIF, WebP) yang diperbolehkan.` }) };
    }

    const cloudName  = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey     = process.env.CLOUDINARY_API_KEY;
    const apiSecret  = process.env.CLOUDINARY_API_SECRET;

    const folder    = 'VISPM/' + (kodePKM||'PKM') + '/' + (tahun||'') + '/' + (bulan||'') + '/' + (noIndikator||'');
    const safeBase  = (baseName + '_' + Math.floor(Date.now() / 1000)).replace(/[^a-zA-Z0-9_\-]/g, '_').substring(0, 60);
    // publicId tanpa ekstensi untuk raw — Cloudinary raw tidak auto-append, kita tambah manual
    const publicId  = folder + '/' + safeBase;
    const timestamp = Math.floor(Date.now() / 1000);

    // Semua file pakai 'raw' + access_mode=public agar URL bisa diakses tanpa auth
    // image resource untuk gambar (agar preview langsung di browser)
    const imageExts = ['jpg','jpeg','png','gif','webp','bmp','svg'];
    const resourceType = imageExts.includes(ext) ? 'image' : 'raw';

    // Signature mencakup access_mode untuk raw files
    const sigParts = resourceType === 'raw'
      ? `access_mode=public&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`
      : `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
    const signature = crypto.createHash('sha1').update(sigParts).digest('hex');

    const params = new URLSearchParams({
      file: 'data:application/octet-stream;base64,' + fileBase64,
      public_id: publicId,
      timestamp: timestamp.toString(),
      api_key: apiKey,
      signature,
      ...(resourceType === 'raw' ? { access_mode: 'public' } : {}),
    });

    const result = await cloudinaryRequest(`/v1_1/${cloudName}/${resourceType}/upload`, params.toString());
    if (result.status !== 200) {
      console.error('Cloudinary error:', result.body);
      throw new Error((result.body?.error?.message) || `Cloudinary error ${result.status}`);
    }

    // Untuk raw: URL tidak punya ekstensi, append manual
    let fileUrl = result.body.secure_url;
    if (resourceType === 'raw' && ext && !fileUrl.split('/').pop().includes('.')) {
      fileUrl = fileUrl + '.' + ext;
    }

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
