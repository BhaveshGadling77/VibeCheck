# VibeCheck – Audio Recognition & Discovery (DBMS Mini-Project)

Android app (React Expo) records ~6 s of audio → laptop backend (FastAPI) fingerprints it → PostgreSQL matches hashes via a B-Tree index and time-offset voting → result shown on phone and logged in `History`.

## Run without Docker
1. Install PostgreSQL, Python 3.10+, **ffmpeg** (needed by pydub for .m4a/.mp3; add to PATH), Node.js.
2. `createdb vibecheck_db` then `psql -d vibecheck_db -f schema.sql`
3. Copy `backend/.env.example` to `backend/.env` and set your PostgreSQL password and a private `JWT_SECRET`.
4. `cd backend && pip install -r requirements.txt`
5. Put 5–10 tracks in `backend/songs/` named `Artist - Title.mp3` (or add `songs.csv`: `filename,title,artist,genre,year`), then `python seed_db.py`
6. `uvicorn main:app --host 0.0.0.0 --port 8000` (allow port 8000 in Windows Firewall)

## Run with Docker (Linux)

1. Copy `.env.example` to `.env`; set a private `DB_PASSWORD` and `JWT_SECRET`.
2. Copy `app/.env.example` to `app/.env` and set `EXPO_PUBLIC_API_URL` to your laptop's LAN IP, for example `http://192.168.1.20:8000`.
3. Put tracks in `backend/songs/`. This directory is ignored by Git and mounted read-only into the API container for seeding.
4. Start PostgreSQL and the API: `docker compose up --build -d`.
5. Seed the database: `docker compose run --rm api python seed_db.py`.
6. Open the API docs at `http://localhost:8000/docs`.
7. To run the Expo dev server in Docker and show its QR code, run `docker compose --profile mobile up --build` and scan it with Expo Go. The mobile profile uses Linux host networking so a physical phone can reach Metro and the API at your laptop's LAN IP.

Use `docker compose down` to stop the services; the PostgreSQL volume remains. `docker compose down -v` also deletes the database volume and its data. PostgreSQL initializes `schema.sql` only when that volume is first created.

## Setup (mobile)
1. Copy `app/.env.example` to `app/.env` and set `EXPO_PUBLIC_API_URL` to your laptop LAN IP (phone and laptop on same Wi-Fi / hotspot).
2. `cd app && npm install && npx expo start`, open with Expo Go on the phone.
3. Register → Listen → play a seeded song on another device → see the match; check the History tab.

## Tuning
- No match? Seed songs with the same decoder (ffmpeg), lower `MIN_MATCHES` in the Docker `.env` or `backend/.env`, record closer to the speaker.
- Viva demo SQL: `EXPLAIN ANALYZE SELECT * FROM Fingerprints WHERE hash = 123;` (shows index scan), `SELECT * FROM v_user_history;`, `SELECT stage_name, tot_songs FROM Artists;`
