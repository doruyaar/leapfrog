import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // `@leapfrog/core` is a workspace package consumed as source-adjacent TS via its
  // built types; transpile it so the web app can import shared constants/types directly.
  transpilePackages: ['@leapfrog/core'],
};

export default nextConfig;
