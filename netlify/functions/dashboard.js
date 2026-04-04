const { getPool, ok, err, cors } = require('./db');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();

  const pool = getPool();
  const params = event.queryStringParameters || {};
  const role = params.role || '';
  const email = params.email || '';
  const kodePKM = params.kode_pkm || '';
  const tahun = params.tahun ? parseInt(params.tahun) : null;

  try {
    if (role === 'Admin') {
      return await adminStats(pool, tahun);
    } else if (role === 'Operator') {
      return await operatorStats(pool, email, tahun);
    } else if (role === 'Kapus' || role === 'Kepala Puskesmas') {
      return await kapusStats(pool, kodePKM, tahun);
    } else if (role === 'Pengelola Program') {
      return await programStats(pool, email, tahun);
    } else if (role === 'Kadis') {
      return await kadisStats(pool);
    }
    return err('Role tidak dikenal');
  } catch (e) {
    console.error('Dashboard error:', e);
    return err('Error: ' + e.message, 500);
  }
};

async function adminStats(pool, tahun) {
  const tahunFilter = tahun ? `WHERE tahun = ${tahun}` : '';
  const tahunFilterAnd = tahun ? `AND tahun = ${tahun}` : '';

  // Saat tahun dipilih → chart per bulan. Saat "Semua Tahun" → chart per tahun.
  const chartQuery = tahun
    ? `SELECT bulan, COUNT(*) as total FROM usulan_header
       WHERE tahun = ${tahun} GROUP BY bulan ORDER BY bulan`
    : `SELECT tahun, COUNT(*) as total FROM usulan_header
       GROUP BY tahun ORDER BY tahun`;

  const [usulanResult, pkmResult, chartResult] = await Promise.all([
    pool.query(`SELECT
      COUNT(*) FILTER(WHERE TRUE) as total,
      COUNT(*) FILTER(WHERE status_global='Selesai') as selesai,
      COUNT(*) FILTER(WHERE status_global NOT IN ('Selesai','Ditolak')) as menunggu
      FROM usulan_header ${tahunFilter}`),
    pool.query(`SELECT COUNT(*) as total FROM master_puskesmas WHERE aktif=true`),
    pool.query(chartQuery)
  ]);

  const s = usulanResult.rows[0];
  const bulanNama = ['','Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'];

  // Format chart sesuai mode: per bulan atau per tahun
  const chart = tahun
    ? chartResult.rows.map(r => ({ label: bulanNama[r.bulan] || r.bulan, total: parseInt(r.total), isBulan: true }))
    : chartResult.rows.map(r => ({ label: String(r.tahun), total: parseInt(r.total), isBulan: false }));

  return ok({
    totalUsulan: parseInt(s.total) || 0,
    selesai: parseInt(s.selesai) || 0,
    menunggu: parseInt(s.menunggu) || 0,
    puskesmasAktif: parseInt(pkmResult.rows[0].total) || 0,
    chartData: chart,
    chartMode: tahun ? 'bulan' : 'tahun',
    tahunFilter: tahun || null
  });
}

