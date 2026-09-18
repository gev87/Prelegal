"""Password hashing and session signing — the two parts of this foundation
that would be expensive to get wrong quietly."""

from __future__ import annotations

import time

import pytest

from app import security
from app.security import (
    SESSION_MAX_AGE_SECONDS,
    hash_password,
    rotate_session_secret,
    sign_session,
    verify_password,
    verify_session,
)


def test_verifies_the_password_it_hashed() -> None:
    assert verify_password("correct-horse", hash_password("correct-horse"))


def test_rejects_the_wrong_password() -> None:
    assert not verify_password("wrong-horse", hash_password("correct-horse"))


def test_hash_does_not_contain_the_password() -> None:
    assert "correct-horse" not in hash_password("correct-horse")


def test_same_password_hashes_differently_each_time() -> None:
    """Salted per call. Identical hashes would tell anyone reading the table
    which accounts share a password."""
    assert hash_password("correct-horse") != hash_password("correct-horse")


def test_accepts_a_passphrase_longer_than_bcrypt_allows() -> None:
    """bcrypt reads 72 bytes and raises beyond that; app.security hashes the
    password down to a fixed width first. Without that, this is a 500."""
    passphrase = "a-very-long-passphrase-" * 20
    assert len(passphrase.encode()) > 72
    assert verify_password(passphrase, hash_password(passphrase))


def test_a_long_passphrase_is_not_truncated() -> None:
    """The failure the digest step could have introduced: if the password
    were cut at 72 bytes instead, these two would verify interchangeably."""
    base = "a-very-long-passphrase-" * 20
    assert not verify_password(base + "-different-ending", hash_password(base))


def test_corrupt_stored_hash_is_not_a_match() -> None:
    assert not verify_password("correct-horse", "not-a-bcrypt-hash")


def test_non_ascii_password_round_trips() -> None:
    assert verify_password("pässwörd-ünicode-✓", hash_password("pässwörd-ünicode-✓"))


# ==========================================================================
# Sessions
# ==========================================================================


def test_verifies_the_account_it_signed() -> None:
    assert verify_session(sign_session(7)) == 7


def test_rejects_a_token_with_an_edited_signature() -> None:
    """The half a forger would have to guess. Flipping one character of it
    must not be worth trying."""
    token = sign_session(7)
    edited = token[:-1] + ("0" if token.endswith("1") else "1")

    assert verify_session(edited) is None


def test_rejects_one_account_s_payload_under_another_s_signature() -> None:
    """The forgery that would actually be worth attempting: keep a signature
    that verifies and swap in somebody else's account id. The signature covers
    the payload, so the two no longer agree."""
    payload_of_theirs = sign_session(8).partition(".")[0]
    signature_of_mine = sign_session(7).rpartition(".")[2]

    assert verify_session(f"{payload_of_theirs}.{signature_of_mine}") is None


def test_rejects_a_token_signed_before_the_secret_rotated() -> None:
    """The restart contract in one assertion. ``app.main``'s lifespan rotates
    the secret beside ``init_db``, so a cookie that outlived a restart names an
    account that did not."""
    token = sign_session(7)
    rotate_session_secret()

    assert verify_session(token) is None


def test_rejects_a_token_older_than_the_maximum_age(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    token = _signed_at(monkeypatch, time.time() - SESSION_MAX_AGE_SECONDS - 60)

    assert verify_session(token) is None


def test_accepts_a_token_just_inside_the_maximum_age(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The other side of the boundary above. Without this, an expiry check
    that rejected everything would still pass the test that matters."""
    token = _signed_at(monkeypatch, time.time() - SESSION_MAX_AGE_SECONDS + 60)

    assert verify_session(token) == 7


@pytest.mark.parametrize(
    "token",
    ["", "not-a-token", "no-full-stop", "....", "a.b", "!!!.@@@", "."],
    ids=["empty", "words", "unsigned", "dots", "short", "not-base64", "bare-dot"],
)
def test_returns_none_for_a_token_it_cannot_parse(token: str) -> None:
    """All of these turn up eventually: a truncated cookie, a stale one left by
    something else on localhost, somebody poking at it. None is an exception —
    they all mean nobody is signed in."""
    assert verify_session(token) is None


def test_returns_none_when_there_is_no_cookie_at_all() -> None:
    assert verify_session(None) is None


def test_two_accounts_do_not_share_a_token() -> None:
    assert sign_session(7) != sign_session(8)


def _signed_at(monkeypatch: pytest.MonkeyPatch, when: float) -> str:
    """A token issued at a chosen moment.

    Moves the clock rather than hand-building a payload, so these tests go
    through the same ``sign_session`` everything else does and stay honest if
    the token format ever changes.
    """
    with monkeypatch.context() as clock:
        clock.setattr(security.time, "time", lambda: when)
        return sign_session(7)
