import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["ws"],
  turbopack: {
    root: '.',
    resolveAlias: {
      fs: {
        browser: './shims/empty.ts'
      },
      "fs/promises": {
        browser: './shims/empty.ts'
      },
    }

  },
};

export default nextConfig;
