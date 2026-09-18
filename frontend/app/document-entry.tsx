"use client";

import { useSyncExternalStore } from "react";

import DocumentCreator from "@/components/DocumentCreator";
import type { DocumentType } from "@/lib/documents/types";
import { isoToday } from "@/lib/date";

interface DocumentEntryProps {
  /** Every document type, with its Standard Terms and field descriptors, read
   *  at build time — see lib/documents/catalog.ts. */
  documents: DocumentType[];
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
 * with a placeholder and corrected afterwards. `DocumentCreator` passes
 * `today` to every turn, and the backend uses it to suggest dates — a
 * placeholder corrected a moment later would mean the first suggestion of
 * every conversation was the build date.
 */
export default function DocumentEntry({ documents }: DocumentEntryProps) {
  const today = useSyncExternalStore(neverChanges, isoTodayString, noDateYet);

  if (today === null) {
    return <div className="app-loading" aria-busy="true" />;
  }

  return <DocumentCreator documents={documents} today={today} />;
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
