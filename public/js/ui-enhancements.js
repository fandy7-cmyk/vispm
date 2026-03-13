/**
 * VISPM UI Enhancements v2.0
 * File ini berisi semua fungsi baru hasil redesign jangka panjang.
 * Di-load SETELAH app.js — override / extend fungsi yang ada.
 *
 * Perubahan utama:
 * 1. showNotifBanner()       — gantikan showPeriodeLoginPopup + showTandaTanganLoginPopup
 * 2. renderSplitView()       — layout split panel untuk halaman verifikasi
 * 3. renderCatatanThread()   — timeline vertikal (override fungsi lama)
 * 4. renderSkeletonList()    — skeleton loader per komponen
 * 5. renderSkeletonStats()   — skeleton stat grid
 * 6. spmIndicator()          — badge SPM dengan color coding
 * 7. statCard()              — stat card clickable (override)
 * 8. renderStatusBar()       — class-based (override fungsi lama)
 */

// ============================================================
// 1. NOTIFICATION BANNER — gantikan popup login ganda
// ============================================================
/**
 * Tampilkan satu atau lebih banner tipis di bawah topbar.
 * Menggabungkan semua notifikasi sehingga tidak ada popup beruntun.
 *
 * @param {Array} banners - array of { type, icon, message, action?, actionLabel?, actionFn? }
 *   type: 'warning' | 'info' | 'danger'
 */
function showNotifBanner(banners) {
  const container = document.getElementById('notifBannerContainer');
  if (!container || !banners || !banners.length) return;

  container.style.display = 'block';
  container.innerHTML = banners.map((b, i) => `
    <div class="notif-banner ${b.type || 'info'}" id="notifBanner_${i}">
      <span class="material-icons">${b.icon || 'info'}</span>
      <span class="notif-banner-text">${b.message}</span>
      ${b.actionLabel ? `<button class="notif-banner-action" onclick="(${b.actionFn.toString()})()">${b.actionLabel}</button>` : ''}
      <button class="notif-banner-close" onclick="dismissNotifBanner(${i})" title="Tutup">
        <span class="material-icons" style="font-size:18px">close</span>
      </button>
    </div>
  `).join('');
}

function dismissNotifBanner(idx) {
  const el = document.getElementById('notifBanner_' + idx);
  if (el) {
    el.style.opacity = '0';
    el.style.transition = 'opacity .2s';
    setTimeout(() => {
      el.remove();
      // Sembunyikan container jika semua banner sudah ditutup
      const c = document.getElementById('notifBannerContainer');
      if (c && !c.children.length) c.style.display = 'none';
    }, 200);
  }
}

/**
 * Override showPeriodeLoginPopup dan showTandaTanganLoginPopup:
 * Kumpulkan semua notifikasi lalu tampilkan sebagai banner.
 */
async function showLoginNotifications() {
  const banners = [];
  const role = currentUser?.role;

  // --- Notifikasi tanda tangan ---
  try {
    let ttMissing = false;
    if (role === 'Kepala Puskesmas' || role === 'Pengelola Program') {
      const tt = currentUser.tandaTangan;
      ttMissing = !tt || tt === 'null' || tt === '';
    } else if (role === 'Admin') {
      const pjRes = await fetch('/api/pejabat');
      const pjData = await pjRes.json();
      const pjList = pjData.success ? pjData.data : [];
      const kasubag = pjList.find(p => p.jabatan === 'Kepala Sub Bagian Perencanaan');
      const kadis   = pjList.find(p => p.jabatan === 'Kepala Dinas Kesehatan PPKB');
      ttMissing = !kasubag?.tanda_tangan || !kadis?.tanda_tangan;
    }
    if (ttMissing) {
      banners.push({
        type: 'danger',
        icon: 'draw',
        message: role === 'Admin'
          ? '<strong>Tanda tangan pejabat belum lengkap.</strong> Laporan PDF tidak dapat dicetak.'
          : '<strong>Tanda tangan belum diupload.</strong> Diperlukan untuk proses verifikasi.',
        actionLabel: role === 'Admin' ? 'Buka Master Data' : 'Upload Sekarang',
        actionFn: role === 'Admin' ? () => loadPage('master') : () => openEditProfil()
      });
    }
  } catch(e) { /* silent */ }

  // --- Notifikasi periode aktif (untuk Operator) ---
  if (role === 'Operator') {
    try {
      const periodeList = await API.get('periode');
      const aktifList = (periodeList || []).filter(p => p.isAktifToday);
      if (aktifList.length > 0) {
        const p = aktifList[0];
        const tgl = `${p.namaBulan} ${p.tahun} · ${formatDate(p.tanggalMulai)} s/d ${formatDate(p.tanggalSelesai)}`;
        const notif = p.notifOperator ? ` · ${p.notifOperator}` : '';
        banners.push({
          type: 'info',
          icon: 'event_available',
          message: `<strong>Periode Input Aktif:</strong> ${tgl}${notif}`
        });
      }
    } catch(e) { /* silent */ }
  }

  if (banners.length > 0) {
    showNotifBanner(banners);
  }
}

// ============================================================
// 2. SPLIT VIEW — layout untuk halaman verifikasi
// ============================================================
/**
 * Render halaman verifikasi sebagai split-view:
 * - Kiri (380px): daftar usulan dalam card list
 * - Kanan: detail + aksi verifikasi inline (tanpa fullscreen modal)
 *
 * Panggil ini dari renderVerifikasi() di app.js.
 *
 * @param {Array} rows        - data usulan
 * @param {string} role       - role user saat ini
 * @param {Object} user       - currentUser
 * @param {Function} onSelect - callback(u) saat card dipilih
 */
function renderSplitView(rows, role, user, onSelect) {
  const content = document.getElementById('mainContent');
  if (!content) return;

  // Override .content padding untuk split view (butuh full height)
  content.style.padding = '0';
  content.style.overflow = 'hidden';
  content.style.height = '100%';

  // Skeleton saat pertama kali
  content.innerHTML = `
    <div class="split-view" id="splitView">
      <!-- LIST PANEL -->
      <div class="split-list" id="splitListPanel">
        <div class="split-list-header">
          <div class="split-list-title">
            <span class="material-icons">verified</span>
            Daftar Usulan
            <span class="badge badge-primary" id="splitListCount" style="margin-left:4px">0</span>
          </div>
          <div class="split-list-filter" id="splitListFilter">
            <!-- Filter injeksi dari renderVerifikasi -->
          </div>
        </div>
        <div class="split-list-scroll" id="splitListScroll">
          ${renderSkeletonList(5)}
        </div>
      </div>

      <!-- DETAIL PANEL -->
      <div class="split-detail" id="splitDetailPanel">
        <div class="split-detail-empty" id="splitDetailEmpty">
          <span class="material-icons">touch_app</span>
          <p>Pilih usulan untuk melihat detail</p>
        </div>
      </div>
    </div>
  `;

  // Populate list setelah render
  setTimeout(() => {
    _renderSplitList(rows, role, user, onSelect);
  }, 0);
}

