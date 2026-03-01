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
  let roleText = currentUser.role;
  if (currentUser.namaPKM) {
    roleText = `${currentUser.role}`;
  }
  document.getElementById('sidebarRole').textContent = roleText;
  // Tampilkan nama puskesmas di bawah role kalau ada
  const sidebarPKMEl = document.getElementById('sidebarPKM');
  if (sidebarPKMEl) {
    if (currentUser.namaPKM) {
      sidebarPKMEl.textContent = currentUser.namaPKM;
      sidebarPKMEl.style.display = 'block';
    } else {
      sidebarPKMEl.style.display = 'none';
    }
  }
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
        { id: 'jabatan', icon: 'badge', label: 'Kelola Jabatan' },
        { id: 'pkm', icon: 'local_hospital', label: 'Kelola Puskesmas' },
        { id: 'indikator', icon: 'monitor_heart', label: 'Kelola Indikator' },
        { id: 'periode', icon: 'event_available', label: 'Periode Input' }
      ]},
      { label: 'Manajemen', items: [
        { id: 'kelola-usulan', icon: 'manage_accounts', label: 'Kelola Semua Usulan' }
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
  users: 'Kelola User', jabatan: 'Kelola Jabatan', pkm: 'Kelola Puskesmas',
  indikator: 'Kelola Indikator', periode: 'Periode Input', input: 'Input Usulan'
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
    'kelola-usulan': renderKelolaUsulan,
    jabatan: renderJabatan,
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
function yearOptions(selected, maxYear) {
  // Gunakan maxYear dari parameter, atau ambil dari state global, minimal CURRENT_YEAR+3
  const max = maxYear || window._maxPeriodeTahun || Math.max(CURRENT_YEAR + 3, 2030);
  const min = Math.min(2024, CURRENT_YEAR);
  let html = '';
  for (let y = min; y <= max; y++) {
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
    const viewBtn = `<button class="btn-icon view" onclick="viewDetail('${u.idUsulan}')" title="Detail"><span class="material-icons">visibility</span></button>`;
    if (role === 'operator') {
      return viewBtn +
        (u.statusGlobal === 'Draft' ? `<button class="btn-icon edit" onclick="openIndikatorModal('${u.idUsulan}')" title="Input"><span class="material-icons">edit</span></button>` : '') +
        (u.statusGlobal === 'Ditolak' ? `<button class="btn-icon edit" onclick="openIndikatorModal('${u.idUsulan}')" title="Perbaiki"><span class="material-icons">restart_alt</span></button>` : '');
    }
    // Tombol verifikasi hanya muncul kalau status SESUAI tahapan role
    const canVerif =
      (role === 'kapus'   && u.statusGlobal === 'Menunggu Kapus') ||
      (role === 'program' && (u.statusGlobal === 'Menunggu Program' || u.statusGlobal === 'Ditolak')) ||
      (role === 'admin'   && u.statusGlobal === 'Menunggu Admin');

    // Untuk Pengelola Program: cek apakah user ini sudah approve (sudahVerif flag dari server)
    const sudahVerif = role === 'program' && u.sudahVerif === true;

    let verifBtn;
    if (sudahVerif) {
      // Sudah approve — tampilkan tombol hijau terkunci
      verifBtn = `<button class="btn-icon" title="Anda sudah memverifikasi" style="background:#d1fae5;color:#065f46;cursor:default;border:1.5px solid #0d9488" disabled><span class="material-icons">check_circle</span></button>`;
    } else if (canVerif) {
      verifBtn = `<button class="btn-icon approve" onclick="openVerifikasi('${u.idUsulan}')" title="Verifikasi Sekarang" style="animation:pulse 1.5s infinite"><span class="material-icons">rate_review</span></button>`;
    } else {
      verifBtn = `<button class="btn-icon" title="Menunggu tahap sebelumnya" style="opacity:0.35;cursor:not-allowed" disabled><span class="material-icons">lock</span></button>`;
    }

    // Tombol download PDF — samping viewBtn, hanya kalau Selesai
    const pdfBtn = u.statusGlobal === 'Selesai'
      ? `<button class="btn-icon" onclick="downloadLaporanPDF('${u.idUsulan}')" title="Download Laporan PDF" style="background:#e0f2fe;color:#0369a1;border:1.5px solid #0369a1"><span class="material-icons">picture_as_pdf</span></button>`
      : '';

    if (['kapus', 'program', 'admin'].includes(role)) {
      return viewBtn + pdfBtn + verifBtn;
    }
    return viewBtn;
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
  let pkmList = [], periodeAktif = null, allPeriode = [], periodeOptions = [];
  try {
    [pkmList] = await Promise.all([API.getPKM(true)]);
    try {
      const periodeRes = await API.get('periode');
      allPeriode = Array.isArray(periodeRes) ? periodeRes : [];
      // Periode "Aktif" status (bukan cek hari ini) - semua yg berstatus Aktif bisa dipilih
      periodeOptions = allPeriode.filter(p => p.status === 'Aktif');
      periodeAktif = allPeriode.find(p => p.isAktifToday);
    } catch(e2) { /* periode API mungkin gagal, tetap lanjut */ }
  } catch (e) { toast(e.message, 'error'); }

  const isOp = currentUser.role === 'Operator';
  const pkmSelect = isOp && currentUser.kodePKM
    ? `<select class="form-control" id="inputPKM" disabled><option value="${currentUser.kodePKM}">${currentUser.namaPKM || currentUser.kodePKM}</option></select>`
    : `<select class="form-control" id="inputPKM"><option value="">Pilih Puskesmas</option>${pkmList.map(p => `<option value="${p.kode}">${p.nama}</option>`).join('')}</select>`;

  // Tahun yang bisa dipilih: ambil dari periode berstatus Aktif
  // Jika tidak ada periode sama sekali, tampilkan tahun default
  const tahunAktif = [...new Set(periodeOptions.map(p => parseInt(p.tahun)))].sort();
  const defaultTahun = periodeAktif ? periodeAktif.tahun : (tahunAktif[0] || CURRENT_YEAR);
  const tahunSelectHtml = tahunAktif.length
    ? tahunAktif.map(y => `<option value="${y}" ${y == defaultTahun ? 'selected' : ''}>${y}</option>`).join('')
    : `<option value="${defaultTahun}">${defaultTahun}</option>`;

  // Info banner periode
  const periodeBanner = periodeAktif
    ? `<div class="info-card info"><span class="material-icons">event</span><div class="info-card-text"><strong>Periode Aktif Hari Ini:</strong> ${periodeAktif.namaBulan} ${periodeAktif.tahun} — s/d ${formatDate(periodeAktif.tanggalSelesai)}</div></div>`
    : periodeOptions.length
      ? `<div class="info-card warning"><span class="material-icons">schedule</span><div class="info-card-text">Ada periode aktif tapi di luar rentang tanggal hari ini. Pilih periode sesuai yang diizinkan Admin.</div></div>`
      : `<div class="info-card warning"><span class="material-icons">warning</span><div class="info-card-text">Tidak ada periode input aktif saat ini. Hubungi Admin.</div></div>`;

  document.getElementById('mainContent').innerHTML = `
    <div class="page-header">
      <h1><span class="material-icons">edit</span>Input Usulan Baru</h1>
    </div>
    ${periodeBanner}
    <div class="card">
      <div class="card-header-bar"><span class="card-title"><span class="material-icons">add_circle</span>Buat Usulan</span></div>
      <div class="card-body">
        <div class="form-row">
          <div class="form-group"><label>Puskesmas</label>${pkmSelect}</div>
          <div class="form-group"><label>Tahun</label>
            <select class="form-control" id="inputTahun" onchange="updateBulanOptions()">
              ${tahunAktif.length ? tahunSelectHtml : `<option value="${defaultTahun}">${defaultTahun}</option>`}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Bulan</label><select class="form-control" id="inputBulan"></select></div>
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

  // Simpan semua periodeOptions (berstatus Aktif) untuk updateBulanOptions
  window._periodeInputAktif = periodeOptions;
  setTimeout(() => updateBulanOptions(), 50);
  loadMyUsulan();
}

function updateBulanOptions() {
  const tahun = parseInt(document.getElementById('inputTahun')?.value);
  const sel = document.getElementById('inputBulan');
  if (!sel) return;
  const periodeOptions = window._periodeInputAktif || [];
  const bulanForTahun = periodeOptions.filter(p => p.tahun == tahun);
  if (bulanForTahun.length) {
    sel.innerHTML = bulanForTahun.map(p => `<option value="${p.bulan}">${p.namaBulan || BULAN_NAMA[p.bulan]}</option>`).join('');
  } else {
    // Fallback: semua bulan
    sel.innerHTML = BULAN_NAMA.slice(1).map((m,i) => `<option value="${i+1}">${m}</option>`).join('');
  }
}

async function loadMyUsulan() {
  try {
    const rows = await API.getUsulan({ email_operator: currentUser.email });
    document.getElementById('myUsulanTable').innerHTML = rows.length ? `
      <div class="table-container"><table>
        <thead><tr><th>ID Usulan</th><th>Puskesmas</th><th>Periode</th><th>Progress Verifikasi</th><th>Aksi</th></tr></thead>
        <tbody>${rows.map(u => `<tr>
          <td><span style="font-family:'JetBrains Mono',monospace;font-weight:600;font-size:12px;">${u.idUsulan}</span></td>
          <td>${u.namaPKM || u.kodePKM}</td>
          <td>${u.namaBulan} ${u.tahun}</td>
          <td style="min-width:220px">
            ${renderStatusBar(u)}
            ${u.statusGlobal === 'Ditolak' && u.alasanTolak ? `<div style="margin-top:4px;font-size:11px;color:#dc2626;background:#fef2f2;border-radius:5px;padding:3px 7px;display:inline-block"><span style="font-weight:700">Ditolak:</span> ${u.alasanTolak}</div>` : ''}
          </td>
          <td>
            <button class="btn-icon view" onclick="viewDetail('${u.idUsulan}')"><span class="material-icons">visibility</span></button>
            ${u.statusGlobal === 'Selesai' ? `<button class="btn-icon" onclick="downloadLaporanPDF('${u.idUsulan}')" title="Download Laporan PDF" style="background:#e0f2fe;color:#0369a1;border:1.5px solid #0369a1"><span class="material-icons">picture_as_pdf</span></button>` : ''}
            ${u.statusGlobal === 'Draft' ? `<button class="btn-icon edit" onclick="openIndikatorModal('${u.idUsulan}')"><span class="material-icons">edit</span></button>` : ''}
            ${u.statusGlobal === 'Draft' ? `<button class="btn-icon del" onclick="deleteUsulan('${u.idUsulan}')"><span class="material-icons">delete</span></button>` : ''}
            ${u.statusGlobal === 'Ditolak' ? `<button class="btn btn-warning btn-sm" onclick="openIndikatorModal('${u.idUsulan}')" style="background:#f59e0b;color:white;border-color:#f59e0b"><span class="material-icons" style="font-size:14px">restart_alt</span> Perbaiki & Ajukan Ulang</button>` : ''}
          </td>
        </tr>`).join('')}
        </tbody>
      </table></div>` : `<div class="empty-state" style="padding:32px"><span class="material-icons">inbox</span><p>Belum ada usulan</p></div>`;
  } catch (e) { toast(e.message, 'error'); }
}

async function createUsulan() {
  const kodePKM = document.getElementById('inputPKM').value;
  const tahun = parseInt(document.getElementById('inputTahun').value);
  const bulan = parseInt(document.getElementById('inputBulan').value);
  const namaBulanTxt = BULAN_NAMA[bulan] || 'bulan ini';
  if (!kodePKM) return toast('Pilih puskesmas terlebih dahulu', 'error');

  // Cek apakah periode yang dipilih valid (berstatus Aktif)
  const periodeOptions = window._periodeInputAktif || [];
  if (periodeOptions.length > 0) {
    const periodeValid = periodeOptions.find(p => parseInt(p.tahun) == tahun && parseInt(p.bulan) == bulan);
    if (!periodeValid) {
      toast(`Periode ${namaBulanTxt} ${tahun} tidak aktif. Pilih periode yang sudah dibuka oleh Admin.`, 'error');
      return;
    }
    // Cek rentang tanggal hari ini
    const today = new Date(); today.setHours(0,0,0,0);
    if (periodeValid.tanggalMulai && periodeValid.tanggalSelesai) {
      const mulai = new Date(periodeValid.tanggalMulai); mulai.setHours(0,0,0,0);
      const selesai = new Date(periodeValid.tanggalSelesai); selesai.setHours(23,59,59);
      if (today < mulai) {
        toast(`Periode ${namaBulanTxt} ${tahun} belum dibuka. Mulai input: ${formatDate(periodeValid.tanggalMulai)}`, 'warning');
        return;
      }
      if (today > selesai) {
        toast(`Periode ${namaBulanTxt} ${tahun} sudah ditutup pada ${formatDate(periodeValid.tanggalSelesai)}. Hubungi Admin.`, 'warning');
        return;
      }
    }
  }

  // Cek duplikat di sisi client
  const existingList = await API.getUsulan({ email_operator: currentUser.email }).catch(() => []);
  const duplikat = existingList.find(u => u.tahun == tahun && u.bulan == bulan);
  if (duplikat) {
    toast(`❌ Tidak dapat membuat usulan! Anda sudah memiliki usulan untuk ${namaBulanTxt} ${tahun} (ID: ${duplikat.idUsulan}). Hanya boleh 1 usulan per periode aktif.`, 'error');
    return;
  }

  setLoading(true);
  try {
    const result = await API.buatUsulan({ kodePKM, tahun, bulan, emailOperator: currentUser.email });
    toast(`Usulan ${result.idUsulan} berhasil dibuat! Silakan isi data indikator.`, 'success');
    loadMyUsulan();
    setTimeout(() => openIndikatorModal(result.idUsulan), 600);
  } catch (e) {
    toast(e.message, 'warning');
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

// Buka/buat folder Google Drive otomatis
async function openGDriveFolder(kodePKM, tahun, bulan, namaBulan, idUsulan) {
  const btn = document.getElementById('btnOpenDrive');
  if (btn) { btn.innerHTML = '<span class="material-icons" style="font-size:15px;animation:spin 0.8s linear infinite">refresh</span> Membuat folder...'; btn.disabled = true; }
  try {
    const result = await API.get('drive', { kodePKM, tahun, bulan, namaBulan });
    // Save folder URL to DB
    if (idUsulan) {
      await fetch(`/api/usulan?action=drive-folder`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idUsulan, driveFolderId: result.folderId, driveFolderUrl: result.folderUrl })
      });
    }
    window.open(result.folderUrl, '_blank');
    if (btn) { btn.innerHTML = '<span class="material-icons" style="font-size:15px">folder_open</span> Buka Folder Drive'; btn.disabled = false; }
    // Update link info
    const linkEl = document.getElementById('driveFolderLink');
    if (linkEl) { linkEl.href = result.folderUrl; linkEl.style.display = 'inline-flex'; }
  } catch (e) {
    toast('Gagal membuka Google Drive: ' + e.message, 'error');
    if (btn) { btn.innerHTML = '<span class="material-icons" style="font-size:15px">open_in_new</span> Buka Google Drive'; btn.disabled = false; }
  }
}

async function openIndikatorModal(idUsulan) {
  currentIndikatorUsulan = idUsulan;
  document.getElementById('indModalId').textContent = idUsulan;
  // Reset notifikasi dan tombol submit ke state awal
  const _lockNotif = document.getElementById('indModalLockNotif');
  if (_lockNotif) { _lockNotif.style.display = 'none'; _lockNotif.innerHTML = ''; }
  const _submitBtn = document.getElementById('btnSubmitFromModal');
  if (_submitBtn) _submitBtn.style.display = '';
  showModal('indikatorModal');
  document.getElementById('indikatorInputBody').innerHTML = `<tr><td colspan="8"><div class="empty-state" style="padding:20px"><p>Memuat data...</p></div></td></tr>`;

  try {
    const [detail, inds] = await Promise.all([API.getDetailUsulan(idUsulan), API.getIndikatorUsulan(idUsulan)]);
    indikatorData = inds;
    // Ditolak = bisa diedit ulang seperti Draft
    // Draft & Ditolak = bisa diedit. Status lain = read-only
    const isLocked = detail.statusGlobal !== 'Draft' && detail.statusGlobal !== 'Ditolak';
    const namaBulan = BULAN_NAMA[detail.bulan] || detail.bulan;

    document.getElementById('indModalSPM').textContent = parseFloat(detail.indeksSPM).toFixed(2);
    const isDraft = detail.statusGlobal === 'Draft';
    const isDitolak = detail.statusGlobal === 'Ditolak';
    const canSubmit = isDraft || isDitolak;
    const submitBtn = document.getElementById('btnSubmitFromModal');
    if (submitBtn) {
      submitBtn.style.display = canSubmit ? 'flex' : 'none';
      // Ubah label tombol untuk ajukan ulang
      submitBtn.innerHTML = isDitolak
        ? '<span class="material-icons">refresh</span> Ajukan Ulang ke Kapus'
        : '<span class="material-icons">send</span> Submit ke Kapus';
    }
    // Tampilkan banner status (bukan Draft dan bukan Ditolak = read-only)
    const _ln = document.getElementById('indModalLockNotif');
    if (_ln) {
      if (isDitolak && detail.alasanTolak) {
        _ln.innerHTML = `<span class="material-icons" style="color:#ef4444;font-size:18px">cancel</span><div><div style="font-weight:700;color:#dc2626">Ditolak oleh ${detail.ditolakOleh||'Verifikator'}</div><div style="font-size:12px;color:#7f1d1d">Alasan: ${detail.alasanTolak}</div></div>`;
        _ln.style.cssText = 'display:flex;align-items:flex-start;gap:8px;padding:10px 14px;background:#fef2f2;border-radius:8px;border:1.5px solid #fca5a5;flex:1;font-size:13px';
      } else if (!canSubmit) {
        const statusIcon = detail.statusGlobal === 'Selesai' ? 'verified' : 'hourglass_top';
        const statusColor = detail.statusGlobal === 'Selesai' ? '#0d9488' : '#f59e0b';
        _ln.innerHTML = `<span class="material-icons" style="color:${statusColor};font-size:18px">${statusIcon}</span><span style="font-weight:600;color:${statusColor}">Status: ${detail.statusGlobal}</span>`;
        _ln.style.display = 'flex';
      } else {
        _ln.style.display = 'none';
        _ln.innerHTML = '';
      }
    }

    // Sembunyikan info card - tidak diperlukan lagi
    const infoEl = document.getElementById('indModalInfo');
    if (infoEl) infoEl.style.display = 'none';

    // Update SPM top display
    const spmTopEl = document.getElementById('indModalSPMTop');
    if (spmTopEl) spmTopEl.textContent = parseFloat(detail.indeksSPM).toFixed(2);
    document.getElementById('indModalSPM').textContent = parseFloat(detail.indeksSPM).toFixed(2);

    document.getElementById('indikatorInputBody').innerHTML = inds.map(ind => {
      const hasBukti = !!ind.linkFile;
      const uploadBtnStyle = hasBukti
        ? 'display:inline-flex;align-items:center;gap:3px;padding:4px 9px;background:#0d9488;color:white;border-radius:6px;cursor:pointer;font-size:11.5px;font-weight:600;border:1.5px solid #0d9488;white-space:nowrap'
        : 'display:inline-flex;align-items:center;gap:3px;padding:4px 9px;background:#ef4444;color:white;border-radius:6px;cursor:pointer;font-size:11.5px;font-weight:600;border:1.5px solid #ef4444;white-space:nowrap';
      return `<tr id="indRow-${ind.no}">
        <td><span style="font-family:'JetBrains Mono';font-weight:700">${ind.no}</span></td>
        <td style="max-width:220px;font-size:12.5px">${ind.nama}</td>
        <td style="text-align:center"><input type="hidden" id="bobot-${ind.no}" value="${ind.bobot}">${ind.bobot}</td>
        <td>${isLocked ? `<span>${ind.target}</span>` : `<input type="number" id="t-${ind.no}" value="${ind.target}" min="0" step="0.01"
            style="width:72px;border:1.5px solid var(--border);border-radius:6px;padding:3px 6px;font-size:13px"
            onchange="saveIndikator(${ind.no})" oninput="previewSPM(${ind.no})">`}</td>
        <td>${isLocked ? `<span>${ind.capaian}</span>` : `<input type="number" id="c-${ind.no}" value="${ind.capaian}" min="0" step="0.01"
            style="width:72px;border:1.5px solid var(--border);border-radius:6px;padding:3px 6px;font-size:13px"
            onchange="saveIndikator(${ind.no})" oninput="previewSPM(${ind.no})">`}</td>
        <td style="min-width:100px;text-align:center">
          ${isLocked
            ? (hasBukti ? `<a href="${ind.linkFile}" target="_blank" style="color:#0d9488;display:inline-flex;align-items:center;gap:2px;font-size:12px"><span class="material-icons" style="font-size:14px">open_in_new</span>Lihat</a>` : '<span style="color:#94a3b8;font-size:12px">-</span>')
            : `<div id="uploadCell-${ind.no}" style="display:flex;flex-direction:column;align-items:center;gap:3px">
                ${hasBukti ? `<a href="${ind.linkFile}" target="_blank" style="font-size:10.5px;color:#0d9488;display:flex;align-items:center;gap:1px"><span class="material-icons" style="font-size:11px">open_in_new</span>Lihat</a>` : ''}
                <label id="uploadLabel-${ind.no}" style="${uploadBtnStyle}">
                  <span class="material-icons" style="font-size:13px">${hasBukti ? 'cloud_done' : 'upload_file'}</span>${hasBukti ? 'Ganti' : 'Upload'}
                  <input type="file" multiple style="display:none" onchange="uploadBuktiIndikator(event,${ind.no},'${idUsulan}','${detail.kodePKM}',${detail.tahun},${detail.bulan},'${namaBulan}')">
                </label>
              </div>`
          }
        </td>
      </tr>`;
    }).join('');
  } catch (e) {
    toast(e.message, 'error');
  }
}


// ============== UPLOAD BUKTI INDIKATOR ==============
async function uploadBuktiIndikator(event, noIndikator, idUsulan, kodePKM, tahun, bulan, namaBulan) {
  const files = Array.from(event.target.files);
  if (!files.length) return;

  const cell = document.getElementById(`uploadCell-${noIndikator}`);
  const statusDiv = document.createElement('div');
  statusDiv.style.cssText = 'font-size:11px;color:#0891b2';
  statusDiv.innerHTML = `<span class="material-icons" style="font-size:12px;animation:spin 0.8s linear infinite;vertical-align:middle">refresh</span> Mengupload ${files.length} file...`;
  cell.insertBefore(statusDiv, cell.firstChild);

  const uploadedLinks = [];
  for (const file of files) {
    try {
      // Read file as base64
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await fetch('/api/drive-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kodePKM, tahun, bulan, namaBulan, noIndikator,
          fileName: file.name, mimeType: file.type || 'application/octet-stream', fileData: base64
        })
      });
      const result = await res.json();
      // ok() wraps data in {success:true, data:{...}}
      if (!res.ok || !result.success) throw new Error(result.data?.error || result.message || result.error || 'Upload gagal');
      const fileUrl = result.data?.fileUrl || result.fileUrl;
      if (!fileUrl) throw new Error('URL file tidak ditemukan dalam response');
      uploadedLinks.push(fileUrl);
    } catch (e) {
      toast(`Gagal upload ${file.name}: ${e.message}`, 'error');
    }
  }

  if (uploadedLinks.length > 0) {
    const linkToSave = uploadedLinks[0]; // sudah berisi fileUrl yang benar
    const tVal = parseFloat(document.getElementById(`t-${noIndikator}`)?.value) || 0;
    const cVal = parseFloat(document.getElementById(`c-${noIndikator}`)?.value) || 0;
    await API.updateIndikatorUsulan({ idUsulan, noIndikator, target: tVal, capaian: cVal, linkFile: linkToSave });

    statusDiv.remove();

    // Update link tampilan
    const existingLink = cell.querySelector('a');
    const newLinkHtml = `<a href="${linkToSave}" target="_blank" style="font-size:10.5px;color:#0d9488;display:flex;align-items:center;gap:1px"><span class="material-icons" style="font-size:11px">open_in_new</span>${uploadedLinks.length} file</a>`;
    if (existingLink) existingLink.outerHTML = newLinkHtml;
    else cell.insertAdjacentHTML('afterbegin', newLinkHtml);

    // Ubah tombol upload → hijau
    const label = document.getElementById(`uploadLabel-${noIndikator}`);
    if (label) {
      label.style.cssText = 'display:inline-flex;align-items:center;gap:3px;padding:4px 9px;background:#0d9488;color:white;border-radius:6px;cursor:pointer;font-size:11.5px;font-weight:600;border:1.5px solid #0d9488;white-space:nowrap';
      label.querySelector('.material-icons').textContent = 'cloud_done';
      label.childNodes[1] && (label.childNodes[1].textContent = 'Ganti');
    }

    // Refresh SPM
    const spmDetail = await API.getDetailUsulan(idUsulan);
    const spmVal = parseFloat(spmDetail.indeksSPM).toFixed(2);
    document.getElementById('indModalSPM').textContent = spmVal;
    const topEl = document.getElementById('indModalSPMTop');
    if (topEl) topEl.textContent = spmVal;

    toast(`${uploadedLinks.length} file berhasil diupload!`, 'success');
  } else {
    statusDiv.remove();
  }
}
async function saveIndikator(noIndikator) {
  const target  = parseFloat(document.getElementById(`t-${noIndikator}`)?.value) || 0;
  const capaian = parseFloat(document.getElementById(`c-${noIndikator}`)?.value) || 0;

  try {
    // Kirim update — tanpa linkFile supaya link yg sudah ada tidak terhapus
    const res = await fetch('/api/usulan?action=indikator', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idUsulan: currentIndikatorUsulan, noIndikator, target, capaian })
    });
    const result = await res.json();
    if (!res.ok) { toast(result.error || 'Gagal simpan', 'error'); return; }

    // Update SPM display langsung dari response (tanpa extra API call)
    if (result.indeksSPM !== undefined) {
      const spmVal = parseFloat(result.indeksSPM).toFixed(2);
      document.getElementById('indModalSPM').textContent = spmVal;
      const topEl = document.getElementById('indModalSPMTop');
      if (topEl) topEl.textContent = spmVal;
    }
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function submitUsulanFromModal() {
  showConfirm({
    title: 'Submit Usulan',
    message: 'Submit usulan ke Kepala Puskesmas untuk diverifikasi?',
    type: 'warning', icon: 'send',
    onConfirm: async () => {
      await doSubmitUsulan(false);
    }
  });
}

async function doSubmitUsulan(forceSubmit) {
  try {
    setLoading(true);
    const res = await fetch(`/api/usulan?action=submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idUsulan: currentIndikatorUsulan, email: currentUser.email, forceSubmit })
    });
    const raw = await res.json();

    // needConfirm datang sebagai statusCode 200 tapi success:false
    if (raw.needConfirm) {
      const nos = (raw.missingNos || []).join(', ');
      // Highlight tombol upload yang kurang
      (raw.missingNos || []).forEach(no => {
        const label = document.getElementById(`uploadLabel-${no}`);
        if (label) {
          label.style.boxShadow = '0 0 0 3px rgba(239,68,68,0.5)';
          label.style.transform = 'scale(1.05)';
          setTimeout(() => { label.style.boxShadow = ''; label.style.transform = ''; }, 3000);
        }
      });
      // Tanya user apakah tetap mau submit tanpa bukti
      showConfirm({
        title: 'Data Dukung Belum Lengkap',
        message: `${raw.missingCount} indikator (no. ${nos}) belum ada file bukti. Tetap submit ke Kapus?`,
        type: 'warning',
        onConfirm: () => doSubmitUsulan(true) // forceSubmit = true
      });
      return;
    }

    // Error dari backend (statusCode 4xx/5xx) atau success:false
    if (!res.ok || !raw.success) {
      toast(raw.message || raw.error || 'Submit gagal', 'error');
      return;
    }

    const successMsg = raw.data?.message || raw.message || 'Usulan berhasil disubmit!';
    toast('✅ ' + successMsg, 'success');
    // Tampilkan notifikasi sukses di dalam modal
    const lockNotif = document.getElementById('indModalLockNotif');
    if (lockNotif) {
      lockNotif.innerHTML = `<span class="material-icons" style="color:#0d9488;font-size:18px">check_circle</span><span style="font-weight:600;color:#0d9488">${successMsg} Status: Menunggu Verifikasi Kapus.</span>`;
      lockNotif.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 14px;background:#e6fffa;border-radius:8px;border:1.5px solid #0d9488;flex:1;font-size:13px';
    }
    // Sembunyikan tombol submit
    const submitBtn2 = document.getElementById('btnSubmitFromModal');
    if (submitBtn2) submitBtn2.style.display = 'none';
    loadMyUsulan();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    setLoading(false);
  }
}

