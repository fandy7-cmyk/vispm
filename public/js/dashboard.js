// ═══════════════════════════════════════════
// DASHBOARD — dinamis berdasarkan hak akses
// ═══════════════════════════════════════════

async function loadDashboard() {
  const wrap = document.getElementById('dashStats');
  if (!wrap) return;

  const isAdmin     = _user?.is_admin;
  const showLink    = isAdmin || hasAccess('superlink.link') || hasAccess('superlink.shortlink') || hasAccess('superlink.bundle');
  const showSuratM  = isAdmin || hasAccess('surat.masuk');
  const showSuratK  = isAdmin || hasAccess('surat.keluar');
  const showSurat   = showSuratM || showSuratK;
  const showKinerja = true;

  // ── Skeleton ─────────────────────────────────────────────────────────────
  wrap.innerHTML = `
    <div style="height:68px;border-radius:14px;margin-bottom:20px" class="skeleton"></div>
    <div class="skeleton" style="height:200px;border-radius:16px"></div>`;

  // ── Fetch paralel ─────────────────────────────────────────────────────────
  const [stats, suratRes, kinerjaRes] = await Promise.allSettled([
    showLink    ? _fetchStats()        : Promise.resolve(null),
    showSurat   ? _fetchSuratStats()   : Promise.resolve(null),
    showKinerja ? _fetchKinerjaStats() : Promise.resolve(null),
  ]);

  const st = stats.value     ?? null;
  const ss = suratRes.value  ?? null;
  const ks = kinerjaRes.value ?? null;

  // ── Welcome banner ────────────────────────────────────────────────────────
  // ── WITA clock helper ────────────────────────────────────────────────────
  function _witaNow() {
    // WITA = UTC+8
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    return new Date(utc + 8 * 3600000);
  }
  function _witaJam(d) {
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')} WITA`;
  }

  const _wNow  = _witaNow();
  const jam    = _wNow.getHours();
  const salam  = jam < 11 ? 'Selamat pagi' : jam < 15 ? 'Selamat siang' : jam < 18 ? 'Selamat sore' : 'Selamat malam';
  const _wHari = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'][_wNow.getDay()];
  const _wBln  = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'][_wNow.getMonth()];
  const _wTgl  = `${_wHari}, ${_wNow.getDate()} ${_wBln} ${_wNow.getFullYear()}`;

  let html = `
    <div class="dash-welcome">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;flex-wrap:nowrap">
        <div style="flex:1;min-width:0">
          <div class="dash-welcome-title">${salam}, <strong>${esc(_user?.nama || 'Pengguna')}</strong> <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="#0d9488" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-left:2px"><path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg></div>
          <div class="dash-welcome-sub">Ringkasan aktivitas hari ini</div>
        </div>
        <div style="text-align:right;flex-shrink:0;white-space:nowrap">
          <div style="font-size:.8rem;font-weight:600;color:#0f172a">${_wTgl}</div>
          <div id="dash-live-clock" style="font-size:.72rem;color:#94a3b8;margin-top:1px">${_witaJam(_wNow)}</div>
        </div>
      </div>
    </div>`;

  // Live clock — update tiap detik
  if (window._dashClockInterval) clearInterval(window._dashClockInterval);
  window._dashClockInterval = setInterval(() => {
    const el = document.getElementById('dash-live-clock');
    if (el) el.textContent = _witaJam(_witaNow());
    else clearInterval(window._dashClockInterval);
  }, 1000);



  // ── Panel bawah ───────────────────────────────────────────────────────────
  const panels = [];

  if (showSuratM && ss?.recent_masuk?.length) panels.push(_recentSuratPanel(ss.recent_masuk, 'masuk'));
  if (showSuratK && ss?.recent_keluar?.length) panels.push(_recentSuratPanel(ss.recent_keluar, 'keluar'));

  if (panels.length) html += `<div class="dash-panels">${panels.join('')}</div>`;

  // ── IKU Grid ─────────────────────────────────────────────────────────────
  if (showKinerja) {
    html += `<div id="ikuGridWidget"></div>`;
  }

  // ── Widget Pantau Indikator ───────────────────────────────────────────────
  if (showKinerja) {
    html += `<div id="kinerjaWatchWidget"></div>`;
  }

  wrap.innerHTML = html;

  // Render widget setelah HTML di-inject (butuh DOM)
  if (showKinerja) _initIkuGrid();
  if (showKinerja) _initKinerjaWatch();
}

// ═══════════════════════════════════════════
// DASHBOARD PER-MODUL — ringkasan scoped, muncul otomatis
// ketika user cuma punya akses ke sebagian menu (bukan Dashboard Utama)
// ═══════════════════════════════════════════

function _dashModuleHeader(icon, title, subtitle) {
  return `<div class="page-title" style="display:flex;align-items:center;gap:10px">${icon}${esc(title)}</div>
    <div class="page-subtitle">${esc(subtitle)}</div>`;
}

// ── Superlink ────────────────────────────────────────────────────────────────
async function _fetchSuperlinkDashData() {
  try {
    const [rl, rb, rs] = await Promise.all([
      fetch('/api/links',   { headers: authHeaders() }),
      fetch('/api/bundles', { headers: authHeaders() }),
      fetch('/api/stats',   { headers: authHeaders() }),
    ]);
    const links   = rl.ok ? (await rl.json()).links   || [] : [];
    const bundles = rb.ok ? (await rb.json()).bundles || [] : [];
    const stats   = rs.ok ? await rs.json() : null;
    return { links, bundles, stats };
  } catch { return { links: [], bundles: [], stats: null }; }
}

async function loadDashboardSuperlink() {
  const wrap = document.getElementById('dashSuperlinkStats');
  if (!wrap) return;
  wrap.innerHTML = `
    <div class="dash-kpi-row">${Array(5).fill(0).map(() => `<div class="skeleton" style="height:98px;border-radius:14px"></div>`).join('')}</div>
    <div class="skeleton" style="height:160px;border-radius:16px"></div>`;

  const { links, bundles, stats } = await _fetchSuperlinkDashData();

  const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:.85"><path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" x2="16" y1="12" y2="12"/></svg>`;
  let html = _dashModuleHeader(icon, 'Dashboard', 'Ringkasan aktivitas Superlink');

  const totalKlik    = stats?.total_klik    ?? links.reduce((sum, l) => sum + (l.total_klik || 0), 0);
  const klikHariIni  = stats?.klik_hari_ini ?? 0;
  const shortlinkCnt = links.filter(l => l.slug_pendek).length;
  const linkAktif    = links.filter(l => l.aktif).length;
  const linkNonaktif = links.length - linkAktif;
  const bundleAktif  = bundles.filter(b => b.aktif).length;
  const rataKlik     = links.length ? Math.round(totalKlik / links.length) : 0;
  const shortlinkPct = links.length ? Math.round((shortlinkCnt / links.length) * 100) : 0;

  // Delta klik hari ini vs kemarin, dari tren 7 hari
  const trend = stats?.klik_7hari || [];
  let deltaSub = null, deltaUp = null;
  if (trend.length >= 2) {
    const kemarin = trend[trend.length - 2]?.jumlah ?? 0;
    if (kemarin > 0) {
      const pct = Math.round(((klikHariIni - kemarin) / kemarin) * 100);
      deltaUp = pct >= 0;
      deltaSub = `${deltaUp ? '▲' : '▼'} ${Math.abs(pct)}% vs kemarin`;
    } else if (klikHariIni > 0) {
      deltaSub = '▲ baru hari ini'; deltaUp = true;
    }
  }

  const iconShort  = `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.828 10.172a4 4 0 0 0-5.656 0l-4 4a4 4 0 1 0 5.656 5.656l1.102-1.101m-.758-4.899a4 4 0 0 0 5.656 0l4-4a4 4 0 0 0-5.656-5.656l-1.1 1.1"/></svg>`;
  const iconBundle = `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`;
  const iconClick  = `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 9 5 12 1.8-5.2L21 14Z"/><path d="M7.2 2.2 8 5.1"/><path d="m5.1 8-2.9-.8"/><path d="M14 4.1 12 6"/><path d="m6 12-1.9 2"/></svg>`;
  const iconToday  = `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 2v4"/><path d="M16 2v4"/></svg>`;

  html += `<div class="dash-kpi-row">
    ${_kpiCard({ icon, label: 'Total Link', value: links.length, sub: `${linkAktif} aktif · ${linkNonaktif} nonaktif`, color: 'teal' })}
    ${_kpiCard({ icon: iconShort, label: 'Shortlink', value: shortlinkCnt, sub: `${shortlinkPct}% dari total link`, color: 'blue' })}
    ${_kpiCard({ icon: iconBundle, label: 'Bundle', value: bundles.length, sub: `${bundleAktif} aktif`, color: 'purple' })}
    ${_kpiCard({ icon: iconClick, label: 'Total Klik', value: totalKlik, sub: `± ${rataKlik} klik/link`, color: 'amber' })}
    ${_kpiCard({ icon: iconToday, label: 'Klik Hari Ini', value: klikHariIni, sub: deltaSub, subUp: deltaUp, color: 'teal' })}
  </div>`;

  const panels = [];
  if (trend.length) panels.push(_klikTrendPanel(trend));

  panels.push(_miniDonutPanel({
    icon: iconShort, title: 'Status Link',
    segments: [
      { label: 'Aktif',    value: linkAktif,    color: '#0d9488' },
      { label: 'Nonaktif', value: linkNonaktif, color: '#cbd5e1' },
    ],
    centerVal: links.length, centerLbl: 'Total Link',
  }));

  const topLinks = stats?.top_links?.length
    ? stats.top_links
    : [...links].sort((a, b) => (b.total_klik || 0) - (a.total_klik || 0)).slice(0, 5);
  if (topLinks.length) {
    panels.push(_barListPanel({
      icon: iconClick, title: 'Top 5 Link Terpopuler',
      rows: topLinks.slice(0, 5).map(l => ({ label: l.judul, value: l.total_klik || 0, suffix: ' klik', color: '#0d9488' })),
    }));
  }

  if (bundles.length) {
    panels.push(_barListPanel({
      icon: iconBundle, title: 'Ringkasan Bundle',
      rows: bundles.slice(0, 5).map(b => ({
        label: b.judul,
        sublabel: `/${b.slug}${b.aktif ? '' : ' · Nonaktif'}`,
        value: b.jumlah_item ?? 0, suffix: ' item',
        color: b.aktif ? '#8b5cf6' : '#cbd5e1',
      })),
    }));
  }

  if (panels.length) html += `<div class="dash-panels">${panels.join('')}</div>`;

  wrap.innerHTML = html;
}

// Grafik tren klik 7 hari terakhir — dari stats.klik_7hari [{tanggal, jumlah}]
function _klikTrendPanel(data) {
  const HARI = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
  const pad2 = n => String(n).padStart(2, '0');
  // Pastikan 7 titik berurutan (isi 0 utk tanggal yg tidak ada datanya)
  const map = new Map(data.map(d => [d.tanggal, d.jumlah]));
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    // PENTING: pakai komponen tanggal lokal, JANGAN toISOString() (itu convert ke UTC
    // dan bakal salah tanggal kalau jam lokal masih dini hari, mis. 00:00–07:59 WITA
    // = tanggal kemarin di UTC — bikin key gak match sama `tanggal` dari backend yg
    // udah dihitung di WITA).
    const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    days.push({ key, hari: HARI[d.getDay()], tgl: d.getDate(), jumlah: map.get(key) || 0 });
  }
  const max = Math.max(1, ...days.map(d => d.jumlah));
  const bars = days.map(d => {
    const h = Math.max(3, Math.round((d.jumlah / max) * 74));
    return `
      <div class="dash-trend-bar-wrap" title="${d.jumlah} klik">
        <div class="dash-trend-val">${d.jumlah || ''}</div>
        <div class="dash-trend-bar" style="height:${h}px"></div>
        <div class="dash-trend-lbl">${d.hari}</div>
      </div>`;
  }).join('');
  return `<div class="dash-panel">
    <div class="dash-panel-header"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg> Tren Klik 7 Hari Terakhir</div>
    <div class="dash-trend"><div class="dash-trend-bars">${bars}</div></div>
  </div>`;
}

// ── Surat ────────────────────────────────────────────────────────────────────
async function loadDashboardSurat() {
  const wrap = document.getElementById('dashSuratStats');
  if (!wrap) return;
  wrap.innerHTML = `
    <div class="dash-kpi-row">${Array(5).fill(0).map(() => `<div class="skeleton" style="height:98px;border-radius:14px"></div>`).join('')}</div>
    <div class="skeleton" style="height:160px;border-radius:16px"></div>`;

  const ss = await _fetchSuratDashData();

  const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:.85"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`;
  let html = _dashModuleHeader(icon, 'Dashboard', 'Ringkasan surat masuk & keluar');

  const totalMasuk   = Number(ss?.total_masuk)  || 0;
  const belumProses  = Number(ss?.belum_proses) || 0;
  const terlambat    = Number(ss?.terlambat)    || 0;
  const totalKeluar  = Number(ss?.total_keluar) || 0;
  const masukBulan   = ss?.masuk_bulan_ini  ?? 0;
  const keluarBulan  = ss?.keluar_bulan_ini ?? 0;
  const selesai      = Math.max(0, totalMasuk - belumProses);
  const pctSelesai   = totalMasuk > 0 ? Math.round((selesai / totalMasuk) * 100) : 0;

  const iconMasuk  = `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.2 8.4c.5.38.8.97.8 1.6v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 .8-1.6l8-6a2 2 0 0 1 2.4 0l8 6Z"/><path d="m22 10-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 10"/></svg>`;
  const iconKeluar = `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.714 3.048a.498.498 0 0 0-.683.627l2.843 7.627a2 2 0 0 1 0 1.396l-2.842 7.627a.498.498 0 0 0 .682.627l18-8.5a.5.5 0 0 0 0-.904z"/><path d="M6 12h16"/></svg>`;
  const iconWarn   = `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>`;
  const iconClock  = `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
  const iconCal    = `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 2v4"/><path d="M16 2v4"/></svg>`;

  html += `<div class="dash-kpi-row">
    ${_kpiCard({ icon: iconMasuk, label: 'Surat Masuk', value: ss?.total_masuk ?? '—', sub: `${pctSelesai}% selesai`, color: 'tealMuda' })}
    ${_kpiCard({ icon: iconClock, label: 'Belum Diproses', value: ss?.belum_proses ?? '—', color: 'amber' })}
    ${_kpiCard({ icon: iconWarn, label: 'Terlambat', value: terlambat, color: 'red' })}
    ${_kpiCard({ icon: iconKeluar, label: 'Surat Keluar', value: ss?.total_keluar ?? '—', color: 'biruMuda' })}
    ${_kpiCard({ icon: iconCal, label: 'Bulan Ini', value: masukBulan + keluarBulan, sub: `${masukBulan} masuk · ${keluarBulan} keluar`, color: 'teal' })}
  </div>`;

  const panels = [];
  if (ss?.overdue_list?.length) panels.push(_overdueSuratPanel(ss.overdue_list));

  if (totalMasuk > 0) {
    panels.push(_miniDonutPanel({
      icon: iconMasuk, title: 'Status Surat Masuk',
      segments: [
        { label: 'Selesai', value: selesai,     color: '#10b981' },
        { label: 'Proses',  value: belumProses, color: '#f59e0b' },
      ],
      centerVal: `${pctSelesai}%`, centerLbl: 'Selesai',
    }));
  }

  if (masukBulan || keluarBulan) {
    panels.push(_barListPanel({
      icon: iconCal, title: 'Perbandingan Bulan Ini',
      rows: [
        { label: 'Surat Masuk',  value: masukBulan,  color: _KPI_COLORS.tealMuda.text },
        { label: 'Surat Keluar', value: keluarBulan, color: _KPI_COLORS.biruMuda.text },
      ],
    }));
  }

  const panelsRecent = [];
  if (ss?.recent_masuk?.length)  panelsRecent.push(_recentSuratPanel(ss.recent_masuk, 'masuk'));
  if (ss?.recent_keluar?.length) panelsRecent.push(_recentSuratPanel(ss.recent_keluar, 'keluar'));
  if (panels.length) html += `<div class="dash-panels">${panels.join('')}</div>`;
  if (panelsRecent.length) html += `<div class="dash-panels dash-panels--2col">${panelsRecent.join('')}</div>`;

  wrap.innerHTML = html;
}
// Panel "Perlu Perhatian" — surat masuk yang belum diproses & lewat batas waktu
function _overdueSuratPanel(list) {
  const rows = list.slice(0, 5).map(s => `
    <tr><td>
      <div style="font-weight:500;font-size:.78rem">${esc(s.perihal||'—')}</div>
      <div style="font-size:.7rem;opacity:.55">${esc(s.no_agenda||'')}${s.no_agenda?' · ':''}Batas: ${fmtDate(s.batas_waktu)}</div>
    </td><td style="text-align:right"><span class="badge badge-merah">Terlambat</span></td></tr>`).join('');
  return `<div class="dash-panel dash-panel--urgent">
    <div class="dash-panel-header"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Perlu Perhatian — Surat Terlambat</div>
    <table class="dash-panel-table"><tbody>${rows}</tbody></table>
  </div>`;
}

// ── Kinerja ──────────────────────────────────────────────────────────────────
// Catatan: endpoint /api/kinerja/rekap men-default ke jenis=monev kalau param
// `jenis` tidak dikirim (lihat kinerja_function.js). Supaya dapat gambaran
// lengkap IKU+IKK+SPM, kita panggil 3x lalu digabung (dedup per id).
async function _fetchKinerjaRekapForDash() {
  try {
    const pa    = getPeriodeAktif();
    const bulan = pa?.bulan || new Date().getMonth() + 1;
    const tahun = pa?.tahun || new Date().getFullYear();
    const jenisList = ['monev', 'ikk', 'spm'];
    const results = await Promise.all(jenisList.map(j =>
      fetch(`/api/kinerja/rekap?bulan=${bulan}&tahun=${tahun}&jenis=${j}`, { headers: authHeaders() })
        .then(r => r.ok ? r.json() : { rekap: [] })
        .catch(() => ({ rekap: [] }))
    ));
    const merged = new Map();
    results.forEach(d => (d.rekap || []).forEach(row => {
      if (row && row.id != null) merged.set(row.id, row);
    }));
    return [...merged.values()];
  } catch { return []; }
}

