// netlify/functions/auth.js
// POST /api/auth/login
// GET  /api/auth/me
// POST /api/auth/change-password

import bcrypt from 'bcryptjs';
import { getDb, jsonResponse, errorResponse, parseBody } from './_db.js';
import { signToken, requireAuth, generateRefreshToken, hashRefreshToken } from './_auth.js';
import { logAudit, getReqMeta, checkLoginRateLimit, recordLoginAttempt, clearLoginAttempts, MAX_LOGIN_ATTEMPTS } from './_audit.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse({});

  const sql = getDb();
  const path = event.path.replace(/.*\/auth/, '');

  // ── LOGIN ──────────────────────────────────────────────────
  if (event.httpMethod === 'POST' && path === '/login') {
    const { email, password, lokasi } = parseBody(event);
    if (!email || !password) return errorResponse('Email dan password wajib diisi', 400);

    const emailNorm = email.toLowerCase().trim();
    const { ip } = getReqMeta(event);

    const rateCheck = await checkLoginRateLimit(sql, emailNorm, ip);
    if (!rateCheck.allowed) {
      await logAudit(sql, event, { email: emailNorm, aksi: 'login_blocked', lokasi_client: lokasi });
      return errorResponse('Terlalu banyak percobaan login. Coba lagi dalam 15 menit.', 429);
    }

    try {
      const rows = await sql`
        SELECT u.*, b.nama AS bidang_nama, b.singkatan AS bidang_singkatan
        FROM users u
        LEFT JOIN bidang b ON b.id = u.bidang_id
        WHERE u.email = ${emailNorm} LIMIT 1
      `;
      if (!rows.length) {
        await recordLoginAttempt(sql, emailNorm, ip);
        await logAudit(sql, event, { email: emailNorm, aksi: 'login_failed', detail: { reason: 'email_not_found' }, lokasi_client: lokasi });
        const sisa = Math.max(0, MAX_LOGIN_ATTEMPTS - (rateCheck.count + 1));
        return errorResponse('Email atau password salah', 401, { sisa_percobaan: sisa });
      }

      const user = rows[0];
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        await recordLoginAttempt(sql, emailNorm, ip);
        await logAudit(sql, event, { user_id: user.id, nama: user.nama, email: emailNorm, aksi: 'login_failed', detail: { reason: 'wrong_password' }, lokasi_client: lokasi });
        const sisa = Math.max(0, MAX_LOGIN_ATTEMPTS - (rateCheck.count + 1));
        return errorResponse('Email atau password salah', 401, { sisa_percobaan: sisa });
      }

      await sql`UPDATE users SET last_login = NOW() WHERE id = ${user.id}`;
      await clearLoginAttempts(sql, emailNorm);
      await logAudit(sql, event, { user_id: user.id, nama: user.nama, email: emailNorm, aksi: 'login_success', lokasi_client: lokasi });

      let permissions = [];
      if (!user.is_admin) {
        const perms = await sql`SELECT menu_key FROM user_permissions WHERE user_id = ${user.id}`;
        permissions = perms.map(p => p.menu_key);
      }

      const token = signToken({ id: user.id, email: user.email, nama: user.nama, is_admin: user.is_admin });

      // Refresh token: opaque random string, hash-nya disimpan di DB supaya bisa
      // di-revoke (logout / paksa logout admin / deteksi reuse) tanpa nunggu expired.
      const { token: refreshToken, hash, expires_at } = generateRefreshToken();
      await sql`
        INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
        VALUES (${user.id}, ${hash}, ${expires_at.toISOString()}, ${ip}, ${event.headers['user-agent'] || null})
      `;

      return jsonResponse({
        token,
        refresh_token: refreshToken,
        user: {
          id: user.id, nama: user.nama, email: user.email, is_admin: user.is_admin,
          bidang_id: user.bidang_id, bidang_nama: user.bidang_nama || null,
          bidang_singkatan: user.bidang_singkatan || null, permissions,
        },
      });
    } catch (err) {
      console.error(err);
      return errorResponse('Server error', 500);
    }
  }

  // ── REFRESH — tukar refresh token dengan access token baru (rotasi) ──────
  if (event.httpMethod === 'POST' && path === '/refresh') {
    const { refresh_token } = parseBody(event);
    if (!refresh_token) return errorResponse('Refresh token wajib diisi', 400);
    const { ip } = getReqMeta(event);
    const hash = hashRefreshToken(refresh_token);

    try {
      const rows = await sql`SELECT * FROM refresh_tokens WHERE token_hash = ${hash} LIMIT 1`;
      if (!rows.length) return errorResponse('Refresh token tidak valid', 401);
      const rt = rows[0];

      // Token yang sudah pernah dipakai/revoke tapi dicoba dipakai lagi →
      // indikasi token dicuri/dipakai dobel. Revoke seluruh sesi user demi keamanan.
      if (rt.revoked_at) {
        await sql`UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ${rt.user_id} AND revoked_at IS NULL`;
        await logAudit(sql, event, { user_id: rt.user_id, aksi: 'refresh_token_reuse_detected', detail: { refresh_token_id: rt.id } });
        return errorResponse('Sesi dicurigai bermasalah, silakan login ulang', 401);
      }
      if (new Date(rt.expires_at) < new Date()) {
        return errorResponse('Refresh token kedaluwarsa, silakan login ulang', 401);
      }

      const userRows = await sql`SELECT id, nama, email, is_admin FROM users WHERE id = ${rt.user_id} LIMIT 1`;
      if (!userRows.length) return errorResponse('User tidak ditemukan', 404);
      const user = userRows[0];

      const { token: newRefreshToken, hash: newHash, expires_at } = generateRefreshToken();
      await sql`
        INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
        VALUES (${user.id}, ${newHash}, ${expires_at.toISOString()}, ${ip}, ${event.headers['user-agent'] || null})
      `;
      await sql`UPDATE refresh_tokens SET revoked_at = NOW(), replaced_by = ${newHash} WHERE id = ${rt.id}`;

      const newAccessToken = signToken({ id: user.id, email: user.email, nama: user.nama, is_admin: user.is_admin });
      return jsonResponse({ token: newAccessToken, refresh_token: newRefreshToken });
    } catch (err) {
      console.error('[POST /api/auth/refresh]', err);
      return errorResponse('Server error', 500);
    }
  }

  // ── LOGOUT — revoke refresh token milik sesi ini saja ─────────────────
  if (event.httpMethod === 'POST' && path === '/logout') {
    const { refresh_token } = parseBody(event);
    if (refresh_token) {
      try {
        const hash = hashRefreshToken(refresh_token);
        await sql`UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = ${hash} AND revoked_at IS NULL`;
      } catch (err) { console.error('[POST /api/auth/logout]', err); }
    }
    return jsonResponse({ ok: true });
  }

  // ── LOGOUT-ALL — revoke semua refresh token milik user (semua device) ──
  if (event.httpMethod === 'POST' && path === '/logout-all') {
    const auth = requireAuth(event);
    if (!auth) return errorResponse('Unauthorized', 401);
    try {
      await sql`UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ${auth.id} AND revoked_at IS NULL`;
      await logAudit(sql, event, { user_id: auth.id, nama: auth.nama, email: auth.email, aksi: 'logout_all' });
      return jsonResponse({ ok: true });
    } catch (err) {
      console.error('[POST /api/auth/logout-all]', err);
      return errorResponse('Server error', 500);
    }
  }

  // ── ME ────────────────────────────────────────────────────
  if (event.httpMethod === 'GET' && path === '/me') {
    const auth = requireAuth(event);
    if (!auth) return errorResponse('Unauthorized', 401);
    try {
      const rows = await sql`
        SELECT u.id, u.nama, u.email, u.is_admin, u.bidang_id,
               b.nama AS bidang_nama, b.singkatan AS bidang_singkatan
        FROM users u LEFT JOIN bidang b ON b.id = u.bidang_id
        WHERE u.id = ${auth.id} LIMIT 1
      `;
      if (!rows.length) return errorResponse('User tidak ditemukan', 404);
      const user = rows[0];
      let permissions = [];
      if (!user.is_admin) {
        const perms = await sql`SELECT menu_key FROM user_permissions WHERE user_id = ${user.id}`;
        permissions = perms.map(p => p.menu_key);
      }
      return jsonResponse({ user: { ...user, permissions } });
    } catch (err) {
      console.error(err);
      return errorResponse('Server error', 500);
    }
  }

  // ── CHANGE PASSWORD ──────────────────────────────────────
  if (event.httpMethod === 'POST' && path === '/change-password') {
    const auth = requireAuth(event);
    if (!auth) return errorResponse('Unauthorized', 401);
    const { password_lama, password_baru } = parseBody(event);
    if (!password_lama || !password_baru) return errorResponse('Password lama dan baru wajib diisi', 400);
    if (password_baru.length < 6) return errorResponse('Password baru minimal 6 karakter', 400);
    try {
      const rows = await sql`SELECT password_hash FROM users WHERE id = ${auth.id} LIMIT 1`;
      if (!rows.length) return errorResponse('User tidak ditemukan', 404);
      const valid = await bcrypt.compare(password_lama, rows[0].password_hash);
      if (!valid) return errorResponse('Password lama tidak sesuai', 401);
      const hash = await bcrypt.hash(password_baru, 10);
      await sql`UPDATE users SET password_hash = ${hash} WHERE id = ${auth.id}`;
      // Password berubah → anggap semua sesi lama tidak terpercaya, revoke semua refresh token.
      await sql`UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ${auth.id} AND revoked_at IS NULL`;
      await logAudit(sql, event, { user_id: auth.id, nama: auth.nama, email: auth.email, aksi: 'change_password' });
      return jsonResponse({ ok: true });
    } catch (err) {
      console.error('[POST /api/auth/change-password]', err);
      return errorResponse('Server error', 500);
    }
  }

  return errorResponse('Not found', 404);
};