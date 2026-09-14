// Helper audit log server-side — dipanggil dari backend (bukan dari frontend)
// supaya tidak bisa di-inspect/diblok oleh user non-admin lewat DevTools.

function getClientIp(event) {
  return event.headers?.['x-forwarded-for']?.split(',')[0]?.trim()
    || event.headers?.['x-real-ip']
    || '-';
}

async function fetchLokasiFromIp(ip) {
  if (!ip || ip === '-' || ip === '::1' || ip.startsWith('127.') || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return null;
  }
  try {
    const r = await fetch(`http://ip-api.com/json/${ip}?fields=status,city,regionName,country`, {
      signal: AbortSignal.timeout(2500),
    });
    const geo = await r.json();
    if (geo.status === 'success') {
      return [geo.city, geo.regionName, geo.country].filter(Boolean).join(', ');
    }
  } catch (_) { /* diamkan, lokasi opsional */ }
  return null;
}

let _migrated = false;
async function ensureTable(pool) {
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
  _migrated = true;
}

// Dipanggil dari fungsi backend lain (mis. auth.js) setelah aksi selesai diproses.
// Lokasi diambil dari IP di server, bukan dari browser client — jadi tidak bisa
// dipalsukan/diskip oleh user yang bersangkutan.
async function logAudit(pool, event, { module, action, userEmail = null, userNama = null, userRole = null, detail = null, meta = null }) {
  try {
    await ensureTable(pool);
    const ip = getClientIp(event);
    const lokasi = await fetchLokasiFromIp(ip);
    await pool.query(
      `INSERT INTO audit_trail (module, action, user_email, user_nama, user_role, detail, ip_address, meta, lokasi)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [module, String(action).toUpperCase(), userEmail, userNama, userRole,
       detail, ip, meta ? JSON.stringify(meta) : null, lokasi]
    );
  } catch (e) {
    console.error('[logAudit]', e);
  }
}

module.exports = { logAudit, getClientIp };
