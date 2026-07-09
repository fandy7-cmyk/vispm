// ── Toggle label helper ──────────────────────────────────
function _updateToggleLabel(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const lbl = document.querySelector(`label[for="${id}"]`);
  if (lbl) lbl.textContent = el.checked ? 'Aktif' : 'Nonaktif';
}

// ── Status dropdown: hanya tampilkan opsi yang ada datanya ──
function _buildStatusOptions(data, getAktif = d => d.aktif) {
  const aktifCount    = data.filter(d => getAktif(d)).length;
  const nonaktifCount = data.filter(d => !getAktif(d)).length;
  let opts = `<option value="">Semua Status</option>`;
  if (aktifCount)    opts += `<option value="aktif">Aktif</option>`;
  if (nonaktifCount) opts += `<option value="nonaktif">Nonaktif</option>`;
  return opts;
}

// ── Debounce helper ──────────────────────────────────────
function _debounce(fn, delay = 400) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// ── Slug availability checker (dipakai Link & Bundle) ────
const SlugIcons = {
  check: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`,
  cross: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`,
  spin: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-9-9"/></svg>`,
};

/**
 * Cek ketersediaan slug ke backend & update UI status + tombol simpan.
 * @param {string} endpoint - '/api/links' atau '/api/bundles'
 * @param {string} rawSlug - nilai slug mentah dari input
 * @param {string|number|null} excludeId - id record saat ini (mode edit)
 * @param {string} statusElId - id elemen div status
 * @param {string} btnId - id tombol simpan
 * @param {(available: boolean|null) => void} onResult - callback simpan state availability
 */
async function _checkSlugAvailability(endpoint, rawSlug, excludeId, statusElId, btnId, onResult) {
  const statusEl = document.getElementById(statusElId);
  const btn = document.getElementById(btnId);
  const slug = (rawSlug || '').trim();

  if (!slug) {
    // Slug kosong = tidak masalah (khusus link, opsional). Selalu boleh simpan.
    if (statusEl) { statusEl.className = 'slug-status'; statusEl.innerHTML = ''; }
    if (btn) btn.disabled = false;
    onResult(true);
    return;
  }

  if (statusEl) {
    statusEl.className = 'slug-status checking';
    statusEl.innerHTML = `${SlugIcons.spin} Mengecek ketersediaan...`;
  }
  if (btn) btn.disabled = true;

  try {
    const qs = new URLSearchParams({ slug });
    if (excludeId) qs.set('excludeId', excludeId);
    const r = await fetch(`${endpoint}/check-slug?${qs.toString()}`, { headers: authHeaders() });
    const d = await r.json();
    const available = d.available;
    if (statusEl) {
      if (available === true) {
        statusEl.className = 'slug-status available';
        statusEl.innerHTML = `${SlugIcons.check} Slug tersedia`;
      } else if (available === false) {
        statusEl.className = 'slug-status taken';
        statusEl.innerHTML = `${SlugIcons.cross} Slug sudah digunakan`;
      } else {
        statusEl.className = 'slug-status'; statusEl.innerHTML = '';
      }
    }
    if (btn) btn.disabled = available === false;
    onResult(available !== false);
  } catch {
    // Gagal cek (mis. offline) — jangan blokir user, biarkan validasi final terjadi di server saat submit
    if (statusEl) { statusEl.className = 'slug-status'; statusEl.innerHTML = ''; }
    if (btn) btn.disabled = false;
    onResult(true);
  }
}

// ═══════════════════════════════════════════
// LINKS (data source) — dipakai bareng oleh halaman Shortlink
// ═══════════════════════════════════════════
let _links = [];
let _linkSlugAvailable = true;
const _checkLinkSlugDebounced = _debounce(function () {
  const val = document.getElementById('linkSlug').value.trim();
  const excludeId = document.getElementById('linkId').value || null;
  _checkSlugAvailability('/api/links', val, excludeId, 'linkSlugStatus', 'btnSaveLink', (avail) => {
    _linkSlugAvailable = avail;
  });
}, 450);

async function loadLinks() {
  try {
    const lr = await fetch('/api/links', { headers: authHeaders() });
    const ld = await lr.json();
    _links = ld.links || [];
    // Rebuild filter status dropdown — hanya tampilkan opsi yg ada datanya
    const slfs = document.getElementById('slFilterStatus');
    if (slfs) slfs.innerHTML = _buildStatusOptions(_links);
  } catch (e) { console.error(e); }
}

