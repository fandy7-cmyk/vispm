const { Pool, types } = require('pg');

// Paksa pg mengembalikan TIMESTAMP dan TIMESTAMPTZ sebagai string ISO UTC
// tanpa konversi ke JS Date object (yang terpengaruh timezone sistem OS)
// Type OID: 1114 = TIMESTAMP, 1184 = TIMESTAMPTZ
types.setTypeParser(1114, (val) => val ? new Date(val + 'Z').toISOString() : null);
types.setTypeParser(1184, (val) => val ? new Date(val).toISOString() : null);

let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
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

module.exports = { getPool, ok, err, cors };