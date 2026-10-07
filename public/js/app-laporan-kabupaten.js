

(function () {
  'use strict';

  let _lkTahun = null;
  let _lkBulanAwal = null;
  let _lkBulanAkhir = null;
  let _lkKodePkm = '';
  let _lkNoIndikator = ''; // '' = semua indikator (tampilan total); angka = 1 indikator, semua puskesmas
  let _lkPeriodeList = null; // [{tahun, bulan}] — null = belum pernah di-fetch
  let _lkPkmList = null; // [{kode, nama}] — null = belum pernah di-fetch
  let _lkLoaded = false;

  // Dipanggil oleh _lapSetMode() saat tab "Total Kabupaten per Indikator" pertama kali dibuka
  // Hanya Admin & Pengelola Program yang punya selector Puskesmas (bisa lihat lintas puskesmas).
  // Kepala Puskesmas & Operator otomatis dikunci ke puskesmas sendiri, jadi gak perlu dropdown.
  function _lkBisaPilihPuskesmas() {
    return currentUser.role === 'Admin' || currentUser.role === 'Pengelola Program';
  }

  // Kolom/statcard "Puskesmas Lapor" cuma relevan buat role yang bisa lihat lintas puskesmas.
  // Kepala Puskesmas & Operator cuma lihat data puskesmas sendiri, jadi info ini gak berguna buat mereka.
  function _lkTampilkanKolomLapor() {
    return currentUser.role !== 'Kepala Puskesmas' && currentUser.role !== 'Operator';
  }

  window._lkLoadIfNeeded = async function () {
    if (_lkLoaded) return;
    _lkLoaded = true;
    if (!_lkBisaPilihPuskesmas()) {
      _lkKodePkm = currentUser.kodePKM || '';
    }
    if (!_lkPeriodeList) await _lkLoadPeriodeList();
    await _lkLoad();
  };

  async function _lkLoadPeriodeList() {
    try {
      _lkPeriodeList = await API.getLaporanKabupaten({ list_periode: 1 }) || [];
    } catch (e) {
      _lkPeriodeList = [];
    }
  }

  // Isi dropdown Puskesmas HANYA dengan puskesmas yang sudah punya usulan di bulan terpilih —
  // kalau puskesmas X belum lapor bulan itu, namanya gak akan muncul sbg pilihan.
  function _lkPopulatePuskesmasDropdown(list) {
    _lkPkmList = list || [];
    const sel = document.getElementById('lkPuskesmas');
    if (!sel) return;
    sel.innerHTML = '<option value="">Semua Puskesmas</option>'
      + _lkPkmList.map(p => `<option value="${p.kode}">${p.nama}</option>`).join('');
    sel.value = (_lkKodePkm && _lkPkmList.some(p => p.kode === _lkKodePkm)) ? _lkKodePkm : '';
    if (window.CustomSelect) window.CustomSelect.sync(sel);
  }

  // Isi dropdown Indikator (Admin & Pengelola Program). PP dengan akses terbatas hanya lihat indikator miliknya.
  function _lkPopulateIndikatorDropdown(data) {
    const sel = document.getElementById('lkIndikator');
    if (!sel) return;
    let list = data || [];
    const akses = currentUser.indikatorAkses;
    if (currentUser.role === 'Pengelola Program' && Array.isArray(akses) && akses.length) {
      list = list.filter(r => akses.includes(r.no));
    }
    if (_lkNoIndikator && !list.some(r => String(r.no) === String(_lkNoIndikator))) _lkNoIndikator = '';
    sel.innerHTML = '<option value="">Semua Indikator</option>'
      + list.map(r => `<option value="${r.no}">${r.no}. ${r.nama}</option>`).join('');
    sel.value = _lkNoIndikator;
    if (window.CustomSelect) window.CustomSelect.sync(sel);
    // Filter Puskesmas tidak relevan saat 1 indikator dipilih (semua puskesmas ditampilkan)
    const wrap = document.getElementById('lkPkmWrap');
    if (wrap) wrap.style.display = _lkNoIndikator ? 'none' : 'flex';
  }

  window._lkOnTahunChange = function () {
    _lkTahun = parseInt(document.getElementById('lkTahun')?.value) || null;
    _lkBulanAwal = null; // reset ke default utk tahun ini
    _lkBulanAkhir = null;
    _lkLoad();
  };

  window._lkOnBulanChange = function () {
    _lkBulanAwal = parseInt(document.getElementById('lkBulanAwal')?.value) || null;
    _lkBulanAkhir = parseInt(document.getElementById('lkBulanAkhir')?.value) || null;
    if (_lkBulanAwal && _lkBulanAkhir && _lkBulanAwal > _lkBulanAkhir) {
      _lkBulanAkhir = _lkBulanAwal;
    }
    _lkLoad();
  };

  window._lkOnIndikatorChange = function () {
    _lkNoIndikator = document.getElementById('lkIndikator')?.value || '';
    _lkLoad();
  };

  window._lkOnPuskesmasChange = function () {
    _lkKodePkm = document.getElementById('lkPuskesmas')?.value || '';
    _lkLoad();
  };

  function _populateFilters(tahunAktif, bulanAwalAktif, bulanAkhirAktif) {
    const bulanNama = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

    const tahunSel = document.getElementById('lkTahun');
    if (tahunSel) {
      const years = [...new Set((_lkPeriodeList || []).map(p => p.tahun))].sort((a, b) => b - a);
      const finalYears = years.length ? years : [tahunAktif];
      tahunSel.innerHTML = finalYears.map(y => `<option value="${y}" ${y === tahunAktif ? 'selected' : ''}>${y}</option>`).join('');
    }

    const bulanAwalSel = document.getElementById('lkBulanAwal');
    const bulanAkhirSel = document.getElementById('lkBulanAkhir');
    if (bulanAwalSel && bulanAkhirSel) {
      const bulanUntukTahun = (_lkPeriodeList || []).filter(p => p.tahun === tahunAktif).map(p => p.bulan);
      const bulanUnik = [...new Set(bulanUntukTahun)].sort((a, b) => a - b);
      const finalBulan = bulanUnik.length ? bulanUnik : [bulanAkhirAktif];
      const opts = finalBulan.map(b => `<option value="${b}">${bulanNama[b] || b}</option>`).join('');
      bulanAwalSel.innerHTML = opts;
      bulanAkhirSel.innerHTML = opts;
      bulanAwalSel.value = bulanAwalAktif;
      bulanAkhirSel.value = bulanAkhirAktif;
    }

    if (window.CustomSelect) {
      [tahunSel, bulanAwalSel, bulanAkhirSel].forEach(el => el && window.CustomSelect.sync(el));
    }
  }

  async function _lkLoad() {
    const el = document.getElementById('lkTable');
    if (el) el.innerHTML = loadingBlock('Memuat...');

    try {
      const params = {};
      if (_lkTahun) params.tahun = _lkTahun;
      if (_lkBulanAwal) params.bulanAwal = _lkBulanAwal;
      if (_lkBulanAkhir) params.bulanAkhir = _lkBulanAkhir;
      // Mode 1 indikator: tampilkan SEMUA puskesmas, jadi filter puskesmas tidak dikirim
      if (_lkNoIndikator) params.noIndikator = _lkNoIndikator;
      else if (_lkKodePkm) params.kodePkm = _lkKodePkm;

      let result = await API.getLaporanKabupaten(params);
      _lkTahun = result.tahun;
      _lkBulanAwal = result.bulanAwal;
      _lkBulanAkhir = result.bulanAkhir;

      if (_lkBisaPilihPuskesmas()) {
        // Kalau puskesmas yg lagi dipilih ternyata belum lapor di bulan terpilih (misal abis ganti
        // bulan/tahun), reset ke "Semua Puskesmas" — biar gak nyangkut nampilin "Belum Lapor".
        const pkmMasihValid = !!_lkNoIndikator || !_lkKodePkm || (result.pkmLaporList || []).some(p => p.kode === _lkKodePkm);
        if (!pkmMasihValid) {
          _lkKodePkm = '';
          result = await API.getLaporanKabupaten({ tahun: _lkTahun, bulanAwal: _lkBulanAwal, bulanAkhir: _lkBulanAkhir });
        }
        _lkPopulatePuskesmasDropdown(result.pkmLaporList);
      }

      _populateFilters(_lkTahun, _lkBulanAwal, _lkBulanAkhir);
      _lkPopulateIndikatorDropdown(result.data);
      _lkRenderTable(result);
    } catch (e) {
      if (el) el.innerHTML = '<div class="empty-state" style="padding:40px"><span class="material-icons">error_outline</span><p>' + (e.message || 'Gagal memuat data') + '</p></div>';
    }
  }

  function _persenColor(pct) {
    if (pct >= 100) return '#10b981';
    if (pct >= 75) return '#0d9488';
    if (pct >= 40) return '#f59e0b';
    return '#dc2626';
  }

  function _lkRenderTable(result) {
    const el = document.getElementById('lkTable');
    if (!el) return;

    let rows = result.data || [];

    // Pengelola Program dengan akses indikator terbatas hanya lihat indikator miliknya.
    // Admin dan PP tanpa batasan (array kosong) lihat semua.
    const akses = currentUser.indikatorAkses;
    if (currentUser.role === 'Pengelola Program' && Array.isArray(akses) && akses.length) {
      rows = rows.filter(r => akses.includes(r.no));
    }

    if (result.noIndikator && Array.isArray(result.dataPkm)) {
      _lkRenderTablePerPuskesmas(result, rows);
      return;
    }

    const rangePeriode = result.bulanAwal === result.bulanAkhir
      ? `${result.namaBulanAwal} ${result.tahun}`
      : `${result.namaBulanAwal} - ${result.namaBulanAkhir} ${result.tahun}`;
    const pkmNama = result.kodePkm
      ? ((_lkPkmList || []).find(p => p.kode === result.kodePkm)?.nama || currentUser.namaPKM || null)
      : null;
    const subtitle = document.getElementById('lkSubtitle');
    if (subtitle) subtitle.textContent = pkmNama
      ? `Periode: ${rangePeriode} | Puskesmas: ${pkmNama}`
      : `Periode: ${rangePeriode} | Puskesmas Aktif: ${result.totalPuskesmasAktif}`;

    const tercapai = rows.filter(r => r.persenKumulatif >= 100).length;
    const perluPerhatian = rows.filter(r => r.persenKumulatif < 40).length;
    const rataCapaian = rows.length
      ? (rows.reduce((a, r) => a + r.persenKumulatif, 0) / rows.length).toFixed(1)
      : '0';

    const statsEl = document.getElementById('lkStats');
    if (statsEl) statsEl.innerHTML = `
      ${statCard('blue', 'assignment', 'Total Indikator', rows.length)}
      ${statCard('green', 'check_circle', 'Tercapai (≥100%)', tercapai)}
      ${statCard('red', 'error', 'Perlu Perhatian (<40%)', perluPerhatian)}
      ${_lkTampilkanKolomLapor() ? statCard('orange', 'groups', pkmNama ? 'Status Lapor' : 'Puskesmas Lapor', pkmNama ? (result.pkmLapor ? 'Lapor' : 'Belum Lapor') : `${result.pkmLapor}/${result.totalPuskesmasAktif}`) : ''}
      ${statCard('purple', 'trending_up', 'Rata-rata Capaian', rataCapaian + '%')}`;

    if (!rows.length) {
      el.innerHTML = '<div class="empty-state" style="padding:40px"><span class="material-icons">inbox</span><p>Tidak ada data untuk periode ini</p></div>';
      return;
    }

    const th = 'background:#0d9488;color:white;font-size:11px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;padding:10px 12px;white-space:nowrap';

    const rowsHtml = rows.map(r => `
      <tr>
        <td style="text-align:center;padding:10px 12px">${r.no}</td>
        <td style="padding:10px 12px;text-align:left;font-size:13px">${r.nama}</td>
        <td style="text-align:center;padding:10px 12px">${r.targetTahunan.toLocaleString('id-ID')}</td>
        <td style="text-align:center;padding:10px 12px">${r.realisasiBulanIni.toLocaleString('id-ID')}</td>
        <td style="text-align:center;padding:10px 12px;font-weight:600">${r.realisasiKumulatif.toLocaleString('id-ID')}</td>
        <td style="text-align:center;padding:10px 12px;font-weight:700;color:${r.targetTahunan > 0 && Math.max(0, r.targetTahunan - r.realisasiKumulatif) === 0 ? '#16a34a' : 'inherit'}">${r.targetTahunan > 0 ? Math.max(0, r.targetTahunan - r.realisasiKumulatif).toLocaleString('id-ID') : '-'}</td>
        <td style="text-align:center;padding:10px 12px;font-weight:700;color:${_persenColor(r.persenKumulatif)}">${r.persenKumulatif.toFixed(1)}%</td>
        ${_lkTampilkanKolomLapor() ? `<td style="text-align:center;padding:10px 12px;font-size:12px;color:var(--text-light)">${result.kodePkm ? (result.pkmLapor ? 'Lapor' : 'Belum Lapor') : `${result.pkmLapor} / ${r.totalPuskesmasAktif}`}</td>` : ''}
      </tr>`).join('');

    el.innerHTML =
      '<div class="table-container"><table>'
      + '<thead><tr style="background:#0d9488">'
      + `<th style="${th}text-align:center!important">No</th>`
      + `<th style="${th}">Indikator</th>`
      + `<th style="${th}">Target Tahunan</th>`
      + `<th style="${th}">Realisasi ${result.namaBulanAkhir}</th>`
      + `<th style="${th}">Realisasi Periode Terpilih</th>`
      + `<th style="${th}">Sisa Target Tahunan</th>`
      + `<th style="${th}">Capaian Periode Terpilih</th>`
      + (_lkTampilkanKolomLapor() ? `<th style="${th}">Puskesmas Lapor</th>` : '')
      + '</tr></thead>'
      + '<tbody>' + rowsHtml + '</tbody>'
      + '</table></div>';
  }

  // Tampilan 1 indikator × semua puskesmas
  function _lkRenderTablePerPuskesmas(result, rows) {
    const el = document.getElementById('lkTable');
    const ind = (result.data || []).find(r => String(r.no) === String(result.noIndikator));
    const list = result.dataPkm || [];

    const rangePeriode = result.bulanAwal === result.bulanAkhir
      ? `${result.namaBulanAwal} ${result.tahun}`
      : `${result.namaBulanAwal} - ${result.namaBulanAkhir} ${result.tahun}`;
    const subtitle = document.getElementById('lkSubtitle');
    if (subtitle) subtitle.textContent = `Periode: ${rangePeriode} | Indikator ${result.noIndikator}`;

    const bertarget = list.filter(p => p.persenKumulatif !== null);
    const tercapai = bertarget.filter(p => p.persenKumulatif >= 100).length;
    const perluPerhatian = bertarget.filter(p => p.persenKumulatif < 40).length;
    const sudahLapor = list.filter(p => p.lapor).length;
    const rataCapaian = bertarget.length
      ? (bertarget.reduce((a, p) => a + p.persenKumulatif, 0) / bertarget.length).toFixed(1)
      : '0';

    const statsEl = document.getElementById('lkStats');
    if (statsEl) statsEl.innerHTML = `
      ${statCard('blue', 'assignment', 'Total Puskesmas', list.length)}
      ${statCard('green', 'check_circle', 'Tercapai (≥100%)', tercapai)}
      ${statCard('red', 'error', 'Perlu Perhatian (<40%)', perluPerhatian)}
      ${statCard('orange', 'groups', 'Puskesmas Lapor', `${sudahLapor}/${list.length}`)}
      ${statCard('purple', 'trending_up', 'Rata-rata Capaian', rataCapaian + '%')}`;

    if (!list.length) {
      el.innerHTML = '<div class="empty-state" style="padding:40px"><span class="material-icons">inbox</span><p>Tidak ada data puskesmas</p></div>';
      return;
    }

    const th = 'background:#0d9488;color:white;font-size:11px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;padding:10px 12px;white-space:nowrap';
    const fmt = n => n.toLocaleString('id-ID');
    const sisaOf = (t, r) => t > 0 ? Math.max(0, t - r) : null;
    const sisaCell = sisa => sisa === null ? '-' : fmt(sisa);
    const sisaColor = sisa => sisa === 0 ? '#16a34a' : 'inherit';

    const rowsHtml = list.map((p, i) => {
      const sisa = sisaOf(p.targetTahunan, p.realisasiKumulatif);
      return `
      <tr>
        <td style="text-align:center;padding:10px 12px">${i + 1}</td>
        <td style="padding:10px 12px;text-align:left;font-size:13px">${p.nama}</td>
        <td style="text-align:center;padding:10px 12px">${fmt(p.targetTahunan)}</td>
        <td style="text-align:center;padding:10px 12px">${fmt(p.realisasiBulanIni)}</td>
        <td style="text-align:center;padding:10px 12px;font-weight:600">${fmt(p.realisasiKumulatif)}</td>
        <td style="text-align:center;padding:10px 12px;font-weight:700;color:${sisaColor(sisa)}">${sisaCell(sisa)}</td>
        <td style="text-align:center;padding:10px 12px;font-weight:700;color:${p.persenKumulatif === null ? 'var(--text-light)' : _persenColor(p.persenKumulatif)}">${p.persenKumulatif === null ? '-' : p.persenKumulatif.toFixed(1) + '%'}</td>
        <td style="text-align:center;padding:10px 12px;font-size:12px;color:var(--text-light)">${p.lapor ? 'Lapor' : 'Belum Lapor'}</td>
      </tr>`;
    }).join('');

    // Baris total kabupaten — angka sama dengan tampilan "Semua Indikator" untuk indikator ini
    let totalHtml = '';
    if (ind) {
      const sisa = sisaOf(ind.targetTahunan, ind.realisasiKumulatif);
      totalHtml = `
      <tr style="background:#f0fdfa;font-weight:700">
        <td style="padding:10px 12px"></td>
        <td style="padding:10px 12px;text-align:left;font-size:13px">Total Kabupaten</td>
        <td style="text-align:center;padding:10px 12px">${fmt(ind.targetTahunan)}</td>
        <td style="text-align:center;padding:10px 12px">${fmt(ind.realisasiBulanIni)}</td>
        <td style="text-align:center;padding:10px 12px">${fmt(ind.realisasiKumulatif)}</td>
        <td style="text-align:center;padding:10px 12px;color:${sisaColor(sisa)}">${sisaCell(sisa)}</td>
        <td style="text-align:center;padding:10px 12px;color:${_persenColor(ind.persenKumulatif)}">${ind.persenKumulatif.toFixed(1)}%</td>
        <td style="text-align:center;padding:10px 12px;font-size:12px;color:var(--text-light)">${sudahLapor} / ${list.length}</td>
      </tr>`;
    }

    const judul = ind ? `<div style="padding:12px 16px;font-size:13px;font-weight:600;border-bottom:1px solid var(--border,#f1f5f9)">${ind.no}. ${ind.nama}</div>` : '';

    el.innerHTML = judul
      + '<div class="table-container"><table>'
      + '<thead><tr style="background:#0d9488">'
      + `<th style="${th}text-align:center!important">No</th>`
      + `<th style="${th}">Puskesmas</th>`
      + `<th style="${th}">Target Tahunan</th>`
      + `<th style="${th}">Realisasi ${result.namaBulanAkhir}</th>`
      + `<th style="${th}">Realisasi Periode Terpilih</th>`
      + `<th style="${th}">Sisa Target Tahunan</th>`
      + `<th style="${th}">Capaian Periode Terpilih</th>`
      + `<th style="${th}">Status Lapor ${result.namaBulanAkhir}</th>`
      + '</tr></thead>'
      + '<tbody>' + rowsHtml + totalHtml + '</tbody>'
      + '</table></div>';
  }

  // Reset state tiap kali halaman Laporan dirender ulang (ganti halaman lalu balik lagi)
  const _origRenderLaporan = window.renderLaporan;
  if (typeof _origRenderLaporan === 'function') {
    window.renderLaporan = async function (...args) {
      _lkLoaded = false;
      return _origRenderLaporan.apply(this, args);
    };
  }

})();
