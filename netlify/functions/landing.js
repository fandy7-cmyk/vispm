// netlify/functions/landing.js
// Endpoint publik untuk landing page SAPA — tanpa autentikasi
//
// GET /api/landing/shortlinks  → daftar shortlink aktif (yang punya slug_pendek)
// GET /api/landing/bundles     → daftar bundle aktif + jumlah item
// GET /api/landing/info        → daftar pengumuman/info publik aktif

import { getDb, jsonResponse, errorResponse } from './_db.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse({});
  if (event.httpMethod !== 'GET') return errorResponse('Method not allowed', 405);

  const sql = getDb();

  // ── Robust path parsing: works on local dev (:8888) & production ──
  // event.path bisa:
  //   /api/landing/shortlinks              (via netlify.toml redirect lokal)
  //   /.netlify/functions/landing/shortlinks (direct function call)
  //   /.netlify/functions/landing          (tanpa sub-path)
  const rawPath = event.path || '';
  const sub = rawPath
    .replace(/^.*\/landing\/?/, '')   // hapus semua prefix sampai /landing/
    .replace(/\/$/, '')
    .trim();

  try {

    // ── GET /api/landing/shortlinks ───────────────────────────
    if (sub === 'shortlinks') {
      const rows = await sql`
        SELECT
          id,
          judul,
          url,
          slug_pendek  AS slug,
          ikon,
          deskripsi,
          COALESCE((SELECT COUNT(*) FROM klik_log kl WHERE kl.link_id = links.id), 0)::INT AS total_klik
        FROM links
        WHERE aktif = true
          AND slug_pendek IS NOT NULL
          AND slug_pendek <> ''
        ORDER BY judul ASC
      `;
      return jsonResponse({ items: rows });
    }

    // ── GET /api/landing/bundles ──────────────────────────────
    if (sub === 'bundles') {
      const rows = await sql`
        SELECT
          b.id,
          b.judul,
          b.slug,
          b.deskripsi,
          COUNT(bi.id)::int AS jumlah_item
        FROM bundles b
        LEFT JOIN bundle_items bi ON bi.bundle_id = b.id
        WHERE b.aktif = true
        GROUP BY b.id, b.judul, b.slug, b.deskripsi
        ORDER BY b.judul ASC
      `;
      return jsonResponse({ items: rows });
    }

    // ── GET /api/landing/info ─────────────────────────────────
    if (sub === 'info') {
      let rows = [];
      try {
        rows = await sql`
          SELECT
            id,
            judul,
            isi,
            tipe,
            aksi,
            created_at
          FROM pengumuman
          WHERE aktif = true
            AND deleted_at IS NULL
          ORDER BY created_at DESC
          LIMIT 10
        `;
      } catch (e) {
        console.warn('[landing.js] tabel pengumuman belum ada, skip:', e.message);
        rows = [];
      }
      return jsonResponse({ items: rows });
    }

    // ── GET /api/landing/pegawai ──────────────────────────────
    if (sub === 'pegawai') {
      const rows = await sql`
        SELECT id, nama, jabatan, golongan, foto_url, urutan, parent_id
        FROM pegawai
        WHERE aktif = true
        ORDER BY urutan ASC NULLS LAST, nama ASC
      `;
      return jsonResponse({ pegawai: rows });
    }

    // ── GET /api/landing/dokumen ──────────────────────────────
    if (sub === 'dokumen') {
      const rows = await sql`
        SELECT id, judul, keterangan, kategori, file_url, created_at
        FROM dokumen_publik
        WHERE aktif = true
          AND deleted_at IS NULL
        ORDER BY created_at DESC
      `;
      return jsonResponse({ dokumen: rows });
    }

    // ── GET /api/landing/profil ───────────────────────────────
    if (sub === 'profil') {
      const rows = await sql`
        SELECT visi, tugas_fungsi, alamat, telepon, email, instagram, maps_embed, lat, lng
        FROM profil_instansi
        WHERE id = 1
        LIMIT 1
      `;
      return jsonResponse(rows[0] || {});
    }

    // ── Sub-path tidak dikenal ────────────────────────────────
    return errorResponse('Not found', 404);

  } catch (err) {
    console.error('[landing.js]', err);
    return errorResponse('Server error', 500);
  }
};