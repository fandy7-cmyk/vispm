const { getPool, ok, err, cors } = require('./db');

let bcrypt;
try { bcrypt = require('bcryptjs'); } catch(e) { bcrypt = null; }

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();

  try {
    const pool = getPool();
    const { email, password, action } = JSON.parse(event.body || '{}');

    // ===== CHANGE PASSWORD =====
    if (action === 'change-password') {
      const { oldPassword, newPassword } = JSON.parse(event.body);
      if (!email || !oldPassword || !newPassword) return err('Data tidak lengkap');
      if (newPassword.length < 6) return err('Password minimal 6 karakter');
      const res = await pool.query('SELECT password_hash FROM users WHERE LOWER(email)=LOWER($1)', [email.trim()]);
      if (!res.rows.length) return err('User tidak ditemukan');
      const hash = res.rows[0].password_hash;
      if (hash) {
        const match = bcrypt ? await bcrypt.compare(oldPassword, hash) : oldPassword === hash;
        if (!match) return err('Password lama tidak sesuai');
      }
      const newHash = bcrypt ? await bcrypt.hash(newPassword, 10) : newPassword;
      await pool.query('UPDATE users SET password_hash=$1 WHERE LOWER(email)=LOWER($2)', [newHash, email.trim()]);
      return ok({ message: 'Password berhasil diubah' });
    }

    // ===== RESET PASSWORD (admin) =====
    if (action === 'reset-password') {
      const { targetEmail, newPassword } = JSON.parse(event.body);
      if (!newPassword) return err('Password baru diperlukan');
      const newHash = bcrypt ? await bcrypt.hash(newPassword, 10) : newPassword;
      await pool.query('UPDATE users SET password_hash=$1 WHERE LOWER(email)=LOWER($2)', [newHash, targetEmail.trim()]);
      return ok({ message: 'Password berhasil direset' });
    }

    // ===== LOGIN =====
    if (!email) return err('Email diperlukan');

    const result = await pool.query(
      `SELECT u.email, u.nama, u.nip, u.role, u.kode_pkm, u.indikator_akses,
              u.jabatan, u.aktif, u.password_hash, p.nama_puskesmas
       FROM users u
       LEFT JOIN master_puskesmas p ON u.kode_pkm = p.kode_pkm
       WHERE LOWER(u.email) = LOWER($1) AND u.aktif = true`,
      [email.trim()]
    );

    if (result.rows.length === 0) {
      return err(`Email ${email} tidak terdaftar atau tidak aktif. Hubungi Admin.`, 403);
    }

    const user = result.rows[0];

    // Validasi password
    const hash = user.password_hash;
    if (hash) {
      // Ada password → wajib cocok
      if (!password) return err('Password diperlukan', 401);
      const match = bcrypt ? await bcrypt.compare(password, hash) : password === hash;
      if (!match) return err('Email atau password tidak sesuai', 401);
    } else {
      // Belum ada password → mode transisi, izinkan login tanpa password
      // Tapi tandai agar user diminta set password
    }

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

    return ok({
      email: user.email,
      nama: user.nama,
      nip: user.nip || '',
      role: user.role,
      kodePKM: user.kode_pkm || '',
      namaPKM: user.nama_puskesmas || '',
      jabatan: user.jabatan || '',
      indikatorAkses: indikatorList,
      indikatorAksesString: user.indikator_akses ? user.indikator_akses.toString() : '',
      needsPassword: !hash // flag untuk minta set password
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
