/**
 * 🎨 useTrainingTheme — Training Visual Standards
 * ═══════════════════════════════════════════════════════════════════
 * Centralizes ALL visual constants for the Training Hand Scenario Player.
 * 
 * Based on:
 * - Facebook Dark color schema (metalStyles.js)
 * - Golden Template table styling
 * - Standard 2-color deck (red/black)
 * - PokerBros action tag colors
 * ═══════════════════════════════════════════════════════════════════
 */

import { useMemo } from 'react';

// =============================================================================
// FACEBOOK DARK COLOR PALETTE (from metalStyles.js)
// =============================================================================

export const FACEBOOK_DARK = {
    // Core backgrounds
    darkest: '#18191a',    // Deepest background
    base: '#242526',       // Standard surface
    mid: '#3a3b3c',        // Elevated surfaces
    highlight: '#4e4f50',  // Borders and dividers
    light: '#65676b',      // Secondary text

    // Facebook blue accent
    primary: '#2374e1',    // Facebook blue
    primaryGlow: 'rgba(35, 116, 225, 0.4)',
    primaryDim: 'rgba(35, 116, 225, 0.15)',

    // Status colors
    success: '#31a24c',    // Facebook green
    successGlow: 'rgba(49, 162, 76, 0.4)',
    warning: '#f7b928',    // Facebook warning
    warningGlow: 'rgba(247, 185, 40, 0.4)',
    danger: '#f02849',     // Facebook red
    dangerGlow: 'rgba(240, 40, 73, 0.4)',

    // Premium accents
    gold: '#f7b928',
    goldGlow: 'rgba(247, 185, 40, 0.4)',

    // Text colors
    textPrimary: '#e4e6eb',
    textSecondary: '#b0b3b8',
    textMuted: '#8a8d91',
};

// =============================================================================
// ACTION TAG COLORS (PokerBros Standard)
// =============================================================================

export const ACTION_COLORS = {
    call: { bg: '#22c55e', text: '#fff', label: 'Call' },       // Green
    raise: { bg: '#eab308', text: '#000', label: 'Raise' },     // Yellow
    bet: { bg: '#eab308', text: '#000', label: 'Bet' },         // Yellow
    allIn: { bg: '#a855f7', text: '#fff', label: 'All In' },    // Purple
    all_in: { bg: '#a855f7', text: '#fff', label: 'All In' },   // Purple
    check: { bg: '#3b82f6', text: '#fff', label: 'Check' },     // Blue
    fold: { bg: '#6b7280', text: '#fff', label: 'Fold' },       // Gray
    post_sb: { bg: '#6b7280', text: '#fff', label: 'SB' },      // Gray
    post_bb: { bg: '#6b7280', text: '#fff', label: 'BB' },      // Gray
    post_ante: { bg: '#6b7280', text: '#fff', label: 'Ante' },  // Gray
};

// =============================================================================
// SUIT COLORS (Standard 2-Color Deck - Matches Golden Template/Club Arena)
// =============================================================================

export const SUIT_COLORS = {
    s: { color: '#1a1a2e', symbol: '♠', name: 'spades' },     // Spades - Black
    h: { color: '#cc0000', symbol: '♥', name: 'hearts' },     // Hearts - Red
    c: { color: '#1a1a2e', symbol: '♣', name: 'clubs' },      // Clubs - Black
    d: { color: '#cc0000', symbol: '♦', name: 'diamonds' },   // Diamonds - Red
};

// =============================================================================
// GOLDEN TEMPLATE TABLE COLORS
// =============================================================================

export const TABLE_COLORS = {
    // Felt and table
    felt: FACEBOOK_DARK.darkest,
    feltGradient: `radial-gradient(ellipse at 50% 35%, ${FACEBOOK_DARK.base} 0%, ${FACEBOOK_DARK.darkest} 50%, #080808 100%)`,
    rail: {
        outer: 'linear-gradient(180deg, #f0d050 0%, #d4a000 25%, #a07800 60%, #705000 100%)',
        inner: 'linear-gradient(180deg, #ffe070 0%, #e8b810 25%, #b08000 60%, #785500 100%)',
    },

    // Pot and chips
    pot: {
        bg: FACEBOOK_DARK.mid,
        border: FACEBOOK_DARK.highlight,
        text: FACEBOOK_DARK.textPrimary,
    },

    // Active player glow
    activeGlow: FACEBOOK_DARK.primary,
    heroGlow: '#00d4ff',
};

// =============================================================================
// MAIN HOOK
// =============================================================================

export default function useTrainingTheme() {
    const theme = useMemo(() => ({
        // Facebook Dark palette
        colors: FACEBOOK_DARK,

        // Action tag colors
        actionColors: ACTION_COLORS,

        // Suit colors (2-color deck)
        suitColors: SUIT_COLORS,

        // Table styling
        table: TABLE_COLORS,

        // Typography
        fonts: {
            primary: "'Inter', -apple-system, sans-serif",
            display: "'Orbitron', 'Courier New', monospace",
            brand: "'Rajdhani', sans-serif",
        },

        // Component styles
        questionBar: {
            background: `linear-gradient(180deg, ${FACEBOOK_DARK.mid} 0%, ${FACEBOOK_DARK.base} 100%)`,
            borderColor: FACEBOOK_DARK.primary,
            text: FACEBOOK_DARK.textPrimary,
            accent: FACEBOOK_DARK.primary,
        },

        answerGrid: {
            background: `linear-gradient(180deg, ${FACEBOOK_DARK.base} 0%, ${FACEBOOK_DARK.darkest} 100%)`,
            buttonIdle: {
                bg: `linear-gradient(180deg, ${FACEBOOK_DARK.mid} 0%, ${FACEBOOK_DARK.base} 100%)`,
                border: FACEBOOK_DARK.highlight,
                text: FACEBOOK_DARK.primary,
            },
            buttonCorrect: {
                bg: `linear-gradient(180deg, #1a5a3a 0%, #0d4028 100%)`,
                border: FACEBOOK_DARK.success,
                text: FACEBOOK_DARK.success,
            },
            buttonIncorrect: {
                bg: `linear-gradient(180deg, #5a2a2a 0%, #4a1a1a 100%)`,
                border: FACEBOOK_DARK.danger,
                text: FACEBOOK_DARK.danger,
            },
        },

        // Feedback overlay
        feedback: {
            overlay: 'rgba(0, 0, 0, 0.85)',
            card: `linear-gradient(180deg, ${FACEBOOK_DARK.base}, ${FACEBOOK_DARK.darkest})`,
            correct: FACEBOOK_DARK.success,
            incorrect: FACEBOOK_DARK.danger,
        },

        // Debug overlay
        debug: {
            bg: 'rgba(0, 0, 0, 0.9)',
            text: '#0f0',
            border: FACEBOOK_DARK.highlight,
        },
    }), []);

    return theme;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Parse a card string like "Ah" into { rank, suit, color, symbol }
 */
export function parseCard(cardStr) {
    if (!cardStr || cardStr.length < 2) return null;
    const rank = cardStr.slice(0, -1).toUpperCase();
    const suit = cardStr.slice(-1).toLowerCase();
    const suitData = SUIT_COLORS[suit];
    if (!suitData) return null;
    return { rank, suit, ...suitData };
}

/**
 * Get action color config for an action type
 */
export function getActionColor(action) {
    const key = action?.toLowerCase()?.replace('-', '_');
    return ACTION_COLORS[key] || ACTION_COLORS.fold;
}
