/**
 * VISPM — CUSTOM DATE PICKER v3
 * Popup di-render langsung ke document.body (teleport) sehingga tidak
 * terpotong oleh overflow:hidden / overflow-y:auto pada .modal-body.
 *
 * Letakkan di index.html SETELAH app-master.js:
 *   <script src="/js/date-picker.js"></script>
 */

(function (global) {
  'use strict';

  /* ────────── CSS ────────── */
  function injectCSS() {
    if (document.getElementById('vdp-style')) return;
    const s = document.createElement('style');
    s.id = 'vdp-style';
    s.textContent = `
      .vdp-btn {
        display: flex; align-items: center; gap: 7px;
        width: 100%; height: 100%; min-height: 44px; padding: 0 10px;
        border: 1.5px solid var(--border, #cbd5e1);
        border-radius: 8px; background: var(--surface, #fff);
        cursor: pointer; user-select: none;
        transition: border-color .15s, box-shadow .15s;
        font-size: 13px; font-weight: 600; color: var(--text-dark, #0f172a);
        box-sizing: border-box;
      }
      .vdp-btn:hover  { border-color: #0d9488; }
      .vdp-btn.vdp-open {
        border-color: #0d9488;
        box-shadow: 0 0 0 3px rgba(13,148,136,.12);
      }
      .vdp-btn svg { color: #0d9488; flex-shrink: 0; }
      .vdp-btn span { flex: 1; text-align: left; }
      .vdp-btn span.vdp-ph { color: var(--text-xlight, #94a3b8); font-weight: 400; }

      /* Popup — fixed ke body, posisi dihitung via JS */
      #vdp-portal {
        position: fixed; z-index: 99999;
        background: var(--surface, #fff);
        border: 1.5px solid #e2e8f0;
        border-radius: 12px;
        box-shadow: 0 8px 28px rgba(0,0,0,.16);
        padding: 12px; width: 268px;
        animation: vdp-in .12s ease;
        box-sizing: border-box;
      }
      @keyframes vdp-in {
        from { opacity: 0; transform: translateY(-4px); }
        to   { opacity: 1; transform: none; }
      }

      .vdp-nav {
        display: flex; align-items: center;
        justify-content: space-between; margin-bottom: 8px;
      }
      .vdp-nav-btn {
        width: 28px; height: 28px; border-radius: 7px;
        border: 1.5px solid #e2e8f0; background: none;
        cursor: pointer; display: flex; align-items: center;
        justify-content: center; padding: 0;
        color: #64748b; transition: border-color .12s, color .12s;
      }
      .vdp-nav-btn:hover { border-color: #0d9488; color: #0d9488; }
      .vdp-nav-title { font-size: 13px; font-weight: 700; color: var(--text-dark, #0f172a); }

      .vdp-grid { display: grid; grid-template-columns: repeat(7,1fr); gap: 1px; }
      .vdp-dh {
        font-size: 10px; font-weight: 700; text-align: center;
        color: #94a3b8; padding: 2px 0; margin-bottom: 2px;
      }
      .vdp-d {
        text-align: center; padding: 6px 0; font-size: 12.5px;
        border-radius: 6px; cursor: pointer;
        color: var(--text-dark, #0f172a); transition: background .1s;
      }
      .vdp-d:hover:not(.vdp-sel):not(.vdp-oth) { background: #f1f5f9; }
      .vdp-d.vdp-oth    { color: #cbd5e1; pointer-events: none; }
      .vdp-d.vdp-today  { color: #0d9488; font-weight: 700; }
      .vdp-d.vdp-sel    { background: #0d9488; color: #fff; font-weight: 700; }

      .vdp-foot {
        display: flex; justify-content: space-between;
        margin-top: 8px; padding-top: 8px;
        border-top: 1px solid #f1f5f9;
      }
      .vdp-foot button {
        background: none; border: none; cursor: pointer;
        font-size: 12px; font-weight: 600; padding: 3px 6px; border-radius: 5px;
      }
      .vdp-fclear { color: #94a3b8; }
      .vdp-fclear:hover { background: #f1f5f9; }
      .vdp-ftoday { color: #0d9488; }
      .vdp-ftoday:hover { background: #f0fdf4; }
    `;
    document.head.appendChild(s);
  }

  /* ────────── Helpers ────────── */
  const p2 = n => String(n).padStart(2, '0');
  const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni',
                  'Juli','Agustus','September','Oktober','November','Desember'];
  const DAYS   = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
  const MSHORT = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

  function todayWITA() {
    const d = new Date(Date.now() + 8 * 3600000);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
  }

  function parseISO(str) {
    if (!str || str.length < 10) return null;
    const [y, mo, d] = str.split('-').map(Number);
    if (!y || !mo || !d) return null;
    return { y, m: mo - 1, d };
  }

  function toISO(y, m, d) { return `${y}-${p2(m+1)}-${p2(d)}`; }
  function fmtDisp(y, m, d) { return `${p2(d)} ${MSHORT[m]} ${y}`; }

  /* ────────── State ────────── */
  const STATE   = {};   // inputId → { y, m, d, navY, navM }
  let activeId  = null;

  /* ────────── Portal (popup di body) ────────── */
  function getPortal() {
    let p = document.getElementById('vdp-portal');
    if (!p) {
      p = document.createElement('div');
      p.id = 'vdp-portal';
      document.body.appendChild(p);
    }
    return p;
  }

  function positionPortal(btnEl) {
    const portal = getPortal();
    const rect   = btnEl.getBoundingClientRect();
    const vw     = window.innerWidth;
    const vh     = window.innerHeight;
    const pw     = 268; // popup width
    const ph     = 320; // popup approx height

    // Buka ke bawah jika cukup ruang, kalau tidak ke atas
    let top  = rect.bottom + 5;
    let left = rect.left;
    if (top + ph > vh) top = rect.top - ph - 5;
    if (left + pw > vw) left = rect.right - pw;
    if (left < 8) left = 8;

    portal.style.top  = top  + 'px';
    portal.style.left = left + 'px';
    portal.style.display = 'block';
  }

  function hidePortal() {
    const p = document.getElementById('vdp-portal');
    if (p) p.style.display = 'none';
  }

  /* ────────── Tutup ────────── */
  function closeAll() {
    hidePortal();
    document.querySelectorAll('.vdp-btn.vdp-open').forEach(el => el.classList.remove('vdp-open'));
    activeId = null;
  }

  /* ────────── Commit ke hidden input ────────── */
  function commitValue(inputId, isoVal) {
    const el = document.getElementById(inputId);
    if (!el) return;
    el.value = isoVal;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /* ────────── Update tampilan tombol ────────── */
  function updateBtn(inputId) {
    const st  = STATE[inputId];
    const btn = document.getElementById('vdp-btn-' + inputId);
    if (!btn) return;
    const sp = btn.querySelector('span');
    if (!sp) return;
    if (st && st.d) {
      sp.textContent = fmtDisp(st.y, st.m, st.d);
      sp.classList.remove('vdp-ph');
    } else {
      sp.textContent = 'Pilih tanggal';
      sp.classList.add('vdp-ph');
    }
  }

  /* ────────── Render isi kalender ke portal ────────── */
  function renderCalendar(inputId, btnEl) {
    const st     = STATE[inputId];
    const portal = getPortal();
    const t      = todayWITA();

    const fd    = new Date(st.navY, st.navM, 1).getDay();
    const nd    = new Date(st.navY, st.navM + 1, 0).getDate();
    const pd    = new Date(st.navY, st.navM, 0).getDate();
    const total = Math.ceil((fd + nd) / 7) * 7;

    let cells = DAYS.map(h => `<div class="vdp-dh">${h}</div>`).join('');
    for (let i = fd - 1; i >= 0; i--)
      cells += `<div class="vdp-d vdp-oth">${pd - i}</div>`;
    for (let d = 1; d <= nd; d++) {
      let c = 'vdp-d';
      if (d === t.d && st.navM === t.m && st.navY === t.y) c += ' vdp-today';
      if (st.d === d && st.m === st.navM && st.y === st.navY) c += ' vdp-sel';
      cells += `<div class="${c}" data-day="${d}">${d}</div>`;
    }
    let after = 1;
    for (let i = fd + nd; i < total; i++, after++)
      cells += `<div class="vdp-d vdp-oth">${after}</div>`;

    portal.innerHTML = `
      <div class="vdp-nav">
        <button class="vdp-nav-btn" data-dir="-1">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span class="vdp-nav-title">${MONTHS[st.navM]} ${st.navY}</span>
        <button class="vdp-nav-btn" data-dir="1">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
      <div class="vdp-grid">${cells}</div>
      <div class="vdp-foot">
        <button class="vdp-fclear">Hapus</button>
        <button class="vdp-ftoday">Hari ini</button>
      </div>`;

    positionPortal(btnEl);

    // Navigasi bulan
    portal.querySelectorAll('[data-dir]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        st.navM += parseInt(btn.dataset.dir);
        if (st.navM > 11) { st.navM = 0; st.navY++; }
        if (st.navM < 0)  { st.navM = 11; st.navY--; }
        renderCalendar(inputId, btnEl);
      });
    });

    // Pilih hari
    portal.querySelectorAll('.vdp-d:not(.vdp-oth)').forEach(el => {
      el.addEventListener('click', e => {
        e.stopPropagation();
        const d = parseInt(el.dataset.day);
        st.d = d; st.m = st.navM; st.y = st.navY;
        commitValue(inputId, toISO(st.y, st.m, st.d));
        updateBtn(inputId);
        closeAll();
      });
    });

    // Hapus tanggal
    portal.querySelector('.vdp-fclear').addEventListener('click', e => {
      e.stopPropagation();
      st.d = 0;
      commitValue(inputId, '');
      updateBtn(inputId);
      closeAll();
    });

    // Hari ini
    portal.querySelector('.vdp-ftoday').addEventListener('click', e => {
      e.stopPropagation();
      const t2 = todayWITA();
      Object.assign(st, { y: t2.y, m: t2.m, d: t2.d, navY: t2.y, navM: t2.m });
      commitValue(inputId, toISO(t2.y, t2.m, t2.d));
      updateBtn(inputId);
      closeAll();
    });
  }

  /* ────────── Init satu picker ────────── */
  function initPicker(inputId) {
    injectCSS();

    const hidden = document.getElementById(inputId);
    if (!hidden) return;

    // Sembunyikan native input
    hidden.style.display = 'none';

    // Baca nilai dari hidden input
    const cur = parseISO(hidden.value);
    const t   = todayWITA();
    STATE[inputId] = cur
      ? { y: cur.y, m: cur.m, d: cur.d, navY: cur.y, navM: cur.m }
      : { y: 0, m: 0, d: 0, navY: t.y, navM: t.m };

    // Jika sudah punya tombol → update tampilan saja
    if (document.getElementById('vdp-btn-' + inputId)) {
      updateBtn(inputId);
      return;
    }

    // Buat tombol
    const btn = document.createElement('div');
    btn.className = 'vdp-btn';
    btn.id = 'vdp-btn-' + inputId;
    btn.setAttribute('role', 'button');
    btn.setAttribute('tabindex', '0');
    btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
      <span class="vdp-ph">Pilih tanggal</span>`;

    btn.addEventListener('click', e => {
      e.stopPropagation();
      const isOpen = activeId === inputId;
      closeAll();
      if (!isOpen) {
        btn.classList.add('vdp-open');
        activeId = inputId;
        renderCalendar(inputId, btn);
      }
    });

    btn.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') btn.click();
      if (e.key === 'Escape') closeAll();
    });

    // Sisipkan tepat setelah hidden input
    hidden.parentNode.insertBefore(btn, hidden.nextSibling);
    updateBtn(inputId);
  }

  /* ────────── Hook ke _initAllPeriodePickers ────────── */
  function hookInit() {
    const orig = window._initAllPeriodePickers;
    if (typeof orig !== 'function') {
      setTimeout(hookInit, 150);
      return;
    }

    window._initAllPeriodePickers = function (jm, js, jmv, jsv) {
      // Time picker asli dulu
      orig.call(this, jm, js, jmv, jsv);
      // Date picker — hidden inputs sudah terisi saat ini
      initPicker('pMulai');
      initPicker('pSelesai');
      initPicker('pMulaiVerif');
      initPicker('pSelesaiVerif');
    };
  }

  /* ────────── Tutup saat klik di luar ────────── */
  document.addEventListener('click', e => {
    if (!activeId) return;
    const portal = document.getElementById('vdp-portal');
    const btn    = document.getElementById('vdp-btn-' + activeId);
    // Jika klik di dalam portal atau di tombol, biarkan
    if (portal && portal.contains(e.target)) return;
    if (btn    && btn.contains(e.target))    return;
    closeAll();
  });

  // Repositon on scroll/resize
  window.addEventListener('scroll', () => { if (activeId) closeAll(); }, true);
  window.addEventListener('resize', () => { if (activeId) closeAll(); });

  /* ────────── Expose global ────────── */
  global.VDP = {
    init: initPicker,
    setValue: function (inputId, isoVal) {
      const cur = parseISO(isoVal);
      const t   = todayWITA();
      if (!STATE[inputId]) STATE[inputId] = { y:0, m:0, d:0, navY:t.y, navM:t.m };
      const st = STATE[inputId];
      if (cur) { st.y=cur.y; st.m=cur.m; st.d=cur.d; st.navY=cur.y; st.navM=cur.m; }
      else { st.d = 0; }
      updateBtn(inputId);
    }
  };

  /* ────────── Start ────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hookInit);
  } else {
    hookInit();
  }

})(window);