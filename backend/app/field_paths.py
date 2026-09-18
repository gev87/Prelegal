"""
Reading and writing one leaf of a cover page, by name.

Lifted out of ``app.nda_fields`` unchanged when PL-6 generalised the product
to every document type. They never actually depended on the Mutual NDA: both
only ever split a dotted string and used ``getattr``/``setattr``, so they work
the same on a hand-written model and on one ``document_schema`` builds at
runtime. ``nda_fields`` still re-exports them, so every existing import reads
as it did before.

One level of nesting is the whole contract. Every document type's cover page
is flat apart from its two parties, which is what keeps a field path a
readable ``partyA.company`` rather than a traversal.
"""

from __future__ import annotations

from pydantic import BaseModel


def read_leaf(fields: BaseModel, path: str) -> object:
    """The value at ``path``.

    ``str(path)`` rather than ``path.value`` because a path arrives here
    either as a member of some ``FieldPath`` enum or as a plain string —
    ``switch_document_type`` deals in strings, since the path it is copying
    *to* belongs to a different type's enum than the one it read *from*.
    """
    head, _, tail = str(path).partition(".")
    owner = getattr(fields, head)
    return getattr(owner, tail) if tail else owner


def write_leaf(fields: BaseModel, path: str, value: object) -> None:
    """Sets the value at ``path``, in place."""
    head, _, tail = str(path).partition(".")
    if tail:
        setattr(getattr(fields, head), tail, value)
    else:
        setattr(fields, head, value)
