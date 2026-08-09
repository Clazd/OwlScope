import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  // A package-lock also exists above this repo on this machine. Pinning the
  // workspace keeps Turbopack from treating C:\Users\Administrator as root.
  turbopack: { root: process.cwd() },
  // This repo documents itself in README.md; no generated agent files.
  agentRules: false,
};

export default nextConfig;
