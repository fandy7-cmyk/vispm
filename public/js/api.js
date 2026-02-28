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
  login: (email) => API.post('auth', { email }),

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
  approveAdmin: (data) => API.post('usulan?action=approve-admin', data),
  rejectUsulan: (data) => API.post('usulan?action=reject', data),

  // Laporan
  getLaporan: (params) => API.get('laporan', params),

  // Jabatan
  getJabatan: () => API.get('jabatan'),
  saveJabatan: (data) => API.post('jabatan', data),
  deleteJabatan: (id) => API.del('jabatan', { id })
};

// Utils
const BULAN_NAMA = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

// ============== STATUS BAR ==============
function renderStatusBar(u) {
  const vp = u.vpProgress;
  const steps = [
    { label: 'Input', icon: 'edit_note', done: true, active: u.statusGlobal === 'Draft', rejected: false },
    { label: 'Kapus', icon: 'person', done: u.statusKapus === 'Selesai', active: u.statusGlobal === 'Menunggu Kapus', rejected: u.statusKapus === 'Ditolak' },
    { label: 'Program', icon: 'groups', done: u.statusProgram === 'Selesai', active: u.statusGlobal === 'Menunggu Program', rejected: u.statusProgram === 'Ditolak',
      partial: vp && vp.selesai > 0 && vp.selesai < vp.total, vpText: vp ? vp.selesai + '/' + vp.total : '' },
    { label: 'Admin', icon: 'admin_panel_settings', done: u.statusGlobal === 'Selesai', active: u.statusGlobal === 'Menunggu Admin', rejected: false },
  ];
  const isDitolak = u.statusGlobal === 'Ditolak';
  return `<div style="display:flex;align-items:center;gap:0;padding:4px 0">${steps.map((s, i) => {
    let color = '#cbd5e1', textColor = '#94a3b8', bg = 'white';
    let icon = s.icon;
    if (s.done) { color='#0d9488'; textColor='#0d9488'; bg='#e6fffa'; icon='check_circle'; }
    else if (isDitolak && s.rejected) { color='#ef4444'; textColor='#ef4444'; bg='#fef2f2'; icon='cancel'; }
    else if (s.active) { color='#f59e0b'; textColor='#d97706'; bg='#fffbeb'; icon='hourglass_top'; }
    else if (s.partial) { color='#06b6d4'; textColor='#0891b2'; bg='#ecfeff'; icon='hourglass_top'; }
    return '<div style="display:flex;align-items:center;flex:1">' +
      '<div style="display:flex;flex-direction:column;align-items:center;gap:1px;flex:1">' +
        '<div style="width:28px;height:28px;border-radius:50%;background:' + bg + ';border:2px solid ' + color + ';display:flex;align-items:center;justify-content:center">' +
          '<span class="material-icons" style="font-size:15px;color:' + color + '">' + icon + '</span>' +
        '</div>' +
        '<span style="font-size:10px;font-weight:700;color:' + textColor + ';white-space:nowrap">' + s.label + '</span>' +
        (s.vpText && !s.done ? '<span style="font-size:9px;color:#0891b2">' + s.vpText + '</span>' : '') +
      '</div>' +
      (i < steps.length-1 ? '<div style="flex:1;height:2px;background:' + (s.done ? '#0d9488' : '#e2e8f0') + ';margin-bottom:18px;min-width:8px"></div>' : '') +
    '</div>';
  }).join('')}</div>`;
}

function formatDate(d) {
  if (!d) return '-';
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return '-'; }
}

function formatDateTime(d) {
  if (!d) return '-';
  try {
    const dt = new Date(d);
    return dt.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return '-'; }
}

function statusBadge(status) {
  const map = {
    'Draft': 'badge-default',
    'Menunggu Kapus': 'badge-warning',
    'Menunggu Program': 'badge-info',
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
  el.className = `toast-notification ${t.cls}`;
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

function showModal(id) {
  const m = document.getElementById(id);
  if (m) m.style.display = 'flex';
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.style.display = 'none';
}

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

// Loading state
function setLoading(show) {
  const el = document.getElementById('globalLoader');
  if (el) el.style.display = show ? 'flex' : 'none';
}

// Current year for select defaults
const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_BULAN = new Date().getMonth() + 1;
