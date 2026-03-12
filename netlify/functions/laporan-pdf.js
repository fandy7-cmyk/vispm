const { getPool, ok, err, cors } = require('./db');
const zlib = require('zlib');
const { promisify } = require('util');
const gzip = promisify(zlib.gzip);

// ============================================================
//  HELPER: Compress base64 image — resize ke max 200px wide
//  via strip quality metadata agar tidak lewat 6MB Lambda limit
// ============================================================
function compressBase64Img(dataUrl, maxWidth = 200) {
  // Jika bukan base64 data URL (misal URL biasa), kembalikan apa adanya
  if (!dataUrl || !dataUrl.startsWith('data:image')) return dataUrl;
  // Potong ke max ~150KB — tanda tangan tidak perlu resolusi tinggi di PDF
  // Base64 150KB ≈ ~112KB binary image, cukup untuk TTD di ukuran 160x80px
  const MAX_BASE64_CHARS = 500 * 1024; // 500KB
  if (dataUrl.length <= MAX_BASE64_CHARS) return dataUrl;
  // Jika terlalu besar, crop base64 string TIDAK bisa (rusak) → return placeholder
  // Solusi: ganti dengan teks "TTD terlalu besar, simpan ulang"
  console.warn(`[laporan-pdf] tanda_tangan base64 terlalu besar: ${Math.round(dataUrl.length/1024)}KB, diganti placeholder`);
  return null; // caller akan fallback ke approvedBadgeSVG
}

// ============================================================
//  HELPER: Approved Badge SVG
// ============================================================
function approvedBadgeSVG() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 100 100">
    <defs><path id="circle" d="M 50,50 m -37,0 a 37,37 0 1,1 74,0 a 37,37 0 1,1 -74,0"/></defs>
    <g transform="translate(50,50)">
      ${Array.from({length:16},(_,i)=>{
        const a=(i/16)*Math.PI*2, a2=((i+0.5)/16)*Math.PI*2, r1=46, r2=42;
        return `<line x1="${(Math.cos(a)*r1).toFixed(1)}" y1="${(Math.sin(a)*r1).toFixed(1)}" x2="${(Math.cos(a2)*r2).toFixed(1)}" y2="${(Math.sin(a2)*r2).toFixed(1)}" stroke="#2d7a47" stroke-width="5"/>`;
      }).join('')}
      <circle r="44" fill="#2d9e55"/>
      <circle r="38" fill="none" stroke="white" stroke-width="1.5" stroke-dasharray="3 2"/>
      <polyline points="-15,2 -5,14 18,-12" fill="none" stroke="white" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
    <text font-size="8.5" font-family="Arial" font-weight="bold" fill="white" letter-spacing="2.5">
      <textPath href="#circle" startOffset="10%">APPROVED • APPROVED •</textPath>
    </text>
  </svg>`;
}

// ============================================================
//  HELPER: Format tanggal/waktu
// ============================================================
function fmtDT(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  return `${d.toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' })} | `
       + `${d.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' })} WITA`;
}

// ============================================================
//  KOP SURAT — dipakai semua mode
// ============================================================
function kopSurat(logoSrc = 'https://vispm.netlify.app/logobalut.png') {
  return `
    <div style="position:relative;padding-bottom:10px;margin-bottom:14px;border-bottom:4px solid #1e293b;min-height:80px">
      <img src="${logoSrc}" style="position:absolute;left:0;top:0;width:72px;height:72px;object-fit:contain" onerror="this.style.display='none'">
      <div style="text-align:center;line-height:1;padding:0 86px">
        <div style="font-family:Arial;font-size:12px;font-weight:400;text-transform:uppercase;letter-spacing:0.3px">PEMERINTAH KABUPATEN BANGGAI LAUT</div>
        <div style="font-family:Arial;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:0.2px">DINAS KESEHATAN, PENGENDALIAN PENDUDUK</div>
        <div style="font-family:Arial;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:0.2px">DAN KELUARGA BERENCANA</div>
        <div style="font-family:Arial;font-size:10px;font-weight:400;margin-top:2px">Jl. KM 7 Adean, Banggai Tengah, Banggai Laut, Sulawesi Tengah 94895</div>
        <div style="font-family:Arial;font-size:10px;font-weight:400">Pos-el: <span style="color:#1a56db;text-decoration:underline">dinkeskb.balutsulteng@gmail.com</span></div>
      </div>
    </div>`;
}

// ============================================================
//  CSS GLOBAL — dipakai semua mode
// ============================================================
function globalCSS() {
  return `
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, sans-serif; color: #1e293b; background: white; font-size: 11px; }
    @page { size: A4 portrait; margin: 15mm 18mm 15mm 18mm; }
    @media print {
      .no-print { display: none !important; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page-break { page-break-after: always; }
      .page-break:last-child { page-break-after: avoid; }
    }
    .page-break { padding-bottom: 20px; page-break-after: always; }
    .page-break:last-child { page-break-after: avoid; }
    table { border-collapse: collapse; }`;
}

