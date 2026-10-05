import { send, methodNotAllowed } from '../lib/http.js';
import { sessionCookie } from '../lib/auth.js';

// POST /api/logout   clears the session cookie
export default function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, '') });
}
