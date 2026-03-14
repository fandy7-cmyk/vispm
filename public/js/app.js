// ============== CATATAN THREAD HELPER ==============
// Render riwayat catatan sebagai zigzag timeline (5 per baris), collapse by default
async function renderCatatanThread(elId, idUsulan, currentRole) {
  const el = document.getElementById(elId);
  if (!el) return;

  const AKSI_CHAT = ['Tolak','Tolak (sebagian)','Sanggah','Sanggah Selesai','Ajukan Ulang','Kembalikan','Tolak Ke Operator','Tolak Indikator','Approve','Re-verifikasi'];
  const APPROVE_SKIP = ['Semua indikator disetujui'];

  let logs = [];
  try {
    const data = await API.getLogAktivitas(idUsulan);
    logs = (data.logs || []).filter(l => {
      if (!AKSI_CHAT.includes(l.aksi) || !l.detail || !l.detail.trim()) return false;
      if (l.aksi === 'Approve') return !APPROVE_SKIP.includes(l.detail.trim());
      return true;
    });
  } catch(e) { return; }

  if (!logs.length) { el.style.display = 'none'; el.innerHTML = ''; return; }

  const roleCfg = {
    'Operator':          { color:'#0891b2', bg:'#e0f2fe', border:'#7dd3fc' },
    'Kepala Puskesmas':  { color:'#d97706', bg:'#fffbeb', border:'#fde68a' },
    'Pengelola Program': { color:'#7c3aed', bg:'#f5f3ff', border:'#c4b5fd' },
    'Admin':             { color:'#dc2626', bg:'#fef2f2', border:'#fca5a5' },
  };
  const aksiIcon = {
    'Tolak':'cancel','Tolak (sebagian)':'remove_circle','Sanggah':'gavel',
    'Sanggah Selesai':'check_circle','Ajukan Ulang':'restart_alt',
    'Kembalikan':'undo','Tolak Ke Operator':'reply','Tolak Indikator':'cancel',
    'Approve':'check_circle','Re-verifikasi':'update',
  };
  function fmtDT(ts) {
    const d = new Date(ts), o = { timeZone:'Asia/Makassar' };
    const tgl = d.toLocaleDateString('id-ID',{...o,day:'2-digit',month:'2-digit',year:'numeric'});
    const jam = d.toLocaleTimeString('id-ID',{...o,hour:'2-digit',minute:'2-digit',hour12:false});
    return tgl + ' ' + jam + ' WITA';
  }

  // unique prefix per elemen supaya tidak collision jika 2 thread di halaman sama
  const pfx = elId + '_ct';

  // === GRID MODE: 4 kolom, compact, klik expand detail ===
  const COLS = 10;
  let html = '<div style="display:grid;grid-template-columns:repeat(10,1fr);gap:6px">';

  logs.forEach((log, idx) => {
    const cfg = roleCfg[log.role] || { color:'#64748b', bg:'#f8fafc', border:'#e2e8f0' };
    const icon = aksiIcon[log.aksi] || 'chat';
    const nama = log.user_nama || log.user_email;
    const cardId = pfx + '_' + idx;
    // Warna badge aksi — berbeda dari warna role agar mudah dibedakan
    const aksiColorMap = {
      'Tolak':           { c:'#dc2626', b:'#fef2f2' },
      'Tolak (sebagian)':{ c:'#d97706', b:'#fffbeb' },
      'Tolak Indikator': { c:'#dc2626', b:'#fef2f2' },
      'Tolak Ke Operator':{ c:'#dc2626', b:'#fef2f2' },
      'Kembalikan':      { c:'#7c3aed', b:'#f5f3ff' },
      'Approve':         { c:'#059669', b:'#ecfdf5' },
      'Re-verifikasi':   { c:'#0891b2', b:'#ecfeff' },
      'Ajukan Ulang':    { c:'#2563eb', b:'#eff6ff' },
      'Sanggah':         { c:'#7c3aed', b:'#f5f3ff' },
      'Sanggah Selesai': { c:'#059669', b:'#ecfdf5' },
    };
    const aksiClr = aksiColorMap[log.aksi] || { c:cfg.color, b:cfg.bg };

    html += `<div style="border:1.5px solid ${aksiClr.c}55;border-radius:8px;background:${aksiClr.b};overflow:hidden">
      <!-- header: selalu tampil, klik toggle -->
      <div onclick="(function(){
        var d=document.getElementById('${cardId}');
        var arr=document.getElementById('${cardId}_arr');
        if(d.style.display==='none'){d.style.display='block';arr.textContent='expand_less';}
        else{d.style.display='none';arr.textContent='expand_more';}
      })()" style="padding:7px 8px;cursor:pointer;display:flex;align-items:flex-start;gap:6px">
        <div style="width:28px;height:28px;border-radius:50%;background:white;border:2px solid ${aksiClr.c};display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px">
          <span class="material-icons" style="font-size:14px;color:${aksiClr.c}">${icon}</span>
        </div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:4px">
            <span style="font-size:10px;font-weight:800;color:${aksiClr.c}">#${idx+1}</span>
            <span id="${cardId}_arr" class="material-icons" style="font-size:12px;color:${aksiClr.c}">expand_more</span>
          </div>
          <div style="font-size:11.5px;font-weight:700;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${nama}</div>
          <div style="font-size:10.5px;color:#64748b;margin-bottom:3px">${log.role}</div>
          <div style="font-size:10.5px;font-weight:700;color:${aksiClr.c};background:white;border:1px solid ${aksiClr.c}60;border-radius:20px;padding:1px 6px;display:inline-flex;align-items:center;gap:2px">
            <span class="material-icons" style="font-size:11px">${icon}</span>${log.aksi}
          </div>
        </div>
      </div>
      <!-- expanded: detail + timestamp -->
      <div id="${cardId}" style="display:none;padding:6px 8px;border-top:1px solid ${aksiClr.c}30;background:white">
        <div style="font-size:11.5px;color:#1e293b;line-height:1.5;word-break:break-word">${log.detail}</div>
        <div style="font-size:10px;color:#94a3b8;margin-top:4px">${fmtDT(log.timestamp)}</div>
      </div>
    </div>`;
  });

  html += '</div>';

  el.innerHTML = `<div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:10px;padding:12px 14px">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #e2e8f0">
      <span class="material-icons" style="font-size:15px;color:#64748b">forum</span>
      <span style="font-size:12px;font-weight:700;color:#475569">Riwayat Catatan</span>
      <span style="font-size:10px;color:#94a3b8;margin-left:4px">(${logs.length} entri — klik untuk detail)</span>
    </div>
    <div style="width:100%">${html}</div>
  </div>`;
  el.style.display = 'block';
}

// ============== APP STATE ==============

// ============== PENOLAKAN BANNER HELPER ==============
// Tampilkan banner alasan penolakan per indikator dari verifikator level atas
// elId: id elemen div target | ditolakOleh: label nama role | alasanArr: [{no, alasan}]
function renderPenolakanBanner(elId, ditolakOleh, alasanArr) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!ditolakOleh || !alasanArr || !alasanArr.length) {
    el.style.display = 'none'; el.innerHTML = ''; return;
  }
  const rows = alasanArr.map(({ no, alasan }) =>
    `<div style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid #fecaca">
      <span style="background:#fee2e2;color:#991b1b;border-radius:4px;padding:1px 8px;font-size:11px;font-weight:700;white-space:nowrap;flex-shrink:0">Ind. #${no}</span>
      <span style="font-size:12px;color:#7f1d1d;line-height:1.5">${alasan || '-'}</span>
    </div>`
  ).join('');
  el.innerHTML = `
    <div style="background:#fef2f2;border:1.5px solid #fca5a5;border-radius:8px;padding:12px 14px">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
        <span class="material-icons" style="font-size:16px;color:#dc2626">cancel</span>
        <span style="font-size:12.5px;font-weight:700;color:#991b1b">Alasan Penolakan dari ${ditolakOleh}</span>
      </div>
      <div style="display:flex;flex-direction:column">${rows}</div>
    </div>`;
  el.style.display = 'block';
}

// Format timestamp: DD MMMM YYYY, HH:mm WITA
function formatTS(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  if (isNaN(d)) return ts;
  const o = { timeZone: 'Asia/Makassar' };
  const tgl = d.toLocaleDateString('id-ID', { ...o, day: '2-digit', month: '2-digit', year: 'numeric' });
  const jam = d.toLocaleTimeString('id-ID', { ...o, hour: '2-digit', minute: '2-digit', hour12: false });
  return `${tgl} | ${jam} WITA`;
}

let currentUser = null;
let currentPage = '';
let pageData = {}; // cache per page
let verifCurrentUsulan = null; // for verifikasi modal
window.verifCurrentUsulan = null;

// ===== GOOGLE DRIVE CONFIG =====
// Google Drive: menggunakan Service Account (backend)
window.GDRIVE_FOLDER_ID = "1HywRrWup2JgX3Zig2FND8K5Zc6HWtu-A";


// Format date only: DD MMMM YYYY
function formatDate(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  if (isNaN(d)) return ts;
  return d.toLocaleDateString('id-ID', {
    timeZone: 'Asia/Makassar',
    day: '2-digit', month: 'long', year: 'numeric',
  });
}

// Format datetime: DD MMMM YYYY, HH:mm  
function formatDateTime(ts) { return formatTS(ts); }

// Format Capaian (%) — dipakai di seluruh sistem
function fmtCapaianPct(capaian, target) {
  if (!target || target <= 0) return '0%';
  const pct = Math.min((parseFloat(capaian) / parseFloat(target)) * 100, 100);
  if (pct === 100) return '100%';
  if (pct === 0) return '0%';
  // Tampilkan 1 desimal jika ada, buang trailing zero
  const fixed = pct.toFixed(1);
  return (fixed.endsWith('.0') ? pct.toFixed(0) : fixed) + '%';
}
// ============== AUTH ==============
async function doLogin() {
  const email = document.getElementById('authEmail').value.trim();
  if (!email) return setAuthStatus('Masukkan email Anda', 'error');

  const password = document.getElementById('authPassword')?.value || '';

  const btn = document.getElementById('authBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="material-icons" style="animation:spin 0.8s linear infinite">refresh</span> Loading...';
  setAuthStatus('Memeriksa kredensial...', '');

  try {
    const user = await API.login(email, password);
    currentUser = user;
    localStorage.setItem('spm_user', JSON.stringify(user));
    // Catat log login
    API.logAudit({ module: 'auth', action: 'LOGIN', userEmail: user.email, userNama: user.nama, userRole: user.role, detail: 'Login berhasil' });
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
    onConfirm: () => { if(currentUser) API.logAudit({module:'auth',action:'LOGOUT',userEmail:currentUser.email,userNama:currentUser.nama,userRole:currentUser.role,detail:'Logout manual'}); currentUser = null; localStorage.removeItem('spm_user'); try { sessionStorage.removeItem('spm_last_page'); } catch(e) {} location.reload(); }
  });
}

// ============== APP INIT ==============
function startApp() {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('appLayout').style.display = 'flex';

  // Normalisasi indikatorAkses: pastikan selalu berupa array integer
  // (dari DB/localStorage bisa berupa string "1,3,5-8" atau array)
  const _aksesRaw = currentUser.indikatorAkses;
  if (typeof _aksesRaw === 'string') {
    currentUser.indikatorAksesString = _aksesRaw; // simpan string asli untuk display
    currentUser.indikatorAkses = parseIndikatorAksesString(_aksesRaw);
  } else if (Array.isArray(_aksesRaw)) {
    // Sudah array (misal dari localStorage JSON) — normalisasi ulang ke integer dan rebuild string
    currentUser.indikatorAkses = _aksesRaw.map(n => parseInt(n)).filter(n => !isNaN(n) && n > 0);
    currentUser.indikatorAksesString = currentUser.indikatorAkses.join(',');
  } else {
    currentUser.indikatorAkses = [];
    currentUser.indikatorAksesString = '';
  }

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
  const dropNameEl = document.getElementById('topbarDropName');
  if (dropNameEl) dropNameEl.textContent = currentUser.nama || currentUser.email;
  const dropMetaEl = document.getElementById('topbarDropMeta');
  if (dropMetaEl) dropMetaEl.textContent = currentUser.role + (currentUser.namaPKM ? ` · ${currentUser.namaPKM}` : '');

  // Load app settings (tahun range) lalu build UI
  API.get('settings').then(s => {
    if (s && s.tahun_awal) {
      window._appTahunAwal  = parseInt(s.tahun_awal);
      window._appTahunAkhir = parseInt(s.tahun_akhir);
    }
  }).catch(() => {});
  // Fetch periode aktif untuk proteksi sidebar Input Usulan
  API.get('periode').then(allPeriode => {
    window._periodeAktifList = Array.isArray(allPeriode) ? allPeriode : [];
    buildSidebar(); // rebuild sidebar setelah tahu status periode
  }).catch(() => {
    window._periodeAktifList = [];
  });
  buildSidebar();

  // Inject tombol Search & Notifikasi ke topbar
  const topbarRight = document.querySelector('.topbar-right');
  if (topbarRight && !document.getElementById('notifBtnWrap')) {
    const searchBtn = document.createElement('button');
    searchBtn.id = 'globalSearchBtn';
    searchBtn.title = 'Cari (Ctrl+K)';
    searchBtn.style.cssText = 'background:none;border:1.5px solid #e2e8f0;border-radius:8px;padding:5px 10px;cursor:pointer;display:flex;align-items:center;gap:5px;color:#64748b;font-size:12px;font-family:inherit;transition:all 0.15s';
    searchBtn.innerHTML = '<span class="material-icons" style="font-size:17px">search</span>';
    searchBtn.onmouseover = () => { searchBtn.style.borderColor="#0d9488"; searchBtn.style.color="#0d9488"; };
    searchBtn.onmouseout  = () => { searchBtn.style.borderColor="#e2e8f0"; searchBtn.style.color="#64748b"; };
    searchBtn.onclick = openGlobalSearch;
    const notifWrap = document.createElement('div');
    notifWrap.id = 'notifBtnWrap';
    notifWrap.style.cssText = 'position:relative;display:flex';
    const notifBtn = document.createElement('button');
    notifBtn.id = 'notifBtn';
    notifBtn.title = 'Notifikasi';
    notifBtn.style.cssText = 'background:none;border:1.5px solid #e2e8f0;border-radius:8px;width:36px;height:36px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#64748b;transition:all 0.15s;position:relative';
    notifBtn.innerHTML = '<span class="material-icons" style="font-size:19px">notifications</span>';
    notifBtn.onmouseover = () => { notifBtn.style.borderColor="#0d9488"; notifBtn.style.color="#0d9488"; };
    notifBtn.onmouseout  = () => { notifBtn.style.borderColor="#e2e8f0"; notifBtn.style.color="#64748b"; };
    notifBtn.onclick = toggleNotifPanel;
    notifWrap.appendChild(notifBtn);
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) {
      topbarRight.insertBefore(searchBtn, themeBtn);
      topbarRight.insertBefore(notifWrap, themeBtn);
    } else {
      topbarRight.prepend(notifWrap);
      topbarRight.prepend(searchBtn);
    }
  }
  startNotifPoller();

  // Restore halaman terakhir sebelum refresh (jika ada), fallback ke dashboard
  // Restore halaman terakhir, tapi validasi dulu apakah role saat ini boleh akses
  let lastPage = 'dashboard';
  try {
    const saved = sessionStorage.getItem('spm_last_page');
    if (saved && saved !== 'dashboard') {
      // Kumpulkan halaman yang boleh diakses role ini dari menuMap
      const roleMenus = {
        'Admin':            ['dashboard','verifikasi','laporan','master-data','kelola-usulan'],
        'Operator':         ['dashboard','input','laporan'],
        'Kepala Puskesmas': ['dashboard','verifikasi','laporan'],
        'Pengelola Program':['dashboard','verifikasi','laporan'],
        'Super Admin':      ['dashboard','verifikasi','laporan','master-data','kelola-usulan','users','pkm','indikator','periode','jabatan'],
      };
      const allowed = roleMenus[currentUser.role] || ['dashboard'];
      if (allowed.includes(saved)) lastPage = saved;
      // Kalau halaman tidak diizinkan (misal 'input' untuk Kapus), fallback ke dashboard
    }
  } catch(e) {}
  loadPage(lastPage);

  // Sembunyikan menu Edit Profil & Tanda Tangan untuk Operator
  const btnEPTT = document.getElementById('btnEditProfilTT');
  if (btnEPTT) {
    const rolesBolehTT = ['Kepala Puskesmas','Pengelola Program'];
    btnEPTT.style.display = rolesBolehTT.includes(currentUser.role) ? '' : 'none';
  }

  // Popup notifikasi periode untuk Operator saat login
  if (currentUser.role === 'Operator') {
    setTimeout(() => showPeriodeLoginPopup(), 800);
  }

  // Popup notifikasi tanda tangan untuk Kepala Puskesmas, Pengelola Program, dan Admin
  const rolesBolehTT2 = ['Kepala Puskesmas', 'Pengelola Program', 'Admin'];
  if (rolesBolehTT2.includes(currentUser.role)) {
    setTimeout(() => showTandaTanganLoginPopup(), 1000);
  }
}

async function showPeriodeLoginPopup() {
  try {
    const periodeList = await API.get('periode');
    const aktifList = (periodeList || []).filter(p => p.isAktifToday);
    if (!aktifList.length) return;

    const periodesHtml = aktifList.map(aktif => `
      <div style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:10px">
        <div style="background:linear-gradient(135deg,#0d9488,#06b6d4);padding:8px 14px;color:white;font-weight:700;font-size:14px">
          ${aktif.namaBulan} ${aktif.tahun}
        </div>
        <div style="display:flex;gap:0">
          <div style="flex:1;display:flex;align-items:center;gap:8px;padding:10px 14px;background:#f0fdf9;border-right:1px solid #e2e8f0">
            <span class="material-icons" style="color:#0d9488;font-size:18px;flex-shrink:0">login</span>
            <div>
              <div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase">Dibuka</div>
              <div style="font-size:12.5px;font-weight:700;color:#0f172a">${formatDate(aktif.tanggalMulai)} ${aktif.jamMulai||'08:00'} WITA</div>
            </div>
          </div>
          <div style="flex:1;display:flex;align-items:center;gap:8px;padding:10px 14px;background:#fef2f2">
            <span class="material-icons" style="color:#ef4444;font-size:18px;flex-shrink:0">logout</span>
            <div>
              <div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase">Ditutup</div>
              <div style="font-size:12.5px;font-weight:700;color:#0f172a">${formatDate(aktif.tanggalSelesai)} ${aktif.jamSelesai||'17:00'} WITA</div>
            </div>
          </div>
        </div>
        ${aktif.notifOperator ? `<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 14px;background:#fffbeb;border-top:1px solid #fcd34d"><span style="font-size:16px;flex-shrink:0">📢</span><div style="font-size:12px;color:#0f172a;line-height:1.5">${aktif.notifOperator}</div></div>` : ''}
      </div>`).join('');

    const popup = document.createElement('div');
    popup.id = 'periodePopup';
    popup.style.cssText = `position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9998;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px);animation:fadeIn 0.3s ease`;
    popup.innerHTML = `
      <div style="background:white;border-radius:16px;width:480px;max-width:calc(100vw - 32px);overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,0.3);animation:authIn 0.3s ease">
        <div style="background:linear-gradient(135deg,#0d9488,#06b6d4);padding:16px 20px;color:white">
          <div style="display:flex;align-items:center;gap:10px">
            <span class="material-icons" style="font-size:22px">notifications_active</span>
            <span style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px">Informasi Periode Input</span>
          </div>
        </div>
        <div style="padding:16px 20px">
          ${periodesHtml}
          <button onclick="document.getElementById('periodePopup').remove()" style="width:100%;margin-top:4px;height:42px;background:linear-gradient(135deg,#0d9488,#06b6d4);border:none;border-radius:10px;color:white;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">
            <span style="display:flex;align-items:center;justify-content:center;gap:6px"><span class="material-icons" style="font-size:18px">check</span>Mengerti, Tutup</span>
          </button>
        </div>
      </div>`;
    popup.addEventListener('click', e => { if (e.target === popup) popup.remove(); });
    document.body.appendChild(popup);
  } catch(e) { /* silent fail */ }
}


async function showTandaTanganLoginPopup() {
  try {
    const role = currentUser.role;
    let ttMissing = false;
    let isAdmin = role === 'Admin';

    if (role === 'Kepala Puskesmas' || role === 'Pengelola Program') {
      const tt = currentUser.tandaTangan;
      ttMissing = !tt || tt === 'null' || tt === '';
    } else if (role === 'Admin') {
      try {
        const pjRes = await fetch('/api/pejabat');
        const pjData = await pjRes.json();
        const pjList = pjData.success ? pjData.data : [];
        const kasubag = pjList.find(p => p.jabatan === 'Kepala Sub Bagian Perencanaan');
        const kadis   = pjList.find(p => p.jabatan === 'Kepala Dinas Kesehatan PPKB');
        ttMissing = !kasubag?.tanda_tangan || !kadis?.tanda_tangan;
      } catch(e) { ttMissing = true; }
    }

    if (!ttMissing) return; // Tanda tangan sudah lengkap, tidak perlu popup

    const SVG_PEN_I  = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>';
    const SVG_PEN2_I = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>';
    const SVG_GEAR_I = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

    const bodyHtml = isAdmin ? `
      <div style="display:flex;align-items:flex-start;gap:14px;padding:4px 0 12px">
        <div style="width:44px;height:44px;border-radius:12px;background:#fef2f2;border:1.5px solid #fca5a5;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#dc2626">${SVG_PEN_I}</div>
        <div>
          <div style="font-weight:700;color:#0f172a;font-size:14px;margin-bottom:4px">Tanda Tangan Pejabat Belum Lengkap</div>
          <div style="font-size:13px;color:#64748b;line-height:1.6">Data tanda tangan <b>Pejabat Penandatangan</b> belum diisi. Laporan PDF tidak dapat dibuat tanpa tanda tangan yang lengkap.</div>
        </div>
      </div>
      <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:10px 14px;font-size:12px;color:#7f1d1d;margin-bottom:4px">
        ⚠️ Lengkapi di: <b>Master Data → Pejabat Penandatangan</b>
      </div>` : `
      <div style="display:flex;align-items:flex-start;gap:14px;padding:4px 0 12px">
        <div style="width:44px;height:44px;border-radius:12px;background:#fef2f2;border:1.5px solid #fca5a5;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#dc2626">${SVG_PEN_I}</div>
        <div>
          <div style="font-weight:700;color:#0f172a;font-size:14px;margin-bottom:4px">Tanda Tangan Belum Diupload</div>
          <div style="font-size:13px;color:#64748b;line-height:1.6">Anda belum mengupload <b>tanda tangan</b>. Tanda tangan diperlukan untuk proses verifikasi usulan.</div>
        </div>
      </div>
      <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:10px 14px;font-size:12px;color:#7f1d1d;margin-bottom:4px">
        ⚠️ Upload di: <b>Foto Profil → Edit Profil & Tanda Tangan</b>
      </div>`;

    const popup = document.createElement('div');
    popup.id = 'ttLoginPopup';
    popup.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9998;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px);animation:fadeIn 0.3s ease';
    popup.innerHTML = `
      <div style="background:white;border-radius:16px;width:420px;max-width:calc(100vw - 32px);overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,0.3);animation:authIn 0.3s ease">
        <div style="background:linear-gradient(135deg,#dc2626,#ef4444);padding:16px 20px;color:white">
          <div style="display:flex;align-items:center;gap:10px">
            <span style="display:flex">${SVG_PEN_I}</span>
            <span style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px">Perhatian — Tanda Tangan</span>
          </div>
        </div>
        <div style="padding:20px">
          ${bodyHtml}
          <div style="display:flex;gap:8px;margin-top:14px">
            <button onclick="document.getElementById('ttLoginPopup').remove()" style="flex:1;height:42px;background:#f1f5f9;border:none;border-radius:10px;color:#64748b;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">
              Nanti
            </button>
            <button onclick="document.getElementById('ttLoginPopup').remove();${isAdmin ? "loadPage('master')" : 'openEditProfil()'}" style="flex:2;height:42px;background:linear-gradient(135deg,#dc2626,#ef4444);border:none;border-radius:10px;color:white;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px">
              ${isAdmin ? SVG_GEAR_I + ' Buka Master Data' : SVG_PEN2_I + ' Upload Sekarang'}
            </button>
          </div>
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
        { id: 'master-data', icon: 'storage', label: 'Master Data' },
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
    ]
  };

  const sections = menuMap[role] || menuMap['Operator'];
  let html = '';
  for (const section of sections) {
    html += `<div class="sidebar-section">${section.label}</div>`;
    for (const item of section.items) {
      // Disable menu Input Usulan jika tidak ada periode aktif
      const isInputMenu = item.id === 'input';
      const noPeriodeAktif = isInputMenu && !(window._periodeAktifList || []).some(p => p.isAktifToday);
      if (isInputMenu && noPeriodeAktif) {
        html += `<div class="menu-item" id="nav-${item.id}" title="Tidak ada periode input aktif" style="opacity:0.45;cursor:not-allowed;pointer-events:none">
          <span class="material-icons">${item.icon}</span><span>${item.label}</span>
          <span class="material-icons" style="font-size:14px;margin-left:auto;color:#fbbf24">lock</span>
        </div>`;
      } else {
        html += `<div class="menu-item" id="nav-${item.id}" onclick="loadPage('${item.id}')">
          <span class="material-icons">${item.icon}</span><span>${item.label}</span>
        </div>`;
      }
    }
  }
  // Tombol Buku Panduan — tampil untuk semua role di bagian bawah sidebar
  html += `
    <div style="margin-top:auto;border-top:1px solid rgba(255,255,255,0.15);padding-top:6px;">
      <div class="menu-item" onclick="openBukuPanduan()" title="Lihat Buku Panduan VISPM">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
        </svg>
        <span>Buku Panduan</span>
      </div>
    </div>`;

  nav.innerHTML = html;
}

