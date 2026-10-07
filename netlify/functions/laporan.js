const { getPool, ok, err, cors } = require('./db');
const { validateSession } = require('./middleware');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();
  const _authErr = await validateSession(event);
  if (_authErr) return _authErr;

  const pool = getPool();
  const params = event.queryStringParameters || {};

  try {
    let where = [];
    let qParams = [];
    let idx = 1;

    if (params.tahun) {
      where.push(`uh.tahun = $${idx++}`);
      qParams.push(parseInt(params.tahun));
    }
    if (params.bulan && params.bulan !== 'semua') {
      where.push(`uh.bulan = $${idx++}`);
      qParams.push(parseInt(params.bulan));
    }
    if (params.kode_pkm && params.kode_pkm !== 'semua') {
      where.push(`uh.kode_pkm = $${idx++}`);
      qParams.push(params.kode_pkm);
    }
    if (params.status && params.status !== 'semua') {
      where.push(`uh.status_global = $${idx++}`);
      qParams.push(params.status);
    }
    if (params.email_operator) {
      where.push(`uh.created_by = $${idx++}`);
      qParams.push(params.email_operator);
    }
    const whereStr = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

    // Pagination — default 1000 (laporan biasanya ingin semua data dalam satu halaman untuk export)
    // Caller bisa kirim ?limit=50&page=2 untuk paginate di masa depan
    const limit  = Math.min(parseInt(params.limit)  || 1000, 5000);
    const page   = Math.max(parseInt(params.page)   || 1, 1);
    const offset = (page - 1) * limit;

    const [dataResult, countResult] = await Promise.all([
      pool.query(
        `SELECT uh.*, p.nama_puskesmas,
          (SELECT COUNT(*) FROM usulan_indikator ui WHERE ui.id_usulan=uh.id_usulan) as total_indikator,
          CASE WHEN (
            COALESCE(pi.tanggal_selesai_verif, pi.tanggal_selesai) IS NOT NULL
            AND (NOW() AT TIME ZONE 'Asia/Makassar') >
              (COALESCE(pi.tanggal_selesai_verif, pi.tanggal_selesai)::date
               + COALESCE(pi.jam_selesai_verif, pi.jam_selesai, '23:59')::time)
          ) THEN true ELSE false END AS periode_expired,
          (COALESCE(pi.tanggal_selesai_verif, pi.tanggal_selesai)::date
           + COALESCE(pi.jam_selesai_verif, pi.jam_selesai, '23:59')::time) AT TIME ZONE 'Asia/Makassar' AS periode_batas_waktu
         FROM usulan_header uh
         LEFT JOIN master_puskesmas p ON uh.kode_pkm = p.kode_pkm
         LEFT JOIN periode_input pi ON pi.tahun = uh.tahun AND pi.bulan = uh.bulan
         ${whereStr}
         ORDER BY uh.tahun DESC, uh.bulan DESC, p.nama_puskesmas
         LIMIT ${limit} OFFSET ${offset}`,
        qParams
      ),
      pool.query(
        `SELECT
          COUNT(*) as total,
          COUNT(*) FILTER(WHERE uh.status_global='Selesai') as selesai,
          COUNT(*) FILTER(WHERE uh.status_global='Menunggu Admin' AND NOT (
            COALESCE(pi.tanggal_selesai_verif, pi.tanggal_selesai) IS NOT NULL
            AND (NOW() AT TIME ZONE 'Asia/Makassar') >
              (COALESCE(pi.tanggal_selesai_verif, pi.tanggal_selesai)::date
               + COALESCE(pi.jam_selesai_verif, pi.jam_selesai, '23:59')::time)
          )) as pending,
          AVG(NULLIF(uh.indeks_spm,0)) as rata_spm
         FROM usulan_header uh
         LEFT JOIN periode_input pi ON pi.tahun = uh.tahun AND pi.bulan = uh.bulan
         ${whereStr}`,
        qParams
      )
    ]);

    const bulanNama = ['','Januari','Februari','Maret','April','Mei','Juni',
      'Juli','Agustus','September','Oktober','November','Desember'];
    const s = countResult.rows[0];

    // Nama pelaksana verifikasi (Kapus, Pengelola Program, Admin) untuk kolom Status
    const ids = dataResult.rows.map(r => r.id_usulan);
    const pkms = [...new Set(dataResult.rows.map(r => r.kode_pkm).filter(Boolean))];
    const emails = [...new Set(dataResult.rows.flatMap(r => [r.kapus_approved_by, r.admin_approved_by]).filter(Boolean).map(e => e.toLowerCase()))];
    const [vpRes, kapusRes, userRes] = ids.length ? await Promise.all([
      pool.query(`SELECT id_usulan, email_program, nama_program, status FROM verifikasi_program WHERE id_usulan = ANY($1) ORDER BY created_at`, [ids]),
      pool.query(`SELECT kode_pkm, nama FROM users WHERE kode_pkm = ANY($1) AND role IN ('Kapus','kapus','Kepala Puskesmas') AND COALESCE(aktif, true) = true ORDER BY nama`, [pkms]),
      pool.query(`SELECT LOWER(email) AS email, nama FROM users WHERE LOWER(email) = ANY($1)`, [emails])
    ]) : [{ rows: [] }, { rows: [] }, { rows: [] }];
    const vpMap = {}, kapusMap = {}, namaMap = {};
    vpRes.rows.forEach(v => { (vpMap[v.id_usulan] = vpMap[v.id_usulan] || []).push({ nama: v.nama_program || v.email_program, status: v.status || 'Menunggu' }); });
    kapusRes.rows.forEach(k => { (kapusMap[k.kode_pkm] = kapusMap[k.kode_pkm] || []).push(k.nama); });
    userRes.rows.forEach(u => { namaMap[u.email] = u.nama; });

    const data = dataResult.rows.map((r, i) => ({
      no: i + 1,
      idUsulan: r.id_usulan,
      kodePKM: r.kode_pkm,
      namaPKM: r.nama_puskesmas || r.kode_pkm,
      tahun: r.tahun,
      bulan: r.bulan,
      namaBulan: bulanNama[r.bulan] || '',
      totalIndikator: parseInt(r.total_indikator) || 0,
      indeksSPM: parseFloat(r.indeks_spm) ? parseFloat(r.indeks_spm).toFixed(2) : '0',
      statusGlobal: r.status_global || 'Draft',
      statusKapus: r.status_kapus || 'Menunggu',
      statusProgram: r.status_program || 'Menunggu',
      kapusNama: r.kapus_approved_by ? (namaMap[r.kapus_approved_by.toLowerCase()] || r.kapus_approved_by) : (kapusMap[r.kode_pkm] || []).join(', '),
      adminNama: r.admin_approved_by ? (namaMap[r.admin_approved_by.toLowerCase()] || r.admin_approved_by) : '',
      programList: vpMap[r.id_usulan] || [],
      createdBy: r.created_by || '',
      createdAt: r.created_at,
      finalApprovedBy: r.final_approved_by || '',
      finalApprovedAt: r.final_approved_at,
      waktuSelesai: r.waktu_selesai || null,
      adminApprovedAt: r.admin_approved_at || null,
      periodeExpired: r.periode_expired === true || r.periode_expired === 't',
      periodeBatasWaktu: r.periode_batas_waktu || null
    }));

    return ok({
      data,
      summary: {
        total: parseInt(s.total) || 0,
        selesai: parseInt(s.selesai) || 0,
        pending: parseInt(s.pending) || 0,
        rataSPM: parseFloat(s.rata_spm) ? parseFloat(s.rata_spm).toFixed(2) : '0'
      }
    });
  } catch (e) {
    console.error('Laporan error:', e);
    return err('Error: ' + e.message, 500);
  }
};