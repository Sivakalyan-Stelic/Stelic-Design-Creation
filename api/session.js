import { send, methodNotAllowed } from '../lib/http.js';
import { requireUser } from '../lib/auth.js';
import { store } from '../lib/store.js';

// GET /api/session   who is signed in (401 if nobody), plus how long the app waits before saving
export default function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const user = requireUser(req, res);
  if (user) send(res, 200, { user, saveDelay: store.saveDelay || 800 });
}
