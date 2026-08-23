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

  
  
  
  
  
  
  const rawName = (name || 'file').replace(/[^a-zA-Z0-9._\-\s]/g, '_');
  const lastDot = rawName.lastIndexOf('.');
  const nameBody = lastDot > -1 ? rawName.substring(0, lastDot).replace(/\./g, '_') : rawName;
  const nameExt  = lastDot > -1 ? rawName.substring(lastDot + 1) : '';
  const fileName = nameExt ? `${nameBody}.${nameExt}` : nameBody;
  const safeNameForUrl = fileName.replace(/\s/g, '_').replace(/\./g, '_');

  
  const downloadUrl = url.replace(
    /\/(image|raw|video)\/upload\//,
    '/$1/upload/fl_attachment:' + safeNameForUrl + '/'
  );

  
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