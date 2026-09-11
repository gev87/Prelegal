"""
Serving the frontend.

The one arrangement the rest of the suite cannot see: in the container, this
process answers both the API and the pages, and everything about that lives
in a single `app.frontend(...)` call. These tests put a miniature export on
disk and check it is really served — without them, a mistake there surfaces
only when somebody builds the image.
"""

from __future__ import annotations

import importlib
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import config


@pytest.fixture
def export(tmp_path: Path) -> Path:
    """The shape `next build` produces: a page per directory, plus a 404."""
    root = tmp_path / "static"
    (root / "login").mkdir(parents=True)
    (root / "_next").mkdir()

    (root / "index.html").write_text("<html><body>creator</body></html>", encoding="utf8")
    (root / "login" / "index.html").write_text(
        "<html><body>sign in</body></html>", encoding="utf8"
    )
    (root / "404.html").write_text("<html><body>not found</body></html>", encoding="utf8")
    (root / "_next" / "chunk.js").write_text("console.log(1)", encoding="utf8")

    return root


@pytest.fixture
def served(export: Path, database_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setattr(config, "FRONTEND_DIR", export)

    # The mount is decided at import time, so the module has to be re-imported
    # once the directory exists — otherwise this tests the unmounted app.
    from app import main

    importlib.reload(main)
    with TestClient(main.app) as client:
        yield client

    importlib.reload(main)


def test_serves_the_creator_at_the_root(served: TestClient) -> None:
    response = served.get("/")

    assert response.status_code == 200
    assert "creator" in response.text


def test_serves_a_page_from_its_directory(served: TestClient) -> None:
    """`trailingSlash: true` writes login/index.html rather than login.html.
    A request for /login has to find it, or the login screen is a 404."""
    response = served.get("/login/")

    assert response.status_code == 200
    assert "sign in" in response.text


def test_redirects_the_slashless_form(served: TestClient) -> None:
    response = served.get("/login", follow_redirects=False)

    assert response.status_code == 307
    assert response.headers["location"].endswith("/login/")


def test_serves_static_assets(served: TestClient) -> None:
    response = served.get("/_next/chunk.js")

    assert response.status_code == 200
    assert response.text == "console.log(1)"


def test_unknown_path_gets_the_export_s_own_404(served: TestClient) -> None:
    """Not index.html. Falling back to the app would answer a mistyped URL
    with the creator and a 200."""
    response = served.get("/no/such/page")

    assert response.status_code == 404
    assert "not found" in response.text


def test_the_api_still_wins(served: TestClient, credentials: dict[str, str]) -> None:
    """The mount is registered last and catches everything left over, so the
    check that matters is that it did not swallow /api."""
    assert served.post("/api/auth/signup", json=credentials).status_code == 201
    assert served.get("/healthz").status_code == 200


def test_starts_without_a_frontend_to_serve(client: TestClient) -> None:
    """Native development never builds the export. The API has to work
    anyway, and an unknown path is a plain JSON 404."""
    assert client.get("/healthz").status_code == 200
    assert client.get("/no/such/page").status_code == 404
