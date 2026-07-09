// netlify/functions/stats.js
import { getDb, jsonResponse, errorResponse } from './_db.js';
import { requireAuth } from './_auth.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse({});
  if (event.httpMethod !== 'GET') return errorResponse('Method not allowed', 405);
  const auth = requireAuth(event);
  if (!auth) return errorResponse('Unauthorized', 401);

  const sql = getDb();
  try {
    const isAdmin = !!auth.is_admin;

    const [{ total_klik }] = isAdmin
      ? await sql`SELECT COUNT(*)::INT AS total_klik FROM klik_log`
      : await sql`
          SELECT COUNT(*)::INT AS total_klik
          FROM klik_log kl JOIN links l ON l.id = kl.link_id
          WHERE l.created_by = ${auth.id}
        `;

    // NOTE: clicked_at bertipe timestamptz, tapi CURRENT_DATE/NOW() dievaluasi di UTC.
    // Server jam 06:15 WITA = 22:15 UTC hari sebelumnya, jadi CURRENT_DATE polos salah hari.
    // Dikonversi eksplisit ke WITA (Asia/Makassar) biar "hari ini" sesuai kalender lokal.
    const [{ klik_hari_ini }] = isAdmin
      ? await sql`
          SELECT COUNT(*)::INT AS klik_hari_ini
          FROM klik_log
          WHERE (clicked_at AT TIME ZONE 'Asia/Makassar')::DATE = (NOW() AT TIME ZONE 'Asia/Makassar')::DATE
        `
      : await sql`
          SELECT COUNT(*)::INT AS klik_hari_ini
          FROM klik_log kl JOIN links l ON l.id = kl.link_id
          WHERE (kl.clicked_at AT TIME ZONE 'Asia/Makassar')::DATE = (NOW() AT TIME ZONE 'Asia/Makassar')::DATE
            AND l.created_by = ${auth.id}
        `;

    const [{ total_links }] = isAdmin
      ? await sql`SELECT COUNT(*)::INT AS total_links FROM links WHERE aktif = TRUE`
      : await sql`SELECT COUNT(*)::INT AS total_links FROM links WHERE aktif = TRUE AND created_by = ${auth.id}`;

    const [{ total_users }] = await sql`SELECT COUNT(*)::INT AS total_users FROM users`;

    const top_links = isAdmin
      ? await sql`
          SELECT l.id, l.judul, l.url, l.ikon, l.warna_ikon, COUNT(kl.id)::INT AS total_klik
          FROM links l LEFT JOIN klik_log kl ON kl.link_id = l.id
          GROUP BY l.id ORDER BY total_klik DESC LIMIT 5
        `
      : await sql`
          SELECT l.id, l.judul, l.url, l.ikon, l.warna_ikon, COUNT(kl.id)::INT AS total_klik
          FROM links l LEFT JOIN klik_log kl ON kl.link_id = l.id
          WHERE l.created_by = ${auth.id}
          GROUP BY l.id ORDER BY total_klik DESC LIMIT 5
        `;

    // Grouping tanggal buat grafik 7 hari, dipaksa ke WITA.
    // PENTING: pakai generate_series + LEFT JOIN supaya SELALU dapat 7 baris
    // berurutan (hari tanpa klik tetap muncul dengan jumlah=0), bukan cuma
    // tanggal yang kebetulan ada datanya. Ini krusial karena frontend
    // (dashboard.js) mengandalkan array ini punya panjang & urutan tetap
    // (termasuk buat hitung "vs kemarin") — kalau hari ini belum ada klik,
    // GROUP BY biasa bakal skip baris hari ini dan bikin semua index geser.
    const klik_7hari = isAdmin
      ? await sql`
          SELECT gs::DATE::TEXT AS tanggal, COALESCE(c.jumlah, 0)::INT AS jumlah
          FROM generate_series(
            (NOW() AT TIME ZONE 'Asia/Makassar')::DATE - INTERVAL '6 days',
            (NOW() AT TIME ZONE 'Asia/Makassar')::DATE,
            INTERVAL '1 day'
          ) AS gs
          LEFT JOIN (
            SELECT (clicked_at AT TIME ZONE 'Asia/Makassar')::DATE AS tgl, COUNT(*)::INT AS jumlah
            FROM klik_log
            GROUP BY tgl
          ) c ON c.tgl = gs::DATE
          ORDER BY gs ASC
        `
      : await sql`
          SELECT gs::DATE::TEXT AS tanggal, COALESCE(c.jumlah, 0)::INT AS jumlah
          FROM generate_series(
            (NOW() AT TIME ZONE 'Asia/Makassar')::DATE - INTERVAL '6 days',
            (NOW() AT TIME ZONE 'Asia/Makassar')::DATE,
            INTERVAL '1 day'
          ) AS gs
          LEFT JOIN (
            SELECT (kl.clicked_at AT TIME ZONE 'Asia/Makassar')::DATE AS tgl, COUNT(*)::INT AS jumlah
            FROM klik_log kl JOIN links l ON l.id = kl.link_id
            WHERE l.created_by = ${auth.id}
            GROUP BY tgl
          ) c ON c.tgl = gs::DATE
          ORDER BY gs ASC
        `;

    return jsonResponse({ total_klik, klik_hari_ini, total_links, total_users, top_links, klik_7hari });
  } catch (err) {
    console.error(err);
    return errorResponse('Gagal mengambil statistik');
  }
};