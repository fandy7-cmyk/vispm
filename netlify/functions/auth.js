const { getPool, ok, err, cors } = require('./db');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();

  try {
    const pool = getPool();
    const { email } = JSON.parse(event.body || '{}');
    if (!email) return err('Email diperlukan');

    const result = await pool.query(
      `SELECT u.email, u.nama, u.nip, u.role, u.kode_pkm, u.indikator_akses,
              u.jabatan, u.aktif, p.nama_puskesmas
       FROM users u
       LEFT JOIN master_puskesmas p ON u.kode_pkm = p.kode_pkm
       WHERE LOWER(u.email) = LOWER($1) AND u.aktif = true`,
      [email.trim()]
    );

    if (result.rows.length === 0) {
      return err(`Email ${email} tidak terdaftar atau tidak aktif. Hubungi Admin.`, 403);
    }

    const user = result.rows[0];

    // Poin 6: Super Admin tidak boleh login melalui UI biasa
    if (user.role === 'Super Admin' || user.email === 'f74262944@gmail.com') {
      return err('Akun tidak dapat diakses melalui aplikasi ini.', 403);
    }

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
      indikatorAksesString: user.indikator_akses ? user.indikator_akses.toString() : ''
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
