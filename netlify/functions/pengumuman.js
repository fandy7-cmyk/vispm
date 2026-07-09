// netlify/functions/pengumuman.js
// GET    /api/pengumuman        → publik (aktif saja), auth → semua
// POST   /api/pengumuman        → admin only
// PUT    /api/pengumuman/:id    → admin only
// DELETE /api/pengumuman/:id    → admin only

import { getDb, jsonResponse, errorResponse, parseBody } from './_db.js';
import { requireAuth } from './_auth.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse({});

  const sql = getDb();

  // Parse id dari path
  const rawPath = event.path.replace(/^.*\/pengumuman\/?/, '') || '';
  const segments = rawPath.split('/').filter(Boolean);
  const id = segments[0] && !isNaN(segments[0]) ? parseInt(segments[0]) : null;

  // ── GET /api/pengumuman ─────────────────────────────────────
  if (event.httpMethod === 'GET' && !id) {
    const auth = requireAuth(event);
    try {
      let rows;
      if (auth && auth.is_admin) {
        // Admin: semua pengumuman yang belum dihapus
        rows = await sql`
          SELECT * FROM pengumuman
          WHERE deleted_at IS NULL
          ORDER BY created_at DESC
        `;
      } else {
        // Publik: hanya yang aktif & belum dihapus, max 10
        rows = await sql`
          SELECT id, judul, isi, tipe, created_at
          FROM pengumuman
          WHERE aktif = true AND deleted_at IS NULL
          ORDER BY created_at DESC
          LIMIT 10
        `;
      }
      return jsonResponse({ pengumuman: rows });
    } catch (err) {
      console.error('[GET /api/pengumuman]', err);
      return errorResponse('Gagal mengambil pengumuman: ' + err.message);
    }
  }

  // Auth + admin required untuk POST/PUT/DELETE
  const auth = requireAuth(event);
  if (!auth) return errorResponse('Unauthorized', 401);
  if (!auth.is_admin) return errorResponse('Akses ditolak - hanya admin', 403);

  // ── POST /api/pengumuman ────────────────────────────────────
  if (event.httpMethod === 'POST' && !id) {
    const body = parseBody(event);
    const { judul, isi, tipe, aktif, aksi } = body;
    if (!judul || !isi) return errorResponse('Judul dan isi wajib diisi', 400);
    const tipeVal = ['penting', 'info', 'biasa'].includes(tipe) ? tipe : 'info';
    const aksiVal = Array.isArray(aksi) ? JSON.stringify(aksi) : null;
    try {
      const rows = await sql`
        INSERT INTO pengumuman (judul, isi, tipe, aktif, aksi)
        VALUES (${judul}, ${isi}, ${tipeVal}, ${aktif !== false}, ${aksiVal}::jsonb)
        RETURNING *
      `;
      return jsonResponse({ pengumuman: rows[0] }, 201);
    } catch (err) {
      return errorResponse('Gagal menyimpan pengumuman: ' + err.message);
    }
  }

  // ── PUT /api/pengumuman/:id ─────────────────────────────────
  if (event.httpMethod === 'PUT' && id) {
    const body = parseBody(event);
    const { judul, isi, tipe, aktif, aksi } = body;
    const tipeVal = tipe && ['penting', 'info', 'biasa'].includes(tipe) ? tipe : null;
    const aksiVal = Array.isArray(aksi) ? JSON.stringify(aksi) : aksi === null ? null : undefined;
    try {
      const rows = await sql`
        UPDATE pengumuman SET
          judul      = COALESCE(${judul ?? null}, judul),
          isi        = COALESCE(${isi ?? null}, isi),
          tipe       = COALESCE(${tipeVal}, tipe),
          aktif      = COALESCE(${aktif ?? null}, aktif),
          aksi       = CASE WHEN ${aksiVal !== undefined} THEN ${aksiVal ?? null}::jsonb ELSE aksi END,
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;
      if (!rows.length) return errorResponse('Pengumuman tidak ditemukan', 404);
      return jsonResponse({ pengumuman: rows[0] });
    } catch (err) {
      return errorResponse('Gagal mengupdate pengumuman: ' + err.message);
    }
  }

  // ── DELETE /api/pengumuman/:id ──────────────────────────────
  if (event.httpMethod === 'DELETE' && id) {
    try {
      const rows = await sql`
        UPDATE pengumuman SET deleted_at = NOW()
        WHERE id = ${id} AND deleted_at IS NULL
        RETURNING id
      `;
      if (!rows.length) return errorResponse('Pengumuman tidak ditemukan', 404);
      return jsonResponse({ ok: true });
    } catch (err) {
      return errorResponse('Gagal menghapus pengumuman: ' + err.message);
    }
  }

  return errorResponse('Not found', 404);
};