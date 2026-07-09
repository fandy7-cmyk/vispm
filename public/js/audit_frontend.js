// js/audit_frontend.js
// Audit Trail — log login & aksi sistem — admin only

'use strict';

let _auditPage  = 1;
let _auditLimit = 15;
let _auditTotal = 0;

const AKSI_LABEL = {
  login_success:      'Login Berhasil',
  login_failed:        'Login Gagal',
  login_blocked:        'Login Diblokir (Rate Limit)',
  change_password:    'Ganti Password',
  create:              'Tambah Surat',
  update:              'Update Surat',
  delete:              'Hapus Surat',
  update_status:       'Update Status Selesai',
  create_user:         'Tambah Pengguna',
  update_user:         'Update Pengguna',
  update_permissions:  'Update Hak Akses',
  reset_password:      'Reset Password Pengguna',
  delete_user:         'Hapus Pengguna',
  update_indikator:    'Update Indikator Pengguna',
  force_logout:         'Paksa Logout Pengguna',
  logout_all:           'Logout Semua Sesi',
  refresh_token_reuse_detected: 'Sesi Dicurigai Dibajak',
};

function _auditAksiBadge(aksi) {
  const map = {
    login_success:       'badge-hijau',
    login_failed:         'badge-merah',
    login_blocked:         'badge-merah',
    change_password:     'badge-abu',
    create:               'badge-hijau',
    update:               'badge-kuning',
    delete:               'badge-merah',
    update_status:        'badge-kuning',
    create_user:          'badge-hijau',
    update_user:          'badge-kuning',
    update_permissions:   'badge-kuning',
    reset_password:       'badge-merah',
    delete_user:          'badge-merah',
    update_indikator:     'badge-kuning',
    force_logout:         'badge-merah',
    logout_all:           'badge-abu',
    refresh_token_reuse_detected: 'badge-merah',
  };
  const cls = map[aksi] || 'badge-abu';
  const label = AKSI_LABEL[aksi] || aksi;
  return `<span class="badge ${cls}">${esc(label)}</span>`;
}

function filterAuditTrail() {
  _auditPage = 1;
  loadAuditTrail();
}

let _auditFiltersBound = false;
function _initAuditFilters() {
  if (_auditFiltersBound) return;
  if (typeof initCdtp === 'function') initCdtp();
  const dari   = document.getElementById('auditFilterDari');
  const sampai = document.getElementById('auditFilterSampai');
  dari?.addEventListener('change', filterAuditTrail);
  sampai?.addEventListener('change', filterAuditTrail);
  _auditFiltersBound = true;
}

// Ambil bagian tanggal saja (YYYY-MM-DD) dari nilai hidden CDTP (YYYY-MM-DDTHH:mm)
function _auditDateOnly(val) {
  return val ? val.split('T')[0] : '';
}

async function loadAuditTrail(page = _auditPage) {
  _initAuditFilters();
  _auditPage = page;
  const q       = document.getElementById('auditSearch')?.value || '';
  const aksi    = document.getElementById('auditFilterAksi')?.value || '';
  const dari    = _auditDateOnly(document.getElementById('auditFilterDari')?.value);
  const sampai  = _auditDateOnly(document.getElementById('auditFilterSampai')?.value);

  const params = new URLSearchParams({
    page: _auditPage, limit: _auditLimit, q,
    aksi, tanggal_dari: dari, tanggal_sampai: sampai,
  });

  const tb = document.getElementById('auditTableBody');
  if (tb) tb.innerHTML = `<tr class="empty-row"><td colspan="6">Memuat data...</td></tr>`;

  try {
    const r = await fetch(`/api/audit-trail?${params}`, { headers: authHeaders() });
    if (!r.ok) throw new Error(await r.text());
    const { logs, total } = await r.json();
    _auditTotal = total;
    renderAuditTrailTable(logs || []);
    renderPagination('auditPagination', _auditTotal, _auditPage, _auditLimit, (p) => loadAuditTrail(p));
  } catch (err) {
    console.error('[loadAuditTrail]', err);
    if (tb) tb.innerHTML = `<tr class="empty-row"><td colspan="6">Gagal memuat data</td></tr>`;
  }
}

function _auditDetailText(aksi, detail) {
  if (!detail) return '—';
  switch (aksi) {
    case 'login_failed':
      return detail.reason === 'email_not_found' ? 'Email tidak terdaftar'
           : detail.reason === 'wrong_password'  ? 'Password salah'
           : '—';
    case 'create':
    case 'update':
      return [detail.no_agenda, detail.perihal].filter(Boolean).join(' — ') || '—';
    case 'delete':
      return [detail.no_agenda, detail.perihal || detail.asal_surat || detail.tujuan_surat].filter(Boolean).join(' — ') || '—';
    case 'update_status':
      return detail.selesai ? 'Ditandai selesai' : 'Ditandai belum selesai';
    case 'create_user':
    case 'update_user':
      return [detail.nama, detail.email].filter(Boolean).join(' — ') || '—';
    case 'update_permissions':
      return Array.isArray(detail.permissions) ? `${detail.permissions.length} hak akses` : '—';
    case 'update_indikator':
      return Array.isArray(detail.indikator_ids) ? `${detail.indikator_ids.length} indikator` : '—';
    case 'force_logout':
      return detail.target_nama ? `${detail.target_nama} — ${detail.sesi_dicabut ?? 0} sesi dicabut` : '—';
    default:
      return '—';
  }
}

function renderAuditTrailTable(logs) {
  const tb = document.getElementById('auditTableBody');
  if (!tb) return;

  if (!logs.length) {
    tb.innerHTML = `<tr class="empty-row"><td colspan="6">Tidak ada data audit trail</td></tr>`;
    return;
  }

  tb.innerHTML = logs.map(l => {
    const waktu = new Date(l.created_at).toLocaleString('id-ID', {
      timeZone: 'Asia/Makassar',
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }) + ' WITA';
    const detail = l.detail ? (typeof l.detail === 'string' ? JSON.parse(l.detail) : l.detail) : null;
    const detailText = _auditDetailText(l.aksi, detail);
    const lokasiText = l.lokasi || '—';
    return `
      <tr>
        <td style="font-size:.8rem;color:var(--teks-muted);white-space:nowrap">${waktu}</td>
        <td>
          <div style="font-weight:600;color:var(--teks)">${esc(l.nama || '—')}</div>
          <div style="font-size:.76rem;color:var(--teks-muted)">${esc(l.email || '—')}</div>
        </td>
        <td>${_auditAksiBadge(l.aksi)}</td>
        <td style="font-size:.8rem;color:var(--teks-muted)">${esc(detailText)}</td>
        <td style="font-size:.8rem;color:var(--teks-muted)">${esc(l.ip_address || '—')}</td>
        <td style="font-size:.8rem;color:var(--teks-muted)">${esc(lokasiText)}</td>
      </tr>`;
  }).join('');
}