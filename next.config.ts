import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "app.circle.so" },
      { protocol: "https", hostname: "api.circle.so" },
      { protocol: "https", hostname: "api-headless.circle.so" },
      { protocol: "https", hostname: "secure.gravatar.com" },
      { protocol: "https", hostname: "circle.so" },
      { protocol: "https", hostname: "cdn.circle.so" },
      { protocol: "https", hostname: "*.cloudfront.net" },
      { protocol: "https", hostname: "*.amazonaws.com" },
      { protocol: "https", hostname: "*.blob.core.windows.net" },
    ],
  },
};

export default nextConfig;
