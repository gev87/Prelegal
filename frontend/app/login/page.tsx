"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState, type FormEvent } from "react";

import { useAccount } from "@/components/AccountProvider";
import { apiFetch, describeFailure } from "@/lib/api";

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
 * The login screen — a real session now, and still not a wall.
 *
 * PL-7 made signing in mean something: the server sets a session cookie, and
 * the documents you save are yours. What it deliberately did *not* do is put
 * this screen in front of the product. Drafting an agreement, talking to the
 * assistant and downloading the result all still work with no account at all,
 * and "Continue without an account" is the honest statement of that rather
 * than a euphemism for a demo mode.
 *
 * What signing in buys is exactly one thing: somewhere for a finished document
 * to be kept, and a list of the ones you kept.
 */
export default function LoginPage() {
  const router = useRouter();
  const { signIn } = useAccount();
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
        const response = await apiFetch(`/api/auth/${mode}`, {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });

        if (!response.ok) {
          setError(await describeFailure(response));
          return;
        }

        // Both endpoints answer with the account they just signed in, so the
        // shell can show an email immediately rather than asking `/me` who we
        // are a moment after we told it.
        const account = await response.json().catch(() => null);
        if (account) signIn(account);

        router.push("/");
      } catch {
        // The API is a separate server in development; this is what a
        // backend that was never started looks like from here.
        setError("Could not reach the server. Check that it is running.");
      } finally {
        setSubmitting(false);
      }
    },
    [email, mode, password, router, signIn],
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
