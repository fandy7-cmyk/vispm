// Netlify function: hapus link_file yang 404/401 dari DB
// Jalankan sekali: /api/fix-dead-links?secret=vispm2026fix
// HAPUS file ini setelah dijalankan

const https = require('https');
const { Pool } = require('pg');

function headRequest(url) {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(url);
      const req = https.request({ hostname: parsed.hostname, port: 443, path: parsed.pathname + parsed.search, method: 'HEAD' }, (res) => {
        res.resume();
        resolve(res.statusCode);
      });
      req.on('error', () => resolve(0));
      req.setTimeout(5000, () => { req.destroy(); resolve(0); });
      req.end();
    } catch { resolve(0); }
  });
}

exports.handler = async (event) => {
  if (event.queryStringParameters?.secret !== 'vispm2026fix') return { statusCode: 403, body: 'Forbidden' };

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const removed = [];

  try {
    const rows = await pool.query(`SELECT id_usulan, no_indikator, link_file FROM indikator_usulan WHERE link_file IS NOT NULL AND link_file != ''`);

    for (const row of rows.rows) {
      let links;
      try { links = JSON.parse(row.link_file); if (!Array.isArray(links)) continue; }
      catch { continue; }

      const validLinks = [];
      for (const f of links) {
        const url = typeof f === 'string' ? f : f?.url;
        if (!url) continue;
        const status = await headRequest(url);
        if (status === 200) {
          validLinks.push(f);
        } else {
          removed.push({ usulan: row.id_usulan, ind: row.no_indikator, url, status });
        }
      }

      if (validLinks.length !== links.length) {
        const newVal = validLinks.length ? JSON.stringify(validLinks) : '';
        await pool.query(`UPDATE indikator_usulan SET link_file=$1 WHERE id_usulan=$2 AND no_indikator=$3`, [newVal, row.id_usulan, row.no_indikator]);
      }
    }

    await pool.end();
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ removed }) };
  } catch (e) {
    await pool.end().catch(() => {});
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
