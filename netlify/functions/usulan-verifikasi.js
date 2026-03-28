const { ok, err } = require('./db');
const { isValidText, parseIndikatorAkses, logAktivitas } = require('./usulan-helpers');

// ============== VERIFIKASI PROGRAM (PP) ==============
async function verifProgram(pool, body) {
  const { idUsulan, email, indikatorList, catatanProgram } = body;
  if (!idUsulan || !email) return err('Data tidak lengkap');
  if (!indikatorList || !indikatorList.length) return err('Keputusan per indikator wajib diisi');
  const _roleCheckPP = await pool.query(`SELECT role FROM users WHERE LOWER(email)=LOWER($1) AND aktif=true`, [email]);
  if (!_roleCheckPP.rows.length || !['Pengelola Program','Program'].includes(_roleCheckPP.rows[0].role))
    return err('Akses ditolak', 403);

  const headerRes = await pool.query('SELECT status_global, ditolak_oleh, tahun, bulan FROM usulan_header WHERE id_usulan=$1', [idUsulan]);
  if (!headerRes.rows.length) return err('Usulan tidak ditemukan');
  if (!['Menunggu Pengelola Program','Ditolak','Ditolak Sebagian'].includes(headerRes.rows[0].status_global))
    return err('Usulan tidak dalam tahap verifikasi program');

  // Cek periode verifikasi
  const { tahun: tahunVP, bulan: bulanVP } = headerRes.rows[0];
  const pvResVP = await pool.query(
    `SELECT tanggal_mulai_verif, tanggal_selesai_verif FROM periode_input WHERE tahun=$1 AND bulan=$2 AND status='Aktif'`,
    [tahunVP, bulanVP]
  ).catch(() => ({ rows: [] }));
  if (pvResVP.rows.length && pvResVP.rows[0].tanggal_mulai_verif && pvResVP.rows[0].tanggal_selesai_verif) {
    const nowWita = new Date(Date.now() + 8 * 3600000);
    const todayStr = nowWita.toISOString().slice(0, 10);
    const toDs = (v) => { const d = new Date(new Date(v).getTime() + 8*3600000); return d.toISOString().slice(0,10); };
    const mulaiVerif   = toDs(pvResVP.rows[0].tanggal_mulai_verif);
    const selesaiVerif = toDs(pvResVP.rows[0].tanggal_selesai_verif);
    if (todayStr < mulaiVerif) return err(`Periode verifikasi belum dibuka. Dibuka mulai ${new Date(pvResVP.rows[0].tanggal_mulai_verif).toLocaleDateString('id-ID')}.`);
    if (todayStr > selesaiVerif) return err(`Periode verifikasi sudah ditutup pada ${new Date(pvResVP.rows[0].tanggal_selesai_verif).toLocaleDateString('id-ID')}.`);
  }

  // Validasi: catatan PP wajib hanya pada re-verifikasi dari Admin, jika ada indikator yang disanggah (tombol Sanggah)
  // Catatan penamaan: aksi='setuju' di sini artinya PP MENYANGGAH Admin (bukan menyetujui usulan).
  // PP yang setuju atas penolakan Admin menggunakan respondPenolakan (aksi='tolak'), bukan verifProgram.
  const isReVerifAdmin = headerRes.rows[0].ditolak_oleh === 'Admin';
  const adaYangSanggahAdmin = indikatorList.some(i => i.aksi === 'setuju');
  if (isReVerifAdmin && adaYangSanggahAdmin && !isValidText(catatanProgram)) return err('Catatan / Sanggahan wajib diisi dengan teks yang bermakna jika ada indikator yang disanggah');

  const vpCheck = await pool.query(
    'SELECT id, status, indikator_akses FROM verifikasi_program WHERE id_usulan=$1 AND LOWER(email_program)=LOWER($2)',
    [idUsulan, email]
  );
  if (!vpCheck.rows.length) return err('Anda tidak terdaftar sebagai pengelola program untuk usulan ini');
  // BUG FIX 1: Blokir hanya jika status Selesai/Ditolak DAN ini bukan sesi re-verifikasi.
  // Saat re-verif (Kapus approve → VP di-reset ke 'Menunggu'), status sudah 'Menunggu' lagi.
  // Namun ada edge case: VP masih 'Selesai'/'Ditolak' tapi status_global sudah 'Menunggu Pengelola Program'
  // (bug lain / race condition) — cek status_global untuk keputusan final.
  if (vpCheck.rows[0].status === 'Selesai' && headerRes.rows[0].status_global === 'Menunggu Pengelola Program') {
    // Izinkan hanya jika ada penolakan aktif milik PP ini (re-verif dari Admin)
    const piCheck = await pool.query(
      `SELECT COUNT(*) as ct FROM penolakan_indikator
       WHERE id_usulan=$1 AND LOWER(email_program)=LOWER($2)
         AND dibuat_oleh='Admin' AND responded_at IS NULL`,
      [idUsulan, email]
    ).catch(() => ({ rows: [{ ct: 0 }] }));
    const adaPenolakan = parseInt(piCheck.rows[0]?.ct) > 0;
    if (!adaPenolakan) return err('Anda sudah memverifikasi usulan ini');
  } else if (vpCheck.rows[0].status === 'Selesai') {
    return err('Anda sudah memverifikasi usulan ini');
  }
  if (vpCheck.rows[0].status === 'Ditolak' && headerRes.rows[0].status_global === 'Menunggu Pengelola Program') {
    // Izinkan re-verif: VP status 'Ditolak' bisa verif lagi setelah Kapus reset
    // (VP sudah di-reset ke 'Menunggu' oleh verifKapus — ini fallback safety)
  } else if (vpCheck.rows[0].status === 'Ditolak') {
    return err('Anda sudah menolak usulan ini');
  }

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

  // Simpan catatanProgram ke baris penolakan milik PP ini saja (filter email_program)
  // Jangan update baris milik PP lain — setiap PP punya baris sendiri
  if (catatanProgram) {
    await pool.query(
      `UPDATE penolakan_indikator SET catatan_program=$1, responded_at=NOW()
       WHERE id_usulan=$2 AND LOWER(email_program)=LOWER($3)
         AND (aksi IS NULL OR aksi='tolak')`,
      [catatanProgram, idUsulan, email]
    ).catch(() => {});
  }

  await pool.query(
    `UPDATE verifikasi_program SET status=$1, catatan=$2, sanggahan=$3, verified_at=NOW()
     WHERE id_usulan=$4 AND LOWER(email_program)=LOWER($5)`,
    [statusVP, alasanGabungan || null, catatanProgram || null, idUsulan, email]
  );
  
  // aksiLog: bedakan konteks PP menolak sendiri vs PP menerima penolakan Admin
  // - PP menolak (siklus normal/re-verif dari Kapus) → "Tolak" / "Tolak Sebagian"
  // - PP menerima penolakan Admin → ditangani di respondPenolakan, bukan di sini
  // - PP menyetujui semua saat re-verif Admin → "Re-verifikasi (Sanggah)"
  const adaTolakSebagian = adaTolak && indikatorList.some(i => i.aksi === 'setuju');
  const aksiLog = adaTolak
    ? (adaTolakSebagian ? 'Tolak (sebagian)' : 'Tolak')
    : (isReVerifAdmin ? 'Re-verifikasi (Sanggah)' : 'Approve');
  // adaYangSanggahAdmin sudah didefinisikan di atas (rename dari adaYangSetuju)
  const detailLog = adaTolak
    ? alasanGabungan + (catatanProgram ? ` | Catatan PP: ${catatanProgram}` : '')
    : (isReVerifAdmin && catatanProgram ? `Semua indikator disanggah — catatan: ${catatanProgram}` : logLabel);
  await logAktivitas(pool, email, 'Pengelola Program', aksiLog, idUsulan, detailLog);

  // Cek status semua VP SETELAH update VP ini
  const allVP = await pool.query('SELECT status FROM verifikasi_program WHERE id_usulan=$1', [idUsulan]);
  const stillWaiting = allVP.rows.some(r => r.status === 'Menunggu');
  const anyRejected  = allVP.rows.some(r => r.status === 'Ditolak');

  if (stillWaiting) {
    return ok({ message: 'Verifikasi Anda disimpan. Menunggu pengelola program lain.', allDone: false });
  }

  // Semua VP sudah verifikasi — baru proses hasilnya
  if (!anyRejected) {
    // Semua setuju → lanjutkan ke Admin (atau kembali ke Admin jika loop Admin↔PP)
    const headerCheck = await pool.query('SELECT ditolak_oleh, konteks_penolakan FROM usulan_header WHERE id_usulan=$1', [idUsulan]);
    const ditolakOleh = headerCheck.rows[0]?.ditolak_oleh;
    const konteksPenolakan = headerCheck.rows[0]?.konteks_penolakan;

    const isReVerifAdmin = ditolakOleh === 'Admin' || konteksPenolakan === 'Admin';

    // PP approve semua → hapus penolakan milik PP saja
    await pool.query(
      `DELETE FROM penolakan_indikator WHERE id_usulan=$1 AND dibuat_oleh='PP'`,
      [idUsulan]
    ).catch(() => {});

    if (isReVerifAdmin) {
      // BUG FIX 2: Jangan set ditolak_oleh='Admin' lagi — itu menyebabkan loop Admin↔PP infinite.
      // Gunakan konteks_penolakan='Admin' sebagai sinyal ke Admin bahwa ini re-verifikasi,
      // sementara ditolak_oleh di-clear agar tidak terdeteksi sebagai 'Ditolak' di frontend.
      await pool.query(
        `UPDATE usulan_header SET status_program='Selesai', status_global='Menunggu Admin',
         status_kapus='Selesai', ditolak_oleh=NULL, konteks_penolakan='Admin' WHERE id_usulan=$1`, [idUsulan]
      );
      return ok({ message: 'Semua pengelola program menyetujui — usulan diteruskan kembali ke Admin.', allDone: true });
    } else {
      await pool.query(
        `UPDATE usulan_header SET status_program='Selesai', status_global='Menunggu Admin',
         ditolak_oleh=NULL, konteks_penolakan=NULL WHERE id_usulan=$1`, [idUsulan]
      );
      return ok({ message: 'Semua pengelola program menyetujui — usulan diteruskan ke Admin.', allDone: true });
    }
  }

  // ========== ADA YANG MENOLAK ==========
  // Kumpulkan semua indikator bermasalah dari SEMUA VP yang menolak
  const allVPRejected = await pool.query(
    `SELECT email_program, indikator_akses, catatan FROM verifikasi_program WHERE id_usulan=$1 AND status='Ditolak'`,
    [idUsulan]
  );

  const alasanMap = {};
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

  // FIX BUG 1 & 2: Hapus SEMUA baris penolakan untuk indikator bermasalah (PP maupun Admin)
  await pool.query(
    `DELETE FROM penolakan_indikator WHERE id_usulan=$1 AND no_indikator=ANY($2)`,
    [idUsulan, nomorBermasalah]
  );

  // Buat map email PP yang menolak per indikator
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
  for (const item of indikatorList.filter(i => i.aksi === 'tolak')) {
    emailTolakMap[item.noIndikator] = email;
  }

  // Insert ulang baris penolakan milik PP
  for (const no of nomorBermasalah) {
    const emailPenolak = emailTolakMap[no] || email;
    await pool.query(
      `INSERT INTO penolakan_indikator (id_usulan, no_indikator, alasan, email_admin, created_at, aksi, email_program, dibuat_oleh)
      VALUES ($1,$2,$3,$4,NOW(),'tolak',$5,'PP')
      ON CONFLICT (id_usulan, no_indikator, email_program) DO UPDATE
      SET alasan=$3, email_admin=$4, created_at=NOW(), aksi='tolak', catatan_program=NULL, responded_at=NULL, dibuat_oleh='PP'`,
      [idUsulan, no, alasanMap[no] || 'Ditolak', email, emailPenolak]
    );
  }

  // Reset VP yang punya irisan dengan indikator bermasalah
  const allVPVerif = await pool.query(
    `SELECT email_program, indikator_akses FROM verifikasi_program WHERE id_usulan=$1`,
    [idUsulan]
  );
  const terkenaEmails = [];
  for (const vp of allVPVerif.rows) {
    const aksesArr = parseIndikatorAkses(vp.indikator_akses || '');
    const adaIrisan = aksesArr.length === 0
      ? nomorBermasalah.length > 0
      : aksesArr.some(n => nomorBermasalah.includes(n));
    if (adaIrisan) {
      terkenaEmails.push(vp.email_program);
      await pool.query(
        `UPDATE verifikasi_program SET status='Menunggu', catatan=NULL, verified_at=NULL WHERE id_usulan=$1 AND LOWER(email_program)=LOWER($2)`,
        [idUsulan, vp.email_program]
      );
    }
  }

  // Reset juga VP yang statusnya 'Ditolak' (harus di-reset)
  if (terkenaEmails.length > 0) {
    await pool.query(
      `UPDATE verifikasi_program SET status='Menunggu', catatan=NULL, verified_at=NULL
       WHERE id_usulan=$1 AND status='Ditolak' AND LOWER(email_program)=ANY($2)`,
      [idUsulan, terkenaEmails]
    );
  }

  // BUG FIX 3: ditolakOleh SELALU 'Pengelola Program' saat PP yang tolak — jangan pakai nilai lama dari DB
  // Nilai DB lama bisa berisi 'Admin' dari siklus sebelumnya dan mengacaukan alur berjenjang
  const ditolakOlehKapus = 'Pengelola Program';
  await pool.query(
    `UPDATE usulan_header SET status_global='Menunggu Kepala Puskesmas', status_kapus='Menunggu',
     status_program='Menunggu', ditolak_oleh=$2, is_locked=true WHERE id_usulan=$1`, [idUsulan, ditolakOlehKapus]
  );
  
  if (nomorBermasalah.length) {
    const alasanLog = nomorBermasalah.map(n => `#${n}: ${alasanMap[n] || 'Ditolak'}`).join(' | ');
    await logAktivitas(pool, email, 'Pengelola Program', 'Kembalikan', idUsulan,
      'Indikator bermasalah ' + alasanLog + ' — dikembalikan ke Kepala Puskesmas');
  }
  return ok({ message: 'Indikator bermasalah dikembalikan ke Kepala Puskesmas untuk re-verifikasi.', allDone: true });
}


