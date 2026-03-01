const { GoogleAuth } = require('google-auth-library');
const { google } = require('googleapis');
const { Readable } = require('stream');

async function getAuthClient() {
  const auth = new GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return auth.getClient();
}

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    const body = JSON.parse(event.body || '{}');
    const { fileName, fileBase64, folderId, folderPath } = body;

    if (!fileName || !fileBase64 || !folderId) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Missing required fields' }) };
    }

    const authClient = await getAuthClient();
    const drive = google.drive({ version: 'v3', auth: authClient });

    // Resolve subfolder
    let targetFolderId = folderId;
    if (folderPath && Array.isArray(folderPath) && folderPath.length > 0) {
      for (const folderName of folderPath) {
        targetFolderId = await findOrCreateFolder(drive, folderName, targetFolderId);
      }
    }

    // Upload file
    const base64Data = fileBase64.includes(',') ? fileBase64.split(',')[1] : fileBase64;
    const fileBuffer = Buffer.from(base64Data, 'base64');
    const stream = Readable.from(fileBuffer);

    // Detect mime type dari extension
    const ext = fileName.split('.').pop().toLowerCase();
    const mimeMap = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
    const mimeType = mimeMap[ext] || 'application/octet-stream';

    const uploaded = await drive.files.create({
      requestBody: { name: fileName, parents: [targetFolderId] },
      media: { mimeType, body: stream },
      fields: 'id,name,webViewLink'
    });

    const fileId = uploaded.data.id;
    const fileUrl = `https://drive.google.com/file/d/${fileId}/view`;

    // Set permission — anyone with link can view (agar bisa preview di sistem)
    await drive.permissions.create({
      fileId,
      requestBody: { role: 'reader', type: 'anyone' }
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data: { fileId, name: uploaded.data.name, fileUrl },
        fileId,
        fileUrl
      })
    };

  } catch (err) {
    console.error('UPLOAD ERROR:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: err.message }) };
  }
};

async function findOrCreateFolder(drive, folderName, parentId) {
  const res = await drive.files.list({
    q: `name='${folderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
    fields: 'files(id,name)',
    spaces: 'drive'
  });
  if (res.data.files && res.data.files.length > 0) return res.data.files[0].id;

  const folder = await drive.files.create({
    requestBody: { name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id'
  });
  return folder.data.id;
}
