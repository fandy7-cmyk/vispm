// Indikator yang target bulannya selalu = target tahunan (dikunci)
// No. 8: Hipertensi, No. 9: Diabetes Melitus
const INDIKATOR_TARGET_KUNCI = [8, 9];

// Validasi teks: harus mengandung minimal 1 huruf atau angka (bukan hanya simbol/spasi)
function isValidText(str) {
  return str && /[a-zA-Z0-9\u00C0-\u024F\u4e00-\u9fff]/.test(str.trim());
}

// ============== CATATAN THREAD HELPER ==============
// Render riwayat catatan sebagai zigzag timeline (5 per baris), collapse by default
async function renderCatatanThread(elId, idUsulan, currentRole) {
  const el = document.getElementById(elId);
  if (!el) return;

  const AKSI_CHAT = ['Tolak','Tolak (sebagian)','Sanggah','Sanggah Selesai','Ajukan Ulang','Kembalikan','Dikembalikan','Tolak Ke Operator','Tolak Indikator','Approve','Re-verifikasi','PP Membenarkan','Kapus Membenarkan','Kapus Menyanggah','Respond Penolakan','Sanggah → Admin','Sanggah → Kapus','Benarkan Penolakan Admin','Kembalikan ke PP','Kapus Sanggah','Kapus Terima Penolakan','Selesai','Konfirmasi Re-verif','Terima Penolakan Admin','Tolak Global'];
  const APPROVE_SKIP = ['Semua indikator disetujui'];

  let logs = [];
  try {
    const data = await API.getLogAktivitas(idUsulan);
    logs = (data.logs || []).filter(l => {
      const _a = (l.aksi || '').trim();
      if (!AKSI_CHAT.includes(_a) || !l.detail || !l.detail.trim()) return false;
      if (_a === 'Approve') return !APPROVE_SKIP.includes(l.detail.trim()) || l.detail.includes('Catatan:') || l.detail.includes('Re-verifikasi') || l.detail.includes('Menyanggah');
      return true;
    });
  } catch(e) { return; }

  if (!logs.length) { el.style.display = 'none'; el.innerHTML = ''; return; }

  const roleCfg = {
    'Operator':          { color:'#0891b2', bg:'#e0f2fe', border:'#7dd3fc' },
    'Kepala Puskesmas':  { color:'#d97706', bg:'#fffbeb', border:'#fde68a' },
    'Pengelola Program': { color:'#7c3aed', bg:'#f5f3ff', border:'#c4b5fd' },
    'Admin':             { color:'#dc2626', bg:'#fef2f2', border:'#fca5a5' },
  };
  // SVG icon library — setiap aksi unik
  const _svgIcons = {
    send: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
    replay: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/></svg>`,
    check_circle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    check_final: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/></svg>`,
    update: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.18-5"/></svg>`,
    cancel: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    remove_circle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`,
    cancel_ind: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    reply: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>`,
    undo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 7 3 3 7 3"/><path d="M3 3l5 5"/><path d="M21 13A9 9 0 0 1 3 13v-3"/></svg>`,
    undo_pp: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>`,
    gavel: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 13-8.5 8.5a2.12 2.12 0 0 1-3-3L11 10"/><path d="m16 16 6-6"/><path d="m8 8 6-6"/><path d="m9 7 8 8"/></svg>`,
    gavel_selesai: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 13-8.5 8.5a2.12 2.12 0 0 1-3-3L11 10"/><path d="m16 16 6-6"/><path d="m8 8 6-6"/><path d="m9 7 8 8"/><circle cx="20" cy="4" r="2" fill="currentColor"/></svg>`,
    fact_check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
    how_to_reg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>`,
    question_answer: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="9" y1="10" x2="15" y2="10"/><line x1="12" y1="7" x2="12" y2="13"/></svg>`,
    reply_all_admin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 17 2 12 7 7"/><polyline points="12 17 7 12 12 7"/><path d="M22 18v-2a4 4 0 0 0-4-4H7"/></svg>`,
    reply_all_kapus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 17 2 12 7 7"/><polyline points="12 17 7 12 12 7"/><path d="M22 18v-2a4 4 0 0 0-4-4H7"/><circle cx="22" cy="8" r="2" fill="currentColor"/></svg>`,
    restore: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.06 13a9 9 0 1 0 .49-4.95"/><polyline points="3 3 3 9 9 9"/><line x1="12" y1="7" x2="12" y2="12"/><circle cx="12" cy="15" r="1" fill="currentColor"/></svg>`,
    reset_admin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>`,
    selesai: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>`,
    konfirmasi: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/></svg>`,
    terima_admin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="m9 12 2 2 4-4"/></svg>`,
    tolak_global: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`,
    chat: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  };

  function _svgIcon(key, size, color) {
    const svg = _svgIcons[key] || _svgIcons.chat;
    return svg.replace('<svg ', `<svg width="${size}" height="${size}" style="color:${color}" `);
  }

  const aksiConfig = {
    'Submit':                   { icon:'send',           label:'Diajukan' },
    'Ajukan Ulang':             { icon:'replay',         label:'Ajukan Ulang' },
    'Approve':                  { icon:'check_circle',   label:'Disetujui' },
    'Approve Final':            { icon:'check_final',    label:'Final Disetujui' },
    'Re-verifikasi':            { icon:'update',         label:'Re-verifikasi' },
    'Tolak':                    { icon:'cancel',         label:'Ditolak' },
    'Tolak (sebagian)':         { icon:'remove_circle',  label:'Tolak Sebagian' },
    'Tolak Indikator':          { icon:'cancel_ind',     label:'Tolak Indikator' },
    'Tolak Ke Operator':        { icon:'reply',          label:'Tolak Ke Operator' },
    'Kembalikan':               { icon:'undo',           label:'Dikembalikan' },
    'Dikembalikan':             { icon:'undo',           label:'Dikembalikan' },
    'Sanggah':                  { icon:'gavel',          label:'Sanggah' },
    'Sanggah Selesai':          { icon:'gavel_selesai',  label:'PP Sanggah → Admin' },
    'PP Membenarkan':           { icon:'fact_check',     label:'PP Setuju Tolak → Kapus' },
    'Kapus Membenarkan':        { icon:'how_to_reg',     label:'Kapus Setuju Tolak' },
    'Kapus Menyanggah':         { icon:'gavel',          label:'Kapus Tidak Setuju' },
    'Respond Penolakan':        { icon:'question_answer',label:'Respond Penolakan' },
    'Sanggah → Admin':          { icon:'reply_all_admin',label:'Sanggah → Admin' },
    'Sanggah → Kapus':          { icon:'reply_all_kapus',label:'Sanggah → Kapus' },
    'Kembalikan ke PP':         { icon:'undo_pp',        label:'Kembalikan ke PP' },
    'Kapus Sanggah':            { icon:'gavel',          label:'Kapus Sanggah' },
    'Kapus Terima Penolakan':   { icon:'undo',           label:'Kapus Terima Penolakan' },
    'Benarkan Penolakan Admin': { icon:'fact_check',     label:'PP Setuju → Ditolak' },
    'Reset':                    { icon:'reset_admin',    label:'Direset Admin' },
    'Restore Verif':            { icon:'restore',        label:'Dipulihkan' },
    'Selesai':                  { icon:'selesai',        label:'Selesai' },
    'Konfirmasi Re-verif':      { icon:'konfirmasi',     label:'Konfirmasi Re-verif' },
    'Terima Penolakan Admin':   { icon:'terima_admin',   label:'Terima Penolakan Admin' },
    'Tolak Global':             { icon:'tolak_global',   label:'Ditolak Admin' },
  };
  const aksiIcon = Object.fromEntries(Object.entries(aksiConfig).map(([k,v]) => [k, v.icon]));
  function fmtDT(ts) {
    const d = new Date(ts), o = { timeZone:'Asia/Makassar' };
    const tgl = d.toLocaleDateString('id-ID',{...o,day:'2-digit',month:'2-digit',year:'numeric'});
    const jam = d.toLocaleTimeString('id-ID',{...o,hour:'2-digit',minute:'2-digit',hour12:false});
    return tgl + ' ' + jam + ' WITA';
  }

  // unique prefix per elemen supaya tidak collision jika 2 thread di halaman sama
  const pfx = elId + '_ct';

  // === GRID MODE: 4 kolom, compact, klik expand detail ===
  const COLS = 10;
  let html = '<div style="display:grid;grid-template-columns:repeat(10,1fr);gap:6px">';


  function _renderDetailLog(log) {
    const _aksiD = (log.aksi || '').trim();
    // ── Kapus Terima Penolakan: parse bagian tolak vs sanggah ──
    if (_aksiD === 'Kapus Terima Penolakan' && log.detail) {
      // Format: "Konteks | Indikator dikembalikan ke Operator: #4: alasan | #6: alasan | Indikator disanggah Kapus (→ PP re-verif): #1, #3"
      const detail = log.detail;
      // Pisahkan konteks (sebelum " | Indikator dikembalikan")
      const idxKembalikan = detail.indexOf(' | Indikator dikembalikan ke Operator:');
      const idxDisanggah  = detail.indexOf(' | Indikator disanggah Kapus');
      const konteks = idxKembalikan >= 0 ? detail.substring(0, idxKembalikan) : (idxDisanggah >= 0 ? detail.substring(0, idxDisanggah) : detail);

      // Bagian tolak: antara "Indikator dikembalikan ke Operator:" dan "Indikator disanggah Kapus"
      let tolakStr = '';
      if (idxKembalikan >= 0) {
        const startTolak = idxKembalikan + ' | Indikator dikembalikan ke Operator:'.length;
        const endTolak   = idxDisanggah >= 0 ? idxDisanggah : detail.length;
        tolakStr = detail.substring(startTolak, endTolak).trim();
      }

      // Bagian sanggah: setelah "Indikator disanggah Kapus (→ PP re-verif):"
      let sanggahStr = '';
      if (idxDisanggah >= 0) {
        const idxColon = detail.indexOf(':', idxDisanggah);
        if (idxColon >= 0) sanggahStr = detail.substring(idxColon + 1).trim();
      }

      let html = '';
      // Konteks baris pertama
      if (konteks.trim()) {
        html += '<div style="font-size:11.5px;color:#1e293b;font-weight:600;margin-bottom:6px;line-height:1.4">' + konteks.trim() + '</div>';
      }

      // Indikator ditolak (dikembalikan ke Operator)
      if (tolakStr) {
        html += '<div style="margin-bottom:5px"><div style="font-size:10px;font-weight:700;color:#dc2626;margin-bottom:3px;display:flex;align-items:center;gap:3px"><span class="material-icons" style="font-size:11px">reply</span>Dikembalikan ke Operator</div>';
        tolakStr.split('|').map(s => s.trim()).filter(Boolean).forEach(part => {
          const m = part.match(/^#(\d+):\s*(.+)$/);
          if (m) {
            html += '<div style="display:flex;align-items:flex-start;gap:5px;padding:2px 0;border-bottom:1px solid #fecaca">'
                  + '<span style="background:#fef2f2;color:#dc2626;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:700;flex-shrink:0">#' + m[1] + '</span>'
                  + '<span style="font-size:11px;color:#334155;line-height:1.4">' + m[2] + '</span>'
                  + '</div>';
          } else {
            html += '<div style="font-size:11px;color:#64748b;padding:2px 0">' + part + '</div>';
          }
        });
        html += '</div>';
      }

      // Indikator disanggah Kapus (→ PP re-verif)
      if (sanggahStr) {
        html += '<div style="margin-top:4px"><div style="font-size:10px;font-weight:700;color:#7c3aed;margin-bottom:3px;display:flex;align-items:center;gap:3px"><span class="material-icons" style="font-size:11px">gavel</span>Disanggah Kapus → PP re-verif</div>';
        sanggahStr.split(',').map(s => s.trim()).filter(Boolean).forEach(nStr => {
          const n = nStr.replace(/^#/, '');
          html += '<span style="display:inline-flex;align-items:center;gap:2px;background:#f5f3ff;color:#7c3aed;border:1px solid #c4b5fd;border-radius:20px;padding:1px 8px;font-size:10px;font-weight:700;margin:2px 2px 0 0">'
                + '<span class="material-icons" style="font-size:10px">gavel</span>#' + n
                + '</span>';
        });
        html += '</div>';
      }

      return html || detail;
    }

    // ── Kapus Sanggah: parse catatan ──
    if (_aksiD === 'Kapus Sanggah' && log.detail) {
      const detail = log.detail;
      const idxCatatan = detail.indexOf(' | Catatan:');
      const konteks  = idxCatatan >= 0 ? detail.substring(0, idxCatatan) : detail;
      const catatan  = idxCatatan >= 0 ? detail.substring(idxCatatan + ' | Catatan:'.length).trim() : '';
      let html = '<div style="font-size:11.5px;color:#1e293b;font-weight:600;margin-bottom:4px;line-height:1.4">' + konteks.trim() + '</div>';
      if (catatan) {
        html += '<div style="background:#f5f3ff;border:1px solid #c4b5fd;border-radius:6px;padding:5px 8px;font-size:11px;color:#5b21b6;line-height:1.4">'
              + '<span class="material-icons" style="font-size:11px;vertical-align:middle;margin-right:3px">comment</span>'
              + catatan + '</div>';
      }
      return html;
    }

    const isRespon = _aksiD === 'Respond Penolakan' || _aksiD === 'Sanggah → Admin' || _aksiD === 'Benarkan Penolakan Admin';
    if (!isRespon || !log.detail) {
      return log.detail || '';
    }
    // Format detail: "#1: Disanggah — alasan | #2: Dibenarkan — alasan [sebagian]"
    const parts = log.detail.replace(/\[sebagian\]/gi, '').split('|').map(function(s) { return s.trim(); }).filter(Boolean);
    if (!parts.length) return log.detail || '';
    var html = '<div style="display:flex;flex-direction:column;gap:2px">';
    parts.forEach(function(part) {
      var m = part.match(/^#(\d+):\s*(Disanggah|Dibenarkan)\s*[—-]\s*(.*)$/i);
      if (!m) {
        html += '<div style="font-size:11px;color:#64748b;padding:3px 0">' + part + '</div>';
        return;
      }
      var no = m[1], aksiItem = m[2], alasan = m[3] || '-';
      var isSanggah = /disanggah/i.test(aksiItem);
      var badgeClr = isSanggah ? '#7c3aed' : '#dc2626';
      var badgeBg  = isSanggah ? '#f5f3ff' : '#fef2f2';
      var badgeIcon  = isSanggah ? 'gavel' : 'check_circle';
      var badgeLabel = isSanggah ? 'Disanggah' : 'Dibenarkan';
      html += '<div style="display:flex;align-items:flex-start;gap:5px;padding:3px 0;border-bottom:1px solid #f1f5f9">'
            + '<span style="background:#e2e8f0;color:#475569;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:700;flex-shrink:0">#' + no + '</span>'
            + '<span style="background:' + badgeBg + ';color:' + badgeClr + ';border-radius:4px;padding:1px 5px;font-size:10px;font-weight:700;flex-shrink:0;display:inline-flex;align-items:center;gap:2px">'
            + '<span class=\"material-icons\" style=\"font-size:10px\">' + badgeIcon + '</span>' + badgeLabel
            + '</span>'
            + '<span style="font-size:11px;color:#334155;line-height:1.4">' + alasan + '</span>'
            + '</div>';
    });
    html += '</div>';
    return html;
  }

  // Registry untuk toggle callbacks — hindari SVG bersarang di dalam onclick string
  if (!window.__ctToggle) window.__ctToggle = {};

  logs.forEach((log, idx) => {
    const _aksi = (log.aksi || '').trim(); // trim whitespace/encoding issues
    const cfg = roleCfg[log.role] || { color:'#64748b', bg:'#f8fafc', border:'#e2e8f0' };
    const icon = aksiIcon[_aksi] || 'chat';
    const nama = log.user_nama || log.user_email;
    const cardId = pfx + '_' + idx;
    // Warna badge aksi — ambil dari aksiConfig, fallback ke role color
    const _aksiColorMap = {
      'Submit':                   { c:'#0d9488', b:'#f0fdf9' },   // teal
      'Ajukan Ulang':             { c:'#0284c7', b:'#e0f2fe' },   // sky blue
      'Approve':                  { c:'#16a34a', b:'#f0fdf4' },   // green
      'Approve Final':            { c:'#15803d', b:'#dcfce7' },   // dark green
      'Re-verifikasi':            { c:'#06b6d4', b:'#ecfeff' },   // cyan
      'Tolak':                    { c:'#dc2626', b:'#fef2f2' },   // red
      'Tolak (sebagian)':         { c:'#ea580c', b:'#fff7ed' },   // orange
      'Tolak Indikator':          { c:'#be123c', b:'#fff1f2' },   // rose
      'Tolak Ke Operator':        { c:'#b91c1c', b:'#fef2f2' },   // dark red
      'Kembalikan':               { c:'#7c3aed', b:'#f5f3ff' },   // violet
      'Dikembalikan':             { c:'#6d28d9', b:'#ede9fe' },   // purple
      'Sanggah':                  { c:'#9333ea', b:'#faf5ff' },   // purple-600
      'Sanggah Selesai':          { c:'#a21caf', b:'#fdf4ff' },   // fuchsia
      'PP Membenarkan':           { c:'#0f766e', b:'#f0fdfa' },   // teal-700
      'Kapus Membenarkan':        { c:'#b45309', b:'#fefce8' },   // amber-700
      'Kapus Menyanggah':         { c:'#c2410c', b:'#fff7ed' },   // orange-700
      'Respond Penolakan':        { c:'#2563eb', b:'#eff6ff' },   // blue
      'Sanggah → Admin':          { c:'#7e22ce', b:'#f3e8ff' },   // purple-800
      'Sanggah → Kapus':          { c:'#d97706', b:'#fffbeb' },   // amber
      'Kembalikan ke PP':         { c:'#4f46e5', b:'#eef2ff' },   // indigo
      'Kapus Sanggah':            { c:'#db2777', b:'#fdf2f8' },   // pink
      'Kapus Terima Penolakan':   { c:'#f59e0b', b:'#fffbeb' },   // yellow-amber
      'Benarkan Penolakan Admin': { c:'#991b1b', b:'#fef2f2' },   // red-800
      'Reset':                    { c:'#64748b', b:'#f8fafc' },   // slate
      'Restore Verif':            { c:'#6366f1', b:'#eef2ff' },   // indigo-500
      'Selesai':                  { c:'#059669', b:'#ecfdf5' },   // emerald
      'Konfirmasi Re-verif':      { c:'#0369a1', b:'#e0f2fe' },   // sky-700
      'Terima Penolakan Admin':   { c:'#7f1d1d', b:'#fef2f2' },   // red-900
      'Tolak Global':             { c:'#450a0a', b:'#fff1f2' },   // darkest red
    };
    const aksiClr = _aksiColorMap[_aksi] || { c:cfg.color, b:cfg.bg };

    const _svgChevronDown = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${aksiClr.c}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
    const _svgChevronUp   = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${aksiClr.c}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>`;

    // Simpan SVG ke registry agar tidak perlu inject ke dalam onclick string
    window.__ctToggle[cardId] = { up: _svgChevronUp, down: _svgChevronDown };

    html += `<div style="border:1.5px solid ${aksiClr.c}55;border-radius:8px;background:${aksiClr.b};overflow:hidden">
      <!-- header: selalu tampil, klik toggle -->
      <div onclick="__ctToggleFn('${cardId}')" style="padding:7px 8px;cursor:pointer;display:flex;align-items:flex-start;gap:6px">
        <div style="width:28px;height:28px;border-radius:50%;background:white;border:2px solid ${aksiClr.c};display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px">
          ${_svgIcon(icon, 14, aksiClr.c)}
        </div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:4px">
            <span style="font-size:10px;font-weight:800;color:${aksiClr.c}">#${idx+1}</span>
            <span id="${cardId}_arr">${_svgChevronDown}</span>
          </div>
          <div style="font-size:11.5px;font-weight:700;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${nama}</div>
          <div style="font-size:10.5px;color:#64748b;margin-bottom:3px">${log.role}</div>
          <div style="font-size:10.5px;font-weight:700;color:${aksiClr.c};background:white;border:1px solid ${aksiClr.c}60;border-radius:20px;padding:1px 6px;display:inline-flex;align-items:center;gap:3px">
            ${_svgIcon(icon, 11, aksiClr.c)}${(aksiConfig[_aksi]||{label:_aksi}).label}
          </div>
        </div>
      </div>
      <!-- expanded: detail + timestamp -->
      <div id="${cardId}" style="display:none;padding:6px 8px;border-top:1px solid ${aksiClr.c}30;background:white">
        <div style="font-size:11.5px;color:#1e293b;line-height:1.5;word-break:break-word">${_renderDetailLog(log)}</div>
        <div style="font-size:10px;color:#94a3b8;margin-top:4px;">${fmtDT(log.timestamp)}</div>
      </div>
    </div>`;
  });

  html += '</div>';

  el.innerHTML = `<div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:10px;padding:12px 14px">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #e2e8f0">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <span style="font-size:12px;font-weight:700;color:#475569">Riwayat Catatan</span>
      <span style="font-size:10px;color:#94a3b8;margin-left:4px">(${logs.length} entri — klik untuk detail)</span>
    </div>
    <div style="width:100%">${html}</div>
  </div>`;
  el.style.display = 'block';
}

