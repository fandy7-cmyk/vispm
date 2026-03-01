exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    const body = JSON.parse(event.body || '{}');
    const { accessToken, fileName, fileBase64, folderId, folderPath } = body;

    if (!accessToken || !fileName || !fileBase64 || !folderId) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Missing required fields' }) };
    }

    // ==============================
    // RESOLVE TARGET FOLDER
    // Kalau ada folderPath = ['PKM11','2026','05-Mei','Indikator','1']
    // Buat subfolder secara rekursif dari folderId (root)
    // ==============================
    let targetFolderId = folderId;
    if (folderPath && Array.isArray(folderPath) && folderPath.length > 0) {
      for (const folderName of folderPath) {
        targetFolderId = await findOrCreateFolder(accessToken, folderName, targetFolderId);
      }
    }

    // ==============================
    // UPLOAD FILE
    // ==============================
    const base64Data = fileBase64.includes(',') ? fileBase64.split(',')[1] : fileBase64;
    const fileBytes = Buffer.from(base64Data, 'base64');

    const boundary = 'spm_boundary_xyz';
    const metadata = { name: fileName, parents: [targetFolderId] };
    const multipartBody = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`),
      fileBytes,
      Buffer.from(`\r\n--${boundary}--`)
    ]);

    const uploadRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
          'Content-Length': multipartBody.length
        },
        body: multipartBody
      }
    );

    const result = await uploadRes.json();
    console.log('Drive upload response:', result);

    if (!uploadRes.ok) {
      return { statusCode: uploadRes.status, headers, body: JSON.stringify({ success: false, error: result.error?.message || 'Upload gagal' }) };
    }

    const fileUrl = `https://drive.google.com/file/d/${result.id}/view`;
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data: { fileId: result.id, name: result.name, fileUrl },
        fileId: result.id,
        fileUrl
      })
    };

  } catch (err) {
    console.error('UPLOAD ERROR:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: err.message }) };
  }
};

// Helper: cari folder by name di parent, kalau tidak ada buat baru
async function findOrCreateFolder(accessToken, folderName, parentId) {
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${folderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) return searchData.files[0].id;

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
  });
  const folder = await createRes.json();
  if (!folder.id) throw new Error(`Gagal membuat folder: ${folderName} (${JSON.stringify(folder)})`);
  return folder.id;
}
