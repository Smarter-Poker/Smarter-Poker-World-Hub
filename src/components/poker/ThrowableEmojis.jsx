/**
 * ThrowableEmojis — Animated Throwable System (PokerBros-style)
 * ═══════════════════════════════════════════════════════════════
 * 
 * NOT static emojis — each throwable is an SVG illustration with:
 *   1. Throw arc animation (parabolic flight path + spin)
 *   2. Unique impact animation (splat, splash, pop, explode, shatter)
 *   3. Particle burst effects on hit
 *   4. Linger + fade out
 * 
 * Categories: Taunts | Reactions | Food & Drinks | Objects
 * Modeled after PokerBros / PokerStars / PartyPoker throwables
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ═══════════════════════════════════════════════════════════════
// THROWABLE DEFINITIONS — Each has SVG, colors, impact style
// ═══════════════════════════════════════════════════════════════

const THROWABLES = {
  // ── TAUNTS ──────────────────────────────────
  tomato: {
    label: 'Tomato',
    category: 'taunts',
    svg: (s = 50) => (
      <svg width={s} height={s} viewBox="0 0 100 100">
        <ellipse cx="50" cy="55" rx="38" ry="35" fill="#e53935"/>
        <ellipse cx="50" cy="55" rx="38" ry="35" fill="url(#tomShine)" opacity="0.6"/>
        <ellipse cx="50" cy="52" rx="32" ry="28" fill="#ef5350" opacity="0.5"/>
        <path d="M42 25 Q50 10 58 25" stroke="#4caf50" strokeWidth="4" fill="none"/>
        <ellipse cx="50" cy="24" rx="8" ry="4" fill="#66bb6a"/>
        <defs><radialGradient id="tomShine" cx="35%" cy="35%"><stop offset="0%" stopColor="#fff" stopOpacity="0.4"/><stop offset="100%" stopColor="#fff" stopOpacity="0"/></radialGradient></defs>
      </svg>
    ),
    impactType: 'splat',
    impactColor: '#e53935',
    particles: ['#e53935', '#ff5252', '#c62828', '#ff8a80', '#4caf50'],
    spinSpeed: 720,
  },
  egg: {
    label: 'Rotten Egg',
    category: 'taunts',
    svg: (s = 50) => (
      <svg width={s} height={s} viewBox="0 0 100 100">
        <ellipse cx="50" cy="55" rx="28" ry="36" fill="#f5f5dc"/>
        <ellipse cx="50" cy="55" rx="28" ry="36" fill="url(#eggShine)" opacity="0.5"/>
        <ellipse cx="45" cy="48" rx="12" ry="16" fill="#fff" opacity="0.3"/>
        <ellipse cx="50" cy="60" rx="15" ry="8" fill="#9e9d24" opacity="0.3"/>
        <defs><radialGradient id="eggShine" cx="40%" cy="35%"><stop offset="0%" stopColor="#fff" stopOpacity="0.5"/><stop offset="100%" stopColor="#fff" stopOpacity="0"/></radialGradient></defs>
      </svg>
    ),
    impactType: 'splat',
    impactColor: '#9e9d24',
    particles: ['#f5f5dc', '#fff9c4', '#9e9d24', '#cddc39'],
    spinSpeed: 540,
  },
  poo: {
    label: 'Poo',
    category: 'taunts',
    svg: (s = 50) => (
      <svg width={s} height={s} viewBox="0 0 100 100">
        <ellipse cx="50" cy="78" rx="30" ry="14" fill="#5d4037"/>
        <ellipse cx="50" cy="62" rx="25" ry="14" fill="#6d4c41"/>
        <ellipse cx="50" cy="48" rx="20" ry="12" fill="#795548"/>
        <path d="M42 38 Q50 26 58 38" fill="#8d6e63"/>
        <circle cx="42" cy="52" r="3" fill="#fff"/>
        <circle cx="58" cy="52" r="3" fill="#fff"/>
        <circle cx="42" cy="53" r="1.5" fill="#3e2723"/>
        <circle cx="58" cy="53" r="1.5" fill="#3e2723"/>
        <path d="M44 62 Q50 68 56 62" stroke="#3e2723" strokeWidth="2" fill="none" strokeLinecap="round"/>
        <ellipse cx="50" cy="78" rx="30" ry="14" fill="url(#pooShine)" opacity="0.3"/>
        <defs><radialGradient id="pooShine" cx="40%" cy="30%"><stop offset="0%" stopColor="#fff" stopOpacity="0.3"/><stop offset="100%" stopColor="#fff" stopOpacity="0"/></radialGradient></defs>
      </svg>
    ),
    impactType: 'bounce',
    impactColor: '#5d4037',
    particles: ['#5d4037', '#8d6e63', '#795548', '#a1887f'],
    spinSpeed: 360,
  },
  donkey: {
    label: 'Donkey',
    category: 'taunts',
    svg: (s = 50) => (
      <svg width={s} height={s} viewBox="0 0 100 100">
        <ellipse cx="50" cy="60" rx="28" ry="25" fill="#9e9e9e"/>
        <ellipse cx="50" cy="55" rx="22" ry="18" fill="#bdbdbd"/>
        <path d="M32 40 L28 15 L40 35Z" fill="#9e9e9e"/>
        <path d="M68 40 L72 15 L60 35Z" fill="#9e9e9e"/>
        <path d="M34 17 L30 12 L38 30Z" fill="#e8a0bf" opacity="0.7"/>
        <path d="M66 17 L70 12 L62 30Z" fill="#e8a0bf" opacity="0.7"/>
        <circle cx="40" cy="50" r="4" fill="#424242"/>
        <circle cx="60" cy="50" r="4" fill="#424242"/>
        <circle cx="41" cy="49" r="1.5" fill="#fff"/>
        <circle cx="61" cy="49" r="1.5" fill="#fff"/>
        <ellipse cx="50" cy="65" rx="14" ry="10" fill="#e0e0e0"/>
        <ellipse cx="45" cy="64" rx="3" ry="4" fill="#616161"/>
        <ellipse cx="55" cy="64" rx="3" ry="4" fill="#616161"/>
        <path d="M42 73 Q50 80 58 73" stroke="#757575" strokeWidth="2" fill="none" strokeLinecap="round"/>
      </svg>
    ),
    impactType: 'bounce',
    impactColor: '#9e9e9e',
    particles: ['#9e9e9e', '#bdbdbd', '#757575'],
    spinSpeed: 0,
    wobble: true,
  },
  fish: {
    label: 'Fish',
    category: 'taunts',
    svg: (s = 50) => (
      <svg width={s} height={s} viewBox="0 0 100 100">
        <path d="M75 50 Q90 35 85 50 Q90 65 75 50" fill="#f9a825"/>
        <ellipse cx="45" cy="50" rx="32" ry="20" fill="#42a5f5"/>
        <ellipse cx="45" cy="50" rx="32" ry="20" fill="url(#fishShine)" opacity="0.4"/>
        <ellipse cx="45" cy="48" rx="26" ry="14" fill="#64b5f6" opacity="0.5"/>
        <circle cx="28" cy="46" r="5" fill="#fff"/>
        <circle cx="28" cy="46" r="2.5" fill="#1a237e"/>
        <path d="M35 56 Q42 62 52 56" stroke="#1565c0" strokeWidth="1.5" fill="none"/>
        <line x1="48" y1="38" x2="55" y2="35" stroke="#90caf9" strokeWidth="1" opacity="0.6"/>
        <line x1="50" y1="44" x2="58" y2="42" stroke="#90caf9" strokeWidth="1" opacity="0.6"/>
        <line x1="48" y1="55" x2="56" y2="58" stroke="#90caf9" strokeWidth="1" opacity="0.6"/>
        <defs><radialGradient id="fishShine" cx="35%" cy="35%"><stop offset="0%" stopColor="#fff" stopOpacity="0.5"/><stop offset="100%" stopColor="#fff" stopOpacity="0"/></radialGradient></defs>
      </svg>
    ),
    impactType: 'flop',
    impactColor: '#42a5f5',
    particles: ['#42a5f5', '#64b5f6', '#90caf9', '#1e88e5'],
    spinSpeed: 180,
    wobble: true,
  },
  chicken: {
    label: 'Chicken',
    category: 'taunts',
    svg: (s = 50) => (
      <svg width={s} height={s} viewBox="0 0 100 100">
        <ellipse cx="50" cy="65" rx="25" ry="22" fill="#fff9c4"/>
        <ellipse cx="50" cy="65" rx="25" ry="22" fill="url(#chickenShine)" opacity="0.4"/>
        <circle cx="50" cy="38" r="18" fill="#fff9c4"/>
        <polygon points="50,52 44,60 56,60" fill="#ff8f00"/>
        <circle cx="43" cy="35" r="3" fill="#424242"/>
        <circle cx="57" cy="35" r="3" fill="#424242"/>
        <path d="M46 24 Q50 14 54 24" fill="#e53935"/>
        <circle cx="50" cy="18" r="4" fill="#ef5350"/>
        <path d="M30 75 L28 90 L35 85" fill="#ff8f00" strokeWidth="0"/>
        <path d="M70 75 L72 90 L65 85" fill="#ff8f00" strokeWidth="0"/>
        <path d="M26 55 Q15 50 25 62" fill="#fff9c4"/>
        <path d="M74 55 Q85 50 75 62" fill="#fff9c4"/>
        <defs><radialGradient id="chickenShine" cx="40%" cy="35%"><stop offset="0%" stopColor="#fff" stopOpacity="0.3"/><stop offset="100%" stopColor="#fff" stopOpacity="0"/></radialGradient></defs>
      </svg>
    ),
    impactType: 'bounce',
    impactColor: '#fff9c4',
    particles: ['#fff9c4', '#ffecb3', '#fff176', '#ff8f00', '#e53935'],
    spinSpeed: 0,
    wobble: true,
  },

  // ── REACTIONS ──────────────────────────────
  rocket: {
    label: 'Rocket',
    category: 'reactions',
    svg: (s = 50) => (
      <svg width={s} height={s} viewBox="0 0 100 100">
        <path d="M50 10 Q60 25 58 55 L42 55 Q40 25 50 10Z" fill="#e0e0e0"/>
        <path d="M50 10 Q55 25 54 55 L50 55 Q48 25 50 10Z" fill="#f5f5f5" opacity="0.6"/>
        <ellipse cx="50" cy="40" rx="6" ry="8" fill="#42a5f5"/>
        <ellipse cx="50" cy="40" rx="4" ry="5" fill="#90caf9" opacity="0.5"/>
        <path d="M42 55 L35 70 L42 62Z" fill="#e53935"/>
        <path d="M58 55 L65 70 L58 62Z" fill="#e53935"/>
        <path d="M46 55 L50 72 L54 55Z" fill="#ff9800"/>
        <path d="M48 58 L50 68 L52 58Z" fill="#ffeb3b"/>
        <ellipse cx="50" cy="70" rx="6" ry="10" fill="#ff5722" opacity="0.6"/>
        <ellipse cx="50" cy="72" rx="4" ry="8" fill="#ffab00" opacity="0.5"/>
      </svg>
    ),
    impactType: 'explode',
    impactColor: '#ff5722',
    particles: ['#ff5722', '#ff9800', '#ffeb3b', '#e53935', '#fff'],
    spinSpeed: 0,
    trail: true,
  },
  fireworks: {
    label: 'Fireworks',
    category: 'reactions',
    svg: (s = 50) => (
      <svg width={s} height={s} viewBox="0 0 100 100">
        <rect x="46" y="55" width="8" height="35" rx="2" fill="#795548"/>
        <circle cx="50" cy="45" r="20" fill="#e91e63" opacity="0.8"/>
        <circle cx="50" cy="45" r="14" fill="#f06292" opacity="0.6"/>
        <circle cx="50" cy="45" r="8" fill="#f8bbd0" opacity="0.5"/>
        {[0,45,90,135,180,225,270,315].map((a,i) => {
          const r = 22; const rad = a * Math.PI/180;
          return <circle key={i} cx={50+r*Math.cos(rad)} cy={45+r*Math.sin(rad)} r="3" fill={['#ffeb3b','#00e5ff','#76ff03','#ff6d00','#e040fb','#ffab00','#00e5ff','#ff1744'][i]}/>;
        })}
      </svg>
    ),
    impactType: 'explode',
    impactColor: '#e91e63',
    particles: ['#e91e63', '#ffeb3b', '#00e5ff', '#76ff03', '#ff6d00', '#e040fb'],
    spinSpeed: 0,
  },
  trophy: {
    label: 'Trophy',
    category: 'reactions',
    svg: (s = 50) => (
      <svg width={s} height={s} viewBox="0 0 100 100">
        <rect x="38" y="65" width="24" height="6" rx="2" fill="#f9a825"/>
        <rect x="42" y="55" width="16" height="12" rx="1" fill="#fdd835"/>
        <path d="M32 20 L32 40 Q32 55 50 55 Q68 55 68 40 L68 20Z" fill="#fdd835"/>
        <path d="M36 22 L36 38 Q36 50 50 50 Q64 50 64 38 L64 22Z" fill="#ffee58" opacity="0.5"/>
        <path d="M32 25 Q20 25 22 38 Q24 48 34 45" fill="#f9a825"/>
        <path d="M68 25 Q80 25 78 38 Q76 48 66 45" fill="#f9a825"/>
        <text x="50" y="42" textAnchor="middle" fontSize="16" fontWeight="800" fill="#f57f17">★</text>
        <rect x="35" y="71" width="30" height="5" rx="2" fill="#f57f17"/>
      </svg>
    ),
    impactType: 'sparkle',
    impactColor: '#fdd835',
    particles: ['#fdd835', '#ffeb3b', '#fff176', '#f9a825', '#fff'],
    spinSpeed: 0,
  },
  thumbsDown: {
    label: 'Thumbs Down',
    category: 'reactions',
    svg: (s = 50) => (
      <svg width={s} height={s} viewBox="0 0 100 100">
        <rect x="62" y="18" width="18" height="40" rx="4" fill="#5c6bc0"/>
        <path d="M60 58 L60 25 Q60 18 52 18 L38 18 Q30 18 28 28 L22 55 Q20 65 30 65 L45 65 L40 80 Q38 88 46 88 Q52 88 54 80 L60 58Z" fill="#ffca28"/>
        <path d="M55 22 Q55 18 50 20 L38 22 Q33 23 32 30 L27 52 Q26 58 30 60 L42 60" fill="#ffe082" opacity="0.5"/>
      </svg>
    ),
    impactType: 'bounce',
    impactColor: '#5c6bc0',
    particles: ['#5c6bc0', '#7986cb', '#ffca28'],
    spinSpeed: 180,
  },
  crown: {
    label: 'Crown',
    category: 'reactions',
    svg: (s = 50) => (
      <svg width={s} height={s} viewBox="0 0 100 100">
        <path d="M20 65 L15 30 L35 48 L50 20 L65 48 L85 30 L80 65Z" fill="#fdd835"/>
        <path d="M22 63 L18 34 L36 50 L50 25 L64 50 L82 34 L78 63Z" fill="#ffee58" opacity="0.5"/>
        <rect x="20" y="65" width="60" height="12" rx="3" fill="#f9a825"/>
        <rect x="22" y="67" width="56" height="8" rx="2" fill="#fdd835" opacity="0.5"/>
        <circle cx="35" cy="71" r="4" fill="#e53935"/>
        <circle cx="50" cy="71" r="4" fill="#1e88e5"/>
        <circle cx="65" cy="71" r="4" fill="#43a047"/>
        <circle cx="15" cy="30" r="4" fill="#fdd835"/>
        <circle cx="50" cy="20" r="4" fill="#fdd835"/>
        <circle cx="85" cy="30" r="4" fill="#fdd835"/>
      </svg>
    ),
    impactType: 'sparkle',
    impactColor: '#fdd835',
    particles: ['#fdd835', '#ff6d00', '#e53935', '#1e88e5', '#fff'],
    spinSpeed: 0,
  },
  clap: {
    label: 'Applause',
    category: 'reactions',
    svg: (s = 50) => (
      <svg width={s} height={s} viewBox="0 0 100 100">
        <path d="M35 75 Q25 60 30 45 L38 30 Q40 25 44 28 L42 48" fill="#ffca28" stroke="#f9a825" strokeWidth="1"/>
        <path d="M42 48 L48 28 Q50 23 54 27 L50 50" fill="#ffca28" stroke="#f9a825" strokeWidth="1"/>
        <path d="M50 50 L56 32 Q58 27 62 31 L56 52" fill="#ffca28" stroke="#f9a825" strokeWidth="1"/>
        <path d="M56 52 L62 38 Q64 33 68 37 L60 60 Q55 75 40 78 L35 75" fill="#ffca28" stroke="#f9a825" strokeWidth="1"/>
        {[[-8,20],[8,15],[0,10],[-12,28],[12,22]].map(([x,y],i) => (
          <text key={i} x={50+x} y={y} textAnchor="middle" fontSize="10" fill={['#ff6d00','#e91e63','#00bcd4','#76ff03','#ffab00'][i]}>✦</text>
        ))}
      </svg>
    ),
    impactType: 'sparkle',
    impactColor: '#ffca28',
    particles: ['#ffca28', '#ff6d00', '#e91e63', '#76ff03'],
    spinSpeed: 0,
  },

  // ── FOOD & DRINKS ──────────────────────────
  beer: {
    label: 'Beer',
    category: 'food',
    svg: (s = 50) => (
      <svg width={s} height={s} viewBox="0 0 100 100">
        <rect x="25" y="25" width="40" height="55" rx="4" fill="#f9a825"/>
        <rect x="29" y="30" width="32" height="46" rx="2" fill="#ffca28" opacity="0.6"/>
        <rect x="25" y="22" width="40" height="12" rx="4" fill="#fff" opacity="0.9"/>
        <ellipse cx="35" cy="24" rx="6" ry="5" fill="#fff"/>
        <ellipse cx="48" cy="22" rx="7" ry="5" fill="#fff"/>
        <ellipse cx="55" cy="26" rx="5" ry="4" fill="#fff"/>
        <path d="M65 35 Q80 35 80 50 Q80 62 65 62" fill="none" stroke="#f9a825" strokeWidth="5"/>
        <rect x="32" y="38" width="26" height="3" rx="1" fill="#fff" opacity="0.2"/>
        <rect x="32" y="48" width="26" height="3" rx="1" fill="#fff" opacity="0.15"/>
        <rect x="32" y="58" width="26" height="3" rx="1" fill="#fff" opacity="0.1"/>
      </svg>
    ),
    impactType: 'splash',
    impactColor: '#f9a825',
    particles: ['#f9a825', '#ffca28', '#fff176', '#fff', '#ffe082'],
    spinSpeed: 0,
    wobble: true,
  },
  champagne: {
    label: 'Champagne',
    category: 'food',
    svg: (s = 50) => (
      <svg width={s} height={s} viewBox="0 0 100 100">
        <path d="M42 45 L38 85 Q38 90 50 90 Q62 90 62 85 L58 45Z" fill="#4a148c"/>
        <rect x="45" y="60" width="10" height="3" rx="1" fill="#7b1fa2"/>
        <path d="M40 45 Q40 20 50 15 Q60 20 60 45Z" fill="#ce93d8"/>
        <path d="M44 42 Q44 24 50 20 Q56 24 56 42Z" fill="#e1bee7" opacity="0.4"/>
        <circle cx="46" cy="32" r="2" fill="#fff" opacity="0.5"/>
        <circle cx="52" cy="28" r="1.5" fill="#fff" opacity="0.4"/>
        <circle cx="50" cy="36" r="1" fill="#fff" opacity="0.3"/>
        <path d="M50 12 L48 5 M50 12 L52 4 M50 12 L45 6 M50 12 L55 7" stroke="#ffeb3b" strokeWidth="1.5" opacity="0.8"/>
        <circle cx="47" cy="4" r="2" fill="#ffeb3b" opacity="0.6"/>
        <circle cx="53" cy="3" r="2" fill="#ffeb3b" opacity="0.6"/>
      </svg>
    ),
    impactType: 'splash',
    impactColor: '#ce93d8',
    particles: ['#ce93d8', '#e1bee7', '#ffeb3b', '#fff', '#ab47bc'],
    spinSpeed: 0,
  },
  cake: {
    label: 'Cake',
    category: 'food',
    svg: (s = 50) => (
      <svg width={s} height={s} viewBox="0 0 100 100">
        <rect x="20" y="50" width="60" height="30" rx="6" fill="#f8bbd0"/>
        <rect x="20" y="46" width="60" height="10" rx="3" fill="#fff"/>
        <path d="M20 50 Q30 44 40 50 Q50 44 60 50 Q70 44 80 50" fill="#fff" stroke="#f48fb1" strokeWidth="1"/>
        <rect x="28" y="35" width="44" height="16" rx="4" fill="#ef9a9a"/>
        <rect x="28" y="32" width="44" height="8" rx="3" fill="#fff"/>
        <rect x="47" y="18" width="6" height="16" rx="2" fill="#ffcc02"/>
        <ellipse cx="50" cy="16" rx="4" ry="6" fill="#ff9800"/>
        <ellipse cx="50" cy="14" rx="2" ry="4" fill="#ffeb3b" opacity="0.7"/>
        <circle cx="35" cy="62" r="3" fill="#e53935"/>
        <circle cx="50" cy="65" r="3" fill="#e53935"/>
        <circle cx="65" cy="62" r="3" fill="#e53935"/>
      </svg>
    ),
    impactType: 'splat',
    impactColor: '#f8bbd0',
    particles: ['#f8bbd0', '#fff', '#ef9a9a', '#ffcc02', '#e53935'],
    spinSpeed: 90,
  },
  coffee: {
    label: 'Coffee',
    category: 'food',
    svg: (s = 50) => (
      <svg width={s} height={s} viewBox="0 0 100 100">
        <rect x="25" y="38" width="42" height="42" rx="5" fill="#fff"/>
        <rect x="29" y="42" width="34" height="34" rx="3" fill="#4e342e"/>
        <path d="M67 48 Q82 48 80 60 Q78 70 67 70" fill="none" stroke="#fff" strokeWidth="5"/>
        <ellipse cx="46" cy="48" rx="14" ry="4" fill="#6d4c41" opacity="0.5"/>
        <path d="M38 30 Q40 20 42 30" stroke="#bdbdbd" strokeWidth="2" fill="none" opacity="0.6"/>
        <path d="M46 28 Q48 16 50 28" stroke="#bdbdbd" strokeWidth="2" fill="none" opacity="0.6"/>
        <path d="M54 30 Q56 20 58 30" stroke="#bdbdbd" strokeWidth="2" fill="none" opacity="0.6"/>
      </svg>
    ),
    impactType: 'splash',
    impactColor: '#4e342e',
    particles: ['#4e342e', '#6d4c41', '#8d6e63', '#fff'],
    spinSpeed: 0,
    wobble: true,
  },

  // ── OBJECTS ─────────────────────────────────
  roses: {
    label: 'Roses',
    category: 'objects',
    svg: (s = 50) => (
      <svg width={s} height={s} viewBox="0 0 100 100">
        <line x1="50" y1="45" x2="48" y2="90" stroke="#2e7d32" strokeWidth="4"/>
        <path d="M46 65 Q35 60 38 55" fill="#4caf50"/>
        <path d="M52 72 Q63 68 60 62" fill="#4caf50"/>
        <circle cx="50" cy="35" r="15" fill="#e53935"/>
        <circle cx="50" cy="35" r="10" fill="#ef5350"/>
        <circle cx="50" cy="33" r="6" fill="#f44336" opacity="0.7"/>
        <circle cx="38" cy="28" r="8" fill="#c62828"/>
        <circle cx="62" cy="28" r="8" fill="#c62828"/>
        <circle cx="50" cy="22" r="7" fill="#d32f2f"/>
        <circle cx="50" cy="33" r="4" fill="#b71c1c"/>
      </svg>
    ),
    impactType: 'sparkle',
    impactColor: '#e53935',
    particles: ['#e53935', '#c62828', '#f44336', '#4caf50', '#ff8a80'],
    spinSpeed: 180,
  },
  horseshoe: {
    label: 'Lucky',
    category: 'objects',
    svg: (s = 50) => (
      <svg width={s} height={s} viewBox="0 0 100 100">
        <path d="M25 35 Q25 80 50 80 Q75 80 75 35" fill="none" stroke="#f9a825" strokeWidth="12" strokeLinecap="round"/>
        <path d="M30 37 Q30 74 50 74 Q70 74 70 37" fill="none" stroke="#fdd835" strokeWidth="5" opacity="0.5"/>
        <circle cx="25" cy="35" r="6" fill="#ff6d00"/>
        <circle cx="75" cy="35" r="6" fill="#ff6d00"/>
        <text x="50" y="60" textAnchor="middle" fontSize="16" fill="#fff" fontWeight="800">★</text>
      </svg>
    ),
    impactType: 'sparkle',
    impactColor: '#f9a825',
    particles: ['#f9a825', '#fdd835', '#ff6d00', '#fff'],
    spinSpeed: 360,
  },
  coins: {
    label: 'Coins',
    category: 'objects',
    svg: (s = 50) => (
      <svg width={s} height={s} viewBox="0 0 100 100">
        <ellipse cx="38" cy="68" rx="18" ry="6" fill="#f57f17"/>
        <rect x="20" y="60" width="36" height="8" fill="#f9a825"/>
        <ellipse cx="38" cy="60" rx="18" ry="6" fill="#fdd835"/>
        <text x="38" y="64" textAnchor="middle" fontSize="10" fill="#f57f17" fontWeight="800">C</text>
        <ellipse cx="58" cy="55" rx="18" ry="6" fill="#f57f17"/>
        <rect x="40" y="47" width="36" height="8" fill="#f9a825"/>
        <ellipse cx="58" cy="47" rx="18" ry="6" fill="#fdd835"/>
        <text x="58" y="51" textAnchor="middle" fontSize="10" fill="#f57f17" fontWeight="800">C</text>
        <ellipse cx="45" cy="40" rx="18" ry="6" fill="#f57f17"/>
        <rect x="27" y="32" width="36" height="8" fill="#f9a825"/>
        <ellipse cx="45" cy="32" rx="18" ry="6" fill="#fdd835"/>
        <text x="45" y="36" textAnchor="middle" fontSize="10" fill="#f57f17" fontWeight="800">C</text>
      </svg>
    ),
    impactType: 'scatter',
    impactColor: '#fdd835',
    particles: ['#fdd835', '#f9a825', '#f57f17', '#ffee58', '#fff'],
    spinSpeed: 180,
  },
  cards: {
    label: 'Cards',
    category: 'objects',
    svg: (s = 50) => (
      <svg width={s} height={s} viewBox="0 0 100 100">
        <rect x="22" y="20" width="35" height="50" rx="4" fill="#fff" stroke="#ccc" strokeWidth="1" transform="rotate(-15 40 45)"/>
        <text x="32" y="42" fontSize="14" fill="#e53935" fontWeight="800" transform="rotate(-15 40 45)">A♥</text>
        <rect x="42" y="22" width="35" height="50" rx="4" fill="#fff" stroke="#ccc" strokeWidth="1" transform="rotate(8 60 47)"/>
        <text x="50" y="44" fontSize="14" fill="#1a237e" fontWeight="800" transform="rotate(8 60 47)">K♠</text>
        <rect x="35" y="30" width="35" height="50" rx="4" fill="#fff" stroke="#ccc" strokeWidth="1" transform="rotate(-3 52 55)"/>
        <text x="42" y="52" fontSize="14" fill="#e53935" fontWeight="800" transform="rotate(-3 52 55)">Q♦</text>
      </svg>
    ),
    impactType: 'scatter',
    impactColor: '#fff',
    particles: ['#e53935', '#1a237e', '#fff', '#ccc', '#2e7d32'],
    spinSpeed: 540,
  },
  alarm: {
    label: 'Wake Up',
    category: 'objects',
    svg: (s = 50) => (
      <svg width={s} height={s} viewBox="0 0 100 100">
        <circle cx="50" cy="55" r="30" fill="#f44336"/>
        <circle cx="50" cy="55" r="26" fill="#e53935"/>
        <circle cx="50" cy="55" r="24" fill="#ef5350" opacity="0.3"/>
        <circle cx="50" cy="55" r="22" fill="#fff"/>
        <circle cx="30" cy="28" r="12" fill="#f44336"/>
        <circle cx="70" cy="28" r="12" fill="#f44336"/>
        <rect x="48" y="36" width="3" height="18" rx="1" fill="#424242"/>
        <rect x="49" y="48" width="14" height="3" rx="1" fill="#424242"/>
        <circle cx="50" cy="55" r="3" fill="#424242"/>
        <rect x="24" y="82" width="8" height="6" rx="2" fill="#f44336" transform="rotate(-20 28 85)"/>
        <rect x="68" y="82" width="8" height="6" rx="2" fill="#f44336" transform="rotate(20 72 85)"/>
        {/* Ring lines */}
        <path d="M18 22 L12 16" stroke="#ff8a80" strokeWidth="3" strokeLinecap="round"/>
        <path d="M82 22 L88 16" stroke="#ff8a80" strokeWidth="3" strokeLinecap="round"/>
        <path d="M15 30 L8 28" stroke="#ff8a80" strokeWidth="2" strokeLinecap="round" opacity="0.6"/>
        <path d="M85 30 L92 28" stroke="#ff8a80" strokeWidth="2" strokeLinecap="round" opacity="0.6"/>
      </svg>
    ),
    impactType: 'shake',
    impactColor: '#f44336',
    particles: ['#f44336', '#ff8a80', '#ffcdd2', '#fff'],
    spinSpeed: 0,
    wobble: true,
  },
  goat: {
    label: 'GOAT',
    category: 'objects',
    svg: (s = 50) => (
      <svg width={s} height={s} viewBox="0 0 100 100">
        <ellipse cx="50" cy="60" rx="26" ry="22" fill="#f5f5f5"/>
        <circle cx="50" cy="38" r="16" fill="#f5f5f5"/>
        <path d="M36 30 L28 14 L38 26Z" fill="#e0e0e0"/>
        <path d="M64 30 L72 14 L62 26Z" fill="#e0e0e0"/>
        <circle cx="43" cy="36" r="3" fill="#424242"/>
        <circle cx="57" cy="36" r="3" fill="#424242"/>
        <circle cx="44" cy="35" r="1" fill="#fff"/>
        <circle cx="58" cy="35" r="1" fill="#fff"/>
        <ellipse cx="50" cy="44" rx="6" ry="4" fill="#e0e0e0"/>
        <path d="M44 50 Q50 55 56 50" fill="#e8a0bf" opacity="0.6"/>
        <path d="M47 52 Q50 62 53 52" fill="#e0e0e0"/>
        <text x="50" y="72" textAnchor="middle" fontSize="11" fontWeight="900" fill="#fdd835">GOAT</text>
        <circle cx="50" cy="10" r="8" fill="#fdd835"/>
        <text x="50" y="14" textAnchor="middle" fontSize="10" fontWeight="800" fill="#f57f17">★</text>
      </svg>
    ),
    impactType: 'sparkle',
    impactColor: '#fdd835',
    particles: ['#fdd835', '#f5f5f5', '#ffeb3b', '#fff'],
    spinSpeed: 0,
  },
};

