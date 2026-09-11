"""
The cover page models, and the fact that they still match the frontend.

``app.nda_fields`` is a hand-mirror of ``frontend/lib/nda/schema.ts``. Nothing
enforces that at build time, so the risk is a slow divergence nobody notices
until a document will not render. These tests are the enforcement: the state
list below is a second copy, taken from the frontend, and it exists precisely
so that changing one file without the other fails here.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.nda_fields import (
    US_STATES,
    FieldPath,
    NdaFields,
    Party,
    USState,
    read_leaf,
    write_leaf,
)

from tests.test_chat import DEFAULT_FIELDS

#: Copied from ``US_STATES`` in frontend/lib/nda/schema.ts. Deliberately not
#: imported from anywhere — a copy is the only thing that can catch a drift.
STATES_ACCORDING_TO_THE_FRONTEND = [
    "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
    "Connecticut", "Delaware", "District of Columbia", "Florida", "Georgia",
    "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky",
    "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota",
    "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire",
    "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota",
    "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island",
    "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont",
    "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming",
]


def test_the_states_match_the_frontend() -> None:
    assert list(US_STATES) == STATES_ACCORDING_TO_THE_FRONTEND


def test_the_states_cover_the_fifty_plus_the_district() -> None:
    assert len(US_STATES) == 51


def test_every_state_is_a_member_of_the_enum() -> None:
    """The enum is built from the tuple, so this is really a test that the
    building did what it looks like it did."""
    for state in US_STATES:
        assert USState(state).value == state


def test_a_field_path_exists_for_every_leaf() -> None:
    """A leaf with no path cannot be set by the assistant at all — it would
    be a field the conversation silently cannot reach."""
    leaves = set()
    for name, info in NdaFields.model_fields.items():
        if info.annotation is Party:
            leaves.update(f"{name}.{inner}" for inner in Party.model_fields)
        else:
            leaves.add(name)

    assert {path.value for path in FieldPath} == leaves


def test_reading_and_writing_a_plain_leaf() -> None:
    fields = NdaFields(**DEFAULT_FIELDS)
    write_leaf(fields, FieldPath.JURISDICTION, "Santa Clara, CA")

    assert read_leaf(fields, FieldPath.JURISDICTION) == "Santa Clara, CA"


def test_reading_and_writing_a_leaf_inside_a_party() -> None:
    fields = NdaFields(**DEFAULT_FIELDS)
    write_leaf(fields, FieldPath.PARTY_TWO_SIGNATORY_NAME, "Dana Okafor")

    assert read_leaf(fields, FieldPath.PARTY_TWO_SIGNATORY_NAME) == "Dana Okafor"
    assert fields.partyTwo.signatoryName == "Dana Okafor"
    assert fields.partyOne.signatoryName == ""


@pytest.mark.parametrize("bad", ["11-09-2026", "2026/09/11", "today", ""])
def test_it_refuses_a_date_that_is_not_shaped_like_one(bad: str) -> None:
    with pytest.raises(ValidationError):
        NdaFields(**{**DEFAULT_FIELDS, "effectiveDate": bad})


@pytest.mark.parametrize("bad", [0, 100, -1])
def test_it_refuses_a_term_outside_the_allowed_range(bad: int) -> None:
    with pytest.raises(ValidationError):
        NdaFields(**{**DEFAULT_FIELDS, "mndaTermYears": bad})


def test_it_refuses_an_abbreviated_state() -> None:
    """The Standard Terms read "the laws of the State of …", so a two-letter
    code would render as nonsense."""
    with pytest.raises(ValidationError):
        NdaFields(**{**DEFAULT_FIELDS, "governingLaw": "DE"})


@pytest.mark.parametrize("bad", ["annually", "forever", "1 year"])
def test_it_refuses_a_term_mode_it_does_not_recognise(bad: str) -> None:
    with pytest.raises(ValidationError):
        NdaFields(**{**DEFAULT_FIELDS, "mndaTermMode": bad})
