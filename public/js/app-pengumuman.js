// ============================================================
//  PENGUMUMAN SISTEM — Admin kelola, user lihat saat login
//  Endpoint: /api/pengumuman
//
//  Struktur data per pengumuman:
//  {
//    id         : string (auto dari backend, misal UUID/timestamp)
//    judul      : string
//    isi        : string  (HTML diizinkan, tapi sanitasi di backend)
//    tipe       : 'info' | 'warning' | 'success' | 'danger'
//    tanggal_mulai  : string ISO (date)
//    tanggal_selesai: string ISO (date)  — kapan tidak ditampilkan lagi
//    aktif      : boolean
//    dibuat_oleh: string (email admin)
//    dibuat_pada: string ISO datetime
//  }
//
//  Cara integrasi:
//  1. Tambahkan API.getPengumuman / savePengumuman / deletePengumuman di api.js
//     (lihat snippet di bawah file ini)
//  2. Di app-core.js, panggil setelah login berhasil (setelah startNotifPoller()):
//       setTimeout(() => showPengumumanLoginPopup(), 500);
//  3. Untuk halaman Admin → Master Data, tambahkan tab "Pengumuman" yang
//     memanggil renderKelolaPengumuman('containerId')
// ============================================================

// ─────────────────────────────────────────────
//  TAMPIL POPUP PENGUMUMAN UNTUK USER (saat login)
// ─────────────────────────────────────────────

/**
 * Ambil pengumuman yang aktif & masih dalam rentang tanggal, lalu tampilkan
 * sebagai popup bertingkat (satu per satu, bisa ada beberapa).
 * Pengumuman yang sudah pernah "Tutup" pada sesi ini tidak ditampilkan ulang.
 */
async function showPengumumanLoginPopup() {
  if (!currentUser) return;
  try {
    const semua = await API.getPengumuman({ aktif: 'true' });
    if (!semua || !semua.length) return;

    const today = _isoDateOnly(new Date().toISOString());
    const sesi  = _getPengumumanSesiDismissed(); // array id yang sudah ditutup di sesi ini
    const perma = _getPengumumanPermaDismissed(); // array id yang "jangan tampilkan lagi"

    const tampil = semua.filter(p => {
      if (sesi.includes(String(p.id)))  return false;
      if (perma.includes(String(p.id))) return false;
      // Normalisasi: ambil hanya bagian YYYY-MM-DD (DB bisa kirim datetime penuh)
      const mulai   = _isoDateOnly(p.tanggal_mulai)   || '1970-01-01';
      const selesai = _isoDateOnly(p.tanggal_selesai) || '2999-12-31';
      // aktif bisa datang sebagai boolean atau integer 0/1 dari DB
      const isAktif = p.aktif === true || p.aktif === 1 || p.aktif === '1' || p.aktif === 't';
      if (!isAktif) return false;
      return today >= mulai && today <= selesai;
    });

    if (!tampil.length) return;

    // Tampilkan popup pertama; sisanya di-queue
    _showSatuPengumuman(tampil, 0);
  } catch(e) { /* silent — jangan ganggu login */ }
}

/** Ambil set id pengumuman yang sudah ditutup di sesi ini (pakai sessionStorage) */
function _getPengumumanSesiDismissed() {
  try {
    return JSON.parse(sessionStorage.getItem('pgm_dismissed') || '[]');
  } catch { return []; }
}

/** Tandai pengumuman sudah ditutup di sesi ini */
function _markPengumumanDismissed(id) {
  try {
    const arr = _getPengumumanSesiDismissed();
    if (!arr.includes(String(id))) { arr.push(String(id)); sessionStorage.setItem('pgm_dismissed', JSON.stringify(arr)); }
  } catch {}
}

/** Ambil set id pengumuman yang sudah ditandai "jangan tampilkan lagi" (localStorage) */
function _pgmPermaKey() {
  // currentUser.email sudah pasti ada karena dipanggil setelah login
  return 'pgm_perma_dismissed__' + (currentUser?.email || 'guest');
}

