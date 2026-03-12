const { getPool, ok, err, cors } = require('./db');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();

  const pool = getPool();
  const params = event.queryStringParameters || {};
  const role = params.role || '';
  const email = params.email || '';
  const kodePKM = params.kode_pkm || '';

  try {
    if (role === 'Admin') {
      return await adminStats(pool);
    } else if (role === 'Operator') {
      return await operatorStats(pool, email);
    } else if (role === 'Kapus' || role === 'Kepala Puskesmas') {
      return await kapusStats(pool, kodePKM);
    } else if (role === 'Pengelola Program') {
      return await programStats(pool, email);
    } else if (role === 'Kadis') {
      return await kadisStats(pool);
    }
    return err('Role tidak dikenal');
  } catch (e) {
    console.error('Dashboard error:', e);
    return err('Error: ' + e.message, 500);
  }
};

async function adminStats(pool) {
  const [usulanResult, pkmResult, chartResult] = await Promise.all([
    pool.query(`SELECT
      COUNT(*) FILTER(WHERE TRUE) as total,
      COUNT(*) FILTER(WHERE status_global='Selesai') as selesai,
      COUNT(*) FILTER(WHERE status_global NOT IN ('Selesai','Ditolak')) as menunggu
      FROM usulan_header`),
    pool.query(`SELECT COUNT(*) as total FROM master_puskesmas WHERE aktif=true`),
    pool.query(`SELECT tahun, bulan, COUNT(*) as total FROM usulan_header
                WHERE tahun = EXTRACT(YEAR FROM NOW())
                GROUP BY tahun, bulan ORDER BY bulan`)
  ]);

  const s = usulanResult.rows[0];
  const bulanNama = ['','Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'];
  const chart = chartResult.rows.map(r => ({ bulan: bulanNama[r.bulan] || r.bulan, total: parseInt(r.total) }));

  return ok({
    totalUsulan: parseInt(s.total) || 0,
    selesai: parseInt(s.selesai) || 0,
    menunggu: parseInt(s.menunggu) || 0,
    puskesmasAktif: parseInt(pkmResult.rows[0].total) || 0,
    chartData: chart
  });
}

async function operatorStats(pool, email) {
  const result = await pool.query(
    `SELECT
      COUNT(*) as total,
      COUNT(*) FILTER(WHERE status_global='Selesai') as selesai,
      COUNT(*) FILTER(WHERE status_global NOT IN ('Selesai','Ditolak')) as menunggu
     FROM usulan_header WHERE created_by=$1`,
    [email]
  );
  const s = result.rows[0];

  // Periode aktif — ambil semua
  const periodeResult = await pool.query(
    `SELECT tahun, bulan, nama_bulan, tanggal_mulai, tanggal_selesai, jam_mulai, jam_selesai, notif_operator
     FROM periode_input
     WHERE status='Aktif' AND tanggal_mulai <= CURRENT_DATE AND tanggal_selesai >= CURRENT_DATE
     ORDER BY tahun, bulan`
  );
  const periodeAktif = periodeResult.rows.length > 0 ? periodeResult.rows[0] : null;
  const periodeAktifList = periodeResult.rows;

  return ok({
    totalUsulan: parseInt(s.total) || 0,
    disetujui: parseInt(s.selesai) || 0,
    menunggu: parseInt(s.menunggu) || 0,
    periodeAktif,
    periodeAktifList
  });
}

async function kapusStats(pool, kodePKM) {
  const [result, periodeResult] = await Promise.all([
    pool.query(
      `SELECT
        COUNT(*) FILTER(WHERE status_global='Menunggu Kepala Puskesmas') as menunggu,
        COUNT(*) FILTER(WHERE status_kapus='Selesai') as terverifikasi,
        COUNT(*) as total
       FROM usulan_header WHERE kode_pkm=$1`,
      [kodePKM]
    ),
    pool.query(
      `SELECT tahun, bulan, nama_bulan, tanggal_mulai, tanggal_selesai, jam_mulai, jam_selesai, notif_operator
       FROM periode_input
       WHERE status='Aktif' AND tanggal_mulai <= CURRENT_DATE AND tanggal_selesai >= CURRENT_DATE
       ORDER BY tahun, bulan`
    )
  ]);
  const s = result.rows[0];
  return ok({
    menunggu: parseInt(s.menunggu) || 0,
    terverifikasi: parseInt(s.terverifikasi) || 0,
    total: parseInt(s.total) || 0,
    periodeAktifList: periodeResult.rows
  });
}

