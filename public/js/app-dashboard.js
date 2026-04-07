// ============== DASHBOARD ==============

// Ambil daftar tahun yang tersedia dari semua usulan (dipakai filter dashboard)
let _dashTahunList = [];
async function _loadDashTahunList() {
  if (_dashTahunList.length) return _dashTahunList;
  try {
    const rows = await API.getUsulan({});
    const tahunSet = [...new Set((rows || []).map(u => u.tahun).filter(Boolean))].sort((a,b) => b - a);
    _dashTahunList = tahunSet;
  } catch(e) { _dashTahunList = [CURRENT_YEAR]; }
  return _dashTahunList;
}

async function renderDashboard() {
  const role = currentUser.role;

  // Baca tahun yang dipilih dari dropdown (jika sudah ada), default CURRENT_YEAR
  const selEl = document.getElementById('dashTahunFilter');
  const tahunDipilih = selEl ? (parseInt(selEl.value) || '') : '';

  const params = { role, email: currentUser.email, kode_pkm: currentUser.kodePKM };
  if (tahunDipilih) params.tahun = tahunDipilih;

  let data;
  try { data = await API.dashboard(params); } catch (e) {
    toast(e.message, 'error'); return;
  }

  const content = document.getElementById('mainContent');

  try {
    if (role === 'Admin') renderAdminDashboard(content, data, tahunDipilih);
    else if (role === 'Operator') renderOperatorDashboard(content, data, tahunDipilih);
    else if (role === 'Kepala Puskesmas') renderKepalasDashboard(content, data, tahunDipilih);
    else if (role === 'Pengelola Program') renderProgramDashboard(content, data, tahunDipilih);

  } catch(e) {
    console.error('renderDashboard error:', e);
    content.innerHTML = `<div class="empty-state"><span class="material-icons" style="color:#ef4444">error</span><p>Error: ${e.message}</p></div>`;
  }
}

// Render dropdown filter tahun di page-header dashboard
async function _renderDashTahunDropdown(selectedTahun) {
  const list = await _loadDashTahunList();
  // Pastikan CURRENT_YEAR selalu ada di list
  const allTahun = [...new Set([...list, CURRENT_YEAR])].sort((a,b) => b - a);
  return `<select id="dashTahunFilter" onchange="renderDashboard()"
    style="border:1px solid var(--border,#e2e8f0);border-radius:7px;padding:5px 10px;font-size:12px;outline:none;font-family:inherit;background:var(--surface,white);color:var(--text);cursor:pointer">
    <option value="">Semua Tahun</option>
    ${allTahun.map(t => `<option value="${t}" ${t == selectedTahun ? 'selected' : ''}>${t}</option>`).join('')}
  </select>`;
}

function renderAdminDashboard(el, d, tahunDipilih) {
  const chartMode = d.chartMode || (tahunDipilih ? 'bulan' : 'tahun');
  const chartTitle = tahunDipilih
    ? `Statistik per Bulan (${tahunDipilih})`
    : `Statistik per Tahun`;
  el.innerHTML = `
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:14px">
      <h1 style="margin:0"><span class="material-icons">dashboard</span>Dashboard</h1>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:12px;color:var(--text-light);font-weight:600">Filter Tahun:</span>
        <div id="dashTahunWrap"><select id="dashTahunFilter" onchange="renderDashboard()"
          style="border:1px solid var(--border,#e2e8f0);border-radius:7px;padding:5px 10px;font-size:12px;outline:none;font-family:inherit;background:var(--surface,white);color:var(--text);cursor:pointer">
          <option value="">Memuat...</option>
        </select></div>
      </div>
    </div>
    <div class="stats-grid">
      ${statCard('blue','assignment','Total Usulan', d.totalUsulan, d.totalUsulan > 0 ? `${d.selesai} selesai · ${d.menunggu} proses` : 'Belum ada usulan')}
      ${statCard('green','check_circle','Selesai', d.selesai, d.totalUsulan > 0 ? `${Math.round((d.selesai/d.totalUsulan)*100)}% dari total` : '-')}
      ${statCard('orange','pending','Menunggu Verifikasi', d.menunggu, d.menunggu > 0 ? 'Perlu tindakan' : 'Semua tertangani')}
      ${statCard('purple','local_hospital','Puskesmas Aktif', d.puskesmasAktif, 'Terdaftar & aktif')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:stretch;margin-bottom:14px">
      <div class="card" style="margin:0;display:flex;flex-direction:column">
        <div class="card-header-bar">
          <span class="card-title"><span class="material-icons">timeline</span>${chartTitle}</span>
        </div>
        <div class="card-body" style="padding:12px 16px;flex:1;display:flex;flex-direction:column;justify-content:center">
          <div style="display:flex;align-items:flex-end;gap:16px">
            <div style="flex:1;min-width:0">
              ${renderChart(d.chartData, chartMode)}
            </div>
            <div style="flex-shrink:0;border-left:1px solid var(--border);padding-left:16px">
              ${renderDonutChart(d.selesai||0, d.menunggu||0, Math.max(0,(d.totalUsulan||0)-(d.selesai||0)-(d.menunggu||0)))}
            </div>
          </div>
        </div>
      </div>
      <div class="card" style="margin:0;display:flex;flex-direction:column">
        <div class="card-header-bar">
          <span class="card-title"><span class="material-icons">bar_chart</span>Ringkasan Status</span>
        </div>
        <div class="card-body" style="padding:12px 14px;flex:1;display:flex;flex-direction:column;justify-content:center">
          ${renderStatusSummary(d)}
        </div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:stretch;margin-bottom:14px">
      <div class="card" style="margin:0">
        <div class="card-header-bar">
          <span class="card-title"><span class="material-icons">pending_actions</span>Menunggu Verifikasi Admin</span>
          <button class="btn btn-secondary btn-sm" onclick="loadPage('verifikasi')">
            <span class="material-icons">arrow_forward</span>Lihat Semua
          </button>
        </div>
        <div class="card-body" style="padding:0">
          <div id="adminPendingTable"><div class="loading-state"><div class="spm-spinner lg"><div class="sr1"></div><div class="sr2"></div><div class="sr3"></div></div><p>Memuat data...</p></div></div>
        </div>
      </div>
      <div class="card" style="margin:0">
        <div class="card-header-bar">
          <span class="card-title"><span class="material-icons">local_hospital</span>Progress per Puskesmas</span>
          <button class="btn btn-secondary btn-sm" onclick="loadPage('verifikasi')">
            <span class="material-icons">arrow_forward</span>Lihat Semua Usulan
          </button>
        </div>
        <div class="card-body" style="padding:0" id="pkmProgressTable">
          <div class="loading-state"><div class="spm-spinner lg"><div class="sr1"></div><div class="sr2"></div><div class="sr3"></div></div><p>Memuat data...</p></div>
        </div>
      </div>
    </div>
    <div class="card" style="margin:0">
      <div class="card-header-bar" style="flex-wrap:wrap;gap:8px">
        <span class="card-title"><span class="material-icons">history</span>Semua Usulan Terbaru</span>
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-left:auto">
          <input id="adminAllSearch" type="text" placeholder="Cari ID / Puskesmas..."
            oninput="filterAdminAllUsulan()"
            style="border:1px solid var(--border,#e2e8f0);border-radius:7px;padding:5px 10px;font-size:12px;width:150px;outline:none;font-family:inherit;color:var(--text);background:var(--surface,white)" />
          <select id="adminAllFilterPKM" onchange="filterAdminAllUsulan()"
            style="border:1px solid var(--border,#e2e8f0);border-radius:7px;padding:5px 10px;font-size:12px;outline:none;font-family:inherit;background:var(--surface,white);color:var(--text)">
            <option value="">Semua Puskesmas</option>
          </select>
          <select id="adminAllFilterTahun" onchange="filterAdminAllUsulan()"
            style="border:1px solid var(--border,#e2e8f0);border-radius:7px;padding:5px 10px;font-size:12px;outline:none;font-family:inherit;background:var(--surface,white);color:var(--text)">
            <option value="">Semua Tahun</option>
          </select>
          <select id="adminAllFilterStatus" onchange="filterAdminAllUsulan()"
            style="border:1px solid var(--border,#e2e8f0);border-radius:7px;padding:5px 10px;font-size:12px;outline:none;font-family:inherit;background:var(--surface,white);color:var(--text)">
            <option value="">Semua Status</option>
          </select>
        </div>
      </div>
      <div class="card-body" style="padding:0">
        <div id="adminAllUsulanTable">
          <div class="loading-state"><div class="spm-spinner lg"><div class="sr1"></div><div class="sr2"></div><div class="sr3"></div></div><p>Memuat data...</p></div>
        </div>
      </div>
    </div>`;

  // Populate dropdown tahun (async, setelah HTML di-render)
  _loadDashTahunList().then(list => {
    const sel = document.getElementById('dashTahunFilter');
    if (!sel) return;
    const allTahun = [...new Set([...list, CURRENT_YEAR])].sort((a,b) => b - a);
    sel.innerHTML = `<option value="">Semua Tahun</option>`
      + allTahun.map(t => `<option value="${t}" ${t == tahunDipilih ? 'selected' : ''}>${t}</option>`).join('');
  });

  // Load usulan menunggu Admin
  API.getUsulan({ awaiting_admin: 'true' }).then(rows => {
    const el = document.getElementById('adminPendingTable');
    if (!el) return;
    if (!rows || !rows.length) {
      el.innerHTML = `<div class="empty-state" style="padding:32px"><span class="material-icons">check_circle</span><p>Tidak ada usulan yang menunggu verifikasi</p></div>`;
      return;
    }
    const renderAdminPendingPaged = (pg) => {
      const el2 = document.getElementById('adminPendingTable');
      if (!el2) return;
      const { items, page: p, totalPages, total } = paginateDash(rows, pg);
      el2.innerHTML = renderUsulanTable(items, 'admin')
        + renderPagination('adminPendingTable', total, p, totalPages, `pg => window._adminPendingGoTo(pg)`);
    };
    window._adminPendingGoTo = (pg) => renderAdminPendingPaged(pg);
    renderAdminPendingPaged(1);
  }).catch(() => {
    const el = document.getElementById('adminPendingTable');
    if (el) el.innerHTML = `<div class="empty-state" style="padding:32px"><span class="material-icons">inbox</span><p>Gagal memuat data</p></div>`;
  });

  // Load progress per PKM — ikut filter tahun (Semua Tahun = tanpa filter)
  const _pkmTahunParam = tahunDipilih ? { tahun: tahunDipilih } : {};
  API.getUsulan(_pkmTahunParam).then(rows => {
    renderPKMProgressTable(rows);
  }).catch(() => {});

  // Load semua usulan terbaru (Admin)
  loadAdminAllUsulan();
}

// ===== ADMIN: SEMUA USULAN =====