async function operatorStats(pool, email, tahun) {
  const tahunFilterAnd = tahun ? `AND tahun = ${tahun}` : '';
  const result = await pool.query(
    `SELECT
      COUNT(*) as total,
      COUNT(*) FILTER(WHERE status_global='Selesai') as selesai,
      COUNT(*) FILTER(WHERE status_global NOT IN ('Selesai','Ditolak')) as menunggu
     FROM usulan_header WHERE created_by=$1 ${tahunFilterAnd}`,
    [email]
  );
  const s = result.rows[0];

  // Ambil semua periode berstatus Aktif — filter jam dilakukan di JS (bukan di SQL)
  // karena SQL CURRENT_DATE tidak tahu jam_mulai/jam_selesai
  const periodeResult = await pool.query(
    `SELECT tahun, bulan, nama_bulan, tanggal_mulai, tanggal_selesai, jam_mulai, jam_selesai,
            tanggal_mulai_verif, tanggal_selesai_verif, jam_mulai_verif, jam_selesai_verif
     FROM periode_input WHERE status='Aktif' ORDER BY tahun, bulan`
  );

  // Helper WITA (UTC+8) — cek jam juga, bukan hanya tanggal
  const _nowWita = new Date(Date.now() + 8 * 3600000);
  const _todayStr = _nowWita.toISOString().slice(0, 10);
  const _nowTime  = _nowWita.toISOString().slice(11, 16);
  const _toDs = (v) => { if (!v) return ''; const d = new Date(new Date(v).getTime() + 8*3600000); return d.toISOString().slice(0,10); };
  const _inRange = (tM, jM, tS, jS) => {
    const ms = _toDs(tM), ss = _toDs(tS);
    if (!ms || !ss) return false;
    const nowDT = _todayStr + 'T' + _nowTime;
    return nowDT >= ms + 'T' + (jM || '00:00') && nowDT <= ss + 'T' + (jS || '23:59');
  };

  const periodeAktifList = periodeResult.rows.map(r => ({
    ...r,
    namaBulan: r.nama_bulan,
    tanggalMulai: r.tanggal_mulai,
    tanggalSelesai: r.tanggal_selesai,
    jamMulai: r.jam_mulai || '08:00',
    jamSelesai: r.jam_selesai || '17:00',
    tanggalMulaiVerif: r.tanggal_mulai_verif || null,
    tanggalSelesaiVerif: r.tanggal_selesai_verif || null,
    jamMulaiVerif: r.jam_mulai_verif || '08:00',
    jamSelesaiVerif: r.jam_selesai_verif || '17:00',
    isAktifToday: _inRange(r.tanggal_mulai, r.jam_mulai, r.tanggal_selesai, r.jam_selesai),
    isVerifToday: !!r.tanggal_mulai_verif && !!r.tanggal_selesai_verif
      && _inRange(r.tanggal_mulai_verif, r.jam_mulai_verif, r.tanggal_selesai_verif, r.jam_selesai_verif),
  }));
  const periodeAktif = periodeAktifList.find(p => p.isAktifToday) || null;

  return ok({
    totalUsulan: parseInt(s.total) || 0,
    disetujui: parseInt(s.selesai) || 0,
    menunggu: parseInt(s.menunggu) || 0,
    periodeAktif,
    periodeAktifList,
    tahunFilter: tahun || null
  });
}

async function kapusStats(pool, kodePKM, tahun) {
  const tahunFilter = tahun ? `AND tahun = ${tahun}` : '';
  const [result, periodeResult, usulanPeriodeResult] = await Promise.all([
    pool.query(
      `SELECT
        COUNT(*) FILTER(WHERE status_global='Menunggu Kepala Puskesmas') as menunggu,
        COUNT(*) FILTER(WHERE status_kapus='Selesai') as terverifikasi,
        COUNT(*) as total
       FROM usulan_header WHERE kode_pkm=$1 ${tahunFilter}`,
      [kodePKM]
    ),
    pool.query(
      `SELECT tahun, bulan, nama_bulan, tanggal_mulai, tanggal_selesai, jam_mulai, jam_selesai, tanggal_mulai_verif, tanggal_selesai_verif, jam_mulai_verif, jam_selesai_verif
       FROM periode_input WHERE status='Aktif' ORDER BY tahun, bulan`
    ),
    // Ambil tahun-bulan yang punya usulan untuk PKM ini
    pool.query(
      `SELECT DISTINCT tahun, bulan FROM usulan_header WHERE kode_pkm=$1`,
      [kodePKM]
    )
  ]);
  const s = result.rows[0];
  // Set tahun-bulan yang ada usulannya — untuk filter periode
  const usulanSet = new Set(usulanPeriodeResult.rows.map(r => `${r.tahun}-${r.bulan}`));
  const _nowWita = new Date(Date.now() + 8 * 3600000);
  const _todayStr = _nowWita.toISOString().slice(0, 10);
  const _nowTime  = _nowWita.toISOString().slice(11, 16);
  const _toDs = (v) => { if (!v) return ''; const d = new Date(new Date(v).getTime() + 8*3600000); return d.toISOString().slice(0,10); };
  const _inRange = (tM, jM, tS, jS) => {
    const ms = _toDs(tM), ss = _toDs(tS);
    if (!ms || !ss) return false;
    const nowDT = _todayStr + 'T' + _nowTime;
    return nowDT >= ms + 'T' + (jM || '00:00') && nowDT <= ss + 'T' + (jS || '23:59');
  };
  return ok({
    menunggu: parseInt(s.menunggu) || 0,
    terverifikasi: parseInt(s.terverifikasi) || 0,
    total: parseInt(s.total) || 0,
    tahunFilter: tahun || null,
    // Hanya tampilkan periode yang ada usulannya untuk PKM ini
    periodeAktifList: periodeResult.rows
      .filter(r => usulanSet.has(`${r.tahun}-${r.bulan}`))
      .map(r => ({
        ...r,
        namaBulan: r.nama_bulan,
        tanggalMulai: r.tanggal_mulai,
        tanggalSelesai: r.tanggal_selesai,
        jamMulai: r.jam_mulai || '08:00',
        jamSelesai: r.jam_selesai || '17:00',
        tanggalMulaiVerif: r.tanggal_mulai_verif || null,
        tanggalSelesaiVerif: r.tanggal_selesai_verif || null,
        jamMulaiVerif: r.jam_mulai_verif || '08:00',
        jamSelesaiVerif: r.jam_selesai_verif || '17:00',
        isAktifToday: _inRange(r.tanggal_mulai, r.jam_mulai, r.tanggal_selesai, r.jam_selesai),
        isVerifToday: !!r.tanggal_mulai_verif && !!r.tanggal_selesai_verif
          && _inRange(r.tanggal_mulai_verif, r.jam_mulai_verif, r.tanggal_selesai_verif, r.jam_selesai_verif),
      }))
  });
}

