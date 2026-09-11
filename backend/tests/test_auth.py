"""The signup and signin endpoints."""

from __future__ import annotations

import sqlite3
from contextlib import closing
from pathlib import Path

from fastapi.testclient import TestClient


def test_signup_creates_an_account(client: TestClient, credentials: dict[str, str]) -> None:
    response = client.post("/api/auth/signup", json=credentials)

    assert response.status_code == 201
    assert response.json() == {"id": 1, "email": credentials["email"]}


def test_signup_never_returns_the_password(
    client: TestClient, credentials: dict[str, str]
) -> None:
    response = client.post("/api/auth/signup", json=credentials)
    assert credentials["password"] not in response.text


def test_signup_stores_a_hash_not_the_password(
    client: TestClient, credentials: dict[str, str], database_path: Path
) -> None:
    client.post("/api/auth/signup", json=credentials)

    with closing(sqlite3.connect(database_path)) as connection:
        stored = connection.execute("SELECT password_hash FROM users").fetchone()[0]

    assert stored != credentials["password"]
    assert stored.startswith("$2")


def test_signup_rejects_an_email_already_registered(
    client: TestClient, credentials: dict[str, str]
) -> None:
    client.post("/api/auth/signup", json=credentials)
    response = client.post("/api/auth/signup", json=credentials)

    assert response.status_code == 409
    assert response.json()["detail"] == "An account with that email already exists."


def test_signup_treats_email_case_insensitively(
    client: TestClient, credentials: dict[str, str]
) -> None:
    """Otherwise Dana@acme.com and dana@acme.com become two accounts."""
    client.post("/api/auth/signup", json=credentials)
    response = client.post(
        "/api/auth/signup", json={**credentials, "email": "DANA@ACME.COM"}
    )

    assert response.status_code == 409


def test_signup_rejects_a_short_password(
    client: TestClient, credentials: dict[str, str]
) -> None:
    response = client.post("/api/auth/signup", json={**credentials, "password": "short"})
    assert response.status_code == 422


def test_signup_rejects_a_malformed_email(
    client: TestClient, credentials: dict[str, str]
) -> None:
    response = client.post("/api/auth/signup", json={**credentials, "email": "not-an-email"})
    assert response.status_code == 422


def test_signin_accepts_the_registered_password(
    client: TestClient, credentials: dict[str, str]
) -> None:
    client.post("/api/auth/signup", json=credentials)
    response = client.post("/api/auth/signin", json=credentials)

    assert response.status_code == 200
    assert response.json() == {"id": 1, "email": credentials["email"]}


def test_signin_accepts_a_differently_cased_email(
    client: TestClient, credentials: dict[str, str]
) -> None:
    client.post("/api/auth/signup", json=credentials)
    response = client.post(
        "/api/auth/signin", json={**credentials, "email": "Dana@Acme.Com"}
    )

    assert response.status_code == 200


def test_signin_rejects_the_wrong_password(
    client: TestClient, credentials: dict[str, str]
) -> None:
    client.post("/api/auth/signup", json=credentials)
    response = client.post("/api/auth/signin", json={**credentials, "password": "wrong-password"})

    assert response.status_code == 401


def test_signin_rejects_an_unknown_email(
    client: TestClient, credentials: dict[str, str]
) -> None:
    response = client.post("/api/auth/signin", json=credentials)
    assert response.status_code == 401


def test_unknown_email_and_wrong_password_are_indistinguishable(
    client: TestClient, credentials: dict[str, str]
) -> None:
    """Telling them apart would let anyone check which addresses are
    registered."""
    client.post("/api/auth/signup", json=credentials)

    wrong_password = client.post(
        "/api/auth/signin", json={**credentials, "password": "wrong-password"}
    )
    unknown_email = client.post(
        "/api/auth/signin", json={**credentials, "email": "nobody@acme.com"}
    )

    assert wrong_password.status_code == unknown_email.status_code
    assert wrong_password.json() == unknown_email.json()


def test_signin_does_not_admit_a_user_who_never_signed_up(
    client: TestClient, credentials: dict[str, str]
) -> None:
    client.post("/api/auth/signup", json={**credentials, "email": "someone@acme.com"})
    response = client.post("/api/auth/signin", json=credentials)

    assert response.status_code == 401
