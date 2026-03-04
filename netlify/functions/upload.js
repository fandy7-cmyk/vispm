const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const { fileName, fileBase64, kodePKM, tahun, bulan, noIndikator } = JSON.parse(event.body || '{}');
    if (!fileName || !fileBase64) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'fileName dan fileBase64 diperlukan' }) };
    }

    // Pisahkan ekstensi dari nama file
    const dotIdx = fileName.lastIndexOf('.');
    const baseName = dotIdx > -1 ? fileName.substring(0, dotIdx) : fileName;
    const ext = dotIdx > -1 ? fileName.substring(dotIdx + 1).toLowerCase() : '';

    // Buat public_id yang include ekstensi sebagai bagian nama (bukan sebagai ekstensi Cloudinary)
    // Format: VISPM/PKM11/2026/05/4/PKM11_2026_5_ind4_timestamp_namafile
    const timestamp = Date.now();
    const safeBase = baseName.replace(/[^a-zA-Z0-9_\-\.]/g, '_').substring(0, 40);
    const folder = `VISPM/${kodePKM || 'PKM'}/${tahun || ''}/${bulan || ''}/${noIndikator || ''}`;
    // public_id menyimpan nama file dengan ekstensi agar bisa diketahui tipe filenya
    const publicId = `${kodePKM || 'PKM'}_${tahun || ''}_${bulan || ''}_ind${noIndikator || ''}_${timestamp}_${safeBase}.${ext}`;

    // Deteksi resource_type
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];
    const videoExts = ['mp4', 'mov', 'avi', 'mkv'];
    let resourceType = 'raw'; // default untuk doc, docx, xlsx, pdf, dll
    if (imageExts.includes(ext)) resourceType = 'image';
    else if (videoExts.includes(ext)) resourceType = 'video';

    const dataUri = `data:application/octet-stream;base64,${fileBase64}`;

    const result = await cloudinary.uploader.upload(dataUri, {
      folder,
      public_id: publicId,
      resource_type: resourceType,
      use_filename: false,
      unique_filename: false,
      overwrite: false,
    });

    // Untuk raw files, Cloudinary URL tidak include ekstensi — kita tambahkan sendiri
    let fileUrl = result.secure_url;
    if (resourceType === 'raw' && ext && !fileUrl.endsWith('.' + ext)) {
      // Cloudinary raw URL format: .../raw/upload/v.../folder/publicId
      // publicId sudah include .ext jadi URL seharusnya sudah benar
      // Tapi kalau belum, tambahkan
      if (!fileUrl.includes('.' + ext)) {
        fileUrl = fileUrl + '.' + ext;
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        fileUrl,
        publicId: result.public_id,
        originalName: fileName,
        resourceType,
      }),
    };
  } catch (e) {
    console.error('Upload error:', e);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: e.message }),
    };
  }
};
