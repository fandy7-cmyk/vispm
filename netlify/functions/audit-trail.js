const { getPool, ok, err, cors } = require('./db');

let _migrated = false;
async function runMigrations(pool) {
  if (_migrated) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_trail (
      id          BIGSERIAL PRIMARY KEY,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      module      VARCHAR(50),
      action      VARCHAR(50),
      user_email  VARCHAR(255),
      user_nama   VARCHAR(255),
      user_role   VARCHAR(100),
      detail      TEXT,
      ip_address  VARCHAR(50),
      meta        JSONB
    )
  `).catch(() => {});
  await Promise.all([
    pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_trail(created_at DESC)`).catch(() => {}),
    pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_module  ON audit_trail(module)`).catch(() => {}),
    pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_email   ON audit_trail(user_email)`).catch(() => {}),
  ]);
  _migrated = true;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();
  const pool = getPool();
  await runMigrations(pool);

  try {
    // ===== GET: query log =====
    if (event.httpMethod === 'GET') {
      const p = event.queryStringParameters || {};

      let where = [];
      let qp = [];
      let idx = 1;

      if (p.date_from) {
        where.push(`created_at >= $${idx++}::date`);
        qp.push(p.date_from);
      }
      if (p.date_to) {
        where.push(`created_at < ($${idx++}::date + interval '1 day')`);
        qp.push(p.date_to);
      }
      if (p.module) {
        where.push(`module = $${idx++}`);
        qp.push(p.module);
      }
      if (p.action) {
        where.push(`UPPER(action) = UPPER($${idx++})`);
        qp.push(p.action);
      }
      if (p.user) {
        where.push(`(LOWER(user_email) LIKE LOWER($${idx}) OR LOWER(user_nama) LIKE LOWER($${idx}))`);
        qp.push(`%${p.user}%`);
        idx++;
      }

      const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';
      const result = await pool.query(
        `SELECT id, created_at, module, action, user_email, user_nama, user_role, detail, ip_address
         FROM audit_trail ${whereStr}
         ORDER BY created_at DESC
         LIMIT 1000`,
        qp
      );
      return ok(result.rows);
    }

    // ===== POST: tulis log =====
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { module, action, userEmail, userNama, userRole, detail, meta } = body;

      if (!module || !action) return err('module dan action diperlukan');

      // Ambil IP dari header
      const ip = event.headers?.['x-forwarded-for']?.split(',')[0]?.trim()
        || event.headers?.['x-real-ip']
        || '-';

      await pool.query(
        `INSERT INTO audit_trail (module, action, user_email, user_nama, user_role, detail, ip_address, meta)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [module, action.toUpperCase(), userEmail||null, userNama||null, userRole||null,
         detail||null, ip, meta ? JSON.stringify(meta) : null]
      );
      return ok({ message: 'Log berhasil dicatat' });
    }

    return err('Method tidak diizinkan', 405);
  } catch(e) {
    console.error('Audit trail error:', e);
    return err('Error: ' + e.message, 500);
  }
};