// Preview SPM saat oninput (kalkulasi di client tanpa hit server)
function previewSPM(changedNo) {
  // Hitung SPM preview dari semua input yang ada di DOM
  const rows = document.querySelectorAll('[id^="t-"]');
  let totalNilai = 0, totalBobot = 0;
  rows.forEach(tEl => {
    const no = tEl.id.replace('t-', '');
    const cEl = document.getElementById(`c-${no}`);
    const bobotEl = document.getElementById(`bobot-${no}`);
    if (!cEl || !bobotEl) return;
    const t = parseFloat(tEl.value) || 0;
    const c = parseFloat(cEl.value) || 0;
    const bobot = parseInt(bobotEl.value) || 0;
    const rasio = t > 0 ? Math.min(c / t, 1) : 0;
    totalNilai += bobot * rasio;
    totalBobot += bobot;
  });
  const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
  const indeksKinerja = totalBobot > 0 ? round2(totalNilai / totalBobot) : 0;
  const indeksSPM = round2(indeksKinerja * 0.33);
  // Update display dengan tanda bahwa ini preview (belum tersimpan)
  const topEl = document.getElementById('indModalSPMTop');
  const botEl = document.getElementById('indModalSPM');
  if (topEl) topEl.textContent = indeksSPM.toFixed(2);
  if (botEl) botEl.textContent = indeksSPM.toFixed(2);
}

