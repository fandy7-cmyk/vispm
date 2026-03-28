const { getPool, ok, err, cors } = require('./db');
const { parseIndikatorAkses, logAktivitas, mapHeader } = require('./usulan-helpers');
async function getUsulanList(pool, params) {
  let where = [], qParams = [], idx = 1;
  if (params.email_operator) { where.push(`uh.created_by=$${idx++}`); qParams.push(params.email_operator); }
  if (params.kode_pkm) { where.push(`uh.kode_pkm=$${idx++}`); qParams.push(params.kode_pkm); }
  if (params.tahun) { where.push(`uh.tahun=$${idx++}`); qParams.push(parseInt(params.tahun)); }
  if (params.bulan && params.bulan !== 'semua') { where.push(`uh.bulan=$${idx++}`); qParams.push(parseInt(params.bulan)); }
  if (params.status && params.status !== 'semua') { where.push(`uh.status_global=$${idx++}`); qParams.push(params.status); }
  if (params.awaiting_admin === 'true') where.push(`uh.status_global='Menunggu Admin'`);

  // Filter khusus Pengelola Program: tampilkan semua usulan yang ditugaskan ke user ini
  // termasuk yang sudah Selesai (untuk tampilkan tombol hijau)
  if (params.status_program && params.email_program) {
    const ALLOWED_STATUSES = ['Menunggu Pengelola Program','Menunggu Admin','Selesai','Ditolak','Ditolak Sebagian','Draft','Menunggu Kepala Puskesmas'];
    const statuses = params.status_program.split(',').map(s => s.trim()).filter(s => ALLOWED_STATUSES.includes(s));
    if (statuses.length > 0) {
      const placeholders = statuses.map(() => `$${idx++}`).join(',');
      where.push(`uh.status_global IN (${placeholders})`);
      qParams.push(...statuses);
    }
    // Tampilkan semua yang punya record di verifikasi_program (sudah/belum verifikasi)
    where.push(`EXISTS (
      SELECT 1 FROM verifikasi_program vp
      WHERE vp.id_usulan = uh.id_usulan
      AND LOWER(vp.email_program) = LOWER($${idx++})
    )`);
    qParams.push(params.email_program);
  }

  const ws = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const result = await pool.query(
    `SELECT uh.*, p.nama_puskesmas FROM usulan_header uh LEFT JOIN master_puskesmas p ON uh.kode_pkm=p.kode_pkm ${ws} ORDER BY uh.created_at DESC LIMIT 500`,
    qParams
  );
  if (result.rows.length === 0) return ok([]);
  const ids = result.rows.map(r => r.id_usulan);
  const ditolakIds = result.rows.filter(r => r.ditolak_oleh).map(r => r.id_usulan);

  // Jalankan semua query sekunder secara paralel
  const [vpResult, svResult, piReVerifResult, piAllResult] = await Promise.all([
    pool.query(
      `SELECT id_usulan, COUNT(*) as total, COUNT(CASE WHEN status='Selesai' THEN 1 END) as selesai FROM verifikasi_program WHERE id_usulan=ANY($1) GROUP BY id_usulan`,
      [ids]
    ),
    params.email_program
  ? pool.query(
      `SELECT vp.id_usulan, vp.status, vp.indikator_akses, vp.verified_at, uh.ditolak_oleh, uh.konteks_penolakan
       FROM verifikasi_program vp
       JOIN usulan_header uh ON vp.id_usulan = uh.id_usulan
       WHERE vp.id_usulan=ANY($1) AND LOWER(vp.email_program)=LOWER($2)`,
      [ids, params.email_program]
    )
  : Promise.resolve({ rows: [] }),
    params.email_program && ids.length > 0
      ? pool.query(
          // FIX: query lama pakai filter email_program != email_admin sehingga baris Admin
          // (email_program = email_admin, aksi='tolak') tidak pernah masuk piReVerifMap.
          // Akibatnya saat Admin tolak indikator, piReVerifMap kosong → semua PP dianggap sudahVerif=true.
          // Perbaikan: ambil DUA jenis baris:
          //   1. Baris PP (email_program != email_admin) — skenario PP tolak (aksi NULL/tolak/reset)
          //   2. Baris Admin (email_program = email_admin, aksi='tolak') — skenario Admin tolak
          // Tambahkan kolom dari_admin untuk membedakan keduanya di sudahVerifMap.
          `SELECT id_usulan, no_indikator,
                  MAX(created_at) as latest_created_at
           FROM penolakan_indikator
           WHERE id_usulan=ANY($1)
           AND LOWER(email_program)=LOWER($2)
             AND (
               (email_program != email_admin AND (aksi IS NULL OR aksi='tolak' OR aksi='reset'))
               OR (email_program = email_admin AND aksi = 'tolak')
               OR (dibuat_oleh = 'Admin' AND aksi = 'tolak')
               OR (aksi = 'kapus-ok')
             )
           GROUP BY id_usulan, no_indikator`,
          [ids, params.email_program]
        ).catch(() => ({ rows: [] }))
      : Promise.resolve({ rows: [] }),
    ditolakIds.length > 0
      ? pool.query(
          `SELECT pi.id_usulan, pi.no_indikator, pi.alasan, pi.aksi, pi.catatan_program, pi.email_program, vp.nama_program,
                  -- dari_kapus=TRUE hanya untuk indikator yang HARUS diperbaiki Operator.
                  -- kapus-ok/kapus-setuju = disanggah Kapus → PP re-verif, bukan Operator
                  (
                    (pi.dibuat_oleh = 'Kapus' AND pi.aksi NOT IN ('kapus-ok','kapus-setuju'))
                    OR (pi.dibuat_oleh IS NULL AND (pi.aksi IS NULL OR pi.aksi = 'tolak' OR pi.aksi = 'reset'))
                    OR (pi.dibuat_oleh = 'PP' AND pi.aksi = 'tolak')
                    OR (pi.dibuat_oleh = 'Admin' AND pi.aksi = 'tolak' AND pi.responded_at IS NULL)
                  ) AS dari_kapus
           FROM penolakan_indikator pi
           LEFT JOIN verifikasi_program vp ON pi.id_usulan=vp.id_usulan AND LOWER(pi.email_program)=LOWER(vp.email_program)
           WHERE pi.id_usulan=ANY($1)
             AND (pi.aksi IS NULL OR pi.aksi='tolak' OR pi.aksi='sanggah' OR pi.aksi='reset' OR pi.aksi='kapus-ok')
             -- EXCLUDE baris PP (aksi='tolak') untuk indikator yang sudah ada kapus-setuju atau kapus-ok
             -- submitUsulan menghapus baris PP sebelum hapus kapus-setuju, tapi sebagai safety net
             -- tambahkan juga filter EXISTS untuk menangkap edge case kapus-setuju masih ada
             AND NOT (
               pi.email_program != pi.email_admin
               AND pi.aksi = 'tolak'
               AND EXISTS (
                 SELECT 1 FROM penolakan_indikator ks
                 WHERE ks.id_usulan = pi.id_usulan
                   AND ks.no_indikator = pi.no_indikator
                   AND ks.aksi IN ('kapus-setuju', 'kapus-ok')
               )
             )
           ORDER BY pi.no_indikator`,
          [ditolakIds]
        ).catch(() => ({ rows: [] }))
      : Promise.resolve({ rows: [] }),
  ]);

  const vpMap = {};
  vpResult.rows.forEach(r => { vpMap[r.id_usulan] = { total: parseInt(r.total), selesai: parseInt(r.selesai) }; });

  // Cek sudahVerif dan myVerifStatus untuk Pengelola Program yang sedang login
  let sudahVerifMap = {};
  let myVerifStatusMap = {};
  if (params.email_program) {
    // piReVerifMap GLOBAL: id_usulan → { noIndikator → latest_created_at penolakan }
    // Aturan: PP wajib re-verifikasi jika ada no_indikator bermasalah yang BERIRISAN
    // dengan aksesnya DAN penolakan itu dibuat SETELAH verified_at PP terakhir.
    const piReVerifMap = {}; // id_usulan → Map(noIndikator → latest_created_at)
    piReVerifResult.rows.forEach(p => {
      if (!piReVerifMap[p.id_usulan]) piReVerifMap[p.id_usulan] = {};
      const no = parseInt(p.no_indikator);
      const existing = piReVerifMap[p.id_usulan][no];
      const cur = p.latest_created_at ? new Date(p.latest_created_at) : new Date(0);
      if (!existing || cur > new Date(existing)) piReVerifMap[p.id_usulan][no] = p.latest_created_at;
    });

    // Helper: true jika ada no_indikator bermasalah yang:
    //   1. Beririsan dengan akses PP ini, DAN
    //   2. Penolakan dibuat SETELAH verified_at PP (artinya PP belum verif setelah penolakan ini)
    const adaIrisanDenganAkses = (idUsulan, indikatorAksesStr, verifiedAt) => {
      const noMap = piReVerifMap[idUsulan] || {};
      const noList = Object.keys(noMap).map(Number);
      if (!noList.length) return false;
      const aksesArr = (indikatorAksesStr || '').split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
      const kandidat = aksesArr.length === 0 ? noList : noList.filter(n => aksesArr.includes(n));
      if (!kandidat.length) return false;
      // Jika PP belum pernah verif (verified_at null) → pasti perlu re-verif
      if (!verifiedAt) return true;
      const vpVerifTime = new Date(verifiedAt);
      // Ada irisan jika ada indikator kandidat yang penolakannnya dibuat SETELAH verified_at PP
      return kandidat.some(n => {
        const penolakanTime = noMap[n] ? new Date(noMap[n]) : new Date(0);
        return penolakanTime > vpVerifTime;
      });
    };

    svResult.rows.forEach(r => {
      const isSelesaiOrDitolak = r.status === 'Selesai' || r.status === 'Ditolak';
      const isMenunggu = r.status === 'Menunggu';

      if (isMenunggu) {
        // isReVerifAktif: ada penolakan aktif yang memicu re-verif PP
        // - ditolak_oleh='Pengelola Program' → Kapus sanggah penolakan PP, PP re-verif
        // - ditolak_oleh='Admin' → Admin tolak, PP perlu respond/re-verif
        // - konteks_penolakan='Admin' → PP sudah sanggah Admin, kembali ke Admin (PP sudah done)
        //   TAPI: jika status VP masih Menunggu di sini, berarti PP belum respond → tetap re-verif
        const isReVerifAktif = r.ditolak_oleh === 'Pengelola Program'
          || r.ditolak_oleh === 'Admin'
          || r.konteks_penolakan === 'Admin';
        if (isReVerifAktif) {
          // sudahVerif = true hanya jika tidak ada irisan antara indikator bermasalah
          // dengan akses PP ini. Ada irisan = wajib re-verifikasi.
          sudahVerifMap[r.id_usulan] = !adaIrisanDenganAkses(r.id_usulan, r.indikator_akses, r.verified_at);
        } else {
          // Siklus normal — status Menunggu = belum verif, wajib aksi
          sudahVerifMap[r.id_usulan] = false;
        }
        myVerifStatusMap[r.id_usulan] = r.status;
        return;
      }

      // Status='Selesai'/'Ditolak' → cek apakah PP ini masih punya tanggungan re-verif
      const isReVerifPP = r.ditolak_oleh === 'Pengelola Program';
      const isReVerifAdmin = r.ditolak_oleh === 'Admin' || r.konteks_penolakan === 'Admin';
      let tidakTerkenaReVerif = false;
      if ((isReVerifPP || isReVerifAdmin) && isSelesaiOrDitolak) {
        // sudahVerif = true jika tidak ada lagi irisan indikator bermasalah dengan akses PP ini
        tidakTerkenaReVerif = !adaIrisanDenganAkses(r.id_usulan, r.indikator_akses, r.verified_at);
      }
      sudahVerifMap[r.id_usulan] = (isReVerifPP || isReVerifAdmin) ? tidakTerkenaReVerif : isSelesaiOrDitolak;
      myVerifStatusMap[r.id_usulan] = r.status;
    });
  }

  // Gunakan piAllResult yang sudah di-fetch secara paralel di atas
  // BUG FIX: piAllResult bisa menghasilkan MULTIPLE baris untuk no_indikator yang sama
  // (1 baris Admin + N baris PP yang pernah respond) karena tidak ada DISTINCT.
  // Sebelum masuk piMap, deduplikasi per (id_usulan, no_indikator):
  //   - Ambil aksi dengan prioritas tertinggi: tolak > NULL > reset > sanggah > kapus-ok
  //   - dari_kapus: true jika ada SALAH SATU baris yang dari_kapus=true
  //   - namaProgram: ambil dari baris Admin/Kapus jika ada, fallback ke baris pertama
  const aksiPriority = (aksi) => {
    if (!aksi) return 1;
    if (aksi === 'tolak')    return 0;
    if (aksi === 'reset')    return 2;
    if (aksi === 'sanggah')  return 3;
    if (aksi === 'kapus-ok') return 4;
    return 5;
  };
  // Kumpulkan semua baris per (id_usulan, no_indikator)
  const piRawMap = {}; // key: "id_usulan|no_indikator" → array baris
  piAllResult.rows.forEach(p => {
    const key = `${p.id_usulan}|${p.no_indikator}`;
    if (!piRawMap[key]) piRawMap[key] = [];
    piRawMap[key].push(p);
  });
  // Deduplikasi: satu baris per (id_usulan, no_indikator)
  let piMap = {};
  Object.values(piRawMap).forEach(baris => {
    // Ambil baris dengan aksi prioritas tertinggi
    baris.sort((a, b) => aksiPriority(a.aksi) - aksiPriority(b.aksi));
    const best = baris[0];
    // dari_kapus: true jika ada salah satu baris dengan dari_kapus=true
    const dariKapus = baris.some(b => b.dari_kapus === true || b.dari_kapus === 'true');
    // catatan_program: pakai dari baris paling prioritas (sudah di-aggregate di DB)
    const id = best.id_usulan;
    if (!piMap[id]) piMap[id] = [];
    piMap[id].push({
      noIndikator: best.no_indikator,
      alasan: best.alasan,
      aksi: best.aksi,
      catatanProgram: best.catatan_program || '',
      emailProgram: best.email_program || '',
      namaProgram: best.nama_program || '',
      dari_kapus: dariKapus
    });
  });

  return ok(result.rows.map(r => {
    const pi = piMap[r.id_usulan] || [];
    // Auto-koreksi data lama: Admin tolak tapi status_global masih 'Ditolak' dan PP belum respon
    const belumRespon = pi.filter(p => !p.aksi);
    let statusGlobalFix = r.status_global;
    if (r.ditolak_oleh === 'Admin' && r.status_global === 'Ditolak' && belumRespon.length > 0) {
      statusGlobalFix = 'Menunggu Pengelola Program';
      // Update DB di background (fire and forget)
      pool.query(`UPDATE usulan_header SET status_global='Menunggu Pengelola Program', is_locked=true WHERE id_usulan=$1 AND status_global='Ditolak' AND ditolak_oleh='Admin'`, [r.id_usulan]).catch(()=>{});
    }
    return ({
    ...mapHeader(r),
    statusGlobal: statusGlobalFix,
    vpProgress: vpMap[r.id_usulan] || null,
    sudahVerif: sudahVerifMap[r.id_usulan] || false,
    myVerifStatus: myVerifStatusMap[r.id_usulan] || null,
    penolakanIndikator: pi
  });
  }));
}