async function loadDashboardKinerja() {
  const wrap = document.getElementById('dashKinerjaStats');
  if (!wrap) return;
  wrap.innerHTML = `
    <div class="dash-kpi-row">${Array(5).fill(0).map(() => `<div class="skeleton" style="height:98px;border-radius:14px"></div>`).join('')}</div>
    <div class="skeleton" style="height:160px;border-radius:16px"></div>`;

  const [ks, rekap] = await Promise.all([_fetchKinerjaStats(), _fetchKinerjaRekapForDash()]);

  const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:.85"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`;
  let html = _dashModuleHeader(icon, 'Dashboard', 'Ringkasan capaian indikator kinerja periode berjalan');

  const total = ks?.total_indikator ?? rekap.length;
  const sudah = ks?.sudah_diisi ?? rekap.filter(x => x.realisasi != null).length;
  const belum = ks?.belum_diisi ?? Math.max(0, total - sudah);
  const pct   = total > 0 ? Math.round((sudah / total) * 100) : 0;

  const withCapaian  = rekap.filter(x => x.capaian_persen != null);
  const tercapai     = withCapaian.filter(x => Number(x.capaian_persen) >= 100).length;
  const mendekati    = withCapaian.filter(x => Number(x.capaian_persen) >= 75 && Number(x.capaian_persen) < 100).length;
  const perluTindakan= withCapaian.filter(x => Number(x.capaian_persen) < 75).length;
  const onTrack      = tercapai + mendekati;

  const jenisMap = { IKU: 0, IKK: 0, SPM: 0 };
  rekap.forEach(x => {
    if (x.jenis_monev === true) jenisMap.IKU++;
    if (x.jenis_ikk   === true) jenisMap.IKK++;
    if (x.jenis_spm   === true) jenisMap.SPM++;
  });
  Object.keys(jenisMap).forEach(k => { if (!jenisMap[k]) delete jenisMap[k]; });
  const jenisColors = { IKU: '#3b82f6', IKK: '#10b981', SPM: '#f59e0b' }; // sinkron dgn badge Jenis Kinerja di Kelola Kinerja

  const iconTarget = `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`;
  const iconCheck  = `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
  const iconWarn   = `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>`;
  const iconTrend  = `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`;
  const iconFlag   = `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/></svg>`;

  html += `<div class="dash-kpi-row">
    ${_kpiCard({ icon: iconTarget, label: 'Total Indikator', value: total, color: 'teal' })}
    ${_kpiCard({ icon: iconCheck, label: 'Sudah Diisi', value: sudah, sub: `${pct}% dari total`, color: 'blue' })}
    ${_kpiCard({ icon: iconWarn, label: 'Belum Diisi', value: belum, color: belum > 0 ? 'red' : 'blue' })}
    ${_kpiCard({ icon: iconTrend, label: 'On Track (≥75%)', value: onTrack, sub: withCapaian.length ? `dari ${withCapaian.length} terisi` : null, color: 'green' })}
    ${_kpiCard({ icon: iconFlag, label: 'Perlu Tindakan', value: perluTindakan, color: perluTindakan > 0 ? 'amber' : 'blue' })}
  </div>`;

  const panelsTop = [];
  const panels = [];

  // Progres pengisian bulan ini — baris sendiri bareng Sebaran Jenis Indikator
  panelsTop.push(`<div class="dash-panel">
    <div class="dash-panel-header">${iconCheck} Progres Pengisian Bulan Ini</div>
    <div style="padding:14px 18px">
      <div style="display:flex;align-items:center;justify-content:space-between;font-size:.78rem;color:var(--teks-muted);font-weight:700;margin-bottom:2px">
        <span>Terisi</span><span style="color:#0f172a">${pct}%</span>
      </div>
      <div class="dash-progress-track" style="--card-accent:#f59e0b"><div class="dash-progress-fill" style="width:${pct}%"></div></div>
    </div>
  </div>`);

  if (Object.keys(jenisMap).length) {
    panelsTop.push(_barListPanel({
      icon: iconTarget, title: 'Sebaran Jenis Indikator',
      rows: Object.entries(jenisMap).map(([j, c]) => ({ label: j, value: c, color: jenisColors[j] || '#94a3b8' })),
    }));
  }

  if (withCapaian.length) {
    panels.push(_barListPanel({
      icon: iconTrend, title: 'Distribusi Capaian Indikator',
      rows: [
        { label: 'Tercapai (≥100%)',     value: tercapai,      color: '#10b981' },
        { label: 'Mendekati (75–99%)',   value: mendekati,     color: '#f59e0b' },
        { label: 'Perlu Tindakan (<75%)',value: perluTindakan, color: '#ef4444' },
      ],
    }));
  }

  if (withCapaian.length) {
    const top5 = [...withCapaian].sort((a, b) => Number(b.capaian_persen) - Number(a.capaian_persen)).slice(0, 5);
    panels.push(_barListPanel({
      icon: iconCheck, title: 'Capaian Tertinggi',
      rows: top5.map(x => {
        const cap = Number(x.capaian_persen);
        return { label: x.indikator_kinerja, value: Math.round(cap), suffix: '%', color: cap >= 100 ? '#10b981' : cap >= 75 ? '#f59e0b' : '#ef4444' };
      }),
    }));
  }

  const belumList = ks?.belum_isi_list ?? [];
  if (belumList.length) panels.push(_kinerjaAlertPanel(belumList, belum));

  if (panelsTop.length) html += `<div class="dash-panels">${panelsTop.join('')}</div>`;
  if (panels.length)    html += `<div class="dash-panels">${panels.join('')}</div>`;

  wrap.innerHTML = html;
  if (belumList.length) _kbRenderPagination();
}
async function _fetchStats() {
  try { const r = await fetch('/api/stats', { headers: authHeaders() }); return r.ok ? r.json() : null; } catch { return null; }
}
async function _fetchSuratStats() {
  try {
    const [rm, rk] = await Promise.all([
      fetch('/api/surat-masuk/stats', { headers: authHeaders() }),
      fetch('/api/surat-keluar/stats', { headers: authHeaders() }),
    ]);
    const masuk  = rm.ok  ? await rm.json()  : {};
    const keluar = rk.ok  ? await rk.json()  : {};
    return {
      total_masuk:  masuk.total          ?? '—',
      belum_proses: masuk.belum_selesai  ?? '—',
      total_keluar: keluar.total         ?? '—',
      recent_masuk:  [],
      recent_keluar: [],
    };
  } catch { return null; }
}

// Khusus Dashboard Surat (per-modul) — sama seperti _fetchSuratStats tapi
// juga narik 5 surat terbaru buat panel "Terbaru". Dipisah biar Dashboard
// Utama tidak ikut berubah tampilannya.
async function _fetchSuratDashData() {
  try {
    const [rm, rk, rrm, rrk, rov] = await Promise.all([
      fetch('/api/surat-masuk/stats',                       { headers: authHeaders() }),
      fetch('/api/surat-keluar/stats',                      { headers: authHeaders() }),
      fetch('/api/surat-masuk?page=1&limit=5&q=&sort=terbaru',  { headers: authHeaders() }),
      fetch('/api/surat-keluar?page=1&limit=5&q=&sort=terbaru', { headers: authHeaders() }),
      fetch('/api/surat-masuk?page=1&limit=50&selesai=false&q=', { headers: authHeaders() }),
    ]);
    const masuk  = rm.ok  ? await rm.json()  : {};
    const keluar = rk.ok  ? await rk.json()  : {};
    const rmList = rrm.ok ? (await rrm.json()).surat || [] : [];
    const rkList = rrk.ok ? (await rrk.json()).surat || [] : [];
    const belumList = rov.ok ? (await rov.json()).surat || [] : [];

    const today = new Date().toISOString().slice(0, 10);
    const overdue_list = belumList
      .filter(s => s.batas_waktu && s.batas_waktu.slice(0, 10) < today)
      .sort((a, b) => a.batas_waktu.localeCompare(b.batas_waktu));

    return {
      total_masuk:       masuk.total          ?? '—',
      belum_proses:      masuk.belum_selesai  ?? '—',
      terlambat:         masuk.terlambat      ?? 0,
      masuk_bulan_ini:   masuk.bulan_ini      ?? 0,
      total_keluar:      keluar.total         ?? '—',
      keluar_bulan_ini:  keluar.bulan_ini     ?? 0,
      overdue_list,
      recent_masuk: rmList.map(s => ({
        perihal: s.perihal,
        nomor:   s.no_surat,
        tanggal: s.tanggal_terima,
        status:  s.selesai ? 'Selesai' : 'Proses',
      })),
      recent_keluar: rkList.map(s => ({
        perihal: s.perihal,
        nomor:   s.no_surat,
        tanggal: s.tanggal_surat,
      })),
    };
  } catch { return null; }
}
async function _fetchKinerjaStats() {
  try {
    const pa    = getPeriodeAktif();
    const bulan = pa?.bulan || new Date().getMonth() + 1;
    const tahun = pa?.tahun || new Date().getFullYear();
    const r = await fetch(`/api/kinerja/stats?bulan=${bulan}&tahun=${tahun}`, { headers: authHeaders() });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

// ── IKU Grid Widget ───────────────────────────────────────────────────────────
// Font size untuk chart SVG — bisa diatur terpisah antara IKU dan Pantau Indikator
// Nilai: skala relatif terhadap default (1.0 = normal, 0.85 = lebih kecil, 1.2 = lebih besar)
const _IKU_CHART_FS  = 1.55;  // ← ubah untuk IKU
const _KW_CHART_FS   = 1.0;   // ← ubah untuk Pantau Indikator
let   _activeChartFs = 1.0;   // dipakai di dalam fungsi chart

let _ikuGridData  = [];
let _ikuChartType = localStorage.getItem('iku_chart_type') || 'line';

function _ikuSetChartType(type) {
  _ikuChartType = type;
  try { localStorage.setItem('iku_chart_type', type); } catch {}
  _ikuRenderChartSection();
}
window._ikuSetChartType = _ikuSetChartType;

// simpan last render params
let _ikuLastBulan = null, _ikuLastTahun = null, _ikuLastPa = null;

// ── State filter IKU ─────────────────────────────────────────────────────────
let _ikuTahunList    = [];
let _ikuFilterMode   = 'bulan';   // 'bulan' | 'tahun'
let _ikuRangeFrom    = null;      // { bulan, tahun, key:'YYYY-MM' }
let _ikuRangeTo      = null;
let _ikuTahunDari    = null;
let _ikuTahunSampai  = null;

// Expose ke window
function _ikuSetFilterMode(mode) {
  _ikuFilterMode = mode;
  if (mode === 'tahun') {
    _ikuTahunDari   = _ikuTahunDari   || _ikuTahunList[0] || new Date().getFullYear();
    _ikuTahunSampai = _ikuTahunSampai || _ikuTahunList[_ikuTahunList.length-1] || _ikuTahunDari;
    _ikuRangeFrom = { bulan:1,  tahun:_ikuTahunDari,   key:`${_ikuTahunDari}-01` };
    _ikuRangeTo   = { bulan:12, tahun:_ikuTahunSampai,  key:`${_ikuTahunSampai}-12` };
  }
  _ikuApplyFilter();
  _ikuSyncToPantau();
}
function _ikuSetRangeFrom(key) {
  const [y, m] = key.split('-').map(Number);
  _ikuRangeFrom = { bulan:m, tahun:y, key };
  if (_ikuRangeTo && y*100+m > _ikuRangeTo.tahun*100+_ikuRangeTo.bulan) _ikuRangeTo = { ..._ikuRangeFrom };
  _ikuApplyFilter();
  _ikuSyncToPantau();
}
function _ikuSetRangeTo(key) {
  const [y, m] = key.split('-').map(Number);
  _ikuRangeTo = { bulan:m, tahun:y, key };
  if (_ikuRangeFrom && y*100+m < _ikuRangeFrom.tahun*100+_ikuRangeFrom.bulan) _ikuRangeFrom = { ..._ikuRangeTo };
  _ikuApplyFilter();
  _ikuSyncToPantau();
}
function _ikuSetTahunDari(val) {
  _ikuTahunDari = Number(val);
  if (!_ikuTahunSampai || _ikuTahunSampai < _ikuTahunDari) _ikuTahunSampai = _ikuTahunDari;
  _ikuRangeFrom = { bulan:1,  tahun:_ikuTahunDari,   key:`${_ikuTahunDari}-01` };
  _ikuRangeTo   = { bulan:12, tahun:_ikuTahunSampai,  key:`${_ikuTahunSampai}-12` };
  _ikuApplyFilter();
  _ikuSyncToPantau();
}
function _ikuSetTahunSampai(val) {
  _ikuTahunSampai = Number(val);
  if (!_ikuTahunDari || _ikuTahunDari > _ikuTahunSampai) _ikuTahunDari = _ikuTahunSampai;
  _ikuRangeFrom = { bulan:1,  tahun:_ikuTahunDari,   key:`${_ikuTahunDari}-01` };
  _ikuRangeTo   = { bulan:12, tahun:_ikuTahunSampai,  key:`${_ikuTahunSampai}-12` };
  _ikuApplyFilter();
  _ikuSyncToPantau();
}
// ── Sinkronkan filter IKU → Pantau Indikator ─────────────────────────────
function _ikuSyncToPantau() {
  if (typeof _kwRangeFrom === 'undefined') return; // Pantau Indikator belum init
  _kwRangeFrom    = _ikuRangeFrom    ? { ..._ikuRangeFrom }    : null;
  _kwRangeTo      = _ikuRangeTo      ? { ..._ikuRangeTo }      : null;
  _kwFilterMode   = _ikuFilterMode;
  _kwModePerTahun = (_ikuFilterMode === 'tahun');
  if (_ikuFilterMode === 'tahun') {
    _kwTahunDari   = _ikuTahunDari;
    _kwTahunSampai = _ikuTahunSampai;
  }
  if (typeof _kwSaveFilter === 'function') _kwSaveFilter();
  if (typeof _renderKinerjaWatch === 'function') _renderKinerjaWatch();
}

window._ikuSetFilterMode  = _ikuSetFilterMode;
window._ikuSetRangeFrom   = _ikuSetRangeFrom;
window._ikuSetRangeTo     = _ikuSetRangeTo;
window._ikuSetTahunDari   = _ikuSetTahunDari;
window._ikuSetTahunSampai = _ikuSetTahunSampai;

async function _ikuApplyFilter() {
  const el = document.getElementById('ikuGridWidget');
  if (!el) return;
  // Gunakan bulan dari RangeTo sebagai titik rekap yang ditampilkan di chart header
  const bulan = _ikuRangeTo?.bulan || (getPeriodeAktif()?.bulan || new Date().getMonth() + 1);
  const tahun = _ikuRangeTo?.tahun || (getPeriodeAktif()?.tahun || new Date().getFullYear());
  try {
    const r = await fetch(`/api/kinerja/rekap?bulan=${bulan}&tahun=${tahun}`, { headers: authHeaders() });
    const d = r.ok ? await r.json() : { rekap: [] };
    _ikuGridData = (d.rekap || []).filter(x => x.jenis_monev);
  } catch { _ikuGridData = []; }

  // Pastikan semua tahun dalam range sudah ada di _kwAllRekap (untuk chart per bulan)
  if (typeof _kwFetchTahun === 'function') {
    const fromThn = _ikuRangeFrom?.tahun || tahun;
    const toThn   = _ikuRangeTo?.tahun   || tahun;
    const tahunRange = [];
    for (let t = fromThn; t <= toThn; t++) tahunRange.push(t);
    await Promise.all(tahunRange.map(t => _kwFetchTahun(t).catch(() => {})));
  }

  _renderIkuGrid(bulan, tahun, null);
}

async function _initIkuGrid() {
  const el = document.getElementById('ikuGridWidget');
  if (!el) return;

  const pa    = getPeriodeAktif();
  const bulan = pa?.bulan || new Date().getMonth() + 1;
  const tahun = pa?.tahun || new Date().getFullYear();

  // Skeleton
  el.innerHTML = `
    <div class="iku-grid-wrap">
      <div class="iku-grid-header">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        <span class="iku-grid-title">IKU — Indikator Kinerja Utama</span>
      </div>
      <div class="iku-cards-grid">${Array(4).fill(0).map(() =>
        `<div class="skeleton" style="height:88px;border-radius:12px;opacity:.35"></div>`
      ).join('')}</div>
    </div>`;

  try {
    const r = await fetch(`/api/kinerja/rekap?bulan=${bulan}&tahun=${tahun}`, { headers: authHeaders() });
    const d = r.ok ? await r.json() : { rekap: [] };
    _ikuGridData = (d.rekap || []).filter(x => x.jenis_monev);
  } catch { _ikuGridData = []; }

  // Bangun tahun list dari periode (untuk dropdown filter)
  try {
    const rP = await fetch('/api/periode', { headers: authHeaders() });
    if (rP.ok) {
      const dP = await rP.json();
      _ikuTahunList = [...new Set((dP.periode || []).map(p => p.tahun))].filter(Boolean).sort((a,b)=>a-b);
    }
  } catch {}
  // Tambahkan juga tahun yang ada di _kwAllRekap (data rekap mungkin ada meski belum ada di master periode)
  if (typeof _kwAllRekap !== 'undefined') {
    Object.keys(_kwAllRekap).map(Number).filter(Boolean).forEach(t => {
      if (!_ikuTahunList.includes(t)) _ikuTahunList.push(t);
    });
  }
  // Fallback: coba fetch dari API kinerja untuk dapat semua tahun yang ada data
  try {
    const rK = await fetch('/api/kinerja/rekap/tahun-list', { headers: authHeaders() });
    if (rK.ok) {
      const dK = await rK.json();
      (dK.tahun || []).forEach(t => { if (!_ikuTahunList.includes(t)) _ikuTahunList.push(t); });
    }
  } catch {}
  if (!_ikuTahunList.includes(tahun)) _ikuTahunList.push(tahun);
  _ikuTahunList.sort((a,b)=>a-b);

  // Set default range filter ke Jan–Des tahun aktif (hanya kalau belum di-set)
  if (_ikuRangeFrom === null) _ikuRangeFrom = { bulan:1,  tahun, key:`${tahun}-01` };
  if (_ikuRangeTo   === null) _ikuRangeTo   = { bulan:12, tahun, key:`${tahun}-12` };
  if (_ikuTahunDari   === null) _ikuTahunDari   = tahun;
  if (_ikuTahunSampai === null) _ikuTahunSampai = tahun;

  _renderIkuGrid(bulan, tahun, pa);
  // Sinkronkan periode awal IKU ke Pantau Indikator
  if (typeof _ikuSyncToPantau === 'function') _ikuSyncToPantau();
}

function _renderIkuGrid(bulan, tahun, pa) {
  _ikuLastBulan = bulan; _ikuLastTahun = tahun; _ikuLastPa = pa;
  const el = document.getElementById('ikuGridWidget');
  if (!el) return;

  const BULAN_NAMA = ['','Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'];
  const _BULAN_FULL_IKU = ['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const periodeLabel = (() => {
    if (_ikuFilterMode === 'tahun' && _ikuTahunDari && _ikuTahunSampai) {
      return _ikuTahunDari === _ikuTahunSampai ? `Tahun ${_ikuTahunDari}` : `${_ikuTahunDari} \u2013 ${_ikuTahunSampai}`;
    }
    if (_ikuRangeFrom && _ikuRangeTo) {
      if (_ikuRangeFrom.key === _ikuRangeTo.key)
        return `${_BULAN_FULL_IKU[_ikuRangeFrom.bulan]} ${_ikuRangeFrom.tahun}`;
      return `${_BULAN_FULL_IKU[_ikuRangeFrom.bulan]} ${_ikuRangeFrom.tahun} \u2013 ${_BULAN_FULL_IKU[_ikuRangeTo.bulan]} ${_ikuRangeTo.tahun}`;
    }
    return pa?.label || `${BULAN_NAMA[bulan] || bulan} ${tahun}`;
  })();

  // Hitung ringkasan
  const total   = _ikuGridData.length;
  const terisi  = _ikuGridData.filter(x => x.realisasi != null).length;
  const onTrack = _ikuGridData.filter(x => {
    if (x.capaian_persen == null) return false;
    return Number(x.capaian_persen) >= 75;
  }).length;

  const cardHtml = _ikuGridData.length === 0
    ? `<div style="grid-column:1/-1;text-align:center;padding:32px 16px;color:#94a3b8;font-size:.85rem">
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" style="opacity:.4;display:block;margin:0 auto 8px"><path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2zm0 0V9a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v10m-6 0a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2m0 0V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z"/></svg>
        Belum ada data IKU untuk periode ini
       </div>`
    : _ikuGridData.map(row => {
        const cap     = row.capaian_persen != null ? Number(row.capaian_persen) : null;
        const real    = row.realisasi     != null ? row.realisasi : null;
        const hasData = real != null;

        // Warna berdasarkan capaian — sama dengan kw-* palette
        const col   = cap === null ? '#94a3b8' : cap >= 100 ? '#10b981' : cap >= 75 ? '#f59e0b' : '#ef4444';
        const colBg = cap === null ? '#f8fafc'  : cap >= 100 ? '#f0fdf4' : cap >= 75 ? '#fffbeb' : '#fff1f2';
        const _svgCheck   = `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:3px"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
        const _svgWarn    = `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:3px"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>`;
        const _svgX       = `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:3px"><circle cx="12" cy="12" r="10"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/></svg>`;
        const _svgMinus   = `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:3px"><line x1="5" x2="19" y1="12" y2="12"/></svg>`;
        const label = cap === null ? `${_svgMinus}Belum diisi` : cap >= 100 ? `${_svgCheck}Tercapai` : cap >= 75 ? `${_svgWarn}Mendekati` : `${_svgX}Perlu tindakan`;
        const pct   = cap !== null ? Math.min(cap, 100) : 0;

        // Target display
        const tgtNum = row.target_tahun != null ? Number(row.target_tahun) : null;
        const tgtDisp = row.target_display != null ? row.target_display
          : (tgtNum !== null ? (Number.isInteger(tgtNum) ? tgtNum : tgtNum.toFixed(2)) : '—');

        // Polarity badge
        const polarBadge = row.bermakna_negatif
          ? `<span title="Bermakna Negatif" style="display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;background:#fee2e2;border-radius:50%;flex-shrink:0"><svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" fill="none" viewBox="0 0 24 24" stroke="#991b1b" stroke-width="2.8"><path stroke-linecap="round" stroke-linejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3"/></svg></span>`
          : `<span title="Bermakna Positif" style="display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;background:#d1fae5;border-radius:50%;flex-shrink:0"><svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" fill="none" viewBox="0 0 24 24" stroke="#065f46" stroke-width="2.8"><path stroke-linecap="round" stroke-linejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18"/></svg></span>`;

        const realDisp = hasData
          ? (Number.isInteger(Number(real)) ? Number(real) : Number(real).toFixed(2))
          : '—';

        return `
          <div class="iku-card" style="--iku-col:${col};--iku-col-bg:${colBg}">
            <div class="iku-card-top">
              <div class="iku-card-name">${esc(row.indikator_kinerja)}${polarBadge}</div>
              <div class="iku-card-cap" style="color:${col}">${cap !== null ? cap.toFixed(1)+'%' : '—'}</div>
            </div>
            <div style="margin:7px 0 4px">
              <div style="height:5px;border-radius:99px;background:#f1f5f9;overflow:hidden">
                <div style="height:100%;border-radius:99px;background:${col};width:${pct}%;transition:width .5s ease"></div>
              </div>
            </div>
            <div class="iku-card-meta">
              <span style="color:${col};font-weight:600;font-size:.7rem">${label}</span>
              <span style="color:#94a3b8;font-size:.7rem">Real: <b style="color:#334155">${realDisp}</b> / Tgt: <b style="color:#334155">${tgtDisp}</b> ${row.satuan ? `<span style="opacity:.6">${esc(row.satuan)}</span>` : ''}</span>
            </div>
          </div>`;
      }).join('');

  // Summary strip
  const summaryHtml = total > 0 ? `
    <div class="iku-summary-strip">
      <div class="iku-sum-item">
        <span class="iku-sum-val">${total}</span>
        <span class="iku-sum-lbl">Total IKU</span>
      </div>
      <div style="width:1px;height:28px;background:#e2e8f0;flex-shrink:0"></div>
      <div class="iku-sum-item">
        <span class="iku-sum-val" style="color:${terisi > 0 ? '#0d9488' : '#94a3b8'}">${terisi}</span>
        <span class="iku-sum-lbl">Sudah Diisi</span>
      </div>
      <div style="width:1px;height:28px;background:#e2e8f0;flex-shrink:0"></div>
      <div class="iku-sum-item">
        <span class="iku-sum-val" style="color:${total - terisi > 0 ? '#ef4444' : '#10b981'}">${total - terisi}</span>
        <span class="iku-sum-lbl">Belum Diisi</span>
      </div>
      <div style="width:1px;height:28px;background:#e2e8f0;flex-shrink:0"></div>
      <div class="iku-sum-item">
        <span class="iku-sum-val" style="color:${onTrack > 0 ? '#10b981' : '#94a3b8'}">${onTrack}</span>
        <span class="iku-sum-lbl">On Track (≥75%)</span>
      </div>
    </div>` : '';

  // ── Filter bar IKU — persis seperti Pantau Indikator ──────────────────────
  const _ikuTahunUnik = (_ikuTahunList.length ? _ikuTahunList : [tahun]);
  const _ikuFromKey   = _ikuRangeFrom?.key || `${tahun}-01`;
  const _ikuToKey     = _ikuRangeTo?.key   || `${tahun}-12`;

  // Semua kombinasi bulan-tahun yang mungkin (untuk month picker)
  const _ikuAllPairs = [];
  for (const thn of _ikuTahunUnik) {
    for (let b = 1; b <= 12; b++) {
      _ikuAllPairs.push({ bulan:b, tahun:thn, key:`${thn}-${String(b).padStart(2,'0')}` });
    }
  }
  const _ikuAvailKeys = new Set(_ikuAllPairs.map(p => p.key));
  const _ikuToKeys    = new Set(_ikuAllPairs.filter(p => {
    const [fy, fm] = _ikuFromKey.split('-').map(Number);
    return p.tahun*100+p.bulan >= fy*100+fm;
  }).map(p => p.key));

  const _ikuThnDari   = _ikuTahunDari   || _ikuTahunUnik[0];
  const _ikuThnSampai = _ikuTahunSampai || _ikuTahunUnik[_ikuTahunUnik.length-1];
  const _dariItems    = _ikuTahunUnik.map(t => ({ val:t, label:String(t) }));
  const _sampaiItems  = _ikuTahunUnik.filter(t => t >= _ikuThnDari).map(t => ({ val:t, label:String(t) }));

  const filterBarHtml = `
    <div class="kw-filter-row" style="margin-bottom:10px">
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:.4;flex-shrink:0"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
        <span style="font-size:0.72rem;font-weight:700;color:#64748b;white-space:nowrap">Filter Periode:</span>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">

        <div class="kw-cdd" id="ikuFilterModeDd" style="min-width:90px" onclick="event.stopPropagation();_kwCddToggle('ikuFilterModeDd')">
          <span class="kw-cdd-label">${_ikuFilterMode === 'tahun' ? 'Tahun' : 'Bulan'}</span>
          <svg class="kw-cdd-caret" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>
          <div class="kw-cdd-panel" id="ikuFilterModeDd_panel">
            <div class="kw-cdd-opt${_ikuFilterMode === 'tahun' ? ' active' : ''}" onclick="event.stopPropagation();_kwCddToggle('ikuFilterModeDd');_ikuSetFilterMode('tahun')">Tahun</div>
            <div class="kw-cdd-opt${_ikuFilterMode === 'bulan' ? ' active' : ''}" onclick="event.stopPropagation();_kwCddToggle('ikuFilterModeDd');_ikuSetFilterMode('bulan')">Bulan</div>
          </div>
        </div>

        <div style="width:1px;height:16px;background:#e2e8f0;flex-shrink:0"></div>

        ${_ikuFilterMode === 'tahun' ? `
          <span style="font-size:0.72rem;font-weight:600;color:#94a3b8;white-space:nowrap">Dari</span>
          ${_kwCdd('ikuTahunDariDd', _dariItems, _ikuThnDari, '_ikuSetTahunDari', { minW: '90px' })}
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="#cbd5e1" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
          <span style="font-size:0.72rem;font-weight:600;color:#94a3b8;white-space:nowrap">Sampai</span>
          ${_kwCdd('ikuTahunSampaiDd', _sampaiItems, _ikuThnSampai, '_ikuSetTahunSampai', { minW: '90px' })}
        ` : `
          <span style="font-size:0.72rem;font-weight:600;color:#94a3b8;white-space:nowrap">Dari</span>
          ${_kwMonthPicker('ikuMpFrom', _ikuTahunUnik, _ikuFromKey, '_ikuSetRangeFrom', _ikuAvailKeys)}
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="#cbd5e1" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
          <span style="font-size:0.72rem;font-weight:600;color:#94a3b8;white-space:nowrap">Sampai</span>
          ${_kwMonthPicker('ikuMpTo', _ikuTahunUnik, _ikuToKey, '_ikuSetRangeTo', _ikuToKeys)}
        `}
        </div>
    </div>`;

  el.innerHTML = `
    <div class="iku-grid-wrap">
      <div class="iku-grid-header">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        <span class="iku-grid-title">IKU — Indikator Kinerja Utama</span>
        <span class="iku-grid-periode">${esc(periodeLabel)}</span>
      </div>
      ${filterBarHtml}
      <div id="ikuChartSection" style="margin-top:14px"></div>
    </div>`;

  // Render chart section
  _ikuRenderChartSection();
}

// ── IKU Chart Section (per bulan untuk indikator dipilih) ─────────────────────
function _ikuRenderChartSection() {
  const sec = document.getElementById('ikuChartSection');
  if (!sec) return;

  if (!_ikuGridData.length) { sec.innerHTML = ''; return; }

  // Prioritaskan tahun dari filter IKU, fallback ke _ikuLastTahun
  const tahun      = _ikuRangeTo?.tahun || _ikuLastTahun || getPeriodeAktif()?.tahun || new Date().getFullYear();
  const rekapTahun = (typeof _kwAllRekap !== 'undefined' && _kwAllRekap[tahun]) ? _kwAllRekap[tahun] : null;

  // Mode "Tahun" — tampilkan tren PER TAHUN untuk rentang Dari–Sampai
  const _ikuYearMode    = _ikuFilterMode === 'tahun';
  const _ikuYrFrom      = _ikuYearMode ? (_ikuTahunDari   || tahun) : tahun;
  const _ikuYrTo        = _ikuYearMode ? (_ikuTahunSampai || tahun) : tahun;
  const _ikuYearsNeeded = [];
  for (let y = _ikuYrFrom; y <= _ikuYrTo; y++) _ikuYearsNeeded.push(y);
  const _ikuMissingYears = (typeof _kwAllRekap !== 'undefined')
    ? _ikuYearsNeeded.filter(y => !_kwAllRekap[y])
    : _ikuYearsNeeded;

  // Kalau data bulanan belum tersedia, fetch dulu (+ indikator kalau belum ada) lalu re-render
  if ((!rekapTahun || _ikuMissingYears.length) && typeof _kwFetchTahun === 'function') {
    const _fetchAll = async () => {
      const _yearsToFetch = [...new Set([tahun, ..._ikuMissingYears])];
      await Promise.all(_yearsToFetch.map(y => _kwFetchTahun(y).catch(() => {})));
      // Kalau indikator belum terisi (race condition dengan _initKinerjaWatch), fetch juga
      if (!_kwAllIndikator.length) {
        try {
          const rInd = await fetch('/api/kinerja/indikator', { headers: authHeaders() });
          if (rInd.ok) {
            const dInd = await rInd.json();
            _kwAllIndikator = (dInd.indikator || [])
              .filter(r => r.aktif !== false)
              .map(r => ({
                id:                r.id,
                indikator_kinerja: r.indikator_kinerja,
                satuan:            r.satuan,
                target_tahun:      r.target_tahun,
                target_display:    r.target_display,
                penanggung_jawab:  r.penanggung_jawab,
                group_nama:        r.group_nama,
                bermakna_negatif:  r.bermakna_negatif,
              }));
          }
        } catch {}
      }
      _ikuRenderChartSection();
    };
    _fetchAll();
    sec.innerHTML = `<div class="iku-chart-section" style="padding:20px;text-align:center;color:#94a3b8;font-size:.84rem">
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#0d9488" stroke-width="2" style="animation:spin .8s linear infinite;display:inline-block;vertical-align:-3px;margin-right:6px"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
      Memuat data bulanan...
    </div>`;
    return;
  }

  // Kalau rekap sudah ada tapi indikator belum (race condition), fetch lalu re-render
  if (!_kwAllIndikator.length && typeof authHeaders === 'function') {
    (async () => {
      try {
        const rInd = await fetch('/api/kinerja/indikator', { headers: authHeaders() });
        if (rInd.ok) {
          const dInd = await rInd.json();
          _kwAllIndikator = (dInd.indikator || [])
            .filter(r => r.aktif !== false)
            .map(r => ({
              id:                r.id,
              indikator_kinerja: r.indikator_kinerja,
              satuan:            r.satuan,
              target_tahun:      r.target_tahun,
              target_display:    r.target_display,
              penanggung_jawab:  r.penanggung_jawab,
              group_nama:        r.group_nama,
              bermakna_negatif:  r.bermakna_negatif,
            }));
        }
      } catch {}
      _ikuRenderChartSection();
    })();
    return; // tunda render sampai indikator siap
  }

  const BULAN_SHORT = ['','Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'];

  // Helper: build chart data untuk 1 indikator
  function _buildChartData(indId, targetTahun, bermaknaNeg) {
    return Array.from({length: 12}, (_, i) => {
      const b   = i + 1;
      const rec = rekapTahun ? (rekapTahun['b' + b] || []).find(r => r.id === indId) : null;
      const real = rec && rec.realisasi !== null && rec.realisasi !== '' ? parseFloat(rec.realisasi) : null;
      const tgtF = targetTahun !== null ? parseFloat(targetTahun) : null;
      const cap  = (real !== null && tgtF !== null && tgtF !== 0)
        ? (bermaknaNeg ? ((tgtF - (real - tgtF)) / tgtF * 100) : (real / tgtF * 100))
        : null;
      // isInRange: dalam rentang filter Dari–Sampai (jika ada)
      // Bulan masa depan tanpa data otomatis abu karena capaian === null
      const fromKey = _ikuRangeFrom ? _ikuRangeFrom.tahun * 100 + _ikuRangeFrom.bulan : 0;
      const toKey   = _ikuRangeTo   ? _ikuRangeTo.tahun   * 100 + _ikuRangeTo.bulan   : 999999;
      const inFilter = (tahun * 100 + b) >= fromKey && (tahun * 100 + b) <= toKey;
      return { bulan: b, tahun, label: BULAN_SHORT[b], realisasi: real, capaian: cap, isInRange: inFilter };
    });
  }

  // Helper: build chart data PER TAHUN (untuk mode filter "Tahun")
  // 1 entri per tahun dalam rentang Dari–Sampai, ambil realisasi bulan terakhir yang terisi
  function _buildYearlyChartData(indId, targetTahun, bermaknaNeg) {
    const tgtF = targetTahun !== null ? parseFloat(targetTahun) : null;
    return _ikuYearsNeeded.map(thn => {
      const rekapThn = (typeof _kwAllRekap !== 'undefined' && _kwAllRekap[thn]) ? _kwAllRekap[thn] : null;
      let latestRec = null;
      for (let b = 12; b >= 1; b--) {
        const rec = rekapThn ? (rekapThn['b' + b] || []).find(r => r.id === indId) : null;
        if (rec && rec.realisasi !== null && rec.realisasi !== undefined && rec.realisasi !== '') {
          latestRec = rec;
          break;
        }
      }
      const real = latestRec ? parseFloat(latestRec.realisasi) : null;
      const cap  = (real !== null && tgtF !== null && tgtF !== 0)
        ? (bermaknaNeg ? ((tgtF - (real - tgtF)) / tgtF * 100) : (real / tgtF * 100))
        : null;
      return { bulan: thn, tahun: thn, label: String(thn), realisasi: real, capaian: cap, isInRange: true };
    });
  }

  // Chart type dropdown — 1 dropdown berlaku untuk semua 4 chart
  // Radar tersedia kalau setidaknya ada 1 indikator dengan >= 3 data dalam range
  const _ikuRadarAvail = _ikuGridData.some(row => {
    if (_ikuYearMode) {
      const d = _buildYearlyChartData(row.id, row.target_tahun ?? null, row.bermakna_negatif ?? false);
      return d.length >= 3;
    }
    const fromB = _ikuRangeFrom?.tahun === tahun ? _ikuRangeFrom.bulan : 1;
    const toB   = _ikuRangeTo?.tahun   === tahun ? _ikuRangeTo.bulan   : 12;
    const d = _buildChartData(row.id, row.target_tahun ?? null, row.bermakna_negatif ?? false);
    return d.filter(x => x.bulan >= fromB && x.bulan <= toB && x.isInRange).length >= 3;
  });
  if (!_ikuRadarAvail && _ikuChartType === 'radar') {
    _ikuChartType = 'bar';
    try { localStorage.setItem('iku_chart_type', 'bar'); } catch {}
  }
  const ikuChartItems = [
    { val: 'line',   label: 'Line'   },
    { val: 'bar',    label: 'Bar'    },
    { val: 'area',   label: 'Area'   },
    { val: 'bullet', label: 'Bullet' },
    ...(_ikuRadarAvail ? [{ val: 'radar', label: 'Radar' }] : []),
  ];
  const switcherHtml = _kwCdd('ikuChartTypeDd', ikuChartItems, _ikuChartType, '_ikuSetChartType', { minW: '100px' });

  // Build 4 chart panels (satu per indikator)
  const prevKwChartType = (typeof _kwChartType !== 'undefined') ? _kwChartType : 'bar';
  if (typeof _kwChartType !== 'undefined') _kwChartType = _ikuChartType;
  const prevChartFs = _activeChartFs;
  _activeChartFs = _IKU_CHART_FS;

  const chartPanels = _ikuGridData.map(row => {
    const meta = (typeof _kwAllIndikator !== 'undefined' && _kwAllIndikator.length)
      ? _kwAllIndikator.find(x => x.id === row.id) : null;
    const indNama    = meta?.indikator_kinerja || row.indikator_kinerja || '—';
    const targetThn  = meta?.target_tahun      ?? row.target_tahun ?? null;
    const targetDisp = meta?.target_display     ?? row.target_display ?? (targetThn !== null ? parseFloat(targetThn) : null);
    const satuan     = meta?.satuan             || row.satuan || '';
    const berneg     = meta?.bermakna_negatif   ?? row.bermakna_negatif ?? false;
    const tgt        = targetThn !== null ? parseFloat(targetThn) : null;

    // Mode "Tahun": 1 entri per tahun (rentang Dari–Sampai). Mode "Bulan": 12 bulan dipotong sesuai range.
    const dataFull = _ikuYearMode
      ? _buildYearlyChartData(row.id, targetThn, berneg)
      : _buildChartData(row.id, targetThn, berneg);
    const fromB = _ikuRangeFrom?.tahun === tahun ? _ikuRangeFrom.bulan : 1;
    const toB   = _ikuRangeTo?.tahun   === tahun ? _ikuRangeTo.bulan   : 12;
    const data  = _ikuYearMode ? dataFull : dataFull.filter(d => d.bulan >= fromB && d.bulan <= toB);
    const bulanList = data.map(d => d.bulan);
    const hasData   = data.filter(d => d.realisasi !== null);
    const latest    = hasData.length ? hasData[hasData.length - 1] : null;
    const capLast   = latest?.capaian ?? null;
    const realLast  = latest?.realisasi ?? null;
    const totalSlots = _ikuYearMode ? data.length : 12;
    const col = capLast === null ? '#94a3b8' : capLast >= 100 ? '#10b981' : capLast >= 75 ? '#f59e0b' : '#ef4444';
    const _svgCheckL  = `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:3px"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
    const _svgWarnL   = `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:3px"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>`;
    const _svgXL      = `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:3px"><circle cx="12" cy="12" r="10"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/></svg>`;
    const _svgMinusL  = `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:3px"><line x1="5" x2="19" y1="12" y2="12"/></svg>`;
    const capLbl = capLast === null ? `${_svgMinusL}Belum diisi` : capLast >= 100 ? `${_svgCheckL}Tercapai` : capLast >= 75 ? `${_svgWarnL}Mendekati` : `${_svgXL}Perlu tindakan`;

    const chartSvg = (typeof _kwComboChart === 'function')
      ? _kwComboChart(data, bulanList, tgt, targetDisp, satuan)
      : '';

    return `
      <div class="iku-mini-chart-panel">
        <!-- Panel header -->
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:8px">
          <div style="min-width:0;flex:1">
            <div style="font-size:.72rem;font-weight:700;color:#0f172a;line-height:1.35;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${esc(indNama)}${_polarIcon(berneg, 13)}</div>
            <div style="font-size:.63rem;color:#94a3b8;margin-top:2px">${satuan ? esc(satuan) : ''}</div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-size:1.1rem;font-weight:800;color:${col};line-height:1">${capLast !== null ? capLast.toFixed(1)+'%' : '—'}</div>
            <div style="font-size:.6rem;font-weight:600;color:${col}">${capLbl}</div>
          </div>
        </div>
        <!-- KPI mini row -->
        <div style="display:flex;gap:6px;margin-bottom:8px">
          <div style="flex:1;padding:4px 8px;background:${col}0f;border-radius:6px;border-left:2px solid ${col}">
            <div style="font-size:.58rem;color:#94a3b8;font-weight:700;text-transform:uppercase">Realisasi</div>
            <div style="font-size:.88rem;font-weight:800;color:#0f172a">${realLast !== null ? +parseFloat(realLast).toFixed(2) : '—'}</div>
          </div>
          <div style="flex:1;padding:4px 8px;background:#f0f9ff;border-radius:6px;border-left:2px solid #3b82f6">
            <div style="font-size:.58rem;color:#94a3b8;font-weight:700;text-transform:uppercase">Target</div>
            <div style="font-size:.88rem;font-weight:800;color:#3b82f6">${targetDisp !== null ? targetDisp : '—'}</div>
          </div>
          <div style="flex:1;padding:4px 8px;background:#faf5ff;border-radius:6px;border-left:2px solid #8b5cf6">
            <div style="font-size:.58rem;color:#94a3b8;font-weight:700;text-transform:uppercase">Diisi</div>
            <div style="font-size:.88rem;font-weight:800;color:#8b5cf6">${hasData.length}<span style="font-size:.7rem;color:#94a3b8">/${totalSlots}</span></div>
          </div>
        </div>
        <!-- Chart -->
        <div class="iku-mini-chart-svg" style="overflow-x:auto">
          ${chartSvg || '<div style="height:120px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:.78rem">Belum ada data</div>'}
        </div>
      </div>`;
  }).join('');

  if (typeof _kwChartType !== 'undefined') _kwChartType = prevKwChartType;
  _activeChartFs = prevChartFs;

  sec.innerHTML = `
    <div class="iku-chart-section">
      <!-- Top bar: judul + dropdown -->
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px">
        <div style="display:flex;align-items:center;gap:7px">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#0d9488" stroke-width="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
          <span style="font-size:.78rem;font-weight:700;color:#0f172a">${_ikuYearMode ? `Tren Per Tahun — ${_ikuYrFrom === _ikuYrTo ? _ikuYrFrom : `${_ikuYrFrom}\u2013${_ikuYrTo}`}` : `Tren Per Bulan — ${tahun}`}</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:.63rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em">Tipe Chart</span>
          ${switcherHtml}
        </div>
      </div>
      <!-- 4 chart panels -->
      <div class="iku-charts-grid">
        ${chartPanels}
      </div>
    </div>`;
}

