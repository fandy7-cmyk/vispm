const { getPool, ok, err, cors } = require('./db');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();
  const pool = getPool();
  const method = event.httpMethod;
  try {
    if (method === 'GET') {
      const r = await pool.query(
        `SELECT u.email, u.nama, u.nip, u.role, u.kode_pkm, u.indikator_akses, u.jabatan, u.aktif,
                p.nama_puskesmas
         FROM users u LEFT JOIN master_puskesmas p ON u.kode_pkm=p.kode_pkm
         WHERE u.role != 'Super Admin' ORDER BY u.nama`
      );
      return ok(r.rows.map(x => ({
        email: x.email, nama: x.nama, nip: x.nip || '',
        role: x.role, kodePKM: x.kode_pkm || '', namaPKM: x.nama_puskesmas || '',
        indikatorAkses: x.indikator_akses ? x.indikator_akses.toString() : '',
        jabatan: x.jabatan || '', aktif: x.aktif
      })));
    }
    const body = JSON.parse(event.body || '{}');
    if (method === 'POST') {
      const { email, nama, nip, role, kodePKM, indikatorAkses, jabatan } = body;
      if (!email || !nama || !role) return err('Email, nama, dan role diperlukan');
      // Validasi format email server-side
      if (!email.includes('@') || email.split('@').length !== 2) return err('Format email tidak valid');
      const exists = await pool.query('SELECT email FROM users WHERE LOWER(email)=LOWER($1)', [email]);
      if (exists.rows.length > 0) return err('Email sudah terdaftar di sistem');
      if (role === 'Super Admin') return err('Role Super Admin tidak dapat dibuat melalui sistem.');
      await pool.query(
        `INSERT INTO users (email, nama, nip, role, kode_pkm, indikator_akses, jabatan, aktif)
         VALUES ($1,$2,$3,$4,$5,$6,$7,true)`,
        [email.trim().toLowerCase(), nama, nip||null, role, kodePKM||null, indikatorAkses||null, jabatan||null]
      );
      return ok({ message: 'User berhasil ditambahkan' });
    }
    if (method === 'PUT') {
      const { email, nama, nip, role, kodePKM, indikatorAkses, jabatan, aktif } = body;
      if (!email) return err('Email diperlukan');
      await pool.query(
        `UPDATE users SET nama=$1, nip=$2, role=$3, kode_pkm=$4, indikator_akses=$5, jabatan=$6, aktif=$7
         WHERE LOWER(email)=LOWER($8)`,
        [nama, nip||null, role, kodePKM||null, indikatorAkses||null, jabatan||null, aktif!==false, email]
      );
      return ok({ message: 'User berhasil diupdate' });
    }
    if (method === 'DELETE') {
      const { email } = body;
      if (!email) return err('Email diperlukan');
      await pool.query('DELETE FROM users WHERE LOWER(email)=LOWER($1)', [email]);
      return ok({ message: 'User berhasil dihapus' });
    }
    return err('Method tidak diizinkan', 405);
  } catch(e) {
    console.error('Users error:', e);
    return err('Error: ' + e.message, 500);
  }
};
