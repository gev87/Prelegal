import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AccountProvider, { useAccount } from "@/components/AccountProvider";

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

/** Shows what the context holds, so the tests can read it off the screen
 *  rather than reaching into React. */
function Showing() {
  const { status, account, signIn, signOut } = useAccount();

  return (
    <div>
      <p data-testid="status">{status}</p>
      <p data-testid="email">{account?.email ?? "nobody"}</p>
      <button type="button" onClick={() => signIn({ id: 2, email: "new@acme.com" })}>
        Pretend to sign in
      </button>
      <button type="button" onClick={signOut}>
        Sign out
      </button>
    </div>
  );
}

function renderProvider() {
  return {
    user: userEvent.setup(),
    ...render(
      <AccountProvider>
        <Showing />
      </AccountProvider>,
    ),
  };
}

describe("AccountProvider", () => {
  it("asks the server who is signed in", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, {}));
    renderProvider();

    await waitFor(() =>
      expect(fetchMock.mock.calls[0][0]).toContain("/api/auth/me"),
    );
  });

  /**
   * Before the answer arrives the page genuinely does not know. Starting at
   * "guest" instead would show a Sign in link to everybody for a frame, on
   * every load.
   */
  it("starts out not knowing", () => {
    fetchMock.mockResolvedValue(jsonResponse(401, {}));
    renderProvider();

    expect(screen.getByTestId("status")).toHaveTextContent("loading");
  });

  it("settles on the account the server reports", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: 1, email: "dana@acme.com" }));
    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("signed-in"),
    );
    expect(screen.getByTestId("email")).toHaveTextContent("dana@acme.com");
  });

  it("settles on a guest when nobody is", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, {}));
    renderProvider();

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("guest"));
  });

  /** The login screen already has the account in the signup/signin reply, so
   *  telling the context is cheaper and faster than asking `/me` again. */
  it("takes the account the login screen hands it", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, {}));
    const { user } = renderProvider();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("guest"));

    await user.click(screen.getByRole("button", { name: "Pretend to sign in" }));

    expect(screen.getByTestId("status")).toHaveTextContent("signed-in");
    expect(screen.getByTestId("email")).toHaveTextContent("new@acme.com");
  });

  it("clears the account when signing out", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: 1, email: "dana@acme.com" }));
    const { user } = renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("signed-in"),
    );

    fetchMock.mockResolvedValue(jsonResponse(204, null));
    await user.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("guest"));
    expect(screen.getByTestId("email")).toHaveTextContent("nobody");
  });

  /**
   * A component outside the provider would otherwise show every visitor a
   * permanent "Sign in" link, and look like a backend fault rather than a
   * missing wrapper.
   */
  it("refuses to be used without the provider", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => render(<Showing />)).toThrow(/AccountProvider/);

    quiet.mockRestore();
  });

  /**
   * The race that the `settled` ref exists for.
   *
   * The provider asks the server who is signed in the moment the page loads —
   * before any cookie exists. A visitor who reaches the login screen and signs
   * in while that first request is still in flight gets a reply saying
   * "nobody", which is true of the moment it was sent and wrong by the time it
   * lands. Without the guard it would win, and somebody who had just signed in
   * would be shown a Sign in link while every request they made was in fact
   * authenticated.
   */
  it("does not let a slow 'nobody' overwrite a sign-in that has already happened", async () => {
    let answerTheFirstAsk: (response: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        answerTheFirstAsk = resolve;
      }),
    );

    const { user } = renderProvider();
    expect(screen.getByTestId("status")).toHaveTextContent("loading");

    await user.click(screen.getByRole("button", { name: "Pretend to sign in" }));
    expect(screen.getByTestId("status")).toHaveTextContent("signed-in");

    // The reply to the question asked before the cookie existed.
    answerTheFirstAsk(jsonResponse(401, {}));

    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("signed-in"),
    );
    expect(screen.getByTestId("email")).toHaveTextContent("new@acme.com");
  });

  /** The same crossing, the other way round: signing out before the first
   *  answer arrives must not be undone by it saying somebody is here. */
  it("does not let a slow account overwrite a sign-out", async () => {
    let answerTheFirstAsk: (response: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        answerTheFirstAsk = resolve;
      }),
    );

    const { user } = renderProvider();
    fetchMock.mockResolvedValue(jsonResponse(204, null));
    await user.click(screen.getByRole("button", { name: "Sign out" }));

    answerTheFirstAsk(jsonResponse(200, { id: 1, email: "dana@acme.com" }));

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("guest"));
    expect(screen.getByTestId("email")).toHaveTextContent("nobody");
  });
});
