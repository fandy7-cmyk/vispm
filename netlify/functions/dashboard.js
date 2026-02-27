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
    } else if (role === 'Kapus') {
      return await kapusStats(pool, kodePKM);
    } else if (role === 'Pengelola Program') {
      return await programStats(pool);
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

  // Periode aktif
  const periodeResult = await pool.query(
    `SELECT tahun, bulan, nama_bulan FROM periode_input
     WHERE status='Aktif' AND tanggal_mulai <= CURRENT_DATE AND tanggal_selesai >= CURRENT_DATE
     LIMIT 1`
  );
  const periodeAktif = periodeResult.rows.length > 0 ? periodeResult.rows[0] : null;

  return ok({
    totalUsulan: parseInt(s.total) || 0,
    disetujui: parseInt(s.selesai) || 0,
    menunggu: parseInt(s.menunggu) || 0,
    periodeAktif
  });
}

async function kapusStats(pool, kodePKM) {
  const result = await pool.query(
    `SELECT
      COUNT(*) FILTER(WHERE status_global='Menunggu Kapus') as menunggu,
      COUNT(*) FILTER(WHERE status_program='Disetujui') as terverifikasi,
      COUNT(*) as total
     FROM usulan_header WHERE kode_pkm=$1`,
    [kodePKM]
  );
  const s = result.rows[0];
  return ok({
    menunggu: parseInt(s.menunggu) || 0,
    terverifikasi: parseInt(s.terverifikasi) || 0,
    total: parseInt(s.total) || 0
  });
}

async function programStats(pool) {
  const result = await pool.query(
    `SELECT
      COUNT(*) FILTER(WHERE status_global='Menunggu Program') as menunggu,
      COUNT(*) FILTER(WHERE status_final='Disetujui') as terverifikasi,
      COUNT(*) as total
     FROM usulan_header`
  );
  const s = result.rows[0];
  return ok({
    menunggu: parseInt(s.menunggu) || 0,
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
