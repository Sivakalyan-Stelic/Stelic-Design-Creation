import { send, readJson, methodNotAllowed, serverError } from '../../lib/http.js';
import { requireUser } from '../../lib/auth.js';
import { store } from '../../lib/store.js';
import { validateProjectData, validId } from '../../lib/validate.js';

function idFrom(req) {
  if (req.query && req.query.id) return String(req.query.id);
  return decodeURIComponent(new URL(req.url, 'http://x').pathname.split('/').pop());
}

// GET    /api/projects/:id
// PUT    /api/projects/:id   { name, data, version }  returns 409 with the current row if version is stale
// DELETE /api/projects/:id
export default async function handler(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  const id = idFrom(req);
  if (!validId(id)) return send(res, 400, { error: 'Invalid project id' });
  try {
    if (req.method === 'GET') {
      const row = await store.getProject(id);
      return row ? send(res, 200, row) : send(res, 404, { error: 'Project not found' });
    }
    if (req.method === 'PUT') {
      const body = await readJson(req);
      if (!body) return send(res, 400, { error: 'Invalid JSON' });
      const version = Number(body.version);
      if (!Number.isInteger(version) || version < 1) return send(res, 400, { error: 'version is required' });
      const v = validateProjectData({ ...body.data, name: body.name ?? body.data?.name });
      if (v.error) return send(res, 400, { error: v.error });
      const row = await store.updateProject({ id, name: v.value.name, data: v.value, version, user: user.name });
      if (row) return send(res, 200, row);
      const current = await store.getProject(id);
      if (!current) return send(res, 404, { error: 'Project not found' });
      return send(res, 409, { error: 'Project was changed by someone else', current });
    }
    if (req.method === 'DELETE') {
      const ok = await store.deleteProject(id);
      return ok ? send(res, 200, { ok: true }) : send(res, 404, { error: 'Project not found' });
    }
    methodNotAllowed(res, ['GET', 'PUT', 'DELETE']);
  } catch (e) { serverError(res, e); }
}