function _renderSplitList(rows, role, user, onSelect) {
  const scroll = document.getElementById('splitListScroll');
  const countEl = document.getElementById('splitListCount');
  if (!scroll) return;

  if (countEl) countEl.textContent = rows.length;

  if (!rows || rows.length === 0) {
    scroll.innerHTML = `<div class="empty-state" style="padding:40px 16px">
      <span class="material-icons">inbox</span>
      <p>Tidak ada usulan</p>
    </div>`;
    return;
  }

  scroll.innerHTML = rows.map((u, i) => {
    const needsAction =
      (role === 'kepala-puskesmas' && u.statusGlobal === 'Menunggu Kepala Puskesmas') ||
      (role === 'program' && u.statusGlobal === 'Menunggu Pengelola Program') ||
      (role === 'admin'   && u.statusGlobal === 'Menunggu Admin');
    const isDone = u.statusGlobal === 'Selesai';

    const urgentClass = needsAction ? 'usulan-card-urgent' : (isDone ? 'usulan-card-done' : '');

    const spmVal = parseFloat(u.indeksSPM || 0);
    const spmClass = spmVal < 0.6 ? 'spm-rendah' : spmVal < 0.8 ? 'spm-cukup' : 'spm-baik';
    const spmLabel = spmVal < 0.6 ? 'Rendah' : spmVal < 0.8 ? 'Cukup' : 'Baik';

    return `<div class="usulan-card ${urgentClass}" id="uc_${u.idUsulan}"
              onclick="selectSplitCard('${u.idUsulan}', this)">
      <div class="usulan-card-top">
        <span class="usulan-card-id">${u.idUsulan}</span>
        ${statusBadge(u.statusGlobal)}
      </div>
      <div class="usulan-card-pkm">${u.namaPKM || u.kodePKM}</div>
      <div class="usulan-card-periode">${u.namaBulan || ''} ${u.tahun}</div>
      <div class="usulan-card-bottom">
        <span class="spm-indicator ${spmClass}">
          <span class="material-icons" style="font-size:13px">analytics</span>
          ${spmVal.toFixed(2)} · ${spmLabel}
        </span>
        ${needsAction ? `<span class="badge badge-warning" style="animation:pulse 1.5s infinite">
          <span class="material-icons" style="font-size:12px">pending</span>Perlu Aksi
        </span>` : ''}
      </div>
    </div>`;
  }).join('');

  // Simpan data untuk diakses saat card diklik
  window._splitRows = rows;
  window._splitRole = role;
  window._splitUser = user;
  window._splitOnSelect = onSelect;

  // Otomatis pilih card pertama yang butuh aksi
  const firstAction = rows.find(u =>
    (role === 'kepala-puskesmas' && u.statusGlobal === 'Menunggu Kepala Puskesmas') ||
    (role === 'program' && u.statusGlobal === 'Menunggu Pengelola Program') ||
    (role === 'admin'   && u.statusGlobal === 'Menunggu Admin')
  );
  if (firstAction) {
    const el = document.getElementById('uc_' + firstAction.idUsulan);
    if (el) setTimeout(() => el.click(), 100);
  }
}

/**
 * Dipanggil saat card di list diklik.
 * Menampilkan detail di panel kanan, tanpa fullscreen modal.
 */
window.selectSplitCard = function(idUsulan, cardEl) {
  // Aktifkan card
  document.querySelectorAll('.usulan-card').forEach(c => c.classList.remove('active'));
  if (cardEl) cardEl.classList.add('active');

  const u = (window._splitRows || []).find(r => r.idUsulan === idUsulan);
  if (!u) return;

  // Di mobile: sembunyikan list, tampilkan detail
  const listPanel = document.getElementById('splitListPanel');
  if (window.innerWidth <= 768) {
    listPanel?.classList.add('hidden-mobile');
  }

  // Load detail ke panel kanan
  const detail = document.getElementById('splitDetailPanel');
  if (!detail) return;

  const role = window._splitRole || '';
  const user = window._splitUser || currentUser;

  detail.innerHTML = `
    <div class="split-detail-header">
      <button class="split-detail-back" onclick="backToSplitList()" style="display:inline-flex">
        <span class="material-icons">arrow_back</span>Kembali
      </button>
      <div class="split-detail-title">${u.namaPKM || u.kodePKM} · ${u.namaBulan} ${u.tahun}</div>
      <div style="display:flex;gap:6px;align-items:center">
        ${getDownloadBtn(u, 20, role, user.indikatorAkses)}
        <button class="btn-icon" onclick="openLogAktivitas('${idUsulan}')" title="Riwayat Aktivitas">
          <span class="material-icons" style="font-size:19px">history</span>
        </button>
      </div>
    </div>
    <div class="split-detail-body" id="splitDetailBody">
      ${renderSkeletonDetail()}
    </div>
    <div class="split-detail-footer" id="splitDetailFooter"></div>
  `;

  // Load detail dari API
  _loadSplitDetail(u, role, user);
};

