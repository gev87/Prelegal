import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchCurrentAccount, signOutAccount } from "@/lib/account";

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

describe("fetchCurrentAccount", () => {
  it("returns the account the server reports", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: 1, email: "dana@acme.com" }));

    expect(await fetchCurrentAccount()).toEqual({ id: 1, email: "dana@acme.com" });
  });

  it("asks the endpoint that reads the cookie", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: 1, email: "dana@acme.com" }));

    await fetchCurrentAccount();

    expect(fetchMock.mock.calls[0][0]).toContain("/api/auth/me");
  });

  /**
   * The cookie is HttpOnly, so the only way to send it is to let the browser
   * do it — and the browser will not, cross-origin, without this. Missing it
   * works perfectly in the container and signs everyone out under `next dev`.
   */
  it("sends the session cookie", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: 1, email: "dana@acme.com" }));

    await fetchCurrentAccount();

    expect(fetchMock.mock.calls[0][1].credentials).toBe("include");
  });

  it("reads a 401 as nobody being signed in", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { detail: "Sign in." }));

    expect(await fetchCurrentAccount()).toBeNull();
  });

  /** Not being able to ask is not different, here, from being told nobody. */
  it("reads an unreachable server the same way", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    expect(await fetchCurrentAccount()).toBeNull();
  });

  /**
   * An account without an email would reach the shell and render `undefined`
   * across the top of every page.
   */
  it("refuses a body that is not an account", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: 1 }));

    expect(await fetchCurrentAccount()).toBeNull();
  });
});

describe("signOutAccount", () => {
  it("posts to the endpoint that clears the cookie", async () => {
    fetchMock.mockResolvedValue(jsonResponse(204, null));

    await signOutAccount();

    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toContain("/api/auth/signout");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
  });

  /** The caller has already stopped showing an email; an error it cannot act
   *  on is not worth raising. */
  it("does not throw when the server cannot be reached", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(signOutAccount()).resolves.toBeUndefined();
  });
});
