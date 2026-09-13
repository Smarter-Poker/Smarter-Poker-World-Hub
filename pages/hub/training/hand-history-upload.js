/**
 * HAND HISTORY UPLOAD — Provenance-Audited Hand Review
 * ═══════════════════════════════════════════════════════════════════════════
 * Upload hand histories from PokerStars/GG/ACR for replay and server audit.
 * Only exact, provenance-complete server decisions receive grades or EV data.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// TRAIN-CATCH-FIX-1 — replaced silent catch blocks with console.warn-backed handlers
// TRAIN-CSS-TOKENS-BATCH4-4 — hex sweep batch 4: literals routed to --sp-* tokens
// TRAIN-CSS-GRADIENT-ADOPT-18 — gradient hex routed to rgba(var(--sp-*-rgb), 1)
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { getAccessToken, authedFetch } from '../../../src/lib/authUtils';
import { createBoundedTrainingFetch } from '../../../src/lib/training/boundedTrainingFetch';
import { savePracticeSession } from '../../../src/lib/training/practiceSession';
import {
  isProvenanceCompleteAuditedDecision,
  summarizeProvenanceCompleteHandAudit,
} from '../../../src/lib/training/handHistoryReviewAuthority.mjs';
import Card from '../../../src/components/training/Card';
// ── Phase 5 Engines: Hand History Analysis Pipeline ──────────────────────
import { parseHandHistory as engineParseHandHistory, detectSite } from '../../../src/engines/HandHistoryParser';
import TrainerEmptyState from '../../../src/components/training/TrainerEmptyState';

const trainingFetch = createBoundedTrainingFetch(authedFetch);
// TRAIN-WIRE-EMPTY-7b — adoption: shared empty-state primitive

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
      hand.button = buttonMatch ? parseInt(buttonMatch[1], 10) : 1;
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
 * AUTO-DETECT format and parse hands from any supported site.
 * Uses Phase 5 HandHistoryParser engine first (structured output with streets,
 * decision points, etc.), falling back to inline parsers for WPN/edge cases.
 */
function parseHandHistory(text) {
  // Try the engine parser first — produces richer structured output
  try {
    const engineHands = engineParseHandHistory(text);
    if (engineHands && engineHands.length > 0) {
      // Engine hands have structured streets — adapt to the flat format this page expects
      return engineHands.map(h => ({
        id: h.id,
        site: h.site || detectSite(text),
        gameType: h.gameType || 'Cash',
        stakes: h.stakes || 'Unknown',
        hero: h.hero?.name || 'Hero',
        heroCards: h.hero?.holeCards || [],
        board: _extractBoard(h),
        pot: h.result?.pot || 0,
        actions: _flattenActions(h),
        result: h.result?.heroes?.[0]?.won || 0,
        rawText: (h._raw || '').substring(0, 500),
        // Preserve the full engine hand for deep analysis
        _engineHand: h,
      }));
    }
  } catch (e) {
    console.warn('[HH] Engine parser failed, using inline fallback:', e.message);
  }

  // Fallback to inline parsers (handles WPN and edge cases)
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
  const psHands = parsePokerStarsHand(text);
  if (psHands.length > 0) return psHands;
  const ggHands = parseGGPokerHand(text);
  if (ggHands.length > 0) return ggHands;
  const hands888 = parse888Hand(text);
  if (hands888.length > 0) return hands888;
  return parseWPNHand(text);
}

/** Extract flat board array from engine's structured streets */
function _extractBoard(hand) {
  const board = [];
  if (hand.streets?.flop?.board) board.push(...hand.streets.flop.board);
  if (hand.streets?.turn?.board) board.push(...hand.streets.turn.board);
  if (hand.streets?.river?.board) board.push(...hand.streets.river.board);
  return board;
}

