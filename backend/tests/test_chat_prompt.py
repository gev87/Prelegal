"""
What the assistant is told.

The prompt is the least pleasant part of this feature to debug through a
network call, which is why it is a pure function. These tests pin the things
that would otherwise fail quietly and expensively: a model that invents a
date, one that re-asks a question already answered, and one that sails past a
question because the default in front of it looked like an answer.
"""

from __future__ import annotations

from app.chat_prompt import build_system_prompt
from app.nda_fields import FieldPath, NdaFields

from tests.test_chat import BLANK_PARTY, DEFAULT_FIELDS


def a_prompt(fields: dict | None = None, confirmed: set | None = None, today: str = "2026-09-11") -> str:
    return build_system_prompt(
        NdaFields(**(fields or DEFAULT_FIELDS)), confirmed or set(), today
    )


def test_it_states_todays_date() -> None:
    """The page is a static export, so the model has no other way to know."""
    assert "2026-09-11" in a_prompt(today="2026-09-11")


def test_it_forbids_inventing_a_date() -> None:
    prompt = a_prompt()

    assert "never infer" in prompt.lower()


def test_it_lists_every_state_the_model_may_choose() -> None:
    prompt = a_prompt()

    assert "Delaware" in prompt
    assert "District of Columbia" in prompt
    assert "Wyoming" in prompt


def test_an_empty_conversation_says_nothing_is_settled() -> None:
    prompt = a_prompt(confirmed=set())

    assert "Nothing yet" in prompt


def test_a_default_is_not_reported_as_settled() -> None:
    """The whole reason ``confirmedFields`` exists.

    A blank cover page arrives holding Delaware, one year and a suggested
    purpose. Shown those as answers, the assistant would never ask the
    questions they stand in for, and the user would sign a document full of
    values nobody chose.
    """
    prompt = a_prompt(confirmed=set())

    assert "Nothing yet" in prompt
    assert "governingLaw: 'Delaware'" not in prompt


def test_a_settled_answer_is_reported_with_its_value() -> None:
    fields = {**DEFAULT_FIELDS, "partyOne": {**BLANK_PARTY, "company": "Acme Inc."}}
    prompt = a_prompt(fields=fields, confirmed={FieldPath.PARTY_ONE_COMPANY})

    assert "partyOne.company: 'Acme Inc.'" in prompt


def test_a_settled_answer_is_no_longer_outstanding() -> None:
    prompt = a_prompt(confirmed={FieldPath.PURPOSE})
    outstanding = prompt.split("# Still to ask about")[1]

    assert "- purpose" not in outstanding


def test_an_unsettled_answer_is_outstanding() -> None:
    prompt = a_prompt(confirmed=set())
    outstanding = prompt.split("# Still to ask about")[1]

    assert "- purpose" in outstanding
    assert "- partyTwo.noticeAddress" in outstanding


def test_a_finished_cover_page_stops_asking() -> None:
    prompt = a_prompt(confirmed=set(FieldPath))

    assert "ready to download" in prompt


def test_it_explains_that_unlisted_changes_are_ignored() -> None:
    """If the model does not know the server drops undeclared changes, it
    has no reason to declare them."""
    prompt = a_prompt()

    assert "updated_fields" in prompt
    assert "will not take effect" in prompt


def test_it_says_not_to_guess() -> None:
    prompt = a_prompt()

    assert "did not tell you" in prompt


def test_it_names_the_document_it_can_draft() -> None:
    """PL-5 keeps the product to one document. The assistant has to be able
    to say so rather than pretending to draft something else."""
    prompt = a_prompt()

    assert "Mutual NDA" in prompt
