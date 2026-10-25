import os
from pathlib import Path

from dotenv import load_dotenv


# Load backend/.env regardless of the directory used to start the server.
load_dotenv(Path(__file__).with_name(".env"))

DB = {
    "host": os.getenv("DB_HOST", "localhost"),
    "port": int(os.getenv("DB_PORT", "5432")),
    "dbname": os.getenv("DB_NAME", "vibecheck_db"),
    "user": os.getenv("DB_USER", "postgres"),
    "password": os.getenv("DB_PASSWORD", ""),
}
JWT_SECRET = os.getenv("JWT_SECRET", "change-me-vibecheck")
MIN_MATCHES = int(os.getenv("MIN_MATCHES", "8"))  # min aligned hashes to accept a match
