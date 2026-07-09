// ── Helper ───────────────────────────────────────────────────────────────
function normTarget(r) {
  if (r.target_tahun != null) r.target_tahun = parseFloat(r.target_tahun);
  if (r.target_display == null && r.target_tahun != null) r.target_display = null;
  r.bermakna_negatif = r.bermakna_negatif === true || r.bermakna_negatif === 'true';
  // Parse jenis_custom: Neon JSONB bisa datang sebagai string
  if (typeof r.jenis_custom === 'string') {
    try { r.jenis_custom = JSON.parse(r.jenis_custom); } catch { r.jenis_custom = []; }
  }
  if (!Array.isArray(r.jenis_custom)) r.jenis_custom = [];
  return r;
}

// State target per tahun untuk modal indikator
let _targetRows = []; // [{id?, tahun, target, target_display}]
let _targetMap  = {}; // {indikator_id: [{tahun, target, target_display}]}

// ═══════════════════════════════════════════════════════════════════════════
// KINERJA — state
// ═══════════════════════════════════════════════════════════════════════════
let _kinerja_bulan  = new Date().getMonth() + 1;   // 1–12
let _kinerja_tahun  = new Date().getFullYear();
let _kinerjaData    = [];
let _indikatorList  = [];
let _groupList      = [];
let _bidangListKinerja = [];   // cache bidang untuk dropdown PJ indikator
let _editingIndikatorId = null;
let _editingGroupId     = null;

// ── IKK state ────────────────────────────────────────────────────────────
let _ikk_bulan  = new Date().getMonth() + 1;   // 1–12
let _ikk_tahun = new Date().getFullYear();
let _ikkData   = [];

// ── SPM state ────────────────────────────────────────────────────────────
let _spm_bulan  = new Date().getMonth() + 1;   // 1–12
let _spm_tahun  = new Date().getFullYear();
let _spmData    = [];

// ── Pagination & search — Indikator Admin ────────────────────────────────
let _indikatorPage      = 1;
const _indikatorPageSize = 15;
let _indikatorSearch    = '';
let _indikatorFilterJenis = '';   // '', 'monev', 'ikk', 'none'
let _indikatorFilterMakna = '';   // '', 'positif', 'negatif'
let _indikatorFilterPJ    = '';   // '' atau nama PJ
let _indikatorFilterTahun = '';   // '' atau tahun (string)

// ── Pagination & search — Group Admin ───────────────────────────────────
let _groupPage      = 1;
const _groupPageSize = 15;
let _groupSearch    = '';

// ── Jenis label & style ──────────────────────────────────────────────────
const JENIS_META = {
  tujuan:   { label: 'Tujuan',            cls: 'group-tujuan'   },
  sasaran:  { label: 'Sasaran Strategis', cls: 'group-sasaran'  },
  program:  { label: 'Program',           cls: 'group-program'  },
  kegiatan: { label: 'Kegiatan',          cls: 'group-kegiatan' },
};

// ── Jenis Kinerja — state dinamis ────────────────────────────────────────
// Diisi dari API /api/kinerja/jenis-kinerja saat loadIndikatorAdmin
let _jenisList = [];  // [{id, kode, label, warna_bg, warna_teks, urutan, aktif, is_builtin}]
let _editingJenisId = null;

// Helper: render badge jenis untuk satu row indikator
function _renderJenisBadges(row) {
  const badges = [];
  for (const j of _jenisList) {
    if (!j.aktif) continue;
    let aktif = false;
    if (j.kode === 'iku') aktif = !!row.jenis_monev;
    else if (j.kode === 'ikk') aktif = !!row.jenis_ikk;
    else if (j.kode === 'spm') aktif = !!row.jenis_spm;
    else aktif = Array.isArray(row.jenis_custom) && row.jenis_custom.includes(j.kode);
    if (aktif) {
      badges.push(`<span style="display:inline-flex;align-items:center;font-size:.7rem;font-weight:700;color:${j.warna_teks};background:${j.warna_bg};padding:2px 7px;border-radius:5px;margin-right:3px">${escHtml(j.label)}</span>`);
    }
  }
  return badges.length ? badges.join('') : '<span style="color:var(--teks-muted);font-size:.75rem">—</span>';
}

// Helper: apakah row punya setidaknya satu jenis aktif
function _rowHasJenis(row, kode) {
  if (kode === 'iku') return !!row.jenis_monev;
  if (kode === 'ikk')   return !!row.jenis_ikk;
  if (kode === 'spm')   return !!row.jenis_spm;
  return Array.isArray(row.jenis_custom) && row.jenis_custom.includes(kode);
}

// ── Cek apakah window input untuk bulan tertentu sedang terbuka (non-admin) ──
// Jika bulan tidak diberikan, cek bulan yang sedang dipilih (_kinerja_bulan)
function _isKinerjaInputOpen(bulan, jenis) {
  // Admin selalu bisa input kapan saja
  if (_user?.is_admin) return true;
  const targetBulan = bulan != null ? bulan : jenis === 'spm' ? _spm_bulan : jenis === 'ikk' ? _ikk_bulan : _kinerja_bulan;
  // Cari periode yang cocok bulan DAN jenis-nya
  return _periodeListTerbuka.some(p =>
    p.bulan === targetBulan &&
    (jenis ? p.jenis === jenis : true) &&
    isPeriodeInputOpen(p)
  );
}
// Helper shorthand per jenis
function _isMonevInputOpen(bulan) { return _isKinerjaInputOpen(bulan, 'monev'); }
function _isIkkInputOpen(bulan)   { return _isKinerjaInputOpen(bulan, 'ikk');   }

// Cache daftar periode yang sedang terbuka (diisi oleh loadPeriodeAktif)
let _periodeListTerbuka = [];
let _allPeriodeList     = [];  // semua periode dari DB (untuk admin year selector)
let _userIndikatorIds   = null; // Set<number> assigned indikator untuk non-admin, null = belum load

// Load assigned indikator IDs untuk user non-admin (idempotent — skip jika sudah di-load)
async function _ensureUserIndikatorIds() {
  if (_user?.is_admin) return;                 // admin tidak perlu filter
  if (_userIndikatorIds !== null) return;      // sudah di-load sebelumnya
  if (!_user?.id) { _userIndikatorIds = new Set(); return; }
  try {
    const r = await fetch(`/api/users/${_user.id}/indikator`, { headers: authHeaders() });
    const d = await r.json();
    _userIndikatorIds = new Set((d.indikator_ids || []).map(Number));
  } catch { _userIndikatorIds = new Set(); }
}

