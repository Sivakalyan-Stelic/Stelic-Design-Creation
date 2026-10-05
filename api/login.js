import { send, readJson, methodNotAllowed, serverError } from '../lib/http.js';
import { checkPasscode, makeToken, sessionCookie } from '../lib/auth.js';

// Basic brute-force brake. Per function instance only, so it slows guessing
// rather than guaranteeing a hard limit. See README for stronger options.
const attempts = new Map();
function limited(ip) {
  const t = Date.now(), win = 60_000, max = 10;
  const list = (attempts.get(ip) || []).filter((x) => t - x < win);
  list.push(t);
  attempts.set(ip, list);
  return list.length > max;
}

// POST /api/login   { name, passcode }  sets the session cookie
export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  try {
    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
    if (limited(ip)) return send(res, 429, { error: 'Too many attempts' });
    const body = await readJson(req);
    const name = String(body?.name || '').trim().slice(0, 80);
    if (!name) return send(res, 400, { error: 'Name is required' });
    if (!checkPasscode(body?.passcode)) return send(res, 401, { error: 'Wrong access code' });
    const user = { name };
    send(res, 200, { user }, { 'Set-Cookie': sessionCookie(req, makeToken(user)) });
  } catch (e) { serverError(res, e); }
}
