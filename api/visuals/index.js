import { send, methodNotAllowed, serverError } from '../../lib/http.js';
import { requireUser } from '../../lib/auth.js';
import { store } from '../../lib/store.js';

// GET /api/visuals   every custom visual in the shared My visuals library
export default async function handler(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  try { send(res, 200, await store.listVisuals()); } catch (e) { serverError(res, e); }
}
