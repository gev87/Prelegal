# Prelegal

> **Status: 🚧 In progress.** This project is under active development and is expected to be completed by **2026-08-30** (one week from 2026-08-23).

## About

Prelegal is currently a work in progress. This README is a placeholder that will be expanded as the project takes shape.

## Project structure

| Path            | What it holds                                                        |
| --------------- | -------------------------------------------------------------------- |
| `templates/`    | Legal agreement templates from [Common Paper](https://github.com/CommonPaper), under CC BY 4.0 |
| `catalog.json`  | Name, description and filename of every template                      |
| `frontend/`     | Next.js app — the login screen and the Mutual NDA creator             |
| `backend/`      | FastAPI service — the auth API, and the frontend's host in the container |
| `scripts/`      | Start and stop the container, per operating system                    |
| `Dockerfile`    | The whole product as one image                                        |

## Getting started

Two ways in, for two different jobs.

### The whole product, in Docker

Builds the frontend, installs the backend and runs them as one container.
This is how the product actually ships.

```bash
scripts/start-mac.sh      # or start-linux.sh, or start-windows.ps1
```

Then open <http://localhost:8000>. Stop it with the matching `stop-` script.

### Working on it

Two servers, so that both halves reload as you edit them.

```bash
cd backend && uv sync && uv run uvicorn app.main:app --reload   # port 8000
cd frontend && npm install && npm run dev                       # port 3000
```

Then open <http://localhost:3000>. The frontend finds the API on port 8000 on
its own; nothing needs configuring.

See [`frontend/README.md`](frontend/README.md) and
[`backend/README.md`](backend/README.md) for more.

## Signing in

There is a login screen at `/login`, and it is **not a gate**. Signing up and
signing in are real — they reach the API, create and check accounts, and
report what the server actually said — but no session is issued and no route
requires one. "Continue without an account" goes straight in, and so does
opening the app directly.

The accounts live in a SQLite database that is **recreated from scratch every
time the container starts**, so nothing you register survives a restart.

## Tech stack

| Layer    | What                                                             |
| -------- | ---------------------------------------------------------------- |
| Frontend | Next.js 16 and React 19, TypeScript, built to static files        |
| Backend  | FastAPI on Python 3.12, managed with [uv](https://docs.astral.sh/uv/) |
| Database | SQLite, recreated on every start                                  |
| Packaging| One Docker image; the backend serves the frontend's build         |

## What's coming

The following sections will be filled in before the project is considered complete:

- Project overview — what Prelegal is and the problem it solves
- Contributing — branch and PR conventions
- Real authentication — the login screen is a facade for now
- The AI chat, and the other twelve templates in `catalog.json`

## License

Released under the [MIT License](LICENSE).
