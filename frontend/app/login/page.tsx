"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState, type FormEvent } from "react";

import { apiUrl } from "@/lib/api";

type Mode = "signin" | "signup";

const COPY: Record<Mode, { heading: string; submit: string; alternate: string }> = {
  signin: {
    heading: "Sign in to Prelegal",
    submit: "Sign in",
    alternate: "Need an account? Sign up",
  },
  signup: {
    heading: "Create a Prelegal account",
    submit: "Create account",
    alternate: "Already have an account? Sign in",
  },
};

const MIN_PASSWORD_LENGTH = 8;

/**
 * The login screen — and deliberately not a gate.
 *
 * Sign up and sign in are real: they reach the API, they create and check
 * accounts, and the errors shown here are the ones the server actually
 * returned. What they do not do is protect anything. No session is issued,
 * no token is stored, and every other route works whether or not a visitor
 * has been here — "Continue without an account" only makes that explicit.
 *
 * That is the shape PL-4 asks for: the account handling a later ticket needs
 * exists and is exercised, while nothing pretends to be protected yet.
 */
export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const switchMode = useCallback(() => {
    setMode((current) => (current === "signin" ? "signup" : "signin"));
    setError(null);
  }, []);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      setSubmitting(true);

      try {
        const response = await fetch(apiUrl(`/api/auth/${mode}`), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        if (!response.ok) {
          setError(await describeFailure(response));
          return;
        }

        router.push("/");
      } catch {
        // The API is a separate server in development; this is what a
        // backend that was never started looks like from here.
        setError("Could not reach the server. Check that it is running.");
      } finally {
        setSubmitting(false);
      }
    },
    [email, mode, password, router],
  );

  const copy = COPY[mode];

  return (
    <main className="login">
      <div className="login-card">
        <p className="login-brand">Prelegal</p>
        <h1 className="login-heading">{copy.heading}</h1>

        {error ? (
          <p className="login-error" role="alert">
            {error}
          </p>
        ) : null}

        <form onSubmit={handleSubmit}>
          <div className="login-field">
            <label className="login-label" htmlFor="login-email">
              Email
            </label>
            <input
              id="login-email"
              className="login-input"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div className="login-field">
            <label className="login-label" htmlFor="login-password">
              Password
            </label>
            <input
              id="login-password"
              className="login-input"
              type="password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <p className="login-hint">At least {MIN_PASSWORD_LENGTH} characters.</p>
          </div>

          <button type="submit" className="login-submit" disabled={submitting}>
            {submitting ? "Working…" : copy.submit}
          </button>
        </form>

        <button type="button" className="login-alternate" onClick={switchMode}>
          {copy.alternate}
        </button>

        <p className="login-skip">
          <Link href="/">Continue without an account</Link>
        </p>
      </div>
    </main>
  );
}

/**
 * The message to show for a failed request.
 *
 * FastAPI answers a rejected value with `detail` as a list of problems
 * rather than a string, so the string case cannot be assumed — rendering the
 * list object would put "[object Object]" in front of the user.
 */
async function describeFailure(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  const detail = body?.detail;

  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && typeof detail[0]?.msg === "string") return detail[0].msg;

  return "Something went wrong. Please try again.";
}
