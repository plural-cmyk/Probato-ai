import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  turbopack: {},
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Mark dockerode/ssh2 native modules as external for webpack
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
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
  serverExternalPackages: ["dockerode", "ssh2"],
};

export default nextConfig;
