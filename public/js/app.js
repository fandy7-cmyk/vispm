// ============== APP STATE ==============
let currentUser = null;
let currentPage = '';
let pageData = {}; // cache per page
let verifCurrentUsulan = null; // for verifikasi modal

// ============== AUTH ==============
async function doLogin() {
  const email = document.getElementById('authEmail').value.trim();
  if (!email) return setAuthStatus('Masukkan email Anda', 'error');

  const btn = document.getElementById('authBtn');
  const status = document.getElementById('authStatus');
  btn.disabled = true;
  btn.innerHTML = '<span class="material-icons" style="animation:spin 0.8s linear infinite">refresh</span> Memeriksa...';
  setAuthStatus('Memeriksa akses...', '');

  try {
    const user = await API.login(email);
    currentUser = user;
    startApp();
  } catch (e) {
    setAuthStatus(e.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<span class="material-icons">login</span> Masuk ke Sistem';
  }
}

function setAuthStatus(msg, type) {
  const el = document.getElementById('authStatus');
  el.textContent = msg;
  el.className = 'auth-status' + (type ? ' ' + type : '');
}

function doLogout() {
  showConfirm({
    title: 'Keluar dari Sistem',
    message: 'Yakin ingin keluar dari sistem?',
    type: 'warning',
    onConfirm: () => { currentUser = null; location.reload(); }
  });
}

// ============== APP INIT ==============
function startApp() {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('appLayout').style.display = 'flex';

  // Set user info
  document.getElementById('sidebarName').textContent = currentUser.nama || currentUser.email;
  document.getElementById('sidebarRole').textContent = currentUser.role;
  document.getElementById('sidebarAvatar').textContent = (currentUser.nama || 'U')[0].toUpperCase();
  document.getElementById('topbarUser').textContent = currentUser.nama || currentUser.email;

  buildSidebar();
  loadPage('dashboard');
}

function buildSidebar() {
  const role = currentUser.role;
  const nav = document.getElementById('sidebarNav');
  const menuMap = {
    'Admin': [
      { label: 'Menu', items: [
        { id: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
        { id: 'verifikasi', icon: 'verified', label: 'Verifikasi' },
        { id: 'laporan', icon: 'bar_chart', label: 'Laporan' }
      ]},
      { label: 'Kelola Master', items: [
        { id: 'users', icon: 'group', label: 'Kelola User' },
        { id: 'pkm', icon: 'local_hospital', label: 'Kelola Puskesmas' },
        { id: 'indikator', icon: 'monitor_heart', label: 'Kelola Indikator' },
        { id: 'periode', icon: 'event_available', label: 'Periode Input' }
      ]}
    ],
    'Operator': [
      { label: 'Menu', items: [
        { id: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
        { id: 'input', icon: 'edit', label: 'Input Usulan' },
        { id: 'laporan', icon: 'bar_chart', label: 'Laporan' }
      ]}
    ],
    'Kapus': [
      { label: 'Menu', items: [
        { id: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
        { id: 'verifikasi', icon: 'verified', label: 'Verifikasi' },
        { id: 'laporan', icon: 'bar_chart', label: 'Laporan' }
      ]}
    ],
    'Pengelola Program': [
      { label: 'Menu', items: [
        { id: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
        { id: 'verifikasi', icon: 'verified', label: 'Verifikasi' },
        { id: 'laporan', icon: 'bar_chart', label: 'Laporan' }
      ]}
    ],
    'Kadis': [
      { label: 'Menu', items: [
        { id: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
        { id: 'laporan', icon: 'bar_chart', label: 'Laporan' }
      ]}
    ]
  };

  const sections = menuMap[role] || menuMap['Operator'];
  let html = '';
  for (const section of sections) {
    html += `<div class="sidebar-section">${section.label}</div>`;
    for (const item of section.items) {
      html += `<div class="menu-item" id="nav-${item.id}" onclick="loadPage('${item.id}')">
        <span class="material-icons">${item.icon}</span><span>${item.label}</span>
      </div>`;
    }
  }
  nav.innerHTML = html;
}

function setActiveNav(page) {
  document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
  const el = document.getElementById('nav-' + page);
  if (el) el.classList.add('active');
}

// ============== ROUTING ==============
const PAGE_TITLES = {
  dashboard: 'Dashboard', verifikasi: 'Verifikasi', laporan: 'Laporan',
  users: 'Kelola User', pkm: 'Kelola Puskesmas', indikator: 'Kelola Indikator',
  periode: 'Periode Input', input: 'Input Usulan'
};

function loadPage(page) {
  currentPage = page;
  closeSidebar();
  setActiveNav(page);
  document.getElementById('topbarTitle').textContent = PAGE_TITLES[page] || page;
  setLoading(true);

  const role = currentUser.role;
  const renders = {
    dashboard: renderDashboard,
    verifikasi: renderVerifikasi,
    laporan: renderLaporan,
    users: renderUsers,
    pkm: renderPKM,
    indikator: renderIndikator,
    periode: renderPeriode,
    input: renderInput
  };

  const fn = renders[page];
  if (fn) {
    Promise.resolve(fn()).finally(() => setLoading(false));
  } else {
    document.getElementById('mainContent').innerHTML = `<div class="empty-state"><span class="material-icons">construction</span><p>Halaman dalam pengembangan</p></div>`;
    setLoading(false);
  }
}

// ============== SIDEBAR MOBILE ==============
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('show');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('show');
}

// ============== HELPER: YEAR SELECT ==============
function yearOptions(selected) {
  let html = '';
  for (let y = 2024; y <= 2027; y++) {
    html += `<option value="${y}" ${y == selected ? 'selected' : ''}>${y}</option>`;
  }
  return html;
}

function bulanOptions(selected) {
  const months = BULAN_NAMA.slice(1);
  return months.map((m, i) => `<option value="${i+1}" ${(i+1) == selected ? 'selected' : ''}>${m}</option>`).join('');
}

// ============== DASHBOARD ==============
async function renderDashboard() {
  const role = currentUser.role;
  const params = { role, email: currentUser.email, kode_pkm: currentUser.kodePKM };

  let data;
  try { data = await API.dashboard(params); } catch (e) {
    toast(e.message, 'error'); return;
  }

  const content = document.getElementById('mainContent');

  if (role === 'Admin') renderAdminDashboard(content, data);
  else if (role === 'Operator') renderOperatorDashboard(content, data);
  else if (role === 'Kapus') renderKapusDashboard(content, data);
  else if (role === 'Pengelola Program') renderProgramDashboard(content, data);
  else if (role === 'Kadis') renderKadisDashboard(content, data);
}

function renderAdminDashboard(el, d) {
  el.innerHTML = `
    <div class="stats-grid">
      ${statCard('blue','assignment','Total Usulan', d.totalUsulan)}
      ${statCard('green','check_circle','Selesai', d.selesai)}
      ${statCard('orange','pending','Menunggu', d.menunggu)}
      ${statCard('purple','local_hospital','Puskesmas Aktif', d.puskesmasAktif)}
    </div>
    <div class="card">
      <div class="card-header-bar">
        <span class="card-title"><span class="material-icons">timeline</span>Statistik per Bulan (${CURRENT_YEAR})</span>
      </div>
      <div class="card-body">
        ${renderChart(d.chartData)}
      </div>
    </div>
    <div class="card">
      <div class="card-header-bar">
        <span class="card-title"><span class="material-icons">history</span>Usulan Terbaru</span>
        <button class="btn btn-secondary btn-sm" onclick="loadPage('verifikasi')">
          <span class="material-icons">arrow_forward</span>Lihat Semua
        </button>
      </div>
      <div class="card-body" style="padding:0">
        <div id="recentTable"><div class="empty-state" style="padding:32px"><span class="material-icons">hourglass_empty</span><p>Memuat...</p></div></div>
      </div>
    </div>`;

  // Load recent usulan
  API.getUsulan({ tahun: CURRENT_YEAR }).then(rows => {
    document.getElementById('recentTable').innerHTML = renderUsulanTable(rows.slice(0, 10), 'admin');
  }).catch(() => {});
}

function renderOperatorDashboard(el, d) {
  el.innerHTML = `
    <div class="stats-grid">
      ${statCard('blue','assignment','Total Usulan Saya', d.totalUsulan)}
      ${statCard('green','check_circle','Selesai/Disetujui', d.disetujui)}
      ${statCard('orange','pending','Dalam Proses', d.menunggu)}
      ${statCard('cyan','event_available','Periode Aktif', d.periodeAktif ? `${d.periodeAktif.nama_bulan} ${d.periodeAktif.tahun}` : '-')}
    </div>
    ${d.periodeAktif ? `<div class="info-card info"><span class="material-icons">event</span><div class="info-card-text"><strong>Periode Input Aktif:</strong> ${d.periodeAktif.nama_bulan} ${d.periodeAktif.tahun} (s/d ${formatDate(d.periodeAktif.tanggal_selesai)})</div></div>` : '<div class="info-card warning"><span class="material-icons">warning</span><div class="info-card-text">Tidak ada periode input yang aktif saat ini. Hubungi Admin.</div></div>'}
    <div class="card">
      <div class="card-header-bar">
        <span class="card-title"><span class="material-icons">quickreply</span>Aksi Cepat</span>
      </div>
      <div class="card-body" style="display:flex;gap:10px;flex-wrap:wrap;">
        <button class="btn btn-primary" onclick="loadPage('input')"><span class="material-icons">add</span>Buat Usulan Baru</button>
        <button class="btn btn-secondary" onclick="loadPage('laporan')"><span class="material-icons">bar_chart</span>Lihat Laporan</button>
      </div>
    </div>
    <div class="card">
      <div class="card-header-bar"><span class="card-title"><span class="material-icons">history</span>Usulan Terbaru Saya</span></div>
      <div class="card-body" style="padding:0" id="recentTable"></div>
    </div>`;

  API.getUsulan({ email_operator: currentUser.email, tahun: CURRENT_YEAR }).then(rows => {
    document.getElementById('recentTable').innerHTML = renderUsulanTable(rows.slice(0, 5), 'operator');
  }).catch(() => {});
}

function renderKapusDashboard(el, d) {
  el.innerHTML = `
    <div class="stats-grid">
      ${statCard('orange','pending','Menunggu Verifikasi', d.menunggu)}
      ${statCard('green','check_circle','Sudah Diverifikasi', d.terverifikasi)}
      ${statCard('blue','assignment','Total Usulan', d.total)}
    </div>
    <div class="card">
      <div class="card-header-bar">
        <span class="card-title"><span class="material-icons">pending_actions</span>Usulan Menunggu Verifikasi</span>
        <button class="btn btn-secondary btn-sm" onclick="loadPage('verifikasi')"><span class="material-icons">arrow_forward</span>Lihat Semua</button>
      </div>
      <div class="card-body" style="padding:0" id="pendingTable"></div>
    </div>`;

  API.getUsulan({ kode_pkm: currentUser.kodePKM, status: 'Menunggu Kapus' }).then(rows => {
    document.getElementById('pendingTable').innerHTML = renderUsulanTable(rows, 'kapus');
  }).catch(() => {});
}

function renderProgramDashboard(el, d) {
  el.innerHTML = `
    <div class="stats-grid">
      ${statCard('orange','pending','Menunggu Verifikasi', d.menunggu)}
      ${statCard('green','check_circle','Sudah Diverifikasi', d.terverifikasi)}
      ${statCard('blue','assignment','Total Usulan', d.total)}
    </div>
    <div class="card">
      <div class="card-header-bar">
        <span class="card-title"><span class="material-icons">pending_actions</span>Usulan Menunggu Verifikasi Program</span>
        <button class="btn btn-secondary btn-sm" onclick="loadPage('verifikasi')"><span class="material-icons">arrow_forward</span>Lihat Semua</button>
      </div>
      <div class="card-body" style="padding:0" id="pendingTable"></div>
    </div>`;

  API.getUsulan({ status: 'Menunggu Program' }).then(rows => {
    document.getElementById('pendingTable').innerHTML = renderUsulanTable(rows, 'program');
  }).catch(() => {});
}

function renderKadisDashboard(el, d) {
  el.innerHTML = `
    <div class="stats-grid">
      ${statCard('blue','assignment','Total Usulan', d.totalUsulan)}
      ${statCard('green','check_circle','Selesai', d.selesai)}
      ${statCard('orange','pending','Dalam Proses', d.proses)}
      ${statCard('purple','trending_up','Rata-rata Indeks SPM', d.rataSPM)}
    </div>
    <div class="card">
      <div class="card-header-bar"><span class="card-title"><span class="material-icons">timeline</span>Statistik per Bulan</span></div>
      <div class="card-body">${renderChart(d.chartData)}</div>
    </div>
    <div class="card">
      <div class="card-header-bar"><span class="card-title"><span class="material-icons">local_hospital</span>Statistik per Puskesmas</span></div>
      <div class="card-body" style="padding:0">
        <div class="table-container">
          <table>
            <thead><tr><th>Puskesmas</th><th>Total</th><th>Selesai</th><th>Proses</th><th>Rata-rata Indeks</th></tr></thead>
            <tbody>${(d.statPerPKM || []).map(r => `<tr>
              <td>${r.nama}</td><td>${r.total}</td><td><span class="badge badge-success">${r.selesai}</span></td>
              <td>${r.proses}</td><td><span style="font-family:'JetBrains Mono',monospace;font-weight:700;color:var(--primary)">${r.rataIndeks}</span></td>
            </tr>`).join('') || `<tr><td colspan="5"><div class="empty-state" style="padding:24px"><p>Belum ada data</p></div></td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
}

function statCard(color, icon, label, value) {
  return `<div class="stat-card">
    <div class="stat-icon ${color}"><span class="material-icons">${icon}</span></div>
    <div class="stat-info"><div class="stat-label">${label}</div><div class="stat-value">${value ?? 0}</div></div>
  </div>`;
}

function renderChart(data) {
  if (!data || data.length === 0) return `<div class="empty-state"><p>Belum ada data chart</p></div>`;
  const max = Math.max(...data.map(d => d.total || 0), 1);
  return `<div class="chart-container">${data.map(d => `
    <div class="chart-bar-wrap">
      <div class="chart-bar-val">${d.total}</div>
      <div class="chart-bar" style="height:${Math.max(((d.total || 0) / max) * 160, 4)}px" title="${d.bulan}: ${d.total} usulan"></div>
      <div class="chart-bar-lbl">${d.bulan}</div>
    </div>`).join('')}</div>`;
}

// ============== USULAN TABLE HELPER ==============
function renderUsulanTable(rows, role) {
  if (!rows || rows.length === 0) {
    return `<div class="empty-state" style="padding:32px"><span class="material-icons">inbox</span><p>Belum ada data usulan</p></div>`;
  }
  const actionBtn = (u) => {
    if (role === 'operator') {
      return `<button class="btn-icon view" onclick="viewDetail('${u.idUsulan}')" title="Detail"><span class="material-icons">visibility</span></button>
              ${u.statusGlobal === 'Draft' ? `<button class="btn-icon edit" onclick="openIndikatorModal('${u.idUsulan}')" title="Input"><span class="material-icons">edit</span></button>` : ''}`;
    }
    if (['kapus', 'program', 'admin'].includes(role)) {
      return `<button class="btn-icon view" onclick="viewDetail('${u.idUsulan}')" title="Detail"><span class="material-icons">visibility</span></button>
              <button class="btn-icon approve" onclick="openVerifikasi('${u.idUsulan}')" title="Verifikasi"><span class="material-icons">rate_review</span></button>`;
    }
    return `<button class="btn-icon view" onclick="viewDetail('${u.idUsulan}')" title="Detail"><span class="material-icons">visibility</span></button>`;
  };

  return `<div class="table-container"><table>
    <thead><tr><th>ID Usulan</th><th>Puskesmas</th><th>Periode</th><th>Status</th><th>Dibuat</th><th>Aksi</th></tr></thead>
    <tbody>${rows.map(u => `<tr>
      <td><span style="font-family:'JetBrains Mono',monospace;font-weight:600;font-size:12px;">${u.idUsulan}</span></td>
      <td>${u.namaPKM || u.kodePKM}</td>
      <td>${u.namaBulan || ''} ${u.tahun}</td>
      <td>${statusBadge(u.statusGlobal)}</td>
      <td style="font-size:12px;color:var(--text-light)">${formatDate(u.createdAt)}</td>
      <td>${actionBtn(u)}</td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

// ============== INPUT USULAN (OPERATOR) ==============
async function renderInput() {
  let pkmList = [], periodeAktif = null;
  try {
    pkmList = await API.getPKM(true);
    const periodeRes = await API.get('periode');
    const today = new Date();
    periodeAktif = periodeRes.find(p => p.isAktifToday);
  } catch (e) {}

  const isOp = currentUser.role === 'Operator';
  const pkmSelect = isOp && currentUser.kodePKM
    ? `<select class="form-control" id="inputPKM" disabled><option value="${currentUser.kodePKM}">${currentUser.kodePKM}</option></select>`
    : `<select class="form-control" id="inputPKM"><option value="">Pilih Puskesmas</option>${pkmList.map(p => `<option value="${p.kode}">${p.nama}</option>`).join('')}</select>`;

  if (isOp && currentUser.kodePKM) {
    // auto set
    setTimeout(() => { const el = document.getElementById('inputPKM'); if (el) el.value = currentUser.kodePKM; }, 100);
  }

  document.getElementById('mainContent').innerHTML = `
    <div class="page-header">
      <h1><span class="material-icons">edit</span>Input Usulan Baru</h1>
    </div>
    ${periodeAktif ? `<div class="info-card info"><span class="material-icons">event</span><div class="info-card-text"><strong>Periode Aktif:</strong> ${periodeAktif.namaBulan} ${periodeAktif.tahun} — s/d ${formatDate(periodeAktif.tanggalSelesai)}</div></div>` : '<div class="info-card warning"><span class="material-icons">warning</span><div class="info-card-text">Tidak ada periode input aktif. Hubungi Admin.</div></div>'}
    <div class="card">
      <div class="card-header-bar"><span class="card-title"><span class="material-icons">add_circle</span>Buat Usulan</span></div>
      <div class="card-body">
        <div class="form-row">
          <div class="form-group"><label>Puskesmas</label>${pkmSelect}</div>
          <div class="form-group"><label>Tahun</label><select class="form-control" id="inputTahun">${yearOptions(CURRENT_YEAR)}</select></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Bulan</label><select class="form-control" id="inputBulan">${bulanOptions(CURRENT_BULAN)}</select></div>
        </div>
        <div style="display:flex;justify-content:flex-end;">
          <button class="btn btn-primary" onclick="createUsulan()">
            <span class="material-icons">add</span>Buat Usulan
          </button>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-header-bar"><span class="card-title"><span class="material-icons">list</span>Daftar Usulan Saya</span></div>
      <div class="card-body" style="padding:0" id="myUsulanTable"></div>
    </div>`;

  loadMyUsulan();
}

async function loadMyUsulan() {
  try {
    const rows = await API.getUsulan({ email_operator: currentUser.email });
    document.getElementById('myUsulanTable').innerHTML = `
      <div class="table-container"><table>
        <thead><tr><th>ID Usulan</th><th>Puskesmas</th><th>Periode</th><th>Status</th><th>Aksi</th></tr></thead>
        <tbody>${rows.length ? rows.map(u => `<tr>
          <td><span style="font-family:'JetBrains Mono',monospace;font-weight:600;font-size:12px;">${u.idUsulan}</span></td>
          <td>${u.namaPKM || u.kodePKM}</td>
          <td>${u.namaBulan} ${u.tahun}</td>
          <td>${statusBadge(u.statusGlobal)}</td>
          <td>
            <button class="btn-icon view" onclick="viewDetail('${u.idUsulan}')"><span class="material-icons">visibility</span></button>
            ${u.statusGlobal === 'Draft' ? `<button class="btn-icon edit" onclick="openIndikatorModal('${u.idUsulan}')"><span class="material-icons">edit</span></button>` : ''}
            ${u.statusGlobal === 'Draft' ? `<button class="btn-icon del" onclick="deleteUsulan('${u.idUsulan}')"><span class="material-icons">delete</span></button>` : ''}
          </td>
        </tr>`).join('') : `<tr><td colspan="5"><div class="empty-state" style="padding:24px"><p>Belum ada usulan</p></div></td></tr>`}
        </tbody>
      </table></div>`;
  } catch (e) { toast(e.message, 'error'); }
}

async function createUsulan() {
  const kodePKM = document.getElementById('inputPKM').value;
  const tahun = document.getElementById('inputTahun').value;
  const bulan = document.getElementById('inputBulan').value;
  const namaBulan = BULAN_NAMA[parseInt(bulan)];

  if (!kodePKM) return toast('Pilih puskesmas terlebih dahulu', 'error');

  // Cek apakah sudah ada usulan untuk periode ini
  setLoading(true);
  try {
    const existing = await API.getUsulan({ email_operator: currentUser.email });
    const duplikat = existing.find(u => u.kodePKM === kodePKM && u.tahun == tahun && u.bulan == bulan);
    if (duplikat) {
      setLoading(false);
      return toast(`Usulan untuk ${namaBulan} ${tahun} sudah ada (${duplikat.idUsulan}). Setiap puskesmas hanya dapat mengajukan 1 usulan per periode.`, 'warning');
    }

    const result = await API.buatUsulan({ kodePKM, tahun: parseInt(tahun), bulan: parseInt(bulan), emailOperator: currentUser.email });
    toast(`Usulan ${result.idUsulan} berhasil dibuat`);
    loadMyUsulan();
    setTimeout(() => openIndikatorModal(result.idUsulan), 500);
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    setLoading(false);
  }
}

async function deleteUsulan(idUsulan) {
  showConfirm({ title: 'Hapus Usulan', message: `Hapus usulan ${idUsulan}? Data tidak dapat dikembalikan.`,
    onConfirm: async () => {
      try {
        await API.del('usulan', { idUsulan });
        toast('Usulan berhasil dihapus');
        loadMyUsulan();
      } catch (e) { toast(e.message, 'error'); }
    }
  });
}

// ============== INDIKATOR INPUT MODAL ==============
let currentIndikatorUsulan = null;
let indikatorData = [];

// FUNGSI UNTUK MEMBUKA GOOGLE DRIVE (1 FOLDER SAJA)
async function openGDriveFolder() {
  const btn = document.getElementById('btnOpenDrive');
  if (btn) {
    btn.innerHTML = '<span class="material-icons" style="animation:spin 0.8s linear infinite;font-size:16px">refresh</span> Membuka...';
    btn.disabled = true;
  }
  
  try {
    // LANGSUNG BUKA ROOT FOLDER (GANTI DENGAN LINK FOLDER ANDA)
    const folderUrl = 'https://drive.google.com/drive/folders/1WYRRcm5oxbCaPx8s9XNUkTUe1b85wuDG';
    
    // Buka folder di tab baru
    window.open(folderUrl, '_blank');
    
    toast('Folder berhasil dibuka', 'success');
    
  } catch (e) {
    console.error('Open folder error:', e);
    toast('Gagal membuka folder: ' + e.message, 'error');
  } finally {
    if (btn) {
      btn.innerHTML = '<span class="material-icons" style="font-size:16px">open_in_new</span> Buka Google Drive';
      btn.disabled = false;
    }
  }
}

// FUNGSI UTAMA UNTUK MEMBUKA MODAL INDIKATOR
async function openIndikatorModal(idUsulan) {
  currentIndikatorUsulan = idUsulan;
  document.getElementById('indModalId').textContent = idUsulan;
  showModal('indikatorModal');
  document.getElementById('indikatorInputBody').innerHTML = `<tr><td colspan="8"><div class="empty-state" style="padding:20px"><p>Memuat data...</p></div></td></tr>`;

  try {
    const [detail, inds] = await Promise.all([
      API.getDetailUsulan(idUsulan), 
      API.getIndikatorUsulan(idUsulan)
    ]);
    
    indikatorData = inds;
    const isLocked = detail.isLocked || detail.statusGlobal !== 'Draft';
    const namaBulan = BULAN_NAMA[detail.bulan] || detail.bulan;

    document.getElementById('indModalSPM').textContent = parseFloat(detail.indeksSPM).toFixed(4);
    document.getElementById('btnSubmitFromModal').style.display = isLocked ? 'none' : 'flex';

    // INSTRUKSI UPLOAD KE 1 FOLDER GOOGLE DRIVE
    const infoEl = document.getElementById('indModalInfo');
    if (infoEl) {
      infoEl.innerHTML = `
        <div style="background:var(--info-light); border-radius:8px; padding:16px;">
          <div style="display:flex; align-items:flex-start; gap:12px;">
            <span class="material-icons" style="color:var(--info); font-size:24px;">info</span>
            <div style="flex:1;">
              <div style="font-weight:700; margin-bottom:8px;">📎 CARA UPLOAD DATA DUKUNG:</div>
              <ol style="margin-left:20px; margin-bottom:8px; line-height:1.6;">
                <li>Klik tombol <strong>"Buka Google Drive"</strong> di bawah</li>
                <li>Upload file ke folder <strong>"DATA DUKUNG SPM"</strong></li>
                <li><strong>Rename file</strong> dengan format: <br>
                  <code style="background:white; padding:4px 8px; border-radius:4px; display:inline-block; margin:4px 0; font-size:12px;">
                  ${detail.kodePKM}-${detail.tahun}-${detail.bulan}-Indikator${inds[0]?.no || 'X'}-NamaFile
                  </code>
                </li>
                <li>Klik kanan file → <strong>Bagikan → Salin link</strong></li>
                <li>Paste link di kolom <strong>"Link Bukti"</strong> di bawah</li>
              </ol>
            </div>
            <button id="btnOpenDrive" class="btn btn-primary" 
              onclick="openGDriveFolder()" style="white-space:nowrap;">
              <span class="material-icons" style="font-size:16px">open_in_new</span> Buka Google Drive
            </button>
          </div>
        </div>`;
    }

    // TABLE INDIKATOR
    document.getElementById('indikatorInputBody').innerHTML = inds.map(ind => `
      <tr id="indRow-${ind.no}">
        <td><span style="font-family:'JetBrains Mono';font-weight:700">${ind.no}</span></td>
        <td style="max-width:240px;font-size:13px">${ind.nama}</td>
        <td style="text-align:center">${ind.bobot}</td>
        <td>${isLocked ? `<span>${ind.target}</span>` : `<input type="number" id="t-${ind.no}" value="${ind.target}" min="0" max="100" step="0.01" onchange="saveIndikator(${ind.no})" style="width:70px;">`}</td>
        <td>${isLocked ? `<span>${ind.realisasi}</span>` : `<input type="number" id="r-${ind.no}" value="${ind.realisasi}" min="0" step="0.01" onchange="saveIndikator(${ind.no})" style="width:70px;">`}</td>
        <td class="rasio-cell" id="rasio-${ind.no}">${(ind.realisasiRasio * 100).toFixed(1)}%</td>
        <td class="rasio-cell" id="nilai-${ind.no}">${parseFloat(ind.nilaiTerbobot).toFixed(2)}</td>
        <td>
          ${isLocked
            ? (ind.linkFile ? `<a href="${ind.linkFile}" target="_blank" style="color:var(--primary);display:inline-flex;align-items:center;gap:2px"><span class="material-icons" style="font-size:15px">open_in_new</span>Lihat</a>` : '-')
            : `<div style="display:flex;align-items:center;gap:4px">
                <input type="text" id="link-${ind.no}" value="${ind.linkFile||''}" placeholder="Paste link Drive..."
                  style="width:130px;padding:4px 6px;border:1.5px solid var(--border);border-radius:6px;font-size:12px"
                  onchange="saveIndikator(${ind.no})">
                ${ind.linkFile ? `<a href="${ind.linkFile}" target="_blank" class="btn-icon view" title="Buka"><span class="material-icons" style="font-size:15px">open_in_new</span></a>` : ''}
               </div>`
          }
        </td>
      </tr>`).join('');
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function saveIndikator(noIndikator) {
  const target = parseFloat(document.getElementById(`t-${noIndikator}`)?.value) || 0;
  const realisasi = parseFloat(document.getElementById(`r-${noIndikator}`)?.value) || 0;
  const linkFile = document.getElementById(`link-${noIndikator}`)?.value || '';

  try {
    const result = await API.updateIndikatorUsulan({
      idUsulan: currentIndikatorUsulan, noIndikator,
      target, realisasi, linkFile
    });

    // Update UI
    document.getElementById(`rasio-${noIndikator}`).textContent = (result.rasio * 100).toFixed(1) + '%';
    document.getElementById(`nilai-${noIndikator}`).textContent = parseFloat(result.nilaiTerbobot).toFixed(2);

    // Refresh SPM
    const detail = await API.getDetailUsulan(currentIndikatorUsulan);
    document.getElementById('indModalSPM').textContent = parseFloat(detail.indeksSPM).toFixed(4);
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function submitUsulanFromModal() {
  showConfirm({
    title: 'Submit Usulan', message: 'Submit usulan ke Kepala Puskesmas untuk diverifikasi?',
    type: 'warning', icon: 'send',
    onConfirm: async () => {
      try {
        await API.submitUsulan({ idUsulan: currentIndikatorUsulan, email: currentUser.email });
        toast('Usulan berhasil disubmit ke Kapus!');
        closeModal('indikatorModal');
        loadMyUsulan();
      } catch (e) { toast(e.message, 'error'); }
    }
  });
}

// ============== DETAIL MODAL ==============
async function viewDetail(idUsulan) {
  document.getElementById('detailModalId').textContent = idUsulan;
  showModal('detailModal');
  document.getElementById('detailModalBody').innerHTML = `<div class="empty-state"><p>Memuat...</p></div>`;

  try {
    const [detail, inds] = await Promise.all([API.getDetailUsulan(idUsulan), API.getIndikatorUsulan(idUsulan)]);

    document.getElementById('detailModalBody').innerHTML = `
      <div class="detail-grid">
        <div class="detail-item"><label>Puskesmas</label><span>${detail.namaPKM}</span></div>
        <div class="detail-item"><label>Periode</label><span>${detail.namaBulan} ${detail.tahun}</span></div>
        <div class="detail-item"><label>Status</label><span>${statusBadge(detail.statusGlobal)}</span></div>
        <div class="detail-item"><label>Dibuat Oleh</label><span>${detail.createdBy}</span></div>
        <div class="detail-item"><label>Indeks Kinerja</label><span style="font-family:'JetBrains Mono'">${parseFloat(detail.indeksKinerja).toFixed(4)}</span></div>
        <div class="detail-item"><label>Indeks Beban</label><span style="font-family:'JetBrains Mono'">${parseFloat(detail.indeksBeban).toFixed(2)}</span></div>
        <div class="detail-item" style="grid-column:span 2"><label>Indeks SPM</label><span style="font-family:'JetBrains Mono';font-size:20px;color:var(--primary);font-weight:800">${parseFloat(detail.indeksSPM).toFixed(4)}</span></div>
      </div>
      <div style="font-weight:700;font-size:13.5px;margin-bottom:10px;">Detail Indikator</div>
      <div class="table-container">
        <table>
          <thead><tr><th>No</th><th>Indikator</th><th>Target</th><th>Realisasi</th><th>Rasio</th><th>Bobot</th><th>Nilai</th></tr></thead>
          <tbody>${inds.map(i => `<tr>
            <td>${i.no}</td><td style="max-width:260px;font-size:13px">${i.nama}</td>
            <td>${i.target}</td><td>${i.realisasi}</td>
            <td class="rasio-cell">${(i.realisasiRasio * 100).toFixed(1)}%</td>
            <td>${i.bobot}</td><td class="rasio-cell">${parseFloat(i.nilaiTerbobot).toFixed(2)}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
      <div style="margin-top:16px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
        ${approvalBox('Kapus', detail.statusProgram === 'Disetujui' ? detail.finalApprovedBy : '', detail.finalApprovedAt)}
        ${approvalBox('Program', detail.statusFinal === 'Disetujui' ? detail.finalApprovedBy : '', '')}
        ${approvalBox('Admin', detail.statusGlobal === 'Selesai' ? detail.finalApprovedBy : '', detail.finalApprovedAt)}
      </div>`;
  } catch (e) {
    toast(e.message, 'error');
  }
}

function approvalBox(label, by, at) {
  const color = by ? 'var(--success-light)' : 'var(--border-light)';
  const textColor = by ? '#065f46' : 'var(--text-light)';
  return `<div style="background:${color};border-radius:10px;padding:12px;">
    <div style="font-size:11px;font-weight:700;color:${textColor};text-transform:uppercase;letter-spacing:0.5px">${label}</div>
    <div style="font-size:13px;margin-top:4px;font-weight:600">${by || 'Belum'}</div>
    ${at ? `<div style="font-size:11px;color:var(--text-light)">${formatDateTime(at)}</div>` : ''}
  </div>`;
}

// ============== VERIFIKASI ==============
async function renderVerifikasi() {
  const role = currentUser.role;
  let statusFilter = '';
  if (role === 'Kapus') statusFilter = 'Menunggu Kapus';
  else if (role === 'Pengelola Program') statusFilter = 'Menunggu Program';
  else if (role === 'Admin') statusFilter = ''; // all

  document.getElementById('mainContent').innerHTML = `
    <div class="page-header">
      <h1><span class="material-icons">verified</span>Verifikasi Usulan${role === 'Pengelola Program' ? ` — Indikator: ${currentUser.indikatorAksesString || 'Semua'}` : ''}</h1>
    </div>
    ${role === 'Admin' ? `<div class="tabs" id="verifTabs">
      <div class="tab active" onclick="loadVerifTab('semua')">Semua</div>
      <div class="tab" onclick="loadVerifTab('Menunggu Admin')">Menunggu Admin</div>
      <div class="tab" onclick="loadVerifTab('Selesai')">Selesai</div>
      <div class="tab" onclick="loadVerifTab('Ditolak')">Ditolak</div>
    </div>` : ''}
    <div class="card">
      <div class="card-body" style="padding:0" id="verifTable">
        <div class="empty-state" style="padding:32px"><span class="material-icons">hourglass_empty</span><p>Memuat data...</p></div>
      </div>
    </div>`;

  loadVerifData(statusFilter || 'semua');
}

async function loadVerifTab(status) {
  document.querySelectorAll('#verifTabs .tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  loadVerifData(status);
}

async function loadVerifData(status) {
  const params = {};
  const role = currentUser.role;

  if (role === 'Kapus') { params.kode_pkm = currentUser.kodePKM; params.status = 'Menunggu Kapus'; }
  else if (role === 'Pengelola Program') { params.status = 'Menunggu Program'; }
  else if (role === 'Admin' && status !== 'semua') { params.status = status; }

  try {
    const rows = await API.getUsulan(params);
    const verifRole = role === 'Kapus' ? 'kapus' : role === 'Pengelola Program' ? 'program' : 'admin';
    document.getElementById('verifTable').innerHTML = renderUsulanTable(rows, verifRole);
  } catch (e) { toast(e.message, 'error'); }
}

async function openVerifikasi(idUsulan) {
  verifCurrentUsulan = idUsulan;
  document.getElementById('verifModalId').textContent = idUsulan;
  document.getElementById('verifCatatan').value = '';
  showModal('verifikasiModal');
  document.getElementById('verifIndikatorBody').innerHTML = `<tr><td colspan="7"><div class="empty-state" style="padding:20px"><p>Memuat...</p></div></td></tr>`;

  try {
    const [detail, inds] = await Promise.all([API.getDetailUsulan(idUsulan), API.getIndikatorUsulan(idUsulan)]);

    document.getElementById('verifDetailGrid').innerHTML = `
      <div class="detail-item"><label>Puskesmas</label><span>${detail.namaPKM}</span></div>
      <div class="detail-item"><label>Periode</label><span>${detail.namaBulan} ${detail.tahun}</span></div>
      <div class="detail-item"><label>Status</label><span>${statusBadge(detail.statusGlobal)}</span></div>
      <div class="detail-item"><label>Dibuat</label><span>${detail.createdBy}</span></div>
      <div class="detail-item"><label>Indeks Kinerja</label><span style="font-family:'JetBrains Mono'">${parseFloat(detail.indeksKinerja).toFixed(4)}</span></div>
      <div class="detail-item"><label>Indeks SPM</label><span style="font-family:'JetBrains Mono';font-size:16px;font-weight:800;color:var(--primary)">${parseFloat(detail.indeksSPM).toFixed(4)}</span></div>`;

    // Filter inds for program role
    let displayInds = inds;
    if (currentUser.role === 'Pengelola Program' && currentUser.indikatorAkses.length > 0) {
      displayInds = inds.filter(i => currentUser.indikatorAkses.includes(parseInt(i.no)));
    }

    document.getElementById('verifIndikatorBody').innerHTML = displayInds.map(i => `<tr>
      <td>${i.no}</td><td style="font-size:13px">${i.nama}</td>
      <td>${i.target}</td><td>${i.realisasi}</td>
      <td class="rasio-cell">${(i.realisasiRasio * 100).toFixed(1)}%</td>
      <td>${i.bobot}</td><td class="rasio-cell">${parseFloat(i.nilaiTerbobot).toFixed(2)}</td>
    </tr>`).join('');

    // Adjust buttons based on status
    const canApprove = (currentUser.role === 'Kapus' && detail.statusGlobal === 'Menunggu Kapus') ||
      (currentUser.role === 'Pengelola Program' && detail.statusGlobal === 'Menunggu Program') ||
      (currentUser.role === 'Admin' && detail.statusGlobal === 'Menunggu Admin');

    document.getElementById('btnApprove').disabled = !canApprove;
    document.getElementById('btnReject').disabled = !canApprove;
  } catch (e) { toast(e.message, 'error'); }
}

async function doApprove() {
  const catatan = document.getElementById('verifCatatan').value;
  const role = currentUser.role;
  setLoading(true);
  try {
    if (role === 'Kapus') await API.approveKapus({ idUsulan: verifCurrentUsulan, email: currentUser.email, catatan });
    else if (role === 'Pengelola Program') await API.approveProgram({ idUsulan: verifCurrentUsulan, email: currentUser.email, catatan });
    else if (role === 'Admin') await API.approveAdmin({ idUsulan: verifCurrentUsulan, email: currentUser.email, catatan });
    toast('Usulan berhasil disetujui!');
    closeModal('verifikasiModal');
    renderVerifikasi();
  } catch (e) { toast(e.message, 'error'); }
  finally { setLoading(false); }
}

async function doReject() {
  const catatan = document.getElementById('verifCatatan').value;
  if (!catatan) return toast('Isi alasan penolakan', 'warning');
  setLoading(true);
  try {
    await API.rejectUsulan({ idUsulan: verifCurrentUsulan, email: currentUser.email, role: currentUser.role, alasan: catatan });
    toast('Usulan ditolak');
    closeModal('verifikasiModal');
    renderVerifikasi();
  } catch (e) { toast(e.message, 'error'); }
  finally { setLoading(false); }
}

// ============== LAPORAN ==============
async function renderLaporan() {
  const role = currentUser.role;
  document.getElementById('mainContent').innerHTML = `
    <div class="page-header">
      <h1><span class="material-icons">bar_chart</span>Laporan</h1>
      <button class="btn btn-primary" onclick="exportLaporan()"><span class="material-icons">download</span>Export CSV</button>
    </div>
    <div class="card">
      <div class="card-header-bar"><span class="card-title"><span class="material-icons">filter_list</span>Filter</span></div>
      <div class="card-body">
        <div class="filter-row">
          <select class="form-control" id="lapTahun" onchange="loadLaporan()">${yearOptions(CURRENT_YEAR)}</select>
          <select class="form-control" id="lapBulan" onchange="loadLaporan()"><option value="semua">Semua Bulan</option>${bulanOptions('')}</select>
          ${['Admin','Kadis'].includes(role) ? `<select class="form-control" id="lapPKM" onchange="loadLaporan()"><option value="semua">Semua Puskesmas</option></select>` : ''}
          <select class="form-control" id="lapStatus" onchange="loadLaporan()">
            <option value="semua">Semua Status</option>
            <option value="Selesai">Selesai</option>
            <option value="Menunggu Kapus">Menunggu Kapus</option>
            <option value="Menunggu Program">Menunggu Program</option>
            <option value="Menunggu Admin">Menunggu Admin</option>
            <option value="Ditolak">Ditolak</option>
          </select>
        </div>
      </div>
    </div>
    <div class="stats-grid" id="lapStats"></div>
    <div class="card">
      <div class="card-body" style="padding:0" id="lapTable"></div>
    </div>`;

  // Load PKM list for filter
  if (['Admin','Kadis'].includes(role)) {
    API.getPKM().then(pkm => {
      const sel = document.getElementById('lapPKM');
      if (sel) pkm.forEach(p => sel.innerHTML += `<option value="${p.kode}">${p.nama}</option>`);
    }).catch(() => {});
  }

  loadLaporan();
}

async function loadLaporan() {
  const params = { tahun: document.getElementById('lapTahun')?.value };
  const bulan = document.getElementById('lapBulan')?.value;
  const status = document.getElementById('lapStatus')?.value;
  const pkm = document.getElementById('lapPKM')?.value;

  if (bulan !== 'semua') params.bulan = bulan;
  if (status !== 'semua') params.status = status;
  if (pkm && pkm !== 'semua') params.kode_pkm = pkm;
  if (currentUser.role === 'Operator') params.email_operator = currentUser.email;
  if (currentUser.role === 'Kapus') params.kode_pkm = currentUser.kodePKM;

  try {
    const result = await API.getLaporan(params);
    const s = result.summary;

    document.getElementById('lapStats').innerHTML = `
      ${statCard('blue','assignment','Total Usulan', s.total)}
      ${statCard('green','check_circle','Selesai', s.selesai)}
      ${statCard('orange','pending','Pending', s.pending)}
      ${statCard('purple','trending_up','Rata-rata Indeks SPM', s.rataSPM)}`;

    window._laporanData = result.data;

    if (!result.data.length) {
      document.getElementById('lapTable').innerHTML = `<div class="empty-state" style="padding:32px"><span class="material-icons">inbox</span><p>Tidak ada data untuk filter ini</p></div>`;
      return;
    }

    document.getElementById('lapTable').innerHTML = `
      <div class="table-container"><table>
        <thead><tr><th>No</th><th>Puskesmas</th><th>Periode</th><th>Indikator</th><th>Total Nilai</th><th>Indeks Kinerja</th><th>Indeks Beban</th><th>Indeks SPM</th><th>Status</th><th>Aksi</th></tr></thead>
        <tbody>${result.data.map(r => `<tr>
          <td>${r.no}</td>
          <td>${r.namaPKM}</td>
          <td>${r.namaBulan} ${r.tahun}</td>
          <td style="text-align:center">${r.totalIndikator}</td>
          <td class="rasio-cell">${r.totalNilai}</td>
          <td class="rasio-cell">${r.indeksKinerja}</td>
          <td class="rasio-cell">${r.indeksBeban}</td>
          <td class="rasio-cell" style="font-weight:700;color:var(--primary)">${r.indeksSPM}</td>
          <td>${statusBadge(r.statusGlobal)}</td>
          <td><button class="btn-icon view" onclick="viewDetail('${r.idUsulan}')"><span class="material-icons">visibility</span></button></td>
        </tr>`).join('')}
        </tbody>
      </table></div>`;
  } catch (e) { toast(e.message, 'error'); }
}

function exportLaporan() {
  const data = window._laporanData;
  if (!data || !data.length) return toast('Tidak ada data untuk diekspor', 'warning');

  const headers = ['No','ID Usulan','Puskesmas','Periode','Total Nilai','Indeks Kinerja','Indeks Beban','Indeks SPM','Status'];
  const rows = data.map(r => [r.no, r.idUsulan, r.namaPKM, `${r.namaBulan} ${r.tahun}`, r.totalNilai, r.indeksKinerja, r.indeksBeban, r.indeksSPM, r.statusGlobal]);
  const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'laporan_spm.csv'; a.click();
  URL.revokeObjectURL(url);
  toast('File CSV berhasil diunduh');
}

// ============== ADMIN - USERS ==============
let allUsers = [], allPKMList = [], allIndList = [];

async function renderUsers() {
  document.getElementById('mainContent').innerHTML = `
    <div class="page-header">
      <h1><span class="material-icons">group</span>Kelola User</h1>
      <button class="btn btn-primary" onclick="openUserModal()"><span class="material-icons">person_add</span>Tambah User</button>
    </div>
    <div class="card">
      <div class="card-body" style="padding:12px 16px">
        <div class="search-row">
          <div class="search-input-wrap"><span class="material-icons search-icon">search</span><input class="search-input" id="searchUser" placeholder="Cari email atau nama..." oninput="filterUsers()"></div>
          <select class="form-control" id="filterRole" onchange="filterUsers()" style="width:160px">
            <option value="">Semua Role</option>
            <option>Admin</option><option>Operator</option><option>Kapus</option>
            <option>Pengelola Program</option><option>Kadis</option>
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
        <div class="modal-body">
          <div class="form-group"><label>Email *</label><input class="form-control" id="uEmail" type="email" placeholder="user@example.com"></div>
          <div class="form-group"><label>Nama *</label><input class="form-control" id="uNama" placeholder="Nama Lengkap"></div>
          <div class="form-group"><label>Role *</label>
            <select class="form-control" id="uRole" onchange="checkUserRole()">
              <option>Admin</option><option>Operator</option><option>Kapus</option>
              <option>Pengelola Program</option><option>Kadis</option>
            </select></div>
          <div id="pkmContainer" style="display:none" class="form-group"><label>Puskesmas</label>
            <select class="form-control" id="uPKM"><option value="">Pilih Puskesmas</option></select></div>
          <div id="indContainer" style="display:none" class="form-group">
            <label>Indikator Akses</label>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <span style="font-size:12px;color:var(--text-light)">Centang indikator yang dapat diakses</span>
              <div style="display:flex;gap:8px">
                <button type="button" class="btn btn-secondary btn-sm" onclick="checkAllIndikator(true)">Pilih Semua</button>
                <button type="button" class="btn btn-secondary btn-sm" onclick="checkAllIndikator(false)">Hapus Semua</button>
              </div>
            </div>
            <div id="indCheckboxList" style="max-height:220px;overflow-y:auto;border:1.5px solid var(--border);border-radius:8px;padding:8px;background:white;display:grid;grid-template-columns:1fr 1fr;gap:4px"></div>
          </div>
          <div class="form-group"><label>Status</label>
            <select class="form-control" id="uAktif"><option value="true">Aktif</option><option value="false">Non-aktif</option></select></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal('userModal')">Batal</button>
          <button class="btn btn-primary" onclick="saveUser()"><span class="material-icons">save</span>Simpan</button>
        </div>
      </div>
    </div>`;

  // Load data
  try {
    [allUsers, allPKMList, allIndList] = await Promise.all([API.getUsers(), API.getPKM(), API.getIndikator()]);
    renderUsersTable(allUsers);

    // Fill PKM dropdown
    const pkmSel = document.getElementById('uPKM');
    allPKMList.forEach(p => pkmSel.innerHTML += `<option value="${p.kode}">${p.nama}</option>`);
  } catch (e) { toast(e.message, 'error'); }
}

function filterUsers() {
  const q = document.getElementById('searchUser').value.toLowerCase();
  const role = document.getElementById('filterRole').value;
  const filtered = allUsers.filter(u =>
    (!q || u.email.toLowerCase().includes(q) || u.nama.toLowerCase().includes(q)) &&
    (!role || u.role === role)
  );
  renderUsersTable(filtered);
}

function renderUsersTable(users) {
  const el = document.getElementById('usersTable');
  if (!el) return;
  el.innerHTML = `<div class="table-container"><table>
    <thead><tr><th>Email</th><th>Nama</th><th>Role</th><th>Puskesmas</th><th>Indikator</th><th>Status</th><th>Aksi</th></tr></thead>
    <tbody>${users.map(u => `<tr>
      <td style="font-family:'JetBrains Mono';font-size:12px">${u.email}</td>
      <td>${u.nama}</td>
      <td><span class="badge badge-info">${u.role}</span></td>
      <td>${u.namaPKM || u.kodePKM || '-'}</td>
      <td style="font-size:12px">${u.indikatorAkses || '-'}</td>
      <td>${u.aktif ? '<span class="badge badge-success">Aktif</span>' : '<span class="badge badge-default">Non-aktif</span>'}</td>
      <td style="display:flex;gap:4px">
        <button class="btn-icon edit" onclick="editUser('${u.email}')"><span class="material-icons">edit</span></button>
        <button class="btn-icon del" onclick="deleteUser('${u.email}')"><span class="material-icons">delete</span></button>
      </td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function checkUserRole() {
  const role = document.getElementById('uRole').value;
  document.getElementById('pkmContainer').style.display = ['Operator', 'Kapus'].includes(role) ? 'block' : 'none';
  document.getElementById('indContainer').style.display = role === 'Pengelola Program' ? 'block' : 'none';
  if (role === 'Pengelola Program') populateIndCheckbox([]);
}

function populateIndCheckbox(selectedNos = []) {
  const container = document.getElementById('indCheckboxList');
  if (!container || !allIndList.length) return;
  container.innerHTML = allIndList.filter(i => i.aktif).map(i => `
    <label style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;cursor:pointer;font-size:13px;transition:background 0.15s"
      onmouseover="this.style.background='var(--border-light)'" onmouseout="this.style.background=''">
      <input type="checkbox" value="${i.no}" ${selectedNos.includes(parseInt(i.no)) ? 'checked' : ''}
        style="width:15px;height:15px;accent-color:var(--primary);cursor:pointer;flex-shrink:0">
      <span><strong style="font-family:'JetBrains Mono';font-size:12px">${i.no}.</strong> ${i.nama}</span>
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
  document.getElementById('uEmail').value = '';
  document.getElementById('uEmail').readOnly = !!editEmail;
  document.getElementById('uNama').value = '';
  document.getElementById('uRole').value = 'Operator';
  document.getElementById('uPKM').value = '';
  document.getElementById('uAktif').value = 'true';
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
      if (user.role === 'Pengelola Program') {
        populateIndCheckbox(parseIndikatorAksesString(user.indikatorAkses || ''));
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
  const aktif = document.getElementById('uAktif').value === 'true';

  if (!email || !nama || !role) return toast('Email, nama, dan role harus diisi', 'error');

  const editEmail = document.getElementById('userModal').dataset.editEmail;
  setLoading(true);
  try {
    if (editEmail) {
      await API.updateUser({ email, nama, role, kodePKM, indikatorAkses, aktif });
    } else {
      await API.saveUser({ email, nama, role, kodePKM, indikatorAkses });
    }
    toast(`User berhasil ${editEmail ? 'diupdate' : 'ditambahkan'}`);
    closeModal('userModal');
    allUsers = await API.getUsers();
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
        allUsers = await API.getUsers();
        renderUsersTable(allUsers);
      } catch (e) { toast(e.message, 'error'); }
    }
  });
}

// ============== ADMIN - PKM ==============
let allPKM = [];

async function renderPKM() {
  document.getElementById('mainContent').innerHTML = `
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
          <div class="form-group"><label>Indeks Beban Kerja</label><input class="form-control" id="pIndeks" type="number" step="0.01" min="0" placeholder="Contoh: 1.5"></div>
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
  } catch (e) { toast(e.message, 'error'); }
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

function renderPKMTable(pkm) {
  const el = document.getElementById('pkmTable');
  if (!el) return;
  el.innerHTML = `<div class="table-container"><table>
    <thead><tr><th>Kode</th><th>Nama Puskesmas</th><th>Indeks Beban</th><th>Status</th><th>Aksi</th></tr></thead>
    <tbody>${pkm.map(p => `<tr>
      <td><span style="font-family:'JetBrains Mono';font-weight:700">${p.kode}</span></td>
      <td>${p.nama}</td>
      <td class="rasio-cell">${parseFloat(p.indeks).toFixed(2)}</td>
      <td>${p.aktif ? '<span class="badge badge-success">Aktif</span>' : '<span class="badge badge-default">Non-aktif</span>'}</td>
      <td style="display:flex;gap:4px">
        <button class="btn-icon edit" onclick="editPKM('${p.kode}')"><span class="material-icons">edit</span></button>
        <button class="btn-icon del" onclick="deletePKM('${p.kode}')"><span class="material-icons">delete</span></button>
      </td>
    </tr>`).join('')}</tbody>
  </table></div>`;
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
  const aktif = document.getElementById('pAktif').value === 'true';
  if (!kode || !nama) return toast('Kode dan nama harus diisi', 'error');
  const editKode = document.getElementById('pkmModal').dataset.editKode;
  setLoading(true);
  try {
    if (editKode) await API.updatePKM({ kode, nama, indeks, aktif });
    else await API.savePKM({ kode, nama, indeks, aktif });
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

// ============== ADMIN - INDIKATOR ==============
let allIndikator = [];

async function renderIndikator() {
  document.getElementById('mainContent').innerHTML = `
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
  } catch (e) { toast(e.message, 'error'); }
}

function filterInd() {
  const q = document.getElementById('searchInd').value.toLowerCase();
  renderIndTable(allIndikator.filter(i => !q || i.no.toString().includes(q) || i.nama.toLowerCase().includes(q)));
}

function renderIndTable(inds) {
  const el = document.getElementById('indTable');
  if (!el) return;
  const totalBobot = allIndikator.filter(i => i.aktif).reduce((s, i) => s + (parseInt(i.bobot) || 0), 0);
  const tbEl = document.getElementById('totalBobot');
  if (tbEl) tbEl.textContent = totalBobot;
  el.innerHTML = `<div class="table-container"><table>
    <thead><tr><th>No</th><th>Nama Indikator</th><th>Bobot</th><th>Status</th><th>Aksi</th></tr></thead>
    <tbody>${inds.map(i => `<tr>
      <td><span style="font-family:'JetBrains Mono';font-weight:700">${i.no}</span></td>
      <td>${i.nama}</td>
      <td style="text-align:center"><span style="font-family:'JetBrains Mono'">${i.bobot}</span></td>
      <td>${i.aktif ? '<span class="badge badge-success">Aktif</span>' : '<span class="badge badge-default">Non-aktif</span>'}</td>
      <td style="display:flex;gap:4px">
        <button class="btn-icon edit" onclick="editInd(${i.no})"><span class="material-icons">edit</span></button>
        <button class="btn-icon del" onclick="deleteInd(${i.no})"><span class="material-icons">delete</span></button>
      </td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function openIndModal(editNo = null) {
  document.getElementById('indModalTitle').textContent = editNo ? 'Edit Indikator' : 'Tambah Indikator';
  document.getElementById('iNo').value = '';
  document.getElementById('iNo').readOnly = !!editNo;
  document.getElementById('iNama').value = '';
  document.getElementById('iBobot').value = '';
  document.getElementById('iAktif').value = 'true';
  if (editNo) {
    const i = allIndikator.find(x => x.no == editNo);
    if (i) { document.getElementById('iNo').value = i.no; document.getElementById('iNama').value = i.nama; document.getElementById('iBobot').value = i.bobot; document.getElementById('iAktif').value = i.aktif ? 'true' : 'false'; }
    document.getElementById('indModal').dataset.editNo = editNo;
  } else { delete document.getElementById('indModal').dataset.editNo; }
  showModal('indModal');
}

function editInd(no) { openIndModal(no); }

async function saveInd() {
  const no = document.getElementById('iNo').value;
  const nama = document.getElementById('iNama').value.trim();
  const bobot = document.getElementById('iBobot').value;
  const aktif = document.getElementById('iAktif').value === 'true';
  if (!no || !nama) return toast('Nomor dan nama harus diisi', 'error');
  const editNo = document.getElementById('indModal').dataset.editNo;
  setLoading(true);
  try {
    if (editNo) await API.updateIndikator({ no, nama, bobot, aktif });
    else await API.saveIndikator({ no, nama, bobot, aktif });
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
async function renderPeriode() {
  const currentTahun = CURRENT_YEAR;
  document.getElementById('mainContent').innerHTML = `
    <div class="page-header">
      <h1><span class="material-icons">event_available</span>Kelola Periode Input</h1>
      <button class="btn btn-primary" onclick="openPeriodeModal()"><span class="material-icons">add</span>Atur Periode</button>
    </div>
    <div class="card">
      <div class="card-body" style="padding:12px 16px">
        <select class="form-control" id="filterTahunPeriode" style="width:150px" onchange="loadPeriodeGrid()">
          ${yearOptions(currentTahun)}
        </select>
      </div>
      <div class="card-body">
        <div class="info-card info"><span class="material-icons">info</span><div class="info-card-text">Periode aktif ditandai dengan warna hijau. Operator hanya bisa input pada periode yang aktif dan dalam rentang tanggal yang ditentukan.</div></div>
        <div id="periodeGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;margin-top:16px"></div>
      </div>
    </div>
    <div class="modal" id="periodeModal">
      <div class="modal-card">
        <div class="modal-header"><span class="material-icons">edit_calendar</span><h3>Atur Periode Input</h3>
          <button class="btn-icon" onclick="closeModal('periodeModal')"><span class="material-icons">close</span></button></div>
        <div class="modal-body">
          <div class="form-row">
            <div class="form-group"><label>Tahun</label><select class="form-control" id="pTahun">${yearOptions(currentTahun)}</select></div>
            <div class="form-group"><label>Bulan</label><select class="form-control" id="pBulan">${bulanOptions(CURRENT_BULAN)}</select></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Tanggal Mulai</label><input type="date" class="form-control" id="pMulai"></div>
            <div class="form-group"><label>Tanggal Selesai</label><input type="date" class="form-control" id="pSelesai"></div>
          </div>
          <div class="form-group"><label>Status</label>
            <select class="form-control" id="pStatus">
              <option value="Aktif">Aktif (Bisa diinput)</option>
              <option value="Tidak Aktif">Tidak Aktif</option>
            </select></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal('periodeModal')">Batal</button>
          <button class="btn btn-primary" onclick="savePeriode()"><span class="material-icons">save</span>Simpan</button>
        </div>
      </div>
    </div>`;

  loadPeriodeGrid();
}

async function loadPeriodeGrid() {
  const tahun = document.getElementById('filterTahunPeriode').value;
  try {
    const rows = await API.getPeriode(tahun);
    const grid = document.getElementById('periodeGrid');
    if (!rows.length) {
      grid.innerHTML = `<div class="empty-state"><p>Belum ada data periode untuk tahun ${tahun}</p></div>`;
      return;
    }
    grid.innerHTML = rows.map(p => {
      const isActive = p.isAktifToday;
      const borderColor = isActive ? 'var(--success)' : p.status === 'Aktif' ? 'var(--primary)' : 'var(--border)';
      const bg = isActive ? 'var(--success-light)' : 'var(--surface)';
      return `<div style="border:2px solid ${borderColor};border-radius:12px;padding:16px;background:${bg};cursor:pointer" onclick="editPeriode(${p.tahun},${p.bulan})">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="font-weight:700;font-size:15px">${p.namaBulan} ${p.tahun}</span>
          ${isActive ? '<span class="badge badge-success">Aktif Hari Ini</span>' : `<span class="badge ${p.status==='Aktif'?'badge-info':'badge-default'}">${p.status}</span>`}
        </div>
        <div style="font-size:12px;color:var(--text-light)">
          <div>Mulai: ${formatDate(p.tanggalMulai)}</div>
          <div>Selesai: ${formatDate(p.tanggalSelesai)}</div>
        </div>
      </div>`;
    }).join('');
  } catch (e) { toast(e.message, 'error'); }
}

async function openPeriodeModal() {
  document.getElementById('pTahun').value = CURRENT_YEAR;
  document.getElementById('pBulan').value = CURRENT_BULAN;
  document.getElementById('pMulai').value = '';
  document.getElementById('pSelesai').value = '';
  document.getElementById('pStatus').value = 'Aktif';
  showModal('periodeModal');
}

async function editPeriode(tahun, bulan) {
  try {
    const rows = await API.getPeriode(tahun);
    const p = rows.find(r => r.bulan == bulan);
    if (!p) return openPeriodeModal();
    document.getElementById('pTahun').value = p.tahun;
    document.getElementById('pBulan').value = p.bulan;
    document.getElementById('pMulai').value = p.tanggalMulai ? p.tanggalMulai.toString().substr(0, 10) : '';
    document.getElementById('pSelesai').value = p.tanggalSelesai ? p.tanggalSelesai.toString().substr(0, 10) : '';
    document.getElementById('pStatus').value = p.status;
    showModal('periodeModal');
  } catch (e) { openPeriodeModal(); }
}

async function savePeriode() {
  const tahun = parseInt(document.getElementById('pTahun').value);
  const bulan = parseInt(document.getElementById('pBulan').value);
  const tanggalMulai = document.getElementById('pMulai').value;
  const tanggalSelesai = document.getElementById('pSelesai').value;
  const status = document.getElementById('pStatus').value;
  if (!tanggalMulai || !tanggalSelesai) return toast('Tanggal mulai dan selesai harus diisi', 'error');
  setLoading(true);
  try {
    await API.savePeriode({ tahun, bulan, namaBulan: BULAN_NAMA[bulan], tanggalMulai, tanggalSelesai, status });
    toast('Periode berhasil disimpan');
    closeModal('periodeModal');
    loadPeriodeGrid();
  } catch (e) { toast(e.message, 'error'); }
  finally { setLoading(false); }
}

// ============== GLOBAL HELPERS ==============
function showModal(id) { document.getElementById(id)?.classList.add('show'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('show'); }
function setLoading(show) { document.getElementById('globalLoader').classList.toggle('show', show); }

// Close modal on backdrop click
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal')) {
    e.target.classList.remove('show');
  }
});

// Enter key on auth
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('authEmail').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doLogin();
  });
});
