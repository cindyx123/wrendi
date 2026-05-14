# GitHub Actions Setup

The workflow needs 3 secrets added to your GitHub repo.
You only do this once.

---

## Step 1 — Create a Cloudflare API Token

1. Go to dash.cloudflare.com → top right → **My Profile**
2. Click **API Tokens** → **Create Token**
3. Click **Use template** next to **Edit Cloudflare Workers**
4. Under **Account Resources** → select your account
5. Under **Zone Resources** → select **All zones**
6. Click **Continue to summary** → **Create Token**
7. Copy the token — you only see it once

---

## Step 2 — Add secrets to GitHub

1. Go to your GitHub repo
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret** for each of the following:

| Secret Name | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | The token you just created |
| `VITE_API_URL` | Your Worker URL, e.g. `https://wrendi-worker.xxx.workers.dev` |

That's it — 2 secrets total.

---

## Step 3 — Push to main

Every push to the `main` branch now:
1. Deploys the Worker automatically
2. Builds the React frontend
3. Deploys it to wrendi.pages.dev

You can also trigger it manually:
GitHub repo → **Actions** tab → **Deploy Wrendi** → **Run workflow**

---

## What the workflow does

```
Push to main
  │
  ├─ deploy-worker
  │    └─ runs: npx wrangler deploy
  │
  └─ deploy-frontend (waits for worker to finish)
       ├─ npm install
       ├─ npm run build  (uses VITE_API_URL)
       └─ npx wrangler pages deploy dist --project-name=wrendi
```

The Worker deploys first, then the frontend — so the API is always live
before the new UI goes out. No broken deploys.
