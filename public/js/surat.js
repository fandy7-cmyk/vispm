// Format tanggal tanpa jam — misal: 04 Jun 2026
function fmtDateOnly(val) {
  if (!val) return '—';
  const d = new Date(val);
  if (isNaN(d)) return val;
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Stat card helper (icon + border-left berwarna) ──────────────────────
function _smStatCard(label, value, color, iconPath) {
  return `<div class="stat-card" style="border-left-color:${color}">
    <div class="stat-card-body">
      <div class="stat-label">${label}</div>
      <div class="stat-value" style="color:${color}">${value}</div>
    </div>
    <div class="stat-icon">
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="${color}" stroke-width="2">${iconPath}</svg>
    </div>
  </div>`;
}

// ── Render badge / tombol dokumen di kolom tabel (multi-file aware) ────────
function renderDocsBadge(fileUrlRaw, label) {
  if (!fileUrlRaw) return '<span style="color:var(--teks-muted)">—</span>';
  let files = [];
  try {
    const parsed = JSON.parse(fileUrlRaw);
    if (Array.isArray(parsed)) files = parsed.filter(f => f && f.url);
  } catch {
    files = [{ url: fileUrlRaw, name: 'Dokumen' }];
  }
  if (!files.length) return '<span style="color:var(--teks-muted)">—</span>';
  if (files.length === 1) {
    return `<span style="display:inline-flex;align-items:center;gap:3px">
      <button class="btn btn-ghost btn-sm" title="Lihat Dokumen" onclick="viewDocMulti([{url:decodeURIComponent('${encodeURIComponent(files[0].url)}'),name:decodeURIComponent('${encodeURIComponent(files[0].name||'')}')}],0,decodeURIComponent('${encodeURIComponent(label||'')}'))">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
      </button>
    </span>`;
  }
  // Multiple files — langsung buka modal preview dengan navigasi (sama seperti kinerja)
  const filesJson = encodeURIComponent(JSON.stringify(files));
  const labelJson = encodeURIComponent(label || '');
  return `<span style="display:inline-flex;align-items:center;gap:3px">
      <button class="btn btn-ghost btn-sm" title="Preview ${files.length} Dokumen" onclick="viewDocMulti(JSON.parse(decodeURIComponent('${filesJson}')), 0, decodeURIComponent('${labelJson}'))">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
      </button>
    </span>`;
}

// Hapus dokumen langsung dari baris tabel (kolom Dokumen)
// btn = elemen tombol (untuk cari tr parent), fileUrlRaw = nilai file_url saat ini
async function deleteDocBadge(btn, fileUrlRaw) {
  // Cari baris tr dan id record
  const tr = btn.closest('tr');
  if (!tr) return;

  // Tentukan apakah surat masuk atau keluar dari struktur tabel
  // smTableBody = surat masuk (11 kolom), skTableBody = surat keluar (8 kolom)
  const tbody = tr.closest('tbody');
  const isSM  = tbody?.id === 'smTableBody';
  const isSK  = tbody?.id === 'skTableBody';
  if (!isSM && !isSK) return;

  // Ambil id dari tombol edit/hapus di kolom Aksi (onclick="editSM(id)" atau "editSK(id)")
  const aksiBtn = tr.querySelector('[onclick^="editSM"], [onclick^="editSK"]');
  if (!aksiBtn) return;
  const match = aksiBtn.getAttribute('onclick').match(/\d+/);
  if (!match) return;
  const recordId = parseInt(match[0]);

  // Parse file list untuk konfirmasi
  let files = [];
  try {
    const parsed = JSON.parse(fileUrlRaw);
    files = Array.isArray(parsed) ? parsed.filter(f => f && f.url) : [{ url: fileUrlRaw, name: 'Dokumen' }];
  } catch { files = [{ url: fileUrlRaw, name: 'Dokumen' }]; }

  const namaFile = files.length === 1 ? `"${files[0].name}"` : `${files.length} file dokumen`;
  const ok = await showConfirm({
    title:  'Hapus Dokumen',
    msg:    `${namaFile} akan dihapus permanen dari surat ini.`,
    okText: 'Ya, Hapus', icon: 'trash',
  });
  if (!ok) return;

  // Update DB — fetch data lengkap dulu, lalu PUT dengan semua field + file_url/file_name = null
  try {
    const apiBase = isSM ? '/api/surat-masuk' : '/api/surat-keluar';
    const rGet = await fetch(`${apiBase}?limit=1000`, { headers: authHeaders() });
    const dGet = await rGet.json();
    const rec  = (dGet.surat || []).find(x => x.id === recordId);
    if (!rec) { toast('Data surat tidak ditemukan', 'error'); return; }

    let body;
    if (isSM) {
      body = {
        no_agenda:      rec.no_agenda,
        no_surat:       rec.no_surat       ?? null,
        tanggal_surat:  rec.tanggal_surat  ? rec.tanggal_surat.split('T')[0]  : null,
        tanggal_terima: rec.tanggal_terima ? rec.tanggal_terima.split('T')[0] : null,
        asal_surat:     rec.asal_surat,
        perihal:        rec.perihal,
        batas_waktu:    rec.batas_waktu    ? rec.batas_waktu.split('T')[0]    : null,
        pegawai:        rec.pegawai        ?? null,
        keterangan:     rec.keterangan     ?? null,
        selesai:        rec.selesai,
        file_url:       null,
        file_name:      null,
      };
    } else {
      body = {
        no_agenda:     rec.no_agenda,
        no_surat:      rec.no_surat      ?? null,
        tanggal_surat: rec.tanggal_surat ? rec.tanggal_surat.split('T')[0] : null,
        tujuan_surat:  rec.tujuan_surat,
        perihal:       rec.perihal,
        pegawai:       rec.pegawai       ?? null,
        keterangan:    rec.keterangan    ?? null,
        file_url:      null,
        file_name:     null,
      };
    }

    const r = await fetch(`${apiBase}/${recordId}`, {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify(body),
    });
    if (!r.ok) { const d = await r.json().catch(()=>{}); toast(d?.error || 'Gagal menghapus', 'error'); return; }

    // Hapus dari Cloudinary (background)
    for (const f of files) {
      if (f.url) deleteCloudinaryFile(f.url);
    }

    toast('Dokumen berhasil dihapus');

    // Re-render kolom dokumen di baris ini saja (tanpa reload full)
    const docsCell = tr.querySelectorAll('td')[isSM ? 8 : 6];
    if (docsCell) docsCell.innerHTML = '<span style="color:var(--teks-muted)">—</span>';
  } catch (err) { toast('Error: ' + err.message, 'error'); }
}

function toggleDocDD(id, event) {
  if (event) event.stopPropagation();
  const el = document.getElementById(id);
  if (!el) return;
  const isOpen = el.style.display !== 'none';
  // Tutup semua yang lain
  document.querySelectorAll('.doc-dd-panel').forEach(p => p.style.display = 'none');
  el.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) {
    setTimeout(() => {
      const close = () => { el.style.display = 'none'; document.removeEventListener('click', close); };
      document.addEventListener('click', close, { once: true });
    }, 10);
  }
}

