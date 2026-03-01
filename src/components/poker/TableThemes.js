/**
 * TableThemes — Poker table theme system
 * ═══════════════════════════════════════════
 * 
 * 8 pre-built themes covering casino aesthetics:
 *   Classic Green, Royal Blue, Casino Red, Midnight Purple,
 *   Ocean Teal, Gold Luxury, Dark Night, Emerald
 * 
 * Each theme defines: felt, rail, accent, UI colors, card back
 * Stored in localStorage for persistence across sessions
 */

export const TABLE_THEMES = {
  classicGreen: {
    id: 'classicGreen',
    label: 'Classic Green',
    preview: '#0f2912',
    cardBack: '/images/card-backs/blue.jpg',
    
    feltDark: '#0c1a0e',
    feltGrad1: '#0a1f0d',
    feltGrad2: '#0f2912',
    railColor: '#FFD700',
    railColorDark: '#B8860B',
    edgeGlow: 'rgba(255,215,0,0.15)',

    bgDark: '#050505',
    bgCard: '#0e0e12',
    bgPanel: '#111116',
    accent: '#FFD700',
    accentDim: '#B8860B',
    textPrimary: '#f0f0f0',
    textSecondary: '#8a8a9a',
    textMuted: '#555566',

    foldRed: '#dc2626',
    checkBlue: '#2563eb',
    callGreen: '#16a34a',
    betOrange: '#ea580c',
    raiseYellow: '#eab308',
    allInPurple: '#9333ea',

    timerWarning: '#ef4444',
    timerNormal: '#22c55e',
    disconnected: '#6b7280',
    sittingOut: '#4b5563',
  },

  royalBlue: {
    id: 'royalBlue',
    label: 'Royal Blue',
    preview: '#0a1628',
    cardBack: '/images/card-backs/red.jpg',

    feltDark: '#060e1c',
    feltGrad1: '#0a1628',
    feltGrad2: '#0e2040',
    railColor: '#c0c0c0',
    railColorDark: '#808080',
    edgeGlow: 'rgba(192,192,192,0.15)',

    bgDark: '#030810',
    bgCard: '#0a1018',
    bgPanel: '#0c1220',
    accent: '#60a5fa',
    accentDim: '#2563eb',
    textPrimary: '#e8ecf4',
    textSecondary: '#7b8ca8',
    textMuted: '#4a5568',

    foldRed: '#ef4444',
    checkBlue: '#3b82f6',
    callGreen: '#22c55e',
    betOrange: '#f97316',
    raiseYellow: '#fbbf24',
    allInPurple: '#a78bfa',

    timerWarning: '#ef4444',
    timerNormal: '#22c55e',
    disconnected: '#6b7280',
    sittingOut: '#4b5563',
  },

  casinoRed: {
    id: 'casinoRed',
    label: 'Casino Red',
    preview: '#2a0a0a',
    cardBack: '/images/card-backs/black.jpg',

    feltDark: '#1a0505',
    feltGrad1: '#2a0a0a',
    feltGrad2: '#3d1010',
    railColor: '#FFD700',
    railColorDark: '#B8860B',
    edgeGlow: 'rgba(255,215,0,0.12)',

    bgDark: '#0a0202',
    bgCard: '#150808',
    bgPanel: '#1a0a0a',
    accent: '#FFD700',
    accentDim: '#B8860B',
    textPrimary: '#f5e8e8',
    textSecondary: '#a08080',
    textMuted: '#604848',

    foldRed: '#fca5a5',
    checkBlue: '#60a5fa',
    callGreen: '#4ade80',
    betOrange: '#fb923c',
    raiseYellow: '#fde047',
    allInPurple: '#c084fc',

    timerWarning: '#fca5a5',
    timerNormal: '#4ade80',
    disconnected: '#6b7280',
    sittingOut: '#4b5563',
  },

  midnightPurple: {
    id: 'midnightPurple',
    label: 'Midnight Purple',
    preview: '#150a28',
    cardBack: '/images/card-backs/purple.jpg',

    feltDark: '#0c0518',
    feltGrad1: '#150a28',
    feltGrad2: '#201040',
    railColor: '#c084fc',
    railColorDark: '#7c3aed',
    edgeGlow: 'rgba(192,132,252,0.12)',

    bgDark: '#060310',
    bgCard: '#0e0818',
    bgPanel: '#120a20',
    accent: '#c084fc',
    accentDim: '#7c3aed',
    textPrimary: '#ede8f5',
    textSecondary: '#9485b0',
    textMuted: '#584a6e',

    foldRed: '#f87171',
    checkBlue: '#818cf8',
    callGreen: '#34d399',
    betOrange: '#fb923c',
    raiseYellow: '#fde047',
    allInPurple: '#e879f9',

    timerWarning: '#f87171',
    timerNormal: '#34d399',
    disconnected: '#6b7280',
    sittingOut: '#4b5563',
  },

  oceanTeal: {
    id: 'oceanTeal',
    label: 'Ocean Teal',
    preview: '#0a2020',
    cardBack: '/images/card-backs/teal.jpg',

    feltDark: '#051515',
    feltGrad1: '#0a2020',
    feltGrad2: '#0e2e2e',
    railColor: '#5eead4',
    railColorDark: '#14b8a6',
    edgeGlow: 'rgba(94,234,212,0.12)',

    bgDark: '#030e0e',
    bgCard: '#081616',
    bgPanel: '#0a1c1c',
    accent: '#5eead4',
    accentDim: '#14b8a6',
    textPrimary: '#e8f5f0',
    textSecondary: '#80a8a0',
    textMuted: '#4a6860',

    foldRed: '#f87171',
    checkBlue: '#38bdf8',
    callGreen: '#4ade80',
    betOrange: '#fb923c',
    raiseYellow: '#fde047',
    allInPurple: '#a78bfa',

    timerWarning: '#f87171',
    timerNormal: '#4ade80',
    disconnected: '#6b7280',
    sittingOut: '#4b5563',
  },

  goldLuxury: {
    id: 'goldLuxury',
    label: 'Gold Luxury',
    preview: '#1a1505',
    cardBack: '/images/card-backs/gold.jpg',

    feltDark: '#100e02',
    feltGrad1: '#1a1505',
    feltGrad2: '#28200a',
    railColor: '#FFD700',
    railColorDark: '#CC9900',
    edgeGlow: 'rgba(255,215,0,0.2)',

    bgDark: '#080600',
    bgCard: '#141005',
    bgPanel: '#1a1508',
    accent: '#FFD700',
    accentDim: '#CC9900',
    textPrimary: '#f5f0e0',
    textSecondary: '#a8a080',
    textMuted: '#686040',

    foldRed: '#ef4444',
    checkBlue: '#60a5fa',
    callGreen: '#4ade80',
    betOrange: '#f97316',
    raiseYellow: '#fde047',
    allInPurple: '#c084fc',

    timerWarning: '#ef4444',
    timerNormal: '#4ade80',
    disconnected: '#6b7280',
    sittingOut: '#4b5563',
  },

  darkNight: {
    id: 'darkNight',
    label: 'Dark Night',
    preview: '#0a0a0a',
    cardBack: '/images/card-backs/black.jpg',

    feltDark: '#050505',
    feltGrad1: '#0a0a0a',
    feltGrad2: '#111111',
    railColor: '#888888',
    railColorDark: '#555555',
    edgeGlow: 'rgba(136,136,136,0.1)',

    bgDark: '#020202',
    bgCard: '#080808',
    bgPanel: '#0c0c0c',
    accent: '#e4e4e7',
    accentDim: '#a1a1aa',
    textPrimary: '#e4e4e7',
    textSecondary: '#71717a',
    textMuted: '#3f3f46',

    foldRed: '#ef4444',
    checkBlue: '#60a5fa',
    callGreen: '#4ade80',
    betOrange: '#fb923c',
    raiseYellow: '#fbbf24',
    allInPurple: '#a78bfa',

    timerWarning: '#ef4444',
    timerNormal: '#4ade80',
    disconnected: '#52525b',
    sittingOut: '#3f3f46',
  },

  emerald: {
    id: 'emerald',
    label: 'Emerald',
    preview: '#052e16',
    cardBack: '/images/card-backs/green.jpg',

    feltDark: '#022010',
    feltGrad1: '#052e16',
    feltGrad2: '#0a4020',
    railColor: '#4ade80',
    railColorDark: '#16a34a',
    edgeGlow: 'rgba(74,222,128,0.12)',

    bgDark: '#010d06',
    bgCard: '#041a0c',
    bgPanel: '#062010',
    accent: '#4ade80',
    accentDim: '#16a34a',
    textPrimary: '#e8f5ec',
    textSecondary: '#80a890',
    textMuted: '#486858',

    foldRed: '#f87171',
    checkBlue: '#38bdf8',
    callGreen: '#86efac',
    betOrange: '#fb923c',
    raiseYellow: '#fde047',
    allInPurple: '#c084fc',

    timerWarning: '#f87171',
    timerNormal: '#86efac',
    disconnected: '#6b7280',
    sittingOut: '#4b5563',
  },
};

