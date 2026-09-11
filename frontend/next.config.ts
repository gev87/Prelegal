import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * The frontend is built to plain files and served by the FastAPI backend,
   * so that one container serves the whole product from one port and the
   * browser can call /api/... with no CORS involved.
   *
   * This is why app/page.tsx must not be dynamic: an exported page is
   * rendered once, at build time, and there is no server left afterwards to
   * render it again per request.
   */
  output: "export",

  /**
   * Required, not cosmetic. Without it the export writes `out/login.html`,
   * and a request for /login matches no file: FastAPI serves the 404 page
   * instead of the login screen. With it the export writes
   * `out/login/index.html`, which /login resolves to via a redirect to
   * /login/.
   */
  trailingSlash: true,

  /**
   * `next dev` serves its client chunks and HMR socket only to origins it
   * trusts. Reaching the dev server by LAN address (to try the layout on a
   * phone, say) is otherwise blocked: the chunks never load, the page never
   * hydrates, and every button — including Download PDF — does nothing.
   */
  allowedDevOrigins: ["192.168.88.*"],
};

export default nextConfig;
