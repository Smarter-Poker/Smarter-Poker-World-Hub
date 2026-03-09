/**
 * HAND HISTORY UPLOAD — GTO Wizard-Style Hand Analysis
 * ═══════════════════════════════════════════════════════════════════════════
 * Upload hand histories from PokerStars/GG/ACR for AI analysis.
 * Parses hands, classifies decisions, shows coaching recommendations.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import { getAuthUser, getAccessToken } from '../../../src/lib/authUtils';
import Card from '../../../src/components/training/Card';

// ═══════════════════════════════════════════════════════════════════════════
// HAND HISTORY PARSERS — Multi-Site Support (PokerStars, GGPoker, 888, WPN)
// ═══════════════════════════════════════════════════════════════════════════

function parsePokerStarsHand(text) {
  const hands = [];
  const handBlocks = text.split(/(?=PokerStars (?:Hand|Zoom Hand))/);

  for (const block of handBlocks) {
    if (!block.trim() || block.length < 50) continue;
    try {
      const hand = {};
      const idMatch = block.match(/Hand #(\d+)/);
      hand.id = idMatch ? idMatch[1] : `ps-${hands.length}`;
      hand.site = 'PokerStars';
      hand.gameType = block.includes('Tournament') ? 'MTT' : 'Cash';
      const stakesMatch = block.match(/\(?\$?([\d.]+)\/\$?([\d.]+)/);
      hand.stakes = stakesMatch ? `${stakesMatch[1]}/${stakesMatch[2]}` : 'Unknown';
      const heroMatch = block.match(/Dealt to (.+?) \[(.+?)\]/);
      hand.hero = heroMatch ? heroMatch[1] : 'Hero';
      hand.heroCards = heroMatch ? heroMatch[2].split(' ') : [];
      const boardMatches = [];
      const flopMatch = block.match(/\*\*\* FLOP \*\*\* \[(.+?)\]/);
      if (flopMatch) boardMatches.push(...flopMatch[1].split(' '));
      const turnMatch = block.match(/\*\*\* TURN \*\*\*.*\[(.+?)\]/);
      if (turnMatch) boardMatches.push(turnMatch[1]);
      const riverMatch = block.match(/\*\*\* RIVER \*\*\*.*\[(.+?)\]/);
      if (riverMatch) boardMatches.push(riverMatch[1]);
      hand.board = boardMatches;
      const potMatch = block.match(/Total pot \$?([\d.]+)/);
      hand.pot = potMatch ? parseFloat(potMatch[1]) : 0;
      const seatLines = block.match(/Seat \d+: .+/g) || [];
      const buttonMatch = block.match(/Seat #(\d+) is the button/);
      hand.button = buttonMatch ? parseInt(buttonMatch[1]) : 1;
      hand.actions = [];
      const actionLines = block.match(/.+?: (?:folds|calls|raises|bets|checks|all-in).*/gi) || [];
      for (const line of actionLines) {
        const aMatch = line.match(
          /(.+?): (folds|calls|raises|bets|checks|all-in)(?:\s+\$?([\d.]+))?/i
        );
        if (aMatch) {
          hand.actions.push({
            player: aMatch[1].trim(),
            action: aMatch[2].toLowerCase(),
            amount: aMatch[3] ? parseFloat(aMatch[3]) : 0,
            isHero: aMatch[1].trim() === hand.hero,
          });
        }
      }
      const wonMatch = block.match(/collected \$?([\d.]+)/);
      hand.result = wonMatch ? parseFloat(wonMatch[1]) : 0;
      hand.rawText = block.substring(0, 500);
      hands.push(hand);
    } catch (e) {
      continue;
    }
  }
  return hands;
}

