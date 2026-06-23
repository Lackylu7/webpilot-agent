import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["playwright"],
  experimental: {
    serverMinification: false
  }
};

export default nextConfig;
