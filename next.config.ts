import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // NOTE: "standalone" output is for Docker/self-hosted deployments.
  // When deploying to Vercel, the platform uses its own builder.
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  turbopack: {},
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        // dockerode & ssh2 have native deps that can't be bundled for serverless
        config.externals.push("dockerode", "ssh2");
      }
    }
    return config;
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
  // @sparticuz/chromium and puppeteer-core must be external so Vercel
  // includes them in node_modules (not webpack-bundled) — the binary is too large for webpack
  serverExternalPackages: ["dockerode", "ssh2", "@sparticuz/chromium", "puppeteer-core"],
};

export default nextConfig;