function _getPengumumanPermaDismissed() {
  try {
    return JSON.parse(localStorage.getItem(_pgmPermaKey()) || '[]');
  } catch { return []; }
}

function _markPengumumanPermaDismissed(id) {
  try {
    const key = _pgmPermaKey();
    const arr = _getPengumumanPermaDismissed();
    if (!arr.includes(String(id))) { arr.push(String(id)); localStorage.setItem(key, JSON.stringify(arr)); }
    _markPengumumanDismissed(id);
  } catch {}
}

/** Tampilkan satu pengumuman dari list; setelah tutup, tampilkan berikutnya */
function _showSatuPengumuman(list, idx) {
  if (idx >= list.length) return;
  const p = list[idx];

  // Hapus popup lama jika ada
  const lama = document.getElementById('pengumumanLoginPopup');
  if (lama) lama.remove();

  const tipeCfg = {
    info    : { bg: 'linear-gradient(135deg,#0ea5e9,#0284c7)', light: '#e0f2fe', border: '#7dd3fc', text: '#0c4a6e', icon: 'campaign' },
    warning : { bg: 'linear-gradient(135deg,#f59e0b,#d97706)', light: '#fffbeb', border: '#fde68a', text: '#78350f', icon: 'warning' },
    success : { bg: 'linear-gradient(135deg,#10b981,#059669)', light: '#d1fae5', border: '#6ee7b7', text: '#064e3b', icon: 'check_circle' },
    danger  : { bg: 'linear-gradient(135deg,#ef4444,#dc2626)', light: '#fef2f2', border: '#fca5a5', text: '#7f1d1d', icon: 'error' },
  };
  const cfg = tipeCfg[p.tipe] || tipeCfg.info;
  const total = list.length;
  const sisa  = total - idx - 1;

  const overlay = document.createElement('div');
  overlay.id = 'pengumumanLoginPopup';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(15,23,42,0.6);z-index:9990;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);animation:fadeIn 0.25s ease';

  overlay.innerHTML = `
    <style>
      @keyframes pgmIn{from{opacity:0;transform:translateY(16px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
      #pgmCard{background:#fff;border-radius:18px;width:460px;max-width:calc(100vw - 32px);overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,0.28);animation:pgmIn .3s cubic-bezier(.16,1,.3,1)}
      #pgmCard .pgm-header{background:${cfg.bg};padding:18px 20px 14px;color:white}
      #pgmCard .pgm-header-row{display:flex;align-items:center;gap:10px}
      #pgmCard .pgm-icon{width:36px;height:36px;background:rgba(255,255,255,0.2);border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
      #pgmCard .pgm-title{font-size:15px;font-weight:700;flex:1;line-height:1.3}
      #pgmCard .pgm-counter{font-size:11px;background:rgba(255,255,255,0.25);border-radius:20px;padding:3px 9px;white-space:nowrap}
      #pgmCard .pgm-body{padding:24px 28px;max-height:320px;overflow-y:auto}
      #pgmCard .pgm-isi{font-size:13.5px;color:#334155;line-height:1.75;white-space:pre-wrap}
      #pgmCard .pgm-isi ol,#pgmCard .pgm-isi ul{padding-left:20px;margin:4px 0}
      #pgmCard .pgm-isi li{margin:2px 0}
      #pgmCard .pgm-notice{margin-top:14px;background:${cfg.light};border:1px solid ${cfg.border};border-radius:8px;padding:9px 12px;font-size:12px;color:${cfg.text};display:flex;align-items:center;gap:6px}
      #pgmCard .pgm-footer{padding:14px 28px;border-top:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between;gap:8px}

      #pgmCard .pgm-btn-perma{padding:9px 16px;background:none;border:1.5px solid #e2e8f0;border-radius:9px;font-size:12px;font-weight:600;color:#94a3b8;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:5px;transition:all .15s}
      #pgmCard .pgm-btn-perma:hover{background:#fef2f2;border-color:#fca5a5;color:#ef4444}
      #pgmCard .pgm-btn-next{padding:9px 20px;background:${cfg.bg};border:none;border-radius:9px;font-size:13px;font-weight:700;color:white;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:5px;transition:opacity .15s}
      #pgmCard .pgm-btn-next:hover{opacity:0.87}
    </style>
    <div id="pgmCard">
      <div class="pgm-header">
        <div class="pgm-header-row">
          <div class="pgm-icon"><span class="material-icons" style="font-size:20px">${cfg.icon}</span></div>
          <div class="pgm-title">${_escHtml(p.judul)}</div>
          ${total > 1 ? `<span class="pgm-counter">${idx + 1} / ${total}</span>` : ''}
        </div>
      </div>
      <div class="pgm-body">
        <div class="pgm-isi">${_sanitizeHtml(p.isi)}</div>
      </div>
      <div class="pgm-footer">
        <button class="pgm-btn-perma" onclick="_dismissPengumuman('${p.id}',false,null,0,true)" title="Pengumuman ini tidak akan ditampilkan lagi">
          <span class="material-icons" style="font-size:14px">visibility_off</span> Jangan tampilkan lagi
        </button>
        <div style="display:flex;gap:8px">
${sisa > 0 ? `<button class="pgm-btn-next" onclick="_dismissPengumuman('${p.id}',true,${JSON.stringify(list).replace(/</g,'\\u003c')},${idx+1})">
            Berikutnya <span class="material-icons" style="font-size:16px">arrow_forward</span>
          </button>` : `<button class="pgm-btn-next" onclick="_dismissPengumuman('${p.id}',false)">
            <span class="material-icons" style="font-size:16px">check</span> Mengerti
          </button>`}
        </div>
      </div>
    </div>`;

  document.body.appendChild(overlay);
}

