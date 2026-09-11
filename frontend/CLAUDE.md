# Prelegal Project

## Overview

This is a SaaS product to allow users to draft legal agreements based on templates in the templates directory. The user will use an AI chat in order to establish what document they want and how to fill in the fields. The available documents are covered in the catalog.json file in the project root, included here:

@../catalog.json

As of PL-4 the product is a FastAPI backend serving a statically exported Next.js frontend from one container. It supports the Mutual NDA document only, and there is no AI chat yet. See Implementation status at the end of this file.

## Development process

When instructed to build a feature:

1. Use your Atlassian tools to read the feature instructions from Jira
2. Develop the feature - do not skip any step from the feature-dev 7 step process
3. Thoroughly test the feature with unit tests and integration tests and fix any issues
4. Submit a PR using your github tools

## AI design

When writing code to make calls to LLMs, use your Cerebras skill to use LiteLLM via `openrouter/openai/gpt-oss-120b` model with Cerebras as the inference provider. You should use Structured Outputs so that you can interpret the results and populate fields in the legal document.

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

Current as of the merge of PL-4 (2026-09-11). PL-2, PL-3 and PL-4 are on `main`.

### Built

- **Templates (PL-2)** — twelve Common Paper files in `templates/`, indexed by `catalog.json`. That is eleven agreements: the Mutual NDA is two files, Standard Terms and cover page.
- **Mutual NDA creator (PL-3)** — `frontend/components/` (`NdaCreator`, `NdaForm`, `DocumentPreview`, `DownloadBar`) over `frontend/lib/nda/` (`schema`, `render`, `templates`). Fill a cover page, preview the assembled document live, download it as Markdown or PDF. The Standard Terms are read from `templates/mutual-nda.md` at build time.
- **Backend (PL-4)** — `backend/`, a uv project on FastAPI. `POST /api/auth/signup`, `POST /api/auth/signin`, `GET /healthz`. Passwords are bcrypt-hashed; a failed sign-in gives the same answer for an unknown email as for a wrong password.
- **Database (PL-4)** — SQLite, one `users` table, dropped and recreated on every startup (`backend/app/db.py`). A file rather than `:memory:`, and one worker, both deliberately — see the comments there.
- **Login screen (PL-4)** — `frontend/app/login/`. The endpoints are real; the gate is not. Nothing issues a session or a token, no route checks one, and "Continue without an account" calls no endpoint.
- **Packaging (PL-4)** — one `Dockerfile` (node stage builds the frontend, uv stage installs the backend) on port 8000, plus `scripts/start-*` and `scripts/stop-*` for mac, linux and Windows.
- **Serving** — the frontend is a static export (`output: "export"`) mounted by FastAPI, so one origin serves both halves and the browser calls `/api/...` relatively, with no CORS. `trailingSlash: true` is load-bearing: without it `/login` is a 404.

### Not built yet

- The AI chat, and with it every LLM call — the Cerebras/LiteLLM section above is still a plan, not a description.
- Every document other than the Mutual NDA.
- Real authentication. The `users` table is the foundation a later ticket builds it on.

### Working on this

- Tests: `cd backend && uv run pytest` (32), `cd frontend && npm test` (246). `npm run verify` runs typecheck, lint, test and build.
- Native development runs the two halves separately — `next dev` on 3000, `uv run uvicorn app.main:app` on 8000 — and is the only case where CORS applies.
- Editing a template or `catalog.json` needs an image rebuild, not a restart: both are baked in at build time.
- This file describes the whole project but lives in `frontend/`, so it does not load when working in `backend/`.
