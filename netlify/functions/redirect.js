// netlify/functions/redirect.js
// GET /:slug
//   1. Cek tabel bundles → aktif: serve bundle.html | nonaktif: serve unavailable page
//   2. Cek tabel links (slug_pendek) → aktif: redirect 302 + catat klik | nonaktif: serve unavailable page
//   3. Tidak ketemu sama sekali → serve not-found page

import { getDb, jsonResponse, errorResponse } from './_db.js';

// ── Escape HTML untuk cegah XSS dari input yang direfleksikan ke halaman ──
function escHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// ── bundle.html sebagai inline template (aman saat di-bundle esbuild) ─────────
function getBundleHtml() {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SAPA Perencanaan</title>
  <!-- Open Graph / WhatsApp Preview -->
  <meta property="og:type"         content="website" />
  <meta property="og:site_name"    content="SAPA Perencanaan" />
  <meta property="og:title"        content="SAPA Perencanaan" />
  <meta property="og:description"  content="Portal link resmi Sub Bagian Perencanaan Dinas Kesehatan PPKB Kabupaten Banggai Laut" />
  <meta property="og:image"        content="https://sapa-dinkesp2kb.netlify.app/favicon.png" />
  <meta property="og:image:width"  content="512" />
  <meta property="og:image:height" content="512" />
  <meta property="og:url"          content="https://sapa-dinkesp2kb.netlify.app" />
  <!-- Twitter Card -->
  <meta name="twitter:card"        content="summary" />
  <meta name="twitter:title"       content="SAPA Perencanaan" />
  <meta name="twitter:image"       content="https://sapa-dinkesp2kb.netlify.app/favicon.png" />
  <link rel="icon" type="image/png" href="/favicon.png" />
  <link rel="apple-touch-icon" href="/favicon.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/css/styles.css" />
</head>
<body class="bundle-page">
<div class="page-wrap">

  <!-- HEADER -->
  <div class="bundle-header" id="bundleHeader">
    <div class="logo-partner-row">
      <img src="/logokemenkes.png" alt="Kemenkes RI" />
      <div class="logo-divider"></div>
      <img src="/logobkkbn.png" alt="BKKBN" />
      <div class="logo-divider"></div>
      <img src="/logobalut.png" alt="Kabupaten Banggai Laut" />
    </div>
    <div id="headerContent">
      <div class="skeleton" style="height:22px;width:60%;margin:0 auto 10px;border-radius:8px"></div>
      <div class="skeleton" style="height:14px;width:80%;margin:0 auto;border-radius:6px"></div>
    </div>
  </div>

  <!-- ITEMS -->
  <div id="itemsContainer">
    <div class="items-list">
      <div style="display:flex;align-items:center;gap:14px;background:var(--putih);border-radius:var(--radius);padding:14px 18px;box-shadow:var(--shadow-sm)">
        <div class="skeleton" style="width:42px;height:42px;border-radius:10px;flex-shrink:0"></div>
        <div style="flex:1"><div class="skeleton" style="height:14px;width:70%;margin-bottom:8px;border-radius:6px"></div><div class="skeleton" style="height:10px;width:45%;border-radius:6px"></div></div>
      </div>
      <div style="display:flex;align-items:center;gap:14px;background:var(--putih);border-radius:var(--radius);padding:14px 18px;box-shadow:var(--shadow-sm)">
        <div class="skeleton" style="width:42px;height:42px;border-radius:10px;flex-shrink:0"></div>
        <div style="flex:1"><div class="skeleton" style="height:14px;width:55%;margin-bottom:8px;border-radius:6px"></div><div class="skeleton" style="height:10px;width:40%;border-radius:6px"></div></div>
      </div>
      <div style="display:flex;align-items:center;gap:14px;background:var(--putih);border-radius:var(--radius);padding:14px 18px;box-shadow:var(--shadow-sm)">
        <div class="skeleton" style="width:42px;height:42px;border-radius:10px;flex-shrink:0"></div>
        <div style="flex:1"><div class="skeleton" style="height:14px;width:65%;margin-bottom:8px;border-radius:6px"></div><div class="skeleton" style="height:10px;width:35%;border-radius:6px"></div></div>
      </div>
    </div>
  </div>

</div>

<div id="toastContainer"></div>

<!-- BRAND FOOTER -->
<div class="brand-footer">
  <img src="/favicon.png" alt="SAPA" />
  <span>Sub Bagian Perencanaan</span>
  <span>Dinas Kesehatan, Pengendalian Penduduk dan Keluarga Berencana</span>
  <span>Kabupaten Banggai Laut</span>
  <span>© 2026 All rights reserved</span>
</div>

<script>
function esc(str) {
  return String(str||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function toast(msg, type='success') {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => { t.style.animation='toastOut .3s ease forwards'; setTimeout(()=>t.remove(),300); }, 2500);
}

const _params = new URLSearchParams(location.search);
const _pathSlug = location.pathname.split('/').filter(Boolean)[0] || '';
const slug = _params.get('slug') || _pathSlug;

if (!slug) {
  document.getElementById('headerContent').innerHTML = \`
    <div class="state-box">
      <div class="state-icon"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="var(--teks-muted)" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg></div>
      <h2>Bundle tidak ditemukan</h2>
      <p>Alamat bundle tidak valid.</p>
    </div>\`;
  document.getElementById('itemsContainer').innerHTML = '';
} else {
  loadBundle(slug);
}

async function loadBundle(slug) {
  try {
    const r = await fetch(\`/api/bundles/\${slug}\`);
    if (!r.ok) {
      const isInactive = r.status === 403;
      document.getElementById('headerContent').innerHTML = \`
        <div class="state-box">
          <div class="state-icon">
            \${isInactive
              ? \`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="#f59e0b" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>\`
              : \`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="var(--teks-muted)" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M11 8v3m0 3h.01"/></svg>\`
            }
          </div>
          <h2>\${isInactive ? 'Bundle Tidak Tersedia' : 'Bundle Tidak Ditemukan'}</h2>
          <p>\${isInactive
            ? 'Bundle link ini sedang dinonaktifkan dan tidak dapat diakses saat ini.'
            : 'Link bundle mungkin sudah tidak aktif atau alamatnya salah.'
          }</p>
        </div>\`;
      document.getElementById('itemsContainer').innerHTML = '';
      return;
    }
    const { bundle, items } = await r.json();

    document.title = \`SAPA Perencanaan\`;

    document.getElementById('headerContent').innerHTML = \`
      <div class="bundle-brand-name">\${esc(bundle.judul)}</div>
      \${bundle.deskripsi ? \`<div class="bundle-brand-sub">\${esc(bundle.deskripsi)}</div>\` : ''}\`;

    if (!items.length) {
      document.getElementById('itemsContainer').innerHTML = \`
        <div class="state-box">
          <div class="state-icon"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="var(--teks-muted)" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/></svg></div>
          <h2>Bundle masih kosong</h2>
          <p>Belum ada link yang ditambahkan ke bundle ini.</p>
        </div>\`;
      return;
    }

    document.getElementById('itemsContainer').innerHTML = \`
      <div class="items-list">
        \${items.map((item, i) => \`
          <a class="item-card" href="\${esc(item.url)}" target="_blank" rel="noopener"
             style="animation-delay:\${i * 0.05}s">
            <div class="item-icon">\${item.ikon ? esc(item.ikon) : \`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>\`}</div>
            <div class="item-body">
              <div class="item-title">\${esc(item.judul)}</div>
              \${item.deskripsi ? \`<div class="item-desc">\${esc(item.deskripsi)}</div>\` : ''}
            </div>
            <div class="item-arrow"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg></div>
          </a>\`).join('')}
      </div>\`;

  } catch (err) {
    console.error(err);
    document.getElementById('headerContent').innerHTML = \`
      <div class="state-box">
        <div class="state-icon"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="var(--teks-muted)" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg></div>
        <h2>Gagal memuat bundle</h2>
        <p>Terjadi kesalahan koneksi. Coba muat ulang halaman.</p>
      </div>\`;
    document.getElementById('itemsContainer').innerHTML = '';
  }
}
</script>
</body>
</html>`;
}

// ── HTML inline untuk slug nonaktif / tidak ditemukan ─────────
function getStatusHtml({ icon, title, message }) {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SAPA Perencanaan</title>
  <link rel="icon" type="image/png" href="/favicon.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/css/styles.css" />
  <style>
    body { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; background: linear-gradient(135deg,#f0fdfc 0%,#ccfbf1 50%,#99f6e4 100%); font-family: 'Plus Jakarta Sans', sans-serif; padding: 24px; }
    .card { background: #fff; border-radius: 20px; box-shadow: 0 8px 40px rgba(0,0,0,.10); padding: 48px 40px; max-width: 420px; width: 100%; text-align: center; }
    .icon-wrap { width: 72px; height: 72px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; }
    .icon-wrap.yellow { background: #fef9c3; }
    .icon-wrap.red    { background: #fee2e2; }
    h2 { font-size: 1.25rem; font-weight: 700; color: #0f172a; margin: 0 0 10px; }
    p  { font-size: .88rem; color: #64748b; margin: 0 0 28px; line-height: 1.6; }
    .logo-row { display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 20px; }
    .logo-row img { height: 36px; object-fit: contain; }
    .logo-divider { width: 1px; height: 28px; background: #e2e8f0; }
    .brand-footer { margin-top: 40px; display: flex; flex-direction: column; align-items: center; gap: 3px; font-size: .72rem; color: #94a3b8; text-align: center; }
    .brand-footer img { width: 32px; margin-bottom: 6px; opacity: .7; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo-row">
      <img src="/logokemenkes.png" alt="Kemenkes" />
      <div class="logo-divider"></div>
      <img src="/logobkkbn.png" alt="BKKBN" />
      <div class="logo-divider"></div>
      <img src="/logobalut.png" alt="Banggai Laut" />
    </div>
    <div class="icon-wrap ${icon === 'not-found' ? 'red' : 'yellow'}">
      ${icon === 'not-found'
        ? `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="#ef4444" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M11 8v3m0 3h.01M11 3a8 8 0 100 16A8 8 0 0011 3z"/></svg>`
        : `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="#f59e0b" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`
      }
    </div>
    <h2>${title}</h2>
    <p>${message}</p>
  </div>
  <div class="brand-footer">
    <img src="/favicon.png" alt="SAPA" />
    <span>Sub Bagian Perencanaan</span>
    <span>Dinas Kesehatan, Pengendalian Penduduk dan Keluarga Berencana</span>
    <span>Kabupaten Banggai Laut</span>
    <span>© 2026 All rights reserved</span>
  </div>
</body>
</html>`;
}

const HTML_HEADERS = { 'Content-Type': 'text/html; charset=utf-8' };

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse({});
  if (event.httpMethod !== 'GET') return errorResponse('Method not allowed', 405);

  const sql = getDb();

  const rawPath = event.path || '';
  const slug = rawPath
    .replace(/^\/.netlify\/functions\/redirect/, '')
    .replace(/^\//, '')
    .replace(/\/$/, '')
    .trim();

  if (!slug) {
    return { statusCode: 302, headers: { Location: '/' }, body: '' };
  }

  try {
    // ── 1. Cek bundle (aktif maupun nonaktif) ─────────────
    const bundles = await sql`
      SELECT id, aktif FROM bundles WHERE slug = ${slug} LIMIT 1
    `;

    if (bundles.length) {
      if (!bundles[0].aktif) {
        return {
          statusCode: 200,
          headers: HTML_HEADERS,
          body: getStatusHtml({
            icon: 'inactive',
            title: 'Bundle Tidak Tersedia',
            message: 'Bundle link ini sedang dinonaktifkan dan tidak dapat diakses saat ini. Hubungi pengelola jika Anda membutuhkan akses.',
          }),
        };
      }
      return {
        statusCode: 200,
        headers: HTML_HEADERS,
        body: getBundleHtml(),
      };
    }

    // ── 2. Cek link pendek (aktif maupun nonaktif) ────────
    const links = await sql`
      SELECT id, url, aktif FROM links WHERE slug_pendek = ${slug} LIMIT 1
    `;

    if (links.length) {
      if (!links[0].aktif) {
        return {
          statusCode: 200,
          headers: HTML_HEADERS,
          body: getStatusHtml({
            icon: 'inactive',
            title: 'Link Tidak Tersedia',
            message: 'Shortlink ini sedang dinonaktifkan dan tidak dapat diakses saat ini. Hubungi pengelola jika Anda membutuhkan akses.',
          }),
        };
      }

      const ip  = event.headers['x-forwarded-for']?.split(',')[0]?.trim() || '';
      const ua  = event.headers['user-agent'] || '';
      const ref = event.headers['referer'] || '';
      await sql`
        INSERT INTO klik_log (link_id, ip_address, user_agent, referer)
        VALUES (${links[0].id}, ${ip}, ${ua}, ${ref})
      `;
      return {
        statusCode: 302,
        headers: { Location: links[0].url },
        body: '',
      };
    }

    // ── 3. Slug tidak ditemukan sama sekali ───────────────
    return {
      statusCode: 404,
      headers: HTML_HEADERS,
      body: getStatusHtml({
        icon: 'not-found',
        title: 'Halaman Tidak Ditemukan',
        message: `Slug <strong>/${escHtml(slug)}</strong> tidak terdaftar di sistem SAPA. Periksa kembali alamat yang Anda gunakan.`,
      }),
    };

  } catch (err) {
    console.error('[redirect.js]', err);
    return errorResponse('Server error', 500);
  }
};