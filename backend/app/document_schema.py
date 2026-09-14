"""
One document type's cover page, as a Pydantic model the LLM can be held to.

``NdaFields`` was written by hand because there was one document. There are
eleven now, so ten of them are built here by ``create_model`` from the
descriptors in ``document_fields.json``, and the eleventh — the Mutual NDA —
is looked up rather than built, returning the very same ``NdaFields`` and
``FieldPath`` classes PL-5 shipped. That lookup is the whole of "the Mutual
NDA stays a special case": one branch, not a parallel implementation.

Everything is cached per slug. A type's shape cannot change while the process
is up, and a Structured Outputs schema is expensive enough to assemble that
rebuilding one per request would be waste with no upside.

What survives unchanged from PL-5 is the part that matters. The model still
answers with its whole view of the cover page plus a list of the paths it
means to have changed, and ``apply_updates`` still copies only the listed
paths. Making the path list a per-type enum rather than one global one makes
that guarantee *tighter*: a model drafting a DPA cannot even name a leaf that
belongs to the NDA, because the enum it is decoding against has no such
member.
"""

from __future__ import annotations

from datetime import date
from enum import StrEnum
from functools import lru_cache
from typing import Any

from pydantic import BaseModel, Field, create_model

from app.document_types import (
    MUTUAL_NDA,
    PARTY_LEAVES,
    UNDETERMINED,
    DocumentType,
    FieldKind,
    FieldSpec,
    load_document_types,
    offerable,
)
from app.field_paths import read_leaf, write_leaf
from app.nda_fields import (
    MAX_TERM_YEARS,
    MIN_TERM_YEARS,
    ConfidentialityMode,
    FieldPath as NdaFieldPath,
    MndaTermMode,
    NdaFields,
    Party,
    USState,
)

#: The suggested purpose Common Paper prints on the blank MNDA cover page.
#: Mirrors ``DEFAULT_PURPOSE`` in ``frontend/lib/nda/schema.ts``.
NDA_DEFAULT_PURPOSE = (
    "Evaluating whether to enter into a business relationship with the other party."
)

#: Crossing between the Mutual NDA and any other type renames the two
#: parties. The NDA calls them ``partyOne``/``partyTwo`` and PL-6 is not
#: touching it; every generic type calls them ``partyA``/``partyB``. One map,
#: applied only when a switch has the NDA on exactly one side of it.
_PARTY_ALIASES = {
    "partyOne": "partyA",
    "partyTwo": "partyB",
    "partyA": "partyOne",
    "partyB": "partyTwo",
}


#: The two Mutual NDA leaves that genuinely mean the same thing as a
#: descriptor on a generic type, described the same way so ``_same_shape`` has
#: one comparison to make rather than two. Everything else on the NDA cover
#: page — the purpose, the two terms, the modifications — has no same-named
#: counterpart anywhere, so it drops out of a switch without needing to be
#: listed here. ``guide`` is empty because these are never used to build a
#: prompt; ``chat_prompt.FIELD_GUIDE`` still describes the NDA by hand.
_NDA_SHARED_SPECS: dict[str, FieldSpec] = {
    "effectiveDate": FieldSpec(
        path="effectiveDate", label="Effective Date", kind=FieldKind.DATE, guide=""
    ),
    "governingLaw": FieldSpec(
        path="governingLaw",
        label="Governing Law",
        kind=FieldKind.ENUM,
        enum_ref="us_state",
        guide="",
    ),
}


class EmptyFields(BaseModel):
    """The cover page before anyone has said what to draft: no leaves at all,
    so there is nothing for ``updated_fields`` to name and nothing to merge."""


#: Every slug the model may choose, ``undetermined`` included so it can say
#: "still working out what they want" rather than being forced to guess.
#: Built from the registry, so the eleven names exist in one place.
DocumentTypeSlug = StrEnum(
    "DocumentTypeSlug",
    {UNDETERMINED.upper(): UNDETERMINED}
    | {slug.upper().replace("-", "_"): slug for slug, _, _ in offerable()},
)