async function programStats(pool, email) {
  // Total & terverifikasi: semua usulan yang pernah ditugaskan ke PP ini
  const totalResult = await pool.query(
    `SELECT
      COUNT(DISTINCT vp.id_usulan) as total,
      COUNT(DISTINCT vp.id_usulan) FILTER(WHERE vp.status='Selesai') as terverifikasi
     FROM verifikasi_program vp
     WHERE LOWER(vp.email_program)=LOWER($1)`,
    [email]
  );

  // Menunggu: VP milik PP ini masih 'Menunggu'
  // DAN status_global sesuai (Menunggu PP atau re-verif Admin)
  const menungguRows = await pool.query(
    `SELECT vp.id_usulan, vp.indikator_akses, uh.ditolak_oleh
     FROM verifikasi_program vp
     JOIN usulan_header uh ON vp.id_usulan = uh.id_usulan
     WHERE LOWER(vp.email_program)=LOWER($1)
       AND vp.status = 'Menunggu'
       AND uh.status_global IN ('Menunggu Pengelola Program', 'Menunggu Admin')`,
    [email]
  );

  // Untuk tiap VP yang menunggu, cek apakah PP ini terkena penolakan aktif
  let menunggu = 0;
  for (const vp of menungguRows.rows) {
    const pi = await pool.query(
      `SELECT no_indikator FROM penolakan_indikator
       WHERE id_usulan=$1 AND (aksi IS NULL OR aksi='tolak')`,
      [vp.id_usulan]
    ).catch(() => ({ rows: [] }));

    if (pi.rows.length === 0) {
      // Tidak ada penolakan aktif → verifikasi pertama → harus verif
      menunggu++;
    } else {
      // Ada penolakan aktif → cek irisan dengan akses PP ini
      const penolakanNos = pi.rows.map(p => parseInt(p.no_indikator));
      const aksesArr = (vp.indikator_akses || '').split(',')
        .map(n => parseInt(n.trim())).filter(n => !isNaN(n));
      // aksesArr kosong = bertanggung jawab semua indikator → selalu terkena
      const adaIrisan = aksesArr.length === 0
        ? penolakanNos.length > 0
        : aksesArr.some(n => penolakanNos.includes(n));
      if (adaIrisan) menunggu++;
    }
  }

  const s = totalResult.rows[0];
  return ok({
    menunggu,
    terverifikasi: parseInt(s.terverifikasi) || 0,
    total: parseInt(s.total) || 0
  });
}

async function kadisStats(pool) {
  const [statsResult, chartResult, pkmResult] = await Promise.all([
    pool.query(`SELECT
      COUNT(*) as total,
      COUNT(*) FILTER(WHERE status_global='Selesai') as selesai,
      COUNT(*) FILTER(WHERE status_global NOT IN ('Selesai','Ditolak')) as proses,
      AVG(NULLIF(indeks_spm, 0)) as rata_spm
      FROM usulan_header`),
    pool.query(`SELECT tahun, bulan, COUNT(*) as total, AVG(NULLIF(indeks_spm,0)) as rata_spm
                FROM usulan_header WHERE tahun=EXTRACT(YEAR FROM NOW())
                GROUP BY tahun, bulan ORDER BY bulan`),
    pool.query(`SELECT p.kode_pkm, p.nama_puskesmas,
      COUNT(u.*) as total,
      COUNT(u.*) FILTER(WHERE u.status_global='Selesai') as selesai,
      AVG(NULLIF(u.indeks_spm,0)) as rata_indeks
      FROM master_puskesmas p
      LEFT JOIN usulan_header u ON p.kode_pkm = u.kode_pkm
      WHERE p.aktif=true
      GROUP BY p.kode_pkm, p.nama_puskesmas
      ORDER BY p.nama_puskesmas`)
  ]);

  const s = statsResult.rows[0];
  const bulanNama = ['','Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'];

  return ok({
    totalUsulan: parseInt(s.total) || 0,
    selesai: parseInt(s.selesai) || 0,
    proses: parseInt(s.proses) || 0,
    rataSPM: parseFloat(s.rata_spm) ? parseFloat(s.rata_spm).toFixed(3) : '0',
    chartData: chartResult.rows.map(r => ({
      bulan: bulanNama[r.bulan],
      total: parseInt(r.total),
      rataSPM: parseFloat(r.rata_spm) ? parseFloat(r.rata_spm).toFixed(3) : '0'
    })),
    statPerPKM: pkmResult.rows.map(r => ({
      kode: r.kode_pkm,
      nama: r.nama_puskesmas,
      total: parseInt(r.total) || 0,
      selesai: parseInt(r.selesai) || 0,
      proses: (parseInt(r.total) || 0) - (parseInt(r.selesai) || 0),
      rataIndeks: parseFloat(r.rata_indeks) ? parseFloat(r.rata_indeks).toFixed(3) : '0'
    }))
  });
}