function openBukuPanduan() {
  const PDF_URL = '/Buku_Panduan_VISPM.pdf';

  // Buat modal jika belum ada
  if (!document.getElementById('bukuPanduanModal')) {
    const el = document.createElement('div');
    el.id = 'bukuPanduanModal';
    el.className = 'modal fullscreen';
    // Override posisi agar tidak menutup topbar (60px)
    el.style.cssText = 'top:60px;z-index:999;';
    el.innerHTML = `
      <div class="modal-card" style="display:flex;flex-direction:column;height:calc(100vh - 60px);border-radius:0;">
        <div class="modal-header">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--primary);flex-shrink:0">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
          </svg>
          <h3>Buku Panduan VISPM</h3>
          <div style="display:flex;align-items:center;gap:8px;margin-left:auto">
            <button onclick="downloadBukuPanduan()" title="Download Buku Panduan" style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;background:#10b981;color:white;border:none;border-radius:8px;cursor:pointer;font-size:12.5px;font-weight:600">
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v10"/><path d="m8 9 4 4 4-4"/><path d="M4 17c0 2.2 1.8 4 4 4h8c2.2 0 4-1.8 4-4"/></svg>
              Download
            </button>
            <button class="btn-icon" onclick="closeModal('bukuPanduanModal')">
              <span class="material-icons">close</span>
            </button>
          </div>
        </div>
        <div class="modal-body flex-col" style="padding:0;flex:1;min-height:0;">
          <iframe
            src="${PDF_URL}#toolbar=1&navpanes=0"
            style="width:100%;height:100%;border:none;flex:1;"
            title="Buku Panduan VISPM"
          ></iframe>
        </div>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', e => { if (e.target === el) closeModal('bukuPanduanModal'); });
  }

  showModal('bukuPanduanModal');
}

function downloadBukuPanduan() {
  const link = document.createElement('a');
  link.href = '/Buku_Panduan_VISPM.pdf';
  link.download = 'Buku_Panduan_VISPM.pdf';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  toast('Mengunduh Buku Panduan VISPM...', 'success');
}


function setActiveNav(page) {
  document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
  const el = document.getElementById('nav-' + page);
  if (el) el.classList.add('active');
}

// ============== ROUTING ==============
const PAGE_TITLES = {
  dashboard: 'Dashboard', verifikasi: 'Verifikasi', laporan: 'Laporan',
  'master-data': 'Master Data', users: 'Kelola User', jabatan: 'Kelola Jabatan', pkm: 'Kelola Puskesmas',
  indikator: 'Kelola Indikator', periode: 'Periode Input', input: 'Input Usulan',
  'kelola-usulan': 'Kelola Usulan', 'target-tahunan': 'Target Tahunan'
};

function loadPage(page) {
  // === PROTEKSI PERIODE: Cegah akses halaman Input Usulan jika tidak ada periode aktif ===
  if (page === 'input' && currentUser && currentUser.role === 'Operator') {
    const periodeAktif = (window._periodeAktifList || []).filter(p => p.isAktifToday);
    if (periodeAktif.length === 0) {
      showPeriodeTutupBanner();
      return;
    }
  }
  currentPage = page;
  // Simpan halaman terakhir agar bisa di-restore saat refresh
  try { sessionStorage.setItem('spm_last_page', page); } catch(e) {}
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
    'target-tahunan': renderTargetTahunan,
    'master-data': renderMasterData,
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
  const max = maxYear || window._appTahunAkhir || window._maxPeriodeTahun || Math.max(CURRENT_YEAR + 3, 2030);
  const min = window._appTahunAwal || Math.min(2024, CURRENT_YEAR);
  let html = '';
  for (let y = min; y <= max; y++) {
    html += `<option value="${y}" ${y == selected ? 'selected' : ''}>${y}</option>`;
  }
  return html;
}


// ============== PAGINATION HELPER ==============
const ITEMS_PER_PAGE = 10;

function paginateData(rows, page) {
  const total = rows.length;
  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);
  const p = Math.max(1, Math.min(page || 1, totalPages || 1));
  const start = (p - 1) * ITEMS_PER_PAGE;
  const items = rows.slice(start, start + ITEMS_PER_PAGE);
  return { items, page: p, totalPages, total };
}

function renderPagination(containerId, total, page, totalPages, onPageChange) {
  if (totalPages <= 1) return '';
  const start = (page - 1) * ITEMS_PER_PAGE + 1;
  const end = Math.min(page * ITEMS_PER_PAGE, total);
  const pages = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...');
    }
  }
  const btnStyle = (active) => active
    ? 'padding:5px 10px;border:1.5px solid #0d9488;background:#0d9488;color:white;border-radius:6px;font-size:12px;font-weight:700;cursor:default'
    : 'padding:5px 10px;border:1.5px solid #e2e8f0;background:white;color:#334155;border-radius:6px;font-size:12px;cursor:pointer';
  const pageButtons = pages.map(p =>
    p === '...'
      ? `<span style="padding:5px 4px;font-size:12px;color:#94a3b8">…</span>`
      : `<button style="${btnStyle(p===page)}" ${p===page?'disabled':''} onclick="(${onPageChange})(${p})">${p}</button>`
  ).join('');
  return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-top:1px solid #f1f5f9;flex-wrap:wrap;gap:8px">
    <span style="font-size:12px;color:#64748b">Menampilkan ${start}–${end} dari ${total} data</span>
    <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">
      <button style="${btnStyle(false)}${page<=1?';opacity:0.4;cursor:not-allowed':''}" ${page<=1?'disabled':''} onclick="(${onPageChange})(${page-1})">‹</button>
      ${pageButtons}
      <button style="${btnStyle(false)}${page>=totalPages?';opacity:0.4;cursor:not-allowed':''}" ${page>=totalPages?'disabled':''} onclick="(${onPageChange})(${page+1})">›</button>
    </div>
  </div>`;
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

  try {
    if (role === 'Admin') renderAdminDashboard(content, data);
    else if (role === 'Operator') renderOperatorDashboard(content, data);
    else if (role === 'Kepala Puskesmas') renderKepalasDashboard(content, data);
    else if (role === 'Pengelola Program') renderProgramDashboard(content, data);

  } catch(e) {
    console.error('renderDashboard error:', e);
    content.innerHTML = `<div class="empty-state"><span class="material-icons" style="color:#ef4444">error</span><p>Error: ${e.message}</p></div>`;
  }
}

function renderAdminDashboard(el, d) {
  el.innerHTML = `
    <div class="stats-grid">
      ${statCard('blue','assignment','Total Usulan', d.totalUsulan)}
      ${statCard('green','check_circle','Selesai', d.selesai)}
      ${statCard('orange','pending','Menunggu', d.menunggu)}
      ${statCard('purple','local_hospital','Puskesmas Aktif', d.puskesmasAktif)}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start">
      <div class="card" style="margin:0">
        <div class="card-header-bar">
          <span class="card-title"><span class="material-icons">timeline</span>Statistik per Bulan (${CURRENT_YEAR})</span>
        </div>
        <div class="card-body" style="padding:12px 16px">
          ${renderChart(d.chartData)}
          <div style="border-top:1px solid var(--border);margin-top:4px;padding-top:12px">
            ${renderDonutChart(d.selesai||0, d.menunggu||0, Math.max(0,(d.totalUsulan||0)-(d.selesai||0)-(d.menunggu||0)))}
          </div>
        </div>
      </div>
      <div class="card" style="margin:0">
        <div class="card-header-bar">
          <span class="card-title"><span class="material-icons">bar_chart</span>Ringkasan Status</span>
        </div>
        <div class="card-body" style="padding:12px 14px">
          ${renderStatusSummary(d)}
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-header-bar">
        <span class="card-title"><span class="material-icons">local_hospital</span>Progress per Puskesmas</span>
        <button class="btn btn-secondary btn-sm" onclick="loadPage('verifikasi')">
          <span class="material-icons">arrow_forward</span>Lihat Semua Usulan
        </button>
      </div>
      <div class="card-body" style="padding:0" id="pkmProgressTable">
        <div class="empty-state" style="padding:32px"><span class="material-icons">hourglass_empty</span><p>Memuat...</p></div>
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
    // Render progress per PKM dari data usulan
    renderPKMProgressTable(rows);
  }).catch(() => {
    const el = document.getElementById('recentTable');
    if (el) el.innerHTML = `<div class="empty-state" style="padding:32px"><span class="material-icons">inbox</span><p>Belum ada data usulan</p></div>`;
  });
}

function renderStatusSummary(d) {
  const total = d.totalUsulan || 0;
  const selesai = d.selesai || 0;
  const menunggu = d.menunggu || 0;
  const ditolak = Math.max(0, total - selesai - menunggu);
  const pct = total > 0 ? Math.round((selesai / total) * 100) : 0;
  const items = [
    { label: 'Selesai', val: selesai, color: '#10b981', bg: '#ecfdf5' },
    { label: 'Dalam Proses', val: menunggu, color: '#f59e0b', bg: '#fffbeb' },
    { label: 'Ditolak/Draft', val: ditolak, color: '#ef4444', bg: '#fef2f2' },
  ];
  return `
    <div style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span style="font-size:12px;color:var(--text-light);font-weight:600">Tingkat Penyelesaian</span>
        <span style="font-size:18px;font-weight:900;color:#10b981;font-family:'JetBrains Mono',monospace">${pct}%</span>
      </div>
      <div style="height:8px;background:#e2e8f0;border-radius:99px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#0d9488,#10b981);border-radius:99px;transition:width 0.6s ease"></div>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${items.map(it => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:${it.bg};border-radius:8px;border-left:3px solid ${it.color}">
          <span style="font-size:12.5px;font-weight:600;color:var(--text)">${it.label}</span>
          <span style="font-size:16px;font-weight:900;color:${it.color};font-family:'JetBrains Mono',monospace">${it.val}</span>
        </div>`).join('')}
    </div>`;
}

function renderPKMProgressTable(rows) {
  const el = document.getElementById('pkmProgressTable');
  if (!el) return;
  if (!rows || rows.length === 0) {
    el.innerHTML = `<div class="empty-state" style="padding:32px"><span class="material-icons">inbox</span><p>Belum ada data</p></div>`;
    return;
  }
  // Group by puskesmas
  const map = {};
  rows.forEach(u => {
    const k = u.kodePKM || u.kode_pkm || '-';
    const n = u.namaPKM || u.nama_puskesmas || k;
    if (!map[k]) map[k] = { nama: n, total: 0, selesai: 0, menunggu: 0, ditolak: 0 };
    map[k].total++;
    if (u.statusGlobal === 'Selesai') map[k].selesai++;
    else if (u.statusGlobal === 'Ditolak') map[k].ditolak++;
    else map[k].menunggu++;
  });
  const pkms = Object.values(map).sort((a,b) => b.total - a.total);
  el.innerHTML = `<table>
    <thead><tr>
      <th>Puskesmas</th>
      <th style="text-align:center">Total</th>
      <th style="text-align:center">Selesai</th>
      <th style="text-align:center">Proses</th>
      <th style="text-align:center">Ditolak</th>
      <th style="min-width:120px">Progress</th>
    </tr></thead>
    <tbody>${pkms.map(p => {
      const pct = p.total > 0 ? Math.round((p.selesai / p.total) * 100) : 0;
      return `<tr>
        <td style="font-weight:600;font-size:13px">${p.nama}</td>
        <td style="text-align:center">${p.total}</td>
        <td style="text-align:center"><span style="color:#10b981;font-weight:700">${p.selesai}</span></td>
        <td style="text-align:center"><span style="color:#f59e0b;font-weight:700">${p.menunggu}</span></td>
        <td style="text-align:center"><span style="color:#ef4444;font-weight:700">${p.ditolak}</span></td>
        <td>
          <div style="display:flex;align-items:center;gap:6px">
            <div style="flex:1;height:6px;background:#e2e8f0;border-radius:99px;overflow:hidden">
              <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#0d9488,#10b981);border-radius:99px"></div>
            </div>
            <span style="font-size:11px;font-weight:700;color:#0d9488;min-width:28px;text-align:right">${pct}%</span>
          </div>
        </td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
}

function renderOperatorStatusSummary(rows) {
  const total = rows.length;
  if (total === 0) return `<div class="empty-state" style="padding:16px"><span class="material-icons">inbox</span><p>Belum ada usulan</p></div>`;
  const selesai  = rows.filter(u => u.statusGlobal === 'Selesai').length;
  const ditolak  = rows.filter(u => u.statusGlobal === 'Ditolak').length;
  const proses   = rows.filter(u => !['Selesai','Ditolak','Draft'].includes(u.statusGlobal)).length;
  const draft    = rows.filter(u => u.statusGlobal === 'Draft').length;
  const pct      = total > 0 ? Math.round((selesai / total) * 100) : 0;
  const items = [
    { label: 'Selesai',      val: selesai, color: '#10b981', bg: '#ecfdf5' },
    { label: 'Dalam Proses', val: proses,  color: '#f59e0b', bg: '#fffbeb' },
    { label: 'Ditolak',      val: ditolak, color: '#ef4444', bg: '#fef2f2' },
    { label: 'Draft',        val: draft,   color: '#94a3b8', bg: '#f8fafc' },
  ];
  return `
    <div style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span style="font-size:12px;color:var(--text-light);font-weight:600">Tingkat Penyelesaian</span>
        <span style="font-size:18px;font-weight:900;color:#10b981;font-family:'JetBrains Mono',monospace">${pct}%</span>
      </div>
      <div style="height:8px;background:#e2e8f0;border-radius:99px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#0d9488,#10b981);border-radius:99px;transition:width 0.6s ease"></div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      ${items.map(it => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:${it.bg};border-radius:8px;border-left:3px solid ${it.color}">
          <span style="font-size:12px;font-weight:600;color:var(--text)">${it.label}</span>
          <span style="font-size:16px;font-weight:900;color:${it.color};font-family:'JetBrains Mono',monospace">${it.val}</span>
        </div>`).join('')}
    </div>`;
}

function renderKapusStatusSummary(rows) {
  const total   = rows.length;
  if (total === 0) return `<div class="empty-state" style="padding:16px"><span class="material-icons">inbox</span><p>Belum ada usulan</p></div>`;
  const selesai = rows.filter(u => u.statusGlobal === 'Selesai').length;
  const menungguKapus = rows.filter(u => u.statusGlobal === 'Menunggu Kepala Puskesmas').length;
  const proses  = rows.filter(u => !['Selesai','Ditolak','Draft','Menunggu Kepala Puskesmas'].includes(u.statusGlobal)).length;
  const ditolak = rows.filter(u => u.statusGlobal === 'Ditolak').length;
  const pct     = total > 0 ? Math.round((selesai / total) * 100) : 0;
  const items = [
    { label: 'Selesai',           val: selesai,        color: '#10b981', bg: '#ecfdf5' },
    { label: 'Menunggu Saya',     val: menungguKapus,  color: '#f59e0b', bg: '#fffbeb' },
    { label: 'Lanjut ke PP/Admin',val: proses,         color: '#0d9488', bg: '#f0fdfa' },
    { label: 'Ditolak',           val: ditolak,        color: '#ef4444', bg: '#fef2f2' },
  ];
  return `
    <div style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span style="font-size:12px;color:var(--text-light);font-weight:600">Tingkat Penyelesaian PKM</span>
        <span style="font-size:18px;font-weight:900;color:#10b981;font-family:'JetBrains Mono',monospace">${pct}%</span>
      </div>
      <div style="height:8px;background:#e2e8f0;border-radius:99px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#0d9488,#10b981);border-radius:99px;transition:width 0.6s ease"></div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      ${items.map(it => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:${it.bg};border-radius:8px;border-left:3px solid ${it.color}">
          <span style="font-size:12px;font-weight:600;color:var(--text)">${it.label}</span>
          <span style="font-size:16px;font-weight:900;color:${it.color};font-family:'JetBrains Mono',monospace">${it.val}</span>
        </div>`).join('')}
    </div>`;
}

function renderOperatorDashboard(el, d) {
  const periodeList = d.periodeAktifList || (d.periodeAktif ? [d.periodeAktif] : []);
  const p = periodeList[0] || null;

  // Hitung label stat card Periode Aktif
  const periodeLabel = periodeList.length > 0 ? periodeList.length : '-';

  let periodeBanner = "";
  if (periodeList.length > 0) {
    const _svgCal = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
    const _svgOpen = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
    const _svgClose = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
    const _svgNotif = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>';
    const items = periodeList.map((pr, idx) => {
      const jamMulai = pr.jam_mulai || "08:00";
      const jamSelesai = pr.jam_selesai || "17:00";
      const timerId = `periodeTimer_${idx}`;
      // Hitung deadline: tanggal_selesai + jam_selesai di timezone WITA (UTC+8)
      const _tglRaw2 = pr.tanggal_selesai || '';
      const _tglDate2 = _tglRaw2 ? new Date(_tglRaw2) : null;
      const deadlineWITA = (_tglDate2 && !isNaN(_tglDate2)) ? (() => {
        const [jsH2, jsM2] = jamSelesai.split(':').map(Number);
        return new Date(Date.UTC(_tglDate2.getUTCFullYear(), _tglDate2.getUTCMonth(), _tglDate2.getUTCDate(), jsH2-8, jsM2));
      })() : null;
      return `<div style="border:1.5px solid #a7f3d0;border-radius:10px;overflow:hidden;background:white;box-shadow:0 1px 4px rgba(13,148,136,0.08)">`
        + `<div style="background:linear-gradient(135deg,#0d9488,#06b6d4);padding:8px 14px;color:white;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:space-between;gap:7px">`
        + `<span style="display:flex;align-items:center;gap:7px"><span style="opacity:0.9;display:flex">${_svgCal}</span> Periode Aktif: ${pr.nama_bulan} ${pr.tahun}</span>`
        + `<span id="${timerId}" style="font-size:11px;font-weight:700;background:rgba(0,0,0,0.2);padding:3px 8px;border-radius:20px;letter-spacing:0.3px;font-family:'JetBrains Mono',monospace;white-space:nowrap">--:--:--</span>`
        + `</div>`
        + `<div style="display:grid;grid-template-columns:1fr 1fr;gap:0">`
        + `<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:#f0fdf9;border-right:1px solid #d1fae5"><span style="color:#0d9488;display:flex;flex-shrink:0">${_svgOpen}</span><div><div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.4px">Dibuka</div><div style="font-size:12px;font-weight:700;color:#0f172a">${formatDate(pr.tanggal_mulai)} ${jamMulai} WITA</div></div></div>`
        + `<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:#fef2f2"><span style="color:#ef4444;display:flex;flex-shrink:0">${_svgClose}</span><div><div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.4px">Ditutup</div><div style="font-size:12px;font-weight:700;color:#0f172a">${formatDate(pr.tanggal_selesai)} ${jamSelesai} WITA</div></div></div>`
        + `</div>`
        + (pr.notif_operator ? `<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 14px;background:#fffbeb;border-top:1px solid #fcd34d"><span style="color:#d97706;display:flex;flex-shrink:0;margin-top:1px">${_svgNotif}</span><div style="font-size:12px;color:#0f172a;line-height:1.5">${pr.notif_operator}</div></div>` : "")
        + `</div>`;
    }).join("");
    periodeBanner = `<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:10px">${items}</div>`;
  } else {
    periodeBanner = `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px">
        <div style="background:linear-gradient(135deg,#fffbeb,#fef3c7);border:1.5px solid #fcd34d;border-radius:12px;padding:16px 18px;display:flex;align-items:center;gap:14px;box-shadow:0 2px 8px rgba(245,158,11,0.10)">
          <div style="width:42px;height:42px;border-radius:10px;background:#fef9c3;border:1.5px solid #fde68a;display:flex;align-items:center;justify-content:center;flex-shrink:0">
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

  el.innerHTML = `
    <div class="stats-grid">
      ${statCard("blue","assignment","Total Usulan Saya", d.totalUsulan)}
      ${statCard("green","check_circle","Selesai/Disetujui", d.disetujui)}
      ${statCard("orange","pending","Dalam Proses", d.menunggu)}
      <div class="stat-card stat-card-v2" style="background:linear-gradient(135deg,#0891b2,#06b6d4);border:none;padding:0;overflow:hidden;display:flex;flex-direction:column;justify-content:space-between">
        <div style="padding:12px 14px 6px 14px;flex:1;display:flex;flex-direction:column;justify-content:center">
          <div id="dashPeriodeLabel" style="font-size:26px;font-weight:900;color:rgba(255,255,255,0.95);line-height:1;font-family:'JetBrains Mono',monospace;letter-spacing:-1px">${periodeLabel}</div>
        </div>
        <div style="padding:6px 14px 9px 14px;display:flex;align-items:center;justify-content:space-between;border-top:1px solid rgba(255,255,255,0.15)">
          <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.9)">Periode Aktif</div>
          <span class="material-icons" style="font-size:15px;color:rgba(255,255,255,0.6)">event_available</span>
        </div>
      </div>
    </div>
    <div id="dashPeriodeBanner" style="margin-bottom:14px">${periodeBanner}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:stretch">
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
          <div class="empty-state" style="padding:16px"><span class="material-icons">hourglass_empty</span></div>
        </div>
      </div>
    </div>
    <div class="card" style="margin-top:14px">
      <div class="card-header-bar"><span class="card-title"><span class="material-icons">history</span>Usulan Terbaru Saya</span></div>
      <div class="card-body" style="padding:0" id="recentTable"></div>
    </div>`;

  // Mulai timer countdown periode — setelah DOM di-render
  setTimeout(() => {
    window._periodeTimers = window._periodeTimers || [];
    window._periodeTimers.forEach(t => clearInterval(t));
    window._periodeTimers = [];
    periodeList.forEach((pr, idx) => {
      const jamSelesai = pr.jam_selesai || '17:00';
      // Parse tanggal_selesai — bisa ISO string atau YYYY-MM-DD dari PostgreSQL
      const _tglRaw = pr.tanggal_selesai || '';
      const _tglDate = _tglRaw ? new Date(_tglRaw) : null;
      if (!_tglDate || isNaN(_tglDate)) return;
      const thnS = _tglDate.getUTCFullYear();
      const blnS = _tglDate.getUTCMonth(); // sudah 0-based
      const tglS = _tglDate.getUTCDate();
      const [jsH, jsM] = jamSelesai.split(':').map(Number);
      // Deadline: tanggal_selesai jam_selesai WITA (UTC+8)
      const deadline = new Date(Date.UTC(thnS, blnS, tglS, jsH-8, jsM));
      const getEl = () => document.getElementById('periodeTimer_' + idx);
      const tick = () => {
        const el2 = getEl();
        if (!el2) { clearInterval(tid); return; }
        const diff = deadline - Date.now();
        if (diff <= 0) {
          el2.textContent = 'Ditutup';
          el2.style.background = 'rgba(239,68,68,0.35)';
          clearInterval(tid);
          return;
        }
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        const hh = String(h).padStart(2,'0');
        const mm = String(m).padStart(2,'0');
        const ss = String(s).padStart(2,'0');
        el2.textContent = h >= 24
          ? Math.floor(h/24) + 'h ' + String(h%24).padStart(2,'0') + ':' + mm + ':' + ss
          : hh + ':' + mm + ':' + ss;
        el2.style.background = diff < 3600000 ? 'rgba(239,68,68,0.4)' : 'rgba(0,0,0,0.2)';
      };
      let tid;
      tid = setInterval(tick, 1000);
      tick();
      window._periodeTimers.push(tid);
    });
  }, 0);

  API.getUsulan({ email_operator: currentUser.email }).then(rows => {
    document.getElementById("recentTable").innerHTML = renderUsulanTable(rows.slice(0, 5), "operator");
    // Render status summary
    const el2 = document.getElementById("operatorStatusSummary");
    if (el2) el2.innerHTML = renderOperatorStatusSummary(rows);
  }).catch(() => {
    const el2 = document.getElementById("recentTable");
    if (el2) el2.innerHTML = `<div class="empty-state" style="padding:32px"><span class="material-icons">inbox</span><p>Belum ada data usulan</p></div>`;
  });

  // Fallback: jika periodeAktifList tidak disertakan di data dashboard, fetch langsung
  if (!periodeList.length) {
    API.get('periode').then(allPeriode => {
      const aktif = (Array.isArray(allPeriode) ? allPeriode : []).filter(p => p.isAktifToday);
      if (!aktif.length) return;
      // Update stat card - tampilkan jumlah periode aktif
      const labelEl = document.getElementById('dashPeriodeLabel');
      if (labelEl) labelEl.textContent = aktif.length;
      // Update banner
      const bannerEl = document.getElementById('dashPeriodeBanner');
      if (bannerEl) {
        const _svgCal = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
        const _svgOpen = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
        const _svgClose = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
        const _svgNotif = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>';
        const items = aktif.map(p => {
          const nm = p.namaBulan || p.nama_bulan || '';
          const jm = p.jamMulai || p.jam_mulai || '08:00';
          const js = p.jamSelesai || p.jam_selesai || '17:00';
          const mul = formatDate(p.tanggalMulai || p.tanggal_mulai);
          const sel = formatDate(p.tanggalSelesai || p.tanggal_selesai);
          const not = p.notifOperator || p.notif_operator || '';
          return `<div style="border:1.5px solid #a7f3d0;border-radius:10px;overflow:hidden;background:white;box-shadow:0 1px 4px rgba(13,148,136,0.08)">`
            + `<div style="background:linear-gradient(135deg,#0d9488,#06b6d4);padding:8px 14px;color:white;font-weight:700;font-size:13px;display:flex;align-items:center;gap:7px"><span style="opacity:0.9;display:flex">${_svgCal}</span> Periode Aktif: ${nm} ${p.tahun}</div>`
            + `<div style="display:grid;grid-template-columns:1fr 1fr;gap:0">`
            + `<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:#f0fdf9;border-right:1px solid #d1fae5"><span style="color:#0d9488;display:flex;flex-shrink:0">${_svgOpen}</span><div><div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.4px">Dibuka</div><div style="font-size:12px;font-weight:700;color:#0f172a">${mul} ${jm} WITA</div></div></div>`
            + `<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:#fef2f2"><span style="color:#ef4444;display:flex;flex-shrink:0">${_svgClose}</span><div><div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.4px">Ditutup</div><div style="font-size:12px;font-weight:700;color:#0f172a">${sel} ${js} WITA</div></div></div>`
            + `</div>`
            + (not ? `<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 14px;background:#fffbeb;border-top:1px solid #fcd34d"><span style="color:#d97706;display:flex;flex-shrink:0;margin-top:1px">${_svgNotif}</span><div style="font-size:12px;color:#0f172a;line-height:1.5">${not}</div></div>` : '')
            + `</div>`;
        }).join('');
        bannerEl.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px">${items}</div>`;
      }
    }).catch(() => {});
  }
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
        <div style="background:linear-gradient(135deg,#fffbeb,#fef3c7);border:1.5px solid #fcd34d;border-radius:12px;padding:16px 18px;display:flex;align-items:center;gap:14px;box-shadow:0 2px 8px rgba(245,158,11,0.10)">
          <div style="width:42px;height:42px;border-radius:10px;background:#fef9c3;border:1.5px solid #fde68a;display:flex;align-items:center;justify-content:center;flex-shrink:0">
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
  const items = periodeList.map(p => {
    const nm = p.namaBulan || p.nama_bulan || '';
    const thn = p.tahun || '';
    const mulai = formatDate(p.tanggalMulai || p.tanggal_mulai);
    const selesai = formatDate(p.tanggalSelesai || p.tanggal_selesai);
    const jm = p.jamMulai || p.jam_mulai || '08:00';
    const js = p.jamSelesai || p.jam_selesai || '17:00';
    const notif = p.notifOperator || p.notif_operator || '';
    return `<div style="border:1.5px solid #a7f3d0;border-radius:10px;overflow:hidden;background:white;box-shadow:0 1px 4px rgba(13,148,136,0.08)">
      <div style="background:linear-gradient(135deg,#0d9488,#06b6d4);padding:8px 14px;color:white;font-weight:700;font-size:13px;display:flex;align-items:center;gap:7px">
        <span style="opacity:0.9;display:flex">${svgCal}</span>
        Periode Aktif: ${nm} ${thn}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0">
        <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:#f0fdf9;border-right:1px solid #d1fae5">
          <span style="color:#0d9488;display:flex;flex-shrink:0">${svgOpen}</span>
          <div>
            <div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.4px">Dibuka</div>
            <div style="font-size:12px;font-weight:700;color:#0f172a">${mulai} ${jm} WITA</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:#fef2f2">
          <span style="color:#ef4444;display:flex;flex-shrink:0">${svgClose}</span>
          <div>
            <div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.4px">Ditutup</div>
            <div style="font-size:12px;font-weight:700;color:#0f172a">${selesai} ${js} WITA</div>
          </div>
        </div>
      </div>
      ${notif ? `<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 14px;background:#fffbeb;border-top:1px solid #fcd34d"><span style="color:#d97706;display:flex;flex-shrink:0;margin-top:1px">${svgNotif}</span><div style="font-size:12px;color:#0f172a;line-height:1.5">${notif}</div></div>` : ''}
    </div>`;
  }).join('');
  return `<div style="margin-bottom:14px"><div class="card" style="margin:0"><div class="card-header-bar"><span class="card-title" style="display:flex;align-items:center;gap:7px"><span style="color:#0d9488;display:flex">${svgCal}</span> Periode Input Aktif</span></div><div class="card-body"><div style="display:flex;flex-wrap:wrap;justify-content:center;gap:10px">${items}</div></div></div></div>`;
}

function renderKepalasDashboard(el, d) {
  const periodeList = d.periodeAktifList || (d.periodeAktif ? [d.periodeAktif] : []);

  el.innerHTML = `
    <div class="stats-grid">
      ${statCard('orange','pending','Menunggu Verifikasi', d.menunggu)}
      ${statCard('green','check_circle','Sudah Diverifikasi', d.terverifikasi)}
      ${statCard('blue','assignment','Total Usulan PKM Saya', d.total)}
    </div>
    ${renderPeriodeBanner(periodeList)}
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
          <span class="card-title"><span class="material-icons">donut_large</span>Progress PKM Saya</span>
        </div>
        <div class="card-body" style="padding:12px 14px;flex:1" id="kapusStatusSummary">
          <div class="empty-state" style="padding:16px"><span class="material-icons">hourglass_empty</span></div>
        </div>
      </div>
    </div>
    <div class="card" style="margin-top:0">
      <div class="card-header-bar">
        <span class="card-title"><span class="material-icons">history</span>Riwayat Semua Usulan PKM Saya</span>
        <button class="btn btn-secondary btn-sm" onclick="loadPage('verifikasi')"><span class="material-icons">arrow_forward</span>Lihat Semua</button>
      </div>
      <div class="card-body" style="padding:0" id="kapusAllTable"></div>
    </div>`;

  API.getUsulan({ kode_pkm: currentUser.kodePKM, status: 'Menunggu Kepala Puskesmas' }).then(rows => {
    document.getElementById('pendingTable').innerHTML = renderUsulanTable(rows, 'kepala-puskesmas');
  }).catch(() => {});

  API.getUsulan({ kode_pkm: currentUser.kodePKM }).then(rows => {
    // Progress summary
    const elSum = document.getElementById('kapusStatusSummary');
    if (elSum) elSum.innerHTML = renderKapusStatusSummary(rows);
    // Riwayat semua
    const elAll = document.getElementById('kapusAllTable');
    if (elAll) elAll.innerHTML = renderUsulanTable(rows, 'kepala-puskesmas');
  }).catch(() => {});
}

function renderProgramDashboard(el, d) {
  const periodeList = d.periodeAktifList || (d.periodeAktif ? [d.periodeAktif] : []);
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
    <div class="stats-grid">
      ${statCard('orange','pending','Menunggu Verifikasi', d.menunggu)}
      ${statCard('green','check_circle','Sudah Diverifikasi', d.terverifikasi)}
      ${statCard('blue','assignment','Total Ditugaskan', d.total)}
    </div>
    <div class="card" style="border-left:3px solid var(--primary);margin-bottom:14px">
      <div class="card-body" style="padding:10px 16px;display:flex;align-items:center;gap:8px">
        <span class="material-icons" style="color:var(--primary);font-size:18px">info</span>
        ${indikatorInfo}
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:stretch">
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

  // Pastikan master indikator tersedia untuk menampilkan nama
  if (!window.allIndList || !window.allIndList.length) {
    API.getIndikator().then(inds => { window.allIndList = inds; }).catch(() => {});
  }

  API.getUsulan({ status_program: 'Menunggu Pengelola Program,Ditolak,Selesai,Menunggu Admin', email_program: currentUser.email }).then(rows => {
    const pending = rows.filter(u => !u.sudahVerif);
    const done = rows.filter(u => u.sudahVerif);
    document.getElementById('pendingTable').innerHTML = renderUsulanTable(pending, 'program');
    const elDone = document.getElementById('ppDoneTable');
    if (elDone) {
      elDone.innerHTML = done.length
        ? renderUsulanTable(done, 'program')
        : `<div class="empty-state" style="padding:32px"><span class="material-icons">inbox</span><p>Belum ada yang selesai</p></div>`;
    }
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
  return `<div class="stat-card stat-card-v2" style="background:${grad};border:none;padding:0;overflow:hidden;display:flex;flex-direction:column;justify-content:space-between;cursor:default">
    <div style="padding:12px 14px 6px 14px;flex:1;display:flex;flex-direction:column;justify-content:center">
      <div style="font-size:26px;font-weight:900;color:rgba(255,255,255,0.95);line-height:1;font-family:'JetBrains Mono',monospace;letter-spacing:-1px">${value ?? 0}</div>
      ${sub !== null ? `<div style="font-size:10px;color:rgba(255,255,255,0.75);margin-top:2px;font-weight:500">${sub}</div>` : ''}
    </div>
    <div style="padding:6px 14px 9px 14px;display:flex;align-items:center;justify-content:space-between;border-top:1px solid rgba(255,255,255,0.15)">
      <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.9);letter-spacing:0.2px">${label}</div>
      <span class="material-icons" style="font-size:15px;color:rgba(255,255,255,0.6)">${icon}</span>
    </div>
  </div>`;
}

function renderChart(data) {
  if (!data || data.length === 0) return `<div class="empty-state"><p>Belum ada data chart</p></div>`;
  const max = Math.max(...data.map(d => d.total || 0), 1);
  return `<div class="chart-container" style="min-height:120px;padding:8px 0 4px;justify-content:center">${data.map(d => `
    <div class="chart-bar-wrap">
      <div class="chart-bar-val">${d.total}</div>
      <div class="chart-bar" style="height:${Math.max(((d.total || 0) / max) * 90, 4)}px" title="${d.bulan}: ${d.total} usulan"></div>
      <div class="chart-bar-lbl">${d.bulan}</div>
    </div>`).join('')}</div>`;
}

function renderDonutChart(selesai, proses, ditolak) {
  const total = selesai + proses + ditolak;
  if (total === 0) return '';
  // SVG donut: cx=70,cy=70,r=52, stroke-width=18
  const cx = 70, cy = 70, r = 52;
  const circ = 2 * Math.PI * r;
  const pctSelesai = selesai / total;
  const pctProses  = proses  / total;
  const pctDitolak = ditolak / total;
  // Segmen: mulai dari atas (-90deg = -PI/2)
  const seg = (pct) => pct * circ;
  const gap = 2; // px gap antar segmen
  const dSelesai = seg(pctSelesai);
  const dProses  = seg(pctProses);
  const dDitolak = seg(pctDitolak);
  // offset: rotate -90deg = transform rotate(-90 cx cy)
  const offSelesai = 0;
  const offProses  = dSelesai + gap;
  const offDitolak = dSelesai + gap + dProses + gap;
  const segments = [
    { val: selesai, d: dSelesai, off: offSelesai, color: '#10b981', label: 'Selesai' },
    { val: proses,  d: dProses,  off: offProses,  color: '#f59e0b', label: 'Proses' },
    { val: ditolak, d: dDitolak, off: offDitolak, color: '#ef4444', label: 'Ditolak/Draft' },
  ].filter(s => s.val > 0);
  const pct = total > 0 ? Math.round((selesai / total) * 100) : 0;
  const svgSegs = segments.map(s =>
    `<circle cx="${cx}" cy="${cy}" r="${r}"
      fill="none" stroke="${s.color}" stroke-width="18"
      stroke-dasharray="${s.d - gap} ${circ - s.d + gap}"
      stroke-dashoffset="${-(s.off)}"
      transform="rotate(-90 ${cx} ${cy})"
      style="transition:all 0.4s ease"/>`
  ).join('');
  const legend = segments.map(s =>
    `<div style="display:flex;align-items:center;gap:5px;font-size:11px">
      <div style="width:8px;height:8px;border-radius:50%;background:${s.color};flex-shrink:0"></div>
      <span style="color:var(--text-light)">${s.label}</span>
      <span style="font-weight:700;color:var(--text);margin-left:2px">${s.val}</span>
    </div>`
  ).join('');
  return `<div style="display:flex;align-items:center;gap:16px;padding:8px 0 4px">
    <svg width="140" height="140" viewBox="0 0 140 140" style="flex-shrink:0">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e2e8f0" stroke-width="18"/>
      ${svgSegs}
      <text x="${cx}" y="${cy - 6}" text-anchor="middle" font-size="18" font-weight="900"
        fill="var(--text)" font-family="'JetBrains Mono',monospace">${pct}%</text>
      <text x="${cx}" y="${cy + 12}" text-anchor="middle" font-size="9" fill="var(--text-light)"
        font-family="inherit">selesai</text>
    </svg>
    <div style="display:flex;flex-direction:column;gap:8px;flex:1">
      <div style="font-size:11px;font-weight:600;color:var(--text-light);text-transform:uppercase;letter-spacing:0.4px">Total Usulan</div>
      <div style="font-size:28px;font-weight:900;color:var(--text);font-family:'JetBrains Mono',monospace;line-height:1">${total}</div>
      <div style="display:flex;flex-direction:column;gap:6px;margin-top:4px">${legend}</div>
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
      const canPerbaiki = u.statusGlobal === 'Ditolak' && u.ditolakOleh !== 'Admin';
      const perbaikiBtn = canPerbaiki
        ? `<button class="btn-icon" onclick="openIndikatorModal('${u.idUsulan}')" title="Perbaiki & Ajukan Ulang" style="background:transparent;border:none;color:#f59e0b"><span class="material-icons" style="font-size:17px">restart_alt</span></button>`
        : `<button class="btn-icon" disabled title="${u.statusGlobal === 'Menunggu Pengelola Program' ? 'Menunggu respon Pengelola Program' : 'Tidak perlu perbaikan'}" style="background:transparent;border:none;color:#cbd5e1;opacity:0.3;cursor:not-allowed"><span class="material-icons" style="font-size:17px">restart_alt</span></button>`;
      return viewBtn + editBtn + perbaikiBtn + pdfBtnEarly + logBtnEarly;
    }
    // PP dan Admin bisa verif sesuai status global
    const canVerif =
      (role === 'kepala-puskesmas' && u.statusGlobal === 'Menunggu Kepala Puskesmas') ||
      (role === 'program' && u.statusGlobal === 'Menunggu Pengelola Program') ||
      (role === 'admin'   && u.statusGlobal === 'Menunggu Admin');

    // Sudah verifikasi
    const sudahVerifKepala = role === 'kepala-puskesmas' && (u.statusKapus === 'Selesai' || u.statusKapus === 'Ditolak');
    const sudahVerifProgram = role === 'program' && u.sudahVerif === true && (u.myVerifStatus === 'Selesai' || u.myVerifStatus === 'Ditolak');
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
      <td><span style="font-family:'JetBrains Mono',monospace;font-weight:600;font-size:12px;">${u.idUsulan}</span></td>
      <td>${u.namaPKM || u.kodePKM}</td>
      <td>${u.namaBulan || ''} ${u.tahun}</td>
      <td class="rasio-cell" style="font-weight:700;color:var(--primary)">${parseFloat(u.indeksSPM||0).toFixed(2)}</td>
      <td>
        ${statusBadge(u.statusGlobal)}
        ${(role === 'admin' && u.ditolakOleh === 'Admin') ? (() => {
          const sg = u.statusGlobal;
          const nos = (u.penolakanIndikator || []).filter(p => !p.aksi || p.aksi === 'tolak').map(p => `<span style="background:#fecaca;color:#7f1d1d;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:700">#${p.noIndikator}</span>`).join(' ');
          const indBadge = nos ? `<span style="margin-left:4px">${nos}</span>` : '';
          if (sg === 'Menunggu Pengelola Program')
            return `<div style="margin-top:4px;background:#fff7ed;border:1px solid #fed7aa;border-radius:5px;padding:3px 7px"><div style="display:inline-flex;align-items:center;gap:4px"><span class="material-icons" style="font-size:12px;color:#ea580c">replay</span><span style="font-size:10.5px;color:#c2410c;font-weight:600">Re-verifikasi PP</span>${indBadge}</div></div>`;
          if (sg === 'Menunggu Kepala Puskesmas')
            return `<div style="margin-top:4px;background:#fef9c3;border:1px solid #fde047;border-radius:5px;padding:3px 7px"><div style="display:inline-flex;align-items:center;gap:4px"><span class="material-icons" style="font-size:12px;color:#ca8a04">replay</span><span style="font-size:10.5px;color:#92400e;font-weight:600">Re-verifikasi Kapus</span>${indBadge}</div></div>`;
          if (sg === 'Menunggu Admin') {
            return `<div style="margin-top:4px;background:#eff6ff;border:1px solid #93c5fd;border-radius:5px;padding:3px 7px"><div style="display:inline-flex;align-items:center;gap:4px"><span class="material-icons" style="font-size:12px;color:#2563eb">assignment_return</span><span style="font-size:10.5px;color:#1d4ed8;font-weight:600">Kembali setelah re-verifikasi</span>${indBadge}</div></div>`;
          }
          return '';
        })() : ''}
        ${(role === 'program' && u.penolakanIndikator && u.penolakanIndikator.length && u.statusGlobal === 'Ditolak') ? `
          <div style="margin-top:4px;display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap;background:#fef2f2;border:1px solid #fca5a5;border-radius:5px;padding:2px 7px">
            <span class="material-icons" style="font-size:12px;color:#dc2626">cancel</span>
            <span style="font-size:10.5px;color:#dc2626;font-weight:600">Indikator bermasalah:</span>
            ${(() => {
              const myAkses = currentUser.indikatorAkses || [];
              const aktif = u.penolakanIndikator.filter(p => !p.aksi || p.aksi === 'tolak');
              const filtered = myAkses.length > 0 ? aktif.filter(p => myAkses.includes(parseInt(p.noIndikator))) : aktif;
              return filtered.map(p => `<span style="background:#fecaca;color:#7f1d1d;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:700">#${p.noIndikator}</span>`).join('');
            })()}
          </div>` : ''}
        ${(role === 'program' && u.penolakanIndikator && u.penolakanIndikator.length && u.statusGlobal === 'Menunggu Pengelola Program' && !u.sudahVerif) ? `
          <div style="margin-top:4px;display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap;background:#fef2f2;border:1px solid #fca5a5;border-radius:5px;padding:2px 7px">
            <span class="material-icons" style="font-size:12px;color:#dc2626">replay</span>
            <span style="font-size:10.5px;color:#dc2626;font-weight:600">Perlu re-verifikasi:</span>
            ${(() => {
              const myAkses = currentUser.indikatorAkses || [];
              const aktif = u.penolakanIndikator.filter(p => !p.aksi || p.aksi === 'tolak');
              const filtered = myAkses.length > 0 ? aktif.filter(p => myAkses.includes(parseInt(p.noIndikator))) : aktif;
              return filtered.map(p => `<span style="background:#fecaca;color:#7f1d1d;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:700">#${p.noIndikator}</span>`).join('');
            })()}
          </div>` : ''}
        ${(role === 'operator' && u.statusGlobal === 'Ditolak' && u.ditolakOleh) ? `
          <div style="margin-top:4px;display:inline-flex;align-items:center;gap:5px;flex-wrap:wrap;background:#fef2f2;border:1px solid #fca5a5;border-radius:5px;padding:2px 7px">
            <span class="material-icons" style="font-size:12px;color:#dc2626">cancel</span>
            <span style="font-size:10.5px;color:#dc2626;font-weight:600">Ditolak oleh ${u.ditolakOleh}</span>
            ${(u.penolakanIndikator||[]).filter(p=>!p.aksi||p.aksi==='tolak').map(p=>`<span style="background:#fecaca;color:#7f1d1d;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:700">#${p.noIndikator}</span>`).join('')}
          </div>` : ''}
        ${(role === 'operator' && u.statusGlobal !== 'Ditolak' && u.ditolakOleh && ['Menunggu Kepala Puskesmas','Menunggu Pengelola Program','Menunggu Admin'].includes(u.statusGlobal) && u.penolakanIndikator && u.penolakanIndikator.length) ? `
          <div style="margin-top:4px;display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap;background:#fef9c3;border:1px solid #fde047;border-radius:5px;padding:2px 7px">
            <span class="material-icons" style="font-size:12px;color:#ca8a04">replay</span>
            <span style="font-size:10.5px;color:#92400e;font-weight:600">Re-verifikasi berlangsung</span>
            <span style="font-size:10px;color:#78350f;background:#fde68a;border-radius:3px;padding:1px 5px">${
              u.statusGlobal === 'Menunggu Kepala Puskesmas' ? '→ Kepala Puskesmas' :
              u.statusGlobal === 'Menunggu Pengelola Program' ? '→ Pengelola Program' :
              u.statusGlobal === 'Menunggu Admin' ? '→ Admin' : ''
            }</span>
            ${u.penolakanIndikator.filter(p => !p.aksi || p.aksi === 'tolak').map(p => `<span style="background:#fecaca;color:#7f1d1d;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:700">#${p.noIndikator}</span>`).join('')}
          </div>` : ''}
        ${(role === 'kepala-puskesmas' && u.ditolakOleh === 'Pengelola Program' && u.penolakanIndikator && u.penolakanIndikator.length) ? `
          <div style="margin-top:4px;display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap;background:#fef2f2;border:1px solid #fca5a5;border-radius:5px;padding:2px 7px">
            <span class="material-icons" style="font-size:12px;color:#dc2626">replay</span>
            <span style="font-size:10.5px;color:#dc2626;font-weight:600">Perlu re-verifikasi:</span>
            ${u.penolakanIndikator.filter(p => !p.aksi || p.aksi === 'tolak').map(p => `<span style="background:#fecaca;color:#7f1d1d;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:700">#${p.noIndikator}</span>`).join('')}
          </div>` : ''}
        ${(role === 'kepala-puskesmas' && u.statusGlobal === 'Menunggu Kepala Puskesmas' && u.ditolakOleh === 'Kepala Puskesmas') ? `
          <div style="margin-top:4px;display:inline-flex;align-items:center;gap:4px;background:#fef9c3;border:1px solid #fde047;border-radius:5px;padding:2px 7px">
            <span class="material-icons" style="font-size:12px;color:#ca8a04">replay</span>
            <span style="font-size:10.5px;color:#92400e;font-weight:600">Re-submit dari Operator</span>
          </div>` : ''}
      </td>
      <td style="font-size:12px;color:var(--text-light)">${formatDateTime(u.createdAt)}</td>
      <td>${actionBtn(u)}</td>
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

// ============== INPUT USULAN (OPERATOR) ==============
async function renderInput() {
  // Guard: hanya Operator yang bisa input usulan
  if (currentUser && currentUser.role === 'Kepala Puskesmas') {
    document.getElementById('mainContent').innerHTML = `<div class="empty-state"><span class="material-icons" style="font-size:48px;color:var(--text-xlight)">block</span><p>Kepala Puskesmas tidak memiliki akses untuk input usulan.</p></div>`;
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

  // Info banner periode - tampilkan semua periode aktif (sama seperti dashboard)
  const _bSvgCal  = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
  const _bSvgOpen = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
  const _bSvgClos = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
  const _bSvgNoti = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>';
  const _bSvgWarn = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
  let periodeBanner = '';
  if (periodeOptions.length > 0) {
    const items = periodeOptions.map(pr => {
      const nm  = pr.namaBulan || pr.nama_bulan || '';
      const jm  = pr.jamMulai  || pr.jam_mulai  || '08:00';
      const js  = pr.jamSelesai|| pr.jam_selesai|| '17:00';
      const mul = formatDate(pr.tanggalMulai  || pr.tanggal_mulai);
      const sel = formatDate(pr.tanggalSelesai|| pr.tanggal_selesai);
      const not = pr.notifOperator || pr.notif_operator || '';
      return `<div style="border:1.5px solid #a7f3d0;border-radius:10px;overflow:hidden;background:white;box-shadow:0 1px 4px rgba(13,148,136,0.08)">`
        + `<div style="background:linear-gradient(135deg,#0d9488,#06b6d4);padding:8px 14px;color:white;font-weight:700;font-size:13px;display:flex;align-items:center;gap:7px"><span style="opacity:0.9;display:flex">${_bSvgCal}</span> Periode Aktif: ${nm} ${pr.tahun}</div>`
        + `<div style="display:grid;grid-template-columns:1fr 1fr">`
        + `<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:#f0fdf9;border-right:1px solid #d1fae5"><span style="color:#0d9488;display:flex;flex-shrink:0">${_bSvgOpen}</span><div><div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.4px">Dibuka</div><div style="font-size:12px;font-weight:700;color:#0f172a">${mul} ${jm} WITA</div></div></div>`
        + `<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:#fef2f2"><span style="color:#ef4444;display:flex;flex-shrink:0">${_bSvgClos}</span><div><div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.4px">Ditutup</div><div style="font-size:12px;font-weight:700;color:#0f172a">${sel} ${js} WITA</div></div></div>`
        + `</div>`
        + (not ? `<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 14px;background:#fffbeb;border-top:1px solid #fcd34d"><span style="color:#d97706;display:flex;flex-shrink:0;margin-top:1px">${_bSvgNoti}</span><div style="font-size:12px;color:#0f172a;line-height:1.5">${not}</div></div>` : '')
        + `</div>`;
    }).join('');
    periodeBanner = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px;margin-bottom:4px">${items}</div>`;
  } else {
    periodeBanner = `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px;margin-bottom:4px">
        <div style="background:linear-gradient(135deg,#fffbeb,#fef3c7);border:1.5px solid #fcd34d;border-radius:12px;padding:16px 18px;display:flex;align-items:center;gap:14px;box-shadow:0 2px 8px rgba(245,158,11,0.10)">
          <div style="width:42px;height:42px;border-radius:10px;background:#fef9c3;border:1.5px solid #fde68a;display:flex;align-items:center;justify-content:center;flex-shrink:0">
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

  const noPeriode = periodeOptions.length === 0;

  document.getElementById('mainContent').innerHTML = `
    <div class="page-header">
      <h1 style="display:flex;align-items:center;gap:8px"><span style="color:#0d9488;display:flex"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span>Input Usulan Baru</h1>
    </div>
    ${periodeBanner}
    <div class="card">
      <div class="card-header-bar"><span class="card-title"><span class="material-icons">add_circle</span>Buat Usulan</span></div>
      <div class="card-body">
        <div class="form-row">
          <div class="form-group"><label>Puskesmas</label>${pkmSelect}</div>
          <div class="form-group"><label>Tahun</label>
            <select class="form-control" id="inputTahun" onchange="updateBulanOptions()" ${noPeriode ? 'disabled' : ''} style="${noPeriode ? 'opacity:0.5;cursor:not-allowed;background:#f1f5f9' : ''}">
              ${tahunAktif.length ? tahunSelectHtml : `<option value="${defaultTahun}">${defaultTahun}</option>`}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Bulan</label><select class="form-control" id="inputBulan" ${noPeriode ? 'disabled' : ''} style="${noPeriode ? 'opacity:0.5;cursor:not-allowed;background:#f1f5f9' : ''}"></select></div>
        </div>
        <div style="display:flex;justify-content:flex-end;">
          <button class="btn btn-primary" onclick="createUsulan()" ${noPeriode ? 'disabled' : ''} style="${noPeriode ? 'opacity:0.5;cursor:not-allowed' : ''}">
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
  // Fetch usulan yang sudah ada untuk filter bulan
  try {
    const existingUsulan = await API.getUsulan({ email_operator: currentUser.email }).catch(() => []);
    window._existingUsulanBulan = (existingUsulan || []).map(u => ({ tahun: u.tahun, bulan: u.bulan }));
  } catch(e) { window._existingUsulanBulan = []; }
  setTimeout(() => updateBulanOptions(), 50);
  loadMyUsulan();
}