def _pascal(slug: str) -> str:
    return "".join(part.capitalize() for part in slug.split("-"))


def _leaf_annotation(spec: FieldSpec) -> tuple[Any, Any]:
    """The ``(type, Field(...))`` pair ``create_model`` wants for one leaf.

    Every kind becomes a real constraint rather than a hint, which is the
    point: handed to the provider as a Structured Outputs schema, an enum is
    something the model *cannot* decode outside of, and a pattern is checked
    before the answer ever reaches ``apply_updates``.
    """
    if spec.kind is FieldKind.DATE:
        return (str, Field(pattern=r"^\d{4}-\d{2}-\d{2}$"))
    if spec.kind is FieldKind.INT:
        return (int, Field(ge=spec.min or MIN_TERM_YEARS, le=spec.max or MAX_TERM_YEARS))
    if spec.kind is FieldKind.ENUM:
        return (_choice_enum(spec.enum_ref, spec.choices()), ...)
    return (str, ...)


@lru_cache(maxsize=None)
def _choice_enum(enum_ref: str | None, choices: tuple[str, ...]) -> type[StrEnum]:
    """One enum class per set of choices, not one per field.

    ``us_state`` resolves to the very ``USState`` the Mutual NDA already
    uses, and two generic types naming the same enum share a class. Building
    a fresh class per field would still *work* — a StrEnum member is a string
    — but carrying a value from one document to another would then be writing
    one type's enum into another type's slot, which Pydantic serialises with
    a warning and which makes two identical constraints compare unequal.
    """
    if enum_ref == "us_state":
        return USState
    name = f"{_pascal(enum_ref)}Choice" if enum_ref else "Choice"
    return StrEnum(name, {value.upper().replace(" ", "_"): value for value in choices})


@lru_cache(maxsize=None)
def _build_fields_model(slug: str) -> type[BaseModel]:
    doc = load_document_types()[slug]
    attributes: dict[str, tuple[Any, Any]] = {
        doc.party_a.path: (Party, ...),
        doc.party_b.path: (Party, ...),
    }
    for spec in doc.fields:
        attributes[spec.path] = _leaf_annotation(spec)
    return create_model(f"{_pascal(slug)}Fields", **attributes)


@lru_cache(maxsize=None)
def _build_field_path_enum(slug: str) -> type[StrEnum]:
    doc = load_document_types()[slug]
    members: dict[str, str] = {}
    for party in doc.parties:
        for leaf in PARTY_LEAVES:
            members[f"{party.path}_{leaf}".upper()] = f"{party.path}.{leaf}"
    for spec in doc.fields:
        members[spec.path.upper()] = spec.path
    return StrEnum(f"{_pascal(slug)}FieldPath", members)


def fields_model_for(slug: str) -> type[BaseModel]:
    """The cover-page model for ``slug``.

    Returns the literal ``NdaFields`` class for the Mutual NDA — not a
    reconstruction of it — so every guarantee PL-5's tests pin about that
    model still holds for exactly the object those tests describe.
    """
    if slug == MUTUAL_NDA:
        return NdaFields
    if slug == UNDETERMINED:
        return EmptyFields
    return _build_fields_model(slug)


def field_path_enum_for(slug: str) -> type[StrEnum] | None:
    """Every addressable leaf of ``slug``, or ``None`` when there are none."""
    if slug == MUTUAL_NDA:
        return NdaFieldPath
    if slug == UNDETERMINED:
        return None
    return _build_field_path_enum(slug)


def field_paths_for(slug: str) -> tuple[str, ...]:
    """The same leaves as plain strings, in the order the cover page reads."""
    paths = field_path_enum_for(slug)
    return tuple(member.value for member in paths) if paths else ()


