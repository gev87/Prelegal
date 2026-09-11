import "@testing-library/jest-dom/vitest";

import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

/* -------------------------------------------------------------------------- */
/* jsdom gaps                                                                 */
/* -------------------------------------------------------------------------- */

// Object URLs and printing are browser services jsdom does not implement.
if (!URL.createObjectURL) {
  URL.createObjectURL = vi.fn(() => "blob:mock");
  URL.revokeObjectURL = vi.fn();
}

// Unconditionally, unlike the guard above: jsdom *does* define `print`, but
// as a method that throws "Not implemented". A guard would leave that in place.
window.print = vi.fn();

afterEach(cleanup);
