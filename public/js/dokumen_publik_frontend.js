// js/dokumen_publik_frontend.js
// Kelola Dokumen Publik — admin only

'use strict';

/* ── State ────────────────────────────────────────────────────── */
let _dokumenAll  = [];
let _dokumenPage = 1;
const _dokumenPerPage = 15;

/* ── Load & render ────────────────────────────────────────────── */
async function loadDokumenPublik() {
  try {
    const r = await fetch('/api/dokumen-publik', { headers: authHeaders() });
    if (!r.ok) throw new Error(await r.text());
    const { dokumen } = await r.json();
    _dokumenAll  = dokumen || [];
    _dokumenPage = 1;
    renderDokumenTable();
  } catch (err) {
    console.error('[loadDokumenPublik]', err);
    const tb = document.getElementById('dokumenTableBody');
    if (tb) tb.innerHTML = `<tr class="empty-row"><td colspan="5">Gagal memuat data</td></tr>`;
  }
}

function filterDokumen() {
  _dokumenPage = 1;
  renderDokumenTable();
}

function renderDokumenTable() {
  const search      = (document.getElementById('dokumenSearch')?.value || '').toLowerCase();
  const filterKat   = document.getElementById('dokumenFilterKategori')?.value || '';
  const filterStatus= document.getElementById('dokumenFilterStatus')?.value   || '';

  let data = _dokumenAll.filter(d => {
    const matchSearch = !search ||
      d.judul.toLowerCase().includes(search) ||
      (d.keterangan || '').toLowerCase().includes(search) ||
      (d.kategori || '').toLowerCase().includes(search);
    const matchKat    = !filterKat || d.kategori === filterKat;
    const matchStatus = filterStatus === '' ? true :
      filterStatus === 'aktif' ? d.aktif : !d.aktif;
    return matchSearch && matchKat && matchStatus;
  });

  const total      = data.length;
  const totalPages = Math.max(1, Math.ceil(total / _dokumenPerPage));
  if (_dokumenPage > totalPages) _dokumenPage = totalPages;
  const start    = (_dokumenPage - 1) * _dokumenPerPage;
  const pageData = data.slice(start, start + _dokumenPerPage);

  const tb = document.getElementById('dokumenTableBody');
  if (!tb) return;

  if (!pageData.length) {
    tb.innerHTML = `<tr class="empty-row"><td colspan="5">Tidak ada dokumen publik</td></tr>`;
  } else {
    const extIcon = (url) => {
      if (!url) return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>`;
      const ext = url.split('.').pop().toLowerCase();
      const icons = {
        pdf:  `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>`,
        doc:  `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>`,
        docx: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>`,
        xls:  `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="m8 13 2 2 4-4"/></svg>`,
        xlsx: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="m8 13 2 2 4-4"/></svg>`,
        ppt:  `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 12h4a2 2 0 0 1 0 4H8z"/><path d="M8 12v6"/></svg>`,
        pptx: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 12h4a2 2 0 0 1 0 4H8z"/><path d="M8 12v6"/></svg>`,
        zip:  `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#8b5cf6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M12 12v6"/><path d="M10 13h4"/><path d="M10 15h4"/></svg>`,
        rar:  `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#8b5cf6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M12 12v6"/><path d="M10 13h4"/><path d="M10 15h4"/></svg>`,
      };
      return icons[ext] || `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>`;
    };
    tb.innerHTML = pageData.map(d => `
      <tr>
        <td style="max-width:240px">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="display:flex;align-items:center;flex-shrink:0">${extIcon(d.file_url)}</span>
            <div>
              <div style="font-weight:600;color:var(--teks)">${esc(d.judul)}</div>
              ${d.keterangan ? `<div style="font-size:.76rem;color:var(--teks-muted);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px">${esc(d.keterangan)}</div>` : ''}
            </div>
          </div>
        </td>
        <td style="font-size:.82rem">${esc(d.kategori || '—')}</td>
        <td><span class="badge ${d.aktif ? 'badge-hijau' : 'badge-abu'}">${d.aktif ? 'Aktif' : 'Nonaktif'}</span></td>
        <td style="font-size:.8rem;color:var(--teks-muted)">${formatTanggalDok(d.created_at)}</td>
        <td>
          <div style="display:flex;gap:6px">
            ${d.file_url ? `<a class="btn btn-ghost btn-sm" href="${esc(d.file_url)}" target="_blank" rel="noopener" title="Buka file">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
            </a>` : ''}
            <button class="btn btn-ghost btn-sm" onclick="openDokumenModal(${d.id})" title="Edit">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5"/><path d="M18.586 2.586a2 2 0 1 1 2.828 2.828L11.828 15 9 16l1-2.828 8.586-8.586z"/></svg>
            </button>
            <button class="btn btn-ghost btn-sm" onclick="toggleDokumen(${d.id}, ${d.aktif})" title="${d.aktif ? 'Nonaktifkan' : 'Aktifkan'}">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d.aktif ? '<path d="M18.36 6.64A9 9 0 0 1 20.77 15"/><path d="M6.16 6.16a9 9 0 1 0 12.68 12.68"/><path d="M12 2v4"/><path d="M2 12h4"/>' : '<path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/>'}</svg>
            </button>
            <button class="btn btn-danger btn-sm" onclick="deleteDokumen(${d.id})" title="Hapus">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6m4-6v6"/><path d="M9 6V4h6v2"/></svg>
            </button>
          </div>
        </td>
      </tr>`).join('');
  }

  renderPagination('dokumenPagination', total, _dokumenPage, _dokumenPerPage, p => {
    _dokumenPage = p;
    renderDokumenTable();
  });
}