// ═══════════════════════════════════════════
// SURAT MASUK
// ═══════════════════════════════════════════
let _smFilter = '', _smPage = 1;

// Populate dropdown tahun surat masuk/keluar dari data yang sudah ada
function _populateSuratTahun(suratList, selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const current = sel.value;
  const years = [...new Set(suratList
    .map(s => s.tanggal_surat || s.tanggal_terima || '')
    .filter(Boolean)
    .map(d => d.slice(0, 4))
  )].sort((a, b) => b - a);
  sel.innerHTML = '<option value="">Semua Tahun</option>' +
    years.map(y => `<option value="${y}" ${y === current ? 'selected' : ''}>${y}</option>`).join('');
  if (typeof window.syncCustomSelect === 'function') syncCustomSelect(selectId);
}

const _NAMA_BULAN = ['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

function _populateSuratBulan(suratList, selectId, dateField) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const current = sel.value;
  const bulanSet = [...new Set(
    suratList
      .map(s => s[dateField] || '')
      .filter(Boolean)
      .map(d => parseInt(d.slice(5, 7), 10))
      .filter(m => m >= 1 && m <= 12)
  )].sort((a, b) => a - b);
  sel.innerHTML = '<option value="">Semua Bulan</option>' +
    bulanSet.map(m => `<option value="${m}" ${String(m) === current ? 'selected' : ''}>${_NAMA_BULAN[m]}</option>`).join('');
  if (typeof window.syncCustomSelect === 'function') syncCustomSelect(selectId);
}

function _populateSuratStatus(suratList, selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const current = sel.value;
  const hasProses  = suratList.some(s => s.selesai === false);
  const hasSelesai = suratList.some(s => s.selesai === true);
  let opts = '<option value="">Semua Status</option>';
  if (hasProses)  opts += '<option value="false">Belum Selesai</option>';
  if (hasSelesai) opts += '<option value="true">Selesai</option>';
  sel.innerHTML = opts;
  // Pertahankan nilai yang sedang dipilih jika masih relevan
  if ([...sel.options].some(o => o.value === current)) sel.value = current;
  if (typeof window.syncCustomSelect === 'function') syncCustomSelect(selectId);
}