// ============== VERIFIKASI KEPALA PUSKESMAS ==============
async function verifKapus(pool, body) {
  const { idUsulan, email, indikatorList, catatanKapus } = body;
  if (!idUsulan || !email) return err('Data tidak lengkap');
  if (!indikatorList || !indikatorList.length) return err('Keputusan per indikator wajib diisi');
  const _roleCheckKapus = await pool.query(`SELECT role FROM users WHERE LOWER(email)=LOWER($1) AND aktif=true`, [email]);
  if (!_roleCheckKapus.rows.length || !['Kepala Puskesmas','Kapus'].includes(_roleCheckKapus.rows[0].role))
    return err('Akses ditolak', 403);

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

  // Cek periode verifikasi
  const hdrVerif = await pool.query(`SELECT tahun, bulan FROM usulan_header WHERE id_usulan=$1`, [idUsulan]);
  if (hdrVerif.rows.length) {
    const { tahun, bulan } = hdrVerif.rows[0];
    const pvRes = await pool.query(
      `SELECT tanggal_mulai_verif, tanggal_selesai_verif FROM periode_input WHERE tahun=$1 AND bulan=$2 AND status='Aktif'`,
      [tahun, bulan]
    ).catch(() => ({ rows: [] }));
    if (pvRes.rows.length && pvRes.rows[0].tanggal_mulai_verif && pvRes.rows[0].tanggal_selesai_verif) {
      const nowWita = new Date(Date.now() + 8 * 3600000);
      const todayStr = nowWita.toISOString().slice(0, 10);
      const toDs = (v) => { const d = new Date(new Date(v).getTime() + 8*3600000); return d.toISOString().slice(0,10); };
      const mulaiVerif  = toDs(pvRes.rows[0].tanggal_mulai_verif);
      const selesaiVerif = toDs(pvRes.rows[0].tanggal_selesai_verif);
      if (todayStr < mulaiVerif) return err(`Periode verifikasi belum dibuka. Dibuka mulai ${new Date(pvRes.rows[0].tanggal_mulai_verif).toLocaleDateString('id-ID')}.`);
      if (todayStr > selesaiVerif) return err(`Periode verifikasi sudah ditutup pada ${new Date(pvRes.rows[0].tanggal_selesai_verif).toLocaleDateString('id-ID')}.`);
    }
  }

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
      `SELECT ditolak_oleh, konteks_penolakan FROM usulan_header WHERE id_usulan=$1`, [idUsulan]
    );
    const ditolakOleh = headerInfo.rows[0]?.ditolak_oleh;
    const konteksPenolakan = headerInfo.rows[0]?.konteks_penolakan;

    const isReVerifPP = ditolakOleh === 'Pengelola Program';
    const isReVerifAdmin = ditolakOleh === 'Admin' || konteksPenolakan === 'Admin';

    // AFTER — tangkap juga baris lama dengan aksi='kapus-setuju' (data sebelum patch):
