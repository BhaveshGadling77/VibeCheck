-- VibeCheck schema (PostgreSQL). Run: psql -U postgres -d vibecheck_db -f schema.sql
DROP TABLE IF EXISTS History, Fingerprints, Song_Genres, Song_Artists, Songs, Genres, Artists, Users CASCADE;

CREATE TABLE Users (
  user_id SERIAL PRIMARY KEY,
  first_name VARCHAR(50) NOT NULL,
  middle_name VARCHAR(50),
  last_name VARCHAR(50),
  email VARCHAR(255) UNIQUE NOT NULL CHECK (email LIKE '%_@_%._%'),
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Artists (
  artist_id SERIAL PRIMARY KEY,
  first_name VARCHAR(50),
  middle_name VARCHAR(50),
  last_name VARCHAR(50),
  stage_name VARCHAR(100) NOT NULL UNIQUE,
  dob DATE CHECK (dob < CURRENT_DATE),
  nationality VARCHAR(50),
  tot_songs INT DEFAULT 0 CHECK (tot_songs >= 0),
  awards TEXT,
  bio TEXT
);

CREATE TABLE Genres (
  genre_id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  description TEXT
);

CREATE TABLE Songs (
  song_id SERIAL PRIMARY KEY,
  title VARCHAR(150) NOT NULL,
  duration INT NOT NULL CHECK (duration > 0),
  release_year INT CHECK (release_year >= 1900),
  audio_file_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Song_Artists (
  song_id INT REFERENCES Songs(song_id) ON DELETE CASCADE,
  artist_id INT REFERENCES Artists(artist_id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'Primary' CHECK (role IN ('Primary','Featured','Producer')),
  PRIMARY KEY (song_id, artist_id)
);

CREATE TABLE Song_Genres (
  song_id INT REFERENCES Songs(song_id) ON DELETE CASCADE,
  genre_id INT REFERENCES Genres(genre_id) ON DELETE CASCADE,
  PRIMARY KEY (song_id, genre_id)
);

CREATE TABLE Fingerprints (
  fp_id BIGSERIAL PRIMARY KEY,
  song_id INT NOT NULL REFERENCES Songs(song_id) ON DELETE CASCADE,
  hash BIGINT NOT NULL,
  time_offset INT NOT NULL CHECK (time_offset >= 0)
);
CREATE INDEX idx_fingerprints_hash ON Fingerprints(hash);
CREATE INDEX idx_fingerprints_song ON Fingerprints(song_id);

CREATE TABLE History (
  history_id BIGSERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES Users(user_id) ON DELETE CASCADE,
  song_id INT NOT NULL REFERENCES Songs(song_id) ON DELETE CASCADE,
  recognized_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_history_user ON History(user_id, recognized_at DESC);

-- Trigger 1: keep Artists.tot_songs in sync
CREATE OR REPLACE FUNCTION update_artist_song_count() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE Artists SET tot_songs = tot_songs + 1 WHERE artist_id = NEW.artist_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE Artists SET tot_songs = GREATEST(tot_songs - 1, 0) WHERE artist_id = OLD.artist_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_increment_tot_songs AFTER INSERT ON Song_Artists
  FOR EACH ROW EXECUTE FUNCTION update_artist_song_count();
CREATE TRIGGER trg_decrement_tot_songs AFTER DELETE ON Song_Artists
  FOR EACH ROW EXECUTE FUNCTION update_artist_song_count();

-- Stored function: log a recognition (used by the API, runs inside its transaction)
CREATE OR REPLACE FUNCTION log_recognition(p_user INT, p_song INT) RETURNS BIGINT AS $$
DECLARE new_id BIGINT;
BEGIN
  INSERT INTO History(user_id, song_id) VALUES (p_user, p_song) RETURNING history_id INTO new_id;
  RETURN new_id;
END; $$ LANGUAGE plpgsql;

-- View: song details with artists and genres aggregated
CREATE OR REPLACE VIEW v_song_details AS
SELECT s.song_id, s.title, s.duration, s.release_year,
       COALESCE(string_agg(DISTINCT a.stage_name, ', '), 'Unknown') AS artists,
       COALESCE(string_agg(DISTINCT g.name, ' / '), 'Unclassified') AS genres
FROM Songs s
LEFT JOIN Song_Artists sa ON sa.song_id = s.song_id
LEFT JOIN Artists a ON a.artist_id = sa.artist_id
LEFT JOIN Song_Genres sg ON sg.song_id = s.song_id
LEFT JOIN Genres g ON g.genre_id = sg.genre_id
GROUP BY s.song_id;

-- View: a user's history feed
CREATE OR REPLACE VIEW v_user_history AS
SELECT h.history_id, h.user_id, h.recognized_at, d.*
FROM History h JOIN v_song_details d ON d.song_id = h.song_id;
