// js/pengumuman_frontend.js
// Kelola Pengumuman — admin only

'use strict';

/* ── State ────────────────────────────────────────────────────── */
let _pengumumanAll  = [];
let _pengumumanPage = 1;
const _pengumumanPerPage = 15;
let _quillPengumuman = null; // Quill rich-text instance

/* ── Load & render ────────────────────────────────────────────── */
async function loadPengumuman() {
  try {
    const r = await fetch('/api/pengumuman', { headers: authHeaders() });
    if (!r.ok) throw new Error(await r.text());
    const { pengumuman } = await r.json();
    _pengumumanAll = pengumuman || [];
    _pengumumanPage = 1;
    renderPengumumanTable();
  } catch (err) {
    console.error('[loadPengumuman]', err);
    const tb = document.getElementById('pengumumanTableBody');
    if (tb) tb.innerHTML = `<tr class="empty-row"><td colspan="5">Gagal memuat data</td></tr>`;
  }
}

function filterPengumuman() {
  _pengumumanPage = 1;
  renderPengumumanTable();
}

function renderPengumumanTable() {
  const search = (document.getElementById('pengumumanSearch')?.value || '').toLowerCase();
  const filterTipe = document.getElementById('pengumumanFilterTipe')?.value || '';
  const filterStatus = document.getElementById('pengumumanFilterStatus')?.value || '';

  let data = _pengumumanAll.filter(p => {
    const matchSearch = !search ||
      p.judul.toLowerCase().includes(search) ||
      (p.isi || '').toLowerCase().includes(search);
    const matchTipe = !filterTipe || p.tipe === filterTipe;
    const matchStatus = filterStatus === '' ? true :
      filterStatus === 'aktif' ? p.aktif : !p.aktif;
    return matchSearch && matchTipe && matchStatus;
  });

  const total = data.length;
  const totalPages = Math.max(1, Math.ceil(total / _pengumumanPerPage));
  if (_pengumumanPage > totalPages) _pengumumanPage = totalPages;
  const start = (_pengumumanPage - 1) * _pengumumanPerPage;
  const pageData = data.slice(start, start + _pengumumanPerPage);

  const tb = document.getElementById('pengumumanTableBody');
  if (!tb) return;

  if (!pageData.length) {
    tb.innerHTML = `<tr class="empty-row"><td colspan="5">Tidak ada pengumuman</td></tr>`;
  } else {
    const tipeBadge = { penting: 'badge-merah', info: 'badge-biru', biasa: 'badge-abu' };
    const tipeLabel = { penting: `<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"12\" height=\"12\" fill=\"none\" viewBox=\"0 0 24 24\" stroke=\"#ef4444\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" style=\"vertical-align:-1px;flex-shrink:0\"><path d=\"M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z\"/><line x1=\"12\" y1=\"9\" x2=\"12\" y2=\"13\"/><line x1=\"12\" y1=\"17\" x2=\"12.01\" y2=\"17\"/></svg> Penting`, info: `<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"12\" height=\"12\" fill=\"none\" viewBox=\"0 0 24 24\" stroke=\"#3b82f6\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" style=\"vertical-align:-1px;flex-shrink:0\"><circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 16v-4\"/><path d=\"M12 8h.01\"/></svg> Info`, biasa: `<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"12\" height=\"12\" fill=\"none\" viewBox=\"0 0 24 24\" stroke=\"#f59e0b\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" style=\"vertical-align:-1px;flex-shrink:0\"><path d=\"M6 3v11\"/><path d=\"M6 3l12 6-12 6\"/></svg> Biasa` };
    tb.innerHTML = pageData.map(p => `
      <tr>
        <td style="max-width:220px">
          <div style="font-weight:600;color:var(--teks)">${esc(p.judul)}</div>
          <div style="font-size:.78rem;color:var(--teks-muted);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px">${esc(stripHtml(p.isi || ''))}</div>
        </td>
        <td><span class="badge ${tipeBadge[p.tipe] || 'badge-abu'}">${tipeLabel[p.tipe] || p.tipe}</span></td>
        <td><span class="badge ${p.aktif ? 'badge-hijau' : 'badge-abu'}">${p.aktif ? 'Aktif' : 'Nonaktif'}</span></td>
        <td style="font-size:.8rem;color:var(--teks-muted)">${formatTanggal(p.created_at)}</td>
        <td>
          <div style="display:flex;gap:6px">
            <button class="btn btn-ghost btn-sm" onclick="openPengumumanModal(${p.id})" title="Edit">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5"/><path d="M18.586 2.586a2 2 0 1 1 2.828 2.828L11.828 15 9 16l1-2.828 8.586-8.586z"/></svg>
            </button>
            <button class="btn btn-ghost btn-sm" onclick="togglePengumuman(${p.id}, ${p.aktif})" title="${p.aktif ? 'Nonaktifkan' : 'Aktifkan'}">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p.aktif ? '<path d="M18.36 6.64A9 9 0 0 1 20.77 15"/><path d="M6.16 6.16a9 9 0 1 0 12.68 12.68"/><path d="M12 2v4"/><path d="M2 12h4"/>' : '<path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/>'}</svg>
            </button>
            <button class="btn btn-danger btn-sm" onclick="deletePengumuman(${p.id})" title="Hapus">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6m4-6v6"/><path d="M9 6V4h6v2"/></svg>
            </button>
          </div>
        </td>
      </tr>`).join('');
  }

  // Pagination
  renderPagination('pengumumanPagination', total, _pengumumanPage, _pengumumanPerPage, 'goPengumumanPage');
}

