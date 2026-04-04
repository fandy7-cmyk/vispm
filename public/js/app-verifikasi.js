// ============== VERIFIKASI ==============

// FIX B: Storage badge indikator bermasalah untuk PP.
// Diisi oleh renderDashboard (atau fungsi load stats PP) setelah fetch API dashboard.
// Dipakai oleh renderUsulanTable untuk tampilkan badge "Re-verif: Ind. #1, #2" di row usulan.
window._indikatorBermasalahMap = {};

// Render badge kuning "Re-verif: Ind. #X, #Y" — dipanggil di dalam cell row/card usulan PP.
function renderBadgeIndikatorBermasalah(idUsulan) {
  const nos = (window._indikatorBermasalahMap || {})[idUsulan];
  if (!nos || !nos.length) return '';
  return `<span style="display:inline-flex;align-items:center;gap:3px;background:#fef3c7;color:#92400e;border:1px solid #fcd34d;border-radius:5px;padding:1px 7px;font-size:11px;font-weight:600;margin-left:6px;vertical-align:middle;white-space:nowrap"><span class="material-icons" style="font-size:11px">warning</span>Re-verif: Ind.&nbsp;${nos.map(n => '#' + n).join(', ')}</span>`;
}

async function renderVerifikasi() {
  const role = currentUser.role;
  // Default: tampilkan semua agar tombol hijau (sudah verif) bisa terlihat
  let statusFilter = 'semua';

  document.getElementById('mainContent').innerHTML = `
    <div class="page-header">
      <h1><span class="material-icons">verified</span>Verifikasi Usulan${role === 'Pengelola Program' ? ` — Indikator: ${currentUser.indikatorAksesString || 'Semua'}` : ''}</h1>
    </div>
    ${role === 'Admin' ? `<div class="tabs" id="verifTabs">
      <div class="tab active" onclick="loadVerifTab('semua',this)">Semua</div>
      <div class="tab" onclick="loadVerifTab('Menunggu Admin',this)">Menunggu Admin</div>
      <div class="tab" onclick="loadVerifTab('Selesai',this)">Selesai</div>
      <div class="tab" onclick="loadVerifTab('Ditolak',this)">Ditolak</div>
    </div>` : ''}
    ${role === 'Kepala Puskesmas' ? `<div class="tabs" id="verifTabs">
      <div class="tab active" onclick="loadVerifTab('semua',this)">Semua Usulan</div>
      <div class="tab" onclick="loadVerifTab('Menunggu Kepala Puskesmas',this)">Menunggu Verifikasi</div>
    </div>` : ''}
    <div class="card">
      <div class="card-body" style="padding:0" id="verifTable">
        <div class="empty-state" style="padding:32px"><div style="display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;position:relative"><div style="width:8px;height:8px;border-radius:50%;background:#378ADD"></div><div style="position:absolute;width:7px;height:7px;border-radius:50%;background:#B5D4F4;animation:orbit-dot 1s linear infinite;transform-origin:center"></div></div><p>Memuat data...</p></div>
      </div>
    </div>`;

  loadVerifData(statusFilter);
}