// Toggle helper untuk catatan thread — dipanggil via onclick="__ctToggleFn('id')"
function __ctToggleFn(cardId) {
  const d   = document.getElementById(cardId);
  const arr = document.getElementById(cardId + '_arr');
  if (!d || !arr) return;
  const isHidden = d.style.display === 'none';
  d.style.display = isHidden ? 'block' : 'none';
  const svgs = (window.__ctToggle || {})[cardId];
  if (svgs) arr.innerHTML = isHidden ? svgs.up : svgs.down;
}

// ============== APP STATE ==============

// ============== PENOLAKAN BANNER HELPER ==============
// Tampilkan banner alasan penolakan per indikator dari verifikator level atas
// elId: id elemen div target | ditolakOleh: label nama role | alasanArr: [{no, alasan}]
function renderPenolakanBanner(elId, ditolakOleh, alasanArr) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!ditolakOleh || !alasanArr || !alasanArr.length) {
    el.style.display = 'none'; el.innerHTML = ''; return;
  }
  const cells = alasanArr.map(({ no, alasan }) =>
    `<div style="display:flex;align-items:baseline;gap:7px;background:#fff5f5;border:1px solid #fecaca;border-radius:6px;padding:5px 9px;min-width:0">
      <span style="background:#fee2e2;color:#991b1b;border-radius:4px;padding:1px 7px;font-size:11px;font-weight:700;white-space:nowrap;flex-shrink:0">Ind. #${no}</span>
      <span style="font-size:11.5px;color:#7f1d1d;line-height:1.4;word-break:break-word">${alasan || '-'}</span>
    </div>`
  ).join('');
  el.innerHTML = `
    <div style="background:var(--danger-light,#fef2f2);border:1.5px solid #fca5a5;border-radius:8px;padding:10px 14px">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
        <span class="material-icons" style="font-size:16px;color:#dc2626">cancel</span>
        <span style="font-size:12.5px;font-weight:700;color:#991b1b">Alasan Penolakan dari ${ditolakOleh}</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:6px">${cells}</div>
    </div>`;
  el.style.display = 'block';
}

