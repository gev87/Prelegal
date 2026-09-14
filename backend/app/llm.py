"""
The one place this backend talks to a language model.

Carved out from ``app.chat`` the way ``app.security`` is carved out from
``app.auth``: the router decides what to ask and what to do with the answer,
and this module owns the fact that the answer comes from OpenRouter over the
network. Nothing else imports ``litellm``.

Two decisions here are load-bearing.

**Nothing raises a provider exception past this module.** A flaky model, a
timeout, a rate limit and a malformed reply are four different upstream
failures that a caller cannot usefully tell apart, so each becomes the same
clean ``502`` and the real cause goes to the log. Letting ``litellm``'s own
exception types escape would make every caller import ``litellm`` to catch
them, which is the coupling this module exists to prevent.

**The import is deferred to the first call.** Importing ``litellm`` costs
roughly two and a half seconds — it drags in boto3, openai and tiktoken — and
paying that at module scope would add it to every process start and every test
run, including the great majority that never send a message. The cost belongs
to the first person who actually chats.
"""

from __future__ import annotations

import logging

from fastapi import HTTPException, status
from pydantic import BaseModel, ValidationError

from app import config

logger = logging.getLogger(__name__)

#: Per the project's AI design: gpt-oss-120b, reached through OpenRouter and
#: pinned to Cerebras as the inference provider rather than left to
#: OpenRouter's own routing.
MODEL = "openrouter/openai/gpt-oss-120b"
PROVIDER_ORDER = ["cerebras"]

#: Long enough for a slow turn, short enough that a wedged request gives the
#: browser an answer rather than a spinner. The frontend shows the failure and
#: keeps the conversation, so a timeout costs a retry, not the draft.
TIMEOUT_SECONDS = 25

NOT_CONFIGURED = "The assistant is not configured on this server."
UNAVAILABLE = "The assistant is temporarily unavailable. Please try again."
UNEXPECTED = "The assistant returned something unexpected. Please try again."


def ensure_configured() -> None:
    """Refuses the request when there is no key to call OpenRouter with.

    Used as a route dependency, so it runs before the handler body and the
    answer is the same whether or not the rest of the request made sense.
    Deliberately *not* a startup check: the product is a document drafter
    whose preview and downloads work perfectly well without a model, and
    refusing to boot would take those down too. See ``app.config``.
    """
    if not config.OPENROUTER_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=NOT_CONFIGURED,
        )


def complete_structured[T: BaseModel](
    messages: list[dict[str, str]], response_model: type[T]
) -> T:
    """Asks the model for an answer shaped like ``response_model``.

    Structured Outputs rather than a text reply that gets parsed afterwards:
    the schema is handed to the provider as a decoding constraint, so the
    enums in ``app.nda_fields`` restrict what the model is able to emit in
    the first place. The validation below is the belt to that braces — it
    catches a provider that honoured the schema loosely, which is a real
    possibility and not worth trusting away.
    """
    from litellm import completion

    try:
        response = completion(
            model=MODEL,
            messages=messages,
            response_format=response_model,
            reasoning_effort="low",
            extra_body={"provider": {"order": PROVIDER_ORDER}},
            timeout=TIMEOUT_SECONDS,
        )
    except Exception:
        # Deliberately broad. litellm raises its own hierarchy for timeouts,
        # rate limits, auth and transport, and every one of them means the
        # same thing to a browser waiting for a reply.
        logger.exception("The model call failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=UNAVAILABLE
        ) from None

    # Reading the answer is inside the try for the same reason parsing it is.
    # A provider that returns no choices at all, or a choice whose content is
    # null, is misbehaving in exactly the way this function exists to absorb —
    # and an IndexError escaping here would reach the browser as a 500 with a
    # stack trace rather than as the 502 every other provider failure gets.
    content = None

    try:
        content = response.choices[0].message.content
        return response_model.model_validate_json(content)
    except (ValidationError, ValueError, TypeError, AttributeError, IndexError, KeyError):
        # Logged with the payload, because "the model answered off-schema" is
        # not reproducible without seeing what it actually said.
        logger.exception("The model answered off-schema: %r", content)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=UNEXPECTED
        ) from None
