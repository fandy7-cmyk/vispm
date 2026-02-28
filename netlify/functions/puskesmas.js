const { getPool, ok, err, cors } = require('./db');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();
  const pool = getPool();
  const method = event.httpMethod;
  const params = event.queryStringParameters || {};

  try {
    if (method === 'GET') {
      const onlyAktif = params.aktif === 'true';
      let query = `SELECT kode_pkm, nama_puskesmas, indeks_beban_kerja,
                          COALESCE(indeks_kesulitan_wilayah, 0) as indeks_kesulitan_wilayah, aktif
                   FROM master_puskesmas`;
      if (onlyAktif) query += ' WHERE aktif = true';
      query += ' ORDER BY kode_pkm';
      const result = await pool.query(query);
      return ok(result.rows.map(r => ({
        kode: r.kode_pkm,
        nama: r.nama_puskesmas,
        indeks: parseFloat(r.indeks_beban_kerja) || 0,
        indeksKesulitan: parseFloat(r.indeks_kesulitan_wilayah) || 0,
        aktif: r.aktif
      })));
    }

    const body = JSON.parse(event.body || '{}');

    if (method === 'POST') {
      const { kode, nama, indeks, indeksKesulitan, aktif } = body;
      if (!kode || !nama) return err('Kode dan nama diperlukan');
      const exists = await pool.query('SELECT kode_pkm FROM master_puskesmas WHERE kode_pkm=$1', [kode]);
      if (exists.rows.length > 0) return err('Kode puskesmas sudah ada');
      await pool.query(
        `INSERT INTO master_puskesmas (kode_pkm, nama_puskesmas, indeks_beban_kerja, indeks_kesulitan_wilayah, aktif)
         VALUES ($1, $2, $3, $4, $5)`,
        [kode, nama, parseFloat(indeks)||0, parseFloat(indeksKesulitan)||0, aktif!==false]
      );
      return ok({ message: 'Puskesmas berhasil ditambahkan' });
    }

    if (method === 'PUT') {
      const { kode, nama, indeks, indeksKesulitan, aktif } = body;
      if (!kode) return err('Kode diperlukan');
      await pool.query(
        `UPDATE master_puskesmas SET nama_puskesmas=$1, indeks_beban_kerja=$2,
         indeks_kesulitan_wilayah=$3, aktif=$4 WHERE kode_pkm=$5`,
        [nama, parseFloat(indeks)||0, parseFloat(indeksKesulitan)||0, aktif!==false, kode]
      );
      return ok({ message: 'Puskesmas berhasil diupdate' });
    }

    if (method === 'DELETE') {
      const { kode } = body;
      if (!kode) return err('Kode diperlukan');
      await pool.query('DELETE FROM master_puskesmas WHERE kode_pkm=$1', [kode]);
      return ok({ message: 'Puskesmas berhasil dihapus' });
    }

    return err('Method tidak diizinkan', 405);
  } catch (e) {
    console.error('PKM error:', e);
    return err('Error: ' + e.message, 500);
  }
};