// ============================================================
//  WRAPPER HTML — kop + judul + body + auto-print
// ============================================================
function wrapHtml(title, bodyContent) {
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>${globalCSS()}</style>
<script>
  window.onload = function() { setTimeout(function(){ window.print(); }, 600); };
<\/script>
</head>
<body>${bodyContent}</body>
</html>`;
}

// ============================================================
//  MODE: sementara & final — laporan per indikator
// ============================================================
// Migrasi kolom — dijalankan sekali saat cold start, bukan setiap request
let _migrationDone = false;
async function runMigrations(pool) {
  if (_migrationDone) return;
  await Promise.all([
    pool.query(`ALTER TABLE master_indikator ADD COLUMN IF NOT EXISTS catatan TEXT`).catch(()=>{}),
    pool.query(`ALTER TABLE verifikasi_program ADD COLUMN IF NOT EXISTS nip_program VARCHAR(50)`).catch(()=>{}),
    pool.query(`ALTER TABLE verifikasi_program ADD COLUMN IF NOT EXISTS jabatan_program TEXT`).catch(()=>{}),
    pool.query(`CREATE TABLE IF NOT EXISTS target_tahunan (id SERIAL PRIMARY KEY, kode_pkm VARCHAR(20) NOT NULL, no_indikator INT NOT NULL, tahun INT NOT NULL, sasaran INT NOT NULL DEFAULT 0, UNIQUE(kode_pkm, no_indikator, tahun))`).catch(()=>{}),
  ]);
  _migrationDone = true;
}

async function generateLaporanIndikator(pool, idUsulan, isSementara, aksesFilter) {
  await runMigrations(pool);

  // Query header
  const hdrResult = await pool.query(
    `SELECT uh.*, p.nama_puskesmas, p.indeks_kesulitan_wilayah,
            ku.nama as kapus_nama, ku.nip as kapus_nip, ku.jabatan as kapus_jabatan,
            ku.tanda_tangan as kapus_tt
     FROM usulan_header uh
     LEFT JOIN master_puskesmas p ON uh.kode_pkm = p.kode_pkm
     LEFT JOIN users ku ON LOWER(ku.email) = LOWER(uh.kapus_approved_by)
     WHERE uh.id_usulan = $1`, [idUsulan]
  );
  if (!hdrResult.rows.length) throw new Error('Usulan tidak ditemukan');
  const h = hdrResult.rows[0];

  // Pejabat penandatangan (hanya untuk mode final)
  const pjResult = await pool.query(
    `SELECT jabatan, nama, nip, tanda_tangan FROM pejabat_penandatangan ORDER BY id`
  ).catch(() => ({ rows: [] }));
  const kasubag = pjResult.rows.find(p => p.jabatan === 'Kepala Sub Bagian Perencanaan') || {};
  const kadis   = pjResult.rows.find(p => p.jabatan === 'Kepala Dinas Kesehatan PPKB') || {};

  // Indikator + target tahunan
  const indResult = await pool.query(
    `SELECT ui.*, mi.nama_indikator, mi.catatan as catatan_indikator,
            COALESCE(tt.sasaran, 0) as sasaran_tahunan
     FROM usulan_indikator ui
     LEFT JOIN master_indikator mi ON ui.no_indikator = mi.no_indikator
     LEFT JOIN target_tahunan tt ON tt.kode_pkm = $2 AND tt.no_indikator = ui.no_indikator AND tt.tahun = $3
     WHERE ui.id_usulan = $1 ORDER BY ui.no_indikator`,
    [idUsulan, h.kode_pkm, h.tahun]
  );

  // Verifikasi program — JOIN users untuk ambil tanda_tangan
  const vpResult = await pool.query(
    `SELECT vp.*, u.tanda_tangan as tt_program, u.jabatan as jabatan_user, u.indikator_akses as user_indikator_akses
     FROM verifikasi_program vp
     LEFT JOIN users u ON LOWER(u.email) = LOWER(vp.email_program)
     WHERE vp.id_usulan = $1 ORDER BY vp.created_at`, [idUsulan]
  );

  const bulanNama = ['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const bulan = bulanNama[h.bulan] || h.bulan;
  const now = new Date().toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' });

  const JABATAN_MAP = {
    1:  ['Pengelola Program Kesehatan Ibu Kabupaten','Pengelola Program HIV / AIDS Kabupaten','Pengelola Program Hepatitis Kabupaten','Pengelola Program Imunisasi Kabupaten'],
    2:  ['Pengelola Program Kesehatan Ibu Kabupaten'],
    3:  ['Pengelola Program Imunisasi Kabupaten','Pengelola Program Kesehatan Anak Kabupaten'],
    4:  ['Pengelola Program Imunisasi Kabupaten','Pengelola Program Gizi Kabupaten','Pengelola Program Kesehatan Anak Kabupaten'],
    5:  ['Pengelola Program UKS dan Kesehatan Remaja Kabupaten','Pengelola Program Imunisasi Kabupaten'],
    6:  ['Pengelola Program PTM Kabupaten','Pengelola Program Imunisasi Kabupaten','Pengelola Program KB / Kespro Kabupaten','Pengelola Program Kesehatan Jiwa Kabupaten','Pengelola Program HIV / AIDS Kabupaten'],
    7:  ['Pengelola Program Lansia Kabupaten'],
    8:  ['Pengelola Program PTM Kabupaten'],
    9:  ['Pengelola Program PTM Kabupaten'],
    10: ['Pengelola Program Kesehatan Jiwa Kabupaten'],
    11: ['Pengelola Program TB Kabupaten'],
    12: ['Pengelola Program HIV / AIDS Kabupaten'],
  };
  // Kembalikan array {v, jabatan} per slot JABATAN_MAP — 1 orang bisa muncul di >1 slot
  function getVerifierSlots(noInd) {
    const slots = JABATAN_MAP[noInd] || [];
    const eligible = vpResult.rows.filter(v => {
      const inds = (v.indikator_akses||'').split(',').map(s=>s.trim()).filter(Boolean);
      return inds.length > 0 && inds.includes(String(noInd));
    });
    if (!slots.length) {
      return eligible.map(v => ({ v, jabatan: v.jabatan_user || (v.jabatan_program||'').split('|')[0].trim() || 'Pengelola Program' }));
    }
    return slots.map(jabatan => {
      const key = jabatan.replace(' Kabupaten','').toLowerCase();
      const match = eligible.find(v =>
        (v.jabatan_user||'').toLowerCase().includes(key) ||
        (v.jabatan_program||'').toLowerCase().includes(key)
      );
      return { v: match || null, jabatan };
    }).filter(s => s.v !== null);
  }

  function signBlock(v, jabatan) {
    const approved = v.status === 'Selesai';
    jabatan = jabatan || v.jabatan_user || (v.jabatan_program||''). split('|')[0].trim() || 'Pengelola Program';
    const nama = v.nama_program || v.email_program;
    const nip = v.nip_program || '';
    const ttRaw = v.tt_program || '';
    const tt = ttRaw.startsWith('data:image') ? (compressBase64Img(ttRaw) || '') : ttRaw;
    const ttValid = tt && (tt.startsWith('data:image') || tt.startsWith('http'));
    let signImg;
    if (!approved) {
      signImg = `<div style="width:80px;height:80px;border:2px dashed #cbd5e1;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:#94a3b8;font-size:10px;margin-bottom:6px">Belum</div>
                 <div style="font-size:9px;color:#94a3b8;margin-bottom:2px">Menunggu persetujuan</div>`;
    } else if (ttValid) {
      signImg = `<div style="height:80px;display:flex;align-items:center;justify-content:center;margin-bottom:4px">
                   <img src="${tt}" style="max-height:72px;max-width:160px;object-fit:contain">
                 </div>
                 <div style="font-size:9px;color:#2d7a47;font-weight:700;margin-bottom:2px">✓ Disetujui: ${fmtDT(v.verified_at)}</div>`;
    } else {
      signImg = `<div style="display:inline-block;margin-bottom:6px">${approvedBadgeSVG()}</div>
                 <div style="font-size:9px;color:#2d7a47;font-weight:700;margin-bottom:2px">✓ Disetujui: ${fmtDT(v.verified_at)}</div>`;
    }
    return `<div style="text-align:center;min-width:180px;max-width:220px">
      <div style="font-size:10px;color:#334155;margin-bottom:10px;font-weight:600">${jabatan}</div>
      ${signImg}
      <div style="margin-top:4px;border-top:1px solid #334155;padding-top:4px;display:inline-block;min-width:150px">
        <div style="font-size:10.5px;font-weight:700">${nama}</div>
        ${nip ? `<div style="font-size:9.5px">NIP. ${nip}</div>` : ''}
      </div>
    </div>`;
  }

  function kapusSignBlock() {
    const approved = !!h.kapus_approved_by;
    const nama = h.kapus_nama || h.kapus_approved_by || '-';
    const nip  = h.kapus_nip || '';
    const ttRaw2 = h.kapus_tt || '';
    const tt   = ttRaw2.startsWith('data:image') ? (compressBase64Img(ttRaw2) || '') : ttRaw2;
    const ttValid = tt && (tt.startsWith('data:image') || tt.startsWith('http'));
    const nipHtml = nip ? `<div style="font-size:9.5px">NIP. ${nip}</div>` : '';
    let signImg;
    if (!approved) {
      signImg = `<div style="width:80px;height:80px;border:2px dashed #cbd5e1;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:#94a3b8;font-size:10px;margin-bottom:6px">Belum</div>
                 <div style="font-size:9px;color:#94a3b8;margin-bottom:2px">Menunggu persetujuan</div>`;
    } else if (ttValid) {
      signImg = `<div style="height:80px;display:flex;align-items:center;justify-content:center;margin-bottom:4px">
                   <img src="${tt}" style="max-height:72px;max-width:160px;object-fit:contain">
                 </div>
                 <div style="font-size:9px;color:#2d7a47;font-weight:700;margin-bottom:2px">✓ Disetujui: ${fmtDT(h.kapus_approved_at)}</div>`;
    } else {
      signImg = `<div style="display:inline-block;margin-bottom:6px">${approvedBadgeSVG()}</div>
                 <div style="font-size:9px;color:#2d7a47;font-weight:700;margin-bottom:2px">✓ Disetujui: ${fmtDT(h.kapus_approved_at)}</div>`;
    }
    return `<div style="text-align:center;min-width:180px;max-width:220px">
      <div style="font-size:10px;color:#334155;margin-bottom:10px;font-weight:600">Kepala UPTD Puskesmas ${h.nama_puskesmas||h.kode_pkm}</div>
      ${signImg}
      <div style="margin-top:4px;border-top:1px solid #334155;padding-top:4px;display:inline-block;min-width:150px">
        <div style="font-size:10.5px;font-weight:700">${nama}</div>
        ${nipHtml}
      </div>
    </div>`;
  }

  function pejabatSignBlock(pj, jabatanLabel) {
    const ttRaw3 = pj.tanda_tangan || '';
    const tt = ttRaw3.startsWith('data:image') ? (compressBase64Img(ttRaw3) || '') : ttRaw3;
    const ttValid = tt && (tt.startsWith('data:image') || tt.startsWith('http'));
    const tsHtml = h.admin_approved_at
      ? `<div style="font-size:9px;color:#2d7a47;font-weight:700;margin-bottom:2px">✓ Disetujui: ${fmtDT(h.admin_approved_at)}</div>`
      : '';
    return `<div style="text-align:center;min-width:180px;max-width:220px">
      <div style="font-size:10px;color:#334155;margin-bottom:10px;font-weight:600">${jabatanLabel}</div>
      ${ttValid
        ? `<div style="height:80px;display:flex;align-items:center;justify-content:center;margin-bottom:4px">
             <img src="${tt}" style="max-height:72px;max-width:160px;object-fit:contain">
           </div>`
        : `<div style="width:80px;height:80px;border:2px dashed #cbd5e1;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:#94a3b8;font-size:10px;margin-bottom:6px">TT</div>`}
      ${tsHtml}
      <div style="margin-top:4px;border-top:1px solid #334155;padding-top:4px;display:inline-block;min-width:150px">
        <div style="font-size:10.5px;font-weight:700">${pj.nama||'-'}</div>
        ${pj.nip ? `<div style="font-size:9.5px">NIP. ${pj.nip}</div>` : ''}
      </div>
    </div>`;
  }

  function buildSignLayout(slots) {
    const kapus = kapusSignBlock();
    if (isSementara) {
      return `<div style="display:flex;justify-content:flex-end">${kapus}</div>`;
    }
    // Baris 1: slot[0] kiri + kapus kanan (selalu)
    // Sisa: 2 per baris, rata tengah
    if (!slots.length) {
      return `<div style="display:flex;justify-content:flex-end">${kapus}</div>`;
    }
    const row1 = `<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:20px">${signBlock(slots[0].v, slots[0].jabatan)}${kapus}</div>`;
    const rest = slots.slice(1);
    let extraRows = '';
    for (let i = 0; i < rest.length; i += 2) {
      const chunk = rest.slice(i, i + 2);
      const justify = chunk.length === 1 ? 'center' : 'space-between';
      extraRows += `<div style="display:flex;justify-content:${justify};align-items:flex-start;gap:20px;margin-top:28px">${chunk.map(s => signBlock(s.v, s.jabatan)).join('')}</div>`;
    }
    return row1 + extraRows;
  }

  // Build pages
  const _allInds = aksesFilter && aksesFilter.length
    ? indResult.rows.filter(ind => aksesFilter.includes(ind.no_indikator))
    : indResult.rows;
  const pagesHtml = _allInds.map(ind => {
    const rasio = parseFloat(ind.realisasi_rasio) || 0;
    const capaianPct = (rasio * 100).toFixed(0);
    const sasaranTahunan = parseInt(ind.sasaran_tahunan) || 0;
    const target  = parseFloat(ind.target)  || 0;
    const capaian = parseFloat(ind.capaian) || 0;
    const catatan = ind.catatan_indikator || '';
    const slots = getVerifierSlots(ind.no_indikator);

    return `
    <div class="page-break">
      ${kopSurat()}
      <!-- JUDUL -->
      <div style="text-align:center;margin-bottom:16px">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase">Lembar Hasil Verifikasi Laporan Standar Pelayanan Minimal (SPM)</div>
        <div style="font-size:12px;font-weight:700;text-transform:uppercase">Bidang Kesehatan Tahun ${h.tahun}</div>
        ${isSementara ? `<div style="margin-top:4px;display:inline-block;background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:2px 12px;font-size:10px;font-weight:700;color:#b45309">LAPORAN SEMENTARA</div>` : ''}
      </div>
      <!-- INFO 2 KOLOM -->
      <table style="width:100%;margin-bottom:14px;font-size:11px">
        <tr>
          <td style="width:50%;vertical-align:top">
            <table style="width:100%">
              <tr><td style="width:110px;padding:2px 0">ID Usulan</td><td style="padding:2px 0">: <strong>${h.id_usulan}</strong></td></tr>
              <tr><td style="padding:2px 0">Puskesmas</td><td style="padding:2px 0">: ${h.nama_puskesmas||h.kode_pkm}</td></tr>
              <tr><td style="padding:2px 0">Periode</td><td style="padding:2px 0">: ${bulan} ${h.tahun}</td></tr>
              <tr><td style="padding:2px 0;vertical-align:top">Indikator</td><td style="padding:2px 0;vertical-align:top">: <strong>${ind.nama_indikator||'-'}</strong></td></tr>
              <tr><td style="padding:2px 0">Dicetak</td><td style="padding:2px 0">: ${now}</td></tr>
            </table>
          </td>
          <td style="width:50%;vertical-align:top;padding-left:20px">
            <table style="width:100%">
              <tr><td style="width:160px;padding:2px 0">Status</td><td style="padding:2px 0">: ${h.status_global||'Draft'}</td></tr>
              <tr><td style="padding:2px 0">Indeks Beban Kerja</td><td style="padding:2px 0">: ${parseFloat(h.indeks_beban_kerja||0).toFixed(2)}</td></tr>
              <tr><td style="padding:2px 0">Indeks Kesulitan Wilayah</td><td style="padding:2px 0">: ${parseFloat(h.indeks_kesulitan_wilayah||0).toFixed(2)}</td></tr>
              <tr><td style="padding:2px 0"><strong>Indeks SPM</strong></td><td style="padding:2px 0">: <strong>${parseFloat(h.indeks_spm||0).toFixed(2)}</strong></td></tr>
            </table>
          </td>
        </tr>
      </table>
      <!-- TABEL DATA -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:${catatan?'10px':'20px'}">
        <thead>
          <tr style="background:#1e293b;color:white">
            <th style="padding:7px 10px;font-size:11px;border:1px solid #334155;text-align:center;text-transform:uppercase">Jumlah Sasaran<br>(Tahun)</th>
            <th style="padding:7px 10px;font-size:11px;border:1px solid #334155;text-align:center;text-transform:uppercase">Target Bulan Ini</th>
            <th style="padding:7px 10px;font-size:11px;border:1px solid #334155;text-align:center;text-transform:uppercase">Realisasi Bulan Ini</th>
            <th style="padding:7px 10px;font-size:11px;border:1px solid #334155;text-align:center;text-transform:uppercase">Capaian</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:8px 10px;border:1px solid #cbd5e1;text-align:center;font-size:11px">${sasaranTahunan>0?sasaranTahunan:'<span style="color:#94a3b8;font-style:italic">-</span>'}</td>
            <td style="padding:8px 10px;border:1px solid #cbd5e1;text-align:center;font-size:11px">${target}</td>
            <td style="padding:8px 10px;border:1px solid #cbd5e1;text-align:center;font-size:11px">${capaian}</td>
            <td style="padding:8px 10px;border:1px solid #cbd5e1;text-align:center;font-size:11px;font-weight:700;color:#1e293b">${capaianPct}%</td>
          </tr>
        </tbody>
      </table>
      ${catatan?`<div style="margin-bottom:20px;font-size:10px;color:#334155"><strong>Catatan :</strong> ${catatan}</div>`:''}
      <!-- TANDA TANGAN -->
      <div style="margin-top:28px">
        <div style="font-size:10px;color:#334155;margin-bottom:6px;text-align:right">Adean, ${now}</div>
        ${buildSignLayout(slots)}
      </div>
    </div>`;
  }).join('');

  // ── HALAMAN REKAP (hanya mode final) ──────────────────────────
  const rekapPage = isSementara ? '' : (() => {
    // Label sub-baris baku per no_indikator
    const subLabel = {
      1:  ['Jumlah bumil yang mendapatkan pelayanan antenatal sesuai standar', 'Jumlah bumil bulan ini'],
      2:  ['Jumlah ibu bersalin yang mendapatkan pelayanan persalinan sesuai standar di fasilitas pelayanan kesehatan', 'Jumlah ibu bersalin bulan ini'],
      3:  ['Jumlah bayi baru lahir usia 0-28 hari yang mendapatkan pelayanan kesehatan bayi baru lahir sesuai dengan standar', 'Jumlah bayi baru lahir bulan ini'],
      4:  ['Jumlah balita usia 12-59 bulan yang mendapatkan pelayanan sesuai standar', 'Jumlah balita usia 12-59 bulan'],
      5:  ['Jumlah anak usia pendidikan dasar yang mendapat pelayanan kesehatan sesuai standar', 'Jumlah anak usia pendidikan dasar'],
      6:  ['Jumlah orang usia 15-59 tahun yang mendapat pelayanan skrining kesehatan sesuai standar', 'Jumlah orang usia 15-59 tahun'],
      7:  ['Jumlah warga negara berusia 60 tahun atau lebih yang mendapat skrining kesehatan sesuai standar minimal 1 kali', 'Jumlah semua warga negara berusia 60 tahun atau lebih'],
      8:  ['Jumlah penderita hipertensi ≥ 15 tahun yang mendapat pelayanan sesuai standar', 'Jumlah estimasi penderita hipertensi usia ≥ 15 tahun'],
      9:  ['Jumlah penderita DM ≥ 15 tahun yang mendapat pelayanan sesuai standar', 'Jumlah penderita DM ≥ 15 tahun'],
      10: ['Jumlah ODGJ berat yg mendapat pelayanan kesehatan jiwa sesuai standar', 'Jumlah proyeksi ODGJ berat'],
      11: ['Jumlah orang terduga TBC yang dilakukan pemeriksaan penunjang', 'Jumlah orang yang terduga TBC'],
      12: ['Jumlah orang beresiko terinfeksi HIV yang mendapat pelayanan sesuai standar', 'Jumlah orang dengan risiko terinfeksi HIV'],
    };

    const rekapRows = _allInds.map((ind, i) => {
      const no = ind.no_indikator;
      const capaian = parseFloat(ind.capaian) || 0;
      const target  = parseFloat(ind.target)  || 0;
      const labels  = subLabel[no] || ['Realisasi', 'Target'];
      const bgInduk = i % 2 === 0 ? '#f8fafc' : 'white';
      return `
        <tr style="background:${bgInduk}">
          <td style="padding:6px 10px;border:1px solid #cbd5e1;text-align:center;font-weight:700;vertical-align:top">${no}</td>
          <td style="padding:6px 10px;border:1px solid #cbd5e1;font-weight:700">${ind.nama_indikator||'-'}</td>
          <td style="padding:6px 10px;border:1px solid #cbd5e1;text-align:center"></td>
        </tr>
        <tr style="background:${bgInduk}">
          <td style="padding:4px 10px;border:1px solid #cbd5e1;text-align:center;color:#64748b">-</td>
          <td style="padding:4px 10px;border:1px solid #cbd5e1;color:#334155;padding-left:20px">${labels[0]}</td>
          <td style="padding:4px 10px;border:1px solid #cbd5e1;text-align:center;font-weight:600;background:#fef9c3">${capaian}</td>
        </tr>
        <tr style="background:${bgInduk}">
          <td style="padding:4px 10px;border:1px solid #cbd5e1;text-align:center;color:#64748b">-</td>
          <td style="padding:4px 10px;border:1px solid #cbd5e1;color:#334155;padding-left:20px">${labels[1]}</td>
          <td style="padding:4px 10px;border:1px solid #cbd5e1;text-align:center;font-weight:600;background:#fef9c3">${target}</td>
        </tr>`;
    }).join('');

    const indeksSpm = parseFloat(h.indeks_spm || 0).toFixed(2);

    const ttdKiri  = pejabatSignBlock(kadis,   'Kepala Dinas Kesehatan PPKB');
    const ttdKanan = pejabatSignBlock(kasubag, 'Kepala Sub Bagian Perencanaan');

    return `
    <div class="page-break">
      ${kopSurat()}
      <!-- JUDUL REKAP -->
      <div style="text-align:center;margin-bottom:14px">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase">Lembar Rekapitulasi Hasil Verifikasi Dan Indeks SPM Tahun ${h.tahun}</div>
      </div>
      <!-- INFO 2 KOLOM -->
      <table style="width:100%;margin-bottom:14px;font-size:11px">
        <tr>
          <td style="width:50%;vertical-align:top">
            <table style="width:100%">
              <tr><td style="width:110px;padding:2px 0">ID Usulan</td><td style="padding:2px 0">: <strong>${h.id_usulan}</strong></td></tr>
              <tr><td style="padding:2px 0">Puskesmas</td><td style="padding:2px 0">: ${h.nama_puskesmas||h.kode_pkm}</td></tr>
              <tr><td style="padding:2px 0">Periode</td><td style="padding:2px 0">: ${bulan} ${h.tahun}</td></tr>
              <tr><td style="padding:2px 0">Dicetak</td><td style="padding:2px 0">: ${now}</td></tr>
            </table>
          </td>
          <td style="width:50%;vertical-align:top;padding-left:20px">
            <table style="width:100%">
              <tr><td style="width:160px;padding:2px 0">Status</td><td style="padding:2px 0">: ${h.status_global||'Draft'}</td></tr>
              <tr><td style="padding:2px 0">Indeks Beban Kerja</td><td style="padding:2px 0">: ${parseFloat(h.indeks_beban_kerja||0).toFixed(2)}</td></tr>
              <tr><td style="padding:2px 0">Indeks Kesulitan Wilayah</td><td style="padding:2px 0">: ${parseFloat(h.indeks_kesulitan_wilayah||0).toFixed(2)}</td></tr>
            </table>
          </td>
        </tr>
      </table>
      <!-- TABEL REKAP -->
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead>
          <tr style="background:#1e293b;color:white">
            <th style="padding:7px 10px;border:1px solid #334155;text-align:center;width:32px;text-transform:uppercase">No</th>
            <th style="padding:7px 10px;border:1px solid #334155;text-align:center;text-transform:uppercase">Variabel</th>
            <th style="padding:7px 10px;border:1px solid #334155;text-align:center;width:70px;text-transform:uppercase">Jumlah</th>
          </tr>
        </thead>
        <tbody>
          ${rekapRows}
          <tr style="background:#1e293b">
            <td colspan="2" style="padding:8px 14px;border:1px solid #334155;color:white;font-weight:700;text-align:center;font-size:12px;text-transform:uppercase;letter-spacing:0.5px">Indeks Kinerja SPM</td>
            <td style="padding:8px 10px;border:1px solid #334155;text-align:center;color:#fbbf24;font-weight:700;font-size:13px">${indeksSpm}</td>
          </tr>
        </tbody>
      </table>
      <!-- TANDA TANGAN PEJABAT -->
      <div style="margin-top:32px">
        <div style="font-size:10px;color:#334155;margin-bottom:6px;text-align:right">Adean, ${now}</div>
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:20px">
          ${ttdKiri}
          ${ttdKanan}
        </div>
      </div>
    </div>`;
  })();

  const titleDoc = isSementara
    ? `Laporan Sementara_${idUsulan}`
    : `Laporan Final_${idUsulan}`;

  const filename = isSementara
    ? `Laporan Sementara_${idUsulan}.pdf`
    : `Laporan Final_${idUsulan}.pdf`;

  return { html: wrapHtml(titleDoc, pagesHtml + rekapPage), filename };
}

