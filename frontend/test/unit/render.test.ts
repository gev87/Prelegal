import { afterEach, describe, expect, it } from "vitest";

import {
  describeTerm,
  documentFilename,
  formatEffectiveDate,
  renderMnda,
  transformStandardTerms,
} from "@/lib/nda/render";
import { DEFINED_TERMS, type NdaFields } from "@/lib/nda/schema";
import { completeFields, FAKE_STANDARD_TERMS, party } from "../fixtures/fields";

/** The heading anchor GitHub-flavoured Markdown derives from a heading. */
function gfmAnchor(heading: string): string {
  return `#${heading
    .toLowerCase()
    .replace(/[^\w\- ]/g, "")
    .trim()
    .replace(/ /g, "-")}`;
}

function coverPageOf(markdown: string): string {
  return markdown.slice(0, markdown.indexOf("## Standard Terms"));
}

describe("renderMnda", () => {
  it("puts the cover page before the standard terms", () => {
    const markdown = renderMnda(completeFields(), FAKE_STANDARD_TERMS);

    expect(markdown.indexOf("## Cover Page")).toBeGreaterThan(-1);
    expect(markdown.indexOf("## Cover Page")).toBeLessThan(
      markdown.indexOf("## Standard Terms"),
    );
  });

  it("leaves exactly one H1 in the finished agreement", () => {
    const markdown = renderMnda(completeFields(), FAKE_STANDARD_TERMS);

    expect(markdown.match(/^# .*$/gm)).toEqual(["# Mutual Non-Disclosure Agreement"]);
  });

  it("carries every cover-page answer into the document", () => {
    const fields = completeFields({
      purpose: "Evaluating a potential reseller relationship.",
      governingLaw: "New York",
      jurisdiction: "New York County, NY",
    });

    const cover = coverPageOf(renderMnda(fields, FAKE_STANDARD_TERMS));

    expect(cover).toContain("Evaluating a potential reseller relationship.");
    expect(cover).toContain("March 14, 2026");
    expect(cover).toContain("Governing Law: New York");
    expect(cover).toContain("Jurisdiction: New York County, NY");
    expect(cover).toContain("Acme, Inc.");
    expect(cover).toContain("Globex Corporation");
    expect(cover).toContain("Dana Reyes");
    expect(cover).toContain("Sam Okafor");
  });

  it("renders the cover-page headings the standard terms link back to", () => {
    const cover = coverPageOf(renderMnda(completeFields(), FAKE_STANDARD_TERMS));

    expect(cover).toContain("### Purpose");
    expect(cover).toContain("### Effective Date");
    expect(cover).toContain("### MNDA Term");
    expect(cover).toContain("### Term of Confidentiality");
    expect(cover).toContain("### Governing Law & Jurisdiction");
    expect(cover).toContain("### MNDA Modifications");
  });

  it("gives every defined term an anchor that resolves to a real heading", () => {
    const cover = coverPageOf(renderMnda(completeFields(), FAKE_STANDARD_TERMS));
    const anchors = new Set(
      [...cover.matchAll(/^#{1,6} (.+)$/gm)].map((match) => gfmAnchor(match[1])),
    );

    for (const term of Object.values(DEFINED_TERMS)) {
      expect(anchors, `anchor for ${term.label}`).toContain(term.anchor);
    }
  });

  it("trims stray whitespace out of the answers", () => {
    const fields = completeFields({
      purpose: "  Evaluating.  ",
      governingLaw: " Texas ",
      jurisdiction: " Travis County, TX ",
    });

    const cover = coverPageOf(renderMnda(fields, FAKE_STANDARD_TERMS));

    expect(cover).toContain("\nEvaluating.\n");
    expect(cover).toContain("Governing Law: Texas\n");
    expect(cover).toContain("Jurisdiction: Travis County, TX\n");
  });

  it("records 'None.' when no modifications were made", () => {
    const cover = coverPageOf(
      renderMnda(completeFields({ modifications: "   " }), FAKE_STANDARD_TERMS),
    );

    expect(cover).toContain("### MNDA Modifications\n\nNone.");
  });

  it("records the modifications when there are some", () => {
    const cover = coverPageOf(
      renderMnda(
        completeFields({ modifications: "Section 3 is deleted." }),
        FAKE_STANDARD_TERMS,
      ),
    );

    expect(cover).toContain("Section 3 is deleted.");
    expect(cover).not.toContain("None.");
  });

  it("names the published standard terms it incorporates", () => {
    const cover = coverPageOf(renderMnda(completeFields(), FAKE_STANDARD_TERMS));

    expect(cover).toContain("Common Paper Mutual NDA Standard Terms Version 1.0");
    expect(cover).toContain("https://commonpaper.com/standards/mutual-nda/1.0");
  });

  it("is deterministic for the same answers", () => {
    const fields = completeFields();

    expect(renderMnda(fields, FAKE_STANDARD_TERMS)).toBe(
      renderMnda(fields, FAKE_STANDARD_TERMS),
    );
  });

  it("never mutates the fields it is given", () => {
    const fields = completeFields();
    const before = structuredClone(fields);

    renderMnda(fields, FAKE_STANDARD_TERMS);

    expect(fields).toEqual(before);
  });

  it("still renders a document when required answers are missing", () => {
    const fields = completeFields({ partyOne: party(), purpose: "" });

    expect(() => renderMnda(fields, FAKE_STANDARD_TERMS)).not.toThrow();
  });
});

describe("signature table", () => {
  function signatureTable(fields: NdaFields): string[] {
    const cover = coverPageOf(renderMnda(fields, FAKE_STANDARD_TERMS));
    return cover.split("\n").filter((line) => line.startsWith("|"));
  }

  /** Splits a row the way a Markdown parser does — on unescaped pipes only. */
  function cells(row: string): string[] {
    return row.split(/(?<!\\)\|/);
  }

  it("has a header, a delimiter and one row per detail", () => {
    const rows = signatureTable(completeFields());

    expect(rows[0]).toBe("| | PARTY 1 | PARTY 2 |");
    expect(rows[1]).toBe("| :--- | :--- | :--- |");
    expect(rows).toHaveLength(8);
  });

  it("gives every row three cells so the table stays well formed", () => {
    for (const row of signatureTable(completeFields())) {
      expect(cells(row)).toHaveLength(5);
    }
  });

  it("leaves the signature and date rows blank for wet signing", () => {
    const rows = signatureTable(completeFields());

    expect(rows[2]).toBe("| Signature |  |  |");
    expect(rows.at(-1)).toBe("| Date |  |  |");
  });

  it("places each party in its own column", () => {
    const rows = signatureTable(completeFields());

    expect(rows[3]).toBe("| Print Name | Dana Reyes | Sam Okafor |");
    expect(rows[4]).toBe("| Title | Chief Executive Officer | General Counsel |");
    expect(rows[5]).toBe("| Company | Acme, Inc. | Globex Corporation |");
  });

  it("escapes a pipe in a company name rather than splitting the row", () => {
    const fields = completeFields();
    fields.partyOne.company = "Pipe | Co.";

    const companyRow = signatureTable(fields).find((row) => row.startsWith("| Company"));

    expect(companyRow).toBe(String.raw`| Company | Pipe \| Co. | Globex Corporation |`);
    expect(companyRow && cells(companyRow)).toHaveLength(5);
  });

  it("escapes every pipe in a cell, not only the first", () => {
    const fields = completeFields();
    fields.partyOne.company = "a|b|c";

    const companyRow = signatureTable(fields).find((row) => row.startsWith("| Company"));

    expect(companyRow && cells(companyRow)).toHaveLength(5);
  });

  it("folds a multi-line notice address onto one line", () => {
    const fields = completeFields();
    fields.partyOne.noticeAddress = "Acme, Inc.\n500 Market St\nSan Francisco, CA 94105";

    const noticeRow = signatureTable(fields).find((row) => row.startsWith("| Notice"));

    expect(noticeRow).toContain("Acme, Inc., 500 Market St, San Francisco, CA 94105");
    expect(noticeRow && cells(noticeRow)).toHaveLength(5);
  });

  it("drops blank lines and trims each line of an address", () => {
    const fields = completeFields();
    fields.partyOne.noticeAddress = "  Suite 400  \n\n\n  Boston, MA  \n";

    const noticeRow = signatureTable(fields).find((row) => row.startsWith("| Notice"));

    expect(noticeRow).toBe("| Notice Address | Suite 400, Boston, MA | notices@globex.example |");
  });

  it("leaves a cell empty when the optional title is blank", () => {
    const fields = completeFields();
    fields.partyOne.signatoryTitle = "";

    const titleRow = signatureTable(fields).find((row) => row.startsWith("| Title"));

    expect(titleRow).toBe("| Title |  | General Counsel |");
  });
});

describe("transformStandardTerms", () => {
  it("demotes the standard terms heading so the document has one H1", () => {
    expect(transformStandardTerms("# Standard Terms\n\nBody.")).toContain(
      "## Standard Terms",
    );
  });

  it("demotes the heading only where it stands alone on a line", () => {
    const output = transformStandardTerms("# Standard Terms Appendix\n");

    expect(output).toBe("# Standard Terms Appendix\n");
  });

  it("turns each known cross-reference into a link to its cover-page heading", () => {
    const output = transformStandardTerms(FAKE_STANDARD_TERMS);

    expect(output).toContain("[Purpose](#purpose)");
    expect(output).toContain("[Effective Date](#effective-date)");
    expect(output).toContain("[MNDA Term](#mnda-term)");
    expect(output).toContain("[Term of Confidentiality](#term-of-confidentiality)");
    expect(output).toContain("[Governing Law](#governing-law--jurisdiction)");
    expect(output).toContain("[Jurisdiction](#governing-law--jurisdiction)");
  });

  it("replaces every occurrence, not just the first", () => {
    const input = '<span class="coverpage_link">Purpose</span> and <span class="coverpage_link">Purpose</span>';

    expect(transformStandardTerms(input)).toBe(
      "[Purpose](#purpose) and [Purpose](#purpose)",
    );
  });

  it("leaves no coverpage_link markup behind", () => {
    expect(transformStandardTerms(FAKE_STANDARD_TERMS)).not.toContain("coverpage_link");
  });

  it("keeps an unrecognised reference as its plain label", () => {
    const output = transformStandardTerms(
      '<span class="coverpage_link">Not A Term</span>',
    );

    expect(output).toBe("Not A Term");
  });

  it("tolerates whitespace padding inside the span", () => {
    const output = transformStandardTerms(
      '<span class="coverpage_link">  Purpose  </span>',
    );

    expect(output).toBe("[Purpose](#purpose)");
  });

  it("leaves the surrounding legal text untouched", () => {
    const input = "Each party may use it solely for the stated reason. All rights reserved.";

    expect(transformStandardTerms(input)).toBe(input);
  });

  it("preserves the substance of the real standard terms", () => {
    const output = transformStandardTerms(FAKE_STANDARD_TERMS);

    expect(output).toContain("Each party may use the information solely for the");
    expect(output).toContain("Obligations last for the");
  });
});

describe("describeTerm", () => {
  it("returns the trimmed purpose", () => {
    expect(describeTerm("purpose", completeFields({ purpose: "  Evaluating.  " }))).toBe(
      "Evaluating.",
    );
  });

  it("returns the formatted effective date", () => {
    expect(describeTerm("effectiveDate", completeFields())).toBe("March 14, 2026");
  });

  it("returns the trimmed governing law and jurisdiction", () => {
    const fields = completeFields({ governingLaw: " Texas ", jurisdiction: " Travis " });

    expect(describeTerm("governingLaw", fields)).toBe("Texas");
    expect(describeTerm("jurisdiction", fields)).toBe("Travis");
  });

  describe("MNDA term", () => {
    it("describes a fixed term in years", () => {
      expect(describeTerm("mndaTerm", completeFields({ mndaTermYears: 2 }))).toBe(
        "Expires 2 years from the Effective Date.",
      );
    });

    it("uses the singular for a one-year term", () => {
      expect(describeTerm("mndaTerm", completeFields({ mndaTermYears: 1 }))).toBe(
        "Expires 1 year from the Effective Date.",
      );
    });

    it("describes an until-terminated term without any year count", () => {
      const fields = completeFields({ mndaTermMode: "until-terminated" });

      expect(describeTerm("mndaTerm", fields)).toBe(
        "Continues until terminated in accordance with the terms of this MNDA.",
      );
      expect(describeTerm("mndaTerm", fields)).not.toMatch(/\d/);
    });
  });

  describe("term of confidentiality", () => {
    it("describes a fixed term and carves out trade secrets", () => {
      const fields = completeFields({ confidentialityYears: 3 });

      expect(describeTerm("confidentiality", fields)).toBe(
        "3 years from the Effective Date, but in the case of trade secrets until the Confidential Information is no longer considered a trade secret under applicable laws.",
      );
    });

    it("uses the singular for a one-year term", () => {
      expect(
        describeTerm("confidentiality", completeFields({ confidentialityYears: 1 })),
      ).toMatch(/^1 year from/);
    });

    it("describes a perpetual term", () => {
      const fields = completeFields({ confidentialityMode: "perpetual" });

      expect(describeTerm("confidentiality", fields)).toBe("In perpetuity.");
    });
  });

  it("describes every defined term without throwing", () => {
    for (const key of Object.keys(DEFINED_TERMS) as (keyof typeof DEFINED_TERMS)[]) {
      expect(typeof describeTerm(key, completeFields())).toBe("string");
    }
  });

  it("agrees with the cover page for the MNDA term", () => {
    const fields = completeFields({ mndaTermMode: "until-terminated" });
    const cover = coverPageOf(renderMnda(fields, FAKE_STANDARD_TERMS));

    expect(cover).toContain(describeTerm("mndaTerm", fields));
  });

  it("agrees with the cover page for the term of confidentiality", () => {
    const fields = completeFields({ confidentialityMode: "perpetual" });
    const cover = coverPageOf(renderMnda(fields, FAKE_STANDARD_TERMS));

    expect(cover).toContain(describeTerm("confidentiality", fields));
  });
});

/**
 * Confirmed defects, pinned so a fix is noticed rather than silent. Each of
 * these asserts what the code does today, not what it should do — when one
 * starts failing, the behaviour was fixed and the test should be inverted.
 * See docs/manual-test-plan.md and the review notes.
 */
describe("known defects", () => {
  it("writes NaN into the agreement when a year box is emptied", () => {
    const fields = completeFields({ mndaTermYears: Number.NaN });

    expect(describeTerm("mndaTerm", fields)).toBe(
      "Expires NaN years from the Effective Date.",
    );
    expect(coverPageOf(renderMnda(fields, FAKE_STANDARD_TERMS))).toContain("NaN");
  });

  it("writes NaN into the confidentiality term too", () => {
    const fields = completeFields({ confidentialityYears: Number.NaN });

    expect(describeTerm("confidentiality", fields)).toMatch(/^NaN years from/);
  });

  it("lets a modifications entry inject a second H1 into the document", () => {
    const markdown = renderMnda(
      completeFields({ modifications: "# Injected Heading" }),
      FAKE_STANDARD_TERMS,
    );

    expect(markdown.match(/^# .*$/gm)).toEqual([
      "# Mutual Non-Disclosure Agreement",
      "# Injected Heading",
    ]);
  });

  it("lets a purpose entry restructure the cover page", () => {
    const markdown = renderMnda(
      completeFields({ purpose: "Evaluating a deal.\n\n## Not A Real Section" }),
      FAKE_STANDARD_TERMS,
    );

    expect(markdown).toContain("## Not A Real Section");
  });
});

describe("formatEffectiveDate", () => {
  const originalTimeZone = process.env.TZ;

  afterEach(() => {
    process.env.TZ = originalTimeZone;
  });

  it("formats an ISO date as long-form US English", () => {
    expect(formatEffectiveDate("2026-03-14")).toBe("March 14, 2026");
  });

  it.each([
    ["2026-01-01", "January 1, 2026"],
    ["2026-12-31", "December 31, 2026"],
    ["2024-02-29", "February 29, 2024"],
  ])("formats %s as %s", (iso, expected) => {
    expect(formatEffectiveDate(iso)).toBe(expected);
  });

  it.each([
    "Pacific/Kiritimati", // UTC+14, the furthest zone ahead of UTC
    "Etc/GMT+12", // UTC-12, the furthest zone behind
    "America/Los_Angeles",
    "Asia/Tokyo",
    "UTC",
  ])("reads the same calendar day in %s", (timeZone) => {
    process.env.TZ = timeZone;

    expect(formatEffectiveDate("2026-03-14")).toBe("March 14, 2026");
  });

  it("returns the input unchanged when it is not an ISO date", () => {
    expect(formatEffectiveDate("")).toBe("");
    expect(formatEffectiveDate("not a date")).toBe("not a date");
    expect(formatEffectiveDate("2026-3-14")).toBe("2026-3-14");
  });
});

describe("documentFilename", () => {
  it("names the file after both companies and the effective date", () => {
    expect(documentFilename(completeFields(), "md")).toBe(
      "mutual-nda-acme-inc-and-globex-corporation-2026-03-14.md",
    );
  });

  it("uses the extension it is given", () => {
    expect(documentFilename(completeFields(), "pdf")).toMatch(/\.pdf$/);
  });

  it.each(["partyOne", "partyTwo"] as const)(
    "falls back to a generic name when %s has no company",
    (slot) => {
      const fields = completeFields({ [slot]: party() });

      expect(documentFilename(fields, "md")).toBe("mutual-nda-2026-03-14.md");
    },
  );

  it("falls back when a company name has no slug-able characters", () => {
    const fields = completeFields();
    fields.partyOne.company = "!!!";

    expect(documentFilename(fields, "md")).toBe("mutual-nda-2026-03-14.md");
  });

  it("strips accents rather than dropping the letters", () => {
    const fields = completeFields();
    fields.partyOne.company = "Café Zürich GmbH";
    fields.partyTwo.company = "Globex";

    expect(documentFilename(fields, "md")).toBe(
      "mutual-nda-cafe-zurich-gmbh-and-globex-2026-03-14.md",
    );
  });

  it("collapses punctuation and runs of spaces into single hyphens", () => {
    const fields = completeFields();
    fields.partyOne.company = "  A. B.,   Inc.  ";
    fields.partyTwo.company = "C&D";

    expect(documentFilename(fields, "md")).toBe(
      "mutual-nda-a-b-inc-and-c-d-2026-03-14.md",
    );
  });

  it("caps a very long company name so the filename stays usable", () => {
    const fields = completeFields();
    fields.partyOne.company = "Extraordinarily Long Company Name That Keeps Going And Going";
    fields.partyTwo.company = "Globex";

    const [slug] = documentFilename(fields, "md").split("-and-");

    expect(slug.replace("mutual-nda-", "")).toHaveLength(40);
  });

  it("produces a filename free of characters the filesystem rejects", () => {
    const fields = completeFields();
    fields.partyOne.company = String.raw`Bad/\:*?"<>| Name`;

    expect(documentFilename(fields, "md")).toMatch(/^[a-z0-9.\-]+$/);
  });
});
