import { readFile } from "node:fs/promises";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { renderMnda, transformStandardTerms } from "@/lib/nda/render";
import { DEFINED_TERM_BY_LABEL } from "@/lib/nda/schema";
import { completeFields } from "../fixtures/fields";

/**
 * These run against the real `templates/mutual-nda.md` rather than a fixture.
 * The transform matches cross-references by their exact label, so a wording
 * change in the template would silently downgrade a defined term to plain
 * text — the failure this file exists to catch.
 */
const TEMPLATE = path.join(process.cwd(), "..", "templates", "mutual-nda.md");

let standardTerms: string;

beforeAll(async () => {
  standardTerms = await readFile(TEMPLATE, "utf8");
});

/** The heading anchor GitHub-flavoured Markdown derives from a heading. */
function gfmAnchor(heading: string): string {
  return `#${heading
    .toLowerCase()
    .replace(/[^\w\- ]/g, "")
    .trim()
    .replace(/ /g, "-")}`;
}

describe("the published standard terms", () => {
  it("is present and non-trivial", () => {
    expect(standardTerms.length).toBeGreaterThan(1000);
  });

  it("still opens with the heading the transform demotes", () => {
    expect(standardTerms).toMatch(/^#\s+Standard Terms\s*$/m);
  });

  it("uses only cross-reference labels the cover page defines", () => {
    const labels = [
      ...standardTerms.matchAll(/<span class="coverpage_link">([^<]*)<\/span>/g),
    ].map((match) => match[1].trim());

    expect(labels.length).toBeGreaterThan(0);

    for (const label of new Set(labels)) {
      expect(DEFINED_TERM_BY_LABEL, `unknown cross-reference "${label}"`).toHaveProperty(
        label,
      );
    }
  });

  it("references every term the cover page defines", () => {
    for (const label of Object.keys(DEFINED_TERM_BY_LABEL)) {
      expect(standardTerms, `"${label}" is never referenced`).toContain(
        `<span class="coverpage_link">${label}</span>`,
      );
    }
  });
});

describe("the rendered agreement", () => {
  it("leaves no unresolved cross-reference markup", () => {
    const markdown = renderMnda(completeFields(), standardTerms);

    expect(markdown).not.toContain("coverpage_link");
    expect(markdown).not.toContain("<span");
  });

  it("has exactly one H1", () => {
    const markdown = renderMnda(completeFields(), standardTerms);

    expect(markdown.match(/^# .*$/gm)).toEqual(["# Mutual Non-Disclosure Agreement"]);
  });

  it("resolves every internal link to a heading in the document", () => {
    const markdown = renderMnda(completeFields(), standardTerms);
    const headings = new Set(
      [...markdown.matchAll(/^#{1,6} (.+)$/gm)].map((match) => gfmAnchor(match[1])),
    );
    const internalLinks = [...markdown.matchAll(/\]\((#[^)]*)\)/g)].map(
      (match) => match[1],
    );

    expect(internalLinks.length).toBeGreaterThan(0);

    for (const link of new Set(internalLinks)) {
      expect(headings, `dangling link ${link}`).toContain(link);
    }
  });

  it("reproduces the standard terms body verbatim apart from the links", () => {
    const transformed = transformStandardTerms(standardTerms);

    const strip = (text: string) =>
      text
        .replace(/<span class="coverpage_link">([^<]*)<\/span>/g, "$1")
        .replace(/\[([^\]]*)\]\(#[^)]*\)/g, "$1")
        .replace(/^##? Standard Terms\s*$/m, "Standard Terms");

    expect(strip(transformed)).toBe(strip(standardTerms));
  });

  it("matches the approved document for a known set of answers", () => {
    const markdown = renderMnda(
      completeFields({ modifications: "None." }),
      standardTerms,
    );

    expect(markdown).toMatchSnapshot();
  });
});
