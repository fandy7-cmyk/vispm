const { getPool, ok, err, cors } = require('./db');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();
  const pool = getPool();
  const method = event.httpMethod;
  try {
    if (method === 'GET') {
      const r = await pool.query('SELECT id, nama_jabatan, aktif FROM master_jabatan ORDER BY nama_jabatan');
      return ok(r.rows.map(x => ({ id: x.id, nama: x.nama_jabatan, aktif: x.aktif })));
    }
    const body = JSON.parse(event.body || '{}');
    if (method === 'POST') {
      const { nama } = body;
      if (!nama) return err('Nama jabatan diperlukan');
      const exists = await pool.query('SELECT id FROM master_jabatan WHERE LOWER(nama_jabatan)=LOWER($1)', [nama]);
      if (exists.rows.length > 0) return err('Jabatan sudah ada');
      const r = await pool.query('INSERT INTO master_jabatan (nama_jabatan) VALUES ($1) RETURNING id', [nama]);
      return ok({ id: r.rows[0].id, message: 'Jabatan ditambahkan' });
    }
    if (method === 'PUT') {
      const { id, nama, aktif } = body;
      await pool.query('UPDATE master_jabatan SET nama_jabatan=$1, aktif=$2 WHERE id=$3', [nama, aktif !== false, id]);
      return ok({ message: 'Jabatan diupdate' });
    }
    if (method === 'DELETE') {
      const { id } = body;
      await pool.query('DELETE FROM master_jabatan WHERE id=$1', [id]);
      return ok({ message: 'Jabatan dihapus' });
    }
    return err('Method tidak diizinkan', 405);
  } catch(e) {
    return err('Error: ' + e.message, 500);
  }
};
