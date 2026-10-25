"""Ingest songs:  python seed_db.py
Put audio in backend/songs/ named 'Artist - Title.mp3'. Optional songs/songs.csv overrides metadata:
filename,title,artist,genre,year
"""

import os
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["NUMEXPR_NUM_THREADS"] = "1"
os.environ["OMP_NUM_THREADS"] = "1"

import csv
from psycopg2.extras import execute_values
from db import get_conn
from fingerprint import fingerprint, load_audio

FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "songs")
meta = {}
csv_path = os.path.join(FOLDER, "songs.csv")
if os.path.exists(csv_path):
    for r in csv.DictReader(open(csv_path, encoding="utf-8")):
        meta[r["filename"]] = r

def parse(fn):
    if fn in meta:
        m = meta[fn]
        return m["title"], m["artist"], m.get("genre") or "Unclassified", int(m["year"]) if m.get("year") else None
    stem = os.path.splitext(fn)[0]
    artist, title = stem.split(" - ", 1) if " - " in stem else ("Unknown", stem)
    return title.strip(), artist.strip(), "Unclassified", None

for fn in sorted(os.listdir(FOLDER)):
    if not fn.lower().endswith((".mp3", ".wav", ".m4a", ".flac")):
        continue
    path = os.path.join(FOLDER, fn)
    title, artist, genre, year = parse(fn)
    print(f"Fingerprinting {fn} ...", flush=True)
    dur = int(len(load_audio(path)) / 22050)
    hashes = fingerprint(path)
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM Songs WHERE title=%s", (title,))
        if cur.fetchone():
            print("  already present, skipped"); continue
        cur.execute("INSERT INTO Artists(stage_name) VALUES (%s) ON CONFLICT (stage_name) DO UPDATE SET stage_name=EXCLUDED.stage_name RETURNING artist_id", (artist,))
        aid = cur.fetchone()[0]
        cur.execute("INSERT INTO Genres(name) VALUES (%s) ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING genre_id", (genre,))
        gid = cur.fetchone()[0]
        cur.execute("INSERT INTO Songs(title,duration,release_year,audio_file_url) VALUES (%s,%s,%s,%s) RETURNING song_id", (title, dur, year, fn))
        sid = cur.fetchone()[0]
        cur.execute("INSERT INTO Song_Artists(song_id,artist_id,role) VALUES (%s,%s,'Primary')", (sid, aid))  # trigger bumps tot_songs
        cur.execute("INSERT INTO Song_Genres(song_id,genre_id) VALUES (%s,%s)", (sid, gid))
        execute_values(cur, "INSERT INTO Fingerprints(song_id,hash,time_offset) VALUES %s",
                       [(sid, h, t) for h, t in hashes], page_size=5000)
    print(f"  stored {len(hashes)} hashes (song_id={sid})")
print("Done.")
