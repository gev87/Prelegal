# Prelegal Project

## Overview

This is a SaaS product to allow users to draft legal agreements based on templates in the templates directory. The user will use an AI chat in order to establish what document they want and how to fill in the fields. The available documents are covered in the catalog.json file in the project root, included here:

@../catalog.json

As of PL-6 the product is a FastAPI backend serving a statically exported Next.js frontend from one container, and the user drafts by talking to an AI rather than filling in a form. It supports all eleven document types in `catalog.json`, and the assistant works out which one you want by asking. See Implementation status at the end of this file.

## Development process

When instructed to build a feature:

1. Use your Atlassian tools to read the feature instructions from Jira
2. Develop the feature - do not skip any step from the feature-dev 7 step process
3. Thoroughly test the feature with unit tests and integration tests and fix any issues
4. Submit a PR using your github tools

## AI design

When writing code to make calls to LLMs, use your Cerebras skill to use LiteLLM via `openrouter/openai/gpt-oss-120b` model with Cerebras as the inference provider. You should use Structured Outputs so that you can interpret the results and populate fields in the legal document.

Built as of PL-5, in `backend/app/llm.py` — the one place the backend calls a model. Every LLM call belongs behind that module; nothing else imports `litellm`. The key is `OPENROUTER_API_KEY`, and its absence is a supported state rather than a misconfiguration.

## Technical design

Built as of PL-4, and the shape to keep:

- The whole project is packaged into one Docker container.
- The backend is in `backend/`, a uv project using FastAPI.
- The frontend is in `frontend/`.
- The database is SQLite, created from scratch each time the container comes up, with a `users` table behind sign up and sign in.
- The frontend is statically built (`output: "export"`) and served by FastAPI. It works, so keep it: it is what lets one origin serve both halves with no CORS.

Scripts in `scripts/`:

```bash
# Mac
scripts/start-mac.sh    # Start
scripts/stop-mac.sh     # Stop

# Linux
scripts/start-linux.sh
scripts/stop-linux.sh

# Windows
scripts/start-windows.ps1
scripts/stop-windows.ps1
```

The product is available at http://localhost:8000 — API and frontend on the same port.

## Color Scheme

Defined as tokens in `frontend/app/globals.css` (`--brand-*`); use those rather than repeating hex values.

- Accent Yellow: #ecad0a
- Blue Primary: #209dd7
- Purple Secondary: #753991 (submit buttons)
- Dark Navy: #032147 (headings)
- Gray Text: #888888

## Implementation status

Current as of PL-6 (2026-09-14). PL-2 through PL-5 are on `main`.

### Built

