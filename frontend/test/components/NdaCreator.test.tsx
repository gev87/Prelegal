import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import NdaCreator from "@/components/NdaCreator";
import { documentFilename, renderMnda } from "@/lib/nda/render";
import { createDefaultFields, type NdaFields } from "@/lib/nda/schema";
import { completeFields, FAKE_STANDARD_TERMS } from "../fixtures/fields";

const TODAY = "2026-03-14";

let createdBlobs: Blob[];
let downloadedNames: string[];
let print: ReturnType<typeof vi.spyOn>;
let revokeObjectURL: ReturnType<typeof vi.spyOn>;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  createdBlobs = [];
  downloadedNames = [];

  vi.spyOn(URL, "createObjectURL").mockImplementation((blob: Blob | MediaSource) => {
    createdBlobs.push(blob as Blob);
    return "blob:mock";
  });
  revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

  // Intercept the synthetic click so jsdom never attempts a navigation.
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloadedNames.push(this.download);
  });

  print = vi.spyOn(window, "print").mockImplementation(() => {});

  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function renderCreator() {
  return {
    user: userEvent.setup(),
    ...render(<NdaCreator standardTerms={FAKE_STANDARD_TERMS} today={TODAY} />),
  };
}

/** The cover page once `answerEverything` has run. */
function expectedFields(): NdaFields {
  return completeFields({ effectiveDate: TODAY });
}

/**
 * Drives one chat turn that fills the whole cover page in.
 *
 * The assistant is the only way answers arrive now, so a test that needs a
 * complete document says so in one exchange rather than eight.
 */
async function answerEverything(user: ReturnType<typeof userEvent.setup>) {
  fetchMock.mockResolvedValueOnce(
    jsonResponse(200, {
      reply: "That's everything — it's ready to download.",
      fields: expectedFields(),
      updatedFields: ["partyOne.company"],
    }),
  );

  await user.click(screen.getByLabelText("Your message"));
  await user.paste("Acme and Globex, evaluating a reseller deal.");
  await user.click(screen.getByRole("button", { name: "Send" }));

  await waitFor(() =>
    expect(
      screen.getByRole("region", { name: "Agreement preview" }),
    ).toHaveTextContent("Acme, Inc."),
  );
}

