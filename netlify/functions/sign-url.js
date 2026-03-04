const https = require('https');
const crypto = require('crypto');

function httpsGet(url, reqHeaders) {
  return new Promise((resolve, reject) => {
    const doReq = (u, hops) => {
      if (hops > 5) return reject(new Error('Too many redirects'));
      let parsedUrl;
      try { parsedUrl = new URL(u); } catch(e) { return reject(new Error('Invalid URL: ' + u)); }
      const req = https.request({
        hostname: parsedUrl.hostname, port: 443,
        path: parsedUrl.pathname + parsedUrl.search, method: 'GET',
        headers: reqHeaders || {},
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const loc = res.headers.location;
          const next = loc.startsWith('http') ? loc : `https://${parsedUrl.hostname}${loc}`;
          res.resume(); return doReq(next, hops + 1);
        }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, buf: Buffer.concat(chunks), ct: res.headers['content-type'] || 'application/octet-stream' }));
        res.on('error', reject);
      });
      req.on('error', reject); req.end();
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

  if (!apiKey || !apiSecret) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Cloudinary env vars tidak di-set' }) };
  }

  const fileName = (name || 'file').trim();
  const ext = fileName.split('.').pop().toLowerCase();
  const basicAuth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  const resourceTypeMatch = url.match(/\/(image|raw|video)\/upload\//);
  const resourceType = resourceTypeMatch ? resourceTypeMatch[1] : 'raw';

  try {
    let result = null;

    // Strategi 1: Direct URL tanpa auth (access_mode=public)
    result = await httpsGet(url, {});

    if (result.status === 401 || result.status === 404) {
      // Strategi 2: Basic Auth
      result = await httpsGet(url, { 'Authorization': `Basic ${basicAuth}` });
    }

    if (result.status === 401 || result.status === 404) {
      // Strategi 3: Admin API - fetch via resource URL dengan auth
      // Extract public_id (tanpa ekstensi) dari URL
      const pidMatch = url.match(/\/(?:image|raw|video)\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-z0-9]{2,5})?(?:\?|$)/i);
      if (!pidMatch) throw new Error('Tidak bisa ekstrak public_id dari URL');
      const publicId = pidMatch[1];

      // Cloudinary Admin API: GET resource info untuk dapat secure_url signed
      const adminInfoUrl = `https://api.cloudinary.com/v1_1/${cloudName}/resources/${resourceType}/upload/${encodeURIComponent(publicId)}`;
      const infoResult = await httpsGet(adminInfoUrl, { 'Authorization': `Basic ${basicAuth}` });

      if (infoResult.status === 200) {
        const info = JSON.parse(infoResult.buf.toString());
        if (info.secure_url) {
          // Coba akses via secure_url dari Admin API
          result = await httpsGet(info.secure_url, {});
        }
      }

      if (!result || result.status !== 200) {
        // Strategi 4: Generate signed delivery URL
        const timestamp = Math.floor(Date.now() / 1000) + 3600;
        const pidMatch2 = url.match(/\/(?:image|raw|video)\/upload\/(?:v\d+\/)?(.+)/);
        const fullPid = pidMatch2 ? pidMatch2[1] : '';
        const toSign = `${timestamp}/${fullPid}`;
        const sig = crypto.createHmac('sha256', apiSecret).update(toSign).digest('hex').substring(0, 8);
        const signedUrl = url.replace(/\/upload\//, `/upload/s--${sig}--/e_${timestamp}/`);
        result = await httpsGet(signedUrl, {});
      }
    }

    if (!result || result.status !== 200) {
      console.error('[sign-url] All strategies failed, status:', result?.status);
      return {
        statusCode: result?.status || 500,
        headers: cors,
        body: JSON.stringify({ error: `File tidak dapat diakses (${result?.status}). Pastikan Cloudinary access mode = public.` })
      };
    }

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
