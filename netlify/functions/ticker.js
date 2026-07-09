// netlify/functions/ticker.js
// GET    /api/ticker        → publik (aktif saja)
// POST   /api/ticker        → admin only
// PUT    /api/ticker/:id    → admin only (toggle aktif / edit teks)
// DELETE /api/ticker/:id    → admin only

import { getDb, jsonResponse, errorResponse, parseBody } from './_db.js';
import { requireAuth } from './_auth.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse({});

  const sql = getDb();

  const rawPath = event.path.replace(/^.*\/ticker\/?/, '') || '';
  const segments = rawPath.split('/').filter(Boolean);
  const id = segments[0] && !isNaN(segments[0]) ? parseInt(segments[0]) : null;

  // ── GET /api/ticker ─────────────────────────────────────────
  if (event.httpMethod === 'GET' && !id) {
    const auth = requireAuth(event);
    try {
      let rows;
      if (auth && auth.is_admin) {
        rows = await sql`SELECT * FROM ticker ORDER BY urutan ASC, created_at DESC`;
      } else {
        rows = await sql`
          SELECT id, teks, urutan, warna_teks, warna_bg FROM ticker
          WHERE aktif = true
          ORDER BY urutan ASC, created_at DESC
        `;
      }
      return jsonResponse({ ticker: rows });
    } catch (err) {
      return errorResponse('Gagal mengambil ticker: ' + err.message);
    }
  }

  // Auth + admin required untuk POST/PUT/DELETE
  const auth = requireAuth(event);
  if (!auth) return errorResponse('Unauthorized', 401);
  if (!auth.is_admin) return errorResponse('Akses ditolak - hanya admin', 403);

  // ── POST /api/ticker ─────────────────────────────────────────
  if (event.httpMethod === 'POST' && !id) {
    const { teks, urutan, aktif, warna_teks, warna_bg } = parseBody(event);
    if (!teks) return errorResponse('Teks wajib diisi', 400);
    try {
      const rows = await sql`
        INSERT INTO ticker (teks, urutan, aktif, warna_teks, warna_bg)
        VALUES (${teks.trim()}, ${urutan ?? 0}, ${aktif !== false}, ${warna_teks || '#1e293b'}, ${warna_bg || null})
        RETURNING *
      `;
      return jsonResponse({ ticker: rows[0] }, 201);
    } catch (err) {
      return errorResponse('Gagal menyimpan ticker: ' + err.message);
    }
  }

  // ── PUT /api/ticker/:id ──────────────────────────────────────
  if (event.httpMethod === 'PUT' && id) {
    const { teks, urutan, aktif, warna_teks, warna_bg } = parseBody(event);
    const warnaBgVal = warna_bg === null ? null : (warna_bg ?? undefined);
    try {
      const rows = await sql`
        UPDATE ticker SET
          teks       = COALESCE(${teks ?? null}, teks),
          urutan     = COALESCE(${urutan ?? null}, urutan),
          aktif      = COALESCE(${aktif ?? null}, aktif),
          warna_teks = COALESCE(${warna_teks ?? null}, warna_teks),
          warna_bg   = CASE WHEN ${warnaBgVal !== undefined} THEN ${warnaBgVal ?? null} ELSE warna_bg END,
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;
      if (!rows.length) return errorResponse('Ticker tidak ditemukan', 404);
      return jsonResponse({ ticker: rows[0] });
    } catch (err) {
      return errorResponse('Gagal mengupdate ticker: ' + err.message);
    }
  }

  // ── DELETE /api/ticker/:id ───────────────────────────────────
  if (event.httpMethod === 'DELETE' && id) {
    try {
      await sql`DELETE FROM ticker WHERE id = ${id}`;
      return jsonResponse({ ok: true });
    } catch (err) {
      return errorResponse('Gagal menghapus ticker: ' + err.message);
    }
  }

  return errorResponse('Not found', 404);
};