function _populateSuratPegawai(suratList, selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const current = sel.value;
  const pegawaiSet = [...new Set(
    suratList.map(s => s.pegawai || '').filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, 'id'));
  sel.innerHTML = '<option value="">Semua Pegawai</option>' +
    pegawaiSet.map(p => `<option value="${esc(p)}" ${p === current ? 'selected' : ''}>${esc(p)}</option>`).join('');
  if (typeof window.syncCustomSelect === 'function') syncCustomSelect(selectId);
}

function setSMFilter(v) {
  _smFilter = v; _smPage = 1;
  // sync select
  const sel = document.getElementById('smFilterStatus');
  if (sel) { sel.value = v; if (typeof syncCustomSelect === 'function') syncCustomSelect('smFilterStatus'); }
  loadSuratMasuk(1);
}

async function loadSuratMasuk(page = 1) {
  _smPage = page;
  const isAdmin = !!(_user && _user.is_admin);
  // isFull = admin ATAU non-admin dengan hak akses "surat.masuk.full" (setara admin khusus surat masuk)
  const isFull  = isAdmin || (typeof hasAccess === 'function' && hasAccess('surat.masuk.full'));
  // Non-full cuma bisa lihat suratnya sendiri, jadi filter Pegawai nggak relevan
  const pegawaiWrap = document.getElementById('smFilterPegawai')?.closest('.select-wrap');
  if (pegawaiWrap) pegawaiWrap.style.display = isFull ? '' : 'none';
  const q      = document.getElementById('smSearch')?.value || '';
  const tahun  = document.getElementById('smFilterTahun')?.value || '';
  const bulan  = document.getElementById('smFilterBulan')?.value || '';
  const pegawai = isFull ? (document.getElementById('smFilterPegawai')?.value || '') : '';
  const params = new URLSearchParams({ page, limit: 20, q });
  if (_smFilter) params.set('selesai', _smFilter);
  if (tahun)     params.set('tahun', tahun);
  if (bulan)     params.set('bulan', bulan);
  if (pegawai)   params.set('pegawai', pegawai);
  try {
    const r = await fetch(`/api/surat-masuk?${params}`, { headers: authHeaders() });
    const d = await r.json();
    const tb = document.getElementById('smTableBody');
    const smOffset = (page - 1) * 20;
    tb.innerHTML = (d.surat||[]).length ? d.surat.map((s, idx) => `
      <tr>
        <td>${smOffset + idx + 1}</td>
        <td>${esc(s.asal_surat)}</td>
        <td>${s.no_surat ? esc(s.no_surat) : '—'}</td>
        <td>${s.tanggal_surat ? fmtDateOnly(s.tanggal_surat) : '—'}</td>
        <td>${esc(s.perihal)}</td>
        <td>${fmtDateOnly(s.tanggal_terima)}</td>
        <td>${s.batas_waktu ? `<span style="white-space:nowrap">${fmtDateOnly(s.batas_waktu)}${!s.selesai && new Date(s.batas_waktu) < new Date() ? ' <span class=\"badge badge-red\">!</span>' : ''}</span>` : '—'}</td>
        <td>${s.pegawai ? esc(s.pegawai) : '—'}</td>
        <td style="text-align:center">${renderDocsBadge(s.file_url, 'Surat Masuk — ' + (s.perihal||''))}</td>
        <td>
          <span class="badge ${s.selesai?'badge-green':'badge-yellow'}">${s.selesai?'Selesai':'Proses'}</span>
        </td>
        <td style="white-space:nowrap">
          ${(isFull || s.created_by === (_user && _user.id)) ? `<button class="btn btn-ghost btn-sm" title="Edit" onclick="editSM(${s.id})"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg></button>` : ''}
          <button class="btn btn-ghost btn-sm" title="${s.selesai?'Buka Kembali':'Tandai Selesai'}" onclick="toggleSMSelesai(${s.id},${s.selesai})">${s.selesai?'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>':'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>'}</button>
          ${(isFull || s.created_by === (_user && _user.id)) ? `<button class="btn btn-danger btn-sm" title="Hapus" onclick="deleteSM(${s.id})"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path stroke-linecap="round" stroke-linejoin="round" d="M19 6l-1 14H6L5 6"/><path stroke-linecap="round" stroke-linejoin="round" d="M10 11v6m4-6v6"/><path stroke-linecap="round" stroke-linejoin="round" d="M9 6V4h6v2"/></svg></button>` : ''}
        </td>
      </tr>`).join('')
      : '<tr class="empty-row"><td colspan="11">Tidak ada data</td></tr>';
    renderPagination('smPagination', d.total||0, page, 20, 'loadSuratMasuk');

    // Populate dropdown tahun hanya saat page=1 tanpa filter tahun (supaya tetap lengkap)
    if (page === 1 && !tahun && !bulan) {
      try {
        const rAll = await fetch('/api/surat-masuk?limit=9999&q=', { headers: authHeaders() });
        const dAll = await rAll.json();
        _populateSuratTahun(dAll.surat || [], 'smFilterTahun');
        _populateSuratBulan(dAll.surat || [], 'smFilterBulan', 'tanggal_terima');
        _populateSuratStatus(dAll.surat || [], 'smFilterStatus');
        if (isFull) _populateSuratPegawai(dAll.surat || [], 'smFilterPegawai');
        setTimeout(() => { if (typeof initCustomSelects === 'function') initCustomSelects(); }, 50);
      } catch {}
    }

  } catch {}
}

