# Prelegal backend

A FastAPI service that does two jobs: it serves the JSON API under `/api`,
and — in the container — it serves the frontend's static build at everything
else. One process, one port, so the browser calls `/api/...` with a relative
path and no CORS is involved at all.

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
| `GET`  | `/healthz`          | `200` — polled by the start scripts             |

Both auth endpoints take `{ "email": ..., "password": ... }` and never return
the password. Passwords are hashed with bcrypt before they are stored.

A failed sign-in says the same thing whether the email is unknown or the
password is wrong. Telling those apart would let anyone check which addresses
are registered.

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
- Rate limiting on the auth endpoints
- Migrations — there is nothing to migrate while the database is disposable

## Layout

```
app/
  main.py        The app: CORS, the auth router, /healthz, the frontend mount
  config.py      The handful of values that differ between dev and container
  db.py          Connections, and the schema recreated on every startup
  auth.py        Sign up and sign in
  security.py    Password hashing — and where session signing will go
tests/
  test_auth.py       The endpoints, through a real TestClient
  test_db.py         That the database really does start empty every time
  test_security.py   Hashing round-trips, including passphrases past bcrypt's limit
```
