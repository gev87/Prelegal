"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  fetchCurrentAccount,
  signOutAccount,
  type Account,
  type AccountStatus,
} from "@/lib/account";

/**
 * Who is signed in, answered once for the whole app.
 *
 * Three screens and the shell around them all need this, and asking four times
 * would be four round trips for one answer. More importantly they would
 * disagree for a moment: the nav could say "Sign in" while the page beneath it
 * was already listing saved documents.
 *
 * Starting at `loading` rather than `guest` is the same reasoning
 * `app/document-entry.tsx` applies to the visitor's date. This app is a static
 * export, so the HTML is written at build time, when nobody is signed in and
 * nothing can be known about who will read it. Rendering "Sign in" and then
 * replacing it a moment later would flash on every single page load, for
 * everyone who is signed in, forever. `loading` renders nothing instead.
 */

interface AccountContextValue {
  status: AccountStatus;
  account: Account | null;
  /** Called by the login screen with what signup or signin just returned, so
   *  the shell updates without a second round trip to ask who we are. */
  signIn: (account: Account) => void;
  signOut: () => Promise<void>;
}

const AccountContext = createContext<AccountContextValue | null>(null);

export default function AccountProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AccountStatus>("loading");
  const [account, setAccount] = useState<Account | null>(null);

  /**
   * Whether anything has already settled who is signed in.
   *
   * The provider mounts once, for the life of the page, and asks the server
   * immediately — before any cookie may exist. Signing in is a *later* and
   * better-informed answer to the same question, and the two can cross: the
   * visitor arrives as a guest, the request goes out with no cookie, they
   * reach the login screen and sign in, and only then does the first reply
   * arrive saying "nobody". Without this, that stale "nobody" would win, and
   * somebody who had just signed in would be shown a Sign in link while every
   * request they made was in fact authenticated.
   */
  const settled = useRef(false);

  useEffect(() => {
    fetchCurrentAccount().then((found) => {
      // Superseded by a sign-in or sign-out that happened while this was in
      // flight, or the tree is gone. Either way this answer is out of date.
      if (settled.current) return;

      settled.current = true;
      setAccount(found);
      setStatus(found ? "signed-in" : "guest");
    });
  }, []);

  const signIn = useCallback((signedIn: Account) => {
    settled.current = true;
    setAccount(signedIn);
    setStatus("signed-in");
  }, []);

  const signOut = useCallback(async () => {
    settled.current = true;
    await signOutAccount();
    setAccount(null);
    setStatus("guest");
  }, []);

  const value = useMemo(
    () => ({ status, account, signIn, signOut }),
    [status, account, signIn, signOut],
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountContextValue {
  const value = useContext(AccountContext);

  if (value === null) {
    // Thrown rather than defaulted to a guest: a component rendered outside the
    // provider would otherwise show every visitor a "Sign in" link that never
    // changes, and look like a backend problem rather than a missing wrapper.
    throw new Error("useAccount must be used inside an AccountProvider.");
  }

  return value;
}
