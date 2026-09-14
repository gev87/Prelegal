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
| `.env.example`  | The one setting there is, and what happens without it                 |
| `backend/`      | FastAPI service — the auth API, the drafting assistant, and the frontend's host |
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

To have the assistant draft for you, put an
[OpenRouter key](https://openrouter.ai/keys) in your shell or in a `.env` file
at the repository root, copied from `.env.example`. The start scripts pass it
to the container; it is never built into the image. Without one, everything
works except the chat — see [Drafting](#drafting) below.

### Working on it

Two servers, so that both halves reload as you edit them.

```bash
cd backend && uv sync && uv run uvicorn app.main:app --reload   # port 8000
cd frontend && npm install && npm run dev                       # port 3000
```

Then open <http://localhost:3000>. The frontend finds the API on port 8000 on
its own; nothing needs configuring, apart from `OPENROUTER_API_KEY` in the
backend's shell if you want the assistant to answer.

See [`frontend/README.md`](frontend/README.md) and
[`backend/README.md`](backend/README.md) for more.

## Drafting

You write the Mutual NDA by talking to an assistant. It asks what the
agreement is for and who is signing, and fills in the cover page as you
answer — the document beside the conversation updates as it goes. Correct it
the same way you would correct a colleague: "actually make it three years".

Only the answers the assistant says it is setting are applied. If it returns a
value for a field it was not asked about, that value is discarded rather than
written into your document — the one guarantee worth having when a model is
filling in an agreement somebody will sign.

**Without an `OPENROUTER_API_KEY` the chat reports itself unavailable and
nothing else changes.** The document still renders, and both downloads still
work; you simply have nothing to fill it in for you. The server starts either
way, on purpose.

Only the Mutual NDA for now. The other eleven agreements in `catalog.json` are
a later ticket.

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
| Assistant| gpt-oss-120b via LiteLLM and OpenRouter, pinned to Cerebras        |
| Database | SQLite, recreated on every start                                  |
| Packaging| One Docker image; the backend serves the frontend's build         |

## What's coming

The following sections will be filled in before the project is considered complete:

- Project overview — what Prelegal is and the problem it solves
- Contributing — branch and PR conventions
- Real authentication — the login screen is a facade for now
- The other eleven agreements in `catalog.json`

## License

Released under the [MIT License](LICENSE).
