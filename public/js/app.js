// ============== APP STATE ==============

// ============== PAGINATION UTILITY ==============
const PAGINATION_SIZE = 12; // baris per halaman default
function fmtPct(pct) {
  const p = parseFloat(pct);
  if (isNaN(p)) return '-';
  return p >= 100 ? '100%' : p.toFixed(1) + '%';
}

const _pgState = {}; // { tableId: currentPage }

function renderPagination(containerId, totalItems, currentPage, pageSize, onPageChange) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const totalPages = Math.ceil(totalItems / pageSize);
  if (totalPages <= 1) { el.innerHTML = ''; return; }

  const maxBtns = 5;
  let start = Math.max(1, currentPage - Math.floor(maxBtns / 2));
  let end = Math.min(totalPages, start + maxBtns - 1);
  if (end - start < maxBtns - 1) start = Math.max(1, end - maxBtns + 1);

  let html = `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-top:1px solid var(--border);background:white;border-radius:0 0 12px 12px">
    <span style="font-size:12px;color:var(--text-light)">Menampilkan ${Math.min((currentPage-1)*pageSize+1, totalItems)}–${Math.min(currentPage*pageSize, totalItems)} dari ${totalItems} data</span>
    <div style="display:flex;gap:4px;align-items:center">`;
  
  html += `<button onclick="${onPageChange}(1)" style="padding:4px 8px;border:1.5px solid var(--border);border-radius:6px;background:white;cursor:pointer;font-size:12px;color:var(--text-light)" ${currentPage===1?'disabled':''}>«</button>`;
  html += `<button onclick="${onPageChange}(${currentPage-1})" style="padding:4px 8px;border:1.5px solid var(--border);border-radius:6px;background:white;cursor:pointer;font-size:12px;color:var(--text-light)" ${currentPage===1?'disabled':''}>‹</button>`;
  
  for (let i = start; i <= end; i++) {
    const active = i === currentPage;
    html += `<button onclick="${onPageChange}(${i})" style="padding:4px 10px;border:1.5px solid ${active?'var(--primary)':'var(--border)'};border-radius:6px;background:${active?'var(--primary)':'white'};color:${active?'white':'var(--text)'};cursor:pointer;font-size:12px;font-weight:${active?'700':'400'}">${i}</button>`;
  }
  
  html += `<button onclick="${onPageChange}(${currentPage+1})" style="padding:4px 8px;border:1.5px solid var(--border);border-radius:6px;background:white;cursor:pointer;font-size:12px;color:var(--text-light)" ${currentPage===totalPages?'disabled':''}>›</button>`;
  html += `<button onclick="${onPageChange}(${totalPages})" style="padding:4px 8px;border:1.5px solid var(--border);border-radius:6px;background:white;cursor:pointer;font-size:12px;color:var(--text-light)" ${currentPage===totalPages?'disabled':''}>»</button>`;
  html += `</div></div>`;
  el.innerHTML = html;
}


// Format timestamp: DD MMMM YYYY, HH:mm
function formatTS(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  if (isNaN(d)) return ts;
  const bulan = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const tgl = String(d.getDate()).padStart(2,'0');
  const bln = bulan[d.getMonth()];
  const thn = d.getFullYear();
  const jam = String(d.getHours()).padStart(2,'0');
  const mnt = String(d.getMinutes()).padStart(2,'0');
  return `${tgl} ${bln} ${thn}, ${jam}:${mnt}`;
}

let currentUser = null;
let currentPage = '';
let pageData = {}; // cache per page
let verifCurrentUsulan = null; // for verifikasi modal

// ===== GOOGLE DRIVE CONFIG =====
// Google Drive: menggunakan Service Account (backend)
window.GDRIVE_FOLDER_ID = "1HywRrWup2JgX3Zig2FND8K5Zc6HWtu-A";


// Format date only: DD MMMM YYYY
function formatDate(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  if (isNaN(d)) return ts;
  const bulan = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  return `${String(d.getDate()).padStart(2,'0')} ${bulan[d.getMonth()]} ${d.getFullYear()}`;
}