async function programStats(pool, email, tahun) {
  const tahunFilterAnd = tahun ? `AND uh.tahun = ${tahun}` : '';
  // Total & terverifikasi: semua usulan yang pernah ditugaskan ke PP ini
  const totalResult = await pool.query(
    `SELECT
      COUNT(DISTINCT vp.id_usulan) as total,
      COUNT(DISTINCT vp.id_usulan) FILTER(WHERE vp.status='Selesai') as terverifikasi
     FROM verifikasi_program vp
     JOIN usulan_header uh ON vp.id_usulan = uh.id_usulan
     WHERE LOWER(vp.email_program)=LOWER($1) ${tahunFilterAnd}`,
    [email]
  );

  // Menunggu: VP milik PP ini masih 'Menunggu'
  const menungguRows = await pool.query(
    `SELECT vp.id_usulan, vp.indikator_akses, uh.ditolak_oleh
     FROM verifikasi_program vp
     JOIN usulan_header uh ON vp.id_usulan = uh.id_usulan
     WHERE LOWER(vp.email_program)=LOWER($1)
       AND vp.status = 'Menunggu'
       AND uh.status_global IN ('Menunggu Pengelola Program', 'Menunggu Admin')
       ${tahunFilterAnd}`,
    [email]
  );

  let menunggu = 0;
  const indikatorBermasalahPerUsulan = {};
  if (menungguRows.rows.length > 0) {
    // Batch-fetch semua penolakan aktif sekaligus — hindari N+1 query
    // Ambil baris yang betul-betul bermasalah:
    // - aksi='tolak'  : PP atau Admin menolak
    // - aksi='reset'  : PP benarkan Admin → ditolak, perlu perbaikan
    // - aksi IS NULL AND email_program=email_admin : Kapus menolak (penanda baris Kapus)
    // JANGAN ambil aksi IS NULL AND email_program!=email_admin (baris PP belum respon, bukan bermasalah)
    const allIds = menungguRows.rows.map(r => r.id_usulan);
    const piAll = await pool.query(
      `SELECT id_usulan, no_indikator FROM penolakan_indikator
       WHERE id_usulan=ANY($1)
         AND (
           -- Baris PP menolak (PP != Admin)
           (email_program != email_admin AND (aksi='tolak' OR aksi='reset'))
           -- Baris Admin menolak (email_program = email_admin, aksi='tolak', dibuat_oleh='Admin')
           OR (dibuat_oleh='Admin' AND aksi='tolak')
         )`,
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

    // FIX B: Bangun map nomor indikator bermasalah per usulan khusus untuk PP ini.
    // Dipakai frontend untuk badge "Re-verif: Ind. #1, #2, #5" di card/row usulan.
    for (const vp of menungguRows.rows) {
      const semuaNomor = [...new Set(piMap[vp.id_usulan] || [])];
      if (!semuaNomor.length) continue;
      const aksesArr = (vp.indikator_akses || '').split(',')
        .map(n => parseInt(n.trim())).filter(n => !isNaN(n));
      const relevan = aksesArr.length === 0
        ? semuaNomor
        : semuaNomor.filter(n => aksesArr.includes(n));
      if (relevan.length > 0) {
        indikatorBermasalahPerUsulan[vp.id_usulan] = relevan.sort((a, b) => a - b);
      }
    }
  }

  const s = totalResult.rows[0];

  // Ambil semua periode aktif untuk PP — filter jam di JS
  // Sekaligus ambil tahun-bulan usulan yang ditugaskan ke PP ini
  const [pvResult, usulanPPResult] = await Promise.all([
    pool.query(
      `SELECT tahun, bulan, nama_bulan, tanggal_mulai, tanggal_selesai, jam_mulai, jam_selesai,
              tanggal_mulai_verif, tanggal_selesai_verif, jam_mulai_verif, jam_selesai_verif
       FROM periode_input WHERE status='Aktif' ORDER BY tahun, bulan`
    ).catch(() => ({ rows: [] })),
    pool.query(
      `SELECT DISTINCT uh.tahun, uh.bulan
       FROM verifikasi_program vp
       JOIN usulan_header uh ON vp.id_usulan = uh.id_usulan
       WHERE LOWER(vp.email_program)=LOWER($1)`,
      [email]
    ).catch(() => ({ rows: [] }))
  ]);
  // Set tahun-bulan yang ada usulan untuk PP ini
  const usulanPPSet = new Set(usulanPPResult.rows.map(r => `${r.tahun}-${r.bulan}`));
  const _nowWita2 = new Date(Date.now() + 8 * 3600000);
  const _todayStr2 = _nowWita2.toISOString().slice(0, 10);
  const _nowTime2  = _nowWita2.toISOString().slice(11, 16);
  const _toDs2 = (v) => { if (!v) return ''; const d = new Date(new Date(v).getTime() + 8*3600000); return d.toISOString().slice(0,10); };
  const _inRange2 = (tM, jM, tS, jS) => {
    const ms = _toDs2(tM), ss = _toDs2(tS);
    if (!ms || !ss) return false;
    const nowDT = _todayStr2 + 'T' + _nowTime2;
    return nowDT >= ms + 'T' + (jM || '00:00') && nowDT <= ss + 'T' + (jS || '23:59');
  };
  // Cari periode yang isAktifToday (input aktif sekarang) — ambil pertama
  const pvAktif = pvResult.rows.find(r => _inRange2(r.tanggal_mulai, r.jam_mulai, r.tanggal_selesai, r.jam_selesai)) || {};
  const pv = pvAktif;
  const isVerifToday = !!pv.tanggal_mulai_verif && !!pv.tanggal_selesai_verif
    && _inRange2(pv.tanggal_mulai_verif, pv.jam_mulai_verif, pv.tanggal_selesai_verif, pv.jam_selesai_verif);
  // periodeAktifList untuk banner verif — hanya periode yang ada usulan PP ini
  const periodeAktifList = pvResult.rows
    .filter(r => usulanPPSet.has(`${r.tahun}-${r.bulan}`))
    .map(r => ({
    ...r,
    namaBulan: r.nama_bulan,
    tanggalMulai: r.tanggal_mulai,
    tanggalSelesai: r.tanggal_selesai,
    jamMulai: r.jam_mulai || '08:00',
    jamSelesai: r.jam_selesai || '17:00',
    tanggalMulaiVerif: r.tanggal_mulai_verif || null,
    tanggalSelesaiVerif: r.tanggal_selesai_verif || null,
    jamMulaiVerif: r.jam_mulai_verif || '08:00',
    jamSelesaiVerif: r.jam_selesai_verif || '17:00',
    isAktifToday: _inRange2(r.tanggal_mulai, r.jam_mulai, r.tanggal_selesai, r.jam_selesai),
    isVerifToday: !!r.tanggal_mulai_verif && !!r.tanggal_selesai_verif
      && _inRange2(r.tanggal_mulai_verif, r.jam_mulai_verif, r.tanggal_selesai_verif, r.jam_selesai_verif),
  }));

  return ok({
    menunggu,
    terverifikasi: parseInt(s.terverifikasi) || 0,
    total: parseInt(s.total) || 0,
    isVerifToday,
    tanggalMulaiVerif: pv.tanggal_mulai_verif || null,
    tanggalSelesaiVerif: pv.tanggal_selesai_verif || null,
    jamMulaiVerif: pv.jam_mulai_verif || '08:00',
    jamSelesaiVerif: pv.jam_selesai_verif || '17:00',
    periodeAktifList,
    indikatorBermasalahPerUsulan,
    tahunFilter: tahun || null
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