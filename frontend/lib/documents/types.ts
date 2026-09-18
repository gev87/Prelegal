/**
 * What a document type is, on the browser's side of the wire.
 *
 * A mirror of `backend/app/document_types.py`, and the only one — the field
 * data itself is not mirrored anywhere. Both runtimes read the same
 * `backend/app/document_fields.json`: the backend at process start, the
 * frontend at build time via `lib/documents/catalog.ts`. These are the shapes
 * that file parses into, not a second copy of its contents.
 */

export type FieldKind = "text" | "date" | "int" | "enum";

export interface FieldSpec {
  path: string;
  /** Exactly as the Standard Terms spell it. Doubles as the cover-page heading. */
  label: string;
  aliases?: string[];
  kind?: FieldKind;
  guide: string;
}

export interface PartySpec {
  /** Always `partyA` or `partyB`; what the document calls them is `role`. */
  path: string;
  role: string;
}

/** One side's signature block. The same four answers on every document type. */
export interface Party {
  company: string;
  signatoryName: string;
  signatoryTitle: string;
  noticeAddress: string;
}

/**
 * A cover page's values, keyed by the paths the backend names.
 *
 * Deliberately loose. There are eleven shapes and the one in play is only
 * known at runtime, so a static type here could only be a lie or a union
 * nobody could narrow. What keeps this safe is that every reader goes through
 * the document's own `FieldSpec` list rather than reaching for a key it
 * hopes is there.
 */
export type DocumentFields = Record<string, string | number | Party>;

export interface DocumentType {
  slug: string;
  name: string;
  description: string;
  /** The Standard Terms, read from `templates/` at build time. */
  standardTerms: string;
  /**
   * Empty for the Mutual NDA alone, which keeps the hand-written schema and
   * renderer in `lib/nda/`. Everywhere else, this list *is* the cover page.
   */
  fields: FieldSpec[];
  parties: PartySpec[];
}

/** The slug the wire format uses before anyone has chosen a document. */
export const UNDETERMINED = "undetermined";

export const MUTUAL_NDA = "mutual-nda";

export function isMutualNda(slug: string): boolean {
  return slug === MUTUAL_NDA;
}

export function findDocument(
  documents: DocumentType[],
  slug: string,
): DocumentType | null {
  return documents.find((document) => document.slug === slug) ?? null;
}

export function isParty(value: unknown): value is Party {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return ["company", "signatoryName", "signatoryTitle", "noticeAddress"].every(
    (name) => typeof record[name] === "string",
  );
}
