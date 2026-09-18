/**
 * "Today", in the visitor's own calendar.
 *
 * Built from the local date parts rather than from an ISO timestamp: a
 * `toISOString()` slice reports the date in UTC, which is yesterday for
 * anyone west of Greenwich for part of their day.
 *
 * Never call this while rendering a page that is statically exported. The
 * frontend is built once and served unchanged from then on, so a date
 * computed during the build is frozen into the HTML for the life of the
 * image — see `app/document-entry.tsx`, which defers it until after mount.
 */
export function isoToday(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * When a saved document was saved, in the reader's own timezone.
 *
 * SQLite's `datetime('now')` writes `YYYY-MM-DD HH:MM:SS` in UTC and says so
 * nowhere in the string. Handing that to `new Date()` as-is is parsed as
 * *local* time by most browsers, which silently shifts every timestamp by the
 * reader's offset — so the space becomes a `T` and a `Z` is appended, making
 * the UTC explicit before anything tries to read it.
 *
 * An unparseable value is returned unchanged rather than rendered as
 * "Invalid Date": it came from the server, and showing it raw at least tells
 * somebody what went wrong.
 */
export function formatSavedAt(stored: string, locale?: string): string {
  const parsed = new Date(`${stored.replace(" ", "T")}Z`);

  if (Number.isNaN(parsed.getTime())) return stored;

  return parsed.toLocaleString(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