export const THEME_ORDER = [
  'classicGreen', 'royalBlue', 'casinoRed', 'midnightPurple',
  'oceanTeal', 'goldLuxury', 'darkNight', 'emerald',
];

// Card back options (selectable independently of theme)
export const CARD_BACKS = [
  { id: 'blue', label: 'Blue', path: '/images/card-backs/blue.jpg', color: '#1e3a5f' },
  { id: 'red', label: 'Red', path: '/images/card-backs/red.jpg', color: '#5f1e1e' },
  { id: 'black', label: 'Black', path: '/images/card-backs/black.jpg', color: '#1a1a1a' },
  { id: 'green', label: 'Green', path: '/images/card-backs/green.jpg', color: '#1e5f2e' },
  { id: 'purple', label: 'Purple', path: '/images/card-backs/purple.jpg', color: '#3d1e5f' },
  { id: 'gold', label: 'Gold', path: '/images/card-backs/gold.jpg', color: '#5f4a1e' },
  { id: 'teal', label: 'Teal', path: '/images/card-backs/teal.jpg', color: '#1e4a5f' },
];

// ═══════════════════════════════════════════════════════════════
// Theme persistence helpers
// ═══════════════════════════════════════════════════════════════

const THEME_KEY = 'smarter_poker_table_theme';
const CARD_BACK_KEY = 'smarter_poker_card_back';

export function getStoredThemeId() {
  if (typeof window === 'undefined') return 'classicGreen';
  return localStorage.getItem(THEME_KEY) || 'classicGreen';
}

export function setStoredThemeId(id) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(THEME_KEY, id);
}

export function getStoredCardBack() {
  if (typeof window === 'undefined') return '/images/card-backs/blue.jpg';
  return localStorage.getItem(CARD_BACK_KEY) || '/images/card-backs/blue.jpg';
}

export function setStoredCardBack(path) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CARD_BACK_KEY, path);
}

/**
 * Get full theme object from stored preference.
 * Falls back to classicGreen if not found.
 */
export function getActiveTheme() {
  const id = getStoredThemeId();
  return TABLE_THEMES[id] || TABLE_THEMES.classicGreen;
}
