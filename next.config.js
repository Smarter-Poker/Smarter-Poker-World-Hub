/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },

  // Force complete cache invalidation - v19.2 Baked-in Assets Standard
  // Build timestamp: 2026-01-14T03:35:00Z
  generateBuildId: async () => {
    return 'build-v19-2-baked-assets-' + Date.now();
  },
}