function updateBulanOptions() {
  const tahun = parseInt(document.getElementById('inputTahun')?.value);
  const sel = document.getElementById('inputBulan');
  if (!sel) return;
  const periodeOptions = window._periodeInputAktif || [];
  const sudahAda = (window._existingUsulanBulan || [])
    .filter(u => u.tahun == tahun)
    .map(u => parseInt(u.bulan));
  const bulanForTahun = periodeOptions.filter(p => p.tahun == tahun);
  const bulanList = bulanForTahun.length
    ? bulanForTahun
    : BULAN_NAMA.slice(1).map((m, i) => ({ bulan: i + 1, namaBulan: m }));
  const available = bulanList.filter(p => !sudahAda.includes(parseInt(p.bulan)));
  if (available.length === 0) {
    sel.innerHTML = `<option value="">— Semua bulan sudah memiliki usulan —</option>`;
    sel.disabled = true;
    const btnBuat = document.querySelector('button[onclick="createUsulan()"]');
    if (btnBuat) { btnBuat.disabled = true; btnBuat.style.opacity = '0.5'; btnBuat.style.cursor = 'not-allowed'; }
  } else {
    sel.disabled = false;
    sel.innerHTML = available.map(p => `<option value="${p.bulan}">${p.namaBulan || BULAN_NAMA[p.bulan]}</option>`).join('');
    const btnBuat = document.querySelector('button[onclick="createUsulan()"]');
    if (btnBuat) { btnBuat.disabled = false; btnBuat.style.opacity = ''; btnBuat.style.cursor = ''; }
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
            ${u.statusGlobal === 'Ditolak' ? `
              <div style="margin-top:6px;background:#fef2f2;border:1px solid #fca5a5;border-radius:7px;padding:7px 10px">
                <div style="font-size:11.5px;font-weight:700;color:#dc2626;margin-bottom:3px;display:flex;align-items:center;gap:4px">
                  <span class="material-icons" style="font-size:13px">cancel</span>
                  Ditolak oleh ${u.ditolakOleh || 'Verifikator'}
                </div>
                ${u.alasanTolak ? `<div style="font-size:11px;color:#7f1d1d;margin-bottom:4px"><span style="font-weight:600">Alasan:</span> ${u.alasanTolak}</div>` : ''}
                ${(u.ditolakOleh === 'Pengelola Program' && u.penolakanIndikator && u.penolakanIndikator.filter(p => p.aksi === 'tolak').length) ? `
                  <div style="font-size:11px;font-weight:700;color:#b91c1c;margin-bottom:3px">Indikator perlu diperbaiki:</div>
                  <div style="display:flex;flex-wrap:wrap;gap:4px 8px">${u.penolakanIndikator.filter(p => p.aksi === 'tolak').map(p => `<span style="display:inline-flex;align-items:center;gap:4px;white-space:nowrap"><span style="background:#fecaca;color:#7f1d1d;border-radius:4px;padding:1px 6px;font-size:11px;font-weight:700">#${p.noIndikator}</span><span style="font-size:11px;color:#7f1d1d">${p.alasan}</span></span>`).join('')}</div>` : ''}
              </div>` : ''}
          </td>
          <td>
            <button class="btn-icon view" onclick="viewDetail('${u.idUsulan}')"><span class="material-icons">visibility</span></button>
            ${getDownloadBtn(u, 20, 'operator')}
            <button class="btn-icon" onclick="openLogAktivitas('${u.idUsulan}')" title="Riwayat Aktivitas" style="background:transparent;border:none;color:#64748b"><span class="material-icons" style="font-size:18px">history</span></button>
            ${u.statusGlobal === 'Draft' ? `<button class="btn-icon edit" onclick="openIndikatorModal('${u.idUsulan}')"><span class="material-icons">edit</span></button>` : ''}
            ${u.statusGlobal === 'Draft' ? `<button class="btn-icon del" onclick="deleteUsulan('${u.idUsulan}')"><span class="material-icons">delete</span></button>` : ''}
            ${(u.statusGlobal === 'Ditolak' && u.ditolakOleh !== 'Admin')
              ? `<button class="btn-icon" onclick="openIndikatorModal('${u.idUsulan}')" title="Perbaiki & Ajukan Ulang" style="background:transparent;border:none;color:#f59e0b"><span class="material-icons" style="font-size:17px">restart_alt</span></button>`
              : `<button class="btn-icon" disabled title="${u.statusGlobal === 'Menunggu Pengelola Program' || u.ditolakOleh === 'Admin' ? 'Menunggu respon Pengelola Program' : 'Tidak perlu perbaikan'}" style="background:transparent;border:none;color:#cbd5e1;opacity:0.3;cursor:not-allowed"><span class="material-icons" style="font-size:17px">restart_alt</span></button>`}
          </td>
        </tr>`).join('')}
        </tbody>
      </table></div>` : `<div class="empty-state" style="padding:32px"><span class="material-icons">inbox</span><p>Belum ada usulan</p></div>`;
  } catch (e) { if (!window._verifSilentReload) toast(e.message, 'error'); }
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
    // Cek rentang tanggal dan jam hari ini dalam WITA (UTC+8), konsisten dengan validasi server
    const nowWita = new Date(new Date().getTime() + 8 * 60 * 60000);
    const todayWitaStr = nowWita.toISOString().slice(0, 10); // "YYYY-MM-DD"
    if (periodeValid.tanggalMulai && periodeValid.tanggalSelesai) {
      const mulaiStr   = periodeValid.tanggalMulai.toString().slice(0, 10);
      const selesaiStr = periodeValid.tanggalSelesai.toString().slice(0, 10);
      if (todayWitaStr < mulaiStr) {
        toast(`Periode ${namaBulanTxt} ${tahun} belum dibuka. Mulai input: ${formatDate(periodeValid.tanggalMulai)}`, 'warning');
        return;
      }
      if (todayWitaStr > selesaiStr) {
        toast(`Periode ${namaBulanTxt} ${tahun} sudah ditutup pada ${formatDate(periodeValid.tanggalSelesai)}. Hubungi Admin.`, 'warning');
        return;
      }
      // Validasi jam dinonaktifkan — cukup validasi tanggal
    }
  }

  // Cek duplikat di sisi client
  const existingList = await API.getUsulan({ email_operator: currentUser.email }).catch(() => []);
  const duplikat = existingList.find(u => u.tahun == tahun && u.bulan == bulan && u.kodePKM === kodePKM);
  if (duplikat) {
    toast(`❌ Tidak dapat membuat usulan! Anda sudah memiliki usulan untuk ${namaBulanTxt} ${tahun} (ID: ${duplikat.idUsulan}). Hanya boleh 1 usulan per periode aktif.`, 'error');
    return;
  }

  setLoading(true);
  try {
    const result = await API.buatUsulan({ kodePKM, tahun, bulan, emailOperator: currentUser.email });
    toast(`Usulan ${result.idUsulan} berhasil dibuat! Silakan isi data indikator.`, 'success');
    // Update cache bulan yang sudah ada, lalu refresh dropdown
    window._existingUsulanBulan = [...(window._existingUsulanBulan || []), { tahun, bulan }];
    updateBulanOptions();
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
  // === PROTEKSI PERIODE: cek apakah periode masih aktif sebelum buka modal ===
  // Hanya berlaku untuk Operator (yang input data), bukan verifikasi
  if (currentUser && currentUser.role === 'Operator') {
    // Re-fetch periode untuk memastikan data terkini (bukan cache lama)
    try {
      const freshPeriode = await API.get('periode');
      window._periodeAktifList = Array.isArray(freshPeriode) ? freshPeriode : [];
    } catch(e) {}
    const periodeAktif = (window._periodeAktifList || []).filter(p => p.isAktifToday);
    if (periodeAktif.length === 0) {
      // Tutup paksa jika modal sudah terbuka, rebuild sidebar lalu tampilkan banner
      closeModal('indikatorModal');
      buildSidebar();
      showPeriodeTutupBanner();
      toast('Periode input telah ditutup. Anda tidak dapat mengubah usulan saat ini.', 'error');
      return;
    }
  }
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
    // Tampilkan banner status (hanya saat read-only, bukan saat Ditolak)
    const _ln = document.getElementById('indModalLockNotif');
    if (_ln) {
      if (isDitolak) {
        _ln.style.display = 'none';
        _ln.innerHTML = '';
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

    // Tampilkan form catatan sanggahan operator ke Kapus saat ditolak Kapus
    const _opCatatanWrap = document.getElementById('operatorCatatanWrap');
    if (_opCatatanWrap) {
      const showOpCatatan = isDitolak && detail.ditolakOleh === 'Kepala Puskesmas';
      _opCatatanWrap.style.display = showOpCatatan ? 'block' : 'none';
      if (!showOpCatatan) {
        const inp = document.getElementById('operatorCatatanInput');
        if (inp) inp.value = '';
      }
    }

    // Sembunyikan info card - tidak diperlukan lagi
    const infoEl = document.getElementById('indModalInfo');
    if (infoEl) infoEl.style.display = 'none';

    // Update SPM top display
    const spmTopEl = document.getElementById('indModalSPMTop');
    if (spmTopEl) spmTopEl.textContent = parseFloat(detail.indeksSPM).toFixed(2);

    // === FILTER: saat Ditolak, hanya tampilkan indikator bermasalah ===
    let displayInds = inds;
    let bermasalahNos = [];
    const alasanMap = {}; // no_indikator → alasan

    if (isDitolak) {
      const penolakanList = detail.penolakanIndikator || [];

      if (penolakanList.length > 0) {
        // PP atau Admin — data ada di tabel penolakan_indikator
        penolakanList.forEach(p => {
          const no = parseInt(p.no_indikator);
          bermasalahNos.push(no);
          alasanMap[no] = p.alasan || '-';
        });
      } else {
        // Kapus — parse dari kapus_catatan format: "#1: alasan | #6: alasan"
        const catatan = detail.kapusCatatan || detail.alasanTolak || '';
        catatan.split('|').forEach(part => {
          const m = part.trim().match(/#(\d+):\s*(.+)/);
          if (m) {
            const no = parseInt(m[1]);
            bermasalahNos.push(no);
            alasanMap[no] = m[2].trim();
          }
        });
      }

      // Filter inds — hanya yang nomornya masuk daftar bermasalah
      if (bermasalahNos.length > 0) {
        displayInds = inds.filter(i => bermasalahNos.includes(parseInt(i.no)));
      }

      // Banner alasan penolakan dari verifikator level atas
      renderPenolakanBanner('indModalPenolakanBanner', detail.ditolakOleh || 'Verifikator',
        Object.entries(alasanMap).map(([no, alasan]) => ({ no: parseInt(no), alasan }))
      );
      // Thread catatan riwayat
      renderCatatanThread('indCatatanThread', idUsulan, 'Operator');

    } else {
      // Tidak ditolak — sembunyikan banner dan thread
      const _pb = document.getElementById('indModalPenolakanBanner');
      if (_pb) { _pb.style.display = 'none'; _pb.innerHTML = ''; }
      const _ct = document.getElementById('indCatatanThread');
      if (_ct) { _ct.style.display = 'none'; _ct.innerHTML = ''; }
    }

    if (displayInds.length === 0) {
      document.getElementById('indikatorInputBody').innerHTML = `<tr><td colspan="8"><div class="empty-state" style="padding:30px"><span class="material-icons" style="color:#0d9488">check_circle</span><p style="color:#0d9488;font-weight:600">Semua indikator sudah disetujui</p></div></td></tr>`;
    } else {
    document.getElementById('indikatorInputBody').innerHTML = displayInds.map(ind => {
      const hasBukti = !!ind.linkFile;
      const uploadBtnStyle = hasBukti
        ? 'display:inline-flex;align-items:center;gap:3px;padding:4px 9px;background:#0d9488;color:white;border-radius:6px;cursor:pointer;font-size:11.5px;font-weight:600;border:1.5px solid #0d9488;white-space:nowrap'
        : 'display:inline-flex;align-items:center;gap:3px;padding:4px 9px;background:#ef4444;color:white;border-radius:6px;cursor:pointer;font-size:11.5px;font-weight:600;border:1.5px solid #ef4444;white-space:nowrap';
      const _sisaTgt = ind.sasaranTahunan > 0 ? Math.max(0, ind.sasaranTahunan - ind.realisasiKumulatif) : null;
      const _sisaColor = _sisaTgt !== null && _sisaTgt === 0 ? '#16a34a' : (_sisaTgt !== null && _sisaTgt < 10 ? '#f59e0b' : '#1e293b');
      return `<tr id="indRow-${ind.no}">
        <td><span style="font-family:'JetBrains Mono';font-weight:700">${ind.no}</span></td>
        <td style="max-width:220px;font-size:12.5px">${ind.nama}</td>
        <input type="hidden" id="bobot-${ind.no}" value="${ind.bobot}">
        <td style="text-align:center;font-size:12.5px;color:#475569">${ind.sasaranTahunan > 0 ? ind.sasaranTahunan : '<span style="color:#cbd5e1">-</span>'}</td>
        <td style="text-align:center">
          ${isLocked ? `<span>${ind.target}</span>` : `<input type="number" id="t-${ind.no}" value="${ind.target}" min="0" step="1"
            style="width:72px;border:1.5px solid var(--border);border-radius:6px;padding:3px 6px;font-size:13px;text-align:center"
            title="Target sasaran layanan (bilangan bulat)"
            onchange="saveIndikator(${ind.no})" oninput="previewSPM(${ind.no})"
            onkeypress="return event.charCode>=48&&event.charCode<=57">`}
        </td>
        <td style="text-align:center">
          ${isLocked ? `<span>${ind.capaian}</span>` : `<input type="number" id="c-${ind.no}" value="${ind.capaian}" min="0" step="1"
            style="width:72px;border:1.5px solid var(--border);border-radius:6px;padding:3px 6px;font-size:13px;text-align:center"
            title="Realisasi layanan (bilangan bulat, tidak boleh melebihi target)"
            onchange="saveIndikator(${ind.no})" oninput="clampRealisasi(${ind.no})"
            onkeypress="return event.charCode>=48&&event.charCode<=57">`}
        </td>
        <td style="width:90px;text-align:center">
          <span id="cap-${ind.no}" style="font-weight:700;font-size:13px;color:#1e293b">
            ${fmtCapaianPct(ind.capaian, ind.target)}
          </span>
        </td>
        <td style="text-align:center;font-size:12.5px;font-weight:700;color:${_sisaColor}">${_sisaTgt !== null ? _sisaTgt : '<span style="color:#cbd5e1">-</span>'}</td>
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
                  ${normLinks.map((_, fi) => `<button onclick="hapusBukti('${idUsulan}',${ind.no},${fi})" title="Hapus file ${fi+1}" style="background:none;border:none;cursor:pointer;padding:3px 4px;border-radius:5px;display:flex;align-items:center;color:#ef4444" onmouseover="this.style.background='rgba(239,68,68,0.08)'" onmouseout="this.style.background='none'">${SVG_TRASH}${normLinks.length > 1 ? `<span style="font-size:9px;margin-left:1px">${fi+1}</span>` : ''}</button>`).join('')}
                </div>`
              : '';
            return `<div id="uploadCell-${ind.no}" style="display:flex;align-items:center;gap:6px;justify-content:center">
                <label id="uploadLabel-${ind.no}" style="${btnStyle}">
                  ${hasFiles ? 'Uploaded' : 'Upload'}
                  <input type="file" multiple accept=".pdf,image/*" style="display:none" onchange="uploadBuktiIndikator(event,${ind.no},'${idUsulan}','${detail.kodePKM}',${detail.tahun},${detail.bulan},'${namaBulan}')">
                </label>
                <div id="fileControls-${ind.no}">${fileControlHtml}</div>
              </div>
              <div style="font-size:10px;color:#94a3b8;margin-top:3px;text-align:center;line-height:1.3">PDF / Gambar</div>`;
          })()}
        </td>
      </tr>`;
    }).join('');
    } // end else displayInds.length > 0
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

  // Validasi: hanya PDF dan gambar
  const invalidFiles = files.filter(f => {
    const t = f.type;
    const n = f.name.toLowerCase();
    return !(t === 'application/pdf' || t.startsWith('image/') || n.endsWith('.pdf'));
  });
  if (invalidFiles.length > 0) {
    toast(`Hanya PDF dan gambar yang diizinkan. File ditolak: ${invalidFiles.map(f => f.name).join(', ')}`, 'error');
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

    const tVal = parseFloat(document.getElementById(`t-${noIndikator}`)?.value) || 0;
    const cVal = parseFloat(document.getElementById(`c-${noIndikator}`)?.value) || 0;
    await API.updateIndikatorUsulan({ idUsulan, noIndikator, target: tVal, capaian: cVal, linkFile: linkToSave });

    statusDiv.remove();

    // Update fileControls
    window[`_buktiLinks_${noIndikator}`] = { links: allLinks, idUsulan };
    const controls = document.getElementById(`fileControls-${noIndikator}`);
    if (controls) {
      if (allLinks.length > 0) {
        controls.innerHTML = '<div style="display:flex;align-items:center;gap:1px">'
          + '<button onclick="openBuktiModal(' + noIndikator + ',0)" title="Preview" style="background:none;border:none;cursor:pointer;padding:2px 4px;border-radius:5px;display:flex;align-items:center;color:#0d9488"><span class="material-icons" style="font-size:16px">visibility</span></button>'
          + allLinks.map((_, fi) => '<button onclick="hapusBukti(\'' + idUsulan + '\',' + noIndikator + ',' + fi + ')" title="Hapus file ' + (fi+1) + '" style="background:none;border:none;cursor:pointer;padding:3px 4px;border-radius:5px;display:flex;align-items:center;color:#ef4444">' + SVG_TRASH + (allLinks.length > 1 ? '<span style="font-size:9px;margin-left:1px">' + (fi+1) + '</span>' : '') + '</button>').join('')
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
  // Tutup modal preview jika sedang terbuka
  const previewModal = document.getElementById('previewBuktiModal');
  if (previewModal) previewModal.classList.remove('show');

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

        links.splice(fileIndex, 1);
        const newLinkFile = links.length ? JSON.stringify(links) : '';
        const tVal = parseFloat(document.getElementById(`t-${noIndikator}`)?.value) || 0;
        const cVal = parseFloat(document.getElementById(`c-${noIndikator}`)?.value) || 0;
        await API.updateIndikatorUsulan({ idUsulan, noIndikator, target: tVal, capaian: cVal, linkFile: newLinkFile });

        toast('File berhasil dihapus', 'success');

        // Refresh fileControls
        window[`_buktiLinks_${noIndikator}`] = { links, idUsulan };
        const ctrl = document.getElementById(`fileControls-${noIndikator}`);
        if (ctrl) {
          if (links.length > 0) {
            ctrl.innerHTML = '<div style="display:flex;align-items:center;gap:1px">'
              + '<button onclick="openBuktiModal(' + noIndikator + ',0)" title="Preview" style="background:none;border:none;cursor:pointer;padding:2px 4px;border-radius:5px;display:flex;align-items:center;color:#0d9488"><span class="material-icons" style="font-size:16px">visibility</span></button>'
              + links.map((_, fi) => '<button onclick="hapusBukti(\'' + idUsulan + '\',' + noIndikator + ',' + fi + ')" title="Hapus file ' + (fi+1) + '" style="background:none;border:none;cursor:pointer;padding:3px 4px;border-radius:5px;display:flex;align-items:center;color:#ef4444">' + SVG_TRASH + (links.length > 1 ? '<span style="font-size:9px;margin-left:1px">' + (fi+1) + '</span>' : '') + '</button>').join('')
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

  // Routing semua akses file melalui sign-url proxy (Netlify function)
  // agar CORS dan Content-Type ditangani dengan benar
  const _signBase = '/.netlify/functions/sign-url';
  const proxyUrl = `${_signBase}?url=${encodeURIComponent(f.url)}&name=${encodeURIComponent(fileName)}&mode=preview`;
  const proxyDownloadUrl = `${_signBase}?url=${encodeURIComponent(f.url)}&name=${encodeURIComponent(fileName)}&mode=download`;

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
          ${idUsulan ? `<button onclick="hapusBukti('${idUsulan}',${noIndikator},${idx})" title="Hapus file" style="background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.3);padding:5px 10px;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center">${svgTrashM}</button>` : ''}
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

  // Untuk non-image: embed langsung pakai proxyUrl (sign-url set Content-Type yang benar)
  if (!isImage) {
    (async () => {
      const el = document.getElementById(previewId);
      if (!el) return;
      try {
        if (isPDF) {
          // Render PDF pakai PDF.js (pdfjs-dist CDN) — bebas dari IDM intercept
          // karena tidak ada fetch/download ke URL eksternal, semua dirender via canvas
          el.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;color:#94a3b8">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="animation:spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            <span style="font-size:13px">Memuat PDF...</span>
          </div>`;
          await _renderPDFjs(el, proxyUrl, idx);
        } else if (isOffice) {
          // Office: pakai Google Docs Viewer sebagai fallback yang lebih reliable
          const googleViewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(proxyDownloadUrl)}&embedded=true`;
          el.innerHTML = `<iframe src="${googleViewerUrl}" style="width:100%;height:100%;border:none" onload="this.style.opacity=1" style="opacity:0;transition:opacity 0.3s"></iframe>`;
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
          <div style="font-size:11px;color:#64748b;margin-bottom:28px">${ext.toUpperCase()} &bull; Gagal memuat preview</div>
          <button onclick="downloadBukti(${idx})" style="background:#0d9488;color:white;padding:12px 32px;border-radius:8px;border:none;font-weight:600;font-size:14px;cursor:pointer;display:inline-flex;align-items:center;gap:8px"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download</button>
        </div>`;
      }
    })();
  }
}


