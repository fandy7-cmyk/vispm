const { getPool, ok, err, cors } = require('./db');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();
  const pool = getPool();
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
    if (method === 'POST' && path === 'approve-kapus') return await approveKapus(pool, body);
    if (method === 'POST' && path === 'approve-program') return await approveProgram(pool, body);
    if (method === 'POST' && path === 'approve-admin') return await approveAdmin(pool, body);
    if (method === 'POST' && path === 'reject') return await rejectUsulan(pool, body);
    if (method === 'PUT' && path === 'drive-folder') return await saveDriveFolder(pool, body);
    if (method === 'POST' && path === 'admin-reset') return await adminResetUsulan(pool, body);
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
  const ws = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const result = await pool.query(
    `SELECT uh.*, p.nama_puskesmas FROM usulan_header uh LEFT JOIN master_puskesmas p ON uh.kode_pkm=p.kode_pkm ${ws} ORDER BY uh.created_at DESC LIMIT 500`,
    qParams
  );
  if (result.rows.length === 0) return ok([]);
  const ids = result.rows.map(r => r.id_usulan);
  const vpResult = await pool.query(
    `SELECT id_usulan, COUNT(*) as total, COUNT(CASE WHEN status='Selesai' THEN 1 END) as selesai FROM verifikasi_program WHERE id_usulan=ANY($1) GROUP BY id_usulan`,
    [ids]
  );
  const vpMap = {};
  vpResult.rows.forEach(r => { vpMap[r.id_usulan] = { total: parseInt(r.total), selesai: parseInt(r.selesai) }; });
  return ok(result.rows.map(r => ({ ...mapHeader(r), vpProgress: vpMap[r.id_usulan] || null })));
}

async function getUsulanDetail(pool, idUsulan) {
  if (!idUsulan) return err('ID usulan diperlukan');
  const result = await pool.query(
    `SELECT uh.*, p.nama_puskesmas FROM usulan_header uh LEFT JOIN master_puskesmas p ON uh.kode_pkm=p.kode_pkm WHERE uh.id_usulan=$1`,
    [idUsulan]
  );
  if (result.rows.length === 0) return err('Usulan tidak ditemukan', 404);
  const vpResult = await pool.query(
    `SELECT email_program, nama_program, indikator_akses, status, catatan, verified_at FROM verifikasi_program WHERE id_usulan=$1 ORDER BY created_at`,
    [idUsulan]
  );
  const detail = mapHeader(result.rows[0]);
  detail.verifikasiProgram = vpResult.rows;
  return ok(detail);
}

async function getIndikatorUsulan(pool, idUsulan) {
  if (!idUsulan) return err('ID usulan diperlukan');
  const result = await pool.query(
    `SELECT ui.*, mi.nama_indikator FROM usulan_indikator ui LEFT JOIN master_indikator mi ON ui.no_indikator=mi.no_indikator WHERE ui.id_usulan=$1 ORDER BY ui.no_indikator`,
    [idUsulan]
  );
  return ok(result.rows.map(r => ({
    id: r.id, no: r.no_indikator, nama: r.nama_indikator,
    target: parseFloat(r.target)||0, capaian: parseFloat(r.capaian)||0,
    realisasiRasio: parseFloat(r.realisasi_rasio)||0, bobot: r.bobot||0,
    nilaiTerbobot: parseFloat(r.nilai_terbobot)||0, status: r.status||'Draft',
    approvedBy: r.approved_by||'', approvedRole: r.approved_role||'',
    approvedAt: r.approved_at, catatan: r.catatan||'', linkFile: r.link_file||''
  })));
}

