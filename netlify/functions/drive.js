const { getPool, ok, err, cors } = require('./db');
const { google } = require('googleapis');
const formidable = require('formidable-serverless');
const fs = require('fs');

// Inisialisasi Google Drive API dengan error handling lebih baik
async function getDriveClient() {
  try {
    if (!process.env.GOOGLE_SERVICE_ACCOUNT) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT tidak ditemukan di environment');
    }

    let credentials;
    try {
      credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    } catch (e) {
      throw new Error('Format GOOGLE_SERVICE_ACCOUNT tidak valid: ' + e.message);
    }

    if (!credentials.client_email || !credentials.private_key) {
      throw new Error('Service account credentials tidak lengkap');
    }

    const auth = new google.auth.JWT(
      credentials.client_email,
      null,
      credentials.private_key,
      ['https://www.googleapis.com/auth/drive']
    );
    
    return google.drive({ version: 'v3', auth });
  } catch (error) {
    console.error('Drive client error:', error);
    throw error;
  }
}

// Fungsi membuat folder dengan error handling
async function findOrCreateFolder(drive, name, parentId) {
  try {
    console.log(`Mencari/membuat folder: ${name} di ${parentId}`);
    
    // Cari folder existing
    const response = await drive.files.list({
      q: `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
      spaces: 'drive'
    });

    if (response.data.files && response.data.files.length > 0) {
      console.log(`Folder ditemukan: ${response.data.files[0].id}`);
      return response.data.files[0].id;
    }

    // Buat folder baru
    const fileMetadata = {
      name: name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId]
    };

    const folder = await drive.files.create({
      resource: fileMetadata,
      fields: 'id'
    });

    console.log(`Folder baru dibuat: ${folder.data.id}`);
    return folder.data.id;
  } catch (error) {
    console.error('Error folder operation:', error);
    throw error;
  }
}

// Handler GET - Buka folder (sederhana dulu)
exports.handler = async (event) => {
  console.log('Drive function called with method:', event.httpMethod);
  
  // CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      },
      body: ''
    };
  }

  // GET - Buka folder
  if (event.httpMethod === 'GET') {
    try {
      const params = event.queryStringParameters || {};
      const { kodePKM, tahun, bulan, namaBulan } = params;

      console.log('GET params:', { kodePKM, tahun, bulan, namaBulan });

      if (!kodePKM || !tahun || !bulan) {
        return {
          statusCode: 400,
          headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            success: false, 
            message: 'Parameter kodePKM, tahun, bulan diperlukan' 
          })
        };
      }

      // PAKAI ROOT FOLDER ID YANG SUDAH ADA
      const ROOT_FOLDER_ID = '1WYRRcm5oxbCaPx8s9XNUkTUe1b85wuDG';
      
      // Buat URL folder langsung tanpa API call dulu
      const folderUrl = `https://drive.google.com/drive/folders/${ROOT_FOLDER_ID}`;

      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          success: true, 
          data: {
            folderId: ROOT_FOLDER_ID,
            folderUrl: folderUrl,
            message: 'Menggunakan root folder sementara'
          }
        })
      };

    } catch (error) {
      console.error('Drive GET error:', error);
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          success: false, 
          message: 'Error: ' + error.message 
        })
      };
    }
  }

  // POST - Upload file (sederhana dulu)
  if (event.httpMethod === 'POST') {
    try {
      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          success: true, 
          data: {
            message: 'Upload function will be implemented soon'
          }
        })
      };
    } catch (error) {
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          success: false, 
          message: 'Error: ' + error.message 
        })
      };
    }
  }

  return {
    statusCode: 405,
    headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: false, message: 'Method not allowed' })
  };
};
