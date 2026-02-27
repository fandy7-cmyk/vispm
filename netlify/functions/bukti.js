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

      // Ambil info file untuk hapus dari Drive (opsional)
      const file = await pool.query('SELECT file_url FROM usulan_bukti WHERE id = $1', [id]);
      
      // Hapus dari database
      await pool.query('DELETE FROM usulan_bukti WHERE id = $1', [id]);

      return ok({ message: 'File bukti berhasil dihapus' });
    }

    return err('Method tidak diizinkan', 405);
  } catch (e) {
    console.error('Bukti error:', e);
    return err('Error: ' + e.message, 500);
  }
};
