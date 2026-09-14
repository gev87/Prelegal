import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ChatPanel, { type ChatPanelHandle } from "@/components/ChatPanel";
import type { ChatTurn } from "@/lib/chat";
import { createDefaultFields } from "@/lib/nda/schema";
import {
  asDocumentFields,
  completeFields,
  completePilotFields,
  DOCUMENTS,
} from "../fixtures/fields";

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

function renderPanel(
  onTurn: (turn: ChatTurn) => void = () => {},
  documentType = "mutual-nda",
) {
  const ref = createRef<ChatPanelHandle>();

  return {
    ref,
    user: userEvent.setup(),
    ...render(
      <ChatPanel
        ref={ref}
        documents={DOCUMENTS}
        documentType={documentType}
        fields={asDocumentFields(createDefaultFields(TODAY))}
        today={TODAY}
        onTurn={onTurn}
      />,
    ),
  };
}

async function say(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.click(screen.getByLabelText("Your message"));
  await user.paste(text);
  await user.click(screen.getByRole("button", { name: "Send" }));
}

function aTurn(overrides: Record<string, unknown> = {}) {
  return {
    reply: "Got it. Who signs for them?",
    documentType: "mutual-nda",
    documentTypeName: "Mutual NDA",
    fields: completeFields({ effectiveDate: TODAY }),
    updatedFields: ["partyOne.company"],
    carriedFields: [],
    droppedFields: [],
    ...overrides,
  };
}

