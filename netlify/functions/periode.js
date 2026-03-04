const { getPool, ok, err, cors } = require('./db');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();

  const pool = getPool();
  const method = event.httpMethod;
  const params = event.queryStringParameters || {};

  try {
    // Auto-migrate: tambah kolom baru kalau belum ada
    await pool.query(`ALTER TABLE periode_input ADD COLUMN IF NOT EXISTS jam_mulai VARCHAR(5) DEFAULT '08:00'`).catch(()=>{});
    await pool.query(`ALTER TABLE periode_input ADD COLUMN IF NOT EXISTS jam_selesai VARCHAR(5) DEFAULT '17:00'`).catch(()=>{});
    await pool.query(`ALTER TABLE periode_input ADD COLUMN IF NOT EXISTS notif_operator TEXT`).catch(()=>{});

    if (method === 'GET') {
      let query = `SELECT id, tahun, bulan, nama_bulan, tanggal_mulai, tanggal_selesai, jam_mulai, jam_selesai, notif_operator, status
                   FROM periode_input`;
      const qParams = [];
      if (params.tahun) {
        query += ' WHERE tahun = $1';
        qParams.push(parseInt(params.tahun));
      }
      query += ' ORDER BY tahun, bulan';
      const result = await pool.query(query, qParams);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Auto-update expired periods to Tidak Aktif
      for (const r of result.rows) {
        if (r.status === 'Aktif') {
          const selesai = new Date(r.tanggal_selesai);
          selesai.setHours(23, 59, 59, 999);
          if (today > selesai) {
            await pool.query(`UPDATE periode_input SET status='Tidak Aktif' WHERE id=$1`, [r.id]);
            r.status = 'Tidak Aktif';
          }
        }
      }

      return ok(result.rows.map(r => {
        const mulai = new Date(r.tanggal_mulai);
        const selesai = new Date(r.tanggal_selesai);
        selesai.setHours(23, 59, 59, 999);
        const isAktifToday = r.status === 'Aktif' && today >= mulai && today <= selesai;
        return {
          id: r.id, tahun: r.tahun, bulan: r.bulan,
          namaBulan: r.nama_bulan,
          tanggalMulai: r.tanggal_mulai,
          tanggalSelesai: r.tanggal_selesai,
          jamMulai: r.jam_mulai || '08:00',
          jamSelesai: r.jam_selesai || '17:00',
          notifOperator: r.notif_operator || '',
          status: r.status, isAktifToday
        };
      }));
    }

    const body = JSON.parse(event.body || '{}');

    if (method === 'POST') {
      const { tahun, bulan, namaBulan, tanggalMulai, tanggalSelesai, jamMulai, jamSelesai, notifOperator, status } = body;
      if (!tahun || !bulan) return err('Tahun dan bulan diperlukan');

      const jm = jamMulai || '08:00';
      const js = jamSelesai || '17:00';
      const notif = notifOperator || null;

      const exists = await pool.query('SELECT id FROM periode_input WHERE tahun=$1 AND bulan=$2', [tahun, bulan]);
      if (exists.rows.length > 0) {
        await pool.query(
          `UPDATE periode_input SET nama_bulan=$1, tanggal_mulai=$2, tanggal_selesai=$3, jam_mulai=$4, jam_selesai=$5, notif_operator=$6, status=$7
           WHERE tahun=$8 AND bulan=$9`,
          [namaBulan, tanggalMulai, tanggalSelesai, jm, js, notif, status || 'Aktif', tahun, bulan]
        );
      } else {
        await pool.query(
          `INSERT INTO periode_input (tahun, bulan, nama_bulan, tanggal_mulai, tanggal_selesai, jam_mulai, jam_selesai, notif_operator, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [tahun, bulan, namaBulan, tanggalMulai, tanggalSelesai, jm, js, notif, status || 'Aktif']
        );
      }
      return ok({ message: 'Periode berhasil disimpan' });
    }

    if (method === 'DELETE') {
      const { tahun, bulan } = params;
      if (!tahun || !bulan) return err('Tahun dan bulan diperlukan');
      // Cek apakah periode sedang aktif hari ini — tidak boleh dihapus
      const r = await pool.query('SELECT id, status, tanggal_mulai, tanggal_selesai FROM periode_input WHERE tahun=$1 AND bulan=$2', [parseInt(tahun), parseInt(bulan)]);
      if (!r.rows.length) return err('Periode tidak ditemukan');
      const p = r.rows[0];
      const today = new Date(); today.setHours(0,0,0,0);
      const mulai = new Date(p.tanggal_mulai);
      const selesai = new Date(p.tanggal_selesai); selesai.setHours(23,59,59,999);
      if (p.status === 'Aktif' && today >= mulai && today <= selesai) {
        return err('Tidak dapat menghapus periode yang sedang aktif hari ini');
      }
      await pool.query('DELETE FROM periode_input WHERE tahun=$1 AND bulan=$2', [parseInt(tahun), parseInt(bulan)]);
      return ok({ message: 'Periode berhasil dihapus' });
    }

    return err('Method tidak diizinkan', 405);
  } catch (e) {
    console.error('Periode error:', e);
    return err('Error: ' + e.message, 500);
  }
};