async function loadAdminAllUsulan() {
  const el = document.getElementById('adminAllUsulanTable');
  if (!el) return;
  el.innerHTML = `<div class="loading-state"><div class="spm-spinner lg"><div class="sr1"></div><div class="sr2"></div><div class="sr3"></div></div><p>Memuat data...</p></div>`;
  try {
    const rows = await API.getUsulan({});
    _adminAllUsulanData = rows || [];
    renderAdminAllUsulanTable(_adminAllUsulanData);
    // Populate filter puskesmas
    const pkmSet = [...new Set(_adminAllUsulanData.map(u => u.namaPKM || u.kodePKM).filter(Boolean))].sort();
    const pkmSel = document.getElementById('adminAllFilterPKM');
    if (pkmSel) {
      pkmSel.innerHTML = `<option value="">Semua Puskesmas</option>` + pkmSet.map(p => `<option value="${p}">${p}</option>`).join('');
    }
    // Populate filter tahun
    const tahunSet = [...new Set(_adminAllUsulanData.map(u => u.tahun).filter(Boolean))].sort((a,b) => b - a);
    const tahunSel = document.getElementById('adminAllFilterTahun');
    if (tahunSel) {
      tahunSel.innerHTML = `<option value="">Semua Tahun</option>` + tahunSet.map(t => `<option value="${t}">${t}</option>`).join('');
    }
    // Populate filter status — hanya tampilkan status yang benar-benar ada di data
    const statusOrder = ['Draft','Menunggu Kepala Puskesmas','Menunggu Pengelola Program','Menunggu Admin','Selesai','Ditolak','Ditolak Sebagian'];
    const statusSet = new Set(_adminAllUsulanData.map(u => u.statusGlobal).filter(Boolean));
    const statusSorted = statusOrder.filter(s => statusSet.has(s));
    statusSet.forEach(s => { if (!statusSorted.includes(s)) statusSorted.push(s); });
    const statusSel = document.getElementById('adminAllFilterStatus');
    if (statusSel) {
      statusSel.innerHTML = `<option value="">Semua Status</option>` + statusSorted.map(s => `<option value="${s}">${s}</option>`).join('');
    }
  } catch(e) {
    el.innerHTML = `<div class="empty-state" style="padding:32px"><span class="material-icons">inbox</span><p>Gagal memuat data</p></div>`;
  }
}

function filterAdminAllUsulan() {
  _adminAllPage = 1; // reset ke halaman pertama saat filter berubah
  const pkmVal    = (document.getElementById('adminAllFilterPKM')?.value    || '').toLowerCase();
  const statusVal = (document.getElementById('adminAllFilterStatus')?.value  || '').toLowerCase();
  const tahunVal  = (document.getElementById('adminAllFilterTahun')?.value   || '');
  const searchVal = (document.getElementById('adminAllSearch')?.value  || '').toLowerCase();

  const filtered = _adminAllUsulanData.filter(u => {
    const nama = (u.namaPKM || u.kodePKM || '').toLowerCase();
    const status = (u.statusGlobal || '').toLowerCase();
    const tahun  = String(u.tahun || '');
    const id     = (u.idUsulan || '').toLowerCase();
    const periode = (u.namaBulan || '').toLowerCase();
    if (pkmVal    && !nama.includes(pkmVal))       return false;
    if (statusVal && !status.includes(statusVal))  return false;
    if (tahunVal  && tahun !== tahunVal)            return false;
    if (searchVal && !id.includes(searchVal) && !nama.includes(searchVal) && !periode.includes(searchVal)) return false;
    return true;
  });
  renderAdminAllUsulanTable(filtered);
}

let _adminAllUsulanData = [];
let _adminAllPage = 1;

function renderAdminAllUsulanTable(rows) {
  const el = document.getElementById('adminAllUsulanTable');
  if (!el) return;
  if (!rows || !rows.length) {
    el.innerHTML = `<div class="empty-state" style="padding:32px"><span class="material-icons">search_off</span><p>Tidak ada data yang sesuai filter</p></div>`;
    return;
  }
  const { items, page: p, totalPages, total } = paginateDash(rows, _adminAllPage);
  el.innerHTML = renderUsulanTable(items, 'admin')
    + renderPagination('adminAllUsulanTable', total, p, totalPages, `pg => { _adminAllPage=pg; filterAdminAllUsulan(); }`, DASH_ITEMS_PER_PAGE);
}

