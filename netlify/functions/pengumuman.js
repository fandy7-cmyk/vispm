const { getPool, ok, err, cors } = require('./db');

let _migrated = false;

async function migrate(pool) {
  if (_migrated) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pengumuman_sistem (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      judul         VARCHAR(200)  NOT NULL,
      isi           TEXT          NOT NULL,
      tipe          VARCHAR(20)   NOT NULL DEFAULT 'info',
      aktif         BOOLEAN       NOT NULL DEFAULT true,
      tanggal_mulai DATE          NOT NULL,
      tanggal_selesai DATE        NOT NULL,
      dibuat_oleh   VARCHAR(200),
      dibuat_pada   TIMESTAMPTZ   DEFAULT NOW(),
      diperbarui_pada TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  _migrated = true;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();

  const pool = getPool();

  try {
    await migrate(pool);

    // ── GET — ambil semua atau hanya yang aktif ──
    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {};
      let query, values;

      if (params.aktif === 'true') {
        // Hanya yang aktif=true (dipakai popup login)
        query  = `SELECT * FROM pengumuman_sistem WHERE aktif = true ORDER BY dibuat_pada DESC`;
        values = [];
      } else {
        // Semua (dipakai halaman kelola Admin)
        query  = `SELECT * FROM pengumuman_sistem ORDER BY dibuat_pada DESC`;
        values = [];
      }

      const result = await pool.query(query, values);
      return ok(result.rows.map(_fmt));
    }

    // ── POST — buat baru ──
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { judul, isi, tipe, aktif, tanggal_mulai, tanggal_selesai, dibuat_oleh } = body;

      if (!judul || !judul.trim())           return err('Judul wajib diisi');
      if (!isi   || !isi.trim())             return err('Isi pengumuman wajib diisi');
      if (!tanggal_mulai)                    return err('Tanggal mulai wajib diisi');
      if (!tanggal_selesai)                  return err('Tanggal selesai wajib diisi');
      if (tanggal_selesai < tanggal_mulai)   return err('Tanggal selesai tidak boleh sebelum tanggal mulai');

      const result = await pool.query(
        `INSERT INTO pengumuman_sistem
          (judul, isi, tipe, aktif, tanggal_mulai, tanggal_selesai, dibuat_oleh)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          judul.trim(),
          isi.trim(),
          tipe || 'info',
          aktif !== false,
          tanggal_mulai,
          tanggal_selesai,
          dibuat_oleh || null,
        ]
      );
      return ok(_fmt(result.rows[0]));
    }

    // ── PUT — update ──
    if (event.httpMethod === 'PUT') {
      const body = JSON.parse(event.body || '{}');
      const { id, judul, isi, tipe, aktif, tanggal_mulai, tanggal_selesai } = body;

      if (!id)                               return err('ID pengumuman diperlukan');
      if (!judul || !judul.trim())           return err('Judul wajib diisi');
      if (!isi   || !isi.trim())             return err('Isi pengumuman wajib diisi');
      if (!tanggal_mulai)                    return err('Tanggal mulai wajib diisi');
      if (!tanggal_selesai)                  return err('Tanggal selesai wajib diisi');
      if (tanggal_selesai < tanggal_mulai)   return err('Tanggal selesai tidak boleh sebelum tanggal mulai');

      const result = await pool.query(
        `UPDATE pengumuman_sistem
         SET judul=$1, isi=$2, tipe=$3, aktif=$4,
             tanggal_mulai=$5, tanggal_selesai=$6,
             diperbarui_pada=NOW()
         WHERE id=$7
         RETURNING *`,
        [
          judul.trim(),
          isi.trim(),
          tipe || 'info',
          aktif !== false,
          tanggal_mulai,
          tanggal_selesai,
          id,
        ]
      );
      if (!result.rows.length) return err('Pengumuman tidak ditemukan', 404);
      return ok(_fmt(result.rows[0]));
    }

    // ── DELETE ──
    if (event.httpMethod === 'DELETE') {
      const body = JSON.parse(event.body || '{}');
      const { id } = body;
      if (!id) return err('ID pengumuman diperlukan');

      const result = await pool.query(
        `DELETE FROM pengumuman_sistem WHERE id=$1 RETURNING id`,
        [id]
      );
      if (!result.rows.length) return err('Pengumuman tidak ditemukan', 404);
      return ok({ deleted: true, id });
    }

    return err('Method tidak diizinkan', 405);

  } catch (e) {
    console.error('Pengumuman error:', e);
    return err('Error: ' + e.message, 500);
  }
};

/** Format row DB → objek frontend */
function _fmt(r) {
  return {
    id:               r.id,
    judul:            r.judul,
    isi:              r.isi,
    tipe:             r.tipe,
    aktif:            r.aktif,
    tanggal_mulai:    _fmtDate(r.tanggal_mulai),
    tanggal_selesai:  _fmtDate(r.tanggal_selesai),
    dibuat_oleh:      r.dibuat_oleh,
    dibuat_pada:      r.dibuat_pada,
  };
}

/**
 * Konversi nilai tanggal dari PostgreSQL ke format YYYY-MM-DD.
 * Neon/pg mengembalikan kolom DATE sebagai objek Date JS, bukan string —
 * sehingga String(dateObj).slice(0,10) menghasilkan "Thu Apr 23" bukan "2026-04-23".
 */
function _fmtDate(val) {
  if (!val) return null;
  // Sudah string ISO → ambil 10 karakter pertama
  if (typeof val === 'string') {
    // Coba cocokkan YYYY-MM-DD di mana saja dalam string
    const m = val.match(/(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : val.slice(0, 10);
  }
  // Objek Date dari driver pg/Neon
  if (val instanceof Date) {
    const y  = val.getUTCFullYear();
    const mo = String(val.getUTCMonth() + 1).padStart(2, '0');
    const d  = String(val.getUTCDate()).padStart(2, '0');
    return `${y}-${mo}-${d}`;
  }
  return null;
}