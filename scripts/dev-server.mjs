// Local server that mirrors Vercel routing, so you can run the app without the Vercel CLI.
//   npm run dev                       (reads .env.local, then .env)
// Set STORE=memory to run with no database (data is lost when the server stops).
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

for (const f of ['.env.local', '.env']) {
  try {
    const txt = await fs.readFile(path.join(root, f), 'utf8');
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* file not present */ }
}
const port = Number(process.env.PORT || 3000);

const routes = [
  [/^\/api\/session$/, 'api/session.js'],
  [/^\/api\/login$/, 'api/login.js'],
  [/^\/api\/logout$/, 'api/logout.js'],
  [/^\/api\/projects$/, 'api/projects/index.js'],
  [/^\/api\/projects\/([^/]+)$/, 'api/projects/[id].js'],
  [/^\/api\/visuals$/, 'api/visuals/index.js'],
  [/^\/api\/visuals\/([^/]+)$/, 'api/visuals/[id].js'],
];

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  for (const [re, file] of routes) {
    const m = url.pathname.match(re);
    if (m) {
      req.query = Object.fromEntries(url.searchParams);
      if (m[1]) req.query.id = decodeURIComponent(m[1]);
      const mod = await import(pathToFileURL(path.join(root, file)).href);
      return mod.default(req, res);
    }
  }
  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(await fs.readFile(path.join(root, 'index.html')));
  }
  res.statusCode = 404;
  res.end('Not found');
}).listen(port, () => console.log(`Dashboard Template Builder on http://localhost:${port} (store: ${process.env.STORE || 'postgres'})`));
