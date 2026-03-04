exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const { url, name } = event.queryStringParameters || {};
  if (!url) return { statusCode: 400, headers, body: JSON.stringify({ error: 'URL diperlukan' }) };
  if (!url.includes('cloudinary.com')) return { statusCode: 403, headers, body: JSON.stringify({ error: 'URL tidak diizinkan' }) };

  // Cloudinary mendukung fl_attachment untuk force download dengan nama file kustom.
  // Untuk raw files: insert fl_attachment:nama_file setelah /upload/
  // Contoh: .../raw/upload/v123/... -> .../raw/upload/fl_attachment:nama/v123/...
  const fileName = (name || 'file').replace(/[^a-zA-Z0-9._\-\s]/g, '_');
  const safeNameForUrl = fileName.replace(/\s/g, '_');

  // Insert fl_attachment transformation ke URL Cloudinary
  const downloadUrl = url.replace(
    /\/(image|raw|video)\/upload\//,
    '/$1/upload/fl_attachment:' + safeNameForUrl + '/'
  );

  // Redirect ke Cloudinary langsung — tidak perlu proxy buffer
  return {
    statusCode: 302,
    headers: {
      ...headers,
      'Location': downloadUrl,
      'Cache-Control': 'no-cache',
    },
    body: '',
  };
};
