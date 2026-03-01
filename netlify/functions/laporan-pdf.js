const { getPool, cors } = require('./db');
const PDFDocument = require('pdfkit');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();

  const params = event.queryStringParameters || {};
  const idUsulan = params.id;
  if (!idUsulan) return { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*' }, body: 'ID diperlukan' };

  const pool = getPool();
  try {
    const hdrResult = await pool.query(
      `SELECT uh.*, p.nama_puskesmas FROM usulan_header uh
       LEFT JOIN master_puskesmas p ON uh.kode_pkm = p.kode_pkm
       WHERE uh.id_usulan = $1`, [idUsulan]
    );
    if (hdrResult.rows.length === 0) return { statusCode: 404, body: 'Tidak ditemukan' };
    const h = hdrResult.rows[0];

    const indResult = await pool.query(
      `SELECT ui.*, mi.nama_indikator FROM usulan_indikator ui
       LEFT JOIN master_indikator mi ON ui.no_indikator = mi.no_indikator
       WHERE ui.id_usulan = $1 ORDER BY ui.no_indikator`, [idUsulan]
    );

    const vpResult = await pool.query(
      `SELECT * FROM verifikasi_program WHERE id_usulan = $1 ORDER BY created_at`, [idUsulan]
    );

    const bulanNama = ['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    const bulan = bulanNama[h.bulan] || h.bulan;
    const indeksSPM = parseFloat(h.indeks_spm) || 0;
    const now = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });

    // ===== GENERATE PDF =====
    const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: `Laporan SPM ${idUsulan}`, Author: 'VISPM' } });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));

    // Helper colors
    const PRIMARY = '#0d9488';
    const DARK = '#0f172a';
    const GRAY = '#64748b';
    const LIGHT = '#f8fafc';

    const hexToRgb = (hex) => {
      const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
      return [r, g, b];
    };

    // ===== HEADER =====
    doc.rect(0, 0, 595, 90).fill(DARK);
    doc.fillColor('white').fontSize(18).font('Helvetica-Bold')
       .text('LAPORAN VERIFIKASI INDEKS SPM', 40, 20);
    doc.fontSize(11).font('Helvetica')
       .text(`${h.nama_puskesmas || h.kode_pkm}  —  ${bulan} ${h.tahun}`, 40, 46);
    doc.fontSize(9).fillColor('#94a3b8')
       .text(`ID: ${idUsulan}  |  Dicetak: ${now}`, 40, 66);

    // ===== SPM SCORE BOX =====
    const spmColor = indeksSPM >= 1 ? '#0d9488' : indeksSPM >= 0.75 ? '#f59e0b' : '#ef4444';
    const spmLabel = indeksSPM >= 1 ? 'MEMENUHI TARGET' : indeksSPM >= 0.75 ? 'MENDEKATI TARGET' : 'DI BAWAH TARGET';
    doc.rect(40, 105, 515, 70).fill(LIGHT);
    doc.rect(40, 105, 4, 70).fill(spmColor);
    doc.fillColor(spmColor).fontSize(32).font('Helvetica-Bold')
       .text(indeksSPM.toFixed(4), 55, 115);
    doc.fillColor(DARK).fontSize(11).font('Helvetica-Bold')
       .text('INDEKS SPM', 55, 148);
    doc.fillColor(spmColor).fontSize(10).font('Helvetica-Bold')
       .text(spmLabel, 200, 130);

    // Info grid kanan
    const infoX = 350;
    doc.fillColor(GRAY).fontSize(8).font('Helvetica')
       .text('Operator:', infoX, 112).text('Status:', infoX, 128)
       .text('Kapus:', infoX, 144).text('Admin:', infoX, 160);
    doc.fillColor(DARK).fontSize(8).font('Helvetica-Bold')
       .text(h.created_by || '-', infoX + 55, 112)
       .text(h.status_global || '-', infoX + 55, 128)
       .text(h.kapus_approved_by || 'Belum', infoX + 55, 144)
       .text(h.admin_approved_by || 'Belum', infoX + 55, 160);

    // ===== TABEL INDIKATOR =====
    doc.moveDown(0.5);
    let y = 190;

    // Header tabel
    doc.rect(40, y, 515, 20).fill(PRIMARY);
    doc.fillColor('white').fontSize(8).font('Helvetica-Bold');
    doc.text('No', 44, y + 6, { width: 20, align: 'center' });
    doc.text('Nama Indikator', 66, y + 6, { width: 200 });
    doc.text('Target', 268, y + 6, { width: 45, align: 'center' });
    doc.text('Capaian', 315, y + 6, { width: 45, align: 'center' });
    doc.text('Rasio%', 362, y + 6, { width: 50, align: 'center' });
    doc.text('Bobot', 414, y + 6, { width: 40, align: 'center' });
    doc.text('Nilai', 456, y + 6, { width: 50, align: 'center' });
    doc.text('Bukti', 508, y + 6, { width: 45, align: 'center' });
    y += 20;

    let totalBobot = 0, totalNilai = 0;
    indResult.rows.forEach((ind, i) => {
      const rasio = parseFloat(ind.realisasi_rasio) || 0;
      const nilai = parseFloat(ind.nilai_terbobot) || 0;
      const bobot = parseInt(ind.bobot) || 0;
      totalBobot += bobot;
      totalNilai += nilai;

      const rowH = 22;
      const bg = i % 2 === 0 ? '#f8fafc' : '#ffffff';
      doc.rect(40, y, 515, rowH).fill(bg);

      const rColor = rasio >= 1 ? '#0d9488' : rasio >= 0.75 ? '#f59e0b' : '#ef4444';
      doc.fillColor(DARK).fontSize(7.5).font('Helvetica');
      doc.text(String(ind.no_indikator), 44, y + 7, { width: 20, align: 'center' });
      doc.text((ind.nama_indikator || '').substring(0, 52), 66, y + 7, { width: 198 });
      doc.text(String(parseFloat(ind.target)||0), 268, y + 7, { width: 45, align: 'center' });
      doc.text(String(parseFloat(ind.capaian)||0), 315, y + 7, { width: 45, align: 'center' });
      doc.fillColor(rColor).font('Helvetica-Bold')
         .text((rasio * 100).toFixed(1) + '%', 362, y + 7, { width: 50, align: 'center' });
      doc.fillColor(DARK).font('Helvetica')
         .text(String(bobot), 414, y + 7, { width: 40, align: 'center' });
      doc.fillColor(PRIMARY).font('Helvetica-Bold')
         .text(nilai.toFixed(2), 456, y + 7, { width: 50, align: 'center' });
      doc.fillColor(ind.link_file ? PRIMARY : '#94a3b8').font('Helvetica')
         .text(ind.link_file ? '✓' : '-', 508, y + 7, { width: 45, align: 'center' });

      // Border baris
      doc.rect(40, y, 515, rowH).stroke('#e2e8f0');
      y += rowH;
    });

    // Footer tabel
    doc.rect(40, y, 515, 20).fill(DARK);
    doc.fillColor('white').fontSize(8).font('Helvetica-Bold');
    doc.text('TOTAL', 44, y + 6, { width: 316 });
    doc.text(String(totalBobot), 414, y + 6, { width: 40, align: 'center' });
    doc.fillColor('#5eead4').text(totalNilai.toFixed(2), 456, y + 6, { width: 50, align: 'center' });
    y += 26;

    // ===== VERIFIKASI PROGRAM =====
    if (vpResult.rows.length > 0) {
      if (y > 680) { doc.addPage(); y = 40; }
      doc.fillColor(DARK).fontSize(10).font('Helvetica-Bold').text('Verifikasi Pengelola Program', 40, y);
      y += 14;
      vpResult.rows.forEach(vp => {
        if (y > 750) { doc.addPage(); y = 40; }
        const vpColor = vp.status === 'Selesai' ? '#0d9488' : vp.status === 'Ditolak' ? '#ef4444' : '#94a3b8';
        doc.rect(40, y, 515, 18).fill(vp.status === 'Selesai' ? '#e6fffa' : '#f8fafc').stroke('#e2e8f0');
        doc.fillColor(vpColor).fontSize(7.5).font('Helvetica-Bold')
           .text(`[${vp.status}]`, 44, y + 5, { width: 55 });
        doc.fillColor(DARK).font('Helvetica')
           .text(vp.nama_program || vp.email_program, 102, y + 5, { width: 250 });
        doc.fillColor(GRAY)
           .text(`Ind: ${vp.indikator_akses || 'Semua'}`, 355, y + 5, { width: 150 });
        y += 18;
      });
      y += 6;
    }

    // ===== FOOTER =====
    if (y > 760) { doc.addPage(); y = 40; }
    doc.rect(40, y, 515, 1).fill('#e2e8f0');
    y += 6;
    doc.fillColor(GRAY).fontSize(8).font('Helvetica')
       .text('SPM Puskesmas — Sistem Penilaian Mutu', 40, y)
       .text(`${idUsulan} | ${now}`, 40, y, { align: 'right', width: 515 });

    doc.end();

    // Tunggu PDF selesai di-generate
    const pdfBuffer = await new Promise((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Laporan_SPM_${idUsulan}.pdf"`,
        'Access-Control-Allow-Origin': '*',
        'Content-Length': String(pdfBuffer.length)
      },
      body: pdfBuffer.toString('base64'),
      isBase64Encoded: true
    };

  } catch (e) {
    console.error('Laporan PDF error:', e);
    return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: e.message }) };
  }
};
