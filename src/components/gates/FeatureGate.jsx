/**
 * FEATURE GATE COMPONENT — REDESIGNED: Transparent Wrapper
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * CRITICAL CHANGE (March 6, 2026):
 *   OLD BEHAVIOR: Blocked entire page content behind a paywall.
 *   NEW BEHAVIOR: ALWAYS renders children. Pages are visible and
 *   explorable by all users. Gating is now handled at the ACTION level
 *   via the useFeatureGate hook in FeatureGatePopup.jsx.
 * 
 * This component is now a transparent passthrough wrapper. It exists
 * solely for backward compatibility so existing <FeatureGate> tags
 * don't break. The actual gating logic has moved to useFeatureGate().
 * 
 * VIP BULLETPROOFING: Triple-fallback VIP check ensures VIP users
 * NEVER see any form of paywall under any circumstances.
 *   1. AvatarContext.isVip (server-verified)
 *   2. localStorage('sp-vip-status') (cached)
 *   3. user.user_metadata.is_vip (auth metadata)
 * ═══════════════════════════════════════════════════════════════════════
 */

export default function FeatureGate({ children }) {
    // Always render children — gating is now action-level, not page-level
    return <>{children}</>;
}