/* ── Aksi Builder ─────────────────────────────────────────────── */
let _aksiItems = []; // [{label, url}]

function _renderAksiList() {
  const wrap = document.getElementById('pengumumanAksiList');
  if (!wrap) return;
  if (!_aksiItems.length) {
    wrap.innerHTML = `<div style="font-size:.78rem;color:var(--teks-muted);padding:6px 0">Belum ada tombol. Klik "+ Tambah Tombol" untuk menambahkan.</div>`;
    return;
  }
  wrap.innerHTML = _aksiItems.map((item, i) => `
    <div style="display:flex;align-items:center;gap:8px;background:var(--bg-card,#f8fafc);border:1px solid var(--border,#e2e8f0);border-radius:8px;padding:8px 10px">
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:4px">
        <input type="text" value="${esc(item.label)}"
          placeholder="Label tombol (contoh: Buka Formulir)"
          style="width:100%;height:30px;font-size:.78rem;border:1px solid var(--border,#e2e8f0);border-radius:6px;padding:0 8px;font-family:inherit;color:var(--teks);background:var(--bg)"
          oninput="_aksiItems[${i}].label = this.value">
        <input type="text" value="${esc(item.url)}"
          placeholder="URL / slug shortlink / slug bundle (contoh: https://... atau nama-bundle)"
          style="width:100%;height:30px;font-size:.78rem;border:1px solid var(--border,#e2e8f0);border-radius:6px;padding:0 8px;font-family:inherit;color:var(--teks);background:var(--bg)"
          oninput="_aksiItems[${i}].url = this.value">
      </div>
      <button type="button" class="btn btn-ghost btn-sm" onclick="_removeAksi(${i})" title="Hapus" style="color:var(--merah);flex-shrink:0">
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
      </button>
    </div>`).join('');
}

function addPengumumanAksi() {
  _aksiItems.push({ label: '', url: '' });
  _renderAksiList();
  // focus ke input label terakhir
  setTimeout(() => {
    const inputs = document.querySelectorAll('#pengumumanAksiList input[type=text]');
    if (inputs.length) inputs[inputs.length - 2]?.focus();
  }, 50);
}

function _removeAksi(i) {
  _aksiItems.splice(i, 1);
  _renderAksiList();
}

/* ── Modal ────────────────────────────────────────────────────── */
function _initQuillPengumuman() {
  if (_quillPengumuman) return; // sudah diinit
  _quillPengumuman = new Quill('#pengumumanEditor', {
    theme: 'snow',
    placeholder: 'Isi pengumuman...',
    modules: {
      toolbar: [
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['bold', 'italic', 'underline'],
        [{ indent: '-1' }, { indent: '+1' }],
        ['clean'],
      ],
    },
  });
}

function openPengumumanModal(id = null) {
  _initQuillPengumuman();

  document.getElementById('pengumumanId').value = '';
  document.getElementById('pengumumanJudul').value = '';
  document.getElementById('pengumumanTipe').value = 'info';
  document.getElementById('pengumumanAktif').checked = true;
  document.getElementById('modalPengumumanTitle').textContent = id ? 'Edit Pengumuman' : 'Tambah Pengumuman';
  _quillPengumuman.setText('');
  _aksiItems = [];
  _renderAksiList();

  if (id) {
    const p = _pengumumanAll.find(x => x.id === id);
    if (p) {
      document.getElementById('pengumumanId').value = p.id;
      document.getElementById('pengumumanJudul').value = p.judul;
      document.getElementById('pengumumanTipe').value = p.tipe || 'info';
      document.getElementById('pengumumanAktif').checked = !!p.aktif;
      _quillPengumuman.clipboard.dangerouslyPasteHTML(p.isi || '');
      // Load aksi
      try {
        _aksiItems = Array.isArray(p.aksi) ? p.aksi.map(a => ({ label: a.label || '', url: a.url || '' })) : [];
      } catch { _aksiItems = []; }
      _renderAksiList();
    }
  }
  openModal('modalPengumuman');
}

