// netlify/functions/audit-trail.js
// GET /api/audit-trail → admin only, paginated + filter
import { getDb, jsonResponse, errorResponse } from './_db.js';
import { requireAdmin } from './_auth.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse({});
  if (event.httpMethod !== 'GET') return errorResponse('Method not allowed', 405);

  const admin = requireAdmin(event);
  if (!admin) return errorResponse('Unauthorized', 401);

  const sql = getDb();
  const {
    page = 1, limit = 20, q = '',
    aksi: af = '', tanggal_dari: df = '', tanggal_sampai: ds = '',
  } = event.queryStringParameters || {};

  const offset    = (parseInt(page) - 1) * parseInt(limit);
  const search    = `%${q}%`;
  const aksiVal   = af || null;
  const dariVal   = df || null;
  const sampaiVal = ds || null;

  try {
    const rows = await sql`
      SELECT * FROM audit_log
      WHERE (nama ILIKE ${search} OR email ILIKE ${search} OR ip_address ILIKE ${search} OR aksi ILIKE ${search})
        AND (${aksiVal}::text IS NULL OR aksi = ${aksiVal}::text)
        AND (${dariVal}::text IS NULL OR created_at >= ${dariVal}::date)
        AND (${sampaiVal}::text IS NULL OR created_at < (${sampaiVal}::date + INTERVAL '1 day'))
      ORDER BY created_at DESC
      LIMIT ${parseInt(limit)} OFFSET ${offset}
    `;
    const countRows = await sql`
      SELECT COUNT(*)::INT AS total FROM audit_log
      WHERE (nama ILIKE ${search} OR email ILIKE ${search} OR ip_address ILIKE ${search} OR aksi ILIKE ${search})
        AND (${aksiVal}::text IS NULL OR aksi = ${aksiVal}::text)
        AND (${dariVal}::text IS NULL OR created_at >= ${dariVal}::date)
        AND (${sampaiVal}::text IS NULL OR created_at < (${sampaiVal}::date + INTERVAL '1 day'))
    `;
    return jsonResponse({ logs: rows, total: countRows[0].total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error('[GET /api/audit-trail]', err);
    return errorResponse('Gagal mengambil audit trail: ' + err.message);
  }
};
