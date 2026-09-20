# Hosting — the only steps that need your login

I cannot create Supabase / Render / Vercel / cron-job.org / GitHub for you. Those accounts require *your* browser. Everything else in the repo is done, including a headed recording.

Do these in order. Budget 20 minutes. Deadline is tonight 11:59 PM IST.

## 0. GitHub (you said you would push)

From `/Users/priii/ine`:

```bash
git add .
git status
git commit -m "Submit INE intern price tracker"
# create a PUBLIC repo on github.com, then:
git branch -M main
git remote add origin https://github.com/YOUR_USER/ine.git
git push -u origin main
```

The repo **must be public**. Private repos fail the deliverable.

## 1. Supabase (database)

1. Open https://supabase.com/dashboard and sign in (GitHub login is fastest).
2. **New project** → free org → name `storewatch` → generate a database password and save it.
3. Wait until the project is healthy.
4. **SQL Editor** → New query → paste all of `supabase/schema.sql` → Run.
5. **Project Settings → API**:
   - copy **Project URL**
   - copy **service_role** key (secret, not the anon key)

## 2. Render (backend)

1. Open https://dashboard.render.com and sign in.
2. **New → Web Service** → connect the GitHub repo.
3. Settings:
   - Runtime: **Docker**
   - Dockerfile path: `backend/Dockerfile`
   - Docker build context: `backend`
   - Instance: **Free**
4. Environment:

```
HEADLESS=true
NODE_ENV=production
STORE_URL=https://demo.inelabteamdev.com
DEFAULT_SCRAPE_INTERVAL_MINUTES=120
SUPABASE_URL=<from step 1>
SUPABASE_SERVICE_ROLE_KEY=<from step 1>
CRON_SECRET=<paste the random string from README or generate with openssl rand -hex 24>
CORS_ORIGIN=http://localhost:5173
```

5. Health check path: `/api/health`
6. Deploy. First Docker/Playwright build takes 5–10 minutes.
7. Copy the service URL, e.g. `https://storewatch-api.onrender.com`.
8. Confirm `https://<render>/api/health` returns `{"ok":true,...}`. The first request after sleep is slow; that is normal.

## 3. Vercel (frontend)

1. Open https://vercel.com and sign in with GitHub.
2. **Add New → Project** → this repo.
3. Root directory: `frontend`
4. Framework: Vite / React
5. Environment variable:
   - `VITE_API_URL` = `https://<your-render-host>` with **no trailing slash**
6. Deploy. Copy the URL, e.g. `https://storewatch.vercel.app`.
7. Back on Render, edit `CORS_ORIGIN` to:

```
https://storewatch.vercel.app,http://localhost:5173
```

   Redeploy the API (or wait for the next restart).

## 4. cron-job.org (2-hour scraping, with wake-ups)

1. Open https://cron-job.org → free account.
2. Create cron job:
   - URL: `https://<render>/api/cron/scrape`
   - Schedule: every **15 minutes**
   - Request method: GET
   - Custom header: `X-Cron-Secret` = the same `CRON_SECRET`
3. Save and click **Run now** once. The JSON should list scraped products after you have tracked one in the UI.

Why 15 minutes: Render free sleeps. The ping wakes it. Each product still defaults to **every 2 hours**.

## 5. Recording + email

Recording is already made:

- Repo: `docs/headed-run.webm` (~2 min, shows a retried success and an honest failure)
- Also copied to: `/Users/priii/Downloads/INE_headed_scrape.webm`

Upload that file to Google Drive (anyone with the link can view) or YouTube unlisted.

Then email, **exactly**:

- To: `sstephen@ine.com`
- Cc: `ssingh@ine.com`
- Subject: `First Round: Software Engineer Intern Assignment - <Your Name>`
- Attach your **resume PDF**
- Body: copy `SUBMISSION.md` and replace the three URLs

Do not send if the live Vercel site cannot search and track. A partial but working hosted app is allowed; a local-only zip is not.
