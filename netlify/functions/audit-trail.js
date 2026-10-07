const { getPool, ok, err, cors } = require('./db');
const { validateSession } = require('./middleware');

// Error koneksi (bukan error SQL): tidak ada gunanya di-retry/fallback ke query lain,
// karena query berikutnya pasti kena timeout yang sama dan malah memperlama respons.
const isConnErr = (e) => /timeout exceeded when trying to connect|ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i.test(e?.message || '');

const DDL_SQL = `
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
  );
  ALTER TABLE audit_trail ADD COLUMN IF NOT EXISTS lokasi VARCHAR(255);
  CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_trail(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_module  ON audit_trail(module);
  CREATE INDEX IF NOT EXISTS idx_audit_email   ON audit_trail(user_email);
`;

// Skema HANYA dibuat kalau memang belum ada (error 42P01 tabel / 42703 kolom belum ada),
// bukan dijalankan di setiap request. Request normal cukup 1 query ke DB — penting
// karena pool cuma max:1 dan koneksi ke Neon dari lokal lambat; makin sedikit
// round-trip, makin kecil kemungkinan kena "timeout exceeded when trying to connect".
let _ddlPromise = null;
function ensureSchema(pool) {
  if (!_ddlPromise) {
    _ddlPromise = pool.query(DDL_SQL).catch(e => { _ddlPromise = null; throw e; });
  }
  return _ddlPromise;
}
async function withSchema(pool, fn) {
  try {
    return await fn();
  } catch (e) {
    if (e.code !== '42P01' && e.code !== '42703') throw e;
    await ensureSchema(pool);
    return fn();
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();

  const _authErr = await validateSession(event);
  if (_authErr) return _authErr;
  const pool = getPool();
  const q = (sql, params) => withSchema(pool, () => pool.query(sql, params));
  try {
    
    if (event.httpMethod === 'GET') {
      const p = event.queryStringParameters || {};

      let where = [];
      let qp = [];
      let idx = 1;

      if (p.date_from) {
        where.push(`a.created_at >= $${idx++}::date`);
        qp.push(p.date_from);
      }
      if (p.date_to) {
        where.push(`a.created_at < ($${idx++}::date + interval '1 day')`);
        qp.push(p.date_to);
      }
      if (p.module) {
        where.push(`a.module = $${idx++}`);
        qp.push(p.module);
      }
      if (p.action) {
        where.push(`UPPER(a.action) = UPPER($${idx++})`);
        qp.push(p.action);
      }
      if (p.user) {
        where.push(`(LOWER(a.user_email) LIKE LOWER($${idx}) OR LOWER(a.user_nama) LIKE LOWER($${idx}) OR LOWER(u.nama) LIKE LOWER($${idx}))`);
        qp.push(`%${p.user}%`);
        idx++;
      }

      const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';

      // Pagination — default 1000 per halaman, max 5000
      const limitVal  = Math.min(parseInt(p.limit)  || 1000, 5000);
      const pageVal   = Math.max(parseInt(p.page)   || 1, 1);
      const offsetVal = (pageVal - 1) * limitVal;

      const sqlJoin = `SELECT a.id, a.created_at, a.module, a.action, a.user_email,
                  COALESCE(NULLIF(a.user_nama,''), u.nama) AS user_nama,
                  a.user_role, a.detail, a.ip_address, a.lokasi
           FROM audit_trail a
           LEFT JOIN users u ON LOWER(u.email) = LOWER(a.user_email)
           ${whereStr}
           ORDER BY a.created_at DESC
           LIMIT ${limitVal} OFFSET ${offsetVal}`;

      let result;
      try {
        result = await q(sqlJoin, qp);
      } catch (e1) {
        // Timeout/gagal konek: langsung lempar (retry cuma nambah lama, bisa lewat batas 30 detik).
        if (isConnErr(e1)) throw e1;
        // Error lain (mis. koneksi putus mendadak): coba sekali lagi dengan query yang sama.
        console.error('[audit-trail] query JOIN users gagal, retry:', e1.message);
        try {
          result = await q(sqlJoin, qp);
        } catch (e2) {
          if (isConnErr(e2)) throw e2;
          // Kalau tetap gagal, jangan sampai halaman Audit Trail ikut mati:
          // jatuh ke query tanpa JOIN (nama yang belum tersimpan bisa kosong).
          console.error('[audit-trail] retry JOIN gagal, fallback tanpa JOIN:', e2.message);
          const whereFb = whereStr
            .replace(/\s*OR LOWER\(u\.nama\) LIKE LOWER\(\$\d+\)/, '');
          result = await q(
            `SELECT a.id, a.created_at, a.module, a.action, a.user_email,
                    a.user_nama, a.user_role, a.detail, a.ip_address, a.lokasi
             FROM audit_trail a
             ${whereFb}
             ORDER BY a.created_at DESC
             LIMIT ${limitVal} OFFSET ${offsetVal}`,
            qp
          );
        }
      }
      return ok(result.rows);
    }

    // ===== POST: tulis log =====
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { module, action, userEmail, userNama, userRole, detail, meta, lokasi: lokasiClient } = body;

      if (!module || !action) return err('module dan action diperlukan');

      const ip = event.headers?.['x-forwarded-for']?.split(',')[0]?.trim()
        || event.headers?.['x-real-ip']
        || '-';

      
      
      
      
      
      let lokasi = lokasiClient || null;
      if (!lokasi && action.toUpperCase() === 'LOGIN' && ip && ip !== '-' && ip !== '::1' && !ip.startsWith('127.') && !ip.startsWith('192.168.') && !ip.startsWith('10.')) {
        try {
          const geoRes = await fetch(`http://ip-api.com/json/${ip}?fields=status,city,regionName,country,isp`, { signal: AbortSignal.timeout(2500) });
          const geo = await geoRes.json();
          if (geo.status === 'success') {
            lokasi = [geo.city, geo.regionName, geo.country].filter(Boolean).join(', ');
          }
        } catch (_) {
          
        }
      }

      await q(
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