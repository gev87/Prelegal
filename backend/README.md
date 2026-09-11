# Prelegal backend

A FastAPI service that does two jobs: it serves the JSON API under `/api`,
and — in the container — it serves the frontend's static build at everything
else. One process, one port, so the browser calls `/api/...` with a relative
path and no CORS is involved at all.

The API is accounts and the drafting assistant. The assistant is the only
part that reaches outside this process, and the only part that can be
switched off — see [The assistant](#the-assistant).

## Running it

```bash
uv sync
uv run uvicorn app.main:app --reload
```

Then <http://localhost:8000/docs> for the interactive API reference.

Run it this way and you get the API alone: the frontend serves itself from
`next dev` on port 3000 during development. The static build is mounted only
if it is present, so the backend starts fine before the frontend has ever
been built.

| Command                                   | What it does                    |
| ----------------------------------------- | ------------------------------- |
| `uv sync`                                 | Install, into `.venv`           |
| `uv run uvicorn app.main:app --reload`    | Development server on port 8000 |
| `uv run pytest`                           | The test suite                  |

Set `OPENROUTER_API_KEY` in your shell for the assistant to answer. Without
it the chat endpoint returns `503` and everything else runs normally.

## The database

SQLite, in `.data/app.db`, **deleted and recreated on every startup**. Sign
up, restart, and the account is gone — that is the intended behaviour, not a
bug to work around. PL-4 asks for a temporary database, and making it
genuinely temporary means nobody builds on state that was never promised.

Two things about it are load-bearing and easy to undo by accident:

**It is a file, not `:memory:`.** An in-memory database belongs to the
connection that opened it, so with a connection per request, a user who just
signed up would fail to sign in on the very next request — the row would be
in a database nobody else can see.

**It is served by one worker.** Separate worker processes cannot see each
other's writes to a SQLite file. `uvicorn` is started without `--workers` for
that reason; adding it later means moving off a single file first.

## The API

| Method | Path                | Answers                                        |
| ------ | ------------------- | ---------------------------------------------- |
| `POST` | `/api/auth/signup`  | `201` with the account, `409` if the email is taken |
| `POST` | `/api/auth/signin`  | `200` with the account, `401` if it does not match |
| `POST` | `/api/chat`         | `200` with the reply and the cover page, `503` with no key, `502` if the model fails |
| `GET`  | `/healthz`          | `200` — polled by the start scripts             |

Both auth endpoints take `{ "email": ..., "password": ... }` and never return
the password. Passwords are hashed with bcrypt before they are stored.

A failed sign-in says the same thing whether the email is unknown or the
password is wrong. Telling those apart would let anyone check which addresses
are registered.

## The assistant

`POST /api/chat` takes the whole conversation and the whole cover page, and
returns a reply and the cover page as it now stands. Nothing is stored between
turns: the browser holds the transcript and sends it back each time, so there
is no session to expire and a restart costs a draft nothing.

The model is gpt-oss-120b, reached through LiteLLM and OpenRouter and pinned
to Cerebras. It answers in Structured Outputs, so the fields it fills in are
constrained by a schema rather than parsed back out of English — a state has
to be one of the fifty-one, a term mode one of the two.

**The model returns the whole cover page and a separate list of what it
changed, and only the listed fields are applied.** That asymmetry is the
safety mechanism, and it is the thing to understand before changing
`app/chat.py`. A model that quietly rewrites a company name it was not asked
about has that rewrite dropped, because the name is not in `updated_fields`.
Asking the model for a partial answer instead would place the same trust in
its discipline, with a schema full of optional fields where a null cannot
distinguish "unchanged" from "cleared".

`confirmedFields` exists for a related reason. A blank cover page arrives
holding a suggested purpose, Delaware and one year — values that read exactly
like decisions. Without being told which answers are real, the assistant sails
past the questions they stand in for.

A missing key is a supported state, not a misconfiguration. The product is a
document drafter whose preview and downloads work perfectly well without a
model, so the server starts and only this one route refuses.

## What this is not yet

The login screen in front of this is **not a gate**, and these endpoints are
not authentication. They create and check accounts; they issue no session and
no token, and no other route consults them. A visitor can walk straight past
the login screen into the app.

That is deliberate for PL-4 — the account handling a later ticket needs is
here and tested, while nothing pretends to be protected in the meantime. Not
yet built, in rough order of when it will be missed:

- Sessions or tokens, and routes that actually require one
- Password reset, and anything that sends email
- Rate limiting, on the auth endpoints and on chat — which costs real money
- Streaming replies; a turn arrives all at once, after a wait
- Any retry policy. A failed turn is the browser's to send again
- Conversation history that survives a reload
- Migrations — there is nothing to migrate while the database is disposable

## Layout

```
app/
  main.py        The app: CORS, the routers, /healthz, the frontend mount
  config.py      The handful of values that differ between dev and container
  db.py          Connections, and the schema recreated on every startup
  auth.py        Sign up and sign in
  security.py    Password hashing — and where session signing will go
  chat.py        The drafting conversation, and the merge that makes it safe
  chat_prompt.py What the assistant is told, as a pure function
  llm.py         The one place this backend calls a model
  nda_fields.py  The cover page, mirroring the frontend's schema.ts
tests/
  test_auth.py       The endpoints, through a real TestClient
  test_db.py         That the database really does start empty every time
  test_security.py   Hashing round-trips, including passphrases past bcrypt's limit
  test_chat.py       The endpoint, with the model faked
  test_chat_prompt.py What the assistant ends up being told
  test_llm.py        The failure handling, with litellm itself faked
  test_nda_fields.py The field models, and that they still match the frontend
```
