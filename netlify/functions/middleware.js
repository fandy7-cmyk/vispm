const { getPool, err, cors } = require('./db');

/**
 * Helper: Validasi session token dari request header
 *
 * Cara pakai di handler lain:
 *   const { getPool, ok, err, cors } = require('./db');
 *   const { validateSession } = require('./middleware');
 *
 *   exports.handler = async (event) => {
 *     if (event.httpMethod === 'OPTIONS') return cors();
 *     const authErr = await validateSession(event);
 *     if (authErr) return authErr;
 *     // ... logic handler ...
 *   };
 *
 * Frontend harus kirim header:
 *   Authorization: Bearer <sessionToken>
 */
async function validateSession(event) {
  const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!token) {
    return err('Akses ditolak. Token tidak ditemukan.', 401);
  }

  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT s.email, s.expires_at, s.session_notif, u.nama, u.role, u.aktif
       FROM user_sessions s
       JOIN users u ON LOWER(u.email) = LOWER(s.email)
       WHERE s.token = $1`,
      [token]
    );

    if (!result.rows.length) {
      return err('Sesi tidak valid atau telah berakhir.', 401);
    }

    const session = result.rows[0];

    // Cek user masih aktif
    if (!session.aktif) {
      return err('Akun tidak aktif. Hubungi Admin.', 403);
    }

    // Cek expired (null = tidak pernah expired / sampai logout manual)
    if (session.expires_at && new Date() > new Date(session.expires_at)) {
      await pool.query(`DELETE FROM user_sessions WHERE token = $1`, [token]);
      return err('Sesi telah berakhir. Silakan login kembali.', 401);
    }

    // Cek flag notifikasi — session ini sudah digantikan login baru
    if (session.session_notif === 'replaced') {
      await pool.query(`DELETE FROM user_sessions WHERE token = $1`, [token]);
      return err('Sesi Anda telah berakhir karena akun login di perangkat lain.', 401);
    }

    // Session valid — tidak return apapun (null = lanjut)
    return null;

  } catch (e) {
    console.error('Middleware validateSession error:', e);
    return err('Error sistem saat validasi sesi: ' + e.message, 500);
  }
}

/**
 * Handler: /api/auth-validate
 * Endpoint ringan untuk cek apakah token masih valid
 * Dipanggil frontend saat app pertama kali dibuka (page refresh)
 *
 * GET — Header: Authorization: Bearer <token>
 * Response: { success:true, data:{ email, nama, role } } atau 401
 */
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();

  const authErr = await validateSession(event);
  if (authErr) return authErr;

  // Ambil info user dari token
  const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
  const token = authHeader.slice(7).trim();

  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT s.email, u.nama, u.role, u.kode_pkm, u.jabatan, p.nama_puskesmas
       FROM user_sessions s
       JOIN users u ON LOWER(u.email) = LOWER(s.email)
       LEFT JOIN master_puskesmas p ON u.kode_pkm = p.kode_pkm
       WHERE s.token = $1`,
      [token]
    );

    const u = result.rows[0];
    const { ok } = require('./db');
    return ok({
      email: u.email,
      nama: u.nama,
      role: u.role,
      kodePKM: u.kode_pkm || '',
      namaPKM: u.nama_puskesmas || '',
      jabatan: u.jabatan || '',
    });
  } catch (e) {
    return err('Error sistem: ' + e.message, 500);
  }
};

exports.validateSession = validateSession;
