/**
 * Composing any document type into one Markdown agreement.
 *
 * The same two jobs `lib/nda/render.ts` describes, done generically for the
 * ten types whose cover pages are data rather than code:
 *
 *  - The **Standard Terms** are reproduced verbatim. They are published legal
 *    texts and altering their wording would change the agreement. The only
 *    change is turning each cover-page reference into a link to the heading
 *    that defines it.
 *
 *  - The **Cover Page** is composed from the answers, one `###` section per
 *    field, in the order the catalog lists them.
 *
 * The Mutual NDA does not come through here. `renderDocument` hands it
 * straight to `renderMnda`, which knows how to write the modes and terms its
 * cover page has and no other document does.
 */

import {
  documentFilename as ndaFilename,
  renderMnda,
} from "@/lib/nda/render";
import type { NdaFields } from "@/lib/nda/schema";

import {
  isMutualNda,
  isParty,
  type DocumentFields,
  type DocumentType,
  type FieldSpec,
  type Party,
} from "./types";

/**
 * Every class Common Paper uses to mark a value carried by an accompanying
 * cover page, order form, SOW or business terms sheet. They differ only in
 * which attachment holds the value, and this product puts all of them on one
 * cover page, so they are treated alike.
 */
const COVER_PAGE_SPAN =
  /<span class="(?:coverpage_link|keyterms_link|orderform_link|sow_link|businessterms_link)">([^<]*)<\/span>/g;

export function renderDocument(doc: DocumentType, fields: DocumentFields): string {
  if (isMutualNda(doc.slug)) {
    // The NDA's fields are `NdaFields`, and the only reason they arrive typed
    // as the loose record is that the document type is not known until
    // runtime. The backend has already validated them against `NdaFields`.
    return renderMnda(fields as unknown as NdaFields, doc.standardTerms);
  }

  return `${renderCoverPage(doc, fields)}\n${transformStandardTerms(doc)}`;
}

/* -------------------------------------------------------------------------- */
/* Cover page                                                                 */
/* -------------------------------------------------------------------------- */

function renderCoverPage(doc: DocumentType, fields: DocumentFields): string {
  const blocks = [
    `# ${doc.name}`,
    `This ${doc.name} consists of: (1) this Cover Page (“**Cover Page**”) and ` +
      `(2) the Common Paper ${doc.name} Standard Terms (“**Standard Terms**”). ` +
      "Any modifications of the Standard Terms are made on this Cover Page, " +
      "which controls over conflicts with the Standard Terms.",
    "## Cover Page",
  ];

  for (const spec of doc.fields) {
    blocks.push(`### ${spec.label}`, describeField(spec, fields));
  }

  blocks.push(
    `By signing this Cover Page, each party agrees to enter into this ${doc.name}.`,
    renderSignatureTable(doc, fields),
  );

  return `${blocks.join("\n\n")}\n`;
}

/**
 * One field's answer, as the cover page prints it.
 *
 * "Not specified." rather than a blank, because many of these fields are
 * legitimately empty and a heading followed by nothing reads like something
 * went wrong rather than like a decision.
 */
function describeField(spec: FieldSpec, fields: DocumentFields): string {
  const value = fields[spec.path];

  if (typeof value === "number") return String(value);
  if (typeof value !== "string" || !value.trim()) return "Not specified.";

  return spec.kind === "date" ? formatIsoDate(value) : value.trim();
}

function renderSignatureTable(doc: DocumentType, fields: DocumentFields): string {
  const [a, b] = doc.parties;
  const left = partyAt(fields, a?.path);
  const right = partyAt(fields, b?.path);

  const rows: [string, string, string][] = [
    ["Signature", "", ""],
    ["Print Name", left.signatoryName.trim(), right.signatoryName.trim()],
    ["Title", left.signatoryTitle.trim(), right.signatoryTitle.trim()],
    ["Company", left.company.trim(), right.company.trim()],
    ["Notice Address", noticeAddress(left), noticeAddress(right)],
    ["Date", "", ""],
  ];

  return [
    `| | ${a?.role ?? "Party 1"} | ${b?.role ?? "Party 2"} |`,
    "| :--- | :--- | :--- |",
    ...rows.map((cells) => `| ${cells.map(escapeTableCell).join(" | ")} |`),
  ].join("\n");
}

