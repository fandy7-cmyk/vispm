const https = require('https');
const crypto = require('crypto');

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

function cloudinaryDelete(publicId, resourceType, apiKey, apiSecret, cloudName) {
  return new Promise((resolve, reject) => {
    const timestamp = Math.floor(Date.now() / 1000);
    const sigStr = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
    const signature = crypto.createHash('sha1').update(sigStr).digest('hex');

    const body = new URLSearchParams({
      public_id: publicId,
      timestamp: timestamp.toString(),
      api_key: apiKey,
      signature,
    }).toString();

    const buf = Buffer.from(body);
    const path = `/v1_1/${cloudName}/${resourceType}/destroy`;

    const req = https.request({
      hostname: 'api.cloudinary.com',
      path, method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': buf.length,
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
    req.write(buf);
    req.end();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { ...headers, 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ success: false, error: 'Method not allowed' }) };
  }

  try {
    const { publicId } = JSON.parse(event.body || '{}');
    if (!publicId) return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'publicId diperlukan' }) };

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey    = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    // Coba hapus sebagai image dulu, kalau tidak ada coba raw
    const imageExts = ['jpg','jpeg','png','gif','webp','bmp','svg'];
    const ext = publicId.split('.').pop()?.toLowerCase() || '';
    const resourceType = imageExts.includes(ext) ? 'image' : 'raw';

    const result = await cloudinaryDelete(publicId, resourceType, apiKey, apiSecret, cloudName);

    if (result.body?.result === 'ok') {
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // Kalau tidak ditemukan di resourceType pertama, coba yang lain
    if (result.body?.result === 'not found') {
      const fallback = resourceType === 'image' ? 'raw' : 'image';
      const result2 = await cloudinaryDelete(publicId, fallback, apiKey, apiSecret, cloudName);
      if (result2.body?.result === 'ok' || result2.body?.result === 'not found') {
        return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
      }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) }; // tetap sukses agar tidak block UI
  } catch (e) {
    console.error('Delete file error:', e);
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: e.message }) };
  }
};