async function _loadSplitDetail(u, role, user) {
  const body = document.getElementById('splitDetailBody');
  const footer = document.getElementById('splitDetailFooter');
  if (!body) return;

  try {
    const [detail, indikators] = await Promise.all([
      API.getDetailUsulan(u.idUsulan),
      API.getIndikatorUsulan(u.idUsulan)
    ]);

    const d = detail || u;

    // --- Info grid ---
    const spmVal = parseFloat(d.indeksSPM || 0);
    const spmClass = spmVal < 0.6 ? 'spm-rendah' : spmVal < 0.8 ? 'spm-cukup' : 'spm-baik';
    const spmLabel = spmVal < 0.6 ? 'Rendah' : spmVal < 0.8 ? 'Cukup' : 'Baik';

    let html = `
      <div class="detail-grid">
        <div class="detail-field">
          <span class="detail-label">ID Usulan</span>
          <span class="detail-value" style="font-family:'JetBrains Mono',monospace;font-size:12px">${u.idUsulan}</span>
        </div>
        <div class="detail-field">
          <span class="detail-label">Puskesmas</span>
          <span class="detail-value">${u.namaPKM || u.kodePKM}</span>
        </div>
        <div class="detail-field">
          <span class="detail-label">Periode</span>
          <span class="detail-value">${u.namaBulan} ${u.tahun}</span>
        </div>
        <div class="detail-field">
          <span class="detail-label">Indeks SPM</span>
          <span class="detail-value">
            <span class="spm-indicator ${spmClass}">
              <span class="material-icons" style="font-size:13px">analytics</span>
              ${spmVal.toFixed(3)} · ${spmLabel}
            </span>
          </span>
        </div>
        <div class="detail-field" style="grid-column:1/-1">
          <span class="detail-label">Progress Verifikasi</span>
          <div style="margin-top:4px">${renderStatusBar(u)}</div>
        </div>
      </div>
    `;

    // --- Riwayat catatan thread ---
    html += `<div id="splitCatatanThread" style="margin-bottom:16px"></div>`;

    // --- Penolakan banner jika ada ---
    if (d.penolakanIndikator && d.penolakanIndikator.length > 0) {
      const aktif = d.penolakanIndikator.filter(p => !p.aksi || p.aksi === 'tolak');
      if (aktif.length > 0) {
        html += `<div class="penolakan-banner" style="margin-bottom:16px">
          <div class="penolakan-banner-header">
            <span class="material-icons">cancel</span>
            Alasan Penolakan dari ${d.ditolakOleh || 'Verifikator'}
          </div>
          ${aktif.map(p => `<div class="penolakan-row">
            <span class="penolakan-ind-badge">Ind. #${p.noIndikator}</span>
            <span class="penolakan-alasan">${p.alasan || '-'}</span>
          </div>`).join('')}
        </div>`;
      }
    }

    // --- Tabel indikator ---
    html += `<div class="detail-section"><span class="material-icons">list_alt</span>Detail Indikator</div>`;
    if (indikators && indikators.length > 0) {
      html += `<div class="table-container">
        <table>
          <thead><tr>
            <th>No</th><th>Indikator</th>
            <th style="text-align:center">Target</th>
            <th style="text-align:center">Realisasi</th>
            <th style="text-align:center">Capaian</th>
            <th style="text-align:center">Bukti</th>
          </tr></thead>
          <tbody>
            ${indikators.map(ind => {
              const capaian = fmtCapaianPct(ind.realisasi, ind.target);
              const capNum = ind.target > 0 ? ((ind.realisasi / ind.target) * 100) : 0;
              const capColor = capNum >= 100 ? 'var(--success)' : capNum >= 60 ? 'var(--warning)' : 'var(--danger)';
              return `<tr>
                <td style="font-weight:700;color:var(--text-light)">${ind.noIndikator}</td>
                <td style="max-width:200px;font-size:12.5px">${ind.namaIndikator || '-'}</td>
                <td style="text-align:center;font-family:'JetBrains Mono',monospace;font-size:12.5px">${ind.target ?? '-'}</td>
                <td style="text-align:center;font-family:'JetBrains Mono',monospace;font-size:12.5px">${ind.realisasi ?? '-'}</td>
                <td style="text-align:center;font-weight:700;color:${capColor}">${capaian}</td>
                <td style="text-align:center">
                  ${ind.fileUrl ? `<button class="btn-icon view" onclick="previewFile('${ind.fileUrl}','${ind.fileName||'bukti'}')" title="Lihat Bukti" style="min-width:36px;min-height:36px">
                    <span class="material-icons" style="font-size:17px">attachment</span>
                  </button>` : `<span style="color:var(--text-xlight);font-size:12px">—</span>`}
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
    }

    body.innerHTML = html;

    // Load catatan thread (vertikal, bukan zigzag)
    renderCatatanThread('splitCatatanThread', u.idUsulan, currentUser.role);

    // --- Footer aksi ---
    _renderSplitFooter(u, d, role, user, footer);

  } catch(e) {
    body.innerHTML = `<div class="empty-state"><span class="material-icons" style="color:var(--danger)">error</span><p>Gagal memuat detail: ${e.message}</p></div>`;
  }
}

function _renderSplitFooter(u, d, role, user, footer) {
  if (!footer) return;

  const canVerif =
    (role === 'kepala-puskesmas' && u.statusGlobal === 'Menunggu Kepala Puskesmas') ||
    (role === 'program' && u.statusGlobal === 'Menunggu Pengelola Program') ||
    (role === 'admin'   && u.statusGlobal === 'Menunggu Admin');

  const sudahVerif = u.statusGlobal === 'Selesai' ||
    (role === 'kepala-puskesmas' && u.statusKapus === 'Selesai');

  const btns = [];

  if (canVerif) {
    btns.push(`<button class="btn btn-danger" onclick="openVerifikasi('${u.idUsulan}')">
      <span class="material-icons">cancel</span>Tolak
    </button>`);
    btns.push(`<button class="btn btn-success" onclick="openVerifikasi('${u.idUsulan}')">
      <span class="material-icons">check_circle</span>Setujui
    </button>`);
  } else if (sudahVerif) {
    btns.push(`<span class="badge badge-success" style="padding:8px 14px;font-size:13px">
      <span class="material-icons" style="font-size:16px">verified</span>Sudah Diverifikasi
    </span>`);
  } else {
    btns.push(`<span style="font-size:13px;color:var(--text-xlight);display:flex;align-items:center;gap:6px">
      <span class="material-icons" style="font-size:17px">lock</span>Menunggu tahap sebelumnya
    </span>`);
  }

  footer.innerHTML = btns.join('');
}

/**
 * Kembali ke list panel di mobile
 */
window.backToSplitList = function() {
  const listPanel = document.getElementById('splitListPanel');
  listPanel?.classList.remove('hidden-mobile');
  // Reset detail panel
  const detail = document.getElementById('splitDetailPanel');
  if (detail) {
    detail.innerHTML = `<div class="split-detail-empty" id="splitDetailEmpty">
      <span class="material-icons">touch_app</span>
      <p>Pilih usulan untuk melihat detail</p>
    </div>`;
  }
  // Deaktivasi semua card
  document.querySelectorAll('.usulan-card').forEach(c => c.classList.remove('active'));
};

