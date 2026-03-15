const { getPool, ok, err, cors } = require('./db');

let _migrated = false;
async function runMigrations(pool) {
  if (_migrated) return;
  await Promise.all([
    pool.query(`ALTER TABLE verifikasi_program ADD COLUMN IF NOT EXISTS nip_program VARCHAR(50)`).catch(()=>{}),
    pool.query(`ALTER TABLE verifikasi_program ADD COLUMN IF NOT EXISTS jabatan_program TEXT`).catch(()=>{}),
    pool.query(`ALTER TABLE verifikasi_program ADD COLUMN IF NOT EXISTS sanggahan TEXT`).catch(()=>{}),
    pool.query(`ALTER TABLE usulan_header ADD COLUMN IF NOT EXISTS ditolak_oleh VARCHAR(50)`).catch(()=>{}),
    pool.query(`CREATE TABLE IF NOT EXISTS penolakan_indikator (
      id SERIAL PRIMARY KEY,
      id_usulan VARCHAR(50) NOT NULL,
      no_indikator INT NOT NULL,
      alasan TEXT NOT NULL,
      email_admin VARCHAR(200) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      email_program VARCHAR(200),
      aksi VARCHAR(20),
      catatan_program TEXT,
      responded_at TIMESTAMPTZ,
      UNIQUE(id_usulan, no_indikator)
    )`).catch(()=>{}),
  ]);
  _migrated = true;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();
  const pool = getPool();
  await runMigrations(pool);
  const method = event.httpMethod;
  const params = event.queryStringParameters || {};
  const path = params.action || '';
  try {
    if (method === 'GET' && !path) return await getUsulanList(pool, params);
    if (method === 'GET' && path === 'detail') return await getUsulanDetail(pool, params.id);
    if (method === 'GET' && path === 'indikator') return await getIndikatorUsulan(pool, params.id);
    if (method === 'GET' && path === 'program-status') return await getProgramVerifStatus(pool, params.id);
    const body = JSON.parse(event.body || '{}');
    if (method === 'POST' && path === 'buat') return await buatUsulan(pool, body);
    if (method === 'PUT' && path === 'indikator') return await updateIndikator(pool, body);
    if (method === 'POST' && path === 'submit') return await submitUsulan(pool, body);
    if (method === 'POST' && path === 'verif-kapus')   return await verifKapus(pool, body);
    if (method === 'POST' && path === 'verif-program') return await verifProgram(pool, body);
    if (method === 'POST' && path === 'verif-admin')   return await verifAdmin(pool, body);
    if (method === 'POST' && path === 'reject') return await rejectUsulan(pool, body);
    if (method === 'GET'  && path === 'log') return await getLogAktivitas(pool, params.id);
    if (method === 'GET'  && path === 'penolakan') return await getPenolakanIndikator(pool, params);
    if (method === 'POST' && path === 'respond-penolakan') return await respondPenolakan(pool, body);
    if (method === 'PUT' && path === 'drive-folder') return await saveDriveFolder(pool, body);
    if (method === 'POST' && path === 'admin-reset') return await adminResetUsulan(pool, body);
    if (method === 'POST' && path === 'restore-verif') return await restoreVerifStatus(pool, body);
    if (method === 'DELETE') {
      const { idUsulan } = body; // body sudah di-parse di atas
      if (!idUsulan) return err('idUsulan diperlukan');
      // Hapus cascade manual karena mungkin belum ada foreign key
      await pool.query('DELETE FROM log_aktivitas WHERE id_usulan=$1', [idUsulan]).catch(()=>{});
      await pool.query('DELETE FROM verifikasi_program WHERE id_usulan=$1', [idUsulan]);
      await pool.query('DELETE FROM usulan_indikator WHERE id_usulan=$1', [idUsulan]);
      await pool.query('DELETE FROM usulan_header WHERE id_usulan=$1', [idUsulan]);
      return ok({ message: 'Usulan berhasil dihapus' });
    }
    return err('Action tidak ditemukan', 404);
  } catch (e) {
    console.error('Usulan error:', e);
    return err('Error: ' + e.message, 500);
  }
};

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
    const statuses = params.status_program.split(',').map(s => `'${s.trim()}'`).join(',');
    where.push(`uh.status_global IN (${statuses})`);
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
          `SELECT vp.id_usulan, vp.status, vp.indikator_akses, uh.ditolak_oleh
           FROM verifikasi_program vp
           JOIN usulan_header uh ON vp.id_usulan = uh.id_usulan
           WHERE vp.id_usulan=ANY($1) AND LOWER(vp.email_program)=LOWER($2)`,
          [ids, params.email_program]
        )
      : Promise.resolve({ rows: [] }),
    params.email_program && ids.length > 0
      ? pool.query(
          `SELECT id_usulan, no_indikator FROM penolakan_indikator WHERE id_usulan=ANY($1) AND (aksi IS NULL OR aksi='tolak')`,
          [ids]
        ).catch(() => ({ rows: [] }))
      : Promise.resolve({ rows: [] }),
    ditolakIds.length > 0
      ? pool.query(
          `SELECT pi.id_usulan, pi.no_indikator, pi.alasan, pi.aksi, pi.catatan_program, pi.email_program, vp.nama_program FROM penolakan_indikator pi LEFT JOIN verifikasi_program vp ON pi.id_usulan=vp.id_usulan AND LOWER(pi.email_program)=LOWER(vp.email_program) WHERE pi.id_usulan=ANY($1) ORDER BY pi.no_indikator`,
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
    const piReVerifMap = {};
    piReVerifResult.rows.forEach(p => {
      if (!piReVerifMap[p.id_usulan]) piReVerifMap[p.id_usulan] = [];
      piReVerifMap[p.id_usulan].push(parseInt(p.no_indikator));
    });

    svResult.rows.forEach(r => {
      const isSelesaiOrDitolak = r.status === 'Selesai' || r.status === 'Ditolak';
      // Saat re-verifikasi PP aktif: PP yang tidak punya indikator bermasalah dianggap sudahVerif
      // agar tidak muncul di dashboard dan tidak dipaksa verif ulang
      const isReVerifPP = r.ditolak_oleh === 'Pengelola Program';
      const isReVerifAdmin = r.ditolak_oleh === 'Admin';
      let tidakTerkenaReVerif = false;
      if ((isReVerifPP || isReVerifAdmin) && !isSelesaiOrDitolak) {
        const penolakanNos = piReVerifMap[r.id_usulan] || [];
        const aksesArr = (r.indikator_akses || '').split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
        // Jika aksesArr kosong = PP bertanggung jawab atas semua indikator → selalu terkena re-verif
        // PP tidak terkena re-verif hanya jika aksesnya TERDEFINISI dan tidak ada irisan dengan penolakan
        const adaIrisan = aksesArr.length === 0
          ? penolakanNos.length > 0  // akses kosong = semua indikator → terkena jika ada penolakan
          : aksesArr.some(n => penolakanNos.includes(n));
        tidakTerkenaReVerif = penolakanNos.length > 0 && !adaIrisan;
      }
      sudahVerifMap[r.id_usulan] = isSelesaiOrDitolak || tidakTerkenaReVerif;
      myVerifStatusMap[r.id_usulan] = r.status;
    });
  }

  // Gunakan piAllResult yang sudah di-fetch secara paralel di atas
  let piMap = {};
  piAllResult.rows.forEach(p => {
    if (!piMap[p.id_usulan]) piMap[p.id_usulan] = [];
    piMap[p.id_usulan].push({ noIndikator: p.no_indikator, alasan: p.alasan, aksi: p.aksi, catatanProgram: p.catatan_program || '', emailProgram: p.email_program || '', namaProgram: p.nama_program || '' });
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
    `SELECT * FROM penolakan_indikator WHERE id_usulan=$1 AND (aksi IS NULL OR aksi='tolak') ORDER BY no_indikator`,
    [idUsulan]
  ).catch(() => ({ rows: [] }));
  const detail = mapHeader(result.rows[0]);
  detail.verifikasiProgram = vpResult.rows;
  // Hanya kembalikan penolakanIndikator jika penolakan masih aktif (ditolak_oleh tidak null).
  // Jika ditolak_oleh sudah NULL, data penolakan lama di DB tidak relevan lagi.
  detail.penolakanIndikator = detail.ditolakOleh ? piResult.rows : [];
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
                AND uh2.status_global NOT IN ('Draft', 'Ditolak')
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

async function buatUsulan(pool, body) {
  const { kodePKM, tahun, bulan, emailOperator } = body;
  // Selalu gunakan waktu server (UTC) agar konsisten dan tidak bergantung jam PC user
  if (!kodePKM || !tahun || !bulan || !emailOperator) return err('Data tidak lengkap');
  const periodeCheck = await pool.query(
    `SELECT id, tanggal_mulai, tanggal_selesai, jam_mulai, jam_selesai FROM periode_input
     WHERE tahun=$1 AND bulan=$2 AND status='Aktif'`,
    [tahun, bulan]
  );
  if (periodeCheck.rows.length === 0) return err('Periode input untuk bulan/tahun ini belum diaktifkan. Hubungi Admin.');
  // Cek rentang tanggal DAN jam jika ada
  const p = periodeCheck.rows[0];
  if (p.tanggal_mulai && p.tanggal_selesai) {
    const now = new Date();
    const today = new Date(now); today.setHours(0,0,0,0);
    const mulai = new Date(p.tanggal_mulai); mulai.setHours(0,0,0,0);
    const selesai = new Date(p.tanggal_selesai); selesai.setHours(23,59,59);
    if (today < mulai) return err(`Periode input belum dimulai. Mulai ${mulai.toLocaleDateString('id-ID')}.`);
    if (today > selesai) return err(`Periode input sudah ditutup pada ${selesai.toLocaleDateString('id-ID')}.`);

    // Validasi jam dinonaktifkan — cukup validasi tanggal saja
  }
  const dupCheck = await pool.query(`SELECT id_usulan FROM usulan_header WHERE created_by=$1 AND tahun=$2 AND bulan=$3`, [emailOperator, tahun, bulan]);
  if (dupCheck.rows.length > 0) return err(`Anda sudah memiliki usulan untuk periode ini (${dupCheck.rows[0].id_usulan}). Setiap operator hanya dapat mengajukan 1 usulan per periode.`);
  const periodeKey = `${tahun}-${String(bulan).padStart(2,'0')}-01`;
  const idUsulan = `${kodePKM}-${tahun}-${String(bulan).padStart(2,'0')}`;
  const existing = await pool.query('SELECT id_usulan FROM usulan_header WHERE id_usulan=$1', [idUsulan]);
  if (existing.rows.length > 0) return err('Usulan untuk puskesmas ini di periode ini sudah ada');

  const [pkmResult, indResult, ppResult] = await Promise.all([
    pool.query('SELECT indeks_beban_kerja FROM master_puskesmas WHERE kode_pkm=$1', [kodePKM]),
    pool.query('SELECT no_indikator, bobot FROM master_indikator WHERE aktif=true ORDER BY no_indikator'),
    pool.query(`SELECT email, nama, nip, jabatan, indikator_akses FROM users WHERE role='Pengelola Program' AND aktif=true`),
  ]);
  const indeksBeban = pkmResult.rows.length > 0 ? parseFloat(pkmResult.rows[0].indeks_beban_kerja)||0 : 0;
  const totalBobot = indResult.rows.reduce((s,r) => s+(parseInt(r.bobot)||0), 0);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO usulan_header (id_usulan,tahun,bulan,periode_key,kode_pkm,total_nilai,total_bobot,indeks_kinerja_spm,indeks_beban_kerja,indeks_spm,status_kapus,status_program,status_final,status_global,is_locked,created_by,created_at)
       VALUES ($1,$2,$3,$4,$5,0,$6,0,$7,0,'Menunggu','Menunggu','Menunggu','Draft',false,$8,NOW())`,
      [idUsulan,tahun,bulan,periodeKey,kodePKM,totalBobot,indeksBeban,emailOperator]
    );
    for (const ind of indResult.rows) {
      await client.query(`INSERT INTO usulan_indikator (id_usulan,no_indikator,target,capaian,realisasi_rasio,bobot,nilai_terbobot,status) VALUES ($1,$2,0,0,0,$3,0,'Draft')`, [idUsulan,ind.no_indikator,parseInt(ind.bobot)||0]);
    }
    for (const pp of ppResult.rows) {
      await client.query(
        `INSERT INTO verifikasi_program (id_usulan,email_program,nama_program,nip_program,jabatan_program,indikator_akses,status,created_at) VALUES ($1,$2,$3,$4,$5,$6,'Menunggu',NOW())`,
        [idUsulan, pp.email, pp.nama, pp.nip||null, pp.jabatan||null, pp.indikator_akses||'']
      );
    }
    await client.query('COMMIT');
    return ok({ idUsulan, message: 'Usulan berhasil dibuat' });
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}

// Nomor indikator yang target bulannya selalu = target tahunan (Hipertensi & DM)
const INDIKATOR_TARGET_KUNCI = [8, 9];

async function updateIndikator(pool, body) {
  const { idUsulan, noIndikator, target, capaian, catatan, linkFile } = body;

  const lockCheck = await pool.query('SELECT is_locked, status_global, kode_pkm, tahun FROM usulan_header WHERE id_usulan=$1', [idUsulan]);
  if (lockCheck.rows.length === 0) return err('Usulan tidak ditemukan');
  const { is_locked, status_global, kode_pkm, tahun } = lockCheck.rows[0];
  // Boleh edit kalau: tidak terkunci, ATAU status Ditolak (operator perbaiki)
  if (is_locked && status_global !== 'Ditolak') return err('Usulan sudah terkunci dan tidak dapat diedit');

  let t = parseFloat(target) || 0;
  let c = parseFloat(capaian) || 0;

  // Untuk indikator kunci (8 & 9): target bulan selalu = sasaran tahunan
  if (INDIKATOR_TARGET_KUNCI.includes(parseInt(noIndikator))) {
    const ttRes = await pool.query(
      'SELECT sasaran FROM target_tahunan WHERE kode_pkm=$1 AND no_indikator=$2 AND tahun=$3 LIMIT 1',
      [kode_pkm, noIndikator, tahun]
    ).catch(() => ({ rows: [] }));
    const sasaranTahunan = ttRes.rows.length > 0 ? (parseInt(ttRes.rows[0].sasaran) || 0) : 0;
    if (sasaranTahunan > 0) {
      t = sasaranTahunan;
      // Clamp realisasi agar tidak melebihi sasaran tahunan
      if (c > sasaranTahunan) c = sasaranTahunan;
    }
  }

  // Rumus rasio: capaian / target, maks 1.00, 2 angka di belakang koma
  let rasio = 0;
  if (t > 0) rasio = Math.round(Math.min(c / t, 1) * 100) / 100;

  // Ambil bobot indikator ini
  const bobotRes = await pool.query(
    'SELECT bobot FROM usulan_indikator WHERE id_usulan=$1 AND no_indikator=$2',
    [idUsulan, noIndikator]
  );
  const bobot = bobotRes.rows.length > 0 ? parseInt(bobotRes.rows[0].bobot) || 0 : 0;

  // nilai = bobot * rasio
  const nilaiTerbobot = Math.round(bobot * rasio * 100) / 100;

  // Update — link_file diupdate kalau linkFile dikirim (termasuk string kosong untuk hapus semua)
  if (linkFile !== undefined && linkFile !== null) {
    await pool.query(
      'UPDATE usulan_indikator SET target=$1, capaian=$2, realisasi_rasio=$3, nilai_terbobot=$4, catatan=$5, link_file=$6 WHERE id_usulan=$7 AND no_indikator=$8',
      [t, c, rasio, nilaiTerbobot, catatan || '', linkFile, idUsulan, noIndikator]
    );
  } else {
    await pool.query(
      'UPDATE usulan_indikator SET target=$1, capaian=$2, realisasi_rasio=$3, nilai_terbobot=$4, catatan=$5 WHERE id_usulan=$6 AND no_indikator=$7',
      [t, c, rasio, nilaiTerbobot, catatan || '', idUsulan, noIndikator]
    );
  }

  const spm = await hitungSPM(pool, idUsulan);
  return ok({ message: 'Indikator berhasil diupdate', rasio, nilaiTerbobot, indeksSPM: spm.indeksSPM });
}

async function hitungSPM(pool, idUsulan) {
  const KONSTANTA = 0.33;
  // Fungsi pembulatan 2 desimal sesuai aturan matematika standar
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

  const r = await pool.query(
    'SELECT bobot, realisasi_rasio FROM usulan_indikator WHERE id_usulan=$1',
    [idUsulan]
  );

  let totalNilai = 0, totalBobot = 0;
  for (const row of r.rows) {
    const bobot = parseInt(row.bobot) || 0;
    const rasio = parseFloat(row.realisasi_rasio) || 0;
    // nilai = bobot * rasio — akumulasi dengan presisi penuh dulu
    totalNilai += bobot * rasio;
    totalBobot += bobot;
  }

  // Rumus: indeks_kinerja = total_nilai / total_bobot (pembulatan 2 desimal)
  const indeksKinerja = totalBobot > 0 ? round2(totalNilai / totalBobot) : 0;

  // Rumus: indeks_spm = indeks_kinerja * 0.33 (pembulatan 2 desimal)
  // Contoh: 6/7 = 0.857142... → 0.86; 7/7 = 1.00 → 1.00
  const indeksSPM = round2(indeksKinerja * KONSTANTA);

  await pool.query(
    `UPDATE usulan_header SET total_nilai=$1, total_bobot=$2, indeks_kinerja_spm=$3, indeks_spm=$4 WHERE id_usulan=$5`,
    [round2(totalNilai), totalBobot, indeksKinerja, indeksSPM, idUsulan]
  );

  return { indeksKinerja, indeksBeban: KONSTANTA, indeksSPM, totalNilai: round2(totalNilai), totalBobot };
}

async function submitUsulan(pool, body) {
  const { idUsulan, email, forceSubmit, catatanOperator } = body;

  const result = await pool.query(
    'SELECT status_global, status_kapus, status_program, ditolak_oleh FROM usulan_header WHERE id_usulan=$1',
    [idUsulan]
  );
  if (result.rows.length === 0) return err('Usulan tidak ditemukan');
  const { status_global: statusSaatIni, status_kapus, status_program, ditolak_oleh: ditolakOleh } = result.rows[0];

  if (statusSaatIni !== 'Draft' && statusSaatIni !== 'Ditolak')
    return err('Usulan tidak dapat disubmit pada status ini');

  // Cek indikator yang belum ada bukti DULU sebelum reset apapun
  const indResult = await pool.query(
    'SELECT no_indikator, link_file FROM usulan_indikator WHERE id_usulan=$1', [idUsulan]
  );
  // Saat mode perbaiki (Ditolak), hanya cek bukti untuk indikator yang bermasalah saja
  let indToCheck = indResult.rows;
  const isDitolakMode = statusSaatIni === 'Ditolak';
  if (isDitolakMode) {
    const penolakanResult = await pool.query(
      'SELECT no_indikator FROM penolakan_indikator WHERE id_usulan=$1', [idUsulan]
    ).catch(() => ({ rows: [] }));
    const bermasalahNos = penolakanResult.rows.map(r => r.no_indikator);
    if (bermasalahNos.length > 0) {
      indToCheck = indResult.rows.filter(r => bermasalahNos.includes(r.no_indikator));
    }
  }
  const missing = indToCheck.filter(r => !r.link_file || r.link_file.trim() === '');
  if (missing.length > 0 && !forceSubmit) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        success: false, needConfirm: true,
        isDitolak: isDitolakMode,
        missingCount: missing.length,
        missingNos: missing.map(r => r.no_indikator),
        message: `${missing.length} indikator belum ada file bukti. Tetap submit?`
      })
    };
  }

  // Tentukan target dan lakukan reset berdasarkan kondisi penolakan
  // Sesuai flowchart:
  // - Draft / Ditolak Kapus → kembali ke Kepala Puskesmas
  // - Ditolak Program → skip Kapus, langsung ke Pengelola Program
  // - Ditolak Admin → kembali ke Pengelola Program
  // Gunakan ditolak_oleh sebagai penentu utama (lebih akurat dari status_kapus/program
  // karena status bisa ter-reset ke 'Menunggu' setelah penolakan berjenjang)
  // HANYA gunakan ditolak_oleh — status_kapus tidak bisa diandalkan karena bisa ter-reset
  const wasKapusDitolak = ditolakOleh === 'Kepala Puskesmas';
  const wasProgramDitolak = ditolakOleh === 'Pengelola Program';

  let targetStatus = 'Menunggu Kepala Puskesmas';

  if (statusSaatIni === 'Ditolak') {
    if (wasKapusDitolak) {
      // Kepala Puskesmas menolak → reset semua stage header, tapi VP hanya reset
      // yang memegang indikator bermasalah — jangan reset VP yang sudah Selesai untuk indikator lain
      targetStatus = 'Menunggu Kepala Puskesmas';
      await pool.query(
        `UPDATE usulan_header SET
          status_kapus='Menunggu', status_program='Menunggu', status_final='Menunggu',
          kapus_approved_by=NULL, kapus_approved_at=NULL, kapus_catatan=NULL,
          admin_approved_by=NULL, admin_approved_at=NULL, admin_catatan=NULL,
          final_approved_by=NULL, final_approved_at=NULL,
          operator_catatan=$2
         WHERE id_usulan=$1`, [idUsulan, catatanOperator || null]
      );
      // FIX: Reset HANYA VP yang statusnya masih 'Menunggu' (= yang menolak atau belum verif).
      // PP yang sudah 'Selesai' tidak disentuh, meskipun mereka pegang indikator bermasalah.
      await pool.query(
        `UPDATE verifikasi_program SET status='Menunggu', catatan=NULL, verified_at=NULL
         WHERE id_usulan=$1 AND status != 'Selesai'`,
        [idUsulan]
      );
      // JANGAN hapus penolakan_indikator di sini!
      // Data ini dibutuhkan Kapus saat re-verifikasi agar frontend hanya
      // menampilkan indikator yang bermasalah, bukan semua 12 indikator.
      // penolakan_indikator akan dibersihkan oleh verifKapus setelah Kapus
      // selesai memverifikasi ulang (approve semua → DELETE, tolak lagi → UPSERT).
    } else if (wasProgramDitolak) {
      // Pengelola Program tolak → dikembalikan ke KaPus untuk re-verifikasi berjenjang
      // JANGAN reset VP yang sudah Selesai — hanya reset yang memegang indikator bermasalah
      // verifKapus akan menangani reset VP yang terkena saja setelah KaPus approve.
      targetStatus = 'Menunggu Kepala Puskesmas';
      await pool.query(
        `UPDATE usulan_header SET
          status_kapus='Menunggu', status_program='Menunggu', status_final='Menunggu',
          kapus_approved_by=NULL, kapus_approved_at=NULL, kapus_catatan=NULL,
          admin_approved_by=NULL, admin_approved_at=NULL, admin_catatan=NULL,
          final_approved_by=NULL, final_approved_at=NULL
         WHERE id_usulan=$1`, [idUsulan]
      );
      // FIX: Reset HANYA VP yang statusnya masih 'Menunggu' (= yang menolak).
      // PP yang sudah 'Selesai' tidak disentuh.
      await pool.query(
        `UPDATE verifikasi_program SET status='Menunggu', catatan=NULL, verified_at=NULL
         WHERE id_usulan=$1 AND status != 'Selesai'`,
        [idUsulan]
      );
    } else {
      // Admin menolak → kembali ke Admin
      targetStatus = 'Menunggu Admin';
      await pool.query(
        `UPDATE usulan_header SET
          status_final='Menunggu',
          admin_approved_by=NULL, admin_approved_at=NULL, admin_catatan=NULL,
          final_approved_by=NULL, final_approved_at=NULL
         WHERE id_usulan=$1`, [idUsulan]
      );
    }
  }

  // Update status_global dan is_locked
  // FIX: JANGAN null-kan ditolak_oleh di sini — Kapus masih butuh info ini
  // untuk tahu bahwa ini re-verifikasi dan hanya tampilkan indikator bermasalah.
  // ditolak_oleh akan di-clear oleh verifKapus setelah semua indikator disetujui.
  await pool.query(
    `UPDATE usulan_header SET status_global=$1, is_locked=true WHERE id_usulan=$2`,
    [targetStatus, idUsulan]
  );

  const isResubmit = statusSaatIni === 'Ditolak';
  const logDetailOperator = isResubmit
    ? `Diajukan ulang → ${targetStatus}${catatanOperator ? ' | Catatan: ' + catatanOperator : ''}`
    : 'Disubmit ke Kepala Puskesmas';
  await logAktivitas(pool, email, 'Operator', isResubmit ? 'Ajukan Ulang' : 'Submit', idUsulan, logDetailOperator);
  return ok({ message: isResubmit
    ? `Usulan berhasil diajukan ulang! Diteruskan ke ${targetStatus}.`
    : 'Usulan berhasil disubmit ke Kepala Puskesmas'
  });
}


// Verifikasi Kepala Puskesmas per indikator
async function verifKapus(pool, body) {
  const { idUsulan, email, indikatorList, catatanKapus } = body;
  if (!idUsulan || !email) return err('Data tidak lengkap');
  if (!indikatorList || !indikatorList.length) return err('Keputusan per indikator wajib diisi');

  const result = await pool.query(
    `SELECT uh.status_global, uh.kode_pkm, u.kode_pkm as kapus_pkm
     FROM usulan_header uh
     LEFT JOIN users u ON LOWER(u.email)=LOWER($2) AND u.role IN ('Kapus','Kepala Puskesmas')
     WHERE uh.id_usulan=$1`,
    [idUsulan, email]
  );
  if (!result.rows.length) return err('Usulan tidak ditemukan');
  const row = result.rows[0];
  if (row.status_global !== 'Menunggu Kepala Puskesmas') return err('Usulan tidak dalam status Menunggu Kepala Puskesmas');
  if (row.kapus_pkm && row.kode_pkm !== row.kapus_pkm) return err('Anda hanya dapat memverifikasi usulan dari puskesmas Anda sendiri');

  const adaTolak = indikatorList.some(i => i.aksi === 'tolak');

  // Simpan catatan/alasan setuju per indikator (opsional)
  for (const item of indikatorList.filter(i => i.aksi === 'setuju' && i.alasan)) {
    await pool.query(
      `UPDATE usulan_indikator SET catatan=$1, approved_by=$2, approved_role='Kepala Puskesmas', approved_at=NOW()
       WHERE id_usulan=$3 AND no_indikator=$4`,
      [item.alasan, email, idUsulan, item.noIndikator]
    ).catch(() => {});
  }

  if (!adaTolak) {
    // Semua setuju → cek ditolak_oleh untuk menentukan arah selanjutnya
    const headerInfo = await pool.query(
      `SELECT ditolak_oleh FROM usulan_header WHERE id_usulan=$1`, [idUsulan]
    );
    const ditolakOleh = headerInfo.rows[0]?.ditolak_oleh;

    // Penolakan dari PP: email_program IS NOT NULL; dari Admin: email_program IS NULL tapi ditolak_oleh='Admin'
    // KUNCI: isReVerifPP hanya true jika ditolak_oleh masih terisi — jika NULL berarti siklus baru
    const isReVerifPP = ditolakOleh === 'Pengelola Program';
    const isReVerifAdmin = ditolakOleh === 'Admin';
    const isReVerif = isReVerifPP || isReVerifAdmin;

    // Cek apakah ada penolakan dari PP yang masih aktif (email_program IS NOT NULL)
    // Ini lebih akurat dari ditolak_oleh untuk kasus KaPus tolak setelah PP tolak:
    // - PP tolak → email_program IS NOT NULL → isReVerifPPAktif = true
    // - KaPus tolak sendiri (bukan dari PP) → email_program IS NULL → false
    const piCheckPP = await pool.query(
      `SELECT COUNT(*) as ct FROM penolakan_indikator WHERE id_usulan=$1 AND email_program IS NOT NULL AND (aksi IS NULL OR aksi='tolak' OR aksi='reset')`,
      [idUsulan]
    );
    const isReVerifPPAktif = parseInt(piCheckPP.rows[0]?.ct) > 0;
    const isReVerifEfektif = isReVerif || isReVerifPPAktif;

    // Jika bukan re-verifikasi, bersihkan penolakan lama
    if (!isReVerifEfektif) {
      await pool.query(`DELETE FROM penolakan_indikator WHERE id_usulan=$1`, [idUsulan]).catch(() => {});
    }

    // Kapus hanya ada dalam loop PP↔Kapus atau sub-loop Admin↔PP↔Kapus.
    // Selalu teruskan ke Pengelola Program, pertahankan ditolak_oleh aslinya.
    // Jika ada penolakan PP aktif tapi ditolak_oleh='Kepala Puskesmas', set ke 'Pengelola Program'
    // agar PP tahu ini re-verifikasi
    const ditolakOlehVal = isReVerifAdmin ? 'Admin'
      : (isReVerifPP ? 'Pengelola Program'
      : (isReVerifPPAktif ? 'Pengelola Program'
      : null));
    await pool.query(
      `UPDATE usulan_header SET status_kapus='Selesai', status_global='Menunggu Pengelola Program',
       ditolak_oleh=$1,
       kapus_approved_by=$2, kapus_approved_at=NOW(), kapus_catatan=$4 WHERE id_usulan=$3`,
      [ditolakOlehVal, email, idUsulan, catatanKapus || 'Semua indikator disetujui']
    );

    if (isReVerifEfektif) {
      // Re-verifikasi (dari PP atau Admin, atau KaPus approve setelah PP tolak):
      // reset semua PP yang punya irisan dengan indikator bermasalah.
      // PP yang tidak punya irisan tetap Selesai (tidak perlu verif ulang).
      // FIX: Reset aksi 'reset' → NULL agar PP bisa baca indikator bermasalah saat re-verif berikutnya.
      await pool.query(
        `UPDATE penolakan_indikator SET aksi=NULL WHERE id_usulan=$1 AND aksi='reset'`,
        [idUsulan]
      ).catch(() => {});
      const piRows = await pool.query(
        `SELECT no_indikator FROM penolakan_indikator WHERE id_usulan=$1 AND (aksi IS NULL OR aksi='tolak')`,
        [idUsulan]
      );
      const nomorBermasalahReVerif = piRows.rows.map(r => parseInt(r.no_indikator));

      const allPP = await pool.query(`SELECT email, nama, nip, jabatan, indikator_akses FROM users WHERE role='Pengelola Program' AND aktif=true`);
      for (const pp of allPP.rows) {
        const aksesArr = parseIndikatorAkses(pp.indikator_akses || '');
        // PP wajib re-verif jika punya irisan dengan indikator bermasalah
        // PP dengan akses kosong = bertanggung jawab atas semua indikator → selalu terkena
        const adaIrisan = aksesArr.length === 0
          ? nomorBermasalahReVerif.length > 0
          : aksesArr.some(n => nomorBermasalahReVerif.includes(n));
        const statusBaru = adaIrisan ? 'Menunggu' : null; // null = tidak diubah jika sudah Selesai
        await pool.query(
          `INSERT INTO verifikasi_program (id_usulan,email_program,nama_program,nip_program,jabatan_program,indikator_akses,status,created_at)
           VALUES ($1,$2,$3,$4,$5,$6,'Menunggu',NOW())
           ON CONFLICT (id_usulan, email_program) DO UPDATE
             SET nama_program=EXCLUDED.nama_program,
                 nip_program=EXCLUDED.nip_program,
                 jabatan_program=EXCLUDED.jabatan_program,
                 -- Reset ke Menunggu jika punya irisan indikator bermasalah (termasuk yang sudah Selesai)
                 -- PP tanpa irisan tetap pada status semula
                 status=CASE WHEN $7 THEN 'Menunggu' ELSE verifikasi_program.status END,
                 catatan=CASE WHEN $7 THEN NULL ELSE verifikasi_program.catatan END,
                 verified_at=CASE WHEN $7 THEN NULL ELSE verifikasi_program.verified_at END`,
          [idUsulan, pp.email, pp.nama, pp.nip||null, pp.jabatan||null, pp.indikator_akses||'', adaIrisan]
        );
      }
    } else {
      // Siklus pertama kali: semua PP harus verif, pastikan semua punya record Menunggu
      const allPP = await pool.query(`SELECT email, nama, nip, jabatan, indikator_akses FROM users WHERE role='Pengelola Program' AND aktif=true`);
      for (const pp of allPP.rows) {
        await pool.query(
          `INSERT INTO verifikasi_program (id_usulan,email_program,nama_program,nip_program,jabatan_program,indikator_akses,status,created_at)
           VALUES ($1,$2,$3,$4,$5,$6,'Menunggu',NOW())
           ON CONFLICT (id_usulan, email_program) DO UPDATE
             SET nama_program=EXCLUDED.nama_program,
                 nip_program=EXCLUDED.nip_program,
                 jabatan_program=EXCLUDED.jabatan_program`,
          [idUsulan, pp.email, pp.nama, pp.nip||null, pp.jabatan||null, pp.indikator_akses||'']
        );
      }
    }

    let logAksiKapus, logDetailKapus;
    if (isReVerifPP) {
      // Kapus setuju semua = MENYANGGAH PP → teruskan ke PP ulang
      logAksiKapus  = 'Kapus Menyanggah';
      logDetailKapus = `Menyanggah penolakan Pengelola Program — diteruskan ke PP${catatanKapus && catatanKapus !== 'Semua indikator disetujui' ? ' | Catatan: ' + catatanKapus : ''}`;
    } else if (isReVerifAdmin) {
      // Kapus setuju semua dalam konteks re-verif Admin → teruskan ke PP
      logAksiKapus  = 'Approve';
      logDetailKapus = `Re-verifikasi disetujui — diteruskan ke Pengelola Program${catatanKapus && catatanKapus !== 'Semua indikator disetujui' ? ' | Catatan: ' + catatanKapus : ''}`;
    } else {
      logAksiKapus  = 'Approve';
      logDetailKapus = 'Semua indikator disetujui';
    }
    await logAktivitas(pool, email, 'Kepala Puskesmas', logAksiKapus, idUsulan, logDetailKapus);
    return ok({ message: 'Semua indikator disetujui — diteruskan ke Pengelola Program.' });
  }

  // Ada yang ditolak → simpan ke penolakan_indikator + reset + kembalikan ke Operator
  const nomorTolak = indikatorList.filter(i => i.aksi === 'tolak').map(i => i.noIndikator);
  const alasanGabungan = indikatorList.filter(i => i.aksi === 'tolak')
    .map(i => '#' + i.noIndikator + ': ' + i.alasan).join(' | ');

  // Simpan email_program dari penolakan PP yang asli (jika ada) SEBELUM dihapus
  // Ini penting agar saat KaPus approve nanti, sistem bisa deteksi ini re-verif dari PP
  const piPPEmailRows = await pool.query(
    `SELECT no_indikator, email_program FROM penolakan_indikator WHERE id_usulan=$1 AND email_program IS NOT NULL`,
    [idUsulan]
  ).catch(() => ({ rows: [] }));
  const emailPPMap = {};
  for (const r of piPPEmailRows.rows) {
    emailPPMap[r.no_indikator] = r.email_program;
  }

  // Bersihkan penolakan lama dari Kapus untuk usulan ini
  await pool.query(`DELETE FROM penolakan_indikator WHERE id_usulan=$1`, [idUsulan]).catch(()=>{});

  // Simpan ke penolakan_indikator — pertahankan email_program dari PP asli jika ada
  // Ini penting agar saat KaPus approve nanti, sistem bisa deteksi ini re-verif dari PP
  for (const item of indikatorList.filter(i => i.aksi === 'tolak')) {
    const emailPPAsli = emailPPMap[item.noIndikator] || null;
    await pool.query(
      `INSERT INTO penolakan_indikator (id_usulan, no_indikator, alasan, email_admin, created_at, email_program)
       VALUES ($1,$2,$3,$4,NOW(),$5)
       ON CONFLICT (id_usulan, no_indikator) DO UPDATE
       SET alasan=$3, email_admin=$4, created_at=NOW(), aksi=NULL, catatan_program=NULL, responded_at=NULL, email_program=$5`,
      [idUsulan, item.noIndikator, item.alasan.trim(), email, emailPPAsli]
    );
  }

  // Reset indikator bermasalah di usulan_indikator
  for (const no of nomorTolak) {
    await pool.query(
      `UPDATE usulan_indikator SET status='Draft', approved_by=NULL, approved_role=NULL, approved_at=NULL, catatan=NULL
       WHERE id_usulan=$1 AND no_indikator=$2`,
      [idUsulan, no]
    );
  }

  // Cek apakah ini re-verifikasi dari PP (KaPus membenarkan penolakan PP)
  const headerReVerifCheck = await pool.query('SELECT ditolak_oleh FROM usulan_header WHERE id_usulan=$1', [idUsulan]);
  const ditolakOlehKapusTolak = headerReVerifCheck.rows[0]?.ditolak_oleh;
  const isReVerifPPKapusTolak = ditolakOlehKapusTolak === 'Pengelola Program';
  const isReVerifAdminKapusTolak = ditolakOlehKapusTolak === 'Admin';

  // Tentukan aksi log dan pesan berdasarkan konteks re-verifikasi
  const logAksiTolak = (isReVerifPPKapusTolak || isReVerifAdminKapusTolak)
    ? 'Kapus Membenarkan'
    : 'Tolak';
  const konteksLog = isReVerifPPKapusTolak
    ? 'Membenarkan penolakan Pengelola Program — dikembalikan ke Operator untuk perbaikan data'
    : isReVerifAdminKapusTolak
      ? 'Membenarkan penolakan Admin (via PP) — dikembalikan ke Operator untuk perbaikan data'
      : 'Dikembalikan ke Operator';

  await pool.query(
    `UPDATE usulan_header SET status_global='Ditolak', status_kapus='Ditolak', is_locked=false,
     ditolak_oleh='Kepala Puskesmas', kapus_approved_by=NULL, kapus_catatan=$1 WHERE id_usulan=$2`,
    [alasanGabungan, idUsulan]
  );
  await logAktivitas(pool, email, 'Kepala Puskesmas', logAksiTolak, idUsulan,
    konteksLog + ' | Indikator bermasalah ' + alasanGabungan);
  return ok({ message: 'Indikator bermasalah dikembalikan ke Operator untuk diperbaiki.', nomorTolak });
}


// Verifikasi PP per indikator: setiap indikator bisa setuju atau tolak + alasan
async function verifProgram(pool, body) {
  const { idUsulan, email, indikatorList, catatanProgram } = body;
  if (!idUsulan || !email) return err('Data tidak lengkap');
  if (!indikatorList || !indikatorList.length) return err('Keputusan per indikator wajib diisi');

  const headerRes = await pool.query('SELECT status_global, ditolak_oleh FROM usulan_header WHERE id_usulan=$1', [idUsulan]);
  if (!headerRes.rows.length) return err('Usulan tidak ditemukan');
  if (!['Menunggu Pengelola Program','Ditolak'].includes(headerRes.rows[0].status_global))
    return err('Usulan tidak dalam tahap verifikasi program');

  // Validasi: catatan PP wajib hanya pada re-verifikasi dari Admin, jika ada indikator yang disetujui
  const isReVerifAdmin = headerRes.rows[0].ditolak_oleh === 'Admin';
  const adaYangSetuju = indikatorList.some(i => i.aksi === 'setuju');
  if (isReVerifAdmin && adaYangSetuju && !catatanProgram?.trim()) return err('Catatan / Sanggahan wajib diisi jika ada indikator yang disetujui');

  const vpCheck = await pool.query(
    'SELECT id, status, indikator_akses FROM verifikasi_program WHERE id_usulan=$1 AND LOWER(email_program)=LOWER($2)',
    [idUsulan, email]
  );
  if (!vpCheck.rows.length) return err('Anda tidak terdaftar sebagai pengelola program untuk usulan ini');
  if (vpCheck.rows[0].status === 'Selesai') return err('Anda sudah memverifikasi usulan ini');
  if (vpCheck.rows[0].status === 'Ditolak') return err('Anda sudah menolak usulan ini');

  const myAkses = parseIndikatorAkses(vpCheck.rows[0].indikator_akses || '');
  if (myAkses.length > 0) {
    const invalid = indikatorList.filter(i => !myAkses.includes(i.noIndikator));
    if (invalid.length) return err('Indikator ' + invalid.map(i=>i.noIndikator).join(',') + ' bukan tanggung jawab Anda');
  }

  const adaTolak = indikatorList.some(i => i.aksi === 'tolak');
  const statusVP = adaTolak ? 'Ditolak' : 'Selesai';
  const alasanGabungan = adaTolak
    ? indikatorList.filter(i => i.aksi === 'tolak').map(i => '#' + i.noIndikator + ': ' + i.alasan).join(' | ')
    : null;
  const logLabel = adaTolak ? alasanGabungan : 'Semua indikator disetujui';

  // Simpan catatanProgram ke penolakan_indikator untuk SEMUA indikator bermasalah
  // (bukan hanya yang disetujui) agar Admin bisa baca catatan PP walau ada yang ditolak
  if (catatanProgram) {
    await pool.query(
      `UPDATE penolakan_indikator SET catatan_program=$1, email_program=$2, responded_at=NOW()
       WHERE id_usulan=$3 AND (aksi IS NULL OR aksi='tolak')`,
      [catatanProgram, email, idUsulan]
    ).catch(() => {});
  }

  // FIX Bug #1 & #3: Simpan dulu keputusan VP ini ke verifikasi_program,
  // tapi JANGAN ubah status_global atau insert penolakan_indikator dulu.
  // Semua perubahan global ditunda sampai semua VP sudah selesai verifikasi.
  // Simpan catatan dan alasan secara terpisah agar tidak saling menimpa:
  // catatan = alasan penolakan indikator (jika ada yang ditolak)
  // sanggahan = catatan/sanggahan PP ke Admin (selalu disimpan jika ada)
  await pool.query(
    `UPDATE verifikasi_program SET status=$1, catatan=$2, sanggahan=$3, verified_at=NOW()
     WHERE id_usulan=$4 AND LOWER(email_program)=LOWER($5)`,
    [statusVP, alasanGabungan || null, catatanProgram || null, idUsulan, email]
  );
  // Saat re-verif dari Admin: tulis 'Re-verifikasi' agar muncul di bubble masing2 PP
  // Saat verifikasi normal: tulis 'Approve' (atau 'Tolak sebagian')
  const aksiLog = adaTolak
    ? 'Tolak (sebagian)'
    : (isReVerifAdmin ? 'Re-verifikasi' : 'Approve');
  const detailLog = adaTolak
    ? alasanGabungan + (catatanProgram ? ` | Catatan PP: ${catatanProgram}` : '')
    : (isReVerifAdmin && catatanProgram ? `Semua indikator disetujui — catatan: ${catatanProgram}` : logLabel);
  await logAktivitas(pool, email, 'Pengelola Program', aksiLog, idUsulan, detailLog);

  // Cek status semua VP SETELAH update VP ini
  const allVP = await pool.query('SELECT status FROM verifikasi_program WHERE id_usulan=$1', [idUsulan]);
  const stillWaiting = allVP.rows.some(r => r.status === 'Menunggu');
  const anyRejected  = allVP.rows.some(r => r.status === 'Ditolak');

  // FIX Bug #1: Jangan proses apapun ke status_global selama masih ada VP yang belum verif
  if (stillWaiting) {
    return ok({ message: 'Verifikasi Anda disimpan. Menunggu pengelola program lain.', allDone: false });
  }

  // Semua VP sudah verifikasi — baru proses hasilnya
  if (!anyRejected) {
    // Semua setuju → lanjutkan ke Admin (atau kembali ke Admin jika loop Admin↔PP)
    const headerCheck = await pool.query('SELECT ditolak_oleh FROM usulan_header WHERE id_usulan=$1', [idUsulan]);
    const ditolakOleh = headerCheck.rows[0]?.ditolak_oleh;

    // Deteksi re-verifikasi Admin:
    // 1. Langsung: ditolak_oleh='Admin' (Admin→PP langsung)
    // 2. Via berjenjang: Admin→PP→Kapus→Operator→Kapus→PP
    // isReVerifAdmin: cukup cek ditolak_oleh='Admin' saja
    // ditolak_oleh='Admin' hanya di-set secara eksplisit oleh:
    // 1. verifAdmin tolak (Admin→PP)
    // 2. respondPenolakan sanggah semua (PP→Admin)
    // 3. verifProgram re-verif semua setuju (PP→Admin)
    // Tidak perlu cek penolakan_indikator karena aksinya bisa IS NULL atau 'sanggah'
    const isReVerifAdmin = ditolakOleh === 'Admin';

    if (isReVerifAdmin) {
      // Re-verif Admin: teruskan kembali ke Admin, pertahankan ditolak_oleh dan penolakan_indikator
      // agar Admin tahu ini re-verifikasi dan bisa baca catatan PP
      await pool.query(
        `UPDATE usulan_header SET status_program='Selesai', status_global='Menunggu Admin',
         status_kapus='Selesai', ditolak_oleh='Admin' WHERE id_usulan=$1`, [idUsulan]
      );
      return ok({ message: 'Semua pengelola program menyetujui — usulan diteruskan kembali ke Admin.', allDone: true });
    } else {
      // Verifikasi pertama kali ke Admin — bersihkan sisa data penolakan lama
      await pool.query(`DELETE FROM penolakan_indikator WHERE id_usulan=$1`, [idUsulan]).catch(() => {});
      await pool.query(
        `UPDATE usulan_header SET status_program='Selesai', status_global='Menunggu Admin', ditolak_oleh=NULL WHERE id_usulan=$1`, [idUsulan]
      );
      return ok({ message: 'Semua pengelola program menyetujui — usulan diteruskan ke Admin.', allDone: true });
    }
  }

  // Ada yang menolak — kumpulkan semua indikator bermasalah dari SEMUA VP yang menolak
  // FIX Bug #3: Gunakan catatan VP (format "#no: alasan") sebagai sumber data,
  // bukan penolakan_indikator (yang belum diisi), dan bukan indikator_akses (terlalu lebar).
  const allVPRejected = await pool.query(
    `SELECT email_program, indikator_akses, catatan FROM verifikasi_program WHERE id_usulan=$1 AND status='Ditolak'`,
    [idUsulan]
  );

  // Parse indikator bermasalah dari catatan semua VP yang menolak
  const alasanMap = {}; // noIndikator -> alasan
  for (const vp of allVPRejected.rows) {
    const parts = (vp.catatan || '').split('|').map(s => s.trim()).filter(Boolean);
    for (const part of parts) {
      const match = part.match(/^#(\d+):\s*(.*)/);
      if (match) {
        const no = parseInt(match[1]);
        if (!alasanMap[no]) alasanMap[no] = match[2] || 'Ditolak oleh Pengelola Program';
      }
    }
  }
  // Tambahkan dari indikatorList VP ini (sumber paling akurat untuk VP yang sedang request)
  for (const item of indikatorList.filter(i => i.aksi === 'tolak')) {
    alasanMap[item.noIndikator] = item.alasan || alasanMap[item.noIndikator] || 'Ditolak';
  }
  let nomorBermasalah = [...new Set(Object.keys(alasanMap).map(Number))];

  // Reset indikator bermasalah ke Draft
  for (const no of nomorBermasalah) {
    await pool.query(
      `UPDATE usulan_indikator SET status='Draft', approved_by=NULL, approved_role=NULL, approved_at=NULL, catatan=NULL
       WHERE id_usulan=$1 AND no_indikator=$2`, [idUsulan, no]
    );
  }

  // Hapus penolakan PP lama dari siklus sebelumnya, simpan yang baru
  await pool.query(
    `DELETE FROM penolakan_indikator WHERE id_usulan=$1 AND email_program IS NOT NULL`, [idUsulan]
  );
  // Buat map: noIndikator -> email PP yang benar-benar menolak indikator tersebut
  const emailTolakMap = {};
  for (const vp of allVPRejected.rows) {
    const parts = (vp.catatan || '').split('|').map(s => s.trim()).filter(Boolean);
    for (const part of parts) {
      const match = part.match(/^#(\d+):\s*(.*)/);
      if (match) {
        const no = parseInt(match[1]);
        if (!emailTolakMap[no]) emailTolakMap[no] = vp.email_program;
      }
    }
  }
  // Tambahkan dari indikatorList VP yang sedang request
  for (const item of indikatorList.filter(i => i.aksi === 'tolak')) {
    emailTolakMap[item.noIndikator] = email;
  }
  for (const no of nomorBermasalah) {
    const emailPenolak = emailTolakMap[no] || email;
    // $4 = email PP yang bertanggung jawab atas indikator ini (email_program)
    // email_admin diisi email yang sama karena PP bertindak sebagai "pelapor" penolakan ini
    await pool.query(
      `INSERT INTO penolakan_indikator (id_usulan, no_indikator, alasan, email_admin, created_at, aksi, email_program)
       VALUES ($1,$2,$3,$4,NOW(),'tolak',$5)
       ON CONFLICT (id_usulan, no_indikator) DO UPDATE
       SET alasan=$3, email_admin=$4, created_at=NOW(), aksi='tolak', catatan_program=NULL, responded_at=NULL, email_program=$5`,
      [idUsulan, no, alasanMap[no] || 'Ditolak', email, emailPenolak]
    );
  }

  // Reset VP yang punya irisan dengan indikator bermasalah — termasuk yang sudah Selesai.
  // PP yang tidak punya irisan tidak perlu re-verif.
  const allVPVerif = await pool.query(
    `SELECT email_program, indikator_akses FROM verifikasi_program WHERE id_usulan=$1`,
    [idUsulan]
  );
  for (const vp of allVPVerif.rows) {
    const aksesArr = parseIndikatorAkses(vp.indikator_akses || '');
    const adaIrisan = aksesArr.length === 0
      ? nomorBermasalah.length > 0
      : aksesArr.some(n => nomorBermasalah.includes(n));
    if (adaIrisan) {
      await pool.query(
        `UPDATE verifikasi_program SET status='Menunggu', catatan=NULL, verified_at=NULL WHERE id_usulan=$1 AND LOWER(email_program)=LOWER($2)`,
        [idUsulan, vp.email_program]
      );
    }
  }

  // Tentukan arah: PP tolak → SELALU balik ke Kapus dulu (berjenjang)
  // Pertahankan ditolak_oleh asli ('Admin' atau 'Pengelola Program') agar Kapus tahu ini re-verifikasi
  const headerDirCheck = await pool.query('SELECT ditolak_oleh FROM usulan_header WHERE id_usulan=$1', [idUsulan]);
  const ditolakOlehDir = headerDirCheck.rows[0]?.ditolak_oleh;
  const indDitolak = nomorBermasalah;

  // Selalu ke Kapus terlepas dari asal penolakan (Admin atau PP)
  // ditolak_oleh dipertahankan agar Kapus approve → tahu harus ke mana setelah approve
  const ditolakOlehKapus = ditolakOlehDir || 'Pengelola Program';
  await pool.query(
    `UPDATE usulan_header SET status_global='Menunggu Kepala Puskesmas', status_kapus='Menunggu',
     status_program='Menunggu', ditolak_oleh=$2, is_locked=true WHERE id_usulan=$1`, [idUsulan, ditolakOlehKapus]
  );
  if (indDitolak.length) {
    await logAktivitas(pool, email, 'Pengelola Program', 'Kembalikan', idUsulan,
      'Indikator bermasalah ' + alasanGabungan + ' — dikembalikan ke Kepala Puskesmas');
  }
  return ok({ message: 'Indikator bermasalah dikembalikan ke Kepala Puskesmas untuk re-verifikasi.', allDone: true });
}


// Verifikasi Admin per indikator
async function verifAdmin(pool, body) {
  const { idUsulan, email, indikatorList } = body;
  if (!idUsulan || !email) return err('Data tidak lengkap');
  if (!indikatorList || !indikatorList.length) return err('Keputusan per indikator wajib diisi');

  const result = await pool.query('SELECT status_global FROM usulan_header WHERE id_usulan=$1', [idUsulan]);
  if (!result.rows.length) return err('Usulan tidak ditemukan');
  if (result.rows[0].status_global !== 'Menunggu Admin') return err('Usulan belum siap untuk diverifikasi Admin');

  const adaTolak = indikatorList.some(i => i.aksi === 'tolak');

  // Simpan catatan/alasan setuju per indikator (opsional)
  for (const item of indikatorList.filter(i => i.aksi === 'setuju' && i.alasan)) {
    await pool.query(
      `UPDATE usulan_indikator SET catatan=$1, approved_by=$2, approved_role='Admin', approved_at=NOW()
       WHERE id_usulan=$3 AND no_indikator=$4`,
      [item.alasan, email, idUsulan, item.noIndikator]
    ).catch(() => {});
  }

  if (!adaTolak) {
    // Semua setuju → selesai, baru hapus penolakan
    await pool.query(`DELETE FROM penolakan_indikator WHERE id_usulan=$1`, [idUsulan]).catch(()=>{});
    await pool.query(
      `UPDATE usulan_header SET status_final='Selesai', status_global='Selesai', is_locked=true,
       ditolak_oleh=NULL, admin_approved_by=$1, admin_approved_at=NOW(), admin_catatan='Semua indikator disetujui',
       final_approved_by=$1, final_approved_at=NOW() WHERE id_usulan=$2`,
      [email, idUsulan]
    );
    await logAktivitas(pool, email, 'Admin', 'Approve Final', idUsulan, 'Semua indikator disetujui');
    return ok({ message: 'Usulan selesai diverifikasi oleh Admin.' });
  }

  // Ada yang ditolak → reset indikator, kembalikan ke PP dulu (seperti skema PP → Kapus)
  const nomorTolak = indikatorList.filter(i => i.aksi === 'tolak').map(i => i.noIndikator);
  const alasanGabungan = indikatorList.filter(i => i.aksi === 'tolak')
    .map(i => '#' + i.noIndikator + ': ' + i.alasan).join(' | ');

  // Hapus penolakan lama, simpan yang baru
  await pool.query(`DELETE FROM penolakan_indikator WHERE id_usulan=$1`, [idUsulan]).catch(() => {});
  for (const item of indikatorList.filter(i => i.aksi === 'tolak')) {
    await pool.query(
      `INSERT INTO penolakan_indikator (id_usulan, no_indikator, alasan, email_admin, created_at, aksi, catatan_program, responded_at, email_program)
       VALUES ($1,$2,$3,$4,NOW(),'tolak',NULL,NULL,NULL)
       ON CONFLICT (id_usulan, no_indikator) DO UPDATE
       SET alasan=$3, email_admin=$4, created_at=NOW(), aksi='tolak', catatan_program=NULL, responded_at=NULL, email_program=NULL`,
      [idUsulan, item.noIndikator, item.alasan.trim(), email]
    );
  }

  // Reset indikator bermasalah ke Draft
  for (const no of nomorTolak) {
    await pool.query(
      `UPDATE usulan_indikator SET status='Draft', approved_by=NULL, approved_role=NULL, approved_at=NULL, catatan=NULL
       WHERE id_usulan=$1 AND no_indikator=$2`,
      [idUsulan, no]
    );
  }

  // Isi email_program di penolakan_indikator berdasarkan verifikasi_program
  // supaya catatan PP bisa ditampilkan ke Admin saat re-verif
  const allVPForEmail = await pool.query(
    'SELECT email_program, nama_program, indikator_akses FROM verifikasi_program WHERE id_usulan=$1', [idUsulan]
  );
  for (const no of nomorTolak) {
    // Cari PP yang bertanggung jawab atas indikator ini
    const ppForInd = allVPForEmail.rows.find(vp => {
      const akses = parseIndikatorAkses(vp.indikator_akses || '');
      return akses.length === 0 || akses.includes(no);
    });
    if (ppForInd) {
      await pool.query(
        `UPDATE penolakan_indikator SET email_program=$1 WHERE id_usulan=$2 AND no_indikator=$3`,
        [ppForInd.email_program, idUsulan, no]
      ).catch(() => {});
    }
  }

  // Reset SEMUA PP yang punya indikator bermasalah — termasuk yang sudah Selesai/setuju
  // Karena jika indikator A ditolak Admin, PP yang setuju indikator A juga harus re-verif
  const allVP = await pool.query('SELECT email_program, indikator_akses FROM verifikasi_program WHERE id_usulan=$1', [idUsulan]);
  let terkenaEmails = new Set();
  for (const vp of allVP.rows) {
    const aksesArr = parseIndikatorAkses(vp.indikator_akses || '');
    const adaIrisan = aksesArr.length === 0
      ? nomorTolak.length > 0
      : aksesArr.some(n => nomorTolak.includes(n));
    if (adaIrisan) {
      terkenaEmails.add(vp.email_program);
      await pool.query(
        `UPDATE verifikasi_program SET status='Menunggu', catatan=NULL, sanggahan=NULL, verified_at=NULL
         WHERE id_usulan=$1 AND LOWER(email_program)=LOWER($2)`,
        [idUsulan, vp.email_program]
      );
    }
  }

  // Kembalikan ke Pengelola Program (bukan Kapus) — wajib re-verif dari PP dulu
  await pool.query(
    `UPDATE usulan_header SET
       status_global='Menunggu Pengelola Program', is_locked=true,
       status_kapus='Selesai', status_program='Menunggu',
       ditolak_oleh='Admin', admin_catatan=$1,
       admin_approved_by=NULL, admin_approved_at=NULL,
       final_approved_by=NULL, final_approved_at=NULL
     WHERE id_usulan=$2`,
    [alasanGabungan, idUsulan]
  );
  await logAktivitas(pool, email, 'Admin', 'Tolak', idUsulan,
    'Indikator bermasalah ' + alasanGabungan + ' — dikembalikan ke Pengelola Program');
  return ok({ message: 'Usulan dikembalikan ke Pengelola Program untuk re-verifikasi.', nomorTolak });
}

async function rejectUsulan(pool, body) {
  const { idUsulan, email, role, alasan, indikatorList } = body;
  // indikatorList: array { noIndikator, alasan } — untuk Admin & Pengelola Program
  if (!alasan && !indikatorList) return err('Alasan penolakan wajib diisi');

  if (role === 'Kepala Puskesmas') {
    // Kepala Puskesmas tolak global → VP hanya reset yang memegang indikator bermasalah
    // Jangan reset VP yang sudah Selesai untuk indikator yang tidak bermasalah
    const piRowsKapus = await pool.query(
      `SELECT no_indikator FROM penolakan_indikator WHERE id_usulan=$1`, [idUsulan]
    ).catch(() => ({ rows: [] }));
    if (piRowsKapus.rows.length > 0) {
      const nomorBermasalah = piRowsKapus.rows.map(r => r.no_indikator);
      const allVPKapus = await pool.query(
        `SELECT email_program, indikator_akses FROM verifikasi_program WHERE id_usulan=$1`, [idUsulan]
      );
      for (const vp of allVPKapus.rows) {
        const aksesArr = parseIndikatorAkses(vp.indikator_akses || '');
        const adaIrisan = aksesArr.length === 0
          ? nomorBermasalah.length > 0
          : aksesArr.some(n => nomorBermasalah.includes(n));
        if (adaIrisan) {
          await pool.query(
            `UPDATE verifikasi_program SET status='Menunggu', catatan=NULL, verified_at=NULL
             WHERE id_usulan=$1 AND LOWER(email_program)=LOWER($2)`,
            [idUsulan, vp.email_program]
          );
        }
      }
    } else {
      // Tidak ada detail penolakan per indikator → reset semua VP
      await pool.query(`UPDATE verifikasi_program SET status='Menunggu', catatan=NULL, verified_at=NULL WHERE id_usulan=$1`, [idUsulan]);
    }
    await pool.query(`DELETE FROM penolakan_indikator WHERE id_usulan=$1`, [idUsulan]);
    await pool.query(
      `UPDATE usulan_header SET status_global='Ditolak', is_locked=false,
       status_kapus='Ditolak', status_program='Menunggu',
       ditolak_oleh='Kepala Puskesmas', kapus_approved_by=NULL, kapus_catatan=$1 WHERE id_usulan=$2`,
      [alasan.trim(), idUsulan]
    );
    await logAktivitas(pool, email, role, 'Tolak', idUsulan, alasan.trim());
    return ok({ message: 'Usulan ditolak oleh Kepala Puskesmas. Operator dapat memperbaiki.' });
  }

  if (role === 'Admin') {
    if (!indikatorList || !indikatorList.length) return err('Pilih minimal 1 indikator yang bermasalah');

    const nomorList = indikatorList.map(i => i.noIndikator);

    // Hapus penolakan lama, simpan yang baru
    await pool.query(`DELETE FROM penolakan_indikator WHERE id_usulan=$1`, [idUsulan]).catch(() => {});
    for (const item of indikatorList) {
      await pool.query(
        `INSERT INTO penolakan_indikator (id_usulan, no_indikator, alasan, email_admin, created_at, aksi, catatan_program, responded_at, email_program)
         VALUES ($1,$2,$3,$4,NOW(),'tolak',NULL,NULL,NULL)
         ON CONFLICT (id_usulan, no_indikator) DO UPDATE
         SET alasan=$3, email_admin=$4, created_at=NOW(), aksi='tolak', catatan_program=NULL, responded_at=NULL, email_program=NULL`,
        [idUsulan, item.noIndikator, item.alasan.trim(), email]
      );
    }

    // Reset indikator bermasalah ke Draft
    for (const no of nomorList) {
      await pool.query(
        `UPDATE usulan_indikator SET status='Draft', approved_by=NULL, approved_role=NULL, approved_at=NULL, catatan=NULL
         WHERE id_usulan=$1 AND no_indikator=$2`,
        [idUsulan, no]
      );
    }

    // Reset SEMUA PP yang punya indikator bermasalah — termasuk yang sudah Selesai/setuju
    // aksesArr kosong = PP bertanggung jawab semua indikator → selalu terkena
    const allVPAdmin = await pool.query(
      `SELECT email_program, indikator_akses FROM verifikasi_program WHERE id_usulan=$1`, [idUsulan]
    );
    for (const vp of allVPAdmin.rows) {
      const aksesArr = parseIndikatorAkses(vp.indikator_akses || '');
      const adaIrisan = aksesArr.length === 0
        ? nomorList.length > 0
        : aksesArr.some(n => nomorList.includes(n));
      if (adaIrisan) {
        await pool.query(
          `UPDATE verifikasi_program SET status='Menunggu', catatan=NULL, sanggahan=NULL, verified_at=NULL
           WHERE id_usulan=$1 AND LOWER(email_program)=LOWER($2)`,
          [idUsulan, vp.email_program]
        );
      }
    }

    const alasanGabungan = indikatorList.map(i => `#${i.noIndikator}: ${i.alasan}`).join(' | ');
    await pool.query(
      `UPDATE usulan_header SET status_global='Menunggu Pengelola Program', is_locked=true,
       status_kapus='Selesai', status_program='Menunggu',
       ditolak_oleh='Admin', admin_catatan=$1,
       admin_approved_by=NULL, admin_approved_at=NULL,
       final_approved_by=NULL, final_approved_at=NULL
       WHERE id_usulan=$2`,
      [alasanGabungan, idUsulan]
    );
    await logAktivitas(pool, email, 'Admin', 'Tolak', idUsulan,
      `Indikator bermasalah ${alasanGabungan} — dikembalikan ke Pengelola Program`);
    return ok({ message: 'Usulan dikembalikan ke Pengelola Program untuk re-verifikasi.', nomorTolak: nomorList });
  }

  if (role === 'Pengelola Program') {
    // Pengelola Program tolak → tandai VP-nya sebagai Ditolak
    const vpCheck = await pool.query(
      'SELECT id, status FROM verifikasi_program WHERE id_usulan=$1 AND LOWER(email_program)=LOWER($2)',
      [idUsulan, email]
    );
    if (vpCheck.rows.length === 0) return err('Anda tidak terdaftar sebagai pengelola program untuk usulan ini');
    if (vpCheck.rows[0].status === 'Selesai') return err('Anda sudah menyetujui usulan ini');
    if (vpCheck.rows[0].status === 'Ditolak') return err('Anda sudah menolak usulan ini');

    // Validasi indikatorList wajib ada dari frontend
    if (!indikatorList || !indikatorList.length) return err('Pilih minimal 1 indikator yang bermasalah dan isi alasannya');

    // Pastikan indikator yang dipilih memang akses VP ini
    const vpAksesResult = await pool.query(
      'SELECT indikator_akses FROM verifikasi_program WHERE id_usulan=$1 AND LOWER(email_program)=LOWER($2)',
      [idUsulan, email]
    );
    const myAkses = parseIndikatorAkses(vpAksesResult.rows[0]?.indikator_akses || '');
    const nomorDipilih = indikatorList.map(i => i.noIndikator);
    if (myAkses.length > 0) {
      const invalid = nomorDipilih.filter(n => !myAkses.includes(n));
      if (invalid.length > 0) return err(`Indikator ${invalid.join(',')} bukan tanggung jawab Anda`);
    }

    // FIX Bug #2: Simpan dulu keputusan tolak VP ini ke verifikasi_program,
    // tapi JANGAN insert penolakan_indikator atau ubah status_global dulu.
    // Semua perubahan global ditunda sampai semua VP selesai verifikasi.
    const alasanGabungan = indikatorList.map(i => `#${i.noIndikator}: ${i.alasan}`).join(' | ');
    await pool.query(
      `UPDATE verifikasi_program SET status='Ditolak', catatan=$1, verified_at=NOW() WHERE id_usulan=$2 AND LOWER(email_program)=LOWER($3)`,
      [alasanGabungan, idUsulan, email]
    );
    await logAktivitas(pool, email, 'Pengelola Program', 'Tolak', idUsulan, alasanGabungan);

    // Cek status semua VP SETELAH update VP ini
    const allVP = await pool.query('SELECT status FROM verifikasi_program WHERE id_usulan=$1', [idUsulan]);
    const allDone = allVP.rows.every(r => r.status !== 'Menunggu');
    const rejectedCount = allVP.rows.filter(r => r.status === 'Ditolak').length;

    // FIX Bug #2: Jangan proses apapun ke status_global selama masih ada VP yang belum verif
    if (!allDone) {
      return ok({ message: 'Penolakan Anda disimpan. Menunggu pengelola program lain.', allDone: false });
    }

    // Semua VP sudah verifikasi dan ada yang menolak — proses hasilnya
    // FIX Bug #3: Kumpulkan indikator bermasalah dari catatan semua VP yang menolak
    // (catatan tersimpan dalam format "#no: alasan | #no: alasan")
    const rejectedVPs = await pool.query(
      `SELECT vp.email_program, vp.catatan FROM verifikasi_program vp WHERE id_usulan=$1 AND status='Ditolak'`,
      [idUsulan]
    );
    const alasanMap = {}; // noIndikator -> alasan
    for (const vp of rejectedVPs.rows) {
      const parts = (vp.catatan || '').split('|').map(s => s.trim()).filter(Boolean);
      for (const part of parts) {
        const match = part.match(/^#(\d+):\s*(.*)/);
        if (match) {
          const no = parseInt(match[1]);
          if (!alasanMap[no]) alasanMap[no] = match[2] || 'Ditolak oleh Pengelola Program';
        }
      }
    }
    // Pastikan indikator dari VP yang sedang request ini juga masuk (paling akurat)
    for (const item of indikatorList) {
      alasanMap[item.noIndikator] = item.alasan || alasanMap[item.noIndikator] || 'Ditolak';
    }
    const nomorBermasalah = [...new Set(Object.keys(alasanMap).map(Number))];

    // Reset hanya indikator bermasalah ke Draft
    for (const no of nomorBermasalah) {
      await pool.query(
        `UPDATE usulan_indikator SET status='Draft', approved_by=NULL, approved_role=NULL, approved_at=NULL, catatan=NULL
         WHERE id_usulan=$1 AND no_indikator=$2`,
        [idUsulan, no]
      );
      await pool.query(
        `INSERT INTO penolakan_indikator (id_usulan, no_indikator, alasan, email_admin, created_at, aksi)
         VALUES ($1,$2,$3,$4,NOW(),'tolak')
         ON CONFLICT (id_usulan, no_indikator) DO UPDATE SET alasan=$3,
         email_admin=$4, created_at=NOW(), aksi='tolak', catatan_program=NULL, responded_at=NULL, email_program=NULL`,
        [idUsulan, no, alasanMap[no] || 'Ditolak oleh Pengelola Program', email]
      );
    }

    // FIX Bug #5 (syntax): Gunakan template literal, bukan single-quote di dalam single-quote
    // Reset VP yang menolak — HANYA yang punya irisan dengan nomorBermasalah
    const allVPReject = await pool.query(
      `SELECT email_program, indikator_akses FROM verifikasi_program WHERE id_usulan=$1 AND status='Ditolak'`,
      [idUsulan]
    );
    for (const vp of allVPReject.rows) {
      const aksesArr = parseIndikatorAkses(vp.indikator_akses || '');
      const adaIrisan = aksesArr.length === 0
        ? nomorBermasalah.length > 0
        : aksesArr.some(n => nomorBermasalah.includes(n));
      if (adaIrisan) {
        await pool.query(
          `UPDATE verifikasi_program SET status='Menunggu', catatan=NULL, verified_at=NULL WHERE id_usulan=$1 AND LOWER(email_program)=LOWER($2)`,
          [idUsulan, vp.email_program]
        );
      }
      // VP yang menolak tapi tidak terkena indikator bermasalah → biarkan Ditolak
    }

    // Tentukan arah: jika konteks re-verif Admin → kembali ke Admin; jika normal → ke Kapus
    const headerDirReject = await pool.query('SELECT ditolak_oleh FROM usulan_header WHERE id_usulan=$1', [idUsulan]);
    const ditolakOlehDirReject = headerDirReject.rows[0]?.ditolak_oleh;

    if (ditolakOlehDirReject === 'Admin') {
      await pool.query(
        `UPDATE usulan_header SET status_global='Menunggu Admin', status_kapus='Selesai',
         status_program='Menunggu', is_locked=true WHERE id_usulan=$1`,
        [idUsulan]
      );
      await logAktivitas(pool, email, 'Pengelola Program', 'Tolak', idUsulan,
        `Indikator bermasalah ${nomorBermasalah.map(n=>'#'+n).join(', ')} — dikembalikan ke Admin untuk re-verifikasi`);
      return ok({ message: 'Indikator bermasalah dikembalikan ke Admin untuk re-verifikasi.', allDone: true });
    }

    // Normal / loop PP↔Kapus: PP tolak → ke Kapus
    await pool.query(
      `UPDATE usulan_header SET status_global='Menunggu Kepala Puskesmas', status_kapus='Menunggu',
       status_program='Menunggu', ditolak_oleh='Pengelola Program', is_locked=true WHERE id_usulan=$1`,
      [idUsulan]
    );
    await logAktivitas(pool, email, 'Pengelola Program', 'Tolak', idUsulan,
      `Indikator bermasalah ${nomorBermasalah.map(n=>'#'+n).join(', ')} — re-verifikasi dari Kepala Puskesmas`);
    return ok({ message: 'Indikator bermasalah dikembalikan untuk re-verifikasi dari Kepala Puskesmas.', allDone: true });
  }

  return err('Role tidak diizinkan untuk reject', 403);
}

async function getPenolakanIndikator(pool, params) {
  const { idUsulan } = params;
  if (!idUsulan) return err('idUsulan diperlukan');
  const r = await pool.query(`SELECT * FROM penolakan_indikator WHERE id_usulan=$1 ORDER BY no_indikator`, [idUsulan]);
  return ok(r.rows);
}

async function respondPenolakan(pool, body) {
  // Pengelola Program respond per indikator: aksi = 'sanggah' atau 'tolak'
  const { idUsulan, email, responList } = body;
  // responList: array { noIndikator, aksi, catatan }
  if (!responList || !responList.length) return err('Respon diperlukan');

  const check = await pool.query(`SELECT status_global FROM usulan_header WHERE id_usulan=$1`, [idUsulan]);
  if (!check.rows.length) return err('Usulan tidak ditemukan');
  if (!['Ditolak','Menunggu Pengelola Program'].includes(check.rows[0].status_global)) return err('Usulan tidak dalam status yang dapat direspon');

  // Simpan respon per indikator
  for (const item of responList) {
    if (!item.catatan || !item.catatan.trim()) return err(`Catatan wajib diisi untuk indikator ${item.noIndikator}`);
    await pool.query(
      `UPDATE penolakan_indikator SET aksi=$1, catatan_program=$2, email_program=$3, responded_at=NOW()
       WHERE id_usulan=$4 AND no_indikator=$5`,
      [item.aksi, item.catatan.trim(), email, idUsulan, item.noIndikator]
    );
    await logAktivitas(pool, email, 'Pengelola Program', item.aksi === 'sanggah' ? 'Sanggah' : 'Tolak Indikator',
      idUsulan, `Indikator ${item.noIndikator}: ${item.catatan.trim()}`);
  }

  // Update status VP user ini sudah respond
  await pool.query(
    `UPDATE verifikasi_program SET status='Selesai', verified_at=NOW()
     WHERE id_usulan=$1 AND LOWER(email_program)=LOWER($2)`,
    [idUsulan, email]
  );

  // Cek PP yang masih perlu respond:
  // Ambil semua no_indikator bermasalah (aksi IS NULL = belum direspon)
  const penolakanAktif = await pool.query(
    `SELECT no_indikator FROM penolakan_indikator WHERE id_usulan=$1 AND aksi IS NULL`,
    [idUsulan]
  );
  const nosAktif = penolakanAktif.rows.map(r => parseInt(r.no_indikator));

  // Cari semua VP (selain PP yang baru saja respond) yang aksesnya overlap dengan indikator bermasalah
  // dan statusnya belum Selesai
  const semuaVP = await pool.query(
    `SELECT email_program, indikator_akses, status FROM verifikasi_program
     WHERE id_usulan=$1 AND LOWER(email_program) != LOWER($2) AND status != 'Selesai'`,
    [idUsulan, email]
  );

  const masihMenunggu = semuaVP.rows.filter(vp => {
    const akses = (vp.indikator_akses || '').split(',').map(s => parseInt(s.trim())).filter(Boolean);
    if (akses.length === 0) return nosAktif.length > 0; // PP akses semua → selalu terkena
    return akses.some(n => nosAktif.includes(n));
  }).length;

  if (masihMenunggu > 0) {
    // Masih ada VP lain yang belum respond
    return ok({ message: 'Respon tersimpan. Menunggu Pengelola Program lain.', selesai: false });
  }

  // Semua sudah respond — cek ada yang 'tolak' tidak
  const adaTolak = await pool.query(
    `SELECT COUNT(*) as ct FROM penolakan_indikator WHERE id_usulan=$1 AND aksi='tolak'`,
    [idUsulan]
  );
  const jumlahTolak = parseInt(adaTolak.rows[0].ct);

  if (jumlahTolak === 0) {
    // Semua sanggah → langsung ke Admin, pertahankan ditolak_oleh='Admin' agar Admin tahu re-verifikasi
    await pool.query(
      `UPDATE usulan_header SET status_global='Menunggu Admin', status_program='Selesai', status_final='Menunggu',
       ditolak_oleh='Admin'
       WHERE id_usulan=$1`,
      [idUsulan]
    );
    await logAktivitas(pool, email, 'Pengelola Program', 'Sanggah Selesai', idUsulan, 'Semua pengelola sanggah → ke Admin');
    // FIX (a): Catat log "Re-verifikasi" agar muncul di riwayat aktivitas
    // saat PP menyetujui setelah siklus Admin tolak → Kapus approve → PP respond
    await logAktivitas(pool, email, 'Pengelola Program', 'Re-verifikasi', idUsulan,
      'Semua indikator disetujui — catatan: data sudah diperbaiki oleh kapus');
    return ok({ message: 'Semua pengelola program menyampaikan sanggahan. Diteruskan ke Admin.', selesai: true, aksi: 'sanggah' });
  }

  // Ada yang tolak → PP membenarkan Admin → berjenjang ke Kapus dulu
  // Alur: PP membenarkan → Kapus re-verif → (Kapus tolak = membenarkan → Operator perbaiki)
  const ditolakRows = await pool.query(
    `SELECT no_indikator FROM penolakan_indikator WHERE id_usulan=$1 AND aksi='tolak'`,
    [idUsulan]
  );
  const nomorDitolak = ditolakRows.rows.map(r => r.no_indikator);

  // Reset indikator bermasalah di usulan_indikator
  for (const no of nomorDitolak) {
    await pool.query(
      `UPDATE usulan_indikator SET status='Draft', approved_by=NULL, approved_role=NULL, approved_at=NULL, catatan=NULL
       WHERE id_usulan=$1 AND no_indikator=$2`,
      [idUsulan, no]
    );
  }

  // Catat aksi='reset' agar Kapus tahu indikator mana yang bermasalah
  await pool.query(
    `UPDATE penolakan_indikator SET aksi='reset' WHERE id_usulan=$1 AND no_indikator=ANY($2)`,
    [idUsulan, nomorDitolak]
  );

  // Kembalikan ke Kapus untuk re-verifikasi berjenjang
  // Set ditolak_oleh='Pengelola Program' agar frontend tahu ini loop PP↔Kapus
  // (backend verifKapus tetap bisa deteksi konteks Admin via piCheckPP: email_program IS NOT NULL)
  await pool.query(
    `UPDATE usulan_header SET
       status_global='Menunggu Kepala Puskesmas', is_locked=true,
       status_kapus='Menunggu', status_program='Menunggu',
       ditolak_oleh='Pengelola Program',
       admin_catatan=$1
     WHERE id_usulan=$2`,
    [`PP membenarkan — indikator bermasalah ${nomorDitolak.map(n=>'#'+n).join(', ')}`, idUsulan]
  );

  // Log: PP Membenarkan — semua pihak bisa lihat di riwayat aktivitas
  const alasanPP = ditolakRows.rows.map(r => {
    const pi = responList.find(x => parseInt(x.noIndikator) === parseInt(r.no_indikator));
    return pi ? `#${r.no_indikator}: ${pi.catatan}` : `#${r.no_indikator}`;
  }).join(' | ');
  await logAktivitas(pool, email, 'Pengelola Program', 'PP Membenarkan', idUsulan,
    `Membenarkan penolakan Admin — diteruskan ke Kepala Puskesmas | Indikator: ${nomorDitolak.join(',')} | ${alasanPP}`);

  return ok({ message: 'PP membenarkan penolakan Admin — diteruskan ke Kepala Puskesmas untuk re-verifikasi.', selesai: true, aksi: 'tolak', nomorDitolak });
}



// Helper: parse indikator_akses string yang bisa berformat "1,3,5" atau "1-5" atau gabungan
function parseIndikatorAkses(str) {
  if (!str) return [];
  const result = [];
  str.replace(/\s/g,'').split(',').forEach(part => {
    if (part.includes('-')) {
      const [s, e] = part.split('-').map(Number);
      if (!isNaN(s) && !isNaN(e)) for (let i = s; i <= e; i++) result.push(i);
    } else {
      const n = Number(part);
      if (!isNaN(n) && n > 0) result.push(n);
    }
  });
  return [...new Set(result)];
}

async function logAktivitas(pool, email, role, aksi, idUsulan, detail) {
  // Gunakan NOW() dari PostgreSQL agar waktu selalu akurat (UTC) regardless timezone server
  try { await pool.query(`INSERT INTO log_aktivitas (timestamp,user_email,role,aksi,id_usulan,detail) VALUES (NOW(),$1,$2,$3,$4,$5)`, [email,role,aksi,idUsulan,detail]); }
  catch(e) { console.error('Log error:', e); }
}

function mapHeader(r) {
  const bn = ['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const isDitolak = (r.status_global||'') === 'Ditolak';
  let alasanTolak = '', ditolakOleh = '';
  if (isDitolak) {
    if ((r.status_kapus||'') === 'Ditolak') {
      ditolakOleh = 'Kepala Puskesmas';
      alasanTolak = r.kapus_catatan || '';
    } else if ((r.ditolak_oleh||'') === 'Admin') {
      ditolakOleh = 'Admin';
      alasanTolak = r.admin_catatan || '';
    } else if ((r.ditolak_oleh||'') === 'Pengelola Program') {
      // Gunakan kolom ditolak_oleh dari DB sebagai sumber utama (lebih akurat)
      ditolakOleh = 'Pengelola Program';
      alasanTolak = r.admin_catatan || '';
    } else if (r.ditolak_oleh) {
      // Nilai lain yang tersimpan eksplisit di DB
      ditolakOleh = r.ditolak_oleh;
      alasanTolak = r.admin_catatan || r.kapus_catatan || '';
    } else {
      // Fallback untuk data lama yang belum punya kolom ditolak_oleh
      const raw = r.admin_catatan || '';
      ditolakOleh = raw.startsWith('Ditolak oleh ') ? raw.split(':')[0].replace('Ditolak oleh ','').trim() : 'Pengelola Program';
      alasanTolak = raw.includes(':') ? raw.split(':').slice(1).join(':').trim() : raw;
    }
  }
  return {
    idUsulan:r.id_usulan, tahun:r.tahun, bulan:r.bulan, namaBulan:bn[r.bulan]||'',
    periodeKey:r.periode_key, kodePKM:r.kode_pkm, namaPKM:r.nama_puskesmas||r.kode_pkm,
    totalNilai:parseFloat(r.total_nilai)||0, totalBobot:parseFloat(r.total_bobot)||0,
    indeksKinerja:parseFloat(r.indeks_kinerja_spm)||0, indeksBeban:parseFloat(r.indeks_beban_kerja)||0,
    indeksKesulitan:parseFloat(r.indeks_kesulitan_wilayah)||0,
    indeksSPM:parseFloat(r.indeks_spm)||0,
    statusKapus:r.status_kapus||'Menunggu', statusProgram:r.status_program||'Menunggu',
    statusFinal:r.status_final||'Menunggu', statusGlobal:r.status_global||'Draft',
    isLocked:r.is_locked||false, createdBy:r.created_by||'', createdAt:r.created_at,
    namaPembuat:r.nama_pembuat||'',
    kapusApprovedBy:r.kapus_approved_by||'', kapusApprovedAt:r.kapus_approved_at,
    kapusCatatan:r.kapus_catatan||'', operatorCatatan:r.operator_catatan||'',
    adminApprovedBy:r.admin_approved_by||'',
    adminApprovedAt:r.admin_approved_at, adminCatatan:r.admin_catatan||'',
    finalApprovedBy:r.final_approved_by||'', finalApprovedAt:r.final_approved_at,
    driveFolderUrl:r.drive_folder_url||'', driveFolderId:r.drive_folder_id||'',
    ditolakOleh: r.ditolak_oleh || ditolakOleh,
    // Auto-koreksi status lama: jika Admin menolak tapi status masih 'Ditolak' padahal PP belum respon
    // (statusGlobal akan dikoreksi di frontend berdasarkan penolakanIndikator)
    alasanTolak
  };
}

async function adminResetUsulan(pool, body) {
  const { idUsulan, email } = body;
  if (!idUsulan) return err('idUsulan diperlukan');
  await pool.query(
    `UPDATE usulan_header SET is_locked=false, status_global='Draft',
     status_kapus='Menunggu', status_program='Menunggu', status_final='Menunggu',
     kapus_approved_by=NULL, admin_approved_by=NULL WHERE id_usulan=$1`, [idUsulan]
  );
  await pool.query(`UPDATE verifikasi_program SET status='Menunggu', verified_at=NULL WHERE id_usulan=$1`, [idUsulan]);
  await logAktivitas(pool, email, 'Admin', 'Reset', idUsulan, 'Direset oleh Admin');
  return ok({ message: 'Usulan berhasil direset ke Draft' });
}

async function restoreVerifStatus(pool, body) {
  const { idUsulan, emailAdmin, kapusBy, kapusAt } = body;
  if (!idUsulan) return err('idUsulan diperlukan');
  const adminCheck = await pool.query(`SELECT role FROM users WHERE LOWER(email)=LOWER($1)`, [emailAdmin]);
  if (!adminCheck.rows.length || adminCheck.rows[0].role !== 'Admin') return err('Hanya Admin yang bisa restore');
  await pool.query(
    `UPDATE usulan_header SET status_kapus='Selesai', status_program='Selesai',
     kapus_approved_by=COALESCE(kapus_approved_by,$2), kapus_approved_at=COALESCE(kapus_approved_at,$3)
     WHERE id_usulan=$1`, [idUsulan, kapusBy||'restored', kapusAt||'NOW()']
  );
  await pool.query(
    `UPDATE verifikasi_program SET status='Selesai', verified_at=NOW(),
     catatan=COALESCE(catatan,'Dipulihkan oleh Admin') WHERE id_usulan=$1 AND status='Menunggu'`, [idUsulan]
  );
  await logAktivitas(pool, emailAdmin, 'Admin', 'Restore Verif', idUsulan, 'Status verifikasi dipulihkan');
  return ok({ message: 'Status verifikasi berhasil dipulihkan' });
}

async function getLogAktivitas(pool, idUsulan) {
  if (!idUsulan) return err('idUsulan diperlukan');
  const [logResult, headerResult] = await Promise.all([
    pool.query(
      `SELECT la.*, u.nama as user_nama
       FROM log_aktivitas la
       LEFT JOIN users u ON LOWER(u.email)=LOWER(la.user_email)
       WHERE la.id_usulan=$1 ORDER BY la.timestamp ASC`,
      [idUsulan]
    ),
    pool.query(
      `SELECT uh.*, p.nama_puskesmas, p.indeks_kesulitan_wilayah FROM usulan_header uh
       LEFT JOIN master_puskesmas p ON uh.kode_pkm=p.kode_pkm
       WHERE uh.id_usulan=$1`,
      [idUsulan]
    )
  ]);
  const usulan = headerResult.rows.length ? mapHeader(headerResult.rows[0]) : null;
  return ok({ logs: logResult.rows, usulan });
}
