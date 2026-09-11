"""Password hashing — the one part of this foundation that would be
expensive to get wrong quietly."""

from __future__ import annotations

from app.security import hash_password, verify_password


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