// ── Komponen: 1 card = 1 modul, sub-stat berjejer di bawah ──────────────────
const _MOD_COLORS = {
  teal:   { bg: '#ccfbf1', text: '#0f766e', accent: '#0d9488', dots: ['#0d9488', '#2dd4bf', '#5eead4', '#99f6e4', '#94a3b8'] },
  blue:   { bg: '#dbeafe', text: '#1d4ed8', accent: '#3b82f6', dots: ['#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#94a3b8'] },
  purple: { bg: '#ede9fe', text: '#6d28d9', accent: '#8b5cf6', dots: ['#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe', '#94a3b8'] },
  amber:  { bg: '#fef3c7', text: '#b45309', accent: '#f59e0b', dots: ['#f59e0b', '#fbbf24', '#fcd34d', '#fde68a', '#94a3b8'] },
};

// Maksimal stat yang ikut jadi segmen arc donut. Stat ke-4 dst hanya jadi baris
// biasa (tanpa arc) — mencegah donut "numpuk"/berantakan saat beda skala jauh
// (mis. jumlah link vs total klik) digabung jadi satu lingkaran proporsional.
const _DONUT_MAX_SEG = 3;

function _moduleCard({ icon, title, color, stats }) {
  const c = _MOD_COLORS[color] || _MOD_COLORS.blue;
  const DOTS = c.dots;

  // ── Donut chart: hanya stat 1–3 yang jadi arc, sisanya baris polos ──────
  const arcStats = stats.slice(0, _DONUT_MAX_SEG);
  const numVals  = arcStats.map(s => parseFloat(s.value)).filter(v => !isNaN(v) && v >= 0);
  const total    = numVals.reduce((a, b) => a + b, 0);

  // Buat path arc SVG untuk donut
  function _arc(cx, cy, r, startDeg, endDeg) {
    const toRad = d => (d - 90) * Math.PI / 180;
    const x1 = cx + r * Math.cos(toRad(startDeg));
    const y1 = cy + r * Math.sin(toRad(startDeg));
    const x2 = cx + r * Math.cos(toRad(endDeg));
    const y2 = cy + r * Math.sin(toRad(endDeg));
    const large = (endDeg - startDeg) > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  }

  let donutSVG = '';
  if (total > 0 && numVals.length > 1) {
    const cx = 40, cy = 40, R = 30, strokeW = 10;
    let cursor = 0;
    const paths = arcStats.map((s, i) => {
      const val = parseFloat(s.value);
      if (isNaN(val) || val <= 0) return '';
      const deg  = (val / total) * 360;
      // hindari full circle (360 = no path)
      const safeDeg = deg >= 359.9 ? 359.9 : deg;
      const path = _arc(cx, cy, R, cursor, cursor + safeDeg);
      cursor += deg;
      const col = s.highlight ? '#ef4444' : (DOTS[i] || c.accent);
      return `<path d="${path}" fill="none" stroke="${col}" stroke-width="${strokeW}" stroke-linecap="butt" opacity="${i === 0 ? 1 : 0.7}"/>`;
    }).join('');

    // Nilai utama di tengah donut
    const mainVal = stats[0]?.value ?? '—';
    const mainStr = String(mainVal).length > 4 ? String(mainVal).slice(0,4) : String(mainVal);
    donutSVG = `
      <div class="dash-mod-donut">
        <svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
          <circle cx="40" cy="40" r="30" fill="none" stroke="#f1f5f9" stroke-width="10"/>
          ${paths}
          <text x="40" y="37" text-anchor="middle" dominant-baseline="middle"
            font-size="12" font-weight="800" fill="${c.accent}" font-family="inherit">${esc(mainStr)}</text>
          <text x="40" y="50" text-anchor="middle" dominant-baseline="middle"
            font-size="6" fill="#94a3b8" font-family="inherit">${esc((stats[0]?.label || '').toUpperCase().slice(0,10))}</text>
        </svg>
      </div>`;
  } else if (total > 0 && numVals.length === 1) {
    // Hanya 1 nilai: tampilkan full circle filled
    const mainVal = stats[0]?.value ?? '—';
    donutSVG = `
      <div class="dash-mod-donut">
        <svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
          <circle cx="40" cy="40" r="30" fill="none" stroke="#f1f5f9" stroke-width="10"/>
          <circle cx="40" cy="40" r="30" fill="none" stroke="${c.accent}" stroke-width="10" stroke-dasharray="188.5" stroke-linecap="round" transform="rotate(-90 40 40)"/>
          <text x="40" y="38" text-anchor="middle" dominant-baseline="middle"
            font-size="13" font-weight="800" fill="${c.accent}" font-family="inherit">${esc(String(mainVal))}</text>
          <text x="40" y="51" text-anchor="middle" dominant-baseline="middle"
            font-size="5.5" fill="#94a3b8" font-family="inherit">${esc((stats[0]?.label || '').toUpperCase().slice(0,10))}</text>
        </svg>
      </div>`;
  }

  // Stat list di kanan donut (semua item, warna dot konsisten dgn arc utk 3 pertama)
  const items = stats.map((s, i) => {
    const col = s.highlight ? '#ef4444' : (DOTS[i] || DOTS[DOTS.length - 1]);
    return `
      <div class="dash-mod-stat-row">
        <span class="dash-mod-stat-dot" style="background:${col}"></span>
        <div class="dash-mod-stat-body">
          <div class="dash-mod-stat-val${s.highlight ? ' dash-mod-stat-val--alert' : ''}" style="${s.highlight ? '' : `color:${col}`}">${esc(String(s.value))}</div>
          <div class="dash-mod-stat-lbl">${esc(s.label)}</div>
        </div>
      </div>`;
  }).join('');

  return `
    <div class="dash-module-card" style="--card-accent:${c.accent}">
      <div class="dash-mod-header">
        <div class="dash-mod-icon" style="background:${c.bg};color:${c.text}">${icon}</div>
        <div class="dash-mod-title" style="color:#0f172a">${esc(title)}</div>
      </div>
      <div class="dash-mod-body">
        ${donutSVG}
        <div class="dash-mod-stat-list">${items}</div>
      </div>
    </div>`;
}

// ── Panel helpers ─────────────────────────────────────────────────────────────
function _topLinksPanel(links) {
  const rows = links.length
    ? links.map(l => `<tr><td>${esc(l.judul)}</td><td style="text-align:right"><span class="badge badge-blue">${l.total_klik}</span></td></tr>`).join('')
    : '<tr class="empty-row"><td colspan="2">Belum ada data klik</td></tr>';
  return `<div class="dash-panel">
    <div class="dash-panel-header"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg> Top 5 Link Terpopuler</div>
    <table class="dash-panel-table"><thead><tr><th>Link</th><th style="text-align:right">Klik</th></tr></thead><tbody>${rows}</tbody></table>
  </div>`;
}

