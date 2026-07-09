// js/profil_frontend.js
// Kelola Profil Instansi — Tugas & Fungsi + Kontak/Lokasi — admin only

'use strict';

let _profilData = null;
let _quillProfil = null;

/* ── Init Quill untuk Tugas & Fungsi ─────────────────────────── */
function _initQuillProfil() {
  if (_quillProfil) return;
  _quillProfil = new Quill('#profilTugasFungsiEditor', {
    theme: 'snow',
    placeholder: 'Uraikan tugas dan fungsi sub bagian perencanaan...',
    modules: {
      toolbar: [
        [{ header: [2, 3, false] }],
        ['bold', 'italic', 'underline'],
        [{ list: 'ordered' }, { list: 'bullet' }],
        [{ indent: '-1' }, { indent: '+1' }],
        ['clean'],
      ],
    },
  });
}

/* ── Load ──────────────────────────────────────────────────────── */
async function loadProfil() {
  try {
    const r = await fetch('/api/profil', { headers: authHeaders() });
    if (!r.ok) throw new Error(await r.text());
    _profilData = await r.json();
    renderProfilForm();
  } catch (err) {
    console.error('[loadProfil]', err);
    toast('Gagal memuat profil instansi', 'error');
  }
}

function renderProfilForm() {
  if (!_profilData) return;
  _initQuillProfil();

  const d = _profilData;
  _setVal('profilVisi', d.visi || '');
  _setVal('profilAlamat', d.alamat || '');
  _setVal('profilTelepon', d.telepon || '');
  _setVal('profilEmail', d.email || '');
  _setVal('profilInstagram', d.instagram || '');
  _setVal('profilLat', d.lat ?? '');
  _setVal('profilLng', d.lng ?? '');
  _quillProfil.clipboard.dangerouslyPasteHTML(d.tugas_fungsi || '');
}

async function saveProfil() {
  const tugasFungsiHtml = _quillProfil ? _quillProfil.root.innerHTML : '';
  const tugasFungsiText = _quillProfil ? _quillProfil.getText().trim() : '';

  const latStr = _getVal('profilLat');
  const lngStr = _getVal('profilLng');

  const payload = {
    visi:         _getVal('profilVisi'),
    tugas_fungsi: tugasFungsiText ? tugasFungsiHtml : '',
    alamat:       _getVal('profilAlamat'),
    telepon:      _getVal('profilTelepon'),
    email:        _getVal('profilEmail'),
    instagram:    _getVal('profilInstagram'),
    lat:          latStr ? Number(latStr) : null,
    lng:          lngStr ? Number(lngStr) : null,
  };

  const btn = document.getElementById('btnSaveProfil');
  if (btn) btn.disabled = true;
  try {
    const r = await fetch('/api/profil', {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    if (!r.ok) { toast(data.error || 'Gagal menyimpan', 'error'); return; }
    _profilData = { ..._profilData, ...payload };
    toast('Profil instansi berhasil disimpan', 'success');
  } catch (err) {
    toast('Gagal: ' + err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* ── Helper ───────────────────────────────────────────────────── */
function _setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}
function _getVal(id) {
  return (document.getElementById(id)?.value || '').trim();
}