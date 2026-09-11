import { afterEach, describe, expect, it, vi } from "vitest";

import { isoToday } from "@/lib/date";

afterEach(() => vi.useRealTimers());

describe("isoToday", () => {
  it("formats the date it is given", () => {
    expect(isoToday(new Date(2026, 2, 14, 9, 30))).toBe("2026-03-14");
  });

  it("pads single-digit months and days", () => {
    expect(isoToday(new Date(2026, 0, 5, 9, 30))).toBe("2026-01-05");
  });

  it("reads the clock when given no date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 1, 12, 0));

    expect(isoToday()).toBe("2026-05-01");
  });

  /**
   * The timezone regression the manual test plan watches for: an ISO
   * timestamp reports the date in UTC, which is yesterday for anyone west of
   * Greenwich late in their day. Building from the local parts avoids it.
   */
  it("uses the local calendar date, not the UTC one", () => {
    // 20:00 on the 14th in a timezone behind UTC is already the 15th in UTC.
    const lateEvening = new Date(2026, 2, 14, 20, 0);

    expect(isoToday(lateEvening)).toBe("2026-03-14");
    expect(isoToday(lateEvening)).toBe(
      `${lateEvening.getFullYear()}-03-${String(lateEvening.getDate()).padStart(2, "0")}`,
    );
  });
});
