const { getPool, ok, err, cors } = require('./db');

/**
 * Handler: /api/indikator-penandatangan
 *
 * Menyimpan konfigurasi jabatan penandatangan per indikator SPM.
 * Data disimpan di tabel indikator_penandatangan.
 *
 * GET  — Ambil semua konfigurasi
 *        Response: { [noIndikator]: [{ jabatan, urutan }] }
 *
 * POST — Simpan konfigurasi untuk satu indikator
 *        Body: { noIndikator, jabatanList: ['Jabatan A', 'Jabatan B', ...] }
 *        jabatanList = array jabatan berurutan (index = urutan)
 *
 * DELETE — Hapus semua konfigurasi untuk satu indikator
 *          Body: { noIndikator }
 */
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();
  const pool = getPool();

  try {
    // Migrasi tabel jika belum ada
    await pool.query(`
      CREATE TABLE IF NOT EXISTS indikator_penandatangan (
        id          SERIAL PRIMARY KEY,
        no_indikator INT NOT NULL,
        jabatan     TEXT NOT NULL,
        urutan      INT NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(no_indikator, jabatan)
      )
    `).catch(() => {});
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_indpen_no ON indikator_penandatangan(no_indikator)`
    ).catch(() => {});

    // ===== GET =====
    if (event.httpMethod === 'GET') {
      const result = await pool.query(
        `SELECT no_indikator, jabatan, urutan
         FROM indikator_penandatangan
         ORDER BY no_indikator, urutan`
      );
      // Kelompokkan per no_indikator
      const grouped = {};
      for (const row of result.rows) {
        const no = row.no_indikator;
        if (!grouped[no]) grouped[no] = [];
        grouped[no].push({ jabatan: row.jabatan, urutan: row.urutan });
      }
      return ok(grouped);
    }

    const body = JSON.parse(event.body || '{}');

    // ===== POST — upsert konfigurasi satu indikator =====
    if (event.httpMethod === 'POST') {
      const { noIndikator, jabatanList } = body;
      if (!noIndikator) return err('noIndikator diperlukan');
      if (!Array.isArray(jabatanList)) return err('jabatanList harus array');

      // Hapus konfigurasi lama untuk indikator ini
      await pool.query(
        `DELETE FROM indikator_penandatangan WHERE no_indikator = $1`,
        [parseInt(noIndikator)]
      );

      // Insert baru dengan urutan sesuai index array
      for (let i = 0; i < jabatanList.length; i++) {
        const jabatan = (jabatanList[i] || '').trim();
        if (!jabatan) continue;
        await pool.query(
          `INSERT INTO indikator_penandatangan (no_indikator, jabatan, urutan, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (no_indikator, jabatan) DO UPDATE SET urutan = $3, updated_at = NOW()`,
          [parseInt(noIndikator), jabatan, i]
        );
      }

      return ok({ message: `Konfigurasi indikator ${noIndikator} berhasil disimpan` });
    }

    // ===== DELETE =====
    if (event.httpMethod === 'DELETE') {
      const { noIndikator } = body;
      if (!noIndikator) return err('noIndikator diperlukan');
      await pool.query(
        `DELETE FROM indikator_penandatangan WHERE no_indikator = $1`,
        [parseInt(noIndikator)]
      );
      return ok({ message: `Konfigurasi indikator ${noIndikator} berhasil dihapus` });
    }

    return err('Method tidak diizinkan', 405);
  } catch (e) {
    console.error('indikator-penandatangan error:', e);
    return err('Error: ' + e.message, 500);
  }
};