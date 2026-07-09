// ── Inject CSS untuk Month Picker Laporan ────────────────────────────────
(function() {
  if (document.getElementById('lap-mp-style')) return;
  const s = document.createElement('style');
  s.id = 'lap-mp-style';
  s.textContent = `
    .lap-mp { position:relative; display:inline-flex; align-items:center; gap:6px; padding:5px 12px; border:1.5px solid #e2e8f0; border-radius:8px; background:#fff; cursor:pointer; font-size:0.84rem; font-weight:600; color:#0f172a; user-select:none; transition:border-color .15s,box-shadow .15s; min-width:110px; }
    .lap-mp:hover { border-color:#0d9488; }
    .lap-mp.open  { border-color:#0d9488; box-shadow:0 0 0 3px rgba(13,148,136,.10); }
    .lap-mp-label { flex:1; }
    .lap-mp-caret { opacity:.4; flex-shrink:0; }
    .lap-mp-panel { position:absolute; top:calc(100% + 6px); left:0; z-index:1100; background:#fff; border:1.5px solid #e2e8f0; border-radius:14px; box-shadow:0 10px 30px rgba(0,0,0,.13); padding:12px; display:none; min-width:200px; }
    .lap-mp.open .lap-mp-panel { display:block; }
    .lap-mp-nav { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
    .lap-mp-year { font-size:0.9rem; font-weight:800; color:#0f172a; }
    .lap-mp-nav-btn { background:none; border:none; cursor:pointer; padding:4px 6px; border-radius:6px; display:flex; align-items:center; color:#64748b; transition:background .12s; }
    .lap-mp-nav-btn:hover:not(:disabled) { background:#f1f5f9; color:#0d9488; }
    .lap-mp-nav-btn:disabled { opacity:.25; cursor:default; }
    .lap-mp-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:4px; }
    .lap-mp-cell { padding:7px 4px; text-align:center; border-radius:8px; font-size:0.78rem; font-weight:600; color:#374151; cursor:pointer; transition:background .12s,color .12s; }
    .lap-mp-cell:hover:not(.disabled) { background:#f0fdfa; color:#0d9488; }
    .lap-mp-cell.active { background:#0d9488; color:#fff !important; }
    .lap-mp-cell.disabled { color:#cbd5e1; cursor:default; }
    .lap-range-filter { display:flex; align-items:center; gap:10px; flex-wrap:wrap; width:100%; }
    .lap-range-icon { display:flex; flex-shrink:0; }
    .lap-range-group { display:flex; align-items:center; gap:8px; flex:0 1 auto; min-width:0; }
    .lap-range-label { font-size:0.72rem; font-weight:600; color:#94a3b8; white-space:nowrap; flex-shrink:0; }
    .lap-range-group .lap-mp { flex:1 1 auto; min-width:0; }
    @media (max-width: 900px) {
      .lap-range-icon { display:none; }
      .lap-range-filter { width:100%; }
      .lap-range-group { flex:1 1 calc(50% - 5px); }
    }
    @media (max-width: 480px) {
      .lap-range-filter { gap:6px; flex-wrap:nowrap; }
      .lap-range-group { flex:1 1 50%; min-width:0; }
      .lap-range-label { font-size:0.66rem; }
      .lap-mp { min-width:0; width:100%; padding:6px 8px; box-sizing:border-box; gap:4px; }
      .lap-mp-label { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .lap-mp-panel { left:0; right:auto; min-width:0; width:200px; }
    }
  `;
  document.head.appendChild(s);
})();

// laporan.js — Fungsi Laporan Surat & Laporan Kinerja

// ══════════════════════════════════════════════════════
//  LAPORAN SURAT
// ══════════════════════════════════════════════════════

const BULAN_NAMA = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

let _laporanSuratFilterReady = false;

async function _initLaporanSuratFilter(smRows, skRows) {
  const sel = document.getElementById('laporanSuratTahun');
  if (!sel) return;

  // Simpan pilihan user sebelum rebuild
  const currentVal = sel.value;

  // Kumpulkan tahun dari data surat yang benar-benar ada
  const tahunSet = new Set();
  smRows.forEach(r => { if (r.tanggal_terima) tahunSet.add(new Date(r.tanggal_terima).getFullYear()); });
  skRows.forEach(r => { if (r.tanggal_surat)  tahunSet.add(new Date(r.tanggal_surat ).getFullYear()); });
  const tahunList = [...tahunSet].sort((a, b) => b - a);

  // Rebuild options
  sel.innerHTML = '';

  // "Semua Tahun" selalu di atas, dan jadi default
  const optSemua = document.createElement('option');
  optSemua.value = '';
  optSemua.textContent = 'Semua Tahun';
  sel.appendChild(optSemua);

  tahunList.forEach(y => {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = 'Tahun ' + y;
    sel.appendChild(opt);
  });

  // Pertahankan pilihan user jika masih valid, selainnya default ke "Semua Tahun"
  if (currentVal && tahunList.includes(parseInt(currentVal))) {
    sel.value = currentVal;
  } else {
    sel.value = '';
  }

  _laporanSuratFilterReady = true;
}

// ── Spinner helper untuk Laporan Surat ────────────────────────────────────
function _showLaporanSuratLoading() {
  const stats = document.getElementById('laporanSuratStats');
  const tbody = document.getElementById('laporanSuratTableBody');
  if (stats) stats.innerHTML = '';
  if (tbody) tbody.innerHTML = `
    <tr>
      <td colspan="8">
        <div class="lap-loading-wrap">
          <div class="lap-spinner"></div>
          <div style="margin-top:.75rem;color:#64748b;font-size:.85rem">Memuat data...</div>
        </div>
      </td>
    </tr>`;
}

async function loadLaporanSurat() {
  _showLaporanSuratLoading();
  // ── Fetch data dulu ──
  let smRows = [], skRows = [];
  try {
    const [smRes, skRes] = await Promise.all([
      fetch(`/.netlify/functions/surat-masuk?limit=9999&page=1`, { headers: authHeaders() }),
      fetch(`/.netlify/functions/surat-keluar?limit=9999&page=1`, { headers: authHeaders() }),
    ]);
    if (smRes.ok) { const d = await smRes.json(); smRows = d.surat || []; }
    if (skRes.ok) { const d = await skRes.json(); skRows = d.surat || []; }
  } catch (err) {
    console.error('[loadLaporanSurat]', err);
  }

  // ── Bangun dropdown tahun dari data nyata ──
  await _initLaporanSuratFilter(smRows, skRows);

  const tahunRaw = document.getElementById('laporanSuratTahun')?.value || '';
  const tahun  = tahunRaw ? parseInt(tahunRaw) : null;
  const jenis  = document.getElementById('laporanSuratJenis')?.value  || '';
  const status = document.getElementById('laporanSuratStatus')?.value || '';

  // Filter tahun (null = Semua Tahun, tidak difilter)
  let smFiltered = smRows, skFiltered = skRows;
  if (tahun) {
    smFiltered = smRows.filter(r => r.tanggal_terima && new Date(r.tanggal_terima).getFullYear() === tahun);
    skFiltered = skRows.filter(r => r.tanggal_surat  && new Date(r.tanggal_surat ).getFullYear() === tahun);
  }

  // ── Summary cards (dari data lengkap sebelum filter status) ──
  const totalSM   = smFiltered.length;
  const selesaiSM = smFiltered.filter(r => r.selesai).length;
  const belumSM   = totalSM - selesaiSM;
  const totalSK   = skFiltered.length;
  const now       = new Date();
  const terlambat = smFiltered.filter(r => !r.selesai && r.batas_waktu && new Date(r.batas_waktu) < now).length;

  // ── Gabung & normalisasi semua baris ──
  let allRows = [];

  if (jenis !== 'keluar') {
    smFiltered.forEach(r => {
      const isTerlambat = !r.selesai && r.batas_waktu && new Date(r.batas_waktu) < now;
      allRows.push({
        _jenis: 'masuk',
        no_surat: r.no_surat || r.nomor_surat || '—',
        perihal: r.perihal || r.subject || '—',
        tanggal: r.tanggal_terima || r.tanggal || null,
        pengirim_tujuan: r.asal_surat || r.pengirim || r.asal || '—',
        batas_waktu: r.batas_waktu || null,
        selesai: !!r.selesai,
        terlambat: !!isTerlambat,
      });
    });
  }
  if (jenis !== 'masuk') {
    skFiltered.forEach(r => {
      allRows.push({
        _jenis: 'keluar',
        no_surat: r.no_surat || r.nomor_surat || '—',
        perihal: r.perihal || r.subject || '—',
        tanggal: r.tanggal_surat || r.tanggal || null,
        pengirim_tujuan: r.tujuan_surat || r.tujuan || r.kepada || '—',
        batas_waktu: null,
        selesai: true,
        terlambat: false,
      });
    });
  }

  // Urutkan terbaru dulu
  allRows.sort((a, b) => new Date(b.tanggal || 0) - new Date(a.tanggal || 0));

  // ── Filter status ──
  let filteredRows = allRows;
  if (status === 'belum')          filteredRows = allRows.filter(r => r._jenis === 'masuk' && !r.selesai);
  else if (status === 'selesai')   filteredRows = allRows.filter(r => r.selesai);
  else if (status === 'terlambat') filteredRows = allRows.filter(r => r.terlambat);

  // ── Tabel detail ──
  const tbody = document.getElementById('laporanSuratTableBody');
  if (tbody) {
    if (!filteredRows.length) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="8">Tidak ada data untuk filter yang dipilih</td></tr>`;
    } else {
      tbody.innerHTML = filteredRows.map((r, i) => {
        const tgl = r.tanggal
          ? new Date(r.tanggal).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
          : '—';
        const batas = r.batas_waktu
          ? new Date(r.batas_waktu).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
          : '—';
        const jenisBadge = r._jenis === 'masuk'
          ? `<span style="background:#d1fae5;color:#065f46;padding:2px 8px;border-radius:99px;font-size:.7rem">Masuk</span>`
          : `<span style="background:#ede9fe;color:#4c1d95;padding:2px 8px;border-radius:99px;font-size:.7rem">Keluar</span>`;
        let statusBadge;
        if (r._jenis === 'keluar') {
          statusBadge = `<span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:99px;font-size:.7rem">Terkirim</span>`;
        } else if (r.terlambat) {
          statusBadge = `<span style="background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:99px;font-size:.7rem">Terlambat</span>`;
        } else if (r.selesai) {
          statusBadge = `<span style="background:#d1fae5;color:#065f46;padding:2px 8px;border-radius:99px;font-size:.7rem">Selesai</span>`;
        } else {
          statusBadge = `<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:99px;font-size:.7rem">Belum Selesai</span>`;
        }
        return `<tr>
          <td style="text-align:center">${i + 1}</td>
          <td>${r.no_surat}</td>
          <td>${r.perihal}</td>
          <td style="text-align:center">${jenisBadge}</td>
          <td style="text-align:center">${tgl}</td>
          <td>${r.pengirim_tujuan}</td>
          <td style="text-align:center;white-space:nowrap;color:${r.terlambat ? '#ef4444' : 'inherit'}">${batas}</td>
          <td style="text-align:center;white-space:nowrap">${statusBadge}</td>
        </tr>`;
      }).join('');
    }
  }

  // Simpan data (rekap bulanan tetap untuk PDF)
  const rekap = Array.from({ length: 12 }, (_, idx) => ({
    bulan: idx + 1, masuk: 0, selesai: 0, belum: 0, keluar: 0,
  }));
  allRows.forEach(r => {
    if (!r.tanggal) return;
    const b = new Date(r.tanggal).getMonth();
    if (r._jenis === 'masuk') { rekap[b].masuk++; r.selesai ? rekap[b].selesai++ : rekap[b].belum++; }
    else { rekap[b].keluar++; }
  });
  // ── Rebuild opsi filter status sesuai data yang ada ──
  _rebuildSuratStatusOptions(allRows, status);

  window._laporanSuratData = { rekap, allRows, filteredRows, tahun, jenis, status };
}


