// js/struktur_frontend.js
// Kelola Pegawai & Struktur Organisasi — admin only

'use strict';

/* ── State ────────────────────────────────────────────────────── */
let _pegawaiAll  = [];
let _pegawaiPage = 1;
const _pegawaiPerPage = 15;

/* ── Load & render ────────────────────────────────────────────── */
async function loadPegawai() {
  try {
    const r = await fetch('/api/pegawai', { headers: authHeaders() });
    if (!r.ok) throw new Error(await r.text());
    const { pegawai } = await r.json();
    _pegawaiAll  = pegawai || [];
    _pegawaiPage = 1;
    renderPegawaiTable();
  } catch (err) {
    console.error('[loadPegawai]', err);
    const tb = document.getElementById('pegawaiTableBody');
    if (tb) tb.innerHTML = `<tr class="empty-row"><td colspan="6">Gagal memuat data</td></tr>`;
  }
}

function filterPegawai() {
  _pegawaiPage = 1;
  renderPegawaiTable();
}

function renderPegawaiTable() {
  const search        = (document.getElementById('pegawaiSearch')?.value || '').toLowerCase();
  const filterJabatan = document.getElementById('pegawaiFilterJabatan')?.value || '';
  const filterStatus  = document.getElementById('pegawaiFilterStatus')?.value  || '';

  let data = _pegawaiAll.filter(p => {
    const matchSearch  = !search ||
      p.nama.toLowerCase().includes(search) ||
      (p.nip || '').toLowerCase().includes(search) ||
      (p.jabatan || '').toLowerCase().includes(search);
    const matchJabatan = !filterJabatan || p.jabatan === filterJabatan;
    const matchStatus  = filterStatus === '' ? true :
      filterStatus === 'aktif' ? p.aktif : !p.aktif;
    return matchSearch && matchJabatan && matchStatus;
  });

  const total      = data.length;
  const totalPages = Math.max(1, Math.ceil(total / _pegawaiPerPage));
  if (_pegawaiPage > totalPages) _pegawaiPage = totalPages;
  const start    = (_pegawaiPage - 1) * _pegawaiPerPage;
  const pageData = data.slice(start, start + _pegawaiPerPage);

  const tb = document.getElementById('pegawaiTableBody');
  if (!tb) return;

  if (!pageData.length) {
    tb.innerHTML = `<tr class="empty-row"><td colspan="6">Tidak ada data pegawai</td></tr>`;
  } else {
    tb.innerHTML = pageData.map(p => {
      const fotoHtml = p.foto_url
        ? `<img src="${esc(p.foto_url)}" alt="${esc(p.nama)}" style="width:34px;height:34px;border-radius:50%;object-fit:cover;border:1.5px solid var(--abu-2);flex-shrink:0">`
        : `<div style="width:34px;height:34px;border-radius:50%;background:var(--teal-50,#f0fdfa);border:1.5px solid var(--abu-2);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:700;font-size:.85rem;color:var(--hijau)">${esc((p.nama||'?')[0].toUpperCase())}</div>`;
      return `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:10px">
            ${fotoHtml}
            <div>
              <div style="font-weight:600;color:var(--teks)">${esc(p.nama)}</div>
              ${p.nip ? `<div style="font-size:.76rem;color:var(--teks-muted);margin-top:1px">NIP: ${esc(p.nip)}</div>` : ''}
            </div>
          </div>
        </td>
        <td style="font-size:.82rem">${esc(p.jabatan || '—')}</td>
        <td style="font-size:.82rem">${esc(p.golongan || '—')}</td>
        <td style="font-size:.8rem;color:var(--teks-muted)">${p.urutan ?? '—'}</td>
        <td style="font-size:.8rem;color:var(--teks-muted)">${esc(p.parent_nama || '—')}</td>
        <td><span class="badge ${p.aktif ? 'badge-hijau' : 'badge-abu'}">${p.aktif ? 'Aktif' : 'Nonaktif'}</span></td>
        <td>
          <div style="display:flex;gap:6px">
            <button class="btn btn-ghost btn-sm" onclick="openPegawaiModal(${p.id})" title="Edit">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5"/><path d="M18.586 2.586a2 2 0 1 1 2.828 2.828L11.828 15 9 16l1-2.828 8.586-8.586z"/></svg>
            </button>
            <button class="btn btn-ghost btn-sm" onclick="togglePegawai(${p.id}, ${p.aktif})" title="${p.aktif ? 'Nonaktifkan' : 'Aktifkan'}">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p.aktif ? '<path d="M18.36 6.64A9 9 0 0 1 20.77 15"/><path d="M6.16 6.16a9 9 0 1 0 12.68 12.68"/><path d="M12 2v4"/><path d="M2 12h4"/>' : '<path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/>'}</svg>
            </button>
            <button class="btn btn-danger btn-sm" onclick="deletePegawai(${p.id})" title="Hapus">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6m4-6v6"/><path d="M9 6V4h6v2"/></svg>
            </button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  renderPagination('pegawaiPagination', total, _pegawaiPage, _pegawaiPerPage, p => {
    _pegawaiPage = p;
    renderPegawaiTable();
  });
}

/* ── Modal ────────────────────────────────────────────────────── */
function openPegawaiModal(id = null) {
  document.getElementById('pegawaiId').value         = '';
  document.getElementById('pegawaiNama').value       = '';
  document.getElementById('pegawaiNip').value        = '';
  document.getElementById('pegawaiJabatan').value    = '';
  document.getElementById('pegawaiGolongan').value   = '';
  document.getElementById('pegawaiUrutan').value     = '';
  document.getElementById('pegawaiFotoUrl').value    = '';
  document.getElementById('pegawaiAktif').checked    = true;
  document.getElementById('pegawaiFotoPreview').style.display = 'none';
  document.getElementById('pegawaiFotoPreview').src  = '';
  document.getElementById('pegawaiFotoProgress').style.display = 'none';
  document.getElementById('modalPegawaiTitle').textContent = id ? 'Edit Pegawai' : 'Tambah Pegawai';

  // Build atasan dropdown
  _buildAtatanDropdown(id);

  if (id) {
    const p = _pegawaiAll.find(x => x.id === id);
    if (p) {
      document.getElementById('pegawaiId').value       = p.id;
      document.getElementById('pegawaiNama').value     = p.nama || '';
      document.getElementById('pegawaiNip').value      = p.nip || '';
      document.getElementById('pegawaiJabatan').value  = p.jabatan || '';
      document.getElementById('pegawaiGolongan').value = p.golongan || '';
      document.getElementById('pegawaiUrutan').value   = p.urutan ?? '';
      document.getElementById('pegawaiFotoUrl').value  = p.foto_url || '';
      document.getElementById('pegawaiAktif').checked  = !!p.aktif;
      document.getElementById('pegawaiAtasan').value   = p.parent_id ?? '';
      if (p.foto_url) {
        const prev = document.getElementById('pegawaiFotoPreview');
        prev.src = p.foto_url;
        prev.style.display = 'block';
      }
    }
  } else {
    document.getElementById('pegawaiAtasan').value = '';
  }
  openModal('modalPegawai');
}

function _buildAtatanDropdown(excludeId = null) {
  const sel = document.getElementById('pegawaiAtasan');
  if (!sel) return;
  // Exclude diri sendiri dan semua descendant-nya agar tidak circular
  const excluded = new Set();
  if (excludeId) {
    excluded.add(excludeId);
    // BFS untuk temukan semua descendant
    const queue = [excludeId];
    while (queue.length) {
      const cur = queue.shift();
      _pegawaiAll.filter(p => p.parent_id === cur).forEach(p => {
        excluded.add(p.id);
        queue.push(p.id);
      });
    }
  }
  const opts = _pegawaiAll
    .filter(p => !excluded.has(p.id))
    .sort((a, b) => (a.urutan ?? 999) - (b.urutan ?? 999) || a.nama.localeCompare(b.nama))
    .map(p => `<option value="${p.id}">${esc(p.nama)}${p.jabatan ? ' — ' + esc(p.jabatan) : ''}</option>`)
    .join('');
  sel.innerHTML = `<option value="">— Tidak ada (root) —</option>` + opts;
  if (typeof initCustomSelects === 'function') initCustomSelects();
}

/* ── Upload foto ──────────────────────────────────────────────── */
async function onPegawaiFotoFileChange(input) {
  const file = input.files?.[0];
  if (!file) return;

  const MAX_MB = 2;
  if (file.size > MAX_MB * 1024 * 1024) {
    toast(`Foto terlalu besar (maks. ${MAX_MB} MB)`, 'error');
    input.value = '';
    return;
  }

  const prog = document.getElementById('pegawaiFotoProgress');
  const bar  = document.getElementById('pegawaiFotoProgressBar');
  const prev = document.getElementById('pegawaiFotoPreview');
  if (prog) { prog.style.display = ''; }
  if (bar)  bar.style.width = '30%';

  try {
    const formData = new FormData();
    formData.append('file', file);
    const r = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Authorization': authHeaders()['Authorization'] },
      body: formData,
    });
    if (bar) bar.style.width = '90%';
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d.error || 'Gagal upload');
    }
    const d = await r.json();
    if (bar) { bar.style.width = '100%'; setTimeout(() => { if (prog) prog.style.display = 'none'; }, 600); }
    document.getElementById('pegawaiFotoUrl').value = d.url;
    prev.src = d.url;
    prev.style.display = 'block';
    toast('Foto berhasil diupload', 'success');
  } catch (err) {
    if (prog) prog.style.display = 'none';
    toast('Gagal upload foto: ' + err.message, 'error');
  } finally {
    input.value = '';
  }
}

function clearPegawaiFoto() {
  document.getElementById('pegawaiFotoUrl').value = '';
  const prev = document.getElementById('pegawaiFotoPreview');
  prev.src = '';
  prev.style.display = 'none';
  const fi = document.getElementById('pegawaiFotoFile');
  if (fi) fi.value = '';
}

/* ── Save ─────────────────────────────────────────────────────── */
async function savePegawai() {
  const id       = document.getElementById('pegawaiId').value;
  const nama     = document.getElementById('pegawaiNama').value.trim();
  const nip      = document.getElementById('pegawaiNip').value.trim();
  const jabatan  = document.getElementById('pegawaiJabatan').value.trim();
  const golongan = document.getElementById('pegawaiGolongan').value.trim();
  const urutan   = document.getElementById('pegawaiUrutan').value;
  const fotoUrl  = document.getElementById('pegawaiFotoUrl').value.trim();
  const aktif    = document.getElementById('pegawaiAktif').checked;
  const atasanVal= document.getElementById('pegawaiAtasan').value;
  const parent_id = atasanVal ? parseInt(atasanVal) : null;

  if (!nama)    { toast('Nama wajib diisi', 'error'); return; }
  if (!jabatan) { toast('Jabatan wajib diisi', 'error'); return; }

  const btn = document.getElementById('btnSavePegawai');
  btn.disabled = true;
  try {
    const method = id ? 'PUT' : 'POST';
    const url    = id ? `/api/pegawai/${id}` : '/api/pegawai';
    const r = await fetch(url, {
      method,
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nama, nip, jabatan, golongan,
        urutan: urutan !== '' ? parseInt(urutan, 10) : null,
        foto_url: fotoUrl || null,
        aktif,
        parent_id,
      }),
    });
    const data = await r.json();
    if (!r.ok) { toast(data.error || 'Gagal menyimpan', 'error'); return; }
    toast(id ? 'Data pegawai diperbarui' : 'Pegawai ditambahkan', 'success');
    closeModal('modalPegawai');
    loadPegawai();
  } catch (err) {
    toast('Gagal: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function togglePegawai(id, currentAktif) {
  try {
    const r = await fetch(`/api/pegawai/${id}`, {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ aktif: !currentAktif }),
    });
    if (!r.ok) throw new Error();
    toast(!currentAktif ? 'Pegawai diaktifkan' : 'Pegawai dinonaktifkan', 'success');
    loadPegawai();
  } catch {
    toast('Gagal mengubah status', 'error');
  }
}

async function deletePegawai(id) {
  const ok = await showConfirm({ title: 'Hapus Pegawai', msg: 'Data pegawai ini akan dihapus permanen. Lanjutkan?', okText: 'Hapus', type: 'danger', icon: 'trash' });
  if (!ok) return;
  try {
    const r = await fetch(`/api/pegawai/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!r.ok) throw new Error();
    toast('Pegawai dihapus', 'success');
    loadPegawai();
  } catch {
    toast('Gagal menghapus', 'error');
  }
}

/* ── Helper: build jabatan filter options dari data ─────────── */
function buildPegawaiJabatanFilter() {
  const sel = document.getElementById('pegawaiFilterJabatan');
  if (!sel) return;
  const jabatanSet = [...new Set(_pegawaiAll.map(p => p.jabatan).filter(Boolean))].sort();
  const current = sel.value;
  sel.innerHTML = `<option value="">Semua Jabatan</option>` +
    jabatanSet.map(j => `<option value="${esc(j)}" ${current === j ? 'selected' : ''}>${esc(j)}</option>`).join('');
  if (typeof initCustomSelects === 'function') initCustomSelects();
}