// ═══════════════════════════════════════════════════════════════════════════
// PERIODE — state & helpers  (versi per-bulan + window buka/tutup)
// ═══════════════════════════════════════════════════════════════════════════
let _periodeList  = [];
let _periodeAktif = null;   // cache { id, tahun, bulan, label, open_at, close_at, ... }

// ── Pagination state ──
let _periodePage     = 1;
const _periodePageSize = 10;
let _periodeSearch   = '';
let _periodeFilterStatus = '';   // '' | 'aktif' | 'ditutup' | 'belum'
let _periodeFilterTahun  = '';   // '' | '2026' | '2027' dst

const BULAN_FULL_P  = ['','Januari','Februari','Maret','April','Mei','Juni',
                        'Juli','Agustus','September','Oktober','November','Desember'];
const BULAN_SHORT_P = ['','Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

// Dipanggil sekali saat app boot (setelah login) — hasilnya di-cache global
// Returns array of periods currently open (now BETWEEN open_at AND close_at)
async function loadPeriodeAktif() {
  try {
    const r = await fetch('/api/periode/aktif');
    if (!r.ok) { _periodeAktif = null; return null; }
    const d = await r.json();
    // API kini return array; ambil elemen pertama sebagai "utama" untuk kompatibilitas
    const list = d.periode || [];
    _periodeAktif = list.length ? list[0] : null;
    // Sync ke _periodeListTerbuka agar timer di topbar bisa membaca data periode
    if (typeof _periodeListTerbuka !== 'undefined') _periodeListTerbuka = list;
    return _periodeAktif;
  } catch {
    _periodeAktif = null;
    if (typeof _periodeListTerbuka !== 'undefined') _periodeListTerbuka = [];
    return null;
  }
}

function getPeriodeAktif() { return _periodeAktif; }

// Ambil semua periode yang window-nya sedang terbuka sekarang
async function getPeriodeTerbuka() {
  try {
    const r = await fetch('/api/periode/aktif');
    if (!r.ok) return [];
    const d = await r.json();
    return d.periode || [];
  } catch { return []; }
}

// Helper: apakah saat ini dalam window input yang dibuka?
// Toleransi 60 detik untuk mengatasi perbedaan jam kecil antara browser dan server.
function isPeriodeInputOpen(p) {
  if (!p) return false;
  const now   = Date.now();
  const SLACK = 60_000; // 60 detik toleransi clock skew
  const open  = p.open_at  ? new Date(p.open_at).getTime()  : null;
  const close = p.close_at ? new Date(p.close_at).getTime() : null;
  if (open  && now < open  - SLACK) return false;
  if (close && now > close + SLACK) return false;
  return true;
}

// Format datetime → tampilan singkat dalam WITA (UTC+8)
function _fmtDT(iso) {
  if (!iso) return '—';
  // Konversi ke WITA (UTC+8)
  const utcMs = new Date(iso).getTime();
  const witaMs = utcMs + (8 * 60 * 60 * 1000);
  const d = new Date(witaMs);
  const BULAN_S = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  const tgl = `${String(d.getUTCDate()).padStart(2,'0')} ${BULAN_S[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  const jam = `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')} WITA`;
  return `${tgl}, ${jam}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// HALAMAN KELOLA PERIODE (admin only)
// ═══════════════════════════════════════════════════════════════════════════
async function loadPeriodePage() {
  await loadPeriodeAktif();
  try {
    const r = await fetch('/api/periode', { headers: authHeaders() });
    const d = await r.json();
    _periodeList  = d.periode || [];
    _periodePage  = 1;
    _periodeSearch = '';
    _periodeFilterStatus = '';
    _periodeFilterTahun  = '';
    const searchEl = document.getElementById('periodeSearch');
    if (searchEl) searchEl.value = '';
    const statusEl = document.getElementById('periodeFilterStatus');
    if (statusEl) statusEl.value = '';
    // Populate tahun options
    _populatePeriodeTahunFilter();
    const tahunEl = document.getElementById('periodeFilterTahun');
    if (tahunEl) tahunEl.value = '';
    renderPeriodeTable();
  } catch {
    toast('Gagal memuat daftar periode', 'error');
  }
}

function _populatePeriodeTahunFilter() {
  const el = document.getElementById('periodeFilterTahun');
  if (!el) return;
  const tahunSet = [...new Set(_periodeList.map(p => p.tahun))].sort((a,b) => b - a);
  el.innerHTML = `<option value="">Semua Tahun</option>` +
    tahunSet.map(t => `<option value="${t}">${t}</option>`).join('');
}

function filterPeriode() {
  _periodeSearch       = document.getElementById('periodeSearch')?.value?.toLowerCase() || '';
  _periodeFilterStatus = document.getElementById('periodeFilterStatus')?.value || '';
  _periodeFilterTahun  = document.getElementById('periodeFilterTahun')?.value  || '';
  _periodePage         = 1;
  renderPeriodeTable();
}

function renderPeriodeTable() {
  const tb = document.getElementById('periodeTableBody');
  if (!tb) return;

  const filtered = _periodeList.filter(p => {
    // Filter teks
    if (_periodeSearch) {
      const label = `${BULAN_FULL_P[p.bulan]} ${p.tahun}`.toLowerCase();
      if (!label.includes(_periodeSearch) && !String(p.tahun).includes(_periodeSearch)) return false;
    }
    // Filter tahun
    if (_periodeFilterTahun && String(p.tahun) !== _periodeFilterTahun) return false;
    // Filter status
    if (_periodeFilterStatus) {
      const open  = isPeriodeInputOpen(p);
      const now   = Date.now();
      const close = p.close_at ? new Date(p.close_at).getTime() : null;
      const openT = p.open_at  ? new Date(p.open_at).getTime()  : null;
      if (_periodeFilterStatus === 'aktif'   && !open) return false;
      if (_periodeFilterStatus === 'ditutup' && !(close && now > close)) return false;
      if (_periodeFilterStatus === 'belum'   && !(openT && now < openT)) return false;
    }
    return true;
  });

  if (!filtered.length) {
    tb.innerHTML = '<tr class="empty-row"><td colspan="6">' +
      (_periodeSearch ? 'Tidak ada hasil pencarian.' : 'Belum ada periode. Klik "+ Tambah Periode".') +
      '</td></tr>';
    renderPagination('periodePagination', 0, 1, _periodePageSize, 'goPeriodePage');
    return;
  }


  filtered.sort((a, b) => a.tahun !== b.tahun ? a.tahun - b.tahun : a.bulan - b.bulan);

  const start = (_periodePage - 1) * _periodePageSize;
  const slice = filtered.slice(start, start + _periodePageSize);

  tb.innerHTML = slice.map(p => {
    const inputOpen = isPeriodeInputOpen(p);

    // Window info (tanpa badge) — 2 baris dengan dot warna, "WITA" nyambung ke jam
    let windowInfo = '—';
    if (p.open_at || p.close_at) {
      windowInfo = `
        <div style="display:flex;align-items:center;gap:6px">
          <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#10b981;flex-shrink:0"></span>
          <span>${_fmtDT(p.open_at)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:3px">
          <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#ef4444;flex-shrink:0"></span>
          <span>${_fmtDT(p.close_at)}</span>
        </div>
      `;
    }

    // Badge status — kolom terpisah, "Terbuka" → "Aktif"
    let statusBadge = '—';
    if (p.open_at || p.close_at) {
      if (inputOpen) {
        statusBadge = '<span class="badge badge-aktif" style="background:#D1FAE5;color:#065F46;border:1px solid #6EE7B7">Aktif</span>';
      } else {
        const now   = Date.now();
        const close = p.close_at ? new Date(p.close_at).getTime() : null;
        if (close && now > close) {
          statusBadge = '<span class="badge" style="background:#f9191920;color:#f91919;border:1px solid #f9191940">Ditutup</span>';
        } else {
          statusBadge = '<span class="badge" style="background:#f5a62320;color:#b45309;border:1px solid #f5a62340">Belum Buka</span>';
        }
      }
    }

    // Jenis badge
    const jenisBadge = p.jenis === 'monev'
      ? '<span style="background:#dbeafe;color:#1d4ed8;border-radius:5px;padding:2px 8px;font-size:.72rem;font-weight:700">IKU</span>'
      : p.jenis === 'ikk'
      ? '<span style="background:#ede9fe;color:#7c3aed;border-radius:5px;padding:2px 8px;font-size:.72rem;font-weight:700">IKK</span>'
      : p.jenis === 'spm'
      ? '<span style="background:#fef3c7;color:#b45309;border-radius:5px;padding:2px 8px;font-size:.72rem;font-weight:700">SPM</span>'
      : '<span style="color:#94a3b8;font-size:.72rem">—</span>';

    return `
      <tr>
        <td style="text-align:center;font-weight:700">${p.tahun}</td>
        <td style="text-align:center">${BULAN_FULL_P[p.bulan] || '—'}</td>
        <td style="text-align:center">${jenisBadge}</td>
        <td>
          <div style="font-size:.75rem;color:var(--teks);line-height:1.4">${windowInfo}</div>
        </td>
        <td style="text-align:center">${statusBadge}</td>
        <td style="text-align:center;white-space:nowrap">
          <button class="btn btn-ghost btn-sm" title="Edit" onclick="openPeriodeModal(${p.id})">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
            </svg>
          </button>
          <button class="btn btn-danger btn-sm" title="Hapus" onclick="deletePeriode(${p.id})">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 6l-1 14H6L5 6"/>
              <path stroke-linecap="round" stroke-linejoin="round" d="M10 11v6m4-6v6"/>
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 6V4h6v2"/>
            </svg>
          </button>
        </td>
      </tr>`;
  }).join('');

  renderPagination('periodePagination', filtered.length, _periodePage, _periodePageSize, 'goPeriodePage');
}

window.goPeriodePage = (p) => { _periodePage = p; renderPeriodeTable(); };

// Helper: ubah ISO string → format datetime-local (YYYY-MM-DDTHH:mm) dalam WITA (UTC+8)
// Harus konsisten dengan _fmtDT() yang juga pakai UTC+8 manual,
// dan konsisten dengan _cdtp.set() yang pakai getHours() (local time browser).
// Karena browser user berada di WITA (UTC+8), getHours() sudah menghasilkan WITA — tidak perlu offset manual.
function _isoToLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  // Gunakan local time browser (WITA) agar konsisten dengan _cdtp.set()
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOM DATETIME PICKER — inline, no dependency
// Dipasang ke elemen <div> pengganti input[type=datetime-local].
// Hidden input asli tetap diupdate agar savePeriode() tidak perlu diubah.
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  const PAD   = n => String(n).padStart(2, '0');
  const BULAN = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  const BULAN_FULL = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const DOW   = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];

  // Baca nilai dari hidden input → object {y,mo,d,h,mi} atau null
  function _parseHidden(hiddenEl) {
    const v = hiddenEl?.value; // YYYY-MM-DDTHH:mm
    if (!v) return null;
    const [date, time] = v.split('T');
    const [y, mo, d]   = date.split('-').map(Number);
    const [h, mi]      = (time || '00:00').split(':').map(Number);
    return { y, mo: mo - 1, d, h, mi }; // mo 0-indexed
  }

  // Tulis ke hidden input → format YYYY-MM-DDTHH:mm
  function _writeHidden(hiddenEl, s) {
    if (!s) { hiddenEl.value = ''; return; }
    hiddenEl.value = `${s.y}-${PAD(s.mo+1)}-${PAD(s.d)}T${PAD(s.h)}:${PAD(s.mi)}`;
  }

  // Format tampilan di trigger button
  function _fmtDisplay(s) {
    if (!s) return null;
    return `${PAD(s.d)} ${BULAN[s.mo]} ${s.y},  ${PAD(s.h)}:${PAD(s.mi)}`;
  }

  function buildPicker(mountEl, hiddenEl, label) {
    // State
    let sel   = _parseHidden(hiddenEl); // currently selected dt {y,mo,d,h,mi}
    let view  = sel ? { y: sel.y, mo: sel.mo } : { y: new Date().getFullYear(), mo: new Date().getMonth() };
    let mode  = 'cal'; // 'cal' | 'month' | 'year'
    let open  = false;

    // ── DOM skeleton ──────────────────────────────────────────────────────
    mountEl.innerHTML = `
      <button type="button" class="cdtp-trigger" id="${hiddenEl.id}_trigger">
        <svg class="cdtp-trigger-icon" xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <span class="cdtp-trigger-text placeholder" id="${hiddenEl.id}_txt">${label}</span>
      </button>
      <div class="cdtp-panel" id="${hiddenEl.id}_panel" style="display:none"></div>
    `;

    const trigger  = mountEl.querySelector('.cdtp-trigger');
    const panel    = mountEl.querySelector('.cdtp-panel');
    const trigTxt  = mountEl.querySelector('.cdtp-trigger-text');

    function updateTrigger() {
      if (sel) {
        trigTxt.textContent = _fmtDisplay(sel);
        trigTxt.classList.remove('placeholder');
      } else {
        trigTxt.textContent = label;
        trigTxt.classList.add('placeholder');
      }
    }

    // ── Render panel ──────────────────────────────────────────────────────
    function render() {
      if (mode === 'month') { renderMonthGrid(); return; }
      if (mode === 'year')  { renderYearGrid();  return; }
      renderCal();
    }

    function renderCal() {
      const today = new Date();
      const firstDay = new Date(view.y, view.mo, 1).getDay(); // 0=Sun
      const daysInMonth = new Date(view.y, view.mo + 1, 0).getDate();
      const daysInPrev  = new Date(view.y, view.mo, 0).getDate();

      let cells = '';
      // cells sebelumnya
      for (let i = firstDay - 1; i >= 0; i--) {
        cells += `<button class="cdtp-day cdtp-day-other" disabled>${daysInPrev - i}</button>`;
      }
      // cells bulan ini
      for (let d = 1; d <= daysInMonth; d++) {
        const isToday    = (d === today.getDate() && view.mo === today.getMonth() && view.y === today.getFullYear());
        const isSelected = sel && (d === sel.d && view.mo === sel.mo && view.y === sel.y);
        let cls = 'cdtp-day';
        if (isToday)    cls += ' cdtp-day-today';
        if (isSelected) cls += ' cdtp-day-selected';
        cells += `<button type="button" class="${cls}" data-d="${d}">${d}</button>`;
      }
      // cells berikutnya
      const total = firstDay + daysInMonth;
      const trail = total % 7 === 0 ? 0 : 7 - (total % 7);
      for (let i = 1; i <= trail; i++) {
        cells += `<button class="cdtp-day cdtp-day-other" disabled>${i}</button>`;
      }

      // time
      const h  = sel ? sel.h  : 0;
      const mi = sel ? sel.mi : 0;

      panel.innerHTML = `
        <div class="cdtp-header">
          <button type="button" class="cdtp-nav-btn" data-nav="-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
          </button>
          <span class="cdtp-header-label" data-mode="month">${BULAN_FULL[view.mo]}</span>
          <span class="cdtp-header-label" data-mode="year">${view.y}</span>
          <button type="button" class="cdtp-nav-btn" data-nav="+1">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
          </button>
        </div>
        <div class="cdtp-cal">
          <div class="cdtp-dow">${DOW.map(d => `<div class="cdtp-dow-cell">${d}</div>`).join('')}</div>
          <div class="cdtp-days">${cells}</div>
        </div>
        <div class="cdtp-divider"></div>
        <div class="cdtp-time">
          <svg class="cdtp-trigger-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="color:var(--teks-muted);flex-shrink:0"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <div class="cdtp-time-col">
            <div class="cdtp-time-spin">
              <button type="button" class="cdtp-spin-btn" data-spin="h" data-dir="+1">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7"/></svg>
              </button>
              <input type="number" class="cdtp-time-val" data-time="h" value="${PAD(h)}" min="0" max="23">
              <button type="button" class="cdtp-spin-btn" data-spin="h" data-dir="-1">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>
              </button>
            </div>
          </div>
          <span class="cdtp-time-sep">:</span>
          <div class="cdtp-time-col">
            <div class="cdtp-time-spin">
              <button type="button" class="cdtp-spin-btn" data-spin="mi" data-dir="+1">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7"/></svg>
              </button>
              <input type="number" class="cdtp-time-val" data-time="mi" value="${PAD(mi)}" min="0" max="59">
              <button type="button" class="cdtp-spin-btn" data-spin="mi" data-dir="-1">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>
              </button>
            </div>
          </div>
        </div>
        <div class="cdtp-footer">
          <button type="button" class="cdtp-btn-clear">Hapus</button>
          <button type="button" class="cdtp-btn-now">Sekarang</button>
          <button type="button" class="cdtp-btn-ok">Pilih</button>
        </div>
      `;
      bindCalEvents();
    }

    function renderMonthGrid() {
      panel.innerHTML = `
        <div class="cdtp-header">
          <button type="button" class="cdtp-nav-btn" data-nav="-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
          </button>
          <span class="cdtp-header-label" data-mode="year">${view.y}</span>
          <button type="button" class="cdtp-nav-btn" data-nav="+1">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
          </button>
        </div>
        <div class="cdtp-ym-grid">
          ${BULAN_FULL.map((m, i) => {
            const isCur = (i === new Date().getMonth() && view.y === new Date().getFullYear());
            const isSel = sel && (i === sel.mo && view.y === sel.y);
            return `<button type="button" class="cdtp-ym-cell${isSel ? ' selected' : isCur ? ' current' : ''}" data-mo="${i}">${m}</button>`;
          }).join('')}
        </div>
      `;
      bindYMEvents();
    }

    function renderYearGrid() {
      const base = Math.floor(view.y / 12) * 12;
      const years = Array.from({ length: 16 }, (_, i) => base + i - 2);
      panel.innerHTML = `
        <div class="cdtp-header">
          <button type="button" class="cdtp-nav-btn" data-nav="-12">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
          </button>
          <span class="cdtp-header-label">${years[2]}–${years[years.length-1]}</span>
          <button type="button" class="cdtp-nav-btn" data-nav="+12">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
          </button>
        </div>
        <div class="cdtp-ym-grid">
          ${years.map(y => {
            const isCur = (y === new Date().getFullYear());
            const isSel = sel && (y === sel.y);
            const isOut = y < years[2] || y > years[years.length-1];
            return `<button type="button" class="cdtp-ym-cell${isSel ? ' selected' : isCur ? ' current' : ''}${isOut ? ' cdtp-day-other' : ''}" data-yr="${y}">${y}</button>`;
          }).join('')}
        </div>
      `;
      bindYMEvents();
    }

    // ── Event binding ──────────────────────────────────────────────────────
    function bindCalEvents() {
      // nav bulan
      panel.querySelectorAll('[data-nav]').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const delta = parseInt(btn.dataset.nav);
          if (mode === 'year') { view.y += delta; }
          else { view.mo += delta; if (view.mo > 11) { view.mo = 0; view.y++; } if (view.mo < 0) { view.mo = 11; view.y--; } }
          render();
        });
      });
      // mode switch
      panel.querySelectorAll('[data-mode]').forEach(el => {
        el.addEventListener('click', e => { e.stopPropagation(); mode = el.dataset.mode; render(); });
      });
      // pilih hari
      panel.querySelectorAll('[data-d]').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const d = parseInt(btn.dataset.d);
          const hEl  = panel.querySelector('[data-time="h"]');
          const miEl = panel.querySelector('[data-time="mi"]');
          const h  = hEl  ? (parseInt(hEl.value)  || 0) : (sel?.h  ?? 0);
          const mi = miEl ? (parseInt(miEl.value) || 0) : (sel?.mi ?? 0);
          sel = { y: view.y, mo: view.mo, d, h, mi };
          render(); // re-render dengan hari terpilih
        });
      });
      // spin jam/menit
      panel.querySelectorAll('[data-spin]').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const field = btn.dataset.spin;
          const dir   = parseInt(btn.dataset.dir);
          const inp   = panel.querySelector(`[data-time="${field}"]`);
          if (!inp) return;
          let v = (parseInt(inp.value) || 0) + dir;
          if (field === 'h')  v = ((v % 24) + 24) % 24;
          if (field === 'mi') v = ((v % 60) + 60) % 60;
          inp.value = PAD(v);
          if (sel) sel[field] = v;
        });
      });
      // ketik langsung jam/menit
      panel.querySelectorAll('[data-time]').forEach(inp => {
        inp.addEventListener('input', e => {
          e.stopPropagation();
          const field = inp.dataset.time;
          let v = parseInt(inp.value) || 0;
          if (field === 'h')  v = Math.min(23, Math.max(0, v));
          if (field === 'mi') v = Math.min(59, Math.max(0, v));
          inp.value = PAD(v);
          if (sel) sel[field] = v;
        });
        inp.addEventListener('blur', () => {
          const v = parseInt(inp.value) || 0;
          inp.value = PAD(v);
          if (sel) sel[inp.dataset.time] = v;
        });
        inp.addEventListener('click', e => e.stopPropagation());
      });
      // Hapus
      panel.querySelector('.cdtp-btn-clear')?.addEventListener('click', e => {
        e.stopPropagation();
        sel = null;
        _writeHidden(hiddenEl, null);
        updateTrigger();
        closePanel();
        hiddenEl.dispatchEvent(new Event('change', { bubbles: true }));
      });
      // Sekarang
      panel.querySelector('.cdtp-btn-now')?.addEventListener('click', e => {
        e.stopPropagation();
        const now = new Date();
        sel = { y: now.getFullYear(), mo: now.getMonth(), d: now.getDate(), h: now.getHours(), mi: now.getMinutes() };
        view = { y: sel.y, mo: sel.mo };
        render();
      });
      // Pilih / OK
      panel.querySelector('.cdtp-btn-ok')?.addEventListener('click', e => {
        e.stopPropagation();
        if (!sel) { closePanel(); return; }
        // ambil nilai jam/menit terkini dari input (mungkin diketik manual)
        const hEl  = panel.querySelector('[data-time="h"]');
        const miEl = panel.querySelector('[data-time="mi"]');
        if (hEl)  sel.h  = Math.min(23, Math.max(0, parseInt(hEl.value)  || 0));
        if (miEl) sel.mi = Math.min(59, Math.max(0, parseInt(miEl.value) || 0));
        _writeHidden(hiddenEl, sel);
        updateTrigger();
        closePanel();
        hiddenEl.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }

    function bindYMEvents() {
      panel.querySelectorAll('[data-nav]').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const delta = parseInt(btn.dataset.nav);
          if (mode === 'year') view.y += delta;
          else view.y += delta;
          render();
        });
      });
      panel.querySelectorAll('[data-mo]').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          view.mo = parseInt(btn.dataset.mo);
          mode = 'cal';
          render();
        });
      });
      panel.querySelectorAll('[data-yr]').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          view.y = parseInt(btn.dataset.yr);
          mode = 'month';
          render();
        });
      });
      panel.querySelectorAll('[data-mode]').forEach(el => {
        el.addEventListener('click', e => { e.stopPropagation(); mode = el.dataset.mode; render(); });
      });
    }

    // ── Open / close ──────────────────────────────────────────────────────
    function openPanel() {
      // tutup picker lain yang mungkin terbuka
      document.querySelectorAll('.cdtp-panel').forEach(p => {
        if (p !== panel) p.style.display = 'none';
      });
      document.querySelectorAll('.cdtp-trigger').forEach(t => {
        if (t !== trigger) t.classList.remove('open');
      });
      mode = 'cal';
      // sync state dari hidden input (mungkin di-set dari luar)
      sel  = _parseHidden(hiddenEl);
      if (sel) view = { y: sel.y, mo: sel.mo };
      render();
      panel.style.display = 'block';
      trigger.classList.add('open');
      open = true;
    }
    function closePanel() {
      panel.style.display = 'none';
      trigger.classList.remove('open');
      open = false;
    }

    trigger.addEventListener('click', e => {
      e.stopPropagation();
      open ? closePanel() : openPanel();
    });
    panel.addEventListener('click', e => e.stopPropagation());

    // Expose: reset picker dari luar (dipanggil saat modal dibuka)
    mountEl._cdtp = {
      set(isoStr) {
        sel  = isoStr ? (() => { const d = new Date(isoStr); return { y: d.getFullYear(), mo: d.getMonth(), d: d.getDate(), h: d.getHours(), mi: d.getMinutes() }; })() : null;
        if (sel) view = { y: sel.y, mo: sel.mo };
        updateTrigger();
      },
      clear() { sel = null; updateTrigger(); },
      // Commit nilai sel saat ini ke hidden input (tanpa perlu klik "Pilih")
      commit() {
        if (!sel) return;
        const hEl  = panel.querySelector('[data-time="h"]');
        const miEl = panel.querySelector('[data-time="mi"]');
        if (hEl)  sel.h  = Math.min(23, Math.max(0, parseInt(hEl.value)  || 0));
        if (miEl) sel.mi = Math.min(59, Math.max(0, parseInt(miEl.value) || 0));
        _writeHidden(hiddenEl, sel);
        updateTrigger();
        closePanel();
      }
    };

    updateTrigger();
  }

  // ── Init semua mount point yang sudah ada di DOM ──────────────────────
  window.initCdtp = function () {
    document.querySelectorAll('[data-cdtp]').forEach(mount => {
      if (mount._cdtp) return; // sudah di-init
      const targetId = mount.dataset.cdtp;
      const hidden   = document.getElementById(targetId);
      const label    = mount.dataset.placeholder || 'Pilih tanggal & waktu...';
      if (!hidden) return;
      buildPicker(mount, hidden, label);
    });
  };
})();

// ── Tutup semua picker saat klik di luar ──────────────────────────────────
document.addEventListener('click', () => {
  document.querySelectorAll('.cdtp-panel').forEach(p => p.style.display = 'none');
  document.querySelectorAll('.cdtp-trigger').forEach(t => t.classList.remove('open'));
});

function openPeriodeModal(id) {
  const p = id ? _periodeList.find(x => x.id === id) : null;

  document.getElementById('periodeId').value    = p?.id || '';
  document.getElementById('periodeTahun').value = p?.tahun || new Date().getFullYear();

  // Set bulan lalu sync tampilan custom select (.select-wrap)
  const _bulanEl = document.getElementById('periodeBulan');
  _bulanEl.value = p?.bulan || (new Date().getMonth() + 1);
  if (typeof syncCustomSelect === 'function') syncCustomSelect('periodeBulan');

  // Set jenis
  const _jenisEl = document.getElementById('periodeJenis');
  _jenisEl.value = p?.jenis || 'monev';
  if (typeof syncCustomSelect === 'function') syncCustomSelect('periodeJenis');

  // Set nilai hidden input terlebih dahulu
  document.getElementById('periodeOpenAt').value  = _isoToLocal(p?.open_at);
  document.getElementById('periodeCloseAt').value = _isoToLocal(p?.close_at);

  document.getElementById('modalPeriodeTitle').textContent = p ? 'Edit Periode' : 'Tambah Periode';

  openModal('modalPeriode');

  // Init picker (pertama kali) lalu sync nilai
  setTimeout(() => {
    initCdtp();
    const mOpen  = document.getElementById('cdtp_open');
    const mClose = document.getElementById('cdtp_close');
    if (mOpen?._cdtp)  mOpen._cdtp.set(p?.open_at  || null);
    if (mClose?._cdtp) mClose._cdtp.set(p?.close_at || null);
  }, 30);
}

async function savePeriode() {
  // Auto-commit picker yang masih terbuka (user belum klik "Pilih")
  const mOpen  = document.getElementById('cdtp_open');
  const mClose = document.getElementById('cdtp_close');
  if (mOpen?._cdtp?.commit)  mOpen._cdtp.commit();
  if (mClose?._cdtp?.commit) mClose._cdtp.commit();

  const id      = document.getElementById('periodeId').value;
  const tahun   = parseInt(document.getElementById('periodeTahun').value);
  const bulan   = parseInt(document.getElementById('periodeBulan').value);
  const jenis   = document.getElementById('periodeJenis').value;
  const openAt  = document.getElementById('periodeOpenAt').value;   // YYYY-MM-DDTHH:mm
  const closeAt = document.getElementById('periodeCloseAt').value;

  if (!tahun || !bulan) { toast('Tahun dan bulan wajib diisi', 'error'); return; }
  if (!jenis)           { toast('Jenis periode wajib dipilih', 'error'); return; }
  if (!openAt)          { toast('Tanggal/jam dibuka wajib diisi', 'error'); return; }
  if (!closeAt)         { toast('Tanggal/jam ditutup wajib diisi', 'error'); return; }
  if (new Date(openAt) >= new Date(closeAt)) {
    toast('Waktu tutup harus setelah waktu buka', 'error'); return;
  }

  // Jika 'all', buat tiga periode sekaligus (monev + ikk + spm) — hanya untuk mode tambah baru
  // Mode edit (id ada) tidak mendukung 'all' karena periode existing punya jenis spesifik
  const jenisList = (jenis === 'all' && !id) ? ['monev', 'ikk', 'spm'] : [jenis === 'all' ? 'monev' : jenis];

  try {
    for (const j of jenisList) {
      const body = {
        tahun,
        bulan,
        jenis: j,
        open_at:  new Date(openAt).toISOString(),
        close_at: new Date(closeAt).toISOString(),
      };
      const r = await fetch(id ? `/api/periode/${id}` : '/api/periode', {
        method:  id ? 'PUT' : 'POST',
        headers: authHeaders(),
        body:    JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) { toast(d.error || 'Gagal menyimpan', 'error'); return; }
    }
    toast(
      jenisList.length > 1
        ? 'Tiga periode (IKU + IKK + SPM) berhasil ditambahkan'
        : (id ? 'Periode diperbarui' : 'Periode ditambahkan')
    );
    closeModal('modalPeriode');
    loadPeriodePage();
  } catch { toast('Gagal menyimpan periode', 'error'); }
}

async function deletePeriode(id) {
  const p  = _periodeList.find(x => x.id === id);
  const jenisLabel = p?.jenis === 'monev' ? 'IKU' : p?.jenis === 'ikk' ? 'IKK' : p?.jenis === 'spm' ? 'SPM' : '';
  const ok = await showConfirm({
    title:  'Hapus Periode',
    msg:    `Periode "<b>${esc(`${BULAN_FULL_P[p?.bulan] || ''} ${p?.tahun || ''}${jenisLabel ? ' — ' + jenisLabel : ''}`.trim())}</b>" akan dihapus permanen. Data realisasi kinerja yang terkait periode ini tidak ikut terhapus.`,
    okText: 'Ya, Hapus',
    icon:   'trash',
  });
  if (!ok) return;

  const r = await fetch(`/api/periode/${id}`, { method: 'DELETE', headers: authHeaders() });
  const d = await r.json();
  if (!r.ok) { toast(d.error || 'Gagal menghapus', 'error'); return; }
  toast('Periode berhasil dihapus');
  loadPeriodePage();
}