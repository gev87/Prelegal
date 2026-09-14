import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ChatFailedError,
  ChatUnavailableError,
  sendChatTurn,
  type ChatMessage,
} from "@/lib/chat";
import { createDefaultFields } from "@/lib/nda/schema";
import { asDocumentFields, completeFields } from "../fixtures/fields";

const TODAY = "2026-03-14";

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

function aTurn(overrides: Record<string, unknown> = {}) {
  return {
    reply: "Understood.",
    documentType: "mutual-nda",
    documentTypeName: "Mutual NDA",
    fields: completeFields({ effectiveDate: TODAY }),
    updatedFields: ["purpose"],
    carriedFields: [],
    droppedFields: [],
    ...overrides,
  };
}

function aRequest(messages: ChatMessage[] = [{ role: "user", content: "Hello." }]) {
  return {
    messages,
    documentType: "mutual-nda",
    fields: asDocumentFields(createDefaultFields(TODAY)),
    confirmedFields: [],
    today: TODAY,
  };
}

function sentBody() {
  return JSON.parse(fetchMock.mock.calls[0][1].body);
}

describe("sendChatTurn", () => {
  it("returns the turn the server sent", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, aTurn()));

    expect(await sendChatTurn(aRequest())).toEqual(aTurn());
  });

  it("posts JSON", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, aTurn()));

    await sendChatTurn(aRequest());
    const [, init] = fetchMock.mock.calls[0];

    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
  });

  it("leaves the app's own messages out", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, aTurn()));

    await sendChatTurn(
      aRequest([
        { role: "assistant", content: "A greeting nobody's model wrote.", local: true },
        { role: "user", content: "Hello." },
      ]),
    );

    expect(sentBody().messages).toEqual([{ role: "user", content: "Hello." }]);
  });

  it("sends no trace of the local flag", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, aTurn()));

    await sendChatTurn(aRequest());

    expect(sentBody().messages[0]).toEqual({ role: "user", content: "Hello." });
  });

  describe("failures", () => {
    it("treats a 503 as the assistant being switched off", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(503, { detail: "Not configured." }));

      await expect(sendChatTurn(aRequest())).rejects.toBeInstanceOf(ChatUnavailableError);
    });

    it("carries the reason a 503 gave", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(503, { detail: "Not configured." }));

      await expect(sendChatTurn(aRequest())).rejects.toThrow("Not configured.");
    });

    it("treats a 502 as worth retrying", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(502, { detail: "Try again." }));

      await expect(sendChatTurn(aRequest())).rejects.toBeInstanceOf(ChatFailedError);
    });

    it("explains an unreachable server", async () => {
      fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

      await expect(sendChatTurn(aRequest())).rejects.toThrow("Could not reach the server");
    });

    /** FastAPI answers a rejected body with a list, not a sentence. */
    it("reads the first problem out of a rejected body", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(422, { detail: [{ msg: "Input should be 'user' or 'assistant'" }] }),
      );

      await expect(sendChatTurn(aRequest())).rejects.toThrow("Input should be");
    });

    it("falls back when there is no detail at all", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(500, {}));

      await expect(sendChatTurn(aRequest())).rejects.toThrow("Something went wrong");
    });
  });

  /**
   * The renderer is handed these fields directly. A malformed payload
   * reaching it is a blank screen rather than a bad sentence, so the shape
   * is checked before it gets that far.
   */
  describe("a reply it cannot read", () => {
    it.each([
      ["not an object", "a string"],
      ["null", null],
      ["no reply", { fields: completeFields(), updatedFields: [] }],
      ["a reply that is not text", { reply: 7, fields: completeFields(), updatedFields: [] }],
      ["no fields", { reply: "Hi.", updatedFields: [] }],
      ["fields that are not an object", { reply: "Hi.", fields: "nope", updatedFields: [] }],
      ["fields missing the cover page", { reply: "Hi.", fields: {}, updatedFields: [] }],
      ["no list of what changed", { reply: "Hi.", fields: completeFields() }],
      [
        "fields with no second party",
        {
          reply: "Hi.",
          fields: { ...completeFields(), partyTwo: undefined },
          updatedFields: [],
        },
      ],
      [
        "a party that is null",
        {
          reply: "Hi.",
          fields: { ...completeFields(), partyOne: null },
          updatedFields: [],
        },
      ],
      [
        "a party missing a name",
        {
          reply: "Hi.",
          fields: { ...completeFields(), partyTwo: { company: "Globex" } },
          updatedFields: [],
        },
      ],
      [
        "a field holding something the renderer cannot print",
        {
          reply: "Hi.",
          fields: { ...completeFields(), purpose: ["not", "text"] },
          updatedFields: [],
        },
      ],
      ["no document type", { reply: "Hi.", fields: completeFields(), updatedFields: [] }],
      [
        "a document type that is not text",
        { ...aTurn(), documentType: 7 },
      ],
      [
        "a document name that is neither text nor absent",
        { ...aTurn(), documentTypeName: 7 },
      ],
      ["no list of what carried", { ...aTurn(), carriedFields: undefined }],
      ["no list of what was dropped", { ...aTurn(), droppedFields: undefined }],
    ])("rejects %s", async (_name, body) => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, body));

      await expect(sendChatTurn(aRequest())).rejects.toBeInstanceOf(ChatFailedError);
    });

    /**
     * The shape check is about values, not names: there are eleven cover
     * pages and a list of one document's field names here could only reject
     * the other ten. What it still catches is anything the renderer would
     * choke on — which is why a party that is null is refused and a
     * governing law holding a number is not.
     */
    it("accepts a cover page it has never seen the shape of", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(200, {
          ...aTurn(),
          documentType: "pilot-agreement",
          documentTypeName: "Pilot Agreement",
          fields: { pilotPeriod: "60 days", partyA: { company: "Acme", signatoryName: "Dana", signatoryTitle: "CEO", noticeAddress: "legal@acme.com" } },
        }),
      );

      const turn = await sendChatTurn(aRequest());

      expect(turn.documentType).toBe("pilot-agreement");
    });

    it("accepts an empty cover page while no document has been chosen", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(200, {
          ...aTurn(),
          documentType: "undetermined",
          documentTypeName: null,
          fields: {},
        }),
      );

      const turn = await sendChatTurn(aRequest());

      expect(turn.documentTypeName).toBeNull();
    });

    it("rejects a body that is not JSON at all", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token <");
        },
      } as unknown as Response);

      await expect(sendChatTurn(aRequest())).rejects.toThrow("could not read");
    });
  });
});
