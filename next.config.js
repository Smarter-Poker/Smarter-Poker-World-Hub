/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },

  // Force complete cache invalidation - v19.3 Golden Template Deploy
  // Build timestamp: 2026-01-18T12:48:00Z
  generateBuildId: async () => {
    return 'build-v19-2-baked-assets-' + Date.now();
  },
}