function _renderSuratChart(rekap, jenis) {
  const el = document.getElementById('laporanSuratChart');
  if (!el) return;
  const maxVal = Math.max(...rekap.map(r => Math.max(r.masuk, r.keluar)), 1);
  const W = 660, H = 180, padL = 30, padB = 28, padT = 10;
  const barW = Math.floor((W - padL) / 12);
  const scale = v => padT + (H - padT - padB) * (1 - v / maxVal);

  let bars = '';
  rekap.forEach((r, i) => {
    const x = padL + i * barW;
    if (jenis !== 'keluar' && r.masuk) {
      bars += `<rect x="${x+4}" y="${scale(r.masuk)}" width="${barW/2-4}" height="${H - padB - scale(r.masuk)}" fill="#10b981" rx="2" opacity=".85"><title>Masuk: ${r.masuk}</title></rect>`;
    }
    if (jenis !== 'masuk' && r.keluar) {
      bars += `<rect x="${x+barW/2+2}" y="${scale(r.keluar)}" width="${barW/2-4}" height="${H - padB - scale(r.keluar)}" fill="#8b5cf6" rx="2" opacity=".85"><title>Keluar: ${r.keluar}</title></rect>`;
    }
    bars += `<text x="${x+barW/2}" y="${H-padB+14}" text-anchor="middle" font-size="9" fill="currentColor" opacity=".6">${BULAN_NAMA[i].slice(0,3)}</text>`;
  });

  // Y axis labels
  let yLabels = '';
  for (let v = 0; v <= maxVal; v += Math.ceil(maxVal / 4)) {
    const y = scale(v);
    yLabels += `<text x="${padL-4}" y="${y+4}" text-anchor="end" font-size="9" fill="currentColor" opacity=".6">${v}</text>`;
    yLabels += `<line x1="${padL}" y1="${y}" x2="${W}" y2="${y}" stroke="currentColor" stroke-width=".5" opacity=".15"/>`;
  }

  const legend = !jenis ? `
    <circle cx="${W-100}" cy="12" r="5" fill="#10b981"/>
    <text x="${W-92}" y="16" font-size="10" fill="currentColor" opacity=".8">Masuk</text>
    <circle cx="${W-48}" cy="12" r="5" fill="#8b5cf6"/>
    <text x="${W-40}" y="16" font-size="10" fill="currentColor" opacity=".8">Keluar</text>
  ` : (jenis === 'masuk'
    ? `<circle cx="${W-60}" cy="12" r="5" fill="#10b981"/><text x="${W-52}" y="16" font-size="10" fill="currentColor" opacity=".8">Masuk</text>`
    : `<circle cx="${W-60}" cy="12" r="5" fill="#8b5cf6"/><text x="${W-52}" y="16" font-size="10" fill="currentColor" opacity=".8">Keluar</text>`);

  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;min-width:380px;max-height:200px">${yLabels}${bars}${legend}</svg>`;
}



// ══════════════════════════════════════════════════════
//  LAPORAN KINERJA
// ══════════════════════════════════════════════════════

let _laporanKinerjaFilterReady = false;
let _lapKinerjaTahunList = [];
// State range bulan: { bulan:1..12, tahun:YYYY, key:'YYYY-MM' }
let _lapRangeFrom = null;
let _lapRangeTo   = null;

// ── State pagination tabel Laporan Kinerja ───────────────────────────────
let _lapKinerjaPage = 1;
const _LAP_KINERJA_PER_PAGE = 15;
let _lapKinerjaBulanTampil = [];
let _lapKinerjaColspan = 12;

const _LAP_ROMAWI = ['I', 'II', 'III', 'IV'];

// Render satu baris tabel Laporan Kinerja
function _lapKinerjaRowHtml(r, no, bulanTampil) {
  const bulanCells = bulanTampil.map(b => {
    const v = r.realisasiPerBulan[b];
    const isEmpty = v === null || v === undefined || v === '';
    return `<td style="text-align:center;font-size:.75rem;color:${isEmpty ? '#000000' : '#1e293b'}">${isEmpty ? '—' : v}</td>`;
  }).join('');
  const sdPelaporan = r._realisasiSd ?? '—';
  const capaian     = r._capaian !== null ? r._capaian + '%' : '—';
  const capColor    = r._capaian === null ? '#000000'
    : parseFloat(r._capaian) >= 100 ? '#059669'
    : parseFloat(r._capaian) >= 80  ? '#2563eb'
    : parseFloat(r._capaian) >= 60  ? '#d97706' : '#dc2626';
  return `<tr>
    <td style="text-align:center">${no}</td>
    <td>${r.nama_indikator}</td>
    <td style="text-align:center;color:#000000">${r.target ?? '—'}</td>
    <td style="text-align:center;color:#000000">${r.satuan || '—'}</td>
    <td style="font-size:.75rem;color:${r.penanggung_jawab?'#1e293b':'#94a3b8'}">${r.penanggung_jawab || '—'}</td>
    ${bulanCells}
    <td style="text-align:center;font-weight:600;color:${sdPelaporan==='—'?'#000000':'#1e293b'}">${sdPelaporan}</td>
    <td style="text-align:center;font-weight:700;color:${capColor}">${capaian}</td>
    <td style="font-size:.75rem;color:${r._fpenghambat?'#1e293b':'#000000'}">${r._fpenghambat || '—'}</td>
    <td style="font-size:.75rem;color:${r._solusi?'#1e293b':'#000000'}">${r._solusi || '—'}</td>
    <td style="font-size:.75rem;color:${r._fpendukung?'#1e293b':'#000000'}">${r._fpendukung || '—'}</td>
    <td style="font-size:.75rem;color:${r._rencana_tl?'#1e293b':'#000000'}">${r._rencana_tl || '—'}</td>
  </tr>`;
}

