// API client for SPM Verifikasi app
const API = {
  BASE: '/api',

  async call(endpoint, options = {}) {
    try {
      // Ambil session token dari sessionStorage
      const _user = (() => { try { return JSON.parse(sessionStorage.getItem('spm_user') || '{}'); } catch(e) { return {}; } })();
      const _token = _user.sessionToken || '';
      const _authHeader = _token ? { 'Authorization': 'Bearer ' + _token } : {};

      const res = await fetch(`${this.BASE}/${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ..._authHeader,
          ...(options.headers || {}),
        },
      });

      // 401 — session tidak valid / digantikan device lain
      if (res.status === 401) {
        const data = await res.json().catch(() => ({}));
        const msg = data.message || 'Sesi berakhir. Silakan login kembali.';
        sessionStorage.removeItem('spm_user');
        if (!window._intentionalLogout) _showSessionExpired(msg);
        throw new Error(msg);
      }

      // Server error (5xx) — mungkin return HTML bukan JSON, tangkap duluan
      if (res.status >= 500) {
        throw new Error(`Server error (${res.status}). Coba beberapa saat lagi.`);
      }

      // Rate limit / lockout
      if (res.status === 429) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Terlalu banyak percobaan. Coba lagi nanti.');
      }

      const data = await res.json();

      // 202 = needConfirm (submit dengan bukti belum lengkap), teruskan apa adanya ke caller
      if (res.status === 202) return data;

      // 409 = conflict (duplikat data)
      if (res.status === 409) {
        throw new Error(data.message || 'Data sudah ada (konflik).');
      }

      if (!data.success) throw new Error(data.message || 'Terjadi kesalahan');
      return data.data;
    } catch (e) {
      throw e;
    }
  },

  async get(endpoint, params = {}) {
    const qs = new URLSearchParams(params).toString();
    const url = qs ? `${endpoint}?${qs}` : endpoint;
    return this.call(url, { method: 'GET' });
  },

  async post(endpoint, body) {
    return this.call(endpoint, { method: 'POST', body: JSON.stringify(body) });
  },

  async put(endpoint, body) {
    return this.call(endpoint, { method: 'PUT', body: JSON.stringify(body) });
  },

  async del(endpoint, body) {
    return this.call(endpoint, { method: 'DELETE', body: JSON.stringify(body) });
  },

  // Auth
  login: (email, password) => API.post('auth', { email, password }),
  logout: () => {
    const _user = (() => { try { return JSON.parse(sessionStorage.getItem('spm_user') || '{}'); } catch(e) { return {}; } })();
    const token = _user.sessionToken || '';
    if (token) API.post('auth', { action: 'logout', token }).catch(() => {});
    sessionStorage.removeItem('spm_user');
  },

  // Dashboard
  dashboard: (params) => API.get('dashboard', params),

  // Users
  getUsers:    ()     => API.get('users'),
  createUser:  (data) => API.post('users', data),
  updateUser:  (data) => API.put('users', data),
  deleteUser:  (email)=> API.del('users', { email }),
  /** @deprecated gunakan createUser() */
  saveUser:    (data) => API.post('users', data),

  // Puskesmas
  getPKM:    (aktif) => API.get('puskesmas', aktif ? { aktif: 'true' } : {}),
  createPKM: (data)  => API.post('puskesmas', data),
  updatePKM: (data)  => API.put('puskesmas', data),
  deletePKM: (kode)  => API.del('puskesmas', { kode }),
  /** @deprecated gunakan createPKM() */
  savePKM:   (data)  => API.post('puskesmas', data),

  // Indikator
  getIndikator:    ()     => API.get('indikator'),
  createIndikator: (data) => API.post('indikator', data),
  updateIndikator: (data) => API.put('indikator', data),
  deleteIndikator: (no)   => API.del('indikator', { no }),
  /** @deprecated gunakan createIndikator() */
  saveIndikator: (data)   => API.post('indikator', data),

  // Periode
  getPeriode:    (tahun) => API.get('periode', { tahun }),
  createPeriode: (data)  => API.post('periode', data),
  /** @deprecated gunakan createPeriode() */
  savePeriode:   (data)  => API.post('periode', data),

  // Usulan
  getUsulan:           (params) => API.get('usulan', params),
  getDetailUsulan:     (id)     => API.get('usulan', { action: 'detail', id }),
  getIndikatorUsulan:  (id)     => API.get('usulan', { action: 'indikator', id }),
  createUsulan:        (data)   => API.post('usulan?action=buat', data),
  updateIndikatorUsulan:(data)  => API.put('usulan?action=indikator', data),
  submitUsulan:        (data)   => API.post('usulan?action=submit', data),
  verifyKapus:         (data)   => API.post('usulan?action=verif-kapus', data),
  verifyProgram:       (data)   => API.post('usulan?action=verif-program', data),
  verifyAdmin:         (data)   => API.post('usulan?action=verif-admin', data),
  rejectUsulan:        (data)   => API.post('usulan?action=reject', data),
  getLogAktivitas:     (id)     => API.get('usulan', { action: 'log', id }),
  getPenolakanIndikator:(idUsulan) => API.get('usulan', { action: 'penolakan', idUsulan }),
  respondPenolakan:    (data)   => API.post('usulan?action=respond-penolakan', data),
  /** @deprecated gunakan createUsulan() */
  buatUsulan:   (data) => API.post('usulan?action=buat', data),
  /** @deprecated gunakan verifyKapus() */
  verifKapus:   (data) => API.post('usulan?action=verif-kapus', data),
  /** @deprecated gunakan verifyProgram() */
  verifProgram: (data) => API.post('usulan?action=verif-program', data),
  /** @deprecated gunakan verifyAdmin() */
  verifAdmin:   (data) => API.post('usulan?action=verif-admin', data),

  // Laporan
  getLaporan: (params) => API.get('laporan', params),

  // Jabatan
  getJabatan:    ()     => API.get('jabatan'),
  createJabatan: (data) => API.post('jabatan', data),
  updateJabatan: (data) => API.post('jabatan', data),  // backend pakai POST + id untuk update
  deleteJabatan: (id)   => API.del('jabatan', { id }),
  /** @deprecated gunakan createJabatan() */
  saveJabatan: (data)   => API.post('jabatan', data),

  // Audit Trail
  logAudit:      (data)   => API.post('audit-trail', data).catch(() => {}),
  getAuditTrail: (params) => API.get('audit-trail', params),

  // Konfigurasi Penandatangan Per Indikator
  getPenandatangan:    ()            => API.get('indikator-penandatangan'),
  savePenandatangan:   (data)        => API.post('indikator-penandatangan', data),
  deletePenandatangan: (noIndikator) => API.del('indikator-penandatangan', { noIndikator })
};

// Utils
const BULAN_NAMA = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

// ============== DOWNLOAD BUTTON HELPERS ==============
function btnDownloadFinal(idUsulan, size=20) {
  return `<button class="btn-icon" onclick="downloadLaporanPDF('${idUsulan}')" title="Download Laporan Final" style="background:transparent;border:none;color:#10b981">
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v10"/><path d="m8 9 4 4 4-4"/><path d="M4 17c0 2.2 1.8 4 4 4h8c2.2 0 4-1.8 4-4"/></svg>
  </button>`;
}
function btnDownloadSementara(idUsulan, size=20) {
  return `<button class="btn-icon" onclick="downloadLaporanSementara('${idUsulan}')" title="Download Laporan Sementara" style="background:transparent;border:none;color:#f59e0b">
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v10"/><path d="m8 9 4 4 4-4"/><path d="M4 17c0 2.2 1.8 4 4 4h8c2.2 0 4-1.8 4-4"/></svg>
  </button>`;
}
function btnDownloadFinalPP(idUsulan, akses, size=20) {
  const aksesStr = (akses||[]).join(',');
  return `<button class="btn-icon" onclick="bukaLaporan('${idUsulan}','final',${JSON.stringify(akses||[])})" title="Download Laporan Final (indikator Anda)" style="background:transparent;border:none;color:#10b981">
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v10"/><path d="m8 9 4 4 4-4"/><path d="M4 17c0 2.2 1.8 4 4 4h8c2.2 0 4-1.8 4-4"/></svg>
  </button>`;
}
function btnDownloadDisabled(size=20) {
  return `<button class="btn-icon" disabled title="Laporan belum tersedia" style="background:transparent;border:none;color:#cbd5e1;opacity:0.4;cursor:not-allowed">
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v10"/><path d="m8 9 4 4 4-4"/><path d="M4 17c0 2.2 1.8 4 4 4h8c2.2 0 4-1.8 4-4"/></svg>
  </button>`;
}
function getDownloadBtn(u, size=20, role, akses) {
  const r = (role||'').toLowerCase();
  if (r === 'program' || r === 'pengelola program') {
    if (u.statusGlobal === 'Selesai') return btnDownloadFinalPP(u.idUsulan, akses||[], size);
    return btnDownloadDisabled(size);
  }
  if (r === 'operator' || r === 'admin') {
    if (u.statusGlobal === 'Selesai') return btnDownloadSementara(u.idUsulan, size) + btnDownloadFinal(u.idUsulan, size);
    if (u.statusKapus === 'Selesai') return btnDownloadSementara(u.idUsulan, size) + btnDownloadDisabled(size);
    return btnDownloadDisabled(size);
  }
  // fallback (kepala-puskesmas, dll)
  if (u.statusGlobal === 'Selesai') return btnDownloadFinal(u.idUsulan, size);
  if (u.statusKapus === 'Selesai') return btnDownloadSementara(u.idUsulan, size);
  return btnDownloadDisabled(size);
}

// ============== STATUS BAR ==============
function renderStatusBar(u) {
  const vp = u.vpProgress;
  const steps = [
    { label: 'Input', icon: 'edit_note', done: true, active: u.statusGlobal === 'Draft', rejected: false },
    { label: 'Kepala Puskesmas', icon: 'person', done: u.statusKapus === 'Selesai', active: u.statusGlobal === 'Menunggu Kepala Puskesmas' || u.statusGlobal === 'Menunggu Re-verifikasi Kepala Puskesmas', rejected: u.statusKapus === 'Ditolak' },
    { label: 'Pengelola Program', icon: 'groups', done: u.statusProgram === 'Selesai', active: u.statusGlobal === 'Menunggu Pengelola Program' || u.statusGlobal === 'Menunggu Re-verifikasi PP', rejected: u.statusProgram === 'Ditolak',
      partial: (u.statusGlobal === 'Menunggu Pengelola Program' || u.statusGlobal === 'Menunggu Re-verifikasi PP') && vp && vp.selesai > 0 && vp.selesai < vp.total,
      vpText: (u.statusGlobal === 'Menunggu Pengelola Program' || u.statusGlobal === 'Menunggu Re-verifikasi PP') && vp && vp.total > 0 ? vp.selesai + '/' + vp.total : '' },
    { label: 'Admin', icon: 'admin_panel_settings', done: u.statusGlobal === 'Selesai', active: u.statusGlobal === 'Menunggu Admin', rejected: false },
  ];
  const isDitolak = ['Ditolak', 'Ditolak Sebagian'].includes(u.statusGlobal);
  return `<div style="display:flex;align-items:center;gap:0;padding:4px 0">${steps.map((s, i) => {
    let color = '#cbd5e1', textColor = '#94a3b8', bg = 'white';
    let icon = s.icon;
    if (s.done) { color='#0d9488'; textColor='#0d9488'; bg='#e6fffa'; icon='check_circle'; }
    else if (s.partial) { color='#06b6d4'; textColor='#0891b2'; bg='#ecfeff'; icon='hourglass_top'; }
    else if (isDitolak && s.rejected) { color='#ef4444'; textColor='#ef4444'; bg='#fef2f2'; icon='cancel'; }
    else if (s.active) { color='#f59e0b'; textColor='#d97706'; bg='#fffbeb'; icon='hourglass_top'; }
    return '<div style="display:flex;align-items:center;flex:1">' +
      '<div style="display:flex;flex-direction:column;align-items:center;gap:1px;flex:1">' +
        '<div style="width:28px;height:28px;border-radius:50%;background:' + bg + ';border:2px solid ' + color + ';display:flex;align-items:center;justify-content:center">' +
          '<span class="material-icons" style="font-size:15px;color:' + color + '">' + icon + '</span>' +
        '</div>' +
        '<span style="font-size:10px;font-weight:700;color:' + textColor + ';white-space:nowrap">' + s.label + '</span>' +
        (s.vpText && !s.done ? '<span style="font-size:9px;color:#0891b2">' + s.vpText + '</span>' : '') +
      '</div>' +
      (i < steps.length-1 ? '<div style="flex:1;height:2px;background:' + (s.done ? '#0d9488' : s.partial ? '#06b6d4' : '#e2e8f0') + ';margin-bottom:18px;min-width:8px"></div>' : '') +
    '</div>';
  }).join('')}</div>`;
}

function formatDate(d) {
  if (!d) return '-';
  try {
    return new Date(d).toLocaleDateString('id-ID', {
      timeZone: 'Asia/Makassar',
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch { return '-'; }
}

function formatDateTime(d) {
  if (!d) return '-';
  try {
    const dt = new Date(d);
    const o = { timeZone: 'Asia/Makassar' };
    const tgl = dt.toLocaleDateString('id-ID', { ...o, day: '2-digit', month: '2-digit', year: 'numeric' });
    const jam = dt.toLocaleTimeString('id-ID', { ...o, hour: '2-digit', minute: '2-digit', hour12: false });
    return `${tgl} | ${jam} WITA`;
  } catch { return '-'; }
}

function statusBadge(status) {
  const map = {
    'Draft': 'badge-default',
    'Menunggu Kepala Puskesmas': 'badge-warning',
    'Menunggu Pengelola Program': 'badge-info',
    'Menunggu Admin': 'badge-primary',
    'Selesai': 'badge-success',
    'Ditolak': 'badge-danger',
    'Ditolak Sebagian': 'badge-danger',
    'Disetujui': 'badge-success',
    'Menunggu': 'badge-warning',
    'Menunggu Re-verifikasi PP': 'badge-info',
    'Menunggu Re-verifikasi Kepala Puskesmas': 'badge-warning',
  };
  const cls = map[status] || 'badge-default';
  return `<span class="badge ${cls}" style="white-space:nowrap">${status || '-'}</span>`;
}

function toast(msg, type = 'success', title = null) {
  const t = type === 'success' ? { icon: 'check_circle', cls: 'success', title: title || 'Berhasil' }
    : type === 'error' ? { icon: 'error', cls: 'error', title: title || 'Error' }
    : { icon: 'warning', cls: 'warning', title: title || 'Perhatian' };

  if (window._sessionExpired) return;
  const el = document.getElementById('toastNotification');
  if (!el) return;
  el.className = `toast ${t.cls}`;
  document.getElementById('toastIcon').textContent = t.icon;
  document.getElementById('toastTitle').textContent = t.title;
  document.getElementById('toastMessage').textContent = msg;
  el.style.display = 'flex';
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => el.style.display = 'none', 4000);
}

function closeToast() {
  document.getElementById('toastNotification').style.display = 'none';
}

// showModal dan closeModal didefinisikan di app.js

function showConfirm({ title, message, onConfirm, type = 'danger' }) {
  window._confirmCallback = onConfirm;
  const el = document.getElementById('confirmModal');
  if (!el) return;

  const header = document.getElementById('confirmHeader');
  const titleEl = document.getElementById('confirmTitle');
  const msgEl = document.getElementById('confirmMessage');
  const icon = document.getElementById('confirmIcon');
  const btn = document.getElementById('confirmActionBtn');

  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.innerHTML = message;
  if (icon) icon.textContent = type === 'warning' ? 'warning' : 'delete';
  if (header) header.className = 'confirm-header ' + (type === 'warning' ? 'warning' : 'danger');
  if (btn) btn.className = 'btn btn-' + (type === 'warning' ? 'primary' : 'danger');

  el.classList.add('show');
}

function closeConfirmModal() {
  const el = document.getElementById('confirmModal');
  if (el) el.classList.remove('show');
}

function executeConfirm() {
  closeConfirmModal();
  if (window._confirmCallback) window._confirmCallback();
}

// setLoading didefinisikan di app.js

// Current year for select defaults
const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_BULAN = new Date().getMonth() + 1;

// ============== SESSION EXPIRED OVERLAY ==============
function _showSessionExpired(msg) {
  if (document.getElementById('_sessionExpiredOverlay')) return;
  // Sembunyikan toast yang sedang tampil & blok toast baru
  clearTimeout(window._toastTimer);
  const _toastEl = document.getElementById('toastNotification');
  if (_toastEl) _toastEl.style.display = 'none';
  window._sessionExpired = true;
  const isReplaced = msg && msg.toLowerCase().includes('perangkat lain');
  const title = isReplaced ? 'Sesi Digantikan' : 'Sesi Berakhir';
  const iconSvg = isReplaced
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18.01"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
  const overlay = document.createElement('div');
  overlay.id = '_sessionExpiredOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,0.7);backdrop-filter:blur(6px)';
  overlay.innerHTML = `
    <style>
      @keyframes _seIn{from{opacity:0;transform:translateY(10px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
      #_seCard{background:#fff;border-radius:20px;padding:36px 32px;max-width:340px;width:90%;text-align:center;border:1px solid rgba(0,0,0,.07);animation:_seIn .25s cubic-bezier(.16,1,.3,1)}
      #_seCard ._seIcon{width:52px;height:52px;border-radius:50%;background:#fef2f2;border:1px solid #fecaca;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;color:#dc2626}
      #_seCard ._seTitle{font-size:16px;font-weight:600;color:#0f172a;margin:0 0 8px;letter-spacing:-0.01em}
      #_seCard ._seMsg{font-size:13px;color:#64748b;margin:0 0 28px;line-height:1.65}
      #_seCard ._seBtn{display:block;width:100%;padding:11px 0;background:#dc2626;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:500;cursor:pointer;letter-spacing:0.01em;transition:background .15s}
      #_seCard ._seBtn:hover{background:#b91c1c}
      #_seCard ._seBtn:disabled{background:#94a3b8;cursor:not-allowed}
      #_seCard ._seFooter{font-size:11px;color:#94a3b8;margin:14px 0 0}
    </style>
    <div id="_seCard">
      <div class="_seIcon">${iconSvg}</div>
      <p class="_seTitle">${title}</p>
      <p class="_seMsg">${msg}</p>
      <button class="_seBtn" onclick="this.textContent='Mengalihkan\u2026';this.disabled=true;window.location.reload()">
        Login Kembali
      </button>
      <p class="_seFooter">VISPM | Verifikasi Indeks SPM</p>
    </div>`;
  document.body.appendChild(overlay);
}