/** Tutup popup & lanjut ke pengumuman berikutnya (jika ada) */
function _dismissPengumuman(id, lanjut, list, nextIdx, perma) {
  if (perma) {
    _markPengumumanPermaDismissed(id);
  } else {
    _markPengumumanDismissed(id);
  }
  const el = document.getElementById('pengumumanLoginPopup');
  if (el) el.remove();
  if (lanjut && list && nextIdx !== undefined) {
    setTimeout(() => _showSatuPengumuman(list, nextIdx), 100);
  }
}

/** Escape HTML untuk judul */
function _escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/**
 * Sanitasi HTML isi pengumuman — izinkan tag aman saja (<b>, <i>, <u>, <br>, <ul>, <ol>, <li>, <p>, <strong>, <em>)
 * Hapus <script>, event handler (on*=), href javascript:, dan tag berbahaya lainnya.
 */
function _sanitizeHtml(html) {
  if (!html) return '';
  // Hapus tag script & style beserta isinya
  let s = html.replace(/<script[\s\S]*?<\/script>/gi, '')
              .replace(/<style[\s\S]*?<\/style>/gi, '');
  // Hapus semua event handler inline (onclick=, onload=, onerror=, dst.)
  s = s.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '');
  // Hapus href/src dengan javascript:
  s = s.replace(/(?:href|src)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi, '');
  // Hapus tag berbahaya: iframe, object, embed, form, input, button, link, meta, base
  s = s.replace(/<\/?(iframe|object|embed|form|input|button|textarea|select|link|meta|base|applet|canvas|svg)[^>]*>/gi, '');
  return s;
}

