/**
 * Field schema for the Common Paper Mutual NDA cover page.
 *
 * The document fields mirror exactly the cross-references the Standard Terms
 * make back to the Cover Page — the `coverpage_link` spans in
 * `templates/mutual-nda.md` — plus the party details needed to sign.
 */

export type MndaTermMode = "fixed" | "until-terminated";
export type ConfidentialityMode = "fixed" | "perpetual";

export interface Party {
  company: string;
  signatoryName: string;
  signatoryTitle: string;
  noticeAddress: string;
}

export interface NdaFields {
  purpose: string;
  effectiveDate: string; // ISO yyyy-mm-dd
  mndaTermMode: MndaTermMode;
  mndaTermYears: number;
  confidentialityMode: ConfidentialityMode;
  confidentialityYears: number;
  governingLaw: string;
  jurisdiction: string;
  modifications: string;
  partyOne: Party;
  partyTwo: Party;
}

/** The purpose Common Paper suggests on the blank cover page. */
export const DEFAULT_PURPOSE =
  "Evaluating whether to enter into a business relationship with the other party.";

export const MIN_TERM_YEARS = 1;
export const MAX_TERM_YEARS = 99;

export function createDefaultFields(effectiveDate: string): NdaFields {
  return {
    purpose: DEFAULT_PURPOSE,
    effectiveDate,
    mndaTermMode: "fixed",
    mndaTermYears: 1,
    confidentialityMode: "fixed",
    confidentialityYears: 1,
    governingLaw: "Delaware",
    jurisdiction: "New Castle, DE",
    modifications: "",
    partyOne: emptyParty(),
    partyTwo: emptyParty(),
  };
}

function emptyParty(): Party {
  return { company: "", signatoryName: "", signatoryTitle: "", noticeAddress: "" };
}

/* -------------------------------------------------------------------------- */
/* Defined terms                                                              */
/* -------------------------------------------------------------------------- */

/**
 * A defined term is a value set on the cover page that the Standard Terms
 * refer to by name rather than by value — "solely for the Purpose", not
 * "solely for the Evaluating whether to…". Keeping the reference as a name is
 * what makes the boilerplate read correctly, so the rendered document links
 * each reference back to the cover-page heading that defines it.
 */
export type DefinedTermKey =
  | "purpose"
  | "effectiveDate"
  | "mndaTerm"
  | "confidentiality"
  | "governingLaw"
  | "jurisdiction";

export interface DefinedTerm {
  key: DefinedTermKey;
  /** Exactly as the label appears inside the Standard Terms. */
  label: string;
  /** GFM heading anchor of the cover-page section that defines it. */
  anchor: string;
}

export const DEFINED_TERMS: Record<DefinedTermKey, DefinedTerm> = {
  purpose: {
    key: "purpose",
    label: "Purpose",
    anchor: "#purpose",
  },
  effectiveDate: {
    key: "effectiveDate",
    label: "Effective Date",
    anchor: "#effective-date",
  },
  mndaTerm: {
    key: "mndaTerm",
    label: "MNDA Term",
    anchor: "#mnda-term",
  },
  confidentiality: {
    key: "confidentiality",
    label: "Term of Confidentiality",
    anchor: "#term-of-confidentiality",
  },
  governingLaw: {
    key: "governingLaw",
    label: "Governing Law",
    anchor: "#governing-law--jurisdiction",
  },
  jurisdiction: {
    key: "jurisdiction",
    label: "Jurisdiction",
    anchor: "#governing-law--jurisdiction",
  },
};

/**
 * Governing Law and Jurisdiction share a cover-page heading, so the anchor
 * alone cannot tell them apart — the label is the reliable key.
 */
export const DEFINED_TERM_BY_LABEL: Record<string, DefinedTerm> = Object.fromEntries(
  Object.values(DEFINED_TERMS).map((term) => [term.label, term]),
);

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

export type FieldErrors = Record<string, string>;

/**
 * Names each validation error in the words the assistant uses when it asks
 * for the answer. Insertion order is cover page top to bottom, then the two
 * parties — the order a reader would work through the document, and so the
 * order the assistant asks in when several answers are outstanding.
 */
export const ERROR_LABELS: Record<string, string> = {
  purpose: "the purpose",
  effectiveDate: "the effective date",
  mndaTermYears: "how long the agreement runs",
  confidentialityYears: "how long confidentiality lasts",
  governingLaw: "the governing law",
  jurisdiction: "the jurisdiction",
  "partyOne.company": "the first company's name",
  "partyOne.signatoryName": "who signs for the first company",
  "partyOne.noticeAddress": "the first company's address for notices",
  "partyTwo.company": "the second company's name",
  "partyTwo.signatoryName": "who signs for the second company",
  "partyTwo.noticeAddress": "the second company's address for notices",
};

/**
 * The outstanding answers, in reading order, as a list that can be dropped
 * into a sentence. Empty when the document is ready to sign.
 */
export function describeMissingFields(errors: FieldErrors): string[] {
  return Object.keys(ERROR_LABELS)
    .filter((name) => errors[name])
    .map((name) => ERROR_LABELS[name]);
}

export function validateFields(fields: NdaFields): FieldErrors {
  const errors: FieldErrors = {};

  if (!fields.purpose.trim()) {
    errors.purpose = "Describe how the confidential information may be used.";
  }

  if (!isValidIsoDate(fields.effectiveDate)) {
    errors.effectiveDate = "Choose the date the agreement takes effect.";
  }

  if (fields.mndaTermMode === "fixed" && !isValidYearCount(fields.mndaTermYears)) {
    errors.mndaTermYears = `Enter a whole number of years between ${MIN_TERM_YEARS} and ${MAX_TERM_YEARS}.`;
  }

  if (
    fields.confidentialityMode === "fixed" &&
    !isValidYearCount(fields.confidentialityYears)
  ) {
    errors.confidentialityYears = `Enter a whole number of years between ${MIN_TERM_YEARS} and ${MAX_TERM_YEARS}.`;
  }

  if (!fields.governingLaw.trim()) {
    errors.governingLaw = "Choose the state whose law governs the agreement.";
  }

  if (!fields.jurisdiction.trim()) {
    errors.jurisdiction = "Name the courts that hear disputes, such as “New Castle, DE”.";
  }

  for (const slot of ["partyOne", "partyTwo"] as const) {
    const party = fields[slot];
    if (!party.company.trim()) {
      errors[`${slot}.company`] = "Enter the company entering into the agreement.";
    }
    if (!party.signatoryName.trim()) {
      errors[`${slot}.signatoryName`] = "Enter the name of the person signing.";
    }
    if (!party.noticeAddress.trim()) {
      errors[`${slot}.noticeAddress`] = "Enter an email or postal address for notices.";
    }
  }

  return errors;
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

function isValidYearCount(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_TERM_YEARS && value <= MAX_TERM_YEARS;
}

/** Section 9 of the Standard Terms reads "the laws of the State of …". */
export const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
  "Connecticut", "Delaware", "District of Columbia", "Florida", "Georgia",
  "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky",
  "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota",
  "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire",
  "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota",
  "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island",
  "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont",
  "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming",
] as const;
