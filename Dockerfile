# syntax=docker/dockerfile:1

# The whole product in one image: the frontend built to static files, the
# backend that serves them alongside its own API.
#
# Build from the repository root — `docker build -t prelegal .` — not from
# frontend/ or backend/. The frontend reads the Standard Terms out of
# ../templates while it builds (frontend/lib/nda/templates.ts), so that
# directory has to be in the build context as a sibling of frontend/.

# --- Build the frontend ------------------------------------------------------
FROM node:24-slim AS frontend
WORKDIR /repo

# Templates first: they change far less often than the app, so a template
# edit is the only thing that invalidates this layer. The field catalog sits
# beside them for the same reason, and comes from backend/app because that is
# the one directory the runtime stage below already copies — one file, read by
# the frontend here at build time and by the backend at run time.
COPY templates/ templates/
COPY backend/app/document_fields.json backend/app/document_fields.json
COPY frontend/package.json frontend/package-lock.json frontend/

WORKDIR /repo/frontend
RUN npm ci

COPY frontend/ .
# next.config.ts sets output: "export", so this writes plain files to out/.
RUN npm run build

# --- Install the backend -----------------------------------------------------
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS backend
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
WORKDIR /app

# Dependencies before source, so editing a handler does not reinstall them.
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# --- Run ---------------------------------------------------------------------
FROM python:3.12-slim
WORKDIR /app

COPY --from=backend /app/.venv .venv
ENV PATH="/app/.venv/bin:$PATH"

COPY backend/app ./app
COPY --from=frontend /repo/frontend/out ./static

# The templates are already inside the exported HTML; the running container
# never reads them again, so they are deliberately not copied here.
#
# document_fields.json is the exception and needs no line of its own: it lives
# inside backend/app precisely so the COPY above carries it, because unlike
# the templates the server does read it on every turn.

ENV PRELEGAL_DATABASE_PATH=/app/.data/app.db
ENV PRELEGAL_FRONTEND_DIR=/app/static

EXPOSE 8000

# Deliberately one worker. The users table is a single SQLite file, and
# separate worker processes would not see each other's writes — see
# backend/app/db.py.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