let _smData = [];
let _smPegawaiList = [];   // cache user Sub Bag Perencanaan

async function loadPegawaiPerencanaan() {
  if (_smPegawaiList.length) return;   // sudah di-cache
  try {
    const r = await fetch('/api/users/perencanaan', { headers: authHeaders() });
    const d = await r.json();
    _smPegawaiList = (d.pegawai || []).map(nama => ({ nama }));
  } catch { _smPegawaiList = []; }
}

function renderPegawaiOptions(selectedNama) {
  const opts = _smPegawaiList.map(u =>
    `<option value="${esc(u.nama)}" ${u.nama === selectedNama ? 'selected' : ''}>${esc(u.nama)}</option>`
  ).join('');
  return `<option value="">— Pilih Pegawai —</option>` + opts;
}

async function openSMModal() {
  await loadPegawaiPerencanaan();
  document.getElementById('smId').value = '';
  ['smNoSurat','smAsal','smPerihal','smKeterangan']
    .forEach(id => document.getElementById(id).value = '');
  document.getElementById('smPegawai').innerHTML = renderPegawaiOptions(null);
  dpSetValue('smTglSurat', null);
  dpSetValue('smTglTerima', null);
  dpSetValue('smBatas', null);
  document.getElementById('smSelesai').checked = false;
  document.getElementById('modalSMTitle').textContent = 'Tambah Surat Masuk';
  resetUploadArea('sm');
  openModal('modalSM');
}

async function editSM(id) {
  try {
    await loadPegawaiPerencanaan();
    // Reload list buat cari data
    const r = await fetch(`/api/surat-masuk?limit=1000`, { headers: authHeaders() });
    const d = await r.json();
    const s = d.surat.find(x => x.id === id); if (!s) return;
    document.getElementById('smId').value = s.id;
    document.getElementById('smNoSurat').value = s.no_surat || '';
    dpSetValue('smTglSurat',  s.tanggal_surat?.split('T')[0] || null);
    dpSetValue('smTglTerima', s.tanggal_terima?.split('T')[0] || null);
    document.getElementById('smAsal').value = s.asal_surat || '';
    document.getElementById('smPerihal').value = s.perihal || '';
    document.getElementById('smPegawai').innerHTML = renderPegawaiOptions(s.pegawai || null);
    dpSetValue('smBatas', s.batas_waktu?.split('T')[0] || null);
    document.getElementById('smKeterangan').value = s.keterangan || '';
    document.getElementById('smSelesai').checked = s.selesai;
    document.getElementById('modalSMTitle').textContent = 'Edit Surat Masuk';
    resetUploadArea('sm');
    if (s.file_url) setExistingFile('sm', s.file_url, s.file_name || '');
    openModal('modalSM');
  } catch {}
}

async function saveSM() {
  const id = document.getElementById('smId').value;
  const body = {
    no_surat: document.getElementById('smNoSurat').value.trim() || null,
    tanggal_surat: dpGetValue('smTglSurat') || null,
    tanggal_terima: dpGetValue('smTglTerima') || null,
    asal_surat: document.getElementById('smAsal').value.trim(),
    perihal: document.getElementById('smPerihal').value.trim(),
    pegawai: document.getElementById('smPegawai').value || null,
    batas_waktu: dpGetValue('smBatas') || null,
    keterangan: document.getElementById('smKeterangan').value.trim() || null,
    file_url: getUploadUrl('sm'),
    file_name: getUploadName('sm') || null,
    selesai: document.getElementById('smSelesai').checked,
  };
  if (!body.asal_surat || !body.perihal) { toast('Asal surat dan perihal wajib diisi', 'error'); return; }
  try {
    const r = await fetch(id ? `/api/surat-masuk/${id}` : '/api/surat-masuk', {
      method: id ? 'PUT' : 'POST', headers: authHeaders(), body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!r.ok) { toast(d.error || 'Gagal', 'error'); return; }
    toast(id ? 'Surat diperbarui' : 'Surat ditambahkan');
    closeModal('modalSM'); loadSuratMasuk(_smPage);
  } catch { toast('Gagal menyimpan', 'error'); }
}

async function toggleSMSelesai(id, current) {
  try {
    await fetch(`/api/surat-masuk/${id}/selesai`, {
      method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ selesai: !current }),
    });
    toast(!current ? 'Ditandai selesai' : 'Status dibuka kembali');
    loadSuratMasuk(_smPage);
  } catch {}
}

