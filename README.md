# VibeCheck – Audio Recognition & Discovery (DBMS Mini-Project)

Android app (React Expo) records ~6 s of audio → laptop backend (FastAPI) fingerprints it → PostgreSQL matches hashes via a B-Tree index and time-offset voting → result shown on phone and logged in `History`.

## Setup (laptop)
1. Install PostgreSQL, Python 3.10+, **ffmpeg** (needed by pydub for .m4a/.mp3; add to PATH), Node.js.
2. `createdb vibecheck_db` then `psql -d vibecheck_db -f schema.sql`
3. Copy `backend/.env.example` to `backend/.env` and set your PostgreSQL password and a private `JWT_SECRET`.
4. `cd backend && pip install -r requirements.txt`
5. Put 5–10 tracks in `backend/songs/` named `Artist - Title.mp3` (or add `songs.csv`: `filename,title,artist,genre,year`), then `python seed_db.py`
6. `uvicorn main:app --host 0.0.0.0 --port 8000` (allow port 8000 in Windows Firewall)

## Setup (mobile)
1. Copy `app/.env.example` to `app/.env` and set `EXPO_PUBLIC_API_URL` to your laptop LAN IP (phone and laptop on same Wi-Fi / hotspot).
2. `cd app && npm install && npx expo start`, open with Expo Go on the phone.
3. Register → Listen → play a seeded song on another device → see the match; check the History tab.

## Tuning
- No match? Seed songs with the same decoder (ffmpeg), lower `MIN_MATCHES` in `backend/.env`, record closer to the speaker.
- Viva demo SQL: `EXPLAIN ANALYZE SELECT * FROM Fingerprints WHERE hash = 123;` (shows index scan), `SELECT * FROM v_user_history;`, `SELECT stage_name, tot_songs FROM Artists;`