@lru_cache(maxsize=None)
def chat_turn_model_for(slug: str) -> type[BaseModel]:
    """What the model is asked to produce for one turn on ``slug``.

    The same four-part shape for every type: what to say, which document this
    has turned out to be, the whole cover page as the model sees it, and the
    paths it means to have changed.
    """
    paths = field_path_enum_for(slug)
    # An enum with no members is not a schema any provider will decode
    # against, so the undetermined turn — which has no fields to update —
    # gets a list that is simply required to stay empty.
    updated: tuple[Any, Any] = (
        (list[paths], Field(default_factory=list))
        if paths is not None
        else (list[str], Field(default_factory=list, max_length=0))
    )
    return create_model(
        f"{_pascal(slug)}ChatTurn",
        reply=(str, ...),
        documentType=(DocumentTypeSlug, ...),
        fields=(fields_model_for(slug), ...),
        updated_fields=updated,
    )


def _blank_party() -> Party:
    return Party(company="", signatoryName="", signatoryTitle="", noticeAddress="")


def blank_fields_for(slug: str, today: str) -> BaseModel:
    """A cover page nobody has answered yet.

    The values are real ones, not empties: a date field holds today, a state
    field holds Delaware. That is not a shortcut around the constraints — it
    is the same bargain the NDA already strikes, where the blank cover page
    arrives holding Common Paper's own suggestions. What separates a
    suggestion from a decision is ``confirmedFields``, never the value
    itself, which is why ``chat_prompt`` shows the model only what has been
    confirmed.
    """
    if slug == UNDETERMINED:
        return EmptyFields()
    if slug == MUTUAL_NDA:
        return NdaFields(
            purpose=NDA_DEFAULT_PURPOSE,
            effectiveDate=today,
            mndaTermMode=MndaTermMode.FIXED,
            mndaTermYears=1,
            confidentialityMode=ConfidentialityMode.FIXED,
            confidentialityYears=1,
            governingLaw=USState.DELAWARE,
            jurisdiction="New Castle, DE",
            modifications="",
            partyOne=_blank_party(),
            partyTwo=_blank_party(),
        )

    doc = load_document_types()[slug]
    values: dict[str, Any] = {
        doc.party_a.path: _blank_party(),
        doc.party_b.path: _blank_party(),
    }
    for spec in doc.fields:
        if spec.kind is FieldKind.DATE:
            values[spec.path] = today
        elif spec.kind is FieldKind.INT:
            values[spec.path] = spec.min or MIN_TERM_YEARS
        elif spec.kind is FieldKind.ENUM:
            values[spec.path] = spec.choices()[0] if spec.enum_values else USState.DELAWARE
        else:
            values[spec.path] = ""
    return fields_model_for(slug)(**values)


def apply_updates(
    slug: str, current: BaseModel, proposed: BaseModel, updated: list
) -> tuple[BaseModel, list[str]]:
    """Copies the listed paths from ``proposed`` onto ``current``.

    Unchanged in substance from the version PL-5 put in ``app.chat``, only
    generalised past one document type. Everything in ``proposed`` that is
    not named in ``updated`` is discarded however plausible it looks, and a
    value that clears the schema but is still not a real answer — the 30th of
    February — is dropped on its own, so one bad field costs that field
    rather than the whole turn.
    """
    merged = current.model_copy(deep=True)
    applied: list[str] = []

    for path in updated:
        text = str(path)
        value = read_leaf(proposed, text)
        if not _is_usable(slug, text, value):
            continue
        write_leaf(merged, text, value)
        applied.append(text)

    return merged, applied


def _is_usable(slug: str, path: str, value: object) -> bool:
    """The checks the schema cannot make.

    Pydantic has already guaranteed the type, the enum membership and any
    range by the time anything gets here. What it cannot guarantee is that a
    string matching the date pattern names a day that exists.
    """
    if slug == MUTUAL_NDA:
        if path == NdaFieldPath.EFFECTIVE_DATE.value:
            return isinstance(value, str) and is_real_date(value)
        if path in (
            NdaFieldPath.MNDA_TERM_YEARS.value,
            NdaFieldPath.CONFIDENTIALITY_YEARS.value,
        ):
            return isinstance(value, int) and MIN_TERM_YEARS <= value <= MAX_TERM_YEARS
        return True

    spec = load_document_types()[slug].field_by_path.get(path) if slug in load_document_types() else None
    if spec is not None and spec.kind is FieldKind.DATE:
        return isinstance(value, str) and is_real_date(value)
    return True