function openLinkModal(id) {
  document.getElementById('linkId').value = '';
  document.getElementById('linkJudul').value = '';
  document.getElementById('linkUrl').value = '';
  document.getElementById('linkSlug').value = '';
  document.getElementById('linkAktif').checked = true;
  _updateToggleLabel('linkAktif');
  document.getElementById('slugPreview').textContent = '—';
  document.getElementById('linkSlugStatus').className = 'slug-status';
  document.getElementById('linkSlugStatus').innerHTML = '';
  _linkSlugAvailable = true;
  document.getElementById('btnSaveLink').disabled = false;
  document.getElementById('modalLinkTitle').textContent = 'Tambah Link';
  openModal('modalLink');
}

function editLink(id) {
  const l = _links.find(x => x.id === id); if (!l) return;
  document.getElementById('linkId').value = l.id;
  document.getElementById('linkJudul').value = l.judul;
  document.getElementById('linkUrl').value = l.url;
  document.getElementById('linkSlug').value = l.slug_pendek || '';
  document.getElementById('linkAktif').checked = l.aktif === true || l.aktif === 'true';
  _updateToggleLabel('linkAktif');
  document.getElementById('slugPreview').textContent = l.slug_pendek || '—';
  document.getElementById('linkSlugStatus').className = 'slug-status';
  document.getElementById('linkSlugStatus').innerHTML = '';
  _linkSlugAvailable = true;
  document.getElementById('btnSaveLink').disabled = false;
  document.getElementById('modalLinkTitle').textContent = 'Edit Link';
  openModal('modalLink');
}

document.getElementById('linkAktif').addEventListener('change', function() {
  _updateToggleLabel('linkAktif');
});

document.getElementById('linkSlug').addEventListener('input', function() {
  document.getElementById('slugPreview').textContent = this.value || '—';
  _checkLinkSlugDebounced();
});

