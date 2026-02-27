const { getPool, cors } = require('./db');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();

  const params = event.queryStringParameters || {};
  const idUsulan = params.id;

  if (!idUsulan) {
    return { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'ID usulan diperlukan' }) };
  }

  const pool = getPool();

  try {
    // Get usulan detail
    const hdrResult = await pool.query(
      `SELECT uh.*, p.nama_puskesmas FROM usulan_header uh
       LEFT JOIN master_puskesmas p ON uh.kode_pkm = p.kode_pkm
       WHERE uh.id_usulan = $1`,
      [idUsulan]
    );
    if (hdrResult.rows.length === 0) {
      return { statusCode: 404, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Usulan tidak ditemukan' }) };
    }
    const h = hdrResult.rows[0];

    // Get indikator
    const indResult = await pool.query(
      `SELECT ui.*, mi.nama_indikator FROM usulan_indikator ui
       LEFT JOIN master_indikator mi ON ui.no_indikator = mi.no_indikator
       WHERE ui.id_usulan = $1 ORDER BY ui.no_indikator`,
      [idUsulan]
    );

    // Get verifikasi program
    const vpResult = await pool.query(
      `SELECT * FROM verifikasi_program WHERE id_usulan = $1 ORDER BY created_at`,
      [idUsulan]
    );

    const bulanNama = ['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    const bulan = bulanNama[h.bulan] || h.bulan;
    const indeksSPM = parseFloat(h.indeks_spm) || 0;
    const indeksKinerja = parseFloat(h.indeks_kinerja_spm) || 0;
    const indeksBeban = parseFloat(h.indeks_beban_kerja) || 0;
    const now = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });

    const spmColor = indeksSPM >= 1 ? '#0d9488' : indeksSPM >= 0.75 ? '#f59e0b' : '#ef4444';
    const spmLabel = indeksSPM >= 1 ? 'MEMENUHI TARGET' : indeksSPM >= 0.75 ? 'MENDEKATI TARGET' : 'DI BAWAH TARGET';

    const indHtml = indResult.rows.map((ind, i) => {
      const rasio = parseFloat(ind.realisasi_rasio) || 0;
      const nilai = parseFloat(ind.nilai_terbobot) || 0;
      const barW = Math.round(rasio * 100);
      const barColor = rasio >= 1 ? '#0d9488' : rasio >= 0.75 ? '#f59e0b' : '#ef4444';
      return `<tr style="background:${i%2===0?'#f8fafc':'white'}">
        <td style="padding:8px 10px;font-weight:700;color:#475569;font-family:monospace;width:32px">${ind.no_indikator}</td>
        <td style="padding:8px 10px;font-size:11.5px;max-width:240px">${ind.nama_indikator}</td>
        <td style="padding:8px 10px;text-align:center">${parseFloat(ind.target)||0}</td>
        <td style="padding:8px 10px;text-align:center">${parseFloat(ind.capaian)||0}</td>
        <td style="padding:8px 10px;text-align:center">
          <div style="display:flex;align-items:center;gap:6px">
            <div style="flex:1;height:6px;background:#e2e8f0;border-radius:3px">
              <div style="width:${barW}%;height:100%;background:${barColor};border-radius:3px"></div>
            </div>
            <span style="font-size:11px;font-weight:700;color:${barColor};min-width:36px">${(rasio*100).toFixed(1)}%</span>
          </div>
        </td>
        <td style="padding:8px 10px;text-align:center">${ind.bobot}</td>
        <td style="padding:8px 10px;text-align:center;font-weight:700;color:#0d9488">${nilai.toFixed(2)}</td>
        <td style="padding:8px 10px;text-align:center">${ind.link_file ? `<a href="${ind.link_file}" style="color:#0d9488;font-size:11px">Lihat</a>` : '-'}</td>
      </tr>`;
    }).join('');

    const vpHtml = vpResult.rows.map(v => `
      <div style="padding:8px 12px;background:${v.status==='Selesai'?'#e6fffa':'#f8fafc'};border-radius:6px;border:1px solid ${v.status==='Selesai'?'#99f6e4':'#e2e8f0'}">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:12px;font-weight:700;color:${v.status==='Selesai'?'#0d9488':'#64748b'}">${v.nama_program||v.email_program}</span>
          <span style="font-size:10px;padding:2px 8px;border-radius:10px;background:${v.status==='Selesai'?'#0d9488':'#94a3b8'};color:white">${v.status}</span>
        </div>
        <div style="font-size:10.5px;color:#94a3b8;margin-top:2px">Indikator: ${v.indikator_akses||'Semua'}</div>
      </div>`).join('');

    const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<title>Laporan SPM - ${idUsulan}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; background: white; font-size: 13px; }
  @page { margin: 20mm 15mm; }
  @media print {
    .no-print { display: none !important; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
  .print-btn {
    position: fixed; top: 20px; right: 20px; padding: 10px 20px;
    background: #0d9488; color: white; border: none; border-radius: 8px;
    cursor: pointer; font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 8px;
  }
</style>
</head>
<body>
<button class="print-btn no-print" onclick="window.print()">🖨️ Cetak / Download PDF</button>

<!-- HEADER -->
<div style="background:linear-gradient(135deg,#0f172a,#0d9488,#06b6d4);padding:28px 32px;color:white;border-radius:0 0 16px 16px;margin-bottom:24px">
  <div style="display:flex;justify-content:space-between;align-items:flex-start">
    <div>
      <div style="font-size:11px;opacity:0.75;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Laporan Verifikasi</div>
      <h1 style="font-size:22px;font-weight:800;margin-bottom:4px">Indeks SPM Puskesmas</h1>
      <div style="font-size:14px;opacity:0.9">${h.nama_puskesmas} — ${bulan} ${h.tahun}</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:11px;opacity:0.7;margin-bottom:4px">ID Usulan</div>
      <div style="font-family:monospace;font-size:13px;font-weight:700;background:rgba(255,255,255,0.15);padding:4px 12px;border-radius:6px">${idUsulan}</div>
      <div style="font-size:11px;opacity:0.7;margin-top:8px">Dicetak: ${now}</div>
    </div>
  </div>
</div>

<!-- SPM SCORE -->
<div style="margin:0 32px 24px;text-align:center">
  <div style="display:inline-block;background:white;border:3px solid ${spmColor};border-radius:20px;padding:20px 48px;box-shadow:0 4px 20px rgba(0,0,0,0.08)">
    <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Indeks SPM</div>
    <div style="font-size:48px;font-weight:800;color:${spmColor};font-family:monospace;line-height:1">${indeksSPM.toFixed(4)}</div>
    <div style="margin-top:8px;padding:4px 16px;background:${spmColor};color:white;border-radius:20px;font-size:11px;font-weight:700">${spmLabel}</div>
    <div style="margin-top:12px;display:flex;gap:24px;font-size:12px;color:#64748b">
      <div><span style="color:#94a3b8">Indeks Kinerja:</span> <strong>${indeksKinerja.toFixed(4)}</strong></div>
      <div><span style="color:#94a3b8">Indeks Beban:</span> <strong>${indeksBeban.toFixed(2)}</strong></div>
    </div>
  </div>
</div>

<!-- INFO GRID -->
<div style="margin:0 32px 24px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
  <div style="background:#f8fafc;border-radius:10px;padding:14px">
    <div style="font-size:11px;color:#94a3b8;margin-bottom:4px">Puskesmas</div>
    <div style="font-weight:700">${h.nama_puskesmas}</div>
    <div style="font-size:12px;color:#64748b">${h.kode_pkm}</div>
  </div>
  <div style="background:#f8fafc;border-radius:10px;padding:14px">
    <div style="font-size:11px;color:#94a3b8;margin-bottom:4px">Periode</div>
    <div style="font-weight:700">${bulan} ${h.tahun}</div>
    <div style="font-size:12px;color:#64748b">Input: ${h.created_by||'-'}</div>
  </div>
  <div style="background:#e6fffa;border-radius:10px;padding:14px;border:1px solid #99f6e4">
    <div style="font-size:11px;color:#0d9488;margin-bottom:4px">Final Disetujui</div>
    <div style="font-weight:700;color:#0d9488">${h.admin_approved_by||h.final_approved_by||'-'}</div>
    <div style="font-size:12px;color:#0d9488">${h.admin_approved_at ? new Date(h.admin_approved_at).toLocaleDateString('id-ID') : '-'}</div>
  </div>
</div>

<!-- INDIKATOR TABLE -->
<div style="margin:0 32px 24px">
  <div style="font-size:13px;font-weight:700;margin-bottom:10px;display:flex;align-items:center;gap:6px">
    <span style="color:#0d9488">◆</span> Detail 12 Indikator SPM
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:12px;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08)">
    <thead>
      <tr style="background:linear-gradient(135deg,#0d9488,#06b6d4);color:white">
        <th style="padding:10px;text-align:center">No</th>
        <th style="padding:10px;text-align:left">Nama Indikator</th>
        <th style="padding:10px;text-align:center">Target</th>
        <th style="padding:10px;text-align:center">Capaian</th>
        <th style="padding:10px;text-align:center;min-width:120px">Capaian</th>
        <th style="padding:10px;text-align:center">Bobot</th>
        <th style="padding:10px;text-align:center">Nilai</th>
        <th style="padding:10px;text-align:center">Bukti</th>
      </tr>
    </thead>
    <tbody>${indHtml}</tbody>
    <tfoot>
      <tr style="background:#0f172a;color:white;font-weight:700">
        <td colspan="5" style="padding:10px 10px 10px 12px">TOTAL</td>
        <td style="padding:10px;text-align:center">${indResult.rows.reduce((s,r)=>s+(parseInt(r.bobot)||0),0)}</td>
        <td style="padding:10px;text-align:center;color:#5eead4">${indResult.rows.reduce((s,r)=>s+(parseFloat(r.nilai_terbobot)||0),0).toFixed(2)}</td>
        <td></td>
      </tr>
    </tfoot>
  </table>
</div>

<!-- VERIFIKASI PROGRAM -->
${vpResult.rows.length ? `<div style="margin:0 32px 24px">
  <div style="font-size:13px;font-weight:700;margin-bottom:10px;display:flex;align-items:center;gap:6px">
    <span style="color:#0d9488">◆</span> Verifikasi Pengelola Program
  </div>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px">${vpHtml}</div>
</div>` : ''}

<!-- APPROVAL CHAIN -->
<div style="margin:0 32px 24px">
  <div style="font-size:13px;font-weight:700;margin-bottom:10px;display:flex;align-items:center;gap:6px">
    <span style="color:#0d9488">◆</span> Rantai Persetujuan
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
    <div style="background:#f8fafc;border-radius:10px;padding:14px;border-left:3px solid ${h.kapus_approved_by?'#0d9488':'#e2e8f0'}">
      <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;font-weight:700;margin-bottom:6px">Kepala Puskesmas</div>
      <div style="font-weight:700;color:${h.kapus_approved_by?'#0d9488':'#94a3b8'}">${h.kapus_approved_by||'Belum disetujui'}</div>
      ${h.kapus_approved_at?`<div style="font-size:11px;color:#64748b;margin-top:4px">${new Date(h.kapus_approved_at).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'})}</div>`:''}
      ${h.kapus_catatan?`<div style="font-size:11px;font-style:italic;color:#64748b;margin-top:4px">"${h.kapus_catatan}"</div>`:''}
    </div>
    <div style="background:#f8fafc;border-radius:10px;padding:14px;border-left:3px solid ${vpResult.rows.every(v=>v.status==='Selesai')&&vpResult.rows.length?'#0d9488':'#e2e8f0'}">
      <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;font-weight:700;margin-bottom:6px">Pengelola Program</div>
      <div style="font-weight:700;color:${vpResult.rows.every(v=>v.status==='Selesai')&&vpResult.rows.length?'#0d9488':'#94a3b8'}">${vpResult.rows.length?vpResult.rows.filter(v=>v.status==='Selesai').length+'/'+vpResult.rows.length+' Selesai':'Belum'}</div>
    </div>
    <div style="background:${h.admin_approved_by?'#e6fffa':'#f8fafc'};border-radius:10px;padding:14px;border-left:3px solid ${h.admin_approved_by?'#0d9488':'#e2e8f0'}">
      <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;font-weight:700;margin-bottom:6px">Admin</div>
      <div style="font-weight:700;color:${h.admin_approved_by?'#0d9488':'#94a3b8'}">${h.admin_approved_by||'Belum disetujui'}</div>
      ${h.admin_approved_at?`<div style="font-size:11px;color:#64748b;margin-top:4px">${new Date(h.admin_approved_at).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'})}</div>`:''}
    </div>
  </div>
</div>

<!-- FOOTER -->
<div style="margin:24px 32px 0;padding-top:16px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:11px;color:#94a3b8">
  <span>SPM Puskesmas — Sistem Penilaian Mutu</span>
  <span>Dicetak: ${now} | ${idUsulan}</span>
</div>

</body>
</html>`;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Content-Disposition': `inline; filename="SPM-${idUsulan}.html"`
      },
      body: html
    };
  } catch (e) {
    console.error('Laporan PDF error:', e);
    return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: e.message }) };
  }
};
