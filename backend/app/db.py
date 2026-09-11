"""
The users database.

Deliberately a real file on disk and deliberately single-writer. Both of
those are load-bearing, and both are easy to "simplify" into a bug:

``:memory:`` would give *every connection* its own empty database, so a user
who just signed up would fail to sign in on the very next request — not
because the auth logic is wrong, but because the row was never in the
database that request opened.

More than one worker process would split the file's writers across
processes that cannot see each other's uncommitted state. ``uvicorn`` is
started without ``--workers`` for exactly this reason; adding it later means
moving off a single SQLite file first.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator

# Imported as a module, not by value: tests redirect the database at run
# time by setting ``config.DATABASE_PATH``, which a ``from … import`` would
# have already copied into this namespace.
from app import config

SCHEMA = """
CREATE TABLE users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
)
"""


def init_db() -> None:
    """
    Recreate the database from scratch.

    Called on every startup. The container's filesystem is already empty on
    every ``docker run``, so this matters most for the cases that do *not*
    rebuild: restarting a stopped container, and restarting the backend in
    native development. All three then mean the same thing.
    """
    config.DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    config.DATABASE_PATH.unlink(missing_ok=True)

    # Closed explicitly rather than with `with connect() as ...`: sqlite3's
    # context manager ends the *transaction*, not the connection, and a
    # connection left open holds the file — so the next init_db would fail to
    # delete it on Windows.
    connection = connect()
    try:
        connection.executescript(SCHEMA)
        connection.commit()
    finally:
        connection.close()


def connect() -> sqlite3.Connection:
    """A connection that yields rows addressable by column name."""
    connection = sqlite3.connect(config.DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def get_connection() -> Iterator[sqlite3.Connection]:
    """FastAPI dependency: one connection per request, always closed."""
    connection = connect()
    try:
        yield connection
    finally:
        connection.close()