describe("ChatPanel", () => {
  it("opens with a greeting and asks the server for nothing", () => {
    renderPanel();

    expect(screen.getByRole("log", { name: "Conversation" })).toHaveTextContent(
      "I can help you draft a legal agreement",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows what was said and what came back", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, aTurn()));
    const { user } = renderPanel();

    await say(user, "We're Acme.");

    const log = screen.getByRole("log", { name: "Conversation" });
    expect(log).toHaveTextContent("We're Acme.");
    await waitFor(() => expect(log).toHaveTextContent("Who signs for them?"));
  });

  it("hands the whole turn up", async () => {
    // The type and the fields move together: a cover page from a new
    // document shown against the old document's descriptors would be read
    // with the wrong labels for a render.
    fetchMock.mockResolvedValueOnce(jsonResponse(200, aTurn()));
    const onTurn = vi.fn();
    const { user } = renderPanel(onTurn);

    await say(user, "We're Acme.");

    await waitFor(() =>
      expect(onTurn).toHaveBeenCalledWith(
        expect.objectContaining({
          documentType: "mutual-nda",
          fields: completeFields({ effectiveDate: TODAY }),
        }),
      ),
    );
  });

  it("posts the conversation and the cover page", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, aTurn()));
    const { user } = renderPanel();

    await say(user, "We're Acme.");

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [url, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);

    expect(url).toContain("/api/chat");
    expect(init.method).toBe("POST");
    expect(body.fields).toEqual(createDefaultFields(TODAY));
    expect(body.today).toBe(TODAY);
  });

  /**
   * The greeting is the app talking, not the model. Feeding it back would
   * let the model build on words it never wrote.
   */
  it("never sends the app's own messages to the model", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, aTurn()));
    const { user } = renderPanel();

    await say(user, "We're Acme.");

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);

    expect(body.messages).toEqual([{ role: "user", content: "We're Acme." }]);
  });

  /**
   * A blank cover page already holds a suggested purpose, Delaware and one
   * year. Unless the server is told which answers are real, the assistant
   * reads those defaults as settled and never asks the questions.
   */
  it("remembers which answers have been settled, and says so next turn", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, aTurn({ updatedFields: ["purpose"] })))
      .mockResolvedValueOnce(
        jsonResponse(200, aTurn({ updatedFields: ["partyOne.company"] })),
      );
    const { user } = renderPanel();

    await say(user, "Evaluating a reseller deal.");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    await say(user, "We're Acme.");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const second = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(second.confirmedFields).toEqual(["purpose"]);
  });

  it("starts with nothing settled", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, aTurn()));
    const { user } = renderPanel();

    await say(user, "Hello.");

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).confirmedFields).toEqual([]);
  });

  describe("when the server has no key", () => {
    it("says the assistant is unavailable", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(503, { detail: "The assistant is not configured on this server." }),
      );
      const { user } = renderPanel();

      await say(user, "Hello.");

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "The assistant is not configured on this server.",
      );
    });

    it("says the document still works", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(503, { detail: "Not configured." }));
      const { user } = renderPanel();

      await say(user, "Hello.");

      expect(await screen.findByRole("alert")).toHaveTextContent("still works");
    });

    /**
     * A key is either configured for the server or it is not. Letting them
     * type again would walk them into the same wall.
     */
    it("stops taking messages", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(503, { detail: "Not configured." }));
      const { user } = renderPanel();

      await say(user, "Hello.");
      await screen.findByRole("alert");

      expect(screen.getByLabelText("Your message")).toBeDisabled();
      expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    });
  });

  describe("when a turn fails", () => {
    it("reports an unreachable server", async () => {
      fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
      const { user } = renderPanel();

      await say(user, "Hello.");

      expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the server");
    });

    it("reports what the server said went wrong", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(502, { detail: "The assistant is temporarily unavailable." }),
      );
      const { user } = renderPanel();

      await say(user, "Hello.");

      expect(await screen.findByRole("alert")).toHaveTextContent("temporarily unavailable");
    });

    /** Unlike a missing key, this one is worth another go. */
    it("lets them try again", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(502, { detail: "Try again." }));
      const { user } = renderPanel();

      await say(user, "Hello.");
      await screen.findByRole("alert");

      expect(screen.getByLabelText("Your message")).not.toBeDisabled();
    });

    it("refuses a reply it cannot read", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { nonsense: true }));
      const onTurn = vi.fn();
      const { user } = renderPanel(onTurn);

      await say(user, "Hello.");

      expect(await screen.findByRole("alert")).toBeInTheDocument();
      // Nothing malformed reaches the renderer.
      expect(onTurn).not.toHaveBeenCalled();
    });
  });

  describe("the composer", () => {
    it("will not send an empty message", () => {
      renderPanel();

      expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("will not send only whitespace", async () => {
      const { user } = renderPanel();

      await user.click(screen.getByLabelText("Your message"));
      await user.paste("   ");

      expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    });

    it("clears itself once sent", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, aTurn()));
      const { user } = renderPanel();

      await say(user, "We're Acme.");

      expect(screen.getByLabelText("Your message")).toHaveValue("");
    });

    it("sends on Enter", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, aTurn()));
      const { user } = renderPanel();

      await user.click(screen.getByLabelText("Your message"));
      await user.paste("We're Acme.");
      await user.keyboard("{Enter}");

      await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    });

    it("takes a new line on shift-Enter instead of sending", async () => {
      const { user } = renderPanel();

      await user.click(screen.getByLabelText("Your message"));
      await user.paste("One");
      await user.keyboard("{Shift>}{Enter}{/Shift}");

      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.getByLabelText("Your message")).toHaveValue("One\n");
    });

    it("shows that it is working, and takes nothing meanwhile", async () => {
      let release: (value: Response) => void = () => {};
      fetchMock.mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
      );
      const { user } = renderPanel();

      await say(user, "We're Acme.");

      expect(screen.getByRole("log", { name: "Conversation" })).toHaveTextContent("Thinking");
      expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();

      release(jsonResponse(200, aTurn()));
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument(),
      );
    });
  });

  describe("what the rest of the app can ask of it", () => {
    it("seeds a question about a defined term", () => {
      const { ref } = renderPanel();

      act(() => ref.current!.askAboutTerm("mndaTerm"));

      expect(screen.getByLabelText("Your message")).toHaveValue("About the mnda term — ");
    });

    it("reports what a blocked download still needs", () => {
      const { ref } = renderPanel();

      act(() => ref.current!.reportMissing(["the purpose", "the effective date"]));

      expect(screen.getByRole("log", { name: "Conversation" })).toHaveTextContent(
        "Before you can download it, I still need the purpose and the effective date.",
      );
    });

    it("joins three or more with commas", () => {
      const { ref } = renderPanel();

      act(() => ref.current!.reportMissing(["one", "two", "three"]));

      expect(screen.getByRole("log", { name: "Conversation" })).toHaveTextContent(
        "I still need one, two and three.",
      );
    });

    it("keeps that note out of what the model is sent", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, aTurn()));
      const { ref, user } = renderPanel();

      act(() => ref.current!.reportMissing(["the purpose"]));
      await say(user, "It's for a reseller deal.");

      await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);

      expect(body.messages).toEqual([
        { role: "user", content: "It's for a reseller deal." },
      ]);
    });
  });
});