// Render tbody Laporan Kinerja dengan pagination
function _lapRenderKinerjaTbody(rows, bulanTampil, colspanTotal, emptyMsg) {
  _lapKinerjaBulanTampil = bulanTampil;
  _lapKinerjaColspan     = colspanTotal;

  const tbody = document.getElementById('laporanKinerjaTableBody');
  if (!tbody) return;

  const total = rows.length;
  if (!total) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="${colspanTotal}">${emptyMsg || 'Tidak ada data'}</td></tr>`;
    if (typeof renderPagination === 'function') renderPagination('laporanKinerjaPagination', 0, 1, _LAP_KINERJA_PER_PAGE, '_lapKinerjaGoPage');
    return;
  }

  const pages = Math.ceil(total / _LAP_KINERJA_PER_PAGE);
  if (_lapKinerjaPage > pages) _lapKinerjaPage = pages;
  if (_lapKinerjaPage < 1)     _lapKinerjaPage = 1;
  const start = (_lapKinerjaPage - 1) * _LAP_KINERJA_PER_PAGE;
  const pageRows = rows.slice(start, start + _LAP_KINERJA_PER_PAGE);

  tbody.innerHTML = pageRows.map((r, i) => _lapKinerjaRowHtml(r, start + i + 1, bulanTampil)).join('');

  if (typeof renderPagination === 'function') renderPagination('laporanKinerjaPagination', total, _lapKinerjaPage, _LAP_KINERJA_PER_PAGE, '_lapKinerjaGoPage');
}

// Pindah halaman tabel Laporan Kinerja (tanpa fetch ulang)
function _lapKinerjaGoPage(p) {
  _lapKinerjaPage = p;
  const data = window._laporanKinerjaData;
  if (!data) return;
  const bidang = document.getElementById('laporanKinerjaBidang')?.value || '';
  const rows = bidang ? data.rows.filter(r => r.penanggung_jawab === bidang) : data.rows;
  _lapRenderKinerjaTbody(rows, _lapKinerjaBulanTampil, _lapKinerjaColspan);
}

// ── Month Picker (ported from dashboard) ─────────────────────────────────
window._lapMpData = window._lapMpData || {};

function _lapMonthPicker(id, tahunList, activeVal, onPickFn) {
  const _BL = ['','Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  const activeY = activeVal ? parseInt(activeVal.split('-')[0]) : (tahunList[tahunList.length-1] || new Date().getFullYear());
  const activeM = activeVal ? parseInt(activeVal.split('-')[1]) : 0;
  window._lapMpData[id] = { onPickFn, tahunList, activeVal: activeVal || '', viewYear: activeY };
  const lbl = activeVal ? `${_BL[activeM]} ${activeY}` : '— Pilih —';
  return `<div class="lap-mp" id="${id}" onclick="event.stopPropagation();_lapMpToggle('${id}')">
      <span class="lap-mp-label">${lbl}</span>
      <svg class="lap-mp-caret" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>
    </div>`;
}

function _lapMpToggle(id) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el.classList.contains('open')) { el.classList.remove('open'); return; }
  document.querySelectorAll('.lap-mp.open').forEach(x => x.classList.remove('open'));
  _lapMpRenderPanel(el);
  el.classList.add('open');
}

function _lapMpRenderPanel(el) {
  const _BL = ['','Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  const id = el.id;
  const data = window._lapMpData?.[id] || {};
  const tahunList = data.tahunList || [];
  const activeVal = data.activeVal || '';
  const viewYear  = data.viewYear || tahunList[tahunList.length-1] || new Date().getFullYear();
  const activeY   = activeVal ? parseInt(activeVal.split('-')[0]) : 0;
  const activeM   = activeVal ? parseInt(activeVal.split('-')[1]) : 0;
  const minYear   = tahunList[0] || viewYear;
  const maxYear   = tahunList[tahunList.length-1] || viewYear;

  // Untuk picker "Sampai": disabled bulan < fromKey (jika id === lapMpTo)
  const fromKey = _lapRangeFrom ? _lapRangeFrom.tahun * 100 + _lapRangeFrom.bulan : 0;
  // Untuk picker "Dari": disabled bulan > toKey (jika id === lapMpFrom)
  const toKey   = _lapRangeTo   ? _lapRangeTo.tahun   * 100 + _lapRangeTo.bulan   : 9999;

  let grid = '';
  for (let m = 1; m <= 12; m++) {
    const key     = `${viewYear}-${String(m).padStart(2,'0')}`;
    const thisKey = viewYear * 100 + m;
    const isActive = (viewYear === activeY && m === activeM);
    const isDisabled = id === 'lapMpFrom' ? thisKey > toKey : thisKey < fromKey;
    const cls = isActive ? 'lap-mp-cell active' : isDisabled ? 'lap-mp-cell disabled' : 'lap-mp-cell';
    const handler = !isDisabled ? `onclick="event.stopPropagation();_lapMpPick('${id}','${key}')"` : '';
    grid += `<div class="${cls}" ${handler}>${_BL[m]}</div>`;
  }

  const canPrev = viewYear > minYear;
  const canNext = viewYear < maxYear;
  let panel = el.querySelector('.lap-mp-panel');
  if (!panel) { panel = document.createElement('div'); panel.className = 'lap-mp-panel'; el.appendChild(panel); }
  panel.innerHTML = `
    <div class="lap-mp-nav">
      <button class="lap-mp-nav-btn" ${canPrev ? `onclick="event.stopPropagation();_lapMpNav('${id}',-1)"` : 'disabled'}>
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
      </button>
      <span class="lap-mp-year">${viewYear}</span>
      <button class="lap-mp-nav-btn" ${canNext ? `onclick="event.stopPropagation();_lapMpNav('${id}',1)"` : 'disabled'}>
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
      </button>
    </div>
    <div class="lap-mp-grid">${grid}</div>`;
}

function _lapMpNav(id, dir) {
  const el = document.getElementById(id);
  if (!el) return;
  const data = window._lapMpData?.[id] || {};
  const tahunList = data.tahunList || [];
  let vy = (data.viewYear || tahunList[0] || new Date().getFullYear()) + dir;
  vy = Math.max(tahunList[0]||vy, Math.min(tahunList[tahunList.length-1]||vy, vy));
  if (window._lapMpData[id]) window._lapMpData[id].viewYear = vy;
  _lapMpRenderPanel(el);
}

function _lapMpPick(id, key) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('open');
  const data = window._lapMpData?.[id];
  if (!data) return;
  data.activeVal = key;
  data.viewYear  = parseInt(key.split('-')[0]);
  const _BL = ['','Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  const [y, m] = key.split('-').map(Number);
  const labelEl = el.querySelector('.lap-mp-label');
  if (labelEl) labelEl.textContent = `${_BL[m]} ${y}`;
  const fnRef = window[data.onPickFn];
  if (typeof fnRef === 'function') fnRef(key);
}

function _lapSetRangeFrom(key) {
  const [y, m] = key.split('-').map(Number);
  _lapRangeFrom = { bulan: m, tahun: y, key };
  // Jika from > to, geser to ke from
  if (_lapRangeTo && y * 100 + m > _lapRangeTo.tahun * 100 + _lapRangeTo.bulan) {
    _lapRangeTo = { ..._lapRangeFrom };
    // Update label & data picker To
    const toEl = document.getElementById('lapMpTo');
    if (toEl) {
      const _BL = ['','Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
      const lbl = toEl.querySelector('.lap-mp-label');
      if (lbl) lbl.textContent = `${_BL[m]} ${y}`;
      if (window._lapMpData['lapMpTo']) { window._lapMpData['lapMpTo'].activeVal = key; window._lapMpData['lapMpTo'].viewYear = y; }
    }
  }
  // Re-render panel To agar disable state update
  const toEl = document.getElementById('lapMpTo');
  if (toEl?.classList.contains('open')) _lapMpRenderPanel(toEl);
  loadLaporanKinerja();
}

function _lapSetRangeTo(key) {
  const [y, m] = key.split('-').map(Number);
  _lapRangeTo = { bulan: m, tahun: y, key };
  // Jika to < from, geser from ke to
  if (_lapRangeFrom && y * 100 + m < _lapRangeFrom.tahun * 100 + _lapRangeFrom.bulan) {
    _lapRangeFrom = { ..._lapRangeTo };
    const frEl = document.getElementById('lapMpFrom');
    if (frEl) {
      const _BL = ['','Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
      const lbl = frEl.querySelector('.lap-mp-label');
      if (lbl) lbl.textContent = `${_BL[m]} ${y}`;
      if (window._lapMpData['lapMpFrom']) { window._lapMpData['lapMpFrom'].activeVal = key; window._lapMpData['lapMpFrom'].viewYear = y; }
    }
  }
  const frEl = document.getElementById('lapMpFrom');
  if (frEl?.classList.contains('open')) _lapMpRenderPanel(frEl);
  loadLaporanKinerja();
}

// ── Render filter bar month picker ke dalam container ────────────────────
function _lapRenderRangeFilter(tahunList) {
  const container = document.getElementById('lapKinerjaRangeFilter');
  if (!container) return;
  const aktif = (typeof getPeriodeAktif === 'function') ? getPeriodeAktif() : null;
  const tahunAktif = aktif?.tahun ?? (tahunList[0] || new Date().getFullYear());
  const periodeAktifBulan = aktif?.bulan ?? 12;

  // Default: snap ke awal TW dari bulan aktif (misal bulan 3 → Jan s.d Mar = TW I)
  const _twStart = bulan => bulan <= 3 ? 1 : bulan <= 6 ? 4 : bulan <= 9 ? 7 : 10;
  if (!_lapRangeFrom) {
    const from = _twStart(periodeAktifBulan);
    _lapRangeFrom = { bulan: from, tahun: tahunAktif, key: `${tahunAktif}-${String(from).padStart(2,'0')}` };
  }
  if (!_lapRangeTo)   _lapRangeTo   = { bulan: periodeAktifBulan, tahun: tahunAktif, key: `${tahunAktif}-${String(periodeAktifBulan).padStart(2,'0')}` };

  container.innerHTML = `
    <div class="lap-range-filter">
      <span class="lap-range-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#94a3b8" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 4a1 1 0 011-1h1m0 0V2m0 1h12m0 0V2m0 1h1a1 1 0 011 1v3H3V4zm0 4h18v11a1 1 0 01-1 1H4a1 1 0 01-1-1V8z"/></svg>
      </span>
      <div class="lap-range-group">
        <span class="lap-range-label">Dari</span>
        ${_lapMonthPicker('lapMpFrom', tahunList, _lapRangeFrom.key, '_lapSetRangeFrom')}
      </div>
      <div class="lap-range-group">
        <span class="lap-range-label">Sampai</span>
        ${_lapMonthPicker('lapMpTo', tahunList, _lapRangeTo.key, '_lapSetRangeTo')}
      </div>
    </div>`;
}

async function _initLaporanKinerjaFilter() {
  if (_laporanKinerjaFilterReady && _lapKinerjaTahunList.length > 0) return;

  // Ambil daftar tahun dari Periode
  let tahunList = [];
  try {
    const res  = await fetch('/.netlify/functions/periode', { headers: authHeaders() });
    const data = await res.json();
    const periodes = data.periode || data.periodes || data.data || [];
    const unik = [...new Set(periodes.map(p => p.tahun))].sort((a, b) => a - b);
    tahunList = unik;
  } catch (_) {}

  if (!tahunList.length) return;

  // Isi dropdown tahun (jika ada, untuk kompatibilitas)
  const sel = document.getElementById('laporanKinerjaTahun');
  if (sel) {
    const aktif = (typeof getPeriodeAktif === 'function') ? getPeriodeAktif() : null;
    const tahunAktif = aktif?.tahun ?? tahunList[tahunList.length-1];
    sel.innerHTML = '';
    [...tahunList].reverse().forEach(y => {
      const opt = document.createElement('option');
      opt.value = y; opt.textContent = 'Tahun ' + y;
      if (y === tahunAktif) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  _lapKinerjaTahunList = tahunList;
  _laporanKinerjaFilterReady = true;

  // Render month picker range filter
  _lapRenderRangeFilter(tahunList);
}

// Tutup picker kalau klik di luar
document.addEventListener('click', function(e) {
  document.querySelectorAll('.lap-mp.open').forEach(mp => {
    if (!mp.contains(e.target)) mp.classList.remove('open');
  });
});

// ── Spinner helper untuk Laporan Kinerja ─────────────────────────────────
function _showLaporanLoading() {
  const stats = document.getElementById('laporanKinerjaStats');
  const tbody = document.getElementById('laporanKinerjaTableBody');
  const thead = document.getElementById('laporanKinerjaThead');
  const pag   = document.getElementById('laporanKinerjaPagination');
  if (stats) stats.innerHTML = '';
  if (thead) thead.innerHTML = '';
  if (pag)   pag.innerHTML = '';
  if (tbody) tbody.innerHTML = `
    <tr>
      <td colspan="21">
        <div class="lap-loading-wrap">
          <div class="lap-spinner"></div>
          <div style="margin-top:.75rem;color:#64748b;font-size:.85rem">Memuat data...</div>
        </div>
      </td>
    </tr>`;
}

async function loadLaporanKinerja() {
  _showLaporanLoading();
  await _initLaporanKinerjaFilter();

  // Ambil tahun dari range (gunakan tahun dari, atau fallback ke select)
  const bulanDari   = _lapRangeFrom?.bulan   ?? 1;
  const bulanSampai = _lapRangeTo?.bulan     ?? 12;
  const tahun       = _lapRangeFrom?.tahun   ?? parseInt(document.getElementById('laporanKinerjaTahun')?.value || new Date().getFullYear());
  const bulanPelaporan = bulanSampai; // backward compat untuk PDF/label
  const jenis          = document.getElementById('laporanKinerjaJenis')?.value || 'semua';

  // Fetch semua 12 bulan secara parallel untuk tiap jenis
  const bulanList = [1,2,3,4,5,6,7,8,9,10,11,12];

  const fetchBulan = async (b, jenisParam) => {
    try {
      const r = await fetch(`/api/kinerja/rekap?bulan=${b}&tahun=${tahun}&jenis=${jenisParam}`, { headers: authHeaders() });
      if (!r.ok) return [];
      const d = await r.json();
      return (d.rekap || []).map(row => ({ ...row, _bulan: b }));
    } catch { return []; }
  };

  // Kumpulkan data per indikator: { key: { ...info, realisasiPerBulan: {1:val,...}, ... } }
  const allBulanData = {};

  const jenisParams = [];
  if (jenis !== 'ikk' && jenis !== 'spm') jenisParams.push('monev');
  if (jenis !== 'kinerja' && jenis !== 'spm') jenisParams.push('ikk');
  if (jenis !== 'kinerja' && jenis !== 'ikk') jenisParams.push('spm');

  for (const jenisParam of jenisParams) {
    const results = await Promise.all(bulanList.map(b => fetchBulan(b, jenisParam)));
    results.forEach((bulanRows, idx) => {
      const b = bulanList[idx];
      bulanRows.forEach(row => {
        // Gunakan id indikator saja sebagai key agar tidak duplikat
        // ketika satu indikator memiliki jenis_monev=true DAN jenis_ikk=true
        const key = `${row.id}`;
        if (!allBulanData[key]) {
          allBulanData[key] = {
            ...row,
            _jenis: jenisParam === 'ikk' ? 'IKK' : jenisParam === 'spm' ? 'SPM' : 'IKU',
            realisasiPerBulan:     {},
            fpenghambatPerBulan:   {},
            solusiPerBulan:        {},
            fpendukungPerBulan:    {},
            rencanaTlPerBulan:     {},
          };
        }
        allBulanData[key].realisasiPerBulan[b]   = row.realisasi_display ?? row.realisasi;
        allBulanData[key].fpenghambatPerBulan[b]  = row.f_penghambat;
        allBulanData[key].solusiPerBulan[b]        = row.solusi;
        allBulanData[key].fpendukungPerBulan[b]   = row.f_pendukung;
        allBulanData[key].rencanaTlPerBulan[b]    = row.rencana_tl;
      });
    });
  }

  const rows = Object.values(allBulanData);

  // Hitung realisasi & capaian s.d bulan pelaporan (bulan terakhir yang ada data)
  const fmtNum = v => {
    if (v === null || v === undefined || v === '') return null;
    const n = parseFloat(v);
    return isNaN(n) ? String(v) : parseFloat(n.toFixed(4)).toString();
  };

  rows.forEach(row => {
    const isJumlah = (row.indikator_kinerja || row.nama_indikator || '').toLowerCase().startsWith('jumlah');

    let lastVal = null, lastFpenghambat = null, lastSolusi = null, lastFpendukung = null, lastRencanaTl = null;
    for (let b = bulanSampai; b >= bulanDari; b--) {
      const v = row.realisasiPerBulan[b];
      if (v !== null && v !== undefined && v !== '') {
        lastFpenghambat = row.fpenghambatPerBulan[b];
        lastSolusi      = row.solusiPerBulan[b];
        lastFpendukung  = row.fpendukungPerBulan[b];
        lastRencanaTl   = row.rencanaTlPerBulan[b];
        if (!isJumlah) { lastVal = v; break; }
        // Untuk indikator Jumlah: terus loop untuk ambil data teks dari bulan terakhir
        if (lastVal === null) lastVal = v; // simpan bulan terakhir untuk fallback
      }
    }

    // Untuk indikator Jumlah: realisasi = SUM semua bulan dalam range
    if (isJumlah) {
      let sum = 0, hasVal = false;
      for (let b = bulanDari; b <= bulanSampai; b++) {
        const v = row.realisasiPerBulan[b];
        const n = parseFloat(v);
        if (!isNaN(n)) { sum += n; hasVal = true; }
      }
      lastVal = hasVal ? sum : null;
    }

    row._realisasiSd = lastVal;
    row._fpenghambat  = lastFpenghambat;
    row._solusi       = lastSolusi;
    row._fpendukung   = lastFpendukung;
    row._rencana_tl   = lastRencanaTl;
    row.nama_indikator = row.indikator_kinerja || row.nama_indikator || row.indikator || '—';
    row.target         = row.target_display != null ? row.target_display : fmtNum(row.target_tahun ?? row.target);

    const target = parseFloat(row.target_tahun);
    const real   = parseFloat(lastVal);
    if (!isNaN(target) && target !== 0 && !isNaN(real)) {
      row._capaian = row.bermakna_negatif
        ? ((target - (real - target)) / target * 100).toFixed(1)
        : (real / target * 100).toFixed(1);
    } else {
      row._capaian = null;
    }
  });

  // ── Summary ──
  const total      = rows.length;
  const sudahDiisi = rows.filter(r => r._realisasiSd !== null && r._realisasiSd !== undefined && r._realisasiSd !== '').length;
  const belumDiisi = total - sudahDiisi;
  const capRows    = rows.filter(r => r._capaian !== null);
  const rataCapaian = capRows.length
    ? (capRows.reduce((s, r) => s + parseFloat(r._capaian), 0) / capRows.length).toFixed(1)
    : '—';

  // ── Render tabel — kolom bulan dibatasi s.d bulanPelaporan ──
  const BULAN_PENDEK  = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  const BULAN_PANJANG = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const bulanTampil   = bulanList.filter(b => b >= bulanDari && b <= bulanSampai);

  // Hitung colspan per TW sesuai bulan yang tampil
  const twRanges = [[1,3],[4,6],[7,9],[10,12]];
  const twHeaders = twRanges.map(([s, e], twIdx) => {
    const cols = bulanTampil.filter(b => b >= s && b <= e).length;
    return cols > 0 ? `<th colspan="${cols}" style="text-align:center;background:var(--hijau);color:#fff">TW ${_LAP_ROMAWI[twIdx]}</th>` : '';
  }).join('');

  const bulanSubHeaders = bulanTampil.map(b =>
    `<th style="width:45px;text-align:center;background:var(--hijau);color:#fff">${BULAN_PANJANG[b-1]}</th>`
  ).join('');

  const colspanTotal = 5 + bulanTampil.length + 6; // No+Indikator+Target+Satuan+Bidang + bulan + Realisasi+Capaian+F.Penghambat+Solusi+F.Pendukung+RencanaTL

  const thead = document.getElementById('laporanKinerjaThead');
  if (thead) {
    thead.innerHTML = `
      <tr style="background:var(--hijau)">
        <th rowspan="2" style="width:34px;text-align:center">No</th>
        <th rowspan="2" style="min-width:200px">Indikator Kinerja</th>
        <th rowspan="2" style="width:65px;text-align:center">Target Tahunan</th>
        <th rowspan="2" style="width:55px;text-align:center">Satuan</th>
        <th rowspan="2" style="min-width:130px">Bidang / Sub Bagian</th>
        ${twHeaders}
        <th rowspan="2" style="width:75px;text-align:center">Realisasi s.d ${BULAN_PANJANG[bulanSampai-1]}</th>
        <th rowspan="2" style="width:65px;text-align:center">Capaian</th>
        <th rowspan="2" style="min-width:100px">Faktor Penghambat</th>
        <th rowspan="2" style="min-width:100px">Solusi</th>
        <th rowspan="2" style="min-width:100px">Faktor Pendukung</th>
        <th rowspan="2" style="min-width:100px">Rencana Tindak Lanjut</th>
      </tr>
      <tr style="background:var(--hijau)">${bulanSubHeaders}</tr>`;
    // Fix gap putih di pojok thead: set teal di table, reset di tbody
    const teal = getComputedStyle(document.documentElement).getPropertyValue('--hijau').trim() || '#0d9488';
    thead.style.background = teal;
    thead.style.backgroundColor = teal;
    const tbl = thead.closest('table');
    if (tbl) {
      tbl.style.background = teal;
      tbl.style.backgroundColor = teal;
      const tb = tbl.querySelector('tbody');
      if (tb) { tb.style.background = '#fff'; tb.style.backgroundColor = '#fff'; }
    }
  }

  _lapKinerjaPage = 1;
  _lapRenderKinerjaTbody(rows, bulanTampil, colspanTotal, 'Tidak ada data');

  window._laporanKinerjaData = { rows, tahun, bulanPelaporan, bulanDari, bulanSampai, jenis };

  // ── Populate dropdown bidang ──
  const bidangSel = document.getElementById('laporanKinerjaBidang');
  if (bidangSel) {
    const currentBidang = bidangSel.value;
    const bidangList = [...new Set(rows.map(r => r.penanggung_jawab).filter(Boolean))].sort();
    bidangSel.innerHTML = `<option value="">Semua Bidang</option>` +
      bidangList.map(b => `<option value="${b}"${b === currentBidang ? ' selected' : ''}>${b}</option>`).join('');
    if (typeof syncCustomSelect === 'function') syncCustomSelect('laporanKinerjaBidang');
  }
}

function _renderKinerjaEmpty(tahun) {
  const statsEl = document.getElementById('laporanKinerjaStats');
  if (statsEl) statsEl.innerHTML = _statCard('Total Indikator', 0, '#10b981', `<path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>`);
  const tbody = document.getElementById('laporanKinerjaTableBody');
  if (tbody) tbody.innerHTML = `<tr class="empty-row"><td colspan="21">Tidak ada data untuk tahun ${tahun}</td></tr>`;
}


function _statusBadge(capaian) {
  if (capaian === null || capaian === undefined || capaian === '')
    return `<span style="background:#e5e7eb;color:#6b7280;padding:2px 8px;border-radius:99px;font-size:.7rem">Belum</span>`;
  const c = parseFloat(capaian);
  if (c >= 100) return `<span style="background:#d1fae5;color:#065f46;padding:2px 8px;border-radius:99px;font-size:.7rem">Tercapai</span>`;
  if (c >= 80)  return `<span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:99px;font-size:.7rem">Mendekati</span>`;
  if (c >= 60)  return `<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:99px;font-size:.7rem">Cukup</span>`;
  return `<span style="background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:99px;font-size:.7rem">Rendah</span>`;
}



