import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // The method page became /methods when decision records and the AI use
  // statement joined it; keep old links working.
  async redirects() {
    return [{ source: "/method", destination: "/methods", permanent: true }];
  },
  // The read-only analytics database is opened with node:sqlite at request time
  // (Explorer, Distinctive words, Term timeline), so it must ship with every
  // server function.
  outputFileTracingIncludes: {
    "/**": ["./data/analytics.db"],
    // Read with fs by the social-sharing image.
    "/opengraph-image": ["./src/app/fonts/*.woff"],
  },
  outputFileTracingRoot: path.join(__dirname),
  turbopack: {
    root: path.join(__dirname),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
