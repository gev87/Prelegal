"""
The catalog of document types, and whether it still describes the templates.

The drift test is the point of this file. ``document_fields.json`` is a hand
-curated description of markup in ``templates/``, and the two can fall out of
step silently: Common Paper corrects a template, a span appears or is
renamed, and nothing breaks until somebody notices the assistant never asks
about a term the document references. Checking both directions turns that
into a failing test, the same way ``test_nda_fields`` pins the state list
against the frontend's copy.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.document_types import (
    MUTUAL_NDA,
    UNDETERMINED,
    FieldKind,
    is_known,
    load_document_types,
    name_for,
    offerable,
)

TEMPLATES = Path(__file__).resolve().parents[2] / "templates"

#: Every class Common Paper uses to mark a value that belongs on the
#: accompanying cover page, order form, SOW or business terms. They differ
#: only in which attachment carries the value; all of them mean "somebody
#: fills this in".
SPAN = re.compile(
    r'<span class="(?:coverpage_link|keyterms_link|orderform_link|sow_link|businessterms_link)">([^<]*)</span>'
)

#: Terms the party model answers rather than a field descriptor. Each party
#: already carries a notice address, so a template that names one is asking
#: for something the cover page collects twice over — once per side.
CARRIED_BY_PARTY = {"Notice Address"}


def spans_in(filename: str) -> set[str]:
    """Every distinct cover-page term a template refers to.

    The trailing possessive is stripped because a template writes both
    "Provider" and "Provider's" for one term, and they are not two fields.
    """
    text = (TEMPLATES / filename).read_text(encoding="utf-8")
    return {re.sub(r"[’']s$", "", match.strip()) for match in SPAN.findall(text)}


def described_by(slug: str) -> set[str]:
    """Every term the catalog claims that type collects."""
    doc = load_document_types()[slug]
    described = {doc.party_a.role, doc.party_b.role}
    for spec in doc.fields:
        described.add(spec.label)
        described.update(spec.aliases)
    return described


@pytest.mark.parametrize("slug", sorted(load_document_types()))
def test_every_term_a_template_references_is_described(slug: str) -> None:
    """A term the document mentions but the catalog does not describe is a
    field the assistant will never ask about, in a document that needs it."""
    doc = load_document_types()[slug]

    missing = spans_in(doc.template_filename) - described_by(slug) - CARRIED_BY_PARTY

    assert not missing, f"{slug} references terms nothing describes: {sorted(missing)}"


@pytest.mark.parametrize("slug", sorted(load_document_types()))
def test_every_described_field_is_referenced_by_its_template(slug: str) -> None:
    """The other direction, which catches the likelier mistake: a field kept
    after the template stopped using it, so the assistant asks for something
    that will not appear anywhere in the finished document."""
    doc = load_document_types()[slug]

    unused = described_by(slug) - spans_in(doc.template_filename)

    assert not unused, f"{slug} describes terms its template never uses: {sorted(unused)}"


@pytest.mark.parametrize("slug", sorted(load_document_types()))
def test_every_template_named_by_the_catalog_exists(slug: str) -> None:
    assert (TEMPLATES / load_document_types()[slug].template_filename).is_file()


def test_it_offers_every_document_type_including_the_hand_written_one() -> None:
    """The Mutual NDA has no entry in ``document_fields.json`` and would be
    invisible to anyone choosing a document if ``offerable`` forgot it."""
    slugs = [slug for slug, _, _ in offerable()]

    assert MUTUAL_NDA in slugs
    assert len(slugs) == len(load_document_types()) + 1


def test_every_offered_type_is_one_the_server_will_accept() -> None:
    """A type the assistant may name but the router rejects would strand a
    conversation the moment somebody accepted the offer."""
    for slug, _, _ in offerable():
        assert is_known(slug)


def test_undetermined_is_not_a_document_anyone_can_choose() -> None:
    assert not is_known(UNDETERMINED)
    assert name_for(UNDETERMINED) is None


def test_a_field_path_is_never_spelled_like_a_party_path() -> None:
    """Party leaves are addressed as ``partyA.company``. A top-level field
    containing a dot would collide with that and be written to the wrong
    place by ``write_leaf``."""
    for slug, doc in load_document_types().items():
        for spec in doc.fields:
            assert "." not in spec.path, f"{slug}.{spec.path}"


def test_every_enum_field_can_say_what_it_allows() -> None:
    """An enum with no choices cannot be turned into a decoding constraint,
    and would fail when the schema is built rather than when it is written."""
    for doc in load_document_types().values():
        for spec in doc.fields:
            if spec.kind is FieldKind.ENUM:
                assert spec.choices()


def test_every_field_says_what_its_answer_is_for() -> None:
    """The guide is what the model reads instead of the field name. A blank
    one leaves it asking about ``resubmissionPeriod`` by name."""
    for doc in load_document_types().values():
        for spec in doc.fields:
            assert spec.guide.strip(), f"{doc.slug}.{spec.path}"