/** Flatten engine's street-based actions into the flat array this page uses */
function _flattenActions(hand) {
  const actions = [];
  const heroName = hand.hero?.name || 'Hero';
  for (const street of ['preflop', 'flop', 'turn', 'river']) {
    const streetData = hand.streets?.[street];
    if (!streetData?.actions) continue;
    for (const a of streetData.actions) {
      actions.push({
        player: a.player || 'Unknown',
        // A parse gap must not fabricate a check — 'unknown' matches no
        // coaching rule, so downstream rules naturally skip it.
        action: (a.action || 'unknown').toLowerCase(),
        amount: a.amount || 0,
        isHero: a.player === heroName,
        street,
      });
    }
  }
  return actions;
}

// Card rendering uses shared Card.tsx custom PNG deck

// ═══════════════════════════════════════════════════════════════════════════
// PROVENANCE-AUDITED GRADING — no local heuristic grading or EV estimation
// ═══════════════════════════════════════════════════════════════════════════

const GRADE_TIERS = {
  UNPRICED: {
    label: 'Not priced',
    icon: '-',
    color: 'var(--sp-fg-dim)',
    bg: 'rgba(148,163,184,0.07)',
    border: 'rgba(148,163,184,0.18)',
  },
  BEST: {
    label: 'Best',
    icon: '◆',
    color: 'var(--sp-accent-green)',
    bg: 'rgba(34,197,94,0.1)',
    border: 'rgba(34,197,94,0.3)',
  },
  CORRECT: {
    label: 'Correct',
    icon: '✓',
    color: 'var(--sp-accent-blue)',
    bg: 'rgba(59,130,246,0.1)',
    border: 'rgba(59,130,246,0.3)',
  },
  INACCURACY: {
    label: 'Inaccuracy',
    icon: '~',
    color: 'var(--sp-accent-amber)',
    bg: 'rgba(251,191,36,0.1)',
    border: 'rgba(251,191,36,0.3)',
  },
  MISTAKE: {
    label: 'Mistake',
    icon: '✕',
    color: 'var(--sp-accent-orange)',
    bg: 'rgba(249,115,22,0.1)',
    border: 'rgba(249,115,22,0.3)',
  },
  BLUNDER: {
    label: 'Blunder',
    icon: '✕✕',
    color: 'var(--sp-accent-red)',
    bg: 'rgba(239,68,68,0.1)',
    border: 'rgba(239,68,68,0.3)',
  },
};

function unpricedHand(hand, decisions = []) {
  const board = Array.isArray(hand?.board) ? hand.board : [];
  const street = decisions.at(-1)?.street
    || (board.length >= 5 ? 'river' : board.length === 4 ? 'turn' : board.length === 3 ? 'flop' : 'preflop');
  return {
    grade: 'N/A',
    tier: GRADE_TIERS.UNPRICED,
    color: GRADE_TIERS.UNPRICED.color,
    evLoss: null,
    score: null,
    position: hand?._engineHand?.hero?.position || deriveHeroPosition(hand),
    street,
    solverVerified: false,
    verifiedDecisions: 0,
    tips: [{
      text: 'Replay Only: This Hand Does Not Have Complete Exact-Node Server Audit Evidence, So No Grade, Value Estimate, Or Strategic Recommendation Is Shown.',
      type: 'info',
    }],
  };
}

function gradeHand(hand) {
  const audited = summarizeProvenanceCompleteHandAudit(hand?._solverAudit);
  const decisions = audited.decisions;
  // A hand-level grade is shown only when every audited hero decision carries
  // the server's exact-node match and provenance-complete v3 audit seal. A
  // partially priced hand remains replay-only rather than laundering a subset
  // of decisions into a grade for the whole hand.
  if (!audited.solverVerified) {
    return unpricedHand(hand, decisions);
  }

  const correct = audited.correctDecisions;
  const score = audited.score;
  const evLoss = audited.evLoss;
  let gradeName;
  let tier;
  if (score >= 90) { gradeName = 'BEST'; tier = GRADE_TIERS.BEST; }
  else if (score >= 75) { gradeName = 'CORRECT'; tier = GRADE_TIERS.CORRECT; }
  else if (score >= 55) { gradeName = 'INACCURACY'; tier = GRADE_TIERS.INACCURACY; }
  else if (score >= 30) { gradeName = 'MISTAKE'; tier = GRADE_TIERS.MISTAKE; }
  else { gradeName = 'BLUNDER'; tier = GRADE_TIERS.BLUNDER; }

  return {
    grade: gradeName,
    tier,
    color: tier.color,
    evLoss,
    score,
    position: hand?._engineHand?.hero?.position || deriveHeroPosition(hand),
    street: decisions.at(-1)?.street || 'preflop',
    solverVerified: true,
    verifiedDecisions: decisions.length,
    correctDecisions: correct,
    mistakeDecisions: decisions.length - correct,
    tips: decisions.map(d => ({
      text: `${d.street}: ${d.playerAction} - ${d.classification}${d.solverAction ? ` | Audited Action: ${d.solverAction}` : ''}${d.evLossMeasured ? ` (${Number(d.evLoss).toFixed(2)} BB Measured Action-EV Loss)` : ' (Action EV Not Available)'}`,
      type: ['best', 'correct'].includes(String(d.classification).toLowerCase()) ? 'good' : 'warning',
    })),
  };
}

