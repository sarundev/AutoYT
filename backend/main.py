import json
import uuid
import shutil
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import aiofiles
from fastapi import FastAPI, HTTPException, Form, BackgroundTasks, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from dotenv import load_dotenv

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from googleapiclient.errors import HttpError
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.date import DateTrigger

load_dotenv()

app = FastAPI(title="AutoYT API", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

import os
from datetime import datetime, timedelta

# ── Paths ──────────────────────────────────────────────────────────────────────
BASE_DIR      = Path(__file__).parent
DATA_DIR      = Path(os.getenv("DATA_DIR", str(BASE_DIR / "data")))
CHANNELS_FILE = DATA_DIR / "channels.json"
UPLOADS_FILE  = DATA_DIR / "uploads.json"
CONFIG_FILE   = DATA_DIR / "config.json"
TEMP_DIR      = DATA_DIR / "temp"
DATA_DIR.mkdir(parents=True, exist_ok=True)
TEMP_DIR.mkdir(parents=True, exist_ok=True)

SCOPES       = ["https://www.googleapis.com/auth/youtube.upload",
                "https://www.googleapis.com/auth/youtube.readonly"]
REDIRECT_URI = os.getenv("REDIRECT_URI", "http://localhost:8000/auth/callback")
VIDEO_EXTS   = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v", ".flv"}

scheduler = AsyncIOScheduler()
scheduler.start()

# ── Global config ──────────────────────────────────────────────────────────────

def load_config() -> dict:
    return json.loads(CONFIG_FILE.read_text()) if CONFIG_FILE.exists() else {}

def save_config(data: dict):
    CONFIG_FILE.write_text(json.dumps(data, indent=2))

def get_global_creds() -> tuple[str, str]:
    cfg = load_config()
    cid = cfg.get("client_id", "").strip()
    cs  = cfg.get("client_secret", "").strip()
    if not cid or not cs:
        raise HTTPException(status_code=400,
            detail="Google credentials not set. Go to Settings tab.")
    return cid, cs

def build_flow(state: str = "") -> Flow:
    cid, cs = get_global_creds()
    return Flow.from_client_config(
        {"web": {"client_id": cid, "client_secret": cs,
                 "auth_uri":  "https://accounts.google.com/o/oauth2/auth",
                 "token_uri": "https://oauth2.googleapis.com/token",
                 "redirect_uris": [REDIRECT_URI]}},
        scopes=SCOPES, redirect_uri=REDIRECT_URI,
    )

# ── Channels ───────────────────────────────────────────────────────────────────

def load_channels() -> list:
    return json.loads(CHANNELS_FILE.read_text()) if CHANNELS_FILE.exists() else []

def save_channels(chs: list):
    CHANNELS_FILE.write_text(json.dumps(chs, indent=2, default=str))

def find_channel(cid: str) -> Optional[dict]:
    return next((c for c in load_channels() if c["id"] == cid), None)

def get_yt_service(channel: dict):
    """Build authenticated YouTube client, auto-refreshing token."""
    gcid, gcs = get_global_creds()
    creds = Credentials(
        token=channel.get("token"),
        refresh_token=channel.get("refresh_token"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=gcid, client_secret=gcs, scopes=SCOPES,
    )
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        channels = load_channels()
        ch = next((c for c in channels if c["id"] == channel["id"]), None)
        if ch:
            ch["token"] = creds.token
            save_channels(channels)
    return build("youtube", "v3", credentials=creds)

# ── Uploads ────────────────────────────────────────────────────────────────────

def load_uploads() -> list:
    return json.loads(UPLOADS_FILE.read_text()) if UPLOADS_FILE.exists() else []

def save_uploads(ups: list):
    UPLOADS_FILE.write_text(json.dumps(ups, indent=2, default=str))

# ── Scheduler helpers ──────────────────────────────────────────────────────────

def next_post_time(channel: dict) -> datetime:
    delay  = max(1, int(channel.get("delay_days", 1)))
    hour   = int(channel.get("post_hour", 10))
    minute = int(channel.get("post_minute", 0))
    dt = datetime.utcnow() + timedelta(days=delay)
    return dt.replace(hour=hour, minute=minute, second=0, microsecond=0)

def get_next_video(channel: dict) -> Optional[Path]:
    folder = Path(channel.get("watch_folder", ""))
    if not folder.exists():
        return None
    posted = set(channel.get("posted_files", []))
    videos = sorted(
        [f for f in folder.iterdir()
         if f.is_file() and f.suffix.lower() in VIDEO_EXTS and f.name not in posted],
        key=lambda f: f.name,
    )
    return videos[0] if videos else None

def schedule_channel(channel: dict):
    """(Re-)schedule this channel's next auto-post job."""
    job_id = f"ch_{channel['id']}"
    try:
        scheduler.remove_job(job_id)
    except Exception:
        pass
    if not channel.get("active") or not channel.get("refresh_token") or not channel.get("watch_folder"):
        return

    raw = channel.get("next_post_at")
    try:
        run_at = datetime.fromisoformat(raw) if raw else next_post_time(channel)
    except Exception:
        run_at = next_post_time(channel)

    if run_at <= datetime.utcnow():
        run_at = next_post_time(channel)

    scheduler.add_job(
        do_auto_post, trigger=DateTrigger(run_date=run_at),
        args=[channel["id"]], id=job_id, replace_existing=True,
    )
    channels = load_channels()
    ch = next((c for c in channels if c["id"] == channel["id"]), None)
    if ch:
        ch["next_post_at"] = run_at.isoformat()
        save_channels(channels)

async def do_auto_post(channel_id: str):
    """Auto-post next queued video for a channel."""
    channels = load_channels()
    channel  = next((c for c in channels if c["id"] == channel_id), None)
    if not channel or not channel.get("active"):
        return

    video = get_next_video(channel)

    # Always reschedule next post regardless of outcome
    def reschedule():
        channels2 = load_channels()
        ch2 = next((c for c in channels2 if c["id"] == channel_id), None)
        if ch2:
            ch2["next_post_at"] = next_post_time(ch2).isoformat()
            save_channels(channels2)
            schedule_channel(ch2)

    if not video:
        reschedule()
        return

    upload_id = str(uuid.uuid4())
    temp_path = TEMP_DIR / f"{upload_id}{video.suffix.lower()}"
    shutil.copy2(video, temp_path)

    record = {
        "id":           upload_id,
        "channel_id":   channel_id,
        "channel_name": channel.get("name", ""),
        "title":        video.stem.replace("-", " ").replace("_", " "),
        "description":  channel.get("default_description", ""),
        "tags":         channel.get("default_tags", ""),
        "privacy":      channel.get("default_privacy", "public"),
        "file_name":    video.name,
        "file_size":    video.stat().st_size,
        "auto":         True,
        "status":       "uploading",
        "youtube_id":   "",
        "youtube_url":  "",
        "error":        "",
        "created_at":   datetime.utcnow().isoformat(),
        "updated_at":   datetime.utcnow().isoformat(),
    }
    uploads = load_uploads()
    uploads.append(record)
    save_uploads(uploads)

    try:
        yt       = get_yt_service(channel)
        tag_list = [t.strip() for t in record["tags"].split(",") if t.strip()]
        body     = {
            "snippet": {"title": record["title"], "description": record["description"],
                        "tags": tag_list, "categoryId": "22"},
            "status":  {"privacyStatus": record["privacy"], "selfDeclaredMadeForKids": False},
        }
        media = MediaFileUpload(str(temp_path), mimetype="video/*", resumable=True, chunksize=1024*1024)
        req   = yt.videos().insert(part="snippet,status", body=body, media_body=media)
        resp  = None
        while resp is None:
            _, resp = req.next_chunk()

        record["status"]      = "done"
        record["youtube_id"]  = resp["id"]
        record["youtube_url"] = f"https://www.youtube.com/shorts/{resp['id']}"

        channels = load_channels()
        ch = next((c for c in channels if c["id"] == channel_id), None)
        if ch:
            ch.setdefault("posted_files", []).append(video.name)
            ch["last_posted_at"] = datetime.utcnow().isoformat()
            ch["last_posted_file"] = video.name
            ch["next_post_at"] = next_post_time(ch).isoformat()
            save_channels(channels)
            schedule_channel(ch)

    except Exception as e:
        record["status"] = "error"
        record["error"]  = str(e)
        reschedule()

    finally:
        record["updated_at"] = datetime.utcnow().isoformat()
        uploads = load_uploads()
        up = next((u for u in uploads if u["id"] == upload_id), None)
        if up:
            up.update(record)
            save_uploads(uploads)
        try:
            temp_path.unlink()
        except Exception:
            pass

async def do_manual_upload(upload_id: str, channel_id: str, file_path: str,
                           title: str, description: str, tags: str, privacy: str):
    uploads = load_uploads()
    rec = next((u for u in uploads if u["id"] == upload_id), None)
    if not rec:
        return
    try:
        ch = find_channel(channel_id)
        if not ch:
            raise Exception("Channel not found")
        yt       = get_yt_service(ch)
        tag_list = [t.strip() for t in tags.split(",") if t.strip()]
        body = {
            "snippet": {"title": title, "description": description,
                        "tags": tag_list, "categoryId": "22"},
            "status":  {"privacyStatus": privacy, "selfDeclaredMadeForKids": False},
        }
        media = MediaFileUpload(file_path, mimetype="video/*", resumable=True, chunksize=1024*1024)
        req   = yt.videos().insert(part="snippet,status", body=body, media_body=media)
        resp  = None
        while resp is None:
            _, resp = req.next_chunk()
        rec["status"]      = "done"
        rec["youtube_id"]  = resp["id"]
        rec["youtube_url"] = f"https://www.youtube.com/shorts/{resp['id']}"
    except Exception as e:
        rec["status"] = "error"
        rec["error"]  = str(e)
    finally:
        rec["updated_at"] = datetime.utcnow().isoformat()
        save_uploads(uploads)
        try:
            p = Path(file_path)
            if str(TEMP_DIR) in str(p):
                p.unlink()
        except Exception:
            pass

# ── Startup: restore scheduled jobs ───────────────────────────────────────────

@app.on_event("startup")
async def on_startup():
    for ch in load_channels():
        if ch.get("active") and ch.get("refresh_token"):
            schedule_channel(ch)

# ── Settings ───────────────────────────────────────────────────────────────────

class CredentialsInput(BaseModel):
    client_id: str
    client_secret: str

@app.get("/settings")
def get_settings():
    cfg = load_config()
    s   = cfg.get("client_secret", "")
    return {
        "client_id":            cfg.get("client_id", ""),
        "client_secret_masked": (s[:6] + "•" * (len(s) - 6)) if len(s) > 6 else "•" * len(s),
        "configured":           bool(cfg.get("client_id") and cfg.get("client_secret")),
    }

@app.post("/settings")
def save_settings(body: CredentialsInput):
    if not body.client_id.strip() or not body.client_secret.strip():
        raise HTTPException(status_code=400, detail="Both fields required.")
    save_config({"client_id": body.client_id.strip(), "client_secret": body.client_secret.strip()})
    return {"success": True}

@app.get("/auth/status")
def auth_status():
    cfg = load_config()
    return {"configured": bool(cfg.get("client_id") and cfg.get("client_secret"))}

# ── Channel CRUD ───────────────────────────────────────────────────────────────

class ChannelCreate(BaseModel):
    name: str

class ChannelUpdate(BaseModel):
    name:                Optional[str]  = None
    watch_folder:        Optional[str]  = None
    delay_days:          Optional[int]  = None
    post_hour:           Optional[int]  = None
    post_minute:         Optional[int]  = None
    active:              Optional[bool] = None
    default_privacy:     Optional[str]  = None
    default_tags:        Optional[str]  = None
    default_description: Optional[str]  = None

def channel_public(ch: dict) -> dict:
    """Strip sensitive token data and add derived fields."""
    folder  = Path(ch.get("watch_folder", ""))
    posted  = set(ch.get("posted_files", []))
    pending = 0
    if folder.exists():
        pending = len([f for f in folder.iterdir()
                       if f.is_file() and f.suffix.lower() in VIDEO_EXTS and f.name not in posted])
    return {
        **{k: v for k, v in ch.items() if k not in ("token", "refresh_token", "posted_files")},
        "connected":     bool(ch.get("refresh_token")),
        "pending_count": pending,
        "posted_count":  len(ch.get("posted_files", [])),
    }

@app.get("/channels")
def list_channels():
    return [channel_public(ch) for ch in load_channels()]

@app.post("/channels")
def create_channel(body: ChannelCreate):
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Name required.")
    ch = {
        "id":                  str(uuid.uuid4()),
        "name":                body.name.strip(),
        "token":               "",
        "refresh_token":       "",
        "watch_folder":        "",
        "delay_days":          1,
        "post_hour":           10,
        "post_minute":         0,
        "active":              False,
        "default_privacy":     "public",
        "default_tags":        "",
        "default_description": "",
        "posted_files":        [],
        "last_posted_at":      None,
        "last_posted_file":    None,
        "next_post_at":        None,
        "created_at":          datetime.utcnow().isoformat(),
    }
    channels = load_channels()
    channels.append(ch)
    save_channels(channels)
    return channel_public(ch)

@app.put("/channels/{channel_id}")
def update_channel(channel_id: str, body: ChannelUpdate):
    channels = load_channels()
    ch = next((c for c in channels if c["id"] == channel_id), None)
    if not ch:
        raise HTTPException(status_code=404, detail="Channel not found")

    updates = body.dict(exclude_unset=True)

    # Validate folder
    if "watch_folder" in updates and updates["watch_folder"]:
        p = Path(updates["watch_folder"])
        if not p.exists() or not p.is_dir():
            raise HTTPException(status_code=400, detail=f"Folder not found: {updates['watch_folder']}")

    ch.update(updates)

    # Recalculate next post if schedule changed
    if any(k in updates for k in ("delay_days", "post_hour", "post_minute")):
        ch["next_post_at"] = next_post_time(ch).isoformat()

    save_channels(channels)

    # Reschedule
    if ch.get("active") and ch.get("refresh_token") and ch.get("watch_folder"):
        schedule_channel(ch)
    else:
        try:
            scheduler.remove_job(f"ch_{channel_id}")
        except Exception:
            pass

    return channel_public(ch)

@app.delete("/channels/{channel_id}")
def delete_channel(channel_id: str):
    channels = [c for c in load_channels() if c["id"] != channel_id]
    save_channels(channels)
    try:
        scheduler.remove_job(f"ch_{channel_id}")
    except Exception:
        pass
    return {"success": True}

@app.get("/channels/{channel_id}/auth_url")
def get_channel_auth_url(channel_id: str):
    if not find_channel(channel_id):
        raise HTTPException(status_code=404, detail="Channel not found")
    flow = build_flow()
    auth_url, _ = flow.authorization_url(
        access_type="offline", include_granted_scopes="true",
        prompt="consent", state=channel_id,
    )
    return {"auth_url": auth_url}

@app.get("/channels/{channel_id}/queue")
def get_channel_queue(channel_id: str):
    ch = find_channel(channel_id)
    if not ch:
        raise HTTPException(status_code=404, detail="Not found")
    folder = Path(ch.get("watch_folder", ""))
    if not folder.exists():
        return []
    posted = set(ch.get("posted_files", []))
    videos = sorted(
        [f for f in folder.iterdir()
         if f.is_file() and f.suffix.lower() in VIDEO_EXTS and f.name not in posted],
        key=lambda f: f.name,
    )
    return [{"name": f.name, "size": f.stat().st_size} for f in videos[:30]]

@app.post("/channels/{channel_id}/post_now")
async def post_now(channel_id: str, background_tasks: BackgroundTasks):
    ch = find_channel(channel_id)
    if not ch:
        raise HTTPException(status_code=404, detail="Not found")
    if not ch.get("refresh_token"):
        raise HTTPException(status_code=400, detail="Channel not connected to YouTube")
    if not ch.get("watch_folder"):
        raise HTTPException(status_code=400, detail="No watch folder configured")
    background_tasks.add_task(do_auto_post, channel_id)
    return {"success": True}

# ── OAuth callback ─────────────────────────────────────────────────────────────

@app.get("/auth/callback")
def auth_callback(code: str, state: Optional[str] = None):
    flow = build_flow()
    flow.fetch_token(code=code)
    creds = flow.credentials

    if state:
        channels = load_channels()
        ch = next((c for c in channels if c["id"] == state), None)
        if ch:
            ch["token"]        = creds.token
            ch["refresh_token"] = creds.refresh_token
            save_channels(channels)
            return RedirectResponse(f"http://localhost:3000?auth=success&channel={state}")

    return RedirectResponse("http://localhost:3000?auth=success")

# ── Manual upload ──────────────────────────────────────────────────────────────

@app.post("/uploads/queue")
async def queue_upload(
    background_tasks: BackgroundTasks,
    file:             UploadFile      = File(...),
    channel_id:       str             = Form(...),
    title:            str             = Form(...),
    description:      str             = Form(""),
    tags:             str             = Form(""),
    privacy:          str             = Form("public"),
    scheduled_time:   Optional[str]   = Form(None),
):
    ch = find_channel(channel_id)
    if not ch:
        raise HTTPException(status_code=404, detail="Channel not found")
    if not ch.get("refresh_token"):
        raise HTTPException(status_code=400, detail="Channel not connected to YouTube")

    suffix = Path(file.filename or "video.mp4").suffix.lower()
    if suffix not in VIDEO_EXTS:
        raise HTTPException(status_code=400, detail=f"Unsupported: {suffix}")

    upload_id = str(uuid.uuid4())
    temp_path = TEMP_DIR / f"{upload_id}{suffix}"
    async with aiofiles.open(temp_path, "wb") as f:
        while chunk := await file.read(1024 * 1024):
            await f.write(chunk)

    record = {
        "id":             upload_id,
        "channel_id":     channel_id,
        "channel_name":   ch.get("name", ""),
        "title":          title,
        "description":    description,
        "tags":           tags,
        "privacy":        privacy,
        "file_name":      file.filename or temp_path.name,
        "file_size":      temp_path.stat().st_size,
        "scheduled_time": scheduled_time,
        "auto":           False,
        "status":         "pending",
        "youtube_id":     "",
        "youtube_url":    "",
        "error":          "",
        "created_at":     datetime.utcnow().isoformat(),
        "updated_at":     datetime.utcnow().isoformat(),
    }
    uploads = load_uploads()
    uploads.append(record)
    save_uploads(uploads)

    if scheduled_time:
        try:
            run_time = datetime.fromisoformat(scheduled_time)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid scheduled_time")
        scheduler.add_job(
            do_manual_upload, trigger=DateTrigger(run_date=run_time),
            args=[upload_id, channel_id, str(temp_path), title, description, tags, privacy],
            id=upload_id, replace_existing=True,
        )
        record["status"] = "scheduled"
        uploads = load_uploads()
        up = next((u for u in uploads if u["id"] == upload_id), None)
        if up:
            up["status"] = "scheduled"
        save_uploads(uploads)
    else:
        background_tasks.add_task(
            do_manual_upload, upload_id, channel_id, str(temp_path),
            title, description, tags, privacy,
        )

    return record

@app.get("/uploads")
def list_uploads(channel_id: Optional[str] = None):
    ups = load_uploads()
    if channel_id:
        ups = [u for u in ups if u.get("channel_id") == channel_id]
    return list(reversed(ups))

@app.delete("/uploads/{upload_id}")
def delete_upload(upload_id: str):
    save_uploads([u for u in load_uploads() if u["id"] != upload_id])
    try:
        scheduler.remove_job(upload_id)
    except Exception:
        pass
    return {"success": True}

class BulkLocalInput(BaseModel):
    channel_id: str
    folder_path: str
    start_time: str
    interval_hours: float
    privacy: str
    tags: str
    description: str

@app.post("/uploads/bulk_local")
def queue_bulk_local(body: BulkLocalInput):
    ch = find_channel(body.channel_id)
    if not ch: raise HTTPException(status_code=404, detail="Channel not found")
    if not ch.get("refresh_token"): raise HTTPException(status_code=400, detail="Channel not connected")
    
    folder = Path(body.folder_path)
    if not folder.exists() or not folder.is_dir():
        raise HTTPException(status_code=400, detail="Folder not found")
        
    videos = sorted([f for f in folder.iterdir() if f.is_file() and f.suffix.lower() in VIDEO_EXTS])
    if not videos:
        raise HTTPException(status_code=400, detail="No video files found in folder")
        
    try:
        current_time = datetime.fromisoformat(body.start_time)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid start time")
        
    uploads = load_uploads()
    added = 0
    
    for v in videos:
        upload_id = str(uuid.uuid4())
        record = {
            "id":             upload_id,
            "channel_id":     body.channel_id,
            "channel_name":   ch.get("name", ""),
            "title":          v.stem.replace("-", " ").replace("_", " "),
            "description":    body.description,
            "tags":           body.tags,
            "privacy":        body.privacy,
            "file_name":      v.name,
            "file_size":      v.stat().st_size,
            "scheduled_time": current_time.isoformat(),
            "auto":           False,
            "status":         "scheduled",
            "youtube_id":     "",
            "youtube_url":    "",
            "error":          "",
            "created_at":     datetime.utcnow().isoformat(),
            "updated_at":     datetime.utcnow().isoformat(),
        }
        uploads.append(record)
        
        scheduler.add_job(
            do_manual_upload, trigger=DateTrigger(run_date=current_time),
            args=[upload_id, body.channel_id, str(v), record["title"], body.description, body.tags, body.privacy],
            id=upload_id, replace_existing=True,
        )
        
        current_time += timedelta(hours=body.interval_hours)
        added += 1
        
    save_uploads(uploads)
    return {"success": True, "queued_count": added}

@app.get("/health")
def health():
    return {"status": "ok", "channels": len(load_channels())}
