"""
Building a cover page's schema at runtime, and moving between them.

Two things are worth pinning here. One is that the Mutual NDA really is
looked up rather than rebuilt — ``is`` identity, not shape equality — because
everything PL-5's tests guarantee about ``NdaFields`` only transfers if the
object in play is that class. The other is that the safety mechanism survived
being generalised: ``apply_updates`` still ignores what the model did not
declare, on a type whose schema did not exist until the process started.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.document_schema import (
    EmptyFields,
    apply_updates,
    blank_fields_for,
    chat_turn_model_for,
    field_path_enum_for,
    field_paths_for,
    fields_model_for,
    switch_document_type,
)
from app.document_types import MUTUAL_NDA, UNDETERMINED, load_document_types
from app.nda_fields import FieldPath, NdaFields

TODAY = "2026-09-11"
EVERY_SLUG = [UNDETERMINED, MUTUAL_NDA, *sorted(load_document_types())]
GENERIC_SLUGS = sorted(load_document_types())


def test_the_mutual_nda_is_looked_up_rather_than_rebuilt() -> None:
    """Not "a model with the same fields" — the very class, so that every
    guarantee PL-5 pins about ``NdaFields`` still describes what is in use."""
    assert fields_model_for(MUTUAL_NDA) is NdaFields
    assert field_path_enum_for(MUTUAL_NDA) is FieldPath


def test_nothing_chosen_yet_has_no_fields_to_fill_in() -> None:
    assert fields_model_for(UNDETERMINED) is EmptyFields
    assert field_paths_for(UNDETERMINED) == ()


@pytest.mark.parametrize("slug", EVERY_SLUG)
def test_every_type_produces_a_schema_a_provider_can_decode_against(slug: str) -> None:
    """The one test that runs the whole catalog through the machinery. A
    descriptor with a bad kind or an enum with no choices fails here rather
    than on the first request for that document."""
    chat_turn_model_for(slug).model_json_schema()


@pytest.mark.parametrize("slug", EVERY_SLUG)
def test_a_blank_cover_page_satisfies_its_own_schema(slug: str) -> None:
    """The browser sends its current fields back every turn, so a blank one
    that its own model rejects would 422 the first request of every
    conversation."""
    blank = blank_fields_for(slug, TODAY)

    fields_model_for(slug).model_validate(blank.model_dump(mode="json"))


@pytest.mark.parametrize("slug", GENERIC_SLUGS)
def test_a_type_is_built_once_and_reused(slug: str) -> None:
    """Rebuilding a Structured Outputs schema per request would be waste with
    no upside — the shape cannot change while the process is up."""
    assert fields_model_for(slug) is fields_model_for(slug)
    assert chat_turn_model_for(slug) is chat_turn_model_for(slug)


@pytest.mark.parametrize("slug", GENERIC_SLUGS)
def test_both_parties_are_addressable_on_every_type(slug: str) -> None:
    paths = field_paths_for(slug)

    assert "partyA.company" in paths
    assert "partyB.noticeAddress" in paths


def test_one_types_paths_cannot_name_another_types_field() -> None:
    """Per-type path enums are a tighter guarantee than PL-5's single global
    one: a model drafting a pilot agreement cannot even say ``purpose``."""
    assert "purpose" in field_paths_for(MUTUAL_NDA)
    assert "purpose" not in field_paths_for("pilot-agreement")


def test_a_date_field_refuses_something_that_is_not_a_date() -> None:
    model = fields_model_for("pilot-agreement")
    blank = blank_fields_for("pilot-agreement", TODAY).model_dump(mode="json")

    with pytest.raises(ValidationError):
        model.model_validate({**blank, "effectiveDate": "next Tuesday"})


def test_a_state_field_refuses_something_that_is_not_a_state() -> None:
    """The generic enum is built from the same list the NDA uses, so it has
    to refuse an abbreviation exactly as ``NdaFields`` does."""
    model = fields_model_for("pilot-agreement")
    blank = blank_fields_for("pilot-agreement", TODAY).model_dump(mode="json")

    with pytest.raises(ValidationError):
        model.model_validate({**blank, "governingLaw": "CA"})


def test_it_ignores_a_change_the_model_did_not_declare_on_a_generic_type() -> None:
    """PL-5's central guarantee, re-run against a schema that did not exist
    until this process started. If generalising broke it, it broke here."""
    current = blank_fields_for("pilot-agreement", TODAY)
    proposed = current.model_copy(deep=True)
    proposed.pilotPeriod = "60 days"
    proposed.generalCapAmount = "$1,000,000"

    merged, applied = apply_updates("pilot-agreement", current, proposed, ["pilotPeriod"])

    assert merged.pilotPeriod == "60 days"
    assert merged.generalCapAmount == ""
    assert applied == ["pilotPeriod"]


def test_it_drops_a_date_that_is_not_a_real_day_on_a_generic_type() -> None:
    """The 30th of February clears the pattern and is still not a day. One
    bad field costs that field, not the whole turn."""
    current = blank_fields_for("pilot-agreement", TODAY)
    proposed = current.model_copy(deep=True)
    proposed.effectiveDate = "2026-02-30"
    proposed.pilotPeriod = "60 days"

    merged, applied = apply_updates(
        "pilot-agreement", current, proposed, ["effectiveDate", "pilotPeriod"]
    )

    assert merged.effectiveDate == TODAY
    assert merged.pilotPeriod == "60 days"
    assert applied == ["pilotPeriod"]


def test_choosing_a_first_document_is_just_a_switch_from_nothing() -> None:
    """Selection and switching are one code path on purpose — this is the
    test that says so."""
    moved, carried, dropped = switch_document_type(
        UNDETERMINED, EmptyFields(), set(), "service-level-agreement", TODAY
    )

    assert (carried, dropped) == ([], [])
    assert moved.targetUptime == ""


def test_a_switch_keeps_both_parties() -> None:
    """The likeliest reason to switch is realising the document is wrong, not
    the counterparty. Retyping both sides would be the worst part of it."""
    current = blank_fields_for("cloud-service-agreement", TODAY)
    current.partyA.company = "Acme Inc."
    current.partyB.signatoryName = "Dana Scully"

    moved, carried, _ = switch_document_type(
        "cloud-service-agreement",
        current,
        {"partyA.company", "partyB.signatoryName"},
        "pilot-agreement",
        TODAY,
    )

    assert moved.partyA.company == "Acme Inc."
    assert moved.partyB.signatoryName == "Dana Scully"
    assert set(carried) == {"partyA.company", "partyB.signatoryName"}


def test_a_switch_renames_the_parties_when_the_mutual_nda_is_on_one_side() -> None:
    """The NDA calls them ``partyOne``/``partyTwo`` and PL-6 did not touch
    it, so crossing that boundary is the one case needing a translation."""
    nda = blank_fields_for(MUTUAL_NDA, TODAY)
    nda.partyOne.company = "Acme Inc."

    moved, carried, _ = switch_document_type(
        MUTUAL_NDA, nda, {"partyOne.company"}, "pilot-agreement", TODAY
    )

    assert moved.partyA.company == "Acme Inc."
    assert carried == ["partyA.company"]


def test_a_switch_drops_an_answer_the_new_document_never_asks_for() -> None:
    nda = blank_fields_for(MUTUAL_NDA, TODAY)

    _, _, dropped = switch_document_type(
        MUTUAL_NDA, nda, {"purpose", "modifications"}, "pilot-agreement", TODAY
    )

    assert set(dropped) == {"purpose", "modifications"}


def test_a_switch_carries_a_field_both_documents_constrain_the_same_way() -> None:
    """``governingLaw`` is one of fifty-one states on both sides, so it
    carries. This is what "carry over what fits" has to mean to be useful."""
    current = blank_fields_for("cloud-service-agreement", TODAY)
    current.governingLaw = "New York"

    moved, carried, _ = switch_document_type(
        "cloud-service-agreement", current, {"governingLaw"}, "pilot-agreement", TODAY
    )

    assert moved.governingLaw == "New York"
    assert carried == ["governingLaw"]


def test_a_switch_never_carries_an_answer_nobody_settled() -> None:
    """A placeholder is not an answer. Carrying one would turn Delaware from
    a suggestion into a decision nobody made, silently."""
    current = blank_fields_for("cloud-service-agreement", TODAY)
    current.governingLaw = "New York"

    moved, carried, dropped = switch_document_type(
        "cloud-service-agreement", current, set(), "pilot-agreement", TODAY
    )

    assert moved.governingLaw == "Delaware"
    assert (carried, dropped) == ([], [])


def test_a_switch_leaves_the_document_it_came_from_untouched() -> None:
    """The caller still holds the old cover page. Writing the move into it
    would corrupt the state the browser is about to be told to replace."""
    current = blank_fields_for("cloud-service-agreement", TODAY)
    current.partyA.company = "Acme Inc."

    switch_document_type(
        "cloud-service-agreement", current, {"partyA.company"}, "pilot-agreement", TODAY
    )

    assert current.partyA.company == "Acme Inc."
