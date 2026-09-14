import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import DocumentPreview from "@/components/DocumentPreview";
import { renderMnda } from "@/lib/nda/render";
import type { NdaFields } from "@/lib/nda/schema";
import { completeFields, FAKE_STANDARD_TERMS } from "../fixtures/fields";

function renderPreview(markdown: string, fields: NdaFields = completeFields()) {
  const onTermSelect = vi.fn();
  const view = render(
    <DocumentPreview markdown={markdown} ndaFields={fields} onTermSelect={onTermSelect} />,
  );
  return { ...view, onTermSelect };
}

describe("DocumentPreview", () => {
  it("renders Markdown headings as headings", () => {
    renderPreview("# Mutual Non-Disclosure Agreement\n\n## Cover Page\n");

    expect(
      screen.getByRole("heading", { level: 1, name: "Mutual Non-Disclosure Agreement" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Cover Page" }),
    ).toBeInTheDocument();
  });

  it("renders the signature table as a table, via GFM", () => {
    const markdown = renderMnda(completeFields(), FAKE_STANDARD_TERMS);

    renderPreview(markdown);

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "PARTY 1" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Dana Reyes" })).toBeInTheDocument();
  });

  it("shows an escaped pipe as a literal pipe in the cell", () => {
    const fields = completeFields();
    fields.partyOne.company = "Pipe | Co.";

    renderPreview(renderMnda(fields, FAKE_STANDARD_TERMS), fields);

    expect(screen.getByRole("cell", { name: "Pipe | Co." })).toBeInTheDocument();
  });

  describe("defined terms", () => {
    it("renders a cross-reference as a button, not a link", () => {
      renderPreview("Use it solely for the [Purpose](#purpose).");

      expect(screen.getByRole("button", { name: "Purpose" })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Purpose" })).toBeNull();
    });

    it("reports which term was activated", async () => {
      const user = userEvent.setup();
      const { onTermSelect } = renderPreview("The [MNDA Term](#mnda-term) applies.");

      await user.click(screen.getByRole("button", { name: "MNDA Term" }));

      expect(onTermSelect).toHaveBeenCalledExactlyOnceWith("mndaTerm");
    });

    it("tells governing law and jurisdiction apart despite the shared anchor", async () => {
      const user = userEvent.setup();
      const { onTermSelect } = renderPreview(
        "[Governing Law](#governing-law--jurisdiction) and [Jurisdiction](#governing-law--jurisdiction).",
      );

      await user.click(screen.getByRole("button", { name: "Jurisdiction" }));

      expect(onTermSelect).toHaveBeenCalledExactlyOnceWith("jurisdiction");
    });

    it("shows the current value of the term in its tooltip", () => {
      renderPreview("The [MNDA Term](#mnda-term) applies.", completeFields({
        mndaTermYears: 4,
      }));

      expect(
        screen.getByText("Expires 4 years from the Effective Date."),
      ).toBeInTheDocument();
    });

    it("updates the tooltip when the answer changes", () => {
      const markdown = "The [Term of Confidentiality](#term-of-confidentiality) applies.";
      const { rerender } = renderPreview(markdown);

      rerender(
        <DocumentPreview
          markdown={markdown}
          ndaFields={completeFields({ confidentialityMode: "perpetual" })}
          onTermSelect={vi.fn()}
        />,
      );

      expect(screen.getByText("In perpetuity.")).toBeInTheDocument();
    });

    it("says so when the term has not been filled in yet", () => {
      renderPreview("[Jurisdiction](#governing-law--jurisdiction)", completeFields({
        jurisdiction: "",
      }));

      expect(screen.getByText("Not filled in yet")).toBeInTheDocument();
    });

    it("describes the term to assistive technology, value included", () => {
      renderPreview(
        "[Jurisdiction](#governing-law--jurisdiction)",
        completeFields({ jurisdiction: "New Castle, DE" }),
      );

      expect(
        screen.getByRole("button", { name: "Jurisdiction" }),
      ).toHaveAccessibleDescription(
        "Jurisdiction: New Castle, DE. Activate to edit it on the cover page.",
      );
    });

    // Known cosmetic gap: the description appends its own full stop, so a value
    // that already ends in one — every purpose, including the default — is read
    // out with a doubled period.
    it("doubles the full stop when the value already ends in one", () => {
      renderPreview("[Purpose](#purpose)", completeFields({ purpose: "Evaluating." }));

      expect(screen.getByRole("button", { name: "Purpose" })).toHaveAccessibleDescription(
        "Purpose: Evaluating.. Activate to edit it on the cover page.",
      );
    });

    it("hides the decorative tooltip from assistive technology", () => {
      const { container } = renderPreview("[Purpose](#purpose)");

      expect(container.querySelector(".term-tip")).toHaveAttribute(
        "aria-hidden",
        "true",
      );
    });

    it("gives each reference its own tooltip id", () => {
      const { container } = renderPreview("[Purpose](#purpose) [MNDA Term](#mnda-term)");

      const ids = [...container.querySelectorAll("button.term-ref")].map((button) =>
        button.getAttribute("aria-describedby"),
      );

      expect(new Set(ids).size).toBe(2);
    });

    it("renders every reference to the same term as its own button", () => {
      renderPreview("[Purpose](#purpose) and again the [Purpose](#purpose).");

      expect(screen.getAllByRole("button", { name: "Purpose" })).toHaveLength(2);
    });
  });

  describe("ordinary links", () => {
    it("opens an outbound link in a new tab without leaking the referrer", () => {
      renderPreview("See [Common Paper](https://commonpaper.com/standards).");

      const link = screen.getByRole("link", { name: "Common Paper" });

      expect(link).toHaveAttribute("href", "https://commonpaper.com/standards");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noreferrer");
    });

    it("leaves an internal link that is not a defined term as a link", () => {
      renderPreview("Jump to [some other section](#somewhere-else).");

      expect(
        screen.getByRole("link", { name: "some other section" }),
      ).toBeInTheDocument();
    });

    it("keeps a defined term's label as plain text when the link is outbound", () => {
      renderPreview("[Purpose](https://example.com/purpose)");

      expect(screen.getByRole("link", { name: "Purpose" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Purpose" })).toBeNull();
    });

    /**
     * Known gap: `plainText` reads strings and arrays but not element
     * children, so a cross-reference wrapped in emphasis is not recognised as
     * a defined term. The transform emits plain labels today, so nothing
     * reaches this path.
     *
     * It used to send the in-page fragment to a new tab, which PL-6 fixed
     * while generalising this component: the ten document types without
     * defined terms render every cross-reference as a plain anchor, and an
     * anchor that opens a blank tab on the same page is no use to anybody.
     */
    it("leaves a defined term wrapped in emphasis as an in-page link", () => {
      renderPreview("[**Purpose**](#purpose)");

      expect(screen.queryByRole("button", { name: "Purpose" })).toBeNull();

      const link = screen.getByRole("link", { name: "Purpose" });
      expect(link).toHaveAttribute("href", "#purpose");
      expect(link).not.toHaveAttribute("target");
    });
  });

  it("renders the whole agreement without throwing", () => {
    expect(() =>
      renderPreview(renderMnda(completeFields(), FAKE_STANDARD_TERMS)),
    ).not.toThrow();
  });
});
