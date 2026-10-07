const { getPool, ok, err, cors } = require('./db');
const { validateSession } = require('./middleware');

// Status yang dianggap "sah" untuk dihitung ke laporan kabupaten — Draft & Ditolak
// belum/tidak final jadi tidak ikut diagregat (sama seperti kumulatif per-usulan).
const STATUS_VALID = `NOT IN ('Draft','Ditolak','Ditolak Sebagian')`;

// Indikator PTM (Hipertensi, Diabetes Melitus) — sasarannya adalah populasi penderita
// yang sama yang harus dilayani SETIAP bulan (bukan kasus baru tiap bulan), jadi
// realisasinya TIDAK diakumulasi lintas bulan. Capaian periode = realisasi bulan
// terakhir dari rentang yang dipilih saja.
const INDIKATOR_NON_KUMULATIF = [8, 9];

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();
  const _authErr = await validateSession(event);
  if (_authErr) return _authErr;

  const pool = getPool();
  const params = event.queryStringParameters || {};

  try {
    // ── Daftar periode (tahun+bulan) yang punya data — buat isi filter dropdown ──
    if (params.list_periode) {
      const r = await pool.query(
        `SELECT DISTINCT tahun, bulan FROM usulan_header WHERE status_global ${STATUS_VALID} ORDER BY tahun DESC, bulan DESC`
      );
      return ok(r.rows.map(x => ({ tahun: x.tahun, bulan: x.bulan })));
    }

    let tahun = parseInt(params.tahun) || null;
    let bulan = parseInt(params.bulan) || null; // dipertahankan utk kompatibilitas lama (dipakai sbg bulanAkhir kalau bulanAkhir tak dikirim)
    let bulanAwal = parseInt(params.bulanAwal) || null;
    let bulanAkhir = parseInt(params.bulanAkhir) || bulan || null;
    const kodePkm = params.kodePkm || null; // kosong/null = semua puskesmas (kabupaten)

    if (!tahun || !bulanAkhir) {
      // Default: periode terakhir yang ada datanya
      const latest = await pool.query(
        `SELECT tahun, bulan FROM usulan_header WHERE status_global ${STATUS_VALID}
         ORDER BY tahun DESC, bulan DESC LIMIT 1`
      );
      if (latest.rows.length) {
        tahun = tahun || latest.rows[0].tahun;
        bulanAkhir = bulanAkhir || latest.rows[0].bulan;
      } else {
        const now = new Date(Date.now() + 8 * 3600000); // WITA
        tahun = tahun || now.getUTCFullYear();
        bulanAkhir = bulanAkhir || (now.getUTCMonth() + 1);
      }
    }
    bulanAwal = bulanAwal || 1;
    if (bulanAwal > bulanAkhir) bulanAwal = bulanAkhir;
    bulan = bulanAkhir; // dipakai di bawah utk "realisasi bulan ini" (= bulan akhir range)

    const [indikatorResult, targetResult, realisasiResult, pkmResult, pkmLaporResult, pkmLaporListResult] = await Promise.all([
      pool.query(`SELECT no_indikator, nama_indikator, bobot FROM master_indikator WHERE aktif=true ORDER BY no_indikator`),
      kodePkm
        ? pool.query(
            `SELECT no_indikator, SUM(sasaran) as total_target
             FROM target_tahunan WHERE tahun=$1 AND kode_pkm=$2 GROUP BY no_indikator`,
            [tahun, kodePkm]
          )
        : pool.query(
            `SELECT no_indikator, SUM(sasaran) as total_target
             FROM target_tahunan WHERE tahun=$1 GROUP BY no_indikator`,
            [tahun]
          ),
      pool.query(
        `SELECT ui.no_indikator,
          SUM(CASE WHEN uh.bulan = $2 THEN ui.capaian ELSE 0 END) as realisasi_bulan_ini,
          SUM(ui.capaian) as realisasi_kumulatif
         FROM usulan_indikator ui
         JOIN usulan_header uh ON uh.id_usulan = ui.id_usulan
         WHERE uh.tahun = $1 AND uh.bulan BETWEEN $3 AND $2 AND uh.status_global ${STATUS_VALID}
         ${kodePkm ? 'AND uh.kode_pkm = $4' : ''}
         GROUP BY ui.no_indikator`,
        kodePkm ? [tahun, bulanAkhir, bulanAwal, kodePkm] : [tahun, bulanAkhir, bulanAwal]
      ),
      pool.query(`SELECT COUNT(*) as total FROM master_puskesmas WHERE aktif=true`),
      // Sinkron dgn Dashboard: COUNT(*) usulan_header per bulan, TANPA filter status (Draft/Ditolak ikut)
      kodePkm
        ? pool.query(`SELECT COUNT(*) as total FROM usulan_header WHERE tahun=$1 AND bulan=$2 AND kode_pkm=$3`, [tahun, bulanAkhir, kodePkm])
        : pool.query(`SELECT COUNT(*) as total FROM usulan_header WHERE tahun=$1 AND bulan=$2`, [tahun, bulanAkhir]),
      // Daftar puskesmas yang SUDAH punya usulan di bulan terpilih (bulanAkhir) — dipakai
      // buat isi dropdown filter Puskesmas, biar yg belum lapor gak muncul sbg pilihan.
      // Sengaja TANPA filter kodePkm supaya dropdown selalu berisi pilihan lengkap terlepas
      // dari puskesmas mana yang sedang dipilih.
      pool.query(
        `SELECT DISTINCT uh.kode_pkm, mp.nama_puskesmas
         FROM usulan_header uh
         JOIN master_puskesmas mp ON mp.kode_pkm = uh.kode_pkm
         WHERE uh.tahun = $1 AND uh.bulan = $2
         ORDER BY mp.nama_puskesmas`,
        [tahun, bulanAkhir]
      )
    ]);

    const targetMap = {};
    targetResult.rows.forEach(r => { targetMap[r.no_indikator] = parseFloat(r.total_target) || 0; });

    const realisasiMap = {};
    realisasiResult.rows.forEach(r => { realisasiMap[r.no_indikator] = r; });

    const totalPuskesmasAktif = kodePkm ? 1 : (parseInt(pkmResult.rows[0]?.total) || 0);
    const pkmLapor = parseInt(pkmLaporResult.rows[0]?.total) || 0;
    const bulanNama = ['','Januari','Februari','Maret','April','Mei','Juni',
      'Juli','Agustus','September','Oktober','November','Desember'];

    const data = indikatorResult.rows.map(mi => {
      const no = mi.no_indikator;
      const targetTahunan = targetMap[no] || 0;
      const rr = realisasiMap[no] || {};
      const realisasiBulanIni = parseFloat(rr.realisasi_bulan_ini) || 0;
      const isKumulatif = !INDIKATOR_NON_KUMULATIF.includes(no);
      // Non-kumulatif: pakai realisasi bulan terakhir dari rentang saja, jangan dijumlah
      // lintas bulan (orang yang dilayani adalah populasi yang sama tiap bulan).
      const realisasiKumulatif = isKumulatif ? (parseFloat(rr.realisasi_kumulatif) || 0) : realisasiBulanIni;
      const persenKumulatif = targetTahunan > 0 ? (realisasiKumulatif / targetTahunan) * 100 : 0;

      return {
        no,
        nama: mi.nama_indikator,
        bobot: mi.bobot || 0,
        targetTahunan,
        realisasiBulanIni,
        realisasiKumulatif,
        persenKumulatif: parseFloat(persenKumulatif.toFixed(2)),
        isKumulatif,
        totalPuskesmasAktif
      };
    });

    // ── Mode "1 indikator, semua puskesmas": rincian per puskesmas utk indikator terpilih ──
    const noIndikator = parseInt(params.noIndikator) || null;
    let dataPkm = null;
    if (noIndikator) {
      const isKumPkm = !INDIKATOR_NON_KUMULATIF.includes(noIndikator);
      const pkmRes = await pool.query(
        `SELECT mp.kode_pkm, mp.nama_puskesmas,
                COALESCE(t.sasaran, 0) AS target,
                COALESCE(r.bulan_ini, 0) AS realisasi_bulan_ini,
                COALESCE(r.kumulatif, 0) AS realisasi_kumulatif,
                (l.kode_pkm IS NOT NULL) AS lapor
         FROM master_puskesmas mp
         LEFT JOIN (
           SELECT kode_pkm, SUM(sasaran) AS sasaran
           FROM target_tahunan WHERE tahun = $1 AND no_indikator = $2 GROUP BY kode_pkm
         ) t ON t.kode_pkm = mp.kode_pkm
         LEFT JOIN (
           SELECT uh.kode_pkm,
                  SUM(CASE WHEN uh.bulan = $3 THEN ui.capaian ELSE 0 END) AS bulan_ini,
                  SUM(ui.capaian) AS kumulatif
           FROM usulan_indikator ui
           JOIN usulan_header uh ON uh.id_usulan = ui.id_usulan
           WHERE uh.tahun = $1 AND ui.no_indikator = $2
             AND uh.bulan BETWEEN $4 AND $3 AND uh.status_global ${STATUS_VALID}
           GROUP BY uh.kode_pkm
         ) r ON r.kode_pkm = mp.kode_pkm
         LEFT JOIN (
           SELECT DISTINCT kode_pkm FROM usulan_header WHERE tahun = $1 AND bulan = $3
         ) l ON l.kode_pkm = mp.kode_pkm
         WHERE mp.aktif = true
         ORDER BY mp.nama_puskesmas`,
        [tahun, noIndikator, bulanAkhir, bulanAwal]
      );
      dataPkm = pkmRes.rows.map(x => {
        const target = parseFloat(x.target) || 0;
        const bulanIni = parseFloat(x.realisasi_bulan_ini) || 0;
        const kum = isKumPkm ? (parseFloat(x.realisasi_kumulatif) || 0) : bulanIni;
        return {
          kode: x.kode_pkm,
          nama: x.nama_puskesmas,
          targetTahunan: target,
          realisasiBulanIni: bulanIni,
          realisasiKumulatif: kum,
          persenKumulatif: target > 0 ? parseFloat(((kum / target) * 100).toFixed(2)) : null,
          lapor: !!x.lapor
        };
      });
    }

    return ok({
      tahun,
      bulan: bulanAkhir,
      bulanAwal,
      bulanAkhir,
      namaBulan: bulanNama[bulanAkhir] || '',
      namaBulanAwal: bulanNama[bulanAwal] || '',
      namaBulanAkhir: bulanNama[bulanAkhir] || '',
      totalPuskesmasAktif,
      pkmLapor,
      pkmLaporList: pkmLaporListResult.rows.map(r => ({ kode: r.kode_pkm, nama: r.nama_puskesmas })),
      kodePkm,
      noIndikator,
      dataPkm,
      data
    });
  } catch (e) {
    console.error('Laporan kabupaten error:', e);
    return err('Error: ' + e.message, 500);
  }
};
