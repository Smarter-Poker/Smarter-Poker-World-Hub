/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: false, // Disabled - was causing AbortError on Supabase queries
  eslint: { ignoreDuringBuilds: true },

  // Force complete cache invalidation - v20 Diamond Arcade Deploy
  // Build timestamp: 2026-01-24T10:00:00Z
  generateBuildId: async () => {
    return 'build-v19-2-baked-assets-' + Date.now();
  },

  // Club Arena static assets are proxied from the Club Arena Vercel deployment
  // The pages/hub/club-arena.js pages render the UI, but images/videos come from club-arena.vercel.app
  async rewrites() {
    return [
      // Club Arena images (action bar, tiles, cards, etc.)
      {
        source: '/hub/club-arena/images/:path*',
        destination: 'https://club-arena.vercel.app/images/:path*',
      },
      // Club Arena videos
      {
        source: '/hub/club-arena/videos/:path*',
        destination: 'https://club-arena.vercel.app/videos/:path*',
      },
      // Club Arena manifest and other static files
      {
        source: '/hub/club-arena/manifest.json',
        destination: 'https://club-arena.vercel.app/manifest.json',
      },
    ];
  },
}
