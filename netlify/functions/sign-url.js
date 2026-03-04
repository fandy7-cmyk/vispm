// Proxy download file dari Cloudinary dengan autentikasi
// Menggunakan Cloudinary API untuk generate temporary signed URL
const crypto = require('crypto');
const https = require('https');

function httpsGet(url, reqHeaders) {
  return new Promise((resolve, reject) => {
    const doReq = (u, redirectCount = 0) => {
      https.get(u, { headers: reqHeaders || {} }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectCount < 5) {
          return doReq(res.headers.location, redirectCount + 1);
        }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, buf: Buffer.concat(chunks), ct: res.headers['content-type'] || 'application/octet-stream' }));
        res.on('error', reject);
      }).on('error', reject);
    };
    doReq(url);
  });
}

exports.handler = async (event) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };

  const { url, name } = event.queryStringParameters || {};
  if (!url) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'URL diperlukan' }) };
  if (!url.includes('cloudinary.com')) return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ error: 'Forbidden' }) };

  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const basicAuth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

  try {
    const result = await httpsGet(url, { 'Authorization': `Basic ${basicAuth}` });
    if (result.status !== 200) throw new Error(`Status ${result.status}`);

    // Cek ukuran — Netlify limit 6MB untuk response body
    if (result.buf.length > 5 * 1024 * 1024) {
      // Untuk file besar, generate signed URL dan redirect
      const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
      const m = url.match(/\/(raw|image|video)\/upload\/(?:v\d+\/)?(.+)$/);
      if (m) {
        const resourceType = m[1];
        const publicId = m[2];
        const ts = Math.floor(Date.now() / 1000) + 3600;
        const sig = crypto.createHash('sha1').update(`public_id=${publicId}&timestamp=${ts}${apiSecret}`).digest('hex');
        const signedUrl = `https://res.cloudinary.com/${cloudName}/${resourceType}/upload/v1/${publicId}?api_key=${apiKey}&timestamp=${ts}&signature=${sig}`;
        return { statusCode: 302, headers: { ...corsHeaders, 'Location': signedUrl }, body: '' };
      }
    }

    const fileName = (name || 'file').trim();
    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
      body: result.buf.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (e) {
    console.error('sign-url error:', e.message);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: e.message }) };
  }
};
