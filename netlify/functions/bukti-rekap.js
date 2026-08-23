const { getPool, ok, err, cors } = require('./db');
const { validateSession } = require('./middleware');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();
  const _authErr = await validateSession(event);
  if (_authErr) return _authErr;

  const pool = getPool();
  const params = event.queryStringParameters || {};

  try {
    const noIndikator = parseInt(params.noIndikator);
    const tahun       = parseInt(params.tahun);
    const bulanFrom   = parseInt(params.bulanFrom) || 1;
    const bulanTo     = parseInt(params.bulanTo)   || 12;
    const kodePkmArr  = (params.kodePkm || '').split(',').map(s => s.trim()).filter(Boolean);

    if (!noIndikator) return err('noIndikator diperlukan');
    if (!tahun)        return err('tahun diperlukan');
    if (bulanFrom > bulanTo) return err('Bulan Dari harus <= Bulan Sampai');

    let query = `
      SELECT ui.link_file, ui.no_indikator, uh.id_usulan, uh.kode_pkm, uh.bulan, uh.tahun,
             COALESCE(p.nama_puskesmas, uh.kode_pkm) AS nama_puskesmas
      FROM usulan_indikator ui
      JOIN usulan_header uh ON ui.id_usulan = uh.id_usulan
      LEFT JOIN master_puskesmas p ON uh.kode_pkm = p.kode_pkm
      WHERE ui.no_indikator = $1 AND uh.tahun = $2 AND uh.bulan BETWEEN $3 AND $4
    `;
    const qParams = [noIndikator, tahun, bulanFrom, bulanTo];

    if (kodePkmArr.length > 0) {
      query += ` AND uh.kode_pkm = ANY($5)`;
      qParams.push(kodePkmArr);
    }
    query += ` ORDER BY nama_puskesmas, uh.bulan`;

    const result = await pool.query(query, qParams);

    const bulanNamaArr = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

    const files = [];
    const usulanSet = new Set();

    for (const r of result.rows) {
      if (!r.link_file) continue;

      
      
      let links = [];
      try {
        const parsed = JSON.parse(r.link_file);
        links = Array.isArray(parsed) ? parsed : [r.link_file];
      } catch (e) {
        links = [r.link_file];
      }

      links.forEach((f, idx) => {
        const url = typeof f === 'string' ? f : f?.url;
        if (!url) return;

        let name = typeof f === 'string' ? null : f?.name;
        if (!name || name === 'File') {
          const urlClean = url.split('?')[0];
          name = urlClean.substring(urlClean.lastIndexOf('/') + 1) || `file_${idx}`;
        }

        files.push({
          idUsulan: r.id_usulan,
          kodePkm: r.kode_pkm,
          namaPkm: r.nama_puskesmas,
          tahun: r.tahun,
          bulan: r.bulan,
          namaBulan: bulanNamaArr[r.bulan] || '',
          fileName: name,
          fileUrl: url,
        });
      });

      usulanSet.add(r.id_usulan);
    }

    return ok({
      totalFile: files.length,
      totalUsulan: usulanSet.size,
      files,
    });
  } catch (e) {
    console.error('Bukti-rekap error:', e);
    return err('Error: ' + e.message, 500);
  }
};
