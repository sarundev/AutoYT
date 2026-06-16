# AutoYT

> Automatically post short videos to YouTube from a beautiful web dashboard.

## Features

- 📁 **Local file browser** — navigate your Mac's folders and select `.mp4`, `.mov`, `.webm`, etc.
- 🏷️ **Metadata editor** — title, description, tags, privacy (public / unlisted / private)
- 📅 **Scheduler** — pick a date & time; video posts automatically
- 📊 **History dashboard** — see status of all uploads (pending → uploading → done)
- 🔑 **YouTube OAuth2** — secure login via Google, no passwords stored

---

## Quick Start

### 1. Get YouTube API credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project → Enable **YouTube Data API v3**
3. Create **OAuth 2.0 Web Client** credentials
4. Add redirect URI: `http://localhost:8000/auth/callback`
5. Download the JSON → save as `backend/client_secrets.json`

### 2. Start AutoYT

```bash
chmod +x start.sh
./start.sh
```

Then open **http://localhost:3000** in your browser.

### 3. Connect YouTube & Upload

1. Click **Connect YouTube** → sign in with Google
2. Go to **Upload** tab → browse files → fill in details → Upload Now or Schedule

---

## Project Structure

```
AutoYT/
├── backend/
│   ├── main.py              # FastAPI server
│   ├── requirements.txt     # Python dependencies
│   ├── client_secrets.json  # ← Add your Google OAuth credentials here
│   └── data/                # Upload history & tokens (auto-created)
├── frontend/
│   └── src/
│       ├── app/             # Next.js pages
│       ├── components/      # UI components
│       └── lib/             # API client
└── start.sh                 # One-command launcher
```

## Manual Start

```bash
# Backend
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload

# Frontend (separate terminal)
cd frontend
npm install && npm run dev
```

## Tech Stack

- **Frontend**: Next.js 15 + React + TypeScript
- **Backend**: Python FastAPI + APScheduler
- **API**: Google YouTube Data API v3
