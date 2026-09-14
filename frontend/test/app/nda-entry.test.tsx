import { render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import NdaEntry from "@/app/nda-entry";
import { FAKE_STANDARD_TERMS } from "../fixtures/fields";

afterEach(() => vi.useRealTimers());

describe("NdaEntry", () => {
  /**
   * The regression this component exists to prevent. The page around it is
   * exported once at build time; a date computed there would be the build's
   * date for every visitor from then on. Faking the clock to a date that
   * cannot be "now" is what proves the date comes from the browser.
   */
  it("seeds the cover page from the visitor's clock", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 4, 1, 12, 0));

    render(<NdaEntry standardTerms={FAKE_STANDARD_TERMS} />);

    // Read off the document itself, which is now the only place the date is
    // shown — the cover page renders it in words.
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Agreement preview" })).toHaveTextContent(
        "May 1, 2026",
      ),
    );
  });

  /**
   * What `next build` writes into out/index.html. Effects do not run in this
   * pass, so whatever it produces is frozen into the shipped HTML — it must
   * therefore contain no date at all. If this ever fails, the build date is
   * being baked back in.
   */
  it("renders no date into the exported HTML", () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 4, 1, 12, 0));

    const html = renderToStaticMarkup(
      <NdaEntry standardTerms={FAKE_STANDARD_TERMS} />,
    );

    expect(html).toContain("app-loading");
    expect(html).not.toContain("2026-05-01");
    expect(html).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("shows the creator once mounted", async () => {
    render(<NdaEntry standardTerms={FAKE_STANDARD_TERMS} />);

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Prelegal" })).toBeInTheDocument(),
    );
  });
});
