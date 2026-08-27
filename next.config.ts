import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  deploymentId: process.env.DEPLOYMENT_VERSION,
  experimental: {
    // Keep visited dynamic pages in the browser's in-memory Router Cache.
    // Cloud data is still refreshed when users revisit a dashboard route.
    staleTimes: {
      dynamic: 300,
    },
  },
};

export default nextConfig;
