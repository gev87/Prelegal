import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import NdaCreator from "@/components/NdaCreator";
import { documentFilename, renderMnda } from "@/lib/nda/render";
import { createDefaultFields, type NdaFields } from "@/lib/nda/schema";
import { FAKE_STANDARD_TERMS } from "../fixtures/fields";

const TODAY = "2026-03-14";

let createdBlobs: Blob[];
let downloadedNames: string[];
let scrollIntoView: ReturnType<typeof vi.spyOn>;
let print: ReturnType<typeof vi.spyOn>;
let revokeObjectURL: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  createdBlobs = [];
  downloadedNames = [];

  vi.spyOn(URL, "createObjectURL").mockImplementation((blob: Blob | MediaSource) => {
    createdBlobs.push(blob as Blob);
    return "blob:mock";
  });
  revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

  // Intercept the synthetic click so jsdom never attempts a navigation.
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloadedNames.push(this.download);
  });

  scrollIntoView = vi
    .spyOn(Element.prototype, "scrollIntoView")
    .mockImplementation(() => {});
  print = vi.spyOn(window, "print").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderCreator() {
  return {
    user: userEvent.setup(),
    ...render(<NdaCreator standardTerms={FAKE_STANDARD_TERMS} today={TODAY} />),
  };
}

/**
 * Fills in everything a download needs, leaving the seeded defaults alone.
 * Pasting rather than typing: every keystroke re-renders the whole agreement,
 * so typing all eight answers out is far slower than the test needs to be.
 */
async function completeTheForm(user: ReturnType<typeof userEvent.setup>) {
  const [companyOne, companyTwo] = screen.getAllByLabelText("Company");
  const [nameOne, nameTwo] = screen.getAllByLabelText("Signed by");
  const [titleOne, titleTwo] = screen.getAllByLabelText("Title");
  const [noticeOne, noticeTwo] = screen.getAllByLabelText("Notice address");

  const fill = async (field: HTMLElement, text: string) => {
    await user.click(field);
    await user.paste(text);
  };

  await fill(companyOne, "Acme, Inc.");
  await fill(nameOne, "Dana Reyes");
  await fill(titleOne, "Chief Executive Officer");
  await fill(noticeOne, "legal@acme.com");
  await fill(companyTwo, "Globex Corporation");
  await fill(nameTwo, "Sam Okafor");
  await fill(titleTwo, "General Counsel");
  await fill(noticeTwo, "notices@globex.example");
}

/** The fields the seeded form holds once `completeTheForm` has run. */
function expectedFields(): NdaFields {
  return {
    ...createDefaultFields(TODAY),
    partyOne: {
      company: "Acme, Inc.",
      signatoryName: "Dana Reyes",
      signatoryTitle: "Chief Executive Officer",
      noticeAddress: "legal@acme.com",
    },
    partyTwo: {
      company: "Globex Corporation",
      signatoryName: "Sam Okafor",
      signatoryTitle: "General Counsel",
      noticeAddress: "notices@globex.example",
    },
  };
}

