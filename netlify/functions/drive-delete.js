exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    const body = JSON.parse(event.body || '{}');
    const { accessToken, fileId } = body;

    if (!accessToken || !fileId) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'accessToken dan fileId diperlukan' }) };
    }

    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    // DELETE sukses mengembalikan 204 No Content
    if (response.status === 204 || response.ok) {
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, message: 'File berhasil dihapus dari Drive' }) };
    }

    const err = await response.json().catch(() => ({}));
    return { statusCode: response.status, headers, body: JSON.stringify({ success: false, error: err.error?.message || 'Gagal hapus dari Drive' }) };

  } catch (err) {
    console.error('DRIVE DELETE ERROR:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: err.message }) };
  }
};