function _renderKinerjaWindowBanner(containerId, jenis) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;

  // Admin → tidak tampilkan banner
  if (_user?.is_admin) { wrap.innerHTML = ''; return; }

  const fmtDT = iso => iso ? new Date(iso).toLocaleString('id-ID', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';

  // Cari periode untuk bulan yang sedang dipilih, filter by jenis
  const targetBulan = jenis === 'ikk' ? _ikk_bulan : jenis === 'spm' ? _spm_bulan : _kinerja_bulan;
  const pa = _periodeListTerbuka.find(p => p.bulan === targetBulan && (!jenis || p.jenis === jenis)) ?? null;
  // Apakah sama sekali tidak ada periode terbuka untuk jenis ini?
  const adaPeriodeJenis = _periodeListTerbuka.some(p => !jenis || p.jenis === jenis);

  if (!pa && !adaPeriodeJenis) {
    wrap.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:8px;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;font-size:.83rem;margin-bottom:10px">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
        <span>Tidak ada periode input yang sedang terbuka. Hubungi Admin untuk mengatur window periode.</span>
      </div>`;
    return;
  }

  if (!pa) {
    // Ada periode terbuka tapi bukan untuk bulan ini
    wrap.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:8px;background:#fffbeb;border:1px solid #fde68a;color:#92400e;font-size:.83rem;margin-bottom:10px">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        <span>Bulan ini belum ada window input yang terbuka. Pilih bulan lain yang tersedia.</span>
      </div>`;
    return;
  }

  wrap.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:8px;background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;font-size:.83rem;margin-bottom:10px">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
      <span>Input <strong>terbuka</strong> — batas pengisian hingga <strong>${fmtDT(pa.close_at)}</strong></span>
    </div>`;
}

// ── Countdown timer sisa waktu periode input ─────────────────────────────
let _kinerjaCountdownTimer = null;
const _kinerjaCountdownTimers = {};

function _renderKinerjaCountdown(containerId, jenis) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;

  // Admin → sembunyikan
  if (_user?.is_admin) { wrap.style.display = 'none'; wrap.innerHTML = ''; return; }

  // Cari periode aktif untuk bulan yg dipilih, filter by jenis
  const targetBulan = jenis === 'ikk' ? _ikk_bulan : jenis === 'spm' ? _spm_bulan : _kinerja_bulan;
  const pa = _periodeListTerbuka.find(p => p.bulan === targetBulan && (!jenis || p.jenis === jenis)) ?? null;

  // Jika tidak ada periode aktif untuk bulan ini, sembunyikan
  if (!pa || !pa.close_at) { wrap.style.display = 'none'; wrap.innerHTML = ''; return; }

  const closeMs = new Date(pa.close_at).getTime();

  function _tick() {
    const now  = Date.now();
    const diff = closeMs - now;

    if (diff <= 0) {
      // Waktu habis
      wrap.style.display = 'flex';
      wrap.style.marginTop = '8px';
      wrap.style.marginBottom = '8px';
      wrap.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-radius:10px;
                    background:#fff1f2;border:1px solid #fecdd3;color:#be123c;font-size:.72rem;font-weight:600;width:100%;box-sizing:border-box">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>Waktu input telah <strong>ditutup</strong>. Periode ini tidak bisa diisi lagi.</span>
        </div>`;
      clearInterval(_kinerjaCountdownTimers[containerId]);
      _kinerjaCountdownTimers[containerId] = null;
      // Hapus periode ini dari list terbuka → button bulan langsung disabled
      _periodeListTerbuka = _periodeListTerbuka.filter(p => p.bulan !== _kinerja_bulan);
      _syncBulanButtons();
      _renderPeriodeInfo();
      return;
    }

    const hari  = Math.floor(diff / 86400000);
    const jam   = Math.floor((diff % 86400000) / 3600000);
    const menit = Math.floor((diff % 3600000) / 60000);
    const detik = Math.floor((diff % 60000) / 1000);

    // Tentukan warna berdasarkan sisa waktu
    let bg, border, fg, urgency = '';
    if (diff < 3600000) {           // < 1 jam → merah
      bg = '#fff1f2'; border = '#fecdd3'; fg = '#be123c'; urgency = ' <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="#be123c" style="vertical-align:-1px"><circle cx="12" cy="12" r="10"/></svg>';
    } else if (diff < 86400000) {   // < 1 hari → oranye
      bg = '#fff7ed'; border = '#fed7aa'; fg = '#9a3412'; urgency = ' <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="#f97316" style="vertical-align:-1px"><circle cx="12" cy="12" r="10"/></svg>';
    } else {                        // > 1 hari → hijau
      bg = '#f0fdf4'; border = '#bbf7d0'; fg = '#166534';
    }

    const pad = n => String(n).padStart(2, '0');
    const sisaStr = hari > 0
      ? `${hari} Hari ${pad(jam)} Jam ${pad(menit)} Menit ${pad(detik)} Detik`
      : `${pad(jam)} Jam ${pad(menit)} Menit ${pad(detik)} Detik`;

    wrap.style.display = 'flex';
    wrap.style.marginTop = '8px';
    wrap.style.marginBottom = '8px';
    wrap.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-radius:10px;
                  background:${bg};border:1px solid ${border};color:${fg};font-size:.72rem;font-weight:500;
                  width:100%;box-sizing:border-box;flex-wrap:wrap;gap:8px">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="flex-shrink:0">
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
        <span style="flex:1;min-width:0">
          Batas pengisian periode ini:
          <strong style="letter-spacing:.3px"> ${sisaStr} lagi${urgency}</strong>
        </span>
        <span style="opacity:.7;white-space:nowrap">
          Tutup: ${new Date(pa.close_at).toLocaleString('id-ID',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})} WITA
        </span>
      </div>`;
  }

  // Clear timer sebelumnya jika ada (per container)
  if (_kinerjaCountdownTimers[containerId]) clearInterval(_kinerjaCountdownTimers[containerId]);
  _tick();
  _kinerjaCountdownTimers[containerId] = setInterval(_tick, 1000);
}

// ── Year selector — diisi dari daftar periode di DB ──────────────────────
async function initKinerjaControls() {
  // Ambil semua periode yang window-nya terbuka sekarang
  try {
    const r = await fetch('/api/periode/aktif');
    if (r.ok) {
      const d = await r.json();
      _periodeListTerbuka = d.periode || [];
    }
  } catch { _periodeListTerbuka = []; }

  // Non-admin: load assigned indikator IDs
  await _ensureUserIndikatorIds();

  // Admin: fetch semua periode untuk year selector
  if (_user?.is_admin) {
    try {
      const r = await fetch('/api/periode', { headers: authHeaders() });
      if (r.ok) {
        const d = await r.json();
        _allPeriodeList = d.periode || [];
      }
    } catch { _allPeriodeList = []; }
    _populateTahunSelector('kinerjaTahunSelect', _kinerja_tahun, setKinerjaTahun);
  }

  // Jika ada periode monev terbuka, set tahun & bulan dari periode monev (terlama dulu)
  const _monevTerbuka = _periodeListTerbuka.filter(p => p.jenis === 'monev')
    .sort((a, b) => a.tahun !== b.tahun ? a.tahun - b.tahun : a.bulan - b.bulan);
  if (_monevTerbuka.length) {
    _kinerja_tahun = _monevTerbuka[0].tahun;
    _kinerja_bulan = _monevTerbuka[0].bulan;
    _periodeAktif  = _monevTerbuka[0]; // kompatibilitas
  } else if (_user?.is_admin) {
    // Admin: pakai tahun & bulan sekarang sebagai default
    _kinerja_tahun = new Date().getFullYear();
    _kinerja_bulan = new Date().getMonth() + 1;
  }

  // Sync tahun selector ke nilai aktif
  const kSel = document.getElementById('kinerjaTahunSelect');
  if (kSel) kSel.value = _kinerja_tahun;

  _syncBulanButtons();
  _renderPeriodeInfo();
  _renderKinerjaCountdown('kinerjaCountdownBar', 'monev');
  _renderKinerjaCountdown('ikkCountdownBar', 'ikk');
  // Refresh timer di topbar dengan data terbaru
  if (typeof _startPeriodeTimer === 'function') _startPeriodeTimer();
}

// Populate tahun dropdown dari _allPeriodeList
function _populateTahunSelector(elId, currentTahun, onChangeFn) {
  const sel = document.getElementById(elId);
  if (!sel) return;
  const tahunList = [...new Set(_allPeriodeList.map(p => p.tahun))].sort((a, b) => a - b);
  // Fallback: jika tidak ada periode di DB, pakai tahun sekarang
  const list = tahunList.length ? tahunList : [new Date().getFullYear()];
  sel.innerHTML = list.map(t =>
    `<option value="${t}" ${t === currentTahun ? 'selected' : ''}>${t}</option>`
  ).join('');
  // Tampilkan wrapper container (div#kinerjaTahunWrap / div#ikkTahunWrap)
  const wrap = sel.closest('.select-wrap');
  const outerWrap = wrap ? wrap.parentElement : null;
  if (outerWrap && (outerWrap.id === 'kinerjaTahunWrap' || outerWrap.id === 'ikkTahunWrap')) {
    outerWrap.style.display = 'flex';
  } else if (wrap) {
    wrap.style.display = '';
  }
  sel.onchange = () => onChangeFn(parseInt(sel.value));
  // Sync custom select jika sudah diinit
  if (typeof syncCustomSelect === 'function') syncCustomSelect(elId);
}

function setKinerjaTahun(tahun) {
  _kinerja_tahun = tahun;
  _kinerja_bulan = 1;
  _syncBulanButtons();
  _renderPeriodeInfo();
  loadKinerjaRekap();
}

function setIkkTahun(tahun) {
  _ikk_tahun = tahun;
  _ikk_bulan = 1;
  _syncIkkBulanButtons();
  _renderIkkPeriodeInfo();
  loadIkkRekap();
}

// Label bulan Indonesia
const BULAN_LABEL = ['','Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
const BULAN_FULL  = ['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

function _syncBulanButtons() {
  // Kumpulkan semua bulan yang periodenya sedang terbuka (bisa lebih dari 1)
  const bulanTerbuka = new Set(_periodeListTerbuka.filter(p => p.jenis === 'monev').map(p => p.bulan));
  // Admin: bulan yang ada di tahun yang dipilih (dari semua periode)
  const bulanAdaDiTahun = new Set(_allPeriodeList.filter(p => p.tahun === _kinerja_tahun).map(p => p.bulan));
  document.querySelectorAll('#bulanSelector .bulan-btn').forEach(b => {
    const bulan = parseInt(b.dataset.bulan);
    let isTampil, isEnabled;
    if (_user?.is_admin) {
      // Admin: tampilkan dan aktifkan semua 12 bulan tanpa pembatasan
      isTampil  = true;
      isEnabled = true;
    } else {
      isTampil  = bulanTerbuka.has(bulan);
      isEnabled = true;
    }
    b.style.display  = isTampil ? '' : 'none';
    b.disabled       = !isEnabled;
    b.style.opacity  = isEnabled ? '' : '0.4';
    b.style.cursor   = isEnabled ? '' : 'not-allowed';
    b.classList.toggle('active', bulan === _kinerja_bulan);
    b.title = '';
    // Tampilkan label "NamaBulan Tahun" sesuai periode yang cocok
    const periodeMatch = _user?.is_admin
      ? _allPeriodeList.find(p => p.jenis === 'monev' && p.bulan === bulan && p.tahun === _kinerja_tahun)
      : _periodeListTerbuka.find(p => p.jenis === 'monev' && p.bulan === bulan);
    const tahunLabel = periodeMatch ? periodeMatch.tahun : _kinerja_tahun;
    b.textContent = `${BULAN_FULL[bulan]} ${tahunLabel}`;
  });

  // Reorder tombol di DOM: tahun ASC, bulan ASC
  const _monevSelector = document.getElementById('bulanSelector');
  if (_monevSelector) {
    const _btns = [..._monevSelector.querySelectorAll('.bulan-btn')];
    _btns.sort((a, b) => {
      if (_user?.is_admin) {
        // Admin: semua 12 bulan tampil, cukup urut nomor bulan
        return parseInt(a.dataset.bulan) - parseInt(b.dataset.bulan);
      }
      const pa = _periodeListTerbuka.find(p => p.jenis === 'monev' && p.bulan === parseInt(a.dataset.bulan));
      const pb = _periodeListTerbuka.find(p => p.jenis === 'monev' && p.bulan === parseInt(b.dataset.bulan));
      const ta = pa ? pa.tahun * 100 + pa.bulan : parseInt(a.dataset.bulan);
      const tb = pb ? pb.tahun * 100 + pb.bulan : parseInt(b.dataset.bulan);
      return ta - tb;
    });
    _btns.forEach(b => _monevSelector.appendChild(b));
  }
}

function _renderPeriodeInfo() {
  const el = document.getElementById('kinerjaActivePeriodeInfo');
  const kWrapper = document.getElementById('kinerjaBulanWrapper');

  // Admin: sembunyikan badge periode, cukup pakai dropdown tahun
  if (_user?.is_admin) {
    if (el) el.style.display = 'none';
    if (kWrapper) kWrapper.style.display = '';
    return;
  }

  if (!el) return;

  // Non-admin: sembunyikan wrapper kalau tidak ada periode monev aktif
  const _monevAktif = _periodeListTerbuka.filter(p => p.jenis === 'monev');
  if (_monevAktif.length === 0) {
    el.style.display = 'none';
    if (kWrapper) kWrapper.style.display = 'none';
    return;
  }
  if (kWrapper) kWrapper.style.display = '';

  const svgEl = el.querySelector('svg');
  el.innerHTML = '';
  if (svgEl) el.appendChild(svgEl);

  // Group bulan per tahun, sort tahun ASC, bulan ASC
  const tahunMap = {};
  for (const p of _monevAktif) {
    if (!tahunMap[p.tahun]) tahunMap[p.tahun] = [];
    tahunMap[p.tahun].push(p.bulan);
  }
  const periodeStr = Object.keys(tahunMap)
    .sort((a, b) => a - b)
    .map(t => {
      const bulanStr = tahunMap[t].sort((a, b) => a - b).map(b => BULAN_FULL[b]).join(', ');
      return `${bulanStr} ${t}`;
    })
    .join(' · ');
  el.appendChild(document.createTextNode(`Periode input: ${periodeStr}`));
  el.style.display = '';
}

function setKinerjaBulan(bulan) {
  // Guard: bulan tidak boleh dipilih jika bukan admin dan bukan bulan terbuka
  if (!_user?.is_admin) {
    const bulanTerbuka = new Set(_periodeListTerbuka.filter(p => p.jenis === 'monev').map(p => p.bulan));
    if (!bulanTerbuka.has(bulan)) return;
    // Sync tahun ke periode Monev yang sesuai bulan yang dipilih
    const periodeMatch = _periodeListTerbuka.find(p => p.jenis === 'monev' && p.bulan === bulan);
    if (periodeMatch) _kinerja_tahun = periodeMatch.tahun;
  }
  _kinerja_bulan = bulan;
  _syncBulanButtons();
  _renderPeriodeInfo();   
  _renderKinerjaCountdown('kinerjaCountdownBar', 'monev');
  _renderKinerjaCountdown('ikkCountdownBar', 'ikk');
  loadKinerjaRekap();
}

// ═══════════════════════════════════════════════════════════════════════════
// REKAP (halaman utama kinerja)
// ═══════════════════════════════════════════════════════════════════════════
async function loadKinerjaRekap() {
  const tbody = document.getElementById('kinerjaTableBody');
  if (!tbody) return;

  // Guard: non-admin tidak perlu lihat tabel kalau tidak ada periode aktif sama sekali
  if (!_user?.is_admin && !_periodeListTerbuka.some(p => p.jenis === 'monev')) {
    // Sembunyikan card tabel (termasuk thead), tampilkan pesan di luarnya
    const tableCard = tbody.closest('.card');
    if (tableCard) tableCard.style.display = 'none';
    let msgEl = document.getElementById('kinerjaNoperiodeMsg');
    if (!msgEl) {
      msgEl = document.createElement('div');
      msgEl.id = 'kinerjaNoperiodeMsg';
      tableCard ? tableCard.parentNode.insertBefore(msgEl, tableCard) : tbody.parentNode.insertBefore(msgEl, tbody.parentNode.firstChild);
    }
    msgEl.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:48px 20px;color:#94a3b8;background:#fff;border-radius:12px;border:1.5px solid #f1f5f9">
        <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.2" opacity=".35">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
        </svg>
        <div style="font-size:.95rem;font-weight:600;color:#64748b">Belum ada periode input yang aktif</div>
        <div style="font-size:.82rem;color:#94a3b8;text-align:center">Input data kinerja belum dapat dilakukan.<br>Hubungi Admin untuk membuka periode pengisian.</div>
      </div>`;
    msgEl.style.display = '';
    return;
  }
  // Kalau ada periode aktif, pastikan card & pesan kembali normal
  const _tableCard = tbody.closest('.card');
  if (_tableCard) _tableCard.style.display = '';
  const _msgEl = document.getElementById('kinerjaNoperiodeMsg');
  if (_msgEl) _msgEl.style.display = 'none';

  tbody.innerHTML = `<tr class="empty-row"><td colspan="11">Memuat data...</td></tr>`;
  try {
    const r = await fetch(`/api/kinerja/rekap?bulan=${_kinerja_bulan}&tahun=${_kinerja_tahun}`, { headers: authHeaders() });
    const d = await r.json();
    if (!r.ok) { tbody.innerHTML = `<tr class="empty-row"><td colspan="11">${d.error || 'Gagal memuat'}</td></tr>`; return; }
    let rekap = d.rekap || [];

    // Filter per assigned indikator user (non-admin hanya lihat indikator yg di-assign)
    if (!_user?.is_admin) {
      if (_userIndikatorIds && _userIndikatorIds.size > 0) {
        rekap = rekap.filter(row => _userIndikatorIds.has(Number(row.id)));
      } else {
        rekap = [];
      }
    }

    _kinerjaData = rekap;
    _ikuPage = 1;
    renderKinerjaTable(tbody);
  } catch (err) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="11">Error: ${err.message}</td></tr>`;
  }
}

// Helper: trigger file picker langsung dari tombol Upload row-baru (baca tw/tahun/source dari data-attr)
function _openDukungFromBtn(btn) {
  const id     = parseInt(btn.dataset.indikatorId);
  const tw     = parseInt(btn.dataset.tw);
  const tahun  = parseInt(btn.dataset.tahun);
  const source = btn.dataset.source;
  triggerDukungUpload(id, tw, tahun, source);
}

// Kunci kembali tombol "Uploaded" / "Upload" data dukung untuk satu baris
// (dipanggil setelah Simpan, supaya kembali ke tampilan default/disabled
// persis seperti saat toggleEditRow keluar dari mode edit)
function _lockDukungButtons(indikatorId) {
  const dukungBtn     = document.querySelector(`[data-dukung-id="${indikatorId}"] .dukung-uploaded-btn`);
  const uploadOnlyBtn = document.querySelector(`tr[data-id="${indikatorId}"] .dukung-upload-btn`);
  const deleteBtn     = document.querySelector(`tr[data-id="${indikatorId}"] .dukung-delete-btn`);

  if (dukungBtn) {
    dukungBtn.disabled = true;
    dukungBtn.style.cursor = 'not-allowed';
    dukungBtn.style.opacity = '.85';
    dukungBtn.title = 'Klik Edit terlebih dahulu untuk mengganti file';
    dukungBtn.onclick = null;
  }
  if (deleteBtn) {
    deleteBtn.disabled = true;
    deleteBtn.style.cursor = 'not-allowed';
    deleteBtn.style.opacity = '.5';
    deleteBtn.title = 'Klik Edit terlebih dahulu untuk menghapus file';
    deleteBtn.onclick = null;
  }
  if (uploadOnlyBtn) {
    uploadOnlyBtn.disabled = true;
    uploadOnlyBtn.style.cursor = 'not-allowed';
    uploadOnlyBtn.style.opacity = '.65';
    uploadOnlyBtn.style.borderStyle = 'dashed';
    uploadOnlyBtn.style.borderColor = '#fca5a5';
    uploadOnlyBtn.style.background = '#fee2e2';
    uploadOnlyBtn.style.color = '#991b1b';
    uploadOnlyBtn.title = 'Klik Edit terlebih dahulu untuk mengupload file';
    uploadOnlyBtn.onclick = null;
  }
}

// Suntik tombol Reset (admin) ke baris setelah Simpan sukses, tanpa perlu reload
function _ensureResetBtn(indikatorId, prefix, jenis) {
  if (!_user?.is_admin) return;
  if (document.getElementById(`${prefix}resetbtn_${indikatorId}`)) return;
  const saveBtn = document.getElementById(`${prefix}savebtn_${indikatorId}`);
  if (!saveBtn) return;
  saveBtn.insertAdjacentHTML('afterend', `
    <button class="btn-reset-row" id="${prefix}resetbtn_${indikatorId}" title="Reset data realisasi baris ini (admin)"
      onclick="resetRealisasiRow(${indikatorId}, '${jenis}')">
      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
      Reset
    </button>`);
}

function _renderDukungBtn(row, tw, tahun, source, initialEditable = false) {
  let files = [];
  if (row.data_dukung_url) {
    try {
      const p = JSON.parse(row.data_dukung_url);
      files = Array.isArray(p) ? p.filter(f => f && f.url) : [{ url: row.data_dukung_url, name: row.data_dukung_nama || 'Dokumen' }];
    } catch { files = [{ url: row.data_dukung_url, name: row.data_dukung_nama || 'Dokumen' }]; }
  }
  const fileCount = files.length;
  const twVal    = tw    ?? _kinerja_bulan;
  const tahunVal = tahun ?? _kinerja_tahun;
  const fn       = source === 'ikk' ? 'openIkkDukungModal' : 'openDukungModal';

  if (fileCount > 0) {
    const previewFn  = `openDukungPreview(${row.id}, ${twVal}, ${tahunVal}, '${source}')`;
    const uploadFnAlt = source === 'ikk' ? `openIkkDukungModal(${row.id}, ${twVal}, ${tahunVal})` : `openDukungModal(${row.id}, ${twVal}, ${tahunVal}, '${source}')`;
    const label = 'Uploaded';
    // Baris yang belum disimpan (belum punya realisasi_id) tetap dalam mode edit aktif,
    // jadi tombol ganti/hapus file harus tetap terbuka tanpa perlu klik Edit dulu.
    const isEditable = initialEditable;

    // Tombol Uploaded: locked by default — hanya bisa diklik jika row dalam mode edit atau initialEditable
    return `<span style="display:inline-flex;align-items:center;gap:3px" data-dukung-id="${row.id}">
      <button
        class="dukung-uploaded-btn"
        data-indikator-id="${row.id}" data-tw="${twVal}" data-tahun="${tahunVal}" data-source="${source}"
        title="${isEditable ? 'Kelola / ganti file' : 'Klik Edit terlebih dahulu untuk mengganti file'}"
        ${isEditable ? `onclick="${uploadFnAlt}"` : 'disabled'}
        style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:6px;border:none;${isEditable ? 'cursor:pointer' : 'cursor:not-allowed'};font-size:.75rem;font-weight:600;font-family:inherit;background:#d1fae5;color:#065f46;opacity:.85">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
        ${label}
      </button>
      <button onclick="${previewFn}" title="Preview data dukung"
        style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:6px;border:none;cursor:pointer;background:#dbeafe;color:#1d4ed8">
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
      </button>
      <button class="dukung-delete-btn" ${isEditable ? '' : 'disabled'}
        data-indikator-id="${row.id}" data-tw="${twVal}" data-tahun="${tahunVal}" data-source="${source}"
        title="${isEditable ? 'Hapus file' : 'Klik Edit terlebih dahulu untuk menghapus file'}"
        ${isEditable ? `onclick="deleteDukungAll(${row.id}, ${twVal}, ${tahunVal}, '${source}')"` : ''}
        style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:6px;border:none;${isEditable ? 'cursor:pointer' : 'cursor:not-allowed'};background:#fee2e2;color:#991b1b;${isEditable ? '' : 'opacity:.5'}">
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path stroke-linecap="round" stroke-linejoin="round" d="M19 6l-1 14H6L5 6"/><path stroke-linecap="round" stroke-linejoin="round" d="M10 11v6m4-6v6"/><path stroke-linecap="round" stroke-linejoin="round" d="M9 6V4h6v2"/></svg>
      </button>
    </span>`;
  }

  if (initialEditable) {
    return `<button class="dukung-upload-btn" disabled
      data-indikator-id="${row.id}" data-tw="${twVal}" data-tahun="${tahunVal}" data-source="${source}"
      title="Isi realisasi dan field wajib terlebih dahulu"
      style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:6px;border:1.5px dashed #fca5a5;cursor:not-allowed;font-size:.75rem;font-weight:600;font-family:inherit;background:#fee2e2;color:#991b1b;opacity:.65">
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
      Upload
    </button>`;
  }
  return `<button class="dukung-upload-btn" disabled
    data-indikator-id="${row.id}" data-tw="${twVal}" data-tahun="${tahunVal}" data-source="${source}"
    title="Klik Edit terlebih dahulu untuk mengupload file"
    style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:6px;border:1.5px dashed #fca5a5;cursor:not-allowed;font-size:.75rem;font-weight:600;font-family:inherit;background:#fee2e2;color:#991b1b;opacity:.65">
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
    Upload
  </button>`;
}


// ── Pagination — IKU / IKK / IKK ─────────────────────────────────────────
let _ikuPage = 1; const _ikuPageSize = 10;
let _ikkPage = 1; const _ikkPageSize = 10;
let _spmPage = 1; const _spmPageSize = 10;
function _goIkuPage(p) { _ikuPage = p; renderKinerjaTable(document.getElementById('kinerjaTableBody')); }
function _goIkkPage(p) { _ikkPage = p; _renderIkkTable(document.getElementById('ikkTableBody')); }
function _goSpmPage(p) { _spmPage = p; _renderSpmTable(document.getElementById('spmTableBody')); }


function renderKinerjaTable(tbody) {
  if (!_kinerjaData.length) {
    let emptyMsg = 'Belum ada indikator aktif. Admin perlu menambahkan indikator terlebih dahulu.';
    if (!_user?.is_admin) {
      if (!_userIndikatorIds || _userIndikatorIds.size === 0) {
        emptyMsg = 'Belum ada indikator yang di-assign ke akun Anda. Hubungi Admin untuk mengatur assignment indikator.';
      } else {
        emptyMsg = 'Tidak ada indikator yang di-assign ke akun Anda pada periode ini.';
      }
    }
    tbody.innerHTML = `<tr class="empty-row"><td colspan="11">${emptyMsg}</td></tr>`;
    return;
  }
  const canEdit = _isMonevInputOpen();
  let html = '';
  let lastGroupId = null;
  let no = 0;

  const _ikuStart = (_ikuPage - 1) * _ikuPageSize;
  const _ikuRows  = _kinerjaData.slice(_ikuStart, _ikuStart + _ikuPageSize);

  _ikuRows.forEach(row => {
    // Baris group header jika group berubah
    if (row.group_id !== lastGroupId) {
      lastGroupId = row.group_id;
      if (row.group_nama) {
        const meta  = JENIS_META[row.group_jenis] || { label: row.group_jenis, cls: 'group-sasaran' };
        html += `
          <tr class="group-header-row ${meta.cls}">
            <td colspan="11">
              <span class="group-jenis-badge">${escHtml(meta.label)}</span>
              ${escHtml(row.group_nama)}
            </td>
          </tr>`;
      }
    }

    no++;
    const capaian = (row.realisasi_id && row.capaian_persen != null) ? Number(row.capaian_persen) : null;
    let badgeClass = 'na', badgeText = '—';
    if (capaian !== null && !isNaN(capaian)) {
      badgeText = capaian.toFixed(1) + '%';
      badgeClass = capaian >= 91 ? 'st' : capaian >= 76 ? 'ti' : capaian >= 66 ? 'sd' : capaian >= 51 ? 'rd' : 'sr';
    }
    const negBadge = row.bermakna_negatif ? `<span title="Bermakna Negatif" style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;background:#fee2e2;border-radius:50%;margin-left:5px;vertical-align:middle;flex-shrink:0"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"9\" height=\"9\" fill=\"none\" viewBox=\"0 0 24 24\" stroke=\"#991b1b\" stroke-width=\"2.8\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M19 14l-7 7m0 0l-7-7m7 7V3\"/></svg></span>` : `<span title="Bermakna Positif" style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;background:#d1fae5;border-radius:50%;margin-left:5px;vertical-align:middle;flex-shrink:0"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"9\" height=\"9\" fill=\"none\" viewBox=\"0 0 24 24\" stroke=\"#065f46\" stroke-width=\"2.8\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M5 10l7-7m0 0l7 7m-7-7v18\"/></svg></span>`;

    // Format target: dari JOIN kinerja_target (tahun aktif)
    const _targetNum = row.target_tahun != null ? Number(row.target_tahun) : null;
    const targetFmt = row.target_display != null
      ? String(row.target_display)
      : (_targetNum != null && !isNaN(_targetNum)
          ? (Number.isInteger(_targetNum) ? String(_targetNum) : _targetNum.toFixed(2))
          : '—');

    // Tentukan row state class berdasarkan status data
    const rowStateClass = row.realisasi_id ? 'row-state-saved' : 'row-state-default';

    html += `<tr data-id="${row.id}" class="${rowStateClass}">
      <td class="td-sticky-no" style="text-align:center;color:var(--teks-muted);position:sticky;left:0;z-index:3">${no}</td>
      <td class="td-sticky-name" style="position:sticky;left:34px;z-index:3"><div style="font-weight:600;line-height:1.6"><span>${escHtml(row.indikator_kinerja)}</span>${negBadge}</div>${row.formula ? `<div class="fx-wrap" style="margin-top:5px"><button style="display:inline-flex;align-items:center;gap:4px;font-size:0.62rem;font-weight:700;color:#0f766e;background:#f0fdfa;border:1px solid #99f6e4;border-radius:4px;padding:2px 6px;cursor:pointer;font-family:inherit" title="Lihat formula perhitungan" onclick="var d=this.nextElementSibling;var open=d.style.display==='block';d.style.display=open?'none':'block';this.querySelector('.fx-arrow').style.transform=open?'rotate(0deg)':'rotate(180deg)'"><span>Σ</span><span class=\"fx-arrow\" style=\"display:inline-block;transition:transform .2s;font-style:normal\">▾</span></button><div class="fx-panel" style="display:none;margin-top:4px">${_renderFormulaMath(row.formula, '')}</div></div>` : ''}</td>
      <td class="td-satuan">${escHtml(row.satuan || '')}</td>
      <td class="td-target" style="font-weight:700">${targetFmt}</td>
      ${_user?.is_admin ? `<td style="color:var(--teks-mid)">${escHtml(row.penanggung_jawab || '—')}</td>` : ''}
      <td class="realisasi-input-cell">
        <input type="number" id="real_${row.id}" value="${row.realisasi_display != null ? row.realisasi_display : (row.realisasi != null ? parseFloat(row.realisasi) : '')}"
               placeholder="0" step="0.01" ${row.realisasi_id ? 'readonly' : ''}
               title="${row.realisasi_id ? 'Klik tombol Edit untuk mengisi realisasi' : ''}"
               style="${row.realisasi_id ? 'cursor:not-allowed' : ''}"
               onchange="markDirty(${row.id})">
      </td>
      <td style="text-align:center">
        <span class="capaian-badge ${badgeClass}" id="badge_${row.id}">${badgeText}</span>
      </td>
      <td class="textarea-cell">
        ${_renderPSCell('fpenghambat', row.id, row.f_penghambat, capaian, canEdit, 'faktor penghambat', 'markDirty', !!row.realisasi_id, false)}
      </td>
      <td class="textarea-cell">
        ${_renderPSCell('solusi', row.id, row.solusi, capaian, canEdit, 'solusi', 'markDirty', !!row.realisasi_id, false)}
      </td>
      <td class="textarea-cell">
        ${_renderPSCell('fpendukung', row.id, row.f_pendukung, capaian, canEdit, 'faktor pendukung', 'markDirty', !!row.realisasi_id, true)}
      </td>
      <td class="textarea-cell">
        ${_renderPSCell('rencana', row.id, row.rencana_tl, capaian, canEdit, 'rencana tindak lanjut', 'markDirty', !!row.realisasi_id, true)}
      </td>
      <td style="text-align:center" data-col="dukung">
        ${_renderDukungBtn(row, _kinerja_bulan, _kinerja_tahun, 'monev', !row.realisasi_id)}
      </td>
      <td style="text-align:center;white-space:nowrap">
        ${canEdit ? `
          <button class="btn-edit-row" id="editbtn_${row.id}" title="Edit baris ini"
            onclick="toggleEditRow(${row.id})"
            style="${row.realisasi_id ? '' : 'display:none'}">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            Edit
          </button>
          <button class="save-row-btn" id="savebtn_${row.id}" disabled
            onclick="saveRealisasiRow(${row.id})" title="Simpan"
            style="font-family:'Plus Jakarta Sans',sans-serif!important;${row.realisasi_id ? 'background:var(--sukses);color:#fff' : ''}">
            ${row.realisasi_id
  ? '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg> Tersimpan'
  : '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg> Simpan'}
          </button>
        ` : ''}
        ${_user?.is_admin && row.realisasi_id ? `
          <button class="btn-reset-row" id="resetbtn_${row.id}" title="Reset data realisasi baris ini (admin)"
            onclick="resetRealisasiRow(${row.id}, 'monev')">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
            Reset
          </button>
        ` : ''}
      </td>
    </tr>`;
  });
  tbody.innerHTML = html;
  // Toggle header kolom Bidang / Sub Bagian (hanya tampil untuk admin)
  document.querySelectorAll('.col-bidang-iku').forEach(el => { el.style.display = _user?.is_admin ? '' : 'none'; });
  renderPagination('ikuPagination', _kinerjaData.length, _ikuPage, _ikuPageSize, '_goIkuPage');
  // Tampilkan warning di kolom Data Dukung untuk baris yang sudah tersimpan
  // tapi belum punya file dukung
  if (canEdit) {
    _kinerjaData.forEach(row => {
      if (row.realisasi_id && !row.data_dukung_url) {
        const dukungCell = document.querySelector(`tr[data-id="${row.id}"] td[data-col="dukung"]`);
        if (dukungCell && !dukungCell.querySelector('.dukung-warning')) {
          dukungCell.insertAdjacentHTML('beforeend', `
            <div class="dukung-warning" title="Data dukung belum diupload untuk indikator ini">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
              Belum diupload
            </div>`);
        }
      }
    });
  }

  // Banner info akumulasi: tampilkan jika ada indikator "Jumlah..."
  const infoBanner = document.getElementById('kinerjaAkumulasiInfo');
  if (infoBanner) {
    const jumlahRows = _ikuRows.filter(r =>
      r.indikator_kinerja && r.indikator_kinerja.trim().toLowerCase().startsWith('jumlah')
    );
    if (jumlahRows.length > 0) {
      const countEl = document.getElementById('kinerjaAkumulasiCount');
      if (countEl) countEl.textContent = jumlahRows.length;
      infoBanner.style.display = 'flex';
    } else {
      infoBanner.style.display = 'none';
    }
  }
}

function toggleEditRow(indikatorId) {
  // Guard: non-admin tidak bisa edit di luar window monev
  if (!_user?.is_admin && !_isMonevInputOpen()) {
    const pa = _periodeListTerbuka.find(p => p.jenis === 'monev' && p.bulan === _kinerja_bulan) ?? null;
    const close = pa?.close_at ? new Date(pa.close_at) : null;
    const now   = new Date();
    if (close && now > close) {
      toast('Periode input sudah ditutup. Data tidak dapat diubah.', 'error');
    } else {
      toast('Periode input belum dibuka.', 'info');
    }
    return;
  }

  const realEl  = document.getElementById(`real_${indikatorId}`);
  const probEl  = document.getElementById(`fpenghambat_${indikatorId}`);
  const solEl   = document.getElementById(`solusi_${indikatorId}`);
  const pendEl  = document.getElementById(`fpendukung_${indikatorId}`);
  const rtlEl   = document.getElementById(`rencana_${indikatorId}`);
  const editBtn = document.getElementById(`editbtn_${indikatorId}`);
  const saveBtn = document.getElementById(`savebtn_${indikatorId}`);
  const tr      = document.querySelector(`tr[data-id="${indikatorId}"]`);
  const isReadonly = realEl?.hasAttribute('readonly');

  [realEl, probEl, solEl, pendEl, rtlEl].forEach(el => {
    if (!el) return;
    if (isReadonly) {
      el.removeAttribute('readonly');
      el.style.background = 'var(--putih)';
      el.style.cursor = '';
      el.style.resize = '';
      el.title = '';
    } else {
      el.setAttribute('readonly', '');
      el.style.background = '';
      el.style.cursor = 'not-allowed';
      if (el.tagName === 'TEXTAREA') el.style.resize = 'none';
      el.title = 'Klik tombol Edit untuk mengisi';
    }
  });


  // Switch ps-cell-wrap antara view mode (ps-read) dan edit mode (textarea)
  const psCells = document.querySelectorAll(`tr[data-id="${indikatorId}"] .ps-cell-wrap`);
  psCells.forEach(wrap => {
    const readEl = wrap.querySelector('.ps-read');
    const taEl   = wrap.querySelector('textarea');
    if (!taEl) return;
    if (isReadonly) {
      // Masuk edit mode: sembunyikan view, tampilkan textarea — skip wrap yg hidden
      if (wrap.style.display === 'none') return;
      if (readEl) readEl.style.display = 'none';
      taEl.style.display = '';
      requestAnimationFrame(() => _autoResizeTA(taEl));
    } else {
      // Keluar edit mode: update view text lalu tampilkan kembali
      const val = taEl.value || '';
      const LIMIT = 80;
      const shortEl = wrap.querySelector('[id$="short_' + indikatorId + '"]');
      const fullEl  = wrap.querySelector('[id$="full_' + indikatorId + '"]');
      const moreBtn = wrap.querySelector('.ps-more-btn');
      if (shortEl) { shortEl.innerHTML = escHtml(val.slice(0, LIMIT)) + (val.length > LIMIT ? '<span class="ps-ellipsis">…</span>' : ''); shortEl.style.display = ''; }
      if (fullEl)  { fullEl.textContent = val; fullEl.style.display = 'none'; }
      if (moreBtn) { moreBtn.textContent = 'Selengkapnya'; moreBtn.style.display = val.length > LIMIT ? '' : 'none'; }
      if (readEl)  { readEl.style.display = val.trim() ? '' : 'none'; }
      taEl.style.display = 'none';
      taEl.setAttribute('readonly', '');
      taEl.style.cursor = 'not-allowed';
    }
  });
  // Unlock / lock tombol data dukung (Uploaded & Upload)
  const dukungBtn     = document.querySelector(`[data-dukung-id="${indikatorId}"] .dukung-uploaded-btn`);
  const uploadOnlyBtn = document.querySelector(`tr[data-id="${indikatorId}"] .dukung-upload-btn`);

  if (dukungBtn) {
    if (isReadonly) {
      dukungBtn.disabled = false;
      dukungBtn.style.cursor = 'pointer';
      dukungBtn.style.opacity = '1';
      dukungBtn.title = 'Kelola / ganti file data dukung';
      const twV = dukungBtn.dataset.tw;
      const tahunV = dukungBtn.dataset.tahun;
      dukungBtn.onclick = () => openDukungModal(indikatorId, parseInt(twV), parseInt(tahunV));
    } else {
      dukungBtn.disabled = true;
      dukungBtn.style.cursor = 'not-allowed';
      dukungBtn.style.opacity = '.85';
      dukungBtn.title = 'Klik Edit terlebih dahulu untuk mengganti file';
      dukungBtn.onclick = null;
    }
  }

  const deleteBtn = document.querySelector(`tr[data-id="${indikatorId}"] .dukung-delete-btn`);
  if (deleteBtn) {
    if (isReadonly) {
      deleteBtn.disabled = false;
      deleteBtn.style.cursor = 'pointer';
      deleteBtn.style.opacity = '1';
      deleteBtn.title = 'Hapus semua file data dukung';
      const twV    = deleteBtn.dataset.tw;
      const tahunV = deleteBtn.dataset.tahun;
      const srcV   = deleteBtn.dataset.source;
      deleteBtn.onclick = () => deleteDukungAll(indikatorId, parseInt(twV), parseInt(tahunV), srcV);
    } else {
      deleteBtn.disabled = true;
      deleteBtn.style.cursor = 'not-allowed';
      deleteBtn.style.opacity = '.5';
      deleteBtn.title = 'Klik Edit terlebih dahulu untuk menghapus file';
      deleteBtn.onclick = null;
    }
  }

  if (uploadOnlyBtn) {
    if (isReadonly) {
      // Masuk mode edit → aktifkan tombol Upload
      uploadOnlyBtn.disabled = false;
      uploadOnlyBtn.style.cursor = 'pointer';
      uploadOnlyBtn.style.opacity = '1';
      uploadOnlyBtn.style.borderStyle = 'solid';
      uploadOnlyBtn.title = 'Upload file data dukung';
      const twV    = uploadOnlyBtn.dataset.tw;
      const tahunV = uploadOnlyBtn.dataset.tahun;
      const src    = uploadOnlyBtn.dataset.source;
      uploadOnlyBtn.onclick = () => triggerDukungUpload(indikatorId, parseInt(twV), parseInt(tahunV), src);
    } else {
      // Keluar mode edit → kunci kembali
      uploadOnlyBtn.disabled = true;
      uploadOnlyBtn.style.cursor = 'not-allowed';
      uploadOnlyBtn.style.opacity = '.65';
      uploadOnlyBtn.style.borderStyle = 'dashed';
      uploadOnlyBtn.title = 'Klik Edit terlebih dahulu untuk mengupload file';
      uploadOnlyBtn.onclick = null;
    }
  }

  if (isReadonly) {
    // ── Masuk mode edit ──────────────────────────────────────────────────────
    // Warna baris → orange (editing)
    if (tr) {
      tr.classList.remove('row-state-default', 'row-state-saved');
      tr.classList.add('row-state-editing');
    }
    // Tombol Edit → badge "Sedang Diedit"
    if (editBtn) {
      editBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg> Sedang Diedit`;
      editBtn.classList.add('btn-edit-row--active');
      editBtn.title = 'Klik untuk batalkan edit';
    }
    if (saveBtn) {
      saveBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg> Simpan`;
      saveBtn.style.background = '';
      saveBtn.style.color = '';
    }
    if (realEl) realEl.focus();
    _updateSaveBtnState(indikatorId);
  } else {
    // ── Keluar mode edit (batal) ─────────────────────────────────────────────
    // Kembalikan warna ke default (bukan saved karena user batal)
    const row = _kinerjaData.find(r => r.id === indikatorId);
    if (tr) {
      tr.classList.remove('row-state-editing');
      tr.classList.add(row?.realisasi_id ? 'row-state-saved' : 'row-state-default');
    }
    // Tombol Edit → kembali normal dengan SVG + teks "Edit"
    if (editBtn) {
      editBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg> Edit`;
      editBtn.classList.remove('btn-edit-row--active');
      editBtn.title = 'Edit baris ini';
    }
    if (saveBtn) {
      saveBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg> Simpan`;
      saveBtn.style.background = '';
      saveBtn.style.color = '';
      saveBtn.disabled = true;
    }
  }
}

function toggleIkkEditRow(indikatorId) {
  // Guard: non-admin tidak bisa edit di luar window ikk
  if (!_user?.is_admin && !_isIkkInputOpen()) {
    const pa = _periodeListTerbuka.find(p => p.jenis === 'ikk' && p.bulan === _ikk_bulan) ?? null;
    const close = pa?.close_at ? new Date(pa.close_at) : null;
    const now   = new Date();
    if (close && now > close) {
      toast('Periode input sudah ditutup. Data tidak dapat diubah.', 'error');
    } else {
      toast('Periode input belum dibuka.', 'info');
    }
    return;
  }

  const realEl  = document.getElementById(`ikk_real_${indikatorId}`);
  const probEl  = document.getElementById(`ikk_fpenghambat_${indikatorId}`);
  const solEl   = document.getElementById(`ikk_solusi_${indikatorId}`);
  const pendEl  = document.getElementById(`ikk_fpendukung_${indikatorId}`);
  const rtlEl   = document.getElementById(`ikk_rencana_${indikatorId}`);
  const editBtn = document.getElementById(`ikk_editbtn_${indikatorId}`);
  const saveBtn = document.getElementById(`ikk_savebtn_${indikatorId}`);
  const tr      = document.querySelector(`tr[data-id="${indikatorId}"]`);
  const isReadonly = realEl?.hasAttribute('readonly');

  [realEl, probEl, solEl, pendEl, rtlEl].forEach(el => {
    if (!el) return;
    if (isReadonly) {
      el.removeAttribute('readonly');
      el.style.background = 'var(--putih)';
      el.style.cursor = '';
      el.style.resize = '';
      el.title = '';
    } else {
      el.setAttribute('readonly', '');
      el.style.background = '';
      el.style.cursor = 'not-allowed';
      if (el.tagName === 'TEXTAREA') el.style.resize = 'none';
      el.title = 'Klik tombol Edit untuk mengisi';
    }
  });


  // Switch ps-cell-wrap antara view mode (ps-read) dan edit mode (textarea)
  const psCells = document.querySelectorAll(`tr[data-id="${indikatorId}"] .ps-cell-wrap`);
  psCells.forEach(wrap => {
    const readEl = wrap.querySelector('.ps-read');
    const taEl   = wrap.querySelector('textarea');
    if (!taEl) return;
    if (isReadonly) {
      // Masuk edit mode: sembunyikan view, tampilkan textarea — skip wrap yg hidden
      if (wrap.style.display === 'none') return;
      if (readEl) readEl.style.display = 'none';
      taEl.style.display = '';
      requestAnimationFrame(() => _autoResizeTA(taEl));
    } else {
      // Keluar edit mode: update view text lalu tampilkan kembali
      const val = taEl.value || '';
      const LIMIT = 80;
      const shortEl = wrap.querySelector('[id$="short_' + indikatorId + '"]');
      const fullEl  = wrap.querySelector('[id$="full_' + indikatorId + '"]');
      const moreBtn = wrap.querySelector('.ps-more-btn');
      if (shortEl) { shortEl.innerHTML = escHtml(val.slice(0, LIMIT)) + (val.length > LIMIT ? '<span class="ps-ellipsis">…</span>' : ''); shortEl.style.display = ''; }
      if (fullEl)  { fullEl.textContent = val; fullEl.style.display = 'none'; }
      if (moreBtn) { moreBtn.textContent = 'Selengkapnya'; moreBtn.style.display = val.length > LIMIT ? '' : 'none'; }
      if (readEl)  { readEl.style.display = val.trim() ? '' : 'none'; }
      taEl.style.display = 'none';
      taEl.setAttribute('readonly', '');
      taEl.style.cursor = 'not-allowed';
    }
  });
  // Unlock / lock tombol data dukung IKK (Uploaded & Upload)
  const ikkDukungBtn     = document.querySelector(`[data-dukung-id="${indikatorId}"] .dukung-uploaded-btn`);
  const ikkUploadOnlyBtn = document.querySelector(`tr[data-id="${indikatorId}"] .dukung-upload-btn`);

  if (ikkDukungBtn) {
    if (isReadonly) {
      ikkDukungBtn.disabled = false;
      ikkDukungBtn.style.cursor = 'pointer';
      ikkDukungBtn.style.opacity = '1';
      ikkDukungBtn.title = 'Kelola / ganti file data dukung';
      const twV = ikkDukungBtn.dataset.tw;
      const tahunV = ikkDukungBtn.dataset.tahun;
      ikkDukungBtn.onclick = () => openIkkDukungModal(indikatorId, parseInt(twV), parseInt(tahunV));
    } else {
      ikkDukungBtn.disabled = true;
      ikkDukungBtn.style.cursor = 'not-allowed';
      ikkDukungBtn.style.opacity = '.85';
      ikkDukungBtn.title = 'Klik Edit terlebih dahulu untuk mengganti file';
      ikkDukungBtn.onclick = null;
    }
  }

  const ikkDeleteBtn = document.querySelector(`tr[data-id="${indikatorId}"] .dukung-delete-btn`);
  if (ikkDeleteBtn) {
    if (isReadonly) {
      ikkDeleteBtn.disabled = false;
      ikkDeleteBtn.style.cursor = 'pointer';
      ikkDeleteBtn.style.opacity = '1';
      ikkDeleteBtn.title = 'Hapus semua file data dukung';
      const twV    = ikkDeleteBtn.dataset.tw;
      const tahunV = ikkDeleteBtn.dataset.tahun;
      const srcV   = ikkDeleteBtn.dataset.source;
      ikkDeleteBtn.onclick = () => deleteDukungAll(indikatorId, parseInt(twV), parseInt(tahunV), srcV);
    } else {
      ikkDeleteBtn.disabled = true;
      ikkDeleteBtn.style.cursor = 'not-allowed';
      ikkDeleteBtn.style.opacity = '.5';
      ikkDeleteBtn.title = 'Klik Edit terlebih dahulu untuk menghapus file';
      ikkDeleteBtn.onclick = null;
    }
  }

  if (ikkUploadOnlyBtn) {
    if (isReadonly) {
      ikkUploadOnlyBtn.disabled = false;
      ikkUploadOnlyBtn.style.cursor = 'pointer';
      ikkUploadOnlyBtn.style.opacity = '1';
      ikkUploadOnlyBtn.style.borderStyle = 'solid';
      ikkUploadOnlyBtn.title = 'Upload file data dukung';
      const twV    = ikkUploadOnlyBtn.dataset.tw;
      const tahunV = ikkUploadOnlyBtn.dataset.tahun;
      const src    = ikkUploadOnlyBtn.dataset.source;
      ikkUploadOnlyBtn.onclick = () => triggerDukungUpload(indikatorId, parseInt(twV), parseInt(tahunV), src);
    } else {
      ikkUploadOnlyBtn.disabled = true;
      ikkUploadOnlyBtn.style.cursor = 'not-allowed';
      ikkUploadOnlyBtn.style.opacity = '.65';
      ikkUploadOnlyBtn.style.borderStyle = 'dashed';
      ikkUploadOnlyBtn.title = 'Klik Edit terlebih dahulu untuk mengupload file';
      ikkUploadOnlyBtn.onclick = null;
    }
  }

  if (isReadonly) {
    // ── Masuk mode edit ──────────────────────────────────────────────────────
    if (tr) {
      tr.classList.remove('row-state-default', 'row-state-saved');
      tr.classList.add('row-state-editing');
    }
    if (editBtn) {
      editBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg> Sedang Diedit`;
      editBtn.classList.add('btn-edit-row--active');
      editBtn.title = 'Klik untuk batalkan edit';
    }
    if (saveBtn) {
      saveBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg> Simpan`;
      saveBtn.disabled = true;
      saveBtn.style.background = '';
      saveBtn.style.color = '';
    }
    if (realEl) realEl.focus();
    _updateIkkSaveBtnState(indikatorId);
  } else {
    // ── Keluar mode edit (batal) ─────────────────────────────────────────────
    const row = _ikkData.find(r => r.id === indikatorId);
    if (tr) {
      tr.classList.remove('row-state-editing');
      tr.classList.add(row?.realisasi_id ? 'row-state-saved' : 'row-state-default');
    }
    if (editBtn) {
      editBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg> Edit`;
      editBtn.classList.remove('btn-edit-row--active');
      editBtn.title = 'Edit baris ini';
    }
    if (saveBtn) {
      saveBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg> Simpan`;
      saveBtn.style.background = '';
      saveBtn.style.color = '';
      saveBtn.disabled = true;
    }
  }
}

function markDirty(indikatorId) {
  previewCapaian(indikatorId);
  _updateSaveBtnState(indikatorId);
}

// Cek apakah teks cuma berisi simbol/tanda baca (-, :, ., dst.) tanpa
// huruf/angka asli — dianggap tidak bermakna sebagai keterangan.
function _isSymbolOnly(val) {
  const v = (val || '').trim();
  if (!v) return true;
  return !/[a-zA-Z0-9]/.test(v);
}

// Warning real-time saat user mengetik di Faktor Penghambat/Solusi/dst:
// kalau isiannya cuma simbol (mis. "-", ";", "?") tanpa disambung teks,
// kasih toast supaya user langsung sadar — bukan nunggu sampai klik Simpan.
// Map menyimpan NILAI terakhir yang sudah di-warn (bukan cuma flag boolean),
// supaya ganti ke simbol lain (mis. "-" -> "?") tetap memicu toast baru,
// tapi mengetik ulang nilai yang sama persis tidak nge-spam toast.
const _symbolWarnTimers = {};
const _symbolWarnedVal  = new Map();
function _checkSymbolOnlyInput(el, label) {
  if (!el) return;
  const key = el.id;
  clearTimeout(_symbolWarnTimers[key]);
  _symbolWarnTimers[key] = setTimeout(() => {
    const val = (el.value || '').trim();
    if (!val) { _symbolWarnedVal.delete(key); return; }
    if (_isSymbolOnly(val)) {
      if (_symbolWarnedVal.get(key) !== val) {
        toast(`${label.charAt(0).toUpperCase() + label.slice(1)} tidak boleh hanya berisi simbol atau tanda baca.`, 'error');
        _symbolWarnedVal.set(key, val);
      }
    } else {
      _symbolWarnedVal.delete(key);
    }
  }, 600);
}

// Cek apakah baris boleh disimpan: realisasi harus diisi,
// serta field wajib sesuai kondisi capaian.
function _canSaveRow({ realVal, targetVal, bermakna_negatif, fpenghambatVal, solusiVal, fpendukungVal, rencanaVal, hasDukung }, requireDukung = true) {
  if (realVal === '' || realVal === null || realVal === undefined) return false;
  const r = parseFloat(realVal);
  const t = parseFloat(targetVal);
  if (isNaN(r) || isNaN(t) || t === 0) return false;
  const capaian = bermakna_negatif ? ((t - (r - t)) / t) * 100 : (r / t) * 100;
  if (capaian < 100) {
    // Wajib: f_penghambat + solusi, dan tidak boleh cuma simbol
    if (_isSymbolOnly(fpenghambatVal) || _isSymbolOnly(solusiVal)) return false;
  } else {
    // Wajib: f_pendukung + rencana_tl, dan tidak boleh cuma simbol
    if (_isSymbolOnly(fpendukungVal) || _isSymbolOnly(rencanaVal)) return false;
  }
  // Wajib: data dukung harus sudah diupload (hanya untuk tombol Simpan,
  // bukan untuk tombol Upload itu sendiri — kalau tidak, jadi lingkaran:
  // upload baru aktif kalau sudah upload)
  if (requireDukung && !hasDukung) return false;
  return true;
}

function _updateSaveBtnState(indikatorId) {
  const btn = document.getElementById(`savebtn_${indikatorId}`);
  if (!btn) return;
  const row    = _kinerjaData.find(r => r.id === indikatorId);
  const realEl = document.getElementById(`real_${indikatorId}`);
  const fieldArgs = {
    realVal: realEl?.value,
    targetVal: row?.target_tahun,
    bermakna_negatif: row?.bermakna_negatif,
    fpenghambatVal: document.getElementById(`fpenghambat_${indikatorId}`)?.value ?? '',
    solusiVal:      document.getElementById(`solusi_${indikatorId}`)?.value ?? '',
    fpendukungVal:  document.getElementById(`fpendukung_${indikatorId}`)?.value ?? '',
    rencanaVal:     document.getElementById(`rencana_${indikatorId}`)?.value ?? '',
    hasDukung:      !!row?.data_dukung_url,
  };
  const ok = _canSaveRow(fieldArgs);
  const okUpload = _canSaveRow(fieldArgs, false);
  btn.disabled         = !ok;
  btn.style.background = ok ? '#0d9488' : '';
  btn.style.color      = ok ? '#fff'    : '';
  btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg> Simpan`;

  // Enable/disable tombol Upload berdasarkan kondisi field wajib
  const _uploadBtn_iku = document.querySelector(`tr[data-id="${indikatorId}"] .dukung-upload-btn`);
  if (_uploadBtn_iku && !_uploadBtn_iku.classList.contains('dukung-uploaded-btn')) {
    if (okUpload) {
      _uploadBtn_iku.disabled = false;
      _uploadBtn_iku.style.cursor = 'pointer';
      _uploadBtn_iku.style.opacity = '1';
      _uploadBtn_iku.style.borderStyle = 'dashed';
      _uploadBtn_iku.style.borderColor = '#6ee7b7';
      _uploadBtn_iku.style.background = '#ecfdf5';
      _uploadBtn_iku.style.color = '#065f46';
      _uploadBtn_iku.title = 'Upload data dukung';
      _uploadBtn_iku.onclick = () => _openDukungFromBtn(_uploadBtn_iku);
    } else {
      _uploadBtn_iku.disabled = true;
      _uploadBtn_iku.style.cursor = 'not-allowed';
      _uploadBtn_iku.style.opacity = '.65';
      _uploadBtn_iku.style.borderStyle = 'dashed';
      _uploadBtn_iku.style.borderColor = '#fca5a5';
      _uploadBtn_iku.style.background = '#fee2e2';
      _uploadBtn_iku.style.color = '#991b1b';
      _uploadBtn_iku.title = 'Isi realisasi dan field wajib terlebih dahulu';
      _uploadBtn_iku.onclick = null;
    }
  }
}

// Untuk indikator bertipe "Jumlah..." (akumulasi kumulatif lintas bulan):
// hitung nilai realisasi "efektif" untuk preview live capaian, yaitu
// akumulasi bulan-bulan lain (selain bulan yang sedang diketik) + nilai yang sedang diketik.
// row.capaian_persen (raw dari server) merepresentasikan kumulatif s.d. bulan ini
// SEBELUM nilai baru yang sedang diketik disimpan — jadi basis bulan lain bisa diturunkan dari situ.
function _hitungRealisasiEfektifPreview(row, realisasiInput) {
  const isJumlah = (row.indikator_kinerja || row.nama_indikator || '').trim().toLowerCase().startsWith('jumlah');
  if (!isJumlah) return realisasiInput;

  const target = parseFloat(row.target_tahun);
  const capPersenRaw = row.capaian_persen != null ? Number(row.capaian_persen) : null;
  const savedThisMonth = row.realisasi_id ? (parseFloat(row.realisasi) || 0) : 0;

  let basisBulanLain = 0;
  if (capPersenRaw != null && !isNaN(capPersenRaw) && !isNaN(target) && target !== 0) {
    basisBulanLain = (capPersenRaw / 100) * target - savedThisMonth;
    if (isNaN(basisBulanLain) || basisBulanLain < 0) basisBulanLain = 0;
  }
  return basisBulanLain + realisasiInput;
}

