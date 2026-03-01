const { getPool, cors } = require('./db');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();

  const params = event.queryStringParameters || {};
  const idUsulan = params.id;
  if (!idUsulan) return { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*' }, body: 'ID diperlukan' };

  const pool = getPool();
  try {
    const hdrResult = await pool.query(
      `SELECT uh.*, p.nama_puskesmas FROM usulan_header uh
       LEFT JOIN master_puskesmas p ON uh.kode_pkm = p.kode_pkm
       WHERE uh.id_usulan = $1`, [idUsulan]
    );
    if (hdrResult.rows.length === 0) return { statusCode: 404, body: 'Tidak ditemukan' };
    const h = hdrResult.rows[0];

    const indResult = await pool.query(
      `SELECT ui.*, mi.nama_indikator FROM usulan_indikator ui
       LEFT JOIN master_indikator mi ON ui.no_indikator = mi.no_indikator
       WHERE ui.id_usulan = $1 ORDER BY ui.no_indikator`, [idUsulan]
    );

    const vpResult = await pool.query(
      `SELECT * FROM verifikasi_program WHERE id_usulan = $1 ORDER BY created_at`, [idUsulan]
    );

    const bulanNama = ['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    const bulan = bulanNama[h.bulan] || h.bulan;
    const indeksSPM = parseFloat(h.indeks_spm) || 0;
    const now = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
    const spmColor = indeksSPM >= 1 ? '#0d9488' : indeksSPM >= 0.75 ? '#f59e0b' : '#ef4444';
    const spmLabel = indeksSPM >= 1 ? 'MEMENUHI TARGET' : indeksSPM >= 0.75 ? 'MENDEKATI TARGET' : 'DI BAWAH TARGET';

    const indHtml = indResult.rows.map((ind, i) => {
      const rasio = parseFloat(ind.realisasi_rasio) || 0;
      const nilai = parseFloat(ind.nilai_terbobot) || 0;
      const barColor = rasio >= 1 ? '#0d9488' : rasio >= 0.75 ? '#f59e0b' : '#ef4444';
      return `<tr style="background:${i%2===0?'#f8fafc':'white'}">
        <td style="padding:7px 8px;text-align:center;font-weight:700;color:#64748b">${ind.no_indikator}</td>
        <td style="padding:7px 8px;font-size:11px">${ind.nama_indikator||''}</td>
        <td style="padding:7px 8px;text-align:center">${parseFloat(ind.target)||0}</td>
        <td style="padding:7px 8px;text-align:center">${parseFloat(ind.capaian)||0}</td>
        <td style="padding:7px 8px;text-align:center;font-weight:700;color:${barColor}">${(rasio*100).toFixed(1)}%</td>
        <td style="padding:7px 8px;text-align:center">${ind.bobot}</td>
        <td style="padding:7px 8px;text-align:center;font-weight:700;color:#0d9488">${nilai.toFixed(2)}</td>
        <td style="padding:7px 8px;text-align:center;font-size:10px">${ind.link_file?'✓ Ada':'-'}</td>
      </tr>`;
    }).join('');

    const vpHtml = vpResult.rows.map(v => {
      const c = v.status==='Selesai'?'#0d9488':v.status==='Ditolak'?'#ef4444':'#94a3b8';
      return `<tr>
        <td style="padding:6px 8px;font-weight:700;color:${c}">${v.status}</td>
        <td style="padding:6px 8px">${v.nama_program||v.email_program}</td>
        <td style="padding:6px 8px;font-size:10px;color:#64748b">${v.indikator_akses||'Semua'}</td>
        <td style="padding:6px 8px;font-size:10px;color:#64748b">${v.verified_at?new Date(v.verified_at).toLocaleDateString('id-ID'):'-'}</td>
        <td style="padding:6px 8px;font-size:10px;font-style:italic;color:#64748b">${v.catatan||''}</td>
      </tr>`;
    }).join('');

    const totalBobot = indResult.rows.reduce((s,r)=>s+(parseInt(r.bobot)||0),0);
    const totalNilai = indResult.rows.reduce((s,r)=>s+(parseFloat(r.nilai_terbobot)||0),0);

    const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<title>Laporan SPM - ${idUsulan}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; color: #1e293b; background: white; font-size: 12px; }
  @page { size: A4; margin: 15mm 12mm; }
  @media print {
    .no-print { display: none !important; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    table { page-break-inside: auto; }
    tr { page-break-inside: avoid; }
  }
  table { width: 100%; border-collapse: collapse; }
  th { background: #0d9488; color: white; padding: 8px; text-align: center; font-size: 11px; }
  .btn-print {
    position: fixed; top: 16px; right: 16px;
    background: #0d9488; color: white; border: none; border-radius: 8px;
    padding: 10px 20px; font-size: 13px; font-weight: 700; cursor: pointer;
    display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 12px rgba(13,148,136,0.4);
    z-index: 999;
  }
  .btn-print:hover { background: #0f766e; }
</style>
</head>
<body>
<button class="btn-print no-print" onclick="window.print()">⬇ Simpan PDF</button>

<!-- HEADER -->
<div style="background:#0f172a;color:white;padding:20px 24px;margin-bottom:16px;border-radius:0 0 12px 12px">
  <div style="font-size:10px;opacity:0.6;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px">Laporan Verifikasi Indeks SPM Puskesmas</div>
  <div style="font-size:18px;font-weight:700;margin-bottom:2px">${h.nama_puskesmas||h.kode_pkm}</div>
  <div style="font-size:12px;opacity:0.8;display:flex;gap:24px;margin-top:4px">
    <span>Periode: <strong>${bulan} ${h.tahun}</strong></span>
    <span>ID: <strong>${idUsulan}</strong></span>
    <span>Dicetak: <strong>${now}</strong></span>
  </div>
</div>

<!-- SKOR SPM -->
<div style="display:flex;gap:12px;margin-bottom:16px;align-items:stretch">
  <div style="background:white;border:2px solid ${spmColor};border-radius:12px;padding:16px 24px;text-align:center;min-width:180px">
    <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;margin-bottom:4px">Indeks SPM</div>
    <div style="font-size:36px;font-weight:800;color:${spmColor};font-family:monospace">${indeksSPM.toFixed(4)}</div>
    <div style="margin-top:8px;padding:3px 12px;background:${spmColor};color:white;border-radius:20px;font-size:10px;font-weight:700;display:inline-block">${spmLabel}</div>
  </div>
  <div style="flex:1;background:#f8fafc;border-radius:12px;padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:10px">
    <div><div style="font-size:10px;color:#94a3b8">Puskesmas</div><div style="font-weight:700">${h.nama_puskesmas||'-'}</div><div style="font-size:10px;color:#64748b">${h.kode_pkm}</div></div>
    <div><div style="font-size:10px;color:#94a3b8">Operator</div><div style="font-weight:700">${h.created_by||'-'}</div></div>
    <div><div style="font-size:10px;color:#94a3b8">Disetujui Kapus</div><div style="font-weight:700;color:${h.kapus_approved_by?'#0d9488':'#94a3b8'}">${h.kapus_approved_by||'Belum'}</div></div>
    <div><div style="font-size:10px;color:#94a3b8">Disetujui Admin</div><div style="font-weight:700;color:${h.admin_approved_by?'#0d9488':'#94a3b8'}">${h.admin_approved_by||'Belum'}</div></div>
  </div>
</div>

<!-- TABEL INDIKATOR -->
<div style="margin-bottom:16px">
  <div style="font-size:12px;font-weight:700;margin-bottom:8px;color:#0f172a">◆ Detail 12 Indikator SPM</div>
  <table>
    <thead>
      <tr>
        <th style="width:32px">No</th>
        <th style="text-align:left">Nama Indikator</th>
        <th>Target</th>
        <th>Capaian</th>
        <th>Rasio</th>
        <th>Bobot</th>
        <th>Nilai</th>
        <th>Bukti</th>
      </tr>
    </thead>
    <tbody>${indHtml}</tbody>
    <tfoot>
      <tr style="background:#0f172a;color:white;font-weight:700">
        <td colspan="5" style="padding:8px">TOTAL</td>
        <td style="padding:8px;text-align:center">${totalBobot}</td>
        <td style="padding:8px;text-align:center;color:#5eead4">${totalNilai.toFixed(2)}</td>
        <td></td>
      </tr>
    </tfoot>
  </table>
</div>

<!-- VERIFIKASI PROGRAM -->
${vpResult.rows.length ? `<div style="margin-bottom:16px">
  <div style="font-size:12px;font-weight:700;margin-bottom:8px;color:#0f172a">◆ Verifikasi Pengelola Program</div>
  <table>
    <thead><tr><th>Status</th><th style="text-align:left">Nama</th><th style="text-align:left">Indikator</th><th>Tanggal</th><th style="text-align:left">Catatan</th></tr></thead>
    <tbody>${vpHtml}</tbody>
  </table>
</div>` : ''}

<!-- FOOTER -->
<div style="margin-top:16px;padding-top:10px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:10px;color:#94a3b8">
  <span>SPM Puskesmas — Sistem Penilaian Mutu</span>
  <span>${idUsulan} | ${now}</span>
</div>

<script>window.onload = function(){ window.print(); }</script>
</body>
</html>`;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      },
      body: html
    };
  } catch (e) {
    console.error('Laporan error:', e);
    return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: e.message }) };
  }
};
