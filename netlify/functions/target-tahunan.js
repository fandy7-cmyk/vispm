const { getPool, ok, err, cors } = require('./db');

let _migrated = false;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();
  const pool = getPool();
  const method = event.httpMethod;
  const params = event.queryStringParameters || {};

  try {
    if (!_migrated) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS target_tahunan (
          id SERIAL PRIMARY KEY,
          kode_pkm VARCHAR(20) NOT NULL,
          no_indikator INT NOT NULL,
          tahun INT NOT NULL,
          sasaran INT NOT NULL DEFAULT 0,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(kode_pkm, no_indikator, tahun)
        )
      `).catch(() => {});
      _migrated = true;
    }

    if (method === 'GET') {
      const { kode_pkm, tahun } = params;
      if (!kode_pkm || !tahun) return err('kode_pkm dan tahun diperlukan');

      const result = await pool.query(
        `SELECT tt.no_indikator, tt.sasaran, mi.nama_indikator
         FROM target_tahunan tt
         LEFT JOIN master_indikator mi ON tt.no_indikator = mi.no_indikator
         WHERE tt.kode_pkm = $1 AND tt.tahun = $2
         ORDER BY tt.no_indikator`,
        [kode_pkm, parseInt(tahun)]
      );

      // Gabungkan dengan semua indikator aktif (yang belum di-set tetap 0)
      const allInd = await pool.query(
        `SELECT no_indikator, nama_indikator FROM master_indikator WHERE aktif=true ORDER BY no_indikator`
      );
      const setMap = {};
      result.rows.forEach(r => { setMap[r.no_indikator] = parseInt(r.sasaran) || 0; });

      return ok(allInd.rows.map(r => ({
        noIndikator: r.no_indikator,
        namaIndikator: r.nama_indikator,
        sasaran: setMap[r.no_indikator] ?? 0
      })));
    }

    // POST: upsert satu atau banyak target sekaligus
    // body: { kodePKM, tahun, targets: [{noIndikator, sasaran}, ...] }
    if (method === 'POST') {
      const { kodePKM, tahun, targets } = JSON.parse(event.body || '{}');
      if (!kodePKM || !tahun || !Array.isArray(targets)) return err('kodePKM, tahun, dan targets diperlukan');

      for (const t of targets) {
        await pool.query(
          `INSERT INTO target_tahunan (kode_pkm, no_indikator, tahun, sasaran, updated_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (kode_pkm, no_indikator, tahun)
           DO UPDATE SET sasaran = EXCLUDED.sasaran, updated_at = NOW()`,
          [kodePKM, parseInt(t.noIndikator), parseInt(tahun), parseInt(t.sasaran) || 0]
        );
      }
      return ok({ message: `Target tahunan berhasil disimpan untuk ${targets.length} indikator` });
    }

    return err('Method tidak diizinkan', 405);
  } catch (e) {
    console.error('Target tahunan error:', e);
    return err('Error: ' + e.message, 500);
  }
};
