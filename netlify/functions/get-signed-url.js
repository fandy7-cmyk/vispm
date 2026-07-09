const crypto = require('crypto');

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  const { url } = event.queryStringParameters || {};
  if (!url) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'URL diperlukan' }) };
  if (!url.includes('cloudinary.com')) return { statusCode: 403, headers: cors, body: JSON.stringify({ error: 'Forbidden' }) };

  const apiKey    = process.env.CLOUDINARY_API_KEY    || '';
  const apiSecret = process.env.CLOUDINARY_API_SECRET || '';
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || '';

  if (!apiKey || !apiSecret || !cloudName) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Cloudinary env vars tidak di-set' }) };
  }

  try {
    // Parse URL untuk ambil public_id dan resource_type
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/');
    const uploadIdx = pathParts.indexOf('upload');
    if (uploadIdx === -1) throw new Error('Bukan Cloudinary upload URL');

    let pidParts = pathParts.slice(uploadIdx + 1);
    if (pidParts[0] && /^v\d+$/.test(pidParts[0])) pidParts = pidParts.slice(1);
    const pidWithExt = pidParts.join('/');
    const publicId = pidWithExt.replace(/\.[^.]+$/, '');
    const resourceType = urlObj.pathname.includes('/raw/') ? 'raw' : 'image';

    // Generate signed URL valid 1 jam
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    // FIX Bug #1: Cloudinary delivery signature TIDAK menyertakan resource_type.
    // String yang di-sign harus urut abjad: public_id, timestamp (tanpa resource_type).
    const toSign = `public_id=${publicId}&timestamp=${expiresAt}${apiSecret}`;
    const signature = crypto.createHash('sha1').update(toSign).digest('hex');

    // Build signed delivery URL
    // Format: /upload/s--{signature}--/v{timestamp}/{public_id}
    const signedUrl = `https://res.cloudinary.com/${cloudName}/${resourceType}/upload/s--${signature}--/v${expiresAt}/${publicId}`;

    console.log('[get-signed-url] publicId:', publicId, 'signedUrl:', signedUrl);

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ signedUrl, expiresAt }),
    };
  } catch (e) {
    console.error('[get-signed-url] Error:', e.message);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: e.message }) };
  }
};