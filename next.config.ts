import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow dev server access from local network IPs (not just localhost).
  // Without this, the HMR WebSocket handshake fails on non-localhost origins,
  // which prevents React hydration — making buttons completely non-functional.
  allowedDevOrigins: ["192.168.1.73"],

  // Turbopack (default in Next.js 16) handles browser polyfills differently.
  // simple-peer needs Buffer and stream in the browser bundle.
  // These are handled via the resolveAlias config for Turbopack.
  turbopack: {
    resolveAlias: {
      // Polyfill Node.js built-ins for browser bundles
      stream: "stream-browserify",
      buffer: "buffer",
      process: "process/browser",
    },
  },
};

export default nextConfig;
