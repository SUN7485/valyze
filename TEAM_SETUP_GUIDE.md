# 🚀 Valyze Credit Report - Team Setup Guide

## ✅ What Was Fixed

All security vulnerabilities have been fixed:
- ✅ Authentication system implemented (JWT tokens)
- ✅ Login endpoint added (`/api/auth/login`)
- ✅ All API endpoints now require authentication
- ✅ Environment validation at startup
- ✅ Security headers added
- ✅ Rate limiting configured
- ✅ File upload validation improved

---

## 📥 For Your Team Members

### Step 1: Download the Repo

```bash
git clone <your-github-repo-url>
cd valyze-credit-report
```

### Step 2: Run the Installer

**Windows:** Double-click `install.bat`

**Mac:** Run `./install.sh`

### Step 3: Create `.env` File

The installer will warn you to create a `.env` file. Do this:

1. Go to the `backend` folder
2. Copy `.env.example` to `.env`
3. Edit `.env` with your **shared team credentials**:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-shared-service-key
JWT_SECRET_KEY=agree-on-a-secret-key-with-your-team-32-chars-min
```

> ⚠️ **IMPORTANT**: All team members must use the **SAME** `JWT_SECRET_KEY`!

---

## 🔐 How Authentication Works

### 1. Login First

Call this endpoint to get a token:

**POST** `http://localhost:8000/api/auth/login`

```json
{
  "email": "yourname@team.com",
  "password": "anypassword"
}
```

You'll get back:
```json
{
  "access_token": "eyJhbGc...",
  "token_type": "bearer",
  "expires_in": 3600
}
```

### 2. Use the Token

Add this header to ALL API requests:

```
Authorization: Bearer eyJhbGc...
```

### 3. That's It!

- Each user's reports are isolated by their email
- Tokens expire after 60 minutes (just login again)
- Password doesn't matter in development mode

---

## 🔄 When You Update the Code

When you push changes to GitHub, your team should:

```bash
git pull origin main
```

Then restart the backend. They **don't** need to re-run the installer!

---

## 🆘 Troubleshooting

| Error | Solution |
|-------|----------|
| "Not authenticated" | Add `Authorization: Bearer YOUR_TOKEN` header |
| "Missing environment variables" | Create `.env` file (see Step 3) |
| "Invalid token" | Make sure everyone uses same `JWT_SECRET_KEY` |
| App won't start | Check that `.env` file exists in `backend/` folder |

---

## 📚 API Documentation

Once running, visit: **http://localhost:8000/docs**

Key endpoints:
- `POST /api/auth/login` - Get your token
- `GET /api/auth/me` - Check current user
- `GET /api/reports` - List your reports (requires auth)
- All other endpoints require authentication

---

## 🎯 Quick Test

1. Start the app: `startall.bat` (Windows) or `./startall.sh` (Mac)
2. Open http://localhost:8000/docs
3. Click `/api/auth/login` → Try it out
4. Copy the token
5. Try any other endpoint with the token in Authorization header

That's it! 🎉
