"""
Saving documents and reading them back.

Every route here is guarded, so most of these tests exist to pin one of two
things: that a guest gets nowhere, and that one account cannot see another's
work. The rest check that what goes into the table is a cover page the rest of
the product would recognise, rather than whatever the caller happened to post.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.document_schema import blank_fields_for
from app.document_types import MUTUAL_NDA, UNDETERMINED

PILOT = "pilot-agreement"

#: The visitor's own date, which `blank_fields_for` needs to default any
#: effective date on the cover page. Fixed here so a saved document is the
#: same bytes whenever the suite runs.
TODAY = "2026-09-11"


def a_document(**overrides: Any) -> dict[str, Any]:
    """A saveable Mutual NDA, built from the same blank cover page the
    assistant starts every conversation with."""
    body: dict[str, Any] = {
        "documentType": MUTUAL_NDA,
        "fields": blank_fields_for(MUTUAL_NDA, TODAY).model_dump(mode="json"),
    }
    body.update(overrides)
    return body


def a_second_account(client: TestClient) -> None:
    """Sign the client in as somebody else, replacing the session it holds."""
    client.cookies.clear()
    response = client.post(
        "/api/auth/signup",
        json={"email": "rowan@other.com", "password": "correct-horse-battery"},
    )
    assert response.status_code == 201, response.text


# ==========================================================================
# Who may save
# ==========================================================================


def test_a_guest_cannot_save(client: TestClient) -> None:
    assert client.post("/api/documents", json=a_document()).status_code == 401


def test_a_guest_cannot_list(client: TestClient) -> None:
    assert client.get("/api/documents").status_code == 401


def test_a_guest_cannot_read_one(client: TestClient) -> None:
    assert client.get("/api/documents/1").status_code == 401


# ==========================================================================
# Saving
# ==========================================================================


def test_saving_returns_the_stored_document(signed_in_client: TestClient) -> None:
    response = signed_in_client.post("/api/documents", json=a_document())

    assert response.status_code == 201
    body = response.json()
    assert body["documentType"] == MUTUAL_NDA
    assert body["documentTypeName"] == "Mutual NDA"
    assert body["fields"] == a_document()["fields"]
    assert body["id"] >= 1
    assert body["createdAt"]


def test_saving_a_catalogued_type_works_too(signed_in_client: TestClient) -> None:
    """The ten data-driven types go through a model built at runtime rather
    than the hand-written NDA one. Both reach the same table."""
    document = a_document(
        documentType=PILOT,
        fields=blank_fields_for(PILOT, TODAY).model_dump(mode="json"),
    )

    response = signed_in_client.post("/api/documents", json=document)

    assert response.status_code == 201
    assert response.json()["documentType"] == PILOT


def test_refuses_a_document_type_that_does_not_exist(
    signed_in_client: TestClient,
) -> None:
    response = signed_in_client.post(
        "/api/documents", json=a_document(documentType="employment-contract")
    )

    assert response.status_code == 422


def test_refuses_to_save_a_conversation_that_has_chosen_nothing(
    signed_in_client: TestClient,
) -> None:
    """``undetermined`` is a real wire value, not a mistake — but a document
    nobody has chosen is not a document anybody can look back at."""
    response = signed_in_client.post(
        "/api/documents", json=a_document(documentType=UNDETERMINED, fields={})
    )

    assert response.status_code == 422


def test_refuses_answers_that_are_not_that_document_s_cover_page(
    signed_in_client: TestClient,
) -> None:
    """The same check ``/api/chat`` makes on every turn, so a cover page the
    assistant would refuse is one this refuses too."""
    response = signed_in_client.post(
        "/api/documents", json=a_document(fields={"nonsense": "value"})
    )

    assert response.status_code == 422


def test_stores_the_validated_cover_page_not_the_body_as_posted(
    signed_in_client: TestClient,
) -> None:
    """Extra keys are dropped rather than carried. What comes back out has to
    be something the renderer can use, whatever went in."""
    document = a_document()
    document["fields"] = {**document["fields"], "somethingElse": "ignore me"}

    saved = signed_in_client.post("/api/documents", json=document).json()

    assert "somethingElse" not in saved["fields"]


# ==========================================================================
# Reading back
# ==========================================================================


def test_lists_nothing_before_anything_is_saved(signed_in_client: TestClient) -> None:
    response = signed_in_client.get("/api/documents")

    assert response.status_code == 200
    assert response.json() == []


def test_lists_the_newest_first(signed_in_client: TestClient) -> None:
    """Saved in the same second, so this is the ``id DESC`` tiebreaker doing
    the work rather than the timestamp — which is exactly the case a real
    visitor hits by saving twice in a row."""
    first = signed_in_client.post("/api/documents", json=a_document()).json()
    second = signed_in_client.post(
        "/api/documents",
        json=a_document(
            documentType=PILOT,
            fields=blank_fields_for(PILOT, TODAY).model_dump(mode="json"),
        ),
    ).json()

    listed = signed_in_client.get("/api/documents").json()

    assert [row["id"] for row in listed] == [second["id"], first["id"]]


def test_the_list_leaves_out_the_cover_pages(signed_in_client: TestClient) -> None:
    """A list is read to choose from, and sending every cover page to draw a
    row of headings would be a waste at both ends."""
    signed_in_client.post("/api/documents", json=a_document())

    assert "fields" not in signed_in_client.get("/api/documents").json()[0]


def test_reading_one_gives_back_its_cover_page(signed_in_client: TestClient) -> None:
    saved = signed_in_client.post("/api/documents", json=a_document()).json()

    response = signed_in_client.get(f"/api/documents/{saved['id']}")

    assert response.status_code == 200
    assert response.json() == saved


def test_a_document_that_never_existed_is_not_found(
    signed_in_client: TestClient,
) -> None:
    assert signed_in_client.get("/api/documents/404").status_code == 404


# ==========================================================================
# One account cannot see another's
# ==========================================================================


def test_the_list_holds_only_your_own(signed_in_client: TestClient) -> None:
    signed_in_client.post("/api/documents", json=a_document())
    a_second_account(signed_in_client)

    assert signed_in_client.get("/api/documents").json() == []


def test_somebody_else_s_document_is_not_found(signed_in_client: TestClient) -> None:
    """404 rather than 403, for the reason sign-in gives one message to an
    unknown email and a wrong password: a 403 would confirm the document is
    there, which is most of what an attacker wanted to know."""
    theirs = signed_in_client.post("/api/documents", json=a_document()).json()
    a_second_account(signed_in_client)

    assert signed_in_client.get(f"/api/documents/{theirs['id']}").status_code == 404


def test_the_two_answers_are_worded_identically(signed_in_client: TestClient) -> None:
    """If these two ever diverge, the 404 above stops hiding anything."""
    theirs = signed_in_client.post("/api/documents", json=a_document()).json()
    a_second_account(signed_in_client)

    not_yours = signed_in_client.get(f"/api/documents/{theirs['id']}").json()
    never_existed = signed_in_client.get("/api/documents/404").json()

    assert not_yours == never_existed


@pytest.mark.parametrize("path", ["/api/documents", "/api/documents/1"])
def test_reading_after_signing_out_is_refused(
    signed_in_client: TestClient, path: str
) -> None:
    signed_in_client.post("/api/documents", json=a_document())
    signed_in_client.post("/api/auth/signout")

    assert signed_in_client.get(path).status_code == 401
