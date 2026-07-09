const https = require('https');

function httpsGet(url, reqHeaders) {
  return new Promise((resolve, reject) => {
    const doReq = (u, hops) => {
      if (hops > 5) return reject(new Error('Too many redirects'));
      let parsedUrl;
      try { parsedUrl = new URL(u); } catch(e) { return reject(new Error('Invalid URL: ' + u)); }

      const options = {
        hostname: parsedUrl.hostname,
        port: 443,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: reqHeaders || {},
      };

      const req = https.request(options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const loc = res.headers.location;
          const next = loc.startsWith('http') ? loc : `https://${parsedUrl.hostname}${loc}`;
          res.resume();
          return doReq(next, hops + 1);
        }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({
          status: res.statusCode,
          buf: Buffer.concat(chunks),
          ct: res.headers['content-type'] || 'application/octet-stream',
        }));
        res.on('error', reject);
      });
      req.on('error', reject);
      req.end();
    };
    doReq(url, 0);
  });
}

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  const { url, name, mode } = event.queryStringParameters || {};
  if (!url) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'URL diperlukan' }) };
  if (!url.includes('cloudinary.com')) return { statusCode: 403, headers: cors, body: JSON.stringify({ error: 'Forbidden' }) };

  const apiKey    = process.env.CLOUDINARY_API_KEY    || '';
  const apiSecret = process.env.CLOUDINARY_API_SECRET || '';
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || '';

  if (!apiKey || !apiSecret || !cloudName) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Cloudinary env vars tidak di-set' }) };
  }

  // FIX Bug #3: Generate signed URL sebagai fallback untuk file raw/private.
  // Cloudinary Basic Auth tidak valid untuk delivery URL, hanya untuk API management.
  // Solusi: signed delivery URL yang valid 1 jam.
  function buildSignedUrl(rawUrl) {
    try {
      const urlObj = new URL(rawUrl);
      const pathParts = urlObj.pathname.split('/');
      const uploadIdx = pathParts.indexOf('upload');
      if (uploadIdx === -1) return null;
      let pidParts = pathParts.slice(uploadIdx + 1);
      if (pidParts[0] && /^v\d+$/.test(pidParts[0])) pidParts = pidParts.slice(1);
      const pidWithExt = pidParts.join('/');
      const publicId = pidWithExt.replace(/\.[^.]+$/, '');
      const resourceType = urlObj.pathname.includes('/raw/') ? 'raw' : 'image';
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;
      // Signature: urut abjad, tanpa resource_type (sesuai Cloudinary spec)
      const crypto = require('crypto');
      const toSign = `public_id=${publicId}&timestamp=${expiresAt}${apiSecret}`;
      const signature = crypto.createHash('sha1').update(toSign).digest('hex');
      return `https://res.cloudinary.com/${cloudName}/${resourceType}/upload/s--${signature}--/v${expiresAt}/${publicId}`;
    } catch(e) { return null; }
  }
  const fileName  = (name || 'file').trim();

  try {
    let result = null;

    // Strategy 1: URL asli langsung (berhasil untuk file public/access_mode=public)
    result = await httpsGet(url, {});
    console.log('[sign-url] S1 direct:', result.status);

    // Strategy 2: Signed URL (untuk file raw yang tidak di-set access_mode=public)
    // Basic Auth tidak valid untuk delivery URL Cloudinary — gunakan signed URL saja.
    if (result.status !== 200) {
      const signedUrl = buildSignedUrl(url);
      if (signedUrl) {
        result = await httpsGet(signedUrl, {});
        console.log('[sign-url] S2 signed:', result.status, signedUrl);
      }
    }

    if (!result || result.status !== 200) {
      console.error('[sign-url] All strategies failed, last status:', result?.status, 'url:', url);
      return { statusCode: result?.status || 404, headers: cors, body: JSON.stringify({ error: `File tidak dapat diakses (${result?.status})` }) };
    }

    const ext = fileName.split('.').pop().toLowerCase();
    const mimeMap = {
      pdf:  'application/pdf',
      doc:  'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls:  'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ppt:  'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    };
    const ct = mimeMap[ext] || result.ct || 'application/octet-stream';

    if (mode === 'preview') {
      return {
        statusCode: 200,
        headers: {
          ...cors,
          'Content-Type': ct,
          'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
          'Cache-Control': 'public, max-age=300',
        },
        body: result.buf.toString('base64'),
        isBase64Encoded: true,
      };
    }

    // mode=download (default)
    return {
      statusCode: 200,
      headers: {
        ...cors,
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
      body: result.buf.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (e) {
    console.error('[sign-url] Error:', e.message, e.stack);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: e.message }) };
  }
};