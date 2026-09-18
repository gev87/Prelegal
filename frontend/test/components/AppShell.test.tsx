import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AppShell from "@/components/AppShell";
import { guest, signedIn, SOMEBODY, stillAsking } from "../fixtures/account";

/** Built inline because `vi.hoisted` runs before imports — see
 *  `test/fixtures/account.ts`. */
const account = vi.hoisted(() => ({
  status: "guest" as "loading" | "guest" | "signed-in",
  account: null as { id: number; email: string } | null,
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/components/AccountProvider", () => ({
  useAccount: () => account,
}));

const pathname = vi.hoisted(() => ({ current: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

beforeEach(() => {
  guest(account);
  account.signOut.mockClear();
  pathname.current = "/";
});

describe("AppShell", () => {
  it("names the product once, for every screen", () => {
    render(<AppShell />);

    expect(screen.getByRole("link", { name: "Prelegal" })).toBeInTheDocument();
  });

  it("links to both sections", () => {
    render(<AppShell />);

    expect(screen.getByRole("link", { name: "Draft" })).toHaveAttribute("href", "/");
    // The trailing slash is load-bearing under `output: "export"` — without it
    // the built export answers /history with a 404 page.
    expect(screen.getByRole("link", { name: "My documents" })).toHaveAttribute(
      "href",
      "/history/",
    );
  });

  describe("a visitor with no account", () => {
    it("is offered a way in", () => {
      render(<AppShell />);

      expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
        "href",
        "/login/",
      );
    });

    it("is not offered a way out", () => {
      render(<AppShell />);

      expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
    });
  });

  describe("somebody signed in", () => {
    beforeEach(() => signedIn(account));

    it("is told which account they are using", () => {
      render(<AppShell />);

      expect(screen.getByText(SOMEBODY.email)).toBeInTheDocument();
    });

    it("can sign out", async () => {
      const user = userEvent.setup();
      render(<AppShell />);

      await user.click(screen.getByRole("button", { name: "Sign out" }));

      expect(account.signOut).toHaveBeenCalled();
    });

    it("is not also offered a way in", () => {
      render(<AppShell />);

      expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    });
  });

  /**
   * The page is a static export, so its HTML is written at build time when
   * nobody is signed in. Rendering "Sign in" before the answer arrives would
   * flash on every load for everyone who turns out to be signed in.
   */
  it("says nothing about the account until it knows", () => {
    stillAsking(account);

    render(<AppShell />);

    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  });

  describe("which section you are in", () => {
    it("is marked on the current one", () => {
      pathname.current = "/history/";

      render(<AppShell />);

      expect(screen.getByRole("link", { name: "My documents" })).toHaveAttribute(
        "aria-current",
        "page",
      );
    });

    /** Announced rather than only coloured, so it reaches somebody who cannot
     *  see the underline. */
    it("is not marked on the others", () => {
      pathname.current = "/history/";

      render(<AppShell />);

      expect(screen.getByRole("link", { name: "Draft" })).not.toHaveAttribute(
        "aria-current",
      );
    });
  });
});