const CATEGORIES = {
  taunts: { label: '🎯 Taunts', items: ['tomato', 'egg', 'poo', 'donkey', 'fish', 'chicken'] },
  reactions: { label: '⚡ Reactions', items: ['rocket', 'fireworks', 'trophy', 'thumbsDown', 'crown', 'clap'] },
  food: { label: '🍺 Food & Drinks', items: ['beer', 'champagne', 'cake', 'coffee'] },
  objects: { label: '🎲 Objects', items: ['roses', 'horseshoe', 'coins', 'cards', 'alarm', 'goat'] },
};

// ═══════════════════════════════════════════════════════════════
// IMPACT ANIMATIONS — Unique per impact type
// ═══════════════════════════════════════════════════════════════

function ImpactEffect({ type, color, particles = [], onComplete }) {
  const particleCount = type === 'explode' ? 16 : type === 'scatter' ? 12 : 10;

  const particleElements = useMemo(() => {
    return Array.from({ length: particleCount }, (_, i) => {
      const angle = (i / particleCount) * 360;
      const rad = angle * Math.PI / 180;
      const dist = type === 'explode' ? 60 + Math.random() * 40 : 30 + Math.random() * 30;
      const size = 3 + Math.random() * 6;
      const pColor = particles[i % particles.length] || color;
      const delay = Math.random() * 0.1;

      return { angle, rad, dist, size, pColor, delay, id: i };
    });
  }, [type, particleCount, color, particles]);

  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={{ duration: 1.2, delay: 0.8 }}
      onAnimationComplete={onComplete}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 95 }}
    >
      {/* Central flash */}
      {(type === 'explode' || type === 'splat') && (
        <motion.div
          initial={{ scale: 0.2, opacity: 1 }}
          animate={{ scale: 3, opacity: 0 }}
          transition={{ duration: 0.5 }}
          style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            width: 30, height: 30, borderRadius: '50%',
            background: `radial-gradient(circle, ${color}, transparent)`,
          }}
        />
      )}

      {/* Splat ring */}
      {type === 'splat' && (
        <motion.div
          initial={{ scale: 0.5, opacity: 0.8 }}
          animate={{ scale: 2.5, opacity: 0, borderRadius: '40% 60% 55% 45%' }}
          transition={{ duration: 0.6 }}
          style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            width: 40, height: 40, borderRadius: '50%',
            background: color, opacity: 0.6,
          }}
        />
      )}

      {/* Splash droplets */}
      {type === 'splash' && (
        <>
          {[0, 60, 120, 180, 240, 300].map((a, i) => {
            const r = a * Math.PI / 180;
            return (
              <motion.div
                key={`drop-${i}`}
                initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                animate={{
                  x: Math.cos(r) * (25 + Math.random() * 20),
                  y: Math.sin(r) * 15 - 20 + Math.random() * 40,
                  opacity: 0, scale: 0.3,
                }}
                transition={{ duration: 0.6, delay: i * 0.03 }}
                style={{
                  position: 'absolute', top: '50%', left: '50%',
                  width: 8, height: 12, borderRadius: '50% 50% 50% 50% / 60% 60% 40% 40%',
                  background: particles[i % particles.length] || color,
                }}
              />
            );
          })}
        </>
      )}

      {/* Sparkle stars */}
      {type === 'sparkle' && (
        <>
          {[0, 72, 144, 216, 288].map((a, i) => {
            const r = a * Math.PI / 180;
            return (
              <motion.div
                key={`star-${i}`}
                initial={{ x: 0, y: 0, opacity: 1, scale: 0, rotate: 0 }}
                animate={{
                  x: Math.cos(r) * 35,
                  y: Math.sin(r) * 35,
                  opacity: [1, 1, 0], scale: [0, 1.5, 0], rotate: 180,
                }}
                transition={{ duration: 0.7, delay: i * 0.06 }}
                style={{
                  position: 'absolute', top: '50%', left: '50%',
                  fontSize: 14, lineHeight: 1, color: particles[i % particles.length] || '#fff',
                }}
              >
                ✦
              </motion.div>
            );
          })}
        </>
      )}

      {/* Shake effect — screen jitter */}
      {type === 'shake' && (
        <motion.div
          animate={{ x: [0, -4, 4, -3, 3, -2, 2, 0], y: [0, 2, -2, 1, -1, 0] }}
          transition={{ duration: 0.4 }}
          style={{ position: 'absolute', inset: 0 }}
        />
      )}

      {/* Particles */}
      {particleElements.map(p => (
        <motion.div
          key={p.id}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{
            x: Math.cos(p.rad) * p.dist,
            y: Math.sin(p.rad) * p.dist + (type === 'scatter' ? 20 : 0),
            opacity: 0,
            scale: 0.2,
            rotate: Math.random() * 360,
          }}
          transition={{
            duration: 0.5 + Math.random() * 0.4,
            delay: p.delay,
            ease: 'easeOut',
          }}
          style={{
            position: 'absolute',
            top: '50%', left: '50%',
            width: p.size, height: p.size,
            borderRadius: type === 'splat' ? '40% 60%' : '50%',
            background: p.pColor,
          }}
        />
      ))}

      {/* Bounce extra: object bounces up then settles */}
      {type === 'bounce' && (
        <motion.div
          initial={{ y: 0 }}
          animate={{ y: [0, -20, 0, -8, 0, -3, 0] }}
          transition={{ duration: 0.6, times: [0, 0.2, 0.4, 0.55, 0.7, 0.85, 1] }}
          style={{ position: 'absolute', inset: 0 }}
        />
      )}

      {/* Flop: fish-slap wobble */}
      {type === 'flop' && (
        <motion.div
          animate={{ rotate: [0, 25, -20, 15, -10, 5, 0] }}
          transition={{ duration: 0.5 }}
          style={{ position: 'absolute', inset: 0, transformOrigin: 'center' }}
        />
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// FLYING THROWABLE — Parabolic arc with spin + trail
// ═══════════════════════════════════════════════════════════════

function FlyingThrowable({ throwable, fromPos, toPos, onComplete }) {
  const def = THROWABLES[throwable];
  if (!def) return null;

  const midX = (fromPos.x + toPos.x) / 2;
  const midY = Math.min(fromPos.y, toPos.y) - 15; // Arc peak

  return (
    <motion.div
      initial={{
        left: `${fromPos.x}%`, top: `${fromPos.y}%`,
        scale: 0.4, opacity: 1, rotate: 0,
      }}
      animate={{
        left: [`${fromPos.x}%`, `${midX}%`, `${toPos.x}%`],
        top: [`${fromPos.y}%`, `${midY}%`, `${toPos.y}%`],
        scale: [0.4, 1, 0.9],
        opacity: 1,
        rotate: def.spinSpeed || 0,
      }}
      transition={{
        duration: 0.55,
        ease: [0.25, 0.1, 0.25, 1],
        times: [0, 0.5, 1],
      }}
      onAnimationComplete={onComplete}
      style={{
        position: 'absolute',
        transform: 'translate(-50%, -50%)',
        zIndex: 92,
        pointerEvents: 'none',
        filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.5))',
      }}
    >
      {/* Trail particles for rocket */}
      {def.trail && (
        <motion.div
          animate={{ opacity: [0.6, 0] }}
          transition={{ duration: 0.3, repeat: Infinity }}
          style={{
            position: 'absolute', bottom: -8, left: '50%', transform: 'translateX(-50%)',
            width: 8, height: 16, borderRadius: '50%',
            background: 'radial-gradient(#ff9800, #ff5722, transparent)',
          }}
        />
      )}
      {def.svg(48)}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// IMPACT DISPLAY — Shows on target seat after hit
// ═══════════════════════════════════════════════════════════════

function SeatImpact({ throwable, onComplete }) {
  const def = THROWABLES[throwable];
  if (!def) return null;

  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: [0, 1.3, 1] }}
      transition={{ duration: 0.3, times: [0, 0.6, 1] }}
      style={{
        position: 'absolute', top: -45, left: '50%', transform: 'translateX(-50%)',
        zIndex: 75, pointerEvents: 'none',
      }}
    >
      {/* The throwable SVG */}
      <motion.div
        animate={def.wobble ? { rotate: [0, 8, -8, 5, -5, 0] } : {}}
        transition={def.wobble ? { duration: 0.5, repeat: 2 } : {}}
      >
        {def.svg(44)}
      </motion.div>

      {/* Impact effect overlay */}
      <ImpactEffect
        type={def.impactType}
        color={def.impactColor}
        particles={def.particles}
        onComplete={onComplete}
      />

      {/* Fade out the whole thing after 3s */}
      <motion.div
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.5, delay: 3 }}
        style={{ position: 'absolute', inset: -20 }}
      />
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// THROWABLE PICKER — Grid with categories + preview
// ═══════════════════════════════════════════════════════════════

