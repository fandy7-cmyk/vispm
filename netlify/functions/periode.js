const { getPool, ok, err, cors } = require('./db');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();

  const pool = getPool();
  const method = event.httpMethod;
  const params = event.queryStringParameters || {};

  try {
    if (method === 'GET') {
      let query = `SELECT id, tahun, bulan, nama_bulan, tanggal_mulai, tanggal_selesai, status
                   FROM periode_input`;
      const qParams = [];
      if (params.tahun) {
        query += ' WHERE tahun = $1';
        qParams.push(parseInt(params.tahun));
      }
      query += ' ORDER BY tahun, bulan';
      const result = await pool.query(query, qParams);

      // Check aktif today
      const today = new Date();
      return ok(result.rows.map(r => {
        const mulai = new Date(r.tanggal_mulai);
        const selesai = new Date(r.tanggal_selesai);
        selesai.setHours(23, 59, 59, 999);
        const isAktifToday = r.status === 'Aktif' && today >= mulai && today <= selesai;
        return {
          id: r.id,
          tahun: r.tahun,
          bulan: r.bulan,
          namaBulan: r.nama_bulan,
          tanggalMulai: r.tanggal_mulai,
          tanggalSelesai: r.tanggal_selesai,
          status: r.status,
          isAktifToday
        };
      }));
    }

    const body = JSON.parse(event.body || '{}');

    if (method === 'POST') {
      const { tahun, bulan, namaBulan, tanggalMulai, tanggalSelesai, status } = body;
      if (!tahun || !bulan) return err('Tahun dan bulan diperlukan');

      // Upsert
      const exists = await pool.query(
        'SELECT id FROM periode_input WHERE tahun=$1 AND bulan=$2',
        [tahun, bulan]
      );
      if (exists.rows.length > 0) {
        await pool.query(
          `UPDATE periode_input SET nama_bulan=$1, tanggal_mulai=$2, tanggal_selesai=$3, status=$4
           WHERE tahun=$5 AND bulan=$6`,
          [namaBulan, tanggalMulai, tanggalSelesai, status || 'Aktif', tahun, bulan]
        );
      } else {
        await pool.query(
          `INSERT INTO periode_input (tahun, bulan, nama_bulan, tanggal_mulai, tanggal_selesai, status)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [tahun, bulan, namaBulan, tanggalMulai, tanggalSelesai, status || 'Aktif']
        );
      }
      return ok({ message: 'Periode berhasil disimpan' });
    }

    return err('Method tidak diizinkan', 405);
  } catch (e) {
    console.error('Periode error:', e);
    return err('Error: ' + e.message, 500);
  }
};