def is_real_date(value: str) -> bool:
    try:
        date.fromisoformat(value)
    except ValueError:
        return False
    return True


def switch_document_type(
    old_slug: str, old_fields: BaseModel, confirmed: set[str], new_slug: str, today: str
) -> tuple[BaseModel, list[str], list[str]]:
    """Moves to ``new_slug``, keeping every settled answer that still fits.

    Deterministic and computed here rather than narrated by the model, and
    for a sharper reason than tidiness. The Structured Outputs schema for a
    turn is fixed *before* the model answers, from the type in effect at the
    time — so a model that decides mid-turn to switch is necessarily
    describing the new cover page against the wrong schema. Its opinion of
    what should carry is therefore worth nothing, while its *intent* to
    switch is worth acting on. That is the same split PL-5 already makes
    between the paths a model lists and the values it invents.

    Only confirmed paths are considered: an unanswered field has nothing to
    carry and nothing to report. A path carries when the destination has a
    field of the same name, the same kind and the same choices — same name
    alone is not enough, or a free-text governing law could land in a slot
    the destination constrains to fifty-one states without ever being checked
    against it.

    Returns the new cover page, the paths that carried, and the paths that
    were dropped.
    """
    new_fields = blank_fields_for(new_slug, today)
    carried: list[str] = []
    dropped: list[str] = []

    crosses_nda = (old_slug == MUTUAL_NDA) != (new_slug == MUTUAL_NDA)
    destination = set(field_paths_for(new_slug))

    for path in field_paths_for(old_slug):
        if path not in confirmed:
            continue
        target = _translate(path, crosses_nda)
        if target in destination and _same_shape(old_slug, path, new_slug, target):
            write_leaf(new_fields, target, read_leaf(old_fields, path))
            carried.append(target)
        else:
            dropped.append(path)

    return new_fields, carried, dropped


def _translate(path: str, crosses_nda: bool) -> str:
    """The same leaf, spelled the way the destination spells it."""
    if not crosses_nda:
        return path
    head, _, tail = path.partition(".")
    return f"{_PARTY_ALIASES.get(head, head)}.{tail}" if tail else head


def _same_shape(old_slug: str, old_path: str, new_slug: str, new_path: str) -> bool:
    """Whether a value from one slot may be written into the other.

    Party leaves are the same four strings everywhere, so they always match.
    Everything else has to agree on kind, and on choices where it has them.
    """
    if "." in old_path:
        return True

    old_spec = _spec(old_slug, old_path)
    new_spec = _spec(new_slug, new_path)
    if old_spec is None or new_spec is None:
        # A leaf one side describes and the other does not. That is every
        # Mutual NDA field outside ``_NDA_SHARED_SPECS``: carrying one would
        # mean guessing whether a hand-written annotation and a generic
        # descriptor agree, so it is dropped and simply asked again.
        return False
    if old_spec.kind is not new_spec.kind:
        return False
    if old_spec.kind is FieldKind.ENUM:
        return old_spec.choices() == new_spec.choices()
    return True


def _spec(slug: str, path: str) -> FieldSpec | None:
    if slug == MUTUAL_NDA:
        return _NDA_SHARED_SPECS.get(path)
    types = load_document_types()
    if slug not in types:
        return None
    return types[slug].field_by_path.get(path)


def document_for(slug: str) -> DocumentType | None:
    """The descriptor for a generic type, or ``None`` for the NDA and for
    ``undetermined``, neither of which is described by data."""
    return load_document_types().get(slug)