// Format timestamp: DD MMMM YYYY, HH:mm WITA
function formatTS(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  if (isNaN(d)) return ts;
  const o = { timeZone: 'Asia/Makassar' };
  const tgl = d.toLocaleDateString('id-ID', { ...o, day: '2-digit', month: '2-digit', year: 'numeric' });
  const jam = d.toLocaleTimeString('id-ID', { ...o, hour: '2-digit', minute: '2-digit', hour12: false });
  return `${tgl} | ${jam} WITA`;
}

// ============== HEADER INFO STRIP ==============
// Render info header modal jadi 1 baris horizontal kompak
function renderHeaderInfo(detail) {
  // flex kolom: Puskesmas dan Dibuat Oleh lebih lebar, Status cukup untuk teks panjang
  const items = [
    { label: 'Puskesmas', value: `<span style="font-size:13.5px;font-weight:600;color:var(--text-dark)">${detail.namaPKM}</span>`, flex: '1.5' },
    { label: 'Periode', value: `<span style="font-size:13.5px;font-weight:600;color:var(--text-dark)">${detail.namaBulan} ${detail.tahun}</span>`, flex: '1' },
    { label: 'Status', value: statusBadge(detail.statusGlobal), flex: '2' },
    { label: 'Dibuat Oleh', value: `<span style="font-size:13px;font-weight:600;color:var(--text-dark)">${detail.namaPembuat || detail.createdBy || '-'}</span><div style="font-size:10.5px;color:var(--text-light);margin-top:1px">${formatTS(detail.createdAt)}</div>`, flex: '1.5' },
    { label: 'Indeks Beban Kerja', value: `<span style="font-size:13.5px;font-weight:600;color:var(--text-dark)">${parseFloat(detail.indeksBeban||0).toFixed(2)}</span>`, flex: '1' },
    { label: 'Indeks Kesulitan Wilayah', value: `<span style="font-size:13.5px;font-weight:600;color:var(--text-dark)">${parseFloat(detail.indeksKesulitan||0).toFixed(2)}</span>`, flex: '1.2' },
    { label: 'Indeks SPM', value: `<span style="font-size:15px;font-weight:800;color:var(--primary)">${parseFloat(detail.indeksSPM||0).toFixed(2)}</span>`, flex: '1' },
  ];
  return `<div style="background:white;border:1px solid #e2e8f0;border-radius:10px;padding:8px 0;display:flex;align-items:center;gap:0;width:100%;margin-bottom:14px">
    ${items.map((item, i) => `
      <div style="padding:6px 14px;flex:${item.flex};min-width:0;${i<items.length-1?'border-right:1px solid #e2e8f0;':''}">
        <div style="font-size:10px;color:var(--text-light);font-weight:600;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${item.label}</div>
        <div style="min-width:0">${item.value}</div>
      </div>`).join('')}
  </div>`;
}

