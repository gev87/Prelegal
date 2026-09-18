import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono, Newsreader } from "next/font/google";

import AccountProvider from "@/components/AccountProvider";
import AppShell from "@/components/AppShell";

import "./globals.css";

/** The interface. */
const archivo = Archivo({
  variable: "--font-ui",
  subsets: ["latin"],
  display: "swap",
});

/** The agreement itself — a text serif built for reading on screen. */
const newsreader = Newsreader({
  variable: "--font-doc",
  subsets: ["latin"],
  display: "swap",
});

/** Labels, clause numbers and defined-term markers. */
const plexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

/** Eleven document types since PL-6, not one — this said "Mutual NDA creator"
 *  for two tickets after that stopped being true. */
export const metadata: Metadata = {
  title: "Prelegal · draft a legal agreement",
  description:
    "Describe the agreement you need and get a complete, signable Common Paper document.",
};

/**
 * The shell wraps every route, so the nav and the account are drawn once
 * rather than per screen, and `AccountProvider` sits outside it so the shell
 * and the page below it can never disagree about who is signed in.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${newsreader.variable} ${plexMono.variable}`}
    >
      <body>
        <AccountProvider>
          <AppShell />
          <div className="shell-body">{children}</div>
        </AccountProvider>
      </body>
    </html>
  );
}
