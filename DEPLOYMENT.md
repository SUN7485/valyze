# 🚀 Valyze Credit Report — Deployment Guide (Vercel Only)

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  VERCEL (Free)                   │
├─────────────────────┬───────────────────────────┤
│   Frontend          │   Backend API              │
│   React/Vite        │   Python FastAPI           │
│   (Static Site)     │   (Serverless Function)    │
│                     │                           │
│   Free forever      │   100K invocations/month   │
│   No cold starts    │   ~5s execution limit      │
├─────────────────────┴───────────────────────────┤
│              Supabase (Free)                     │
│              Database + Storage                  │
│              Already configured ✅               │
└─────────────────────────────────────────────────┘
```

**Total cost: $0/month — Everything on Vercel + Supabase**

---

## Part 1: Deploy Backend API to Vercel

### Step 1: Push Code to GitHub

```bash
git add .
git commit -m "Vercel-only deployment setup"
git push origin main
```

### Step 2: Create Vercel Account

1. Go to [https://vercel.com](https://vercel.com)
2. Click **"Sign Up"**
3. Sign up with your GitHub account

### Step 3: Import Backend Project

1. In Vercel Dashboard, click **"Add New..."** → **"Project"**
2. Import your GitHub repository: `SUN7485/valyze`
3. **IMPORTANT:** Configure:
   - **Framework Preset:** `Other`
   - **Root Directory:** `backend` ← **MUST SET THIS!**
   - **Build Command:** *(leave empty or set to `pip install -r requirements.txt`)*
   - **Output Directory:** *(leave empty)*

### Step 4: Set Environment Variables

Click **"Environment Variables"** and add:

| Key | Value |
|-----|-------|
| `SUPABASE_URL` | `https://dnhtowmzrluqtlivdqqj.supabase.co` |
| `SUPABASE_SERVICE_KEY` | `eyJhbG...` (your service role key) |
| `FRONTEND_URL` | *(set AFTER deploying frontend)* |
| `ENV` | `production` |

### Step 5: Deploy

1. Click **"Deploy"**
2. Wait for build to complete (~1-2 minutes)
3. Your backend API will be at: `https://valyze-backend.vercel.app`

### Step 6: Verify

Visit: `https://valyze-backend.vercel.app/health`

Should return: `{"status": "ok", "version": "1.0.0", "pdf": "client-side"}`

---

## Part 2: Deploy Frontend to Vercel

### Step 1: Create Second Vercel Project

1. In Vercel Dashboard, click **"Add New..."** → **"Project"**
2. Import the **same** GitHub repository: `SUN7485/valyze`
3. **IMPORTANT:** Configure:
   - **Framework Preset:** `Vite`
   - **Root Directory:** `frontend` ← **MUST SET THIS!**
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`

### Step 2: Set Environment Variables

| Key | Value |
|-----|-------|
| `VITE_SUPABASE_URL` | `https://dnhtowmzrluqtlivdqqj.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbG...` (your anon key) |
| `VITE_API_BASE_URL` | `https://valyze-backend.vercel.app` |

> ⚠️ **CRITICAL:** `VITE_API_BASE_URL` must have **NO trailing slash**

### Step 3: Deploy

1. Click **"Deploy"**
2. Your frontend will be at: `https://valyze-frontend.vercel.app`

### Step 4: Update Backend CORS

1. Go to your **backend** Vercel project → Settings → Environment Variables
2. Update `FRONTEND_URL`:
   ```
   FRONTEND_URL=https://valyze-frontend.vercel.app
   ```
3. Redeploy the backend

---

## Post-Deployment Checklist

- [ ] Backend health check returns `{"status": "ok"}`
- [ ] Frontend loads without errors
- [ ] Can create a new report
- [ ] Can edit report fields
- [ ] Can generate PDF (client-side)
- [ ] Can export to JSON/Excel/CSV
- [ ] Reports save to Supabase (cloud)
- [ ] No CORS errors in browser console

---

## How PDF Generation Works (Client-Side)

1. Frontend calls `POST /api/pdf/generate/{reportId}`
2. Backend returns the rendered HTML
3. Frontend uses `html2pdf.js` to convert HTML → PDF in the browser
4. User downloads the PDF directly

**No Docker, no Gotenberg, no Playwright needed.**

---

## Updating the App

```bash
git add .
git commit -m "Your changes"
git push origin main
```

Both Vercel projects auto-deploy on push to `main` (~30 seconds each).

---

## Cost Summary

| Service | Plan | Monthly Cost |
|---------|------|-------------|
| Vercel (Frontend) | Free | $0 |
| Vercel (Backend) | Free | $0 |
| Supabase (Database) | Free | $0 |
| **Total** | | **$0/month** |

---

## Troubleshooting

### Backend Import Error
- Check Vercel build logs
- Ensure `requirements.txt` is in the `backend/` root
- Ensure `api/index.py` exists in `backend/api/`

### CORS Errors
- Make sure `FRONTEND_URL` matches your Vercel frontend URL exactly
- Include `https://` prefix
- After changing env vars, redeploy the backend

### PDF Generation Fails
- PDF is generated client-side using html2pdf.js
- Check browser console for errors
- Ensure the backend returns HTML (test `/api/pdf/preview/{id}`)