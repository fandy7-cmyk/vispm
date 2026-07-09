// netlify/functions/bidang.js
// GET    /api/bidang          → publik (untuk dropdown)
// POST   /api/bidang          → admin only
// PUT    /api/bidang/:id      → admin only
// DELETE /api/bidang/:id      → admin only

import { getDb, jsonResponse, errorResponse, parseBody } from './_db.js';
import { requireAdmin, requireAuth } from './_auth.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse({});

  const sql = getDb();
  const rawPath = event.path.replace(/.*\/bidang/, '') || '/';
  const segments = rawPath.split('/').filter(Boolean);
  const id = segments[0] && !isNaN(segments[0]) ? parseInt(segments[0]) : null;

  // ── GET /api/bidang ── (semua yang login bisa baca, untuk dropdown)
  if (event.httpMethod === 'GET') {
    const auth = requireAuth(event);
    if (!auth) return errorResponse('Unauthorized', 401);
    try {
      const rows = await sql`
        SELECT * FROM bidang
        WHERE deleted_at IS NULL
        ORDER BY urutan ASC, nama ASC
      `;
      return jsonResponse({ bidang: rows });
    } catch (err) {
      return errorResponse('Gagal mengambil data bidang: ' + err.message);
    }
  }

  // Mutasi → admin only
  const admin = requireAdmin(event);
  if (!admin) return errorResponse('Unauthorized', 401);

  // ── POST /api/bidang ──
  if (event.httpMethod === 'POST' && !id) {
    const { nama, singkatan, urutan, aktif } = parseBody(event);
    if (!nama) return errorResponse('Nama bidang wajib diisi', 400);
    try {
      const rows = await sql`
        INSERT INTO bidang (nama, singkatan, urutan, aktif)
        VALUES (${nama.trim()}, ${singkatan?.trim() || null}, ${urutan ?? 0}, ${aktif !== false})
        RETURNING *
      `;
      return jsonResponse({ bidang: rows[0] }, 201);
    } catch (err) {
      return errorResponse('Gagal menyimpan bidang: ' + err.message);
    }
  }

  // ── PUT /api/bidang/:id ──
  if (event.httpMethod === 'PUT' && id) {
    const { nama, singkatan, urutan, aktif } = parseBody(event);
    try {
      const rows = await sql`
        UPDATE bidang SET
          nama       = COALESCE(${nama?.trim() ?? null}, nama),
          singkatan  = ${singkatan !== undefined ? (singkatan?.trim() || null) : sql`singkatan`},
          urutan     = COALESCE(${urutan ?? null}, urutan),
          aktif      = COALESCE(${aktif !== undefined ? aktif : null}, aktif),
          updated_at = NOW()
        WHERE id = ${id} RETURNING *
      `;
      if (!rows.length) return errorResponse('Bidang tidak ditemukan', 404);
      return jsonResponse({ bidang: rows[0] });
    } catch (err) {
      return errorResponse('Gagal mengupdate bidang: ' + err.message);
    }
  }

  // ── DELETE /api/bidang/:id ──
  if (event.httpMethod === 'DELETE' && id) {
    try {
      // Cek apakah ada user aktif yang menggunakan bidang ini
      const inUse = await sql`SELECT id FROM users WHERE bidang_id = ${id} LIMIT 1`;
      if (inUse.length) return errorResponse('Bidang masih digunakan oleh pengguna, tidak dapat dihapus', 409);
      const rows = await sql`
        UPDATE bidang SET deleted_at = NOW()
        WHERE id = ${id} AND deleted_at IS NULL
        RETURNING id
      `;
      if (!rows.length) return errorResponse('Bidang tidak ditemukan', 404);
      return jsonResponse({ ok: true });
    } catch (err) {
      return errorResponse('Gagal menghapus bidang: ' + err.message);
    }
  }

  return errorResponse('Not found', 404);
};