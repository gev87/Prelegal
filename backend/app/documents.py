"""
The documents somebody has saved.

Three routes over one table, all of them behind ``RequireAccount``: a list has
no meaning without a person whose list it is. Everything else about drafting
stays open to a visitor with no account — see ``app.auth``.

What is stored is the pair the browser already holds while drafting, the
document type and the cover page, and nothing else. Not the rendered
agreement: the Markdown is assembled in the frontend from the Standard Terms
baked into its build (``frontend/lib/documents/render.ts``), and the server has
no renderer to reproduce it with. Storing text the server cannot regenerate
would also freeze it — a correction to a template would reach every live draft
and none of the saved ones. Storing the answers instead means a saved document
is re-rendered by the same code as a live one, and improves with it.

The cover page is validated on the way in by ``fields_model_for``, the same
call ``app.chat`` makes on every turn. One ruleset, so a document that the
assistant would accept is a document this will store, and there is no second
definition of a valid cover page to keep in step with the first.
"""

from __future__ import annotations

import json
import sqlite3
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, ValidationError

from app.auth import RequireAccount
from app.db import get_connection
from app.document_schema import fields_model_for
from app.document_types import is_known, name_for

router = APIRouter(tags=["documents"])

Connection = Annotated[sqlite3.Connection, Depends(get_connection)]


class SaveDocumentRequest(BaseModel):
    """A finished cover page, as the browser has it."""

    documentType: str
    fields: dict[str, Any] = Field(default_factory=dict)


class SavedDocumentSummary(BaseModel):
    """One row of the list. Deliberately without ``fields``: a list of
    documents is read to choose one, and sending eleven cover pages to draw
    eleven headings is a waste of both ends."""

    id: int
    documentType: str
    #: What to call it on screen. ``None`` only if a stored slug has since
    #: stopped being a document type, which nothing does today.
    documentTypeName: str | None
    createdAt: str


class SavedDocument(SavedDocumentSummary):
    """One document, with the answers needed to render it again."""

    fields: dict[str, Any]


@router.post(
    "", response_model=SavedDocument, status_code=status.HTTP_201_CREATED
)
def save_document(
    request: SaveDocumentRequest, account: RequireAccount, connection: Connection
) -> SavedDocument:
    if not is_known(request.documentType):
        # Also how ``undetermined`` is refused: it is not a known type, so a
        # conversation that has not chosen a document yet cannot save one.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="That is not a document type this product drafts.",
        )

    try:
        fields = fields_model_for(request.documentType).model_validate(request.fields)
    except ValidationError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Those answers do not match that document's cover page.",
        ) from None

    # The validated model rather than the body as it arrived, so what lands in
    # the table is the canonical shape of that cover page and not whatever
    # extra keys a caller happened to send.
    with connection:
        cursor = connection.execute(
            "INSERT INTO documents (user_id, document_type, fields_json)"
            " VALUES (?, ?, ?)",
            (
                account.id,
                request.documentType,
                json.dumps(fields.model_dump(mode="json")),
            ),
        )

    row = connection.execute(
        "SELECT id, document_type, fields_json, created_at FROM documents"
        " WHERE id = ?",
        (cursor.lastrowid,),
    ).fetchone()

    return _saved_document(row)


@router.get("", response_model=list[SavedDocumentSummary])
def list_documents(
    account: RequireAccount, connection: Connection
) -> list[SavedDocumentSummary]:
    # `id DESC` is the tiebreaker, not decoration: created_at is
    # `datetime('now')`, which is second-resolution, and two documents saved in
    # the same second would otherwise come back in whatever order SQLite felt
    # like — including, in a test, the reverse of the one asserted.
    rows = connection.execute(
        "SELECT id, document_type, created_at FROM documents"
        " WHERE user_id = ? ORDER BY created_at DESC, id DESC",
        (account.id,),
    ).fetchall()

    return [_saved_summary(row) for row in rows]


@router.get("/{document_id}", response_model=SavedDocument)
def get_document(
    document_id: int, account: RequireAccount, connection: Connection
) -> SavedDocument:
    row = connection.execute(
        "SELECT id, document_type, fields_json, created_at FROM documents"
        " WHERE id = ? AND user_id = ?",
        (document_id, account.id),
    ).fetchone()

    if row is None:
        # Somebody else's document and a document that never existed get the
        # same answer, for the reason sign-in gives one message to an unknown
        # email and a wrong password: telling them apart would let anyone count
        # what other people have drafted.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No saved document with that id.",
        )

    return _saved_document(row)


def _saved_summary(row: sqlite3.Row) -> SavedDocumentSummary:
    return SavedDocumentSummary(
        id=row["id"],
        documentType=row["document_type"],
        documentTypeName=name_for(row["document_type"]),
        createdAt=row["created_at"],
    )


def _saved_document(row: sqlite3.Row) -> SavedDocument:
    return SavedDocument(
        id=row["id"],
        documentType=row["document_type"],
        documentTypeName=name_for(row["document_type"]),
        createdAt=row["created_at"],
        fields=json.loads(row["fields_json"]),
    )
