const { getPool, ok, err, cors } = require('./db');
const { validateSession } = require('./middleware');

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
      lokasi      VARCHAR(255),
      meta        JSONB
    )
  `).catch(() => {});
  await pool.query(`ALTER TABLE audit_trail ADD COLUMN IF NOT EXISTS lokasi VARCHAR(255)`).catch(() => {});
  await Promise.all([
    pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_trail(created_at DESC)`).catch(() => {}),
    pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_module  ON audit_trail(module)`).catch(() => {}),
    pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_email   ON audit_trail(user_email)`).catch(() => {}),
  ]);
  _migrated = true;
}

/**
 * Handler: /api/audit-trail
 *
 * GET — Query log aktivitas global
 *       Query params:
 *         date_from — tanggal mulai (YYYY-MM-DD)
 *         date_to   — tanggal akhir (YYYY-MM-DD)
 *         module    — filter modul (auth, usulan, users, puskesmas, dll)
 *         action    — filter aksi (LOGIN, CREATE, UPDATE, DELETE, SUBMIT, APPROVE, REJECT)
 *         user      — filter email atau nama user (LIKE search)
 *         limit     — baris per halaman (default: 1000, max: 5000)
 *         page      — halaman (default: 1)
 *       Response: [{ id, created_at, module, action, user_email, user_nama,
 *                    user_role, detail, ip_address, lokasi }]
 *
 * POST — Tulis log aktivitas baru
 *        Body: { module, action, userEmail, userNama, userRole, detail, meta? }
 *        IP address diambil otomatis dari header request.
 *        Untuk action=LOGIN: lookup lokasi otomatis via ip-api.com
 */
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();

  const _authErr = await validateSession(event);
  if (_authErr) return _authErr;
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

      // Pagination — default 1000 per halaman, max 5000
      const limitVal  = Math.min(parseInt(p.limit)  || 1000, 5000);
      const pageVal   = Math.max(parseInt(p.page)   || 1, 1);
      const offsetVal = (pageVal - 1) * limitVal;

      const result = await pool.query(
        `SELECT id, created_at, module, action, user_email, user_nama, user_role, detail, ip_address, lokasi
         FROM audit_trail ${whereStr}
         ORDER BY created_at DESC
         LIMIT ${limitVal} OFFSET ${offsetVal}`,
        qp
      );
      return ok(result.rows);
    }

    // ===== POST: tulis log =====
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { module, action, userEmail, userNama, userRole, detail, meta } = body;

      if (!module || !action) return err('module dan action diperlukan');

      const ip = event.headers?.['x-forwarded-for']?.split(',')[0]?.trim()
        || event.headers?.['x-real-ip']
        || '-';

      let lokasi = null;
      if (action.toUpperCase() === 'LOGIN' && ip && ip !== '-' && ip !== '::1' && !ip.startsWith('127.') && !ip.startsWith('192.168.') && !ip.startsWith('10.')) {
        try {
          const geoRes = await fetch(`http://ip-api.com/json/${ip}?fields=status,city,regionName,country,isp`, { signal: AbortSignal.timeout(2500) });
          const geo = await geoRes.json();
          if (geo.status === 'success') {
            lokasi = [geo.city, geo.regionName, geo.country].filter(Boolean).join(', ');
          }
        } catch (_) {
          // Gagal lookup → biarkan null, jangan gagalkan log
        }
      }

      await pool.query(
        `INSERT INTO audit_trail (module, action, user_email, user_nama, user_role, detail, ip_address, meta, lokasi)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [module, action.toUpperCase(), userEmail||null, userNama||null, userRole||null,
         detail||null, ip, meta ? JSON.stringify(meta) : null, lokasi||null]
      );
      return ok({ message: 'Log berhasil dicatat' });
    }

    return err('Method tidak diizinkan', 405);
  } catch(e) {
    console.error('Audit trail error:', e);
    return err('Error: ' + e.message, 500);
  }
};
