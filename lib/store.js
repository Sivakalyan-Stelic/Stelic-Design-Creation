// Storage layer. Every API route goes through these functions, so the database can be
// swapped later (Azure SQL, SharePoint, and so on) by replacing this one file.
//
// Backends, chosen by STORE (or automatically):
//   github:   JSON files in a GitHub repository (lib/store-github.js). Used when GITHUB_TOKEN is set.
//   postgres: Neon serverless driver, reads DATABASE_URL or POSTGRES_URL
//   memory:   in-process only, for local development. Data is lost on restart.

import { githubStore } from './store-github.js';

export const storeKind = (process.env.STORE || (process.env.GITHUB_TOKEN ? 'github' : 'postgres')).trim().toLowerCase();

/* ---------------- Postgres ---------------- */
let sqlClient = null;
let schemaReady = null;

async function sql() {
  if (!sqlClient) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) {
      const e = new Error('No storage configured. For GitHub storage set GITHUB_TOKEN and GITHUB_REPO. For Postgres connect a Neon database so DATABASE_URL is set.');
      e.expose = true;
      throw e;
    }
    const { neon } = await import('@neondatabase/serverless'); // loaded only when Postgres is used
    sqlClient = neon(url);
  }
  return sqlClient;
}

async function ensureSchema() {
  if (!schemaReady) {
    const q = await sql();
    schemaReady = (async () => {
      await q`CREATE TABLE IF NOT EXISTS projects (
        id text PRIMARY KEY, name text NOT NULL, data jsonb NOT NULL,
        version integer NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT now(), created_by text,
        updated_at timestamptz NOT NULL DEFAULT now(), updated_by text)`;
      await q`CREATE TABLE IF NOT EXISTS visuals (
        id text PRIMARY KEY, def jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(), updated_by text)`;
      await q`CREATE INDEX IF NOT EXISTS projects_updated_at_idx ON projects (updated_at DESC)`;
    })().catch((e) => { schemaReady = null; throw e; });
  }
  return schemaReady;
}

const pg = {
  saveDelay: 800,
  async listProjects() {
    await ensureSchema();
    return (await sql())`SELECT id, name, data, version, updated_at, updated_by FROM projects ORDER BY updated_at DESC`;
  },
  async getProject(id) {
    await ensureSchema();
    const rows = await (await sql())`SELECT id, name, data, version, updated_at, updated_by FROM projects WHERE id = ${id}`;
    return rows[0] || null;
  },
  async createProject({ id, name, data, user }) {
    await ensureSchema();
    const rows = await (await sql())`
      INSERT INTO projects (id, name, data, created_by, updated_by)
      VALUES (${id}, ${name}, ${JSON.stringify(data)}::jsonb, ${user}, ${user})
      ON CONFLICT (id) DO NOTHING
      RETURNING id, version, updated_at`;
    return rows[0] || null; // null means the id already exists
  },
  // Optimistic concurrency: writes only when the caller saw the latest version.
  async updateProject({ id, name, data, version, user }) {
    await ensureSchema();
    const rows = await (await sql())`
      UPDATE projects
      SET name = ${name}, data = ${JSON.stringify(data)}::jsonb, version = version + 1,
          updated_at = now(), updated_by = ${user}
      WHERE id = ${id} AND version = ${version}
      RETURNING id, version, updated_at`;
    return rows[0] || null;
  },
  async deleteProject(id) {
    await ensureSchema();
    const rows = await (await sql())`DELETE FROM projects WHERE id = ${id} RETURNING id`;
    return rows.length > 0;
  },
  async listVisuals() {
    await ensureSchema();
    return (await sql())`SELECT id, def, updated_at, updated_by FROM visuals ORDER BY updated_at`;
  },
  async upsertVisual({ id, def, user }) {
    await ensureSchema();
    const rows = await (await sql())`
      INSERT INTO visuals (id, def, updated_by) VALUES (${id}, ${JSON.stringify(def)}::jsonb, ${user})
      ON CONFLICT (id) DO UPDATE SET def = EXCLUDED.def, updated_at = now(), updated_by = EXCLUDED.updated_by
      RETURNING id, updated_at`;
    return rows[0];
  },
  async deleteVisual(id) {
    await ensureSchema();
    const rows = await (await sql())`DELETE FROM visuals WHERE id = ${id} RETURNING id`;
    return rows.length > 0;
  },
};

/* ---------------- Memory (local dev) ---------------- */
const mem = { projects: new Map(), visuals: new Map() };
const now = () => new Date().toISOString();
const copy = (x) => JSON.parse(JSON.stringify(x));

const memory = {
  saveDelay: 800,
  async listProjects() {
    return [...mem.projects.values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).map(copy);
  },
  async getProject(id) { const p = mem.projects.get(id); return p ? copy(p) : null; },
  async createProject({ id, name, data, user }) {
    if (mem.projects.has(id)) return null;
    const row = { id, name, data: copy(data), version: 1, updated_at: now(), updated_by: user };
    mem.projects.set(id, row);
    return { id, version: 1, updated_at: row.updated_at };
  },
  async updateProject({ id, name, data, version, user }) {
    const p = mem.projects.get(id);
    if (!p || p.version !== version) return null;
    Object.assign(p, { name, data: copy(data), version: p.version + 1, updated_at: now(), updated_by: user });
    return { id, version: p.version, updated_at: p.updated_at };
  },
  async deleteProject(id) { return mem.projects.delete(id); },
  async listVisuals() { return [...mem.visuals.values()].map(copy); },
  async upsertVisual({ id, def, user }) {
    const row = { id, def: copy(def), updated_at: now(), updated_by: user };
    mem.visuals.set(id, row);
    return { id, updated_at: row.updated_at };
  },
  async deleteVisual(id) { return mem.visuals.delete(id); },
};

export const store = storeKind === 'memory' ? memory : storeKind === 'github' ? githubStore : pg;