const piPPCheck = await pool.query(
  `SELECT COUNT(*) as ct FROM penolakan_indikator
   WHERE id_usulan=$1
     AND (dibuat_oleh='PP' OR aksi='kapus-setuju' OR aksi='kapus-ok')`,
  [idUsulan]
);
const adaSisaPP = parseInt(piPPCheck.rows[0]?.ct) > 0;

    // Kapus approve semua → hapus penolakan milik Kapus saja
    await pool.query(
      `DELETE FROM penolakan_indikator WHERE id_usulan=$1 AND dibuat_oleh='Kapus'`,
      [idUsulan]
    ).catch(() => {});

    // BUG FIX 5: Hitung ditolak_oleh dengan benar sesuai arah re-verifikasi
    // isReVerifPP → Kapus sudah approve, bola pindah ke PP → ditolak_oleh harus NULL
    // (frontend pakai ditolak_oleh untuk filter indikator; kalau masih 'Pengelola Program',
    //  PP akan lihat semua indikatornya, bukan hanya yang perlu di-re-verif)
    let ditolakOlehVal = null;
    if (isReVerifPP) {
      ditolakOlehVal = null; // clear — Kapus sudah setuju, PP verif ulang normal
    } else if (isReVerifAdmin) {
      // Jangan set 'Admin' — biarkan NULL, konteks_penolakan='Admin' sudah set di verifProgram (Fix 2)
      // Kapus approve setelah re-verif Admin → PP verif ulang → Admin final
      ditolakOlehVal = null;
    } else if (adaSisaPP) {
      // Ada sisa penolakan PP tapi bukan mode re-verif → Kapus approve semua, PP tetap perlu re-verif
      ditolakOlehVal = 'Pengelola Program';
    } else {
      ditolakOlehVal = null; // siklus normal, clear ditolak_oleh
    }

    await pool.query(
      `UPDATE usulan_header SET status_kapus='Selesai', status_global='Menunggu Pengelola Program',
       ditolak_oleh=$1, konteks_penolakan=CASE WHEN $5 THEN 'Admin' ELSE NULL END,
       kapus_approved_by=$2, kapus_approved_at=NOW(), kapus_catatan=$4 WHERE id_usulan=$3`,
      [ditolakOlehVal, email, idUsulan, catatanKapus || 'Semua indikator disetujui', isReVerifAdmin]
    );

    const isReVerif = isReVerifPP || isReVerifAdmin || adaSisaPP;

    if (isReVerif) {
      // Re-verifikasi dari PP atau Admin.
      // Sumber indikator untuk reset VP = gabungan:
      // 1. indikatorList (yang baru disetujui Kapus di putaran ini)
      // 2. penolakan_indikator milik PP yang masih ada (dari putaran sebelumnya, belum di-re-verif PP)
      // BUG FIX: Baca catatan VP SEBELUM di-clear, agar nomorDariCatatan tidak kosong
      // Ambil SEMUA indikator yang PP pernah tolak dari verifikasi_program.catatan
      // (format catatan: "#1: alasan | #4: alasan | #6: alasan")
      // Ini lebih andal daripada penolakan_indikator karena baris PP bisa berubah aksinya
      const vpCatatanRows = await pool.query(
        `SELECT catatan FROM verifikasi_program WHERE id_usulan=$1 AND status IN ('Ditolak','Menunggu') AND catatan IS NOT NULL`,
        [idUsulan]
      ).catch(() => ({ rows: [] }));

      await pool.query(
        `UPDATE verifikasi_program SET catatan=NULL, last_verified_at=NOW() WHERE id_usulan=$1 AND status='Ditolak'`,
        [idUsulan]
      ).catch(() => {});
      const nomorDariCatatan = [];
      for (const row of vpCatatanRows.rows) {
        const parts = (row.catatan || '').split('|').map(s => s.trim());
        for (const part of parts) {
          const m = part.match(/^#(\d+):/);
          if (m) nomorDariCatatan.push(parseInt(m[1]));
        }
      }
      // Fallback: ambil juga dari penolakan_indikator (data lama / kapus-ok)
      const piPPRows = await pool.query(
        `SELECT DISTINCT no_indikator FROM penolakan_indikator
         WHERE id_usulan=$1
           AND (dibuat_oleh='PP' OR aksi='kapus-ok' OR aksi='kapus-setuju')`,
        [idUsulan]
      ).catch(() => ({ rows: [] }));
      const nomorDariPP = piPPRows.rows.map(r => parseInt(r.no_indikator));
      const nomorDariKapus = indikatorList.map(i => parseInt(i.noIndikator));
      // nomorReVerif = gabungan semua: dari catatan VP + dari penolakan_indikator + dari indikatorList Kapus
      const nomorReVerif = [...new Set([...nomorDariKapus, ...nomorDariPP, ...nomorDariCatatan])];

      const allPP = await pool.query(`SELECT email, nama, nip, jabatan, indikator_akses FROM users WHERE role='Pengelola Program' AND aktif=true`);
      for (const pp of allPP.rows) {
        const aksesArr = parseIndikatorAkses(pp.indikator_akses || '');
        const adaIrisan = aksesArr.length === 0
          ? nomorReVerif.length > 0
          : aksesArr.some(n => nomorReVerif.includes(n));
        await pool.query(
          `INSERT INTO verifikasi_program (id_usulan,email_program,nama_program,nip_program,jabatan_program,indikator_akses,status,created_at)
           VALUES ($1,$2,$3,$4,$5,$6,'Menunggu',NOW())
           ON CONFLICT (id_usulan, email_program) DO UPDATE
             SET nama_program=EXCLUDED.nama_program,
                 nip_program=EXCLUDED.nip_program,
                 jabatan_program=EXCLUDED.jabatan_program,
                 status=CASE WHEN $7 THEN 'Menunggu' ELSE verifikasi_program.status END,
                 catatan=CASE WHEN $7 THEN NULL ELSE verifikasi_program.catatan END,
                 verified_at=CASE WHEN $7 THEN NULL ELSE verifikasi_program.verified_at END`,
          [idUsulan, pp.email, pp.nama, pp.nip||null, pp.jabatan||null, pp.indikator_akses||'', adaIrisan]
        );
      }
    } else {
      // Siklus pertama: semua PP verif dari awal
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
      logAksiKapus  = 'Kapus Sanggah';
      logDetailKapus = `Menyanggah penolakan Pengelola Program — diteruskan ke PP${catatanKapus && catatanKapus !== 'Semua indikator disetujui' ? ' | Catatan: ' + catatanKapus : ''}`;
    } else if (isReVerifAdmin) {
      logAksiKapus  = 'Approve';
      logDetailKapus = `Re-verifikasi disetujui — diteruskan ke Pengelola Program${catatanKapus && catatanKapus !== 'Semua indikator disetujui' ? ' | Catatan: ' + catatanKapus : ''}`;
    } else {
      logAksiKapus  = 'Approve';
      logDetailKapus = catatanKapus && catatanKapus !== 'Semua indikator disetujui' ? `Semua indikator disetujui | Catatan: ${catatanKapus}` : 'Semua indikator disetujui';
    }
    await logAktivitas(pool, email, 'Kepala Puskesmas', logAksiKapus, idUsulan, logDetailKapus);
    return ok({ message: 'Semua indikator disetujui — diteruskan ke Pengelola Program.' });
  }

  // ========== ADA YANG DITOLAK ==========
  // FIX C: Pisahkan dua set — Kapus bisa campuran tolak + sanggah dalam satu submit.
  // nomorTolakKapus  = Kapus setuju penolakan PP → dikembalikan ke Operator (reset Draft)
  // nomorSanggahKapus = Kapus sanggah PP → tetap mengalir ke PP re-verif (JANGAN reset Draft)
  const nomorTolakKapus   = indikatorList.filter(i => i.aksi === 'tolak').map(i => parseInt(i.noIndikator));
  const nomorSanggahKapus = indikatorList.filter(i => i.aksi === 'setuju').map(i => parseInt(i.noIndikator));
  const alasanGabungan = indikatorList.filter(i => i.aksi === 'tolak')
    .map(i => '#' + i.noIndikator + ': ' + i.alasan).join(' | ');

  // Simpan email_program dari penolakan PP yang asli (jika ada) SEBELUM dihapus
  const piPPEmailRows = await pool.query(
    `SELECT no_indikator, email_program FROM penolakan_indikator WHERE id_usulan=$1 AND email_program IS NOT NULL`,
    [idUsulan]
  ).catch(() => ({ rows: [] }));
  const emailPPMap = {};
  for (const r of piPPEmailRows.rows) {
    emailPPMap[r.no_indikator] = r.email_program;
  }

  // Bersihkan penolakan milik Kapus saja — penolakan milik PP (dibuat_oleh='PP') harus tetap ada
  await pool.query(`DELETE FROM penolakan_indikator WHERE id_usulan=$1 AND (dibuat_oleh='Kapus' OR dibuat_oleh IS NULL)`, [idUsulan]).catch(()=>{});

  // Ambil indikator yang sudah ada penolakan PP (dibuat_oleh='PP') agar tidak ditimpa oleh insert Kapus
  const piPPExisting = await pool.query(
    `SELECT no_indikator FROM penolakan_indikator WHERE id_usulan=$1 AND dibuat_oleh='PP'`,
    [idUsulan]
  ).catch(() => ({ rows: [] }));
  const nomorSudahAdaPP = new Set(piPPExisting.rows.map(r => parseInt(r.no_indikator)));

  // Insert penolakan hanya untuk indikator yang Kapus TOLAK (→ Operator)
  for (const item of indikatorList.filter(i => i.aksi === 'tolak')) {
    const no = parseInt(item.noIndikator);
    if (nomorSudahAdaPP.has(no)) continue;
    const emailPPAsli = emailPPMap[item.noIndikator] || email;
    await pool.query(
      `INSERT INTO penolakan_indikator (id_usulan, no_indikator, alasan, email_admin, created_at, email_program, dibuat_oleh)
       VALUES ($1,$2,$3,$4,NOW(),$5,'Kapus')
       ON CONFLICT (id_usulan, no_indikator, email_program) DO UPDATE
       SET alasan=$3, email_admin=$4, created_at=NOW(), aksi=NULL, catatan_program=NULL, responded_at=NULL, dibuat_oleh='Kapus'`,
      [idUsulan, no, item.alasan.trim(), email, emailPPAsli]
    );
  }

  // FIX C: Reset ke Draft HANYA indikator yang Kapus tolak (→ Operator harus perbaiki).
  // nomorSanggahKapus TIDAK di-reset — statusnya tetap, mengalir ke PP untuk re-verif.
  for (const no of nomorTolakKapus) {
    await pool.query(
      `UPDATE usulan_indikator SET status='Draft', approved_by=NULL, approved_role=NULL, approved_at=NULL, catatan=NULL
       WHERE id_usulan=$1 AND no_indikator=$2`,
      [idUsulan, no]
    );
  }

  // Cek konteks re-verifikasi
  const headerReVerifCheck = await pool.query('SELECT ditolak_oleh, konteks_penolakan FROM usulan_header WHERE id_usulan=$1', [idUsulan]);
  const ditolakOlehKapusTolak = headerReVerifCheck.rows[0]?.ditolak_oleh;
  const konteksPenolakanKapusTolak = headerReVerifCheck.rows[0]?.konteks_penolakan;
  const isReVerifPPKapusTolak = ditolakOlehKapusTolak === 'Pengelola Program';
  const isReVerifAdminKapusTolak = ditolakOlehKapusTolak === 'Admin' || konteksPenolakanKapusTolak === 'Admin';

  // Insert kapus-ok untuk nomorSanggahKapus HANYA jika ini re-verif dari PP/Admin.
  // Guard ini penting: siklus pertama tidak boleh insert kapus-ok karena akan membuat
  // adaSisaPP=true saat Operator ajukan ulang, menyebabkan PP muncul sebagai re-verif
  // padahal mereka belum pernah verifikasi sama sekali.
