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

    /**
     * Cloudinary delivery signed URL:
     *
     * String yang di-sign = semua komponen URL setelah /upload/ (termasuk version),
     * diikuti langsung oleh apiSecret (tanpa separator).
     *
     * Format: SHA1("{version}/{publicId}{apiSecret}") → base64url → 8 karakter pertama
     *
     * Contoh URL: /raw/upload/v1234567/VISPM/PKM/file.pdf
     * String to sign: "v1234567/VISPM/PKM/file.pdf{apiSecret}"
     *
     * Ref: https://cloudinary.com/documentation/delivery_url_signatures
     */
    const afterUpload = pathParts.slice(uploadIdx + 1).join('/');
    const _rawExts = ['pdf','doc','docx','xls','xlsx','ppt','pptx','zip','rar','txt','csv'];
    const _urlExt = urlObj.pathname.split('.').pop().toLowerCase();
    const isRaw = urlObj.pathname.includes('/raw/') || _rawExts.includes(_urlExt);
    const resourceType = isRaw ? 'raw' : 'image';

    const toSign = afterUpload + apiSecret;
    const sig8 = crypto.createHash('sha1')
      .update(toSign)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')
      .substring(0, 8);

    const signedUrl = `https://res.cloudinary.com/${cloudName}/${resourceType}/upload/s--${sig8}--/${afterUpload}`;
    console.log('[get-signed-url] afterUpload:', afterUpload, '| signedUrl:', signedUrl);

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ signedUrl }),
    };
  } catch (e) {
    console.error('[get-signed-url] Error:', e.message);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: e.message }) };
  }
};