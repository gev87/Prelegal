import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import DownloadBar from "@/components/DownloadBar";
import { DRAFT_DISCLAIMER_LINE } from "@/lib/documents/render";

function renderBar(props: Partial<Parameters<typeof DownloadBar>[0]> = {}) {
  const onDownloadMarkdown = vi.fn();
  const onDownloadPdf = vi.fn();

  return {
    user: userEvent.setup(),
    onDownloadMarkdown,
    onDownloadPdf,
    ...render(
      <DownloadBar
        onDownloadMarkdown={onDownloadMarkdown}
        onDownloadPdf={onDownloadPdf}
        {...props}
      />,
    ),
  };
}

describe("DownloadBar", () => {
  it("offers both downloads", async () => {
    const { user, onDownloadMarkdown, onDownloadPdf } = renderBar();

    await user.click(screen.getByRole("button", { name: "Download Markdown" }));
    await user.click(screen.getByRole("button", { name: "Download PDF" }));

    expect(onDownloadMarkdown).toHaveBeenCalledOnce();
    expect(onDownloadPdf).toHaveBeenCalledOnce();
  });

  /**
   * The same sentence the document carries, so somebody sees it before they
   * download rather than only after. It sits in the header, which the print
   * stylesheet hides, so a PDF shows the one inside the document instead of
   * both.
   */
  it("says the document is a draft", () => {
    renderBar();

    expect(screen.getByText(DRAFT_DISCLAIMER_LINE)).toBeInTheDocument();
  });

  describe("saving", () => {
    /** A guest has nowhere to save to, so they are not offered it. */
    it("is not offered when there is nowhere to save", () => {
      renderBar();

      expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    });

    it("is offered when there is", async () => {
      const onSave = vi.fn();
      const { user } = renderBar({ onSave });

      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(onSave).toHaveBeenCalledOnce();
    });

    it("says it is working, and cannot be asked twice at once", () => {
      renderBar({ onSave: vi.fn(), saveState: "saving" });

      expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    });

    it("says when it is done", () => {
      renderBar({ onSave: vi.fn(), saveState: "saved" });

      expect(screen.getByRole("button", { name: "Saved" })).toBeInTheDocument();
    });

    /** Offering "Save" again is the point: the failure is worth retrying. */
    it("says when it failed, and offers to try again", () => {
      renderBar({ onSave: vi.fn(), saveState: "error" });

      expect(screen.getByRole("alert")).toHaveTextContent(/Could not save/);
      expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    });
  });
});
