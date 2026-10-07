const { Pool, types } = require('pg');

types.setTypeParser(1114, (val) => val ? new Date(val + 'Z').toISOString() : null);
types.setTypeParser(1184, (val) => val ? new Date(val).toISOString() : null);

let pool;

// Hanya berlaku saat `netlify dev` (NETLIFY_DEV di-set CLI). Dari lokal ke Neon koneksi
// baru kadang macet >10 detik ("timeout exceeded when trying to connect"), padahal
// request lain di detik yang sama lancar. Production tidak berubah sama sekali.
const IS_DEV = !!process.env.NETLIFY_DEV;
const isConnTimeout = (e) => /timeout exceeded when trying to connect/i.test(e?.message || '');

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: IS_DEV ? 4 : 1,     // dev: `netlify dev` menjalankan request paralel di 1 proses; max:1 bikin saling antre & timeout
      idleTimeoutMillis: IS_DEV ? 30000 : 1000, // dev: koneksi dipakai ulang, tidak buka koneksi baru tiap request
      connectionTimeoutMillis: 10000,
      allowExitOnIdle: true,   
    });
    if (IS_DEV) {
      // Gagal konek = query belum pernah terkirim, jadi aman diulang sekali (koneksi baru).
      const rawQuery = pool.query.bind(pool);
      pool.query = async (...args) => {
        try {
          return await rawQuery(...args);
        } catch (e) {
          if (!isConnTimeout(e)) throw e;
          console.warn('[db] timeout konek ke database, mencoba lagi sekali...');
          return rawQuery(...args);
        }
      };
    }
  }
  return pool;
}

function ok(data) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ success: true, data })
  };
}

function err(message, code = 400) {
  return {
    statusCode: code,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ success: false, message })
  };
}

function conflict(message) {
  return {
    statusCode: 409,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ success: false, message })
  };
}

function confirm(data) {
  return {
    statusCode: 202,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ success: false, needConfirm: true, ...data })
  };
}

function cors() {
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
    },
    body: ''
  };
}

module.exports = { getPool, ok, err, conflict, confirm, cors };