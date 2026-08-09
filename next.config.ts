import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // This repo documents itself in README.md; no generated agent files.
  agentRules: false,
};

export default nextConfig;
