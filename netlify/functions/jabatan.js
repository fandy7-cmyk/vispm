const { getPool, ok, err, cors } = require('./db');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();
  const pool = getPool();
  const method = event.httpMethod;
  const params = event.queryStringParameters || {};

  try {
    if (method === 'GET') {
      const r = await pool.query('SELECT id, nama_jabatan, aktif FROM master_jabatan ORDER BY nama_jabatan');
      return ok(r.rows.map(x => ({ id: x.id, nama: x.nama_jabatan, aktif: x.aktif })));
    }

    if (method === 'DELETE') {
      const id = params.id || JSON.parse(event.body || '{}').id;
      if (!id) return err('ID jabatan diperlukan');
      await pool.query('DELETE FROM master_jabatan WHERE id=$1', [id]);
      return ok({ message: 'Jabatan berhasil dihapus' });
    }

    const body = JSON.parse(event.body || '{}');

    if (method === 'POST') {
      const { id, nama, aktif } = body;
      if (!nama || !nama.trim()) return err('Nama jabatan diperlukan');
      if (id) {
        // Update
        await pool.query('UPDATE master_jabatan SET nama_jabatan=$1, aktif=$2 WHERE id=$3', [nama.trim(), aktif !== false, id]);
        return ok({ id, message: 'Jabatan berhasil diperbarui' });
      } else {
        // Create - cek duplikat
        const exists = await pool.query(
          'SELECT id, nama_jabatan FROM master_jabatan WHERE LOWER(TRIM(nama_jabatan))=LOWER(TRIM($1))',
          [nama.trim()]
        );
        if (exists.rows.length > 0) {
          return err(`Jabatan "${exists.rows[0].nama_jabatan}" sudah ada di daftar. Gunakan nama yang berbeda.`, 400);
        }
        const r = await pool.query(
          'INSERT INTO master_jabatan (nama_jabatan, aktif) VALUES ($1, true) RETURNING id',
          [nama.trim()]
        );
        return ok({ id: r.rows[0].id, message: 'Jabatan berhasil ditambahkan' });
      }
    }

    if (method === 'PUT') {
      const { id, nama, aktif } = body;
      if (!id || !nama) return err('ID dan nama diperlukan');
      await pool.query('UPDATE master_jabatan SET nama_jabatan=$1, aktif=$2 WHERE id=$3', [nama.trim(), aktif !== false, id]);
      return ok({ message: 'Jabatan diupdate' });
    }

    return err('Method tidak diizinkan', 405);
  } catch(e) {
    // Unique constraint violation — nama jabatan sudah ada
    if (e.code === '23505' && e.constraint === 'master_jabatan_nama_jabatan_key') {
      return err('Nama jabatan sudah ada. Gunakan nama yang berbeda.', 400);
    }
    console.error('Jabatan error:', e);
    return err('Error: ' + e.message, 500);
  }
};
