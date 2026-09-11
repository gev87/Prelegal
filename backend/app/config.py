"""
Every environment-dependent value the backend needs, read once at import
rather than discovered one ``KeyError`` at a time.

Only two things actually differ between running from a checkout and running
inside the container: where the database file goes, and whether a separate
frontend dev server needs to be allowed through CORS. Everything else is the
same in both, so everything else is a constant here rather than a setting.
"""

from __future__ import annotations

import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent

#: Deleted and recreated on every startup — see ``app.db.init_db``.
#: Resolved from this file rather than the working directory, so the server
#: finds the same database whether it is launched from ``backend/`` or from
#: the repository root.
DATABASE_PATH = Path(
    os.environ.get("PRELEGAL_DATABASE_PATH", BACKEND_DIR / ".data" / "app.db")
)

#: The static export produced by ``next build`` (frontend/out), copied here by
#: the Docker build. Absent in native development, where the frontend serves
#: itself from ``next dev`` — ``app.main`` mounts it only if it exists, so the
#: backend still starts when the frontend has never been built.
FRONTEND_DIR = Path(os.environ.get("PRELEGAL_FRONTEND_DIR", BACKEND_DIR / "static"))

#: Browser origins allowed to call the API cross-origin.
#:
#: Irrelevant in the container, where FastAPI serves the frontend from this
#: same origin and no cross-origin request is made at all. These exist only
#: for native development, where ``next dev`` (port 3000) and this server
#: (port 8000) are two different origins.
CORS_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"]

#: Mirrors ``allowedDevOrigins`` in ``frontend/next.config.ts``. Reaching the
#: dev server by LAN address, to try the layout on a phone, has to clear both
#: the Next dev server and this API — otherwise the login screen fails with a
#: CORS error rather than the auth error the developer was actually testing.
CORS_ORIGIN_REGEX = r"http://192\.168\.88\.\d{1,3}:3000"


def cors_origins() -> list[str]:
    """Allowed origins, overridable as a comma-separated environment value."""
    configured = os.environ.get("PRELEGAL_CORS_ORIGINS")
    if configured is None:
        return list(CORS_ORIGINS)
    return [origin.strip() for origin in configured.split(",") if origin.strip()]
