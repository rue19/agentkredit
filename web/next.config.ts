import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /* The Hardhat package one level up also has a lockfile; pin the root here. */
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
