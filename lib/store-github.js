// GitHub storage backend. Each project and each custom visual is one JSON file in a
// GitHub repository, written through the GitHub REST API with the file's SHA, so two
// people saving at once cannot silently overwrite each other.
//
//   data/projects/<id>.json   { id, name, data, version, created_*, updated_* }
//   data/visuals/<id>.json    { id, def, updated_at, updated_by }
//
// Listing uses one GraphQL request that returns every file in a folder.

const API = (process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, '');
const MAX_FILE = 900_000; // GitHub's contents API returns file bodies inline only up to 1 MB

function expose(message) { const e = new Error(message); e.expose = true; return e; }

export function githubConfig() {
  const token = (process.env.GITHUB_TOKEN || '').trim();
  const repo = (process.env.GITHUB_REPO || '').trim();
  if (!token || !/^[^/\s]+\/[^/\s]+$/.test(repo)) {
    throw expose('GitHub storage needs GITHUB_TOKEN and GITHUB_REPO (written as owner/repo-name) in Vercel environment variables.');
  }
  const branch = (process.env.GITHUB_BRANCH || 'main').trim();
  const base = (process.env.GITHUB_DATA_PATH || 'data').trim().replace(/^\/+|\/+$/g, '');
  // Guard: saving into the branch Vercel deploys from would redeploy the site on every save.
  const codeRepo = process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG
    ? `${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}` : '';
  if (codeRepo && codeRepo.toLowerCase() === repo.toLowerCase() && branch === process.env.VERCEL_GIT_COMMIT_REF) {
    throw expose(`GITHUB_REPO and GITHUB_BRANCH point at the code branch Vercel deploys from (${repo}, ${branch}). Every save would redeploy the site. Use a separate data repository, or set GITHUB_BRANCH=data.`);
  }
  return { token, repo, branch, base };
}