async function getUsulanDetail(pool, idUsulan) {
  if (!idUsulan) return err('ID usulan diperlukan');
  const result = await pool.query(
    `SELECT uh.*, p.nama_puskesmas, p.indeks_kesulitan_wilayah, u.nama as nama_pembuat FROM usulan_header uh LEFT JOIN master_puskesmas p ON uh.kode_pkm=p.kode_pkm LEFT JOIN users u ON uh.created_by=u.email WHERE uh.id_usulan=$1`,
    [idUsulan]
  );
  if (result.rows.length === 0) return err('Usulan tidak ditemukan', 404);
  const vpResult = await pool.query(
    `SELECT email_program, nama_program, nip_program, jabatan_program, indikator_akses, status, catatan, sanggahan, verified_at FROM verifikasi_program WHERE id_usulan=$1 ORDER BY created_at`,
    [idUsulan]
  );
  const piResult = await pool.query(
  `SELECT DISTINCT ON (no_indikator, dibuat_oleh, email_program)
     no_indikator,
     id_usulan,
     dibuat_oleh,
     -- Ambil alasan dari baris yang paling relevan (tolak > sanggah > NULL)
     FIRST_VALUE(alasan) OVER (PARTITION BY no_indikator, dibuat_oleh, email_program ORDER BY CASE aksi WHEN 'tolak' THEN 0 WHEN 'reset' THEN 1 WHEN 'sanggah' THEN 2 ELSE 3 END) as alasan,
     -- aksi final per indikator+pembuat+email_program
     aksi,
     -- dari_kapus: TRUE jika indikator ini perlu diperbaiki Operator.
     -- Kasus 1: Kapus tolak sendiri (dibuat_oleh='Kapus'/NULL)
     -- Kasus 2: Kapus membenarkan penolakan PP (dibuat_oleh='PP', aksi='tolak')
     -- Kasus 3: Kapus membenarkan penolakan Admin (dibuat_oleh='Admin', aksi='tolak' tanpa responded_at)
     (dibuat_oleh = 'Kapus' OR dibuat_oleh IS NULL
       OR (dibuat_oleh = 'PP' AND aksi = 'tolak'
           AND NOT EXISTS (
             SELECT 1 FROM penolakan_indikator ks
             WHERE ks.id_usulan = penolakan_indikator.id_usulan
               AND ks.no_indikator = penolakan_indikator.no_indikator
               AND ks.aksi IN ('kapus-ok', 'kapus-setuju')
           ))
       OR (dibuat_oleh = 'Admin' AND aksi = 'tolak' AND responded_at IS NULL)
     ) as dari_kapus,
     -- Gabungkan semua catatan PP untuk ditampilkan ke Kapus/Admin
     STRING_AGG(CASE WHEN catatan_program IS NOT NULL AND catatan_program != ''
       THEN email_program || ': ' || catatan_program END, ' | ')
       OVER (PARTITION BY no_indikator) as catatan_program,
     email_admin,
     email_program,
     created_at,
     responded_at
   FROM penolakan_indikator
   WHERE id_usulan=$1 AND (aksi IS NULL OR aksi='tolak' OR aksi='sanggah' OR aksi='reset' OR aksi='kapus-ok')
   ORDER BY no_indikator, dibuat_oleh, email_program, CASE aksi WHEN 'tolak' THEN 0 WHEN 'reset' THEN 1 WHEN 'sanggah' THEN 2 ELSE 3 END`,
  [idUsulan]
  ).catch(() => ({ rows: [] }));
  const detail = mapHeader(result.rows[0]);
  detail.verifikasiProgram = vpResult.rows;
  // Kirim penolakanIndikator jika:
  // 1. ditolak_oleh tidak null (penolakan aktif normal), ATAU
  // 2. Ada baris penolakan di DB meskipun ditolak_oleh sudah NULL —
  //    ini terjadi saat Kapus sanggah penolakan PP: ditolak_oleh di-NULL-kan
  //    (agar frontend tidak salah baca status), tapi baris dibuat_oleh='PP'
  //    di penolakan_indikator masih dibutuhkan PP untuk re-verifikasi indikatornya.
  detail.penolakanIndikator = (detail.ditolakOleh || piResult.rows.length > 0) ? piResult.rows : [];
  return ok(detail);
}

