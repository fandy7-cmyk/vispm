'use strict';

// ── AUTH ────────────────────────────────────────────────────────────────
let _token = null;
let _refreshToken = null;
let _user  = null;
let _refreshInFlight = null; // promise tunggal supaya tidak ada refresh dobel paralel

// ── Decode JWT payload (tanpa verifikasi signature — hanya baca exp) ─────
function _decodeJwtPayload(token) {
  try {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const part = parts[1];
    if (!part) return null;
    // Normalize base64url → base64
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64 + '='.repeat((4 - b64.length % 4) % 4);
    const decoded = atob(pad);
    // Handle unicode characters safely
    const json = decodeURIComponent(decoded.split('').map(c =>
      '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
    ).join(''));
    return JSON.parse(json);
  } catch (e) {
    console.warn('[JWT] Gagal decode payload:', e);
    return null;
  }
}

// ── Cek apakah token sudah expired ───────────────────────────────────────
function _isTokenExpired(token) {
  const payload = _decodeJwtPayload(token);
  if (!payload || !payload.exp) return false; // tidak ada exp → anggap valid
  // Grace period 5 menit (300 detik) untuk toleransi clock skew browser ↔ server.
  // Token JWT di sistem ini berlaku 8 jam, jadi 5 menit sangat aman.
  // Artinya: token dianggap expired 5 menit SETELAH waktu exp server.
  return payload.exp < (Math.floor(Date.now() / 1000) - 300);
}

// ── Auto-logout saat sesi habis ───────────────────────────────────────────
// Dipanggil saat 401 diterima dari API manapun, atau saat token expired terdeteksi.
function _handleSessionExpired() {
  console.error('[Auth] _handleSessionExpired dipanggil dari:', new Error().stack);
  _clearExpiryTimer(); // batalkan timer yang mungkin masih berjalan
  _token = null;
  _refreshToken = null;
  _user  = null;
  sessionStorage.removeItem('sapa_token');
  sessionStorage.removeItem('sapa_refresh_token');
  sessionStorage.removeItem('sapa_user');
  try { sessionStorage.removeItem('sapa_nav'); } catch(e) {}
  // Tampilkan notifikasi sebelum redirect (jika fungsi toast tersedia)
  if (typeof toast === 'function') {
    toast('Sesi Anda telah berakhir. Silakan login kembali.', 'warning');
    setTimeout(() => location.reload(), 1500);
  } else {
    alert('Sesi Anda telah berakhir. Silakan login kembali.');
    location.reload();
  }
}

function initAuth() {
  _clearExpiryTimer(); // batalkan timer lama sebelum cek token baru
  try {
    _token = sessionStorage.getItem('sapa_token');
    _refreshToken = sessionStorage.getItem('sapa_refresh_token');
    const rawUser = sessionStorage.getItem('sapa_user');
    _user = rawUser ? JSON.parse(rawUser) : null;
  } catch (e) {
    console.warn('[initAuth] Gagal parse sapa_user:', e);
    _token = null;
    _refreshToken = null;
    _user  = null;
    sessionStorage.removeItem('sapa_token');
    sessionStorage.removeItem('sapa_refresh_token');
    sessionStorage.removeItem('sapa_user');
  }
  if (!_token || !_user) { showLoginOverlay(); return false; }
  document.body.classList.toggle('is-admin', !!_user.is_admin);

  // Cek token expired saat halaman dimuat
  if (_isTokenExpired(_token)) {
    sessionStorage.removeItem('sapa_token');
    sessionStorage.removeItem('sapa_refresh_token');
    sessionStorage.removeItem('sapa_user');
    showLoginOverlay('Sesi Anda telah berakhir. Silakan login kembali.');
    return false;
  }

  // Pasang timer untuk auto-logout saat token akan expired
  _scheduleTokenExpiry();
  // Mulai idle monitoring
  if (typeof _idleStart === 'function') _idleStart();
  const _dbgPayload = _decodeJwtPayload(_token);
  if (_dbgPayload?.exp) {
    const _dbgLeft = Math.round((_dbgPayload.exp * 1000 - Date.now()) / 60000);
    console.debug('[Auth] Login berhasil, token valid ~', _dbgLeft, 'menit lagi');
  }
  // Tampilkan app shell (satu-satunya tempat yang set visibility saat refresh)
  const shell = document.getElementById('appShell');
  if (shell) shell.style.visibility = '';
  return true;
}

// ── Jadwalkan refresh token diam-diam sebelum access token expired ────────
// Access token sekarang berumur pendek (1 jam, lihat _auth.js). Daripada
// langsung logout user yang masih aktif, kita coba tukar dengan access
// token baru lewat refresh token beberapa menit sebelum kedaluwarsa.
let _expiryTimerId = null; // simpan ID agar bisa dibatalkan saat re-login
const _REFRESH_MARGIN_MS = 2 * 60 * 1000; // refresh 2 menit sebelum access token exp

function _clearExpiryTimer() {
  if (_expiryTimerId !== null) {
    clearTimeout(_expiryTimerId);
    _expiryTimerId = null;
  }
}

function _scheduleTokenExpiry() {
  _clearExpiryTimer(); // batalkan timer lama sebelum set yang baru
  if (!_token) return;
  const payload = _decodeJwtPayload(_token);
  if (!payload?.exp) return;
  const msUntilExp = (payload.exp * 1000) - Date.now();
  if (msUntilExp <= 0) return;
  const msUntilRefresh = Math.max(msUntilExp - _REFRESH_MARGIN_MS, 0);
  _expiryTimerId = setTimeout(async () => {
    _expiryTimerId = null;
    const ok = await _doRefreshToken();
    if (!ok) _handleSessionExpired();
  }, msUntilRefresh);
  console.debug('[Auth] Refresh token dijadwalkan dalam', Math.round(msUntilRefresh / 60000), 'menit');
}

// ── Tukar refresh token dengan access token baru ──────────────────────────
// Pakai _refreshInFlight supaya kalau beberapa request kena 401 bersamaan,
// hanya satu request /api/auth/refresh yang jalan (yang lain numpang nunggu).
async function _doRefreshToken() {
  if (!_refreshToken) return false;
  if (_refreshInFlight) return _refreshInFlight;

  _refreshInFlight = (async () => {
    try {
      const r = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: _refreshToken }),
      });
      if (!r.ok) return false;
      const data = await r.json();
      if (!data.token || !data.refresh_token) return false;
      _token = data.token;
      _refreshToken = data.refresh_token;
      sessionStorage.setItem('sapa_token', _token);
      sessionStorage.setItem('sapa_refresh_token', _refreshToken);
      _scheduleTokenExpiry();
      console.debug('[Auth] Token berhasil di-refresh diam-diam');
      return true;
    } catch (e) {
      console.warn('[Auth] Gagal refresh token:', e);
      return false;
    }
  })();

  const result = await _refreshInFlight;
  _refreshInFlight = null;
  return result;
}


// ═══════════════════════════════════════════════════════════════════════════
// IDLE TIMEOUT — 4m30s tidak aktif → warning modal, 5m → auto logout
// ═══════════════════════════════════════════════════════════════════════════
const _IDLE_WARNING_MS  = 4.5 * 60 * 1000;  // 4 menit 30 detik
const _IDLE_LOGOUT_MS   = 5.0 * 60 * 1000;  // 5 menit
const _IDLE_COUNTDOWN_S = 30;                // detik countdown di modal

let _idleWarningTimer   = null;
let _idleLogoutTimer    = null;
let _idleCountdownTimer = null;
let _idleActive         = false;  // apakah sistem idle monitoring sedang aktif

// Event yang dianggap sebagai aktivitas user
const _IDLE_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];

function _idleResetTimers() {
  // Hanya reset kalau monitoring aktif (user sudah login)
  if (!_idleActive) return;
  // Jika modal warning sedang tampil, aktivitas user = tutup modal & reset timer
  const modal = document.getElementById('modalIdleWarning');
  if (modal && modal.style.display === 'flex') {
    modal.style.display = 'none';
  }
  _idleClearAll();
  _idleWarningTimer = setTimeout(_idleShowWarning, _IDLE_WARNING_MS);
}

function _idleClearAll() {
  if (_idleWarningTimer)   { clearTimeout(_idleWarningTimer);   _idleWarningTimer   = null; }
  if (_idleLogoutTimer)    { clearTimeout(_idleLogoutTimer);    _idleLogoutTimer    = null; }
  if (_idleCountdownTimer) { clearInterval(_idleCountdownTimer); _idleCountdownTimer = null; }
}

function _idleShowWarning() {
  const modal = document.getElementById('modalIdleWarning');
  if (!modal) return;
  // Tampilkan modal
  modal.style.display = 'flex';
  // Mulai countdown 30 detik
  let sisa = _IDLE_COUNTDOWN_S;
  const numEl = document.getElementById('idleCountdownNum');
  if (numEl) numEl.textContent = sisa;
  _idleCountdownTimer = setInterval(() => {
    sisa--;
    if (numEl) numEl.textContent = sisa;
    if (sisa <= 0) {
      _idleClearAll();
      _idleLogoutNow();
    }
  }, 1000);
  // Backup: paksa logout setelah 30 detik persis
  _idleLogoutTimer = setTimeout(_idleLogoutNow, _IDLE_COUNTDOWN_S * 1000);
}

function _idleStayLoggedIn() {
  const modal = document.getElementById('modalIdleWarning');
  if (modal) modal.style.display = 'none';
  _idleClearAll();
  // Reset timer dari awal
  _idleWarningTimer = setTimeout(_idleShowWarning, _IDLE_WARNING_MS);
}

function _idleLogoutNow() {
  _idleStop();
  const modal = document.getElementById('modalIdleWarning');
  if (modal) modal.style.display = 'none';
  _handleSessionExpired();
}

// Mulai monitoring — dipanggil setelah login berhasil
function _idleStart() {
  _idleActive = true;
  _IDLE_EVENTS.forEach(ev => window.addEventListener(ev, _idleResetTimers, { passive: true }));
  _idleResetTimers(); // mulai timer pertama
}

// Hentikan monitoring — dipanggil saat logout
function _idleStop() {
  _idleActive = false;
  _idleClearAll();
  _IDLE_EVENTS.forEach(ev => window.removeEventListener(ev, _idleResetTimers));
}

function authHeaders() {
  // Catatan: JANGAN panggil _handleSessionExpired() di sini.
  // authHeaders() dipanggil sync sebagai argumen fetch() — memanggil logout di sini
  // menyebabkan race condition yang meng-interrupt boot flow secara prematur.
  // Biarkan server return 401 jika token expired; apiFetch() atau handler response
  // yang bertanggung jawab memanggil _handleSessionExpired().
  if (!_token) return { 'Content-Type': 'application/json' };
  return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + _token };
}

// ── apiFetch: wrapper fetch yang auto-handle 401 ───────────────────────────
// Kalau kena 401 (access token expired — bisa terjadi kalau timer refresh
// terlambat, mis. tab browser sempat di-suspend), coba refresh sekali lalu
// ulangi request asli sebelum benar-benar memaksa logout.
async function apiFetch(url, opts = {}) {
  let resp = await fetch(url, opts);
  if (resp.status === 401) {
    const refreshed = await _doRefreshToken();
    if (refreshed) {
      const retryOpts = { ...opts };
      if (retryOpts.headers && retryOpts.headers['Authorization'] !== undefined) {
        retryOpts.headers = { ...retryOpts.headers, 'Authorization': 'Bearer ' + _token };
      }
      resp = await fetch(url, retryOpts);
      if (resp.status !== 401) return resp;
    }
    // Refresh gagal atau retry masih 401 → token/sesi memang sudah tidak valid
    _handleSessionExpired();
    throw new Error('Sesi berakhir');
  }
  return resp;
}

function hasAccess(key) {
  if (_user.is_admin) return true;
  return Array.isArray(_user.permissions) && _user.permissions.includes(key);
}

const hasPermission = hasAccess;  // alias

// Flag otomatis: muncul kalau bidang user punya indikator terkait (tanpa set permission manual)
let _hasMonevIndikator = false;
let _hasIkkIndikator   = false;
let _hasSpmIndikator   = false;

async function _cekKinerjaIndikator() {
  if (_user && _user.is_admin) { _hasMonevIndikator = true; _hasIkkIndikator = true; _hasSpmIndikator = true; return; }
  try {
    // Fetch indikator yang di-assign ke user ini
    const [rAssign, rAll] = await Promise.all([
      fetch(`/api/users/${_user.id}/indikator`, { headers: authHeaders() }).catch(() => null),
      fetch('/api/kinerja/indikator',            { headers: authHeaders() }).catch(() => null),
    ]);
    const dAssign = (rAssign && rAssign.ok) ? await rAssign.json() : {};
    const dAll    = (rAll    && rAll.ok)    ? await rAll.json()    : {};

    const assignedIds  = new Set((dAssign.indikator_ids || []).map(Number));
    const allIndikator = dAll.indikator || [];

    const assigned     = allIndikator.filter(r => assignedIds.has(r.id));
    _hasMonevIndikator = assigned.some(r => r.jenis_monev);
    _hasIkkIndikator   = assigned.some(r => r.jenis_ikk);
    _hasSpmIndikator   = assigned.some(r => r.jenis_spm);
  } catch {
    _hasMonevIndikator = false;
    _hasIkkIndikator   = false;
  }
}

// ── GANTI PASSWORD (user sendiri) ────────────────────────────────────────
function openChangePassword() {
  document.getElementById('cpOld').value = '';
  document.getElementById('cpNew').value = '';
  document.getElementById('cpConfirm').value = '';
  // Tutup dropdown dulu
  document.getElementById('topbarDropdown')?.classList.remove('open');
  openModal('modalChangePassword');
}

function toggleCpEye(inputId, iconId) {
  const inp = document.getElementById(inputId);
  const isText = inp.type === 'text';
  inp.type = isText ? 'password' : 'text';
  const svg = document.getElementById(iconId);
  svg.innerHTML = isText
    ? '<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>'
    : '<path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>';
}

async function saveChangePassword() {
  const oldPw  = document.getElementById('cpOld').value;
  const newPw  = document.getElementById('cpNew').value;
  const confPw = document.getElementById('cpConfirm').value;
  if (!oldPw || !newPw || !confPw) { toast('Semua field wajib diisi', 'error'); return; }
  if (newPw.length < 6) { toast('Password baru minimal 6 karakter', 'error'); return; }
  if (newPw !== confPw) { toast('Konfirmasi password tidak cocok', 'error'); return; }
  if (newPw === oldPw)  { toast('Password baru tidak boleh sama dengan password lama', 'error'); return; }
  try {
    const r = await fetch('/api/auth/change-password', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ password_lama: oldPw, password_baru: newPw }),
    });
    const d = await r.json();
    if (!r.ok) { toast(d.error || 'Gagal', 'error'); return; }
    toast('Password berhasil diubah');
    closeModal('modalChangePassword');
  } catch { toast('Gagal menyimpan password', 'error'); }
}

