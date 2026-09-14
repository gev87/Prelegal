"""
The Mutual NDA cover page, as the API sees it.

A hand-mirror of ``NdaFields`` in ``frontend/lib/nda/schema.ts``, down to the
camelCase spelling of every key. The names are camelCase rather than the
snake_case the rest of this codebase uses because they *are* the wire format:
the browser holds this object as its own state and hands it straight back, so
renaming here would mean a translation layer on both sides that exists only to
satisfy a naming convention.

The constrained fields are enums rather than strings on purpose. These models
are handed to the LLM as its Structured Outputs schema, where an enum is not a
hint but a decoding constraint — the model *cannot* answer "CA" for a state or
"annually" for a term mode. Every string field left unconstrained here is one
the server would otherwise have to parse back out of English.

``tests/test_nda_fields.py`` pins the state list against a copy taken from the
frontend, so the two drifting apart fails the suite rather than surfacing as a
document that will not render.
"""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, Field

from app.field_paths import read_leaf, write_leaf

#: Section 9 of the Standard Terms reads "the laws of the State of …", so the
#: value is the state's full name. Verbatim from ``US_STATES`` in
#: ``frontend/lib/nda/schema.ts``, in the same order.
US_STATES: tuple[str, ...] = (
    "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
    "Connecticut", "Delaware", "District of Columbia", "Florida", "Georgia",
    "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky",
    "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota",
    "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire",
    "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota",
    "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island",
    "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont",
    "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming",
)

#: Built from the tuple above rather than written out as fifty-one members.
#: One list to keep in step with the frontend is enough; two copies in the
#: same file would be a second place to forget.
USState = StrEnum("USState", {state.upper().replace(" ", "_"): state for state in US_STATES})

MIN_TERM_YEARS = 1
MAX_TERM_YEARS = 99


class MndaTermMode(StrEnum):
    """Whether the arrangement to exchange information ends on a date."""

    FIXED = "fixed"
    UNTIL_TERMINATED = "until-terminated"


class ConfidentialityMode(StrEnum):
    """Whether the duty to protect what was exchanged ever expires."""

    FIXED = "fixed"
    PERPETUAL = "perpetual"


class Party(BaseModel):
    """One side of the agreement. A blank string means "not answered yet" —
    the frontend starts every one of these empty."""

    company: str
    signatoryName: str
    signatoryTitle: str
    noticeAddress: str


class NdaFields(BaseModel):
    """The whole cover page.

    Serves three roles at once: what the browser sends as its current state,
    the Structured Outputs schema the model fills in, and what comes back on
    the response. They are the same shape because keeping them the same shape
    is what lets the browser assign the response straight into its own state.
    """

    purpose: str
    effectiveDate: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    mndaTermMode: MndaTermMode
    mndaTermYears: int = Field(ge=MIN_TERM_YEARS, le=MAX_TERM_YEARS)
    confidentialityMode: ConfidentialityMode
    confidentialityYears: int = Field(ge=MIN_TERM_YEARS, le=MAX_TERM_YEARS)
    governingLaw: USState
    jurisdiction: str
    modifications: str
    partyOne: Party
    partyTwo: Party


class FieldPath(StrEnum):
    """Every leaf of ``NdaFields``, addressable by name.

    The dotted spelling for party details matches the keys the frontend
    already uses for validation errors (``partyOne.company``), so one
    vocabulary names a field on both sides of the wire and in both
    directions — the model says what it just set, the browser says what has
    been confirmed so far.
    """

    PURPOSE = "purpose"
    EFFECTIVE_DATE = "effectiveDate"
    MNDA_TERM_MODE = "mndaTermMode"
    MNDA_TERM_YEARS = "mndaTermYears"
    CONFIDENTIALITY_MODE = "confidentialityMode"
    CONFIDENTIALITY_YEARS = "confidentialityYears"
    GOVERNING_LAW = "governingLaw"
    JURISDICTION = "jurisdiction"
    MODIFICATIONS = "modifications"
    PARTY_ONE_COMPANY = "partyOne.company"
    PARTY_ONE_SIGNATORY_NAME = "partyOne.signatoryName"
    PARTY_ONE_SIGNATORY_TITLE = "partyOne.signatoryTitle"
    PARTY_ONE_NOTICE_ADDRESS = "partyOne.noticeAddress"
    PARTY_TWO_COMPANY = "partyTwo.company"
    PARTY_TWO_SIGNATORY_NAME = "partyTwo.signatoryName"
    PARTY_TWO_SIGNATORY_TITLE = "partyTwo.signatoryTitle"
    PARTY_TWO_NOTICE_ADDRESS = "partyTwo.noticeAddress"


# ``read_leaf``/``write_leaf`` used to live here. PL-6 moved them to
# ``app.field_paths`` when every document type grew its own field paths and
# they stopped being about the Mutual NDA. Re-exported rather than relocated
# outright so existing imports of ``app.nda_fields.read_leaf`` keep working.