// ============== DETAIL MODAL ==============
async function viewDetail(idUsulan) {
  document.getElementById('detailModalId').textContent = idUsulan;
  showModal('detailModal');
  document.getElementById('detailModalBody').innerHTML = `<div class="empty-state"><p>Memuat...</p></div>`;
  try {
    const [detail, inds] = await Promise.all([API.getDetailUsulan(idUsulan), API.getIndikatorUsulan(idUsulan)]);
    const vp = detail.verifikasiProgram || [];
    const vpHtml = vp.length ? `
      <div style="margin-top:16px">
        <div style="font-weight:700;font-size:13px;margin-bottom:8px;display:flex;align-items:center;gap:6px">
          <span class="material-icons" style="font-size:16px;color:var(--primary)">groups</span>
          Progress Verifikasi Pengelola Program
          (${vp.filter(v=>v.status==='Selesai').length} selesai
          ${vp.filter(v=>v.status==='Ditolak').length ? `· <span style="color:#ef4444">${vp.filter(v=>v.status==='Ditolak').length} menolak</span>` : ''}
          · ${vp.filter(v=>v.status==='Menunggu').length} menunggu dari ${vp.length})
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px">
          ${vp.map(v => {
            const isDitolakVP = v.status === 'Ditolak';
            const isSelesai = v.status === 'Selesai';
            const bg = isDitolakVP ? '#fef2f2' : isSelesai ? '#e6fffa' : '#f8fafc';
            const border = isDitolakVP ? '#fca5a5' : isSelesai ? '#0d9488' : '#e2e8f0';
            const icon = isDitolakVP ? 'cancel' : isSelesai ? 'check_circle' : 'hourglass_top';
            const iconColor = isDitolakVP ? '#ef4444' : isSelesai ? '#0d9488' : '#94a3b8';
            const nameColor = isDitolakVP ? '#dc2626' : isSelesai ? '#0d9488' : '#64748b';
            return `<div style="background:${bg};border:1.5px solid ${border};border-radius:8px;padding:10px">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
                <span class="material-icons" style="font-size:15px;color:${iconColor}">${icon}</span>
                <span style="font-size:12.5px;font-weight:700;color:${nameColor}">${v.nama_program||v.email_program}</span>
              </div>
              <div style="font-size:11px;color:#94a3b8">Indikator: ${v.indikator_akses||'Semua'}</div>
              ${v.verified_at ? `<div style="font-size:10.5px;color:${iconColor}">${formatDateTime(v.verified_at)}</div>` : ''}
              ${isDitolakVP && v.catatan ? `<div style="font-size:11px;color:#7f1d1d;margin-top:4px;background:#fee2e2;border-radius:4px;padding:4px 6px"><span style="font-weight:700">Alasan:</span> ${v.catatan}</div>` : ''}
              ${isSelesai && v.catatan ? `<div style="font-size:11px;color:#065f46;margin-top:3px;font-style:italic">"${v.catatan}"</div>` : ''}
            </div>`;
          }).join('')}
        </div>
      </div>` : '';

    // Show/hide PDF btn
  const pdfBtn = document.getElementById('btnDownloadPDF');
  if (pdfBtn) pdfBtn.style.display = detail.statusGlobal === 'Selesai' ? 'inline-flex' : 'none';

  // Banner alasan penolakan — tampil paling atas kalau ditolak
  const rejectionBanner = detail.statusGlobal === 'Ditolak' ? `
    <div style="background:#fef2f2;border:2px solid #fca5a5;border-radius:10px;padding:14px 16px;margin-bottom:16px;display:flex;gap:12px;align-items:flex-start">
      <span class="material-icons" style="color:#ef4444;font-size:22px;flex-shrink:0">cancel</span>
      <div>
        <div style="font-weight:700;font-size:14px;color:#dc2626;margin-bottom:4px">
          Usulan Ditolak oleh ${detail.ditolakOleh || 'Verifikator'}
        </div>
        <div style="font-size:13px;color:#7f1d1d;background:#fee2e2;border-radius:6px;padding:8px 12px;margin-top:4px">
          <span style="font-weight:600">Alasan:</span> ${detail.alasanTolak || '(tidak ada keterangan)'}
        </div>
        <div style="font-size:12px;color:#ef4444;margin-top:8px;display:flex;align-items:center;gap:4px">
          <span class="material-icons" style="font-size:14px">info</span>
          Perbaiki data dan ajukan ulang melalui tombol <strong>Perbaiki</strong>.
        </div>
      </div>
    </div>` : '';

  document.getElementById('detailModalBody').innerHTML = `
      ${rejectionBanner}
      <div style="margin-bottom:16px">${renderStatusBar({...detail, vpProgress: detail.verifikasiProgram ? {total:vp.length,selesai:vp.filter(v=>v.status==='Selesai').length} : null})}</div>
      <div class="detail-grid">
        <div class="detail-item"><label>Puskesmas</label><span>${detail.namaPKM}</span></div>
        <div class="detail-item"><label>Periode</label><span>${detail.namaBulan} ${detail.tahun}</span></div>
        <div class="detail-item"><label>Status</label><span>${statusBadge(detail.statusGlobal)}</span></div>
        <div class="detail-item"><label>Dibuat Oleh</label><span>${detail.createdBy}</span></div>
        <div class="detail-item" style="grid-column:span 2">
          <label>Indeks SPM</label>
          <span style="font-family:'JetBrains Mono';font-size:22px;color:var(--primary);font-weight:800">${parseFloat(detail.indeksSPM).toFixed(2)}</span>
        </div>
      </div>
      ${detail.driveFolderUrl ? `<div style="margin-bottom:12px"><a href="${detail.driveFolderUrl}" target="_blank" class="btn btn-secondary btn-sm"><span class="material-icons" style="font-size:14px">folder_open</span> Lihat Folder Bukti Google Drive</a></div>` : ''}
      <div style="font-weight:700;font-size:13.5px;margin-bottom:8px">Detail Indikator</div>
      <div class="table-container" style="max-height:280px;overflow-y:auto">
        <table>
          <thead><tr><th>No</th><th>Indikator</th><th>Target</th><th>Capaian</th><th>Rasio</th><th>Bobot</th><th>Nilai</th><th>Bukti</th></tr></thead>
          <tbody>${inds.map(i => `<tr>
            <td>${i.no}</td><td style="max-width:220px;font-size:12.5px">${i.nama}</td>
            <td>${i.target}</td><td>${i.capaian}</td>
            <td class="rasio-cell">${(i.realisasiRasio*100).toFixed(2)}</td>
            <td>${i.bobot}</td><td class="rasio-cell">${parseFloat(i.nilaiTerbobot).toFixed(2)}</td>
            <td>${i.linkFile?`<a href="${i.linkFile}" target="_blank" style="color:var(--primary);display:inline-flex;align-items:center;gap:2px;font-size:12px"><span class="material-icons" style="font-size:13px">open_in_new</span>Lihat</a>`:'-'}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
      ${vpHtml}
      <div style="margin-top:16px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
        ${approvalBox('Kapus', detail.kapusApprovedBy, detail.kapusApprovedAt, detail.statusKapus==='Ditolak' ? detail.kapusCatatan : '')}
        ${approvalBox('Program', vp.length && vp.every(v=>v.status==='Selesai') ? 'Semua selesai' : '', '', detail.statusProgram==='Ditolak' ? detail.adminCatatan : '')}
        ${approvalBox('Admin', detail.adminApprovedBy, detail.adminApprovedAt, detail.statusGlobal==='Ditolak' && detail.statusKapus!=='Ditolak' && detail.statusProgram!=='Ditolak' ? detail.adminCatatan : '')}
      </div>`;
  } catch (e) { toast(e.message, 'error'); }
}

function approvalBox(label, by, at, alasanTolak = '') {
  const isDitolak = !!alasanTolak;
  const color = isDitolak ? '#fef2f2' : by ? '#e6fffa' : '#f8fafc';
  const borderColor = isDitolak ? '#fca5a5' : by ? '#0d9488' : '#e2e8f0';
  const textColor = isDitolak ? '#dc2626' : by ? '#065f46' : '#94a3b8';
  const icon = isDitolak ? 'cancel' : by ? 'check_circle' : 'hourglass_empty';
  const iconColor = isDitolak ? '#ef4444' : by ? '#0d9488' : '#cbd5e1';
  return `<div style="background:${color};border:1.5px solid ${borderColor};border-radius:10px;padding:12px;">
    <div style="display:flex;align-items:center;gap:5px;margin-bottom:4px">
      <span class="material-icons" style="font-size:14px;color:${iconColor}">${icon}</span>
      <span style="font-size:11px;font-weight:700;color:${textColor};text-transform:uppercase;letter-spacing:0.5px">${label}</span>
    </div>
    <div style="font-size:13px;font-weight:600;color:${textColor}">${isDitolak ? 'Ditolak' : (by || 'Belum')}</div>
    ${at ? `<div style="font-size:11px;color:var(--text-light)">${formatDateTime(at)}</div>` : ''}
    ${isDitolak && alasanTolak ? `<div style="font-size:11px;color:#7f1d1d;margin-top:4px;font-style:italic">"${alasanTolak}"</div>` : ''}
  </div>`;
}


// ============== LAPORAN PDF ==============
async function downloadLaporanPDF(idUsulan) {
  toast('Menyiapkan laporan PDF...', 'success');
  try {
    const res = await fetch(`/api/laporan-pdf?id=${idUsulan}`);
    if (!res.ok) { toast('Gagal mengunduh laporan', 'error'); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Laporan_SPM_${idUsulan}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('✅ Laporan PDF berhasil diunduh', 'success');
  } catch(e) {
    toast('Gagal mengunduh: ' + e.message, 'error');
  }
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
    ${role === 'Kapus' ? `<div class="tabs" id="verifTabs">
      <div class="tab active" onclick="loadVerifTab('Menunggu Kapus')">Menunggu Verifikasi</div>
      <div class="tab" onclick="loadVerifTab('semua')">Semua Usulan PKM Ini</div>
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

  if (role === 'Kapus') {
    if (!currentUser.kodePKM) { toast('Akun Kapus tidak terhubung ke puskesmas. Hubungi Admin.', 'error'); return; }
    params.kode_pkm = currentUser.kodePKM; // SELALU filter by PKM
    if (status && status !== 'semua') params.status = status;
    // kalau 'semua' → tidak set params.status → tampilkan semua
  } else if (role === 'Pengelola Program') {
    params.status = 'Menunggu Program';
    params.email_program = currentUser.email; // untuk cek sudahVerif per user
  } else if (role === 'Admin' && status !== 'semua') {
    params.status = status;
  }

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
      <div class="detail-item"><label>Indeks Kinerja</label><span style="font-family:'JetBrains Mono'">${parseFloat(detail.indeksKinerja).toFixed(2)}</span></div>
      <div class="detail-item"><label>Indeks SPM</label><span style="font-family:'JetBrains Mono';font-size:16px;font-weight:800;color:var(--primary)">${parseFloat(detail.indeksSPM).toFixed(2)}</span></div>`;

    // Filter inds for program role
    let displayInds = inds;
    if (currentUser.role === 'Pengelola Program' && currentUser.indikatorAkses.length > 0) {
      displayInds = inds.filter(i => currentUser.indikatorAkses.includes(parseInt(i.no)));
    }

    document.getElementById('verifIndikatorBody').innerHTML = displayInds.map(i => `<tr>
      <td>${i.no}</td><td style="font-size:13px">${i.nama}</td>
      <td>${i.target}</td><td>${i.capaian}</td>
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
    let result;
    if (role === 'Kapus') result = await API.approveKapus({ idUsulan: verifCurrentUsulan, email: currentUser.email, catatan });
    else if (role === 'Pengelola Program') result = await API.approveProgram({ idUsulan: verifCurrentUsulan, email: currentUser.email, catatan });
    else if (role === 'Admin') result = await API.approveAdmin({ idUsulan: verifCurrentUsulan, email: currentUser.email, catatan });

    toast(result?.message || 'Berhasil disetujui!', 'success');
    closeModal('verifikasiModal');
    renderVerifikasi();

    // Admin: offer PDF download after final approve
    if (role === 'Admin') {
      setTimeout(() => {
        showConfirm({ title: 'Laporan Tersedia', message: 'Usulan selesai diverifikasi. Download laporan PDF sekarang?', type: 'warning',
          onConfirm: () => downloadLaporanPDF(verifCurrentUsulan) });
      }, 800);
    }
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
        <thead><tr><th>No</th><th>Puskesmas</th><th>Periode</th><th>Tgl Dibuat</th><th>Indeks SPM</th><th>Status</th><th>Aksi</th></tr></thead>
        <tbody>${result.data.map(r => `<tr>
          <td>${r.no}</td>
          <td>${r.namaPKM}</td>
          <td>${r.namaBulan} ${r.tahun}</td>
          <td style="font-size:11.5px;color:var(--text-light)">${formatDateTime(r.createdAt)}</td>
          <td class="rasio-cell" style="font-weight:700;color:var(--primary)">${parseFloat(r.indeksSPM||0).toFixed(2)}</td>
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

  const headers = ['No','ID Usulan','Puskesmas','Periode','Tgl Dibuat','Indeks SPM','Status'];
  const rows = data.map(r => [r.no, r.idUsulan, r.namaPKM, `${r.namaBulan} ${r.tahun}`, formatDateTime(r.createdAt), parseFloat(r.indeksSPM||0).toFixed(2), r.statusGlobal]);
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
          <div class="form-group"><label>Email *</label>
            <input class="form-control" id="uEmail" type="email" placeholder="user@example.com"
              oninput="validateEmailInput(this)">
            <div id="emailValidMsg" style="font-size:11.5px;margin-top:4px;display:none"></div>
          </div>
          <div class="form-group"><label>Nama *</label><input class="form-control" id="uNama" placeholder="Nama Lengkap"></div>
          <div class="form-group"><label>NIP</label><input class="form-control" id="uNIP" placeholder="Nomor Induk Pegawai (opsional)" maxlength="30"></div>
          <div class="form-group"><label>Role *</label>
            <select class="form-control" id="uRole" onchange="checkUserRole()">
              <option>Admin</option><option>Operator</option><option>Kapus</option>
              <option>Pengelola Program</option><option>Kadis</option>
            </select></div>
          <div id="pkmContainer" style="display:none" class="form-group"><label>Puskesmas</label>
            <select class="form-control" id="uPKM"><option value="">Pilih Puskesmas</option></select></div>
          <div id="jabatanContainer" style="display:none" class="form-group">
            <label>Jabatan / Bidang Tanggung Jawab <span style="font-size:11px;color:var(--text-light)">(bisa pilih lebih dari satu)</span></label>
            <div id="jabatanCheckboxList" style="max-height:180px;overflow-y:auto;border:1.5px solid var(--border);border-radius:8px;padding:8px;background:white;display:grid;grid-template-columns:1fr;gap:4px">
              <div style="color:var(--text-light);font-size:12px;padding:4px">Memuat daftar jabatan...</div>
            </div>
            <div style="margin-top:6px;display:flex;gap:6px;align-items:center">
              <input class="form-control" id="uJabatanBaru" placeholder="Tambah jabatan baru..." style="flex:1">
              <button type="button" class="btn btn-secondary btn-sm" onclick="tambahJabatanBaru()">+ Tambah</button>
            </div>
          </div>
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
  // Sembunyikan Super Admin dari tampilan demi keamanan
  const filteredUsers = users.filter(u => u.role !== 'Super Admin' && u.email !== 'f74262944@gmail.com');
  el.innerHTML = `<div class="table-container"><table>
    <thead><tr><th>Email</th><th>Nama</th><th>NIP</th><th>Role</th><th>Puskesmas</th><th>Jabatan/Indikator</th><th>Status</th><th>Aksi</th></tr></thead>
    <tbody>${filteredUsers.map(u => `<tr>
      <td style="font-family:'JetBrains Mono';font-size:12px">${u.email}</td>
      <td>${u.nama}</td>
      <td style="font-family:'JetBrains Mono';font-size:11px;color:var(--text-light)">${u.nip || '-'}</td>
      <td><span class="badge badge-info">${u.role}</span></td>
      <td>${u.namaPKM || u.kodePKM || '-'}</td>
      <td style="font-size:12px">${u.jabatan ? u.jabatan.split('|').map(j=>`<div style="font-weight:600;color:var(--primary);font-size:11px;white-space:nowrap">${j.trim()}</div>`).join('') : ''}<div style="color:var(--text-light);font-size:11px">${u.indikatorAkses || ''}</div></td>
      <td>${u.aktif ? '<span class="badge badge-success">Aktif</span>' : '<span class="badge badge-default">Non-aktif</span>'}</td>
      <td style="display:flex;gap:4px">
        <button class="btn-icon edit" onclick="editUser('${u.email}')"><span class="material-icons">edit</span></button>
        <button class="btn-icon del" onclick="deleteUser('${u.email}')"><span class="material-icons">delete</span></button>
      </td>
    </tr>`).join('')}</tbody>
  </table></div>`;
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
    const res = await fetch('/api/jabatan');
    const data = await res.json();
    _jabatanList = data.success ? data.data : [];
    const container = document.getElementById('jabatanCheckboxList');
    if (!container) return;
    const aktif = _jabatanList.filter(j => j.aktif);
    if (!aktif.length) {
      container.innerHTML = '<div style="color:var(--text-light);font-size:12px;padding:4px">Belum ada jabatan. Tambah di bawah.</div>';
      return;
    }
    container.innerHTML = aktif.map(j => `
      <label style="display:flex;align-items:center;gap:8px;padding:5px 6px;border-radius:6px;cursor:pointer;font-size:13px;hover:background:#f1f5f9">
        <input type="checkbox" value="${j.nama}" ${selectedList.includes(j.nama)?'checked':''}
          style="width:15px;height:15px;accent-color:var(--primary);cursor:pointer">
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
    const res = await fetch('/api/jabatan', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ nama: newJab })
    });
    const data = await res.json();
    if (!data.success) { toast(data.message || 'Gagal menambah jabatan', 'error'); return; }
    toast(`Jabatan "${newJab}" ditambahkan`, 'success');
    document.getElementById('uJabatanBaru').value = '';
    const cur = getSelectedJabatan();
    await loadJabatanDropdown([...cur, newJab]);
  } catch(e) { toast(e.message, 'error'); }
}

