// netlify/functions/drive.js
const { getPool, ok, err, cors } = require('./db');
const { google } = require('googleapis');
const formidable = require('formidable-serverless');
const fs = require('fs');

// Inisialisasi Google Drive API
async function getDriveClient() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  
  const auth = new google.auth.JWT(
    credentials.client_email,
    null,
    credentials.private_key,
    ['https://www.googleapis.com/auth/drive']
  );
  
  return google.drive({ version: 'v3', auth });
}

// Fungsi untuk membuat folder jika belum ada
async function findOrCreateFolder(drive, name, parentId) {
  try {
    // Cari folder existing
    const response = await drive.files.list({
      q: `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
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
    console.error('Error finding/creating folder:', error);
    throw error;
  }
}

// Handler untuk GET - buka folder (existing)
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();

  const params = event.queryStringParameters || {};
  const { kodePKM, tahun, bulan, namaBulan } = params;

  if (!kodePKM || !tahun || !bulan) {
    return err('Parameter kodePKM, tahun, bulan diperlukan');
  }

  if (!process.env.GOOGLE_SERVICE_ACCOUNT) {
    return err('Google Service Account belum dikonfigurasi');
  }

  try {
    const ROOT_FOLDER_ID = '1WYRRcm5oxbCaPx8s9XNUkTUe1b85wuDG'; // Ganti dengan folder ID Anda
    const drive = await getDriveClient();

    // Buat struktur folder: ROOT / PKM / Tahun / Bulan
    const pkmFolderId = await findOrCreateFolder(drive, kodePKM, ROOT_FOLDER_ID);
    const tahunFolderId = await findOrCreateFolder(drive, tahun.toString(), pkmFolderId);
    const bulanFolderId = await findOrCreateFolder(drive, `${String(bulan).padStart(2,'0')}-${namaBulan || bulan}`, tahunFolderId);

    const folderUrl = `https://drive.google.com/drive/folders/${bulanFolderId}`;

    return ok({ 
      folderId: bulanFolderId, 
      folderUrl,
      pkmFolderId,
      tahunFolderId 
    });
  } catch (e) {
    console.error('Drive error:', e);
    return err('Error Google Drive: ' + e.message, 500);
  }
};

// Handler untuk POST - upload file
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();

  if (event.httpMethod === 'GET') {
    // Handle GET request (existing code)
    const params = event.queryStringParameters || {};
    const { kodePKM, tahun, bulan, namaBulan } = params;
    
    // ... existing GET logic ...
  }

  if (event.httpMethod === 'POST') {
    return await handleFileUpload(event);
  }

  return err('Method tidak diizinkan', 405);
};

// Fungsi untuk handle file upload
async function handleFileUpload(event) {
  try {
    // Parse multipart form data
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
      return err('Tidak ada file yang diupload');
    }

    // Validasi tipe file (misalnya hanya PDF, JPG, PNG)
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedTypes.includes(uploadedFile.type)) {
      return err('Tipe file tidak diizinkan. Hanya PDF, JPG, PNG, DOC, DOCX');
    }

    // Validasi ukuran file (max 10MB)
    if (uploadedFile.size > 10 * 1024 * 1024) {
      return err('Ukuran file maksimal 10MB');
    }

    const drive = await getDriveClient();
    const ROOT_FOLDER_ID = '1WYRRcm5oxbCaPx8s9XNUkTUe1b85wuDG';

    // Buat struktur folder
    const pkmFolderId = await findOrCreateFolder(drive, kodePKM, ROOT_FOLDER_ID);
    const tahunFolderId = await findOrCreateFolder(drive, tahun.toString(), pkmFolderId);
    const bulanFolderId = await findOrCreateFolder(drive, `${String(bulan).padStart(2,'0')}-${namaBulan}`, tahunFolderId);
    
    // Buat folder per indikator
    const indikatorFolderId = await findOrCreateFolder(drive, `Indikator-${noIndikator}`, bulanFolderId);

    // Upload file
    const fileMetadata = {
      name: `${Date.now()}-${uploadedFile.name}`,
      parents: [indikatorFolderId]
    };

    const media = {
      mimeType: uploadedFile.type,
      body: fs.createReadStream(uploadedFile.path)
    };

    const response = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id, name, webViewLink'
    });

    // Set file sebagai bisa dibaca publik (opsional)
    await drive.permissions.create({
      fileId: response.data.id,
      requestBody: {
        role: 'reader',
        type: 'anyone'
      }
    });

    // Simpan ke database
    const pool = getPool();
    await pool.query(
      `INSERT INTO usulan_bukti (id_usulan, no_indikator, file_name, file_url, file_size, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [idUsulan, noIndikator, response.data.name, response.data.webViewLink, uploadedFile.size, email]
    );

    // Update link_file di usulan_indikator (untuk backward compatibility)
    await pool.query(
      `UPDATE usulan_indikator SET link_file = $1 
       WHERE id_usulan = $2 AND no_indikator = $3`,
      [response.data.webViewLink, idUsulan, noIndikator]
    );

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
