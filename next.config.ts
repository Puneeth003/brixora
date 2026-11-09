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
    // Serve images as-is. Hostinger returned 503 from the /_next/image optimiser
    // (listing galleries and the hero headline went blank), and listing photos are
    // already resized and converted to WebP at upload time (src/lib/images.ts).
    unoptimized: true,
  },
};

export default nextConfig;