let currentUser = null;
let currentPage = '';
let pageData = {}; // cache per page
let verifCurrentUsulan = null; // for verifikasi modal

// ===== GOOGLE DRIVE CONFIG =====
// Google Drive: menggunakan Service Account (backend)
window.GDRIVE_FOLDER_ID = "1HywRrWup2JgX3Zig2FND8K5Zc6HWtu-A";


// Format date only: DD MMMM YYYY
function formatDate(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  if (isNaN(d)) return ts;
  return d.toLocaleDateString('id-ID', {
    timeZone: 'Asia/Makassar',
    day: '2-digit', month: 'long', year: 'numeric',
  });
}

// Format datetime: DD MMMM YYYY, HH:mm  
function formatDateTime(ts) { return formatTS(ts); }

// Sanitasi jam ke format 24-jam "HH:MM"
// Menangani data lama yang mungkin tersimpan sebagai "08:00 AM", "05:00 PM", dll.
function fmt24(jamStr) {
  if (!jamStr) return '';
  const s = jamStr.trim();
  // Jika sudah format HH:MM tanpa AM/PM → langsung kembalikan
  if (/^\d{1,2}:\d{2}$/.test(s)) return s.padStart(5, '0').slice(0, 5);
  // Coba parse format "HH:MM AM/PM" atau "H:MM AM/PM"
  const m = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)$/i);
  if (m) {
    let h = parseInt(m[1]);
    const min = m[2];
    const period = m[3].toUpperCase();
    if (period === 'AM' && h === 12) h = 0;
    if (period === 'PM' && h !== 12) h += 12;
    return String(h).padStart(2, '0') + ':' + min;
  }
  return s; // fallback kembalikan apa adanya
}