/* ── Modal ────────────────────────────────────────────────────── */
function openDokumenModal(id = null) {
  document.getElementById('dokumenId').value         = '';
  document.getElementById('dokumenJudul').value      = '';
  document.getElementById('dokumenKeterangan').value = '';
  document.getElementById('dokumenKategoriCustom').style.display = 'none';
  document.getElementById('dokumenKategoriCustom').value = '';
  _setDokumenKategoriSelect('');
  document.getElementById('dokumenFileUrl').value    = '';
  document.getElementById('dokumenAktif').checked    = true;
  document.getElementById('modalDokumenTitle').textContent = id ? 'Edit Dokumen' : 'Tambah Dokumen';

  if (id) {
    const d = _dokumenAll.find(x => x.id === id);
    if (d) {
      document.getElementById('dokumenId').value         = d.id;
      document.getElementById('dokumenJudul').value      = d.judul || '';
      document.getElementById('dokumenKeterangan').value = d.keterangan || '';
      _setDokumenKategoriSelect(d.kategori || '');
      document.getElementById('dokumenFileUrl').value    = d.file_url || '';
      document.getElementById('dokumenAktif').checked    = !!d.aktif;
    }
  }
  openModal('modalDokumen');
}

async function saveDokumen() {
  const id         = document.getElementById('dokumenId').value;
  const judul      = document.getElementById('dokumenJudul').value.trim();
  const keterangan = document.getElementById('dokumenKeterangan').value.trim();
  const kategori   = _getDokumenKategoriValue();
  const fileUrl    = document.getElementById('dokumenFileUrl').value.trim();
  const aktif      = document.getElementById('dokumenAktif').checked;

  if (!judul)   { toast('Judul wajib diisi', 'error'); return; }
  if (!fileUrl) { toast('URL file wajib diisi', 'error'); return; }

  const btn = document.getElementById('btnSaveDokumen');
  btn.disabled = true;
  try {
    const method = id ? 'PUT' : 'POST';
    const url    = id ? `/api/dokumen-publik/${id}` : '/api/dokumen-publik';
    const r = await fetch(url, {
      method,
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ judul, keterangan, kategori, file_url: fileUrl, aktif }),
    });
    const data = await r.json();
    if (!r.ok) { toast(data.error || 'Gagal menyimpan', 'error'); return; }
    toast(id ? 'Dokumen diperbarui' : 'Dokumen ditambahkan', 'success');
    closeModal('modalDokumen');
    loadDokumenPublik();
  } catch (err) {
    toast('Gagal: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function toggleDokumen(id, currentAktif) {
  try {
    const r = await fetch(`/api/dokumen-publik/${id}`, {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ aktif: !currentAktif }),
    });
    if (!r.ok) throw new Error();
    toast(!currentAktif ? 'Dokumen diaktifkan' : 'Dokumen dinonaktifkan', 'success');
    loadDokumenPublik();
  } catch {
    toast('Gagal mengubah status', 'error');
  }
}

async function deleteDokumen(id) {
  const ok = await showConfirm({ title: 'Hapus Dokumen', msg: 'Dokumen ini akan dihapus permanen. Lanjutkan?', okText: 'Hapus', type: 'danger', icon: 'trash' });
  if (!ok) return;
  try {
    const r = await fetch(`/api/dokumen-publik/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!r.ok) throw new Error();
    toast('Dokumen dihapus', 'success');
    loadDokumenPublik();
  } catch {
    toast('Gagal menghapus', 'error');
  }
}

/* ── Helper ───────────────────────────────────────────────────── */
function formatTanggalDok(str) {
  if (!str) return '—';
  const d = new Date(str);
  const tgl = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Makassar' });
  const wita = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Makassar' }));
  const hh = String(wita.getHours()).padStart(2, '0');
  const mm = String(wita.getMinutes()).padStart(2, '0');
  return `${tgl}, ${hh}:${mm} WITA`;
}

/* ── Kategori select helpers ─────────────────────────────────── */
const _KATEGORI_DEFAULT = ['SK','SOP','Laporan','Regulasi','Pedoman','Formulir'];

function _onDokumenKategoriChange(sel) {
  const custom = document.getElementById('dokumenKategoriCustom');
  if (sel.value === 'Lainnya') {
    custom.style.display = 'block';
    custom.focus();
  } else {
    custom.style.display = 'none';
    custom.value = '';
  }
}

function _getDokumenKategoriValue() {
  const sel = document.getElementById('dokumenKategori');
  if (!sel) return '';
  if (sel.value === 'Lainnya') {
    return (document.getElementById('dokumenKategoriCustom')?.value || '').trim();
  }
  return sel.value.trim();
}

function _setDokumenKategoriSelect(val) {
  const sel = document.getElementById('dokumenKategori');
  const custom = document.getElementById('dokumenKategoriCustom');
  if (!sel) return;
  if (!val) { sel.value = ''; }
  else {
    const isDefault = _KATEGORI_DEFAULT.includes(val);
    if (isDefault) {
      sel.value = val;
      if (custom) { custom.style.display = 'none'; custom.value = ''; }
    } else {
      sel.value = 'Lainnya';
      if (custom) { custom.style.display = 'block'; custom.value = val; }
    }
  }
  if (typeof syncCustomSelect === 'function') syncCustomSelect('dokumenKategori');
}

function buildDokumenKategoriFilter() {
  const sel = document.getElementById('dokumenFilterKategori');
  if (!sel) return;
  const katSet = [...new Set(_dokumenAll.map(d => d.kategori).filter(Boolean))].sort();
  const current = sel.value;
  sel.innerHTML = `<option value="">Semua Kategori</option>` +
    katSet.map(k => `<option value="${esc(k)}" ${current === k ? 'selected' : ''}>${esc(k)}</option>`).join('');
  if (typeof syncCustomSelect === 'function') syncCustomSelect('dokumenFilterKategori');
}