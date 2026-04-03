// ============== NOTIFIKASI IN-APP ==============
let _notifInterval = null;
let _notifCount = 0;

async function fetchNotifCount() {
  if (!currentUser) return;
  try {
    const role = currentUser.role;
    const params = { role, email: currentUser.email, kode_pkm: currentUser.kodePKM };
    const d = await API.dashboard(params);

    let count = 0;
    if (role === 'Operator') {
      // Usulan yang ditolak dan perlu diperbaiki
      const myUsulan = await API.getUsulan({ email_operator: currentUser.email }).catch(() => []);
      count = (myUsulan || []).filter(u => ['Ditolak','Ditolak Sebagian'].includes(u.statusGlobal)).length;
    } else if (role === 'Kepala Puskesmas') {
      count = d.menunggu || 0;
    } else if (role === 'Pengelola Program') {
      const ppList = await API.getUsulan({ email_program: currentUser.email }).catch(() => []);
      count = (ppList || []).filter(u => ['Menunggu Pengelola Program','Menunggu Re-verifikasi PP'].includes(u.statusGlobal)).length;
    } else if (role === 'Admin') {
      const allUsulan = await API.getUsulan({}).catch(() => []);
      count = (allUsulan || []).filter(u => u.statusGlobal === 'Menunggu Admin').length;
    }

    _notifCount = count;
    updateNotifBadge(count);
  } catch(e) {}
}

function updateNotifBadge(count) {
  // Update badge di topbar
  let badge = document.getElementById('notifBadge');
  const btn = document.getElementById('notifBtn');
  if (!btn) return;

  if (count > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.id = 'notifBadge';
      badge.style.cssText = 'position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;background:#ef4444;color:white;border-radius:20px;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;padding:0 4px;border:2px solid white;line-height:1';
      btn.style.position = 'relative';
      btn.appendChild(badge);
    }
    badge.textContent = count > 99 ? '99+' : count;
    badge.style.display = 'flex';
  } else {
    if (badge) badge.style.display = 'none';
  }

  // Update title halaman
  const base = 'VISPM | Verifikasi Indeks SPM';
  document.title = count > 0 ? `(${count}) ${base}` : base;
}

function toggleNotifPanel() {
  let panel = document.getElementById('notifPanel');
  if (panel) {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    if (panel.style.display === 'block') loadNotifPanel();
    return;
  }

  panel = document.createElement('div');
  panel.id = 'notifPanel';
  panel.style.cssText = 'position:absolute;top:calc(100% + 8px);right:0;width:340px;background:white;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.15);border:1px solid #e2e8f0;z-index:9000;overflow:hidden';
  panel.innerHTML = `
    <div style="padding:12px 16px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between">
      <span style="font-size:14px;font-weight:700;color:#1e293b">Notifikasi</span>
      <button onclick="document.getElementById('notifPanel').style.display='none'" style="background:none;border:none;cursor:pointer;color:#94a3b8;display:flex"><span class="material-icons" style="font-size:18px">close</span></button>
    </div>
    <div id="notifPanelBody" style="max-height:360px;overflow-y:auto">
      <div style="padding:24px;text-align:center;color:#94a3b8;font-size:13px"><div style="display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;position:relative;margin-bottom:6px"><div style="width:8px;height:8px;border-radius:50%;background:#378ADD"></div><div style="position:absolute;width:7px;height:7px;border-radius:50%;background:#B5D4F4;animation:orbit-dot 1s linear infinite;transform-origin:center"></div></div><div>Memuat...</div></div>
    </div>`;

  const wrap = document.getElementById('notifBtnWrap');
  if (wrap) { wrap.style.position = 'relative'; wrap.appendChild(panel); }

  loadNotifPanel();

  // Tutup saat klik di luar
  setTimeout(() => {
    document.addEventListener('click', function handler(e) {
      const p = document.getElementById('notifPanel');
      const w = document.getElementById('notifBtnWrap');
      if (p && w && !w.contains(e.target)) {
        p.style.display = 'none';
        document.removeEventListener('click', handler);
      }
    });
  }, 100);
}