// ============================================================
//  MODE: log — riwayat aktivitas
// ============================================================
async function generateLaporanLog(pool, idUsulan) {
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

  if (!headerResult.rows.length) throw new Error('Usulan tidak ditemukan');
  const r = headerResult.rows[0];
  const bulanNama = ['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

  const nowDt  = new Date();
  const nowOpt = { timeZone:'Asia/Makassar' };
  const nowStr = nowDt.toLocaleDateString('id-ID',{...nowOpt,day:'2-digit',month:'long',year:'numeric'})
               + ' | ' + nowDt.toLocaleTimeString('id-ID',{...nowOpt,hour:'2-digit',minute:'2-digit',hour12:false}) + ' WITA';

  const aksiColor = {
    'Submit':'#0d9488','Ajukan Ulang':'#0d9488','Approve':'#16a34a','Approve Final':'#16a34a',
    'Re-verifikasi':'#0891b2','Tolak':'#dc2626','Tolak (sebagian)':'#ea580c',
    'Kembalikan':'#ea580c','Sanggah':'#7c3aed','Reset':'#d97706','Restore Verif':'#6366f1'
  };
  const aksiLabel = {
    'Submit':'Diajukan','Ajukan Ulang':'Ajukan Ulang','Approve':'Disetujui','Approve Final':'Final Disetujui',
    'Re-verifikasi':'Re-verifikasi','Tolak':'Ditolak','Tolak (sebagian)':'Tolak Sebagian',
    'Kembalikan':'Dikembalikan','Sanggah':'Sanggah','Reset':'Direset Admin','Restore Verif':'Dipulihkan'
  };

  const theadHtml = `<tr style="background:#1e293b">
    <th style="color:white;font-size:11px;padding:7px 10px;border:1px solid #334155;text-align:center;text-transform:uppercase;width:28px">NO</th>
    <th style="color:white;font-size:11px;padding:7px 10px;border:1px solid #334155;text-align:center;text-transform:uppercase;width:120px">Aksi</th>
    <th style="color:white;font-size:11px;padding:7px 10px;border:1px solid #334155;text-align:center;text-transform:uppercase;width:130px">Nama</th>
    <th style="color:white;font-size:11px;padding:7px 10px;border:1px solid #334155;text-align:center;text-transform:uppercase;width:85px">Role</th>
    <th style="color:white;font-size:11px;padding:7px 10px;border:1px solid #334155;text-align:center;text-transform:uppercase;width:115px">Waktu</th>
    <th style="color:white;font-size:11px;padding:7px 10px;border:1px solid #334155;text-align:center;text-transform:uppercase">Detail</th>
  </tr>`;

  const logs = logResult.rows;
  const rowsHtml = logs.map((log, i) => {
    const color = aksiColor[log.aksi] || '#64748b';
    const label = aksiLabel[log.aksi] || log.aksi;
    const detail = log.detail
      ? `<div style="margin-top:4px;font-size:11px;color:#334155;background:#f8fafc;border-left:3px solid ${color};padding:4px 8px;border-radius:0 4px 4px 0;word-break:break-word">${log.detail}</div>` : '';
    return `<tr style="${i%2===1?'background:#f8fafc':''}">
      <td style="padding:7px 10px;border:1px solid #cbd5e1;text-align:center;font-weight:700;color:${color}">${i+1}</td>
      <td style="padding:7px 10px;border:1px solid #cbd5e1">
        <span style="background:${color}18;color:${color};border:1px solid ${color}55;padding:2px 8px;border-radius:12px;font-size:10px;font-weight:700;white-space:nowrap">${label}</span>
      </td>
      <td style="padding:7px 10px;border:1px solid #cbd5e1;font-weight:600">${log.user_nama||log.user_email}</td>
      <td style="padding:7px 10px;border:1px solid #cbd5e1;color:#64748b">${log.role}</td>
      <td style="padding:7px 10px;border:1px solid #cbd5e1;color:#475569;font-size:10px">${fmtDT(log.timestamp)}</td>
      <td style="padding:7px 10px;border:1px solid #cbd5e1;word-break:break-word">${detail}</td>
    </tr>`;
  }).join('');

  const namaPKM = r.nama_puskesmas || r.kode_pkm;
  const namaBulan = bulanNama[r.bulan] || '';

  const bodyHtml = `
    ${kopSurat()}
    <!-- JUDUL -->
    <div style="text-align:center;margin:14px 0">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase">Riwayat Aktivitas Verifikasi Indeks SPM</div>
      <div style="font-size:12px;font-weight:700;text-transform:uppercase">Standar Pelayanan Minimal (SPM) Bidang Kesehatan Tahun ${r.tahun}</div>
    </div>
    <!-- INFO 2 KOLOM -->
    <table style="width:100%;margin-bottom:14px;font-size:11px">
      <tr>
        <td style="width:50%;vertical-align:top">
          <table style="width:100%">
            <tr><td style="width:110px;padding:2px 0">ID Usulan</td><td style="padding:2px 0">: <strong>${r.id_usulan}</strong></td></tr>
            <tr><td style="padding:2px 0">Puskesmas</td><td style="padding:2px 0">: ${namaPKM}</td></tr>
            <tr><td style="padding:2px 0">Periode</td><td style="padding:2px 0">: ${namaBulan} ${r.tahun}</td></tr>
            <tr><td style="padding:2px 0">Status</td><td style="padding:2px 0">: ${r.status_global||'Draft'}</td></tr>
            <tr><td style="padding:2px 0">Dicetak</td><td style="padding:2px 0">: ${nowStr}</td></tr>
          </table>
        </td>
        <td style="width:50%;vertical-align:top;padding-left:20px">
          <table style="width:100%">
            <tr><td style="width:160px;padding:2px 0">Indeks Beban Kerja</td><td style="padding:2px 0">: ${parseFloat(r.indeks_beban_kerja||0).toFixed(2)}</td></tr>
            <tr><td style="padding:2px 0">Indeks Kesulitan Wilayah</td><td style="padding:2px 0">: ${parseFloat(r.indeks_kesulitan_wilayah||0).toFixed(2)}</td></tr>
            <tr><td style="padding:2px 0"><strong>Indeks SPM</strong></td><td style="padding:2px 0">: <strong>${parseFloat(r.indeks_spm||0).toFixed(2)}</strong></td></tr>
          </table>
        </td>
      </tr>
    </table>
    <!-- TABEL LOG -->
    <table style="width:100%;border-collapse:collapse;table-layout:fixed">
      <thead>${theadHtml}</thead>
      <tbody>${rowsHtml}</tbody>
    </table>`;

  const titleDoc = `Log Verifikasi_${idUsulan}`;
  const filename = `Log Verifikasi_${idUsulan}.pdf`;

  return { html: wrapHtml(titleDoc, bodyHtml), filename };
}

// ============================================================
//  ENTRY POINT — generateLaporanHtml (dipanggil dari handler)
// ============================================================
async function generateLaporanHtml(idUsulan, mode, aksesFilter) {
  const pool = getPool();
  // mode: 'sementara' | 'final' | 'log'
  if (mode === 'log') return generateLaporanLog(pool, idUsulan);
  const isSementara = mode === 'sementara';
  return generateLaporanIndikator(pool, idUsulan, isSementara, aksesFilter);
}

exports.generateLaporanHtml = generateLaporanHtml;

// ============================================================
//  NETLIFY HANDLER
// ============================================================
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();
  const params = event.queryStringParameters || {};
  const idUsulan = params.id;
  const mode = params.mode || 'final'; // 'sementara' | 'final' | 'log'
  const aksesParam = params.akses || '';
  const aksesFilter = aksesParam ? aksesParam.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0) : [];
  if (!idUsulan) return {
    statusCode: 400,
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: 'ID diperlukan'
  };
  try {
    const { html, filename } = await generateLaporanHtml(idUsulan, mode, aksesFilter);

    // Cek ukuran — Lambda limit 6MB (base64 ~4.5MB raw)
    const rawBytes = Buffer.byteLength(html, 'utf8');
    console.log(`[laporan-pdf] HTML size: ${Math.round(rawBytes / 1024)}KB`);

    // Gunakan gzip jika > 3MB untuk tetap di bawah limit 6MB
    if (rawBytes > 3 * 1024 * 1024) {
      const compressed = await gzip(html);
      const b64 = compressed.toString('base64');
      console.log(`[laporan-pdf] Gzipped size: ${Math.round(b64.length / 1024)}KB`);
      return {
        statusCode: 200,
        isBase64Encoded: true,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Encoding': 'gzip',
          'Content-Disposition': `inline; filename="${filename}"`,
          'Access-Control-Allow-Origin': '*'
        },
        body: b64
      };
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Access-Control-Allow-Origin': '*'
      },
      body: html
    };
  } catch (e) {
    console.error('[laporan-pdf] Error:', e.message);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: e.message })
    };
  }
};
