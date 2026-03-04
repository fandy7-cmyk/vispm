const https = require('https');
const crypto = require('crypto');

function cloudinaryRequest(path, data) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(data);
    const options = {
      hostname: 'api.cloudinary.com',
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': body.length,
      },
    };
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch(e) { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
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
    if (!fileName || !fileBase64) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'fileName dan fileBase64 diperlukan' }) };
    }

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    const dotIdx = fileName.lastIndexOf('.');
    const baseName = dotIdx > -1 ? fileName.substring(0, dotIdx) : fileName;
    const ext = dotIdx > -1 ? fileName.substring(dotIdx + 1).toLowerCase() : '';

    // PDF di-upload sebagai 'image' agar bisa diakses publik (raw = authenticated by default)
    const imageExts = ['jpg','jpeg','png','gif','webp','bmp','svg','pdf'];
    const resourceType = imageExts.includes(ext) ? 'image' : 'raw';

    const timestamp = Math.floor(Date.now() / 1000);
    const folder = 'VISPM/' + (kodePKM||'PKM') + '/' + (tahun||'') + '/' + (bulan||'') + '/' + (noIndikator||'');
    const safeBase = (baseName + '_' + timestamp).replace(/[^a-zA-Z0-9_\-]/g, '_').substring(0, 60);
    // Sertakan ekstensi di public_id agar URL Cloudinary mengandung ekstensi file
    const publicId = folder + '/' + safeBase + (ext ? '.' + ext : '');

    const signStr = 'public_id=' + publicId + '&timestamp=' + timestamp + apiSecret;
    const signature = crypto.createHash('sha1').update(signStr).digest('hex');

    const dataUri = 'data:application/octet-stream;base64,' + fileBase64;
    const params = new URLSearchParams({
      file: dataUri,
      public_id: publicId,
      timestamp: timestamp.toString(),
      api_key: apiKey,
      signature,
    });

    const result = await cloudinaryRequest('/v1_1/' + cloudName + '/' + resourceType + '/upload', params.toString());

    if (result.status !== 200) {
      console.error('Cloudinary error:', result.body);
      throw new Error((result.body && result.body.error && result.body.error.message) || ('Cloudinary error ' + result.status));
    }

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
