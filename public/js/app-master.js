// ============== LAPORAN ==============
// Per-tab page size overrides (tidak mengubah ITEMS_PER_PAGE global)
const _PAGE_SIZE_JAB = 12;
const _PAGE_SIZE_PKM = 12;
const _PAGE_SIZE_IND = 12;
function _paginateCustom(rows, page, size) {
  const total = rows.length;
  const totalPages = Math.ceil(total / size) || 1;
  const p = Math.max(1, Math.min(page || 1, totalPages));
  const start = (p - 1) * size;
  return { items: rows.slice(start, start + size), page: p, totalPages, total };
}

// Semua data laporan mentah (sebelum filter bulan/status/pkm)
let _lapAllData = [];

async function renderLaporan() {
  const role = currentUser.role;
  document.getElementById('mainContent').innerHTML = `
    <div class="page-header">
      <h1><span class="material-icons">bar_chart</span>Laporan</h1>
    </div>
    <div class="stats-grid" id="lapStats"></div>
    <div class="card">
      <div class="card-header-bar" style="justify-content:space-between">
        <span class="card-title"><span class="material-icons">filter_list</span>Filter</span>
        <div style="display:flex;gap:6px;align-items:center">
          <button onclick="downloadRekapLaporan()" title="Download PDF Rekap sesuai filter"
            style="background:transparent;border:none;padding:4px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v13"/><path d="m7 11 5 5 5-5"/><path d="M4 19c0 1.1 1.8 2 4 2h8c2.2 0 4-.9 4-2"/></svg>
          </button>
        </div>
      </div>
      <div class="card-body">
        <div class="filter-row">
          <select class="form-control" id="lapTahun" onchange="loadLaporan()" style="min-width:100px"><option value="">Memuat...</option></select>
          <select class="form-control" id="lapBulan" onchange="_lapApplyFilter()"><option value="">Semua Bulan</option></select>
          ${role === 'Admin' ? `<select class="form-control" id="lapPKM" onchange="_lapApplyFilter()"><option value="">Semua Puskesmas</option></select>` : ''}
          <select class="form-control" id="lapStatus" onchange="_lapApplyFilter()">
            <option value="">Semua Status</option>
          </select>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-body" style="padding:0" id="lapTable"></div>
    </div>`;

  await loadLaporan();
}

// Rebuild filter opsi dari data yang ada
function _lapRebuildFilters(rows, selTahun, selBulan, selStatus, selPKM) {
  // --- Tahun ---
  const tahunSel = document.getElementById('lapTahun');
  if (tahunSel) {
    const years = [...new Set(rows.map(r => parseInt(r.tahun)).filter(Boolean))].sort((a,b) => b - a);
    const picked = selTahun || (years[0] || CURRENT_YEAR);
    tahunSel.innerHTML = years.map(y => `<option value="${y}" ${y == picked ? 'selected':''}>${y}</option>`).join('');
  }

  const tahunPilih = parseInt(document.getElementById('lapTahun')?.value || selTahun);
  const rowsByTahun = rows.filter(r => !tahunPilih || parseInt(r.tahun) === tahunPilih);

  // --- Bulan (dari data tahun terpilih) ---
  const bulanSel = document.getElementById('lapBulan');
  if (bulanSel) {
    const bulanMap = new Map();
    rowsByTahun.forEach(r => { if (r.bulan && r.namaBulan) bulanMap.set(parseInt(r.bulan), r.namaBulan); });
    const bulanSorted = [...bulanMap.entries()].sort((a,b) => a[0]-b[0]);
    bulanSel.innerHTML = '<option value="">Semua Bulan</option>'
      + bulanSorted.map(([no, nama]) => `<option value="${no}" ${selBulan == no ? 'selected':''}>${nama}</option>`).join('');
  }

  // --- Puskesmas (dari data tahun terpilih, hanya untuk Admin) ---
  const pkmSel = document.getElementById('lapPKM');
  if (pkmSel) {
    // Kumpulkan PKM unik, urut alfabetis
    const pkmMap = new Map();
    rowsByTahun.forEach(r => { if (r.kodePKM && r.namaPKM) pkmMap.set(r.kodePKM, r.namaPKM); });
    const pkmSorted = [...pkmMap.entries()].sort((a,b) => a[1].localeCompare(b[1]));
    pkmSel.innerHTML = '<option value="">Semua Puskesmas</option>'
      + pkmSorted.map(([kode, nama]) => `<option value="${kode}" ${selPKM === kode ? 'selected':''}>${nama}</option>`).join('');
  }

  // --- Status (dari data tahun terpilih) ---
  const statusSel = document.getElementById('lapStatus');
  if (statusSel) {
    const statusOrder = ['Draft','Menunggu Kepala Puskesmas','Menunggu Pengelola Program','Menunggu Admin','Selesai','Ditolak'];
    const statusSet = new Set(rowsByTahun.map(r => r.statusGlobal).filter(Boolean));
    const statusSorted = statusOrder.filter(s => statusSet.has(s));
    statusSet.forEach(s => { if (!statusSorted.includes(s)) statusSorted.push(s); });
    statusSel.innerHTML = '<option value="">Semua Status</option>'
      + statusSorted.map(s => `<option value="${s}" ${selStatus === s ? 'selected':''}>${s}</option>`).join('');
  }
}

// Apply filter di sisi klien ke _lapAllData
function _lapApplyFilter() {
  const tahun    = document.getElementById('lapTahun')?.value;
  const bulan    = document.getElementById('lapBulan')?.value;
  const status   = document.getElementById('lapStatus')?.value;
  const pkm      = document.getElementById('lapPKM')?.value;

  // Rebuild semua filter untuk tahun yang dipilih (termasuk PKM & bulan)
  _lapRebuildFilters(_lapAllData, tahun, bulan, status, pkm);

  const filtered = _lapAllData.filter(r =>
    (!tahun    || String(r.tahun) === String(tahun))  &&
    (!bulan    || String(r.bulan) === String(bulan))  &&
    (!status   || r.statusGlobal  === status)         &&
    (!pkm      || r.kodePKM       === pkm)
  );

  _lapRenderTable(filtered);
}

async function loadLaporan() {
  // Fetch SEMUA data (tanpa filter tahun/bulan/status) agar filter bisa dibangun dari data nyata
  const params = {};
  if (currentUser.role === 'Operator')        params.email_operator = currentUser.email;
  if (currentUser.role === 'Kepala Puskesmas') params.kode_pkm       = currentUser.kodePKM;

  try {
    const result = await API.getLaporan(params);
    const rawData = result.data || [];

    _lapAllData = rawData;

    const prevTahun  = document.getElementById('lapTahun')?.value  || String(CURRENT_YEAR);
    const prevBulan  = document.getElementById('lapBulan')?.value  || '';
    const prevStatus = document.getElementById('lapStatus')?.value || '';
    const prevPKM    = document.getElementById('lapPKM')?.value    || '';

    _lapRebuildFilters(_lapAllData, prevTahun, prevBulan, prevStatus, prevPKM);
    _lapApplyFilter();
  } catch (e) { if (!window._verifSilentReload) toast(e.message, 'error'); }
}

function _lapRenderTable(data) {
  // Hitung summary dari data yang sudah difilter
  const total   = data.length;
  const selesai = data.filter(r => r.statusGlobal === 'Selesai').length;
  const pending = data.filter(r => !['Selesai','Ditolak'].includes(r.statusGlobal)).length;
  const indeks  = data.filter(r => parseFloat(r.indeksSPM) > 0).map(r => parseFloat(r.indeksSPM));
  const rataSPM = indeks.length ? (indeks.reduce((a,b)=>a+b,0)/indeks.length).toFixed(2) : '0';

  document.getElementById('lapStats').innerHTML = `
    ${statCard('blue','assignment','Total Usulan', total)}
    ${statCard('green','check_circle','Selesai', selesai)}
    ${statCard('orange','pending','Pending', pending)}
    ${statCard('purple','trending_up','Rata-rata Indeks SPM', rataSPM)}`;

  window._laporanData = data;
  window._lapPage = 1;

  if (!data.length) {
    document.getElementById('lapTable').innerHTML = `<div class="empty-state" style="padding:32px"><span class="material-icons">inbox</span><p>Tidak ada data untuk filter ini</p></div>`;
    return;
  }

  _lapRenderPage(1);
}

function _lapRenderPage(page) {
  const data = window._laporanData || [];
  const { items, page: p, totalPages, total } = paginateData(data, page);
  window._lapPage = p;

  // Hitung offset nomor urut berdasarkan halaman
  const offset = (p - 1) * 10;

  document.getElementById('lapTable').innerHTML = `
    <div class="table-container"><table>
      <thead><tr><th>No</th><th>Puskesmas</th><th>Periode</th><th>Tgl Dibuat</th><th>Indeks SPM</th><th>Status</th><th>Aksi</th></tr></thead>
      <tbody>${items.map((r, i) => `<tr>
        <td>${offset + i + 1}</td>
        <td>${r.namaPKM}</td>
        <td>${r.namaBulan} ${r.tahun}</td>
        <td style="font-size:11.5px;color:var(--text-light)">${formatDateTime(r.createdAt)}</td>
        <td class="rasio-cell" style="font-weight:700;color:var(--primary)">${parseFloat(r.indeksSPM||0).toFixed(2)}</td>
        <td>${statusBadge(r.statusGlobal)}</td>
        <td style="white-space:nowrap">
          <button class="btn-icon view" onclick="viewDetail('${r.idUsulan}')" title="Detail"><span class="material-icons">visibility</span></button>
          ${getDownloadBtn(r, 20, currentUser.role, currentUser.indikatorAkses)}
          <button class="btn-icon" onclick="openLogAktivitas('${r.idUsulan}')" title="Riwayat Aktivitas" style="background:transparent;border:none;color:#64748b"><span class="material-icons" style="font-size:18px">history</span></button>
        </td>
      </tr>`).join('')}
      </tbody>
    </table></div>`
    + renderPagination('lapTable', total, p, totalPages, pg => _lapRenderPage(pg));
}

function exportLaporan() {
  const data = window._laporanData;
  if (!data || !data.length) return toast('Tidak ada data untuk diekspor', 'warning');
  const tahun   = document.getElementById('lapTahun')?.value || '';
  const bulan   = document.getElementById('lapBulan')?.options[document.getElementById('lapBulan').selectedIndex]?.text || 'Semua Bulan';
  const pkm     = document.getElementById('lapPKM')?.options[document.getElementById('lapPKM')?.selectedIndex]?.text || '';
  const filterInfo = `Tahun: ${tahun} | Bulan: ${bulan}${pkm ? ' | PKM: '+pkm : ''}`;
  const headers = ['No','ID Usulan','Puskesmas','Periode','Tgl Dibuat','Indeks SPM','Status','Dibuat Oleh'];
  const rows = data.map((r, i) => [
    i + 1, r.idUsulan, r.namaPKM,
    r.namaBulan + ' ' + r.tahun,
    formatDateTime(r.createdAt),
    parseFloat(r.indeksSPM||0).toFixed(2),
    r.statusGlobal, r.createdBy||''
  ]);
  _downloadExcel('Laporan_SPM_' + tahun, headers, rows);
  toast('Export Excel berhasil! Filter: ' + filterInfo, 'success');
}