function ThrowablePicker({ onSelect, onClose }) {
  const [category, setCategory] = useState('taunts');

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.92 }}
      transition={{ duration: 0.18 }}
      style={{
        position: 'absolute', bottom: 50, left: '50%', transform: 'translateX(-50%)',
        background: 'rgba(24,25,26,0.97)', border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 16, padding: 10, zIndex: 80, width: 310,
        boxShadow: '0 12px 40px rgba(0,0,0,0.7)',
        backdropFilter: 'blur(12px)',
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* Category tabs */}
      <div style={{ display: 'flex', gap: 3, marginBottom: 8, overflowX: 'auto', paddingBottom: 2 }}>
        {Object.entries(CATEGORIES).map(([key, cat]) => (
          <button
            key={key}
            onClick={() => setCategory(key)}
            style={{
              padding: '5px 9px', borderRadius: 8, border: 'none',
              background: category === key
                ? 'linear-gradient(135deg, #1877F2, #42a5f5)'
                : 'rgba(255,255,255,0.06)',
              color: category === key ? '#fff' : '#B0B3B8',
              fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
              transition: 'all 0.15s',
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Throwable grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6,
      }}>
        {CATEGORIES[category].items.map(key => {
          const def = THROWABLES[key];
          return (
            <button
              key={key}
              onClick={() => onSelect(key)}
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 12, padding: '8px 4px 4px', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)';
                e.currentTarget.style.transform = 'scale(1.05)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              <div style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {def.svg(40)}
              </div>
              <span style={{ fontSize: 9, color: '#B0B3B8', fontWeight: 600 }}>{def.label}</span>
            </button>
          );
        })}
      </div>

      <div style={{
        textAlign: 'center', fontSize: 10, color: '#65676B',
        marginTop: 8, paddingTop: 6,
        borderTop: '1px solid rgba(255,255,255,0.06)',
      }}>
        Pick a throwable, then tap a player to throw it
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN EXPORT — ThrowableEmojis (replaces old EmojiThrower)
// ═══════════════════════════════════════════════════════════════

export default function ThrowableEmojis({
  userId,
  seats,
  seatPositions,
  onThrow,        // (throwableKey, targetId) => void
  chatMessages,   // incoming throwable events
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedThrowable, setSelectedThrowable] = useState(null);
  const [targetMode, setTargetMode] = useState(false);
  const [flyingItems, setFlyingItems] = useState([]);
  const [seatImpacts, setSeatImpacts] = useState({});
  const lastThrowRef = useRef(0);
  const COOLDOWN_MS = 2500;

  // Process incoming throwable events
  useEffect(() => {
    if (!chatMessages || chatMessages.length === 0) return;
    const last = chatMessages[chatMessages.length - 1];
    if (last?.type !== 'emoji' && last?.type !== 'throwable') return;

    const throwableKey = last.throwable || last.emoji;
    const targetSeat = seats?.find(s => s.player?.id === last.targetId);
    const fromSeat = seats?.find(s => s.player?.id === last.fromId);

    // Launch flying animation
    if (fromSeat && targetSeat && seatPositions) {
      const fromPos = seatPositions[fromSeat.seatIndex];
      const toPos = seatPositions[targetSeat.seatIndex];
      if (fromPos && toPos) {
        const id = `fly-${Date.now()}-${Math.random()}`;
        setFlyingItems(prev => [...prev, { id, throwable: throwableKey, fromPos, toPos }]);
      }
    }

    // Set impact on target seat (even without flight for remote events)
    if (targetSeat && THROWABLES[throwableKey]) {
      const seatIdx = targetSeat.seatIndex;
      const ts = Date.now();
      setTimeout(() => {
        setSeatImpacts(prev => ({ ...prev, [seatIdx]: { throwable: throwableKey, ts } }));
      }, fromSeat && seatPositions ? 550 : 0); // Delay if flight animation is playing

      // Auto-clear after 4s
      setTimeout(() => {
        setSeatImpacts(prev => {
          const next = { ...prev };
          if (next[seatIdx]?.ts === ts) delete next[seatIdx];
          return next;
        });
      }, 4500);
    }
  }, [chatMessages, seats, seatPositions]);

  const handleSelect = useCallback((key) => {
    const now = Date.now();
    if (now - lastThrowRef.current < COOLDOWN_MS) return;
    setSelectedThrowable(key);
    setPickerOpen(false);
    setTargetMode(true);
  }, []);

  const handleTargetSeat = useCallback((seatIndex) => {
    if (!targetMode || !selectedThrowable) return;
    const target = seats?.[seatIndex];
    if (!target?.player || target.player.id === userId) return;

    lastThrowRef.current = Date.now();
    onThrow?.(selectedThrowable, target.player.id);
    setTargetMode(false);
    setSelectedThrowable(null);
  }, [targetMode, selectedThrowable, seats, userId, onThrow]);

  const handleTableThrow = useCallback(() => {
    if (!selectedThrowable) return;
    const now = Date.now();
    if (now - lastThrowRef.current < COOLDOWN_MS) return;

    lastThrowRef.current = Date.now();
    onThrow?.(selectedThrowable, null);
    setTargetMode(false);
    setSelectedThrowable(null);
  }, [selectedThrowable, onThrow]);

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => {
          if (targetMode) {
            setTargetMode(false);
            setSelectedThrowable(null);
          } else {
            setPickerOpen(!pickerOpen);
          }
        }}
        style={{
          position: 'absolute', bottom: 8, left: 8, zIndex: 55,
          background: targetMode
            ? 'linear-gradient(135deg, rgba(24,119,242,0.7), rgba(66,165,245,0.7))'
            : 'rgba(0,0,0,0.55)',
          border: `1px solid ${targetMode ? '#42a5f5' : 'rgba(255,255,255,0.15)'}`,
          color: '#fff', borderRadius: 22, padding: '5px 12px',
          fontSize: 11, fontWeight: 600, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 5,
          backdropFilter: 'blur(8px)',
          boxShadow: targetMode ? '0 0 16px rgba(24,119,242,0.4)' : '0 2px 8px rgba(0,0,0,0.3)',
          transition: 'all 0.2s',
        }}
      >
        {targetMode ? (
          <>🎯 Throw {THROWABLES[selectedThrowable]?.label}</>
        ) : (
          <>🎯 Throw</>
        )}
      </button>

      {/* Picker */}
      <AnimatePresence>
        {pickerOpen && (
          <ThrowablePicker onSelect={handleSelect} onClose={() => setPickerOpen(false)} />
        )}
      </AnimatePresence>

      {/* Target mode hint */}
      <AnimatePresence>
        {targetMode && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            style={{
              position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
              background: 'linear-gradient(135deg, rgba(24,119,242,0.9), rgba(66,165,245,0.9))',
              color: '#fff', padding: '7px 18px', borderRadius: 22,
              fontSize: 12, fontWeight: 700, zIndex: 75, cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(24,119,242,0.4)',
              backdropFilter: 'blur(8px)',
            }}
            onClick={handleTableThrow}
          >
            🎯 Tap a player to throw — or tap here for table
          </motion.div>
        )}
      </AnimatePresence>

      {/* Flying throwables */}
      <AnimatePresence>
        {flyingItems.map(f => (
          <FlyingThrowable
            key={f.id}
            throwable={f.throwable}
            fromPos={f.fromPos}
            toPos={f.toPos}
            onComplete={() => setFlyingItems(prev => prev.filter(x => x.id !== f.id))}
          />
        ))}
      </AnimatePresence>

      {/* Seat impacts */}
      {Object.entries(seatImpacts).map(([idx, data]) => {
        const pos = seatPositions?.[idx];
        if (!pos) return null;
        return (
          <div
            key={`impact-${idx}-${data.ts}`}
            style={{
              position: 'absolute',
              left: `${pos.x || 50}%`, top: `${(pos.y || 50)}%`,
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none', zIndex: 72,
            }}
          >
            <SeatImpact
              throwable={data.throwable}
              onComplete={() => {}}
            />
          </div>
        );
      })}
    </>
  );
}

// Re-export seat target handler for LivePokerTable integration
export { THROWABLES, CATEGORIES };