// ══════════════════════════════════════════════════════
//  SHARED — PDF HELPER (kop surat + print window)
// ══════════════════════════════════════════════════════

function _kopSuratHtml() {
  const logoSrc = (typeof window !== 'undefined' && window.location)
    ? window.location.origin + '/logobalut.png'
    : '/logobalut.png';
  return `
    <div style="padding-bottom:10px;margin-bottom:14px;border-bottom:2px solid #1e293b">
      <div style="position:relative;width:100%;min-height:76px;display:flex;align-items:center;justify-content:center">
        <img src="${logoSrc}" style="position:absolute;left:220px;top:50%;transform:translateY(-50%);width:72px;height:72px;object-fit:contain" onerror="this.style.display='none'">
        <div style="text-align:center;line-height:1.1">
          <div style="font-family:'Bookman Old Style',Bookman,serif;font-size:12px;font-weight:400;text-transform:uppercase;letter-spacing:0.3px">PEMERINTAH KABUPATEN BANGGAI LAUT</div>
          <div style="font-family:'Bookman Old Style',Bookman,serif;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:0.2px">DINAS KESEHATAN, PENGENDALIAN PENDUDUK</div>
          <div style="font-family:'Bookman Old Style',Bookman,serif;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:0.2px">DAN KELUARGA BERENCANA</div>
          <div style="font-family:'Bookman Old Style',Bookman,serif;font-size:10px;font-weight:400;margin-top:2px">Jl. KM 7 Adean, Banggai Tengah, Banggai Laut, Sulawesi Tengah 94895</div>
          <div style="font-family:'Bookman Old Style',Bookman,serif;font-size:10px;font-weight:400">Pos-el: <span style="color:#1a56db;text-decoration:underline">dinkeskb.balutsulteng@gmail.com</span></div>
        </div>
      </div>
    </div>`;
}

