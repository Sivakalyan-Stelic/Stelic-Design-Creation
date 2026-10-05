import { send, readJson, methodNotAllowed, serverError } from '../../lib/http.js';
import { requireUser } from '../../lib/auth.js';
import { store } from '../../lib/store.js';
import { validId } from '../../lib/validate.js';

function idFrom(req) {
  if (req.query && req.query.id) return String(req.query.id);
  return decodeURIComponent(new URL(req.url, 'http://x').pathname.split('/').pop());
}

// PUT    /api/visuals/:id   { def }  create or replace
// DELETE /api/visuals/:id
export default async function handler(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  const id = idFrom(req);
  if (!validId(id)) return send(res, 400, { error: 'Invalid visual id' });
  try {
    if (req.method === 'PUT') {
      const body = await readJson(req);
      const def = body && body.def;
      if (!def || typeof def !== 'object' || def.id !== id || !def.name || !def.type) return send(res, 400, { error: 'Invalid visual definition' });
      if (JSON.stringify(def).length > 500_000) return send(res, 400, { error: 'Visual is too large' });
      return send(res, 200, await store.upsertVisual({ id, def, user: user.name }));
    }
    if (req.method === 'DELETE') {
      const ok = await store.deleteVisual(id);
      return ok ? send(res, 200, { ok: true }) : send(res, 404, { error: 'Visual not found' });
    }
    methodNotAllowed(res, ['PUT', 'DELETE']);
  } catch (e) { serverError(res, e); }
}
