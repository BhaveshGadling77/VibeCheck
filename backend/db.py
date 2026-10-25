import psycopg2
from psycopg2.pool import SimpleConnectionPool
from contextlib import contextmanager
from config import DB

pool = SimpleConnectionPool(1, 10, **DB)

@contextmanager
def get_conn():
    conn = pool.getconn()
    try:
        yield conn
        conn.commit()          # whole block is one ACID transaction
    except Exception:
        conn.rollback()
        raise
    finally:
        pool.putconn(conn)
