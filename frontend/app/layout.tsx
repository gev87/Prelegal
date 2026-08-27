import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono, Newsreader } from "next/font/google";
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

export const metadata: Metadata = {
  title: "Mutual NDA creator · Prelegal",
  description:
    "Fill in a few details and get a complete, signable Common Paper Mutual NDA.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${newsreader.variable} ${plexMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