function renderStatusSummary(d) {
  const _dk = document.documentElement.getAttribute('data-theme') === 'dark';
  const total    = d.totalUsulan || 0;
  const selesai  = d.selesai || 0;
  const menunggu = d.menunggu || 0;
  const ditolak  = Math.max(0, total - selesai - menunggu);
  const items = [
    { label: 'Selesai',       val: selesai,  color: '#10b981', bg: _dk ? 'rgba(16,185,129,0.12)'  : '#ecfdf5' },
    { label: 'Dalam Proses',  val: menunggu, color: '#f59e0b', bg: _dk ? 'rgba(245,158,11,0.12)'  : '#fffbeb' },
    { label: 'Ditolak/Draft', val: ditolak,  color: '#ef4444', bg: _dk ? 'rgba(239,68,68,0.12)'   : '#fef2f2' },
  ];
  return `
    <div style="display:flex;flex-direction:column;gap:8px">
      ${items.map(it => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:${it.bg};border-radius:8px;border-left:3px solid ${it.color}">
          <span style="font-size:12.5px;font-weight:600;color:var(--text)">${it.label}</span>
          <span style="font-size:16px;font-weight:900;color:${it.color}">${it.val}</span>
        </div>`).join('')}
    </div>`;
}


let _pkmProgressData = [];
let _pkmProgressPage = 1;

function renderPKMProgressTable(rows) {
  _pkmProgressData = rows || [];
  _pkmProgressPage = 1;
  _renderPKMProgressPaged(_pkmProgressPage);
}

function _renderPKMProgressPaged(pg) {
  const el = document.getElementById('pkmProgressTable');
  if (!el) return;
  if (!_pkmProgressData || _pkmProgressData.length === 0) {
    el.innerHTML = `<div class="empty-state" style="padding:32px"><span class="material-icons">inbox</span><p>Belum ada data</p></div>`;
    return;
  }
  const map = {};
  _pkmProgressData.forEach(u => {
    const k = u.kodePKM || u.kode_pkm || '-';
    const n = u.namaPKM || u.nama_puskesmas || k;
    if (!map[k]) map[k] = { nama: n, total: 0, selesai: 0, menunggu: 0, ditolak: 0 };
    map[k].total++;
    if (u.statusGlobal === 'Selesai') map[k].selesai++;
    else if (['Ditolak','Ditolak Sebagian'].includes(u.statusGlobal)) map[k].ditolak++;
    else map[k].menunggu++;
  });
  const allPkms = Object.values(map).sort((a,b) => b.total - a.total);
  const { items: pkms, page: p, totalPages, total } = paginateDash(allPkms, pg);
  _pkmProgressPage = p;
  window._pkmProgressGoTo = (newPg) => { _pkmProgressPage = newPg; _renderPKMProgressPaged(newPg); };
  el.innerHTML = `<table>
    <thead><tr>
      <th>Puskesmas</th>
      <th style="text-align:center">Total</th>
      <th style="text-align:center">Selesai</th>
      <th style="text-align:center">Proses</th>
      <th style="text-align:center">Ditolak</th>
      <th style="min-width:120px">Progres</th>
    </tr></thead>
    <tbody>${pkms.map(pkm => {
      const pct = pkm.total > 0 ? Math.round((pkm.selesai / pkm.total) * 100) : 0;
      const barColor = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';
      return `<tr>
        <td style="font-weight:600;font-size:13px">${pkm.nama}</td>
        <td style="text-align:center">${pkm.total}</td>
        <td style="text-align:center"><span style="color:#10b981;font-weight:700">${pkm.selesai}</span></td>
        <td style="text-align:center"><span style="color:#f59e0b;font-weight:700">${pkm.menunggu}</span></td>
        <td style="text-align:center"><span style="color:#ef4444;font-weight:700">${pkm.ditolak}</span></td>
        <td>
          <div style="display:flex;align-items:center;gap:7px">
            <div style="flex:1;height:6px;border-radius:99px;background:#e2e8f0;overflow:hidden">
              <div style="height:100%;width:${pct}%;background:${barColor};border-radius:99px;transition:width 0.6s ease"></div>
            </div>
            <span style="font-size:11px;font-weight:700;color:${barColor};min-width:30px;text-align:right">${pct}%</span>
          </div>
        </td>
      </tr>`;
    }).join('')}</tbody>
  </table>`
  + renderPagination('pkmProgressTable', total, p, totalPages, `pg => window._pkmProgressGoTo(pg)`, DASH_ITEMS_PER_PAGE);
}


function renderOperatorStatusSummary(rows) {
  const total   = rows.length;
  if (total === 0) return `<div class="empty-state" style="padding:16px"><span class="material-icons">inbox</span><p>Belum ada usulan</p></div>`;
  const selesai = rows.filter(u => u.statusGlobal === 'Selesai').length;
  const ditolak = rows.filter(u => ['Ditolak','Ditolak Sebagian'].includes(u.statusGlobal)).length;
  const proses  = rows.filter(u => !['Selesai','Ditolak','Ditolak Sebagian','Draft'].includes(u.statusGlobal)).length;
  const draft   = rows.filter(u => u.statusGlobal === 'Draft').length;
  // Dual bar: selesai (hijau tua) + sudah diajukan/dalam proses (hijau muda)
  const items = [
    { label: 'Selesai',      val: selesai, color: '#10b981' },
    { label: 'Dalam Proses', val: proses,  color: '#f59e0b' },
    { label: 'Ditolak',      val: ditolak, color: '#ef4444' },
    { label: 'Draft',        val: draft,   color: '#94a3b8' },
  ];
  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      ${items.map(it => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--surface-alt,var(--surface));border-radius:8px;border:1.5px solid var(--border);border-left:3px solid ${it.color}">
          <span style="font-size:12px;font-weight:600;color:var(--text-light)">${it.label}</span>
          <span style="font-size:16px;font-weight:900;color:${it.color};">${it.val}</span>
        </div>`).join('')}
    </div>`;
}

function
renderKapusStatusSummary(rows) {
  const total   = rows.length;
  if (total === 0) return `<div class="empty-state" style="padding:16px"><span class="material-icons">inbox</span><p>Belum ada usulan</p></div>`;
  const selesai = rows.filter(u => u.statusGlobal === 'Selesai').length;
  const menungguKapus = rows.filter(u => u.statusGlobal === 'Menunggu Kepala Puskesmas').length;
  const proses  = rows.filter(u => !['Selesai','Ditolak','Ditolak Sebagian','Draft','Menunggu Kepala Puskesmas'].includes(u.statusGlobal)).length;
  const ditolak = rows.filter(u => ['Ditolak','Ditolak Sebagian'].includes(u.statusGlobal)).length;
  // FIX (b): Hitung dua segmen progress bar:
  // - Selesai (hijau tua) = sudah final
  // - Sudah melewati Kapus/lanjut ke PP atau Admin (hijau muda) = sudah diverifikasi Kapus
  const items = [
  ];
  const _dk = document.documentElement.getAttribute('data-theme') === 'dark';
  const _items = [
    { label: 'Selesai',            val: selesai,       color: '#10b981', bg: _dk ? 'rgba(16,185,129,0.12)'  : '#ecfdf5' },
    { label: 'Menunggu Saya',      val: menungguKapus, color: '#f59e0b', bg: _dk ? 'rgba(245,158,11,0.12)'  : '#fffbeb' },
    { label: 'Lanjut ke PP/Admin', val: proses,        color: '#0d9488', bg: _dk ? 'rgba(13,148,136,0.12)'  : '#f0fdfa' },
    { label: 'Ditolak',            val: ditolak,       color: '#ef4444', bg: _dk ? 'rgba(239,68,68,0.12)'   : '#fef2f2' },
  ];
  return `
    <div style="display:flex;flex-direction:column;gap:8px">
      ${_items.map(it => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:${it.bg};border-radius:8px;border-left:3px solid ${it.color}">
          <span style="font-size:12px;font-weight:600;color:var(--text)">${it.label}</span>
          <span style="font-size:16px;font-weight:900;color:${it.color};">${it.val}</span>
        </div>`).join('')}
    </div>`;
}

function
renderOperatorDashboard(el, d, tahunDipilih) {
  const periodeList = (d.periodeAktifList || (d.periodeAktif ? [d.periodeAktif] : [])).filter(p => p.isAktifToday);
  const periodeLabel = periodeList.length > 0 ? periodeList.length : '-';

  el.innerHTML = `
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:14px">
      <h1 style="margin:0"><span class="material-icons">dashboard</span>Dashboard</h1>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:12px;color:var(--text-light);font-weight:600">Filter Tahun:</span>
        <select id="dashTahunFilter" onchange="renderDashboard()"
          style="border:1px solid var(--border,#e2e8f0);border-radius:7px;padding:5px 10px;font-size:12px;outline:none;font-family:inherit;background:var(--surface,white);color:var(--text);cursor:pointer">
          <option value="">Memuat...</option>
        </select>
      </div>
    </div>
    <div class="stats-grid">
      ${statCard("blue","assignment","Total Usulan Saya", d.totalUsulan)}
      ${statCard("green","check_circle","Selesai/Disetujui", d.disetujui)}
      ${statCard("orange","pending","Dalam Proses", d.menunggu)}
      ${statCard('cyan','event_available','Periode Aktif', periodeLabel)}
    </div>
    ${renderPeriodeBanner(periodeList)}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:stretch;margin-bottom:14px">
      <div class="card" style="margin:0;display:flex;flex-direction:column">
        <div class="card-header-bar">
          <span class="card-title"><span class="material-icons">quickreply</span>Aksi Cepat</span>
        </div>
        <div class="card-body" style="display:flex;flex-direction:column;gap:10px;flex:1;justify-content:center">
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button class="btn btn-primary" onclick="loadPage('input')"><span class="material-icons">add</span>Buat Usulan Baru</button>
            <button class="btn btn-secondary" onclick="loadPage('laporan')"><span class="material-icons">bar_chart</span>Lihat Laporan</button>
          </div>
        </div>
      </div>
      <div class="card" style="margin:0;display:flex;flex-direction:column">
        <div class="card-header-bar">
          <span class="card-title"><span class="material-icons">donut_large</span>Status Usulan Saya</span>
        </div>
        <div class="card-body" style="padding:12px 14px;flex:1" id="operatorStatusSummary">
          <div class="loading-state"><div class="spm-spinner lg"><div class="sr1"></div><div class="sr2"></div><div class="sr3"></div></div><p>Memuat...</p></div>
        </div>
      </div>
    </div>
    <div class="card" style="margin-top:14px">
      <div class="card-header-bar"><span class="card-title"><span class="material-icons">history</span>Usulan Terbaru Saya</span></div>
      <div class="card-body" style="padding:0" id="recentTable"></div>
    </div>`;

  // Populate dropdown tahun
  _loadDashTahunList().then(list => {
    const sel = document.getElementById('dashTahunFilter');
    if (!sel) return;
    const allTahun = [...new Set([...list, CURRENT_YEAR])].sort((a,b) => b - a);
    sel.innerHTML = `<option value="">Semua Tahun</option>`
      + allTahun.map(t => `<option value="${t}" ${t == tahunDipilih ? 'selected' : ''}>${t}</option>`).join('');
  });

  const _opTahunParam = { email_operator: currentUser.email };
  if (tahunDipilih) _opTahunParam.tahun = tahunDipilih;
  API.getUsulan(_opTahunParam).then(rows => {
    document.getElementById("recentTable").innerHTML = renderUsulanTable(rows.slice(0, 5), "operator");
    const el2 = document.getElementById("operatorStatusSummary");
    if (el2) el2.innerHTML = renderOperatorStatusSummary(rows);
  }).catch(() => {
    const el2 = document.getElementById("recentTable");
    if (el2) el2.innerHTML = `<div class="empty-state" style="padding:32px"><span class="material-icons">inbox</span><p>Belum ada data usulan</p></div>`;
  });
}

async function downloadLaporanDashboardOperator() {
  try {
    const rows = await API.getUsulan({ email_operator: currentUser.email, status: "Selesai" });
    if (!rows || !rows.length) { toast("Belum ada laporan yang selesai diverifikasi", "warning"); return; }
    await downloadLaporanPDF(rows[0].idUsulan);
  } catch(e) { toast(e.message, "error"); }
}
function renderPeriodeBanner(periodeList) {
  if (!periodeList || !periodeList.length) {
    return `
      <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin-bottom:14px">
        <div style="background:var(--warning-light,linear-gradient(135deg,#fffbeb,#fef3c7));border:1.5px solid var(--border,#fcd34d);border-radius:12px;padding:16px 18px;display:flex;align-items:center;gap:14px;box-shadow:0 2px 8px rgba(245,158,11,0.10)">
          <div style="width:42px;height:42px;border-radius:10px;background:var(--warning-light,#fef9c3);border:1.5px solid var(--border,#fde68a);display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <span class="material-icons" style="font-size:22px;color:#d97706">event_busy</span>
          </div>
          <div>
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#92400e;margin-bottom:2px">Periode Input</div>
            <div style="font-size:13px;font-weight:700;color:#78350f">Tidak Ada Periode Aktif</div>
            <div style="font-size:11px;color:#b45309;margin-top:2px">Hubungi Admin untuk membuka periode.</div>
          </div>
        </div>
      </div>`;
  }
  const svgCal = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
  const svgOpen = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
  const svgClose = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
  const svgNotif = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>';
  const items = periodeList.map((p, idx) => {
    const nm = p.namaBulan || p.nama_bulan || '';
    const thn = p.tahun || '';
    const mulai = formatDate(p.tanggalMulai || p.tanggal_mulai);
    const selesai = formatDate(p.tanggalSelesai || p.tanggal_selesai);
    const jm = fmt24(p.jamMulai || p.jam_mulai) || '08:00';
    const js = fmt24(p.jamSelesai || p.jam_selesai) || '17:00';
    const notif = p.notifOperator || p.notif_operator || '';
    const timerId = `periodeTimer_${idx}`;
    return `<div style="border:1.5px solid #a7f3d0;border-radius:10px;overflow:hidden;background:var(--surface,white);box-shadow:0 1px 4px rgba(13,148,136,0.08)">
      <div style="background:linear-gradient(135deg,#0d9488,#06b6d4);padding:8px 14px;color:white;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:space-between;gap:7px">
        <span style="display:flex;align-items:center;gap:7px"><span style="opacity:0.9;display:flex">${svgCal}</span> Periode Aktif: ${nm} ${thn}</span>
        <span id="${timerId}" style="font-size:11px;font-weight:700;background:rgba(0,0,0,0.2);padding:3px 8px;border-radius:20px;letter-spacing:0.3px;white-space:nowrap">--:--:--</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0">
        <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--success-light,#f0fdf9);border-right:1px solid var(--border,#d1fae5)">
          <span style="color:#0d9488;display:flex;flex-shrink:0">${svgOpen}</span>
          <div>
            <div style="font-size:10px;color:var(--text-light,#64748b);font-weight:600;text-transform:uppercase;letter-spacing:0.4px">Dibuka</div>
            <div style="font-size:12px;font-weight:700;color:var(--text,#0f172a);">${mulai} <span style="letter-spacing:0.03em">${jm}</span> WITA</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--danger-light,#fef2f2)">
          <span style="color:#ef4444;display:flex;flex-shrink:0">${svgClose}</span>
          <div>
            <div style="font-size:10px;color:var(--text-light,#64748b);font-weight:600;text-transform:uppercase;letter-spacing:0.4px">Ditutup</div>
            <div style="font-size:12px;font-weight:700;color:var(--text,#0f172a);">${selesai} <span style="letter-spacing:0.03em">${js}</span> WITA</div>
          </div>
        </div>
      </div>
      ${notif ? `<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 14px;background:var(--warning-light,#fffbeb);border-top:1px solid var(--border,#fcd34d)"><span style="color:#d97706;display:flex;flex-shrink:0;margin-top:1px">${svgNotif}</span><div style="font-size:12px;color:#0f172a;line-height:1.5">${notif}</div></div>` : ''}
    </div>`;
  }).join('');
  const html = `<div style="margin-bottom:14px"><div class="card" style="margin:0"><div class="card-header-bar"><span class="card-title" style="display:flex;align-items:center;gap:7px"><span style="color:#0d9488;display:flex">${svgCal}</span> Periode Input Aktif</span></div><div class="card-body"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px">${items}</div></div></div></div>`;

  // Jalankan timer setelah HTML di-render ke DOM
  setTimeout(() => {
    window._periodeTimers = window._periodeTimers || [];
    window._periodeTimers.forEach(t => clearInterval(t));
    window._periodeTimers = [];
    periodeList.forEach((p, idx) => {
      const js = fmt24(p.jamSelesai || p.jam_selesai) || '17:00';
      const _tglRaw = p.tanggalSelesai || p.tanggal_selesai || '';
      const _tglDate = _tglRaw ? new Date(_tglRaw) : null;
      if (!_tglDate || isNaN(_tglDate)) return;
      const [jsH, jsM] = js.split(':').map(Number);
      // Ambil tanggal dalam WITA (+8) — hindari off-by-one jika DB simpan UTC midnight
      const _witaMs = _tglDate.getTime() + 8 * 3600000;
      const _witaDate = new Date(_witaMs);
      const _tglWITA = _witaDate.getUTCFullYear() + '-'
        + String(_witaDate.getUTCMonth()+1).padStart(2,'0') + '-'
        + String(_witaDate.getUTCDate()).padStart(2,'0');
      const deadline = new Date(_tglWITA + 'T' + String(jsH).padStart(2,'0') + ':' + String(jsM).padStart(2,'0') + ':00+08:00');
      const getEl = () => document.getElementById('periodeTimer_' + idx);
      const tick = () => {
        const el = getEl();
        if (!el) { clearInterval(tid); return; }
        const diff = deadline - Date.now();
        if (diff <= 0) { el.textContent = 'Ditutup'; el.style.background = 'rgba(239,68,68,0.35)'; clearInterval(tid); return; }
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        const mm = String(m).padStart(2,'0'), ss = String(s).padStart(2,'0');
        el.textContent = h >= 24
          ? Math.floor(h/24) + 'h ' + String(h%24).padStart(2,'0') + ':' + mm + ':' + ss
          : String(h).padStart(2,'0') + ':' + mm + ':' + ss;
        el.style.background = diff < 3600000 ? 'rgba(239,68,68,0.4)' : 'rgba(0,0,0,0.2)';
      };
      let tid;
      tid = setInterval(tick, 1000);
      tick();
      window._periodeTimers.push(tid);
    });
  }, 0);

  return html;
}

function renderPeriodeVerifBanner(periodeList) {
  // Cari periode yang punya data verifikasi
  const list = (periodeList || []).filter(r => r.tanggal_mulai_verif || r.tanggalMulaiVerif);
  if (!list.length) return ''; // tidak ada periode verifikasi diset

  const svgCal = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
  const svgOpen = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
  const svgClose = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';

  const items = list.map((p, idx) => {
    const mulai = p.tanggal_mulai_verif || p.tanggalMulaiVerif;
    const selesai = p.tanggal_selesai_verif || p.tanggalSelesaiVerif;
    const jmv = fmt24(p.jamMulaiVerif || p.jam_mulai_verif) || '08:00';
    const jsv = fmt24(p.jamSelesaiVerif || p.jam_selesai_verif) || '17:00';
    const isAktif = p.isVerifToday;
    const nm = p.namaBulan || p.nama_bulan || '';
    const thn = p.tahun || '';
    const mulaiStr = formatDate(mulai);
    const selesaiStr = formatDate(selesai);
    const timerId = `periodeVerifTimer_${idx}`;

    // Header warna: hijau kalau aktif, merah kalau closed, kuning kalau belum mulai
    const now = new Date(Date.now() + 8*3600000).toISOString().slice(0,10);
    const mulaiDs = mulai ? new Date(new Date(mulai).getTime()+8*3600000).toISOString().slice(0,10) : '9999';
    const selesaiDs = selesai ? new Date(new Date(selesai).getTime()+8*3600000).toISOString().slice(0,10) : '0000';
    const belumMulai = now < mulaiDs;
    const sudahTutup = now > selesaiDs;

    let headerBg, borderColor, statusLabel;
    if (isAktif) {
      headerBg = 'linear-gradient(135deg,#0d9488,#06b6d4)';
      borderColor = '#a7f3d0';
      statusLabel = 'Aktif';
    } else if (belumMulai) {
      headerBg = 'linear-gradient(135deg,#d97706,#f59e0b)';
      borderColor = '#fcd34d';
      statusLabel = 'Belum Dibuka';
    } else {
      headerBg = 'linear-gradient(135deg,#dc2626,#ef4444)';
      borderColor = '#fca5a5';
      statusLabel = 'Sudah Ditutup';
    }

    const judulHeader = nm && thn ? `Verifikasi: ${nm} ${thn}` : 'Periode Verifikasi';

    return `<div style="border:1.5px solid ${borderColor};border-radius:10px;overflow:hidden;background:var(--surface,white);box-shadow:0 1px 4px rgba(13,148,136,0.08)">
      <div style="background:${headerBg};padding:8px 14px;color:white;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:space-between;gap:7px">
        <span style="display:flex;align-items:center;gap:7px"><span style="opacity:0.9;display:flex">${svgCal}</span> ${judulHeader}</span>
        <span id="${timerId}" style="font-size:11px;font-weight:700;background:rgba(0,0,0,0.2);padding:3px 8px;border-radius:20px;letter-spacing:0.3px;white-space:nowrap">${isAktif ? '--:--:--' : statusLabel}</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0">
        <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--success-light,#f0fdf9);border-right:1px solid var(--border,#d1fae5)">
          <span style="color:#0d9488;display:flex;flex-shrink:0">${svgOpen}</span>
          <div>
            <div style="font-size:10px;color:var(--text-light,#64748b);font-weight:600;text-transform:uppercase;letter-spacing:0.4px">Dibuka</div>
            <div style="font-size:12px;font-weight:700;color:var(--text,#0f172a);">${mulaiStr} <span style="letter-spacing:0.03em">${jmv}</span> WITA</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--danger-light,#fef2f2)">
          <span style="color:#ef4444;display:flex;flex-shrink:0">${svgClose}</span>
          <div>
            <div style="font-size:10px;color:var(--text-light,#64748b);font-weight:600;text-transform:uppercase;letter-spacing:0.4px">Ditutup</div>
            <div style="font-size:12px;font-weight:700;color:var(--text,#0f172a);">${selesaiStr} <span style="letter-spacing:0.03em">${jsv}</span> WITA</div>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');

  const html = `<div style="margin-bottom:14px"><div class="card" style="margin:0"><div class="card-header-bar"><span class="card-title" style="display:flex;align-items:center;gap:7px"><span style="color:#7c3aed;display:flex">${svgCal}</span> Periode Verifikasi</span></div><div class="card-body"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px">${items}</div></div></div></div>`;

  // Timer countdown untuk periode verif yang aktif
  setTimeout(() => {
    window._periodeVerifTimers = window._periodeVerifTimers || [];
    window._periodeVerifTimers.forEach(t => clearInterval(t));
    window._periodeVerifTimers = [];
    list.forEach((p, idx) => {
      if (!p.isVerifToday) return;
      const jsv = fmt24(p.jamSelesaiVerif || p.jam_selesai_verif) || '17:00';
      const _tglRaw = p.tanggal_selesai_verif || p.tanggalSelesaiVerif || '';
      const _tglDate = _tglRaw ? new Date(_tglRaw) : null;
      if (!_tglDate || isNaN(_tglDate)) return;
      const [jsvH, jsvM] = jsv.split(':').map(Number);
      const _witaMs = _tglDate.getTime() + 8 * 3600000;
      const _witaDate = new Date(_witaMs);
      const _tglWITA = _witaDate.getUTCFullYear() + '-'
        + String(_witaDate.getUTCMonth()+1).padStart(2,'0') + '-'
        + String(_witaDate.getUTCDate()).padStart(2,'0');
      const deadline = new Date(_tglWITA + 'T' + String(jsvH).padStart(2,'0') + ':' + String(jsvM).padStart(2,'0') + ':00+08:00');
      const getEl = () => document.getElementById('periodeVerifTimer_' + idx);
      const tick = () => {
        const el = getEl();
        if (!el) { clearInterval(tid); return; }
        const diff = deadline - Date.now();
        if (diff <= 0) { el.textContent = 'Ditutup'; el.style.background = 'rgba(239,68,68,0.35)'; clearInterval(tid); return; }
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        const mm = String(m).padStart(2,'0'), ss = String(s).padStart(2,'0');
        el.textContent = h >= 24
          ? Math.floor(h/24) + 'h ' + String(h%24).padStart(2,'0') + ':' + mm + ':' + ss
          : String(h).padStart(2,'0') + ':' + mm + ':' + ss;
        el.style.background = diff < 3600000 ? 'rgba(239,68,68,0.4)' : 'rgba(0,0,0,0.2)';
      };
      let tid;
      tid = setInterval(tick, 1000);
      tick();
      window._periodeVerifTimers.push(tid);
    });
  }, 0);

  return html;
}

function renderKepalasDashboard(el, d, tahunDipilih) {
  el.innerHTML = `
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:14px">
      <h1 style="margin:0"><span class="material-icons">dashboard</span>Dashboard</h1>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:12px;color:var(--text-light);font-weight:600">Filter Tahun:</span>
        <select id="dashTahunFilter" onchange="renderDashboard()"
          style="border:1px solid var(--border,#e2e8f0);border-radius:7px;padding:5px 10px;font-size:12px;outline:none;font-family:inherit;background:var(--surface,white);color:var(--text);cursor:pointer">
          <option value="">Memuat...</option>
        </select>
      </div>
    </div>
    <div class="stats-grid">
      ${statCard('orange','pending','Menunggu Verifikasi', d.menunggu)}
      ${statCard('green','check_circle','Sudah Diverifikasi', d.terverifikasi)}
      ${statCard('blue','assignment','Total Usulan PKM Saya', d.total)}
    </div>
    ${renderPeriodeVerifBanner(d.periodeAktifList || [])}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:stretch;margin-bottom:14px">
      <div class="card" style="margin:0;display:flex;flex-direction:column">
        <div class="card-header-bar">
          <span class="card-title"><span class="material-icons">pending_actions</span>Menunggu Verifikasi Saya</span>
          <button class="btn btn-secondary btn-sm" onclick="loadPage('verifikasi')"><span class="material-icons">arrow_forward</span>Lihat Semua</button>
        </div>
        <div class="card-body" style="padding:0;flex:1" id="pendingTable"></div>
      </div>
      <div class="card" style="margin:0;display:flex;flex-direction:column">
        <div class="card-header-bar">
          <span class="card-title"><span class="material-icons">donut_large</span>Progress Puskesmas</span>
        </div>
        <div class="card-body" style="padding:12px 14px;flex:1" id="kapusStatusSummary">
          <div class="loading-state"><div class="spm-spinner lg"><div class="sr1"></div><div class="sr2"></div><div class="sr3"></div></div><p>Memuat...</p></div>
        </div>
      </div>
    </div>
    <div class="card" style="margin-top:0">
      <div class="card-header-bar">
        <span class="card-title"><span class="material-icons">history</span>Riwayat Semua Usulan</span>
        <button class="btn btn-secondary btn-sm" onclick="loadPage('verifikasi')"><span class="material-icons">arrow_forward</span>Lihat Semua</button>
      </div>
      <div class="card-body" style="padding:0" id="kapusAllTable"></div>
    </div>`;

  // Populate dropdown tahun
  _loadDashTahunList().then(list => {
    const sel = document.getElementById('dashTahunFilter');
    if (!sel) return;
    const allTahun = [...new Set([...list, CURRENT_YEAR])].sort((a,b) => b - a);
    sel.innerHTML = `<option value="">Semua Tahun</option>`
      + allTahun.map(t => `<option value="${t}" ${t == tahunDipilih ? 'selected' : ''}>${t}</option>`).join('');
  });

  // Pending: tidak perlu filter tahun (semua yang menunggu verifikasi kapus)
  API.getUsulan({ kode_pkm: currentUser.kodePKM, status: 'Menunggu Kepala Puskesmas' }).then(rows => {
    const renderKapusPendingPaged = (pg) => {
      const el = document.getElementById('pendingTable');
      if (!el) return;
      if (!rows.length) { el.innerHTML = `<div class="empty-state" style="padding:32px"><span class="material-icons">inbox</span><p>Belum ada data usulan</p></div>`; return; }
      const { items, page: p, totalPages, total } = paginateDash(rows, pg);
      el.innerHTML = renderUsulanTable(items, 'kepala-puskesmas')
        + renderPagination('pendingTable', total, p, totalPages, `pg => window._kapusPendingGoTo(pg)`);
    };
    window._kapusPendingGoTo = (pg) => renderKapusPendingPaged(pg);
    renderKapusPendingPaged(1);
  }).catch(() => {});

  // Riwayat + summary — ikut filter tahun
  const _kapusTahunParam = { kode_pkm: currentUser.kodePKM };
  if (tahunDipilih) _kapusTahunParam.tahun = tahunDipilih;
  API.getUsulan(_kapusTahunParam).then(rows => {
    // Progress summary
    const elSum = document.getElementById('kapusStatusSummary');
    if (elSum) elSum.innerHTML = renderKapusStatusSummary(rows);
    // Riwayat semua — dengan pagination
    const renderKapusAllPaged = (pg) => {
      const elAll = document.getElementById('kapusAllTable');
      if (!elAll) return;
      if (!rows.length) { elAll.innerHTML = `<div class="empty-state" style="padding:32px"><span class="material-icons">inbox</span><p>Belum ada data usulan</p></div>`; return; }
      const { items, page: p, totalPages, total } = paginateDash(rows, pg);
      elAll.innerHTML = renderUsulanTable(items, 'kepala-puskesmas')
        + renderPagination('kapusAllTable', total, p, totalPages, `pg => window._kapusAllGoTo(pg)`);
    };
    window._kapusAllGoTo = (pg) => renderKapusAllPaged(pg);
    renderKapusAllPaged(1);
  }).catch(() => {});
}

function renderProgramDashboard(el, d, tahunDipilih) {
  // Ringkasan indikator tanggung jawab PP
  const aksesArr = (currentUser.indikatorAkses || []);
  // Ambil nama indikator dari master jika tersedia (allIndList dari halaman master)
  const _getIndNama = (no) => {
    if (window.allIndList && window.allIndList.length) {
      const found = window.allIndList.find(i => parseInt(i.no) === parseInt(no));
      if (found) return found.nama || found.namaIndikator || '';
    }
    return '';
  };
  const indikatorInfo = aksesArr.length > 0
    ? `<div style="display:flex;flex-direction:column;gap:4px;width:100%">
        <span style="font-size:12px;color:var(--text-light);font-weight:600">Indikator tanggung jawab Anda:</span>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:2px">
          ${aksesArr.map(no => {
            const nama = _getIndNama(no);
            return `<span style="display:inline-flex;align-items:center;gap:4px;background:var(--primary-light,#e6fffa);border:1px solid var(--primary);border-radius:20px;padding:2px 10px;font-size:11.5px;font-weight:600;color:var(--primary)">
              <span style="font-weight:800">${no}</span>${nama ? `<span style="font-weight:400;color:var(--text-light)">— ${nama}</span>` : ''}
            </span>`;
          }).join('')}
        </div>
      </div>`
    : `<span style="font-size:12px;color:var(--text-light)">Anda bertanggung jawab atas <strong style="color:var(--primary)">semua indikator</strong></span>`;

  el.innerHTML = `
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:14px">
      <h1 style="margin:0"><span class="material-icons">dashboard</span>Dashboard</h1>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:12px;color:var(--text-light);font-weight:600">Filter Tahun:</span>
        <select id="dashTahunFilter" onchange="renderDashboard()"
          style="border:1px solid var(--border,#e2e8f0);border-radius:7px;padding:5px 10px;font-size:12px;outline:none;font-family:inherit;background:var(--surface,white);color:var(--text);cursor:pointer">
          <option value="">Memuat...</option>
        </select>
      </div>
    </div>
    <div class="stats-grid">
      ${statCard('orange','pending','Menunggu Verifikasi', d.menunggu)}
      ${statCard('green','check_circle','Sudah Diverifikasi', d.terverifikasi)}
      ${statCard('blue','assignment','Total Ditugaskan', d.total)}
    </div>
    ${renderPeriodeVerifBanner(d.periodeAktifList || [])}
    <div class="card" style="border-left:3px solid var(--primary);margin-bottom:14px" id="ppIndikatorInfoCard">
      <div class="card-body" style="padding:10px 16px;display:flex;align-items:center;gap:8px">
        <span class="material-icons" style="color:var(--primary);font-size:18px">info</span>
        <div class="loading-state inline"><div class="spm-spinner sm"><div class="sr1"></div><div class="sr2"></div><div class="sr3"></div></div><span style="font-size:12px;color:var(--text-light)">Memuat indikator...</span></div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:stretch;margin-bottom:14px">
      <div class="card" style="margin:0;display:flex;flex-direction:column">
        <div class="card-header-bar">
          <span class="card-title"><span class="material-icons">pending_actions</span>Menunggu Verifikasi Saya</span>
          <button class="btn btn-secondary btn-sm" onclick="loadPage('verifikasi')"><span class="material-icons">arrow_forward</span>Lihat Semua</button>
        </div>
        <div class="card-body" style="padding:0;flex:1" id="pendingTable"></div>
      </div>
      <div class="card" style="margin:0;display:flex;flex-direction:column">
        <div class="card-header-bar">
          <span class="card-title"><span class="material-icons">check_circle</span>Sudah Diverifikasi</span>
        </div>
        <div class="card-body" style="padding:0;flex:1" id="ppDoneTable"></div>
      </div>
    </div>`;

  // Populate dropdown tahun
  _loadDashTahunList().then(list => {
    const sel = document.getElementById('dashTahunFilter');
    if (!sel) return;
    const allTahun = [...new Set([...list, CURRENT_YEAR])].sort((a,b) => b - a);
    sel.innerHTML = `<option value="">Semua Tahun</option>`
      + allTahun.map(t => `<option value="${t}" ${t == tahunDipilih ? 'selected' : ''}>${t}</option>`).join('');
  });

  // Fetch indikator dulu, lalu render info card dengan nama lengkap
  // reVerifNos: Set nomor indikator yang sedang perlu di-re-verifikasi (opsional, default kosong)
  const _ppUsulanParam = { status_program: 'Menunggu Pengelola Program,Menunggu Re-verifikasi PP,Ditolak,Ditolak Sebagian,Selesai,Menunggu Admin', email_program: currentUser.email };
  if (tahunDipilih) _ppUsulanParam.tahun = tahunDipilih;
  const _renderPPIndikatorInfo = (indList, reVerifNos) => {
    const _reVerif = reVerifNos instanceof Set ? reVerifNos : new Set();
    const _getNama = (no) => {
      const found = (indList||[]).find(i => parseInt(i.no) === parseInt(no));
      return found ? (found.nama || found.namaIndikator || '') : '';
    };
    const aksesArr2 = (currentUser.indikatorAkses || []);
    const infoHtml = aksesArr2.length > 0
      ? `<div style="display:flex;flex-direction:column;gap:4px;width:100%">
          <span style="font-size:12px;color:var(--text-light);font-weight:600">Indikator tanggung jawab Anda:</span>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:2px">
            ${aksesArr2.map(no => {
              const nama = _getNama(no);
              const isRV = _reVerif.has(parseInt(no));
              // Badge oranye + label "Re-verif" jika indikator ini perlu re-verifikasi
              const bg     = isRV ? '#fff7ed' : '#e6fffa';
              const border = isRV ? '#fb923c' : 'var(--primary)';
              const color  = isRV ? '#c2410c' : 'var(--primary)';
              const extra  = isRV
                ? `<span style="display:inline-flex;align-items:center;gap:2px;background:#fed7aa;color:#9a3412;border-radius:10px;padding:0px 5px;font-size:9.5px;font-weight:700;margin-left:2px"><span class="material-icons" style="font-size:9px">replay</span>Re-verif</span>`
                : '';
              return `<span style="display:inline-flex;align-items:center;gap:4px;background:${bg};border:1px solid ${border};border-radius:20px;padding:2px 10px;font-size:11.5px;font-weight:600;color:${color}">
                <span style="font-weight:800">${no}</span>${nama ? `<span style="font-weight:400;color:var(--text-light)"> — ${nama}</span>` : ''}${extra}
              </span>`;
            }).join('')}
          </div>

        </div>`
      : `<span style="font-size:12px;color:var(--text-light)">Anda bertanggung jawab atas <strong style="color:var(--primary)">semua indikator</strong></span>`;
    const card = document.getElementById('ppIndikatorInfoCard');
    if (card) card.querySelector('.card-body').innerHTML = `
      <span class="material-icons" style="color:${_reVerif.size > 0 ? '#ea580c' : 'var(--primary)'};font-size:18px;flex-shrink:0">${_reVerif.size > 0 ? 'warning' : 'info'}</span>
      ${infoHtml}`;
  };

  // Fetch indikator dan usulan BERSAMAAN — render info card hanya SEKALI setelah keduanya selesai
  // (menghilangkan race condition di mana early render tanpa reVerifNos menimpa final render)
  const _indFetch = window.allIndList && window.allIndList.length
    ? Promise.resolve(window.allIndList)
    : API.getIndikator().then(inds => { window.allIndList = inds; return inds; }).catch(() => []);

  Promise.all([
    _indFetch,
    API.getUsulan(_ppUsulanParam)
  ]).then(([indList, rows]) => {
    const pending = rows.filter(u => !u.sudahVerif);
    const done = rows.filter(u => u.sudahVerif);

    // Hitung nomor indikator yang perlu re-verifikasi
    const myAksesSet = new Set((currentUser.indikatorAkses || []).map(n => parseInt(n)));
    const myEmail = (currentUser.email || '').toLowerCase();
    const reVerifNos = new Set();
    // Iterasi semua rows — skenario 'Menunggu Re-verifikasi PP' bisa masuk done
    // jika sudahVerif salah hitung, atau PP ini sudah respond tapi PP lain belum
    rows.forEach(u => {
      if (!['Menunggu Pengelola Program','Menunggu Re-verifikasi PP','Ditolak Sebagian'].includes(u.statusGlobal)) return;
      (u.penolakanIndikator || [])
        .filter(p => {
          const aksiOk = !p.aksi || p.aksi === 'tolak' || p.aksi === 'kapus-ok' || p.aksi === 'kapus-verif' || p.aksi === 'reset';
          if (!aksiOk) return false;
          // Untuk penolakan dari Admin: hanya baris email_program milik PP ini yang belum direspond
          if ((p.dibuat_oleh || '') === 'Admin') {
            return (p.emailProgram || p.email_program || '').toLowerCase() === myEmail
              && !p.responded_at;
          }
          return true;
        })
        .forEach(p => {
          const no = parseInt(p.noIndikator || p.no_indikator);
          if (myAksesSet.size === 0 || myAksesSet.has(no)) reVerifNos.add(no);
        });
    });

    // Render info card SEKALI dengan data lengkap (indikator + reVerifNos)
    _renderPPIndikatorInfo(indList, reVerifNos);

    // Pagination state untuk PP dashboard
    let _ppPendingPage = 1;
    let _ppDonePage = 1;

    const renderPendingPaged = (pg) => {
      _ppPendingPage = pg;
      const el = document.getElementById('pendingTable');
      if (!el) return;
      if (!pending.length) {
        el.innerHTML = `<div class="empty-state" style="padding:32px"><span class="material-icons">inbox</span><p>Belum ada data usulan</p></div>`;
        return;
      }
      const { items, page: p, totalPages, total } = paginateDash(pending, pg);
      el.innerHTML = renderUsulanTable(items, 'program')
        + renderPagination('pendingTable', total, p, totalPages, 'pg => { ' + renderPendingPaged.toString().replace(/\n/g,' ') + '; }');
      // Re-attach karena string tidak bisa capture closure — pakai global
      el.innerHTML = renderUsulanTable(items, 'program')
        + renderPagination('pendingTable', total, p, totalPages, `pg => window._ppPendingGoTo(pg)`);
    };
    const renderDonePaged = (pg) => {
      _ppDonePage = pg;
      const elDone = document.getElementById('ppDoneTable');
      if (!elDone) return;
      if (!done.length) {
        elDone.innerHTML = `<div class="empty-state" style="padding:32px"><span class="material-icons">inbox</span><p>Belum ada yang selesai</p></div>`;
        return;
      }
      const { items, page: p, totalPages, total } = paginateDash(done, pg);
      elDone.innerHTML = renderUsulanTable(items, 'program')
        + renderPagination('ppDoneTable', total, p, totalPages, `pg => window._ppDoneGoTo(pg)`);
    };

    window._ppPendingGoTo = (pg) => renderPendingPaged(pg);
    window._ppDoneGoTo    = (pg) => renderDonePaged(pg);

    renderPendingPaged(1);
    renderDonePaged(1);
  }).catch(() => {});
}


function statCard(color, icon, label, value, sub = null) {
  const gradients = {
    blue:   'linear-gradient(135deg,#0d9488,#06b6d4)',
    green:  'linear-gradient(135deg,#059669,#10b981)',
    orange: 'linear-gradient(135deg,#ea580c,#f97316)',
    purple: 'linear-gradient(135deg,#7c3aed,#a78bfa)',
    cyan:   'linear-gradient(135deg,#0891b2,#06b6d4)',
    red:    'linear-gradient(135deg,#dc2626,#f87171)',
  };
  const grad = gradients[color] || gradients.blue;
  return `<div class="stat-card stat-card-v2" style="background:${grad};border:none;padding:10px 14px;overflow:hidden;display:flex;flex-direction:column;justify-content:space-between;cursor:default;position:relative">
    <span class="material-icons" style="position:absolute;right:-4px;bottom:-4px;font-size:50px;color:rgba(255,255,255,0.12);pointer-events:none;user-select:none">${icon}</span>
    <div style="display:flex;align-items:center;gap:7px;margin-bottom:5px">
      <div style="width:24px;height:24px;border-radius:6px;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <span class="material-icons" style="font-size:13px;color:#fff">${icon}</span>
      </div>
      <div style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.85)">${label}</div>
    </div>
    <div>
      <div style="font-size:22px;font-weight:900;color:#fff;line-height:1;letter-spacing:-1px">${value ?? 0}</div>
      ${sub !== null ? `<div style="font-size:10px;color:rgba(255,255,255,0.6);margin-top:2px;font-weight:500">${sub}</div>` : ''}
    </div>
  </div>`;
}

function renderChart(data, chartMode) {
  // chartMode: 'bulan' (tahun tertentu dipilih) atau 'tahun' (Semua Tahun)
  const isBulanMode = !chartMode || chartMode === 'bulan';
  const ALL_MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'];

  let full;
  if (isBulanMode) {
    // Mode per bulan: isi semua 12 bulan, bulan tanpa data = 0
    const dataMap = {};
    (data || []).forEach(d => { dataMap[d.label || d.bulan] = d.total || 0; });
    full = ALL_MONTHS.map(b => ({ label: b, total: dataMap[b] || 0 }));
  } else {
    // Mode per tahun: gunakan data apa adanya dari backend, urutkan
    full = (data || [])
      .map(d => ({ label: d.label || String(d.tahun || ''), total: d.total || 0 }))
      .sort((a, b) => a.label.localeCompare(b.label));
    // Jika tidak ada data sama sekali, tampilkan placeholder
    if (!full.length) full = [{ label: '-', total: 0 }];
  }

  const max = Math.max(...full.map(d => d.total), 1);
  const bars = full.map((d) => {
    const targetH = Math.max((d.total / max) * 90, d.total > 0 ? 6 : 0);
    const isEmpty = d.total === 0;
    const barColor = isBulanMode
      ? (isEmpty ? 'linear-gradient(180deg,#e2e8f0,#cbd5e1)' : 'linear-gradient(180deg,#0d9488,#06b6d4)')
      : (isEmpty ? 'linear-gradient(180deg,#e2e8f0,#cbd5e1)' : 'linear-gradient(180deg,#7c3aed,#a78bfa)');
    return `<div class="chart-bar-wrap" style="position:relative">
      <div class="chart-bar-val" style="color:${isEmpty ? 'transparent' : 'var(--text)'};min-height:14px">${d.total}</div>
      <div class="chart-bar chart-bar-anim"
        data-target="${targetH}"
        style="height:0px;background:${barColor};opacity:${isEmpty ? '0.45' : '1'}"
        title="${d.label}: ${d.total} usulan"></div>
      <div class="chart-bar-lbl" style="color:${isEmpty ? 'var(--text-xlight)' : 'var(--text-light)'}${!isBulanMode ? ';font-size:9.5px' : ''}">${d.label}</div>
      ${!isEmpty ? `<div class="chart-tooltip">${d.label}<br><b>${d.total}</b> usulan</div>` : ''}
    </div>`;
  }).join('');
  setTimeout(() => {
    document.querySelectorAll('.chart-bar-anim').forEach((el, i) => {
      const target = parseFloat(el.dataset.target) || 0;
      setTimeout(() => {
        el.style.transition = 'height 0.45s cubic-bezier(.22,.61,.36,1)';
        el.style.height = target + 'px';
      }, i * 30);
    });
  }, 60);
  return `<div class="chart-container" style="min-height:130px;padding:8px 0 4px;justify-content:space-between;gap:${isBulanMode ? '4' : '6'}px">${bars}</div>`;
}

function renderDonutChart(selesai, proses, ditolak) {
  const total = selesai + proses + ditolak;
  if (total === 0) return '';
  const cx = 54, cy = 54, r = 40;
  const circ = 2 * Math.PI * r;
  const pctSelesai = selesai / total;
  const pctProses  = proses  / total;
  const pctDitolak = ditolak / total;
  const seg = (pct) => pct * circ;
  const gap = 2;
  const dSelesai = seg(pctSelesai);
  const dProses  = seg(pctProses);
  const dDitolak = seg(pctDitolak);
  const offSelesai = 0;
  const offProses  = dSelesai + gap;
  const offDitolak = dSelesai + gap + dProses + gap;
  const segments = [
    { val: selesai, d: dSelesai, off: offSelesai, color: '#10b981', label: 'Selesai' },
    { val: proses,  d: dProses,  off: offProses,  color: '#f59e0b', label: 'Proses' },
    { val: ditolak, d: dDitolak, off: offDitolak, color: '#ef4444', label: 'Ditolak/Draft' },
  ].filter(s => s.val > 0);
  const pct = total > 0 ? Math.round((selesai / total) * 100) : 0;
  const uid = 'donut_' + Math.random().toString(36).slice(2,7);
  // Render dengan stroke-dasharray = 0 dulu, animasikan setelah mount
  const svgSegs = segments.map((s, i) =>
    `<circle id="${uid}_seg${i}" cx="${cx}" cy="${cy}" r="${r}"
      fill="none" stroke="${s.color}" stroke-width="13"
      stroke-dasharray="0 ${circ}"
      stroke-dashoffset="${-(s.off)}"
      transform="rotate(-90 ${cx} ${cy})"
      style="transition:stroke-dasharray 0.6s cubic-bezier(.4,0,.2,1) ${i*0.12}s"
      data-d="${s.d}" data-gap="${gap}" data-circ="${circ}"/>`
  ).join('');
  const legend = segments.map(s =>
    `<div style="display:flex;align-items:center;gap:5px;font-size:11px">
      <div style="width:7px;height:7px;border-radius:50%;background:${s.color};flex-shrink:0"></div>
      <span style="color:var(--text-light)">${s.label}</span>
      <span style="font-weight:700;color:var(--text);margin-left:2px">${s.val}</span>
    </div>`
  ).join('');
  setTimeout(() => {
    segments.forEach((s, i) => {
      const el = document.getElementById(`${uid}_seg${i}`);
      if (el) el.setAttribute('stroke-dasharray', `${s.d - gap} ${circ - s.d + gap}`);
    });
  }, 80);
  return `<div style="display:flex;align-items:center;gap:12px;padding:4px 0">
    <svg width="108" height="108" viewBox="0 0 108 108" style="flex-shrink:0">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e2e8f0" stroke-width="13"/>
      ${svgSegs}
      <text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="15" font-weight="900"
        fill="var(--text)" >${pct}%</text>

    </svg>
    <div style="display:flex;flex-direction:column;gap:6px;flex:1">
      <div style="font-size:10px;font-weight:600;color:var(--text-light);text-transform:uppercase;letter-spacing:0.4px">Total Usulan</div>
      <div style="font-size:24px;font-weight:900;color:var(--text);line-height:1">${total}</div>
      <div style="display:flex;flex-direction:column;gap:5px;margin-top:2px">${legend}</div>
    </div>
  </div>`;
}

// ============== USULAN TABLE HELPER ==============
function renderUsulanTable(rows, role) {
  if (!rows || rows.length === 0) {
    return `<div class="empty-state" style="padding:32px"><span class="material-icons">inbox</span><p>Belum ada data usulan</p></div>`;
  }
  const actionBtn = (u) => {
    const viewBtn = `<button class="btn-icon view" onclick="viewDetail('${u.idUsulan}')" title="Detail"><span class="material-icons">visibility</span></button>`;
    const logBtnEarly = `<button class="btn-icon" onclick="openLogAktivitas('${u.idUsulan}')" title="Riwayat Aktivitas" style="background:transparent;border:none;color:#64748b"><span class="material-icons" style="font-size:18px">history</span></button>`;
    const pdfBtnEarly = getDownloadBtn(u, 20, role, currentUser.indikatorAkses);
    if (role === 'operator') {
      const editBtn = u.statusGlobal === 'Draft' ? `<button class="btn-icon edit" onclick="openIndikatorModal('${u.idUsulan}')" title="Input"><span class="material-icons">edit</span></button>` : '';
      const canPerbaiki = ['Ditolak','Ditolak Sebagian'].includes(u.statusGlobal) && (u.ditolakOleh !== 'Admin' || u.konteksPenolakan === 'KapusTolakAdmin');
      const perbaikiBtn = canPerbaiki
        ? `<button class="btn-icon" onclick="openIndikatorModal('${u.idUsulan}')" title="Perbaiki & Ajukan Ulang" style="background:transparent;border:none;color:#f59e0b"><span class="material-icons" style="font-size:17px">restart_alt</span></button>`
        : `<button class="btn-icon" disabled title="${u.statusGlobal === 'Menunggu Pengelola Program' ? 'Menunggu respon Pengelola Program' : 'Tidak perlu perbaikan'}" style="background:transparent;border:none;color:#cbd5e1;opacity:0.3;cursor:not-allowed"><span class="material-icons" style="font-size:17px">restart_alt</span></button>`;
      return viewBtn + editBtn + perbaikiBtn + pdfBtnEarly + logBtnEarly;
    }
    // PP dan Admin bisa verif sesuai status global
    const canVerif =
      (role === 'kepala-puskesmas' && u.statusGlobal === 'Menunggu Kepala Puskesmas') ||
      (role === 'program' && ['Menunggu Pengelola Program','Menunggu Re-verifikasi PP'].includes(u.statusGlobal)) ||
      (role === 'admin'   && u.statusGlobal === 'Menunggu Admin');

    // Sudah verifikasi
    const sudahVerifKepala = role === 'kepala-puskesmas' && (u.statusKapus === 'Selesai' || u.statusKapus === 'Ditolak');
    const sudahVerifProgram = role === 'program' && u.sudahVerif === true && (u.myVerifStatus === 'Selesai' || u.myVerifStatus === 'Ditolak' || u.myVerifStatus === 'Menunggu');
    const sudahVerifAdmin = role === 'admin' && u.statusGlobal === 'Selesai';
    const sudahVerif = sudahVerifKepala || sudahVerifProgram || sudahVerifAdmin;

    let verifBtn;
    if (sudahVerif) {
      verifBtn = `<button class="btn-icon" title="Anda sudah memverifikasi" style="background:transparent;border:none;color:#0d9488;cursor:default;opacity:0.7" disabled><span class="material-icons">check_circle</span></button>`;
    } else if (canVerif) {
      verifBtn = `<button class="btn-icon approve" onclick="openVerifikasi('${u.idUsulan}')" title="Verifikasi Sekarang" style="animation:pulse 1.5s infinite"><span class="material-icons">rate_review</span></button>`;
    } else {
      verifBtn = `<button class="btn-icon" title="Menunggu tahap sebelumnya" style="opacity:0.35;cursor:not-allowed" disabled><span class="material-icons">lock</span></button>`;
    }

    // Tombol download PDF
    const pdfBtn = getDownloadBtn(u, 20, role, currentUser.indikatorAkses);
    const logBtn = `<button class="btn-icon" onclick="openLogAktivitas('${u.idUsulan}')" title="Riwayat Aktivitas" style="background:transparent;border:none;color:#64748b"><span class="material-icons" style="font-size:18px">history</span></button>`;

    if (['kepala-puskesmas', 'admin'].includes(role)) {
      return viewBtn + pdfBtn + verifBtn + logBtn;
    }
    if (role === 'program') {
      return viewBtn + pdfBtn + verifBtn + logBtn;
    }
    return viewBtn + pdfBtn + logBtn;
  };

  return `<div class="table-container"><table>
    <thead><tr><th>ID Usulan</th><th>Puskesmas</th><th>Periode</th><th>Indeks SPM</th><th>Status</th><th>Dibuat</th><th>Aksi</th></tr></thead>
    <tbody>${rows.map(u => `<tr>
      <td><span style="font-weight:600;font-size:12px;">${u.idUsulan}</span></td>
      <td>${u.namaPKM || u.kodePKM}</td>
      <td>${u.namaBulan || ''} ${u.tahun}</td>
      <td class="rasio-cell" style="font-weight:700;color:var(--primary)">${parseFloat(u.indeksSPM||0).toFixed(2)}</td>
      <td>
        ${statusBadge(u.statusGlobal)}${(() => {
          // Chip nomor indikator inline di sebelah badge — hanya untuk role BUKAN Operator
          // (Operator sudah punya block detail di bawah)
          if (role !== 'operator' && ['Ditolak','Ditolak Sebagian'].includes(u.statusGlobal) && u.ditolakOleh === 'Kepala Puskesmas') {
            const nos = [...new Set(
              (u.penolakanIndikator||[])
                .filter(p => p.dari_kapus === true || p.dari_kapus === 'true'
                  || p.dibuat_oleh === 'Kapus'
                  || (!p.dibuat_oleh && (!p.aksi || p.aksi === null)))
                .map(p => parseInt(p.no_indikator || p.noIndikator))
            )].sort((a,b)=>a-b);
            if (nos.length > 0)
              return ' ' + nos.map(n => `<span style="background:#fecaca;color:#7f1d1d;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:700;white-space:nowrap">#${n}</span>`).join(' ');
          }
          return '';
        })()}
        ${(role === 'admin' && (u.ditolakOleh === 'Admin' || u.konteksPenolakan === 'Admin')) ? (() => {
          const sg = u.statusGlobal;
          // FIX: filter lama pakai dari_kapus=true, tapi baris Admin punya dari_kapus=false
          // (dari_kapus hanya true untuk baris Kapus yang aksi=NULL, bukan Admin yang aksi='tolak').
          // Gunakan filter aksi='tolak' yang tepat untuk skenario Admin tolak indikator.
          let _nosAdmin = [...new Set((u.penolakanIndikator || [])
  .filter(p => p.aksi === 'tolak')
  .map(p => parseInt(p.noIndikator)))];
if (_nosAdmin.length === 0 && u.adminCatatan) {
  (u.adminCatatan || '').split('|').forEach(part => {
    const m = part.trim().match(/^#(\d+):/);
    if (m) _nosAdmin.push(parseInt(m[1]));
  });
}
const nos = _nosAdmin.sort((a,b)=>a-b).map(n => `<span style="background:#fecaca;color:#7f1d1d;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:700;white-space:nowrap">#${n}</span>`).join(' ');
          const indBadge = nos ? `<span style="margin-left:4px">${nos}</span>` : '';
          if (sg === 'Menunggu Pengelola Program' || sg === 'Menunggu Re-verifikasi PP')
            return `<div style="margin-top:4px;background:#fff7ed;border:1px solid #fed7aa;border-radius:5px;padding:3px 7px"><div style="display:inline-flex;align-items:center;gap:4px"><span class="material-icons" style="font-size:12px;color:#ea580c">replay</span><span style="font-size:10.5px;color:#c2410c;font-weight:600">Re-verifikasi PP</span>${indBadge}</div></div>`;
          if (sg === 'Menunggu Kepala Puskesmas')
            return `<div style="margin-top:4px;background:#fef9c3;border:1px solid #fde047;border-radius:5px;padding:3px 7px"><div style="display:inline-flex;align-items:center;gap:4px"><span class="material-icons" style="font-size:12px;color:#ca8a04">replay</span><span style="font-size:10.5px;color:#92400e;font-weight:600">Re-verifikasi Kapus</span>${indBadge}</div></div>`;
          if (sg === 'Menunggu Admin') {
            return `<div style="margin-top:4px;background:#eff6ff;border:1px solid #93c5fd;border-radius:5px;padding:3px 7px"><div style="display:inline-flex;align-items:center;gap:4px"><span class="material-icons" style="font-size:12px;color:#2563eb">assignment_return</span><span style="font-size:10.5px;color:#1d4ed8;font-weight:600">Kembali setelah re-verifikasi</span>${indBadge}</div></div>`;
          }
          return '';
        })() : ''}
        ${(role === 'program' && u.penolakanIndikator && u.penolakanIndikator.length && u.statusGlobal === 'Ditolak') ? `
          <div style="margin-top:4px;display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap;background:var(--danger-light,#fef2f2);border:1px solid #fca5a5;border-radius:5px;padding:2px 7px">
            <span class="material-icons" style="font-size:12px;color:#dc2626;flex-shrink:0">cancel</span>
            <span style="font-size:10.5px;color:#dc2626;font-weight:600;white-space:nowrap">Ditolak:</span>
            ${(() => {
              const myAkses = currentUser.indikatorAkses || [];
              const aktif = u.penolakanIndikator.filter(p => !p.aksi || p.aksi === 'tolak' || p.aksi === 'sanggah');
              const filtered = myAkses.length > 0 ? aktif.filter(p => myAkses.includes(parseInt(p.noIndikator))) : aktif;
              return [...new Set(filtered.map(p => parseInt(p.noIndikator)))].sort((a,b)=>a-b).map(n=>`<span style="background:#fecaca;color:#7f1d1d;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:700;white-space:nowrap">#${n}</span>`).join('');
            })()}
          </div>` : ''}
        ${(role === 'program' && u.penolakanIndikator && u.penolakanIndikator.length && ['Menunggu Pengelola Program','Menunggu Re-verifikasi PP','Ditolak Sebagian'].includes(u.statusGlobal) && !u.sudahVerif) ? (() => {
          const myAkses = currentUser.indikatorAkses || [];
          // Re-verif dari tolak PP biasa
          const aktifTolak = u.penolakanIndikator.filter(p => !p.aksi || p.aksi === 'tolak' || p.aksi === 'reset');
          const filteredTolak = myAkses.length > 0 ? aktifTolak.filter(p => myAkses.includes(parseInt(p.noIndikator))) : aktifTolak;
          const nosTolak = [...new Set(filteredTolak.map(p => parseInt(p.noIndikator)))].sort((a,b)=>a-b);
          // Re-verif dari kapus sanggah (kapus-ok)
          const aktifKapus = u.penolakanIndikator.filter(p => p.aksi === 'kapus-ok' || p.aksi === 'kapus-verif');
          const filteredKapus = myAkses.length > 0 ? aktifKapus.filter(p => myAkses.includes(parseInt(p.noIndikator))) : aktifKapus;
          const nosKapus = [...new Set(filteredKapus.map(p => parseInt(p.noIndikator)))].sort((a,b)=>a-b);
          const badgeTolak = nosTolak.map(n=>`<span style="background:#fecaca;color:#7f1d1d;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:700;white-space:nowrap">#${n}</span>`).join('');
          const badgeKapus = nosKapus.map(n=>`<span style="background:#fecaca;color:#7f1d1d;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:700;white-space:nowrap">#${n}</span>`).join('');
          return (nosTolak.length ? `
          <div style="margin-top:4px;display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap;background:var(--danger-light,#fef2f2);border:1px solid #fca5a5;border-radius:5px;padding:2px 7px">
            <span class="material-icons" style="font-size:12px;color:#dc2626;flex-shrink:0">replay</span>
            <span style="font-size:10.5px;color:#dc2626;font-weight:600;white-space:nowrap">Re-verif:</span>
            ${badgeTolak}
          </div>` : '')
          + (nosKapus.length ? `
          <div style="margin-top:4px;display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap;background:#f5f3ff;border:1px solid #c4b5fd;border-radius:5px;padding:2px 7px">
            <span class="material-icons" style="font-size:12px;color:#7c3aed;flex-shrink:0">gavel</span>
            <span style="font-size:10.5px;color:#5b21b6;font-weight:600;white-space:nowrap">Kapus sanggah — re-verif:</span>
            ${badgeKapus}
          </div>` : '');
        })() : ''}
        ${(role === 'operator' && ['Ditolak','Ditolak Sebagian'].includes(u.statusGlobal) && u.ditolakOleh) ? (() => {
          // dari_kapus=TRUE (diset backend) = harus diperbaiki Operator
          // kapus-ok/kapus-setuju = disanggah Kapus, PP yang re-verif — Operator tidak perlu perbaiki
          const semua = u.penolakanIndikator || [];
          const nosTolak = [...new Set(
            semua.filter(p => p.dari_kapus === true || p.dari_kapus === 'true')
                 .map(p => parseInt(p.noIndikator || p.no_indikator))
          )].sort((a,b)=>a-b);
          const nosKapusOk = [...new Set(
            semua.filter(p => p.aksi === 'kapus-ok' || p.aksi === 'kapus-setuju')
                 .map(p => parseInt(p.noIndikator || p.no_indikator))
          )].sort((a,b)=>a-b);
          return (nosTolak.length > 0 ? `
          <div style="margin-top:4px;display:inline-flex;align-items:center;gap:5px;flex-wrap:wrap;background:var(--danger-light,#fef2f2);border:1px solid #fca5a5;border-radius:5px;padding:2px 7px">
            <span class="material-icons" style="font-size:12px;color:#dc2626;flex-shrink:0">cancel</span>
            <span style="font-size:10.5px;color:#dc2626;font-weight:600;white-space:nowrap">Ditolak — ${u.ditolakOleh}</span>
            ${nosTolak.map(n=>`<span style="background:#fecaca;color:#7f1d1d;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:700;white-space:nowrap">#${n}</span>`).join('')}
          </div>` : '')
          + (nosKapusOk.length > 0 ? `
          <div style="margin-top:4px;display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap;background:#fef9c3;border:1px solid #fde047;border-radius:5px;padding:2px 7px">
            <span class="material-icons" style="font-size:12px;color:#ca8a04;flex-shrink:0">replay</span>
            <span style="font-size:10.5px;color:#92400e;font-weight:600;white-space:nowrap">Re-verif berlangsung</span>
            <span style="font-size:10px;color:#78350f;background:#fde68a;border-radius:3px;padding:1px 5px;white-space:nowrap">→ Pengelola Program</span>
            ${nosKapusOk.map(n=>`<span style="background:#fef08a;color:#78350f;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:700;white-space:nowrap">#${n}</span>`).join('')}
          </div>` : '');
        })() : ''}
        ${(role === 'operator' && !['Ditolak','Ditolak Sebagian'].includes(u.statusGlobal) && u.ditolakOleh && ['Menunggu Kepala Puskesmas','Menunggu Pengelola Program','Menunggu Admin'].includes(u.statusGlobal) && u.penolakanIndikator && u.penolakanIndikator.length) ? `
          <div style="margin-top:4px;display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap;background:#fef9c3;border:1px solid #fde047;border-radius:5px;padding:2px 7px">
            <span class="material-icons" style="font-size:12px;color:#ca8a04;flex-shrink:0">replay</span>
            <span style="font-size:10.5px;color:#92400e;font-weight:600;white-space:nowrap">Re-verif berlangsung</span>
            <span style="font-size:10px;color:#78350f;background:#fde68a;border-radius:3px;padding:1px 5px;white-space:nowrap">${
              u.statusGlobal === 'Menunggu Kepala Puskesmas' ? '→ Kepala Puskesmas' :
              u.statusGlobal === 'Menunggu Pengelola Program' ? '→ Pengelola Program' :
              u.statusGlobal === 'Menunggu Admin' ? '→ Admin' : ''
            }</span>
            ${(() => {
              // Hanya tampilkan indikator yang Kapus TOLAK (bukan kapus-ok/kapus-setuju).
              // Indikator yang Kapus SANGGAH (aksi='kapus-ok','kapus-setuju')
              // sudah diteruskan ke PP — tidak perlu diperbaiki Operator lagi.
              const src = (u.penolakanIndikator||[]).filter(p =>
                (!p.aksi || p.aksi === 'tolak' || p.aksi === 'reset')
                && p.aksi !== 'kapus-ok' && p.aksi !== 'kapus-setuju'
              );
              return [...new Set(src.map(p => parseInt(p.noIndikator || p.no_indikator)))].sort((a,b)=>a-b).map(n=>`<span style="background:#fecaca;color:#7f1d1d;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:700;white-space:nowrap">#${n}</span>`).join('');
            })()}
          </div>` : ''}
        ${(role === 'kepala-puskesmas' && u.statusGlobal === 'Menunggu Kepala Puskesmas' && u.ditolakOleh && u.penolakanIndikator && u.penolakanIndikator.filter(p => !p.aksi || p.aksi === 'tolak').length) ? (() => {
          // EXCLUDE aksi='sanggah': Kapus sudah setujui via sanggahan → diteruskan ke PP, bukan tanggung jawab Kapus lagi.
          const aktif = u.penolakanIndikator.filter(p => !p.aksi || p.aksi === 'tolak');
          const bgColor = u.ditolakOleh === 'Admin' ? '#fff7ed' : '#fef2f2';
          const bdColor = u.ditolakOleh === 'Admin' ? '#fed7aa' : '#fca5a5';
          const txColor = u.ditolakOleh === 'Admin' ? '#c2410c' : '#dc2626';
          return `<div style="margin-top:4px;display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap;background:${bgColor};border:1px solid ${bdColor};border-radius:5px;padding:2px 7px">
            <span class="material-icons" style="font-size:12px;color:${txColor};flex-shrink:0">replay</span>
            <span style="font-size:10.5px;color:${txColor};font-weight:600;white-space:nowrap">Re-verif:</span>
            ${[...new Set(aktif.map(p => parseInt(p.noIndikator)))].sort((a,b)=>a-b).map(n=>`<span style="background:#fecaca;color:#7f1d1d;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:700;white-space:nowrap">#${n}</span>`).join('')}
          </div>`;
        })() : ''}
        ${(role === 'kepala-puskesmas' && u.statusGlobal === 'Menunggu Kepala Puskesmas' && u.ditolakOleh === 'Kepala Puskesmas') ? `
          <div style="margin-top:4px;display:inline-flex;align-items:center;gap:4px;background:#fef9c3;border:1px solid #fde047;border-radius:5px;padding:2px 7px">
            <span class="material-icons" style="font-size:12px;color:#ca8a04;flex-shrink:0">replay</span>
            <span style="font-size:10.5px;color:#92400e;font-weight:600;white-space:nowrap">Re-submit Operator</span>
          </div>` : ''}

        ${/* ── PP: menunggu verifikasi Kapus (setelah PP tolak/membenarkan) ── */
        (role === 'program' && u.statusGlobal === 'Menunggu Kepala Puskesmas' && u.penolakanIndikator && u.penolakanIndikator.filter(p => !p.aksi || p.aksi === 'tolak' || p.aksi === 'sanggah').length) ? (() => {
          const aktif = u.penolakanIndikator.filter(p => !p.aksi || p.aksi === 'tolak' || p.aksi === 'sanggah');
          const myAkses = currentUser.indikatorAkses || [];
          const filtered = myAkses.length > 0 ? aktif.filter(p => myAkses.includes(parseInt(p.noIndikator))) : aktif;
          if (!filtered.length) return '';
          const isPPMembenarkan = u.ditolakOleh === 'Admin';
          return `<div style="margin-top:4px;display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap;background:#fef9c3;border:1px solid #fde047;border-radius:5px;padding:2px 7px">
            <span class="material-icons" style="font-size:12px;color:#ca8a04">${isPPMembenarkan ? 'assignment_return' : 'pending'}</span>
            <span style="font-size:10.5px;color:#92400e;font-weight:600;white-space:nowrap">${isPPMembenarkan ? 'Dibenarkan' : 'Ditolak'} — tunggu Kapus</span>
            ${[...new Set(filtered.map(p => parseInt(p.noIndikator)))].sort((a,b)=>a-b).map(n=>`<span style="background:#fecaca;color:#7f1d1d;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:700;white-space:nowrap">#${n}</span>`).join('')}
          </div>`;
        })() : ''}

        ${/* ── PP: menunggu Kapus setelah PP tolak ── */
        (role === 'program' && u.statusGlobal === 'Menunggu Kepala Puskesmas' && u.penolakanIndikator && u.penolakanIndikator.filter(p => !p.aksi || p.aksi === 'tolak' || p.aksi === 'sanggah').length) ? (() => {
          const aktif = u.penolakanIndikator.filter(p => !p.aksi || p.aksi === 'tolak' || p.aksi === 'sanggah');
          const myAkses = currentUser.indikatorAkses || [];
          const filtered = myAkses.length > 0 ? aktif.filter(p => myAkses.includes(parseInt(p.noIndikator))) : aktif;
          if (!filtered.length) return '';
          const isPPMembenarkan = u.ditolakOleh === 'Admin';
          return `<div style="margin-top:4px;display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap;background:#fef9c3;border:1px solid #fde047;border-radius:5px;padding:2px 7px">
            <span class="material-icons" style="font-size:12px;color:#ca8a04">${isPPMembenarkan ? 'assignment_return' : 'pending'}</span>
            <span style="font-size:10.5px;color:#92400e;font-weight:600;white-space:nowrap">${isPPMembenarkan ? 'Dibenarkan' : 'Ditolak'} — tunggu Kapus</span>
            ${[...new Set(filtered.map(p => parseInt(p.noIndikator)))].sort((a,b)=>a-b).map(n=>`<span style="background:#fecaca;color:#7f1d1d;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:700;white-space:nowrap">#${n}</span>`).join('')}
          </div>`;
        })() : ''}

        ${/* ── KAPUS: sudah verif, menunggu PP/Admin ── */
        (role === 'kepala-puskesmas' && u.statusKapus === 'Selesai' && u.ditolakOleh && u.penolakanIndikator && u.penolakanIndikator.filter(p => (!p.aksi || p.aksi === 'tolak' || p.aksi === 'sanggah') && !p.dari_kapus).length && ['Menunggu Pengelola Program','Menunggu Admin'].includes(u.statusGlobal)) ? (() => {
          const aktif = u.penolakanIndikator.filter(p => (!p.aksi || p.aksi === 'tolak' || p.aksi === 'sanggah') && !p.dari_kapus);
          const arahLabel = u.statusGlobal === 'Menunggu Admin' ? '→ Admin' : '→ Pengelola Program';
          return `<div style="margin-top:4px;display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap;background:#f0fdf4;border:1px solid #86efac;border-radius:5px;padding:2px 7px">
            <span class="material-icons" style="font-size:12px;color:#16a34a">check_circle</span>
            <span style="font-size:10.5px;color:#15803d;font-weight:600">Sudah diverifikasi ${arahLabel}</span>
            ${[...new Set(aktif.map(p => parseInt(p.noIndikator)))].sort((a,b)=>a-b).map(n=>`<span style="background:#fecaca;color:#7f1d1d;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:700;white-space:nowrap">#${n}</span>`).join('')}
          </div>`;
        })() : ''}
      </td>
      <td style="font-size:12px;color:var(--text-light)">${formatDateTime(u.createdAt)}</td>
      <td style="white-space:nowrap"><div style="display:flex;align-items:center;gap:2px">${actionBtn(u)}</div></td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}


// ============== PROTEKSI PERIODE: Banner periode tutup ==============
function showPeriodeTutupBanner() {
  const mc = document.getElementById('mainContent');
  if (!mc) return;
  mc.innerHTML = `
    <div class="page-header">
      <h1 style="display:flex;align-items:center;gap:8px">
        <span class="material-icons" style="color:#0d9488">edit</span>Input Usulan
      </h1>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center">
      <div style="width:72px;height:72px;border-radius:50%;background:#fef9c3;border:2px solid #fde68a;display:flex;align-items:center;justify-content:center;margin-bottom:20px">
        <span class="material-icons" style="font-size:36px;color:#d97706">event_busy</span>
      </div>
      <div style="font-size:20px;font-weight:800;color:#78350f;margin-bottom:8px">Periode Input Ditutup</div>
      <div style="font-size:14px;color:#92400e;max-width:400px;line-height:1.6;margin-bottom:24px">
        Saat ini tidak ada periode input yang aktif.<br>
        Hubungi Admin untuk membuka periode input.
      </div>
      <button class="btn btn-secondary" onclick="loadPage('dashboard')">
        <span class="material-icons">arrow_back</span>Kembali ke Dashboard
      </button>
    </div>`;
}