async function getProgramVerifStatus(pool, idUsulan) {
  if (!idUsulan) return err('ID usulan diperlukan');
  const result = await pool.query(
    `SELECT email_program, nama_program, indikator_akses, status, catatan, verified_at FROM verifikasi_program WHERE id_usulan=$1 ORDER BY created_at`,
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
  if (!kodePKM || !tahun || !bulan || !emailOperator) return err('Data tidak lengkap');
  const periodeCheck = await pool.query(
    `SELECT id, tanggal_mulai, tanggal_selesai FROM periode_input
     WHERE tahun=$1 AND bulan=$2 AND status='Aktif'`,
    [tahun, bulan]
  );
  if (periodeCheck.rows.length === 0) return err('Periode input untuk bulan/tahun ini belum diaktifkan. Hubungi Admin.');
  // Cek rentang tanggal jika ada
  const p = periodeCheck.rows[0];
  if (p.tanggal_mulai && p.tanggal_selesai) {
    const today = new Date();
    today.setHours(0,0,0,0);
    const mulai = new Date(p.tanggal_mulai);
    mulai.setHours(0,0,0,0);
    const selesai = new Date(p.tanggal_selesai);
    selesai.setHours(23,59,59);
    if (today < mulai) return err(`Periode input belum dimulai. Mulai ${mulai.toLocaleDateString('id-ID')}.`);
    if (today > selesai) return err(`Periode input sudah ditutup pada ${selesai.toLocaleDateString('id-ID')}.`);
  }
  const dupCheck = await pool.query(`SELECT id_usulan FROM usulan_header WHERE created_by=$1 AND tahun=$2 AND bulan=$3`, [emailOperator, tahun, bulan]);
  if (dupCheck.rows.length > 0) return err(`Anda sudah memiliki usulan untuk periode ini (${dupCheck.rows[0].id_usulan}). Setiap operator hanya dapat mengajukan 1 usulan per periode.`);
  const periodeKey = `${tahun}-${String(bulan).padStart(2,'0')}-01`;
  const idUsulan = `${kodePKM}-${tahun}-${String(bulan).padStart(2,'0')}`;
  const existing = await pool.query('SELECT id_usulan FROM usulan_header WHERE id_usulan=$1', [idUsulan]);
  if (existing.rows.length > 0) return err('Usulan untuk puskesmas ini di periode ini sudah ada');
  const pkmResult = await pool.query('SELECT indeks_beban_kerja FROM master_puskesmas WHERE kode_pkm=$1', [kodePKM]);
  const indeksBeban = pkmResult.rows.length > 0 ? parseFloat(pkmResult.rows[0].indeks_beban_kerja)||0 : 0;
  const indResult = await pool.query('SELECT no_indikator, bobot FROM master_indikator WHERE aktif=true ORDER BY no_indikator');
  const totalBobot = indResult.rows.reduce((s,r) => s+(parseInt(r.bobot)||0), 0);
  const ppResult = await pool.query(`SELECT email, nama, indikator_akses FROM users WHERE role='Pengelola Program' AND aktif=true`);
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
      await client.query(`INSERT INTO verifikasi_program (id_usulan,email_program,nama_program,indikator_akses,status,created_at) VALUES ($1,$2,$3,$4,'Menunggu',NOW())`, [idUsulan,pp.email,pp.nama,pp.indikator_akses||'']);
    }
    await client.query('COMMIT');
    return ok({ idUsulan, message: 'Usulan berhasil dibuat' });
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}

