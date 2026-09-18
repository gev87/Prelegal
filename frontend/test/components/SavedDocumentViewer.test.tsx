import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SavedDocumentViewer from "@/components/SavedDocumentViewer";
import { DRAFT_DISCLAIMER_LINE, renderDocument } from "@/lib/documents/render";
import {
  asDocumentFields,
  completeFields,
  completePilotFields,
  DOCUMENTS,
  NDA_DOCUMENT,
  PILOT_DOCUMENT,
} from "../fixtures/fields";

let createdBlobs: Blob[];
let downloadedNames: string[];
let print: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  createdBlobs = [];
  downloadedNames = [];

  vi.spyOn(URL, "createObjectURL").mockImplementation((blob: Blob | MediaSource) => {
    createdBlobs.push(blob as Blob);
    return "blob:mock";
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloadedNames.push(this.download);
  });

  print = vi.spyOn(window, "print").mockImplementation(() => {});
});

function aSavedPilot() {
  return {
    id: 3,
    documentType: PILOT_DOCUMENT.slug,
    documentTypeName: PILOT_DOCUMENT.name,
    createdAt: "2026-03-14 12:00:00",
    fields: completePilotFields(),
  };
}

function aSavedNda() {
  return {
    id: 4,
    documentType: NDA_DOCUMENT.slug,
    documentTypeName: NDA_DOCUMENT.name,
    createdAt: "2026-03-14 12:00:00",
    fields: asDocumentFields(completeFields()),
  };
}

function renderViewer(saved = aSavedPilot(), onBack = vi.fn()) {
  return {
    user: userEvent.setup(),
    onBack,
    ...render(
      <SavedDocumentViewer saved={saved} documents={DOCUMENTS} onBack={onBack} />,
    ),
  };
}

describe("SavedDocumentViewer", () => {
  it("names the document it is showing", () => {
    renderViewer();

    // Twice over: once as the header badge, once as the agreement's own
    // heading inside the sheet.
    expect(screen.getAllByText(PILOT_DOCUMENT.name).length).toBeGreaterThan(0);
  });

  /**
   * The same renderer the live creator uses, not a second one for saved
   * documents. This is why the server stores the answers rather than the
   * finished text — a template correction reaches documents already saved.
   */
  it("renders it exactly as the creator would", async () => {
    const { user } = renderViewer();

    await user.click(screen.getByRole("button", { name: "Download Markdown" }));

    expect(await createdBlobs[0].text()).toBe(
      renderDocument(PILOT_DOCUMENT, completePilotFields()),
    );
  });

  it("names the file the same way too", async () => {
    const { user } = renderViewer();

    await user.click(screen.getByRole("button", { name: "Download Markdown" }));

    expect(downloadedNames[0]).toMatch(/^pilot-agreement-.*\.md$/);
  });

  it("prints for a PDF, as the creator does", async () => {
    const { user } = renderViewer();

    await user.click(screen.getByRole("button", { name: "Download PDF" }));

    expect(print).toHaveBeenCalledOnce();
  });

  it("carries the draft disclaimer", () => {
    renderViewer();

    expect(screen.getAllByText(DRAFT_DISCLAIMER_LINE).length).toBeGreaterThan(0);
  });

  it("goes back when asked", async () => {
    const { user, onBack } = renderViewer();

    await user.click(screen.getByRole("button", { name: /My documents/ }));

    expect(onBack).toHaveBeenCalled();
  });

  /** There is nothing to save: it is already saved, by definition. */
  it("offers no Save button", () => {
    renderViewer();

    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  describe("a defined term on a saved Mutual NDA", () => {
    /**
     * On the creator this is a button that seeds a question to the assistant.
     * Here there is no conversation to send it to, so offering a control that
     * cannot change anything would be worse than offering none.
     */
    it("is not something to click", () => {
      renderViewer(aSavedNda());

      expect(screen.queryByRole("button", { name: "Purpose" })).toBeNull();
    });

    it("still says what it stands for", () => {
      renderViewer(aSavedNda());

      expect(screen.getAllByText("Purpose").length).toBeGreaterThan(0);
    });
  });

  /** Nothing does this today, but a blank sheet would be a worse answer than
   *  saying so. */
  it("says so when the document type is no longer offered", () => {
    renderViewer({ ...aSavedPilot(), documentType: "retired-agreement" });

    expect(screen.getByRole("alert")).toHaveTextContent(/no longer offers/);
  });
});
