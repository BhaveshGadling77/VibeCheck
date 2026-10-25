import hashlib, hmac, os, time
from collections import Counter, defaultdict
import jwt
from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from psycopg2.extras import RealDictCursor
from config import JWT_SECRET, MIN_MATCHES
from db import get_conn
from fingerprint import fingerprint

app = FastAPI(title="VibeCheck API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

def hash_pw(pw, salt=None):
    salt = salt or os.urandom(16).hex()
    dk = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt.encode(), 100_000).hex()
    return f"{salt}${dk}"

def check_pw(pw, stored):
    salt, _ = stored.split("$")
    return hmac.compare_digest(hash_pw(pw, salt), stored)

def make_token(uid):
    return jwt.encode({"uid": uid, "exp": int(time.time()) + 7 * 86400}, JWT_SECRET, algorithm="HS256")

def current_user(authorization: str = Header(None)):
    try:
        return jwt.decode(authorization.split()[1], JWT_SECRET, algorithms=["HS256"])["uid"]
    except Exception:
        raise HTTPException(401, "Invalid or missing token")

class RegisterIn(BaseModel):
    first_name: str
    middle_name: str | None = None
    last_name: str | None = None
    email: str
    password: str

class LoginIn(BaseModel):
    email: str
    password: str

@app.post("/api/register")
def register(u: RegisterIn):
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM Users WHERE email=%s", (u.email,))
        if cur.fetchone():
            raise HTTPException(409, "Email already registered")
        cur.execute("INSERT INTO Users(first_name,middle_name,last_name,email,password_hash) VALUES (%s,%s,%s,%s,%s) RETURNING user_id",
                    (u.first_name, u.middle_name, u.last_name, u.email, hash_pw(u.password)))
        uid = cur.fetchone()[0]
    return {"user_id": uid, "name": u.first_name, "token": make_token(uid)}

@app.post("/api/login")
def login(u: LoginIn):
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT user_id, first_name, password_hash FROM Users WHERE email=%s", (u.email,))
        r = cur.fetchone()
    if not r or not check_pw(u.password, r["password_hash"]):
        raise HTTPException(401, "Wrong email or password")
    return {"user_id": r["user_id"], "name": r["first_name"], "token": make_token(r["user_id"])}

@app.post("/api/recognize")
async def recognize(audio: UploadFile = File(...), uid: int = Depends(current_user)):
    data = await audio.read()
    try:
        sample = fingerprint(data)               # [(hash, t_sample)]
    except Exception as e:
        raise HTTPException(400, f"Could not decode audio (is ffmpeg installed?): {e}")
    if not sample:
        return {"match_found": False, "reason": "no usable audio features"}
    by_hash = defaultdict(list)
    for h, t in sample:
        by_hash[h].append(t)

    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        # index-accelerated lookup (B-Tree on hash)
        cur.execute("SELECT song_id, hash, time_offset FROM Fingerprints WHERE hash = ANY(%s)", (list(by_hash),))
        votes = defaultdict(Counter)             # song -> histogram of (t_db - t_sample)
        for row in cur.fetchall():
            for ts in by_hash[row["hash"]]:
                votes[row["song_id"]][row["time_offset"] - ts] += 1
        if not votes:
            return {"match_found": False}
        best_song, best_score = max(((s, c.most_common(1)[0][1]) for s, c in votes.items()), key=lambda x: x[1])
        if best_score < MIN_MATCHES:
            return {"match_found": False, "best_score": best_score}
        cur.execute("SELECT * FROM v_song_details WHERE song_id=%s", (best_song,))
        song = cur.fetchone()
        cur.execute("SELECT log_recognition(%s,%s)", (uid, best_song))   # same transaction
    confidence = round(min(100.0, 100.0 * best_score / (MIN_MATCHES * 4)), 1)
    return {"match_found": True, "confidence": confidence, "matches": best_score, "song": song}

@app.get("/api/history")
def history(uid: int = Depends(current_user)):
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT history_id, song_id, title, artists, genres, release_year, recognized_at FROM v_user_history WHERE user_id=%s ORDER BY recognized_at DESC LIMIT 100", (uid,))
        rows = cur.fetchall()
    for r in rows:
        r["recognized_at"] = r["recognized_at"].isoformat()
    return rows

@app.get("/api/health")
def health():
    return {"ok": True}