async function updateIndikator(pool, body) {
  const { idUsulan, noIndikator, target, capaian, catatan, linkFile } = body;

  const lockCheck = await pool.query('SELECT is_locked, status_global FROM usulan_header WHERE id_usulan=$1', [idUsulan]);
  if (lockCheck.rows.length === 0) return err('Usulan tidak ditemukan');
  const { is_locked, status_global } = lockCheck.rows[0];
  // Boleh edit kalau: tidak terkunci, ATAU status Ditolak (operator perbaiki)
  if (is_locked && status_global !== 'Ditolak') return err('Usulan sudah terkunci dan tidak dapat diedit');

  const t = parseFloat(target) || 0;
  const c = parseFloat(capaian) || 0;

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

  // Update — link_file hanya diupdate kalau ada nilainya
  if (linkFile !== undefined && linkFile !== null && linkFile !== '') {
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
  const { idUsulan, email, forceSubmit } = body;

  const result = await pool.query('SELECT status_global FROM usulan_header WHERE id_usulan=$1', [idUsulan]);
  if (result.rows.length === 0) return err('Usulan tidak ditemukan');
  const statusSaatIni = result.rows[0].status_global;
  // Izinkan submit dari Draft ATAU Ditolak (ajukan ulang setelah diperbaiki)
  if (statusSaatIni !== 'Draft' && statusSaatIni !== 'Ditolak') return err('Usulan tidak dapat disubmit pada status ini');

  // Kalau resubmit dari Ditolak: reset sesuai level penolakan
  if (statusSaatIni === 'Ditolak') {
    const tolakInfo = await pool.query('SELECT status_kapus, status_program FROM usulan_header WHERE id_usulan=$1', [idUsulan]);
    const { status_kapus, status_program } = tolakInfo.rows[0];

    if (status_kapus === 'Ditolak') {
      // Ditolak Kapus → reset semua dari awal
      await pool.query(
        `UPDATE usulan_header SET
          status_kapus='Menunggu', status_program='Menunggu', status_final='Menunggu',
          kapus_approved_by=NULL, kapus_approved_at=NULL, kapus_catatan=NULL,
          admin_approved_by=NULL, admin_approved_at=NULL, admin_catatan=NULL,
          final_approved_by=NULL, final_approved_at=NULL
         WHERE id_usulan=$1`,
        [idUsulan]
      );
      await pool.query(
        `UPDATE verifikasi_program SET status='Menunggu', catatan=NULL, verified_at=NULL WHERE id_usulan=$1`,
        [idUsulan]
      );
    } else if (status_program === 'Ditolak') {
      // Ditolak Pengelola Program → Kapus sudah approve (tidak perlu ulang)
      // Hanya reset yang berstatus 'Ditolak', yang sudah 'Selesai' TETAP Selesai
      await pool.query(
        `UPDATE verifikasi_program SET status='Menunggu', catatan=NULL, verified_at=NULL
         WHERE id_usulan=$1 AND status='Ditolak'`,
        [idUsulan]
      );
      // Reset header ke Menunggu Program, hapus catatan tolak
      await pool.query(
        `UPDATE usulan_header SET
          status_program='Menunggu', status_final='Menunggu',
          admin_approved_by=NULL, admin_approved_at=NULL, admin_catatan=NULL,
          final_approved_by=NULL, final_approved_at=NULL
         WHERE id_usulan=$1`,
        [idUsulan]
      );
    } else {
      // Ditolak Admin → Kapus sudah approve, reset program dan admin saja
      await pool.query(
        `UPDATE verifikasi_program SET status='Menunggu', catatan=NULL, verified_at=NULL WHERE id_usulan=$1`,
        [idUsulan]
      );
      await pool.query(
        `UPDATE usulan_header SET
          status_program='Menunggu', status_final='Menunggu',
          admin_approved_by=NULL, admin_approved_at=NULL, admin_catatan=NULL,
          final_approved_by=NULL, final_approved_at=NULL
         WHERE id_usulan=$1`,
        [idUsulan]
      );
    }
  }

  // Cek indikator yang belum ada bukti
  const indResult = await pool.query(
    'SELECT no_indikator, link_file FROM usulan_indikator WHERE id_usulan=$1',
    [idUsulan]
  );
  const missing = indResult.rows.filter(r => !r.link_file || r.link_file.trim() === '');

  // Kalau ada yang kurang DAN belum force → kembalikan warning untuk konfirmasi user
  if (missing.length > 0 && !forceSubmit) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        success: false,
        needConfirm: true,
        missingCount: missing.length,
        missingNos: missing.map(r => r.no_indikator),
        message: `${missing.length} indikator belum ada file bukti (no. ${missing.map(r=>r.no_indikator).join(', ')}). Tetap submit?`
      })
    };
  }

  // Tentukan status tujuan submit:
  // - Dari Draft → Menunggu Kapus (normal)
  // - Dari Ditolak Kapus → Menunggu Kapus (ulang dari awal)
  // - Dari Ditolak Program → Menunggu Program (Kapus skip, langsung ke program)
  // - Dari Ditolak Admin → Menunggu Program (ulang dari program)
  let targetStatus = 'Menunggu Kapus';
  if (statusSaatIni === 'Ditolak') {
    const tolakInfo = await pool.query('SELECT status_kapus, status_program FROM usulan_header WHERE id_usulan=$1', [idUsulan]);
    const { status_kapus, status_program } = tolakInfo.rows[0];
    if (status_kapus !== 'Ditolak') {
      // Kapus sudah approve sebelumnya → langsung ke Menunggu Program
      targetStatus = 'Menunggu Program';
    }
  }

  await pool.query(
    `UPDATE usulan_header SET status_global=$1, is_locked=true WHERE id_usulan=$2`,
    [targetStatus, idUsulan]
  );
  const isResubmit = statusSaatIni === 'Ditolak';
  await logAktivitas(pool, email, 'Operator', isResubmit ? 'Ajukan Ulang' : 'Submit', idUsulan,
    isResubmit ? `Diajukan ulang — diteruskan ke ${targetStatus}` : 'Disubmit ke Kapus'
  );
  return ok({ message: isResubmit
    ? `Usulan berhasil diajukan ulang! Diteruskan ke ${targetStatus}.`
    : 'Usulan berhasil disubmit ke Kapus'
  });
}