async function doLogout() {
  // Tutup dropdown dulu
  document.getElementById('topbarDropdown')?.classList.remove('open');
  const ok = await showConfirm({ title: 'Keluar dari Sistem', msg: 'Yakin ingin keluar? Sesi Anda akan diakhiri dan perlu login ulang untuk melanjutkan.', okText: 'Keluar', type: 'danger', icon: 'wave' });
  if (!ok) return;
  // Revoke refresh token di server supaya tidak bisa dipakai lagi (best-effort, jangan blokir logout kalau gagal)
  if (_refreshToken) {
    fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: _refreshToken }),
    }).catch(() => {});
  }
  sessionStorage.removeItem('sapa_token');
  sessionStorage.removeItem('sapa_refresh_token');
  sessionStorage.removeItem('sapa_user');
  try { sessionStorage.removeItem('sapa_nav'); } catch(e) {}
  location.reload();
}

// ── PERIODE COUNTDOWN TIMER ──────────────────────────────────────────────
let _periodeTimerInterval = null;
let _periodeTimerNotifFired = {};   // { periodeId: { h1: bool, closed: bool } }

function _startPeriodeTimer() {
  // Admin tidak perlu timer (mereka bisa input kapan saja)
  if (_user?.is_admin) return;

  if (_periodeTimerInterval) clearInterval(_periodeTimerInterval);

  function _tick() {
    const bar = document.getElementById('periodeTimerBar');
    if (!bar) return;

    // Ambil semua periode terbuka dari cache kinerja
    const periodeList = _periodeListTerbuka?.length
      ? _periodeListTerbuka
      : (_periodeAktif ? [_periodeAktif] : []);

    if (!periodeList.length) { bar.style.display = 'none'; return; }

    // Ambil periode yang paling dekat tutupnya
    const now = Date.now();
    const aktif = periodeList
      .filter(p => p.close_at && new Date(p.close_at).getTime() > now)
      .sort((a, b) => new Date(a.close_at) - new Date(b.close_at));

    if (!aktif.length) { bar.style.display = 'none'; return; }

    const p      = aktif[0];
    const closeMs = new Date(p.close_at).getTime();
    const diff    = closeMs - now;

    if (diff <= 0) {
      bar.style.display = 'none';
      // Periode baru saja tutup → kunci tombol input tanpa perlu reload halaman
      clearInterval(_periodeTimerInterval);
      _periodeTimerInterval = null;
      if (typeof initKinerjaControls === 'function') initKinerjaControls();
      return;
    }

    // Format sisa waktu
    const totalSec = Math.floor(diff / 1000);
    const d  = Math.floor(totalSec / 86400);
    const h  = Math.floor((totalSec % 86400) / 3600);
    const m  = Math.floor((totalSec % 3600)  / 60);
    const s  = totalSec % 60;

    let label, color, bg, pulse = false;
    const pad = n => String(n).padStart(2, '0');

    if (d > 0) {
      label = `${d}h ${pad(h)}j ${pad(m)}m`;
      color = '#0f766e'; bg = 'rgba(15,118,110,.12)';
    } else if (h >= 2) {
      label = `${pad(h)}:${pad(m)}:${pad(s)}`;
      color = '#0f766e'; bg = 'rgba(15,118,110,.12)';
    } else if (h >= 1) {
      label = `${pad(h)}:${pad(m)}:${pad(s)}`;
      color = '#b45309'; bg = 'rgba(245,166,35,.15)';
      pulse = true;
    } else {
      label = `${pad(m)}:${pad(s)}`;
      color = '#b91c1c'; bg = 'rgba(239,68,68,.15)';
      pulse = true;
    }

    const BULAN_ID = ['','Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    const bulanLabel = BULAN_ID[p.bulan] || '';

    bar.style.display    = 'flex';
    bar.style.background = bg;
    bar.style.color      = color;
    bar.style.border     = `1px solid ${color}30`;
    bar.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
      <span style="opacity:.75;font-weight:500">${bulanLabel}</span>
      <span style="letter-spacing:.03em">${label}</span>`;

    if (pulse) {
      bar.style.animation = 'periodeTimerPulse 1.8s ease-in-out infinite';
    } else {
      bar.style.animation = '';
    }

    // ── Notifikasi toast (sekali per sesi per periode) ──
    const key = p.id ?? (p.bulan + '-' + p.close_at);
    if (!_periodeTimerNotifFired[key]) _periodeTimerNotifFired[key] = {};

    // H-1 jam
    if (!_periodeTimerNotifFired[key].h1 && diff <= 3600_000 && diff > 3540_000) {
      _periodeTimerNotifFired[key].h1 = true;
      toast(`⏰ Sisa 1 jam! Input periode ${bulanLabel} ${p.tahun || ''} ditutup pukul ${_fmtDT(p.close_at)}.`, 'warning');
    }
    // H-10 menit
    if (!_periodeTimerNotifFired[key].m10 && diff <= 600_000 && diff > 540_000) {
      _periodeTimerNotifFired[key].m10 = true;
      toast(`⚠️ Sisa 10 menit! Segera selesaikan input periode ${bulanLabel} ${p.tahun || ''}.`, 'warning');
    }
  }

  _tick();
  _periodeTimerInterval = setInterval(_tick, 1000);
}

// ── MENU DEFINITIONS ────────────────────────────────────────────────────
const MENUS = [
  {
    id: 'superlink', label: 'Superlink', icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" x2="16" y1="12" y2="12"/></svg>`,
    children: [
      { id: 'dashboard-superlink', key: null, showIf: () => _user.is_admin || hasAccess('superlink.link') || hasAccess('superlink.shortlink') || hasAccess('superlink.bundle'), label: 'Dashboard', page: 'page-dashboard-superlink', loader: () => loadDashboardSuperlink(), icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" x2="16" y1="12" y2="12"/></svg>` },
      { id: 'shortlink', key: null, showIf: () => _user.is_admin || hasAccess('superlink.link') || hasAccess('superlink.shortlink'), label: 'Shortlink', page: 'page-shortlink',  loader: () => loadShortlinks(), icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>` },
      { id: 'bundle',    key: 'superlink.bundle',     label: 'Bundle',    page: 'page-bundle',     loader: () => loadBundles(),    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><path d="m3.3 7 7.703 4.734a2 2 0 0 0 1.994 0L20.7 7"/><path d="m7.5 4.27 9 5.15"/></svg>` },

    ],
  },
  {
    id: 'surat', label: 'Surat', icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`,
    children: [
      { id: 'dashboard-surat', key: null, showIf: () => _user.is_admin || hasAccess('surat.masuk') || hasAccess('surat.keluar'), label: 'Dashboard', page: 'page-dashboard-surat', loader: () => loadDashboardSurat(), icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>` },
      { id: 'surat-masuk',  key: 'surat.masuk',  label: 'Surat Masuk',  page: 'page-surat-masuk',  loader: () => loadSuratMasuk(1),  icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.2 8.4c.5.38.8.97.8 1.6v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 .8-1.6l8-6a2 2 0 0 1 2.4 0l8 6Z"/><path d="m22 10-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 10"/></svg>` },
      { id: 'surat-keluar', key: 'surat.keluar', label: 'Surat Keluar', page: 'page-surat-keluar', loader: () => loadSuratKeluar(1), icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.714 3.048a.498.498 0 0 0-.683.627l2.843 7.627a2 2 0 0 1 0 1.396l-2.842 7.627a.498.498 0 0 0 .682.627l18-8.5a.5.5 0 0 0 0-.904z"/><path d="M6 12h16"/></svg>` },
      { id: 'laporan-surat', key: 'surat.masuk', label: 'Laporan', page: 'page-laporan-surat', loader: () => loadLaporanSurat(), icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 18v-2"/><path d="M12 18v-4"/><path d="M16 18v-6"/></svg>` },
    ],
  },
  {
    id: 'kinerja', label: 'Kinerja', icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`,
    children: [
      { id: 'dashboard-kinerja', key: null, showIf: () => _user.is_admin || _hasMonevIndikator || _hasIkkIndikator || _hasSpmIndikator, label: 'Dashboard', page: 'page-dashboard-kinerja', loader: () => loadDashboardKinerja(), icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>` },
      { id: 'monev-kinerja', key: null, showIf: () => _hasMonevIndikator, label: 'IKU (Indikator Kinerja Utama)', page: 'page-kinerja', loader: () => { initKinerjaControls().then(() => loadKinerjaRekap()); }, icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/></svg>` },
      { id: 'realisasi-ikk', key: null, showIf: () => _hasIkkIndikator, label: 'IKK (Indikator Kinerja Kunci)', page: 'page-realisasi-ikk', loader: () => { initIkkControls().then(() => loadIkkRekap()); }, icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/></svg>` },
      { id: 'spm-kinerja', key: null, showIf: () => _hasSpmIndikator, label: 'Indikator SPM (Standar Pelayanan Minimal)', page: 'page-spm', loader: () => { initSpmControls().then(() => loadSpmRekap()); }, icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="20" rx="2"/><rect x="2" y="9" width="20" height="6" rx="2"/></svg>` },
      { id: 'monitoring-kinerja', key: null, adminOnly: true, label: 'Monitoring Pengisian', page: 'page-monitoring-kinerja', loader: () => initMonitoringKinerja(), icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>` },
      { id: 'laporan-kinerja', key: null, showIf: () => _hasMonevIndikator || _hasIkkIndikator || _hasSpmIndikator, label: 'Laporan', page: 'page-laporan-kinerja', loader: () => loadLaporanKinerja(), icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 18v-2"/><path d="M12 18v-4"/><path d="M16 18v-6"/></svg>` },
    ],
  },
  {
    id: 'master', label: 'Master Data', icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>`,
    adminOnly: true,
    children: [
      { id: 'kelola-indikator', key: null, adminOnly: true, label: 'Kelola Indikator', page: 'page-kinerja-admin', loader: () => loadIndikatorAdmin(), icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/></svg>` },
      { id: 'kelola-target', key: null, adminOnly: true, label: 'Kelola Target', page: 'page-kelola-target', loader: () => loadKelolaTarget(), icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>` },
      { id: 'kelola-jenis', key: null, adminOnly: true, label: 'Kelola Jenis Kinerja', page: 'page-kelola-jenis', loader: () => loadKelolaJenis(), icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect width="6" height="4" x="9" y="3" rx="1"/><path d="M9 12h6"/><path d="M9 16h4"/></svg>` },
      { id: 'kelola-laporan', key: null, adminOnly: true, label: 'Kelola Laporan', page: 'page-kelola-laporan', loader: () => loadLapTemplateAdmin(), icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>` },
      { id: 'periode', key: null, label: 'Periode', page: 'page-periode', loader: () => loadPeriodePage(), icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/></svg>` },
      { id: 'pengguna', key: null, label: 'Pengguna', page: 'page-pengguna', loader: () => loadUsers(), icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>` },
      { id: 'bidang', key: null, label: 'Bidang', page: 'page-bidang', loader: () => loadBidangPage(), icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>` },
      { id: 'pegawai', key: null, label: 'Struktur', page: 'page-pegawai', loader: () => { loadPegawai(); buildPegawaiJabatanFilter(); }, icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="16" y="16" width="6" height="6" rx="1"/><path d="M12 8v4M12 12H5v4M12 12h7v4"/></svg>` },
      { id: 'dokumen-publik', key: null, label: 'Dokumen Publik', page: 'page-dokumen-publik', loader: () => { loadDokumenPublik(); buildDokumenKategoriFilter(); }, icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>` },
      { id: 'pengumuman', key: null, adminOnly: true, label: 'Pengumuman', page: 'page-pengumuman', loader: () => { loadPengumuman(); loadTicker(); }, icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/></svg>` },
      { id: 'profil', key: null, label: 'Profil Instansi', page: 'page-profil', loader: () => loadProfil(), icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>` },
      { id: 'audit-trail', key: null, adminOnly: true, label: 'Audit Trail', page: 'page-audit-trail', loader: () => loadAuditTrail(1), icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>` },
    ],
  },
];

let _activeSubId = null;
let _openGroups  = {};

function buildSidebar() {
  const nav = document.getElementById('sidebarNav');
  nav.innerHTML = '';
  const collapsed = _sidebarCollapsed;
  _bindNavTooltips();

  // Dashboard
  if (_user.is_admin || hasAccess('dashboard')) {
    const dashEl = document.createElement('div');
    dashEl.className = 'nav-item' + (_activeSubId === 'dashboard' ? ' active' : '');
    dashEl.dataset.sub = 'dashboard';
    if (collapsed) dashEl.dataset.tooltip = 'Dashboard Utama';
    dashEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg><span class="nav-item-label">Dashboard Utama</span>`;
    dashEl.onclick = () => navigateTo('dashboard', 'Dashboard Utama', loadDashboard);
    nav.appendChild(dashEl);
  }

  for (const group of MENUS) {
    if (group.adminOnly && !_user.is_admin) continue;

    const visibleChildren = group.children.filter(c => {
      if (c.adminOnly && !_user.is_admin) return false;
      if (c.showIf && !c.showIf()) return false;
      return !c.key || hasAccess(c.key);
    });
    if (!visibleChildren.length) continue;

    const groupHasActive = visibleChildren.some(c => c.id === _activeSubId);
    const groupItem = document.createElement('div');
    groupItem.className = 'nav-item' + (groupHasActive ? ' has-active' : '');
    groupItem.innerHTML = `<span style="display:flex;align-items:center;flex-shrink:0">${group.icon}</span><span class="nav-item-label">${group.label}</span><svg class="nav-chevron${_openGroups[group.id] ? ' open' : ''}" id="chev-${group.id}" xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>`;
    groupItem.onclick = () => {
      if (collapsed) {
        _sidebarCollapsed = false;
        try { localStorage.setItem('sapa_sidebar_collapsed', '0'); } catch(e) {}
        _openGroups = {}; _openGroups[group.id] = true;
        _applySidebarCollapse();
      } else {
        toggleGroup(group.id);
      }
    };
    nav.appendChild(groupItem);

    const sub = document.createElement('div');
    sub.className = 'nav-sub' + (_openGroups[group.id] ? ' open' : '');
    sub.id = 'sub-' + group.id;

    // Hover autohide/autoshow (only when not collapsed)
    let _hoverTimer = null;
    const _openHover = () => {
      if (_sidebarCollapsed) return;
      clearTimeout(_hoverTimer);
      sub.classList.add('open');
      const chev = document.getElementById('chev-' + group.id);
      if (chev) chev.classList.add('open');
    };
    const _closeHover = () => {
      if (_sidebarCollapsed) return;
      // Hanya block autohide kalau group ini memang di-klik/pin terbuka
      // DAN ada child yang sedang aktif. Kalau hanya hover-open, tetap hide.
      if (_openGroups[group.id] && groupHasActive) return;
      _hoverTimer = setTimeout(() => {
        sub.classList.remove('open');
        const chev = document.getElementById('chev-' + group.id);
        if (chev) chev.classList.remove('open');
      }, 150);
    };
    groupItem.addEventListener('mouseenter', _openHover);
    groupItem.addEventListener('mouseleave', _closeHover);
    sub.addEventListener('mouseenter', () => clearTimeout(_hoverTimer));
    sub.addEventListener('mouseleave', _closeHover);

    for (const child of visibleChildren) {
      const item = document.createElement('div');
      item.className = 'nav-sub-item' + (_activeSubId === child.id ? ' active' : '');
      item.dataset.sub = child.id;
      if (collapsed) item.dataset.tooltip = child.label;
      item.innerHTML = `<span style="display:flex;align-items:center;flex-shrink:0">${child.icon}</span><span class="nav-sub-item-label">${child.label}</span>`;
      item.onclick = () => navigateTo(child.id, child.label, child.loader, group.id, child.page);
      sub.appendChild(item);
    }
    nav.appendChild(sub);
  }
}

function toggleGroup(id) {
  const isOpen = _openGroups[id];
  // tutup semua group dulu
  _openGroups = {};
  // kalau sebelumnya tutup, buka yang diklik; kalau sudah buka, toggle tutup
  if (!isOpen) _openGroups[id] = true;
  buildSidebar();
}

let _currentLoader = null;

function navigateTo(subId, label, loader, groupId, pageId) {
  _activeSubId = subId;
  if (groupId) { _openGroups = {}; _openGroups[groupId] = true; }

  // Simpan posisi navigasi ke sessionStorage agar bisa di-restore saat refresh
  try {
    sessionStorage.setItem('sapa_nav', JSON.stringify({
      subId, label, groupId: groupId || null, pageId: pageId || null
    }));
  } catch(e) {}

  // hide semua page, show yang dituju
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const targetPage = pageId || 'page-dashboard';
  const el = document.getElementById(targetPage);
  if (el) el.classList.add('active');

  // Topbar tidak lagi menampilkan judul teks (sudah ada di page-title masing-masing halaman)
  buildSidebar();
  closeSidebar();

  if (loader) { _currentLoader = loader; loader(); }
}

// ── SIDEBAR MOBILE ───────────────────────────────────────────────────────
function openSidebar()  { document.getElementById('sidebar').classList.add('open'); document.getElementById('sidebarOverlay').classList.add('open'); }
function closeSidebar() { document.getElementById('sidebar').classList.remove('open'); document.getElementById('sidebarOverlay').classList.remove('open'); }

// ── SIDEBAR COLLAPSE (desktop) ───────────────────────────────────────────
let _sidebarCollapsed = false;
try { _sidebarCollapsed = localStorage.getItem('sapa_sidebar_collapsed') === '1'; } catch(e) {}

function _applySidebarCollapse() {
  const sidebar = document.getElementById('sidebar');
  const main    = document.querySelector('.main');
  const topbar  = document.getElementById('topbar');
  const icon    = document.getElementById('iconSidebarCollapse');
  const btn     = document.getElementById('btnSidebarCollapse');
  if (!sidebar) return;
  if (_sidebarCollapsed) {
    sidebar.classList.add('collapsed');
    if (main)   main.classList.add('sidebar-collapsed');
    if (topbar) topbar.classList.add('sidebar-collapsed');
    if (icon)   icon.style.transform = 'rotate(180deg)';
  } else {
    sidebar.classList.remove('collapsed');
    if (main)   main.classList.remove('sidebar-collapsed');
    if (topbar) topbar.classList.remove('sidebar-collapsed');
    if (icon)   icon.style.transform = '';
  }
  if (btn) _bindToggleBtnTooltip(btn);
  buildSidebar();
}

// ── Tooltip untuk tombol toggle sidebar ─────────────────────────────────────
let _toggleTooltipEl = null;
function _ensureToggleTooltipEl() {
  if (_toggleTooltipEl) return _toggleTooltipEl;
  const el = document.createElement('div');
  el.id = 'tooltipSidebarToggle';
  document.body.appendChild(el);
  _toggleTooltipEl = el;
  return el;
}
function _bindToggleBtnTooltip(btn) {
  if (btn._tooltipBound) return;
  btn._tooltipBound = true;
  btn.addEventListener('mouseenter', () => {
    const tip = _ensureToggleTooltipEl();
    tip.textContent = _sidebarCollapsed ? 'Buka sidebar' : 'Tutup sidebar';
    const r = btn.getBoundingClientRect();
    tip.style.left = (r.right + 10) + 'px';
    tip.style.top  = (r.top + r.height / 2) + 'px';
    tip.classList.add('show');
  });
  btn.addEventListener('mouseleave', () => {
    if (_toggleTooltipEl) _toggleTooltipEl.classList.remove('show');
  });
  btn.addEventListener('click', () => {
    if (_toggleTooltipEl) _toggleTooltipEl.classList.remove('show');
  });
}

function toggleSidebarCollapse() {
  _sidebarCollapsed = !_sidebarCollapsed;
  try { localStorage.setItem('sapa_sidebar_collapsed', _sidebarCollapsed ? '1' : '0'); } catch(e) {}
  _applySidebarCollapse();
}

// ── Tooltip sidebar collapsed (pakai position:fixed agar tidak ke-clip overflow-y sidebar-nav) ──
let _navTooltipEl = null;
function _ensureNavTooltipEl() {
  if (_navTooltipEl) return _navTooltipEl;
  const el = document.createElement('div');
  el.className = 'nav-fixed-tooltip';
  document.body.appendChild(el);
  _navTooltipEl = el;
  return el;
}
function _bindNavTooltips() {
  const nav = document.getElementById('sidebarNav');
  if (!nav || nav._tooltipBound) return;
  nav._tooltipBound = true;
  nav.addEventListener('mouseover', (e) => {
    if (!_sidebarCollapsed) return;
    const target = e.target.closest('[data-tooltip]');
    if (!target) return;
    const tip = _ensureNavTooltipEl();
    tip.textContent = target.dataset.tooltip;
    const iconEl = target.querySelector('svg') || target;
    const r = iconEl.getBoundingClientRect();
    tip.style.left = (r.right + 10) + 'px';
    tip.style.top  = (r.top + r.height / 2) + 'px';
    tip.classList.add('show');
  });
  nav.addEventListener('mouseout', (e) => {
    const target = e.target.closest('[data-tooltip]');
    if (!target) return;
    if (target.contains(e.relatedTarget)) return;
    if (_navTooltipEl) _navTooltipEl.classList.remove('show');
  });
}

// ── TOAST ────────────────────────────────────────────────────────────────
const TOAST_ICONS = {
  success: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>`,
  error:   `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>`,
  info:    `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
  warning: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`,
};
const TOAST_TITLES = { success: 'Berhasil', error: 'Gagal', info: 'Info', warning: 'Perhatian' };
function toast(msg, type = 'success') {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.innerHTML = `
    <div class="toast-icon">${TOAST_ICONS[type] || TOAST_ICONS.info}</div>
    <div class="toast-body">
      <div class="toast-title">${TOAST_TITLES[type] || 'Info'}</div>
      <div class="toast-msg">${esc(msg)}</div>
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
    </button>`;
  c.appendChild(t);
  setTimeout(() => {
    t.style.transition = 'opacity .3s, transform .3s';
    t.style.opacity = '0'; t.style.transform = 'translateX(20px)';
    setTimeout(() => t.remove(), 300);
  }, 3500);
}

// ── CUSTOM CONFIRM ────────────────────────────────────────────────────────
let _confirmResolve = null;
const CONFIRM_ICONS = {
  trash: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path stroke-linecap="round" stroke-linejoin="round" d="M19 6l-1 14H6L5 6"/><path stroke-linecap="round" stroke-linejoin="round" d="M10 11v6m4-6v6"/><path stroke-linecap="round" stroke-linejoin="round" d="M9 6V4h6v2"/></svg>`,
  person: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>`,
  wave: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>`,
};
function showConfirm({ title = 'Konfirmasi', msg = 'Apakah Anda yakin?', okText = 'Ya, Lanjutkan', type = 'danger', icon = 'trash' } = {}) {
  return new Promise(resolve => {
    _confirmResolve = resolve;
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMsg').innerHTML = msg;
    // Tombol OK: tetap sertakan icon centang + teks
    const okIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>`;
    document.getElementById('confirmOk').innerHTML = okIconSvg + ' ' + okText;
    document.getElementById('confirmOk').className = type === 'warning' ? 'warning-btn' : '';
    document.getElementById('confirmIcon').innerHTML = CONFIRM_ICONS[icon] || CONFIRM_ICONS.trash;
    document.getElementById('confirmIcon').className = type === 'warning' ? 'warning' : 'danger';
    document.getElementById('confirmHeader').className = type === 'warning' ? 'warning' : 'danger';
    document.getElementById('confirmOverlay').classList.add('open');
    document.getElementById('confirmOk').onclick = () => { resolve(true); _confirmResolve = null; closeConfirm(); };
  });
}
function closeConfirm() {
  document.getElementById('confirmOverlay').classList.remove('open');
  if (_confirmResolve) { _confirmResolve(false); _confirmResolve = null; }
}
document.getElementById('confirmOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('confirmOverlay')) closeConfirm();
});

// ── MODAL ────────────────────────────────────────────────────────────────
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function esc(s) { return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fmtDate(s) { if (!s) return '—'; const d = new Date(s); const tgl = d.toLocaleDateString('id-ID', {day:'2-digit',month:'short',year:'numeric',timeZone:'Asia/Makassar'}); const opt = {timeZone:'Asia/Makassar'}; const wita = new Date(d.toLocaleString('en-US', opt)); const hh = String(wita.getHours()).padStart(2,'0'); const mm = String(wita.getMinutes()).padStart(2,'0'); return `${tgl}, ${hh}:${mm} WITA`; }

// ── PAGINATION ───────────────────────────────────────────────────────────
function renderPagination(containerId, total, page, limit, onPageChange) {
  const pages = Math.ceil(total / limit);
  const c = document.getElementById(containerId);
  if (pages <= 1) { c.innerHTML = ''; return; }
  const cb = typeof onPageChange === 'function' ? onPageChange : (p => { window[onPageChange] && window[onPageChange](p); });
  if (typeof onPageChange === 'function') _pgRegister(containerId, cb);
  const btn = (disabled, onclick, svg) =>
    `<button class="page-btn" ${disabled ? 'disabled' : ''} onclick="${onclick}">${svg}</button>`;
  const svgFirst = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M11 19l-7-7 7-7M18 19l-7-7 7-7"/></svg>`;
  const svgPrev  = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>`;
  const svgNext  = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>`;
  const svgLast  = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 5l7 7-7 7M13 5l7 7-7 7"/></svg>`;
  const call  = (p) => typeof onPageChange === 'function' ? `_pgCall('${containerId}',${p})` : `${onPageChange}(${p})`;
  let html = '<div class="pagination">';
  html += btn(page === 1,     call(1),        svgFirst);
  html += btn(page === 1,     call(page - 1), svgPrev);
  for (let i = 1; i <= pages; i++) {
    if (pages > 7 && Math.abs(i - page) > 2 && i !== 1 && i !== pages) {
      if (i === 2 || i === pages - 1) html += '<span style="color:var(--teks-muted);padding:0 4px">…</span>';
      continue;
    }
    html += `<button class="page-btn${i === page ? ' active' : ''}" onclick="${call(i)}">${i}</button>`;
  }
  html += btn(page === pages, call(page + 1), svgNext);
  html += btn(page === pages, call(pages),    svgLast);
  html += '</div>';
  c.innerHTML = html;
}
// helper for function-callback pagination (stores cb by containerId)
const _pgCallbacks = {};
function _pgRegister(containerId, cb) { _pgCallbacks[containerId] = cb; }
function _pgCall(containerId, page) { _pgCallbacks[containerId] && _pgCallbacks[containerId](page); }


// ── INIT ─────────────────────────────────────────────────────────────────
(function _domReady(fn) { if (document.readyState === 'loading') { window.addEventListener('DOMContentLoaded', fn); } else { fn(); } })(function() {
  if (!initAuth()) return;

  // Set info user di topbar
  const initial = (_user.nama || 'U')[0].toUpperCase();
  document.getElementById('topbarAvatar').textContent = initial;
  document.getElementById('topbarName').textContent = _user.nama;
  document.getElementById('topbarRole').textContent = _user.is_admin ? 'Super Admin' : (_user.bidang_nama || '');
  document.getElementById('ddName').textContent = _user.nama;
  // ddRole: hanya tampil untuk Super Admin
  const _ddRoleEl = document.getElementById('ddRole');
  if (_ddRoleEl) { _ddRoleEl.textContent = 'Super Admin'; _ddRoleEl.style.display = _user.is_admin ? '' : 'none'; }
  (function() {
    const ddBidang = document.getElementById('ddBidang');
    if (ddBidang && !_user.is_admin && _user.bidang_nama) {
      ddBidang.textContent = _user.bidang_nama;
      ddBidang.style.display = '';
    }
  })();

  // Semua group tertutup saat pertama load (akan terbuka saat navigasi atau hover)
  _openGroups = {};

  // Landing page: akan di-set saat navigasi pertama terjadi
  _activeSubId = '';

  // Refresh bidang_nama dari server untuk user non-admin (cache localStorage bisa stale)
  const _bootRefreshUser = async () => {
    if (!_user || _user.is_admin) return;
    if (_user.bidang_nama) return; // sudah ada, skip
    try {
      const r = await fetch('/api/auth/me', { headers: authHeaders() });
      if (r.ok) {
        const d = await r.json();
        if (d.user?.bidang_nama) {
          _user.bidang_nama      = d.user.bidang_nama;
          _user.bidang_id        = d.user.bidang_id;
          _user.bidang_singkatan = d.user.bidang_singkatan;
          sessionStorage.setItem('sapa_user', JSON.stringify(_user));
          // update topbar role & dropdown bidang
          const trEl = document.getElementById('topbarRole');
          if (trEl) trEl.textContent = _user.bidang_nama;
          const ddBidang = document.getElementById('ddBidang');
          if (ddBidang) { ddBidang.textContent = _user.bidang_nama; ddBidang.style.display = ''; }
        }
      }
    } catch {}
  };

  loadPeriodeAktif()
    .then(() => _bootRefreshUser())
    .then(() => _cekKinerjaIndikator())
    .finally(() => {
      buildSidebar();
      _applySidebarCollapse();
      _startPeriodeTimer();

      // ── Restore halaman terakhir sebelum refresh ───────────────────────
      // sessionStorage hilang saat tab ditutup (bukan saat refresh),
      // sehingga aman: sesi baru selalu mulai dari dashboard.
      let _restored = false;
      try {
        const _saved = sessionStorage.getItem('sapa_nav');
        if (_saved) {
          const nav = JSON.parse(_saved);
          // Cari loader dari MENUS berdasarkan subId yang tersimpan
          if (nav.subId === 'dashboard' && (_user.is_admin || hasAccess('dashboard'))) {
            loadDashboard();
            _restored = true;
          } else if (nav.subId === 'dashboard' && !_user.is_admin && !hasAccess('dashboard')) {
            // Sesi lama simpan dashboard tapi user tidak punya akses → biarkan fallback handler jalan
            _restored = false;
          } else if (nav.subId && nav.subId !== 'dashboard') {
            for (const g of MENUS) {
              const child = (g.children || []).find(c => c.id === nav.subId);
              if (child) {
                // Pastikan user masih punya akses ke menu ini
                const canAccess = !child.adminOnly || _user.is_admin;
                const keyOk     = !child.key || hasAccess(child.key);
                const showOk    = !child.showIf || child.showIf();
                if (canAccess && keyOk && showOk) {
                  navigateTo(child.id, child.label, child.loader, g.id, child.page);
                  _restored = true;
                }
                break;
              }
            }
          }
        }
      } catch(e) {}

      if (!_restored) {
        // Non-admin tanpa permission dashboard → buka menu pertama yang accessible
        if (!_user.is_admin && !hasAccess('dashboard')) {
          let fallbackLoaded = false;
          for (const g of MENUS) {
            if (g.adminOnly && !_user.is_admin) continue;
            for (const c of (g.children || [])) {
              const canAccess = !c.adminOnly || _user.is_admin;
              const keyOk     = !c.key || hasAccess(c.key);
              const showOk    = !c.showIf || c.showIf();
              if (canAccess && keyOk && showOk) {
                navigateTo(c.id, c.label, c.loader, g.id, c.page);
                fallbackLoaded = true;
                break;
              }
            }
            if (fallbackLoaded) break;
          }
          if (!fallbackLoaded) {
            // Tidak ada menu apapun — tampilkan pesan
            document.getElementById('mainContent').innerHTML =
              '<div style="padding:2rem;text-align:center;color:#6b7280;">Belum ada menu yang dapat diakses. Hubungi administrator.</div>';
          }
        } else {
          loadDashboard();
        }
      }
    });
});

// Close modal saat klik overlay
document.querySelectorAll('.modal-overlay, .modal-overlay-main').forEach(overlay => {
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('open'); });
});

// ── Tab switcher (kinerja admin) ────────────────────────────────────────
// Profile dropdown toggle
function toggleProfileDD() {
  document.getElementById('topbarDropdown').classList.toggle('open');
}
// Close dropdown saat klik di luar
document.addEventListener('click', e => {
  const dd = document.getElementById('topbarDropdown');
  const btn = document.getElementById('topbarAvatar');
  if (dd && !dd.contains(e.target) && e.target !== btn) {
    dd.classList.remove('open');
  }
});

// ══════════════════════════════════════════════════════
// CUSTOM DATEPICKER
// ══════════════════════════════════════════════════════
const BULAN_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const HARI_ID  = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];

class DatePicker {
  constructor(containerId, { placeholder = 'Pilih tanggal', alignRight = false } = {}) {
    this.containerId = containerId;
    this.placeholder = placeholder;
    this.alignRight  = alignRight;
    this.value       = null;   // 'YYYY-MM-DD' string atau null
    this.viewYear    = null;
    this.viewMonth   = null;
    this.mode        = 'days'; // 'days' | 'months' | 'years'
    this._open       = false;
    this._render();
  }

  _container() { return document.getElementById(this.containerId); }

  _render() {
    const wrap = this._container();
    if (!wrap) return;
    wrap.innerHTML = `
      <div class="dp-input ${this._open ? 'open' : ''}" id="${this.containerId}-btn">
        <span id="${this.containerId}-label" class="${this.value ? '' : 'dp-input-placeholder'}">
          ${this.value ? this._fmtDisplay(this.value) : this.placeholder}
        </span>
      </div>
      ${this.value
        ? `<span class="dp-clear" id="${this.containerId}-clear" title="Hapus"><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></span>`
        : `<span class="dp-icon"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path stroke-linecap="round" d="M16 2v4M8 2v4M3 10h18"/></svg></span>`
      }
      ${this._open ? this._renderPopup() : ''}
    `;
    // Events
    wrap.querySelector(`#${this.containerId}-btn`).addEventListener('click', e => { e.stopPropagation(); this._toggle(); });
    const clr = wrap.querySelector(`#${this.containerId}-clear`);
    if (clr) clr.addEventListener('click', e => { e.stopPropagation(); this.setValue(null); });
    if (this._open) this._bindPopupEvents();
  }

  _renderPopup() {
    const now = new Date();
    const vy = this.viewYear  ?? (this.value ? parseInt(this.value.slice(0,4)) : now.getFullYear());
    const vm = this.viewMonth ?? (this.value ? parseInt(this.value.slice(5,7))-1 : now.getMonth());
    this.viewYear  = vy;
    this.viewMonth = vm;

    if (this.mode === 'months') return this._renderMonthPicker(vy, vm);
    if (this.mode === 'years')  return this._renderYearPicker(vy);
    return this._renderDayPicker(vy, vm, now);
  }

  _renderDayPicker(vy, vm, now) {
    const first = new Date(vy, vm, 1).getDay();
    const daysInMonth = new Date(vy, vm+1, 0).getDate();
    const daysInPrev  = new Date(vy, vm, 0).getDate();
    let cells = '';
    for (let i = 0; i < first; i++) {
      const d = daysInPrev - first + 1 + i;
      cells += `<button class="dp-day other-month" data-date="${vy}-${String(vm).padStart(2,'0')}-${String(d).padStart(2,'0')}" disabled>${d}</button>`;
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${vy}-${String(vm+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const isToday    = d === now.getDate() && vm === now.getMonth() && vy === now.getFullYear();
      const isSelected = dateStr === this.value;
      cells += `<button class="dp-day${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}" data-pick="${dateStr}">${d}</button>`;
    }
    const remaining = 42 - first - daysInMonth;
    for (let d = 1; d <= remaining; d++) {
      cells += `<button class="dp-day other-month" disabled>${d}</button>`;
    }
    return `
      <div class="dp-popup${this.alignRight ? ' dp-right' : ''}" id="${this.containerId}-popup">
        <div class="dp-nav">
          <button class="dp-nav-btn" id="${this.containerId}-prev"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg></button>
          <span class="dp-month-year" id="${this.containerId}-my">${BULAN_ID[vm]} ${vy}</span>
          <button class="dp-nav-btn" id="${this.containerId}-next"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg></button>
        </div>
        <div class="dp-weekdays">${HARI_ID.map(h=>`<div class="dp-weekday">${h}</div>`).join('')}</div>
        <div class="dp-days" id="${this.containerId}-days">${cells}</div>
        <div class="dp-footer">
          <button class="dp-clear-btn" id="${this.containerId}-clearbtn">Hapus</button>
          <button class="dp-today-btn" id="${this.containerId}-todaybtn">Hari Ini</button>
        </div>
      </div>`;
  }

  _renderMonthPicker(vy, vm) {
    const items = BULAN_ID.map((b,i) =>
      `<button class="dp-my-item${i===vm?' active':''}" data-m="${i}">${b.slice(0,3)}</button>`
    ).join('');
    return `
      <div class="dp-popup${this.alignRight ? ' dp-right' : ''}" id="${this.containerId}-popup">
        <div class="dp-nav">
          <button class="dp-nav-btn" id="${this.containerId}-prev"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg></button>
          <span class="dp-month-year" id="${this.containerId}-my">${vy}</span>
          <button class="dp-nav-btn" id="${this.containerId}-next"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg></button>
        </div>
        <div class="dp-my-grid">${items}</div>
      </div>`;
  }

  _renderYearPicker(vy) {
    const start = Math.floor(vy / 12) * 12;
    const items = Array.from({length:12},(_,i)=>start+i).map(y=>
      `<button class="dp-my-item${y===vy?' active':''}" data-y="${y}">${y}</button>`
    ).join('');
    return `
      <div class="dp-popup${this.alignRight ? ' dp-right' : ''}" id="${this.containerId}-popup">
        <div class="dp-nav">
          <button class="dp-nav-btn" id="${this.containerId}-prev"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg></button>
          <span class="dp-year-label">${start}–${start+11}</span>
          <button class="dp-nav-btn" id="${this.containerId}-next"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg></button>
        </div>
        <div class="dp-my-grid">${items}</div>
      </div>`;
  }

  _bindPopupEvents() {
    const wrap = this._container();
    const popup = wrap.querySelector(`#${this.containerId}-popup`);
    if (!popup) return;
    popup.addEventListener('click', e => e.stopPropagation());

    // Prev/Next
    const prev = wrap.querySelector(`#${this.containerId}-prev`);
    const next = wrap.querySelector(`#${this.containerId}-next`);
    if (prev) prev.addEventListener('click', () => {
      if (this.mode === 'days')   { this.viewMonth--; if (this.viewMonth < 0) { this.viewMonth = 11; this.viewYear--; } }
      else if (this.mode === 'months') { this.viewYear--; }
      else if (this.mode === 'years')  { this.viewYear -= 12; }
      this._render();
    });
    if (next) next.addEventListener('click', () => {
      if (this.mode === 'days')   { this.viewMonth++; if (this.viewMonth > 11) { this.viewMonth = 0; this.viewYear++; } }
      else if (this.mode === 'months') { this.viewYear++; }
      else if (this.mode === 'years')  { this.viewYear += 12; }
      this._render();
    });

    // Month/Year label click → switch mode
    const myLabel = wrap.querySelector(`#${this.containerId}-my`);
    if (myLabel) myLabel.addEventListener('click', () => {
      this.mode = this.mode === 'days' ? 'months' : this.mode === 'months' ? 'years' : 'days';
      this._render();
    });

    // Day pick
    if (this.mode === 'days') {
      wrap.querySelectorAll(`[data-pick]`).forEach(btn => {
        btn.addEventListener('click', () => { this.setValue(btn.dataset.pick); this._close(); });
      });
      const todayBtn = wrap.querySelector(`#${this.containerId}-todaybtn`);
      if (todayBtn) todayBtn.addEventListener('click', () => {
        const t = new Date(); 
        this.setValue(`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`);
        this._close();
      });
      const clearBtn = wrap.querySelector(`#${this.containerId}-clearbtn`);
      if (clearBtn) clearBtn.addEventListener('click', () => { this.setValue(null); this._close(); });
    }

    // Month pick
    if (this.mode === 'months') {
      wrap.querySelectorAll('[data-m]').forEach(btn => {
        btn.addEventListener('click', () => { this.viewMonth = parseInt(btn.dataset.m); this.mode = 'days'; this._render(); });
      });
    }

    // Year pick
    if (this.mode === 'years') {
      wrap.querySelectorAll('[data-y]').forEach(btn => {
        btn.addEventListener('click', () => { this.viewYear = parseInt(btn.dataset.y); this.mode = 'months'; this._render(); });
      });
    }
  }

  _toggle() {
    this._open ? this._close() : this._open_();
  }
  _open_() {
    // Close all other pickers first
    Object.values(_datepickers).forEach(dp => { if (dp !== this && dp._open) dp._close(); });
    this._open = true;
    this.mode = 'days';
    if (this.value) {
      this.viewYear  = parseInt(this.value.slice(0,4));
      this.viewMonth = parseInt(this.value.slice(5,7))-1;
    } else {
      const now = new Date();
      this.viewYear  = now.getFullYear();
      this.viewMonth = now.getMonth();
    }
    this._render();
  }
  _close() { this._open = false; this._render(); }

  setValue(dateStr) {
    this.value = dateStr || null;
    this._render();
    // Sync ke hidden input jika ada
    const hidden = document.getElementById(this.containerId.replace('dp-',''));
    if (hidden) hidden.value = this.value || '';
  }

  getValue() { return this.value; }

  _fmtDisplay(dateStr) {
    if (!dateStr) return '';
    const [y,m,d] = dateStr.split('-');
    return `${parseInt(d)} ${BULAN_ID[parseInt(m)-1]} ${y}`;
  }
}

// Registry datepicker
const _datepickers = {};

function initDatePicker(id, opts = {}) {
  // Buat hidden input sebagai backing store jika belum ada
  let hidden = document.getElementById(id);
  if (!hidden) {
    hidden = document.createElement('input');
    hidden.type = 'hidden';
    hidden.id = id;
    document.body.appendChild(hidden);
  }
  _datepickers[`dp-${id}`] = new DatePicker(`dp-${id}`, opts);
}

function dpSetValue(id, val) {
  const dp = _datepickers[`dp-${id}`];
  if (dp) dp.setValue(val || null);
}
function dpGetValue(id) {
  const dp = _datepickers[`dp-${id}`];
  return dp ? dp.getValue() : null;
}

// Close datepicker saat klik di luar
document.addEventListener('click', () => {
  Object.values(_datepickers).forEach(dp => { if (dp._open) dp._close(); });
});

// Init datepickers setelah DOM ready
(function _domReady(fn) { if (document.readyState === 'loading') { window.addEventListener('DOMContentLoaded', fn); } else { fn(); } })(function() {
  initDatePicker('smTglSurat',  { placeholder: 'Pilih tanggal' });
  initDatePicker('smTglTerima', { placeholder: 'Pilih tanggal' });
  initDatePicker('smBatas',     { placeholder: 'Pilih tanggal', alignRight: true });
  initDatePicker('skTglSurat',  { placeholder: 'Pilih tanggal' });
});

// ═══════════════════════════════════════════════════════════════════════════
// DOC PREVIEW PANEL — viewDoc / viewDocMulti
// Menggunakan #docPreviewPanel yang sudah ada di app.html.
// File PDF    → PDF.js (render canvas lokal, tidak via iframe)
// File Word   → mammoth.js (ArrayBuffer → HTML)
// File Excel  → SheetJS (ArrayBuffer → tabel HTML, tab per sheet)
// File PPT    → fallback download (tidak bisa dirender lokal)
// File gambar → <img> langsung via proxy
// ═══════════════════════════════════════════════════════════════════════════

const _OFFICE_EXTS = new Set(['doc','docx','xls','xlsx','ppt','pptx']);
const _IMG_EXTS    = new Set(['jpg','jpeg','png','gif','webp','svg']);

// CDN library lazy-load
const _PDFJS_CDN    = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const _PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const _MAMMOTH_CDN  = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';
const _SHEETJS_CDN  = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';

function _dpLoadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

// ── Koreksi resource_type URL Cloudinary di frontend ─────────────────────
// File PDF/doc/xlsx yang di-upload sebelum fix resource_type di upload.js
// mungkin tersimpan dengan /image/upload/ → koreksi ke /raw/upload/ di sini.
const _RAW_EXTS_FE = new Set(['pdf','doc','docx','xls','xlsx','ppt','pptx','zip','txt','csv']);
function _fixCloudinaryUrl(url, hintExt = '') {
  try {
    if (!url || !url.includes('cloudinary.com')) return url;
    if (url.includes('/raw/upload/')) return url; // sudah benar
    if (url.includes('/image/upload/')) {
      const filename = url.split('/').pop().split('?')[0];
      const extFromUrl  = filename.includes('.') ? filename.split('.').pop().toLowerCase() : '';
      const extFromHint = (hintExt || '').toLowerCase();
      if (_RAW_EXTS_FE.has(extFromUrl) || _RAW_EXTS_FE.has(extFromHint)) {
        return url.replace('/image/upload/', '/raw/upload/');
      }
    }
    return url;
  } catch { return url; }
}

// Proxy semua request file melalui /api/sign-url — menyertakan token di query string
// agar iframe dan img src yang tidak bisa kirim header Authorization tetap terautentikasi.
// FIX: terima fileName sebagai parameter ke-3 agar ekstensi file tidak hilang.
// Cloudinary menyimpan file non-gambar tanpa ekstensi di URL (public_id),
// sehingga mengambil nama dari URL akan menghasilkan nama tanpa ekstensi.
function _dpProxyUrl(rawUrl, mode = 'preview', fileName = '') {
  if (!rawUrl || !rawUrl.startsWith('http')) return rawUrl;
  const token = (_token || '').trim();
  const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
  let nameParam = '';
  try {
    // Utamakan fileName yang dikirim (mengandung ekstensi asli dari DB),
    // fallback ke nama dari URL hanya jika fileName tidak tersedia.
    const useName = (fileName || '').trim() || decodeURIComponent(rawUrl.split('/').pop().split('?')[0]);
    if (useName) nameParam = `&name=${encodeURIComponent(useName)}`;
  } catch {}
  return `/api/sign-url?url=${encodeURIComponent(rawUrl)}&mode=${mode}${tokenParam}${nameParam}`;
}

// Handle error dari proxy — jangan logout, cukup tampilkan pesan error di preview
// (401 di sini dari sign-url/storage, bukan sesi app user)
async function _dpCheckProxy(resp) {
  // Handle redirect 302 dari sign-url (file terlalu besar untuk di-proxy → Cloudinary langsung)
  // fetch() dengan mode default akan follow redirect otomatis, tapi jika opaque → tidak.
  // Karena kita fetch ke same-origin (/api/sign-url), redirect akan di-follow → resp.ok = true.
  // Jika entah bagaimana masuk sini dengan status 302, tangkap Location-nya.
  if (resp.status === 302 || resp.redirected) {
    // resp.url berisi URL final setelah redirect — kembalikan sebagai resp palsu
    return { ok: true, status: 200, _redirectUrl: resp.url, arrayBuffer: async () => null, headers: resp.headers };
  }
  if (resp.status === 401) {
    // FIX: baca body 401 dari sign-url untuk debug — lihat console browser
    try {
      const debug = await resp.clone().json();
      console.error('[sign-url 401 debug]', JSON.stringify(debug));
      // Jika reason=token_expired atau invalid_token → sesi memang berakhir
      if (debug.reason === 'token_expired' || debug.reason === 'invalid_token') {
        // Tampilkan pesan lalu redirect login
        throw new Error('Sesi Anda telah berakhir. Silakan login kembali.');
      }
      // Selain itu (misal Cloudinary 401 diteruskan) → tampilkan pesan biasa
      const hint = debug.hint ? ` (${debug.hint})` : '';
      throw new Error((debug.error || 'Gagal mengakses file') + hint);
    } catch (jsonErr) {
      // Jika bukan JSON atau sudah re-throw dari atas
      if (jsonErr.message && !jsonErr.message.includes('JSON')) throw jsonErr;
    }
    throw new Error('Gagal mengakses file — link mungkin sudah kedaluwarsa. Coba download langsung.');
  }
  return resp;
}

// State panel
let _dpFiles   = [];   // array { url, name }
let _dpIdx     = 0;
let _dpZoom    = 1;
let _dpLabel   = '';
let _dpOnDelete = null; // callback(idx, file) opsional

// ── Entry points ───────────────────────────────────────────────────────────

// Buka single file

// ── Disable/enable sidebar saat preview terbuka ────────────────────────────
function _setSidebarDisabled(disabled) {
  // Seluruh sidebar (termasuk header logo) + topbar
  const sidebar = document.getElementById('sidebar');
  const topbar  = document.getElementById('topbar');
  const els = [sidebar, topbar].filter(Boolean);
  els.forEach(el => {
    if (disabled) {
      el.style.pointerEvents = 'none';
      el.style.filter        = 'blur(2px)';
      el.style.transition    = 'filter .2s ease';
      el.title = 'Tutup preview terlebih dahulu';
    } else {
      el.style.pointerEvents = '';
      el.style.filter        = '';
      el.title               = '';
    }
  });
}

function viewDoc(url, fileName) {
  const name = fileName || decodeURIComponent(url.split('/').pop().split('?')[0]) || 'Dokumen';
  viewDocMulti([{ url, name }], 0, '');
}

// Buka multi file dengan navigasi (dipakai oleh openDukungPreview)
function viewDocMulti(files, startIdx = 0, label = '', onDelete = null) {
  if (!files || !files.length) return;
  _dpFiles    = files.filter(f => f && f.url);
  _dpIdx      = Math.max(0, Math.min(startIdx, _dpFiles.length - 1));
  _dpLabel    = label || '';
  _dpOnDelete = typeof onDelete === 'function' ? onDelete : null;
  _dpZoom     = 1;

  // Tampilkan delete btn hanya jika ada callback
  const delBtn = document.getElementById('docPreviewDeleteBtn');
  if (delBtn) delBtn.style.display = _dpOnDelete ? '' : 'none';

  _dpRender();
  document.getElementById('docPreviewPanel').style.display = 'flex';
  _setSidebarDisabled(true);
  document.addEventListener('keydown', _dpKeyHandler);
}

function closeDocPreview() {
  document.getElementById('docPreviewPanel').style.display = 'none';
  _setSidebarDisabled(false);
  document.removeEventListener('keydown', _dpKeyHandler);
  // Bersihkan iframe/img agar tidak terus loading di background
  const body = document.getElementById('docPreviewBody');
  if (body) body.innerHTML = '';
  _dpFiles    = [];
  _dpOnDelete = null;
}

// ── Navigasi ───────────────────────────────────────────────────────────────

function navDocPreview(dir) {
  const next = _dpIdx + dir;
  if (next < 0 || next >= _dpFiles.length) return;
  _dpIdx  = next;
  _dpZoom = 1;
  _dpRender();
}

function navDocPreviewTo(idx) {
  if (idx < 0 || idx >= _dpFiles.length) return;
  _dpIdx  = idx;
  _dpZoom = 1;
  _dpRender();
}

// ── Zoom ───────────────────────────────────────────────────────────────────

function dpZoom(delta) {
  if (delta === 0) {
    _dpZoom = 1; // reset
  } else {
    _dpZoom = Math.max(0.5, Math.min(3, _dpZoom + delta));
  }
  const label     = document.getElementById('docPreviewZoomLabel');
  const resetBtn  = document.getElementById('dpZoomReset');
  if (label)    label.textContent = Math.round(_dpZoom * 100) + '%';
  if (resetBtn) resetBtn.style.display = _dpZoom !== 1 ? '' : 'none';

  // Terapkan zoom ke konten
  const body    = document.getElementById('docPreviewBody');
  const content = body?.querySelector('.dp-content');
  if (content) content.style.transform = `scale(${_dpZoom})`;
}

// ── Delete ─────────────────────────────────────────────────────────────────

function dpDeleteCurrent() {
  if (!_dpOnDelete) return;
  const file = _dpFiles[_dpIdx];
  _dpOnDelete(_dpIdx, file);
}

// ── Keyboard handler ───────────────────────────────────────────────────────

function _dpKeyHandler(e) {
  if (e.key === 'Escape')      closeDocPreview();
  if (e.key === 'ArrowLeft')   navDocPreview(-1);
  if (e.key === 'ArrowRight')  navDocPreview(1);
  if (e.key === '+' || e.key === '=') dpZoom(0.25);
  if (e.key === '-')           dpZoom(-0.25);
  if (e.key === '0')           dpZoom(0);
}

// ── Core renderer ──────────────────────────────────────────────────────────

function _dpRender() {
  const file = _dpFiles[_dpIdx];
  if (!file) return;

  const ext = (file.name || '').split('.').pop().toLowerCase();

  // Update top bar
  const labelEl   = document.getElementById('docPreviewLabel');
  const counterEl = document.getElementById('docPreviewCounter');
  const titleEl   = document.getElementById('docPreviewTitle');
  const dlLink    = document.getElementById('docPreviewOpenLink');
  const gdocsBtn  = document.getElementById('docPreviewGdocsBtn');
  const zoomLabel = document.getElementById('docPreviewZoomLabel');
  const resetBtn  = document.getElementById('dpZoomReset');

  if (labelEl)   labelEl.textContent   = _dpLabel;
  if (counterEl) counterEl.textContent = _dpFiles.length > 1
    ? `(${_dpIdx + 1}/${_dpFiles.length})`
    : '';
  if (titleEl)   titleEl.textContent   = file.name || 'Dokumen';
  if (zoomLabel) zoomLabel.textContent = '100%';
  if (resetBtn)  resetBtn.style.display = 'none';
  if (gdocsBtn)  gdocsBtn.style.display = 'none';

  // Download link → via sign-url mode=download agar nama file benar
  const dlUrl = _dpProxyUrl(file.url, 'download', file.name);
  if (dlLink) { dlLink.href = dlUrl; dlLink.download = file.name || 'dokumen'; }

  // Nav arrows & dots
  const prevBtn = document.getElementById('dpNavPrev');
  const nextBtn = document.getElementById('dpNavNext');
  const dotsEl  = document.getElementById('dpDots');
  if (prevBtn) prevBtn.style.display = _dpFiles.length > 1 ? '' : 'none';
  if (nextBtn) nextBtn.style.display = _dpFiles.length > 1 ? '' : 'none';
  if (prevBtn) prevBtn.disabled = _dpIdx === 0;
  if (nextBtn) nextBtn.disabled = _dpIdx === _dpFiles.length - 1;

  // Dots indicator
  if (dotsEl) {
    if (_dpFiles.length > 1) {
      dotsEl.style.display = 'flex';
      dotsEl.innerHTML = _dpFiles.map((_, i) =>
        `<button class="dp-dot ${i === _dpIdx ? 'active' : ''}" onclick="navDocPreviewTo(${i})" title="File ${i+1}"></button>`
      ).join('');
    } else {
      dotsEl.style.display = 'none';
    }
  }

  // Render konten berdasarkan tipe file
  const body = document.getElementById('docPreviewBody');
  if (!body) return;
  body.innerHTML = _dpLoadingHtml();

  if (_IMG_EXTS.has(ext)) {
    _dpRenderImage(_dpProxyUrl(file.url, 'preview', file.name), file.name);
  } else if (ext === 'pdf') {
    _dpRenderPdf(_dpProxyUrl(file.url, 'preview', file.name), file.name, file.url);
  } else if (['doc','docx'].includes(ext)) {
    _dpRenderWord(_dpProxyUrl(file.url, 'preview', file.name), file.name).catch(err => _dpRenderError(err.message, file.url, file.name));
  } else if (['xls','xlsx'].includes(ext)) {
    _dpRenderExcel(_dpProxyUrl(file.url, 'preview', file.name), file.name).catch(err => _dpRenderError(err.message, file.url, file.name));
  } else if (['ppt','pptx'].includes(ext)) {
    _dpRenderPptFallback(_dpProxyUrl(file.url, 'download', file.name), file.name);
  } else {
    // Tipe tidak dikenal → tampilkan pesan dengan opsi download
    body.innerHTML = `
      <div style="text-align:center;color:#94a3b8;padding:40px 20px">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="#475569" stroke-width="1.5" style="margin-bottom:16px"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
        <div style="font-weight:600;margin-bottom:8px">Format <code style="background:#1e293b;padding:2px 6px;border-radius:4px">.${ext}</code> tidak bisa ditampilkan di browser.</div>
        <div style="font-size:.82rem;margin-bottom:18px;color:#64748b">Gunakan tombol download di atas untuk membuka file.</div>
      </div>`;
  }
}

// ── Sub-renderers ──────────────────────────────────────────────────────────

function _dpRenderImage(url, name) {
  const body = document.getElementById('docPreviewBody');
  const img  = new Image();
  img.onload = () => {
    body.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'flex:1;overflow:auto;display:flex;align-items:center;justify-content:center;width:100%;height:100%;transform-origin:center center';
    wrap.className = 'dp-content';
    wrap.style.transform = `scale(${_dpZoom})`;
    img.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;border-radius:4px;box-shadow:0 4px 32px rgba(0,0,0,.5)';
    img.alt = name || '';
    wrap.appendChild(img);
    body.appendChild(wrap);
  };
  img.onerror = () => {
    body.innerHTML = `<div style="color:#ef4444;text-align:center;padding:40px">Gagal memuat gambar.</div>`;
  };
  img.src = url;
}

// ── Renderer: PDF — S1: PDF.js canvas | S2: blob+iframe | S3: iframe langsung
async function _dpRenderPdf(proxyUrl, name, originalUrl) {
  const body     = document.getElementById('docPreviewBody');
  const gdocsBtn = document.getElementById('docPreviewGdocsBtn');
  if (gdocsBtn) gdocsBtn.style.display = 'none';
  body.style.background = '';
  body.innerHTML = _dpLoadingHtml('Memuat PDF…');

  // Pastikan token selalu ada di proxyUrl
  if (_token && !proxyUrl.includes('token=')) {
    proxyUrl = proxyUrl + '&token=' + encodeURIComponent(_token);
  }

  // ── Load PDF.js sekali ─────────────────────────────────────────────────
  await _dpLoadScript(_PDFJS_CDN);
  const pdfjsLib = window['pdfjs-dist/build/pdf'];
  if (!pdfjsLib) { _dpRenderError('PDF.js gagal dimuat dari CDN.', originalUrl, name); return; }
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = _PDFJS_WORKER;
  }

  // ── Helper: render ArrayBuffer ke canvas ──────────────────────────────
  async function renderPdfBuffer(buf) {
    if (!buf || buf.byteLength === 0) throw new Error('Buffer kosong');
    const magic = new Uint8Array(buf, 0, 4);
    if (!(magic[0] === 0x25 && magic[1] === 0x50 && magic[2] === 0x44 && magic[3] === 0x46))
      throw new Error('Bukan file PDF valid (magic bytes salah)');

    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    body.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'overflow-y:auto;width:100%;height:100%;padding:12px;box-sizing:border-box;' +
                         'display:flex;flex-direction:column;align-items:center;gap:10px;background:#0d1626';
    body.appendChild(wrap);

    for (let i = 1; i <= pdf.numPages; i++) {
      const page     = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas   = document.createElement('canvas');
      canvas.width   = viewport.width;
      canvas.height  = viewport.height;
      canvas.style.cssText = 'max-width:100%;box-shadow:0 2px 12px rgba(0,0,0,.5);border-radius:2px;';
      wrap.appendChild(canvas);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    }
  }

  // ── S1: Fetch langsung dari Cloudinary URL (bypass proxy, tidak ada limit size) ──
  // Koreksi resource_type dulu: file lama mungkin tersimpan dengan /image/upload/
  // padahal harusnya /raw/upload/ → Cloudinary return 401 jika salah resource_type.
  if (originalUrl) {
    try {
      body.innerHTML = _dpLoadingHtml('Mengambil PDF…');
      const ext       = (name || '').split('.').pop().toLowerCase();
      const fixedUrl  = _fixCloudinaryUrl(originalUrl, ext);
      if (fixedUrl !== originalUrl) {
        console.log('[PDF S1] URL dikoreksi:', originalUrl.substring(0,60), '→', fixedUrl.substring(0,60));
      }
      const r1 = await fetch(fixedUrl, { headers: { 'Accept': '*/*' } });
      if (!r1.ok) throw new Error(`Cloudinary HTTP ${r1.status}`);
      const buf1 = await r1.arrayBuffer();
      await renderPdfBuffer(buf1);
      console.log('[PDF S1] Berhasil via Cloudinary langsung, size:', (buf1.byteLength/1024).toFixed(0), 'KB');
      return;
    } catch (e) {
      console.warn('[PDF S1] Gagal fetch Cloudinary langsung:', e.message, '— coba proxy…');
    }
  }

  // ── S2: Fetch via proxy /api/sign-url (untuk file yang butuh auth/signed URL) ──
  try {
    body.innerHTML = _dpLoadingHtml('Mengambil PDF via proxy…');
    const fetchHeaders = {};
    const auth = (typeof authHeaders === 'function') ? (authHeaders()['Authorization'] || '') : '';
    if (auth) fetchHeaders['Authorization'] = auth;

    const r2 = await _dpCheckProxy(await fetch(proxyUrl, { headers: fetchHeaders, redirect: 'follow' }));
    if (!r2.ok) throw new Error(`Proxy HTTP ${r2.status}`);

    // Jika proxy redirect ke Cloudinary (file > 4MB), fetch dari sana
    const redirectUrl = r2._redirectUrl || (r2.redirected ? r2.url : null);
    if (redirectUrl && redirectUrl.includes('cloudinary.com')) {
      const r2b = await fetch(redirectUrl, { headers: { 'Accept': '*/*' } });
      if (!r2b.ok) throw new Error(`Cloudinary redirect HTTP ${r2b.status}`);
      const buf2b = await r2b.arrayBuffer();
      await renderPdfBuffer(buf2b);
      console.log('[PDF S2] Berhasil via proxy redirect, size:', (buf2b.byteLength/1024).toFixed(0), 'KB');
      return;
    }

    const buf2 = await r2.arrayBuffer();
    await renderPdfBuffer(buf2);
    console.log('[PDF S2] Berhasil via proxy, size:', (buf2.byteLength/1024).toFixed(0), 'KB');
    return;
  } catch (e) {
    console.warn('[PDF S2] Gagal via proxy:', e.message, '— coba iframe blob…');
  }

  // ── S3: Iframe blob — fetch proxy → Blob URL → iframe native viewer ──────
  try {
    body.innerHTML = _dpLoadingHtml('Memuat PDF (mode native)…');
    const r3 = await fetch(proxyUrl, { redirect: 'follow' });
    if (!r3.ok) throw new Error(`HTTP ${r3.status}`);
    const buf3    = await r3.arrayBuffer();
    const blob    = new Blob([buf3], { type: 'application/pdf' });
    const blobUrl = URL.createObjectURL(blob);
    body.innerHTML = '';
    const iframe  = document.createElement('iframe');
    iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;flex:1';
    iframe.title = name || 'Dokumen PDF';
    body.appendChild(iframe);
    iframe.src = blobUrl;
    setTimeout(() => URL.revokeObjectURL(blobUrl), 300_000);
    console.log('[PDF S3] Berhasil via iframe blob');
    return;
  } catch (e) {
    console.warn('[PDF S3] Gagal:', e.message);
  }

  // Semua strategi gagal
  _dpRenderError('PDF tidak dapat ditampilkan. Coba download file.', originalUrl, name);
}
// ── Renderer: Word (.doc/.docx) via mammoth.js ────────────────────────────
async function _dpRenderWord(proxyUrl, name) {
  const body = document.getElementById('docPreviewBody');
  body.style.background = '';
  body.innerHTML = _dpLoadingHtml('Mengkonversi dokumen Word…');

  await _dpLoadScript(_MAMMOTH_CDN);
  if (!window.mammoth) throw new Error('mammoth.js gagal dimuat');

  const fetchHeaders = {};
  const auth = (typeof authHeaders === 'function') ? (authHeaders()['Authorization'] || '') : '';
  if (auth) fetchHeaders['Authorization'] = auth;
  const resp = await _dpCheckProxy(await fetch(proxyUrl, { headers: fetchHeaders }));
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const arrayBuffer = await resp.arrayBuffer();
  const result = await window.mammoth.convertToHtml({ arrayBuffer });

  body.innerHTML = '';
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'overflow-y:auto;width:100%;height:100%;padding:1.5rem 2rem;box-sizing:border-box;background:#0d1626;';
  const inner = document.createElement('div');
  inner.style.cssText = 'max-width:760px;margin:0 auto;background:#fff;padding:2rem 2.5rem;border-radius:6px;box-shadow:0 4px 32px rgba(0,0,0,.4);font-family:Georgia,serif;font-size:14px;line-height:1.7;color:#1e293b;';
  inner.innerHTML = result.value || '<p style="color:#94a3b8">Dokumen kosong atau tidak dapat dirender.</p>';
  wrapper.appendChild(inner);
  body.appendChild(wrapper);
}

// ── Renderer: Excel (.xls/.xlsx) via SheetJS ─────────────────────────────
async function _dpRenderExcel(proxyUrl, name) {
  const body = document.getElementById('docPreviewBody');
  body.style.background = '';
  body.innerHTML = _dpLoadingHtml('Memuat spreadsheet…');

  await _dpLoadScript(_SHEETJS_CDN);
  if (!window.XLSX) throw new Error('SheetJS gagal dimuat');

  const fetchHeaders = {};
  const auth = (typeof authHeaders === 'function') ? (authHeaders()['Authorization'] || '') : '';
  if (auth) fetchHeaders['Authorization'] = auth;
  const resp = await _dpCheckProxy(await fetch(proxyUrl, { headers: fetchHeaders }));
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const arrayBuffer = await resp.arrayBuffer();
  const workbook = window.XLSX.read(arrayBuffer, { type: 'array' });
  const sheetNames = workbook.SheetNames;

  body.innerHTML = '';
  const root = document.createElement('div');
  root.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;background:#0d1626;';

  if (sheetNames.length > 1) {
    const tabBar = document.createElement('div');
    tabBar.style.cssText = 'display:flex;gap:4px;padding:8px 12px 0;background:#0d1626;flex-shrink:0;overflow-x:auto;';
    sheetNames.forEach((shName, i) => {
      const btn = document.createElement('button');
      btn.textContent = shName;
      btn.style.cssText = `padding:5px 14px;border:none;border-radius:6px 6px 0 0;cursor:pointer;font-size:.78rem;font-weight:600;background:${i===0?'#fff':'#1e3050'};color:${i===0?'#334155':'#94a3b8'};`;
      btn.onclick = () => {
        root.querySelectorAll('.xl-tab').forEach(b => { b.style.background = '#1e3050'; b.style.color = '#94a3b8'; });
        btn.style.background = '#fff'; btn.style.color = '#334155';
        _dpShowSheet(contentArea, workbook, shName);
      };
      btn.className = 'xl-tab';
      tabBar.appendChild(btn);
    });
    root.appendChild(tabBar);
  }

  const contentArea = document.createElement('div');
  contentArea.style.cssText = 'flex:1;overflow:auto;background:#fff;margin:0 12px 12px;border-radius:0 0 6px 6px;box-shadow:0 4px 32px rgba(0,0,0,.4);';
  root.appendChild(contentArea);
  body.appendChild(root);
  _dpShowSheet(contentArea, workbook, sheetNames[0]);
}

function _dpShowSheet(container, workbook, sheetName) {
  const ws   = workbook.Sheets[sheetName];
  const html = window.XLSX.utils.sheet_to_html(ws, { editable: false });
  container.innerHTML = `<div style="padding:8px 12px;min-width:max-content">
    <style>.xl-tbl{border-collapse:collapse;font-size:12px;font-family:Arial,sans-serif}.xl-tbl td,.xl-tbl th{border:1px solid #cbd5e1;padding:4px 8px;white-space:nowrap}.xl-tbl tr:first-child td,.xl-tbl tr:first-child th{background:#f1f5f9;font-weight:700;position:sticky;top:0}</style>
    ${html.replace(/<table/g, '<table class="xl-tbl"')}
  </div>`;
}

// ── Renderer: PPT/PPTX — tidak bisa lokal, tampilkan download ─────────────
function _dpRenderPptFallback(downloadUrl, fileName) {
  const body = document.getElementById('docPreviewBody');
  body.style.background = '';
  body.innerHTML = `<div style="text-align:center;color:#94a3b8;padding:2rem">
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="#f97316" stroke-width="1" style="margin-bottom:.75rem"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
    <div style="font-weight:600;color:#e2e8f0;margin-bottom:.4rem">${fileName || 'File PowerPoint'}</div>
    <div style="font-size:.8rem;margin-bottom:1.25rem">File PowerPoint tidak dapat ditampilkan langsung di browser.</div>
    <a href="${downloadUrl}" download="${fileName || 'dokumen'}"
       style="display:inline-flex;align-items:center;gap:.4rem;padding:.5rem 1.2rem;border-radius:8px;background:#f97316;color:#fff;font-weight:600;text-decoration:none;font-size:.85rem">
      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
      Download File
    </a>
  </div>`;
}

// ── Error renderer ────────────────────────────────────────────────────────
function _dpRenderError(msg, originalUrl, name) {
  const body = document.getElementById('docPreviewBody');
  // FIX: pass name agar ekstensi file tidak hilang di Cloudinary URL
  const dlUrl = _dpProxyUrl(originalUrl, 'download', name || '');
  body.innerHTML = `<div style="color:#f87171;text-align:center;padding:2rem">
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" style="margin-bottom:.5rem"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>
    <div style="font-weight:600">Gagal memuat dokumen</div>
    <div style="font-size:.8rem;margin-top:.25rem;color:#94a3b8">${msg || ''}</div>
    ${originalUrl ? `<a href="${dlUrl}" download="${name||'dokumen'}" style="display:inline-flex;align-items:center;gap:6px;margin-top:1rem;padding:.4rem .9rem;border-radius:6px;background:#0369a1;color:#fff;font-size:.8rem;font-weight:600;text-decoration:none">
      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
      Coba Download
    </a>` : ''}
  </div>`;
}

// ── Google Docs Viewer fallback (dipertahankan untuk tombol di header) ─────
function docPreviewUseGdocs() {
  const file = _dpFiles[_dpIdx];
  if (!file) return;
  const gdocsBtn = document.getElementById('docPreviewGdocsBtn');
  if (gdocsBtn) gdocsBtn.style.display = 'none';
  _dpRenderGdocsViewer(file.url, file.name);
}

function _dpRenderGdocsViewer(cloudinaryUrl, name) {
  const body = document.getElementById('docPreviewBody');
  const viewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(cloudinaryUrl)}&embedded=true`;
  body.innerHTML = _dpLoadingHtml('Membuka Google Docs Viewer...');
  const iframe = document.createElement('iframe');
  iframe.className = 'dp-content';
  iframe.style.cssText = 'width:100%;height:100%;border:none;flex:1;display:block';
  iframe.title = name || 'Dokumen';
  iframe.allow = 'fullscreen';
  body.innerHTML = '';
  body.appendChild(iframe);
  iframe.src = viewerUrl;
  const dlUrl = _dpProxyUrl(cloudinaryUrl, 'download');
  const fbTimer = setTimeout(() => {
    if (body.contains(iframe)) {
      const info = document.createElement('div');
      info.style.cssText = 'position:absolute;bottom:16px;left:50%;transform:translateX(-50%);background:rgba(15,23,42,.92);border:1px solid #334155;border-radius:8px;padding:10px 16px;font-size:.78rem;color:#94a3b8;text-align:center;white-space:nowrap;z-index:10';
      info.innerHTML = `Google Viewer lambat? <a href="${dlUrl}" download="${name||'dokumen'}" style="color:#38bdf8;text-decoration:underline">Download langsung</a>`;
      body.style.position = 'relative';
      body.appendChild(info);
    }
  }, 20000);
  iframe.addEventListener('load', () => clearTimeout(fbTimer), { once: true });
}

function _dpLoadingHtml(msg = 'Memuat dokumen...') {
  return `
    <div style="display:flex;flex-direction:column;align-items:center;gap:14px;color:#475569">
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#475569" stroke-width="2" style="animation:spin .9s linear infinite">
        <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
      </svg>
      <span style="font-size:.82rem">${msg}</span>
    </div>`;
}
// ══════════════════════════════════════════════════════
// KELOLA LAPORAN TEMPLATE (Tab di Kelola Indikator)
// ══════════════════════════════════════════════════════

let _lapMode = 'urusan'; // 'urusan' | 'tsp'
let _lapTemplateList  = [];
let _lapTemplateEditId = null;
let _lapTplCurrentTemplateId = null;
let _lapTplAllIndikator = [];
let _lapTplSelectedIds  = new Set();

// State cascade TSP
const LAP_CASCADE_LEVELS = ['tujuan', 'sasaran', 'program', 'kegiatan'];
const LAP_JENIS_LABEL    = { urusan:'Urusan', tujuan:'Tujuan', sasaran:'Sasaran Strategis', program:'Program', kegiatan:'Kegiatan' };
const LAP_JENIS_COLOR    = {
  tujuan:   { bg:'#ede9fe', col:'#5b21b6', hdr:'#7c3aed', light:'#f5f3ff' },
  sasaran:  { bg:'#dcfce7', col:'#166534', hdr:'#16a34a', light:'#f0fdf4' },
  program:  { bg:'#fef3c7', col:'#92400e', hdr:'#d97706', light:'#fffbeb' },
  kegiatan: { bg:'#fee2e2', col:'#991b1b', hdr:'#dc2626', light:'#fff5f5' },
};
// selectedId per level [tujuanId, sasaranId, programId] — null jika belum dipilih
let _lapCascadeSel = [null, null, null];
// cache data per level: Map<parentId|'root', items[]>
let _lapCascadeCache = {};

// ── _syncSelectTrigger (tetap dipakai untuk select lain di app) ────────────
function _syncSelectTrigger(selectEl) {
  if (!selectEl) return;
  const wrap = selectEl.closest('.select-wrap');
  if (!wrap) return;
  const textEl = wrap.querySelector('[class*="trigger-text"]');
  if (!textEl) return;
  const opt = selectEl.options[selectEl.selectedIndex];
  textEl.textContent = opt ? opt.text : '';
  textEl.classList.toggle('placeholder', !opt || opt.value === '');
}

// ── Mode switch: Urusan vs TSP ─────────────────────────────────────────────
function switchLapMode(mode) {
  _lapMode = mode;
  document.getElementById('lapModeUrusan').classList.toggle('active', mode === 'urusan');
  document.getElementById('lapModeTSP').classList.toggle('active', mode === 'tsp');
  document.getElementById('lapPanelUrusan').style.display = mode === 'urusan' ? '' : 'none';
  document.getElementById('lapPanelTSP').style.display    = mode === 'tsp'    ? '' : 'none';
  if (mode === 'urusan') loadLapTemplateAdmin();
  else _initLapCascade();
}

// ── Entry point (dipanggil saat tab Laporan dibuka) ───────────────────────
async function loadLapTemplateAdmin() {
  // Mode urusan — tabel sederhana
  const tbody = document.getElementById('lapTemplateBody');
  if (!tbody) return;
  tbody.innerHTML = `<tr class="empty-row"><td colspan="5">Memuat...</td></tr>`;
  try {
    const res  = await fetch('/api/kinerja/laporan-template?jenis=urusan', { headers: authHeaders() });
    const data = await res.json();
    _lapTemplateList = data.templates || [];
    _renderUrusanTable();
  } catch (e) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="5">Gagal memuat data</td></tr>`;
  }
}