function previewCapaian(indikatorId) {
  const row = _kinerjaData.find(r => r.id === indikatorId);
  if (!row) return;
  const realEl = document.getElementById(`real_${indikatorId}`);
  if (!realEl) return;
  const realisasi = parseFloat(realEl.value);
  const target    = parseFloat(row.target_tahun);
  const badge     = document.getElementById(`badge_${indikatorId}`);
  if (!badge) return;
  if (isNaN(realisasi) || isNaN(target) || target === 0) {
    badge.textContent = '—'; badge.className = 'capaian-badge na';
    _togglePermasalahanSolusi('', indikatorId, null);
    return;
  }
  let capaian = row.bermakna_negatif
    ? ((target - (_hitungRealisasiEfektifPreview(row, realisasi) - target)) / target) * 100
    : (_hitungRealisasiEfektifPreview(row, realisasi) / target) * 100;
  badge.textContent = capaian.toFixed(1) + '%';
  badge.className = 'capaian-badge ' + (capaian >= 91 ? 'st' : capaian >= 76 ? 'ti' : capaian >= 66 ? 'sd' : capaian >= 51 ? 'rd' : 'sr');
  _togglePermasalahanSolusi('', indikatorId, capaian);
}

async function saveRealisasiRow(indikatorId) {
  const btn  = document.getElementById(`savebtn_${indikatorId}`);
  const realEl = document.getElementById(`real_${indikatorId}`);
  const real = realEl?.value;
  let fpenghambat = document.getElementById(`fpenghambat_${indikatorId}`)?.value?.trim();
  let solusi      = document.getElementById(`solusi_${indikatorId}`)?.value?.trim();
  let fpendukung  = document.getElementById(`fpendukung_${indikatorId}`)?.value?.trim();
  let rencana     = document.getElementById(`rencana_${indikatorId}`)?.value?.trim();

  const row = _kinerjaData.find(r => r.id === indikatorId);

  // Validasi field wajib — hitung capaian langsung dari nilai input vs target
  const _realVal  = parseFloat(real);
  const _targetVal = parseFloat(row?.target_tahun);
  if (!isNaN(_realVal) && !isNaN(_targetVal) && _targetVal !== 0) {
    const _capaian = row?.bermakna_negatif
      ? ((_targetVal - (_realVal - _targetVal)) / _targetVal) * 100
      : (_realVal / _targetVal) * 100;
    if (_capaian < 100) {
      if (!fpenghambat || _isSymbolOnly(fpenghambat)) { toast('Faktor Penghambat wajib diisi, tidak boleh hanya simbol/tanda baca.', 'error'); return; }
      if (!solusi || _isSymbolOnly(solusi))           { toast('Solusi wajib diisi, tidak boleh hanya simbol/tanda baca.', 'error'); return; }
      fpendukung = ''; rencana = '';
    } else {
      if (!fpendukung || _isSymbolOnly(fpendukung)) { toast('Faktor Pendukung wajib diisi, tidak boleh hanya simbol/tanda baca.', 'error'); return; }
      if (!rencana || _isSymbolOnly(rencana))       { toast('Rencana Tindak Lanjut wajib diisi, tidak boleh hanya simbol/tanda baca.', 'error'); return; }
      fpenghambat = ''; solusi = '';
    }
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="animation:spin .8s linear infinite"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg> ...`;
  }
  try {
    const r = await fetch('/api/kinerja/realisasi', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({
        indikator_id: indikatorId, bulan: _kinerja_bulan, tahun: _kinerja_tahun,
        realisasi: real !== '' ? parseFloat(real) : null,
        realisasi_display: real !== '' ? real : null,
        f_penghambat: fpenghambat || null, solusi: solusi || null, f_pendukung: fpendukung || null, rencana_tl: rencana || null,
      }),
    });
    const d = await r.json();
    if (!r.ok) { toast(d.error || 'Gagal menyimpan', 'error'); if (btn) { btn.disabled = false; btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg> Simpan`; } }
    else {
      toast('Tersimpan');
      // Invalidate cache chart dashboard supaya Pantau Indikator fetch data fresh
      if (typeof _invalidateKinerjaDashboardCache === 'function') _invalidateKinerjaDashboardCache(_kinerja_tahun);
      // Kunci kembali input setelah simpan
      ['real_', 'fpenghambat_', 'solusi_', 'fpendukung_', 'rencana_'].forEach(prefix => {
        const el = document.getElementById(`${prefix}${indikatorId}`);
        if (el) {
          el.setAttribute('readonly', '');
          el.style.background = '';
          el.style.cursor = 'not-allowed';
          if (el.tagName === 'TEXTAREA') { el.style.resize = 'none'; el.style.display = 'none'; }
          el.title = 'Klik tombol Edit untuk mengisi';
        }
      });
      // Kunci kembali tombol data dukung (Upload kembali ke warna default)
      _lockDukungButtons(indikatorId);
      // Tampilkan tombol Reset (admin) tanpa perlu reload
      _ensureResetBtn(indikatorId, '', 'monev');
      // Update warna baris → hijau (tersimpan)
      const tr = document.querySelector(`tr[data-id="${indikatorId}"]`);
      if (tr) {
        tr.classList.remove('row-state-default', 'row-state-editing');
        tr.classList.add('row-state-saved');
      }
      const editBtn = document.getElementById(`editbtn_${indikatorId}`);
      if (editBtn) {
        editBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg> Edit`;
        editBtn.classList.remove('btn-edit-row--active');
        editBtn.title = 'Edit baris ini';
        editBtn.style.display = ''; // tampilkan tombol Edit setelah data tersimpan
      }
      if (btn) {
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg> Tersimpan`;
        btn.style.background = 'var(--sukses)';
        btn.style.color = '#fff';
        btn.disabled = true;
      }
      const idx = _kinerjaData.findIndex(x => x.id === indikatorId);
      if (idx >= 0) {
        _kinerjaData[idx].realisasi         = d.realisasi?.realisasi ?? null;
        _kinerjaData[idx].realisasi_display = d.realisasi?.realisasi_display ?? null;
        _kinerjaData[idx].f_penghambat      = d.realisasi?.f_penghambat ?? null;
        _kinerjaData[idx].solusi            = d.realisasi?.solusi ?? null;
        _kinerjaData[idx].f_pendukung       = d.realisasi?.f_pendukung ?? null;
        _kinerjaData[idx].rencana_tl        = d.realisasi?.rencana_tl ?? null;
        _kinerjaData[idx].realisasi_id      = d.realisasi?.id ?? _kinerjaData[idx].realisasi_id;
      }
      // Refresh capaian_persen dari server (hitung ulang kumulatif lintas bulan)
      // lakukan background — tidak mengubah UI state yang sudah dikunci
      fetch(`/api/kinerja/rekap?bulan=${_kinerja_bulan}&tahun=${_kinerja_tahun}`, { headers: authHeaders() })
        .then(res => res.ok ? res.json() : null)
        .then(fresh => {
          if (!fresh?.rekap) return;
          for (const freshRow of fresh.rekap) {
            const i = _kinerjaData.findIndex(x => x.id === freshRow.id);
            if (i >= 0) _kinerjaData[i].capaian_persen = freshRow.capaian_persen;
            // Update badge capaian di DOM untuk semua row (termasuk indikator kumulatif)
            // — hanya jika baris tersebut sudah punya realisasi tersimpan untuk bulan ini
            const badge = document.getElementById(`badge_${freshRow.id}`);
            if (badge) {
              const cap = (freshRow.realisasi_id && freshRow.capaian_persen != null) ? Number(freshRow.capaian_persen) : null;
              if (cap === null || isNaN(cap)) {
                badge.textContent = '—'; badge.className = 'capaian-badge na';
              } else {
                badge.textContent = cap.toFixed(1) + '%';
                badge.className = 'capaian-badge ' + (cap >= 91 ? 'st' : cap >= 76 ? 'ti' : cap >= 66 ? 'sd' : cap >= 51 ? 'rd' : 'sr');
              }
            }
          }
        }).catch(() => {}); // silent fail — badge tetap dari previewCapaian
      // Update visibility ps-read dan wrap setelah save
      const _savedRow = _kinerjaData[idx >= 0 ? idx : -1];
      const _realVal2  = parseFloat(_savedRow?.realisasi ?? '');
      const _targetVal2 = parseFloat(_savedRow?.target_tahun ?? '');
      if (!isNaN(_realVal2) && !isNaN(_targetVal2) && _targetVal2 !== 0) {
        const _capaianFinal = _savedRow?.bermakna_negatif
          ? ((_targetVal2 - (_realVal2 - _targetVal2)) / _targetVal2) * 100
          : (_realVal2 / _targetVal2) * 100;
        _togglePermasalahanSolusi('', indikatorId, _capaianFinal);
        // Update ps-read content & visibility
        [['fpenghambat', _savedRow?.f_penghambat], ['solusi', _savedRow?.solusi],
         ['fpendukung', _savedRow?.f_pendukung], ['rencana', _savedRow?.rencana_tl]].forEach(([base, val]) => {
          const readEl  = document.getElementById(`${base}read_${indikatorId}`);
          const shortEl = document.getElementById(`${base}short_${indikatorId}`);
          if (readEl && shortEl) {
            const hasVal = (val || '').trim().length > 0;
            shortEl.textContent = val || '';
            readEl.style.display = hasVal ? '' : 'none';
          }
        });
      }
      // Tampilkan warning di kolom Data Dukung jika belum ada file
      if (!row?.data_dukung_url) {
        const dukungCell = document.querySelector(`tr[data-id="${indikatorId}"] td[data-col="dukung"]`);
        if (dukungCell && !dukungCell.querySelector('.dukung-warning')) {
          dukungCell.insertAdjacentHTML('beforeend', `
            <div class="dukung-warning" title="Data dukung belum diupload untuk indikator ini">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
              Belum diupload
            </div>`);
        }
      }
    }
  } catch (err) {
    toast('Error: ' + err.message, 'error');
    if (btn) { btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg> Simpan`; btn.disabled = false; }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN: KELOLA GROUP
// ═══════════════════════════════════════════════════════════════════════════
async function loadGroupAdmin() {
  const tbody = document.getElementById('groupAdminBody');
  if (!tbody) return;
  tbody.innerHTML = `<tr class="empty-row"><td colspan="5">Memuat...</td></tr>`;
  try {
    const r = await fetch('/api/kinerja/group', { headers: authHeaders() });
    const d = await r.json();
    _groupList   = d.group || [];
    _groupPage   = 1;
    _groupSearch = '';
    const searchEl = document.getElementById('groupSearch');
    if (searchEl) searchEl.value = '';
    renderGroupAdmin();
  } catch (err) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">Gagal: ${err.message}</td></tr>`;
  }
}

function filterGroup() {
  _groupSearch = document.getElementById('groupSearch')?.value?.toLowerCase() || '';
  _groupPage   = 1;
  renderGroupAdmin();
}
window.goGroupPage = (p) => { _groupPage = p; renderGroupAdmin(); };

function renderGroupAdmin() {
  const tbody = document.getElementById('groupAdminBody');
  if (!tbody) return;

  const filtered = _groupList.filter(g => {
    if (!_groupSearch) return true;
    const meta = JENIS_META[g.jenis] || { label: g.jenis };
    return (
      g.nama.toLowerCase().includes(_groupSearch) ||
      meta.label.toLowerCase().includes(_groupSearch)
    );
  });

  if (!filtered.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="5">${_groupSearch ? 'Tidak ada hasil pencarian.' : 'Belum ada group. Klik "+ Tambah Group".'}</td></tr>`;
    renderPagination('groupPagination', 0, 1, _groupPageSize, 'goGroupPage');
    return;
  }

  const start = (_groupPage - 1) * _groupPageSize;
  const slice = filtered.slice(start, start + _groupPageSize);

  tbody.innerHTML = slice.map((g, i) => {
    const meta = JENIS_META[g.jenis] || { label: g.jenis, cls: '' };
    return `
      <tr>
        <td style="text-align:center;color:var(--teks-muted)">${start + i + 1}</td>
        <td><span class="group-jenis-badge ${meta.cls}">${escHtml(meta.label)}</span></td>
        <td>${escHtml(g.nama)}</td>
        <td style="text-align:center">${g.urutan}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-ghost btn-sm" title="Edit" onclick="openGroupModal(${g.id})"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg></button>
          <button class="btn btn-danger btn-sm" title="Hapus" onclick="deleteGroup(${g.id})"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path stroke-linecap="round" stroke-linejoin="round" d="M19 6l-1 14H6L5 6"/><path stroke-linecap="round" stroke-linejoin="round" d="M10 11v6m4-6v6"/><path stroke-linecap="round" stroke-linejoin="round" d="M9 6V4h6v2"/></svg></button>
        </td>
      </tr>`;
  }).join('');
  renderPagination('groupPagination', filtered.length, _groupPage, _groupPageSize, 'goGroupPage');
}

function openGroupModal(id) {
  _editingGroupId = id || null;
  document.getElementById('modalGroupTitle').textContent = id ? 'Edit Group' : 'Tambah Group';
  const g = id ? _groupList.find(x => x.id === id) : null;
  document.getElementById('groupId').value      = g?.id || '';
  document.getElementById('groupNama').value    = g?.nama || '';
  document.getElementById('groupJenis').value   = g?.jenis || 'sasaran';
  document.getElementById('groupUrutan') && (document.getElementById('groupUrutan').value = g?.urutan ?? 0);
  document.getElementById('groupAktif') && (document.getElementById('groupAktif').checked = g ? g.aktif : true);
  openModal('modalGroup');
}

async function saveGroup() {
  const body = {
    nama:   document.getElementById('groupNama').value.trim(),
    jenis:  document.getElementById('groupJenis').value,
  };
  if (!body.nama) { toast('Nama group wajib diisi', 'error'); return; }
  const id     = _editingGroupId;
  const url    = id ? `/api/kinerja/group/${id}` : '/api/kinerja/group';
  const method = id ? 'PUT' : 'POST';
  try {
    const r = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) { toast(d.error || 'Gagal simpan', 'error'); return; }
    toast(id ? 'Group diperbarui' : 'Group ditambahkan');
    closeModal('modalGroup');
    loadGroupAdmin();
  } catch (err) { toast('Error: ' + err.message, 'error'); }
}

async function deleteGroup(id) {
  const g  = _groupList.find(x => x.id === id);
  const ok = await showConfirm({
    title:  'Hapus Group',
    msg:    `Group "<b>${escHtml(g?.nama || '')}</b>" akan dihapus. Indikator di dalamnya tidak ikut terhapus.`,
    okText: 'Ya, Hapus', icon: 'trash',
  });
  if (!ok) return;
  await fetch(`/api/kinerja/group/${id}`, { method: 'DELETE', headers: authHeaders() });
  toast('Group dihapus');
  loadGroupAdmin();
}

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN: KELOLA INDIKATOR
// ═══════════════════════════════════════════════════════════════════════════
async function loadIndikatorAdmin({ keepFilter = false } = {}) {
  const tbody = document.getElementById('indikatorAdminBody');
  if (!tbody) return;
  tbody.innerHTML = `<tr class="empty-row"><td colspan="9">Memuat...</td></tr>`;
  try {
    const [ri, rg, rb, rt, rj] = await Promise.all([
      fetch('/api/kinerja/indikator',        { headers: authHeaders() }),
      fetch('/api/kinerja/group',            { headers: authHeaders() }),
      fetch('/api/bidang',                   { headers: authHeaders() }),
      fetch('/api/kinerja/target?all=1',     { headers: authHeaders() }),
      fetch('/api/kinerja/jenis-kinerja',    { headers: authHeaders() }),
    ]);
    const di = await ri.json();
    const dg = await rg.json();
    const db = await rb.json();
    const dt = await rt.json();
    const dj = await rj.json();
    _indikatorList     = (di.indikator || []).map(normTarget);
    _groupList         = dg.group    || [];
    _bidangListKinerja = db.bidang   || [];
    _jenisList         = (dj.jenis   || []).filter(j => j.aktif);
    // Build targetMap: { indikator_id: [{tahun, target, target_display}] }
    _targetMap = {};
    for (const t of (dt.target || [])) {
      if (!_targetMap[t.indikator_id]) _targetMap[t.indikator_id] = [];
      _targetMap[t.indikator_id].push(t);
    }
    _indikatorPage = 1;
    if (!keepFilter) {
      _indikatorSearch      = '';
      _indikatorFilterJenis = '';
      _indikatorFilterMakna = '';
      _indikatorFilterPJ    = '';
      _indikatorFilterTahun = '';
      const searchEl = document.getElementById('indikatorSearch');
      if (searchEl) searchEl.value = '';
      const jenisEl = document.getElementById('indikatorFilterJenis');
      if (jenisEl) jenisEl.value = '';
      const maknaEl = document.getElementById('indikatorFilterMakna');
      if (maknaEl) maknaEl.value = '';
    }
    // Populate filter Jenis Kinerja secara dinamis
    const jenisFilterEl = document.getElementById('indikatorFilterJenis');
    if (jenisFilterEl) {
      const all = (dj.jenis || []).filter(j => j.aktif);
      jenisFilterEl.innerHTML =
        '<option value="">Semua Jenis</option>' +
        all.map(j => `<option value="${escHtml(j.kode)}">${escHtml(j.label)}</option>`).join('') +
        '<option value="none">Tanpa Jenis</option>';
      if (keepFilter && _indikatorFilterJenis) jenisFilterEl.value = _indikatorFilterJenis;
    }
    // Populate tahun dropdown dari targetMap
    const tahunSet = new Set();
    for (const targets of Object.values(_targetMap)) {
      for (const t of targets) if (t.tahun) tahunSet.add(t.tahun);
    }
    const tahunEl = document.getElementById('indikatorFilterTahun');
    if (tahunEl) {
      const sorted = [...tahunSet].sort((a, b) => a - b);
      const thisYear = new Date().getFullYear();
      const prevTahun = keepFilter ? _indikatorFilterTahun : '';
      tahunEl.innerHTML = '<option value="">Semua Tahun</option>' +
        sorted.map(y => `<option value="${y}" ${String(y) === String(prevTahun || thisYear) ? 'selected' : ''}>${y}</option>`).join('');
      _indikatorFilterTahun = tahunEl.value;
    }
    renderIndikatorAdmin();
  } catch (err) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="8">Gagal: ${err.message}</td></tr>`;
  }
}

function filterIndikator() {
  _indikatorSearch      = document.getElementById('indikatorSearch')?.value?.toLowerCase() || '';
  _indikatorFilterJenis = document.getElementById('indikatorFilterJenis')?.value || '';
  _indikatorFilterMakna = document.getElementById('indikatorFilterMakna')?.value || '';
  _indikatorFilterPJ    = document.getElementById('indikatorFilterPJ')?.value || '';
  _indikatorFilterTahun = document.getElementById('indikatorFilterTahun')?.value || '';
  _indikatorPage        = 1;
  renderIndikatorAdmin();
}
window.goIndikatorPage = (p) => { _indikatorPage = p; renderIndikatorAdmin(); };
window.openJenisModal       = openJenisModal;
window.saveJenis            = saveJenis;
window.deleteJenis          = deleteJenis;
window.loadKelolaJenis      = loadKelolaJenis;
window._updateJenisPreview  = _updateJenisPreview;
window._onJenisCbChange     = _onJenisCbChange;

// Render formula sebagai pecahan matematis
// Format input: "Pembilang / Penyebut × konstanta"
// Contoh: "Jumlah kematian bayi / Jumlah kelahiran hidup × 1000 KH"
function _renderFormulaMath(formula, _unused) {
  if (!formula) return '';
  // Parse JSON format baru: {nama, pembilang, penyebut, pengali}
  let f = null;
  try { f = JSON.parse(formula); } catch(e) {}
  // Fallback: format lama (teks biasa)
  if (!f || typeof f !== 'object') {
    return `<div style="font-size:0.58rem;font-style:italic;color:#0f766e;line-height:1.4;padding:2px 5px;background:#f0fdfa;border-left:2px solid #14b8a6;border-radius:0 4px 4px 0">${escHtml(formula)}</div>`;
  }
  const { nama, pembilang, penyebut, pengali } = f;
  // Kalau tidak ada pembilang/penyebut, tampil teks biasa
  if (!pembilang && !penyebut) {
    return `<div style="font-size:0.58rem;font-style:italic;color:#0f766e;line-height:1.4;padding:2px 5px;background:#f0fdfa;border-left:2px solid #14b8a6;border-radius:0 4px 4px 0">${escHtml(nama||'')}</div>`;
  }
  const namaHtml = nama
    ? `<div style="font-size:0.58rem;font-style:italic;color:#0f766e;white-space:nowrap;align-self:center;margin-right:5px">${escHtml(nama)}</div>`
    : '';
  const mulHtml = pengali
    ? `<div style="font-size:0.58rem;font-style:italic;color:#0f766e;margin-left:6px;white-space:nowrap;align-self:center">× ${escHtml(pengali)}</div>`
    : '';
  return `<div style="padding:3px 5px;background:#f0fdfa;border-left:2px solid #14b8a6;border-radius:0 4px 4px 0">
    <div style="display:flex;align-items:center">
      ${namaHtml}
      <div style="display:flex;flex-direction:column;align-items:center;flex:1">
        <div style="font-size:0.58rem;font-style:italic;color:#0f766e;text-align:center;padding:0 4px;line-height:1.4;white-space:normal;overflow-wrap:normal">${escHtml(pembilang||'')}</div>
        <div style="width:100%;height:1px;background:#14b8a6;margin:2px 0"></div>
        <div style="font-size:0.58rem;font-style:italic;color:#0f766e;text-align:center;padding:0 4px;line-height:1.4;white-space:normal;overflow-wrap:normal">${escHtml(penyebut||'')}</div>
      </div>
      ${mulHtml}
    </div>
  </div>`;
}

// Preview live di modal
function _previewFormula() {
  const nama      = document.getElementById('fNama')?.value.trim() || '';
  const pembilang = document.getElementById('fPembilang')?.value.trim() || '';
  const penyebut  = document.getElementById('fPenyebut')?.value.trim() || '';
  const pengali   = document.getElementById('fPengali')?.value.trim() || '';
  // Update hidden input sebagai JSON
  const obj = { nama, pembilang, penyebut, pengali };
  const hidden = document.getElementById('indikatorFormula');
  if (hidden) hidden.value = (pembilang || penyebut || nama) ? JSON.stringify(obj) : '';
  // Render preview
  const prev = document.getElementById('formulaPreview');
  if (!prev) return;
  if (!pembilang && !penyebut && !nama) { prev.style.display = 'none'; return; }
  prev.style.display = 'block';
  prev.innerHTML = `<div style="font-size:0.68rem;font-weight:700;color:var(--hijau);letter-spacing:.05em;margin-bottom:6px;text-transform:uppercase">Preview</div>` + _renderFormulaMath(hidden.value);
}

function renderIndikatorAdmin() {
  const tbody = document.getElementById('indikatorAdminBody');
  if (!tbody) return;

  // Update header kolom Target biar selalu sinkron sama _indikatorFilterTahun
  // (dipanggil dari filterIndikator() maupun loadIndikatorAdmin() saat load awal)
  const thTargetEl = document.getElementById('thTarget');
  if (thTargetEl) thTargetEl.textContent = _indikatorFilterTahun ? `Target ${_indikatorFilterTahun}` : 'Target';

  // Populate PJ dropdown (deduplicated)
  const pjSelect = document.getElementById('indikatorFilterPJ');
  if (pjSelect) {
    const pjList = [...new Set(
      _indikatorList.map(r => r.penanggung_jawab).filter(Boolean)
    )].sort();
    const currentPJ = pjSelect.value;
    pjSelect.innerHTML = '<option value="">Semua Bidang</option>' +
      pjList.map(pj => `<option value="${escHtml(pj)}" ${pj === currentPJ ? 'selected' : ''}>${escHtml(pj)}</option>`).join('');
  }

  const filtered = _indikatorList.filter(row => {
    // Text search
    if (_indikatorSearch && !(
      row.indikator_kinerja.toLowerCase().includes(_indikatorSearch) ||
      (row.penanggung_jawab || '').toLowerCase().includes(_indikatorSearch) ||
      (row.satuan || '').toLowerCase().includes(_indikatorSearch) ||
      (Array.isArray(row.pic_users) && row.pic_users.some(n => (n || '').toLowerCase().includes(_indikatorSearch)))
    )) return false;
    // Jenis Kinerja — dinamis
    if (_indikatorFilterJenis === 'none') {
      const anyJenis = _jenisList.some(j => _rowHasJenis(row, j.kode));
      if (anyJenis) return false;
    } else if (_indikatorFilterJenis) {
      if (!_rowHasJenis(row, _indikatorFilterJenis)) return false;
    }
    // Makna
    if (_indikatorFilterMakna === 'negatif' && !row.bermakna_negatif)  return false;
    if (_indikatorFilterMakna === 'positif' &&  row.bermakna_negatif)  return false;
    // Penanggung Jawab
    if (_indikatorFilterPJ && (row.penanggung_jawab || '') !== _indikatorFilterPJ) return false;
    return true;
  });

  if (!filtered.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="9">${_indikatorSearch ? 'Tidak ada hasil pencarian.' : 'Belum ada indikator. Klik "+ Tambah Indikator".'}</td></tr>`;
    renderPagination('indikatorPagination', 0, 1, _indikatorPageSize, 'goIndikatorPage');
    return;
  }

  const start  = (_indikatorPage - 1) * _indikatorPageSize;
  const slice  = filtered.slice(start, start + _indikatorPageSize);
  // Offset nomor urut
  let rows = '';
  slice.forEach((row, i) => {
    const no = start + i + 1;
    rows += `
      <tr>
        <td style="text-align:center;color:var(--teks-muted)">${no}</td>
        <td><div style="font-weight:600">${escHtml(row.indikator_kinerja)}</div>${row.formula ? `<div class="fx-wrap" style="margin-top:5px"><button style="display:inline-flex;align-items:center;gap:4px;font-size:0.62rem;font-weight:700;color:#0f766e;background:#f0fdfa;border:1px solid #99f6e4;border-radius:4px;padding:2px 6px;cursor:pointer;font-family:inherit" title="Lihat formula perhitungan" onclick="var d=this.nextElementSibling;var open=d.style.display==='block';d.style.display=open?'none':'block';this.querySelector('.fx-arrow').style.transform=open?'rotate(0deg)':'rotate(180deg)'"><span>Σ</span><span class="fx-arrow" style="display:inline-block;transition:transform .2s;font-style:normal">▾</span></button><div class="fx-panel" style="display:none;margin-top:4px">${_renderFormulaMath(row.formula, '')}</div></div>` : ''}</td>
        <td class="td-satuan">${escHtml(row.satuan)}</td>
        <td style="white-space:nowrap">${(() => {
          const targets = _targetMap[row.id] || [];
          if (!targets.length) return '<span style="color:var(--teks-muted)">—</span>';
          if (_indikatorFilterTahun) {
            // Hanya tampilkan target untuk tahun yang dipilih
            const t = targets.find(t => String(t.tahun) === _indikatorFilterTahun);
            if (!t) return '<span style="color:var(--teks-muted);font-size:.72rem">—</span>';
            const val = t.target_display != null ? String(t.target_display) : (t.target != null ? String(t.target) : '—');
            return `<span style="display:inline-flex;align-items:center;gap:3px;font-size:.82rem;font-weight:600;color:#0f766e">${escHtml(val)}</span>`;
          }
          const thisYear = new Date().getFullYear();
          // Urutkan: tahun terdekat dari sekarang ke atas dulu, lalu ke bawah
          const sorted = [...targets].sort((a, b) => Math.abs(a.tahun - thisYear) - Math.abs(b.tahun - thisYear));
          const shown  = sorted.slice(0, 3).sort((a, b) => a.tahun - b.tahun);
          const rest   = targets.length - 3;
          const badges = shown.map(t => {
            const val = t.target_display != null ? String(t.target_display) : (t.target != null ? String(t.target) : '—');
            return `<span style="display:inline-flex;align-items:center;gap:3px;font-size:.72rem;font-weight:600;background:#f0fdfa;color:#0f766e;border:1px solid #99f6e4;border-radius:5px;padding:2px 6px;margin:1px 2px 1px 0">${t.tahun}<span style="color:#64748b;font-weight:400">:</span>${escHtml(val)}</span>`;
          }).join('');
          const moreBadge = rest > 0
            ? `<span title="Buka edit untuk lihat semua target" style="display:inline-flex;align-items:center;font-size:.72rem;font-weight:600;background:#f1f5f9;color:#64748b;border:1px solid #e2e8f0;border-radius:5px;padding:2px 6px;margin:1px 0;cursor:default">+${rest} lagi</span>`
            : '';
          return badges + moreBadge;
        })()}</td>
        <td>${escHtml(row.penanggung_jawab || '—')}</td>
        <td>${(() => {
          const pics = Array.isArray(row.pic_users) ? row.pic_users.filter(Boolean) : [];
          if (!pics.length) return '<span style="color:var(--teks-muted);font-size:.75rem">—</span>';
          return pics.map(nama => `<span style="display:inline-flex;align-items:center;font-size:.7rem;font-weight:600;background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe;border-radius:5px;padding:2px 7px;margin:1px 3px 1px 0">${escHtml(nama)}</span>`).join('');
        })()}</td>
        <td>
          ${_renderJenisBadges(row)}
        </td>
        <td class="neg-col">
          ${row.bermakna_negatif
            ? `<span style="display:inline-flex;align-items:center;gap:3px;font-size:.7rem;font-weight:700;color:#991b1b;background:#fee2e2;padding:2px 7px;border-radius:5px">
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3"/></svg>
                Negatif</span>`
            : `<span style="display:inline-flex;align-items:center;gap:3px;font-size:.7rem;font-weight:700;color:#065F46;background:#D1FAE5;padding:2px 7px;border-radius:5px">
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18"/></svg>
                Positif</span>`
          }
        </td>
        <td style="white-space:nowrap">
          <button class="btn btn-ghost btn-sm" title="Edit" onclick="openIndikatorModal(${row.id})"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg></button>
          <button class="btn btn-danger btn-sm" title="Hapus" onclick="deleteIndikator(${row.id})"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path stroke-linecap="round" stroke-linejoin="round" d="M19 6l-1 14H6L5 6"/><path stroke-linecap="round" stroke-linejoin="round" d="M10 11v6m4-6v6"/><path stroke-linecap="round" stroke-linejoin="round" d="M9 6V4h6v2"/></svg></button>
        </td>
      </tr>`;
  });
  tbody.innerHTML = rows;
  renderPagination('indikatorPagination', filtered.length, _indikatorPage, _indikatorPageSize, 'goIndikatorPage');
}

// Filter list indikator mengikuti filter yang sedang aktif di tabel Kelola Indikator
function _getFilteredIndikatorRows() {
  return _indikatorList.filter(row => {
    if (_indikatorSearch && !(
      row.indikator_kinerja.toLowerCase().includes(_indikatorSearch) ||
      (row.penanggung_jawab || '').toLowerCase().includes(_indikatorSearch) ||
      (row.satuan || '').toLowerCase().includes(_indikatorSearch) ||
      (Array.isArray(row.pic_users) && row.pic_users.some(n => (n || '').toLowerCase().includes(_indikatorSearch)))
    )) return false;
    if (_indikatorFilterJenis === 'none') {
      const anyJenis = _jenisList.some(j => _rowHasJenis(row, j.kode));
      if (anyJenis) return false;
    } else if (_indikatorFilterJenis) {
      if (!_rowHasJenis(row, _indikatorFilterJenis)) return false;
    }
    if (_indikatorFilterMakna === 'negatif' && !row.bermakna_negatif)  return false;
    if (_indikatorFilterMakna === 'positif' &&  row.bermakna_negatif)  return false;
    if (_indikatorFilterPJ && (row.penanggung_jawab || '') !== _indikatorFilterPJ) return false;
    return true;
  });
}

// ══════════════════════════════════════════════════════
//  DOWNLOAD KELOLA INDIKATOR — PDF (gaya sama dengan laporan.js:
//  kop surat resmi + tabel + tanda tangan, dibuka di tab baru untuk di-print/Save as PDF)
// ══════════════════════════════════════════════════════
async function downloadIndikatorPDF(btnEl) {
  if (!_indikatorList.length) { toast('Belum ada data indikator untuk didownload.', 'error'); return; }

  const originalHtml = btnEl ? btnEl.innerHTML : null;
  if (btnEl) { btnEl.disabled = true; btnEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Memuat...`; }

  try {
    const filtered = _getFilteredIndikatorRows();
    if (!filtered.length) { toast('Tidak ada data sesuai filter saat ini.', 'error'); return; }

    const tahunLabel = _indikatorFilterTahun || new Date().getFullYear();
    const targetHeaderLabel = _indikatorFilterTahun ? `TARGET ${_indikatorFilterTahun}` : 'TARGET';

    const bodyRows = filtered.map((row, i) => {
      const targets = _targetMap[row.id] || [];
      let targetStr = '—';
      if (targets.length) {
        if (_indikatorFilterTahun) {
          const t = targets.find(t => String(t.tahun) === _indikatorFilterTahun);
          targetStr = t ? String(t.target_display != null ? t.target_display : (t.target != null ? t.target : '—')) : '—';
        } else {
          targetStr = [...targets]
            .sort((a, b) => a.tahun - b.tahun)
            .map(t => `${t.tahun}: ${t.target_display != null ? t.target_display : (t.target != null ? t.target : '—')}`)
            .join('; ');
        }
      }
      const pics = Array.isArray(row.pic_users) ? row.pic_users.filter(Boolean) : [];

      // Badge Jenis Kinerja — sama persis kayak style di UI (_renderJenisBadges), pakai warna dinamis dari _jenisList
      const jenisBadgeHtml = _jenisList
        .filter(j => j.aktif && _rowHasJenis(row, j.kode))
        .map(j => `<span style="display:inline-block;font-size:8px;font-weight:700;color:${j.warna_teks};background:${j.warna_bg};padding:2px 6px;border-radius:4px;margin:1px 2px 1px 0">${escHtml(j.label)}</span>`)
        .join('');

      // Badge Makna Indikator — sama persis kayak style di UI (pill + panah)
      const maknaBadgeHtml = row.bermakna_negatif
        ? `<span style="display:inline-block;font-size:8px;font-weight:700;color:#991b1b;background:#fee2e2;padding:2px 6px;border-radius:4px">&darr; Negatif</span>`
        : `<span style="display:inline-block;font-size:8px;font-weight:700;color:#065f46;background:#d1fae5;padding:2px 6px;border-radius:4px">&uarr; Positif</span>`;

      return `<tr style="background:white">
        <td style="padding:4px 5px;border:1px solid #000;text-align:center;font-size:9px">${i + 1}</td>
        <td style="padding:4px 6px;border:1px solid #000;font-size:9px">${row.indikator_kinerja || ''}</td>
        <td style="padding:4px 4px;border:1px solid #000;text-align:center;font-size:9px">${row.satuan || '—'}</td>
        <td style="padding:4px 4px;border:1px solid #000;text-align:center;font-size:9px;white-space:nowrap">${targetStr}</td>
        <td style="padding:4px 6px;border:1px solid #000;font-size:9px">${row.penanggung_jawab || '—'}</td>
        <td style="padding:4px 6px;border:1px solid #000;font-size:9px">${pics.length ? pics.join(', ') : '—'}</td>
        <td style="padding:4px 4px;border:1px solid #000;text-align:center;font-size:9px">${jenisBadgeHtml || '—'}</td>
        <td style="padding:4px 4px;border:1px solid #000;text-align:center;font-size:9px">${maknaBadgeHtml}</td>
      </tr>`;
    }).join('');

    const bodyHtml = `
      ${_kopSuratHtml()}
      <div style="text-align:center;margin:18px 0 14px">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px">Kelola Indikator Kinerja</div>
        <div style="font-size:10px;color:#475569;margin-top:3px">Tahun ${tahunLabel}</div>
      </div>
      <table style="border-collapse:collapse;border-spacing:0;width:100%;table-layout:auto">
        <thead>
          <tr style="background:#0d9488">
            <th style="color:white;padding:5px 4px;border:1px solid #000;text-align:center;font-size:9px;width:32px">NO</th>
            <th style="color:white;padding:5px 4px;border:1px solid #000;text-align:center;font-size:9px;min-width:150px">INDIKATOR KINERJA</th>
            <th style="color:white;padding:5px 4px;border:1px solid #000;text-align:center;font-size:9px;width:50px">SATUAN</th>
            <th style="color:white;padding:5px 4px;border:1px solid #000;text-align:center;font-size:9px;width:60px">${targetHeaderLabel}</th>
            <th style="color:white;padding:5px 4px;border:1px solid #000;text-align:center;font-size:9px;min-width:110px">BIDANG / SUB BAGIAN</th>
            <th style="color:white;padding:5px 4px;border:1px solid #000;text-align:center;font-size:9px;min-width:100px">PENANGGUNG JAWAB (USER)</th>
            <th style="color:white;padding:5px 4px;border:1px solid #000;text-align:center;font-size:9px;width:70px">JENIS KINERJA</th>
            <th style="color:white;padding:5px 4px;border:1px solid #000;text-align:center;font-size:9px;width:60px">MAKNA INDIKATOR</th>
          </tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>`;

    _bukaPreviewPDF(bodyHtml, `Kelola Indikator Kinerja Tahun ${tahunLabel}`, 'landscape');
  } catch (err) {
    toast('Gagal membuat PDF: ' + err.message, 'error');
  } finally {
    if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = originalHtml; }
  }
}
window.downloadIndikatorPDF = downloadIndikatorPDF;