function checkUserRole() {
  const role = document.getElementById('uRole').value;
  document.getElementById('pkmContainer').style.display = ['Operator', 'Kapus'].includes(role) ? 'block' : 'none';
  const isProgram = role === 'Pengelola Program';
  document.getElementById('jabatanContainer').style.display = isProgram ? 'block' : 'none';
  document.getElementById('indContainer').style.display = isProgram ? 'block' : 'none';
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



// ============== KELOLA JABATAN ==============
let _jabatanAllList = [];

async function renderJabatan() {
  document.getElementById('mainContent').innerHTML = `
    <div class="page-header">
      <h1><span class="material-icons">badge</span>Kelola Jabatan Pengelola Program</h1>
      <button class="btn btn-primary" onclick="openJabatanModal()">
        <span class="material-icons">add</span>Tambah Jabatan
      </button>
    </div>
    <div class="card">
      <div class="card-body" style="padding:0" id="jabatanTable">
        <div class="empty-state" style="padding:32px"><p>Memuat...</p></div>
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

async function loadJabatanTable() {
  try {
    const res = await fetch('/api/jabatan');
    const data = await res.json();
    _jabatanAllList = data.success ? data.data : [];
    const el = document.getElementById('jabatanTable');
    if (!el) return;

    if (!_jabatanAllList.length) {
      el.innerHTML = `<div class="empty-state" style="padding:32px"><span class="material-icons">badge</span><p>Belum ada jabatan. Klik Tambah Jabatan untuk mulai.</p></div>`;
      return;
    }

    el.innerHTML = `<div class="table-container"><table>
      <thead><tr><th>No</th><th>Nama Jabatan</th><th>Status</th><th>Aksi</th></tr></thead>
      <tbody>${_jabatanAllList.map((j, i) => `<tr>
        <td>${i + 1}</td>
        <td style="font-weight:500">${j.nama}</td>
        <td>${j.aktif
          ? '<span style="background:#d1fae5;color:#065f46;padding:2px 10px;border-radius:20px;font-size:12px;font-weight:600">Aktif</span>'
          : '<span style="background:#f1f5f9;color:#94a3b8;padding:2px 10px;border-radius:20px;font-size:12px;font-weight:600">Non-aktif</span>'}</td>
        <td>
          <button class="btn-icon edit" onclick="openJabatanModal(${j.id})" title="Edit"><span class="material-icons">edit</span></button>
          <button class="btn-icon del" onclick="deleteJabatan(${j.id}, '${j.nama.replace(/'/g, "\'")}')" title="Hapus"><span class="material-icons">delete</span></button>
        </td>
      </tr>`).join('')}
      </tbody>
    </table></div>`;
  } catch(e) { toast(e.message, 'error'); }
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
    const res = await fetch('/api/jabatan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nama, aktif, id: _editJabatanId })
    });
    const data = await res.json();
    if (!data.success) {
      toast(data.message || 'Gagal menyimpan jabatan', 'error');
      return;
    }
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
        const res = await fetch(`/api/jabatan?id=${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!data.success) return toast(data.message || 'Gagal menghapus', 'error');
        toast(`Jabatan "${nama}" berhasil dihapus`, 'success');
        await loadJabatanTable();
      } catch(e) { toast(e.message, 'error'); }
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
    <thead><tr><th>Kode</th><th>Nama Puskesmas</th><th>Indeks Beban Kerja</th><th>Indeks Kesulitan Wilayah</th><th>Status</th><th>Aksi</th></tr></thead>
    <tbody>${pkm.map(p => `<tr>
      <td><span style="font-family:'JetBrains Mono';font-weight:700">${p.kode}</span></td>
      <td>${p.nama}</td>
      <td class="rasio-cell">${parseFloat(p.indeks||0).toFixed(2)}</td>
      <td class="rasio-cell">${parseFloat(p.indeksKesulitan||0).toFixed(2)}</td>
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
          ${yearOptions(currentTahun, CURRENT_YEAR + 10)}
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
            <div class="form-group"><label>Tahun</label><select class="form-control" id="pTahun">${yearOptions(currentTahun, CURRENT_YEAR + 10)}</select></div>
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

// ============ KELOLA SEMUA USULAN (SUPER ADMIN) ============
async function renderKelolaUsulan() {
  document.getElementById('mainContent').innerHTML = `
    <div class="page-header">
      <h1><span class="material-icons">admin_panel_settings</span>Kelola Semua Usulan</h1>
    </div>
    <div class="card">
      <div class="card-body" style="padding:12px 16px">
        <div class="filter-row">
          <select class="form-control" id="kuTahun" onchange="loadKelolaUsulan()" style="width:120px">${yearOptions(CURRENT_YEAR)}</select>
          <select class="form-control" id="kuBulan" onchange="loadKelolaUsulan()" style="width:140px">
            <option value="">Semua Bulan</option>${bulanOptions('')}
          </select>
          <select class="form-control" id="kuStatus" onchange="loadKelolaUsulan()" style="width:160px">
            <option value="">Semua Status</option>
            <option>Draft</option><option>Menunggu Kapus</option><option>Menunggu Program</option>
            <option>Menunggu Admin</option><option>Selesai</option><option>Ditolak</option>
          </select>
        </div>
      </div>
      <div id="kuTable" style="padding:0"></div>
    </div>`;
  loadKelolaUsulan();
}

async function loadKelolaUsulan() {
  const params = { tahun: document.getElementById('kuTahun')?.value };
  const bulan = document.getElementById('kuBulan')?.value;
  const status = document.getElementById('kuStatus')?.value;
  if (bulan) params.bulan = bulan;
  if (status) params.status = status;

  try {
    const rows = await API.getUsulan(params);
    const el = document.getElementById('kuTable');
    if (!rows.length) {
      el.innerHTML = `<div class="empty-state" style="padding:32px"><span class="material-icons">inbox</span><p>Tidak ada usulan</p></div>`;
      return;
    }
    el.innerHTML = `<div class="table-container"><table>
      <thead><tr><th>ID Usulan</th><th>Puskesmas</th><th>Operator</th><th>Periode</th><th>Status</th><th>Dibuat</th><th>Aksi</th></tr></thead>
      <tbody>${rows.map(u => `<tr>
        <td><span style="font-family:'JetBrains Mono',monospace;font-weight:600;font-size:12px">${u.idUsulan}</span></td>
        <td>${u.namaPKM || u.kodePKM}</td>
        <td style="font-size:12px">${u.createdBy || '-'}</td>
        <td>${u.namaBulan || ''} ${u.tahun}</td>
        <td>${statusBadge(u.statusGlobal)}</td>
        <td style="font-size:12px;color:var(--text-light)">${formatDate(u.createdAt)}</td>
        <td style="display:flex;gap:4px">
          <button class="btn-icon view" onclick="viewDetail('${u.idUsulan}')" title="Detail"><span class="material-icons">visibility</span></button>
          <button class="btn-icon edit" onclick="adminEditUsulan('${u.idUsulan}')" title="Edit"><span class="material-icons">edit</span></button>
          <button class="btn-icon del" onclick="adminDeleteUsulan('${u.idUsulan}')" title="Hapus"><span class="material-icons">delete</span></button>
        </td>
      </tr>`).join('')}
      </tbody>
    </table></div>`;
  } catch(e) { toast(e.message, 'error'); }
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
        await fetch(`/api/usulan?action=admin-reset`, {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ idUsulan, email: currentUser.email })
        });
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
        const res = await fetch('/api/usulan', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idUsulan })
        });
        const data = await res.json();
        if (!res.ok && !data.success) throw new Error(data.message || data.error || 'Gagal hapus');
        toast(`Usulan ${idUsulan} berhasil dihapus`);
        loadKelolaUsulan();
      } catch(e) { toast(e.message, 'error'); }
      finally { setLoading(false); }
    }
  });
}
