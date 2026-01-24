/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: false, // Disabled - was causing AbortError on Supabase queries
  eslint: { ignoreDuringBuilds: true },

  // Force complete cache invalidation - v20 Diamond Arcade Deploy
  // Build timestamp: 2026-01-24T10:00:00Z
  generateBuildId: async () => {
    return 'build-v19-2-baked-assets-' + Date.now();
  },
}
