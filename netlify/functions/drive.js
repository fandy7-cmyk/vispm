const { getPool, ok, err } = require('./db');
const { google } = require('googleapis');
const formidable = require('formidable-serverless');
const fs = require('fs');

// Inisialisasi Google Drive API
async function getDriveClient() {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    
    const auth = new google.auth.JWT(
      credentials.client_email,
      null,
      credentials.private_key,
      ['https://drive.google.com/drive/folders/1WYRRcm5oxbCaPx8s9XNUkTUe1b85wuDG']
    );
    
    return google.drive({ version: 'v3', auth });
  } catch (error) {
    console.error('Drive client error:', error);
    throw error;
  }
}

// Fungsi membuat folder
async function findOrCreateFolder(drive, name, parentId) {
  try {
    // Cari folder yang sudah ada
    const response = await drive.files.list({
      q: `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)'
    });

    if (response.data.files.length > 0) {
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

    return folder.data.id;
  } catch (error) {
    console.error('Folder error:', error);
    throw error;
  }
}

// Handler utama
exports.handler = async (event) => {
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

  const pool = getPool();

  // GET - Buka folder
  if (event.httpMethod === 'GET') {
    try {
      const params = event.queryStringParameters || {};
      const { kodePKM, tahun, bulan, namaBulan } = params;

      if (!kodePKM || !tahun || !bulan) {
        return err('Parameter kodePKM, tahun, bulan diperlukan', 400);
      }

      const ROOT_FOLDER_ID = '1WYRRcm5oxbCaPx8s9XNUkTUe1b85wuDG';
      const drive = await getDriveClient();

      // Buat struktur folder
      const pkmFolder = await findOrCreateFolder(drive, kodePKM, ROOT_FOLDER_ID);
      const tahunFolder = await findOrCreateFolder(drive, tahun.toString(), pkmFolder);
      const bulanFolder = await findOrCreateFolder(drive, `${String(bulan).padStart(2,'0')}-${namaBulan || 'Bulan'}`, tahunFolder);

      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          data: {
            folderId: bulanFolder,
            folderUrl: `https://drive.google.com/drive/folders/${bulanFolder}`
          }
        })
      };

    } catch (error) {
      console.error('GET error:', error);
      return err(error.message, 500);
    }
  }

  // POST - Upload file
  if (event.httpMethod === 'POST') {
    try {
      const form = new formidable.IncomingForm();
      
      const { fields, files } = await new Promise((resolve, reject) => {
        form.parse(event, (err, fields, files) => {
          if (err) reject(err);
          resolve({ fields, files });
        });
      });

      const { idUsulan, noIndikator, kodePKM, tahun, bulan, namaBulan, email } = fields;
      const uploadedFile = files.file;

      if (!uploadedFile) {
        return err('Tidak ada file', 400);
      }

      // Validasi file
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      if (!allowedTypes.includes(uploadedFile.type)) {
        return err('Tipe file tidak diizinkan', 400);
      }

      if (uploadedFile.size > 10 * 1024 * 1024) {
        return err('File maksimal 10MB', 400);
      }

      const ROOT_FOLDER_ID = '1WYRRcm5oxbCaPx8s9XNUkTUe1b85wuDG';
      const drive = await getDriveClient();

      // Buat folder
      const pkmFolder = await findOrCreateFolder(drive, kodePKM, ROOT_FOLDER_ID);
      const tahunFolder = await findOrCreateFolder(drive, tahun.toString(), pkmFolder);
      const bulanFolder = await findOrCreateFolder(drive, `${String(bulan).padStart(2,'0')}-${namaBulan}`, tahunFolder);
      const indFolder = await findOrCreateFolder(drive, `Indikator-${noIndikator}`, bulanFolder);

      // Upload file
      const fileContent = fs.readFileSync(uploadedFile.path);
      
      const response = await drive.files.create({
        resource: {
          name: `${Date.now()}-${uploadedFile.name}`,
          parents: [indFolder]
        },
        media: {
          mimeType: uploadedFile.type,
          body: fileContent
        },
        fields: 'id,name,webViewLink'
      });

      // Set public access
      await drive.permissions.create({
        fileId: response.data.id,
        requestBody: { role: 'reader', type: 'anyone' }
      });

      // Simpan ke database
      await pool.query(
        `INSERT INTO usulan_bukti (id_usulan, no_indikator, file_name, file_url, file_size, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [idUsulan, parseInt(noIndikator), response.data.name, response.data.webViewLink, uploadedFile.size, email]
      );

      // Update link_file di usulan_indikator
      await pool.query(
        `UPDATE usulan_indikator SET link_file = $1 
         WHERE id_usulan = $2 AND no_indikator = $3`,
        [response.data.webViewLink, idUsulan, parseInt(noIndikator)]
      );

      // Hapus file sementara
      fs.unlinkSync(uploadedFile.path);

      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          data: {
            message: 'File berhasil diupload',
            fileUrl: response.data.webViewLink,
            fileName: response.data.name
          }
        })
      };

    } catch (error) {
      console.error('POST error:', error);
      return err(error.message, 500);
    }
  }

  return err('Method not allowed', 405);
};