// ============================================================
// 3. CATATAN THREAD VERTIKAL — override fungsi lama
// ============================================================
/**
 * Override renderCatatanThread() dengan layout vertikal (chat-style).
 * Jauh lebih mudah dibaca dari zigzag 10-kolom sebelumnya.
 */
async function renderCatatanThread(elId, idUsulan, currentRole) {
  const el = document.getElementById(elId);
  if (!el) return;

  const AKSI_CHAT = ['Tolak','Tolak (sebagian)','Sanggah','Sanggah Selesai','Ajukan Ulang','Kembalikan','Tolak Ke Operator','Tolak Indikator','Approve','Re-verifikasi'];
  const APPROVE_SKIP = ['Semua indikator disetujui'];

  let logs = [];
  try {
    const data = await API.getLogAktivitas(idUsulan);
    logs = (data.logs || []).filter(l => {
      if (!AKSI_CHAT.includes(l.aksi) || !l.detail || !l.detail.trim()) return false;
      if (l.aksi === 'Approve') return !APPROVE_SKIP.includes(l.detail.trim());
      return true;
    });
  } catch(e) { return; }

  if (!logs.length) { el.style.display = 'none'; el.innerHTML = ''; return; }

  const roleKey = {
    'Operator':          'operator',
    'Kepala Puskesmas':  'kapus',
    'Pengelola Program': 'program',
    'Admin':             'admin',
  };
  const aksiIcon = {
    'Tolak':'cancel','Tolak (sebagian)':'remove_circle','Sanggah':'gavel',
    'Sanggah Selesai':'check_circle','Ajukan Ulang':'restart_alt',
    'Kembalikan':'undo','Tolak Ke Operator':'reply','Tolak Indikator':'cancel',
    'Approve':'check_circle','Re-verifikasi':'update',
  };

  function fmtDT(ts) {
    const d = new Date(ts), o = { timeZone: 'Asia/Makassar' };
    const tgl = d.toLocaleDateString('id-ID',{...o,day:'2-digit',month:'2-digit',year:'numeric'});
    const jam = d.toLocaleTimeString('id-ID',{...o,hour:'2-digit',minute:'2-digit',hour12:false});
    return tgl + ' ' + jam + ' WITA';
  }

  const bubbles = logs.map((log, i) => {
    const rk = roleKey[log.role] || 'admin';
    const icon = aksiIcon[log.aksi] || 'chat';
    const nama = log.user_nama || log.user_email || '-';
    const initial = (nama[0] || '?').toUpperCase();
    const isLast = i === logs.length - 1;

    return `<div class="catatan-bubble">
      <div class="catatan-avatar-col">
        <div class="catatan-avatar catatan-avatar-${rk}">${initial}</div>
        ${!isLast ? `<div class="catatan-connector"></div>` : ''}
      </div>
      <div class="catatan-body">
        <div class="catatan-meta">
          <span class="catatan-nama">${nama}</span>
          <span class="catatan-role-badge catatan-role-${rk}">${log.role}</span>
          <span class="catatan-aksi-badge catatan-role-${rk}">
            <span class="material-icons">${icon}</span>${log.aksi}
          </span>
          <span class="catatan-waktu">${fmtDT(log.timestamp)}</span>
        </div>
        <div class="catatan-card catatan-border-${rk}">${log.detail}</div>
      </div>
    </div>`;
  }).join('');

  el.innerHTML = `
    <div style="background:var(--border-light);border-radius:10px;padding:12px 14px;margin-bottom:4px">
      <div style="display:flex;align-items:center;gap:7px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid var(--border)">
        <span class="material-icons" style="font-size:16px;color:var(--text-light)">forum</span>
        <span style="font-size:12.5px;font-weight:700;color:var(--text-md)">Riwayat Catatan</span>
        <span style="font-size:11px;color:var(--text-xlight)">${logs.length} catatan</span>
      </div>
      <div class="catatan-thread">${bubbles}</div>
    </div>
  `;
  el.style.display = 'block';
}

// ============================================================
// 4. SKELETON LOADERS
// ============================================================
function renderSkeletonList(count = 4) {
  return Array.from({length: count}, (_, i) => `
    <div class="skeleton-usulan-card">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px">
        <div class="skeleton" style="width:100px;height:12px;border-radius:4px"></div>
        <div class="skeleton" style="width:70px;height:18px;border-radius:20px"></div>
      </div>
      <div class="skeleton" style="width:70%;height:14px;border-radius:4px;margin-bottom:6px"></div>
      <div class="skeleton" style="width:45%;height:12px;border-radius:4px;margin-bottom:10px"></div>
      <div style="display:flex;justify-content:space-between">
        <div class="skeleton" style="width:80px;height:20px;border-radius:20px"></div>
        <div class="skeleton" style="width:60px;height:20px;border-radius:20px"></div>
      </div>
    </div>
  `).join('');
}

function renderSkeletonDetail() {
  return `
    <div class="skeleton-card">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
        ${Array.from({length: 4}, () => `
          <div>
            <div class="skeleton skeleton-line short" style="height:10px;margin-bottom:5px"></div>
            <div class="skeleton skeleton-line medium" style="height:14px"></div>
          </div>
        `).join('')}
        <div style="grid-column:1/-1">
          <div class="skeleton skeleton-line short" style="height:10px;margin-bottom:5px"></div>
          <div class="skeleton" style="height:36px;width:100%;border-radius:8px"></div>
        </div>
      </div>
    </div>
    <div class="skeleton" style="height:14px;width:120px;border-radius:4px;margin-bottom:10px"></div>
    ${Array.from({length: 5}, () => `
      <div style="display:flex;gap:8px;padding:10px 0;border-bottom:1px solid var(--border-light);align-items:center">
        <div class="skeleton" style="width:24px;height:14px;border-radius:4px;flex-shrink:0"></div>
        <div class="skeleton" style="flex:1;height:13px;border-radius:4px"></div>
        <div class="skeleton" style="width:50px;height:13px;border-radius:4px"></div>
        <div class="skeleton" style="width:50px;height:13px;border-radius:4px"></div>
        <div class="skeleton" style="width:50px;height:13px;border-radius:4px"></div>
      </div>
    `).join('')}
  `;
}

function renderSkeletonStats(count = 4) {
  return `<div class="stats-grid">
    ${Array.from({length: count}, () => `
      <div class="skeleton" style="height:90px;border-radius:var(--radius-lg)"></div>
    `).join('')}
  </div>`;
}

