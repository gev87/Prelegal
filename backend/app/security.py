"""
Password hashing, and the signing that turns an account into a session.

PL-4 built the first half and said the second belonged here: "when sessions
arrive, their signing and verification belong here, next to this, rather than
inside the request handlers." PL-7 is that ticket, and this is that code.

Both halves are deliberately free of FastAPI and of the database. What they
operate on is a password, or an account id, and a string — which is what lets
them be tested directly rather than through a request.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import secrets
import time

import bcrypt


def hash_password(password: str) -> str:
    """Hash a password for storage. Salted per call, so two identical
    passwords never produce the same hash."""
    return bcrypt.hashpw(_encode(password), bcrypt.gensalt()).decode("ascii")


def verify_password(password: str, password_hash: str) -> bool:
    """Check a password against a stored hash, in constant time."""
    try:
        return bcrypt.checkpw(_encode(password), password_hash.encode("ascii"))
    except ValueError:
        # A stored hash bcrypt cannot parse is corrupt, not a match.
        return False


def _encode(password: str) -> bytes:
    """
    Reduce a password of any length to something bcrypt will accept.

    bcrypt reads at most 72 bytes and raises on anything longer rather than
    truncating. Hashing to a fixed-width digest first means a long passphrase
    is neither rejected with a 500 nor silently cut short — the base64 of a
    SHA-256 digest is always 44 bytes.
    """
    return base64.b64encode(hashlib.sha256(password.encode("utf-8")).digest())


# ==========================================================================
# Sessions
# ==========================================================================

#: The cookie a signed-in browser carries.
#:
#: Set ``HttpOnly``, so nothing running on the page can read it. That is the
#: point — a script injected into a page that drafts legal agreements should
#: not be able to walk off with the session — and it is also why the frontend
#: has to ask ``GET /api/auth/me`` who it is rather than reading the cookie.
SESSION_COOKIE_NAME = "prelegal_session"

#: How long a signature stays good for.
#:
#: A ceiling rather than the usual lifetime. ``rotate_session_secret`` below
#: almost always ends a session long before this does; this only matters to a
#: server that stays up for a month.
SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

_session_secret = secrets.token_bytes(32)


def rotate_session_secret() -> None:
    """
    Discard every session this process has ever issued.

    Called from ``app.main``'s lifespan beside ``app.db.init_db``, and that
    pairing is the entire design. ``init_db`` deletes the users table on every
    startup, so a cookie that outlived a restart would name an account that no
    longer exists — at best a confusing 401, at worst somebody else's row after
    the ids are handed out again from 1. Rotating the secret at the same moment
    means such a cookie stops verifying instead. The session and the account it
    refers to end together, and no expiry logic anywhere has to keep the two in
    step.

    A function rather than a value assigned once at import, because import
    happens once per *process* while the lifespan runs once per *app start*.
    Under pytest that is the difference between one secret shared by every test
    in the run and a secret per ``TestClient`` — and the second is what lets the
    behaviour above be tested at all rather than merely asserted in a comment.
    """
    global _session_secret
    _session_secret = secrets.token_bytes(32)


def sign_session(account_id: int) -> str:
    """A cookie value naming an account, signed so it cannot be edited."""
    payload = _encode_claims({"uid": account_id, "iat": int(time.time())})
    return f"{payload}.{_signature(payload)}"


def verify_session(token: str | None) -> int | None:
    """
    The account a cookie names, or ``None`` when it names none.

    Returns rather than raises for every way a cookie can be unusable: absent,
    malformed, tampered with, signed under a secret this process has since
    rotated away, or simply older than ``SESSION_MAX_AGE_SECONDS``. None of
    those is an error, because they all mean the same thing to every caller —
    whoever sent this is a guest. That is the posture ``verify_password``
    already takes toward a stored hash it cannot parse.
    """
    if not token:
        return None

    payload, separator, signature = token.partition(".")

    if not separator:
        return None

    # Checked before the payload is decoded, so a forged payload never reaches
    # the JSON parser at all.
    if not hmac.compare_digest(signature, _signature(payload)):
        return None

    try:
        claims = json.loads(base64.urlsafe_b64decode(_repad(payload)))
        account_id = int(claims["uid"])
        issued_at = int(claims["iat"])
    except (ValueError, TypeError, KeyError, binascii.Error):
        return None

    if issued_at + SESSION_MAX_AGE_SECONDS <= int(time.time()):
        return None

    return account_id


def _signature(payload: str) -> str:
    return hmac.new(
        _session_secret, payload.encode("utf-8"), hashlib.sha256
    ).hexdigest()


def _encode_claims(claims: dict[str, int]) -> str:
    """Compact JSON, base64url, padding stripped — a cookie value has to
    survive being a cookie value, and ``=`` is not worth the argument."""
    encoded = json.dumps(claims, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(encoded).decode("ascii").rstrip("=")


def _repad(payload: str) -> bytes:
    """Put back the padding ``_encode_claims`` stripped."""
    return payload.encode("utf-8") + b"=" * (-len(payload) % 4)
