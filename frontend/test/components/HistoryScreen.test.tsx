import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import HistoryScreen from "@/components/HistoryScreen";
import { guest, signedIn, stillAsking } from "../fixtures/account";
import { completePilotFields, DOCUMENTS } from "../fixtures/fields";

/** Built inline because `vi.hoisted` runs before imports — see
 *  `test/fixtures/account.ts`. */
const account = vi.hoisted(() => ({
  status: "guest" as "loading" | "guest" | "signed-in",
  account: null as { id: number; email: string } | null,
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/components/AccountProvider", () => ({
  useAccount: () => account,
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(window, "print").mockImplementation(() => {});
  guest(account);
});

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const SUMMARY = {
  id: 3,
  documentType: "pilot-agreement",
  documentTypeName: "Pilot Agreement",
  createdAt: "2026-03-14 12:00:00",
};

function renderHistory() {
  return {
    user: userEvent.setup(),
    ...render(<HistoryScreen documents={DOCUMENTS} />),
  };
}

describe("HistoryScreen", () => {
  describe("a visitor with no account", () => {
    it("is told why there is nothing here", () => {
      renderHistory();

      expect(screen.getByRole("link", { name: /Sign in/ })).toHaveAttribute(
        "href",
        "/login/",
      );
    });

    /** Asking would only be asking for the 401 the shell already knows about. */
    it("costs the server nothing", () => {
      renderHistory();

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  it("asks for nothing while it still does not know who is here", () => {
    stillAsking(account);

    renderHistory();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe("somebody signed in", () => {
    beforeEach(() => signedIn(account));

    it("says it is looking", () => {
      fetchMock.mockResolvedValue(jsonResponse(200, []));

      renderHistory();

      expect(screen.getByText(/Looking for your documents/)).toBeInTheDocument();
    });

    it("says so when there is nothing saved yet", async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, []));

      renderHistory();

      expect(await screen.findByText(/Nothing saved yet/)).toBeInTheDocument();
    });

    it("lists what was saved, with when", async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, [SUMMARY]));

      renderHistory();

      expect(await screen.findByText("Pilot Agreement")).toBeInTheDocument();
      expect(screen.getByText(/2026/)).toBeInTheDocument();
    });

    it("shows the document when one is opened", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, [SUMMARY]));
      const { user } = renderHistory();
      await screen.findByText("Pilot Agreement");

      fetchMock.mockResolvedValueOnce(
        jsonResponse(200, { ...SUMMARY, fields: completePilotFields() }),
      );
      await user.click(screen.getByRole("button", { name: "View" }));

      expect(
        await screen.findByRole("region", { name: "Saved agreement" }),
      ).toBeInTheDocument();
    });

    it("comes back to the list again", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, [SUMMARY]));
      const { user } = renderHistory();
      await screen.findByText("Pilot Agreement");

      fetchMock.mockResolvedValueOnce(
        jsonResponse(200, { ...SUMMARY, fields: completePilotFields() }),
      );
      await user.click(screen.getByRole("button", { name: "View" }));
      await screen.findByRole("region", { name: "Saved agreement" });

      fetchMock.mockResolvedValueOnce(jsonResponse(200, [SUMMARY]));
      await user.click(screen.getByRole("button", { name: /My documents/ }));

      expect(await screen.findByRole("heading", { name: "My documents" })).toBeInTheDocument();
    });

    describe("when the list cannot be read", () => {
      it("says what went wrong", async () => {
        fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

        renderHistory();

        expect(await screen.findByRole("alert")).toHaveTextContent(
          /Could not reach the server/,
        );
      });

      it("offers to try again, and does", async () => {
        fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
        const { user } = renderHistory();
        await screen.findByRole("alert");

        fetchMock.mockResolvedValueOnce(jsonResponse(200, [SUMMARY]));
        await user.click(screen.getByRole("button", { name: "Try again" }));

        expect(await screen.findByText("Pilot Agreement")).toBeInTheDocument();
      });

    });

    it("says so when one document cannot be opened", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, [SUMMARY]));
      const { user } = renderHistory();
      await screen.findByText("Pilot Agreement");

      fetchMock.mockResolvedValueOnce(
        jsonResponse(404, { detail: "No saved document with that id." }),
      );
      await user.click(screen.getByRole("button", { name: "View" }));

      await waitFor(() =>
        expect(screen.getByRole("alert")).toHaveTextContent(
          "No saved document with that id.",
        ),
      );
    });
  });
});
