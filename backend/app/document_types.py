"""
The catalog of document types, as code.

Ten of the eleven document types are *data*: a list of field descriptors read
from ``document_fields.json``, the file next to this one. The Mutual NDA is
the eleventh and is deliberately absent from that file — it keeps the
hand-written ``app.nda_fields``/``frontend/lib/nda/schema.ts`` pair PL-5
shipped, because its cover page is the one Common Paper actually publishes as
a fillable form and the only one whose fields carry real modes and terms.

``document_fields.json`` lives inside ``backend/app/`` rather than beside
``catalog.json`` at the repository root for one blunt reason: the Dockerfile
copies ``backend/app`` into the runtime image and copies neither the
repository root nor ``templates/``. A catalog the server cannot read in the
container is a catalog that passes every test on a laptop and fails on
deploy. The frontend reads this same file at build time — see
``frontend/lib/documents/catalog.ts`` — so the 112 fields of the ten generic
types are described in exactly one place.

``tests/test_document_types.py`` checks every label in this file against the
spans in the template it describes, in both directions, so a Common Paper
template correction fails the suite rather than drifting quietly.
"""

from __future__ import annotations

import json
from enum import StrEnum
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, Field

from app.nda_fields import US_STATES

DOCUMENT_FIELDS_PATH = Path(__file__).with_name("document_fields.json")

#: The slug of the one hand-written type. Not in ``document_fields.json``;
#: every function that takes a slug special-cases it.
MUTUAL_NDA = "mutual-nda"

#: What the browser sends before anyone has said what they want to draft.
#: A real slug rather than ``None`` so the wire format never has to
#: distinguish "not answered" from "cleared" — the same reasoning that keeps
#: every field on ``NdaFields`` required.
UNDETERMINED = "undetermined"

#: The four things every signature block asks for, whatever a given document
#: calls the two sides. Declared once here rather than per type, so a party
#: means the same thing on all eleven and carries across a type switch
#: without a translation table.
PARTY_LEAVES: tuple[str, ...] = (
    "company",
    "signatoryName",
    "signatoryTitle",
    "noticeAddress",
)

#: Enumerations a field descriptor can name instead of listing its own
#: choices. Only one so far; a descriptor with choices peculiar to a single
#: document type spells them out inline in ``enum_values`` instead.
KNOWN_ENUMS: dict[str, tuple[str, ...]] = {"us_state": US_STATES}


class FieldKind(StrEnum):
    """How one field is constrained when it reaches the model.

    ``TEXT`` is the honest default for most of the ten generic types: their
    Standard Terms reference a cover-page value without ever saying what
    shape it takes, and inventing an enum the source document does not have
    would be guessing dressed up as validation.
    """

    TEXT = "text"
    DATE = "date"
    INT = "int"
    ENUM = "enum"


class FieldSpec(BaseModel):
    """One thing the cover page asks for."""

    path: str
    #: Exactly as the template spells it inside its ``<span>``. Doubles as
    #: the heading the rendered cover page prints and the name the assistant
    #: uses out loud, so it is prose, not an identifier.
    label: str
    #: Other spellings of the same term in the same template — usually a
    #: plural. Kept so the drift test can account for every span without
    #: inventing a second field for "Deliverable" beside "Deliverables".
    aliases: list[str] = Field(default_factory=list)
    kind: FieldKind = FieldKind.TEXT
    #: One line saying what the answer is *for*, in the voice a drafter would
    #: use. Goes into the system prompt verbatim.
    guide: str
    enum_ref: str | None = None
    enum_values: list[str] | None = None
    #: Bounds for an ``INT`` field. No descriptor uses one yet — the ten
    #: generic templates never say a value is a number — but the kind exists
    #: so a follow-up can promote a field without reshaping this model.
    min: int | None = None
    max: int | None = None

    def choices(self) -> tuple[str, ...]:
        """The permitted values, for an ``ENUM`` field."""
        if self.enum_values:
            return tuple(self.enum_values)
        if self.enum_ref:
            return KNOWN_ENUMS[self.enum_ref]
        raise ValueError(f"{self.path} is an enum with no choices")


class PartySpec(BaseModel):
    """One side of the agreement.

    ``path`` is always ``partyA``/``partyB``; ``role`` is what this document
    calls that side in English — "Customer", "Provider", "Company",
    "Partner". Keeping the path role-neutral is what lets both parties carry
    across a switch from, say, a Pilot Agreement to a DPA without caring that
    one calls them Customer and Provider in the other order.
    """

    path: str
    role: str


class DocumentType(BaseModel):
    slug: str
    name: str
    description: str
    template_filename: str
    party_a: PartySpec
    party_b: PartySpec
    fields: list[FieldSpec]

    @property
    def parties(self) -> tuple[PartySpec, PartySpec]:
        return (self.party_a, self.party_b)

    @property
    def field_by_path(self) -> dict[str, FieldSpec]:
        return {spec.path: spec for spec in self.fields}


@lru_cache(maxsize=1)
def load_document_types() -> dict[str, DocumentType]:
    """The ten generic types, read once.

    Cached because this is read on every chat turn and the file cannot change
    while the process is up — it ships inside the image.
    """
    raw = json.loads(DOCUMENT_FIELDS_PATH.read_text(encoding="utf-8"))
    return {slug: DocumentType(slug=slug, **entry) for slug, entry in raw.items()}


def generic_types() -> dict[str, DocumentType]:
    """Every type described by data — that is, all of them but the NDA."""
    return load_document_types()


def is_known(slug: str) -> bool:
    return slug == MUTUAL_NDA or slug in load_document_types()


def name_for(slug: str) -> str | None:
    """What to call a type on screen. ``None`` while undetermined, which is
    the browser's cue that there is no document to head the page with yet."""
    if slug == UNDETERMINED:
        return None
    if slug == MUTUAL_NDA:
        return "Mutual NDA"
    doc = load_document_types().get(slug)
    return doc.name if doc else None


@lru_cache(maxsize=1)
def offerable() -> tuple[tuple[str, str, str], ...]:
    """``(slug, name, description)`` for everything a visitor may ask for.

    The Mutual NDA is prepended by hand because it is the one type with no
    entry in ``document_fields.json``; its description is written here rather
    than read from ``catalog.json``, which does not ship in the image.
    """
    nda = (
        MUTUAL_NDA,
        "Mutual NDA",
        "Mutual non-disclosure agreement for two companies sharing confidential "
        "information, covering the purpose, how long the arrangement runs, how "
        "long confidentiality lasts, and governing law.",
    )
    rest = tuple(
        (doc.slug, doc.name, doc.description) for doc in load_document_types().values()
    )
    return (nda, *rest)
