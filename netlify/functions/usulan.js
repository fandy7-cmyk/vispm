const { getPool, ok, err, cors } = require('./db');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();

  const pool = getPool();
  const method = event.httpMethod;
  const params = event.queryStringParameters || {};
  const path = params.action || '';

  try {
    // GET list usulan
    if (method === 'GET' && !path) {
      return await getUsulanList(pool, params);
    }

    // GET detail single usulan
    if (method === 'GET' && path === 'detail') {
      return await getUsulanDetail(pool, params.id);
    }

    // GET indikator of usulan
    if (method === 'GET' && path === 'indikator') {
      return await getIndikatorUsulan(pool, params.id);
    }

    const body = JSON.parse(event.body || '{}');

    // POST - buat usulan baru
    if (method === 'POST' && path === 'buat') {
      return await buatUsulan(pool, body);
    }

    // PUT - update indikator (target/realisasi)
    if (method === 'PUT' && path === 'indikator') {
      return await updateIndikator(pool, body);
    }

    // POST - submit usulan (dari Draft ke Menunggu Kapus)
    if (method === 'POST' && path === 'submit') {
      return await submitUsulan(pool, body);
    }

    // POST - approve Kapus
    if (method === 'POST' && path === 'approve-kapus') {
      return await approveKapus(pool, body);
    }

    // POST - approve Program
    if (method === 'POST' && path === 'approve-program') {
      return await approveProgram(pool, body);
    }

    // POST - approve Admin (final)
    if (method === 'POST' && path === 'approve-admin') {
      return await approveAdmin(pool, body);
    }

    // POST - reject
    if (method === 'POST' && path === 'reject') {
      return await rejectUsulan(pool, body);
    }

    // DELETE
    if (method === 'DELETE') {
      const { idUsulan } = body;
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
  let where = [];
  let qParams = [];
  let idx = 1;

  if (params.email_operator) {
    where.push(`uh.created_by = $${idx++}`);
    qParams.push(params.email_operator);
  }
  if (params.kode_pkm) {
    where.push(`uh.kode_pkm = $${idx++}`);
    qParams.push(params.kode_pkm);
  }
  if (params.tahun) {
    where.push(`uh.tahun = $${idx++}`);
    qParams.push(parseInt(params.tahun));
  }
  if (params.bulan && params.bulan !== 'semua') {
    where.push(`uh.bulan = $${idx++}`);
    qParams.push(parseInt(params.bulan));
  }
  if (params.status && params.status !== 'semua') {
    where.push(`uh.status_global = $${idx++}`);
    qParams.push(params.status);
  }
  // For kapus: only show their PKM
  if (params.status_kapus) {
    if (params.status_kapus === 'menunggu') {
      where.push(`uh.status_program = 'Menunggu'`);
    }
  }
  // For program: show awaiting program approval
  if (params.awaiting_program === 'true') {
    where.push(`uh.status_program = 'Menunggu'`);
    where.push(`uh.status_final != 'Ditolak'`);
  }
  // For admin: show awaiting final approval
  if (params.awaiting_admin === 'true') {
    where.push(`uh.status_final = 'Menunggu'`);
    where.push(`uh.status_program = 'Disetujui'`);
  }

  const whereStr = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

  const result = await pool.query(
    `SELECT uh.*, p.nama_puskesmas
     FROM usulan_header uh
     LEFT JOIN master_puskesmas p ON uh.kode_pkm = p.kode_pkm
     ${whereStr}
     ORDER BY uh.created_at DESC
     LIMIT 500`,
    qParams
  );

  return ok(result.rows.map(mapHeader));
}

async function getUsulanDetail(pool, idUsulan) {
  if (!idUsulan) return err('ID usulan diperlukan');
  const result = await pool.query(
    `SELECT uh.*, p.nama_puskesmas
     FROM usulan_header uh
     LEFT JOIN master_puskesmas p ON uh.kode_pkm = p.kode_pkm
     WHERE uh.id_usulan = $1`,
    [idUsulan]
  );
  if (result.rows.length === 0) return err('Usulan tidak ditemukan', 404);
  return ok(mapHeader(result.rows[0]));
}

async function getIndikatorUsulan(pool, idUsulan) {
  if (!idUsulan) return err('ID usulan diperlukan');
  const result = await pool.query(
    `SELECT ui.*, mi.nama_indikator
     FROM usulan_indikator ui
     LEFT JOIN master_indikator mi ON ui.no_indikator = mi.no_indikator
     WHERE ui.id_usulan = $1
     ORDER BY ui.no_indikator`,
    [idUsulan]
  );
  return ok(result.rows.map(r => ({
    id: r.id,
    no: r.no_indikator,
    nama: r.nama_indikator,
    target: parseFloat(r.target) || 0,
    realisasi: parseFloat(r.realisasi) || 0,
    realisasiRasio: parseFloat(r.realisasi_rasio) || 0,
    bobot: r.bobot || 0,
    nilaiTerbobot: parseFloat(r.nilai_terbobot) || 0,
    status: r.status || 'Draft',
    approvedBy: r.approved_by || '',
    approvedRole: r.approved_role || '',
    approvedAt: r.approved_at,
    catatan: r.catatan || '',
    linkFile: r.link_file || ''
  })));
}

async function buatUsulan(pool, body) {
  const { kodePKM, tahun, bulan, emailOperator } = body;
  if (!kodePKM || !tahun || !bulan || !emailOperator) {
    return err('Data tidak lengkap');
  }

  // Check periode aktif
  const today = new Date();
  const periodeCheck = await pool.query(
    `SELECT id FROM periode_input
     WHERE tahun=$1 AND bulan=$2 AND status='Aktif'
     AND tanggal_mulai <= CURRENT_DATE AND tanggal_selesai >= CURRENT_DATE`,
    [tahun, bulan]
  );
  if (periodeCheck.rows.length === 0) {
    return err('Periode input untuk bulan ini sudah ditutup atau belum dibuka');
  }

  const periodeKey = `${tahun}-${String(bulan).padStart(2, '0')}-01`;
  const idUsulan = `${kodePKM}-${tahun}-${String(bulan).padStart(2, '0')}`;

  // Check existing
  const existing = await pool.query('SELECT id_usulan FROM usulan_header WHERE id_usulan=$1', [idUsulan]);
  if (existing.rows.length > 0) return err(`Usulan ${idUsulan} sudah ada`);

  // Get indeks beban puskesmas
  const pkmResult = await pool.query('SELECT indeks_beban_kerja FROM master_puskesmas WHERE kode_pkm=$1', [kodePKM]);
  const indeksBeban = pkmResult.rows.length > 0 ? parseFloat(pkmResult.rows[0].indeks_beban_kerja) || 0 : 0;

  // Get active indikator
  const indResult = await pool.query(
    'SELECT no_indikator, nama_indikator, bobot FROM master_indikator WHERE aktif=true ORDER BY no_indikator'
  );
  const totalBobot = indResult.rows.reduce((s, r) => s + (parseInt(r.bobot) || 0), 0);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO usulan_header
       (id_usulan, tahun, bulan, periode_key, kode_pkm, total_nilai, total_bobot,
        indeks_kinerja_spm, indeks_beban_kerja, indeks_spm,
        status_program, status_final, status_global, is_locked, created_by, created_at)
       VALUES ($1,$2,$3,$4,$5,0,$6,0,$7,0,'Menunggu','Menunggu','Draft',false,$8,NOW())`,
      [idUsulan, tahun, bulan, periodeKey, kodePKM, totalBobot, indeksBeban, emailOperator]
    );

    for (const ind of indResult.rows) {
      await client.query(
        `INSERT INTO usulan_indikator
         (id_usulan, no_indikator, target, realisasi, realisasi_rasio, bobot, nilai_terbobot, status)
         VALUES ($1,$2,0,0,0,$3,0,'Draft')`,
        [idUsulan, ind.no_indikator, parseInt(ind.bobot) || 0]
      );
    }

    await client.query('COMMIT');
    return ok({ idUsulan, message: 'Usulan berhasil dibuat' });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function updateIndikator(pool, body) {
  const { idUsulan, noIndikator, target, realisasi, catatan, linkFile } = body;

  let rasio = 0;
  if (parseFloat(target) > 0) {
    rasio = parseFloat(realisasi) / parseFloat(target);
    if (rasio > 1) rasio = 1;
  }

  // Get bobot
  const bobotResult = await pool.query(
    'SELECT bobot FROM usulan_indikator WHERE id_usulan=$1 AND no_indikator=$2',
    [idUsulan, noIndikator]
  );
  const bobot = bobotResult.rows.length > 0 ? parseInt(bobotResult.rows[0].bobot) || 0 : 0;
  const nilaiTerbobot = rasio * bobot;

  await pool.query(
    `UPDATE usulan_indikator
     SET target=$1, realisasi=$2, realisasi_rasio=$3, nilai_terbobot=$4, catatan=$5, link_file=$6
     WHERE id_usulan=$7 AND no_indikator=$8`,
    [parseFloat(target) || 0, parseFloat(realisasi) || 0, rasio, nilaiTerbobot,
     catatan || '', linkFile || '', idUsulan, noIndikator]
  );

  // Recalculate totals
  await hitungSPM(pool, idUsulan);

  return ok({ message: 'Indikator berhasil diupdate', rasio, nilaiTerbobot });
}

async function hitungSPM(pool, idUsulan) {
  const indResult = await pool.query(
    'SELECT realisasi_rasio, bobot FROM usulan_indikator WHERE id_usulan=$1',
    [idUsulan]
  );
  let totalNilai = 0;
  let totalBobot = 0;
  for (const r of indResult.rows) {
    const b = parseInt(r.bobot) || 0;
    const rasio = parseFloat(r.realisasi_rasio) || 0;
    totalNilai += rasio * b;
    totalBobot += b;
  }
  const indeksKinerja = totalBobot > 0 ? totalNilai / totalBobot : 0;

  const hdrResult = await pool.query('SELECT indeks_beban_kerja FROM usulan_header WHERE id_usulan=$1', [idUsulan]);
  const indeksBeban = hdrResult.rows.length > 0 ? parseFloat(hdrResult.rows[0].indeks_beban_kerja) || 0 : 0;
  const indeksSPM = indeksKinerja * indeksBeban;

  await pool.query(
    `UPDATE usulan_header SET total_nilai=$1, indeks_kinerja_spm=$2, indeks_spm=$3 WHERE id_usulan=$4`,
    [totalNilai, indeksKinerja, indeksSPM, idUsulan]
  );
  return indeksSPM;
}

async function submitUsulan(pool, body) {
  const { idUsulan, email } = body;
  // Check status
  const result = await pool.query('SELECT status_global FROM usulan_header WHERE id_usulan=$1', [idUsulan]);
  if (result.rows.length === 0) return err('Usulan tidak ditemukan');
  if (result.rows[0].status_global !== 'Draft') return err('Usulan sudah disubmit');

  await pool.query(
    `UPDATE usulan_header SET status_global='Menunggu Kapus' WHERE id_usulan=$1`,
    [idUsulan]
  );
  return ok({ message: 'Usulan berhasil disubmit ke Kapus' });
}

async function approveKapus(pool, body) {
  const { idUsulan, email, catatan } = body;
  const result = await pool.query('SELECT status_global FROM usulan_header WHERE id_usulan=$1', [idUsulan]);
  if (result.rows.length === 0) return err('Usulan tidak ditemukan');

  await pool.query(
    `UPDATE usulan_header
     SET status_program='Disetujui',
         status_global='Menunggu Program',
         final_approved_by=$1,
         final_approved_at=NOW()
     WHERE id_usulan=$2`,
    [email, idUsulan]
  );

  // Log
  await logAktivitas(pool, email, 'Kapus', 'Approve', idUsulan, catatan || 'Disetujui Kapus');

  return ok({ message: 'Usulan disetujui Kapus' });
}

async function approveProgram(pool, body) {
  const { idUsulan, email, catatan } = body;
  const result = await pool.query('SELECT status_program FROM usulan_header WHERE id_usulan=$1', [idUsulan]);
  if (result.rows.length === 0) return err('Usulan tidak ditemukan');
  if (result.rows[0].status_program !== 'Disetujui') return err('Usulan belum disetujui Kapus');

  await pool.query(
    `UPDATE usulan_header
     SET status_final='Disetujui',
         status_global='Menunggu Admin'
     WHERE id_usulan=$1`,
    [idUsulan]
  );

  await logAktivitas(pool, email, 'Pengelola Program', 'Approve', idUsulan, catatan || 'Disetujui Program');
  return ok({ message: 'Usulan disetujui Program' });
}

async function approveAdmin(pool, body) {
  const { idUsulan, email, catatan } = body;
  const result = await pool.query('SELECT status_final FROM usulan_header WHERE id_usulan=$1', [idUsulan]);
  if (result.rows.length === 0) return err('Usulan tidak ditemukan');
  if (result.rows[0].status_final !== 'Disetujui') return err('Usulan belum disetujui Program');

  await pool.query(
    `UPDATE usulan_header
     SET status_global='Selesai', is_locked=true, final_approved_by=$1, final_approved_at=NOW()
     WHERE id_usulan=$2`,
    [email, idUsulan]
  );

  await logAktivitas(pool, email, 'Admin', 'Approve Final', idUsulan, catatan || 'Selesai');
  return ok({ message: 'Usulan selesai diverifikasi' });
}

async function rejectUsulan(pool, body) {
  const { idUsulan, email, role, alasan } = body;

  await pool.query(
    `UPDATE usulan_header SET status_global='Ditolak', is_locked=false WHERE id_usulan=$1`,
    [idUsulan]
  );

  await logAktivitas(pool, email, role, 'Reject', idUsulan, alasan || 'Ditolak');
  return ok({ message: 'Usulan ditolak' });
}

async function logAktivitas(pool, email, role, aksi, idUsulan, detail) {
  try {
    await pool.query(
      `INSERT INTO log_aktivitas (timestamp, user_email, role, aksi, id_usulan, detail)
       VALUES (NOW(), $1, $2, $3, $4, $5)`,
      [email, role, aksi, idUsulan, detail]
    );
  } catch (e) {
    console.error('Log error:', e);
  }
}

function mapHeader(r) {
  function getNextStep(row) {
    const sg = row.status_global || '';
    if (sg === 'Selesai') return 'Selesai';
    if (sg === 'Ditolak') return 'Ditolak';
    if (sg === 'Draft') return 'Menunggu Kapus';
    if (sg === 'Menunggu Kapus') return 'Menunggu Kapus';
    if (sg === 'Menunggu Program') return 'Menunggu Program';
    if (sg === 'Menunggu Admin') return 'Menunggu Admin';
    return sg;
  }

  const bulanNama = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  return {
    idUsulan: r.id_usulan,
    tahun: r.tahun,
    bulan: r.bulan,
    namaBulan: bulanNama[r.bulan] || '',
    periodeKey: r.periode_key,
    kodePKM: r.kode_pkm,
    namaPKM: r.nama_puskesmas || r.kode_pkm,
    totalNilai: parseFloat(r.total_nilai) || 0,
    totalBobot: parseFloat(r.total_bobot) || 0,
    indeksKinerja: parseFloat(r.indeks_kinerja_spm) || 0,
    indeksBeban: parseFloat(r.indeks_beban_kerja) || 0,
    indeksSPM: parseFloat(r.indeks_spm) || 0,
    statusProgram: r.status_program || 'Menunggu',
    statusFinal: r.status_final || 'Menunggu',
    statusGlobal: r.status_global || 'Draft',
    isLocked: r.is_locked || false,
    createdBy: r.created_by || '',
    createdAt: r.created_at,
    finalApprovedBy: r.final_approved_by || '',
    finalApprovedAt: r.final_approved_at,
    nextStep: getNextStep(r)
  };
}