/** Ambil hanya bagian YYYY-MM-DD dari string ISO (date atau datetime) */
function _isoDateOnly(str) {
  if (!str) return '';
  const m = String(str).match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

/** Format tanggal pengumuman → "23 Apr 2026" */
function _fmtTglPgm(iso) {
  if (!iso || iso === '—') return '—';
  try {
    // Ekstrak YYYY-MM-DD agar tidak kena timezone offset dari new Date()
    const match = String(iso).match(/(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const y = Number(match[1]), m = Number(match[2]), d = Number(match[3]);
      if (y && m && d) {
        const BULAN_SHORT = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
        return `${String(d).padStart(2,'0')} ${BULAN_SHORT[m-1]} ${y}`;
      }
    }
    return String(iso);
  } catch { return iso; }
}


// ─────────────────────────────────────────────
//  HALAMAN KELOLA PENGUMUMAN (untuk Admin)
//  Panggil: renderKelolaPengumuman('id-container')
// ─────────────────────────────────────────────

let _pgmList   = [];   // cache list
let _pgmPage   = 1;

async function renderKelolaPengumuman(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:16px">
      <div>
        <div style="font-size:15px;font-weight:700;color:var(--text)">Pengumuman Sistem</div>
        <div style="font-size:12px;color:var(--text-light);margin-top:2px">Notifikasi update fitur & info penting yang tampil saat user login</div>
      </div>
      <button class="btn btn-primary" onclick="openFormPengumuman(null,'${containerId}')">
        <span class="material-icons">add</span> Buat Pengumuman
      </button>
    </div>
    <div id="pgmTableWrap">
      <div style="padding:32px;text-align:center;color:var(--text-light)">
        <div style="position:relative;width:36px;height:36px;display:inline-block;margin-bottom:8px">
          <div style="position:absolute;inset:0;border-radius:50%;border:3px solid transparent;border-top-color:#0d9488;animation:spin 1.1s linear infinite"></div>
        </div>
        <div style="font-size:13px">Memuat data...</div>
      </div>
    </div>`;

  await _loadPgmTable(containerId);
}

async function _loadPgmTable(containerId) {
  const wrap = document.getElementById('pgmTableWrap');
  if (!wrap) return;
  try {
    _pgmList = await API.getPengumuman({});
    if (!Array.isArray(_pgmList)) _pgmList = [];
  } catch(e) {
    _pgmList = [];
  }
  _renderPgmTable(containerId);
}

function _renderPgmTable(containerId) {
  const wrap = document.getElementById('pgmTableWrap');
  if (!wrap) return;

  const today = _isoDateOnly(new Date().toISOString());
  const { items, page, totalPages, total } = paginateData(_pgmList, _pgmPage);
  _pgmPage = page;

  if (!_pgmList.length) {
    wrap.innerHTML = `<div style="padding:48px;text-align:center;color:var(--text-light)">
      <span class="material-icons" style="font-size:40px;display:block;margin-bottom:8px;opacity:0.35">campaign</span>
      Belum ada pengumuman. Klik <strong>Buat Pengumuman</strong> untuk menambahkan.
    </div>`;
    return;
  }

  const tipeCfg = {
    info   : { label:'Info',    cls:'badge-info',    icon:'campaign' },
    warning: { label:'Warning', cls:'badge-warning', icon:'warning' },
    success: { label:'Sukses',  cls:'badge-success', icon:'check_circle' },
    danger : { label:'Penting', cls:'badge-danger',  icon:'error' },
  };

  const rows = items.map(p => {
    const cfg     = tipeCfg[p.tipe] || tipeCfg.info;
    const mulai   = _isoDateOnly(p.tanggal_mulai)   || '—';
    const selesai = _isoDateOnly(p.tanggal_selesai) || '—';
    const isAktif = p.aktif === true || p.aktif === 1 || p.aktif === '1' || p.aktif === 't';
    const aktifNow = isAktif
      && today >= (mulai !== '—' ? mulai : '1970-01-01')
      && today <= (selesai !== '—' ? selesai : '2999-12-31');
    const statusBadgeHtml = aktifNow
      ? `<span class="badge badge-success" style="white-space:nowrap">● Aktif</span>`
      : (isAktif
        ? `<span class="badge badge-default" style="white-space:nowrap">Terjadwal</span>`
        : `<span class="badge badge-default" style="opacity:0.6;white-space:nowrap">Nonaktif</span>`);

    return `<tr>
      <td style="padding:12px 14px;vertical-align:top;max-width:220px">
        <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_escHtml(p.judul)}</div>
        <div style="font-size:11.5px;color:var(--text-light);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px">${_stripHtml(p.isi)}</div>
      </td>
      <td style="padding:12px 14px;white-space:nowrap">
        <span class="badge ${cfg.cls}"><span class="material-icons" style="font-size:12px;vertical-align:middle;margin-right:2px">${cfg.icon}</span>${cfg.label}</span>
      </td>
      <td style="padding:12px 14px;font-size:12.5px;color:var(--text-light);white-space:nowrap">${_fmtTglPgm(mulai)}</td>
      <td style="padding:12px 14px;font-size:12.5px;color:var(--text-light);white-space:nowrap">${_fmtTglPgm(selesai)}</td>
      <td style="padding:12px 14px">${statusBadgeHtml}</td>
      <td style="padding:12px 14px;white-space:nowrap;text-align:right">
        <button class="btn-icon edit" title="Edit" onclick="openFormPengumuman('${p.id}','${containerId}')">
          <span class="material-icons">edit</span>
        </button>
        <button class="btn-icon del" title="Hapus" onclick="_confirmHapusPengumuman('${p.id}','${_escHtml(p.judul)}','${containerId}')">
          <span class="material-icons">delete</span>
        </button>
      </td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `
    <div style="overflow-x:auto;border-radius:10px;border:1px solid var(--border)">
      <table style="width:100%;border-collapse:collapse;min-width:560px">
        <thead>
          <tr style="background:#0d9488">
            <th style="background:#0d9488;color:white;padding:10px 14px;font-size:11px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;text-align:left">Judul / Isi</th>
            <th style="background:#0d9488;color:white;padding:10px 14px;font-size:11px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;text-align:left">Tipe</th>
            <th style="background:#0d9488;color:white;padding:10px 14px;font-size:11px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;text-align:left">Mulai</th>
            <th style="background:#0d9488;color:white;padding:10px 14px;font-size:11px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;text-align:left">Selesai</th>
            <th style="background:#0d9488;color:white;padding:10px 14px;font-size:11px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;text-align:left">Status</th>
            <th style="background:#0d9488;color:white;padding:10px 14px;font-size:11px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;text-align:right">Aksi</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      ${renderPagination('pgmTableWrap', total, _pgmPage, totalPages, pg => { _pgmPage = pg; _renderPgmTable(containerId); }, 10)}
    </div>`;
}

/** Strip HTML tags untuk preview isi */
function _stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
}

