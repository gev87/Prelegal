/**
 * Field schema for the Common Paper Mutual NDA cover page.
 *
 * The document fields mirror exactly the cross-references the Standard Terms
 * make back to the Cover Page — the `coverpage_link` spans in
 * `templates/mutual-nda.md` — plus the party details needed to sign.
 */

export type MndaTermMode = "fixed" | "until-terminated";
export type ConfidentialityMode = "fixed" | "perpetual";
export type PartySlot = "partyOne" | "partyTwo";

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
  /** DOM id of the form group that edits it. */
  fieldId: string;
}

export const DEFINED_TERMS: Record<DefinedTermKey, DefinedTerm> = {
  purpose: {
    key: "purpose",
    label: "Purpose",
    anchor: "#purpose",
    fieldId: "field-purpose",
  },
  effectiveDate: {
    key: "effectiveDate",
    label: "Effective Date",
    anchor: "#effective-date",
    fieldId: "field-effective-date",
  },
  mndaTerm: {
    key: "mndaTerm",
    label: "MNDA Term",
    anchor: "#mnda-term",
    fieldId: "field-mnda-term",
  },
  confidentiality: {
    key: "confidentiality",
    label: "Term of Confidentiality",
    anchor: "#term-of-confidentiality",
    fieldId: "field-confidentiality",
  },
  governingLaw: {
    key: "governingLaw",
    label: "Governing Law",
    anchor: "#governing-law--jurisdiction",
    fieldId: "field-governing-law",
  },
  jurisdiction: {
    key: "jurisdiction",
    label: "Jurisdiction",
    anchor: "#governing-law--jurisdiction",
    fieldId: "field-jurisdiction",
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
 * Maps each validation error onto the form group that fixes it. Insertion
 * order is the order the form jumps through on a failed download.
 */
export const ERROR_FIELD_IDS: Record<string, string> = {
  purpose: "field-purpose",
  effectiveDate: "field-effective-date",
  mndaTermYears: "field-mnda-term",
  confidentialityYears: "field-confidentiality",
  governingLaw: "field-governing-law",
  jurisdiction: "field-jurisdiction",
  "partyOne.company": "field-party-one-company",
  "partyOne.signatoryName": "field-party-one-name",
  "partyOne.noticeAddress": "field-party-one-notice",
  "partyTwo.company": "field-party-two-company",
  "partyTwo.signatoryName": "field-party-two-name",
  "partyTwo.noticeAddress": "field-party-two-notice",
};

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
