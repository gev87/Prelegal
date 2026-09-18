/**
 * Where the API lives.
 *
 * In the container FastAPI serves this page *and* the API, so a relative
 * path is correct and no CORS is involved. Under `next dev` the two are
 * separate servers — port 3000 and port 8000 — so the origin has to be
 * spelled out.
 *
 * Derived from `NODE_ENV` rather than a committed `.env` file on purpose:
 * `frontend/.gitignore` ignores `.env*`, so a dev-only env file would be
 * silently dropped from a clone and the login screen would post to the Next
 * dev server instead — which answers with HTML, giving a JSON parse error
 * rather than anything resembling the real problem.
 *
 * `location.hostname` rather than `localhost` so that reaching the dev
 * server by LAN address, to try the layout on a phone, reaches the API at
 * the same address. That mirrors `allowedDevOrigins` in `next.config.ts`.
 */
const DEV_API_PORT = "8000";

/**
 * What went wrong, in words worth showing someone.
 *
 * FastAPI answers a rejected body with `detail` as a list of problems and
 * everything else with `detail` as a sentence. Both shapes arrive here, from
 * every endpoint, which is why this lives beside `apiUrl` rather than in the
 * screen that happened to need it first.
 */
export async function describeFailure(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  const detail = body?.detail;

  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && typeof detail[0]?.msg === "string") return detail[0].msg;

  return "Something went wrong. Please try again.";
}

/**
 * Every call to the API, so that none of them forgets the session.
 *
 * `credentials: "include"` is the whole reason this exists. The session cookie
 * is set by FastAPI and sent back by the browser automatically — but only
 * same-origin, which is exactly what the container is. Under `next dev` the
 * page is on port 3000 and the API on 8000, so a call without this flag
 * silently drops the cookie and the visitor looks signed out. It fails in
 * development and works in production, which is the worst way round for a bug
 * to behave, so the flag lives here rather than at each call site where one
 * can be missed.
 *
 * `Content-Type` is set for the same reason it was repeated at every call site
 * before: FastAPI needs it to parse a JSON body. It is still overridable, for
 * a caller that sends something else.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(apiUrl(path), {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init.headers },
  });
}

export function apiUrl(path: string): string {
  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return `${process.env.NEXT_PUBLIC_API_BASE_URL}${path}`;
  }

  if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:${DEV_API_PORT}${path}`;
  }

  return path;
}
