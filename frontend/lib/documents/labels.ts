/**
 * Naming a field in the words the assistant would use.
 *
 * The backend talks in paths — `partyA.company`, `targetUptime` — because
 * that is what a model can be held to. Anything a person reads has to say
 * "the Provider's name" instead, and this is the one place that translation
 * happens, built from the document's own labels and party roles rather than
 * from a table with an entry per field across eleven documents.
 */

import { isMutualNda, type DocumentType } from "./types";

/** How the Mutual NDA's paths read aloud. Its cover page is hand-written, so
 *  its labels are too — `lib/nda/schema.ts` has the same list for validation
 *  errors, which is the only other place these are spoken. */
const NDA_LABELS: Record<string, string> = {
  purpose: "the purpose",
  effectiveDate: "the effective date",
  mndaTermMode: "how long the agreement runs",
  mndaTermYears: "how long the agreement runs",
  confidentialityMode: "how long confidentiality lasts",
  confidentialityYears: "how long confidentiality lasts",
  governingLaw: "the governing law",
  jurisdiction: "the jurisdiction",
  modifications: "any changes to the standard terms",
  "partyOne.company": "the first company's name",
  "partyOne.signatoryName": "who signs for the first company",
  "partyOne.signatoryTitle": "their title",
  "partyOne.noticeAddress": "the first company's address for notices",
  "partyTwo.company": "the second company's name",
  "partyTwo.signatoryName": "who signs for the second company",
  "partyTwo.signatoryTitle": "their title",
  "partyTwo.noticeAddress": "the second company's address for notices",
};

const PARTY_LEAF_LABELS: Record<string, string> = {
  company: "name",
  signatoryName: "signatory",
  signatoryTitle: "signatory's title",
  noticeAddress: "address for notices",
};

export function labelForPath(doc: DocumentType, path: string): string {
  if (isMutualNda(doc.slug)) return NDA_LABELS[path] ?? path;

  const [head, leaf] = path.split(".");

  if (leaf) {
    const party = doc.parties.find((candidate) => candidate.path === head);
    const what = PARTY_LEAF_LABELS[leaf] ?? leaf;
    return party ? `the ${party.role}'s ${what}` : what;
  }

  const spec = doc.fields.find((candidate) => candidate.path === head);
  return spec ? `the ${spec.label.toLowerCase()}` : head;
}

/**
 * Several paths, said once each and in the document's own reading order.
 *
 * Deduplicated because two paths can share a label — the NDA's term mode and
 * its term in years are one question to anybody but the schema — and "how
 * long it runs and how long it runs" is not a sentence.
 */
export function describePaths(doc: DocumentType, paths: string[]): string[] {
  const seen = new Set<string>();
  const described: string[] = [];

  for (const path of paths) {
    const label = labelForPath(doc, path);
    if (seen.has(label)) continue;
    seen.add(label);
    described.push(label);
  }

  return described;
}

/** "a, b and c" — the assistant is talking, not printing a list. */
export function asList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
