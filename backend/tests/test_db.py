"""The database's one promised behaviour: it starts empty, every time."""

from __future__ import annotations

import sqlite3
from contextlib import closing
from pathlib import Path

from fastapi.testclient import TestClient

from app.db import connect, init_db


def test_init_db_creates_the_users_table(database_path: Path) -> None:
    init_db()

    with closing(connect()) as connection:
        columns = {row["name"] for row in connection.execute("PRAGMA table_info(users)")}

    assert columns == {"id", "email", "password_hash", "created_at"}


def test_init_db_discards_everything_already_there(database_path: Path) -> None:
    """The whole point of a disposable database. If this ever fails, a
    restart has started carrying state between runs."""
    init_db()
    with closing(connect()) as connection:
        connection.execute(
            "INSERT INTO users (email, password_hash) VALUES (?, ?)", ("a@b.com", "x")
        )
        connection.commit()

    init_db()

    with closing(connect()) as connection:
        assert connection.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0


def test_restarting_the_app_clears_registered_accounts(
    client: TestClient, credentials: dict[str, str], database_path: Path
) -> None:
    """The same promise, seen through the API: an email registered before a
    restart can be registered again after one."""
    assert client.post("/api/auth/signup", json=credentials).status_code == 201

    from app.main import app

    with TestClient(app) as restarted:
        assert restarted.post("/api/auth/signup", json=credentials).status_code == 201


def test_email_is_unique(database_path: Path) -> None:
    init_db()

    with closing(connect()) as connection:
        connection.execute(
            "INSERT INTO users (email, password_hash) VALUES (?, ?)", ("a@b.com", "x")
        )
        try:
            connection.execute(
                "INSERT INTO users (email, password_hash) VALUES (?, ?)", ("a@b.com", "y")
            )
        except sqlite3.IntegrityError:
            return

    raise AssertionError("a duplicate email was accepted")
