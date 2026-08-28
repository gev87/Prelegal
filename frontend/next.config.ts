import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * `next dev` serves its client chunks and HMR socket only to origins it
   * trusts. Reaching the dev server by LAN address (to try the layout on a
   * phone, say) is otherwise blocked: the chunks never load, the page never
   * hydrates, and every button — including Download PDF — does nothing.
   */
  allowedDevOrigins: ["192.168.88.*"],
};

export default nextConfig;