async function loadNotifPanel() {
  const el = document.getElementById('notifPanelBody');
  if (!el) return;

  try {
    const role = currentUser.role;
    const items = [];

    if (role === 'Operator') {
      const myUsulan = await API.getUsulan({ email_operator: currentUser.email }).catch(() => []);
      (myUsulan || []).filter(u => ['Ditolak','Ditolak Sebagian'].includes(u.statusGlobal)).forEach(u => {
        items.push({ icon: 'cancel', color: '#ef4444', bg: '#fef2f2',
          title: `Usulan ${u.idUsulan} Ditolak`,
          sub: `${u.namaBulan} ${u.tahun} — ${u.namaPKM}`,
          action: `openIndikatorModal('${u.idUsulan}')` });
      });
    } else if (role === 'Kepala Puskesmas') {
      const list = await API.getUsulan({ kode_pkm: currentUser.kodePKM }).catch(() => []);
      (list || []).filter(u => ['Menunggu Kepala Puskesmas','Menunggu Re-verifikasi Kepala Puskesmas'].includes(u.statusGlobal)).forEach(u => {
        items.push({ icon: 'hourglass_top', color: '#f59e0b', bg: '#fffbeb',
          title: `Menunggu Verifikasi Anda`,
          sub: `${u.idUsulan} · ${u.namaBulan} ${u.tahun}`,
          action: `loadPage('verifikasi')` });
      });
    } else if (role === 'Pengelola Program') {
      const list = await API.getUsulan({ email_program: currentUser.email }).catch(() => []);
      (list || []).filter(u => ['Menunggu Pengelola Program','Menunggu Re-verifikasi PP'].includes(u.statusGlobal)).forEach(u => {
        const isReVerif = u.statusGlobal === 'Menunggu Re-verifikasi PP';
        items.push({ icon: isReVerif ? 'replay' : 'hourglass_top', color: isReVerif ? '#ea580c' : '#2563eb', bg: isReVerif ? '#fff7ed' : '#eff6ff',
          title: isReVerif ? `Re-verifikasi diperlukan` : `Menunggu Verifikasi Program`,
          sub: `${u.idUsulan} · ${u.namaBulan} ${u.tahun}`,
          action: `loadPage('verifikasi')` });
      });
    } else if (role === 'Admin') {
      const list = await API.getUsulan({}).catch(() => []);
      (list || []).filter(u => u.statusGlobal === 'Menunggu Admin').forEach(u => {
        items.push({ icon: 'admin_panel_settings', color: '#8b5cf6', bg: '#f5f3ff',
          title: `Menunggu Persetujuan Admin`,
          sub: `${u.idUsulan} · ${u.namaPKM} · ${u.namaBulan} ${u.tahun}`,
          action: `loadPage('verifikasi')` });
      });
    }

    if (!items.length) {
      el.innerHTML = `<div style="padding:32px;text-align:center;color:#94a3b8;font-size:13px">
        <span class="material-icons" style="font-size:36px;display:block;margin-bottom:8px;color:#d1fae5">check_circle</span>
        Tidak ada notifikasi baru
      </div>`;
      return;
    }

    el.innerHTML = items.map(item => `
      <button onclick="${item.action};document.getElementById('notifPanel').style.display='none'"
        style="width:100%;display:flex;align-items:flex-start;gap:10px;padding:12px 16px;background:none;border:none;border-bottom:1px solid #f8fafc;cursor:pointer;text-align:left"
        onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='none'">
        <div style="width:34px;height:34px;border-radius:10px;background:${item.bg};display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px">
          <span class="material-icons" style="font-size:17px;color:${item.color}">${item.icon}</span>
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${item.title}</div>
          <div style="font-size:11.5px;color:#64748b;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${item.sub}</div>
        </div>
      </button>`).join('');
  } catch(e) {
    el.innerHTML = `<div style="padding:20px;text-align:center;color:#ef4444;font-size:13px">Gagal memuat notifikasi</div>`;
  }
}

function startNotifPoller() {
  fetchNotifCount();
  clearInterval(_notifInterval);
  _notifInterval = setInterval(fetchNotifCount, 60000); // cek tiap 1 menit
}