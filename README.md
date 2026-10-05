# Stelic Dashboard Template Builder

PMs use this app to plan what a dashboard should show before Stelic builds it. Projects hold sheets, sheets hold visuals, and everything is saved centrally so the whole team sees the same projects and the same My visuals library.

Storage is a **GitHub repository** by default: each project and each custom visual is one JSON file. Postgres (Neon) is still supported if you switch later.

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
  store.js               Picks the storage backend. Postgres and in-memory backends live here.
  store-github.js        GitHub backend (REST for single files, one GraphQL call for lists)
  auth.js                Signed session cookie and access code check
  validate.js            Request validation and size limits
  http.js                Shared response helpers
db/schema.sql            Postgres tables (only if you use Postgres)
scripts/dev-server.mjs   Local server that mirrors Vercel routing
.env.example             Every environment variable, explained
```

## How data is stored in GitHub

```
data/
  projects/<project-id>.json   name, PM, every sheet with its visuals and positions, version, who and when
  visuals/<visual-id>.json     one custom visual from My visuals
```

- **Every save is a commit**, with messages like `Update "Hospital expansion" (Siva)`. The repo history is a full audit trail, and any earlier version can be restored from GitHub.
- **Fewer commits.** In GitHub mode the app waits for a 4 second pause in editing before saving, instead of saving after every small change.
- **Two people editing the same project.** Each save carries the version the person last loaded, and GitHub also checks the file's SHA. If someone else saved in between, the write is refused and the app asks: keep my version, or load theirs. Nothing is overwritten silently.
- **Listing projects** costs one GitHub request no matter how many projects exist.

## Setup

### 1. Create the data repository

Create a **new private repository** for the data, for example `stelic-dashboard-data`. Tick "Add a README file" so it has a `main` branch. Do not reuse the code repository: Vercel redeploys on every commit to the branch it deploys from, so saving into the code repo's `main` would redeploy the site on every edit. The app refuses that combination and shows an error if you try.

(If you must use one repository, create a branch named `data` and set `GITHUB_BRANCH=data`. `vercel.json` already turns off deployments for a branch named `data`.)

### 2. Create the GitHub token

GitHub, your profile picture, Settings, Developer settings, Personal access tokens, **Fine-grained tokens**, Generate new token:
- **Resource owner:** the account or organization that owns the data repo. If it is a Stelic organization, an org admin may need to approve the token.
- **Repository access:** Only select repositories, then pick the data repo.
- **Permissions:** Repository permissions, **Contents: Read and write**. Nothing else is needed.
- **Expiration:** pick a date and put a reminder in your calendar. When it expires, saving stops until you add a new token in Vercel.

Copy the token once it is shown. It is not shown again.

### 3. Push the code and import into Vercel

1. Push this folder to its own GitHub repository (the code repo).
2. Vercel dashboard, Add New, Project, pick the code repo. Framework preset: **Other**. Leave build settings empty.

### 4. Set environment variables in Vercel

Project, Settings, Environment Variables. Tick Production, Preview, and Development for each.

| Name | Value |
|---|---|
| `APP_PASSCODE` | The access code staff will type |
| `SESSION_SECRET` | A random string of 32 or more characters (a password manager's generator works) |
| `GITHUB_TOKEN` | The token from step 2 |
| `GITHUB_REPO` | `owner/repo-name` of the data repo, for example `stelic/stelic-dashboard-data` |
| `GITHUB_BRANCH` | Optional. Defaults to `main` |

No database is needed. Do not commit any of these values to GitHub.

### 5. Redeploy and check

Deployments, latest, Redeploy (variables only reach new deployments). Then open `https://<your-site>/api/health`. All of these should be true:

```json
{ "appPasscodeSet": true, "sessionSecretOk": true, "storage": "github", "githubTokenSet": true, "storageReachable": true, "ok": true }
```

Sign in with your name and the access code.

## If something does not work

Open `/api/health` first. It names the problem without showing any secret values:

| Shows | Fix |
|---|---|
| `sessionSecretOk: false` | `SESSION_SECRET` missing or under 32 characters, then redeploy |
| `appPasscodeSet: false` | Add `APP_PASSCODE`, then redeploy |
| `storageError: GitHub rejected the token (401)` | Token wrong or expired. Create a new one and update `GITHUB_TOKEN` |
| `storageError: GitHub refused access (403)` | Token lacks Contents: Read and write on the data repo, or an org admin has not approved it |
| `storageError: GitHub could not open ...` | `GITHUB_REPO` is misspelled, or the token was not given access to that repo |
| `storageError: ... point at the code branch Vercel deploys from` | Use a separate data repo, or `GITHUB_BRANCH=data` |
| `environment: "preview"` | You are on a preview URL. Make sure the variables are ticked for Preview |

The sign-in screen also shows the server's message when something other than the access code is wrong.

## Moving projects from the claude.ai version

Projects made in the claude.ai artifact live in that browser only. For each one: open it there, Export, **Project backup (.json)**. Then in the hosted app, on the landing page, **Import backup**. Custom visuals used in the project come along with it.

## Run it locally

Without any storage (data resets when you stop the server):
```bash
npm install
STORE=memory APP_PASSCODE=test SESSION_SECRET=<32+ characters> npm run dev
# open http://localhost:3000
```
Against the GitHub data repo: create `.env.local` with the same variables as Vercel (it is git-ignored), then `npm run dev`.

## Limits of GitHub storage

- **Rate limit:** 5,000 GitHub API requests per hour per token. A save uses 2 requests and opening the landing page uses 2, which comfortably covers a small team. If the limit is hit, saving pauses and resumes automatically.
- **Size:** about 900 KB per project file. A typical project is under 100 KB.
- **Commit volume:** busy days produce many commits in the data repo. That is expected, and it is why the data lives in its own repo.
- If the team grows or saving feels slow, switch to Postgres: set `STORE=postgres` and connect a Neon database (`DATABASE_URL`). Nothing else changes.

## Security notes (read before sharing the link)

- **The access code is shared.** Anyone with the link and the code can read, change, and delete every project. To rotate it, change `APP_PASSCODE` and `SESSION_SECRET` (changing the secret signs everyone out).
- **The GitHub token stays on the server.** It is only in Vercel's environment variables and is never sent to the browser. Scope it to the data repo only.
- **Stronger sign-in:** Microsoft Entra ID (MSAL) so staff use their Stelic M365 accounts. Only `lib/auth.js` and the sign-in screen would change. Vercel Deployment Protection is another option; check which deployments your plan covers.
- **Client data.** The library uses generic names, but project names typed by PMs may name real clients. Keep the data repo private, and confirm with Stelic leadership or IT that storing those names in GitHub is acceptable.
- **Login throttling is basic** (per function instance). It slows guessing but is not a hard limit.
