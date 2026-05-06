import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Strict mode for development
  reactStrictMode: true,

  // Required for Twilio SDK (node-only modules)
  serverExternalPackages: ["twilio"],

  // Security headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