async function saveLink() {
  const id  = document.getElementById('linkId').value;
  const body = {
    judul:      document.getElementById('linkJudul').value.trim(),
    url:        document.getElementById('linkUrl').value.trim(),
    aktif:      document.getElementById('linkAktif').checked,
    slug_pendek:document.getElementById('linkSlug').value.trim() || null,
  };
  if (!body.judul || !body.url) { toast('Judul dan URL wajib diisi', 'error'); return; }
  if (!_linkSlugAvailable) { toast('Slug pendek sudah digunakan, ganti dulu', 'error'); return; }
  try {
    const r = await fetch(id ? `/api/links/${id}` : '/api/links', {
      method: id ? 'PUT' : 'POST', headers: authHeaders(), body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!r.ok) { toast(d.error || 'Gagal menyimpan', 'error'); return; }
    toast(id ? 'Link diperbarui' : 'Link ditambahkan');
    closeModal('modalLink');
    await loadLinks();
    if (document.getElementById('page-shortlink')?.classList.contains('active')) filterShortlinks();
  } catch { toast('Gagal menyimpan', 'error'); }
}

async function deleteLink(id) {
  const ok = await showConfirm({ title: 'Hapus Link', msg: 'Link ini akan dihapus permanen. Lanjutkan?', okText: 'Ya, Hapus', icon: 'trash' });
  if (!ok) return;
  try {
    await fetch(`/api/links/${id}`, { method: 'DELETE', headers: authHeaders() });
    toast('Link berhasil dihapus');
    await loadLinks();
    if (document.getElementById('page-shortlink')?.classList.contains('active')) filterShortlinks();
  } catch { toast('Gagal menghapus', 'error'); }
}

// ═══════════════════════════════════════════
// SHORTLINK — halaman unified: semua link + shortlink
// ═══════════════════════════════════════════
let _slFiltered = [], _slPage = 1, _slPageSize = 15;

async function loadShortlinks() {
  await loadLinks();
  filterShortlinks();
}

function filterShortlinks() {
  const q      = document.getElementById('slSearch').value.toLowerCase();
  const status = document.getElementById('slFilterStatus')?.value || '';
  const jenis  = document.getElementById('slFilterJenis')?.value || '';
  _slFiltered = _links.filter(l => {
    const matchQ = l.judul.toLowerCase().includes(q) ||
                   l.url.toLowerCase().includes(q) ||
                   (l.slug_pendek||'').toLowerCase().includes(q);
    const matchS = !status || (status === 'aktif' ? l.aktif : !l.aktif);
    const matchJ = !jenis || (jenis === 'shortlink' ? !!l.slug_pendek : !l.slug_pendek);
    return matchQ && matchS && matchJ;
  });
  _slPage = 1;
  renderShortlinks();
}

window.goSlPage = (p) => { _slPage = p; renderShortlinks(); };

function renderShortlinks() {
  const tb = document.getElementById('slTableBody');
  const start = (_slPage - 1) * _slPageSize;
  const slice = _slFiltered.slice(start, start + _slPageSize);
  tb.innerHTML = slice.length ? slice.map(l => `
    <tr>
      <td><span style="display:inline-flex;align-items:center;gap:6px"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg> <strong>${esc(l.judul)}</strong></span></td>
      <td><a href="${esc(l.url)}" target="_blank" style="color:var(--hijau);font-size:.75rem">${esc(l.url.length>35?l.url.slice(0,35)+'…':l.url)}</a></td>
      <td>${l.slug_pendek ? `
        <code style="font-size:.78rem;background:var(--abu-1);padding:2px 7px;border-radius:5px">/${esc(l.slug_pendek)}</code>
        <button class="btn btn-ghost btn-sm" style="margin-left:4px" title="Salin URL" onclick="copySlug('${esc(l.slug_pendek)}')"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path stroke-linecap="round" stroke-linejoin="round" d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button>
      ` : '<span style="color:var(--teks-muted)">—</span>'}</td>
      <td><span class="badge badge-blue">${l.total_klik ?? 0}</span></td>
      <td><span class="badge ${l.aktif?'badge-green':'badge-red'}">${l.aktif?'Aktif':'Nonaktif'}</span></td>
      <td class="col-admin-only" style="color:var(--teks-muted);font-size:.78rem">${l.created_by_nama ? esc(l.created_by_nama) : '—'}</td>
      <td style="white-space:nowrap"><button class="btn btn-ghost btn-sm" title="Edit" onclick="editLink(${l.id})"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg></button>
          <button class="btn btn-danger btn-sm" title="Hapus" onclick="deleteLink(${l.id})"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path stroke-linecap="round" stroke-linejoin="round" d="M19 6l-1 14H6L5 6"/><path stroke-linecap="round" stroke-linejoin="round" d="M10 11v6m4-6v6"/><path stroke-linecap="round" stroke-linejoin="round" d="M9 6V4h6v2"/></svg></button></td>
    </tr>`).join('')
    : '<tr class="empty-row"><td colspan="7">Tidak ada link</td></tr>';
  renderPagination('slPagination', _slFiltered.length, _slPage, _slPageSize, 'goSlPage');
}

function copySlug(slug) {
  const url = location.origin + '/' + slug;
  navigator.clipboard.writeText(url).then(() => toast('URL disalin: ' + url));
}

// ═══════════════════════════════════════════
// BUNDLES
// ═══════════════════════════════════════════
let _bundles = [], _bundlesFiltered = [], _bundlePage = 1, _bundlePageSize = 15;
let _currentBundleId = null;
let _currentBundleItems = [];

async function loadBundles() {
  try {
    const r = await fetch('/api/bundles', { headers: authHeaders() });
    const d = await r.json();
    _bundles = d.bundles || [];
    _bundlesFiltered = [..._bundles]; _bundlePage = 1;
    renderBundles();
    // Rebuild filter dropdowns — hanya tampilkan opsi yg ada datanya
    const bfs = document.getElementById('bundleFilterStatus');
    if (bfs) bfs.innerHTML = _buildStatusOptions(_bundles);
  } catch {}
}

function filterBundles() {
  const q      = (document.getElementById('bundleSearch')?.value || '').toLowerCase();
  const status = document.getElementById('bundleFilterStatus')?.value || '';
  _bundlesFiltered = _bundles.filter(b => {
    const matchQ = b.judul.toLowerCase().includes(q) || b.slug.toLowerCase().includes(q);
    const matchS = !status || (status === 'aktif' ? b.aktif : !b.aktif);
    return matchQ && matchS;
  });
  _bundlePage = 1; renderBundles();
}

function renderBundles() {
  const start = (_bundlePage - 1) * _bundlePageSize;
  const slice = _bundlesFiltered.slice(start, start + _bundlePageSize);
  const tb = document.getElementById('bundleTableBody');
  tb.innerHTML = slice.length ? slice.map(b => `
    <tr>
      <td><strong>${esc(b.judul)}</strong></td>
      <td>
        <code style="font-size:.75rem;background:var(--abu-1);padding:2px 6px;border-radius:5px">/${esc(b.slug)}</code>
        <button class="btn btn-ghost btn-sm" style="margin-left:4px" title="Salin URL" onclick="copyBundleUrl('${esc(b.slug)}')"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path stroke-linecap="round" stroke-linejoin="round" d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button>
      </td>
      <td>${b.jumlah_item ?? 0} item</td>
      <td><span class="badge ${b.aktif?'badge-green':'badge-red'}">${b.aktif?'Aktif':'Nonaktif'}</span></td>
      <td class="col-admin-only" style="color:var(--teks-muted);font-size:.78rem">${b.created_by_nama ? esc(b.created_by_nama) : '—'}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-ghost btn-sm" title="Edit" onclick="editBundle(${b.id})"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg></button>
        <button class="btn btn-danger btn-sm" title="Hapus" onclick="deleteBundle(${b.id})"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path stroke-linecap="round" stroke-linejoin="round" d="M19 6l-1 14H6L5 6"/><path stroke-linecap="round" stroke-linejoin="round" d="M10 11v6m4-6v6"/><path stroke-linecap="round" stroke-linejoin="round" d="M9 6V4h6v2"/></svg></button>
      </td>
    </tr>`).join('')
    : '<tr class="empty-row"><td colspan="6">Tidak ada bundle</td></tr>';
  renderPagination('bundlePagination', _bundlesFiltered.length, _bundlePage, _bundlePageSize, 'goBundlePage');
}

window.goBundlePage = (p) => { _bundlePage = p; renderBundles(); };

function copyBundleUrl(slug) {
  const url = location.origin + '/' + slug;
  navigator.clipboard.writeText(url).then(() => toast('URL disalin: ' + url));
}

function _setBundleItemsLocked(locked) {
  // Kunci/unlock tombol tambah item & form inline
  const btn = document.getElementById('btnTambahItem');
  const hint = document.getElementById('bundleSaveHint');
  if (locked) {
    btn.disabled = true; btn.style.opacity = '.45'; btn.style.cursor = 'not-allowed';
    hint.style.display = 'block';
  } else {
    btn.disabled = false; btn.style.opacity = ''; btn.style.cursor = '';
    hint.style.display = 'none';
  }
}

let _bundleSlugAvailable = true;
const _checkBundleSlugDebounced = _debounce(function () {
  const explicit = document.getElementById('bundleSlug').value.trim();
  const judul = document.getElementById('bundleJudul').value;
  // Kalau field slug dikosongkan, backend auto-generate dari judul → cek slug hasil generate itu
  const val = explicit || judul.toLowerCase().replace(/[^a-z0-9\s-]/g,'').trim().replace(/\s+/g,'-').substring(0,60);
  const excludeId = document.getElementById('bundleId').value || null;
  _checkSlugAvailability('/api/bundles', val, excludeId, 'bundleSlugStatus', 'btnSaveBundle', (avail) => {
    _bundleSlugAvailable = avail;
  });
}, 450);

function openBundleModal() {
  _currentBundleId = null; _currentBundleItems = [];
  document.getElementById('bundleId').value = '';
  document.getElementById('bundleJudul').value = '';
  document.getElementById('bundleSlug').value = '';
  document.getElementById('bundleDeskripsi').value = '';
  document.getElementById('bundleAktif').checked = true;
  _updateToggleLabel('bundleAktif');
  document.getElementById('bundleSlugPreview').textContent = '—';
  document.getElementById('bundleSlugStatus').className = 'slug-status';
  document.getElementById('bundleSlugStatus').innerHTML = '';
  _bundleSlugAvailable = true;
  document.getElementById('btnSaveBundle').disabled = false;
  document.getElementById('bundleItemsList').innerHTML =
    '<div style="text-align:center;color:var(--teks-muted);padding:16px;font-size:.82rem">Simpan info bundle dulu untuk mulai menambah item.</div>';
  document.getElementById('bundleInlineItemForm').style.display = 'none';
  document.getElementById('modalBundleTitle').textContent = 'Buat Bundle';
  document.getElementById('btnSaveBundle').innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="margin-right:5px;vertical-align:-2px"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>Simpan Info';
  document.getElementById('bundleItemCount').textContent = '';
  _setBundleItemsLocked(true);
  openModal('modalBundle');
}

document.getElementById('bundleJudul').addEventListener('input', function() {
  if (!document.getElementById('bundleSlug').value) {
    const slug = this.value.toLowerCase().replace(/[^a-z0-9\s-]/g,'').trim().replace(/\s+/g,'-').substring(0,60);
    document.getElementById('bundleSlugPreview').textContent = slug || '—';
    _checkBundleSlugDebounced();
  }
});
document.getElementById('bundleAktif').addEventListener('change', function() {
  _updateToggleLabel('bundleAktif');
});

document.getElementById('bundleSlug').addEventListener('input', function() {
  document.getElementById('bundleSlugPreview').textContent = this.value || '—';
  _checkBundleSlugDebounced();
});

async function editBundle(id) {
  const b = _bundles.find(x => x.id === id); if (!b) return;
  _currentBundleId = id;
  document.getElementById('bundleId').value = b.id;
  document.getElementById('bundleJudul').value = b.judul;
  document.getElementById('bundleSlug').value = b.slug;
  document.getElementById('bundleDeskripsi').value = b.deskripsi || '';
  document.getElementById('bundleAktif').checked = b.aktif === true || b.aktif === 'true';
  _updateToggleLabel('bundleAktif');
  document.getElementById('bundleSlugPreview').textContent = b.slug;
  document.getElementById('bundleSlugStatus').className = 'slug-status';
  document.getElementById('bundleSlugStatus').innerHTML = '';
  _bundleSlugAvailable = true;
  document.getElementById('btnSaveBundle').disabled = false;
  document.getElementById('modalBundleTitle').textContent = 'Edit Bundle';
  document.getElementById('btnSaveBundle').innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="margin-right:5px;vertical-align:-2px"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>Simpan Info';
  document.getElementById('bundleInlineItemForm').style.display = 'none';
  _setBundleItemsLocked(false);
  try {
    const r = await fetch(`/api/bundles/${id}`, { headers: authHeaders() });
    const d = await r.json();
    _currentBundleItems = d.items || [];
    renderBundleItems();
  } catch {}
  openModal('modalBundle');
}

function renderBundleItems() {
  const c = document.getElementById('bundleItemsList');
  document.getElementById('bundleItemCount').textContent =
    _currentBundleItems.length ? `(${_currentBundleItems.length})` : '';
  c.innerHTML = _currentBundleItems.length ? _currentBundleItems.map(item => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:9px;border:1.5px solid var(--abu-2);margin-bottom:7px;background:#fff">
      <span style="font-size:18px;flex-shrink:0;display:flex;align-items:center"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg></span>
      <div style="flex:1;min-width:0">
        <div style="font-size:.82rem;font-weight:700">${esc(item.judul)}</div>
        <div style="font-size:.72rem;color:var(--teks-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(item.url)}</div>
        ${item.deskripsi ? `<div style="font-size:.72rem;color:var(--teks-muted)">${esc(item.deskripsi)}</div>` : ''}
      </div>
      <button class="btn btn-ghost btn-sm" title="Edit" onclick="editBundleItem(${item.id})"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg></button>
      <button class="btn btn-danger btn-sm" onclick="deleteBundleItem(${item.id})"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button>
    </div>`).join('')
    : '<div style="text-align:center;color:var(--teks-muted);padding:16px;font-size:.82rem">Belum ada item</div>';
}

async function saveBundle() {
  const id = document.getElementById('bundleId').value;
  const judul = document.getElementById('bundleJudul').value.trim();
  const slug = document.getElementById('bundleSlug').value.trim();
  const aktif = document.getElementById('bundleAktif').checked;
  const deskripsi = document.getElementById('bundleDeskripsi').value.trim() || null;
  if (!judul) { toast('Judul wajib diisi', 'error'); return; }
  if (!_bundleSlugAvailable) { toast('Slug sudah digunakan, ganti dulu', 'error'); return; }
  try {
    const r = await fetch(id ? `/api/bundles/${id}` : '/api/bundles', {
      method: id ? 'PUT' : 'POST', headers: authHeaders(),
      body: JSON.stringify({ judul, deskripsi, slug: slug || undefined, aktif }),
    });
    const d = await r.json();
    if (!r.ok) { toast(d.error || 'Gagal', 'error'); return; }
    toast(id ? 'Bundle diperbarui' : 'Bundle dibuat');
    loadBundles();
    if (id) {
      // Edit: tutup modal langsung
      closeModal('modalBundle');
    } else {
      // Buat baru: tetap buka modal agar bisa langsung tambah items
      _currentBundleId = d.bundle.id;
      document.getElementById('bundleId').value = d.bundle.id;
      document.getElementById('bundleSlug').value = d.bundle.slug;
      document.getElementById('bundleSlugPreview').textContent = d.bundle.slug;
      document.getElementById('modalBundleTitle').textContent = 'Edit Bundle';
      document.getElementById('btnSaveBundle').innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="margin-right:5px;vertical-align:-2px"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>Simpan';
      document.getElementById('bundleItemsList').innerHTML =
        '<div style="text-align:center;color:var(--teks-muted);padding:16px;font-size:.82rem">Belum ada item</div>';
      _setBundleItemsLocked(false);
    }
  } catch { toast('Gagal menyimpan', 'error'); }
}

async function deleteBundle(id) {
  const ok = await showConfirm({ title: 'Hapus Bundle', msg: 'Bundle beserta semua item di dalamnya akan dihapus permanen.', okText: 'Ya, Hapus', icon: 'trash' });
  if (!ok) return;
  await fetch(`/api/bundles/${id}`, { method: 'DELETE', headers: authHeaders() });
  toast('Bundle berhasil dihapus'); loadBundles();
}

// ── Bundle Items (inline form) ──────────────────────────
function showInlineItemForm() {
  document.getElementById('bundleItemId').value = '';
  document.getElementById('biJudul').value = '';
  document.getElementById('biUrl').value = '';
  document.getElementById('bundleInlineItemForm').style.display = 'block';
  document.getElementById('biJudul').focus();
}

function hideInlineItemForm() {
  document.getElementById('bundleInlineItemForm').style.display = 'none';
}

function editBundleItem(itemId) {
  const item = _currentBundleItems.find(x => x.id === itemId); if (!item) return;
  document.getElementById('bundleItemId').value = item.id;
  document.getElementById('biJudul').value = item.judul;
  document.getElementById('biUrl').value = item.url;
  document.getElementById('bundleInlineItemForm').style.display = 'block';
  document.getElementById('biJudul').focus();
  document.getElementById('bundleInlineItemForm').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function saveBundleItem() {
  const itemId = document.getElementById('bundleItemId').value;
  const body = {
    judul: document.getElementById('biJudul').value.trim(),
    url: document.getElementById('biUrl').value.trim(),
  };
  if (!body.judul || !body.url) { toast('Judul dan URL wajib diisi', 'error'); return; }
  const endpoint = itemId
    ? `/api/bundles/${_currentBundleId}/items/${itemId}`
    : `/api/bundles/${_currentBundleId}/items`;
  try {
    const r = await fetch(endpoint, { method: itemId ? 'PUT' : 'POST', headers: authHeaders(), body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) { toast(d.error || 'Gagal', 'error'); return; }
    toast(itemId ? 'Item diperbarui' : 'Item ditambahkan');
    hideInlineItemForm();
    const rr = await fetch(`/api/bundles/${_currentBundleId}`, { headers: authHeaders() });
    const dd = await rr.json();
    _currentBundleItems = dd.items || [];
    renderBundleItems();
    loadBundles();
  } catch { toast('Gagal menyimpan', 'error'); }
}

async function deleteBundleItem(itemId) {
  const ok = await showConfirm({ title: 'Hapus Item', msg: 'Item bundle ini akan dihapus.', okText: 'Ya, Hapus', icon: 'trash' });
  if (!ok) return;
  await fetch(`/api/bundles/${_currentBundleId}/items/${itemId}`, { method: 'DELETE', headers: authHeaders() });
  toast('Item dihapus');
  const rr = await fetch(`/api/bundles/${_currentBundleId}`, { headers: authHeaders() });
  const dd = await rr.json();
  _currentBundleItems = dd.items || [];
  renderBundleItems();
  loadBundles();
}