// ============================================================
// 5. SPM INDICATOR HELPER
// ============================================================
/**
 * Buat badge SPM dengan color coding otomatis.
 * Nilai < 0.6 = merah, 0.6–0.8 = kuning, > 0.8 = hijau.
 */
function spmIndicator(nilai, showLabel = true) {
  const val = parseFloat(nilai) || 0;
  const cls = val < 0.6 ? 'spm-rendah' : val < 0.8 ? 'spm-cukup' : 'spm-baik';
  const label = val < 0.6 ? 'Rendah' : val < 0.8 ? 'Cukup' : 'Baik';
  return `<span class="spm-indicator ${cls}">
    <span class="material-icons" style="font-size:13px">analytics</span>
    ${val.toFixed(3)}${showLabel ? ` · ${label}` : ''}
  </span>`;
}

// ============================================================
// 6. STAT CARD CLICKABLE — override fungsi lama
// ============================================================
/**
 * Override statCard() di app.js.
 * Ditambahkan: clickable (navigasi ke halaman terkait) dan tooltip.
 *
 * @param {string} color   - 'blue'|'green'|'orange'|'purple'|'red'|'cyan'
 * @param {string} icon    - material icon name
 * @param {string} label   - judul kartu
 * @param {*}      value   - nilai yang ditampilkan
 * @param {string} [sub]   - subtitle kecil di bawah nilai
 * @param {string} [link]  - page id untuk loadPage() saat diklik, opsional
 */
function statCard(color, icon, label, value, sub = null, link = null) {
  const gradients = {
    blue:   'linear-gradient(135deg,#0d9488,#06b6d4)',
    green:  'linear-gradient(135deg,#059669,#10b981)',
    orange: 'linear-gradient(135deg,#ea580c,#f97316)',
    purple: 'linear-gradient(135deg,#7c3aed,#a78bfa)',
    cyan:   'linear-gradient(135deg,#0891b2,#06b6d4)',
    red:    'linear-gradient(135deg,#dc2626,#f87171)',
  };
  const grad = gradients[color] || gradients.blue;
  const clickable = link ? `stat-card-clickable" onclick="loadPage('${link}')" title="Klik untuk lihat detail` : '';

  return `<div class="stat-card stat-card-gradient ${clickable}" style="background:${grad};border:none">
    <div class="stat-card-value-wrap">
      <div class="stat-card-value">${value ?? 0}</div>
      ${sub !== null ? `<div class="stat-card-sub">${sub}</div>` : ''}
    </div>
    <div class="stat-card-footer">
      <div class="stat-card-label">${label}</div>
      <div class="stat-card-icon"><span class="material-icons">${icon}</span></div>
    </div>
  </div>`;
}

// ============================================================
// 7. STATUS BAR — class-based (override fungsi lama)
// ============================================================
/**
 * Override renderStatusBar() dari api.js.
 * Gunakan CSS class (bukan inline style) untuk konsistensi.
 */
function renderStatusBar(u) {
  const vp = u.vpProgress;
  const isDitolak = u.statusGlobal === 'Ditolak';

  function stepState(done, active, rejected, partial) {
    if (done)     return 'done';
    if (rejected && isDitolak) return 'rejected';
    if (partial)  return 'active'; // partial pakai warna sama
    if (active)   return 'active';
    return '';
  }

  const steps = [
    { label: 'Input', icon: 'edit_note',
      state: stepState(true, u.statusGlobal === 'Draft', false, false) },
    { label: 'Kepala PKM', icon: 'person',
      state: stepState(u.statusKapus === 'Selesai', u.statusGlobal === 'Menunggu Kepala Puskesmas', u.statusKapus === 'Ditolak', false) },
    { label: 'Pengelola', icon: 'groups',
      state: stepState(u.statusProgram === 'Selesai', u.statusGlobal === 'Menunggu Pengelola Program', u.statusProgram === 'Ditolak',
        vp && vp.selesai > 0 && vp.selesai < vp.total),
      vpText: vp ? `${vp.selesai}/${vp.total}` : '' },
    { label: 'Admin', icon: 'admin_panel_settings',
      state: stepState(u.statusGlobal === 'Selesai', u.statusGlobal === 'Menunggu Admin', false, false) },
  ];

  const stateIcon = {
    done:     'check_circle',
    active:   'hourglass_top',
    rejected: 'cancel',
    '':       null, // pakai icon default step
  };

  return `<div class="status-bar">
    ${steps.map((s, i) => {
      const icon = stateIcon[s.state] || s.icon;
      return `<div class="status-step ${s.state}">
        <div class="status-step-circle">
          <span class="material-icons">${icon}</span>
        </div>
        <span class="status-step-label">${s.label}${s.vpText ? ` ${s.vpText}` : ''}</span>
      </div>
      ${i < steps.length - 1 ? `<div class="status-step-connector"></div>` : ''}`;
    }).join('')}
  </div>`;
}

// ============================================================
// 8. PATCH startApp() — ganti popup dengan banner
// ============================================================
/**
 * Patch fungsi startApp() untuk memanggil showLoginNotifications()
 * setelah app siap, menggantikan setTimeout popup lama.
 */
(function patchStartApp() {
  const _origStartApp = window.startApp || function(){};
  window.startApp = function() {
    _origStartApp.call(this, ...arguments);
    // Delay sedikit agar DOM siap
    setTimeout(() => showLoginNotifications(), 600);
  };
})();

// ============================================================
// 9. FILTER SPLIT VIEW — helper untuk filter dalam list panel
// ============================================================
/**
 * Inject filter bar ke dalam split list header.
 * Dipanggil dari renderVerifikasi() setelah split view dibuat.
 */
