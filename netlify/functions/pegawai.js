// netlify/functions/pegawai.js
// GET    /api/pegawai        → admin only (semua)
// POST   /api/pegawai        → admin only
// PUT    /api/pegawai/:id    → admin only
// DELETE /api/pegawai/:id    → admin only

import { getDb, jsonResponse, errorResponse, parseBody } from './_db.js';
import { requireAdmin } from './_auth.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse({});

  const sql = getDb();
  const rawPath = event.path.replace(/^.*\/pegawai\/?/, '') || '';
  const segments = rawPath.split('/').filter(Boolean);
  const id = segments[0] && !isNaN(segments[0]) ? parseInt(segments[0]) : null;

  // Semua endpoint butuh admin
  const admin = requireAdmin(event);
  if (!admin) return errorResponse('Unauthorized', 401);

  // ── GET /api/pegawai ──────────────────────────────────────
  if (event.httpMethod === 'GET' && !id) {
    try {
      const rows = await sql`
        SELECT p.*, par.nama AS parent_nama
        FROM pegawai p
        LEFT JOIN pegawai par ON par.id = p.parent_id AND par.deleted_at IS NULL
        WHERE p.deleted_at IS NULL
        ORDER BY p.urutan ASC NULLS LAST, p.nama ASC
      `;
      return jsonResponse({ pegawai: rows });
    } catch (err) {
      console.error('[GET /api/pegawai]', err);
      return errorResponse('Gagal mengambil data pegawai: ' + err.message);
    }
  }

  // ── POST /api/pegawai ─────────────────────────────────────
  if (event.httpMethod === 'POST' && !id) {
    const { nama, nip, jabatan, golongan, urutan, foto_url, aktif, parent_id } = parseBody(event);
    if (!nama)    return errorResponse('Nama wajib diisi', 400);
    if (!jabatan) return errorResponse('Jabatan wajib diisi', 400);
    try {
      const rows = await sql`
        INSERT INTO pegawai (nama, nip, jabatan, golongan, urutan, foto_url, aktif, parent_id)
        VALUES (
          ${nama.trim()},
          ${nip?.trim() || null},
          ${jabatan.trim()},
          ${golongan?.trim() || null},
          ${urutan ?? null},
          ${foto_url || null},
          ${aktif !== false},
          ${parent_id ? parseInt(parent_id) : null}
        )
        RETURNING *
      `;
      return jsonResponse({ pegawai: rows[0] }, 201);
    } catch (err) {
      console.error('[POST /api/pegawai]', err);
      return errorResponse('Gagal menyimpan pegawai: ' + err.message);
    }
  }

  // ── PUT /api/pegawai/:id ──────────────────────────────────
  if (event.httpMethod === 'PUT' && id) {
    const { nama, nip, jabatan, golongan, urutan, foto_url, aktif, parent_id } = parseBody(event);
    try {
      const rows = await sql`
        UPDATE pegawai SET
          nama      = COALESCE(${nama?.trim() ?? null}, nama),
          nip       = ${nip !== undefined ? (nip?.trim() || null) : sql`nip`},
          jabatan   = COALESCE(${jabatan?.trim() ?? null}, jabatan),
          golongan  = ${golongan !== undefined ? (golongan?.trim() || null) : sql`golongan`},
          urutan    = ${urutan !== undefined ? urutan : sql`urutan`},
          foto_url  = ${foto_url !== undefined ? (foto_url || null) : sql`foto_url`},
          aktif     = COALESCE(${aktif ?? null}, aktif),
          parent_id = ${parent_id !== undefined ? (parent_id ? parseInt(parent_id) : null) : sql`parent_id`},
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;
      if (!rows.length) return errorResponse('Pegawai tidak ditemukan', 404);
      return jsonResponse({ pegawai: rows[0] });
    } catch (err) {
      console.error('[PUT /api/pegawai/:id]', err);
      return errorResponse('Gagal mengupdate pegawai: ' + err.message);
    }
  }

  // ── DELETE /api/pegawai/:id ───────────────────────────────
  if (event.httpMethod === 'DELETE' && id) {
    try {
      const rows = await sql`
        UPDATE pegawai SET deleted_at = NOW()
        WHERE id = ${id} AND deleted_at IS NULL
        RETURNING id
      `;
      if (!rows.length) return errorResponse('Pegawai tidak ditemukan', 404);
      return jsonResponse({ ok: true });
    } catch (err) {
      console.error('[DELETE /api/pegawai/:id]', err);
      return errorResponse('Gagal menghapus pegawai: ' + err.message);
    }
  }

  return errorResponse('Not found', 404);
};