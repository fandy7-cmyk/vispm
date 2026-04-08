// ============== INPUT USULAN (OPERATOR) ==============
async function renderInput() {
  // Guard: hanya Operator yang bisa input usulan
  if (currentUser && currentUser.role === 'Kepala Puskesmas') {
    document.getElementById('mainContent').innerHTML = `<div class="empty-state"><span class="material-icons" style="font-size:48px;color:var(--text-xlight)">block</span><p>Kepala Puskesmas tidak memiliki akses untuk input usulan.</p></div>`;
    return;
  }
  let pkmList = [], periodeAktif = null, allPeriode = [], periodeOptions = [];
  try {
    [pkmList] = await Promise.all([API.getPKM(true)]);
    try {
      const periodeRes = await API.get('periode');
      allPeriode = Array.isArray(periodeRes) ? periodeRes : [];
      // Operator hanya bisa pilih periode yang benar-benar aktif hari ini atau masih dalam rentang
      // isAktifToday = status Aktif DAN dalam rentang tanggal
      periodeOptions = allPeriode.filter(p => p.isAktifToday);
      periodeAktif = allPeriode.find(p => p.isAktifToday);
    } catch(e2) { /* periode API mungkin gagal, tetap lanjut */ }
  } catch (e) { toast(e.message, 'error'); }

  const isOp = currentUser.role === 'Operator';
  const pkmSelect = isOp && currentUser.kodePKM
    ? `<select class="form-control" id="inputPKM" disabled><option value="${currentUser.kodePKM}">${currentUser.namaPKM || currentUser.kodePKM}</option></select>`
    : `<select class="form-control" id="inputPKM"><option value="">Pilih Puskesmas</option>${pkmList.map(p => `<option value="${p.kode}">${p.nama}</option>`).join('')}</select>`;

  // Tahun yang bisa dipilih: ambil dari periode berstatus Aktif
  // Jika tidak ada periode sama sekali, tampilkan tahun default
  const tahunAktif = [...new Set(periodeOptions.map(p => parseInt(p.tahun)))].sort();
  const defaultTahun = periodeAktif ? periodeAktif.tahun : (tahunAktif[0] || CURRENT_YEAR);
  const tahunSelectHtml = tahunAktif.length
    ? tahunAktif.map(y => `<option value="${y}" ${y == defaultTahun ? 'selected' : ''}>${y}</option>`).join('')
    : `<option value="${defaultTahun}">${defaultTahun}</option>`;

  // Info banner periode - tampilkan semua periode aktif (sama seperti dashboard)
  const _bSvgCal  = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
  const _bSvgOpen = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
  const _bSvgClos = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
  const _bSvgNoti = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>';
  const _bSvgWarn = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
  let periodeBanner = '';
  if (periodeOptions.length > 0) {
    const items = periodeOptions.map((pr, idx) => {
      const nm  = pr.namaBulan || pr.nama_bulan || '';
      const jm  = fmt24(pr.jamMulai  || pr.jam_mulai)  || '08:00';
      const js  = fmt24(pr.jamSelesai|| pr.jam_selesai) || '17:00';
      const mul = formatDate(pr.tanggalMulai  || pr.tanggal_mulai);
      const sel = formatDate(pr.tanggalSelesai|| pr.tanggal_selesai);
      const not = pr.notifOperator || pr.notif_operator || '';
      const timerId = `inputPeriodeTimer_${idx}`;
      return `<div style="border:1.5px solid #a7f3d0;border-radius:10px;overflow:hidden;background:var(--surface,white);box-shadow:0 1px 4px rgba(13,148,136,0.08)">`
        + `<div style="background:linear-gradient(135deg,#0d9488,#06b6d4);padding:8px 14px;color:white;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:space-between;gap:7px">`
        + `<span style="display:flex;align-items:center;gap:7px"><span style="opacity:0.9;display:flex">${_bSvgCal}</span> Periode Aktif: ${nm} ${pr.tahun}</span>`
        + `<span id="${timerId}" style="font-size:11px;font-weight:700;background:rgba(0,0,0,0.2);padding:3px 8px;border-radius:20px;letter-spacing:0.3px;white-space:nowrap">--:--:--</span>`
        + `</div>`
        + `<div style="display:grid;grid-template-columns:1fr 1fr">`
        + `<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--success-light,#f0fdf9);border-right:1px solid var(--border,#d1fae5)"><span style="color:#0d9488;display:flex;flex-shrink:0">${_bSvgOpen}</span><div><div style="font-size:10px;color:var(--text-light,#64748b);font-weight:600;text-transform:uppercase;letter-spacing:0.4px">Dibuka</div><div style="font-size:12px;font-weight:700;color:var(--text,#0f172a);">${mul} <span style="letter-spacing:0.03em">${jm}</span> WITA</div></div></div>`
        + `<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--danger-light,#fef2f2)"><span style="color:#ef4444;display:flex;flex-shrink:0">${_bSvgClos}</span><div><div style="font-size:10px;color:var(--text-light,#64748b);font-weight:600;text-transform:uppercase;letter-spacing:0.4px">Ditutup</div><div style="font-size:12px;font-weight:700;color:var(--text,#0f172a);">${sel} <span style="letter-spacing:0.03em">${js}</span> WITA</div></div></div>`
        + `</div>`
        + (not ? `<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 14px;background:var(--warning-light,#fffbeb);border-top:1px solid var(--border,#fcd34d)"><span style="color:#d97706;display:flex;flex-shrink:0;margin-top:1px">${_bSvgNoti}</span><div style="font-size:12px;color:#0f172a;line-height:1.5">${not}</div></div>` : '')
        + `</div>`;
    }).join('');
    periodeBanner = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;margin-bottom:14px">${items}</div>`;
  } else {
    periodeBanner = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;margin-bottom:4px">
        <div style="background:var(--warning-light,linear-gradient(135deg,#fffbeb,#fef3c7));border:1.5px solid var(--border,#fcd34d);border-radius:12px;padding:16px 18px;display:flex;align-items:center;gap:14px;box-shadow:0 2px 8px rgba(245,158,11,0.10)">
          <div style="width:42px;height:42px;border-radius:10px;background:var(--warning-light,#fef9c3);border:1.5px solid var(--border,#fde68a);display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <span class="material-icons" style="font-size:22px;color:#d97706">event_busy</span>
          </div>
          <div>
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#92400e;margin-bottom:2px">Periode Input</div>
            <div style="font-size:13px;font-weight:700;color:#78350f">Tidak Ada Periode Aktif</div>
            <div style="font-size:11px;color:#b45309;margin-top:2px">Hubungi Admin untuk membuka periode.</div>
          </div>
        </div>
      </div>`;
  }

  const noPeriode = periodeOptions.length === 0;

  document.getElementById('mainContent').innerHTML = `
    <div class="page-header">
      <h1 style="display:flex;align-items:center;gap:8px"><span style="color:#0d9488;display:flex"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span>Input Usulan Baru</h1>
    </div>
    ${periodeBanner}
    <div class="card">
      <div class="card-header-bar"><span class="card-title"><span class="material-icons">add_circle</span>Buat Usulan</span></div>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:16px;align-items:end">
          <div class="form-group" style="margin-bottom:0"><label>Puskesmas</label>${pkmSelect}</div>
          <div class="form-group" style="margin-bottom:0"><label>Tahun</label>
            <select class="form-control" id="inputTahun" onchange="updateBulanOptions()" ${noPeriode ? 'disabled' : ''} style="${noPeriode ? 'opacity:0.5;cursor:not-allowed;background:#f1f5f9' : ''}">
              ${tahunAktif.length ? tahunSelectHtml : `<option value="${defaultTahun}">${defaultTahun}</option>`}
            </select>
          </div>
          <div class="form-group" style="margin-bottom:0"><label>Bulan</label><select class="form-control" id="inputBulan" ${noPeriode ? 'disabled' : ''} style="${noPeriode ? 'opacity:0.5;cursor:not-allowed;background:#f1f5f9' : ''}"></select></div>
          <div style="margin-bottom:0">
            <button class="btn btn-primary" onclick="createUsulan()" ${noPeriode ? 'disabled' : ''} style="${noPeriode ? 'opacity:0.5;cursor:not-allowed' : ''}">
              <span class="material-icons">add</span>Buat Usulan
            </button>
          </div>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-header-bar"><span class="card-title"><span class="material-icons">list</span>Daftar Usulan Saya</span></div>
      <div class="card-body" style="padding:0" id="myUsulanTable"></div>
    </div>`;

  // Timer countdown untuk periode di halaman Input Usulan
  setTimeout(() => {
    window._periodeTimers = window._periodeTimers || [];
    window._periodeTimers.forEach(t => clearInterval(t));
    window._periodeTimers = [];
    periodeOptions.forEach((pr, idx) => {
      const js = fmt24(pr.jamSelesai || pr.jam_selesai) || '17:00';
      const tglRaw = pr.tanggalSelesai || pr.tanggal_selesai || '';
      const tglDate = tglRaw ? new Date(tglRaw) : null;
      if (!tglDate || isNaN(tglDate)) return;
      const [jsH, jsM] = js.split(':').map(Number);
      const _witaMs2 = tglDate.getTime() + 8 * 3600000;
      const _witaDate2 = new Date(_witaMs2);
      const _tglWITA2 = _witaDate2.getUTCFullYear() + '-'
        + String(_witaDate2.getUTCMonth()+1).padStart(2,'0') + '-'
        + String(_witaDate2.getUTCDate()).padStart(2,'0');
      const deadline = new Date(_tglWITA2 + 'T' + String(jsH).padStart(2,'0') + ':' + String(jsM).padStart(2,'0') + ':00+08:00');
      const getEl = () => document.getElementById('inputPeriodeTimer_' + idx);
      const tick = () => {
        const el2 = getEl();
        if (!el2) { clearInterval(tid); return; }
        const diff = deadline - Date.now();
        if (diff <= 0) { el2.textContent = 'Ditutup'; el2.style.background = 'rgba(239,68,68,0.35)'; clearInterval(tid); return; }
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        el2.textContent = h >= 24
          ? Math.floor(h/24) + 'h ' + String(h%24).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0')
          : String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
        el2.style.background = diff < 3600000 ? 'rgba(239,68,68,0.4)' : 'rgba(0,0,0,0.2)';
      };
      let tid;
      tid = setInterval(tick, 1000);
      tick();
      window._periodeTimers.push(tid);
    });
  }, 0);

  // Simpan semua periodeOptions (berstatus Aktif) untuk updateBulanOptions
  window._periodeInputAktif = periodeOptions;
  // Fetch usulan yang sudah ada untuk filter bulan
  try {
    const existingUsulan = await API.getUsulan({ email_operator: currentUser.email }).catch(() => []);
    window._existingUsulanBulan = (existingUsulan || []).map(u => ({ tahun: u.tahun, bulan: u.bulan }));
  } catch(e) { window._existingUsulanBulan = []; }
  setTimeout(() => updateBulanOptions(), 50);
  loadMyUsulan();
}

function updateBulanOptions() {
  const tahun = parseInt(document.getElementById('inputTahun')?.value);
  const sel = document.getElementById('inputBulan');
  if (!sel) return;
  const periodeOptions = window._periodeInputAktif || [];
  const sudahAda = (window._existingUsulanBulan || [])
    .filter(u => u.tahun == tahun)
    .map(u => parseInt(u.bulan));
  const bulanForTahun = periodeOptions.filter(p => p.tahun == tahun);
  const bulanList = bulanForTahun.length
    ? bulanForTahun
    : BULAN_NAMA.slice(1).map((m, i) => ({ bulan: i + 1, namaBulan: m }));
  const available = bulanList.filter(p => !sudahAda.includes(parseInt(p.bulan)));
  if (available.length === 0) {
    sel.innerHTML = `<option value="">— Semua bulan sudah memiliki usulan —</option>`;
    sel.disabled = true;
    const btnBuat = document.querySelector('button[onclick="createUsulan()"]');
    if (btnBuat) { btnBuat.disabled = true; btnBuat.style.opacity = '0.5'; btnBuat.style.cursor = 'not-allowed'; }
  } else {
    sel.disabled = false;
    sel.innerHTML = available.map(p => `<option value="${p.bulan}">${p.namaBulan || BULAN_NAMA[p.bulan]}</option>`).join('');
    const btnBuat = document.querySelector('button[onclick="createUsulan()"]');
    if (btnBuat) { btnBuat.disabled = false; btnBuat.style.opacity = ''; btnBuat.style.cursor = ''; }
  }
}

function _renderMyUsulanRow(u) {
  return `<tr>
          <td><span style="font-weight:600;font-size:12px;">${u.idUsulan}</span></td>
          <td>${u.namaPKM || u.kodePKM}</td>
          <td>${u.namaBulan} ${u.tahun}</td>
          <td style="min-width:220px">
            ${renderStatusBar(u)}
            ${['Ditolak','Ditolak Sebagian'].includes(u.statusGlobal) ? `
              <div style="margin-top:6px;background:var(--danger-light,#fef2f2);border:1px solid #fca5a5;border-radius:7px;overflow:hidden">
                <button onclick="(function(btn){var b=btn.nextElementSibling;var a=btn.querySelector('.ri-arrow');var open=b.style.display!=='none';b.style.display=open?'none':'block';a.style.transform=open?'rotate(0deg)':'rotate(180deg)';})(this)" style="width:100%;display:flex;align-items:center;gap:4px;padding:7px 10px;background:none;border:none;cursor:pointer;text-align:left">
                  <span class="material-icons" style="font-size:13px;color:#dc2626;flex-shrink:0">cancel</span>
                  <span style="font-size:11.5px;font-weight:700;color:#dc2626;flex:1">Ditolak oleh ${u.ditolakOleh || 'Verifikator'}</span>
                  <span class="material-icons ri-arrow" style="font-size:16px;color:#b91c1c;flex-shrink:0;transition:transform .2s">expand_more</span>
                </button>
                <div style="display:none;padding:0 10px 8px 10px">
                  ${u.alasanTolak ? `<div style="font-size:11px;color:#7f1d1d;margin-bottom:4px"><span style="font-weight:600">Alasan:</span> ${u.alasanTolak}</div>` : ''}
                  ${(() => {
                    const pi = u.penolakanIndikator || [];
                    if (u.ditolakOleh === 'Kepala Puskesmas' && pi.length) {
                      const bermasalah = pi.filter(p =>
                        p.dari_kapus === true || p.dari_kapus === 'true'
                        || p.dibuat_oleh === 'Kapus'
                        || (!p.dibuat_oleh && (!p.aksi || p.aksi === null))
                      );
                      if (bermasalah.length)
                        return `<div style="font-size:11px;font-weight:700;color:#b91c1c;margin-bottom:3px">Indikator perlu diperbaiki:</div>
                    <div style="display:flex;flex-wrap:wrap;gap:4px 8px">${bermasalah.map(p => `<span style="display:inline-flex;align-items:center;gap:4px;white-space:nowrap"><span style="background:#fecaca;color:#7f1d1d;border-radius:4px;padding:1px 6px;font-size:11px;font-weight:700">#${parseInt(p.no_indikator||p.noIndikator)}</span><span style="font-size:11px;color:#7f1d1d">${p.alasan||''}</span></span>`).join('')}</div>`;
                    }
                    if (u.ditolakOleh === 'Pengelola Program' && pi.filter(p => p.dari_kapus === true || p.dari_kapus === 'true').length) {
                      return `<div style="font-size:11px;font-weight:700;color:#b91c1c;margin-bottom:3px">Indikator perlu diperbaiki:</div>
                    <div style="display:flex;flex-wrap:wrap;gap:4px 8px">${pi.filter(p => p.dari_kapus === true || p.dari_kapus === 'true').map(p => `<span style="display:inline-flex;align-items:center;gap:4px;white-space:nowrap"><span style="background:#fecaca;color:#7f1d1d;border-radius:4px;padding:1px 6px;font-size:11px;font-weight:700">#${parseInt(p.no_indikator||p.noIndikator)}</span><span style="font-size:11px;color:#7f1d1d">${p.alasan||''}</span></span>`).join('')}</div>`;
                    }
                    return '';
                  })()}
                </div>
              </div>` : ''}
          </td>
          <td>
            <button class="btn-icon view" onclick="viewDetail('${u.idUsulan}')"><span class="material-icons">visibility</span></button>
            ${getDownloadBtn(u, 20, 'operator')}
            <button class="btn-icon" onclick="openLogAktivitas('${u.idUsulan}')" title="Riwayat Aktivitas" style="background:transparent;border:none;color:#64748b"><span class="material-icons" style="font-size:18px">history</span></button>
            ${u.statusGlobal === 'Draft' ? `<button class="btn-icon edit" onclick="openIndikatorModal('${u.idUsulan}')"><span class="material-icons">edit</span></button>` : ''}
            ${u.statusGlobal === 'Draft' ? `<button class="btn-icon del" onclick="deleteUsulan('${u.idUsulan}')"><span class="material-icons">delete</span></button>` : ''}
            ${(['Ditolak','Ditolak Sebagian'].includes(u.statusGlobal) && u.ditolakOleh !== 'Admin')
              ? `<button class="btn-icon" onclick="openIndikatorModal('${u.idUsulan}')" title="Perbaiki & Ajukan Ulang" style="background:transparent;border:none;color:#f59e0b"><span class="material-icons" style="font-size:17px">restart_alt</span></button>`
              : `<button class="btn-icon" disabled title="${u.statusGlobal === 'Menunggu Pengelola Program' || u.ditolakOleh === 'Admin' ? 'Menunggu respon Pengelola Program' : 'Tidak perlu perbaikan'}" style="background:transparent;border:none;color:#cbd5e1;opacity:0.3;cursor:not-allowed"><span class="material-icons" style="font-size:17px">restart_alt</span></button>`}
          </td>
        </tr>`;
}

function _renderMyUsulanPaged(page) {
  const tbl = document.getElementById('myUsulanTable');
  if (!tbl) return;
  const rows = window._myUsulanRows || [];
  if (!rows.length) {
    tbl.innerHTML = `<div class="empty-state" style="padding:32px"><span class="material-icons">inbox</span><p>Belum ada usulan</p></div>`;
    return;
  }
  const { items, page: p, totalPages, total } = paginateData(rows, page);
  window._myUsulanPage = p;
  tbl.innerHTML = `<div class="table-container"><table>
      <thead><tr><th>ID Usulan</th><th>Puskesmas</th><th>Periode</th><th>Progress Verifikasi</th><th>Aksi</th></tr></thead>
      <tbody>${items.map(u => _renderMyUsulanRow(u)).join('')}</tbody>
    </table></div>`
    + renderPagination('myUsulanTable', total, p, totalPages, pg => _renderMyUsulanPaged(pg));
}

async function loadMyUsulan() {
  try {
    const rows = await API.getUsulan({ email_operator: currentUser.email });
    const tbl = document.getElementById('myUsulanTable');
    if (!tbl) {
      // User mungkin sedang di dashboard, refresh dashboard saja
      if (currentUser.role === 'Operator') renderDashboard();
      return;
    }
    window._myUsulanRows = rows;
    window._myUsulanPage = 1;
    _renderMyUsulanPaged(1);
  } catch (e) { if (!window._verifSilentReload) toast(e.message, 'error'); }
}

async function createUsulan() {
  const kodePKM = document.getElementById('inputPKM').value;
  const tahun = parseInt(document.getElementById('inputTahun').value);
  const bulan = parseInt(document.getElementById('inputBulan').value);
  const namaBulanTxt = BULAN_NAMA[bulan] || 'bulan ini';
  if (!kodePKM) return toast('Pilih puskesmas terlebih dahulu', 'error');

  // Cek apakah periode yang dipilih valid (berstatus Aktif)
  const periodeOptions = window._periodeInputAktif || [];
  if (periodeOptions.length > 0) {
    const periodeValid = periodeOptions.find(p => parseInt(p.tahun) == tahun && parseInt(p.bulan) == bulan);
    if (!periodeValid) {
      toast(`Periode ${namaBulanTxt} ${tahun} tidak aktif. Pilih periode yang sudah dibuka oleh Admin.`, 'error');
      return;
    }
    // Validasi tanggal dilakukan server (isAktifToday) — cukup cek flag itu
    if (!periodeValid.isAktifToday) {
      toast(`Periode ${namaBulanTxt} ${tahun} sudah ditutup pada ${formatDate(periodeValid.tanggalSelesai)}. Hubungi Admin.`, 'warning');
      return;
    }
  }

  // Cek duplikat di sisi client
  const existingList = await API.getUsulan({ email_operator: currentUser.email }).catch(() => []);
  const duplikat = existingList.find(u => u.tahun == tahun && u.bulan == bulan && u.kodePKM === kodePKM);
  if (duplikat) {
    toast(`❌ Tidak dapat membuat usulan! Anda sudah memiliki usulan untuk ${namaBulanTxt} ${tahun} (ID: ${duplikat.idUsulan}). Hanya boleh 1 usulan per periode aktif.`, 'error');
    return;
  }

  setLoading(true);
  try {
    const result = await API.buatUsulan({ kodePKM, tahun, bulan, emailOperator: currentUser.email });
    toast(`Usulan ${result.idUsulan} berhasil dibuat! Silakan isi data indikator.`, 'success');
    // Update cache bulan yang sudah ada, lalu refresh dropdown
    window._existingUsulanBulan = [...(window._existingUsulanBulan || []), { tahun, bulan }];
    updateBulanOptions();
    loadMyUsulan();
    setTimeout(() => openIndikatorModal(result.idUsulan), 600);
  } catch (e) {
    toast(e.message, 'warning');
  } finally {
    setLoading(false);
  }
}

async function deleteUsulan(idUsulan) {
  showConfirm({ title: 'Hapus Usulan', message: `Hapus usulan ${idUsulan}? Data tidak dapat dikembalikan.`,
    onConfirm: async () => {
      try {
        await API.del('usulan', { idUsulan });
        toast('Usulan berhasil dihapus');
        loadMyUsulan();
      } catch (e) { toast(e.message, 'error'); }
    }
  });
}

// ============== INDIKATOR INPUT MODAL ==============
let currentIndikatorUsulan = null;
let indikatorData = [];

// Buka/buat folder Google Drive otomatis
async function openGDriveFolder(kodePKM, tahun, bulan, namaBulan, idUsulan) {
  const btn = document.getElementById('btnOpenDrive');
  if (btn) { btn.innerHTML = '<div class="spm-spinner sm"><div class="sr1"></div><div class="sr2"></div><div class="sr3"></div></div> Membuat folder...'; btn.disabled = true; }
  try {
    const result = await API.get('drive', { kodePKM, tahun, bulan, namaBulan });
    // Save folder URL to DB
    if (idUsulan) {
      await API.put('usulan?action=drive-folder', { idUsulan, driveFolderId: result.folderId, driveFolderUrl: result.folderUrl })
        .catch(e => console.warn('[drive-folder] Gagal simpan folder URL:', e.message));
    }
    window.open(result.folderUrl, '_blank');
    if (btn) { btn.innerHTML = '<span class="material-icons" style="font-size:15px">folder_open</span> Buka Folder Drive'; btn.disabled = false; }
    // Update link info
    const linkEl = document.getElementById('driveFolderLink');
    if (linkEl) { linkEl.href = result.folderUrl; linkEl.style.display = 'inline-flex'; }
  } catch (e) {
    toast('Gagal membuka Google Drive: ' + e.message, 'error');
    if (btn) { btn.innerHTML = '<span class="material-icons" style="font-size:15px">open_in_new</span> Buka Google Drive'; btn.disabled = false; }
  }
}

async function openIndikatorModal(idUsulan) {
  // === PROTEKSI PERIODE: cek apakah periode masih aktif sebelum buka modal ===
  // Hanya berlaku untuk Operator (yang input data), bukan verifikasi
  if (currentUser && currentUser.role === 'Operator') {
    // Re-fetch periode untuk memastikan data terkini (bukan cache lama)
    try {
      const freshPeriode = await API.get('periode');
      window._periodeAktifList = Array.isArray(freshPeriode) ? freshPeriode : [];
    } catch(e) {}
    const periodeAktif = (window._periodeAktifList || []).filter(p => p.isAktifToday);
    if (periodeAktif.length === 0) {
      // Tutup paksa jika modal sudah terbuka, rebuild sidebar lalu tampilkan banner
      closeModal('indikatorModal');
      buildSidebar();
      showPeriodeTutupBanner();
      toast('Periode input telah ditutup. Anda tidak dapat mengubah usulan saat ini.', 'error');
      return;
    }
  }
  currentIndikatorUsulan = idUsulan;
  document.getElementById('indModalId').textContent = idUsulan;
  // Reset notifikasi dan tombol submit ke state awal
  const _lockNotif = document.getElementById('indModalLockNotif');
  if (_lockNotif) { _lockNotif.style.display = 'none'; _lockNotif.innerHTML = ''; }
  const _submitBtn = document.getElementById('btnSubmitFromModal');
  if (_submitBtn) _submitBtn.style.display = '';
  showModal('indikatorModal');
  document.getElementById('indikatorInputBody').innerHTML = `<tr><td colspan="8"><div class="loading-state"><div class="spm-spinner lg"><div class="sr1"></div><div class="sr2"></div><div class="sr3"></div></div><p>Memuat data...</p></div></td></tr>`;

  try {
    const [detail, inds] = await Promise.all([API.getDetailUsulan(idUsulan), API.getIndikatorUsulan(idUsulan)]);
    indikatorData = inds;
    // Ditolak = bisa diedit ulang seperti Draft
    // Draft & Ditolak = bisa diedit. Status lain = read-only
    const isLocked = detail.statusGlobal !== 'Draft' && !['Ditolak','Ditolak Sebagian'].includes(detail.statusGlobal);
    const namaBulan = BULAN_NAMA[detail.bulan] || detail.bulan;

    const isDraft = detail.statusGlobal === 'Draft';
    const isDitolak = ['Ditolak','Ditolak Sebagian'].includes(detail.statusGlobal);
    const canSubmit = isDraft || isDitolak;
    const submitBtn = document.getElementById('btnSubmitFromModal');
    if (submitBtn) {
      submitBtn.style.display = canSubmit ? 'flex' : 'none';
      // Ubah label tombol untuk ajukan ulang
      submitBtn.innerHTML = isDitolak
        ? '<span class="material-icons">refresh</span> Ajukan Ulang'
        : '<span class="material-icons">send</span> Submit Usulan';
    }
    // Tampilkan banner status (hanya saat read-only, bukan saat Ditolak)
    const _ln = document.getElementById('indModalLockNotif');
    if (_ln) {
      if (isDitolak) {
        _ln.style.display = 'none';
        _ln.innerHTML = '';
      } else if (!canSubmit) {
        const statusIcon = detail.statusGlobal === 'Selesai' ? 'verified' : 'hourglass_top';
        const statusColor = detail.statusGlobal === 'Selesai' ? '#0d9488' : '#f59e0b';
        _ln.innerHTML = `<span class="material-icons" style="color:${statusColor};font-size:18px">${statusIcon}</span><span style="font-weight:600;color:${statusColor}">Status: ${detail.statusGlobal}</span>`;
        _ln.style.display = 'flex';
      } else {
        _ln.style.display = 'none';
        _ln.innerHTML = '';
      }
    }

    // Tampilkan form catatan sanggahan operator ke Kapus saat ditolak Kapus
    const _opCatatanWrap = document.getElementById('operatorCatatanWrap');
    if (_opCatatanWrap) {
      const showOpCatatan = isDitolak && detail.ditolakOleh === 'Kepala Puskesmas';
      _opCatatanWrap.style.display = showOpCatatan ? 'block' : 'none';
      if (!showOpCatatan) {
        const inp = document.getElementById('operatorCatatanInput');
        if (inp) inp.value = '';
      }
    }

    // Sembunyikan info card - tidak diperlukan lagi
    const infoEl = document.getElementById('indModalInfo');
    if (infoEl) infoEl.style.display = 'none';

    // Update SPM top display
    const spmTopEl = document.getElementById('indModalSPMTop');
    if (spmTopEl) spmTopEl.textContent = parseFloat(detail.indeksSPM).toFixed(2);

    // === FILTER: saat Ditolak, hanya tampilkan indikator bermasalah ===
    let displayInds = inds;
    let bermasalahNos = [];
    const alasanMap = {}; // no_indikator → alasan

    if (isDitolak) {
      const penolakanList = detail.penolakanIndikator || [];

      if (penolakanList.length > 0) {
        // dari_kapus=true: indikator yang perlu diperbaiki Operator
        // - Kapus tolak sendiri (dibuat_oleh=Kapus/NULL)
        // - Kapus benarkan penolakan PP (dibuat_oleh=PP, aksi=tolak)
        // - Kapus benarkan penolakan Admin (dibuat_oleh=Admin, aksi=tolak)
        // dari_kapus=false: disanggah Kapus, stillwaiting PP/Admin, bukan urusan Operator
        penolakanList.filter(p => p.dari_kapus === true || p.dari_kapus === 'true').forEach(p => {
          const no = parseInt(p.no_indikator || p.noIndikator);
          if (!bermasalahNos.includes(no)) bermasalahNos.push(no);
          alasanMap[no] = p.alasan || '-';
        });
        // Fallback untuk data lama tanpa dari_kapus
        if (bermasalahNos.length === 0) {
          penolakanList.filter(p => !p.aksi || p.aksi === 'reset' || p.aksi === 'tolak').forEach(p => {
            const no = parseInt(p.no_indikator || p.noIndikator);
            if (!bermasalahNos.includes(no)) bermasalahNos.push(no);
            alasanMap[no] = p.alasan || '-';
          });
        }
      } else {
        // Tidak ada data penolakan di DB - parse dari kapus_catatan sebagai fallback
        const catatan = detail.kapusCatatan || detail.alasanTolak || '';
        catatan.split('|').forEach(part => {
          const m = part.trim().match(/#(\d+):\s*(.+)/);
          if (m) {
            const no = parseInt(m[1]);
            bermasalahNos.push(no);
            alasanMap[no] = m[2].trim();
          }
        });
      }

      // Filter inds — hanya yang nomornya masuk daftar bermasalah
      if (bermasalahNos.length > 0) {
        displayInds = inds.filter(i => bermasalahNos.includes(parseInt(i.no)));
      }

      // Banner alasan penolakan dari verifikator level atas
      renderPenolakanBanner('indModalPenolakanBanner', detail.ditolakOleh || 'Verifikator',
        Object.entries(alasanMap).map(([no, alasan]) => ({ no: parseInt(no), alasan }))
      );
      // Thread catatan riwayat
      renderCatatanThread('indCatatanThread', idUsulan, 'Operator');

    } else {
      // Tidak ditolak — sembunyikan banner dan thread
      const _pb = document.getElementById('indModalPenolakanBanner');
      if (_pb) { _pb.style.display = 'none'; _pb.innerHTML = ''; }
      const _ct = document.getElementById('indCatatanThread');
      if (_ct) { _ct.style.display = 'none'; _ct.innerHTML = ''; }
    }

    if (displayInds.length === 0) {
      document.getElementById('indikatorInputBody').innerHTML = `<tr><td colspan="8"><div class="empty-state" style="padding:30px"><span class="material-icons" style="color:#0d9488">check_circle</span><p style="color:#0d9488;font-weight:600">Semua indikator sudah disetujui</p></div></td></tr>`;
    } else {
    document.getElementById('indikatorInputBody').innerHTML = displayInds.map(ind => {
      const hasBukti = !!ind.linkFile;
      const uploadBtnStyle = hasBukti
        ? 'display:inline-flex;align-items:center;gap:3px;padding:4px 9px;background:#0d9488;color:white;border-radius:6px;cursor:pointer;font-size:11.5px;font-weight:600;border:1.5px solid #0d9488;white-space:nowrap'
        : 'display:inline-flex;align-items:center;gap:3px;padding:4px 9px;background:#ef4444;color:white;border-radius:6px;cursor:pointer;font-size:11.5px;font-weight:600;border:1.5px solid #ef4444;white-space:nowrap';
      const _sisaTgt = INDIKATOR_TARGET_KUNCI.includes(ind.no)
        ? (ind.sasaranTahunan > 0 ? ind.sasaranTahunan : null)
        : (ind.sasaranTahunan > 0 ? Math.max(0, ind.sasaranTahunan - ind.realisasiKumulatif) : null);
      const _sisaColor = _sisaTgt !== null && _sisaTgt === 0 ? '#16a34a' : (_sisaTgt !== null && _sisaTgt < 10 ? '#f59e0b' : '#1e293b');
      return `<tr id="indRow-${ind.no}">
        <td><span style="font-weight:700">${ind.no}</span></td>
        <td style="max-width:220px;font-size:12.5px">${ind.nama}</td>
        <input type="hidden" id="bobot-${ind.no}" value="${ind.bobot}">
        <input type="hidden" id="sasaran-${ind.no}" value="${ind.sasaranTahunan || 0}">
        <input type="hidden" id="prevkum-${ind.no}" value="${Math.max(0, (ind.realisasiKumulatif || 0) - (ind.capaian || 0))}">
        <td style="text-align:center;font-size:12.5px;color:#475569">${ind.sasaranTahunan > 0 ? ind.sasaranTahunan : '<span style="color:#cbd5e1">-</span>'}</td>
        <td style="text-align:center">
          ${isLocked ? `<span>${ind.target}</span>` : `<input type="number" id="t-${ind.no}" value="${ind.target}" min="0" step="1"
            ${!INDIKATOR_TARGET_KUNCI.includes(ind.no) && ind.sasaranTahunan > 0 ? `max="${ind.sasaranTahunan}"` : ''}
            style="width:72px;border:1.5px solid var(--border);border-radius:6px;padding:3px 6px;font-size:13px;text-align:center"
            title="Target sasaran layanan (bilangan bulat${!INDIKATOR_TARGET_KUNCI.includes(ind.no) && ind.sasaranTahunan > 0 ? ', maks ' + ind.sasaranTahunan : ''})"
            onchange="saveIndikator(${ind.no})" oninput="previewSPM(${ind.no})"
            onkeypress="return event.charCode>=48&&event.charCode<=57">`}
        </td>
        <td style="text-align:center">
          ${isLocked ? `<span>${ind.capaian}</span>` : `<input type="number" id="c-${ind.no}" value="${ind.capaian}" min="0" step="1"
            style="width:72px;border:1.5px solid var(--border);border-radius:6px;padding:3px 6px;font-size:13px;text-align:center"
            title="Realisasi layanan (bilangan bulat, tidak boleh melebihi target)"
            onchange="saveIndikator(${ind.no})" oninput="clampRealisasi(${ind.no})"
            onkeypress="return event.charCode>=48&&event.charCode<=57">`}
        </td>
        <td style="width:90px;text-align:center">
          <span id="cap-${ind.no}" style="font-weight:700;font-size:13px;color:#1e293b">
            ${fmtCapaianPct(ind.capaian, ind.target)}
          </span>
        </td>
        <td id="sisa-${ind.no}" style="text-align:center;font-size:12.5px;font-weight:700;color:${_sisaColor}">${_sisaTgt !== null ? _sisaTgt : '<span style="color:#cbd5e1">-</span>'}</td>
        <td style="min-width:100px;text-align:center">
          ${(() => {
            // Parse link_file: bisa string URL tunggal atau JSON array
            let links = [];
            if (ind.linkFile) {
              try { links = JSON.parse(ind.linkFile); if (!Array.isArray(links)) links = [ind.linkFile]; }
              catch { links = [ind.linkFile]; }
            }
            // Normalisasi links ke format {id, url, name}
            const normLinks = links.map(f => typeof f === 'string' ? { id: null, url: f, name: 'File' } : f);

            if (isLocked) {
              if (!normLinks.length) return '<span style="color:#94a3b8;font-size:12px">-</span>';
              // Set _buktiLinks untuk modal preview di locked state juga
              window[`_buktiLinks_${ind.no}`] = { links: normLinks, idUsulan };
              return `<div style="display:flex;align-items:center;gap:2px">
                <input type="hidden" id="indLinks-${ind.no}" value='${JSON.stringify(normLinks).replace(/'/g,"&#39;")}' data-idusulan="${idUsulan}">
                <button onclick="openBuktiModal(${ind.no},0)" title="Preview" style="background:none;border:none;cursor:pointer;padding:2px 4px;border-radius:5px;display:flex;align-items:center;color:#0d9488"><span class="material-icons" style="font-size:16px">visibility</span></button>
              </div>`;
            }
            const hasFiles = normLinks.length > 0;
            const btnStyle = hasFiles
              ? 'display:inline-flex;align-items:center;padding:4px 12px;background:#16a34a;color:white;border-radius:6px;cursor:pointer;font-size:11.5px;font-weight:600;border:1.5px solid #16a34a;white-space:nowrap'
              : 'display:inline-flex;align-items:center;padding:4px 12px;background:#ef4444;color:white;border-radius:6px;cursor:pointer;font-size:11.5px;font-weight:600;border:1.5px solid #ef4444;white-space:nowrap';

            if (normLinks.length > 0) window[`_buktiLinks_${ind.no}`] = { links: normLinks, idUsulan };
            const fileControlHtml = normLinks.length > 0
              ? `<div style="display:flex;align-items:center;gap:1px">
                  <input type="hidden" id="indLinks-${ind.no}" value='${JSON.stringify(normLinks).replace(/'/g,"&#39;")}' data-idusulan="${idUsulan}">
                  <button onclick="openBuktiModal(${ind.no},0)" title="Preview" style="background:none;border:none;cursor:pointer;padding:2px 4px;border-radius:5px;display:flex;align-items:center;color:#0d9488" onmouseover="this.style.background='rgba(13,148,136,0.08)'" onmouseout="this.style.background='none'"><span class="material-icons" style="font-size:16px">visibility</span></button>
                  <button onclick="hapusSemuaBukti('${idUsulan}',${ind.no})" title="Hapus semua file" style="background:none;border:none;cursor:pointer;padding:3px 4px;border-radius:5px;display:flex;align-items:center;color:#ef4444" onmouseover="this.style.background='rgba(239,68,68,0.08)'" onmouseout="this.style.background='none'">${SVG_TRASH}</button>
                </div>`
              : '';
            return `<div id="uploadCell-${ind.no}" style="display:flex;align-items:center;gap:6px;justify-content:center">
                <label id="uploadLabel-${ind.no}" style="${btnStyle}">
                  ${hasFiles ? 'Uploaded' : 'Upload'}
                  <input type="file" multiple accept=".pdf,image/*" style="display:none" onchange="uploadBuktiIndikator(event,${ind.no},'${idUsulan}','${detail.kodePKM}','${(detail.namaPKM||detail.kodePKM).replace(/[^a-zA-Z0-9 ]/g,"")}',${detail.tahun},${detail.bulan},'${namaBulan}','${ind.nama.replace(/[^a-zA-Z0-9 ]/g,"").substring(0,40)}')">
                </label>
                <div id="fileControls-${ind.no}">${fileControlHtml}</div>
              </div>
              <div style="font-size:10px;color:#94a3b8;margin-top:3px;text-align:center;line-height:1.3">PDF / Gambar</div>`;
          })()}
        </td>
      </tr>`;
    }).join('');
    } // end else displayInds.length > 0
  } catch (e) {
    toast(e.message, 'error');
  }
}


// ============== ICON CONSTANTS ==============
const SVG_EYE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';
const SVG_TRASH = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>';

// ============== UPLOAD BUKTI INDIKATOR ==============
async function uploadBuktiIndikator(event, noIndikator, idUsulan, kodePKM, namaPKM, tahun, bulan, namaBulan, namaIndikator) {
  const files = Array.from(event.target.files);
  if (!files.length) return;

  // Validasi: hanya PDF dan gambar
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB per file
  const invalidFiles = files.filter(f => {
    const t = f.type;
    const n = f.name.toLowerCase();
    return !(t === 'application/pdf' || t.startsWith('image/') || n.endsWith('.pdf'));
  });
  if (invalidFiles.length > 0) {
    toast(`Hanya PDF dan gambar yang diizinkan. File ditolak: ${invalidFiles.map(f => f.name).join(', ')}`, 'error');
    event.target.value = '';
    return;
  }
  const oversizedFiles = files.filter(f => f.size > MAX_FILE_SIZE);
  if (oversizedFiles.length > 0) {
    toast(`File terlalu besar (maks 10MB): ${oversizedFiles.map(f => f.name).join(', ')}`, 'error');
    event.target.value = '';
    return;
  }

  const cell = document.getElementById(`uploadCell-${noIndikator}`);
  const statusDiv = document.createElement('div');
  statusDiv.style.cssText = 'font-size:11px;color:#0891b2';
  statusDiv.innerHTML = `<div class="loading-state inline">${spinnerHTML('sm')}<span>Mengupload ${files.length} file...</span></div>`;
  cell.insertBefore(statusDiv, cell.firstChild);

  const uploadedLinks = [];
  for (const file of files) {
    try {
      // Read file as base64
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await fetch("/.netlify/functions/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          fileBase64: base64,
          kodePKM,
          namaPKM: namaPKM || '',
          tahun,
          bulan,
          namaBulan: namaBulan || '',
          noIndikator,
          namaIndikator: namaIndikator || ''
        })
      });

      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Upload gagal');
      const fileUrl = result.fileUrl;
      if (!fileUrl) throw new Error('URL file tidak ditemukan dalam response');
      uploadedLinks.push({ id: result.publicId, url: fileUrl, name: file.name });
    } catch (e) {
      toast(`Gagal upload ${file.name}: ${e.message}`, 'error');
    }
  }

  if (uploadedLinks.length > 0) {
    // Ambil links yang sudah ada sebelumnya, lalu append
    const existingDetail = await API.getIndikatorUsulan(idUsulan);
    const existingInd = (existingDetail || []).find(i => i.no === noIndikator || i.noIndikator === noIndikator);
    let existingLinks = [];
    if (existingInd?.linkFile) {
      try {
        const parsed = JSON.parse(existingInd.linkFile);
        if (Array.isArray(parsed)) {
          // Normalisasi: bisa [{id,url}] atau [string]
          existingLinks = parsed.map(f => typeof f === 'string' ? { id: null, url: f, name: 'File' } : f);
        } else {
          existingLinks = [{ id: null, url: existingInd.linkFile, name: 'File' }];
        }
      } catch { existingLinks = [{ id: null, url: existingInd.linkFile, name: 'File' }]; }
    }
    const allLinks = [...existingLinks, ...uploadedLinks];
    const linkToSave = JSON.stringify(allLinks);

    const tVal = parseFloat(document.getElementById(`t-${noIndikator}`)?.value) || 0;
    const cVal = parseFloat(document.getElementById(`c-${noIndikator}`)?.value) || 0;
    await API.updateIndikatorUsulan({ idUsulan, noIndikator, target: tVal, capaian: cVal, linkFile: linkToSave });

    statusDiv.remove();

    // Update fileControls
    window[`_buktiLinks_${noIndikator}`] = { links: allLinks, idUsulan };
    const controls = document.getElementById(`fileControls-${noIndikator}`);
    if (controls) {
      if (allLinks.length > 0) {
        controls.innerHTML = '<div style="display:flex;align-items:center;gap:1px">'
          + '<button onclick="openBuktiModal(' + noIndikator + ',0)" title="Preview" style="background:none;border:none;cursor:pointer;padding:2px 4px;border-radius:5px;display:flex;align-items:center;color:#0d9488"><span class="material-icons" style="font-size:16px">visibility</span></button>'
          + '<button onclick="hapusSemuaBukti(\'' + idUsulan + '\',' + noIndikator + ')" title="Hapus semua file" style="background:none;border:none;cursor:pointer;padding:3px 4px;border-radius:5px;display:flex;align-items:center;color:#ef4444">' + SVG_TRASH + '</button>'  
          + '</div>';
      } else {
        controls.innerHTML = '';
      }
    }

    // Tombol hijau tanpa icon
    const label = document.getElementById(`uploadLabel-${noIndikator}`);
    if (label) {
      label.style.cssText = 'display:inline-flex;align-items:center;padding:4px 12px;background:#16a34a;color:white;border-radius:6px;cursor:pointer;font-size:11.5px;font-weight:600;border:1.5px solid #16a34a;white-space:nowrap';
      label.querySelectorAll('.material-icons').forEach(el => el.remove());
      const textNode = [...label.childNodes].find(n => n.nodeType === 3);
      if (textNode) textNode.textContent = 'Uploaded';
      else label.insertBefore(document.createTextNode('Uploaded'), label.querySelector('input'));
    }

    // Refresh SPM
    const spmDetail = await API.getDetailUsulan(idUsulan);
    const spmVal = parseFloat(spmDetail.indeksSPM).toFixed(2);
    const topEl = document.getElementById('indModalSPMTop');
    if (topEl) topEl.textContent = spmVal;

    toast(`${uploadedLinks.length} file berhasil diupload!`, 'success');
  } else {
    statusDiv.remove();
  }
}
// Folder management dipindah ke backend (drive-upload.js)

// Helper: hapus file dari Cloudinary
async function _deleteFromCloudinary(publicId) {
  if (!publicId) return;
  try {
    const res = await fetch('/.netlify/functions/delete-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicId })
    });
    if (!res.ok) console.warn('[delete-file] Status tidak OK:', res.status);
  } catch(e) { console.warn('Cloudinary delete warning:', e.message); }
}

// Helper: refresh fileControls UI setelah hapus
function _refreshFileControls(noIndikator, links, idUsulan) {
  window[`_buktiLinks_${noIndikator}`] = { links, idUsulan };
  const ctrl = document.getElementById(`fileControls-${noIndikator}`);
  if (ctrl) {
    if (links.length > 0) {
      ctrl.innerHTML = '<div style="display:flex;align-items:center;gap:1px">'
        + '<button onclick="openBuktiModal(' + noIndikator + ',0)" title="Preview" style="background:none;border:none;cursor:pointer;padding:2px 4px;border-radius:5px;display:flex;align-items:center;color:#0d9488"><span class="material-icons" style="font-size:16px">visibility</span></button>'
        + '<button onclick="hapusSemuaBukti(\'' + idUsulan + '\',' + noIndikator + ')" title="Hapus semua file" style="background:none;border:none;cursor:pointer;padding:3px 4px;border-radius:5px;display:flex;align-items:center;color:#ef4444">' + SVG_TRASH + '</button>'
        + '</div>';
    } else {
      ctrl.innerHTML = '';
    }
  }
  const lbl = document.getElementById(`uploadLabel-${noIndikator}`);
  if (lbl && links.length === 0) {
    lbl.style.cssText = 'display:inline-flex;align-items:center;padding:4px 12px;background:#ef4444;color:white;border-radius:6px;cursor:pointer;font-size:11.5px;font-weight:600;border:1.5px solid #ef4444;white-space:nowrap';
    const tn = [...lbl.childNodes].find(n => n.nodeType === 3);
    if (tn) tn.textContent = 'Upload';
  }
}

// Hapus SEMUA file data dukung sekaligus
async function hapusSemuaBukti(idUsulan, noIndikator) {
  const previewModal = document.getElementById('previewBuktiModal');
  if (previewModal) previewModal.classList.remove('show');
  showConfirm({
    title: 'Hapus Semua Data Dukung',
    message: `Hapus <strong>semua file</strong> data dukung indikator ${noIndikator}? Tindakan ini tidak dapat dibatalkan.`,
    type: 'danger',
    onConfirm: async () => {
      try {
        const existingDetail = await API.getIndikatorUsulan(idUsulan);
        const existingInd = (existingDetail || []).find(i => i.no === noIndikator || i.noIndikator === noIndikator);
        let links = [];
        if (existingInd?.linkFile) {
          try {
            const parsed = JSON.parse(existingInd.linkFile);
            links = Array.isArray(parsed)
              ? parsed.map(f => typeof f === 'string' ? { id: null, url: f, name: 'File' } : f)
              : [{ id: null, url: existingInd.linkFile, name: 'File' }];
          } catch { links = [{ id: null, url: existingInd.linkFile, name: 'File' }]; }
        }
        // Hapus semua dari Cloudinary
        await Promise.all(links.map(f => _deleteFromCloudinary(f.id || f.publicId)));
        const tVal = parseFloat(document.getElementById(`t-${noIndikator}`)?.value) || 0;
        const cVal = parseFloat(document.getElementById(`c-${noIndikator}`)?.value) || 0;
        await API.updateIndikatorUsulan({ idUsulan, noIndikator, target: tVal, capaian: cVal, linkFile: '' });
        _refreshFileControls(noIndikator, [], idUsulan);
        toast('Semua file berhasil dihapus', 'success');
      } catch(e) { toast('Gagal hapus: ' + e.message, 'error'); }
    }
  });
}

// Hapus satu file data dukung berdasarkan index
async function hapusBukti(idUsulan, noIndikator, fileIndex) {
  // Tutup modal preview jika sedang terbuka
  const previewModal = document.getElementById('previewBuktiModal');
  if (previewModal) previewModal.classList.remove('show');

  showConfirm({
    title: 'Hapus Data Dukung',
    message: `Hapus <strong>File ${fileIndex + 1}</strong> dari indikator ${noIndikator}?`,
    type: 'danger',
    onConfirm: async () => {
      try {
        const existingDetail = await API.getIndikatorUsulan(idUsulan);
        const existingInd = (existingDetail || []).find(i => i.no === noIndikator || i.noIndikator === noIndikator);
        let links = [];
        if (existingInd?.linkFile) {
          try {
            const parsed = JSON.parse(existingInd.linkFile);
            links = Array.isArray(parsed)
              ? parsed.map(f => typeof f === 'string' ? { id: null, url: f, name: 'File' } : f)
              : [{ id: null, url: existingInd.linkFile, name: 'File' }];
          } catch { links = [{ id: null, url: existingInd.linkFile, name: 'File' }]; }
        }

        // Hapus dari Cloudinary dulu
        const fileToDelete = links[fileIndex];
        if (fileToDelete?.id || fileToDelete?.publicId) {
          await _deleteFromCloudinary(fileToDelete.id || fileToDelete.publicId);
        }

        links.splice(fileIndex, 1);
        const newLinkFile = links.length ? JSON.stringify(links) : '';
        const tVal = parseFloat(document.getElementById(`t-${noIndikator}`)?.value) || 0;
        const cVal = parseFloat(document.getElementById(`c-${noIndikator}`)?.value) || 0;
        await API.updateIndikatorUsulan({ idUsulan, noIndikator, target: tVal, capaian: cVal, linkFile: newLinkFile });

        toast('File berhasil dihapus', 'success');

        // Refresh fileControls
        _refreshFileControls(noIndikator, links, idUsulan);
      } catch(e) {
        toast('Gagal hapus: ' + e.message, 'error');
      }
    }
  });
}

function openBuktiModal(noIndikator, startIdx) {
  let data = window[`_buktiLinks_${noIndikator}`];
  // Fallback: baca dari hidden input di DOM kalau window data belum ter-set
  if (!data || !data.links.length) {
    const hiddenEl = document.getElementById(`indLinks-${noIndikator}`);
    if (hiddenEl) {
      try {
        const parsed = JSON.parse(hiddenEl.value);
        const idUsulan = hiddenEl.dataset.idusulan;
        const links = Array.isArray(parsed) ? parsed.map(f => typeof f === 'string' ? { id: null, url: f, name: 'File' } : f) : [];
        data = { links, idUsulan };
        window[`_buktiLinks_${noIndikator}`] = data;
      } catch(e) {}
    }
  }
  if (!data || !data.links.length) { toast('Data dukung tidak ditemukan', 'error'); return; }
  window._modalBukti = { links: data.links, idUsulan: data.idUsulan, idx: startIdx || 0, noIndikator };
  _renderBuktiModal();
}

function _renderBuktiModal() {
  const { links, idx, idUsulan, noIndikator } = window._modalBukti;
  const f = links[idx];

  // Nama file asli dari f.name (tersimpan saat upload dengan ekstensi lengkap)
  let fileName = (f.name && f.name !== 'File' && f.name.trim()) ? f.name.trim() : null;

  // Kalau tidak ada f.name, coba ekstrak dari publicId
  if (!fileName && f.id) {
    const pidParts = f.id.split('/').pop();
    const match = pidParts.match(/_\d+_(.+)$/);
    if (match) fileName = match[1];
  }

  // Fallback: nama generik
  if (!fileName) fileName = 'file';

  // Ekstrak ekstensi — coba dari fileName dulu, fallback dari URL
  let dotIdx = fileName.lastIndexOf('.');
  let ext = dotIdx > -1 ? fileName.substring(dotIdx + 1).toLowerCase() : '';
  if (!ext) {
    // Ambil dari URL (berguna untuk file lama yang URL-nya punya ekstensi)
    const urlClean = (f.url || '').split('?')[0];
    const urlExt = urlClean.split('.').pop().toLowerCase();
    if (urlExt && urlExt.length <= 5 && /^[a-z0-9]+$/.test(urlExt)) ext = urlExt;
  }
  // Pastikan fileName punya ekstensi
  if (ext && !fileName.toLowerCase().endsWith('.' + ext)) fileName = fileName + '.' + ext;

  const isImage = ['jpg','jpeg','png','gif','webp'].includes(ext);
  const isPDF = ext === 'pdf';
  const isOffice = ['doc','docx','xls','xlsx','ppt','pptx'].includes(ext);
  const total = links.length;

  // Routing semua akses file melalui sign-url proxy (Netlify function)
  // agar CORS dan Content-Type ditangani dengan benar
  const _signBase = '/.netlify/functions/sign-url';
  const proxyUrl = `${_signBase}?url=${encodeURIComponent(f.url)}&name=${encodeURIComponent(fileName)}&mode=preview`;
  const proxyDownloadUrl = `${_signBase}?url=${encodeURIComponent(f.url)}&name=${encodeURIComponent(fileName)}&mode=download`;

  let modal = document.getElementById('previewBuktiModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'previewBuktiModal';
    modal.className = 'modal fullscreen';
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('show'); });
  }

  const svgDownload = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
  const svgTrashM = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>`;
  const svgZoomIn  = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`;
  const svgZoomOut = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`;
  const svgReset   = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`;
  const navBtn = (dir, fn) => `<button onclick="${fn}" style="position:absolute;top:50%;${dir}:14px;transform:translateY(-50%);background:rgba(255,255,255,0.12);backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,0.18);color:white;border-radius:50%;width:42px;height:42px;cursor:pointer;font-size:22px;display:flex;align-items:center;justify-content:center;line-height:1;z-index:10" onmouseover="this.style.background='rgba(255,255,255,0.25)'" onmouseout="this.style.background='rgba(255,255,255,0.12)'">${dir==='left'?'&#8249;':'&#8250;'}</button>`;
  const fileIcons = { pdf:'&#128196;', doc:'&#128196;', docx:'&#128196;', xls:'&#128202;', xlsx:'&#128202;', ppt:'&#128190;', pptx:'&#128190;' };
  const fileIcon = fileIcons[ext] || '&#128196;';

  // Inisialisasi zoom state
  if (!window._buktiZoomState) window._buktiZoomState = {};
  if (window._buktiZoomState.fileIdx !== idx) {
    window._buktiZoomState = { scale: 1.0, fileIdx: idx };
  }

  const zoomBtnStyle = `background:rgba(255,255,255,0.08);color:#cbd5e1;border:1px solid rgba(255,255,255,0.15);padding:5px 8px;border-radius:7px;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:4px`;

  const previewId = 'buktiPreview_' + idx + '_' + Date.now();
  modal.innerHTML = `
    <div class="modal-card" style="background:#0f172a;">
      <div class="modal-header" style="background:#1e293b;border-bottom:1px solid rgba(255,255,255,0.08);">
        <span class="material-icons" style="color:#0d9488;font-size:18px">description</span>
        <h3 style="color:white;font-size:14px;">Data Dukung
          ${total > 1 ? `<span style="background:#334155;color:#94a3b8;font-size:11px;padding:2px 8px;border-radius:20px;font-weight:600;margin-left:8px;">${idx+1} / ${total}</span>` : ''}
        </h3>
        <div style="display:flex;gap:6px;align-items:center;margin-left:auto;flex-wrap:wrap;">
          ${isImage || isPDF ? `
          <div style="display:flex;gap:4px;align-items:center;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:3px 5px;">
            <button id="buktiZoomOut" onclick="_buktiZoom(-1,'${previewId}','${isImage?'img':'pdf'}')" title="Zoom Out" style="${zoomBtnStyle}">${svgZoomOut}</button>
            <span id="buktiZoomLabel" style="font-size:11px;font-weight:700;color:#94a3b8;min-width:36px;text-align:center;cursor:default">100%</span>
            <button id="buktiZoomIn" onclick="_buktiZoom(1,'${previewId}','${isImage?'img':'pdf'}')" title="Zoom In" style="${zoomBtnStyle}">${svgZoomIn}</button>
            <button id="buktiZoomReset" onclick="_buktiZoomReset('${previewId}','${isImage?'img':'pdf'}')" title="Reset Zoom" style="${zoomBtnStyle}">${svgReset}</button>
          </div>` : ''}
          <button onclick="downloadBukti(${idx})" title="Download" style="background:rgba(13,148,136,0.15);color:#0d9488;border:1px solid rgba(13,148,136,0.3);padding:5px 10px;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:5px">${svgDownload}</button>
          ${idUsulan ? `<button onclick="hapusBukti('${idUsulan}',${noIndikator},${idx})" title="Hapus file" style="background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.3);padding:5px 10px;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center">${svgTrashM}</button>` : ''}
          <button onclick="document.getElementById('previewBuktiModal').classList.remove('show')" style="background:rgba(255,255,255,0.08);border:none;cursor:pointer;color:white;border-radius:7px;width:32px;height:32px;font-size:20px;display:flex;align-items:center;justify-content:center">&#215;</button>
        </div>
      </div>
      <div class="modal-body flex-col" style="position:relative;background:#0f172a;overflow:hidden;">
        <div id="${previewId}" style="width:100%;height:100%;display:flex;align-items:${isImage?'center':'flex-start'};justify-content:center;overflow:auto;">
          ${isImage
            ? `<div id="buktiImgWrap" style="display:flex;align-items:center;justify-content:center;min-width:100%;min-height:100%;padding:16px;box-sizing:border-box;transform-origin:center center;transition:transform 0.2s ease">
                <img src="${proxyUrl}" id="buktiZoomImg" style="max-width:100%;max-height:100%;object-fit:contain;display:block;user-select:none;transition:transform 0.2s ease;transform-origin:center center">
               </div>`
            : `<div style="color:#94a3b8;font-size:13px;display:flex;align-items:center;gap:8px">
                ${spinnerHTML('md')}<span>Memuat data...</span>
              </div>`
          }
        </div>
        ${total > 1 ? navBtn('left','_buktiNav(-1)') : ''}
        ${total > 1 ? navBtn('right','_buktiNav(1)') : ''}
      </div>
      ${total > 1 ? `
      <div style="display:flex;justify-content:center;gap:5px;padding:8px;flex-shrink:0;border-top:1px solid rgba(255,255,255,0.08);background:#1e293b;">
        ${links.map((_,i)=>`<button onclick="_buktiGoto(${i})" style="width:${i===idx?'20px':'7px'};height:7px;border-radius:10px;border:none;cursor:pointer;background:${i===idx?'#0d9488':'rgba(255,255,255,0.2)'};transition:all 0.2s;padding:0"></button>`).join('')}
      </div>` : ''}
    </div>`;
  modal.classList.add('show');

  // Pasang wheel zoom untuk gambar
  if (isImage) {
    const previewEl = document.getElementById(previewId);
    if (previewEl) {
      previewEl.addEventListener('wheel', function(e) {
        e.preventDefault();
        const dir = e.deltaY < 0 ? 1 : -1;
        _buktiZoom(dir, previewId, 'img');
      }, { passive: false });
    }
  }

  // Untuk non-image: embed langsung pakai proxyUrl (sign-url set Content-Type yang benar)
  if (!isImage) {
    (async () => {
      const el = document.getElementById(previewId);
      if (!el) return;
      try {
        if (isPDF) {
          // Render PDF pakai PDF.js (pdfjs-dist CDN) — bebas dari IDM intercept
          // karena tidak ada fetch/download ke URL eksternal, semua dirender via canvas
          el.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;color:#94a3b8">
            ${spinnerHTML('lg')}
            <span style="font-size:13px">Memuat PDF...</span>
          </div>`;
          const _initZoom = (window._buktiZoomState && window._buktiZoomState.scale) ? window._buktiZoomState.scale : 1.0;
          await _renderPDFjs(el, proxyUrl, idx, _initZoom);
        } else if (isOffice) {
          // Office: pakai Google Docs Viewer sebagai fallback yang lebih reliable
          const googleViewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(proxyDownloadUrl)}&embedded=true`;
          el.innerHTML = `<iframe src="${googleViewerUrl}" style="width:100%;height:100%;border:none" onload="this.style.opacity=1" style="opacity:0;transition:opacity 0.3s"></iframe>`;
        } else {
          el.innerHTML = `<div style="text-align:center;color:white;padding:40px">
            <div style="font-size:64px;margin-bottom:16px">${fileIcon}</div>
            <div style="font-size:11px;color:#64748b;margin-bottom:28px;text-transform:uppercase">${ext.toUpperCase()} &bull; Tidak dapat dipreview</div>
            <button onclick="downloadBukti(${idx})" style="background:#0d9488;color:white;padding:12px 32px;border-radius:8px;border:none;font-weight:600;font-size:14px;cursor:pointer">Download</button>
          </div>`;
        }
      } catch(e) {
        const el2 = document.getElementById(previewId);
        if (!el2) return;
        el2.innerHTML = `<div style="text-align:center;color:white;padding:40px">
          <div style="font-size:64px;margin-bottom:16px">${fileIcon}</div>
          <div style="font-size:11px;color:#64748b;margin-bottom:28px">${ext.toUpperCase()} &bull; Gagal memuat preview</div>
          <button onclick="downloadBukti(${idx})" style="background:#0d9488;color:white;padding:12px 32px;border-radius:8px;border:none;font-weight:600;font-size:14px;cursor:pointer;display:inline-flex;align-items:center;gap:8px"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download</button>
        </div>`;
      }
    })();
  }
}


async function _renderPDFjs(container, url, idx, zoomScale) {
  const _zoom = (typeof zoomScale === 'number' && zoomScale > 0) ? zoomScale : 1.0;
  const SVG_DL = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
  const btnDl = `<button onclick="downloadBukti(${idx})" style="background:#0d9488;color:white;padding:10px 28px;border-radius:8px;border:none;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:8px">${SVG_DL} Download File</button>`;

  // Load PDF.js dari CDN jika belum ada
  if (!window.pdfjsLib) {
    try {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      // Suppress verbose font warnings (e.g. "TT: undefined function: 22")
      if (window.pdfjsLib.verbosity !== undefined) {
        window.pdfjsLib.verbosity = window.pdfjsLib.VerbosityLevel
          ? window.pdfjsLib.VerbosityLevel.ERRORS
          : 0;
      }
    } catch(e) {
      _showPDFFallback(container, 'Gagal memuat PDF.js library', btnDl);
      return;
    }
  }

  // Coba XHR dengan header custom (bypass IDM)
  let buf = null;
  try {
    buf = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.responseType = 'arraybuffer';
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
      xhr.onload = () => {
        if (xhr.status === 200 && xhr.response && xhr.response.byteLength > 0) {
          resolve(xhr.response);
        } else {
          reject(new Error('empty:' + xhr.status));
        }
      };
      xhr.onerror = () => reject(new Error('network'));
      xhr.send();
    });
  } catch(e) {
    // XHR gagal/kosong → tampilkan fallback download
    _showPDFFallback(container, null, btnDl);
    return;
  }

  try {
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const totalPages = pdf.numPages;

    container.innerHTML = `<div id="pdfScroll_${idx}" style="width:100%;height:100%;overflow-y:auto;overflow-x:auto;background:#3a3a3a;padding:12px 0"><div id="pdfPages_${idx}" style="transform-origin:top center;transition:transform 0.2s ease"></div></div>`;
    const scroll   = document.getElementById('pdfScroll_' + idx);
    const pdfPages = document.getElementById('pdfPages_' + idx);

    // Simpan referensi id agar _applyBuktiZoom bisa zoom via CSS tanpa re-download
    container._pdfPagesId  = 'pdfPages_' + idx;
    container._pdfScrollId = 'pdfScroll_' + idx;

    for (let p = 1; p <= totalPages; p++) {
      const page = await pdf.getPage(p);
      const containerW = scroll.clientWidth || 620;
      const baseVp = page.getViewport({ scale: 1 });
      // Render pada fitScale saja; zoom visual dilakukan via CSS transform
      const fitScale = Math.min(2.0, (containerW - 32) / baseVp.width);
      const vp = page.getViewport({ scale: fitScale });
      const canvas = document.createElement('canvas');
      canvas.width  = vp.width;
      canvas.height = vp.height;
      canvas.style.cssText = 'display:block;margin:0 auto 10px;box-shadow:0 2px 12px rgba(0,0,0,0.5);border-radius:2px;background:white';
      pdfPages.appendChild(canvas);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    }

    // Terapkan zoom awal jika bukan 1.0
    if (_zoom !== 1.0) {
      pdfPages.style.transform = `scale(${_zoom})`;
      pdfPages.style.marginBottom = `${pdfPages.scrollHeight * (_zoom - 1)}px`;
    }
  } catch(e) {
    _showPDFFallback(container, e.message, btnDl);
  }
}