// ── Helper: Derive hero position from seat data and button ──────────
function deriveHeroPosition(hand) {
  try {
    const actions = Array.isArray(hand?.actions) ? hand.actions : [];
    const heroName = hand?.hero || '';
    if (!heroName) return 'UNK';

    // Check if hero is first to act preflop (UTG indicator)
    const preflopActions = actions.filter((a) => a && typeof a === 'object');
    const heroIdx = preflopActions.findIndex((a) => a.isHero);
    const totalPlayers = new Set(preflopActions.map((a) => a.player)).size;

    if (totalPlayers <= 0) return 'UNK';

    // Approximate position from action order and player count
    // In standard poker, action order preflop: UTG → MP → CO → BTN → SB → BB
    if (totalPlayers <= 3) {
      if (heroIdx === 0) return 'BTN';
      if (heroIdx === 1) return 'SB';
      return 'BB';
    }
    if (totalPlayers <= 6) {
      const posMap6 = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
      return posMap6[Math.min(heroIdx, posMap6.length - 1)] || 'UNK';
    }
    const posMap9 = ['UTG', 'UTG+1', 'MP', 'MP+1', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
    return posMap9[Math.min(heroIdx, posMap9.length - 1)] || 'UNK';
  } catch (_) {
    return 'UNK';
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

  const graded = validHands.map((h) => gradeHand(h)).filter(g => g?.solverVerified);
  if (graded.length === 0) {
    return (
      <div role="status" style={{ marginBottom: 20, padding: '16px 20px', borderRadius: 14, background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.2)', color: 'var(--sp-fg-muted)', fontSize: 12, lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--sp-accent-blue)' }}>No Provenance-Complete Audit Grade Yet.</strong>{' '}
        These Hands Remain Available For Replay. Unmatched, Partial, Or Ambiguous Decisions Are Excluded From GTO Accuracy, EV Loss, And Leak Finder Evidence; Only Complete Exact-Node Audits Enter The Metrics Below.
      </div>
    );
  }
  const counts = { BEST: 0, CORRECT: 0, INACCURACY: 0, MISTAKE: 0, BLUNDER: 0, 'N/A': 0 };
  let totalEVLoss = 0;
  let measuredEVHands = 0;
  const streetLeaks = {
    preflop: { count: 0, evLoss: 0 },
    flop: { count: 0, evLoss: 0 },
    turn: { count: 0, evLoss: 0 },
    river: { count: 0, evLoss: 0 },
  };

  graded.forEach((g) => {
    if (!g || typeof g.grade !== 'string') return;
    counts[g.grade] = (counts[g.grade] || 0) + 1;
    if (typeof g.evLoss === 'number' && isFinite(g.evLoss)) {
      totalEVLoss += g.evLoss;
      measuredEVHands++;
    }
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

  const total = graded.reduce((sum, grade) => sum + (grade.verifiedDecisions || 0), 0);
  const correctDecisionCount = graded.reduce((sum, grade) => sum + (grade.correctDecisions || 0), 0);
  const denominator = Math.max(total, 1);
  const accuracy = Math.min(
    100,
    Math.max(0, Math.round((correctDecisionCount / denominator) * 100))
  );
  const sortedStreets = Object.entries(streetLeaks || {}).sort(
    (a, b) => b[1].count - a[1].count || b[1].evLoss - a[1].evLoss
  );
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
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--sp-fg)'}}>Provenance-Audited Decision Report</div>
        <div style={{ fontSize: 12, color: 'var(--sp-fg-dim)' }}>{total} Exact-Node Decisions</div>
      </div>

      {/* Grade Distribution Bar */}
      <div style={{ padding: '16px 20px' }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--sp-fg-dim)',
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
                fontSize: 12,
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
            <div key={g} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
              <div
                style={{ width: 8, height: 8, borderRadius: 2, background: GRADE_TIERS[g].color }}
              />
              <span style={{ color: 'var(--sp-fg-muted)' }}>
                {GRADE_TIERS[g].label}: <strong style={{ color: 'var(--sp-fg)' }}>{counts[g]}</strong>
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
              color: accuracy >= 70 ? 'var(--sp-accent-green)' : accuracy >= 50 ? 'var(--sp-accent-amber)' : 'var(--sp-accent-red)',
            }}
          >
            {accuracy}%
          </div>
          <div
            style={{ fontSize: 12, fontWeight: 600, color: 'var(--sp-fg-dim)', textTransform: 'uppercase' }}
          >
            Audited Accuracy
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
          <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--sp-accent-red)' }}>
            {measuredEVHands > 0 ? `-${totalEVLoss.toFixed(1)}` : 'N/A'}
          </div>
          <div
            style={{ fontSize: 12, fontWeight: 600, color: 'var(--sp-fg-dim)', textTransform: 'uppercase' }}
          >
            Measured Action-EV Loss (BB)
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
          <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--sp-accent-orange)' }}>
            {graded.reduce((sum, grade) => sum + (grade.mistakeDecisions || 0), 0)}
          </div>
          <div
            style={{ fontSize: 12, fontWeight: 600, color: 'var(--sp-fg-dim)', textTransform: 'uppercase' }}
          >
            Mistakes
          </div>
        </div>
      </div>

      {/* Street Breakdown */}
      <div style={{ padding: '0 20px 16px' }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--sp-fg-dim)',
            textTransform: 'uppercase',
            letterSpacing: 1,
            marginBottom: 8,
          }}
        >
          Leak Hotspots By Street
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          {Object.entries(streetLeaks || {}).map(([street, data]) => (
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
                  color: data.count > 0 ? 'var(--sp-accent-red)' : 'var(--sp-fg-faint)',
                }}
              >
                {data.count}
              </div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--sp-fg-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                {street}
              </div>
              {data.evLoss > 0 && (
                <div style={{ fontSize: 12, color: 'var(--sp-accent-red)', marginTop: 2 }}>
                  -{Number(data.evLoss).toFixed(1)} BB
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Top Coaching Insight */}
      {worstStreet?.[1]?.count > 0 && (
        <div style={{ padding: '12px 20px 16px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ fontSize: 12, color: 'var(--sp-accent-amber)', fontWeight: 700, marginBottom: 4 }}>
             Primary Leak
          </div>
          <div style={{ fontSize: 12, color: 'var(--sp-fg)', lineHeight: 1.5 }}>
            The Provenance-Audited Decisions Show The Most Errors On The{' '}
            <strong style={{ color: 'var(--sp-accent-red)' }}>{worstStreet[0]}</strong> ({worstStreet[1].count}{' '}
            Mistakes{worstStreet[1].evLoss > 0 ? `, ${worstStreet[1].evLoss.toFixed(1)} BB Measured Action-EV Loss` : ', With Action EV Unavailable'}).
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ANALYZED HAND ROW — replay plus provenance-audited results only
// ═══════════════════════════════════════════════════════════════════════════

function AnalyzedHandRow({ hand, index }) {
  const [expanded, setExpanded] = useState(false);
  const heroActions = hand.actions.filter((a) => a.isHero);
  const heroActionSummary = heroActions.map((a) => a.action).join(' → ') || 'N/A';
  const coaching = gradeHand(hand);
  const tier = coaching.tier || GRADE_TIERS.UNPRICED;

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
            fontSize: 12,
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
                <span style={{ color: 'var(--sp-fg-faint)', margin: '0 2px' }}>|</span>
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
          <div style={{ display: 'flex', gap: 6, fontSize: 12, color: 'var(--sp-fg-muted)' }}>
            <span>
              {hand.gameType} {hand.stakes}
            </span>
            <span style={{ color: 'var(--sp-fg-faint)' }}>•</span>
            <span>{heroActionSummary}</span>
            {coaching.evLoss > 0 && (
              <>
                <span style={{ color: 'var(--sp-fg-faint)' }}>•</span>
                <span style={{ color: 'var(--sp-accent-red)', fontWeight: 700 }}>
                  -{Number(coaching.evLoss).toFixed(2)} BB Measured Action-EV
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
              color: hand.result > 0 ? 'var(--sp-accent-green)' : hand.result < 0 ? 'var(--sp-accent-red)' : 'var(--sp-fg-muted)',
            }}
          >
            {hand.result > 0 ? '+' : ''}
            {hand.pot > 0 ? `$${(Number.isFinite(Number(hand.pot)) ? Number(hand.pot) : 0).toFixed(0)}` : ''}
          </div>
          <div
            style={{ fontSize: 12, fontWeight: 700, color: tier.color, textTransform: 'uppercase' }}
          >
            {tier.label}
          </div>
        </div>
        <span
          style={{
            color: 'var(--sp-fg-faint)',
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
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--sp-fg-dim)',
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
                    fontSize: 12,
                    color: a.isHero ? 'var(--sp-accent-cyan)' : 'var(--sp-fg-muted)',
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

            {/* Provenance-complete server audit or a neutral replay-only state. */}
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
                    fontSize: 12,
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
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--sp-accent-red)' }}>
                    -{Number(coaching.evLoss).toFixed(2)} Measured Action-EV
                  </div>
                )}
                {Number.isFinite(coaching.score) && (
                  <div style={{ fontSize: 12, color: 'var(--sp-fg-dim)', marginLeft: 'auto' }}>
                    Score: {coaching.score}/100
                  </div>
                )}
              </div>
              <div style={{ fontSize: 12, color: 'var(--sp-fg-dim)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                {coaching.solverVerified
                  ? 'Provenance-Complete Exact-Node Server Audit'
                  : 'Replay Only - No Grade, Value Estimate, Or Recommendation'}
              </div>
              {coaching.tips.map((tip, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    gap: 6,
                    padding: '4px 0',
                    fontSize: 12,
                    color:
                      tip.type === 'good'
                        ? 'var(--sp-accent-green)'
                        : tip.type === 'warning'
                          ? 'var(--sp-accent-amber)'
                          : 'var(--sp-fg)',
                  }}
                >
                  <span style={{ fontSize: 12, flexShrink: 0 }}>
                    {tip.type === 'good'
                      ? '✓'
                      : tip.type === 'warning'
                        ? '▲'
                        : tip.type === 'tip'
                          ? ''
                          : ''}
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
    } catch (_err) { if (typeof console !== "undefined" && console.warn) console.warn(`[hand-history-upload] swallowed:`, _err); /* TRAIN-CATCH-FIX-1 */ }
  }, []);

  // Save session to Supabase and localStorage
  const saveAnalyzedSession = useCallback(async (hands) => {
    if (!hands || hands.length === 0) return;
    const fullyAuditedHands = hands.filter(hand => gradeHand(hand).solverVerified);
    const verifiedDecisions = fullyAuditedHands
      .flatMap(h => h?._solverAudit?.decisions || [])
      .filter(isProvenanceCompleteAuditedDecision);
    const correctDecisions = verifiedDecisions.filter(d => (
      ['best', 'correct'].includes(String(d.classification).toLowerCase())
    ));
    const mistakeDecisions = verifiedDecisions.filter(d => (
      !['best', 'correct'].includes(String(d.classification).toLowerCase())
    ));
    const measuredDecisions = verifiedDecisions.filter(
      d => d.evLossMeasured === true && Number.isFinite(Number(d.evLoss))
    );
    const measuredEVLoss = measuredDecisions.length > 0
      ? +measuredDecisions.reduce((sum, d) => sum + Number(d.evLoss), 0).toFixed(3)
      : null;
    const solverAccuracy = verifiedDecisions.length > 0
      ? Math.round((correctDecisions.length / verifiedDecisions.length) * 100)
      : null;
    const sessionData = {
      id: `hh-${Date.now()}`,
      game_id: 'hand-history-review',
      authority: verifiedDecisions.length > 0
        ? 'provenance_complete_server_audit'
        : 'replay_only_unpriced',
      timestamp: new Date().toISOString(),
      totalHands: hands.length,
      heroActions: hands.reduce((s, h) => s + h.actions.filter((a) => a.isHero).length, 0),
      withShowdown: hands.filter((h) => h.board.length >= 3).length,
      avgPot: hands.reduce((s, h) => s + h.pot, 0) / hands.length,
      site: hands[0]?.site || 'Unknown',
      solverVerifiedDecisions: verifiedDecisions.length,
      solverAccuracy,
      measuredEVLoss,
      mistakeCount: verifiedDecisions.length > 0 ? mistakeDecisions.length : null,
    };

    // Save to localStorage
    try {
      const prev = JSON.parse(localStorage.getItem('hh_sessions') || '[]');
      const updated = [sessionData, ...prev].slice(0, 20); // Keep last 20
      localStorage.setItem('hh_sessions', JSON.stringify(updated));
      setSavedSessions(updated);
    } catch (_err) { if (typeof console !== "undefined" && console.warn) console.warn(`[hand-history-upload] swallowed:`, _err); /* TRAIN-CATCH-FIX-1 */ }

    // Save an explicitly non-authoritative activity note. The server audit
    // evidence already persists through audit-hand-history; this tool record
    // must not create a second client-authored score/progress authority.
    try {
      const token = await getAccessToken();
      if (token) {
        await savePracticeSession('hand-history-upload', {
            gameId: 'hand-history-review',
            gameName: `Hand History Review (${sessionData.totalHands} hands)`,
            handsPlayed: sessionData.totalHands,
            context: {
              site: sessionData.site,
              totalHands: sessionData.totalHands,
              solverVerifiedDecisions: sessionData.solverVerifiedDecisions,
              practiceOnly: true,
            },
        });
      }
    } catch (_err) { if (typeof console !== "undefined" && console.warn) console.warn(`[hand-history-upload] swallowed:`, _err); /* TRAIN-CATCH-FIX-1 */ }
  }, []);

  const handleFile = useCallback(async (file) => {
    if (!file) return [];
    const text = await file.text();
    const parsed = parseHandHistory(text);
    try {
      const token = await getAccessToken();
      if (!token || parsed.length === 0) return parsed;
      const response = await trainingFetch('/api/training/audit-hand-history', {
        method: 'POST',
        body: JSON.stringify({ handHistoryText: text }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Solver audit failed');
      if (payload.persisted !== true || payload.evidenceReconciled !== true) {
        throw new Error('Server audit evidence was not durably reconciled');
      }
      const byId = new Map((payload.analyses || []).map(a => [String(a.handId), a]));
      return parsed.map(hand => ({ ...hand, _solverAudit: byId.get(String(hand.id)) || null }));
    } catch (error) {
      console.warn('[HH] Verified solver audit unavailable:', error.message);
      return parsed;
    }
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
        <title>Provenance-Audited Hand Review | Smarter.Poker</title>
        <meta
          name="description"
          content="Replay imported hands and show grades only for provenance-complete exact-node server audits."
        />
      </Head>
      <div
        style={{
          minHeight: '100dvh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'clip', boxSizing: 'border-box',
          background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 50%, #0a0a1a 100%)',
          color: 'var(--sp-fg)',
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
              color: 'var(--sp-fg-muted)',
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
            \U2190
          </button>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--sp-fg)' }}>
              Hand History Review
            </div>
            <div style={{ fontSize: 12, color: 'var(--sp-fg-dim)' }}>
              Replay Every Hand · Grade Only Provenance-Complete Server Audits
            </div>
          </div>
        </div>

        <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>
          {/* View Tabs */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            {[
              { key: 'upload', label: 'Upload & Review' },
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
                      ? 'linear-gradient(135deg, rgba(var(--sp-accent-cyan-rgb), 1), #7c3aed)'
                      : 'rgba(255,255,255,0.06)',
                  color: activeView === tab.key ? '#fff' : 'var(--sp-fg-muted)',
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
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--sp-accent-cyan)', marginBottom: 6 }}>
                Parsing: {uploadProgress.currentFile}
              </div>
              <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                  style={{ height: '100%', borderRadius: 2, background: 'var(--sp-accent-cyan)' }}
                />
              </div>
              <div style={{ fontSize: 12, color: 'var(--sp-fg-dim)', marginTop: 4 }}>
                {uploadProgress.current} / {uploadProgress.total} Files Processed
              </div>
            </motion.div>
          )}

          {/* Session History View */}
          {activeView === 'history' ? (
            <div>
              {savedSessions.length === 0 ? (
                <TrainerEmptyState
                  variant="no-data"
                  title="No saved sessions yet"
                  message="Upload hand histories to get started."
                  compact
                />
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
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sp-fg)' }}>
                          {session.totalHands} Hands From {session.site}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--sp-fg-dim)', marginTop: 2 }}>
                          {new Date(session.timestamp).toLocaleDateString()} • {session.heroActions}{' '}
                          Decisions • Avg Pot ${(Number.isFinite(Number(session.avgPot)) ? Number(session.avgPot) : 0).toFixed(0) || 'N/A'}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--sp-fg-muted)', marginTop: 4 }}>
                          {session.authority === 'provenance_complete_server_audit'
                            ? `${session.solverVerifiedDecisions || 0} Provenance-Complete Decisions`
                            : 'Replay Only · No Audited Grade Or Value Estimate'}
                        </div>
                      </div>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 800,
                          color: 'var(--sp-accent-cyan)',
                          fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
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
                    border: `2px dashed ${dragOver ? 'var(--sp-accent-cyan)' : 'rgba(255,255,255,0.1)'}`,
                    background: dragOver ? 'rgba(0,212,255,0.05)' : 'rgba(0,0,0,0.2)',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>
                    {isAnalyzing ? '\u23F3' : '\uD83D\uDCC2'}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--sp-fg)', marginBottom: 8 }}>
                    {isAnalyzing ? 'Analyzing...' : 'Drop Hand History File Here'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--sp-fg-dim)' }}>
                    Supports .Txt Files From PokerStars, GGPoker, 888, ACR - Drop Multiple Files At
                    Once
                  </div>
                  <div
                    style={{
                      marginTop: 20,
                      padding: '10px 24px',
                      borderRadius: 10,
                      background: 'rgba(0,212,255,0.1)',
                      border: '1px solid rgba(0,212,255,0.2)',
                      color: 'var(--sp-accent-cyan)',
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
                    { label: 'Hands', value: stats.totalHands, color: 'var(--sp-accent-cyan)' },
                    { label: 'Actions', value: stats.heroActions, color: 'var(--sp-accent-purple)' },
                    { label: 'Showdowns', value: stats.withShowdown, color: 'var(--sp-accent-green)' },
                    { label: 'Avg Pot', value: `$${(Number.isFinite(Number(stats.avgPot)) ? Number(stats.avgPot) : 0).toFixed(0)}`, color: 'var(--sp-accent-amber)' },
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
                          fontSize: 12,
                          fontWeight: 600,
                          color: 'var(--sp-fg-dim)',
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
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--sp-fg)' }}>
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
                        color: 'var(--sp-fg-muted)',
                        fontSize: 12,
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
                      style={{ textAlign: 'center', padding: 12, color: 'var(--sp-fg-dim)', fontSize: 12 }}
                    >
                      Showing First 50 Of {parsedHands.length} Hands
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
