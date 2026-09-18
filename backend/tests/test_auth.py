"""The signup, signin, signout and me endpoints."""

from __future__ import annotations

import sqlite3
from contextlib import closing
from pathlib import Path

from fastapi.testclient import TestClient

from app.security import SESSION_COOKIE_NAME


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


# ==========================================================================
# Sessions
# ==========================================================================


def test_signup_signs_the_new_account_in(
    client: TestClient, credentials: dict[str, str]
) -> None:
    """Registering and then being asked to sign in would be asking the same
    two questions twice in a row."""
    response = client.post("/api/auth/signup", json=credentials)

    assert SESSION_COOKIE_NAME in response.cookies


def test_signin_sets_a_session_cookie(
    client: TestClient, credentials: dict[str, str]
) -> None:
    client.post("/api/auth/signup", json=credentials)
    client.cookies.clear()

    response = client.post("/api/auth/signin", json=credentials)

    assert SESSION_COOKIE_NAME in response.cookies


def test_the_session_cookie_is_not_readable_by_the_page(
    client: TestClient, credentials: dict[str, str]
) -> None:
    """HttpOnly is the whole reason the frontend has to ask ``/me`` who it is.
    Lose the flag and a script injected into a page that drafts legal
    agreements can walk off with the session."""
    response = client.post("/api/auth/signup", json=credentials)
    cookie = response.headers["set-cookie"].lower()

    assert "httponly" in cookie
    assert "samesite=lax" in cookie


def test_a_failed_signin_sets_no_cookie(
    client: TestClient, credentials: dict[str, str]
) -> None:
    response = client.post("/api/auth/signin", json=credentials)

    assert response.status_code == 401
    assert SESSION_COOKIE_NAME not in response.cookies


def test_me_reports_the_signed_in_account(
    signed_in_client: TestClient, credentials: dict[str, str]
) -> None:
    response = signed_in_client.get("/api/auth/me")

    assert response.status_code == 200
    assert response.json() == {"id": 1, "email": credentials["email"]}


def test_me_refuses_a_visitor_with_no_cookie(client: TestClient) -> None:
    response = client.get("/api/auth/me")

    assert response.status_code == 401


def test_me_refuses_a_cookie_that_was_not_signed_here(client: TestClient) -> None:
    """What a forged cookie gets. The value is well-formed; it is simply not
    signed by this process."""
    client.cookies.set(SESSION_COOKIE_NAME, "eyJ1aWQiOjF9.not-the-real-signature")

    response = client.get("/api/auth/me")

    assert response.status_code == 401


def test_me_refuses_a_valid_cookie_naming_an_account_that_is_gone(
    signed_in_client: TestClient, database_path: Path
) -> None:
    """The row can vanish under a perfectly good signature: ``init_db`` empties
    the table on every startup. The signing secret rotates at the same moment
    in the real app, so this is belt and braces — but the belt is worth
    testing, because a missing row must not become a 500."""
    with closing(sqlite3.connect(database_path)) as connection:
        connection.execute("DELETE FROM users")
        connection.commit()

    assert signed_in_client.get("/api/auth/me").status_code == 401


def test_signout_ends_the_session(signed_in_client: TestClient) -> None:
    assert signed_in_client.get("/api/auth/me").status_code == 200

    response = signed_in_client.post("/api/auth/signout")

    assert response.status_code == 204
    assert signed_in_client.get("/api/auth/me").status_code == 401


def test_signout_without_a_session_is_not_an_error(client: TestClient) -> None:
    """What the second click on the button does. Answering it with a 401 would
    be telling somebody off for reaching the state they asked for."""
    assert client.post("/api/auth/signout").status_code == 204
