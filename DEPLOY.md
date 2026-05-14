# ⬡ Wrendi — Deployment Guide

## What you're deploying
- **Worker** — backend: auth, D1 database API, Claude AI proxy, live job search, analytics
- **D1** — Postgres-style database: jobs, profiles, application history, analytics
- **R2** — resume PDF storage
- **Pages** — the Wrendi frontend (replaces wrendi.pages.dev)

---

## Prerequisites

```bash
npm install -g wrangler
wrangler login
# Opens browser — sign in with your Cloudflare account
```

---

## Step 1 — Create the D1 database

```bash
npx wrangler d1 create wrendi-db
```

Copy the `database_id` from the output and paste it into `wrangler.toml`.

Then create the tables:
```bash
npx wrangler d1 execute wrendi-db --file=worker/schema.sql --remote
```

---

## Step 2 — Create the R2 bucket

```bash
npx wrangler r2 bucket create wrendi-resumes
```

---

## Step 3 — Add secrets

```bash
# Anthropic API key (from console.anthropic.com)
npx wrangler secret put ANTHROPIC_API_KEY

# Long random string — generate one: openssl rand -hex 32
npx wrangler secret put JWT_SECRET

# Resend API key (free at resend.com — no domain setup needed)
npx wrangler secret put RESEND_API_KEY

# RapidAPI key for live job search (free at rapidapi.com → search "JSearch")
npx wrangler secret put RAPIDAPI_KEY

# Your email — gives you access to the Analytics dashboard
npx wrangler secret put ADMIN_EMAIL
```

---

## Step 4 — Deploy the Worker

```bash
npx wrangler deploy
```

Output will show:
```
https://wrendi-worker.YOUR_SUBDOMAIN.workers.dev
```

Copy this URL.

---

## Step 5 — Update the frontend with your Worker URL

Open `frontend/src/App.jsx`, line 3:
```js
const API = import.meta.env.VITE_API_URL || "https://wrendi-worker.YOUR_SUBDOMAIN.workers.dev";
```

Or better — create `frontend/.env`:
```
VITE_API_URL=https://wrendi-worker.YOUR_SUBDOMAIN.workers.dev
```

---

## Step 6 — Build and deploy the frontend

```bash
cd frontend
npm install
npm run build
cd ..
npx wrangler pages deploy dist/ --project-name=wrendi
```

This replaces the existing wrendi.pages.dev.

---

## Step 7 — Update the Chrome Extension Worker URL

Open `extension/background.js`, line 3:
```js
const WORKER = "https://wrendi-worker.YOUR_SUBDOMAIN.workers.dev";
```
Replace with your actual Worker URL.

Then reload the extension in Chrome (`chrome://extensions` → reload button).

---

## Step 8 — Sign in

1. Go to **wrendi.pages.dev**
2. Enter your email → click Send magic link
3. Check inbox → click the link → you're in
4. Go to **Profile** → paste your master resume → Save

Your email is the ADMIN_EMAIL you set, so you'll see the Analytics tab in the sidebar.

---

## Step 9 — Share with others

Anyone can sign up with their email at wrendi.pages.dev.
Their data is completely isolated from yours (Row Level Security in D1).
You can see their aggregate usage (not their resume content) in the Analytics tab.

---

## CORS update (after deploy)

Open `worker/index.js`, line 5, and replace:
```js
const ORIGIN = "https://wrendi.pages.dev";
```
This is already set correctly for production.

---

## Cost on Cloudflare Free Tier

| Service | Free limit | Your usage |
|---------|-----------|------------|
| Workers | 100K req/day | ~10–100/day |
| D1 | 5GB, 25M reads/day | Negligible |
| R2 | 10GB storage | Negligible |
| Pages | Unlimited deploys | — |

You will not hit any limits on the free tier during normal use.
