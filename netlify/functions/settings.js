const { getPool, ok, err, cors } = require('./db');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();
  const pool = getPool();
  const method = event.httpMethod;

  try {
    // Pastikan tabel ada
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    if (method === 'GET') {
      const r = await pool.query('SELECT key, value FROM app_settings');
      const settings = {};
      r.rows.forEach(row => { settings[row.key] = row.value; });
      return ok(settings);
    }

    if (method === 'PUT') {
      const body = JSON.parse(event.body || '{}');
      // body = { key: value, key2: value2, ... }
      for (const [key, value] of Object.entries(body)) {
        await pool.query(
          `INSERT INTO app_settings (key, value, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()`,
          [key, String(value)]
        );
      }
      return ok({ message: 'Pengaturan berhasil disimpan' });
    }

    return err('Method tidak didukung');
  } catch (e) {
    console.error('[settings]', e.message);
    return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: e.message }) };
  }
};
