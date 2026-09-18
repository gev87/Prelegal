import { describe, expect, it } from "vitest";

import { asList, describePaths, labelForPath } from "@/lib/documents/labels";
import {
  documentFilename,
  DRAFT_DISCLAIMER,
  DRAFT_DISCLAIMER_LINE,
  renderDocument,
  transformStandardTerms,
} from "@/lib/documents/render";
import { describeMissing, validateDocument } from "@/lib/documents/validate";
import { findDocument, isMutualNda } from "@/lib/documents/types";
import {
  completeFields,
  completePilotFields,
  DOCUMENTS,
  NDA_DOCUMENT,
  PILOT_DOCUMENT,
  party,
  asDocumentFields,
} from "../fixtures/fields";

describe("renderDocument", () => {
  it("hands the Mutual NDA to its own renderer", () => {
    // The one type PL-6 left alone: its cover page has modes and terms that
    // need sentences no field descriptor carries.
    const markdown = renderDocument(
      NDA_DOCUMENT,
      asDocumentFields(completeFields()),
    );

    expect(markdown).toContain("# Mutual Non-Disclosure Agreement");
    expect(markdown).toContain("Expires 2 years from the Effective Date.");
  });

  it("writes a cover page section for every field the catalog describes", () => {
    const markdown = renderDocument(PILOT_DOCUMENT, completePilotFields());

    expect(markdown).toContain("### Pilot Period");
    expect(markdown).toContain("60 days");
    expect(markdown).toContain("### General Cap Amount");
  });

  it("spells a date out rather than printing the wire format", () => {
    const markdown = renderDocument(PILOT_DOCUMENT, completePilotFields());

    expect(markdown).toContain("March 14, 2026");
    expect(markdown).not.toContain("2026-03-14");
  });

  it("says so when an optional field was left empty", () => {
    // A heading followed by nothing reads like something went wrong. Many of
    // these fields are legitimately blank, and the document should say that
    // rather than trail off.
    const markdown = renderDocument(
      PILOT_DOCUMENT,
      completePilotFields({ generalCapAmount: "" }),
    );

    expect(markdown).toContain("Not specified.");
  });

  it("heads the signature table with what this document calls the two sides", () => {
    const markdown = renderDocument(PILOT_DOCUMENT, completePilotFields());

    expect(markdown).toContain("| | Customer | Provider |");
    expect(markdown).toContain("Acme, Inc.");
    expect(markdown).toContain("Globex Corporation");
  });

  it("keeps a pipe in a company name from splitting the row", () => {
    const markdown = renderDocument(
      PILOT_DOCUMENT,
      completePilotFields({ partyA: party({ company: "Acme | Holdings" }) }),
    );

    expect(markdown).toContain(String.raw`Acme \| Holdings`);
  });

  it("puts a multi-line notice address on one line", () => {
    const markdown = renderDocument(
      PILOT_DOCUMENT,
      completePilotFields({
        partyA: party({ noticeAddress: "1 Main St\nSpringfield\nIL" }),
      }),
    );

    expect(markdown).toContain("1 Main St, Springfield, IL");
  });

  it("leaves the Standard Terms' own wording alone", () => {
    const markdown = renderDocument(PILOT_DOCUMENT, completePilotFields());

    expect(markdown).toContain("may use the Product");
  });

  it("demotes the template's title so the agreement has one H1", () => {
    const markdown = renderDocument(PILOT_DOCUMENT, completePilotFields());

    expect(markdown).toContain("## Pilot Agreement");
    expect(markdown.match(/^# /gm)).toHaveLength(1);
  });
});

describe("transformStandardTerms", () => {
  const transformed = () => transformStandardTerms(PILOT_DOCUMENT);

  it("links a cover-page reference to the heading that defines it", () => {
    expect(transformed()).toContain("[Pilot Period](#pilot-period)");
  });

  it("links a reference the template spells with a possessive", () => {
    // Templates write both "Customer" and "Customer's"; they are one term.
    expect(transformed()).not.toContain('<span class="orderform_link">');
  });

  it("leaves a party named rather than linked", () => {
    // "Customer may use the Product" should read as prose; the company that
    // fills it sits in the signature table, not behind a cross-reference.
    expect(transformed()).toContain("Customer may use the Product");
    expect(transformed()).not.toContain("[Customer](");
  });

  it("leaves an unknown reference as plain text", () => {
    expect(transformed()).toContain("Not A Term");
    expect(transformed()).not.toContain("[Not A Term](");
  });
});

describe("documentFilename", () => {
  it("names the file after the document, both parties and the date", () => {
    expect(documentFilename(PILOT_DOCUMENT, completePilotFields(), "md")).toBe(
      "pilot-agreement-acme-inc-and-globex-corporation-2026-03-14.md",
    );
  });

  it("names a Mutual NDA download after its parties and date too", () => {
    // The NDA is catalogued with no descriptors and no parties, so the
    // generic path finds neither companies nor a date and would name every
    // download plain "mutual-nda.md". Asserted as a literal string rather
    // than against the function under test, which is how this went unnoticed.
    expect(
      documentFilename(NDA_DOCUMENT, asDocumentFields(completeFields()), "md"),
    ).toBe("mutual-nda-acme-inc-and-globex-corporation-2026-03-14.md");
  });

  it("falls back to the document alone before the parties are known", () => {
    const fields = completePilotFields({ partyA: party(), partyB: party() });

    expect(documentFilename(PILOT_DOCUMENT, fields, "md")).toBe(
      "pilot-agreement-2026-03-14.md",
    );
  });
});

describe("validateDocument", () => {
  it("passes a document whose parties are filled in", () => {
    expect(validateDocument(PILOT_DOCUMENT, completePilotFields())).toEqual({});
  });

  it("accepts an optional field left empty", () => {
    // The templates describe these as optional, and refusing to produce a
    // document until each is filled would invent a requirement the source
    // agreements do not have.
    const fields = completePilotFields({ generalCapAmount: "", pilotPeriod: "" });

    expect(validateDocument(PILOT_DOCUMENT, fields)).toEqual({});
  });

  it("refuses a date that is not a real day", () => {
    const fields = completePilotFields({ effectiveDate: "2026-02-30" });

    expect(validateDocument(PILOT_DOCUMENT, fields)).toHaveProperty("effectiveDate");
  });

  it("needs both sides identified, signed for, and reachable", () => {
    const fields = completePilotFields({ partyB: party({ company: "Globex" }) });

    const errors = validateDocument(PILOT_DOCUMENT, fields);

    expect(errors).toHaveProperty("partyB.signatoryName");
    expect(errors).toHaveProperty("partyB.noticeAddress");
    expect(errors).not.toHaveProperty("partyB.company");
  });

  it("hands the Mutual NDA to its own, stricter rules", () => {
    // The NDA has a purpose and two terms a blank document would be
    // meaningless without, which the generic rules know nothing about.
    const fields = asDocumentFields(completeFields({ purpose: "" }));

    expect(validateDocument(NDA_DOCUMENT, fields)).toHaveProperty("purpose");
  });
});

describe("describeMissing", () => {
  it("asks in the words the document itself uses for the two sides", () => {
    const fields = completePilotFields({ partyB: party() });
    const errors = validateDocument(PILOT_DOCUMENT, fields);

    expect(describeMissing(PILOT_DOCUMENT, errors)).toEqual([
      "the Provider's name",
      "the Provider's signatory",
      "the Provider's address for notices",
    ]);
  });

  it("says nothing when the document is ready to sign", () => {
    const errors = validateDocument(PILOT_DOCUMENT, completePilotFields());

    expect(describeMissing(PILOT_DOCUMENT, errors)).toEqual([]);
  });
});

describe("labelForPath", () => {
  it("names a generic field by its label", () => {
    expect(labelForPath(PILOT_DOCUMENT, "pilotPeriod")).toBe("the pilot period");
  });

  it("names a party leaf by the role this document gives it", () => {
    expect(labelForPath(PILOT_DOCUMENT, "partyB.company")).toBe(
      "the Provider's name",
    );
  });

  it("names a Mutual NDA field the way its cover page reads", () => {
    expect(labelForPath(NDA_DOCUMENT, "partyOne.company")).toBe(
      "the first company's name",
    );
  });

  it("falls back to the path rather than printing nothing", () => {
    expect(labelForPath(PILOT_DOCUMENT, "whatIsThis")).toBe("whatIsThis");
  });
});

describe("describePaths", () => {
  it("says a shared label once", () => {
    // The NDA's term mode and its term in years are one question to anybody
    // but the schema, and "how long it runs and how long it runs" is not a
    // sentence.
    expect(describePaths(NDA_DOCUMENT, ["mndaTermMode", "mndaTermYears"])).toEqual([
      "how long the agreement runs",
    ]);
  });
});

describe("asList", () => {
  it.each([
    [[], ""],
    [["one"], "one"],
    [["one", "two"], "one and two"],
    [["one", "two", "three"], "one, two and three"],
  ])("joins %j as %s", (items, expected) => {
    expect(asList(items)).toBe(expected);
  });
});

describe("the catalog as the app sees it", () => {
  it("finds a document by the slug the wire format uses", () => {
    expect(findDocument(DOCUMENTS, "pilot-agreement")?.name).toBe("Pilot Agreement");
  });

  it("returns nothing for a slug it does not know", () => {
    expect(findDocument(DOCUMENTS, "last-will-and-testament")).toBeNull();
  });

  it("recognises the one hand-written type", () => {
    expect(isMutualNda(NDA_DOCUMENT.slug)).toBe(true);
    expect(isMutualNda(PILOT_DOCUMENT.slug)).toBe(false);
  });
});

/**
 * The disclaimer has to reach three surfaces that are easy to let drift apart:
 * the preview, the Markdown file and the PDF. All three are the string
 * `renderDocument` returns, so these two cases are what keep the promise —
 * and they cover both code paths, because the NDA is rendered by an entirely
 * different function from the other ten.
 */
describe("the draft disclaimer", () => {
  it("is on the Mutual NDA", () => {
    const markdown = renderDocument(NDA_DOCUMENT, asDocumentFields(completeFields()));

    expect(markdown).toContain(DRAFT_DISCLAIMER);
  });

  it("is on a catalogued document type too", () => {
    const markdown = renderDocument(PILOT_DOCUMENT, completePilotFields());

    expect(markdown).toContain(DRAFT_DISCLAIMER);
  });

  it("is quoted, so it reads as a note about the document", () => {
    const markdown = renderDocument(PILOT_DOCUMENT, completePilotFields());

    expect(markdown).toContain(`> ${DRAFT_DISCLAIMER}`);
  });

  it("comes after the agreement rather than before it", () => {
    const markdown = renderDocument(PILOT_DOCUMENT, completePilotFields());

    expect(markdown.indexOf(DRAFT_DISCLAIMER)).toBeGreaterThan(markdown.indexOf("#"));
  });

  /** The chrome cannot show Markdown asterisks, and the two must not be
   *  allowed to drift into saying different things. */
  it("says the same thing in the app as in the document", () => {
    expect(DRAFT_DISCLAIMER.replace(/\*\*/g, "")).toBe(DRAFT_DISCLAIMER_LINE);
  });
});