if ((isReVerifPPKapusTolak || isReVerifAdminKapusTolak) && nomorSanggahKapus.length > 0) {
    for (const no of nomorSanggahKapus) {
    if (nomorSudahAdaPP.has(no)) continue;
    const emailPPAsli = emailPPMap[no] || email;
    await pool.query(
      `INSERT INTO penolakan_indikator (id_usulan, no_indikator, alasan, email_admin, created_at, aksi, email_program, dibuat_oleh)
       VALUES ($1,$2,'Disetujui Kapus',$3,NOW(),'kapus-ok',$4,'PP')
       ON CONFLICT (id_usulan, no_indikator, email_program) DO UPDATE
       SET alasan='Disetujui Kapus', email_admin=$3, created_at=NOW(), aksi='kapus-ok',
           catatan_program=NULL, responded_at=NULL, dibuat_oleh='PP'`,
      [idUsulan, no, email, emailPPAsli]
    ).catch(()=>{});
  }
}

  const logAksiTolak = (isReVerifPPKapusTolak || isReVerifAdminKapusTolak)
    ? 'Kapus Terima Penolakan'
    : 'Tolak';
  const konteksLog = isReVerifPPKapusTolak
    ? 'Menerima penolakan Pengelola Program — dikembalikan ke Operator untuk perbaikan data'
    : isReVerifAdminKapusTolak
      ? 'Menerima penolakan Admin (via PP) — dikembalikan ke Operator untuk perbaikan data'
      : 'Dikembalikan ke Operator';

  const ditolakOlehFinal = isReVerifPPKapusTolak
    ? 'Pengelola Program'
    : isReVerifAdminKapusTolak
      ? 'Admin'
      : 'Kepala Puskesmas';

  // FIX C: Bedakan status_global saat mixed tolak+sanggah vs tolak semua.
  // - Mixed (ada yg ditolak + ada yg disanggah):
  //     → status 'Ditolak Sebagian' — Operator perbaiki bagian tolak,
  //       PP langsung re-verif bagian sanggah (ditolak_oleh='Pengelola Program' sudah cukup
  //       sebagai sinyal, PP akan melihat indikator kapus-ok di penolakan_indikator)
  // - Semua ditolak (tidak ada sanggahan):
  //     → status 'Ditolak' seperti sebelumnya
  //
  // Untuk mixed, PP harus re-verifikasi bagian sanggahan terlepas dari status Operator.
  // Caranya: langsung reset VP yang punya irisan dengan nomorSanggahKapus ke 'Menunggu',
  // agar saat Operator ajukan ulang, PP sudah siap re-verif indikator sanggahan.
  const adaMixed = nomorTolakKapus.length > 0 && nomorSanggahKapus.length > 0;
  const statusGlobalFinal = adaMixed ? 'Ditolak Sebagian' : 'Ditolak';

  await pool.query(
    `UPDATE usulan_header SET status_global=$4, status_kapus='Ditolak', is_locked=false,
     ditolak_oleh=$2, kapus_approved_by=NULL, kapus_catatan=$1 WHERE id_usulan=$3`,
    [alasanGabungan, ditolakOlehFinal, idUsulan, statusGlobalFinal]
  );

  // Jika ada indikator yang disanggah Kapus (nomorSanggahKapus), reset VP yang punya irisan
  // agar PP bisa langsung re-verifikasi bagian tersebut saat usulan diajukan ulang.
  // (VP sudah di-reset ke status='Menunggu' → PP tahu harus re-verif via kapus-ok di penolakan_indikator)
  if (nomorSanggahKapus.length > 0) {
    const allVPSanggah = await pool.query(
      `SELECT email_program, indikator_akses FROM verifikasi_program WHERE id_usulan=$1`, [idUsulan]
    ).catch(() => ({ rows: [] }));
    for (const vp of allVPSanggah.rows) {
      const aksesArr = parseIndikatorAkses(vp.indikator_akses || '');
      const adaIrisan = aksesArr.length === 0
        ? nomorSanggahKapus.length > 0
        : aksesArr.some(n => nomorSanggahKapus.includes(n));
      if (adaIrisan) {
        await pool.query(
          `UPDATE verifikasi_program SET status='Menunggu', catatan=NULL, verified_at=NULL
           WHERE id_usulan=$1 AND LOWER(email_program)=LOWER($2)`,
          [idUsulan, vp.email_program]
        ).catch(() => {});
      }
    }
  }

  const setujuInfo = nomorSanggahKapus.length > 0
    ? ` | Indikator disanggah Kapus (→ PP re-verif): ${nomorSanggahKapus.map(n => '#' + n).join(', ')}`
    : '';
  const msgKapus = adaMixed
    ? `Sebagian indikator dikembalikan ke Operator, sebagian lagi diteruskan ke PP untuk re-verifikasi.`
    : `Indikator bermasalah dikembalikan ke Operator untuk diperbaiki.`;
  await logAktivitas(pool, email, 'Kepala Puskesmas', logAksiTolak, idUsulan,
    konteksLog + ' | Indikator dikembalikan ke Operator: ' + alasanGabungan + setujuInfo);
  return ok({ message: msgKapus, nomorTolak: nomorTolakKapus });
}