async function gh(method, path, body) {
  const c = githubConfig();
  let r;
  try {
    r = await fetch(API + path, {
      method,
      headers: {
        Authorization: `Bearer ${c.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'stelic-dashboard-builder',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw expose('Could not reach GitHub. Try again in a moment.');
  }
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  return { status: r.status, body: json, headers: r.headers };
}

function ghError(res, doing) {
  const c = githubConfig();
  const msg = res.body && res.body.message ? res.body.message : '';
  if (res.status === 401) return expose('GitHub rejected the token (401). Check GITHUB_TOKEN, and that it has not expired.');
  if (res.status === 403 && /rate limit/i.test(msg)) return expose('GitHub rate limit reached for this token. Saving resumes automatically within the hour.');
  if (res.status === 403) return expose(`GitHub refused access (403). The token needs Contents: Read and write on ${c.repo}.`);
  if (res.status === 404) return expose(`GitHub could not find ${c.repo} or branch "${c.branch}" (404). Check GITHUB_REPO and GITHUB_BRANCH, and that the token can access the repo.`);
  return expose(`GitHub error ${res.status} while ${doing}${msg ? ': ' + msg : ''}`);
}

const encPath = (p) => p.split('/').map(encodeURIComponent).join('/');
const fileOf = (kind, id) => `${githubConfig().base}/${kind}/${id}.json`;
const toB64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const fromB64 = (s) => Buffer.from(s || '', 'base64').toString('utf8');
const nowIso = () => new Date().toISOString();

async function readFile(path) {
  const c = githubConfig();
  const r = await gh('GET', `/repos/${c.repo}/contents/${encPath(path)}?ref=${encodeURIComponent(c.branch)}`);
  if (r.status === 404) return null;
  if (r.status !== 200) throw ghError(r, 'reading ' + path);
  if (!r.body.content && r.body.size > 0) throw expose(`${path} is larger than 1 MB, which GitHub storage cannot read back.`);
  return { sha: r.body.sha, json: JSON.parse(fromB64(r.body.content) || 'null') };
}

// Returns 'ok' or 'conflict'. Throws on other failures.
async function writeFile(path, obj, sha, message) {
  const c = githubConfig();
  const text = JSON.stringify(obj, null, 2) + '\n';
  if (text.length > MAX_FILE) throw expose('This project is too large for GitHub storage (about 900 KB per project). Split it into two projects.');
  const r = await gh('PUT', `/repos/${c.repo}/contents/${encPath(path)}`, {
    message, content: toB64(text), branch: c.branch, ...(sha ? { sha } : {}),
  });
  if (r.status === 200 || r.status === 201) return 'ok';
  if (r.status === 409 || r.status === 422) return 'conflict'; // stale SHA, or file already exists
  throw ghError(r, 'saving ' + path);
}

async function deleteFile(path, sha, message) {
  const c = githubConfig();
  const r = await gh('DELETE', `/repos/${c.repo}/contents/${encPath(path)}`, { message, sha, branch: c.branch });
  if (r.status === 200) return 'ok';
  if (r.status === 404) return 'missing';
  if (r.status === 409 || r.status === 422) return 'conflict';
  throw ghError(r, 'deleting ' + path);
}

async function listFolder(kind) {
  const c = githubConfig();
  const [owner, name] = c.repo.split('/');
  const query = `query($owner:String!,$name:String!,$expr:String!){
    repository(owner:$owner,name:$name){ object(expression:$expr){ ... on Tree { entries { name object { ... on Blob { text isTruncated } } } } } } }`;
  const r = await gh('POST', '/graphql', { query, variables: { owner, name, expr: `${c.branch}:${c.base}/${kind}` } });
  if (r.status !== 200) throw ghError(r, 'listing ' + kind);
  if (r.body && r.body.errors && !(r.body.data && r.body.data.repository)) {
    throw expose(`GitHub could not open ${c.repo}. Check GITHUB_REPO and that the token can access it. (${r.body.errors[0].message})`);
  }
  const tree = r.body.data.repository && r.body.data.repository.object;
  if (!tree || !tree.entries) return []; // folder not created yet
  const out = [];
  for (const e of tree.entries) {
    if (!e.name.endsWith('.json') || !e.object) continue;
    try {
      if (e.object.isTruncated) { const f = await readFile(`${c.base}/${kind}/${e.name}`); if (f) out.push(f.json); }
      else out.push(JSON.parse(e.object.text));
    } catch { /* skip a damaged file rather than failing the whole list */ }
  }
  return out;
}

const rowOf = (p) => ({ id: p.id, name: p.name, data: p.data, version: p.version, updated_at: p.updated_at, updated_by: p.updated_by });

export const githubStore = {
  saveDelay: 4000, // fewer commits: the app waits for a 4 second pause in editing before saving

  async listProjects() {
    const all = await listFolder('projects');
    return all.filter((p) => p && p.id).map(rowOf).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  },
  async getProject(id) {
    const f = await readFile(fileOf('projects', id));
    return f ? rowOf(f.json) : null;
  },
  async createProject({ id, name, data, user }) {
    const t = nowIso();
    const row = { id, name, data, version: 1, created_at: t, created_by: user, updated_at: t, updated_by: user };
    const r = await writeFile(fileOf('projects', id), row, null, `Create project "${name}" (${user})`);
    return r === 'ok' ? { id, version: 1, updated_at: t } : null;
  },
  async updateProject({ id, name, data, version, user }) {
    const f = await readFile(fileOf('projects', id));
    if (!f || f.json.version !== version) return null;
    const t = nowIso();
    const next = { ...f.json, name, data, version: version + 1, updated_at: t, updated_by: user };
    const r = await writeFile(fileOf('projects', id), next, f.sha, `Update "${name}" (${user})`);
    return r === 'ok' ? { id, version: next.version, updated_at: t } : null;
  },
  async deleteProject(id) {
    for (let i = 0; i < 2; i++) {
      const f = await readFile(fileOf('projects', id));
      if (!f) return false;
      const r = await deleteFile(fileOf('projects', id), f.sha, `Delete project "${f.json.name}"`);
      if (r !== 'conflict') return r === 'ok';
    }
    throw expose('The project changed while deleting. Try again.');
  },
  async listVisuals() {
    const all = await listFolder('visuals');
    return all.filter((v) => v && v.id && v.def).sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at)));
  },
  async upsertVisual({ id, def, user }) {
    for (let i = 0; i < 2; i++) {
      const f = await readFile(fileOf('visuals', id));
      const t = nowIso();
      const r = await writeFile(fileOf('visuals', id), { id, def, updated_at: t, updated_by: user }, f && f.sha, `Save visual "${def.name}" (${user})`);
      if (r === 'ok') return { id, updated_at: t };
    }
    throw expose('The visual changed while saving. Try again.');
  },
  async deleteVisual(id) {
    for (let i = 0; i < 2; i++) {
      const f = await readFile(fileOf('visuals', id));
      if (!f) return false;
      const r = await deleteFile(fileOf('visuals', id), f.sha, `Delete visual "${f.json.def && f.json.def.name}"`);
      if (r !== 'conflict') return r === 'ok';
    }
    throw expose('The visual changed while deleting. Try again.');
  },
};
