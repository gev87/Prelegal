"""
The boundary with OpenRouter.

These are the tests that make the ``502``s real. ``test_chat`` fakes
``complete_structured`` wholesale, which is right for testing what the router
does with an answer but means the failure handling inside this module is
never reached. Here the fake goes one level lower, at ``litellm.completion``
itself, so the mapping from "the provider misbehaved" to "the browser gets a
clean error" is actually exercised.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app import config, llm
from app.nda_fields import NdaFields

from tests.test_chat import DEFAULT_FIELDS


class Answer(NdaFields):
    """A response model with the shape of a real one."""


def a_completion(content: str | None) -> SimpleNamespace:
    """The one shape of litellm's response this module reads."""
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=content))]
    )


def test_it_refuses_without_a_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config, "OPENROUTER_API_KEY", None)

    with pytest.raises(HTTPException) as raised:
        llm.ensure_configured()

    assert raised.value.status_code == 503


def test_it_refuses_on_a_blank_key(monkeypatch: pytest.MonkeyPatch) -> None:
    """An unset variable and one set to nothing are the same mistake."""
    monkeypatch.setattr(config, "OPENROUTER_API_KEY", "")

    with pytest.raises(HTTPException) as raised:
        llm.ensure_configured()

    assert raised.value.status_code == 503


def test_it_allows_a_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config, "OPENROUTER_API_KEY", "sk-not-a-real-key")

    assert llm.ensure_configured() is None


def test_it_parses_what_the_model_returned(monkeypatch: pytest.MonkeyPatch) -> None:
    answer = Answer(**DEFAULT_FIELDS)
    monkeypatch.setattr(
        "litellm.completion", lambda **kwargs: a_completion(answer.model_dump_json())
    )

    assert llm.complete_structured([], Answer) == answer


def test_it_asks_for_cerebras_and_the_right_model(monkeypatch: pytest.MonkeyPatch) -> None:
    """The project's AI design names both. Neither is a default worth
    trusting: OpenRouter would otherwise route to whichever provider it
    likes."""
    seen: dict[str, object] = {}

    def record(**kwargs: object) -> SimpleNamespace:
        seen.update(kwargs)
        return a_completion(Answer(**DEFAULT_FIELDS).model_dump_json())

    monkeypatch.setattr("litellm.completion", record)
    llm.complete_structured([{"role": "user", "content": "hello"}], Answer)

    assert seen["model"] == "openrouter/openai/gpt-oss-120b"
    assert seen["extra_body"] == {"provider": {"order": ["cerebras"]}}
    assert seen["response_format"] is Answer
    assert seen["timeout"] == llm.TIMEOUT_SECONDS


def test_a_provider_failure_becomes_a_bad_gateway(monkeypatch: pytest.MonkeyPatch) -> None:
    """Whatever litellm raises, the browser gets one sentence and the log
    gets the rest."""

    def explode(**kwargs: object) -> None:
        raise RuntimeError("the provider hung up")

    monkeypatch.setattr("litellm.completion", explode)

    with pytest.raises(HTTPException) as raised:
        llm.complete_structured([], Answer)

    assert raised.value.status_code == 502
    assert raised.value.detail == llm.UNAVAILABLE


def test_an_off_schema_answer_becomes_a_bad_gateway(monkeypatch: pytest.MonkeyPatch) -> None:
    """Structured Outputs constrains the decoding; it does not promise it.

    A provider that honours the schema loosely must not take the process
    down with a validation error escaping the request.
    """
    monkeypatch.setattr(
        "litellm.completion", lambda **kwargs: a_completion('{"not": "the schema"}')
    )

    with pytest.raises(HTTPException) as raised:
        llm.complete_structured([], Answer)

    assert raised.value.status_code == 502
    assert raised.value.detail == llm.UNEXPECTED


def test_an_answer_with_no_choices_becomes_a_bad_gateway(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A moderation refusal can come back with an empty choices list.

    Reading choices[0] used to sit outside the try, so this reached the
    browser as a 500 with a stack trace rather than as the 502 every other
    provider failure gets — and was never logged.
    """
    monkeypatch.setattr("litellm.completion", lambda **kwargs: SimpleNamespace(choices=[]))

    with pytest.raises(HTTPException) as raised:
        llm.complete_structured([], Answer)

    assert raised.value.status_code == 502


def test_an_answer_with_no_content_becomes_a_bad_gateway(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """``content`` is null in a normal OpenAI-shaped refusal.

    ``model_validate_json(None)`` raises TypeError, which is neither a
    ValidationError nor a ValueError, so it used to escape uncaught.
    """
    monkeypatch.setattr("litellm.completion", lambda **kwargs: a_completion(None))

    with pytest.raises(HTTPException) as raised:
        llm.complete_structured([], Answer)

    assert raised.value.status_code == 502


def test_unparseable_json_becomes_a_bad_gateway(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("litellm.completion", lambda **kwargs: a_completion("not json at all"))

    with pytest.raises(HTTPException) as raised:
        llm.complete_structured([], Answer)

    assert raised.value.status_code == 502


def test_a_provider_failure_never_leaks_its_own_words(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Upstream error text can carry a key fragment, an internal host or a
    stack trace. None of that is the browser's business."""

    def explode(**kwargs: object) -> None:
        raise RuntimeError("401 from https://internal.example with sk-live-secret")

    monkeypatch.setattr("litellm.completion", explode)

    with pytest.raises(HTTPException) as raised:
        llm.complete_structured([], Answer)

    assert "sk-live-secret" not in str(raised.value.detail)
    assert "internal.example" not in str(raised.value.detail)
