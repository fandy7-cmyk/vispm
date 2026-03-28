const { getPool, ok, err, cors } = require('./db');

function isValidText(str) {
  return str && /[a-zA-Z0-9\u00C0-\u024F\u4e00-\u9fff]/.test(str.trim());
}
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
  const isDitolak = ['Ditolak','Ditolak Sebagian'].includes(r.status_global||'');
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
    kapusCatatan:r.kapus_catatan||'', kapusCatatanUmum:r.kapus_catatan_umum||'', operatorCatatan:r.operator_catatan||'',
    adminApprovedBy:r.admin_approved_by||'',
    adminApprovedAt:r.admin_approved_at, adminCatatan:r.admin_catatan||'',
    finalApprovedBy:r.final_approved_by||'', finalApprovedAt:r.final_approved_at,
    driveFolderUrl:r.drive_folder_url||'', driveFolderId:r.drive_folder_id||'',
    ditolakOleh: isDitolak ? (r.ditolak_oleh || ditolakOleh) : (r.ditolak_oleh || null),
    konteksPenolakan: r.konteks_penolakan || null,
    alasanTolak
  };
}

async function adminResetUsulan(pool, body) {
  const { idUsulan, email } = body;
  if (!idUsulan) return err('idUsulan diperlukan');
  await pool.query(
    `UPDATE usulan_header SET is_locked=false, status_global='Draft',
     status_kapus='Menunggu', status_program='Menunggu', status_final='Menunggu',
     ditolak_oleh=NULL, konteks_penolakan=NULL,
     kapus_approved_by=NULL, admin_approved_by=NULL WHERE id_usulan=$1`, [idUsulan]
  );
  await pool.query(`UPDATE verifikasi_program SET status='Menunggu', verified_at=NULL, last_verified_at=NULL WHERE id_usulan=$1`, [idUsulan]);
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
    `UPDATE verifikasi_program SET status='Selesai', verified_at=NOW(), last_verified_at=NOW(),
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
module.exports = { isValidText, parseIndikatorAkses, logAktivitas, mapHeader, adminResetUsulan, restoreVerifStatus, getLogAktivitas };
