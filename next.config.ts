import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  // Pin the workspace so a package-lock elsewhere on the host cannot make
  // Turbopack infer the wrong project root.
  turbopack: { root: process.cwd() },
  // This repo documents itself in README.md; no generated agent files.
  agentRules: false,
};

export default nextConfig;
