"use client";

import { useSyncExternalStore } from "react";

import NdaCreator from "@/components/NdaCreator";
import { isoToday } from "@/lib/date";

interface NdaEntryProps {
  /** The Standard Terms, read from the repository's templates/ directory at
   *  build time — see lib/nda/templates.ts. */
  standardTerms: string;
}

/** The clock is read, never watched: no subscriber is ever notified. */
const neverChanges = () => () => {};

/** What the build sees. There is no visitor and so no date yet. */
const noDateYet = () => null;

/**
 * Supplies the creator with today's date, from the visitor's clock.
 *
 * The page around this is exported once, at build time, and then served
 * unchanged: a date computed up there would be the date the image was built,
 * and every agreement drafted afterwards would open with it.
 *
 * `useSyncExternalStore` is how that difference is expressed — the clock is
 * an external source with one answer while rendering the export and another
 * in the browser, and this hook is built to give each of them their own.
 * The alternative, setting state from an effect, causes a second render pass
 * for a value that was available on the first.
 *
 * The creator is not rendered until the date is known, rather than rendered
 * with a placeholder and corrected afterwards. `NdaCreator` seeds its form
 * state from `today` in a `useState` initialiser, which reads the prop once
 * and ignores every later value — a correction would leave the cover page
 * showing the placeholder.
 */
export default function NdaEntry({ standardTerms }: NdaEntryProps) {
  const today = useSyncExternalStore(neverChanges, isoTodayString, noDateYet);

  if (today === null) {
    return <div className="app-loading" aria-busy="true" />;
  }

  return <NdaCreator standardTerms={standardTerms} today={today} />;
}

/**
 * `isoToday` takes an optional date; `useSyncExternalStore` calls its
 * snapshot with none. Wrapping it keeps that explicit, and keeps the
 * returned string stable across the repeated calls React makes to check
 * whether the value changed.
 */
function isoTodayString(): string {
  return isoToday();
}
