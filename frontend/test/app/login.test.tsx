import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import LoginPage from "@/app/login/page";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

/** `next/link` renders an anchor; that is all this screen needs from it. */
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  push.mockClear();
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

async function fillIn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Email"), "dana@acme.com");
  await user.type(screen.getByLabelText("Password"), "correct-horse");
}

describe("login screen", () => {
  it("signs in against the API", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(jsonResponse(200, { id: 1, email: "dana@acme.com" }));
    render(<LoginPage />);

    await fillIn(user);
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/auth/signin");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      email: "dana@acme.com",
      password: "correct-horse",
    });
  });

  it("enters the platform once signed in", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(jsonResponse(200, { id: 1, email: "dana@acme.com" }));
    render(<LoginPage />);

    await fillIn(user);
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
  });

  it("posts to the signup endpoint after switching mode", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(jsonResponse(201, { id: 1, email: "dana@acme.com" }));
    render(<LoginPage />);

    await user.click(screen.getByRole("button", { name: /Sign up/ }));
    await fillIn(user);
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock.mock.calls[0][0]).toContain("/api/auth/signup");
  });

  it("shows the reason the server gave", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      jsonResponse(409, { detail: "An account with that email already exists." }),
    );
    render(<LoginPage />);

    await fillIn(user);
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "An account with that email already exists.",
    );
    expect(push).not.toHaveBeenCalled();
  });

  /**
   * FastAPI reports a rejected value with `detail` as a list, not a string.
   * Rendering it directly would show "[object Object]" to the user.
   */
  it("reads a validation error's message out of its list", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      jsonResponse(422, {
        detail: [{ loc: ["body", "email"], msg: "value is not a valid email address" }],
      }),
    );
    render(<LoginPage />);

    await fillIn(user);
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "value is not a valid email address",
    );
  });

  it("explains an unreachable server rather than failing silently", async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<LoginPage />);

    await fillIn(user);
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not reach the server.",
    );
  });

  it("clears a stale error when the mode changes", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(jsonResponse(401, { detail: "No match." }));
    render(<LoginPage />);

    await fillIn(user);
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Sign up/ }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  /**
   * The screen is not a gate. This link is the whole of PL-4's "no
   * authentication, just bring the user into the platform" — it must never
   * depend on the form, and must never call the API.
   */
  it("offers a way in that does not touch the API", async () => {
    render(<LoginPage />);

    const skip = screen.getByRole("link", { name: "Continue without an account" });

    expect(skip).toHaveAttribute("href", "/");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