// Download PDF Rekap sesuai filter aktif — 1 PDF tabel rekap dengan kop surat
async function downloadRekapLaporan() {
  const data = window._laporanData;
  if (!data || !data.length) return toast('Tidak ada data untuk didownload', 'warning');

  // Susun label filter untuk ditampilkan di PDF
  const tahun  = document.getElementById('lapTahun')?.value || '';
  const bulanEl = document.getElementById('lapBulan');
  const bulan  = bulanEl?.options[bulanEl.selectedIndex]?.text || '';
  const pkmEl  = document.getElementById('lapPKM');
  const pkm    = pkmEl?.options[pkmEl?.selectedIndex]?.text || '';
  const statusEl = document.getElementById('lapStatus');
  const status = statusEl?.options[statusEl.selectedIndex]?.text || '';

  const parts = [];
  if (tahun) parts.push(`Tahun ${tahun}`);
  if (bulan && bulan !== 'Semua Bulan') parts.push(bulan);
  if (pkm   && pkm   !== 'Semua Puskesmas') parts.push(pkm);
  if (status && status !== 'Semua Status') parts.push(status);
  const filterLabel = parts.length ? parts.join(' | ') : 'Semua Data';

  const ids = data.map(r => r.idUsulan);
  const idsParam = encodeURIComponent(ids.join(','));
  const filterParam = encodeURIComponent(filterLabel);
  const url = `/api/laporan-pdf?mode=rekap&ids=${idsParam}&filter_label=${filterParam}`;

  const pw = window.open('', '_blank');
  if (!pw) return toast('Popup diblokir browser. Izinkan popup untuk situs ini.', 'error');

  const _steps = ['Mengambil data rekap...','Menyusun tabel...','Menyiapkan kop surat...','Menyiapkan cetak...'];
  pw.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Memuat Rekap Laporan...</title><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',Arial,sans-serif;background:#0f172a;display:flex;align-items:center;justify-content:center;height:100vh;overflow:hidden}
    body::before{content:'';position:fixed;inset:0;background:radial-gradient(ellipse 80% 60% at 50% 0%,rgba(13,148,136,0.15) 0%,transparent 70%);pointer-events:none}
    .card{background:rgba(15,23,42,0.95);border:1px solid rgba(13,148,136,0.25);border-radius:24px;padding:44px 52px;text-align:center;box-shadow:0 0 0 1px rgba(255,255,255,0.04),0 32px 80px rgba(0,0,0,0.6);max-width:400px;width:90%;position:relative;overflow:hidden}
    .card::before{content:'';position:absolute;top:-1px;left:20%;right:20%;height:1px;background:linear-gradient(90deg,transparent,#0d9488,transparent)}
    .logo-wrap{width:72px;height:72px;margin:0 auto 24px;position:relative}
    .pulse{position:absolute;inset:-8px;border-radius:50%;border:1px solid rgba(13,148,136,0.3);animation:pulse 2s ease-out infinite}
    .pulse2{position:absolute;inset:-16px;border-radius:50%;border:1px solid rgba(13,148,136,0.15);animation:pulse 2s ease-out infinite .6s}
    .ring-wrap{position:absolute;inset:0}.ring{position:absolute;inset:0;border-radius:50%;border:2.5px solid transparent}
    .ring-1{border-top-color:#0d9488;animation:spin 1.1s linear infinite}
    .ring-2{inset:7px;border-right-color:#14b8a6;animation:spin 1.7s linear infinite reverse}
    .ring-3{inset:14px;border-bottom-color:#5eead4;animation:spin 2.3s linear infinite}
    .icon-c{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes pulse{0%{transform:scale(1);opacity:.6}100%{transform:scale(1.5);opacity:0}}
    .badge{display:inline-block;font-size:9px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#0d9488;background:rgba(13,148,136,0.1);border:1px solid rgba(13,148,136,0.3);border-radius:99px;padding:3px 10px;margin-bottom:14px}
    .title{font-size:22px;font-weight:800;color:white;letter-spacing:-0.3px;margin-bottom:6px}
    .desc{font-size:12.5px;color:#64748b;margin-bottom:28px;line-height:1.5}
    .bar-wrap{background:rgba(255,255,255,0.06);border-radius:99px;height:4px;overflow:hidden;margin-bottom:20px}
    .bar{height:100%;width:0%;background:linear-gradient(90deg,#0d9488,#14b8a6,#5eead4);border-radius:99px;animation:load 3.8s cubic-bezier(.4,0,.2,1) forwards}
    @keyframes load{0%{width:0%}25%{width:38%}55%{width:65%}78%{width:82%}95%{width:93%}100%{width:95%}}
    .steps{display:flex;flex-direction:column;gap:7px;text-align:left}
    .step{display:flex;align-items:center;gap:8px;font-size:11px;color:#1e3a4a;transition:color .4s}
    .step.active{color:#5eead4}.step.done{color:#0d9488}
    .step-dot{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.07);flex-shrink:0;transition:all .4s}
    .step.active .step-dot{background:#5eead4;box-shadow:0 0 8px #5eead4}.step.done .step-dot{background:#0d9488}
    .step-check{display:none;font-size:10px}.step.done .step-check{display:inline}.step.done .step-dot{display:none}
  </style>
  <script>
    var _s=${JSON.stringify(_steps)};var _t=[700,1500,2500,3300];
    _s.forEach(function(s,i){setTimeout(function(){var els=document.querySelectorAll('.step');if(i>0&&els[i-1])els[i-1].className='step done';if(els[i])els[i].className='step active';},_t[i]||i*900);});
  <\/script></head><body>
    <div class="card">
      <div class="logo-wrap"><div class="pulse"></div><div class="pulse2"></div>
        <div class="ring-wrap"><div class="ring ring-1"></div><div class="ring ring-2"></div><div class="ring ring-3"></div></div>
        <div class="icon-c"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#5eead4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg></div>
      </div>
      <div class="badge">VISPM</div>
      <div class="title">Rekap Laporan</div>
      <div class="desc">Menyiapkan rekap ${data.length} usulan...<br><span style="font-size:11px;color:#475569">${filterLabel}</span></div>
      <div class="bar-wrap"><div class="bar"></div></div>
      <div class="steps">${_steps.map((s,i)=>`<div class="step${i===0?' active':''}"><div class="step-dot"></div><span class="step-check">✓</span>${s}</div>`).join('')}</div>
    </div>
  </body></html>`);

  toast('Menyiapkan rekap laporan...', 'success');
  try {
    const _user = (() => { try { return JSON.parse(sessionStorage.getItem('spm_user') || '{}'); } catch(e) { return {}; } })();
    const _token = _user.sessionToken || '';
    const res = await fetch(url, { headers: _token ? { 'Authorization': 'Bearer ' + _token } : {} });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const html = await res.text();
    pw.document.open();
    pw.document.write(html);
    pw.document.close();
  } catch(e) {
    pw.document.write('<html><body style="font-family:Arial;padding:40px;color:#ef4444"><p>Gagal memuat rekap: ' + e.message + '</p></body></html>');
    toast('Gagal membuka rekap: ' + e.message, 'error');
  }
}

// ============== MASTER DATA (TAB) ==============
let _masterActiveTab = 'users';

async function renderMasterData(tab) {
  if (tab) _masterActiveTab = tab;
  const activeTab = _masterActiveTab;

  // Selalu build shell dulu jika belum ada
  if (!document.getElementById('masterTabContent')) {
    _buildMasterShell();
  }

  _highlightMasterTab(activeTab);

  const tc = document.getElementById('masterTabContent');
  tc.innerHTML = loadingBlock('Memuat...');
  setLoading(true);
  try {
    if (activeTab === 'pejabat') {
      await renderPejabatTab(tc);
    } else if (activeTab === 'penandatangan') {
      await renderPenandatanganTab(tc);
    } else if (activeTab === 'audit-trail') {
      await renderAuditTrail(tc);
    } else {
      const fnMap = {
        users: renderUsers, jabatan: renderJabatan, pkm: renderPKM,
        indikator: renderIndikator, periode: renderPeriode,
        'target-tahunan': renderTargetTahunan
      };
      const fn = fnMap[activeTab];
      if (fn) await _renderIntoTab(fn);
    }
  } finally { setLoading(false); }
}

async function renderSettingsTab(el) {
  // Jika dipanggil dari _renderToTab (el = masterTabContent), atau dari first load
  const target = el || document.getElementById('masterTabContent');
  if (!target) return;
  target.innerHTML = `
    <div class="card">
      <div class="card-header-bar">
        <span class="card-title"><span class="material-icons">settings</span>Pengaturan Sistem</span>
      </div>
      <div class="card-body">
        <p style="font-size:13px;color:#64748b;margin-bottom:20px">Atur rentang tahun yang tampil di seluruh sistem (filter laporan, input usulan, dll).</p>
        <div class="form-row" style="max-width:400px">
          <div class="form-group">
            <label>Tahun Awal</label>
            <input class="form-control" type="number" id="settingTahunAwal" min="2020" max="2040" placeholder="cth: 2024">
          </div>
          <div class="form-group">
            <label>Tahun Akhir</label>
            <input class="form-control" type="number" id="settingTahunAkhir" min="2020" max="2040" placeholder="cth: 2027">
          </div>
        </div>
        <div id="settingStatus" style="font-size:12.5px;color:#ef4444;min-height:18px;margin-bottom:12px"></div>
        <button class="btn btn-primary" onclick="saveSettings()">
          <span class="material-icons">save</span>Simpan Pengaturan
        </button>
      </div>
    </div>`;

  try {
    const res = await API.get('settings');
    if (res && res.tahun_awal) {
      document.getElementById('settingTahunAwal').value = res.tahun_awal;
      document.getElementById('settingTahunAkhir').value = res.tahun_akhir;
    }
  } catch(e) { /* silent */ }
}

async function renderPejabatTab(el) {
  el.innerHTML = `
    <div class="card">
      <div class="card-header-bar">
        <span class="card-title"><span class="material-icons">draw</span>Pejabat Penandatangan</span>
      </div>
      <div class="card-body">
        <p style="font-size:13px;color:#64748b;margin-bottom:20px">Tanda tangan pejabat berikut akan muncul di laporan PDF yang telah selesai diverifikasi.</p>
        <div id="pejabatList" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px">
          ${loadingBlock('Memuat...')}
        </div>
      </div>
    </div>`;
  try {
    const list = await API.get('pejabat').catch(() => []);
    const jabatanList = ['Kepala Sub Bagian Perencanaan'];
    const container = document.getElementById('pejabatList');
    container.innerHTML = jabatanList.map(jab => {
      const pj = list.find(p => p.jabatan === jab) || {};
      const ttValid = pj.tanda_tangan && (pj.tanda_tangan.startsWith('data:image') || pj.tanda_tangan.startsWith('http'));
      return `<div class="card" style="margin:0">
        <div class="card-body">
          <div style="font-weight:700;font-size:13px;color:#0d9488;margin-bottom:12px">${jab}</div>
          <div class="form-group">
            <label>Nama</label>
            <input class="form-control" id="pj_nama_${jab.replace(/\s+/g,'_')}" value="${pj.nama||''}" placeholder="Nama pejabat">
          </div>
          <div class="form-group">
            <label>NIP</label>
            <input class="form-control" id="pj_nip_${jab.replace(/\s+/g,'_')}" value="${pj.nip||''}" placeholder="NIP (opsional)">
          </div>
          <div class="form-group">
            <label>Tanda Tangan <span style="font-size:11px;color:#94a3b8">(maks 2MB)</span></label>
            <div style="border:2px dashed #cbd5e1;border-radius:8px;padding:10px;text-align:center;cursor:pointer" onclick="document.getElementById('pj_tt_input_${jab.replace(/\s+/g,'_')}').click()">
              <img id="pj_tt_preview_${jab.replace(/\s+/g,'_')}" src="${ttValid ? pj.tanda_tangan : ''}" style="max-height:72px;max-width:200px;object-fit:contain;display:${ttValid?'block':'none'};margin:0 auto">
              <div id="pj_tt_placeholder_${jab.replace(/\s+/g,'_')}" style="color:#94a3b8;font-size:12px;${ttValid?'display:none':''}"><span class="material-icons" style="font-size:24px;display:block">draw</span>Klik upload tanda tangan</div>
              <input type="file" id="pj_tt_input_${jab.replace(/\s+/g,'_')}" accept="image/*" style="display:none" onchange="previewPejabatTT(event,'${jab.replace(/\s+/g,'_')}')">
            </div>
            ${ttValid ? `<button type="button" style="font-size:12px;color:#ef4444;background:none;border:none;cursor:pointer;margin-top:4px" onclick="hapusPejabatTT('${jab.replace(/\s+/g,'_')}')"><span class="material-icons" style="font-size:14px;vertical-align:middle">delete</span> Hapus tanda tangan</button>` : ''}
          <div style="margin-top:8px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:8px 10px;font-size:11.5px;color:#92400e;line-height:1.6">
            <span class="material-icons" style="font-size:13px;vertical-align:middle;margin-right:3px">info</span>
            <strong>Tips:</strong> Gunakan foto tanda tangan dengan <b>latar putih/terang</b>.
            Gambar dikompresi otomatis saat disimpan.
            Jika tanda tangan <b>tidak muncul di laporan PDF</b>, silakan <b>upload ulang</b>.
          </div>
          </div>
          <button class="btn btn-primary btn-sm" style="margin-top:4px" onclick="savePejabat('${jab}')">
            <span class="material-icons">save</span>Simpan
          </button>
        </div>
      </div>`;
    }).join('');
  } catch(e) { toast('Gagal memuat data pejabat: '+e.message, 'error'); }
}

function previewPejabatTT(e, jabKey) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 2*1024*1024) { alert('File terlalu besar, maks 2MB'); e.target.value=''; return; }
  resizeImageToBase64(file, 400, 200, 0.82, b64 => {
    e.target._newTT = b64;
    const preview = document.getElementById('pj_tt_preview_'+jabKey);
    const placeholder = document.getElementById('pj_tt_placeholder_'+jabKey);
    if (preview) { preview.src = b64; preview.style.display = 'block'; }
    if (placeholder) placeholder.style.display = 'none';
  });
}

function hapusPejabatTT(jabKey) {
  const preview = document.getElementById('pj_tt_preview_'+jabKey);
  const placeholder = document.getElementById('pj_tt_placeholder_'+jabKey);
  const input = document.getElementById('pj_tt_input_'+jabKey);
  if (preview) { preview.src = ''; preview.style.display = 'none'; }
  if (placeholder) placeholder.style.display = '';
  if (input) { input.value = ''; input._newTT = null; }
}

async function savePejabat(jabatan) {
  const jabKey = jabatan.replace(/\s+/g,'_');
  const nama = document.getElementById('pj_nama_'+jabKey)?.value.trim();
  const nip  = document.getElementById('pj_nip_'+jabKey)?.value.trim();
  const ttInput = document.getElementById('pj_tt_input_'+jabKey);
  const ttPreview = document.getElementById('pj_tt_preview_'+jabKey);
  let tanda_tangan = ttPreview?.src && ttPreview.src !== window.location.href ? ttPreview.src : null;
  if (ttInput?._newTT !== undefined) tanda_tangan = ttInput._newTT;
  if (!nama) { toast('Nama pejabat tidak boleh kosong', 'error'); return; }
  setLoading(true);
  try {
    await API.post('pejabat', { jabatan, nama, nip, tandaTangan: tanda_tangan });
    toast('Data '+jabatan+' berhasil disimpan!', 'success');
    renderPejabatTab(document.getElementById('masterTabContent'));
    // Auto-refresh tombol verifikasi jika modal verifikasi terbuka (Admin)
    const verifModal = document.getElementById('verifikasiModal');
    if (verifModal && verifModal.classList.contains('show')) {
      // Re-cek status TT pejabat dari data terbaru
      try {
        const pjList = await API.get('pejabat').catch(() => []);
        const kasubag = pjList.find(p => p.jabatan === 'Kepala Sub Bagian Perencanaan');
        const ttOk = !!(kasubag?.tanda_tangan);
        _updateVerifTTBanner(ttOk, 'Admin');
        // Reload modal verifikasi sekali (bukan rekursif) setelah TT Admin tersimpan
        if (ttOk && window.verifCurrentUsulan) {
          window._verifSilentReload = true;
          openVerifikasi(window.verifCurrentUsulan).catch(() => {}).finally(() => { window._verifSilentReload = false; });
        }
      } catch(_) {}
    }
  } catch(e) { toast(e.message, 'error'); }
  finally { setLoading(false); }
}


async function saveSettings() {
  const awal = parseInt(document.getElementById('settingTahunAwal').value);
  const akhir = parseInt(document.getElementById('settingTahunAkhir').value);
  const status = document.getElementById('settingStatus');
  if (!awal || !akhir) { status.textContent = 'Tahun awal dan akhir wajib diisi'; return; }
  if (awal > akhir) { status.textContent = 'Tahun awal tidak boleh lebih besar dari tahun akhir'; return; }
  setLoading(true);
  try {
    await API.post('settings', { tahun_awal: awal, tahun_akhir: akhir });

    // Update global tahun range
    window._appTahunAwal = awal;
    window._appTahunAkhir = akhir;

    // Refresh dropdown filterTahunPeriode dengan rentang tahun baru
    const filterEl = document.getElementById('filterTahunPeriode');
    if (filterEl) {
      const currentVal = parseInt(filterEl.value);
      // Pilih tahun yang sebelumnya dipilih jika masih dalam rentang, jika tidak gunakan tahun awal
      const newSelected = (currentVal >= awal && currentVal <= akhir) ? currentVal : awal;
      filterEl.innerHTML = yearOptions(newSelected);
      loadPeriodeGrid();
    }

    // Refresh dropdown pTahun di modal tambah periode (jika modal sedang terbuka)
    const pTahunEl = document.getElementById('pTahun');
    if (pTahunEl) {
      const pVal = parseInt(pTahunEl.value);
      const pSelected = (pVal >= awal && pVal <= akhir) ? pVal : awal;
      pTahunEl.innerHTML = yearOptions(pSelected);
    }

    toast('Pengaturan berhasil disimpan!', 'success');
    status.textContent = '';
  } catch(e) { status.textContent = e.message; }
  finally { setLoading(false); }
}


// ============== ADMIN - USERS ==============
let allUsers = [], allPKMList = [], allIndList = [];

async function renderUsers(el) {
  const _mc = el || document.getElementById('mainContent');
  _mc.innerHTML = `
    <div class="page-header">
      <h1><span class="material-icons">group</span>Kelola User</h1>
      <button class="btn btn-primary" onclick="openUserModal()"><span class="material-icons">person_add</span>Tambah User</button>
    </div>
    <div class="card">
      <div class="card-body" style="padding:12px 16px">
        <div class="search-row">
          <div class="search-input-wrap"><span class="material-icons search-icon">search</span><input class="search-input" id="searchUser" placeholder="Cari email atau nama..." oninput="filterUsers()" autocomplete="off"></div>
          <select class="form-control" id="filterRole" onchange="filterUsers()" style="width:160px">
            <option value="">Semua Role</option>
            <option>Operator</option><option>Kepala Puskesmas</option>
            <option>Pengelola Program</option>
          </select>
          <select class="form-control" id="filterPKM" onchange="filterUsers()" style="width:200px">
            <option value="">Semua Puskesmas</option>
          </select>
        </div>
      </div>
      <div style="padding:0" id="usersTable"></div>
    </div>
    <!-- USER MODAL -->
    <div class="modal" id="userModal">
      <div class="modal-card">
        <div class="modal-header"><span class="material-icons">person_add</span><h3 id="userModalTitle">Tambah User</h3>
          <button class="btn-icon" onclick="closeModal('userModal')"><span class="material-icons">close</span></button></div>
        <div class="modal-body" style="padding:24px;overflow:hidden;display:flex;flex-direction:column">
          <div id="userModalGrid" style="display:grid;grid-template-columns:1fr;gap:20px;flex:1;min-height:0">

            <!-- KOLOM KIRI: Informasi User -->
            <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:12px;padding:20px;overflow-y:auto">
              <div style="font-size:13px;font-weight:700;color:var(--primary);margin-bottom:16px;display:flex;align-items:center;gap:6px">
                <span class="material-icons" style="font-size:16px">person</span> Informasi User
              </div>
              <div class="form-group"><label>Email *</label>
                <input class="form-control" id="uEmail" type="email" placeholder="user@example.com" oninput="validateEmailInput(this)">
                <div id="emailValidMsg" style="font-size:11.5px;margin-top:4px;display:none"></div>
              </div>
              <div class="form-group"><label>Nama *</label><input class="form-control" id="uNama" placeholder="Nama Lengkap"></div>
              <div class="form-group"><label>NIP</label><input class="form-control" id="uNIP" placeholder="Nomor Induk Pegawai (opsional)" maxlength="30"></div>
              <div class="form-group"><label>Role *</label>
                <select class="form-control" id="uRole" onchange="checkUserRole()">
                  <option>Operator</option><option>Kepala Puskesmas</option>
                  <option>Pengelola Program</option>
                </select>
              </div>
              <div id="pkmContainer" style="display:none" class="form-group"><label>Puskesmas</label>
                <select class="form-control" id="uPKM"><option value="">Pilih Puskesmas</option></select>
              </div>
              <div class="form-group"><label>Status</label>
                <select class="form-control" id="uAktif"><option value="true">Aktif</option><option value="false">Non-aktif</option></select>
              </div>
            </div>

            <!-- KOLOM KANAN: Jabatan + Indikator (flex column, bagi rata) -->
            <div id="ppRightCol" style="display:none;flex-direction:column;gap:20px;min-height:0;overflow:hidden">

              <!-- Panel Jabatan: flex:1 = setengah tinggi -->
              <div id="jabatanContainer" style="flex:1;min-height:0;background:var(--surface);border:1.5px solid var(--border);border-radius:12px;padding:20px;display:flex;flex-direction:column">
                <div style="font-size:13px;font-weight:700;color:var(--primary);margin-bottom:12px;display:flex;align-items:center;gap:6px;flex-shrink:0">
                  <span class="material-icons" style="font-size:16px">badge</span>
                  Jabatan / Bidang Tanggung Jawab
                  <span style="font-size:11px;font-weight:400;color:var(--text-light)">(bisa pilih lebih dari satu)</span>
                </div>
                <div id="jabatanCheckboxList" style="flex:1;min-height:0;overflow-y:auto;border:1.5px solid var(--border);border-radius:8px;padding:8px;background:white;display:grid;grid-template-columns:1fr 1fr;align-content:start;gap:4px">
                  ${loadingInline('Memuat daftar jabatan...')}
                </div>
              </div>

              <!-- Panel Indikator: flex:1 = setengah tinggi -->
              <div id="indContainer" style="flex:1;min-height:0;background:var(--surface);border:1.5px solid var(--border);border-radius:12px;padding:20px;display:flex;flex-direction:column">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-shrink:0">
                  <div style="font-size:13px;font-weight:700;color:var(--primary);display:flex;align-items:center;gap:6px">
                    <span class="material-icons" style="font-size:16px">fact_check</span> Indikator Akses
                  </div>
                  <div style="display:flex;gap:6px">
                    <button type="button" class="btn btn-secondary btn-sm" onclick="checkAllIndikator(true)">Pilih Semua</button>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="checkAllIndikator(false)">Hapus Semua</button>
                  </div>
                </div>
                <div id="indCheckboxList" style="flex:1;min-height:0;overflow-y:auto;border:1.5px solid var(--border);border-radius:8px;padding:8px;background:white;display:grid;grid-template-columns:1fr 1fr;align-content:start;gap:4px"></div>
              </div>

            </div>

          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal('userModal')">Batal</button>
          <button class="btn btn-primary" onclick="saveUser()"><span class="material-icons">save</span>Simpan</button>
        </div>
      </div>
    </div>`;

  // Load data
  try {
    const [_rawU, _rawP, _rawI] = await Promise.all([API.getUsers(), API.getPKM(), API.getIndikator()]);
    allUsers = _rawU.filter(u => u.role !== 'Admin' && u.role !== 'Super Admin');
    allPKMList = _rawP; allIndList = _rawI;
    window.allIndList = allIndList;
    renderUsersTable(allUsers);

    // Fill PKM dropdown (modal tambah user)
    const pkmSel = document.getElementById('uPKM');
    allPKMList.forEach(p => pkmSel.innerHTML += `<option value="${p.kode}">${p.nama}</option>`);

    // Fill PKM filter dropdown (filter tabel user)
    const filterPKMSel = document.getElementById('filterPKM');
    if (filterPKMSel) {
      // Hanya tampilkan PKM yang ada di daftar user (bukan semua master PKM)
      const pkmDipakai = new Map();
      allUsers.forEach(u => { if (u.kodePKM && u.namaPKM) pkmDipakai.set(u.kodePKM, u.namaPKM); });
      const pkmSorted = [...pkmDipakai.entries()].sort((a,b) => a[1].localeCompare(b[1]));
      filterPKMSel.innerHTML = '<option value="">Semua Puskesmas</option>'
        + pkmSorted.map(([kode, nama]) => `<option value="${kode}">${nama}</option>`).join('');
    }
  } catch (e) { if (!window._verifSilentReload) toast(e.message, 'error'); }
}

let _currentFilteredUsers = null; // menyimpan hasil filter aktif untuk pagination

function filterUsers() {
  const q = document.getElementById('searchUser').value.toLowerCase();
  const role = document.getElementById('filterRole').value;
  const pkm = document.getElementById('filterPKM')?.value || '';
  const filtered = allUsers.filter(u =>
    u.role !== 'Admin' && u.role !== 'Super Admin' &&
    (!q || u.email.toLowerCase().includes(q) || u.nama.toLowerCase().includes(q)) &&
    (!role || u.role === role) &&
    (!pkm || u.kodePKM === pkm)
  );
  _usersPage = 1;
  _currentFilteredUsers = filtered;
  renderUsersTable(filtered);
}

let _usersPage = 1;
function renderUsersTable(users, page) {
  const el = document.getElementById('usersTable');
  if (!el) return;
  if (page) _usersPage = page;
  // Simpan ke state filter jika dipanggil langsung (bukan dari pagination)
  if (users !== undefined) _currentFilteredUsers = users;
  const filteredUsers = (_currentFilteredUsers || users || allUsers).filter(u => u.role !== 'Super Admin' && u.role !== 'Admin' && u.email !== 'admin@vispm.com');
  const { items, page: p, totalPages, total } = paginateData(filteredUsers, _usersPage);
  const rowsHtml = items.map(u => `<tr>
      <td style="font-size:12px">${u.email}</td>
      <td>${u.nama}</td>
      <td style="font-size:11px;color:var(--text-light)">${u.nip || '-'}</td>
      <td><span class="badge badge-info">${u.role}</span></td>
      <td>${u.namaPKM || u.kodePKM || '-'}</td>
      <td style="font-size:12px">${u.role === 'Pengelola Program' ? (u.jabatan ? u.jabatan.split('|').map(j=>'<div style="font-weight:600;color:var(--primary);font-size:11px;white-space:nowrap">'+j.trim()+'</div>').join('') : '') + '<div style="color:var(--text-light);font-size:11px">'+(u.indikatorAkses || '')+'</div>' : ''}</td>
      <td>${u.aktif ? '<span class="badge badge-success">Aktif</span>' : '<span class="badge badge-default">Non-aktif</span>'}</td>
      <td style="display:flex;gap:4px">
        <button class="btn-icon edit" onclick="editUser('${u.email}')"><span class="material-icons">edit</span></button>
        <button class="btn-icon" title="Reset Password" style="color:#0d9488" onclick="resetUserPassword('${u.email}','${u.nama}')"><span class="material-icons">lock_reset</span></button>
        ${['Kepala Puskesmas','Pengelola Program'].includes(u.role) ? (()=>{ const _hasTT = !!(u.tandaTangan && (u.tandaTangan.startsWith('data:image') || u.tandaTangan.startsWith('http'))); return `<span title="${_hasTT ? 'Lihat Tanda Tangan' : 'Tanda tangan belum diupload'}" style="display:inline-flex;cursor:${_hasTT ? 'pointer' : 'not-allowed'}"><button class="btn-icon" style="color:${_hasTT ? '#7c3aed' : '#cbd5e1'};opacity:${_hasTT ? '1' : '0.4'};pointer-events:${_hasTT ? 'auto' : 'none'}" ${_hasTT ? `onclick="previewTandaTanganUser('${u.email}','${u.nama.replace(/'/g,"\\'").replace(/"/g,'&quot;')}','${u.role}')"` : 'disabled'}><span class="material-icons">draw</span></button></span>`; })() : ''}
        <button class="btn-icon del" onclick="deleteUser('${u.email}')"><span class="material-icons">delete</span></button>
      </td>
    </tr>`).join('');
  el.innerHTML = '<div class="table-container"><table>'
    + '<thead><tr><th>Email</th><th>Nama</th><th>NIP</th><th>Role</th><th>Puskesmas</th><th>Jabatan/Indikator</th><th>Status</th><th>Aksi</th></tr></thead>'
    + '<tbody>' + rowsHtml + '</tbody></table></div>'
    + renderPagination('usersTable', total, p, totalPages, pg => { _usersPage = pg; renderUsersTable(); });
}


// ============== PREVIEW TANDA TANGAN USER ==============
function previewTandaTanganUser(email, nama, role) {
  const user = (allUsers || []).find(u => u.email === email);
  const tt = user?.tandaTangan;
  let modal = document.getElementById('ttPreviewModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'ttPreviewModal';
    modal.className = 'modal';
    modal.style.zIndex = '3500';
    modal.addEventListener('click', function(e) { if (e.target === modal) closeModal('ttPreviewModal'); });
    document.body.appendChild(modal);
  }
  const hastt = !!(tt && (tt.startsWith('data:image') || tt.startsWith('http')));

  // Build bagian tanda tangan tanpa nested template literal
  let ttBodyHtml;
  if (hastt) {
    ttBodyHtml = '<div style="border:1.5px solid #e2e8f0;border-radius:10px;background:#f8fafc;padding:16px;text-align:center;min-height:80px">'
      + '<img id="ttPreviewImg" src="' + tt + '" style="max-width:100%;max-height:180px;object-fit:contain" onerror="document.getElementById(\'ttImgErr\').style.display=\'block\';this.style.display=\'none\'">'
      + '<div id="ttImgErr" style="display:none;color:#ef4444;font-size:13px;padding:8px"><span class="material-icons" style="font-size:18px;vertical-align:middle">broken_image</span> Gagal memuat gambar</div>'
      + '</div>'
      + '<div style="margin-top:10px;display:flex;align-items:center;gap:6px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:8px 12px">'
      + '<span class="material-icons" style="color:#16a34a;font-size:16px">check_circle</span>'
      + '<span style="font-size:12.5px;color:#15803d;font-weight:500">Tanda tangan tersedia dan siap digunakan di laporan PDF</span>'
      + '</div>';
  } else {
    ttBodyHtml = '<div style="border:2px dashed #e2e8f0;border-radius:10px;background:#f8fafc;padding:32px;text-align:center">'
      + '<span class="material-icons" style="font-size:40px;color:#cbd5e1;display:block;margin-bottom:8px">draw</span>'
      + '<div style="font-size:13px;color:#94a3b8;font-weight:500">Tanda tangan belum diupload</div>'
      + '<div style="font-size:12px;color:#b0bec5;margin-top:4px">User perlu login dan upload tanda tangan di halaman Profil</div>'
      + '</div>'
      + '<div style="margin-top:10px;display:flex;align-items:center;gap:6px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:8px 12px">'
      + '<span class="material-icons" style="color:#ea580c;font-size:16px">warning</span>'
      + '<span style="font-size:12.5px;color:#c2410c;font-weight:500">Tanda tangan tidak akan muncul di laporan PDF</span>'
      + '</div>';
  }

  modal.innerHTML = '<div class="modal-card" style="max-width:480px;width:100%">'
    + '<div class="modal-header">'
    + '<span class="material-icons" style="color:#7c3aed">draw</span>'
    + '<h3>Tanda Tangan</h3>'
    + '<button class="btn-icon" onclick="closeModal(\'ttPreviewModal\')"><span class="material-icons">close</span></button>'
    + '</div>'
    + '<div class="modal-body">'
    + '<div style="margin-bottom:14px"><div style="font-size:13px;color:var(--text-light);margin-bottom:2px">Nama</div><div style="font-weight:600;font-size:14px">' + nama + '</div></div>'
    + '<div style="margin-bottom:14px"><div style="font-size:13px;color:var(--text-light);margin-bottom:2px">Role</div><div><span class="badge badge-info">' + role + '</span></div></div>'
    + '<div><div style="font-size:13px;color:var(--text-light);margin-bottom:8px">Tanda Tangan</div>'
    + ttBodyHtml
    + '</div>'
    + '</div>'
    + '<div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal(\'ttPreviewModal\')">Tutup</button></div>'
    + '</div>';

  showModal('ttPreviewModal');
}

let _resetTargetEmail = '';
function resetUserPassword(email, nama) {
  _resetTargetEmail = email;
  document.getElementById('rpNama').textContent = nama;
  document.getElementById('rpEmail').textContent = email;
  document.getElementById('rpNew').value = '';
  document.getElementById('rpConfirm').value = '';
  document.getElementById('rpStatus').textContent = '';
  document.getElementById('rpNew').type = 'password';
  document.getElementById('rpPwIcon').textContent = 'visibility_off';
  showModal('resetPasswordModal');
  setTimeout(() => document.getElementById('rpNew').focus(), 100);
}

function toggleRpPw() {
  const inp = document.getElementById('rpNew');
  const icon = document.getElementById('rpPwIcon');
  inp.type = inp.type === 'password' ? 'text' : 'password';
  icon.textContent = inp.type === 'password' ? 'visibility_off' : 'visibility';
}

async function doResetPassword() {
  const newPassword = document.getElementById('rpNew').value;
  const confirm = document.getElementById('rpConfirm').value;
  const statusEl = document.getElementById('rpStatus');
  if (!newPassword || newPassword.length < 6) { statusEl.textContent = 'Password minimal 6 karakter'; return; }
  if (newPassword !== confirm) { statusEl.textContent = 'Konfirmasi password tidak cocok'; return; }
  setLoading(true);
  try {
    await API.post('auth', { action: 'reset-password', targetEmail: _resetTargetEmail, newPassword });
    closeModal('resetPasswordModal');
    toast(`Password berhasil direset!`, 'success');
  } catch(e) { statusEl.textContent = e.message; }
  finally { setLoading(false); }
}

function validateEmailInput(input) {
  const val = input.value.trim();
  const msgEl = document.getElementById('emailValidMsg');
  if (!msgEl) return;
  if (!val) { msgEl.style.display = 'none'; return; }
  const parts = val.split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1].includes('.')) {
    msgEl.innerHTML = '<span style="color:#ef4444">❌ Format email tidak valid. Contoh: nama@instansi.go.id</span>';
    msgEl.style.display = 'block';
  } else {
    msgEl.innerHTML = '<span style="color:#0d9488">✓ Format email valid</span>';
    msgEl.style.display = 'block';
  }
}

let _jabatanList = [];
async function loadJabatanDropdown(selectedList = []) {
  try {
    _jabatanList = await API.get('jabatan').catch(() => []);
    const container = document.getElementById('jabatanCheckboxList');
    if (!container) return;
    const aktif = _jabatanList.filter(j => j.aktif);
    if (!aktif.length) {
      container.innerHTML = '<div style="color:var(--text-light);font-size:12px;padding:4px">Belum ada jabatan. Tambah di bawah.</div>';
      return;
    }
    container.innerHTML = aktif.map(j => `
      <label style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;cursor:pointer;font-size:13px;transition:background 0.15s"
        onmouseover="this.style.background='var(--border-light)'" onmouseout="this.style.background=''">
        <input type="checkbox" value="${j.nama}" ${selectedList.includes(j.nama)?'checked':''}
          style="width:15px;height:15px;accent-color:var(--primary);cursor:pointer;flex-shrink:0">
        ${j.nama}
      </label>`).join('');
  } catch(e) { console.warn('Load jabatan gagal:', e.message); }
}

function getSelectedJabatan() {
  const boxes = document.querySelectorAll('#jabatanCheckboxList input[type=checkbox]:checked');
  return Array.from(boxes).map(b => b.value);
}

async function tambahJabatanBaru() {
  const newJab = document.getElementById('uJabatanBaru')?.value.trim();
  if (!newJab) return toast('Ketik nama jabatan baru terlebih dahulu', 'warning');
  try {
    await API.post('jabatan', { nama: newJab });
    toast(`Jabatan "${newJab}" ditambahkan`, 'success');
    document.getElementById('uJabatanBaru').value = '';
    const cur = getSelectedJabatan();
    await loadJabatanDropdown([...cur, newJab]);
  } catch(e) { toast(e.message, 'error'); }
}

function checkUserRole() {
  const role = document.getElementById('uRole').value;
  const isProgram = role === 'Pengelola Program';

  // Toggle fullscreen: Pengelola Program → fullscreen, lainnya → modal biasa
  const userModal = document.getElementById('userModal');
  if (userModal) {
    const isOpen = userModal.classList.contains('show');
    userModal.className = isProgram ? 'modal fullscreen' : 'modal';
    if (isOpen) userModal.classList.add('show');
  }

  document.getElementById('pkmContainer').style.display = (role === 'Operator' || role === 'Kepala Puskesmas') ? 'block' : 'none';

  // Toggle grid: 1 kolom (default) atau 2 kolom (PP)
  const grid = document.getElementById('userModalGrid');
  if (grid) grid.style.gridTemplateColumns = isProgram ? '320px 1fr' : '1fr';

  // Tampilkan/sembunyikan kolom kanan (jabatan + indikator) sekaligus
  const rightCol = document.getElementById('ppRightCol');
  if (rightCol) rightCol.style.display = isProgram ? 'flex' : 'none';

  if (isProgram) { populateIndCheckbox([]); loadJabatanDropdown([]); }
}

function populateIndCheckbox(selectedNos = []) {
  const container = document.getElementById('indCheckboxList');
  if (!container || !allIndList.length) return;
  container.innerHTML = allIndList.filter(i => i.aktif).map(i => `
    <label style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;cursor:pointer;font-size:13px;transition:background 0.15s"
      onmouseover="this.style.background='var(--border-light)'" onmouseout="this.style.background=''">
      <input type="checkbox" value="${i.no}" ${selectedNos.includes(parseInt(i.no)) ? 'checked' : ''}
        style="width:15px;height:15px;accent-color:var(--primary);cursor:pointer;flex-shrink:0">
      <span><strong style="font-size:12px">${i.no}.</strong> ${i.nama}</span>
    </label>`).join('');
}

function checkAllIndikator(check) {
  document.querySelectorAll('#indCheckboxList input[type="checkbox"]').forEach(cb => cb.checked = check);
}

function getIndikatorAksesFromCheckbox() {
  return [...document.querySelectorAll('#indCheckboxList input[type="checkbox"]:checked')]
    .map(cb => parseInt(cb.value)).sort((a,b) => a-b).join(',');
}

function parseIndikatorAksesString(str) {
  if (!str) return [];
  let result = [];
  str.replace(/\s/g,'').split(',').forEach(part => {
    if (part.includes('-')) {
      const [s,e] = part.split('-').map(Number);
      for (let i=s;i<=e;i++) result.push(i);
    } else { const n=Number(part); if(!isNaN(n)&&n>0) result.push(n); }
  });
  return [...new Set(result)];
}

function openUserModal(editEmail = null) {
  document.getElementById('userModalTitle').textContent = editEmail ? 'Edit User' : 'Tambah User';
  // Reset SEMUA field form terlebih dahulu
  document.getElementById('uEmail').value = '';
  document.getElementById('uEmail').readOnly = !!editEmail;
  document.getElementById('uNama').value = '';
  document.getElementById('uRole').value = 'Operator';
  document.getElementById('uPKM').value = '';
  document.getElementById('uAktif').value = 'true';
  // Reset NIP
  const nipResetEl = document.getElementById('uNIP');
  if (nipResetEl) nipResetEl.value = '';
  // Reset jabatan checkboxes — hapus semua centang
  const jabatanBox = document.getElementById('jabatanCheckboxList');
  if (jabatanBox) {
    jabatanBox.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = false);
  }
  // Reset indikator checkboxes
  const indBox = document.getElementById('indCheckboxList');
  if (indBox) {
    indBox.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = false);
  }
  checkUserRole();

  if (editEmail) {
    const user = allUsers.find(u => u.email === editEmail);
    if (user) {
      document.getElementById('uEmail').value = user.email;
      document.getElementById('uNama').value = user.nama;
      document.getElementById('uRole').value = user.role;
      document.getElementById('uPKM').value = user.kodePKM || '';
      document.getElementById('uAktif').value = user.aktif ? 'true' : 'false';
      checkUserRole();
      // Isi NIP
      const nipEl = document.getElementById('uNIP');
      if (nipEl) nipEl.value = user.nip || '';
      if (user.role === 'Pengelola Program') {
        populateIndCheckbox(parseIndikatorAksesString(user.indikatorAkses || ''));
        // Load jabatan checkboxes dengan nilai yang sudah tersimpan
        const savedJabatan = (user.jabatan || '').split('|').map(s=>s.trim()).filter(Boolean);
        loadJabatanDropdown(savedJabatan);
      }
    }
    document.getElementById('userModal').dataset.editEmail = editEmail;
  } else {
    delete document.getElementById('userModal').dataset.editEmail;
  }

  showModal('userModal');
}

function editUser(email) { openUserModal(email); }

async function saveUser() {
  const email = document.getElementById('uEmail').value.trim();
  const nama = document.getElementById('uNama').value.trim();
  const role = document.getElementById('uRole').value;
  const kodePKM = document.getElementById('uPKM').value;
  const indikatorAkses = role === 'Pengelola Program' ? getIndikatorAksesFromCheckbox() : '';
  const jabatan = role === 'Pengelola Program' ? getSelectedJabatan().join('|') : '';
  const nip = document.getElementById('uNIP')?.value.trim() || '';
  const aktif = document.getElementById('uAktif').value === 'true';

  if (!email || !nama || !role) return toast('Email, nama, dan role harus diisi', 'error');
  if (!email.includes('@') || !email.includes('.')) return toast('Format email tidak valid. Harus mengandung @ dan domain (contoh: user@email.com)', 'error');
  if (role === 'Pengelola Program' && !jabatan) return toast('Pilih minimal satu jabatan untuk Pengelola Program', 'error');

  const editEmail = document.getElementById('userModal').dataset.editEmail;
  setLoading(true);
  try {
    if (editEmail) {
      await API.updateUser({ email, nama, nip, role, kodePKM, indikatorAkses, jabatan, aktif });
    } else {
      await API.saveUser({ email, nama, nip, role, kodePKM, indikatorAkses, jabatan });
    }
    toast(`User berhasil ${editEmail ? 'diupdate' : 'ditambahkan'}`);
    closeModal('userModal');
    allUsers = (await API.getUsers()).filter(u => u.role !== 'Admin' && u.role !== 'Super Admin');
    renderUsersTable(allUsers);
  } catch (e) { toast(e.message, 'error'); }
  finally { setLoading(false); }
}

async function deleteUser(email) {
  showConfirm({ title: 'Hapus User', message: `Hapus user ${email}?`,
    onConfirm: async () => {
      try {
        await API.deleteUser(email);
        toast('User berhasil dihapus');
        allUsers = (await API.getUsers()).filter(u => u.role !== 'Admin' && u.role !== 'Super Admin');
        filterUsers(); // re-apply filter yang aktif, bukan render semua
      } catch (e) { toast(e.message, 'error'); }
    }
  });
}



// ============== KELOLA JABATAN ==============
let _jabatanAllList = [];

async function renderJabatan(el) {
  const _mc = el || document.getElementById('mainContent');
  _mc.innerHTML = `
    <div class="page-header">
      <h1><span class="material-icons">badge</span>Kelola Jabatan Pengelola Program</h1>
      <button class="btn btn-primary" onclick="openJabatanModal()">
        <span class="material-icons">add</span>Tambah Jabatan
      </button>
    </div>
    <div class="card">
      <div class="card-body" style="padding:12px 16px">
        <div class="search-row">
          <div class="search-input-wrap"><span class="material-icons search-icon">search</span><input class="search-input" id="searchJabatan" placeholder="Cari kode atau nama..." oninput="filterJabatan()"></div>
          <select class="form-control" id="filterJabatanStatus" onchange="filterJabatan()" style="width:140px">
            <option value="">Semua Status</option><option value="aktif">Aktif</option><option value="nonaktif">Non-aktif</option>
          </select>
        </div>
      </div>
      <div class="card-body" style="padding:0" id="jabatanTable">
        ${loadingBlock('Memuat...')}
      </div>
    </div>

    <!-- Modal Tambah/Edit Jabatan -->
    <div class="modal" id="jabatanModal">
      <div class="modal-card" style="max-width:420px">
        <div class="modal-header">
          <span class="material-icons">badge</span>
          <span id="jabatanModalTitle">Tambah Jabatan</span>
          <button class="btn-icon" onclick="closeModal('jabatanModal')"><span class="material-icons">close</span></button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Nama Jabatan</label>
            <input class="form-control" id="jNama" placeholder="Contoh: Pengelola Program Gizi Kabupaten">
          </div>
          <div class="form-group">
            <label>Status</label>
            <select class="form-control" id="jAktif">
              <option value="true">Aktif</option>
              <option value="false">Non-aktif</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal('jabatanModal')">Batal</button>
          <button class="btn btn-primary" onclick="saveJabatan()"><span class="material-icons">save</span>Simpan</button>
        </div>
      </div>
    </div>`;

  await loadJabatanTable();
}

function filterJabatan(resetPage = true) {
  const q = (document.getElementById('searchJabatan')?.value || '').toLowerCase();
  const fa = document.getElementById('filterJabatanStatus')?.value || '';
  const filtered = _jabatanAllList.filter(j =>
    (!q || j.nama.toLowerCase().includes(q)) &&
    (!fa || (fa === 'aktif' ? j.aktif : !j.aktif))
  );
  if (resetPage) _jabPage = 1;
  _renderJabatanTable(filtered);
}

let _jabPage = 1;
async function loadJabatanTable(page) {
  if (page) _jabPage = page;
  try {
    _jabatanAllList = await API.get('jabatan').catch(() => []);
    filterJabatan();
  } catch(e) { toast(e.message, 'error'); }
}

function _renderJabatanTable(list, page) {
  if (page) _jabPage = page;
  const el = document.getElementById('jabatanTable');
  if (!el) return;

  if (!list.length) {
    el.innerHTML = `<div class="empty-state" style="padding:32px"><span class="material-icons">badge</span><p>Belum ada jabatan yang sesuai filter.</p></div>`;
    return;
  }

  const { items, page: p, totalPages, total } = _paginateCustom(list, _jabPage, _PAGE_SIZE_JAB);
  const rowsHtml = items.map((j, i) => `<tr>
      <td>${(p-1)*_PAGE_SIZE_JAB + i + 1}</td>
      <td style="font-weight:500">${j.nama}</td>
      <td>${j.aktif
        ? '<span style="background:#d1fae5;color:#065f46;padding:2px 10px;border-radius:20px;font-size:12px;font-weight:600">Aktif</span>'
        : '<span style="background:#f1f5f9;color:#94a3b8;padding:2px 10px;border-radius:20px;font-size:12px;font-weight:600">Non-aktif</span>'}</td>
      <td>
        <button class="btn-icon edit" onclick="openJabatanModal(${j.id})" title="Edit"><span class="material-icons">edit</span></button>
        <button class="btn-icon del" onclick="deleteJabatan(${j.id}, '${j.nama.replace(/'/g, "\\'")}')" title="Hapus"><span class="material-icons">delete</span></button>
      </td>
    </tr>`).join('');
  el.innerHTML = '<div class="table-container"><table>'
    + '<thead><tr><th>No</th><th>Nama Jabatan</th><th>Status</th><th>Aksi</th></tr></thead>'
    + '<tbody>' + rowsHtml + '</tbody></table></div>'
    + renderPagination('jabatanTable', total, p, totalPages, 'pg => { _jabPage=pg; filterJabatan(false); }');
}

let _editJabatanId = null;

function openJabatanModal(id = null) {
  _editJabatanId = id;
  const jabatan = id ? _jabatanAllList.find(j => j.id === id) : null;
  document.getElementById('jabatanModalTitle').textContent = id ? 'Edit Jabatan' : 'Tambah Jabatan';
  document.getElementById('jNama').value = jabatan ? jabatan.nama : '';
  document.getElementById('jAktif').value = jabatan ? String(jabatan.aktif) : 'true';
  showModal('jabatanModal');
  setTimeout(() => document.getElementById('jNama').focus(), 100);
}

async function saveJabatan() {
  const nama = document.getElementById('jNama').value.trim();
  const aktif = document.getElementById('jAktif').value === 'true';
  if (!nama) return toast('Nama jabatan wajib diisi', 'error');

  try {
    await API.post('jabatan', { nama, aktif, id: _editJabatanId });
    toast(`Jabatan "${nama}" berhasil ${_editJabatanId ? 'diperbarui' : 'ditambahkan'}`, 'success');
    closeModal('jabatanModal');
    await loadJabatanTable();
    // Refresh dropdown jabatan kalau sedang buka form user
    if (document.getElementById('jabatanCheckboxList')) {
      const cur = getSelectedJabatan();
      await loadJabatanDropdown(cur);
    }
  } catch(e) { toast(e.message, 'error'); }
}

async function deleteJabatan(id, nama) {
  showConfirm({
    title: 'Hapus Jabatan',
    message: `Hapus jabatan "<strong>${nama}</strong>"? Pastikan tidak ada user yang masih menggunakan jabatan ini.`,
    type: 'danger',
    onConfirm: async () => {
      try {
        await API.del(`jabatan?id=${id}`, {});
        toast(`Jabatan "${nama}" berhasil dihapus`, 'success');
        await loadJabatanTable();
      } catch(e) { toast(e.message, 'error'); }
    }
  });
}

// ============== ADMIN - PKM ==============
let allPKM = [];

async function renderPKM(el) {
  const _mc = el || document.getElementById('mainContent');
  _mc.innerHTML = `
    <div class="page-header">
      <h1><span class="material-icons">local_hospital</span>Kelola Puskesmas</h1>
      <button class="btn btn-primary" onclick="openPKMModal()"><span class="material-icons">add</span>Tambah Puskesmas</button>
    </div>
    <div class="card">
      <div class="card-body" style="padding:12px 16px">
        <div class="search-row">
          <div class="search-input-wrap"><span class="material-icons search-icon">search</span><input class="search-input" id="searchPKM" placeholder="Cari kode atau nama..." oninput="filterPKM()"></div>
          <select class="form-control" id="filterPKMAktif" onchange="filterPKM()" style="width:140px">
            <option value="">Semua Status</option><option value="aktif">Aktif</option><option value="nonaktif">Non-aktif</option>
          </select>
        </div>
      </div>
      <div id="pkmTable" style="padding:0"></div>
    </div>
    <div class="modal" id="pkmModal">
      <div class="modal-card">
        <div class="modal-header"><span class="material-icons">local_hospital</span><h3 id="pkmModalTitle">Tambah Puskesmas</h3>
          <button class="btn-icon" onclick="closeModal('pkmModal')"><span class="material-icons">close</span></button></div>
        <div class="modal-body">
          <div class="form-group"><label>Kode *</label><input class="form-control" id="pKode" placeholder="Maks 10 karakter" maxlength="10"></div>
          <div class="form-group"><label>Nama Puskesmas *</label><input class="form-control" id="pNama" placeholder="Nama lengkap puskesmas"></div>
          <div class="form-group"><label>Indeks Beban Kerja</label><input class="form-control" id="pIndeks" type="number" step="0.0001" min="0" placeholder="Contoh: 1.5"></div>
          <div class="form-group"><label>Indeks Kesulitan Wilayah</label><input class="form-control" id="pIndeksKesulitan" type="number" step="0.0001" min="0" placeholder="Contoh: 1.2"></div>
          <div class="form-group"><label>Status</label><select class="form-control" id="pAktif"><option value="true">Aktif</option><option value="false">Non-aktif</option></select></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal('pkmModal')">Batal</button>
          <button class="btn btn-primary" onclick="savePKM()"><span class="material-icons">save</span>Simpan</button>
        </div>
      </div>
    </div>`;

  try {
    allPKM = await API.getPKM();
    renderPKMTable(allPKM);
  } catch (e) { if (!window._verifSilentReload) toast(e.message, 'error'); }
}

function filterPKM() {
  const q = document.getElementById('searchPKM').value.toLowerCase();
  const fa = document.getElementById('filterPKMAktif').value;
  const filtered = allPKM.filter(p =>
    (!q || p.kode.toLowerCase().includes(q) || p.nama.toLowerCase().includes(q)) &&
    (!fa || (fa === 'aktif' ? p.aktif : !p.aktif))
  );
  renderPKMTable(filtered);
}

let _pkmPage = 1;
function renderPKMTable(pkm, page) {
  if (page) _pkmPage = page;
  const el = document.getElementById('pkmTable');
  if (!el) return;
  const { items, page: p, totalPages, total } = _paginateCustom(pkm, _pkmPage, _PAGE_SIZE_PKM);
  const rowsHtml = items.map(p => {
    const kodeQ = p.kode.replace(/'/g, "\'");
    return '<tr>'
      + '<td><span style="font-weight:700">'+p.kode+'</span></td>'
      + '<td>'+p.nama+'</td>'
      + '<td class="rasio-cell">'+parseFloat(p.indeks||0).toFixed(2)+'</td>'
      + '<td class="rasio-cell">'+parseFloat(p.indeksKesulitan||0).toFixed(2)+'</td>'
      + '<td>'+(p.aktif ? '<span class="badge badge-success">Aktif</span>' : '<span class="badge badge-default">Non-aktif</span>')+'</td>'
      + '<td style="display:flex;gap:4px">'
      + `<button class="btn-icon edit" onclick="editPKM('${kodeQ}')"><span class="material-icons">edit</span></button>`
      + `<button class="btn-icon del" onclick="deletePKM('${kodeQ}')"><span class="material-icons">delete</span></button>`
      + '</td></tr>';
  }).join('');
  el.innerHTML = '<div class="table-container"><table>'
    + '<thead><tr><th>Kode</th><th>Nama Puskesmas</th><th>Indeks Beban Kerja</th><th>Indeks Kesulitan Wilayah</th><th>Status</th><th>Aksi</th></tr></thead>'
    + '<tbody>' + rowsHtml + '</tbody></table></div>'
    + renderPagination('pkmTable', total, p, totalPages, 'pg => { _pkmPage=pg; renderPKMTable(allPKM); }');
}

function openPKMModal(editKode = null) {
  document.getElementById('pkmModalTitle').textContent = editKode ? 'Edit Puskesmas' : 'Tambah Puskesmas';
  document.getElementById('pKode').value = '';
  document.getElementById('pKode').readOnly = !!editKode;
  document.getElementById('pNama').value = '';
  document.getElementById('pIndeks').value = '';
  document.getElementById('pAktif').value = 'true';
  if (editKode) {
    const p = allPKM.find(x => x.kode === editKode);
    if (p) {
      document.getElementById('pKode').value = p.kode;
      document.getElementById('pNama').value = p.nama;
      document.getElementById('pIndeks').value = p.indeks;
      document.getElementById('pIndeksKesulitan').value = p.indeksKesulitan || '';
      document.getElementById('pAktif').value = p.aktif ? 'true' : 'false';
    }
    document.getElementById('pkmModal').dataset.editKode = editKode;
  } else { delete document.getElementById('pkmModal').dataset.editKode; }
  showModal('pkmModal');
}

function editPKM(kode) { openPKMModal(kode); }

async function savePKM() {
  const kode = document.getElementById('pKode').value.trim();
  const nama = document.getElementById('pNama').value.trim();
  const indeks = document.getElementById('pIndeks').value;
  const indeksKesulitan = document.getElementById('pIndeksKesulitan').value;
  const aktif = document.getElementById('pAktif').value === 'true';
  if (!kode || !nama) return toast('Kode dan nama harus diisi', 'error');
  const editKode = document.getElementById('pkmModal').dataset.editKode;
  setLoading(true);
  try {
    if (editKode) await API.updatePKM({ kode, nama, indeks, indeksKesulitan, aktif });
    else await API.savePKM({ kode, nama, indeks, indeksKesulitan, aktif });
    toast(`Puskesmas berhasil ${editKode ? 'diupdate' : 'ditambahkan'}`);
    closeModal('pkmModal');
    allPKM = await API.getPKM();
    renderPKMTable(allPKM);
  } catch (e) { toast(e.message, 'error'); }
  finally { setLoading(false); }
}

async function deletePKM(kode) {
  showConfirm({ title: 'Hapus Puskesmas', message: `Hapus puskesmas ${kode}?`,
    onConfirm: async () => {
      try {
        await API.deletePKM(kode);
        toast('Puskesmas berhasil dihapus');
        allPKM = await API.getPKM();
        renderPKMTable(allPKM);
      } catch (e) { toast(e.message, 'error'); }
    }
  });
}

// ============== ADMIN - TARGET TAHUNAN ==============
let _ttPKM = [], _ttIndikator = [], _ttCurrentKode = null, _ttCurrentTahun = null;

async function renderTargetTahunan(el) {
  const _mc = el || document.getElementById('mainContent');
  const tahunOpts = yearOptions(CURRENT_YEAR);
  _mc.innerHTML = `
    <div class="page-header">
      <h1><span class="material-icons">track_changes</span>Target Tahunan per Puskesmas</h1>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="card-body" style="padding:12px 16px">
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
          <div style="display:flex;align-items:center;gap:8px">
            <label style="font-size:13px;font-weight:600;color:var(--text-main)">Tahun</label>
            <select class="form-control" id="ttTahun" onchange="loadTargetTahunan()" style="width:100px">${tahunOpts}</select>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex:1">
            <label style="font-size:13px;font-weight:600;color:var(--text-main)">Puskesmas</label>
            <select class="form-control" id="ttPKM" onchange="loadTargetTahunan()" style="min-width:200px">
              <option value="">-- Pilih Puskesmas --</option>
            </select>
          </div>
        </div>
      </div>
    </div>
    <div id="ttContent">
      <div class="empty-state" style="padding:48px">
        <span class="material-icons" style="font-size:48px;color:#cbd5e1">track_changes</span>
        <p style="color:var(--text-light)">Pilih tahun dan puskesmas untuk mengelola target tahunan</p>
      </div>
    </div>`;

  try {
    _ttPKM = await API.getPKM();
    const sel = document.getElementById('ttPKM');
    _ttPKM.filter(p=>p.aktif).forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.kode; opt.textContent = p.nama;
      sel.appendChild(opt);
    });
  } catch(e) { toast(e.message, 'error'); }
}

async function loadTargetTahunan() {
  const kode = document.getElementById('ttPKM')?.value;
  const tahun = document.getElementById('ttTahun')?.value;
  if (!kode || !tahun) return;
  _ttCurrentKode = kode; _ttCurrentTahun = tahun;

  const el = document.getElementById('ttContent');
  el.innerHTML = loadingBlock('Memuat...');
  try {
    _ttIndikator = await API.get(`target-tahunan`, { kode_pkm: kode, tahun });

    const namaPKM = _ttPKM.find(p=>p.kode===kode)?.nama || kode;
    const hasData = _ttIndikator.some(i=>i.sasaran>0);

    el.innerHTML = `
      <div class="card">
        <div class="card-body" style="padding:12px 16px;display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-weight:700;font-size:14px">${namaPKM}</div>
            <div style="font-size:12px;color:var(--text-light)">Target Sasaran Tahun ${tahun}</div>
          </div>
          <div style="display:flex;gap:8px">
            ${hasData ? `<span style="font-size:12px;color:#0d9488;background:#f0fdf9;padding:4px 10px;border-radius:6px;border:1px solid #0d9488">✓ Data tersimpan</span>` : `<span style="font-size:12px;color:#f59e0b;background:#fffbeb;padding:4px 10px;border-radius:6px;border:1px solid #fcd34d">⚠ Belum ada data</span>`}
            <button class="btn btn-primary" onclick="saveTargetTahunan()"><span class="material-icons">save</span>Simpan Semua</button>
          </div>
        </div>
        <div class="table-container">
          <table>
            <thead><tr><th style="width:40px">No</th><th>Nama Indikator</th><th style="width:160px;text-align:center">Jumlah Sasaran (Satu Tahun)</th></tr></thead>
            <tbody>
              ${_ttIndikator.map(ind => `<tr>
                <td><span style="font-weight:700">${ind.noIndikator}</span></td>
                <td style="font-size:13px">${ind.namaIndikator}</td>
                <td style="text-align:center">
                  <input type="number" min="0"
                    class="form-control" id="tt-${ind.noIndikator}"
                    value="${ind.sasaran || ''}"
                    placeholder="0"
                    style="width:120px;text-align:center;margin:0 auto;font-family:">
                </td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  } catch(e) { toast(e.message, 'error'); }
}

async function saveTargetTahunan() {
  if (!_ttCurrentKode || !_ttCurrentTahun || !_ttIndikator.length) return;
  const targets = _ttIndikator.map(ind => ({
    noIndikator: ind.noIndikator,
    sasaran: parseInt(document.getElementById(`tt-${ind.noIndikator}`)?.value) || 0
  }));
  setLoading(true);
  try {
    await API.post('target-tahunan', { kodePKM: _ttCurrentKode, tahun: parseInt(_ttCurrentTahun), targets });
    toast(`Target tahun ${_ttCurrentTahun} berhasil disimpan ✓`, 'success');
    await loadTargetTahunan();
  } catch(e) { toast(e.message, 'error'); }
  finally { setLoading(false); }
}

// ============== ADMIN - INDIKATOR ==============
let allIndikator = [];

async function renderIndikator(el) {
  const _mc = el || document.getElementById('mainContent');
  _mc.innerHTML = `
    <div class="page-header">
      <h1><span class="material-icons">monitor_heart</span>Kelola Indikator</h1>
      <button class="btn btn-primary" onclick="openIndModal()"><span class="material-icons">add</span>Tambah Indikator</button>
    </div>
    <div class="card">
      <div class="card-body" style="padding:12px 16px;display:flex;justify-content:space-between;align-items:center">
        <div class="search-row" style="margin:0;flex:1">
          <div class="search-input-wrap"><span class="material-icons search-icon">search</span><input class="search-input" id="searchInd" placeholder="Cari nomor atau nama..." oninput="filterInd()"></div>
        </div>
        <div style="background:var(--info-light);padding:8px 14px;border-radius:8px;font-size:13px;margin-left:12px">
          Total Bobot Aktif: <strong id="totalBobot">0</strong>
        </div>
      </div>
      <div id="indTable" style="padding:0"></div>
    </div>
    <div class="modal" id="indModal">
      <div class="modal-card">
        <div class="modal-header"><span class="material-icons">monitor_heart</span><h3 id="indModalTitle">Tambah Indikator</h3>
          <button class="btn-icon" onclick="closeModal('indModal')"><span class="material-icons">close</span></button></div>
        <div class="modal-body">
          <div class="form-group"><label>No Indikator *</label><input class="form-control" id="iNo" type="number" min="1" placeholder="1, 2, 3..."></div>
          <div class="form-group"><label>Nama Indikator *</label><input class="form-control" id="iNama" placeholder="Nama lengkap indikator"></div>
          <div class="form-group"><label>Bobot</label><input class="form-control" id="iBobot" type="number" min="0" max="100" placeholder="0-100"></div>
          <div class="form-group"><label>Catatan <span style="font-size:11px;color:var(--text-light)">(tampil di laporan per indikator)</span></label>
            <textarea class="form-control" id="iCatatan" rows="3" placeholder="Contoh: Standar Pelayanan Ibu Bersalin merujuk pada Permenkes Nomor 6 Tahun 2024..."></textarea>
          </div>
          <div class="form-group"><label>Status</label><select class="form-control" id="iAktif"><option value="true">Aktif</option><option value="false">Non-aktif</option></select></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal('indModal')">Batal</button>
          <button class="btn btn-primary" onclick="saveInd()"><span class="material-icons">save</span>Simpan</button>
        </div>
      </div>
    </div>`;

  try {
    allIndikator = await API.getIndikator();
    renderIndTable(allIndikator);
  } catch (e) { if (!window._verifSilentReload) toast(e.message, 'error'); }
}

function filterInd() {
  const q = document.getElementById('searchInd').value.toLowerCase();
  _indPage = 1;
  renderIndTable(allIndikator.filter(i => !q || i.no.toString().includes(q) || i.nama.toLowerCase().includes(q)));
}

let _indPage = 1, _lastInds = [];
function renderIndTable(inds, page) {
  if (page) _indPage = page;
  const el = document.getElementById('indTable');
  if (!el) return;
  const totalBobot = allIndikator.filter(i => i.aktif).reduce((s, i) => s + (parseInt(i.bobot) || 0), 0);
  const tbEl = document.getElementById('totalBobot');
  if (tbEl) tbEl.textContent = totalBobot;
  const { items, page: p, totalPages, total } = _paginateCustom(inds, _indPage, _PAGE_SIZE_IND);
  const rowsHtml = items.map(i => `<tr>
      <td><span style="font-weight:700">${i.no}</span></td>
      <td>${i.nama}</td>
      <td style="text-align:center"><span style="font-family:">${i.bobot}</span></td>
      <td>${i.aktif ? '<span class="badge badge-success">Aktif</span>' : '<span class="badge badge-default">Non-aktif</span>'}</td>
      <td style="display:flex;gap:4px">
        <button class="btn-icon edit" onclick="editInd(${i.no})"><span class="material-icons">edit</span></button>
        <button class="btn-icon del" onclick="deleteInd(${i.no})"><span class="material-icons">delete</span></button>
      </td>
    </tr>`).join('');
  el.innerHTML = '<div class="table-container"><table>'
    + '<thead><tr><th>No</th><th>Nama Indikator</th><th>Bobot</th><th>Status</th><th>Aksi</th></tr></thead>'
    + '<tbody>' + rowsHtml + '</tbody></table></div>'
    + renderPagination('indTable', total, p, totalPages, 'pg => { _indPage=pg; renderIndTable(_lastInds); }');
  _lastInds = inds;
}

function openIndModal(editNo = null) {
  document.getElementById('indModalTitle').textContent = editNo ? 'Edit Indikator' : 'Tambah Indikator';
  document.getElementById('iNo').value = '';
  document.getElementById('iNo').readOnly = !!editNo;
  document.getElementById('iNama').value = '';
  document.getElementById('iBobot').value = '';
  document.getElementById('iCatatan').value = '';
  document.getElementById('iAktif').value = 'true';
  if (editNo) {
    const i = allIndikator.find(x => x.no == editNo);
    if (i) {
      document.getElementById('iNo').value = i.no;
      document.getElementById('iNama').value = i.nama;
      document.getElementById('iBobot').value = i.bobot;
      document.getElementById('iCatatan').value = i.catatan || '';
      document.getElementById('iAktif').value = i.aktif ? 'true' : 'false';
    }
    document.getElementById('indModal').dataset.editNo = editNo;
  } else { delete document.getElementById('indModal').dataset.editNo; }
  showModal('indModal');
}

function editInd(no) { openIndModal(no); }

async function saveInd() {
  const no = document.getElementById('iNo').value;
  const nama = document.getElementById('iNama').value.trim();
  const bobot = document.getElementById('iBobot').value;
  const catatan = document.getElementById('iCatatan').value.trim();
  const aktif = document.getElementById('iAktif').value === 'true';
  if (!no || !nama) return toast('Nomor dan nama harus diisi', 'error');
  const editNo = document.getElementById('indModal').dataset.editNo;
  setLoading(true);
  try {
    if (editNo) await API.updateIndikator({ no, nama, bobot, aktif, catatan });
    else await API.saveIndikator({ no, nama, bobot, aktif, catatan });
    toast(`Indikator berhasil ${editNo ? 'diupdate' : 'ditambahkan'}`);
    closeModal('indModal');
    allIndikator = await API.getIndikator();
    renderIndTable(allIndikator);
  } catch (e) { toast(e.message, 'error'); }
  finally { setLoading(false); }
}

async function deleteInd(no) {
  showConfirm({ title: 'Hapus Indikator', message: `Hapus indikator No.${no}?`,
    onConfirm: async () => {
      try {
        await API.deleteIndikator(no);
        toast('Indikator berhasil dihapus');
        allIndikator = await API.getIndikator();
        renderIndTable(allIndikator);
      } catch (e) { toast(e.message, 'error'); }
    }
  });
}

// ============== ADMIN - PERIODE ==============
let _editPeriodeTahun = null, _editPeriodeBulan = null;

async function renderPeriode(el) {
  const currentTahun = CURRENT_YEAR;
  const target = el || document.getElementById('mainContent');
  if (!target) return;

  // Load settings untuk tahun range
  let tahunAwal = window._appTahunAwal || currentTahun;
  let tahunAkhir = window._appTahunAkhir || (currentTahun + 3);
  try {
    const s = await API.get('settings');
    if (s && s.tahun_awal) {
      tahunAwal = parseInt(s.tahun_awal);
      tahunAkhir = parseInt(s.tahun_akhir);
      window._appTahunAwal = tahunAwal;
      window._appTahunAkhir = tahunAkhir;
    }
  } catch(e) {}

  target.innerHTML = `
    <!-- PENGATURAN TAHUN -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-header-bar">
        <span class="card-title"><span class="material-icons">settings</span>Pengaturan Rentang Tahun</span>
      </div>
      <div class="card-body">
        <p style="font-size:13px;color:#64748b;margin-bottom:14px">Atur rentang tahun yang tampil di seluruh sistem (filter laporan, input usulan, periode, dll).</p>
        <div style="display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap">
          <div class="form-group" style="margin:0">
            <label>Tahun Awal</label>
            <input class="form-control" type="number" id="settingTahunAwal" min="2020" max="2040" value="${tahunAwal}" style="width:120px">
          </div>
          <div class="form-group" style="margin:0">
            <label>Tahun Akhir</label>
            <input class="form-control" type="number" id="settingTahunAkhir" min="2020" max="2040" value="${tahunAkhir}" style="width:120px">
          </div>
          <button class="btn btn-primary" onclick="saveSettings()" style="margin-bottom:1px">
            <span class="material-icons">save</span>Simpan
          </button>
          <div id="settingStatus" style="font-size:12px;color:#ef4444;align-self:center"></div>
        </div>
      </div>
    </div>

    <!-- DAFTAR PERIODE -->
    <div class="card">
      <div class="card-header-bar" style="justify-content:space-between">
        <span class="card-title"><span class="material-icons">calendar_month</span>Daftar Periode Input</span>
        <button class="btn btn-primary btn-sm" onclick="openPeriodeModal()"><span class="material-icons">add</span>Tambah Periode</button>
      </div>
      <div class="card-body" style="padding:12px 16px">
        <select class="form-control" id="filterTahunPeriode" style="width:150px" onchange="loadPeriodeGrid()">
          ${yearOptions(currentTahun)}
        </select>
      </div>
      <div class="card-body">
        <div class="info-card info"><span class="material-icons">info</span><div class="info-card-text">Periode aktif ditandai dengan warna hijau. Operator hanya bisa input pada periode yang aktif dan dalam rentang tanggal yang ditentukan.</div></div>
        <div id="periodeGrid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;margin-top:16px"></div>
      </div>
    </div>

    <!-- MODAL PERIODE -->
    <div class="modal" id="periodeModal">
      <div class="modal-card">
        <div class="modal-header">
          <span class="material-icons">edit_calendar</span>
          <h3 id="periodeModalTitle">Tambah Periode Input</h3>
          <button class="btn-icon" onclick="closeModal('periodeModal')"><span class="material-icons">close</span></button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <div class="form-group"><label>Tahun</label><select class="form-control" id="pTahun">${yearOptions(currentTahun)}</select></div>
            <div class="form-group"><label>Bulan</label><select class="form-control" id="pBulan">${bulanOptions(CURRENT_BULAN)}</select></div>
          </div>
          <div style="margin:4px 0 8px;padding:8px 12px;background:#eff6ff;border-radius:8px;border:1px solid #bfdbfe">
            <div style="font-size:12px;font-weight:700;color:#1d4ed8;margin-bottom:8px;display:flex;align-items:center;gap:6px">
              <span class="material-icons" style="font-size:15px">edit_calendar</span>Periode Input (Operator)
            </div>
            <div class="form-row" style="margin-bottom:8px">
              <div class="form-group" style="margin-bottom:0"><label>Tanggal Mulai</label><input type="date" class="form-control" id="pMulai" onchange="_syncVerifDate()"></div>
              <div class="form-group" style="margin-bottom:0">
                <label>Jam Mulai</label>
                <input type="time" class="form-control" id="pJamMulai" value="08:00" oninput="_syncVerifTime()" style="display:none">
                <div class="time-picker-24" id="pJamMulaiPicker" data-target="pJamMulai" data-sync="_syncVerifTime"></div>
              </div>
            </div>
            <div class="form-row" style="margin-bottom:0">
              <div class="form-group" style="margin-bottom:0"><label>Tanggal Selesai</label><input type="date" class="form-control" id="pSelesai" onchange="_syncVerifDate()"></div>
              <div class="form-group" style="margin-bottom:0">
                <label>Jam Selesai</label>
                <input type="time" class="form-control" id="pJamSelesai" value="17:00" oninput="_syncVerifTime()" style="display:none">
                <div class="time-picker-24" id="pJamSelesaiPicker" data-target="pJamSelesai" data-sync="_syncVerifTime"></div>
              </div>
            </div>
          </div>

          <div style="margin:8px 0 6px;padding:8px 12px;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:6px">
              <div style="font-size:12px;font-weight:700;color:#15803d;display:flex;align-items:center;gap:6px">
                <span class="material-icons" style="font-size:15px">verified_user</span>Periode Verifikasi (Kapus & Pengelola Program)
              </div>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:11.5px;color:#15803d;font-weight:600;user-select:none">
                <input type="checkbox" id="pSyncVerif" onchange="_onSyncVerifToggle()"
                  style="accent-color:#16a34a;width:14px;height:14px;cursor:pointer">
                Ikuti waktu input otomatis
              </label>
            </div>
            <div id="pVerifFields">
              <div class="form-row" style="margin-bottom:8px">
                <div class="form-group" style="margin-bottom:0"><label>Tanggal Mulai Verifikasi</label><input type="date" class="form-control" id="pMulaiVerif"></div>
                <div class="form-group" style="margin-bottom:0">
                  <label>Jam Mulai Verifikasi</label>
                  <input type="time" class="form-control" id="pJamMulaiVerif" value="08:00" style="display:none">
                  <div class="time-picker-24" id="pJamMulaiVerifPicker" data-target="pJamMulaiVerif"></div>
                </div>
              </div>
              <div class="form-row" style="margin-bottom:4px">
                <div class="form-group" style="margin-bottom:0"><label>Tanggal Selesai Verifikasi</label><input type="date" class="form-control" id="pSelesaiVerif"></div>
                <div class="form-group" style="margin-bottom:0">
                  <label>Jam Selesai Verifikasi</label>
                  <input type="time" class="form-control" id="pJamSelesaiVerif" value="17:00" style="display:none">
                  <div class="time-picker-24" id="pJamSelesaiVerifPicker" data-target="pJamSelesaiVerif"></div>
                </div>
              </div>
            </div>
            <div id="pVerifSyncInfo" style="display:none;font-size:11.5px;color:#15803d;padding:6px 8px;background:#dcfce7;border-radius:6px;margin-top:4px">
              <span class="material-icons" style="font-size:13px;vertical-align:middle">sync</span>
              Waktu verifikasi akan mengikuti periode input secara otomatis.
            </div>
            <div style="font-size:11px;color:#16a34a;margin-top:6px" id="pVerifHint">Kosongkan jika tidak ingin membatasi waktu verifikasi.</div>
          </div>
          <div class="form-group"><label>Status</label>
            <select class="form-control" id="pStatus">
              <option value="Aktif">Aktif (Bisa diinput)</option>
              <option value="Tidak Aktif">Tidak Aktif</option>
            </select>
          </div>
        </div>
        <div class="modal-footer" style="justify-content:space-between">
          <button class="btn btn-danger" id="btnHapusPeriode" style="display:none" onclick="hapusPeriode()">
            <span class="material-icons">delete</span>Hapus
          </button>
          <div style="display:flex;gap:8px">
            <button class="btn btn-secondary" onclick="closeModal('periodeModal')">Batal</button>
            <button class="btn btn-primary" onclick="savePeriode()"><span class="material-icons">save</span>Simpan</button>
          </div>
        </div>
      </div>
    </div>`;

  loadPeriodeGrid();
}

async function loadPeriodeGrid() {
  const tahun = document.getElementById('filterTahunPeriode')?.value;
  if (!tahun) return;
  try {
    const rows = await API.getPeriode(tahun);
    const grid = document.getElementById('periodeGrid');
    if (!grid) return;
    if (!rows.length) {
      grid.innerHTML = `<div class="empty-state"><p>Belum ada data periode untuk tahun ${tahun}</p></div>`;
      return;
    }
    grid.innerHTML = rows.map(p => {
      const isActive = p.isAktifToday;
      const isTidakAktif = p.status === 'Tidak Aktif';

      if (isActive) {
        const _svgCal  = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
        const _svgOpen = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
        const _svgClose= '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
        const jm  = fmt24(p.jamMulai)  || '08:00';
        const js  = fmt24(p.jamSelesai) || '17:00';
        return `<div style="border:1.5px solid #a7f3d0;border-radius:10px;overflow:hidden;background:var(--surface,white);box-shadow:0 1px 4px rgba(13,148,136,0.08);cursor:pointer" onclick="editPeriode(${p.tahun},${p.bulan})">
          <div style="background:linear-gradient(135deg,#0d9488,#06b6d4);padding:8px 14px;color:white;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:space-between">
            <div style="display:flex;align-items:center;gap:7px"><span style="opacity:0.9;display:flex">${_svgCal}</span> Periode Aktif: ${p.namaBulan} ${p.tahun}</div>
            <span class="badge badge-success" style="background:rgba(255,255,255,0.25);color:white;border:1px solid rgba(255,255,255,0.4);font-size:10px">Aktif Hari Ini</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr">
            <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--success-light,#f0fdf9);border-right:1px solid var(--border,#d1fae5)">
              <span style="color:#0d9488;display:flex;flex-shrink:0">${_svgOpen}</span>
              <div><div style="font-size:10px;color:var(--text-light,#64748b);font-weight:600;text-transform:uppercase;letter-spacing:0.4px">Dibuka</div>
              <div style="font-size:12px;font-weight:700;color:var(--text,#0f172a);">${formatDate(p.tanggalMulai)} <span style="letter-spacing:0.03em">${jm}</span> WITA</div></div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--danger-light,#fef2f2)">
              <span style="color:#ef4444;display:flex;flex-shrink:0">${_svgClose}</span>
              <div><div style="font-size:10px;color:var(--text-light,#64748b);font-weight:600;text-transform:uppercase;letter-spacing:0.4px">Ditutup</div>
              <div style="font-size:12px;font-weight:700;color:var(--text,#0f172a);">${formatDate(p.tanggalSelesai)} <span style="letter-spacing:0.03em">${js}</span> WITA</div></div>
            </div>
          </div>
          ${p.tanggalMulaiVerif ? `<div style="display:flex;align-items:center;gap:8px;padding:8px 14px;background:#f0fdf4;border-top:1px solid #bbf7d0"><span class="material-icons" style="font-size:15px;color:#15803d">verified_user</span><div style="font-size:12px;color:#15803d"><span style="font-weight:700">Verifikasi:</span> ${formatDate(p.tanggalMulaiVerif)} ${fmt24(p.jamMulaiVerif) || '08:00'} WITA — ${formatDate(p.tanggalSelesaiVerif)} ${fmt24(p.jamSelesaiVerif) || '17:00'} WITA</div></div>` : ''}
        </div>`;
      }

      // Tampilkan abu-abu (disabled) jika: status Tidak Aktif ATAU status Aktif tapi di luar rentang waktu (isAktifToday=false)
      const isDisabled = isTidakAktif || (!isActive && p.status === 'Aktif');
      const borderColor = isDisabled ? '#e2e8f0' : 'var(--primary)';
      const bg = isDisabled ? '#f8fafc' : 'var(--surface)';
      const badgeHtml = isTidakAktif
        ? '<span class="badge badge-default" style="color:#94a3b8">Tidak Aktif</span>'
        : isDisabled
          ? '<span class="badge badge-default" style="color:#94a3b8">Di Luar Rentang</span>'
          : '<span class="badge badge-info">Aktif</span>';
      return `<div style="border:2px solid ${borderColor};border-radius:12px;padding:16px;background:${bg};cursor:pointer;opacity:${isDisabled?'0.65':'1'}" onclick="editPeriode(${p.tahun},${p.bulan})">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="font-weight:700;font-size:15px">${p.namaBulan} ${p.tahun}</span>
          ${badgeHtml}
        </div>
        <div style="font-size:12px;color:var(--text-light);display:flex;flex-direction:column;gap:3px">
          <div>Mulai: ${formatDate(p.tanggalMulai)}${p.jamMulai ? ` pukul ${fmt24(p.jamMulai)}` : ''}</div>
          <div>Selesai: ${formatDate(p.tanggalSelesai)}${p.jamSelesai ? ` pukul ${fmt24(p.jamSelesai)}` : ''}</div>
          ${p.tanggalMulaiVerif ? `<div style="margin-top:6px;padding:5px 8px;background:#f0fdf4;border-radius:6px;font-size:11px;border-left:3px solid #16a34a;color:#15803d"><span style="font-weight:600">Verifikasi:</span> ${formatDate(p.tanggalMulaiVerif)} ${fmt24(p.jamMulaiVerif) || '08:00'} WITA — ${formatDate(p.tanggalSelesaiVerif)} ${fmt24(p.jamSelesaiVerif) || '17:00'} WITA</div>` : ''}
        </div>
      </div>`;
    }).join('');
  } catch (e) { if (!window._verifSilentReload) toast(e.message, 'error'); }
}

async function openPeriodeModal() {
  _editPeriodeTahun = null; _editPeriodeBulan = null;
  const title = document.getElementById('periodeModalTitle');
  const btnHapus = document.getElementById('btnHapusPeriode');
  if (title) title.textContent = 'Tambah Periode Input';
  if (btnHapus) btnHapus.style.display = 'none';
  document.getElementById('pTahun').value = CURRENT_YEAR;
  document.getElementById('pBulan').value = CURRENT_BULAN;
  document.getElementById('pMulai').value = '';
  document.getElementById('pSelesai').value = '';
  document.getElementById('pJamMulai').value = '08:00';
  document.getElementById('pJamSelesai').value = '17:00';
  document.getElementById('pStatus').value = 'Aktif';
  document.getElementById('pMulaiVerif').value = '';
  document.getElementById('pSelesaiVerif').value = '';
  document.getElementById('pJamMulaiVerif').value = '08:00';
  document.getElementById('pJamSelesaiVerif').value = '17:00';
  // Reset toggle sinkronisasi: default tidak sync
  const syncCb = document.getElementById('pSyncVerif');
  if (syncCb) { syncCb.checked = false; _onSyncVerifToggle(); }
  // Init 24h pickers dengan nilai default
  _initAllPeriodePickers('08:00', '17:00', '08:00', '17:00');
  showModal('periodeModal');
}

async function editPeriode(tahun, bulan) {
  try {
    const rows = await API.getPeriode(tahun);
    const p = rows.find(r => r.bulan == bulan);
    if (!p) return openPeriodeModal();
    _editPeriodeTahun = p.tahun; _editPeriodeBulan = p.bulan;
    const title = document.getElementById('periodeModalTitle');
    const btnHapus = document.getElementById('btnHapusPeriode');
    if (title) title.textContent = 'Edit Periode Input';
    if (btnHapus) btnHapus.style.display = '';
    const tMulai  = p.tanggalMulai  ? p.tanggalMulai.toString().substr(0, 10)  : '';
    const tSelesai = p.tanggalSelesai ? p.tanggalSelesai.toString().substr(0, 10) : '';
    const tMulaiVerif  = p.tanggalMulaiVerif  ? p.tanggalMulaiVerif.toString().substr(0, 10)  : '';
    const tSelesaiVerif = p.tanggalSelesaiVerif ? p.tanggalSelesaiVerif.toString().substr(0, 10) : '';
    const jMulai  = fmt24(p.jamMulai)  || '08:00';
    const jSelesai = fmt24(p.jamSelesai) || '17:00';
    const jMulaiVerif  = fmt24(p.jamMulaiVerif)  || '08:00';
    const jSelesaiVerif = fmt24(p.jamSelesaiVerif) || '17:00';
    document.getElementById('pTahun').value   = p.tahun;
    document.getElementById('pBulan').value   = p.bulan;
    document.getElementById('pMulai').value   = tMulai;
    document.getElementById('pSelesai').value  = tSelesai;
    document.getElementById('pJamMulai').value  = jMulai;
    document.getElementById('pJamSelesai').value = jSelesai;
    document.getElementById('pStatus').value  = p.status;
    document.getElementById('pMulaiVerif').value   = tMulaiVerif;
    document.getElementById('pSelesaiVerif').value  = tSelesaiVerif;
    document.getElementById('pJamMulaiVerif').value  = jMulaiVerif;
    document.getElementById('pJamSelesaiVerif').value = jSelesaiVerif;
    // Deteksi apakah periode verif sama persis dengan input → aktifkan toggle sync
    const isSync = tMulaiVerif === tMulai && tSelesaiVerif === tSelesai
      && jMulaiVerif === jMulai && jSelesaiVerif === jSelesai;
    const syncCb = document.getElementById('pSyncVerif');
    if (syncCb) { syncCb.checked = isSync; _onSyncVerifToggle(); }
    // Init 24h pickers dengan nilai dari DB
    _initAllPeriodePickers(jMulai, jSelesai, jMulaiVerif, jSelesaiVerif);
    showModal('periodeModal');
  } catch (e) { openPeriodeModal(); }
}

async function hapusPeriode() {
  if (!_editPeriodeTahun || !_editPeriodeBulan) return;
  showConfirm({
    title: 'Hapus Periode',
    message: `Hapus periode <strong>${BULAN_NAMA[_editPeriodeBulan]} ${_editPeriodeTahun}</strong>?`,
    type: 'danger',
    onConfirm: async () => {
      setLoading(true);
      try {
        await API.del(`periode?tahun=${_editPeriodeTahun}&bulan=${_editPeriodeBulan}`, {});
        toast('Periode berhasil dihapus', 'success');
        closeModal('periodeModal');
        loadPeriodeGrid();
      } catch(e) { toast(e.message, 'error'); }
      finally { setLoading(false); }
    }
  });
}

async function savePeriode() {
  const tahun = parseInt(document.getElementById('pTahun').value);
  const bulan = parseInt(document.getElementById('pBulan').value);
  const tanggalMulai = document.getElementById('pMulai').value;
  const tanggalSelesai = document.getElementById('pSelesai').value;
  const jamMulai = document.getElementById('pJamMulai').value || '08:00';
  const jamSelesai = document.getElementById('pJamSelesai').value || '17:00';
  const status = document.getElementById('pStatus').value;
  // Jika mode sync aktif, gunakan nilai dari periode input
  const isSync = document.getElementById('pSyncVerif')?.checked;
  const tanggalMulaiVerif  = isSync ? (tanggalMulai || null)  : (document.getElementById('pMulaiVerif').value || null);
  const tanggalSelesaiVerif = isSync ? (tanggalSelesai || null) : (document.getElementById('pSelesaiVerif').value || null);
  const jamMulaiVerif  = isSync ? jamMulai  : (document.getElementById('pJamMulaiVerif').value || '08:00');
  const jamSelesaiVerif = isSync ? jamSelesai : (document.getElementById('pJamSelesaiVerif').value || '17:00');
  if (!tanggalMulai || !tanggalSelesai) return toast('Tanggal mulai dan selesai harus diisi', 'error');
  if (tanggalMulaiVerif && !tanggalSelesaiVerif) return toast('Tanggal selesai verifikasi harus diisi', 'error');
  if (!tanggalMulaiVerif && tanggalSelesaiVerif) return toast('Tanggal mulai verifikasi harus diisi', 'error');
  setLoading(true);
  try {
    await API.savePeriode({ tahun, bulan, namaBulan: BULAN_NAMA[bulan], tanggalMulai, tanggalSelesai, jamMulai, jamSelesai, tanggalMulaiVerif, tanggalSelesaiVerif, jamMulaiVerif, jamSelesaiVerif, status });
    toast('Periode berhasil disimpan', 'success');
    closeModal('periodeModal');
    loadPeriodeGrid();
  } catch (e) { toast(e.message, 'error'); }
  finally { setLoading(false); }
}

// ── Periode modal helper: toggle sinkronisasi waktu verifikasi ──
function _onSyncVerifToggle() {
  const isSync = document.getElementById('pSyncVerif')?.checked;
  const fields  = document.getElementById('pVerifFields');
  const info    = document.getElementById('pVerifSyncInfo');
  const hint    = document.getElementById('pVerifHint');
  if (!fields) return;
  if (isSync) {
    fields.style.opacity = '0.4';
    fields.style.pointerEvents = 'none';
    if (info) info.style.display = 'block';
    if (hint) hint.style.display = 'none';
    _doSyncVerif(); // langsung sync saat toggle ON
  } else {
    fields.style.opacity = '1';
    fields.style.pointerEvents = '';
    if (info) info.style.display = 'none';
    if (hint) hint.style.display = 'block';
  }
}

// Salin nilai tanggal input → verifikasi
function _syncVerifDate() {
  if (!document.getElementById('pSyncVerif')?.checked) return;
  _doSyncVerif();
}

// Salin nilai jam input → verifikasi
function _syncVerifTime() {
  if (!document.getElementById('pSyncVerif')?.checked) return;
  _doSyncVerif();
}

function _doSyncVerif() {
  const get = id => document.getElementById(id)?.value || '';
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  set('pMulaiVerif',   get('pMulai'));
  set('pSelesaiVerif',  get('pSelesai'));
  // Sync picker (hidden input sudah di-update oleh picker sendiri, tapi kita juga
  // perlu update picker verif agar tampilan select berubah)
  _setTimePicker24('pJamMulaiVerifPicker',  get('pJamMulai'));
  _setTimePicker24('pJamSelesaiVerifPicker', get('pJamSelesai'));
  set('pJamMulaiVerif',  get('pJamMulai'));
  set('pJamSelesaiVerif', get('pJamSelesai'));
}

// ── Custom 24-hour time picker (ganti input[type=time] agar tidak ada AM/PM) ──
// Render dua <select> jam (00-23) dan menit (00,05,...,55) ke dalam div.time-picker-24.
// Nilai tersinkron ke hidden <input type="time"> via data-target.
function _initTimePicker24(pickerId, initialValue) {
  const wrap = document.getElementById(pickerId);
  if (!wrap) return;
  const targetId = wrap.dataset.target;
  const syncFn   = wrap.dataset.sync; // nama fungsi global yang dipanggil setelah change
  const [initH, initM] = (initialValue || '08:00').split(':').map(Number);

  // Opsi jam 00–23
  let hoursOpts = '';
  for (let h = 0; h < 24; h++) {
    const hh = String(h).padStart(2, '0');
    hoursOpts += `<option value="${hh}"${h === initH ? ' selected' : ''}>${hh}</option>`;
  }
  // Opsi menit 00–59 (lengkap)
  let minsOpts = '';
  for (let m = 0; m < 60; m++) {
    const mm = String(m).padStart(2, '0');
    minsOpts += `<option value="${mm}"${m === initM ? ' selected' : ''}>${mm}</option>`;
  }

  wrap.innerHTML = `
    <div style="display:flex;align-items:center;gap:4px">
      <select class="form-control" id="${pickerId}_h" style="width:64px;box-sizing:border-box">
        ${hoursOpts}
      </select>
      <span style="font-weight:700;font-size:16px;color:var(--text-dark)">:</span>
      <select class="form-control" id="${pickerId}_m" style="width:64px;box-sizing:border-box">
        ${minsOpts}
      </select>
    </div>`;

  const onchange = () => {
    const h = document.getElementById(`${pickerId}_h`)?.value || '00';
    const m = document.getElementById(`${pickerId}_m`)?.value || '00';
    const val = `${h}:${m}`;
    const target = document.getElementById(targetId);
    if (target) target.value = val;
    // Panggil sync function jika ada
    if (syncFn && typeof window[syncFn] === 'function') window[syncFn]();
  };
  document.getElementById(`${pickerId}_h`)?.addEventListener('change', onchange);
  document.getElementById(`${pickerId}_m`)?.addEventListener('change', onchange);
}

// Set nilai picker dari string "HH:MM"
function _setTimePicker24(pickerId, value) {
  if (!value) return;
  const [h, m] = value.split(':');
  const selH = document.getElementById(`${pickerId}_h`);
  const selM = document.getElementById(`${pickerId}_m`);
  if (selH) selH.value = h;
  if (selM) {
    selM.value = String(parseInt(m) || 0).padStart(2, '0');
  }
  // Update hidden input juga
  const wrap = document.getElementById(pickerId);
  if (wrap?.dataset?.target) {
    const target = document.getElementById(wrap.dataset.target);
    if (target) target.value = `${selH?.value || '00'}:${selM?.value || '00'}`;
  }
}

// Inisialisasi semua 4 picker di modal periode
function _initAllPeriodePickers(jm, js, jmv, jsv) {
  _initTimePicker24('pJamMulaiPicker',    jm  || '08:00');
  _initTimePicker24('pJamSelesaiPicker',   js  || '17:00');
  _initTimePicker24('pJamMulaiVerifPicker', jmv || '08:00');
  _initTimePicker24('pJamSelesaiVerifPicker',jsv || '17:00');
}

// ============== GLOBAL HELPERS ==============
function showModal(id) { document.getElementById(id)?.classList.add('show'); }
function closeModal(id) {
  if (id === 'verifikasiModal') {
    window._verifTTOk        = true;  // reset saat tutup
    window._verifDitolakOleh = '';
    window._verifIsPPReVerif = false;
    verifCurrentUsulan       = null;
    window.verifCurrentUsulan = null;
  }
  document.getElementById(id)?.classList.remove('show');
}
function setLoading(show) { document.getElementById('globalLoader').classList.toggle('show', show); }

// Close modal on backdrop click
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal')) {
    closeModal(e.target.id);
  }
});

// Enter key on auth
// ============== IDLE AUTO LOGOUT ==============
const IDLE_TIMEOUT      =  5 * 60 * 1000; // 5 menit idle → logout
const IDLE_WARN_BEFORE  = 30 * 1000; // tampilkan warning 30 detik sebelum logout
let _idleTimer     = null;
let _idleWarnTimer = null;
let _idleCountdown = null;

function _clearIdleTimers() {
  clearTimeout(_idleTimer);
  clearTimeout(_idleWarnTimer);
  clearInterval(_idleCountdown);
}

function _hideIdleWarning() {
  const el = document.getElementById('idleWarningModal');
  if (el) el.remove();
}

function _showIdleWarning() {
  _hideIdleWarning();
  let secs = Math.floor(IDLE_WARN_BEFORE / 1000);
  const modal = document.createElement('div');
  modal.id = 'idleWarningModal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5)';
  modal.innerHTML = `
    <div style="background:white;border-radius:16px;padding:32px 28px;max-width:360px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3)">
      <div style="width:56px;height:56px;border-radius:50%;background:#fef9c3;border:2px solid #fde68a;display:flex;align-items:center;justify-content:center;margin:0 auto 16px">
        <span class="material-icons" style="font-size:28px;color:#d97706">hourglass_top</span>
      </div>
      <div style="font-size:17px;font-weight:800;color:#1e293b;margin-bottom:8px">Sesi Akan Berakhir</div>
      <div style="font-size:13px;color:#64748b;margin-bottom:16px;line-height:1.5">
        Anda tidak aktif. Sistem akan logout otomatis dalam
      </div>
      <div id="idleCountdownNum" style="font-size:42px;font-weight:900;color:#d97706;font-family:monospace;margin-bottom:20px">${secs}</div>
      <button onclick="window._resetIdleFromWarning()" style="width:100%;height:44px;background:linear-gradient(135deg,#0d9488,#06b6d4);border:none;border-radius:10px;color:white;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">
        <span style="display:flex;align-items:center;justify-content:center;gap:6px">
          <span class="material-icons" style="font-size:18px">touch_app</span> Lanjutkan Sesi
        </span>
      </button>
    </div>`;
  document.body.appendChild(modal);

  _idleCountdown = setInterval(() => {
    secs--;
    const el = document.getElementById('idleCountdownNum');
    if (el) el.textContent = secs;
    if (secs <= 0) clearInterval(_idleCountdown);
  }, 1000);
}

window._resetIdleFromWarning = function() {
  _hideIdleWarning();
  resetIdleTimer();
};

function resetIdleTimer() {
  _clearIdleTimers();
  _hideIdleWarning();
  if (!currentUser) return;

  // Warning 2 menit sebelum timeout
  _idleWarnTimer = setTimeout(() => {
    if (currentUser) _showIdleWarning();
  }, IDLE_TIMEOUT - IDLE_WARN_BEFORE);

  // Logout setelah timeout penuh
  _idleTimer = setTimeout(() => {
    if (currentUser) {
      _hideIdleWarning();
      currentUser = null;
      sessionStorage.removeItem('spm_user');
      try { sessionStorage.removeItem('spm_last_page'); } catch(e) {}
      toast('Sesi berakhir karena tidak ada aktivitas. Silakan login kembali.', 'warning');
      setTimeout(() => location.reload(), 2000);
    }
  }, IDLE_TIMEOUT);
}

function startIdleWatcher() {
  ['mousemove','mousedown','keydown','touchstart','scroll','click'].forEach(evt => {
    document.addEventListener(evt, resetIdleTimer, { passive: true });
  });
  resetIdleTimer();
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('authEmail').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doLogin();
  });

  // Restore session dari localStorage
  try {
    const saved = sessionStorage.getItem('spm_user');
    if (saved) {
      currentUser = JSON.parse(saved);
      // Normalisasi role lama → nama baru
      const roleMap = { 'Kapus': 'Kepala Puskesmas', 'kapus': 'Kepala Puskesmas', 'Program': 'Pengelola Program' };
      if (roleMap[currentUser.role]) {
        currentUser.role = roleMap[currentUser.role];
        sessionStorage.setItem('spm_user', JSON.stringify(currentUser)); // update sessionStorage
      }
      startApp();
      startIdleWatcher();
    }
  } catch(e) {
    sessionStorage.removeItem('spm_user');
  }
});

// ============ KELOLA SEMUA USULAN (SUPER ADMIN) ============
async function renderKelolaUsulan() {
  document.getElementById('mainContent').innerHTML = `
    <div class="page-header">
      <h1><span class="material-icons">admin_panel_settings</span>Kelola Semua Usulan</h1>
    </div>
    <div class="card">
      <div class="card-body" style="padding:12px 16px">
        <div class="filter-row">
          <select class="form-control" id="kuTahun" onchange="_kuOnTahunChange()" style="min-width:100px"><option value="">Memuat...</option></select>
          <select class="form-control" id="kuBulan" onchange="_kuApplyFilter()" style="width:140px">
            <option value="">Semua Bulan</option>
          </select>
          <select class="form-control" id="kuStatus" onchange="_kuApplyFilter()" style="width:160px">
            <option value="">Semua Status</option>
          </select>
        </div>
      </div>
      <div id="kuTable" style="padding:0"></div>
    </div>`;
  loadKelolaUsulan();
}

// Data mentah SEMUA usulan (semua tahun, sebelum filter)
let _kuAllRows = [];
let _kuPage = 1, _kuRows = [];

// Rebuild semua filter (tahun, bulan, status) dari data yang ada
function _kuRebuildFilters(rows, selTahun, selBulan, selStatus) {
  // --- Tahun ---
  const tahunSel = document.getElementById('kuTahun');
  if (tahunSel) {
    const years = [...new Set(rows.map(u => parseInt(u.tahun)).filter(Boolean))].sort((a,b) => b - a);
    const picked = selTahun || (years[0] || CURRENT_YEAR);
    tahunSel.innerHTML = years.map(y => `<option value="${y}" ${y == picked ? 'selected':''}>${y}</option>`).join('');
  }

  const tahunPilih = parseInt(document.getElementById('kuTahun')?.value || selTahun);

  // --- Bulan (dari data tahun terpilih) ---
  const bulanSel = document.getElementById('kuBulan');
  if (bulanSel) {
    const bulanMap = new Map();
    rows.filter(u => !tahunPilih || parseInt(u.tahun) === tahunPilih)
        .forEach(u => { if (u.bulan && u.namaBulan) bulanMap.set(parseInt(u.bulan), u.namaBulan); });
    const bulanSorted = [...bulanMap.entries()].sort((a,b) => a[0]-b[0]);
    bulanSel.innerHTML = '<option value="">Semua Bulan</option>'
      + bulanSorted.map(([no, nama]) => `<option value="${no}" ${selBulan == no ? 'selected':''}>${nama}</option>`).join('');
  }

  // --- Status (dari data tahun terpilih) ---
  const statusSel = document.getElementById('kuStatus');
  if (statusSel) {
    const statusOrder = ['Draft','Menunggu Kepala Puskesmas','Menunggu Pengelola Program','Menunggu Admin','Selesai','Ditolak'];
    const statusSet = new Set(
      rows.filter(u => !tahunPilih || parseInt(u.tahun) === tahunPilih)
          .map(u => u.statusGlobal).filter(Boolean)
    );
    const statusSorted = statusOrder.filter(s => statusSet.has(s));
    statusSet.forEach(s => { if (!statusSorted.includes(s)) statusSorted.push(s); });
    statusSel.innerHTML = '<option value="">Semua Status</option>'
      + statusSorted.map(s => `<option value="${s}" ${selStatus === s ? 'selected':''}>${s}</option>`).join('');
  }
}

// Dipanggil saat tahun berubah: rebuild bulan & status untuk tahun baru, lalu apply filter
function _kuOnTahunChange() {
  _kuRebuildFilters(_kuAllRows, document.getElementById('kuTahun')?.value, '', '');
  _kuApplyFilter(1);
}

// Apply filter tahun/bulan/status ke _kuAllRows, lalu render tabel
function _kuApplyFilter(page) {
  _kuPage = page || 1;
  const tahun  = document.getElementById('kuTahun')?.value;
  const bulan  = document.getElementById('kuBulan')?.value;
  const status = document.getElementById('kuStatus')?.value;

  _kuRows = _kuAllRows.filter(u =>
    (!tahun  || String(u.tahun)       === String(tahun))  &&
    (!bulan  || String(u.bulan)       === String(bulan))  &&
    (!status || u.statusGlobal        === status)
  );

  _kuRenderTable();
}

async function loadKelolaUsulan(page) {
  if (page) { _kuPage = page; _kuApplyFilter(page); return; }

  const prevTahun  = document.getElementById('kuTahun')?.value  || String(CURRENT_YEAR);
  const prevBulan  = document.getElementById('kuBulan')?.value  || '';
  const prevStatus = document.getElementById('kuStatus')?.value || '';

  try {
    // Fetch SEMUA usulan tanpa filter tahun agar dropdown tahun bisa dibangun dari data nyata
    _kuAllRows = await API.getUsulan({});
    _kuPage = 1;

    // Resolve nama operator dari email (pakai cache _userNamaCache)
    try {
      if (!window._userNamaCache) window._userNamaCache = {};
      const uniqueEmails = [...new Set(_kuAllRows.map(u => u.createdBy).filter(Boolean))];
      const uncached = uniqueEmails.filter(e => !window._userNamaCache[e]);
      if (uncached.length) {
        const users = await API.getUsers().catch(() => []);
        (users || []).forEach(u => { window._userNamaCache[u.email] = u.nama || u.email; });
      }
      _kuAllRows = _kuAllRows.map(u => ({
        ...u,
        _namaOperator: (u.createdBy && window._userNamaCache[u.createdBy]) || u.createdBy || '-'
      }));
    } catch(e) {}

    _kuRebuildFilters(_kuAllRows, prevTahun, prevBulan, prevStatus);
    _kuApplyFilter(1);
  } catch(e) { toast(e.message, 'error'); }
}

function _kuRenderTable() {
  const el = document.getElementById('kuTable');
  if (!el) return;
  if (!_kuRows.length) {
    el.innerHTML = `<div class="empty-state" style="padding:32px"><span class="material-icons">inbox</span><p>Tidak ada usulan untuk filter ini</p></div>`;
    return;
  }
  const { items, page: p, totalPages, total } = paginateData(_kuRows, _kuPage);
  const rowsHtml = items.map(u => `<tr>
      <td><span style="font-weight:600;font-size:12px">${u.idUsulan}</span></td>
      <td>${u.namaPKM || u.kodePKM}</td>
      <td style="font-size:12px">${u._namaOperator || u.createdBy || '-'}</td>
      <td>${u.namaBulan || ''} ${u.tahun}</td>
      <td class="rasio-cell" style="font-weight:700;color:var(--primary)">${parseFloat(u.indeksSPM||0).toFixed(2)}</td>
      <td>${statusBadge(u.statusGlobal)}</td>
      <td style="font-size:12px;color:var(--text-light)">${formatDateTime(u.createdAt)}</td>
      <td style="display:flex;gap:4px">
        <button class="btn-icon view" onclick="viewDetail('${u.idUsulan}')" title="Detail"><span class="material-icons">visibility</span></button>
        <button class="btn-icon del" onclick="adminDeleteUsulan('${u.idUsulan}')" title="Hapus"><span class="material-icons">delete</span></button>
        ${u.statusGlobal === 'Menunggu Admin' && u.statusKapus !== 'Selesai'
          ? `<button class="btn-icon" onclick="restoreVerifAdmin('${u.idUsulan}')" title="Pulihkan verifikasi Kapus & Program" style="background:transparent;border:none;color:#f59e0b"><span class="material-icons">restore</span></button>`
          : ''}
      </td>
    </tr>`).join('');
  el.innerHTML = '<div class="table-container"><table>'
    + '<thead><tr><th>ID Usulan</th><th>Puskesmas</th><th>Operator</th><th>Periode</th><th>Indeks SPM</th><th>Status</th><th>Dibuat</th><th>Aksi</th></tr></thead>'
    + '<tbody>' + rowsHtml + '</tbody></table></div>'
    + renderPagination('kuTable', total, p, totalPages, 'pg => { _kuPage=pg; _kuRenderTable(); }');
}

function adminEditUsulan(idUsulan) {
  openIndikatorModal(idUsulan);
}

async function adminResetUsulan(idUsulan) {
  showConfirm({
    title: 'Reset Usulan ke Draft', type: 'warning',
    message: `Reset usulan ${idUsulan} ke status Draft? Semua approve akan dibatalkan.`,
    onConfirm: async () => {
      setLoading(true);
      try {
        await API.post('usulan?action=admin-reset', { idUsulan, email: currentUser.email });
        toast(`Usulan ${idUsulan} berhasil direset ke Draft`);
        loadKelolaUsulan();
      } catch(e) { toast(e.message,'error'); } finally { setLoading(false); }
    }
  });
}

async function adminDeleteUsulan(idUsulan) {
  showConfirm({
    title: 'Hapus Usulan', type: 'danger',
    message: `Hapus permanen usulan ${idUsulan}? Semua data indikator dan verifikasi akan ikut terhapus dan tidak bisa dikembalikan.`,
    onConfirm: async () => {
      setLoading(true);
      try {
        await API.del('usulan', { idUsulan });
        toast(`Usulan ${idUsulan} berhasil dihapus`);
        loadKelolaUsulan();
      } catch(e) { toast(e.message, 'error'); }
      finally { setLoading(false); }
    }
  });
}

async function restoreVerifAdmin(idUsulan) {
  showConfirm({
    title: 'Pulihkan Status Verifikasi',
    type: 'warning',
    icon: 'restore',
    message: `Status verifikasi Kepala Puskesmas dan Pengelola Program untuk usulan ${idUsulan} akan dipulihkan ke "Selesai".\n\nGunakan ini hanya jika data verifikasi hilang akibat bug ajukan ulang.`,
    onConfirm: async () => {
      setLoading(true);
      try {
        await API.post('usulan?action=restore-verif', { idUsulan, emailAdmin: currentUser.email });
        toast('Status verifikasi berhasil dipulihkan ✓', 'success');
        loadKelolaUsulan();
      } catch(e) { toast(e.message, 'error'); }
      finally { setLoading(false); }
    }
  });
}


// ============== MASTER DATA TAB WRAPPERS ==============
const _masterTabs = [
  { id: 'users',           icon: 'group',          label: 'User' },
  { id: 'jabatan',         icon: 'badge',           label: 'Jabatan' },
  { id: 'pkm',             icon: 'local_hospital',  label: 'Puskesmas' },
  { id: 'indikator',       icon: 'monitor_heart',   label: 'Indikator' },
  { id: 'periode',         icon: 'event_available', label: 'Periode' },
  { id: 'target-tahunan',  icon: 'track_changes',   label: 'Target Tahunan' },
  { id: 'pejabat',         icon: 'draw',            label: 'Pejabat' },
  { id: 'penandatangan',   icon: 'assignment_ind',  label: 'Penandatangan' },
  { id: 'audit-trail',     icon: 'manage_search',   label: 'Audit Trail' },
];


// ============== AUDIT TRAIL ==============
// Label tampilan untuk modul dan aksi
const _AT_MODULE_LABELS = {
  auth: 'Login / Auth', usulan: 'Usulan', users: 'User',
  puskesmas: 'Puskesmas', indikator: 'Indikator', periode: 'Periode', settings: 'Pengaturan'
};
const _AT_ACTION_LABELS = {
  LOGIN: 'Login', LOGOUT: 'Logout', CREATE: 'Tambah', UPDATE: 'Ubah', DELETE: 'Hapus',
  SUBMIT: 'Submit', APPROVE: 'Approve', REJECT: 'Tolak',
  RESET: 'Reset', RESTORE: 'Restore', VERIFY: 'Verifikasi'
};
// Fallback: Title Case jika aksi tidak ada di mapping
function _atActionLabel(raw) {
  const key = (raw || '').toUpperCase();
  if (_AT_ACTION_LABELS[key]) return _AT_ACTION_LABELS[key];
  return key.charAt(0) + key.slice(1).toLowerCase();
}

async function renderAuditTrail(el) {
  const target = el || document.getElementById('masterTabContent');
  if (!target) return;

  const today = new Date();
  const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 7);
  const fmt = d => d.toISOString().split('T')[0];

  target.innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <div class="card-header-bar" style="justify-content:space-between">
        <span class="card-title"><span class="material-icons">manage_search</span>Audit Trail — Log Aktivitas Global</span>
        <button class="btn btn-primary btn-sm" onclick="exportAuditTrail()">
          <span class="material-icons">download</span>Export Excel
        </button>
      </div>
      <div class="card-body" style="padding:12px 16px">
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
          <div>
            <label style="font-size:12px;font-weight:600;color:#64748b;display:block;margin-bottom:4px">Tanggal Mulai</label>
            <input type="date" class="form-control" id="atDateFrom" value="${fmt(weekAgo)}" style="width:150px">
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;color:#64748b;display:block;margin-bottom:4px">Tanggal Akhir</label>
            <input type="date" class="form-control" id="atDateTo" value="${fmt(today)}" style="width:150px">
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;color:#64748b;display:block;margin-bottom:4px">Modul</label>
            <select class="form-control" id="atModule" style="width:160px">
              <option value="">Semua Modul</option>
            </select>
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;color:#64748b;display:block;margin-bottom:4px">Aksi</label>
            <select class="form-control" id="atAction" style="width:140px">
              <option value="">Semua Aksi</option>
            </select>
          </div>
          <div style="flex:1;min-width:160px">
            <label style="font-size:12px;font-weight:600;color:#64748b;display:block;margin-bottom:4px">Cari User</label>
            <input type="text" class="form-control" id="atUser" placeholder="Email atau nama...">
          </div>
          <button class="btn btn-primary" onclick="setLoading(true);loadAuditTrail().finally(()=>setLoading(false))">
            <span class="material-icons">search</span>Tampilkan
          </button>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-body" style="padding:0" id="auditTrailTable">
        <div class="loading-state" style="padding:40px">
          ${spinnerHTML('lg')}
          <p>Memuat log 7 hari terakhir...</p>
        </div>
      </div>
    </div>`;

  // Isi dropdown modul & aksi dari data nyata (tanpa filter tanggal, limit besar)
  // Keduanya di-await agar spinner global tidak mati sebelum data selesai dimuat
  await Promise.all([
    _populateAuditFilterOptions(),
    loadAuditTrail()
  ]);
}

// Ambil semua data tanpa filter → bangun opsi modul & aksi yang benar-benar ada di DB
async function _populateAuditFilterOptions() {
  try {
    // Ambil sample besar tanpa filter tanggal agar modul/aksi lengkap terdeteksi
    const all = await API.get('audit-trail', { limit: 5000 });
    if (!all || !all.length) return;

    const moduleSel = document.getElementById('atModule');
    const actionSel = document.getElementById('atAction');
    if (!moduleSel || !actionSel) return;

    // Kumpulkan nilai unik yang benar-benar ada
    const modules = [...new Set(all.map(r => r.module).filter(Boolean))].sort();
    const actions = [...new Set(all.map(r => (r.action||'').toUpperCase()).filter(Boolean))].sort();

    // Simpan nilai yang sedang dipilih (jika ada)
    const curMod = moduleSel.value;
    const curAct = actionSel.value;

    moduleSel.innerHTML = '<option value="">Semua Modul</option>'
      + modules.map(m => {
          const label = _AT_MODULE_LABELS[m] || m;
          return `<option value="${m}" ${m === curMod ? 'selected' : ''}>${label}</option>`;
        }).join('');

    actionSel.innerHTML = '<option value="">Semua Aksi</option>'
      + actions.map(a => {
          const label = _atActionLabel(a);
          return `<option value="${a}" ${a === curAct ? 'selected' : ''}>${label}</option>`;
        }).join('');
  } catch(_) { /* silent — filter tetap berfungsi walau gagal */ }
}

async function loadAuditTrail() {
  const el = document.getElementById('auditTrailTable');
  if (!el) return;
  // Tidak memanggil setLoading di sini — caller (renderAuditTrail atau tombol Tampilkan)
  // yang bertanggung jawab mengaktifkan/menonaktifkan spinner global.
  el.innerHTML = '';

  const params = {};
  const df = document.getElementById('atDateFrom')?.value;
  const dt = document.getElementById('atDateTo')?.value;
  const mod = document.getElementById('atModule')?.value;
  const act = document.getElementById('atAction')?.value;
  const usr = document.getElementById('atUser')?.value;
  if (df) params.date_from = df;
  if (dt) params.date_to = dt;
  if (mod) params.module = mod;
  if (act) params.action = act;
  if (usr) params.user = usr;

  try {
    const data = await API.get('audit-trail', params);
    window._auditTrailData = data;
    window._auditTrailPage = 1;

    if (!data || !data.length) {
      el.innerHTML = `<div class="empty-state" style="padding:32px"><span class="material-icons">inbox</span><p>Tidak ada log untuk filter ini</p></div>`;
      return;
    }

    renderAuditTrailPage(1);
  } catch(e) {
    el.innerHTML = `<div class="empty-state" style="padding:32px"><span class="material-icons" style="color:#ef4444">error</span><p style="color:#ef4444">${e.message}</p></div>`;
  }
}

function renderAuditTrailPage(page) {
  const el = document.getElementById('auditTrailTable');
  if (!el) return;
  const data = window._auditTrailData || [];
  if (!data.length) return;

  const PAGE_SIZE = 9;
  const totalPages = Math.ceil(data.length / PAGE_SIZE);
  page = Math.max(1, Math.min(page, totalPages));
  window._auditTrailPage = page;

  const start = (page - 1) * PAGE_SIZE;
  const pageData = data.slice(start, start + PAGE_SIZE);

  const actionColor = { LOGIN:'#0d9488',CREATE:'#2563eb',UPDATE:'#f59e0b',DELETE:'#ef4444',SUBMIT:'#8b5cf6',APPROVE:'#10b981',REJECT:'#f43f5e' };
  const actionBg    = { LOGIN:'#f0fdf9',CREATE:'#eff6ff',UPDATE:'#fffbeb',DELETE:'#fef2f2',SUBMIT:'#f5f3ff',APPROVE:'#ecfdf5',REJECT:'#fff1f2' };

  // Build pagination controls
  function buildPagination() {
    if (totalPages <= 1) return '';
    const btn = (p, label, disabled = false, active = false) =>
      `<button onclick="renderAuditTrailPage(${p})"
        style="min-width:32px;height:32px;padding:0 10px;border-radius:6px;border:1px solid ${active ? '#0d9488' : '#e2e8f0'};
        background:${active ? '#0d9488' : 'white'};color:${active ? 'white' : disabled ? '#cbd5e1' : '#374151'};
        font-size:12px;font-weight:600;cursor:${disabled ? 'default' : 'pointer'};pointer-events:${disabled ? 'none' : 'auto'}"
        ${disabled ? 'disabled' : ''}>${label}</button>`;

    let pages = '';
    const showPages = new Set([1, totalPages, page, page-1, page-2, page+1, page+2].filter(p => p >= 1 && p <= totalPages));
    const sorted = [...showPages].sort((a,b) => a-b);
    let prev = 0;
    for (const p of sorted) {
      if (prev && p - prev > 1) pages += `<span style="color:#94a3b8;padding:0 4px;line-height:32px">…</span>`;
      pages += btn(p, p, false, p === page);
      prev = p;
    }

    return `<div style="display:flex;align-items:center;gap:6px;padding:10px 16px;border-top:1px solid #f1f5f9;flex-wrap:wrap">
      ${btn(page-1, '← Prev', page === 1)}
      ${pages}
      ${btn(page+1, 'Next →', page === totalPages)}
      <span style="font-size:12px;color:#94a3b8;margin-left:8px">
        Halaman <strong>${page}</strong> dari <strong>${totalPages}</strong>
        &nbsp;·&nbsp; Total <strong>${data.length}</strong> entri
        &nbsp;·&nbsp; Menampilkan ${start+1}–${Math.min(start+PAGE_SIZE, data.length)}
      </span>
    </div>`;
  }

  el.innerHTML = `
    <div class="table-container"><table>
      <thead><tr>
        <th style="width:160px">Waktu</th>
        <th style="width:90px">Modul</th>
        <th style="width:80px">Aksi</th>
        <th>User</th>
        <th style="width:120px">Role</th>
        <th>Detail</th>
        <th style="width:110px">IP Address</th>
        <th style="width:150px">Lokasi</th>
      </tr></thead>
      <tbody>${pageData.map(r => {
        const ac = (r.action||'').toUpperCase();
        const col = actionColor[ac] || '#64748b';
        const bg  = actionBg[ac]    || '#f8fafc';
        return `<tr>
          <td style="font-size:11.5px;color:#64748b;white-space:nowrap">${formatDateTime(r.created_at)}</td>
          <td><span style="font-size:11px;font-weight:700;background:#f1f5f9;color:#475569;padding:2px 8px;border-radius:20px">${r.module||'-'}</span></td>
          <td><span style="font-size:11px;font-weight:700;background:${bg};color:${col};padding:2px 8px;border-radius:20px;border:1px solid ${col}33">${ac||'-'}</span></td>
          <td style="font-size:12px"><div style="font-weight:600">${r.user_nama||'-'}</div><div style="font-size:11px;color:#94a3b8">${r.user_email||''}</div></td>
          <td style="font-size:12px;color:#64748b">${r.user_role||'-'}</td>
          <td style="font-size:12px;max-width:280px;word-break:break-word">${r.detail||'-'}</td>
          <td style="font-size:11px;color:#94a3b8">${r.ip_address||'-'}</td>
          <td style="font-size:11px;color:#64748b">${r.lokasi
            ? `<span style="display:flex;align-items:center;gap:4px"><span class="material-icons" style="font-size:12px;color:#0d9488">location_on</span>${r.lokasi}</span>`
            : '<span style="color:#cbd5e1">—</span>'}</td>
        </tr>`;
      }).join('')}
      </tbody>
    </table></div>
    ${buildPagination()}`;
}

function exportAuditTrail() {
  const data = window._auditTrailData;
  if (!data || !data.length) return toast('Tidak ada data untuk diekspor', 'warning');
  const headers = ['Waktu','Modul','Aksi','Email','Nama','Role','Detail','IP Address','Lokasi'];
  const rows = data.map(r => [
    formatDateTime(r.created_at), r.module||'', r.action||'',
    r.user_email||'', r.user_nama||'', r.user_role||'',
    r.detail||'', r.ip_address||'', r.lokasi||''
  ]);
  _downloadExcel('Audit_Trail', headers, rows);
}


// ============== EXCEL EXPORT HELPER (SpreadsheetML, no external lib) ==============
function _downloadExcel(filename, headers, rows) {
  const esc = v => String(v == null ? '' : v)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  let xml = '<?xml version="1.0" encoding="UTF-8"?>';
  xml += '<?mso-application progid="Excel.Sheet"?>';
  xml += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ';
  xml += 'xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">';
  xml += '<Styles>';
  xml += '<Style ss:ID="hdr"><Font ss:Bold="1" ss:Color="#FFFFFF"/>';
  xml += '<Interior ss:Color="#0D9488" ss:Pattern="Solid"/></Style>';
  xml += '<Style ss:ID="even"><Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/></Style>';
  xml += '</Styles>';
  xml += '<Worksheet ss:Name="Data"><Table>';

  xml += '<Row>';
  headers.forEach(h => { xml += `<Cell ss:StyleID="hdr"><Data ss:Type="String">${esc(h)}</Data></Cell>`; });
  xml += '</Row>';

  rows.forEach((row, ri) => {
    const style = ri % 2 === 1 ? ' ss:StyleID="even"' : '';
    xml += `<Row${style}>`;
    row.forEach(v => {
      const num = !isNaN(v) && v !== '' && v !== null;
      xml += `<Cell><Data ss:Type="${num ? 'Number' : 'String'}">${esc(v)}</Data></Cell>`;
    });
    xml += '</Row>';
  });

  xml += '</Table></Worksheet></Workbook>';

  const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename + '_' + new Date().toISOString().split('T')[0] + '.xls';
  a.click();
  URL.revokeObjectURL(url);
  toast('File Excel berhasil diunduh', 'success');
}


// ============== PENCARIAN GLOBAL ==============
let _searchTimeout = null;

function openGlobalSearch() {
  let modal = document.getElementById('globalSearchModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'globalSearchModal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;padding-top:80px;background:rgba(15,23,42,0.7);backdrop-filter:blur(4px)';
    modal.innerHTML = `
      <div style="width:100%;max-width:620px;margin:0 16px">
        <div style="background:white;border-radius:16px;box-shadow:0 24px 64px rgba(0,0,0,0.3);overflow:hidden">
          <div style="display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid #e2e8f0">
            <span class="material-icons" style="color:#0d9488;font-size:22px">search</span>
            <input id="globalSearchInput" type="text" placeholder="Cari puskesmas, usulan, user..."
              style="flex:1;border:none;outline:none;font-size:15px;font-family:inherit;color:#1e293b;background:transparent"
              oninput="doGlobalSearch(this.value)" onkeydown="handleSearchKey(event)">
            <button onclick="closeGlobalSearch()" style="background:none;border:none;cursor:pointer;color:#94a3b8;display:flex">
              <span class="material-icons">close</span>
            </button>
          </div>
          <div id="globalSearchResults" style="max-height:420px;overflow-y:auto;padding:8px 0">
            <div style="padding:24px;text-align:center;color:#94a3b8;font-size:13px">
              <span class="material-icons" style="font-size:32px;display:block;margin-bottom:8px">search</span>
              Ketik untuk mencari...
            </div>
          </div>
        </div>
        <div style="text-align:center;margin-top:10px;font-size:11px;color:rgba(255,255,255,0.5)">
          ESC untuk tutup &nbsp;·&nbsp; Enter untuk pilih hasil pertama
        </div>
      </div>`;
    modal.addEventListener('click', e => { if (e.target === modal) closeGlobalSearch(); });
    document.body.appendChild(modal);
  }
  modal.style.display = 'flex';
  setTimeout(() => document.getElementById('globalSearchInput')?.focus(), 50);
}

function closeGlobalSearch() {
  const modal = document.getElementById('globalSearchModal');
  if (modal) modal.style.display = 'none';
}

function handleSearchKey(e) {
  if (e.key === 'Escape') { closeGlobalSearch(); return; }
  if (e.key === 'Enter') {
    const first = document.querySelector('.search-result-item');
    if (first) first.click();
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    const items = document.querySelectorAll('.search-result-item');
    const focused = document.querySelector('.search-result-item:focus');
    if (!focused && items[0]) items[0].focus();
    else if (focused) {
      const next = [...items].indexOf(focused) + 1;
      if (items[next]) items[next].focus();
    }
  }
}

async function doGlobalSearch(q) {
  clearTimeout(_searchTimeout);
  const el = document.getElementById('globalSearchResults');
  if (!el) return;
  if (!q || q.trim().length < 2) {
    el.innerHTML = `<div style="padding:24px;text-align:center;color:#94a3b8;font-size:13px">
      <span class="material-icons" style="font-size:32px;display:block;margin-bottom:8px">search</span>
      Ketik minimal 2 karakter...
    </div>`;
    return;
  }

  el.innerHTML = `<div class="loading-state" style="padding:20px">${spinnerHTML('md')}<span style="font-size:13px;color:#94a3b8">Mencari...</span></div>`;

  _searchTimeout = setTimeout(async () => {
    const query = q.trim().toLowerCase();
    const results = [];

    try {
      // Search usulan
      const usulanList = await API.getUsulan({}).catch(() => []);
      (usulanList || []).forEach(u => {
        const haystack = [u.idUsulan, u.namaPKM, u.kodePKM, u.namaBulan, String(u.tahun), u.statusGlobal].join(' ').toLowerCase();
        if (haystack.includes(query)) {
          results.push({
            type: 'usulan', icon: 'assignment', color: '#0d9488',
            title: u.idUsulan,
            sub: `${u.namaPKM} · ${u.namaBulan} ${u.tahun} · ${u.statusGlobal}`,
            action: () => { closeGlobalSearch(); viewDetail(u.idUsulan); }
          });
        }
      });

      // Search puskesmas (hanya Admin)
      if (currentUser.role === 'Admin' || currentUser.role === 'Super Admin') {
        const pkmList = await API.getPKM().catch(() => []);
        (pkmList || []).forEach(p => {
          const haystack = [p.kode, p.nama].join(' ').toLowerCase();
          if (haystack.includes(query)) {
            results.push({
              type: 'puskesmas', icon: 'local_hospital', color: '#2563eb',
              title: p.nama,
              sub: `Kode: ${p.kode} · ${p.aktif ? 'Aktif' : 'Tidak Aktif'}`,
              action: () => { closeGlobalSearch(); loadPage('pkm'); }
            });
          }
        });

        // Search user
        const userList = await API.getUsers().catch(() => []);
        (userList || []).forEach(u => {
          const haystack = [u.email, u.nama, u.role, u.namaPKM].join(' ').toLowerCase();
          if (haystack.includes(query)) {
            results.push({
              type: 'user', icon: 'person', color: '#8b5cf6',
              title: u.nama || u.email,
              sub: `${u.role} · ${u.namaPKM || '-'} · ${u.email}`,
              action: () => { closeGlobalSearch(); loadPage('users'); }
            });
          }
        });
      }
    } catch(e) {}

    if (!results.length) {
      el.innerHTML = `<div style="padding:24px;text-align:center;color:#94a3b8;font-size:13px">
        <span class="material-icons" style="font-size:32px;display:block;margin-bottom:8px">search_off</span>
        Tidak ada hasil untuk "<strong style="color:#475569">${q}</strong>"
      </div>`;
      return;
    }

    const typeLabel = { usulan: 'Usulan', puskesmas: 'Puskesmas', user: 'User' };
    const grouped = {};
    results.forEach(r => { if (!grouped[r.type]) grouped[r.type] = []; grouped[r.type].push(r); });

    el.innerHTML = Object.entries(grouped).map(([type, items]) => `
      <div style="padding:6px 16px 2px;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px">
        ${typeLabel[type] || type} (${items.length})
      </div>
      ${items.slice(0, 5).map((r, i) => `
        <button class="search-result-item" tabindex="0"
          onclick="(${r.action.toString()})()"
          style="width:100%;display:flex;align-items:center;gap:12px;padding:10px 16px;background:none;border:none;cursor:pointer;text-align:left;transition:background 0.1s"
          onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='none'"
          onfocus="this.style.background='#f0fdf9'" onblur="this.style.background='none'">
          <div style="width:36px;height:36px;border-radius:10px;background:${r.color}18;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <span class="material-icons" style="font-size:18px;color:${r.color}">${r.icon}</span>
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:600;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.title}</div>
            <div style="font-size:11.5px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.sub}</div>
          </div>
          <span class="material-icons" style="font-size:16px;color:#cbd5e1">chevron_right</span>
        </button>`).join('')}
    `).join('');
  }, 300);
}

// Shortcut keyboard: Ctrl+K / Cmd+K
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    if (currentUser) openGlobalSearch();
  }
  if (e.key === 'Escape') closeGlobalSearch();
});



function _buildMasterShell() {
  const tabsHtml = _masterTabs.map(t => `
    <button id="masterTab_${t.id}" onclick="renderMasterData('${t.id}')"
      style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border:none;
             border-bottom:3px solid transparent;background:transparent;color:#64748b;
             font-weight:500;font-size:13px;cursor:pointer;transition:all 0.15s;white-space:nowrap">
      <span class="material-icons" style="font-size:16px">${t.icon}</span>${t.label}
    </button>`).join('');

  document.getElementById('mainContent').innerHTML = `
    <div class="page-header">
      <h1><span class="material-icons">storage</span>Master Data</h1>
    </div>
    <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.07);margin-bottom:16px">
      <div style="display:flex;gap:0;padding:0 8px;overflow-x:auto;border-bottom:1px solid #e2e8f0">
        ${tabsHtml}
      </div>
    </div>
    <div id="masterTabContent" style="min-height:200px"></div>`;
}

function _highlightMasterTab(activeId) {
  _masterTabs.forEach(t => {
    const btn = document.getElementById('masterTab_' + t.id);
    if (!btn) return;
    btn.style.borderBottomColor = t.id === activeId ? '#0d9488' : 'transparent';
    btn.style.color = t.id === activeId ? '#0d9488' : '#64748b';
    btn.style.fontWeight = t.id === activeId ? '700' : '500';
  });
}

// _renderIntoTab: panggil renderFn(el) dengan el = masterTabContent
// renderFn menerima el opsional; jika tidak, pakai mainContent sebagai fallback
async function _renderIntoTab(renderFn) {
  const tc = document.getElementById('masterTabContent');
  if (!tc) return;
  await renderFn(tc);
}// ============== TAB: KONFIGURASI PENANDATANGAN PER INDIKATOR ==============
// Tambahkan tab ini ke _masterTabs di app-master.js:
// { id: 'penandatangan', icon: 'assignment_ind', label: 'Penandatangan' }
//
// Tambahkan case ini di renderMasterData():
// } else if (activeTab === 'penandatangan') {
//   await renderPenandatanganTab(tc);
// }

async function renderPenandatanganTab(el) {
  const target = el || document.getElementById('masterTabContent');
  if (!target) return;

  target.innerHTML = loadingBlock('Memuat...');

  try {
    // Load semua data sekaligus
    const [indikatorList, jabatanList, savedConfig] = await Promise.all([
      API.get('indikator'),
      API.get('jabatan'),
      API.get('indikator-penandatangan'),
    ]);

    const inds = (indikatorList || []).filter(i => i.aktif);
    // Daftar jabatan PP dari master jabatan
    const jabatanOptions = (jabatanList || []).filter(j => j.aktif).sort((a,b) => a.nama.localeCompare(b.nama)).map(j => j.nama);

    target.innerHTML = `
      <div class="card">
        <div class="card-header-bar" style="justify-content:space-between">
          <span class="card-title">
            <span class="material-icons">assignment_ind</span>
            Konfigurasi Penandatangan Per Indikator
          </span>
          <span style="font-size:12px;color:#64748b">
            <span class="material-icons" style="font-size:14px;vertical-align:middle">info</span>
            Urutan jabatan = urutan tanda tangan di laporan PDF
          </span>
        </div>
        <div class="card-body" style="padding:0">
          <div id="penandatanganList"></div>
        </div>
      </div>`;

    const listEl = document.getElementById('penandatanganList');

    // Reset state, isi dari saved config
    window._penandatanganState = {};
    listEl.innerHTML = inds.map(ind => {
      const current = savedConfig[ind.no] || [];
      const currentJabatan = current.sort((a,b) => a.urutan - b.urutan).map(c => c.jabatan);
      window._penandatanganState[ind.no] = [...currentJabatan];
      return _renderPenandatanganRow(ind, currentJabatan, jabatanOptions);
    }).join('');

  } catch(e) {
    target.innerHTML = `<div class="empty-state"><span class="material-icons" style="color:#ef4444">error</span><p>${e.message}</p></div>`;
  }
}

function _renderPenandatanganRow(ind, currentJabatan, jabatanOptions) {
  // Checkbox grid — setiap jabatan jadi checkbox, checked = sudah dipilih
  const checkboxHtml = jabatanOptions.map(j => {
    const checked = currentJabatan.includes(j);
    const safeId = `pchk-${ind.no}-${j.replace(/[^a-zA-Z0-9]/g, '_')}`;
    return `
      <label for="${safeId}" style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:12px;color:#334155;transition:background .1s"
        onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='transparent'">
        <input type="checkbox" id="${safeId}" value="${j}"
          ${checked ? 'checked' : ''}
          onchange="_onPenandatanganCheck(${ind.no}, this)"
          style="width:15px;height:15px;accent-color:#0d9488;cursor:pointer;flex-shrink:0">
        <span>${j}</span>
      </label>`;
  }).join('');

  // Tags urutan yang sudah dipilih
  const tagsHtml = currentJabatan.map((j, i) => `
    <div id="ptag-${ind.no}-${i}" style="display:inline-flex;align-items:center;gap:4px;background:#e0f2fe;border:1px solid #7dd3fc;border-radius:20px;padding:3px 10px;font-size:12px;color:#0369a1;font-weight:600;margin:2px">
      <span style="background:#0369a1;color:white;border-radius:50%;width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;font-size:10px;flex-shrink:0">${i+1}</span>
      ${j}
      <button onclick="_uncheckPenandatangan(${ind.no}, '${j.replace(/'/g, "\\\'")}', ${i})" style="background:none;border:none;cursor:pointer;color:#0369a1;padding:0;display:flex;line-height:1;margin-left:2px">
        <span class="material-icons" style="font-size:14px">close</span>
      </button>
    </div>`).join('');

  return `
    <div id="prow-${ind.no}" style="border-bottom:1px solid #f1f5f9">
      <!-- Header row klik untuk expand/collapse -->
      <div onclick="_togglePenandatanganRow(${ind.no})"
        style="display:flex;align-items:center;justify-content:space-between;padding:14px 20px;cursor:pointer;user-select:none"
        onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
        <div style="display:flex;align-items:flex-start;gap:12px;flex:1;min-width:0">
          <div style="min-width:180px;flex:0 0 180px">
            <div style="font-weight:700;font-size:13px;color:#0f172a">Indikator ${ind.no}</div>
            <div style="font-size:12px;color:#64748b;margin-top:2px;line-height:1.4">${ind.nama}</div>
          </div>
          <div id="ptags-${ind.no}" style="display:flex;flex-wrap:wrap;gap:2px;align-items:center;flex:1;min-width:0">
            ${tagsHtml || '<span style="font-size:12px;color:#cbd5e1;font-style:italic">Belum ada penandatangan — klik untuk konfigurasi</span>'}
          </div>
        </div>
        <span class="material-icons" id="pchevron-${ind.no}" style="font-size:20px;color:#94a3b8;flex-shrink:0;margin-left:8px;transition:transform .2s">expand_more</span>
      </div>
      <!-- Panel checkbox (collapsed by default) -->
      <div id="ppanel-${ind.no}" style="display:none;padding:0 20px 16px 20px">
        <div style="border:1.5px solid #e2e8f0;border-radius:8px;padding:12px;background:#f8fafc;margin-bottom:10px">
          <div style="font-size:11.5px;font-weight:600;color:#64748b;margin-bottom:8px;display:flex;align-items:center;gap:4px">
            <span class="material-icons" style="font-size:14px">info</span>
            Pilih jabatan penandatangan (centang = tampil di laporan). Urutan sesuai tag di atas — hapus &amp; centang ulang untuk mengubah urutan.
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px">
            ${checkboxHtml}
          </div>
        </div>
        <div style="display:flex;justify-content:flex-end">
          <button class="btn btn-sm" onclick="_savePenandatangan(${ind.no})" style="background:#0284c7;color:white;border:none">
            <span class="material-icons">save</span>Simpan Indikator ${ind.no}
          </button>
        </div>
      </div>
    </div>`;
}

// State sementara
if (!window._penandatanganState) window._penandatanganState = {};

function _togglePenandatanganRow(noInd) {
  const panel   = document.getElementById(`ppanel-${noInd}`);
  const chevron = document.getElementById(`pchevron-${noInd}`);
  if (!panel) return;
  const open = panel.style.display !== 'none';
  panel.style.display   = open ? 'none' : 'block';
  chevron.style.transform = open ? '' : 'rotate(180deg)';
}

function _onPenandatanganCheck(noInd, checkbox) {
  const jabatan = checkbox.value;
  if (!window._penandatanganState[noInd]) window._penandatanganState[noInd] = [];
  const state = window._penandatanganState[noInd];
  if (checkbox.checked) {
    if (!state.includes(jabatan)) state.push(jabatan);
  } else {
    const idx = state.indexOf(jabatan);
    if (idx > -1) state.splice(idx, 1);
  }
  window._penandatanganState[noInd] = state;
  _refreshPenandatanganTags(noInd);
}

function _uncheckPenandatangan(noInd, jabatan, idx) {
  const state = window._penandatanganState[noInd] || [];
  state.splice(idx, 1);
  window._penandatanganState[noInd] = state;
  _refreshPenandatanganTags(noInd);
  // Uncheck checkbox-nya
  const safeId = `pchk-${noInd}-${jabatan.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const chk = document.getElementById(safeId);
  if (chk) chk.checked = false;
}

function _refreshPenandatanganTags(noInd) {
  const tagsEl = document.getElementById(`ptags-${noInd}`);
  if (!tagsEl) return;
  const state = window._penandatanganState[noInd] || [];
  if (!state.length) {
    tagsEl.innerHTML = '<span style="font-size:12px;color:#cbd5e1;font-style:italic">Belum ada penandatangan — klik untuk konfigurasi</span>';
    return;
  }
  tagsEl.innerHTML = state.map((j, i) => `
    <div id="ptag-${noInd}-${i}" style="display:inline-flex;align-items:center;gap:4px;background:#e0f2fe;border:1px solid #7dd3fc;border-radius:20px;padding:3px 10px;font-size:12px;color:#0369a1;font-weight:600;margin:2px">
      <span style="background:#0369a1;color:white;border-radius:50%;width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;font-size:10px;flex-shrink:0">${i+1}</span>
      ${j}
      <button onclick="event.stopPropagation();_uncheckPenandatangan(${noInd}, '${j.replace(/'/g, "\\\'")}', ${i})" style="background:none;border:none;cursor:pointer;color:#0369a1;padding:0;display:flex;line-height:1;margin-left:2px">
        <span class="material-icons" style="font-size:14px">close</span>
      </button>
    </div>`).join('');
}

async function _savePenandatangan(noInd) {
  if (!window._penandatanganState[noInd]) window._penandatanganState[noInd] = [];
  const state = window._penandatanganState[noInd] || [];
  try {
    await API.post('indikator-penandatangan', { noIndikator: noInd, jabatanList: state });
    toast(`Konfigurasi Indikator ${noInd} berhasil disimpan!`, 'success');
  } catch(e) {
    toast('Gagal simpan: ' + e.message, 'error');
  }
}
