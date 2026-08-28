import "@testing-library/jest-dom/vitest";

import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

/* -------------------------------------------------------------------------- */
/* jsdom gaps                                                                 */
/* -------------------------------------------------------------------------- */

// jsdom implements no layout, so scrolling an element into view is a no-op it
// does not provide. The components call it; the tests assert it was asked for.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

// jsdom has no media query engine. Default to "no preference" so the reduced
// motion branch is opt-in per test.
if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as unknown as MediaQueryList,
  });
}

// Object URLs and printing are browser services jsdom does not implement.
if (!URL.createObjectURL) {
  URL.createObjectURL = vi.fn(() => "blob:mock");
  URL.revokeObjectURL = vi.fn();
}

// Unconditionally, unlike the guards above: jsdom *does* define `print`, but
// as a method that throws "Not implemented". A guard would leave that in place.
window.print = vi.fn();

afterEach(cleanup);
