import { send, readJson, methodNotAllowed, serverError } from '../../lib/http.js';
import { requireUser } from '../../lib/auth.js';
import { store } from '../../lib/store.js';
import { validateProjectData, validId } from '../../lib/validate.js';

// GET  /api/projects   every project with full data, newest first
// POST /api/projects   create { id, name, data }
export default async function handler(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  try {
    if (req.method === 'GET') return send(res, 200, await store.listProjects());
    if (req.method === 'POST') {
      const body = await readJson(req);
      if (!body) return send(res, 400, { error: 'Invalid JSON' });
      if (!validId(body.id)) return send(res, 400, { error: 'Invalid project id' });
      const v = validateProjectData({ ...body.data, name: body.name ?? body.data?.name });
      if (v.error) return send(res, 400, { error: v.error });
      const row = await store.createProject({ id: body.id, name: v.value.name, data: v.value, user: user.name });
      if (!row) return send(res, 409, { error: 'A project with this id already exists' });
      return send(res, 201, row);
    }
    methodNotAllowed(res, ['GET', 'POST']);
  } catch (e) { serverError(res, e); }
}
