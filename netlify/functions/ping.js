const { getPool, ok, err, cors } = require('./db');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();
  try {
    const pool = getPool();
    await pool.query('SELECT 1');
    return ok({ status: 'ok', ts: new Date().toISOString() });
  } catch (e) {
    return err('DB error: ' + e.message, 500);
  }
};