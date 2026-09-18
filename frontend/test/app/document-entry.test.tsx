import { render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import DocumentEntry from "@/app/document-entry";
import { DOCUMENTS } from "../fixtures/fields";

afterEach(() => vi.useRealTimers());

describe("DocumentEntry", () => {
  /**
   * The regression this component exists to prevent. The page around it is
   * exported once at build time; a date computed there would be the build's
   * date for every visitor from then on. Faking the clock to a date that
   * cannot be "now" is what proves the date comes from the browser.
   *
   * Read off the creator's own prop rather than off the rendered document,
   * as it was before PL-6: there is no document on screen until the
   * assistant has been told which one to draft, so the date has nowhere to
   * appear until a conversation has happened.
   */
  it("takes today from the visitor's clock", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 4, 1, 12, 0));

    render(<DocumentEntry documents={DOCUMENTS} />);

    await waitFor(() =>
      expect(screen.getByTestId("today")).toHaveTextContent("2026-05-01"),
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

    const html = renderToStaticMarkup(<DocumentEntry documents={DOCUMENTS} />);

    expect(html).toContain("app-loading");
    expect(html).not.toContain("2026-05-01");
    expect(html).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("shows the creator once mounted", async () => {
    render(<DocumentEntry documents={DOCUMENTS} />);

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Prelegal" })).toBeInTheDocument(),
    );
  });
});

/**
 * The creator is replaced wholesale so this file tests one thing: what
 * `DocumentEntry` hands down, and when. Rendering the real creator would
 * bring the chat panel and the whole document catalog along with it.
 */
vi.mock("@/components/DocumentCreator", () => ({
  default: ({ today }: { today: string }) => (
    <div>
      <h1>Prelegal</h1>
      <span data-testid="today">{today}</span>
    </div>
  ),
}));
