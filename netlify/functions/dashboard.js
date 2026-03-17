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
    `SELECT tahun, bulan, nama_bulan, tanggal_mulai, tanggal_selesai, jam_mulai, jam_selesai
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
      `SELECT tahun, bulan, nama_bulan, tanggal_mulai, tanggal_selesai, jam_mulai, jam_selesai, tanggal_mulai_verif, tanggal_selesai_verif
       FROM periode_input
       WHERE status='Aktif' AND tanggal_mulai <= CURRENT_DATE AND tanggal_selesai >= CURRENT_DATE
       ORDER BY tahun, bulan`
    )
  ]);
  const s = result.rows[0];
  const _nowWita = new Date(Date.now() + 8 * 3600000);
  const _todayStr = _nowWita.toISOString().slice(0, 10);
  const _toDs = (v) => { if (!v) return ''; const d = new Date(new Date(v).getTime() + 8*3600000); return d.toISOString().slice(0,10); };
  return ok({
    menunggu: parseInt(s.menunggu) || 0,
    terverifikasi: parseInt(s.terverifikasi) || 0,
    total: parseInt(s.total) || 0,
    periodeAktifList: periodeResult.rows.map(r => ({
      ...r,
      isVerifToday: !!r.tanggal_mulai_verif && !!r.tanggal_selesai_verif
        && _todayStr >= _toDs(r.tanggal_mulai_verif) && _todayStr <= _toDs(r.tanggal_selesai_verif)
    }))
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
  const menungguRows = await pool.query(
    `SELECT vp.id_usulan, vp.indikator_akses, uh.ditolak_oleh
     FROM verifikasi_program vp
     JOIN usulan_header uh ON vp.id_usulan = uh.id_usulan
     WHERE LOWER(vp.email_program)=LOWER($1)
       AND vp.status = 'Menunggu'
       AND uh.status_global IN ('Menunggu Pengelola Program', 'Menunggu Admin')`,
    [email]
  );

  let menunggu = 0;
  if (menungguRows.rows.length > 0) {
    // Batch-fetch semua penolakan aktif sekaligus — hindari N+1 query
    const allIds = menungguRows.rows.map(r => r.id_usulan);
    const piAll = await pool.query(
      `SELECT id_usulan, no_indikator FROM penolakan_indikator
       WHERE id_usulan=ANY($1) AND (aksi IS NULL OR aksi='tolak')`,
      [allIds]
    ).catch(() => ({ rows: [] }));

    // Bangun map: id_usulan -> [no_indikator, ...]
    const piMap = {};
    piAll.rows.forEach(p => {
      if (!piMap[p.id_usulan]) piMap[p.id_usulan] = [];
      piMap[p.id_usulan].push(parseInt(p.no_indikator));
    });

    for (const vp of menungguRows.rows) {
      const penolakanNos = piMap[vp.id_usulan] || [];
      if (penolakanNos.length === 0) {
        menunggu++;
      } else {
        const aksesArr = (vp.indikator_akses || '').split(',')
          .map(n => parseInt(n.trim())).filter(n => !isNaN(n));
        const adaIrisan = aksesArr.length === 0
          ? penolakanNos.length > 0
          : aksesArr.some(n => penolakanNos.includes(n));
        if (adaIrisan) menunggu++;
      }
    }
  }

  const s = totalResult.rows[0];

  // Ambil periode verifikasi aktif untuk PP
  const pvResult = await pool.query(
    `SELECT tanggal_mulai_verif, tanggal_selesai_verif
     FROM periode_input
     WHERE status='Aktif' AND tanggal_mulai <= CURRENT_DATE AND tanggal_selesai >= CURRENT_DATE
     ORDER BY tahun, bulan LIMIT 1`
  ).catch(() => ({ rows: [] }));
  const pv = pvResult.rows[0] || {};
  const _nowWita2 = new Date(Date.now() + 8 * 3600000);
  const _todayStr2 = _nowWita2.toISOString().slice(0, 10);
  const _toDs2 = (v) => { if (!v) return ''; const d = new Date(new Date(v).getTime() + 8*3600000); return d.toISOString().slice(0,10); };
  const isVerifToday = !!pv.tanggal_mulai_verif && !!pv.tanggal_selesai_verif
    && _todayStr2 >= _toDs2(pv.tanggal_mulai_verif) && _todayStr2 <= _toDs2(pv.tanggal_selesai_verif);

  return ok({
    menunggu,
    terverifikasi: parseInt(s.terverifikasi) || 0,
    total: parseInt(s.total) || 0,
    isVerifToday,
    tanggalMulaiVerif: pv.tanggal_mulai_verif || null,
    tanggalSelesaiVerif: pv.tanggal_selesai_verif || null
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