/**
 * PL-6 fix: the conversation has to stay a conversation.
 *
 * Clicking "Send" moves focus to the button, and disabling that button while
 * the request is in flight drops focus to nowhere at all — so before this,
 * every answer after the first began with a click back into the box. Pressing
 * Enter happened to work, but only because the textarea is never disabled,
 * which is incidental rather than intended.
 */
describe("where the cursor ends up", () => {
  function composer() {
    return screen.getByLabelText("Your message");
  }

  it("puts the cursor back in the message box after a reply", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, aTurn()));
    const { user } = renderPanel();

    await say(user, "We're Acme.");

    await waitFor(() =>
      expect(screen.getByRole("log", { name: "Conversation" })).toHaveTextContent(
        "Who signs for them?",
      ),
    );
    expect(composer()).toHaveFocus();
  });

  it("puts it back after a turn that failed", async () => {
    // The turn you most want to be able to retype immediately is the one
    // that just went wrong.
    fetchMock.mockResolvedValueOnce(jsonResponse(502, { detail: "Upstream said no." }));
    const { user } = renderPanel();

    await say(user, "We're Acme.");

    await screen.findByRole("alert");
    expect(composer()).toHaveFocus();
  });

  it("leaves it alone when the assistant has been switched off", async () => {
    // The box is disabled in that state, so focusing it would be asking the
    // browser for something it will refuse anyway.
    fetchMock.mockResolvedValueOnce(jsonResponse(503, { detail: "No key here." }));
    const { user } = renderPanel();

    await say(user, "We're Acme.");

    await screen.findByRole("alert");
    expect(composer()).toBeDisabled();
    expect(composer()).not.toHaveFocus();
  });
});

describe("changing document mid-conversation", () => {
  const switchTurn = {
    reply: "A pilot agreement suits that better.",
    documentType: "pilot-agreement",
    documentTypeName: "Pilot Agreement",
    fields: completePilotFields(),
    updatedFields: [],
    carriedFields: ["partyA.company"],
    droppedFields: ["purpose"],
  };

  it("says what carried across and what did not", async () => {
    // Said by the app, not the model: the server computed the answer, so
    // asking the model to describe it would spend a turn on something
    // already known and risk it describing the move wrongly.
    fetchMock.mockResolvedValueOnce(jsonResponse(200, switchTurn));
    const { user } = renderPanel();

    await say(user, "Actually we need a pilot agreement.");

    const log = screen.getByRole("log", { name: "Conversation" });
    await waitFor(() => expect(log).toHaveTextContent("Switched to a Pilot Agreement"));
    expect(log).toHaveTextContent("I kept the Customer's name");
    expect(log).toHaveTextContent("doesn't ask for the purpose");
  });

  it("says nothing when the first document is chosen", async () => {
    // There was no document to carry anything from, and announcing that
    // nothing survived a document nobody was drafting would be nonsense.
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { ...switchTurn, carriedFields: [], droppedFields: [] }),
    );
    const { user } = renderPanel(() => {}, "undetermined");

    await say(user, "I need a pilot agreement.");

    const log = screen.getByRole("log", { name: "Conversation" });
    await waitFor(() => expect(log).toHaveTextContent("suits that better"));
    expect(log).not.toHaveTextContent("Switched to");
  });

  it("forgets answers that did not carry, so they are asked again", async () => {
    // The settled set is replaced rather than extended. Extending it would
    // leave the assistant believing a dropped answer was still settled and
    // never asking for it on the new document.
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, switchTurn))
      .mockResolvedValueOnce(jsonResponse(200, { ...switchTurn, documentType: "pilot-agreement" }));
    const { user } = renderPanel();

    await say(user, "Actually we need a pilot agreement.");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await say(user, "Sixty days.");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const sent = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(sent.confirmedFields).toEqual(["partyA.company"]);
  });
});
