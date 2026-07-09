// netlify/functions/links.js
// GET    /api/links          → auth required (user dengan permission superlink.link)
// POST   /api/links          → auth required
// PUT    /api/links/:id      → auth required
// DELETE /api/links/:id      → auth required

import { getDb, jsonResponse, errorResponse, parseBody } from './_db.js';
import { requireAuth } from './_auth.js';

function canAccess(user) {
  if (!user) return false;
  if (user.is_admin) return true;
  const p = user.permissions || [];
  return p.includes('superlink.link') ||
         p.includes('superlink.shortlink') ||
         p.includes('superlink.bundle');
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse({});

  const sql = getDb();
  const rawPath = event.path.replace(/.*\/links/, '') || '/';
  const segments = rawPath.split('/').filter(Boolean);
  const id = segments[0] && !isNaN(segments[0]) ? parseInt(segments[0]) : null;

  // ── GET /api/links/check-slug?slug=xxx&excludeId=xxx (PUBLIK) ──
  // Real-time check ketersediaan slug_pendek, dipakai form Tambah/Edit Link
  if (event.httpMethod === 'GET' && segments[0] === 'check-slug') {
    const qs = event.queryStringParameters || {};
    const raw = (qs.slug || '').trim();
    const excludeId = qs.excludeId && !isNaN(qs.excludeId) ? parseInt(qs.excludeId) : null;
    const slugVal = raw.replace(/[^a-zA-Z0-9\-]/g, '');
    if (!slugVal) return jsonResponse({ available: null, slug: '' });
    try {
      const rows = excludeId
        ? await sql`SELECT id FROM links WHERE slug_pendek = ${slugVal} AND id != ${excludeId} LIMIT 1`
        : await sql`SELECT id FROM links WHERE slug_pendek = ${slugVal} LIMIT 1`;
      return jsonResponse({ available: rows.length === 0, slug: slugVal });
    } catch (err) {
      return errorResponse('Gagal cek slug: ' + err.message);
    }
  }

  // ── GET /api/links (PUBLIK untuk aktif, auth untuk semua) ──
  if (event.httpMethod === 'GET' && !id) {
    const auth = requireAuth(event);
    try {
      let rows;
      if (auth) {
        // Login: return link + total_klik
        // Admin lihat semua. User non-admin hanya lihat link yang dia buat sendiri
        // (link buatan admin/lama dengan created_by NULL tidak ditampilkan ke user).
        if (auth.is_admin) {
          rows = await sql`
            SELECT l.*, u.nama AS created_by_nama,
              COALESCE((SELECT COUNT(*) FROM klik_log kl WHERE kl.link_id = l.id), 0)::INT AS total_klik
            FROM links l
            LEFT JOIN users u ON u.id = l.created_by
            ORDER BY l.id ASC
          `;
        } else {
          rows = await sql`
            SELECT l.*, u.nama AS created_by_nama,
              COALESCE((SELECT COUNT(*) FROM klik_log kl WHERE kl.link_id = l.id), 0)::INT AS total_klik
            FROM links l
            LEFT JOIN users u ON u.id = l.created_by
            WHERE l.created_by = ${auth.id}
            ORDER BY l.id ASC
          `;
        }
      } else {
        // Publik: hanya yang aktif, tanpa stats klik
        rows = await sql`
          SELECT id, judul, url, deskripsi, ikon, warna_ikon, kategori_id, slug_pendek
          FROM links
          WHERE aktif = TRUE
          ORDER BY id ASC
        `;
      }
      return jsonResponse({ links: rows });
    } catch (err) {
      console.error('[GET /api/links]', err);
      return errorResponse('Gagal mengambil data links: ' + err.message);
    }
  }

  // Auth required untuk POST/PUT/DELETE
  const auth = requireAuth(event);
  if (!auth) return errorResponse('Unauthorized', 401);

  // Ambil permissions untuk non-admin
  let user = auth;
  if (!auth.is_admin) {
    try {
      const sql2 = getDb();
      const perms = await sql2`SELECT menu_key FROM user_permissions WHERE user_id = ${auth.id}`;
      user = { ...auth, permissions: perms.map(p => p.menu_key) };
    } catch { user = { ...auth, permissions: [] }; }
  }

  if (!canAccess(user)) return errorResponse('Akses ditolak', 403);

  // ── POST /api/links ────────────────────────────────────────
  if (event.httpMethod === 'POST' && !id) {
    const body = parseBody(event);
    const { judul, url, deskripsi, ikon, warna_ikon, aktif, slug_pendek } = body;
    if (!judul || !url) return errorResponse('Judul dan URL wajib diisi', 400);

    const slugVal = slug_pendek
      ? slug_pendek.replace(/[^a-zA-Z0-9\-]/g, '').trim() || null
      : null;

    if (slugVal) {
      const exist = await sql`SELECT id FROM links WHERE slug_pendek = ${slugVal} LIMIT 1`;
      if (exist.length) return errorResponse('Slug pendek sudah digunakan', 409);
    }

    try {
      const rows = await sql`
        INSERT INTO links (judul, url, deskripsi, ikon, warna_ikon, aktif, slug_pendek, created_by)
        VALUES (${judul}, ${url}, ${deskripsi || null}, ${ikon || '🔗'}, ${warna_ikon || '#0077B6'},
                ${aktif !== false}, ${slugVal}, ${auth.id})
        RETURNING *
      `;
      return jsonResponse({ link: rows[0] }, 201);
    } catch (err) {
      return errorResponse('Gagal menyimpan link: ' + err.message);
    }
  }

  // ── PUT /api/links/:id ─────────────────────────────────────
  if (event.httpMethod === 'PUT' && id) {
    if (!user.is_admin) {
      const owner = await sql`SELECT created_by FROM links WHERE id = ${id} LIMIT 1`;
      if (!owner.length || owner[0].created_by !== user.id) return errorResponse('Akses ditolak', 403);
    }
    const body = parseBody(event);
    const { judul, url, deskripsi, ikon, warna_ikon, aktif, slug_pendek } = body;

    const slugVal = slug_pendek !== undefined
      ? (slug_pendek ? slug_pendek.replace(/[^a-zA-Z0-9\-]/g, '').trim() || null : null)
      : undefined;

    if (slugVal) {
      const exist = await sql`SELECT id FROM links WHERE slug_pendek = ${slugVal} AND id != ${id} LIMIT 1`;
      if (exist.length) return errorResponse('Slug pendek sudah digunakan', 409);
    }

    try {
      const rows = await sql`
        UPDATE links SET
          judul       = COALESCE(${judul ?? null}, judul),
          url         = COALESCE(${url ?? null}, url),
          deskripsi   = ${deskripsi !== undefined ? deskripsi : sql`deskripsi`},
          ikon        = COALESCE(${ikon ?? null}, ikon),
          warna_ikon  = COALESCE(${warna_ikon ?? null}, warna_ikon),
          aktif       = COALESCE(${aktif ?? null}, aktif),
          slug_pendek = ${slugVal !== undefined ? slugVal : sql`slug_pendek`},
          updated_at  = NOW()
        WHERE id = ${id}
        RETURNING *
      `;
      if (!rows.length) return errorResponse('Link tidak ditemukan', 404);
      return jsonResponse({ link: rows[0] });
    } catch (err) {
      return errorResponse('Gagal mengupdate link: ' + err.message);
    }
  }

  // ── DELETE /api/links/:id ──────────────────────────────────
  if (event.httpMethod === 'DELETE' && id) {
    if (!user.is_admin) {
      const owner = await sql`SELECT created_by FROM links WHERE id = ${id} LIMIT 1`;
      if (!owner.length || owner[0].created_by !== user.id) return errorResponse('Akses ditolak', 403);
    }
    try {
      await sql`DELETE FROM links WHERE id = ${id}`;
      return jsonResponse({ ok: true });
    } catch (err) {
      return errorResponse('Gagal menghapus link: ' + err.message);
    }
  }

  return errorResponse('Not found', 404);
};