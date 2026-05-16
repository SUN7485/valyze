# 🔐 Authentication Guide for Valyze Team

## Quick Start (For Your Team)

Since you all share the **same Supabase database**, here's how authentication works:

### 1️⃣ First Time Setup

After downloading the repo and running `install.bat` (Windows) or `./install.sh` (Mac):

1. **Copy the example env file:**
   ```bash
   cd backend
   cp .env.example .env
   ```

2. **Edit `.env` with your shared credentials:**
   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_KEY=your-shared-service-key
   JWT_SECRET_KEY=make-up-a-secret-key-together-32-chars-min
   ```

   > ⚠️ **Important**: All team members must use the **SAME** `JWT_SECRET_KEY` so tokens work across machines.

---

## 🚀 How to Use the App

### Step 1: Start the Backend
```bash
# Windows: Double-click startall.bat
# Mac: Run ./startall.sh
```

### Step 2: Login to Get a Token

Open your browser or Postman and call:

**POST** `http://localhost:8000/api/auth/login`

```json
{
  "email": "yourname@team.com",
  "password": "anypassword"
}
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 3600,
  "user_id": "abc123...",
  "email": "yourname@team.com"
}
```

### Step 3: Use the Token

Copy the `access_token` and add it to all API requests:

**Header:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Example - Get your reports:**
```bash
curl http://localhost:8000/api/reports \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

---

## 📝 Notes

- **Password doesn't matter** in development mode - any password works
- User ID is generated from your email automatically
- Tokens expire after **60 minutes** - just login again
- Each user's reports are isolated by their user_id

---

## 🔧 Updating the Repo

When you make changes and push to GitHub:

**Your team should run:**
```bash
git pull origin main
# Then restart the backend
```

They **don't** need to re-download everything - just `git pull`!

---

## 🆘 Troubleshooting

**Error: "Not authenticated"**
→ Add `Authorization: Bearer YOUR_TOKEN` header to requests

**Error: "Missing environment variables"**
→ Create `.env` file in backend folder (see setup above)

**Error: "Invalid token"**
→ Make sure all team members use the same `JWT_SECRET_KEY`
→ Token expired - login again

---

## 📚 API Documentation

Once backend is running, visit:
- **Swagger Docs**: http://localhost:8000/docs
- **Login Endpoint**: POST /api/auth/login
- **Current User**: GET /api/auth/me (requires auth)
