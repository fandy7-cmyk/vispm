// netlify/functions/_auth.js
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  // Jangan biarkan server jalan dengan secret tebakan/hardcoded.
  // Set env var JWT_SECRET di Netlify Dashboard → Site settings → Environment variables.
  throw new Error('JWT_SECRET env var belum di-set!');
}

// Access token sekarang pendek (1 jam) — kalau dicuri/bocor, jendela pakainya kecil.
// Sesi panjang dipertahankan lewat refresh token (lihat generateRefreshToken di bawah),
// yang juga bisa di-revoke server-side (blacklist) — beda dari access token JWT biasa
// yang sifatnya stateless dan tidak bisa "dicabut" sebelum expired.
const ACCESS_TOKEN_TTL = '1h';
const REFRESH_TOKEN_TTL_MS = 8 * 60 * 60 * 1000; // 8 jam, menyamai durasi sesi lama

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

export function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

export function getTokenFromEvent(event) {
  const auth = event.headers?.authorization || event.headers?.Authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

export function requireAuth(event) {
  const token = getTokenFromEvent(event);
  if (!token) return null;
  return verifyToken(token);
}

export function requireAdmin(event) {
  const user = requireAuth(event);
  if (!user || !user.is_admin) return null;
  return user;
}

// ── Refresh token (opaque random string, disimpan ter-hash di DB) ─────────
// Tidak pakai JWT untuk refresh token karena kita butuh bisa revoke/blacklist
// sewaktu-waktu (logout, paksa logout oleh admin, deteksi reuse/pencurian token).
export function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateRefreshToken() {
  const token = crypto.randomBytes(40).toString('hex');
  const hash = hashRefreshToken(token);
  const expires_at = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
  return { token, hash, expires_at };
}