function parseGGPokerHand(text) {
  const hands = [];
  const handBlocks = text.split(/(?=Poker Hand #)/);

  for (const block of handBlocks) {
    if (!block.trim() || block.length < 50) continue;
    try {
      const hand = {};
      const idMatch = block.match(/Hand #([\w-]+)/);
      hand.id = idMatch ? idMatch[1] : `gg-${hands.length}`;
      hand.site = 'GGPoker';
      hand.gameType = block.includes('Tournament') || block.includes('Bounty') ? 'MTT' : 'Cash';
      const stakesMatch = block.match(/\(?\$?([\d.]+)\/\$?([\d.]+)/);
      hand.stakes = stakesMatch ? `${stakesMatch[1]}/${stakesMatch[2]}` : 'Unknown';
      const heroMatch = block.match(/Dealt to (?:Hero|(.+?)) \[(.+?)\]/);
      hand.hero = heroMatch ? heroMatch[1] || 'Hero' : 'Hero';
      hand.heroCards = heroMatch ? heroMatch[2].split(' ') : [];
      const boardMatches = [];
      const flopMatch = block.match(/\*\*\* FLOP \*\*\* \[(.+?)\]/);
      if (flopMatch) boardMatches.push(...flopMatch[1].split(' '));
      const turnMatch = block.match(/\*\*\* TURN \*\*\*.*\[(.+?)\]/);
      if (turnMatch) boardMatches.push(turnMatch[1]);
      const riverMatch = block.match(/\*\*\* RIVER \*\*\*.*\[(.+?)\]/);
      if (riverMatch) boardMatches.push(riverMatch[1]);
      hand.board = boardMatches;
      const potMatch = block.match(/Total pot \$?([\d.]+)/);
      hand.pot = potMatch ? parseFloat(potMatch[1]) : 0;
      hand.button = 1;
      hand.actions = [];
      const actionLines = block.match(/.+?: (?:Folds|Calls|Raises|Bets|Checks|All-in).*/gi) || [];
      for (const line of actionLines) {
        const aMatch = line.match(
          /(.+?): (Folds|Calls|Raises|Bets|Checks|All-in)(?:\s+\$?([\d.]+))?/i
        );
        if (aMatch) {
          hand.actions.push({
            player: aMatch[1].trim(),
            action: aMatch[2].toLowerCase(),
            amount: aMatch[3] ? parseFloat(aMatch[3]) : 0,
            isHero: aMatch[1].trim() === hand.hero || aMatch[1].trim() === 'Hero',
          });
        }
      }
      const wonMatch = block.match(/collected \$?([\d.]+)/);
      hand.result = wonMatch ? parseFloat(wonMatch[1]) : 0;
      hand.rawText = block.substring(0, 500);
      hands.push(hand);
    } catch (e) {
      continue;
    }
  }
  return hands;
}

function parse888Hand(text) {
  const hands = [];
  const handBlocks = text.split(/(?=\*\*\*\*\* 888poker Hand History)/);

  for (const block of handBlocks) {
    if (!block.trim() || block.length < 50) continue;
    try {
      const hand = {};
      const idMatch = block.match(/Game (\d+)/);
      hand.id = idMatch ? idMatch[1] : `888-${hands.length}`;
      hand.site = '888poker';
      hand.gameType = block.includes('Tournament') ? 'MTT' : 'Cash';
      const stakesMatch = block.match(/\$?([\d.]+)\/\$?([\d.]+)/);
      hand.stakes = stakesMatch ? `${stakesMatch[1]}/${stakesMatch[2]}` : 'Unknown';
      const heroMatch = block.match(/Dealt to (.+?) \[(.+?)\]/);
      hand.hero = heroMatch ? heroMatch[1] : 'Hero';
      hand.heroCards = heroMatch ? heroMatch[2].split(/[\s,]+/) : [];
      const boardMatches = [];
      const flopMatch = block.match(/\*\* Dealing flop \*\* \[(.+?)\]/i);
      if (flopMatch) boardMatches.push(...flopMatch[1].split(/[\s,]+/));
      const turnMatch = block.match(/\*\* Dealing turn \*\* \[(.+?)\]/i);
      if (turnMatch) boardMatches.push(turnMatch[1].trim());
      const riverMatch = block.match(/\*\* Dealing river \*\* \[(.+?)\]/i);
      if (riverMatch) boardMatches.push(riverMatch[1].trim());
      hand.board = boardMatches;
      const potMatch = block.match(/Total pot \$?([\d.]+)/);
      hand.pot = potMatch ? parseFloat(potMatch[1]) : 0;
      hand.button = 1;
      hand.actions = [];
      const actionLines = block.match(/.+? (?:folds|calls|raises|bets|checks).*/gi) || [];
      for (const line of actionLines) {
        const aMatch = line.match(
          /(.+?) (folds|calls|raises|bets|checks)(?:\s*\[?\$?([\d.]+)\]?)?/i
        );
        if (aMatch) {
          hand.actions.push({
            player: aMatch[1].trim(),
            action: aMatch[2].toLowerCase(),
            amount: aMatch[3] ? parseFloat(aMatch[3]) : 0,
            isHero: aMatch[1].trim() === hand.hero,
          });
        }
      }
      const wonMatch = block.match(/collected \[?\$?([\d.]+)/);
      hand.result = wonMatch ? parseFloat(wonMatch[1]) : 0;
      hand.rawText = block.substring(0, 500);
      hands.push(hand);
    } catch (e) {
      continue;
    }
  }
  return hands;
}

function parseWPNHand(text) {
  const hands = [];
  const handBlocks = text.split(/(?=(?:Winning Poker Network|Game started at))/);

  for (const block of handBlocks) {
    if (!block.trim() || block.length < 50) continue;
    try {
      const hand = {};
      const idMatch = block.match(/Game ID: ?(\d+)/);
      hand.id = idMatch ? idMatch[1] : `wpn-${hands.length}`;
      hand.site = 'WPN/ACR';
      hand.gameType = block.includes('Tournament') || block.includes('Sit&Go') ? 'MTT' : 'Cash';
      const stakesMatch = block.match(/\$?([\d.]+)\/\$?([\d.]+)/);
      hand.stakes = stakesMatch ? `${stakesMatch[1]}/${stakesMatch[2]}` : 'Unknown';
      const heroMatch = block.match(/Dealt to (.+?) \[(.+?)\]/);
      hand.hero = heroMatch ? heroMatch[1] : 'Hero';
      hand.heroCards = heroMatch ? heroMatch[2].split(/[\s,]+/) : [];
      const boardMatches = [];
      const boardMatch = block.match(/Board: \[(.+?)\]/);
      if (boardMatch) boardMatches.push(...boardMatch[1].split(/[\s,]+/));
      hand.board = boardMatches;
      const potMatch = block.match(/Total pot[:\s]+\$?([\d.]+)/i);
      hand.pot = potMatch ? parseFloat(potMatch[1]) : 0;
      hand.button = 1;
      hand.actions = [];
      const actionLines = block.match(/.+? (?:folds|calls|raises|bets|checks|all-in).*/gi) || [];
      for (const line of actionLines) {
        const aMatch = line.match(
          /(.+?) (folds|calls|raises|bets|checks|all-in)(?:\s+\$?([\d.]+))?/i
        );
        if (aMatch) {
          hand.actions.push({
            player: aMatch[1].trim(),
            action: aMatch[2].toLowerCase(),
            amount: aMatch[3] ? parseFloat(aMatch[3]) : 0,
            isHero: aMatch[1].trim() === hand.hero,
          });
        }
      }
      const wonMatch = block.match(/collected \$?([\d.]+)/);
      hand.result = wonMatch ? parseFloat(wonMatch[1]) : 0;
      hand.rawText = block.substring(0, 500);
      hands.push(hand);
    } catch (e) {
      continue;
    }
  }
  return hands;
}

/**
 * AUTO-DETECT format and parse hands from any supported site
 */
function parseHandHistory(text) {
  if (text.includes('PokerStars')) return parsePokerStarsHand(text);
  if (text.includes('Poker Hand #') || text.includes('GGPoker') || text.includes('GG Network'))
    return parseGGPokerHand(text);
  if (text.includes('888poker') || text.includes('888 Hand')) return parse888Hand(text);
  if (
    text.includes('Winning Poker Network') ||
    text.includes('Game started at') ||
    text.includes('Americas Cardroom')
  )
    return parseWPNHand(text);
  // Fallback: try PokerStars format (most common)
  const psHands = parsePokerStarsHand(text);
  if (psHands.length > 0) return psHands;
  // Try all parsers
  const ggHands = parseGGPokerHand(text);
  if (ggHands.length > 0) return ggHands;
  const hands888 = parse888Hand(text);
  if (hands888.length > 0) return hands888;
  return parseWPNHand(text);
}

// Card rendering uses shared Card.tsx custom PNG deck

// ═══════════════════════════════════════════════════════════════════════════
// GTO COACHING ENGINE — 5-Tier Grading (Best → Blunder) + EV Loss
// ═══════════════════════════════════════════════════════════════════════════

const GRADE_TIERS = {
  BEST: {
    label: 'Best',
    icon: '✦',
    color: '#22c55e',
    bg: 'rgba(34,197,94,0.1)',
    border: 'rgba(34,197,94,0.3)',
  },
  CORRECT: {
    label: 'Correct',
    icon: '✓',
    color: '#3b82f6',
    bg: 'rgba(59,130,246,0.1)',
    border: 'rgba(59,130,246,0.3)',
  },
  INACCURACY: {
    label: 'Inaccuracy',
    icon: '~',
    color: '#fbbf24',
    bg: 'rgba(251,191,36,0.1)',
    border: 'rgba(251,191,36,0.3)',
  },
  MISTAKE: {
    label: 'Mistake',
    icon: '✗',
    color: '#f97316',
    bg: 'rgba(249,115,22,0.1)',
    border: 'rgba(249,115,22,0.3)',
  },
  BLUNDER: {
    label: 'Blunder',
    icon: '✗✗',
    color: '#ef4444',
    bg: 'rgba(239,68,68,0.1)',
    border: 'rgba(239,68,68,0.3)',
  },
};

function gradeHand(hand) {
  // HARDENED: Full try-catch prevents crash on malformed hand data
  try {
    const actions = Array.isArray(hand?.actions) ? hand.actions : [];
    const board = Array.isArray(hand?.board) ? hand.board : [];
    const heroActions = actions.filter((a) => a?.isHero);
    if (heroActions.length === 0)
      return {
        grade: 'N/A',
        tier: null,
        color: '#64748b',
        evLoss: 0,
        tips: [],
        position: 'UNK',
        street: 'preflop',
      };

    const folds = heroActions.filter((a) => a.action === 'folds').length;
    if (folds === 1 && heroActions.length === 1) {
      return {
        grade: 'CORRECT',
        tier: GRADE_TIERS.CORRECT,
        color: GRADE_TIERS.CORRECT.color,
        evLoss: 0,
        tips: [{ text: 'Folded preflop — standard line', type: 'info' }],
        position: 'UNK',
        street: 'preflop',
      };
    }

    const tips = [];
    let score = 100;
    let evLoss = 0;
    const calls = heroActions.filter((a) => a.action === 'calls').length;
    const raises = heroActions.filter((a) => a.action === 'raises' || a.action === 'bets').length;
    const checks = heroActions.filter((a) => a.action === 'checks').length;
    const potSize = Math.max(hand?.pot || 0, 1);

    // Determine street depth for classification
    const street =
      board.length >= 5
        ? 'river'
        : board.length >= 4
          ? 'turn'
          : board.length >= 3
            ? 'flop'
            : 'preflop';

    // RULE 1: Passive play leak (calls without raising)
    if (calls > 2 && raises === 0) {
      tips.push({
        text: 'Too passive — consider raising for value or as a bluff',
        type: 'warning',
      });
      score -= 30;
      evLoss += potSize * 0.08;
    }

    // RULE 2: Flatting preflop when 3-betting is better
    if (raises > 0 && board.length === 0 && heroActions[0]?.action === 'calls') {
      const preRaise = actions.find(
        (a) => !a.isHero && (a.action === 'raises' || a.action === 'bets')
      );
      if (preRaise) {
        tips.push({
          text: 'Flatting vs raise — consider 3-betting for value or as a bluff',
          type: 'warning',
        });
        score -= 15;
        evLoss += potSize * 0.04;
      }
    }

    // RULE 3: Oversized bets on dry boards
    const bigBets = heroActions.filter((a) => (a?.amount || 0) > potSize * 0.8);
    if (bigBets.length > 0 && board.length >= 3) {
      const betPct = Math.round(((bigBets[0].amount || 0) / potSize) * 100);
      tips.push({
        text: `Overbetting ${betPct}% pot — consider 33-50% on dry textures`,
        type: 'info',
      });
      score -= 10;
      evLoss += potSize * 0.03;
    }

    // RULE 4: Missed continuation bet
    const isPreRaiser = heroActions[0]?.action === 'raises' || heroActions[0]?.action === 'bets';
    if (isPreRaiser && checks > 0 && board.length >= 3) {
      tips.push({
        text: 'Missed c-bet as preflop aggressor — GTO c-bets ~65% of flops',
        type: 'warning',
      });
      score -= 20;
      evLoss += potSize * 0.06;
    }

    // RULE 5: Check-call river with no showdown value
    if (board.length >= 5 && heroActions.length >= 3) {
      const lastAction = heroActions[heroActions.length - 1];
      if (lastAction?.action === 'calls' && hand?.result === 0) {
        tips.push({
          text: 'Called river and lost — hero call may be a blunder at this frequency',
          type: 'warning',
        });
        score -= 25;
        evLoss += potSize * 0.12;
      }
    }

    // RULE 6: All-in preflop without premium
    const allins = heroActions.filter((a) => a.action === 'all-in');
    if (allins.length > 0 && board.length === 0) {
      score -= 5;
      tips.push({ text: 'Preflop all-in — ensure this is +EV at your stack depth', type: 'info' });
    }

    // Positive detection
    if (isPreRaiser && raises >= 2 && (hand?.result || 0) > 0) {
      score += 10;
      tips.push({ text: 'Aggressive value line rewarded — strong play', type: 'good' });
    }
    if (tips.length === 0) {
      tips.push({ text: 'Clean line — no detectable GTO deviations', type: 'good' });
    }

    // Clamp
    score = Math.max(0, Math.min(100, score));
    evLoss = Math.round(evLoss * 100) / 100;

    // Map to 5-tier grade
    let gradeName, tier;
    if (score >= 90) {
      gradeName = 'BEST';
      tier = GRADE_TIERS.BEST;
    } else if (score >= 75) {
      gradeName = 'CORRECT';
      tier = GRADE_TIERS.CORRECT;
    } else if (score >= 55) {
      gradeName = 'INACCURACY';
      tier = GRADE_TIERS.INACCURACY;
    } else if (score >= 30) {
      gradeName = 'MISTAKE';
      tier = GRADE_TIERS.MISTAKE;
    } else {
      gradeName = 'BLUNDER';
      tier = GRADE_TIERS.BLUNDER;
    }

    return {
      grade: gradeName,
      tier,
      color: tier.color,
      evLoss,
      tips,
      score,
      position: 'UNK',
      street,
    };
  } catch (err) {
    console.warn('[HH Analyzer] gradeHand error:', err);
    return {
      grade: 'CORRECT',
      tier: GRADE_TIERS.CORRECT,
      color: GRADE_TIERS.CORRECT.color,
      evLoss: 0,
      tips: [{ text: 'Analysis unavailable for this hand', type: 'info' }],
      score: 75,
      position: 'UNK',
      street: 'preflop',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// LEAK REPORT — Aggregate analysis across all uploaded hands
// ═══════════════════════════════════════════════════════════════════════════

function LeakReport({ hands }) {
  if (!Array.isArray(hands) || hands.length === 0) return null;

  // HARDENED: filter out nulls and ensure each hand has minimum required shape
  const validHands = hands.filter((h) => h && typeof h === 'object');
  if (validHands.length === 0) return null;

  const graded = validHands.map((h) => gradeHand(h));
  const counts = { BEST: 0, CORRECT: 0, INACCURACY: 0, MISTAKE: 0, BLUNDER: 0, 'N/A': 0 };
  let totalEVLoss = 0;
  const streetLeaks = {
    preflop: { count: 0, evLoss: 0 },
    flop: { count: 0, evLoss: 0 },
    turn: { count: 0, evLoss: 0 },
    river: { count: 0, evLoss: 0 },
  };

  graded.forEach((g) => {
    if (!g || typeof g.grade !== 'string') return;
    counts[g.grade] = (counts[g.grade] || 0) + 1;
    totalEVLoss += typeof g.evLoss === 'number' && isFinite(g.evLoss) ? g.evLoss : 0;
    if (
      g.street &&
      streetLeaks[g.street] &&
      (g.grade === 'MISTAKE' || g.grade === 'BLUNDER' || g.grade === 'INACCURACY')
    ) {
      streetLeaks[g.street].count++;
      streetLeaks[g.street].evLoss +=
        typeof g.evLoss === 'number' && isFinite(g.evLoss) ? g.evLoss : 0;
    }
  });

  const total = validHands.length;
  const denominator = Math.max(total - (counts['N/A'] || 0), 1);
  const accuracy = Math.min(
    100,
    Math.max(0, Math.round(((counts.BEST + counts.CORRECT) / denominator) * 100))
  );
  const sortedStreets = Object.entries(streetLeaks).sort((a, b) => b[1].evLoss - a[1].evLoss);
  const worstStreet = sortedStreets[0] || ['preflop', { count: 0, evLoss: 0 }];

  // Grade distribution bar
  const gradeBars = ['BEST', 'CORRECT', 'INACCURACY', 'MISTAKE', 'BLUNDER'].filter(
    (g) => counts[g] > 0
  );
  const barTotal = Math.max(
    1,
    gradeBars.reduce((s, g) => s + counts[g], 0)
  ); // HARDENED: prevent div-by-zero

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        marginBottom: 20,
        borderRadius: 16,
        background: 'rgba(0,0,0,0.3)',
        border: '1px solid rgba(255,255,255,0.06)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 800, color: '#e2e8f0' }}>📊 GTO Leak Report</div>
        <div style={{ fontSize: 11, color: '#64748b' }}>{total} hands analyzed</div>
      </div>

      {/* Grade Distribution Bar */}
      <div style={{ padding: '16px 20px' }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: 1,
            marginBottom: 8,
          }}
        >
          Grade Distribution
        </div>
        <div
          style={{
            display: 'flex',
            height: 24,
            borderRadius: 6,
            overflow: 'hidden',
            marginBottom: 12,
          }}
        >
          {gradeBars.map((g) => (
            <div
              key={g}
              style={{
                width: `${(counts[g] / barTotal) * 100}%`,
                background: GRADE_TIERS[g].color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 8,
                fontWeight: 800,
                color: '#fff',
                minWidth: counts[g] > 0 ? 20 : 0,
              }}
            >
              {counts[g]}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {gradeBars.map((g) => (
            <div key={g} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
              <div
                style={{ width: 8, height: 8, borderRadius: 2, background: GRADE_TIERS[g].color }}
              />
              <span style={{ color: '#94a3b8' }}>
                {GRADE_TIERS[g].label}: <strong style={{ color: '#e2e8f0' }}>{counts[g]}</strong>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Key Metrics */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 8,
          padding: '0 20px 16px',
        }}
      >
        <div
          style={{
            padding: '12px',
            borderRadius: 10,
            background: 'rgba(255,255,255,0.03)',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: 22,
              fontWeight: 900,
              color: accuracy >= 70 ? '#22c55e' : accuracy >= 50 ? '#fbbf24' : '#ef4444',
            }}
          >
            {accuracy}%
          </div>
          <div
            style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}
          >
            GTO Accuracy
          </div>
        </div>
        <div
          style={{
            padding: '12px',
            borderRadius: 10,
            background: 'rgba(255,255,255,0.03)',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 900, color: '#ef4444' }}>
            -{(Number.isFinite(Number(totalEVLoss)) ? Number(totalEVLoss) : 0).toFixed(1)}
          </div>
          <div
            style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}
          >
            Total EV Loss ($)
          </div>
        </div>
        <div
          style={{
            padding: '12px',
            borderRadius: 10,
            background: 'rgba(255,255,255,0.03)',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 900, color: '#f97316' }}>
            {counts.MISTAKE + counts.BLUNDER}
          </div>
          <div
            style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}
          >
            Mistakes
          </div>
        </div>
      </div>

      {/* Street Breakdown */}
      <div style={{ padding: '0 20px 16px' }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: 1,
            marginBottom: 8,
          }}
        >
          Leak Hotspots by Street
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          {Object.entries(streetLeaks).map(([street, data]) => (
            <div
              key={street}
              style={{
                padding: '10px 8px',
                borderRadius: 8,
                textAlign: 'center',
                background:
                  worstStreet[0] === street && data.count > 0
                    ? 'rgba(239,68,68,0.1)'
                    : 'rgba(255,255,255,0.02)',
                border: `1px solid ${worstStreet[0] === street && data.count > 0 ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.05)'}`,
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 800,
                  color: data.count > 0 ? '#ef4444' : '#475569',
                }}
              >
                {data.count}
              </div>
              <div
                style={{
                  fontSize: 8,
                  fontWeight: 700,
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                {street}
              </div>
              {data.evLoss > 0 && (
                <div style={{ fontSize: 8, color: '#ef4444', marginTop: 2 }}>
                  -${(Number.isFinite(Number(data.evLoss)) ? Number(data.evLoss) : 0).toFixed(1)}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Top Coaching Insight */}
      {worstStreet?.[1]?.count > 0 && (
        <div style={{ padding: '12px 20px 16px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ fontSize: 11, color: '#fbbf24', fontWeight: 700, marginBottom: 4 }}>
            💡 Primary Leak
          </div>
          <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.5 }}>
            Your biggest leak is on the{' '}
            <strong style={{ color: '#ef4444' }}>{worstStreet[0]}</strong> ({worstStreet[1].count}{' '}
            mistakes, -${(Number.isFinite(Number(worstStreet[1].evLoss)) ? Number(worstStreet[1].evLoss) : 0).toFixed(1)} EV). Focus your study on {worstStreet[0]}{' '}
            play to recapture the most EV.
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ANALYZED HAND ROW (with GTO Coaching)
// ═══════════════════════════════════════════════════════════════════════════

function AnalyzedHandRow({ hand, index }) {
  const [expanded, setExpanded] = useState(false);
  const heroActions = hand.actions.filter((a) => a.isHero);
  const heroActionSummary = heroActions.map((a) => a.action).join(' → ') || 'N/A';
  const coaching = gradeHand(hand);
  const tier = coaching.tier || GRADE_TIERS.CORRECT;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 1) }}
      style={{
        marginBottom: 8,
        borderRadius: 10,
        background: 'rgba(0,0,0,0.25)',
        border: `1px solid ${expanded ? tier.border : 'rgba(255,255,255,0.06)'}`,
        overflow: 'hidden',
        transition: 'border-color 0.2s',
      }}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: '100%',
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: tier.bg,
            border: `2px solid ${tier.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            fontWeight: 800,
            color: tier.color,
            letterSpacing: 0.3,
          }}
        >
          {tier.icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 3 }}>
            {hand.heroCards.map((c, i) => (
              <Card key={i} rank={c[0]?.toUpperCase()} suit={c[1]?.toLowerCase()} size="tiny" />
            ))}
            {hand.board.length > 0 && (
              <>
                <span style={{ color: '#475569', margin: '0 2px' }}>|</span>
                {hand.board.map((c, i) => (
                  <Card
                    key={`b${i}`}
                    rank={c[0]?.toUpperCase()}
                    suit={c[1]?.toLowerCase()}
                    size="tiny"
                  />
                ))}
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, fontSize: 10, color: '#94a3b8' }}>
            <span>
              {hand.gameType} {hand.stakes}
            </span>
            <span style={{ color: '#475569' }}>•</span>
            <span>{heroActionSummary}</span>
            {coaching.evLoss > 0 && (
              <>
                <span style={{ color: '#475569' }}>•</span>
                <span style={{ color: '#ef4444', fontWeight: 700 }}>
                  -${(Number.isFinite(Number(coaching.evLoss)) ? Number(coaching.evLoss) : 0).toFixed(2)} EV
                </span>
              </>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: hand.result > 0 ? '#22c55e' : hand.result < 0 ? '#ef4444' : '#94a3b8',
            }}
          >
            {hand.result > 0 ? '+' : ''}
            {hand.pot > 0 ? `$${(Number.isFinite(Number(hand.pot)) ? Number(hand.pot) : 0).toFixed(0)}` : ''}
          </div>
          <div
            style={{ fontSize: 8, fontWeight: 700, color: tier.color, textTransform: 'uppercase' }}
          >
            {tier.label}
          </div>
        </div>
        <span
          style={{
            color: '#475569',
            fontSize: 14,
            transform: expanded ? 'rotate(180deg)' : '',
            transition: 'transform 0.2s',
          }}
        >
          ▼
        </span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ padding: '0 14px 12px', overflow: 'hidden' }}
          >
            {/* Action Sequence */}
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.05)',
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#64748b',
                  letterSpacing: 0.5,
                  marginBottom: 6,
                }}
              >
                ACTION SEQUENCE
              </div>
              {hand.actions.map((a, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    gap: 8,
                    padding: '3px 0',
                    fontSize: 11,
                    color: a.isHero ? '#00d4ff' : '#94a3b8',
                    fontWeight: a.isHero ? 700 : 400,
                  }}
                >
                  <span
                    style={{
                      width: 80,
                      textOverflow: 'ellipsis',
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {a.player}
                  </span>
                  <span style={{ textTransform: 'uppercase', fontWeight: 600 }}>{a.action}</span>
                  {a.amount > 0 && <span>${(Number.isFinite(Number(a.amount)) ? Number(a.amount) : 0).toFixed(2)}</span>}
                </div>
              ))}
            </div>

            {/* GTO Coaching Panel — 5-Tier */}
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                background: tier.bg,
                border: `1px solid ${tier.border}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div
                  style={{
                    padding: '3px 10px',
                    borderRadius: 6,
                    fontSize: 10,
                    fontWeight: 800,
                    background: `${tier.color}25`,
                    color: tier.color,
                    letterSpacing: 0.5,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <span>{tier.icon}</span> {tier.label.toUpperCase()}
                </div>
                {coaching.evLoss > 0 && (
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#ef4444' }}>
                    -{(Number.isFinite(Number(coaching.evLoss)) ? Number(coaching.evLoss) : 0).toFixed(2)} EV
                  </div>
                )}
                {coaching.score !== undefined && (
                  <div style={{ fontSize: 9, color: '#64748b', marginLeft: 'auto' }}>
                    Score: {coaching.score}/100
                  </div>
                )}
              </div>
              {coaching.tips.map((tip, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    gap: 6,
                    padding: '4px 0',
                    fontSize: 11,
                    color:
                      tip.type === 'good'
                        ? '#22c55e'
                        : tip.type === 'warning'
                          ? '#fbbf24'
                          : '#cbd5e1',
                  }}
                >
                  <span style={{ fontSize: 10, flexShrink: 0 }}>
                    {tip.type === 'good'
                      ? '✓'
                      : tip.type === 'warning'
                        ? '⚠'
                        : tip.type === 'tip'
                          ? '💡'
                          : 'ℹ'}
                  </span>
                  <span>{tip.text}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function HandHistoryUploadPage() {
  const router = useRouter();
  useTrainingBus('hand-history-upload');
  const fileInputRef = useRef(null);
  const [parsedHands, setParsedHands] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [stats, setStats] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null); // { current, total, currentFile }
  const [savedSessions, setSavedSessions] = useState([]);
  const [activeView, setActiveView] = useState('upload'); // 'upload' | 'history'

  // Load saved session history on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = JSON.parse(localStorage.getItem('hh_sessions') || '[]');
      setSavedSessions(saved);
    } catch {
      /* ignore */
    }
  }, []);

  // Bus Listener
  useEffect(() => {
    const unsub = eventBus.on(EventType?.SESSION_END || 'session:end', () => {
      console.log('[HandHistoryUpload] Session complete event received');
    });
    return unsub;
  }, []);

  // Save session to Supabase and localStorage
  const saveAnalyzedSession = useCallback(async (hands) => {
    if (!hands || hands.length === 0) return;
    const sessionData = {
      id: `hh-${Date.now()}`,
      game_id: 'hand-history-review',
      timestamp: new Date().toISOString(),
      totalHands: hands.length,
      heroActions: hands.reduce((s, h) => s + h.actions.filter((a) => a.isHero).length, 0),
      withShowdown: hands.filter((h) => h.board.length >= 3).length,
      avgPot: hands.reduce((s, h) => s + h.pot, 0) / hands.length,
      site: hands[0]?.site || 'Unknown',
    };

    // Save to localStorage
    try {
      const prev = JSON.parse(localStorage.getItem('hh_sessions') || '[]');
      const updated = [sessionData, ...prev].slice(0, 20); // Keep last 20
      localStorage.setItem('hh_sessions', JSON.stringify(updated));
      setSavedSessions(updated);
    } catch {
      /* ignore */
    }

    // Save to Supabase
    try {
      const token = await getAccessToken();
      if (token) {
        await fetch('/api/training/save-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            gameId: 'hand-history-review',
            gameName: `Hand History Review (${sessionData.totalHands} hands)`,
            gtowScore: Math.round(
              (sessionData.withShowdown / Math.max(sessionData.totalHands, 1)) * 100
            ),
            totalEVLoss: 0,
            handsPlayed: sessionData.totalHands,
            mistakeCount: 0,
            accuracy: Math.round(
              (sessionData.withShowdown / Math.max(sessionData.totalHands, 1)) * 100
            ),
            correctCount: sessionData.withShowdown,
            bestStreak: 0,
            levelPassed: true,
            level: 1,
            handHistory: [],
          }),
        });
      }
    } catch {
      /* Supabase save optional */
    }

    // EventBus emit
    if (typeof eventBus !== 'undefined' && eventBus.emit) {
      eventBus?.emit?.(
        EventType?.TRAINING_SESSION_COMPLETE || 'training:session-complete',
        sessionData
      );
    }
    if (typeof window !== 'undefined') {
      eventBus?.emit?.('training:hand-history-uploaded', sessionData, 'HandHistoryUpload');
    }

    // Emit GTO coaching aggregate for dashboard/leak-finder reactivity
    if (typeof eventBus !== 'undefined' && eventBus.emit && hands && hands.length > 0) {
      const coachingAggregate = { gto: 0, ok: 0, leak: 0, total: hands.length };
      hands.forEach((h) => {
        try {
          const { grade } = gradeHand(h);
          if (grade === 'GTO') coachingAggregate.gto++;
          else if (grade === 'OK' || grade === 'N/A') coachingAggregate.ok++;
          else coachingAggregate.leak++;
        } catch {
          coachingAggregate.ok++;
        }
      });
      eventBus?.emit?.('training:coaching-summary', coachingAggregate, 'HandHistoryUpload');
    }
  }, []);

  const handleFile = useCallback(async (file) => {
    if (!file) return [];
    const text = await file.text();
    return parseHandHistory(text);
  }, []);

  const handleFiles = useCallback(
    async (files) => {
      if (!files || files.length === 0) return;
      setIsAnalyzing(true);
      const fileList = Array.from(files);
      let accumulated = [...parsedHands];

      for (let i = 0; i < fileList.length; i++) {
        setUploadProgress({ current: i, total: fileList.length, currentFile: fileList[i].name });
        const hands = await handleFile(fileList[i]);
        accumulated = [...accumulated, ...hands];
        setParsedHands([...accumulated]);
      }

      setUploadProgress({
        current: fileList.length,
        total: fileList.length,
        currentFile: 'Complete',
      });

      const totalHands = accumulated.length;
      const heroActions = accumulated.reduce(
        (sum, h) => sum + h.actions.filter((a) => a.isHero).length,
        0
      );
      const withShowdown = accumulated.filter((h) => h.board.length >= 3).length;
      const detectedSite = accumulated[0]?.site || 'Unknown';

      setStats({
        totalHands,
        heroActions,
        withShowdown,
        avgPot: totalHands > 0 ? accumulated.reduce((s, h) => s + h.pot, 0) / totalHands : 0,
        detectedSite,
      });

      await saveAnalyzedSession(accumulated);

      setIsAnalyzing(false);
      setUploadProgress(null);
    },
    [parsedHands, handleFile, saveAnalyzedSession]
  );

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragOver(false);
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) handleFiles(files);
    },
    [handleFiles]
  );

  return (
    <>
      <Head>
        <title>Hand History Analysis | Smarter.Poker GTO Training</title>
      </Head>
      <div
        style={{
          minHeight: '100vh',
          background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 50%, #0a0a1a 100%)',
          color: '#e2e8f0',
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <button
            onClick={() => router.push('/hub/training')}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: 'none',
              color: '#94a3b8',
              fontSize: 18,
              cursor: 'pointer',
              width: 36,
              height: 36,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            \u2190
          </button>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>
              Hand History Analysis
            </div>
            <div style={{ fontSize: 11, color: '#64748b' }}>
              Upload hands from PokerStars, GGPoker, or ACR
            </div>
          </div>
        </div>

        <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>
          {/* View Tabs */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            {[
              { key: 'upload', label: 'Upload & Analyze' },
              { key: 'history', label: `History (${savedSessions.length})` },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveView(tab.key)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: 'none',
                  transition: 'all 0.15s',
                  background:
                    activeView === tab.key
                      ? 'linear-gradient(135deg, #00d4ff, #7c3aed)'
                      : 'rgba(255,255,255,0.06)',
                  color: activeView === tab.key ? '#fff' : '#94a3b8',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Upload Progress Bar */}
          {uploadProgress && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{
                marginBottom: 12,
                padding: '10px 14px',
                borderRadius: 10,
                background: 'rgba(0,212,255,0.05)',
                border: '1px solid rgba(0,212,255,0.2)',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: '#00d4ff', marginBottom: 6 }}>
                Parsing: {uploadProgress.currentFile}
              </div>
              <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                  style={{ height: '100%', borderRadius: 2, background: '#00d4ff' }}
                />
              </div>
              <div style={{ fontSize: 9, color: '#64748b', marginTop: 4 }}>
                {uploadProgress.current} / {uploadProgress.total} files processed
              </div>
            </motion.div>
          )}

          {/* Session History View */}
          {activeView === 'history' ? (
            <div>
              {savedSessions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#475569', fontSize: 12 }}>
                  No saved sessions yet. Upload hand histories to get started.
                </div>
              ) : (
                savedSessions.map((session, i) => (
                  <div
                    key={session.id || i}
                    style={{
                      marginBottom: 8,
                      padding: '12px 14px',
                      borderRadius: 10,
                      background: 'rgba(0,0,0,0.25)',
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>
                          {session.totalHands} hands from {session.site}
                        </div>
                        <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                          {new Date(session.timestamp).toLocaleDateString()} • {session.heroActions}{' '}
                          decisions • Avg pot ${(Number.isFinite(Number(session.avgPot)) ? Number(session.avgPot) : 0).toFixed(0) || 'N/A'}
                        </div>
                      </div>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 800,
                          color: '#00d4ff',
                          fontFamily: "'Orbitron', monospace",
                        }}
                      >
                        {session.withShowdown || 0} SD
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <>
              {/* Upload Zone */}
              {parsedHands.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDrop}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    padding: '60px 30px',
                    borderRadius: 16,
                    border: `2px dashed ${dragOver ? '#00d4ff' : 'rgba(255,255,255,0.1)'}`,
                    background: dragOver ? 'rgba(0,212,255,0.05)' : 'rgba(0,0,0,0.2)',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>
                    {isAnalyzing ? '\u23F3' : '\uD83D\uDCC2'}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 8 }}>
                    {isAnalyzing ? 'Analyzing...' : 'Drop Hand History File Here'}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    Supports .txt files from PokerStars, GGPoker, 888, ACR — drop multiple files at
                    once
                  </div>
                  <div
                    style={{
                      marginTop: 20,
                      padding: '10px 24px',
                      borderRadius: 10,
                      background: 'rgba(0,212,255,0.1)',
                      border: '1px solid rgba(0,212,255,0.2)',
                      color: '#00d4ff',
                      fontSize: 13,
                      fontWeight: 700,
                      display: 'inline-block',
                    }}
                  >
                    Browse Files
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.log"
                    multiple
                    onChange={(e) => handleFiles(e.target.files)}
                    style={{ display: 'none' }}
                  />
                </motion.div>
              )}

              {/* Stats Summary */}
              {stats && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: 8,
                    marginBottom: 16,
                  }}
                >
                  {[
                    { label: 'Hands', value: stats.totalHands, color: '#00d4ff' },
                    { label: 'Actions', value: stats.heroActions, color: '#a855f7' },
                    { label: 'Showdowns', value: stats.withShowdown, color: '#22c55e' },
                    { label: 'Avg Pot', value: `$${(Number.isFinite(Number(stats.avgPot)) ? Number(stats.avgPot) : 0).toFixed(0)}`, color: '#fbbf24' },
                  ].map((s, i) => (
                    <div
                      key={i}
                      style={{
                        padding: '12px 8px',
                        borderRadius: 10,
                        textAlign: 'center',
                        background: 'rgba(0,0,0,0.2)',
                        border: '1px solid rgba(255,255,255,0.06)',
                      }}
                    >
                      <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</div>
                      <div
                        style={{
                          fontSize: 9,
                          fontWeight: 600,
                          color: '#64748b',
                          textTransform: 'uppercase',
                          letterSpacing: 0.5,
                        }}
                      >
                        {s.label}
                      </div>
                    </div>
                  ))}
                </motion.div>
              )}

              {/* Leak Report */}
              {parsedHands.length > 0 && <LeakReport hands={parsedHands} />}

              {/* Parsed Hands List */}
              {parsedHands.length > 0 && (
                <>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 12,
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>
                      {parsedHands.length} Hands Parsed
                    </div>
                    <button
                      onClick={() => {
                        setParsedHands([]);
                        setStats(null);
                      }}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 8,
                        border: '1px solid rgba(255,255,255,0.1)',
                        background: 'rgba(255,255,255,0.03)',
                        color: '#94a3b8',
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Upload New File
                    </button>
                  </div>
                  {parsedHands.slice(0, 50).map((hand, i) => (
                    <AnalyzedHandRow key={hand.id} hand={hand} index={i} />
                  ))}
                  {parsedHands.length > 50 && (
                    <div
                      style={{ textAlign: 'center', padding: 12, color: '#64748b', fontSize: 12 }}
                    >
                      Showing first 50 of {parsedHands.length} hands
                    </div>
                  )}
                </>
              )}
            </> /* end activeView === 'upload' */
          )}
        </div>
      </div>
    </>
  );
}
