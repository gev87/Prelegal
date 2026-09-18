"""
The conversation that fills in the cover page.

Stateless, deliberately. The browser keeps the transcript, the document type
and the current cover page and sends all three every turn; this endpoint adds
a system prompt, asks the model, and hands back a reply and an updated cover
page. Nothing is stored, so there is no session to expire, nothing to clean
up, and a restart costs a user nothing — which is the same bargain ``app.db``
strikes, for the same reason.

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
enum, and the guarantee is enforced by code on this side of the wire. It
lives in ``app.document_schema`` now rather than in this module, because
there are eleven cover pages rather than one.

PL-6 added a second turn shape to the same endpoint. Until somebody says what
they want to draft, ``documentType`` is ``undetermined``: the cover page has
no fields, the prompt's only job is to find out which document they mean, and
choosing one is handled by exactly the same code that handles changing their
mind later — a switch from ``undetermined`` is still a switch. One path, one
set of tests, no bespoke first turn.
"""

from __future__ import annotations

from datetime import date
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, ValidationError

from app import llm
from app.chat_prompt import build_system_prompt
from app.document_prompt import build_document_prompt, build_selection_prompt
from app.document_schema import (
    apply_updates,
    chat_turn_model_for,
    field_paths_for,
    fields_model_for,
    is_real_date,
    switch_document_type,
)
from app.document_types import (
    MUTUAL_NDA,
    UNDETERMINED,
    is_known,
    load_document_types,
    name_for,
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
    #: Which document this conversation has settled on, or ``undetermined``
    #: before it has. A real value rather than ``None`` so the wire format
    #: never has to tell "not answered" from "cleared" — the same reasoning
    #: that keeps every field on a cover page required.
    documentType: str = UNDETERMINED
    #: The shape depends on ``documentType``, so this cannot be one static
    #: Pydantic type any more. It is validated against the right model in the
    #: handler instead, which is what FastAPI would have been doing for us
    #: while there was only one document.
    fields: dict[str, Any] = Field(default_factory=dict)
    #: Everything the assistant has settled so far, accumulated by the
    #: browser from previous replies. Without it the model cannot tell an
    #: answer from a placeholder — see ``document_prompt.render_confirmed``.
    confirmedFields: list[str] = Field(default_factory=list)
    #: The visitor's own date, not the server's. The frontend already works
    #: this way for the effective date, and near midnight the two disagree.
    today: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")


class ChatResponse(BaseModel):
    reply: str
    #: The type actually in effect after this turn, which is not always the
    #: one that was sent: this is how the browser learns a document was
    #: chosen or changed.
    documentType: str
    #: What to call it on screen. ``None`` only while undetermined.
    documentTypeName: str | None
    #: A complete cover page, already merged. The browser assigns it to its
    #: own state as-is and needs no merge logic of its own.
    fields: dict[str, Any]
    #: What actually changed, after the merge dropped anything unlisted.
    #: Feeds the browser's running set of settled answers.
    updatedFields: list[str]
    #: Set only on a turn that changed the document type. The browser
    #: *replaces* its settled set with ``carriedFields`` rather than adding
    #: to it, because the answers that did not carry are outstanding again.
    carriedFields: list[str] = Field(default_factory=list)
    droppedFields: list[str] = Field(default_factory=list)


@router.post(
    "/chat",
    response_model=ChatResponse,
    dependencies=[Depends(llm.ensure_configured)],
)
def chat(request: ChatRequest) -> ChatResponse:
    active = request.documentType if is_known(request.documentType) else UNDETERMINED
    today = _usable_date(request.today)

    try:
        current = fields_model_for(active).model_validate(request.fields)
    except ValidationError as error:
        raise HTTPException(
            status_code=422, detail=f"fields do not match documentType {active!r}."
        ) from error

    known_paths = set(field_paths_for(active))
    confirmed = {path for path in request.confirmedFields if path in known_paths}

    messages = [{"role": "system", "content": _prompt(active, current, confirmed, today)}]
    messages += [message.model_dump() for message in request.messages]

    turn = llm.complete_structured(messages, chat_turn_model_for(active))
    chosen = str(turn.documentType)

    if chosen != active and is_known(chosen):
        moved, carried, dropped = switch_document_type(
            active, current, confirmed, chosen, today
        )
        return ChatResponse(
            reply=turn.reply,
            documentType=chosen,
            documentTypeName=name_for(chosen),
            fields=moved.model_dump(mode="json"),
            # Nothing was *answered* this turn. What survived the move is
            # reported separately, because the browser has to replace its
            # settled set rather than extend it.
            updatedFields=[],
            carriedFields=carried,
            droppedFields=dropped,
        )

    merged, applied = apply_updates(active, current, turn.fields, turn.updated_fields)

    return ChatResponse(
        reply=turn.reply,
        documentType=active,
        documentTypeName=name_for(active),
        fields=merged.model_dump(mode="json"),
        updatedFields=applied,
    )


def _prompt(slug: str, fields: BaseModel, confirmed: set[str], today: str) -> str:
    """The system message for this turn, by document type.

    Three cases and no more: nothing chosen yet, the hand-written Mutual NDA,
    and any of the ten types described by descriptors.
    """
    if slug == UNDETERMINED:
        return build_selection_prompt(today)
    if slug == MUTUAL_NDA:
        return build_system_prompt(fields, confirmed, today)
    return build_document_prompt(load_document_types()[slug], fields, confirmed, today)


def _usable_date(value: str) -> str:
    """The browser's date if it is a real one, today's otherwise.

    The pattern on the request field only proves the shape. This is not a
    trust boundary — a wrong date makes for a wrong suggestion, not an
    exploit — so a nonsense value falls back rather than failing the turn.
    """
    return value if is_real_date(value) else date.today().isoformat()