// Format Capaian (%) — dipakai di seluruh sistem
function fmtCapaianPct(capaian, target) {
  if (!target || target <= 0) return '0%';
  const pct = Math.min((parseFloat(capaian) / parseFloat(target)) * 100, 100);
  if (pct === 100) return '100%';
  if (pct === 0) return '0%';
  // Tampilkan 1 desimal jika ada, buang trailing zero
  const fixed = pct.toFixed(1);
  return (fixed.endsWith('.0') ? pct.toFixed(0) : fixed) + '%';
}
// ============== AUTH ==============
async function doLogin() {
  const email = document.getElementById('authEmail').value.trim();
  if (!email) return setAuthStatus('Masukkan email Anda', 'error');

  const password = document.getElementById('authPassword')?.value || '';

  const btn = document.getElementById('authBtn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spm-spinner sm white"><div class="sr1"></div><div class="sr2"></div><div class="sr3"></div></div> Loading...';
  setAuthStatus('Memeriksa kredensial...', '');

  try {
    const user = await API.login(email, password);
    currentUser = user;
    sessionStorage.setItem('spm_user', JSON.stringify(user));
    // Catat log login
    API.logAudit({ module: 'auth', action: 'LOGIN', userEmail: user.email, userNama: user.nama, userRole: user.role, detail: 'Login berhasil' });
    startApp();
    startIdleWatcher();
  } catch (e) {
    setAuthStatus(e.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<span class="material-icons">login</span> Login';
    setTimeout(() => setAuthStatus('', ''), 2000);
  }
}

function toggleAuthPw() {
  const inp = document.getElementById('authPassword');
  const icon = document.getElementById('authPwIcon');
  if (inp.type === 'password') { inp.type = 'text'; icon.textContent = 'visibility'; }
  else { inp.type = 'password'; icon.textContent = 'visibility_off'; }
}

function setAuthStatus(msg, type) {
  const el = document.getElementById('authStatus');
  el.textContent = msg;
  el.className = 'auth-status' + (type ? ' ' + type : '');
}

function doLogout() {
  showConfirm({
    title: 'Keluar dari Sistem',
    message: 'Yakin ingin keluar dari sistem?',
    type: 'warning',
    onConfirm: () => { window._intentionalLogout = true; sessionStorage.removeItem('spm_user'); try { sessionStorage.removeItem('spm_last_page'); } catch(e) {} if(currentUser) { API.logout(); API.logAudit({module:'auth',action:'LOGOUT',userEmail:currentUser.email,userNama:currentUser.nama,userRole:currentUser.role,detail:'Logout manual'}); } currentUser = null; location.reload(); }
  });
}

// ============== APP INIT ==============
function startApp() {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('appLayout').style.display = 'flex';

  // Normalisasi indikatorAkses: pastikan selalu berupa array integer
  // (dari DB/localStorage bisa berupa string "1,3,5-8" atau array)
  const _aksesRaw = currentUser.indikatorAkses;
  if (typeof _aksesRaw === 'string') {
    currentUser.indikatorAksesString = _aksesRaw; // simpan string asli untuk display
    currentUser.indikatorAkses = parseIndikatorAksesString(_aksesRaw);
  } else if (Array.isArray(_aksesRaw)) {
    // Sudah array (misal dari localStorage JSON) — normalisasi ulang ke integer dan rebuild string
    currentUser.indikatorAkses = _aksesRaw.map(n => parseInt(n)).filter(n => !isNaN(n) && n > 0);
    currentUser.indikatorAksesString = currentUser.indikatorAkses.join(',');
  } else {
    currentUser.indikatorAkses = [];
    currentUser.indikatorAksesString = '';
  }

  // Set user info
  document.getElementById('sidebarName').textContent = currentUser.nama || currentUser.email;
  let roleText = currentUser.role;
  if (currentUser.namaPKM) {
    roleText = `${currentUser.role}`;
  }
  document.getElementById('sidebarRole').textContent = roleText;
  const sidebarPKMEl = document.getElementById('sidebarPKM');
  if (sidebarPKMEl) {
    if (currentUser.namaPKM) {
      sidebarPKMEl.textContent = currentUser.namaPKM;
      sidebarPKMEl.style.display = 'block';
    } else {
      sidebarPKMEl.style.display = 'none';
    }
  }
  document.getElementById('sidebarAvatar').textContent = (currentUser.nama || 'U')[0].toUpperCase();
  const _topbarAv = document.getElementById('topbarAvatar');
  if (_topbarAv) _topbarAv.textContent = (currentUser.nama || 'U')[0].toUpperCase();
  const dropNameEl = document.getElementById('topbarDropName');
  if (dropNameEl) dropNameEl.textContent = currentUser.nama || currentUser.email;
  const dropMetaEl = document.getElementById('topbarDropMeta');
  if (dropMetaEl) dropMetaEl.textContent = currentUser.role + (currentUser.namaPKM ? ` · ${currentUser.namaPKM}` : '');

  // Load app settings (tahun range) lalu build UI
  API.get('settings').then(s => {
    if (s && s.tahun_awal) {
      window._appTahunAwal  = parseInt(s.tahun_awal);
      window._appTahunAkhir = parseInt(s.tahun_akhir);
    }
  }).catch(() => {});
  // Fetch periode aktif untuk proteksi sidebar Input Usulan
  API.get('periode').then(allPeriode => {
    window._periodeAktifList = Array.isArray(allPeriode) ? allPeriode : [];
    buildSidebar(); // rebuild sidebar setelah tahu status periode
  }).catch(() => {
    window._periodeAktifList = [];
  });
  buildSidebar();

  // Inject tombol Search & Notifikasi ke topbar
  const topbarRight = document.querySelector('.topbar-right');
  if (topbarRight && !document.getElementById('notifBtnWrap')) {
    const searchBtn = document.createElement('button');
    searchBtn.id = 'globalSearchBtn';
    searchBtn.title = 'Cari (Ctrl+K)';
    searchBtn.style.cssText = 'background:none;border:1.5px solid #e2e8f0;border-radius:8px;padding:5px 10px;cursor:pointer;display:flex;align-items:center;gap:5px;color:#64748b;font-size:12px;font-family:inherit;transition:all 0.15s';
    searchBtn.innerHTML = '<span class="material-icons" style="font-size:17px">search</span>';
    searchBtn.onmouseover = () => { searchBtn.style.borderColor="#0d9488"; searchBtn.style.color="#0d9488"; };
    searchBtn.onmouseout  = () => { searchBtn.style.borderColor="#e2e8f0"; searchBtn.style.color="#64748b"; };
    searchBtn.onclick = openGlobalSearch;
    const notifWrap = document.createElement('div');
    notifWrap.id = 'notifBtnWrap';
    notifWrap.style.cssText = 'position:relative;display:flex';
    const notifBtn = document.createElement('button');
    notifBtn.id = 'notifBtn';
    notifBtn.title = 'Notifikasi';
    notifBtn.style.cssText = 'background:none;border:1.5px solid #e2e8f0;border-radius:8px;width:36px;height:36px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#64748b;transition:all 0.15s;position:relative';
    notifBtn.innerHTML = '<span class="material-icons" style="font-size:19px">notifications</span>';
    notifBtn.onmouseover = () => { notifBtn.style.borderColor="#0d9488"; notifBtn.style.color="#0d9488"; };
    notifBtn.onmouseout  = () => { notifBtn.style.borderColor="#e2e8f0"; notifBtn.style.color="#64748b"; };
    notifBtn.onclick = toggleNotifPanel;
    notifWrap.appendChild(notifBtn);
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) {
      topbarRight.insertBefore(searchBtn, themeBtn);
      topbarRight.insertBefore(notifWrap, themeBtn);
    } else {
      topbarRight.prepend(notifWrap);
      topbarRight.prepend(searchBtn);
    }
  }
  startNotifPoller();

  // Restore halaman terakhir sebelum refresh (jika ada), fallback ke dashboard
  // Restore halaman terakhir, tapi validasi dulu apakah role saat ini boleh akses
  let lastPage = 'dashboard';
  try {
    const saved = sessionStorage.getItem('spm_last_page');
    if (saved && saved !== 'dashboard') {
      // Kumpulkan halaman yang boleh diakses role ini dari menuMap
      const roleMenus = {
        'Admin':            ['dashboard','verifikasi','laporan','master-data','kelola-usulan'],
        'Operator':         ['dashboard','input','laporan'],
        'Kepala Puskesmas': ['dashboard','verifikasi','laporan'],
        'Pengelola Program':['dashboard','verifikasi','laporan'],
        'Super Admin':      ['dashboard','verifikasi','laporan','master-data','kelola-usulan','users','pkm','indikator','periode','jabatan'],
      };
      const allowed = roleMenus[currentUser.role] || ['dashboard'];
      if (allowed.includes(saved)) lastPage = saved;
      // Kalau halaman tidak diizinkan (misal 'input' untuk Kapus), fallback ke dashboard
    }
  } catch(e) {}
  loadPage(lastPage);

  // Sembunyikan menu Edit Profil & Tanda Tangan untuk Operator
  const btnEPTT = document.getElementById('btnEditProfilTT');
  if (btnEPTT) {
    const rolesBolehTT = ['Kepala Puskesmas','Pengelola Program'];
    btnEPTT.style.display = rolesBolehTT.includes(currentUser.role) ? '' : 'none';
  }

  // Popup notifikasi tanda tangan untuk Kepala Puskesmas, Pengelola Program, dan Admin
  const rolesBolehTT2 = ['Kepala Puskesmas', 'Pengelola Program', 'Admin'];
  if (rolesBolehTT2.includes(currentUser.role)) {
    setTimeout(() => showTandaTanganLoginPopup(), 1000);
  }
}



async function showTandaTanganLoginPopup() {
  try {
    const role = currentUser.role;
    let ttMissing = false;
    let isAdmin = role === 'Admin';

    if (role === 'Kepala Puskesmas' || role === 'Pengelola Program') {
      const tt = currentUser.tandaTangan;
      ttMissing = !tt || tt === 'null' || tt === '';
    } else if (role === 'Admin') {
      try {
        const pjRes = await fetch('/api/pejabat');
        if (!pjRes.ok) throw new Error('Gagal load pejabat');
        const pjData = await pjRes.json();
        const pjList = pjData.success ? pjData.data : [];
        // Cek semua pejabat yang terdaftar — jika ada yang belum punya tanda tangan, tampilkan popup
        // Tidak lagi hardcode jabatan tertentu agar fleksibel saat pejabat dihapus/ditambah
        ttMissing = pjList.length === 0 || pjList.some(p => !p.tanda_tangan);
      } catch(e) { ttMissing = true; }
    }

    if (!ttMissing) return; // Tanda tangan sudah lengkap, tidak perlu popup

    const SVG_PEN_I  = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>';
    const SVG_PEN2_I = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>';
    const SVG_GEAR_I = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

    const bodyHtml = isAdmin ? `
      <div style="display:flex;align-items:flex-start;gap:14px;padding:4px 0 12px">
        <div style="width:44px;height:44px;border-radius:12px;background:var(--danger-light,#fef2f2);border:1.5px solid #fca5a5;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#dc2626">${SVG_PEN_I}</div>
        <div>
          <div style="font-weight:700;color:#0f172a;font-size:14px;margin-bottom:4px">Tanda Tangan Pejabat Belum Lengkap</div>
          <div style="font-size:13px;color:#64748b;line-height:1.6">Data tanda tangan <b>Pejabat Penandatangan</b> belum diisi. Laporan PDF tidak dapat dibuat tanpa tanda tangan yang lengkap.</div>
        </div>
      </div>
      <div style="background:var(--danger-light,#fef2f2);border:1px solid #fca5a5;border-radius:8px;padding:10px 14px;font-size:12px;color:#7f1d1d;margin-bottom:4px">
        ⚠️ Lengkapi di: <b>Master Data → Pejabat Penandatangan</b>
      </div>` : `
      <div style="display:flex;align-items:flex-start;gap:14px;padding:4px 0 12px">
        <div style="width:44px;height:44px;border-radius:12px;background:var(--danger-light,#fef2f2);border:1.5px solid #fca5a5;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#dc2626">${SVG_PEN_I}</div>
        <div>
          <div style="font-weight:700;color:#0f172a;font-size:14px;margin-bottom:4px">Tanda Tangan Belum Diupload</div>
          <div style="font-size:13px;color:#64748b;line-height:1.6">Anda belum mengupload <b>tanda tangan</b>. Tanda tangan diperlukan untuk proses verifikasi usulan.</div>
        </div>
      </div>
      <div style="background:var(--danger-light,#fef2f2);border:1px solid #fca5a5;border-radius:8px;padding:10px 14px;font-size:12px;color:#7f1d1d;margin-bottom:4px">
        ⚠️ Upload di: <b>Foto Profil → Edit Profil & Tanda Tangan</b>
      </div>`;

    const popup = document.createElement('div');
    popup.id = 'ttLoginPopup';
    popup.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9998;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px);animation:fadeIn 0.3s ease';
    popup.innerHTML = `
      <div style="background:white;border-radius:16px;width:420px;max-width:calc(100vw - 32px);overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,0.3);animation:authIn 0.3s ease">
        <div style="background:linear-gradient(135deg,#dc2626,#ef4444);padding:16px 20px;color:white">
          <div style="display:flex;align-items:center;gap:10px">
            <span style="display:flex">${SVG_PEN_I}</span>
            <span style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px">Perhatian — Tanda Tangan</span>
          </div>
        </div>
        <div style="padding:20px">
          ${bodyHtml}
          <div style="display:flex;gap:8px;margin-top:14px">
            <button onclick="document.getElementById('ttLoginPopup').remove()" style="flex:1;height:42px;background:#f1f5f9;border:none;border-radius:10px;color:#64748b;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">
              Nanti
            </button>
            <button onclick="document.getElementById('ttLoginPopup').remove();${isAdmin ? "loadPage('master');setTimeout(()=>renderMasterData('pejabat'),300)" : 'openEditProfil()'}" style="flex:2;height:42px;background:linear-gradient(135deg,#dc2626,#ef4444);border:none;border-radius:10px;color:white;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px">
              ${isAdmin ? SVG_GEAR_I + ' Buka Master Data' : SVG_PEN2_I + ' Upload Sekarang'}
            </button>
          </div>
        </div>
      </div>`;
    popup.addEventListener('click', e => { if (e.target === popup) popup.remove(); });
    document.body.appendChild(popup);
  } catch(e) { /* silent fail */ }
}

