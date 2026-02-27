const { getPool, ok, err, cors } = require('./db');
const { google } = require('googleapis');
const formidable = require('formidable-serverless');
const fs = require('fs');
const path = require('path');

// Inisialisasi Google Drive API
async function getDriveClient() {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    
    const auth = new google.auth.JWT(
      credentials.client_email,
      null,
      credentials.private_key,
      ['https://www.googleapis.com/auth/drive']
    );
    
    return google.drive({ version: 'v3', auth });
  } catch (error) {
    console.error('Error initializing Drive client:', error);
    throw new Error('Gagal inisialisasi Google Drive: ' + error.message);
  }
}

// Fungsi untuk membuat folder jika belum ada
async function findOrCreateFolder(drive, name, parentId) {
  try {
    // Escape single quotes in name
    const escapedName = name.replace(/'/g, "\\'");
    
    // Cari folder existing
    const response = await drive.files.list({
      q: `name='${escapedName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)'
    });

    if (response.data.files && response.data.files.length > 0) {
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
    console.error('Error finding/creating folder:', error);
    throw error;
  }
}

// Handler GET - Buka folder
async function handleGetRequest(event) {
  const params = event.queryStringParameters || {};
  const { kodePKM, tahun, bulan, namaBulan } = params;

  if (!kodePKM || !tahun || !bulan) {
    return err('Parameter kodePKM, tahun, bulan diperlukan');
  }

  if (!process.env.GOOGLE_SERVICE_ACCOUNT) {
    return err('Google Service Account belum dikonfigurasi');
  }

  try {
    // GANTI INI DENGAN ID FOLDER GOOGLE DRIVE ANDA!!!
    const ROOT_FOLDER_ID = '1WYRRcm5oxbCaPx8s9XNUkTUe1b85wuDG';
    
    const drive = await getDriveClient();

    // Buat struktur folder: ROOT / PKM / Tahun / Bulan
    const pkmFolderId = await findOrCreateFolder(drive, kodePKM, ROOT_FOLDER_ID);
    const tahunFolderId = await findOrCreateFolder(drive, tahun.toString(), pkmFolderId);
    const bulanFolderId = await findOrCreateFolder(drive, `${String(bulan).padStart(2,'0')}-${namaBulan || 'Bulan'}`, tahunFolderId);

    const folderUrl = `https://drive.google.com/drive/folders/${bulanFolderId}`;

    return ok({ 
      folderId: bulanFolderId, 
      folderUrl,
      pkmFolderId,
      tahunFolderId 
    });
  } catch (e) {
    console.error('Drive GET error:', e);
    return err('Error Google Drive: ' + e.message, 500);
  }
}

// Handler POST - Upload file
async function handlePostRequest(event) {
  try {
    // Parse multipart form data
    const form = new formidable.IncomingForm();
    
    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(event, (err, fields, files) => {
        if (err) reject(err);
        resolve({ fields, files });
      });
    });

    const idUsulan = fields.idUsulan;
    const noIndikator = fields.noIndikator;
    const kodePKM = fields.kodePKM;
    const tahun = fields.tahun;
    const bulan = fields.bulan;
    const namaBulan = fields.namaBulan;
    const email = fields.email;
    const uploadedFile = files.file;

    if (!uploadedFile) {
      return err('Tidak ada file yang diupload');
    }

    // Validasi tipe file
    const allowedTypes = [
      'application/pdf', 
      'image/jpeg', 
      'image/png', 
      'application/msword', 
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    if (!allowedTypes.includes(uploadedFile.type)) {
      return err('Tipe file tidak diizinkan. Hanya PDF, JPG, PNG, DOC, DOCX');
    }

    // Validasi ukuran file (max 10MB)
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    if (uploadedFile.size > MAX_SIZE) {
      return err('Ukuran file maksimal 10MB');
    }

    // GANTI INI DENGAN ID FOLDER GOOGLE DRIVE ANDA!!!
    const ROOT_FOLDER_ID = '1WYRRcm5oxbCaPx8s9XNUkTUe1b85wuDG';
    
    const drive = await getDriveClient();

    // Buat struktur folder
    const pkmFolderId = await findOrCreateFolder(drive, kodePKM, ROOT_FOLDER_ID);
    const tahunFolderId = await findOrCreateFolder(drive, tahun.toString(), pkmFolderId);
    const bulanFolderId = await findOrCreateFolder(drive, `${String(bulan).padStart(2,'0')}-${namaBulan}`, tahunFolderId);
    
    // Buat folder per indikator
    const indikatorFolderId = await findOrCreateFolder(drive, `Indikator-${noIndikator}`, bulanFolderId);

    // Baca file
    const fileContent = fs.readFileSync(uploadedFile.path);

    // Upload file
    const fileMetadata = {
      name: `${Date.now()}-${uploadedFile.name}`,
      parents: [indikatorFolderId]
    };

    const media = {
      mimeType: uploadedFile.type,
      body: fileContent
    };

    const response = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id, name, webViewLink'
    });

    // Set file sebagai bisa dibaca publik
    try {
      await drive.permissions.create({
        fileId: response.data.id,
        requestBody: {
          role: 'reader',
          type: 'anyone'
        }
      });
    } catch (permError) {
      console.warn('Warning: Gagal set permission:', permError.message);
    }

    // Simpan ke database
    const pool = getPool();
    
    // Cek apakah tabel usulan_bukti sudah ada
    try {
      await pool.query(
        `INSERT INTO usulan_bukti (id_usulan, no_indikator, file_name, file_url, file_size, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [idUsulan, parseInt(noIndikator), response.data.name, response.data.webViewLink, uploadedFile.size, email]
      );
    } catch (dbError) {
      console.error('Error inserting to database:', dbError);
      // Jika tabel belum ada, buat dulu
      if (dbError.message.includes('relation "usulan_bukti" does not exist')) {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS usulan_bukti (
            id SERIAL PRIMARY KEY,
            id_usulan TEXT NOT NULL,
            no_indikator INTEGER NOT NULL,
            file_name TEXT NOT NULL,
            file_url TEXT NOT NULL,
            file_size INTEGER,
            uploaded_at TIMESTAMP DEFAULT NOW(),
            uploaded_by TEXT
          );
          CREATE INDEX IF NOT EXISTS idx_usulan_bukti_usulan ON usulan_bukti(id_usulan, no_indikator);
        `);
        
        // Coba insert lagi
        await pool.query(
          `INSERT INTO usulan_bukti (id_usulan, no_indikator, file_name, file_url, file_size, uploaded_by)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [idUsulan, parseInt(noIndikator), response.data.name, response.data.webViewLink, uploadedFile.size, email]
        );
      } else {
        throw dbError;
      }
    }

    // Update link_file di usulan_indikator (untuk backward compatibility)
    await pool.query(
      `UPDATE usulan_indikator SET link_file = $1 
       WHERE id_usulan = $2 AND no_indikator = $3`,
      [response.data.webViewLink, idUsulan, parseInt(noIndikator)]
    );

    // Hapus file temporary
    try {
      fs.unlinkSync(uploadedFile.path);
    } catch (e) {
      console.warn('Warning: Gagal hapus temp file:', e.message);
    }

    return ok({
      message: 'File berhasil diupload',
      fileId: response.data.id,
      fileUrl: response.data.webViewLink,
      fileName: response.data.name
    });

  } catch (error) {
    console.error('Upload error:', error);
    return err('Gagal upload file: ' + error.message, 500);
  }
}

// Handler utama
exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      },
      body: ''
    };
  }

  // Route berdasarkan method
  if (event.httpMethod === 'GET') {
    return await handleGetRequest(event);
  }
  
  if (event.httpMethod === 'POST') {
    return await handlePostRequest(event);
  }

  // Method tidak diizinkan
  return {
    statusCode: 405,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ 
      success: false, 
      message: 'Method tidak diizinkan' 
    })
  };
};
