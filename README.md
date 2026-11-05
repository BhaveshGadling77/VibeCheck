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

1. Create the local environment files:

   ```bash
   cp .env.example .env
   cp app/.env.example app/.env
   ```

2. Edit `.env` and set a private `DB_PASSWORD` and `JWT_SECRET`. Edit `app/.env` and set `EXPO_PUBLIC_API_URL` to your laptop's LAN IP, for example `http://192.168.1.20:8000`. Your phone and laptop must be on the same network.
3. Put audio tracks in `backend/songs/`. This directory is ignored by Git and mounted read-only into the API container for seeding.
4. Build and start PostgreSQL and the API:

   ```bash
   docker compose up --build -d
   ```

5. If you added audio files, seed the database:

   ```bash
   docker compose run --rm api python seed_db.py
   ```

6. Open the API docs at `http://localhost:8000/docs`.
7. To also run Expo in Docker and show its QR code, run this command and scan the code with Expo Go:

   ```bash
   docker compose --profile mobile up --build
   ```

   The mobile profile uses Linux host networking so a physical phone can reach Metro and the API at your laptop's LAN IP.

Use `docker compose down` to stop the services; the PostgreSQL volume remains. `docker compose down -v` also deletes the database volume and its data. PostgreSQL initializes `schema.sql` only when that volume is first created.

## Setup (mobile)
The Expo app sends audio uploads to the FastAPI backend at `EXPO_PUBLIC_API_URL`. For a physical Android phone, this must be the computer's reachable LAN IPv4 address. `0.0.0.0` is only the address the backend binds to; it is not a destination the phone can connect to.

1. Find the computer's IPv4 address on the same Wi-Fi/hotspot as the phone. On Windows, run `ipconfig` and use the IPv4 Address under the active Wi-Fi adapter (for example, `192.168.1.20`). On Linux, run `hostname -I` and choose the address for the active Wi-Fi/LAN network. Do not use `127.0.0.1`, `localhost`, or `0.0.0.0` for a physical phone.
2. Copy `app/.env.example` to `app/.env`, then set the URL (no trailing slash):

   ```env
   EXPO_PUBLIC_API_URL=http://192.168.1.20:8000
   ```

   Replace `192.168.1.20` with the computer's actual LAN IPv4. The current value in `app/.env` must not be `http://0.0.0.0:8000`.
3. Start the backend so it listens on the network interface. From the repository root:

   ```bash
   cd backend
   uvicorn main:app --host 0.0.0.0 --port 8000
   ```

   Or, if using Docker, run `docker compose up --build -d` from the repository root. Allow inbound TCP port 8000 in the computer's firewall if prompted (on Windows, allow Python/Uvicorn on Private networks).
4. On the phone's browser, open `http://192.168.1.20:8000/api/health` using the same LAN IP. A JSON health response confirms that the phone can reach the API. If it does not load, verify both devices are on the same Wi-Fi/hotspot, check the IP again, and check the firewall/router's client isolation settings.
5. In `app/`, install dependencies and start Expo:

   ```bash
   npm install
   npx expo start --clear
   ```

   Re-scan the QR code in Expo Go after changing `.env`; Expo embeds `EXPO_PUBLIC_*` values when it starts. Register → Listen → play a seeded song on another device → see the match; check the History tab.

For Android Emulator instead of a physical phone, use `http://10.0.2.2:8000` as the API URL (the emulator's route to the host computer). `localhost` inside the emulator refers to the emulator itself.

### If uploads fail to connect

An error such as `Failed to connect to /10.1.228.4:8000` means the phone could not reach the backend at that address. `10.1.228.4` may be stale or belong to a different network adapter; replace it with the computer's current active LAN IPv4 in `app/.env`. An error for `/0.0.0.0:8000` means the app is using the backend bind address as its destination; set the LAN URL as above. Confirm the backend is running and the phone browser can open `/api/health`, then restart Expo with `npx expo start --clear` so it reloads the environment value.

## Tuning
- No match? Seed songs with the same decoder (ffmpeg), lower `MIN_MATCHES` in the Docker `.env` or `backend/.env`, record closer to the speaker.
- Viva demo SQL: `EXPLAIN ANALYZE SELECT * FROM Fingerprints WHERE hash = 123;` (shows index scan), `SELECT * FROM v_user_history;`, `SELECT stage_name, tot_songs FROM Artists;`