async function deleteSM(id) {
  const ok = await showConfirm({ title: 'Hapus Surat Masuk', msg: 'Data surat masuk ini akan dihapus permanen.', okText: 'Ya, Hapus', icon: 'trash' });
  if (!ok) return;
  await fetch(`/api/surat-masuk/${id}`, { method: 'DELETE', headers: authHeaders() });
  toast('Surat berhasil dihapus'); loadSuratMasuk(_smPage);
}

// ═══════════════════════════════════════════
// SURAT KELUAR
// ═══════════════════════════════════════════
let _skPage = 1;

async function loadSuratKeluar(page = 1) {
  _skPage = page;
  const isAdmin = !!(_user && _user.is_admin);
  // isFull = admin ATAU non-admin dengan hak akses "surat.keluar.full" (setara admin khusus surat keluar)
  const isFull  = isAdmin || (typeof hasAccess === 'function' && hasAccess('surat.keluar.full'));
  // Non-full cuma bisa lihat suratnya sendiri, jadi filter Pegawai nggak relevan
  const pegawaiWrap = document.getElementById('skFilterPegawai')?.closest('.select-wrap');
  if (pegawaiWrap) pegawaiWrap.style.display = isFull ? '' : 'none';
  const q       = document.getElementById('skSearch')?.value || '';
  const tahun   = document.getElementById('skFilterTahun')?.value || '';
  const bulan   = document.getElementById('skFilterBulan')?.value || '';
  const pegawai = isFull ? (document.getElementById('skFilterPegawai')?.value || '') : '';
  const params = new URLSearchParams({ page, limit: 20, q });
  if (tahun)   params.set('tahun', tahun);
  if (bulan)   params.set('bulan', bulan);
  if (pegawai) params.set('pegawai', pegawai);
  try {
    const r = await fetch(`/api/surat-keluar?${params}`, { headers: authHeaders() });
    const d = await r.json();
    const tb = document.getElementById('skTableBody');
    const skOffset = (page - 1) * 20;
    tb.innerHTML = (d.surat||[]).length ? d.surat.map((s, idx) => `
      <tr>
        <td>${skOffset + idx + 1}</td>
        <td>${esc(s.tujuan_surat)}</td>
        <td>${s.no_surat ? esc(s.no_surat) : '—'}</td>
        <td>${s.tanggal_surat ? fmtDateOnly(s.tanggal_surat) : '—'}</td>
        <td>${esc(s.perihal)}</td>
        <td>${s.pegawai ? esc(s.pegawai) : '—'}</td>
        <td style="text-align:center">${renderDocsBadge(s.file_url, 'Surat Keluar — ' + (s.perihal||''))}</td>
        <td style="white-space:nowrap">
          ${(isFull || s.created_by === (_user && _user.id)) ? `<button class="btn btn-ghost btn-sm" title="Edit" onclick="editSK(${s.id})"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg></button>
          <button class="btn btn-danger btn-sm" title="Hapus" onclick="deleteSK(${s.id})"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path stroke-linecap="round" stroke-linejoin="round" d="M19 6l-1 14H6L5 6"/><path stroke-linecap="round" stroke-linejoin="round" d="M10 11v6m4-6v6"/><path stroke-linecap="round" stroke-linejoin="round" d="M9 6V4h6v2"/></svg></button>` : '<span style="color:var(--teks-muted)">—</span>'}
        </td>
      </tr>`).join('')
      : '<tr class="empty-row"><td colspan="8">Tidak ada data</td></tr>';
    renderPagination('skPagination', d.total||0, page, 20, 'loadSuratKeluar');

    // Populate dropdown tahun surat keluar
    if (page === 1 && !tahun && !bulan) {
      try {
        const rAll = await fetch('/api/surat-keluar?limit=9999&q=', { headers: authHeaders() });
        const dAll = await rAll.json();
        _populateSuratTahun(dAll.surat || [], 'skFilterTahun');
        _populateSuratBulan(dAll.surat || [], 'skFilterBulan', 'tanggal_surat');
        if (isFull) _populateSuratPegawai(dAll.surat || [], 'skFilterPegawai');
        setTimeout(() => { if (typeof initCustomSelects === 'function') initCustomSelects(); }, 50);
      } catch {}
    }

  } catch {}
}

