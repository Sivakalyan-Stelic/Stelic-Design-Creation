// Small helpers so handlers work on Vercel and in the local dev server.
export const MAX_BODY = 3_500_000;          // stays under Vercel's 4.5 MB request limit
export const ID_RE = /^[A-Za-z0-9_-]{4,64}$/;

export function send(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(body === undefined ? '' : JSON.stringify(body));
}

export async function readJson(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') { try { return JSON.parse(req.body || '{}'); } catch { return null; } }
    if (Buffer.isBuffer(req.body)) { try { return JSON.parse(req.body.toString('utf8') || '{}'); } catch { return null; } }
    return req.body;
  }
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) return null;
    chunks.push(c);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return null; }
}

export function methodNotAllowed(res, allowed) {
  send(res, 405, { error: 'Method not allowed' }, { Allow: allowed.join(', ') });
}

export function serverError(res, err) {
  console.error(err);
  send(res, 500, { error: err && err.expose ? err.message : 'Server error' });
}
