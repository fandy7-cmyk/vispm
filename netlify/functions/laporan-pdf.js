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
  const o = { timeZone: 'Asia/Makassar' };
  const tgl = d.toLocaleDateString('id-ID', { ...o, day:'2-digit', month:'long', year:'numeric' });
  const jam = d.toLocaleTimeString('id-ID', { ...o, hour:'2-digit', minute:'2-digit', hour12:false }).replace('.', ':');
  return `${tgl} | ${jam} WITA`;
}

// ============================================================
//  KOP SURAT — dipakai semua mode
// ============================================================
function kopSurat(logoSrc = 'https://vispm.netlify.app/logobalut.png') {
  return `
    <div style="position:relative;padding-bottom:10px;margin-bottom:14px;border-bottom:2px solid #1e293b;min-height:80px">
      <img src="${logoSrc}" style="position:absolute;left:0;top:0;width:72px;height:72px;object-fit:contain" onerror="this.style.display='none'">
      <div style="text-align:center;line-height:1.1;padding:0 86px">
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

  // Indikator + target tahunan + realisasi kumulatif semua bulan di tahun ini
  // sisa_target = sasaran_tahunan - realisasi_kumulatif (akurat lintas bulan)
  const indResult = await pool.query(
    `SELECT ui.*,
            mi.nama_indikator, mi.catatan as catatan_indikator,
            COALESCE(tt.sasaran, 0) as sasaran_tahunan,
            -- realisasi kumulatif = SUM semua bulan di tahun ini, puskesmas & indikator sama
            -- status NOT IN Draft/Ditolak agar hanya hitung yang sudah diproses
            COALESCE((
              SELECT SUM(ui2.capaian)
              FROM usulan_indikator ui2
              JOIN usulan_header uh2 ON uh2.id_usulan = ui2.id_usulan
              WHERE uh2.kode_pkm = $2
                AND uh2.tahun = $3
                AND ui2.no_indikator = ui.no_indikator
                AND uh2.status_global NOT IN ('Draft', 'Ditolak')
            ), 0) as realisasi_kumulatif,
            -- capaian_pct bulan ini vs target tahunan
            CASE WHEN COALESCE(tt.sasaran,0) > 0
                 THEN ROUND((COALESCE(ui.capaian,0)::numeric / tt.sasaran::numeric) * 100, 2)
                 ELSE ROUND(COALESCE(ui.realisasi_rasio,0)::numeric * 100, 2)
            END as capaian_pct
     FROM usulan_indikator ui
     LEFT JOIN master_indikator mi ON ui.no_indikator = mi.no_indikator
     LEFT JOIN target_tahunan tt ON tt.kode_pkm = $2 AND tt.no_indikator = ui.no_indikator AND tt.tahun = $3
     WHERE ui.id_usulan = $1 ORDER BY ui.no_indikator`,
    [idUsulan, h.kode_pkm, h.tahun]
  );

  // Verifikasi program — JOIN users untuk ambil tanda_tangan & waktu verifikasi
  const vpResult = await pool.query(
    `SELECT vp.*, u.tanda_tangan as tt_program, u.jabatan as jabatan_user,
            u.nama as nama_user, u.nip as nip_user,
            u.indikator_akses as user_indikator_akses
     FROM verifikasi_program vp
     LEFT JOIN users u ON LOWER(u.email) = LOWER(vp.email_program)
     WHERE vp.id_usulan = $1 ORDER BY vp.created_at`, [idUsulan]
  );

  // Konfigurasi penandatangan dari DB — hanya ambil jabatan & urutan per indikator
  // nama/NIP/TT diambil dari verifikasi_program+users (by email) di getVerifierSlots
  const penandatanganCfg = await pool.query(
    `SELECT no_indikator, jabatan, urutan
     FROM indikator_penandatangan
     ORDER BY no_indikator, urutan`
  ).catch(() => ({ rows: [] }));

  // Kelompokkan per no_indikator → { 1: ['Jabatan A', 'Jabatan B'], 2: [...] }
  const JABATAN_MAP_DB = {};
  for (const row of penandatanganCfg.rows) {
    if (!JABATAN_MAP_DB[row.no_indikator]) JABATAN_MAP_DB[row.no_indikator] = [];
    JABATAN_MAP_DB[row.no_indikator].push(row.jabatan);
  }

  const bulanNama = ['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const bulan = bulanNama[h.bulan] || h.bulan;
  const _nowDt = new Date();
  const _nowOpt = { timeZone: 'Asia/Makassar' };
  const now = _nowDt.toLocaleDateString('id-ID', { ..._nowOpt, day:'2-digit', month:'long', year:'numeric' })
            + ' | ' + _nowDt.toLocaleTimeString('id-ID', { ..._nowOpt, hour:'2-digit', minute:'2-digit', hour12:false }).replace('.', ':') + ' WITA';

  // Helper lowercase untuk string nullable
  function LOWER(s) { return (s||'').toLowerCase(); }

  // Helper title case — hanya huruf pertama tiap kata kapital
  function toTitleCase(s) {
    return (s||'').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  }

  function getVerifierSlots(noInd) {
    const jabatanList = JABATAN_MAP_DB[noInd] || [];

    // PP yang benar-benar memverifikasi indikator ini (dari verifikasi_program)
    // Difilter by indikator_akses user agar hanya yang relevan
    const eligible = vpResult.rows.filter(v => {
      const akses = (v.user_indikator_akses||'').split(',').map(s=>s.trim()).filter(Boolean);
      return akses.includes(String(noInd));
    });

    if (!jabatanList.length) {
      // Belum dikonfigurasi → fallback tampilkan PP yang sudah verifikasi
      return eligible.map(v => ({
        // Jabatan label: dari jabatan_program (yang disimpan saat verif) atau jabatan_user
        jabatan: (v.jabatan_program||'').split('|')[0].trim()
               || (v.jabatan_user||'').split('|')[0].trim()
               || 'Pengelola Program',
        nama: v.nama_program || v.nama_user || v.email_program,
        nip: v.nip_program || v.nip_user || '',
        tt: v.tt_program || '',
        verifiedAt: v.verified_at,
        status: v.status,
      }));
    }

    // Ada konfigurasi → per slot jabatan, cari PP yang:
    //   1. Sudah verifikasi indikator ini (ada di eligible)
    //   2. Jabatan usernya mengandung jabatan yang dikonfigurasi
    // Jabatan label tetap dari konfigurasi (bukan dari users.jabatan)
    return jabatanList.map(jabatanCfg => {
      const cfgKey = jabatanCfg.toLowerCase().replace(' kabupaten', '').trim();

      const verif = eligible.find(v => {
        // Pecah multi-jabatan user (dipisah '|')
        const userJabatanList = [
          ...(v.jabatan_user||'').split('|'),
          ...(v.jabatan_program||'').split('|'),
        ].map(j => j.trim().toLowerCase().replace(' kabupaten', '').trim());
        return userJabatanList.some(j => j === cfgKey || j.includes(cfgKey) || cfgKey.includes(j));
      });

      if (!verif) return null; // slot ini belum diverifikasi, skip

      return {
        // Jabatan label dari KONFIGURASI (bukan dari users.jabatan)
        jabatan: jabatanCfg,
        // Nama, NIP, TT dari user yang benar-benar verifikasi
        nama: verif.nama_program || verif.nama_user || verif.email_program,
        nip: verif.nip_program || verif.nip_user || '',
        tt: verif.tt_program || '',
        verifiedAt: verif.verified_at,
        status: verif.status,
      };
    }).filter(s => s !== null);
  }

  function signBlock(slot) {
    const { jabatan, nama, nip, tt: ttRaw, verifiedAt, status } = slot;
    const approved = status === 'Selesai';
    const tt = ttRaw && ttRaw.startsWith('data:image') ? (compressBase64Img(ttRaw) || '') : (ttRaw || '');
    const ttValid = tt && (tt.startsWith('data:image') || tt.startsWith('http'));

    let signImg;
    if (!approved) {
      signImg = `<div style="width:80px;height:80px;border:2px dashed #cbd5e1;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:#94a3b8;font-size:10px;margin-bottom:6px">Belum</div>
                 <div style="font-size:9px;color:#94a3b8;margin-bottom:2px">Menunggu persetujuan</div>`;
    } else if (ttValid) {
      signImg = `<div style="height:80px;display:flex;align-items:center;justify-content:center;margin-bottom:4px">
                   <img src="${tt}" style="max-height:70px;max-width:160px;object-fit:contain;display:block;margin:0 auto">
                 </div>
                 <div style="font-size:9px;color:#2d7a47;font-weight:700;margin-bottom:2px;display:flex;align-items:center;justify-content:center;gap:4px"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"11\" height=\"11\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#2d7a47\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M22 11.08V12a10 10 0 1 1-5.93-9.14\"/><polyline points=\"22 4 12 14.01 9 11.01\"/></svg>Diverifikasi: ${fmtDT(verifiedAt)}</div>`;
    } else {
      signImg = `<div style="display:inline-block;margin-bottom:6px">${approvedBadgeSVG()}</div>
                 <div style="font-size:9px;color:#2d7a47;font-weight:700;margin-bottom:2px;display:flex;align-items:center;justify-content:center;gap:4px"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"11\" height=\"11\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#2d7a47\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M22 11.08V12a10 10 0 1 1-5.93-9.14\"/><polyline points=\"22 4 12 14.01 9 11.01\"/></svg>Diverifikasi: ${fmtDT(verifiedAt)}</div>`;
    }
    return `<div style="text-align:center;flex:1">
      <div style="font-size:11px;color:#334155;margin-bottom:4px;font-weight:600">${jabatan}</div>
      ${signImg}
      <div style="display:inline-block;text-align:center">
        <div style="font-size:11px;font-weight:700;border-bottom:1px solid #334155;padding-bottom:2px;white-space:nowrap">${nama}</div>
        ${nip ? `<div style="font-size:11px">NIP. ${nip}</div>` : ''}
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
    const nipHtml = nip ? `<div style="font-size:11px">NIP. ${nip}</div>` : '';
    let signImg;
    if (!approved) {
      signImg = `<div style="width:80px;height:80px;border:2px dashed #cbd5e1;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:#94a3b8;font-size:10px;margin-bottom:6px">Belum</div>
                 <div style="font-size:9px;color:#94a3b8;margin-bottom:2px">Menunggu persetujuan</div>`;
    } else if (ttValid) {
      signImg = `<div style="height:80px;display:flex;align-items:center;justify-content:center;margin-bottom:4px">
                   <img src="${tt}" style="max-height:70px;max-width:160px;object-fit:contain;display:block;margin:0 auto">
                 </div>
                 <div style="font-size:9px;color:#2d7a47;font-weight:700;margin-bottom:2px;display:flex;align-items:center;justify-content:center;gap:4px"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"11\" height=\"11\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#2d7a47\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M22 11.08V12a10 10 0 1 1-5.93-9.14\"/><polyline points=\"22 4 12 14.01 9 11.01\"/></svg>Diverifikasi: ${fmtDT(h.kapus_approved_at)}</div>`;
    } else {
      signImg = `<div style="display:inline-block;margin-bottom:6px">${approvedBadgeSVG()}</div>
                 <div style="font-size:9px;color:#2d7a47;font-weight:700;margin-bottom:2px;display:flex;align-items:center;justify-content:center;gap:4px"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"11\" height=\"11\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#2d7a47\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M22 11.08V12a10 10 0 1 1-5.93-9.14\"/><polyline points=\"22 4 12 14.01 9 11.01\"/></svg>Diverifikasi: ${fmtDT(h.kapus_approved_at)}</div>`;
    }
    return `<div style="text-align:center;flex:1">
      <div style="font-size:11px;color:#334155;margin-bottom:4px;font-weight:600">Kepala UPTD Puskesmas ${toTitleCase(h.nama_puskesmas)||h.kode_pkm}</div>
      ${signImg}
      <div style="display:inline-block;text-align:center">
        <div style="font-size:11px;font-weight:700;border-bottom:1px solid #334155;padding-bottom:2px;white-space:nowrap">${nama}</div>
        ${nipHtml}
      </div>
    </div>`;
  }

  function pejabatSignBlock(pj, jabatanLabel) {
    const ttRaw3 = pj.tanda_tangan || '';
    const tt = ttRaw3.startsWith('data:image') ? (compressBase64Img(ttRaw3) || '') : ttRaw3;
    const ttValid = tt && (tt.startsWith('data:image') || tt.startsWith('http'));
    const tsHtml = h.admin_approved_at
      ? `<div style="font-size:9px;color:#2d7a47;font-weight:700;margin-bottom:2px;display:flex;align-items:center;justify-content:center;gap:4px"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"11\" height=\"11\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#2d7a47\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M22 11.08V12a10 10 0 1 1-5.93-9.14\"/><polyline points=\"22 4 12 14.01 9 11.01\"/></svg>Diverifikasi: ${fmtDT(h.admin_approved_at)}</div>`
      : '';
    return `<div style="text-align:center;flex:1">
      <div style="font-size:11px;color:#334155;margin-bottom:4px;font-weight:600">${jabatanLabel}</div>
      ${ttValid
        ? `<div style="height:80px;display:flex;align-items:center;justify-content:center;margin-bottom:4px">
             <img src="${tt}" style="max-height:72px;max-width:160px;object-fit:contain;display:block;margin:0 auto">
           </div>`
        : `<div style="width:80px;height:80px;border:2px dashed #cbd5e1;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:#94a3b8;font-size:10px;margin-bottom:6px">TT</div>`}
      ${tsHtml}
      <div style="display:inline-block;text-align:center">
        <div style="font-size:11px;font-weight:700;border-bottom:1px solid #334155;padding-bottom:2px;white-space:nowrap">${pj.nama||'-'}</div>        ${pj.nip ? `<div style="font-size:11px">NIP. ${pj.nip}</div>` : ''}
      </div>
    </div>`;
  }

  function buildSignLayout(slots, tanggalAdean) {
    const dateLabel = tanggalAdean
      ? `<div style="font-size:10px;color:#334155;margin-bottom:6px;text-align:right">${tanggalAdean}</div>`
      : '';
    const kapus = kapusSignBlock();
    if (isSementara) {
      return `<div style="display:flex;justify-content:flex-end"><div style="text-align:center">${dateLabel}${kapus}</div></div>`;
    }
    // Baris 1: slot[0] kiri + kapus kanan (selalu)
    // dateLabel di atas row, text-align:right → rata kanan sejajar kapus
    // Sisa: 2 per baris, rata tengah
    if (!slots.length) {
      return `<div style="display:flex;justify-content:flex-end"><div style="text-align:center">${dateLabel}${kapus}</div></div>`;
    }
    const row1 = `${dateLabel}<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:20px">${signBlock(slots[0])}${kapus}</div>`;
    const rest = slots.slice(1);
    let extraRows = '';
    for (let i = 0; i < rest.length; i += 2) {
      const chunk = rest.slice(i, i + 2);
      const justify = chunk.length === 1 ? 'center' : 'space-between';
      extraRows += `<div style="display:flex;justify-content:${justify};align-items:flex-start;gap:20px;margin-top:14px">${chunk.map(s => signBlock(s)).join('')}</div>`;
    }
    return row1 + extraRows;
  }

  // Build pages
  const _allInds = aksesFilter && aksesFilter.length
    ? indResult.rows.filter(ind => aksesFilter.includes(ind.no_indikator))
    : indResult.rows;

  // ── LAPORAN SEMENTARA: semua 12 indikator dalam 1 halaman tabel ─────────────
  let pagesHtml;
  if (isSementara) {
    const infoHeader = `
      ${kopSurat()}
      <div style="text-align:center;margin-bottom:14px">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase">Laporan Sementara Standar Pelayanan Minimal (SPM)</div>
        <div style="font-size:12px;font-weight:700;text-transform:uppercase">Bidang Kesehatan Tahun ${h.tahun}</div>
        <div style="margin-top:4px;display:inline-block;background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:2px 12px;font-size:10px;font-weight:700;color:#b45309">LAPORAN SEMENTARA</div>
      </div>
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
              <tr><td style="padding:2px 0"><strong>Indeks SPM</strong></td><td style="padding:2px 0">: <strong>${parseFloat(h.indeks_spm||0).toFixed(2)}</strong></td></tr>
            </table>
          </td>
        </tr>
      </table>`;

    const tabelRows = _allInds.map((ind, i) => {
      const sasaranTahunan = parseInt(ind.sasaran_tahunan) || 0;
      const target  = parseFloat(ind.target)  || 0;
      const capaian = parseFloat(ind.capaian) || 0;
      const realisasiKumulatif = parseFloat(ind.realisasi_kumulatif) || 0;
      const _isKunci1 = [8,9].includes(parseInt(ind.no_indikator));
      const sisaTarget = sasaranTahunan > 0 ? (_isKunci1 ? sasaranTahunan : Math.max(0, sasaranTahunan - realisasiKumulatif)) : '-';
      const capaianPct = parseFloat(ind.capaian_pct || 0).toFixed(2);
      const bg = i % 2 === 0 ? '#f8fafc' : 'white';
      const sisaColor = typeof sisaTarget === 'number' && sisaTarget === 0 ? '#16a34a' : '#1e293b';
      return `<tr style="background:${bg}">
        <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:center;font-weight:700">${ind.no_indikator}</td>
        <td style="padding:6px 8px;border:1px solid #cbd5e1;font-size:10.5px">${ind.nama_indikator||'-'}</td>
        <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:center">${sasaranTahunan > 0 ? sasaranTahunan : '<span style="color:#94a3b8">-</span>'}</td>
        <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:center">${target}</td>
        <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:center">${capaian}</td>
        <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:center;font-weight:700;color:${sisaColor}">${typeof sisaTarget === 'number' ? sisaTarget : '<span style="color:#94a3b8">-</span>'}</td>
        <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:center;font-weight:700;color:#1e293b">${capaianPct}%</td>
      </tr>`;
    }).join('');

    const tanda_tangan_kapus = kapusSignBlock();
    pagesHtml = `<div class="page-break">
      ${infoHeader}
      <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:20px">
        <thead>
          <tr style="background:#1e293b;color:white">
            <th style="padding:7px 8px;border:1px solid #334155;text-align:center;width:30px;text-transform:uppercase">No</th>
            <th style="padding:7px 8px;border:1px solid #334155;text-align:center;text-transform:uppercase">Nama Indikator</th>
            <th style="padding:7px 8px;border:1px solid #334155;text-align:center;width:65px;font-size:10px;text-transform:uppercase">Target<br>Tahunan</th>
            <th style="padding:7px 8px;border:1px solid #334155;text-align:center;width:65px;font-size:10px;text-transform:uppercase">Target<br>Bulan Ini</th>
            <th style="padding:7px 8px;border:1px solid #334155;text-align:center;width:65px;font-size:10px;text-transform:uppercase">Realisasi<br>Bulan Ini</th>
            <th style="padding:7px 8px;border:1px solid #334155;text-align:center;width:65px;font-size:10px;text-transform:uppercase">Sisa<br>Target Tahunan</th>
            <th style="padding:7px 8px;border:1px solid #334155;text-align:center;width:60px;text-transform:uppercase">Capaian</th>
          </tr>
        </thead>
        <tbody>${tabelRows}</tbody>
      </table>
      <div style="margin-top:28px;display:flex;justify-content:flex-end">
        <div style="text-align:center">
          <div style="font-size:10px;color:#334155;margin-bottom:6px">Adean, ${fmtDT(h.kapus_approved_at)}</div>
          ${tanda_tangan_kapus}
        </div>
      </div>
    </div>`;

  } else {
    // ── LAPORAN FINAL: per indikator, 1 halaman masing-masing ────────────────
    pagesHtml = _allInds.map(ind => {
      const sasaranTahunan = parseInt(ind.sasaran_tahunan) || 0;
      const target  = parseFloat(ind.target)  || 0;
      const capaian = parseFloat(ind.capaian) || 0;
      const realisasiKumulatif = parseFloat(ind.realisasi_kumulatif) || 0;
      const _isKunci2 = [8,9].includes(parseInt(ind.no_indikator));
      const sisaTarget = sasaranTahunan > 0 ? (_isKunci2 ? sasaranTahunan : Math.max(0, sasaranTahunan - realisasiKumulatif)) : null;
      const capaianPct = parseFloat(ind.capaian_pct || 0).toFixed(2);
      const catatan = ind.catatan_indikator || '';
      const slots = getVerifierSlots(ind.no_indikator);

      return `
      <div class="page-break">
        ${kopSurat()}
        <!-- JUDUL -->
        <div style="text-align:center;margin-bottom:16px">
          <div style="font-size:12px;font-weight:700;text-transform:uppercase">Lembar Hasil Verifikasi Laporan Standar Pelayanan Minimal (SPM)</div>
          <div style="font-size:12px;font-weight:700;text-transform:uppercase">Bidang Kesehatan Tahun ${h.tahun}</div>
        </div>
        <!-- INFO 2 KOLOM -->
        <table style="width:100%;margin-bottom:14px;font-size:11px">
          <tr>
            <td style="width:50%;vertical-align:top">
              <table style="width:100%;border-collapse:collapse">
                <colgroup><col style="width:90px"><col style="width:12px"><col></colgroup>
                <tr><td style="padding:2px 0;vertical-align:top;white-space:nowrap">ID Usulan</td><td style="padding:2px 0;vertical-align:top">:</td><td style="padding:2px 0;vertical-align:top"><strong>${h.id_usulan}</strong></td></tr>
                <tr><td style="padding:2px 0;vertical-align:top;white-space:nowrap">Puskesmas</td><td style="padding:2px 0;vertical-align:top">:</td><td style="padding:2px 0;vertical-align:top">${h.nama_puskesmas||h.kode_pkm}</td></tr>
                <tr><td style="padding:2px 0;vertical-align:top;white-space:nowrap">Periode</td><td style="padding:2px 0;vertical-align:top">:</td><td style="padding:2px 0;vertical-align:top">${bulan} ${h.tahun}</td></tr>
                <tr><td style="padding:2px 0;vertical-align:top;white-space:nowrap">Indikator</td><td style="padding:2px 0;vertical-align:top">:</td><td style="padding:2px 0;vertical-align:top"><strong>${ind.nama_indikator||'-'}</strong></td></tr>
              </table>
            </td>
            <td style="width:50%;vertical-align:top;padding-left:20px">
              <table style="width:100%;border-collapse:collapse">
                <colgroup><col style="width:150px"><col style="width:12px"><col></colgroup>
                <tr><td style="padding:2px 0;vertical-align:top;white-space:nowrap">Status</td><td style="padding:2px 0;vertical-align:top">:</td><td style="padding:2px 0;vertical-align:top">${h.status_global||'Draft'}</td></tr>
                <tr><td style="padding:2px 0;vertical-align:top;white-space:nowrap">Indeks Beban Kerja</td><td style="padding:2px 0;vertical-align:top">:</td><td style="padding:2px 0;vertical-align:top">${parseFloat(h.indeks_beban_kerja||0).toFixed(2)}</td></tr>
                <tr><td style="padding:2px 0;vertical-align:top;white-space:nowrap">Indeks Kesulitan Wilayah</td><td style="padding:2px 0;vertical-align:top">:</td><td style="padding:2px 0;vertical-align:top">${parseFloat(h.indeks_kesulitan_wilayah||0).toFixed(2)}</td></tr>
                <tr><td style="padding:2px 0;vertical-align:top;white-space:nowrap">Dicetak</td><td style="padding:2px 0;vertical-align:top">:</td><td style="padding:2px 0;vertical-align:top">${now}</td></tr>
              </table>
            </td>
          </tr>
        </table>
        <!-- TABEL DATA -->
        <table style="width:100%;border-collapse:collapse;margin-bottom:${catatan?'10px':'20px'}">
          <thead>
            <tr style="background:#1e293b;color:white">
              <th style="padding:7px 10px;font-size:11px;border:1px solid #334155;text-align:center;text-transform:uppercase">Target<br>Tahunan</th>
              <th style="padding:7px 10px;font-size:11px;border:1px solid #334155;text-align:center;text-transform:uppercase">Target<br>Bulan Ini</th>
              <th style="padding:7px 10px;font-size:11px;border:1px solid #334155;text-align:center;text-transform:uppercase">Realisasi<br>Bulan Ini</th>
              <th style="padding:7px 10px;font-size:11px;border:1px solid #334155;text-align:center;text-transform:uppercase">Sisa<br>Target Tahunan</th>
              <th style="padding:7px 10px;font-size:11px;border:1px solid #334155;text-align:center;text-transform:uppercase">Capaian</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:8px 10px;border:1px solid #cbd5e1;text-align:center;font-size:11px">${sasaranTahunan>0?sasaranTahunan:'<span style="color:#94a3b8;font-style:italic">-</span>'}</td>
              <td style="padding:8px 10px;border:1px solid #cbd5e1;text-align:center;font-size:11px">${target}</td>
              <td style="padding:8px 10px;border:1px solid #cbd5e1;text-align:center;font-size:11px">${capaian}</td>
              <td style="padding:8px 10px;border:1px solid #cbd5e1;text-align:center;font-size:11px;color:${sisaTarget !== null && sisaTarget === 0 ? '#16a34a' : '#1e293b'}">${sisaTarget !== null ? sisaTarget : '<span style="color:#94a3b8;font-style:italic">-</span>'}</td>
              <td style="padding:8px 10px;border:1px solid #cbd5e1;text-align:center;font-size:11px;font-weight:700;color:#1e293b">${capaianPct}%</td>
            </tr>
          </tbody>
        </table>
        ${catatan?`<div style="margin-bottom:20px;font-size:10px;color:#334155"><strong>Catatan :</strong> ${catatan}</div>`:''}
        <!-- TANDA TANGAN -->
        <div style="margin-top:28px">
          ${buildSignLayout(slots, `Adean, ${fmtDT(h.kapus_approved_at)}`)}
        </div>
      </div>`;
    }).join('');
  }

  // ── HALAMAN REKAP (hanya mode final) ──────────────────────────
  const rekapPage = (isSementara || (aksesFilter && aksesFilter.length > 0)) ? '' : (() => {
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
          <td style="padding:4px 10px;border:1px solid #cbd5e1;text-align:center;color:#94a3b8"></td>
          <td style="padding:4px 10px;border:1px solid #cbd5e1;color:#334155;padding-left:16px">
            <span style="display:inline-flex;align-items:baseline;gap:6px">
              <span style="color:#475569;font-size:13px;flex-shrink:0">▪</span>
              <span style="font-style:italic">${labels[0]}</span>
            </span>
          </td>
          <td style="padding:4px 10px;border:1px solid #cbd5e1;text-align:center;font-weight:600;background:#fef9c3">${capaian}</td>
        </tr>
        <tr style="background:${bgInduk}">
          <td style="padding:4px 10px;border:1px solid #cbd5e1;text-align:center;color:#94a3b8"></td>
          <td style="padding:4px 10px;border:1px solid #cbd5e1;color:#334155;padding-left:16px">
            <span style="display:inline-flex;align-items:baseline;gap:6px">
              <span style="color:#475569;font-size:13px;flex-shrink:0">▪</span>
              <span style="font-style:italic">${labels[1]}</span>
            </span>
          </td>
          <td style="padding:4px 10px;border:1px solid #cbd5e1;text-align:center;font-weight:600;background:#fef9c3">${target}</td>
        </tr>`;
    }).join('');

    const indeksSpm = parseFloat(h.indeks_spm || 0).toFixed(2);

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
        <div style="display:flex;justify-content:flex-end;align-items:flex-start">
          <div style="text-align:center">
            <div style="font-size:10px;color:#334155;margin-bottom:6px">Adean, ${fmtDT(h.admin_approved_at || h.final_approved_at)}</div>
            ${ttdKanan}
          </div>
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
    'Submit':                   '#0d9488',   // teal
    'Ajukan Ulang':             '#0284c7',   // sky blue
    'Approve':                  '#16a34a',   // green
    'Approve Final':            '#15803d',   // dark green
    'Selesai':                  '#059669',   // emerald
    'Re-verifikasi':            '#06b6d4',   // cyan
    'Respond Penolakan':        '#2563eb',   // blue
    'Tolak':                    '#dc2626',   // red
    'Tolak (sebagian)':         '#ea580c',   // orange
    'Tolak Indikator':          '#be123c',   // rose
    'Tolak Ke Operator':        '#b91c1c',   // dark red
    'Tolak Global':             '#450a0a',   // darkest red
    'Kembalikan':               '#7c3aed',   // violet
    'Dikembalikan':             '#6d28d9',   // purple
    'Kembalikan ke PP':         '#4f46e5',   // indigo
    'Sanggah':                  '#9333ea',   // purple-600
    'Sanggah Selesai':          '#a21caf',   // fuchsia
    'Sanggah → Admin':          '#7e22ce',   // purple-800
    'Sanggah → Kapus':          '#d97706',   // amber
    'Kapus Sanggah':            '#db2777',   // pink
    'Kapus Terima Penolakan':   '#f59e0b',   // yellow-amber
    'Kapus Membenarkan':        '#b45309',   // amber-700
    'Kapus Menyanggah':         '#c2410c',   // orange-700
    'Konfirmasi Re-verif':      '#0369a1',   // sky-700
    'PP Membenarkan':           '#0f766e',   // teal-700
    'Benarkan Penolakan Admin': '#991b1b',   // red-800
    'Terima Penolakan Admin':   '#7f1d1d',   // red-900
    'Reset':                    '#64748b',   // slate
    'Restore Verif':            '#6366f1',   // indigo-500
  };
  const aksiLabel = {
    'Submit':                   'Diajukan',
    'Ajukan Ulang':             'Ajukan Ulang',
    'Approve':                  'Disetujui',
    'Approve Final':            'Final Disetujui',
    'Selesai':                  'Selesai',
    'Re-verifikasi':            'Re-verifikasi',
    'Respond Penolakan':        'Respond Penolakan',
    'Tolak':                    'Ditolak',
    'Tolak (sebagian)':         'Tolak Sebagian',
    'Tolak Indikator':          'Tolak Indikator',
    'Tolak Ke Operator':        'Tolak Ke Operator',
    'Tolak Global':             'Ditolak Admin',
    'Kembalikan':               'Dikembalikan',
    'Dikembalikan':             'Dikembalikan',
    'Kembalikan ke PP':         'Kembalikan ke PP',
    'Sanggah':                  'Sanggah',
    'Sanggah Selesai':          'PP Sanggah → Admin',
    'Sanggah → Admin':          'Sanggah → Admin',
    'Sanggah → Kapus':          'Sanggah → Kapus',
    'Kapus Sanggah':            'Kapus Sanggah',
    'Kapus Terima Penolakan':   'Kapus Terima Penolakan',
    'Kapus Membenarkan':        'Kapus Setuju Tolak',
    'Kapus Menyanggah':         'Kapus Tidak Setuju',
    'Konfirmasi Re-verif':      'Konfirmasi Re-verif',
    'PP Membenarkan':           'PP Setuju Tolak → Kapus',
    'Benarkan Penolakan Admin': 'PP Setuju → Ditolak',
    'Terima Penolakan Admin':   'Terima Penolakan Admin',
    'Reset':                    'Direset Admin',
    'Restore Verif':            'Dipulihkan',
  };


  // SVG inline icons — sinkron dengan Riwayat Aktivitas di app-input.js
  function aksiSVG(aksi, color) {
    const s = (path) =>
      `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:3px;flex-shrink:0">${path}</svg>`;
    const icons = {
      // Submit — paper-plane (send)
      'Submit':
        s('<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>'),
      // Ajukan Ulang — counter-clockwise refresh
      'Ajukan Ulang':
        s('<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/>'),
      // Approve — circle-check dengan ekor luar
      'Approve':
        s('<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'),
      // Approve Final — circle dengan titik kompas (badge verified)
      'Approve Final':
        s('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/>'),
      // Re-verifikasi — clockwise rotate
      'Re-verifikasi':
        s('<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.18-5"/>'),
      // Tolak — X circle
      'Tolak':
        s('<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>'),
      // Tolak sebagian — minus circle
      'Tolak (sebagian)':
        s('<circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/>'),
      // Tolak Indikator — lightning bolt
      'Tolak Indikator':
        s('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>'),
      // Tolak Ke Operator — reply arrow
      'Tolak Ke Operator':
        s('<polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>'),
      // Tolak Global — slash circle
      'Tolak Global':
        s('<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>'),
      // Kembalikan — undo (counter-clockwise with arc)
      'Kembalikan':
        s('<polyline points="3 7 3 3 7 3"/><path d="M3 3l5 5"/><path d="M21 13A9 9 0 0 1 3 13v-3"/>'),
      // Dikembalikan — undo (sama dengan Kembalikan tapi warna berbeda)
      'Dikembalikan':
        s('<polyline points="3 7 3 3 7 3"/><path d="M3 3l5 5"/><path d="M21 13A9 9 0 0 1 3 13v-3"/>'),
      // Kembalikan ke PP — corner-down-left arrow
      'Kembalikan ke PP':
        s('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
      // Sanggah — gavel
      'Sanggah':
        s('<path d="m14 13-8.5 8.5a2.12 2.12 0 0 1-3-3L11 10"/><path d="m16 16 6-6"/><path d="m8 8 6-6"/><path d="m9 7 8 8"/>'),
      // Sanggah Selesai — gavel + filled dot
      'Sanggah Selesai':
        s('<path d="m14 13-8.5 8.5a2.12 2.12 0 0 1-3-3L11 10"/><path d="m16 16 6-6"/><path d="m8 8 6-6"/><path d="m9 7 8 8"/><circle cx="20" cy="4" r="2" fill="currentColor" stroke="none"/>'),
      // Sanggah → Admin — double reply arrows
      'Sanggah → Admin':
        s('<polyline points="7 17 2 12 7 7"/><polyline points="12 17 7 12 12 7"/><path d="M22 18v-2a4 4 0 0 0-4-4H7"/>'),
      // Sanggah → Kapus — double reply arrows + filled dot
      'Sanggah → Kapus':
        s('<polyline points="7 17 2 12 7 7"/><polyline points="12 17 7 12 12 7"/><path d="M22 18v-2a4 4 0 0 0-4-4H7"/><circle cx="22" cy="8" r="2" fill="currentColor" stroke="none"/>'),
      // Kapus Sanggah — gavel (sama bentuk)
      'Kapus Sanggah':
        s('<path d="m14 13-8.5 8.5a2.12 2.12 0 0 1-3-3L11 10"/><path d="m16 16 6-6"/><path d="m8 8 6-6"/><path d="m9 7 8 8"/>'),
      // Kapus Terima Penolakan — undo
      'Kapus Terima Penolakan':
        s('<polyline points="3 7 3 3 7 3"/><path d="M3 3l5 5"/><path d="M21 13A9 9 0 0 1 3 13v-3"/>'),
      // Respond Penolakan — chat bubble + plus
      'Respond Penolakan':
        s('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="9" y1="10" x2="15" y2="10"/><line x1="12" y1="7" x2="12" y2="13"/>'),
      // Kapus Membenarkan — user-check
      'Kapus Membenarkan':
        s('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/>'),
      // Kapus Menyanggah — gavel (sama tapi warna berbeda)
      'Kapus Menyanggah':
        s('<path d="m14 13-8.5 8.5a2.12 2.12 0 0 1-3-3L11 10"/><path d="m16 16 6-6"/><path d="m8 8 6-6"/><path d="m9 7 8 8"/>'),
      // Konfirmasi Re-verif — user-check
      'Konfirmasi Re-verif':
        s('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/>'),
      // PP Membenarkan — clipboard check
      'PP Membenarkan':
        s('<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>'),
      // Benarkan Penolakan Admin — clipboard check
      'Benarkan Penolakan Admin':
        s('<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>'),
      // Terima Penolakan Admin — rect check
      'Terima Penolakan Admin':
        s('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m9 12 2 2 4-4"/>'),
      // Selesai — filled circle check
      'Selesai':
        s('<path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/>'),
      // Reset — counter-clockwise double arrow
      'Reset':
        s('<path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>'),
      // Restore Verif — history dengan titik peringatan
      'Restore Verif':
        s('<path d="M3.06 13a9 9 0 1 0 .49-4.95"/><polyline points="3 3 3 9 9 9"/><line x1="12" y1="7" x2="12" y2="12"/><circle cx="12" cy="15" r="1" fill="currentColor" stroke="none"/>'),
    };
    return icons[aksi] || s('<circle cx="12" cy="12" r="4"/>');
  }

  const theadHtml = `<tr style="background:#1e293b">
    <th style="color:white;font-size:11px;padding:7px 10px;border:1px solid #334155;text-align:center;text-transform:uppercase;width:28px">NO</th>
    <th style="color:white;font-size:11px;padding:7px 10px;border:1px solid #334155;text-align:center;text-transform:uppercase;width:130px">Aksi</th>
    <th style="color:white;font-size:11px;padding:7px 10px;border:1px solid #334155;text-align:center;text-transform:uppercase;width:130px">Nama</th>
    <th style="color:white;font-size:11px;padding:7px 10px;border:1px solid #334155;text-align:center;text-transform:uppercase;width:85px">Role</th>
    <th style="color:white;font-size:11px;padding:7px 10px;border:1px solid #334155;text-align:center;text-transform:uppercase;width:115px">Waktu</th>
    <th style="color:white;font-size:11px;padding:7px 10px;border:1px solid #334155;text-align:center;text-transform:uppercase">Detail</th>
  </tr>`;

  const logs = logResult.rows;
  const rowsHtml = logs.map((log, i) => {
    const _aksi = (log.aksi || '').trim();
    const color = aksiColor[_aksi] || '#64748b';
    const label = aksiLabel[_aksi] || _aksi;
    const detail = log.detail
      ? `<div style="margin-top:4px;font-size:11px;color:#334155;background:#f8fafc;border-left:3px solid ${color};padding:4px 8px;border-radius:0 4px 4px 0;word-break:break-word">${log.detail}</div>` : '';
    return `<tr style="${i%2===1?'background:#f8fafc':''}">
      <td style="padding:7px 10px;border:1px solid #cbd5e1;text-align:center;font-weight:700;color:${color}">${i+1}</td>
      <td style="padding:7px 10px;border:1px solid #cbd5e1;word-break:break-word">
        <span style="display:inline-flex;align-items:center;font-size:11px;font-weight:700;color:${color}">${aksiSVG(_aksi,color)}${label}</span>
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
          </table>
        </td>
        <td style="width:50%;vertical-align:top;padding-left:20px">
          <table style="width:100%">
            <tr><td style="width:160px;padding:2px 0">Indeks Beban Kerja</td><td style="padding:2px 0">: ${parseFloat(r.indeks_beban_kerja||0).toFixed(2)}</td></tr>
            <tr><td style="padding:2px 0">Indeks Kesulitan Wilayah</td><td style="padding:2px 0">: ${parseFloat(r.indeks_kesulitan_wilayah||0).toFixed(2)}</td></tr>
            <tr><td style="padding:2px 0"><strong>Indeks SPM</strong></td><td style="padding:2px 0">: <strong>${parseFloat(r.indeks_spm||0).toFixed(2)}</strong></td></tr>
            <tr><td style="padding:2px 0">Dicetak</td><td style="padding:2px 0">: ${nowStr}</td></tr>
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
//  MODE: rekap — tabel rekap semua usulan sesuai filter
//  Dipanggil dari handler dengan ?mode=rekap&ids=id1,id2,...
//  Opsional: &tahun=2026&bulan=Januari&pkm=NUSANTARA&status=Selesai
// ============================================================
async function generateLaporanRekap(pool, ids, filterLabel) {
  if (!ids || !ids.length) throw new Error('Tidak ada data untuk direkap');

  const bulanNama = ['','Januari','Februari','Maret','April','Mei','Juni',
    'Juli','Agustus','September','Oktober','November','Desember'];

  // Fetch semua header sekaligus
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
  const result = await pool.query(
    `SELECT uh.*, p.nama_puskesmas
     FROM usulan_header uh
     LEFT JOIN master_puskesmas p ON uh.kode_pkm = p.kode_pkm
     WHERE uh.id_usulan IN (${placeholders})
     ORDER BY uh.tahun DESC, uh.bulan DESC, p.nama_puskesmas`,
    ids
  );
  const rows = result.rows;

  const _nowRekap = new Date();
  const _nowOpt = { timeZone: 'Asia/Makassar' };
  const nowStr = _nowRekap.toLocaleDateString('id-ID', { ..._nowOpt, day: '2-digit', month: 'long', year: 'numeric' })
    + ' | ' + _nowRekap.toLocaleTimeString('id-ID', { ..._nowOpt, hour: '2-digit', minute: '2-digit', hour12: false }).replace('.', ':') + ' WITA';

  // Hitung summary
  const total    = rows.length;
  const selesai  = rows.filter(r => r.status_global === 'Selesai').length;
  const pending  = rows.filter(r => !['Selesai','Ditolak'].includes(r.status_global)).length;
  const spmNums  = rows.map(r => parseFloat(r.indeks_spm)).filter(v => v > 0);
  const rataSPM  = spmNums.length ? (spmNums.reduce((a,b)=>a+b,0)/spmNums.length).toFixed(2) : '0';

  const statusColor = (s) => {
    if (s === 'Selesai') return '#16a34a';
    if (s === 'Ditolak' || s === 'Ditolak Sebagian') return '#dc2626';
    if ((s||'').includes('Menunggu')) return '#d97706';
    return '#475569';
  };
  const statusBg = (s) => {
    if (s === 'Selesai') return '#dcfce7';
    if (s === 'Ditolak' || s === 'Ditolak Sebagian') return '#fee2e2';
    if ((s||'').includes('Menunggu')) return '#fef3c7';
    return '#f1f5f9';
  };

  const rowsHtml = rows.map((r, i) => {
    const status = r.status_global || 'Draft';
    const spm = parseFloat(r.indeks_spm||0).toFixed(2);
    const namaBln = bulanNama[r.bulan] || '';
    return `<tr style="${i%2===1?'background:#f8fafc':''}">
      <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:center;font-weight:600;color:#475569">${i+1}</td>
      <td style="padding:6px 8px;border:1px solid #e2e8f0;font-weight:600">${r.nama_puskesmas||r.kode_pkm}</td>
      <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:center">${namaBln} ${r.tahun}</td>
      <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:center;font-size:10px;color:#64748b">${fmtDT(r.created_at)}</td>
      <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:center;font-weight:700;color:#0d9488">${spm}</td>
      <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:center">
        <span style="background:${statusBg(status)};color:${statusColor(status)};border-radius:20px;padding:2px 8px;font-size:10px;font-weight:700;white-space:nowrap">${status}</span>
      </td>
    </tr>`;
  }).join('');

  const filterInfoHtml = filterLabel
    ? `<div style="font-size:10.5px;color:#64748b;margin-top:4px">Filter: ${filterLabel}</div>`
    : '';

  const bodyHtml = `
    ${kopSurat()}
    <div style="text-align:center;margin:14px 0 10px">
      <div style="font-size:13px;font-weight:700;text-transform:uppercase">Rekap Laporan Usulan</div>
      <div style="font-size:12px;font-weight:700;text-transform:uppercase">Indeks Standar Pelayanan Minimal (SPM) Bidang Kesehatan</div>
      ${filterInfoHtml}
    </div>
    <!-- Tabel data -->
    <table style="width:100%;border-collapse:collapse;font-size:11px">
      <thead>
        <tr style="background:#1e293b">
          <th style="color:white;padding:7px 8px;border:1px solid #334155;text-align:center;width:28px">NO</th>
          <th style="color:white;padding:7px 8px;border:1px solid #334155;text-align:left">PUSKESMAS</th>
          <th style="color:white;padding:7px 8px;border:1px solid #334155;text-align:center;width:100px">PERIODE</th>
          <th style="color:white;padding:7px 8px;border:1px solid #334155;text-align:center;width:130px">TGL DIBUAT</th>
          <th style="color:white;padding:7px 8px;border:1px solid #334155;text-align:center;width:70px">INDEKS SPM</th>
          <th style="color:white;padding:7px 8px;border:1px solid #334155;text-align:center;width:110px">STATUS</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <div style="margin-top:10px;font-size:10px;color:#94a3b8;text-align:right">Dicetak: ${nowStr}</div>`;

  const filename = `Rekap_Laporan_SPM.pdf`;
  return { html: wrapHtml('Rekap Laporan SPM', bodyHtml), filename };
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
  const mode = params.mode || 'final'; // 'sementara' | 'final' | 'log' | 'rekap'
  const aksesParam = params.akses || '';
  const aksesFilter = aksesParam ? aksesParam.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0) : [];

  // Mode rekap — tidak butuh single id, tapi butuh ?ids=id1,id2,...
  if (mode === 'rekap') {
    const idsParam = params.ids || '';
    const ids = idsParam.split(',').map(s => s.trim()).filter(Boolean);
    if (!ids.length) return { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*' }, body: 'Parameter ids diperlukan' };
    try {
      const pool = getPool();
      const filterLabel = params.filter_label ? decodeURIComponent(params.filter_label) : '';
      const { html, filename } = await generateLaporanRekap(pool, ids, filterLabel);
      const rawBytes = Buffer.byteLength(html, 'utf8');
      if (rawBytes > 3 * 1024 * 1024) {
        const compressed = await gzip(html);
        return { statusCode: 200, isBase64Encoded: true, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Encoding': 'gzip', 'Content-Disposition': `inline; filename="${filename}"`, 'Access-Control-Allow-Origin': '*' }, body: compressed.toString('base64') };
      }
      return { statusCode: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Disposition': `inline; filename="${filename}"`, 'Access-Control-Allow-Origin': '*' }, body: html };
    } catch(e) {
      return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: e.message }) };
    }
  }

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