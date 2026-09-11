"""
Sign up and sign in.

Real endpoints against a real table, and deliberately *not* a gate. PL-4
asks for a login screen, not for authentication: these routes create and
check accounts, but they issue no session and no token, and no other route
consults them. The frontend can always walk past the screen without calling
either one.

That makes this the honest shape of the foundation — the account handling a
later ticket needs is here and tested, while nothing pretends to be
protected in the meantime.
"""

from __future__ import annotations

import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field

from app.db import get_connection
from app.security import hash_password, verify_password

router = APIRouter(tags=["auth"])

Connection = Annotated[sqlite3.Connection, Depends(get_connection)]


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
def sign_up(credentials: Credentials, connection: Connection) -> Account:
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

    return Account(id=cursor.lastrowid or 0, email=email)


@router.post("/signin", response_model=Account)
def sign_in(credentials: Credentials, connection: Connection) -> Account:
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

    return Account(id=row["id"], email=row["email"])


def _normalise(email: str) -> str:
    """Addresses are matched case-insensitively, so they are stored that way
    — otherwise Sam@example.com and sam@example.com become two accounts."""
    return email.strip().lower()
