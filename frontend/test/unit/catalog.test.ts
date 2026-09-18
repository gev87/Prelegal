import { readFile } from "node:fs/promises";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  const mocked = { ...actual, readFile: vi.fn() };
  return { ...mocked, default: mocked };
});

const readFileMock = vi.mocked(readFile);

const CATALOG = {
  "pilot-agreement": {
    name: "Pilot Agreement",
    description: "Short trial of a product.",
    template_filename: "pilot-agreement.md",
    party_a: { path: "partyA", role: "Customer" },
    party_b: { path: "partyB", role: "Provider" },
    fields: [{ path: "pilotPeriod", label: "Pilot Period", guide: "How long." }],
  },
};

/** Answers each read by what was asked for, since the loader reads a JSON
 *  catalog and one Markdown file per document type in whatever order the
 *  promises settle. */
function readsFromTheRepository() {
  readFileMock.mockImplementation((async (file: unknown) => {
    const name = String(file).replace(/\\/g, "/");
    if (name.endsWith("document_fields.json")) return JSON.stringify(CATALOG);
    return `# ${name.split("/").pop()}\n`;
  }) as never);
}

describe("loadDocuments", () => {
  beforeEach(() => {
    vi.resetModules();
    readFileMock.mockReset();
  });

  async function loadDocuments() {
    return (await import("@/lib/documents/catalog")).loadDocuments();
  }

  it("offers the Mutual NDA alongside every catalogued type", async () => {
    readsFromTheRepository();

    const documents = await loadDocuments();

    expect(documents.map((document) => document.slug)).toEqual([
      "mutual-nda",
      "pilot-agreement",
    ]);
  });

  it("gives the Mutual NDA no field descriptors", async () => {
    // How `lib/documents/*` recognises the one type that keeps its
    // hand-written schema and renderer rather than being built from data.
    readsFromTheRepository();

    const [nda] = await loadDocuments();

    expect(nda.fields).toEqual([]);
    expect(nda.parties).toEqual([]);
  });

  it("carries each type's descriptors and party roles through", async () => {
    readsFromTheRepository();

    const documents = await loadDocuments();
    const pilot = documents.find((document) => document.slug === "pilot-agreement");

    expect(pilot?.fields[0].label).toBe("Pilot Period");
    expect(pilot?.parties.map((party) => party.role)).toEqual([
      "Customer",
      "Provider",
    ]);
  });

  it("reads the field catalog the backend reads, not a copy of it", async () => {
    // One file, two runtimes. A second copy kept in step by hand is what 112
    // fields across ten documents would not survive.
    readsFromTheRepository();

    await loadDocuments();

    const paths = readFileMock.mock.calls.map(([file]) =>
      String(file).replace(/\\/g, "/"),
    );

    expect(paths).toContainEqual(
      expect.stringMatching(/\/backend\/app\/document_fields\.json$/),
    );
  });

  it("reads each type's Standard Terms from the templates directory", async () => {
    readsFromTheRepository();

    await loadDocuments();

    const paths = readFileMock.mock.calls.map(([file]) =>
      String(file).replace(/\\/g, "/"),
    );

    expect(paths).toContainEqual(expect.stringMatching(/\/templates\/mutual-nda\.md$/));
    expect(paths).toContainEqual(
      expect.stringMatching(/\/templates\/pilot-agreement\.md$/),
    );
  });

  it("explains where the catalog was expected when it cannot be read", async () => {
    readFileMock.mockRejectedValue(new Error("ENOENT"));

    await expect(loadDocuments()).rejects.toThrow(/document_fields\.json/);
  });

  it("explains where a template was expected when it cannot be read", async () => {
    readFileMock.mockImplementation((async (file: unknown) => {
      if (String(file).endsWith("document_fields.json")) return JSON.stringify({});
      throw new Error("ENOENT");
    }) as never);

    await expect(loadDocuments()).rejects.toThrow(/templates\/ directory/);
  });

  it("keeps the underlying failure as the cause", async () => {
    const underlying = new Error("EACCES: permission denied");
    readFileMock.mockRejectedValue(underlying);

    await expect(loadDocuments()).rejects.toMatchObject({ cause: underlying });
  });
});