function injectSplitFilter(allRows, role, user) {
  const filterContainer = document.getElementById('splitListFilter');
  if (!filterContainer) return;

  filterContainer.innerHTML = `
    <input type="text" class="form-control" id="splitSearch"
      placeholder="Cari puskesmas..." style="height:34px;font-size:12.5px;flex:1;min-width:120px"
      oninput="filterSplitList()">
    <select class="form-control" id="splitStatusFilter"
      style="height:34px;font-size:12.5px;width:auto"
      onchange="filterSplitList()">
      <option value="">Semua Status</option>
      <option value="perlu-aksi">Perlu Aksi</option>
      <option value="Selesai">Selesai</option>
      <option value="Ditolak">Ditolak</option>
    </select>
  `;

  window._splitAllRows = allRows;

  window.filterSplitList = function() {
    const q = (document.getElementById('splitSearch')?.value || '').toLowerCase();
    const st = document.getElementById('splitStatusFilter')?.value || '';
    const rows = window._splitAllRows || [];

    const filtered = rows.filter(u => {
      const matchQ = !q ||
        (u.namaPKM || '').toLowerCase().includes(q) ||
        (u.idUsulan || '').toLowerCase().includes(q);
      let matchSt = true;
      if (st === 'perlu-aksi') {
        matchSt =
          (role === 'kepala-puskesmas' && u.statusGlobal === 'Menunggu Kepala Puskesmas') ||
          (role === 'program' && u.statusGlobal === 'Menunggu Pengelola Program') ||
          (role === 'admin'   && u.statusGlobal === 'Menunggu Admin');
      } else if (st) {
        matchSt = u.statusGlobal === st;
      }
      return matchQ && matchSt;
    });

    _renderSplitList(filtered, role, user, window._splitOnSelect);
    const countEl = document.getElementById('splitListCount');
    if (countEl) countEl.textContent = filtered.length;
  };
}

// ============================================================
// 10. RESET CONTENT PADDING saat keluar dari split view
// ============================================================
/**
 * Panggil ini saat navigasi keluar dari halaman verifikasi
 * untuk mengembalikan padding content ke default.
 */
function resetContentPadding() {
  const content = document.getElementById('mainContent');
  if (content) {
    content.style.padding = '';
    content.style.overflow = '';
    content.style.height = '';
  }
}

// Patch loadPage agar reset padding saat pindah halaman
(function patchLoadPage() {
  const _orig = window.loadPage || function(){};
  window.loadPage = function(page) {
    if (page !== 'verifikasi') resetContentPadding();
    return _orig.call(this, page);
  };
})();

// ============================================================
// 11. PATCH renderVerifikasi — pakai split-view layout
// ============================================================
(function patchRenderVerifikasi() {
  const _tryPatch = () => {
    if (typeof renderVerifikasi !== 'function') {
      setTimeout(_tryPatch, 100);
      return;
    }

    window.renderVerifikasi = async function() {
      const role = currentUser.role;
      const content = document.getElementById('mainContent');
      if (!content) return;

      const verifRole =
        role === 'Kepala Puskesmas' ? 'kepala-puskesmas' :
        role === 'Pengelola Program' ? 'program' : 'admin';

      // Buat wrapper flex column
      content.innerHTML = `
        <div id="verifPageHeader" style="padding:14px 20px 0;flex-shrink:0;background:var(--surface);border-bottom:1px solid var(--border)">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <h2 style="font-size:16px;font-weight:800;display:flex;align-items:center;gap:8px;margin:0">
              <span class="material-icons" style="color:var(--primary);font-size:20px">verified</span>
              Verifikasi Usulan
              ${role === 'Pengelola Program' ? `<span style="font-size:12px;font-weight:500;color:var(--text-light)">— Ind. ${currentUser.indikatorAksesString || 'Semua'}</span>` : ''}
            </h2>
          </div>
          ${role === 'Admin' ? `<div class="tabs" id="verifTabs" style="margin-bottom:0;border-bottom:none">
            <div class="tab active" onclick="switchVerifTab('semua',this)">Semua</div>
            <div class="tab" onclick="switchVerifTab('Menunggu Admin',this)">Menunggu Admin</div>
            <div class="tab" onclick="switchVerifTab('Selesai',this)">Selesai</div>
            <div class="tab" onclick="switchVerifTab('Ditolak',this)">Ditolak</div>
          </div>` : ''}
          ${role === 'Kepala Puskesmas' ? `<div class="tabs" id="verifTabs" style="margin-bottom:0;border-bottom:none">
            <div class="tab active" onclick="switchVerifTab('semua',this)">Semua Usulan</div>
            <div class="tab" onclick="switchVerifTab('Menunggu Kepala Puskesmas',this)">Menunggu Verifikasi</div>
          </div>` : ''}
        </div>
        <div id="splitViewContainer" style="flex:1;overflow:hidden;display:flex;min-height:0"></div>
      `;

      content.style.cssText = 'padding:0;overflow:hidden;height:100%;display:flex;flex-direction:column';

      await _loadVerifSplitData('semua', verifRole);
    };

    window.switchVerifTab = async function(status, el) {
      document.querySelectorAll('#verifTabs .tab').forEach(t => t.classList.remove('active'));
      if (el) el.classList.add('active');
      const role = currentUser.role;
      const verifRole =
        role === 'Kepala Puskesmas' ? 'kepala-puskesmas' :
        role === 'Pengelola Program' ? 'program' : 'admin';
      await _loadVerifSplitData(status, verifRole);
    };

    async function _loadVerifSplitData(status, verifRole) {
      const container = document.getElementById('splitViewContainer');
      if (!container) return;
      const role = currentUser.role;

      const params = {};
      if (role === 'Kepala Puskesmas') {
        if (currentUser.kodePKM) params.kode_pkm = currentUser.kodePKM;
        params.email_kepala = currentUser.email;
        if (status && status !== 'semua') params.status = status;
      } else if (role === 'Pengelola Program') {
        params.status_program = 'Menunggu Pengelola Program,Ditolak,Selesai,Menunggu Admin';
        params.email_program = currentUser.email;
      } else if (role === 'Admin' && status !== 'semua') {
        params.status = status;
      }

      // Skeleton
      container.innerHTML = `<div style="flex:1;display:flex;overflow:hidden">
        <div class="split-list"><div class="split-list-header"><div class="split-list-title"><span class="material-icons">hourglass_empty</span>Memuat...</div></div>
        <div class="split-list-scroll">${renderSkeletonList(6)}</div></div>
        <div class="split-detail"><div class="split-detail-empty"><span class="material-icons">touch_app</span><p>Pilih usulan</p></div></div>
      </div>`;

      try {
        const rows = await API.getUsulan(params);

        container.innerHTML = `
          <div class="split-list" id="splitListPanel">
            <div class="split-list-header">
              <div class="split-list-title">
                <span class="material-icons">list_alt</span>
                Daftar Usulan
                <span class="badge badge-primary" id="splitListCount" style="margin-left:4px">${rows.length}</span>
              </div>
              <div class="split-list-filter" id="splitListFilter"></div>
            </div>
            <div class="split-list-scroll" id="splitListScroll"></div>
          </div>
          <div class="split-detail" id="splitDetailPanel">
            <div class="split-detail-empty" id="splitDetailEmpty">
              <span class="material-icons">touch_app</span>
              <p>Pilih usulan untuk melihat detail</p>
            </div>
          </div>
        `;

        window._splitRows = rows;
        window._splitRole = verifRole;
        window._splitUser = currentUser;

        injectSplitFilter(rows, verifRole, currentUser);
        _renderSplitList(rows, verifRole, currentUser, null);

        // Auto-select card yang butuh aksi
        const needsAction = rows.find(u =>
          (verifRole === 'kepala-puskesmas' && u.statusGlobal === 'Menunggu Kepala Puskesmas') ||
          (verifRole === 'program'          && u.statusGlobal === 'Menunggu Pengelola Program') ||
          (verifRole === 'admin'            && u.statusGlobal === 'Menunggu Admin')
        );
        if (needsAction) {
          setTimeout(() => {
            const el = document.getElementById('uc_' + needsAction.idUsulan);
            if (el) el.click();
          }, 150);
        }

      } catch(e) {
        container.innerHTML = `<div class="empty-state" style="flex:1">
          <span class="material-icons" style="color:var(--danger)">error</span>
          <p>Gagal memuat: ${e.message}</p>
        </div>`;
      }
    }
  };

  _tryPatch();
})();

