# Storewatch

Full-stack tracker for INE's hosted mock store at [https://demo.inelabteamdev.com](https://demo.inelabteamdev.com). Users search products by name, track them, and the backend scrapes live price and stock on a schedule. Failures are logged. Empty or guessed prices are never written to history.

This repo is the intern assignment submission: React on Vercel, Express + Playwright on Render, PostgreSQL on Supabase, cron on cron-job.org.

## Live site

Fill these in after `HOSTING.md`:

- Frontend: `https://REPLACE-VERCEL.vercel.app`
- Backend: `https://REPLACE-RENDER.onrender.com/api/health`
- Headed recording: `docs/headed-run.webm`

## Scraping schedule

- Default interval: **every 2 hours** per tracked product.
- cron-job.org should hit `GET https://<backend>/api/cron/scrape` **every 15 minutes** with header `X-Cron-Secret: <CRON_SECRET>`.
- The job only scrapes products whose own interval has elapsed, so the assignment's 2-hour cadence is the default even though the wake-up ping is more frequent. That also keeps the Render free instance from sleeping.
- Per-product intervals can be set to 30 / 60 / 120 / 240 / 360 minutes in the UI.

## Features

- Partial and full name search against the mock catalog
- Tracked products persisted in Supabase
- Playwright scraper: cookie banner, hover gate, delayed price, retries, decoy prices ignored
- Price/stock history as chart and table
- Per-product scrape log: `success`, `retried`, or `failed`
- In-app price-drop and back-in-stock alerts
- Multi-product dashboard
- Layout-change detection via `/api/layout`
- GitHub Actions CI
- Headed / observable run with optional video recording

## Local setup

### 1. Supabase

1. Create a free project at [supabase.com](https://supabase.com).
2. SQL editor → paste `supabase/schema.sql` → run.
3. Project Settings → API: copy Project URL and `service_role` key.

### 2. Environment

```bash
cp .env.example .env
```

Fill in:

| Variable | Where it is used |
| --- | --- |
| `STORE_URL` | Mock store, keep as `https://demo.inelabteamdev.com` |
| `SUPABASE_URL` | Backend |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend, server-side only |
| `CRON_SECRET` | Long random string for the cron endpoint |
| `CORS_ORIGIN` | Frontend origin. Locally `http://localhost:5173` |
| `HEADLESS` | `true` in production, `false` for headed runs |
| `PORT` | Render sets this. Local default `10000` |
| `VITE_API_URL` | Frontend production builds only. Leave empty locally so Vite proxies `/api` |

### 3. Install and run

```bash
npm install
npm run install:all
npm run dev
```

- App: http://localhost:5173
- API: http://localhost:10000/api/health

First catalog sync walks the store's paginated `/api/catalog` and can take a minute.

### 4. Headed / observable run

```bash
cd backend
npx playwright install chromium
npm run headed
```

Record a 2–4 minute video (Playwright writes WebM under `backend/recordings`):

```bash
npm run record
```

Watch: cookie banner, mouse hover on the hidden price, Reveal price, loading/retry, then a trusted price or an honest failure in the log.

## Deployment

### Backend (Render)

1. New Web Service from this GitHub repo.
2. Runtime: Docker. Dockerfile path `backend/Dockerfile`, context `backend`.
3. Set env vars from the table above. `CORS_ORIGIN` must be the Vercel URL (and `http://localhost:5173` if you still test locally).
4. Health check: `/api/health`.

Render's free web service sleeps. That is expected. Cron wakes it.

### Frontend (Vercel)

1. New project, root directory `frontend`.
2. Environment variable `VITE_API_URL=https://<your-render-service>.onrender.com` (no trailing slash).
3. After the first deploy, add the Vercel URL to the backend `CORS_ORIGIN`.

### Cron (cron-job.org)

- URL: `https://<backend>/api/cron/scrape`
- Schedule: every 15 minutes
- Request method: GET
- Header: `X-Cron-Secret` = your `CRON_SECRET`
- Enable "ignore response errors" so a single slow scrape does not disable the job

## Project layout

```
backend/          Express API, Playwright scraper, headed script
frontend/          React dashboard
supabase/schema.sql
.github/workflows  CI
DESIGN.md          Reliability notes
```

## What the scraper refuses to do

- It will not parse listing HTML for a price. Prices are not there.
- It will not trust hidden decoy nodes (`display:none`, `aria-hidden`, strikethrough MRP).
- It will not save a row while the store still says `Updating…`.
- If hover, reveal, or parse fails after retries, it writes a `failed` log and no history row.