async function approveKapus(pool, body) {
  const { idUsulan, email, catatan } = body;
  const result = await pool.query(
    `SELECT uh.status_global, uh.kode_pkm, u.kode_pkm as kapus_pkm
     FROM usulan_header uh
     LEFT JOIN users u ON LOWER(u.email)=LOWER($2) AND u.role='Kapus'
     WHERE uh.id_usulan=$1`,
    [idUsulan, email]
  );
  if (result.rows.length===0) return err('Usulan tidak ditemukan');
  const row = result.rows[0];
  if (row.status_global !== 'Menunggu Kapus') return err('Usulan tidak dalam status Menunggu Kapus');
  // Poin 5: Kapus hanya bisa verifikasi PKM-nya sendiri
  if (row.kapus_pkm && row.kode_pkm !== row.kapus_pkm) {
    return err('Anda hanya dapat memverifikasi usulan dari puskesmas Anda sendiri');
  }
  await pool.query(
    `UPDATE usulan_header SET status_kapus='Selesai',status_global='Menunggu Program',kapus_approved_by=$1,kapus_approved_at=NOW(),kapus_catatan=$2 WHERE id_usulan=$3`,
    [email, catatan||'', idUsulan]
  );
  await logAktivitas(pool, email, 'Kapus', 'Approve', idUsulan, catatan||'Disetujui Kapus');
  return ok({ message: 'Usulan disetujui Kapus' });
}

async function approveProgram(pool, body) {
  const { idUsulan, email, catatan } = body;
  const result = await pool.query('SELECT status_global FROM usulan_header WHERE id_usulan=$1', [idUsulan]);
  if (result.rows.length===0) return err('Usulan tidak ditemukan');
  // Izinkan approve kalau status Menunggu Program ATAU Ditolak (ada yang tolak tapi yang lain masih bisa approve)
  if (!['Menunggu Program','Ditolak'].includes(result.rows[0].status_global)) return err('Usulan tidak dalam tahap verifikasi program');

  const vpCheck = await pool.query('SELECT id, status FROM verifikasi_program WHERE id_usulan=$1 AND email_program=$2', [idUsulan, email]);
  if (vpCheck.rows.length===0) return err('Anda tidak terdaftar sebagai pengelola program untuk usulan ini');
  if (vpCheck.rows[0].status==='Selesai') return err('Anda sudah memverifikasi usulan ini');

  await pool.query(
    `UPDATE verifikasi_program SET status='Selesai', catatan=$1, verified_at=NOW() WHERE id_usulan=$2 AND email_program=$3`,
    [catatan||'', idUsulan, email]
  );
  await logAktivitas(pool, email, 'Pengelola Program', 'Approve', idUsulan, catatan||'Disetujui');

  const allVP = await pool.query('SELECT status FROM verifikasi_program WHERE id_usulan=$1', [idUsulan]);
  const allDone = allVP.rows.every(r => r.status === 'Selesai');
  const stillRejected = allVP.rows.filter(r => r.status === 'Ditolak').length;
  const stillWaiting = allVP.rows.filter(r => r.status === 'Menunggu').length;

  if (allDone) {
    // Semua approve → lanjut ke Admin
    await pool.query(
      `UPDATE usulan_header SET status_program='Selesai', status_global='Menunggu Admin' WHERE id_usulan=$1`,
      [idUsulan]
    );
    return ok({ message: 'Semua pengelola program selesai — usulan diteruskan ke Admin.', allDone: true });
  }

  // Ada yang masih menolak atau menunggu
  const remaining = stillWaiting + stillRejected;
  const msg = stillRejected > 0
    ? `Verifikasi Anda disimpan. Masih ada ${stillRejected} penolakan yang belum diselesaikan operator.`
    : `Verifikasi Anda disimpan. Masih menunggu ${remaining} pengelola program lain.`;
  return ok({ message: msg, allDone: false });
}

