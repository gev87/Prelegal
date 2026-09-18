"""
The Prelegal server.

One process serves both halves of the product: the JSON API under ``/api``
and, in the container, the frontend's static export at everything else.
Running them together is what lets the browser call ``/api/...`` with a
relative path and no CORS involved at all.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import config, security
from app.auth import router as auth_router
from app.chat import router as chat_router
from app.db import init_db
from app.documents import router as documents_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # These two belong together. `init_db` deletes every account, so every
    # session cookie naming one has to stop working at the same moment —
    # rotating the signing secret is what makes that true, and doing it
    # anywhere else would let the two drift apart. See
    # app.security.rotate_session_secret.
    init_db()
    security.rotate_session_secret()
    yield


app = FastAPI(title="Prelegal", lifespan=lifespan)

# Only native development ever makes a cross-origin request; see
# app.config.cors_origins. In the container the frontend is served from this
# same origin and none of this applies.
#
# `allow_credentials` is what lets the session cookie travel on those
# cross-origin calls, and it is the reason the origins above must stay an
# explicit list: a browser refuses to send credentials to a wildcard, so
# "simplifying" allow_origins to ["*"] would silently sign every developer out
# of native development while leaving the container working perfectly.
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.cors_origins(),
    allow_origin_regex=config.CORS_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

app.include_router(auth_router, prefix="/api/auth")
app.include_router(chat_router, prefix="/api")
app.include_router(documents_router, prefix="/api/documents")


@app.get("/healthz", tags=["ops"])
def healthz() -> dict[str, bool]:
    """Liveness, polled by the start scripts so they can report a URL that is
    actually answering rather than one that merely has a container behind
    it."""
    return {"ok": True}


# Registered last so the API above always wins. The frontend is absent in
# native development, where `next dev` serves it instead — mounting it
# conditionally keeps `uv run uvicorn` working before the frontend has ever
# been built.
#
# `fallback="auto"` serves the export's own 404.html for unknown paths. The
# export is a set of pre-rendered pages, not a client-routed shell, so
# falling back to index.html would answer a mistyped URL with the NDA
# creator and a 200.
if config.FRONTEND_DIR.is_dir():
    app.frontend("/", directory=config.FRONTEND_DIR, fallback="auto")
