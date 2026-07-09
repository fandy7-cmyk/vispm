// netlify/functions/track.js
// POST /api/track/:id  → publik, catat klik
import { getDb, jsonResponse, errorResponse } from './_db.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse({});
  if (event.httpMethod !== 'POST') return errorResponse('Method not allowed', 405);

  const sql = getDb();
  const id = event.path.replace(/.*\/track/, '').split('/').filter(Boolean)[0];
  if (!id || isNaN(id)) return errorResponse('ID tidak valid', 400);

  const ip = event.headers['x-forwarded-for']?.split(',')[0] || '';
  const ua = event.headers['user-agent'] || '';
  const ref = event.headers['referer'] || '';

  try {
    await sql`INSERT INTO klik_log (link_id, ip_address, user_agent, referer) VALUES (${parseInt(id)}, ${ip}, ${ua}, ${ref})`;
    const rows = await sql`SELECT url FROM links WHERE id = ${parseInt(id)} AND aktif = TRUE LIMIT 1`;
    if (!rows.length) return errorResponse('Link tidak ditemukan', 404);
    return jsonResponse({ url: rows[0].url });
  } catch (err) {
    console.error(err);
    return errorResponse('Server error');
  }
};