function _recentSuratPanel(list, jenis) {
  const title = jenis === 'masuk' ? 'Surat Masuk Terbaru' : 'Surat Keluar Terbaru';
  const icon  = jenis === 'masuk'
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.2 8.4c.5.38.8.97.8 1.6v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 .8-1.6l8-6a2 2 0 0 1 2.4 0l8 6Z"/><path d="m22 10-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 10"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.714 3.048a.498.498 0 0 0-.683.627l2.843 7.627a2 2 0 0 1 0 1.396l-2.842 7.627a.498.498 0 0 0 .682.627l18-8.5a.5.5 0 0 0 0-.904z"/><path d="M6 12h16"/></svg>`;
  const rows = list.map(s => `
    <tr><td>
      <div style="font-weight:500;font-size:.78rem">${esc(s.perihal||s.judul||'—')}</div>
      <div style="font-size:.7rem;opacity:.55">${esc(s.nomor||'')}${s.nomor?' · ':''}${fmtDate(s.tanggal||s.tgl_surat)}</div>
    </td><td style="text-align:right">${s.status?`<span class="badge ${_suratBadge(s.status)}">${esc(s.status)}</span>`:''}</td></tr>`).join('');
  return `<div class="dash-panel">
    <div class="dash-panel-header">${icon} ${title}</div>
    <table class="dash-panel-table"><tbody>${rows}</tbody></table>
  </div>`;
}

function _suratBadge(s) {
  s = (s||'').toLowerCase();
  return s.includes('proses')||s.includes('pending') ? 'badge-warning' : s.includes('selesai')||s.includes('done') ? 'badge-success' : 'badge-blue';
}

// ── Pagination state utk panel "Indikator Belum Diisi" ─────────────────────
let _kbList = [];
let _kbPage = 1;
const _KB_PAGE_SIZE = 5;

// Warna jenis indikator — HARUS sama persis dgn `jenisColors` di panel "Sebaran Jenis Indikator"
const _KB_JENIS_COLORS = { IKU: '#3b82f6', IKK: '#10b981', SPM: '#f59e0b' };
function _kbJenisBadge(label) {
  const c = _KB_JENIS_COLORS[label] || '#94a3b8';
  return `<span class="badge" style="font-size:.63rem;background:${c}1f;color:${c}">${label}</span>`;
}
function _kbJenisBadges(i) {
  const badges = [];
  if (i.jenis_monev) badges.push(_kbJenisBadge('IKU'));
  if (i.jenis_ikk)   badges.push(_kbJenisBadge('IKK'));
  if (i.jenis_spm)   badges.push(_kbJenisBadge('SPM'));
  return badges.join(' ');
}

function _kbBuildRows(pageItems) {
  return pageItems.map(i => `
    <tr><td>
      <div style="display:flex;align-items:center;gap:4px;font-weight:500;font-size:.78rem">${esc(i.nama||i.indikator||'—')}${_polarIcon(i.bermakna_negatif, 13)}</div>
      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:5px;margin-top:5px">
        ${_kbJenisBadges(i)}
        ${i.bidang?`<span style="font-size:.7rem;opacity:.55">${esc(i.bidang)}</span>`:''}
      </div>
    </td><td style="text-align:right;vertical-align:top;padding-top:12px"><span class="badge badge-warning">Belum diisi</span></td></tr>`).join('');
}

// Render ulang pagination pakai komponen baku situs (renderPagination → .pagination/.page-btn)
function _kbRenderPagination() {
  if (document.getElementById('kbAlertPagination')) {
    renderPagination('kbAlertPagination', _kbList.length, _kbPage, _KB_PAGE_SIZE, '_kbSetPage');
  }
}

function _kbSetPage(p) {
  const totalPages = Math.max(1, Math.ceil(_kbList.length / _KB_PAGE_SIZE));
  _kbPage = Math.min(Math.max(1, p), totalPages);
  const start = (_kbPage - 1) * _KB_PAGE_SIZE;
  const body = document.getElementById('kbAlertBody');
  if (body) body.innerHTML = _kbBuildRows(_kbList.slice(start, start + _KB_PAGE_SIZE));
  _kbRenderPagination();
}
window._kbSetPage = _kbSetPage;

function _kinerjaAlertPanel(list, totalBelum = null) {
  _kbList = list;
  _kbPage = 1;
  const total = totalBelum ?? list.length;
  const rows = _kbBuildRows(list.slice(0, _KB_PAGE_SIZE));
  return `<div class="dash-panel">
    <div class="dash-panel-header">
      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
      <span style="flex:1">Indikator Belum Diisi</span>
      <span class="badge badge-warning">${total}</span>
    </div>
    <table class="dash-panel-table"><tbody id="kbAlertBody">${rows}</tbody></table>
    <div id="kbAlertPagination" style="padding:8px 12px 12px"></div>
  </div>`;
}

// ── Komponen generik dashboard modul (KPI card, bar list, mini donut) ────────
const _KPI_COLORS = {
  teal:   { bg: '#ccfbf1', text: '#0f766e' },
  blue:   { bg: '#dbeafe', text: '#1d4ed8' },
  purple: { bg: '#ede9fe', text: '#6d28d9' },
  amber:  { bg: '#fef3c7', text: '#d97706' },
  red:    { bg: '#fee2e2', text: '#b91c1c' },
  green:  { bg: '#d1fae5', text: '#047857' },
  // Dipakai khusus utk statcard & barlist Surat Masuk/Keluar — biar warnanya
  // gak "tua" kayak teal/blue biasa, dan konsisten di kedua tempat sekaligus.
  tealMuda: { bg: '#ccfbf1', text: '#2dd4bf' },
  biruMuda: { bg: '#e0f2fe', text: '#38bdf8' },
};

// Kartu KPI tunggal — ikon + angka besar + label + sub-info opsional (mis. tren)
function _kpiCard({ icon, label, value, sub = null, subUp = null, color = 'teal' }) {
  const c = _KPI_COLORS[color] || _KPI_COLORS.teal;
  const subCls  = subUp === true ? 'up' : subUp === false ? 'down' : '';
  const subHtml = sub ? `<div class="dash-kpi-sub ${subCls}">${esc(sub)}</div>` : '';
  return `
    <div class="dash-kpi-card${color === 'red' ? ' dash-kpi-card--alert' : ''}" style="border-left-color:${c.text}">
      <div class="dash-kpi-body">
        <div class="dash-kpi-lbl">${esc(label)}</div>
        <div class="dash-kpi-val" style="color:${c.text}">${esc(String(value))}</div>
        ${subHtml}
      </div>
      <div class="dash-kpi-icon" style="color:${c.text}">${icon}</div>
    </div>`;
}

// Panel daftar dengan bar proporsional — dipakai utk top list, distribusi, perbandingan
function _barListPanel({ icon, title, rows, emptyText = 'Belum ada data' }) {
  if (!rows || !rows.length) {
    return `<div class="dash-panel">
      <div class="dash-panel-header">${icon} ${esc(title)}</div>
      <div class="dash-panel-empty">${esc(emptyText)}</div>
    </div>`;
  }
  const max  = Math.max(1, ...rows.map(r => Number(r.value) || 0));
  const body = rows.map(r => {
    const val = Number(r.value) || 0;
    const pct = Math.max(2, Math.round((val / max) * 100));
    const col = r.color || '#0d9488';
    return `
      <div class="dash-barlist-row">
        <div class="dash-barlist-top">
          <span style="font-size:.82rem;font-weight:600;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:68%">${esc(r.label)}</span>
          <span style="font-size:.8rem;font-weight:700;color:${col};white-space:nowrap">${esc(String(r.value))}${r.suffix || ''}</span>
        </div>
        ${r.sublabel ? `<div style="font-size:.7rem;color:var(--teks-muted);margin-bottom:2px">${esc(r.sublabel)}</div>` : ''}
        <div class="dash-barlist-track"><div class="dash-barlist-fill" style="width:${pct}%;background:${col}"></div></div>
      </div>`;
  }).join('');
  return `<div class="dash-panel">
    <div class="dash-panel-header">${icon} ${esc(title)}</div>
    <div class="dash-barlist">${body}</div>
  </div>`;
}

// Panel donut mini dengan legenda — dipakai utk status/proporsi (aktif/nonaktif, selesai/proses, dst)
function _miniDonutPanel({ icon, title, segments, centerVal, centerLbl }) {
  const total = segments.reduce((a, s) => a + (Number(s.value) || 0), 0);
  const cx = 40, cy = 40, R = 30, strokeW = 10;
  function _arc(cx, cy, r, startDeg, endDeg) {
    const toRad = d => (d - 90) * Math.PI / 180;
    const x1 = cx + r * Math.cos(toRad(startDeg)), y1 = cy + r * Math.sin(toRad(startDeg));
    const x2 = cx + r * Math.cos(toRad(endDeg)),   y2 = cy + r * Math.sin(toRad(endDeg));
    const large = (endDeg - startDeg) > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  }
  let cursor = 0;
  const paths = total > 0 ? segments.map(s => {
    const val = Number(s.value) || 0;
    if (!val) return '';
    const deg = (val / total) * 360;
    const safeDeg = deg >= 359.9 ? 359.9 : deg;
    const path = _arc(cx, cy, R, cursor, cursor + safeDeg);
    cursor += deg;
    return `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="${strokeW}"/>`;
  }).join('') : '';
  const legend = segments.map(s => `
    <div style="display:flex;align-items:center;gap:8px">
      <span style="width:8px;height:8px;border-radius:50%;background:${s.color};flex-shrink:0"></span>
      <span style="font-size:.78rem;color:#334155;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.label)}</span>
      <span style="font-size:.8rem;font-weight:700;color:#0f172a">${esc(String(s.value))}</span>
    </div>`).join('');
  return `<div class="dash-panel">
    <div class="dash-panel-header">${icon} ${esc(title)}</div>
    <div class="dash-panel--split">
      <div class="dash-mod-donut" style="flex-shrink:0">
        <svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
          <circle cx="40" cy="40" r="30" fill="none" stroke="#f1f5f9" stroke-width="10"/>
          ${paths}
          <text x="40" y="37" text-anchor="middle" dominant-baseline="middle" font-size="13" font-weight="800" fill="#0f172a" font-family="inherit">${esc(String(centerVal))}</text>
          <text x="40" y="50" text-anchor="middle" dominant-baseline="middle" font-size="6" fill="#94a3b8" font-family="inherit">${esc((centerLbl || '').toUpperCase().slice(0, 10))}</text>
        </svg>
      </div>
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:8px">${legend}</div>
    </div>
  </div>`;
}


// ═══════════════════════════════════════════════════════════════════════════
// WIDGET: PANTAU INDIKATOR KINERJA (per bulan/TW/semester/tahun)
// ═══════════════════════════════════════════════════════════════════════════

// Label bulan untuk widget pantau
const _KW_BULAN_LABEL = ['','Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
const _KW_BULAN_FULL  = ['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

// State widget
let _kwAllIndikator  = [];
let _kwAllRekap      = {};   // { tahun: { bulan_1:[...], ... } }
let _kwWatchedId     = null;
let _kwViewMode      = 'bulan';   // 'bulan' | 'tw' | 'semester' | 'tahun'
let _kwChartType    = 'line';  // 'bullet' | 'bar' | 'line' | 'area' | 'radar'
let _kwBulanPilih    = new Date().getMonth() + 1;   // 1–12
let _kwTWPilih       = 1;   // 1–4
let _kwSemPilih      = 1;   // 1–2
let _kwTahunPilih    = new Date().getFullYear();
let _kwTahunList     = [];  // tahun yang tersedia

// ── State filter rentang (mode baru) ──────────────────────────────────────
// Format: { bulan: 1..12, tahun: 2024 }
let _kwRangeFrom     = null;
let _kwRangeTo       = null;
let _kwModePerTahun  = false;
let _kwFilterMode    = 'bulan'; // 'tahun' | 'bulan'
let _kwTahunDari     = null;   // tahun awal (mode tahun)
let _kwTahunSampai   = null;   // tahun akhir (mode tahun)

// ── Helper: semua periode yg ada data (bulan-tahun kombinasi unik) ─────────
// Mengembalikan array [{bulan, tahun, key:'YYYY-MM'}] urut kronologis
function _kwGetPeriodeAdaData(indId) {
  const hasil = [];
  const tahunList = Object.keys(_kwAllRekap).map(Number).sort((a,b) => a-b);
  for (const thn of tahunList) {
    for (let b = 1; b <= 12; b++) {
      const rec = (_kwAllRekap[thn]?.['b' + b] || []).find(r => r.id === indId);
      if (rec && rec.realisasi !== null && rec.realisasi !== undefined && rec.realisasi !== '') {
        hasil.push({ bulan: b, tahun: thn, key: `${thn}-${String(b).padStart(2,'0')}` });
      }
    }
  }
  return hasil;
}

// ── Helper: label periode bulan-tahun ─────────────────────────────────────
function _kwPeriodePillLabel(p) {
  return `${_KW_BULAN_FULL[p.bulan]} ${p.tahun}`;
}

// ── Helper: bulanList cross-tahun dari range ───────────────────────────────
// Mengembalikan array [{bulan, tahun}]
function _kwGetRangePairs(from, to) {
  if (!from || !to) return [];
  const pairs = [];
  let thn = from.tahun, bln = from.bulan;
  const toKey = to.tahun * 100 + to.bulan;
  while (thn * 100 + bln <= toKey) {
    pairs.push({ bulan: bln, tahun: thn });
    bln++;
    if (bln > 12) { bln = 1; thn++; }
    if (thn > to.tahun + 1) break; // safety
  }
  return pairs;
}

// ── Helper hitung capaian sesuai jenis indikator ────────────────────────
function _kwHitungCapaian(realisasi, target_tahun, bermakna_negatif) {
  const real   = parseFloat(realisasi);
  const target = parseFloat(target_tahun);
  if (isNaN(real) || isNaN(target) || target === 0) return null;
  return bermakna_negatif
    ? ((target - (real - target)) / target * 100)
    : (real / target * 100);
}

// ── Agregasi cross-tahun (extend _kwAggregate) ────────────────────────────
function _kwAggregateRange(indId, pairs) {
  const recs = pairs
    .map(p => (_kwAllRekap[p.tahun]?.['b' + p.bulan] || []).find(r => r.id === indId))
    .filter(Boolean);

  if (!recs.length) return { realisasi: null, capaian: null, permasalahan: null, solusi: null, bulanAda: [], count: 0, total: pairs.length };

  const withReal = recs.filter(r => r.realisasi !== null && r.realisasi !== undefined && r.realisasi !== '');

  // Akumulasi: pakai nilai bulan terakhir, bukan rata-rata
  const latest = [...withReal].sort((a, b) => {
    const ta = (a.tahun||0)*100+(a.bulan||0), tb = (b.tahun||0)*100+(b.bulan||0);
    return tb - ta;
  })[0];

  const realisasi = latest ? parseFloat(latest.realisasi) : null;
  // Hitung ulang capaian dari realisasi terakhir / target_tahun (bukan ambil dari DB per bulan)
  const ind     = _kwAllIndikator.find(x => x.id === indId);
  const capaian = _kwHitungCapaian(realisasi, ind?.target_tahun, ind?.bermakna_negatif);

  return {
    realisasi, capaian,
    permasalahan: latest?.permasalahan || null,
    solusi:       latest?.solusi       || null,
    bulanAda:     withReal.map(r => r.bulan || 0),
    count:        withReal.length,
    total:        pairs.length,
  };
}

// ── Set handler untuk range from/to ──────────────────────────────────────
function _kwSetRangeFrom(key) {
  const [y, m] = key.split('-').map(Number);
  _kwRangeFrom = { bulan: m, tahun: y, key };
  _kwModePerTahun = false;
  _kwFilterMode   = 'bulan';
  // Kalau from > to, geser to ke from
  if (_kwRangeTo) {
    const toKey = _kwRangeTo.tahun * 100 + _kwRangeTo.bulan;
    if (y * 100 + m > toKey) _kwRangeTo = { ..._kwRangeFrom };
  }
  _kwSaveFilter();
  _renderKinerjaWatch();
}
function _kwSetRangeTo(key) {
  const [y, m] = key.split('-').map(Number);
  _kwRangeTo = { bulan: m, tahun: y, key };
  _kwModePerTahun = false;
  _kwFilterMode   = 'bulan';
  // Kalau to < from, geser from ke to
  if (_kwRangeFrom) {
    const fromKey = _kwRangeFrom.tahun * 100 + _kwRangeFrom.bulan;
    if (y * 100 + m < fromKey) _kwRangeFrom = { ..._kwRangeTo };
  }
  _kwSaveFilter();
  _renderKinerjaWatch();
}

// ── Handler dropdown filter tahun ────────────────────────────────────────
function _kwSetTahunDd(val) {
  if (val === 'all') {
    _kwModePerTahun = true;
    _kwSetRangeAll();
  } else {
    _kwModePerTahun = false;
    _kwSetTahunPenuh(Number(val));
  }
}

// ── Handler toggle mode filter utama: 'tahun' | 'bulan' ─────────────────
function _kwSetFilterMode(mode) {
  _kwFilterMode = mode;
  if (mode === 'tahun') {
    _kwModePerTahun = true;
    // Default: dari tahun pertama sampai tahun terakhir di list
    if (_kwTahunDari   === null) _kwTahunDari   = _kwTahunList[0] || _kwTahunPilih;
    if (_kwTahunSampai === null) _kwTahunSampai = _kwTahunList[_kwTahunList.length - 1] || _kwTahunPilih;
    _kwRangeFrom = { bulan: 1,  tahun: _kwTahunDari,  key: `${_kwTahunDari}-01` };
    _kwRangeTo   = { bulan: 12, tahun: _kwTahunSampai, key: `${_kwTahunSampai}-12` };
  } else {
    _kwModePerTahun = false;
    const thn = _kwTahunPilih || new Date().getFullYear();
    if (!_kwRangeFrom) _kwRangeFrom = { bulan: 1,  tahun: thn, key: `${thn}-01` };
    if (!_kwRangeTo)   _kwRangeTo   = { bulan: 12, tahun: thn, key: `${thn}-12` };
  }
  _kwSaveFilter();
  _renderKinerjaWatch();
}


function _kwSetTahunDari(val) {
  _kwTahunDari = Number(val);
  // Pastikan sampai >= dari
  if (_kwTahunSampai === null || _kwTahunSampai < _kwTahunDari) _kwTahunSampai = _kwTahunDari;
  // Update _kwRangeFrom/_kwRangeTo untuk kompatibilitas dengan sistem agregasi
  _kwRangeFrom = { bulan: 1,  tahun: _kwTahunDari,   key: `${_kwTahunDari}-01` };
  _kwRangeTo   = { bulan: 12, tahun: _kwTahunSampai,  key: `${_kwTahunSampai}-12` };
  _kwModePerTahun = true;
  _kwSaveFilter();
  _renderKinerjaWatch();
}
function _kwSetTahunSampai(val) {
  _kwTahunSampai = Number(val);
  // Pastikan dari <= sampai
  if (_kwTahunDari === null || _kwTahunDari > _kwTahunSampai) _kwTahunDari = _kwTahunSampai;
  _kwRangeFrom = { bulan: 1,  tahun: _kwTahunDari,   key: `${_kwTahunDari}-01` };
  _kwRangeTo   = { bulan: 12, tahun: _kwTahunSampai,  key: `${_kwTahunSampai}-12` };
  _kwModePerTahun = true;
  _kwSaveFilter();
  _renderKinerjaWatch();
}

function _kwSetTahunPenuh(tahun) {
  // Selalu set Jan–Des tahun tsb (tidak terbatas pada bulan yang ada data)
  _kwRangeFrom = { bulan: 1,  tahun, key: `${tahun}-01` };
  _kwRangeTo   = { bulan: 12, tahun, key: `${tahun}-12` };
  _kwSaveFilter();
  _renderKinerjaWatch();
}

// ── Shortcut: set range ke seluruh periode yang tersedia ──────────────────
function _kwSetRangeAll() {
  _kwRangeFrom = null;
  _kwRangeTo   = null;
  _kwSaveFilter();
  _renderKinerjaWatch();
}

const KW_STORAGE_KEY  = () => `kw_watched1_${_user?.id || 'guest'}`;
const KW_FILTER_KEY   = () => `kw_filter_${_user?.id || 'guest'}`;

// ── Helper: list bulan dari mode & nilai ──────────────────────────────────
function _kwGetBulanList(mode, val) {
  if (mode === 'bulan')   return [val];
  if (mode === 'tw')      return [1,2,3].map(i => (val - 1) * 3 + i);       // TW1=[1,2,3], TW2=[4,5,6], ...
  if (mode === 'semester') return val === 1 ? [1,2,3,4,5,6] : [7,8,9,10,11,12];
  if (mode === 'tahun')   return [1,2,3,4,5,6,7,8,9,10,11,12];
  return [val];
}

// ── Helper: label periode ─────────────────────────────────────────────────
function _kwPeriodLabel(mode, val, tahun) {
  if (mode === 'bulan')    return `${_KW_BULAN_FULL[val]} ${tahun}`;
  if (mode === 'tw')       return `Triwulan ${['I','II','III','IV'][val-1]} ${tahun}`;
  if (mode === 'semester') return `Semester ${val === 1 ? 'I' : 'II'} ${tahun}`;
  if (mode === 'tahun')    return `Tahun ${tahun}`;
  return String(tahun);
}

// ── Helper: bulan aktif/filter sekarang ───────────────────────────────────
function _kwGetCurrentVal() {
  if (_kwViewMode === 'bulan')    return _kwBulanPilih;
  if (_kwViewMode === 'tw')       return _kwTWPilih;
  if (_kwViewMode === 'semester') return _kwSemPilih;
  return _kwTahunPilih;
}

// ── Helper: agregasi data dari beberapa bulan ────────────────────────────
function _kwAggregate(indId, bulanList, tahun) {
  const recs = bulanList
    .map(b => (_kwAllRekap[tahun]?.['b' + b] || []).find(r => r.id === indId))
    .filter(Boolean);

  if (!recs.length) return { realisasi: null, capaian: null, permasalahan: null, solusi: null, bulanAda: [] };

  // Akumulasi: pakai nilai bulan terakhir, bukan rata-rata
  const withReal = recs.filter(r => r.realisasi !== null && r.realisasi !== undefined && r.realisasi !== '');

  const latest = [...withReal].sort((a, b) => (b.bulan || 0) - (a.bulan || 0))[0];

  const realisasi = latest ? parseFloat(latest.realisasi) : null;
  // Hitung ulang capaian dari realisasi terakhir / target_tahun (bukan ambil dari DB per bulan)
  const ind     = _kwAllIndikator.find(x => x.id === indId);
  const capaian = _kwHitungCapaian(realisasi, ind?.target_tahun, ind?.bermakna_negatif);

  return {
    realisasi,
    capaian,
    permasalahan: latest?.permasalahan || null,
    solusi:       latest?.solusi       || null,
    bulanAda:     withReal.map(r => r.bulan || 0),
    count:        withReal.length,
    total:        bulanList.length,
  };
}

// ── Init widget ───────────────────────────────────────────────────────────
async function _initKinerjaWatch() {
  const el = document.getElementById('kinerjaWatchWidget');
  if (!el) return;

  const pa    = getPeriodeAktif();
  const tahun = pa?.tahun || new Date().getFullYear();
  _kwTahunPilih = tahun;

  // Restore filter dari storage
  try {
    const saved = JSON.parse(localStorage.getItem(KW_FILTER_KEY()) || '{}');
    if (saved.mode)      _kwViewMode      = saved.mode;
    if (saved.bulan)     _kwBulanPilih    = saved.bulan;
    if (saved.tw)        _kwTWPilih       = saved.tw;
    if (saved.sem)       _kwSemPilih      = saved.sem;
    if (saved.rangeFrom) _kwRangeFrom     = saved.rangeFrom;
    if (saved.rangeTo)   _kwRangeTo       = saved.rangeTo;
    if (saved.chartType) _kwChartType     = saved.chartType;
    if (saved.modePerTahun !== undefined) _kwModePerTahun = saved.modePerTahun;
    if (saved.filterMode)  _kwFilterMode   = saved.filterMode;
    if (saved.tahunDari)   _kwTahunDari    = saved.tahunDari;
    if (saved.tahunSampai) _kwTahunSampai  = saved.tahunSampai;
    // Tahun TIDAK di-restore dari storage — selalu ikut periode aktif
  } catch {}

  // Set default bulan aktif dari periode
  if (pa?.bulan) _kwBulanPilih = pa.bulan;

  // Skeleton
  el.innerHTML = `<div class="kw-wrap"><div class="skeleton" style="height:280px;border-radius:14px"></div></div>`;

  try {
    // Fetch semua 12 bulan sekaligus untuk tahun aktif
    await _kwFetchTahun(tahun);

    // ── Bangun tahunList dari SEMUA periode di DB (bukan hanya yang window-nya aktif) ──
    // Penting: data tahun lama (misal 2026) tetap muncul meski window input sudah ditutup
    let tahunDariPeriode = [];
    try {
      const rAll = await fetch('/api/periode', { headers: authHeaders() });
      if (rAll.ok) {
        const dAll = await rAll.json();
        tahunDariPeriode = [...new Set((dAll.periode || []).map(p => p.tahun))]
          .filter(Boolean).sort((a, b) => a - b);
      }
    } catch {}

    // Fallback ke variabel global jika fetch gagal
    if (!tahunDariPeriode.length) {
      const srcList = (typeof _periodeList !== 'undefined' && _periodeList.length)
        ? _periodeList
        : (typeof _periodeListTerbuka !== 'undefined' ? _periodeListTerbuka : []);
      tahunDariPeriode = [...new Set(srcList.map(p => p.tahun))]
        .filter(Boolean).sort((a, b) => a - b);
    }

    // Pastikan tahun aktif selalu ada dalam list
    if (!tahunDariPeriode.includes(tahun)) tahunDariPeriode.push(tahun);
    tahunDariPeriode.sort((a, b) => a - b);
    _kwTahunList = tahunDariPeriode;

    // Sync ke _ikuTahunList — pastikan IKU filter juga punya semua tahun yg ada di Pantau Indikator
    tahunDariPeriode.forEach(t => { if (!_ikuTahunList.includes(t)) _ikuTahunList.push(t); });
    _ikuTahunList.sort((a, b) => a - b);
    // Re-render IKU filter bar supaya dropdown tahun ter-update
    if (document.getElementById('ikuGridWidget')) _renderIkuGrid(_ikuLastBulan, _ikuLastTahun, _ikuLastPa);

    // Fetch data rekap untuk semua tahun lain di background (kecuali tahun aktif yg sudah difetch)
    const _otherYears = tahunDariPeriode.filter(thn => thn !== tahun && !_kwAllRekap[thn]);
    if (_otherYears.length) {
      Promise.all(_otherYears.map(thn => _kwFetchTahun(thn).catch(() => {})))
        .then(() => _renderKinerjaWatch()).catch(() => {});
    }

    // Fetch semua indikator aktif sebagai sumber dropdown (bukan dari rekap)
    try {
      const rInd = await fetch('/api/kinerja/indikator', { headers: authHeaders() });
      if (rInd.ok) {
        const dInd = await rInd.json();
        _kwAllIndikator = (dInd.indikator || [])
          .filter(r => r.aktif !== false)
          .map(r => ({
            id:                r.id,
            indikator_kinerja: r.indikator_kinerja,
            satuan:            r.satuan,
            target_tahun:      r.target_tahun,
            target_display:    r.target_display,
            penanggung_jawab:  r.penanggung_jawab,
            group_nama:        r.group_nama,
            bermakna_negatif:  r.bermakna_negatif,
          }));
      }
    } catch { _kwAllIndikator = []; }
  } catch {
    _kwAllIndikator = [];
  }

  // Restore pilihan indikator
  try {
    const saved = parseInt(localStorage.getItem(KW_STORAGE_KEY()));
    _kwWatchedId = saved && _kwAllIndikator.find(x => x.id === saved) ? saved : null;
  } catch { _kwWatchedId = null; }

  _renderKinerjaWatch();
}

// ── Fetch 12 bulan untuk 1 tahun ─────────────────────────────────────────
async function _kwFetchTahun(tahun) {
  if (_kwAllRekap[tahun]) return; // already fetched
  _kwAllRekap[tahun] = {};

  const bulanResps = await Promise.all(
    Array.from({length: 12}, (_, i) => i + 1).map(b =>
      fetch(`/api/kinerja/rekap?bulan=${b}&tahun=${tahun}`, { headers: authHeaders() })
        .then(r => r.ok ? r.json() : { rekap: [] })
        .catch(() => ({ rekap: [] }))
    )
  );

  bulanResps.forEach((d, i) => {
    const bulan = i + 1;
    _kwAllRekap[tahun]['b' + bulan] = (d.rekap || []).map(r => ({ ...r, bulan }));
  });
}

// ── Invalidate cache rekap kinerja (dipanggil dari kinerja.js setelah simpan
//    realisasi, supaya chart "Pantau Indikator" & IKU grid fetch data fresh
//    di kunjungan dashboard berikutnya, tanpa perlu reload halaman) ─────────
function _invalidateKinerjaDashboardCache(tahun) {
  if (typeof _kwAllRekap !== 'undefined' && tahun) delete _kwAllRekap[tahun];
}

// ── Data tahunan: ambil realisasi bulan terakhir per tahun ────────────────
function _kwYearlyChartData(indId) {
  const hasil = [];
  const ind   = _kwAllIndikator.find(x => x.id === indId);
  for (const thn of _kwTahunList) {
    let latestRec = null;
    for (let b = 12; b >= 1; b--) {
      const rec = (_kwAllRekap[thn]?.['b' + b] || []).find(r => r.id === indId);
      if (rec && rec.realisasi !== null && rec.realisasi !== undefined && rec.realisasi !== '') {
        latestRec = rec;
        break;
      }
    }
    const real    = latestRec ? parseFloat(latestRec.realisasi) : null;
    const capaian = _kwHitungCapaian(real, ind?.target_tahun, ind?.bermakna_negatif);
    hasil.push({ tahun: thn, realisasi: real, capaian, target: ind?.target_tahun ? parseFloat(ind.target_tahun) : null });
  }
  return hasil;
}

// ── Chart SVG capaian per tahun ───────────────────────────────────────────
function _kwYearlyChart(yearlyData, targetDisplay, satuan) {
  if (!yearlyData.length) return '<div class="kw-empty">Belum ada data tahunan</div>';

  const W = 560, H = 210;
  const PAD = { t: 24, r: 24, b: 44, l: 52 };
  const cW  = W - PAD.l - PAD.r;
  const cH  = H - PAD.t - PAD.b;
  const n   = yearlyData.length;

  const allCap = yearlyData.map(d => d.capaian).filter(v => v !== null);
  const maxCap = allCap.length ? Math.max(120, ...allCap) : 120;
  const barW   = Math.min(44, cW / n - 14);

  const toX = i => PAD.l + (i + 0.5) * (cW / n);
  const toY = v => v === null ? null : PAD.t + cH - Math.min(v / maxCap, 1) * cH;

  // Grid lines
  let grid = '';
  [0, 25, 50, 75, 100].forEach(v => {
    const y     = toY(v);
    const is100 = v === 100;
    grid += `<line x1="${PAD.l}" y1="${y}" x2="${W - PAD.r}" y2="${y}"
      stroke="${is100 ? '#0d9488' : '#f1f5f9'}" stroke-width="${is100 ? 1.5 : 1}"
      stroke-dasharray="${is100 ? '5,3' : ''}" opacity="${is100 ? .6 : 1}"/>
    <text x="${PAD.l - 6}" y="${y + 4}" text-anchor="end" font-size="${9*_activeChartFs}" fill="#94a3b8">${v}%</text>`;
  });
  grid += `<text x="${W - PAD.r + 3}" y="${toY(100) + 4}" font-size="${8*_activeChartFs}" fill="#0d9488" opacity=".7">100%</text>`;

  // Bars + labels
  let bars = '', xLabels = '', lineD = '';
  yearlyData.forEach((d, i) => {
    const x   = toX(i);
    const y   = toY(d.capaian);
    const col = d.capaian === null ? '#e2e8f0'
      : d.capaian >= 100 ? '#10b981'
      : d.capaian >= 75  ? '#f59e0b'
      : '#ef4444';

    const bH = d.capaian !== null ? Math.max(4, (Math.min(d.capaian, maxCap) / maxCap) * cH) : 4;
    const bY = PAD.t + cH - bH;
    bars += `<rect x="${(x - barW / 2).toFixed(1)}" y="${bY.toFixed(1)}" width="${barW}" height="${bH.toFixed(1)}"
      rx="5" fill="${col}" opacity=".82"/>`;

    if (d.capaian !== null)
      bars += `<text x="${x.toFixed(1)}" y="${(bY - 5).toFixed(1)}" text-anchor="middle"
        font-size="${9*_activeChartFs}" font-weight="700" fill="${col}">${Math.round(d.capaian)}%</text>`;

    if (d.realisasi !== null && bH > 22)
      bars += `<text x="${x.toFixed(1)}" y="${(PAD.t + cH - 6).toFixed(1)}" text-anchor="middle"
        font-size="${8*_activeChartFs}" fill="rgba(255,255,255,.85)">${parseFloat(d.realisasi).toLocaleString('id-ID')}</text>`;

    xLabels += `<text x="${x.toFixed(1)}" y="${(H - PAD.b + 16).toFixed(1)}"
      text-anchor="middle" font-size="${10*_activeChartFs}" fill="#475569" font-weight="700">${d.tahun}</text>`;

    if (y !== null) lineD += (lineD === '' ? 'M' : 'L') + `${x.toFixed(1)},${y.toFixed(1)} `;
  });

  const lineSvg = lineD
    ? `<path d="${lineD.trim()}" fill="none" stroke="#f59e0b" stroke-width="2.2"
        stroke-linecap="round" stroke-linejoin="round" opacity=".9"/>` : '';

  let dots = '';
  yearlyData.forEach((d, i) => {
    const y = toY(d.capaian);
    if (y !== null)
      dots += `<circle cx="${toX(i).toFixed(1)}" cy="${y.toFixed(1)}" r="4"
        fill="#f59e0b" stroke="#fff" stroke-width="1.5"/>`;
  });

  const legend = `
    <div style="display:flex;gap:12px;font-size:0.63rem;font-weight:600;color:#64748b;flex-wrap:wrap;margin-bottom:8px">
      <span style="display:flex;align-items:center;gap:4px">
        <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#0d9488;opacity:.8"></span>Realisasi (dalam bar)
      </span>
      <span style="display:flex;align-items:center;gap:4px">
        <span style="display:inline-block;width:10px;height:3px;background:#f59e0b;border-radius:2px"></span>Capaian
      </span>
      <span style="display:flex;align-items:center;gap:4px">
        <span style="display:inline-block;width:12px;height:0;border-top:2px dashed #ef4444;border-radius:2px"></span>Target
      </span>
    </div>`;

  return legend + `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">
    ${grid}${bars}${lineSvg}${dots}${xLabels}
  </svg>`;
}

function _kwSaveFilter() {
  try {
    // Tahun tidak disimpan — selalu ikut periode aktif saat init
    localStorage.setItem(KW_FILTER_KEY(), JSON.stringify({
      mode: _kwViewMode, bulan: _kwBulanPilih, tw: _kwTWPilih, sem: _kwSemPilih,
      rangeFrom: _kwRangeFrom, rangeTo: _kwRangeTo,
      chartType: _kwChartType,
      modePerTahun: _kwModePerTahun,
      filterMode: _kwFilterMode,
      tahunDari: _kwTahunDari, tahunSampai: _kwTahunSampai,
    }));
  } catch {}
}

function _kwSave() {
  try { localStorage.setItem(KW_STORAGE_KEY(), _kwWatchedId || ''); } catch {}
}

// ── Toggle accordion item permasalahan & solusi ───────────────────────────────
function _kwToggleAcc(btn) {
  const item = btn.closest('.kw-ps-acc-item');
  const body = btn.nextElementSibling;
  const isOpen = item.classList.contains('kw-ps-acc-open');
  if (isOpen) {
    item.classList.remove('kw-ps-acc-open');
    btn.setAttribute('aria-expanded', 'false');
    body.hidden = true;
  } else {
    item.classList.add('kw-ps-acc-open');
    btn.setAttribute('aria-expanded', 'true');
    body.hidden = false;
  }
}

// ── Perubahan mode/filter ─────────────────────────────────────────────────
async function _kwSetMode(mode) {
  _kwViewMode = mode;
  _kwSaveFilter();
  // Jika butuh fetch tahun baru
  if (!_kwAllRekap[_kwTahunPilih]) {
    const el = document.getElementById('kinerjaWatchWidget');
    if (el) el.innerHTML = `<div class="kw-wrap"><div class="skeleton" style="height:280px;border-radius:14px"></div></div>`;
    await _kwFetchTahun(_kwTahunPilih);
  }
  _renderKinerjaWatch();
}

async function _kwSetBulan(val) {
  _kwBulanPilih = val; _kwSaveFilter(); _renderKinerjaWatch();
}
async function _kwSetTW(val) {
  _kwTWPilih = val; _kwSaveFilter(); _renderKinerjaWatch();
}
async function _kwSetSem(val) {
  _kwSemPilih = val; _kwSaveFilter(); _renderKinerjaWatch();
}
async function _kwSetTahun(val) {
  _kwTahunPilih = val;
  _kwSaveFilter();
  if (!_kwAllRekap[val]) {
    const el = document.getElementById('kinerjaWatchWidget');
    if (el) {
      const existing = el.querySelector('.kw-wrap');
      if (existing) {
        const ov = document.createElement('div');
        ov.style.cssText = 'position:absolute;inset:0;background:rgba(255,255,255,.75);border-radius:14px;display:flex;align-items:center;justify-content:center;z-index:5;backdrop-filter:blur(2px)';
        ov.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="#0d9488" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin .8s linear infinite"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>`;
        if (existing.style.position !== 'relative') existing.style.position = 'relative';
        existing.appendChild(ov);
      }
    }
    await _kwFetchTahun(val);
  }
  // Fetch tahun-1 di background hanya untuk data YoY — TIDAK ubah _kwTahunList
  if (val > 2020 && !_kwAllRekap[val - 1]) {
    _kwFetchTahun(val - 1).then(() => _renderKinerjaWatch()).catch(() => {});
  }
  _renderKinerjaWatch();
}

function _kwNoop() {}
function _kwSetChartType(type) {
  _kwChartType = type;
  _kwSaveFilter();
  _renderKinerjaWatch();
}
window._kwSetChartType = _kwSetChartType;
function _kwClear() {
  _kwWatchedId = null; _kwSave(); _renderKinerjaWatch();
}

// ── Polar icon helper ─────────────────────────────────────────────────────────
// bermaknaNeg: true → icon panah bawah merah (negatif), false/undefined → panah atas hijau (positif)
function _polarIcon(bermaknaNeg, size = 14) {
  if (bermaknaNeg) {
    return `<span title="Bermakna Negatif" style="display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;background:#fee2e2;border-radius:50%;flex-shrink:0;vertical-align:middle;margin-left:4px"><svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(size*0.57)}" height="${Math.round(size*0.57)}" fill="none" viewBox="0 0 24 24" stroke="#991b1b" stroke-width="2.8"><path stroke-linecap="round" stroke-linejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3"/></svg></span>`;
  }
  return `<span title="Bermakna Positif" style="display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;background:#d1fae5;border-radius:50%;flex-shrink:0;vertical-align:middle;margin-left:4px"><svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(size*0.57)}" height="${Math.round(size*0.57)}" fill="none" viewBox="0 0 24 24" stroke="#065f46" stroke-width="2.8"><path stroke-linecap="round" stroke-linejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18"/></svg></span>`;
}

function _kwBuildDdItems(list) {
  if (!list.length) return '<div class="kw-dd-empty">Tidak ada indikator</div>';
  return list.map(i => `
    <div class="kw-dd-item ${i.id === _kwWatchedId ? 'active' : ''}" onclick="_kwPickItem(${i.id})">
      <span class="kw-dd-item-name">${esc(i.indikator_kinerja)}${_polarIcon(i.bermakna_negatif, 13)}</span>
      ${i.satuan ? `<span class="kw-dd-item-satuan">${esc(i.satuan)}</span>` : ''}
    </div>`).join('');
}

// ── Helper: custom dropdown filter (mengganti <select> bawaan browser) ────
// _kwCdd(id, items, activeVal, onPickFn, opts)
//   items   : [{val, label}]
//   activeVal: nilai aktif saat ini
//   onPickFn : string nama fungsi JS, dipanggil dengan (val)
//   opts.disabled : boolean
//   opts.minW     : min-width string, default '120px'
function _kwCdd(id, items, activeVal, onPickFn, opts = {}) {
  if (opts.disabled) {
    const lbl = items[0]?.label || '—';
    return `<div class="kw-cdd kw-cdd--disabled"><span class="kw-cdd-label">${lbl}</span><svg class="kw-cdd-caret" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg></div>`;
  }
  const active = items.find(x => x.val === activeVal) || items[0];
  const mw = opts.minW || '120px';
  const rows = items.map(it => `
    <div class="kw-cdd-opt${it.val === activeVal ? ' active' : ''}" onclick="event.stopPropagation();_kwCddPick('${id}','${onPickFn}','${it.val}')">
      ${it.label}
    </div>`).join('');
  return `
    <div class="kw-cdd" id="${id}" style="min-width:${mw}" onclick="event.stopPropagation();_kwCddToggle('${id}')">
      <span class="kw-cdd-label">${active ? active.label : '—'}</span>
      <svg class="kw-cdd-caret" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>
      <div class="kw-cdd-panel" id="${id}_panel">
        ${rows}
      </div>
    </div>`;
}
function _kwCddToggle(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const isOpen = el.classList.contains('open');
  // tutup semua dulu
  document.querySelectorAll('.kw-cdd.open').forEach(d => d.classList.remove('open'));
  if (!isOpen) el.classList.add('open');
}
function _kwCddPick(id, fn, val) {
  // Simpan dulu sebelum DOM berubah
  const fnRef = window[fn];
  // Tutup panel
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
  // Panggil handler — langsung, tanpa rAF agar tidak ter-cancel oleh global click listener
  if (typeof fnRef === 'function') fnRef(val);
}
// Tutup semua kw-cdd kalau klik di luar (bukan klik di dalam panel)
document.addEventListener('click', (e) => {
  document.querySelectorAll('.kw-cdd.open').forEach(d => {
    if (!d.contains(e.target)) d.classList.remove('open');
  });
  // Tutup month-picker kalau klik di luar
  document.querySelectorAll('.kw-mp.open').forEach(mp => {
    if (!mp.contains(e.target)) mp.classList.remove('open');
  });
});

// ── Month-Picker (kalender grid bulan) ───────────────────────────────────
// Data disimpan di window._kwMpData[id] untuk hindari masalah HTML-attribute quoting
window._kwMpData = window._kwMpData || {};

function _kwMonthPicker(id, tahunList, activeVal, onPickFn, availableKeys) {
  const _BL = ['','Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  const activeY = activeVal ? parseInt(activeVal.split('-')[0]) : (tahunList[tahunList.length-1] || new Date().getFullYear());
  const activeM = activeVal ? parseInt(activeVal.split('-')[1]) : 0;
  // Simpan data ke registry — aman dari HTML-quote issues
  window._kwMpData[id] = {
    onPickFn, tahunList, activeVal: activeVal || '',
    availKeys: availableKeys ? new Set([...availableKeys]) : null,
    viewYear: activeY,
  };
  const lbl = activeVal ? `${_BL[activeM]} ${activeY}` : '— Pilih —';
  return `
    <div class="kw-mp" id="${id}" onclick="event.stopPropagation();_kwMpToggle('${id}')">
      <span class="kw-mp-label">${lbl}</span>
      <svg class="kw-mp-caret" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>
    </div>`;
}

function _kwMpToggle(id) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el.classList.contains('open')) { el.classList.remove('open'); return; }
  // Tutup semua picker lain
  document.querySelectorAll('.kw-mp.open').forEach(x => x.classList.remove('open'));
  document.querySelectorAll('.kw-cdd.open').forEach(x => x.classList.remove('open'));
  _kwMpRenderPanel(el);
  el.classList.add('open');
}

