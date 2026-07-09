// netlify/functions/surat-masuk.js
import { getDb, jsonResponse, errorResponse, parseBody } from './_db.js';
import { requireAuth } from './_auth.js';
import { logAudit } from './_audit.js';

async function checkAccess(auth, sql) {
  if (auth.is_admin) return true;
  const perms = await sql`SELECT menu_key FROM user_permissions WHERE user_id = ${auth.id} AND menu_key = 'surat.masuk' LIMIT 1`;
  return perms.length > 0;
}

// User dengan menu_key 'surat.masuk.full' setara admin khusus surat masuk:
// boleh edit/hapus/ubah status surat siapapun, bukan cuma miliknya sendiri.
async function checkFullAccess(auth, sql) {
  if (auth.is_admin) return true;
  const perms = await sql`SELECT menu_key FROM user_permissions WHERE user_id = ${auth.id} AND menu_key = 'surat.masuk.full' LIMIT 1`;
  return perms.length > 0;
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse({});

  const auth = requireAuth(event);
  if (!auth) return errorResponse('Unauthorized', 401);

  const sql = getDb();
  const ok = await checkAccess(auth, sql);
  if (!ok) return errorResponse('Akses ditolak', 403);

  const rawPath = event.path.replace(/.*\/surat-masuk/, '') || '/';
  const segments = rawPath.split('/').filter(Boolean);
  const seg0 = segments[0] || null;
  const seg1 = segments[1] || null;
  const numId = seg0 && !isNaN(seg0) ? parseInt(seg0) : null;
  const isStats = seg0 === 'stats';
  const isSelesai = numId && seg1 === 'selesai';

  if (event.httpMethod === 'GET' && isStats) {
    try {
      const isAdmin = !!auth.is_admin;
      const isFull  = await checkFullAccess(auth, sql);
      const [{ total }] = await sql`SELECT COUNT(*)::INT AS total FROM surat_masuk WHERE (${isAdmin} = TRUE OR ${isFull} = TRUE OR pegawai = ${auth.nama})`;
      const [{ belum_selesai }] = await sql`SELECT COUNT(*)::INT AS belum_selesai FROM surat_masuk WHERE selesai = FALSE AND (${isAdmin} = TRUE OR ${isFull} = TRUE OR pegawai = ${auth.nama})`;
      const [{ bulan_ini }] = await sql`SELECT COUNT(*)::INT AS bulan_ini FROM surat_masuk WHERE DATE_TRUNC('month', tanggal_terima) = DATE_TRUNC('month', CURRENT_DATE) AND (${isAdmin} = TRUE OR ${isFull} = TRUE OR pegawai = ${auth.nama})`;
      const [{ terlambat }] = await sql`SELECT COUNT(*)::INT AS terlambat FROM surat_masuk WHERE selesai = FALSE AND batas_waktu < CURRENT_DATE AND (${isAdmin} = TRUE OR ${isFull} = TRUE OR pegawai = ${auth.nama})`;
      return jsonResponse({ total, belum_selesai, bulan_ini, terlambat });
    } catch (err) { console.error('[STATS surat-masuk]', err); return errorResponse('Gagal mengambil statistik: ' + err.message); }
  }

  if (event.httpMethod === 'GET' && !numId && !isStats) {
    const { page = 1, limit = 20, q = '', selesai: sf = '', pegawai: pf = '', tahun: tf = '', bulan: bf = '', sort = '' } = event.queryStringParameters || {};
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const search  = `%${q}%`;
    const pgSearch = pf ? pf : null;
    const tahunVal = tf ? tf : null;
    const bulanVal = bf ? parseInt(bf) : null;
    // sort=terbaru → dipakai panel "Surat Masuk Terbaru" di dashboard, urut
    // berdasarkan input terbaru (created_at/id DESC). Default tetap ASC
    // berdasarkan tanggal_terima, mengikuti urutan buku agenda (lama → baru).
    const isTerbaru = sort === 'terbaru';
    try {
      let rows, countRows;
      // Karena neon() tidak support sql fragment, kita pakai pendekatan:
      // filter selesai via boolean, pegawai/tahun/bulan via COALESCE trick
      const selesaiBool = sf === 'true' ? true : sf === 'false' ? false : null;

      const isAdmin = !!auth.is_admin;
      const isFull  = await checkFullAccess(auth, sql);
      rows = isTerbaru ? await sql`
        SELECT * FROM surat_masuk
        WHERE (perihal ILIKE ${search} OR asal_surat ILIKE ${search} OR no_agenda ILIKE ${search}
          OR no_surat ILIKE ${search} OR COALESCE(pegawai,'') ILIKE ${search})
          AND (${selesaiBool}::boolean IS NULL OR selesai = ${selesaiBool}::boolean)
          AND (${pgSearch}::text IS NULL OR pegawai = ${pgSearch}::text)
          AND (${tahunVal}::text IS NULL OR EXTRACT(YEAR FROM tanggal_terima)::text = ${tahunVal}::text)
          AND (${bulanVal}::int IS NULL OR EXTRACT(MONTH FROM tanggal_terima)::int = ${bulanVal}::int)
          AND (${isAdmin} = TRUE OR ${isFull} = TRUE OR pegawai = ${auth.nama})
        ORDER BY created_at DESC NULLS LAST, id DESC
        LIMIT ${parseInt(limit)} OFFSET ${offset}` : await sql`
        SELECT * FROM surat_masuk
        WHERE (perihal ILIKE ${search} OR asal_surat ILIKE ${search} OR no_agenda ILIKE ${search}
          OR no_surat ILIKE ${search} OR COALESCE(pegawai,'') ILIKE ${search})
          AND (${selesaiBool}::boolean IS NULL OR selesai = ${selesaiBool}::boolean)
          AND (${pgSearch}::text IS NULL OR pegawai = ${pgSearch}::text)
          AND (${tahunVal}::text IS NULL OR EXTRACT(YEAR FROM tanggal_terima)::text = ${tahunVal}::text)
          AND (${bulanVal}::int IS NULL OR EXTRACT(MONTH FROM tanggal_terima)::int = ${bulanVal}::int)
          AND (${isAdmin} = TRUE OR ${isFull} = TRUE OR pegawai = ${auth.nama})
        ORDER BY tanggal_terima ASC NULLS LAST, id ASC
        LIMIT ${parseInt(limit)} OFFSET ${offset}`;
      countRows = await sql`
        SELECT COUNT(*)::INT AS total FROM surat_masuk
        WHERE (perihal ILIKE ${search} OR asal_surat ILIKE ${search} OR no_agenda ILIKE ${search}
          OR no_surat ILIKE ${search} OR COALESCE(pegawai,'') ILIKE ${search})
          AND (${selesaiBool}::boolean IS NULL OR selesai = ${selesaiBool}::boolean)
          AND (${pgSearch}::text IS NULL OR pegawai = ${pgSearch}::text)
          AND (${tahunVal}::text IS NULL OR EXTRACT(YEAR FROM tanggal_terima)::text = ${tahunVal}::text)
          AND (${bulanVal}::int IS NULL OR EXTRACT(MONTH FROM tanggal_terima)::int = ${bulanVal}::int)
          AND (${isAdmin} = TRUE OR ${isFull} = TRUE OR pegawai = ${auth.nama})`;

      return jsonResponse({ surat: rows, total: countRows[0].total, page: parseInt(page), limit: parseInt(limit) });
    } catch (err) { console.error('[GET surat-masuk]', err); return errorResponse('Gagal mengambil data surat masuk: ' + err.message); }
  }

  // ── POST — siapapun yang punya akses menu surat.masuk boleh input, bebas assign pegawai ──
  // No. agenda di-generate OTOMATIS oleh sistem (reset ke 1 tiap ganti tahun, berdasarkan tahun tanggal_terima),
  // supaya nggak bentrok antar user yang input manual.
  if (event.httpMethod === 'POST' && !numId) {
    const { no_surat, tanggal_surat, tanggal_terima, asal_surat, perihal, batas_waktu, pegawai, file_url, file_name, selesai, keterangan } = parseBody(event);
    if (!asal_surat || !perihal) return errorResponse('Asal surat dan perihal wajib diisi', 400);
    try {
      const refDate = tanggal_terima ? new Date(tanggal_terima) : new Date();
      const tahunAgenda = refDate.getFullYear();
      const [{ next_no }] = await sql`
        SELECT COALESCE(MAX(no_agenda::int), 0) + 1 AS next_no
        FROM surat_masuk
        WHERE no_agenda ~ '^[0-9]+$'
          AND EXTRACT(YEAR FROM COALESCE(tanggal_terima, created_at)) = ${tahunAgenda}
      `;
      const no_agenda = String(next_no);
      const rows = await sql`
        INSERT INTO surat_masuk (no_agenda, no_surat, tanggal_surat, tanggal_terima, asal_surat, perihal, batas_waktu, pegawai, file_url, file_name, selesai, keterangan, created_by)
        VALUES (${no_agenda}, ${no_surat||null}, ${tanggal_surat||null}, ${tanggal_terima||null}, ${asal_surat}, ${perihal}, ${batas_waktu||null}, ${pegawai||null}, ${file_url||null}, ${file_name||null}, ${selesai===true}, ${keterangan||null}, ${auth.id})
        RETURNING *
      `;
      await logAudit(sql, event, {
        user_id: auth.id, nama: auth.nama, email: auth.email,
        aksi: 'create', entitas: 'surat_masuk', entitas_id: rows[0].id,
        detail: { no_agenda, perihal, asal_surat }
      });
      return jsonResponse({ surat: rows[0] }, 201);
    } catch (err) { console.error('[POST surat-masuk]', err); return errorResponse('Gagal menyimpan surat masuk: ' + err.message); }
  }

  // ── PUT — admin/full-access bebas; user biasa hanya boleh edit surat yang dia input sendiri ──
  if (event.httpMethod === 'PUT' && numId && !isSelesai) {
    const fullAccess = await checkFullAccess(auth, sql);
    if (!fullAccess) {
      const owner = await sql`SELECT created_by FROM surat_masuk WHERE id = ${numId} LIMIT 1`;
      if (!owner.length || owner[0].created_by !== auth.id) return errorResponse('Akses ditolak', 403);
    }
    const body = parseBody(event);
    const { no_surat, tanggal_surat, tanggal_terima, asal_surat, perihal, batas_waktu, pegawai, file_url, file_name, selesai, keterangan } = body;
    try {
      const rows = await sql`
        UPDATE surat_masuk SET
          no_surat       = ${no_surat !== undefined ? no_surat : sql`no_surat`},
          tanggal_surat  = ${tanggal_surat !== undefined ? tanggal_surat : sql`tanggal_surat`},
          tanggal_terima = COALESCE(${tanggal_terima??null}, tanggal_terima),
          asal_surat     = COALESCE(${asal_surat??null}, asal_surat),
          perihal        = COALESCE(${perihal??null}, perihal),
          batas_waktu    = ${batas_waktu !== undefined ? batas_waktu : sql`batas_waktu`},
          pegawai        = ${pegawai !== undefined ? pegawai : sql`pegawai`},
          file_url       = ${file_url !== undefined ? file_url : sql`file_url`},
          file_name      = ${file_name !== undefined ? file_name : sql`file_name`},
          selesai        = COALESCE(${selesai??null}, selesai),
          keterangan     = ${keterangan !== undefined ? keterangan : sql`keterangan`},
          updated_at     = NOW()
        WHERE id = ${numId} RETURNING *
      `;
      if (!rows.length) return errorResponse('Surat tidak ditemukan', 404);
      await logAudit(sql, event, {
        user_id: auth.id, nama: auth.nama, email: auth.email,
        aksi: 'update', entitas: 'surat_masuk', entitas_id: numId,
        detail: { no_agenda: rows[0].no_agenda, perihal: rows[0].perihal }
      });
      return jsonResponse({ surat: rows[0] });
    } catch (err) { console.error('[PUT surat-masuk]', err); return errorResponse('Gagal mengupdate surat masuk: ' + err.message); }
  }

  // ── PATCH selesai — boleh oleh admin/full-access, penginput (created_by), atau pegawai yang didisposisikan ──
  if (event.httpMethod === 'PATCH' && isSelesai) {
    const fullAccess = await checkFullAccess(auth, sql);
    if (!fullAccess) {
      const owner = await sql`SELECT created_by, pegawai FROM surat_masuk WHERE id = ${numId} LIMIT 1`;
      if (!owner.length || (owner[0].created_by !== auth.id && owner[0].pegawai !== auth.nama)) {
        return errorResponse('Akses ditolak', 403);
      }
    }
    const { selesai } = parseBody(event);
    try {
      const rows = await sql`UPDATE surat_masuk SET selesai = ${Boolean(selesai)}, updated_at = NOW() WHERE id = ${numId} RETURNING *`;
      if (!rows.length) return errorResponse('Surat tidak ditemukan', 404);
      await logAudit(sql, event, {
        user_id: auth.id, nama: auth.nama, email: auth.email,
        aksi: 'update_status', entitas: 'surat_masuk', entitas_id: numId,
        detail: { selesai: Boolean(selesai) }
      });
      return jsonResponse({ surat: rows[0] });
    } catch (err) { return errorResponse('Gagal mengupdate status: ' + err.message); }
  }

  // ── DELETE — admin/full-access bebas; user biasa hanya boleh hapus surat yang dia input sendiri ──
  if (event.httpMethod === 'DELETE' && numId) {
    const fullAccess = await checkFullAccess(auth, sql);
    if (!fullAccess) {
      const owner = await sql`SELECT created_by FROM surat_masuk WHERE id = ${numId} LIMIT 1`;
      if (!owner.length || owner[0].created_by !== auth.id) return errorResponse('Akses ditolak', 403);
    }
    try {
      const before = await sql`SELECT no_agenda, perihal, asal_surat FROM surat_masuk WHERE id = ${numId}`;
      await sql`DELETE FROM surat_masuk WHERE id = ${numId}`;
      await logAudit(sql, event, {
        user_id: auth.id, nama: auth.nama, email: auth.email,
        aksi: 'delete', entitas: 'surat_masuk', entitas_id: numId,
        detail: before[0] || null
      });
      return jsonResponse({ ok: true });
    } catch (err) { return errorResponse('Gagal menghapus surat masuk: ' + err.message); }
  }

  return errorResponse('Not found', 404);
};