function _renderUrusanTable() {
  const tbody = document.getElementById('lapTemplateBody');
  if (!tbody) return;
  if (!_lapTemplateList.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="5">Belum ada template Urusan</td></tr>`;
    return;
  }
  tbody.innerHTML = _lapTemplateList.map((t, i) => `
    <tr>
      <td style="text-align:center">${i+1}</td>
      <td style="font-weight:600">${escHtml(t.nama)}</td>
      <td style="text-align:center">
        <span style="background:#f0fdf4;color:#166534;border-radius:12px;padding:2px 10px;font-size:.8rem;font-weight:700">${t.jumlah_indikator}</span>
      </td>
      <td style="text-align:center;color:#64748b">${t.urutan}</td>
      <td style="text-align:center">
        <div style="display:flex;gap:6px;justify-content:center">
          <button class="btn btn-sm" title="Kelola Indikator"
            onclick="openLapTemplateIndikatorModal(${t.id}, '${escHtml(t.nama).replace(/'/g,"\\'")}', 'urusan')"
            style="background:#e0f2fe;color:#0369a1;border:none;padding:4px 8px;font-size:.75rem">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
            Indikator
          </button>
          <button class="btn btn-sm" title="Edit"
            onclick="openLapTemplateModal(${t.id}, 'urusan')"
            style="background:#f0fdf4;color:#166534;border:none;padding:4px 8px">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
          </button>
          <button class="btn btn-sm" title="Hapus"
            onclick="deleteLapTemplate(${t.id}, '${escHtml(t.nama).replace(/'/g,"\\'")}', 'urusan')"
            style="background:#fef2f2;color:#dc2626;border:none;padding:4px 8px">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path stroke-linecap="round" stroke-linejoin="round" d="M19 6l-1 14H6L5 6m5 0V4h4v2"/></svg>
          </button>
        </div>
      </td>
    </tr>`).join('');
}

// ═══════════════════════════════════════════════════════════════════════════
// CASCADE WATERFALL — Tujuan → Sasaran → Program → Kegiatan
// ═══════════════════════════════════════════════════════════════════════════

async function _initLapCascade() {
  _lapCascadeCache = {};
  _lapCascadeSel   = [null, null, null];
  _renderCascade();
  await _loadCascadeLevel(0, null);
}

// level: 0=Tujuan, 1=Sasaran, 2=Program, 3=Kegiatan
async function _loadCascadeLevel(level, parentId) {
  const jenis = LAP_CASCADE_LEVELS[level];
  const cacheKey = parentId ?? 'root';
  const col = document.getElementById(`lapCol_${level}`);
  if (!col) return;
  const list = col.querySelector('.lap-col-list');
  list.innerHTML = `<div class="lap-col-loading">Memuat...</div>`;
  try {
    const qs  = parentId ? `jenis=${jenis}&parent_id=${parentId}` : `jenis=${jenis}`;
    const res  = await fetch(`/api/kinerja/laporan-template?${qs}`, { headers: authHeaders() });
    const data = await res.json();
    const items = data.templates || [];
    _lapCascadeCache[`${level}_${cacheKey}`] = items;
    _renderCascadeLevel(level, items);
  } catch (e) {
    list.innerHTML = `<div class="lap-col-loading" style="color:#dc2626">Gagal memuat</div>`;
  }
}

function _renderCascade() {
  const wrap = document.getElementById('lapCascadeWrap');
  if (!wrap) return;
  wrap.innerHTML = LAP_CASCADE_LEVELS.map((jenis, level) => {
    const c = LAP_JENIS_COLOR[jenis];
    return `
      <div class="lap-cascade-col" id="lapCol_${level}">
        <div class="lap-col-header" style="background:${c.hdr}">
          <span>${LAP_JENIS_LABEL[jenis]}</span>
          <button class="lap-col-add-btn" onclick="_openCascadeAdd(${level})" title="Tambah ${LAP_JENIS_LABEL[jenis]}">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
          </button>
        </div>
        <div class="lap-col-list" id="lapColList_${level}">
          ${level > 0 ? '<div class="lap-col-hint">← Pilih item di kiri</div>' : '<div class="lap-col-loading">Memuat...</div>'}
        </div>
      </div>
      ${level < 3 ? '<div class="lap-cascade-arrow">›</div>' : ''}
    `;
  }).join('');
}

function _renderCascadeLevel(level, items) {
  const list = document.getElementById(`lapColList_${level}`);
  if (!list) return;
  const jenis = LAP_CASCADE_LEVELS[level];
  const c = LAP_JENIS_COLOR[jenis];
  const selId = _lapCascadeSel[level - 1]; // parent yang dipilih (untuk level > 0)

  if (!items.length) {
    list.innerHTML = `<div class="lap-col-empty">Belum ada ${LAP_JENIS_LABEL[jenis]}</div>`;
    return;
  }

  list.innerHTML = items.map((t, idx) => {
    const isActive = _lapCascadeSel[level] === t.id;
    const nomorLabel = `${LAP_JENIS_LABEL[jenis]} ${idx + 1}`;
    return `<div class="lap-col-item ${isActive ? 'active' : ''}" id="lapItem_${level}_${t.id}"
        onclick="_selectCascadeItem(${level}, ${t.id})"
        style="${isActive ? `background:${c.light};border-left:3px solid ${c.hdr}` : ''}">
      <div style="font-size:0.7rem;font-weight:700;color:${c.hdr};margin-bottom:2px;text-transform:uppercase;letter-spacing:.3px">${nomorLabel}</div>
      <div class="lap-col-item-name">${escHtml(t.nama)}</div>
      <div class="lap-col-item-meta">
        <span class="lap-ind-badge">${t.jumlah_indikator} indikator</span>
        <div class="lap-col-item-actions">
          <button onclick="event.stopPropagation();openLapTemplateIndikatorModal(${t.id},'${escHtml(t.nama).replace(/'/g,"\\'")}','${jenis}')" title="Kelola Indikator" class="lap-item-btn lap-item-btn-ind">
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
          </button>
          <button onclick="event.stopPropagation();_openCascadeEdit(${level},${t.id})" title="Edit" class="lap-item-btn lap-item-btn-edit">
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
          </button>
          <button onclick="event.stopPropagation();deleteLapTemplate(${t.id},'${escHtml(t.nama).replace(/'/g,"\\'")}','cascade',${level})" title="Hapus" class="lap-item-btn lap-item-btn-del">
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path stroke-linecap="round" stroke-linejoin="round" d="M19 6l-1 14H6L5 6m5 0V4h4v2"/></svg>
          </button>
        </div>
      </div>
    </div>`;
  }).join('');
}

async function _selectCascadeItem(level, id) {
  // Toggle: klik item aktif = deselect
  const wasSelected = _lapCascadeSel[level] === id;
  _lapCascadeSel[level] = wasSelected ? null : id;

  // Reset seleksi semua level di bawahnya
  for (let l = level + 1; l < LAP_CASCADE_LEVELS.length; l++) {
    _lapCascadeSel[l] = null;
  }

  // Re-render kolom ini (update active style)
  const cacheKey = level === 0 ? 'root' : (_lapCascadeSel[level - 1] ?? 'root');
  const cached = _lapCascadeCache[`${level}_${cacheKey}`] || [];
  _renderCascadeLevel(level, cached);

  // Clear & reload kolom di bawahnya
  for (let l = level + 1; l < LAP_CASCADE_LEVELS.length; l++) {
    const parentId = _lapCascadeSel[l - 1];
    const childList = document.getElementById(`lapColList_${l}`);
    if (!parentId) {
      if (childList) childList.innerHTML = '<div class="lap-col-hint">← Pilih item di kiri</div>';
      for (let ll = l + 1; ll < LAP_CASCADE_LEVELS.length; ll++) {
        const c2 = document.getElementById(`lapColList_${ll}`);
        if (c2) c2.innerHTML = '<div class="lap-col-hint">← Pilih item di kiri</div>';
      }
      break;
    }
    await _loadCascadeLevel(l, parentId);
  }
}

// ── Buka modal Tambah dari cascade ────────────────────────────────────────
function _openCascadeAdd(level) {
  const jenis = LAP_CASCADE_LEVELS[level];
  const parentId   = level > 0 ? _lapCascadeSel[level - 1] : null;
  const parentNama = level > 0 ? _getCascadeParentNama(level) : null;

  if (level > 0 && !parentId) {
    toast(`Pilih ${LAP_JENIS_LABEL[LAP_CASCADE_LEVELS[level-1]]} terlebih dahulu`, 'info');
    return;
  }
  openLapTemplateModal(null, jenis, parentId, parentNama);
}

function _getCascadeParentNama(level) {
  if (level === 0) return null;
  const parentLevel = level - 1;
  const parentId    = _lapCascadeSel[parentLevel];
  const grandParentId = parentLevel > 0 ? _lapCascadeSel[parentLevel - 1] : null;
  const cacheKey = grandParentId ?? 'root';
  const items = _lapCascadeCache[`${parentLevel}_${cacheKey}`] || [];
  return items.find(t => t.id === parentId)?.nama || null;
}

// ── Buka modal Edit dari cascade ──────────────────────────────────────────
function _openCascadeEdit(level, id) {
  const jenis = LAP_CASCADE_LEVELS[level];
  const grandParentId = level > 0 ? _lapCascadeSel[level - 1] : null;
  const cacheKey = grandParentId ?? 'root';
  const items = _lapCascadeCache[`${level}_${cacheKey}`] || [];
  const tpl = items.find(t => t.id === id);
  if (!tpl) return;
  openLapTemplateModal(id, jenis, tpl.parent_id || null, null, tpl.nama);
}

// ── Modal Tambah/Edit universal ───────────────────────────────────────────
// ── Custom select untuk field Induk di modal TSP ──────────────────────────
function _buildLapParentCsel(wrapperId, opts, selectedVal, placeholder, jenisLabel) {
  const wrap = document.getElementById(wrapperId);
  if (!wrap) return;
  wrap.innerHTML = '';

  // Hidden input untuk nilai
  const hidden = document.createElement('input');
  hidden.type  = 'hidden';
  hidden.id    = 'lapTemplateParent';
  hidden.value = selectedVal || '';
  wrap.appendChild(hidden);

  const selectedOpt = opts.find(o => o.value === String(selectedVal || ''));

  // Trigger button
  const trigger = document.createElement('button');
  trigger.type      = 'button';
  trigger.className = 'csel-trigger' + (opts.length === 0 ? ' disabled' : '');
  trigger.innerHTML = `
    <span class="csel-trigger-text${selectedOpt ? '' : ' placeholder'}">${selectedOpt ? escHtml(selectedOpt.label) : placeholder}</span>
    <svg class="csel-chevron" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>
  `;
  wrap.appendChild(trigger);

  // Panel
  const panel = document.createElement('div');
  panel.className = 'csel-panel';
  panel.style.display = 'none';

  // Placeholder option
  const phDiv = document.createElement('div');
  phDiv.className = 'csel-option placeholder-opt';
  phDiv.innerHTML = `<span class="csel-option-check"></span><span>${placeholder}</span>`;
  phDiv.onclick = () => {
    hidden.value = '';
    trigger.querySelector('.csel-trigger-text').textContent = placeholder;
    trigger.querySelector('.csel-trigger-text').classList.add('placeholder');
    panel.querySelectorAll('.csel-option').forEach(o => o.classList.remove('selected'));
    trigger.classList.remove('open');
    panel.style.display = 'none';
  };
  panel.appendChild(phDiv);

  opts.forEach(opt => {
    const div = document.createElement('div');
    const isSelected = opt.value === String(selectedVal || '');
    div.className = 'csel-option' + (isSelected ? ' selected' : '');
    div.innerHTML = `<span class="csel-option-check"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg></span><span>${escHtml(opt.label)}</span>`;
    div.onclick = () => {
      hidden.value = opt.value;
      trigger.querySelector('.csel-trigger-text').textContent = opt.label;
      trigger.querySelector('.csel-trigger-text').classList.remove('placeholder');
      panel.querySelectorAll('.csel-option').forEach(o => o.classList.remove('selected'));
      div.classList.add('selected');
      trigger.classList.remove('open');
      panel.style.display = 'none';
    };
    panel.appendChild(div);
  });

  wrap.appendChild(panel);

  trigger.onclick = (e) => {
    e.stopPropagation();
    const isOpen = panel.style.display !== 'none';
    // Tutup semua csel panel lain
    document.querySelectorAll('.csel-panel').forEach(p => {
      p.style.display = 'none';
      p.parentElement?.querySelector('.csel-trigger')?.classList.remove('open');
    });
    if (!isOpen && opts.length > 0) {
      panel.style.display = '';
      trigger.classList.add('open');
    }
  };
}

function openLapTemplateModal(id = null, jenis = null, parentId = null, parentNama = null, nama = null) {
  _lapTemplateEditId = id;
  const isUrusan = (jenis === 'urusan') || (_lapMode === 'urusan' && !jenis);
  const resolvedJenis = jenis || (_lapMode === 'urusan' ? 'urusan' : 'tujuan');

  document.getElementById('modalLapTemplateTitle').textContent = id ? `Edit ${LAP_JENIS_LABEL[resolvedJenis]}` : `Tambah ${LAP_JENIS_LABEL[resolvedJenis]}`;
  document.getElementById('lapTemplateId').value     = id || '';
  document.getElementById('lapTemplateJenis').value  = resolvedJenis;
  document.getElementById('lapTemplateNama').value   = nama || '';

  // Badge jenis
  const badge = document.getElementById('lapTemplateJenisBadge');
  const c = LAP_JENIS_COLOR[resolvedJenis] || {};
  badge.style.background = c.bg || '#f1f5f9';
  badge.style.color      = c.col || '#475569';
  badge.textContent      = LAP_JENIS_LABEL[resolvedJenis] || resolvedJenis;

  // Tampilkan badge jenis hanya di cascade (bukan urusan)
  document.getElementById('lapTemplateJenisDisplay').style.display = !isUrusan ? '' : 'none';

  // Tampilkan dropdown induk hanya di cascade (bukan urusan, bukan tujuan)
  const parentDisplay = document.getElementById('lapTemplateParentDisplay');
  const level = LAP_CASCADE_LEVELS.indexOf(resolvedJenis); // 0=tujuan,1=sasaran,2=program,3=kegiatan
  if (!isUrusan && level > 0) {
    parentDisplay.style.display = '';
    const parentJenis = LAP_CASCADE_LEVELS[level - 1];
    _buildLapParentCsel('lapTemplateParentWrap', [], parentId, '— Memuat Induk —', LAP_JENIS_LABEL[parentJenis]);
    fetch(`/api/kinerja/laporan-template?jenis=${parentJenis}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => {
        const opts = (data.templates || []).map((t, i) => ({
          value: String(t.id),
          label: `${LAP_JENIS_LABEL[parentJenis]} ${i + 1}: ${t.nama}`
        }));
        _buildLapParentCsel('lapTemplateParentWrap', opts, parentId ? String(parentId) : '', `— Pilih ${LAP_JENIS_LABEL[parentJenis]} —`, LAP_JENIS_LABEL[parentJenis]);
      })
      .catch(() => {
        _buildLapParentCsel('lapTemplateParentWrap', [], '', '— Gagal memuat —', '');
      });
  } else {
    parentDisplay.style.display = 'none';
  }

  // Urutan manual hanya untuk Urusan
  document.getElementById('lapTemplateUrutanWrap').style.display = isUrusan ? '' : 'none';
  if (isUrusan) {
    // Auto-suggest urutan berikutnya
    const nextUrutan = _lapTemplateList.length ? Math.max(..._lapTemplateList.map(t => t.urutan || 0)) + 1 : 1;
    document.getElementById('lapTemplateUrutanInput').value = id
      ? (_lapTemplateList.find(t => t.id === id)?.urutan ?? 0)
      : nextUrutan;
  }

  openModal('modalLapTemplate');
  setTimeout(() => document.getElementById('lapTemplateNama').focus(), 100);
}

