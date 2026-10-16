import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  // Allow this development machine's LAN address to load HMR and dev assets.
  allowedDevOrigins: ["192.168.1.192"],
  outputFileTracingRoot: process.cwd(),
  turbopack: { root: process.cwd() },
  experimental: { serverActions: { bodySizeLimit: "1mb" } },
};
export default config;
