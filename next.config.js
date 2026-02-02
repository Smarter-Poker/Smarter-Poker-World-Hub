/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: false, // Disabled - was causing AbortError on Supabase queries
  eslint: { ignoreDuringBuilds: true },

  // Force complete cache invalidation - v20 Diamond Arcade Deploy
  // Build timestamp: 2026-01-24T10:00:00Z
  generateBuildId: async () => {
    return 'build-v20-club-arena-proxy-' + Date.now();
  },

  // Club Arena is served via rewrite proxy from club-arena.vercel.app
  // The Next.js page at pages/hub/club-arena.js has been DELETED to allow this proxy
  async rewrites() {
    return {
      // beforeFiles rewrites run BEFORE filesystem routes are checked
      // This ensures /hub/club-arena is proxied even if a page file existed
      beforeFiles: [
        // Main Club Arena route - proxy to external Vercel app
        {
          source: '/hub/club-arena',
          destination: 'https://club-arena.vercel.app/hub/club-arena',
        },
        // All Club Arena sub-routes
        {
          source: '/hub/club-arena/:path*',
          destination: 'https://club-arena.vercel.app/hub/club-arena/:path*',
        },
      ],
    };
  },
}
