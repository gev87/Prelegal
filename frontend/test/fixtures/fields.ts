import type { DocumentFields, DocumentType } from "@/lib/documents/types";
import type { NdaFields, Party } from "@/lib/nda/schema";

/** A cover page with every required answer filled in — validation passes. */
export function completeFields(overrides: Partial<NdaFields> = {}): NdaFields {
  return {
    purpose: "Evaluating a potential reseller relationship.",
    effectiveDate: "2026-03-14",
    mndaTermMode: "fixed",
    mndaTermYears: 2,
    confidentialityMode: "fixed",
    confidentialityYears: 3,
    governingLaw: "Delaware",
    jurisdiction: "New Castle, DE",
    modifications: "",
    partyOne: party({
      company: "Acme, Inc.",
      signatoryName: "Dana Reyes",
      signatoryTitle: "Chief Executive Officer",
      noticeAddress: "legal@acme.com",
    }),
    partyTwo: party({
      company: "Globex Corporation",
      signatoryName: "Sam Okafor",
      signatoryTitle: "General Counsel",
      noticeAddress: "notices@globex.example",
    }),
    ...overrides,
  };
}

export function party(overrides: Partial<Party> = {}): Party {
  return {
    company: "",
    signatoryName: "",
    signatoryTitle: "",
    noticeAddress: "",
    ...overrides,
  };
}

/**
 * A miniature stand-in for `templates/mutual-nda.md`, carrying one of every
 * structural feature the transform touches.
 */
export const FAKE_STANDARD_TERMS = [
  "# Standard Terms",
  "",
  '1. Each party may use the information solely for the <span class="coverpage_link">Purpose</span>.',
  '2. This MNDA starts on the <span class="coverpage_link">Effective Date</span> and runs for the <span class="coverpage_link">MNDA Term</span>.',
  '3. Obligations last for the <span class="coverpage_link">Term of Confidentiality</span>.',
  '4. Governed by the laws of the State of <span class="coverpage_link">Governing Law</span>, in the courts of <span class="coverpage_link">Jurisdiction</span>.',
  '5. An unknown reference stays as plain text: <span class="coverpage_link">Not A Term</span>.',
  "",
].join("\n");

/* -------------------------------------------------------------------------- */
/* Document types (PL-6)                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The Mutual NDA as the catalog describes it: no field descriptors and no
 * parties, which is exactly how `lib/documents/*` recognises the one type
 * that keeps its hand-written schema and renderer.
 */
export const NDA_DOCUMENT: DocumentType = {
  slug: "mutual-nda",
  name: "Mutual NDA",
  description: "Mutual non-disclosure agreement for two companies.",
  standardTerms: FAKE_STANDARD_TERMS,
  fields: [],
  parties: [],
};

/**
 * A miniature stand-in for one of the ten catalog-driven types, small enough
 * to assert against and carrying one of each kind a descriptor can have.
 */
export const PILOT_DOCUMENT: DocumentType = {
  slug: "pilot-agreement",
  name: "Pilot Agreement",
  description: "Short trial of a product.",
  standardTerms: [
    "# Pilot Agreement",
    "",
    '1. During the <span class="orderform_link">Pilot Period</span>, <span class="orderform_link">Customer</span> may use the Product.',
    '2. <span class="orderform_link">Provider</span> is liable up to the <span class="orderform_link">General Cap Amount</span>.',
    '3. Starts on the <span class="orderform_link">Effective Date</span>.',
    '4. An unknown reference stays as plain text: <span class="orderform_link">Not A Term</span>.',
    "",
  ].join("\n"),
  fields: [
    {
      path: "effectiveDate",
      label: "Effective Date",
      kind: "date",
      guide: "The day the pilot starts.",
    },
    {
      path: "pilotPeriod",
      label: "Pilot Period",
      guide: "How long the customer may evaluate the product.",
    },
    {
      path: "generalCapAmount",
      label: "General Cap Amount",
      guide: "The ceiling on each side's liability.",
    },
  ],
  parties: [
    { path: "partyA", role: "Customer" },
    { path: "partyB", role: "Provider" },
  ],
};

export const DOCUMENTS: DocumentType[] = [NDA_DOCUMENT, PILOT_DOCUMENT];

/** A pilot cover page with everything a download needs already answered. */
export function completePilotFields(
  overrides: Partial<DocumentFields> = {},
): DocumentFields {
  return {
    effectiveDate: "2026-03-14",
    pilotPeriod: "60 days",
    generalCapAmount: "$50,000",
    partyA: party({
      company: "Acme, Inc.",
      signatoryName: "Dana Reyes",
      signatoryTitle: "Chief Executive Officer",
      noticeAddress: "legal@acme.com",
    }),
    partyB: party({
      company: "Globex Corporation",
      signatoryName: "Sam Okafor",
      signatoryTitle: "General Counsel",
      noticeAddress: "notices@globex.example",
    }),
    ...overrides,
  };
}

/**
 * The Mutual NDA's cover page, seen as the loose record the wire format
 * carries. `NdaFields` has no index signature — deliberately, it is a fixed
 * shape — so this is the one cast that lets the two meet.
 */
export function asDocumentFields(fields: NdaFields): DocumentFields {
  return fields as unknown as DocumentFields;
}
