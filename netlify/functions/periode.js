const { getPool, ok, err, cors } = require('./db');

let _migrated = false;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();

  const pool = getPool();
  const method = event.httpMethod;
  const params = event.queryStringParameters || {};

  try {
    if (!_migrated) {
      await Promise.all([
        pool.query(`ALTER TABLE periode_input ADD COLUMN IF NOT EXISTS jam_mulai VARCHAR(5) DEFAULT '08:00'`).catch(()=>{}),
        pool.query(`ALTER TABLE periode_input ADD COLUMN IF NOT EXISTS jam_selesai VARCHAR(5) DEFAULT '17:00'`).catch(()=>{}),
        pool.query(`ALTER TABLE periode_input ADD COLUMN IF NOT EXISTS tanggal_mulai_verif DATE`).catch(()=>{}),
        pool.query(`ALTER TABLE periode_input ADD COLUMN IF NOT EXISTS tanggal_selesai_verif DATE`).catch(()=>{}),
      ]);
      _migrated = true;
    }

    if (method === 'GET') {
      let query = `SELECT id, tahun, bulan, nama_bulan, tanggal_mulai, tanggal_selesai, jam_mulai, jam_selesai, tanggal_mulai_verif, tanggal_selesai_verif, status
                   FROM periode_input`;
      const qParams = [];
      if (params.tahun) {
        query += ' WHERE tahun = $1';
        qParams.push(parseInt(params.tahun));
      }
      query += ' ORDER BY tahun, bulan';
      const result = await pool.query(query, qParams);

      // Gunakan tanggal WITA (UTC+8) sebagai string "YYYY-MM-DD" untuk perbandingan
      // Netlify server berjalan di UTC — tanpa konversi ini, hari bisa off-by-one
      const nowWita = new Date(Date.now() + 8 * 3600000);
      const todayStr = nowWita.toISOString().slice(0, 10); // "YYYY-MM-DD" dalam WITA

      // Helper: ambil tanggal dari nilai DB sebagai string WITA
      const toDateStr = (val) => {
        if (!val) return '';
        const d = new Date(val);
        const wita = new Date(d.getTime() + 8 * 3600000);
        return wita.toISOString().slice(0, 10);
      };

      // Auto-update expired periods to Tidak Aktif
      for (const r of result.rows) {
        if (r.status === 'Aktif') {
          const selesaiStr = toDateStr(r.tanggal_selesai);
          if (todayStr > selesaiStr) {
            await pool.query(`UPDATE periode_input SET status='Tidak Aktif' WHERE id=$1`, [r.id]);
            r.status = 'Tidak Aktif';
          }
        }
      }

      return ok(result.rows.map(r => {
        const mulaiStr   = toDateStr(r.tanggal_mulai);
        const selesaiStr = toDateStr(r.tanggal_selesai);
        const isAktifToday = r.status === 'Aktif' && todayStr >= mulaiStr && todayStr <= selesaiStr;
        const mulaiVerifStr   = toDateStr(r.tanggal_mulai_verif);
        const selesaiVerifStr = toDateStr(r.tanggal_selesai_verif);
        const isVerifToday = r.status === 'Aktif' && !!mulaiVerifStr && !!selesaiVerifStr
          && todayStr >= mulaiVerifStr && todayStr <= selesaiVerifStr;
        return {
          id: r.id, tahun: r.tahun, bulan: r.bulan,
          namaBulan: r.nama_bulan,
          tanggalMulai: r.tanggal_mulai,
          tanggalSelesai: r.tanggal_selesai,
          jamMulai: r.jam_mulai || '08:00',
          jamSelesai: r.jam_selesai || '17:00',
          tanggalMulaiVerif: r.tanggal_mulai_verif || null,
          tanggalSelesaiVerif: r.tanggal_selesai_verif || null,
          status: r.status, isAktifToday, isVerifToday
        };
      }));
    }

    const body = JSON.parse(event.body || '{}');

    if (method === 'POST') {
      const { tahun, bulan, namaBulan, tanggalMulai, tanggalSelesai, jamMulai, jamSelesai, tanggalMulaiVerif, tanggalSelesaiVerif, status } = body;
      if (!tahun || !bulan) return err('Tahun dan bulan diperlukan');

      const jm = jamMulai || '08:00';
      const js = jamSelesai || '17:00';
      const tmv = tanggalMulaiVerif || null;
      const tsv = tanggalSelesaiVerif || null;

      const exists = await pool.query('SELECT id FROM periode_input WHERE tahun=$1 AND bulan=$2', [tahun, bulan]);
      if (exists.rows.length > 0) {
        await pool.query(
          `UPDATE periode_input SET nama_bulan=$1, tanggal_mulai=$2, tanggal_selesai=$3, jam_mulai=$4, jam_selesai=$5, tanggal_mulai_verif=$6, tanggal_selesai_verif=$7, status=$8
           WHERE tahun=$9 AND bulan=$10`,
          [namaBulan, tanggalMulai, tanggalSelesai, jm, js, tmv, tsv, status || 'Aktif', tahun, bulan]
        );
      } else {
        await pool.query(
          `INSERT INTO periode_input (tahun, bulan, nama_bulan, tanggal_mulai, tanggal_selesai, jam_mulai, jam_selesai, tanggal_mulai_verif, tanggal_selesai_verif, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [tahun, bulan, namaBulan, tanggalMulai, tanggalSelesai, jm, js, tmv, tsv, status || 'Aktif']
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
      const _nw = new Date(Date.now() + 8*3600000);
      const _td = _nw.toISOString().slice(0,10);
      const _ds = (v) => { const d = new Date(new Date(v).getTime()+8*3600000); return d.toISOString().slice(0,10); };
      if (p.status === 'Aktif' && _td >= _ds(p.tanggal_mulai) && _td <= _ds(p.tanggal_selesai)) {
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