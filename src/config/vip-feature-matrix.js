/**
 * VIP FEATURE MATRIX — Smarter.Poker
 * ═══════════════════════════════════════════════════════════════════════════
 * Comprehensive configuration of which features are FREE, VIP-gated, or
 * DIAMOND-gated across the entire platform.
 * 
 * IMPORTANT: This is the AUDIT DOCUMENT. No enforcement is active until
 * the platform owner explicitly approves the gate map.
 * 
 * Gate Types:
 *   FREE     — available to all authenticated users
 *   VIP      — requires active VIP membership (Stripe or Diamond purchase)
 *   DIAMOND  — costs X diamonds per use or per 24h day pass
 *   MIXED    — base feature is FREE, advanced sub-features are VIP/DIAMOND
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const VIP_FEATURE_MATRIX = {
  // ═══════════════════════════════════════════════════════════════
  // GTO Training Engine
  // ═══════════════════════════════════════════════════════════════
  'gto-training': {
    page: '/hub/training',
    gate: 'MIXED',
    free: [
      'Basic preflop scenarios',
      'Quick warmup mode (3 hands)',
      'Leaderboard viewing',
      'Daily challenge (1 per day)',
    ],
    vip: [
      'Advanced multi-street solver scenarios',
      'Unlimited daily challenges',
      'Full solution explanations with EV breakdown',
      'Autopilot mode (continuous sessions)',
      'Mixed strategy lab',
      'Arena mode (God Mode)',
    ],
    currentState: 'MOSTLY FREE — some games use diamond day-pass via premiumFeatureGate',
  },

  // ═══════════════════════════════════════════════════════════════
  // Poker Near Me Intelligence
  // ═══════════════════════════════════════════════════════════════
  'poker-near-me': {
    page: '/hub/poker-near-me/lobby',
    gate: 'MIXED',
    free: [
      'Browse venue list by location',
      'View live games at venues',
      'View venue detail page',
      'Map view',
      'Save venues',
    ],
    vip: [
      'Historical venue activity trends',
      'Peak hour predictions (heatmap)',
      'Venue comparison tool',
      'Game ETA predictions',
      'Waitlist intelligence',
    ],
    currentState: 'MOSTLY FREE — poker_near_me day-pass exists in premiumFeatureGate FEATURE_CONFIG',
  },

  // ═══════════════════════════════════════════════════════════════
  // Social Feed
  // ═══════════════════════════════════════════════════════════════
  'social-feed': {
    page: '/hub/social-media',
    gate: 'FREE',
    free: [
      'View social feed',
      'Create posts (text, photo, video)',
      'Like, comment, share posts',
      'Follow/unfollow users',
      'Social pages',
    ],
    vip: [
      'Ad-free experience (future)',
      'Priority post visibility in feed (future)',
      'Exclusive creator tools (future)',
    ],
    currentState: 'FREE — no gating in place',
  },

  // ═══════════════════════════════════════════════════════════════
  // Jarvis AI Coach
  // ═══════════════════════════════════════════════════════════════
  'jarvis-ai': {
    page: '/hub/training (Jarvis panel)',
    gate: 'MIXED',
    free: [
      'Basic hand analysis (3 per day)',
      'Strategy tips during training',
    ],
    vip: [
      'Unlimited AI conversations',
      'Post-session debrief',
      'Extended analysis depth',
      'Custom scenario generation',
    ],
    currentState: 'API rate limited per user but no explicit VIP gate',
  },

  // ═══════════════════════════════════════════════════════════════
  // Bankroll Manager
  // ═══════════════════════════════════════════════════════════════
  'bankroll-manager': {
    page: '/hub/bankroll-manager',
    gate: 'MIXED',
    free: [
      'Basic session logging',
      'Win/loss tracking',
      'Simple profit graph',
    ],
    vip: [
      'Advanced analytics dashboard',
      'Leak detection engine',
      'PDF session reports',
      'Toke Tracker Pro tools',
      'Geofence intelligence',
      'Player notes (unlimited)',
    ],
    currentState: 'bankroll_pro day-pass exists — 25 diamonds/24h',
  },

  // ═══════════════════════════════════════════════════════════════
  // Hand History
  // ═══════════════════════════════════════════════════════════════
  'hand-history': {
    page: '/hub/hand-history',
    gate: 'MIXED',
    free: [
      'View last 50 hands',
      'Basic hand replay',
    ],
    vip: [
      'Unlimited hand storage',
      'AI-powered hand analysis',
      'AI screenshot reader (camera import)',
      'Shareable hand cards',
    ],
    currentState: 'FREE — 200 hands loaded, no gate',
  },

  // ═══════════════════════════════════════════════════════════════
  // Video Library
  // ═══════════════════════════════════════════════════════════════
  'video-library': {
    page: '/hub/video-library',
    gate: 'FREE',
    free: [
      'Browse 138+ poker videos',
      'Watch any video',
      'Favorites and Watch Later',
      'Watch progress tracking',
    ],
    vip: [
      'Premium/exclusive content (future)',
      'Ad-free viewing (future)',
      'Jarvis video insights (currently free)',
    ],
    currentState: 'FREE — no gating in place',
  },

  // ═══════════════════════════════════════════════════════════════
  // Personal Assistant (Sandbox)
  // ═══════════════════════════════════════════════════════════════
  'personal-assistant': {
    page: '/hub/personal-assistant',
    gate: 'DIAMOND',
    free: [],
    vip: [
      'Full sandbox features',
      'Socratic coach mode',
      'Auto-villain ranges',
      'Story export',
      'Keyboard shortcuts',
    ],
    currentState: 'personal_assistant day-pass exists — 100 diamonds/24h',
  },

  // ═══════════════════════════════════════════════════════════════
  // Trivia & Preflop Charts
  // ═══════════════════════════════════════════════════════════════
  'trivia': {
    page: '/hub/trivia',
    gate: 'MIXED',
    free: [
      'Daily quiz (1 per day)',
      'View leaderboards',
      'Basic trivia modes',
    ],
    vip: [
      'Unlimited trivia sessions',
      'Tournament entry',
      'Extended daily challenges',
      'PvP Battle mode (unlimited)',
    ],
    currentState: 'Partially gated via diamond economy',
  },

  // ═══════════════════════════════════════════════════════════════
  // Messenger
  // ═══════════════════════════════════════════════════════════════
  'messenger': {
    page: '/hub/messenger',
    gate: 'FREE',
    free: [
      'Direct messaging',
      'Group chats',
      'Media sharing',
    ],
    vip: [
      'Read receipts (future)',
      'Message reactions (future)',
      'Voice messages (future)',
    ],
    currentState: 'FREE — no gating in place',
  },

  // ═══════════════════════════════════════════════════════════════
  // Profile
  // ═══════════════════════════════════════════════════════════════
  'profile': {
    page: '/hub/profile-edit',
    gate: 'MIXED',
    free: [
      'Basic profile editing',
      'Standard avatar',
      'Social links',
      'HendonMob integration',
    ],
    vip: [
      'Custom avatar builder',
      'Premium badges and frames',
      'Enhanced visibility in search',
      'Profile themes (future)',
    ],
    currentState: 'custom_avatar day-pass exists — 25 diamonds/24h',
  },

  // ═══════════════════════════════════════════════════════════════
  // Diamond Store
  // ═══════════════════════════════════════════════════════════════
  'diamond-store': {
    page: '/hub/diamond-store',
    gate: 'FREE',
    free: ['Browse and purchase diamond bundles', 'View merchandise', 'VIP subscription'],
    vip: [],
    currentState: 'FREE — this IS the monetization page',
  },

  // ═══════════════════════════════════════════════════════════════
  // Geeves Help Bot
  // ═══════════════════════════════════════════════════════════════
  'geeves': {
    page: 'Global widget',
    gate: 'FREE',
    free: ['Basic help questions', 'Platform guidance', 'Knowledge base'],
    vip: ['Priority support queue (future)', 'Extended AI coaching (future)'],
    currentState: 'FREE — always available',
  },

  // ═══════════════════════════════════════════════════════════════
  // Lives (LiveKit)
  // ═══════════════════════════════════════════════════════════════
  'lives': {
    page: '/hub/lives',
    gate: 'DIAMOND',
    free: [],
    vip: ['Watch live streams', 'Go live from the rail', 'Live chat'],
    currentState: 'lives day-pass exists — 25 diamonds/24h',
  },

  // ═══════════════════════════════════════════════════════════════
  // News
  // ═══════════════════════════════════════════════════════════════
  'news': {
    page: '/hub/news',
    gate: 'FREE',
    free: ['Browse poker news', 'Read articles', 'Share articles'],
    vip: [],
    currentState: 'FREE — no gating',
  },

  // ═══════════════════════════════════════════════════════════════
  // Club Commander
  // ═══════════════════════════════════════════════════════════════
  'club-commander': {
    page: 'https://commander.smarter.poker/commander/login',
    gate: 'VIP',
    free: [],
    vip: ['Full club management', 'Tournament director', 'Staff management', 'Analytics'],
    currentState: 'Requires Club Commander subscription (separate Stripe product) — standalone app at commander.smarter.poker',
  },

  // ═══════════════════════════════════════════════════════════════
  // Daily All-Access Pass
  // ═══════════════════════════════════════════════════════════════
  'daily-unlock-all': {
    page: '/hub/diamond-store',
    gate: 'DIAMOND',
    cost: 150,
    free: [],
    vip: ['24h access to ALL pay-as-you-go features'],
    currentState: 'ACTIVE — 150 diamonds for 24h universal unlock',
  },
};

/**
 * Get the gate configuration for a specific feature
 */
export function getFeatureGate(featureKey) {
  return VIP_FEATURE_MATRIX[featureKey] || null;
}

/**
 * Get all features grouped by gate type
 */
export function getFeaturesByGateType() {
  const grouped = { FREE: [], VIP: [], DIAMOND: [], MIXED: [] };
  Object.entries(VIP_FEATURE_MATRIX || {}).forEach(([key, config]) => {
    grouped[config.gate]?.push({ key, ...config });
  });
  return grouped;
}

/**
 * Summary counts for the audit
 */
export function getFeatureGateSummary() {
  const entries = Object.entries(VIP_FEATURE_MATRIX || {});
  return {
    total: entries.length,
    free: entries.filter(([, c]) => c.gate === 'FREE').length,
    vip: entries.filter(([, c]) => c.gate === 'VIP').length,
    diamond: entries.filter(([, c]) => c.gate === 'DIAMOND').length,
    mixed: entries.filter(([, c]) => c.gate === 'MIXED').length,
  };
}