async function saveLapTemplate() {
  const id       = document.getElementById('lapTemplateId').value;
  const jenis    = document.getElementById('lapTemplateJenis').value;
  const nama     = document.getElementById('lapTemplateNama').value.trim();
  const parentId = document.getElementById('lapTemplateParent').value || null;
  const isUrusan = jenis === 'urusan';
  const urutan   = isUrusan
    ? (parseInt(document.getElementById('lapTemplateUrutanInput').value) || 0)
    : 0; // urutan cascade = auto (server pakai MAX+1 atau kita kirim 0)

  if (!nama) { toast('Nama template wajib diisi', 'error'); return; }

  try {
    const url    = id ? `/api/kinerja/laporan-template/${id}` : '/api/kinerja/laporan-template';
    const method = id ? 'PUT' : 'POST';
    const res    = await fetch(url, {
      method,
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ jenis, nama, urutan, parent_id: parentId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal menyimpan');
    toast(id ? 'Template berhasil diperbarui' : 'Template berhasil ditambahkan', 'success');
    closeModal('modalLapTemplate');

    if (isUrusan) {
      loadLapTemplateAdmin();
    } else {
      const level = LAP_CASCADE_LEVELS.indexOf(jenis);
      const newParentId = parentId ? parseInt(parentId) : null;
      const oldParentId = level > 0 ? _lapCascadeSel[level - 1] : null;
      const parentChanged = level > 0 && newParentId !== oldParentId;

      if (parentChanged && level > 0) {
        // Clear state parent lama biar toggle logic tidak deselect
        _lapCascadeSel[level - 1] = null;
        // Pastikan cache kolom parent sudah ada sebelum _selectCascadeItem render
        const parentLevel   = level - 1;
        const grandParentId = parentLevel > 0 ? _lapCascadeSel[parentLevel - 1] : null;
        if (!_lapCascadeCache[`${parentLevel}_${grandParentId ?? 'root'}`]) {
          await _loadCascadeLevel(parentLevel, grandParentId);
        }
        // Simulasikan klik parent baru — otomatis handle highlight + reload child
        await _selectCascadeItem(level - 1, newParentId);
      } else {
        // Parent sama, reload kolom ini saja
        await _loadCascadeLevel(level, newParentId);
      }
    }
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function deleteLapTemplate(id, nama, mode = 'urusan', cascadeLevel = null) {
  const ok = await showConfirm({ title: 'Hapus Template', msg: `Hapus <b>${escHtml(nama)}</b>? Semua mapping indikatornya juga akan dihapus.`, okText: 'Ya, Hapus', type: 'danger', icon: 'trash' });
  if (!ok) return;
  try {
    const res = await fetch(`/api/kinerja/laporan-template/${id}`, { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) throw new Error('Gagal menghapus');
    toast('Template dihapus', 'success');

    if (mode === 'cascade' && cascadeLevel !== null) {
      // Jika item yang dihapus sedang aktif, reset seleksi level itu & bawahnya
      if (_lapCascadeSel[cascadeLevel] === id) {
        _lapCascadeSel[cascadeLevel] = null;
        for (let l = cascadeLevel + 1; l < LAP_CASCADE_LEVELS.length; l++) {
          const c2 = document.getElementById(`lapColList_${l}`);
          if (c2) c2.innerHTML = '<div class="lap-col-hint">← Pilih item di kiri</div>';
        }
      }
      const parentLevelId = cascadeLevel > 0 ? _lapCascadeSel[cascadeLevel - 1] : null;
      await _loadCascadeLevel(cascadeLevel, parentLevelId);
    } else {
      loadLapTemplateAdmin();
    }
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ── Modal Pilih Indikator ──────────────────────────────────
async function openLapTemplateIndikatorModal(templateId, templateNama, templateJenis) {
  _lapTplCurrentTemplateId = templateId;
  _lapTplSelectedIds = new Set();
  document.getElementById('modalLapTemplateIndTitle').textContent = `Indikator — ${templateNama}`;
  document.getElementById('modalLapTemplateIndSub').textContent = templateJenis === 'urusan' ? 'Template Urusan' : 'Template Tujuan/Sasaran/Program';
  document.getElementById('lapTplIndSearch').value = '';
  document.getElementById('lapTplIndFilterJenis').value = '';
  document.getElementById('lapTplIndList').innerHTML = '<div style="text-align:center;padding:20px;color:#94a3b8">Memuat...</div>';
  openModal('modalLapTemplateIndikator');

  // Fetch semua indikator + yang sudah terpilih secara paralel
  try {
    const [allRes, selRes] = await Promise.all([
      fetch('/api/kinerja/indikator', { headers: authHeaders() }),
      fetch(`/api/kinerja/laporan-template/${templateId}/indikator`, { headers: authHeaders() })
    ]);
    const allData = await allRes.json();
    const selData = await selRes.json();
    _lapTplAllIndikator = allData.indikator || allData.data || [];
    (selData.indikator || []).forEach(r => _lapTplSelectedIds.add(r.id));
    _filterLapTplIndList();
  } catch (e) {
    document.getElementById('lapTplIndList').innerHTML = '<div style="text-align:center;padding:20px;color:#dc2626">Gagal memuat indikator</div>';
  }
}

function _filterLapTplIndList() {
  const q     = (document.getElementById('lapTplIndSearch')?.value || '').toLowerCase();
  const jenis = document.getElementById('lapTplIndFilterJenis')?.value || '';
  let list    = _lapTplAllIndikator;
  if (q)     list = list.filter(r => (r.indikator_kinerja || '').toLowerCase().includes(q));
  if (jenis === 'iku')  list = list.filter(r => r.jenis_monev);
  if (jenis === 'ikk')  list = list.filter(r => r.jenis_ikk);
  if (jenis === 'spm')  list = list.filter(r => r.jenis_spm);

  const container = document.getElementById('lapTplIndList');
  const info      = document.getElementById('lapTplIndSelectedInfo');
  if (info) info.textContent = `${_lapTplSelectedIds.size} indikator terpilih dari ${_lapTplAllIndikator.length}`;

  if (!list.length) {
    container.innerHTML = '<div style="text-align:center;padding:20px;color:#94a3b8">Tidak ada indikator</div>';
    return;
  }

  const jenisBadge = (r) => {
    const arr = [];
    if (r.jenis_monev) arr.push(`<span style="background:#d1fae5;color:#065f46;border-radius:3px;padding:1px 5px;font-size:.66rem;font-weight:700">IKU</span>`);
    if (r.jenis_ikk)   arr.push(`<span style="background:#dbeafe;color:#1d4ed8;border-radius:3px;padding:1px 5px;font-size:.66rem;font-weight:700">IKK</span>`);
    if (r.jenis_spm)   arr.push(`<span style="background:#fef3c7;color:#92400e;border-radius:3px;padding:1px 5px;font-size:.66rem;font-weight:700">SPM</span>`);
    return arr.join(' ');
  };

  container.innerHTML = list.map(r => {
    const checked = _lapTplSelectedIds.has(r.id);
    return `<label style="display:flex;align-items:flex-start;gap:10px;padding:7px 8px;border-radius:6px;cursor:pointer;background:${checked ? '#f0fdf4' : 'transparent'};transition:background .1s" id="lapTplRow_${r.id}">
      <input type="checkbox" ${checked ? 'checked' : ''} style="margin-top:3px;accent-color:#0d9488;width:15px;height:15px;flex-shrink:0"
        onchange="_lapTplToggle(${r.id}, this.checked, this.closest('label'))">
      <div style="flex:1;min-width:0">
        <div style="font-size:.82rem;font-weight:600;color:#1e293b;line-height:1.4">${escHtml(r.indikator_kinerja)}</div>
        <div style="font-size:.72rem;color:#64748b;margin-top:2px">${r.satuan || ''} &nbsp;${jenisBadge(r)}</div>
      </div>
    </label>`;
  }).join('');
}

function _lapTplToggle(id, checked, labelEl) {
  if (checked) _lapTplSelectedIds.add(id);
  else _lapTplSelectedIds.delete(id);
  if (labelEl) labelEl.style.background = checked ? '#f0fdf4' : 'transparent';
  const info = document.getElementById('lapTplIndSelectedInfo');
  if (info) info.textContent = `${_lapTplSelectedIds.size} indikator terpilih dari ${_lapTplAllIndikator.length}`;
}

function _lapTplSelectAll() {
  const q     = (document.getElementById('lapTplIndSearch')?.value || '').toLowerCase();
  const jenis = document.getElementById('lapTplIndFilterJenis')?.value || '';
  let list    = _lapTplAllIndikator;
  if (q)     list = list.filter(r => (r.indikator_kinerja || '').toLowerCase().includes(q));
  if (jenis === 'iku') list = list.filter(r => r.jenis_monev);
  if (jenis === 'ikk') list = list.filter(r => r.jenis_ikk);
  if (jenis === 'spm') list = list.filter(r => r.jenis_spm);
  list.forEach(r => _lapTplSelectedIds.add(r.id));
  _filterLapTplIndList();
}

function _lapTplClearAll() {
  _lapTplSelectedIds.clear();
  _filterLapTplIndList();
}

async function saveLapTemplateIndikator() {
  if (!_lapTplCurrentTemplateId) return;
  const ids = [..._lapTplSelectedIds];
  try {
    const res = await fetch(`/api/kinerja/laporan-template/${_lapTplCurrentTemplateId}/indikator`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ indikator_ids: ids })
    });
    if (!res.ok) throw new Error('Gagal menyimpan');
    toast(`${ids.length} indikator berhasil disimpan`, 'success');
    closeModal('modalLapTemplateIndikator');

    // Reload cascade level yang bersangkutan supaya jumlah_indikator update
    // Cari level dari item yang sedang diedit
    let reloaded = false;
    for (let level = 0; level < LAP_CASCADE_LEVELS.length; level++) {
      const cached = _lapCascadeCache[`${level}_${level === 0 ? 'root' : (_lapCascadeSel[level - 1] ?? 'root')}`] || [];
      if (cached.some(t => t.id === _lapTplCurrentTemplateId)) {
        const parentLevelId = level > 0 ? _lapCascadeSel[level - 1] : null;
        await _loadCascadeLevel(level, parentLevelId);
        reloaded = true;
        break;
      }
    }
    if (!reloaded) loadLapTemplateAdmin();
  } catch (e) {
    toast(e.message, 'error');
  }
}