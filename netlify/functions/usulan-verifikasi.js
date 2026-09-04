const { ok, err } = require('./db');
const { isValidText, parseIndikatorAkses, logAktivitas } = require('./usulan-helpers');

async function verifProgram(pool, body) {
  const { idUsulan, email, indikatorList, catatanProgram } = body;
  if (!idUsulan || !email) return err('Data tidak lengkap');
  if (!indikatorList || !indikatorList.length) return err('Keputusan per indikator wajib diisi');
  const _roleCheckPP = await pool.query(`SELECT role FROM users WHERE LOWER(email)=LOWER($1) AND aktif=true`, [email]);
  if (!_roleCheckPP.rows.length || !['Pengelola Program','Program'].includes(_roleCheckPP.rows[0].role))
    return err('Akses ditolak', 403);

  const headerRes = await pool.query('SELECT status_global, ditolak_oleh, tahun, bulan FROM usulan_header WHERE id_usulan=$1', [idUsulan]);
  if (!headerRes.rows.length) return err('Usulan tidak ditemukan');
  if (!['Menunggu Pengelola Program','Menunggu Re-verifikasi PP','Ditolak','Ditolak Sebagian'].includes(headerRes.rows[0].status_global))
    return err('Usulan tidak dalam tahap verifikasi program');

  
  const { tahun: tahunVP, bulan: bulanVP } = headerRes.rows[0];
  const pvResVP = await pool.query(
    `SELECT tanggal_mulai_verif, tanggal_selesai_verif, jam_mulai_verif, jam_selesai_verif FROM periode_input WHERE tahun=$1 AND bulan=$2 AND status='Aktif'`,
    [tahunVP, bulanVP]
  ).catch(() => ({ rows: [] }));
  if (pvResVP.rows.length && pvResVP.rows[0].tanggal_mulai_verif && pvResVP.rows[0].tanggal_selesai_verif) {
    const nowWita = new Date(Date.now() + 8 * 3600000);
    const nowStr  = nowWita.toISOString().slice(0, 16);
    const toWitaStr = (tgl, jam) => { const d = new Date(new Date(tgl).getTime() + 8*3600000); return d.toISOString().slice(0,10) + 'T' + (jam || '00:00'); };
    const pv = pvResVP.rows[0];
    const mulaiStr   = toWitaStr(pv.tanggal_mulai_verif,  pv.jam_mulai_verif  || '00:00');
    const selesaiStr = toWitaStr(pv.tanggal_selesai_verif, pv.jam_selesai_verif || '23:59');
    if (nowStr < mulaiStr)   return err(`Periode verifikasi belum dibuka. Dibuka mulai ${new Date(pv.tanggal_mulai_verif).toLocaleDateString('id-ID')} pukul ${pv.jam_mulai_verif || '00:00'} WITA.`);
    if (nowStr > selesaiStr) return err(`Periode verifikasi sudah ditutup pada ${new Date(pv.tanggal_selesai_verif).toLocaleDateString('id-ID')} pukul ${pv.jam_selesai_verif || '23:59'} WITA.`);
  }

  
  
  
  const isReVerifAdmin = headerRes.rows[0].ditolak_oleh === 'Admin';
  const adaYangSanggahAdmin = indikatorList.some(i => i.aksi === 'setuju');
  if (isReVerifAdmin && adaYangSanggahAdmin && !isValidText(catatanProgram)) return err('Catatan / Sanggahan wajib diisi dengan teks yang bermakna jika ada indikator yang disanggah');

  const vpCheck = await pool.query(
    'SELECT id, status, indikator_akses FROM verifikasi_program WHERE id_usulan=$1 AND LOWER(email_program)=LOWER($2)',
    [idUsulan, email]
  );
  if (!vpCheck.rows.length) return err('Anda tidak terdaftar sebagai pengelola program untuk usulan ini');
  
  
  
  
  if (vpCheck.rows[0].status === 'Selesai' && headerRes.rows[0].status_global === 'Menunggu Pengelola Program') {
    
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
    
    
  } else if (vpCheck.rows[0].status === 'Ditolak') {
    return err('Anda sudah menolak usulan ini');
  }

  
  
  const _freshUserRes = await pool.query(
    `SELECT indikator_akses FROM users WHERE LOWER(email)=LOWER($1) AND aktif=true`, [email]
  ).catch(() => ({ rows: [] }));
  const _freshAksesStr = _freshUserRes.rows[0]?.indikator_akses ?? vpCheck.rows[0].indikator_akses;

  
  if (_freshAksesStr !== vpCheck.rows[0].indikator_akses) {
    await pool.query(
      `UPDATE verifikasi_program SET indikator_akses=$1 WHERE id_usulan=$2 AND LOWER(email_program)=LOWER($3)`,
      [_freshAksesStr || '', idUsulan, email]
    ).catch(() => {});
  }

  const myAkses = parseIndikatorAkses(_freshAksesStr || '');
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
  
  
  
  
  
  const adaTolakSebagian = adaTolak && indikatorList.some(i => i.aksi === 'setuju');
  const aksiLog = adaTolak
    ? (adaTolakSebagian ? 'Tolak (sebagian)' : 'Tolak')
    : (isReVerifAdmin ? 'Re-verifikasi (Sanggah)' : 'Approve');
  
  const detailLog = adaTolak
    ? alasanGabungan + (catatanProgram ? ` | Catatan PP: ${catatanProgram}` : '')
    : (isReVerifAdmin && catatanProgram ? `Semua indikator disanggah — catatan: ${catatanProgram}` : logLabel);
  await logAktivitas(pool, email, 'Pengelola Program', aksiLog, idUsulan, detailLog);

  
  const allVP = await pool.query('SELECT status FROM verifikasi_program WHERE id_usulan=$1', [idUsulan]);
  const stillWaiting = allVP.rows.some(r => r.status === 'Menunggu');
  const anyRejected  = allVP.rows.some(r => r.status === 'Ditolak');

  if (stillWaiting) {
    return ok({ message: 'Verifikasi Anda disimpan. Menunggu pengelola program lain.', allDone: false });
  }

  
  if (!anyRejected) {
    
    const headerCheck = await pool.query('SELECT ditolak_oleh, konteks_penolakan FROM usulan_header WHERE id_usulan=$1', [idUsulan]);
    const ditolakOleh = headerCheck.rows[0]?.ditolak_oleh;
    const konteksPenolakan = headerCheck.rows[0]?.konteks_penolakan;

    
    
    
    const sisaAdminRows = await pool.query(
      `SELECT COUNT(*) as ct FROM penolakan_indikator
       WHERE id_usulan=$1 AND dibuat_oleh='Admin'`,
      [idUsulan]
    ).catch(() => ({ rows: [{ ct: 0 }] }));
    const adaSisaAdmin = parseInt(sisaAdminRows.rows[0]?.ct) > 0;

    const isReVerifAdmin = ditolakOleh === 'Admin' || konteksPenolakan === 'Admin' || adaSisaAdmin;

    
    await pool.query(
      `DELETE FROM penolakan_indikator WHERE id_usulan=$1 AND dibuat_oleh='PP'`,
      [idUsulan]
    ).catch(() => {});

    if (isReVerifAdmin) {
      
      
      await pool.query(
        `UPDATE usulan_header SET status_program='Selesai',
         status_global='Menunggu Re-verifikasi Kepala Puskesmas',
         ditolak_oleh='Admin', konteks_penolakan='Admin' WHERE id_usulan=$1`, [idUsulan]
      );
      return ok({ message: 'Semua pengelola program selesai re-verifikasi — diteruskan ke Kepala Puskesmas untuk konfirmasi.', allDone: true });
    } else {
      await pool.query(
        `UPDATE usulan_header SET status_program='Selesai', status_global='Menunggu Admin',
         ditolak_oleh=NULL, konteks_penolakan=NULL WHERE id_usulan=$1`, [idUsulan]
      );
      return ok({ message: 'Semua pengelola program menyetujui — usulan diteruskan ke Admin.', allDone: true });
    }
  }

  
  
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

  
  for (const no of nomorBermasalah) {
    await pool.query(
      `UPDATE usulan_indikator SET status='Draft', approved_by=NULL, approved_role=NULL, approved_at=NULL, catatan=NULL
       WHERE id_usulan=$1 AND no_indikator=$2`, [idUsulan, no]
    );
  }

  
  await pool.query(
    `DELETE FROM penolakan_indikator WHERE id_usulan=$1 AND no_indikator=ANY($2)`,
    [idUsulan, nomorBermasalah]
  );

  
  
  
  await pool.query(
    `DELETE FROM penolakan_indikator
     WHERE id_usulan=$1
       AND dibuat_oleh='PP'
       AND no_indikator != ALL($2)`,
    [idUsulan, nomorBermasalah.length > 0 ? nomorBermasalah : [0]]
  ).catch(() => {});

  
  
  
  if (nomorBermasalah.length > 0) {
    await pool.query(
      `DELETE FROM penolakan_indikator
       WHERE id_usulan=$1
         AND aksi IN ('kapus-ok','kapus-setuju')
         AND no_indikator != ALL($2)`,
      [idUsulan, nomorBermasalah]
    ).catch(() => {});
  } else {
    
    await pool.query(
      `DELETE FROM penolakan_indikator WHERE id_usulan=$1 AND aksi IN ('kapus-ok','kapus-setuju')`,
      [idUsulan]
    ).catch(() => {});
  }

  
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
  if (row.status_global !== 'Menunggu Kepala Puskesmas' && row.status_global !== 'Menunggu Re-verifikasi Kepala Puskesmas') return err('Usulan tidak dalam status Menunggu Kepala Puskesmas');
  if (row.kapus_pkm && row.kode_pkm !== row.kapus_pkm) return err('Anda hanya dapat memverifikasi usulan dari puskesmas Anda sendiri');

  
  const hdrVerif = await pool.query(`SELECT tahun, bulan FROM usulan_header WHERE id_usulan=$1`, [idUsulan]);
  if (hdrVerif.rows.length) {
    const { tahun, bulan } = hdrVerif.rows[0];
    const pvRes = await pool.query(
      `SELECT tanggal_mulai_verif, tanggal_selesai_verif, jam_mulai_verif, jam_selesai_verif FROM periode_input WHERE tahun=$1 AND bulan=$2 AND status='Aktif'`,
      [tahun, bulan]
    ).catch(() => ({ rows: [] }));
    if (pvRes.rows.length && pvRes.rows[0].tanggal_mulai_verif && pvRes.rows[0].tanggal_selesai_verif) {
      const nowWita = new Date(Date.now() + 8 * 3600000);
      const nowStr  = nowWita.toISOString().slice(0, 16);
      const toWitaStr = (tgl, jam) => { const d = new Date(new Date(tgl).getTime() + 8*3600000); return d.toISOString().slice(0,10) + 'T' + (jam || '00:00'); };
      const pv = pvRes.rows[0];
      const mulaiStr   = toWitaStr(pv.tanggal_mulai_verif,  pv.jam_mulai_verif  || '00:00');
      const selesaiStr = toWitaStr(pv.tanggal_selesai_verif, pv.jam_selesai_verif || '23:59');
      if (nowStr < mulaiStr)   return err(`Periode verifikasi belum dibuka. Dibuka mulai ${new Date(pv.tanggal_mulai_verif).toLocaleDateString('id-ID')} pukul ${pv.jam_mulai_verif || '00:00'} WITA.`);
      if (nowStr > selesaiStr) return err(`Periode verifikasi sudah ditutup pada ${new Date(pv.tanggal_selesai_verif).toLocaleDateString('id-ID')} pukul ${pv.jam_selesai_verif || '23:59'} WITA.`);
    }
  }

  const adaTolak = indikatorList.some(i => i.aksi === 'tolak');

  
  for (const item of indikatorList.filter(i => i.aksi === 'setuju' && i.alasan)) {
    await pool.query(
      `UPDATE usulan_indikator SET catatan=$1, approved_by=$2, approved_role='Kepala Puskesmas', approved_at=NOW()
       WHERE id_usulan=$3 AND no_indikator=$4`,
      [item.alasan, email, idUsulan, item.noIndikator]
    ).catch(() => {});
  }

  if (!adaTolak) {
    
    const headerInfo = await pool.query(
      `SELECT ditolak_oleh, konteks_penolakan, status_global FROM usulan_header WHERE id_usulan=$1`, [idUsulan]
    );
    const ditolakOleh = headerInfo.rows[0]?.ditolak_oleh;
    const konteksPenolakan = headerInfo.rows[0]?.konteks_penolakan;
    const statusGlobalKapus = headerInfo.rows[0]?.status_global;

    const isReVerifPP = ditolakOleh === 'Pengelola Program';

    
    
    
    const isKonfirmasiAdminTerimaKapus = konteksPenolakan === 'AdminTerimaKapus';
    if (isKonfirmasiAdminTerimaKapus && !adaTolak) {
      
      
      
      await pool.query(
        `DELETE FROM penolakan_indikator WHERE id_usulan=$1 AND dibuat_oleh='Kapus'`, [idUsulan]
      ).catch(() => {});
      await pool.query(
        `UPDATE usulan_header SET status_global='Ditolak', status_kapus='Ditolak', is_locked=false,
         ditolak_oleh='Kepala Puskesmas', konteks_penolakan=NULL,
         kapus_approved_by=$1, kapus_approved_at=NOW(), kapus_catatan=$2 WHERE id_usulan=$3`,
        [email, catatanKapus || 'Dikonfirmasi Kepala Puskesmas — dikembalikan ke Operator', idUsulan]
      );
      await logAktivitas(pool, email, 'Kepala Puskesmas', 'Konfirmasi Tolak Admin', idUsulan,
        `Mengkonfirmasi penolakan Admin yang dibenarkan PP — usulan dikembalikan ke Operator untuk perbaikan${catatanKapus ? ' | Catatan: ' + catatanKapus : ''}`);
      return ok({ message: 'Dikonfirmasi — usulan dikembalikan ke Operator untuk diperbaiki.' });
    }

    
    
    
    const sisaAdminKapus = await pool.query(
  `SELECT COUNT(*) as ct FROM penolakan_indikator
   WHERE id_usulan=$1 AND dibuat_oleh='Admin'`, [idUsulan]
).catch(() => ({ rows: [{ ct: 0 }] }));
const adaSisaAdminKapus = parseInt(sisaAdminKapus.rows[0]?.ct) > 0;

const isReVerifAdmin = statusGlobalKapus === 'Menunggu Re-verifikasi Kepala Puskesmas'
  || (konteksPenolakan === 'Admin' && !isKonfirmasiAdminTerimaKapus)
  || adaSisaAdminKapus;

    
const piPPCheck = await pool.query(
  `SELECT COUNT(*) as ct FROM penolakan_indikator
   WHERE id_usulan=$1
     AND (dibuat_oleh='PP' OR aksi='kapus-setuju' OR aksi='kapus-ok')`,
  [idUsulan]
);
const adaSisaPP = parseInt(piPPCheck.rows[0]?.ct) > 0;

    
    await pool.query(
      `DELETE FROM penolakan_indikator WHERE id_usulan=$1 AND dibuat_oleh='Kapus'`,
      [idUsulan]
    ).catch(() => {});

    
    
    
    if (isReVerifAdmin) {
      
      
      
      
      
      
      const adminCatatanRow = await pool.query(
        `SELECT admin_catatan FROM usulan_header WHERE id_usulan=$1`, [idUsulan]
      );
      const adminCatatanStr = adminCatatanRow.rows[0]?.admin_catatan || '';
      const alasanAdminMapKapus = {};
      adminCatatanStr.split('|').forEach(part => {
        const m = part.trim().match(/^#(\d+):\s*(.+)$/);
        if (m) alasanAdminMapKapus[parseInt(m[1])] = m[2].trim();
      });
      const nomorDariAdminCatatan = Object.keys(alasanAdminMapKapus).map(Number);

      if (nomorDariAdminCatatan.length > 0) {
        // Cek baris yang sudah ada agar tidak duplikasi
        const existingRows = await pool.query(
          `SELECT DISTINCT no_indikator FROM penolakan_indikator WHERE id_usulan=$1 AND dibuat_oleh='Admin'`,
          [idUsulan]
        ).catch(() => ({ rows: [] }));
        const nomorSudahAda = new Set(existingRows.rows.map(r => parseInt(r.no_indikator)));

        const allPPKonfirmasi = await pool.query(
          `SELECT email, indikator_akses FROM users WHERE role='Pengelola Program' AND aktif=true`
        );
        for (const no of nomorDariAdminCatatan) {
          if (nomorSudahAda.has(no)) continue;
          for (const pp of allPPKonfirmasi.rows) {
            const aksesArr = parseIndikatorAkses(pp.indikator_akses || '');
            const adaIrisan = aksesArr.length === 0 || aksesArr.includes(no);
            if (!adaIrisan) continue;
            await pool.query(
              `INSERT INTO penolakan_indikator (id_usulan, no_indikator, alasan, email_admin, created_at, aksi, email_program, dibuat_oleh)
               VALUES ($1,$2,$3,$4,NOW(),'tolak',$5,'Admin')
               ON CONFLICT (id_usulan, no_indikator, email_program) DO UPDATE
               SET alasan=$3, email_admin=$4, created_at=NOW(), aksi='tolak', catatan_program=NULL, responded_at=NULL, dibuat_oleh='Admin'`,
              [idUsulan, no, alasanAdminMapKapus[no] || 'Perlu perbaikan data', email, pp.email]
            ).catch(() => {});
          }
        }
      }

      await pool.query(
        `UPDATE usulan_header SET status_kapus='Selesai', status_global='Menunggu Admin',
         ditolak_oleh=NULL, konteks_penolakan='Admin',
         kapus_approved_by=$1, kapus_approved_at=NOW(), kapus_catatan=$2 WHERE id_usulan=$3`,
        [email, catatanKapus || 'Dikonfirmasi Kepala Puskesmas', idUsulan]
      );
      await logAktivitas(pool, email, 'Kepala Puskesmas', 'Konfirmasi Re-verif', idUsulan,
        `Mengkonfirmasi hasil re-verifikasi PP — diteruskan ke Admin untuk keputusan final${catatanKapus ? ' | Catatan: ' + catatanKapus : ''}`);
      return ok({ message: 'Dikonfirmasi — usulan diteruskan ke Admin untuk keputusan final.' });
    }

    
    
    
    
    let ditolakOlehVal = null;
    if (isReVerifPP) {
      ditolakOlehVal = null; 
    } else if (adaSisaPP) {
      
      ditolakOlehVal = 'Pengelola Program';
    } else {
      ditolakOlehVal = null; 
    }

    await pool.query(
      `UPDATE usulan_header SET status_kapus='Selesai', status_global='Menunggu Pengelola Program',
       ditolak_oleh=$1, konteks_penolakan=NULL,
       kapus_approved_by=$2, kapus_approved_at=NOW(), kapus_catatan=$4 WHERE id_usulan=$3`,
      [ditolakOlehVal, email, idUsulan, catatanKapus || 'Semua indikator disetujui']
    );

    const isReVerif = isReVerifPP || adaSisaPP;

    
    
    
    
    if (konteksPenolakan === 'KapusTolakAdmin') {
      const allPPReset = await pool.query(`SELECT email FROM verifikasi_program WHERE id_usulan=$1`, [idUsulan]);
      for (const vp of allPPReset.rows) {
        await pool.query(
          `UPDATE verifikasi_program SET status='Menunggu', catatan=NULL, verified_at=NULL
           WHERE id_usulan=$1 AND LOWER(email_program)=LOWER($2)`,
          [idUsulan, vp.email]
        ).catch(() => {});
      }
    }

    if (isReVerif) {
      
      
      
      
      
      
      
      
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
      // Siklus pertama atau setelah KapusTolakAdmin: semua PP verif dari awal
      // Jika ini KapusTolakAdmin (VP lama bisa 'Selesai'), reset status ke 'Menunggu'
      const wasKapusTolakAdmin = konteksPenolakan === 'KapusTolakAdmin';
      const allPP = await pool.query(`SELECT email, nama, nip, jabatan, indikator_akses FROM users WHERE role='Pengelola Program' AND aktif=true`);
      for (const pp of allPP.rows) {
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
          [idUsulan, pp.email, pp.nama, pp.nip||null, pp.jabatan||null, pp.indikator_akses||'', wasKapusTolakAdmin]
        );
      }
    }

    let logAksiKapus, logDetailKapus;
    if (isReVerifPP) {
      logAksiKapus  = 'Kapus Sanggah';
      logDetailKapus = `Menyanggah penolakan Pengelola Program — diteruskan ke PP${catatanKapus && catatanKapus !== 'Semua indikator disetujui' ? ' | Catatan: ' + catatanKapus : ''}`;
    } else {
      logAksiKapus  = 'Approve';
      logDetailKapus = catatanKapus && catatanKapus !== 'Semua indikator disetujui' ? `Semua indikator disetujui | Catatan: ${catatanKapus}` : 'Semua indikator disetujui';
    }
    await logAktivitas(pool, email, 'Kepala Puskesmas', logAksiKapus, idUsulan, logDetailKapus);
    return ok({ message: 'Semua indikator disetujui — diteruskan ke Pengelola Program.' });
  }

  
  
  
  
  const nomorTolakKapus   = indikatorList.filter(i => i.aksi === 'tolak').map(i => parseInt(i.noIndikator));
  const nomorSanggahKapus = indikatorList.filter(i => i.aksi === 'setuju').map(i => parseInt(i.noIndikator));
  const alasanGabungan = indikatorList.filter(i => i.aksi === 'tolak')
    .map(i => '#' + i.noIndikator + ': ' + i.alasan).join(' | ');

  
  const piPPEmailRows = await pool.query(
    `SELECT no_indikator, email_program FROM penolakan_indikator WHERE id_usulan=$1 AND email_program IS NOT NULL`,
    [idUsulan]
  ).catch(() => ({ rows: [] }));
  const emailPPMap = {};
  for (const r of piPPEmailRows.rows) {
    emailPPMap[r.no_indikator] = r.email_program;
  }

  
  await pool.query(`DELETE FROM penolakan_indikator WHERE id_usulan=$1 AND (dibuat_oleh='Kapus' OR dibuat_oleh IS NULL)`, [idUsulan]).catch(()=>{});

  
  const piPPExisting = await pool.query(
    `SELECT no_indikator FROM penolakan_indikator WHERE id_usulan=$1 AND dibuat_oleh='PP'`,
    [idUsulan]
  ).catch(() => ({ rows: [] }));
  const nomorSudahAdaPP = new Set(piPPExisting.rows.map(r => parseInt(r.no_indikator)));

  
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

  
  
  for (const no of nomorTolakKapus) {
    await pool.query(
      `UPDATE usulan_indikator SET status='Draft', approved_by=NULL, approved_role=NULL, approved_at=NULL, catatan=NULL
       WHERE id_usulan=$1 AND no_indikator=$2`,
      [idUsulan, no]
    );
  }

  
  const headerReVerifCheck = await pool.query('SELECT ditolak_oleh, konteks_penolakan, status_global FROM usulan_header WHERE id_usulan=$1', [idUsulan]);
  const ditolakOlehKapusTolak = headerReVerifCheck.rows[0]?.ditolak_oleh;
  const konteksPenolakanKapusTolak = headerReVerifCheck.rows[0]?.konteks_penolakan;
  const statusGlobalKapusTolak = headerReVerifCheck.rows[0]?.status_global;
  const isReVerifPPKapusTolak = ditolakOlehKapusTolak === 'Pengelola Program';
  
  
  
  
  
  
  const isReVerifAdminKapusTolak = statusGlobalKapusTolak === 'Menunggu Re-verifikasi Kepala Puskesmas'
    || konteksPenolakanKapusTolak === 'Admin';

  
  
  
  
  
  
  
  if ((isReVerifPPKapusTolak || isReVerifAdminKapusTolak) && nomorSanggahKapus.length > 0) {
    for (const no of nomorSanggahKapus) {
      const emailPPAsli = emailPPMap[no] || email;
      await pool.query(
        `INSERT INTO penolakan_indikator (id_usulan, no_indikator, alasan, email_admin, created_at, aksi, email_program, dibuat_oleh)
         VALUES ($1,$2,'Disetujui Kapus',$3,NOW(),'kapus-ok',$4,'PP')
         ON CONFLICT (id_usulan, no_indikator, email_program) DO UPDATE
         SET alasan='Disetujui Kapus', email_admin=$3, created_at=NOW(), aksi='kapus-ok',
             catatan_program=NULL, responded_at=NULL, dibuat_oleh='PP'`,
        [idUsulan, no, email, emailPPAsli]
      ).catch(() => {});
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

  
  
  
  
  
  
  
  
  
  
  
  const adaMixed = nomorTolakKapus.length > 0 && nomorSanggahKapus.length > 0;
  const statusGlobalFinal = adaMixed ? 'Ditolak Sebagian' : 'Ditolak';

  
  
  const konteksPenolakanFinal = isReVerifAdminKapusTolak ? 'KapusTolakAdmin' : null;
  await pool.query(
    `UPDATE usulan_header SET status_global=$4, status_kapus='Ditolak', is_locked=false,
     ditolak_oleh=$2, konteks_penolakan=$5, kapus_approved_by=NULL, kapus_catatan=$1 WHERE id_usulan=$3`,
    [alasanGabungan, ditolakOlehFinal, idUsulan, statusGlobalFinal, konteksPenolakanFinal]
  );

  
  
  
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

  
  const { tahun, bulan } = headerRes.rows[0];
  const pvRes = await pool.query(
    `SELECT tanggal_mulai_verif, tanggal_selesai_verif, jam_mulai_verif, jam_selesai_verif FROM periode_input WHERE tahun=$1 AND bulan=$2 AND status='Aktif'`,
    [tahun, bulan]
  ).catch(() => ({ rows: [] }));
  if (pvRes.rows.length && pvRes.rows[0].tanggal_mulai_verif && pvRes.rows[0].tanggal_selesai_verif) {
    const nowWita = new Date(Date.now() + 8 * 3600000);
    const nowStr  = nowWita.toISOString().slice(0, 16);
    const toWitaStr = (tgl, jam) => { const d = new Date(new Date(tgl).getTime() + 8*3600000); return d.toISOString().slice(0,10) + 'T' + (jam || '00:00'); };
    const pv = pvRes.rows[0];
    const mulaiStr   = toWitaStr(pv.tanggal_mulai_verif,  pv.jam_mulai_verif  || '00:00');
    const selesaiStr = toWitaStr(pv.tanggal_selesai_verif, pv.jam_selesai_verif || '23:59');
    if (nowStr < mulaiStr)   return err(`Periode verifikasi belum dibuka. Dibuka mulai ${new Date(pv.tanggal_mulai_verif).toLocaleDateString('id-ID')} pukul ${pv.jam_mulai_verif || '00:00'} WITA.`);
    if (nowStr > selesaiStr) return err(`Periode verifikasi sudah ditutup pada ${new Date(pv.tanggal_selesai_verif).toLocaleDateString('id-ID')} pukul ${pv.jam_selesai_verif || '23:59'} WITA.`);
  }

  const adaTolak = indikatorList.some(i => i.aksi === 'tolak');

  if (!adaTolak) {
    // Snapshot pejabat penandatangan saat ini, biar laporan final periode ini
    // tetap nunjukin pejabat yang benar walau pejabat_penandatangan diganti belakangan.
    const pjSnapshot = await pool.query(
      `SELECT jabatan, nama, nip, tanda_tangan FROM pejabat_penandatangan ORDER BY id`
    ).catch(() => ({ rows: [] }));

    await pool.query(
      `UPDATE usulan_header SET status_global='Selesai', status_final='Selesai',
       admin_approved_by=$1, admin_approved_at=NOW(),
       waktu_selesai=NOW(),
       ditolak_oleh=NULL, konteks_penolakan=NULL,
       reverif_count=0,
       penandatangan_snapshot=$3
       WHERE id_usulan=$2`,
      [email, idUsulan, JSON.stringify(pjSnapshot.rows)]
    );
    
    await pool.query(`DELETE FROM penolakan_indikator WHERE id_usulan=$1`, [idUsulan]).catch(() => {});
    await logAktivitas(pool, email, 'Admin', 'Selesai', idUsulan, 'Semua indikator disetujui — usulan selesai');
    return ok({ message: 'Usulan telah disetujui dan dinyatakan Selesai.' });
  }

  
  const nomorTolak = indikatorList.filter(i => i.aksi === 'tolak').map(i => parseInt(i.noIndikator));
  const alasanMap = {};
  for (const item of indikatorList.filter(i => i.aksi === 'tolak')) {
    alasanMap[item.noIndikator] = item.alasan || 'Perlu perbaikan data';
  }
  const alasanGabungan = nomorTolak.map(n => `#${n}: ${alasanMap[n]}`).join(' | ');

  
  
  const MAX_REVIRIF_CYCLE = 3;
  const cycleCheckRes = await pool.query(
    `SELECT COALESCE(reverif_count, 0) as reverif_count FROM usulan_header WHERE id_usulan=$1`, [idUsulan]
  ).catch(() => ({ rows: [{ reverif_count: 0 }] }));
  const currentCycle = parseInt(cycleCheckRes.rows[0]?.reverif_count) || 0;
  const isOverLimit = currentCycle >= MAX_REVIRIF_CYCLE;
  if (isOverLimit) {
    console.warn(`[verifAdmin] Usulan ${idUsulan} sudah melewati ${MAX_REVIRIF_CYCLE} siklus re-verifikasi Admin↔PP. Pertimbangkan tolak global.`);
  }

  
  for (const no of nomorTolak) {
    await pool.query(
      `UPDATE usulan_indikator SET status='Draft', approved_by=NULL, approved_role=NULL, approved_at=NULL, catatan=NULL
       WHERE id_usulan=$1 AND no_indikator=$2`, [idUsulan, no]
    );
  }

  
  await pool.query(
    `DELETE FROM penolakan_indikator WHERE id_usulan=$1 AND no_indikator=ANY($2)`,
    [idUsulan, nomorTolak]
  );

  
  
  
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

  // Kembalikan ke 'Menunggu Re-verifikasi PP' — status baru, jelas berbeda dari
  // siklus normal 'Menunggu Pengelola Program'. PP re-verif dulu, baru naik ke Kapus, baru ke Admin.
  // Increment reverif_count untuk tracking siklus (Poin 2)
  await pool.query(
    `UPDATE usulan_header SET status_global='Menunggu Re-verifikasi PP',
     status_program='Menunggu', admin_catatan=$1,
     ditolak_oleh='Admin', konteks_penolakan='Admin',
     reverif_count = COALESCE(reverif_count, 0) + 1
     WHERE id_usulan=$2`,
    [alasanGabunganFull, idUsulan]
  );

  
  const warningMsg = isOverLimit
    ? ` ⚠️ Perhatian: Usulan ini sudah melewati ${MAX_REVIRIF_CYCLE} putaran re-verifikasi. Pertimbangkan untuk menolak usulan secara keseluruhan jika data tidak kunjung diperbaiki.`
    : '';

  await logAktivitas(pool, email, 'Admin', 'Kembalikan ke PP', idUsulan,
    'Indikator bermasalah dikembalikan ke Pengelola Program | ' + alasanGabungan);
  return ok({ message: 'Indikator bermasalah dikembalikan ke Pengelola Program untuk re-verifikasi.' + warningMsg, isOverLimit });
}

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
     ditolak_oleh='Admin', konteks_penolakan=NULL, admin_catatan=$1, admin_approved_by=NULL
     WHERE id_usulan=$2`,
    [alasan, idUsulan]
  );

  await logAktivitas(pool, email, 'Admin', 'Tolak Global', idUsulan, `Ditolak oleh Admin: ${alasan}`);
  return ok({ message: 'Usulan telah ditolak.' });
}

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
  
  
  
  if (!['Menunggu Pengelola Program', 'Menunggu Re-verifikasi PP'].includes(headerRes.rows[0].status_global))
    return err('Usulan tidak dalam tahap verifikasi program');

  
  for (const item of responList) {
    if (!isValidText(item.catatan)) return err(`Catatan untuk indikator #${item.noIndikator} harus diisi dengan teks yang bermakna`);
  }

  const logDetail = [];
  let adaSanggahSaya = false;
  
  
  
  const sanggahanPerIndikator = [];
  for (const item of responList) {
    const { noIndikator, aksi, catatan } = item; 
    if (aksi === 'sanggah') adaSanggahSaya = true;
    const labelAksi = aksi === 'sanggah' ? 'Disanggah' : 'Dibenarkan';
    sanggahanPerIndikator.push(`#${noIndikator}: ${labelAksi} — ${catatan}`);
    
    if (aksi === 'sanggah') {
      await pool.query(
        `UPDATE verifikasi_program SET sanggahan=$1 WHERE id_usulan=$2 AND LOWER(email_program)=LOWER($3)`,
        [catatan, idUsulan, email]
      ).catch(() => {});
    }
    logDetail.push(`#${noIndikator}: ${aksi === 'sanggah' ? 'Disanggah' : 'Dibenarkan'} — ${catatan}`);
  }
  
  
  if (sanggahanPerIndikator.length > 0) {
    await pool.query(
      `UPDATE verifikasi_program SET sanggahan=$1 WHERE id_usulan=$2 AND LOWER(email_program)=LOWER($3)`,
      [sanggahanPerIndikator.join(' | '), idUsulan, email]
    ).catch(() => {});
  }

  
  
  
  const nomorDiterimaPP = responList
    .filter(i => i.aksi === 'tolak') 
    .map(i => parseInt(i.noIndikator));

  await pool.query(
    `DELETE FROM penolakan_indikator
     WHERE id_usulan=$1 AND dibuat_oleh='Admin'
       AND LOWER(email_program)=LOWER($2)`,
    [idUsulan, email]
  );

  
  await pool.query(
    `UPDATE verifikasi_program SET status='Selesai', verified_at=NOW()
     WHERE id_usulan=$1 AND LOWER(email_program)=LOWER($2)`,
    [idUsulan, email]
  ).catch(() => {});
  
  
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

  
  
  
  
  
  
  
  
  
  const allVPSanggahanRes = await pool.query(
    `SELECT sanggahan FROM verifikasi_program WHERE id_usulan=$1 AND sanggahan IS NOT NULL AND sanggahan != ''`,
    [idUsulan]
  );
  const nomorDiakui    = new Set(); 
  const nomorDisanggah = new Set(); 

  for (const vp of allVPSanggahanRes.rows) {
    (vp.sanggahan || '').split('|').map(s => s.trim()).filter(Boolean).forEach(part => {
      const m = part.match(/^#(\d+):\s*(Disanggah|Dibenarkan)/i);
      if (!m) return;
      const no = parseInt(m[1]);
      if (/dibenarkan/i.test(m[2])) nomorDiakui.add(no);  // akui → langsung masuk nomorDiakui
      else nomorDisanggah.add(no);                          // sanggah → masuk nomorDisanggah dulu
    });
  }
  // Tambahkan dari PP yang baru respond ini (nomorDiterimaPP = indikator yang PP ini akui)
  for (const no of nomorDiterimaPP) nomorDiakui.add(no);

  // AKUI MENANG: hapus dari nomorDisanggah jika sudah masuk nomorDiakui
  // (ada PP lain yang akui indikator yang sama → indikator ini harus ke Kapus)
  for (const no of nomorDiakui) nomorDisanggah.delete(no);

  const adaAkui    = nomorDiakui.size > 0;
  const adaSanggah = nomorDisanggah.size > 0;

  // ── KASUS 1: Semua PP menyanggah, tidak ada yang membenarkan ──
  // → Langsung ke Admin untuk re-verifikasi. Tidak perlu lewat Kapus.
  if (adaSanggah && !adaAkui) {
    // Insert ulang baris penolakan untuk indikator yang disanggah agar Admin tahu
    // persis indikator mana yang perlu di-re-verifikasi (bukan semua indikator).
    // Baris Admin sebelumnya sudah dihapus saat PP respond — harus diisi ulang.
    const adminCatatanForKasus1 = await pool.query(
      `SELECT admin_catatan FROM usulan_header WHERE id_usulan=$1`, [idUsulan]
    );
    const adminCatatanStrK1 = adminCatatanForKasus1.rows[0]?.admin_catatan || '';
    const alasanAdminMapK1 = {};
    adminCatatanStrK1.split('|').forEach(part => {
      const m = part.trim().match(/^#(\d+):\s*(.+)$/);
      if (m) alasanAdminMapK1[parseInt(m[1])] = m[2];
    });
    const allPPForKasus1 = await pool.query(
      `SELECT email, indikator_akses FROM users WHERE role='Pengelola Program' AND aktif=true`
    );
    for (const no of [...nomorDisanggah]) {
      for (const pp of allPPForKasus1.rows) {
        const aksesArr = parseIndikatorAkses(pp.indikator_akses || '');
        const adaIrisan = aksesArr.length === 0 || aksesArr.includes(no);
        if (!adaIrisan) continue;
        await pool.query(
          `INSERT INTO penolakan_indikator (id_usulan, no_indikator, alasan, email_admin, created_at, aksi, email_program, dibuat_oleh)
           VALUES ($1,$2,$3,$4,NOW(),'tolak',$5,'Admin')
           ON CONFLICT (id_usulan, no_indikator, email_program) DO UPDATE
           SET alasan=$3, email_admin=$4, created_at=NOW(), aksi='tolak', catatan_program=NULL, responded_at=NULL, dibuat_oleh='Admin'`,
          [idUsulan, no, alasanAdminMapK1[no] || 'Disanggah oleh Pengelola Program', email, pp.email]
        ).catch(() => {});
      }
    }
    await pool.query(
      `UPDATE usulan_header SET status_global='Menunggu Admin', status_program='Selesai',
       ditolak_oleh='Admin', konteks_penolakan='Admin' WHERE id_usulan=$1`, [idUsulan]
    );
    await logAktivitas(pool, email, 'Pengelola Program', 'Sanggah → Admin', idUsulan,
      'Semua PP menyanggah penolakan Admin — diteruskan ke Admin untuk re-verifikasi | ' + logDetail.join(' | '));
    return ok({ message: 'Semua pengelola program menyanggah — diteruskan ke Admin untuk re-verifikasi.', allDone: true });
  }

  
  
  
  
  if (adaSanggah && adaAkui) {
    const nomorAkuiArr   = [...nomorDiakui];
    const nomorSanggahArr = [...nomorDisanggah];

    
    const adminCatatanRes2 = await pool.query(
      `SELECT admin_catatan FROM usulan_header WHERE id_usulan=$1`, [idUsulan]
    );
    const adminCatatanStr2 = adminCatatanRes2.rows[0]?.admin_catatan || '';
    const alasanAdminMap = {};
    adminCatatanStr2.split('|').forEach(part => {
      const m = part.trim().match(/^#(\d+):\s*(.+)$/);
      if (m) alasanAdminMap[parseInt(m[1])] = m[2];
    });

    // Reset indikator yang diakui ke Draft (Operator harus perbaiki)
    for (const no of nomorAkuiArr) {
      await pool.query(
        `UPDATE usulan_indikator SET status='Draft', approved_by=NULL, approved_role=NULL, approved_at=NULL, catatan=NULL
         WHERE id_usulan=$1 AND no_indikator=$2`, [idUsulan, no]
      );
    }

    
    
    const allPPForInsert = await pool.query(
  `SELECT email, indikator_akses FROM users WHERE role='Pengelola Program' AND aktif=true`
);

for (const no of nomorAkuiArr) {
  await pool.query(`DELETE FROM penolakan_indikator WHERE id_usulan=$1 AND no_indikator=$2`, [idUsulan, no]);
  for (const pp of allPPForInsert.rows) {
    const aksesArr = parseIndikatorAkses(pp.indikator_akses || '');
    const adaIrisan = aksesArr.length === 0 || aksesArr.includes(no);
    if (!adaIrisan) continue;
    await pool.query(
      `INSERT INTO penolakan_indikator
         (id_usulan, no_indikator, alasan, email_admin, created_at, aksi, email_program, dibuat_oleh)
       VALUES ($1,$2,$3,$4,NOW(),'tolak',$5,'PP')
       ON CONFLICT (id_usulan, no_indikator, email_program) DO UPDATE
         SET alasan=$3, email_admin=$4, created_at=NOW(), aksi='tolak',
             catatan_program=NULL, responded_at=NULL, dibuat_oleh='PP'`,
      [idUsulan, no, alasanAdminMap[no] || 'Dibenarkan oleh Pengelola Program', email, pp.email]
    );
  }
}

    // Reset VP yang punya irisan dengan indikator yang diakui → wajib re-verif ulang
    // Ini termasuk PP yang sebelumnya menyanggah — karena ada PP lain yang akui,
    // semua harus verifikasi ulang dari awal untuk indikator ini (Kapus yang putuskan)
    const allVPForReset = await pool.query(
      `SELECT email_program, indikator_akses FROM verifikasi_program WHERE id_usulan=$1`, [idUsulan]
    );
    for (const vp of allVPForReset.rows) {
      const aksesArr = parseIndikatorAkses(vp.indikator_akses || '');
      const adaIrisan = aksesArr.length === 0
        ? nomorAkuiArr.length > 0
        : aksesArr.some(n => nomorAkuiArr.includes(n));
      if (adaIrisan) {
        await pool.query(
          `UPDATE verifikasi_program SET status='Menunggu', catatan=NULL, sanggahan=NULL, verified_at=NULL
           WHERE id_usulan=$1 AND LOWER(email_program)=LOWER($2)`,
          [idUsulan, vp.email_program]
        );
      }
    }

    // Status → Menunggu Kepala Puskesmas (konteks Admin tetap disimpan)
    // Kapus akan konfirmasi: indikator diakui dikembalikan ke Operator, indikator disanggah naik ke Admin
    await pool.query(
      `UPDATE usulan_header SET status_global='Menunggu Kepala Puskesmas', status_kapus='Menunggu',
       status_program='Menunggu', ditolak_oleh='Admin', konteks_penolakan='Admin'
       WHERE id_usulan=$1`, [idUsulan]
    );
    const logMixed = `Sanggahan diteruskan ke Kepala Puskesmas untuk konfirmasi`
      + ` | Indikator diakui (→ Operator): ${nomorAkuiArr.map(n => '#'+n).join(', ')}`
      + ` | Indikator disanggah (→ Admin): ${nomorSanggahArr.map(n => '#'+n).join(', ')}`
      + ` | ` + logDetail.join(' | ');
    await logAktivitas(pool, email, 'Pengelola Program', 'Sanggah → Kapus', idUsulan, logMixed);
    return ok({
      message: 'Sebagian indikator disanggah (akan ke Admin) dan sebagian diakui (ke Kepala Puskesmas untuk konfirmasi).',
      allDone: true
    });
  }

  
  
  
  
  {
    const nomorTolak = [...new Set([...nomorDiterimaPP])];

    
    for (const no of nomorTolak) {
      await pool.query(
        `UPDATE usulan_indikator SET status='Draft', approved_by=NULL, approved_role=NULL, approved_at=NULL, catatan=NULL
         WHERE id_usulan=$1 AND no_indikator=$2`, [idUsulan, no]
      );
    }

    
    
    if (nomorTolak.length > 0) {
      await pool.query(
        `DELETE FROM penolakan_indikator WHERE id_usulan=$1 AND no_indikator=ANY($2) AND dibuat_oleh='Admin'`,
        [idUsulan, nomorTolak]
      ).catch(() => {});

      
      const adminCatatanRes = await pool.query(
        `SELECT admin_catatan FROM usulan_header WHERE id_usulan=$1`, [idUsulan]
      );
      const adminCatatanStr = adminCatatanRes.rows[0]?.admin_catatan || '';
      const alasanAdminMap = {};
      adminCatatanStr.split('|').forEach(part => {
        const m = part.trim().match(/^#(\d+):\s*(.+)$/);
        if (m) alasanAdminMap[parseInt(m[1])] = m[2];
      });

      // Insert baris penolakan dibuat_oleh='PP' agar Kapus bisa lihat detail per indikator
      const allPPKasus3 = await pool.query(
        `SELECT email, indikator_akses FROM users WHERE role='Pengelola Program' AND aktif=true`
      );
      for (const no of nomorTolak) {
        for (const pp of allPPKasus3.rows) {
          const aksesArr = parseIndikatorAkses(pp.indikator_akses || '');
          const adaIrisan = aksesArr.length === 0 || aksesArr.includes(no);
          if (!adaIrisan) continue;
          await pool.query(
            `INSERT INTO penolakan_indikator (id_usulan, no_indikator, alasan, email_admin, created_at, aksi, email_program, dibuat_oleh)
             VALUES ($1,$2,$3,$4,NOW(),'tolak',$5,'PP')
             ON CONFLICT (id_usulan, no_indikator, email_program) DO UPDATE
             SET alasan=$3, email_admin=$4, created_at=NOW(), aksi='tolak',
                 catatan_program=NULL, responded_at=NULL, dibuat_oleh='PP'`,
            [idUsulan, no, alasanAdminMap[no] || 'Dibenarkan oleh Pengelola Program', email, pp.email]
          ).catch(() => {});
        }
      }
    }

    // Reset VP yang punya irisan dengan indikator bermasalah → Kapus perlu re-verif
    const allVPKasus3 = await pool.query(
      `SELECT email_program, indikator_akses FROM verifikasi_program WHERE id_usulan=$1`, [idUsulan]
    );
    for (const vp of allVPKasus3.rows) {
      const aksesArr = parseIndikatorAkses(vp.indikator_akses || '');
      const adaIrisan = aksesArr.length === 0
        ? nomorTolak.length > 0
        : aksesArr.some(n => nomorTolak.includes(n));
      if (adaIrisan) {
        await pool.query(
          `UPDATE verifikasi_program SET status='Menunggu', catatan=NULL, sanggahan=NULL, verified_at=NULL
           WHERE id_usulan=$1 AND LOWER(email_program)=LOWER($2)`,
          [idUsulan, vp.email_program]
        ).catch(() => {});
      }
    }

    // Arahkan ke Kapus untuk konfirmasi — bukan langsung Ditolak ke Operator
    // ditolak_oleh='Admin' + konteks_penolakan='AdminTerimaKapus' (penanda khusus Kasus 3)
    // agar verifKapus tahu: approve → Ditolak ke Operator, bukan naik ke Admin lagi
    // is_locked=true agar Operator tidak bisa edit sebelum Kapus konfirmasi
    await pool.query(
      `UPDATE usulan_header SET status_global='Menunggu Kepala Puskesmas', status_kapus='Menunggu',
       status_program='Selesai', is_locked=true,
       ditolak_oleh='Admin', konteks_penolakan='AdminTerimaKapus' WHERE id_usulan=$1`, [idUsulan]
    );
    await logAktivitas(pool, email, 'Pengelola Program', 'Terima Penolakan Admin → Kapus', idUsulan,
      'PP menerima penolakan Admin — diteruskan ke Kepala Puskesmas untuk konfirmasi | ' + logDetail.join(' | '));
    return ok({ message: 'Penolakan Admin dibenarkan. Diteruskan ke Kepala Puskesmas untuk konfirmasi.', allDone: true });
  }
}

module.exports = { verifKapus, verifProgram, verifAdmin, rejectUsulan, getPenolakanIndikator, respondPenolakan };