async function savePengumuman() {
  const id    = document.getElementById('pengumumanId').value;
  const judul = document.getElementById('pengumumanJudul').value.trim();
  const tipe  = document.getElementById('pengumumanTipe').value;
  const aktif = document.getElementById('pengumumanAktif').checked;

  const isiHtml = _quillPengumuman ? _quillPengumuman.root.innerHTML : '';
  const isiText = _quillPengumuman ? _quillPengumuman.getText().trim() : '';

  if (!judul) { toast('Judul wajib diisi', 'error'); return; }
  if (!isiText) { toast('Isi wajib diisi', 'error'); return; }

  // Validasi & bersihkan aksi — skip entry kosong
  const aksi = _aksiItems
    .map(a => ({ label: (a.label || '').trim(), url: (a.url || '').trim() }))
    .filter(a => a.label && a.url);

  const btn = document.getElementById('btnSavePengumuman');
  btn.disabled = true;
  try {
    const method = id ? 'PUT' : 'POST';
    const url    = id ? `/api/pengumuman/${id}` : '/api/pengumuman';
    const r = await fetch(url, {
      method,
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ judul, isi: isiHtml, tipe, aktif, aksi }),
    });
    const data = await r.json();
    if (!r.ok) { toast(data.error || 'Gagal menyimpan', 'error'); return; }
    toast(id ? 'Pengumuman diperbarui' : 'Pengumuman ditambahkan', 'success');
    closeModal('modalPengumuman');
    loadPengumuman();
  } catch (err) {
    toast('Gagal: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function togglePengumuman(id, currentAktif) {
  try {
    const r = await fetch(`/api/pengumuman/${id}`, {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ aktif: !currentAktif }),
    });
    if (!r.ok) throw new Error();
    toast(!currentAktif ? 'Pengumuman diaktifkan' : 'Pengumuman dinonaktifkan', 'success');
    loadPengumuman();
  } catch {
    toast('Gagal mengubah status', 'error');
  }
}

