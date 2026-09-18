"""
The users and saved-documents database.

Deliberately a real file on disk and deliberately single-writer. Both of
those are load-bearing, and both are easy to "simplify" into a bug:

``:memory:`` would give *every connection* its own empty database, so a user
who just signed up would fail to sign in on the very next request — not
because the auth logic is wrong, but because the row was never in the
database that request opened.

More than one worker process would split the file's writers across
processes that cannot see each other's uncommitted state. ``uvicorn`` is
started without ``--workers`` for exactly this reason; adding it later means
moving off a single SQLite file first. Sessions inherit that constraint as of
PL-7: two workers would each hold their own signing secret and so reject each
other's cookies, for the same reason they cannot see each other's rows.

A saved document is the same two values the browser already holds while
drafting — the document type and the cover page — stored as a slug and a JSON
blob. Not the conversation that produced them: PL-7 asks that a visitor be
able to look back at a document, not resume drafting it, and the transcript is
worth nothing to a reader of a finished agreement.

``documents.user_id`` names ``users(id)`` as documentation. SQLite does not
enforce a foreign key unless ``PRAGMA foreign_keys=ON``, which nothing here
sets, so the constraint is a note to the next reader rather than a guarantee.
What actually keeps a row attached to the right person is that ``user_id``
only ever comes from ``app.auth.current_account`` — an account the request
just proved it holds a valid session for.
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
);

CREATE TABLE documents (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id),
    document_type TEXT NOT NULL,
    fields_json   TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX documents_user_id_idx ON documents(user_id);
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
