import { send } from '../lib/http.js';
import { store } from '../lib/store.js';

// GET /api/health   setup check. Reports which settings are present, never their values.
export default async function handler(req, res) {
  const out = {
    appPasscodeSet: Boolean((process.env.APP_PASSCODE || '').trim()),
    sessionSecretOk: (process.env.SESSION_SECRET || '').length >= 32,
    storage: process.env.STORE === 'memory' ? 'memory' : 'postgres',
    databaseUrlSet: Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL),
    environment: process.env.VERCEL_ENV || 'local',
    databaseReachable: false,
  };
  try { await store.listVisuals(); out.databaseReachable = true; }
  catch (e) { out.databaseError = e.expose ? e.message : 'Could not connect or query. Check the Vercel function logs.'; }
  out.ok = out.appPasscodeSet && out.sessionSecretOk && out.databaseReachable;
  send(res, out.ok ? 200 : 500, out);
}
