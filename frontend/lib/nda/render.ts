/**
 * Merges cover-page field values with the Common Paper Standard Terms into one
 * complete Mutual NDA in Markdown.
 *
 * Two different jobs, deliberately handled differently:
 *
 *  - The **Standard Terms** are reproduced verbatim. They are the legally
 *    published Version 1.0 text and altering their wording would change the
 *    agreement. The only change is turning each `coverpage_link` span into a
 *    Markdown link pointing at the cover-page heading that defines the term.
 *
 *  - The **Cover Page** is composed from the user's answers. A filled cover
 *    page is a different artifact from the fillable one: it carries no
 *    bracketed instructions, no `<label>` hints and only the option each party
 *    actually chose.
 */

import {
  DEFINED_TERM_BY_LABEL,
  type DefinedTermKey,
  type NdaFields,
  type Party,
} from "./schema";

const STANDARD_TERMS_URL = "https://commonpaper.com/standards/mutual-nda/1.0";

export function renderMnda(fields: NdaFields, standardTerms: string): string {
  return `${renderCoverPage(fields)}\n${transformStandardTerms(standardTerms)}`;
}

/* -------------------------------------------------------------------------- */
/* Cover page                                                                 */
/* -------------------------------------------------------------------------- */

function renderCoverPage(fields: NdaFields): string {
  const blocks = [
    "# Mutual Non-Disclosure Agreement",
    `This Mutual Non-Disclosure Agreement (the “MNDA”) consists of: (1) this Cover Page (“**Cover Page**”) and (2) the Common Paper Mutual NDA Standard Terms Version 1.0 (“**Standard Terms**”) identical to those posted at [commonpaper.com/standards/mutual-nda/1.0](${STANDARD_TERMS_URL}). Any modifications of the Standard Terms are made on this Cover Page, which controls over conflicts with the Standard Terms.`,
    "## Cover Page",
    "### Purpose",
    fields.purpose.trim(),
    "### Effective Date",
    formatEffectiveDate(fields.effectiveDate),
    "### MNDA Term",
    describeTerm("mndaTerm", fields),
    "### Term of Confidentiality",
    describeTerm("confidentiality", fields),
    "### Governing Law & Jurisdiction",
    `Governing Law: ${fields.governingLaw.trim()}`,
    `Jurisdiction: ${fields.jurisdiction.trim()}`,
    "### MNDA Modifications",
    fields.modifications.trim() || "None.",
    "By signing this Cover Page, each party agrees to enter into this MNDA as of the Effective Date.",
    renderSignatureTable(fields),
  ];

  return `${blocks.join("\n\n")}\n`;
}

function renderSignatureTable(fields: NdaFields): string {
  const rows: [string, string, string][] = [
    ["Signature", "", ""],
    ["Print Name", value(fields.partyOne.signatoryName), value(fields.partyTwo.signatoryName)],
    ["Title", value(fields.partyOne.signatoryTitle), value(fields.partyTwo.signatoryTitle)],
    ["Company", value(fields.partyOne.company), value(fields.partyTwo.company)],
    ["Notice Address", noticeAddress(fields.partyOne), noticeAddress(fields.partyTwo)],
    ["Date", "", ""],
  ];

  return [
    "| | PARTY 1 | PARTY 2 |",
    "| :--- | :--- | :--- |",
    ...rows.map((cells) => `| ${cells.map(escapeTableCell).join(" | ")} |`),
  ].join("\n");
}

function value(raw: string): string {
  return raw.trim();
}

/**
 * A postal address spans several lines in the form, but a Markdown table cell
 * cannot. Joining with commas keeps the table valid and the address readable.
 */
function noticeAddress(party: Party): string {
  return party.noticeAddress
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(", ");
}

/** A stray pipe in a company name would otherwise split the row. */
function escapeTableCell(text: string): string {
  return text.replace(/\|/g, String.raw`\|`);
}

/* -------------------------------------------------------------------------- */
/* Standard terms                                                             */
/* -------------------------------------------------------------------------- */

export function transformStandardTerms(markdown: string): string {
  return markdown
    // Demote the heading so the finished agreement has a single H1.
    .replace(/^#\s+Standard Terms\s*$/m, "## Standard Terms")
    .replace(/<span class="coverpage_link">([^<]*)<\/span>/g, (_match, label: string) => {
      const term = DEFINED_TERM_BY_LABEL[label.trim()];
      return term ? `[${term.label}](${term.anchor})` : label;
    });
}

/* -------------------------------------------------------------------------- */
/* Term descriptions                                                          */
/* -------------------------------------------------------------------------- */

/** The value behind a defined term, as a sentence the document can use. */
export function describeTerm(key: DefinedTermKey, fields: NdaFields): string {
  switch (key) {
    case "purpose":
      return fields.purpose.trim();
    case "effectiveDate":
      return formatEffectiveDate(fields.effectiveDate);
    case "mndaTerm":
      return fields.mndaTermMode === "fixed"
        ? `Expires ${pluralizeYears(fields.mndaTermYears)} from the Effective Date.`
        : "Continues until terminated in accordance with the terms of this MNDA.";
    case "confidentiality":
      return fields.confidentialityMode === "fixed"
        ? `${pluralizeYears(fields.confidentialityYears)} from the Effective Date, but in the case of trade secrets until the Confidential Information is no longer considered a trade secret under applicable laws.`
        : "In perpetuity.";
    case "governingLaw":
      return fields.governingLaw.trim();
    case "jurisdiction":
      return fields.jurisdiction.trim();
  }
}

function pluralizeYears(count: number): string {
  return `${count} ${count === 1 ? "year" : "years"}`;
}

/**
 * Formatted from the date parts rather than `new Date(iso)`, which would read
 * the string as UTC midnight and land on the previous day west of Greenwich.
 * The locale is pinned so the server and client render the same string.
 */
export function formatEffectiveDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;

  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString(
    "en-US",
    { year: "numeric", month: "long", day: "numeric" },
  );
}

/* -------------------------------------------------------------------------- */
/* Downloads                                                                  */
/* -------------------------------------------------------------------------- */

export function documentFilename(fields: NdaFields, extension: string): string {
  const parties = [fields.partyOne.company, fields.partyTwo.company]
    .map(slugify)
    .filter(Boolean);

  const stem = parties.length === 2 ? `mutual-nda-${parties.join("-and-")}` : "mutual-nda";
  return `${stem}-${fields.effectiveDate}.${extension}`;
}

function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
