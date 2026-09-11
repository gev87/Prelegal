"""
Password hashing.

Nothing in PL-4 is actually protected — there is no session, no token, and
no gated route. The hashing is real anyway: the ``users`` table is the one
piece of this foundation a later ticket will build real authentication on
top of, and a table full of plaintext passwords is not something you want to
discover you have inherited.

Carved out from ``app.auth`` on purpose. When sessions arrive, their signing
and verification belong here, next to this, rather than inside the request
handlers.
"""

from __future__ import annotations

import base64
import hashlib

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
