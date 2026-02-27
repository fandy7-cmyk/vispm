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
    if (method === 'DELETE') {
      const { idUsulan } = JSON.parse(event.body || '{}');
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
    `SELECT id FROM periode_input WHERE tahun=$1 AND bulan=$2 AND status='Aktif' AND tanggal_mulai<=CURRENT_DATE AND tanggal_selesai>=CURRENT_DATE`,
    [tahun, bulan]
  );
  if (periodeCheck.rows.length === 0) return err('Periode input untuk bulan ini sudah ditutup atau belum dibuka');
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
      await client.query(`INSERT INTO usulan_indikator (id_usulan,no_indikator,target,realisasi,realisasi_rasio,bobot,nilai_terbobot,status) VALUES ($1,$2,0,0,0,$3,0,'Draft')`, [idUsulan,ind.no_indikator,parseInt(ind.bobot)||0]);
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
  const lockCheck = await pool.query('SELECT is_locked FROM usulan_header WHERE id_usulan=$1', [idUsulan]);
  if (lockCheck.rows.length === 0) return err('Usulan tidak ditemukan');
  if (lockCheck.rows[0].is_locked) return err('Usulan sudah terkunci');
  
  // Rumus: rasio = capaian / target (max 1.00, 2 desimal)
  const t = parseFloat(target) || 0;
  const c = parseFloat(capaian) || 0;
  let rasio = 0;
  if (t > 0) { rasio = Math.round(Math.min(c / t, 1) * 100) / 100; }
  
  const bobotResult = await pool.query('SELECT bobot FROM usulan_indikator WHERE id_usulan=$1 AND no_indikator=$2', [idUsulan, noIndikator]);
  const bobot = bobotResult.rows.length > 0 ? parseInt(bobotResult.rows[0].bobot) || 0 : 0;
  // nilai = bobot * rasio
  const nilaiTerbobot = Math.round(rasio * bobot * 100) / 100;
  
  await pool.query(
    `UPDATE usulan_indikator SET target=$1, capaian=$2, realisasi_rasio=$3, nilai_terbobot=$4, catatan=$5, link_file=$6 WHERE id_usulan=$7 AND no_indikator=$8`,
    [t, c, rasio, nilaiTerbobot, catatan||'', linkFile||'', idUsulan, noIndikator]
  );
  await hitungSPM(pool, idUsulan);
  return ok({ message: 'Indikator berhasil diupdate', rasio, nilaiTerbobot });
}

async function hitungSPM(pool, idUsulan) {
  const r = await pool.query('SELECT realisasi_rasio, bobot, nilai_terbobot FROM usulan_indikator WHERE id_usulan=$1', [idUsulan]);
  let totalNilai = 0, totalBobot = 0;
  for (const row of r.rows) {
    totalNilai += parseFloat(row.nilai_terbobot) || 0;  // nilai = bobot * rasio
    totalBobot += parseInt(row.bobot) || 0;
  }
  // indeks_kinerja = total_nilai / total_bobot
  const indeksKinerja = totalBobot > 0 ? Math.round((totalNilai / totalBobot) * 10000) / 10000 : 0;
  const h = await pool.query('SELECT indeks_beban_kerja FROM usulan_header WHERE id_usulan=$1', [idUsulan]);
  const indeksBeban = h.rows.length > 0 ? parseFloat(h.rows[0].indeks_beban_kerja) || 0 : 0;
  // indeks_spm = indeks_kinerja * indeks_beban_kerja
  const indeksSPM = Math.round(indeksKinerja * indeksBeban * 100) / 100;
  await pool.query(
    `UPDATE usulan_header SET total_nilai=$1, indeks_kinerja_spm=$2, indeks_spm=$3 WHERE id_usulan=$4`,
    [totalNilai, indeksKinerja, indeksSPM, idUsulan]
  );
  return indeksSPM;
}

