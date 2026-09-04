const { getPool, ok, err, cors } = require('./db');
const { validateSession } = require('./middleware');
const { getUsulanList, getNotifCount, getUsulanDetail, getIndikatorUsulan, getProgramVerifStatus, saveDriveFolder } = require('./usulan-query');
const { buatUsulan, updateIndikator, submitUsulan } = require('./usulan-input');
const { verifKapus, verifProgram, verifAdmin, rejectUsulan, getPenolakanIndikator, respondPenolakan } = require('./usulan-verifikasi');
const { parseIndikatorAkses, logAktivitas, mapHeader, adminResetUsulan, restoreVerifStatus, getLogAktivitas } = require('./usulan-helpers');

let _migrated = false;
async function runMigrations(pool) {
  if (_migrated) return;
  _migrated = true; 

  
  await Promise.all([
    pool.query(`ALTER TABLE verifikasi_program ADD COLUMN IF NOT EXISTS nip_program VARCHAR(50)`).catch(()=>{}),
    pool.query(`ALTER TABLE verifikasi_program ADD COLUMN IF NOT EXISTS jabatan_program TEXT`).catch(()=>{}),
    pool.query(`ALTER TABLE verifikasi_program ADD COLUMN IF NOT EXISTS sanggahan TEXT`).catch(()=>{}),
    pool.query(`ALTER TABLE verifikasi_program ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ`).catch(()=>{}),
    pool.query(`ALTER TABLE usulan_header ADD COLUMN IF NOT EXISTS ditolak_oleh VARCHAR(50)`).catch(()=>{}),
    pool.query(`ALTER TABLE usulan_header ADD COLUMN IF NOT EXISTS konteks_penolakan VARCHAR(50)`).catch(()=>{}),
    pool.query(`ALTER TABLE usulan_header ADD COLUMN IF NOT EXISTS kapus_catatan TEXT`).catch(()=>{}),
    pool.query(`ALTER TABLE usulan_header ADD COLUMN IF NOT EXISTS kapus_catatan_umum TEXT`).catch(()=>{}),
    pool.query(`ALTER TABLE usulan_header ADD COLUMN IF NOT EXISTS kapus_approved_by VARCHAR(200)`).catch(()=>{}),
    pool.query(`ALTER TABLE usulan_header ADD COLUMN IF NOT EXISTS kapus_approved_at TIMESTAMPTZ`).catch(()=>{}),
    pool.query(`ALTER TABLE usulan_header ADD COLUMN IF NOT EXISTS admin_catatan TEXT`).catch(()=>{}),
    pool.query(`ALTER TABLE usulan_header ADD COLUMN IF NOT EXISTS admin_approved_by VARCHAR(200)`).catch(()=>{}),
    pool.query(`ALTER TABLE usulan_header ADD COLUMN IF NOT EXISTS admin_approved_at TIMESTAMPTZ`).catch(()=>{}),
    pool.query(`ALTER TABLE usulan_header ADD COLUMN IF NOT EXISTS operator_catatan TEXT`).catch(()=>{}),
    
    
    pool.query(`ALTER TABLE usulan_header ADD COLUMN IF NOT EXISTS reverif_count INT DEFAULT 0`).catch(()=>{}),
    pool.query(`ALTER TABLE usulan_header ADD COLUMN IF NOT EXISTS waktu_selesai TIMESTAMPTZ`).catch(()=>{}),
    pool.query(`ALTER TABLE usulan_header ADD COLUMN IF NOT EXISTS penandatangan_snapshot JSONB`).catch(()=>{}),
    pool.query(`CREATE TABLE IF NOT EXISTS penolakan_indikator (
      id SERIAL PRIMARY KEY,
      id_usulan VARCHAR(50) NOT NULL,
      no_indikator INT NOT NULL,
      alasan TEXT NOT NULL,
      email_admin VARCHAR(200) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      email_program VARCHAR(200) NOT NULL DEFAULT '',
      aksi VARCHAR(20),
      catatan_program TEXT,
      responded_at TIMESTAMPTZ
    )`).catch(()=>{}),
  ]);

  
  
  await pool.query(
    `UPDATE penolakan_indikator SET email_program = email_admin
     WHERE email_program IS NULL OR email_program = ''`
  ).catch(()=>{});

  
  
  await pool.query(`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='penolakan_indikator_id_usulan_no_indikator_key') THEN
        ALTER TABLE penolakan_indikator DROP CONSTRAINT penolakan_indikator_id_usulan_no_indikator_key;
      END IF;
    END $$;
  `).catch(()=>{});

  
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='penolakan_indikator_id_usulan_no_indikator_email_program_key') THEN
        ALTER TABLE penolakan_indikator ADD CONSTRAINT penolakan_indikator_id_usulan_no_indikator_email_program_key
          UNIQUE(id_usulan, no_indikator, email_program);
      END IF;
    END $$;
  `).catch(()=>{});

  
  await pool.query(
    `ALTER TABLE penolakan_indikator ALTER COLUMN email_program SET NOT NULL`
  ).catch(()=>{});

  
  await pool.query(
    `ALTER TABLE penolakan_indikator ADD COLUMN IF NOT EXISTS dibuat_oleh VARCHAR(20)`
  ).catch(()=>{});

  
  await pool.query(
    `UPDATE penolakan_indikator SET dibuat_oleh='Kapus'
     WHERE dibuat_oleh IS NULL AND aksi IN ('kapus-setuju','kapus-verif')`
  ).catch(()=>{});
  await pool.query(
    `UPDATE penolakan_indikator SET dibuat_oleh='PP'
     WHERE dibuat_oleh IS NULL AND aksi='tolak' AND email_admin != email_program`
  ).catch(()=>{});
  await pool.query(
    `UPDATE penolakan_indikator SET dibuat_oleh='Admin'
     WHERE dibuat_oleh IS NULL AND aksi='tolak'`
  ).catch(()=>{});
  
  await pool.query(
    `UPDATE penolakan_indikator SET dibuat_oleh='Kapus' WHERE dibuat_oleh IS NULL`
  ).catch(()=>{});

  // Backfill satu kali: usulan lama yang sudah Selesai tapi belum punya snapshot
  // pejabat penandatangan (dibuat sebelum fitur ini ada) dibekukan pakai data
  // pejabat_penandatangan yang AKTIF SEKARANG — supaya kalau nanti pejabatnya
  // diganti, laporan lama ini tidak ikut berubah lagi.
  await pool.query(`
    UPDATE usulan_header
    SET penandatangan_snapshot = (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'jabatan', jabatan, 'nama', nama, 'nip', nip, 'tanda_tangan', tanda_tangan
      )), '[]'::jsonb)
      FROM pejabat_penandatangan
    )
    WHERE status_global = 'Selesai' AND penandatangan_snapshot IS NULL
  `).catch(()=>{});

}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();

  const _authErr = await validateSession(event);
  if (_authErr) return _authErr;
  const pool = getPool();
  const method = event.httpMethod;
  const params = event.queryStringParameters || {};
  const path = params.action || '';

  // Notif count = query ringan buat badge, tidak butuh kolom hasil migrasi apapun.
  // Ditaruh sebelum runMigrations biar tidak ikut nunggu ~20 query ALTER/UPDATE saat cold start.
  if (method === 'GET' && path === 'notif-count') {
    try { return await getNotifCount(pool, params); }
    catch (e) { console.error('Notif count error:', e); return err('Error: ' + e.message, 500); }
  }

  try {
    await runMigrations(pool);
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
      const { idUsulan } = body; 
      if (!idUsulan) return err('idUsulan diperlukan');
      
      await pool.query('DELETE FROM log_aktivitas WHERE id_usulan=$1', [idUsulan]).catch(()=>{});
      await pool.query('DELETE FROM penolakan_indikator WHERE id_usulan=$1', [idUsulan]).catch(()=>{});
      await pool.query('DELETE FROM verifikasi_program WHERE id_usulan=$1', [idUsulan]).catch(()=>{});
      await pool.query('DELETE FROM usulan_indikator WHERE id_usulan=$1', [idUsulan]).catch(()=>{});
      await pool.query('DELETE FROM usulan_header WHERE id_usulan=$1', [idUsulan]);
      return ok({ message: 'Usulan berhasil dihapus' });
    }
    return err('Action tidak ditemukan', 404);
  } catch (e) {
    console.error('Usulan error:', e);
    return err('Error: ' + e.message, 500);
  }
};