// ============================================================
// 12. PATCH loadVerifTab — delegate ke switchVerifTab
// ============================================================
(function patchLoadVerifTab() {
  const _try = () => {
    if (typeof loadVerifTab !== 'function') { setTimeout(_try, 150); return; }
    window.loadVerifTab = function(status, el) {
      if (typeof window.switchVerifTab === 'function') {
        window.switchVerifTab(status, el);
      }
    };
  };
  _try();
})();

// ============================================================
// 13. API helper tambahan (jika belum ada di api.js)
// ============================================================
// Pastikan API.getDetailUsulan dan API.getIndikatorUsulan tersedia
// (seharusnya sudah ada di api.js — ini hanya fallback safety)
if (typeof API !== 'undefined' && !API.getDetailUsulan) {
  API.getDetailUsulan = async (id) => {
    const r = await fetch(`/api/usulan?action=detail&id=${id}`);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    return d.data || d;
  };
}
if (typeof API !== 'undefined' && !API.getIndikatorUsulan) {
  API.getIndikatorUsulan = async (id) => {
    const r = await fetch(`/api/indikator?idUsulan=${id}`);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    return d.data || d || [];
  };
}

// ============================================================
// 14. Dark Mode CSS Injection
// ============================================================
// Karena banyak komponen di app.js pakai inline style dengan warna hardcode,
// kita inject CSS khusus yang override dengan [data-theme="dark"] + !important
(function injectDarkModeCSS() {
  const styleId = 'vispm-dark-mode-overrides';
  if (document.getElementById(styleId)) return;

  const css = `
/* ===== DARK MODE OVERRIDES — mengatasi inline style di app.js ===== */
[data-theme="dark"] #mainContent,
[data-theme="dark"] .main-content {
  background: transparent !important;
}

/* Topbar inline white bg */
[data-theme="dark"] #topbar,
[data-theme="dark"] .topbar {
  background: #1a2a2a !important;
  border-bottom-color: #2a3a3a !important;
}

/* Kartu dashboard dengan background:white inline */
[data-theme="dark"] [style*="background:white"],
[data-theme="dark"] [style*="background: white"],
[data-theme="dark"] [style*="background:#ffffff"],
[data-theme="dark"] [style*="background: #ffffff"],
[data-theme="dark"] [style*="background:#fff"],
[data-theme="dark"] [style*="background: #fff"] {
  background: #1a2a2a !important;
}

/* Text warna gelap */
[data-theme="dark"] [style*="color:#0f172a"],
[data-theme="dark"] [style*="color: #0f172a"],
[data-theme="dark"] [style*="color:#1e293b"],
[data-theme="dark"] [style*="color:#334155"],
[data-theme="dark"] [style*="color:#1f2937"],
[data-theme="dark"] [style*="color:#111827"] {
  color: #c8ddd9 !important;
}

/* Border abu-abu */
[data-theme="dark"] [style*="border:1px solid #e2e8f0"],
[data-theme="dark"] [style*="border: 1px solid #e2e8f0"],
[data-theme="dark"] [style*="border-bottom:1px solid #e2e8f0"],
[data-theme="dark"] [style*="border-top:1px solid #e2e8f0"],
[data-theme="dark"] [style*="border-right:1px solid #e2e8f0"] {
  border-color: #2a3a3a !important;
}

/* Background abu muda (tabel, card header) */
[data-theme="dark"] [style*="background:#f8fafc"],
[data-theme="dark"] [style*="background: #f8fafc"],
[data-theme="dark"] [style*="background:#f1f5f9"],
[data-theme="dark"] [style*="background: #f1f5f9"],
[data-theme="dark"] [style*="background:#f0f9ff"],
[data-theme="dark"] [style*="background: #f0f9ff"],
[data-theme="dark"] [style*="background:#edf7f6"],
[data-theme="dark"] [style*="background: #edf7f6"],
[data-theme="dark"] [style*="background:#f0fdf9"],
[data-theme="dark"] [style*="background: #f0fdf9"] {
  background: #0f2020 !important;
}

/* Tabel */
[data-theme="dark"] table { background: #1a2a2a !important; }
[data-theme="dark"] thead th {
  background: #0f2020 !important;
  color: #7a9e9a !important;
  border-color: #2a3a3a !important;
}
[data-theme="dark"] tbody td {
  border-color: #1e2e2e !important;
  color: #c8ddd9 !important;
}
[data-theme="dark"] tbody tr:hover td { background: #1e2e2e !important; }
[data-theme="dark"] tbody tr:nth-child(even) td { background: #162424 !important; }

/* Master data tab shell */
[data-theme="dark"] [style*="background:white;border-radius:12px"],
[data-theme="dark"] [style*="background: white;border-radius:12px"] {
  background: #1a2a2a !important;
  box-shadow: 0 1px 4px rgba(0,0,0,0.3) !important;
}
[data-theme="dark"] [style*="border-bottom:1px solid #e2e8f0"],
[data-theme="dark"] [style*="border-bottom: 1px solid #e2e8f0"] {
  border-color: #2a3a3a !important;
}

/* Tab buttons di master data */
[data-theme="dark"] #masterTabContent { color: #c8ddd9 !important; }
[data-theme="dark"] button[id^="masterTab_"] {
  color: #7a9e9a !important;
}
[data-theme="dark"] button[id^="masterTab_"][style*="color:var(--primary)"],
[data-theme="dark"] button[id^="masterTab_"][style*="color: var(--primary)"],
[data-theme="dark"] button[id^="masterTab_"][style*="border-bottom:3px solid var(--primary)"] {
  color: #0d9488 !important;
  border-bottom-color: #0d9488 !important;
}

/* Input dan form di dark mode */
[data-theme="dark"] input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),
[data-theme="dark"] select,
[data-theme="dark"] textarea {
  background: #0f2020 !important;
  border-color: #2a3a3a !important;
  color: #c8ddd9 !important;
}
[data-theme="dark"] input::placeholder,
[data-theme="dark"] textarea::placeholder {
  color: #4a7070 !important;
}

/* Search input inline */
[data-theme="dark"] input[class*="search"],
[data-theme="dark"] .search-input {
  background: #0f2020 !important;
  border-color: #2a3a3a !important;
  color: #c8ddd9 !important;
}

/* Auth screen kanan */
[data-theme="dark"] .auth-right {
  background: #1a2a2a !important;
}
[data-theme="dark"] .auth-right h2,
[data-theme="dark"] .auth-right-sub { color: #c8ddd9 !important; }
[data-theme="dark"] .auth-field label { color: #7a9e9a !important; }
[data-theme="dark"] #authEmail,
[data-theme="dark"] #authPassword {
  background: #0f2020 !important;
  border-color: #2a3a3a !important;
  color: #c8ddd9 !important;
}

/* Modal card */
[data-theme="dark"] .modal-card {
  background: #1a2a2a !important;
}
[data-theme="dark"] .modal-header {
  background: #1a2a2a !important;
  border-bottom-color: #2a3a3a !important;
}
[data-theme="dark"] .modal-header h3 { color: #c8ddd9 !important; }
[data-theme="dark"] .modal-footer {
  background: #1a2a2a !important;
  border-top-color: #2a3a3a !important;
}
[data-theme="dark"] .modal-body { color: #c8ddd9 !important; }

/* Topbar dropdown */
[data-theme="dark"] .topbar-dropdown { background: #1a2a2a !important; border-color: #2a3a3a !important; }
[data-theme="dark"] .topbar-dropdown-header { background: #0f2020 !important; border-color: #2a3a3a !important; }
[data-theme="dark"] .topbar-dropdown-name { color: #c8ddd9 !important; }
[data-theme="dark"] .topbar-dropdown-meta { color: #7a9e9a !important; }
[data-theme="dark"] .topbar-dropdown-item { color: #c8ddd9 !important; }
[data-theme="dark"] .topbar-dropdown-item:hover { background: #0f2020 !important; }

/* Stat cards */
[data-theme="dark"] .stat-card {
  background: #1a2a2a !important;
  border-color: #2a3a3a !important;
}

/* Page header title */
[data-theme="dark"] .page-header h1 { color: #c8ddd9 !important; }
[data-theme="dark"] h1, [data-theme="dark"] h2, [data-theme="dark"] h3,
[data-theme="dark"] h4, [data-theme="dark"] h5 { color: #c8ddd9 !important; }
[data-theme="dark"] p, [data-theme="dark"] span:not(.material-icons):not(.badge):not([style*="color:#"]) {
  /* hanya override kalau tidak ada color inline */
}

/* Pagination */
[data-theme="dark"] .page-btn {
  background: #1a2a2a !important;
  border-color: #2a3a3a !important;
  color: #c8ddd9 !important;
}
[data-theme="dark"] .page-btn.active { background: #0d9488 !important; color: white !important; }

/* Split view */
[data-theme="dark"] .split-view { background: transparent !important; }
[data-theme="dark"] .split-list { background: #1a2a2a !important; border-color: #2a3a3a !important; }
[data-theme="dark"] .split-list-header { background: #1a2a2a !important; }
[data-theme="dark"] .usulan-card { background: #1a2a2a !important; border-color: #2a3a3a !important; }
[data-theme="dark"] .usulan-card.active { background: #0f2a28 !important; border-color: #0d9488 !important; }
[data-theme="dark"] .usulan-card-pkm { color: #c8ddd9 !important; }

/* Catatan thread bubble */
[data-theme="dark"] .catatan-bubble {
  background: #0f2020 !important;
  border-color: #2a3a3a !important;
}
[data-theme="dark"] .catatan-bubble.operator-bubble { background: #0f2a10 !important; }
[data-theme="dark"] .catatan-bubble.kapus-bubble { background: #1a200f !important; }
[data-theme="dark"] .catatan-bubble.pp-bubble { background: #0f151a !important; }
[data-theme="dark"] .catatan-bubble.admin-bubble { background: #1a100f !important; }

/* Notif banner */
[data-theme="dark"] .notif-banner.warning { background: #1a1400 !important; border-color: #4a3800 !important; }
[data-theme="dark"] .notif-banner.info { background: #001020 !important; border-color: #003050 !important; }
[data-theme="dark"] .notif-banner.danger { background: #1a0000 !important; border-color: #4a0000 !important; }

/* Card umum */
[data-theme="dark"] .card { background: #1a2a2a !important; border-color: #2a3a3a !important; }
[data-theme="dark"] .card-title { color: #c8ddd9 !important; }

/* Tombol secondary */
[data-theme="dark"] .btn-secondary {
  background: #1a2a2a !important;
  border-color: #2a3a3a !important;
  color: #c8ddd9 !important;
}
[data-theme="dark"] .btn-secondary:hover { background: #2a3a3a !important; }

/* Label umum */
[data-theme="dark"] label { color: #7a9e9a !important; }

/* Detail item */
[data-theme="dark"] .detail-item label { color: #4a7070 !important; }
[data-theme="dark"] .detail-item span { color: #c8ddd9 !important; }
[data-theme="dark"] .detail-grid { background: #0f2020 !important; }

/* Skeleton loader */
[data-theme="dark"] .skeleton { background: linear-gradient(90deg, #1a2a2a 25%, #2a3a3a 50%, #1a2a2a 75%) !important; }
`;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = css;
  document.head.appendChild(style);
})();