async function openSKModal() {
  await loadPegawaiPerencanaan();
  document.getElementById('skId').value = '';
  ['skNoSurat','skTujuan','skPerihal','skKeterangan']
    .forEach(id => document.getElementById(id).value = '');
  document.getElementById('skPegawai').innerHTML = renderPegawaiOptions(null);
  dpSetValue('skTglSurat', null);
  document.getElementById('modalSKTitle').textContent = 'Tambah Surat Keluar';
  resetUploadArea('sk');
  openModal('modalSK');
}

async function editSK(id) {
  try {
    await loadPegawaiPerencanaan();
    const r = await fetch(`/api/surat-keluar?limit=1000`, { headers: authHeaders() });
    const d = await r.json();
    const s = d.surat.find(x => x.id === id); if (!s) return;
    document.getElementById('skId').value = s.id;
    document.getElementById('skNoSurat').value = s.no_surat || '';
    dpSetValue('skTglSurat', s.tanggal_surat?.split('T')[0] || null);
    document.getElementById('skTujuan').value = s.tujuan_surat || '';
    document.getElementById('skPerihal').value = s.perihal || '';
    document.getElementById('skPegawai').innerHTML = renderPegawaiOptions(s.pegawai || null);
    document.getElementById('skKeterangan').value = s.keterangan || '';
    document.getElementById('modalSKTitle').textContent = 'Edit Surat Keluar';
    resetUploadArea('sk');
    if (s.file_url) setExistingFile('sk', s.file_url, s.file_name || '');
    openModal('modalSK');
  } catch {}
}

