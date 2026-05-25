/** @type {import('next').NextConfig} */
const nextConfig = {
  // Docker standalone output
  output: 'standalone',

  // API proxy to NestJS backend
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.API_URL || 'http://localhost:3001'}/api/:path*`,
      },
    ];
  },
  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '3001',
      },
    ],
  },
};

module.exports = nextConfig;