async function submitUsulan(pool, body) {
  const { idUsulan, email } = body;
  const indResult = await pool.query('SELECT no_indikator, link_file, capaian FROM usulan_indikator WHERE id_usulan=$1', [idUsulan]);
  const missing = indResult.rows.filter(r => !r.link_file || r.link_file.trim()==='');
  if (missing.length > 0) return err(`Data dukung belum lengkap. Indikator no. ${missing.map(r=>r.no_indikator).join(', ')} belum ada link file bukti.`);
  const result = await pool.query('SELECT status_global FROM usulan_header WHERE id_usulan=$1', [idUsulan]);
  if (result.rows.length===0) return err('Usulan tidak ditemukan');
  if (result.rows[0].status_global !== 'Draft') return err('Usulan sudah disubmit');
  await pool.query(`UPDATE usulan_header SET status_global='Menunggu Kapus' WHERE id_usulan=$1`, [idUsulan]);
  await logAktivitas(pool, email, 'Operator', 'Submit', idUsulan, 'Disubmit ke Kapus');
  return ok({ message: 'Usulan berhasil disubmit ke Kapus' });
}

async function approveKapus(pool, body) {
  const { idUsulan, email, catatan } = body;
  const result = await pool.query('SELECT status_global FROM usulan_header WHERE id_usulan=$1', [idUsulan]);
  if (result.rows.length===0) return err('Usulan tidak ditemukan');
  if (result.rows[0].status_global !== 'Menunggu Kapus') return err('Usulan tidak dalam status Menunggu Kapus');
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
  if (result.rows[0].status_global !== 'Menunggu Program') return err('Usulan tidak dalam status Menunggu Program');
  const vpCheck = await pool.query('SELECT id, status FROM verifikasi_program WHERE id_usulan=$1 AND email_program=$2', [idUsulan, email]);
  if (vpCheck.rows.length===0) return err('Anda tidak terdaftar sebagai pengelola program untuk usulan ini');
  if (vpCheck.rows[0].status==='Selesai') return err('Anda sudah memverifikasi usulan ini');
  await pool.query(`UPDATE verifikasi_program SET status='Selesai',catatan=$1,verified_at=NOW() WHERE id_usulan=$2 AND email_program=$3`, [catatan||'',idUsulan,email]);
  await logAktivitas(pool, email, 'Pengelola Program', 'Approve', idUsulan, catatan||'Disetujui');
  const allVP = await pool.query('SELECT status FROM verifikasi_program WHERE id_usulan=$1', [idUsulan]);
  const allDone = allVP.rows.every(r => r.status==='Selesai');
  if (allDone) {
    await pool.query(`UPDATE usulan_header SET status_program='Selesai',status_global='Menunggu Admin' WHERE id_usulan=$1`, [idUsulan]);
    return ok({ message: 'Semua pengelola program selesai — usulan diteruskan ke Admin.', allDone: true });
  }
  const remaining = allVP.rows.filter(r => r.status!=='Selesai').length;
  return ok({ message: `Verifikasi Anda disimpan. Masih menunggu ${remaining} pengelola program lain.`, allDone: false });
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
  if (role==='Pengelola Program') {
    await pool.query(`UPDATE verifikasi_program SET status='Menunggu',catatan=null,verified_at=null WHERE id_usulan=$1`, [idUsulan]);
  }
  await pool.query(
    `UPDATE usulan_header SET status_global='Ditolak',is_locked=false,
     status_kapus=CASE WHEN $2='Kapus' THEN 'Ditolak' ELSE status_kapus END,
     status_program=CASE WHEN $2='Pengelola Program' THEN 'Ditolak' ELSE status_program END
     WHERE id_usulan=$1`,
    [idUsulan, role]
  );
  await logAktivitas(pool, email, role, 'Reject', idUsulan, alasan||'Ditolak');
  return ok({ message: 'Usulan ditolak' });
}

async function logAktivitas(pool, email, role, aksi, idUsulan, detail) {
  try { await pool.query(`INSERT INTO log_aktivitas (timestamp,user_email,role,aksi,id_usulan,detail) VALUES (NOW(),$1,$2,$3,$4,$5)`, [email,role,aksi,idUsulan,detail]); }
  catch(e) { console.error('Log error:', e); }
}

function mapHeader(r) {
  const bn = ['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
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
    driveFolderUrl:r.drive_folder_url||'', driveFolderId:r.drive_folder_id||''
  };
}