async function saveSK() {
  const id = document.getElementById('skId').value;
  const body = {
    no_surat: document.getElementById('skNoSurat').value.trim() || null,
    tanggal_surat: dpGetValue('skTglSurat') || null,
    tujuan_surat: document.getElementById('skTujuan').value.trim(),
    perihal: document.getElementById('skPerihal').value.trim(),
    pegawai: document.getElementById('skPegawai').value || null,
    keterangan: document.getElementById('skKeterangan').value.trim() || null,
    file_url: getUploadUrl('sk'),
    file_name: getUploadName('sk') || null,
  };
  if (!body.tujuan_surat || !body.perihal) { toast('Tujuan dan perihal wajib diisi', 'error'); return; }
  try {
    const r = await fetch(id ? `/api/surat-keluar/${id}` : '/api/surat-keluar', {
      method: id ? 'PUT' : 'POST', headers: authHeaders(), body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!r.ok) { toast(d.error || 'Gagal', 'error'); return; }
    toast(id ? 'Surat diperbarui' : 'Surat ditambahkan');
    closeModal('modalSK'); loadSuratKeluar(_skPage);
  } catch { toast('Gagal menyimpan', 'error'); }
}

async function deleteSK(id) {
  const ok = await showConfirm({ title: 'Hapus Surat Keluar', msg: 'Data surat keluar ini akan dihapus permanen.', okText: 'Ya, Hapus', icon: 'trash' });
  if (!ok) return;
  await fetch(`/api/surat-keluar/${id}`, { method: 'DELETE', headers: authHeaders() });
  toast('Surat berhasil dihapus'); loadSuratKeluar(_skPage);
}
// ═══════════════════════════════════════════════════════════════════════════
// UPLOAD BUKTI DOKUMEN — MULTI-FILE helper functions
// ═══════════════════════════════════════════════════════════════════════════

// State upload per prefix ('sm' | 'sk') — files adalah array [{url, name}]
const _uploadState = {};

function _getUploadState(prefix) {
  if (!_uploadState[prefix]) _uploadState[prefix] = { tab: 'file', files: [] };
  return _uploadState[prefix];
}

/* ── Tab switcher — no-op, tab link sudah dihapus ── */
function switchUploadTab(prefix, tab) { /* tidak digunakan lagi */ }

/* ── Reset semua state upload (saat buka modal baru) ── */
function resetUploadArea(prefix) {
  const state = _getUploadState(prefix);
  state.tab = 'file'; state.files = [];
  _renderFileList(prefix);
  const pw = document.getElementById(`${prefix}ProgressWrap`);
  if (pw) pw.style.display = 'none';
  const fi = document.getElementById(`${prefix}FileInput`);
  if (fi) fi.value = '';
  const area = document.getElementById(`${prefix}UploadArea`);
  if (area) area.classList.remove('drag-over');
}

/* ── Tampilkan file yang sudah ada (saat edit) — mendukung JSON array atau single URL lama ── */
function setExistingFile(prefix, fileUrlRaw, fileNameRaw) {
  if (!fileUrlRaw) return;
  const state = _getUploadState(prefix);
  // Coba parse JSON array [{url,name},...] — format baru
  let files = [];
  try {
    const parsed = JSON.parse(fileUrlRaw);
    if (Array.isArray(parsed)) {
      files = parsed.filter(f => f && f.url);
    }
  } catch {
    // Format lama: single URL string
    files = [{ url: fileUrlRaw, name: fileNameRaw || 'Dokumen' }];
  }
  state.files = files;
  _renderFileList(prefix);
}

/* ── Getter untuk saveSM/saveSK — mengembalikan JSON string array ── */
function getUploadUrl(prefix) {
  const state = _getUploadState(prefix);
  if (!state.files.length) return null;
  return JSON.stringify(state.files);
}
function getUploadName(prefix) {
  const state = _getUploadState(prefix);
  if (!state.files.length) return null;
  return state.files.map(f => f.name).join(', ');
}

/* ── Render daftar file yang sudah ada / diupload ── */
function _renderFileList(prefix) {
  const container = document.getElementById(`${prefix}FilePreview`);
  if (!container) return;
  const state = _getUploadState(prefix);
  if (!state.files.length) {
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }
  container.style.display = '';
  container.innerHTML = `
    <div class="multi-file-list">
      ${state.files.map((f, idx) => _buildFileCard(prefix, f, idx)).join('')}
    </div>`;
}

function _buildFileCard(prefix, f, idx) {
  const ext = (f.name || '').split('.').pop().toLowerCase();
  const iconColor = { pdf: '#ef4444', doc: '#3b82f6', docx: '#3b82f6', xls: '#22c55e', xlsx: '#22c55e', jpg: '#f59e0b', jpeg: '#f59e0b', png: '#f59e0b' }[ext] || '#64748b';
  const isImg = ['jpg','jpeg','png','gif','webp'].includes(ext);
  const isLoading = f._loading;
  // Icon trash SVG (hapus dari daftar + Cloudinary)
  const trashSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path stroke-linecap="round" stroke-linejoin="round" d="M19 6l-1 14H6L5 6"/><path stroke-linecap="round" stroke-linejoin="round" d="M10 11v6m4-6v6"/><path stroke-linecap="round" stroke-linejoin="round" d="M9 6V4h6v2"/></svg>`;
  return `
    <div class="multi-file-card" id="${prefix}FileCard${idx}" style="${isLoading ? 'opacity:.6' : ''}">
      ${isImg && f.url
        ? `<div class="mfc-thumb" style="background-image:url('${f.url}')"></div>`
        : `<div class="mfc-icon" style="background:${iconColor}">${isLoading
            ? `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#fff" stroke-width="2" style="animation:spin 1s linear infinite"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>`
            : `<span>${ext.toUpperCase()}</span>`
          }</div>`
      }
      <div class="mfc-info">
        <div class="mfc-name" title="${escSurat(f.name)}">${escSurat(f.name)}</div>
        ${isLoading ? `<div style="font-size:.7rem;color:#94a3b8">Mengupload…</div>` : ''}
      </div>
      <div class="mfc-actions">
        ${f.url && !isLoading ? `<button type="button" class="btn btn-ghost btn-sm" title="Preview" onclick="viewDoc(decodeURIComponent('${encodeURIComponent(f.url)}'), decodeURIComponent('${encodeURIComponent(f.name || "")}'))">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
        </button>` : ''}
        ${!isLoading ? `<button type="button" class="btn btn-danger btn-sm" title="Hapus file (termasuk dari Cloudinary)" onclick="removeUploadedFile('${prefix}',${idx})">
          ${trashSvg}
        </button>` : ''}
      </div>
    </div>`;
}

function escSurat(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/* ── Drag & Drop events ── */
function handleDragOver(e, prefix) {
  e.preventDefault();
  document.getElementById(`${prefix}UploadArea`)?.classList.add('drag-over');
}
function handleDragLeave(e, prefix) {
  document.getElementById(`${prefix}UploadArea`)?.classList.remove('drag-over');
}
async function handleDrop(e, prefix) {
  e.preventDefault();
  document.getElementById(`${prefix}UploadArea`)?.classList.remove('drag-over');
  const files = Array.from(e.dataTransfer?.files || []);
  if (!files.length) return;
  const results = await Promise.all(files.map(f => processFile(prefix, f)));
  _showBatchUploadToast(results);
}

/* ── Tampilkan satu toast ringkasan setelah batch upload ── */
function _showBatchUploadToast(results) {
  if (!results || !results.length) return;
  const success = results.filter(r => r && r.ok);
  const failed  = results.filter(r => r && !r.ok);
  if (results.length === 1) {
    if (success.length) toast(`${success[0].name} berhasil diupload`);
    else toast(failed[0]?.error || 'Gagal upload file', 'error');
    return;
  }
  // Multi-file: satu toast ringkasan
  if (failed.length === 0) {
    toast(`${success.length} file berhasil diupload`);
  } else if (success.length === 0) {
    toast(`Semua ${failed.length} file gagal diupload`, 'error');
  } else {
    toast(`${success.length} file berhasil, ${failed.length} gagal diupload`, 'error');
  }
}

/* ── File input change — support multiple ── */
async function handleFileSelect(e, prefix) {
  const files = Array.from(e.target.files || []);
  e.target.value = ''; // reset agar bisa pilih file yang sama lagi
  if (!files.length) return;
  const results = await Promise.all(files.map(f => processFile(prefix, f)));
  _showBatchUploadToast(results);
}

/* ── Proses & upload file (satu per satu, bisa dipanggil berkali-kali) ── */
async function processFile(prefix, file) {
  const MAX_MB = 2;
  if (file.size > MAX_MB * 1024 * 1024) {
    toast(`${file.name}: terlalu besar (maks. ${MAX_MB} MB)`, 'error'); return;
  }

  // Tambahkan placeholder loading ke list
  const state = _getUploadState(prefix);
  const placeholderIdx = state.files.length;
  state.files.push({ url: null, name: file.name, _loading: true });
  _renderFileList(prefix);

  const pw = document.getElementById(`${prefix}ProgressWrap`);
  const pb = document.getElementById(`${prefix}ProgressBar`);
  if (pw) pw.style.display = '';
  if (pb) pb.style.width = '30%';

  try {
    const formData = new FormData();
    formData.append('file', file);
    const r = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Authorization': authHeaders()['Authorization'] },
      body: formData,
    });
    if (pb) pb.style.width = '90%';
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d.error || 'Gagal upload');
    }
    const d = await r.json();
    if (pb) { pb.style.width = '100%'; setTimeout(() => { if (pw) pw.style.display = 'none'; }, 600); }
    // Update placeholder dengan data nyata
    state.files[placeholderIdx] = { url: d.url, name: d.name || file.name };
    _renderFileList(prefix);
    return { ok: true, name: file.name };
  } catch (err) {
    if (pw) pw.style.display = 'none';
    // Hapus placeholder yang gagal
    state.files.splice(placeholderIdx, 1);
    _renderFileList(prefix);
    return { ok: false, name: file.name, error: err.message || 'Gagal upload file' };
  }
}