function _confirmHapusPengumuman(id, judul, containerId) {
  showConfirm({
    title: 'Hapus Pengumuman',
    message: `Yakin hapus pengumuman "<b>${judul}</b>"? Aksi ini tidak dapat dibatalkan.`,
    type: 'danger',
    onConfirm: async () => {
      setLoading(true);
      try {
        await API.deletePengumuman(id);
        toast('Pengumuman berhasil dihapus', 'success');
        await _loadPgmTable(containerId);
      } catch(e) {
        toast(e.message, 'error');
      } finally { setLoading(false); }
    }
  });
}


// ─────────────────────────────────────────────
//  FORM BUAT / EDIT PENGUMUMAN (modal)
// ─────────────────────────────────────────────

/**
 * Buka form pengumuman.
 * @param {string|null} id  - null = buat baru, string id = edit
 * @param {string} containerId - id container tabel untuk di-refresh setelah simpan
 */
async function openFormPengumuman(id, containerId) {
  let data = null;
  if (id) {
    const found = (_pgmList || []).find(p => p.id === id);
    if (found) data = found;
  }

  // Default durasi tampil: 3 hari mulai hari ini
  const todayIso = new Date().toISOString().slice(0, 10);
  const defaultEnd = (() => {
    const d = new Date(); d.setDate(d.getDate() + 2);
    return d.toISOString().slice(0, 10);
  })();

  let modal = document.getElementById('pgmFormModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'pgmFormModal';
    modal.className = 'modal';
    modal.style.zIndex = '3100';
    modal.addEventListener('click', e => { if (e.target === modal) closeModal('pgmFormModal'); });
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="modal-card" style="max-width:500px;width:100%">
      <div class="modal-header">
        <span class="material-icons" style="color:#0d9488">campaign</span>
        <h3>${id ? 'Edit' : 'Buat'} Pengumuman</h3>
        <button class="btn-icon" title="Tutup" onclick="closeModal('pgmFormModal')"><span class="material-icons">close</span></button>
      </div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:14px">

        <div class="form-group" style="margin:0">
          <label>Judul Pengumuman <span style="color:#ef4444">*</span></label>
          <input class="form-control" id="pgmJudul" placeholder="Contoh: Update Fitur v2.3 — Input Bukti Baru" maxlength="120"
            value="${_escHtml(data?.judul || '')}">
        </div>

        <div class="form-group" style="margin:0">
          <label>Isi Pengumuman <span style="color:#ef4444">*</span></label>
          <div style="border:1.5px solid #e2e8f0;border-radius:8px;overflow:hidden;background:#fff">
            <!-- Toolbar -->
            <div id="pgmRteToolbar" style="display:flex;align-items:center;gap:2px;padding:6px 8px;border-bottom:1px solid #e2e8f0;background:#f8fafc;flex-wrap:wrap">
              <button type="button" title="Bold" onclick="document.getElementById('pgmRte').focus();document.execCommand('bold')"
                style="width:28px;height:28px;border:none;border-radius:5px;background:none;cursor:pointer;font-weight:700;font-size:13px;color:#334155;display:flex;align-items:center;justify-content:center"
                onmousedown="return false"><b>B</b></button>
              <button type="button" title="Italic" onclick="document.getElementById('pgmRte').focus();document.execCommand('italic')"
                style="width:28px;height:28px;border:none;border-radius:5px;background:none;cursor:pointer;font-size:13px;color:#334155;font-style:italic;display:flex;align-items:center;justify-content:center"
                onmousedown="return false"><i>I</i></button>
              <button type="button" title="Underline" onclick="document.getElementById('pgmRte').focus();document.execCommand('underline')"
                style="width:28px;height:28px;border:none;border-radius:5px;background:none;cursor:pointer;font-size:13px;color:#334155;text-decoration:underline;display:flex;align-items:center;justify-content:center"
                onmousedown="return false"><u>U</u></button>
              <div style="width:1px;height:20px;background:#e2e8f0;margin:0 4px"></div>
              <button type="button" title="Bullet list" onclick="document.getElementById('pgmRte').focus();document.execCommand('insertUnorderedList')"
                style="width:28px;height:28px;border:none;border-radius:5px;background:none;cursor:pointer;font-size:15px;color:#334155;display:flex;align-items:center;justify-content:center"
                onmousedown="return false">≡</button>
              <button type="button" title="Numbered list" onclick="document.getElementById('pgmRte').focus();document.execCommand('insertOrderedList')"
                style="width:28px;height:28px;border:none;border-radius:5px;background:none;cursor:pointer;font-size:13px;color:#334155;display:flex;align-items:center;justify-content:center"
                onmousedown="return false">1.</button>
              <div style="width:1px;height:20px;background:#e2e8f0;margin:0 4px"></div>
              <select title="Ukuran teks" onchange="document.getElementById('pgmRte').focus();document.execCommand('fontSize',false,this.value);this.value=''"
                style="height:26px;border:1px solid #e2e8f0;border-radius:5px;font-size:11px;color:#334155;padding:0 4px;background:#fff;cursor:pointer">
                <option value="">Ukuran</option>
                <option value="2">Kecil</option>
                <option value="3">Normal</option>
                <option value="4">Besar</option>
                <option value="5">Lebih besar</option>
              </select>
              <div style="width:1px;height:20px;background:#e2e8f0;margin:0 4px"></div>
              <button type="button" title="Hapus format" onclick="document.getElementById('pgmRte').focus();document.execCommand('removeFormat')"
                style="width:28px;height:28px;border:none;border-radius:5px;background:none;cursor:pointer;font-size:12px;color:#94a3b8;display:flex;align-items:center;justify-content:center"
                onmousedown="return false">✕</button>
            </div>
            <!-- Editor area -->
            <div id="pgmRte" contenteditable="true"
              style="min-height:120px;max-height:260px;overflow-y:auto;padding:10px 12px;font-size:13.5px;color:#334155;line-height:1.75;outline:none"
              data-placeholder="Tulis detail pengumuman di sini...">${data ? (data.isi || '') : ''}</div>
          </div>
          <style>
            #pgmRte:empty:before{content:attr(data-placeholder);color:#94a3b8;pointer-events:none}
            #pgmRteToolbar button:hover{background:#e2e8f0!important}
            #pgmRte ol,#pgmRte ul{padding-left:24px;margin:4px 0}
            #pgmRte li{margin:2px 0}
          </style>
          <!-- Hidden textarea untuk kompatibilitas savePengumuman -->
          <textarea id="pgmIsi" style="display:none"></textarea>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="form-group" style="margin:0">
            <label>Tipe</label>
            <select class="form-control" id="pgmTipe">
              <option value="info"    ${(!data || data.tipe==='info')    ? 'selected' : ''}>💬 Info</option>
              <option value="success" ${data?.tipe==='success' ? 'selected' : ''}>✅ Sukses / Update</option>
              <option value="warning" ${data?.tipe==='warning' ? 'selected' : ''}>⚠️ Perhatian</option>
              <option value="danger"  ${data?.tipe==='danger'  ? 'selected' : ''}>🚨 Penting / Error</option>
            </select>
          </div>
          <div class="form-group" style="margin:0">
            <label>Status</label>
            <select class="form-control" id="pgmAktif">
              <option value="1" ${(!data || data.aktif) ? 'selected' : ''}>Aktif</option>
              <option value="0" ${data && !data.aktif   ? 'selected' : ''}>Nonaktif</option>
            </select>
          </div>
        </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="form-group" style="margin:0">
            <label>Tanggal Mulai <span style="color:#ef4444">*</span></label>
            <input type="hidden" id="pgmMulai" value="${_isoDateOnly(data?.tanggal_mulai) || todayIso}">
          </div>
          <div class="form-group" style="margin:0">
            <label>Tanggal Selesai <span style="color:#ef4444">*</span></label>
            <input type="hidden" id="pgmSelesai" value="${_isoDateOnly(data?.tanggal_selesai) || defaultEnd}">
          </div>
        </div>

        <!-- Preview durasi -->
        <div id="pgmDurasiInfo" style="margin-top:16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:9px 13px;font-size:12px;color:#166534;display:flex;align-items:center;gap:6px">
          <span class="material-icons" style="font-size:15px">schedule</span>
          <span id="pgmDurasiTeks">—</span>
        </div>

        <div id="pgmFormStatus" style="font-size:12.5px;color:#ef4444;min-height:16px"></div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-cancel" onclick="closeModal('pgmFormModal')">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:5px;vertical-align:middle;flex-shrink:0"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>Batal
        </button>
        <button class="btn btn-primary" onclick="savePengumuman('${id || ''}','${containerId}')">
          <span class="material-icons">save</span>${id ? 'Simpan Perubahan' : 'Buat Pengumuman'}
        </button>
      </div>
    </div>`;

  showModal('pgmFormModal');

  // Init VDP custom date picker untuk kedua field tanggal
  setTimeout(() => {
    if (window.VDP) {
      VDP.init('pgmMulai');
      VDP.init('pgmSelesai');
    }
  }, 50);

  // Update info durasi saat tanggal berubah
  const _updDurasi = () => {
    const m = document.getElementById('pgmMulai')?.value;
    const s = document.getElementById('pgmSelesai')?.value;
    const el = document.getElementById('pgmDurasiTeks');
    const wrap = document.getElementById('pgmDurasiInfo');
    if (!m || !s || !el) return;
    // Hitung selisih hari tanpa timezone offset: parse manual YYYY-MM-DD
    const [my, mm2, md] = m.split('-').map(Number);
    const [sy, sm, sd]  = s.split('-').map(Number);
    const dA = Date.UTC(my, mm2-1, md);
    const dB = Date.UTC(sy, sm-1, sd);
    const diff = Math.round((dB - dA) / 86400000);
    if (diff < 0) {
      if (wrap) { wrap.style.background='#fef2f2'; wrap.style.borderColor='#fca5a5'; wrap.style.color='#7f1d1d'; }
      el.textContent = '⚠ Tanggal selesai sebelum tanggal mulai!';
    } else {
      if (wrap) { wrap.style.background='#f0fdf4'; wrap.style.borderColor='#bbf7d0'; wrap.style.color='#166534'; }
      el.textContent = `Pengumuman akan tampil selama ${diff + 1} hari (${_fmtTglPgm(m)} – ${_fmtTglPgm(s)})`;
    }
  };
  document.getElementById('pgmMulai')?.addEventListener('change', _updDurasi);
  document.getElementById('pgmSelesai')?.addEventListener('change', _updDurasi);
  _updDurasi();

  setTimeout(() => document.getElementById('pgmJudul')?.focus(), 150);
}

async function savePengumuman(id, containerId) {
  // Sync konten rich-text editor ke hidden textarea
  const rte = document.getElementById('pgmRte');
  const hiddenIsi = document.getElementById('pgmIsi');
  if (rte && hiddenIsi) hiddenIsi.value = rte.innerHTML.trim();

  const statusEl = document.getElementById('pgmFormStatus');
  const judul   = document.getElementById('pgmJudul')?.value.trim();
  const isi     = document.getElementById('pgmIsi')?.value.trim();
  const tipe    = document.getElementById('pgmTipe')?.value;
  const aktif   = document.getElementById('pgmAktif')?.value === '1';
  const mulai   = document.getElementById('pgmMulai')?.value;
  const selesai = document.getElementById('pgmSelesai')?.value;

  if (!judul)   { statusEl.textContent = 'Judul wajib diisi'; return; }
  if (!isi)     { statusEl.textContent = 'Isi pengumuman wajib diisi'; return; }
  if (!mulai)   { statusEl.textContent = 'Tanggal mulai wajib diisi'; return; }
  if (!selesai) { statusEl.textContent = 'Tanggal selesai wajib diisi'; return; }
  if (selesai < mulai) { statusEl.textContent = 'Tanggal selesai tidak boleh sebelum tanggal mulai'; return; }

  const payload = {
    judul, isi, tipe, aktif,
    tanggal_mulai: mulai,
    tanggal_selesai: selesai,
    dibuat_oleh: currentUser.email,
  };
  if (id) payload.id = id;

  setLoading(true);
  try {
    if (id) {
      await API.updatePengumuman(payload);
      toast('Pengumuman berhasil diperbarui', 'success');
    } else {
      await API.createPengumuman(payload);
      toast('Pengumuman berhasil dibuat', 'success');
    }
    closeModal('pgmFormModal');
    _pgmPage = 1;
    await _loadPgmTable(containerId);
  } catch(e) {
    statusEl.textContent = e.message;
  } finally { setLoading(false); }
}


// ─────────────────────────────────────────────
//  PRATINJAU PENGUMUMAN (Admin bisa lihat dulu)
// ─────────────────────────────────────────────

/** Admin bisa preview tampilan popup sebelum publish */
function previewPengumuman() {
  const judul   = document.getElementById('pgmJudul')?.value.trim();
  const rteEl   = document.getElementById('pgmRte');
  const isi     = (rteEl ? rteEl.innerHTML : document.getElementById('pgmIsi')?.value || '').trim();
  const tipe    = document.getElementById('pgmTipe')?.value || 'info';
  const mulai   = document.getElementById('pgmMulai')?.value;
  const selesai = document.getElementById('pgmSelesai')?.value;

  if (!judul || !isi) {
    toast('Isi judul dan isi pengumuman terlebih dahulu', 'warning');
    return;
  }

  const fakeData = [{ id: '__preview__', judul, isi, tipe, tanggal_mulai: mulai, tanggal_selesai: selesai }];
  // Reset dismissed agar preview selalu tampil
  try {
    const arr = _getPengumumanSesiDismissed().filter(x => x !== '__preview__');
    sessionStorage.setItem('pgm_dismissed', JSON.stringify(arr));
  } catch {}
  _showSatuPengumuman(fakeData, 0);
}