// ============== VERIFIKASI ADMIN ==============
async function verifAdmin(pool, body) {
  const { idUsulan, email, indikatorList } = body;
  if (!idUsulan || !email) return err('Data tidak lengkap');
  if (!indikatorList || !indikatorList.length) return err('Keputusan per indikator wajib diisi');

  const _roleCheck = await pool.query(
    `SELECT role FROM users WHERE LOWER(email)=LOWER($1) AND aktif=true`, [email]
  );
  if (!_roleCheck.rows.length || _roleCheck.rows[0].role !== 'Admin')
    return err('Akses ditolak', 403);

  const headerRes = await pool.query(
    `SELECT uh.status_global, uh.ditolak_oleh, uh.konteks_penolakan, uh.tahun, uh.bulan
     FROM usulan_header uh WHERE uh.id_usulan=$1`, [idUsulan]
  );
  if (!headerRes.rows.length) return err('Usulan tidak ditemukan');
  if (!['Menunggu Admin'].includes(headerRes.rows[0].status_global))
    return err('Usulan tidak dalam status Menunggu Admin');

  // Cek periode verifikasi
  const { tahun, bulan } = headerRes.rows[0];
  const pvRes = await pool.query(
    `SELECT tanggal_mulai_verif, tanggal_selesai_verif FROM periode_input WHERE tahun=$1 AND bulan=$2 AND status='Aktif'`,
    [tahun, bulan]
  ).catch(() => ({ rows: [] }));
  if (pvRes.rows.length && pvRes.rows[0].tanggal_mulai_verif && pvRes.rows[0].tanggal_selesai_verif) {
    const nowWita = new Date(Date.now() + 8 * 3600000);
    const todayStr = nowWita.toISOString().slice(0, 10);
    const toDs = (v) => { const d = new Date(new Date(v).getTime() + 8*3600000); return d.toISOString().slice(0,10); };
    const mulaiVerif   = toDs(pvRes.rows[0].tanggal_mulai_verif);
    const selesaiVerif = toDs(pvRes.rows[0].tanggal_selesai_verif);
    if (todayStr < mulaiVerif)   return err(`Periode verifikasi belum dibuka. Dibuka mulai ${new Date(pvRes.rows[0].tanggal_mulai_verif).toLocaleDateString('id-ID')}.`);
    if (todayStr > selesaiVerif) return err(`Periode verifikasi sudah ditutup pada ${new Date(pvRes.rows[0].tanggal_selesai_verif).toLocaleDateString('id-ID')}.`);
  }

  const adaTolak = indikatorList.some(i => i.aksi === 'tolak');

  if (!adaTolak) {
    // Semua disetujui → Selesai
    await pool.query(
      `UPDATE usulan_header SET status_global='Selesai', status_final='Selesai',
       admin_approved_by=$1, admin_approved_at=NOW(),
       ditolak_oleh=NULL, konteks_penolakan=NULL,
       reverif_count=0
       WHERE id_usulan=$2`,
      [email, idUsulan]
    );
    // Hapus semua sisa penolakan (sudah selesai)
    await pool.query(`DELETE FROM penolakan_indikator WHERE id_usulan=$1`, [idUsulan]).catch(() => {});
    await logAktivitas(pool, email, 'Admin', 'Selesai', idUsulan, 'Semua indikator disetujui — usulan selesai');
    return ok({ message: 'Usulan telah disetujui dan dinyatakan Selesai.' });
  }

  // Ada yang ditolak → kembalikan ke PP untuk re-verifikasi
  const nomorTolak = indikatorList.filter(i => i.aksi === 'tolak').map(i => parseInt(i.noIndikator));
  const alasanMap = {};
  for (const item of indikatorList.filter(i => i.aksi === 'tolak')) {
    alasanMap[item.noIndikator] = item.alasan || 'Perlu perbaikan data';
  }
  const alasanGabungan = nomorTolak.map(n => `#${n}: ${alasanMap[n]}`).join(' | ');

  // Poin 2: Cek batas siklus re-verifikasi Admin ↔ PP
  // Jika sudah >= 3 putaran, Admin tetap bisa lanjut tapi sistem log peringatan
  const MAX_REVIRIF_CYCLE = 3;
  const cycleCheckRes = await pool.query(
    `SELECT COALESCE(reverif_count, 0) as reverif_count FROM usulan_header WHERE id_usulan=$1`, [idUsulan]
  ).catch(() => ({ rows: [{ reverif_count: 0 }] }));
  const currentCycle = parseInt(cycleCheckRes.rows[0]?.reverif_count) || 0;
  const isOverLimit = currentCycle >= MAX_REVIRIF_CYCLE;
  if (isOverLimit) {
    console.warn(`[verifAdmin] Usulan ${idUsulan} sudah melewati ${MAX_REVIRIF_CYCLE} siklus re-verifikasi Admin↔PP. Pertimbangkan tolak global.`);
  }

  // Reset indikator bermasalah
  for (const no of nomorTolak) {
    await pool.query(
      `UPDATE usulan_indikator SET status='Draft', approved_by=NULL, approved_role=NULL, approved_at=NULL, catatan=NULL
       WHERE id_usulan=$1 AND no_indikator=$2`, [idUsulan, no]
    );
  }

  // Hapus penolakan lama untuk indikator ini, insert ulang milik Admin
  await pool.query(
    `DELETE FROM penolakan_indikator WHERE id_usulan=$1 AND no_indikator=ANY($2)`,
    [idUsulan, nomorTolak]
  );

  // Insert baris penolakan per PP yang punya irisan dengan indikator yang ditolak.
  // Setiap PP mendapat baris sendiri (email_program unik per PP) agar masing-masing
  // bisa respond secara independen — tidak saling ter-overwrite.
  const allPPAdmin = await pool.query(
    `SELECT email, indikator_akses FROM users WHERE role='Pengelola Program' AND aktif=true`
  );
  for (const no of nomorTolak) {
    for (const pp of allPPAdmin.rows) {
      const aksesArr = parseIndikatorAkses(pp.indikator_akses || '');
      const adaIrisan = aksesArr.length === 0 || aksesArr.includes(no);
      if (!adaIrisan) continue;
      await pool.query(
        `INSERT INTO penolakan_indikator (id_usulan, no_indikator, alasan, email_admin, created_at, aksi, email_program, dibuat_oleh)
         VALUES ($1,$2,$3,$4,NOW(),'tolak',$5,'Admin')
         ON CONFLICT (id_usulan, no_indikator, email_program) DO UPDATE
         SET alasan=$3, email_admin=$4, created_at=NOW(), aksi='tolak', catatan_program=NULL, responded_at=NULL, dibuat_oleh='Admin'`,
        [idUsulan, no, alasanMap[no], email, pp.email]
      );
    }
  }

  // FIX A: Hanya pakai nomorTolak putaran ini — tidak union dengan catatan lama.
  // Union dengan nomorLamaAdmin menyebabkan Admin wajib re-verif semua indikator
  // yang pernah ditolak di putaran-putaran sebelumnya, padahal putaran ini
  // Admin hanya menolak sebagian indikator saja.
  const nomorReVerifAdmin = [...new Set(nomorTolak)];

  // Reset VP yang punya irisan dengan indikator yang ditolak putaran ini saja
  const allVP = await pool.query(
    `SELECT email_program, indikator_akses FROM verifikasi_program WHERE id_usulan=$1`, [idUsulan]
  );
  for (const vp of allVP.rows) {
    const aksesArr = parseIndikatorAkses(vp.indikator_akses || '');
    const adaIrisan = aksesArr.length === 0
      ? nomorReVerifAdmin.length > 0
      : aksesArr.some(n => nomorReVerifAdmin.includes(n));
    if (adaIrisan) {
      await pool.query(
        `UPDATE verifikasi_program SET status='Menunggu', catatan=NULL, verified_at=NULL, sanggahan=NULL
         WHERE id_usulan=$1 AND LOWER(email_program)=LOWER($2)`,
        [idUsulan, vp.email_program]
      );
    }
  }

  // Simpan hanya alasan putaran ini ke admin_catatan (untuk audit)
  const alasanGabunganFull = nomorReVerifAdmin.map(n => `#${n}: ${alasanMap[n] || 'Perlu perbaikan data'}`).join(' | ');

  // Kembalikan ke Menunggu Pengelola Program, tandai konteks Admin
  // Increment reverif_count untuk tracking siklus (Poin 2)
  await pool.query(
    `UPDATE usulan_header SET status_global='Menunggu Pengelola Program',
     status_program='Menunggu', admin_catatan=$1,
     ditolak_oleh='Admin', konteks_penolakan='Admin',
     reverif_count = COALESCE(reverif_count, 0) + 1
     WHERE id_usulan=$2`,
    [alasanGabunganFull, idUsulan]
  );

  // Jika melewati batas, sertakan peringatan di response untuk ditampilkan Admin
  const warningMsg = isOverLimit
    ? ` ⚠️ Perhatian: Usulan ini sudah melewati ${MAX_REVIRIF_CYCLE} putaran re-verifikasi. Pertimbangkan untuk menolak usulan secara keseluruhan jika data tidak kunjung diperbaiki.`
    : '';

  await logAktivitas(pool, email, 'Admin', 'Kembalikan ke PP', idUsulan,
    'Indikator bermasalah dikembalikan ke Pengelola Program | ' + alasanGabungan);
  return ok({ message: 'Indikator bermasalah dikembalikan ke Pengelola Program untuk re-verifikasi.' + warningMsg, isOverLimit });
}


