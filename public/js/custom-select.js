/**
 * VISPM — CUSTOM SELECT COMPONENT
 * Menggantikan semua <select class="form-control"> native dengan dropdown custom
 * yang konsisten di semua platform (desktop, Android, iOS).
 *
 * Cara pakai:
 *   1. Tambahkan <script src="/js/custom-select.js"></script> di index.html SETELAH semua JS lain
 *   2. Semua <select class="form-control"> akan otomatis di-replace saat halaman load
 *      DAN setiap kali konten mainContent berubah (navigasi halaman).
 *
 * API:
 *   - Membaca/menulis .value pada elemen <select> asli tetap bekerja normal
 *   - Event 'change' pada <select> asli tetap ter-trigger
 *   - Mendukung: disabled, multiple classes, data-*, aria-label
 *   - Mendukung dark mode via CSS var
 *   - Mendukung search/filter untuk dropdown dengan banyak opsi (≥8 item)
 *   - Fully keyboard accessible (Tab, Enter, Space, Esc, Arrow keys)
 *   - Tutup otomatis saat klik di luar / scroll
 */

(function () {
  'use strict';

  /* ─── Inject CSS ─────────────────────────────────────────── */
  const STYLE_ID = '__vispm_cs_style';
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
/* ===== CUSTOM SELECT WRAPPER ===== */
.cs-wrap {
  position: relative;
  display: block;
  /* width diatur via JS: 100% di luar flex container, auto/inherit di dalam flex */
  font-family: 'Plus Jakarta Sans', sans-serif;
  box-sizing: border-box;
}
.cs-wrap.cs-disabled { opacity: 0.55; pointer-events: none; }

/* Trigger button — mirip .form-control */
.cs-trigger {
  width: 100%;
  min-height: 36px;
  padding: var(--sp-base, 8px) 36px var(--sp-base, 8px) var(--sp-md, 13px);
  border: 1.5px solid var(--border, #e2e8f0);
  border-radius: var(--sp-base, 8px);
  font-size: var(--fs-sm, 11px);
  font-family: inherit;
  font-weight: 500;
  color: var(--text, #0f172a);
  background: var(--surface, #ffffff);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  text-align: left;
  transition: border-color 0.18s, box-shadow 0.18s, background 0.12s;
  outline: none;
  line-height: 1.4;
  box-sizing: border-box;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}
.cs-trigger:hover {
  border-color: var(--primary, #0d9488);
  background: var(--surface, #fff);
}
.cs-trigger:focus,
.cs-trigger[aria-expanded="true"] {
  border-color: var(--primary, #0d9488);
  box-shadow: 0 0 0 3px rgba(13,148,136,0.12);
  background: var(--surface, #fff);
}
.cs-trigger-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cs-trigger-text.cs-placeholder {
  color: var(--text-xlight, #94a3b8);
}
.cs-chevron {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-light, #64748b);
  transition: transform 0.2s cubic-bezier(0.34,1.56,0.64,1);
  pointer-events: none;
}
.cs-trigger[aria-expanded="true"] .cs-chevron {
  transform: rotate(180deg);
}

/* Dropdown panel */
.cs-panel {
  position: fixed; /* fixed agar tidak terpotong overflow parent */
  z-index: 9500;
  background: var(--surface, #fff);
  border: 1.5px solid var(--border, #e2e8f0);
  border-radius: var(--sp-md, 13px);
  box-shadow: 0 8px 32px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.06);
  overflow: hidden;
  min-width: 160px;
  max-width: 420px;

  /* Animasi masuk */
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
  transform-origin: top left;
  transition: opacity 0.15s ease, transform 0.18s cubic-bezier(0.34,1.56,0.64,1);
  pointer-events: none;
}
.cs-panel.cs-panel-open {
  opacity: 1;
  transform: translateY(0) scale(1);
  pointer-events: auto;
}
/* Animasi dari bawah (jika panel muncul ke atas) */
.cs-panel.cs-panel-up {
  transform-origin: bottom left;
  transform: translateY(6px) scale(0.98);
}
.cs-panel.cs-panel-up.cs-panel-open {
  transform: translateY(0) scale(1);
}

/* Search input di dalam panel */
.cs-search-wrap {
  padding: 8px 10px 6px;
  border-bottom: 1px solid var(--border-light, #f1f5f9);
  position: sticky;
  top: 0;
  background: var(--surface, #fff);
  z-index: 1;
}
.cs-search {
  width: 100%;
  padding: 6px 10px 6px 32px;
  border: 1.5px solid var(--border, #e2e8f0);
  border-radius: 8px;
  font-size: 12px;
  font-family: inherit;
  color: var(--text, #0f172a);
  background: var(--bg, #f8fafc);
  outline: none;
  transition: border-color 0.15s;
  box-sizing: border-box;
}
.cs-search:focus { border-color: var(--primary, #0d9488); }
.cs-search-icon {
  position: absolute;
  left: 20px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-xlight, #94a3b8);
  font-size: 15px;
  pointer-events: none;
}

/* List */
.cs-list {
  max-height: 260px;
  overflow-y: auto;
  padding: 4px 0;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}
.cs-list::-webkit-scrollbar { width: 4px; }
.cs-list::-webkit-scrollbar-track { background: transparent; }
.cs-list::-webkit-scrollbar-thumb { background: var(--border, #e2e8f0); border-radius: 4px; }

/* Option item */
.cs-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 14px;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-md, #334155);
  cursor: pointer;
  border: none;
  background: none;
  width: 100%;
  text-align: left;
  line-height: 1.4;
  transition: background 0.1s;
  border-radius: 0;
  outline: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cs-option:hover,
.cs-option.cs-focused {
  background: var(--bg, #f0fdf9);
  color: var(--text, #0f172a);
}
.cs-option.cs-selected {
  background: var(--primary-light, #e6fffa);
  color: var(--primary, #0d9488);
  font-weight: 700;
}
.cs-option.cs-selected:hover { background: #d1fae5; }
.cs-option-check {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--primary, #0d9488);
  font-size: 14px;
  opacity: 0;
}
.cs-option.cs-selected .cs-option-check { opacity: 1; }

/* Separator / optgroup label */
.cs-group-label {
  padding: 8px 14px 4px;
  font-size: 10px;
  font-weight: 700;
  color: var(--text-xlight, #94a3b8);
  letter-spacing: 0.8px;
  text-transform: uppercase;
  pointer-events: none;
  border-top: 1px solid var(--border-light, #f1f5f9);
  margin-top: 2px;
}
.cs-group-label:first-child { border-top: none; margin-top: 0; }

/* Empty search result */
.cs-empty {
  padding: 20px 14px;
  text-align: center;
  font-size: 12px;
  color: var(--text-xlight, #94a3b8);
}

/* ===== DARK MODE ===== */
[data-theme="dark"] .cs-trigger {
  background: var(--surface, #1e293b);
  border-color: var(--border, #334155);
  color: var(--text, #f1f5f9);
}
[data-theme="dark"] .cs-trigger:hover,
[data-theme="dark"] .cs-trigger:focus,
[data-theme="dark"] .cs-trigger[aria-expanded="true"] {
  border-color: var(--primary, #0d9488);
  background: var(--surface, #1e293b);
}
[data-theme="dark"] .cs-panel {
  background: var(--surface, #1e293b);
  border-color: var(--border, #334155);
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
}
[data-theme="dark"] .cs-search-wrap { background: var(--surface, #1e293b); border-color: #273449; }
[data-theme="dark"] .cs-search { background: #0f172a; border-color: #334155; color: #f1f5f9; }
[data-theme="dark"] .cs-option { color: var(--text-md, #cbd5e1); }
[data-theme="dark"] .cs-option:hover,
[data-theme="dark"] .cs-option.cs-focused { background: #0f172a; color: #f1f5f9; }
[data-theme="dark"] .cs-option.cs-selected { background: rgba(13,148,136,0.18); color: #5eead4; }
[data-theme="dark"] .cs-option.cs-selected:hover { background: rgba(13,148,136,0.28); }
[data-theme="dark"] .cs-group-label { color: #475569; border-color: #273449; }
[data-theme="dark"] thead tr { background: #273449; }
[data-theme="dark"] tbody tr:hover td { background: #273449; }

/* ===== FILTER ROW FIX ===== */
.filter-row .cs-wrap { min-width: 140px; flex: 1; }

/* ===== HIDE native selects yang sudah di-replace ===== */
.cs-native-hidden {
  position: absolute !important;
  width: 1px !important;
  height: 1px !important;
  opacity: 0 !important;
  pointer-events: none !important;
  overflow: hidden !important;
}
    `;
    document.head.appendChild(style);
  }

  /* ─── State ────────────────────────────────────────────── */
  let _openWrap = null; // wrap yang panel-nya sedang terbuka

  /* ─── Utility ───────────────────────────────────────────── */
  function getSelectedText(select) {
    const opt = select.options[select.selectedIndex];
    return opt ? opt.text : '';
  }
  function isPlaceholder(select) {
    const opt = select.options[select.selectedIndex];
    return !opt || opt.value === '' || opt.dataset.placeholder === '1';
  }

  /* ─── Posisi panel ──────────────────────────────────────── */
  function positionPanel(wrap, panel) {
    const triggerEl = wrap.querySelector('.cs-trigger');
    const rect = triggerEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const panelH = 320; // estimasi max
    const panelW = Math.max(rect.width, 200);

    panel.style.width = Math.min(panelW, 420) + 'px';

    // Vertikal: cek ruang bawah vs atas
    const spaceBelow = vh - rect.bottom - 8;
    const spaceAbove = rect.top - 8;

    if (spaceBelow >= Math.min(panelH, 200) || spaceBelow >= spaceAbove) {
      panel.style.top = (rect.bottom + 4) + 'px';
      panel.style.bottom = 'auto';
      panel.classList.remove('cs-panel-up');
    } else {
      panel.style.bottom = (vh - rect.top + 4) + 'px';
      panel.style.top = 'auto';
      panel.classList.add('cs-panel-up');
    }

    // Horizontal
    let left = rect.left;
    if (left + panelW > vw - 8) left = vw - panelW - 8;
    if (left < 8) left = 8;
    panel.style.left = left + 'px';
  }

  /* ─── Close panel ───────────────────────────────────────── */
  function closeAll(except) {
    document.querySelectorAll('.cs-panel.cs-panel-open').forEach(p => {
      const w = p._csWrap;
      if (w && w !== except) _closePanel(w);
    });
  }

  function _closePanel(wrap) {
    const panel = wrap._csPanel;
    const trigger = wrap.querySelector('.cs-trigger');
    if (!panel) return;
    panel.classList.remove('cs-panel-open');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
    setTimeout(() => {
      if (panel.parentNode && !panel.classList.contains('cs-panel-open')) {
        panel.parentNode.removeChild(panel);
      }
    }, 200);
    wrap._csPanel = null;
    _openWrap = null;
  }

  /* ─── Build panel ───────────────────────────────────────── */
  function buildPanel(wrap, select) {
    const panel = document.createElement('div');
    panel.className = 'cs-panel';
    panel.setAttribute('role', 'listbox');
    panel._csWrap = wrap;
    wrap._csPanel = panel;

    // Kumpulkan semua opsi (termasuk optgroup)
    const allOptions = []; // { el, text, value, group }
    for (const child of select.children) {
      if (child.tagName === 'OPTGROUP') {
        for (const opt of child.children) {
          allOptions.push({ el: opt, text: opt.text, value: opt.value, group: child.label });
        }
      } else if (child.tagName === 'OPTION') {
        allOptions.push({ el: child, text: child.text, value: child.value, group: null });
      }
    }

    const useSearch = allOptions.length >= 8;

    // Search input
    let searchInput = null;
    if (useSearch) {
      const searchWrap = document.createElement('div');
      searchWrap.className = 'cs-search-wrap';
      searchWrap.style.position = 'relative';
      searchWrap.innerHTML = `
        <span class="material-icons cs-search-icon">search</span>
        <input class="cs-search" placeholder="Cari..." type="text" autocomplete="off" spellcheck="false">
      `;
      panel.appendChild(searchWrap);
      searchInput = searchWrap.querySelector('.cs-search');
    }

    // List
    const list = document.createElement('div');
    list.className = 'cs-list';
    list.setAttribute('role', 'presentation');
    panel.appendChild(list);

    let focusedIdx = -1;

    function renderList(filter) {
      list.innerHTML = '';
      const q = (filter || '').toLowerCase().trim();
      let lastGroup = null;
      let visibleCount = 0;
      const visibleItems = [];

      allOptions.forEach((opt, idx) => {
        if (q && !opt.text.toLowerCase().includes(q) && !opt.value.toLowerCase().includes(q)) return;

        // Group label
        if (opt.group && opt.group !== lastGroup) {
          lastGroup = opt.group;
          const gl = document.createElement('div');
          gl.className = 'cs-group-label';
          gl.textContent = opt.group;
          list.appendChild(gl);
        }

        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'cs-option';
        item.setAttribute('role', 'option');
        item.dataset.value = opt.value;
        item.dataset.optIdx = idx;

        const isSelected = select.value === opt.value;
        if (isSelected) item.classList.add('cs-selected');

        item.innerHTML = `
          <span class="cs-option-check material-icons">check</span>
          <span>${opt.text}</span>
        `;

        item.addEventListener('mousedown', e => e.preventDefault()); // jangan blur trigger
        item.addEventListener('click', () => {
          selectOption(opt.value, opt.text, wrap, select);
        });
        item.addEventListener('mousemove', () => {
          setFocus(visibleItems.indexOf(item));
        });

        list.appendChild(item);
        visibleItems.push(item);
        visibleCount++;
      });

      if (visibleCount === 0) {
        list.innerHTML = `<div class="cs-empty">Tidak ada hasil</div>`;
      }

      focusedIdx = -1;
      // Auto-focus item yang selected
      const selItem = list.querySelector('.cs-option.cs-selected');
      if (selItem) {
        const i = visibleItems.indexOf(selItem);
        if (i >= 0) setFocus(i);
        setTimeout(() => selItem.scrollIntoView({ block: 'nearest' }), 10);
      }

      function setFocus(idx) {
        visibleItems.forEach((it, i) => it.classList.toggle('cs-focused', i === idx));
        focusedIdx = idx;
      }

      // Keyboard nav dari search
      const keyHandler = (e) => {
        if (!panel.classList.contains('cs-panel-open')) return;
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setFocus(Math.min(focusedIdx + 1, visibleItems.length - 1));
          if (visibleItems[focusedIdx]) visibleItems[focusedIdx].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setFocus(Math.max(focusedIdx - 1, 0));
          if (visibleItems[focusedIdx]) visibleItems[focusedIdx].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter' || e.key === ' ') {
          if (focusedIdx >= 0 && visibleItems[focusedIdx]) {
            e.preventDefault();
            visibleItems[focusedIdx].click();
          }
        } else if (e.key === 'Escape') {
          _closePanel(wrap);
          wrap.querySelector('.cs-trigger').focus();
        }
      };
      panel._keyHandler = keyHandler;
    }

    renderList('');

    if (searchInput) {
      searchInput.addEventListener('input', () => renderList(searchInput.value));
      searchInput.addEventListener('keydown', e => {
        if (panel._keyHandler) panel._keyHandler(e);
      });
    }

    // Keyboard nav dari trigger (ketika panel open)
    wrap._panelKeyHandler = (e) => {
      if (!panel.classList.contains('cs-panel-open')) return;
      if (panel._keyHandler) panel._keyHandler(e);
    };

    document.body.appendChild(panel);
    return { panel, searchInput };
  }

  /* ─── Select option ─────────────────────────────────────── */
  function selectOption(value, text, wrap, select) {
    select.value = value;
    // Trigger change event
    const ev = new Event('change', { bubbles: true });
    select.dispatchEvent(ev);

    // Update trigger text
    const triggerText = wrap.querySelector('.cs-trigger-text');
    if (triggerText) {
      triggerText.textContent = text;
      triggerText.classList.toggle('cs-placeholder', !value || value === '');
    }

    _closePanel(wrap);
    wrap.querySelector('.cs-trigger').focus();
  }

  /* ─── Open panel ────────────────────────────────────────── */
  function openPanel(wrap, select) {
    if (wrap._csPanel) { _closePanel(wrap); return; } // toggle
    closeAll(wrap);

    const { panel, searchInput } = buildPanel(wrap, select);
    const trigger = wrap.querySelector('.cs-trigger');
    trigger.setAttribute('aria-expanded', 'true');

    // Position sebelum animasi
    positionPanel(wrap, panel);

    // Animasi masuk (next frame)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        panel.classList.add('cs-panel-open');
      });
    });

    _openWrap = wrap;

    if (searchInput) {
      setTimeout(() => searchInput.focus(), 80);
    }
  }

  /* ─── Replace satu <select> ─────────────────────────────── */
  function replaceSelect(select) {
    // Sudah di-replace sebelumnya? skip
    if (select._csReplaced) return;
    // Skip jika di dalam .cs-wrap (sudah wrapped)
    if (select.closest('.cs-wrap')) return;
    // Skip hidden
    if (select.type === 'hidden') return;

    select._csReplaced = true;

    // Wrap
    const wrap = document.createElement('div');
    wrap.className = 'cs-wrap';
    if (select.disabled) wrap.classList.add('cs-disabled');
    // Salin class tertentu dari select ke wrap (untuk filter-row dll)
    ['flex-1', 'w-full'].forEach(c => { if (select.classList.contains(c)) wrap.classList.add(c); });
    // Wariskan dimensi inline dari select asli ke wrapper
    if (select.style.width)    wrap.style.width    = select.style.width;
    if (select.style.minWidth) wrap.style.minWidth = select.style.minWidth;
    if (select.style.maxWidth) wrap.style.maxWidth = select.style.maxWidth;
    if (select.style.flex)     wrap.style.flex     = select.style.flex;
    // Jika tidak ada width/flex eksplisit dan bukan di dalam konteks flex parent,
    // default ke width 100% hanya jika select asli juga 100% (atau tidak diset)
    if (!select.style.width && !select.style.flex) {
      // Cek apakah parent adalah flex container (search-row / filter-row)
      const parentStyle = window.getComputedStyle(select.parentNode);
      const isFlexParent = parentStyle.display === 'flex' || parentStyle.display === 'inline-flex';
      if (!isFlexParent) wrap.style.width = '100%';
    }

    // Sembunyikan select asli
    select.classList.add('cs-native-hidden');

    // Sisipkan wrap sebelum select
    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(select);

    // Teks awal
    const selText = getSelectedText(select);
    const isPlaceholderNow = isPlaceholder(select);

    // Trigger button
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'cs-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    if (select.getAttribute('aria-label')) trigger.setAttribute('aria-label', select.getAttribute('aria-label'));
    trigger.innerHTML = `
      <span class="cs-trigger-text ${isPlaceholderNow ? 'cs-placeholder' : ''}">${selText || select.getAttribute('placeholder') || 'Pilih...'}</span>
      <span class="cs-chevron material-icons" aria-hidden="true">expand_more</span>
    `;

    wrap.insertBefore(trigger, select);

    // Events
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      if (wrap.classList.contains('cs-disabled')) return;
      openPanel(wrap, select);
    });

    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (!wrap._csPanel) openPanel(wrap, select);
        else if (wrap._panelKeyHandler) wrap._panelKeyHandler(e);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!wrap._csPanel) openPanel(wrap, select);
        else if (wrap._panelKeyHandler) wrap._panelKeyHandler(e);
      } else if (e.key === 'Escape') {
        if (wrap._csPanel) _closePanel(wrap);
      }
    });

    // Sinkronisasi jika select.value berubah dari luar (JS)
    const origDescriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
    if (origDescriptor) {
      let _inSet = false;
      Object.defineProperty(select, 'value', {
        get() { return origDescriptor.get.call(this); },
        set(v) {
          origDescriptor.set.call(this, v);
          if (!_inSet) {
            _inSet = true;
            const triggerText = wrap.querySelector('.cs-trigger-text');
            if (triggerText) {
              const txt = getSelectedText(select);
              triggerText.textContent = txt;
              triggerText.classList.toggle('cs-placeholder', !v || v === '');
            }
            _inSet = false;
          }
        },
        configurable: true,
      });
    }

    // Observe disabled attribute changes
    const attrObs = new MutationObserver(() => {
      wrap.classList.toggle('cs-disabled', select.disabled);
    });
    attrObs.observe(select, { attributes: true, attributeFilter: ['disabled'] });
  }

  /* ─── Replace semua select di container ─────────────────── */
  function replaceAllInContainer(container) {
    const selects = (container || document).querySelectorAll('select.form-control, select.filter-select');
    selects.forEach(replaceSelect);
  }

  /* ─── Global click → tutup panel ────────────────────────── */
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.cs-wrap') && !e.target.closest('.cs-panel')) {
      closeAll(null);
    }
  });

  /* ─── Scroll parent → reposition atau tutup ─────────────── */
  document.addEventListener('scroll', () => {
    if (_openWrap && _openWrap._csPanel) {
      positionPanel(_openWrap, _openWrap._csPanel);
    }
  }, true);

  window.addEventListener('resize', () => {
    if (_openWrap && _openWrap._csPanel) {
      positionPanel(_openWrap, _openWrap._csPanel);
    }
  });

  /* ─── Observer mainContent (navigasi antar halaman) ────────── */
  function _observeAndReplace() {
    const mainContent = document.getElementById('mainContent');
    if (!mainContent || !window.MutationObserver) return;

    const obs = new MutationObserver(() => {
      setTimeout(() => replaceAllInContainer(mainContent), 60);
    });
    obs.observe(mainContent, { childList: true, subtree: true });
  }

  /* ─── Init ───────────────────────────────────────────────── */
  function init() {
    replaceAllInContainer(document);
    _observeAndReplace();

    // Patch loadPage agar replace dijalankan setelah render
    const _origLoadPage = window.loadPage;
    if (typeof _origLoadPage === 'function') {
      window.loadPage = function () {
        const r = _origLoadPage.apply(this, arguments);
        setTimeout(() => replaceAllInContainer(document.getElementById('mainContent')), 120);
        return r;
      };
    }

    // Ekspor API publik
    window.CustomSelect = {
      replace: replaceSelect,
      replaceAll: replaceAllInContainer,
      closeAll,
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // Tunggu sedikit agar semua JS lain selesai inject select mereka
    setTimeout(init, 50);
  }

})();