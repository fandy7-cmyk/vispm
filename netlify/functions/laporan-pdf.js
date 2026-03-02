const { getPool, cors } = require('./db');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();

  const params = event.queryStringParameters || {};
  const idUsulan = params.id;
  if (!idUsulan) return { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*' }, body: 'ID diperlukan' };

  const pool = getPool();
  try {
    // Auto-migrate: pastikan kolom catatan ada sebelum query
    await pool.query(`ALTER TABLE master_indikator ADD COLUMN IF NOT EXISTS catatan TEXT`).catch(()=>{});

    const hdrResult = await pool.query(
      `SELECT uh.*, p.nama_puskesmas FROM usulan_header uh
       LEFT JOIN master_puskesmas p ON uh.kode_pkm = p.kode_pkm
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

    // Format datetime untuk tanda tangan
    function fmtDT(ts) {
      if (!ts) return '-';
      const d = new Date(ts);
      const tgl = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
      const jam = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      return `${tgl}, ${jam} WITA`;
    }

    // Build verifikasi map per indikator (program verifier)
    const vpByInd = {};
    for (const v of vpResult.rows) {
      const inds = (v.indikator_akses || '').split(',').map(s => s.trim()).filter(Boolean);
      if (inds.length === 0) {
        // akses semua indikator
        for (const ind of indResult.rows) {
          const key = String(ind.no_indikator);
          if (!vpByInd[key]) vpByInd[key] = [];
          vpByInd[key].push(v);
        }
      } else {
        for (const i of inds) {
          if (!vpByInd[i]) vpByInd[i] = [];
          vpByInd[i].push(v);
        }
      }
    }

    // Satu halaman per indikator
    const pagesHtml = indResult.rows.map((ind) => {
      const rasio = parseFloat(ind.realisasi_rasio) || 0;
      const capaianPct = (rasio * 100).toFixed(0);
      const target = parseFloat(ind.target) || 0;
      const capaian = parseFloat(ind.capaian) || 0;
      const verifiers = vpByInd[String(ind.no_indikator)] || [];
      const catatan = ind.catatan_indikator || '';

      // Tanda tangan pengelola program
      const pgmSigns = verifiers.map(v => {
        const approved = v.status === 'Selesai';
        return `
          <div style="text-align:center;min-width:180px">
            <div style="font-size:10px;color:#64748b;margin-bottom:8px">${v.nama_program_jabatan || 'Pengelola Program'}</div>
            ${approved ? `
              <div style="border:2px solid #0d9488;border-radius:10px;padding:10px 14px;background:#f0fdf9;display:inline-block">
                <div style="font-size:22px;margin-bottom:2px">✅</div>
                <div style="font-size:9px;color:#0d9488;font-weight:700">DISETUJUI</div>
                <div style="font-size:8.5px;color:#475569;margin-top:2px">${fmtDT(v.verified_at)}</div>
              </div>
            ` : `
              <div style="border:2px solid #e2e8f0;border-radius:10px;padding:10px 14px;background:#f8fafc;display:inline-block">
                <div style="font-size:22px;margin-bottom:2px">⏳</div>
                <div style="font-size:9px;color:#94a3b8;font-weight:700">MENUNGGU</div>
              </div>
            `}
            <div style="margin-top:8px;font-size:10px;font-weight:700;color:#1e293b">${v.nama_program || v.email_program}</div>
          </div>`;
      }).join('');

      // Tanda tangan kepala puskesmas
      const kapusSign = `
        <div style="text-align:center;min-width:180px">
          <div style="font-size:10px;color:#64748b;margin-bottom:8px">Kepala UPTD Puskesmas ${h.nama_puskesmas || h.kode_pkm}</div>
          ${h.kapus_approved_by ? `
            <div style="border:2px solid #0d9488;border-radius:10px;padding:10px 14px;background:#f0fdf9;display:inline-block">
              <div style="font-size:22px;margin-bottom:2px">✅</div>
              <div style="font-size:9px;color:#0d9488;font-weight:700">DISETUJUI</div>
              <div style="font-size:8.5px;color:#475569;margin-top:2px">${fmtDT(h.kapus_approved_at)}</div>
            </div>
          ` : `
            <div style="border:2px solid #e2e8f0;border-radius:10px;padding:10px 14px;background:#f8fafc;display:inline-block">
              <div style="font-size:22px;margin-bottom:2px">⏳</div>
              <div style="font-size:9px;color:#94a3b8;font-weight:700">MENUNGGU</div>
            </div>
          `}
          <div style="margin-top:8px;font-size:10px;font-weight:700;color:#1e293b">${h.kapus_approved_by || '-'}</div>
        </div>`;

      return `
      <div class="page-break">
        <!-- KOP SURAT -->
        <table style="width:100%;border-bottom:3px solid #1e293b;padding-bottom:10px;margin-bottom:12px">
          <tr>
            <td style="width:70px;text-align:center">
              <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Seal_of_Banggai_Laut_Regency.svg/200px-Seal_of_Banggai_Laut_Regency.svg.png"
                   style="width:60px;height:60px;object-fit:contain"
                   onerror="this.style.display='none'">
            </td>
            <td style="text-align:center">
              <div style="font-size:12px;font-weight:700;text-transform:uppercase">Pemerintah Kabupaten Banggai Laut</div>
              <div style="font-size:11px;font-weight:700;text-transform:uppercase">Dinas Kesehatan, Pengendalian Penduduk dan Keluarga Berencana</div>
              <div style="font-size:10px">Jl. KM 7 Adean 94895 &nbsp;•&nbsp; Sulawesi Tengah</div>
              <div style="font-size:10px">email: dinkeskb.balutsulteng@gmail.com</div>
            </td>
          </tr>
        </table>

        <!-- JUDUL -->
        <div style="text-align:center;margin-bottom:16px">
          <div style="font-size:12px;font-weight:700;text-transform:uppercase">Lembar Hasil Verifikasi Laporan Standar Pelayanan Minimal (SPM)</div>
          <div style="font-size:12px;font-weight:700;text-transform:uppercase">Bidang Kesehatan Tahun ${h.tahun}</div>
        </div>

        <!-- INFO DASAR -->
        <table style="width:100%;margin-bottom:14px">
          <tr><td style="width:90px;font-size:11px;padding:2px 0">Indikator</td><td style="font-size:11px;padding:2px 0">: <strong>${ind.nama_indikator || '-'}</strong></td></tr>
          <tr><td style="font-size:11px;padding:2px 0">Puskesmas</td><td style="font-size:11px;padding:2px 0">: ${h.nama_puskesmas || h.kode_pkm}</td></tr>
          <tr><td style="font-size:11px;padding:2px 0">Bulan</td><td style="font-size:11px;padding:2px 0">: ${bulan}</td></tr>
        </table>

        <!-- TABEL DATA -->
        <table style="width:100%;border-collapse:collapse;margin-bottom:${catatan ? '10px' : '16px'}">
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
              <td style="padding:8px 10px;border:1px solid #cbd5e1;text-align:center;font-size:13px;font-weight:700;color:${rasio>=1?'#0d9488':rasio>=0.75?'#d97706':'#dc2626'}">${capaianPct}%</td>
            </tr>
          </tbody>
        </table>

        <!-- CATATAN -->
        ${catatan ? `
        <div style="margin-bottom:16px;font-size:10px;color:#334155">
          <strong>Catatan :</strong> ${catatan}
        </div>` : ''}

        <!-- TANDA TANGAN -->
        <div style="margin-top:24px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px">
            <!-- Pengelola Program (kiri) -->
            <div style="display:flex;gap:24px;flex-wrap:wrap">
              ${pgmSigns || `<div style="text-align:center;min-width:180px">
                <div style="font-size:10px;color:#64748b;margin-bottom:8px">Pengelola Program</div>
                <div style="border:2px solid #e2e8f0;border-radius:10px;padding:10px 14px;background:#f8fafc;display:inline-block">
                  <div style="font-size:22px">⏳</div>
                  <div style="font-size:9px;color:#94a3b8;font-weight:700">MENUNGGU</div>
                </div>
              </div>`}
            </div>
            <!-- Kepala Puskesmas (kanan) -->
            <div style="text-align:right">
              <div style="font-size:10px;color:#64748b;margin-bottom:4px">Adean, ${now}</div>
              ${kapusSign}
            </div>
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
  .page-break { padding: 0 0 20px 0; }
  .btn-bar {
    position: fixed; top: 12px; right: 12px; display: flex; gap: 8px; z-index: 999;
  }
  .btn-bar button {
    background: #0d9488; color: white; border: none; border-radius: 8px;
    padding: 8px 16px; font-size: 13px; font-weight: 700; cursor: pointer;
    display: flex; align-items: center; gap: 6px;
  }
  .btn-bar button.outline { background: white; color: #0d9488; border: 2px solid #0d9488; }
</style>
</head>
<body>
<div class="btn-bar no-print">
  <button onclick="window.print()">⬇ Simpan / Cetak PDF</button>
</div>
${pagesHtml}
<script>window.onload = function(){ /* window.print(); */ }</script>
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