describe("NdaCreator", () => {
  it("shows the conversation and the document side by side", () => {
    renderCreator();

    expect(screen.getByRole("region", { name: "Drafting assistant" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Agreement preview" })).toBeInTheDocument();
  });

  it("opens with the assistant, before anything is asked of the server", () => {
    renderCreator();

    expect(screen.getByRole("log", { name: "Conversation" })).toHaveTextContent(
      "I can help you draft a mutual NDA",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("seeds the effective date from the date the server rendered", () => {
    renderCreator();

    expect(
      screen.getByRole("region", { name: "Agreement preview" }),
    ).toHaveTextContent("March 14, 2026");
  });

  describe("the live preview", () => {
    it("follows the answers the assistant settles", async () => {
      const { user } = renderCreator();
      const preview = screen.getByRole("region", { name: "Agreement preview" });

      expect(preview).not.toHaveTextContent("Globex Corporation");

      await answerEverything(user);

      expect(preview).toHaveTextContent("Acme, Inc.");
      expect(preview).toHaveTextContent("Globex Corporation");
      expect(preview).toHaveTextContent("Evaluating a potential reseller relationship.");
    });

    it("matches the document the renderer produces", async () => {
      const { user } = renderCreator();
      await answerEverything(user);

      const rendered = renderMnda(expectedFields(), FAKE_STANDARD_TERMS);

      // The heading the renderer writes, proving the preview is showing the
      // same document the download would write.
      expect(screen.getByRole("region", { name: "Agreement preview" })).toHaveTextContent(
        "Mutual Non-Disclosure Agreement",
      );
      expect(rendered).toContain("Acme, Inc.");
    });
  });

  describe("when the download is blocked", () => {
    it("has the assistant say what is still outstanding", async () => {
      const { user } = renderCreator();

      await user.click(screen.getByRole("button", { name: "Download Markdown" }));

      const log = screen.getByRole("log", { name: "Conversation" });
      expect(log).toHaveTextContent("Before you can download it, I still need");
      expect(log).toHaveTextContent("the first company's name");
      expect(log).toHaveTextContent("the second company's address for notices");
    });

    it("names the outstanding answers in the order the document reads", async () => {
      const { user } = renderCreator();

      await user.click(screen.getByRole("button", { name: "Download PDF" }));

      const said = screen.getByRole("log", { name: "Conversation" }).textContent ?? "";

      expect(said.indexOf("the first company's name")).toBeLessThan(
        said.indexOf("who signs for the first company"),
      );
      expect(said.indexOf("who signs for the first company")).toBeLessThan(
        said.indexOf("the second company's name"),
      );
    });

    it("writes no document", async () => {
      const { user } = renderCreator();

      await user.click(screen.getByRole("button", { name: "Download Markdown" }));

      expect(createdBlobs).toHaveLength(0);
      expect(downloadedNames).toHaveLength(0);
    });

    it("does not print", async () => {
      const { user } = renderCreator();

      await user.click(screen.getByRole("button", { name: "Download PDF" }));

      expect(print).not.toHaveBeenCalled();
    });

    it("never asks the server what is missing", async () => {
      const { user } = renderCreator();

      await user.click(screen.getByRole("button", { name: "Download Markdown" }));

      // Known here already. Asking would cost a turn, and would leave a
      // server with no key unable to explain why the button did nothing.
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("downloading Markdown", () => {
    it("downloads once every answer is present", async () => {
      const { user } = renderCreator();
      await answerEverything(user);

      await user.click(screen.getByRole("button", { name: "Download Markdown" }));

      expect(createdBlobs).toHaveLength(1);
      expect(downloadedNames).toHaveLength(1);
    });

    it("names the file after both parties and the effective date", async () => {
      const { user } = renderCreator();
      await answerEverything(user);

      await user.click(screen.getByRole("button", { name: "Download Markdown" }));

      expect(downloadedNames[0]).toBe(documentFilename(expectedFields(), "md"));
    });

    it("writes the same document the preview is showing", async () => {
      const { user } = renderCreator();
      await answerEverything(user);

      await user.click(screen.getByRole("button", { name: "Download Markdown" }));

      expect(await createdBlobs[0].text()).toBe(
        renderMnda(expectedFields(), FAKE_STANDARD_TERMS),
      );
    });

    it("leaves no dangling object URL behind", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const { user } = renderCreator();
      await answerEverything(user);

      await user.click(screen.getByRole("button", { name: "Download Markdown" }));
      vi.runAllTimers();

      expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock");
      vi.useRealTimers();
    });

    it("removes the temporary link from the page", async () => {
      const { user } = renderCreator();
      await answerEverything(user);

      await user.click(screen.getByRole("button", { name: "Download Markdown" }));

      expect(document.querySelectorAll("a[download]")).toHaveLength(0);
    });
  });

  describe("downloading a PDF", () => {
    it("prints once every answer is present", async () => {
      const { user } = renderCreator();
      await answerEverything(user);

      await user.click(screen.getByRole("button", { name: "Download PDF" }));

      expect(print).toHaveBeenCalledOnce();
    });

    it("does not build a Markdown blob", async () => {
      const { user } = renderCreator();
      await answerEverything(user);

      await user.click(screen.getByRole("button", { name: "Download PDF" }));

      expect(createdBlobs).toHaveLength(0);
    });
  });

  describe("asking about a defined term", () => {
    /**
     * Clicking a term used to scroll the form to the field that set it. With
     * no form, the equivalent is to bring the reader to the one thing that
     * can still change it.
     */
    it("seeds the message box with the term", async () => {
      const { user } = renderCreator();
      const preview = screen.getByRole("region", { name: "Agreement preview" });

      await user.click(within(preview).getByRole("button", { name: "Purpose" }));

      expect(screen.getByLabelText("Your message")).toHaveValue("About the purpose — ");
    });

    it("tells jurisdiction apart from governing law", async () => {
      const { user } = renderCreator();
      const preview = screen.getByRole("region", { name: "Agreement preview" });

      await user.click(within(preview).getByRole("button", { name: "Jurisdiction" }));

      expect(screen.getByLabelText("Your message")).toHaveValue(
        "About the jurisdiction — ",
      );
    });

    it("puts the cursor in the message box", async () => {
      const { user } = renderCreator();
      const preview = screen.getByRole("region", { name: "Agreement preview" });

      await user.click(within(preview).getByRole("button", { name: "Purpose" }));

      expect(document.activeElement).toBe(screen.getByLabelText("Your message"));
    });

    it("does not send it — reading the document costs nothing", async () => {
      const { user } = renderCreator();
      const preview = screen.getByRole("region", { name: "Agreement preview" });

      await user.click(within(preview).getByRole("button", { name: "Purpose" }));

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("the narrow-screen view switch", () => {
    it("starts on the conversation", () => {
      renderCreator();

      expect(screen.getByRole("button", { name: "Chat" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });

    it("switches to the document view", async () => {
      const { user } = renderCreator();

      await user.click(screen.getByRole("button", { name: "Document" }));

      expect(screen.getByRole("button", { name: "Document" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(screen.getByRole("region", { name: "Drafting assistant" })).toHaveClass(
        "pane-hidden",
      );
    });

    it("comes back to the conversation when a term is activated", async () => {
      const { user } = renderCreator();
      await user.click(screen.getByRole("button", { name: "Document" }));

      const preview = screen.getByRole("region", { name: "Agreement preview" });
      await user.click(within(preview).getByRole("button", { name: "Purpose" }));

      expect(screen.getByRole("button", { name: "Chat" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });

    it("comes back to the conversation when a download is blocked", async () => {
      const { user } = renderCreator();
      await user.click(screen.getByRole("button", { name: "Document" }));

      await user.click(screen.getByRole("button", { name: "Download Markdown" }));

      expect(screen.getByRole("button", { name: "Chat" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });
  });

  it("keeps the default cover page until the assistant changes it", () => {
    renderCreator();

    const defaults = createDefaultFields(TODAY);

    expect(
      screen.getByRole("region", { name: "Agreement preview" }),
    ).toHaveTextContent(defaults.purpose);
  });
});
