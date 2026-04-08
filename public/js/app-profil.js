// ============== TOPBAR DROPDOWN ==============
function toggleTopbarDropdown() {
  const dd = document.getElementById('topbarDropdown');
  if (!dd) return;
  const isOpen = dd.classList.contains('open');
  // Tutup dulu semua, lalu toggle
  document.querySelectorAll('.topbar-dropdown.open').forEach(el => el.classList.remove('open'));
  if (!isOpen) dd.classList.add('open');
}

function closeTopbarDropdown() {
  const dd = document.getElementById('topbarDropdown');
  if (dd) dd.classList.remove('open');
}

// Tutup dropdown kalau klik di luar
document.addEventListener('click', (e) => {
  if (!e.target.closest('#topbarAvatarWrap')) {
    closeTopbarDropdown();
  }
});


// ============== EDIT PROFIL ==============
function openEditProfil() {
  // Buat modal kalau belum ada
  let modal = document.getElementById('editProfilModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'editProfilModal';
    modal.className = 'modal';
    modal.style.zIndex = '3000';
    modal.addEventListener('click', e => { if (e.target === modal) closeModal('editProfilModal'); });
    modal.innerHTML = `
      <div class="modal-card" style="max-width:420px;width:100%">
        <div class="modal-header">
          <span class="material-icons" style="color:#0d9488">account_circle</span>
          <h3>Edit Profil</h3>
          <button class="btn-icon" onclick="closeModal('editProfilModal')"><span class="material-icons">close</span></button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Nama Lengkap</label>
            <input class="form-control" id="epNama" placeholder="Nama lengkap">
          </div>
          <div class="form-group">
            <label>NIP</label>
            <input class="form-control" id="epNIP" placeholder="Nomor Induk Pegawai (opsional)" maxlength="30">
          </div>
          <div class="form-group">
            <label>Email</label>
            <input class="form-control" id="epEmail" disabled style="background:#f8fafc;color:var(--text-light)">
          </div>
          <div class="form-group">
            <label>Role</label>
            <input class="form-control" id="epRole" disabled style="background:#f8fafc;color:var(--text-light)">
          </div>
          <div id="epTTSection"></div>
          <div id="epStatus" style="font-size:12.5px;color:#ef4444;min-height:18px"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal('editProfilModal')">Batal</button>
          <button class="btn btn-primary" onclick="saveEditProfil()"><span class="material-icons">save</span>Simpan</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }
  // Inject section tanda tangan setelah modal ada — cek role saat ini
  const epTTSection = document.getElementById('epTTSection');
  if (epTTSection) {
    const rolesBolehTT = ['Kepala Puskesmas', 'Pengelola Program'];
    if (rolesBolehTT.includes(currentUser.role)) {
      epTTSection.innerHTML = `
        <div class="form-group">
          <label>Tanda Tangan <span style="font-size:11px;color:#94a3b8">(upload gambar, maks 2MB)</span></label>
          <div style="border:2px dashed #cbd5e1;border-radius:8px;padding:10px;text-align:center;cursor:pointer;position:relative" id="epTTWrap" onclick="document.getElementById('epTTInput').click()">
            <img id="epTTPreview" style="max-height:80px;max-width:100%;display:none;margin:0 auto">
            <div id="epTTPlaceholder" style="color:#94a3b8;font-size:13px;padding:8px">
              <span class="material-icons" style="font-size:28px;display:block;margin:0 auto 4px">draw</span>
              Klik untuk upload tanda tangan
            </div>
            <input type="file" id="epTTInput" accept="image/*" style="display:none" onchange="previewTandaTangan(event)">
          </div>
          <button type="button" id="epTTHapus" style="display:none;margin-top:6px;font-size:12px;color:#ef4444;background:none;border:none;cursor:pointer;padding:0" onclick="hapusTandaTangan()">
            <span class="material-icons" style="font-size:14px;vertical-align:middle">delete</span> Hapus tanda tangan
          </button>
          <div style="margin-top:8px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:8px 10px;font-size:11.5px;color:#92400e;line-height:1.6">
            <span class="material-icons" style="font-size:13px;vertical-align:middle;margin-right:3px">info</span>
            <strong>Tips tanda tangan:</strong> Gunakan foto tanda tangan dengan <b>latar putih/terang</b>.
            Gambar akan otomatis dikompresi ke ukuran optimal saat disimpan.
            Jika tanda tangan <b>tidak muncul di laporan PDF</b>, silakan <b>upload ulang</b> di halaman ini.
          </div>
        </div>`;
    } else {
      epTTSection.innerHTML = '';
    }
  }
  // Isi data user saat ini
  document.getElementById('epNama').value = currentUser.nama || '';
  document.getElementById('epNIP').value = currentUser.nip || '';
  document.getElementById('epEmail').value = currentUser.email || '';
  document.getElementById('epRole').value = currentUser.role || '';
  document.getElementById('epStatus').textContent = '';
  // Lock Nama & NIP untuk non-Admin
  const isAdmin = currentUser.role === 'Admin';
  const namaEl = document.getElementById('epNama');
  const nipEl = document.getElementById('epNIP');
  if (isAdmin) {
    namaEl.disabled = false; namaEl.style.background = ''; namaEl.style.color = '';
    nipEl.disabled = false; nipEl.style.background = ''; nipEl.style.color = '';
  } else {
    namaEl.disabled = true; namaEl.style.background = '#f8fafc'; namaEl.style.color = 'var(--text-light)';
    nipEl.disabled = true; nipEl.style.background = '#f8fafc'; nipEl.style.color = 'var(--text-light)';
  }
  // Tampilkan tanda tangan jika ada
  const ttPreview = document.getElementById('epTTPreview');
  const ttPlaceholder = document.getElementById('epTTPlaceholder');
  const ttHapus = document.getElementById('epTTHapus');
  if (currentUser.tandaTangan) {
    ttPreview.src = currentUser.tandaTangan; ttPreview.style.display = 'block';
    ttPlaceholder.style.display = 'none'; ttHapus.style.display = 'inline-block';
  } else {
    ttPreview.src = ''; ttPreview.style.display = 'none';
    ttPlaceholder.style.display = 'block'; ttHapus.style.display = 'none';
  }
  showModal('editProfilModal');
  setTimeout(() => document.getElementById('epNama').focus(), 100);
}


// ============================================================
//  HELPER: Resize gambar tanda tangan sebelum disimpan ke DB
//  Max 400x200px, output JPEG quality 0.82 → maks ~50-80KB base64
// ============================================================
function resizeImageToBase64(file, maxW, maxH, quality, callback) {
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height;
      // Hitung rasio agar proporsional
      if (w > maxW || h > maxH) {
        const ratio = Math.min(maxW / w, maxH / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      // Background putih (agar PNG transparan tidak jadi hitam saat JPEG)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const resized = canvas.toDataURL('image/jpeg', quality);
      callback(resized);
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function previewTandaTangan(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { alert('File terlalu besar, maks 2MB'); e.target.value=''; return; }
  resizeImageToBase64(file, 400, 200, 0.82, b64 => {
    document.getElementById('epTTPreview').src = b64;
    document.getElementById('epTTPreview').style.display = 'block';
    document.getElementById('epTTPlaceholder').style.display = 'none';
    document.getElementById('epTTHapus').style.display = 'inline-block';
    e.target._newTT = b64;
  });
}

function hapusTandaTangan() {
  document.getElementById('epTTPreview').src = '';
  document.getElementById('epTTPreview').style.display = 'none';
  document.getElementById('epTTPlaceholder').style.display = 'block';
  document.getElementById('epTTHapus').style.display = 'none';
  const inp = document.getElementById('epTTInput');
  inp.value = ''; inp._newTT = null;
}


async function saveEditProfil() {
  const statusEl = document.getElementById('epStatus');
  const isAdmin = currentUser.role === 'Admin';
  const nama = isAdmin ? document.getElementById('epNama').value.trim() : (currentUser.nama || '');
  const nip  = isAdmin ? document.getElementById('epNIP').value.trim()  : (currentUser.nip  || '');
  if (isAdmin && !nama) { statusEl.textContent = 'Nama tidak boleh kosong'; return; }
  setLoading(true);
  try {
    const ttInput = document.getElementById('epTTInput');
    let tandaTangan = currentUser.tandaTangan || null;
    if (ttInput && ttInput._newTT !== undefined) tandaTangan = ttInput._newTT;
    await API.updateUser({
      email: currentUser.email,
      nama,
      nip,
      role: currentUser.role,
      kodePKM: currentUser.kodePKM || '',
      // Kirim sebagai string (format "1,2,3"), bukan array, agar tidak menimpa indikatorAkses di DB
      indikatorAkses: currentUser.indikatorAksesString || (Array.isArray(currentUser.indikatorAkses) ? currentUser.indikatorAkses.join(',') : currentUser.indikatorAkses || ''),
      jabatan: currentUser.jabatan || '',
      aktif: true,
      tandaTangan
    });
    // Update state lokal
    currentUser.nama = nama;
    currentUser.nip = nip;
    if (tandaTangan !== undefined) currentUser.tandaTangan = tandaTangan;
    sessionStorage.setItem('spm_user', JSON.stringify(currentUser));
    // Update tampilan
    document.getElementById('sidebarName').textContent = nama;
    document.getElementById('sidebarAvatar').textContent = nama[0].toUpperCase();
    const _topbarAv2 = document.getElementById('topbarAvatar');
    if (_topbarAv2) _topbarAv2.textContent = nama[0].toUpperCase();
    const dropNameEl = document.getElementById('topbarDropName');
    if (dropNameEl) dropNameEl.textContent = nama;
    toast('Profil berhasil diperbarui!', 'success');
    closeModal('editProfilModal');
    // Auto-refresh tombol verifikasi jika dibuka dari modal verifikasi
    const verifModal = document.getElementById('verifikasiModal');
    const fromVerif = window._openProfilFromVerif;
    window._openProfilFromVerif = false;
    if (fromVerif || (verifModal && verifModal.classList.contains('show'))) {
      const ttOk = !!(currentUser.tandaTangan && currentUser.tandaTangan !== 'null' && currentUser.tandaTangan !== '');
      _updateVerifTTBanner(ttOk, currentUser.role);
      // Reload modal verifikasi sekali (bukan rekursif) setelah TT berhasil diupload
      if (ttOk && window.verifCurrentUsulan) {
        window._verifSilentReload = true;
        openVerifikasi(window.verifCurrentUsulan).catch(() => {}).finally(() => { window._verifSilentReload = false; });
      }
    }
  } catch(e) {
    statusEl.textContent = e.message;
  } finally { setLoading(false); }
}


function showChangePassword() {
  document.getElementById('cpOld').value = '';
  document.getElementById('cpNew').value = '';
  document.getElementById('cpConfirm').value = '';
  document.getElementById('cpStatus').textContent = '';
  showModal('changePasswordModal');
}

function closeChangePasswordModal() {
  closeModal('changePasswordModal');
}

async function doChangePassword() {
  const oldPw = document.getElementById('cpOld').value;
  const newPw = document.getElementById('cpNew').value;
  const confirmPw = document.getElementById('cpConfirm').value;
  const statusEl = document.getElementById('cpStatus');

  if (!newPw || newPw.length < 6) { statusEl.textContent = 'Password baru minimal 6 karakter'; return; }
  if (newPw !== confirmPw) { statusEl.textContent = 'Konfirmasi password tidak cocok'; return; }

  setLoading(true);
  try {
    await API.post('auth', { action: 'change-password', email: currentUser.email, oldPassword: oldPw, newPassword: newPw });
    toast('Password berhasil diubah!', 'success');
    closeChangePasswordModal();
  } catch(e) {
    statusEl.textContent = e.message;
  } finally { setLoading(false); }
}