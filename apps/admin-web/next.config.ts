import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: [
    '@biztrack/ui',
    '@biztrack/types',
    '@biztrack/utils',
    '@biztrack/validators',
  ],
}

export default nextConfig
