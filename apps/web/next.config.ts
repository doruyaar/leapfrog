import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // `@leapfrog/core` is consumed only in server components (DB reads) and as erased
  // types. Keep it — and its native / on-device deps — as external `require`s of the
  // built package rather than bundling it, so runtime asset refs (the Drizzle migrations
  // folder) and native bindings resolve from node_modules as they do for the worker.
  serverExternalPackages: [
    '@leapfrog/core',
    'better-sqlite3',
    'sqlite-vec',
    '@xenova/transformers',
  ],
};

export default nextConfig;
