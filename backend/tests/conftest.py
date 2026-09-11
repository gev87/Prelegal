"""
Shared fixtures.

Every test gets its own database file in a temporary directory. The path is
redirected before the app starts, so the ``lifespan`` hook that recreates the
schema runs against the temporary file rather than a developer's real one —
which matters more than usual here, because ``init_db`` deletes whatever it
finds.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import config


@pytest.fixture
def database_path(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "test.db"
    monkeypatch.setattr(config, "DATABASE_PATH", path)
    return path


@pytest.fixture
def client(database_path: Path) -> Iterator[TestClient]:
    from app.main import app

    # Entering the context manager is what runs the lifespan hook, and so
    # what creates the schema. A bare TestClient(app) would leave every query
    # hitting a database with no tables in it.
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def credentials() -> dict[str, str]:
    return {"email": "dana@acme.com", "password": "correct-horse-battery"}
