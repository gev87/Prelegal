import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { MUTUAL_NDA, type DocumentType, type FieldSpec, type PartySpec } from "./types";

/**
 * Every document type the product can draft, assembled at build time.
 *
 * Two sources, both in the repository and neither in the running container.
 * The Standard Terms come from `templates/`, curated by PL-2. The field
 * descriptors come from `backend/app/document_fields.json` — the same file
 * the backend reads, rather than a copy kept in step by hand, because 112
 * fields across ten documents is far past what two hand-mirrored definitions
 * survive.
 *
 * This runs on the server and, because the app is statically exported, that
 * means at build time. The Standard Terms are fixed, versioned legal texts
 * and the descriptors change only when a template does, so baking both in is
 * right for the same reason PL-5 baked in the one template it had.
 */
const REPO_ROOT = path.join(process.cwd(), "..");
const TEMPLATES_DIR = path.join(REPO_ROOT, "templates");
const FIELD_CATALOG = path.join(REPO_ROOT, "backend", "app", "document_fields.json");

/**
 * The Mutual NDA is absent from `document_fields.json` on purpose — it keeps
 * the hand-written schema and renderer in `lib/nda/`. It still has to appear
 * in the list of documents somebody can choose, so its entry is written here.
 * The description matches `document_types.offerable()` on the backend, which
 * is what the assistant reads when offering it.
 */
const MUTUAL_NDA_ENTRY = {
  slug: MUTUAL_NDA,
  name: "Mutual NDA",
  description:
    "Mutual non-disclosure agreement for two companies sharing confidential " +
    "information, covering the purpose, how long the arrangement runs, how " +
    "long confidentiality lasts, and governing law.",
  template_filename: "mutual-nda.md",
};

interface CatalogEntry {
  name: string;
  description: string;
  template_filename: string;
  party_a: PartySpec;
  party_b: PartySpec;
  fields: FieldSpec[];
}

export async function loadDocuments(): Promise<DocumentType[]> {
  const catalog = await readCatalog();

  const nda: DocumentType = {
    ...MUTUAL_NDA_ENTRY,
    standardTerms: await readTemplate(MUTUAL_NDA_ENTRY.template_filename),
    fields: [],
    parties: [],
  };

  const rest = await Promise.all(
    Object.entries(catalog).map(async ([slug, entry]) => ({
      slug,
      name: entry.name,
      description: entry.description,
      standardTerms: await readTemplate(entry.template_filename),
      fields: entry.fields,
      parties: [entry.party_a, entry.party_b],
    })),
  );

  return [nda, ...rest];
}

async function readCatalog(): Promise<Record<string, CatalogEntry>> {
  try {
    return JSON.parse(await readFile(FIELD_CATALOG, "utf8")) as Record<string, CatalogEntry>;
  } catch (cause) {
    throw new Error(
      `Could not read the field catalog at ${FIELD_CATALOG}. The frontend ` +
        "expects to run from inside the Prelegal repository, alongside " +
        "backend/ and templates/.",
      { cause },
    );
  }
}

async function readTemplate(filename: string): Promise<string> {
  const file = path.join(TEMPLATES_DIR, filename);

  try {
    return await readFile(file, "utf8");
  } catch (cause) {
    throw new Error(
      `Could not read the Standard Terms at ${file}. The frontend expects to ` +
        "run from inside the Prelegal repository, alongside the templates/ " +
        "directory.",
      { cause },
    );
  }
}
