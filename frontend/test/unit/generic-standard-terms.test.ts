import { readFile } from "node:fs/promises";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { renderDocument, transformStandardTerms } from "@/lib/documents/render";
import type { DocumentFields, DocumentType, FieldSpec, Party } from "@/lib/documents/types";

/**
 * The ten catalogued document types, rendered from the real files.
 *
 * `documents.test.ts` works against a hand-built fixture, which is the right
 * shape to assert against but the wrong shape to trust: the real templates are
 * deeply nested numbered lists with `<span class="header_2">` pseudo-headings
 * inside list items, nothing like the flat four-liner the fixture uses. This
 * file is the counterpart of `standard-terms.test.ts`, which does the same for
 * the Mutual NDA and exists for the same reason — the transform matches
 * cross-references by their exact label, so a Common Paper wording change
 * would silently downgrade a defined term to plain text.
 *
 * The backend's `test_document_types.py` already checks the catalog against
 * the templates' markup in both directions. What this adds is the other half:
 * that what comes out the far end of the renderer is a well-formed document.
 */
const REPO = path.join(process.cwd(), "..");
const CATALOG = path.join(REPO, "backend", "app", "document_fields.json");

interface CatalogEntry {
  name: string;
  description: string;
  template_filename: string;
  party_a: { path: string; role: string };
  party_b: { path: string; role: string };
  fields: FieldSpec[];
}

let documents: DocumentType[];

beforeAll(async () => {
  const catalog = JSON.parse(await readFile(CATALOG, "utf8")) as Record<
    string,
    CatalogEntry
  >;

  documents = await Promise.all(
    Object.entries(catalog).map(async ([slug, entry]) => ({
      slug,
      name: entry.name,
      description: entry.description,
      standardTerms: await readFile(
        path.join(REPO, "templates", entry.template_filename),
        "utf8",
      ),
      fields: entry.fields,
      parties: [entry.party_a, entry.party_b],
    })),
  );
});

function answered(doc: DocumentType): DocumentFields {
  const party: Party = {
    company: "Acme, Inc.",
    signatoryName: "Dana Reyes",
    signatoryTitle: "Chief Executive Officer",
    noticeAddress: "legal@acme.com",
  };

  const fields: DocumentFields = {};
  for (const spec of doc.fields) {
    fields[spec.path] = spec.kind === "date" ? "2026-03-14" : `Answer for ${spec.label}`;
  }
  for (const side of doc.parties) fields[side.path] = { ...party };

  return fields;
}

/** The heading anchor GitHub-flavoured Markdown derives from a heading. */
function gfmAnchor(heading: string): string {
  return `#${heading
    .toLowerCase()
    .replace(/[^\w\- ]/g, "")
    .trim()
    .replace(/\s+/g, "-")}`;
}

describe("every catalogued document type", () => {
  it("has all ten", () => {
    expect(documents).toHaveLength(10);
  });

  it("leaves no cover-page markup unresolved", () => {
    // A leftover span renders as visible angle brackets in the middle of a
    // signed agreement.
    for (const doc of documents) {
      const markdown = transformStandardTerms(doc);
      expect(markdown, doc.slug).not.toMatch(/<span class="[a-z_]*_link">/);
    }
  });

  it("points every cross-reference at a heading the cover page writes", () => {
    // The failure this file exists to catch: the transform matches by exact
    // label, so a Common Paper wording change turns a live reference into a
    // link to nowhere.
    for (const doc of documents) {
      const markdown = renderDocument(doc, answered(doc));
      const headings = new Set(
        [...markdown.matchAll(/^#{1,3}\s+(.+)$/gm)].map(([, text]) =>
          gfmAnchor(text.trim()),
        ),
      );

      for (const [, anchor] of markdown.matchAll(/\]\((#[^)]+)\)/g)) {
        expect(headings, `${doc.slug} -> ${anchor}`).toContain(anchor);
      }
    }
  });

  it("produces exactly one top-level heading", () => {
    // The template's own title is demoted so the cover page's is the only H1.
    for (const doc of documents) {
      const markdown = renderDocument(doc, answered(doc));
      expect(markdown.match(/^# /gm), doc.slug).toHaveLength(1);
    }
  });

  it("writes a section for every field it will ask about", () => {
    for (const doc of documents) {
      const markdown = renderDocument(doc, answered(doc));
      for (const spec of doc.fields) {
        expect(markdown, `${doc.slug}.${spec.path}`).toContain(`### ${spec.label}`);
      }
    }
  });

  it("names both sides in the signature table", () => {
    for (const doc of documents) {
      const markdown = renderDocument(doc, answered(doc));
      const [a, b] = doc.parties;
      expect(markdown, doc.slug).toContain(`| | ${a.role} | ${b.role} |`);
    }
  });

  it("keeps the Standard Terms long enough to be the real thing", () => {
    for (const doc of documents) {
      expect(doc.standardTerms.length, doc.slug).toBeGreaterThan(1000);
    }
  });

  it("renders a blank cover page without throwing", () => {
    // What a visitor sees the moment the assistant settles on a document,
    // before they have answered anything.
    for (const doc of documents) {
      const blank: DocumentFields = {};
      for (const spec of doc.fields) blank[spec.path] = "";
      for (const side of doc.parties) {
        blank[side.path] = {
          company: "",
          signatoryName: "",
          signatoryTitle: "",
          noticeAddress: "",
        };
      }

      expect(() => renderDocument(doc, blank), doc.slug).not.toThrow();
    }
  });
});