// Buka tab preview — user bisa lihat, lalu Ctrl+P / Save as PDF
function _bukaPreviewPDF(htmlBody, judulDokumen, orientation) {
  const ori = orientation || 'landscape';
  const fullHtml = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<title>${judulDokumen}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family:Arial,sans-serif; color:#1e293b; background:#f1f5f9; font-size:11px;
    -webkit-print-color-adjust:exact !important;
    print-color-adjust:exact !important;
    color-adjust:exact !important;
  }
  .sheet {
    background:white;
    width:${ori === 'landscape' ? '277mm' : '190mm'};
    margin:8px auto;
    padding:8mm 14mm;
    box-shadow:0 4px 24px rgba(0,0,0,.15);
    border-radius:2px;
    -webkit-print-color-adjust:exact !important;
    print-color-adjust:exact !important;
  }
  /* Paksa semua elemen cetak warna & background */
  *, *::before, *::after {
    -webkit-print-color-adjust:exact !important;
    print-color-adjust:exact !important;
    color-adjust:exact !important;
  }
  @page { size:A4 ${ori}; margin:10mm 14mm; }
  @media print {
    body { background:white; }
    .sheet { margin:0; padding:0; box-shadow:none; width:100%; border-radius:0; }
  }
  table { border-collapse:collapse; width:100%; }
  th, td { font-size:10px; }
  td { word-break:break-word; overflow-wrap:break-word; }
</style>
</head>
<body>
<div class="sheet">
  ${htmlBody}
</div>
<script>
  // Tunggu semua aset (logo) selesai load, lalu langsung buka dialog print
  window.addEventListener('load', function() {
    setTimeout(function() { window.print(); }, 400);
  });
