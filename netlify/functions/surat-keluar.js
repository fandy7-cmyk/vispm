// netlify/functions/surat-keluar.js
import { getDb, jsonResponse, errorResponse, parseBody } from './_db.js';
import { requireAuth } from './_auth.js';
import { logAudit } from './_audit.js';

async function checkAccess(auth, sql) {
  if (auth.is_admin) return true;
  const perms = await sql`SELECT menu_key FROM user_permissions WHERE user_id = ${auth.id} AND menu_key = 'surat.keluar' LIMIT 1`;
  return perms.length > 0;
}

// User dengan menu_key 'surat.keluar.full' setara admin khusus surat keluar:
// boleh edit/hapus surat siapapun, bukan cuma miliknya sendiri.
async function checkFullAccess(auth, sql) {
  if (auth.is_admin) return true;
  const perms = await sql`SELECT menu_key FROM user_permissions WHERE user_id = ${auth.id} AND menu_key = 'surat.keluar.full' LIMIT 1`;
  return perms.length > 0;
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse({});

  const auth = requireAuth(event);
  if (!auth) return errorResponse('Unauthorized', 401);

  const sql = getDb();
  const ok = await checkAccess(auth, sql);
  if (!ok) return errorResponse('Akses ditolak', 403);

  const rawPath = event.path.replace(/.*\/surat-keluar/, '') || '/';
  const segments = rawPath.split('/').filter(Boolean);
  const seg0 = segments[0] || null;
  const numId = seg0 && !isNaN(seg0) ? parseInt(seg0) : null;
  const isStats = seg0 === 'stats';

  if (event.httpMethod === 'GET' && isStats) {
    try {
      const isAdmin = !!auth.is_admin;
      const isFull  = await checkFullAccess(auth, sql);
      const [{ total }] = await sql`SELECT COUNT(*)::INT AS total FROM surat_keluar WHERE (${isAdmin} = TRUE OR ${isFull} = TRUE OR pegawai = ${auth.nama})`;
      const [{ bulan_ini }] = await sql`SELECT COUNT(*)::INT AS bulan_ini FROM surat_keluar WHERE DATE_TRUNC('month', tanggal_surat) = DATE_TRUNC('month', CURRENT_DATE) AND (${isAdmin} = TRUE OR ${isFull} = TRUE OR pegawai = ${auth.nama})`;
      const [{ tahun_ini }] = await sql`SELECT COUNT(*)::INT AS tahun_ini FROM surat_keluar WHERE DATE_TRUNC('year', tanggal_surat) = DATE_TRUNC('year', CURRENT_DATE) AND (${isAdmin} = TRUE OR ${isFull} = TRUE OR pegawai = ${auth.nama})`;
      return jsonResponse({ total, bulan_ini, tahun_ini });
    } catch (err) { return errorResponse('Gagal mengambil statistik'); }
  }

  if (event.httpMethod === 'GET' && !numId) {
    const { page = 1, limit = 20, q = '', pegawai: pf = '', tahun: tf = '', bulan: bf = '', sort = '' } = event.queryStringParameters || {};
    const offset   = (parseInt(page) - 1) * parseInt(limit);
    const search   = `%${q}%`;
    const pgSearch = pf ? pf : null;
    const tahunVal = tf ? tf : null;
    const bulanVal = bf ? parseInt(bf) : null;
    // sort=terbaru → dipakai panel "Surat Keluar Terbaru" di dashboard, urut
    // berdasarkan input terbaru (created_at/id DESC). Default tetap ASC
    // berdasarkan tanggal_surat, mengikuti urutan buku agenda (lama → baru).
    const isTerbaru = sort === 'terbaru';
    try {
      const isAdmin = !!auth.is_admin;
      const isFull  = await checkFullAccess(auth, sql);
      const rows = isTerbaru ? await sql`
        SELECT * FROM surat_keluar
        WHERE (perihal ILIKE ${search} OR tujuan_surat ILIKE ${search} OR no_agenda ILIKE ${search} OR no_surat ILIKE ${search} OR COALESCE(pegawai,'') ILIKE ${search})
          AND (${pgSearch}::text IS NULL OR pegawai = ${pgSearch}::text)
          AND (${tahunVal}::text IS NULL OR EXTRACT(YEAR FROM tanggal_surat)::text = ${tahunVal}::text)
          AND (${bulanVal}::int IS NULL OR EXTRACT(MONTH FROM tanggal_surat)::int = ${bulanVal}::int)
          AND (${isAdmin} = TRUE OR ${isFull} = TRUE OR pegawai = ${auth.nama})
        ORDER BY created_at DESC NULLS LAST, id DESC LIMIT ${parseInt(limit)} OFFSET ${offset}
      ` : await sql`
        SELECT * FROM surat_keluar
        WHERE (perihal ILIKE ${search} OR tujuan_surat ILIKE ${search} OR no_agenda ILIKE ${search} OR no_surat ILIKE ${search} OR COALESCE(pegawai,'') ILIKE ${search})
          AND (${pgSearch}::text IS NULL OR pegawai = ${pgSearch}::text)
          AND (${tahunVal}::text IS NULL OR EXTRACT(YEAR FROM tanggal_surat)::text = ${tahunVal}::text)
          AND (${bulanVal}::int IS NULL OR EXTRACT(MONTH FROM tanggal_surat)::int = ${bulanVal}::int)
          AND (${isAdmin} = TRUE OR ${isFull} = TRUE OR pegawai = ${auth.nama})
        ORDER BY tanggal_surat ASC, id ASC LIMIT ${parseInt(limit)} OFFSET ${offset}
      `;
      const countRows = await sql`
        SELECT COUNT(*)::INT AS total FROM surat_keluar
        WHERE (perihal ILIKE ${search} OR tujuan_surat ILIKE ${search} OR no_agenda ILIKE ${search} OR no_surat ILIKE ${search} OR COALESCE(pegawai,'') ILIKE ${search})
          AND (${pgSearch}::text IS NULL OR pegawai = ${pgSearch}::text)
          AND (${tahunVal}::text IS NULL OR EXTRACT(YEAR FROM tanggal_surat)::text = ${tahunVal}::text)
          AND (${bulanVal}::int IS NULL OR EXTRACT(MONTH FROM tanggal_surat)::int = ${bulanVal}::int)
          AND (${isAdmin} = TRUE OR ${isFull} = TRUE OR pegawai = ${auth.nama})
      `;
      return jsonResponse({ surat: rows, total: countRows[0].total, page: parseInt(page), limit: parseInt(limit) });
    } catch (err) { return errorResponse('Gagal mengambil data surat keluar: ' + err.message); }
  }

  // ── POST — siapapun yang punya akses menu surat.keluar boleh input, bebas assign pegawai ──
  // No. agenda di-generate OTOMATIS oleh sistem (reset ke 1 tiap ganti tahun, berdasarkan tahun tanggal_surat),
  // supaya nggak bentrok antar user yang input manual.
  if (event.httpMethod === 'POST' && !numId) {
    const { no_surat, tanggal_surat, tujuan_surat, perihal, pegawai, file_url, file_name, keterangan } = parseBody(event);
    if (!tujuan_surat || !perihal) return errorResponse('Tujuan surat dan perihal wajib diisi', 400);
    try {
      const refDate = tanggal_surat ? new Date(tanggal_surat) : new Date();
      const tahunAgenda = refDate.getFullYear();
      const [{ next_no }] = await sql`
        SELECT COALESCE(MAX(no_agenda::int), 0) + 1 AS next_no
        FROM surat_keluar
        WHERE no_agenda ~ '^[0-9]+$'
          AND EXTRACT(YEAR FROM COALESCE(tanggal_surat, created_at)) = ${tahunAgenda}
      `;
      const no_agenda = String(next_no);
      const rows = await sql`
        INSERT INTO surat_keluar (no_agenda, no_surat, tanggal_surat, tujuan_surat, perihal, pegawai, file_url, file_name, keterangan, created_by)
        VALUES (${no_agenda}, ${no_surat||null}, ${tanggal_surat||null}, ${tujuan_surat}, ${perihal}, ${pegawai||null}, ${file_url||null}, ${file_name||null}, ${keterangan||null}, ${auth.id})
        RETURNING *
      `;
      await logAudit(sql, event, {
        user_id: auth.id, nama: auth.nama, email: auth.email,
        aksi: 'create', entitas: 'surat_keluar', entitas_id: rows[0].id,
        detail: { no_agenda, perihal, tujuan_surat }
      });
      return jsonResponse({ surat: rows[0] }, 201);
    } catch (err) { return errorResponse('Gagal menyimpan surat keluar'); }
  }

  // ── PUT — admin/full-access bebas; user biasa hanya boleh edit surat yang dia input sendiri ──
  if (event.httpMethod === 'PUT' && numId) {
    const fullAccess = await checkFullAccess(auth, sql);
    if (!fullAccess) {
      const owner = await sql`SELECT created_by FROM surat_keluar WHERE id = ${numId} LIMIT 1`;
      if (!owner.length || owner[0].created_by !== auth.id) return errorResponse('Akses ditolak', 403);
    }
    const body = parseBody(event);
    const { no_surat, tanggal_surat, tujuan_surat, perihal, pegawai, file_url, file_name, keterangan } = body;
    try {
      const rows = await sql`
        UPDATE surat_keluar SET
          no_surat = ${no_surat !== undefined ? no_surat : sql`no_surat`},
          tanggal_surat = COALESCE(${tanggal_surat??null}, tanggal_surat),
          tujuan_surat = COALESCE(${tujuan_surat??null}, tujuan_surat),
          perihal = COALESCE(${perihal??null}, perihal),
          pegawai = ${pegawai !== undefined ? pegawai : sql`pegawai`},
          file_url = ${file_url !== undefined ? file_url : sql`file_url`},
          file_name = ${file_name !== undefined ? file_name : sql`file_name`},
          keterangan = ${keterangan !== undefined ? keterangan : sql`keterangan`},
          updated_at = NOW()
        WHERE id = ${numId} RETURNING *
      `;
      if (!rows.length) return errorResponse('Surat tidak ditemukan', 404);
      await logAudit(sql, event, {
        user_id: auth.id, nama: auth.nama, email: auth.email,
        aksi: 'update', entitas: 'surat_keluar', entitas_id: numId,
        detail: { no_agenda: rows[0].no_agenda, perihal: rows[0].perihal }
      });
      return jsonResponse({ surat: rows[0] });
    } catch (err) { return errorResponse('Gagal mengupdate surat keluar'); }
  }

  // ── DELETE — admin/full-access bebas; user biasa hanya boleh hapus surat yang dia input sendiri ──
  if (event.httpMethod === 'DELETE' && numId) {
    const fullAccess = await checkFullAccess(auth, sql);
    if (!fullAccess) {
      const owner = await sql`SELECT created_by FROM surat_keluar WHERE id = ${numId} LIMIT 1`;
      if (!owner.length || owner[0].created_by !== auth.id) return errorResponse('Akses ditolak', 403);
    }
    try {
      const before = await sql`SELECT no_agenda, perihal, tujuan_surat FROM surat_keluar WHERE id = ${numId}`;
      await sql`DELETE FROM surat_keluar WHERE id = ${numId}`;
      await logAudit(sql, event, {
        user_id: auth.id, nama: auth.nama, email: auth.email,
        aksi: 'delete', entitas: 'surat_keluar', entitas_id: numId,
        detail: before[0] || null
      });
      return jsonResponse({ ok: true });
    } catch (err) { return errorResponse('Gagal menghapus surat keluar'); }
  }

  return errorResponse('Not found', 404);
};