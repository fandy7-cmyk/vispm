/**
 * VISPM — CUSTOM TOOLTIP COMPONENT
 * Menggantikan tooltip native browser (attribute [title]) dengan bubble
 * custom yang konsisten di semua platform (desktop, Android, iOS).
 *
 * Cara pakai:
 *   1. Tambahkan <script src="/js/custom-tooltip.js"></script> di index.html
 *      SETELAH semua JS lain (boleh sebelum/sesudah custom-select.js, tidak saling bergantung)
 *   2. Semua elemen dengan attribute [title="..."] otomatis dikonversi saat
 *      halaman load DAN setiap kali konten <body> berubah (navigasi, modal, re-render tabel)
 *
 * API:
 *   - Cukup pakai title="..." seperti biasa di HTML, sisanya otomatis
 *   - title dipindah ke data-tooltip (aria-label ditambahkan otomatis utk aksesibilitas
 *     jika belum ada), sehingga tooltip native browser tidak pernah muncul
 *   - Mendukung disabled button, dark mode via CSS var, keyboard focus (Tab)
 *   - Auto-flip posisi (atas/bawah) & auto-clamp horizontal agar tidak terpotong viewport
 */

(function () {
  'use strict';

  /* ─── Inject CSS ─────────────────────────────────────────── */
  const STYLE_ID = '__vispm_tt_style';
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
.tt-bubble {
  position: fixed;
  z-index: 9999;
  display: flex;
  align-items: center;
  background: var(--primary, #0d9488);
  color: #ffffff;
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-size: 11.5px;
  font-weight: 600;
  padding: 6px 10px;
  border-radius: 7px;
  box-shadow: 0 8px 24px rgba(13,148,136,0.28), 0 2px 8px rgba(0,0,0,0.08);
  pointer-events: none;
  max-width: 240px;
  width: max-content;
  white-space: normal;
  line-height: 1.4;
  opacity: 0;
  transform: translateY(4px) scale(0.96);
  transition: opacity .12s ease, transform .15s cubic-bezier(.34,1.56,.64,1);
}
.tt-bubble.tt-show { opacity: 1; transform: translateY(0) scale(1); }
.tt-bubble.tt-below { transform: translateY(-4px) scale(0.96); }
.tt-bubble.tt-below.tt-show { transform: translateY(0) scale(1); }
.tt-arrow {
  position: absolute;
  width: 8px;
  height: 8px;
  background: var(--primary, #0d9488);
  transform: rotate(45deg);
}
[data-theme="dark"] .tt-bubble { box-shadow: 0 8px 24px rgba(13,148,136,0.35), 0 2px 8px rgba(0,0,0,0.3); }
    `;
    document.head.appendChild(style);
  }

  /* ─── State ────────────────────────────────────────────── */
  let bubble = null, textEl = null, arrow = null;
  let currentEl = null, showTimer = null, hideTimer = null;

  /* ─── Build bubble (sekali saja, reused) ─────────────────── */
  function ensureBubble() {
    if (bubble) return;
    bubble = document.createElement('div');
    bubble.className = 'tt-bubble';
    bubble.setAttribute('role', 'tooltip');
    textEl = document.createElement('span');
    textEl.className = 'tt-text';
    arrow = document.createElement('div');
    arrow.className = 'tt-arrow';
    bubble.appendChild(textEl);
    bubble.appendChild(arrow);
    document.body.appendChild(bubble);
  }

  /* ─── Posisi bubble relatif ke elemen target ─────────────── */
  function position(el) {
    const rect = el.getBoundingClientRect();
    const bRect = bubble.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;

    let top = rect.top - bRect.height - 9;
    let below = false;
    if (top < 6) { top = rect.bottom + 9; below = true; }
    if (below && top + bRect.height > vh - 6) { top = Math.max(6, vh - bRect.height - 6); }

    let left = rect.left + rect.width / 2 - bRect.width / 2;
    if (left < 6) left = 6;
    if (left + bRect.width > vw - 6) left = vw - bRect.width - 6;

    bubble.style.top = top + 'px';
    bubble.style.left = left + 'px';
    bubble.classList.toggle('tt-below', below);

    const arrowLeft = Math.min(Math.max(rect.left + rect.width / 2 - left - 4, 8), Math.max(bRect.width - 16, 8));
    arrow.style.left = arrowLeft + 'px';
    if (below) { arrow.style.top = '-4px'; arrow.style.bottom = ''; }
    else { arrow.style.bottom = '-4px'; arrow.style.top = ''; }
  }

  function show(el) {
    const text = el.getAttribute('data-tooltip');
    if (!text) return;
    ensureBubble();
    textEl.textContent = text;
    bubble.classList.remove('tt-show');
    currentEl = el;
    requestAnimationFrame(() => {
      if (currentEl !== el) return;
      position(el);
      requestAnimationFrame(() => { if (currentEl === el) bubble.classList.add('tt-show'); });
    });
  }

  function hide() {
    if (bubble) bubble.classList.remove('tt-show');
    currentEl = null;
  }

  /* ─── Konversi title → data-tooltip ──────────────────────── */
  function convert(el) {
    if (el._ttConverted) return;
    const t = el.getAttribute('title');
    if (!t || !t.trim()) return;
    el._ttConverted = true;
    el.setAttribute('data-tooltip', t);
    if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', t);
    el.removeAttribute('title');
  }

  function convertAll(container) {
    (container || document).querySelectorAll('[title]').forEach(convert);
  }

  /* ─── Event delegation (hover + keyboard focus) ──────────── */
  document.addEventListener('mouseover', e => {
    const el = e.target.closest('[data-tooltip]');
    if (!el || el === currentEl) return;
    clearTimeout(hideTimer); clearTimeout(showTimer);
    showTimer = setTimeout(() => show(el), 350);
  });
  document.addEventListener('mouseout', e => {
    const el = e.target.closest('[data-tooltip]');
    if (!el) return;
    clearTimeout(showTimer);
    hideTimer = setTimeout(hide, 80);
  });
  document.addEventListener('focusin', e => {
    const el = e.target.closest('[data-tooltip]');
    if (el) { clearTimeout(showTimer); show(el); }
  });
  document.addEventListener('focusout', e => {
    const el = e.target.closest('[data-tooltip]');
    if (el) hide();
  });
  document.addEventListener('click', hide, true);
  document.addEventListener('scroll', () => { if (currentEl) position(currentEl); }, true);
  window.addEventListener('resize', () => { if (currentEl) position(currentEl); });

  /* ─── Observer seluruh <body> (mencakup mainContent + modal) ─ */
  function _observeAndConvert() {
    if (!window.MutationObserver) return;
    let pending = false;
    const obs = new MutationObserver(() => {
      if (pending) return;
      pending = true;
      setTimeout(() => { convertAll(document.body); pending = false; }, 60);
    });
    obs.observe(document.body, { childList: true, subtree: true, attributeFilter: ['title'], attributes: true });
  }

  /* ─── Init ───────────────────────────────────────────────── */
  function init() {
    convertAll(document);
    _observeAndConvert();

    // Patch loadPage agar konversi dijalankan lagi setelah render halaman
    const _origLoadPage = window.loadPage;
    if (typeof _origLoadPage === 'function') {
      window.loadPage = function () {
        const r = _origLoadPage.apply(this, arguments);
        setTimeout(() => convertAll(document.getElementById('mainContent')), 120);
        return r;
      };
    }

    window.CustomTooltip = { convert, convertAll, hide };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 50);
  }

})();