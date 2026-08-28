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
