"""
Sign up, sign in, sign out, and who is asking.

PL-4 built these routes as deliberately *not* a gate: real accounts in a real
table, but no session, no token, and nothing consulting them. PL-7 issues the
session. Signing up or signing in now sets a cookie, and ``current_account``
turns that cookie back into an account for the routes that need one.

What did *not* change is who is allowed in. Drafting a document, talking to
the assistant and downloading the result still require no account at all —
PL-7 gates exactly one thing, the saved documents in ``app.documents``, on the
grounds that a list of what *you* drafted has no meaning without a you. A
visitor who never signs in sees the product behave exactly as it did before.
"""

from __future__ import annotations

import sqlite3
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from pydantic import BaseModel, EmailStr, Field

from app.db import get_connection
from app.security import (
    SESSION_COOKIE_NAME,
    SESSION_MAX_AGE_SECONDS,
    hash_password,
    sign_session,
    verify_password,
    verify_session,
)

router = APIRouter(tags=["auth"])

Connection = Annotated[sqlite3.Connection, Depends(get_connection)]

#: The session cookie, or ``None`` from a browser that has never signed in.
#: Optional at this level on purpose — "no cookie" is answered by
#: ``current_account`` with the same 401 as a cookie that does not verify,
#: rather than by FastAPI with a 422 about a missing parameter.
SessionCookie = Annotated[str | None, Cookie(alias=SESSION_COOKIE_NAME)]


class Credentials(BaseModel):
    """What both endpoints accept. Identical on purpose: signing up and
    signing in ask for the same two things, and a visitor who mistakes one
    for the other should get an error about the account, not about the
    shape of their request."""

    email: EmailStr
    password: str = Field(min_length=8, max_length=256)


class Account(BaseModel):
    """What both endpoints return. The password never travels back."""

    id: int
    email: EmailStr


@router.post("/signup", response_model=Account, status_code=status.HTTP_201_CREATED)
def sign_up(
    credentials: Credentials, connection: Connection, response: Response
) -> Account:
    email = _normalise(credentials.email)

    try:
        with connection:
            cursor = connection.execute(
                "INSERT INTO users (email, password_hash) VALUES (?, ?)",
                (email, hash_password(credentials.password)),
            )
    except sqlite3.IntegrityError:
        # The UNIQUE constraint on email is what makes this a race-free
        # check: testing for the row first and inserting after would let two
        # simultaneous signups both pass the test.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with that email already exists.",
        ) from None

    account = Account(id=cursor.lastrowid or 0, email=email)
    _issue_session(response, account.id)
    return account


@router.post("/signin", response_model=Account)
def sign_in(
    credentials: Credentials, connection: Connection, response: Response
) -> Account:
    email = _normalise(credentials.email)
    row = connection.execute(
        "SELECT id, email, password_hash FROM users WHERE email = ?", (email,)
    ).fetchone()

    # One message for both "no such account" and "wrong password". Telling
    # them apart would let anyone check which email addresses are registered.
    if row is None or not verify_password(credentials.password, row["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="That email and password do not match an account.",
        )

    account = Account(id=row["id"], email=row["email"])
    _issue_session(response, account.id)
    return account


@router.post("/signout", status_code=status.HTTP_204_NO_CONTENT)
def sign_out(response: Response) -> None:
    """
    Put the cookie out, whether or not there was one.

    Deliberately unguarded. Signing out while already signed out is what a
    second click on the button does, and answering it with a 401 would be
    telling somebody off for reaching the state they asked for.
    """
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")


def current_account(connection: Connection, session: SessionCookie = None) -> Account:
    """
    The account behind the request, or a 401.

    A dependency rather than a check inside each handler, so that a route is
    protected by its signature — ``account: RequireAccount`` — and cannot be
    added later without one.

    Every way of not being signed in gives the same answer: no cookie, a
    cookie this process can no longer verify, and a cookie naming a row that
    ``init_db`` has since deleted are one situation to the visitor, who needs
    to sign in again in all three cases.
    """
    account_id = verify_session(session)

    if account_id is not None:
        row = connection.execute(
            "SELECT id, email FROM users WHERE id = ?", (account_id,)
        ).fetchone()

        if row is not None:
            return Account(id=row["id"], email=row["email"])

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Sign in to see documents you have saved.",
    )


RequireAccount = Annotated[Account, Depends(current_account)]


@router.get("/me", response_model=Account)
def me(account: RequireAccount) -> Account:
    """
    Who the browser is signed in as.

    The session cookie is ``HttpOnly``, so the page cannot read it and work
    this out for itself. Asking is the only way, which makes this the frontend's
    single source of truth for whether to show an email or a "Sign in" link.
    """
    return account


def _issue_session(response: Response, account_id: int) -> None:
    """
    Sign the account into the cookie the browser will send back.

    ``samesite="lax"`` rather than ``"strict"``: the cookie should survive a
    visitor following a link into the product, which is how anyone arrives.

    ``secure`` is deliberately not set. Nothing in front of this app terminates
    TLS today — the container serves plain HTTP on 8000 — so requiring a secure
    channel would stop sessions working entirely rather than harden them. It
    belongs with the reverse proxy that first puts this on a real domain.
    """
    response.set_cookie(
        SESSION_COOKIE_NAME,
        sign_session(account_id),
        max_age=SESSION_MAX_AGE_SECONDS,
        httponly=True,
        samesite="lax",
        path="/",
    )


def _normalise(email: str) -> str:
    """Addresses are matched case-insensitively, so they are stored that way
    — otherwise Sam@example.com and sam@example.com become two accounts."""
    return email.strip().lower()
