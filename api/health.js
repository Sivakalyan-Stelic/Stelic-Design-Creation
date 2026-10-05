import { send } from '../lib/http.js';
import { store, storeKind } from '../lib/store.js';

// GET /api/health   setup check. Reports which settings are present, never their values.
export default async function handler(req, res) {
  const out = {
    appPasscodeSet: Boolean((process.env.APP_PASSCODE || '').trim()),
    sessionSecretOk: (process.env.SESSION_SECRET || '').trim().length >= 32,
    storage: storeKind,
    environment: process.env.VERCEL_ENV || 'local',
  };
  if (storeKind === 'github') {
    out.githubTokenSet = Boolean((process.env.GITHUB_TOKEN || '').trim());
    out.githubRepo = (process.env.GITHUB_REPO || '').trim() || null;
    out.githubBranch = (process.env.GITHUB_BRANCH || 'main').trim();
    out.githubDataPath = (process.env.GITHUB_DATA_PATH || 'data').trim();
  } else if (storeKind === 'postgres') {
    out.databaseUrlSet = Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
  }
  out.storageReachable = false;
  try { await store.listVisuals(); out.storageReachable = true; }
  catch (e) { out.storageError = e.expose ? e.message : 'Could not reach storage. Check the Vercel function logs.'; }
  out.ok = out.appPasscodeSet && out.sessionSecretOk && out.storageReachable;
  send(res, out.ok ? 200 : 500, out);
}