async function _renderPDFjs(container, url, idx) {
  const SVG_DL = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
  const btnDl = `<button onclick="downloadBukti(${idx})" style="background:#0d9488;color:white;padding:10px 28px;border-radius:8px;border:none;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:8px">${SVG_DL} Download File</button>`;

  // Load PDF.js dari CDN jika belum ada
  if (!window.pdfjsLib) {
    try {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    } catch(e) {
      _showPDFFallback(container, 'Gagal memuat PDF.js library', btnDl);
      return;
    }
  }

  // Coba XHR dengan header custom (bypass IDM)
  let buf = null;
  try {
    buf = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.responseType = 'arraybuffer';
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
      xhr.onload = () => {
        if (xhr.status === 200 && xhr.response && xhr.response.byteLength > 0) {
          resolve(xhr.response);
        } else {
          reject(new Error('empty:' + xhr.status));
        }
      };
      xhr.onerror = () => reject(new Error('network'));
      xhr.send();
    });
  } catch(e) {
    // XHR gagal/kosong → tampilkan fallback download
    _showPDFFallback(container, null, btnDl);
    return;
  }

  try {
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const totalPages = pdf.numPages;

    container.innerHTML = `<div id="pdfScroll_${idx}" style="width:100%;height:100%;overflow-y:auto;overflow-x:hidden;background:#3a3a3a;padding:12px 0"></div>`;
    const scroll = document.getElementById('pdfScroll_' + idx);

    for (let p = 1; p <= totalPages; p++) {
      const page = await pdf.getPage(p);
      const containerW = scroll.clientWidth || 620;
      const baseVp = page.getViewport({ scale: 1 });
      const scale = Math.min(2.0, (containerW - 32) / baseVp.width);
      const vp = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width  = vp.width;
      canvas.height = vp.height;
      canvas.style.cssText = 'display:block;margin:0 auto 10px;max-width:calc(100% - 24px);box-shadow:0 2px 12px rgba(0,0,0,0.5);border-radius:2px;background:white';
      scroll.appendChild(canvas);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    }
  } catch(e) {
    _showPDFFallback(container, e.message, btnDl);
  }
}