/* ── Hapus satu file dari list + dari Cloudinary ── */
async function removeUploadedFile(prefix, idx) {
  const state = _getUploadState(prefix);
  const file  = state.files[idx];
  if (!file) return;

  // Konfirmasi hapus jika file sudah terupload (punya URL)
  if (file.url) {
    const ok = await showConfirm({
      title:  'Hapus File',
      msg:    `File "${file.name}" akan dihapus dari daftar dan dari server Cloudinary secara permanen.`,
      okText: 'Ya, Hapus',
      icon:   'trash',
    });
    if (!ok) return;
  }

  // Hapus dari UI dulu (optimistik)
  state.files.splice(idx, 1);
  _renderFileList(prefix);

  // Hapus dari Cloudinary (background, tidak block UI)
  if (file.url) {
    const ok = await deleteCloudinaryFile(file.url);
    if (ok) {
      toast('File berhasil dihapus dari server');
    } else {
      toast('File dihapus dari daftar (hapus Cloudinary gagal — cek console)', 'error');
    }
  } else {
    toast('File dihapus');
  }
}

/* ── Backward compat alias (dipanggil dari showFilePreview lama jika ada) ── */
function showFilePreview() {} // no-op, sudah diganti _renderFileList
// ═══════════════════════════════════════════════════════════════════════════
// DELETE FILE CLOUDINARY
// ═══════════════════════════════════════════════════════════════════════════

/* ── Hapus file dari Cloudinary via sign-url DELETE endpoint ── */
async function deleteCloudinaryFile(url) {
  if (!url || !url.includes('cloudinary.com')) return true; // bukan Cloudinary, skip
  try {
    const r = await fetch('/.netlify/functions/sign-url', {
      method: 'DELETE',
      headers: { ...authHeaders() },
      body: JSON.stringify({ url }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) {
      console.warn('[deleteCloudinaryFile] Gagal:', d.error || r.status);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[deleteCloudinaryFile] Error:', e.message);
    return false;
  }
}