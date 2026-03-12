const { getPool, ok, err, cors } = require('./db');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();
  const pool = getPool();

  // Migration
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pejabat_penandatangan (
      id SERIAL PRIMARY KEY,
      jabatan VARCHAR(100) NOT NULL UNIQUE,
      nama VARCHAR(200) NOT NULL,
      nip VARCHAR(50),
      tanda_tangan TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(()=>{});

  try {
    if (event.httpMethod === 'GET') {
      const r = await pool.query(`SELECT * FROM pejabat_penandatangan ORDER BY id`);
      return ok(r.rows);
    }

    const body = JSON.parse(event.body || '{}');

    if (event.httpMethod === 'POST' || event.httpMethod === 'PUT') {
      const { jabatan, nama, nip, tandaTangan } = body;
      if (!jabatan || !nama) return err('Jabatan dan nama wajib diisi');

      await pool.query(`
        INSERT INTO pejabat_penandatangan (jabatan, nama, nip, tanda_tangan, updated_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (jabatan) DO UPDATE SET
          nama = EXCLUDED.nama,
          nip = EXCLUDED.nip,
          tanda_tangan = EXCLUDED.tanda_tangan,
          updated_at = NOW()
      `, [jabatan, nama, nip || null, tandaTangan || null]);

      return ok({ message: 'Pejabat berhasil disimpan' });
    }

    if (event.httpMethod === 'DELETE') {
      const { id } = body;
      if (!id) return err('ID diperlukan');
      await pool.query(`DELETE FROM pejabat_penandatangan WHERE id = $1`, [id]);
      return ok({ message: 'Pejabat berhasil dihapus' });
    }

    return err('Method tidak diizinkan', 405);
  } catch (e) {
    console.error('Pejabat error:', e);
    return err('Error: ' + e.message, 500);
  }
};
