// netlify/functions/periode.js
//
// GET    /api/periode          → list semua periode (auth required)
// GET    /api/periode/aktif    → periode yang window-nya sedang terbuka (now BETWEEN open_at AND close_at)
// POST   /api/periode          → tambah periode (admin only)
// PUT    /api/periode/:id      → edit periode (admin only)
// DELETE /api/periode/:id      → hapus periode (admin only)
//
// Skema kolom:
//   bulan     INTEGER (1–12)
//   jenis     TEXT    — 'monev' | 'ikk' | 'spm'  (satu row per jenis, unique: tahun+bulan+jenis)
//   open_at   TIMESTAMPTZ   — waktu input mulai dibuka
//   close_at  TIMESTAMPTZ   — waktu input ditutup
//   (kolom aktif & triwulan tetap ada di DB untuk kompatibilitas, tidak dipakai)

import { getDb, jsonResponse, errorResponse, parseBody } from './_db.js';
import { requireAuth, requireAdmin } from './_auth.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse({});

  const sql = getDb();
  const rawPath = event.path.replace(/.*\/periode/, '') || '/';
  const segments = rawPath.split('/').filter(Boolean);
  const seg0 = segments[0] || null;
  const seg1 = segments[1] || null;

  const isAktif = seg0 === 'aktif';
  const numId   = seg0 && !isNaN(seg0) ? parseInt(seg0) : null;

  // ── GET /api/periode/aktif — semua periode yang window-nya terbuka sekarang ──
  if (event.httpMethod === 'GET' && isAktif) {
    try {
      const rows = await sql`
        SELECT * FROM periode
        WHERE open_at <= NOW() AND close_at >= NOW()
        ORDER BY tahun DESC, bulan DESC, jenis ASC
      `;
      return jsonResponse({ periode: rows });
    } catch (err) {
      return errorResponse('Gagal mengambil periode terbuka: ' + err.message);
    }
  }

  // ── GET /api/periode (semua, auth required) ──────────────────────────────
  if (event.httpMethod === 'GET' && !seg0) {
    const auth = requireAuth(event);
    if (!auth) return errorResponse('Unauthorized', 401);
    try {
      const rows = await sql`
        SELECT * FROM periode ORDER BY tahun DESC, bulan DESC, jenis ASC
      `;
      return jsonResponse({ periode: rows });
    } catch (err) {
      return errorResponse('Gagal mengambil daftar periode: ' + err.message);
    }
  }

  // ── Semua mutasi: admin only ─────────────────────────────────────────────
  const admin = requireAdmin(event);
  if (!admin) return errorResponse('Unauthorized', 401);

  // ── POST /api/periode ────────────────────────────────────────────────────
  if (event.httpMethod === 'POST' && !seg0) {
    const { tahun, bulan, jenis, label, open_at, close_at } = parseBody(event);

    if (!tahun || !bulan)        return errorResponse('Tahun dan bulan wajib diisi', 400);
    if (bulan < 1 || bulan > 12) return errorResponse('Bulan harus antara 1–12', 400);
    if (!jenis || !['monev','ikk','spm'].includes(jenis))
      return errorResponse('Jenis wajib diisi: "monev", "ikk", atau "spm"', 400);
    if (!open_at)                return errorResponse('Waktu buka (open_at) wajib diisi', 400);
    if (!close_at)               return errorResponse('Waktu tutup (close_at) wajib diisi', 400);
    if (new Date(open_at) >= new Date(close_at))
      return errorResponse('Waktu tutup harus setelah waktu buka', 400);

    const BULAN_LABEL = ['','Januari','Februari','Maret','April','Mei','Juni',
                          'Juli','Agustus','September','Oktober','November','Desember'];
    const jenisLabel  = jenis === 'monev' ? 'IKU' : jenis === 'ikk' ? 'IKK' : 'SPM';
    const autoLabel   = label?.trim() || `${BULAN_LABEL[parseInt(bulan)]} ${tahun} — ${jenisLabel}`;

    try {
      const rows = await sql`
        INSERT INTO periode (tahun, bulan, jenis, label, open_at, close_at)
        VALUES (
          ${parseInt(tahun)},
          ${parseInt(bulan)},
          ${jenis},
          ${autoLabel},
          ${open_at},
          ${close_at}
        )
        RETURNING *
      `;
      return jsonResponse({ periode: rows[0] }, 201);
    } catch (err) {
      if (err.message?.includes('unique'))
        return errorResponse('Periode tahun, bulan & jenis tersebut sudah ada', 409);
      return errorResponse('Gagal menyimpan periode: ' + err.message);
    }
  }

  // ── PUT /api/periode/:id ─────────────────────────────────────────────────
  if (event.httpMethod === 'PUT' && numId) {
    const { tahun, bulan, jenis, label, open_at, close_at } = parseBody(event);

    if (bulan !== undefined && (bulan < 1 || bulan > 12))
      return errorResponse('Bulan harus antara 1–12', 400);
    if (jenis !== undefined && !['monev','ikk','spm'].includes(jenis))
      return errorResponse('Jenis harus "monev", "ikk", atau "spm"', 400);
    if (open_at && close_at && new Date(open_at) >= new Date(close_at))
      return errorResponse('Waktu tutup harus setelah waktu buka', 400);

    try {
      const rows = await sql`
        UPDATE periode SET
          tahun      = COALESCE(${tahun ?? null}, tahun),
          bulan      = COALESCE(${bulan ?? null}, bulan),
          jenis      = COALESCE(${jenis ?? null}, jenis),
          label      = COALESCE(${label?.trim() ?? null}, label),
          open_at    = COALESCE(${open_at ?? null}, open_at),
          close_at   = COALESCE(${close_at ?? null}, close_at),
          updated_at = NOW()
        WHERE id = ${numId} RETURNING *
      `;
      if (!rows.length) return errorResponse('Periode tidak ditemukan', 404);
      return jsonResponse({ periode: rows[0] });
    } catch (err) {
      if (err.message?.includes('unique'))
        return errorResponse('Periode tahun, bulan & jenis tersebut sudah ada', 409);
      return errorResponse('Gagal mengupdate periode: ' + err.message);
    }
  }

  // ── DELETE /api/periode/:id ──────────────────────────────────────────────
  if (event.httpMethod === 'DELETE' && numId) {
    try {
      const check = await sql`SELECT id FROM periode WHERE id = ${numId} LIMIT 1`;
      if (!check.length) return errorResponse('Periode tidak ditemukan', 404);
      await sql`DELETE FROM periode WHERE id = ${numId}`;
      return jsonResponse({ ok: true });
    } catch (err) {
      return errorResponse('Gagal menghapus periode: ' + err.message);
    }
  }

  return errorResponse('Not found', 404);
};