function _showPDFFallback(container, errMsg, btnDl) {
  const SVG_PDF = `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`;
  const SVG_INFO = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
  container.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:14px;padding:32px;text-align:center">
      ${SVG_PDF}
      <div style="color:white;font-size:15px;font-weight:600">Preview tidak tersedia</div>
      ${errMsg ? `<div style="color:#64748b;font-size:11px;max-width:260px">${errMsg}</div>` : ''}
      ${btnDl}
      <div style="margin-top:8px;padding:10px 14px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;max-width:300px">
        <div style="display:flex;align-items:center;gap:6px;color:#94a3b8;font-size:11px;margin-bottom:6px;font-weight:600">
          ${SVG_INFO} Tips: Aktifkan preview PDF
        </div>
        <div style="color:#64748b;font-size:11px;line-height:1.7;text-align:left">
          Jika menggunakan <b style="color:#94a3b8">IDM</b>, buka:<br>
          IDM → Options → General → uncheck <i>"Monitor Chromium based browsers"</i><br>
          atau tekan <b style="color:#94a3b8">Ctrl+Alt+I</b> untuk toggle IDM.
        </div>
      </div>
    </div>`;
}

function _buktiNav(dir) {
  const d = window._modalBukti;
  d.idx = (d.idx + dir + d.links.length) % d.links.length;
  window._buktiZoomState = { scale: 1.0, fileIdx: d.idx };
  _renderBuktiModal();
}

function _buktiGoto(idx) {
  window._modalBukti.idx = idx;
  window._buktiZoomState = { scale: 1.0, fileIdx: idx };
  _renderBuktiModal();
}

// ======= ZOOM CONTROLS untuk modal Data Dukung =======
// Skala zoom: 0.5x – 4.0x (step 0.25)
const _ZOOM_STEPS  = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0, 4.0];
const _ZOOM_MIN    = 0.5;
const _ZOOM_MAX    = 4.0;
const _ZOOM_STEP   = 0.25;

function _buktiZoom(dir, previewId, mode) {
  // dir: +1 = zoom in, -1 = zoom out
  if (!window._buktiZoomState) window._buktiZoomState = { scale: 1.0 };
  let s = window._buktiZoomState.scale || 1.0;
  // Cari step berikutnya dari _ZOOM_STEPS
  if (dir > 0) {
    const next = _ZOOM_STEPS.find(v => v > s + 0.001);
    s = next !== undefined ? next : _ZOOM_MAX;
  } else {
    const prev = [..._ZOOM_STEPS].reverse().find(v => v < s - 0.001);
    s = prev !== undefined ? prev : _ZOOM_MIN;
  }
  window._buktiZoomState.scale = s;
  _applyBuktiZoom(previewId, mode, s);
}

function _buktiZoomReset(previewId, mode) {
  window._buktiZoomState = { scale: 1.0 };
  _applyBuktiZoom(previewId, mode, 1.0);
}

function _applyBuktiZoom(previewId, mode, scale) {
  // Update label
  const label = document.getElementById('buktiZoomLabel');
  if (label) label.textContent = Math.round(scale * 100) + '%';

  // Disable/enable tombol
  const btnOut   = document.getElementById('buktiZoomOut');
  const btnIn    = document.getElementById('buktiZoomIn');
  const btnReset = document.getElementById('buktiZoomReset');
  if (btnOut)   { btnOut.disabled   = scale <= _ZOOM_MIN; btnOut.style.opacity   = scale <= _ZOOM_MIN ? '0.35' : '1'; }
  if (btnIn)    { btnIn.disabled    = scale >= _ZOOM_MAX; btnIn.style.opacity    = scale >= _ZOOM_MAX ? '0.35' : '1'; }
  if (btnReset) { btnReset.style.opacity = scale === 1.0 ? '0.45' : '1'; }

  if (mode === 'img') {
    const img = document.getElementById('buktiZoomImg');
    if (img) {
      img.style.transform = scale === 1.0 ? '' : `scale(${scale})`;
      img.style.transformOrigin = 'center center';
      // Kalau zoom > 1 ubah max-width/height agar bisa scroll
      img.style.maxWidth  = scale > 1 ? 'none' : '100%';
      img.style.maxHeight = scale > 1 ? 'none' : '100%';
    }
    // Pastikan container bisa scroll saat zoom > 1
    const container = document.getElementById(previewId);
    if (container) {
      container.style.overflow = scale > 1 ? 'scroll' : 'auto';
      container.style.alignItems = scale > 1 ? 'flex-start' : 'center';
      container.style.justifyContent = scale > 1 ? 'flex-start' : 'center';
    }
  } else if (mode === 'pdf') {
    // Zoom PDF via CSS transform — instan tanpa re-download
    const container = document.getElementById(previewId);
    if (!container) return;

    const pagesId  = container._pdfPagesId;
    const scrollId = container._pdfScrollId;
    const pdfPages = pagesId  ? document.getElementById(pagesId)  : null;
    const scroll   = scrollId ? document.getElementById(scrollId) : null;

    if (pdfPages) {
      pdfPages.style.transform       = scale === 1.0 ? '' : `scale(${scale})`;
      pdfPages.style.transformOrigin = 'top center';
      pdfPages.style.transition      = 'transform 0.2s ease';
      // Agungkan tinggi wrapper agar scroll area menyesuaikan konten yang diperbesar
      if (scale > 1.0) {
        const naturalH = pdfPages.scrollHeight / (parseFloat(pdfPages.dataset.lastScale) || 1);
        pdfPages.dataset.lastScale    = scale;
        pdfPages.style.marginBottom   = `${naturalH * (scale - 1)}px`;
      } else {
        pdfPages.dataset.lastScale    = 1;
        pdfPages.style.marginBottom   = '';
      }
    }
    if (scroll) {
      scroll.style.overflowX = scale > 1 ? 'auto' : 'hidden';
    }
  }
}

async function downloadBukti(idx) {
  const d = window._modalBukti;
  if (!d) return;
  const f = d.links[idx];
  if (!f) return;

  let fileName = (f.name && f.name !== 'File' && f.name.trim()) ? f.name.trim() : 'file';
  const dotIdx2 = fileName.lastIndexOf('.');
  const ext2 = dotIdx2 > -1 ? fileName.substring(dotIdx2 + 1).toLowerCase() : '';
  if (ext2 && !fileName.toLowerCase().endsWith('.' + ext2)) fileName += '.' + ext2;

  // Routing download melalui sign-url proxy agar Content-Disposition dan CORS benar
  const downloadProxyUrl = `/.netlify/functions/sign-url?url=${encodeURIComponent(f.url)}&name=${encodeURIComponent(fileName)}&mode=download`;

  try {
    const res = await fetch(downloadProxyUrl);
    if (!res.ok) throw Object.assign(new Error('HTTP ' + res.status), { status: res.status });
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl; a.download = fileName;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
  } catch (e) {
    // Fallback: buka via proxy di tab baru
    window.open(downloadProxyUrl, '_blank');
  }
}

async function saveIndikator(noIndikator) {
  const target  = parseFloat(document.getElementById(`t-${noIndikator}`)?.value) || 0;
  const capaian = parseFloat(document.getElementById(`c-${noIndikator}`)?.value) || 0;

  // Validasi: target bulan tidak boleh melebihi target tahunan (kecuali indikator #8 & #9)
  if (!INDIKATOR_TARGET_KUNCI.includes(noIndikator)) {
    const sasaran = parseInt(document.getElementById(`sasaran-${noIndikator}`)?.value) || 0;
    if (sasaran > 0 && target > sasaran) {
      const tEl = document.getElementById(`t-${noIndikator}`);
      if (tEl) tEl.value = sasaran;
      toast(`Target Bulan Ini Indikator ${noIndikator} tidak boleh melebihi Target Tahunan (${sasaran})`, 'warning');
      return;
    }
  }

  try {
    // Kirim update — tanpa linkFile supaya link yg sudah ada tidak terhapus
    const result = await API.put('usulan?action=indikator', { idUsulan: currentIndikatorUsulan, noIndikator, target, capaian });

    // Update SPM display langsung dari response (tanpa extra API call)
    if (result?.indeksSPM !== undefined) {
      const spmVal = parseFloat(result.indeksSPM).toFixed(2);
      const topEl = document.getElementById('indModalSPMTop');
      if (topEl) topEl.textContent = spmVal;
    }
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function submitUsulanFromModal() {
  // === PROTEKSI PERIODE: cek ulang saat submit agar tidak bisa submit jika periode sudah tutup ===
  if (currentUser && currentUser.role === 'Operator') {
    try {
      const freshPeriode = await API.get('periode');
      window._periodeAktifList = Array.isArray(freshPeriode) ? freshPeriode : [];
    } catch(e) {}
    const periodeAktif = (window._periodeAktifList || []).filter(p => p.isAktifToday);
    if (periodeAktif.length === 0) {
      closeModal('indikatorModal');
      buildSidebar();
      showPeriodeTutupBanner();
      toast('Periode input telah ditutup. Usulan tidak dapat disubmit.', 'error');
      return;
    }
  }
  // Cek apakah ini mode perbaiki (tombol sudah berubah jadi "Ajukan Ulang")
  const submitBtn = document.getElementById('btnSubmitFromModal');
  const isResubmit = submitBtn && submitBtn.textContent.includes('Ajukan Ulang');
  // Validasi catatan operator (wajib saat ditolak Kapus)
  const _opCatatanWrap = document.getElementById('operatorCatatanWrap');
  if (_opCatatanWrap && _opCatatanWrap.style.display !== 'none') {
    const _opCatatan = document.getElementById('operatorCatatanInput');
    if (!_opCatatan || !_opCatatan.value.trim()) {
      toast('Catatan/Sanggahan untuk Kepala Puskesmas wajib diisi', 'error');
      if (_opCatatan) _opCatatan.focus();
      return;
    }
    if (!isValidText(_opCatatan.value)) {
      toast('Catatan/Sanggahan harus mengandung teks yang bermakna', 'error');
      if (_opCatatan) _opCatatan.focus();
      return;
    }
  }
  showConfirm({
    title: isResubmit ? 'Ajukan Ulang' : 'Submit Usulan',
    message: isResubmit
      ? 'Indikator yang diperbaiki akan diajukan ulang untuk diverifikasi kembali?'
      : 'Submit usulan untuk diverifikasi?',
    type: 'warning',
    onConfirm: async () => {
      await doSubmitUsulan(false);
    }
  });
}

async function doSubmitUsulan(forceSubmit) {
  try {
    setLoading(true);
    const raw = await API.call('usulan?action=submit', {
      method: 'POST',
      body: JSON.stringify({
        idUsulan: currentIndikatorUsulan,
        email: currentUser.email,
        forceSubmit,
        catatanOperator: (document.getElementById('operatorCatatanInput')?.value?.trim()) || ''
      })
    });

    // 202 Accepted = needConfirm (bukti belum lengkap, minta konfirmasi)
    if (raw?.needConfirm) {
      const nos = (raw.missingNos || []).slice().sort((a, b) => a - b).join(', ');
      (raw.missingNos || []).forEach(no => {
        const label = document.getElementById(`uploadLabel-${no}`);
        if (label) {
          label.style.boxShadow = '0 0 0 3px rgba(239,68,68,0.5)';
          label.style.transform = 'scale(1.05)';
          setTimeout(() => { label.style.boxShadow = ''; label.style.transform = ''; }, 3000);
        }
      });
      const isRepair = !!raw.isDitolak;
      const titleMsg = isRepair ? 'Data Dukung Belum Dilengkapi' : 'Data Dukung Belum Lengkap';
      const bodyMsg = isRepair
        ? `<div style="margin-bottom:8px"><b>${raw.missingCount} indikator yang diperbaiki</b> belum dilengkapi data dukungnya:</div><div style="background:#fef9c3;border-radius:6px;padding:8px 12px;font-size:13px;color:#92400e;font-family:monospace">No. ${nos}</div><div style="margin-top:10px;font-size:13px;color:#64748b">Disarankan untuk upload data dukung sebelum mengajukan ulang agar lebih mudah diverifikasi.</div>`
        : `<div style="margin-bottom:8px"><b>${raw.missingCount} indikator</b> belum ada data dukung:</div><div style="background:#fef9c3;border-radius:6px;padding:8px 12px;font-size:13px;color:#92400e;font-family:monospace">No. ${nos}</div><div style="margin-top:10px;font-size:13px;color:#64748b">Usulan tetap bisa disubmit, namun data dukung yang lengkap akan memperkuat verifikasi.</div>`;
      showConfirm({
        title: titleMsg,
        message: bodyMsg,
        type: 'warning',
        onConfirm: () => doSubmitUsulan(true)
      });
      return;
    }

    // ok() wraps dalam { success: true, data: {...} }
    // API.call sudah throw jika !success, jadi sampai sini = sukses
    const successMsg = raw?.message || raw?.data?.message || 'Usulan berhasil disubmit!';
    toast(' ' + successMsg, 'success');
    closeModal('indikatorModal');

    // Update icon tombol di tabel jadi hijau
    const rowBtn = document.querySelector(`button[onclick="openIndikatorModal('${currentIndikatorUsulan}')"]`);
    if (rowBtn) {
      rowBtn.style.background = '#d1fae5';
      rowBtn.style.color = '#065f46';
      rowBtn.style.border = '1.5px solid #0d9488';
      rowBtn.title = 'Sudah diajukan';
      const ic = rowBtn.querySelector('.material-icons');
      if (ic) ic.textContent = 'check_circle';
    }

    loadMyUsulan();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    setLoading(false);
  }
}

// Preview SPM saat oninput (kalkulasi di client tanpa hit server)
function clampRealisasi(no) {
  const tEl = document.getElementById(`t-${no}`);
  const cEl = document.getElementById(`c-${no}`);
  if (!tEl || !cEl) return;
  // Paksa integer — hapus desimal
  if (cEl.value.includes('.')) cEl.value = Math.floor(parseFloat(cEl.value));
  const sasaranEl = document.getElementById(`sasaran-${no}`);
  const sasaran = sasaranEl ? (parseInt(sasaranEl.value) || 0) : 0;
  const isKunci = INDIKATOR_TARGET_KUNCI.includes(no);
  // Untuk indikator kunci: batas maks realisasi = sasaran tahunan
  // Untuk indikator biasa: batas maks realisasi = target bulan ini
  const t = parseInt(tEl.value) || 0;
  const batasMaks = isKunci && sasaran > 0 ? sasaran : t;
  let c = parseInt(cEl.value) || 0;
  if (batasMaks > 0 && c > batasMaks) {
    cEl.value = batasMaks;
    c = batasMaks;
    const label = isKunci ? `target tahunan (${batasMaks})` : `target bulan ini (${batasMaks})`;
    toast(`Realisasi Indikator ${no} disesuaikan ke ${label}`, 'warning');
  }
  updateSisaTarget(no);
  previewSPM(no);
}

function updateSisaTarget(no) {
  const sisaEl = document.getElementById(`sisa-${no}`);
  if (!sisaEl) return;
  const sasaranEl = document.getElementById(`sasaran-${no}`);
  const sasaran = parseInt(sasaranEl?.value) || 0;
  const isKunci = INDIKATOR_TARGET_KUNCI.includes(no);
  let sisaBaru = null;
  if (isKunci) {
    sisaBaru = sasaran > 0 ? sasaran : null;
  } else if (sasaran > 0) {
    const prevKum = parseInt(document.getElementById(`prevkum-${no}`)?.value) || 0;
    const capaian = parseInt(document.getElementById(`c-${no}`)?.value) || 0;
    sisaBaru = Math.max(0, sasaran - prevKum - capaian);
  }
  if (sisaBaru !== null) {
    sisaEl.textContent = sisaBaru;
    sisaEl.style.color = sisaBaru === 0 ? '#16a34a' : (sisaBaru < 10 ? '#f59e0b' : '#1e293b');
  } else {
    sisaEl.innerHTML = '<span style="color:#cbd5e1">-</span>';
  }
}

function previewSPM(changedNo) {
  // Paksa integer pada target juga
  const tEl2 = document.getElementById(`t-${changedNo}`);
  if (tEl2 && tEl2.value.includes('.')) tEl2.value = Math.floor(parseFloat(tEl2.value));
  // Auto-koreksi Target Bulan Ini
  if (tEl2) {
    const sasaranEl = document.getElementById(`sasaran-${changedNo}`);
    const sasaran = sasaranEl ? parseInt(sasaranEl.value) : 0;
    const isKunci = INDIKATOR_TARGET_KUNCI.includes(changedNo);
    if (sasaran > 0) {
      let tVal = parseInt(tEl2.value) || 0;
      if (isKunci && tVal !== sasaran) {
        // Indikator 8 & 9: target bulan HARUS = target tahunan, apapun yang diinput
        tEl2.value = sasaran;
        toast(`Target Bulan Ini Indikator ${changedNo} otomatis disesuaikan ke Target Tahunan (${sasaran})`, 'warning');
        // Clamp realisasi juga kalau melebihi sasaran tahunan
        const cEl2 = document.getElementById(`c-${changedNo}`);
        if (cEl2 && (parseInt(cEl2.value) || 0) > sasaran) {
          cEl2.value = sasaran;
          toast(`Realisasi Indikator ${changedNo} disesuaikan ke target tahunan (${sasaran})`, 'warning');
        }
      } else if (!isKunci && tVal > sasaran) {
        // Indikator biasa: tidak boleh melebihi target tahunan
        tEl2.value = sasaran;
        toast(`Target Bulan Ini Indikator ${changedNo} disesuaikan ke Target Tahunan (${sasaran})`, 'warning');
      }
    }
  }
  // Update capaian % display untuk baris yang berubah
  const tEl = document.getElementById(`t-${changedNo}`);
  const cEl = document.getElementById(`c-${changedNo}`);
  const capEl = document.getElementById(`cap-${changedNo}`);
  if (tEl && cEl && capEl) {
    const t = parseInt(tEl.value) || 0;
    const c = parseInt(cEl.value) || 0;
    capEl.textContent = fmtCapaianPct(c, t);
  }
  // Hitung SPM preview — gabung data DOM (indikator yang tampil) + indikatorData (yang tersembunyi)
  let totalNilai = 0, totalBobot = 0;
  // Mulai dari semua indikator (termasuk yang tidak tampil)
  (indikatorData || []).forEach(ind => {
    const tDom = document.getElementById(`t-${ind.no}`);
    const cDom = document.getElementById(`c-${ind.no}`);
    const t = tDom ? (parseFloat(tDom.value) || 0) : (parseFloat(ind.target) || 0);
    const c = cDom ? (parseFloat(cDom.value) || 0) : (parseFloat(ind.capaian) || 0);
    const bobot = parseInt(ind.bobot) || 0;
    const rasio = t > 0 ? Math.min(c / t, 1) : 0;
    totalNilai += bobot * rasio;
    totalBobot += bobot;
  });
  const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
  const indeksKinerja = totalBobot > 0 ? round2(totalNilai / totalBobot) : 0;
  const indeksSPM = round2(indeksKinerja * 0.33);
  // Update display dengan tanda bahwa ini preview (belum tersimpan)
  const topEl = document.getElementById('indModalSPMTop');
  if (topEl) topEl.textContent = indeksSPM.toFixed(2);
}

// ============== DETAIL MODAL ==============
// Cache nama user (email → nama) agar tidak fetch berulang kali
if (!window._userNamaCache) window._userNamaCache = {};
async function _getNamaByEmail(email) {
  if (!email) return email;
  if (window._userNamaCache[email]) return window._userNamaCache[email];
  try {
    const users = await API.getUsers();
    (users || []).forEach(u => { window._userNamaCache[u.email] = u.nama || u.email; });
  } catch(e) {}
  return window._userNamaCache[email] || email;
}

async function viewDetail(idUsulan) {
  document.getElementById('detailModalId').textContent = idUsulan;
  showModal('detailModal');
  document.getElementById('detailModalBody').innerHTML = loadingBlock('Memuat data...');
  try {
    const [detail, inds] = await Promise.all([API.getDetailUsulan(idUsulan), API.getIndikatorUsulan(idUsulan)]);
    // Resolve nama Kepala Puskesmas dari email jika belum ada namaKapus
    if (!detail.namaKapus && detail.kapusApprovedBy) {
      detail.namaKapus = await _getNamaByEmail(detail.kapusApprovedBy);
    }
    const vp = detail.verifikasiProgram || [];
    const _vpSelesai  = vp.filter(v=>v.status==='Selesai').length;
    const _vpTolak    = vp.filter(v=>v.status==='Ditolak').length;
    const _vpTunggu   = vp.filter(v=>v.status==='Menunggu').length;
    // Selesai + Menolak = sudah melakukan verifikasi (keduanya dihitung sebagai progress)
    const _vpSudahVerif = _vpSelesai + _vpTolak;
    const _vpPct      = vp.length ? Math.round((_vpSudahVerif / vp.length) * 100) : 0;
    const _svgGroups = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
    const _svgCheck  = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0d9488" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    const _svgX      = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    const _svgClock  = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
    const vpHtml = vp.length ? `
      <div style="margin-top:16px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px">
          <div style="display:flex;align-items:center;gap:7px;font-weight:700;font-size:13px;color:#0f172a">
            <span style="color:var(--primary);display:flex">${_svgGroups}</span>
            Progress Verifikasi Pengelola Program
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="display:flex;align-items:center;gap:4px;background:#e6fffa;border:1px solid #99f6e4;border-radius:20px;padding:3px 10px;font-size:12px;font-weight:700;color:#0d9488">
              ${_svgCheck} ${_vpSelesai} selesai
            </span>
            ${_vpTolak ? `<span style="display:flex;align-items:center;gap:4px;background:var(--danger-light,#fef2f2);border:1px solid #fca5a5;border-radius:20px;padding:3px 10px;font-size:12px;font-weight:700;color:#ef4444">${_svgX} ${_vpTolak} menolak</span>` : ''}
            <span style="display:flex;align-items:center;gap:4px;background:#fffbeb;border:1px solid #fde68a;border-radius:20px;padding:3px 10px;font-size:12px;font-weight:700;color:#d97706">
              ${_svgClock} ${_vpTunggu} menunggu
            </span>
            <span style="font-size:11px;color:#94a3b8;font-weight:600">${_vpSudahVerif}/${vp.length}</span>
          </div>
        </div>
        <div style="height:6px;background:#e2e8f0;border-radius:99px;overflow:hidden;margin-bottom:10px;display:flex">
          <div style="height:100%;width:${vp.length?Math.round((_vpSelesai/vp.length)*100):0}%;background:linear-gradient(90deg,#0d9488,#06b6d4);transition:width .3s"></div>
          <div style="height:100%;width:${vp.length?Math.round((_vpTolak/vp.length)*100):0}%;background:#ef4444;transition:width .3s"></div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px">
          ${[...vp].sort((a,b)=>(a.nama_program||a.email_program).localeCompare(b.nama_program||b.email_program,'id')).map(v => {
            // Jika status global sudah melewati tahap PP, semua PP dianggap selesai
            const _ppSudahLewat = ['Menunggu Admin','Selesai'].includes(detail.statusGlobal);
            const isDitolakVP = v.status === 'Ditolak' && !_ppSudahLewat;
            const isSelesai = _ppSudahLewat || v.status === 'Selesai';
            const bg = isDitolakVP ? '#fef2f2' : isSelesai ? '#e6fffa' : '#f8fafc';
            const border = isDitolakVP ? '#fca5a5' : isSelesai ? '#0d9488' : '#e2e8f0';
            const icon = isDitolakVP ? 'cancel' : isSelesai ? 'check_circle' : 'hourglass_top';
            const iconColor = isDitolakVP ? '#ef4444' : isSelesai ? '#0d9488' : '#94a3b8';
            const nameColor = isDitolakVP ? '#dc2626' : isSelesai ? '#0d9488' : '#64748b';
            return `<div style="background:${bg};border:1.5px solid ${border};border-radius:8px;padding:10px">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
                <span class="material-icons" style="font-size:15px;color:${iconColor}">${icon}</span>
                <span style="font-size:12.5px;font-weight:700;color:${nameColor}">${v.nama_program||v.email_program}</span>
              </div>
              <div style="font-size:11px;color:#94a3b8">Indikator: ${v.indikator_akses||'Semua'}</div>
              ${v.verified_at ? `<div style="font-size:10.5px;color:${iconColor}">${formatDateTime(v.verified_at)}</div>` : ''}
              ${isDitolakVP && v.catatan ? (() => {
  const id = 'alasan_' + Math.random().toString(36).slice(2,8);
  const short = v.catatan.length > 80;
  return `<div style="font-size:11px;color:#7f1d1d;margin-top:4px;background:#fee2e2;border-radius:4px;padding:4px 6px">
    <span style="font-weight:700">Alasan:</span>
    <span id="${id}" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${v.catatan}</span>
    ${short ? `<button onclick="(function(b){var s=document.getElementById('${id}');var open=s.style.webkitLineClamp==='unset';s.style.webkitLineClamp=open?'2':'unset';b.textContent=open?'Selengkapnya':'Sembunyikan';})(this)" style="background:none;border:none;color:#b91c1c;font-size:10.5px;font-weight:700;cursor:pointer;padding:0;margin-top:2px;display:block">Selengkapnya</button>` : ''}
  </div>`;
})() : ''}
${isSelesai && v.catatan ? (() => {
  const id2 = 'ctt_' + Math.random().toString(36).slice(2,8);
  const short2 = v.catatan.length > 80;
  return `<div style="font-size:11px;color:#065f46;margin-top:3px;font-style:italic">
    <span id="${id2}" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">"${v.catatan}"</span>
    ${short2 ? `<button onclick="(function(b){var s=document.getElementById('${id2}');var open=s.style.webkitLineClamp==='unset';s.style.webkitLineClamp=open?'2':'unset';b.textContent=open?'Selengkapnya':'Sembunyikan';})(this)" style="background:none;border:none;color:#065f46;font-size:10.5px;font-weight:700;cursor:pointer;padding:0;margin-top:2px;display:block">Selengkapnya</button>` : ''}
  </div>`;
})() : ''}

            </div>`;
          }).join('')}
        </div>
      </div>` : '';

    // Show/hide PDF btn
  const pdfBtn = document.getElementById('btnDownloadPDF');
  if (pdfBtn) pdfBtn.style.display = detail.statusGlobal === 'Selesai' ? 'inline-flex' : 'none';

  // Banner alasan penolakan — collapsible, tampil paling atas kalau ditolak
  const rejectionBanner = ['Ditolak','Ditolak Sebagian'].includes(detail.statusGlobal) ? `
    <div style="background:var(--danger-light,#fef2f2);border:2px solid #fca5a5;border-radius:10px;margin-bottom:16px;overflow:hidden">
      <button onclick="(function(btn){var b=btn.nextElementSibling;var a=btn.querySelector('.ri-arrow');var open=b.style.display!=='none';b.style.display=open?'none':'block';a.style.transform=open?'rotate(0deg)':'rotate(180deg)';})(this)" style="width:100%;display:flex;gap:10px;align-items:center;padding:12px 16px;background:none;border:none;cursor:pointer;text-align:left">
        <span class="material-icons" style="color:#ef4444;font-size:20px;flex-shrink:0">cancel</span>
        <span style="font-weight:700;font-size:13.5px;color:#dc2626;flex:1">Usulan Ditolak oleh ${detail.ditolakOleh || 'Verifikator'}</span>
        <span class="material-icons ri-arrow" style="font-size:18px;color:#b91c1c;flex-shrink:0;transition:transform .2s">expand_more</span>
      </button>
      <div style="display:none;padding:0 16px 14px 16px">
        <div style="font-size:13px;color:#7f1d1d;background:#fee2e2;border-radius:6px;padding:8px 12px">
          <span style="font-weight:600">Alasan:</span> ${detail.alasanTolak || '(tidak ada keterangan)'}
        </div>
        <div style="font-size:12px;color:#ef4444;margin-top:8px;display:flex;align-items:center;gap:4px">
          <span class="material-icons" style="font-size:14px">info</span>
          Perbaiki data dan ajukan ulang melalui tombol <strong>Perbaiki</strong>.
        </div>
      </div>
    </div>` : '';

  document.getElementById('detailModalBody').innerHTML = `
    <div style="padding:24px;background:white">
      ${rejectionBanner}
      <div style="margin-bottom:16px">${renderStatusBar({...detail, vpProgress: detail.verifikasiProgram ? {total:vp.length,selesai:vp.filter(v=>v.status==='Selesai').length} : null})}</div>
      ${renderHeaderInfo(detail)}
      ${detail.driveFolderUrl ? `<div style="margin-bottom:12px"><a href="${detail.driveFolderUrl}" target="_blank" class="btn btn-secondary btn-sm"><span class="material-icons" style="font-size:14px">folder_open</span> Lihat Folder Data Dukung Google Drive</a></div>` : ''}
      <div style="font-weight:700;font-size:13.5px;margin-bottom:8px">Detail Indikator</div>
      <div class="table-container">
        <table>
          <thead><tr><th>No</th><th>Indikator</th><th style="text-align:center;min-width:80px">Target Tahunan</th><th style="text-align:center">Target Bulan Ini</th><th style="text-align:center">Realisasi Bulan Ini</th><th style="text-align:center;min-width:80px">Sisa Target Tahunan</th><th style="text-align:center">Capaian</th><th style="text-align:center">Data Dukung</th></tr></thead>
          <tbody>${inds.map(i => { const _sisa = INDIKATOR_TARGET_KUNCI.includes(i.no) ? (i.sasaranTahunan > 0 ? i.sasaranTahunan : null) : (i.sasaranTahunan > 0 ? Math.max(0, i.sasaranTahunan - i.realisasiKumulatif) : null); const _sc = _sisa !== null && _sisa === 0 ? '#16a34a' : (_sisa !== null && _sisa < 10 ? '#f59e0b' : '#1e293b'); return `<tr>
            <td>${i.no}</td><td style="max-width:220px;font-size:12.5px">${i.nama}</td>
            <td style="text-align:center;color:#475569">${i.sasaranTahunan > 0 ? i.sasaranTahunan : '<span style=\"color:#cbd5e1\">-</span>'}</td>
            <td style="text-align:center">${i.target}</td><td style="text-align:center">${i.capaian}</td>
            <td style="text-align:center;font-weight:700;color:${_sc}">${_sisa !== null ? _sisa : '<span style=\"color:#cbd5e1\">-</span>'}</td>
            <td style="text-align:center">${fmtCapaianPct(i.capaian, i.target)}</td>
            
            <td style="text-align:center">${i.linkFile ? (() => { try { const ls = JSON.parse(i.linkFile); const arr = Array.isArray(ls) ? ls.map(f=>typeof f==='string'?{id:null,url:f,name:'File'}:f) : [{id:null,url:i.linkFile,name:'File'}]; window[`_buktiLinks_${i.no}`]={links:arr,idUsulan:i.idUsulan||''}; return `<button onclick="openBuktiModal(${i.no},0)" style="background:none;border:none;cursor:pointer;color:#0d9488;display:inline-flex;align-items:center;gap:3px;font-size:12px;padding:2px 6px;border-radius:5px" onmouseover="this.style.background='rgba(13,148,136,0.08)'" onmouseout="this.style.background='none'"><span class="material-icons" style="font-size:14px">visibility</span></button>`; } catch(e){ return `<a href="${i.linkFile}" target="_blank" style="color:#0d9488"><span class="material-icons" style="font-size:13px">visibility</span></a>`; } })() : '-'}</td>
          </tr>`; }).join('')}</tbody>
        </table>
      </div>
      ${vpHtml}
      <div style="margin-top:16px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
        ${approvalBox('Kepala Puskesmas', detail.namaKapus || detail.kapusApprovedBy, detail.kapusApprovedAt, detail.statusKapus==='Ditolak' ? detail.kapusCatatan : '')}
        ${approvalBox('Pengelola Program', vp.length && vp.every(v=>v.status==='Selesai') ? 'Semua selesai' : '', '', detail.statusProgram==='Ditolak' ? detail.adminCatatan : '')}
        ${approvalBox('Admin', detail.adminApprovedBy, detail.adminApprovedAt, detail.statusGlobal==='Ditolak' && detail.statusKapus!=='Ditolak' && detail.statusProgram!=='Ditolak' ? detail.adminCatatan : '')}
      </div>
    </div>`;
  } catch (e) { if (!window._verifSilentReload) toast(e.message, 'error'); }
}

function approvalBox(label, by, at, alasanTolak = '') {
  const isDitolak = !!alasanTolak;
  const color = isDitolak ? '#fef2f2' : by ? '#e6fffa' : '#f8fafc';
  const borderColor = isDitolak ? '#fca5a5' : by ? '#0d9488' : '#e2e8f0';
  const textColor = isDitolak ? '#dc2626' : by ? '#065f46' : '#94a3b8';
  const icon = isDitolak ? 'cancel' : by ? 'check_circle' : 'hourglass_empty';
  const iconColor = isDitolak ? '#ef4444' : by ? '#0d9488' : '#cbd5e1';
  return `<div style="background:${color};border:1.5px solid ${borderColor};border-radius:10px;padding:12px;">
    <div style="display:flex;align-items:center;gap:5px;margin-bottom:4px">
      <span class="material-icons" style="font-size:14px;color:${iconColor}">${icon}</span>
      <span style="font-size:11px;font-weight:700;color:${textColor};text-transform:uppercase;letter-spacing:0.5px">${label}</span>
    </div>
    <div style="font-size:13px;font-weight:600;color:${textColor}">${isDitolak ? 'Ditolak' : (by || 'Belum')}</div>
    ${at ? `<div style="font-size:11px;color:var(--text-light)">${formatDateTime(at)}</div>` : ''}
    ${isDitolak && alasanTolak ? `<div style="font-size:11px;color:#7f1d1d;margin-top:4px;font-style:italic">"${alasanTolak}"</div>` : ''}
  </div>`;
}


// ============== LAPORAN PDF ==============
// ============== RIWAYAT AKTIVITAS (MODAL) ==============
async function openLogAktivitas(idUsulan) {
  let modal = document.getElementById('logAktivitasModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'logAktivitasModal';
    modal.className = 'modal fullscreen';
    modal.style.zIndex = '3500';
    modal.addEventListener('click', e => { if (e.target === modal) closeModal('logAktivitasModal'); });
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div class="modal-card" style="display:flex;flex-direction:column;height:100%;border-radius:0">
      <div class="modal-header">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--primary);flex-shrink:0"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <span>Riwayat Aktivitas</span>
        <button id="btnLogDownloadLog" disabled
          style="opacity:0.35;cursor:not-allowed;background:transparent;border:none;color:#6366f1;width:34px;height:34px;display:inline-flex;align-items:center;justify-content:center;margin-left:auto;margin-right:4px;flex-shrink:0"
          title="Download tersedia setelah verifikasi selesai">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v10"/><path d="m8 9 4 4 4-4"/><path d="M4 17c0 2.2 1.8 4 4 4h8c2.2 0 4-1.8 4-4"/></svg>
        </button>
        <button class="btn-icon" onclick="closeModal('logAktivitasModal')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
      <div class="modal-body" id="logAktivitasBody" style="padding:20px;flex:1;overflow-y:auto">
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;padding:60px 0">
          ${spinnerHTML('xl')}
          <p style="font-size:13px;color:#64748b;font-weight:500;margin:0">Memuat riwayat...</p>
        </div>
      </div>
    </div>`;
  showModal('logAktivitasModal');
  try {
    const data = await API.getLogAktivitas(idUsulan);
    const { logs, usulan } = data;
    // SVG icon library untuk Riwayat Aktivitas
    const _svgIconsLog = {
      send:         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
      restart_alt:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/></svg>`,
      check_circle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
      verified:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/></svg>`,
      update:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.18-5"/></svg>`,
      cancel:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
      remove_circle:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`,
      cancel_ind:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
      reply:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>`,
      undo:         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 7 3 3 7 3"/><path d="M3 3l5 5"/><path d="M21 13A9 9 0 0 1 3 13v-3"/></svg>`,
      undo_pp:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>`,
      gavel:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 13-8.5 8.5a2.12 2.12 0 0 1-3-3L11 10"/><path d="m16 16 6-6"/><path d="m8 8 6-6"/><path d="m9 7 8 8"/></svg>`,
      gavel_fin:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 13-8.5 8.5a2.12 2.12 0 0 1-3-3L11 10"/><path d="m16 16 6-6"/><path d="m8 8 6-6"/><path d="m9 7 8 8"/><circle cx="20" cy="4" r="2" fill="currentColor"/></svg>`,
      fact_check:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
      how_to_reg:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>`,
      question_ans: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="9" y1="10" x2="15" y2="10"/><line x1="12" y1="7" x2="12" y2="13"/></svg>`,
      reply_all:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 17 2 12 7 7"/><polyline points="12 17 7 12 12 7"/><path d="M22 18v-2a4 4 0 0 0-4-4H7"/></svg>`,
      assign_ret:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>`,
      restore:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.06 13a9 9 0 1 0 .49-4.95"/><polyline points="3 3 3 9 9 9"/><line x1="12" y1="7" x2="12" y2="12"/><circle cx="12" cy="15" r="1" fill="currentColor"/></svg>`,
      info:         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
      slash_circle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`,
      konfirmasi:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/></svg>`,
      terima_adm:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="m9 12 2 2 4-4"/></svg>`,
      kapus_pp:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`,
    };
    function _svgIco(key, size) {
      const svg = _svgIconsLog[key] || _svgIconsLog.info;
      return svg.replace('<svg ', `<svg width="${size}" height="${size}" `);
    }
    const aksiConfig = {
      'Submit':                   { color:'#0d9488', bg:'#f0fdf9', icon:'send',         label:'Diajukan' },
      'Ajukan Ulang':             { color:'#0284c7', bg:'#e0f2fe', icon:'restart_alt',  label:'Ajukan Ulang' },
      'Approve':                  { color:'#16a34a', bg:'#f0fdf4', icon:'check_circle', label:'Disetujui' },
      'Approve Final':            { color:'#15803d', bg:'#dcfce7', icon:'verified',     label:'Final Disetujui' },
      'Re-verifikasi':            { color:'#06b6d4', bg:'#ecfeff', icon:'update',       label:'Re-verifikasi' },
      'Tolak':                    { color:'#dc2626', bg:'#fef2f2', icon:'cancel',       label:'Ditolak' },
      'Tolak (sebagian)':         { color:'#ea580c', bg:'#fff7ed', icon:'remove_circle',label:'Tolak Sebagian' },
      'Tolak Indikator':          { color:'#be123c', bg:'#fff1f2', icon:'cancel_ind',   label:'Tolak Indikator' },
      'Tolak Ke Operator':        { color:'#b91c1c', bg:'#fef2f2', icon:'reply',        label:'Tolak Ke Operator' },
      'Kembalikan':               { color:'#7c3aed', bg:'#f5f3ff', icon:'undo',         label:'Dikembalikan' },
      'Sanggah':                  { color:'#9333ea', bg:'#faf5ff', icon:'gavel',        label:'Sanggah' },
      'Sanggah Selesai':          { color:'#a21caf', bg:'#fdf4ff', icon:'gavel_fin',    label:'PP Sanggah → Admin' },
      'PP Membenarkan':           { color:'#0f766e', bg:'#f0fdfa', icon:'fact_check',   label:'PP Setuju Tolak → Kapus' },
      'Kapus Membenarkan':        { color:'#b45309', bg:'#fefce8', icon:'how_to_reg',   label:'Kapus Setuju Tolak' },
      'Kapus Menyanggah':         { color:'#c2410c', bg:'#fff7ed', icon:'gavel',        label:'Kapus Tidak Setuju' },
      'Reset':                    { color:'#64748b', bg:'#f8fafc', icon:'restart_alt',  label:'Direset Admin' },
      'Restore Verif':            { color:'#6366f1', bg:'#eef2ff', icon:'restore',      label:'Dipulihkan' },
      'Respond Penolakan':        { color:'#2563eb', bg:'#eff6ff', icon:'question_ans', label:'Respond Penolakan' },
      'Sanggah → Admin':          { color:'#7e22ce', bg:'#f3e8ff', icon:'reply_all',    label:'Sanggah → Admin' },
      'Sanggah → Kapus':          { color:'#d97706', bg:'#fffbeb', icon:'reply_all',    label:'Sanggah → Kapus' },
      'Kembalikan ke PP':         { color:'#4f46e5', bg:'#eef2ff', icon:'assign_ret',   label:'Kembalikan ke PP' },
      'Benarkan Penolakan Admin': { color:'#991b1b', bg:'#fef2f2', icon:'fact_check',   label:'PP Setuju → Ditolak' },
      'Kapus Sanggah':            { color:'#db2777', bg:'#fdf2f8', icon:'gavel',        label:'Kapus Sanggah' },
      'Kapus Terima Penolakan':   { color:'#f59e0b', bg:'#fffbeb', icon:'undo',         label:'Kapus Terima Penolakan' },
      'Selesai':                  { color:'#059669', bg:'#ecfdf5', icon:'verified',     label:'Selesai' },
      'Tolak Global':             { color:'#450a0a', bg:'#fff1f2', icon:'slash_circle', label:'Ditolak Admin' },
      'Konfirmasi Re-verif':      { color:'#0369a1', bg:'#e0f2fe', icon:'konfirmasi',   label:'Konfirmasi Re-verif' },
      'Terima Penolakan Admin':   { color:'#7f1d1d', bg:'#fef2f2', icon:'terima_adm',   label:'Terima Penolakan Admin' },
      'Dikembalikan':             { color:'#6d28d9', bg:'#ede9fe', icon:'undo',         label:'Dikembalikan' },
    };
    function fmtDT(ts) {
      const d = new Date(ts);
      const o = { timeZone: 'Asia/Makassar' };
      const tgl = d.toLocaleDateString('id-ID', { ...o, day:'2-digit', month:'2-digit', year:'numeric' });
      const jam = d.toLocaleTimeString('id-ID', { ...o, hour:'2-digit', minute:'2-digit', hour12:false });
      return `${tgl} | ${jam} WITA`;
    }
    const COLS = 10;
    let gridHtml;
    if (!logs.length) {
      gridHtml = `<div class="empty-state"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/><line x1="2" y1="2" x2="22" y2="22" stroke="#cbd5e1"/></svg><p>Belum ada aktivitas</p></div>`;
    } else {
      // Expand logs: log yang punya 2 tindakan dipecah jadi 2 bubble terpisah
      const expandedLogs = [];
      logs.forEach(log => {
        // Kapus Membenarkan + sebagian disetujui → 2 bubble
        if (log.aksi === 'Kapus Membenarkan' && log.detail && log.detail.includes('Indikator disetujui Kapus (→ PP):')) {
          const splitIdx = log.detail.indexOf('| Indikator disetujui Kapus (→ PP):');
          const tolakDetail = log.detail.substring(0, splitIdx).replace(/\s*\|\s*$/, '').trim();
          const setujuDetail = log.detail.substring(splitIdx).replace(/^\|\s*Indikator disetujui Kapus \(→ PP\):\s*/, '').trim();
          expandedLogs.push({ ...log, aksi: 'Kapus Membenarkan', detail: tolakDetail, _splitLabel: null });
          // Format setujuDetail: "#1: alasan, #2: alasan" → lebih rapi
          const setujuFormatted = setujuDetail.split(',').map(s => s.trim()).filter(Boolean)
            .map(s => {
              const m = s.match(/^#?(\d+)(?::\s*(.*))?$/);
              return m ? `Ind.#${m[1]}${m[2] ? ': ' + m[2] : ''}` : s;
            }).join(' | ');
          expandedLogs.push({ ...log, aksi: '_KapusSetujuPP', detail: setujuFormatted || setujuDetail, _splitLabel: null });
        }
        // Approve re-verifikasi dengan catatan → tampilkan catatan di bubble _KapusSetujuPP
        else if (log.aksi === 'Approve' && log.detail && log.detail.includes('Catatan:')) {
          const catatanIdx = log.detail.indexOf('| Catatan:');
          const mainDetail = catatanIdx >= 0 ? log.detail.substring(0, catatanIdx).trim() : log.detail;
          const catatanDetail = catatanIdx >= 0 ? log.detail.substring(catatanIdx).replace(/^\|\s*/, '').trim() : '';
          expandedLogs.push({ ...log, aksi: 'Approve', detail: mainDetail, _splitLabel: null });
          if (catatanDetail) {
            expandedLogs.push({ ...log, aksi: '_KapusSetujuPP', detail: catatanDetail, _splitLabel: null });
          }
        }
        // PP Membenarkan + ada sanggah sebelumnya → sudah terpisah di DB (Sanggah Selesai + PP Membenarkan)
        // Tapi jika PP Membenarkan punya info sanggah inline, pisahkan juga
        else {
          expandedLogs.push(log);
        }
      });
      // Tambahkan entry aksiConfig untuk bubble synthetic
      aksiConfig['_KapusSetujuPP'] = { color:'#15803d', bg:'#dcfce7', icon:'kapus_pp', label:'Kapus Setujui → PP' };
      const rows = [];
      for (let i = 0; i < expandedLogs.length; i += COLS) rows.push(expandedLogs.slice(i, i + COLS));
      let html = '';
      let globalIdx = 0;
      rows.forEach((row, rowIdx) => {
        const isLtrRow = rowIdx % 2 === 0;
        const rowWithIdx = row.map(l => ({log:l, idx: globalIdx++}));
        const displayRow = isLtrRow ? rowWithIdx : [...rowWithIdx].reverse();
        const isLastRow = rowIdx === rows.length - 1;
        html += `<div style="display:flex;flex-direction:row;align-items:flex-start;gap:0;position:relative;margin-bottom:0">`;
        displayRow.forEach(({log, idx}, di) => {
          const cfg = aksiConfig[log.aksi] || { color:'#64748b', bg:'#f8fafc', icon:'info', label:log.aksi };
          const isLastInDisplayRow = di === displayRow.length - 1;
          const hasRight = !isLastInDisplayRow;
          html += `<div style="position:relative;display:flex;flex-direction:column;align-items:center;flex:1;min-width:0;padding:0 4px">
            <div style="font-size:9.5px;font-weight:800;color:${cfg.color};margin-bottom:3px">#${idx+1}</div>
            <div style="width:40px;height:40px;border-radius:50%;background:${cfg.bg};border:2.5px solid ${cfg.color};display:flex;align-items:center;justify-content:center;flex-shrink:0;z-index:1;box-shadow:0 1px 4px ${cfg.color}33">
              ${_svgIco(cfg.icon, 18).replace('<svg ', `<svg style="color:${cfg.color}" `)}
            </div>
            <div style="margin-top:5px;display:flex;flex-direction:column;align-items:center;gap:2px;width:100%">
              <span style="font-size:10px;font-weight:700;color:${cfg.color};background:${cfg.bg};padding:1px 7px;border-radius:20px;border:1px solid ${cfg.color};white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis">${cfg.label}</span>
              <span style="font-size:10px;font-weight:600;color:#0f172a;text-align:center;line-height:1.3;word-break:break-word">${log.user_nama||log.user_email}</span>
              <span style="font-size:9.5px;color:#64748b;text-align:center">${log.role}</span>
              <span style="font-size:9px;color:#b0bec5;text-align:center">${fmtDT(log.timestamp)}</span>
              ${log.detail ? `<div style="font-size:10px;color:#334155;background:#f8fafc;border-left:2.5px solid ${cfg.color};padding:4px 7px;border-radius:0 5px 5px 0;line-height:1.5;margin-top:3px;text-align:left;width:100%;box-sizing:border-box;word-break:break-word">${log.detail}</div>` : ''}
            </div>
            ${hasRight ? `<div style="position:absolute;top:26px;left:calc(50% + 18px);right:0;height:2px;background:linear-gradient(to right,${cfg.color}66,#cbd5e1);z-index:0"></div>` : ''}
          </div>`;
        });
        html += `</div>`;
        if (!isLastRow) {
          const lastLog = isLtrRow ? row[row.length-1] : row[0];
          const lCfg = aksiConfig[lastLog.aksi] || { color:'#94a3b8' };
          const side = isLtrRow ? 'justify-content:flex-end' : 'justify-content:flex-start';
          html += `<div style="display:flex;${side};padding:0 4px;margin:0">
            <div style="display:flex;flex-direction:column;align-items:center">
              <div style="width:2px;height:20px;background:linear-gradient(to bottom,${lCfg.color}88,#cbd5e1)"></div>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-top:-2px"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
            </div>
          </div>`;
        }
      });
      gridHtml = html;
    }

    document.getElementById('logAktivitasBody').innerHTML = `
      <div style="background:#f8fafc;border-radius:10px;padding:10px 16px;margin-bottom:14px;font-size:12.5px;color:#334155;border:1px solid #e2e8f0">
        <div style="font-weight:700;font-size:13px;margin-bottom:2px">${usulan.idUsulan}</div>
        <div>${usulan.namaPKM} — ${usulan.namaBulan} ${usulan.tahun}</div>
      </div>
      <div style="width:100%">${gridHtml}</div>`;

    const btnLogDl = document.getElementById('btnLogDownloadLog');
    if (btnLogDl) {
      const isSelesai = usulan.statusGlobal === 'Selesai';
      if (isSelesai) {
        btnLogDl.disabled = false;
        btnLogDl.style.opacity = '1';
        btnLogDl.style.cursor = 'pointer';
        btnLogDl.style.color = '#10b981';
        btnLogDl.title = 'Download Riwayat Aktivitas PDF';
        btnLogDl.onclick = () => bukaLaporan(idUsulan, 'log');
      }
    }
  } catch(e) {
    const b = document.getElementById('logAktivitasBody');
    if (b) b.innerHTML = `<div class="empty-state"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg><p>Gagal memuat: ${e.message}</p></div>`;
  }
}

// ============================================================
//  BUKA LAPORAN — fetch HTML dari server lalu buka print dialog
//  mode: 'sementara' | 'final' | 'log'
// ============================================================
async function bukaLaporan(idUsulan, mode, aksesIndikator) {
  const modeLabel = { sementara:'Laporan Sementara', final:'Laporan Final', log:'Riwayat Aktivitas' };

  // window.open HARUS dipanggil sync sebelum await — agar browser tidak blokir popup
  const pw = window.open('', '_blank');
  if (!pw) { toast('Popup diblokir browser. Izinkan popup untuk situs ini.', 'error'); return; }
  const _modeSubtitle = { sementara:'Laporan Sementara', final:'Laporan Final', log:'Riwayat Aktivitas' };
  const _steps = mode === 'log'
    ? ['Mengambil data log...','Menyusun riwayat aktivitas...','Menyiapkan tampilan...']
    : ['Mengambil data laporan...','Memuat tanda tangan...','Menyusun halaman...','Menyiapkan cetak...'];
  pw.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Memuat Laporan...</title><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',Arial,sans-serif;background:#0f172a;display:flex;align-items:center;justify-content:center;height:100vh;overflow:hidden}
    body::before{content:'';position:fixed;inset:0;background:radial-gradient(ellipse 80% 60% at 50% 0%,rgba(13,148,136,0.15) 0%,transparent 70%);pointer-events:none}
    .card{background:rgba(15,23,42,0.95);border:1px solid rgba(13,148,136,0.25);border-radius:24px;padding:44px 52px;text-align:center;box-shadow:0 0 0 1px rgba(255,255,255,0.04),0 32px 80px rgba(0,0,0,0.6);max-width:400px;width:90%;position:relative;overflow:hidden}
    .card::before{content:'';position:absolute;top:-1px;left:20%;right:20%;height:1px;background:linear-gradient(90deg,transparent,#0d9488,transparent)}
    .logo-wrap{width:72px;height:72px;margin:0 auto 24px;position:relative}
    .pulse{position:absolute;inset:-8px;border-radius:50%;border:1px solid rgba(13,148,136,0.3);animation:pulse 2s ease-out infinite}
    .pulse2{position:absolute;inset:-16px;border-radius:50%;border:1px solid rgba(13,148,136,0.15);animation:pulse 2s ease-out infinite .6s}
    .ring-wrap{position:absolute;inset:0}
    .ring{position:absolute;inset:0;border-radius:50%;border:2.5px solid transparent}
    .ring-1{border-top-color:#0d9488;animation:spin 1.1s linear infinite}
    .ring-2{inset:7px;border-right-color:#14b8a6;animation:spin 1.7s linear infinite reverse}
    .ring-3{inset:14px;border-bottom-color:#5eead4;animation:spin 2.3s linear infinite}
    .icon-c{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes pulse{0%{transform:scale(1);opacity:.6}100%{transform:scale(1.5);opacity:0}}
    .badge{display:inline-block;font-size:9px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#0d9488;background:rgba(13,148,136,0.1);border:1px solid rgba(13,148,136,0.3);border-radius:99px;padding:3px 10px;margin-bottom:14px}
    .title{font-size:22px;font-weight:800;color:white;letter-spacing:-0.3px;margin-bottom:6px}
    .desc{font-size:12.5px;color:#64748b;margin-bottom:28px;line-height:1.5}
    .bar-wrap{background:rgba(255,255,255,0.06);border-radius:99px;height:4px;overflow:hidden;margin-bottom:20px;position:relative}
    .bar{height:100%;width:0%;background:linear-gradient(90deg,#0d9488,#14b8a6,#5eead4);border-radius:99px;animation:load 3.8s cubic-bezier(.4,0,.2,1) forwards;position:relative}
    .bar::after{content:'';position:absolute;top:0;right:0;width:60px;height:100%;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.35));animation:shimmer 1.2s ease-in-out infinite}
    @keyframes load{0%{width:0%}25%{width:38%}55%{width:65%}78%{width:82%}95%{width:93%}100%{width:95%}}
    @keyframes shimmer{0%{opacity:0}50%{opacity:1}100%{opacity:0}}
    .steps{display:flex;flex-direction:column;gap:7px;text-align:left}
    .step{display:flex;align-items:center;gap:8px;font-size:11px;color:#1e3a4a;transition:color .4s}
    .step.active{color:#5eead4}
    .step.done{color:#0d9488}
    .step-dot{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.07);flex-shrink:0;transition:all .4s}
    .step.active .step-dot{background:#5eead4;box-shadow:0 0 8px #5eead4}
    .step.done .step-dot{background:#0d9488}
    .step-check{display:none;font-size:10px}
    .step.done .step-check{display:inline}
    .step.done .step-dot{display:none}
  </style>
  <script>
    var _s=${JSON.stringify(_steps)};
    var _t=[700,1500,2500,3300];
    _s.forEach(function(s,i){
      setTimeout(function(){
        var els=document.querySelectorAll('.step');
        if(i>0 && els[i-1]){els[i-1].className='step done';}
        if(els[i]){els[i].className='step active';}
      },_t[i]||i*900);
    });
  <\/script>
  </head><body>
    <div class="card">
      <div class="logo-wrap">
        <div class="pulse"></div><div class="pulse2"></div>
        <div class="ring-wrap">
          <div class="ring ring-1"></div>
          <div class="ring ring-2"></div>
          <div class="ring ring-3"></div>
        </div>
        <div class="icon-c"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#5eead4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg></div>
      </div>
      <div class="badge">VISPM</div>
      <div class="title">${_modeSubtitle[mode]||'Laporan'}</div>
      <div class="desc">Mohon tunggu sebentar,<br>sedang menyiapkan dokumen Anda</div>
      <div class="bar-wrap"><div class="bar"></div></div>
      <div class="steps">${_steps.map(function(s,i){return '<div class="step'+(i===0?' active':'')+'"><div class="step-dot"></div><span class="step-check">✓</span>'+s+'</div>';}).join('')}</div>
    </div>
  </body></html>`);

  toast('Menyiapkan ' + (modeLabel[mode]||'laporan') + '...', 'success');
  try {
    let _laporanUrl = `/api/laporan-pdf?id=${idUsulan}&mode=${mode}`;
    if (aksesIndikator && aksesIndikator.length) _laporanUrl += `&akses=${encodeURIComponent(aksesIndikator.join(','))}`;
    const _user = (() => { try { return JSON.parse(sessionStorage.getItem('spm_user') || '{}'); } catch(e) { return {}; } })();
    const _token = _user.sessionToken || '';
    const res = await fetch(_laporanUrl, { headers: _token ? { 'Authorization': 'Bearer ' + _token } : {} });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const html = await res.text();
    pw.document.open();
    pw.document.write(html);
    pw.document.close();
  } catch(e) {
    pw.document.write('<html><body style="font-family:Arial;padding:40px;color:#ef4444"><p>Gagal memuat laporan: ' + e.message + '</p></body></html>');
    toast('Gagal membuka laporan: ' + e.message, 'error');
  }
}

// Alias untuk backward-compat dengan tombol yang sudah ada
function downloadLaporanPDF(idUsulan)       { return bukaLaporan(idUsulan, 'final'); }
function downloadLaporanSementara(idUsulan) { return bukaLaporan(idUsulan, 'sementara'); }
