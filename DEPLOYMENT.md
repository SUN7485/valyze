# 🚀 Valyze Credit Report — Free Deployment Guide

## Architecture

```
┌──────────────────────┐     ┌──────────────────────────┐
│   FRONTEND (Vercel)  │────▶│  BACKEND (Render)         │
│   React + Vite       │     │  FastAPI + Python 3.11    │
│   FREE forever       │     │  FREE: 750 hrs/month      │
│   No cold starts     │     │  Spins down after 15min   │
└──────────────────────┘     └──────────┬───────────────┘
                                        │
                               ┌────────▼───────────────┐
                               │  DATABASE (Supabase)    │
                               │  PostgreSQL (FREE)       │
                               │  Already configured ✅   │
                               └────────────────────────┘
```

**Total cost: $0/month**

---

## Part 1: Deploy Backend to Render

### Step 1: Push Code to GitHub

Make sure all the new files are committed and pushed:

```bash
git add .
git commit -m "Add deployment configs (Dockerfile, render.yaml, vercel.json)"
git push origin main
```

### Step 2: Create Render Account

1. Go to [https://render.com](https://render.com)
2. Click **"Get Started for Free"**
3. Sign up with your GitHub account
4. Authorize Render to access your repositories

### Step 3: Create Backend Service

1. In Render Dashboard, click **"New +"** → **"Web Service"**
2. Connect your GitHub repository: `SUN7485/valyze`
3. Configure the service:
   - **Name:** `valyze-backend`
   - **Runtime:** `Docker`
   - **Region:** `Frankfurt (EU)` or closest to your users
   - **Branch:** `main`
   - **Dockerfile Path:** `./backend/Dockerfile`
   - **Docker Context:** `./backend`
   - **Plan:** `Free`

### Step 4: Set Environment Variables

In Render Dashboard → your service → **Environment** tab, add these:

| Key | Value | Notes |
|-----|-------|-------|
| `SUPABASE_URL` | `https://dnhtowmzrluqtlivdqqj.supabase.co` | From your Supabase dashboard |
| `SUPABASE_SERVICE_KEY` | `eyJhbG...` (your service role key) | ⚠️ Set as **Secret** |
| `FRONTEND_URL` | `https://your-app.vercel.app` | Set AFTER deploying frontend |
| `ENV` | `production` | |
| `TESSERACT_CMD` | `/usr/bin/tesseract` | Linux path in Docker |
| `GOTENBERG_URL` | *(leave empty)* | Uses Playwright fallback |
| `LOG_LEVEL` | `INFO` | |

> ⚠️ **IMPORTANT:** Set `SUPABASE_SERVICE_KEY` as a **Secret File** or **Secret Environment Variable** in Render, not as a plain env var.

### Step 5: Deploy

1. Click **"Create Web Service"**
2. Render will start building your Docker image (takes 5-10 min first time)
3. Wait for the build to complete
4. Your backend will be available at: `https://valyze-backend.onrender.com`

### Step 6: Verify Backend

Visit: `https://valyze-backend.onrender.com/health`

You should see:
```json
{"status": "ok", "version": "1.0.0"}
```

---

## Part 2: Deploy Frontend to Vercel

### Step 1: Create Vercel Account

1. Go to [https://vercel.com](https://vercel.com)
2. Click **"Sign Up"**
3. Sign up with your GitHub account

### Step 2: Import Project

1. In Vercel Dashboard, click **"Add New..."** → **"Project"**
2. Import your GitHub repository: `SUN7485/valyze`
3. **IMPORTANT:** Configure the project:
   - **Framework Preset:** `Vite`
   - **Root Directory:** `frontend` ← **MUST SET THIS!**
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`

### Step 3: Set Environment Variables

Click **"Environment Variables"** and add:

| Key | Value | Environments |
|-----|-------|-------------|
| `VITE_SUPABASE_URL` | `https://dnhtowmzrluqtlivdqqj.supabase.co` | Production, Preview |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbG...` (your anon key) | Production, Preview |
| `VITE_API_BASE_URL` | `https://valyze-backend.onrender.com` | Production |
| `VITE_API_BASE_URL` | `https://valyze-backend.onrender.com` | Preview |

> ⚠️ **CRITICAL:** `VITE_API_BASE_URL` must point to your Render backend URL with **NO trailing slash**.

### Step 4: Deploy

1. Click **"Deploy"**
2. Vercel will build and deploy (usually 30-60 seconds)
3. Your frontend will be available at: `https://your-app.vercel.app`

### Step 5: Update Backend CORS

1. Go back to Render Dashboard → your backend → **Environment**
2. Update `FRONTEND_URL` to your Vercel URL:
   ```
   FRONTEND_URL=https://your-app.vercel.app
   ```
3. Save — Render will auto-redeploy

---

## Part 3: Post-Deployment Checklist

- [ ] Backend health check returns `{"status": "ok"}`
- [ ] Frontend loads without errors
- [ ] Can create a new report
- [ ] Can edit report fields
- [ ] Can generate PDF
- [ ] Can export to JSON/Excel/CSV
- [ ] Reports save to Supabase (cloud)
- [ ] No CORS errors in browser console

---

## Understanding Render Free Tier Limitations

### Spin-Down Behavior
- After **15 minutes** of no incoming requests, Render puts your service to "sleep"
- The **first request** after sleep takes **~30 seconds** to respond (cold start)
- Subsequent requests are fast
- For 5-6 users, this is usually fine

### How to Minimize Cold Start Impact
1. **Tell users** the first click may take ~30 seconds
2. The health check endpoint (`/health`) is very fast
3. Once awake, the service stays awake as long as there's traffic

### Monthly Limits
- **750 hours/month** free (enough for 24/7 if usage is moderate)
- If you exceed 750 hours, the service pauses until next month
- For 5-6 users, you'll likely use 200-400 hours/month

---

## Troubleshooting

### Backend Won't Build
- Check Render build logs for errors
- Common issue: Large Docker image (first build takes 5-10 min)
- If `playwright install` fails, the system chromium will be used instead

### Frontend Shows "Network Error"
- Check that `VITE_API_BASE_URL` is set correctly in Vercel
- Make sure there's no trailing slash
- Check that Render backend is running (not sleeping)
- Check browser console for CORS errors

### CORS Errors
- Make sure `FRONTEND_URL` is set in Render env vars
- The URL must match exactly (including `https://`)
- After changing env vars, Render redeploys automatically (takes ~2 min)

### PDF Generation Fails
- Playwright uses system Chromium in Docker
- If Playwright isn't installed, check Render build logs
- The system falls back gracefully — reports still work, just no PDF

---

## Updating the App

### Code Changes
```bash
git add .
git commit -m "Your changes"
git push origin main
```

Both Render and Vercel auto-deploy on push to `main`:
- **Vercel:** ~30 seconds
- **Render:** ~3-5 minutes (Docker rebuild)

### Environment Variable Changes
- **Vercel:** Dashboard → Settings → Environment Variables → Edit → Redeploy
- **Render:** Dashboard → Environment → Edit → Save (auto-redeploys)

---

## Cost Summary

| Service | Plan | Monthly Cost |
|---------|------|-------------|
| Vercel (Frontend) | Free | $0 |
| Render (Backend) | Free | $0 |
| Supabase (Database) | Free | $0 |
| **Total** | | **$0/month** |