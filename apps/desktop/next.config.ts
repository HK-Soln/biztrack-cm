import type { NextConfig } from "next"
import { resolve } from "path"

const nextConfig: NextConfig = {
  output: "export",
  distDir: "dist/next",
  images: { unoptimized: true },
  experimental: {
    outputFileTracingRoot: resolve(__dirname, "../../"),
  },
  transpilePackages: ["@biztrack/types", "@biztrack/utils", "@biztrack/ui"],
}

export default nextConfig
