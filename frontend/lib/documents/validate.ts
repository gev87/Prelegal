/**
 * What has to be answered before a document can be downloaded.
 *
 * The bar is deliberately lower than "every field is filled in". Most of the
 * ten generic cover pages carry fields their own Standard Terms describe as
 * optional — additional warranties, brand guidelines, restrictions on
 * training — and the catalog's guides say so. Refusing to produce a document
 * until somebody types something into each of them would be inventing a
 * requirement the source agreements do not have.
 *
 * What is genuinely required is whatever makes the document signable: both
 * sides identified, someone named to sign for each, and an address to send
 * notices to. Dates are checked when present because a malformed one renders
 * as raw digits in the middle of a sentence.
 *
 * The Mutual NDA keeps its own, stricter rules — it has a purpose and two
 * terms that a blank document would be meaningless without — so it is handed
 * back to `lib/nda/schema`.
 */

import {
  describeMissingFields as describeMissingNdaFields,
  validateFields as validateNdaFields,
  type FieldErrors,
  type NdaFields,
} from "@/lib/nda/schema";

import {
  isMutualNda,
  isParty,
  type DocumentFields,
  type DocumentType,
  type Party,
} from "./types";

export type { FieldErrors };

/** The leaves of a party that a signable document cannot do without. */
const REQUIRED_OF_A_PARTY: { leaf: keyof Party; asked: string; error: string }[] = [
  {
    leaf: "company",
    asked: "name",
    error: "Enter the company entering into the agreement.",
  },
  {
    leaf: "signatoryName",
    asked: "signatory",
    error: "Enter the name of the person signing.",
  },
  {
    leaf: "noticeAddress",
    asked: "address for notices",
    error: "Enter an email or postal address for notices.",
  },
];

export function validateDocument(
  doc: DocumentType,
  fields: DocumentFields,
): FieldErrors {
  if (isMutualNda(doc.slug)) {
    return validateNdaFields(fields as unknown as NdaFields);
  }

  const errors: FieldErrors = {};

  for (const spec of doc.fields) {
    if (spec.kind !== "date") continue;
    const value = fields[spec.path];
    if (typeof value !== "string" || !isValidIsoDate(value)) {
      errors[spec.path] = `Choose a valid date for ${spec.label.toLowerCase()}.`;
    }
  }

  for (const party of doc.parties) {
    const value = fields[party.path];
    const filled: Party | null = isParty(value) ? value : null;

    for (const required of REQUIRED_OF_A_PARTY) {
      if (!filled?.[required.leaf].trim()) {
        errors[`${party.path}.${required.leaf}`] = required.error;
      }
    }
  }

  return errors;
}

/**
 * The outstanding answers, in reading order, as a list that can be dropped
 * into a sentence. Empty when the document is ready to sign.
 *
 * The words are the ones the assistant would use to ask — "the Customer's
 * name", not "partyA.company" — built from the document's own labels and
 * party roles rather than from a table that would need an entry per field
 * across eleven documents.
 */
export function describeMissing(doc: DocumentType, errors: FieldErrors): string[] {
  if (isMutualNda(doc.slug)) {
    return describeMissingNdaFields(errors);
  }

  const missing: string[] = [];

  for (const spec of doc.fields) {
    if (errors[spec.path]) missing.push(`a valid ${spec.label.toLowerCase()}`);
  }

  for (const party of doc.parties) {
    for (const required of REQUIRED_OF_A_PARTY) {
      if (errors[`${party.path}.${required.leaf}`]) {
        missing.push(`the ${party.role}'s ${required.asked}`);
      }
    }
  }

  return missing;
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}
