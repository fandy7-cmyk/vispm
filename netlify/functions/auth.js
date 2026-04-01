const { getPool, ok, err, cors } = require('./db');
const crypto = require('crypto');

let bcrypt;
try { bcrypt = require('bcryptjs'); } catch(e) { bcrypt = null; }

const MAX_ATTEMPTS  = 3;   // lockout setelah 3 gagal
const LOCKOUT_MINS  = 15;  // kunci selama 15 menit

/**
 * Handler: /api/auth
 *
 * POST — Login / Ganti Password / Reset Password (Admin)
 *   Body (login)          : { email, password }
 *   Body (change-password): { action:'change-password', email, oldPassword, newPassword }
 *   Body (reset-password) : { action:'reset-password', email, targetEmail, newPassword }
 *
 * Response sukses: { success:true, data: { email, nama, role, kodePKM, ... } }
 * Response error : { success:false, message }
 *   401 — Password salah / perlu reset
 *   403 — Email tidak ditemukan / tidak aktif / akses ditolak
 *   429 — Akun terkunci karena terlalu banyak percobaan gagal
 *   500 — Error sistem
 *
 * CATATAN: Migrasi tabel (ALTER TABLE, CREATE TABLE) sudah dipindahkan ke
 * migration.sql dan dijalankan sekali langsung di Neon SQL Editor.
 * Jangan tambahkan DDL di sini — setiap request login akan menjalankannya
 * dan itu yang menyebabkan compute Neon cepat habis.
 */
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();

  try {
    const pool = getPool();

    const body = JSON.parse(event.body || '{}');
    const { email, password, action, oldPassword, newPassword, targetEmail, token } = body;

    // ===== CHANGE PASSWORD =====
    if (action === 'change-password') {
      if (!email || !oldPassword || !newPassword) return err('Data tidak lengkap');
      if (newPassword.length < 6) return err('Password minimal 6 karakter');
      const res = await pool.query('SELECT password_hash FROM users WHERE LOWER(email)=LOWER($1)', [email.trim()]);
      if (!res.rows.length) return err('User tidak ditemukan');
      const hash = res.rows[0].password_hash;
      if (hash) {
        if (!hash.startsWith('$2'))
          return err('Password akun ini perlu direset. Hubungi Admin untuk reset password.', 401);
        let match = false;
        if (bcrypt) {
          try { match = await bcrypt.compare(oldPassword, hash); } catch(e) { match = false; }
        }
        if (!match) return err('Password lama tidak sesuai');
      }
      const newHash = (bcrypt && typeof bcrypt.hash === 'function') ? await bcrypt.hash(newPassword, 10) : newPassword;
      await pool.query('UPDATE users SET password_hash=$1 WHERE LOWER(email)=LOWER($2)', [newHash, email.trim()]);
      return ok({ message: 'Password berhasil diubah' });
    }

    // ===== LOGOUT =====
    if (action === 'logout') {
      if (!token) return err('Token tidak ditemukan');
      await pool.query(`DELETE FROM user_sessions WHERE token = $1`, [token]);
      return ok({ message: 'Logout berhasil' });
    }

    // ===== RESET PASSWORD (admin) =====
    if (action === 'reset-password') {
      if (!email || !newPassword || !targetEmail) return err('Data tidak lengkap');
      // Verifikasi pemanggil adalah Admin
      const adminCheck = await pool.query(
        `SELECT role FROM users WHERE LOWER(email)=LOWER($1) AND aktif=true`, [email.trim()]
      );
      if (!adminCheck.rows.length || adminCheck.rows[0].role !== 'Admin')
        return err('Akses ditolak', 403);
      const newHash = (bcrypt && typeof bcrypt.hash === 'function') ? await bcrypt.hash(newPassword, 10) : newPassword;
      await pool.query('UPDATE users SET password_hash=$1 WHERE LOWER(email)=LOWER($2)', [newHash, targetEmail.trim()]);
      return ok({ message: 'Password berhasil direset' });
    }

    // ===== LOGIN =====
    if (!email) return err('Email diperlukan');

    const result = await pool.query(
      `SELECT u.email, u.nama, u.nip, u.role, u.kode_pkm, u.indikator_akses,
              u.jabatan, u.aktif, u.password_hash, u.tanda_tangan, p.nama_puskesmas,
              u.login_attempts, u.locked_until
       FROM users u
       LEFT JOIN master_puskesmas p ON u.kode_pkm = p.kode_pkm
       WHERE LOWER(u.email) = LOWER($1)`,
      [email.trim()]
    );

    if (result.rows.length === 0) {
      return err(`Email ${email} tidak terdaftar atau tidak aktif. Hubungi Admin.`, 403);
    }

    const user = result.rows[0];

    // Cek apakah akun aktif
    if (!user.aktif) {
      return err(`Email ${email} tidak terdaftar atau tidak aktif. Hubungi Admin.`, 403);
    }

    // ── Cek lockout ──
    if (user.locked_until && new Date() < new Date(user.locked_until)) {
      const menitSisa = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
      return err(`Akun terkunci sementara karena terlalu banyak percobaan login gagal. Coba lagi dalam ${menitSisa} menit.`, 429);
    }

    // Validasi password
    const hash = user.password_hash;
    if (hash) {
      if (!password) return err('Password diperlukan', 401);
      if (!hash.startsWith('$2')) {
        return err('Password akun ini perlu direset. Hubungi Admin untuk reset password.', 401);
      }
      let match = false;
      if (bcrypt) {
        try { match = await bcrypt.compare(password, hash); } catch(e) { match = false; }
      }
      if (!match) {
        // ── Increment login_attempts ──
        const newAttempts = (parseInt(user.login_attempts) || 0) + 1;
        if (newAttempts >= MAX_ATTEMPTS) {
          const lockUntil = new Date(Date.now() + LOCKOUT_MINS * 60 * 1000).toISOString();
          await pool.query(
            `UPDATE users SET login_attempts=$1, locked_until=$2 WHERE LOWER(email)=LOWER($3)`,
            [newAttempts, lockUntil, email.trim()]
          );
          return err(`Terlalu banyak percobaan login gagal. Akun dikunci selama ${LOCKOUT_MINS} menit.`, 429);
        }
        await pool.query(
          `UPDATE users SET login_attempts=$1 WHERE LOWER(email)=LOWER($2)`,
          [newAttempts, email.trim()]
        );
        const sisaCoba = MAX_ATTEMPTS - newAttempts;
        return err(`Email atau password tidak sesuai. Sisa percobaan: ${sisaCoba}.`, 401);
      }
    }

    // ── Login berhasil — reset attempts ──
    await pool.query(
      `UPDATE users SET login_attempts=0, locked_until=NULL WHERE LOWER(email)=LOWER($1)`,
      [email.trim()]
    );

    // Normalisasi role lama → nama baru
    const roleMap = {
      'Kapus': 'Kepala Puskesmas',
      'kapus': 'Kepala Puskesmas',
      'Program': 'Pengelola Program',
      'program': 'Pengelola Program',
    };
    if (roleMap[user.role]) user.role = roleMap[user.role];

    let indikatorList = [];
    if (user.role === 'Pengelola Program' && user.indikator_akses) {
      indikatorList = parseIndikatorAkses(user.indikator_akses.toString());
    }

    // ── Buat session token baru ──
    const sessionToken = crypto.randomUUID();
    const deviceInfo = (event.headers?.['user-agent'] || '').slice(0, 255);

    // Tandai session lama sebagai 'replaced' (notifikasi untuk device lama)
    await pool.query(
      `UPDATE user_sessions SET session_notif='replaced' WHERE LOWER(email)=LOWER($1)`,
      [email.trim()]
    );

    // Hapus session lama setelah ditandai
    // Simpan 1 session lama selama 5 menit agar device lama sempat dapat notifikasi
    await pool.query(
      `DELETE FROM user_sessions
       WHERE LOWER(email)=LOWER($1)
         AND (session_notif='replaced' AND created_at < NOW() - INTERVAL '5 minutes')`,
      [email.trim()]
    );

    // Insert session baru (expires_at NULL = aktif sampai logout manual)
    await pool.query(
      `INSERT INTO user_sessions (email, token, expires_at, device_info)
       VALUES ($1, $2, NULL, $3)`,
      [user.email, sessionToken, deviceInfo]
    );

    return ok({
      email: user.email,
      nama: user.nama,
      nip: user.nip || '',
      role: user.role,
      kodePKM: user.kode_pkm || '',
      namaPKM: user.nama_puskesmas || '',
      jabatan: user.jabatan || '',
      tandaTangan: user.tanda_tangan || '',
      indikatorAkses: indikatorList,
      indikatorAksesString: user.indikator_akses ? user.indikator_akses.toString() : '',
      needsPassword: !hash,
      sessionToken,
    });

  } catch (e) {
    console.error('Auth error:', e);
    return err('Error sistem: ' + e.message, 500);
  }
};

function parseIndikatorAkses(input) {
  let result = [];
  if (!input) return result;
  input = input.replace(/\s/g, '');
  const parts = input.split(',');
  for (let part of parts) {
    if (part.includes('-')) {
      const [start, end] = part.split('-').map(Number);
      for (let i = start; i <= end; i++) {
        if (!isNaN(i)) result.push(i);
      }
    } else {
      const num = Number(part);
      if (!isNaN(num)) result.push(num);
    }
  }
  return [...new Set(result)].sort((a, b) => a - b);
}