import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchSavedDocument,
  HistoryFailedError,
  listSavedDocuments,
  saveDocument,
} from "@/lib/documents/history";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const SAVED = {
  id: 3,
  documentType: "pilot-agreement",
  documentTypeName: "Pilot Agreement",
  createdAt: "2026-03-14 12:00:00",
  fields: { partyA: { company: "Acme" } },
};

const SUMMARY = {
  id: 3,
  documentType: "pilot-agreement",
  documentTypeName: "Pilot Agreement",
  createdAt: "2026-03-14 12:00:00",
};

describe("saveDocument", () => {
  it("sends the document type and the cover page", async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, SAVED));

    await saveDocument("pilot-agreement", { partyA: { company: "Acme" } } as never);

    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toContain("/api/documents");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(init.body)).toEqual({
      documentType: "pilot-agreement",
      fields: { partyA: { company: "Acme" } },
    });
  });

  it("returns the stored document", async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, SAVED));

    expect(await saveDocument("pilot-agreement", {})).toEqual(SAVED);
  });

  /** The message the server wrote, not one invented here — the same thing
   *  `describeFailure` does for every other endpoint. */
  it("raises what the server said when it refuses", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(422, { detail: "That is not a document type this product drafts." }),
    );

    await expect(saveDocument("nonsense", {})).rejects.toThrow(
      "That is not a document type this product drafts.",
    );
  });

  it("raises something a person can read when the server is not running", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(saveDocument("pilot-agreement", {})).rejects.toBeInstanceOf(
      HistoryFailedError,
    );
  });
});

describe("listSavedDocuments", () => {
  it("returns the summaries the server sent", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, [SUMMARY]));

    expect(await listSavedDocuments()).toEqual([SUMMARY]);
  });

  it("returns an empty list rather than failing on one", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, []));

    expect(await listSavedDocuments()).toEqual([]);
  });

  it("raises when a guest is refused", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { detail: "Sign in to see them." }));

    await expect(listSavedDocuments()).rejects.toThrow("Sign in to see them.");
  });

  /** A row missing `createdAt` would render "Invalid Date" beside a document
   *  name, which reads as the document being broken rather than the reply. */
  it("refuses a list of things that are not summaries", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, [{ id: 3 }]));

    await expect(listSavedDocuments()).rejects.toBeInstanceOf(HistoryFailedError);
  });
});

describe("fetchSavedDocument", () => {
  it("asks for the document by id", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, SAVED));

    await fetchSavedDocument(3);

    expect(fetchMock.mock.calls[0][0]).toContain("/api/documents/3");
  });

  it("returns the document with its cover page", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, SAVED));

    expect(await fetchSavedDocument(3)).toEqual(SAVED);
  });

  /**
   * These values go straight to `renderDocument`. A `fields` that is not an
   * object throws somewhere much less obvious than here.
   */
  it("refuses a document with no cover page on it", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, SUMMARY));

    await expect(fetchSavedDocument(3)).rejects.toBeInstanceOf(HistoryFailedError);
  });

  it("raises when it is not yours to read", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(404, { detail: "No saved document with that id." }),
    );

    await expect(fetchSavedDocument(3)).rejects.toThrow("No saved document with that id.");
  });
});
