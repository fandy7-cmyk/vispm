const crypto = require('crypto');

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY    = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const body = JSON.parse(event.body || '{}');
    const { fileName, fileBase64, kodePKM, tahun, bulan, noIndikator } = body;

    if (!fileName || !fileBase64) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'fileName dan fileBase64 diperlukan' }) };
    }

    // Folder struktur: VISPM/PKM11/2026/05/1
    const folder = `VISPM/${kodePKM || 'UNKNOWN'}/${tahun || ''}/${String(bulan||'').padStart(2,'0')}/${noIndikator || ''}`;
    const timestamp = Math.floor(Date.now() / 1000);
    const publicId = `${kodePKM}_${tahun}_${bulan}_ind${noIndikator}_${timestamp}`;

    // Signature
    const toSign = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}${API_SECRET}`;
    const signature = crypto.createHash('sha256').update(toSign).digest('hex');

    // Base64 data URI
    const base64Data = fileBase64.includes(',') ? fileBase64.split(',')[1] : fileBase64;
    const ext = fileName.split('.').pop().toLowerCase();
    const mimeMap = {
      pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    };
    const mimeType = mimeMap[ext] || 'application/octet-stream';
    const dataUri = `data:${mimeType};base64,${base64Data}`;

    const isImage = ['jpg','jpeg','png','gif','webp'].includes(ext);
    const resourceType = isImage ? 'image' : 'raw';

    const formData = new URLSearchParams();
    formData.append('file', dataUri);
    formData.append('api_key', API_KEY);
    formData.append('timestamp', String(timestamp));
    formData.append('signature', signature);
    formData.append('folder', folder);
    formData.append('public_id', publicId);

    const uploadRes = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`,
      { method: 'POST', body: formData }
    );

    const result = await uploadRes.json();
    if (result.error) {
      return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: result.error.message }) };
    }

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ success: true, fileUrl: result.secure_url, publicId: result.public_id, fileName })
    };

  } catch (err) {
    console.error('Upload error:', err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: err.message }) };
  }
};
