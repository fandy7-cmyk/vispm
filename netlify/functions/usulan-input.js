const { getPool, ok, err, confirm, cors } = require('./db');
const { isValidText, parseIndikatorAkses, logAktivitas, mapHeader } = require('./usulan-helpers');

// ─── Helper: cek apakah sekarang (WITA) masih dalam periode input yang aktif ───
// Kembalikan objek error jika di luar periode, atau null jika masih valid.
// Dipakai oleh updateIndikator dan submitUsulan agar konsisten dengan buatUsulan.
async function cekPeriodeInput(pool, tahun, bulan) {
  const periodeCheck = await pool.query(
    `SELECT tanggal_mulai, tanggal_selesai, jam_mulai, jam_selesai
     FROM periode_input WHERE tahun=$1 AND bulan=$2 AND status='Aktif'`,
    [tahun, bulan]
  ).catch(() => ({ rows: [] }));

  if (!periodeCheck.rows.length) return null; // tidak ada periode aktif → biarkan logika lain yang handle

  const p = periodeCheck.rows[0];
  if (!p.tanggal_mulai || !p.tanggal_selesai) return null; // tanggal belum diset → skip

  const nowWita  = new Date(Date.now() + 8 * 3600000);
  const nowStr   = nowWita.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:MM"
  const toWitaStr = (tgl, jam) => {
    const d = new Date(new Date(tgl).getTime() + 8 * 3600000);
    return d.toISOString().slice(0, 10) + 'T' + (jam || '00:00');
  };
  const mulaiStr   = toWitaStr(p.tanggal_mulai,  p.jam_mulai  || '00:00');
  const selesaiStr = toWitaStr(p.tanggal_selesai, p.jam_selesai || '23:59');

  if (nowStr < mulaiStr)
    return err(`Periode input belum dibuka. Dibuka mulai ${new Date(p.tanggal_mulai).toLocaleDateString('id-ID')} pukul ${p.jam_mulai || '00:00'} WITA.`);
  if (nowStr > selesaiStr)
    return err(`Periode input sudah ditutup pada ${new Date(p.tanggal_selesai).toLocaleDateString('id-ID')} pukul ${p.jam_selesai || '23:59'} WITA.`);

  return null; // periode valid
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
    // Gunakan WITA (UTC+8) konsisten dengan frontend dan backend verifikasi
    const nowWita = new Date(Date.now() + 8 * 3600000);
    const nowStr  = nowWita.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:MM"
    const toWitaStr = (tgl, jam) => {
      const d = new Date(new Date(tgl).getTime() + 8 * 3600000);
      return d.toISOString().slice(0, 10) + 'T' + (jam || '00:00');
    };
    const mulaiStr   = toWitaStr(p.tanggal_mulai,  p.jam_mulai  || '00:00');
    const selesaiStr = toWitaStr(p.tanggal_selesai, p.jam_selesai || '23:59');
    if (nowStr < mulaiStr) return err(`Periode input belum dibuka. Dibuka mulai ${new Date(p.tanggal_mulai).toLocaleDateString('id-ID')} pukul ${p.jam_mulai || '00:00'} WITA.`);
    if (nowStr > selesaiStr) return err(`Periode input sudah ditutup pada ${new Date(p.tanggal_selesai).toLocaleDateString('id-ID')} pukul ${p.jam_selesai || '23:59'} WITA.`);
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
    // Bersihkan data penolakan_indikator lama jika ada (sisa dari usulan yg pernah dihapus)
    await client.query('DELETE FROM penolakan_indikator WHERE id_usulan=$1', [idUsulan]).catch(()=>{});
    await client.query(
      `INSERT INTO usulan_header (id_usulan,tahun,bulan,periode_key,kode_pkm,total_nilai,total_bobot,indeks_kinerja_spm,indeks_beban_kerja,indeks_spm,status_kapus,status_program,status_final,status_global,is_locked,created_by,created_at)
       VALUES ($1,$2,$3,$4,$5,0,$6,0,$7,0,'Menunggu','Menunggu','Menunggu','Draft',false,$8,NOW())`,
      [idUsulan,tahun,bulan,periodeKey,kodePKM,totalBobot,indeksBeban,emailOperator]
    );
    for (const ind of indResult.rows) {
      await client.query(`INSERT INTO usulan_indikator (id_usulan,no_indikator,target,capaian,realisasi_rasio,bobot,nilai_terbobot,status) VALUES ($1,$2,0,0,0,$3,0,'Draft')`, [idUsulan,ind.no_indikator,parseInt(ind.bobot)||0]);
    }
    const allIndNos = indResult.rows.map(r => r.no_indikator);
    for (const pp of ppResult.rows) {
      const aksArr = parseIndikatorAkses(pp.indikator_akses || '');
      const ppStatus = aksArr.length === 0
        ? 'Menunggu'
        : (aksArr.some(n => allIndNos.includes(n)) ? 'Menunggu' : 'Selesai');
      await client.query(
        `INSERT INTO verifikasi_program (id_usulan,email_program,nama_program,nip_program,jabatan_program,indikator_akses,status,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
        [idUsulan, pp.email, pp.nama, pp.nip||null, pp.jabatan||null, pp.indikator_akses||'', ppStatus]
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

  const lockCheck = await pool.query('SELECT is_locked, status_global, kode_pkm, tahun, bulan FROM usulan_header WHERE id_usulan=$1', [idUsulan]);
  if (lockCheck.rows.length === 0) return err('Usulan tidak ditemukan');
  const { is_locked, status_global, kode_pkm, tahun, bulan } = lockCheck.rows[0];
  // Boleh edit kalau: tidak terkunci, ATAU status Ditolak (operator perbaiki)
  if (is_locked && status_global !== 'Ditolak' && status_global !== 'Ditolak Sebagian') return err('Usulan sudah terkunci dan tidak dapat diedit');

  // Cek periode input masih terbuka (termasuk jam)
  // Hanya berlaku untuk status Draft — saat Ditolak/Ditolak Sebagian,
  // Operator diizinkan memperbaiki di luar periode input agar tidak tertahan
  if (status_global === 'Draft') {
    const periodeErr = await cekPeriodeInput(pool, tahun, bulan);
    if (periodeErr) return periodeErr;
  }

  // Poin 4: Guard — saat Ditolak/Ditolak Sebagian, hanya boleh edit indikator yang bermasalah
  // Indikator yang tidak ada di penolakan_indikator (dari_kapus=true) tidak boleh diubah
  if (status_global === 'Ditolak' || status_global === 'Ditolak Sebagian') {
    const penolakanRes = await pool.query(
      `SELECT DISTINCT no_indikator FROM penolakan_indikator
       WHERE id_usulan=$1
         AND (
           (dibuat_oleh = 'Kapus' AND (aksi IS NULL OR (aksi != 'kapus-setuju' AND aksi != 'kapus-ok')))
           OR (dibuat_oleh IS NULL AND (aksi IS NULL OR (aksi != 'kapus-setuju' AND aksi != 'kapus-ok')))
           OR (dibuat_oleh = 'PP' AND aksi = 'tolak')
           OR (dibuat_oleh = 'Admin' AND aksi = 'tolak' AND responded_at IS NULL)
         )`,
      [idUsulan]
    ).catch(() => ({ rows: [] }));
    const bermasalahNos = penolakanRes.rows.map(r => parseInt(r.no_indikator));
    // Hanya blokir jika ada data penolakan (data baru). Data lama tanpa penolakan tetap bisa diedit.
    if (bermasalahNos.length > 0 && !bermasalahNos.includes(parseInt(noIndikator))) {
      return err(`Indikator #${noIndikator} sudah disetujui dan tidak perlu diperbaiki. Hanya indikator yang ditolak yang dapat diedit.`);
    }
  }

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
    'SELECT status_global, status_kapus, status_program, ditolak_oleh, konteks_penolakan, tahun, bulan FROM usulan_header WHERE id_usulan=$1',
    [idUsulan]
  );
  if (result.rows.length === 0) return err('Usulan tidak ditemukan');
  const { status_global: statusSaatIni, status_kapus, status_program, ditolak_oleh: ditolakOleh, konteks_penolakan, tahun, bulan } = result.rows[0];

  if (statusSaatIni !== 'Draft' && statusSaatIni !== 'Ditolak' && statusSaatIni !== 'Ditolak Sebagian')
    return err('Usulan tidak dapat disubmit pada status ini');

  // Cek periode input masih terbuka (termasuk jam) untuk submit pertama (Draft).
  // Untuk re-submit (Ditolak/Ditolak Sebagian), Operator tetap diizinkan
  // mengajukan ulang di luar periode agar proses perbaikan tidak tertahan.
  if (statusSaatIni === 'Draft') {
    const periodeSubmitErr = await cekPeriodeInput(pool, tahun, bulan);
    if (periodeSubmitErr) return periodeSubmitErr;
  }

  // Cek indikator yang belum ada bukti DULU sebelum reset apapun
  const indResult = await pool.query(
    'SELECT no_indikator, link_file FROM usulan_indikator WHERE id_usulan=$1', [idUsulan]
  );
  // Saat mode perbaiki (Ditolak), hanya cek bukti untuk indikator yang bermasalah saja
  let indToCheck = indResult.rows;
  const isDitolakMode = ['Ditolak','Ditolak Sebagian'].includes(statusSaatIni);
  if (isDitolakMode) {
    // Indikator yang perlu dicek buktinya = yang harus diperbaiki Operator
    // Yaitu: dari_kapus=true (Kapus tolak sendiri, atau Kapus benarkan PP/Admin)
    // aksi='tolak' dari PP/Admin yang sudah dibenarkan Kapus masuk ke sini
    // PENTING: aksi=NULL dari Kapus tidak cocok dengan NOT IN — harus handle NULL secara eksplisit
    const penolakanResult = await pool.query(
      `SELECT DISTINCT no_indikator FROM penolakan_indikator
       WHERE id_usulan=$1
         AND (
           (dibuat_oleh = 'Kapus' AND (aksi IS NULL OR (aksi != 'kapus-setuju' AND aksi != 'kapus-ok')))
           OR (dibuat_oleh IS NULL AND (aksi IS NULL OR (aksi != 'kapus-setuju' AND aksi != 'kapus-ok')))
           OR (dibuat_oleh = 'PP' AND aksi = 'tolak')
           OR (dibuat_oleh = 'Admin' AND aksi = 'tolak' AND responded_at IS NULL)
         )`,
      [idUsulan]
    ).catch(() => ({ rows: [] }));
    const bermasalahNos = penolakanResult.rows.map(r => r.no_indikator);
    if (bermasalahNos.length > 0) {
      indToCheck = indResult.rows.filter(r => bermasalahNos.includes(r.no_indikator));
    }
  }
  const missing = indToCheck.filter(r => !r.link_file || r.link_file.trim() === '');
  if (missing.length > 0 && !forceSubmit) {
    return confirm({
      isDitolak: isDitolakMode,
      missingCount: missing.length,
      missingNos: missing.map(r => r.no_indikator),
      message: `${missing.length} indikator belum ada file bukti. Tetap submit?`
    });
  }

  // Tentukan target dan lakukan reset berdasarkan kondisi penolakan
  const wasKapusDitolak = ditolakOleh === 'Kepala Puskesmas';
  const wasProgramDitolak = ditolakOleh === 'Pengelola Program';
  // 'KapusTolakAdmin': Kapus benarkan penolakan Admin → Operator perbaiki → kirim ke Kapus dulu
  const wasKapusTolakAdmin = ditolakOleh === 'Admin' && konteks_penolakan === 'KapusTolakAdmin';
  const wasAdminDitolak = ditolakOleh === 'Admin' && !wasKapusTolakAdmin;

  let targetStatus = 'Menunggu Kepala Puskesmas';

  if (['Ditolak','Ditolak Sebagian'].includes(statusSaatIni)) {
    if (wasKapusDitolak || wasKapusTolakAdmin) {
      // Kepala Puskesmas menolak (baik langsung maupun benarkan Admin) → reset semua stage header
      targetStatus = 'Menunggu Kepala Puskesmas';

      const sisaAdminCheck = await pool.query(
  `SELECT COUNT(*) as ct FROM penolakan_indikator
   WHERE id_usulan=$1 AND dibuat_oleh='Admin'`, [idUsulan]
).catch(() => ({ rows: [{ ct: 0 }] }));
const masihAdaAdmin = parseInt(sisaAdminCheck.rows[0]?.ct) > 0;

await pool.query(
  `UPDATE usulan_header SET
    status_kapus='Menunggu', status_program='Menunggu', status_final='Menunggu',
    kapus_approved_by=NULL, kapus_approved_at=NULL, kapus_catatan=NULL, kapus_catatan_umum=NULL,
    admin_approved_by=NULL, admin_approved_at=NULL,
    final_approved_by=NULL, final_approved_at=NULL,
    ditolak_oleh     = CASE WHEN $3 THEN 'Admin' ELSE 'Kepala Puskesmas' END,
    konteks_penolakan= CASE WHEN $3 THEN 'Admin' ELSE NULL END,
    operator_catatan=$2
   WHERE id_usulan=$1`, [idUsulan, catatanOperator || null, masihAdaAdmin]
);
      
      // Ambil email Kapus yang mencatat persetujuan
      // aksi='kapus-setuju' = data lama, aksi='kapus-ok' = data baru (Kapus sanggah PP)
      const kapusSetujuRows = await pool.query(
        `SELECT DISTINCT no_indikator, email_admin FROM penolakan_indikator WHERE id_usulan=$1 AND aksi IN ('kapus-setuju','kapus-ok')`,
        [idUsulan]
      ).catch(() => ({ rows: [] }));
      const kapusSetujuNos = kapusSetujuRows.rows.map(r => parseInt(r.no_indikator));
      const emailKapusSetuju = kapusSetujuRows.rows[0]?.email_admin || email;

      // FIX BUG 4: Hapus SEMUA baris penolakan untuk indikator yang Kapus setujui
      if (kapusSetujuNos.length > 0) {
        // Hapus baris PP lama (aksi=NULL/tolak/reset) untuk indikator yang Kapus setujui
        await pool.query(
          `DELETE FROM penolakan_indikator
           WHERE id_usulan=$1
             AND no_indikator=ANY($2)
             AND (aksi IS NULL OR aksi='tolak' OR aksi='reset')`,
          [idUsulan, kapusSetujuNos]
        ).catch(() => {});
        
        // Hapus juga baris Admin untuk indikator yang sama (jika ada)
        await pool.query(
          `DELETE FROM penolakan_indikator
           WHERE id_usulan=$1
             AND no_indikator=ANY($2)
             AND dibuat_oleh='Admin'`,
          [idUsulan, kapusSetujuNos]
        ).catch(() => {});
        
        // Hapus baris kapus-setuju / kapus-ok lama
        await pool.query(
          `DELETE FROM penolakan_indikator
           WHERE id_usulan=$1
             AND no_indikator=ANY($2)
             AND aksi IN ('kapus-setuju','kapus-ok')`,
          [idUsulan, kapusSetujuNos]
        ).catch(() => {});
        
        // Insert ulang baris untuk re-verifikasi PP
        for (const no of kapusSetujuNos) {
          await pool.query(
            `INSERT INTO penolakan_indikator (id_usulan, no_indikator, alasan, email_admin, email_program, aksi, dibuat_oleh)
             VALUES ($1, $2, 'Perlu verifikasi ulang (disetujui Kapus)', $3, $3, 'kapus-verif', 'Kapus')
             ON CONFLICT (id_usulan, no_indikator, email_program) DO UPDATE
               SET aksi='kapus-verif', alasan='Perlu verifikasi ulang (disetujui Kapus)', dibuat_oleh='Kapus'`,
            [idUsulan, no, emailKapusSetuju]
          ).catch(() => {});
        }

        // Reset VP yang pegang indikator kapus-setuju (termasuk yang sudah Selesai)
        const allVPKapus = await pool.query(
          `SELECT email_program, indikator_akses FROM verifikasi_program WHERE id_usulan=$1`, [idUsulan]
        );
        for (const vp of allVPKapus.rows) {
          const aksesArr = parseIndikatorAkses(vp.indikator_akses || '');
          const adaIrisan = aksesArr.length === 0
            ? kapusSetujuNos.length > 0
            : aksesArr.some(n => kapusSetujuNos.includes(n));
          if (adaIrisan) {
            await pool.query(
              `UPDATE verifikasi_program SET status='Menunggu', catatan=NULL, verified_at=NULL
               WHERE id_usulan=$1 AND LOWER(email_program)=LOWER($2)`,
              [idUsulan, vp.email_program]
            );
          }
        }
      } else {
        // Tidak ada kapus-setuju → cek apakah ada sisa penolakan PP yang perlu di-reset
        const piPPResetRows = await pool.query(
          `SELECT DISTINCT no_indikator FROM penolakan_indikator WHERE id_usulan=$1 AND dibuat_oleh='PP' AND aksi='tolak'`,
          [idUsulan]
        ).catch(() => ({ rows: [] }));
        const nomorPPReset = piPPResetRows.rows.map(r => parseInt(r.no_indikator));

        if (nomorPPReset.length > 0) {
          // Ada indikator PP yang perlu re-verif → reset VP yang punya irisan
          const allVPReset = await pool.query(
            `SELECT email_program, indikator_akses FROM verifikasi_program WHERE id_usulan=$1`, [idUsulan]
          );
          for (const vp of allVPReset.rows) {
            const aksesArr = parseIndikatorAkses(vp.indikator_akses || '');
            const adaIrisan = aksesArr.length === 0
              ? nomorPPReset.length > 0
              : aksesArr.some(n => nomorPPReset.includes(n));
            if (adaIrisan) {
              await pool.query(
                `UPDATE verifikasi_program SET status='Menunggu', catatan=NULL, verified_at=NULL
                 WHERE id_usulan=$1 AND LOWER(email_program)=LOWER($2)`,
                [idUsulan, vp.email_program]
              );
            }
          }
        } else {
          // Benar-benar tidak ada indikator PP → Kapus tolak semua, reset yang belum Selesai
          await pool.query(
            `UPDATE verifikasi_program SET status='Menunggu', catatan=NULL, verified_at=NULL
             WHERE id_usulan=$1 AND status != 'Selesai'`,
            [idUsulan]
          );
        }
      }
    } else if (wasProgramDitolak) {
      // Pengelola Program tolak → dikembalikan ke KaPus untuk re-verifikasi berjenjang
      targetStatus = 'Menunggu Kepala Puskesmas';
      await pool.query(
        `UPDATE usulan_header SET
          status_kapus='Menunggu', status_program='Menunggu', status_final='Menunggu',
          kapus_approved_by=NULL, kapus_approved_at=NULL, kapus_catatan=NULL, kapus_catatan_umum=NULL,
          admin_approved_by=NULL, admin_approved_at=NULL, admin_catatan=NULL,
          final_approved_by=NULL, final_approved_at=NULL
         WHERE id_usulan=$1`, [idUsulan]
      );

      const bermasalahRows = await pool.query(
        `SELECT DISTINCT no_indikator FROM penolakan_indikator
         WHERE id_usulan=$1
           AND (aksi IS NULL OR aksi='tolak' OR aksi='reset')
           AND no_indikator NOT IN (
             SELECT no_indikator FROM penolakan_indikator
             WHERE id_usulan=$1 AND aksi IN ('kapus-setuju','kapus-ok')
           )`,
        [idUsulan]
      ).catch(() => ({ rows: [] }));
      const bermasalahNos = bermasalahRows.rows.map(r => parseInt(r.no_indikator));

      const allVPSubmit = await pool.query(
        `SELECT email_program, indikator_akses FROM verifikasi_program WHERE id_usulan=$1`, [idUsulan]
      );
      for (const vp of allVPSubmit.rows) {
        const aksesArr = parseIndikatorAkses(vp.indikator_akses || '');
        const adaIrisan = aksesArr.length === 0
          ? bermasalahNos.length > 0
          : aksesArr.some(n => bermasalahNos.includes(n));
        if (adaIrisan) {
          await pool.query(
            `UPDATE verifikasi_program SET status='Menunggu', catatan=NULL, verified_at=NULL
             WHERE id_usulan=$1 AND LOWER(email_program)=LOWER($2)`,
            [idUsulan, vp.email_program]
          );
        }
      }
      // Fallback: jika tidak ada data penolakan (data lama/terhapus), reset semua VP
      if (bermasalahNos.length === 0) {
        await pool.query(
          `UPDATE verifikasi_program SET status='Menunggu', catatan=NULL, verified_at=NULL WHERE id_usulan=$1`,
          [idUsulan]
        );
      }
    } else if (wasAdminDitolak) {
      // Admin menolak → kembali ke Pengelola Program
      targetStatus = 'Menunggu Pengelola Program';
      await pool.query(
        `UPDATE usulan_header SET
          status_final='Menunggu',
          ditolak_oleh='Admin',
          konteks_penolakan='Admin',
          admin_approved_by=NULL, admin_approved_at=NULL, admin_catatan=NULL,
          final_approved_by=NULL, final_approved_at=NULL
         WHERE id_usulan=$1`, [idUsulan]
      );
      
      // Reset VP yang terkena indikator bermasalah
      const bermasalahAdminRows = await pool.query(
        `SELECT DISTINCT no_indikator FROM penolakan_indikator
         WHERE id_usulan=$1 AND dibuat_oleh='Admin'`,
        [idUsulan]
      ).catch(() => ({ rows: [] }));
      const bermasalahAdminNos = bermasalahAdminRows.rows.map(r => parseInt(r.no_indikator));
      
      if (bermasalahAdminNos.length > 0) {
        const allVPAdmin = await pool.query(
          `SELECT email_program, indikator_akses FROM verifikasi_program WHERE id_usulan=$1`, [idUsulan]
        );
        for (const vp of allVPAdmin.rows) {
          const aksesArr = parseIndikatorAkses(vp.indikator_akses || '');
          const adaIrisan = aksesArr.length === 0
            ? bermasalahAdminNos.length > 0
            : aksesArr.some(n => bermasalahAdminNos.includes(n));
          if (adaIrisan) {
            await pool.query(
              `UPDATE verifikasi_program SET status='Menunggu', catatan=NULL, verified_at=NULL
               WHERE id_usulan=$1 AND LOWER(email_program)=LOWER($2)`,
              [idUsulan, vp.email_program]
            );
          }
        }
      }
    }
  }

  // Update status_global dan is_locked
  await pool.query(
    `UPDATE usulan_header SET status_global=$1, is_locked=true WHERE id_usulan=$2`,
    [targetStatus, idUsulan]
  );

  const isResubmit = ['Ditolak','Ditolak Sebagian'].includes(statusSaatIni);
  const logDetailOperator = isResubmit
    ? `Diajukan ulang → ${targetStatus}${catatanOperator ? ' | Catatan: ' + catatanOperator : ''}`
    : 'Disubmit ke Kepala Puskesmas';
  await logAktivitas(pool, email, 'Operator', isResubmit ? 'Ajukan Ulang' : 'Submit', idUsulan, logDetailOperator);
  
  return ok({ message: isResubmit
    ? `Usulan berhasil diajukan ulang! Diteruskan ke ${targetStatus}.`
    : 'Usulan berhasil disubmit ke Kepala Puskesmas'
  });
}

module.exports = { buatUsulan, updateIndikator, hitungSPM, submitUsulan };