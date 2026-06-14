import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@biztrack/types', '@biztrack/http-client'],
}

export default nextConfig
