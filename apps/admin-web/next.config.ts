import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: [
    '@biztrack/types',
    '@biztrack/utils',
    '@biztrack/validators',
  ],
}

export default nextConfig