async function loadVerifTab(status, el) {
  document.querySelectorAll('#verifTabs .tab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  loadVerifData(status);
}

async function loadVerifData(status) {
  const params = {};
  const role = currentUser.role;

  if (role === 'Kepala Puskesmas') {
    if (!currentUser.kodePKM) { toast('Akun Kepala Puskesmas tidak terhubung ke puskesmas. Hubungi Admin.', 'error'); return; }
    params.kode_pkm = currentUser.kodePKM;
    params.email_kepala = currentUser.email;
    if (status && status !== 'semua') params.status = status;
  } else if (role === 'Pengelola Program') {
    // Tampilkan semua yang ditugaskan (sudah/belum verifikasi) agar tombol hijau terlihat
    // Include status re-verifikasi baru agar PP dan Kapus bisa lihat tugasnya
    params.status_program = 'Menunggu Pengelola Program,Menunggu Re-verifikasi PP,Ditolak,Ditolak Sebagian,Selesai,Menunggu Admin,Menunggu Kepala Puskesmas,Menunggu Re-verifikasi Kepala Puskesmas';
    params.email_program = currentUser.email;
  } else if (role === 'Admin' && status !== 'semua') {
    params.status = status;
  }

  try {
    const rows = await API.getUsulan(params);
    const verifRole = role === 'Kepala Puskesmas' ? 'kepala-puskesmas' : role === 'Pengelola Program' ? 'program' : 'admin';
    window._verifRows = rows;
    window._verifRole = verifRole;
    window._verifPage = 1;
    _renderVerifTablePaged(1);
  } catch (e) { if (!window._verifSilentReload) toast(e.message, 'error'); }
}

function _renderVerifTablePaged(page) {
  const rows = window._verifRows || [];
  const verifRole = window._verifRole || 'admin';
  const { items, page: p, totalPages, total } = paginateData(rows, page);
  window._verifPage = p;
  document.getElementById('verifTable').innerHTML =
    renderUsulanTable(items, verifRole)
    + renderPagination('verifTable', total, p, totalPages, pg => _renderVerifTablePaged(pg));
}


// Tampilkan/hide banner TT di modal verifikasi + enable/disable tombol
function _updateVerifTTBanner(ttOk, role) {
  const isAdmin = role === 'Admin';
  const SVG_WARN = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
  const SVG_PEN  = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>';
  const SVG_GEAR = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

  let ttBanner = document.getElementById('verifTTBanner');
  if (!ttBanner) {
    ttBanner = document.createElement('div');
    ttBanner.id = 'verifTTBanner';
    const modalBody = document.querySelector('#verifikasiModal .modal-body');
    if (modalBody) modalBody.insertBefore(ttBanner, modalBody.firstChild);
  }

  window._verifTTOk = ttOk; // simpan state global untuk dicek saat data load

  if (!ttOk) {
    // Banner MERAH — wajib, harus diisi sebelum verifikasi
    ttBanner.innerHTML = `
      <div style="background:#fef2f2;border:1.5px solid #fca5a5;border-radius:10px;padding:12px 16px;margin-bottom:14px;display:flex;align-items:flex-start;gap:10px">
        <span style="color:#dc2626;flex-shrink:0;margin-top:1px;display:flex">${SVG_WARN}</span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;color:#dc2626;font-size:13px;margin-bottom:3px">Tanda Tangan Belum Ada</div>
          <div style="font-size:12px;color:#7f1d1d;line-height:1.5;margin-bottom:8px">
            ${isAdmin
              ? 'Lengkapi tanda tangan <b>Pejabat Penandatangan</b> untuk mengaktifkan tombol verifikasi.'
              : 'Upload <b>tanda tangan</b> Anda untuk mengaktifkan tombol verifikasi. Setelah upload, tombol otomatis aktif.'}
          </div>
          ${isAdmin
            ? `<button onclick="loadPage('master')" style="display:inline-flex;align-items:center;gap:5px;background:#dc2626;color:white;padding:6px 12px;border-radius:6px;border:none;font-size:11px;font-weight:600;cursor:pointer">${SVG_GEAR} Buka Master Data</button>`
            : `<button onclick="window._openProfilFromVerif=true;openEditProfil()" style="display:inline-flex;align-items:center;gap:5px;background:#dc2626;color:white;padding:6px 12px;border-radius:6px;border:none;font-size:11px;font-weight:600;cursor:pointer">${SVG_PEN} Upload Tanda Tangan</button>`
          }
        </div>
      </div>`;
  } else {
    // TT sudah ada — bersihkan banner, reset tombol
    ttBanner.innerHTML = '';
    // Aktifkan btnSubmitVerif dan re-render modal verifikasi supaya kolom Setuju/Tolak muncul
    const btnSubmit = document.getElementById('btnSubmitVerif');
    if (btnSubmit && btnSubmit.disabled && btnSubmit.title === 'Upload tanda tangan terlebih dahulu') {
      btnSubmit.disabled = false;
      btnSubmit.style.opacity = '';
      btnSubmit.title = '';
    }
    // CATATAN: Tidak panggil openVerifikasi() di sini untuk menghindari infinite loop.
    // openVerifikasi() sudah memanggil _updateVerifTTBanner(), jadi tidak perlu rekursif.
    // Jika perlu reload setelah upload TT, panggil openVerifikasi() dari luar fungsi ini.
  }
}


// Tampilkan/hide banner periode tutup di modal verifikasi
function _updateVerifPeriodeBanner(isOpen, periodeInfo) {
  let periodeClosedBanner = document.getElementById('verifPeriodeBanner');
  if (!periodeClosedBanner) {
    periodeClosedBanner = document.createElement('div');
    periodeClosedBanner.id = 'verifPeriodeBanner';
    const modalBody = document.querySelector('#verifikasiModal .modal-body');
    if (modalBody) modalBody.insertBefore(periodeClosedBanner, modalBody.firstChild);
  }
  window._verifPeriodeOpen = isOpen;
  if (!isOpen && periodeInfo) {
    const SVG_LOCK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
    const tglSelesai = periodeInfo.tanggal_selesai_verif
      ? new Date(new Date(periodeInfo.tanggal_selesai_verif).getTime() + 8*3600000)
          .toISOString().slice(0,10)
          .split('-').reverse().join('/')
      : '-';
    const jamSelesai = periodeInfo.jam_selesai_verif || '17:00';
    periodeClosedBanner.innerHTML = `
      <div style="background:#fff7ed;border:1.5px solid #fed7aa;border-radius:10px;padding:12px 16px;margin-bottom:14px;display:flex;align-items:flex-start;gap:10px">
        <span style="color:#ea580c;flex-shrink:0;margin-top:1px;display:flex">${SVG_LOCK}</span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;color:#ea580c;font-size:13px;margin-bottom:3px">Periode Verifikasi Sudah Ditutup</div>
          <div style="font-size:12px;color:#7c2d12;line-height:1.5">
            Periode verifikasi telah berakhir pada <b>${tglSelesai} <span style="letter-spacing:0.03em">${jamSelesai}</span> WITA</b>.<br>
            Hubungi <b>Admin</b> untuk memperpanjang periode verifikasi.
          </div>
        </div>
      </div>`;
  } else {
    periodeClosedBanner.innerHTML = '';
  }
}

async function openVerifikasi(idUsulan) {
  verifCurrentUsulan = idUsulan;
  window.verifCurrentUsulan = idUsulan;
  window._verifDitolakOleh = '';
  window._verifIsPPReVerif  = false;
  document.getElementById('verifModalId').textContent = idUsulan;

  showModal('verifikasiModal');
  // Tombol global approve/reject sudah dihapus — semua verifikasi via per-indikator
  // Reset admin panel
  const adminPanelReset = document.getElementById('adminRejectPanel');
  if (adminPanelReset) adminPanelReset.style.display = 'none';
  const programPanelReset = document.getElementById('programRejectPanel');
  if (programPanelReset) programPanelReset.style.display = 'none';
  document.getElementById('verifIndikatorBody').innerHTML = `<tr><td colspan="7"><div class="empty-state" style="padding:20px"><div style="display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;position:relative"><div style="width:8px;height:8px;border-radius:50%;background:#378ADD"></div><div style="position:absolute;width:7px;height:7px;border-radius:50%;background:#B5D4F4;animation:orbit-dot 1s linear infinite;transform-origin:center"></div></div><p>Memuat...</p></div></td></tr>`;

  // ===== CEK TANDA TANGAN =====
  let _ttOk = true;
  const _role = currentUser.role;
  if (_role === 'Kepala Puskesmas' || _role === 'Pengelola Program') {
    const tt = currentUser.tandaTangan;
    if (!tt || tt === 'null' || tt === '') _ttOk = false;
  } else if (_role === 'Admin') {
    try {
      const pjRes = await fetch('/api/pejabat');
      const pjData = await pjRes.json();
      const pjList = pjData.success ? pjData.data : [];
      const kasubag = pjList.find(p => p.jabatan === 'Kepala Sub Bagian Perencanaan');
      if (!kasubag?.tanda_tangan) _ttOk = false;
    } catch(e) { _ttOk = false; }
  }

  // Update banner & tombol sesuai status tanda tangan
  _updateVerifTTBanner(_ttOk, _role);

  try {
    const [detail, inds] = await Promise.all([
      API.getDetailUsulan(idUsulan),
      API.getIndikatorUsulan(idUsulan)
    ]);
    const periodeList = await API.getPeriode(detail.tahun).catch(() => []);
    // Cek apakah periode verifikasi untuk usulan ini masih aktif
    const _periodeForUsulan = (periodeList || []).find(p => p.tahun == detail.tahun && p.bulan == detail.bulan);
    const _nowWita = new Date(Date.now() + 8 * 3600000);
    const _todayStr = _nowWita.toISOString().slice(0, 10);
    const _nowTime  = _nowWita.toISOString().slice(11, 16);
    const _toDs = (v) => { if (!v) return ''; const d = new Date(new Date(v).getTime() + 8*3600000); return d.toISOString().slice(0,10); };
    let _periodeVerifOpen = true; // default: boleh verif (jika tidak ada data periode, jangan blokir)
    let _periodeVerifInfo = null;
    const _role2 = currentUser.role;
    // Hanya cek periode untuk role verifikator (bukan Operator)
    if (_periodeForUsulan && ['Kepala Puskesmas','Pengelola Program','Admin'].includes(_role2)) {
      const tmv = _periodeForUsulan.tanggalMulaiVerif || _periodeForUsulan.tanggal_mulai_verif;
      const tsv = _periodeForUsulan.tanggalSelesaiVerif || _periodeForUsulan.tanggal_selesai_verif;
      const jmv = _periodeForUsulan.jamMulaiVerif || _periodeForUsulan.jam_mulai_verif || '00:00';
      const jsv = _periodeForUsulan.jamSelesaiVerif || _periodeForUsulan.jam_selesai_verif || '23:59';
      if (tmv && tsv) {
        const nowDT = _todayStr + 'T' + _nowTime;
        const mulaiDT = _toDs(tmv) + 'T' + jmv;
        const selesaiDT = _toDs(tsv) + 'T' + jsv;
        _periodeVerifOpen = nowDT >= mulaiDT && nowDT <= selesaiDT;
        _periodeVerifInfo = _periodeForUsulan;
      }
    }
    _updateVerifPeriodeBanner(_periodeVerifOpen, _periodeVerifInfo);

    document.getElementById('verifDetailGrid').innerHTML = renderHeaderInfo(detail);

    // Filter inds for program role
    let displayInds = inds;
    let _isPPFiltered = false;
    let _isPPReVerif = false;
    if (currentUser.role === 'Pengelola Program') {
      const myAkses = currentUser.indikatorAkses || [];

      // Kumpulkan semua penolakan aktif yang relevan untuk PP ini:
      // 1. Penolakan dari PP sendiri (dibuat_oleh='PP') — siklus PP tolak
      // 2. Penolakan dari Admin (dibuat_oleh='Admin') — hanya baris dengan email_program milik PP ini
      // 3. Penolakan tanpa dibuat_oleh (data lama) yang bukan dari Kapus
      const myEmail = (currentUser.email || '').toLowerCase();
      const penolakanAktif = (detail.penolakanIndikator || []).filter(p => {
        // Abaikan baris yang sudah direspons oleh PP ini — berarti sudah selesai
        if (p.responded_at) return false;
        const dibuat = p.dibuat_oleh || '';
        const aksi = p.aksi || '';
        const aksiOk = !aksi || aksi === 'tolak' || aksi === 'sanggah' || aksi === 'reset'
          || aksi === 'kapus-ok' || aksi === 'kapus-setuju';
        if (!aksiOk) return false;
        // Penolakan dari Admin: hanya tampilkan baris yang email_program-nya milik PP ini
        if (dibuat === 'Admin') return (p.email_program || '').toLowerCase() === myEmail;
        // Penolakan dari PP atau data lama (bukan dari Kapus)
        return dibuat === 'PP' || (!p.dari_kapus && !dibuat);
      });

      const penolakanNosSaya = myAkses.length > 0
        ? penolakanAktif.filter(p => myAkses.includes(parseInt(p.no_indikator || p.noIndikator))).map(p => parseInt(p.no_indikator || p.noIndikator))
        : penolakanAktif.map(p => parseInt(p.no_indikator || p.noIndikator));

      if (penolakanNosSaya.length > 0) {
        displayInds = inds.filter(i => penolakanNosSaya.includes(parseInt(i.no)));
        _isPPFiltered = true;
        _isPPReVerif = true;
      } else if (myAkses.length > 0) {
        // Verifikasi pertama: filter berdasarkan indikator_akses saja
        displayInds = inds.filter(i => myAkses.includes(parseInt(i.no)));
        _isPPFiltered = true;
      }
    }

    // Simpan state ke window agar submitIndVerifikasi bisa baca
    window._verifDitolakOleh  = detail.ditolakOleh || '';
    window._verifKonteksPenolakan = detail.konteksPenolakan || '';
    window._verifIsPPReVerif  = _isPPReVerif;
    window._verifIsKapusReVerif = false; // akan di-set ulang di blok Kapus di bawah
    window._verifIsAdminReVerif = false; // akan di-set ulang di blok Admin di bawah

    // Banner info PP
    const _ppBanner = document.getElementById('verifReVerifBanner');
    if (_ppBanner && currentUser.role === 'Pengelola Program') {
      if (_isPPReVerif) {

const _jumlahKapusOk = displayInds.filter(ind => {
  const p = (detail.penolakanIndikator || []).find(
    p => parseInt(p.no_indikator || p.noIndikator) === parseInt(ind.no)
       && (p.aksi === 'kapus-ok' || p.aksi === 'kapus-setuju')
  );
  return !!p;
}).length;
const _keteranganExtra = _jumlahKapusOk > 0
  ? ` (<b>${_jumlahKapusOk} indikator</b> sudah disetujui Kepala Puskesmas, menunggu konfirmasi Anda)`
  : '';
_ppBanner.innerHTML = `<span class="material-icons" style="color:#f59e0b;font-size:16px;flex-shrink:0">warning</span>
  <span style="font-size:12.5px;color:#92400e"><b>Verifikasi Ulang</b> — Hanya menampilkan <b>${displayInds.length} indikator</b> yang sebelumnya bermasalah dan perlu diverifikasi ulang.${_keteranganExtra}</span>`;
        _ppBanner.style.display = 'flex';
        // ppCatatanWrap: set mode reVerif dan sembunyikan dulu
        // akan muncul dinamis lewat setIndVerif() saat PP memilih 'setuju' (menyanggah Admin)
        const _ppCatatanWrap = document.getElementById('ppCatatanWrap');
        if (_ppCatatanWrap) {
          if (detail.ditolakOleh === 'Admin') {
            _ppCatatanWrap.dataset.mode = 'reVerif'; // tandai agar setIndVerif tahu
            _ppCatatanWrap.style.display = 'none';   // tersembunyi dulu, muncul saat ada yg setuju
          } else {
            _ppCatatanWrap.dataset.mode = '';
            _ppCatatanWrap.style.display = 'none';
          }
        }
        // Tampilkan alasan penolakan per indikator dari Admin
        // Sumber utama: detail.adminCatatan (format "#1: alasan | #2: alasan | #3: alasan")
        // — paling reliable karena langsung dari keputusan Admin, tidak bergantung pada
        //   penolakan_indikator yang bisa ter-filter/exclude oleh query backend.
        // Fallback: penolakanIndikator jika adminCatatan kosong.
        if (detail.ditolakOleh === 'Admin') {
          const alasanMap = {};
          // Parse dari adminCatatan
          const adminCatatanStr = detail.adminCatatan || '';
          if (adminCatatanStr) {
            adminCatatanStr.split('|').forEach(part => {
              const m = part.trim().match(/^#(\d+):\s*(.*)/);
              if (m) alasanMap[parseInt(m[1])] = m[2].trim() || '-';
            });
          }
          // Fallback: dari penolakanIndikator jika adminCatatan tidak lengkap
          if (!Object.keys(alasanMap).length) {
            (detail.penolakanIndikator || [])
              .filter(p => p.dibuat_oleh === 'Admin' && (!p.aksi || p.aksi === 'tolak' || p.aksi === 'reset'))
              .forEach(p => {
                const no = parseInt(p.noIndikator || p.no_indikator);
                if (!alasanMap[no]) alasanMap[no] = p.alasan || '-';
              });
          }
          const alasanDariAdmin = Object.keys(alasanMap)
            .map(Number).sort((a, b) => a - b)
            .map(no => ({ no, alasan: alasanMap[no] }));
          renderPenolakanBanner('verifPenolakanBanner', 'Admin', alasanDariAdmin);
        } else {
          // Re-verif dari Kapus — tampilkan catatan Kapus jika ada
          const _kapusCatatan = detail.kapusCatatan || '';
          const _vpb = document.getElementById('verifPenolakanBanner');
          if (_vpb) {
            if (_kapusCatatan) {
              _vpb.innerHTML = '<div style="background:#fef2f2;border:1.5px solid #fca5a5;border-radius:8px;padding:12px 14px">'
                + '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">'
                + '<span class="material-icons" style="font-size:16px;color:#dc2626">cancel</span>'
                + '<span style="font-size:12.5px;font-weight:700;color:#991b1b">Catatan dari Kepala Puskesmas</span>'
                + '</div>'
                + '<div style="font-size:12px;color:#7f1d1d;line-height:1.6">' + _kapusCatatan + '</div>'
                + '</div>';
              _vpb.style.display = 'block';
            } else {
              _vpb.style.display = 'none'; _vpb.innerHTML = '';
            }
          }
        }
      } else if (_isPPFiltered) {
        _ppBanner.innerHTML = `<span class="material-icons" style="color:#0891b2;font-size:16px;flex-shrink:0">info</span>
          <span style="font-size:12.5px;color:#0c4a6e">Menampilkan <b>${displayInds.length} indikator</b> yang menjadi tanggung jawab Anda (dari total ${inds.length} indikator).</span>`;
        _ppBanner.style.display = 'flex';
        const _ppCatatanWrap2 = document.getElementById('ppCatatanWrap');
        if (_ppCatatanWrap2) { _ppCatatanWrap2.dataset.mode = ''; _ppCatatanWrap2.style.display = 'none'; }
        const _vpb = document.getElementById('verifPenolakanBanner');
        if (_vpb) { _vpb.style.display = 'none'; _vpb.innerHTML = ''; }
      } else {
        _ppBanner.innerHTML = `<span class="material-icons" style="color:#0891b2;font-size:16px;flex-shrink:0">info</span>
          <span style="font-size:12.5px;color:#0c4a6e">Menampilkan semua <b>${inds.length} indikator</b>.</span>`;
        _ppBanner.style.display = 'flex';
        const _ppCatatanWrap3 = document.getElementById('ppCatatanWrap');
        if (_ppCatatanWrap3) { _ppCatatanWrap3.dataset.mode = ''; _ppCatatanWrap3.style.display = 'none'; }
        const _vpb = document.getElementById('verifPenolakanBanner');
        if (_vpb) { _vpb.style.display = 'none'; _vpb.innerHTML = ''; }
      }
    }

    // Filter untuk Kapus saat re-verifikasi — hanya tampilkan indikator yang pernah ditolak & diperbaiki
    // (ada di penolakan_indikator = yang dikembalikan ke Operator sebelumnya)
    let _isKapusReVerif = false;
    if (currentUser.role === 'Kepala Puskesmas') {
      const penolakanList = detail.penolakanIndikator || [];
      // Re-verifikasi hanya jika ada penolakan AKTIF (ditolak_oleh tidak null)
      // Mencegah data penolakan lama dari siklus sebelumnya mempengaruhi tampilan
      const adaPenolakanAktif = penolakanList.length > 0 && !!detail.ditolakOleh;
      // Tambah: status 'Menunggu Re-verifikasi Kepala Puskesmas' = selalu re-verif Admin
      const isReVerifAdminKapus = detail.statusGlobal === 'Menunggu Re-verifikasi Kepala Puskesmas';
      if (adaPenolakanAktif || isReVerifAdminKapus) {
        const bermasalahNos = penolakanList.filter(p => !p.aksi || p.aksi === 'tolak' || p.aksi === 'sanggah').map(p => parseInt(p.noIndikator || p.no_indikator));
        displayInds = inds.filter(i => bermasalahNos.includes(parseInt(i.no)));
        _isKapusReVerif = true;
        window._verifIsKapusReVerif = true;
      }
      // Jika penolakanList kosong = verifikasi pertama kali → tampilkan semua
      // Banner info re-verifikasi Kapus (gunakan elemen yang sama dengan PP banner)
      const _reVerifBanner = document.getElementById('verifReVerifBanner');
      // _isPPLoop dideklarasikan di luar if(_reVerifBanner) agar accessible untuk kapusCatatanWrap
      const _isPPLoop = _isKapusReVerif && (detail.ditolakOleh === 'Pengelola Program');
      const _isAdminLoop = isReVerifAdminKapus || (detail.ditolakOleh === 'Admin' || detail.konteksPenolakan === 'Admin');
      if (_reVerifBanner) {
        if (_isKapusReVerif) {
          const _opCatatan = !_isPPLoop && !_isAdminLoop ? (detail.operatorCatatan || '') : '';
          if (_isAdminLoop) {
            // Kapus dikonfirmasi setelah PP selesai re-verif penolakan Admin
            // Tampilkan catatan/sanggahan PP yang sudah direspond
            _reVerifBanner.innerHTML = `<div style="width:100%">
              <div style="display:flex;align-items:center;gap:6px">
                <span class="material-icons" style="color:#f59e0b;font-size:16px;flex-shrink:0">warning</span>
                <span style="font-size:12.5px;color:#92400e"><b>Konfirmasi Re-verifikasi</b> — Pengelola Program telah merespons penolakan Admin. Tinjau dan konfirmasi <b>${displayInds.length} indikator</b> ini. Keputusan Anda akan diteruskan ke Admin.</span>
              </div>
            </div>`;
            _reVerifBanner.style.display = 'flex';
            // Tampilkan alasan penolakan dari Admin
            const alasanAdmin = (detail.penolakanIndikator || [])
              .filter(p => !p.aksi || p.aksi === 'tolak')
              .map(p => ({ no: parseInt(p.noIndikator || p.no_indikator), alasan: p.alasan || '-' }));
            renderPenolakanBanner('verifPenolakanBanner', 'Admin', alasanAdmin);
            // kapusCatatanWrap: muncul hanya saat Kapus klik Setuju (mode reVerif)
            const _kapusCatatanWrap = document.getElementById('kapusCatatanWrap');
            if (_kapusCatatanWrap) {
              _kapusCatatanWrap.dataset.mode = 'reVerif';
              _kapusCatatanWrap.style.display = 'none';
            }
          } else if (_isPPLoop) {
            // Loop PP→Kapus: PP tolak, dikembalikan ke Kapus untuk re-verifikasi
            _reVerifBanner.innerHTML = `<div style="width:100%">
              <div style="display:flex;align-items:center;gap:6px">
                <span class="material-icons" style="color:#f59e0b;font-size:16px;flex-shrink:0">warning</span>
                <span style="font-size:12.5px;color:#92400e"><b>Verifikasi Ulang</b> — Hanya menampilkan <b>${displayInds.length} indikator</b> yang ditolak oleh Pengelola Program. Silakan periksa alasan di bawah.</span>
              </div>
            </div>`;
            _reVerifBanner.style.display = 'flex';
            // Tampilkan alasan penolakan per indikator dari PP
            const alasanDariPP = (detail.penolakanIndikator || [])
              .filter(p => !p.aksi || p.aksi === 'tolak' || p.aksi === 'reset' || p.aksi === 'sanggah')
              .map(p => ({ no: parseInt(p.noIndikator || p.no_indikator), alasan: p.alasan || '-' }));
            renderPenolakanBanner('verifPenolakanBanner', 'Pengelola Program', alasanDariPP);
          } else {
            // Loop Operator↔Kapus: tampilkan catatan sanggahan dari Operator jika ada
            // Sembunyikan banner alasan PP (tidak relevan di loop ini)
            const _vpb = document.getElementById('verifPenolakanBanner');
            if (_vpb) { _vpb.style.display = 'none'; _vpb.innerHTML = ''; }
            if (_opCatatan) {
              _reVerifBanner.innerHTML = `<div style="width:100%">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
                  <span class="material-icons" style="color:#f59e0b;font-size:16px;flex-shrink:0">warning</span>
                  <span style="font-size:12.5px;color:#92400e"><b>Re-submit dari Operator</b> — Hanya menampilkan <b>${displayInds.length} indikator</b> yang sebelumnya Anda tolak.</span>
                </div>
                <div style="background:#fef9c3;border:1.5px solid #fde047;border-radius:7px;padding:8px 12px">
                  <div style="display:flex;align-items:center;gap:5px;margin-bottom:4px">
                    <span class="material-icons" style="font-size:14px;color:#ca8a04">comment</span>
                    <span style="font-size:11.5px;font-weight:700;color:#854d0e">Catatan / Sanggahan dari Operator:</span>
                  </div>
                  <div style="font-size:12px;color:#78350f;line-height:1.5">${_opCatatan}</div>
                </div>
              </div>`;
              _reVerifBanner.style.display = 'flex';
            } else {
              _reVerifBanner.innerHTML = `<div style="display:flex;align-items:center;gap:6px">
                <span class="material-icons" style="color:#f59e0b;font-size:16px;flex-shrink:0">warning</span>
                <span style="font-size:12.5px;color:#92400e"><b>Re-submit dari Operator</b> — Hanya menampilkan <b>${displayInds.length} indikator</b> yang sebelumnya Anda tolak.</span>
              </div>`;
              _reVerifBanner.style.display = 'flex';
            }
          }
          // kapusCatatanWrap: aktif saat loop PP↔Kapus (menyanggah PP) atau saat re-verif Admin
          const _kapusCatatanWrap = document.getElementById('kapusCatatanWrap');
          if (_kapusCatatanWrap && !_isAdminLoop) {
            const _needsCatatan = _isKapusReVerif && _isPPLoop;
            _kapusCatatanWrap.dataset.mode = _needsCatatan ? 'reVerif' : '';
            _kapusCatatanWrap.style.display = 'none'; // selalu hidden, muncul via setIndVerif saat klik Setuju
          }
        } else {
          _reVerifBanner.style.display = 'none';
          const _kapusCatatanWrap = document.getElementById('kapusCatatanWrap');
          if (_kapusCatatanWrap) { _kapusCatatanWrap.dataset.mode = ''; _kapusCatatanWrap.style.display = 'none'; }
          const _vpb2 = document.getElementById('verifPenolakanBanner');
          if (_vpb2) { _vpb2.style.display = 'none'; _vpb2.innerHTML = ''; }
        }
      }
    }

    // Filter untuk Admin saat re-verifikasi (loop Admin↔PP)
    // Hanya tampilkan indikator yang bermasalah — sama seperti PP dan Kapus
    let _isAdminReVerif = false;
    let _bermasalahNos = [];
    if (currentUser.role === 'Admin') {
      const penolakanList = detail.penolakanIndikator || [];
      // BUG FIX 8: cek konteks_penolakan='Admin' ATAU ditolakOleh='Admin' (setelah Fix 2, ditolakOleh di-null tapi konteks diset)
      const isAdminLoop = detail.ditolakOleh === 'Admin' || detail.konteksPenolakan === 'Admin';
      if (isAdminLoop) {
        _isAdminReVerif = true;
        window._verifIsAdminReVerif = true;

        // SUMBER 1 (UTAMA): adminCatatan — paling akurat karena Admin sendiri yang
        // mengisi ini saat menolak, dan isinya persis indikator yang ditolak putaran ini.
        // Setelah PP respond, baris penolakan_indikator Admin sudah dihapus dari DB,
        // sehingga penolakanList tidak bisa diandalkan. adminCatatan tidak berubah.
        if (detail.adminCatatan) {
          const _seenAC = new Set();
          (detail.adminCatatan || '').split('|').forEach(part => {
            const m = part.trim().match(/^#(\d+):/);
            if (m) _seenAC.add(parseInt(m[1]));
          });
          _bermasalahNos = [..._seenAC];
        }

        // SUMBER 2 (FALLBACK): penolakanIndikator — hanya terpakai jika adminCatatan kosong
        // (misal: data lama sebelum admin_catatan diisi per-putaran).
        // FIX A: deduplikasi per no_indikator — baris penolakan_indikator bisa banyak
        // (1 baris per PP) untuk no_indikator yang sama.
        if (_bermasalahNos.length === 0) {
          const _seen = new Set();
          _bermasalahNos = penolakanList
            .filter(p => {
              if (!(!p.aksi || p.aksi === 'tolak' || p.aksi === 'reset' || p.aksi === 'sanggah' || p.aksi === 'kapus-verif')) return false;
              const no = parseInt(p.noIndikator || p.no_indikator);
              if (_seen.has(no)) return false;
              _seen.add(no);
              return true;
            })
            .map(p => parseInt(p.noIndikator || p.no_indikator));
        }

        // SUMBER 3 (FALLBACK TERAKHIR): VP Menunggu — hanya jika dua sumber di atas kosong.
        // TIDAK dijadikan fallback utama karena VP dengan indikator_akses='' (akses semua)
        // akan mengembalikan SEMUA indikator, padahal Admin hanya menolak sebagian.
        if (_bermasalahNos.length === 0) {
          const vpMenunggu = (detail.verifikasiProgram || []).filter(vp => vp.status === 'Menunggu');
          const _seenVP = new Set();
          for (const vp of vpMenunggu) {
            const aksesArr = (vp.indikator_akses || '').replace(/\s/g,'').split(',').filter(Boolean);
            // Hanya pakai VP yang punya akses spesifik — skip VP dengan akses semua (indikator_akses='')
            if (aksesArr.length === 0) continue;
            for (const a of aksesArr) {
              if (a.includes('-')) {
                const [s, e] = a.split('-').map(Number);
                if (!isNaN(s) && !isNaN(e)) for (let i = s; i <= e; i++) _seenVP.add(i);
              } else {
                const n = parseInt(a);
                if (!isNaN(n) && n > 0) _seenVP.add(n);
              }
            }
          }
          _bermasalahNos = [..._seenVP];
        }
        if (_bermasalahNos.length > 0) {
          displayInds = inds.filter(i => _bermasalahNos.includes(parseInt(i.no)));
        }
      }
      const _reVerifBanner = document.getElementById('verifReVerifBanner');
      if (_reVerifBanner) {
        if (_isAdminReVerif) {
          // Kumpulkan catatan sanggahan PP dari penolakan_indikator.catatan_program
          // (PP mengisi catatan saat respond penolakan Admin)
          // Kumpulkan semua PP yang bertanggung jawab atas indikator bermasalah
          // dari verifikasiProgram (bukan hanya dari catatan_program)
          const catatanMap = {};
          (detail.penolakanIndikator || []).forEach(p => {
            if (p.catatan_program && p.email_program) {
              const key = p.email_program.toLowerCase();
              if (!catatanMap[key]) catatanMap[key] = [];
              catatanMap[key].push({ no: parseInt(p.no_indikator||p.noIndikator), catatan: p.catatan_program });
            }
          });
          // Semua PP yang aksesnya overlap dengan indikator bermasalah
          const ppTerkena = (detail.verifikasiProgram || []).filter(vp => {
            const akses = (vp.indikator_akses || '').split(',').map(s => parseInt(s.trim())).filter(Boolean);
            if (akses.length === 0) return _bermasalahNos.length > 0; // PP akses semua
            return akses.some(n => _bermasalahNos.includes(n));
          });
          const ppReVerifInfo = ppTerkena.map(vp => {
            const emailPP = vp.email_program;
            const namaPP = vp.nama_program || emailPP;
            let catatanText = '';
            // Prioritas sumber catatan:
            // 1. vp.sanggahan — catatan/sanggahan PP ke Admin (disimpan di field sanggahan)
            // 2. catatanMap dari penolakan_indikator.catatan_program (fallback legacy)
            if (vp.sanggahan && vp.sanggahan.trim()) {
              catatanText = vp.sanggahan;
            } else {
              const items = catatanMap[emailPP?.toLowerCase()] || catatanMap[emailPP] || [];
              catatanText = items.map(it => `Ind.${it.no}: ${it.catatan}`).join(' | ');
            }
            return `<div style="background:rgba(255,255,255,0.7);border:1px solid #fde68a;border-radius:6px;padding:6px 8px">
              <div style="font-size:11px;font-weight:700;color:#78350f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${namaPP}</div>
              <div style="font-size:10.5px;color:#92400e;margin-top:2px;line-height:1.4">${catatanText || '<span style="font-style:italic;color:#b45309">Belum ada catatan</span>'}</div>
            </div>`;
          }).join('');
          _reVerifBanner.innerHTML = `<div style="width:100%">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:${ppReVerifInfo ? '8px' : '0'}">
              <span class="material-icons" style="color:#f59e0b;font-size:16px;flex-shrink:0">warning</span>
              <span style="font-size:12.5px;color:#92400e"><b>Re-verifikasi</b> — Hanya menampilkan <b>${displayInds.length} indikator</b> yang sebelumnya bermasalah dan sudah diverifikasi ulang oleh Pengelola Program.</span>
            </div>
            ${ppReVerifInfo ? `<div style="border-top:1px solid #fde68a;padding-top:6px">
              <div style="font-size:10px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px">Catatan Pengelola Program:</div>
              <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:6px">${ppReVerifInfo}</div>
            </div>` : ''}
          </div>`;
          _reVerifBanner.style.display = 'flex';
        } else {
          _reVerifBanner.style.display = 'none';
        }
      }
    }

    // Untuk Admin: isi panel pilih indikator bermasalah
    const adminPanel = document.getElementById('adminRejectPanel');
    const adminList = document.getElementById('adminRejectIndikatorList');
    if (adminPanel && adminList) {
      if (currentUser.role === 'Admin') {
        adminList.innerHTML = displayInds.map(i => `
          <div style="background:white;border:1px solid #fca5a5;border-radius:8px;padding:8px 12px">
            <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;margin:0">
              <input type="checkbox" id="rejectInd_${i.no}" value="${i.no}" style="margin-top:2px;accent-color:#dc2626;flex-shrink:0">
              <div style="flex:1;min-width:0">
                <div style="font-size:12.5px;font-weight:600;color:#1e293b">${i.no}. ${i.nama}</div>
                <textarea id="rejectAlasan_${i.no}" rows="1" placeholder="Alasan penolakan indikator ini..."
                  style="width:100%;margin-top:4px;font-size:11.5px;border:1px solid #e2e8f0;border-radius:5px;padding:4px 7px;resize:vertical;display:none;box-sizing:border-box"
                  oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"></textarea>
              </div>
            </label>
          </div>`).join('');
        // Toggle textarea saat checkbox dicentang
        adminList.querySelectorAll('input[type=checkbox]').forEach(cb => {
          cb.addEventListener('change', () => {
            const ta = document.getElementById('rejectAlasan_' + cb.value);
            if (ta) ta.style.display = cb.checked ? 'block' : 'none';
          });
        });
        // Panel tersembunyi dulu, ditampilkan saat klik tombol Tolak
        adminPanel.style.display = 'none';
      } else {
        adminPanel.style.display = 'none';
      }
    }

    // Thread catatan riwayat untuk Kapus dan PP (saat re-verif)
    const _verifThread = document.getElementById('verifCatatanThread');
    if (_verifThread) {
      const showThread = (currentUser.role === 'Kepala Puskesmas' && _isKapusReVerif)
        || (currentUser.role === 'Pengelola Program' && _isPPReVerif)
        || (currentUser.role === 'Admin' && _isAdminReVerif);
      if (showThread) {
        renderCatatanThread('verifCatatanThread', idUsulan, currentUser.role);
      } else {
        _verifThread.style.display = 'none'; _verifThread.innerHTML = '';
      }
    }

    // Cek apakah user ini sudah verifikasi
    let sudahVerifUser = false;
    if (currentUser.role === 'Kepala Puskesmas') {
      sudahVerifUser = detail.statusKapus === 'Selesai' || detail.statusKapus === 'Ditolak';
    } else if (currentUser.role === 'Pengelola Program') {
      const myRecord = (detail.verifikasiProgram || []).find(v => v.email_program?.toLowerCase() === currentUser.email?.toLowerCase());
      // sudahVerif = true jika VP status Selesai/Ditolak DAN tidak ada lagi penolakan aktif
      // milik PP ini yang belum direspons (dibuat_oleh='Admin', responded_at NULL).
      // CATATAN: setelah PP respond, baris Admin dihapus dari DB → tidak akan muncul di
      // penolakanIndikator. Jadi cek responded_at tidak diperlukan — cukup cek ada/tidaknya baris.
      const myEmail2 = (currentUser.email || '').toLowerCase();
      const masihAdaPenolakanAktif = (detail.penolakanIndikator || []).some(p =>
        (p.email_program || '').toLowerCase() === myEmail2 &&
        (p.dibuat_oleh === 'Admin') &&
        (!p.aksi || p.aksi === 'tolak')
      );
      if (myRecord && myRecord.status === 'Menunggu') {
        sudahVerifUser = false;
      } else if (masihAdaPenolakanAktif) {
        // Masih ada penolakan Admin yang belum direspons → belum selesai
        sudahVerifUser = false;
      } else {
        sudahVerifUser = !!(myRecord && (myRecord.status === 'Selesai' || myRecord.status === 'Ditolak'));
      }
    } else if (currentUser.role === 'Admin') {
      sudahVerifUser = detail.statusGlobal === 'Selesai';
    }

    const role = currentUser.role;
    const canAct = !sudahVerifUser && _periodeVerifOpen && (
      (role === 'Kepala Puskesmas' && ['Menunggu Kepala Puskesmas', 'Menunggu Re-verifikasi Kepala Puskesmas'].includes(detail.statusGlobal)) ||
      (role === 'Pengelola Program' && ['Menunggu Pengelola Program', 'Menunggu Re-verifikasi PP', 'Ditolak Sebagian'].includes(detail.statusGlobal)) ||
      (role === 'Admin' && detail.statusGlobal === 'Menunggu Admin')
    );
    // Semua role verifikasi menggunakan sistem per-indikator
    const usePerIndikator = ['Kepala Puskesmas', 'Pengelola Program', 'Admin'].includes(role);

    // ======= THEAD =======
    const thead = document.getElementById('verifIndikatorHead');
    if (thead) {
      if (usePerIndikator && canAct && window._verifTTOk) {
        thead.innerHTML = `<tr><th>No</th><th>Indikator</th><th style="text-align:center;min-width:80px">Target Tahunan</th><th style="text-align:center">Target Bulan Ini</th><th style="text-align:center">Realisasi Bulan Ini</th><th style="text-align:center;min-width:80px">Sisa Target Tahunan</th><th style="text-align:center">Capaian</th><th style="text-align:center">Data Dukung</th><th style="text-align:center;min-width:170px">Verifikasi</th></tr>`;
      } else {
        thead.innerHTML = `<tr><th>No</th><th>Indikator</th><th style="text-align:center!important;min-width:80px">Target Tahunan</th><th style="text-align:center!important">Target Bulan Ini</th><th style="text-align:center!important">Realisasi Bulan Ini</th><th style="text-align:center!important;min-width:80px">Sisa Target Tahunan</th><th style="text-align:center!important">Capaian</th><th style="text-align:center!important">Data Dukung</th></tr>`;
      }
    }

    // ======= TBODY =======
    document.getElementById('verifIndikatorBody').innerHTML = displayInds.map(i => {
      let buktiHtml = '-';
      if (i.linkFile) {
        try {
          const lsParsed = JSON.parse(i.linkFile);
          const arrLinks = Array.isArray(lsParsed)
            ? lsParsed.map(f => typeof f === 'string' ? {id:null,url:f,name:'File'} : f)
            : [{id:null,url:i.linkFile,name:'File'}];
          window[`_buktiLinks_${i.no}`] = { links: arrLinks, idUsulan: i.idUsulan || '' };
          buktiHtml = `<button onclick="openBuktiModal(${i.no},0)" style="background:none;border:none;cursor:pointer;color:#0d9488;display:inline-flex;align-items:center;gap:3px;font-size:12px;padding:2px 6px;border-radius:5px" onmouseover="this.style.background='rgba(13,148,136,0.08)'" onmouseout="this.style.background='none'"><span class="material-icons" style="font-size:14px">visibility</span></button>`;
        } catch {
          buktiHtml = `<button onclick="window.open('${i.linkFile}','_blank')" style="background:none;border:none;cursor:pointer;color:#0d9488;padding:2px 6px;border-radius:5px"><span class="material-icons" style="font-size:14px">visibility</span></button>`;
        }
      }

      // Kolom verifikasi per indikator — berlaku untuk Kapus, PP, Admin
      let verifCol = '';
      if (usePerIndikator && canAct && window._verifTTOk) {
        // Mode re-verifikasi: label berubah sesuai konteks
        // "Sanggah/Terima" HANYA saat menyanggah penolakan pihak lain:
        //   - Kapus re-verif karena PP tolak (loop PP→Kapus)
        //   - PP respond penolakan Admin atau penolakan Kapus
        // "Setuju/Tolak" untuk kasus lain:
        //   - Kapus re-verif setelah Operator ajukan ulang (loop Kapus↔Operator)
        //   - Admin re-verif setelah PP sanggah
        const _isKapusPPLoop   = window._verifIsKapusReVerif && window._verifDitolakOleh === 'Pengelola Program';
        const _isKapusAdminLoop = window._verifIsKapusReVerif && (window._verifDitolakOleh === 'Admin' || window._verifKonteksPenolakan === 'Admin');
        const _isPPRespondMode = window._verifIsPPReVerif; // PP selalu respond penolakan pihak lain
        const _isSanggahMode   = _isKapusPPLoop || _isPPRespondMode; // Kapus Admin loop TIDAK sanggah mode
        const _isReVerifMode   = window._verifIsPPReVerif || window._verifIsKapusReVerif || window._verifIsAdminReVerif;

        // Mode sanggah: 'Sanggah' = data sudah benar | 'Perbaiki' = membenarkan penolakan
        const _lblApprove = _isSanggahMode ? 'Sanggah' : 'Setuju';
        const _lblReject  = _isSanggahMode ? 'Perbaiki'   : 'Tolak';

        const _placeholderAlasan = _isSanggahMode ? 'Alasan penolakan diterima (wajib)...' : 'Alasan penolakan (wajib)...';
        verifCol = `
          <td style="text-align:center;padding:6px 8px;min-width:190px">
            <div style="display:flex;flex-direction:column;align-items:center;gap:4px">
              <div style="display:flex;gap:6px">
                <button id="pgApprove_${i.no}" onclick="setIndVerif(${i.no},'setuju')"
                  style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:6px;border:1.5px solid #16a34a;background:white;color:#16a34a;font-size:11.5px;font-weight:600;cursor:pointer;transition:all 0.15s"
                  onmouseover="if(!this.dataset.active)this.style.background='#f0fdf4'" onmouseout="if(!this.dataset.active)this.style.background='white'">
                  <span class="material-icons" style="font-size:14px">check_circle</span> ${_lblApprove}
                </button>
                <button id="pgReject_${i.no}" onclick="setIndVerif(${i.no},'tolak')"
                  style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:6px;border:1.5px solid #dc2626;background:white;color:#dc2626;font-size:11.5px;font-weight:600;cursor:pointer;transition:all 0.15s"
                  onmouseover="if(!this.dataset.active)this.style.background='#fef2f2'" onmouseout="if(!this.dataset.active)this.style.background='white'">
                  <span class="material-icons" style="font-size:14px">cancel</span> ${_lblReject}
                </button>
              </div>

              <div id="pgAlasanWrap_${i.no}" style="display:none;width:100%">
                <input type="text" id="pgAlasan_${i.no}" placeholder="${_placeholderAlasan}"
                  style="width:100%;font-size:11px;border:1px solid #fca5a5;border-radius:5px;padding:4px 7px;box-sizing:border-box;margin-top:2px">
              </div>
            </div>
          </td>`;
      }

      // Catatan setuju per indikator (muncul saat read-only / sudah verif)
      const catatanInd = (!canAct && i.catatan && i.status !== 'Draft')
        ? `<div style="font-size:10.5px;color:#065f46;margin-top:3px;font-style:italic;background:#f0fdf4;border-radius:4px;padding:2px 6px">"${i.catatan}"</div>` : '';

      const _sisaV = INDIKATOR_TARGET_KUNCI.includes(i.no)
        ? (i.sasaranTahunan > 0 ? i.sasaranTahunan : null)
        : (i.sasaranTahunan > 0 ? Math.max(0, i.sasaranTahunan - i.realisasiKumulatif) : null);
      const _scV = _sisaV !== null && _sisaV === 0 ? '#16a34a' : (_sisaV !== null && _sisaV < 10 ? '#f59e0b' : '#1e293b');
      return `<tr id="pgRow_${i.no}">
        <td>${i.no}</td>
        <td style="font-size:13px">${i.nama}${catatanInd}</td>
        <td style="text-align:center;color:#475569">${i.sasaranTahunan > 0 ? i.sasaranTahunan : '<span style="color:#cbd5e1">-</span>'}</td>
        <td style="text-align:center">${i.target}</td><td style="text-align:center">${i.capaian}</td>
        <td style="text-align:center;font-weight:700;color:${_scV}">${_sisaV !== null ? _sisaV : '<span style="color:#cbd5e1">-</span>'}</td>
        <td style="text-align:center">${fmtCapaianPct(i.capaian, i.target)}</td>
        <td style="text-align:center">${buktiHtml}</td>
        ${verifCol}
      </tr>`;
    }).join('');

    // ======= FOOTER BUTTONS =======
    if (usePerIndikator) {
      // Sembunyikan tombol global — semua role pakai per indikator

      // Sembunyikan adminRejectPanel lama jika masih ada
      const adminPanel = document.getElementById('adminRejectPanel');
      if (adminPanel) adminPanel.style.display = 'none';

      // Tambah/update tombol Submit generik
      let btnSubmit = document.getElementById('btnSubmitVerif');
      if (!btnSubmit) {
        btnSubmit = document.createElement('button');
        btnSubmit.id = 'btnSubmitVerif';
        btnSubmit.className = 'btn btn-primary';
        const footer = document.querySelector('#verifikasiModal .modal-footer');
        if (footer) footer.insertBefore(btnSubmit, footer.querySelector('#btnDownloadVerif') || null);
      }

      if (sudahVerifUser) {
        let wasTolak = false;
        if (role === 'Pengelola Program') {
          const myRecord = (detail.verifikasiProgram || []).find(v => v.email_program?.toLowerCase() === currentUser.email?.toLowerCase());
          wasTolak = myRecord?.status === 'Ditolak';
        } else if (role === 'Kepala Puskesmas') {
          wasTolak = detail.statusKapus === 'Ditolak';
        }
        btnSubmit.innerHTML = wasTolak
          ? '<span class="material-icons">cancel</span> Sudah Ditolak (sebagian)'
          : '<span class="material-icons">check_circle</span> Sudah Diverifikasi';
        btnSubmit.style.background  = wasTolak ? '#dc2626' : '#16a34a';
        btnSubmit.style.borderColor = wasTolak ? '#dc2626' : '#16a34a';
        btnSubmit.disabled = true; btnSubmit.style.opacity = '';
      } else if (!window._verifTTOk) {
        btnSubmit.innerHTML = '<span class="material-icons">send</span> Submit Verifikasi';
        btnSubmit.style.background = ''; btnSubmit.style.borderColor = '';
        btnSubmit.disabled = true; btnSubmit.style.opacity = '0.35';
        btnSubmit.title = 'Upload tanda tangan terlebih dahulu';
      } else if (!_periodeVerifOpen) {
        btnSubmit.innerHTML = '<span class="material-icons">lock</span> Periode Verifikasi Ditutup';
        btnSubmit.style.background = '#ea580c'; btnSubmit.style.borderColor = '#ea580c';
        btnSubmit.disabled = true; btnSubmit.style.opacity = '0.6';
        btnSubmit.title = 'Periode verifikasi sudah ditutup. Hubungi Admin untuk memperpanjang.';
      } else if (!canAct) {
        btnSubmit.innerHTML = '<span class="material-icons">send</span> Submit Verifikasi';
        btnSubmit.style.background = ''; btnSubmit.style.borderColor = '';
        btnSubmit.disabled = true; btnSubmit.style.opacity = '0.35';
      } else {
        const _isReVerif = _isPPReVerif || _isKapusReVerif || _isAdminReVerif;
        btnSubmit.innerHTML = _isReVerif
          ? '<span class="material-icons">update</span> Submit Re-verifikasi'
          : '<span class="material-icons">send</span> Submit Verifikasi';
        btnSubmit.style.background = _isReVerif ? '#0891b2' : '';
        btnSubmit.style.borderColor = _isReVerif ? '#0891b2' : '';
        btnSubmit.disabled = false; btnSubmit.style.opacity = '';
        btnSubmit.onclick = () => submitIndVerifikasi(verifCurrentUsulan, displayInds, role);
      }
    } else {
      // Role lain (Operator lihat saja) — tombol global tidak aktif

      const old = document.getElementById('btnSubmitVerif');
      if (old) old.remove();
    }
  } catch (e) { if (!window._verifSilentReload) toast(e.message, 'error'); }
}

// ======= Toggle keputusan per indikator (Kapus / PP / Admin) =======
function setIndVerif(no, aksi) {
  const btnSetuju       = document.getElementById(`pgApprove_${no}`);
  const btnTolak        = document.getElementById(`pgReject_${no}`);
  const alasanWrap      = document.getElementById(`pgAlasanWrap_${no}`);
  const row             = document.getElementById(`pgRow_${no}`);

  // Reset semua
  if (btnSetuju) { btnSetuju.dataset.active = ''; btnSetuju.style.background = 'white'; btnSetuju.style.color = '#16a34a'; btnSetuju.style.borderColor = '#16a34a'; }
  if (btnTolak)  { btnTolak.dataset.active  = ''; btnTolak.style.background  = 'white'; btnTolak.style.color  = '#dc2626'; btnTolak.style.borderColor  = '#dc2626'; }
  if (alasanWrap) alasanWrap.style.display = 'none';
  if (row) row.style.background = '';

  if (aksi === 'setuju') {
    if (btnSetuju) { btnSetuju.dataset.active = '1'; btnSetuju.style.background = '#16a34a'; btnSetuju.style.color = 'white'; }
    if (row) row.style.background = '#f0fdf4';
  } else {
    if (btnTolak) { btnTolak.dataset.active = '1'; btnTolak.style.background = '#dc2626'; btnTolak.style.color = 'white'; }
    if (alasanWrap) alasanWrap.style.display = 'block';
    if (row) row.style.background = '#fef2f2';
    setTimeout(() => document.getElementById(`pgAlasan_${no}`)?.focus(), 50);
  }

  // Dinamis show/hide catatanWrap untuk Kapus dan PP
  // Sanggah (setuju di internal) = menyanggah penolakan → wajib isi catatan
  // Terima (tolak di internal)   = membenarkan penolakan → tidak perlu catatan (alasan per indikator sudah cukup)
  const _allApprove = document.querySelectorAll('[id^="pgApprove_"]');
  const _adaSetuju  = Array.from(_allApprove).some(btn => btn.dataset.active === '1');

  const _kapusCatatanWrap = document.getElementById('kapusCatatanWrap');
  if (_kapusCatatanWrap && _kapusCatatanWrap.dataset.mode === 'reVerif') {
    _kapusCatatanWrap.style.display = _adaSetuju ? 'block' : 'none';
  }

  const _ppCatatanWrap = document.getElementById('ppCatatanWrap');
  if (_ppCatatanWrap && _ppCatatanWrap.dataset.mode === 'reVerif') {
    _ppCatatanWrap.style.display = _adaSetuju ? 'block' : 'none';
  }
}

// ======= Submit verifikasi per indikator — generik untuk Kapus, PP, Admin =======
async function submitIndVerifikasi(idUsulan, displayInds, role) {
  const indikatorList = [];
  const _isReVerifMode = window._verifIsPPReVerif || window._verifIsKapusReVerif || window._verifIsAdminReVerif;
  const _isKapusPPLoop2   = window._verifIsKapusReVerif && window._verifDitolakOleh === 'Pengelola Program';
  // Kapus di re-verif Admin: tombol Setuju/Tolak biasa (bukan Sanggah/Terima)
  const _isKapusAdminLoop2 = window._verifIsKapusReVerif && (window._verifDitolakOleh === 'Admin' || window._verifKonteksPenolakan === 'Admin');
  const _isPPRespondMode2 = window._verifIsPPReVerif;
  const _isSanggahMode2   = _isKapusPPLoop2 || _isPPRespondMode2; // Kapus Admin loop TIDAK pakai sanggah mode
  for (const i of displayInds) {
    const isSetuju = document.getElementById(`pgApprove_${i.no}`)?.dataset.active === '1';
    const isTolak  = document.getElementById(`pgReject_${i.no}`)?.dataset.active  === '1';
    if (!isSetuju && !isTolak) return toast(`Tentukan keputusan untuk indikator #${i.no} — ${i.nama}`, 'warning');
    if (isTolak) {
      const alasan = document.getElementById(`pgAlasan_${i.no}`)?.value?.trim();
      if (!alasan) return toast(_isSanggahMode2 ? `Isi alasan untuk indikator #${i.no} yang diterima penolakannnya` : `Isi alasan penolakan untuk indikator #${i.no}`, 'warning');
      if (!isValidText(alasan)) return toast(_isSanggahMode2 ? `Alasan indikator #${i.no} harus mengandung teks yang bermakna` : `Alasan penolakan indikator #${i.no} harus mengandung teks yang bermakna`, 'warning');
      indikatorList.push({ noIndikator: i.no, aksi: 'tolak', alasan });
    } else {
      indikatorList.push({ noIndikator: i.no, aksi: 'setuju' });
    }
  }

  // Tentukan action dan payload berdasarkan konteks
  // PP saat respond penolakan Admin (ditolakOleh='Admin' & _isPPReVerif):
  //   → respond-penolakan dengan responList (sanggah/tolak per penolakan)
  // Semua lainnya → verif-kapus / verif-program / verif-admin
  const _isRespondPenolakan = role === 'Pengelola Program'
    && (window._verifDitolakOleh === 'Admin' || window._verifKonteksPenolakan === 'Admin')
    && window._verifIsPPReVerif === true;

  const actionMap = { 'Kepala Puskesmas': 'verif-kapus', 'Pengelola Program': 'verif-program', 'Admin': 'verif-admin' };
  const action = _isRespondPenolakan ? 'respond-penolakan' : actionMap[role];
  if (!action) return toast('Role tidak dikenali', 'error');

  const catatanKapus = role === 'Kepala Puskesmas' ? (document.getElementById('kapusCatatanInput')?.value?.trim() || '') : undefined;
  if (role === 'Kepala Puskesmas' && document.getElementById('kapusCatatanWrap')?.style.display !== 'none') {
    const _adaSetuju = indikatorList.some(i => i.aksi === 'setuju');
    if (_adaSetuju && !catatanKapus) return toast('Catatan / Tanggapan wajib diisi saat menyanggah penolakan PP', 'warning');
    if (_adaSetuju && catatanKapus && !isValidText(catatanKapus)) return toast('Catatan / Tanggapan harus mengandung teks yang bermakna', 'warning');
  }

  const catatanProgram = role === 'Pengelola Program' ? (document.getElementById('ppCatatanInput')?.value?.trim() || '') : undefined;
  if (!_isRespondPenolakan && role === 'Pengelola Program' && document.getElementById('ppCatatanWrap')?.style.display !== 'none') {
    const adaYangSetuju = indikatorList.some(i => i.aksi === 'setuju');
    if (adaYangSetuju && !catatanProgram) return toast('Catatan / Sanggahan wajib diisi saat menyanggah penolakan Admin', 'warning');
    if (adaYangSetuju && catatanProgram && !isValidText(catatanProgram)) return toast('Catatan / Sanggahan harus mengandung teks yang bermakna', 'warning');
  }

  // Untuk respond-penolakan: ubah format dari indikatorList → responList
  // Sanggah (aksi='setuju' di UI) = PP tidak setuju dengan penolakan Admin → data sudah benar
  // Terima  (aksi='tolak'  di UI) = PP membenarkan penolakan Admin → akan diperbaiki
  if (_isRespondPenolakan) {
    for (const item of indikatorList) {
      // 'setuju' di UI = 'sanggah' (PP tidak setuju Admin) → pakai catatanProgram
      // 'tolak' di UI = PP membenarkan Admin (Terima) → pakai item.alasan yang sudah divalidasi di atas
      const catatan = item.aksi === 'tolak' ? item.alasan : (catatanProgram || '');
      if (item.aksi === 'setuju' && (!catatan || !catatan.trim())) return toast(`Isi catatan sanggahan untuk indikator #${item.noIndikator}`, 'warning');
      if (item.aksi === 'setuju' && catatan && !isValidText(catatan)) return toast(`Catatan untuk indikator #${item.noIndikator} harus mengandung teks yang bermakna`, 'warning');
      // item.aksi === 'tolak' (Terima) → alasan sudah divalidasi di loop atas
    }
  }

  setLoading(true);
  try {
    let payload, result;
    if (_isRespondPenolakan) {
      // respond-penolakan: konversi indikatorList → responList
      // aksi 'setuju' (tombol Sanggah) → 'sanggah' (PP tidak setuju Admin, data sudah benar)
      // aksi 'tolak'  (tombol Terima)  → 'tolak'   (PP membenarkan Admin, akan diperbaiki)
      const responList = indikatorList.map(i => ({
        noIndikator: i.noIndikator,
        aksi: i.aksi === 'setuju' ? 'sanggah' : 'tolak',
        catatan: i.aksi === 'tolak' ? i.alasan : (catatanProgram || 'Sanggahan PP')
      }));
      payload = { idUsulan, email: currentUser.email, responList };
      result = await API.post('usulan?action=respond-penolakan', payload);
    } else {
      payload = { idUsulan, email: currentUser.email, indikatorList };
      if (catatanKapus !== undefined) payload.catatanKapus = catatanKapus;
      if (catatanProgram !== undefined) payload.catatanProgram = catatanProgram;
      result = await API.post('usulan?action=' + action, payload);
    }
    toast(result?.message || 'Verifikasi berhasil disimpan', 'success');
    setTimeout(() => {
      closeModal('verifikasiModal');
      if (currentPage === 'dashboard') renderDashboard();
      else renderVerifikasi();
    }, 800);
  } catch(e) { toast(e.message, 'error'); }
  finally { setLoading(false); }
}