function _kwMpRenderPanel(el) {
  const _BL     = ['','Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  const id          = el.id;
  const data        = window._kwMpData?.[id] || {};
  const onPickFn    = data.onPickFn || '';
  const tahunList   = data.tahunList || [];
  const activeVal   = data.activeVal || '';
  const availKeys   = data.availKeys || null;  // Set atau null
  const viewYear    = data.viewYear || tahunList[tahunList.length-1] || new Date().getFullYear();
  const activeY     = activeVal ? parseInt(activeVal.split('-')[0]) : 0;
  const activeM     = activeVal ? parseInt(activeVal.split('-')[1]) : 0;
  const minYear     = tahunList[0] || viewYear;
  const maxYear     = tahunList[tahunList.length-1] || viewYear;

  let grid = '';
  for (let m = 1; m <= 12; m++) {
    const key = `${viewYear}-${String(m).padStart(2,'0')}`;
    const isActive    = (viewYear === activeY && m === activeM);
    const isAvail     = !availKeys || availKeys.has(key);
    // Bulan tanpa data: tetap bisa diklik tapi tampil dim (bukan disabled)
    const cls = isActive ? 'kw-mp-cell active' : 'kw-mp-cell' + (isAvail ? '' : ' kw-mp-cell--nodata');
    grid += `<div class="${cls}" onclick="event.stopPropagation();_kwMpPick('${id}','${key}')">${_BL[m]}</div>`;
  }

  const canPrev = viewYear > minYear;
  const canNext = viewYear < maxYear;

  let panel = el.querySelector('.kw-mp-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'kw-mp-panel';
    el.appendChild(panel);
  }
  panel.innerHTML = `
    <div class="kw-mp-nav">
      <button class="kw-mp-nav-btn" ${canPrev ? `onclick="event.stopPropagation();_kwMpNav('${id}',-1)"` : 'disabled'}>
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
      </button>
      <span class="kw-mp-year">${viewYear}</span>
      <button class="kw-mp-nav-btn" ${canNext ? `onclick="event.stopPropagation();_kwMpNav('${id}',1)"` : 'disabled'}>
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
      </button>
    </div>
    <div class="kw-mp-grid">${grid}</div>`;
}

function _kwMpNav(id, dir) {
  const el = document.getElementById(id);
  if (!el) return;
  const data = window._kwMpData?.[id] || {};
  const tahunList = data.tahunList || [];
  let vy = (data.viewYear || tahunList[0] || new Date().getFullYear()) + dir;
  const min = tahunList[0] || vy;
  const max = tahunList[tahunList.length-1] || vy;
  vy = Math.max(min, Math.min(max, vy));
  if (window._kwMpData[id]) window._kwMpData[id].viewYear = vy;
  _kwMpRenderPanel(el);
}

function _kwMpPick(id, key) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('open');
  const data = window._kwMpData?.[id];
  if (!data) return;
  // Update activeVal di registry
  data.activeVal = key;
  data.viewYear  = parseInt(key.split('-')[0]);
  // Update label di trigger
  const _BL = ['','Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  const [y, m] = key.split('-').map(Number);
  const labelEl = el.querySelector('.kw-mp-label');
  if (labelEl) labelEl.textContent = `${_BL[m]} ${y}`;
  // Panggil handler
  const fnRef = window[data.onPickFn];
  if (typeof fnRef === 'function') fnRef(key);
}



function _kwToggleDd() {
  const panel = document.getElementById('kwDdPanel');
  const search = document.getElementById('kwDdSearch');
  if (!panel) return;
  const isOpen = panel.style.display !== 'none';
  if (isOpen) {
    panel.style.display = 'none';
  } else {
    panel.style.display = 'block';
    if (search) { search.value = ''; _kwFilterDd(''); search.focus(); }
  }
}

function _kwFilterDd(q) {
  const list = document.getElementById('kwDdList');
  if (!list) return;
  const filtered = q.trim()
    ? _kwAllIndikator.filter(i => i.indikator_kinerja.toLowerCase().includes(q.toLowerCase()) || (i.satuan||'').toLowerCase().includes(q.toLowerCase()))
    : _kwAllIndikator;
  list.innerHTML = _kwBuildDdItems(filtered);
}

function _kwPickItem(id) {
  // Reset range saat ganti indikator agar default ulang ke first/latest
  if (id !== _kwWatchedId) {
    _kwRangeFrom    = null;
    _kwRangeTo      = null;
    // Ikuti filterMode yang aktif, jangan paksa reset
    _kwModePerTahun = (_kwFilterMode === 'tahun');
  }
  _kwWatchedId = id; _kwSave();
  const panel = document.getElementById('kwDdPanel');
  if (panel) panel.style.display = 'none';
  _renderKinerjaWatch();
}

function _kwReset() {
  _kwWatchedId = null; _kwSave();
  _renderKinerjaWatch();
}

document.addEventListener('click', function(e) {
  const dd = document.getElementById('kwCustomDd');
  if (dd && !dd.contains(e.target)) {
    const panel = document.getElementById('kwDdPanel');
    if (panel) panel.style.display = 'none';
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// RENDER UTAMA WIDGET
// ─────────────────────────────────────────────────────────────────────────────
function _renderKinerjaWatch() {
  const el = document.getElementById('kinerjaWatchWidget');
  if (!el) return;

  // Label indikator terpilih
  const selectedInd   = _kwWatchedId ? _kwAllIndikator.find(x => x.id === _kwWatchedId) : null;
  const selectedLabel = selectedInd
    ? `${esc(selectedInd.indikator_kinerja)}${selectedInd.satuan ? ' <span class="kw-dd-sel-satuan">('+esc(selectedInd.satuan)+')</span>' : ''}`
    : '<span class="kw-dd-placeholder">— Pilih indikator —</span>';

  // ── Filter bar (RANGE MODE) ────────────────────────────────────────────────
  // Kumpulkan semua periode yg ada data untuk indikator ini
  const periodeAdaData = _kwWatchedId ? _kwGetPeriodeAdaData(_kwWatchedId) : (() => {
    // Fallback: bangun dari _kwTahunList (sudah include semua tahun dari DB)
    const hasil = [];
    const tahunSrc = _kwTahunList.length ? _kwTahunList : [];
    for (const thn of tahunSrc) {
      const rekapTahun = _kwAllRekap[thn] || {};
      for (let b = 1; b <= 12; b++) {
        const recs = rekapTahun['b' + b] || [];
        if (recs.length) hasil.push({ bulan: b, tahun: thn, key: `${thn}-${String(b).padStart(2,'0')}` });
      }
    }
    // Fallback ke _periodeList jika masih kosong
    if (!hasil.length) {
      const srcList = (typeof _periodeList !== 'undefined' && _periodeList.length) ? _periodeList
        : (typeof _periodeListTerbuka !== 'undefined' ? _periodeListTerbuka : []);
      const sorted = [...srcList].sort((a,b) => a.tahun !== b.tahun ? a.tahun-b.tahun : a.bulan-b.bulan);
      for (const p of sorted) {
        if (p.tahun && p.bulan) hasil.push({ bulan: p.bulan, tahun: p.tahun, key: `${p.tahun}-${String(p.bulan).padStart(2,'0')}` });
      }
    }
    return hasil;
  })();

  // Fetch tahun yang belum ada di cache (dari periodeAdaData)
  const tahunDiperiode = [...new Set(periodeAdaData.map(p => p.tahun))];
  for (const thn of tahunDiperiode) {
    if (!_kwAllRekap[thn]) {
      // fire-and-forget, re-render setelah selesai
      _kwFetchTahun(thn).then(() => _renderKinerjaWatch()).catch(() => {});
    }
  }

  // Auto-set range hanya kalau belum pernah di-set (null) — jangan reset pilihan user
  // Skip auto-set saat mode "Semua" (per tahun) — biarkan _kwRangeFrom/To tetap null
  if (periodeAdaData.length > 0 && !_kwModePerTahun) {
    const _nowYear = new Date().getFullYear();
    if (!_kwRangeFrom) _kwRangeFrom = { bulan: 1,  tahun: _nowYear, key: `${_nowYear}-01` };  // default Jan tahun ini
    if (!_kwRangeTo)   _kwRangeTo   = { bulan: 12, tahun: _nowYear, key: `${_nowYear}-12` };  // default Des tahun ini
    // Pastikan from <= to
    if (_kwRangeFrom && _kwRangeTo) {
      const fk = _kwRangeFrom.tahun * 100 + _kwRangeFrom.bulan;
      const tk = _kwRangeTo.tahun * 100 + _kwRangeTo.bulan;
      if (fk > tk) _kwRangeTo = { ..._kwRangeFrom };
    }
  }

  // Tentukan bulanList yang aktif (cross-tahun pairs)
  // Saat mode per-tahun: rangePairs = semua periode yang ada (untuk aggr gauge/KPI)
  const rangePairs = _kwModePerTahun
    ? periodeAdaData   // semua periode — aggr akan pakai bulan terakhir tiap tahun
    : (_kwRangeFrom && _kwRangeTo)
      ? _kwGetRangePairs(_kwRangeFrom, _kwRangeTo)
      : (periodeAdaData.length ? [periodeAdaData[periodeAdaData.length-1]] : []);

  // bulanList (single tahun compat — pakai tahun terbanyak dalam range)
  const bulanList = rangePairs.map(p => p.bulan);
  // Untuk chart yg masih single-tahun, pakai tahun dari _kwRangeTo atau _kwTahunPilih
  const tahun = (_kwRangeTo?.tahun) || _kwTahunPilih;

  // Label periode
  const periodLabel = (() => {
    if (_kwModePerTahun) {
      if (_kwTahunList.length === 0) return 'Semua';
      const min = _kwTahunList[0], max = _kwTahunList[_kwTahunList.length - 1];
      return min === max ? `Tahun ${min}` : `${min} – ${max}`;
    }
    if (!_kwRangeFrom || !_kwRangeTo) return 'Belum ada data';
    if (_kwRangeFrom.key === _kwRangeTo.key) return _kwPeriodePillLabel(_kwRangeFrom);
    return `${_KW_BULAN_FULL[_kwRangeFrom.bulan]} ${_kwRangeFrom.tahun} – ${_KW_BULAN_FULL[_kwRangeTo.bulan]} ${_kwRangeTo.tahun}`;
  })();

  // Build options untuk dropdown From & To
  const periodeOptions = periodeAdaData.map(p => ({ val: p.key, label: _kwPeriodePillLabel(p) }));
  // To options: hanya periode >= from
  const fromKey = _kwRangeFrom ? (_kwRangeFrom.tahun * 100 + _kwRangeFrom.bulan) : 0;
  const periodeToOptions = periodeAdaData
    .filter(p => p.tahun * 100 + p.bulan >= fromKey)
    .map(p => ({ val: p.key, label: _kwPeriodePillLabel(p) }));

  // Dropdown filter tahun (Semua + tiap tahun) — pakai _kwCdd agar scalable
  const tahunUnik = (_kwTahunList.length ? _kwTahunList : [_kwTahunPilih]).slice().sort((a,b) => a-b);
  const _isRangeAll = _kwRangeFrom && _kwRangeTo && periodeAdaData.length > 0 &&
    _kwRangeFrom.key === periodeAdaData[0].key &&
    _kwRangeTo.key   === periodeAdaData[periodeAdaData.length-1].key;

  // Tentukan nilai aktif dropdown tahun
  const _tahunDdActive = (() => {
    if (_kwModePerTahun) return 'all';
    if (!_kwRangeFrom || !_kwRangeTo) return 'all';
    // Kalau range = Jan–Des satu tahun penuh → tampilkan tahun itu
    if (_kwRangeFrom.tahun === _kwRangeTo.tahun &&
        _kwRangeFrom.bulan === 1 && _kwRangeTo.bulan === 12) return _kwRangeFrom.tahun;
    // Fine-tune manual (range tidak tepat Jan–Des) → tampilkan "Semua"
    return 'all';
  })();

  const _tahunDdItems = [
    { val: 'all', label: 'Semua' },
    ...tahunUnik.map(t => ({ val: t, label: String(t) })),
  ];

  // Dropdown tahun — pakai _kwCdd agar scalable untuk banyak tahun
  const tahunShortcutHtml = _kwCdd('kwTahunDd', _tahunDdItems, _tahunDdActive, '_kwSetTahunDd', { minW: '100px' });

  // Keys yang tersedia untuk picker Sampai (>= fromKey)
  const availFromKeys = new Set(periodeAdaData.map(p => p.key));
  const availToKeys   = new Set(periodeAdaData.filter(p => p.tahun * 100 + p.bulan >= fromKey).map(p => p.key));

  // Filter bar HTML — dropdown mode (Tahun/Bulan) + kontrol sesuai mode
  const rangeFilterHtml = periodeAdaData.length === 0
    ? `<span style="font-size:0.75rem;color:#94a3b8;padding:4px 8px">Belum ada data periode</span>`
    : `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">

        ${/* Dropdown mode utama: Tahun | Bulan — inline onclick agar pasti terpanggil */''}
        <div class="kw-cdd" id="kwFilterModeDd" style="min-width:90px" onclick="event.stopPropagation();_kwCddToggle('kwFilterModeDd')">
          <span class="kw-cdd-label">${_kwFilterMode === 'tahun' ? 'Tahun' : 'Bulan'}</span>
          <svg class="kw-cdd-caret" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>
          <div class="kw-cdd-panel" id="kwFilterModeDd_panel">
            <div class="kw-cdd-opt${_kwFilterMode === 'tahun' ? ' active' : ''}" onclick="event.stopPropagation();_kwCddToggle('kwFilterModeDd');_kwSetFilterMode('tahun')">Tahun</div>
            <div class="kw-cdd-opt${_kwFilterMode === 'bulan' ? ' active' : ''}" onclick="event.stopPropagation();_kwCddToggle('kwFilterModeDd');_kwSetFilterMode('bulan')">Bulan</div>
          </div>
        </div>

        <div style="width:1px;height:16px;background:#e2e8f0;flex-shrink:0"></div>

        ${_kwFilterMode === 'tahun' ? (() => {
          // Pastikan state dari/sampai ada
          const tDari   = _kwTahunDari   || tahunUnik[0] || _kwTahunPilih;
          const tSampai = _kwTahunSampai || tahunUnik[tahunUnik.length-1] || _kwTahunPilih;
          const dariItems   = tahunUnik.map(t => ({ val: t, label: String(t) }));
          const sampaiItems = tahunUnik.filter(t => t >= tDari).map(t => ({ val: t, label: String(t) }));
          return `
            <span style="font-size:0.72rem;font-weight:600;color:#94a3b8;white-space:nowrap">Dari</span>
            ${_kwCdd('kwTahunDariDd', dariItems, tDari, '_kwSetTahunDari', { minW: '90px' })}
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="#cbd5e1" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
            <span style="font-size:0.72rem;font-weight:600;color:#94a3b8;white-space:nowrap">Sampai</span>
            ${_kwCdd('kwTahunSampaiDd', sampaiItems, tSampai, '_kwSetTahunSampai', { minW: '90px' })}
          `;
        })() : `
          ${/* Mode Bulan: Dari → Sampai */''}
          <span style="font-size:0.72rem;font-weight:600;color:#94a3b8;white-space:nowrap">Dari</span>
          ${_kwMonthPicker('kwMpFrom', _kwTahunList.length ? _kwTahunList : [_kwTahunPilih], _kwRangeFrom?.key || periodeOptions[0]?.val, '_kwSetRangeFrom', availFromKeys)}
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="#cbd5e1" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
          <span style="font-size:0.72rem;font-weight:600;color:#94a3b8;white-space:nowrap">Sampai</span>
          ${_kwMonthPicker('kwMpTo', _kwTahunList.length ? _kwTahunList : [_kwTahunPilih], _kwRangeTo?.key || periodeOptions[periodeOptions.length-1]?.val, '_kwSetRangeTo', availToKeys)}
        `}
      </div>`;

  // ── Header HTML ─────────────────────────────────────────────────────────────
  // Indicator selector bar (full width)
  const selInd = _kwWatchedId ? _kwAllIndikator.find(x => x.id === _kwWatchedId) : null;
  const indBarHtml = selInd ? `
    <div class="kw-ind-selector-bar kw-ind-selector-bar--active">
      <div class="kw-ind-selector-info" onclick="_kwToggleDd()" style="cursor:pointer;flex:1;min-width:0;">
        <div class="kw-ind-selector-name">${esc(selInd.indikator_kinerja)}${_polarIcon(selInd.bermakna_negatif, 15)}</div>
        <div class="kw-ind-selector-meta">
          ${selInd.group_nama ? `<span class="kw-ind-selector-tag kw-ind-selector-tag--bidang">${esc(selInd.group_nama)}</span>` : ''}
          ${selInd.penanggung_jawab ? `<span class="kw-ind-selector-tag kw-ind-selector-tag--pj">${esc(selInd.penanggung_jawab)}</span>` : ''}
          ${selInd.satuan ? `<span class="kw-ind-selector-tag">Satuan: ${esc(selInd.satuan)}</span>` : ''}
        </div>
      </div>
      <button class="kw-ind-selector-change" onclick="_kwToggleDd()" type="button">
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/></svg>
        Ganti
      </button>
      <button class="kw-ind-selector-reset" onclick="_kwReset()" type="button" title="Reset / hapus pilihan">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
      </button>
    </div>` : `
    <div class="kw-ind-selector-bar kw-ind-selector-bar--empty" onclick="_kwToggleDd()">
      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="opacity:.4"><circle cx="11" cy="11" r="8"/><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35"/></svg>
      <span>Pilih indikator yang ingin dipantau...</span>
      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="margin-left:auto;opacity:.35"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>
    </div>`;

  let html = `
    <div class="kw-wrap">
      <div class="kw-header-v2">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="opacity:.45">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
          <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
        </svg>
        <span class="kw-title-v2">Pantau Indikator</span>
        ${_kwWatchedId ? `<span class="kw-period-badge">${esc(periodLabel)}</span>` : ""}
      </div>

      <!-- Filter bar — tampil di bawah header, hanya saat indikator dipilih -->
      ${_kwWatchedId ? `
      <div class="kw-filter-row">
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:.4;flex-shrink:0"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
        <span style="font-size:0.72rem;font-weight:700;color:#64748b;white-space:nowrap">Filter Periode:</span>
        ${rangeFilterHtml}
      </div>` : ''}

      <!-- Indicator selector bar (full width) -->
      <div class="kw-custom-dd kw-custom-dd--bar" id="kwCustomDd">
        ${indBarHtml}
        <div class="kw-dd-panel" id="kwDdPanel" style="display:none">
          <div class="kw-dd-search-wrap">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" class="kw-dd-search-icon"><circle cx="11" cy="11" r="8"/><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35"/></svg>
            <input class="kw-dd-search" id="kwDdSearch" type="text" placeholder="Cari indikator..." oninput="_kwFilterDd(this.value)" autocomplete="off" />
          </div>
          <div class="kw-dd-list" id="kwDdList">
            ${_kwBuildDdItems(_kwAllIndikator)}
          </div>
        </div>
      </div>`;

  // ── Belum pilih indikator ─────────────────────────────────────────────────
  if (!_kwWatchedId) {
    html += `
      <div class="kw-empty">
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.2" opacity=".25">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
        </svg>
        <p>Klik pada bar di atas untuk memilih indikator<br>yang ingin Anda pantau detailnya.</p>
      </div>
    </div>`;
    el.innerHTML = html;
    return;
  }

  // ── Ada indikator dipilih ─────────────────────────────────────────────────
  const ind = _kwAllIndikator.find(x => x.id === _kwWatchedId);
  if (!ind) { html += `</div>`; el.innerHTML = html; return; }

  // Agregasi data sesuai range (cross-tahun)
  const aggr    = _kwAggregateRange(ind.id, rangePairs);
  const real    = aggr.realisasi;
  const cap     = aggr.capaian;
  const target  = ind.target_tahun;
  const targetDisplay = ind.target_display != null ? ind.target_display : (target !== null ? parseFloat(target) : null);
  const pct     = cap !== null ? Math.min(Math.max(cap, 0), 100) : null;
  const pctRaw  = cap !== null ? parseFloat(cap).toFixed(1) : null;

  const fmtReal = v => v !== null ? +parseFloat(v).toFixed(2) : '—';

  // Warna identik dengan logika chart bar/combo/line/area:
  // capaian% (pctRaw) dibandingkan dengan target absolut (target)
  const _tgt        = target !== null ? parseFloat(target) : null;
  const _capVal     = cap !== null ? parseFloat(cap) : null;   // nilai capaian%, mis 84.5
  const _capReached = _capVal !== null && _tgt !== null && _capVal >= _tgt;
  const _capNearby  = _capVal !== null && _tgt !== null && _capVal >= _tgt * 0.75;
  const col   = _capVal === null ? '#94a3b8' : _capReached ? '#10b981' : _capNearby ? '#f59e0b' : '#ef4444';
  const colBg = _capVal === null ? '#f1f5f9' : _capReached ? '#d1fae5' : _capNearby ? '#fef3c7' : '#fee2e2';
  const label = _capVal === null ? 'Belum diisi' : _capReached ? 'Tercapai <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px"><path d="M20 6 9 17l-5-5"/></svg>' : _capNearby ? 'Hampir Tercapai' : 'Perlu Perhatian';

  const gap    = (real !== null && target !== null) ? (target - real) : null;
  const gapStr = gap !== null ? (gap > 0 ? `Kurang ${(+gap.toFixed(2))} ${esc(ind.satuan||'')}` : 'Target terpenuhi') : '—';

  // ── Data per bulan untuk chart & tabel (cross-tahun) ─────────────────────
  // Kalau mode "Semua" (_kwModePerTahun = true): 1 entry per tahun, pakai bulan terakhir ada data
  // Kalau mode tahun tertentu: 1 entry per bulan (normal)
  const bulanChartData = (() => {
    if (_kwModePerTahun && _kwTahunList.length > 0) {
      // Agregasi per tahun — ambil realisasi bulan terakhir tiap tahun
      return _kwTahunList.map(thn => {
        const rekapTahun = _kwAllRekap[thn] || {};
        let latestRec = null;
        for (let b = 12; b >= 1; b--) {
          const rec = (rekapTahun['b' + b] || []).find(r => r.id === ind.id);
          if (rec && rec.realisasi !== null && rec.realisasi !== undefined && rec.realisasi !== '') {
            latestRec = { ...rec, bulan: b, tahun: thn };
            break;
          }
        }
        const _rvVal = latestRec ? parseFloat(latestRec.realisasi) : null;
        const _cvCalc = _kwHitungCapaian(_rvVal, ind.target_tahun, ind.bermakna_negatif);
        return {
          bulan:     latestRec?.bulan || 12,
          tahun:     thn,
          label:     String(thn),
          realisasi: (_rvVal !== null && !isNaN(_rvVal)) ? _rvVal : null,
          capaian:   (_cvCalc !== null && !isNaN(_cvCalc)) ? _cvCalc : null,
          isInRange: true,
        };
      });
    }
    // Normal: per bulan dari rangePairs
    return rangePairs.map(p => {
      const rec = (_kwAllRekap[p.tahun]?.['b' + p.bulan] || []).find(r => r.id === ind.id);
      const _rc = v => (v !== null && v !== undefined && v !== '') ? parseFloat(v) : null;
      const _rv = _rc(rec?.realisasi);
      const multiTahun = (_kwRangeFrom?.tahun !== _kwRangeTo?.tahun);
      const _rvVal = (_rv !== null && !isNaN(_rv)) ? _rv : null;
      const _cvCalc = _kwHitungCapaian(_rvVal, ind.target_tahun, ind.bermakna_negatif);
      return {
        bulan:       p.bulan,
        tahun:       p.tahun,
        label:       multiTahun ? `${_KW_BULAN_LABEL[p.bulan]} '${String(p.tahun).slice(-2)}` : _KW_BULAN_LABEL[p.bulan],
        realisasi:   _rvVal,
        capaian:     (_cvCalc !== null && !isNaN(_cvCalc)) ? _cvCalc : null,
        isInRange:   true,
      };
    });
  })();
  // Untuk sparkline & proyeksi — pakai semua 12 bulan dari tahun akhir range
  const bulanChartDataFull = Array.from({length:12}, (_, i) => {
    const b   = i + 1;
    const rec = (_kwAllRekap[tahun]?.['b' + b] || []).find(r => r.id === ind.id);
    const _rc = v => (v !== null && v !== undefined && v !== '') ? parseFloat(v) : null;
    const _rv = _rc(rec?.realisasi);
    const _rvVal = (_rv !== null && !isNaN(_rv)) ? _rv : null;
    const _cvCalc = _kwHitungCapaian(_rvVal, ind.target_tahun, ind.bermakna_negatif);
    return {
      bulan: b, tahun, label: _KW_BULAN_LABEL[b],
      realisasi: _rvVal,
      capaian:   (_cvCalc !== null && !isNaN(_cvCalc)) ? _cvCalc : null,
      isInRange: bulanList.includes(b),
    };
  });

  // Data diisi count dalam range
  const dataCount = bulanChartData.filter(d => d.realisasi !== null).length;

  // ── Gauge ──────────────────────────────────────────────────────────────────
  const gauge = _kwGauge(pct, col, colBg);

  // ── Bar chart per bulan (pakai data range yg mungkin lintas tahun) ────────
  const barChart = _kwBarChart(bulanChartData, bulanList, target);

  // ── Tabel per periode ──────────────────────────────────────────────────────
  const nowBulan = new Date().getMonth() + 1;
  const nowTahun = new Date().getFullYear();
  const tableRows = bulanChartData
    .map(d => {
      const c  = d.capaian !== null ? parseFloat(d.capaian).toFixed(1) : null;
      const tc = d.capaian === null ? '#94a3b8' : d.capaian >= 100 ? '#10b981' : d.capaian >= 75 ? '#f59e0b' : '#ef4444';
      const barW = c !== null ? Math.min(c, 100) : 0;
      const isFuture  = d.tahun > nowTahun || (d.tahun === nowTahun && d.bulan > nowBulan);
      const isActive  = d.realisasi !== null;
      const rowClass  = isActive ? 'kw-tw-row kw-tw-row--active' : (isFuture ? 'kw-tw-row kw-tw-row--future' : 'kw-tw-row');
      const rowLabel  = (_kwRangeFrom?.tahun !== _kwRangeTo?.tahun)
        ? `${_KW_BULAN_FULL[d.bulan]} ${d.tahun}`
        : _KW_BULAN_FULL[d.bulan];
      return `
        <div class="${rowClass}">
          <span class="kw-tw-label">${rowLabel}</span>
          <span class="kw-tw-real">${d.realisasi !== null ? fmtReal(d.realisasi) + ' ' + esc(ind.satuan||'') : isFuture ? '<span class="kw-future-tag">–</span>' : '—'}</span>
          <span class="kw-tw-cap-wrap">
            <span class="kw-tw-cap" style="color:${tc}">${c !== null ? c+'%' : '—'}</span>
            ${c !== null ? `<span class="kw-tw-minibar-wrap"><span class="kw-tw-minibar" style="width:${barW}%;background:${tc}"></span></span>` : ''}
          </span>
        </div>`;
    }).join('');

  // ── KPI Strip: 4 kartu horizontal ──────────────────────────────────────────
  const periodShortLabel = (() => {
    if (!_kwRangeFrom || !_kwRangeTo) return '—';
    if (_kwRangeFrom.key === _kwRangeTo.key) return `${_KW_BULAN_LABEL[_kwRangeFrom.bulan]} ${_kwRangeFrom.tahun}`;
    return `${_KW_BULAN_LABEL[_kwRangeFrom.bulan]}'${String(_kwRangeFrom.tahun).slice(-2)}–${_KW_BULAN_LABEL[_kwRangeTo.bulan]}'${String(_kwRangeTo.tahun).slice(-2)}`;
  })();
  const gapDisplay = gap !== null ? (gap > 0 ? `+${(+gap.toFixed(2))} ${esc(ind.satuan||'')}` : `Terpenuhi <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px"><path d="M20 6 9 17l-5-5"/></svg>`) : '—';
  const gapColor   = gap === null ? '#94a3b8' : gap > 0 ? '#ef4444' : '#10b981';
  const dataStatus = dataCount === rangePairs.length ? 'Lengkap' : dataCount === 0 ? 'Perlu input' : `${dataCount}/${rangePairs.length}`;
  const dataStatusColor = dataCount === 0 ? '#ef4444' : dataCount < rangePairs.length ? '#f59e0b' : '#10b981';

  // ── Sparkline (dari data range, bukan 12 bulan tetap) ─────────────────────
  const sparkVals = bulanChartData.map(d => d.capaian);
  const sparkLine = (() => {
    const W2 = 80, H2 = 24;
    const pts = sparkVals.map((v, i) => {
      const x = sparkVals.length > 1 ? (i / (sparkVals.length - 1)) * W2 : W2 / 2;
      const y = v !== null ? H2 - (Math.min(v, 120) / 120) * H2 : null;
      return { x, y, v };
    }).filter(p => p.y !== null);
    if (pts.length < 2) return '';
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    return `<svg viewBox="0 0 ${W2} ${H2}" width="${W2}" height="${H2}" style="display:inline-block;vertical-align:middle;margin-left:6px"><path d="${d}" fill="none" stroke="${col}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" opacity=".7"/><circle cx="${pts[pts.length-1].x.toFixed(1)}" cy="${pts[pts.length-1].y.toFixed(1)}" r="2.5" fill="${col}"/></svg>`;
  })();

  // ── Proyeksi rata-rata dari data range ────────────────────────────────────
  const filledData = bulanChartData.filter(d => d.capaian !== null);
  const lastFilledBulan = filledData.length ? filledData[filledData.length - 1].bulan : null;
  const avgCapaian = filledData.length ? filledData.reduce((s, d) => s + d.capaian, 0) / filledData.length : null;
  const proyeksiColor = avgCapaian === null ? '#94a3b8' : avgCapaian >= 100 ? '#10b981' : avgCapaian >= 75 ? '#f59e0b' : '#ef4444';

  // ── Combo chart: bar realisasi + line capaian (semua mode, termasuk per tahun) ──
  _activeChartFs = _KW_CHART_FS;
  const comboChart = _kwComboChart(bulanChartData, bulanList, target, targetDisplay, ind.satuan);

  // ── KPI strip: 4 kartu baru ────────────────────────────────────────────────
  const summaryCards = `
    <div class="kw-kpi-grid-v2">
      <div class="kw-kpi-card kw-kpi-card--hero" style="--kc:${col};--kc-bg:${colBg}">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:4px;margin-top:0">
          <div>
            <div style="font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#94a3b8;margin-bottom:4px">Capaian ${periodShortLabel}</div>
            <div style="font-size:1.8rem;font-weight:900;color:${col};line-height:1;letter-spacing:-.03em">${pctRaw !== null ? pctRaw+'%' : '—'}</div>
            <div style="margin-top:5px;font-size:0.7rem;font-weight:600;color:${col};display:flex;align-items:center;gap:4px">
              <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${col}"></span>${label}
            </div>
          </div>
          ${sparkLine ? `<div style="opacity:.8">${sparkLine}</div>` : ''}
        </div>
        <div style="margin-top:8px">
          <div style="height:5px;border-radius:99px;background:${colBg};overflow:hidden">
            <div style="height:100%;border-radius:99px;background:${col};width:${pct ?? 0}%;transition:width .5s ease"></div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:0.75rem;color:#94a3b8;margin-top:4px"><span>0%</span><span>50%</span><span>100%</span></div>
        </div>
      </div>

      <div class="kw-kpi-card" style="--kc:#3b82f6">
        <div style="margin-top:0">
          <div style="font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#94a3b8;margin-bottom:4px">Realisasi</div>
          <div style="font-size:1.8rem;font-weight:800;color:#0f172a;line-height:1;letter-spacing:-.02em">${fmtReal(real)}</div>
          <div style="font-size:0.75rem;color:#64748b;margin-top:4px">Satuan: <b>${esc(ind.satuan||'–')}</b></div>
        </div>
        <div style="margin-top:10px;padding-top:8px;border-top:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center">
          <div style="font-size:0.78rem;color:#94a3b8">Target Tahun</div>
          <div style="font-size:1rem;font-weight:700;color:#3b82f6">${targetDisplay !== null ? targetDisplay : '—'}</div>
        </div>
      </div>

      <div class="kw-kpi-card" style="--kc:${gapColor}">
        <div style="margin-top:0">
          <div style="font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#94a3b8;margin-bottom:4px">Gap ke Target</div>
          <div style="font-size:1.8rem;font-weight:800;color:${gapColor};line-height:1;letter-spacing:-.02em">${gap !== null ? (gap > 0 ? '+'+(+parseFloat(gap).toFixed(2)) : '✓') : '—'}</div>
          <div style="font-size:0.75rem;color:${gapColor};margin-top:4px;font-weight:600">${gap === null ? 'Data kosong' : gap > 0 ? 'Perlu ditingkatkan' : 'Target tercapai'}</div>
        </div>
        <div style="margin-top:10px;padding-top:8px;border-top:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center">
          <div style="font-size:0.78rem;color:#94a3b8">Rata-rata capaian</div>
          <div style="font-size:1rem;font-weight:700;color:${proyeksiColor}">${avgCapaian !== null ? parseFloat(avgCapaian).toFixed(1)+'%' : '—'}</div>
        </div>
      </div>

      <div class="kw-kpi-card" style="--kc:${dataStatusColor}">
        <div style="margin-top:0">
          <div style="font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#94a3b8;margin-bottom:4px">Data Diisi</div>
          <div style="font-size:1.8rem;font-weight:800;color:${dataStatusColor};line-height:1;letter-spacing:-.02em">${dataCount}<span style="font-size:0.9rem;font-weight:400;color:#94a3b8"> / ${rangePairs.length}</span></div>
          <div style="font-size:0.75rem;color:${dataStatusColor};margin-top:4px;font-weight:600">${dataCount === 0 ? 'Perlu input' : dataCount < rangePairs.length ? 'Sebagian terisi' : 'Lengkap'}</div>
        </div>
        <div style="margin-top:10px">
          <div style="height:4px;border-radius:99px;background:#f1f5f9;overflow:hidden">
            <div style="height:100%;border-radius:99px;background:${dataStatusColor};width:${rangePairs.length > 0 ? Math.round(dataCount/rangePairs.length*100) : 0}%;transition:width .5s"></div>
          </div>
        </div>
      </div>
    </div>`;

  // ── Build full body ────────────────────────────────────────────────────────
  html += summaryCards;

  html += `
    <div class="kw-body-redesign">

      <!-- Kiri: Gauge besar + stat row + tabel bulan -->
      <div class="kw-col-left">

        <!-- Gauge card -->
        <div class="kw-card-panel">
          <div class="kw-panel-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            Status Capaian
          </div>
          <div style="display:flex;align-items:center;justify-content:center;gap:16px;flex-wrap:wrap">
            <div style="flex-shrink:0;align-self:center;display:flex;align-items:center;justify-content:center">${gauge}</div>
            <div style="flex:1;min-width:120px">
              <div style="font-size:0.63rem;text-transform:uppercase;letter-spacing:.07em;color:#94a3b8;font-weight:700;margin-bottom:2px">Realisasi</div>
              <div style="font-size:1.7rem;font-weight:900;color:#0f172a;letter-spacing:-.02em">${fmtReal(real)} <span style="font-size:0.75rem;color:#94a3b8;font-weight:400">${esc(ind.satuan||'')}</span></div>
              <div style="margin:8px 0 2px;font-size:0.63rem;text-transform:uppercase;letter-spacing:.07em;color:#94a3b8;font-weight:700">Target</div>
              <div style="font-size:1.7rem;font-weight:900;color:#3b82f6;letter-spacing:-.02em">${targetDisplay !== null ? targetDisplay : '—'} <span style="font-size:0.75rem;color:#94a3b8;font-weight:400">${esc(ind.satuan||'')}</span></div>
              <div style="margin-top:10px">
                <div class="kw-gauge-label" style="color:${col};background:${colBg};border:1px solid ${col}30;display:inline-flex">${label}</div>
              </div>
            </div>
          </div>

          <!-- Progress bar styled -->
          <div style="margin-top:12px">
            <div style="display:flex;justify-content:space-between;font-size:0.85rem;font-weight:600;color:#475569;margin-bottom:6px">
              <span>Progress ke Target</span>
              <span style="color:${col}">${pct !== null ? parseFloat(pct).toFixed(1)+'%' : '—'}</span>
            </div>
            <div style="height:10px;border-radius:99px;background:${colBg};overflow:hidden;position:relative">
              <div style="height:100%;border-radius:99px;background:linear-gradient(90deg,${col}aa,${col});width:${pct ?? 0}%;transition:width .5s ease"></div>
              <div style="position:absolute;top:0;bottom:0;left:75%;width:2px;background:rgba(0,0,0,.12);border-radius:2px"></div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:0.75rem;color:#cbd5e1;margin-top:4px"><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div>
          </div>

          ${gap !== null ? `
          <div style="margin-top:10px;padding:8px 12px;border-radius:10px;font-size:0.75rem;font-weight:600;display:flex;align-items:center;gap:7px;color:${gap > 0 ? '#ef4444' : '#10b981'};background:${gap > 0 ? '#fef2f2' : '#f0fdf4'};border:1px solid ${gap > 0 ? '#fecaca' : '#bbf7d0'}">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${gap > 0 ? '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/>' : '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>'}
            </svg>${gapStr}
          </div>` : ''}
        </div>

        <!-- Tabel bulan -->
        ${bulanChartData.length ? `
        <div class="kw-card-panel" style="padding:0;overflow:hidden">
          <div style="padding:10px 14px 8px;border-bottom:1px solid #f1f5f9">
            <div class="kw-panel-title" style="margin-bottom:0">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/></svg>
              ${_kwModePerTahun ? 'Capaian per Tahun' : 'Data per Periode'}
            </div>
          </div>
          <table class="kw-month-table-v2" style="margin-top:0">
            <thead><tr>
              <th style="padding-left:14px">Periode</th>
              <th>Realisasi</th>
              <th>Target</th>
              <th>Capaian</th>
            </tr></thead>
            <tbody>${
              bulanChartData.map(d => {
                const c  = d.capaian !== null ? parseFloat(d.capaian).toFixed(1) : null;
                const tc = d.capaian === null ? '#94a3b8' : d.capaian >= 100 ? '#10b981' : d.capaian >= 75 ? '#f59e0b' : '#ef4444';
                const cellLabel = _kwModePerTahun
                  ? d.label   // sudah = string tahun, mis "2026"
                  : (_kwRangeFrom?.tahun !== _kwRangeTo?.tahun)
                    ? `${_KW_BULAN_FULL[d.bulan]} ${d.tahun}`
                    : _KW_BULAN_FULL[d.bulan];
                const isFuture = _kwModePerTahun
                  ? d.tahun > new Date().getFullYear()
                  : d.tahun > new Date().getFullYear() || (d.tahun === new Date().getFullYear() && d.bulan > new Date().getMonth() + 1);
                const isActive = d.realisasi !== null;
                const barPct   = c !== null ? Math.min(parseFloat(c), 100) : 0;
                return `<tr style="${isActive ? 'background:#f0fdf4' : isFuture ? 'opacity:.45' : ''}">
                  <td style="padding-left:14px"><div class="kw-month-label-cell">
                    <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${isActive ? '#0d9488' : '#e2e8f0'};flex-shrink:0"></span>
                    <span style="font-weight:${isActive?'700':'400'}">${cellLabel}</span>
                  </div></td>
                  <td style="font-weight:${isActive?'700':'400'};color:${isActive?'#0f172a':'#94a3b8'}">${d.realisasi !== null ? fmtReal(d.realisasi) : '<span style="color:#cbd5e1">–</span>'}</td>
                  <td style="color:#3b82f6;font-weight:600">${targetDisplay !== null ? targetDisplay : '<span style="color:#cbd5e1">–</span>'}</td>
                  <td>
                    ${c !== null ? `
                    <div style="display:flex;align-items:center;gap:6px">
                      <span class="kw-cap-pill-v2" style="background:${tc}20;color:${tc};font-weight:700;min-width:40px;text-align:center">${c}%</span>
                      <div style="flex:1;height:4px;border-radius:99px;background:#f1f5f9;min-width:36px"><div style="height:100%;border-radius:99px;background:${tc};width:${barPct}%"></div></div>
                    </div>` : '<span style="color:#cbd5e1">–</span>'}
                  </td>
                </tr>`;
              }).join('')
            }</tbody>
          </table>
          <div style="padding:8px 14px;display:flex;gap:14px;font-size:.63rem;color:#94a3b8;border-top:1px solid #f8fafc">
            <span style="display:flex;align-items:center;gap:4px"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#0d9488"></span>Data terisi</span>
            <span style="display:flex;align-items:center;gap:4px"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#e2e8f0;border:1px solid #cbd5e1"></span>Belum bisa diisi</span>
          </div>
        </div>` : ''}

      </div>

      <!-- Kanan: combo chart + permasalahan + solusi -->
      <div class="kw-col-right">

        <!-- Combo chart card -->
        <div class="kw-card-panel" style="padding-bottom:8px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:6px">
            <div class="kw-panel-title" style="margin-bottom:0">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
              Tren Realisasi & Capaian ${_kwModePerTahun ? '(Semua Tahun)' : tahun}
            </div>
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
              <!-- Chart type dropdown -->
              ${(() => {
                const _radarDataCount = bulanChartData.filter(d => d.isInRange).length;
                const _radarAvail = _radarDataCount >= 3;
                if (!_radarAvail && _kwChartType === 'radar') _kwChartType = 'bar';
                const chartItems = [
                  {val:'line',  label:'Line'},
                  {val:'bar',   label:'Bar'},
                  {val:'area',  label:'Area'},
                  {val:'bullet', label:'Bullet'},
                  ...(_radarAvail ? [{val:'radar', label:'Radar'}] : []),
                ];
                return `<div style="display:flex;align-items:center;gap:6px">
                  <span style="font-size:0.63rem;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em">Tipe Chart</span>
                  ${_kwCdd('kwChartTypeDd', chartItems, _kwChartType, '_kwSetChartType', {minW:'90px'})}
                </div>`;
              })()}
              <!-- Legend -->
              ${(() => {
                const tVal = target !== null ? parseFloat(target) : null;
                const t75  = tVal !== null ? (tVal * 0.75).toFixed(1).replace(/\.0$/,'') : null;
                const tLbl = targetDisplay !== null ? targetDisplay : (tVal !== null ? tVal : null);
                const dot  = (r, bg) => `<span style="display:inline-block;width:${r};border-radius:2px;background:${bg}"></span>`;
                const dotR = (bg) => `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${bg}"></span>`;
                const item = (swatch, label) => `<span style="display:flex;align-items:center;gap:4px">${swatch}${label}</span>`;

                if (_kwChartType === 'bullet') {
                  return `<div style="display:flex;gap:10px;font-size:0.63rem;font-weight:600;color:#64748b;flex-wrap:wrap;align-items:center">
                    ${item(`<span style="display:inline-block;width:14px;height:8px;border-radius:2px;background:#fef2f2;border:1px solid #fecaca"></span>`, tVal !== null ? `&lt; ${t75}` : 'Di bawah 75% target')}
                    ${item(`<span style="display:inline-block;width:14px;height:8px;border-radius:2px;background:#fffbeb;border:1px solid #fde68a"></span>`, tVal !== null ? `${t75}–${tLbl}` : '75–100% target')}
                    ${item(`<span style="display:inline-block;width:14px;height:8px;border-radius:2px;background:#f0fdf4;border:1px solid #bbf7d0"></span>`, tVal !== null ? `≥ ${tLbl}` : 'Tercapai')}
                    ${item(`<span style="display:inline-block;width:4px;height:12px;border-radius:2px;background:#6366f1"></span>`, tLbl !== null ? `Target (${tLbl})` : 'Target')}
                  </div>`;
                }
                if (_kwChartType === 'radar') {
                  return `<div style="display:flex;gap:10px;font-size:0.63rem;font-weight:600;color:#64748b;flex-wrap:wrap;align-items:center">
                    ${item(dotR('#10b981'), tVal !== null ? `≥ ${tLbl}` : '≥ Target')}
                    ${item(dotR('#f59e0b'), tVal !== null ? `${t75}–${tLbl}` : '75–100% target')}
                    ${item(dotR('#ef4444'), tVal !== null ? `&lt; ${t75}` : '&lt; 75% target')}
                    ${item(`<span style="display:inline-block;width:14px;height:0;border-top:2px dashed #6366f1"></span>`, tLbl !== null ? `Target (${tLbl})` : 'Target')}
                  </div>`;
                }
                // bar | line | area
                return `<div style="display:flex;gap:10px;font-size:0.63rem;font-weight:600;color:#64748b;flex-wrap:wrap;align-items:center">
                  ${item(`<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#10b981"></span>`, tVal !== null ? `≥ ${tLbl}` : '≥ Target')}
                  ${item(`<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#f59e0b"></span>`, tVal !== null ? `${t75}–${tLbl}` : '75–100% target')}
                  ${item(`<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#ef4444"></span>`, tVal !== null ? `&lt; ${t75}` : '&lt; 75% target')}
                  ${item(`<span style="display:inline-block;width:14px;height:0;border-top:2px dashed #6366f1"></span>`, tLbl !== null ? `Target (${tLbl})` : 'Target')}
                </div>`;
              })()}
            </div>
          </div>
          ${comboChart}
        </div>

        <!-- Permasalahan & Solusi per Bulan -->
        ${(() => {
          // Kumpulkan bulan yang ada permasalahan atau solusi
          const psItems = bulanChartData.filter(d => {
            const rec = (_kwAllRekap[d.tahun]?.['b'+d.bulan]||[]).find(r=>r.id===ind.id);
            return rec?.permasalahan || rec?.solusi;
          }).map(d => {
            const rec = (_kwAllRekap[d.tahun]?.['b'+d.bulan]||[]).find(r=>r.id===ind.id);
            return { label: d.label, permasalahan: rec?.permasalahan||null, solusi: rec?.solusi||null };
          });

          const panelHeader = `
            <div style="padding:10px 14px 8px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px">
              <div class="kw-panel-title" style="margin-bottom:0">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
                Permasalahan &amp; Solusi per Bulan
              </div>
              <div style="display:flex;gap:10px;font-size:0.63rem;font-weight:600;color:#64748b;flex-wrap:wrap">
                <span style="display:flex;align-items:center;gap:4px">
                  <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#f97316"></span>Ada permasalahan
                </span>
                <span style="display:flex;align-items:center;gap:4px">
                  <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#0d9488"></span>Ada solusi
                </span>
              </div>
            </div>`;

          if (!psItems.length) return `
            <div class="kw-card-panel" style="padding:0;overflow:hidden">
              ${panelHeader}
              <div style="padding:14px">
                <div class="kw-detail-box kw-ok" style="margin-top:0">
                  <div class="kw-detail-label" style="color:${real !== null ? '#10b981' : '#94a3b8'}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>
                    ${real !== null ? 'Tidak ada permasalahan dilaporkan' : 'Data belum diisi untuk periode ini'}
                  </div>
                </div>
              </div>
            </div>`;
          const accId = 'kwPsAcc_' + ind.id;
          return `<div class="kw-card-panel" style="padding:0;overflow:hidden">
            ${panelHeader}
            <div class="kw-ps-wrap" id="${accId}" style="border:none;border-radius:0;margin:0">
            ${psItems.map((item, idx) => {
              const itemId = accId + '_' + idx;
              const openByDefault = idx === psItems.length - 1; // buka bulan terakhir secara default
              return `
            <div class="kw-ps-acc-item${openByDefault ? ' kw-ps-acc-open' : ''}">
              <button type="button" class="kw-ps-acc-header" onclick="_kwToggleAcc(this)" aria-expanded="${openByDefault}" aria-controls="${itemId}">
                <span class="kw-ps-acc-month">${esc(item.label)}</span>
                <span class="kw-ps-acc-dots">
                  ${item.permasalahan ? '<span class="kw-ps-dot kw-ps-dot--masalah" title="Ada permasalahan"></span>' : ''}
                  ${item.solusi       ? '<span class="kw-ps-dot kw-ps-dot--solusi"  title="Ada solusi"></span>'       : ''}
                </span>
                <svg class="kw-ps-acc-chevron" xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>
              </button>
              <div class="kw-ps-acc-body" id="${itemId}" ${openByDefault ? '' : 'hidden'}>
                ${item.permasalahan ? `
                <div class="kw-detail-box kw-masalah" style="margin-bottom:${item.solusi?'6px':'0'}">
                  <div class="kw-detail-label">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
                    Permasalahan
                  </div>
                  <div class="kw-detail-text">${esc(item.permasalahan)}</div>
                </div>` : ''}
                ${item.solusi ? `
                <div class="kw-detail-box kw-solusi">
                  <div class="kw-detail-label" style="color:#0f766e">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>
                    Solusi / Tindak Lanjut
                  </div>
                  <div class="kw-detail-text" style="color:#134e4a">${esc(item.solusi)}</div>
                </div>` : `
                <div style="font-size:0.75rem;color:#94a3b8;font-style:italic;padding:2px 0">Belum ada solusi dilaporkan</div>`}
              </div>
            </div>${idx < psItems.length-1 ? '<hr class="kw-ps-divider">' : ''}`;
            }).join('')}
          </div></div>`;
        })()}

      </div>
    </div>
  </div>`;

  el.innerHTML = html;
}

// ── Donut chart SVG ────────────────────────────────────────────────────────────
function _kwGauge(pct, col, colBg) {
  const cx = 110, cy = 110, R = 82, strokeW = 13;
  const safePct = pct !== null ? Math.min(Math.max(pct, 0), 100) : 0;
  const circ = 2 * Math.PI * R;
  const filled = circ * (safePct / 100);
  const empty  = circ - filled;
  const trackCol = colBg || (pct === null ? '#f1f5f9' : '#fee2e2');
  const toRad = d => d * Math.PI / 180;
  const segments = ''; // garis pemisah dihilangkan
  const endA = toRad(-90 + 360 * safePct / 100);
  const dotX = (cx + R * Math.cos(endA)).toFixed(1);
  const dotY = (cy + R * Math.sin(endA)).toFixed(1);
  return `
    <svg viewBox="0 0 220 220" width="245" height="245" style="display:block;margin:0 auto">
      <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${trackCol}" stroke-width="${strokeW}"/>
      ${safePct > 0 ? `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${col}" stroke-width="${strokeW}" stroke-linecap="round" stroke-dasharray="${filled.toFixed(2)} ${empty.toFixed(2)}" transform="rotate(-90 ${cx} ${cy})" opacity=".95"/>` : ''}
      ${safePct > 0 && safePct < 100 ? `<circle cx="${dotX}" cy="${dotY}" r="9" fill="${col}" opacity=".25"/>` : ''}
      ${segments}
      <text x="${cx}" y="${cy - 6}" text-anchor="middle" font-size="${pct !== null && parseFloat(pct).toFixed(1).length >= 5 ? 28 : 34}" font-weight="800" fill="${pct !== null ? col : '#94a3b8'}" style="font-family:inherit">${pct !== null ? parseFloat(pct).toFixed(1)+'%' : '—'}</text>
      <text x="${cx}" y="${cy + 16}" text-anchor="middle" font-size="${11*_activeChartFs}" fill="#b0bec5" letter-spacing="2" style="text-transform:uppercase;font-family:inherit">CAPAIAN</text>
    </svg>`;
}
// ── (legacy stub, replaced above) ─────────────────────────────────────────────
function _kwGauge_UNUSED(pct, col) {
  const R = 62, cx = 80, cy = 78;
  const startAngle = -200, totalAngle = 220;
  const toRad = d => d * Math.PI / 180;
  const polar = (a, r) => [cx + r * Math.cos(toRad(a)), cy + r * Math.sin(toRad(a))];

  const arcPath = (from, to, r) => {
    const [x1,y1] = polar(from, r);
    const [x2,y2] = polar(to, r);
    const large = (to - from) > 180 ? 1 : 0;
    return `M${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large},1 ${x2.toFixed(2)},${y2.toFixed(2)}`;
  };

  const fillAngle = startAngle + totalAngle * Math.min((pct ?? 0) / 100, 1);
  const endAngle  = startAngle + totalAngle;

  const milestones = [25, 50, 75, 100].map(v => {
    const a = startAngle + totalAngle * (v / 100);
    const [mx, my] = polar(a, R + 14);
    const fs = v === 100 ? 7.5 : 7;
    return `<text x="${mx.toFixed(1)}" y="${my.toFixed(1)}" text-anchor="middle" font-size="${fs}" fill="${v === 75 ? '#f59e0b' : '#cbd5e1'}" dominant-baseline="middle">${v}%</text>`;
  }).join('');

  const ticks = [25, 50, 75].map(v => {
    const a = startAngle + totalAngle * (v / 100);
    const [x1,y1] = polar(a, R - 6);
    const [x2,y2] = polar(a, R + 6);
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#e2e8f0" stroke-width="1.5"/>`;
  }).join('');

  return `
    <svg viewBox="0 0 160 96" width="200" height="120" style="display:block;margin:0 auto">
      <path d="${arcPath(startAngle, endAngle, R)}" fill="none" stroke="#e2e8f0" stroke-width="11" stroke-linecap="round"/>
      <path d="${arcPath(startAngle, endAngle, R)}" fill="none" stroke="#e2e8f0" stroke-width="11" stroke-linecap="round"/>
      ${pct !== null && pct > 0 ? `<path d="${arcPath(startAngle, fillAngle, R)}" fill="none" stroke="${col}" stroke-width="11" stroke-linecap="round" opacity=".95"/>` : ''}
      ${pct !== null && pct > 0 ? (() => { const [gx,gy] = polar(fillAngle, R); return `<circle cx="${gx.toFixed(1)}" cy="${gy.toFixed(1)}" r="6" fill="${col}" opacity=".3"/>` })() : ''}
      ${ticks}
      ${milestones}
      <text x="${cx}" y="${cy - 12}" text-anchor="middle" font-size="${26*_activeChartFs}" font-weight="800" fill="${col}" style="font-family:inherit">${pct !== null ? parseFloat(pct).toFixed(1)+'%' : '—'}</text>
      <text x="${cx}" y="${cy + 6}" text-anchor="middle" font-size="${8*_activeChartFs}" fill="#94a3b8" letter-spacing="1" style="text-transform:uppercase">Capaian</text>
      <text x="12" y="${cy + 16}" text-anchor="middle" font-size="7.5" fill="#94a3b8">0%</text>
    </svg>`;
}

// ── Bar chart per bulan (baru, menggantikan line chart TW) ────────────────────
function _kwBarChart(data, activeRange, target) {
  const W = 660, H = 365, PL = 46, PR = 18, PT = 26, PB = 46;
  const iW = W - PL - PR, iH = H - PT - PB;

  const tgtF  = target !== null && target !== undefined ? parseFloat(target) : null;
  const rVals = data.map(d => d.realisasi).filter(v => v !== null).map(Number);
  const maxV  = tgtF !== null
    ? Math.max(tgtF * 1.15, ...rVals, 0.1)
    : Math.max(...rVals, 0.1) * 1.15;

  const n     = data.length || 12;
  const barW  = (iW / n) * 0.65;
  const xOf   = i => PL + (i + 0.5) * (iW / n);
  const yOf   = v => PT + iH - (v / maxV) * iH;

  // Grid Y
  const y0 = yOf(0);
  let grid = '<line x1="' + PL + '" y1="' + y0.toFixed(1) + '" x2="' + (W-PR) + '" y2="' + y0.toFixed(1) + '" stroke="#e2e8f0" stroke-width=".6"/>';

  // Garis target pada nilai absolut target
  if (tgtF !== null) {
    const yTgt = yOf(Math.min(tgtF, maxV)).toFixed(1);
    grid += '<line x1="' + PL + '" y1="' + yTgt + '" x2="' + (W - PR) + '" y2="' + yTgt + '" stroke="#6366f1" stroke-width="1.2" stroke-dasharray="5,3" opacity=".85"/>';
  }

  // Bars
  let bars = '', xlbls = '';
  data.forEach((d, i) => {
    const x       = xOf(i);
    const isRange = d.isInRange;
    const lbl     = d.label;

    if (isRange) {
      xlbls += `<rect x="${(x-14).toFixed(1)}" y="${(H-PB+4).toFixed(1)}" width="28" height="16" rx="8" fill="#0d9488" opacity=".13"/>`;
    }
    xlbls += `<text x="${x.toFixed(1)}" y="${(H-PB+16).toFixed(1)}" text-anchor="middle" font-size="${11*_activeChartFs}" fill="#0d9488" font-weight="700">${lbl}</text>`;

    if (d.realisasi !== null) {
      const rv  = Number(d.realisasi);
      const col = tgtF !== null ? (rv >= tgtF ? '#10b981' : rv >= tgtF * 0.75 ? '#f59e0b' : '#ef4444') : '#0d9488';
      const cc  = isRange ? col : 'rgba(148,163,184,0.28)';
      const y   = yOf(Math.min(rv, maxV));
      const bH  = (PT + iH) - y;
      bars += `<rect x="${(x - barW/2).toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${bH.toFixed(1)}" rx="3" fill="${cc}"/>`;
      if (isRange) {
        const valStr = String(+rv.toFixed(2));
        const bwv = valStr.length * 6.5 + 10;
        bars += `<rect x="${(x-bwv/2).toFixed(1)}" y="${(y-20).toFixed(1)}" width="${bwv}" height="14" rx="7" fill="${col}" opacity=".13"/>`;
        bars += `<text x="${x.toFixed(1)}" y="${(y-11).toFixed(1)}" text-anchor="middle" font-size="${11*_activeChartFs}" fill="${col}" font-weight="700">${valStr}</text>`;
      }
    } else if (isRange) {
      bars += `<line x1="${x.toFixed(1)}" y1="${(PT+6).toFixed(1)}" x2="${x.toFixed(1)}" y2="${(PT+iH-4).toFixed(1)}" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="3,3"/>`;
    }
  });

  return `
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="365" style="overflow:visible">
      ${grid}${bars}${xlbls}
    </svg>`;
}

// ── Combo chart: Bar realisasi + Line capaian% ────────────────────────────
function _kwComboChart(data, activeRange, target, targetDisplay, satuan) {
  // Dispatch ke chart type yg dipilih user
  if (_kwChartType === 'bar')    return _kwChartBar(data, activeRange, target, targetDisplay, satuan);
  if (_kwChartType === 'line')   return _kwChartLine(data, activeRange, target, targetDisplay, satuan);
  if (_kwChartType === 'area')   return _kwChartArea(data, activeRange, target, targetDisplay, satuan);
  if (_kwChartType === 'radar')  return _kwChartRadar(data, activeRange, target, targetDisplay, satuan);
  if (_kwChartType === 'bullet') return _kwChartBullet(data, activeRange, target, targetDisplay, satuan);
  // default: bar
  return _kwChartBar(data, activeRange, target, targetDisplay, satuan);
}

// ── CHART: Bullet (realisasi bar + zona target + marker capaian%) ──
function _kwChartBullet(data, activeRange, target, targetDisplay, satuan) {
  // Bullet chart: tiap bulan = 1 horizontal bullet
  // Zona bg: merah (0–75% target) | kuning (75–100%) | hijau (>= 100%)
  // Bar dalam: realisasi (nilai absolut)
  // Marker vertikal: posisi target
  // Label kanan: capaian% + realisasi

  const tgt = target !== null ? parseFloat(target) : null;

  // Hanya data isInRange
  const rows = data.filter(d => d.isInRange);
  if (!rows.length) return '<div class="kw-empty">Belum ada data</div>';

  const W = 660, ROW_H = 18, ROW_GAP = 4;
  const PL = 48, PR = 130, PT = 10, PB = 10;
  const barH = 9; // tinggi bar realisasi dalam bullet
  const zoneH = 14; // tinggi zona background

  // Tentukan maxVal untuk skala: max(target, semua realisasi) * 1.15
  const realVals = rows.map(d => d.realisasi).filter(v => v !== null).map(Number);
  const maxVal = tgt !== null
    ? Math.max(tgt * 1.2, ...realVals, 1)
    : Math.max(...realVals, 1) * 1.15;

  const H = PT + rows.length * (ROW_H + ROW_GAP) - ROW_GAP + PB + 20;
  const iW = W - PL - PR;

  const toX = v => PL + (v / maxVal) * iW;

  // Grid verticals (0, 25%, 50%, 75%, 100% of maxVal)
  let grid = '';
  [0, 0.25, 0.5, 0.75, 1.0].forEach(f => {
    const v = maxVal * f;
    const x = toX(v).toFixed(1);
    const isTarget = tgt !== null && Math.abs(v - tgt) < 0.01;
    grid += `<line x1="${x}" y1="${PT}" x2="${x}" y2="${H - PB}" stroke="${f === 0 ? '#e2e8f0' : '#f1f5f9'}" stroke-width="${f === 0 ? 1.2 : 0.7}"/>`;
    if (f > 0) {
      const lbl = tgt !== null ? (v).toFixed(tgt % 1 !== 0 ? 1 : 0) : (v * 100 / maxVal).toFixed(0) + '%';
      grid += `<text x="${x}" y="${H - PB + 14}" text-anchor="middle" font-size="${10*_activeChartFs}" fill="#94a3b8">${(v / maxVal * 100).toFixed(0)}%</text>`;
    }
  });

  // Target marker line (vertical dashed red)
  if (tgt !== null) {
    const xT = toX(tgt).toFixed(1);
    grid += `<line x1="${xT}" y1="${PT}" x2="${xT}" y2="${H - PB}" stroke="#6366f1" stroke-width="1.5" stroke-dasharray="4,3" opacity=".8"/>`;
    grid += `<text x="${xT}" y="${PT - 4}" text-anchor="middle" font-size="${9*_activeChartFs}" fill="#6366f1" font-weight="700">Target</text>`;
  }

  // Rows
  let rowsEl = '';
  rows.forEach((d, i) => {
    const cy = PT + i * (ROW_H + ROW_GAP) + ROW_H / 2;
    const zoneY = cy - zoneH / 2;
    const barY  = cy - barH / 2;

    // Capaian color
    const col = d.capaian === null ? '#94a3b8'
      : (tgt !== null && d.capaian >= tgt) ? '#10b981'
      : (tgt !== null && d.capaian >= tgt * 0.75) ? '#f59e0b'
      : '#ef4444';

    // Zona background 3 segmen (merah → kuning → hijau)
    if (tgt !== null) {
      const x75  = toX(tgt * 0.75);
      const x100 = toX(tgt);
      const xMax = toX(maxVal);
      // Zona merah: 0 → 75% target
      rowsEl += `<rect x="${PL}" y="${zoneY.toFixed(1)}" width="${(x75 - PL).toFixed(1)}" height="${zoneH}" rx="0" fill="#fef2f2"/>`;
      // Zona kuning: 75% → 100% target
      rowsEl += `<rect x="${x75.toFixed(1)}" y="${zoneY.toFixed(1)}" width="${(x100 - x75).toFixed(1)}" height="${zoneH}" fill="#fffbeb"/>`;
      // Zona hijau: 100% target → max
      rowsEl += `<rect x="${x100.toFixed(1)}" y="${zoneY.toFixed(1)}" width="${(xMax - x100).toFixed(1)}" height="${zoneH}" rx="0" fill="#f0fdf4"/>`;
      // Border zona
      rowsEl += `<rect x="${PL}" y="${zoneY.toFixed(1)}" width="${iW}" height="${zoneH}" rx="3" fill="none" stroke="#f1f5f9" stroke-width="1"/>`;
    } else {
      rowsEl += `<rect x="${PL}" y="${zoneY.toFixed(1)}" width="${iW}" height="${zoneH}" rx="3" fill="#f8fafc"/>`;
    }

    // Bar realisasi
    if (d.realisasi !== null) {
      const realVal = Math.min(Number(d.realisasi), maxVal);
      const barW2 = Math.max(toX(realVal) - PL, 2);
      rowsEl += `<rect x="${PL}" y="${barY.toFixed(1)}" width="${barW2.toFixed(1)}" height="${barH}" rx="3" fill="${col}" opacity=".85"/>`;
      // Highlight top
      rowsEl += `<rect x="${PL}" y="${barY.toFixed(1)}" width="${barW2.toFixed(1)}" height="${Math.min(barH * 0.35, 6)}" rx="3" fill="white" opacity=".2"/>`;
    }

    // Target marker (thick vertical line)
    if (tgt !== null) {
      const xT = toX(tgt);
      rowsEl += `<rect x="${(xT - 2).toFixed(1)}" y="${(zoneY - 2).toFixed(1)}" width="4" height="${zoneH + 4}" rx="2" fill="#ef4444" opacity=".9"/>`;
    }

    // Label kiri: nama bulan
    rowsEl += `<text x="${(PL - 6).toFixed(1)}" y="${cy.toFixed(1)}" text-anchor="end" font-size="${11*_activeChartFs}" font-weight="700" fill="#475569" dominant-baseline="middle">${d.label}</text>`;

    // Label kanan: capaian% + realisasi
    const capStr = d.capaian !== null ? parseFloat(d.capaian).toFixed(1) + '%' : '—';
    const realStr = d.realisasi !== null ? (+parseFloat(d.realisasi).toFixed(2)) + (satuan ? ' ' + satuan : '') : '—';
    rowsEl += `<text x="${(W - PR + 8).toFixed(1)}" y="${(cy - 4).toFixed(1)}" font-size="${11*_activeChartFs}" font-weight="800" fill="${col}" dominant-baseline="middle">${capStr}</text>`;
    rowsEl += `<text x="${(W - PR + 8).toFixed(1)}" y="${(cy + 7).toFixed(1)}" font-size="${9*_activeChartFs}" fill="#94a3b8" dominant-baseline="middle">${realStr}</text>`;
  });

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="overflow:visible;display:block">
    ${grid}${rowsEl}
  </svg>`;
}

// ── CHART: Bar only (capaian % saja) ─────────────────────────────────────
function _kwChartBar(data, activeRange, target, targetDisplay, satuan) {
  const W = 700, H = 400, PL = 46, PR = 18, PT = 36, PB = 48;
  const iW = W - PL - PR, iH = H - PT - PB;
  const tgtF = target !== null && target !== undefined ? parseFloat(target) : null;
  const rVals = data.map(d => d.realisasi).filter(v => v !== null).map(Number);
  const maxV = tgtF !== null ? Math.max(tgtF * 1.15, ...rVals, 0.1) : Math.max(...rVals, 0.1) * 1.15;
  const n = data.length || 1;
  const slotW = iW / n;
  const barW = slotW * 0.65;
  const xOf = i => PL + (i + 0.5) * slotW;
  const yOf = v => PT + iH - (v / maxV) * iH;

  let grid = '';
  for (let t = 0; t <= 4; t++) {
    const v = (maxV / 4) * t;
    const y = yOf(v).toFixed(1);
    grid += `<line x1="${PL}" y1="${y}" x2="${W-PR}" y2="${y}" stroke="${t===0?'#e2e8f0':'#f1f5f9'}" stroke-width="${t===0?'1':'.5'}"/>`;
    if (t > 0) grid += `<text x="${(PL-5).toFixed(1)}" y="${y}" text-anchor="end" font-size="${10*_activeChartFs}" fill="#94a3b8" dominant-baseline="middle">${v.toFixed(2)}</text>`;
  }

  // Garis target pada nilai absolut
  if (tgtF !== null) {
    const yTgt = yOf(Math.min(tgtF, maxV)).toFixed(1);
    grid += `<line x1="${PL}" y1="${yTgt}" x2="${W-PR}" y2="${yTgt}" stroke="#6366f1" stroke-width="1.4" stroke-dasharray="5,3" opacity=".75"/>`;
  }

  let bars = '', xlbls = '';
  const linePointsB = [];

  data.forEach((d, i) => {
    const x = xOf(i);
    const isRange = d.isInRange;
    xlbls += `<text x="${x.toFixed(1)}" y="${(H-PB+14).toFixed(1)}" text-anchor="middle" font-size="${11*_activeChartFs}" fill="#0d9488" font-weight="700">${d.label}</text>`;
    if (d.realisasi !== null) {
      const rv  = Number(d.realisasi);
      const col = d.capaian !== null ? (d.capaian >= 100 ? '#10b981' : d.capaian >= 75 ? '#f59e0b' : '#ef4444') : '#0d9488';
      const fillCol = isRange ? col : 'rgba(148,163,184,0.2)';
      const y = yOf(Math.min(rv, maxV));
      const bH = (PT + iH) - y;
      bars += `<rect x="${(x-barW/2).toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${bH.toFixed(1)}" rx="5" fill="${fillCol}"/>`;
      if (isRange) {
        bars += `<rect x="${(x-barW/2).toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${(bH*0.3).toFixed(1)}" rx="5" fill="white" opacity=".15"/>`;
        const vStr = +rv.toFixed(2);
        bars += `<text x="${x.toFixed(1)}" y="${(y-10).toFixed(1)}" text-anchor="middle" font-size="${11*_activeChartFs}" fill="${col}" font-weight="800">${vStr}</text>`;
        linePointsB.push({ x, y, col });
      }
    }
  });

  let connLineB = '', connDotsB = '';
  if (linePointsB.length >= 2) {
    const pathD = linePointsB.map((p, i) => `${i===0?'M':'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    connLineB = `<path d="${pathD}" fill="none" stroke="#f59e0b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/>`;
    connDotsB = linePointsB.map(p =>
      `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="5" fill="white" stroke="${p.col}" stroke-width="2.2"/>` +
      `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.5" fill="${p.col}"/>`
    ).join('');
  }

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="400" style="overflow:visible;display:block">${grid}${bars}${connLineB}${connDotsB}${xlbls}</svg>`;
}

// ── CHART: Line (capaian % saja) ──────────────────────────────────────────
function _kwChartLine(data, activeRange, target, targetDisplay, satuan) {
  const W = 700, H = 380, PL = 46, PR = 24, PT = 36, PB = 48;
  const iW = W - PL - PR, iH = H - PT - PB;
  const tgtF = target !== null && target !== undefined ? parseFloat(target) : null;
  const rVals = data.map(d => d.realisasi).filter(v => v !== null).map(Number);
  const maxV = tgtF !== null ? Math.max(tgtF * 1.15, ...rVals, 0.1) : Math.max(...rVals, 0.1) * 1.15;
  const n = data.length || 1;
  const xOf = i => PL + (i / Math.max(n - 1, 1)) * iW;
  const yOf = v => PT + iH - (v / maxV) * iH;

  let grid = '';
  for (let t = 0; t <= 4; t++) {
    const v = (maxV / 4) * t;
    const y = yOf(v).toFixed(1);
    grid += `<line x1="${PL}" y1="${y}" x2="${W-PR}" y2="${y}" stroke="${t===0?'#e2e8f0':'#f1f5f9'}" stroke-width="${t===0?'1':'.5'}"/>`;
    if (t > 0) grid += `<text x="${(PL-5).toFixed(1)}" y="${y}" text-anchor="end" font-size="${10*_activeChartFs}" fill="#94a3b8" dominant-baseline="middle">${v.toFixed(2)}</text>`;
  }

  // Garis target pada nilai absolut
  if (tgtF !== null) {
    const yTgt = yOf(Math.min(tgtF, maxV)).toFixed(1);
    grid += `<line x1="${PL}" y1="${yTgt}" x2="${W-PR}" y2="${yTgt}" stroke="#6366f1" stroke-width="1.4" stroke-dasharray="5,3" opacity=".75"/>`;
  }

  const pts = data.map((d, i) => ({ x: xOf(i), y: d.realisasi !== null ? yOf(Math.min(Number(d.realisasi), maxV)) : null, v: d.realisasi, real: d.realisasi, cap: d.capaian ?? null, isRange: d.isInRange, label: d.label }));
  const validPts = pts.filter(p => p.y !== null);

  let lineEl = '', xlbls = '';
  // Smooth line using simple polyline
  if (validPts.length >= 2) {
    const pathD = validPts.map((p, j) => `${j===0?'M':'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    lineEl += `<path d="${pathD}" fill="none" stroke="#0d9488" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  pts.forEach((p, i) => {
    xlbls += `<text x="${p.x.toFixed(1)}" y="${(H-PB+14).toFixed(1)}" text-anchor="middle" font-size="${11*_activeChartFs}" fill="#0d9488" font-weight="700">${p.label}</text>`;
    if (p.y !== null) {
      const rv = p.v !== null ? Number(p.v) : null;
      const col = p.cap !== null ? (p.cap >= 100 ? '#10b981' : p.cap >= 75 ? '#f59e0b' : '#ef4444') : '#0d9488';
      lineEl += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p.isRange?7:4}" fill="${p.isRange?col:'#cbd5e1'}" stroke="white" stroke-width="2"/>`;
      if (p.isRange) {
        const vStr = rv !== null ? +rv.toFixed(2) : '—';
        lineEl += `<text x="${p.x.toFixed(1)}" y="${(p.y-12).toFixed(1)}" text-anchor="middle" font-size="${11*_activeChartFs}" fill="${col}" font-weight="800">${vStr}</text>`;
      }
    }
  });

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="380" style="overflow:visible;display:block">${grid}${lineEl}${xlbls}</svg>`;
}

// ── CHART: Area (capaian % dengan fill di bawah) ──────────────────────────
function _kwChartArea(data, activeRange, target, targetDisplay, satuan) {
  const W = 700, H = 380, PL = 46, PR = 24, PT = 36, PB = 48;
  const iW = W - PL - PR, iH = H - PT - PB;
  const tgtF = target !== null && target !== undefined ? parseFloat(target) : null;
  const rVals = data.map(d => d.realisasi).filter(v => v !== null).map(Number);
  const maxV = tgtF !== null ? Math.max(tgtF * 1.15, ...rVals, 0.1) : Math.max(...rVals, 0.1) * 1.15;
  const n = data.length || 1;
  const xOf = i => PL + (i / Math.max(n - 1, 1)) * iW;
  const yOf = v => PT + iH - (v / maxV) * iH;
  const yBase = PT + iH;

  let grid = '';
  for (let t = 0; t <= 4; t++) {
    const v = (maxV / 4) * t;
    const y = yOf(v).toFixed(1);
    grid += `<line x1="${PL}" y1="${y}" x2="${W-PR}" y2="${y}" stroke="${t===0?'#e2e8f0':'#f1f5f9'}" stroke-width="${t===0?'1':'.5'}"/>`;
    if (t > 0) grid += `<text x="${(PL-5).toFixed(1)}" y="${y}" text-anchor="end" font-size="${10*_activeChartFs}" fill="#94a3b8" dominant-baseline="middle">${v.toFixed(2)}</text>`;
  }

  // Garis target pada nilai absolut
  if (tgtF !== null) {
    const yTgt = yOf(Math.min(tgtF, maxV)).toFixed(1);
    grid += `<line x1="${PL}" y1="${yTgt}" x2="${W-PR}" y2="${yTgt}" stroke="#6366f1" stroke-width="1.4" stroke-dasharray="5,3" opacity=".75"/>`;
  }

  // Gradient def
  const gradId = 'kw_area_grad_' + Date.now();
  const defs = `<defs><linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0d9488" stop-opacity=".35"/><stop offset="100%" stop-color="#0d9488" stop-opacity=".03"/></linearGradient></defs>`;

  const pts = data.map((d, i) => ({ x: xOf(i), y: d.realisasi !== null ? yOf(Math.min(Number(d.realisasi), maxV)) : null, v: d.realisasi, real: d.realisasi, cap: d.capaian ?? null, isRange: d.isInRange, label: d.label }));
  const validPts = pts.filter(p => p.y !== null);

  let areaEl = '', xlbls = '';
  if (validPts.length >= 2) {
    const linePath = validPts.map((p, j) => `${j===0?'M':'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const areaPath = linePath + ` L${validPts[validPts.length-1].x.toFixed(1)},${yBase.toFixed(1)} L${validPts[0].x.toFixed(1)},${yBase.toFixed(1)} Z`;
    areaEl += `<path d="${areaPath}" fill="url(#${gradId})"/>`;
    areaEl += `<path d="${linePath}" fill="none" stroke="#0d9488" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  pts.forEach(p => {
    xlbls += `<text x="${p.x.toFixed(1)}" y="${(H-PB+14).toFixed(1)}" text-anchor="middle" font-size="${11*_activeChartFs}" fill="#0d9488" font-weight="700">${p.label}</text>`;
    if (p.y !== null) {
      const rv = p.v !== null ? Number(p.v) : null;
      const col = p.cap !== null ? (p.cap >= 100 ? '#10b981' : p.cap >= 75 ? '#f59e0b' : '#ef4444') : '#0d9488';
      areaEl += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p.isRange?7:4}" fill="${p.isRange?col:'#cbd5e1'}" stroke="white" stroke-width="2"/>`;
      if (p.isRange) {
        const vStr = rv !== null ? +rv.toFixed(2) : '—';
        areaEl += `<text x="${p.x.toFixed(1)}" y="${(p.y-12).toFixed(1)}" text-anchor="middle" font-size="${11*_activeChartFs}" fill="${col}" font-weight="800">${vStr}</text>`;
      }
    }
  });

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="380" style="overflow:visible;display:block">${defs}${grid}${areaEl}${xlbls}</svg>`;
}

// ── CHART: Radar/Spider ───────────────────────────────────────────────────
function _kwChartRadar(data, activeRange, target, targetDisplay, satuan) {
  const W = 500, H = 460, CX = 250, CY = 220, R = 160;
  const pts = data.filter(d => d.isInRange);
  const n = pts.length;
  if (n < 3) {
    // Fallback ke bar chart kalau data < 3
    return _kwChartBar(data, activeRange, target, targetDisplay, satuan);
  }

  const toRad = deg => deg * Math.PI / 180;
  const angle = i => toRad(-90 + (360 / n) * i);
  const px = (i, r) => (CX + r * Math.cos(angle(i))).toFixed(1);
  const py = (i, r) => (CY + r * Math.sin(angle(i))).toFixed(1);

  // Grid rings at 25%, 50%, 75%, 100%
  const maxV = 120;
  let grid = '';
  [25, 50, 75, 100].forEach(pct => {
    const rr = R * (pct / maxV);
    const ringPts = Array.from({length: n}, (_, i) => `${px(i,rr)},${py(i,rr)}`).join(' ');
    grid += `<polygon points="${ringPts}" fill="none" stroke="${pct===100?'#6366f1':'#e2e8f0'}" stroke-width="${pct===100?'1.5':'.8'}" stroke-dasharray="${pct===100?'4,3':''}"/>`;
    grid += `<text x="${CX+2}" y="${(CY - rr - 4).toFixed(1)}" font-size="${11*_activeChartFs}" fill="#94a3b8" text-anchor="middle">${pct}%</text>`;
  });

  // Spokes
  Array.from({length: n}, (_, i) => {
    grid += `<line x1="${CX}" y1="${CY}" x2="${px(i,R)}" y2="${py(i,R)}" stroke="#e2e8f0" stroke-width=".8"/>`;
  });

  // Data polygon
  const dPts = pts.map((d, i) => {
    const v = d.capaian !== null ? Math.min(d.capaian, maxV) : 0;
    const r = R * (v / maxV);
    return { x: parseFloat(px(i, r)), y: parseFloat(py(i, r)), v: d.capaian, real: d.realisasi, label: d.label };
  });
  const polyPts = dPts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  let dataEl = '';
  dataEl += `<polygon points="${polyPts}" fill="#0d9488" fill-opacity=".15" stroke="#0d9488" stroke-width="2.2" stroke-linejoin="round"/>`;

  // Dots & labels
  dPts.forEach((p, i) => {
    const col = p.v === null ? '#94a3b8' : p.v >= 100 ? '#10b981' : p.v >= 75 ? '#f59e0b' : '#ef4444';
    dataEl += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="6" fill="${col}" stroke="white" stroke-width="2"/>`;

    // Label bulan
    const lx = parseFloat(px(i, R + 22));
    const ly = parseFloat(py(i, R + 22));
    const anchor = lx < CX - 5 ? 'end' : lx > CX + 5 ? 'start' : 'middle';
    dataEl += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}" font-size="${13*_activeChartFs}" fill="#0d9488" font-weight="700" dominant-baseline="middle">${p.label}</text>`;
    if (p.v !== null) {
      const vStr = parseFloat(p.v).toFixed(1) + '%';
      const ox = lx < CX ? -20 : lx > CX ? 20 : 0;
      const oy = ly < CY ? -16 : ly > CY ? 16 : -14;
      dataEl += `<text x="${(lx+ox).toFixed(1)}" y="${(ly+oy).toFixed(1)}" text-anchor="${anchor}" font-size="${11*_activeChartFs}" fill="${col}" font-weight="700">${vStr}</text>`;
    }
  });

  const titleEl = `<text x="${CX}" y="${H-22}" text-anchor="middle" font-size="${13*_activeChartFs}" fill="#94a3b8">Capaian % per Bulan (Radar)</text>`;

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="overflow:visible;display:block">${grid}${dataEl}${titleEl}</svg>`;
}

// DASHBOARD & PANTAU INDIKATOR — Scoped Styles
// Dipindahkan dari styles.css agar tidak override/tabrakan dengan style global.
// Dipanggil sekali saat modul dashboard/pantau-indikator pertama kali dimuat.
// ═══════════════════════════════════════════════════════════════════════════
const DASH_STYLE_CSS = `
/* ═══════════════════════════════════════════════════════════════════════════
   DASHBOARD & PANTAU INDIKATOR — Unified Styles
   Font Scale (konsisten, satu sumber):
     --kw-fs-val:   1.25rem / 800   ← angka utama (KPI, stat)
     --kw-fs-body:  0.84rem / 400   ← teks isi (permasalahan, solusi)
     --kw-fs-label: 0.72rem / 600   ← label biasa (progress, chart header)
     --kw-fs-micro: 0.63rem / 700   ← uppercase micro (th tabel, stat lbl)
     --kw-fs-pill:  0.72rem / 700   ← pill/badge/capaian
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── Welcome banner ── */
.dash-welcome {
  background: linear-gradient(135deg, #f0fdfa 0%, #ffffff 60%) !important;
  border-radius: 16px !important;
  padding: 18px 24px !important;
  margin-bottom: 18px !important;
  border: 1px solid #99f6e4 !important;
  box-shadow: none !important;
}
@media (max-width: 480px) {
  .dash-welcome { padding: 14px 16px !important; border-radius: 12px !important; }
}
.dash-welcome-title {
  font-size: 1.05rem !important;
  font-weight: 700 !important;
  color: #0f172a !important;
  margin-bottom: 4px !important;
}
.dash-welcome-sub {
  font-size: 0.84rem !important;
  color: #64748b !important;
  opacity: 1 !important;
  line-height: 1.5 !important;
}
.dash-welcome-sub b,
.dash-welcome-sub span,
.dash-welcome-sub strong {
  display: inline !important;
  color: inherit !important;
}
.dash-welcome-sub b[style],
.dash-welcome-sub span[style] {
  color: #0f766e !important;
  text-decoration: none !important;
}

/* ── Module grid & cards ── */
.dash-module-grid {
  display: grid !important;
  grid-template-columns: repeat(auto-fit, minmax(200px, 380px)) !important;
  gap: 12px !important;
  margin-bottom: 20px !important;
  justify-content: center !important;
}
@media (max-width: 480px) {
  .dash-module-grid { grid-template-columns: 1fr !important; }
}
.dash-module-card {
  background: #ffffff !important;
  border: 1px solid #e2e8f0 !important;
  border-left: 4px solid var(--card-accent, #0d9488) !important;
  border-radius: 16px !important;
  padding: 18px 20px !important;
  transition: box-shadow .18s, transform .18s !important;
}
.dash-module-card:hover {
  box-shadow: 0 8px 24px rgba(13,148,136,.10) !important;
  transform: translateY(-2px) !important;
}
.dash-module-card:nth-child(1) { --card-accent: #0d9488; }
.dash-module-card:nth-child(2) { --card-accent: #3b82f6; }
.dash-module-card:nth-child(3) { --card-accent: #8b5cf6; }
.dash-module-card:nth-child(4) { --card-accent: #f59e0b; }

.dash-mod-header  { display: flex !important; align-items: center !important; gap: 10px !important; margin-bottom: 16px !important; }
.dash-mod-icon    { display: flex !important; align-items: center !important; justify-content: center !important; flex-shrink: 0 !important; width: 38px !important; height: 38px !important; border-radius: 11px !important; }
.dash-mod-title   { font-size: 0.92rem !important; font-weight: 700 !important; letter-spacing: -.01em; }
/* ── Donut body layout ── */
.dash-mod-body {
  display: flex !important;
  align-items: center !important;
  gap: 12px !important;
  border-top: 1px solid #f1f5f9 !important;
  padding-top: 14px !important;
}
.dash-mod-donut {
  flex-shrink: 0 !important;
  width: 72px !important;
  height: 72px !important;
}
.dash-mod-donut svg {
  width: 72px !important;
  height: 72px !important;
  display: block !important;
}
.dash-mod-stat-list {
  flex: 1 !important;
  min-width: 0 !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 7px !important;
}
.dash-mod-stat-row {
  display: flex !important;
  align-items: center !important;
  gap: 7px !important;
}
.dash-mod-stat-dot {
  width: 8px !important;
  height: 8px !important;
  border-radius: 50% !important;
  flex-shrink: 0 !important;
  margin-top: 1px !important;
}
.dash-mod-stat-body {
  min-width: 0 !important;
  display: flex !important;
  align-items: baseline !important;
  gap: 5px !important;
}
.dash-mod-stat-val {
  font-size: 1.1rem !important;
  font-weight: 800 !important;
  line-height: 1 !important;
  letter-spacing: -.02em !important;
  white-space: nowrap !important;
}
.dash-mod-stat-val--alert {
  color: #ef4444 !important;
}
.dash-mod-stat-lbl {
  font-size: 0.7rem !important;
  font-weight: 600 !important;
  letter-spacing: .02em !important;
  color: #475569 !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  text-transform: uppercase !important;
}
@media (max-width: 480px) {
  .dash-mod-donut { width: 60px !important; height: 60px !important; }
  .dash-mod-donut svg { width: 60px !important; height: 60px !important; }
  .dash-mod-stat-val { font-size: 0.95rem !important; }
}
@media (max-width: 480px) {
  .dash-module-card { padding: 14px 14px !important; border-radius: 12px !important; }
  .dash-mod-stat-val { font-size: 1.2rem !important; }
  .dash-welcome-title { font-size: 0.95rem !important; }
  .dash-welcome-sub { font-size: 0.78rem !important; }
}

/* ── Panel bawah (dashboard) ── */
.dash-panels      { display: grid !important; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)) !important; gap: 14px !important; margin-bottom: 20px !important; }
@media (max-width: 600px) {
  .dash-panels { grid-template-columns: 1fr !important; }
}
/* Varian fix 2 kolom — dipakai utk panel yg butuh lebar lebih (mis. Surat Masuk/Keluar
   Terbaru), supaya gak ikut auto-fit nyempit jadi 3-4 kolom dan bikin tabelnya
   overflow-scroll horizontal sendiri. */
.dash-panels--2col { grid-template-columns: repeat(2, 1fr) !important; }
@media (max-width: 900px) {
  .dash-panels--2col { grid-template-columns: 1fr !important; }
}
.dash-panel       { border-radius: 14px !important; border: 1px solid #e2e8f0 !important; box-shadow: 0 1px 4px rgba(0,0,0,.04); overflow-x: auto; -webkit-overflow-scrolling: touch; }
.dash-panel-header { font-size: 0.84rem !important; padding: 12px 16px !important; letter-spacing: -.01em; background: #f8fafc !important; border-bottom: 1px solid #f1f5f9 !important; }
.dash-panel-table th { padding: 8px 16px !important; font-size: 0.63rem !important; background: #f8fafc !important; }
.dash-panel-table td { padding: 9px 16px !important; font-size: 0.78rem !important; }
.dash-panel-table tr:hover td { background: #f0fdfa !important; }
.dash-panel-table { min-width: 400px; }

/* ── Skeleton ── */
.skeleton {
  background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%) !important;
  background-size: 200% 100% !important;
}

/* ══════════════════════════════════════════════
   IKU GRID — iku-* Components
   ══════════════════════════════════════════════ */

.iku-grid-wrap {
  background: #ffffff !important;
  border-radius: 16px !important;
  border: 1px solid #e2e8f0 !important;
  padding: 18px 20px 20px !important;
  margin-bottom: 16px !important;
}
.iku-grid-header {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  margin-bottom: 14px !important;
}
.iku-grid-title {
  font-size: .88rem !important;
  font-weight: 700 !important;
  color: #0f172a !important;
}
.iku-grid-periode {
  font-size: .72rem !important;
  font-weight: 700 !important;
  color: #0f766e !important;
  background: #f0fdfa !important;
  border: 1px solid #99f6e4 !important;
  border-radius: 6px !important;
  padding: 2px 8px !important;
}
.iku-summary-strip {
  display: flex !important;
  align-items: center !important;
  gap: 16px !important;
  background: #f8fafc !important;
  border-radius: 10px !important;
  padding: 10px 16px !important;
  margin-bottom: 14px !important;
  flex-wrap: wrap !important;
}
.iku-sum-item {
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  gap: 2px !important;
}
.iku-sum-val {
  font-size: 1.25rem !important;
  font-weight: 800 !important;
  color: #0f172a !important;
  line-height: 1 !important;
}
.iku-sum-lbl {
  font-size: .63rem !important;
  font-weight: 700 !important;
  text-transform: uppercase !important;
  letter-spacing: .05em !important;
  color: #94a3b8 !important;
  white-space: nowrap !important;
}
.iku-cards-grid {
  display: grid !important;
  grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
  gap: 10px !important;
  margin-bottom: 4px !important;
}
@media (max-width: 900px) {
  .iku-cards-grid { grid-template-columns: repeat(2, 1fr) !important; }
}
.iku-card {
  background: var(--iku-col-bg, #f8fafc) !important;
  border: 1px solid color-mix(in srgb, var(--iku-col, #e2e8f0) 25%, #e2e8f0) !important;
  border-radius: 12px !important;
  padding: 12px 14px !important;
  transition: box-shadow .15s, transform .15s !important;
}
.iku-card:hover {
  box-shadow: 0 4px 14px rgba(0,0,0,.07) !important;
  transform: translateY(-1px) !important;
}
.iku-card--selected {
  border-color: #0d9488 !important;
  box-shadow: 0 0 0 3px rgba(13,148,136,.15), 0 4px 14px rgba(13,148,136,.1) !important;
  transform: translateY(-1px) !important;
}
/* Chart section yang muncul di bawah cards */
.iku-chart-section {
  background: #ffffff !important;
  border: 1.5px solid #e2e8f0 !important;
  border-top: 3px solid #0d9488 !important;
  border-radius: 14px !important;
  padding: 14px 16px !important;
  animation: ikuChartSlide .22s ease !important;
}
@keyframes ikuChartSlide {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
/* Grid 4 chart (2×2 atau 4 kolom tergantung lebar) */
.iku-charts-grid {
  display: grid !important;
  grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
  gap: 10px !important;
}
@media (max-width: 900px) {
  .iku-charts-grid { grid-template-columns: repeat(2, 1fr) !important; }
}
@media (max-width: 700px) {
  .iku-charts-grid { grid-template-columns: 1fr !important; }
}
/* Panel per indikator dalam grid chart */
.iku-mini-chart-panel {
  background: #f8fafc !important;
  border: 1.5px solid #f1f5f9 !important;
  border-radius: 12px !important;
  padding: 12px 14px !important;
  min-width: 0 !important;
}
/* SVG chart di dalam panel — skala kecil */
.iku-mini-chart-svg svg {
  max-height: 200px !important;
  height: 200px !important;
}
.iku-card-top {
  display: flex !important;
  align-items: flex-start !important;
  justify-content: space-between !important;
  gap: 8px !important;
}
.iku-card-name {
  font-size: .78rem !important;
  font-weight: 600 !important;
  color: #1e293b !important;
  line-height: 1.4 !important;
  flex: 1 !important;
  min-width: 0 !important;
  display: flex !important;
  align-items: flex-start !important;
  gap: 5px !important;
}
.iku-card-cap {
  font-size: 1rem !important;
  font-weight: 800 !important;
  line-height: 1 !important;
  white-space: nowrap !important;
  flex-shrink: 0 !important;
}
.iku-card-meta {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 4px !important;
  flex-wrap: wrap !important;
}
@media (max-width: 640px) {
  .iku-summary-strip { gap: 10px !important; padding: 8px 12px !important; }
}
@media (max-width: 480px) {
  .iku-cards-grid { grid-template-columns: 1fr 1fr !important; }
}

/* ══════════════════════════════════════════════
   PANTAU INDIKATOR — kw-* Components
   ══════════════════════════════════════════════ */

/* Wrapper */
.kw-wrap,
div.kw-wrap {
  background: #ffffff !important;
  background-color: #ffffff !important;
  border-radius: 16px !important;
  border: 1px solid #e2e8f0 !important;
  padding: 20px 22px !important;
  box-shadow: 0 2px 16px rgba(15,118,110,.07) !important;
  margin-top: 20px !important;
  position: relative !important;
  color: #0f172a !important;
}

/* Header row */
.kw-header-v2 {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  margin-bottom: 14px !important;
  flex-wrap: wrap !important;
}
.kw-title-v2 {
  font-size: 0.88rem !important;
  font-weight: 700 !important;
  color: #0f172a !important;
}
.kw-period-badge {
  font-size: 0.72rem !important;
  font-weight: 600 !important;
  background: #f0fdfa !important;
  border: 1px solid #99f6e4 !important;
  color: #0f766e !important;
  padding: 3px 10px !important;
  border-radius: 99px !important;
}

/* KPI Cards (4 kartu atas) */
.kw-kpi-grid-v2 {
  display: grid !important;
  grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
  gap: 10px !important;
  margin-bottom: 16px !important;
}
@media (max-width: 820px) {
  .kw-kpi-grid-v2 { grid-template-columns: repeat(2, 1fr) !important; }
}
@media (max-width: 480px) {
  .kw-kpi-grid-v2 { grid-template-columns: 1fr 1fr !important; gap: 8px !important; }
  .kw-kpi-val { font-size: 1.1rem !important; white-space: normal !important; }
  .kw-kpi-lbl { font-size: 0.75rem !important; white-space: normal !important; }
  .kw-kpi-sub { white-space: normal !important; }
}
.kw-kpi-card,
div.kw-kpi-card {
  background: #ffffff !important;
  background-color: #ffffff !important;
  border: 1.5px solid #f1f5f9 !important;
  border-left: 4px solid var(--kc, #0d9488) !important;
  border-radius: 14px !important;
  padding: 14px 14px 12px 14px !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 4px !important;
  transition: box-shadow .15s, transform .15s !important;
}
.kw-kpi-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,.08) !important; transform: translateY(-1px) !important; }
.kw-kpi-accent-bar {
  display: none !important;
}
.kw-kpi-icon   { margin-top: 10px !important; margin-bottom: 2px !important; opacity: .8 !important; display: flex !important; align-items: center !important; }
.kw-kpi-val    { font-size: 1.5rem !important; font-weight: 800 !important; letter-spacing: -.02em !important; line-height: 1.15 !important; color: #0f172a !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; }
.kw-kpi-unit   { font-size: 0.8rem !important; font-weight: 400 !important; color: #94a3b8 !important; }
.kw-kpi-lbl    { font-size: 0.88rem !important; color: #64748b !important; font-weight: 600 !important; margin-top: 2px !important; white-space: nowrap !important; }
.kw-kpi-sub    { font-size: 0.78rem !important; color: #94a3b8 !important; line-height: 1.35 !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; }

/* Selector bar indikator */
.kw-custom-dd--bar   { position: relative !important; margin-bottom: 10px !important; }
.kw-ind-selector-bar {
  display: flex !important;
  align-items: center !important;
  gap: 10px !important;
  padding: 10px 14px !important;
  border-radius: 12px !important;
  cursor: pointer !important;
  min-height: 44px !important;
}
.kw-ind-selector-bar--active  { background: #f0fdfa !important; border: 1.5px solid #5eead4 !important; box-shadow: 0 0 0 3px rgba(13,148,136,.06) !important; }
.kw-ind-selector-bar--empty   { border: 1.5px dashed #94a3b8 !important; background: #f8fafc !important; color: #94a3b8 !important; font-size: 0.84rem !important; }
.kw-ind-selector-bar--empty:hover { border-color: #0d9488 !important; background: #f0fdfa !important; color: #0d9488 !important; }
.kw-ind-selector-name   { font-size: 0.88rem !important; font-weight: 700 !important; color: #0f172a !important; flex: 1 !important; min-width: 0 !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; }
.kw-ind-selector-tag    { display: inline-flex !important; align-items: center !important; gap: 4px !important; font-size: 0.63rem !important; font-weight: 600 !important; background: #ccfbf1 !important; color: #0f766e !important; border-radius: 6px !important; padding: 2px 8px !important; flex-shrink: 0 !important; }
.kw-ind-selector-change { display: inline-flex !important; align-items: center !important; gap: 5px !important; font-size: 0.72rem !important; font-weight: 600 !important; padding: 5px 12px !important; border-radius: 8px !important; border: 1.5px solid #5eead4 !important; background: #ffffff !important; color: #0f766e !important; cursor: pointer !important; flex-shrink: 0 !important; }
.kw-ind-selector-change:hover { background: #f0fdfa !important; }
.kw-ind-selector-reset  { display: flex !important; align-items: center !important; justify-content: center !important; width: 30px !important; height: 30px !important; border-radius: 8px !important; border: 1.5px solid #fecaca !important; background: #fff5f5 !important; color: #ef4444 !important; cursor: pointer !important; flex-shrink: 0 !important; }
.kw-ind-selector-reset:hover { background: #fee2e2 !important; }

/* Dropdown panel */
.kw-dd-panel        { position: absolute !important; top: calc(100% + 6px) !important; left: 0 !important; right: 0 !important; background: #ffffff !important; border: 1.5px solid #e2e8f0 !important; border-radius: 14px !important; box-shadow: 0 10px 30px rgba(0,0,0,.12) !important; z-index: 900 !important; overflow: hidden !important; }
.kw-dd-search-wrap  { position: relative !important; padding: 10px 12px 6px !important; border-bottom: 1px solid #f1f5f9 !important; }
.kw-dd-search-icon  { position: absolute !important; left: 22px !important; top: 19px !important; color: #94a3b8 !important; pointer-events: none !important; }
.kw-dd-search       { width: 100% !important; padding: 7px 10px 7px 30px !important; border-radius: 8px !important; border: 1.5px solid #e2e8f0 !important; background: #f8fafc !important; font-family: inherit !important; font-size: 0.84rem !important; outline: none !important; color: #0f172a !important; }
.kw-dd-search:focus { border-color: #0d9488 !important; background: #ffffff !important; box-shadow: 0 0 0 3px rgba(13,148,136,.08) !important; }
.kw-dd-list         { max-height: 220px !important; overflow-y: auto !important; padding: 4px !important; }
.kw-dd-item         { display: flex !important; align-items: center !important; justify-content: space-between !important; padding: 9px 14px !important; border-radius: 10px !important; cursor: pointer !important; font-size: 0.84rem !important; gap: 8px !important; }
.kw-dd-item:hover   { background: #f0fdfa !important; }
.kw-dd-item.active  { background: #ccfbf1 !important; }
.kw-dd-item-name    { font-weight: 500 !important; flex: 1 !important; min-width: 0 !important; }
.kw-dd-item.active .kw-dd-item-name { color: #0f766e !important; font-weight: 700 !important; }

/* Custom dropdown (filter Bulan/TW/dll) */
.kw-cdd {
  position: relative !important;
  display: inline-flex !important;
  align-items: center !important;
  gap: 5px !important;
  padding: 5px 9px !important;
  border-radius: 10px !important;
  border: 1.5px solid #e2e8f0 !important;
  background: #ffffff !important;
  font-size: 0.75rem !important;
  font-weight: 500 !important;
  cursor: pointer !important;
  user-select: none !important;
}
.kw-cdd:hover { border-color: #0d9488 !important; }
.kw-cdd.open  { border-color: #0d9488 !important; box-shadow: 0 0 0 3px rgba(13,148,136,.10) !important; }
.kw-cdd-panel {
  position: absolute !important;
  top: calc(100% + 5px) !important;
  left: 0 !important;
  min-width: 100% !important;
  background: #ffffff !important;
  border: 1.5px solid #e2e8f0 !important;
  border-radius: 12px !important;
  box-shadow: 0 8px 24px rgba(0,0,0,.10) !important;
  padding: 4px !important;
  z-index: 1000 !important;
  display: none !important;
  max-height: 260px !important;
  overflow-y: auto !important;
}
.kw-cdd.open .kw-cdd-panel { display: block !important; }
.kw-cdd-opt       { display: block !important; padding: 5px 10px !important; border-radius: 8px !important; font-size: 0.75rem !important; font-weight: 500 !important; color: #374151 !important; cursor: pointer !important; white-space: nowrap !important; }
.kw-cdd-opt:hover  { background: #f0fdfa !important; color: #0d9488 !important; }
.kw-cdd-opt.active { background: #ccfbf1 !important; color: #0f766e !important; font-weight: 700 !important; }

/* Filter bar */
.kw-filter-bar-v2 { margin-bottom: 0 !important; margin-left: auto !important; padding: 0 !important; background: transparent !important; border-radius: 0 !important; border: none !important; }
.kw-filter-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:8px 14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; margin-bottom:8px; }

/* Month-picker */
.kw-mp { position:relative; display:inline-flex; align-items:center; gap:5px; padding:4px 9px; border:1.5px solid #e2e8f0; border-radius:8px; background:#fff; cursor:pointer; font-size:0.75rem; font-weight:600; color:#0f172a; user-select:none; transition:border-color .15s,box-shadow .15s; min-width:100px; }
.kw-mp:hover { border-color:#0d9488; }
.kw-mp.open  { border-color:#0d9488; box-shadow:0 0 0 3px rgba(13,148,136,.10); }
.kw-mp-label { flex:1; }
.kw-mp-caret { opacity:.4; flex-shrink:0; }
.kw-mp-panel { position:absolute; top:calc(100% + 6px); left:0; z-index:1100; background:#fff; border:1.5px solid #e2e8f0; border-radius:14px; box-shadow:0 10px 30px rgba(0,0,0,.13); padding:12px; display:none; min-width:220px; }
.kw-mp.open .kw-mp-panel { display:block; }
.kw-mp-nav { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
.kw-mp-year { font-size:0.9rem; font-weight:800; color:#0f172a; }
.kw-mp-nav-btn { background:none; border:none; cursor:pointer; padding:4px 6px; border-radius:6px; display:flex; align-items:center; color:#64748b; transition:background .12s; }
.kw-mp-nav-btn:hover:not(:disabled) { background:#f1f5f9; color:#0d9488; }
.kw-mp-nav-btn:disabled { opacity:.25; cursor:default; }
.kw-mp-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:4px; }
.kw-mp-cell { padding:7px 4px; text-align:center; border-radius:8px; font-size:0.78rem; font-weight:600; color:#374151; cursor:pointer; transition:background .12s,color .12s; }
.kw-mp-cell:hover { background:#f0fdfa; color:#0d9488; }
.kw-mp-cell.active { background:#0d9488; color:#fff !important; }
.kw-mp-cell.disabled { color:#cbd5e1; cursor:default; }
.kw-mp-cell--nodata { color:#cbd5e1; font-weight:400; }
.kw-mp-cell--nodata:hover { background:#fef9ee; color:#b45309; }

/* Layout 2 kolom */
.kw-body,
div.kw-body {
  display: grid !important;
  grid-template-columns: minmax(280px, 36%) 1fr !important;
  align-items: start !important;
  gap: 20px !important;
}
@media (max-width: 900px) {
  .kw-body, div.kw-body { grid-template-columns: 1fr !important; }
}
@media (max-width: 480px) {
  .kw-body, div.kw-body { gap: 12px !important; }
  .kw-stat-row, div.kw-stat-row { border-radius: 10px !important; }
  .kw-stat-val { font-size: 1.05rem !important; }
}
.kw-left  { display: flex !important; flex-direction: column !important; min-width: 0 !important; }
.kw-right { display: flex !important; flex-direction: column !important; min-width: 0 !important; }

/* Nama & meta indikator */
.kw-ind-name     { font-size: 0.93rem !important; font-weight: 700 !important; color: #0f172a !important; line-height: 1.4 !important; margin-bottom: 6px !important; }
.kw-ind-meta-row { display: flex !important; flex-wrap: wrap !important; gap: 5px !important; margin-bottom: 10px !important; }
.kw-ind-group    { display: inline-flex !important; align-items: center !important; gap: 4px !important; font-size: 0.63rem !important; font-weight: 600 !important; background: #f1f5f9 !important; color: #475569 !important; border-radius: 99px !important; padding: 3px 10px !important; }
.kw-ind-pj       { display: inline-flex !important; align-items: center !important; gap: 4px !important; font-size: 0.63rem !important; font-weight: 600 !important; background: #eff6ff !important; color: #1d4ed8 !important; border-radius: 99px !important; padding: 3px 10px !important; }

/* Gauge */
.kw-gauge-wrap  { display: flex !important; flex-direction: column !important; align-items: center !important; padding: 4px 0 8px !important; }
.kw-gauge-wrap svg { width: 100% !important; max-width: 180px !important; height: auto !important; }
.kw-gauge-label { font-size: 0.75rem !important; font-weight: 700 !important; border-radius: 99px !important; padding: 4px 16px !important; display: inline-flex !important; align-items: center !important; gap: 4px !important; margin-top: 6px !important; }

/* Stat row (Realisasi / Target / Capaian) */
.kw-stat-row,
div.kw-stat-row {
  display: grid !important;
  grid-template-columns: repeat(3, 1fr) !important;
  border: 1.5px solid #e2e8f0 !important;
  border-radius: 12px !important;
  overflow: hidden !important;
  background: #f8fafc !important;
  background-color: #f8fafc !important;
  margin-bottom: 14px !important;
}
.kw-stat-cell              { text-align: center !important; padding: 12px 8px !important; }
.kw-stat-cell + .kw-stat-cell { border-left: 1px solid #e2e8f0 !important; }
.kw-stat-val               { font-size: 1.25rem !important; font-weight: 800 !important; color: #0f172a !important; line-height: 1.15 !important; }
.kw-stat-lbl               { font-size: 0.63rem !important; color: #94a3b8 !important; margin-top: 3px !important; text-transform: uppercase !important; letter-spacing: .06em !important; }

/* Progress bar */
.kw-prog-header-v2     { display: flex !important; justify-content: space-between !important; align-items: center !important; font-size: 0.72rem !important; font-weight: 600 !important; color: #475569 !important; margin-bottom: 5px !important; }
.kw-prog-bar-outer-v2  { height: 8px !important; background: #e2e8f0 !important; background-color: #e2e8f0 !important; border-radius: 99px !important; overflow: visible !important; position: relative !important; }
.kw-prog-bar-inner-v2  { height: 100% !important; border-radius: 99px !important; transition: width .5s ease !important; min-width: 3px !important; }
.kw-prog-milestone-v2  { position: absolute !important; top: -3px !important; bottom: -3px !important; width: 2px !important; background: #f59e0b !important; border-radius: 2px !important; }
.kw-prog-ticks         { display: flex !important; justify-content: space-between !important; font-size: 0.63rem !important; color: #cbd5e1 !important; margin-top: 3px !important; }

/* Gap info */
.kw-gap-info { display: flex !important; align-items: center !important; gap: 6px !important; padding: 8px 12px !important; border-radius: 10px !important; font-size: 0.75rem !important; font-weight: 600 !important; margin-top: 8px !important; margin-bottom: 12px !important; }

/* Tabel bulan */
.kw-month-table-v2 { width: 100% !important; border-collapse: collapse !important; font-size: 0.78rem !important; margin-top: 6px !important; }
.kw-month-table-v2 th { font-size: 0.63rem !important; text-transform: uppercase !important; letter-spacing: .06em !important; color: #94a3b8 !important; font-weight: 700 !important; padding: 6px 8px !important; border-bottom: 1.5px solid #f1f5f9 !important; text-align: left !important; }
.kw-month-table-v2 td { padding: 8px 8px !important; border-bottom: 1px solid #f8fafc !important; font-size: 0.78rem !important; color: #334155 !important; vertical-align: middle !important; text-align: left !important; }
.kw-month-label-cell  { display: flex !important; align-items: center !important; gap: 7px !important; }
.kw-month-active-bar  { width: 3px !important; height: 14px !important; border-radius: 2px !important; flex-shrink: 0 !important; }
.kw-cap-pill-v2       { display: inline-block !important; padding: 2px 8px !important; border-radius: 99px !important; font-size: 0.72rem !important; font-weight: 700 !important; }
.kw-tw-row--active    { background: #f0fdf4 !important; }
.kw-tw-row--future    { opacity: .45 !important; }
.kw-future-tag        { color: #cbd5e1 !important; }

/* Chart card */
.kw-chart-card,
div.kw-chart-card {
  background: #ffffff !important;
  background-color: #ffffff !important;
  border: 1.5px solid #f1f5f9 !important;
  border-radius: 14px !important;
  padding: 14px 16px !important;
  margin-bottom: 10px !important;
  width: 100% !important;
  overflow: visible !important;
}
.kw-chart-card-header {
  display: flex !important;
  justify-content: space-between !important;
  align-items: center !important;
  font-size: 0.72rem !important;
  font-weight: 700 !important;
  color: #64748b !important;
  text-transform: uppercase !important;
  letter-spacing: .05em !important;
  margin-bottom: 12px !important;
}
/* Ikon di chart header tetap kecil */
.kw-chart-card-header svg,
.kw-chart-card span svg {
  width: 12px !important; height: 12px !important;
  max-width: 12px !important; max-height: 12px !important;
  flex-shrink: 0 !important;
}
.kw-chart-card > svg { width: 100% !important; height: auto !important; display: block !important; }

/* Insight grid */
.kw-insight-grid-v2 {
  display: grid !important;
  grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
  gap: 8px !important;
  margin-bottom: 10px !important;
}
@media (max-width: 820px) {
  .kw-insight-grid-v2 { grid-template-columns: repeat(2, 1fr) !important; }
}
@media (max-width: 480px) {
  .kw-insight-grid-v2 { grid-template-columns: 1fr 1fr !important; gap: 6px !important; }
}
.kw-insight-card-v2,
div.kw-insight-card-v2 {
  background: #f8fafc !important;
  background-color: #f8fafc !important;
  border: 1.5px solid #f1f5f9 !important;
  border-radius: 12px !important;
  padding: 10px 12px !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 3px !important;
}
.kw-insight-card-v2:hover { border-color: #5eead4 !important; }
.kw-insight-label-v2 { display: flex !important; align-items: center !important; gap: 4px !important; font-size: 0.78rem !important; font-weight: 700 !important; color: #94a3b8 !important; text-transform: uppercase !important; letter-spacing: .06em !important; margin-bottom: 3px !important; }
.kw-insight-val-v2   { font-size: 1.2rem !important; font-weight: 800 !important; color: #0f172a !important; line-height: 1.2 !important; }
.kw-insight-sub-v2   { font-size: 0.63rem !important; color: #94a3b8 !important; margin-top: 2px !important; }

/* Detail row (Permasalahan & Solusi) */
.kw-detail-row-v2 {
  display: grid !important;
  grid-template-columns: 1fr 1fr !important;
  gap: 10px !important;
}
.kw-detail-row-v2.single { grid-template-columns: 1fr !important; }
@media (max-width: 820px) {
  .kw-detail-row-v2 { grid-template-columns: 1fr !important; }
}
@media (max-width: 480px) {
  .kw-detail-row-v2 { gap: 6px !important; }
  .kw-chart-card, div.kw-chart-card { padding: 10px 10px !important; }
  .kw-ind-selector-name { font-size: 0.8rem !important; }
  .kw-ind-selector-change { font-size: 0.68rem !important; padding: 4px 8px !important; }
}
.kw-detail-box { border-radius: 12px !important; padding: 12px 14px !important; }
.kw-masalah {
  background: #fff7ed !important; background-color: #fff7ed !important;
  border: 1.5px solid #fed7aa !important;
  border-left: 3px solid #f97316 !important;
  border-radius: 0 12px 12px 0 !important;
}
/* Accordion permasalahan & solusi */
.kw-ps-wrap { display:flex; flex-direction:column; gap:0; margin-top:0; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden; }
.kw-ps-divider { border:none; border-top:1px solid #f1f5f9; margin:0; }

.kw-ps-acc-item {}
.kw-ps-acc-header {
  display:flex; align-items:center; gap:8px;
  width:100%; padding:9px 12px;
  background:#f8fafc; border:none; cursor:pointer;
  font-family:inherit; font-size:0.8rem; font-weight:600; color:#334155;
  text-align:left; transition:background .15s;
}
.kw-ps-acc-header:hover { background:#f1f5f9; }
.kw-ps-acc-open .kw-ps-acc-header { background:#ffffff; color:#0f172a; }
.kw-ps-acc-month { flex:1; }
.kw-ps-acc-dots { display:flex; gap:4px; align-items:center; }
.kw-ps-dot { display:inline-block; width:7px; height:7px; border-radius:50%; }
.kw-ps-dot--masalah { background:#f97316; }
.kw-ps-dot--solusi  { background:#0d9488; }
.kw-ps-acc-chevron { flex-shrink:0; color:#94a3b8; transition:transform .2s; }
.kw-ps-acc-open .kw-ps-acc-chevron { transform:rotate(180deg); }

.kw-ps-acc-body { padding:8px 10px 10px; display:flex; flex-direction:column; gap:4px; }
.kw-ps-acc-body[hidden] { display:none; }

/* legacy — tidak dipakai lagi tapi jaga kompatibilitas */
.kw-ps-item { display:flex; gap:0; align-items:stretch; }
.kw-ps-month-badge { flex-shrink:0; width:52px; background:#f0fdfa; border-right:1px solid #e2e8f0; display:flex; align-items:center; justify-content:center; font-size:0.7rem; font-weight:800; color:#0d9488; writing-mode:vertical-rl; text-orientation:mixed; padding:10px 6px; letter-spacing:.04em; }
.kw-ps-body { flex:1; padding:8px 10px; display:flex; flex-direction:column; gap:4px; }
.kw-solusi {
  background: #f0fdfa !important; background-color: #f0fdfa !important;
  border: 1.5px solid #99f6e4 !important;
  border-left: 3px solid #0d9488 !important;
  border-radius: 0 12px 12px 0 !important;
}
.kw-ok {
  background: #f8fafc !important;
  border: 1.5px solid #e2e8f0 !important;
  border-radius: 12px !important;
}
.kw-detail-label {
  display: flex !important;
  align-items: center !important;
  gap: 5px !important;
  font-size: 0.63rem !important;
  font-weight: 800 !important;
  text-transform: uppercase !important;
  letter-spacing: .06em !important;
  margin-bottom: 6px !important;
}
.kw-detail-text {
  font-size: 0.84rem !important;
  line-height: 1.6 !important;
  color: #334155 !important;
}

/* Empty state */
.kw-empty {
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 44px 20px !important;
  text-align: center !important;
  color: #94a3b8 !important;
  font-size: 0.84rem !important;
  gap: 12px !important;
}

/* Spinner */
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }


/* ── Redesign layout: 2 kolom baru ── */
.kw-body-redesign {
  display: grid !important;
  grid-template-columns: minmax(300px, 38%) 1fr !important;
  gap: 16px !important;
  align-items: start !important;
  margin-top: 0 !important;
}
@media (max-width: 900px) {
  .kw-body-redesign { grid-template-columns: 1fr !important; }
}
@media (max-width: 480px) {
  .kw-wrap, div.kw-wrap { padding: 14px 14px !important; border-radius: 12px !important; }
  .kw-filter-row { flex-direction: column !important; align-items: flex-start !important; gap: 6px !important; overflow-x: auto !important; }
  .kw-filter-row > div { flex-wrap: wrap !important; }
  .kw-card-panel { padding: 12px 12px !important; }
  .kw-month-table-v2 { font-size: 0.78rem !important; }
  .kw-month-table-v2 td, .kw-month-table-v2 th { padding: 6px 6px !important; }
}
.kw-col-left  { display: flex !important; flex-direction: column !important; gap: 12px !important; min-width: 0 !important; }
.kw-col-right { display: flex !important; flex-direction: column !important; gap: 12px !important; min-width: 0 !important; }

.kw-card-panel {
  background: #ffffff !important;
  border: 1.5px solid #f1f5f9 !important;
  border-radius: 14px !important;
  padding: 14px 16px !important;
  width: 100% !important;
  box-sizing: border-box !important;
}

.kw-panel-title {
  display: flex !important;
  align-items: center !important;
  gap: 5px !important;
  font-size: 0.63rem !important;
  font-weight: 700 !important;
  text-transform: uppercase !important;
  letter-spacing: .07em !important;
  color: #94a3b8 !important;
  margin-bottom: 10px !important;
}

.kw-kpi-card--hero {
  background: linear-gradient(135deg, #f0fdfa 0%, #ffffff 100%) !important;
  background-color: #f0fdfa !important;
  border: 1.5px solid #99f6e4 !important;
}

.kw-col-left .kw-gauge-wrap svg { max-width: 220px !important; }

`;

(function injectDashStyles() {
  const STYLE_ID = 'sapa-dash-styles';
  if (document.getElementById(STYLE_ID)) return; // jangan inject dua kali
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = DASH_STYLE_CSS;
  document.head.appendChild(el);
})();