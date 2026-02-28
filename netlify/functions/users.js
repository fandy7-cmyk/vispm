const { getPool, ok, err, cors } = require('./db');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();
  const pool = getPool();
  const method = event.httpMethod;
  
  try {
    // GET USERS - dengan multiple jabatan
    if (method === 'GET') {
      const r = await pool.query(
        `SELECT u.email, u.nama, u.nip, u.role, u.kode_pkm, u.indikator_akses, u.jabatan as jabatan_old, u.aktif,
                p.nama_puskesmas,
                COALESCE(
                  (SELECT json_agg(json_build_object('id', j.id, 'nama', j.nama_jabatan))
                   FROM user_jabatan uj
                   JOIN master_jabatan j ON uj.jabatan_id = j.id
                   WHERE uj.user_email = u.email),
                  '[]'::json
                ) as jabatan_list
         FROM users u
         LEFT JOIN master_puskesmas p ON u.kode_pkm = p.kode_pkm
         WHERE u.role != 'Super Admin'  -- HIDE SUPER ADMIN
         ORDER BY u.nama`
      );
      
      return ok(r.rows.map(x => ({
        email: x.email, 
        nama: x.nama, 
        nip: x.nip || '',
        role: x.role, 
        kodePKM: x.kode_pkm || '', 
        namaPKM: x.nama_puskesmas || '',
        indikatorAkses: x.indikator_akses ? x.indikator_akses.toString() : '',
        jabatanList: x.jabatan_list || [],
        aktif: x.aktif
      })));
    }
    
    const body = JSON.parse(event.body || '{}');
    
    // POST - TAMBAH USER BARU (dengan multiple jabatan)
    if (method === 'POST') {
      const { email, nama, nip, role, kodePKM, indikatorAkses, jabatanIds } = body;
      if (!email || !nama || !role) return err('Email, nama, dan role diperlukan');
      
      // Validasi format email
      if (!email.includes('@') || email.split('@').length !== 2) return err('Format email tidak valid');
      
      // Cek duplikat email
      const exists = await pool.query('SELECT email FROM users WHERE LOWER(email)=LOWER($1)', [email]);
      if (exists.rows.length > 0) return err('Email sudah terdaftar di sistem');
      
      if (role === 'Super Admin') return err('Role Super Admin tidak dapat dibuat melalui sistem.');
      
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        // Insert user
        await client.query(
          `INSERT INTO users (email, nama, nip, role, kode_pkm, indikator_akses, aktif)
           VALUES ($1, $2, $3, $4, $5, $6, true)`,
          [email.trim().toLowerCase(), nama, nip||null, role, kodePKM||null, indikatorAkses||null]
        );
        
        // Insert jabatan untuk Pengelola Program (multiple)
        if (role === 'Pengelola Program' && jabatanIds && Array.isArray(jabatanIds) && jabatanIds.length > 0) {
          for (const jabatanId of jabatanIds) {
            await client.query(
              'INSERT INTO user_jabatan (user_email, jabatan_id) VALUES ($1, $2)',
              [email, jabatanId]
            );
          }
        }
        
        await client.query('COMMIT');
        return ok({ message: 'User berhasil ditambahkan' });
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    }
    
    // PUT - UPDATE USER (dengan multiple jabatan)
    if (method === 'PUT') {
      const { email, nama, nip, role, kodePKM, indikatorAkses, jabatanIds, aktif } = body;
      if (!email) return err('Email diperlukan');
      
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        // Update user
        await client.query(
          `UPDATE users SET nama=$1, nip=$2, role=$3, kode_pkm=$4, indikator_akses=$5, aktif=$6
           WHERE LOWER(email)=LOWER($7)`,
          [nama, nip||null, role, kodePKM||null, indikatorAkses||null, aktif!==false, email]
        );
        
        // Hapus semua jabatan lama
        await client.query('DELETE FROM user_jabatan WHERE user_email = $1', [email]);
        
        // Insert jabatan baru untuk Pengelola Program (multiple)
        if (role === 'Pengelola Program' && jabatanIds && Array.isArray(jabatanIds) && jabatanIds.length > 0) {
          for (const jabatanId of jabatanIds) {
            await client.query(
              'INSERT INTO user_jabatan (user_email, jabatan_id) VALUES ($1, $2)',
              [email, jabatanId]
            );
          }
        }
        
        await client.query('COMMIT');
        return ok({ message: 'User berhasil diupdate' });
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    }
    
    // DELETE - HAPUS USER
    if (method === 'DELETE') {
      const { email } = body;
      if (!email) return err('Email diperlukan');
      
      // Cek apakah user adalah Super Admin
      const check = await pool.query('SELECT role FROM users WHERE LOWER(email)=LOWER($1)', [email]);
      if (check.rows.length > 0 && check.rows[0].role === 'Super Admin') {
        return err('Super Admin tidak dapat dihapus', 403);
      }
      
      await pool.query('DELETE FROM users WHERE LOWER(email)=LOWER($1)', [email]);
      return ok({ message: 'User berhasil dihapus' });
    }
    
    return err('Method tidak diizinkan', 405);
  } catch(e) {
    console.error('Users error:', e);
    return err('Error: ' + e.message, 500);
  }
};
