import crypto from 'node:crypto';
import { send } from './http.js';

const COOKIE = 'stelic_session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    const e = new Error('SESSION_SECRET is missing or shorter than 32 characters. Set it in Vercel environment variables.');
    e.expose = true;
    throw e;
  }
  return s;
}

const b64 = (buf) => Buffer.from(buf).toString('base64url');
const sign = (data) => b64(crypto.createHmac('sha256', secret()).update(data).digest());

export function makeToken(user) {
  const payload = b64(JSON.stringify({ n: user.name, exp: Math.floor(Date.now() / 1000) + MAX_AGE }));
  return `${payload}.${sign(payload)}`;
}

export function readToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = sign(payload);
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.exp || data.exp < Date.now() / 1000) return null;
    return { name: String(data.n || 'Unknown').slice(0, 80) };
  } catch { return null; }
}

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function isHttps(req) {
  return (req.headers['x-forwarded-proto'] || '').includes('https') || process.env.VERCEL === '1';
}

export function sessionCookie(req, token) {
  const parts = [`${COOKIE}=${encodeURIComponent(token)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${token ? MAX_AGE : 0}`];
  if (isHttps(req)) parts.push('Secure');
  return parts.join('; ');
}

export function getUser(req) {
  return readToken(parseCookies(req)[COOKIE]);
}

// Returns the user, or sends 401 and returns null.
export function requireUser(req, res) {
  let user = null;
  try { user = getUser(req); } catch (e) { send(res, 500, { error: e.expose ? e.message : 'Server error' }); return null; }
  if (!user) { send(res, 401, { error: 'Sign in required' }); return null; }
  return user;
}

export function checkPasscode(input) {
  const real = process.env.APP_PASSCODE;
  if (!real) {
    const e = new Error('APP_PASSCODE is not set. Add it in Vercel environment variables.');
    e.expose = true;
    throw e;
  }
  const a = crypto.createHash('sha256').update(String(input || '')).digest();
  const b = crypto.createHash('sha256').update(real).digest();
  return crypto.timingSafeEqual(a, b);
}