<\/script>
</body>
</html>`;

  const previewWin = window.open('', '_blank');
  if (!previewWin) {
    toast('Pop-up diblokir browser. Izinkan pop-up untuk situs ini.', 'error');
    return;
  }
  previewWin.document.open();
  previewWin.document.write(fullHtml);
  previewWin.document.close();
}


// ══════════════════════════════════════════════════════
//  DOWNLOAD / PREVIEW LAPORAN SURAT — PDF
// ══════════════════════════════════════════════════════

function downloadLaporanSuratPDF(btnEl) {
  const data = window._laporanSuratData;
  if (!data) { toast('Muat data laporan terlebih dahulu', 'error'); return; }

  const { rekap, allRows, tahun, jenis, status } = data;
  const tahunLabel = tahun ? 'Tahun ' + tahun : 'Semua Tahun';

  // Subtitle fleksibel sesuai filter aktif
  const jenisLabel  = jenis === 'masuk' ? 'Surat Masuk' : jenis === 'keluar' ? 'Surat Keluar' : 'Surat Masuk & Keluar';
  const statusLabel = status === 'selesai' ? ' · Selesai' : status === 'belum' ? ' · Belum Selesai' : status === 'terlambat' ? ' · Terlambat' : '';
  const subtitleLabel = `${jenisLabel}${statusLabel} — ${tahunLabel}`;
  const judulDoc = `Laporan Surat — ${tahunLabel}`;

  // ── Rekap bulanan (hanya untuk summary, tidak ditampilkan di PDF) ──
  let totalMasuk = 0, totalSelesai = 0, totalBelum = 0, totalKeluar = 0;
  rekap.forEach(r => { totalMasuk += r.masuk; totalSelesai += r.selesai; totalBelum += r.belum; totalKeluar += r.keluar; });

  // ── Tabel detail surat ──
  const now = new Date();
  const detailRows = (allRows || []).map((r, i) => {
    const tgl   = r.tanggal   ? new Date(r.tanggal  ).toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' }) : '—';
    const batas = r.batas_waktu ? new Date(r.batas_waktu).toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' }) : '—';
    const bg    = 'white';

    const jenisBadge = r._jenis === 'masuk'
      ? `<span style="background:#d1fae5;color:#065f46;padding:1px 6px;border-radius:99px;font-size:7.5px;white-space:nowrap">Masuk</span>`
      : `<span style="background:#ede9fe;color:#4c1d95;padding:1px 6px;border-radius:99px;font-size:7.5px;white-space:nowrap">Keluar</span>`;

    let statusBadge;
    if (r._jenis === 'keluar') {
      statusBadge = `<span style="background:#dbeafe;color:#1e40af;padding:1px 6px;border-radius:99px;font-size:7.5px;white-space:nowrap">Terkirim</span>`;
    } else if (r.terlambat) {
      statusBadge = `<span style="background:#fee2e2;color:#991b1b;padding:1px 6px;border-radius:99px;font-size:7.5px;white-space:nowrap">Terlambat</span>`;
    } else if (r.selesai) {
      statusBadge = `<span style="background:#d1fae5;color:#065f46;padding:1px 6px;border-radius:99px;font-size:7.5px;white-space:nowrap">Selesai</span>`;
    } else {
      statusBadge = `<span style="background:#fef3c7;color:#92400e;padding:1px 6px;border-radius:99px;font-size:7.5px;white-space:nowrap">Belum Selesai</span>`;
    }

    return `<tr style="background:${bg}">
      <td style="padding:4px 6px;border:1px solid #000;text-align:center;font-size:8px">${i + 1}</td>
      <td style="padding:4px 6px;border:1px solid #000;font-size:8px;white-space:nowrap">${r.no_surat}</td>
      <td style="padding:4px 6px;border:1px solid #000;font-size:8px">${r.perihal}</td>
      <td style="padding:4px 6px;border:1px solid #000;text-align:center">${jenisBadge}</td>
      <td style="padding:4px 6px;border:1px solid #000;text-align:center;font-size:8px;white-space:nowrap">${tgl}</td>
      <td style="padding:4px 6px;border:1px solid #000;font-size:8px">${r.pengirim_tujuan}</td>
      <td style="padding:4px 6px;border:1px solid #000;text-align:center;font-size:8px;white-space:nowrap;color:${r.terlambat ? '#ef4444' : 'inherit'}">${batas}</td>
      <td style="padding:4px 6px;border:1px solid #000;text-align:center">${statusBadge}</td>
    </tr>`;
  }).join('');

  const nowStr = new Date().toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' });

  const bodyHtml = `
    ${_kopSuratHtml()}
    <div style="text-align:center;margin:14px 0 12px">
      <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.5px">Laporan Surat</div>
      <div style="font-size:11px;color:#64748b;margin-top:4px">Rekap ${subtitleLabel}</div>
    </div>

    ${detailRows ? `
    <table>
      <thead>
        <tr style="background:#0d9488">
          <th style="color:white;padding:5px 6px;border:1px solid #000;text-align:center;font-size:8px;width:36px">NO</th>
          <th style="color:white;padding:5px 6px;border:1px solid #000;text-align:center;font-size:8px;width:130px">NOMOR SURAT</th>
          <th style="color:white;padding:5px 6px;border:1px solid #000;text-align:center;font-size:8px">PERIHAL</th>
          <th style="color:white;padding:5px 6px;border:1px solid #000;text-align:center;font-size:8px;width:52px">JENIS</th>
          <th style="color:white;padding:5px 6px;border:1px solid #000;text-align:center;font-size:8px;width:72px">TANGGAL</th>
          <th style="color:white;padding:5px 6px;border:1px solid #000;text-align:center;font-size:8px;width:150px">PENGIRIM / TUJUAN</th>
          <th style="color:white;padding:5px 6px;border:1px solid #000;text-align:center;font-size:8px;width:72px">BATAS WAKTU</th>
          <th style="color:white;padding:5px 6px;border:1px solid #000;text-align:center;font-size:8px;width:82px">STATUS</th>
        </tr>
      </thead>
      <tbody>${detailRows}</tbody>
    </table>` : ''}`;

  _bukaPreviewPDF(bodyHtml, judulDoc, 'landscape');
}


// ══════════════════════════════════════════════════════
//  HELPER — Rebuild filter status dinamis
// ══════════════════════════════════════════════════════

function _rebuildSuratStatusOptions(allRows, currentVal) {
  const sel = document.getElementById('laporanSuratStatus');
  if (!sel) return;

  // Deteksi status yang benar-benar ada di data
  const adaBelum     = allRows.some(r => r._jenis === 'masuk' && !r.selesai && !r.terlambat);
  const adaSelesai   = allRows.some(r => r.selesai);
  const adaTerlambat = allRows.some(r => r.terlambat);

  const opts = [{ val: '', label: 'Semua Status' }];
  if (adaBelum)     opts.push({ val: 'belum',     label: 'Belum Selesai' });
  if (adaSelesai)   opts.push({ val: 'selesai',   label: 'Selesai' });
  if (adaTerlambat) opts.push({ val: 'terlambat', label: 'Terlambat' });

  // Jika nilai terpilih sudah tidak relevan, reset ke semua
  const validVals = opts.map(o => o.val);
  const safeVal = validVals.includes(currentVal) ? currentVal : '';

  sel.innerHTML = opts.map(o =>
    `<option value="${o.val}"${o.val === safeVal ? ' selected' : ''}>${o.label}</option>`
  ).join('');

  // Rebuild custom select supaya tampilan ikut update
  const wrap = sel.closest('.select-wrap');
  if (wrap) {
    wrap.querySelector('.csel-trigger')?.remove();
    wrap.querySelector('.csel-panel')?.remove();
    if (typeof window.initCustomSelects === 'function') window.initCustomSelects();
  }
}

function _rebuildKinerjaStatusOptions(allRows, currentVal) {
  const sel = document.getElementById('laporanKinerjaStatus');
  if (!sel) return;

  const adaBelum     = allRows.some(r => r.realisasi === null || r.realisasi === undefined || r.realisasi === '');
  const adaTercapai  = allRows.some(r => r.capaian != null && parseFloat(r.capaian) >= 100);
  const adaMendekati = allRows.some(r => r.capaian != null && parseFloat(r.capaian) >= 80 && parseFloat(r.capaian) < 100);
  const adaCukup     = allRows.some(r => r.capaian != null && parseFloat(r.capaian) >= 60 && parseFloat(r.capaian) < 80);
  const adaRendah    = allRows.some(r => r.capaian != null && parseFloat(r.capaian) < 60);

  const opts = [{ val: 'semua', label: 'Semua Status' }];
  if (adaBelum)     opts.push({ val: 'belum',     label: 'Belum Diisi' });
  if (adaTercapai)  opts.push({ val: 'tercapai',  label: 'Tercapai' });
  if (adaMendekati) opts.push({ val: 'mendekati', label: 'Mendekati' });
  if (adaCukup)     opts.push({ val: 'cukup',     label: 'Cukup' });
  if (adaRendah)    opts.push({ val: 'rendah',    label: 'Rendah' });

  const validVals = opts.map(o => o.val);
  const safeVal = validVals.includes(currentVal) ? currentVal : 'semua';

  sel.innerHTML = opts.map(o =>
    `<option value="${o.val}"${o.val === safeVal ? ' selected' : ''}>${o.label}</option>`
  ).join('');
}


function _statCard(label, value, color, iconPath) {
  return `<div class="stat-card" style="border-left-color:${color}">
    <div class="stat-card-body">
      <div class="stat-label">${label}</div>
      <div class="stat-value" style="color:${color}">${value}</div>
    </div>
    <div class="stat-icon">
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="${color}" stroke-width="2" opacity=".65">${iconPath}</svg>
    </div>
  </div>`;
}
// ── Helper TTD (tanda tangan kepala dinas) ────────────────────────────────
function _ttdHtml(pegawai, tanggalStr) {
  const nama     = pegawai?.nama     || '';
  const nip      = pegawai?.nip      || '';
  const golongan = pegawai?.golongan || '';
  const jabatan  = 'Kepala Dinas Kesehatan, Pengendalian Penduduk dan<br>Keluarga Berencana Kabupaten Banggai Laut';
  return `
    <div style="margin-top:24px;display:flex;justify-content:flex-end;padding-right:60px">
      <div style="text-align:center;min-width:220px">
        <div style="font-size:10px">Adean, ${tanggalStr}</div>
        <div style="font-size:10px">${jabatan}</div>
        <div style="height:64px"></div>
        <div style="font-size:10px;font-weight:700;text-decoration:underline">${nama}</div>
        ${golongan ? `<div style="font-size:10px">${golongan}</div>` : ''}
        ${nip ? `<div style="font-size:10px">NIP. ${nip}</div>` : ''}
      </div>
    </div>`;
}

// ── Fetch kepala dinas (root pegawai, urutan terkecil / parent_id null) ───
async function _fetchKepalaDinas() {
  try {
    const r = await fetch('/api/pegawai', { headers: authHeaders() });
    if (!r.ok) return null;
    const { pegawai } = await r.json();
    // Kepala = parent_id null, urutan terkecil
    const roots = (pegawai || []).filter(p => !p.parent_id && p.aktif);
    if (!roots.length) return null;
    roots.sort((a, b) => (a.urutan ?? 999) - (b.urutan ?? 999));
    return roots[0];
  } catch { return null; }
}

function _filterLaporanKinerjaByBidang() {
  const data = window._laporanKinerjaData;
  if (!data) return;
  const bidang = document.getElementById('laporanKinerjaBidang')?.value || '';
  const { rows, bulanDari, bulanSampai } = data;
  const filtered = bidang ? rows.filter(r => r.penanggung_jawab === bidang) : rows;

  const total      = filtered.length;
  const sudahDiisi = filtered.filter(r => r._realisasiSd !== null && r._realisasiSd !== undefined && r._realisasiSd !== '').length;
  const belumDiisi = total - sudahDiisi;
  const capRows    = filtered.filter(r => r._capaian !== null);
  const rataCapaian = capRows.length
    ? (capRows.reduce((s, r) => s + parseFloat(r._capaian), 0) / capRows.length).toFixed(1)
    : '0.0';

  const bulanList   = Array.from({length: 12}, (_, i) => i + 1);
  const bulanTampil = bulanList.filter(b => b >= bulanDari && b <= bulanSampai);
  const colspanTotal = 5 + bulanTampil.length + 6;
  _lapKinerjaPage = 1;
  _lapRenderKinerjaTbody(filtered, bulanTampil, colspanTotal, 'Tidak ada data untuk bidang ini');
}
// ══════════════════════════════════════════════════════
//  DOWNLOAD LAPORAN PER URUSAN — PDF
//  Struktur: header urusan + baris indikator (sama seperti laporan utama)
// ══════════════════════════════════════════════════════

async function downloadLaporanByUrusan(btnEl) {
  const data = window._laporanKinerjaData;
  if (!data || !data.rows) { toast('Muat data laporan terlebih dahulu', 'error'); return; }

  if (btnEl) { btnEl.disabled = true; btnEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Memuat...`; }
  try {
    // Ambil semua template urusan + indikatornya
    const res = await fetch('/api/kinerja/laporan-template?jenis=urusan', { headers: authHeaders() });
    const tplData = await res.json();
    const templates = tplData.templates || [];
    if (!templates.length) { toast('Belum ada template Urusan. Buat dulu di Master Data → Kelola Indikator → Kelola Laporan.', 'error'); return; }

    // Fetch indikator per template
    const tplWithIndikator = await Promise.all(templates.map(async t => {
      const r = await fetch(`/api/kinerja/laporan-template/${t.id}/indikator`, { headers: authHeaders() });
      const d = await r.json();
      return { ...t, indikator: d.indikator || [] };
    }));

    const { tahun, bulanDari = 1, bulanSampai = 12 } = data;
    const rowMap = {};
    data.rows.forEach(r => { rowMap[r.indikator_id || r.id] = r; });

    const BULAN_FULL = ['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    const BULAN_PENDEK = ['JAN','FEB','MAR','APR','MEI','JUN','JUL','AGU','SEP','OKT','NOV','DES'];
    const bulanList = Array.from({length: bulanSampai - bulanDari + 1}, (_, i) => bulanDari + i);
    const sdLabel = bulanDari === bulanSampai
      ? `${BULAN_FULL[bulanSampai]} ${tahun}`
      : `${BULAN_FULL[bulanDari]} - ${BULAN_FULL[bulanSampai]} ${tahun}`;

    const _twDef = [{tw:'I',s:1,e:3},{tw:'II',s:4,e:6},{tw:'III',s:7,e:9},{tw:'IV',s:10,e:12}];
    const _twPdfAktif = _twDef.filter(tw => bulanList.some(b => b >= tw.s && b <= tw.e));
    // TW dianggap "lengkap" jika ketiga bulannya masuk dalam bulanList (range filter)
    const _twLengkap = (tw) => [tw.s, tw.s+1, tw.s+2].every(b => bulanList.includes(b));
    // Kolom yang benar2 ditampilkan: TW lengkap = 1 kolom gabungan, TW belum lengkap = pecah per bulan
    const displayCols = _twPdfAktif.flatMap(tw => {
      if (_twLengkap(tw)) {
        return [{ type: 'tw', tw: tw.tw, lastBulan: tw.e }];
      }
      return bulanList.filter(b => b >= tw.s && b <= tw.e).map(b => ({ type: 'bulan', bulan: b }));
    });
    const bulanHeaderCells = displayCols.filter(c => c.type === 'bulan').map(c =>
      `<th style="color:white;padding:4px 2px;border:1px solid #000;text-align:center;font-size:10px">${BULAN_PENDEK[c.bulan-1]}</th>`
    ).join('');
    const twJudulColspan = displayCols.length;
    const twJudulHeader = `<th colspan="${twJudulColspan}" style="color:white;padding:4px 3px;border:1px solid #000;text-align:center;font-size:10px;font-weight:700">KINERJA / REALISASI TRIWULAN</th>`;
    const twHeaders = _twPdfAktif.map(tw => {
        const cols = displayCols.filter(c => (c.type === 'tw' && c.tw === tw.tw) || (c.type === 'bulan' && c.bulan >= tw.s && c.bulan <= tw.e)).length;
        const isLengkapTw = _twLengkap(tw);
        return `<th colspan="${cols}" ${isLengkapTw ? 'rowspan="2"' : ''} style="color:white;padding:4px 3px;border:1px solid #000;text-align:center;font-size:10px">${tw.tw}</th>`;
      }).join('');

    let no = 0;
    const rowsHtml = tplWithIndikator.map(tpl => {
      const headerRow = `<tr style="background:#99f6e4">
        <td colspan="${5 + displayCols.length + 6}" style="padding:5px 8px;font-size:10px;font-weight:700;color:#000000;border:1px solid #000;text-transform:uppercase;letter-spacing:.3px">
          ${tpl.nama}
        </td>
      </tr>`;

      const indRows = tpl.indikator.map(ind => {
        const r = data.rows.find(row => row.indikator_id === ind.id || row.id === ind.id);
        if (!r) return '';
        no++;
        const bg = 'white';
        const bulanCells = displayCols.map(c => {
          const v = c.type === 'tw' ? r.realisasiPerBulan?.[c.lastBulan] : r.realisasiPerBulan?.[c.bulan];
          const empty = v === null || v === undefined || v === '';
          return `<td style="padding:3px 2px;border:1px solid #000;text-align:center;font-size:10px;color:${empty ? '#000000' : '#1e293b'}">${empty ? '—' : v}</td>`;
        }).join('');
        const capColor = r._capaian === null ? '#000000'
          : parseFloat(r._capaian) >= 100 ? '#059669'
          : parseFloat(r._capaian) >= 80  ? '#2563eb'
          : parseFloat(r._capaian) >= 60  ? '#d97706' : '#dc2626';
        return `<tr style="background:${bg}">
          <td style="padding:4px 5px;border:1px solid #000;text-align:center;font-size:10px;color:#000000;min-width:36px;white-space:nowrap">${no}</td>
          <td style="padding:4px 5px;border:1px solid #000;font-size:10px">${r.nama_indikator || ind.indikator_kinerja}</td>
          <td style="padding:4px 3px;border:1px solid #000;text-align:center;font-size:10px;color:#000000">${r.target ?? '—'}</td>
          <td style="padding:4px 3px;border:1px solid #000;text-align:center;font-size:10px;color:#000000">${r.satuan || '—'}</td>
          <td style="padding:4px 5px;border:1px solid #000;font-size:10px;color:#1e293b;min-width:110px">${r.penanggung_jawab || '—'}</td>
          ${bulanCells}
          <td style="padding:4px 3px;border:1px solid #000;text-align:center;font-size:10px;font-weight:700;color:#000000">${r._realisasiSd ?? '—'}</td>
          <td style="padding:4px 3px;border:1px solid #000;text-align:center;font-size:10px;font-weight:700;color:${capColor}">${r._capaian !== null ? r._capaian + '%' : '—'}</td>
          <td style="padding:4px 5px;border:1px solid #000;font-size:10px">${r._fpenghambat || ''}</td>
          <td style="padding:4px 5px;border:1px solid #000;font-size:10px">${r._solusi || ''}</td>
          <td style="padding:4px 5px;border:1px solid #000;font-size:10px">${r._fpendukung || ''}</td>
          <td style="padding:4px 5px;border:1px solid #000;font-size:10px">${r._rencana_tl || ''}</td>
        </tr>`;
      }).filter(Boolean).join('');

      return headerRow + indRows;
    }).join('');

    const _witaOffset = new Date(new Date().getTime() + new Date().getTimezoneOffset() * 60000 + 8 * 3600000);
    const nowStr = new Date().toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' });
    const nowJam = `${String(_witaOffset.getHours()).padStart(2,'0')}:${String(_witaOffset.getMinutes()).padStart(2,'0')}:${String(_witaOffset.getSeconds()).padStart(2,'0')} WITA`;

    const kepalaDinas = await _fetchKepalaDinas();

    const bodyHtml = `
      ${_kopSuratHtml()}
      <div style="text-align:center;margin:18px 0 14px">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px">MONITORING DAN EVALUASI CAPAIAN KINERJA</div>
        <div style="font-size:10px;color:#475569;margin-top:3px">${sdLabel}</div>
      </div>
      <table style="border-collapse:collapse;border-spacing:0;width:100%;table-layout:auto">
        <thead>
          <tr style="background:#0d9488">
            <th rowspan="3" style="color:white;padding:5px 4px;border:1px solid #000;text-align:center;font-size:10px;width:36px">NO</th>
            <th rowspan="3" style="color:white;padding:5px 4px;border:1px solid #000;text-align:center;font-size:10px;min-width:150px">INDIKATOR KINERJA</th>
            <th rowspan="3" style="color:white;padding:5px 3px;border:1px solid #000;text-align:center;font-size:10px;width:40px">TARGET ${tahun}</th>
            <th rowspan="3" style="color:white;padding:5px 3px;border:1px solid #000;text-align:center;font-size:10px;width:38px">SATUAN</th>
            <th rowspan="3" style="color:white;padding:5px 3px;border:1px solid #000;text-align:center;font-size:10px;min-width:110px">BIDANG / SUB BAGIAN</th>
            ${twJudulHeader}
            <th rowspan="3" style="color:white;padding:5px 3px;border:1px solid #000;text-align:center;font-size:10px;width:50px">REALISASI S.D ${BULAN_FULL[bulanSampai].toUpperCase()}</th>
            <th rowspan="3" style="color:white;padding:5px 3px;border:1px solid #000;text-align:center;font-size:10px;width:45px">CAPAIAN</th>
            <th rowspan="3" style="color:white;padding:5px 4px;border:1px solid #000;text-align:center;font-size:10px;min-width:70px">FAKTOR PENGHAMBAT</th>
            <th rowspan="3" style="color:white;padding:5px 4px;border:1px solid #000;text-align:center;font-size:10px;min-width:70px">SOLUSI</th>
            <th rowspan="3" style="color:white;padding:5px 4px;border:1px solid #000;text-align:center;font-size:10px;min-width:70px">FAKTOR PENDUKUNG</th>
            <th rowspan="3" style="color:white;padding:5px 4px;border:1px solid #000;text-align:center;font-size:10px;min-width:70px">RENCANA TINDAK LANJUT</th>
          </tr>
          <tr style="background:#0d9488">${twHeaders}</tr>
          <tr style="background:#0d9488">${bulanHeaderCells}</tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      ${_ttdHtml(kepalaDinas, nowStr)}`;

    _bukaPreviewPDF(bodyHtml, `Capaian Indikator ${sdLabel}`, 'landscape');
  } catch (e) {
    toast('Gagal generate laporan: ' + e.message, 'error');
  } finally {
    if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline stroke-linecap="round" stroke-linejoin="round" points="7 10 12 15 17 10"/><line stroke-linecap="round" stroke-linejoin="round" x1="12" y1="15" x2="12" y2="3"/></svg> Capaian Indikator`; }
  }
}

// ══════════════════════════════════════════════════════
//  DOWNLOAD LAPORAN PER TSP — PDF
//  Struktur: NO | SASARAN STRATEGIS/PROGRAM/KEGIATAN | INDIKATOR | SATUAN | TARGET TAHUN
// ══════════════════════════════════════════════════════

async function downloadLaporanByTSP(btnEl) {
  const data = window._laporanKinerjaData;
  if (!data || !data.rows) { toast('Muat data laporan terlebih dahulu', 'error'); return; }

  if (btnEl) { btnEl.disabled = true; btnEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Memuat...`; }
  try {
    // Ambil SEMUA template kecuali urusan (tujuan + sasaran + program + kegiatan)
    const res = await fetch('/api/kinerja/laporan-template', { headers: authHeaders() });
    const tplData = await res.json();
    const allTemplates = (tplData.templates || []).filter(t => t.jenis !== 'urusan');
    if (!allTemplates.length) { toast('Belum ada template TSP. Buat dulu di Master Data → Kelola Indikator → Kelola Laporan.', 'error'); return; }

    const tplWithIndikator = await Promise.all(allTemplates.map(async t => {
      const r = await fetch(`/api/kinerja/laporan-template/${t.id}/indikator`, { headers: authHeaders() });
      const d = await r.json();
      return { ...t, indikator: d.indikator || [] };
    }));

    // Urutkan hierarkis: build tree dari parent_id, lalu DFS
    const tplMap = {};
    tplWithIndikator.forEach(t => { tplMap[t.id] = { ...t, _children: [] }; });
    const roots = [];
    tplWithIndikator.forEach(t => {
      if (t.parent_id && tplMap[t.parent_id]) {
        tplMap[t.parent_id]._children.push(tplMap[t.id]);
      } else {
        roots.push(tplMap[t.id]);
      }
    });
    const sortByUrutan = arr => arr.sort((a, b) => (a.urutan || 0) - (b.urutan || 0));
    const flattenTree = (nodes) => {
      sortByUrutan(nodes);
      let result = [];
      nodes.forEach(n => {
        result.push(n);
        if (n._children.length) result = result.concat(flattenTree(n._children));
      });
      return result;
    };
    const orderedTpl = flattenTree(roots);

    const { tahun, bulanSampai = 12, bulanDari = 1 } = data;
    const BULAN_FULL = ['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    const sdLabel = bulanDari === bulanSampai
      ? `${BULAN_FULL[bulanSampai]} ${tahun}`
      : `${BULAN_FULL[bulanDari]} - ${BULAN_FULL[bulanSampai]} ${tahun}`;
    const twLabel = bulanSampai <= 3 ? 'TW I' : bulanSampai <= 6 ? 'TW II' : bulanSampai <= 9 ? 'TW III' : 'TW IV';

    const BULAN_PENDEK = ['JAN','FEB','MAR','APR','MEI','JUN','JUL','AGU','SEP','OKT','NOV','DES'];
    const bulanList = Array.from({length: bulanSampai - bulanDari + 1}, (_, i) => bulanDari + i);
    const _twDef2 = [{tw:'I',s:1,e:3},{tw:'II',s:4,e:6},{tw:'III',s:7,e:9},{tw:'IV',s:10,e:12}];
    const _twPdfAktif2 = _twDef2.filter(tw => bulanList.some(b => b >= tw.s && b <= tw.e));
    const _twLengkap2 = (tw) => [tw.s, tw.s+1, tw.s+2].every(b => bulanList.includes(b));
    const displayCols = _twPdfAktif2.flatMap(tw => {
      if (_twLengkap2(tw)) {
        return [{ type: 'tw', tw: tw.tw, lastBulan: tw.e }];
      }
      return bulanList.filter(b => b >= tw.s && b <= tw.e).map(b => ({ type: 'bulan', bulan: b }));
    });
    const bulanHeaderCells = displayCols.filter(c => c.type === 'bulan').map(c =>
      `<th style="color:white;padding:4px 2px;border:1px solid #000;text-align:center;font-size:10px">${BULAN_PENDEK[c.bulan-1]}</th>`
    ).join('');
    const twJudulColspan = displayCols.length;
    const twJudulHeader = `<th colspan="${twJudulColspan}" style="color:white;padding:4px 3px;border:1px solid #000;text-align:center;font-size:10px;font-weight:700">KINERJA / REALISASI TRIWULAN</th>`;
    const twHeaders = _twPdfAktif2.map(tw => {
        const cols = displayCols.filter(c => (c.type === 'tw' && c.tw === tw.tw) || (c.type === 'bulan' && c.bulan >= tw.s && c.bulan <= tw.e)).length;
        const isLengkapTw = _twLengkap2(tw);
        return `<th colspan="${cols}" ${isLengkapTw ? 'rowspan="2"' : ''} style="color:white;padding:4px 3px;border:1px solid #000;text-align:center;font-size:10px">${tw.tw}</th>`;
      }).join('');

    const _witaOffset = new Date(new Date().getTime() + new Date().getTimezoneOffset() * 60000 + 8 * 3600000);
    const nowStr = new Date().toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' });
    const nowJam = `${String(_witaOffset.getHours()).padStart(2,'0')}:${String(_witaOffset.getMinutes()).padStart(2,'0')}:${String(_witaOffset.getSeconds()).padStart(2,'0')} WITA`;

    const kepalaDinas = await _fetchKepalaDinas();

    // Buat lookup map: indikator id (number) → row
    const rowById = {};
    data.rows.forEach(row => {
      // row.id bisa string (key dari object) atau number, normalisasi ke number
      rowById[parseInt(row.id)] = row;
    });

    // Config label per jenis (tanpa fill warna)
    const JENIS_CFG = {
      tujuan:   { label: 'TUJUAN' },
      sasaran:  { label: 'SASARAN STRATEGIS' },
      program:  { label: 'PROGRAM' },
      kegiatan: { label: 'KEGIATAN' },
    };

    // Counter per jenis untuk penomoran
    const jenisCounter = { tujuan: 0, sasaran: 0, program: 0, kegiatan: 0 };
    let kegiatanInGroup = 0; // reset tiap ganti program/sasaran
    let lastParentJenis = null;

    const rowsHtml = orderedTpl.map((tpl, tplIdx) => {
      const cfg = JENIS_CFG[tpl.jenis] || { label: tpl.jenis.toUpperCase() };
      if (tpl.jenis in jenisCounter) jenisCounter[tpl.jenis]++;
      const jenisNo = jenisCounter[tpl.jenis] || '';
      const labelWithNo = (tpl.jenis === 'sasaran' || tpl.jenis === 'program') && orderedTpl.filter(t => t.jenis === tpl.jenis).length > 1
        ? `${cfg.label} ${jenisNo}`
        : cfg.label;

      // Untuk kegiatan: reset counter saat parent berubah
      if (tpl.jenis === 'kegiatan') {
        // Cek apakah ini kegiatan pertama setelah parent baru
        const prevNonKegiatan = orderedTpl.slice(0, tplIdx).filter(t => t.jenis !== 'kegiatan').pop();
        if (prevNonKegiatan !== lastParentJenis) {
          lastParentJenis = prevNonKegiatan;
          kegiatanInGroup = 0;
        }
        kegiatanInGroup++;
      }

      if (!tpl.indikator.length) return '';

      // Baris header "KEGIATAN :" untuk kegiatan pertama dalam grup
      const kegiatanHeaderRow = tpl.jenis === 'kegiatan' && kegiatanInGroup === 1
        ? `<tr><td colspan="${12 + displayCols.length}" style="padding:4px 8px;border:1px solid #000;font-size:10px;font-weight:700;color:#000;letter-spacing:.3px">KEGIATAN :</td></tr>`
        : '';

      return tpl.indikator.map((ind, idx) => {
        const r = rowById[parseInt(ind.id)];
        const target    = r?.target  ?? '—';
        const satuan    = r?.satuan  || ind.satuan || '—';
        const namaInd   = r?.nama_indikator || ind.indikator_kinerja || '—';
        const realisasi = r?._realisasiSd ?? '—';
        const capaian   = r?._capaian !== null && r?._capaian !== undefined ? r._capaian + '%' : '—';
        const capColor  = !r?._capaian ? '#000000'
          : parseFloat(r._capaian) >= 100 ? '#059669'
          : parseFloat(r._capaian) >= 80  ? '#2563eb'
          : parseFloat(r._capaian) >= 60  ? '#d97706' : '#dc2626';
        const permasalahan = r?._fpenghambat || '';
        const solusi       = r?._solusi || '';
        const fpendukung   = r?._fpendukung || '';
        const rencanaTl    = r?._rencana_tl || '';
        const bulanCells = displayCols.map(c => {
          const v = c.type === 'tw' ? r?.realisasiPerBulan?.[c.lastBulan] : r?.realisasiPerBulan?.[c.bulan];
          const empty = v === null || v === undefined || v === '';
          return `<td style="padding:5px 2px;border:1px solid #000;text-align:center;font-size:10px;color:${empty ? '#000000' : '#1e293b'};vertical-align:top">${empty ? '—' : v}</td>`;
        }).join('');

        let groupCell;
        if (tpl.jenis === 'kegiatan') {
          groupCell = idx === 0
            ? `<td style="padding:6px 8px;border:1px solid #000;border-top:1px solid #000;font-size:10px;font-weight:700;vertical-align:top;color:#000;line-height:1.4">
                 <div style="font-size:10px;line-height:1.4">${tpl.nama}</div>
               </td>`
            : `<td style="padding:5px 6px;border:1px solid #000;border-top:none"></td>`;
        } else {
          groupCell = idx === 0
            ? `<td colspan="2" style="padding:6px 8px;border:1px solid #000;border-top:1px solid #000;font-size:10px;font-weight:700;vertical-align:top;color:#000;background:#f8fafc">
                 <div style="font-size:10px;font-weight:700;color:#000;margin-bottom:2px;text-transform:uppercase;letter-spacing:.4px">${labelWithNo}</div>
                 <div style="font-size:10px;line-height:1.4">${tpl.nama}</div>
               </td>`
            : `<td style="padding:5px 6px;border:1px solid #000;border-top:none"></td>`;
        }

        return `${idx === 0 ? kegiatanHeaderRow : ''}<tr>
          ${idx === 0 && tpl.jenis !== 'kegiatan' ? '' : `<td style="padding:6px 8px;border:1px solid #000;text-align:center;font-size:10px;font-weight:700;color:#000000;vertical-align:top;line-height:1.4">${tpl.jenis === 'kegiatan' && idx === 0 ? kegiatanInGroup : ''}</td>`}
          ${groupCell}
          <td style="padding:5px 8px;border:1px solid #000;font-size:10px;vertical-align:top;line-height:1.4">${namaInd}</td>
          <td style="padding:5px 6px;border:1px solid #000;text-align:center;font-size:10px;vertical-align:top">${satuan}</td>
          <td style="padding:5px 6px;border:1px solid #000;text-align:center;font-size:10px;font-weight:700;vertical-align:top">${target}</td>
          <td style="padding:5px 6px;border:1px solid #000;font-size:10px;color:#1e293b;vertical-align:top;min-width:110px">${r?.penanggung_jawab || '—'}</td>
          ${bulanCells}
          <td style="padding:5px 6px;border:1px solid #000;text-align:center;font-size:10px;font-weight:700;vertical-align:top">${realisasi}</td>
          <td style="padding:5px 6px;border:1px solid #000;text-align:center;font-size:10px;font-weight:700;color:${capColor};vertical-align:top">${capaian}</td>
          <td style="padding:5px 7px;border:1px solid #000;font-size:10px;vertical-align:top;line-height:1.4">${permasalahan}</td>
          <td style="padding:5px 7px;border:1px solid #000;font-size:10px;vertical-align:top;line-height:1.4">${solusi}</td>
          <td style="padding:5px 7px;border:1px solid #000;font-size:10px;vertical-align:top;line-height:1.4">${fpendukung}</td>
          <td style="padding:5px 7px;border:1px solid #000;font-size:10px;vertical-align:top;line-height:1.4">${rencanaTl}</td>
        </tr>`;
      }).join('');
    }).join('');

    const bodyHtml = `
      ${_kopSuratHtml()}
      <table style="border-collapse:collapse;width:100%;margin-bottom:12px;font-size:10px">
        <tr>
          <td style="padding:2px 0;width:160px;font-weight:700;font-size:10px">PERANGKAT DAERAH</td>
          <td style="padding:2px 0;width:10px;font-size:10px">:</td>
          <td style="padding:2px 0;font-weight:600;font-size:10px">DINAS KESEHATAN, PENGENDALIAN PENDUDUK DAN KELUARGA BERENCANA</td>
        </tr>
        <tr>
          <td style="padding:2px 0;font-weight:700;font-size:10px">BULAN/TRIWULAN</td>
          <td style="padding:2px 0;font-size:10px">:</td>
          <td style="padding:2px 0;font-weight:600;font-size:10px">${BULAN_FULL[bulanSampai].toUpperCase()} / ${twLabel}</td>
        </tr>
      </table>
      <div style="text-align:center;margin:16px 0 14px">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px">MONITORING DAN EVALUASI CAPAIAN KINERJA</div>
        <div style="font-size:10px;color:#475569;margin-top:3px">${sdLabel}</div>
      </div>
      <table style="border-collapse:collapse;border-spacing:0;width:100%">
        <thead>
          <tr style="background:#0d9488">
            <th rowspan="3" style="color:white;padding:6px 4px;border:1px solid #000;text-align:center;font-size:10px;width:36px">NO</th>
            <th rowspan="3" style="color:white;padding:6px 8px;border:1px solid #000;text-align:center;font-size:10px;width:180px">SASARAN STRATEGIS /<br>PROGRAM / KEGIATAN</th>
            <th rowspan="3" style="color:white;padding:6px 8px;border:1px solid #000;text-align:center;font-size:10px">INDIKATOR KINERJA</th>
            <th rowspan="3" style="color:white;padding:6px 5px;border:1px solid #000;text-align:center;font-size:10px;width:50px">SATUAN</th>
            <th rowspan="3" style="color:white;padding:6px 5px;border:1px solid #000;text-align:center;font-size:10px;width:55px">TARGET ${tahun}</th>
            <th rowspan="3" style="color:white;padding:6px 5px;border:1px solid #000;text-align:center;font-size:10px;min-width:110px">BIDANG / SUB BAGIAN</th>
            ${twJudulHeader}
            <th rowspan="3" style="color:white;padding:6px 5px;border:1px solid #000;text-align:center;font-size:10px;width:55px">REALISASI S.D ${BULAN_FULL[bulanSampai].toUpperCase()}</th>
            <th rowspan="3" style="color:white;padding:6px 5px;border:1px solid #000;text-align:center;font-size:10px;width:50px">CAPAIAN</th>
            <th rowspan="3" style="color:white;padding:6px 6px;border:1px solid #000;text-align:center;font-size:10px;min-width:80px">FAKTOR PENGHAMBAT</th>
            <th rowspan="3" style="color:white;padding:6px 6px;border:1px solid #000;text-align:center;font-size:10px;min-width:80px">SOLUSI</th>
            <th rowspan="3" style="color:white;padding:6px 6px;border:1px solid #000;text-align:center;font-size:10px;min-width:80px">FAKTOR PENDUKUNG</th>
            <th rowspan="3" style="color:white;padding:6px 6px;border:1px solid #000;text-align:center;font-size:10px;min-width:80px">RENCANA TINDAK LANJUT</th>
          </tr>
          <tr style="background:#0d9488">${twHeaders}</tr>
          <tr style="background:#0d9488">${bulanHeaderCells}</tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      ${_ttdHtml(kepalaDinas, nowStr)}`;

    _bukaPreviewPDF(bodyHtml, `Monev Kinerja ${sdLabel}`, 'landscape');
  } catch (e) {
    toast('Gagal generate laporan: ' + e.message, 'error');
  } finally {
    if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline stroke-linecap="round" stroke-linejoin="round" points="7 10 12 15 17 10"/><line stroke-linecap="round" stroke-linejoin="round" x1="12" y1="15" x2="12" y2="3"/></svg> Monev Kinerja`; }
  }
}