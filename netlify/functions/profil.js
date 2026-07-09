// netlify/functions/profil.js
// GET  /api/profil           → admin only — ambil profil instansi
// PUT  /api/profil           → admin only — simpan profil instansi
//
// (Endpoint publik /api/landing/* ditangani oleh netlify/functions/landing.js)

import { getDb, jsonResponse, errorResponse, parseBody } from './_db.js';
import { requireAdmin } from './_auth.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse({});

  const sql = getDb();

  // Pastikan kolom lat/lng tersedia (untuk DB lama yang belum punya kolom ini)
  try {
    await sql`
      ALTER TABLE profil_instansi
        ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION
    `;
  } catch (err) {
    console.error('[profil] migrate lat/lng', err);
  }

  // ════════════════════════════════════════════════════════
  // ADMIN: /api/profil
  // ════════════════════════════════════════════════════════
  const admin = requireAdmin(event);
  if (!admin) return errorResponse('Unauthorized', 401);

  // ── GET /api/profil ───────────────────────────────────────
  if (event.httpMethod === 'GET') {
    try {
      const rows = await sql`
        SELECT * FROM profil_instansi WHERE id = 1 LIMIT 1
      `;
      return jsonResponse(rows[0] || {});
    } catch (err) {
      console.error('[GET /api/profil]', err);
      return errorResponse('Gagal mengambil profil: ' + err.message);
    }
  }

  // ── PUT /api/profil ───────────────────────────────────────
  if (event.httpMethod === 'PUT') {
    const { visi, tugas_fungsi, alamat, telepon, email, instagram, maps_embed, lat, lng } = parseBody(event);
    try {
      const latVal = (lat !== undefined && lat !== null && lat !== '') ? Number(lat) : null;
      const lngVal = (lng !== undefined && lng !== null && lng !== '') ? Number(lng) : null;

      const rows = await sql`
        INSERT INTO profil_instansi (id, visi, tugas_fungsi, alamat, telepon, email, instagram, maps_embed, lat, lng, updated_at)
        VALUES (1,
          ${visi?.trim() || null},
          ${tugas_fungsi || null},
          ${alamat?.trim() || null},
          ${telepon?.trim() || null},
          ${email?.trim() || null},
          ${instagram?.trim() || null},
          ${maps_embed?.trim() || null},
          ${Number.isFinite(latVal) ? latVal : null},
          ${Number.isFinite(lngVal) ? lngVal : null},
          NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          visi         = EXCLUDED.visi,
          tugas_fungsi = EXCLUDED.tugas_fungsi,
          alamat       = EXCLUDED.alamat,
          telepon      = EXCLUDED.telepon,
          email        = EXCLUDED.email,
          instagram    = EXCLUDED.instagram,
          maps_embed   = EXCLUDED.maps_embed,
          lat          = EXCLUDED.lat,
          lng          = EXCLUDED.lng,
          updated_at   = NOW()
        RETURNING *
      `;
      return jsonResponse(rows[0]);
    } catch (err) {
      console.error('[PUT /api/profil]', err);
      return errorResponse('Gagal menyimpan profil: ' + err.message);
    }
  }

  return errorResponse('Not found', 404);
};