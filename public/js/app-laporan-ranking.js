// ============================================================
//  RANKING PUSKESMAS — Fitur tambahan di halaman Laporan Admin
//  Tab bar sudah di-render langsung oleh renderLaporan() di app-master.js
//  File ini hanya berisi logika switching tab & render tabel ranking
// ============================================================

(function () {
  'use strict';

  /* ── State ─────────────────────────────────────────────── */
  let _rankTab   = 'tabel';
  let _rankTahun = '';
  let _rankBulan = '';
  let _rankPage  = 1;
  const _RANK_PER_PAGE = 10;

  /* ── Tab Switching ──────────────────────────────────────── */
  window._lapSwitchTab = function (tab) {
    _rankTab = tab;

    const tabelBtn   = document.getElementById('lapTabTabel');
    const rankingBtn = document.getElementById('lapTabRanking');
    const tabelCard  = document.getElementById('lapTabelCard');
    const rankCard   = document.getElementById('lapRankingCard');

    if (tabelBtn) {
      tabelBtn.style.color             = tab === 'tabel' ? '#0d9488' : '#64748b';
      tabelBtn.style.borderBottomColor = tab === 'tabel' ? '#0d9488' : 'transparent';
    }
    if (rankingBtn) {
      rankingBtn.style.color             = tab === 'ranking' ? '#0d9488' : '#64748b';
      rankingBtn.style.borderBottomColor = tab === 'ranking' ? '#0d9488' : 'transparent';
    }
    if (tabelCard)  tabelCard.style.display  = tab === 'tabel'   ? '' : 'none';
    if (rankCard)   rankCard.style.display   = tab === 'ranking' ? '' : 'none';

    if (tab === 'ranking') {
      _populateRankFilters();
      _rankRenderTable();
    }
  };

  /* ── Dipanggil dari onchange filter ranking ─────────────── */
  window._rankApplyFilter = function () {
    _rankTahun = document.getElementById('rankTahun')?.value || '';
    _rankBulan = document.getElementById('rankBulan')?.value || '';

    const data = window._lapAllData || [];
    const rankBulanEl = document.getElementById('rankBulan');
    if (rankBulanEl) {
      const tahunFilter = _rankTahun ? parseInt(_rankTahun) : 0;
      const rowsByTahun = tahunFilter ? data.filter(r => parseInt(r.tahun) === tahunFilter) : data;
      const bulanMap = new Map();
      rowsByTahun.forEach(r => { if (r.bulan && r.namaBulan) bulanMap.set(parseInt(r.bulan), r.namaBulan); });
      const bulanSorted = [...bulanMap.entries()].sort((a, b) => a[0] - b[0]);
      const savedBulan = _rankBulan;
      rankBulanEl.innerHTML = '<option value="">Semua Bulan</option>'
        + bulanSorted.map(([no, nama]) => `<option value="${no}" ${no == savedBulan ? 'selected' : ''}>${nama}</option>`).join('');
      _rankBulan = rankBulanEl.value;
    }

    _rankPage = 1;
    _rankRenderTable();
  };

  /* ── Expose fungsi ganti halaman ────────────────────────── */
  window._rankGoPage = function (p) {
    _rankPage = p;
    _rankRenderTable();
  };

  /* ── Populate filter dropdown saat tab ranking dibuka ───── */
  function _populateRankFilters() {
    const data = window._lapAllData || [];

    const rankTahunEl = document.getElementById('rankTahun');
    if (rankTahunEl) {
      const years = [...new Set(data.map(r => parseInt(r.tahun)).filter(Boolean))].sort((a, b) => b - a);
      const lapTahun = document.getElementById('lapTahun')?.value || '';
      const thisYear = String(new Date().getFullYear());
      const defaultTahun = years.includes(parseInt(thisYear)) ? thisYear : (years[0] ? String(years[0]) : '');
      const curTahun = _rankTahun || lapTahun || defaultTahun;
      rankTahunEl.innerHTML = '<option value="">Semua Tahun</option>'
        + years.map(y => `<option value="${y}">${y}</option>`).join('');
      // Set value eksplisit — lebih andal dari atribut selected di innerHTML
      rankTahunEl.value = curTahun;
      _rankTahun = rankTahunEl.value;
    }

    const rankBulanEl = document.getElementById('rankBulan');
    if (rankBulanEl) {
      const tahunFilter = _rankTahun ? parseInt(_rankTahun) : 0;
      const rowsByTahun = tahunFilter ? data.filter(r => parseInt(r.tahun) === tahunFilter) : data;
      const bulanMap = new Map();
      rowsByTahun.forEach(r => { if (r.bulan && r.namaBulan) bulanMap.set(parseInt(r.bulan), r.namaBulan); });
      const bulanSorted = [...bulanMap.entries()].sort((a, b) => a[0] - b[0]);
      const lapBulan = document.getElementById('lapBulan')?.value || '';
      const curBulan = _rankBulan || lapBulan;
      rankBulanEl.innerHTML = '<option value="">Semua Bulan</option>'
        + bulanSorted.map(([no, nama]) => `<option value="${no}" ${no == curBulan ? 'selected' : ''}>${nama}</option>`).join('');
      _rankBulan = rankBulanEl.value;
    }
  }

  /* ── Expose _populateRankFilters untuk halaman Ranking terpisah ── */
  window._rankPopulateFilters = _populateRankFilters;

  /* ── Render tabel ranking ────────────────────────────────── */
  function _rankRenderTable() {
    const el = document.getElementById('rankTable');
    if (!el) return;

    const allData = window._lapAllData || [];

    const filtered = allData.filter(r =>
      (!_rankTahun || String(r.tahun) === String(_rankTahun)) &&
      (!_rankBulan || String(r.bulan) === String(_rankBulan))
    );


    if (!filtered.length) {
      el.innerHTML = '<div class="empty-state" style="padding:40px"><span class="material-icons">inbox</span><p>Tidak ada data untuk filter ini</p></div>';
      return;
    }

    const selesai = filtered
      .filter(r => r.statusGlobal === 'Selesai')
      .sort((a, b) => new Date(a.waktuSelesai || a.updatedAt || a.createdAt || 0) - new Date(b.waktuSelesai || b.updatedAt || b.createdAt || 0));

    const belumSelesai = filtered
      .filter(r => r.statusGlobal !== 'Selesai')
      .sort((a, b) => {
        const ord = function(s) { return s === 'Ditolak' ? 2 : s === 'Draft' ? 3 : 1; };
        return ord(a.statusGlobal) - ord(b.statusGlobal);
      });

    const rows         = selesai.concat(belumSelesai);
    const totalSelesai = selesai.length;
    const totalSemua   = rows.length;
    const showBulanCol = !_rankBulan;

    // ── Pagination ──────────────────────────────────────────
    const totalPages = Math.ceil(totalSemua / _RANK_PER_PAGE) || 1;
    _rankPage = Math.max(1, Math.min(_rankPage, totalPages));
    const pageStart = (_rankPage - 1) * _RANK_PER_PAGE;
    const pageEnd   = pageStart + _RANK_PER_PAGE;
    const pageRows  = rows.slice(pageStart, pageEnd);

    var rowsHtml = pageRows.map(function(r, i) {
      var globalIdx = pageStart + i;          // indeks global untuk rank & badge
      var isSelesai = r.statusGlobal === 'Selesai';
      var rank = isSelesai ? globalIdx + 1 : null;
      return '<tr>'
        + '<td style="text-align:center!important;padding:10px 12px;vertical-align:middle">'
        + (isSelesai ? _badge(rank) : '<div style="text-align:center"><span style="font-size:12px;color:#94a3b8">—</span></div>')
        + '</td>'
        + '<td style="font-weight:600;padding:10px 12px;font-size:13px">' + (r.namaPKM || '-') + '</td>'
        + (showBulanCol ? '<td style="font-size:12px;color:var(--text-light);padding:10px 12px">' + (r.namaBulan || '') + ' ' + (r.tahun || '') + '</td>' : '')
        + '<td style="font-size:12px;padding:10px 12px;color:var(--text-light)">' + _fmt(r.createdAt) + '</td>'
        + '<td style="font-size:12px;padding:10px 12px;color:var(--text-light)">'
        + (isSelesai ? _fmt(r.waktuSelesai || r.updatedAt || r.createdAt) : '<span style="color:#f59e0b;font-size:11.5px;font-weight:600">' + r.statusGlobal + '</span>')
        + '</td>'
        + '<td style="font-weight:700;color:#0d9488;padding:10px 12px">' + parseFloat(r.indeksSPM || 0).toFixed(2) + '</td>'
        + '<td style="padding:10px 12px">' + statusBadge(r.statusGlobal) + '</td>'
        + '<td style="white-space:nowrap;padding:10px 12px">'
        + '<button class="btn-icon view" onclick="viewDetail(\'' + r.idUsulan + '\')" title="Detail"><span class="material-icons">visibility</span></button>'
        + getDownloadBtn(r, 18, currentUser.role, currentUser.indikatorAkses)
        + '</td>'
        + '</tr>';
    }).join('');

    // ── Pagination controls HTML ─────────────────────────────
    var paginationHtml = '';
    if (totalPages > 1) {
      var pages = [];
      for (var pi = 1; pi <= totalPages; pi++) {
        if (pi === 1 || pi === totalPages || (pi >= _rankPage - 2 && pi <= _rankPage + 2)) {
          pages.push(pi);
        } else if (pages[pages.length - 1] !== '...') {
          pages.push('...');
        }
      }
      var pgBtnBase = 'padding:5px 10px;border-radius:6px;font-size:12px;cursor:pointer;border:1.5px solid ';
      var pageButtonsHtml = pages.map(function(p) {
        if (p === '...') return '<span style="padding:5px 4px;font-size:12px;color:#94a3b8">…</span>';
        var isActive = p === _rankPage;
        var style = isActive
          ? pgBtnBase + '#0d9488;background:#0d9488;color:white;font-weight:700;cursor:default'
          : pgBtnBase + '#e2e8f0;background:white;color:#334155';
        return '<button style="' + style + '" ' + (isActive ? 'disabled' : 'onclick="_rankGoPage(' + p + ')"') + '>' + p + '</button>';
      }).join('');
      var dispStart = pageStart + 1;
      var dispEnd   = Math.min(pageEnd, totalSemua);
      paginationHtml =
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-top:1px solid #f1f5f9;flex-wrap:wrap;gap:8px">'
        + '<span style="font-size:12px;color:#64748b">Menampilkan ' + dispStart + '–' + dispEnd + ' dari ' + totalSemua + ' data</span>'
        + '<div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">'
        + '<button style="' + pgBtnBase + '#e2e8f0;background:white;color:#334155' + (_rankPage <= 1 ? ';opacity:0.4;cursor:not-allowed' : '') + '" ' + (_rankPage <= 1 ? 'disabled' : 'onclick="_rankGoPage(' + (_rankPage - 1) + ')"') + '>‹</button>'
        + pageButtonsHtml
        + '<button style="' + pgBtnBase + '#e2e8f0;background:white;color:#334155' + (_rankPage >= totalPages ? ';opacity:0.4;cursor:not-allowed' : '') + '" ' + (_rankPage >= totalPages ? 'disabled' : 'onclick="_rankGoPage(' + (_rankPage + 1) + ')"') + '>›</button>'
        + '</div></div>';
    }

    el.innerHTML =
      '<div style="padding:10px 16px;background:var(--bg-subtle,#f8fafc);border-bottom:1px solid var(--border,#f1f5f9);display:flex;align-items:center;gap:16px;flex-wrap:wrap">'
      + '<div style="display:flex;align-items:center;gap:5px;font-size:12px"><span class="material-icons" style="font-size:15px;color:#10b981">check_circle</span><span style="color:var(--text-light)">Selesai:</span><span style="font-weight:700;color:#10b981">' + totalSelesai + '</span></div>'
      + '<div style="display:flex;align-items:center;gap:5px;font-size:12px"><span class="material-icons" style="font-size:15px;color:#f59e0b">pending</span><span style="color:var(--text-light)">Belum Selesai:</span><span style="font-weight:700;color:#f59e0b">' + (totalSemua - totalSelesai) + '</span></div>'
      + '<div style="display:flex;align-items:center;gap:5px;font-size:12px"><span class="material-icons" style="font-size:15px;color:#64748b">local_hospital</span><span style="color:var(--text-light)">Total:</span><span style="font-weight:700;color:var(--text)">' + totalSemua + '</span></div>'
      + '<span style="margin-left:auto;font-size:11px;color:#94a3b8">Diurutkan berdasarkan tanggal penyelesaian tercepat</span>'
      // ── "Diperbarui" badge — lebih mencolok ──
      + '<span style="display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:700;color:#0d9488;background:rgba(13,148,136,0.08);border:1px solid rgba(13,148,136,0.25);border-radius:20px;padding:3px 10px 3px 7px">'
      + '<span class="material-icons" style="font-size:11px;color:#0d9488">update</span>'
      + 'Diperbarui: ' + _fmtNow()
      + '</span>'
      + '</div>'
      + '<div class="table-container"><table>'
      + '<thead><tr style="background:#0d9488">'
      + '<th style="' + _th() + 'text-align:center!important;">Peringkat</th>'
      + '<th style="' + _th() + '">Puskesmas</th>'
      + (showBulanCol ? '<th style="' + _th() + '">Periode</th>' : '')
      + '<th style="' + _th() + '">Tanggal Dibuat</th>'
      + '<th style="' + _th() + '">Tanggal Selesai</th>'
      + '<th style="' + _th() + '">Indeks SPM</th>'
      + '<th style="' + _th() + '">Status</th>'
      + '<th style="' + _th() + '">Aksi</th>'
      + '</tr></thead>'
      + '<tbody>' + rowsHtml + '</tbody>'
      + '</table></div>'
      + paginationHtml;
  }

  /* ── Mini helpers ────────────────────────────────────────── */
  function _th() {
    return 'background:#0d9488;color:white;font-size:11px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;padding:10px 12px;white-space:nowrap';
  }

  function _badge(rank) {
    if (rank === 1) return '<div style="text-align:center"><span title="Peringkat 1" style="font-size:22px;line-height:1">🥇</span></div>';
    if (rank === 2) return '<div style="text-align:center"><span title="Peringkat 2" style="font-size:22px;line-height:1">🥈</span></div>';
    if (rank === 3) return '<div style="text-align:center"><span title="Peringkat 3" style="font-size:22px;line-height:1">🥉</span></div>';
    return '<div style="text-align:center"><span style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:var(--bg-subtle,#f1f5f9);color:#475569;font-size:12px;font-weight:800">' + rank + '</span></div>';
  }

  function _fmtNow() {
    // Waktu sekarang dalam WITA (UTC+8)
    var now = new Date(Date.now() + 8 * 3600000);
    var dd  = String(now.getUTCDate()).padStart(2, '0');
    var mm  = String(now.getUTCMonth() + 1).padStart(2, '0');
    var yyyy = now.getUTCFullYear();
    var hh  = String(now.getUTCHours()).padStart(2, '0');
    var min = String(now.getUTCMinutes()).padStart(2, '0');
    return dd + ' ' + ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][now.getUTCMonth()] + ' ' + yyyy + ' | ' + hh + ':' + min + ' WITA';
  }

  function _fmt(val) {
    if (!val) return '-';
    try {
      var d = new Date(val);
      if (isNaN(d)) return val;
      return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
           + ' | ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WITA';
    } catch(e) { return val; }
  }

  /* ── Patch _lapRenderTable: sync data ke ranking jika tab aktif ── */
  var _origLapRenderTable = window._lapRenderTable;
  if (typeof _origLapRenderTable === 'function') {
    window._lapRenderTable = function (data) {
      _origLapRenderTable.call(this, data);
      if (_rankTab === 'ranking') {
        _populateRankFilters();
        _rankRenderTable();
      }
    };
  }

})();