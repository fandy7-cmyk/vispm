const { Pool, types } = require('pg');

types.setTypeParser(1114, (val) => val ? new Date(val + 'Z').toISOString() : null);
types.setTypeParser(1184, (val) => val ? new Date(val).toISOString() : null);

let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 1,                  
      idleTimeoutMillis: 1000, 
      connectionTimeoutMillis: 10000,
      allowExitOnIdle: true,   
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