async function deletePengumuman(id) {
  const ok = await showConfirm({ title: 'Hapus Pengumuman', msg: 'Pengumuman ini akan dihapus permanen.', okText: 'Ya, Hapus' });
  if (!ok) return;
  try {
    const r = await fetch(`/api/pengumuman/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!r.ok) throw new Error();
    toast('Pengumuman dihapus', 'success');
    loadPengumuman();
  } catch {
    toast('Gagal menghapus', 'error');
  }
}

/* ── Helper ───────────────────────────────────────────────────── */
function stripHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

function formatTanggal(str) {
  if (!str) return '-';
  const d = new Date(str);
  const tgl = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Makassar' });
  const wita = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Makassar' }));
  const hh = String(wita.getHours()).padStart(2, '0');
  const mm = String(wita.getMinutes()).padStart(2, '0');
  return `${tgl}, ${hh}:${mm} WITA`;
}
function goPengumumanPage(p) { _pengumumanPage = p; renderPengumumanTable(); }
/* ═══════════════════════════════════════════════════════════════
   TICKER — running text admin
   ═══════════════════════════════════════════════════════════════ */
let _tickerAll = [];

async function loadTicker() {
  try {
    const r = await fetch('/api/ticker', { headers: authHeaders() });
    if (!r.ok) throw new Error(await r.text());
    const { ticker } = await r.json();
    _tickerAll = ticker || [];
    renderTickerTable();
  } catch (err) {
    console.error('[loadTicker]', err);
    const tb = document.getElementById('tickerTableBody');
    if (tb) tb.innerHTML = `<tr class="empty-row"><td colspan="5">Gagal memuat data</td></tr>`;
  }
}

function renderTickerTable() {
  const tb = document.getElementById('tickerTableBody');
  if (!tb) return;
  if (!_tickerAll.length) {
    tb.innerHTML = `<tr class="empty-row"><td colspan="5">Belum ada ticker</td></tr>`;
    return;
  }
  tb.innerHTML = _tickerAll.map((t, i) => `
    <tr>
      <td style="color:var(--teks-muted);font-size:.8rem">${i + 1}</td>
      <td style="font-size:.85rem">
        <span style="display:inline-flex;align-items:center;gap:6px">
          <span style="width:10px;height:10px;border-radius:50%;background:${esc(t.warna_teks||'#1e293b')};flex-shrink:0;border:1px solid rgba(0,0,0,.1)" title="Warna teks: ${esc(t.warna_teks||'#1e293b')}"></span>
          ${t.warna_bg ? `<span style="width:10px;height:10px;border-radius:50%;background:${esc(t.warna_bg)};flex-shrink:0;border:1px solid rgba(0,0,0,.1)" title="Warna bg: ${esc(t.warna_bg)}"></span>` : ''}
          ${esc(t.teks)}
        </span>
      </td>
      <td style="text-align:center;font-size:.8rem;color:var(--teks-muted)">${t.urutan ?? 0}</td>
      <td style="text-align:center">
        <span class="badge ${t.aktif ? 'badge-hijau' : 'badge-abu'}">${t.aktif ? 'Aktif' : 'Nonaktif'}</span>
      </td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn btn-ghost btn-sm" onclick="openTickerModal(${t.id})" title="Edit">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5"/><path d="M18.586 2.586a2 2 0 1 1 2.828 2.828L11.828 15 9 16l1-2.828 8.586-8.586z"/></svg>
          </button>
          <button class="btn btn-ghost btn-sm" onclick="toggleTicker(${t.id}, ${t.aktif})" title="${t.aktif ? 'Nonaktifkan' : 'Aktifkan'}">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${t.aktif ? '<path d="M18.36 6.64A9 9 0 0 1 20.77 15"/><path d="M6.16 6.16a9 9 0 1 0 12.68 12.68"/><path d="M12 2v4"/><path d="M2 12h4"/>' : '<path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/>'}</svg>
          </button>
          <button class="btn btn-danger btn-sm" onclick="deleteTicker(${t.id})" title="Hapus">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6m4-6v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </div>
      </td>
    </tr>`).join('');
}

function openTickerModal(id = null) {
  document.getElementById('tickerId').value = '';
  document.getElementById('tickerTeks').value = '';
  document.getElementById('tickerUrutan').value = '0';
  document.getElementById('tickerAktif').checked = true;
  document.getElementById('modalTickerTitle').textContent = id ? 'Edit Ticker' : 'Tambah Ticker';
  const defaultWarna = '#1e293b';
  let warna = defaultWarna;
  let warnaBg = null;
  if (id) {
    const t = _tickerAll.find(x => x.id === id);
    if (t) {
      document.getElementById('tickerId').value = t.id;
      document.getElementById('tickerTeks').value = t.teks;
      document.getElementById('tickerUrutan').value = t.urutan ?? 0;
      document.getElementById('tickerAktif').checked = !!t.aktif;
      warna = t.warna_teks || defaultWarna;
      warnaBg = t.warna_bg || null;
    }
  }
  document.getElementById('tickerWarna').value = warna;
  document.getElementById('tickerWarnaHex').textContent = warna;
  const bgInput = document.getElementById('tickerWarnaBg');
  const bgHex   = document.getElementById('tickerWarnaBgHex');
  bgInput.value = warnaBg || '#ccfbf1';
  bgInput.dataset.cleared = warnaBg ? '0' : '1';
  bgHex.textContent = warnaBg || 'Default';
  openModal('modalTicker');
}

async function saveTicker() {
  const id     = document.getElementById('tickerId').value;
  const teks       = document.getElementById('tickerTeks').value.trim();
  const urutan     = parseInt(document.getElementById('tickerUrutan').value) || 0;
  const aktif      = document.getElementById('tickerAktif').checked;
  const warna_teks = document.getElementById('tickerWarna').value || '#1e293b';
  const bgInput    = document.getElementById('tickerWarnaBg');
  const warna_bg   = bgInput.dataset.cleared === '1' ? null : (bgInput.value || null);
  if (!teks) { toast('Teks wajib diisi', 'error'); return; }
  const btn = document.getElementById('btnSaveTicker');
  btn.disabled = true;
  try {
    const method = id ? 'PUT' : 'POST';
    const url    = id ? `/api/ticker/${id}` : '/api/ticker';
    const r = await fetch(url, {
      method,
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ teks, urutan, aktif, warna_teks, warna_bg }),
    });
    const data = await r.json();
    if (!r.ok) { toast(data.error || 'Gagal menyimpan', 'error'); return; }
    toast(id ? 'Ticker diperbarui' : 'Ticker ditambahkan', 'success');
    closeModal('modalTicker');
    loadTicker();
  } catch (err) {
    toast('Gagal: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function toggleTicker(id, currentAktif) {
  try {
    const r = await fetch(`/api/ticker/${id}`, {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ aktif: !currentAktif }),
    });
    if (!r.ok) throw new Error();
    toast(!currentAktif ? 'Ticker diaktifkan' : 'Ticker dinonaktifkan', 'success');
    loadTicker();
  } catch {
    toast('Gagal mengubah status', 'error');
  }
}

async function deleteTicker(id) {
  const ok = await showConfirm({ title: 'Hapus Ticker', msg: 'Ticker ini akan dihapus permanen.', okText: 'Ya, Hapus' });
  if (!ok) return;
  try {
    const r = await fetch(`/api/ticker/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!r.ok) throw new Error();
    toast('Ticker dihapus', 'success');
    loadTicker();
  } catch {
    toast('Gagal menghapus', 'error');
  }
}