# Stelic Dashboard Template Builder

PMs use this app to plan what a dashboard should show before Stelic builds it. Projects hold sheets, sheets hold visuals, and everything is saved to a shared Postgres database so the whole team sees the same projects and the same My visuals library.

## What is in this repo

```
index.html               The full app (single file). Talks to /api when hosted.
api/
  health.js              GET    setup check (which settings are present)
  session.js             GET    who is signed in
  login.js               POST   name + access code, sets a session cookie
  logout.js              POST   clears the cookie
  projects/index.js      GET    list projects        POST   create a project
  projects/[id].js       GET    one project          PUT    save (with version check)   DELETE
  visuals/index.js       GET    list custom visuals
  visuals/[id].js        PUT    create or replace    DELETE
lib/
  store.js               All database access. Swap this one file to change databases.
  auth.js                Signed session cookie and access code check
  validate.js            Request validation and size limits
  http.js                Shared response helpers
db/schema.sql            Table definitions (created automatically on first request)
scripts/dev-server.mjs   Local server that mirrors Vercel routing
.env.example             Environment variables to set
```

## How data is stored

Two tables in Postgres (Neon, through the Vercel Marketplace):

| Table | One row per | Main columns |
|---|---|---|
| `projects` | project | `id`, `name`, `data` (JSON: PM name and all sheets with their visuals and positions), `version`, `updated_at`, `updated_by` |
| `visuals` | custom visual in My visuals | `id`, `def` (JSON: type, labels, values, question, data needed), `updated_at`, `updated_by` |

Built-in library visuals live in `index.html` and are not stored.

**Saving.** The app saves automatically about one second after each change. The status next to the project name shows "Saving...", "All changes saved", or an offline message. If the connection drops, changes stay in the page and retry every 10 seconds. The browser warns before closing with unsaved changes.

**Two people editing the same project.** Every save sends the version the person last loaded. If someone else saved in between, the server refuses the write and the app asks: keep my version, or load theirs. Nothing is overwritten silently.

**Freshness.** The project list refreshes each time someone returns to the landing page, and a project reloads its latest version when opened.

## Deploy on Vercel through GitHub

1. **Push to GitHub.** Create a private repository and push this folder.
   ```bash
   git init && git add . && git commit -m "Dashboard Template Builder"
   git branch -M main
   git remote add origin https://github.com/<org>/stelic-dashboard-builder.git
   git push -u origin main
   ```
2. **Import into Vercel.** Vercel dashboard, Add New, Project, pick the repository. Framework preset: **Other**. Leave build and output settings empty. Deploy (the first deploy will show a database error until step 3 is done).
3. **Add the database.** In the Vercel project: Storage, Create Database, choose **Neon** (Postgres), and connect it to this project for Production, Preview, and Development. This adds `DATABASE_URL` automatically.
4. **Add environment variables.** Settings, Environment Variables:
   - `APP_PASSCODE`: the access code staff will type to sign in.
   - `SESSION_SECRET`: a long random string. Generate one with `openssl rand -hex 32`.
5. **Redeploy.** Deployments, latest, Redeploy. The tables are created on the first request. Running `db/schema.sql` in the Neon SQL editor is optional.
6. **Sign in.** Open the site, enter your name and the access code. The name is recorded on each save, so the team can see who changed what.

Every push to `main` now redeploys automatically. Pull requests get preview deployments.

## Run it locally

Without a database (data resets when you stop the server):
```bash
npm install
STORE=memory APP_PASSCODE=test SESSION_SECRET=$(openssl rand -hex 32) npm run dev
# open http://localhost:3000
```

Against the real Neon database:
```bash
npm i -g vercel
vercel link
vercel env pull .env.local     # pulls DATABASE_URL, APP_PASSCODE, SESSION_SECRET
npm run dev                    # or: vercel dev
```

## If sign-in does not work

Open `https://<your-site>/api/health`. It reports which settings the deployment can see, without showing their values:

```json
{ "appPasscodeSet": true, "sessionSecretOk": true, "databaseUrlSet": true, "databaseReachable": true, "environment": "production", "ok": true }
```

| Shows | Fix |
|---|---|
| `appPasscodeSet: false` | Add `APP_PASSCODE` for this environment, then redeploy |
| `sessionSecretOk: false` | `SESSION_SECRET` is missing or under 32 characters. Use `openssl rand -hex 32`, then redeploy |
| `databaseUrlSet: false` | Connect the Neon database to this project (Storage tab) for this environment, then redeploy |
| `databaseReachable: false` | Read `databaseError`, then check Vercel, Logs for the full error |
| `environment: "preview"` | You are on a preview URL. Variables set for Production only do not apply there |

Environment variables only reach new deployments, so redeploy after every change. The sign-in screen also shows the server's error message when something other than the access code is wrong.

## Moving projects from the claude.ai version

Projects made in the claude.ai artifact live in that browser only. For each one: open it there, Export, **Project backup (.json)**. Then in the hosted app, on the landing page, **Import backup**. Custom visuals used in the project come along with it.

## Security notes (read before sharing the link)

- **The access code is shared.** Anyone with the link and the code can read, change, and delete every project. Change the code by updating `APP_PASSCODE` and `SESSION_SECRET` (changing the secret signs everyone out).
- **Better options, in order of effort:**
  - Vercel Deployment Protection (Vercel Authentication), which limits access to people on your Vercel team. Check which deployments your plan covers; on some plans it protects preview deployments only.
  - Microsoft Entra ID sign-in (MSAL) so staff use their Stelic M365 accounts. Only `lib/auth.js` and the sign-in screen would change.
- **Login throttling is basic.** It runs per function instance, so it slows guessing but is not a hard limit. Put the site behind one of the options above before wide use.
- **Client data.** The library uses generic names, but project names typed by PMs may name real clients. Confirm with Stelic leadership or IT that storing those names in Neon (a US cloud database) is acceptable before rollout.
- **Backups.** Check the restore window Neon offers on your plan. Either way, export project backups from the app periodically.

## Changing the database later

Every API route calls `store.*` in `lib/store.js`. To move to Azure SQL, SharePoint, or another store, re-implement those functions with the same inputs and outputs. The API contract and `index.html` stay unchanged.

## Limits

- Request size is capped at about 3.5 MB per save (Vercel allows 4.5 MB). A typical project is under 100 KB.
- 100 sheets per project and 300 visuals per sheet.
- Charts, PDF, and zip export load their libraries from cdnjs, so viewers need internet access.
