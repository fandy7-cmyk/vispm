const { getPool, ok, err, cors } = require('./db');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();

  const pool = getPool();
  const params = event.queryStringParameters || {};

  try {
    let where = [];
    let qParams = [];
    let idx = 1;

    if (params.tahun) {
      where.push(`uh.tahun = $${idx++}`);
      qParams.push(parseInt(params.tahun));
    }
    if (params.bulan && params.bulan !== 'semua') {
      where.push(`uh.bulan = $${idx++}`);
      qParams.push(parseInt(params.bulan));
    }
    if (params.kode_pkm && params.kode_pkm !== 'semua') {
      where.push(`uh.kode_pkm = $${idx++}`);
      qParams.push(params.kode_pkm);
    }
    if (params.status && params.status !== 'semua') {
      where.push(`uh.status_global = $${idx++}`);
      qParams.push(params.status);
    }
    if (params.email_operator) {
      where.push(`uh.created_by = $${idx++}`);
      qParams.push(params.email_operator);
    }

    const whereStr = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

    const [dataResult, countResult] = await Promise.all([
      pool.query(
        `SELECT uh.*, p.nama_puskesmas,
          (SELECT COUNT(*) FROM usulan_indikator ui WHERE ui.id_usulan=uh.id_usulan) as total_indikator
         FROM usulan_header uh
         LEFT JOIN master_puskesmas p ON uh.kode_pkm = p.kode_pkm
         ${whereStr}
         ORDER BY uh.tahun DESC, uh.bulan DESC, p.nama_puskesmas
         LIMIT 1000`,
        qParams
      ),
      pool.query(
        `SELECT
          COUNT(*) as total,
          COUNT(*) FILTER(WHERE status_global='Selesai') as selesai,
          COUNT(*) FILTER(WHERE status_global NOT IN ('Selesai','Ditolak')) as pending,
          AVG(NULLIF(indeks_spm,0)) as rata_spm
         FROM usulan_header uh ${whereStr}`,
        qParams
      )
    ]);

    const bulanNama = ['','Januari','Februari','Maret','April','Mei','Juni',
      'Juli','Agustus','September','Oktober','November','Desember'];
    const s = countResult.rows[0];

    const data = dataResult.rows.map((r, i) => ({
      no: i + 1,
      idUsulan: r.id_usulan,
      kodePKM: r.kode_pkm,
      namaPKM: r.nama_puskesmas || r.kode_pkm,
      tahun: r.tahun,
      bulan: r.bulan,
      namaBulan: bulanNama[r.bulan] || '',
      totalIndikator: parseInt(r.total_indikator) || 0,
      indeksSPM: parseFloat(r.indeks_spm) ? parseFloat(r.indeks_spm).toFixed(2) : '0',
      statusGlobal: r.status_global || 'Draft',
      createdBy: r.created_by || '',
      createdAt: r.created_at,
      finalApprovedBy: r.final_approved_by || '',
      finalApprovedAt: r.final_approved_at
    }));

    return ok({
      data,
      summary: {
        total: parseInt(s.total) || 0,
        selesai: parseInt(s.selesai) || 0,
        pending: parseInt(s.pending) || 0,
        rataSPM: parseFloat(s.rata_spm) ? parseFloat(s.rata_spm).toFixed(2) : '0'
      }
    });
  } catch (e) {
    console.error('Laporan error:', e);
    return err('Error: ' + e.message, 500);
  }
};