async function getIndikatorUsulan(pool, idUsulan) {
  if (!idUsulan) return err('ID usulan diperlukan');
  // Ambil header dulu untuk kode_pkm dan tahun
  const hdr = await pool.query(`SELECT kode_pkm, tahun FROM usulan_header WHERE id_usulan=$1`, [idUsulan]);
  if (!hdr.rows.length) return err('Usulan tidak ditemukan');
  const { kode_pkm, tahun } = hdr.rows[0];

  const result = await pool.query(
    `SELECT ui.*, mi.nama_indikator,
            COALESCE(tt.sasaran, 0) as sasaran_tahunan,
            -- Total realisasi kumulatif semua bulan tahun ini (status aktif, bukan Draft/Ditolak)
            COALESCE((
              SELECT SUM(ui2.capaian)
              FROM usulan_indikator ui2
              JOIN usulan_header uh2 ON uh2.id_usulan = ui2.id_usulan
              WHERE uh2.kode_pkm = $2
                AND uh2.tahun = $3
                AND ui2.no_indikator = ui.no_indikator
                AND uh2.status_global NOT IN ('Draft', 'Ditolak', 'Ditolak Sebagian')
            ), 0) as realisasi_kumulatif
     FROM usulan_indikator ui
     LEFT JOIN master_indikator mi ON ui.no_indikator = mi.no_indikator
     LEFT JOIN target_tahunan tt ON tt.kode_pkm = $2 AND tt.no_indikator = ui.no_indikator AND tt.tahun = $3
     WHERE ui.id_usulan = $1 ORDER BY ui.no_indikator`,
    [idUsulan, kode_pkm, tahun]
  );
  return ok(result.rows.map(r => ({
    id: r.id, no: r.no_indikator, nama: r.nama_indikator,
    target: parseFloat(r.target)||0, capaian: parseFloat(r.capaian)||0,
    realisasiRasio: parseFloat(r.realisasi_rasio)||0, bobot: r.bobot||0,
    nilaiTerbobot: parseFloat(r.nilai_terbobot)||0, status: r.status||'Draft',
    approvedBy: r.approved_by||'', approvedRole: r.approved_role||'',
    approvedAt: r.approved_at, catatan: r.catatan||'', linkFile: r.link_file||'',
    sasaranTahunan: parseInt(r.sasaran_tahunan)||0,
    realisasiKumulatif: parseFloat(r.realisasi_kumulatif)||0
  })));
}

async function getProgramVerifStatus(pool, idUsulan) {
  if (!idUsulan) return err('ID usulan diperlukan');
  const result = await pool.query(
    `SELECT email_program, nama_program, nip_program, jabatan_program, indikator_akses, status, catatan, verified_at FROM verifikasi_program WHERE id_usulan=$1 ORDER BY created_at`,
    [idUsulan]
  );
  return ok(result.rows);
}

async function saveDriveFolder(pool, body) {
  const { idUsulan, driveFolderId, driveFolderUrl } = body;
  await pool.query(`UPDATE usulan_header SET drive_folder_id=$1, drive_folder_url=$2 WHERE id_usulan=$3`, [driveFolderId, driveFolderUrl, idUsulan]);
  return ok({ message: 'Folder Drive disimpan' });
}


module.exports = { getUsulanList, getUsulanDetail, getIndikatorUsulan, getProgramVerifStatus, saveDriveFolder };