// ============== REJECT USULAN (Global oleh Admin) ==============
async function rejectUsulan(pool, body) {
  const { idUsulan, email, alasan } = body;
  if (!idUsulan || !email) return err('Data tidak lengkap');
  if (!isValidText(alasan)) return err('Alasan penolakan harus diisi dengan teks yang bermakna');

  const _roleCheck = await pool.query(
    `SELECT role FROM users WHERE LOWER(email)=LOWER($1) AND aktif=true`, [email]
  );
  if (!_roleCheck.rows.length || _roleCheck.rows[0].role !== 'Admin')
    return err('Akses ditolak', 403);

  const headerRes = await pool.query(
    `SELECT status_global FROM usulan_header WHERE id_usulan=$1`, [idUsulan]
  );
  if (!headerRes.rows.length) return err('Usulan tidak ditemukan');

  await pool.query(
    `UPDATE usulan_header SET status_global='Ditolak', is_locked=false,
     ditolak_oleh='Admin', admin_catatan=$1, admin_approved_by=NULL
     WHERE id_usulan=$2`,
    [alasan, idUsulan]
  );

  await logAktivitas(pool, email, 'Admin', 'Tolak Global', idUsulan, `Ditolak oleh Admin: ${alasan}`);
  return ok({ message: 'Usulan telah ditolak.' });
}


