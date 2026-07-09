// netlify/functions/settings.js
import { getDb, jsonResponse, errorResponse, parseBody } from './_db.js';
import { requireAdmin } from './_auth.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse({});
  const sql = getDb();

  if (event.httpMethod === 'GET') {
    // Auth required (bukan publik lagi)
    const auth = requireAdmin(event);
    if (!auth) return errorResponse('Unauthorized', 401);
    try {
      const rows = await sql`SELECT key, value FROM settings`;
      const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
      return jsonResponse({ settings });
    } catch (err) { return errorResponse('Gagal mengambil settings'); }
  }

  if (event.httpMethod === 'PUT') {
    const admin = requireAdmin(event);
    if (!admin) return errorResponse('Unauthorized', 401);
    const body = parseBody(event);
    try {
      for (const [key, value] of Object.entries(body)) {
        await sql`
          INSERT INTO settings (key, value, updated_at) VALUES (${key}, ${value}, NOW())
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
        `;
      }
      return jsonResponse({ ok: true });
    } catch (err) { return errorResponse('Gagal menyimpan settings'); }
  }

  return errorResponse('Not found', 404);
};
