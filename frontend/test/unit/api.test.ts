import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `apiUrl` branches on `process.env.NODE_ENV`, which the bundler substitutes
 * at build time, so each case needs the module re-imported with the
 * environment already set.
 */
async function importApiUrl(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      vi.stubEnv(key, "");
    } else {
      vi.stubEnv(key, value);
    }
  }
  return (await import("@/lib/api")).apiUrl;
}

beforeEach(() => {
  Object.defineProperty(window, "location", {
    writable: true,
    value: { protocol: "http:", hostname: "localhost", port: "3000" } as Location,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("apiUrl", () => {
  it("is relative in production, where one server answers both", async () => {
    const apiUrl = await importApiUrl({ NODE_ENV: "production" });

    expect(apiUrl("/api/auth/signin")).toBe("/api/auth/signin");
  });

  it("points at the API's own port in development", async () => {
    const apiUrl = await importApiUrl({ NODE_ENV: "development" });

    expect(apiUrl("/api/auth/signin")).toBe("http://localhost:8000/api/auth/signin");
  });

  /**
   * Reaching the dev server by LAN address has to reach the API at the same
   * address — a hardcoded "localhost" would send the phone's request to the
   * phone.
   */
  it("follows the hostname the page was loaded from", async () => {
    Object.defineProperty(window, "location", {
      writable: true,
      value: { protocol: "http:", hostname: "192.168.88.21", port: "3000" } as Location,
    });
    const apiUrl = await importApiUrl({ NODE_ENV: "development" });

    expect(apiUrl("/api/auth/signup")).toBe("http://192.168.88.21:8000/api/auth/signup");
  });

  it("prefers an explicitly configured base URL", async () => {
    const apiUrl = await importApiUrl({
      NODE_ENV: "development",
      NEXT_PUBLIC_API_BASE_URL: "https://api.example.com",
    });

    expect(apiUrl("/api/auth/signin")).toBe("https://api.example.com/api/auth/signin");
  });
});

describe("apiFetch", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true } as Response);
    vi.stubGlobal("fetch", fetchMock);
  });

  /**
   * The reason this wrapper exists at all. The session cookie is HttpOnly, so
   * only the browser can send it, and cross-origin it will not without this.
   * A call that forgets it works perfectly in the container — one origin — and
   * silently signs the developer out under `next dev`, which is the worst way
   * round for a bug to behave.
   */
  it("sends credentials on every call", async () => {
    const { apiFetch } = await import("@/lib/api");

    await apiFetch("/api/auth/me");

    expect(fetchMock.mock.calls[0][1].credentials).toBe("include");
  });

  it("asks for JSON so FastAPI parses the body", async () => {
    const { apiFetch } = await import("@/lib/api");

    await apiFetch("/api/documents", { method: "POST", body: "{}" });

    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      "Content-Type": "application/json",
    });
  });

  it("lets a caller override the headers it sets", async () => {
    const { apiFetch } = await import("@/lib/api");

    await apiFetch("/api/documents", { headers: { "Content-Type": "text/plain" } });

    expect(fetchMock.mock.calls[0][1].headers["Content-Type"]).toBe("text/plain");
  });

  it("resolves the path the same way apiUrl does", async () => {
    const { apiFetch, apiUrl } = await import("@/lib/api");

    await apiFetch("/api/chat");

    expect(fetchMock.mock.calls[0][0]).toBe(apiUrl("/api/chat"));
  });
});