// ============== GET PENOLAKAN INDIKATOR ==============
async function getPenolakanIndikator(pool, params) {
  const { idUsulan } = params;
  if (!idUsulan) return err('idUsulan diperlukan');

  const result = await pool.query(
    `SELECT pi.*, u.nama as nama_admin
     FROM penolakan_indikator pi
     LEFT JOIN users u ON LOWER(u.email)=LOWER(pi.email_admin)
     WHERE pi.id_usulan=$1
     ORDER BY pi.no_indikator ASC, pi.created_at DESC`,
    [idUsulan]
  );
  return ok(result.rows);
}


// ============== RESPOND PENOLAKAN (PP merespons penolakan Admin) ==============
async function respondPenolakan(pool, body) {
  const { idUsulan, email, responList } = body;
  if (!idUsulan || !email) return err('Data tidak lengkap');
  if (!responList || !responList.length) return err('Respons per indikator wajib diisi');

  const _roleCheck = await pool.query(
    `SELECT role FROM users WHERE LOWER(email)=LOWER($1) AND aktif=true`, [email]
  );
  if (!_roleCheck.rows.length || !['Pengelola Program','Program'].includes(_roleCheck.rows[0].role))
    return err('Akses ditolak', 403);

  const headerRes = await pool.query(
    `SELECT status_global, ditolak_oleh, konteks_penolakan FROM usulan_header WHERE id_usulan=$1`, [idUsulan]
  );
  if (!headerRes.rows.length) return err('Usulan tidak ditemukan');
  if (headerRes.rows[0].status_global !== 'Menunggu Pengelola Program')
    return err('Usulan tidak dalam tahap verifikasi program');

  // Validasi: catatan wajib bermakna
  for (const item of responList) {
    if (!isValidText(item.catatan)) return err(`Catatan untuk indikator #${item.noIndikator} harus diisi dengan teks yang bermakna`);
  }

  const logDetail = [];
  let adaSanggahSaya = false;
  // Bangun string sanggahan per-indikator untuk disimpan ke verifikasi_program.sanggahan
  // Format: "#2: Disanggah — alasan | #3: Dibenarkan — alasan"
  // Ini memberi Admin konteks granular saat re-verifikasi
  const sanggahanPerIndikator = [];
  for (const item of responList) {
    const { noIndikator, aksi, catatan } = item; // aksi: 'sanggah' | 'tolak'
    if (aksi === 'sanggah') adaSanggahSaya = true;
    const labelAksi = aksi === 'sanggah' ? 'Disanggah' : 'Dibenarkan';
    sanggahanPerIndikator.push(`#${noIndikator}: ${labelAksi} — ${catatan}`);
    // Simpan sanggahan PP ke verifikasi_program.sanggahan juga
    if (aksi === 'sanggah') {
      await pool.query(
        `UPDATE verifikasi_program SET sanggahan=$1 WHERE id_usulan=$2 AND LOWER(email_program)=LOWER($3)`,
        [catatan, idUsulan, email]
      ).catch(() => {});
    }
    logDetail.push(`#${noIndikator}: ${aksi === 'sanggah' ? 'Disanggah' : 'Dibenarkan'} — ${catatan}`);
  }
  // Simpan detail lengkap per-indikator ke sanggahan (overwrite dengan format gabungan)
  // agar Admin bisa melihat semua keputusan PP ini dalam satu field
  if (sanggahanPerIndikator.length > 0) {
    await pool.query(
      `UPDATE verifikasi_program SET sanggahan=$1 WHERE id_usulan=$2 AND LOWER(email_program)=LOWER($3)`,
      [sanggahanPerIndikator.join(' | '), idUsulan, email]
    ).catch(() => {});
  }

  // Simpan respons ke tabel terpisah untuk audit, lalu HAPUS baris milik PP ini.
  // PENTING: Kumpulkan no_indikator yang PP ini TERIMA (benarkan Admin) SEBELUM dihapus.
  // Nanti dipakai jika ternyata semua PP membenarkan → perlu tahu nomor yang perlu dikembalikan ke Operator.
  const nomorDiterimaPP = responList
    .filter(i => i.aksi === 'tolak') // 'tolak' di responList = PP membenarkan Admin
    .map(i => parseInt(i.noIndikator));

  await pool.query(
    `DELETE FROM penolakan_indikator
     WHERE id_usulan=$1 AND dibuat_oleh='Admin'
       AND LOWER(email_program)=LOWER($2)`,
    [idUsulan, email]
  );

  // Update VP milik PP ini ke Selesai setelah respond
  await pool.query(
    `UPDATE verifikasi_program SET status='Selesai', verified_at=NOW()
     WHERE id_usulan=$1 AND LOWER(email_program)=LOWER($2)`,
    [idUsulan, email]
  ).catch(() => {});
  
  // Cek sisa baris — kalau masih ada, berarti PP lain belum respond
  const pending = await pool.query(
    `SELECT COUNT(*) as ct FROM penolakan_indikator
     WHERE id_usulan=$1 AND dibuat_oleh='Admin'`,
    [idUsulan]
  );
  if (parseInt(pending.rows[0]?.ct) > 0) {
    await logAktivitas(pool, email, 'Pengelola Program', 'Respond Penolakan', idUsulan,
      logDetail.join(' | ') + ' [sebagian]');
    return ok({ message: 'Respons disimpan. Menunggu respons pengelola program lain.', allDone: false });
  }

  // Tidak ada sisa baris → semua PP sudah respond.
  // Cek apakah ada sanggahan dari PP manapun (simpan di verifikasi_program.sanggahan)
  const sanggahCheck = await pool.query(
    `SELECT COUNT(*) as ct FROM verifikasi_program
     WHERE id_usulan=$1 AND sanggahan IS NOT NULL AND sanggahan != ''`,
    [idUsulan]
  );
  const adaSanggah = parseInt(sanggahCheck.rows[0]?.ct) > 0;
  // Jika ada sanggahan → kembali ke Admin untuk re-verifikasi
  // Jika semua membenarkan → dikembalikan ke Operator (Ditolak)
  if (adaSanggah) {
    // Ada sanggahan dari minimal 1 PP → kembali ke Admin untuk keputusan akhir
    await pool.query(
      `UPDATE usulan_header SET status_global='Menunggu Admin', status_program='Selesai',
       konteks_penolakan='Admin', ditolak_oleh=NULL WHERE id_usulan=$1`, [idUsulan]
    );
    await logAktivitas(pool, email, 'Pengelola Program', 'Sanggah → Admin', idUsulan,
      'Sanggahan diteruskan ke Admin | ' + logDetail.join(' | '));
    return ok({ message: 'Sanggahan diteruskan ke Admin untuk keputusan akhir.', allDone: true });
  } else {
    // Semua PP membenarkan penolakan Admin → dikembalikan ke Operator
    // Ambil nomor dari data yang sudah dikumpul PP ini (nomorDiterimaPP) +
    // nomor dari PP lain yang sudah respond sebelumnya (baris sudah dihapus dari DB,
    // tapi tersimpan di verifikasi_program.catatan sebagai fallback).
    // Strategi terbaik: kumpulkan dari admin_catatan header (sudah di-set saat Admin tolak).
    const adminCatatanRes = await pool.query(
      `SELECT admin_catatan FROM usulan_header WHERE id_usulan=$1`, [idUsulan]
    );
    const adminCatatanStr = adminCatatanRes.rows[0]?.admin_catatan || '';
    const nomorDariAdminCatatan = [];
    adminCatatanStr.split('|').forEach(part => {
      const m = part.trim().match(/^#(\d+):/);
      if (m) nomorDariAdminCatatan.push(parseInt(m[1]));
    });
    // Gabungkan: dari admin_catatan + dari PP ini saat respond
    const nomorTolak = [...new Set([...nomorDariAdminCatatan, ...nomorDiterimaPP])];
    for (const no of nomorTolak) {
      await pool.query(
        `UPDATE usulan_indikator SET status='Draft', approved_by=NULL, approved_role=NULL, approved_at=NULL, catatan=NULL
         WHERE id_usulan=$1 AND no_indikator=$2`, [idUsulan, no]
      );
    }
    await pool.query(
      `UPDATE usulan_header SET status_global='Ditolak', is_locked=false,
       ditolak_oleh='Admin', konteks_penolakan=NULL WHERE id_usulan=$1`, [idUsulan]
    );
    await logAktivitas(pool, email, 'Pengelola Program', 'Terima Penolakan Admin', idUsulan,
      'PP menerima penolakan Admin — dikembalikan ke Operator | ' + logDetail.join(' | '));
    return ok({ message: 'Penolakan Admin dibenarkan. Usulan dikembalikan ke Operator untuk diperbaiki.', allDone: true });
  }
}


module.exports = { verifKapus, verifProgram, verifAdmin, rejectUsulan, getPenolakanIndikator, respondPenolakan };