import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Templates live in the repository's `templates/` directory, curated by PL-2
 * and catalogued in `catalog.json`. The frontend reads from that single source
 * rather than keeping its own copy, so a template correction never has to be
 * applied twice.
 */
const TEMPLATES_DIR = path.join(process.cwd(), "..", "templates");

const MUTUAL_NDA_STANDARD_TERMS = "mutual-nda.md";

export async function loadStandardTerms(): Promise<string> {
  const file = path.join(TEMPLATES_DIR, MUTUAL_NDA_STANDARD_TERMS);

  try {
    return await readFile(file, "utf8");
  } catch (cause) {
    throw new Error(
      `Could not read the Mutual NDA Standard Terms at ${file}. ` +
        "The frontend expects to run from inside the Prelegal repository, " +
        "alongside the templates/ directory.",
      { cause },
    );
  }
}
