const { getPool, ok, err, cors } = require('./db');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();

  const pool = getPool();
  const method = event.httpMethod;

  try {
    // GET all users
    if (method === 'GET') {
      const result = await pool.query(
        `SELECT u.email, u.nama, u.role, u.kode_pkm, u.indikator_akses, u.jabatan, u.aktif,
                p.nama_puskesmas
         FROM users u
         LEFT JOIN master_puskesmas p ON u.kode_pkm = p.kode_pkm
         WHERE u.role != 'Super Admin'
         ORDER BY u.nama`
      );
      return ok(result.rows.map(r => ({
        email: r.email,
        nama: r.nama,
        role: r.role,
        kodePKM: r.kode_pkm || '',
        namaPKM: r.nama_puskesmas || '',
        indikatorAkses: r.indikator_akses ? r.indikator_akses.toString() : '',
        jabatan: r.jabatan || '',
        aktif: r.aktif
      })));
    }

    const body = JSON.parse(event.body || '{}');

    // POST - create user
    if (method === 'POST') {
      const { email, nama, role, kodePKM, indikatorAkses, jabatan } = body;
      if (!email || !nama || !role) return err('Email, nama, dan role diperlukan');
      const exists = await pool.query('SELECT email FROM users WHERE LOWER(email) = LOWER($1)', [email]);
      if (exists.rows.length > 0) return err('Email sudah terdaftar');
      if (role === 'Super Admin') return err('Role Super Admin tidak dapat dibuat melalui sistem.');
      await pool.query(
        `INSERT INTO users (email, nama, role, kode_pkm, indikator_akses, jabatan, aktif)
         VALUES ($1, $2, $3, $4, $5, $6, true)`,
        [email.trim().toLowerCase(), nama, role, kodePKM || null, indikatorAkses || null, jabatan || null]
      );
      return ok({ message: 'User berhasil ditambahkan' });
    }

    // PUT - update user
    if (method === 'PUT') {
      const { email, nama, role, kodePKM, indikatorAkses, jabatan, aktif } = body;
      if (!email) return err('Email diperlukan');
      await pool.query(
        `UPDATE users SET nama=$1, role=$2, kode_pkm=$3, indikator_akses=$4, jabatan=$5, aktif=$6
         WHERE LOWER(email) = LOWER($7)`,
        [nama, role, kodePKM || null, indikatorAkses || null, jabatan || null, aktif !== false, email]
      );
      return ok({ message: 'User berhasil diupdate' });
    }

    // DELETE
    if (method === 'DELETE') {
      const { email } = body;
      if (!email) return err('Email diperlukan');
      await pool.query('DELETE FROM users WHERE LOWER(email) = LOWER($1)', [email]);
      return ok({ message: 'User berhasil dihapus' });
    }

    return err('Method tidak diizinkan', 405);
  } catch (e) {
    console.error('Users error:', e);
    return err('Error: ' + e.message, 500);
  }
};
