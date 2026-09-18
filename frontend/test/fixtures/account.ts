import type { Account, AccountStatus } from "@/lib/account";

/**
 * A stand-in for the account context.
 *
 * Every screen sits inside `AccountProvider`, which asks the server who is
 * signed in the moment it mounts. A test that renders one screen does not want
 * that round trip: it would land in the middle of whatever `fetch` assertions
 * the test is actually making, and every test would have to answer a request
 * it does not care about. So `useAccount` is mocked, and this describes what
 * the mock holds.
 *
 * The double itself has to be built inline inside `vi.hoisted`, because
 * `vi.hoisted` runs before this module is imported and so cannot call anything
 * from it:
 *
 * ```ts
 * const account = vi.hoisted(() => ({
 *   status: "guest" as AccountStatus,
 *   account: null as Account | null,
 *   signIn: vi.fn(),
 *   signOut: vi.fn(),
 * }));
 *
 * vi.mock("@/components/AccountProvider", () => ({ useAccount: () => account }));
 * ```
 *
 * The helpers below run in the test body, where ordinary imports work.
 */
export interface AccountDouble {
  status: AccountStatus;
  account: Account | null;
}

export const SOMEBODY: Account = { id: 1, email: "dana@acme.com" };

/** Put the double in the signed-in state, as one call. */
export function signedIn(double: AccountDouble, account: Account = SOMEBODY): void {
  double.status = "signed-in";
  double.account = account;
}

/** Put it back to a visitor with no account. */
export function guest(double: AccountDouble): void {
  double.status = "guest";
  double.account = null;
}

/** The state before the first answer comes back from the server. */
export function stillAsking(double: AccountDouble): void {
  double.status = "loading";
  double.account = null;
}
