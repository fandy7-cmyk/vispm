/**
 * VISPM — RESPONSIVE JS PATCH
 * Tambahkan <script src="/js/responsive-patch.js"></script>
 * di index.html SEBELUM </body>
 *
 * Fitur:
 *  1. Sidebar toggle + body scroll lock di mobile
 *  2. Dashboard grid auto-fix (1fr 1fr → 1fr di mobile)
 *  3. Notif button inject ke topbar
 *  4. Touch-friendly modal (swipe down untuk tutup)
 *  5. iOS viewport fix (100dvh)
 */

(function() {
  'use strict';

  /* ── Konstanta ── */
  const BP_MOBILE = 768;
  const BP_SM     = 600;

  /* ──────────────────────────────────────────────────
   * 1. SIDEBAR TOGGLE — tambah body scroll lock
   * ────────────────────────────────────────────────── */
  function _patchSidebar() {
    // Override fungsi toggleSidebar & closeSidebar global
    const _origToggle = window.toggleSidebar;
    const _origClose  = window.closeSidebar;

    window.toggleSidebar = function() {
      const sidebar  = document.getElementById('sidebar');
      const overlay  = document.getElementById('sidebarOverlay');
      if (!sidebar) return;

      const isOpen = sidebar.classList.contains('open');
      if (isOpen) {
        sidebar.classList.remove('open');
        if (overlay) overlay.classList.remove('show');
        document.body.classList.remove('sidebar-open');
      } else {
        sidebar.classList.add('open');
        if (overlay) overlay.classList.add('show');
        document.body.classList.add('sidebar-open');
      }
    };

    window.closeSidebar = function() {
      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('sidebarOverlay');
      if (!sidebar) return;
      sidebar.classList.remove('open');
      if (overlay) overlay.classList.remove('show');
      document.body.classList.remove('sidebar-open');
    };

    // Tutup sidebar saat menu item diklik di mobile
    document.addEventListener('click', function(e) {
      if (window.innerWidth > BP_MOBILE) return;
      const menuItem = e.target.closest('.menu-item');
      if (menuItem && document.getElementById('sidebar')?.classList.contains('open')) {
        setTimeout(window.closeSidebar, 80);
      }
    });

    // Tutup sidebar saat klik overlay (pastikan overlay ada)
    document.addEventListener('DOMContentLoaded', function() {
      const overlay = document.getElementById('sidebarOverlay');
      if (overlay) {
        overlay.addEventListener('click', window.closeSidebar);
      }
    });
  }

  /* ──────────────────────────────────────────────────
   * 2. NOTIF BUTTON — inject ke topbar jika belum ada
   * ────────────────────────────────────────────────── */
  function _injectNotifBtn() {
    // notif button sudah ada via app-notif.js, pastikan wrapper ada
    const topbarRight = document.querySelector('.topbar-right');
    if (!topbarRight) return;

    // Cek apakah sudah ada notifBtnWrap
    if (document.getElementById('notifBtnWrap')) return;

    const wrap = document.createElement('div');
    wrap.id = 'notifBtnWrap';
    wrap.style.position = 'relative';

    const btn = document.createElement('button');
    btn.id = 'notifBtn';
    btn.title = 'Notifikasi';
    btn.setAttribute('aria-label', 'Notifikasi');
    btn.innerHTML = '<span class="material-icons" style="font-size:20px">notifications</span>';
    btn.onclick = function() {
      if (typeof toggleNotifPanel === 'function') toggleNotifPanel();
    };

    wrap.appendChild(btn);
    // Sisipkan sebelum theme toggle atau avatar
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) {
      topbarRight.insertBefore(wrap, themeBtn);
    } else {
      topbarRight.insertBefore(wrap, topbarRight.firstChild);
    }
  }

  /* ──────────────────────────────────────────────────
   * 3. DASHBOARD GRID — fix inline style "1fr 1fr"
   * ────────────────────────────────────────────────── */
  function _fixDashboardGrid() {
    if (window.innerWidth > BP_MOBILE) return;

    // Cari semua elemen dengan inline style grid 1fr 1fr di dalam mainContent
    const mainContent = document.getElementById('mainContent');
    if (!mainContent) return;

    // Ambil semua elemen yang punya grid inline
    const allEls = mainContent.querySelectorAll('[style]');
    allEls.forEach(function(el) {
      const s = el.style.gridTemplateColumns;
      if (s && s.trim() === '1fr 1fr') {
        el.style.gridTemplateColumns = '1fr';
      }
    });
  }

  /* ──────────────────────────────────────────────────
   * 4. OBSERVER — jalankan fixDashboardGrid setiap
   *    kali mainContent berubah (navigasi halaman)
   * ────────────────────────────────────────────────── */
  function _observeMainContent() {
    const mainContent = document.getElementById('mainContent');
    if (!mainContent || !window.MutationObserver) return;

    const observer = new MutationObserver(function(mutations) {
      // Delay sedikit agar JS render selesai dulu
      setTimeout(_fixDashboardGrid, 50);
    });

    observer.observe(mainContent, { childList: true, subtree: false });
  }

  /* ──────────────────────────────────────────────────
   * 5. iOS VIEWPORT HEIGHT FIX
   *    Mengatasi masalah 100vh ≠ tinggi layar di Safari
   * ────────────────────────────────────────────────── */
  function _fixViewportHeight() {
    function _setVH() {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', vh + 'px');
    }
    _setVH();
    window.addEventListener('resize', _setVH);
    window.addEventListener('orientationchange', function() {
      setTimeout(_setVH, 200); // tunggu setelah orientasi selesai
    });
  }

  /* ──────────────────────────────────────────────────
   * 6. TOUCH-FRIENDLY MODAL CLOSE
   *    Swipe down ≥ 80px untuk tutup modal di mobile
   * ────────────────────────────────────────────────── */
  function _addSwipeToClose() {
    if (window.innerWidth > BP_MOBILE) return;

    document.addEventListener('touchstart', function(e) {
      const card = e.target.closest('.modal-card');
      const modal = e.target.closest('.modal.show');
      if (!card || !modal || modal.classList.contains('fullscreen')) return;

      const startY = e.touches[0].clientY;
      let deltaY = 0;

      function onMove(ev) {
        deltaY = ev.touches[0].clientY - startY;
        if (deltaY > 0) {
          card.style.transform = 'translateY(' + deltaY + 'px)';
          card.style.transition = 'none';
        }
      }

      function onEnd() {
        card.style.transition = '';
        if (deltaY > 80) {
          card.style.transform = '';
          // Cari ID modal dan tutup
          if (typeof closeModal === 'function') {
            closeModal(modal.id);
          } else {
            modal.classList.remove('show');
            modal.style.display = 'none';
          }
        } else {
          card.style.transform = '';
        }
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onEnd);
      }

      document.addEventListener('touchmove', onMove, { passive: true });
      document.addEventListener('touchend', onEnd);
    }, { passive: true });
  }

  /* ──────────────────────────────────────────────────
   * 7. RESIZE HANDLER — bersihkan sidebar state saat
   *    resize ke desktop
   * ────────────────────────────────────────────────── */
  function _onResize() {
    window.addEventListener('resize', function() {
      if (window.innerWidth > BP_MOBILE) {
        // Desktop: hapus class mobile
        document.body.classList.remove('sidebar-open');
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        if (sidebar) sidebar.classList.remove('open');
        if (overlay) overlay.classList.remove('show');
      } else {
        // Mobile: fix dashboard grid jika sedang tampil
        _fixDashboardGrid();
      }
    });
  }

  /* ──────────────────────────────────────────────────
   * 8. TABLE WRAPPER — wrap tabel tanpa .table-container
   *    yang masih raw (fallback)
   * ────────────────────────────────────────────────── */
  function _wrapOrphanTables() {
    if (window.innerWidth > BP_MOBILE) return;
    document.querySelectorAll('table').forEach(function(tbl) {
      const parent = tbl.parentElement;
      if (!parent) return;
      // Sudah dalam .table-container? skip
      if (parent.classList.contains('table-container')) return;
      // Wrap dengan div overflow-x:auto
      if (parent.style.overflowX !== 'auto') {
        parent.style.overflowX = 'auto';
        parent.style.webkitOverflowScrolling = 'touch';
      }
    });
  }

  /* ──────────────────────────────────────────────────
   * 9. GRID FIX — override inline grid-template-columns
   *    di dalam modal dan konten dinamis
   * ────────────────────────────────────────────────── */
  function _fixInlineGrids(root) {
    if (window.innerWidth > BP_MOBILE) return;
    var isSm = window.innerWidth <= BP_SM;
    var context = root || document;

    context.querySelectorAll('[style]').forEach(function(el) {
      var cols = el.style.gridTemplateColumns;
      if (!cols) return;
      var c = cols.trim();
      // 1fr 1fr 1fr → 1 kolom di ≤600px
      if (isSm && (c === '1fr 1fr 1fr')) {
        el.style.gridTemplateColumns = '1fr';
        return;
      }
      // 1fr 1fr → 1 kolom di ≤768px
      if (c === '1fr 1fr' || c === '1fr 1fr ') {
        el.style.gridTemplateColumns = '1fr';
      }
    });
  }

  /* ──────────────────────────────────────────────────
   * 10. MODAL OBSERVER — fix grid & tabel saat modal
   *     baru dibuka (konten dirender via JS)
   * ────────────────────────────────────────────────── */
  function _observeModals() {
    if (!window.MutationObserver) return;
    // Amati semua perubahan di body (modal dirender di sini)
    var obs = new MutationObserver(function(mutations) {
      if (window.innerWidth > BP_MOBILE) return;
      mutations.forEach(function(m) {
        m.addedNodes.forEach(function(node) {
          if (node.nodeType !== 1) return;
          // Fix grid di node baru
          setTimeout(function() {
            _fixInlineGrids(node);
            _wrapOrphanTables();
          }, 60);
        });
        // Juga fix jika konten dalam node yang ada berubah
        if (m.type === 'childList' && m.target && m.target.id) {
          var id = m.target.id;
          if (id === 'detailModalBody' || id === 'indikatorInputBody' ||
              id === 'mainContent' || id === 'notifPanelBody') {
            setTimeout(function() {
              _fixInlineGrids(m.target);
              _wrapOrphanTables();
            }, 80);
          }
        }
      });
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  /* ──────────────────────────────────────────────────
   * 11. INIT
   * ────────────────────────────────────────────────── */
  function _init() {
    _fixViewportHeight();
    _patchSidebar();
    _onResize();
    _addSwipeToClose();

    // Inject notif button & observer setelah DOM siap
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        _injectNotifBtn();
        _observeMainContent();
        _observeModals();
      });
    } else {
      _injectNotifBtn();
      _observeMainContent();
      _observeModals();
    }

    // Jalankan fix setelah app selesai render (tunggu auth selesai)
    // Override loadPage untuk jalankan fix setelah navigasi
    const _origLoadPage = window.loadPage;
    if (typeof _origLoadPage === 'function') {
      window.loadPage = function() {
        const result = _origLoadPage.apply(this, arguments);
        setTimeout(function() {
          _fixDashboardGrid();
          _fixInlineGrids();
          _wrapOrphanTables();
        }, 150);
        return result;
      };
    }

    // Fallback: jalankan setelah 1 detik (pastikan app sudah render)
    setTimeout(function() {
      _fixDashboardGrid();
      _fixInlineGrids();
      _wrapOrphanTables();
      _injectNotifBtn();
    }, 1000);
  }

  _init();

})();
