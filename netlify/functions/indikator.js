const { getPool, ok, err, cors } = require('./db');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();

  const pool = getPool();
  const method = event.httpMethod;

  try {
    if (method === 'GET') {
      const result = await pool.query(
        'SELECT no_indikator, nama_indikator, bobot, aktif FROM master_indikator ORDER BY no_indikator'
      );
      return ok(result.rows.map(r => ({
        no: r.no_indikator,
        nama: r.nama_indikator,
        bobot: r.bobot,
        aktif: r.aktif
      })));
    }

    const body = JSON.parse(event.body || '{}');

    if (method === 'POST') {
      const { no, nama, bobot, aktif } = body;
      if (!no || !nama) return err('Nomor dan nama indikator diperlukan');

      const exists = await pool.query('SELECT no_indikator FROM master_indikator WHERE no_indikator = $1', [no]);
      if (exists.rows.length > 0) return err('Nomor indikator sudah ada');

      await pool.query(
        'INSERT INTO master_indikator (no_indikator, nama_indikator, bobot, aktif) VALUES ($1, $2, $3, $4)',
        [parseInt(no), nama, parseInt(bobot) || 0, aktif !== false]
      );
      return ok({ message: 'Indikator berhasil ditambahkan' });
    }

    if (method === 'PUT') {
      const { no, nama, bobot, aktif } = body;
      if (!no) return err('Nomor indikator diperlukan');
      await pool.query(
        'UPDATE master_indikator SET nama_indikator=$1, bobot=$2, aktif=$3 WHERE no_indikator=$4',
        [nama, parseInt(bobot) || 0, aktif !== false, parseInt(no)]
      );
      return ok({ message: 'Indikator berhasil diupdate' });
    }

    if (method === 'DELETE') {
      const { no } = body;
      if (!no) return err('Nomor indikator diperlukan');
      await pool.query('DELETE FROM master_indikator WHERE no_indikator=$1', [parseInt(no)]);
      return ok({ message: 'Indikator berhasil dihapus' });
    }

    return err('Method tidak diizinkan', 405);
  } catch (e) {
    console.error('Indikator error:', e);
    return err('Error: ' + e.message, 500);
  }
};