function _buildBidangOptions(selectedNama) {
  const none = `<option value="">— Pilih Bidang / Sub Bagian —</option>`;
  const opts = _bidangListKinerja
    .filter(b => b.aktif)
    .map(b => {
      const sel = b.nama === selectedNama ? 'selected' : '';
      return `<option value="${escHtml(b.nama)}" ${sel}>${escHtml(b.nama)}</option>`;
    }).join('');
  return none + opts;
}

// Searchable dropdown untuk #indikatorPJ — sama dengan initBidangSearchable di users_frontend.js
function initIndikatorPJSearchable() {
  const sel = document.getElementById('indikatorPJ');
  if (!sel) return;
  const wrap = sel.closest('.select-wrap');
  if (!wrap) return;

  // Bersihkan custom UI lama
  wrap.querySelectorAll('.bsel-trigger, .bsel-panel, .csel-trigger, .csel-panel').forEach(el => el.remove());
  wrap.classList.remove('csel-ready');

  const selectedOpt = sel.options[sel.selectedIndex];
  const selectedText = (selectedOpt && selectedOpt.value !== '') ? selectedOpt.text : null;

  // Trigger button
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'bsel-trigger csel-trigger';
  trigger.innerHTML = `<span class="bsel-trigger-text csel-trigger-text${selectedText ? '' : ' placeholder'}">${selectedText || '— Pilih Bidang / Sub Bagian —'}</span>
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" class="csel-chev"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>`;
  wrap.appendChild(trigger);

  // Panel
  const panel = document.createElement('div');
  panel.className = 'bsel-panel csel-panel';
  panel.style.cssText = 'display:none;padding:0';

  // Search input
  const searchWrap = document.createElement('div');
  searchWrap.style.cssText = 'padding:8px 10px;border-bottom:1px solid var(--border,#e2e8f0);position:sticky;top:0;background:#fff;z-index:1';
  const searchInp = document.createElement('input');
  searchInp.type = 'text';
  searchInp.placeholder = 'Cari bidang...';
  searchInp.className = 'bsel-search';
  searchInp.style.cssText = 'width:100%;border:1px solid var(--border,#e2e8f0);border-radius:6px;padding:5px 10px;font-size:.83rem;outline:none;color:var(--text-primary,#1e293b);background:var(--bg-input,#f8fafc)';
  searchWrap.appendChild(searchInp);
  panel.appendChild(searchWrap);

  // Options list
  const listEl = document.createElement('div');
  listEl.className = 'bsel-list';
  listEl.style.cssText = 'max-height:220px;overflow-y:scroll;overscroll-behavior:contain';
  panel.appendChild(listEl);

  wrap.appendChild(panel);

  function renderList(query) {
    const q = (query || '').toLowerCase();
    listEl.innerHTML = '';
    let hasResult = false;
    Array.from(sel.options).forEach((opt, i) => {
      const text = opt.text;
      const val  = opt.value;
      if (q && val === '') return;
      if (q && !text.toLowerCase().includes(q)) return;
      hasResult = true;
      const isSelected = sel.selectedIndex === i;
      const isPlaceholder = val === '';
      const div = document.createElement('div');
      div.className = 'csel-option' + (isSelected ? ' selected' : '') + (isPlaceholder ? ' placeholder-opt' : '');
      div.innerHTML = `<span class="csel-option-check"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg></span><span>${text}</span>`;
      div.addEventListener('click', () => {
        sel.selectedIndex = i;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        const textEl = trigger.querySelector('.bsel-trigger-text');
        if (!opt || opt.value === '') {
          textEl.textContent = opt ? opt.text : '—';
          textEl.classList.add('placeholder');
        } else {
          textEl.textContent = opt.text;
          textEl.classList.remove('placeholder');
        }
        closePanel();
      });
      listEl.appendChild(div);
    });
    if (!hasResult) {
      listEl.innerHTML = '<div style="padding:10px 14px;font-size:.83rem;color:var(--text-secondary,#64748b)">Tidak ditemukan</div>';
    }
  }

  function openPanel() {
    document.querySelectorAll('.bsel-panel, .csel-panel').forEach(p => {
      if (p !== panel) {
        p.style.display = 'none';
        p.parentElement?.querySelector('.csel-trigger, .bsel-trigger')?.classList.remove('open');
      }
    });
    document.body.appendChild(panel);
    const rect = trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    const panelW = Math.min(rect.width, vw - 16);
    const panelLeft = Math.min(rect.left, vw - panelW - 8);
    panel.style.cssText = [
      'display:block',
      'position:fixed',
      'top:' + (rect.bottom + 5) + 'px',
      'left:' + panelLeft + 'px',
      'width:' + panelW + 'px',
      'z-index:99999',
      'padding:0',
      'background:#fff',
      'border:1.5px solid #e2e8f0',
      'border-radius:8px',
      'box-shadow:0 8px 24px rgba(6,95,70,.13),0 2px 8px rgba(0,0,0,.07)',
      'overflow:hidden',
    ].join(';');
    trigger.classList.add('open');
    searchInp.value = '';
    renderList('');
    setTimeout(() => searchInp.focus(), 50);
  }

  function closePanel() {
    panel.style.display = 'none';
    trigger.classList.remove('open');
    if (panel.parentElement === document.body) wrap.appendChild(panel);
  }

  trigger.addEventListener('click', e => {
    e.stopPropagation();
    panel.style.display === 'none' ? openPanel() : closePanel();
  });
  searchInp.addEventListener('input', () => renderList(searchInp.value));
  searchInp.addEventListener('keydown', e => {
    if (e.key === 'Escape') closePanel();
    e.stopPropagation();
  });
  searchInp.addEventListener('click', e => e.stopPropagation());
  panel.addEventListener('click', e => e.stopPropagation());
  window.addEventListener('scroll', (e) => { if (!panel.contains(e.target)) closePanel(); }, true);
  window.addEventListener('resize', closePanel, true);
  const outsideHandler = (e) => {
    if (!panel.contains(e.target) && !trigger.contains(e.target)) closePanel();
  };
  document.addEventListener('click', outsideHandler, { once: false });
  wrap._bselOutside = outsideHandler;
  wrap.classList.add('csel-ready');
  renderList('');
}

function _buildGroupOptions(selectedId) {
  const none = `<option value="">— Tanpa Group —</option>`;
  const opts = _groupList
    .filter(g => g.aktif)
    .map(g => {
      const meta = JENIS_META[g.jenis] || { label: g.jenis };
      const sel  = g.id === selectedId ? 'selected' : '';
      return `<option value="${g.id}" ${sel}>[${escHtml(meta.label)}] ${escHtml(g.nama)}</option>`;
    }).join('');
  return none + opts;
}

function openIndikatorModal(id) {
  _editingIndikatorId = id || null;
  document.getElementById('modalIndikatorTitle').textContent = id ? 'Edit Indikator' : 'Tambah Indikator';
  const row = id ? _indikatorList.find(r => r.id === id) : null;

  document.getElementById('indikatorGroup').value      = row?.group_id || '';
  document.getElementById('indikatorId').value        = row?.id || '';
  document.getElementById('indikatorNama').value      = row?.indikator_kinerja || '';
  document.getElementById('indikatorSatuan').value    = row?.satuan || '';
  document.getElementById('indikatorPJ').innerHTML    = _buildBidangOptions(row?.penanggung_jawab || null);
  document.getElementById('indikatorUrutan') && (document.getElementById('indikatorUrutan').value = row?.urutan ?? 0);
  document.getElementById('indikatorNegatif').value   = row?.bermakna_negatif ? 'negatif' : 'positif';
  document.getElementById('indikatorAktif') && (document.getElementById('indikatorAktif').checked = row ? row.aktif : true);
  // Jenis kinerja checkboxes — dinamis dari _jenisList
  const jenisWrap = document.getElementById('indikatorJenisWrap');
  if (jenisWrap) {
    const customArr = Array.isArray(row?.jenis_custom) ? row.jenis_custom : [];
    jenisWrap.innerHTML = _jenisList.map(j => {
      let checked = false;
      if (j.kode === 'iku') checked = row ? !!row.jenis_monev : false;
      else if (j.kode === 'ikk') checked = row ? !!row.jenis_ikk : false;
      else if (j.kode === 'spm') checked = row ? !!row.jenis_spm : false;
      else checked = customArr.includes(j.kode);
      const chipColor = checked
        ? `background:${j.warna_bg};border-color:${j.warna_teks}40;color:${j.warna_teks}`
        : '';
      return `<label class="jenis-chip" data-kode="${escHtml(j.kode)}"
        style="display:flex;align-items:center;gap:7px;cursor:pointer;font-size:.85rem;font-weight:500;padding:6px 12px;border-radius:8px;border:1.5px solid #e2e8f0;background:#f8fafc;transition:background .2s,border-color .2s;${chipColor ? chipColor : ''}">
        <input type="checkbox" class="jenis-cb-input" data-kode="${escHtml(j.kode)}"
          ${checked ? 'checked' : ''}
          onchange="_onJenisCbChange(this)"
          style="width:14px;height:14px;accent-color:${j.warna_teks};flex-shrink:0">
        <span>${escHtml(j.label)}</span>
        ${j.is_builtin ? '' : `<span title="Jenis kustom" style="font-size:.62rem;color:${j.warna_teks};opacity:.7">✦</span>`}
      </label>`;
    }).join('')
    || '<span style="color:var(--teks-muted);font-size:.82rem">Belum ada jenis. Tambah dari bagian Kelola Jenis di bawah.</span>';
  }
  // Formula — parse JSON ke 4 field
  const fHidden = document.getElementById('indikatorFormula');
  const fNama      = document.getElementById('fNama');
  const fPembilang = document.getElementById('fPembilang');
  const fPenyebut  = document.getElementById('fPenyebut');
  const fPengali   = document.getElementById('fPengali');
  let fObj = { nama: '', pembilang: '', penyebut: '', pengali: '' };
  if (row?.formula) {
    try { fObj = { ...fObj, ...JSON.parse(row.formula) }; } catch(e) {
      fObj.nama = row.formula;
    }
  }
  if (fHidden)   fHidden.value    = row?.formula || '';
  if (fNama)      fNama.value      = fObj.nama;
  if (fPembilang) fPembilang.value = fObj.pembilang;
  if (fPenyebut)  fPenyebut.value  = fObj.penyebut;
  if (fPengali)   fPengali.value   = fObj.pengali;
  setTimeout(_previewFormula, 50);
  initIndikatorPJSearchable();

  openModal('modalIndikator');
}

// ── Target Per Tahun helpers ──────────────────────────────────────────────
function _renderTargetRows() {
  const tbody = document.getElementById('targetTahunTbody');
  if (!tbody) return;
  if (_targetRows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--teks-muted);font-size:.82rem;padding:12px">Belum ada target. Klik "+ Tambah" untuk menambahkan.</td></tr>`;
    return;
  }
  tbody.innerHTML = _targetRows.map((t, i) => `
    <tr>
      <td><input type="number" min="2000" max="2100" step="1" value="${t.tahun || ''}" placeholder="2025"
        oninput="_targetRows[${i}].tahun=parseInt(this.value)||''"
        style="width:80px;padding:5px 8px;border:1.5px solid #e2e8f0;border-radius:6px;font-size:.83rem;text-align:center"></td>
      <td><input type="text" value="${escHtml(String(t.target_display || t.target || ''))}" placeholder="cth: 73.87, &lt;1, &gt;90"
        oninput="_targetRows[${i}].target_display=this.value;_targetRows[${i}].target=this.value"
        style="width:120px;padding:5px 8px;border:1.5px solid #e2e8f0;border-radius:6px;font-size:.83rem"></td>
      <td style="text-align:center">
        <button onclick="_removeTargetRow(${i})" title="Hapus" style="background:none;border:none;cursor:pointer;color:var(--merah);padding:2px 6px;font-size:1rem">&#x2715;</button>
      </td>
    </tr>`).join('');
}

function _addTargetRow() {
  _targetRows.push({ tahun: '', target: '', target_display: '' });
  _renderTargetRows();
  // focus tahun input di baris terakhir
  const inputs = document.querySelectorAll('#targetTahunTbody input[type="number"]');
  if (inputs.length) inputs[inputs.length - 1].focus();
}

function _removeTargetRow(i) {
  _targetRows.splice(i, 1);
  _renderTargetRows();
}

async function saveIndikator() {
  const groupVal = document.getElementById('indikatorGroup').value;
  // Collect jenis dari checkboxes dinamis
  const jenisChecked = new Set(
    [...document.querySelectorAll('#indikatorJenisWrap input.jenis-cb-input:checked')]
      .map(cb => cb.dataset.kode)
  );
  const body = {
    group_id:          groupVal ? parseInt(groupVal) : null,
    indikator_kinerja: document.getElementById('indikatorNama').value.trim(),
    satuan:            document.getElementById('indikatorSatuan').value.trim(),
    penanggung_jawab:  document.getElementById('indikatorPJ').value.trim() || null,
    bermakna_negatif:  document.getElementById('indikatorNegatif').value === 'negatif',
    jenis_monev:       jenisChecked.has('iku'),
    jenis_ikk:         jenisChecked.has('ikk'),
    jenis_spm:         jenisChecked.has('spm'),
    jenis_custom:      [...jenisChecked].filter(k => !['iku','ikk','spm'].includes(k)),
    formula:           document.getElementById('indikatorFormula').value.trim() || null,
  };
  if (!body.indikator_kinerja || !body.satuan) { toast('Indikator dan satuan wajib diisi', 'error'); return; }

  const id     = _editingIndikatorId;
  const url    = id ? `/api/kinerja/indikator/${id}` : '/api/kinerja/indikator';
  const method = id ? 'PUT' : 'POST';
  try {
    const r = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) { toast(d.error || 'Gagal simpan', 'error'); return; }

    toast(id ? 'Indikator diperbarui' : 'Indikator ditambahkan. Atur target di menu "Kelola Target".');
    closeModal('modalIndikator');
    loadIndikatorAdmin({ keepFilter: true });
  } catch (err) { toast('Error: ' + err.message, 'error'); }
}

async function deleteIndikator(id) {
  const row = _indikatorList.find(r => r.id === id);
  const ok  = await showConfirm({
    title:  'Hapus Indikator',
    msg:    `Indikator "<b>${escHtml(row?.indikator_kinerja || '')}</b>" dan semua data realisasinya akan dihapus permanen.`,
    okText: 'Ya, Hapus', icon: 'trash',
  });
  if (!ok) return;
  await fetch(`/api/kinerja/indikator/${id}`, { method: 'DELETE', headers: authHeaders() });
  toast('Indikator dihapus');
  loadIndikatorAdmin({ keepFilter: true });
}

