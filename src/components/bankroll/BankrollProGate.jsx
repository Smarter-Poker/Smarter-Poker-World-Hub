/**
 * BANKROLL PRO ACCESS GATE — TRANSPARENT PASSTHROUGH
 * 
 * ═══════════════════════════════════════════════════════════════════════
 * REDESIGNED: March 6, 2026 — Converted to transparent passthrough.
 * Gating is now handled at the ACTION level by the useFeatureGate hook
 * in bankroll-manager.js. This wrapper always renders children so users
 * can explore pro tools before encountering the upgrade popup.
 * ═══════════════════════════════════════════════════════════════════════
 */

export default function BankrollProGate({ children }) {
    // ═══ TRANSPARENT PASSTHROUGH ═══
    // Always render children — action-level gating is handled by useFeatureGate
    return children || null;
}