async function approveAdmin(pool, body) {
  const { idUsulan, email, catatan } = body;
  const result = await pool.query('SELECT status_global, status_program FROM usulan_header WHERE id_usulan=$1', [idUsulan]);
  if (result.rows.length===0) return err('Usulan tidak ditemukan');
  if (result.rows[0].status_global !== 'Menunggu Admin') return err('Usulan belum siap untuk diverifikasi Admin');
  if (result.rows[0].status_program !== 'Selesai') return err('Semua Pengelola Program harus menyelesaikan verifikasi terlebih dahulu');
  await pool.query(
    `UPDATE usulan_header SET status_final='Selesai',status_global='Selesai',is_locked=true,admin_approved_by=$1,admin_approved_at=NOW(),admin_catatan=$2,final_approved_by=$1,final_approved_at=NOW() WHERE id_usulan=$3`,
    [email, catatan||'', idUsulan]
  );
  await logAktivitas(pool, email, 'Admin', 'Approve Final', idUsulan, catatan||'Selesai');
  return ok({ message: 'Usulan selesai diverifikasi oleh Admin' });
}

async function rejectUsulan(pool, body) {
  const { idUsulan, email, role, alasan } = body;
  if (!alasan || !alasan.trim()) return err('Alasan penolakan wajib diisi');

  if (role === 'Pengelola Program') {
    // Skema: hanya ubah status si penolak → 'Ditolak'
    // Yang lain TIDAK direset — tetap bisa approve / sudah approve
    await pool.query(
      `UPDATE verifikasi_program SET status='Ditolak', catatan=$1, verified_at=NOW()
       WHERE id_usulan=$2 AND email_program=$3`,
      [alasan.trim(), idUsulan, email]
    );

    // Ambil nama pengelola yang menolak
    const vpRow = await pool.query(
      'SELECT nama_program FROM verifikasi_program WHERE id_usulan=$1 AND email_program=$2',
      [idUsulan, email]
    );
    const namaPengelola = vpRow.rows[0]?.nama_program || email;

    // Status header tetap 'Menunggu Program' tapi tandai ada yang menolak
    // Simpan info siapa yang menolak di admin_catatan sementara
    await pool.query(
      `UPDATE usulan_header SET
        status_global='Ditolak',
        is_locked=false,
        status_program='Ditolak',
        admin_catatan=$1
       WHERE id_usulan=$2`,
      [`Ditolak oleh ${namaPengelola}: ${alasan.trim()}`, idUsulan]
    );

  } else if (role === 'Kapus') {
    // Kapus tolak → reset semua, operator mulai dari awal
    await pool.query(
      `UPDATE verifikasi_program SET status='Menunggu', catatan=NULL, verified_at=NULL WHERE id_usulan=$1`,
      [idUsulan]
    );
    await pool.query(
      `UPDATE usulan_header SET
        status_global='Ditolak', is_locked=false,
        status_kapus='Ditolak', status_program='Menunggu',
        kapus_approved_by=NULL, kapus_catatan=$1
       WHERE id_usulan=$2`,
      [alasan.trim(), idUsulan]
    );

  } else {
    // Admin tolak → reset semua verifikasi program
    await pool.query(
      `UPDATE verifikasi_program SET status='Menunggu', catatan=NULL, verified_at=NULL WHERE id_usulan=$1`,
      [idUsulan]
    );
    await pool.query(
      `UPDATE usulan_header SET
        status_global='Ditolak', is_locked=false,
        status_kapus='Menunggu', status_program='Menunggu',
        admin_catatan=$1
       WHERE id_usulan=$2`,
      [alasan.trim(), idUsulan]
    );
  }

  await logAktivitas(pool, email, role, 'Tolak', idUsulan, alasan.trim());
  return ok({ message: 'Usulan ditolak. Operator dapat memperbaiki dan mengajukan ulang.' });
}