function buildSidebar() {
  const role = currentUser.role;
  const nav = document.getElementById('sidebarNav');
  const menuMap = {
    'Admin': [
      { label: 'Menu', items: [
        { id: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
        { id: 'verifikasi', icon: 'verified', label: 'Verifikasi' },
        { id: 'laporan', icon: 'bar_chart', label: 'Laporan' }
      ]},
      { label: 'Kelola Master', items: [
        { id: 'master-data', icon: 'storage', label: 'Master Data' },
      ]},
      { label: 'Manajemen', items: [
        { id: 'kelola-usulan', icon: 'manage_accounts', label: 'Kelola Semua Usulan' }
      ]}
    ],
    'Operator': [
      { label: 'Menu', items: [
        { id: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
        { id: 'input', icon: 'edit', label: 'Input Usulan' },
        { id: 'laporan', icon: 'bar_chart', label: 'Laporan' }
      ]}
    ],
    'Kepala Puskesmas': [
      { label: 'Menu', items: [
        { id: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
        { id: 'verifikasi', icon: 'verified', label: 'Verifikasi' },
        { id: 'laporan', icon: 'bar_chart', label: 'Laporan' }
      ]}
    ],
    'Pengelola Program': [
      { label: 'Menu', items: [
        { id: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
        { id: 'verifikasi', icon: 'verified', label: 'Verifikasi' },
        { id: 'laporan', icon: 'bar_chart', label: 'Laporan' }
      ]}
    ]
  };

  const sections = menuMap[role] || menuMap['Operator'];
  let html = '';
  for (const section of sections) {
    html += `<div class="sidebar-section">${section.label}</div>`;
    for (const item of section.items) {
      // Disable menu Input Usulan jika tidak ada periode aktif
      const isInputMenu = item.id === 'input';
      const noPeriodeAktif = isInputMenu && !(window._periodeAktifList || []).some(p => p.isAktifToday);
      if (isInputMenu && noPeriodeAktif) {
        html += `<div class="menu-item" id="nav-${item.id}" title="Tidak ada periode input aktif" style="opacity:0.45;cursor:not-allowed;pointer-events:none">
          <span class="material-icons">${item.icon}</span><span>${item.label}</span>
          <span class="material-icons" style="font-size:14px;margin-left:auto;color:#fbbf24">lock</span>
        </div>`;
      } else {
        html += `<div class="menu-item" id="nav-${item.id}" onclick="loadPage('${item.id}')">
          <span class="material-icons">${item.icon}</span><span>${item.label}</span>
        </div>`;
      }
    }
  }
  // Tombol Buku Panduan — tampil untuk semua role di bagian bawah sidebar
  html += `
    <div style="margin-top:auto;border-top:1px solid rgba(255,255,255,0.15);padding-top:6px;">
      <div class="menu-item" onclick="openBukuPanduan()" title="Lihat Buku Panduan VISPM">
        <span class="material-icons">menu_book</span>
        <span>Buku Panduan</span>
      </div>
    </div>`;

  nav.innerHTML = html;
}

function openBukuPanduan() {
  const PDF_URL = '/Buku_Panduan_VISPM.pdf';

  // Buat modal jika belum ada
  if (!document.getElementById('bukuPanduanModal')) {
    const el = document.createElement('div');
    el.id = 'bukuPanduanModal';
    el.className = 'modal fullscreen';
    // Override posisi agar tidak menutup topbar (60px)
    el.style.cssText = 'top:60px;z-index:999;';
    el.innerHTML = `
      <div class="modal-card" style="display:flex;flex-direction:column;height:calc(100vh - 60px);border-radius:0;">
        <div class="modal-header">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--primary);flex-shrink:0">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
          </svg>
          <h3>Buku Panduan VISPM</h3>
          <div style="display:flex;align-items:center;gap:8px;margin-left:auto">
            <button class="btn-icon" onclick="downloadBukuPanduan()" title="Download Buku Panduan" style="background:transparent;border:none;color:#10b981">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v10"/><path d="m8 9 4 4 4-4"/><path d="M4 17c0 2.2 1.8 4 4 4h8c2.2 0 4-1.8 4-4"/></svg>
            </button>
            <button class="btn-icon" onclick="closeModal('bukuPanduanModal')">
              <span class="material-icons">close</span>
            </button>
          </div>
        </div>
        <div class="modal-body flex-col" style="padding:0;flex:1;min-height:0;">
          <iframe
            src="${PDF_URL}#toolbar=1&navpanes=0"
            style="width:100%;height:100%;border:none;flex:1;"
            title="Buku Panduan VISPM"
          ></iframe>
        </div>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', e => { if (e.target === el) closeModal('bukuPanduanModal'); });
  }

  showModal('bukuPanduanModal');
}

function downloadBukuPanduan() {
  const link = document.createElement('a');
  link.href = '/Buku_Panduan_VISPM.pdf';
  link.download = 'Buku_Panduan_VISPM.pdf';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  toast('Mengunduh Buku Panduan VISPM...', 'success');
}


function setActiveNav(page) {
  document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
  const el = document.getElementById('nav-' + page);
  if (el) el.classList.add('active');
}

// ============== ROUTING ==============
const PAGE_TITLES = {
  dashboard: 'Dashboard', verifikasi: 'Verifikasi', laporan: 'Laporan',
  'master-data': 'Master Data', users: 'Kelola User', jabatan: 'Kelola Jabatan', pkm: 'Kelola Puskesmas',
  indikator: 'Kelola Indikator', periode: 'Periode Input', input: 'Input Usulan',
  'kelola-usulan': 'Kelola Usulan', 'target-tahunan': 'Target Tahunan'
};

function loadPage(page) {
  // === PROTEKSI PERIODE: Cegah akses halaman Input Usulan jika tidak ada periode aktif ===
  if (page === 'input' && currentUser && currentUser.role === 'Operator') {
    const periodeAktif = (window._periodeAktifList || []).filter(p => p.isAktifToday);
    if (periodeAktif.length === 0) {
      showPeriodeTutupBanner();
      return;
    }
  }
  currentPage = page;
  // Simpan halaman terakhir agar bisa di-restore saat refresh
  try { sessionStorage.setItem('spm_last_page', page); } catch(e) {}
  closeSidebar();
  setActiveNav(page);
  document.getElementById('topbarTitle').textContent = PAGE_TITLES[page] || page;
  setLoading(true);

  const role = currentUser.role;
  const renders = {
    dashboard: renderDashboard,
    verifikasi: renderVerifikasi,
    laporan: renderLaporan,
    'kelola-usulan': renderKelolaUsulan,
    jabatan: renderJabatan,
    users: renderUsers,
    pkm: renderPKM,
    'target-tahunan': renderTargetTahunan,
    'master-data': renderMasterData,
    indikator: renderIndikator,
    periode: renderPeriode,
    input: renderInput
  };

  const fn = renders[page];
  if (fn) {
    // 'master-data' mengelola setLoading(true/false) sendiri di dalam renderMasterData,
    // sehingga tidak perlu setLoading(true) ganda dari loadPage — cukup panggil fn() langsung.
    if (page === 'master-data') {
      setLoading(false); // batalkan setLoading(true) di atas, serahkan ke renderMasterData
      Promise.resolve(fn());
    } else {
      Promise.resolve(fn()).finally(() => setLoading(false));
    }
  } else {
    document.getElementById('mainContent').innerHTML = `<div class="empty-state"><span class="material-icons">construction</span><p>Halaman dalam pengembangan</p></div>`;
    setLoading(false);
  }
}

// ============== SIDEBAR MOBILE ==============
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('show');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('show');
}

// ============== HELPER: YEAR SELECT ==============
function yearOptions(selected, maxYear) {
  const max = maxYear || window._appTahunAkhir || window._maxPeriodeTahun || Math.max(CURRENT_YEAR + 3, 2030);
  const min = window._appTahunAwal || Math.min(2024, CURRENT_YEAR);
  let html = '';
  for (let y = min; y <= max; y++) {
    html += `<option value="${y}" ${y == selected ? 'selected' : ''}>${y}</option>`;
  }
  return html;
}
// Generate <option> tahun HANYA dari data yang ada (untuk filter data)
function yearOptionsFromData(rows, selected) {
  const years = [...new Set((rows || []).map(u => parseInt(u.tahun)).filter(Boolean))].sort((a, b) => b - a);
  if (!years.length) {
    const y = selected || CURRENT_YEAR;
    return `<option value="${y}">${y}</option>`;
  }
  return years.map(y => `<option value="${y}" ${y == selected ? 'selected' : ''}>${y}</option>`).join('');
}