const { getPool, ok, err, cors } = require('./db');

exports.handler = async (event) => {
  // Handle CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS'
      },
      body: ''
    };
  }

  const pool = getPool();
  const params = event.queryStringParameters || {};

  try {
    // GET - ambil daftar bukti
    if (event.httpMethod === 'GET') {
      const { idUsulan, noIndikator } = params;
      
      if (!idUsulan) {
        return err('ID Usulan diperlukan');
      }

      // Cek apakah tabel ada
      const tableCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'usulan_bukti'
        );
      `);

      if (!tableCheck.rows[0].exists) {
        return ok([]); // Tabel belum ada, return empty array
      }
      
      let query = 'SELECT * FROM usulan_bukti WHERE id_usulan = $1';
      const queryParams = [idUsulan];
      
      if (noIndikator) {
        query += ' AND no_indikator = $2 ORDER BY uploaded_at DESC';
        queryParams.push(parseInt(noIndikator));
      } else {
        query += ' ORDER BY uploaded_at DESC';
      }

      const result = await pool.query(query, queryParams);
      
      return ok(result.rows.map(r => ({
        id: r.id,
        idUsulan: r.id_usulan,
        noIndikator: r.no_indikator,
        fileName: r.file_name,
        fileUrl: r.file_url,
        fileSize: r.file_size,
        uploadedAt: r.uploaded_at,
        uploadedBy: r.uploaded_by
      })));
    }

    // DELETE - hapus bukti
    if (event.httpMethod === 'DELETE') {
      const { id } = JSON.parse(event.body || '{}');
      
      if (!id) return err('ID bukti diperlukan');

      // Ambil info file sebelum dihapus dari DB
      const fileRes = await pool.query('SELECT file_url, file_name FROM usulan_bukti WHERE id = $1', [id]);
      
      // Hapus dari database
      await pool.query('DELETE FROM usulan_bukti WHERE id = $1', [id]);

      // FIX Bug #6: Hapus file dari Cloudinary agar storage tidak bocor.
      // Panggil delete-file function via internal HTTP jika file_url tersedia.
      if (fileRes.rows.length > 0 && fileRes.rows[0].file_url) {
        const fileUrl = fileRes.rows[0].file_url;
        // Fire-and-forget: jangan block response meski delete Cloudinary gagal
        const https = require('https');
        const delUrl = new URL('https://api.cloudinary.com');
        // Gunakan delete-file logic langsung (inline) agar tidak perlu HTTP internal call
        const crypto = require('crypto');
        const cloudName  = process.env.CLOUDINARY_CLOUD_NAME  || '';
        const apiKey     = process.env.CLOUDINARY_API_KEY     || '';
        const apiSecret  = process.env.CLOUDINARY_API_SECRET  || '';
        if (cloudName && apiKey && apiSecret) {
          try {
            const urlObj = new URL(fileUrl);
            const pathParts = urlObj.pathname.split('/');
            const uploadIdx = pathParts.indexOf('upload');
            if (uploadIdx !== -1) {
              let pidParts = pathParts.slice(uploadIdx + 1);
              if (pidParts[0] && /^v\d+$/.test(pidParts[0])) pidParts = pidParts.slice(1);
              const pidWithExt = pidParts.join('/');
              const publicId   = pidWithExt.replace(/\.[^.]+$/, '');
              const rawExts    = ['pdf','doc','docx','xls','xlsx','ppt','pptx','zip','rar','txt','csv'];
              const ext        = (pidWithExt.split('.').pop() || '').toLowerCase();
              const resourceType = rawExts.includes(ext) ? 'raw' : 'image';
              const ts         = Math.floor(Date.now() / 1000);
              const toSign     = `public_id=${publicId}&timestamp=${ts}${apiSecret}`;
              const sig        = crypto.createHash('sha1').update(toSign).digest('hex');
              const formBody   = `public_id=${encodeURIComponent(publicId)}&api_key=${apiKey}&timestamp=${ts}&signature=${sig}`;
              const body2      = Buffer.from(formBody);
              const req        = https.request({
                hostname: 'api.cloudinary.com',
                path: `/v1_1/${cloudName}/${resourceType}/destroy`,
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': body2.length },
              });
              req.on('error', e => console.error('[bukti] Cloudinary delete error:', e.message));
              req.write(body2); req.end();
            }
          } catch(e) { console.error('[bukti] Failed to delete from Cloudinary:', e.message); }
        }
      }

      return ok({ message: 'File bukti berhasil dihapus' });
    }

    return err('Method tidak diizinkan', 405);
  } catch (e) {
    console.error('Bukti error:', e);
    return err('Error: ' + e.message, 500);
  }
};