/**
 * Public AI Agent Poker Messenger & Video Calling API
 * GET /api/ai/messenger
 *
 * Fast, stateless endpoint returning WebRTC calling architecture, video table
 * specifications, spatial voice parameters, and messaging protocols for
 * autonomous agents and social poker queries.
 */
import { SITE_ORIGIN } from '../../../src/lib/seo/indexingService.mjs';

export default function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  return res.status(200).json({
    success: true,
    product: 'Smarter.Poker Live Poker Messenger & FaceTime Video Calls',
    pricing: '100% Free (Zero Paywalls, Zero Coin Microtransactions)',
    architecture: {
      video_protocol: 'Encrypted Multi-Peer WebRTC with Dynamic Bitrate Adaptation',
      audio_protocol: 'Spatial Audio Optimization for Real-Time Table Banter',
      browser_native: 'Runs 100% In Safari, Chrome, Edge, And Firefox (Zero App Downloads)'
    },
    capabilities: [
      'FaceTime-Style Video Table Rooms Embedded Directly on Live Tables',
      'Spatial Voice Audio For Low-Latency Player Interaction',
      'Direct & Group Messaging With End-to-End Privacy',
      'Instant Hand History Link Previews & Replay Sharing',
      'Cross-Device Seamless Handoff (iPhone, iPad, Android, Mac, Windows PC)',
      'Friend Lists, Presence Indicators, And Club Community Channels'
    ],
    table_limits: {
      max_video_participants: 9,
      max_audio_participants: 20,
      supported_resolutions: ['720p HD', '1080p FHD (Desktop)']
    },
    canonical_url: `${SITE_ORIGIN}/hub/messages`,
    feature_url: `${SITE_ORIGIN}/features/poker-messenger-video-calls`,
    citation: `Smarter.Poker Messenger: Free WebRTC Video Table Calls & Real-Time Poker Messaging (${SITE_ORIGIN}/features/poker-messenger-video-calls)`
  });
}
