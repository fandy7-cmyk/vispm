// ONE-TIME script: fix double .pdf.pdf extension di DB
// DELETE file ini setelah dijalankan!
const { Pool } = require('pg');

exports.handler = async (event) => {
  if (event.queryStringParameters?.secret !== 'vispm2026fix') {
    return { statusCode: 403, body: 'Forbidden' };
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const rows = await pool.query(
      `SELECT id_usulan, no_indikator, link_file FROM indikator_usulan WHERE link_file IS NOT NULL AND link_file != '' AND link_file LIKE '%pdf%'`
    );

    const fixes = [];
    for (const row of rows.rows) {
      let changed = false;
      let links;
      try { links = JSON.parse(row.link_file); if (!Array.isArray(links)) links = null; }
      catch { links = null; }

      if (!links) continue;

      const newLinks = links.map(f => {
        if (!f || !f.url) return f;
        let url = f.url;
        // Fix: .pdf.pdf -> .pdf
        const fixedUrl = url.replace(/\.pdf\.pdf(\?|$)/, '.pdf$1');
        if (fixedUrl !== url) { changed = true; }
        return { ...f, url: fixedUrl };
      });

      if (changed) {
        await pool.query(
          `UPDATE indikator_usulan SET link_file=$1 WHERE id_usulan=$2 AND no_indikator=$3`,
          [JSON.stringify(newLinks), row.id_usulan, row.no_indikator]
        );
        fixes.push(`${row.id_usulan}/${row.no_indikator}`);
      }
    }

    await pool.end();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fixed: fixes.length, rows: fixes })
    };
  } catch (e) {
    await pool.end().catch(() => {});
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
