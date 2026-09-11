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
 * image — see `app/nda-entry.tsx`, which defers it until after mount.
 */
export function isoToday(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