function _showPDFFallback(container, errMsg, btnDl) {
  const SVG_PDF = `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`;
  const SVG_INFO = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
  container.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:14px;padding:32px;text-align:center">
      ${SVG_PDF}
      <div style="color:white;font-size:15px;font-weight:600">Preview tidak tersedia</div>
      ${errMsg ? `<div style="color:#64748b;font-size:11px;max-width:260px">${errMsg}</div>` : ''}
      ${btnDl}
      <div style="margin-top:8px;padding:10px 14px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;max-width:300px">
        <div style="display:flex;align-items:center;gap:6px;color:#94a3b8;font-size:11px;margin-bottom:6px;font-weight:600">
          ${SVG_INFO} Tips: Aktifkan preview PDF
        </div>
        <div style="color:#64748b;font-size:11px;line-height:1.7;text-align:left">
          Jika menggunakan <b style="color:#94a3b8">IDM</b>, buka:<br>
          IDM → Options → General → uncheck <i>"Monitor Chromium based browsers"</i><br>
          atau tekan <b style="color:#94a3b8">Ctrl+Alt+I</b> untuk toggle IDM.
        </div>
      </div>
    </div>`;
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

  // Routing download melalui sign-url proxy agar Content-Disposition dan CORS benar
  const downloadProxyUrl = `/.netlify/functions/sign-url?url=${encodeURIComponent(f.url)}&name=${encodeURIComponent(fileName)}&mode=download`;

  try {
    const res = await fetch(downloadProxyUrl);
    if (!res.ok) throw Object.assign(new Error('HTTP ' + res.status), { status: res.status });
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl; a.download = fileName;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
  } catch (e) {
    // Fallback: buka via proxy di tab baru
    window.open(downloadProxyUrl, '_blank');
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
      const topEl = document.getElementById('indModalSPMTop');
      if (topEl) topEl.textContent = spmVal;
    }
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function submitUsulanFromModal() {
  // === PROTEKSI PERIODE: cek ulang saat submit agar tidak bisa submit jika periode sudah tutup ===
  if (currentUser && currentUser.role === 'Operator') {
    try {
      const freshPeriode = await API.get('periode');
      window._periodeAktifList = Array.isArray(freshPeriode) ? freshPeriode : [];
    } catch(e) {}
    const periodeAktif = (window._periodeAktifList || []).filter(p => p.isAktifToday);
    if (periodeAktif.length === 0) {
      closeModal('indikatorModal');
      buildSidebar();
      showPeriodeTutupBanner();
      toast('Periode input telah ditutup. Usulan tidak dapat disubmit.', 'error');
      return;
    }
  }
  // Cek apakah ini mode perbaiki (tombol sudah berubah jadi "Ajukan Ulang")
  const submitBtn = document.getElementById('btnSubmitFromModal');
  const isResubmit = submitBtn && submitBtn.textContent.includes('Ajukan Ulang');
  // Validasi catatan operator (wajib saat ditolak Kapus)
  const _opCatatanWrap = document.getElementById('operatorCatatanWrap');
  if (_opCatatanWrap && _opCatatanWrap.style.display !== 'none') {
    const _opCatatan = document.getElementById('operatorCatatanInput');
    if (!_opCatatan || !_opCatatan.value.trim()) {
      toast('Catatan/Sanggahan untuk Kepala Puskesmas wajib diisi', 'error');
      if (_opCatatan) _opCatatan.focus();
      return;
    }
  }
  showConfirm({
    title: isResubmit ? 'Ajukan Ulang' : 'Submit Usulan',
    message: isResubmit
      ? 'Indikator yang diperbaiki akan diajukan ulang untuk diverifikasi kembali?'
      : 'Submit usulan untuk diverifikasi?',
    type: 'warning',
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
      body: JSON.stringify({
        idUsulan: currentIndikatorUsulan,
        email: currentUser.email,
        forceSubmit,
        catatanOperator: (document.getElementById('operatorCatatanInput')?.value?.trim()) || ''
      })
    });
    const raw = await res.json();

    // needConfirm: format khusus (bukan lewat ok()), cek duluan
    if (raw.needConfirm) {
      const nos = (raw.missingNos || []).slice().sort((a, b) => a - b).join(', ');
      (raw.missingNos || []).forEach(no => {
        const label = document.getElementById(`uploadLabel-${no}`);
        if (label) {
          label.style.boxShadow = '0 0 0 3px rgba(239,68,68,0.5)';
          label.style.transform = 'scale(1.05)';
          setTimeout(() => { label.style.boxShadow = ''; label.style.transform = ''; }, 3000);
        }
      });
      // Pesan konfirmasi sesuai konteks — perbaiki vs submit baru
      const isRepair = !!raw.isDitolak;
      const titleMsg = isRepair ? 'Data Dukung Belum Dilengkapi' : 'Data Dukung Belum Lengkap';
      const bodyMsg = isRepair
        ? `<div style="margin-bottom:8px"><b>${raw.missingCount} indikator yang diperbaiki</b> belum dilengkapi data dukungnya:</div><div style="background:#fef9c3;border-radius:6px;padding:8px 12px;font-size:13px;color:#92400e;font-family:monospace">No. ${nos}</div><div style="margin-top:10px;font-size:13px;color:#64748b">Disarankan untuk upload data dukung sebelum mengajukan ulang agar lebih mudah diverifikasi.</div>`
        : `<div style="margin-bottom:8px"><b>${raw.missingCount} indikator</b> belum ada data dukung:</div><div style="background:#fef9c3;border-radius:6px;padding:8px 12px;font-size:13px;color:#92400e;font-family:monospace">No. ${nos}</div><div style="margin-top:10px;font-size:13px;color:#64748b">Usulan tetap bisa disubmit, namun data dukung yang lengkap akan memperkuat verifikasi.</div>`;
      showConfirm({
        title: titleMsg,
        message: bodyMsg,
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
    closeModal('indikatorModal');

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
function clampRealisasi(no) {
  const tEl = document.getElementById(`t-${no}`);
  const cEl = document.getElementById(`c-${no}`);
  if (!tEl || !cEl) return;
  // Paksa integer — hapus desimal
  if (cEl.value.includes('.')) cEl.value = Math.floor(parseFloat(cEl.value));
  const t = parseInt(tEl.value) || 0;
  let c = parseInt(cEl.value) || 0;
  if (t > 0 && c > t) {
    cEl.value = t;
    c = t;
    toast(`Realisasi Indikator ${no} disesuaikan ke nilai target (${t})`, 'warning');
  }
  previewSPM(no);
}

function previewSPM(changedNo) {
  // Paksa integer pada target juga
  const tEl2 = document.getElementById(`t-${changedNo}`);
  if (tEl2 && tEl2.value.includes('.')) tEl2.value = Math.floor(parseFloat(tEl2.value));
  // Update capaian % display untuk baris yang berubah
  const tEl = document.getElementById(`t-${changedNo}`);
  const cEl = document.getElementById(`c-${changedNo}`);
  const capEl = document.getElementById(`cap-${changedNo}`);
  if (tEl && cEl && capEl) {
    const t = parseInt(tEl.value) || 0;
    const c = parseInt(cEl.value) || 0;
    capEl.textContent = fmtCapaianPct(c, t);
  }
  // Hitung SPM preview — gabung data DOM (indikator yang tampil) + indikatorData (yang tersembunyi)
  let totalNilai = 0, totalBobot = 0;
  // Mulai dari semua indikator (termasuk yang tidak tampil)
  (indikatorData || []).forEach(ind => {
    const tDom = document.getElementById(`t-${ind.no}`);
    const cDom = document.getElementById(`c-${ind.no}`);
    const t = tDom ? (parseFloat(tDom.value) || 0) : (parseFloat(ind.target) || 0);
    const c = cDom ? (parseFloat(cDom.value) || 0) : (parseFloat(ind.capaian) || 0);
    const bobot = parseInt(ind.bobot) || 0;
    const rasio = t > 0 ? Math.min(c / t, 1) : 0;
    totalNilai += bobot * rasio;
    totalBobot += bobot;
  });
  const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
  const indeksKinerja = totalBobot > 0 ? round2(totalNilai / totalBobot) : 0;
  const indeksSPM = round2(indeksKinerja * 0.33);
  // Update display dengan tanda bahwa ini preview (belum tersimpan)
  const topEl = document.getElementById('indModalSPMTop');
  if (topEl) topEl.textContent = indeksSPM.toFixed(2);
}

// ============== DETAIL MODAL ==============
async function viewDetail(idUsulan) {
  document.getElementById('detailModalId').textContent = idUsulan;
  showModal('detailModal');
  document.getElementById('detailModalBody').innerHTML = `<div class="empty-state"><p>Memuat...</p></div>`;
  try {
    const [detail, inds] = await Promise.all([API.getDetailUsulan(idUsulan), API.getIndikatorUsulan(idUsulan)]);
    const vp = detail.verifikasiProgram || [];
    const _vpSelesai = vp.filter(v=>v.status==='Selesai').length;
    const _vpTolak   = vp.filter(v=>v.status==='Ditolak').length;
    const _vpTunggu  = vp.filter(v=>v.status==='Menunggu').length;
    const _vpPct     = vp.length ? Math.round((_vpSelesai / vp.length) * 100) : 0;
    const _svgGroups = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
    const _svgCheck  = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0d9488" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    const _svgX      = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    const _svgClock  = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
    const vpHtml = vp.length ? `
      <div style="margin-top:16px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px">
          <div style="display:flex;align-items:center;gap:7px;font-weight:700;font-size:13px;color:#0f172a">
            <span style="color:var(--primary);display:flex">${_svgGroups}</span>
            Progress Verifikasi Pengelola Program
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="display:flex;align-items:center;gap:4px;background:#e6fffa;border:1px solid #99f6e4;border-radius:20px;padding:3px 10px;font-size:12px;font-weight:700;color:#0d9488">
              ${_svgCheck} ${_vpSelesai} selesai
            </span>
            ${_vpTolak ? `<span style="display:flex;align-items:center;gap:4px;background:#fef2f2;border:1px solid #fca5a5;border-radius:20px;padding:3px 10px;font-size:12px;font-weight:700;color:#ef4444">${_svgX} ${_vpTolak} menolak</span>` : ''}
            <span style="display:flex;align-items:center;gap:4px;background:#fffbeb;border:1px solid #fde68a;border-radius:20px;padding:3px 10px;font-size:12px;font-weight:700;color:#d97706">
              ${_svgClock} ${_vpTunggu} menunggu
            </span>
            <span style="font-size:11px;color:#94a3b8;font-weight:600">${_vpSelesai}/${vp.length}</span>
          </div>
        </div>
        <div style="height:6px;background:#e2e8f0;border-radius:99px;overflow:hidden;margin-bottom:10px">
          <div style="height:100%;width:${_vpPct}%;background:linear-gradient(90deg,#0d9488,#06b6d4);border-radius:99px"></div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px">
          ${[...vp].sort((a,b)=>(a.nama_program||a.email_program).localeCompare(b.nama_program||b.email_program,'id')).map(v => {
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
        <div class="detail-item"><label>PUSKESMAS</label><span>${detail.namaPKM}</span></div>
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
          <thead><tr><th>No</th><th>Indikator</th><th style="text-align:center;min-width:80px">Target Tahunan</th><th style="text-align:center">Target Bulan Ini</th><th style="text-align:center">Realisasi Bulan Ini</th><th style="text-align:center;min-width:80px">Sisa Target Tahunan</th><th style="text-align:center">Capaian</th><th style="text-align:center">Data Dukung</th></tr></thead>
          <tbody>${inds.map(i => { const _sisa = i.sasaranTahunan > 0 ? Math.max(0, i.sasaranTahunan - i.realisasiKumulatif) : null; const _sc = _sisa !== null && _sisa === 0 ? '#16a34a' : (_sisa !== null && _sisa < 10 ? '#f59e0b' : '#1e293b'); return `<tr>
            <td>${i.no}</td><td style="max-width:220px;font-size:12.5px">${i.nama}</td>
            <td style="text-align:center;color:#475569">${i.sasaranTahunan > 0 ? i.sasaranTahunan : '<span style=\"color:#cbd5e1\">-</span>'}</td>
            <td style="text-align:center">${i.target}</td><td style="text-align:center">${i.capaian}</td>
            <td style="text-align:center;font-weight:700;color:${_sc}">${_sisa !== null ? _sisa : '<span style=\"color:#cbd5e1\">-</span>'}</td>
            <td style="text-align:center">${fmtCapaianPct(i.capaian, i.target)}</td>
            
            <td style="text-align:center">${i.linkFile ? (() => { try { const ls = JSON.parse(i.linkFile); const arr = Array.isArray(ls) ? ls.map(f=>typeof f==='string'?{id:null,url:f,name:'File'}:f) : [{id:null,url:i.linkFile,name:'File'}]; window[`_buktiLinks_${i.no}`]={links:arr,idUsulan:i.idUsulan||''}; return `<button onclick="openBuktiModal(${i.no},0)" style="background:none;border:none;cursor:pointer;color:#0d9488;display:inline-flex;align-items:center;gap:3px;font-size:12px;padding:2px 6px;border-radius:5px" onmouseover="this.style.background='rgba(13,148,136,0.08)'" onmouseout="this.style.background='none'"><span class="material-icons" style="font-size:14px">visibility</span></button>`; } catch(e){ return `<a href="${i.linkFile}" target="_blank" style="color:#0d9488"><span class="material-icons" style="font-size:13px">visibility</span></a>`; } })() : '-'}</td>
          </tr>`; }).join('')}</tbody>
        </table>
      </div>
      ${vpHtml}
      <div style="margin-top:16px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
        ${approvalBox('Kepala Puskesmas', detail.kapusApprovedBy, detail.kapusApprovedAt, detail.statusKapus==='Ditolak' ? detail.kapusCatatan : '')}
        ${approvalBox('Pengelola Program', vp.length && vp.every(v=>v.status==='Selesai') ? 'Semua selesai' : '', '', detail.statusProgram==='Ditolak' ? detail.adminCatatan : '')}
        ${approvalBox('Admin', detail.adminApprovedBy, detail.adminApprovedAt, detail.statusGlobal==='Ditolak' && detail.statusKapus!=='Ditolak' && detail.statusProgram!=='Ditolak' ? detail.adminCatatan : '')}
      </div>
    </div>`;
  } catch (e) { if (!window._verifSilentReload) toast(e.message, 'error'); }
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
// ============== RIWAYAT AKTIVITAS (MODAL) ==============
async function openLogAktivitas(idUsulan) {
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
        <button id="btnLogDownloadLog" disabled
          style="opacity:0.35;cursor:not-allowed;background:transparent;border:none;color:#6366f1;width:34px;height:34px;display:inline-flex;align-items:center;justify-content:center;margin-left:auto;margin-right:4px;flex-shrink:0"
          title="Download tersedia setelah verifikasi selesai">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v10"/><path d="m8 9 4 4 4-4"/><path d="M4 17c0 2.2 1.8 4 4 4h8c2.2 0 4-1.8 4-4"/></svg>
        </button>
        <button class="btn-icon" onclick="closeModal('logAktivitasModal')"><span class="material-icons">close</span></button>
      </div>
      <div class="modal-body" id="logAktivitasBody" style="padding:20px;flex:1;overflow-y:auto">
        <div class="empty-state"><span class="material-icons" style="animation:spin 1s linear infinite">refresh</span><p>Memuat riwayat...</p></div>
      </div>
    </div>`;
  showModal('logAktivitasModal');
  try {
    const data = await API.getLogAktivitas(idUsulan);
    const { logs, usulan } = data;
    const aksiConfig = {
      'Submit':            { color:'#0d9488', bg:'#f0fdf9', icon:'send',              label:'Diajukan' },
      'Ajukan Ulang':      { color:'#0d9488', bg:'#f0fdf9', icon:'restart_alt',       label:'Ajukan Ulang' },
      'Approve':           { color:'#16a34a', bg:'#f0fdf4', icon:'check_circle',      label:'Disetujui' },
      'Approve Final':     { color:'#16a34a', bg:'#f0fdf4', icon:'verified',          label:'Final Disetujui' },
      'Re-verifikasi':     { color:'#0891b2', bg:'#ecfeff', icon:'update',              label:'Re-verifikasi' },
      'Tolak':             { color:'#dc2626', bg:'#fef2f2', icon:'cancel',            label:'Ditolak' },
      'Tolak (sebagian)':  { color:'#d97706', bg:'#fffbeb', icon:'remove_circle',     label:'Tolak Sebagian' },
      'Kembalikan':        { color:'#7c3aed', bg:'#f5f3ff', icon:'undo',              label:'Dikembalikan' },
      'Sanggah':           { color:'#7c3aed', bg:'#f5f3ff', icon:'gavel',            label:'Sanggah' },
      'Reset':             { color:'#d97706', bg:'#fffbeb', icon:'restart_alt',       label:'Direset Admin' },
      'Restore Verif':     { color:'#6366f1', bg:'#fff7ed', icon:'restore',           label:'Dipulihkan' },
    };
    function fmtDT(ts) {
      const d = new Date(ts);
      const o = { timeZone: 'Asia/Makassar' };
      const tgl = d.toLocaleDateString('id-ID', { ...o, day:'2-digit', month:'2-digit', year:'numeric' });
      const jam = d.toLocaleTimeString('id-ID', { ...o, hour:'2-digit', minute:'2-digit', hour12:false });
      return `${tgl} | ${jam} WITA`;
    }
    const COLS = 4;
    let gridHtml;
    if (!logs.length) {
      gridHtml = `<div class="empty-state"><span class="material-icons">history_toggle_off</span><p>Belum ada aktivitas</p></div>`;
    } else {
      const rows = [];
      for (let i = 0; i < logs.length; i += COLS) rows.push(logs.slice(i, i + COLS));
      let html = '';
      rows.forEach((row, rowIdx) => {
        const isLtrRow = rowIdx % 2 === 0;
        const displayRow = isLtrRow
          ? row.map((l,ci) => ({log:l, idx: rowIdx*COLS+ci}))
          : [...row.map((l,ci) => ({log:l, idx: rowIdx*COLS+ci}))].reverse();
        const isLastRow = rowIdx === rows.length - 1;
        html += `<div style="display:flex;flex-direction:row;align-items:flex-start;gap:0;position:relative;margin-bottom:0">`;
        displayRow.forEach(({log, idx}, di) => {
          const cfg = aksiConfig[log.aksi] || { color:'#64748b', bg:'#f8fafc', icon:'info', label:log.aksi };
          const isLastInDisplayRow = di === displayRow.length - 1;
          const hasRight = !isLastInDisplayRow;
          html += `<div style="position:relative;display:flex;flex-direction:column;align-items:center;flex:1;min-width:0;padding:0 4px">
            <div style="font-size:9.5px;font-weight:800;color:${cfg.color};margin-bottom:3px">#${idx+1}</div>
            <div style="width:40px;height:40px;border-radius:50%;background:${cfg.bg};border:2.5px solid ${cfg.color};display:flex;align-items:center;justify-content:center;flex-shrink:0;z-index:1;box-shadow:0 1px 4px ${cfg.color}33">
              <span class="material-icons" style="font-size:18px;color:${cfg.color}">${cfg.icon}</span>
            </div>
            <div style="margin-top:5px;display:flex;flex-direction:column;align-items:center;gap:2px;width:100%">
              <span style="font-size:10px;font-weight:700;color:${cfg.color};background:${cfg.bg};padding:1px 7px;border-radius:20px;border:1px solid ${cfg.color};white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis">${cfg.label}</span>
              <span style="font-size:10px;font-weight:600;color:#0f172a;text-align:center;line-height:1.3;word-break:break-word">${log.user_nama||log.user_email}</span>
              <span style="font-size:9.5px;color:#64748b;text-align:center">${log.role}</span>
              <span style="font-size:9px;color:#b0bec5;text-align:center">${fmtDT(log.timestamp)}</span>
              ${log.detail ? `<div style="font-size:10px;color:#334155;background:#f8fafc;border-left:2.5px solid ${cfg.color};padding:4px 7px;border-radius:0 5px 5px 0;line-height:1.5;margin-top:3px;text-align:left;width:100%;box-sizing:border-box;word-break:break-word">${log.detail}</div>` : ''}
            </div>
            ${hasRight ? `<div style="position:absolute;top:26px;left:calc(50% + 18px);right:0;height:2px;background:linear-gradient(to right,${cfg.color}66,#cbd5e1);z-index:0"></div>` : ''}
          </div>`;
        });
        html += `</div>`;
        if (!isLastRow) {
          const lastLog = isLtrRow ? row[row.length-1] : row[0];
          const lCfg = aksiConfig[lastLog.aksi] || { color:'#94a3b8' };
          const side = isLtrRow ? 'justify-content:flex-end' : 'justify-content:flex-start';
          html += `<div style="display:flex;${side};padding:0 4px;margin:0">
            <div style="display:flex;flex-direction:column;align-items:center">
              <div style="width:2px;height:20px;background:linear-gradient(to bottom,${lCfg.color}88,#cbd5e1)"></div>
              <span class="material-icons" style="font-size:15px;color:#94a3b8;margin-top:-2px">arrow_downward</span>
            </div>
          </div>`;
        }
      });
      gridHtml = html;
    }

    document.getElementById('logAktivitasBody').innerHTML = `
      <div style="background:#f8fafc;border-radius:10px;padding:10px 16px;margin-bottom:14px;font-size:12.5px;color:#334155;border:1px solid #e2e8f0">
        <div style="font-weight:700;font-size:13px;margin-bottom:2px">${usulan.idUsulan}</div>
        <div>${usulan.namaPKM} — ${usulan.namaBulan} ${usulan.tahun}</div>
      </div>
      <div style="width:100%">${gridHtml}</div>`;

    const btnLogDl = document.getElementById('btnLogDownloadLog');
    if (btnLogDl) {
      const isSelesai = usulan.statusGlobal === 'Selesai';
      if (isSelesai) {
        btnLogDl.disabled = false;
        btnLogDl.style.opacity = '1';
        btnLogDl.style.cursor = 'pointer';
        btnLogDl.style.color = '#10b981';
        btnLogDl.title = 'Download Riwayat Aktivitas PDF';
        btnLogDl.onclick = () => bukaLaporan(idUsulan, 'log');
      }
    }
  } catch(e) {
    const b = document.getElementById('logAktivitasBody');
    if (b) b.innerHTML = `<div class="empty-state"><span class="material-icons" style="color:#ef4444">error</span><p>Gagal memuat: ${e.message}</p></div>`;
  }
}

// ============================================================
//  BUKA LAPORAN — fetch HTML dari server lalu buka print dialog
//  mode: 'sementara' | 'final' | 'log'
// ============================================================
async function bukaLaporan(idUsulan, mode, aksesIndikator) {
  const modeLabel = { sementara:'Laporan Sementara', final:'Laporan Final', log:'Riwayat Aktivitas' };

  // window.open HARUS dipanggil sync sebelum await — agar browser tidak blokir popup
  const pw = window.open('', '_blank');
  if (!pw) { toast('Popup diblokir browser. Izinkan popup untuk situs ini.', 'error'); return; }
  pw.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Memuat Laporan...</title><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',Arial,sans-serif;background:linear-gradient(135deg,#0f172a 0%,#1e293b 50%,#0f172a 100%);display:flex;align-items:center;justify-content:center;height:100vh;overflow:hidden}
    .card{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:48px 56px;text-align:center;backdrop-filter:blur(12px);box-shadow:0 25px 60px rgba(0,0,0,0.4);max-width:380px;width:90%}
    .logo-ring{width:80px;height:80px;margin:0 auto 28px;position:relative}
    .ring{position:absolute;inset:0;border-radius:50%;border:3px solid transparent}
    .ring-1{border-top-color:#0d9488;animation:spin 1.2s linear infinite}
    .ring-2{inset:8px;border-right-color:#14b8a6;animation:spin 1.8s linear infinite reverse}
    .ring-3{inset:16px;border-bottom-color:#5eead4;animation:spin 2.4s linear infinite}
    .icon{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:26px}
    @keyframes spin{to{transform:rotate(360deg)}}
    .title{font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#5eead4;margin-bottom:10px}
    .subtitle{font-size:18px;font-weight:700;color:white;margin-bottom:6px}
    .desc{font-size:13px;color:#94a3b8;margin-bottom:32px}
    .bar-wrap{background:rgba(255,255,255,0.08);border-radius:99px;height:6px;overflow:hidden;margin-bottom:14px}
    .bar{height:100%;width:0%;background:linear-gradient(90deg,#0d9488,#14b8a6,#5eead4);border-radius:99px;animation:load 3.5s ease-in-out forwards}
    @keyframes load{0%{width:0%}30%{width:45%}65%{width:72%}85%{width:88%}100%{width:95%}}
    .status{font-size:12px;color:#64748b;animation:blink 1.8s ease-in-out infinite}
    @keyframes blink{0%,100%{opacity:.5}50%{opacity:1}}
    .dots span{animation:dot 1.4s infinite both}
    .dots span:nth-child(2){animation-delay:.2s}
    .dots span:nth-child(3){animation-delay:.4s}
    @keyframes dot{0%,80%,100%{opacity:0}40%{opacity:1}}
  </style></head><body>
    <div class="card">
      <div class="logo-ring">
        <div class="ring ring-1"></div>
        <div class="ring ring-2"></div>
        <div class="ring ring-3"></div>
        <div class="icon"><svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#5eead4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v10"/><path d="m8 9 4 4 4-4"/><path d="M4 17c0 2.2 1.8 4 4 4h8c2.2 0 4-1.8 4-4"/></svg></div>
      </div>
      <div class="title" style="font-size:28px;letter-spacing:6px">VISPM</div>
      <div class="subtitle">Menyiapkan Laporan</div>
      <div class="desc">Mohon tunggu, sedang memuat data<br>dari server<span class="dots"><span>.</span><span>.</span><span>.</span></span></div>
      <div class="bar-wrap"><div class="bar"></div></div>
      <div class="status">Mengambil data laporan...</div>
    </div>
  </body></html>`);

  toast('Menyiapkan ' + (modeLabel[mode]||'laporan') + '...', 'success');
  try {
    let _laporanUrl = `/api/laporan-pdf?id=${idUsulan}&mode=${mode}`;
    if (aksesIndikator && aksesIndikator.length) _laporanUrl += `&akses=${encodeURIComponent(aksesIndikator.join(','))}`;
    const res = await fetch(_laporanUrl);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const html = await res.text();
    pw.document.open();
    pw.document.write(html);
    pw.document.close();
  } catch(e) {
    pw.document.write('<html><body style="font-family:Arial;padding:40px;color:#ef4444"><p>Gagal memuat laporan: ' + e.message + '</p></body></html>');
    toast('Gagal membuka laporan: ' + e.message, 'error');
  }
}

// Alias untuk backward-compat dengan tombol yang sudah ada
function downloadLaporanPDF(idUsulan)       { return bukaLaporan(idUsulan, 'final'); }
function downloadLaporanSementara(idUsulan) { return bukaLaporan(idUsulan, 'sementara'); }


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
      <div class="tab active" onclick="loadVerifTab('semua',this)">Semua</div>
      <div class="tab" onclick="loadVerifTab('Menunggu Admin',this)">Menunggu Admin</div>
      <div class="tab" onclick="loadVerifTab('Selesai',this)">Selesai</div>
      <div class="tab" onclick="loadVerifTab('Ditolak',this)">Ditolak</div>
    </div>` : ''}
    ${role === 'Kepala Puskesmas' ? `<div class="tabs" id="verifTabs">
      <div class="tab active" onclick="loadVerifTab('semua',this)">Semua Usulan</div>
      <div class="tab" onclick="loadVerifTab('Menunggu Kepala Puskesmas',this)">Menunggu Verifikasi</div>
    </div>` : ''}
    <div class="card">
      <div class="card-body" style="padding:0" id="verifTable">
        <div class="empty-state" style="padding:32px"><span class="material-icons">hourglass_empty</span><p>Memuat data...</p></div>
      </div>
    </div>`;

  loadVerifData(statusFilter);
}

async function loadVerifTab(status, el) {
  document.querySelectorAll('#verifTabs .tab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
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
  } catch (e) { if (!window._verifSilentReload) toast(e.message, 'error'); }
}


// Tampilkan/hide banner TT di modal verifikasi + enable/disable tombol
function _updateVerifTTBanner(ttOk, role) {
  const isAdmin = role === 'Admin';
  const SVG_WARN = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
  const SVG_PEN  = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>';
  const SVG_GEAR = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

  let ttBanner = document.getElementById('verifTTBanner');
  if (!ttBanner) {
    ttBanner = document.createElement('div');
    ttBanner.id = 'verifTTBanner';
    const modalBody = document.querySelector('#verifikasiModal .modal-body');
    if (modalBody) modalBody.insertBefore(ttBanner, modalBody.firstChild);
  }

  window._verifTTOk = ttOk; // simpan state global untuk dicek saat data load

  if (!ttOk) {
    // Banner MERAH — wajib, harus diisi sebelum verifikasi
    ttBanner.innerHTML = `
      <div style="background:#fef2f2;border:1.5px solid #fca5a5;border-radius:10px;padding:12px 16px;margin-bottom:14px;display:flex;align-items:flex-start;gap:10px">
        <span style="color:#dc2626;flex-shrink:0;margin-top:1px;display:flex">${SVG_WARN}</span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;color:#dc2626;font-size:13px;margin-bottom:3px">Tanda Tangan Belum Ada</div>
          <div style="font-size:12px;color:#7f1d1d;line-height:1.5;margin-bottom:8px">
            ${isAdmin
              ? 'Lengkapi tanda tangan <b>Pejabat Penandatangan</b> untuk mengaktifkan tombol verifikasi.'
              : 'Upload <b>tanda tangan</b> Anda untuk mengaktifkan tombol verifikasi. Setelah upload, tombol otomatis aktif.'}
          </div>
          ${isAdmin
            ? `<button onclick="loadPage('master')" style="display:inline-flex;align-items:center;gap:5px;background:#dc2626;color:white;padding:6px 12px;border-radius:6px;border:none;font-size:11px;font-weight:600;cursor:pointer">${SVG_GEAR} Buka Master Data</button>`
            : `<button onclick="window._openProfilFromVerif=true;openEditProfil()" style="display:inline-flex;align-items:center;gap:5px;background:#dc2626;color:white;padding:6px 12px;border-radius:6px;border:none;font-size:11px;font-weight:600;cursor:pointer">${SVG_PEN} Upload Tanda Tangan</button>`
          }
        </div>
      </div>`;
  } else {
    // TT sudah ada — bersihkan banner, reset tombol
    ttBanner.innerHTML = '';
    // Aktifkan btnSubmitVerif dan re-render modal verifikasi supaya kolom Setuju/Tolak muncul
    const btnSubmit = document.getElementById('btnSubmitVerif');
    if (btnSubmit && btnSubmit.disabled && btnSubmit.title === 'Upload tanda tangan terlebih dahulu') {
      btnSubmit.disabled = false;
      btnSubmit.style.opacity = '';
      btnSubmit.title = '';
    }
    // CATATAN: Tidak panggil openVerifikasi() di sini untuk menghindari infinite loop.
    // openVerifikasi() sudah memanggil _updateVerifTTBanner(), jadi tidak perlu rekursif.
    // Jika perlu reload setelah upload TT, panggil openVerifikasi() dari luar fungsi ini.
  }
}

async function openVerifikasi(idUsulan) {
  verifCurrentUsulan = idUsulan;
  window.verifCurrentUsulan = idUsulan;
  document.getElementById('verifModalId').textContent = idUsulan;

  showModal('verifikasiModal');
  // Tombol global approve/reject sudah dihapus — semua verifikasi via per-indikator
  // Reset admin panel
  const adminPanelReset = document.getElementById('adminRejectPanel');
  if (adminPanelReset) adminPanelReset.style.display = 'none';
  const programPanelReset = document.getElementById('programRejectPanel');
  if (programPanelReset) programPanelReset.style.display = 'none';
  document.getElementById('verifIndikatorBody').innerHTML = `<tr><td colspan="7"><div class="empty-state" style="padding:20px"><p>Memuat...</p></div></td></tr>`;

  // ===== CEK TANDA TANGAN =====
  let _ttOk = true;
  const _role = currentUser.role;
  if (_role === 'Kepala Puskesmas' || _role === 'Pengelola Program') {
    const tt = currentUser.tandaTangan;
    if (!tt || tt === 'null' || tt === '') _ttOk = false;
  } else if (_role === 'Admin') {
    try {
      const pjRes = await fetch('/api/pejabat');
      const pjData = await pjRes.json();
      const pjList = pjData.success ? pjData.data : [];
      const kasubag = pjList.find(p => p.jabatan === 'Kepala Sub Bagian Perencanaan');
      const kadis   = pjList.find(p => p.jabatan === 'Kepala Dinas Kesehatan PPKB');
      if (!kasubag?.tanda_tangan || !kadis?.tanda_tangan) _ttOk = false;
    } catch(e) { _ttOk = false; }
  }

  // Update banner & tombol sesuai status tanda tangan
  _updateVerifTTBanner(_ttOk, _role);

  try {
    const [detail, inds] = await Promise.all([API.getDetailUsulan(idUsulan), API.getIndikatorUsulan(idUsulan)]);

    document.getElementById('verifDetailGrid').innerHTML = `
      <div class="detail-item"><label>PUSKESMAS</label><span>${detail.namaPKM}</span></div>
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
      <div class="detail-item"><label>Indeks SPM</label><span style="font-family:'JetBrains Mono';font-size:16px;font-weight:800;color:var(--primary)">${parseFloat(detail.indeksSPM).toFixed(2)}</span></div>`;

    // Filter inds for program role
    let displayInds = inds;
    let _isPPFiltered = false;
    let _isPPReVerif = false;
    if (currentUser.role === 'Pengelola Program') {
      const myAkses = currentUser.indikatorAkses || [];

      // Cek apakah ini re-verifikasi: ada penolakan aktif yang menjadi tanggung jawab PP ini
      const penolakanAktif = (detail.penolakanIndikator || []);
      const penolakanNosSaya = myAkses.length > 0
        ? penolakanAktif.filter(p => myAkses.includes(parseInt(p.no_indikator))).map(p => parseInt(p.no_indikator))
        : penolakanAktif.map(p => parseInt(p.no_indikator));

      if (penolakanNosSaya.length > 0) {
        // Re-verifikasi: hanya tampilkan indikator bermasalah yang jadi tanggung jawab PP ini
        // PP yang tidak punya indikator bermasalah tidak seharusnya muncul di sini
        displayInds = inds.filter(i => penolakanNosSaya.includes(parseInt(i.no)));
        _isPPFiltered = true;
        _isPPReVerif = true;
      } else if (myAkses.length > 0) {
        // Verifikasi pertama: filter berdasarkan indikator_akses saja
        displayInds = inds.filter(i => myAkses.includes(parseInt(i.no)));
        _isPPFiltered = true;
      }
    }

    // Banner info PP
    const _ppBanner = document.getElementById('verifReVerifBanner');
    if (_ppBanner && currentUser.role === 'Pengelola Program') {
      if (_isPPReVerif) {
        _ppBanner.innerHTML = `<span class="material-icons" style="color:#f59e0b;font-size:16px;flex-shrink:0">warning</span>
          <span style="font-size:12.5px;color:#92400e"><b>Verifikasi Ulang</b> — Hanya menampilkan <b>${displayInds.length} indikator</b> yang sebelumnya bermasalah dan perlu diverifikasi ulang. Indikator lain sudah disetujui.</span>`;
        _ppBanner.style.display = 'flex';
        // Tampilkan input catatan PP saat re-verif dari Admin
        const _ppCatatanWrap = document.getElementById('ppCatatanWrap');
        if (_ppCatatanWrap) _ppCatatanWrap.style.display = detail.ditolakOleh === 'Admin' ? 'block' : 'none';
        // Tampilkan alasan penolakan per indikator dari Admin
        if (detail.ditolakOleh === 'Admin') {
          const myAkses = currentUser.indikatorAkses || [];
          const alasanDariAdmin = (detail.penolakanIndikator || [])
            .filter(p => (!p.aksi || p.aksi === 'tolak') && (myAkses.length === 0 || myAkses.includes(parseInt(p.noIndikator || p.no_indikator))))
            .map(p => ({ no: parseInt(p.noIndikator || p.no_indikator), alasan: p.alasan || '-' }));
          renderPenolakanBanner('verifPenolakanBanner', 'Admin', alasanDariAdmin);
        } else {
          // Re-verif dari Kapus — tampilkan catatan Kapus jika ada
          const _kapusCatatan = detail.kapusCatatan || '';
          const _vpb = document.getElementById('verifPenolakanBanner');
          if (_vpb) {
            if (_kapusCatatan) {
              _vpb.innerHTML = '<div style="background:#fef2f2;border:1.5px solid #fca5a5;border-radius:8px;padding:12px 14px">'
                + '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">'
                + '<span class="material-icons" style="font-size:16px;color:#dc2626">cancel</span>'
                + '<span style="font-size:12.5px;font-weight:700;color:#991b1b">Catatan dari Kepala Puskesmas</span>'
                + '</div>'
                + '<div style="font-size:12px;color:#7f1d1d;line-height:1.6">' + _kapusCatatan + '</div>'
                + '</div>';
              _vpb.style.display = 'block';
            } else {
              _vpb.style.display = 'none'; _vpb.innerHTML = '';
            }
          }
        }
      } else if (_isPPFiltered) {
        _ppBanner.innerHTML = `<span class="material-icons" style="color:#0891b2;font-size:16px;flex-shrink:0">info</span>
          <span style="font-size:12.5px;color:#0c4a6e">Menampilkan <b>${displayInds.length} indikator</b> yang menjadi tanggung jawab Anda (dari total ${inds.length} indikator).</span>`;
        _ppBanner.style.display = 'flex';
        const _vpb = document.getElementById('verifPenolakanBanner');
        if (_vpb) { _vpb.style.display = 'none'; _vpb.innerHTML = ''; }
      } else {
        _ppBanner.innerHTML = `<span class="material-icons" style="color:#0891b2;font-size:16px;flex-shrink:0">info</span>
          <span style="font-size:12.5px;color:#0c4a6e">Menampilkan semua <b>${inds.length} indikator</b>.</span>`;
        _ppBanner.style.display = 'flex';
        const _ppCatatanWrap = document.getElementById('ppCatatanWrap');
        if (_ppCatatanWrap) _ppCatatanWrap.style.display = 'none';
        const _vpb = document.getElementById('verifPenolakanBanner');
        if (_vpb) { _vpb.style.display = 'none'; _vpb.innerHTML = ''; }
      }
    }

    // Filter untuk Kapus saat re-verifikasi — hanya tampilkan indikator yang pernah ditolak & diperbaiki
    // (ada di penolakan_indikator = yang dikembalikan ke Operator sebelumnya)
    let _isKapusReVerif = false;
    if (currentUser.role === 'Kepala Puskesmas') {
      const penolakanList = detail.penolakanIndikator || [];
      // Re-verifikasi hanya jika ada penolakan AKTIF (ditolak_oleh tidak null)
      // Mencegah data penolakan lama dari siklus sebelumnya mempengaruhi tampilan
      const adaPenolakanAktif = penolakanList.length > 0 && !!detail.ditolakOleh;
      if (adaPenolakanAktif) {
        // Ada indikator bermasalah dari penolakan sebelumnya → filter hanya itu
        const bermasalahNos = penolakanList.filter(p => !p.aksi || p.aksi === 'tolak').map(p => parseInt(p.noIndikator || p.no_indikator));
        displayInds = inds.filter(i => bermasalahNos.includes(parseInt(i.no)));
        _isKapusReVerif = true;
      }
      // Jika penolakanList kosong = verifikasi pertama kali → tampilkan semua
      // Banner info re-verifikasi Kapus (gunakan elemen yang sama dengan PP banner)
      const _reVerifBanner = document.getElementById('verifReVerifBanner');
      if (_reVerifBanner) {
        if (_isKapusReVerif) {
          const _isPPLoop = detail.ditolakOleh === 'Pengelola Program';
          const _opCatatan = !_isPPLoop ? (detail.operatorCatatan || '') : '';
          if (_isPPLoop) {
            // Loop PP→Kapus: PP tolak, dikembalikan ke Kapus untuk re-verifikasi
            _reVerifBanner.innerHTML = `<div style="width:100%">
              <div style="display:flex;align-items:center;gap:6px">
                <span class="material-icons" style="color:#f59e0b;font-size:16px;flex-shrink:0">warning</span>
                <span style="font-size:12.5px;color:#92400e"><b>Verifikasi Ulang</b> — Hanya menampilkan <b>${displayInds.length} indikator</b> yang ditolak oleh Pengelola Program. Silakan periksa alasan di bawah.</span>
              </div>
            </div>`;
            _reVerifBanner.style.display = 'flex';
            // Tampilkan alasan penolakan per indikator dari PP
            const alasanDariPP = (detail.penolakanIndikator || [])
              .filter(p => !p.aksi || p.aksi === 'tolak')
              .map(p => ({ no: parseInt(p.noIndikator || p.no_indikator), alasan: p.alasan || '-' }));
            renderPenolakanBanner('verifPenolakanBanner', 'Pengelola Program', alasanDariPP);
          } else {
            // Loop Operator↔Kapus: tampilkan catatan sanggahan dari Operator jika ada
            // Sembunyikan banner alasan PP (tidak relevan di loop ini)
            const _vpb = document.getElementById('verifPenolakanBanner');
            if (_vpb) { _vpb.style.display = 'none'; _vpb.innerHTML = ''; }
            if (_opCatatan) {
              _reVerifBanner.innerHTML = `<div style="width:100%">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
                  <span class="material-icons" style="color:#f59e0b;font-size:16px;flex-shrink:0">warning</span>
                  <span style="font-size:12.5px;color:#92400e"><b>Re-submit dari Operator</b> — Hanya menampilkan <b>${displayInds.length} indikator</b> yang sebelumnya Anda tolak.</span>
                </div>
                <div style="background:#fef9c3;border:1.5px solid #fde047;border-radius:7px;padding:8px 12px">
                  <div style="display:flex;align-items:center;gap:5px;margin-bottom:4px">
                    <span class="material-icons" style="font-size:14px;color:#ca8a04">comment</span>
                    <span style="font-size:11.5px;font-weight:700;color:#854d0e">Catatan / Sanggahan dari Operator:</span>
                  </div>
                  <div style="font-size:12px;color:#78350f;line-height:1.5">${_opCatatan}</div>
                </div>
              </div>`;
              _reVerifBanner.style.display = 'flex';
            } else {
              _reVerifBanner.innerHTML = `<div style="display:flex;align-items:center;gap:6px">
                <span class="material-icons" style="color:#f59e0b;font-size:16px;flex-shrink:0">warning</span>
                <span style="font-size:12.5px;color:#92400e"><b>Re-submit dari Operator</b> — Hanya menampilkan <b>${displayInds.length} indikator</b> yang sebelumnya Anda tolak.</span>
              </div>`;
              _reVerifBanner.style.display = 'flex';
            }
          }
          // kapusCatatanWrap hanya muncul saat loop Kapus↔PP
          const _kapusCatatanWrap = document.getElementById('kapusCatatanWrap');
          if (_kapusCatatanWrap) _kapusCatatanWrap.style.display = _isPPLoop ? 'block' : 'none';
        } else {
          _reVerifBanner.style.display = 'none';
          const _kapusCatatanWrap = document.getElementById('kapusCatatanWrap');
          if (_kapusCatatanWrap) _kapusCatatanWrap.style.display = 'none';
          const _vpb2 = document.getElementById('verifPenolakanBanner');
          if (_vpb2) { _vpb2.style.display = 'none'; _vpb2.innerHTML = ''; }
        }
      }
    }

    // Filter untuk Admin saat re-verifikasi (loop Admin↔PP)
    // Hanya tampilkan indikator yang bermasalah — sama seperti PP dan Kapus
    let _isAdminReVerif = false;
    let _bermasalahNos = [];
    if (currentUser.role === 'Admin') {
      const penolakanList = detail.penolakanIndikator || [];
      const adaPenolakanAktif = penolakanList.length > 0 && !!detail.ditolakOleh;
      if (adaPenolakanAktif) {
        _bermasalahNos = penolakanList.filter(p => !p.aksi || p.aksi === 'tolak').map(p => parseInt(p.noIndikator || p.no_indikator));
        displayInds = inds.filter(i => _bermasalahNos.includes(parseInt(i.no)));
        _isAdminReVerif = true;
      }
      const _reVerifBanner = document.getElementById('verifReVerifBanner');
      if (_reVerifBanner) {
        if (_isAdminReVerif) {
          // Kumpulkan catatan sanggahan PP dari penolakan_indikator.catatan_program
          // (PP mengisi catatan saat respond penolakan Admin)
          // Kumpulkan semua PP yang bertanggung jawab atas indikator bermasalah
          // dari verifikasiProgram (bukan hanya dari catatan_program)
          const catatanMap = {};
          (detail.penolakanIndikator || []).forEach(p => {
            if (p.catatan_program && p.email_program) {
              const key = p.email_program.toLowerCase();
              if (!catatanMap[key]) catatanMap[key] = [];
              catatanMap[key].push({ no: parseInt(p.no_indikator||p.noIndikator), catatan: p.catatan_program });
            }
          });
          // Semua PP yang aksesnya overlap dengan indikator bermasalah
          const ppTerkena = (detail.verifikasiProgram || []).filter(vp => {
            const akses = (vp.indikator_akses || '').split(',').map(s => parseInt(s.trim())).filter(Boolean);
            if (akses.length === 0) return _bermasalahNos.length > 0; // PP akses semua
            return akses.some(n => _bermasalahNos.includes(n));
          });
          const ppReVerifInfo = ppTerkena.map(vp => {
            const emailPP = vp.email_program;
            const namaPP = vp.nama_program || emailPP;
            let catatanText = '';
            if (vp.catatan && vp.catatan.trim()) {
              catatanText = vp.catatan;
            } else {
              const items = catatanMap[emailPP?.toLowerCase()] || catatanMap[emailPP] || [];
              catatanText = items.map(it => `Ind.${it.no}: ${it.catatan}`).join(' | ');
            }
            return `<div style="background:rgba(255,255,255,0.7);border:1px solid #fde68a;border-radius:6px;padding:6px 8px">
              <div style="font-size:11px;font-weight:700;color:#78350f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${namaPP}</div>
              <div style="font-size:10.5px;color:#92400e;margin-top:2px;line-height:1.4">${catatanText || '<span style="font-style:italic;color:#b45309">Belum ada catatan</span>'}</div>
            </div>`;
          }).join('');
          _reVerifBanner.innerHTML = `<div style="width:100%">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:${ppReVerifInfo ? '8px' : '0'}">
              <span class="material-icons" style="color:#f59e0b;font-size:16px;flex-shrink:0">warning</span>
              <span style="font-size:12.5px;color:#92400e"><b>Re-verifikasi</b> — Hanya menampilkan <b>${displayInds.length} indikator</b> yang sebelumnya bermasalah dan sudah diverifikasi ulang oleh Pengelola Program.</span>
            </div>
            ${ppReVerifInfo ? `<div style="border-top:1px solid #fde68a;padding-top:6px">
              <div style="font-size:10px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px">Catatan Pengelola Program:</div>
              <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:6px">${ppReVerifInfo}</div>
            </div>` : ''}
          </div>`;
          _reVerifBanner.style.display = 'flex';
        } else {
          _reVerifBanner.style.display = 'none';
        }
      }
    }

    // Untuk Admin: isi panel pilih indikator bermasalah
    const adminPanel = document.getElementById('adminRejectPanel');
    const adminList = document.getElementById('adminRejectIndikatorList');
    if (adminPanel && adminList) {
      if (currentUser.role === 'Admin') {
        adminList.innerHTML = displayInds.map(i => `
          <div style="background:white;border:1px solid #fca5a5;border-radius:8px;padding:8px 12px">
            <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;margin:0">
              <input type="checkbox" id="rejectInd_${i.no}" value="${i.no}" style="margin-top:2px;accent-color:#dc2626;flex-shrink:0">
              <div style="flex:1;min-width:0">
                <div style="font-size:12.5px;font-weight:600;color:#1e293b">${i.no}. ${i.nama}</div>
                <textarea id="rejectAlasan_${i.no}" rows="1" placeholder="Alasan penolakan indikator ini..."
                  style="width:100%;margin-top:4px;font-size:11.5px;border:1px solid #e2e8f0;border-radius:5px;padding:4px 7px;resize:vertical;display:none;box-sizing:border-box"
                  oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"></textarea>
              </div>
            </label>
          </div>`).join('');
        // Toggle textarea saat checkbox dicentang
        adminList.querySelectorAll('input[type=checkbox]').forEach(cb => {
          cb.addEventListener('change', () => {
            const ta = document.getElementById('rejectAlasan_' + cb.value);
            if (ta) ta.style.display = cb.checked ? 'block' : 'none';
          });
        });
        // Panel tersembunyi dulu, ditampilkan saat klik tombol Tolak
        adminPanel.style.display = 'none';
      } else {
        adminPanel.style.display = 'none';
      }
    }

    // Thread catatan riwayat untuk Kapus dan PP (saat re-verif)
    const _verifThread = document.getElementById('verifCatatanThread');
    if (_verifThread) {
      const showThread = (currentUser.role === 'Kepala Puskesmas' && _isKapusReVerif)
        || (currentUser.role === 'Pengelola Program' && _isPPReVerif)
        || (currentUser.role === 'Admin' && _isAdminReVerif);
      if (showThread) {
        renderCatatanThread('verifCatatanThread', idUsulan, currentUser.role);
      } else {
        _verifThread.style.display = 'none'; _verifThread.innerHTML = '';
      }
    }

    // Cek apakah user ini sudah verifikasi
    let sudahVerifUser = false;
    if (currentUser.role === 'Kepala Puskesmas') {
      sudahVerifUser = detail.statusKapus === 'Selesai' || detail.statusKapus === 'Ditolak';
    } else if (currentUser.role === 'Pengelola Program') {
      const myRecord = (detail.verifikasiProgram || []).find(v => v.email_program?.toLowerCase() === currentUser.email?.toLowerCase());
      sudahVerifUser = myRecord && (myRecord.status === 'Selesai' || myRecord.status === 'Ditolak');
      if (myRecord && myRecord.status === 'Menunggu') sudahVerifUser = false;
    } else if (currentUser.role === 'Admin') {
      sudahVerifUser = detail.statusGlobal === 'Selesai';
    }

    const role = currentUser.role;
    const canAct = !sudahVerifUser && (
      (role === 'Kepala Puskesmas' && detail.statusGlobal === 'Menunggu Kepala Puskesmas') ||
      (role === 'Pengelola Program' && (detail.statusGlobal === 'Menunggu Pengelola Program' || detail.statusGlobal === 'Ditolak')) ||
      (role === 'Admin' && detail.statusGlobal === 'Menunggu Admin')
    );
    // Semua role verifikasi menggunakan sistem per-indikator
    const usePerIndikator = ['Kepala Puskesmas', 'Pengelola Program', 'Admin'].includes(role);

    // ======= THEAD =======
    const thead = document.getElementById('verifIndikatorHead');
    if (thead) {
      if (usePerIndikator && canAct && window._verifTTOk) {
        thead.innerHTML = `<tr><th>No</th><th>Indikator</th><th style="text-align:center;min-width:80px">Target Tahunan</th><th style="text-align:center">Target Bulan Ini</th><th style="text-align:center">Realisasi Bulan Ini</th><th style="text-align:center;min-width:80px">Sisa Target Tahunan</th><th style="text-align:center">Capaian</th><th style="text-align:center">Data Dukung</th><th style="text-align:center;min-width:170px">Verifikasi</th></tr>`;
      } else {
        thead.innerHTML = `<tr><th>No</th><th>Indikator</th><th style="text-align:center!important;min-width:80px">Target Tahunan</th><th style="text-align:center!important">Target Bulan Ini</th><th style="text-align:center!important">Realisasi Bulan Ini</th><th style="text-align:center!important;min-width:80px">Sisa Target Tahunan</th><th style="text-align:center!important">Capaian</th><th style="text-align:center!important">Data Dukung</th></tr>`;
      }
    }

    // ======= TBODY =======
    document.getElementById('verifIndikatorBody').innerHTML = displayInds.map(i => {
      let buktiHtml = '-';
      if (i.linkFile) {
        try {
          const lsParsed = JSON.parse(i.linkFile);
          const arrLinks = Array.isArray(lsParsed)
            ? lsParsed.map(f => typeof f === 'string' ? {id:null,url:f,name:'File'} : f)
            : [{id:null,url:i.linkFile,name:'File'}];
          window[`_buktiLinks_${i.no}`] = { links: arrLinks, idUsulan: i.idUsulan || '' };
          buktiHtml = `<button onclick="openBuktiModal(${i.no},0)" style="background:none;border:none;cursor:pointer;color:#0d9488;display:inline-flex;align-items:center;gap:3px;font-size:12px;padding:2px 6px;border-radius:5px" onmouseover="this.style.background='rgba(13,148,136,0.08)'" onmouseout="this.style.background='none'"><span class="material-icons" style="font-size:14px">visibility</span></button>`;
        } catch {
          buktiHtml = `<button onclick="window.open('${i.linkFile}','_blank')" style="background:none;border:none;cursor:pointer;color:#0d9488;padding:2px 6px;border-radius:5px"><span class="material-icons" style="font-size:14px">visibility</span></button>`;
        }
      }

      // Kolom verifikasi per indikator — berlaku untuk Kapus, PP, Admin
      let verifCol = '';
      if (usePerIndikator && canAct && window._verifTTOk) {
        verifCol = `
          <td style="text-align:center;padding:6px 8px;min-width:190px">
            <div style="display:flex;flex-direction:column;align-items:center;gap:4px">
              <div style="display:flex;gap:6px">
                <button id="pgApprove_${i.no}" onclick="setIndVerif(${i.no},'setuju')"
                  style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:6px;border:1.5px solid #16a34a;background:white;color:#16a34a;font-size:11.5px;font-weight:600;cursor:pointer;transition:all 0.15s"
                  onmouseover="if(!this.dataset.active)this.style.background='#f0fdf4'" onmouseout="if(!this.dataset.active)this.style.background='white'">
                  <span class="material-icons" style="font-size:14px">check_circle</span> Setuju
                </button>
                <button id="pgReject_${i.no}" onclick="setIndVerif(${i.no},'tolak')"
                  style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:6px;border:1.5px solid #dc2626;background:white;color:#dc2626;font-size:11.5px;font-weight:600;cursor:pointer;transition:all 0.15s"
                  onmouseover="if(!this.dataset.active)this.style.background='#fef2f2'" onmouseout="if(!this.dataset.active)this.style.background='white'">
                  <span class="material-icons" style="font-size:14px">cancel</span> Tolak
                </button>
              </div>

              <div id="pgAlasanWrap_${i.no}" style="display:none;width:100%">
                <input type="text" id="pgAlasan_${i.no}" placeholder="Alasan penolakan (wajib)..."
                  style="width:100%;font-size:11px;border:1px solid #fca5a5;border-radius:5px;padding:4px 7px;box-sizing:border-box;margin-top:2px">
              </div>
            </div>
          </td>`;
      }

      // Catatan setuju per indikator (muncul saat read-only / sudah verif)
      const catatanInd = (!canAct && i.catatan && i.status !== 'Draft')
        ? `<div style="font-size:10.5px;color:#065f46;margin-top:3px;font-style:italic;background:#f0fdf4;border-radius:4px;padding:2px 6px">"${i.catatan}"</div>` : '';

      const _sisaV = i.sasaranTahunan > 0 ? Math.max(0, i.sasaranTahunan - i.realisasiKumulatif) : null;
      const _scV = _sisaV !== null && _sisaV === 0 ? '#16a34a' : (_sisaV !== null && _sisaV < 10 ? '#f59e0b' : '#1e293b');
      return `<tr id="pgRow_${i.no}">
        <td>${i.no}</td>
        <td style="font-size:13px">${i.nama}${catatanInd}</td>
        <td style="text-align:center;color:#475569">${i.sasaranTahunan > 0 ? i.sasaranTahunan : '<span style="color:#cbd5e1">-</span>'}</td>
        <td style="text-align:center">${i.target}</td><td style="text-align:center">${i.capaian}</td>
        <td style="text-align:center;font-weight:700;color:${_scV}">${_sisaV !== null ? _sisaV : '<span style="color:#cbd5e1">-</span>'}</td>
        <td style="text-align:center">${fmtCapaianPct(i.capaian, i.target)}</td>
        <td style="text-align:center">${buktiHtml}</td>
        ${verifCol}
      </tr>`;
    }).join('');

    // ======= FOOTER BUTTONS =======
    if (usePerIndikator) {
      // Sembunyikan tombol global — semua role pakai per indikator

      // Sembunyikan adminRejectPanel lama jika masih ada
      const adminPanel = document.getElementById('adminRejectPanel');
      if (adminPanel) adminPanel.style.display = 'none';

      // Tambah/update tombol Submit generik
      let btnSubmit = document.getElementById('btnSubmitVerif');
      if (!btnSubmit) {
        btnSubmit = document.createElement('button');
        btnSubmit.id = 'btnSubmitVerif';
        btnSubmit.className = 'btn btn-primary';
        const footer = document.querySelector('#verifikasiModal .modal-footer');
        if (footer) footer.insertBefore(btnSubmit, footer.querySelector('#btnDownloadVerif') || null);
      }

      if (sudahVerifUser) {
        let wasTolak = false;
        if (role === 'Pengelola Program') {
          const myRecord = (detail.verifikasiProgram || []).find(v => v.email_program?.toLowerCase() === currentUser.email?.toLowerCase());
          wasTolak = myRecord?.status === 'Ditolak';
        } else if (role === 'Kepala Puskesmas') {
          wasTolak = detail.statusKapus === 'Ditolak';
        }
        btnSubmit.innerHTML = wasTolak
          ? '<span class="material-icons">cancel</span> Sudah Ditolak (sebagian)'
          : '<span class="material-icons">check_circle</span> Sudah Diverifikasi';
        btnSubmit.style.background  = wasTolak ? '#dc2626' : '#16a34a';
        btnSubmit.style.borderColor = wasTolak ? '#dc2626' : '#16a34a';
        btnSubmit.disabled = true; btnSubmit.style.opacity = '';
      } else if (!window._verifTTOk) {
        btnSubmit.innerHTML = '<span class="material-icons">send</span> Submit Verifikasi';
        btnSubmit.style.background = ''; btnSubmit.style.borderColor = '';
        btnSubmit.disabled = true; btnSubmit.style.opacity = '0.35';
        btnSubmit.title = 'Upload tanda tangan terlebih dahulu';
      } else if (!canAct) {
        btnSubmit.innerHTML = '<span class="material-icons">send</span> Submit Verifikasi';
        btnSubmit.style.background = ''; btnSubmit.style.borderColor = '';
        btnSubmit.disabled = true; btnSubmit.style.opacity = '0.35';
      } else {
        const _isReVerif = _isPPReVerif || _isKapusReVerif || _isAdminReVerif;
        btnSubmit.innerHTML = _isReVerif
          ? '<span class="material-icons">update</span> Submit Re-verifikasi'
          : '<span class="material-icons">send</span> Submit Verifikasi';
        btnSubmit.style.background = _isReVerif ? '#0891b2' : '';
        btnSubmit.style.borderColor = _isReVerif ? '#0891b2' : '';
        btnSubmit.disabled = false; btnSubmit.style.opacity = '';
        btnSubmit.onclick = () => submitIndVerifikasi(verifCurrentUsulan, displayInds, role);
      }
    } else {
      // Role lain (Operator lihat saja) — tombol global tidak aktif

      const old = document.getElementById('btnSubmitVerif');
      if (old) old.remove();
    }
  } catch (e) { if (!window._verifSilentReload) toast(e.message, 'error'); }
}

// ======= Toggle keputusan per indikator (Kapus / PP / Admin) =======
function setIndVerif(no, aksi) {
  const btnSetuju       = document.getElementById(`pgApprove_${no}`);
  const btnTolak        = document.getElementById(`pgReject_${no}`);
  const alasanWrap      = document.getElementById(`pgAlasanWrap_${no}`);
  const row             = document.getElementById(`pgRow_${no}`);

  // Reset semua
  if (btnSetuju) { btnSetuju.dataset.active = ''; btnSetuju.style.background = 'white'; btnSetuju.style.color = '#16a34a'; btnSetuju.style.borderColor = '#16a34a'; }
  if (btnTolak)  { btnTolak.dataset.active  = ''; btnTolak.style.background  = 'white'; btnTolak.style.color  = '#dc2626'; btnTolak.style.borderColor  = '#dc2626'; }
  if (alasanWrap) alasanWrap.style.display = 'none';
  if (row) row.style.background = '';

  if (aksi === 'setuju') {
    if (btnSetuju) { btnSetuju.dataset.active = '1'; btnSetuju.style.background = '#16a34a'; btnSetuju.style.color = 'white'; }
    if (row) row.style.background = '#f0fdf4';
  } else {
    if (btnTolak) { btnTolak.dataset.active = '1'; btnTolak.style.background = '#dc2626'; btnTolak.style.color = 'white'; }
    if (alasanWrap) alasanWrap.style.display = 'block';
    if (row) row.style.background = '#fef2f2';
    setTimeout(() => document.getElementById(`pgAlasan_${no}`)?.focus(), 50);
  }
}

// ======= Submit verifikasi per indikator — generik untuk Kapus, PP, Admin =======
async function submitIndVerifikasi(idUsulan, displayInds, role) {
  const indikatorList = [];
  for (const i of displayInds) {
    const isSetuju = document.getElementById(`pgApprove_${i.no}`)?.dataset.active === '1';
    const isTolak  = document.getElementById(`pgReject_${i.no}`)?.dataset.active  === '1';
    if (!isSetuju && !isTolak) return toast(`Tentukan keputusan untuk indikator #${i.no} — ${i.nama}`, 'warning');
    if (isTolak) {
      const alasan = document.getElementById(`pgAlasan_${i.no}`)?.value?.trim();
      if (!alasan) return toast(`Isi alasan penolakan untuk indikator #${i.no}`, 'warning');
      indikatorList.push({ noIndikator: i.no, aksi: 'tolak', alasan });
    } else {
      indikatorList.push({ noIndikator: i.no, aksi: 'setuju' });
    }
  }

  const actionMap = { 'Kepala Puskesmas': 'verif-kapus', 'Pengelola Program': 'verif-program', 'Admin': 'verif-admin' };
  const action = actionMap[role];
  if (!action) return toast('Role tidak dikenali', 'error');

  const catatanKapus = role === 'Kepala Puskesmas' ? (document.getElementById('kapusCatatanInput')?.value?.trim() || '') : undefined;
  if (role === 'Kepala Puskesmas' && document.getElementById('kapusCatatanWrap')?.style.display !== 'none') {
    if (!catatanKapus) return toast('Catatan / Tanggapan untuk Pengelola Program wajib diisi sebelum submit re-verifikasi', 'warning');
  }
  // Validasi catatan wajib untuk PP saat re-verif dari Admin
  const catatanProgram = role === 'Pengelola Program' ? (document.getElementById('ppCatatanInput')?.value?.trim() || '') : undefined;
  if (role === 'Pengelola Program' && document.getElementById('ppCatatanWrap')?.style.display !== 'none') {
    const adaYangSetuju = indikatorList.some(i => i.aksi === 'setuju');
    if (adaYangSetuju && !catatanProgram) return toast('Catatan / Sanggahan untuk Admin wajib diisi jika ada indikator yang disetujui', 'warning');
  }

  setLoading(true);
  try {
    const payload = { idUsulan, email: currentUser.email, indikatorList };
    if (catatanKapus !== undefined) payload.catatanKapus = catatanKapus;
    if (catatanProgram !== undefined) payload.catatanProgram = catatanProgram;
    const result = await API.post('usulan?action=' + action, payload);
    toast(result?.message || 'Verifikasi berhasil disimpan', 'success');
    setTimeout(() => {
      closeModal('verifikasiModal');
      if (currentPage === 'dashboard') renderDashboard();
      else renderVerifikasi();
    }, 800);
  } catch(e) { toast(e.message, 'error'); }
  finally { setLoading(false); }
}


// ============== TOPBAR DROPDOWN ==============
// ============== TOPBAR DROPDOWN ==============
function toggleTopbarDropdown() {
  const dd = document.getElementById('topbarDropdown');
  if (!dd) return;
  const isOpen = dd.classList.contains('open');
  // Tutup dulu semua, lalu toggle
  document.querySelectorAll('.topbar-dropdown.open').forEach(el => el.classList.remove('open'));
  if (!isOpen) dd.classList.add('open');
}

function closeTopbarDropdown() {
  const dd = document.getElementById('topbarDropdown');
  if (dd) dd.classList.remove('open');
}

// Tutup dropdown kalau klik di luar
document.addEventListener('click', (e) => {
  if (!e.target.closest('#topbarAvatarWrap')) {
    closeTopbarDropdown();
  }
});


// ============== THEME TOGGLE ==============
function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  const newTheme = isDark ? 'light' : 'dark';
  html.setAttribute('data-theme', newTheme);
  localStorage.setItem('spm_theme', newTheme);
  const btn = document.getElementById('themeToggleBtn');
  if (btn) btn.textContent = newTheme === 'dark' ? '☀️' : '🌙';
}

// Terapkan tema yang tersimpan saat load
(function applyStoredTheme() {
  const saved = localStorage.getItem('spm_theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
    const btn = document.getElementById('themeToggleBtn');
    if (btn) btn.textContent = saved === 'dark' ? '☀️' : '🌙';
  }
})();

// ============== EDIT PROFIL ==============
function openEditProfil() {
  // Buat modal kalau belum ada
  let modal = document.getElementById('editProfilModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'editProfilModal';
    modal.className = 'modal';
    modal.style.zIndex = '3000';
    modal.addEventListener('click', e => { if (e.target === modal) closeModal('editProfilModal'); });
    modal.innerHTML = `
      <div class="modal-card" style="max-width:420px;width:100%">
        <div class="modal-header">
          <span class="material-icons" style="color:#0d9488">account_circle</span>
          <h3>Edit Profil</h3>
          <button class="btn-icon" onclick="closeModal('editProfilModal')"><span class="material-icons">close</span></button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Nama Lengkap</label>
            <input class="form-control" id="epNama" placeholder="Nama lengkap">
          </div>
          <div class="form-group">
            <label>NIP</label>
            <input class="form-control" id="epNIP" placeholder="Nomor Induk Pegawai (opsional)" maxlength="30">
          </div>
          <div class="form-group">
            <label>Email</label>
            <input class="form-control" id="epEmail" disabled style="background:#f8fafc;color:var(--text-light)">
          </div>
          <div class="form-group">
            <label>Role</label>
            <input class="form-control" id="epRole" disabled style="background:#f8fafc;color:var(--text-light)">
          </div>
          <div id="epTTSection"></div>
          <div id="epStatus" style="font-size:12.5px;color:#ef4444;min-height:18px"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal('editProfilModal')">Batal</button>
          <button class="btn btn-primary" onclick="saveEditProfil()"><span class="material-icons">save</span>Simpan</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }
  // Inject section tanda tangan setelah modal ada — cek role saat ini
  const epTTSection = document.getElementById('epTTSection');
  if (epTTSection) {
    const rolesBolehTT = ['Kepala Puskesmas', 'Pengelola Program'];
    if (rolesBolehTT.includes(currentUser.role)) {
      epTTSection.innerHTML = `
        <div class="form-group">
          <label>Tanda Tangan <span style="font-size:11px;color:#94a3b8">(upload gambar, maks 2MB)</span></label>
          <div style="border:2px dashed #cbd5e1;border-radius:8px;padding:10px;text-align:center;cursor:pointer;position:relative" id="epTTWrap" onclick="document.getElementById('epTTInput').click()">
            <img id="epTTPreview" style="max-height:80px;max-width:100%;display:none;margin:0 auto">
            <div id="epTTPlaceholder" style="color:#94a3b8;font-size:13px;padding:8px">
              <span class="material-icons" style="font-size:28px;display:block;margin:0 auto 4px">draw</span>
              Klik untuk upload tanda tangan
            </div>
            <input type="file" id="epTTInput" accept="image/*" style="display:none" onchange="previewTandaTangan(event)">
          </div>
          <button type="button" id="epTTHapus" style="display:none;margin-top:6px;font-size:12px;color:#ef4444;background:none;border:none;cursor:pointer;padding:0" onclick="hapusTandaTangan()">
            <span class="material-icons" style="font-size:14px;vertical-align:middle">delete</span> Hapus tanda tangan
          </button>
          <div style="margin-top:8px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:8px 10px;font-size:11.5px;color:#92400e;line-height:1.6">
            <span class="material-icons" style="font-size:13px;vertical-align:middle;margin-right:3px">info</span>
            <strong>Tips tanda tangan:</strong> Gunakan foto tanda tangan dengan <b>latar putih/terang</b>.
            Gambar akan otomatis dikompresi ke ukuran optimal saat disimpan.
            Jika tanda tangan <b>tidak muncul di laporan PDF</b>, silakan <b>upload ulang</b> di halaman ini.
          </div>
        </div>`;
    } else {
      epTTSection.innerHTML = '';
    }
  }
  // Isi data user saat ini
  document.getElementById('epNama').value = currentUser.nama || '';
  document.getElementById('epNIP').value = currentUser.nip || '';
  document.getElementById('epEmail').value = currentUser.email || '';
  document.getElementById('epRole').value = currentUser.role || '';
  document.getElementById('epStatus').textContent = '';
  // Tampilkan tanda tangan jika ada
  const ttPreview = document.getElementById('epTTPreview');
  const ttPlaceholder = document.getElementById('epTTPlaceholder');
  const ttHapus = document.getElementById('epTTHapus');
  if (currentUser.tandaTangan) {
    ttPreview.src = currentUser.tandaTangan; ttPreview.style.display = 'block';
    ttPlaceholder.style.display = 'none'; ttHapus.style.display = 'inline-block';
  } else {
    ttPreview.src = ''; ttPreview.style.display = 'none';
    ttPlaceholder.style.display = 'block'; ttHapus.style.display = 'none';
  }
  showModal('editProfilModal');
  setTimeout(() => document.getElementById('epNama').focus(), 100);
}


// ============================================================
//  HELPER: Resize gambar tanda tangan sebelum disimpan ke DB
//  Max 400x200px, output JPEG quality 0.82 → maks ~50-80KB base64
// ============================================================
function resizeImageToBase64(file, maxW, maxH, quality, callback) {
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height;
      // Hitung rasio agar proporsional
      if (w > maxW || h > maxH) {
        const ratio = Math.min(maxW / w, maxH / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      // Background putih (agar PNG transparan tidak jadi hitam saat JPEG)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const resized = canvas.toDataURL('image/jpeg', quality);
      callback(resized);
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function previewTandaTangan(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { alert('File terlalu besar, maks 2MB'); e.target.value=''; return; }
  resizeImageToBase64(file, 400, 200, 0.82, b64 => {
    document.getElementById('epTTPreview').src = b64;
    document.getElementById('epTTPreview').style.display = 'block';
    document.getElementById('epTTPlaceholder').style.display = 'none';
    document.getElementById('epTTHapus').style.display = 'inline-block';
    e.target._newTT = b64;
  });
}

function hapusTandaTangan() {
  document.getElementById('epTTPreview').src = '';
  document.getElementById('epTTPreview').style.display = 'none';
  document.getElementById('epTTPlaceholder').style.display = 'block';
  document.getElementById('epTTHapus').style.display = 'none';
  const inp = document.getElementById('epTTInput');
  inp.value = ''; inp._newTT = null;
}

async function saveEditProfil() {
  const nama = document.getElementById('epNama').value.trim();
  const nip = document.getElementById('epNIP').value.trim();
  const statusEl = document.getElementById('epStatus');
  if (!nama) { statusEl.textContent = 'Nama tidak boleh kosong'; return; }
  setLoading(true);
  try {
    const ttInput = document.getElementById('epTTInput');
    let tandaTangan = currentUser.tandaTangan || null;
    if (ttInput && ttInput._newTT !== undefined) tandaTangan = ttInput._newTT;
    await API.updateUser({
      email: currentUser.email,
      nama,
      nip,
      role: currentUser.role,
      kodePKM: currentUser.kodePKM || '',
      // Kirim sebagai string (format "1,2,3"), bukan array, agar tidak menimpa indikatorAkses di DB
      indikatorAkses: currentUser.indikatorAksesString || (Array.isArray(currentUser.indikatorAkses) ? currentUser.indikatorAkses.join(',') : currentUser.indikatorAkses || ''),
      jabatan: currentUser.jabatan || '',
      aktif: true,
      tandaTangan
    });
    // Update state lokal
    currentUser.nama = nama;
    currentUser.nip = nip;
    if (tandaTangan !== undefined) currentUser.tandaTangan = tandaTangan;
    localStorage.setItem('spm_user', JSON.stringify(currentUser));
    // Update tampilan
    document.getElementById('sidebarName').textContent = nama;
    document.getElementById('sidebarAvatar').textContent = nama[0].toUpperCase();
    const dropNameEl = document.getElementById('topbarDropName');
    if (dropNameEl) dropNameEl.textContent = nama;
    toast('Profil berhasil diperbarui!', 'success');
    closeModal('editProfilModal');
    // Auto-refresh tombol verifikasi jika dibuka dari modal verifikasi
    const verifModal = document.getElementById('verifikasiModal');
    const fromVerif = window._openProfilFromVerif;
    window._openProfilFromVerif = false;
    if (fromVerif || (verifModal && verifModal.classList.contains('show'))) {
      const ttOk = !!(currentUser.tandaTangan && currentUser.tandaTangan !== 'null' && currentUser.tandaTangan !== '');
      _updateVerifTTBanner(ttOk, currentUser.role);
      // Reload modal verifikasi sekali (bukan rekursif) setelah TT berhasil diupload
      if (ttOk && window.verifCurrentUsulan) {
        window._verifSilentReload = true;
        openVerifikasi(window.verifCurrentUsulan).catch(() => {}).finally(() => { window._verifSilentReload = false; });
      }
    }
  } catch(e) {
    statusEl.textContent = e.message;
  } finally { setLoading(false); }
}


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
      <div class="card-header-bar" style="justify-content:space-between"><span class="card-title"><span class="material-icons">filter_list</span>Filter</span><button class="btn btn-primary btn-sm" onclick="exportLaporan()"><span class="material-icons">download</span>Export Excel</button></div>
      <div class="card-body">
        <div class="filter-row">
          <select class="form-control" id="lapTahun" onchange="loadLaporan()">${yearOptions(CURRENT_YEAR)}</select>
          <select class="form-control" id="lapBulan" onchange="loadLaporan()"><option value="semua">Semua Bulan</option>${bulanOptions('')}</select>
          ${role === 'Admin' ? `<select class="form-control" id="lapPKM" onchange="loadLaporan()"><option value="semua">Semua Puskesmas</option></select>` : ''}
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
  if (role === 'Admin') {
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
          <td style="white-space:nowrap">
            <button class="btn-icon view" onclick="viewDetail('${r.idUsulan}')" title="Detail"><span class="material-icons">visibility</span></button>
            ${getDownloadBtn(r, 20, currentUser.role, currentUser.indikatorAkses)}
            <button class="btn-icon" onclick="openLogAktivitas('${r.idUsulan}')" title="Riwayat Aktivitas" style="background:transparent;border:none;color:#64748b"><span class="material-icons" style="font-size:18px">history</span></button>
          </td>
        </tr>`).join('')}
        </tbody>
      </table></div>`;
  } catch (e) { if (!window._verifSilentReload) toast(e.message, 'error'); }
}

function exportLaporan() {
  const data = window._laporanData;
  if (!data || !data.length) return toast('Tidak ada data untuk diekspor', 'warning');
  const headers = ['No','ID Usulan','Puskesmas','Periode','Tgl Dibuat','Indeks SPM','Status','Dibuat Oleh'];
  const rows = data.map(r => [
    r.no, r.idUsulan, r.namaPKM,
    r.namaBulan + ' ' + r.tahun,
    formatDateTime(r.createdAt),
    parseFloat(r.indeksSPM||0).toFixed(2),
    r.statusGlobal, r.createdBy||''
  ]);
  _downloadExcel('Laporan_SPM', headers, rows);
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
  tc.innerHTML = '<div class="empty-state"><span class="material-icons" style="animation:spin 1s linear infinite">refresh</span><p>Memuat...</p></div>';

  setLoading(true);
  try {
    if (activeTab === 'pejabat') {
      await renderPejabatTab(tc);
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
          <div class="empty-state"><span class="material-icons" style="animation:spin 1s linear infinite">refresh</span><p>Memuat...</p></div>
        </div>
      </div>
    </div>`;
  try {
    const res = await fetch('/api/pejabat');
    const data = await res.json();
    const list = data.success ? data.data : [];
    const jabatanList = ['Kepala Sub Bagian Perencanaan', 'Kepala Dinas Kesehatan PPKB'];
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
    await fetch('/api/pejabat', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ jabatan, nama, nip, tandaTangan: tanda_tangan })
    });
    toast('Data '+jabatan+' berhasil disimpan!', 'success');
    renderPejabatTab(document.getElementById('masterTabContent'));
    // Auto-refresh tombol verifikasi jika modal verifikasi terbuka (Admin)
    const verifModal = document.getElementById('verifikasiModal');
    if (verifModal && verifModal.classList.contains('show')) {
      // Re-cek status TT pejabat dari data terbaru
      try {
        const pjList = await fetch('/api/pejabat').then(r=>r.json()).then(d=>d.data||[]);
        const kasubag = pjList.find(p => p.jabatan === 'Kepala Sub Bagian Perencanaan');
        const kadis   = pjList.find(p => p.jabatan === 'Kepala Dinas Kesehatan PPKB');
        const ttOk = !!(kasubag?.tanda_tangan && kadis?.tanda_tangan);
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
          <div class="search-input-wrap"><span class="material-icons search-icon">search</span><input class="search-input" id="searchUser" placeholder="Cari email atau nama..." oninput="filterUsers()"></div>
          <select class="form-control" id="filterRole" onchange="filterUsers()" style="width:160px">
            <option value="">Semua Role</option>
            <option>Admin</option><option>Operator</option><option>Kepala Puskesmas</option>
            <option>Pengelola Program</option>
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
                  <option>Admin</option><option>Operator</option><option>Kepala Puskesmas</option>
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
                  <div style="color:var(--text-light);font-size:12px;padding:4px">Memuat daftar jabatan...</div>
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
    [allUsers, allPKMList, allIndList] = await Promise.all([API.getUsers(), API.getPKM(), API.getIndikator()]);
    window.allIndList = allIndList;
    renderUsersTable(allUsers);

    // Fill PKM dropdown
    const pkmSel = document.getElementById('uPKM');
    allPKMList.forEach(p => pkmSel.innerHTML += `<option value="${p.kode}">${p.nama}</option>`);
  } catch (e) { if (!window._verifSilentReload) toast(e.message, 'error'); }
}

function filterUsers() {
  const q = document.getElementById('searchUser').value.toLowerCase();
  const role = document.getElementById('filterRole').value;
  const filtered = allUsers.filter(u =>
    (!q || u.email.toLowerCase().includes(q) || u.nama.toLowerCase().includes(q)) &&
    (!role || u.role === role)
  );
  _usersPage = 1;
  renderUsersTable(filtered);
}

let _usersPage = 1;
function renderUsersTable(users, page) {
  const el = document.getElementById('usersTable');
  if (!el) return;
  if (page) _usersPage = page;
  const filteredUsers = users.filter(u => u.role !== 'Super Admin' && u.email !== 'admin@vispm.com');
  const { items, page: p, totalPages, total } = paginateData(filteredUsers, _usersPage);
  const rowsHtml = items.map(u => `<tr>
      <td style="font-family:'JetBrains Mono';font-size:12px">${u.email}</td>
      <td>${u.nama}</td>
      <td style="font-family:'JetBrains Mono';font-size:11px;color:var(--text-light)">${u.nip || '-'}</td>
      <td><span class="badge badge-info">${u.role}</span></td>
      <td>${u.namaPKM || u.kodePKM || '-'}</td>
      <td style="font-size:12px">${u.role === 'Pengelola Program' ? (u.jabatan ? u.jabatan.split('|').map(j=>'<div style="font-weight:600;color:var(--primary);font-size:11px;white-space:nowrap">'+j.trim()+'</div>').join('') : '') + '<div style="color:var(--text-light);font-size:11px">'+(u.indikatorAkses || '')+'</div>' : ''}</td>
      <td>${u.aktif ? '<span class="badge badge-success">Aktif</span>' : '<span class="badge badge-default">Non-aktif</span>'}</td>
      <td style="display:flex;gap:4px">
        <button class="btn-icon edit" onclick="editUser('${u.email}')"><span class="material-icons">edit</span></button>
        <button class="btn-icon" title="Reset Password" style="color:#0d9488" onclick="resetUserPassword('${u.email}','${u.nama}')"><span class="material-icons">lock_reset</span></button>
        <button class="btn-icon del" onclick="deleteUser('${u.email}')"><span class="material-icons">delete</span></button>
      </td>
    </tr>`).join('');
  el.innerHTML = '<div class="table-container"><table>'
    + '<thead><tr><th>Email</th><th>Nama</th><th>NIP</th><th>Role</th><th>Puskesmas</th><th>Jabatan/Indikator</th><th>Status</th><th>Aksi</th></tr></thead>'
    + '<tbody>' + rowsHtml + '</tbody></table></div>'
    + renderPagination('usersTable', total, p, totalPages, 'pg => { _usersPage=pg; renderUsersTable(allUsers); }');
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

let _jabPage = 1;
async function loadJabatanTable(page) {
  if (page) _jabPage = page;
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

    const { items, page: p, totalPages, total } = paginateData(_jabatanAllList, _jabPage);
    const rowsHtml = items.map((j, i) => `<tr>
        <td>${(p-1)*ITEMS_PER_PAGE + i + 1}</td>
        <td style="font-weight:500">${j.nama}</td>
        <td>${j.aktif
          ? '<span style="background:#d1fae5;color:#065f46;padding:2px 10px;border-radius:20px;font-size:12px;font-weight:600">Aktif</span>'
          : '<span style="background:#f1f5f9;color:#94a3b8;padding:2px 10px;border-radius:20px;font-size:12px;font-weight:600">Non-aktif</span>'}</td>
        <td>
          <button class="btn-icon edit" onclick="openJabatanModal(${j.id})" title="Edit"><span class="material-icons">edit</span></button>
          <button class="btn-icon del" onclick="deleteJabatan(${j.id}, '${j.nama.replace(/'/g, "\'")}')" title="Hapus"><span class="material-icons">delete</span></button>
        </td>
      </tr>`).join('');
    el.innerHTML = '<div class="table-container"><table>'
      + '<thead><tr><th>No</th><th>Nama Jabatan</th><th>Status</th><th>Aksi</th></tr></thead>'
      + '<tbody>' + rowsHtml + '</tbody></table></div>'
      + renderPagination('jabatanTable', total, p, totalPages, 'pg => { _jabPage=pg; loadJabatanTable(); }');
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
  const { items, page: p, totalPages, total } = paginateData(pkm, _pkmPage);
  const rowsHtml = items.map(p => {
    const kodeQ = p.kode.replace(/'/g, "\'");
    return '<tr>'
      + '<td><span style="font-family:JetBrains Mono,monospace;font-weight:700">'+p.kode+'</span></td>'
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
            <thead><tr><th style="width:40px">No</th><th>Nama Indikator</th><th style="width:160px;text-align:center">Jumlah Sasaran (Satu Tahun)</th></tr></thead>
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
  const { items, page: p, totalPages, total } = paginateData(inds, _indPage);
  const rowsHtml = items.map(i => `<tr>
      <td><span style="font-family:'JetBrains Mono';font-weight:700">${i.no}</span></td>
      <td>${i.nama}</td>
      <td style="text-align:center"><span style="font-family:'JetBrains Mono'">${i.bobot}</span></td>
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
        <div id="periodeGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;margin-top:16px"></div>
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
        const _svgNotif= '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>';
        const jm  = p.jamMulai   || '08:00';
        const js  = p.jamSelesai || '17:00';
        return `<div style="border:1.5px solid #a7f3d0;border-radius:10px;overflow:hidden;background:white;box-shadow:0 1px 4px rgba(13,148,136,0.08);cursor:pointer" onclick="editPeriode(${p.tahun},${p.bulan})">
          <div style="background:linear-gradient(135deg,#0d9488,#06b6d4);padding:8px 14px;color:white;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:space-between">
            <div style="display:flex;align-items:center;gap:7px"><span style="opacity:0.9;display:flex">${_svgCal}</span> Periode Aktif: ${p.namaBulan} ${p.tahun}</div>
            <span class="badge badge-success" style="background:rgba(255,255,255,0.25);color:white;border:1px solid rgba(255,255,255,0.4);font-size:10px">Aktif Hari Ini</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr">
            <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:#f0fdf9;border-right:1px solid #d1fae5">
              <span style="color:#0d9488;display:flex;flex-shrink:0">${_svgOpen}</span>
              <div><div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.4px">Dibuka</div>
              <div style="font-size:12px;font-weight:700;color:#0f172a">${formatDate(p.tanggalMulai)} ${jm} WITA</div></div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:#fef2f2">
              <span style="color:#ef4444;display:flex;flex-shrink:0">${_svgClose}</span>
              <div><div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.4px">Ditutup</div>
              <div style="font-size:12px;font-weight:700;color:#0f172a">${formatDate(p.tanggalSelesai)} ${js} WITA</div></div>
            </div>
          </div>
          ${p.notifOperator ? `<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 14px;background:#fffbeb;border-top:1px solid #fcd34d"><span style="color:#d97706;display:flex;flex-shrink:0;margin-top:1px">${_svgNotif}</span><div style="font-size:12px;color:#0f172a;line-height:1.5">${p.notifOperator}</div></div>` : ''}
        </div>`;
      }

      const borderColor = isTidakAktif ? '#e2e8f0' : 'var(--primary)';
      const bg = isTidakAktif ? '#f8fafc' : 'var(--surface)';
      const badgeHtml = isTidakAktif
        ? '<span class="badge badge-default" style="color:#94a3b8">Tidak Aktif</span>'
        : '<span class="badge badge-info">Aktif</span>';
      return `<div style="border:2px solid ${borderColor};border-radius:12px;padding:16px;background:${bg};cursor:pointer;opacity:${isTidakAktif?'0.65':'1'}" onclick="editPeriode(${p.tahun},${p.bulan})">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="font-weight:700;font-size:15px">${p.namaBulan} ${p.tahun}</span>
          ${badgeHtml}
        </div>
        <div style="font-size:12px;color:var(--text-light);display:flex;flex-direction:column;gap:3px">
          <div>Mulai: ${formatDate(p.tanggalMulai)}${p.jamMulai ? ` pukul ${p.jamMulai}` : ''}</div>
          <div>Selesai: ${formatDate(p.tanggalSelesai)}${p.jamSelesai ? ` pukul ${p.jamSelesai}` : ''}</div>
          ${p.notifOperator ? `<div style="margin-top:6px;padding:5px 8px;background:rgba(13,148,136,0.08);border-radius:6px;color:var(--text-md);font-size:11px;border-left:3px solid var(--primary)"><span style="font-weight:600">Notif:</span> ${p.notifOperator}</div>` : ''}
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
  document.getElementById('pNotif').value = '';
  document.getElementById('pStatus').value = 'Aktif';
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

async function hapusPeriode() {
  if (!_editPeriodeTahun || !_editPeriodeBulan) return;
  showConfirm({
    title: 'Hapus Periode',
    message: `Hapus periode <strong>${BULAN_NAMA[_editPeriodeBulan]} ${_editPeriodeTahun}</strong>?`,
    type: 'danger',
    onConfirm: async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/periode?tahun=${_editPeriodeTahun}&bulan=${_editPeriodeBulan}`, { method: 'DELETE' });
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Gagal menghapus');
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
  const notifOperator = document.getElementById('pNotif').value.trim();
  const status = document.getElementById('pStatus').value;
  if (!tanggalMulai || !tanggalSelesai) return toast('Tanggal mulai dan selesai harus diisi', 'error');
  setLoading(true);
  try {
    await API.savePeriode({ tahun, bulan, namaBulan: BULAN_NAMA[bulan], tanggalMulai, tanggalSelesai, jamMulai, jamSelesai, notifOperator, status });
    toast('Periode berhasil disimpan', 'success');
    closeModal('periodeModal');
    loadPeriodeGrid();
  } catch (e) { toast(e.message, 'error'); }
  finally { setLoading(false); }
}

// ============== GLOBAL HELPERS ==============
function showModal(id) { document.getElementById(id)?.classList.add('show'); }
function closeModal(id) {
  if (id === 'verifikasiModal') window._verifTTOk = true; // reset saat tutup
  document.getElementById(id)?.classList.remove('show');
}
function setLoading(show) { document.getElementById('globalLoader').classList.toggle('show', show); }

// Close modal on backdrop click
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal')) {
    e.target.classList.remove('show');
  }
});

// Enter key on auth
// ============== IDLE AUTO LOGOUT ==============
const IDLE_TIMEOUT      = 30 * 60 * 1000; // 30 menit idle → logout
const IDLE_WARN_BEFORE  =  2 * 60 * 1000; // tampilkan warning 2 menit sebelum logout
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
          <span class="material-icons" style="font-size:18px">touch_app</span> Saya Masih Di Sini
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
      localStorage.removeItem('spm_user');
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

let _kuPage = 1, _kuRows = [];
async function loadKelolaUsulan(page) {
  if (page) _kuPage = page;
  const params = { tahun: document.getElementById('kuTahun')?.value };
  const bulan = document.getElementById('kuBulan')?.value;
  const status = document.getElementById('kuStatus')?.value;
  if (bulan) params.bulan = bulan;
  if (status) params.status = status;

  try {
    if (!page) { _kuRows = await API.getUsulan(params); _kuPage = 1; }
    const el = document.getElementById('kuTable');
    if (!_kuRows.length) {
      el.innerHTML = `<div class="empty-state" style="padding:32px"><span class="material-icons">inbox</span><p>Tidak ada usulan</p></div>`;
      return;
    }
    const { items, page: p, totalPages, total } = paginateData(_kuRows, _kuPage);
    const rowsHtml = items.map(u => `<tr>
        <td><span style="font-family:'JetBrains Mono',monospace;font-weight:600;font-size:12px">${u.idUsulan}</span></td>
        <td>${u.namaPKM || u.kodePKM}</td>
        <td style="font-size:12px">${u.createdBy || '-'}</td>
        <td>${u.namaBulan || ''} ${u.tahun}</td>
        <td class="rasio-cell" style="font-weight:700;color:var(--primary)">${parseFloat(u.indeksSPM||0).toFixed(2)}</td>
        <td>${statusBadge(u.statusGlobal)}</td>
        <td style="font-size:12px;color:var(--text-light)">${formatDateTime(u.createdAt)}</td>
        <td style="display:flex;gap:4px">
          <button class="btn-icon view" onclick="viewDetail('${u.idUsulan}')" title="Detail"><span class="material-icons">visibility</span></button>
          <button class="btn-icon edit" onclick="adminEditUsulan('${u.idUsulan}')" title="Edit"><span class="material-icons">edit</span></button>
          <button class="btn-icon del" onclick="adminDeleteUsulan('${u.idUsulan}')" title="Hapus"><span class="material-icons">delete</span></button>
          ${u.statusGlobal === 'Menunggu Admin' && u.statusKapus !== 'Selesai'
            ? `<button class="btn-icon" onclick="restoreVerifAdmin('${u.idUsulan}')" title="Pulihkan verifikasi Kapus & Program" style="background:transparent;border:none;color:#f59e0b"><span class="material-icons">restore</span></button>`
            : ''}
        </td>
      </tr>`).join('');
    el.innerHTML = '<div class="table-container"><table>'
      + '<thead><tr><th>ID Usulan</th><th>Puskesmas</th><th>Operator</th><th>Periode</th><th>Indeks SPM</th><th>Status</th><th>Dibuat</th><th>Aksi</th></tr></thead>'
      + '<tbody>' + rowsHtml + '</tbody></table></div>'
      + renderPagination('kuTable', total, p, totalPages, 'pg => loadKelolaUsulan(pg)');
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


// ============== MASTER DATA TAB WRAPPERS ==============
const _masterTabs = [
  { id: 'users',           icon: 'group',          label: 'Kelola User' },
  { id: 'jabatan',         icon: 'badge',           label: 'Jabatan' },
  { id: 'pkm',             icon: 'local_hospital',  label: 'Puskesmas' },
  { id: 'indikator',       icon: 'monitor_heart',   label: 'Indikator' },
  { id: 'periode',         icon: 'event_available', label: 'Periode' },
  { id: 'target-tahunan',  icon: 'track_changes',   label: 'Target Tahunan' },
  { id: 'pejabat',         icon: 'draw',            label: 'Pejabat Penandatangan' },
  { id: 'audit-trail',     icon: 'manage_search',   label: 'Audit Trail' },
];


// ============== AUDIT TRAIL ==============
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
              <option value="auth">Login / Auth</option>
              <option value="usulan">Usulan</option>
              <option value="users">User</option>
              <option value="puskesmas">Puskesmas</option>
              <option value="indikator">Indikator</option>
              <option value="periode">Periode</option>
              <option value="settings">Pengaturan</option>
            </select>
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;color:#64748b;display:block;margin-bottom:4px">Aksi</label>
            <select class="form-control" id="atAction" style="width:140px">
              <option value="">Semua Aksi</option>
              <option value="LOGIN">Login</option>
              <option value="CREATE">Tambah</option>
              <option value="UPDATE">Ubah</option>
              <option value="DELETE">Hapus</option>
              <option value="SUBMIT">Submit</option>
              <option value="APPROVE">Approve</option>
              <option value="REJECT">Tolak</option>
            </select>
          </div>
          <div style="flex:1;min-width:160px">
            <label style="font-size:12px;font-weight:600;color:#64748b;display:block;margin-bottom:4px">Cari User</label>
            <input type="text" class="form-control" id="atUser" placeholder="Email atau nama...">
          </div>
          <button class="btn btn-primary" onclick="loadAuditTrail()">
            <span class="material-icons">search</span>Tampilkan
          </button>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-body" style="padding:0" id="auditTrailTable">
        <div class="empty-state" style="padding:40px">
          <span class="material-icons" style="font-size:40px;color:#cbd5e1">manage_search</span>
          <p>Memuat log 7 hari terakhir...</p>
        </div>
      </div>
    </div>`;

  loadAuditTrail();
}

async function loadAuditTrail() {
  const el = document.getElementById('auditTrailTable');
  if (!el) return;
  el.innerHTML = `<div class="empty-state" style="padding:32px"><span class="material-icons" style="animation:spin 1s linear infinite">refresh</span><p>Memuat...</p></div>`;

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

  const PAGE_SIZE = 11;
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
    // Always show first, last, current ±2
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
        </tr>`;
      }).join('')}
      </tbody>
    </table></div>
    ${buildPagination()}`;
}

function exportAuditTrail() {
  const data = window._auditTrailData;
  if (!data || !data.length) return toast('Tidak ada data untuk diekspor', 'warning');
  const headers = ['Waktu','Modul','Aksi','Email','Nama','Role','Detail','IP Address'];
  const rows = data.map(r => [
    formatDateTime(r.created_at), r.module||'', r.action||'',
    r.user_email||'', r.user_nama||'', r.user_role||'',
    r.detail||'', r.ip_address||''
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

  el.innerHTML = `<div style="padding:20px;text-align:center;color:#94a3b8;font-size:13px">
    <span class="material-icons" style="animation:spin 1s linear infinite;display:block;margin:0 auto 8px">refresh</span>Mencari...
  </div>`;

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


// ============== NOTIFIKASI IN-APP ==============
let _notifInterval = null;
let _notifCount = 0;

async function fetchNotifCount() {
  if (!currentUser) return;
  try {
    const role = currentUser.role;
    const params = { role, email: currentUser.email, kode_pkm: currentUser.kodePKM };
    const d = await API.dashboard(params);

    let count = 0;
    if (role === 'Operator') {
      // Usulan yang ditolak dan perlu diperbaiki
      const myUsulan = await API.getUsulan({ email_operator: currentUser.email }).catch(() => []);
      count = (myUsulan || []).filter(u => u.statusGlobal === 'Ditolak').length;
    } else if (role === 'Kepala Puskesmas') {
      count = d.menunggu || 0;
    } else if (role === 'Pengelola Program') {
      count = d.menunggu || 0;
    } else if (role === 'Admin') {
      const allUsulan = await API.getUsulan({}).catch(() => []);
      count = (allUsulan || []).filter(u => u.statusGlobal === 'Menunggu Admin').length;
    }

    _notifCount = count;
    updateNotifBadge(count);
  } catch(e) {}
}

function updateNotifBadge(count) {
  // Update badge di topbar
  let badge = document.getElementById('notifBadge');
  const btn = document.getElementById('notifBtn');
  if (!btn) return;

  if (count > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.id = 'notifBadge';
      badge.style.cssText = 'position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;background:#ef4444;color:white;border-radius:20px;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;padding:0 4px;border:2px solid white;line-height:1';
      btn.style.position = 'relative';
      btn.appendChild(badge);
    }
    badge.textContent = count > 99 ? '99+' : count;
    badge.style.display = 'flex';
  } else {
    if (badge) badge.style.display = 'none';
  }

  // Update title halaman
  const base = 'VISPM | Verifikasi Indeks SPM';
  document.title = count > 0 ? `(${count}) ${base}` : base;
}

function toggleNotifPanel() {
  let panel = document.getElementById('notifPanel');
  if (panel) {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    if (panel.style.display === 'block') loadNotifPanel();
    return;
  }

  panel = document.createElement('div');
  panel.id = 'notifPanel';
  panel.style.cssText = 'position:absolute;top:calc(100% + 8px);right:0;width:340px;background:white;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.15);border:1px solid #e2e8f0;z-index:9000;overflow:hidden';
  panel.innerHTML = `
    <div style="padding:12px 16px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between">
      <span style="font-size:14px;font-weight:700;color:#1e293b">Notifikasi</span>
      <button onclick="document.getElementById('notifPanel').style.display='none'" style="background:none;border:none;cursor:pointer;color:#94a3b8;display:flex"><span class="material-icons" style="font-size:18px">close</span></button>
    </div>
    <div id="notifPanelBody" style="max-height:360px;overflow-y:auto">
      <div style="padding:24px;text-align:center;color:#94a3b8;font-size:13px">Memuat...</div>
    </div>`;

  const wrap = document.getElementById('notifBtnWrap');
  if (wrap) { wrap.style.position = 'relative'; wrap.appendChild(panel); }

  loadNotifPanel();

  // Tutup saat klik di luar
  setTimeout(() => {
    document.addEventListener('click', function handler(e) {
      const p = document.getElementById('notifPanel');
      const w = document.getElementById('notifBtnWrap');
      if (p && w && !w.contains(e.target)) {
        p.style.display = 'none';
        document.removeEventListener('click', handler);
      }
    });
  }, 100);
}

async function loadNotifPanel() {
  const el = document.getElementById('notifPanelBody');
  if (!el) return;

  try {
    const role = currentUser.role;
    const items = [];

    if (role === 'Operator') {
      const myUsulan = await API.getUsulan({ email_operator: currentUser.email }).catch(() => []);
      (myUsulan || []).filter(u => u.statusGlobal === 'Ditolak').forEach(u => {
        items.push({ icon: 'cancel', color: '#ef4444', bg: '#fef2f2',
          title: `Usulan ${u.idUsulan} Ditolak`,
          sub: `${u.namaBulan} ${u.tahun} — ${u.namaPKM}`,
          action: `openIndikatorModal('${u.idUsulan}')` });
      });
    } else if (role === 'Kepala Puskesmas') {
      const list = await API.getUsulan({ kode_pkm: currentUser.kodePKM }).catch(() => []);
      (list || []).filter(u => u.statusGlobal === 'Menunggu Kepala Puskesmas').forEach(u => {
        items.push({ icon: 'hourglass_top', color: '#f59e0b', bg: '#fffbeb',
          title: `Menunggu Verifikasi Anda`,
          sub: `${u.idUsulan} · ${u.namaBulan} ${u.tahun}`,
          action: `loadPage('verifikasi')` });
      });
    } else if (role === 'Pengelola Program') {
      const list = await API.getUsulan({ email_program: currentUser.email }).catch(() => []);
      (list || []).filter(u => u.statusGlobal === 'Menunggu Pengelola Program').forEach(u => {
        items.push({ icon: 'hourglass_top', color: '#2563eb', bg: '#eff6ff',
          title: `Menunggu Verifikasi Program`,
          sub: `${u.idUsulan} · ${u.namaBulan} ${u.tahun}`,
          action: `loadPage('verifikasi')` });
      });
    } else if (role === 'Admin') {
      const list = await API.getUsulan({}).catch(() => []);
      (list || []).filter(u => u.statusGlobal === 'Menunggu Admin').forEach(u => {
        items.push({ icon: 'admin_panel_settings', color: '#8b5cf6', bg: '#f5f3ff',
          title: `Menunggu Persetujuan Admin`,
          sub: `${u.idUsulan} · ${u.namaPKM} · ${u.namaBulan} ${u.tahun}`,
          action: `loadPage('verifikasi')` });
      });
    }

    if (!items.length) {
      el.innerHTML = `<div style="padding:32px;text-align:center;color:#94a3b8;font-size:13px">
        <span class="material-icons" style="font-size:36px;display:block;margin-bottom:8px;color:#d1fae5">check_circle</span>
        Tidak ada notifikasi baru
      </div>`;
      return;
    }

    el.innerHTML = items.map(item => `
      <button onclick="${item.action};document.getElementById('notifPanel').style.display='none'"
        style="width:100%;display:flex;align-items:flex-start;gap:10px;padding:12px 16px;background:none;border:none;border-bottom:1px solid #f8fafc;cursor:pointer;text-align:left"
        onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='none'">
        <div style="width:34px;height:34px;border-radius:10px;background:${item.bg};display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px">
          <span class="material-icons" style="font-size:17px;color:${item.color}">${item.icon}</span>
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${item.title}</div>
          <div style="font-size:11.5px;color:#64748b;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${item.sub}</div>
        </div>
      </button>`).join('');
  } catch(e) {
    el.innerHTML = `<div style="padding:20px;text-align:center;color:#ef4444;font-size:13px">Gagal memuat notifikasi</div>`;
  }
}

function startNotifPoller() {
  fetchNotifCount();
  clearInterval(_notifInterval);
  _notifInterval = setInterval(fetchNotifCount, 60000); // cek tiap 1 menit
}

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
}