async function logAktivitas(pool, email, role, aksi, idUsulan, detail) {
  try { await pool.query(`INSERT INTO log_aktivitas (timestamp,user_email,role,aksi,id_usulan,detail) VALUES (NOW(),$1,$2,$3,$4,$5)`, [email,role,aksi,idUsulan,detail]); }
  catch(e) { console.error('Log error:', e); }
}

function mapHeader(r) {
  const bn = ['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const isDitolak = (r.status_global||'') === 'Ditolak';

  let alasanTolak = '', ditolakOleh = '';
  if (isDitolak) {
    if ((r.status_kapus||'') === 'Ditolak') {
      // Ditolak Kapus
      ditolakOleh = 'Kepala Puskesmas';
      alasanTolak = r.kapus_catatan || '';
    } else if ((r.status_program||'') === 'Ditolak') {
      // Ditolak Pengelola Program — nama spesifik ada di admin_catatan (format: "Ditolak oleh X: alasan")
      const raw = r.admin_catatan || '';
      ditolakOleh = raw.startsWith('Ditolak oleh ')
        ? raw.split(':')[0].replace('Ditolak oleh ', '').trim()
        : 'Pengelola Program';
      alasanTolak = raw.includes(':') ? raw.split(':').slice(1).join(':').trim() : raw;
    } else {
      // Ditolak Admin
      ditolakOleh = 'Admin';
      alasanTolak = r.admin_catatan || '';
    }
  }
  return {
    idUsulan:r.id_usulan, tahun:r.tahun, bulan:r.bulan, namaBulan:bn[r.bulan]||'',
    periodeKey:r.periode_key, kodePKM:r.kode_pkm, namaPKM:r.nama_puskesmas||r.kode_pkm,
    totalNilai:parseFloat(r.total_nilai)||0, totalBobot:parseFloat(r.total_bobot)||0,
    indeksKinerja:parseFloat(r.indeks_kinerja_spm)||0, indeksBeban:parseFloat(r.indeks_beban_kerja)||0,
    indeksSPM:parseFloat(r.indeks_spm)||0,
    statusKapus:r.status_kapus||'Menunggu', statusProgram:r.status_program||'Menunggu',
    statusFinal:r.status_final||'Menunggu', statusGlobal:r.status_global||'Draft',
    isLocked:r.is_locked||false, createdBy:r.created_by||'', createdAt:r.created_at,
    kapusApprovedBy:r.kapus_approved_by||'', kapusApprovedAt:r.kapus_approved_at,
    kapusCatatan:r.kapus_catatan||'', adminApprovedBy:r.admin_approved_by||'',
    adminApprovedAt:r.admin_approved_at, adminCatatan:r.admin_catatan||'',
    finalApprovedBy:r.final_approved_by||'', finalApprovedAt:r.final_approved_at,
    driveFolderUrl:r.drive_folder_url||'', driveFolderId:r.drive_folder_id||'',
    alasanTolak, ditolakOleh
  };
}

// ===== ADMIN: FORCE UNLOCK & EDIT USULAN =====
// Endpoint: POST /api/usulan?action=admin-unlock  { idUsulan, email }
// Endpoint: POST /api/usulan?action=admin-reset   { idUsulan, email }

async function adminResetUsulan(pool, body) {
  const { idUsulan, email } = body;
  if (!idUsulan) return err('idUsulan diperlukan');
  // Admin reset: unlock dan kembalikan ke Draft
  await pool.query(
    `UPDATE usulan_header SET is_locked=false, status_global='Draft',
     status_kapus='Menunggu', status_program='Menunggu', status_final='Menunggu',
     kapus_approved_by=NULL, admin_approved_by=NULL
     WHERE id_usulan=$1`,
    [idUsulan]
  );
  await pool.query(
    `UPDATE verifikasi_program SET status='Menunggu', verified_at=NULL WHERE id_usulan=$1`,
    [idUsulan]
  );
  await logAktivitas(pool, email, 'Admin', 'Reset', idUsulan, 'Direset oleh Admin');
  return ok({ message: 'Usulan berhasil direset ke Draft' });
}
