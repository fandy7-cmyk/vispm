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

    const cloudName  = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey     = process.env.CLOUDINARY_API_KEY;
    const apiSecret  = process.env.CLOUDINARY_API_SECRET;

    const dotIdx  = fileName.lastIndexOf('.');
    const baseName = dotIdx > -1 ? fileName.substring(0, dotIdx) : fileName;
    const ext      = dotIdx > -1 ? fileName.substring(dotIdx + 1).toLowerCase() : '';

    const indFolder = noIndikator ? 'Indikator-' + noIndikator : 'Lainnya';
    const folder    = 'VISPM/' + (kodePKM||'PKM') + '/' + (tahun||'') + '/' + (bulan||'') + '/' + indFolder;
    const safeBase  = (baseName + '_' + Math.floor(Date.now() / 1000)).replace(/[^a-zA-Z0-9_\-]/g, '_').substring(0, 60);
    // publicId TANPA ekstensi (Cloudinary tidak support titik di publicId untuk raw)
    const publicId  = folder + '/' + safeBase;
    const timestamp = Math.floor(Date.now() / 1000);

    const imageExts = ['jpg','jpeg','png','gif','webp','bmp','svg'];
    const resourceType = imageExts.includes(ext) ? 'image' : 'raw';

    // Untuk raw: gunakan format parameter agar Cloudinary simpan dengan ekstensi yg benar
    // Signature: parameter urut abjad — access_mode, format (jika ada), public_id, timestamp
    let sigParts, extraParams;
    if (resourceType === 'raw') {
      sigParts = ext
        ? `access_mode=public&format=${ext}&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`
        : `access_mode=public&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
      extraParams = { access_mode: 'public', ...(ext ? { format: ext } : {}) };
    } else {
      sigParts = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
      extraParams = {};
    }
    const signature = crypto.createHash('sha1').update(sigParts).digest('hex');

    const params = new URLSearchParams({
      file: 'data:application/octet-stream;base64,' + fileBase64,
      public_id: publicId,
      timestamp: timestamp.toString(),
      api_key: apiKey,
      signature,
      ...extraParams,
    });

    const result = await cloudinaryRequest(`/v1_1/${cloudName}/${resourceType}/upload`, params.toString());
    if (result.status !== 200) {
      console.error('Cloudinary error:', result.body);
      throw new Error((result.body?.error?.message) || `Cloudinary error ${result.status}`);
    }

    // secure_url dari Cloudinary sudah include ekstensi karena pakai format parameter
    const fileUrl = result.body.secure_url;

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
