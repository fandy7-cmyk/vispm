// API client for SPM Verifikasi app
const API = {
  BASE: '/api',

  async call(endpoint, options = {}) {
    try {
      const res = await fetch(`${this.BASE}/${endpoint}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options
      });
      const data = await res.json();
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

  // Dashboard
  dashboard: (params) => API.get('dashboard', params),

  // Users
  getUsers: () => API.get('users'),
  saveUser: (data) => API.post('users', data),
  updateUser: (data) => API.put('users', data),
  deleteUser: (email) => API.del('users', { email }),

  // Puskesmas
  getPKM: (aktif) => API.get('puskesmas', aktif ? { aktif: 'true' } : {}),
  savePKM: (data) => API.post('puskesmas', data),
  updatePKM: (data) => API.put('puskesmas', data),
  deletePKM: (kode) => API.del('puskesmas', { kode }),

  // Indikator
  getIndikator: () => API.get('indikator'),
  saveIndikator: (data) => API.post('indikator', data),
  updateIndikator: (data) => API.put('indikator', data),
  deleteIndikator: (no) => API.del('indikator', { no }),

  // Periode
  getPeriode: (tahun) => API.get('periode', { tahun }),
  savePeriode: (data) => API.post('periode', data),

  // Usulan
  getUsulan: (params) => API.get('usulan', params),
  getDetailUsulan: (id) => API.get('usulan', { action: 'detail', id }),
  getIndikatorUsulan: (id) => API.get('usulan', { action: 'indikator', id }),
  buatUsulan: (data) => API.post('usulan?action=buat', data),
  updateIndikatorUsulan: (data) => API.put('usulan?action=indikator', data),
  submitUsulan: (data) => API.post('usulan?action=submit', data),
  approveKapus: (data) => API.post('usulan?action=approve-kapus', data),
  approveProgram: (data) => API.post('usulan?action=approve-program', data),
  verifProgram: (data) => API.post('usulan?action=verif-program', data),
  approveAdmin: (data) => API.post('usulan?action=approve-admin', data),
  rejectUsulan: (data) => API.post('usulan?action=reject', data),
  getLogAktivitas: (id) => API.get('usulan', { action: 'log', id }),
  getPenolakanIndikator: (idUsulan) => API.get('usulan', { action: 'penolakan', idUsulan }),
  respondPenolakan: (data) => API.post('usulan?action=respond-penolakan', data),

  // Laporan
  getLaporan: (params) => API.get('laporan', params),

  // Jabatan
  getJabatan: () => API.get('jabatan'),
  saveJabatan: (data) => API.post('jabatan', data),
  deleteJabatan: (id) => API.del('jabatan', { id }),

  // Audit Trail
  logAudit: (data) => API.post('audit-trail', data).catch(() => {}),
  getAuditTrail: (params) => API.get('audit-trail', params)
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
    { label: 'Kepala Puskesmas', icon: 'person', done: u.statusKapus === 'Selesai', active: u.statusGlobal === 'Menunggu Kepala Puskesmas', rejected: u.statusKapus === 'Ditolak' },
    { label: 'Pengelola Program', icon: 'groups', done: u.statusProgram === 'Selesai', active: u.statusGlobal === 'Menunggu Pengelola Program', rejected: u.statusProgram === 'Ditolak',
      partial: u.statusGlobal === 'Menunggu Pengelola Program' && vp && vp.selesai > 0 && vp.selesai < vp.total,
      vpText: u.statusGlobal === 'Menunggu Pengelola Program' && vp && vp.total > 0 ? vp.selesai + '/' + vp.total : '' },
    { label: 'Admin', icon: 'admin_panel_settings', done: u.statusGlobal === 'Selesai', active: u.statusGlobal === 'Menunggu Admin', rejected: false },
  ];
  const isDitolak = u.statusGlobal === 'Ditolak';
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
    'Disetujui': 'badge-success',
    'Menunggu': 'badge-warning'
  };
  const cls = map[status] || 'badge-default';
  return `<span class="badge ${cls}">${status || '-'}</span>`;
}

function toast(msg, type = 'success', title = null) {
  const t = type === 'success' ? { icon: 'check_circle', cls: 'success', title: title || 'Berhasil' }
    : type === 'error' ? { icon: 'error', cls: 'error', title: title || 'Error' }
    : { icon: 'warning', cls: 'warning', title: title || 'Perhatian' };

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
