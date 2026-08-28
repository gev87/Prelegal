import { readFile } from "node:fs/promises";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  const mocked = { ...actual, readFile: vi.fn() };
  return { ...mocked, default: mocked };
});

const readFileMock = vi.mocked(readFile);

describe("loadStandardTerms", () => {
  beforeEach(() => {
    vi.resetModules();
    readFileMock.mockReset();
  });

  async function loadStandardTerms() {
    return (await import("@/lib/nda/templates")).loadStandardTerms();
  }

  it("returns the template file's contents", async () => {
    readFileMock.mockResolvedValue("# Standard Terms\n" as never);

    await expect(loadStandardTerms()).resolves.toBe("# Standard Terms\n");
  });

  it("reads mutual-nda.md from the repository's templates directory", async () => {
    readFileMock.mockResolvedValue("" as never);

    await loadStandardTerms();

    const [file, encoding] = readFileMock.mock.calls[0];

    expect(String(file).replace(/\\/g, "/")).toMatch(/\/templates\/mutual-nda\.md$/);
    expect(encoding).toBe("utf8");
  });

  it("reads the file exactly once per call", async () => {
    readFileMock.mockResolvedValue("" as never);

    await loadStandardTerms();

    expect(readFileMock).toHaveBeenCalledTimes(1);
  });

  it("explains where the file was expected when it cannot be read", async () => {
    readFileMock.mockRejectedValue(new Error("ENOENT"));

    await expect(loadStandardTerms()).rejects.toThrow(/mutual-nda\.md/);
    readFileMock.mockRejectedValue(new Error("ENOENT"));
    await expect(loadStandardTerms()).rejects.toThrow(/templates\/ directory/);
  });

  it("keeps the underlying failure as the cause", async () => {
    const underlying = new Error("EACCES: permission denied");
    readFileMock.mockRejectedValue(underlying);

    await expect(loadStandardTerms()).rejects.toMatchObject({ cause: underlying });
  });
});
