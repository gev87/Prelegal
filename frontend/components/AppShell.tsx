"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAccount } from "@/components/AccountProvider";

/**
 * The bar across the top of every screen.
 *
 * Mounted once in `app/layout.tsx` rather than imported by each page, so that
 * the three screens cannot drift into three slightly different headers — which
 * is the state PL-7 found the product in, with the creator and the login screen
 * each drawing their own wordmark in their own type.
 *
 * `.no-print` is doing real work: `window.print()` is how a PDF is produced
 * here, and a site nav across the top of a signed agreement would be absurd.
 * The class already exists in the print stylesheet for exactly this.
 */
export default function AppShell() {
  const pathname = usePathname();
  const { status, account, signOut } = useAccount();

  return (
    <header className="shell no-print">
      <Link href="/" className="shell-brand">
        Prelegal
      </Link>

      <nav className="shell-nav" aria-label="Sections">
        <ShellLink href="/" pathname={pathname}>
          Draft
        </ShellLink>
        <ShellLink href="/history/" pathname={pathname}>
          My documents
        </ShellLink>
      </nav>

      {/* Nothing at all while the answer is in flight. See AccountProvider:
          rendering "Sign in" first would flash on every load for anyone who
          turns out to be signed in. */}
      <div className="shell-account">
        {status === "signed-in" && account ? (
          <>
            <span className="shell-account-email">{account.email}</span>
            <button type="button" className="shell-signout" onClick={signOut}>
              Sign out
            </button>
          </>
        ) : null}

        {status === "guest" ? (
          <Link href="/login/" className="shell-signin">
            Sign in
          </Link>
        ) : null}
      </div>
    </header>
  );
}

interface ShellLinkProps {
  href: string;
  pathname: string | null;
  children: string;
}

/**
 * `aria-current="page"` rather than only a colour, so which section you are in
 * is available to a screen reader and not just to someone who can see the
 * underline.
 */
function ShellLink({ href, pathname, children }: ShellLinkProps) {
  const here = pathname === href;

  return (
    <Link
      href={href}
      className={`shell-nav-link${here ? " shell-nav-link-active" : ""}`}
      aria-current={here ? "page" : undefined}
    >
      {children}
    </Link>
  );
}