const BLANK_PARTY: Party = {
  company: "",
  signatoryName: "",
  signatoryTitle: "",
  noticeAddress: "",
};

function partyAt(fields: DocumentFields, path: string | undefined): Party {
  if (!path) return BLANK_PARTY;
  const value = fields[path];
  return isParty(value) ? value : BLANK_PARTY;
}

/**
 * A postal address spans several lines in the answer, but a Markdown table
 * cell cannot. Joining with commas keeps the table valid and the address
 * readable.
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

export function transformStandardTerms(doc: DocumentType): string {
  const anchors = anchorsByLabel(doc);
  const roles = new Set(doc.parties.map((party) => party.role));

  return doc.standardTerms
    // Demote the template's own title so the finished agreement has a single
    // H1 — the cover page's — exactly as the NDA's renderer does.
    .replace(/^#\s+(?!#)(.*)$/m, "## $1")
    .replace(COVER_PAGE_SPAN, (_match, raw: string) => {
      const label = raw.trim();
      const bare = label.replace(/[’']s$/, "");

      // A party is named, not defined: "Customer may access…" should read as
      // prose, and the company that fills it sits in the signature table.
      if (roles.has(bare)) return label;

      const anchor = anchors.get(bare);
      return anchor ? `[${label}](${anchor})` : label;
    });
}

/**
 * Where each cover-page term is defined, by the name the Standard Terms use
 * for it. Aliases are included so "Deliverable" links to the same heading as
 * "Deliverables" rather than rendering as bare text.
 */
function anchorsByLabel(doc: DocumentType): Map<string, string> {
  const anchors = new Map<string, string>();

  for (const spec of doc.fields) {
    const anchor = `#${headingAnchor(spec.label)}`;
    anchors.set(spec.label, anchor);
    for (const alias of spec.aliases ?? []) anchors.set(alias, anchor);
  }

  return anchors;
}

/** GitHub's heading anchor: lowercased, spaces to hyphens, punctuation gone. */
function headingAnchor(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^\w\- ]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

/* -------------------------------------------------------------------------- */
/* Dates and filenames                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Formatted from the date parts rather than `new Date(iso)`, which would read
 * the string as UTC midnight and land on the previous day west of Greenwich.
 * The locale is pinned so the server and client render the same string.
 */
export function formatIsoDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;

  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString(
    "en-US",
    { year: "numeric", month: "long", day: "numeric" },
  );
}

export function documentFilename(
  doc: DocumentType,
  fields: DocumentFields,
  extension: string,
): string {
  // The Mutual NDA is catalogued with no descriptors and no parties — its
  // cover page is hand-written — so the generic path below would find no
  // companies and no date and name every download plain "mutual-nda.md".
  // Its own renderer knows where those values live.
  if (isMutualNda(doc.slug)) {
    return ndaFilename(fields as unknown as NdaFields, extension);
  }

  const companies = doc.parties
    .map((party) => partyAt(fields, party.path).company)
    .map(slugify)
    .filter(Boolean);

  const stem =
    companies.length === 2 ? `${doc.slug}-${companies.join("-and-")}` : doc.slug;
  const dated = firstDate(doc, fields);

  return dated ? `${stem}-${dated}.${extension}` : `${stem}.${extension}`;
}

/** The document's own effective date, if it has one to name itself by. */
function firstDate(doc: DocumentType, fields: DocumentFields): string | null {
  for (const spec of doc.fields) {
    if (spec.kind !== "date") continue;
    const value = fields[spec.path];
    if (typeof value === "string" && value) return value;
  }
  return null;
}

function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
