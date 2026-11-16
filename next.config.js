/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb'
    }
  },
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost'
      }
    ]
  },
  async headers() {
    return [{
      source: '/uploads/messages/:path*',
      headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }],
    }]
  },
}

module.exports = nextConfig
