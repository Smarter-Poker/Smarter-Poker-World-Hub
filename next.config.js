/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: false, // Disabled - was causing AbortError on Supabase queries
  eslint: { ignoreDuringBuilds: true },

  // Force complete cache invalidation - v20 Diamond Arcade Deploy
  // Build timestamp: 2026-01-24T10:00:00Z
  generateBuildId: async () => {
    return 'build-v19-2-baked-assets-' + Date.now();
  },

  // Club Arena rewrites - MUST be in next.config.js with beforeFiles
  // to take precedence over dynamic [orbId].js route
  async rewrites() {
    return {
      beforeFiles: [
        // Club Arena - served from club.smarter.poker
        {
          source: '/hub/club-arena',
          destination: 'https://club-arena.vercel.app/',
        },
        {
          source: '/hub/club-arena/:path*',
          destination: 'https://club-arena.vercel.app/:path*',
        },
      ],
    };
  },
}

