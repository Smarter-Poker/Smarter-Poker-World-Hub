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
import SEOHead from '../../../src/components/seo/SEOHead';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
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




import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
import { FolderOpen, Loader2 } from 'lucide-react';
import at from '../../../src/styles/training/analysis-tools.module.css';
import hh from '../../../src/styles/training/hand-history-upload.module.css';
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
    label: 'Not Priced',
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
    color: '#86daff',
    bg: 'rgba(134, 218, 255, 0.1)',
    border: 'rgba(134, 218, 255, 0.3)',
  },
  MISTAKE: {
    label: 'Mistake',
    icon: '✕',
    color: '#ff9aa4',
    bg: 'rgba(255,122,134,0.1)',
    border: 'rgba(255,122,134,0.3)',
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
      <div role="status" className={`sd-panel ${at.note}`}>
        <strong>No Provenance-Complete Audit Grade Yet.</strong>{' '}
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
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`sd-panel ${at.panel}`}
      aria-labelledby="hhu-report-title"
    >
      {/* Header */}
      <div className={at.panelHead}>
        <h2 id="hhu-report-title" className={at.sectionTitle}>Provenance-Audited Decision Report</h2>
        <span className={at.small}>{total} Exact-Node Decisions</span>
      </div>

      {/* Grade Distribution Bar */}
      <div className={at.field}>
        <h3 className={at.label}>Grade Distribution</h3>
        <div className={hh.gradeBar} role="img" aria-label={gradeBars.map((g) => `${GRADE_TIERS[g].label} ${counts[g]}`).join(', ')}>
          {gradeBars.map((g) => (
            <div
              key={g}
              className={hh.gradeSeg}
              style={{ width: `${(counts[g] / barTotal) * 100}%`, background: GRADE_TIERS[g].color }}
            >
              {counts[g]}
            </div>
          ))}
        </div>
        <div className={at.row}>
          {gradeBars.map((g) => (
            <span key={g} className={at.legendItem}>
              <span className={at.legendSwatch} style={{ background: GRADE_TIERS[g].color }} aria-hidden />
              {GRADE_TIERS[g].label}: <strong className={at.white}>{counts[g]}</strong>
            </span>
          ))}
        </div>
      </div>

      {/* Key Metrics */}
      <div className={`${at.metrics} ${at.metrics3}`}>
        <div className={`sd-metric ${at.metric}`}>
          <strong className={at.metricValue} data-tone={accuracy >= 70 ? 'up' : accuracy >= 50 ? 'ice' : 'down'}>
            {accuracy}%
          </strong>
          <span className={at.metricLabel}>Audited Accuracy</span>
        </div>
        <div className={`sd-metric ${at.metric}`}>
          <strong className={at.metricValue} data-tone={measuredEVHands > 0 ? 'down' : undefined}>
            {measuredEVHands > 0 ? `-${totalEVLoss.toFixed(1)}` : 'N/A'}
          </strong>
          <span className={at.metricLabel}>Measured Action-EV Loss (BB)</span>
        </div>
        <div className={`sd-metric ${at.metric}`}>
          <strong className={at.metricValue} data-tone="ice">
            {graded.reduce((sum, grade) => sum + (grade.mistakeDecisions || 0), 0)}
          </strong>
          <span className={at.metricLabel}>Mistakes</span>
        </div>
      </div>

      {/* Street Breakdown */}
      <div className={at.field}>
        <h3 className={at.label}>Leak Hotspots By Street</h3>
        <div className={hh.streets}>
          {Object.entries(streetLeaks || {}).map(([street, data]) => (
            <div
              key={street}
              className={`sd-metric ${at.metric}`}
              data-active={worstStreet[0] === street && data.count > 0 ? 'true' : undefined}
            >
              <strong className={at.metricValue} data-tone={data.count > 0 ? 'down' : undefined} style={{ fontSize: '1.1rem' }}>
                {data.count}
              </strong>
              <span className={at.metricLabel} style={{ textTransform: 'capitalize' }}>{street}</span>
              {data.evLoss > 0 && (
                <span className={`${at.small} ${at.down}`}>-{Number(data.evLoss).toFixed(1)} BB</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Top Coaching Insight */}
      {worstStreet?.[1]?.count > 0 && (
        <div className={at.helpBlock}>
          <h3 className={at.eyebrow}>Primary Leak</h3>
          <span className={at.copy}>
            The Provenance-Audited Decisions Show The Most Errors On The{' '}
            <strong className={at.down} style={{ textTransform: 'capitalize' }}>{worstStreet[0]}</strong> ({worstStreet[1].count}{' '}
            Mistakes{worstStreet[1].evLoss > 0 ? `, ${worstStreet[1].evLoss.toFixed(1)} BB Measured Action-EV Loss` : ', With Action EV Unavailable'}).
          </span>
        </div>
      )}
    </motion.section>
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
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 1) }}
      className={`sd-panel ${hh.handRow}`}
    >
      <button
        type="button"
        className={hh.handHead}
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className={hh.tierBadge} style={{ color: tier.color }} aria-hidden>
          {tier.icon}
        </span>
        <span style={{ minWidth: 0 }}>
          <span className={hh.handCards}>
            {hand.heroCards.map((c, i) => (
              <Card key={i} rank={c[0]?.toUpperCase()} suit={c[1]?.toLowerCase()} size="tiny" />
            ))}
            {hand.board.length > 0 && (
              <>
                <span className={at.small} aria-hidden>|</span>
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
          </span>
          <span className={hh.handMeta}>
            <span>
              {hand.gameType} {hand.stakes}
            </span>
            <span aria-hidden>•</span>
            <span>{heroActionSummary}</span>
            {coaching.evLoss > 0 && (
              <>
                <span aria-hidden>•</span>
                <span className={at.down} style={{ fontWeight: 700 }}>
                  -{Number(coaching.evLoss).toFixed(2)} BB Measured Action-EV
                </span>
              </>
            )}
          </span>
        </span>
        <span className={hh.handSide}>
          <span className={hand.result > 0 ? at.up : hand.result < 0 ? at.down : at.small}>
            {hand.result > 0 ? '+' : ''}
            {hand.pot > 0 ? `$${(Number.isFinite(Number(hand.pot)) ? Number(hand.pot) : 0).toFixed(0)}` : ''}
          </span>
          <span style={{ color: tier.color }}>{tier.label}</span>
        </span>
        <span className={hh.chevron} data-open={expanded ? 'true' : undefined} aria-hidden>▼</span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className={hh.handBody}
          >
            {/* Action Sequence */}
            <div className={at.helpBlock} style={{ marginTop: 0 }}>
              <h3 className={at.label}>Action Sequence</h3>
              {hand.actions.map((a, i) => (
                <div key={i} className={hh.actionLine} data-hero={a.isHero ? 'true' : undefined}>
                  <span>{a.player}</span>
                  <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{a.action}</span>
                  {a.amount > 0 && <span>${(Number.isFinite(Number(a.amount)) ? Number(a.amount) : 0).toFixed(2)}</span>}
                </div>
              ))}
            </div>

            {/* Provenance-complete server audit or a neutral replay-only state. */}
            <div className={at.helpBlock} style={{ marginTop: 0 }}>
              <div className={at.row}>
                <span className={at.tag} style={{ color: tier.color }}>
                  <span aria-hidden>{tier.icon}</span> {tier.label}
                </span>
                {coaching.evLoss > 0 && (
                  <span className={`${at.small} ${at.down}`} style={{ fontWeight: 700 }}>
                    -{Number(coaching.evLoss).toFixed(2)} BB Measured Action-EV
                  </span>
                )}
                {Number.isFinite(coaching.score) && (
                  <span className={at.small} style={{ marginLeft: 'auto' }}>
                    Score: {coaching.score}/100
                  </span>
                )}
              </div>
              <span className={at.label}>
                {coaching.solverVerified
                  ? 'Provenance-Complete Exact-Node Server Audit'
                  : 'Replay Only - No Grade, Value Estimate, Or Recommendation'}
              </span>
              {coaching.tips.map((tip, i) => (
                <div key={i} className={hh.tip} data-type={tip.type}>
                  <span style={{ flexShrink: 0 }} aria-hidden>
                    {tip.type === 'good' ? '✓' : tip.type === 'warning' ? '▲' : ''}
                  </span>
                  <span>{tip.text}</span>
                </div>
              ))}
              <div className={at.row} style={{ justifyContent: 'flex-end' }}>
                <a
                  data-train-this-hand="true"
                  data-drill-similar-spot-cta="true"
                  data-hand-id={hand.id}
                  href={
                    hand?._solverAudit?.drillHref ||
                    `/hub/training/arena/${/mtt|tournament/i.test(String(hand.gameType || '')) ? 'mtt-002' : 'cash-002'}?level=1&source=hand-history-upload&syncedHandId=${encodeURIComponent(hand.id)}`
                  }
                  className="sd-button sd-primary"
                >
                  Train This Hand →
                </a>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
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

  const querySource = typeof router.query?.source === 'string' ? router.query.source.trim() : '';
  const queryLeak = typeof router.query?.leak === 'string' ? router.query.leak.trim() : '';
  const isPaSource = querySource.startsWith('personal-assistant') || querySource.startsWith('assistant-sandbox');
  const backHref = isPaSource
    ? (queryLeak ? `/hub/personal-assistant/leaks?leak=${encodeURIComponent(queryLeak)}` : '/hub/personal-assistant/leaks')
    : '/hub/training';
  const backLabel = isPaSource ? 'Back To Personal Assistant' : 'Back To Training';

  return (
    <>
      {/* AEO phase 3 (2026-09-18): this page had a bare <Head> with a title
          and a description and nothing else, so it served no canonical, no
          robots directive and no structured data, while the Jarvis summary
          linked to it. The title also led with "Provenance-Audited", which
          names the mechanism rather than the job a player came to do. */}
      <SEOHead
        title="Upload A Hand History And Get It Graded"
        description="Import A Hand From PokerStars, GGPoker, ACR Or 888, Replay It Street By Street, And See Where Your Line Left Value. Grades And EV Come Only From An Exact Node Server Audit, So A Hand That Cannot Be Matched Is Shown Without A Score Rather Than With A Guess."
        canonical="/hub/training/hand-history-upload"
      />
      <div className={at.shell}>
        <TrainingPageHead slug="training-hand-history-upload" note="Replay Every Hand · Grade Only Provenance-Complete Server Audits" backHref={backHref} backLabel={isPaSource ? "Back To Personal Assistant" : "Training"} />

        <div className={at.page}>

          {/* View Tabs */}
          <div className={at.segmented} role="group" aria-label="Hand History Views">
            {[
              { key: 'upload', label: 'Upload & Review' },
              { key: 'history', label: `History (${savedSessions.length})` },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                className="sd-button"
                aria-pressed={activeView === tab.key}
                onClick={() => setActiveView(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Upload Progress Bar */}
          {uploadProgress && (
            <motion.section
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={`sd-panel ${at.panel} ${at.tight}`}
              role="status"
            >
              <span className={at.eyebrow}>Parsing: {uploadProgress.currentFile}</span>
              <div className={at.track}>
                <motion.div
                  className={at.fill}
                  initial={{ width: 0 }}
                  animate={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                />
              </div>
              <span className={at.small}>
                {uploadProgress.current} / {uploadProgress.total} Files Processed
              </span>
            </motion.section>
          )}

          {/* Session History View */}
          {activeView === 'history' ? (
            <div className={at.list}>
              {savedSessions.length === 0 ? (
                <TrainerEmptyState
                  variant="no-data"
                  title="No Saved Sessions Yet"
                  message="Upload Hand Histories To Get Started."
                  compact
                />
              ) : (
                savedSessions.map((session, i) => (
                  <article key={session.id || i} className={`sd-panel ${hh.sessionRow}`}>
                    <div style={{ minWidth: 0 }}>
                      <h3 className={at.subTitle}>
                        {session.totalHands} Hands From {session.site}
                      </h3>
                      <p className={at.small}>
                        {new Date(session.timestamp).toLocaleDateString()} • {session.heroActions}{' '}
                        Decisions • Avg Pot ${(Number.isFinite(Number(session.avgPot)) ? Number(session.avgPot) : 0).toFixed(0) || 'N/A'}
                      </p>
                      <p className={at.small}>
                        {session.authority === 'provenance_complete_server_audit'
                          ? `${session.solverVerifiedDecisions || 0} Provenance-Complete Decisions`
                          : 'Replay Only · No Audited Grade Or Value Estimate'}
                      </p>
                    </div>
                    <strong className={at.metricValue} data-tone="ice" style={{ fontSize: '1.1rem' }}>
                      {session.withShowdown || 0} SD
                    </strong>
                  </article>
                ))
              )}
            </div>
          ) : (
            <>
              {/* Upload Zone */}
              {parsedHands.length === 0 && (
                <motion.button
                  type="button"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`sd-panel ${hh.drop}`}
                  data-drag={dragOver ? 'true' : undefined}
                >
                  <span className={hh.dropIcon} aria-hidden>
                    {isAnalyzing ? <Loader2 size={44} /> : <FolderOpen size={44} />}
                  </span>
                  <span className={hh.dropTitle}>
                    {isAnalyzing ? 'Analyzing...' : 'Drop Hand History File Here'}
                  </span>
                  <span className={at.small}>
                    Supports .Txt Files From PokerStars, GGPoker, 888, ACR - Drop Multiple Files At
                    Once
                  </span>
                  <span className={`sd-button sd-primary ${hh.dropCta}`}>
                    Browse Files
                  </span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.log"
                    multiple
                    onChange={(e) => handleFiles(e.target.files)}
                    className={hh.hidden}
                  />
                </motion.button>
              )}

              {/* Stats Summary */}
              {stats && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`${at.metrics} ${at.metrics2}`}
                >
                  {[
                    { label: 'Hands', value: stats.totalHands },
                    { label: 'Actions', value: stats.heroActions },
                    { label: 'Showdowns', value: stats.withShowdown },
                    { label: 'Avg Pot', value: `$${(Number.isFinite(Number(stats.avgPot)) ? Number(stats.avgPot) : 0).toFixed(0)}` },
                  ].map((s, i) => (
                    <div key={i} className={`sd-metric ${at.metric}`}>
                      <strong className={at.metricValue}>{s.value}</strong>
                      <span className={at.metricLabel}>{s.label}</span>
                    </div>
                  ))}
                </motion.div>
              )}

              {/* Leak Report */}
              {parsedHands.length > 0 && <LeakReport hands={parsedHands} />}

              {/* Parsed Hands List */}
              {parsedHands.length > 0 && (
                <>
                  <div className={at.panelHead}>
                    <h2 className={at.sectionTitle}>
                      {parsedHands.length} Hands Parsed
                    </h2>
                    <button
                      type="button"
                      className={`sd-button ${at.compact}`}
                      onClick={() => {
                        setParsedHands([]);
                        setStats(null);
                      }}
                    >
                      Upload New File
                    </button>
                  </div>
                  <div className={at.list}>
                    {parsedHands.slice(0, 50).map((hand, i) => (
                      <AnalyzedHandRow key={hand.id} hand={hand} index={i} />
                    ))}
                  </div>
                  {parsedHands.length > 50 && (
                    <p className={at.small} style={{ textAlign: 'center' }}>
                      Showing First 50 Of {parsedHands.length} Hands
                    </p>
                  )}
                </>
              )}
            </> /* end activeView === 'upload' */
          )}
        </div>
        <HubPageSummary page="training-hand-history-upload" />
      </div>
    </>
  );
}