- **Every document type (PL-6)** — all eleven. Ten are *data*: field descriptors in `backend/app/document_fields.json`, turned into Pydantic models and per-type field-path enums at runtime by `backend/app/document_schema.py`, and read by the frontend at build time in `frontend/lib/documents/catalog.ts`. One file, two runtimes, no hand-mirroring of 112 fields. The Mutual NDA is the one exception and keeps its hand-written `backend/app/nda_fields.py` and `frontend/lib/nda/`.
- **Choosing and changing document (PL-6)** — the assistant asks what you want to draft; `documentType` is `undetermined` until it knows. Asking for something Prelegal cannot draft gets an honest no and the closest thing it can. Changing your mind mid-conversation carries over every settled answer the new document also asks for, and the app says what carried and what did not. Choosing a document and switching later are the same function (`switch_document_type`), so there is no bespoke first turn.
- **AI chat (PL-5)** — `POST /api/chat` (`backend/app/chat.py`) and `frontend/components/ChatPanel.tsx`. A freeform conversation fills in the cover page; the form is gone. Stateless: the browser holds the transcript, the document type and the fields and resends all three each turn.
- **Templates (PL-2)** — twelve Common Paper files in `templates/`, indexed by `catalog.json`. That is eleven agreements: the Mutual NDA is two files, Standard Terms and cover page.
- **Document creator (PL-3, reshaped by PL-5, generalised by PL-6)** — `frontend/components/` (`DocumentCreator`, `ChatPanel`, `DocumentPreview`, `DownloadBar`) over `frontend/lib/documents/` for the ten catalogued types and `frontend/lib/nda/` for the Mutual NDA. Preview the assembled document live, download it as Markdown or PDF. Standard Terms are read from `templates/` at build time. `NdaForm` was deleted in PL-5; `NdaCreator` became `DocumentCreator` in PL-6.
- **Backend (PL-4)** — `backend/`, a uv project on FastAPI. `POST /api/auth/signup`, `POST /api/auth/signin`, `GET /healthz`. Passwords are bcrypt-hashed; a failed sign-in gives the same answer for an unknown email as for a wrong password.
- **Database (PL-4)** — SQLite, one `users` table, dropped and recreated on every startup (`backend/app/db.py`). A file rather than `:memory:`, and one worker, both deliberately — see the comments there.
- **Login screen (PL-4)** — `frontend/app/login/`. The endpoints are real; the gate is not. Nothing issues a session or a token, no route checks one, and "Continue without an account" calls no endpoint.
- **Packaging (PL-4)** — one `Dockerfile` (node stage builds the frontend, uv stage installs the backend) on port 8000, plus `scripts/start-*` and `scripts/stop-*` for mac, linux and Windows.
- **Serving** — the frontend is a static export (`output: "export"`) mounted by FastAPI, so one origin serves both halves and the browser calls `/api/...` relatively, with no CORS. `trailingSlash: true` is load-bearing: without it `/login` is a 404.

### Not built yet

- Clicking a defined term to edit it works on the Mutual NDA only. The other ten render their cross-references as plain in-page anchors: the mechanism needs a hand-written sentence describing what each term *means*, which the generic descriptors do not carry.
- No field on the ten catalogued types is constrained beyond text, date and `governingLaw`. Their Standard Terms reference a cover-page value without saying what shape it takes, so inventing an enum would be guessing. `FieldKind.INT`/`ENUM` exist for a later ticket to promote specific fields.
- Real authentication. The `users` table is the foundation a later ticket builds it on.
- Streaming replies, rate limiting, and any conversation that survives a reload.

### The one rule about the chat

The model answers with the whole cover page **and** a list of what it changed, and `apply_updates` in `backend/app/document_schema.py` applies only the listed fields. Everything else it returns is discarded. Do not "simplify" that into trusting the returned object: it is what stops a model from quietly rewriting a field the user already settled in a document somebody signs.

PL-6 made that guarantee tighter rather than looser. The field-path enum is built per document type, so a model drafting a DPA cannot even *name* a leaf belonging to the NDA. And on a turn where the model asks to change document type, its `fields` are ignored **entirely** — not merely filtered — because the Structured Outputs schema was fixed from the old type before the model chose to switch, so anything it says about the new cover page was written against the wrong schema. The server computes the move itself.

### Working on this

- Tests: `cd backend && uv run pytest` (228), `cd frontend && npm test` (311). `npm run verify` runs typecheck, lint, test and build.
- `OPENROUTER_API_KEY` makes the assistant answer; see `.env.example`. Without it everything but the chat works, and the tests do not need it — the model is faked at two levels.
- Native development runs the two halves separately — `next dev` on 3000, `uv run uvicorn app.main:app` on 8000 — and is the only case where CORS applies.
- Editing a template needs an image rebuild, not a restart: they are baked in at build time. `backend/app/document_fields.json` is read by the frontend at build time *and* by the backend at startup, so editing it needs a rebuild too — and `backend/tests/test_document_types.py` checks it still describes the templates in both directions, so a template correction fails the suite rather than drifting quietly.
- This file describes the whole project but lives in `frontend/`, so it does not load when working in `backend/`.