// ── Helper: toggle warna chip saat checkbox jenis di-klik ────────────────
function _onJenisCbChange(cb) {
  const kode  = cb.dataset.kode;
  const label = _jenisList.find(j => j.kode === kode);
  const chip  = cb.closest('.jenis-chip');
  if (!chip || !label) return;
  if (cb.checked) {
    chip.style.background   = label.warna_bg;
    chip.style.borderColor  = label.warna_teks + '60';
    chip.style.color        = label.warna_teks;
  } else {
    chip.style.background   = '#f8fafc';
    chip.style.borderColor  = '#e2e8f0';
    chip.style.color        = '';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// KELOLA JENIS KINERJA — halaman tersendiri di Master Data
// ═══════════════════════════════════════════════════════════════════════════
let _allJenisList = []; // semua jenis termasuk nonaktif (untuk section kelola jenis)

async function loadKelolaJenis() {
  try {
    const r = await fetch('/api/kinerja/jenis-kinerja', { headers: authHeaders() });
    if (!r.ok) throw new Error('Gagal memuat jenis kinerja');
    const data = await r.json();
    renderKelolJenisSection(data.jenis || data || []);
  } catch (err) {
    const wrap = document.getElementById('kelolJenisSection');
    if (wrap) wrap.innerHTML = `<p style="color:var(--merah);padding:16px">Gagal: ${err.message}</p>`;
  }
}

function renderKelolJenisSection(allJenis) {
  _allJenisList = allJenis;
  const wrap = document.getElementById('kelolJenisSection');
  if (!wrap) return;

  const rows = allJenis.map((j, i) => `
    <tr>
      <td style="text-align:center;color:var(--teks-muted);font-size:.8rem">${i + 1}</td>
      <td>
        <span style="display:inline-flex;align-items:center;font-size:.78rem;font-weight:700;
          color:${j.warna_teks};background:${j.warna_bg};padding:3px 10px;border-radius:6px">
          ${escHtml(j.label)}
        </span>
      </td>
      <td style="font-size:.78rem;color:var(--teks-muted);font-family:monospace">${escHtml(j.kode)}</td>
      <td>${j.deskripsi ? `<span style="font-size:.78rem;color:var(--teks-muted)">${escHtml(j.deskripsi)}</span>` : '—'}</td>
      <td style="text-align:center">
        <span style="font-size:.72rem;font-weight:600;padding:2px 8px;border-radius:5px;
          ${j.aktif ? 'background:#d1fae5;color:#065f46' : 'background:#f1f5f9;color:#94a3b8'}">
          ${j.aktif ? 'Aktif' : 'Nonaktif'}
        </span>
      </td>
      <td style="white-space:nowrap">
        <button class="btn btn-ghost btn-sm" title="Edit" onclick="openJenisModal(${j.id})">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
        </button>
        ${j.is_builtin ? '' : `
        <button class="btn btn-danger btn-sm" title="Hapus" onclick="deleteJenis(${j.id}, '${escHtml(j.label)}')">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path stroke-linecap="round" stroke-linejoin="round" d="M19 6l-1 14H6L5 6"/><path stroke-linecap="round" stroke-linejoin="round" d="M10 11v6m4-6v6"/><path stroke-linecap="round" stroke-linejoin="round" d="M9 6V4h6v2"/></svg>
        </button>`}
      </td>
    </tr>
  `).join('');

  wrap.innerHTML = `
    <div class="page-title" style="display:flex;align-items:center;gap:10px">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:.85"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect width="6" height="4" x="9" y="3" rx="1"/><path d="M9 12h6"/><path d="M9 16h4"/></svg>
      Kelola Jenis Kinerja
    </div>
    <div class="page-subtitle">Tambah atau ubah jenis kinerja yang tersedia di checkbox indikator</div>
    <div style="display:flex;justify-content:flex-end;margin-top:14px;margin-bottom:16px">
      <button class="btn btn-primary btn-sm" onclick="openJenisModal()">
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="margin-right:5px;vertical-align:-2px"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
        Tambah Jenis
      </button>
    </div>
    <div class="card" style="padding:0;overflow:auto;-webkit-overflow-scrolling:touch">
      <table class="kinerja-table">
        <thead>
          <tr>
            <th style="width:36px">No</th>
            <th>Label</th>
            <th style="width:120px">Kode</th>
            <th>Deskripsi</th>
            <th style="width:80px;text-align:center">Status</th>
            <th style="width:90px">Aksi</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr class="empty-row"><td colspan="6">Belum ada jenis kinerja.</td></tr>'}</tbody>
      </table>
    </div>
  `;
}

function openJenisModal(id) {
  _editingJenisId = id || null;
  const j = id ? _allJenisList.find(x => x.id === id) : null;

  document.getElementById('modalJenisTitle').textContent = id ? 'Edit Jenis Kinerja' : 'Tambah Jenis Kinerja';
  document.getElementById('jenisLabel').value      = j?.label      || '';
  document.getElementById('jenisDeskripsi').value  = j?.deskripsi  || '';
  document.getElementById('jenisWarnaBg').value    = j?.warna_bg   || '#e2e8f0';
  document.getElementById('jenisWarnaTeks').value  = j?.warna_teks || '#334155';
  document.getElementById('jenisUrutan').value     = j?.urutan ?? 99;
  document.getElementById('jenisAktif').checked    = j ? j.aktif : true;

  const kodeRow = document.getElementById('jenisKodeRow');
  const kodeEl  = document.getElementById('jenisKodeDisplay');
  if (j) {
    if (kodeRow) kodeRow.style.display = '';
    if (kodeEl)  kodeEl.textContent = j.kode;
  } else {
    if (kodeRow) kodeRow.style.display = 'none';
  }

  const isBuiltin = j?.is_builtin;
  document.getElementById('jenisLabel').disabled     = !!isBuiltin;
  document.getElementById('jenisWarnaBg').disabled   = false;
  document.getElementById('jenisWarnaTeks').disabled = false;

  _updateJenisPreview();
  openModal('modalJenis');
}

function _updateJenisPreview() {
  const label = document.getElementById('jenisLabel').value || 'Label';
  const bg    = document.getElementById('jenisWarnaBg').value    || '#e2e8f0';
  const teks  = document.getElementById('jenisWarnaTeks').value  || '#334155';
  const prev  = document.getElementById('jenisBadgePreview');
  if (prev) {
    prev.textContent   = label;
    prev.style.background = bg;
    prev.style.color      = teks;
  }
}

async function saveJenis() {
  const label     = document.getElementById('jenisLabel').value.trim();
  const deskripsi = document.getElementById('jenisDeskripsi').value.trim();
  const warna_bg  = document.getElementById('jenisWarnaBg').value;
  const warna_teks= document.getElementById('jenisWarnaTeks').value;
  const urutan    = parseInt(document.getElementById('jenisUrutan').value) || 99;
  const aktif     = document.getElementById('jenisAktif').checked;

  if (!label) { toast('Label wajib diisi', 'error'); return; }

  const id     = _editingJenisId;
  const url    = id ? `/api/kinerja/jenis-kinerja/${id}` : '/api/kinerja/jenis-kinerja';
  const method = id ? 'PUT' : 'POST';
  const body   = { label, deskripsi: deskripsi || null, warna_bg, warna_teks, urutan, aktif };

  try {
    const r = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) { toast(d.error || 'Gagal simpan', 'error'); return; }
    toast(id ? 'Jenis diperbarui' : `Jenis "${d.jenis?.label}" ditambahkan`);
    closeModal('modalJenis');
    loadKelolaJenis();
    loadIndikatorAdmin({ keepFilter: true });
  } catch (err) { toast('Error: ' + err.message, 'error'); }
}

async function deleteJenis(id, label) {
  const okAwal = await showConfirm({
    title:  'Hapus Jenis Kinerja',
    msg:    `Jenis "<b>${escHtml(label)}</b>" akan dihapus permanen.`,
    okText: 'Ya, Hapus', okClass: 'btn-danger', icon: 'trash',
  });
  if (!okAwal) return;

  // Pertama cek ke server apakah masih dipakai
  const r = await fetch(`/api/kinerja/jenis-kinerja/${id}`, { method: 'DELETE', headers: authHeaders() });
  const d = await r.json();

  if (r.status === 409 && d.error === 'JENIS_MASIH_DIPAKAI') {
    // Tampilkan dialog konfirmasi dengan daftar indikator yang terpengaruh
    const daftarInd = d.indikator.slice(0, 5).map(x => `• ${escHtml(x.nama)}`).join('<br>');
    const more = d.count > 5 ? `<br><span style="color:var(--teks-muted)">...dan ${d.count - 5} lainnya</span>` : '';
    const ok = await showConfirm({
      title:  `Jenis "${label}" Masih Dipakai`,
      msg:    `Jenis ini masih digunakan oleh <b>${d.count} indikator</b>:<br><br>
               <div style="max-height:120px;overflow:auto;font-size:.83rem;color:var(--teks-muted)">${daftarInd}${more}</div><br>
               Hapus jenis ini akan menghapus keterangan jenis dari semua indikator tersebut. Lanjutkan?`,
      okText: 'Hapus & Bersihkan', okClass: 'btn-danger', icon: 'trash',
    });
    if (!ok) return;
    // Force delete via query param
    const r2 = await fetch(`/api/kinerja/jenis-kinerja/${id}?force=1`, { method: 'DELETE', headers: authHeaders() });
    if (!r2.ok) { toast('Gagal menghapus jenis', 'error'); return; }
    toast(`Jenis "${label}" dihapus`);
    loadKelolaJenis();
    loadIndikatorAdmin({ keepFilter: true });
    return;
  }
  if (!r.ok) { toast(d.error || 'Gagal menghapus', 'error'); return; }
  toast(`Jenis "${label}" dihapus`);
  loadKelolaJenis();
  loadIndikatorAdmin({ keepFilter: true });
}
// ═══════════════════════════════════════════════════════════════════════════
// State: satu objek per indikator, targets = { [tahun]: {id, target, target_display} }
let _ktIndList    = [];   // [{id, indikator_kinerja, satuan, jenis_monev, jenis_ikk, jenis_spm, targets:{tahun:row}}]
let _ktAllTahun   = [];   // sorted list semua tahun yang ada di DB
let _ktTahunDari  = null; // int | null
let _ktTahunSampai= null; // int | null
let _ktSearch     = '';
let _ktFilterJenis= '';
let _ktPage       = 1;
const _ktPageSize = 15;

async function loadKelolaTarget() {
  const container = document.getElementById('ktCardContainer');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;padding:32px;color:var(--teks-muted)">Memuat…</div>';
  try {
    const [ri, rt] = await Promise.all([
      fetch('/api/kinerja/indikator',    { headers: authHeaders() }),
      fetch('/api/kinerja/target?all=1', { headers: authHeaders() }),
    ]);
    const di = await ri.json();
    const dt = await rt.json();
    const indikatorList = di.indikator || [];
    const targetList    = dt.target    || [];

    // Build targetMap per indikator: { indikator_id: { tahun: {id,target,target_display} } }
    const tMap = {};
    for (const t of targetList) {
      if (!tMap[t.indikator_id]) tMap[t.indikator_id] = {};
      tMap[t.indikator_id][t.tahun] = t;
    }

    // Semua tahun yang ada, sorted
    _ktAllTahun = [...new Set(targetList.map(t => t.tahun))].sort((a, b) => a - b);

    // Build _ktIndList
    _ktIndList = indikatorList.map(ind => ({
      id:               ind.id,
      indikator_kinerja: ind.indikator_kinerja,
      satuan:           ind.satuan,
      jenis_monev:      ind.jenis_monev,
      jenis_ikk:        ind.jenis_ikk,
      jenis_spm:        ind.jenis_spm,
      targets:          tMap[ind.id] || {},
    }));

    // Populate Dari / Sampai dropdowns
    const thisYear = new Date().getFullYear();
    const dariEl   = document.getElementById('ktTahunDari');
    const sampaiEl = document.getElementById('ktTahunSampai');
    if (dariEl && sampaiEl && _ktAllTahun.length) {
      const opts = _ktAllTahun.map(y => `<option value="${y}">${y}</option>`).join('');
      dariEl.innerHTML   = opts;
      sampaiEl.innerHTML = opts;
      // Default: tahun berjalan sampai 4 tahun ke depan (atau semua kalau < 4)
      const defDari   = _ktAllTahun.find(y => y >= thisYear) ?? _ktAllTahun[0];
      const defSampai = _ktAllTahun[_ktAllTahun.length - 1];
      dariEl.value   = defDari;
      sampaiEl.value = defSampai;
    }

    _ktPage        = 1;
    _ktSearch      = '';
    _ktFilterJenis = '';
    _ktTahunDari   = dariEl  ? parseInt(dariEl.value)   || null : null;
    _ktTahunSampai = sampaiEl ? parseInt(sampaiEl.value) || null : null;
    const searchEl = document.getElementById('ktSearch');
    if (searchEl) searchEl.value = '';
    const jenisEl = document.getElementById('ktFilterJenis');
    if (jenisEl) jenisEl.value = '';

    renderKelolaTarget();
  } catch (err) {
    if (container) container.innerHTML = `<div style="padding:24px;color:var(--merah)">Gagal: ${err.message}</div>`;
  }
}

function filterKelolaTarget() {
  _ktSearch      = document.getElementById('ktSearch')?.value?.toLowerCase() || '';
  _ktFilterJenis = document.getElementById('ktFilterJenis')?.value || '';
  const dariEl   = document.getElementById('ktTahunDari');
  const sampaiEl = document.getElementById('ktTahunSampai');
  _ktTahunDari   = dariEl   ? parseInt(dariEl.value)   || null : null;
  _ktTahunSampai = sampaiEl ? parseInt(sampaiEl.value) || null : null;
  // Swap kalau terbalik
  if (_ktTahunDari && _ktTahunSampai && _ktTahunDari > _ktTahunSampai) {
    [_ktTahunDari, _ktTahunSampai] = [_ktTahunSampai, _ktTahunDari];
    if (dariEl)   dariEl.value   = _ktTahunDari;
    if (sampaiEl) sampaiEl.value = _ktTahunSampai;
  }
  _ktPage = 1;
  renderKelolaTarget();
}

function renderKelolaTarget() {
  const container = document.getElementById('ktCardContainer');
  if (!container) return;

  // Tentukan kolom tahun yang ditampilkan
  const visibleTahun = _ktAllTahun.filter(y => {
    if (_ktTahunDari   && y < _ktTahunDari)   return false;
    if (_ktTahunSampai && y > _ktTahunSampai) return false;
    return true;
  });

  // Filter indikator
  let filtered = _ktIndList.filter(ind => {
    if (_ktSearch && !ind.indikator_kinerja.toLowerCase().includes(_ktSearch)) return false;
    if (_ktFilterJenis === 'iku' && !ind.jenis_monev) return false;
    if (_ktFilterJenis === 'ikk' && !ind.jenis_ikk)   return false;
    if (_ktFilterJenis === 'spm' && !ind.jenis_spm)   return false;
    return true;
  });

  if (!filtered.length) {
    container.innerHTML = `<div style="text-align:center;padding:40px;color:var(--teks-muted)">Tidak ada indikator.</div>`;
    renderPagination('ktPagination', 0, 1, _ktPageSize, 'goKtPage');
    return;
  }

  const start = (_ktPage - 1) * _ktPageSize;
  const slice = filtered.slice(start, start + _ktPageSize);

  const jenisBadge = ind => [
    ind.jenis_monev ? `<span style="font-size:.67rem;font-weight:700;color:#1e40af;background:#dbeafe;padding:1px 5px;border-radius:4px">IKU</span>` : '',
    ind.jenis_ikk   ? `<span style="font-size:.67rem;font-weight:700;color:#065f46;background:#d1fae5;padding:1px 5px;border-radius:4px">IKK</span>` : '',
    ind.jenis_spm   ? `<span style="font-size:.67rem;font-weight:700;color:#b45309;background:#fef3c7;padding:1px 5px;border-radius:4px">SPM</span>` : '',
  ].filter(Boolean).join(' ') || '<span style="color:var(--teks-muted);font-size:.75rem">—</span>';

  // Header kolom tahun — ikut style .kinerja-table th (var(--hijau), #fff)
  const COL_W = 110; // px per kolom tahun
  const tahunHeaders = visibleTahun.map(y =>
    `<th style="min-width:${COL_W}px;width:${COL_W}px;text-align:center;border-left:1px solid rgba(255,255,255,.15)">${y}</th>`
  ).join('');
  const addColHeader = `<th style="width:80px;text-align:center;border-left:1px solid rgba(255,255,255,.15)">Aksi</th>`;

  const rows = slice.map((ind, i) => {
    const no = start + i + 1;
    const targetCells = visibleTahun.map(y => {
      const t = ind.targets[y];
      const val = t ? (t.target_display != null ? String(t.target_display) : (t.target != null ? String(t.target) : '')) : '';
      if (t) {
        return `<td style="text-align:center;border-left:1px solid var(--abu-1)">
          <input type="text" value="${escHtml(val)}"
            data-tid="${t.id}" data-iid="${ind.id}"
            onchange="saveKtTarget(this)"
            onfocus="this.style.borderColor='var(--hijau)'" onblur="this.style.borderColor=''"
            style="width:82px;text-align:center;padding:4px 6px;border:1.5px solid #e2e8f0;border-radius:6px;font-size:.82rem;font-family:inherit;transition:border-color .15s">
        </td>`;
      } else {
        return `<td style="text-align:center;border-left:1px solid var(--abu-1)">
          <input type="text" value="" placeholder="—"
            data-iid="${ind.id}" data-tahun="${y}"
            onchange="saveKtTargetNew(this)"
            onfocus="this.style.borderColor='var(--hijau)';this.placeholder=''" onblur="this.style.borderColor='';this.placeholder='—'"
            style="width:82px;text-align:center;padding:4px 6px;border:1.5px dashed #d1d5db;border-radius:6px;font-size:.82rem;font-family:inherit;color:#94a3b8;background:#f8fafc;transition:border-color .15s">
        </td>`;
      }
    }).join('');

    const hasAnyTarget = Object.keys(ind.targets).length > 0;
    const addCell = `<td style="text-align:center;border-left:1px solid var(--abu-1)">
      <div style="display:inline-flex;align-items:center;gap:6px">
        <button class="btn btn-ghost btn-sm" title="Tambah tahun lain" onclick="openKtAddTarget(${ind.id})"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg></button>
        <button class="btn btn-danger btn-sm" title="Hapus target" ${!hasAnyTarget ? 'disabled' : ''} onclick="openKtDeleteTarget(${ind.id})"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path stroke-linecap="round" stroke-linejoin="round" d="M19 6l-1 14H6L5 6"/><path stroke-linecap="round" stroke-linejoin="round" d="M10 11v6m4-6v6"/><path stroke-linecap="round" stroke-linejoin="round" d="M9 6V4h6v2"/></svg></button>
      </div>
    </td>`;

    return `<tr>
      <td style="text-align:center;color:var(--teks-muted)">${no}</td>
      <td>
        <div style="font-weight:600;line-height:1.3">${escHtml(ind.indikator_kinerja)}</div>
        <div style="margin-top:3px;display:flex;align-items:center;gap:5px">
          <span style="font-size:.74rem;color:var(--teks-muted)">${escHtml(ind.satuan)}</span>
          <span style="color:#e2e8f0">·</span>
          ${jenisBadge(ind)}
        </div>
      </td>
      ${targetCells}
      ${addCell}
    </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="kinerja-table-wrap card" style="padding:0">
      <table class="kinerja-table">
        <thead>
          <tr>
            <th style="width:44px;text-align:center">No</th>
            <th style="min-width:260px">Indikator Kinerja</th>
            ${tahunHeaders}
            ${addColHeader}
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="99" style="text-align:center;padding:24px;color:var(--teks-muted)">Tidak ada data.</td></tr>'}</tbody>
      </table>
    </div>`;

  renderPagination('ktPagination', filtered.length, _ktPage, _ktPageSize, 'goKtPage');
}

window.goKtPage = (p) => { _ktPage = p; renderKelolaTarget(); };

async function saveKtTarget(input) {
  const tid  = parseInt(input.dataset.tid);
  const iid  = parseInt(input.dataset.iid);
  const val  = input.value.trim();
  const tNum = parseFloat(val.replace(/[^0-9.\-]/g, ''));
  try {
    const r = await fetch(`/api/kinerja/target/${tid}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ target: isNaN(tNum) ? null : tNum, target_display: val || null }),
    });
    if (!r.ok) { toast('Gagal simpan target', 'error'); input.style.borderColor = 'var(--merah)'; return; }
    toast('Target diperbarui');
    input.style.borderColor = '#0d9488';
    setTimeout(() => { input.style.borderColor = ''; }, 1200);
    // Update cache
    const ind = _ktIndList.find(x => x.id === iid);
    if (ind) {
      const t = Object.values(ind.targets).find(x => x.id === tid);
      if (t) { t.target = isNaN(tNum) ? null : tNum; t.target_display = val || null; }
    }
    if (_targetMap[iid]) {
      const t = _targetMap[iid].find(x => x.id === tid);
      if (t) { t.target = isNaN(tNum) ? null : tNum; t.target_display = val || null; }
    }
  } catch (err) { toast('Error: ' + err.message, 'error'); }
}

async function saveKtTargetNew(input) {
  const iid   = parseInt(input.dataset.iid);
  const tahun = parseInt(input.dataset.tahun);
  const val   = input.value.trim();
  if (!val) return; // ignore jika kosong
  const tNum  = parseFloat(val.replace(/[^0-9.\-]/g, ''));
  try {
    const r = await fetch('/api/kinerja/target', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ indikator_id: iid, tahun, target: isNaN(tNum) ? null : tNum, target_display: val || null }),
    });
    const d = await r.json();
    if (!r.ok) { toast('Gagal simpan target', 'error'); return; }
    toast('Target disimpan');

    const newRow = { ...d.target, target: d.target?.target != null ? parseFloat(d.target.target) : null };

    // Update cache _ktIndList
    const ind = _ktIndList.find(x => x.id === iid);
    if (ind) ind.targets[tahun] = newRow;

    // Update cache _targetMap
    if (!_targetMap[iid]) _targetMap[iid] = [];
    const existing = _targetMap[iid].find(x => x.tahun === tahun);
    if (existing) Object.assign(existing, newRow);
    else _targetMap[iid].push(newRow);

    // Tambahkan kolom tahun baru jika belum ada
    if (!_ktAllTahun.includes(tahun)) {
      _ktAllTahun = [..._ktAllTahun, tahun].sort((a, b) => a - b);
      const opts = _ktAllTahun.map(y => `<option value="${y}">${y}</option>`).join('');
      const dariEl   = document.getElementById('ktTahunDari');
      const sampaiEl = document.getElementById('ktTahunSampai');
      if (dariEl)   { const v = dariEl.value;   dariEl.innerHTML   = opts; dariEl.value   = v; }
      if (sampaiEl) { const v = sampaiEl.value; sampaiEl.innerHTML = opts; sampaiEl.value = v; }
    }

    renderKelolaTarget();
  } catch (err) { toast('Error: ' + err.message, 'error'); }
}

function openKtDeleteTarget(iid) {
  const ind = _ktIndList.find(r => r.id === iid);
  if (!ind) return;
  const tahunList = Object.keys(ind.targets).map(Number).sort((a, b) => a - b);
  if (!tahunList.length) return;

  document.getElementById('ktDeleteTargetIndId').value = iid;
  const sub = document.getElementById('modalKtDeleteTargetSubtitle');
  if (sub) sub.textContent = ind.indikator_kinerja;

  const list = document.getElementById('ktDeleteTargetList');
  if (list) {
    list.innerHTML = tahunList.map(y => {
      const t = ind.targets[y];
      const val = t.target_display != null ? String(t.target_display) : (t.target != null ? String(t.target) : '—');
      return `<label style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;border:1.5px solid #e2e8f0;border-radius:6px;cursor:pointer;font-size:.85rem">
        <span style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" class="ktDelYear" value="${t.id}" data-tahun="${y}" style="width:15px;height:15px;accent-color:var(--merah);cursor:pointer">
          <span style="font-weight:600">${y}</span>
        </span>
        <span style="color:var(--teks-muted)">${escHtml(val)}</span>
      </label>`;
    }).join('');
  }
  const all = document.getElementById('ktDeleteTargetAll');
  if (all) all.checked = false;

  openModal('modalKtDeleteTarget');
}

function toggleKtDeleteTargetAll(checked) {
  document.querySelectorAll('.ktDelYear').forEach(cb => { cb.checked = checked; });
}

async function saveKtDeleteTarget() {
  const iid = parseInt(document.getElementById('ktDeleteTargetIndId').value);
  const checked = [...document.querySelectorAll('.ktDelYear:checked')];
  if (!checked.length) { toast('Pilih minimal 1 tahun', 'error'); return; }

  const ind = _ktIndList.find(r => r.id === iid);
  const tahunStr = checked.map(cb => cb.dataset.tahun).join(', ');
  const ok = await showConfirm({
    title: 'Hapus Target',
    msg: `Hapus target tahun <b>${tahunStr}</b> untuk <b>${escHtml(ind?.indikator_kinerja || '')}</b>?`,
    okText: 'Ya, Hapus', icon: 'trash',
  });
  if (!ok) return;

  await Promise.all(checked.map(cb => fetch(`/api/kinerja/target/${cb.value}`, { method: 'DELETE', headers: authHeaders() })));
  toast(`${checked.length} target dihapus`);
  closeModal('modalKtDeleteTarget');
  loadKelolaTarget();
}

function openKtAddTarget(indikatorId) {
  const ind  = _ktIndList.find(r => r.id === indikatorId);
  const nama = ind?.indikator_kinerja || '';
  document.getElementById('ktAddTargetIndId').value      = indikatorId;
  document.getElementById('ktAddTargetTahun').value      = '';
  document.getElementById('ktAddTargetVal').value        = '';
  const sub = document.getElementById('modalKtAddTargetSubtitle');
  if (sub) sub.textContent = nama;
  openModal('modalKtAddTarget');
  setTimeout(() => document.getElementById('ktAddTargetTahun')?.focus(), 100);
}

async function saveKtAddTarget() {
  const iid   = parseInt(document.getElementById('ktAddTargetIndId').value);
  const tahun = parseInt(document.getElementById('ktAddTargetTahun').value);
  const val   = document.getElementById('ktAddTargetVal').value.trim();
  if (!tahun || tahun < 2000 || tahun > 2100) { toast('Tahun tidak valid', 'error'); return; }
  if (!val) { toast('Target wajib diisi', 'error'); return; }
  const tNum = parseFloat(val.replace(/[^0-9.\-]/g, ''));
  try {
    const r = await fetch('/api/kinerja/target', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ indikator_id: iid, tahun, target: isNaN(tNum) ? null : tNum, target_display: val }),
    });
    const d = await r.json();
    if (!r.ok) { toast(d.error || 'Gagal tambah target', 'error'); return; }
    toast('Target ditambahkan');
    closeModal('modalKtAddTarget');
    loadKelolaTarget();
  } catch (err) { toast('Error: ' + err.message, 'error'); }
}

// Tombol "Kelola Target" di modal indikator → tutup modal, navigasi ke kelola-target, filter by indikator
function _goKelolaTarget() {
  const id = _editingIndikatorId;
  closeModal('modalIndikator');
  navigateTo('kelola-target', 'Kelola Target', loadKelolaTarget);
  if (id) {
    setTimeout(() => {
      const ind = _indikatorList.find(r => r.id === id);
      if (ind) {
        const el = document.getElementById('ktSearch');
        if (el) { el.value = ind.indikator_kinerja; filterKelolaTarget(); }
      }
    }, 400);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DATA DUKUNG KINERJA — MULTI-FILE
// ═══════════════════════════════════════════════════════════════════════════
let _dukungState = { indikatorId: null, tw: null, tahun: null, files: [] };

// Tombol Upload (belum ada file) → langsung buka file picker, tanpa modal
function triggerDukungUpload(indikatorId, tw, tahun, source) {
  const dataArr = source === 'ikk' ? _ikkData : source === 'spm' ? _spmData : _kinerjaData;
  const row = dataArr.find(r => r.id === indikatorId);
  // Inisialisasi state dengan file yang sudah ada (jika ada)
  let existingFiles = [];
  if (row?.data_dukung_url) {
    try {
      const p = JSON.parse(row.data_dukung_url);
      existingFiles = Array.isArray(p) ? p.filter(f => f && f.url) : [{ url: row.data_dukung_url, name: row.data_dukung_nama || 'Dokumen' }];
    } catch { existingFiles = [{ url: row.data_dukung_url, name: row.data_dukung_nama || 'Dokumen' }]; }
  }
  _dukungState = { indikatorId, tw, tahun, files: existingFiles, _source: source, _autoSave: true };

  // Reset & trigger file input langsung
  const fi = document.getElementById('dukungFileInput');
  if (!fi) return;
  fi.value = '';
  fi.click();
}

async function openDukungModal(indikatorId, tw, tahun) {
  _dukungState = { indikatorId, tw, tahun, files: [] };

  // Reset UI
  const area = document.getElementById('dukungUploadArea');
  const fi   = document.getElementById('dukungFileInput');
  const pw   = document.getElementById('dukungProgressWrap');
  if (area) { area.classList.remove('drag-over'); area.style.display = ''; }
  if (fi)   fi.value = '';
  if (pw)   pw.style.display = 'none';

  // Load existing files (format JSON array atau single URL lama)
  const row = _kinerjaData.find(r => r.id === indikatorId);
  document.getElementById('dukungIndikatorLabel').textContent = row?.indikator_kinerja || '';
  document.getElementById('dukungTwLabel').textContent = `TW ${['','I','II','III','IV'][tw]} ${tahun}`;

  if (row?.data_dukung_url) {
    try {
      const parsed = JSON.parse(row.data_dukung_url);
      _dukungState.files = Array.isArray(parsed) ? parsed.filter(f => f && f.url) : [];
    } catch {
      _dukungState.files = [{ url: row.data_dukung_url, name: row.data_dukung_nama || 'Dokumen' }];
    }
  }
  _renderDukungList();
  openModal('modalDukung');
}

// Preview-only — selalu buka docPreviewPanel dengan navigasi multi-file
function openDukungPreview(indikatorId, tw, tahun, source) {
  const data = source === 'ikk' ? _ikkData : _kinerjaData;
  const row  = data.find(r => r.id === indikatorId);
  if (!row) return;

  let files = [];
  try {
    const parsed = JSON.parse(row.data_dukung_url);
    files = Array.isArray(parsed) ? parsed.filter(f => f && f.url) : [];
  } catch {
    if (row.data_dukung_url) files = [{ url: row.data_dukung_url, name: row.data_dukung_nama || 'Dokumen' }];
  }
  if (!files.length) return;

  const periodeLabel = `Data Dukung — ${row.indikator_kinerja || ''}`;
  viewDocMulti(files, 0, periodeLabel);
}

function _renderDukungList() {
  const container = document.getElementById('dukungFilePreview');
  if (!container) return;
  if (!_dukungState.files.length) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = `
    <div class="multi-file-list" style="margin-top:10px">
      ${_dukungState.files.map((f, idx) => {
        const ext = (f.name||'').split('.').pop().toLowerCase();
        const iconColor = { pdf:'#ef4444', doc:'#3b82f6', docx:'#3b82f6', xls:'#22c55e', xlsx:'#22c55e', jpg:'#f59e0b', jpeg:'#f59e0b', png:'#f59e0b' }[ext] || '#64748b';
        const isImg = ['jpg','jpeg','png','gif','webp'].includes(ext);
        return `
          <div class="multi-file-card">
            ${isImg && f.url
              ? `<div class="mfc-thumb" style="background-image:url('${escHtml(f.url)}')"></div>`
              : `<div class="mfc-icon" style="background:${iconColor}"><span>${ext.toUpperCase()}</span></div>`
            }
            <div class="mfc-info">
              <div class="mfc-name" title="${escHtml(f.name)}">${f._loading ? '<em>Mengupload...</em>' : escHtml(f.name)}</div>
            </div>
            <div class="mfc-actions">
              ${f.url && !f._loading ? `<button type="button" class="btn btn-ghost btn-sm" title="Preview" onclick="viewDoc(decodeURIComponent('${encodeURIComponent(f.url)}'), decodeURIComponent('${encodeURIComponent(f.name || "")}'))">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
              </button>` : ''}
              ${!f._loading ? `<button type="button" class="btn btn-ghost btn-sm" title="Hapus" onclick="_removeDukungFile(${idx})">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>` : ''}
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

function handleDukungFileSelect(e) {
  Array.from(e.target.files || []).forEach(f => _processDukungFile(f));
  e.target.value = '';
}
function handleDukungDragOver(e) { e.preventDefault(); document.getElementById('dukungUploadArea')?.classList.add('drag-over'); }
function handleDukungDragLeave(e) { document.getElementById('dukungUploadArea')?.classList.remove('drag-over'); }
function handleDukungDrop(e) {
  e.preventDefault();
  document.getElementById('dukungUploadArea')?.classList.remove('drag-over');
  Array.from(e.dataTransfer?.files || []).forEach(f => _processDukungFile(f));
}

async function _processDukungFile(file) {
  if (file.size > 2 * 1024 * 1024) { toast(`${file.name}: terlalu besar (maks. 2 MB)`, 'error'); return; }

  const isAutoSave = _dukungState._autoSave;
  const { indikatorId, _source } = _dukungState;

  // Jika mode autoSave (dipanggil dari tombol tabel langsung), tunjukkan status di tombol tabel
  if (isAutoSave) {
    const dataArr = _source === 'ikk' ? _ikkData : _kinerjaData;
    const rowIdx  = dataArr.findIndex(r => r.id === indikatorId);
    // Cari td kolom data dukung — tombol ada di sana
    const tr = document.querySelector(`[data-id="${indikatorId}"]`);
    const dukungTd = tr?.querySelector('td[data-col="dukung"]');
    if (dukungTd) {
      dukungTd.innerHTML = `<button disabled style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:6px;border:none;font-size:.75rem;font-weight:600;font-family:inherit;background:#fef3c7;color:#92400e">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="animation:spin .8s linear infinite"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
        Mengupload...
      </button>`;
    }
  }

  // Tambah placeholder loading (untuk modal jika terbuka)
  const idx = _dukungState.files.length;
  _dukungState.files.push({ url: null, name: file.name, _loading: true });
  if (!isAutoSave) _renderDukungList();

  const pw = document.getElementById('dukungProgressWrap');
  const pb = document.getElementById('dukungProgressBar');
  if (!isAutoSave && pw) pw.style.display = '';
  if (!isAutoSave && pb) pb.style.width = '30%';

  try {
    const fd = new FormData();
    fd.append('file', file);
    const r = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Authorization': authHeaders()['Authorization'] },
      body: fd,
    });
    if (!isAutoSave && pb) pb.style.width = '90%';
    if (!r.ok) { const d = await r.json().catch(()=>({})); throw new Error(d.error || 'Gagal upload'); }
    const d = await r.json();
    if (!isAutoSave && pb) { pb.style.width = '100%'; setTimeout(() => { if (pw) pw.style.display = 'none'; }, 600); }
    _dukungState.files[idx] = { url: d.url, name: d.name || file.name };
    if (!isAutoSave) {
      _renderDukungList();
      toast(`${file.name} berhasil diupload`);
    } else {
      // Auto-save hanya setelah SEMUA file selesai upload (cegah toast berganda)
      const stillLoading = _dukungState.files.some(f => f._loading);
      if (!stillLoading) await _autoSaveDukung();
    }
  } catch (err) {
    if (!isAutoSave && pw) pw.style.display = 'none';
    _dukungState.files.splice(idx, 1);
    if (!isAutoSave) _renderDukungList();
    else {
      // Kembalikan tombol Upload jika gagal
      const dataArr = _source === 'ikk' ? _ikkData : _kinerjaData;
      const source  = _source;
      const { tw, tahun } = _dukungState;
      const rowObj  = dataArr.find(r => r.id === indikatorId);
      const tr = document.querySelector(`[data-id="${indikatorId}"]`);
      const dukungTd = tr?.querySelector('td[data-col="dukung"]');
      if (dukungTd && rowObj) dukungTd.innerHTML = _renderDukungBtn(rowObj, tw, tahun, source, !rowObj.realisasi_id);
    }
    toast(err.message || 'Gagal upload', 'error');
  }
}

// Simpan data dukung ke API tanpa buka modal (dipanggil setelah upload sukses di mode autoSave)
async function _autoSaveDukung() {
  const { indikatorId, tw, tahun, files, _source } = _dukungState;
  const doneFiles = files.filter(f => f.url && !f._loading);
  const urlJson   = doneFiles.length ? JSON.stringify(doneFiles) : null;
  const nameStr   = doneFiles.length ? doneFiles.map(f => f.name).join(', ') : null;
  try {
    const r = await fetch('/api/kinerja/realisasi', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ indikator_id: indikatorId, bulan: tw, tahun, data_dukung_url: urlJson, data_dukung_nama: nameStr }),
    });
    const d = await r.json();
    if (!r.ok) { toast(d.error || 'Gagal menyimpan', 'error'); return; }
    toast('Data dukung tersimpan');
    // Update cache & re-render baris
    const dataArr = _source === 'ikk' ? _ikkData : _source === 'spm' ? _spmData : _kinerjaData;
    const rowIdx  = dataArr.findIndex(x => x.id === indikatorId);
    if (rowIdx >= 0) {
      dataArr[rowIdx].data_dukung_url  = urlJson;
      dataArr[rowIdx].data_dukung_nama = nameStr;
    }
    // Re-render hanya tombol di baris yang bersangkutan
    const tr = document.querySelector(`[data-id="${indikatorId}"]`);
    const dukungTd = tr?.querySelector('td[data-col="dukung"]');
    if (dukungTd && rowIdx >= 0) {
      dukungTd.innerHTML = _renderDukungBtn(dataArr[rowIdx], tw, tahun, _source, !dataArr[rowIdx].realisasi_id);
    }
    // Refresh status tombol Simpan (data dukung sudah ada)
    if (_source === 'spm') _updateSpmSaveBtnState(indikatorId);
    else if (_source === 'ikk') _updateIkkSaveBtnState(indikatorId);
    else _updateSaveBtnState(indikatorId);
  } catch { toast('Gagal menyimpan data dukung', 'error'); }
}

async function deleteDukungAll(indikatorId, tw, tahun, source) {
  const ok = await showConfirm({
    title:  'Hapus Data Dukung',
    msg:    'Semua file data dukung untuk indikator ini akan dihapus permanen.',
    okText: 'Ya, Hapus', icon: 'trash',
  });
  if (!ok) return;
  try {
    const r = await fetch('/api/kinerja/realisasi', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({
        indikator_id: indikatorId, bulan: tw, tahun,
        data_dukung_url: null, data_dukung_nama: null,
        clear_data_dukung: true,
      }),
    });
    const d = await r.json();
    if (!r.ok) { toast(d.error || 'Gagal menghapus', 'error'); return; }
    toast('Data dukung dihapus');
    const dataArr = source === 'ikk' ? _ikkData : source === 'spm' ? _spmData : _kinerjaData;
    const rowIdx  = dataArr.findIndex(x => x.id === indikatorId);
    if (rowIdx >= 0) {
      dataArr[rowIdx].data_dukung_url  = null;
      dataArr[rowIdx].data_dukung_nama = null;
    }
    // Re-render tombol di baris
    const tr = document.querySelector(`[data-id="${indikatorId}"]`);
    const dukungTd = tr?.querySelector('td[data-col="dukung"]');
    if (dukungTd && rowIdx >= 0) {
      dukungTd.innerHTML = _renderDukungBtn(dataArr[rowIdx], tw, tahun, source, !dataArr[rowIdx].realisasi_id);
      // Tetap unlock tombol Upload karena masih dalam mode edit
      const uploadBtn = dukungTd.querySelector('.dukung-upload-btn');
      if (uploadBtn) {
        uploadBtn.disabled = false;
        uploadBtn.style.cursor = 'pointer';
        uploadBtn.style.opacity = '1';
        uploadBtn.style.borderStyle = 'solid';
        uploadBtn.title = 'Upload file data dukung';
        uploadBtn.onclick = () => triggerDukungUpload(indikatorId, tw, tahun, source);
      }
    }
    // Data dukung dihapus → Simpan harus ke-disable kembali
    if (source === 'spm') _updateSpmSaveBtnState(indikatorId);
    else if (source === 'ikk') _updateIkkSaveBtnState(indikatorId);
    else _updateSaveBtnState(indikatorId);
  } catch (err) { toast('Error: ' + err.message, 'error'); }
}

function _removeDukungFile(idx) {
  _dukungState.files.splice(idx, 1);
  _renderDukungList();
  toast('File dihapus');
}

async function saveDukung() {
  const { indikatorId, tw, tahun, files, _source } = _dukungState;
  const doneFiles = files.filter(f => f.url && !f._loading);
  const urlJson  = doneFiles.length ? JSON.stringify(doneFiles) : null;
  const nameStr  = doneFiles.length ? doneFiles.map(f => f.name).join(', ') : null;
  try {
    const r = await fetch('/api/kinerja/realisasi', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({
        indikator_id: indikatorId, bulan: tw, tahun,
        data_dukung_url:  urlJson,
        data_dukung_nama: nameStr,
      }),
    });
    const d = await r.json();
    if (!r.ok) { toast(d.error || 'Gagal menyimpan', 'error'); return; }
    toast('Data dukung tersimpan');
    // Update cache sesuai sumber
    const dataArr = _source === 'ikk' ? _ikkData : _kinerjaData;
    const renderFn = _source === 'ikk'
      ? () => _renderIkkTable(document.getElementById('ikkTableBody'))
      : () => renderKinerjaTable(document.getElementById('kinerjaTableBody'));
    const idx = dataArr.findIndex(x => x.id === indikatorId);
    if (idx >= 0) {
      dataArr[idx].data_dukung_url  = urlJson;
      dataArr[idx].data_dukung_nama = nameStr;
    }
    closeModal('modalDukung');
    renderFn();
  } catch { toast('Gagal menyimpan data dukung', 'error'); }
}
// ═══════════════════════════════════════════════════════════════════════════
// REALISASI IKK — halaman terpisah, logika mirip Monev Kinerja
// ═══════════════════════════════════════════════════════════════════════════
async function initIkkControls() {
  // Pastikan _periodeListTerbuka sudah terisi (bisa jadi initKinerjaControls belum dipanggil)
  if (!_periodeListTerbuka.length) {
    try {
      const r = await fetch('/api/periode/aktif');
      if (r.ok) {
        const d = await r.json();
        _periodeListTerbuka = d.periode || [];
      }
    } catch { _periodeListTerbuka = []; }
  }
  await _ensureUserIndikatorIds();
  // Admin: pastikan _allPeriodeList sudah terisi
  if (_user?.is_admin && !_allPeriodeList.length) {
    try {
      const r = await fetch('/api/periode', { headers: authHeaders() });
      if (r.ok) {
        const d = await r.json();
        _allPeriodeList = d.periode || [];
      }
    } catch {}
  }
  // Set bulan & tahun IKK ke periode pertama yang terbuka (jika ada)
  const _ikkTerbuka = _periodeListTerbuka.filter(p => p.jenis === 'ikk')
    .sort((a, b) => a.tahun !== b.tahun ? a.tahun - b.tahun : a.bulan - b.bulan);
  if (_ikkTerbuka.length) {
    _ikk_tahun = _ikkTerbuka[0].tahun;
    _ikk_bulan = _ikkTerbuka[0].bulan;
  } else if (_user?.is_admin) {
    // Admin: default ke tahun & bulan sekarang
    _ikk_tahun = new Date().getFullYear();
    _ikk_bulan = new Date().getMonth() + 1;
  }
  // Admin: populate tahun selector IKK
  if (_user?.is_admin) {
    _populateTahunSelector('ikkTahunSelect', _ikk_tahun, setIkkTahun);
  }
  _syncIkkBulanButtons();
  _renderIkkPeriodeInfo();
  _renderKinerjaCountdown('ikkCountdownBar', 'ikk');
}

function _syncIkkBulanButtons() {
  // Gunakan daftar semua bulan terbuka (sama seperti Monev) — bukan hanya 1 periode pertama
  const bulanTerbuka = new Set(_periodeListTerbuka.filter(p => p.jenis === 'ikk').map(p => p.bulan));
  const bulanAdaDiTahun = new Set(_allPeriodeList.filter(p => p.tahun === _ikk_tahun).map(p => p.bulan));
  document.querySelectorAll('#ikkBulanSelector .bulan-btn').forEach(b => {
    const bulan = parseInt(b.dataset.bulan);
    let isTampil, isEnabled;
    if (_user?.is_admin) {
      // Admin: tampilkan dan aktifkan semua 12 bulan tanpa pembatasan
      isTampil  = true;
      isEnabled = true;
    } else {
      isTampil  = bulanTerbuka.has(bulan);
      isEnabled = true;
    }
    b.style.display  = isTampil ? '' : 'none';
    b.disabled       = !isEnabled;
    b.style.opacity  = isEnabled ? '' : '0.4';
    b.style.cursor   = isEnabled ? '' : 'not-allowed';
    b.classList.toggle('active', bulan === _ikk_bulan);
    b.title = '';
    // Tampilkan label "NamaBulan Tahun" sesuai periode yang cocok
    const periodeMatch = _user?.is_admin
      ? _allPeriodeList.find(p => p.jenis === 'ikk' && p.bulan === bulan && p.tahun === _ikk_tahun)
      : _periodeListTerbuka.find(p => p.jenis === 'ikk' && p.bulan === bulan);
    const tahunLabel = periodeMatch ? periodeMatch.tahun : _ikk_tahun;
    b.textContent = `${BULAN_FULL[bulan]} ${tahunLabel}`;
  });

  // Reorder tombol di DOM: tahun ASC, bulan ASC
  const _ikkSelector = document.getElementById('ikkBulanSelector');
  if (_ikkSelector) {
    const _ikkBtns = [..._ikkSelector.querySelectorAll('.bulan-btn')];
    _ikkBtns.sort((a, b) => {
      if (_user?.is_admin) {
        // Admin: semua 12 bulan tampil, cukup urut nomor bulan
        return parseInt(a.dataset.bulan) - parseInt(b.dataset.bulan);
      }
      const pa = _periodeListTerbuka.find(p => p.jenis === 'ikk' && p.bulan === parseInt(a.dataset.bulan));
      const pb = _periodeListTerbuka.find(p => p.jenis === 'ikk' && p.bulan === parseInt(b.dataset.bulan));
      const ta = pa ? pa.tahun * 100 + pa.bulan : parseInt(a.dataset.bulan);
      const tb = pb ? pb.tahun * 100 + pb.bulan : parseInt(b.dataset.bulan);
      return ta - tb;
    });
    _ikkBtns.forEach(b => _ikkSelector.appendChild(b));
  }
}

function _renderIkkPeriodeInfo() {
  const el = document.getElementById('ikkActivePeriodeInfo');
  const iWrapper = document.getElementById('ikkBulanWrapper');

  // Admin: sembunyikan badge periode, cukup pakai dropdown tahun
  if (_user?.is_admin) {
    if (el) el.style.display = 'none';
    if (iWrapper) iWrapper.style.display = '';
    return;
  }

  if (!el) return;

  // Non-admin: sembunyikan wrapper kalau tidak ada periode ikk aktif
  const _ikkAktif = _periodeListTerbuka.filter(p => p.jenis === 'ikk');
  if (_ikkAktif.length === 0) {
    el.style.display = 'none';
    if (iWrapper) iWrapper.style.display = 'none';
    return;
  }
  if (iWrapper) iWrapper.style.display = '';

  const svgEl = el.querySelector('svg');
  el.innerHTML = '';
  if (svgEl) el.appendChild(svgEl);

  // Group bulan per tahun, sort tahun ASC, bulan ASC
  const tahunMap = {};
  for (const p of _ikkAktif) {
    if (!tahunMap[p.tahun]) tahunMap[p.tahun] = [];
    tahunMap[p.tahun].push(p.bulan);
  }
  const periodeStr = Object.keys(tahunMap)
    .sort((a, b) => a - b)
    .map(t => {
      const bulanStr = tahunMap[t].sort((a, b) => a - b).map(b => BULAN_FULL[b]).join(', ');
      return `${bulanStr} ${t}`;
    })
    .join(' · ');
  el.appendChild(document.createTextNode(`Periode input: ${periodeStr}`));
  el.style.display = '';
}

function setIkkBulan(bulan) {
  // Guard: non-admin tidak bisa pilih bulan yang tidak ada dalam daftar terbuka
  if (!_user?.is_admin) {
    const bulanTerbuka = new Set(_periodeListTerbuka.filter(p => p.jenis === 'ikk').map(p => p.bulan));
    if (!bulanTerbuka.has(bulan)) return;
    // Sync tahun ke periode IKK yang sesuai bulan yang dipilih
    const periodeMatch = _periodeListTerbuka.find(p => p.jenis === 'ikk' && p.bulan === bulan);
    if (periodeMatch) _ikk_tahun = periodeMatch.tahun;
  }
  _ikk_bulan = bulan;
  _syncIkkBulanButtons();
  _renderIkkPeriodeInfo();
  _renderKinerjaCountdown('ikkCountdownBar', 'ikk');
  loadIkkRekap();
}

async function loadIkkRekap() {
  const tbody = document.getElementById('ikkTableBody');
  if (!tbody) return;

  // Guard: non-admin tidak perlu lihat tabel kalau tidak ada periode aktif sama sekali
  if (!_user?.is_admin && !_periodeListTerbuka.some(p => p.jenis === 'ikk')) {
    // Sembunyikan card tabel, tampilkan pesan di luarnya
    const tableCard = tbody.closest('.card');
    if (tableCard) tableCard.style.display = 'none';
    let msgEl = document.getElementById('ikkNoperiodeMsg');
    if (!msgEl) {
      msgEl = document.createElement('div');
      msgEl.id = 'ikkNoperiodeMsg';
      tableCard ? tableCard.parentNode.insertBefore(msgEl, tableCard) : tbody.parentNode.insertBefore(msgEl, tbody.parentNode.firstChild);
    }
    msgEl.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:48px 20px;color:#94a3b8;background:#fff;border-radius:12px;border:1.5px solid #f1f5f9">
        <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.2" opacity=".35">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
        </svg>
        <div style="font-size:.95rem;font-weight:600;color:#64748b">Belum ada periode input yang aktif</div>
        <div style="font-size:.82rem;color:#94a3b8;text-align:center">Input data kinerja belum dapat dilakukan.<br>Hubungi Admin untuk membuka periode pengisian.</div>
      </div>`;
    msgEl.style.display = '';
    return;
  }
  // Kalau ada periode aktif, pastikan card & pesan kembali normal
  const _tableCard = tbody.closest('.card');
  if (_tableCard) _tableCard.style.display = '';
  const _msgEl = document.getElementById('ikkNoperiodeMsg');
  if (_msgEl) _msgEl.style.display = 'none';

  tbody.innerHTML = `<tr class="empty-row"><td colspan="11">Memuat data...</td></tr>`;
  try {
    const r = await fetch(`/api/kinerja/rekap?bulan=${_ikk_bulan}&tahun=${_ikk_tahun}&jenis=ikk`, { headers: authHeaders() });
    const d = await r.json();
    if (!r.ok) { tbody.innerHTML = `<tr class="empty-row"><td colspan="11">${d.error || 'Gagal memuat'}</td></tr>`; return; }
    let rekap = d.rekap || [];

    // Filter per assigned indikator user (non-admin hanya lihat indikator yg di-assign)
    if (!_user?.is_admin) {
      if (_userIndikatorIds && _userIndikatorIds.size > 0) {
        rekap = rekap.filter(row => _userIndikatorIds.has(Number(row.id)));
      } else {
        rekap = [];
      }
    }
    _ikkData = rekap;
    _ikkPage = 1;
    _renderIkkTable(tbody);
  } catch (err) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="11">Error: ${err.message}</td></tr>`;
  }
}

function _renderIkkTable(tbody) {
  if (!_ikkData.length) {
    let emptyMsg = 'Belum ada indikator IKK aktif. Admin perlu menambahkan indikator dengan jenis IKK.';
    if (!_user?.is_admin) {
      if (!_userIndikatorIds || _userIndikatorIds.size === 0) {
        emptyMsg = 'Belum ada indikator yang di-assign ke akun Anda. Hubungi Admin untuk mengatur assignment indikator.';
      } else {
        emptyMsg = 'Tidak ada indikator IKK yang di-assign ke akun Anda pada periode ini.';
      }
    }
    tbody.innerHTML = `<tr class="empty-row"><td colspan="11">${emptyMsg}</td></tr>`;
    return;
  }
  const canEdit = _isIkkInputOpen();
  let html = '';
  let lastGroupId = null;
  let no = 0;

  const _ikkStart = (_ikkPage - 1) * _ikkPageSize;
  const _ikkRows  = _ikkData.slice(_ikkStart, _ikkStart + _ikkPageSize);

  _ikkRows.forEach(row => {
    if (row.group_id !== lastGroupId) {
      lastGroupId = row.group_id;
      if (row.group_nama) {
        const meta = JENIS_META[row.group_jenis] || { label: row.group_jenis, cls: 'group-sasaran' };
        html += `
          <tr class="group-header-row ${meta.cls}">
            <td colspan="11">
              <span class="group-jenis-badge">${escHtml(meta.label)}</span>
              ${escHtml(row.group_nama)}
            </td>
          </tr>`;
      }
    }

    no++;
    const capaian = (row.realisasi_id && row.capaian_persen != null) ? Number(row.capaian_persen) : null;
    let badgeClass = 'na', badgeText = '—';
    if (capaian !== null && !isNaN(capaian)) {
      badgeText = capaian.toFixed(1) + '%';
      badgeClass = capaian >= 91 ? 'st' : capaian >= 76 ? 'ti' : capaian >= 66 ? 'sd' : capaian >= 51 ? 'rd' : 'sr';
    }

    const _targetNum = row.target_tahun != null ? Number(row.target_tahun) : null;
    const targetFmt = row.target_display != null
      ? String(row.target_display)
      : (_targetNum != null && !isNaN(_targetNum)
          ? (Number.isInteger(_targetNum) ? String(_targetNum) : _targetNum.toFixed(2))
          : '—');

    // Tentukan row state class untuk IKK
    const ikkRowStateClass = row.realisasi_id ? 'row-state-saved' : 'row-state-default';

    // Reuse dukung button (references _ikkData so we need a separate handler)
    html += `<tr data-id="${row.id}" class="${ikkRowStateClass}">
      <td class="td-sticky-no" style="text-align:center;color:var(--teks-muted);position:sticky;left:0;z-index:3">${no}</td>
      <td class="td-sticky-name" style="position:sticky;left:34px;z-index:3"><div style="font-weight:600;line-height:1.6"><span>${escHtml(row.indikator_kinerja)}</span>${row.bermakna_negatif ? `<span title="Bermakna Negatif" style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;background:#fee2e2;border-radius:50%;margin-left:5px;vertical-align:middle;flex-shrink:0"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"9\" height=\"9\" fill=\"none\" viewBox=\"0 0 24 24\" stroke=\"#991b1b\" stroke-width=\"2.8\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M19 14l-7 7m0 0l-7-7m7 7V3\"/></svg></span>` : `<span title="Bermakna Positif" style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;background:#d1fae5;border-radius:50%;margin-left:5px;vertical-align:middle;flex-shrink:0"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"9\" height=\"9\" fill=\"none\" viewBox=\"0 0 24 24\" stroke=\"#065f46\" stroke-width=\"2.8\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M5 10l7-7m0 0l7 7m-7-7v18\"/></svg></span>`}</div>${row.formula ? `<div class="fx-wrap" style="margin-top:5px"><button style="display:inline-flex;align-items:center;gap:4px;font-size:0.62rem;font-weight:700;color:#0f766e;background:#f0fdfa;border:1px solid #99f6e4;border-radius:4px;padding:2px 6px;cursor:pointer;font-family:inherit" title="Lihat formula perhitungan" onclick="var d=this.nextElementSibling;var open=d.style.display==='block';d.style.display=open?'none':'block';this.querySelector('.fx-arrow').style.transform=open?'rotate(0deg)':'rotate(180deg)'"><span>Σ</span><span class=\"fx-arrow\" style=\"display:inline-block;transition:transform .2s;font-style:normal\">▾</span></button><div class="fx-panel" style="display:none;margin-top:4px">${_renderFormulaMath(row.formula, '')}</div></div>` : ''}</td>
      <td class="td-satuan">${escHtml(row.satuan || '')}</td>
      <td class="td-target" style="font-weight:700">${targetFmt}</td>
      ${_user?.is_admin ? `<td style="color:var(--teks-mid)">${escHtml(row.penanggung_jawab || '—')}</td>` : ''}
      <td class="realisasi-input-cell">
        <input type="number" id="ikk_real_${row.id}" value="${row.realisasi_display != null ? row.realisasi_display : (row.realisasi != null ? parseFloat(row.realisasi) : '')}"
               placeholder="0" step="0.01" ${row.realisasi_id ? 'readonly' : ''}
               title="${row.realisasi_id ? 'Klik tombol Edit untuk mengisi realisasi' : ''}"
               style="${row.realisasi_id ? 'cursor:not-allowed' : ''}"
               onchange="markIkkDirty(${row.id})">
      </td>
      <td style="text-align:center">
        <span class="capaian-badge ${badgeClass}" id="ikk_badge_${row.id}">${badgeText}</span>
      </td>
      <td class="textarea-cell">
        ${_renderPSCell('ikk_fpenghambat', row.id, row.f_penghambat, capaian, canEdit, 'faktor penghambat', 'markIkkDirty', !!row.realisasi_id, false)}
      </td>
      <td class="textarea-cell">
        ${_renderPSCell('ikk_solusi', row.id, row.solusi, capaian, canEdit, 'solusi', 'markIkkDirty', !!row.realisasi_id, false)}
      </td>
      <td class="textarea-cell">
        ${_renderPSCell('ikk_fpendukung', row.id, row.f_pendukung, capaian, canEdit, 'faktor pendukung', 'markIkkDirty', !!row.realisasi_id, true)}
      </td>
      <td class="textarea-cell">
        ${_renderPSCell('ikk_rencana', row.id, row.rencana_tl, capaian, canEdit, 'rencana tindak lanjut', 'markIkkDirty', !!row.realisasi_id, true)}
      </td>
      <td style="text-align:center" data-col="dukung">${_renderDukungBtn(row, _ikk_bulan, _ikk_tahun, 'ikk', !row.realisasi_id)}</td>
      <td style="text-align:center;white-space:nowrap">
        ${canEdit ? `
          <button class="btn-edit-row" id="ikk_editbtn_${row.id}" title="Edit baris ini"
            onclick="toggleIkkEditRow(${row.id})"
            style="${row.realisasi_id ? '' : 'display:none'}">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            Edit
          </button>
          <button class="save-row-btn" id="ikk_savebtn_${row.id}" disabled
            onclick="saveIkkRealisasiRow(${row.id})" title="Simpan"
            style="font-family:'Plus Jakarta Sans',sans-serif!important;${row.realisasi_id ? 'background:var(--sukses);color:#fff' : ''}">
            ${row.realisasi_id
  ? '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg> Tersimpan'
  : '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg> Simpan'}
          </button>
        ` : ''}
        ${_user?.is_admin && row.realisasi_id ? `
          <button class="btn-reset-row" id="ikk_resetbtn_${row.id}" title="Reset data realisasi baris ini (admin)"
            onclick="resetRealisasiRow(${row.id}, 'ikk')">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
            Reset
          </button>
        ` : ''}
      </td>
    </tr>`;
  });
  tbody.innerHTML = html;
  // Toggle header kolom Bidang / Sub Bagian (hanya tampil untuk admin)
  document.querySelectorAll('.col-bidang-ikk').forEach(el => { el.style.display = _user?.is_admin ? '' : 'none'; });
  renderPagination('ikkPagination', _ikkData.length, _ikkPage, _ikkPageSize, '_goIkkPage');

  // Banner info akumulasi IKK
  const ikkBanner = document.getElementById('ikkAkumulasiInfo');
  if (ikkBanner) {
    const jumlahRows = _ikkRows.filter(r =>
      r.indikator_kinerja && r.indikator_kinerja.trim().toLowerCase().startsWith('jumlah')
    );
    if (jumlahRows.length > 0) {
      const countEl = document.getElementById('ikkAkumulasiCount');
      if (countEl) countEl.textContent = jumlahRows.length;
      ikkBanner.style.display = 'flex';
    } else {
      ikkBanner.style.display = 'none';
    }
  }
}

function markIkkDirty(indikatorId) {
  const btn = document.getElementById(`ikk_savebtn_${indikatorId}`);
  if (btn) {
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg> Simpan`;
  }
  // Preview capaian IKK
  const row = _ikkData.find(r => r.id === indikatorId);
  if (!row) return;
  const realEl = document.getElementById(`ikk_real_${indikatorId}`);
  if (!realEl) return;
  const realisasi = parseFloat(realEl.value);
  const target    = parseFloat(row.target_tahun);
  const badge     = document.getElementById(`ikk_badge_${indikatorId}`);
  if (!badge) return;
  if (isNaN(realisasi) || isNaN(target) || target === 0) {
    badge.textContent = '—'; badge.className = 'capaian-badge na';
    _togglePermasalahanSolusi('ikk', indikatorId, null);
    return;
  }
  let capaian = row.bermakna_negatif
    ? ((target - (_hitungRealisasiEfektifPreview(row, realisasi) - target)) / target) * 100
    : (_hitungRealisasiEfektifPreview(row, realisasi) / target) * 100;
  badge.textContent = capaian.toFixed(1) + '%';
  badge.className = 'capaian-badge ' + (capaian >= 91 ? 'st' : capaian >= 76 ? 'ti' : capaian >= 66 ? 'sd' : capaian >= 51 ? 'rd' : 'sr');
  _togglePermasalahanSolusi('ikk', indikatorId, capaian);
  _updateIkkSaveBtnState(indikatorId);
}

function _updateIkkSaveBtnState(indikatorId) {
  const btn = document.getElementById(`ikk_savebtn_${indikatorId}`);
  if (!btn) return;
  const row  = _ikkData.find(r => r.id === indikatorId);
  const fieldArgs = {
    realVal: document.getElementById(`ikk_real_${indikatorId}`)?.value,
    targetVal: row?.target_tahun,
    bermakna_negatif: row?.bermakna_negatif,
    fpenghambatVal: document.getElementById(`ikk_fpenghambat_${indikatorId}`)?.value ?? '',
    solusiVal:      document.getElementById(`ikk_solusi_${indikatorId}`)?.value ?? '',
    fpendukungVal:  document.getElementById(`ikk_fpendukung_${indikatorId}`)?.value ?? '',
    rencanaVal:     document.getElementById(`ikk_rencana_${indikatorId}`)?.value ?? '',
    hasDukung:      !!row?.data_dukung_url,
  };
  const ok = _canSaveRow(fieldArgs);
  const okUpload = _canSaveRow(fieldArgs, false);
  btn.disabled         = !ok;
  btn.style.background = ok ? '#0d9488' : '';
  btn.style.color      = ok ? '#fff'    : '';

  // Enable/disable tombol Upload berdasarkan kondisi field wajib
  const _uploadBtn_ikk = document.querySelector(`tr[data-id="${indikatorId}"] .dukung-upload-btn`);
  if (_uploadBtn_ikk && !_uploadBtn_ikk.classList.contains('dukung-uploaded-btn')) {
    if (okUpload) {
      _uploadBtn_ikk.disabled = false;
      _uploadBtn_ikk.style.cursor = 'pointer';
      _uploadBtn_ikk.style.opacity = '1';
      _uploadBtn_ikk.style.borderStyle = 'dashed';
      _uploadBtn_ikk.style.borderColor = '#6ee7b7';
      _uploadBtn_ikk.style.background = '#ecfdf5';
      _uploadBtn_ikk.style.color = '#065f46';
      _uploadBtn_ikk.title = 'Upload data dukung';
      _uploadBtn_ikk.onclick = () => _openDukungFromBtn(_uploadBtn_ikk);
    } else {
      _uploadBtn_ikk.disabled = true;
      _uploadBtn_ikk.style.cursor = 'not-allowed';
      _uploadBtn_ikk.style.opacity = '.65';
      _uploadBtn_ikk.style.borderStyle = 'dashed';
      _uploadBtn_ikk.style.borderColor = '#fca5a5';
      _uploadBtn_ikk.style.background = '#fee2e2';
      _uploadBtn_ikk.style.color = '#991b1b';
      _uploadBtn_ikk.title = 'Isi realisasi dan field wajib terlebih dahulu';
      _uploadBtn_ikk.onclick = null;
    }
  }
}

async function saveIkkRealisasiRow(indikatorId) {
  const btn  = document.getElementById(`ikk_savebtn_${indikatorId}`);
  const realEl = document.getElementById(`ikk_real_${indikatorId}`);
  const real = realEl?.value;
  let fpenghambat = document.getElementById(`ikk_fpenghambat_${indikatorId}`)?.value?.trim();
  let solusi      = document.getElementById(`ikk_solusi_${indikatorId}`)?.value?.trim();
  let fpendukung  = document.getElementById(`ikk_fpendukung_${indikatorId}`)?.value?.trim();
  let rencana     = document.getElementById(`ikk_rencana_${indikatorId}`)?.value?.trim();

  const rowIkk = _ikkData.find(r => r.id === indikatorId);
  // Validasi field wajib — hitung capaian langsung dari nilai input vs target
  const _realIkk   = parseFloat(real);
  const _targetIkk = parseFloat(rowIkk?.target_tahun);
  if (!isNaN(_realIkk) && !isNaN(_targetIkk) && _targetIkk !== 0) {
    const _capaianIkk = rowIkk?.bermakna_negatif
      ? ((_targetIkk - (_realIkk - _targetIkk)) / _targetIkk) * 100
      : (_realIkk / _targetIkk) * 100;
    if (_capaianIkk < 100) {
      if (!fpenghambat || _isSymbolOnly(fpenghambat)) { toast('Faktor Penghambat wajib diisi, tidak boleh hanya simbol/tanda baca.', 'error'); return; }
      if (!solusi || _isSymbolOnly(solusi))           { toast('Solusi wajib diisi, tidak boleh hanya simbol/tanda baca.', 'error'); return; }
      fpendukung = ''; rencana = '';
    } else {
      if (!fpendukung || _isSymbolOnly(fpendukung)) { toast('Faktor Pendukung wajib diisi, tidak boleh hanya simbol/tanda baca.', 'error'); return; }
      if (!rencana || _isSymbolOnly(rencana))       { toast('Rencana Tindak Lanjut wajib diisi, tidak boleh hanya simbol/tanda baca.', 'error'); return; }
      fpenghambat = ''; solusi = '';
    }
  }

  if (btn) { btn.disabled = true; btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="animation:spin .8s linear infinite"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg> ...`; }
  try {
    const r = await fetch('/api/kinerja/realisasi', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({
        indikator_id: indikatorId, bulan: _ikk_bulan, tahun: _ikk_tahun,
        realisasi: real !== '' ? parseFloat(real) : null,
        realisasi_display: real !== '' ? real : null,
        f_penghambat: fpenghambat || null, solusi: solusi || null, f_pendukung: fpendukung || null, rencana_tl: rencana || null,
      }),
    });
    const d = await r.json();
    if (!r.ok) { toast(d.error || 'Gagal menyimpan', 'error'); if (btn) { btn.disabled = false; btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg> Simpan`; } }
    else {
      toast('Tersimpan');
      // Invalidate cache chart dashboard supaya Pantau Indikator fetch data fresh
      if (typeof _invalidateKinerjaDashboardCache === 'function') _invalidateKinerjaDashboardCache(_ikk_tahun);
      // Kunci kembali input setelah simpan
      ['ikk_real_', 'ikk_fpenghambat_', 'ikk_solusi_', 'ikk_fpendukung_', 'ikk_rencana_'].forEach(prefix => {
        const el = document.getElementById(`${prefix}${indikatorId}`);
        if (el) {
          el.setAttribute('readonly', '');
          el.style.background = '';
          el.style.cursor = 'not-allowed';
          if (el.tagName === 'TEXTAREA') { el.style.resize = 'none'; el.style.display = 'none'; }
          el.title = 'Klik tombol Edit untuk mengisi';
        }
      });
      // Update warna baris → hijau (tersimpan)
      const tr = document.querySelector(`tr[data-id="${indikatorId}"]`);
      if (tr) {
        tr.classList.remove('row-state-default', 'row-state-editing');
        tr.classList.add('row-state-saved');
      }
      const editBtn = document.getElementById(`ikk_editbtn_${indikatorId}`);
      if (editBtn) {
        editBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg> Edit`;
        editBtn.classList.remove('btn-edit-row--active');
        editBtn.title = 'Edit baris ini';
        editBtn.style.display = ''; // tampilkan tombol Edit setelah data tersimpan
      }
      if (btn) {
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg> Tersimpan`;
        btn.style.background = 'var(--sukses)';
        btn.style.color = '#fff';
        btn.disabled = true;
      }
      const idx = _ikkData.findIndex(x => x.id === indikatorId);
      if (idx >= 0) {
        _ikkData[idx].realisasi         = d.realisasi?.realisasi ?? null;
        _ikkData[idx].realisasi_display = d.realisasi?.realisasi_display ?? null;
        _ikkData[idx].f_penghambat      = d.realisasi?.f_penghambat ?? null;
        _ikkData[idx].solusi            = d.realisasi?.solusi ?? null;
        _ikkData[idx].f_pendukung       = d.realisasi?.f_pendukung ?? null;
        _ikkData[idx].rencana_tl        = d.realisasi?.rencana_tl ?? null;
        _ikkData[idx].realisasi_id      = d.realisasi?.id ?? _ikkData[idx].realisasi_id;
      }
      // Refresh capaian_persen dari server (hitung ulang kumulatif lintas bulan)
      fetch(`/api/kinerja/rekap?bulan=${_ikk_bulan}&tahun=${_ikk_tahun}&jenis=ikk`, { headers: authHeaders() })
        .then(res => res.ok ? res.json() : null)
        .then(fresh => {
          if (!fresh?.rekap) return;
          for (const freshRow of fresh.rekap) {
            const i = _ikkData.findIndex(x => x.id === freshRow.id);
            if (i >= 0) _ikkData[i].capaian_persen = freshRow.capaian_persen;
            const badge = document.getElementById(`ikk_badge_${freshRow.id}`);
            if (badge) {
              const cap = (freshRow.realisasi_id && freshRow.capaian_persen != null) ? Number(freshRow.capaian_persen) : null;
              if (cap === null || isNaN(cap)) {
                badge.textContent = '—'; badge.className = 'capaian-badge na';
              } else {
                badge.textContent = cap.toFixed(1) + '%';
                badge.className = 'capaian-badge ' + (cap >= 91 ? 'st' : cap >= 76 ? 'ti' : cap >= 66 ? 'sd' : cap >= 51 ? 'rd' : 'sr');
              }
            }
          }
        }).catch(() => {});
      // Kunci kembali tombol data dukung (Upload kembali ke warna default)
      _lockDukungButtons(indikatorId);
      // Tampilkan tombol Reset (admin) tanpa perlu reload
      _ensureResetBtn(indikatorId, 'ikk_', 'ikk');
      const _savedIkk = _ikkData[idx >= 0 ? idx : -1];
      const _rIkk = parseFloat(_savedIkk?.realisasi ?? '');
      const _tIkk = parseFloat(_savedIkk?.target_tahun ?? '');
      if (!isNaN(_rIkk) && !isNaN(_tIkk) && _tIkk !== 0) {
        const _cIkk = _savedIkk?.bermakna_negatif
          ? ((_tIkk - (_rIkk - _tIkk)) / _tIkk) * 100
          : (_rIkk / _tIkk) * 100;
        _togglePermasalahanSolusi('ikk', indikatorId, _cIkk);
        [['ikk_fpenghambat', _savedIkk?.f_penghambat], ['ikk_solusi', _savedIkk?.solusi],
         ['ikk_fpendukung', _savedIkk?.f_pendukung], ['ikk_rencana', _savedIkk?.rencana_tl]].forEach(([base, val]) => {
          const readEl  = document.getElementById(`${base}read_${indikatorId}`);
          const shortEl = document.getElementById(`${base}short_${indikatorId}`);
          if (readEl && shortEl) {
            shortEl.textContent = val || '';
            readEl.style.display = (val || '').trim().length > 0 ? '' : 'none';
          }
        });
      }
    }
  } catch (err) { toast('Error: ' + err.message, 'error'); if (btn) { btn.disabled = false; btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg> Simpan`; } }
}

// Data dukung IKK — reuse modal yang sama, tapi update _ikkData
async function openIkkDukungModal(indikatorId, bulan, tahun) {
  _dukungState = { indikatorId, tw: bulan, tahun, files: [], _source: 'ikk' };
  const area = document.getElementById('dukungUploadArea');
  const fi   = document.getElementById('dukungFileInput');
  const pw   = document.getElementById('dukungProgressWrap');
  if (area) { area.classList.remove('drag-over'); area.style.display = ''; }
  if (fi)   fi.value = '';
  if (pw)   pw.style.display = 'none';

  const row = _ikkData.find(r => r.id === indikatorId);
  document.getElementById('dukungIndikatorLabel').textContent = row?.indikator_kinerja || '';
  document.getElementById('dukungTwLabel').textContent = `${BULAN_FULL[bulan] || bulan} ${tahun} — IKK`;

  if (row?.data_dukung_url) {
    try {
      const parsed = JSON.parse(row.data_dukung_url);
      _dukungState.files = Array.isArray(parsed) ? parsed.filter(f => f && f.url) : [];
    } catch {
      _dukungState.files = [{ url: row.data_dukung_url, name: row.data_dukung_nama || 'Dokumen' }];
    }
  }
  _renderDukungList();
  openModal('modalDukung');
}


function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Permasalahan & Solusi: hanya tampil jika capaian < 100% ───────────────
// Jika capaian >= 100% (target tercapai), textarea disembunyikan & diganti
// catatan "Target tercapai". Jika capaian null/NaN (belum diisi), textarea tetap tampil.
// Auto-resize textarea mengikuti konten (tanpa scroll)
function _autoResizeTA(el) {
  if (!el || el.tagName !== 'TEXTAREA') return;
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}
function _autoResizeAllTA(tr) {
  if (!tr) return;
  tr.querySelectorAll('.textarea-cell textarea').forEach(_autoResizeTA);
}

function _renderPSCell(idBase, indikatorId, value, capaian, canEdit, label, onchangeFn, locked = true, tercapaiCol = false) {
  const tercapai  = capaian !== null && !isNaN(capaian) && capaian >= 100;
  const belumIsi  = capaian === null || isNaN(capaian);
  const hideTA    = belumIsi || (tercapaiCol ? !tercapai : tercapai);
  const showNote  = !tercapaiCol && tercapai;
  const hasValue  = (value || '').trim().length > 0;
  const LIMIT     = 80; // karakter sebelum dipotong
  const needsTrunc = locked && hasValue && !hideTA && (value || '').length > LIMIT;
  const startCollapsed = needsTrunc; // collapsed hanya kalau teks panjang
  const previewText = needsTrunc
    ? escHtml((value || '').slice(0, LIMIT))
    : escHtml(value || '');
  return `<div class="ps-cell-wrap${startCollapsed ? ' ps-collapsed' : ''}" id="${idBase}wrap_${indikatorId}" style="${hideTA ? 'display:none' : ''}">
            <!-- View mode: teks + Selengkapnya -->
            <div class="ps-read" id="${idBase}read_${indikatorId}" style="${!locked || !hasValue || hideTA ? 'display:none' : ''}">
              <span class="ps-read-text" id="${idBase}short_${indikatorId}">${previewText}${needsTrunc ? '<span class="ps-ellipsis">…</span>' : ''}</span>
              <span class="ps-read-full" id="${idBase}full_${indikatorId}" style="display:none">${escHtml(value || '')}</span>
              ${needsTrunc ? `<button type="button" class="ps-more-btn" id="${idBase}morebtn_${indikatorId}"
                onclick="_togglePSExpand('${idBase}', ${indikatorId}, event)">Selengkapnya</button>` : ''}
            </div>
            <!-- Edit mode: textarea -->
            <textarea id="${idBase}_${indikatorId}" placeholder="${canEdit ? 'Ketik di sini...' : '—'}"
              ${locked ? 'readonly' : ''}
              title="${locked ? `Klik tombol Edit untuk mengisi ${label}` : ''}"
              style="${locked ? 'cursor:not-allowed;display:none;' : ''}resize:none"
              oninput="_autoResizeTA(this); _checkSymbolOnlyInput(this, '${label}')" onchange="${onchangeFn}(${indikatorId})">${escHtml(value || '')}</textarea>
          </div>
          <div id="${idBase}note_${indikatorId}" class="ps-tercapai-note" style="${showNote && hasValue ? '' : 'display:none'}">
            —
          </div>`;
}

// Simpan referensi ps-read yang sedang expanded (untuk auto-collapse saat klik luar)
let _psExpandedEl = null;

function _collapsePSExpand(readEl) {
  if (!readEl) return;
  const shortEl = readEl.querySelector('.ps-read-text');
  const fullEl  = readEl.querySelector('.ps-read-full');
  const btn     = readEl.querySelector('.ps-more-btn');
  if (fullEl)  fullEl.style.display = 'none';
  if (shortEl) shortEl.style.display = '';
  if (btn)     btn.textContent = 'Selengkapnya';
  _psExpandedEl = null;
}

function _togglePSExpand(idBase, indikatorId, event) {
  if (event) event.stopPropagation();
  const readEl  = document.getElementById(`${idBase}read_${indikatorId}`);
  const shortEl = document.getElementById(`${idBase}short_${indikatorId}`);
  const fullEl  = document.getElementById(`${idBase}full_${indikatorId}`);
  const btn     = document.getElementById(`${idBase}morebtn_${indikatorId}`);
  if (!fullEl) return;
  const expanded = fullEl.style.display !== 'none';
  if (!expanded) {
    // Collapse yang sebelumnya expand dulu
    if (_psExpandedEl && _psExpandedEl !== readEl) _collapsePSExpand(_psExpandedEl);
    fullEl.style.display = '';
    if (shortEl) shortEl.style.display = 'none';
    if (btn) btn.textContent = 'Sembunyikan';
    _psExpandedEl = readEl;
  } else {
    _collapsePSExpand(readEl);
  }
}

// Klik di luar ps-read yang expand → otomatis collapse
document.addEventListener('click', function(e) {
  if (!_psExpandedEl) return;
  if (!_psExpandedEl.contains(e.target)) _collapsePSExpand(_psExpandedEl);
});

// Auto-hide formula panel saat klik di luar area formula
document.addEventListener('click', function(e) {
  // Cek apakah klik pada/dalam tombol Σ atau panel formula
  if (e.target.closest && e.target.closest('.fx-wrap')) return;
  // Tutup semua formula panel yang sedang terbuka
  document.querySelectorAll('.fx-panel[style*="display: block"], .fx-panel[style*="display:block"]').forEach(function(panel) {
    panel.style.display = 'none';
    const btn = panel.previousElementSibling;
    if (btn) {
      const arrow = btn.querySelector('.fx-arrow');
      if (arrow) arrow.style.transform = 'rotate(0deg)';
    }
  });
});

// Toggle tampilan textarea Permasalahan/Solusi vs catatan "Target tercapai"
// berdasarkan nilai capaian terbaru (dipanggil saat preview capaian live)
function _togglePermasalahanSolusi(prefix, indikatorId, capaian) {
  const tercapai = capaian !== null && !isNaN(capaian) && capaian >= 100;
  const belumIsi = capaian === null || isNaN(capaian);
  // Kolom < 100: f_penghambat, solusi
  const hideBawah  = belumIsi || tercapai;
  // Kolom >= 100: f_pendukung, rencana_tl
  const hideAtas   = belumIsi || !tercapai;
  const p = prefix ? prefix + '_' : '';
  ['fpenghambat', 'solusi'].forEach(base => {
    const wrap = document.getElementById(`${p}${base}wrap_${indikatorId}`);
    if (wrap) wrap.style.display = hideBawah ? 'none' : '';
    const note = document.getElementById(`${p}${base}note_${indikatorId}`);
    if (note) {
      // Tampilkan "—" hanya kalau tercapai DAN sebelumnya ada nilai tersimpan
      const ta = document.getElementById(`${p}${base}_${indikatorId}`);
      const hasVal = (ta?.value || '').trim().length > 0;
      note.style.display = (tercapai && hasVal) ? '' : 'none';
    }
  });
  ['fpendukung', 'rencana'].forEach(base => {
    const wrap = document.getElementById(`${p}${base}wrap_${indikatorId}`);
    if (wrap) wrap.style.display = hideAtas ? 'none' : '';
  });
}


function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const el = document.getElementById(pageId);
  if (el) el.classList.add('active');
  if (pageId === 'page-kinerja-admin') {
    switchKinerjaAdminTab('indikator');
    document.getElementById('btnKelolIndikator').style.display = 'none';
  } else if (pageId === 'page-kinerja') {
    document.getElementById('btnKelolIndikator').style.display = _user?.is_admin ? '' : 'none';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MONITORING PENGISIAN KINERJA — Admin Only
// ═══════════════════════════════════════════════════════════════════════════

let _mon_bulan  = new Date().getMonth() + 1;
let _mon_tahun  = new Date().getFullYear();
let _mon_jenis  = 'all';   // 'monev' | 'ikk' | 'all'
let _mon_status = 'all';     // 'all' | 'terisi' | 'belum'
let _mon_pj     = '';
let _mon_search = '';
let _mon_page   = 1;
const _MON_PER_PAGE = 15;
let _mon_data   = null;

const _MON_BULAN_NAMA = ['','Januari','Februari','Maret','April','Mei','Juni',
                         'Juli','Agustus','September','Oktober','November','Desember'];

// ── Populate tahun dari _allPeriodeList ───────────────────────────────────
function _monPopulateTahun() {
  const sel = document.getElementById('monTahunSelect');
  if (!sel) return;
  const tahunList = [...new Set(_allPeriodeList.map(p => p.tahun))].sort((a, b) => a - b);
  const yr = new Date().getFullYear();
  const list = tahunList.length ? tahunList : [yr];
  sel.innerHTML = '<option value="">Semua Tahun</option>' +
    list.map(t => `<option value="${t}"${t === (_mon_tahun || yr) ? ' selected' : ''}>${t}</option>`).join('');
  if (typeof syncCustomSelect === 'function') syncCustomSelect('monTahunSelect');
}

// ── Populate bulan dari periode yang ada di tahun terpilih ────────────────
function _monPopulateBulan() {
  const sel = document.getElementById('monBulanSelect');
  if (!sel) return;
  // Kumpulkan bulan dari _allPeriodeList untuk tahun yang dipilih
  // Kalau _mon_tahun kosong (Semua Tahun), tampilkan semua bulan yang pernah ada
  const bulanSet = _mon_tahun
    ? new Set(_allPeriodeList.filter(p => p.tahun === _mon_tahun).map(p => p.bulan))
    : new Set(_allPeriodeList.map(p => p.bulan));
  const BULAN_NAMES = ['','Januari','Februari','Maret','April','Mei','Juni',
                       'Juli','Agustus','September','Oktober','November','Desember'];
  const opts = ['<option value="">Semua Bulan</option>'];
  for (let b = 1; b <= 12; b++) {
    if (bulanSet.has(b)) opts.push(`<option value="${b}">${BULAN_NAMES[b]}</option>`);
  }
  sel.innerHTML = opts.join('');
  // Pertahankan pilihan bulan sebelumnya jika masih valid
  if (_mon_bulan && bulanSet.has(_mon_bulan)) {
    sel.value = _mon_bulan;
  } else {
    _mon_bulan = '';
    sel.value = '';
  }
  if (typeof syncCustomSelect === 'function') syncCustomSelect('monBulanSelect');
}

// ── Init saat halaman pertama kali dibuka ─────────────────────────────────
async function initMonitoringKinerja() {
  // Pastikan _allPeriodeList sudah terisi (bisa jadi initKinerjaControls belum selesai)
  if (!_allPeriodeList.length) {
    try {
      const r = await fetch('/api/periode', { headers: authHeaders() });
      if (r.ok) { const d = await r.json(); _allPeriodeList = d.periode || []; }
    } catch { _allPeriodeList = []; }
  }

  // Populate dari data periode (bukan hardcode)
  _monPopulateTahun();
  _monPopulateBulan();
  _mon_tahun = document.getElementById('monTahunSelect')?.value
    ? parseInt(document.getElementById('monTahunSelect').value) : '';

  // Sync tombol jenis & status
  _monSyncJenisBtn();
  _monSyncStatusBtn();
  // Load
  loadMonitoringKinerja();
}

async function loadMonitoringKinerja() {
  _mon_page = 1;
  const body = document.getElementById('monTableBody');
  if (!body) return;
  body.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:28px;color:#94a3b8">
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="animation:spin .9s linear infinite;vertical-align:-4px;margin-right:6px"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
    Memuat data monitoring…</td></tr>`;

  try {
    const _monBuildUrl = () => {
      const params = new URLSearchParams({ jenis: _mon_jenis || 'all' });
      if (_mon_tahun !== '' && _mon_tahun != null) params.set('tahun', _mon_tahun);
      if (_mon_bulan !== '' && _mon_bulan != null) params.set('bulan', _mon_bulan);
      return `/api/kinerja/monitoring?${params}`;
    };
    const res = await fetch(_monBuildUrl(), { headers: authHeaders() });
    const d = await res.json();
    if (!res.ok) { toast(d.error || 'Gagal memuat monitoring', 'error'); return; }
    _mon_data = d;
  } catch (err) {
    toast('Error: ' + err.message, 'error');
    body.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:#ef4444">Gagal memuat data.</td></tr>`;
    return;
  }

  _monRenderSummary();
  _monRenderPJCards();
  _monRenderTable();
}

// ── Summary cards ─────────────────────────────────────────────────────────
function _monRenderSummary() {
  const el = document.getElementById('monSummaryCards');
  if (!el || !_mon_data) return;
  const { summary, bulan, tahun, jenis } = _mon_data;
  const pct = summary.total ? Math.round(summary.terisi / summary.total * 100) : 0;
  const barColor = pct >= 80 ? '#16a34a' : pct >= 50 ? '#d97706' : '#dc2626';

  el.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-bottom:14px">
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:12px 20px;min-width:110px;text-align:center">
        <div style="font-size:1.7rem;font-weight:800;color:#16a34a;line-height:1">${summary.terisi}</div>
        <div style="font-size:.72rem;color:#166534;margin-top:3px;font-weight:600">Terinput</div>
      </div>
      <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:12px 20px;min-width:110px;text-align:center">
        <div style="font-size:1.7rem;font-weight:800;color:#ea580c;line-height:1">${summary.belum}</div>
        <div style="font-size:.72rem;color:#9a3412;margin-top:3px;font-weight:600">Belum Input</div>
      </div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 20px;min-width:110px;text-align:center">
        <div style="font-size:1.7rem;font-weight:800;color:#334155;line-height:1">${summary.total}</div>
        <div style="font-size:.72rem;color:#64748b;margin-top:3px;font-weight:600">Total</div>
      </div>
      <div style="flex:1;min-width:180px">
        <div style="display:flex;justify-content:space-between;font-size:.74rem;font-weight:600;color:#475569;margin-bottom:5px">
          <span>Progress Pengisian</span>
          <span style="color:${barColor}">${pct}%</span>
        </div>
        <div style="background:#e2e8f0;border-radius:99px;height:10px;overflow:hidden">
          <div style="width:${pct}%;background:${barColor};height:100%;border-radius:99px;transition:width .4s ease"></div>
        </div>
        <div style="font-size:.7rem;color:#94a3b8;margin-top:4px">
          ${bulan ? _MON_BULAN_NAMA[bulan] : 'Semua Bulan'} ${tahun || 'Semua Tahun'} &nbsp;·&nbsp;
          ${jenis === 'monev' ? 'IKU' : jenis === 'ikk' ? 'IKK' : jenis === 'spm' ? 'SPM' : 'Semua Jenis'}
        </div>
      </div>
    </div>`;
}

// ── Progress per Bidang / Sub Bagian ─────────────────────────────────────────
function _monRenderPJCards() {
  const el = document.getElementById('monPJCards');
  if (!el) return;
  const list = _mon_data?.summary_pj;
  if (!list?.length) { el.innerHTML = ''; return; }

  const cards = list.map(pj => {
    const pct = pj.total ? Math.round(pj.terisi / pj.total * 100) : 0;
    const col = pct >= 80 ? '#16a34a' : pct >= 50 ? '#d97706' : '#dc2626';
    const isActive = _mon_pj === pj.penanggung_jawab;
    return `<div onclick="setMonPJ(${JSON.stringify(pj.penanggung_jawab)})" title="Klik untuk filter"
         style="cursor:pointer;background:${isActive ? '#eff6ff' : '#f8fafc'};
                border:1.5px solid ${isActive ? '#93c5fd' : '#e2e8f0'};
                border-radius:10px;padding:10px 14px;flex:1;min-width:150px;max-width:280px">
      <div style="font-size:.72rem;font-weight:700;color:#475569;white-space:normal;word-break:break-word;line-height:1.35;margin-bottom:4px">
        ${escHtml(pj.penanggung_jawab)}
      </div>
      <div style="background:#e2e8f0;border-radius:99px;height:6px;overflow:hidden;margin-bottom:4px">
        <div style="width:${pct}%;background:${col};height:100%;border-radius:99px"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:.68rem;color:#64748b">
        <span style="color:${col};font-weight:700">${pct}%</span>
        <span>${pj.terisi}/${pj.total}</span>
      </div>
    </div>`;
  }).join('');

  el.innerHTML = `
    <div style="margin-bottom:12px">
      <div style="font-size:.76rem;font-weight:700;color:#475569;margin-bottom:7px;display:flex;align-items:center;gap:6px">
        Progress per Bidang / Sub Bagian
        ${_mon_pj ? `<button onclick="setMonPJ('')" style="font-size:.65rem;background:#e0f2fe;border:none;border-radius:6px;padding:2px 8px;cursor:pointer;color:#0369a1;font-weight:600">✕ Reset</button>` : ''}
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px">${cards}</div>
    </div>`;
}

// ── Tabel detail ──────────────────────────────────────────────────────────
function _monGoPage(p) {
  _mon_page = p;
  _monRenderTable();
}

function _monRenderTable() {
  const body = document.getElementById('monTableBody');
  if (!body || !_mon_data) return;

  // Mode semua bulan: tampilkan kolom Bulan ekstra
  const isAllBulan = (_mon_bulan === '' || _mon_bulan == null);
  const colCount = isAllBulan ? 8 : 7;

  // Update thead dinamis
  const thead = body.closest('table')?.querySelector('thead tr');
  if (thead) {
    if (isAllBulan && !thead.querySelector('th[data-bulan-col]')) {
      const th = document.createElement('th');
      th.setAttribute('data-bulan-col', '1');
      th.style.cssText = 'width:90px;text-align:center';
      th.textContent = 'Bulan';
      thead.insertBefore(th, thead.children[4]); // sebelum kolom Status
    } else if (!isAllBulan && thead.querySelector('th[data-bulan-col]')) {
      thead.querySelector('th[data-bulan-col]').remove();
    }
  }

  let rows = [...(_mon_data.indikator || [])];

  // Filter status
  if (_mon_status === 'terisi') rows = rows.filter(r => r.status === 'terisi');
  if (_mon_status === 'belum')  rows = rows.filter(r => r.status === 'belum');

  // Filter PJ
  if (_mon_pj) rows = rows.filter(r => r.penanggung_jawab === _mon_pj);

  // Filter search
  if (_mon_search) {
    const q = _mon_search.toLowerCase();
    rows = rows.filter(r =>
      (r.indikator_kinerja || '').toLowerCase().includes(q) ||
      (r.penanggung_jawab  || '').toLowerCase().includes(q) ||
      (Array.isArray(r.pic_users) ? r.pic_users.join(' ') : '').toLowerCase().includes(q)
    );
  }

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="${colCount}" style="text-align:center;padding:28px;color:#94a3b8">Tidak ada data sesuai filter.</td></tr>`;
    if (typeof renderPagination === 'function') renderPagination('monPagination', 0, 1, _MON_PER_PAGE, '_monGoPage');
    return;
  }

  // Pagination
  const total = rows.length;
  const pages = Math.ceil(total / _MON_PER_PAGE);
  if (_mon_page > pages) _mon_page = pages;
  const start = (_mon_page - 1) * _MON_PER_PAGE;
  rows = rows.slice(start, start + _MON_PER_PAGE);

  const fmtDT = iso => iso
    ? new Date(iso).toLocaleString('id-ID', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) + ' WITA'
    : '—';

  let html = '';
  let no = 0;
  let lastGroup = null;

  for (const r of rows) {
    // Group header row
    if (r.group_nama && r.group_nama !== lastGroup) {
      lastGroup = r.group_nama;
      html += `<tr style="background:#f1f5f9">
        <td colspan="${colCount}" style="padding:7px 12px;font-size:.73rem;font-weight:700;color:#475569;letter-spacing:.04em">
          ${escHtml(r.group_nama)}
        </td>
      </tr>`;
    }

    no++;
    const isTerisi = r.status === 'terisi';

    const statusBadge = isTerisi
      ? `<span style="display:inline-block;background:#dcfce7;color:#15803d;border-radius:6px;padding:3px 9px;font-size:.71rem;font-weight:700">Terinput</span>`
      : `<span style="display:inline-block;background:#fef2f2;color:#b91c1c;border-radius:6px;padding:3px 9px;font-size:.71rem;font-weight:700">Belum Input</span>`;

    const picList = Array.isArray(r.pic_users) ? r.pic_users.filter(Boolean) : [];
    const picInfo = picList.length
      ? picList.map(n => `<div style="font-size:.74rem;font-weight:600;color:#1e293b;line-height:1.4">${escHtml(n)}</div>`).join('')
        + (isTerisi && r.diisi_pada ? `<div style="font-size:.65rem;color:#94a3b8;margin-top:2px">${fmtDT(r.diisi_pada)}</div>` : '')
      : `<span style="font-size:.72rem;color:#94a3b8;font-style:italic">Belum ditugaskan</span>`;

    const jenisBadges = [
      r.jenis_monev ? `<span style="background:#dbeafe;color:#1d4ed8;border-radius:4px;padding:1px 5px;font-size:.63rem;font-weight:700">IKU</span>` : '',
      r.jenis_ikk   ? `<span style="background:#ede9fe;color:#7c3aed;border-radius:4px;padding:1px 5px;font-size:.63rem;font-weight:700">IKK</span>`   : '',
      r.jenis_spm   ? `<span style="background:#fef3c7;color:#b45309;border-radius:4px;padding:1px 5px;font-size:.63rem;font-weight:700">SPM</span>`   : '',
    ].filter(Boolean).join(' ');

    const capaian = r.capaian_persen != null
      ? `<span class="capaian-badge ${r.capaian_persen >= 100 ? 'ok' : r.capaian_persen >= 75 ? 'mid' : 'low'}">${r.capaian_persen}%</span>`
      : `<span class="capaian-badge na">—</span>`;

    const targetTx = escHtml(
      r.target_display != null ? String(r.target_display)
      : r.target_tahun  != null ? String(r.target_tahun)
      : '—'
    );
    const satuanTx = r.satuan ? `<div style="font-size:.68rem;color:#94a3b8;margin-top:1px">${escHtml(r.satuan)}</div>` : '';

    // Kolom bulan (hanya saat mode semua bulan)
    const bulanCell = isAllBulan
      ? `<td style="text-align:center;font-size:.75rem;font-weight:600;color:#475569;padding:10px 8px;white-space:nowrap">
           ${r.bulan ? _MON_BULAN_NAMA[r.bulan] : '—'}
         </td>`
      : '';

    html += `<tr style="${isTerisi ? '' : 'background:#fffbf7'}">
      <td style="text-align:center;font-size:.78rem;color:#94a3b8;padding:10px 8px">${no}</td>
      <td style="padding:10px 10px">
        <div style="font-size:.82rem;font-weight:600;color:#1e293b;line-height:1.4;white-space:normal;word-break:break-word">${escHtml(r.indikator_kinerja)}</div>
        ${satuanTx}
        ${jenisBadges ? `<div style="margin-top:3px;display:flex;gap:3px;flex-wrap:wrap">${jenisBadges}</div>` : ''}
      </td>
      <td style="font-size:.78rem;color:#64748b;padding:10px 8px;word-break:break-word;white-space:normal">${escHtml(r.penanggung_jawab || '—')}</td>
      <td style="font-size:.78rem;padding:10px 8px;white-space:nowrap">${targetTx}</td>
      ${bulanCell}
      <td style="text-align:center;padding:10px 8px">${statusBadge}</td>
      <td style="padding:10px 8px">${picInfo}</td>
      <td style="text-align:center;padding:10px 8px">${capaian}</td>
    </tr>`;
  }

  body.innerHTML = html;

  // Render pagination
  if (typeof renderPagination === 'function') renderPagination('monPagination', total, _mon_page, _MON_PER_PAGE, '_monGoPage');
}

// ── Filter handlers ───────────────────────────────────────────────────────
function setMonBulan(b) {
  _mon_bulan = b === '' ? '' : parseInt(b);
  _monSyncBulanBtn();
  loadMonitoringKinerja();
}

function setMonTahun(t) {
  _mon_tahun = t === '' ? '' : parseInt(t);
  // Re-populate bulan sesuai tahun yang dipilih
  _monPopulateBulan();
  loadMonitoringKinerja();
}

function setMonFilterJenis(j) {
  _mon_jenis = j === '' ? 'all' : j;
  _monSyncJenisBtn();
  loadMonitoringKinerja();
}

function setMonFilterStatus(s) {
  _mon_page = 1;
  _mon_status = s === '' ? 'all' : s;
  _monSyncStatusBtn();
  _monRenderTable();
}

function setMonPJ(pj) {
  _mon_page = 1;
  _mon_pj = _mon_pj === pj ? '' : pj;
  _monRenderPJCards();
  _monRenderTable();
}

function setMonSearch(val) {
  _mon_page = 1;
  _mon_search = (val || '').trim();
  _monRenderTable();
}

// ── Sync tombol aktif ─────────────────────────────────────────────────────
function _monSyncBulanBtn() {
  const sel = document.getElementById('monBulanSelect');
  if (sel) sel.value = _mon_bulan === '' ? '' : _mon_bulan;
  if (typeof syncCustomSelect === 'function') syncCustomSelect('monBulanSelect');
}

function _monSyncJenisBtn() {
  const sel = document.getElementById('monJenisSelect');
  if (sel) sel.value = (_mon_jenis === 'all') ? '' : _mon_jenis;
  if (typeof syncCustomSelect === 'function') syncCustomSelect('monJenisSelect');
}

function _monSyncStatusBtn() {
  const sel = document.getElementById('monStatusSelect');
  if (sel) sel.value = (_mon_status === 'all') ? '' : _mon_status;
  if (typeof syncCustomSelect === 'function') syncCustomSelect('monStatusSelect');
}

// ── Export CSV ────────────────────────────────────────────────────────────
function exportMonitoringCSV() {
  if (!_mon_data?.indikator?.length) { toast('Tidak ada data untuk di-export', 'error'); return; }
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const fmtDT = iso => iso ? new Date(iso).toLocaleString('id-ID') : '';
  const headers = ['No','Indikator Kinerja','Satuan','Target','Bidang / Sub Bagian','Status',
                   'Penanggung Jawab (User)','Realisasi','Capaian (%)','Faktor Penghambat','Solusi','Faktor Pendukung','Rencana Tindak Lanjut'];
  const rows = [headers.join(',')];
  _mon_data.indikator.forEach((r, i) => {
    const picStr = Array.isArray(r.pic_users) ? r.pic_users.filter(Boolean).join('; ') : '';
    rows.push([
      i + 1,
      esc(r.indikator_kinerja),
      esc(r.satuan),
      esc(r.target_display ?? r.target_tahun ?? ''),
      esc(r.penanggung_jawab),
      r.status === 'terisi' ? 'Terisi' : 'Belum Input',
      esc(picStr),
      esc(r.realisasi_display ?? r.realisasi ?? ''),
      r.capaian_persen ?? '',
      esc(r.f_penghambat),
      esc(r.solusi),
      esc(r.f_pendukung),
      esc(r.rencana_tl),
    ].join(','));
  });
  const blob = new Blob(['\uFEFF' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: `monitoring_kinerja_${_MON_BULAN_NAMA[_mon_bulan]}_${_mon_tahun}.csv`,
  });
  a.click(); URL.revokeObjectURL(a.href);
  toast('CSV berhasil diunduh');
}

// ═══════════════════════════════════════════════════════════════════════════
// SPM — Standar Pelayanan Minimal
// ═══════════════════════════════════════════════════════════════════════════

async function initSpmControls() {
  if (!_periodeListTerbuka.length) {
    try {
      const r = await fetch('/api/periode/aktif');
      if (r.ok) {
        const d = await r.json();
        _periodeListTerbuka = d.periode || [];
      }
    } catch { _periodeListTerbuka = []; }
  }
  await _ensureUserIndikatorIds();
  if (_user?.is_admin && !_allPeriodeList.length) {
    try {
      const r = await fetch('/api/periode', { headers: authHeaders() });
      if (r.ok) {
        const d = await r.json();
        _allPeriodeList = d.periode || [];
      }
    } catch {}
  }
  const _spmTerbuka = _periodeListTerbuka.filter(p => p.jenis === 'spm')
    .sort((a, b) => a.tahun !== b.tahun ? a.tahun - b.tahun : a.bulan - b.bulan);
  if (_spmTerbuka.length) {
    _spm_tahun = _spmTerbuka[0].tahun;
    _spm_bulan = _spmTerbuka[0].bulan;
  } else if (_user?.is_admin) {
    _spm_tahun = new Date().getFullYear();
    _spm_bulan = new Date().getMonth() + 1;
  }
  if (_user?.is_admin) {
    _populateTahunSelector('spmTahunSelect', _spm_tahun, setSpmTahun);
    const tw = document.getElementById('spmTahunWrap');
    if (tw) tw.style.display = 'flex';
  }
  _syncSpmBulanButtons();
  _renderSpmPeriodeInfo();
  _renderKinerjaCountdown && _renderKinerjaCountdown('spmCountdownBar', 'spm');
}

function setSpmTahun(tahun) {
  _spm_tahun = tahun;
  _populateTahunSelector('spmTahunSelect', _spm_tahun, setSpmTahun);
  _syncSpmBulanButtons();
  _renderSpmPeriodeInfo();
  _renderKinerjaCountdown && _renderKinerjaCountdown('spmCountdownBar', 'spm');
  loadSpmRekap();
}

function setSpmBulan(bulan) {
  if (!_user?.is_admin) {
    const bulanTerbuka = new Set(_periodeListTerbuka.filter(p => p.jenis === 'spm').map(p => p.bulan));
    if (!bulanTerbuka.has(bulan)) return;
    const periodeMatch = _periodeListTerbuka.find(p => p.jenis === 'spm' && p.bulan === bulan);
    if (periodeMatch) _spm_tahun = periodeMatch.tahun;
  }
  _spm_bulan = bulan;
  _syncSpmBulanButtons();
  _renderSpmPeriodeInfo();
  _renderKinerjaCountdown && _renderKinerjaCountdown('spmCountdownBar', 'spm');
  loadSpmRekap();
}

function _syncSpmBulanButtons() {
  const bulanTerbuka = new Set(_periodeListTerbuka.filter(p => p.jenis === 'spm').map(p => p.bulan));
  document.querySelectorAll('#spmBulanSelector .bulan-btn').forEach(b => {
    const bulan = parseInt(b.dataset.bulan);
    let isTampil, isEnabled;
    if (_user?.is_admin) {
      isTampil  = true;
      isEnabled = true;
    } else {
      isTampil  = bulanTerbuka.has(bulan);
      isEnabled = true;
    }
    b.style.display  = isTampil ? '' : 'none';
    b.disabled       = !isEnabled;
    b.style.opacity  = isEnabled ? '' : '0.4';
    b.style.cursor   = isEnabled ? '' : 'not-allowed';
    b.classList.toggle('active', bulan === _spm_bulan);
    const periodeMatch = _user?.is_admin
      ? _allPeriodeList.find(p => p.jenis === 'spm' && p.bulan === bulan && p.tahun === _spm_tahun)
      : _periodeListTerbuka.find(p => p.jenis === 'spm' && p.bulan === bulan);
    const tahunLabel = periodeMatch ? periodeMatch.tahun : _spm_tahun;
    b.textContent = `${BULAN_FULL[bulan]} ${tahunLabel}`;
  });

  const _spmSelector = document.getElementById('spmBulanSelector');
  if (_spmSelector) {
    const _spmBtns = [..._spmSelector.querySelectorAll('.bulan-btn')];
    _spmBtns.sort((a, b) => {
      if (_user?.is_admin) return parseInt(a.dataset.bulan) - parseInt(b.dataset.bulan);
      const pa = _periodeListTerbuka.find(p => p.jenis === 'spm' && p.bulan === parseInt(a.dataset.bulan));
      const pb = _periodeListTerbuka.find(p => p.jenis === 'spm' && p.bulan === parseInt(b.dataset.bulan));
      const ta = pa ? pa.tahun * 100 + pa.bulan : parseInt(a.dataset.bulan);
      const tb = pb ? pb.tahun * 100 + pb.bulan : parseInt(b.dataset.bulan);
      return ta - tb;
    });
    _spmBtns.forEach(b => _spmSelector.appendChild(b));
  }
}

function _renderSpmPeriodeInfo() {
  const el      = document.getElementById('spmActivePeriodeInfo');
  const wrapper = document.getElementById('spmBulanWrapper');

  if (_user?.is_admin) {
    if (el) el.style.display = 'none';
    if (wrapper) wrapper.style.display = '';
    return;
  }
  if (!el) return;

  const _spmAktif = _periodeListTerbuka.filter(p => p.jenis === 'spm');
  if (_spmAktif.length === 0) {
    el.style.display = 'none';
    if (wrapper) wrapper.style.display = 'none';
    return;
  }
  if (wrapper) wrapper.style.display = '';

  const svgEl = el.querySelector('svg');
  el.innerHTML = '';
  if (svgEl) el.appendChild(svgEl);

  const tahunMap = {};
  for (const p of _spmAktif) {
    if (!tahunMap[p.tahun]) tahunMap[p.tahun] = [];
    tahunMap[p.tahun].push(p.bulan);
  }
  const periodeStr = Object.keys(tahunMap)
    .sort((a, b) => a - b)
    .map(t => {
      const bulanStr = tahunMap[t].sort((a, b) => a - b).map(b => BULAN_FULL[b]).join(', ');
      return `${bulanStr} ${t}`;
    })
    .join(' · ');
  el.appendChild(document.createTextNode(`Periode input: ${periodeStr}`));
  el.style.display = '';
}

async function loadSpmRekap() {
  const tbody = document.getElementById('spmTableBody');
  if (!tbody) return;

  if (!_user?.is_admin && !_periodeListTerbuka.some(p => p.jenis === 'spm')) {
    const tableCard = tbody.closest('.card');
    if (tableCard) tableCard.style.display = 'none';
    let msgEl = document.getElementById('spmNoperiodeMsg');
    if (!msgEl) {
      msgEl = document.createElement('div');
      msgEl.id = 'spmNoperiodeMsg';
      tableCard ? tableCard.parentNode.insertBefore(msgEl, tableCard) : tbody.parentNode.insertBefore(msgEl, tbody.parentNode.firstChild);
    }
    msgEl.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:48px 20px;color:#94a3b8;background:#fff;border-radius:12px;border:1.5px solid #f1f5f9">
        <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.2" opacity=".35">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
        </svg>
        <div style="font-size:.95rem;font-weight:600;color:#64748b">Belum ada periode input yang aktif</div>
        <div style="font-size:.82rem;color:#94a3b8;text-align:center">Input data SPM belum dapat dilakukan.<br>Hubungi Admin untuk membuka periode pengisian.</div>
      </div>`;
    msgEl.style.display = '';
    return;
  }
  const _tableCard = tbody.closest('.card');
  if (_tableCard) _tableCard.style.display = '';
  const _msgEl = document.getElementById('spmNoperiodeMsg');
  if (_msgEl) _msgEl.style.display = 'none';

  tbody.innerHTML = `<tr class="empty-row"><td colspan="11">Memuat data...</td></tr>`;
  try {
    const r = await fetch(`/api/kinerja/rekap?bulan=${_spm_bulan}&tahun=${_spm_tahun}&jenis=spm`, { headers: authHeaders() });
    const d = await r.json();
    if (!r.ok) { tbody.innerHTML = `<tr class="empty-row"><td colspan="11">${d.error || 'Gagal memuat'}</td></tr>`; return; }
    let rekap = d.rekap || [];

    // Filter per assigned indikator user (non-admin hanya lihat indikator yg di-assign)
    if (!_user?.is_admin) {
      if (_userIndikatorIds && _userIndikatorIds.size > 0) {
        rekap = rekap.filter(row => _userIndikatorIds.has(Number(row.id)));
      } else {
        rekap = [];
      }
    }
    _spmData = rekap;
    _spmPage = 1;
    _renderSpmTable(tbody);
  } catch (err) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="11">Error: ${err.message}</td></tr>`;
  }
}

function _renderSpmTable(tbody) {
  if (!_spmData.length) {
    let emptyMsg = 'Belum ada indikator SPM aktif. Admin perlu menambahkan indikator dengan jenis SPM.';
    if (!_user?.is_admin) {
      if (!_userIndikatorIds || _userIndikatorIds.size === 0) {
        emptyMsg = 'Belum ada indikator yang di-assign ke akun Anda. Hubungi Admin untuk mengatur assignment indikator.';
      } else {
        emptyMsg = 'Tidak ada indikator SPM yang di-assign ke akun Anda pada periode ini.';
      }
    }
    tbody.innerHTML = `<tr class="empty-row"><td colspan="11">${emptyMsg}</td></tr>`;
    return;
  }
  const canEdit = _isKinerjaInputOpen(null, 'spm');
  let html = '';
  const _spmStart = (_spmPage - 1) * _spmPageSize;
  const _spmRows  = _spmData.slice(_spmStart, _spmStart + _spmPageSize);
  let i = _spmStart;

  _spmRows.forEach(row => {
    i++;
    const capaian = (row.realisasi_id && row.capaian_persen != null) ? Number(row.capaian_persen) : null;
    let badgeClass = 'na', badgeText = '—';
    if (capaian !== null && !isNaN(capaian)) {
      badgeText = capaian.toFixed(1) + '%';
      badgeClass = capaian >= 91 ? 'st' : capaian >= 76 ? 'ti' : capaian >= 66 ? 'sd' : capaian >= 51 ? 'rd' : 'sr';
    }
    const _targetNum = row.target_tahun != null ? Number(row.target_tahun) : null;
    const targetFmt = row.target_display != null
      ? String(row.target_display)
      : (_targetNum != null && !isNaN(_targetNum)
          ? (Number.isInteger(_targetNum) ? String(_targetNum) : _targetNum.toFixed(2))
          : '—');
    const rowStateClass = row.realisasi_id ? 'row-state-saved' : 'row-state-default';
    html += `<tr data-id="${row.id}" class="${rowStateClass}">
      <td class="td-sticky-no" style="text-align:center;color:var(--teks-muted);position:sticky;left:0;z-index:3">${i}</td>
      <td class="td-sticky-name" style="position:sticky;left:34px;z-index:3"><div style="font-weight:600;line-height:1.6"><span>${escHtml(row.nama_indikator || row.indikator_kinerja || '')}</span>${row.bermakna_negatif ? `<span title="Bermakna Negatif" style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;background:#fee2e2;border-radius:50%;margin-left:5px;vertical-align:middle;flex-shrink:0"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"9\" height=\"9\" fill=\"none\" viewBox=\"0 0 24 24\" stroke=\"#991b1b\" stroke-width=\"2.8\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M19 14l-7 7m0 0l-7-7m7 7V3\"/></svg></span>` : `<span title="Bermakna Positif" style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;background:#d1fae5;border-radius:50%;margin-left:5px;vertical-align:middle;flex-shrink:0"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"9\" height=\"9\" fill=\"none\" viewBox=\"0 0 24 24\" stroke=\"#065f46\" stroke-width=\"2.8\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M5 10l7-7m0 0l7 7m-7-7v18\"/></svg></span>`}</div>${row.formula ? `<div class="fx-wrap" style="margin-top:5px"><button style="display:inline-flex;align-items:center;gap:4px;font-size:0.62rem;font-weight:700;color:#0f766e;background:#f0fdfa;border:1px solid #99f6e4;border-radius:4px;padding:2px 6px;cursor:pointer;font-family:inherit" title="Lihat formula perhitungan" onclick="var d=this.nextElementSibling;var open=d.style.display==='block';d.style.display=open?'none':'block';this.querySelector('.fx-arrow').style.transform=open?'rotate(0deg)':'rotate(180deg)'"><span>Σ</span><span class=\"fx-arrow\" style=\"display:inline-block;transition:transform .2s;font-style:normal\">▾</span></button><div class="fx-panel" style="display:none;margin-top:4px">${_renderFormulaMath(row.formula, '')}</div></div>` : ''}</td>
      <td class="td-satuan">${escHtml(row.satuan || '')}</td>
      <td class="td-target" style="font-weight:700">${targetFmt}</td>
      ${_user?.is_admin ? `<td style="color:var(--teks-mid)">${escHtml(row.penanggung_jawab || '—')}</td>` : ''}
      <td class="realisasi-input-cell">
        <input type="number" id="spm_real_${row.id}" value="${row.realisasi_display != null ? row.realisasi_display : (row.realisasi != null ? parseFloat(row.realisasi) : '')}"
               placeholder="0" step="0.01" ${row.realisasi_id ? 'readonly' : ''}
               title="${row.realisasi_id ? 'Klik tombol Edit untuk mengisi realisasi' : ''}"
               style="${row.realisasi_id ? 'cursor:not-allowed' : ''}"
               onchange="markSpmDirty(${row.id})">
      </td>
      <td style="text-align:center">
        <span class="capaian-badge ${badgeClass}" id="spm_badge_${row.id}">${badgeText}</span>
      </td>
      <td class="textarea-cell">
        ${_renderPSCell('spm_fpenghambat', row.id, row.f_penghambat, capaian, canEdit, 'faktor penghambat', 'markSpmDirty', !!row.realisasi_id, false)}
      </td>
      <td class="textarea-cell">
        ${_renderPSCell('spm_solusi', row.id, row.solusi, capaian, canEdit, 'solusi', 'markSpmDirty', !!row.realisasi_id, false)}
      </td>
      <td class="textarea-cell">
        ${_renderPSCell('spm_fpendukung', row.id, row.f_pendukung, capaian, canEdit, 'faktor pendukung', 'markSpmDirty', !!row.realisasi_id, true)}
      </td>
      <td class="textarea-cell">
        ${_renderPSCell('spm_rencana', row.id, row.rencana_tl, capaian, canEdit, 'rencana tindak lanjut', 'markSpmDirty', !!row.realisasi_id, true)}
      </td>
      <td style="text-align:center" data-col="dukung">
        ${_renderDukungBtn(row, _spm_bulan, _spm_tahun, 'spm', !row.realisasi_id)}
      </td>
      <td style="text-align:center;white-space:nowrap">
        ${canEdit ? `
          <button class="btn-edit-row" id="spm_editbtn_${row.id}" title="Edit baris ini"
            onclick="toggleSpmEditRow(${row.id})"
            style="${row.realisasi_id ? '' : 'display:none'}">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            Edit
          </button>
          <button class="save-row-btn" id="spm_savebtn_${row.id}" disabled
            onclick="saveSpmRealisasiRow(${row.id})" title="Simpan"
            style="font-family:'Plus Jakarta Sans',sans-serif!important;${row.realisasi_id ? 'background:var(--sukses);color:#fff' : ''}">
            ${row.realisasi_id
  ? '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg> Tersimpan'
  : '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg> Simpan'}
          </button>
        ` : ''}
        ${_user?.is_admin && row.realisasi_id ? `
          <button class="btn-reset-row" id="spm_resetbtn_${row.id}" title="Reset data realisasi baris ini (admin)"
            onclick="resetRealisasiRow(${row.id}, 'spm')">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
            Reset
          </button>
        ` : ''}
      </td>
    </tr>`;
  });
  tbody.innerHTML = html;
  // Toggle header kolom Bidang / Sub Bagian (hanya tampil untuk admin)
  document.querySelectorAll('.col-bidang-spm').forEach(el => {
    el.style.display = _user?.is_admin ? '' : 'none';
  });
  renderPagination('spmPagination', _spmData.length, _spmPage, _spmPageSize, '_goSpmPage');
  // Warning "Belum diupload" untuk baris yang tersimpan tapi belum ada file dukung
  if (canEdit) {
    _spmData.forEach(row => {
      if (row.realisasi_id && !row.data_dukung_url) {
        const dukungCell = document.querySelector(`tr[data-id="${row.id}"] td[data-col="dukung"]`);
        if (dukungCell && !dukungCell.querySelector('.dukung-warning')) {
          dukungCell.insertAdjacentHTML('beforeend', `
            <div class="dukung-warning" title="Data dukung belum diupload untuk indikator ini">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
              Belum diupload
            </div>`);
        }
      }
    });
  }

  // Banner info akumulasi SPM
  const spmBanner = document.getElementById('spmAkumulasiInfo');
  if (spmBanner) {
    const jumlahRows = _spmRows.filter(r => {
      const nama = (r.nama_indikator || r.indikator_kinerja || '').trim().toLowerCase();
      return nama.startsWith('jumlah');
    });
    if (jumlahRows.length > 0) {
      const countEl = document.getElementById('spmAkumulasiCount');
      if (countEl) countEl.textContent = jumlahRows.length;
      spmBanner.style.display = 'flex';
    } else {
      spmBanner.style.display = 'none';
    }
  }
}

function toggleSpmEditRow(indikatorId) {
  if (!_user?.is_admin && !_isKinerjaInputOpen(null, 'spm')) {
    const pa = _periodeListTerbuka.find(p => p.jenis === 'spm' && p.bulan === _spm_bulan) ?? null;
    const close = pa?.close_at ? new Date(pa.close_at) : null;
    if (close && new Date() > close) {
      toast('Periode input sudah ditutup. Data tidak dapat diubah.', 'error');
    } else {
      toast('Periode input belum dibuka.', 'info');
    }
    return;
  }

  const realEl  = document.getElementById(`spm_real_${indikatorId}`);
  const probEl  = document.getElementById(`spm_fpenghambat_${indikatorId}`);
  const solEl   = document.getElementById(`spm_solusi_${indikatorId}`);
  const pendEl  = document.getElementById(`spm_fpendukung_${indikatorId}`);
  const rtlEl   = document.getElementById(`spm_rencana_${indikatorId}`);
  const editBtn = document.getElementById(`spm_editbtn_${indikatorId}`);
  const saveBtn = document.getElementById(`spm_savebtn_${indikatorId}`);
  const tr      = document.querySelector(`tr[data-id="${indikatorId}"]`);
  const isReadonly = realEl?.hasAttribute('readonly');

  [realEl, probEl, solEl, pendEl, rtlEl].forEach(el => {
    if (!el) return;
    if (isReadonly) {
      el.removeAttribute('readonly');
      el.style.background = 'var(--putih)';
      el.style.cursor = '';
      el.style.resize = '';
      el.title = '';
    } else {
      el.setAttribute('readonly', '');
      el.style.background = '';
      el.style.cursor = 'not-allowed';
      if (el.tagName === 'TEXTAREA') el.style.resize = 'none';
      el.title = 'Klik tombol Edit untuk mengisi';
    }
  });


  // Switch ps-cell-wrap antara view mode (ps-read) dan edit mode (textarea)
  const psCells = document.querySelectorAll(`tr[data-id="${indikatorId}"] .ps-cell-wrap`);
  psCells.forEach(wrap => {
    const readEl = wrap.querySelector('.ps-read');
    const taEl   = wrap.querySelector('textarea');
    if (!taEl) return;
    if (isReadonly) {
      // Masuk edit mode: sembunyikan view, tampilkan textarea — skip wrap yg hidden
      if (wrap.style.display === 'none') return;
      if (readEl) readEl.style.display = 'none';
      taEl.style.display = '';
      requestAnimationFrame(() => _autoResizeTA(taEl));
    } else {
      // Keluar edit mode: update view text lalu tampilkan kembali
      const val = taEl.value || '';
      const LIMIT = 80;
      const shortEl = wrap.querySelector('[id$="short_' + indikatorId + '"]');
      const fullEl  = wrap.querySelector('[id$="full_' + indikatorId + '"]');
      const moreBtn = wrap.querySelector('.ps-more-btn');
      if (shortEl) { shortEl.innerHTML = escHtml(val.slice(0, LIMIT)) + (val.length > LIMIT ? '<span class="ps-ellipsis">…</span>' : ''); shortEl.style.display = ''; }
      if (fullEl)  { fullEl.textContent = val; fullEl.style.display = 'none'; }
      if (moreBtn) { moreBtn.textContent = 'Selengkapnya'; moreBtn.style.display = val.length > LIMIT ? '' : 'none'; }
      if (readEl)  { readEl.style.display = val.trim() ? '' : 'none'; }
      taEl.style.display = 'none';
      taEl.setAttribute('readonly', '');
      taEl.style.cursor = 'not-allowed';
    }
  });
  // Unlock / lock tombol data dukung
  const dukungBtn     = document.querySelector(`[data-dukung-id="${indikatorId}"] .dukung-uploaded-btn`);
  const uploadOnlyBtn = document.querySelector(`tr[data-id="${indikatorId}"] .dukung-upload-btn`);
  const deleteBtn     = document.querySelector(`tr[data-id="${indikatorId}"] .dukung-delete-btn`);

  if (dukungBtn) {
    if (isReadonly) {
      dukungBtn.disabled = false;
      dukungBtn.style.cursor = 'pointer';
      dukungBtn.style.opacity = '1';
      dukungBtn.title = 'Kelola / ganti file data dukung';
      const twV = dukungBtn.dataset.tw;
      const tahunV = dukungBtn.dataset.tahun;
      dukungBtn.onclick = () => openSpmDukungModal(indikatorId, parseInt(twV), parseInt(tahunV));
    } else {
      dukungBtn.disabled = true;
      dukungBtn.style.cursor = 'not-allowed';
      dukungBtn.style.opacity = '.85';
      dukungBtn.title = 'Klik Edit terlebih dahulu untuk mengganti file';
      dukungBtn.onclick = null;
    }
  }

  if (deleteBtn) {
    if (isReadonly) {
      deleteBtn.disabled = false;
      deleteBtn.style.cursor = 'pointer';
      deleteBtn.style.opacity = '1';
      deleteBtn.title = 'Hapus semua file data dukung';
      const twV    = deleteBtn.dataset.tw;
      const tahunV = deleteBtn.dataset.tahun;
      const srcV   = deleteBtn.dataset.source;
      deleteBtn.onclick = () => deleteDukungAll(indikatorId, parseInt(twV), parseInt(tahunV), srcV);
    } else {
      deleteBtn.disabled = true;
      deleteBtn.style.cursor = 'not-allowed';
      deleteBtn.style.opacity = '.5';
      deleteBtn.title = 'Klik Edit terlebih dahulu untuk menghapus file';
      deleteBtn.onclick = null;
    }
  }

  if (uploadOnlyBtn) {
    if (isReadonly) {
      uploadOnlyBtn.disabled = false;
      uploadOnlyBtn.style.cursor = 'pointer';
      uploadOnlyBtn.style.opacity = '1';
      uploadOnlyBtn.style.borderStyle = 'solid';
      uploadOnlyBtn.title = 'Upload file data dukung';
      const twV    = uploadOnlyBtn.dataset.tw;
      const tahunV = uploadOnlyBtn.dataset.tahun;
      const src    = uploadOnlyBtn.dataset.source;
      uploadOnlyBtn.onclick = () => triggerDukungUpload(indikatorId, parseInt(twV), parseInt(tahunV), src);
    } else {
      uploadOnlyBtn.disabled = true;
      uploadOnlyBtn.style.cursor = 'not-allowed';
      uploadOnlyBtn.style.opacity = '.65';
      uploadOnlyBtn.style.borderStyle = 'dashed';
      uploadOnlyBtn.title = 'Klik Edit terlebih dahulu untuk mengupload file';
      uploadOnlyBtn.onclick = null;
    }
  }

  if (isReadonly) {
    if (tr) { tr.classList.remove('row-state-default', 'row-state-saved'); tr.classList.add('row-state-editing'); }
    if (editBtn) {
      editBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg> Sedang Diedit`;
      editBtn.classList.add('btn-edit-row--active');
      editBtn.title = 'Klik untuk batalkan edit';
    }
    if (saveBtn) {
      saveBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg> Simpan`;
      saveBtn.disabled = true;
      saveBtn.style.background = '';
      saveBtn.style.color = '';
    }
    if (realEl) realEl.focus();
    _updateSpmSaveBtnState(indikatorId);
  } else {
    const row = _spmData.find(r => r.id === indikatorId);
    if (tr) { tr.classList.remove('row-state-editing'); tr.classList.add(row?.realisasi_id ? 'row-state-saved' : 'row-state-default'); }
    if (editBtn) {
      editBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg> Edit`;
      editBtn.classList.remove('btn-edit-row--active');
      editBtn.title = 'Edit baris ini';
    }
    if (saveBtn) {
      saveBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg> Simpan`;
      saveBtn.style.background = '';
      saveBtn.style.color = '';
      saveBtn.disabled = true;
    }
  }
}

function markSpmDirty(indikatorId) {
  previewSpmCapaian(indikatorId);
  _updateSpmSaveBtnState(indikatorId);
}

function _updateSpmSaveBtnState(indikatorId) {
  const btn = document.getElementById(`spm_savebtn_${indikatorId}`);
  if (!btn) return;
  const row  = _spmData.find(r => r.id === indikatorId);
  const fieldArgs = {
    realVal: document.getElementById(`spm_real_${indikatorId}`)?.value,
    targetVal: row?.target_tahun,
    bermakna_negatif: row?.bermakna_negatif,
    fpenghambatVal: document.getElementById(`spm_fpenghambat_${indikatorId}`)?.value ?? '',
    solusiVal:      document.getElementById(`spm_solusi_${indikatorId}`)?.value ?? '',
    fpendukungVal:  document.getElementById(`spm_fpendukung_${indikatorId}`)?.value ?? '',
    rencanaVal:     document.getElementById(`spm_rencana_${indikatorId}`)?.value ?? '',
    hasDukung:      !!row?.data_dukung_url,
  };
  const ok = _canSaveRow(fieldArgs);
  const okUpload = _canSaveRow(fieldArgs, false);
  btn.disabled         = !ok;
  btn.style.background = ok ? '#0d9488' : '';
  btn.style.color      = ok ? '#fff'    : '';
  btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg> Simpan`;

  // Enable/disable tombol Upload berdasarkan kondisi field wajib
  const _uploadBtn_spm = document.querySelector(`tr[data-id="${indikatorId}"] .dukung-upload-btn`);
  if (_uploadBtn_spm && !_uploadBtn_spm.classList.contains('dukung-uploaded-btn')) {
    if (okUpload) {
      _uploadBtn_spm.disabled = false;
      _uploadBtn_spm.style.cursor = 'pointer';
      _uploadBtn_spm.style.opacity = '1';
      _uploadBtn_spm.style.borderStyle = 'dashed';
      _uploadBtn_spm.style.borderColor = '#6ee7b7';
      _uploadBtn_spm.style.background = '#ecfdf5';
      _uploadBtn_spm.style.color = '#065f46';
      _uploadBtn_spm.title = 'Upload data dukung';
      _uploadBtn_spm.onclick = () => _openDukungFromBtn(_uploadBtn_spm);
    } else {
      _uploadBtn_spm.disabled = true;
      _uploadBtn_spm.style.cursor = 'not-allowed';
      _uploadBtn_spm.style.opacity = '.65';
      _uploadBtn_spm.style.borderStyle = 'dashed';
      _uploadBtn_spm.style.borderColor = '#fca5a5';
      _uploadBtn_spm.style.background = '#fee2e2';
      _uploadBtn_spm.style.color = '#991b1b';
      _uploadBtn_spm.title = 'Isi realisasi dan field wajib terlebih dahulu';
      _uploadBtn_spm.onclick = null;
    }
  }
}

function previewSpmCapaian(indikatorId) {
  const row = _spmData.find(r => r.id === indikatorId);
  if (!row) return;
  const realEl = document.getElementById(`spm_real_${indikatorId}`);
  if (!realEl) return;
  const realisasi = parseFloat(realEl.value);
  const target    = parseFloat(row.target_tahun);
  const badge     = document.getElementById(`spm_badge_${indikatorId}`);
  if (!badge) return;
  if (isNaN(realisasi) || isNaN(target) || target === 0) {
    badge.textContent = '—'; badge.className = 'capaian-badge na';
    _togglePermasalahanSolusi('spm', indikatorId, null);
    return;
  }
  let capaian = row.bermakna_negatif
    ? ((target - (_hitungRealisasiEfektifPreview(row, realisasi) - target)) / target) * 100
    : (_hitungRealisasiEfektifPreview(row, realisasi) / target) * 100;
  badge.textContent = capaian.toFixed(1) + '%';
  badge.className = 'capaian-badge ' + (capaian >= 91 ? 'st' : capaian >= 76 ? 'ti' : capaian >= 66 ? 'sd' : capaian >= 51 ? 'rd' : 'sr');
  _togglePermasalahanSolusi('spm', indikatorId, capaian);
}

async function saveSpmRealisasiRow(indikatorId) {
  const btn    = document.getElementById(`spm_savebtn_${indikatorId}`);
  const realEl = document.getElementById(`spm_real_${indikatorId}`);
  const real   = realEl?.value;
  let fpenghambat = document.getElementById(`spm_fpenghambat_${indikatorId}`)?.value?.trim();
  let solusi      = document.getElementById(`spm_solusi_${indikatorId}`)?.value?.trim();
  let fpendukung  = document.getElementById(`spm_fpendukung_${indikatorId}`)?.value?.trim();
  let rencana     = document.getElementById(`spm_rencana_${indikatorId}`)?.value?.trim();

  const row = _spmData.find(r => r.id === indikatorId);
  const _realVal   = parseFloat(real);
  const _targetVal = parseFloat(row?.target_tahun);
  if (!isNaN(_realVal) && !isNaN(_targetVal) && _targetVal !== 0) {
    const _capaian = row?.bermakna_negatif
      ? ((_targetVal - (_realVal - _targetVal)) / _targetVal) * 100
      : (_realVal / _targetVal) * 100;
    if (_capaian < 100) {
      if (!fpenghambat || _isSymbolOnly(fpenghambat)) { toast('Faktor Penghambat wajib diisi, tidak boleh hanya simbol/tanda baca.', 'error'); return; }
      if (!solusi || _isSymbolOnly(solusi))           { toast('Solusi wajib diisi, tidak boleh hanya simbol/tanda baca.', 'error'); return; }
      fpendukung = ''; rencana = '';
    } else {
      if (!fpendukung || _isSymbolOnly(fpendukung)) { toast('Faktor Pendukung wajib diisi, tidak boleh hanya simbol/tanda baca.', 'error'); return; }
      if (!rencana || _isSymbolOnly(rencana))       { toast('Rencana Tindak Lanjut wajib diisi, tidak boleh hanya simbol/tanda baca.', 'error'); return; }
      fpenghambat = ''; solusi = '';
    }
  }

  if (btn) { btn.disabled = true; btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="animation:spin .8s linear infinite"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg> ...`; }
  try {
    const r = await fetch('/api/kinerja/realisasi', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({
        indikator_id: indikatorId, bulan: _spm_bulan, tahun: _spm_tahun,
        realisasi: real !== '' ? parseFloat(real) : null,
        realisasi_display: real !== '' ? real : null,
        f_penghambat: fpenghambat || null, solusi: solusi || null, f_pendukung: fpendukung || null, rencana_tl: rencana || null,
      }),
    });
    const d = await r.json();
    if (!r.ok) {
      toast(d.error || 'Gagal menyimpan', 'error');
      if (btn) { btn.disabled = false; btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg> Simpan`; }
    } else {
      toast('Tersimpan');
      // Invalidate cache chart dashboard supaya Pantau Indikator fetch data fresh
      if (typeof _invalidateKinerjaDashboardCache === 'function') _invalidateKinerjaDashboardCache(_spm_tahun);
      ['spm_real_', 'spm_fpenghambat_', 'spm_solusi_', 'spm_fpendukung_', 'spm_rencana_'].forEach(prefix => {
        const el = document.getElementById(`${prefix}${indikatorId}`);
        if (el) {
          el.setAttribute('readonly', '');
          el.style.background = '';
          el.style.cursor = 'not-allowed';
          if (el.tagName === 'TEXTAREA') { el.style.resize = 'none'; el.style.display = 'none'; }
          el.title = 'Klik tombol Edit untuk mengisi';
        }
      });
      // Kunci kembali tombol data dukung (Upload kembali ke warna default)
      _lockDukungButtons(indikatorId);
      // Tampilkan tombol Reset (admin) tanpa perlu reload
      _ensureResetBtn(indikatorId, 'spm_', 'spm');
      const tr = document.querySelector(`tr[data-id="${indikatorId}"]`);
      if (tr) { tr.classList.remove('row-state-default', 'row-state-editing'); tr.classList.add('row-state-saved'); }
      const editBtn = document.getElementById(`spm_editbtn_${indikatorId}`);
      if (editBtn) {
        editBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg> Edit`;
        editBtn.classList.remove('btn-edit-row--active');
        editBtn.title = 'Edit baris ini';
      }
      if (btn) {
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg> Tersimpan`;
        btn.style.background = 'var(--sukses)';
        btn.style.color = '#fff';
        btn.disabled = true;
      }
      const idx = _spmData.findIndex(x => x.id === indikatorId);
      if (idx >= 0) {
        _spmData[idx].realisasi         = d.realisasi?.realisasi ?? null;
        _spmData[idx].realisasi_display = d.realisasi?.realisasi_display ?? null;
        _spmData[idx].f_penghambat      = d.realisasi?.f_penghambat ?? null;
        _spmData[idx].solusi            = d.realisasi?.solusi ?? null;
        _spmData[idx].f_pendukung       = d.realisasi?.f_pendukung ?? null;
        _spmData[idx].rencana_tl        = d.realisasi?.rencana_tl ?? null;
        _spmData[idx].realisasi_id      = d.realisasi?.id ?? _spmData[idx].realisasi_id;
      }
      // Refresh capaian_persen dari server (hitung ulang kumulatif lintas bulan)
      fetch(`/api/kinerja/rekap?bulan=${_spm_bulan}&tahun=${_spm_tahun}&jenis=spm`, { headers: authHeaders() })
        .then(res => res.ok ? res.json() : null)
        .then(fresh => {
          if (!fresh?.rekap) return;
          for (const freshRow of fresh.rekap) {
            const i = _spmData.findIndex(x => x.id === freshRow.id);
            if (i >= 0) _spmData[i].capaian_persen = freshRow.capaian_persen;
            const badge = document.getElementById(`spm_badge_${freshRow.id}`);
            if (badge) {
              const cap = (freshRow.realisasi_id && freshRow.capaian_persen != null) ? Number(freshRow.capaian_persen) : null;
              if (cap === null || isNaN(cap)) {
                badge.textContent = '—'; badge.className = 'capaian-badge na';
              } else {
                badge.textContent = cap.toFixed(1) + '%';
                badge.className = 'capaian-badge ' + (cap >= 91 ? 'st' : cap >= 76 ? 'ti' : cap >= 66 ? 'sd' : cap >= 51 ? 'rd' : 'sr');
              }
            }
          }
        }).catch(() => {});
      const _savedSpm = _spmData[idx >= 0 ? idx : -1];
      const _rSpm = parseFloat(_savedSpm?.realisasi ?? '');
      const _tSpm = parseFloat(_savedSpm?.target_tahun ?? '');
      if (!isNaN(_rSpm) && !isNaN(_tSpm) && _tSpm !== 0) {
        const _cSpm = _savedSpm?.bermakna_negatif
          ? ((_tSpm - (_rSpm - _tSpm)) / _tSpm) * 100
          : (_rSpm / _tSpm) * 100;
        _togglePermasalahanSolusi('spm', indikatorId, _cSpm);
        [['spm_fpenghambat', _savedSpm?.f_penghambat], ['spm_solusi', _savedSpm?.solusi],
         ['spm_fpendukung', _savedSpm?.f_pendukung], ['spm_rencana', _savedSpm?.rencana_tl]].forEach(([base, val]) => {
          const readEl  = document.getElementById(`${base}read_${indikatorId}`);
          const shortEl = document.getElementById(`${base}short_${indikatorId}`);
          if (readEl && shortEl) {
            shortEl.textContent = val || '';
            readEl.style.display = (val || '').trim().length > 0 ? '' : 'none';
          }
        });
      }
      // Warning data dukung belum diupload
      if (!row?.data_dukung_url) {
        const dukungCell = document.querySelector(`tr[data-id="${indikatorId}"] td[data-col="dukung"]`);
        if (dukungCell && !dukungCell.querySelector('.dukung-warning')) {
          dukungCell.insertAdjacentHTML('beforeend', `
            <div class="dukung-warning" title="Data dukung belum diupload untuk indikator ini">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
              Belum diupload
            </div>`);
        }
      }
    }
  } catch (err) {
    toast('Error: ' + err.message, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg> Simpan`; }
  }
}

// ── Reset realisasi row (admin only) ────────────────────────────────────────
async function resetRealisasiRow(indikatorId, jenis) {
  if (!_user?.is_admin) return;
  const ok = await showConfirm({ title: 'Reset Realisasi', msg: 'Data realisasi baris ini akan dihapus dan baris kembali kosong.', okText: 'Ya, Reset', icon: 'trash' }); if (!ok) return;

  const dataArr = jenis === 'ikk' ? _ikkData : jenis === 'spm' ? _spmData : _kinerjaData;
  const row = dataArr.find(r => r.id === indikatorId);
  if (!row?.realisasi_id) return;

  const prefix = jenis === 'ikk' ? 'ikk_' : jenis === 'spm' ? 'spm_' : '';
  const resetBtn = document.getElementById(`${prefix}resetbtn_${indikatorId}`);
  if (resetBtn) { resetBtn.disabled = true; resetBtn.style.opacity = '0.5'; }

  try {
    const r = await fetch(`/api/kinerja/realisasi/${row.realisasi_id}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      toast(d.error || 'Gagal mereset data', 'error');
      if (resetBtn) { resetBtn.disabled = false; resetBtn.style.opacity = ''; }
      return;
    }
    toast('Data realisasi berhasil direset');
    // Reload dari server agar state sinkron
    if (jenis === 'ikk') {
      await loadIkkRekap();
    } else if (jenis === 'spm') {
      await loadSpmRekap();
    } else {
      await loadKinerjaRekap();
    }
  } catch (err) {
    toast('Error: ' + err.message, 'error');
    if (resetBtn) { resetBtn.disabled = false; resetBtn.style.opacity = ''; }
  }
}

async function openSpmDukungModal(indikatorId, bulan, tahun) {
  _dukungState = { indikatorId, tw: bulan, tahun, files: [], _source: 'spm' };
  const area = document.getElementById('dukungUploadArea');
  const fi   = document.getElementById('dukungFileInput');
  const pw   = document.getElementById('dukungProgressWrap');
  if (area) { area.classList.remove('drag-over'); area.style.display = ''; }
  if (fi)   fi.value = '';
  if (pw)   pw.style.display = 'none';

  const row = _spmData.find(r => r.id === indikatorId);
  document.getElementById('dukungIndikatorLabel').textContent = row?.nama_indikator || row?.indikator_kinerja || '';
  document.getElementById('dukungTwLabel').textContent = `${BULAN_FULL[bulan] || bulan} ${tahun} — SPM`;

  if (row?.data_dukung_url) {
    try {
      const parsed = JSON.parse(row.data_dukung_url);
      _dukungState.files = Array.isArray(parsed) ? parsed.filter(f => f && f.url) : [];
    } catch {
      _dukungState.files = [{ url: row.data_dukung_url, name: row.data_dukung_nama || 'Dokumen' }];
    }
  }
  _renderDukungList();
  openModal('modalDukung');
}