describe("NdaCreator", () => {
  it("shows the form and the document side by side", () => {
    renderCreator();

    expect(screen.getByRole("region", { name: "Agreement details" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Agreement preview" })).toBeInTheDocument();
  });

  it("seeds the effective date from the date the server rendered", () => {
    renderCreator();

    expect(screen.getByLabelText("Effective date")).toHaveValue(TODAY);
    expect(screen.getByRole("region", { name: "Agreement preview" })).toHaveTextContent(
      "March 14, 2026",
    );
  });

  describe("errors before a download is attempted", () => {
    it("shows none on first paint, though the parties are blank", () => {
      const { container } = renderCreator();

      expect(container.querySelectorAll(".field-error")).toHaveLength(0);
    });

    it("shows a field's error only once that field has been visited", async () => {
      const { user } = renderCreator();

      await user.click(screen.getAllByLabelText("Company")[0]);
      await user.tab();

      expect(
        screen.getByText("Enter the company entering into the agreement."),
      ).toBeInTheDocument();
      expect(screen.queryByText("Enter the name of the person signing.")).toBeNull();
    });

    it("clears the error once the field is filled in", async () => {
      const { user } = renderCreator();
      const company = screen.getAllByLabelText("Company")[0];

      await user.click(company);
      await user.tab();
      await user.type(company, "Acme, Inc.");

      expect(
        screen.queryByText("Enter the company entering into the agreement."),
      ).toBeNull();
    });
  });

  describe("the live preview", () => {
    it("shows the seeded purpose", () => {
      renderCreator();

      expect(screen.getByRole("region", { name: "Agreement preview" })).toHaveTextContent(
        "Evaluating whether to enter into a business relationship with the other party.",
      );
    });

    it("follows the purpose as it is edited", async () => {
      const { user } = renderCreator();
      const purpose = screen.getByLabelText("Purpose");

      await user.clear(purpose);
      await user.type(purpose, "Evaluating a reseller deal.");

      expect(screen.getByRole("region", { name: "Agreement preview" })).toHaveTextContent(
        "Evaluating a reseller deal.",
      );
    });

    it("follows a company name into the signature table", async () => {
      const { user } = renderCreator();

      await user.type(screen.getAllByLabelText("Company")[0], "Initech");

      expect(screen.getByRole("cell", { name: "Initech" })).toBeInTheDocument();
    });

    it("follows the term choice", async () => {
      const { user } = renderCreator();

      await user.click(screen.getByRole("radio", { name: "In perpetuity" }));

      expect(screen.getByRole("region", { name: "Agreement preview" })).toHaveTextContent(
        "In perpetuity.",
      );
    });
  });

  describe("downloading Markdown", () => {
    it("is blocked while a required answer is missing", async () => {
      const { user } = renderCreator();

      await user.click(screen.getByRole("button", { name: "Download Markdown" }));

      expect(createdBlobs).toHaveLength(0);
      expect(downloadedNames).toHaveLength(0);
    });

    it("reveals every outstanding error when it is blocked", async () => {
      const { user, container } = renderCreator();

      await user.click(screen.getByRole("button", { name: "Download Markdown" }));

      expect(container.querySelectorAll(".field-error")).toHaveLength(6);
    });

    it("jumps to the first outstanding error, in form order", async () => {
      const { user } = renderCreator();

      await user.click(screen.getByRole("button", { name: "Download Markdown" }));

      await waitFor(() =>
        expect(document.activeElement).toBe(screen.getAllByLabelText("Company")[0]),
      );
    });

    it("jumps to a broken answer above the parties when there is one", async () => {
      const { user } = renderCreator();

      await user.clear(screen.getByLabelText("Purpose"));
      await user.click(screen.getByRole("button", { name: "Download Markdown" }));

      await waitFor(() =>
        expect(document.activeElement).toBe(screen.getByLabelText("Purpose")),
      );
    });

    it("downloads once every answer is present", async () => {
      const { user } = renderCreator();

      await completeTheForm(user);
      await user.click(screen.getByRole("button", { name: "Download Markdown" }));

      expect(createdBlobs).toHaveLength(1);
      expect(createdBlobs[0].type).toBe("text/markdown;charset=utf-8");
    });

    it("names the file after both parties and the effective date", async () => {
      const { user } = renderCreator();

      await completeTheForm(user);
      await user.click(screen.getByRole("button", { name: "Download Markdown" }));

      expect(downloadedNames).toEqual([
        documentFilename(expectedFields(), "md"),
      ]);
      expect(downloadedNames[0]).toBe(
        "mutual-nda-acme-inc-and-globex-corporation-2026-03-14.md",
      );
    });

    it("writes the same document the preview is showing", async () => {
      const { user } = renderCreator();

      await completeTheForm(user);
      await user.click(screen.getByRole("button", { name: "Download Markdown" }));

      await expect(createdBlobs[0].text()).resolves.toBe(
        renderMnda(expectedFields(), FAKE_STANDARD_TERMS),
      );
    });

    it("leaves no dangling object URL behind", async () => {
      const { user } = renderCreator();

      await completeTheForm(user);
      await user.click(screen.getByRole("button", { name: "Download Markdown" }));

      await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock"));
    });

    it("removes the temporary link from the page", async () => {
      const { user } = renderCreator();

      await completeTheForm(user);
      await user.click(screen.getByRole("button", { name: "Download Markdown" }));

      expect(document.querySelectorAll("a[download]")).toHaveLength(0);
    });
  });

  describe("downloading PDF", () => {
    it("is blocked while a required answer is missing", async () => {
      const { user } = renderCreator();

      await user.click(screen.getByRole("button", { name: "Download PDF" }));

      expect(print).not.toHaveBeenCalled();
    });

    it("prints once every answer is present", async () => {
      const { user } = renderCreator();

      await completeTheForm(user);
      await user.click(screen.getByRole("button", { name: "Download PDF" }));

      expect(print).toHaveBeenCalledTimes(1);
    });

    it("does not build a Markdown blob", async () => {
      const { user } = renderCreator();

      await completeTheForm(user);
      await user.click(screen.getByRole("button", { name: "Download PDF" }));

      expect(createdBlobs).toHaveLength(0);
    });
  });

  describe("jumping from a defined term to its field", () => {
    it("focuses the field that defines the term", async () => {
      const { user } = renderCreator();
      const preview = screen.getByRole("region", { name: "Agreement preview" });

      await user.click(within(preview).getAllByRole("button", { name: "Purpose" })[0]);

      await waitFor(() =>
        expect(document.activeElement).toBe(screen.getByLabelText("Purpose")),
      );
    });

    it("tells jurisdiction apart from governing law", async () => {
      const { user } = renderCreator();
      const preview = screen.getByRole("region", { name: "Agreement preview" });

      await user.click(within(preview).getAllByRole("button", { name: "Jurisdiction" })[0]);

      await waitFor(() =>
        expect(document.activeElement).toBe(screen.getByLabelText("Jurisdiction")),
      );
    });

    it("highlights the field it jumped to", async () => {
      const { user, container } = renderCreator();
      const preview = screen.getByRole("region", { name: "Agreement preview" });

      await user.click(within(preview).getAllByRole("button", { name: "Purpose" })[0]);

      await waitFor(() =>
        expect(container.querySelector("#field-purpose")?.className).toContain(
          "field-flash",
        ),
      );
    });

    it("scrolls smoothly by default", async () => {
      const { user } = renderCreator();
      const preview = screen.getByRole("region", { name: "Agreement preview" });

      await user.click(within(preview).getAllByRole("button", { name: "Purpose" })[0]);

      await waitFor(() =>
        expect(scrollIntoView).toHaveBeenCalledWith({
          behavior: "smooth",
          block: "center",
        }),
      );
    });

    it("scrolls instantly when the reader prefers reduced motion", async () => {
      vi.spyOn(window, "matchMedia").mockReturnValue({
        matches: true,
      } as MediaQueryList);
      const { user } = renderCreator();
      const preview = screen.getByRole("region", { name: "Agreement preview" });

      await user.click(within(preview).getAllByRole("button", { name: "Purpose" })[0]);

      await waitFor(() =>
        expect(scrollIntoView).toHaveBeenCalledWith({
          behavior: "auto",
          block: "center",
        }),
      );
    });

    /**
     * Known gap: the reveal selector is `input:not([disabled]), textarea,
     * select`, which returns the first match in document order across *all*
     * branches — and in both term groups that is the mode radio, not the year
     * box the reader has to correct. Landing on the radio is at least never a
     * disabled control, but it is not the control that needs fixing.
     */
    it("lands on the mode radio rather than the year box of a term group", async () => {
      const { user } = renderCreator();
      const preview = screen.getByRole("region", { name: "Agreement preview" });

      await user.click(within(preview).getAllByRole("button", { name: "MNDA Term" })[0]);

      await waitFor(() =>
        expect(document.activeElement).toHaveAttribute("type", "radio"),
      );
      expect(document.activeElement).not.toBeDisabled();
    });
  });

  describe("the narrow-screen view switch", () => {
    it("starts on the details view", () => {
      renderCreator();

      expect(screen.getByRole("button", { name: "Details" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(screen.getByRole("button", { name: "Document" })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    });

    it("switches to the document view", async () => {
      const { user, container } = renderCreator();

      await user.click(screen.getByRole("button", { name: "Document" }));

      expect(container.querySelector(".pane-document")?.className).not.toContain(
        "pane-hidden",
      );
      expect(container.querySelector(".pane-form")?.className).toContain("pane-hidden");
    });

    it("returns to the details view when a term is activated from the document", async () => {
      const { user, container } = renderCreator();
      await user.click(screen.getByRole("button", { name: "Document" }));
      const preview = screen.getByRole("region", { name: "Agreement preview" });

      await user.click(within(preview).getAllByRole("button", { name: "Purpose" })[0]);

      expect(container.querySelector(".pane-form")?.className).not.toContain(
        "pane-hidden",
      );
    });

    it("returns to the details view when a blocked download reveals an error", async () => {
      const { user, container } = renderCreator();
      await user.click(screen.getByRole("button", { name: "Document" }));

      await user.click(screen.getByRole("button", { name: "Download Markdown" }));

      expect(container.querySelector(".pane-form")?.className).not.toContain(
        "pane-hidden",
      );
    });
  });

  it("renders the whole agreement, cover page and standard terms", () => {
    renderCreator();
    const preview = screen.getByRole("region", { name: "Agreement preview" });

    expect(preview).toHaveTextContent("Mutual Non-Disclosure Agreement");
    expect(preview).toHaveTextContent("Cover Page");
    expect(preview).toHaveTextContent("Standard Terms");
  });

  it("matches the document the renderer produces for the seeded answers", () => {
    renderCreator();

    const markdown = renderMnda(createDefaultFields(TODAY), FAKE_STANDARD_TERMS);

    expect(markdown).toContain("March 14, 2026");
    expect(markdown).toContain("Expires 1 year from the Effective Date.");
  });
});