// Format datetime: DD MMMM YYYY, HH:mm  
function formatDateTime(ts) { return formatTS(ts); }
// ============== AUTH ==============
async function doLogin() {
  const email = document.getElementById('authEmail').value.trim();
  if (!email) return setAuthStatus('Masukkan email Anda', 'error');

  const password = document.getElementById('authPassword')?.value || '';

  const btn = document.getElementById('authBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="material-icons" style="animation:spin 0.8s linear infinite">refresh</span> Loading...';
  setAuthStatus('Memvalidasi kredensial...', '');

  try {
    const user = await API.login(email, password);
    currentUser = user;
    localStorage.setItem('spm_user', JSON.stringify(user));
    startApp();
    startIdleWatcher();
  } catch (e) {
    setAuthStatus(e.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<span class="material-icons">login</span> Login';
  }
}

function toggleAuthPw() {
  const inp = document.getElementById('authPassword');
  const icon = document.getElementById('authPwIcon');
  if (inp.type === 'password') { inp.type = 'text'; icon.textContent = 'visibility'; }
  else { inp.type = 'password'; icon.textContent = 'visibility_off'; }
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
    onConfirm: () => { currentUser = null; localStorage.removeItem('spm_user'); sessionStorage.removeItem('spm_lastPage'); location.reload(); }
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
  // Topbar avatar dropdown
  const tAvatar = document.getElementById('topbarAvatar');
  if (tAvatar) tAvatar.textContent = (currentUser.nama || 'U')[0].toUpperCase();
  const tName = document.getElementById('topbarDropName');
  if (tName) tName.textContent = currentUser.nama || currentUser.email;
  const tMeta = document.getElementById('topbarDropMeta');
  if (tMeta) tMeta.textContent = currentUser.role + (currentUser.namaPKM ? ' — ' + currentUser.namaPKM : '');

  // Sembunyikan "Edit Profil & Tanda Tangan" untuk Admin dan Operator
  const btnEditProfilTT = document.getElementById('btnEditProfilTT');
  if (btnEditProfilTT) {
    const showTT = ['Kepala Puskesmas', 'Pengelola Program'].includes(currentUser.role);
    btnEditProfilTT.style.display = showTT ? '' : 'none';
  }

  buildSidebar();

  // Halaman yang boleh diakses per role
  const allowedPages = {
    'Admin':            ['dashboard','verifikasi','laporan','master-data','users','jabatan','pkm','indikator','pengaturan','target-tahunan','periode','kelola-usulan'],
    'Operator':         ['dashboard','input','laporan'],
    'Kepala Puskesmas': ['dashboard','verifikasi','laporan'],
    'Pengelola Program':['dashboard','verifikasi','laporan'],
  };
  const allowed = allowedPages[currentUser.role] || ['dashboard'];
  const _lastPage = sessionStorage.getItem('spm_lastPage');
  const startPage = (_lastPage && allowed.includes(_lastPage)) ? _lastPage : 'dashboard';
  loadPage(startPage);

  // Load tahun range dari DB settings
  API.getSettings().then(s => {
    if (s && s.tahun_awal)  window._minPeriodeTahun = parseInt(s.tahun_awal);
    if (s && s.tahun_akhir) window._maxPeriodeTahun = parseInt(s.tahun_akhir);
  }).catch(() => {
    window._minPeriodeTahun = window._minPeriodeTahun || new Date().getFullYear();
    window._maxPeriodeTahun = window._maxPeriodeTahun || new Date().getFullYear() + 2;
  });

  // Refresh data user dari DB (termasuk tandaTangan terbaru)
  if (currentUser.email) {
    API.get('users').then(users => {
      const fresh = (users || []).find(u => u.email?.toLowerCase() === currentUser.email.toLowerCase());
      if (fresh) {
        currentUser.tandaTangan = fresh.tandaTangan || '';
        currentUser.nama = fresh.nama || currentUser.nama;
        currentUser.nip = fresh.nip || currentUser.nip;
        localStorage.setItem('spm_user', JSON.stringify(currentUser));
      }
    }).catch(() => {});
  }

  // Popup notifikasi periode untuk Operator saat login
  if (currentUser.role === 'Operator') {
    setTimeout(() => showPeriodeLoginPopup(), 800);
  }

  // Popup notifikasi tanda tangan untuk verifikator
  if (['Kepala Puskesmas', 'Pengelola Program', 'Admin'].includes(currentUser.role)) {
    setTimeout(() => showTTLoginPopup(), 900);
  }
}

async function showTTLoginPopup() {
  try {
    let hasTT = false;
    if (currentUser.role === 'Admin') {
      // Admin: cek tanda tangan Kepala Sub Bagian Perencanaan
      const pejabat = await API.getPejabat().catch(() => []);
      const kasubag = (pejabat || []).find(p => p.jabatan === 'Kepala Sub Bagian Perencanaan');
      hasTT = !!(kasubag?.tanda_tangan);
    } else {
      // Kepala Puskesmas & Pengelola Program: cek dari sesi login
      hasTT = !!(currentUser.tandaTangan);
    }

    if (hasTT) return;

    const popup = document.createElement('div');
    popup.id = 'ttLoginPopup';
    popup.style.cssText = `position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9998;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px);animation:fadeIn 0.3s ease`;
    popup.innerHTML = `
      <div style="background:white;border-radius:16px;width:460px;max-width:calc(100vw - 32px);overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,0.3);animation:authIn 0.3s ease">
        <div style="background:linear-gradient(135deg,#f59e0b,#f97316);padding:20px 24px;color:white">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
            <span class="material-icons" style="font-size:24px">draw</span>
            <span style="font-size:13px;font-weight:600;opacity:0.85;text-transform:uppercase;letter-spacing:0.5px">Tanda Tangan Diperlukan</span>
          </div>
          <div style="font-size:18px;font-weight:800">⚠️ Anda belum upload tanda tangan</div>
        </div>
        <div style="padding:20px 24px;display:flex;flex-direction:column;gap:12px">
          <p style="font-size:13.5px;color:#374151;line-height:1.6;margin:0">
            Tanda tangan digunakan untuk <strong>laporan resmi</strong> dan wajib ada sebelum Anda dapat melakukan verifikasi usulan.
          </p>
          <div style="background:#fef3c7;border:1.5px solid #f59e0b;border-radius:10px;padding:14px 16px">
            <div style="font-size:12px;font-weight:700;color:#92400e;margin-bottom:8px;display:flex;align-items:center;gap:6px">
              <span class="material-icons" style="font-size:15px">info</span>Cara Upload
            </div>
            <div style="font-size:12.5px;color:#78350f;line-height:1.7">
              ${currentUser.role === 'Admin'
                ? 'Buka menu <strong>Master Data</strong> → tab <strong>Pengaturan</strong> → bagian <strong>Kepala Sub Bagian Perencanaan</strong>'
                : 'Klik <strong>Avatar Profil</strong> di pojok kanan atas → <strong>Edit Profil & Tanda Tangan</strong>'}
            </div>
          </div>
          <div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:10px;padding:14px 16px">
            <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px;display:flex;align-items:center;gap:6px">
              <span class="material-icons" style="font-size:15px">check_circle</span>Spesifikasi File
            </div>
            <div style="font-size:12px;color:#64748b;line-height:1.9">
              📄 Format: PNG / JPG<br>
              🎨 Latar belakang: <strong>putih bersih</strong><br>
              🖊️ Tinta: <strong>hitam atau biru tua</strong><br>
              📐 Resolusi: <strong>jelas & tidak buram</strong>
            </div>
          </div>
          <div style="display:flex;gap:10px;margin-top:4px">
            <button onclick="document.getElementById('ttLoginPopup').remove()" style="flex:1;height:44px;background:#f1f5f9;border:none;border-radius:10px;color:#64748b;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit">
              Nanti
            </button>
            <button onclick="document.getElementById('ttLoginPopup').remove();${currentUser.role === 'Admin' ? "setTimeout(()=>loadPage('master-data'),200);setTimeout(()=>switchMasterTab('pengaturan'),400)" : "setTimeout(()=>openEditProfil(),200)"}" style="flex:2;height:44px;background:linear-gradient(135deg,#f59e0b,#f97316);border:none;border-radius:10px;color:white;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:8px">
              <span class="material-icons" style="font-size:18px">upload</span>Upload Sekarang
            </button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(popup);
  } catch(e) {}
}

async function showPeriodeLoginPopup() {
  try {
    const periodeList = await API.get('periode');
    const aktifList = (periodeList || []).filter(p => p.isAktifToday);
    if (!aktifList.length) return;

    const periodeCards = aktifList.map(aktif => `
      <div style="border:1.5px solid #0d9488;border-radius:10px;overflow:hidden;margin-bottom:10px">
        <div style="background:linear-gradient(135deg,#0d9488,#06b6d4);padding:10px 14px;color:white;font-weight:800;font-size:15px">
          📅 ${aktif.namaBulan} ${aktif.tahun}
        </div>
        <div style="padding:10px 14px;display:flex;flex-direction:column;gap:8px;background:#f0fdf9">
          <div style="display:flex;align-items:center;gap:8px;font-size:13px">
            <span class="material-icons" style="color:#0d9488;font-size:16px">login</span>
            <span style="color:#64748b;font-weight:600">Dibuka:</span>
            <span style="font-weight:700;color:#0f172a">${formatDate(aktif.tanggalMulai)} pukul ${aktif.jamMulai||'08:00'} WITA</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px;font-size:13px">
            <span class="material-icons" style="color:#ef4444;font-size:16px">logout</span>
            <span style="color:#64748b;font-weight:600">Ditutup:</span>
            <span style="font-weight:700;color:#0f172a">${formatDate(aktif.tanggalSelesai)} pukul ${aktif.jamSelesai||'17:00'} WITA</span>
          </div>
          ${aktif.notifOperator ? `<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 10px;background:#fffbeb;border-radius:7px;border:1px solid #fcd34d;font-size:12.5px;color:#0f172a;line-height:1.5"><span style="flex-shrink:0">📢</span>${aktif.notifOperator}</div>` : ''}
        </div>
      </div>`).join('');

    // Buat popup element
    const popup = document.createElement('div');
    popup.id = 'periodePopup';
    popup.style.cssText = `
      position:fixed;top:0;left:0;right:0;bottom:0;
      background:rgba(0,0,0,0.5);z-index:9998;
      display:flex;align-items:center;justify-content:center;
      backdrop-filter:blur(3px);animation:fadeIn 0.3s ease
    `;
    popup.innerHTML = `
      <div style="background:white;border-radius:16px;width:460px;max-width:calc(100vw - 32px);overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,0.3);animation:authIn 0.3s ease;max-height:calc(100vh - 64px);display:flex;flex-direction:column">
        <div style="background:linear-gradient(135deg,#0d9488,#06b6d4);padding:20px 24px;color:white;flex-shrink:0">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
            <span class="material-icons" style="font-size:24px">notifications_active</span>
            <span style="font-size:13px;font-weight:600;opacity:0.85;text-transform:uppercase;letter-spacing:0.5px">Informasi Periode Input</span>
          </div>
          <div style="font-size:18px;font-weight:800">${aktifList.length} Periode Sedang Aktif</div>
        </div>
        <div style="padding:20px 24px;overflow-y:auto;flex:1">
          ${periodeCards}
          <button onclick="document.getElementById('periodePopup').remove()" style="width:100%;margin-top:6px;height:44px;background:linear-gradient(135deg,#0d9488,#06b6d4);border:none;border-radius:10px;color:white;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">
            <span style="display:flex;align-items:center;justify-content:center;gap:6px"><span class="material-icons" style="font-size:18px">check</span>Mengerti, Tutup</span>
          </button>
        </div>
      </div>`;
    popup.addEventListener('click', e => { if (e.target === popup) popup.remove(); });
    document.body.appendChild(popup);
  } catch(e) { /* silent fail */ }
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
        { id: 'master-data', icon: 'tune', label: 'Master Data' },
        { id: 'target-tahunan', icon: 'track_changes', label: 'Target Tahunan' },
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
    'Kepala Puskesmas': [
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

// ============== TOPBAR DROPDOWN ==============
function toggleTopbarDropdown() {
  const dd = document.getElementById('topbarDropdown');
  if (!dd) return;
  dd.classList.toggle('open');
}
function closeTopbarDropdown() {
  const dd = document.getElementById('topbarDropdown');
  if (dd) dd.classList.remove('open');
}
// Tutup dropdown kalau klik di luar
document.addEventListener('click', e => {
  const wrap = document.getElementById('topbarAvatarWrap');
  if (wrap && !wrap.contains(e.target)) closeTopbarDropdown();
});


// ============== THEME (DARK/LIGHT MODE) ==============
function initTheme() {
  const saved = localStorage.getItem('spm_theme') || 'light';
  applyTheme(saved);
}
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('spm_theme', theme);
  const btn = document.getElementById('themeToggleBtn');
  if (btn) btn.textContent = theme === 'dark' ? '🌞' : '🌙';
}
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

// ============== ROUTING ==============
const PAGE_TITLES = {
  dashboard: 'Dashboard', verifikasi: 'Verifikasi', laporan: 'Laporan',
  users: 'Master Data', jabatan: 'Master Data', pkm: 'Master Data',
  'master-data': 'Master Data',
  indikator: 'Kelola Indikator', periode: 'Periode Input', input: 'Input Usulan',
  'kelola-usulan': 'Kelola Usulan', 'target-tahunan': 'Target Tahunan'
};

function loadPage(page) {
  currentPage = page;
  sessionStorage.setItem('spm_lastPage', page);
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
    jabatan: () => renderMasterData('jabatan'),
    users: () => renderMasterData('users'),
    pkm: () => renderMasterData('pkm'),
    'master-data': () => renderMasterData('users'),
    'target-tahunan': renderTargetTahunan,
    indikator: () => renderMasterData('indikator'),
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
  const min = window._minPeriodeTahun || Math.min(2024, CURRENT_YEAR);
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
  else if (role === 'Kepala Puskesmas') renderKepalasDashboard(content, data);
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
  const p = d.periodeAktif;
  const periodeAktifList = d.periodeAktifList || (p ? [p] : []);
  // Build banner untuk semua periode aktif

  // Banner periode + notifikasi
  let periodeBanner = '';
  if (p) {
    const jamMulai = p.jam_mulai || '08:00';
    const jamSelesai = p.jam_selesai || '17:00';
    const tglSelesai = formatDate(p.tanggal_selesai);
    periodeBanner = `
      <div style="background:linear-gradient(135deg,#0d9488,#06b6d4);border-radius:12px;padding:16px 20px;color:white;margin-bottom:16px;display:flex;align-items:flex-start;gap:14px">
        <span class="material-icons" style="font-size:28px;opacity:0.9;flex-shrink:0;margin-top:2px">event_available</span>
        <div style="flex:1">
          <div style="font-weight:800;font-size:16px;margin-bottom:2px">Periode Input Aktif: ${p.nama_bulan} ${p.tahun}</div>
          <div style="font-size:13px;opacity:0.9">Dibuka: ${formatDate(p.tanggal_mulai)} pukul ${jamMulai} — Ditutup: ${tglSelesai} pukul ${jamSelesai} WITA</div>
          ${p.notif_operator ? `<div style="margin-top:8px;padding:8px 12px;background:rgba(255,255,255,0.15);border-radius:8px;font-size:13px;border-left:3px solid rgba(255,255,255,0.6)">📢 ${p.notif_operator}</div>` : ''}
        </div>
      </div>`;
  } else {
    periodeBanner = `<div class="info-card warning"><span class="material-icons">warning</span><div class="info-card-text">Tidak ada periode input yang aktif saat ini. Hubungi Admin.</div></div>`;
  }

  el.innerHTML = `
    <div class="stats-grid">
      ${statCard('blue','assignment','Total Usulan Saya', d.totalUsulan)}
      ${statCard('green','check_circle','Selesai/Disetujui', d.disetujui)}
      ${statCard('orange','pending','Dalam Proses', d.menunggu)}
      ${statCard('cyan','event_available','Periode Aktif', periodeAktifList.length > 0 ? periodeAktifList.length + ' Periode' : '-')}
    </div>
    ${periodeBanner}
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

function renderKepalasDashboard(el, d) {
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

  API.getUsulan({ kode_pkm: currentUser.kodePKM, status: 'Menunggu Kepala Puskesmas' }).then(rows => {
    document.getElementById('pendingTable').innerHTML = renderUsulanTable(rows, 'kepala-puskesmas');
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
        <span class="card-title"><span class="material-icons">pending_actions</span>Usulan Menunggu Verifikasi Pengelola Program</span>
        <button class="btn btn-secondary btn-sm" onclick="loadPage('verifikasi')"><span class="material-icons">arrow_forward</span>Lihat Semua</button>
      </div>
      <div class="card-body" style="padding:0" id="pendingTable"></div>
    </div>`;

  API.getUsulan({
    email_program: currentUser.email,
    status_program: 'Menunggu Pengelola Program,Menunggu Admin,Selesai,Ditolak'
  }).then(rows => {
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
      (role === 'kepala-puskesmas' && u.statusGlobal === 'Menunggu Kepala Puskesmas') ||
      (role === 'program' && (u.statusGlobal === 'Menunggu Pengelola Program' || u.statusGlobal === 'Ditolak')) ||
      (role === 'admin'   && u.statusGlobal === 'Menunggu Admin');

    // Sudah verifikasi: untuk Kepala Puskesmas cek statusKapus, untuk Program cek myVerifStatus, untuk Admin cek Selesai
    const sudahVerifKepala = role === 'kepala-puskesmas' && (u.statusKapus === 'Selesai' || u.statusKapus === 'Ditolak');
    const sudahVerifProgram = role === 'program' && (
      u.sudahVerif === true ||
      (u.myVerifStatus === 'Selesai' || u.myVerifStatus === 'Ditolak') ||
      u.statusGlobal === 'Menunggu Admin' ||
      u.statusGlobal === 'Selesai'
    );
    const sudahVerifAdmin = role === 'admin' && u.statusGlobal === 'Selesai';
    const sudahVerif = sudahVerifKepala || sudahVerifProgram || sudahVerifAdmin;

    let verifBtn;
    if (sudahVerif) {
      // Sudah approve — tampilkan tombol hijau terkunci
      verifBtn = `<button class="btn-icon" title="Anda sudah memverifikasi" style="background:#d1fae5;color:#065f46;cursor:default;border:1.5px solid #0d9488" disabled><span class="material-icons">check_circle</span></button>`;
    } else if (canVerif) {
      verifBtn = `<button class="btn-icon approve" onclick="openVerifikasi('${u.idUsulan}')" title="Verifikasi Sekarang" style="animation:pulse 1.5s infinite"><span class="material-icons">rate_review</span></button>`;
    } else {
      verifBtn = `<button class="btn-icon" title="Menunggu tahap sebelumnya" style="opacity:0.35;cursor:not-allowed" disabled><span class="material-icons">lock</span></button>`;
    }

    // Tombol download PDF
    // Laporan final: statusGlobal === 'Selesai'; Laporan sementara: kapus sudah approve, semua role
    const kapusApproved = u.statusKapus === 'Selesai';
    const isFinished = u.statusGlobal === 'Selesai';
    const canDlSementara = kapusApproved && !isFinished; // semua role bisa download laporan sementara

    const pdfBtn = isFinished
      ? `<button class="btn-icon" onclick="downloadLaporanPDF('${u.idUsulan}')" title="Download Laporan PDF" style="background:transparent;border:none;color:#64748b"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v10"/><path d="m8 9 4 4 4-4"/><path d="M4 17c0 2.2 1.8 4 4 4h8c2.2 0 4-1.8 4-4"/></svg></button>`
      : canDlSementara
        ? `<button class="btn-icon" onclick="downloadLaporanSementara('${u.idUsulan}')" title="Download Laporan Sementara (Kapus)" style="background:transparent;border:none;color:#f59e0b"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v10"/><path d="m8 9 4 4 4-4"/><path d="M4 17c0 2.2 1.8 4 4 4h8c2.2 0 4-1.8 4-4"/></svg></button>`
        : '';

    if (['kepala-puskesmas', 'program', 'admin'].includes(role)) {
      return viewBtn + pdfBtn + verifBtn + `<button class="btn-icon" onclick="openLogAktivitas('${u.idUsulan}')" title="Riwayat Aktivitas" style="background:transparent;border:none;color:#64748b"><span class="material-icons" style="font-size:18px">history</span></button>`;
    }
    return viewBtn + `<button class="btn-icon" onclick="openLogAktivitas('${u.idUsulan}')" title="Riwayat Aktivitas" style="background:transparent;border:none;color:#64748b"><span class="material-icons" style="font-size:18px">history</span></button>`;
  };

  const tableKey = 'usulan_' + role;
  const page = _pgState[tableKey] || 1;
  const ps = PAGINATION_SIZE;
  const sliced = rows.slice((page-1)*ps, page*ps);

  return `<div class="table-container"><table>
    <thead><tr><th>ID Usulan</th><th>Puskesmas</th><th>Periode</th><th>Status</th><th>Dibuat</th><th>Aksi</th></tr></thead>
    <tbody>${sliced.map(u => `<tr>
      <td><span style="font-family:'JetBrains Mono',monospace;font-weight:600;font-size:12px;">${u.idUsulan}</span></td>
      <td>${u.namaPKM || u.kodePKM}</td>
      <td>${u.namaBulan || ''} ${u.tahun}</td>
      <td>${statusBadge(u.statusGlobal)}</td>
      <td style="font-size:12px;color:var(--text-light)">${formatDateTime(u.createdAt)}</td>
      <td>${actionBtn(u)}</td>
    </tr>`).join('')}</tbody>
  </table></div>
  <div id="pg-${tableKey}"></div>
  <script>renderPagination('pg-${tableKey}', ${rows.length}, ${page}, ${ps}, 'pgUsulan_${role}');<\/script>`;
}

// Pagination handler untuk usulan per role
function pgUsulan_operator(p) { _pgState['usulan_operator'] = p; document.getElementById('verifTable') ? loadVerifData(window._lastVerifStatus||'semua') : renderInput(); }
function pgUsulan_program(p) { _pgState['usulan_program'] = p; loadVerifData(window._lastVerifStatus||'semua'); }
function pgUsulan_admin(p) { _pgState['usulan_admin'] = p; loadVerifData(window._lastVerifStatus||'semua'); }
function pgUsulan_kepala_puskesmas(p) { _pgState['usulan_kepala-puskesmas'] = p; loadVerifData(window._lastVerifStatus||'semua'); }

// ============== INPUT USULAN (OPERATOR) ==============
async function renderInput() {
  // Guard: hanya Operator yang bisa input usulan
  if (currentUser && currentUser.role === 'Kepala Puskesmas') {
    document.getElementById('content').innerHTML = `<div class="empty-state"><span class="material-icons" style="font-size:48px;color:var(--text-xlight)">block</span><p>Kepala Puskesmas tidak memiliki akses untuk input usulan.</p></div>`;
    return;
  }
  let pkmList = [], periodeAktif = null, allPeriode = [], periodeOptions = [];
  try {
    [pkmList] = await Promise.all([API.getPKM(true)]);
    try {
      const periodeRes = await API.get('periode');
      allPeriode = Array.isArray(periodeRes) ? periodeRes : [];
      // Operator hanya bisa pilih periode yang benar-benar aktif hari ini atau masih dalam rentang
      // isAktifToday = status Aktif DAN dalam rentang tanggal
      periodeOptions = allPeriode.filter(p => p.isAktifToday);
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

  // Info banner periode - dengan notifikasi dan jam
  const periodeBanner = periodeAktif
    ? `<div style="background:linear-gradient(135deg,#0d9488,#06b6d4);border-radius:12px;padding:16px 20px;color:white;margin-bottom:16px;display:flex;align-items:flex-start;gap:14px">
        <span class="material-icons" style="font-size:28px;opacity:0.9;flex-shrink:0;margin-top:2px">event_available</span>
        <div style="flex:1">
          <div style="font-weight:800;font-size:16px;margin-bottom:2px">Periode Input Aktif: ${periodeAktif.namaBulan} ${periodeAktif.tahun}</div>
          <div style="font-size:13px;opacity:0.9">Dibuka: ${formatDate(periodeAktif.tanggalMulai)} pukul ${periodeAktif.jamMulai||'08:00'} — Ditutup: ${formatDate(periodeAktif.tanggalSelesai)} pukul ${periodeAktif.jamSelesai||'17:00'} WITA</div>
          ${periodeAktif.notifOperator ? `<div style="margin-top:8px;padding:8px 12px;background:rgba(255,255,255,0.15);border-radius:8px;font-size:13px;border-left:3px solid rgba(255,255,255,0.6)">📢 ${periodeAktif.notifOperator}</div>` : ''}
        </div>
      </div>`
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
    const tbl = document.getElementById('myUsulanTable');
    if (!tbl) {
      // User mungkin sedang di dashboard, refresh dashboard saja
      if (currentUser.role === 'Operator') renderDashboard();
      return;
    }
    tbl.innerHTML = rows.length ? `
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
            ${u.statusGlobal === 'Selesai'
              ? `<button class="btn-icon" onclick="downloadLaporanPDF('${u.idUsulan}')" title="Download Laporan PDF" style="background:transparent;border:none;color:#64748b"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v10"/><path d="m8 9 4 4 4-4"/><path d="M4 17c0 2.2 1.8 4 4 4h8c2.2 0 4-1.8 4-4"/></svg></button>`
              : u.statusKapus === 'Selesai'
                ? `<button class="btn-icon" onclick="downloadLaporanSementara('${u.idUsulan}')" title="Download Laporan Sementara" style="background:transparent;border:none;color:#f59e0b"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v10"/><path d="m8 9 4 4 4-4"/><path d="M4 17c0 2.2 1.8 4 4 4h8c2.2 0 4-1.8 4-4"/></svg></button>`
                : ''}
            ${u.statusGlobal === 'Draft' ? `<button class="btn-icon edit" onclick="openIndikatorModal('${u.idUsulan}')"><span class="material-icons">edit</span></button>` : ''}
            ${u.statusGlobal === 'Draft' ? `<button class="btn-icon del" onclick="deleteUsulan('${u.idUsulan}')"><span class="material-icons">delete</span></button>` : ''}
            ${u.statusGlobal === 'Ditolak' ? `<button class="btn btn-warning btn-sm" onclick="openIndikatorModal('${u.idUsulan}')" style="background:#f59e0b;color:white;border-color:#f59e0b"><span class="material-icons" style="font-size:14px">restart_alt</span> Perbaiki & Ajukan Ulang</button>` : ''}
            
            <button class="btn-icon" onclick="openLogAktivitas('${u.idUsulan}')" title="Riwayat Aktivitas" style="background:transparent;border:none;color:#64748b"><span class="material-icons" style="font-size:18px">history</span></button>
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
  showConfirm({ title: 'Hapus Usulan', message: `Hapus usulan ${idUsulan}? Semua data dukung di Cloudinary juga akan dihapus.`,
    type: 'danger',
    onConfirm: async () => {
      try {
        // Ambil semua file terkait usulan ini dulu
        const inds = await API.getIndikatorUsulan(idUsulan).catch(() => []);
        // Hapus dari DB
        await API.del('usulan', { idUsulan });
        // Hapus semua file dari Cloudinary (background, silent)
        for (const ind of (inds || [])) {
          if (!ind.linkFile) continue;
          try {
            const links = JSON.parse(ind.linkFile);
            for (const f of (Array.isArray(links) ? links : [])) {
              if (f?.id) {
                fetch('/.netlify/functions/delete-file', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ publicId: f.id })
                }).catch(() => {});
              }
            }
          } catch(e) {}
        }
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
        ? '<span class="material-icons">refresh</span> Ajukan Ulang'
        : '<span class="material-icons">send</span> Submit';
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
        <input type="hidden" id="bobot-${ind.no}" value="${ind.bobot}">
        <td>${isLocked ? `<span>${ind.target}</span>` : `<input type="number" id="t-${ind.no}" value="${Math.round(ind.target||0)}" step="1"
            style="width:72px;border:1.5px solid var(--border);border-radius:6px;padding:3px 6px;font-size:13px"
            onchange="saveIndikator(${ind.no})" oninput="previewSPM(${ind.no})">`}</td>
        <td>${isLocked ? `<span>${ind.capaian}</span>` : `<div style="display:flex;flex-direction:column;gap:2px">
            <input type="number" id="c-${ind.no}" value="${Math.round(ind.capaian||0)}" step="1"
              style="width:72px;border:1.5px solid var(--border);border-radius:6px;padding:3px 6px;font-size:13px"
              onchange="saveIndikator(${ind.no})" oninput="validateRealisasi(${ind.no})">
            <span id="c-warn-${ind.no}" style="display:none;font-size:10px;color:#ef4444;font-weight:600;white-space:nowrap">Nilai tidak bisa melebihi target</span>
          </div>`}</td>
        <td id="cap-${ind.no}" style="text-align:center;font-weight:700;font-size:13px;color:${ind.target>0?(ind.capaian/ind.target*100)>=100?'#16a34a':'#0d9488':'#64748b'}">${ind.target > 0 ? (ind.capaian / ind.target * 100).toFixed(1) + '%' : '-'}</td>
        <td style="min-width:100px;text-align:center">
          ${(() => {
            // Parse link_file: bisa string URL tunggal atau JSON array
            let links = [];
            if (ind.linkFile) {
              try { links = JSON.parse(ind.linkFile); if (!Array.isArray(links)) links = [ind.linkFile]; }
              catch { links = [ind.linkFile]; }
            }
            // Normalisasi links ke format {id, url, name}
            const normLinks = links.map(f => typeof f === 'string' ? { id: null, url: f, name: 'File' } : f);

            if (isLocked) {
              if (!normLinks.length) return '<span style="color:#94a3b8;font-size:12px">-</span>';
              // Set _buktiLinks untuk modal preview di locked state juga
              window[`_buktiLinks_${ind.no}`] = { links: normLinks, idUsulan };
              return `<div style="display:flex;align-items:center;gap:2px">
                <input type="hidden" id="indLinks-${ind.no}" value='${JSON.stringify(normLinks).replace(/'/g,"&#39;")}' data-idusulan="${idUsulan}">
                <button onclick="openBuktiModal(${ind.no},0)" title="Preview" style="background:none;border:none;cursor:pointer;padding:2px 4px;border-radius:5px;display:flex;align-items:center;color:#0d9488"><span class="material-icons" style="font-size:16px">visibility</span></button>
              </div>`;
            }
            const hasFiles = normLinks.length > 0;
            const btnStyle = hasFiles
              ? 'display:inline-flex;align-items:center;padding:4px 12px;background:#16a34a;color:white;border-radius:6px;cursor:pointer;font-size:11.5px;font-weight:600;border:1.5px solid #16a34a;white-space:nowrap'
              : 'display:inline-flex;align-items:center;padding:4px 12px;background:#ef4444;color:white;border-radius:6px;cursor:pointer;font-size:11.5px;font-weight:600;border:1.5px solid #ef4444;white-space:nowrap';

            if (normLinks.length > 0) window[`_buktiLinks_${ind.no}`] = { links: normLinks, idUsulan };
            const fileControlHtml = normLinks.length > 0
              ? `<div style="display:flex;align-items:center;gap:1px">
                  <input type="hidden" id="indLinks-${ind.no}" value='${JSON.stringify(normLinks).replace(/'/g,"&#39;")}' data-idusulan="${idUsulan}">
                  <button onclick="openBuktiModal(${ind.no},0)" title="Preview" style="background:none;border:none;cursor:pointer;padding:2px 4px;border-radius:5px;display:flex;align-items:center;color:#0d9488" onmouseover="this.style.background='rgba(13,148,136,0.08)'" onmouseout="this.style.background='none'"><span class="material-icons" style="font-size:16px">visibility</span></button>
                  <button onclick="hapusBukti('${idUsulan}',${ind.no},${normLinks.length-1})" title="Hapus" style="background:none;border:none;cursor:pointer;padding:3px 4px;border-radius:5px;display:flex;align-items:center;color:#ef4444" onmouseover="this.style.background='rgba(239,68,68,0.08)'" onmouseout="this.style.background='none'">${SVG_TRASH}</button>
                </div>`
              : '';
            return `<div id="uploadCell-${ind.no}" style="display:flex;align-items:center;gap:6px;justify-content:center">
                <div style="display:flex;flex-direction:column;align-items:flex-start;gap:2px">
                  <label id="uploadLabel-${ind.no}" style="${btnStyle}">
                    ${hasFiles ? 'Uploaded' : 'Upload'}
                    <input type="file" multiple accept="application/pdf,image/png,image/jpeg,image/jpg,image/gif,image/webp" style="display:none" onchange="uploadBuktiIndikator(event,${ind.no},'${idUsulan}','${detail.kodePKM}',${detail.tahun},${detail.bulan},'${namaBulan}')">
                  </label>
                  <span style="font-size:9px;color:#94a3b8;padding-left:2px">PDF / Gambar</span>
                </div>
                <div id="fileControls-${ind.no}">${fileControlHtml}</div>
              </div>`;
          })()}
        </td>
      </tr>`;
    }).join('');
  } catch (e) {
    toast(e.message, 'error');
  }
}


// ============== ICON CONSTANTS ==============
const SVG_EYE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';
const SVG_TRASH = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>';

// ============== UPLOAD BUKTI INDIKATOR ==============
async function uploadBuktiIndikator(event, noIndikator, idUsulan, kodePKM, tahun, bulan, namaBulan) {
  const files = Array.from(event.target.files);
  if (!files.length) return;

  // Validasi tipe file: hanya PDF dan image
  const allowed = ['application/pdf','image/png','image/jpeg','image/jpg','image/gif','image/webp'];
  const invalid = files.filter(f => !allowed.includes(f.type));
  if (invalid.length) {
    toast(`Format tidak didukung: ${invalid.map(f=>f.name).join(', ')}. Hanya PDF dan gambar (PNG/JPG) yang diperbolehkan.`, 'error');
    event.target.value = '';
    return;
  }

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

      const res = await fetch("/.netlify/functions/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          fileBase64: base64,
          kodePKM,
          tahun,
          bulan,
          noIndikator
        })
      });

      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Upload gagal');
      const fileUrl = result.fileUrl;
      if (!fileUrl) throw new Error('URL file tidak ditemukan dalam response');
      uploadedLinks.push({ id: result.publicId, url: fileUrl, name: file.name });
    } catch (e) {
      toast(`Gagal upload ${file.name}: ${e.message}`, 'error');
    }
  }

  if (uploadedLinks.length > 0) {
    // Ambil links yang sudah ada sebelumnya, lalu append
    const existingDetail = await API.getIndikatorUsulan(idUsulan);
    const existingInd = (existingDetail || []).find(i => i.no === noIndikator || i.noIndikator === noIndikator);
    let existingLinks = [];
    if (existingInd?.linkFile) {
      try {
        const parsed = JSON.parse(existingInd.linkFile);
        if (Array.isArray(parsed)) {
          // Normalisasi: bisa [{id,url}] atau [string]
          existingLinks = parsed.map(f => typeof f === 'string' ? { id: null, url: f, name: 'File' } : f);
        } else {
          existingLinks = [{ id: null, url: existingInd.linkFile, name: 'File' }];
        }
      } catch { existingLinks = [{ id: null, url: existingInd.linkFile, name: 'File' }]; }
    }
    const allLinks = [...existingLinks, ...uploadedLinks];
    const linkToSave = JSON.stringify(allLinks);

    const tVal = parseInt(document.getElementById(`t-${noIndikator}`)?.value) || 0;
    const cVal = parseInt(document.getElementById(`c-${noIndikator}`)?.value) || 0;
    await API.updateIndikatorUsulan({ idUsulan, noIndikator, target: tVal, capaian: cVal, linkFile: linkToSave });

    statusDiv.remove();

    // Update fileControls
    window[`_buktiLinks_${noIndikator}`] = { links: allLinks, idUsulan };
    const controls = document.getElementById(`fileControls-${noIndikator}`);
    if (controls) {
      if (allLinks.length > 0) {
        controls.innerHTML = '<div style="display:flex;align-items:center;gap:1px">'
          + '<button onclick="openBuktiModal(' + noIndikator + ',0)" title="Preview" style="background:none;border:none;cursor:pointer;padding:2px 4px;border-radius:5px;display:flex;align-items:center;color:#0d9488"><span class="material-icons" style="font-size:16px">visibility</span></button>'
          + '<button onclick="hapusBukti(\'' + idUsulan + '\',' + noIndikator + ',' + (allLinks.length-1) + ')" title="Hapus" style="background:none;border:none;cursor:pointer;padding:3px 4px;border-radius:5px;display:flex;align-items:center;color:#ef4444">' + SVG_TRASH + '</button>'
          + '</div>';
      } else {
        controls.innerHTML = '';
      }
    }

    // Tombol hijau tanpa icon
    const label = document.getElementById(`uploadLabel-${noIndikator}`);
    if (label) {
      label.style.cssText = 'display:inline-flex;align-items:center;padding:4px 12px;background:#16a34a;color:white;border-radius:6px;cursor:pointer;font-size:11.5px;font-weight:600;border:1.5px solid #16a34a;white-space:nowrap';
      label.querySelectorAll('.material-icons').forEach(el => el.remove());
      const textNode = [...label.childNodes].find(n => n.nodeType === 3);
      if (textNode) textNode.textContent = 'Uploaded';
      else label.insertBefore(document.createTextNode('Uploaded'), label.querySelector('input'));
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
// Folder management dipindah ke backend (drive-upload.js)

// Hapus satu file data dukung berdasarkan index
async function hapusBukti(idUsulan, noIndikator, fileIndex) {
  showConfirm({
    title: 'Hapus Data Dukung',
    message: `Hapus <strong>File ${fileIndex + 1}</strong> dari indikator ${noIndikator}?`,
    type: 'danger',
    onConfirm: async () => {
      try {
        const existingDetail = await API.getIndikatorUsulan(idUsulan);
        const existingInd = (existingDetail || []).find(i => i.no === noIndikator || i.noIndikator === noIndikator);
        let links = [];
        if (existingInd?.linkFile) {
          try {
            const parsed = JSON.parse(existingInd.linkFile);
            links = Array.isArray(parsed)
              ? parsed.map(f => typeof f === 'string' ? { id: null, url: f, name: 'File' } : f)
              : [{ id: null, url: existingInd.linkFile, name: 'File' }];
          } catch { links = [{ id: null, url: existingInd.linkFile, name: 'File' }]; }
        }

        // Hapus dari Cloudinary dulu (silent — jangan block UI jika gagal)
        const fileToDelete = links[fileIndex];
        if (fileToDelete?.id) {
          try {
            await fetch('/.netlify/functions/delete-file', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ publicId: fileToDelete.id })
            });
          } catch(e) {
            console.warn('Cloudinary delete gagal (diabaikan):', e.message);
          }
        }

        links.splice(fileIndex, 1);
        const newLinkFile = links.length ? JSON.stringify(links) : '';
        const tVal = parseInt(document.getElementById(`t-${noIndikator}`)?.value) || 0;
        const cVal = parseInt(document.getElementById(`c-${noIndikator}`)?.value) || 0;
        await API.updateIndikatorUsulan({ idUsulan, noIndikator, target: tVal, capaian: cVal, linkFile: newLinkFile });

        toast('File berhasil dihapus', 'success');

        // Refresh fileControls
        window[`_buktiLinks_${noIndikator}`] = { links, idUsulan };
        const ctrl = document.getElementById(`fileControls-${noIndikator}`);
        if (ctrl) {
          if (links.length > 0) {
            ctrl.innerHTML = '<div style="display:flex;align-items:center;gap:1px">'
              + '<button onclick="openBuktiModal(' + noIndikator + ',0)" title="Preview" style="background:none;border:none;cursor:pointer;padding:2px 4px;border-radius:5px;display:flex;align-items:center;color:#0d9488"><span class="material-icons" style="font-size:16px">visibility</span></button>'
              + '<button onclick="hapusBukti(\'' + idUsulan + '\',' + noIndikator + ',' + (links.length-1) + ')" title="Hapus" style="background:none;border:none;cursor:pointer;padding:3px 4px;border-radius:5px;display:flex;align-items:center;color:#ef4444">' + SVG_TRASH + '</button>'
              + '</div>';
          } else {
            ctrl.innerHTML = '';
          }
        }
        const lbl = document.getElementById(`uploadLabel-${noIndikator}`);
        if (lbl && links.length === 0) {
          lbl.style.cssText = 'display:inline-flex;align-items:center;padding:4px 12px;background:#ef4444;color:white;border-radius:6px;cursor:pointer;font-size:11.5px;font-weight:600;border:1.5px solid #ef4444;white-space:nowrap';
          const tn = [...lbl.childNodes].find(n => n.nodeType === 3);
          if (tn) tn.textContent = 'Upload';
        }
      } catch(e) {
        toast('Gagal hapus: ' + e.message, 'error');
      }
    }
  });
}

function openBuktiModal(noIndikator, startIdx) {
  let data = window[`_buktiLinks_${noIndikator}`];
  // Fallback: baca dari hidden input di DOM kalau window data belum ter-set
  if (!data || !data.links.length) {
    const hiddenEl = document.getElementById(`indLinks-${noIndikator}`);
    if (hiddenEl) {
      try {
        const parsed = JSON.parse(hiddenEl.value);
        const idUsulan = hiddenEl.dataset.idusulan;
        const links = Array.isArray(parsed) ? parsed.map(f => typeof f === 'string' ? { id: null, url: f, name: 'File' } : f) : [];
        data = { links, idUsulan };
        window[`_buktiLinks_${noIndikator}`] = data;
      } catch(e) {}
    }
  }
  if (!data || !data.links.length) { toast('Data dukung tidak ditemukan', 'error'); return; }
  window._modalBukti = { links: data.links, idUsulan: data.idUsulan, idx: startIdx || 0, noIndikator };
  _renderBuktiModal();
}

function _renderBuktiModal() {
  const { links, idx, idUsulan, noIndikator } = window._modalBukti;
  const f = links[idx];

  // Nama file asli dari f.name (tersimpan saat upload dengan ekstensi lengkap)
  let fileName = (f.name && f.name !== 'File' && f.name.trim()) ? f.name.trim() : null;

  // Kalau tidak ada f.name, coba ekstrak dari publicId
  if (!fileName && f.id) {
    const pidParts = f.id.split('/').pop();
    const match = pidParts.match(/_\d+_(.+)$/);
    if (match) fileName = match[1];
  }

  // Fallback: nama generik
  if (!fileName) fileName = 'file';

  // Ekstrak ekstensi — coba dari fileName dulu, fallback dari URL
  let dotIdx = fileName.lastIndexOf('.');
  let ext = dotIdx > -1 ? fileName.substring(dotIdx + 1).toLowerCase() : '';
  if (!ext) {
    // Ambil dari URL (berguna untuk file lama yang URL-nya punya ekstensi)
    const urlClean = (f.url || '').split('?')[0];
    const urlExt = urlClean.split('.').pop().toLowerCase();
    if (urlExt && urlExt.length <= 5 && /^[a-z0-9]+$/.test(urlExt)) ext = urlExt;
  }
  // Pastikan fileName punya ekstensi
  if (ext && !fileName.toLowerCase().endsWith('.' + ext)) fileName = fileName + '.' + ext;

  const isImage = ['jpg','jpeg','png','gif','webp'].includes(ext);
  const isPDF = ext === 'pdf';
  const isOffice = ['doc','docx','xls','xlsx','ppt','pptx'].includes(ext);
  const total = links.length;

  // Semua akses file lewat sign-url proxy (Cloudinary raw tidak bisa diakses publik langsung)
  const urlWithExt = (f.url && ext && !f.url.split('/').pop().split('?')[0].includes('.'))
    ? f.url + '.' + ext : f.url;
  const proxyUrl = `/api/sign-url?url=${encodeURIComponent(urlWithExt)}&name=${encodeURIComponent(fileName)}&mode=preview`;
  const downloadProxyUrl = `/api/sign-url?url=${encodeURIComponent(urlWithExt)}&name=${encodeURIComponent(fileName)}&mode=download`;

  let modal = document.getElementById('previewBuktiModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'previewBuktiModal';
    modal.className = 'modal fullscreen';
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('show'); });
  }

  const svgDownload = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
  const svgTrashM = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>`;
  const navBtn = (dir, fn) => `<button onclick="${fn}" style="position:absolute;top:50%;${dir}:14px;transform:translateY(-50%);background:rgba(255,255,255,0.12);backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,0.18);color:white;border-radius:50%;width:42px;height:42px;cursor:pointer;font-size:22px;display:flex;align-items:center;justify-content:center;line-height:1;z-index:10" onmouseover="this.style.background='rgba(255,255,255,0.25)'" onmouseout="this.style.background='rgba(255,255,255,0.12)'">${dir==='left'?'&#8249;':'&#8250;'}</button>`;
  const fileIcons = { pdf:'&#128196;', doc:'&#128196;', docx:'&#128196;', xls:'&#128202;', xlsx:'&#128202;', ppt:'&#128190;', pptx:'&#128190;' };
  const fileIcon = fileIcons[ext] || '&#128196;';

  const previewId = 'buktiPreview_' + idx + '_' + Date.now();
  modal.innerHTML = `
    <div class="modal-card" style="background:#0f172a;">
      <div class="modal-header" style="background:#1e293b;border-bottom:1px solid rgba(255,255,255,0.08);">
        <span class="material-icons" style="color:#0d9488;font-size:18px">description</span>
        <h3 style="color:white;font-size:14px;">Data Dukung
          ${total > 1 ? `<span style="background:#334155;color:#94a3b8;font-size:11px;padding:2px 8px;border-radius:20px;font-weight:600;margin-left:8px;">${idx+1} / ${total}</span>` : ''}
        </h3>
        <div style="display:flex;gap:6px;align-items:center;margin-left:auto;">
          <button onclick="downloadBukti(${idx})" title="Download" style="background:rgba(13,148,136,0.15);color:#0d9488;border:1px solid rgba(13,148,136,0.3);padding:5px 10px;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:5px">${svgDownload}</button>
          ${idUsulan ? `<button onclick="hapusBukti('${idUsulan}',${noIndikator},${idx})" style="background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.3);padding:5px 12px;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:5px">${svgTrashM} Hapus</button>` : ''}
          <button onclick="document.getElementById('previewBuktiModal').classList.remove('show')" style="background:rgba(255,255,255,0.08);border:none;cursor:pointer;color:white;border-radius:7px;width:32px;height:32px;font-size:20px;display:flex;align-items:center;justify-content:center">&#215;</button>
        </div>
      </div>
      <div class="modal-body flex-col" style="position:relative;background:#0f172a;">
        <div id="${previewId}" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;">
          ${isImage
            ? `<img src="${proxyUrl}" style="max-width:100%;max-height:100%;object-fit:contain;padding:16px">`
            : `<div style="color:#94a3b8;font-size:13px;display:flex;align-items:center;gap:8px">
                <span class="material-icons" style="animation:spin 1s linear infinite">refresh</span> Memuat...
              </div>`
          }
        </div>
        ${total > 1 ? navBtn('left','_buktiNav(-1)') : ''}
        ${total > 1 ? navBtn('right','_buktiNav(1)') : ''}
      </div>
      ${total > 1 ? `
      <div style="display:flex;justify-content:center;gap:5px;padding:8px;flex-shrink:0;border-top:1px solid rgba(255,255,255,0.08);background:#1e293b;">
        ${links.map((_,i)=>`<button onclick="_buktiGoto(${i})" style="width:${i===idx?'20px':'7px'};height:7px;border-radius:10px;border:none;cursor:pointer;background:${i===idx?'#0d9488':'rgba(255,255,255,0.2)'};transition:all 0.2s;padding:0"></button>`).join('')}
      </div>` : ''}
    </div>`;
  modal.classList.add('show');

  // Untuk non-image: fetch sebagai blob lalu embed
  if (!isImage) {
    (async () => {
      const el = document.getElementById(previewId);
      if (!el) return;
      try {
        const res = await fetch(proxyUrl);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);

        if (isPDF) {
          el.innerHTML = `<iframe src="${blobUrl}" style="width:100%;height:100%;border:none"></iframe>`;
        } else if (isOffice) {
          el.innerHTML = `<div style="text-align:center;color:white;padding:60px 40px">
            <div style="font-size:64px;margin-bottom:16px">${fileIcon}</div>
            <div style="font-size:15px;font-weight:600;color:white;margin-bottom:8px">${fileName}</div>
            <div style="font-size:12px;color:#64748b;margin-bottom:28px">${ext.toUpperCase()} • Tidak dapat dipreview di browser</div>
            <a href="${blobUrl}" download="${fileName}" style="background:#0d9488;color:white;padding:10px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;display:inline-flex;align-items:center;gap:8px">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download ${ext.toUpperCase()}
            </a>
          </div>`;
        } else {
          el.innerHTML = `<div style="text-align:center;color:white;padding:40px">
            <div style="font-size:64px;margin-bottom:16px">${fileIcon}</div>
            <div style="font-size:11px;color:#64748b;margin-bottom:28px;text-transform:uppercase">${ext.toUpperCase()} &bull; Tidak dapat dipreview</div>
            <button onclick="downloadBukti(${idx})" style="background:#0d9488;color:white;padding:12px 32px;border-radius:8px;border:none;font-weight:600;font-size:14px;cursor:pointer">Download</button>
          </div>`;
        }
      } catch(e) {
        const el2 = document.getElementById(previewId);
        if (!el2) return;
        el2.innerHTML = `<div style="text-align:center;color:white;padding:40px">
          <div style="font-size:64px;margin-bottom:16px">${fileIcon}</div>
          <div style="font-size:11px;color:#64748b;margin-bottom:28px">${ext.toUpperCase()} &bull; Tidak dapat dipreview</div>
          <button onclick="downloadBukti(${idx})" style="background:#0d9488;color:white;padding:12px 32px;border-radius:8px;border:none;font-weight:600;font-size:14px;cursor:pointer;display:inline-flex;align-items:center;gap:8px"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download</button>
        </div>`;
      }
    })();
  }
}

function _buktiNav(dir) {
  const d = window._modalBukti;
  d.idx = (d.idx + dir + d.links.length) % d.links.length;
  _renderBuktiModal();
}

function _buktiGoto(idx) {
  window._modalBukti.idx = idx;
  _renderBuktiModal();
}

async function downloadBukti(idx) {
  const d = window._modalBukti;
  if (!d) return;
  const f = d.links[idx];
  if (!f) return;

  let fileName = (f.name && f.name !== 'File' && f.name.trim()) ? f.name.trim() : 'file';
  const dotIdx2 = fileName.lastIndexOf('.');
  const ext2 = dotIdx2 > -1 ? fileName.substring(dotIdx2 + 1).toLowerCase() : '';
  if (ext2 && !fileName.toLowerCase().endsWith('.' + ext2)) fileName += '.' + ext2;

  // Semua akses lewat sign-url proxy
  const urlHasExt2 = f.url.split('/').pop().split('?')[0].includes('.');
  const urlWithExt2 = (!urlHasExt2 && ext2) ? f.url + '.' + ext2 : f.url;
  const fetchUrl = `/api/sign-url?url=${encodeURIComponent(urlWithExt2)}&name=${encodeURIComponent(fileName)}&mode=download`;

  try {
    const res = await fetch(fetchUrl);
    if (!res.ok) throw Object.assign(new Error('HTTP ' + res.status), { status: res.status });
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl; a.download = fileName;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
  } catch (e) {
    // Fallback: buka di tab baru
    window.open(fetchUrl, '_blank');
  }
}

async function saveIndikator(noIndikator) {
  const target  = parseInt(document.getElementById(`t-${noIndikator}`)?.value) || 0;
  const capaian = parseInt(document.getElementById(`c-${noIndikator}`)?.value) || 0;

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
    message: 'Submit usulan untuk diverifikasi?',
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

    // needConfirm: format khusus (bukan lewat ok()), cek duluan
    if (raw.needConfirm) {
      const nos = (raw.missingNos || []).join(', ');
      (raw.missingNos || []).forEach(no => {
        const label = document.getElementById(`uploadLabel-${no}`);
        if (label) {
          label.style.boxShadow = '0 0 0 3px rgba(239,68,68,0.5)';
          label.style.transform = 'scale(1.05)';
          setTimeout(() => { label.style.boxShadow = ''; label.style.transform = ''; }, 3000);
        }
      });
      showConfirm({
        title: 'Data Dukung Belum Lengkap',
        message: `${raw.missingCount} indikator (no. ${nos}) belum ada file bukti. Tetap submit ke Kepala Puskesmas?`,
        type: 'warning',
        onConfirm: () => doSubmitUsulan(true)
      });
      return;
    }

    // ok() wraps dalam { success: true, data: {...} }
    // err() wraps dalam { success: false, message: '...' }
    if (!res.ok || raw.success === false) {
      toast(raw.message || raw.data?.message || 'Submit gagal', 'error');
      return;
    }

    const successMsg = raw.data?.message || 'Usulan berhasil disubmit!';
    toast(' ' + successMsg, 'success');

    // Sembunyikan tombol submit di modal
    const submitBtn = document.getElementById('btnSubmitFromModal');
    if (submitBtn) submitBtn.style.display = 'none';

    // Update icon tombol di tabel jadi hijau
    const rowBtn = document.querySelector(`button[onclick="openIndikatorModal('${currentIndikatorUsulan}')"]`);
    if (rowBtn) {
      rowBtn.style.background = '#d1fae5';
      rowBtn.style.color = '#065f46';
      rowBtn.style.border = '1.5px solid #0d9488';
      rowBtn.title = 'Sudah diajukan';
      const ic = rowBtn.querySelector('.material-icons');
      if (ic) ic.textContent = 'check_circle';
    }

    loadMyUsulan();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    setLoading(false);
  }
}

// Preview SPM saat oninput (kalkulasi di client tanpa hit server)
function validateRealisasi(no) {
  const tEl = document.getElementById(`t-${no}`);
  const cEl = document.getElementById(`c-${no}`);
  // Paksa nilai jadi integer
  if (tEl && tEl.value.includes('.')) tEl.value = Math.round(parseFloat(tEl.value));
  if (cEl && cEl.value.includes('.')) cEl.value = Math.round(parseFloat(cEl.value));
  const warnEl = document.getElementById(`c-warn-${no}`);
  if (!cEl || !tEl) return;
  const c = parseInt(cEl.value) || 0;
  const t = parseInt(tEl.value) || 0;
  if (t > 0 && c > t) {
    cEl.value = t;
    cEl.style.borderColor = '#ef4444';
    if (warnEl) { warnEl.style.display = 'block'; clearTimeout(warnEl._hideT); warnEl._hideT = setTimeout(() => { warnEl.style.display = 'none'; }, 2000); }
  } else {
    cEl.style.borderColor = '';
    if (warnEl) warnEl.style.display = 'none';
  }
  previewSPM(no);
}

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

    // Update kolom Capaian (%) realtime
    const capEl = document.getElementById(`cap-${no}`);
    if (capEl) {
      if (t > 0) {
        const pct = fmtPct(c / t * 100);
        capEl.textContent = pct;
        capEl.style.color = pct === '100%' || parseFloat(pct) >= 100 ? '#16a34a' : '#0d9488';
      } else {
        capEl.textContent = '-';
        capEl.style.color = '#64748b';
      }
    }
  });
  const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
  const indeksKinerja = totalBobot > 0 ? round2(totalNilai / totalBobot) : 0;
  const indeksSPM = round2(indeksKinerja * 0.33);
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
          &nbsp;
          <span style="display:inline-flex;align-items:center;gap:3px;font-size:12px;font-weight:700;color:#16a34a;background:#dcfce7;padding:2px 8px;border-radius:20px">✅ ${vp.filter(v=>v.status==='Selesai').length} selesai</span>
          ${vp.filter(v=>v.status==='Ditolak').length ? `<span style="display:inline-flex;align-items:center;gap:3px;font-size:12px;font-weight:700;color:#dc2626;background:#fee2e2;padding:2px 8px;border-radius:20px">❌ ${vp.filter(v=>v.status==='Ditolak').length} menolak</span>` : ''}
          <span style="display:inline-flex;align-items:center;gap:3px;font-size:12px;font-weight:700;color:#d97706;background:#fef3c7;padding:2px 8px;border-radius:20px">⏳ ${vp.filter(v=>v.status==='Menunggu').length} menunggu</span>
          <span style="display:inline-flex;align-items:center;gap:3px;font-size:12px;font-weight:600;color:#64748b;background:#f1f5f9;padding:2px 8px;border-radius:20px">📁 Total: ${vp.length}</span>
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
    <div style="padding:24px;background:white">
      ${rejectionBanner}
      <div style="margin-bottom:16px">${renderStatusBar({...detail, vpProgress: detail.verifikasiProgram ? {total:vp.length,selesai:vp.filter(v=>v.status==='Selesai').length} : null})}</div>
      <div class="detail-grid">
        <div class="detail-item"><label>Puskesmas</label><span>${detail.namaPKM}</span></div>
        <div class="detail-item"><label>Periode</label><span>${detail.namaBulan} ${detail.tahun}</span></div>
        <div class="detail-item"><label>Status</label><span>${statusBadge(detail.statusGlobal)}</span></div>
        <div class="detail-item"><label>Dibuat Oleh</label>
          <span>
            <div style="font-weight:600">${detail.namaPembuat || detail.createdBy || '-'}</div>
            <div style="font-size:12px;color:var(--text-light)">${detail.createdBy || ''}</div>
            <div style="font-size:11px;color:var(--text-xlight)">${formatTS(detail.createdAt)}</div>
          </span>
        </div>
        <div class="detail-item">
          <label>Indeks Beban Kerja</label>
          <span style="font-family:'JetBrains Mono';font-weight:700">${parseFloat(detail.indeksBeban||0).toFixed(2)}</span>
        </div>
        <div class="detail-item">
          <label>Indeks Kesulitan Wilayah</label>
          <span style="font-family:'JetBrains Mono';font-weight:700">${parseFloat(detail.indeksKesulitan||0).toFixed(2)}</span>
        </div>
        <div class="detail-item" style="grid-column:span 2">
          <label>Indeks SPM</label>
          <span style="font-family:'JetBrains Mono';font-size:16px;color:var(--primary);font-weight:800">${parseFloat(detail.indeksSPM).toFixed(2)}</span>
        </div>
      </div>
      ${detail.driveFolderUrl ? `<div style="margin-bottom:12px"><a href="${detail.driveFolderUrl}" target="_blank" class="btn btn-secondary btn-sm"><span class="material-icons" style="font-size:14px">folder_open</span> Lihat Folder Data Dukung Google Drive</a></div>` : ''}
      <div style="font-weight:700;font-size:13.5px;margin-bottom:8px">Detail Indikator</div>
      <div class="table-container">
        <table>
          <thead><tr><th>No</th><th>Indikator</th><th>Target</th><th>Realisasi</th><th style="text-align:center">Capaian (%)</th><th>Data Dukung</th></tr></thead>
          <tbody>${inds.map(i => `<tr>
            <td>${i.no}</td><td style="max-width:220px;font-size:12.5px">${i.nama}</td>
            <td>${i.target}</td><td>${i.capaian}</td><td style="text-align:center;font-weight:600;color:${i.target>0?(i.capaian/i.target*100)>=100?'#16a34a':'#0d9488':'#64748b'}">${i.target > 0 ? fmtPct(i.capaian/i.target*100) : '-'}</td>
            
            <td>${i.linkFile ? (() => { try { const ls = JSON.parse(i.linkFile); const arr = Array.isArray(ls) ? ls.map(f=>typeof f==='string'?{id:null,url:f,name:'File'}:f) : [{id:null,url:i.linkFile,name:'File'}]; window[`_buktiLinks_${i.no}`]={links:arr,idUsulan:i.idUsulan||''}; return `<button onclick="openBuktiModal(${i.no},0)" style="background:none;border:none;cursor:pointer;color:#0d9488;display:inline-flex;align-items:center;gap:3px;font-size:12px;padding:2px 6px;border-radius:5px" onmouseover="this.style.background='rgba(13,148,136,0.08)'" onmouseout="this.style.background='none'"><span class="material-icons" style="font-size:14px">visibility</span></button>`; } catch(e){ return `<a href="${i.linkFile}" target="_blank" style="color:#0d9488"><span class="material-icons" style="font-size:13px">visibility</span></a>`; } })() : '-'}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
      ${vpHtml}
      <div style="margin-top:16px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
        ${approvalBox('Kepala Puskesmas', detail.kapusApprovedBy, detail.kapusApprovedAt, detail.statusKapus==='Ditolak' ? detail.kapusCatatan : '')}
        ${approvalBox('Pengelola Program', vp.length && vp.every(v=>v.status==='Selesai') ? 'Semua selesai' : '', '', detail.statusProgram==='Ditolak' ? detail.adminCatatan : '')}
        ${approvalBox('Admin', detail.adminApprovedBy, detail.adminApprovedAt, detail.statusGlobal==='Ditolak' && detail.statusKapus!=='Ditolak' && detail.statusProgram!=='Ditolak' ? detail.adminCatatan : '')}
      </div>
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
    if (!res.ok) { toast('Gagal memuat laporan', 'error'); return; }
    const html = await res.text();
    // Inject auto-print saat halaman load
    const printHtml = html.replace('</head>', `<script>window.onload=function(){setTimeout(function(){window.print();},800);};<\/script></head>`);
    const blob = new Blob([printHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  } catch(e) {
    toast('Gagal: ' + e.message, 'error');
  }
}

async function downloadLaporanSementara(idUsulan) {
  toast('Menyiapkan laporan sementara...', 'success');
  try {
    const res = await fetch(`/api/laporan-pdf?id=${idUsulan}&mode=sementara`);
    if (!res.ok) { toast('Gagal memuat laporan', 'error'); return; }
    const html = await res.text();
    const printHtml = html.replace('</head>', `<script>window.onload=function(){setTimeout(function(){window.print();},800);};<\/script></head>`);
    const blob = new Blob([printHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  } catch(e) {
    toast('Gagal: ' + e.message, 'error');
  }
}

async function generateAndDownloadPDF(htmlContent, fileName) {
  if (!window.html2pdf) {
    toast('Memuat library PDF...', 'success');
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
      s.onload = resolve;
      s.onerror = () => {
        const s2 = document.createElement('script');
        s2.src = 'https://unpkg.com/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js';
        s2.onload = resolve;
        s2.onerror = reject;
        document.head.appendChild(s2);
      };
      document.head.appendChild(s);
    });
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:absolute;top:-99999px;left:0;width:794px;background:white;z-index:-9999';

  const container = document.createElement('div');
  container.style.cssText = 'width:794px;background:white;font-family:Arial,sans-serif;color:#1e293b;font-size:12px';
  container.innerHTML = doc.body.innerHTML;

  wrapper.appendChild(container);
  document.body.appendChild(wrapper);

  const images = container.querySelectorAll('img');
  await Promise.all(Array.from(images).map(img =>
    img.complete ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r; })
  ));
  await new Promise(r => setTimeout(r, 600));

  const opt = {
    margin:      [10, 15, 10, 15],
    filename:    fileName,
    image:       { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, allowTaint: true, logging: false, width: 794, windowWidth: 794, scrollX: 0, scrollY: 0 },
    jsPDF:       { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak:   { mode: ['css', 'legacy'], before: '.page-break' }
  };

  try {
    await html2pdf().set(opt).from(container).save();
    toast('PDF berhasil didownload ✓', 'success');
  } catch(err) {
    toast('Gagal generate PDF: ' + err.message, 'error');
    console.error('html2pdf error:', err);
  } finally {
    wrapper.remove();
  }
}

// ============== LOG AKTIVITAS ==============
async function openLogAktivitas(idUsulan) {
  // Buat modal dahulu dengan loading state
  let modal = document.getElementById('logAktivitasModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'logAktivitasModal';
    modal.className = 'modal fullscreen';
    modal.style.zIndex = '3500';
    modal.addEventListener('click', e => { if (e.target === modal) closeModal('logAktivitasModal'); });
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div class="modal-card" style="display:flex;flex-direction:column;height:100%;border-radius:0">
      <div class="modal-header">
        <span class="material-icons">history</span>
        <span>Riwayat Aktivitas</span>
        <button class="btn-icon" onclick="closeModal('logAktivitasModal')"><span class="material-icons">close</span></button>
      </div>
      <div class="modal-body" id="logAktivitasBody" style="padding:20px;flex:1;overflow-y:auto">
        <div class="empty-state"><span class="material-icons" style="animation:spin 1s linear infinite">refresh</span><p>Memuat riwayat...</p></div>
      </div>
      <div class="modal-footer" id="logAktivitasFooter">
        <button class="btn btn-secondary" onclick="closeModal('logAktivitasModal')">Tutup</button>
        <button class="btn btn-primary" id="btnDownloadLog"><span class="material-icons">picture_as_pdf</span>Download PDF</button>
      </div>
    </div>`;
  showModal('logAktivitasModal');

  try {
    const data = await API.getLogAktivitas(idUsulan);
    const { logs, usulan } = data;

    const aksiConfig = {
      'Submit':        { color: '#0d9488', bg: '#f0fdf9', icon: 'send',         label: 'Diajukan' },
      'Ajukan Ulang':  { color: '#0d9488', bg: '#f0fdf9', icon: 'restart_alt',  label: 'Ajukan Ulang' },
      'Approve':       { color: '#16a34a', bg: '#f0fdf4', icon: 'check_circle', label: 'Disetujui' },
      'Approve Final': { color: '#16a34a', bg: '#f0fdf4', icon: 'verified',     label: 'Final Disetujui' },
      'Tolak':         { color: '#dc2626', bg: '#fef2f2', icon: 'cancel',       label: 'Ditolak' },
      'Reset':         { color: '#d97706', bg: '#fffbeb', icon: 'restart_alt',  label: 'Direset Admin' },
      'Restore Verif': { color: '#6366f1', bg: '#f5f3ff', icon: 'restore',      label: 'Dipulihkan' },
    };

    function fmtDT(ts) {
      const d = new Date(ts);
      return d.toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' })
        + ', ' + d.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' }) + ' WITA';
    }

    const timelineHtml = logs.length === 0
      ? `<div class="empty-state"><span class="material-icons">history_toggle_off</span><p>Belum ada aktivitas</p></div>`
      : logs.map((log, i) => {
          const cfg = aksiConfig[log.aksi] || { color:'#64748b', bg:'#f8fafc', icon:'info', label: log.aksi };
          const isLast = i === logs.length - 1;
          return `
            <div style="display:flex;gap:14px;margin-bottom:${isLast?'0':'16px'}">
              <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0">
                <div style="width:36px;height:36px;border-radius:50%;background:${cfg.bg};border:2px solid ${cfg.color};display:flex;align-items:center;justify-content:center">
                  <span class="material-icons" style="font-size:17px;color:${cfg.color}">${cfg.icon}</span>
                </div>
                ${!isLast ? `<div style="width:2px;flex:1;background:#e2e8f0;margin-top:4px;min-height:16px"></div>` : ''}
              </div>
              <div style="flex:1;padding-bottom:4px">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">
                  <span style="font-size:12.5px;font-weight:700;color:${cfg.color};background:${cfg.bg};padding:2px 10px;border-radius:20px;border:1px solid ${cfg.color}">${cfg.label}</span>
                  <span style="font-size:11px;color:#64748b;font-weight:600">${log.role}</span>
                </div>
                <div style="font-size:13px;font-weight:600;color:#0f172a;margin-bottom:2px">${log.user_nama || log.user_email}</div>
                <div style="font-size:11px;color:#94a3b8;margin-bottom:${log.detail?'6px':'0'}">${fmtDT(log.timestamp)}</div>
                ${log.detail ? `<div style="font-size:12px;color:#334155;background:#f8fafc;border-left:3px solid ${cfg.color};padding:6px 10px;border-radius:0 6px 6px 0;line-height:1.5">${log.detail}</div>` : ''}
              </div>
            </div>`;
        }).join('');

    document.getElementById('logAktivitasBody').innerHTML = `
      <div style="background:#f8fafc;border-radius:10px;padding:12px 16px;margin-bottom:16px;font-size:12.5px;color:#334155">
        <div style="font-weight:700;font-size:13px;margin-bottom:4px">📋 ${usulan.idUsulan}</div>
        <div>${usulan.namaPKM} · ${usulan.namaBulan} ${usulan.tahun}</div>
      </div>
      <div style="max-height:420px;overflow-y:auto;padding-right:4px">${timelineHtml}</div>`;

    const btnDl = document.getElementById('btnDownloadLog');
    if (btnDl) btnDl.onclick = () => downloadLogPDF('${idUsulan}');

  } catch(e) {
    const errBody = document.getElementById('logAktivitasBody'); if(errBody) errBody.innerHTML = `<div class="empty-state"><span class="material-icons" style="color:#ef4444">error</span><p>Gagal memuat: ${e.message}</p></div>`;
  }
}

async function downloadLogPDF(idUsulan) {
  toast('Menyiapkan PDF riwayat...', 'success');
  try {
    const data = await API.getLogAktivitas(idUsulan);
    const { logs, usulan } = data;
    const now = new Date().toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' });

    function fmtDT(ts) {
      const d = new Date(ts);
      return d.toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' })
        + ', ' + d.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' }) + ' WITA';
    }

    const aksiLabel = {
      'Submit':'Diajukan','Ajukan Ulang':'Ajukan Ulang','Approve':'Disetujui',
      'Approve Final':'Final Disetujui','Tolak':'Ditolak','Reset':'Direset Admin','Restore Verif':'Dipulihkan'
    };
    const aksiColor = {
      'Submit':'#0d9488','Ajukan Ulang':'#0d9488','Approve':'#16a34a',
      'Approve Final':'#16a34a','Tolak':'#dc2626','Reset':'#d97706','Restore Verif':'#6366f1'
    };

    const rowsHtml = logs.map((log, i) => {
      const color = aksiColor[log.aksi] || '#64748b';
      const label = aksiLabel[log.aksi] || log.aksi;
      return `<tr style="background:${i%2===0?'#ffffff':'#f8fafc'}">
        <td style="padding:8px 10px;border:1px solid #e2e8f0;font-size:11px;color:#64748b;white-space:nowrap">${fmtDT(log.timestamp)}</td>
        <td style="padding:8px 10px;border:1px solid #e2e8f0;font-size:11px"><span style="background:${color}18;color:${color};padding:2px 8px;border-radius:10px;font-weight:700;font-size:10.5px">${label}</span></td>
        <td style="padding:8px 10px;border:1px solid #e2e8f0;font-size:11px;font-weight:600">${log.userNama}</td>
        <td style="padding:8px 10px;border:1px solid #e2e8f0;font-size:11px;color:#64748b">${log.role}</td>
        <td style="padding:8px 10px;border:1px solid #e2e8f0;font-size:11px">${log.detail||'-'}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8">
<title>Riwayat Aktivitas - ${idUsulan}</title>
<style>
  * { margin:0;padding:0;box-sizing:border-box; }
  body { font-family:Arial,sans-serif;color:#1e293b;background:white;font-size:12px; }
  @page { size:A4 landscape;margin:15mm 18mm; }
  @media print { body{-webkit-print-color-adjust:exact;print-color-adjust:exact;} }
</style>
<script>window.onload=function(){setTimeout(function(){window.print();},600);};<\/script>
</head><body>
<div style="display:flex;align-items:center;gap:14px;padding-bottom:10px;margin-bottom:14px;border-bottom:4px solid #1e293b">
  <img src="https://vispm.netlify.app/logobalut.png" style="width:60px;height:60px;object-fit:contain" onerror="this.style.display='none'">
  <div style="flex:1;text-align:center;line-height:1.6">
    <div style="font-size:11px;font-weight:400;text-transform:uppercase">PEMERINTAH KABUPATEN BANGGAI LAUT</div>
    <div style="font-size:13px;font-weight:900;text-transform:uppercase">DINAS KESEHATAN, PENGENDALIAN PENDUDUK DAN KELUARGA BERENCANA</div>
    <div style="font-size:10px">Jl. KM 7, Adean, Banggai Tengah, Banggai Laut, Sulawesi Tengah 94895</div>
  </div>
</div>
<div style="text-align:center;margin-bottom:14px">
  <div style="font-size:13px;font-weight:700;text-transform:uppercase">Riwayat Aktivitas Verifikasi Usulan SPM</div>
</div>
<table style="width:100%;margin-bottom:12px;border-collapse:collapse">
  <tr><td style="width:100px;font-size:11px;padding:2px 0">ID Usulan</td><td style="font-size:11px;padding:2px 0">: <strong>${usulan.idUsulan}</strong></td>
      <td style="width:100px;font-size:11px;padding:2px 0">Puskesmas</td><td style="font-size:11px;padding:2px 0">: <strong>${usulan.namaPuskesmas}</strong></td></tr>
  <tr><td style="font-size:11px;padding:2px 0">Periode</td><td style="font-size:11px;padding:2px 0">: ${usulan.bulan} ${usulan.tahun}</td>
      <td style="font-size:11px;padding:2px 0">Dicetak</td><td style="font-size:11px;padding:2px 0">: ${now}</td></tr>
</table>
<table style="width:100%;border-collapse:collapse">
  <thead>
    <tr style="background:#1e293b;color:white">
      <th style="padding:8px 10px;font-size:11px;border:1px solid #334155;white-space:nowrap">Waktu</th>
      <th style="padding:8px 10px;font-size:11px;border:1px solid #334155">Aksi</th>
      <th style="padding:8px 10px;font-size:11px;border:1px solid #334155">Nama</th>
      <th style="padding:8px 10px;font-size:11px;border:1px solid #334155">Role</th>
      <th style="padding:8px 10px;font-size:11px;border:1px solid #334155">Keterangan</th>
    </tr>
  </thead>
  <tbody>${rowsHtml}</tbody>
</table>
<div style="margin-top:30px;display:flex;justify-content:flex-end">
  <div style="text-align:center;min-width:200px">
    <div style="font-size:11px;margin-bottom:60px">Adean, ${now}</div>
    <div style="font-size:11px;font-weight:700;border-top:1px solid #1e293b;padding-top:4px">Admin VISPM</div>
  </div>
</div>
</body></html>`;

    const blob = new Blob([html], { type:'text/html' });
    const url = URL.createObjectURL(blob);
    await generateAndDownloadPDF(html, `Log-Aktivitas-${idUsulan||'VISPM'}.pdf`);
    URL.revokeObjectURL(url);
    toast('PDF riwayat siap ✓', 'success');
  } catch(e) {
    toast('Gagal: ' + e.message, 'error');
  }
}

// ============== VERIFIKASI ==============
async function renderVerifikasi() {
  const role = currentUser.role;
  // Default: tampilkan semua agar tombol hijau (sudah verif) bisa terlihat
  let statusFilter = 'semua';

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
    ${role === 'Kepala Puskesmas' ? `<div class="tabs" id="verifTabs">
      <div class="tab active" onclick="loadVerifTab('semua')">Semua Usulan</div>
      <div class="tab" onclick="loadVerifTab('Menunggu Kepala Puskesmas')">Menunggu Verifikasi</div>
    </div>` : ''}
    <div class="card">
      <div class="card-body" style="padding:0" id="verifTable">
        <div class="empty-state" style="padding:32px"><span class="material-icons">hourglass_empty</span><p>Memuat data...</p></div>
      </div>
    </div>`;

  loadVerifData(statusFilter);
}

async function loadVerifTab(status) {
  document.querySelectorAll('#verifTabs .tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  loadVerifData(status);
}

async function loadVerifData(status) {
  const params = {};
  const role = currentUser.role;

  if (role === 'Kepala Puskesmas') {
    if (!currentUser.kodePKM) { toast('Akun Kepala Puskesmas tidak terhubung ke puskesmas. Hubungi Admin.', 'error'); return; }
    params.kode_pkm = currentUser.kodePKM;
    params.email_kepala = currentUser.email;
    if (status && status !== 'semua') params.status = status;
  } else if (role === 'Pengelola Program') {
    // Tampilkan semua yang ditugaskan (sudah/belum verifikasi) agar tombol hijau terlihat
    params.status_program = 'Menunggu Pengelola Program,Ditolak,Selesai,Menunggu Admin';
    params.email_program = currentUser.email;
  } else if (role === 'Admin' && status !== 'semua') {
    params.status = status;
  }

  try {
    const rows = await API.getUsulan(params);
    const verifRole = role === 'Kepala Puskesmas' ? 'kepala-puskesmas' : role === 'Pengelola Program' ? 'program' : 'admin';
    document.getElementById('verifTable').innerHTML = renderUsulanTable(rows, verifRole);
  } catch (e) { toast(e.message, 'error'); }
}

async function openVerifikasi(idUsulan) {
  verifCurrentUsulan = idUsulan;
  document.getElementById('verifModalId').textContent = idUsulan;
  document.getElementById('verifCatatan').value = '';

  // Reset tombol ke state default sebelum load data
  const btnA = document.getElementById('btnApprove');
  const btnR = document.getElementById('btnReject');
  if (btnA) { btnA.disabled = true; btnA.style.background = ''; btnA.innerHTML = '<span class="material-icons">check_circle</span> Setujui'; }
  if (btnR) { btnR.disabled = true; btnR.style.background = ''; btnR.style.borderColor = ''; btnR.innerHTML = '<span class="material-icons">cancel</span> Tolak'; }

  showModal('verifikasiModal');
  document.getElementById('verifIndikatorBody').innerHTML = `<tr><td colspan="4"><div class="empty-state" style="padding:20px"><p>Memuat...</p></div></td></tr>`;

  try {
    const [detail, inds] = await Promise.all([API.getDetailUsulan(idUsulan), API.getIndikatorUsulan(idUsulan)]);

    document.getElementById('verifDetailGrid').innerHTML = `
      <div class="detail-item"><label>Puskesmas</label><span>${detail.namaPKM}</span></div>
      <div class="detail-item"><label>Periode</label><span>${detail.namaBulan} ${detail.tahun}</span></div>
      <div class="detail-item"><label>Status</label><span>${statusBadge(detail.statusGlobal)}</span></div>
      <div class="detail-item"><label>Dibuat Oleh</label>
        <span>
          <div style="font-weight:600">${detail.namaPembuat || detail.createdBy || '-'}</div>
          <div style="font-size:12px;color:var(--text-light)">${detail.createdBy || ''}</div>
          <div style="font-size:11px;color:var(--text-xlight)">${formatTS(detail.createdAt)}</div>
        </span>
      </div>
      <div class="detail-item"><label>Indeks Beban Kerja</label><span style="font-family:'JetBrains Mono'">${parseFloat(detail.indeksBeban||0).toFixed(2)}</span></div>
      <div class="detail-item"><label>Indeks Kesulitan Wilayah</label><span style="font-family:'JetBrains Mono'">${parseFloat(detail.indeksKesulitan||0).toFixed(2)}</span></div>
      <div class="detail-item"><label>Indeks SPM</label><span style="font-family:'JetBrains Mono';font-size:16px;font-weight:800;color:var(--primary)">${parseFloat(detail.indeksSPM).toFixed(2)}</span></div>
      ${detail.alasanTolak ? `
        <div class="detail-item" style="grid-column:1/-1">
          <label>Alasan Penolakan (${detail.ditolakOleh||'Verifikator'})</label>
          <span style="color:#dc2626;font-style:italic">"${detail.alasanTolak}"</span>
        </div>` : ''}
      ${(detail.verifikasiProgram||[]).some(v=>v.sanggahan) && currentUser.role === 'Admin' ? `
        <div class="detail-item" style="grid-column:1/-1">
          <label>Sanggahan Pengelola Program</label>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${(detail.verifikasiProgram||[]).filter(v=>v.sanggahan).map(v=>`
              <div style="background:#fef9c3;border:1.5px solid #f59e0b;border-radius:8px;padding:8px 12px;font-size:12.5px">
                <span style="font-weight:700;color:#92400e">${v.nama_program||v.email_program}</span>
                <span style="color:#78350f;margin-left:8px;font-style:italic">"${v.sanggahan}"</span>
              </div>`).join('')}
          </div>
        </div>` : ''}
      `;

    // Filter inds for program role
    let displayInds = inds;
    if (currentUser.role === 'Pengelola Program' && currentUser.indikatorAkses.length > 0) {
      displayInds = inds.filter(i => currentUser.indikatorAkses.includes(parseInt(i.no)));
    }

    document.getElementById('verifIndikatorBody').innerHTML = displayInds.map(i => {
      let buktiHtml = '-';
      if (i.linkFile) {
        try {
          const lsParsed = JSON.parse(i.linkFile);
          const arrLinks = Array.isArray(lsParsed)
            ? lsParsed.map(f => typeof f === 'string' ? {id:null,url:f,name:'File'} : f)
            : [{id:null,url:i.linkFile,name:'File'}];
          // Simpan ke window untuk modal preview
          window[`_buktiLinks_${i.no}`] = { links: arrLinks, idUsulan: i.idUsulan || '' };
          buktiHtml = `<button onclick="openBuktiModal(${i.no},0)" style="background:none;border:none;cursor:pointer;color:#0d9488;display:inline-flex;align-items:center;gap:3px;font-size:12px;padding:2px 6px;border-radius:5px" onmouseover="this.style.background='rgba(13,148,136,0.08)'" onmouseout="this.style.background='none'"><span class="material-icons" style="font-size:14px">visibility</span></button>`;
        } catch {
          buktiHtml = `<button onclick="window.open('${i.linkFile}','_blank')" style="background:none;border:none;cursor:pointer;color:#0d9488;padding:2px 6px;border-radius:5px"><span class="material-icons" style="font-size:14px">visibility</span></button>`;
        }
      }
      return `<tr>
        <td>${i.no}</td><td style="font-size:13px">${i.nama}</td>
        <td>${i.target}</td><td>${i.capaian}</td><td style="text-align:center;font-weight:600;color:${i.target>0?(i.capaian/i.target*100)>=100?'#16a34a':'#0d9488':'#64748b'}">${i.target > 0 ? fmtPct(i.capaian/i.target*100) : '-'}</td>
        <td>${buktiHtml}</td>
      </tr>`;
    }).join('');

    // Cek apakah user ini sudah verifikasi (approve ATAU tolak = sudah selesai verifikasi)
    let sudahVerifUser = false;
    if (currentUser.role === 'Kepala Puskesmas') {
      sudahVerifUser = detail.statusKapus === 'Selesai' || detail.statusKapus === 'Ditolak';
    } else if (currentUser.role === 'Pengelola Program') {
      const myRecord = (detail.verifikasiProgram || []).find(v => v.email_program?.toLowerCase() === currentUser.email?.toLowerCase());
      sudahVerifUser = myRecord && (myRecord.status === 'Selesai' || myRecord.status === 'Ditolak');
    } else if (currentUser.role === 'Admin') {
      sudahVerifUser = detail.statusGlobal === 'Selesai';
    }

    // Adjust buttons based on status & sudah verifikasi
    const canApprove = !sudahVerifUser && (
      (currentUser.role === 'Kepala Puskesmas' && detail.statusGlobal === 'Menunggu Kepala Puskesmas') ||
      (currentUser.role === 'Pengelola Program' && (
        detail.statusGlobal === 'Menunggu Pengelola Program' ||
        (detail.statusGlobal === 'Ditolak' && detail.ditolakOleh === 'Admin') // sanggah atau tolak ke operator
      )) ||
      (currentUser.role === 'Admin' && (detail.statusGlobal === 'Menunggu Admin'))
    );

    // Cek tanda tangan — blok verifikasi jika belum ada
    // Prioritas: currentUser (sudah diupdate saat saveEditProfil), fallback allUsers untuk Admin
    const myUserData = allUsers?.find(u => u.email?.toLowerCase() === currentUser.email?.toLowerCase());
    const hasTandaTangan = !!(currentUser.tandaTangan || myUserData?.tandaTangan);
    const needsTandaTangan = ['Kepala Puskesmas', 'Pengelola Program', 'Admin'].includes(currentUser.role);

    const btnApprove = document.getElementById('btnApprove');
    const btnReject = document.getElementById('btnReject');

    // Kunci tombol jika belum ada TT — tidak perlu cek canApprove
    if (needsTandaTangan && !hasTandaTangan) {
      btnApprove.disabled = true;
      btnReject.disabled = true;
      // Tampilkan peringatan hanya jika giliran user ini verifikasi
      if (canApprove) {
        if (!document.getElementById('ttWarning')) {
          const w = document.createElement('div');
          w.id = 'ttWarning';
          w.style.cssText = 'background:#fef3c7;border:1.5px solid #f59e0b;border-radius:10px;padding:12px 14px;font-size:12px;color:#92400e;margin-top:12px';
          w.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-weight:700;font-size:13px">
              <span class="material-icons" style="font-size:17px;color:#f59e0b">warning</span>
              ⚠️ Anda belum mengupload tanda tangan
            </div>
            <div style="margin-bottom:8px">
              Upload melalui menu: <span style="background:#fff8e1;padding:1px 6px;border-radius:4px;font-weight:700">Avatar Profil › Edit Profil & Tanda Tangan</span>
            </div>
            <div style="font-size:11.5px;color:#a16207;line-height:1.7;border-top:1px solid rgba(245,158,11,0.25);padding-top:8px;margin-top:4px">
              <b>Spesifikasi file:</b> PNG / JPG · Latar belakang putih · Resolusi jelas · Tinta hitam/biru tua
            </div>
            <div style="margin-top:8px">
              <a href="#" onclick="event.preventDefault();window._reopenVerifikasiId='${idUsulan}';closeModal('verifikasiModal');setTimeout(()=>openEditProfil(),200)" style="display:inline-flex;align-items:center;gap:5px;background:#f59e0b;color:white;padding:6px 14px;border-radius:7px;font-weight:700;font-size:12px;text-decoration:none">
                <span class="material-icons" style="font-size:14px">upload</span>Upload Sekarang
              </a>
            </div>`;
          document.getElementById('verifCatatan')?.closest('.modal-body')?.appendChild(w);
        }
      }
    } else {
      document.getElementById('ttWarning')?.remove();
      if (sudahVerifUser) {
        btnApprove.style.background = '#16a34a';
        btnApprove.innerHTML = '<span class="material-icons">check_circle</span> Sudah Diverifikasi';
        btnApprove.disabled = true;
        btnReject.disabled = true;
        const btnSanggahDone = document.getElementById('btnSanggah');
        if (btnSanggahDone) btnSanggahDone.style.display = 'none';
      } else {
        btnApprove.disabled = !canApprove;
        btnReject.disabled = !canApprove;

        // Tombol Sanggah/Respond: untuk Pengelola Program saat ada penolakan indikator miliknya
        const btnSanggah = document.getElementById('btnSanggah');
        if (btnSanggah) {
          const myVP = (detail.verifikasiProgram||[]).find(v =>
            v.email_program?.toLowerCase() === currentUser.email?.toLowerCase()
          );
          const myAkses = myVP ? (myVP.indikator_akses||'').toString().split(',').map(x=>parseInt(x.trim())).filter(Boolean) : [];
          const adaPenolakanSaya = (detail.penolakanIndikator||[]).some(pi =>
            pi.aksi === null && myAkses.includes(pi.no_indikator)
          );
          const showSanggah = currentUser.role === 'Pengelola Program' &&
            detail.statusGlobal === 'Ditolak' &&
            detail.ditolakOleh === 'Admin' &&
            adaPenolakanSaya;
          btnSanggah.style.display = showSanggah ? '' : 'none';
          btnSanggah.disabled = false;
          if (showSanggah) btnSanggah.textContent = '';
          if (showSanggah) btnSanggah.innerHTML = '<span class="material-icons">gavel</span> Respon Penolakan';
        }
      }
    } // end else hasTandaTangan
  } catch (e) { toast(e.message, 'error'); }
}

async function doApprove() {
  const catatan = document.getElementById('verifCatatan').value;
  const role = currentUser.role;
  setLoading(true);
  try {
    let result;
    if (role === 'Kepala Puskesmas') result = await API.approveKapus({ idUsulan: verifCurrentUsulan, email: currentUser.email, catatan });
    else if (role === 'Pengelola Program') result = await API.approveProgram({ idUsulan: verifCurrentUsulan, email: currentUser.email, catatan });
    else if (role === 'Admin') result = await API.approveAdmin({ idUsulan: verifCurrentUsulan, email: currentUser.email, catatan });

    toast(result?.message || 'Berhasil disetujui!', 'success');

    // Tombol Setujui jadi hijau dan disabled sebagai indikator visual
    const btnApprove = document.getElementById('btnApprove');
    const btnReject = document.getElementById('btnReject');
    if (btnApprove) {
      btnApprove.style.background = '#16a34a';
      btnApprove.innerHTML = '<span class="material-icons">check_circle</span> Sudah Disetujui';
      btnApprove.disabled = true;
    }
    if (btnReject) btnReject.disabled = true;

    setTimeout(() => {
      closeModal('verifikasiModal');
      renderVerifikasi();
    }, 1000);

  } catch (e) { toast(e.message, 'error'); }
  finally { setLoading(false); }
}

async function doReject() {
  const role = currentUser.role;

  if (role === 'Admin') {
    // Admin: buka modal pilih indikator
    await openAdminTolakModal(verifCurrentUsulan);
    return;
  }

  // Kepala Puskesmas
  const catatan = document.getElementById('verifCatatan').value.trim();
  if (!catatan) return toast('Isi alasan penolakan', 'warning');
  setLoading(true);
  try {
    await API.rejectUsulan({ idUsulan: verifCurrentUsulan, email: currentUser.email, role, alasan: catatan });
    toast('Usulan ditolak', 'warning');
    const btnApprove = document.getElementById('btnApprove');
    const btnReject  = document.getElementById('btnReject');
    if (btnApprove) btnApprove.disabled = true;
    if (btnReject) { btnReject.style.background = '#dc2626'; btnReject.innerHTML = '<span class="material-icons">cancel</span> Ditolak'; btnReject.disabled = true; }
    setTimeout(() => { closeModal('verifikasiModal'); renderVerifikasi(); }, 800);
  } catch (e) { toast(e.message, 'error'); }
  finally { setLoading(false); }
}

async function openAdminTolakModal(idUsulan) {
  const inds = await API.getIndikatorUsulan(idUsulan).catch(() => []);
  if (!inds.length) return toast('Gagal memuat indikator', 'error');

  let modal = document.getElementById('adminTolakModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'adminTolakModal';
    modal.className = 'modal';
    modal.style.zIndex = '4000';
    modal.addEventListener('click', e => { if (e.target === modal) closeModal('adminTolakModal'); });
    document.body.appendChild(modal);
  }

  const rowsHtml = inds.map(i => {
    return `<div style="border:1.5px solid var(--border);border-radius:10px;padding:12px 14px;transition:border-color .15s" id="atRow-${i.no}">
      <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer">
        <input type="checkbox" id="atChk-${i.no}" onchange="toggleAdminTolakRow(${i.no})"
          style="width:16px;height:16px;margin-top:2px;accent-color:#ef4444;flex-shrink:0">
        <span>
          <span style="font-weight:700;font-size:13px">Indikator ${i.no}</span>
          <span style="font-size:12.5px;color:var(--text-light);margin-left:6px">${i.nama||''}</span>
        </span>
      </label>
      <div id="atAlasan-${i.no}" style="display:none;margin-top:10px">
        <textarea class="form-control" id="atText-${i.no}" rows="2"
          placeholder="Alasan penolakan indikator ${i.no}..."
          style="font-size:12.5px;resize:vertical"></textarea>
      </div>
    </div>`;
  }).join('');

  modal.innerHTML = `
    <div class="modal-card" style="max-width:680px;width:100%">
      <div class="modal-header">
        <span class="material-icons" style="color:#ef4444">cancel</span>
        <h3>Tolak Usulan — Pilih Indikator Bermasalah</h3>
        <button class="btn-icon" onclick="closeModal('adminTolakModal')"><span class="material-icons">close</span></button>
      </div>
      <div class="modal-body" style="padding:16px 20px;max-height:60vh;overflow-y:auto">
        <p style="font-size:13px;color:var(--text-light);margin-bottom:14px">Centang indikator yang bermasalah dan isi alasan per indikator.</p>
        <div style="display:flex;flex-direction:column;gap:10px" id="adminTolakList">${rowsHtml}</div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('adminTolakModal')">Batal</button>
        <button class="btn btn-danger" onclick="submitAdminTolak('${idUsulan}')">
          <span class="material-icons">send</span>Kirim Penolakan
        </button>
      </div>
    </div>`;
  showModal('adminTolakModal');
}

function toggleAdminTolakRow(no) {
  const chk = document.getElementById(`atChk-${no}`);
  const row = document.getElementById(`atRow-${no}`);
  const alasan = document.getElementById(`atAlasan-${no}`);
  if (chk.checked) {
    row.style.borderColor = '#ef4444';
    alasan.style.display = 'block';
    document.getElementById(`atText-${no}`)?.focus();
  } else {
    row.style.borderColor = '';
    alasan.style.display = 'none';
  }
}

async function submitAdminTolak(idUsulan) {
  const checkboxes = document.querySelectorAll('#adminTolakList input[type=checkbox]:checked');
  if (!checkboxes.length) return toast('Pilih minimal 1 indikator yang bermasalah', 'warning');

  const indikatorList = [];
  for (const chk of checkboxes) {
    const no = parseInt(chk.id.replace('atChk-', ''));
    const alasan = document.getElementById(`atText-${no}`)?.value.trim();
    if (!alasan) return toast(`Isi alasan untuk indikator ${no}`, 'warning');
    indikatorList.push({ noIndikator: no, alasan });
  }

  setLoading(true);
  try {
    await API.rejectUsulan({ idUsulan, email: currentUser.email, role: 'Admin', alasan: '-', indikatorList });
    toast(`Usulan ditolak — ${indikatorList.length} indikator dikembalikan ke Pengelola Program`, 'warning');
    closeModal('adminTolakModal');
    setTimeout(() => { closeModal('verifikasiModal'); renderVerifikasi(); }, 600);
  } catch (e) { toast(e.message, 'error'); }
  finally { setLoading(false); }
}


async function doSanggah() {
  // Untuk Pengelola Program — buka modal respond per indikator
  await openProgramRespondModal(verifCurrentUsulan);
}

async function openProgramRespondModal(idUsulan) {
  const [detail, inds] = await Promise.all([
    API.getDetailUsulan(idUsulan),
    API.getIndikatorUsulan(idUsulan)
  ]).catch(() => [null, []]);
  if (!detail) return toast('Gagal memuat data', 'error');

  const myVP = (detail.verifikasiProgram||[]).find(v =>
    v.email_program?.toLowerCase() === currentUser.email?.toLowerCase()
  );
  const myAkses = myVP ? (myVP.indikator_akses||'').toString().split(',').map(x=>parseInt(x.trim())).filter(Boolean) : [];
  const penolakanSaya = (detail.penolakanIndikator||[]).filter(pi =>
    pi.aksi === null && myAkses.includes(pi.no_indikator)
  );
  if (!penolakanSaya.length) return toast('Tidak ada indikator yang perlu direspons', 'info');

  let modal = document.getElementById('programRespondModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'programRespondModal';
    modal.className = 'modal';
    modal.style.zIndex = '4000';
    modal.addEventListener('click', e => { if (e.target === modal) closeModal('programRespondModal'); });
    document.body.appendChild(modal);
  }

  const rowsHtml = penolakanSaya.map(pi => {
    const ind = inds.find(i => i.no === pi.no_indikator) || {};
    return `<div style="border:1.5px solid var(--border);border-radius:10px;padding:14px 16px" id="prRow-${pi.no_indikator}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:10px">
        <div>
          <span style="font-weight:700;font-size:13.5px">Indikator ${pi.no_indikator}</span>
          <span style="font-size:12px;color:var(--text-light);margin-left:6px">${ind.nama||''}</span>
        </div>
        <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:6px;padding:4px 10px;font-size:11.5px;color:#dc2626;max-width:250px">
          Admin: "${pi.alasan}"
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <button onclick="setProgramAksi(${pi.no_indikator},'sanggah')" id="prBtnSanggah-${pi.no_indikator}"
          class="btn btn-sm" style="background:#f59e0b;color:white;border:2px solid #f59e0b;flex:1">
          <span class="material-icons" style="font-size:14px">gavel</span> Sanggah (Data Sudah Benar)
        </button>
        <button onclick="setProgramAksi(${pi.no_indikator},'tolak')" id="prBtnTolak-${pi.no_indikator}"
          class="btn btn-sm btn-danger" style="border:2px solid #ef4444;flex:1">
          <span class="material-icons" style="font-size:14px">cancel</span> Tolak (Kembalikan Operator)
        </button>
      </div>
      <textarea class="form-control" id="prText-${pi.no_indikator}" rows="2"
        placeholder="Catatan / alasan..."
        style="font-size:12.5px;resize:vertical"></textarea>
      <input type="hidden" id="prAksi-${pi.no_indikator}" value="">
    </div>`;
  }).join('');

  modal.innerHTML = `
    <div class="modal-card" style="max-width:700px;width:100%">
      <div class="modal-header">
        <span class="material-icons" style="color:#f59e0b">gavel</span>
        <h3>Respon Penolakan Admin — Per Indikator</h3>
        <button class="btn-icon" onclick="closeModal('programRespondModal')"><span class="material-icons">close</span></button>
      </div>
      <div class="modal-body" style="padding:16px 20px;max-height:65vh;overflow-y:auto">
        <div style="background:#fef3c7;border:1.5px solid #f59e0b;border-radius:10px;padding:12px 14px;margin-bottom:16px;font-size:12.5px;color:#92400e">
          <b>Sanggah</b> = data sudah benar, kirim alasan ke Admin. &nbsp;|&nbsp;
          <b>Tolak</b> = akui ada kesalahan, kembalikan ke Operator untuk perbaikan.
        </div>
        <div style="display:flex;flex-direction:column;gap:14px">${rowsHtml}</div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('programRespondModal')">Batal</button>
        <button class="btn btn-primary" onclick="submitProgramRespond('${idUsulan}')">
          <span class="material-icons">send</span>Kirim Respon
        </button>
      </div>
    </div>`;
  showModal('programRespondModal');
}

function setProgramAksi(no, aksi) {
  document.getElementById(`prAksi-${no}`).value = aksi;
  const row = document.getElementById(`prRow-${no}`);
  const btnS = document.getElementById(`prBtnSanggah-${no}`);
  const btnT = document.getElementById(`prBtnTolak-${no}`);
  if (aksi === 'sanggah') {
    row.style.borderColor = '#f59e0b';
    btnS.style.opacity = '1'; btnS.style.fontWeight = '800';
    btnT.style.opacity = '0.4'; btnT.style.fontWeight = '';
  } else {
    row.style.borderColor = '#ef4444';
    btnT.style.opacity = '1'; btnT.style.fontWeight = '800';
    btnS.style.opacity = '0.4'; btnS.style.fontWeight = '';
  }
}

async function submitProgramRespond(idUsulan) {
  const hiddenInputs = document.querySelectorAll('[id^="prAksi-"]');
  const responList = [];
  for (const el of hiddenInputs) {
    const no = parseInt(el.id.replace('prAksi-', ''));
    const aksi = el.value;
    if (!aksi) return toast(`Pilih Sanggah atau Tolak untuk indikator ${no}`, 'warning');
    const catatan = document.getElementById(`prText-${no}`)?.value.trim();
    if (!catatan) return toast(`Isi catatan untuk indikator ${no}`, 'warning');
    responList.push({ noIndikator: no, aksi, catatan });
  }

  setLoading(true);
  try {
    const res = await API.respondPenolakan({ idUsulan, email: currentUser.email, responList });
    toast(res.message || 'Respon tersimpan', 'success');
    closeModal('programRespondModal');
    setTimeout(() => { closeModal('verifikasiModal'); renderVerifikasi(); }, 600);
  } catch (e) { toast(e.message, 'error'); }
  finally { setLoading(false); }
}



// ===== UBAH PASSWORD =====
function showChangePassword() {
  document.getElementById('cpOld').value = '';
  document.getElementById('cpNew').value = '';
  document.getElementById('cpConfirm').value = '';
  document.getElementById('cpStatus').textContent = '';
  showModal('changePasswordModal');
}

function closeChangePasswordModal() {
  closeModal('changePasswordModal');
}

async function doChangePassword() {
  const oldPw = document.getElementById('cpOld').value;
  const newPw = document.getElementById('cpNew').value;
  const confirmPw = document.getElementById('cpConfirm').value;
  const statusEl = document.getElementById('cpStatus');

  if (!newPw || newPw.length < 6) { statusEl.textContent = 'Password baru minimal 6 karakter'; return; }
  if (newPw !== confirmPw) { statusEl.textContent = 'Konfirmasi password tidak cocok'; return; }

  setLoading(true);
  try {
    await API.post('auth', { action: 'change-password', email: currentUser.email, oldPassword: oldPw, newPassword: newPw });
    toast('Password berhasil diubah!', 'success');
    closeChangePasswordModal();
  } catch(e) {
    statusEl.textContent = e.message;
  } finally { setLoading(false); }
}

// ============== LAPORAN ==============
async function renderLaporan() {
  const role = currentUser.role;
  document.getElementById('mainContent').innerHTML = `
    <div class="page-header">
      <h1><span class="material-icons">bar_chart</span>Laporan</h1>
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
            <option value="Menunggu Kepala Puskesmas">Menunggu Kepala Puskesmas</option>
            <option value="Menunggu Pengelola Program">Menunggu Pengelola Program</option>
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
  if (currentUser.role === 'Kepala Puskesmas') params.kode_pkm = currentUser.kodePKM;

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

    const _lpg = _pgState['laporan'] || 1;
    const _lps = PAGINATION_SIZE;
    const _lsliced = result.data.slice((_lpg-1)*_lps, _lpg*_lps);
    document.getElementById('lapTable').innerHTML = `
      <div class="table-container"><table>
        <thead><tr><th>No</th><th>Puskesmas</th><th>Periode</th><th>Tgl Dibuat</th><th>Indeks SPM</th><th>Status</th><th>Aksi</th></tr></thead>
        <tbody>${_lsliced.map(r => `<tr>
          <td>${r.no}</td>
          <td>${r.namaPKM}</td>
          <td>${r.namaBulan} ${r.tahun}</td>
          <td style="font-size:11.5px;color:var(--text-light)">${formatDateTime(r.createdAt)}</td>
          <td class="rasio-cell" style="font-weight:700;color:var(--primary)">${parseFloat(r.indeksSPM||0).toFixed(2)}</td>
          <td>${statusBadge(r.statusGlobal)}</td>
          <td style="white-space:nowrap">
            <button class="btn-icon view" onclick="viewDetail('${r.idUsulan}')" title="Detail"><span class="material-icons">visibility</span></button>
            ${r.statusGlobal === 'Selesai'
              ? `<button class="btn-icon" onclick="downloadLaporanPDF('${r.idUsulan}')" title="Download Laporan" style="background:transparent;border:none;color:#64748b"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v10"/><path d="m8 9 4 4 4-4"/><path d="M4 17c0 2.2 1.8 4 4 4h8c2.2 0 4-1.8 4-4"/></svg></button>`
              : r.statusKapus === 'Selesai'
                ? `<button class="btn-icon" onclick="downloadLaporanSementara('${r.idUsulan}')" title="Download Laporan Sementara" style="background:transparent;border:none;color:#f59e0b"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v10"/><path d="m8 9 4 4 4-4"/><path d="M4 17c0 2.2 1.8 4 4 4h8c2.2 0 4-1.8 4-4"/></svg></button>`
              : ''}
            <button class="btn-icon" onclick="openLogAktivitas('${r.idUsulan}')" title="Riwayat Aktivitas" style="background:transparent;border:none;color:#64748b"><span class="material-icons" style="font-size:18px">history</span></button>
          </td>
        </tr>`).join('')}
        </tbody>
      </table></div><div id="pg-laporan"></div>`;
    renderPagination('pg-laporan', result.data.length, _lpg, _lps, 'pgLaporan');
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

function pgLaporan(p) { _pgState['laporan'] = p; loadLaporan(); }

// ============== ADMIN - USERS ==============
let allUsers = [], allPKMList = [], allIndList = [];

// ─── MASTER DATA (Tab: User | Jabatan | Puskesmas | Indikator) ───────────────
let _masterTab = 'users';
async function renderMasterData(tab = 'users') {
  _masterTab = tab;
  document.getElementById('mainContent').innerHTML = `
    <!-- TAB BAR -->
    <div style="display:flex;align-items:center;gap:0;border-bottom:2px solid var(--border);margin-bottom:20px;overflow-x:auto">
      <div style="display:flex;flex:1;gap:0;overflow-x:auto">
      ${[
        { id:'users',      icon:'group',         label:'Kelola User'      },
        { id:'jabatan',    icon:'badge',          label:'Kelola Jabatan'   },
        { id:'pkm',        icon:'local_hospital', label:'Kelola Puskesmas' },
        { id:'indikator',  icon:'monitor_heart',  label:'Kelola Indikator' },
        { id:'pengaturan', icon:'settings',       label:'Pengaturan'       },
      ].map(t => `
        <button onclick="switchMasterTab('${t.id}')" id="masterTab-${t.id}"
          style="display:inline-flex;align-items:center;gap:6px;padding:10px 20px;border:none;background:none;cursor:pointer;font-size:13.5px;font-weight:600;white-space:nowrap;border-bottom:3px solid ${tab===t.id?'var(--primary)':'transparent'};color:${tab===t.id?'var(--primary)':'var(--text-light)'};margin-bottom:-2px;transition:all .15s">
          <span class="material-icons" style="font-size:17px">${t.icon}</span>${t.label}
        </button>`).join('')}
      </div>
      <div id="masterDataActionBtn" style="flex-shrink:0;padding:0 4px"></div>
    </div>
    <!-- TAB CONTENT -->
    <div id="masterTabContent"></div>
    <!-- MODALS CONTAINER -->
    <div id="masterModals"></div>`;

  await _loadMasterTab(tab);
}

async function switchMasterTab(tab) {
  _masterTab = tab;
  // Update tab style — termasuk 'pengaturan'
  ['users','jabatan','pkm','indikator','pengaturan'].forEach(t => {
    const btn = document.getElementById(`masterTab-${t}`);
    if (!btn) return;
    btn.style.borderBottomColor = t === tab ? 'var(--primary)' : 'transparent';
    btn.style.color = t === tab ? 'var(--primary)' : 'var(--text-light)';
  });
  await _loadMasterTab(tab);
}

async function _loadMasterTab(tab) {
  const content = document.getElementById('masterTabContent');
  const modals  = document.getElementById('masterModals');
  const actionBtn = document.getElementById('masterDataActionBtn');
  if (!content) return;
  content.innerHTML = `<div class="empty-state" style="padding:32px"><p>Memuat...</p></div>`;

  if (tab === 'users') {
    actionBtn.innerHTML = `<button class="btn btn-primary" onclick="openUserModal()"><span class="material-icons">person_add</span>Tambah User</button>`;
    content.innerHTML = `
      <div class="card">
        <div class="card-body" style="padding:12px 16px">
          <div class="search-row">
            <div class="search-input-wrap"><span class="material-icons search-icon">search</span><input class="search-input" id="searchUser" placeholder="Cari email atau nama..." oninput="filterUsers()"></div>
            <select class="form-control" id="filterRole" onchange="filterUsers()" style="width:160px">
              <option value="">Semua Role</option>
              <option>Admin</option><option>Operator</option><option>Kepala Puskesmas</option>
              <option>Pengelola Program</option><option>Kadis</option>
            </select>
          </div>
        </div>
        <div style="padding:0" id="usersTable"></div>
      </div>`;
    modals.innerHTML = `
      <div class="modal fullscreen" id="userModal">
        <div class="modal-card">
          <div class="modal-header">
            <span class="material-icons">person</span>
            <h3 id="userModalTitle">Tambah User</h3>
            <button class="btn-icon" onclick="closeModal('userModal')"><span class="material-icons">close</span></button>
          </div>
          <div class="modal-body" style="padding:24px;background:#f8fafc">
            <div style="height:100%;display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start">
              <div style="display:flex;flex-direction:column;gap:16px">
                <div class="card" style="padding:24px">
                  <div style="font-weight:700;font-size:13px;color:var(--primary);margin-bottom:16px;display:flex;align-items:center;gap:6px">
                    <span class="material-icons" style="font-size:16px">badge</span>Informasi Akun
                  </div>
                  <div class="form-group"><label>Email *</label>
                    <input class="form-control" id="uEmail" type="email" placeholder="user@example.com" oninput="validateEmailInput(this)">
                    <div id="emailValidMsg" style="font-size:11.5px;margin-top:4px;display:none"></div>
                  </div>
                  <div class="form-group"><label>Nama *</label>
                    <input class="form-control" id="uNama" placeholder="Nama Lengkap">
                  </div>
                  <div class="form-group"><label>NIP</label>
                    <input class="form-control" id="uNIP" placeholder="Nomor Induk Pegawai (opsional)" maxlength="30">
                  </div>
                  <div class="form-group"><label>Role *</label>
                    <select class="form-control" id="uRole" onchange="checkUserRole()">
                      <option>Admin</option><option>Operator</option><option>Kepala Puskesmas</option>
                      <option>Pengelola Program</option><option>Kadis</option>
                    </select>
                  </div>
                  <div id="pkmContainer" style="display:none" class="form-group"><label>Puskesmas</label>
                    <select class="form-control" id="uPKM"><option value="">Pilih Puskesmas</option></select>
                  </div>
                  <div class="form-group" style="margin-bottom:0"><label>Status</label>
                    <select class="form-control" id="uAktif">
                      <option value="true">Aktif</option><option value="false">Non-aktif</option>
                    </select>
                  </div>
                </div>
                <div class="card" style="padding:24px">
                  <div style="font-weight:700;font-size:13px;color:var(--primary);margin-bottom:16px;display:flex;align-items:center;gap:6px">
                    <span class="material-icons" style="font-size:16px">draw</span>Tanda Tangan
                  </div>
                  <div id="ttPreviewBox" style="border:2px dashed var(--border);border-radius:8px;padding:12px;background:white;min-height:80px;display:flex;align-items:center;justify-content:center;margin-bottom:12px">
                    <span style="color:var(--text-light);font-size:12px">Belum ada tanda tangan</span>
                  </div>
                  <label style="display:flex;align-items:center;gap:8px;cursor:pointer;background:var(--primary-light);border:1.5px solid var(--border);padding:8px 14px;border-radius:8px;font-size:12px;font-weight:600;color:var(--primary)">
                    <span class="material-icons" style="font-size:16px">upload</span>Upload Tanda Tangan (PNG/JPG)
                    <input type="file" id="ttFileInput" accept="image/png,image/jpeg,image/jpg" style="display:none" onchange="previewTandaTangan(this)">
                  </label>
                  <div style="font-size:11px;color:var(--text-light);margin-top:6px">Format: PNG atau JPG. Gunakan background putih.</div>
                </div>
                <div class="card" id="indContainer" style="padding:24px;display:none">
                  <div style="font-weight:700;font-size:13px;color:var(--primary);margin-bottom:10px;display:flex;align-items:center;justify-content:space-between">
                    <div style="display:flex;align-items:center;gap:6px">
                      <span class="material-icons" style="font-size:16px">monitor_heart</span>Indikator Akses
                    </div>
                    <div style="display:flex;gap:8px">
                      <button type="button" class="btn btn-secondary btn-sm" onclick="checkAllIndikator(true)">Pilih Semua</button>
                      <button type="button" class="btn btn-secondary btn-sm" onclick="checkAllIndikator(false)">Hapus Semua</button>
                    </div>
                  </div>
                  <div id="indCheckboxList" style="border:1.5px solid var(--border);border-radius:8px;padding:10px;background:white;display:grid;grid-template-columns:1fr 1fr;gap:6px"></div>
                </div>
              </div>
              <!-- Kolom kanan: Jabatan/Bidang full height -->
              <div style="display:flex;flex-direction:column;gap:16px">
                <div class="card" id="jabatanContainer" style="padding:24px;display:none">
                  <div style="font-weight:700;font-size:13px;color:var(--primary);margin-bottom:14px;display:flex;align-items:center;gap:6px">
                    <span class="material-icons" style="font-size:16px">work</span>Jabatan / Bidang
                    <span style="font-size:11px;color:var(--text-light);font-weight:400">(bisa pilih lebih dari satu)</span>
                  </div>
                  <div id="jabatanCheckboxList" style="border:1.5px solid var(--border);border-radius:8px;padding:10px;background:white;display:flex;flex-direction:column;gap:6px">
                    <div style="color:var(--text-light);font-size:12px;padding:4px">Memuat daftar jabatan...</div>
                  </div>
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
    try {
      [allUsers, allPKMList, allIndList] = await Promise.all([API.getUsers(), API.getPKM(), API.getIndikator()]);
      renderUsersTable(allUsers);
      const pkmSel = document.getElementById('uPKM');
      allPKMList.forEach(p => pkmSel.innerHTML += `<option value="${p.kode}">${p.nama}</option>`);
    } catch (e) { toast(e.message, 'error'); }

  } else if (tab === 'jabatan') {
    actionBtn.innerHTML = `<button class="btn btn-primary" onclick="openJabatanModal()"><span class="material-icons">add</span>Tambah Jabatan</button>`;
    content.innerHTML = `
      <div class="card">
        <div class="card-body" style="padding:0" id="jabatanTable">
          <div class="empty-state" style="padding:32px"><p>Memuat...</p></div>
        </div>
      </div>`;
    modals.innerHTML = `
      <div class="modal" id="jabatanModal">
        <div class="modal-card" style="max-width:420px">
          <div class="modal-header">
            <span class="material-icons">badge</span>
            <span id="jabatanModalTitle">Tambah Jabatan</span>
            <button class="btn-icon" onclick="closeModal('jabatanModal')"><span class="material-icons">close</span></button>
          </div>
          <div class="modal-body">
            <div class="form-group"><label>Nama Jabatan</label>
              <input class="form-control" id="jNama" placeholder="Contoh: Pengelola Program Gizi Kabupaten"></div>
            <div class="form-group"><label>Status</label>
              <select class="form-control" id="jAktif"><option value="true">Aktif</option><option value="false">Non-aktif</option></select></div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="closeModal('jabatanModal')">Batal</button>
            <button class="btn btn-primary" onclick="saveJabatan()"><span class="material-icons">save</span>Simpan</button>
          </div>
        </div>
      </div>`;
    await loadJabatanTable();

  } else if (tab === 'pkm') {
    actionBtn.innerHTML = `<button class="btn btn-primary" onclick="openPKMModal()"><span class="material-icons">add</span>Tambah Puskesmas</button>`;
    content.innerHTML = `
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
      </div>`;
    modals.innerHTML = `
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

  } else if (tab === 'indikator') {
    actionBtn.innerHTML = `<button class="btn btn-primary" onclick="openIndModal()"><span class="material-icons">add</span>Tambah Indikator</button>`;
    content.innerHTML = `
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
      </div>`;
    modals.innerHTML = `
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
    } catch (e) { toast(e.message, 'error'); }

  } else if (tab === 'pengaturan') {
    actionBtn.innerHTML = '';
    content.innerHTML = `<div class="empty-state" style="padding:32px"><p>Memuat pengaturan...</p></div>`;
    modals.innerHTML = '';
    try {
      const [s, pejabatList] = await Promise.all([API.getSettings(), API.getPejabat()]);
      const tahunAwal  = s?.tahun_awal  || new Date().getFullYear();
      const tahunAkhir = s?.tahun_akhir || new Date().getFullYear() + 2;

      const defaultPejabat = [
        { jabatan: 'Kepala Dinas', placeholder: 'Kepala Dinas Kesehatan' },
        { jabatan: 'Kepala Sub Bagian Perencanaan', placeholder: 'Kepala Sub Bagian Perencanaan' },
      ];

      function pejabatCard(def) {
        const p = pejabatList.find(x => x.jabatan === def.jabatan) || {};
        const jabatanKey = def.jabatan.replace(/\s/g,'_');
        const ttValid = p.tanda_tangan && (p.tanda_tangan.startsWith('data:image') || p.tanda_tangan.startsWith('http'));
        const ttHtml = ttValid
          ? `<div style="position:relative;display:inline-block">
              <img src="${p.tanda_tangan}" style="max-height:70px;max-width:160px;object-fit:contain"
                onerror="this.closest('div').outerHTML='<span style=\\'color:#ef4444;font-size:12px\\'>⚠ Gambar tidak valid — hapus dan upload ulang</span>'">
              <button onclick="hapusPejabatTT('${jabatanKey}')" title="Hapus" style="position:absolute;top:-6px;right:-6px;background:#ef4444;border:none;border-radius:50%;width:20px;height:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0">
                <span class="material-icons" style="font-size:13px;color:white">close</span>
              </button>
            </div>`
          : `<span style="color:var(--text-light);font-size:12px">Belum ada tanda tangan</span>`;
        return `<div class="card" style="padding:20px;margin-bottom:16px">
          <div style="font-weight:700;font-size:13px;color:var(--primary);margin-bottom:14px;display:flex;align-items:center;gap:6px">
            <span class="material-icons" style="font-size:16px">badge</span>${def.jabatan}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
            <div class="form-group" style="margin:0">
              <label>Nama *</label>
              <input class="form-control" id="pj_nama_${jabatanKey}" placeholder="${def.placeholder}" value="${p.nama||''}">
            </div>
            <div class="form-group" style="margin:0">
              <label>NIP</label>
              <input class="form-control" id="pj_nip_${jabatanKey}" placeholder="Nomor Induk Pegawai" value="${p.nip||''}">
            </div>
          </div>
          <div style="margin-bottom:10px">
            <label style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:6px;display:block">Tanda Tangan</label>
            <div id="pj_tt_box_${jabatanKey}" style="border:2px dashed var(--border);border-radius:8px;padding:10px;background:white;min-height:60px;display:flex;align-items:center;justify-content:center;margin-bottom:8px">${ttHtml}</div>
            <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;background:var(--primary-light);border:1.5px solid var(--border);padding:6px 12px;border-radius:8px;font-size:12px;font-weight:600;color:var(--primary)">
              <span class="material-icons" style="font-size:14px">upload</span>Upload PNG/JPG
              <input type="file" accept="image/png,image/jpeg" style="display:none" onchange="previewPejabatTT(this,'${jabatanKey}')">
            </label>
          </div>
          <button class="btn btn-primary btn-sm" onclick="savePejabat('${def.jabatan}')">
            <span class="material-icons">save</span>Simpan
          </button>
        </div>`;
      }

      content.innerHTML = `
        <div class="page-header">
          <h1><span class="material-icons">settings</span>Pengaturan</h1>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start">
          <div>
            <div class="card" style="padding:24px;margin-bottom:16px">
              <div style="font-weight:700;font-size:15px;margin-bottom:4px;display:flex;align-items:center;gap:8px">
                <span class="material-icons" style="color:var(--primary)">calendar_today</span>Range Tahun
              </div>
              <div style="font-size:13px;color:var(--text-light);margin-bottom:20px">Mengatur rentang tahun yang tampil pada semua dropdown tahun di seluruh aplikasi.</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
                <div class="form-group" style="margin:0">
                  <label>Tahun Awal</label>
                  <input class="form-control" id="setTahunAwal" type="number" min="2020" max="2100" value="${tahunAwal}">
                </div>
                <div class="form-group" style="margin:0">
                  <label>Tahun Akhir</label>
                  <input class="form-control" id="setTahunAkhir" type="number" min="2020" max="2100" value="${tahunAkhir}">
                </div>
              </div>
              <button class="btn btn-primary" onclick="savePengaturanTahun()">
                <span class="material-icons">save</span>Simpan Pengaturan
              </button>
            </div>
          </div>
          <div>
            <div style="font-weight:700;font-size:14px;margin-bottom:12px;display:flex;align-items:center;gap:6px">
              <span class="material-icons" style="color:var(--primary)">draw</span>Pejabat Penandatangan Laporan
            </div>
            ${defaultPejabat.map(pejabatCard).join('')}
          </div>
        </div>`;

      // Simpan base64 tanda tangan sementara per jabatan
      window._pjTT = {};
    } catch(e) { toast('Gagal memuat pengaturan: ' + e.message, 'error'); }
  }
}

async function renderUsers() { await renderMasterData('users'); }
async function renderJabatan() { await renderMasterData('jabatan'); }
async function renderPKM() { await renderMasterData('pkm'); }
async function renderIndikator() { await renderMasterData('indikator'); }

function previewPejabatTT(input, jabatanKey) {
  const file = input.files[0];
  if (!file) return;
  if (!['image/png','image/jpeg'].includes(file.type)) return toast('Format harus PNG atau JPG', 'error');
  if (file.size > 2 * 1024 * 1024) return toast('Ukuran maksimal 2MB', 'error');
  const reader = new FileReader();
  reader.onload = (e) => {
    if (!window._pjTT) window._pjTT = {};
    window._pjTT[jabatanKey] = e.target.result;
    const box = document.getElementById(`pj_tt_box_${jabatanKey}`);
    if (box) box.innerHTML = `<div style="position:relative;display:inline-block">
      <img src="${e.target.result}" style="max-height:70px;max-width:160px;object-fit:contain">
      <button onclick="hapusPejabatTT('${jabatanKey}')" title="Hapus" style="position:absolute;top:-6px;right:-6px;background:#ef4444;border:none;border-radius:50%;width:20px;height:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0">
        <span class="material-icons" style="font-size:13px;color:white">close</span>
      </button>
    </div>`;
  };
  reader.readAsDataURL(file);
}

function hapusPejabatTT(jabatanKey) {
  if (!window._pjTT) window._pjTT = {};
  window._pjTT[jabatanKey] = ''; // string kosong = hapus
  const box = document.getElementById(`pj_tt_box_${jabatanKey}`);
  if (box) box.innerHTML = `<span style="color:var(--text-light);font-size:12px">Belum ada tanda tangan</span>`;
}

async function savePejabat(jabatan) {
  const key = jabatan.replace(/\s/g, '_');
  const nama = document.getElementById(`pj_nama_${key}`)?.value.trim();
  const nip  = document.getElementById(`pj_nip_${key}`)?.value.trim();
  // Gunakan undefined check — '' berarti hapus, undefined berarti tidak diubah
  const ttState = window._pjTT?.[key];
  if (!nama) return toast('Nama wajib diisi', 'warning');
  setLoading(true);
  try {
    const existing = await API.getPejabat();
    const old = existing.find(x => x.jabatan === jabatan);
    let tandaTangan;
    if (ttState === '') {
      tandaTangan = null; // hapus
    } else if (ttState) {
      tandaTangan = ttState; // baru diupload
    } else {
      tandaTangan = old?.tanda_tangan || null; // tidak diubah, pakai lama
    }
    await API.savePejabat({ jabatan, nama, nip, tandaTangan });
    // Reset state setelah simpan
    if (window._pjTT) delete window._pjTT[key];
    toast(`${jabatan} berhasil disimpan`, 'success');
    // Reload tampilan agar tombol hapus hilang jika TT dihapus
    if (tandaTangan === null) {
      const box = document.getElementById(`pj_tt_box_${key}`);
      if (box) box.innerHTML = `<span style="color:var(--text-light);font-size:12px">Belum ada tanda tangan</span>`;
    }
  } catch(e) { toast(e.message, 'error'); }
  finally { setLoading(false); }
}

async function savePengaturanTahun() {
  const awal  = parseInt(document.getElementById('setTahunAwal')?.value);
  const akhir = parseInt(document.getElementById('setTahunAkhir')?.value);
  if (!awal || !akhir || awal > akhir) return toast('Range tahun tidak valid', 'warning');
  try {
    await API.saveSettings({ tahun_awal: awal, tahun_akhir: akhir });
    window._minPeriodeTahun = awal;
    window._maxPeriodeTahun = akhir;
    toast(`Range tahun berhasil disimpan: ${awal} – ${akhir}`, 'success');
  } catch(e) { toast('Gagal menyimpan: ' + e.message, 'error'); }
}

// ─────────────────────────────────────────────────────────────────────────────
async function _renderUsers_LEGACY() {
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
            <option>Admin</option><option>Operator</option><option>Kepala Puskesmas</option>
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
              <option>Admin</option><option>Operator</option><option>Kepala Puskesmas</option>
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
          <div class="form-group">
            <label style="display:flex;align-items:center;gap:6px"><span class="material-icons" style="font-size:15px">draw</span>Tanda Tangan</label>
            <div id="ttPreviewBox" style="border:2px dashed var(--border);border-radius:8px;padding:10px;background:white;min-height:70px;display:flex;align-items:center;justify-content:center;margin-bottom:8px">
              <span style="color:var(--text-light);font-size:12px">Belum ada tanda tangan</span>
            </div>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;background:var(--primary-light);border:1.5px solid var(--border);padding:7px 12px;border-radius:8px;font-size:12px;font-weight:600;color:var(--primary)">
              <span class="material-icons" style="font-size:15px">upload</span>Upload Tanda Tangan (PNG/JPG)
              <input type="file" id="ttFileInput" accept="image/png,image/jpeg,image/jpg" style="display:none" onchange="previewTandaTangan(this)">
            </label>
            <div style="font-size:11px;color:var(--text-light);margin-top:4px">Format: PNG atau JPG. Gunakan background putih.</div>
          </div>
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
  const filteredUsers = users.filter(u => u.role !== 'Super Admin' && u.email !== 'f74262944@gmail.com');
  const page = _pgState['users'] || 1;
  const ps = PAGINATION_SIZE;
  const sliced = filteredUsers.slice((page-1)*ps, page*ps);

  el.innerHTML = `<div class="table-container"><table>
    <thead><tr><th>Email</th><th>Nama</th><th>NIP</th><th>Role</th><th>Puskesmas</th><th>Jabatan/Indikator</th><th>Status</th><th>Aksi</th></tr></thead>
    <tbody>${sliced.map(u => `<tr>
      <td style="font-family:'JetBrains Mono';font-size:12px">${u.email}</td>
      <td>${u.nama}</td>
      <td style="font-family:'JetBrains Mono';font-size:11px;color:var(--text-light)">${u.nip || '-'}</td>
      <td><span class="badge badge-info">${u.role}</span></td>
      <td>${u.namaPKM || u.kodePKM || '-'}</td>
      <td style="font-size:12px">${u.jabatan ? u.jabatan.split('|').map(j=>`<div style="font-weight:600;color:var(--primary);font-size:11px;white-space:nowrap">${j.trim()}</div>`).join('') : ''}<div style="color:var(--text-light);font-size:11px">${u.indikatorAkses || ''}</div></td>
      <td>${u.aktif ? '<span class="badge badge-success">Aktif</span>' : '<span class="badge badge-default">Non-aktif</span>'}</td>
      <td style="display:flex;gap:4px">
        <button class="btn-icon edit" onclick="editUser('${u.email}')"><span class="material-icons">edit</span></button>
        <button class="btn-icon" title="Reset Password" style="color:#0d9488" onclick="resetUserPassword('${u.email}','${u.nama}')"><span class="material-icons">lock_reset</span></button>
        <button class="btn-icon del" onclick="deleteUser('${u.email}')"><span class="material-icons">delete</span></button>
      </td>
    </tr>`).join('')}</tbody>
  </table></div><div id="pg-users"></div>`;
  renderPagination('pg-users', filteredUsers.length, page, ps, 'pgUsers');
}
function pgUsers(p) { _pgState['users'] = p; renderUsersTable(allUsers); }

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
  document.getElementById('pkmContainer').style.display = ['Operator','Kepala Puskesmas'].includes(role) ? 'block' : 'none';
  const isProgram = role === 'Pengelola Program';
  document.getElementById('jabatanContainer').style.display = isProgram ? 'block' : 'none';
  document.getElementById('indContainer').style.display = isProgram ? 'block' : 'none';
  if (isProgram) { populateIndCheckbox([]); loadJabatanDropdown([]); }

  // Switch modal style: fullscreen untuk Pengelola Program, center untuk role lain
  const modal = document.getElementById('userModal');
  if (modal) {
    const grid = modal.querySelector('.modal-body > div');
    if (isProgram) {
      modal.classList.add('fullscreen');
      const card = modal.querySelector('.modal-card');
      if (card) card.style.maxWidth = '';
      if (grid) grid.style.gridTemplateColumns = '1fr 1fr';
    } else {
      modal.classList.remove('fullscreen');
      const card = modal.querySelector('.modal-card');
      if (card) card.style.maxWidth = '680px';
      if (grid) grid.style.gridTemplateColumns = '1fr';
    }
  }
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
  // Reset modal ke center mode dulu sebelum checkUserRole
  const _modal = document.getElementById('userModal');
  if (_modal) { _modal.classList.remove('fullscreen'); const _card = _modal.querySelector('.modal-card'); if (_card) _card.style.maxWidth = '680px'; }
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

  // Reset tanda tangan
  _ttBase64 = null;
  const ttBox = document.getElementById('ttPreviewBox');
  if (ttBox) ttBox.innerHTML = `<span style="color:var(--text-light);font-size:12px">Belum ada tanda tangan</span>`;
  const ttInput = document.getElementById('ttFileInput');
  if (ttInput) ttInput.value = '';

  if (editEmail) {
    const user = allUsers.find(u => u.email === editEmail);
    if (user) {
      document.getElementById('uEmail').value = user.email;
      document.getElementById('uNama').value = user.nama;
      document.getElementById('uRole').value = user.role;
      document.getElementById('uPKM').value = user.kodePKM || '';
      document.getElementById('uAktif').value = user.aktif ? 'true' : 'false';
      checkUserRole();
      const nipEl = document.getElementById('uNIP');
      if (nipEl) nipEl.value = user.nip || '';
      if (user.role === 'Pengelola Program') {
        populateIndCheckbox(parseIndikatorAksesString(user.indikatorAkses || ''));
        const savedJabatan = (user.jabatan || '').split('|').map(s=>s.trim()).filter(Boolean);
        loadJabatanDropdown(savedJabatan);
      }
      // Load tanda tangan yang sudah ada
      if (user.tandaTangan && ttBox) {
        _ttBase64 = user.tandaTangan;
        ttBox.innerHTML = `<div style="position:relative;display:inline-block">
          <img src="${user.tandaTangan}" style="max-height:80px;max-width:100%;object-fit:contain">
          <button onclick="hapusTandaTangan()" title="Hapus Tanda Tangan" style="position:absolute;top:-6px;right:-6px;background:#ef4444;border:none;border-radius:50%;width:20px;height:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0">
            <span class="material-icons" style="font-size:13px;color:white">close</span>
          </button>
        </div>`;
      }
    }
    document.getElementById('userModal').dataset.editEmail = editEmail;
  } else {
    delete document.getElementById('userModal').dataset.editEmail;
  }

  showModal('userModal');
}

function hapusTandaTangan() {
  _ttBase64 = null;
  const box = document.getElementById('ttPreviewBox');
  if (box) box.innerHTML = `<span style="color:var(--text-light);font-size:12px">Belum ada tanda tangan</span>`;
  const input = document.getElementById('ttFileInput');
  if (input) input.value = '';
}

// Tanda tangan — preview saat file dipilih
let _ttBase64 = null; // simpan base64 tanda tangan yang dipilih

function previewTandaTangan(input) {
  const file = input.files[0];
  if (!file) return;
  if (!['image/png','image/jpeg'].includes(file.type)) return toast('Format harus PNG atau JPG', 'error');
  if (file.size > 2 * 1024 * 1024) return toast('Ukuran maksimal 2MB', 'error');
  const reader = new FileReader();
  reader.onload = (e) => {
    _ttBase64 = e.target.result;
    const box = document.getElementById('ttPreviewBox');
    if (box) box.innerHTML = `<div style="position:relative;display:inline-block">
      <img src="${_ttBase64}" style="max-height:80px;max-width:100%;object-fit:contain">
      <button onclick="hapusTandaTangan()" title="Hapus" style="position:absolute;top:-6px;right:-6px;background:#ef4444;border:none;border-radius:50%;width:20px;height:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0">
        <span class="material-icons" style="font-size:13px;color:white">close</span>
      </button>
    </div>`;
  };
  reader.readAsDataURL(file);
}

function editUser(email) { openUserModal(email); }

// ============== EDIT PROFIL (SELF) ==============
function openEditProfil() {
  if (!currentUser) return;

  let modal = document.getElementById('editProfilModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'editProfilModal';
    modal.className = 'modal';
    modal.addEventListener('click', e => { if (e.target === modal) closeModal('editProfilModal'); });
    document.body.appendChild(modal);
  }

  const ttSrc = currentUser.tandaTangan || '';
  const ttHtml = ttSrc
    ? `<div style="position:relative;display:inline-block">
        <img src="${ttSrc}" style="max-height:80px;max-width:100%;object-fit:contain"
          onerror="this.closest('div').outerHTML='<span style=\\'color:#ef4444;font-size:12px\\'>⚠ Gambar tidak valid</span>'">
        <button onclick="hapusTandaTanganProfil()" title="Hapus" style="position:absolute;top:-6px;right:-6px;background:#ef4444;border:none;border-radius:50%;width:20px;height:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0">
          <span class="material-icons" style="font-size:13px;color:white">close</span>
        </button>
      </div>`
    : `<span style="color:var(--text-light);font-size:12px">Belum ada tanda tangan</span>`;

  modal.innerHTML = `
    <div class="modal-card" style="max-width:460px">
      <div class="modal-header">
        <span class="material-icons" style="color:var(--primary)">account_circle</span>
        <h3>Edit Profil</h3>
        <button class="btn-icon" onclick="closeModal('editProfilModal')"><span class="material-icons">close</span></button>
      </div>
      <div class="modal-body" style="padding:20px;display:flex;flex-direction:column;gap:14px">
        <div style="background:var(--primary-light);border-radius:10px;padding:12px 14px;display:flex;align-items:center;gap:10px">
          <div style="width:36px;height:36px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;font-weight:700;color:white;font-size:15px;flex-shrink:0">${(currentUser.nama||'?')[0].toUpperCase()}</div>
          <div>
            <div style="font-weight:700;font-size:13px;color:var(--text)">${currentUser.email}</div>
            <div style="font-size:11.5px;color:var(--text-light)">${currentUser.role}${currentUser.namaPKM ? ' — ' + currentUser.namaPKM : ''}</div>
          </div>
        </div>
        <div class="form-group" style="margin:0">
          <label>Nama Lengkap *</label>
          <input class="form-control" id="epNama" value="${currentUser.nama||''}" placeholder="Nama lengkap">
        </div>
        <div class="form-group" style="margin:0">
          <label>NIP</label>
          <input class="form-control" id="epNIP" value="${currentUser.nip||''}" placeholder="Nomor Induk Pegawai">
        </div>
        <div class="form-group" style="margin:0">
          <label style="margin-bottom:8px;display:block">Tanda Tangan</label>
          <div id="epTTBox" style="border:2px dashed var(--border);border-radius:8px;padding:12px;background:#f8fafc;min-height:70px;display:flex;align-items:center;justify-content:center;margin-bottom:8px">${ttHtml}</div>
          <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;background:var(--primary-light);border:1.5px solid var(--border);padding:6px 12px;border-radius:8px;font-size:12px;font-weight:600;color:var(--primary)">
            <span class="material-icons" style="font-size:14px">upload</span>Upload PNG/JPG
            <input type="file" accept="image/png,image/jpeg,image/jpg" style="display:none" onchange="previewTTprofil(this)">
          </label>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('editProfilModal')">Batal</button>
        <button class="btn btn-primary" onclick="saveEditProfil()">
          <span class="material-icons">save</span>Simpan
        </button>
      </div>
    </div>`;

  window._epTT = ttSrc; // simpan state tanda tangan
  showModal('editProfilModal');
}

function previewTTprofil(input) {
  if (!input.files[0]) return;
  const reader = new FileReader();
  reader.onload = e => {
    window._epTT = e.target.result;
    const box = document.getElementById('epTTBox');
    if (box) box.innerHTML = `<div style="position:relative;display:inline-block">
      <img src="${window._epTT}" style="max-height:80px;max-width:100%;object-fit:contain">
      <button onclick="hapusTandaTanganProfil()" title="Hapus" style="position:absolute;top:-6px;right:-6px;background:#ef4444;border:none;border-radius:50%;width:20px;height:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0">
        <span class="material-icons" style="font-size:13px;color:white">close</span>
      </button>
    </div>`;
  };
  reader.readAsDataURL(input.files[0]);
}

function hapusTandaTanganProfil() {
  window._epTT = null;
  const box = document.getElementById('epTTBox');
  if (box) box.innerHTML = `<span style="color:var(--text-light);font-size:12px">Belum ada tanda tangan</span>`;
}

async function saveEditProfil() {
  const nama = document.getElementById('epNama')?.value.trim();
  const nip  = document.getElementById('epNIP')?.value.trim() || '';
  if (!nama) return toast('Nama tidak boleh kosong', 'error');

  setLoading(true);
  try {
    const tt = window._epTT; // null = hapus, undefined/string = pertahankan/baru
    await API.updateUser({
      email: currentUser.email,
      nama, nip,
      role: currentUser.role,
      kodePKM: currentUser.kodePKM || '',
      indikatorAkses: currentUser.indikatorAksesString || '',
      jabatan: currentUser.jabatan || '',
      aktif: true,
      tandaTangan: tt === null ? '' : (tt || undefined),
    });
    // Update currentUser lokal
    currentUser.nama = nama;
    currentUser.nip  = nip;
    if (tt !== undefined) currentUser.tandaTangan = tt || '';
    localStorage.setItem('spm_user', JSON.stringify(currentUser));
    // Refresh sidebar & topbar
    document.getElementById('sidebarName').textContent = nama;
    document.getElementById('sidebarAvatar').textContent = nama[0].toUpperCase();
    const tAvatar = document.getElementById('topbarAvatar');
    if (tAvatar) tAvatar.textContent = nama[0].toUpperCase();
    const tName = document.getElementById('topbarDropName');
    if (tName) tName.textContent = nama;
    closeModal('editProfilModal');
    toast('Profil berhasil disimpan ✓', 'success');
    // Jika sebelumnya dari modal verifikasi, buka kembali agar tombol verifikasi aktif
    if (window._reopenVerifikasiId) {
      const idToReopen = window._reopenVerifikasiId;
      delete window._reopenVerifikasiId;
      setTimeout(() => openVerifikasiModal(idToReopen), 300);
    }
  } catch(e) { toast(e.message, 'error'); }
  finally { setLoading(false); }
}

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
      await API.updateUser({ email, nama, nip, role, kodePKM, indikatorAkses, jabatan, aktif, tandaTangan: _ttBase64 || undefined });
    } else {
      await API.saveUser({ email, nama, nip, role, kodePKM, indikatorAkses, jabatan });
    }
    if (editEmail && editEmail === currentUser.email) {
      // Update currentUser jika edit diri sendiri
      currentUser.nama = document.getElementById('uNama').value.trim();
      currentUser.nip  = document.getElementById('uNIP')?.value.trim() || '';
      if (_ttBase64 !== null && _ttBase64 !== undefined) currentUser.tandaTangan = _ttBase64 || '';
      localStorage.setItem('spm_user', JSON.stringify(currentUser));
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
        filterUsers(); // re-apply filter yang aktif, bukan render semua
      } catch (e) { toast(e.message, 'error'); }
    }
  });
}



// ============== KELOLA JABATAN ==============
let _jabatanAllList = [];

async function _renderJabatan_LEGACY() {
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

    const _jpg = _pgState['jabatan'] || 1;
    const _jps = PAGINATION_SIZE;
    const _jsliced = _jabatanAllList.slice((_jpg-1)*_jps, _jpg*_jps);
    el.innerHTML = `<div class="table-container"><table>
      <thead><tr><th>No</th><th>Nama Jabatan</th><th>Status</th><th>Aksi</th></tr></thead>
      <tbody>${_jsliced.map((j, i) => `<tr>
        <td>${(_jpg-1)*_jps + i + 1}</td>
        <td style="font-weight:500">${j.nama}</td>
        <td>${j.aktif
          ? '<span style="background:#d1fae5;color:#065f46;padding:2px 10px;border-radius:20px;font-size:12px;font-weight:600">Aktif</span>'
          : '<span style="background:#f1f5f9;color:#94a3b8;padding:2px 10px;border-radius:20px;font-size:12px;font-weight:600">Non-aktif</span>'}</td>
        <td>
          <button class="btn-icon edit" onclick="openJabatanModal(${j.id})" title="Edit"><span class="material-icons">edit</span></button>
          <button class="btn-icon del" onclick="deleteJabatan(${j.id}, '${j.nama.replace(/'/g, "\'")}')"><span class="material-icons">delete</span></button>
        </td>
      </tr>`).join('')}
      </tbody>
    </table></div><div id="pg-jabatan"></div>`;
    renderPagination('pg-jabatan', _jabatanAllList.length, _jpg, _jps, 'pgJabatan');
  } catch(e) { toast(e.message, 'error'); }
}
function pgJabatan(p) { _pgState['jabatan'] = p; renderMasterData('jabatan'); }

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
    let data = {};
    try { data = await res.json(); } catch(_) {}
    if (!res.ok || !data.success) {
      toast(data.message || 'Nama jabatan sudah ada atau terjadi kesalahan', 'error');
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

async function _renderPKM_LEGACY() {
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
  const page = _pgState['pkm'] || 1;
  const ps = PAGINATION_SIZE;
  const sliced = pkm.slice((page-1)*ps, page*ps);
  el.innerHTML = `<div class="table-container"><table>
    <thead><tr><th>Kode</th><th>Nama Puskesmas</th><th>Indeks Beban Kerja</th><th>Indeks Kesulitan Wilayah</th><th>Status</th><th>Aksi</th></tr></thead>
    <tbody>${sliced.map(p => `<tr>
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
  </table></div><div id="pg-pkm"></div>`;
  renderPagination('pg-pkm', pkm.length, page, ps, 'pgPKM');
}
function pgPKM(p) { _pgState['pkm'] = p; renderPKMTable(allPKM); }

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

async function renderTargetTahunan() {
  const tahunOpts = yearOptions(CURRENT_YEAR);
  document.getElementById('mainContent').innerHTML = `
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
  el.innerHTML = `<div class="empty-state" style="padding:32px"><p>Memuat...</p></div>`;
  try {
    const res = await fetch(`/api/target-tahunan?kode_pkm=${kode}&tahun=${tahun}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    _ttIndikator = data.data;

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
            <thead><tr><th style="width:40px">No</th><th>Nama Indikator</th><th style="width:160px;text-align:center">Jumlah Sasaran (Tahun)</th></tr></thead>
            <tbody>
              ${_ttIndikator.map(ind => `<tr>
                <td><span style="font-family:'JetBrains Mono';font-weight:700">${ind.noIndikator}</span></td>
                <td style="font-size:13px">${ind.namaIndikator}</td>
                <td style="text-align:center">
                  <input type="number" min="0"
                    class="form-control" id="tt-${ind.noIndikator}"
                    value="${ind.sasaran || ''}"
                    placeholder="0"
                    style="width:120px;text-align:center;margin:0 auto;font-family:'JetBrains Mono'">
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
    const res = await fetch('/api/target-tahunan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kodePKM: _ttCurrentKode, tahun: parseInt(_ttCurrentTahun), targets })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    toast(`Target tahun ${_ttCurrentTahun} berhasil disimpan ✓`, 'success');
    await loadTargetTahunan();
  } catch(e) { toast(e.message, 'error'); }
  finally { setLoading(false); }
}

// ============== ADMIN - INDIKATOR ==============
let allIndikator = [];

async function _renderIndikator_LEGACY() {
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
  const page = _pgState['ind'] || 1;
  const ps = PAGINATION_SIZE;
  const sliced = inds.slice((page-1)*ps, page*ps);
  el.innerHTML = `<div class="table-container"><table>
    <thead><tr><th>No</th><th>Nama Indikator</th><th>Bobot</th><th>Status</th><th>Aksi</th></tr></thead>
    <tbody>${sliced.map(i => `<tr>
      <td><span style="font-family:'JetBrains Mono';font-weight:700">${i.no}</span></td>
      <td>${i.nama}</td>
      <td style="text-align:center"><span style="font-family:'JetBrains Mono'">${i.bobot}</span></td>
      <td>${i.aktif ? '<span class="badge badge-success">Aktif</span>' : '<span class="badge badge-default">Non-aktif</span>'}</td>
      <td style="display:flex;gap:4px">
        <button class="btn-icon edit" onclick="editInd(${i.no})"><span class="material-icons">edit</span></button>
        <button class="btn-icon del" onclick="deleteInd(${i.no})"><span class="material-icons">delete</span></button>
      </td>
    </tr>`).join('')}</tbody>
  </table></div><div id="pg-ind"></div>`;
  renderPagination('pg-ind', inds.length, page, ps, 'pgInd');
}
function pgInd(p) { _pgState['ind'] = p; renderIndTable(allIndikator); }

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
          ${yearOptions(currentTahun, window._maxPeriodeTahun || CURRENT_YEAR + 10)}
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
            <div class="form-group"><label>Tahun</label><select class="form-control" id="pTahun">${yearOptions(currentTahun, window._maxPeriodeTahun || CURRENT_YEAR + 10)}</select></div>
            <div class="form-group"><label>Bulan</label><select class="form-control" id="pBulan">${bulanOptions(CURRENT_BULAN)}</select></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Tanggal Mulai</label><input type="date" class="form-control" id="pMulai"></div>
            <div class="form-group"><label>Jam Mulai</label><input type="time" class="form-control" id="pJamMulai" value="08:00"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Tanggal Selesai</label><input type="date" class="form-control" id="pSelesai"></div>
            <div class="form-group"><label>Jam Selesai</label><input type="time" class="form-control" id="pJamSelesai" value="17:00"></div>
          </div>
          <div class="form-group"><label>Notifikasi untuk Operator</label>
            <textarea class="form-control" id="pNotif" rows="2" placeholder="Contoh: Input data SPM bulan Maret dibuka hingga 28 Maret 2026 pukul 17.00 WITA"></textarea>
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
      const isTidakAktif = p.status === 'Tidak Aktif';
      const borderColor = isActive ? 'var(--success)' : isTidakAktif ? '#e2e8f0' : 'var(--primary)';
      const bg = isActive ? 'var(--success-light)' : isTidakAktif ? '#f8fafc' : 'var(--surface)';
      const badgeHtml = isActive
        ? '<span class="badge badge-success">Aktif Hari Ini</span>'
        : isTidakAktif
          ? '<span class="badge badge-default" style="color:#94a3b8">Tidak Aktif</span>'
          : '<span class="badge badge-info">Aktif</span>';
      return `<div style="border:2px solid ${borderColor};border-radius:12px;padding:16px;background:${bg};opacity:${isTidakAktif?'0.65':'1'}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="font-weight:700;font-size:15px;cursor:pointer" onclick="editPeriode(${p.tahun},${p.bulan})">${p.namaBulan} ${p.tahun}</span>
          <div style="display:flex;align-items:center;gap:6px">
            ${badgeHtml}
            <button onclick="hapusPeriode(${p.tahun},${p.bulan},'${p.namaBulan}')" title="Hapus" style="background:none;border:none;cursor:pointer;padding:2px 4px;border-radius:5px;display:flex;align-items:center;color:#ef4444" onmouseover="this.style.background='rgba(239,68,68,0.08)'" onmouseout="this.style.background='none'"><span class="material-icons" style="font-size:16px">delete</span></button>
          </div>
        </div>
        <div style="font-size:12px;color:var(--text-light);display:flex;flex-direction:column;gap:3px;cursor:pointer" onclick="editPeriode(${p.tahun},${p.bulan})">
          <div>Mulai: ${formatDate(p.tanggalMulai)}${p.jamMulai ? ` pukul ${p.jamMulai}` : ''}</div>
          <div>Selesai: ${formatDate(p.tanggalSelesai)}${p.jamSelesai ? ` pukul ${p.jamSelesai}` : ''}</div>
          ${p.notifOperator ? `<div style="margin-top:6px;padding:5px 8px;background:rgba(13,148,136,0.08);border-radius:6px;color:var(--text-md);font-size:11px;border-left:3px solid var(--primary)"><span style="font-weight:600">Notif:</span> ${p.notifOperator}</div>` : ''}
        </div>
      </div>`;
    }).join('');
  } catch (e) { toast(e.message, 'error'); }
}

async function hapusPeriode(tahun, bulan, namaBulan) {
  showConfirm({
    title: 'Hapus Periode',
    message: `Hapus periode <b>${namaBulan} ${tahun}</b>? Tindakan ini tidak bisa dibatalkan.`,
    onConfirm: async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/periode?tahun=${tahun}&bulan=${bulan}`, { method: 'DELETE' });
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Gagal menghapus');
        toast(`Periode ${namaBulan} ${tahun} berhasil dihapus`, 'success');
        loadPeriodeGrid();
      } catch (e) { toast(e.message, 'error'); }
      finally { setLoading(false); }
    }
  });
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
    document.getElementById('pJamMulai').value = p.jamMulai || '08:00';
    document.getElementById('pJamSelesai').value = p.jamSelesai || '17:00';
    document.getElementById('pNotif').value = p.notifOperator || '';
    document.getElementById('pStatus').value = p.status;
    showModal('periodeModal');
  } catch (e) { openPeriodeModal(); }
}

async function savePeriode() {
  const tahun = parseInt(document.getElementById('pTahun').value);
  const bulan = parseInt(document.getElementById('pBulan').value);
  const tanggalMulai = document.getElementById('pMulai').value;
  const tanggalSelesai = document.getElementById('pSelesai').value;
  const jamMulai = document.getElementById('pJamMulai').value || '08:00';
  const jamSelesai = document.getElementById('pJamSelesai').value || '17:00';
  const notifOperator = document.getElementById('pNotif').value.trim();
  const status = document.getElementById('pStatus').value;
  if (!tanggalMulai || !tanggalSelesai) return toast('Tanggal mulai dan selesai harus diisi', 'error');
  setLoading(true);
  try {
    await API.savePeriode({ tahun, bulan, namaBulan: BULAN_NAMA[bulan], tanggalMulai, tanggalSelesai, jamMulai, jamSelesai, notifOperator, status });
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
// ============== IDLE AUTO LOGOUT ==============
const IDLE_TIMEOUT = 4 * 60 * 1000; // 4 menit
let _idleTimer = null;

function resetIdleTimer() {
  clearTimeout(_idleTimer);
  _idleTimer = setTimeout(() => {
    if (currentUser) {
      currentUser = null;
      localStorage.removeItem('spm_user');
      sessionStorage.removeItem('spm_lastPage');
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
  initTheme();
  document.getElementById('authEmail').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doLogin();
  });

  // Restore session dari localStorage
  try {
    const saved = localStorage.getItem('spm_user');
    if (saved) {
      currentUser = JSON.parse(saved);
      // Normalisasi role lama → nama baru
      const roleMap = { 'Kapus': 'Kepala Puskesmas', 'kapus': 'Kepala Puskesmas', 'Program': 'Pengelola Program' };
      if (roleMap[currentUser.role]) {
        currentUser.role = roleMap[currentUser.role];
        localStorage.setItem('spm_user', JSON.stringify(currentUser)); // update localStorage
      }
      startApp();
      startIdleWatcher();
    }
  } catch(e) {
    localStorage.removeItem('spm_user');
    sessionStorage.removeItem('spm_lastPage');
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
          <select class="form-control" id="kuTahun" onchange="loadKelolaUsulan()" style="width:120px">${yearOptions(CURRENT_YEAR)}</select>
          <select class="form-control" id="kuBulan" onchange="loadKelolaUsulan()" style="width:140px">
            <option value="">Semua Bulan</option>${bulanOptions('')}
          </select>
          <select class="form-control" id="kuStatus" onchange="loadKelolaUsulan()" style="width:160px">
            <option value="">Semua Status</option>
            <option>Draft</option><option>Menunggu Kepala Puskesmas</option><option>Menunggu Pengelola Program</option>
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
        <td style="font-size:12px;color:var(--text-light)">${formatDateTime(u.createdAt)}</td>
        <td style="display:flex;gap:4px">
          <button class="btn-icon view" onclick="viewDetail('${u.idUsulan}')" title="Detail"><span class="material-icons">visibility</span></button>
          <button class="btn-icon edit" onclick="adminEditUsulan('${u.idUsulan}')" title="Edit"><span class="material-icons">edit</span></button>
          <button class="btn-icon del" onclick="adminDeleteUsulan('${u.idUsulan}')" title="Hapus"><span class="material-icons">delete</span></button>
          ${u.statusGlobal === 'Menunggu Admin' && u.statusKapus !== 'Selesai'
            ? `<button class="btn-icon" onclick="restoreVerifAdmin('${u.idUsulan}')" title="Pulihkan verifikasi Kapus & Program" style="color:#f59e0b;background:#fffbeb;border:1px solid #fcd34d"><span class="material-icons">restore</span></button>`
            : ''}
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

async function restoreVerifAdmin(idUsulan) {
  showConfirm({
    title: 'Pulihkan Status Verifikasi',
    type: 'warning',
    icon: 'restore',
    message: `Status verifikasi Kepala Puskesmas dan Pengelola Program untuk usulan ${idUsulan} akan dipulihkan ke "Selesai".\n\nGunakan ini hanya jika data verifikasi hilang akibat bug ajukan ulang.`,
    onConfirm: async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/usulan?action=restore-verif', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idUsulan, emailAdmin: currentUser.email })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Gagal memulihkan');
        toast('Status verifikasi berhasil dipulihkan ✓', 'success');
        loadKelolaUsulan();
      } catch(e) { toast(e.message, 'error'); }
      finally { setLoading(false); }
    }
  });
}
