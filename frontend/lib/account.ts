/**
 * Who is signed in.
 *
 * The session cookie is `HttpOnly`, so nothing on this side can read it. That
 * is deliberate — see `backend/app/security.py` — and it means the only way to
 * answer "is anybody signed in?" is to ask the server. Hence a round trip
 * where a cookie read would have done, and hence `AccountStatus` having a
 * third state: for the moment before the answer comes back, the page genuinely
 * does not know.
 *
 * Deliberately no error types, unlike `lib/chat.ts`. A failure to work out who
 * somebody is means they are treated as a guest, which is the same thing the
 * answer "nobody" means, and nothing downstream needs to tell those apart.
 */

import { apiFetch } from "@/lib/api";

export interface Account {
  id: number;
  email: string;
}

/** `loading` until the first answer arrives; see `AccountProvider`. */
export type AccountStatus = "loading" | "guest" | "signed-in";

export async function fetchCurrentAccount(): Promise<Account | null> {
  let response: Response;

  try {
    response = await apiFetch("/api/auth/me");
  } catch {
    // A backend that is not running. Not being able to ask is not different,
    // here, from being told nobody is signed in.
    return null;
  }

  if (!response.ok) return null;

  const body = await response.json().catch(() => null);

  return isAccount(body) ? body : null;
}

export async function signOutAccount(): Promise<void> {
  try {
    await apiFetch("/api/auth/signout", { method: "POST" });
  } catch {
    // The cookie is the server's to clear, so a failure here leaves the
    // session standing — but the caller has already decided to stop showing
    // an email, and an error nobody can act on is not worth raising.
  }
}

/**
 * Checked rather than trusted, for the reason `lib/chat.ts` checks its replies:
 * a `.json()` body is `any`, and an `Account` missing its `email` would reach
 * the shell and render `undefined` at the top of every page.
 */
function isAccount(value: unknown): value is Account {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === "number" && typeof record.email === "string";
}
