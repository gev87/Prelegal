"""
The conversation that fills in the cover page.

Stateless, deliberately. The browser keeps the transcript and the current
cover page and sends both every turn; this endpoint adds a system prompt,
asks the model, and hands back a reply and an updated cover page. Nothing is
stored, so there is no session to expire, nothing to clean up, and a restart
costs a user nothing — which is the same bargain ``app.db`` strikes, for the
same reason.

The one subtle piece is how a field changes, and it is worth reading before
changing anything here.

The model answers with its *whole* view of the cover page plus a list of the
paths it means to have changed. The server then applies only the listed
paths. That asymmetry is the entire safety mechanism: a model that quietly
rewrites a company name it was not asked about has that rewrite dropped,
because the name is not in ``updated_fields``. Asking for a partial answer
instead would put the same trust in the model's discipline, but with a schema
full of optional fields, where a null cannot distinguish "unchanged" from
"cleared". Here every field is required, every constrained field is a real
enum, and the guarantee is enforced by code on this side of the wire.
"""

from __future__ import annotations

from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app import llm
from app.chat_prompt import build_system_prompt
from app.nda_fields import (
    MAX_TERM_YEARS,
    MIN_TERM_YEARS,
    FieldPath,
    NdaFields,
    read_leaf,
    write_leaf,
)

router = APIRouter(tags=["chat"])

#: Caps on what one browser may send. The transcript grows without limit as a
#: conversation runs, and every turn resends all of it, so an absent cap is a
#: bill rather than a crash.
MAX_MESSAGES = 200
MAX_MESSAGE_CHARACTERS = 4000


class ChatMessage(BaseModel):
    """One turn of the transcript.

    ``system`` is not an accepted role. The server writes the system prompt
    itself on every call, and a browser that could supply one could rewrite
    the assistant's instructions — Pydantic refuses it with a 422 before the
    handler ever runs.
    """

    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARACTERS)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(max_length=MAX_MESSAGES)
    fields: NdaFields
    #: Everything the assistant has settled so far, accumulated by the
    #: browser from previous replies. Without it the model cannot tell an
    #: answer from a default — see ``chat_prompt._render_confirmed``.
    confirmedFields: list[FieldPath] = Field(default_factory=list)
    #: The visitor's own date, not the server's. The frontend already works
    #: this way for the effective date, and near midnight the two disagree.
    today: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")


class ChatTurn(BaseModel):
    """What the model is asked to produce. Not what the browser receives —
    see the module docstring for why the two differ."""

    reply: str
    fields: NdaFields
    updated_fields: list[FieldPath]


class ChatResponse(BaseModel):
    reply: str
    #: A complete cover page, already merged. The browser assigns it to its
    #: own state as-is and needs no merge logic of its own.
    fields: NdaFields
    #: What actually changed, after the merge dropped anything unlisted.
    #: Feeds the browser's running set of settled answers.
    updatedFields: list[FieldPath]


@router.post(
    "/chat",
    response_model=ChatResponse,
    dependencies=[Depends(llm.ensure_configured)],
)
def chat(request: ChatRequest) -> ChatResponse:
    prompt = build_system_prompt(
        request.fields, set(request.confirmedFields), _usable_date(request.today)
    )
    messages = [{"role": "system", "content": prompt}]
    messages += [message.model_dump() for message in request.messages]

    turn = llm.complete_structured(messages, ChatTurn)
    merged, applied = apply_updates(request.fields, turn.fields, turn.updated_fields)

    return ChatResponse(reply=turn.reply, fields=merged, updatedFields=applied)


def apply_updates(
    current: NdaFields, proposed: NdaFields, updated: list[FieldPath]
) -> tuple[NdaFields, list[FieldPath]]:
    """Copies the listed paths from ``proposed`` onto ``current``.

    Everything else in ``proposed`` is discarded, however plausible it looks.
    A value that survives the enum and range constraints but is still not a
    real answer — the 30th of February — is dropped on its own, so one bad
    field costs that field rather than the whole turn.

    Returns the merged cover page and the paths that actually took, which are
    the listed paths minus anything dropped.
    """
    merged = current.model_copy(deep=True)
    applied: list[FieldPath] = []

    for path in updated:
        value = read_leaf(proposed, path)
        if not _is_usable(path, value):
            continue
        write_leaf(merged, path, value)
        applied.append(path)

    return merged, applied


def _is_usable(path: FieldPath, value: object) -> bool:
    """The checks the schema cannot make.

    Pydantic has already guaranteed the type, the enum membership and the
    year range by the time anything gets here. What it cannot guarantee is
    that a string matching the date pattern names a day that exists.
    """
    if path is FieldPath.EFFECTIVE_DATE:
        return isinstance(value, str) and _is_real_date(value)

    if path in (FieldPath.MNDA_TERM_YEARS, FieldPath.CONFIDENTIALITY_YEARS):
        return isinstance(value, int) and MIN_TERM_YEARS <= value <= MAX_TERM_YEARS

    return True


def _is_real_date(value: str) -> bool:
    try:
        date.fromisoformat(value)
    except ValueError:
        return False
    return True


def _usable_date(value: str) -> str:
    """The browser's date if it is a real one, today's otherwise.

    The pattern on the request field only proves the shape. This is not a
    trust boundary — a wrong date makes for a wrong suggestion, not an
    exploit — so a nonsense value falls back rather than failing the turn.
    """
    return value if _is_real_date(value) else date.today().isoformat()
