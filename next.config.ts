import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Native / Node-only modules; keep them out of the server bundle.
  serverExternalPackages: ["sharp", "mysql2"],
  experimental: {
    // Hostinger's build box reports dozens of CPUs but has little memory; one worker
    // per CPU (54) aborted page generation with SIGABRT. Two workers is plenty for ~50 pages.
    cpus: 2,
    // Photos are compressed in the browser and uploaded one per request; WhatsApp
    // template samples (video / PDF) can be up to 8 MB plus the form overhead.
    serverActions: { bodySizeLimit: "10mb" },
  },
  images: {
    // Serve images as-is. Hostinger returned 503 from the /_next/image optimiser
    // (listing galleries and the hero headline went blank), and listing photos are
    // already resized and converted to WebP at upload time (src/lib/images.ts).
    unoptimized: true,
  },
  headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // HTTPS only from now on (no includeSubDomains: other subdomains may not have TLS).
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
          // No one may show our pages inside a frame (clickjacking the admin panel).
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Location is used by the owner's map pin and the auditor's site visit.
          { key: "Permissions-Policy", value: "geolocation=(self), microphone=(), payment=(), usb=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
