// ============== PAGINATION HELPER ==============
const ITEMS_PER_PAGE = 10;
const DASH_ITEMS_PER_PAGE = 5; // khusus tabel dashboard (PP, Kapus, Admin)

function paginateDash(rows, page) {
  const total = rows.length;
  const totalPages = Math.ceil(total / DASH_ITEMS_PER_PAGE);
  const p = Math.max(1, Math.min(page || 1, totalPages || 1));
  const start = (p - 1) * DASH_ITEMS_PER_PAGE;
  const items = rows.slice(start, start + DASH_ITEMS_PER_PAGE);
  return { items, page: p, totalPages, total };
}

function paginateData(rows, page) {
  const total = rows.length;
  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);
  const p = Math.max(1, Math.min(page || 1, totalPages || 1));
  const start = (p - 1) * ITEMS_PER_PAGE;
  const items = rows.slice(start, start + ITEMS_PER_PAGE);
  return { items, page: p, totalPages, total };
}

// Registry untuk menyimpan pagination callback — menghindari arrow function
// dengan kurung kurawal {} di dalam HTML attribute onclick (menyebabkan parse error).
if (!window.__pgCallbacks) window.__pgCallbacks = {};

function __pgGo(key, p) {
  if (window.__pgCallbacks[key]) window.__pgCallbacks[key](p);
}

function renderPagination(containerId, total, page, totalPages, onPageChange) {
  if (totalPages <= 1) return '';

  // Simpan callback ke registry dengan key unik per container
  const cbKey = '__pg_' + containerId;
  if (typeof onPageChange === 'function') {
    window.__pgCallbacks[cbKey] = onPageChange;
  } else if (typeof onPageChange === 'string') {
    // String callback (legacy) — wrap jadi fungsi via Function constructor
    // Ini aman karena hanya dipanggil dari kode internal, bukan input user
    window.__pgCallbacks[cbKey] = new Function('pg', onPageChange.replace(/^pg\s*=>\s*/, ''));
  }

  const start = (page - 1) * ITEMS_PER_PAGE + 1;
  const end = Math.min(page * ITEMS_PER_PAGE, total);
  const pages = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...');
    }
  }
  const btnStyle = (active) => active
    ? 'padding:5px 10px;border:1.5px solid #0d9488;background:#0d9488;color:white;border-radius:6px;font-size:12px;font-weight:700;cursor:default'
    : 'padding:5px 10px;border:1.5px solid #e2e8f0;background:white;color:#334155;border-radius:6px;font-size:12px;cursor:pointer';
  const pageButtons = pages.map(p =>
    p === '...'
      ? `<span style="padding:5px 4px;font-size:12px;color:#94a3b8">…</span>`
      : `<button style="${btnStyle(p===page)}" ${p===page?'disabled':''} onclick="__pgGo('${cbKey}',${p})">${p}</button>`
  ).join('');
  return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-top:1px solid #f1f5f9;flex-wrap:wrap;gap:8px">
    <span style="font-size:12px;color:#64748b">Menampilkan ${start}–${end} dari ${total} data</span>
    <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">
      <button style="${btnStyle(false)}${page<=1?';opacity:0.4;cursor:not-allowed':''}" ${page<=1?'disabled':''} onclick="__pgGo('${cbKey}',${page-1})">‹</button>
      ${pageButtons}
      <button style="${btnStyle(false)}${page>=totalPages?';opacity:0.4;cursor:not-allowed':''}" ${page>=totalPages?'disabled':''} onclick="__pgGo('${cbKey}',${page+1})">›</button>
    </div>
  </div>`;
}

function bulanOptions(selected) {
  const months = BULAN_NAMA.slice(1);
  return months.map((m, i) => `<option value="${i+1}" ${(i+1) == selected ? 'selected' : ''}>${m}</option>`).join('');
}