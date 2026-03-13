const { getPool, ok, err, cors } = require('./db');

const CURRENT_YEAR = new Date().getFullYear();

let _migrated = false;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();
  const pool = getPool();
  try {
    if (!_migrated) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS app_settings (
          key VARCHAR(100) PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await pool.query(`
        INSERT INTO app_settings (key, value) VALUES
          ('tahun_awal',  $1),
          ('tahun_akhir', $2)
        ON CONFLICT (key) DO NOTHING
      `, [String(CURRENT_YEAR), String(CURRENT_YEAR + 2)]);
      _migrated = true;
    }

    if (event.httpMethod === 'GET') {
      const res = await pool.query('SELECT key, value FROM app_settings');
      const data = {};
      res.rows.forEach(r => { data[r.key] = r.value; });
      return ok({
        tahun_awal:  parseInt(data.tahun_awal)  || CURRENT_YEAR,
        tahun_akhir: parseInt(data.tahun_akhir) || CURRENT_YEAR + 2,
      });
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { tahun_awal, tahun_akhir } = body;
      if (!tahun_awal || !tahun_akhir) return err('tahun_awal dan tahun_akhir diperlukan');
      if (parseInt(tahun_awal) > parseInt(tahun_akhir)) return err('Tahun awal tidak boleh lebih besar dari tahun akhir');
      await pool.query(
        `INSERT INTO app_settings (key, value, updated_at) VALUES ('tahun_awal',$1,NOW())
         ON CONFLICT (key) DO UPDATE SET value=$1, updated_at=NOW()`, [String(tahun_awal)]
      );
      await pool.query(
        `INSERT INTO app_settings (key, value, updated_at) VALUES ('tahun_akhir',$1,NOW())
         ON CONFLICT (key) DO UPDATE SET value=$1, updated_at=NOW()`, [String(tahun_akhir)]
      );
      return ok({ message: 'Pengaturan berhasil disimpan', tahun_awal, tahun_akhir });
    }

    return err('Method tidak diizinkan', 405);
  } catch (e) {
    console.error('Settings error:', e);
    return err('Error: ' + e.message, 500);
  }
};
