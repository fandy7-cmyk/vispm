const https = require('https');
const http = require('http');

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchBuffer(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ buffer: Buffer.concat(chunks), headers: res.headers, statusCode: res.statusCode }));
      res.on('error', reject);
    }).on('error', reject);
  });
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const { url, name } = event.queryStringParameters || {};
  if (!url) return { statusCode: 400, headers, body: JSON.stringify({ error: 'URL diperlukan' }) };

  if (!url.includes('cloudinary.com')) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'URL tidak diizinkan' }) };
  }

  try {
    const { buffer, statusCode } = await fetchBuffer(url);
    if (statusCode !== 200) throw new Error('File tidak ditemukan');

    const fileName = name || 'file';

    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(fileName),
        'Content-Length': buffer.length.toString(),
      },
      body: buffer.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (e) {
    console.error('Download error:', e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
