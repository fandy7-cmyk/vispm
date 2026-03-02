const { getPool, cors } = require('./db');

// SVG badge "APPROVED" seperti stempel
function approvedBadgeSVG() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 100 100">
    <defs>
      <path id="circle" d="M 50,50 m -37,0 a 37,37 0 1,1 74,0 a 37,37 0 1,1 -74,0"/>
    </defs>
    <!-- Outer badge shape (gear-like) -->
    <g transform="translate(50,50)">
      ${Array.from({length:16},(_,i)=>{
        const a = (i/16)*Math.PI*2;
        const a2 = ((i+0.5)/16)*Math.PI*2;
        const r1=46, r2=42;
        const x1=Math.cos(a)*r1, y1=Math.sin(a)*r1;
        const x2=Math.cos(a2)*r2, y2=Math.sin(a2)*r2;
        return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#2d7a47" stroke-width="5"/>`;
      }).join('')}
      <circle r="44" fill="#2d9e55" />
      <circle r="38" fill="none" stroke="white" stroke-width="1.5" stroke-dasharray="3 2"/>
      <!-- Checkmark -->
      <polyline points="-15,2 -5,14 18,-12" fill="none" stroke="white" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
    <!-- Text APPROVED curved -->
    <text font-size="8.5" font-family="Arial" font-weight="bold" fill="white" letter-spacing="2.5">
      <textPath href="#circle" startOffset="10%">APPROVED • APPROVED •</textPath>
    </text>
  </svg>`;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();

  const params = event.queryStringParameters || {};
  const idUsulan = params.id;
  if (!idUsulan) return { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*' }, body: 'ID diperlukan' };

  const pool = getPool();
  try {
    // Auto-migrate
    await pool.query(`ALTER TABLE master_indikator ADD COLUMN IF NOT EXISTS catatan TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE verifikasi_program ADD COLUMN IF NOT EXISTS nip_program VARCHAR(50)`).catch(()=>{});
    await pool.query(`ALTER TABLE verifikasi_program ADD COLUMN IF NOT EXISTS jabatan_program TEXT`).catch(()=>{});

    const hdrResult = await pool.query(
      `SELECT uh.*, p.nama_puskesmas,
              ku.nama as kapus_nama, ku.nip as kapus_nip, ku.jabatan as kapus_jabatan
       FROM usulan_header uh
       LEFT JOIN master_puskesmas p ON uh.kode_pkm = p.kode_pkm
       LEFT JOIN users ku ON LOWER(ku.email) = LOWER(uh.kapus_approved_by)
       WHERE uh.id_usulan = $1`, [idUsulan]
    );
    if (hdrResult.rows.length === 0) return { statusCode: 404, body: 'Tidak ditemukan' };
    const h = hdrResult.rows[0];

    const indResult = await pool.query(
      `SELECT ui.*, mi.nama_indikator, mi.catatan as catatan_indikator
       FROM usulan_indikator ui
       LEFT JOIN master_indikator mi ON ui.no_indikator = mi.no_indikator
       WHERE ui.id_usulan = $1 ORDER BY ui.no_indikator`, [idUsulan]
    );

    const vpResult = await pool.query(
      `SELECT * FROM verifikasi_program WHERE id_usulan = $1 ORDER BY created_at`, [idUsulan]
    );

    const bulanNama = ['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    const bulan = bulanNama[h.bulan] || h.bulan;
    const now = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });

    function fmtDT(ts) {
      if (!ts) return '-';
      const d = new Date(ts);
      const tgl = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
      const jam = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      return `${tgl}, ${jam} WITA`;
    }

    // Map: indikator → penanggungjawab (hanya yang punya akses indikator tsb)
    // indikator_akses kosong = akses semua
    function getVerifiersForInd(noInd) {
      return vpResult.rows.filter(v => {
        const inds = (v.indikator_akses || '').split(',').map(s => s.trim()).filter(Boolean);
        if (inds.length === 0) return true; // akses semua
        return inds.includes(String(noInd));
      });
    }

    function signBlock(v) {
      const approved = v.status === 'Selesai';
      const jabatan = v.jabatan_program || 'Pengelola Program';
      const nama = v.nama_program || v.email_program;
      const nip = v.nip_program || '';
      return `
        <div style="text-align:center;min-width:200px">
          <div style="font-size:10px;color:#334155;margin-bottom:10px;font-weight:600">${jabatan}</div>
          ${approved
            ? `<div style="display:inline-block;margin-bottom:6px">${approvedBadgeSVG()}</div>
               <div style="font-size:9px;color:#2d7a47;font-weight:700;margin-bottom:2px">✓ Disetujui: ${fmtDT(v.verified_at)}</div>`
            : `<div style="width:80px;height:80px;border:2px dashed #cbd5e1;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:#94a3b8;font-size:10px;margin-bottom:6px">Belum</div>
               <div style="font-size:9px;color:#94a3b8;margin-bottom:2px">Menunggu persetujuan</div>`}
          <div style="margin-top:4px;border-top:1px solid #334155;padding-top:4px;display:inline-block;min-width:160px">
            <div style="font-size:10.5px;font-weight:700">${nama}</div>
            ${nip ? `<div style="font-size:9.5px">Nip. ${nip}</div>` : ''}
          </div>
        </div>`;
    }

    function kapusSignBlock() {
      const approved = !!h.kapus_approved_by;
      const jabatan = h.kapus_jabatan || `Kepala UPTD Puskesmas ${h.nama_puskesmas||h.kode_pkm}`;
      const nama = h.kapus_nama || h.kapus_approved_by || '-';
      const nip = h.kapus_nip || '';
      return `
        <div style="text-align:center;min-width:200px">
          <div style="font-size:10px;color:#334155;margin-bottom:10px;font-weight:600">Kepala UPTD Puskesmas ${h.nama_puskesmas||h.kode_pkm}</div>
          ${approved
            ? `<div style="display:inline-block;margin-bottom:6px">${approvedBadgeSVG()}</div>
               <div style="font-size:9px;color:#2d7a47;font-weight:700;margin-bottom:2px">✓ Disetujui: ${fmtDT(h.kapus_approved_at)}</div>`
            : `<div style="width:80px;height:80px;border:2px dashed #cbd5e1;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:#94a3b8;font-size:10px;margin-bottom:6px">Belum</div>
               <div style="font-size:9px;color:#94a3b8;margin-bottom:2px">Menunggu persetujuan</div>`}
          <div style="margin-top:4px;border-top:1px solid #334155;padding-top:4px;display:inline-block;min-width:160px">
            <div style="font-size:10.5px;font-weight:700">${nama}</div>
            ${nip ? `<div style="font-size:9.5px">Nip. ${nip}</div>` : ''}
          </div>
        </div>`;
    }

    const pagesHtml = indResult.rows.map((ind) => {
      const rasio = parseFloat(ind.realisasi_rasio) || 0;
      const capaianPct = (rasio * 100).toFixed(0);
      const target = parseFloat(ind.target) || 0;
      const capaian = parseFloat(ind.capaian) || 0;
      const catatan = ind.catatan_indikator || '';

      // Hanya penanggungjawab indikator ini
      const verifiers = getVerifiersForInd(ind.no_indikator);

      const pgmSigns = verifiers.length
        ? verifiers.map(v => signBlock(v)).join('')
        : `<div style="text-align:center;min-width:180px;color:#94a3b8;font-size:11px">Tidak ada pengelola program</div>`;

      return `
      <div class="page-break">
        <!-- KOP SURAT -->
        <div style="display:flex;align-items:center;gap:14px;padding-bottom:10px;margin-bottom:14px;border-bottom:4px solid #1e293b">
          <!-- Logo -->
          <div style="flex-shrink:0">
            <img src="https://vispm.netlify.app/logobalut.png"
                 style="width:72px;height:72px;object-fit:contain"
                 onerror="this.style.display='none'">
          </div>
          <!-- Teks kop -->
          <div style="flex:1;text-align:center;line-height:1.5">
            <div style="font-size:12px;font-weight:400;text-transform:uppercase;letter-spacing:0.3px">Pemerintah Kabupaten Banggai Laut</div>
            <div style="font-size:15px;font-weight:900;text-transform:uppercase;letter-spacing:0.2px;line-height:1.3">Dinas Kesehatan, Pengendalian Penduduk<br>dan Keluarga Berencana</div>
            <div style="font-size:10px;font-weight:400;margin-top:2px">Jl. KM 7, Adean, Banggai Tengah, Banggai Laut, Sulawesi Tengah 94895</div>
            <div style="font-size:10px;font-weight:400">Pos-el <span style="color:#1a56db;text-decoration:underline">dinkeskb.balutsulteng@gmail.com</span></div>
          </div>
        </div>

        <!-- JUDUL -->
        <div style="text-align:center;margin-bottom:16px">
          <div style="font-size:12px;font-weight:700;text-transform:uppercase">Lembar Hasil Verifikasi Laporan Standar Pelayanan Minimal (SPM)</div>
          <div style="font-size:12px;font-weight:700;text-transform:uppercase">Bidang Kesehatan Tahun ${h.tahun}</div>
        </div>

        <!-- INFO -->
        <table style="width:100%;margin-bottom:14px">
          <tr><td style="width:90px;font-size:11px;padding:2px 0">Indikator</td><td style="font-size:11px;padding:2px 0">: <strong>${ind.nama_indikator || '-'}</strong></td></tr>
          <tr><td style="font-size:11px;padding:2px 0">Puskesmas</td><td style="font-size:11px;padding:2px 0">: ${h.nama_puskesmas || h.kode_pkm}</td></tr>
          <tr><td style="font-size:11px;padding:2px 0">Bulan</td><td style="font-size:11px;padding:2px 0">: ${bulan}</td></tr>
        </table>

        <!-- TABEL DATA -->
        <table style="width:100%;border-collapse:collapse;margin-bottom:${catatan ? '10px' : '20px'}">
          <thead>
            <tr style="background:#1e293b;color:white">
              <th style="padding:7px 10px;font-size:10px;border:1px solid #334155;text-align:center">Jumlah Sasaran<br>(Satu Tahun)</th>
              <th style="padding:7px 10px;font-size:10px;border:1px solid #334155;text-align:center">Jumlah Bulan Ini</th>
              <th style="padding:7px 10px;font-size:10px;border:1px solid #334155;text-align:center">Dilayani Sesuai Standar</th>
              <th style="padding:7px 10px;font-size:10px;border:1px solid #334155;text-align:center">Capaian (%)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:8px 10px;border:1px solid #cbd5e1;text-align:center;font-size:12px">${target}</td>
              <td style="padding:8px 10px;border:1px solid #cbd5e1;text-align:center;font-size:12px">${capaian}</td>
              <td style="padding:8px 10px;border:1px solid #cbd5e1;text-align:center;font-size:12px">${capaian}</td>
              <td style="padding:8px 10px;border:1px solid #cbd5e1;text-align:center;font-size:14px;font-weight:700;color:${rasio>=1?'#0d9488':rasio>=0.75?'#d97706':'#dc2626'}">${capaianPct}%</td>
            </tr>
          </tbody>
        </table>

        ${catatan ? `<div style="margin-bottom:20px;font-size:10px;color:#334155"><strong>Catatan :</strong> ${catatan}</div>` : ''}

        <!-- TANDA TANGAN -->
        <div style="margin-top:28px;display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:20px">
          <div style="display:flex;gap:32px;flex-wrap:wrap">
            ${pgmSigns}
          </div>
          <div>
            <div style="font-size:10px;color:#334155;margin-bottom:6px;text-align:right">Adean, ${now}</div>
            ${kapusSignBlock()}
          </div>
        </div>
      </div>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<title>Laporan SPM Per Indikator - ${idUsulan}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; color: #1e293b; background: white; font-size: 12px; }
  @page { size: A4 portrait; margin: 15mm 18mm 15mm 18mm; }
  @media print {
    .no-print { display: none !important; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page-break { page-break-after: always; }
    .page-break:last-child { page-break-after: avoid; }
  }
  .page-break { padding-bottom: 20px; }
  .btn-bar { position:fixed; top:12px; right:12px; z-index:999; }
  .btn-bar button { background:#0d9488; color:white; border:none; border-radius:8px; padding:9px 18px; font-size:13px; font-weight:700; cursor:pointer; }
</style>
</head>
<body>
<div class="btn-bar no-print"><button onclick="window.print()">⬇ Cetak / Simpan PDF</button></div>
${pagesHtml}
</body>
</html>`;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
      body: html
    };
  } catch (e) {
    console.error('Laporan error:', e);
    return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: e.message }) };
  }
};
