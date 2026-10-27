import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Native / Node-only modules; keep them out of the server bundle.
  serverExternalPackages: ["sharp", "mysql2"],
  experimental: {
    // Photos are compressed in the browser and uploaded one per request.
    serverActions: { bodySizeLimit: "8mb" },
  },
  images: {
    qualities: [75, 90],
    // Listing photos are served by this app at /media/… (see src/app/media).
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
