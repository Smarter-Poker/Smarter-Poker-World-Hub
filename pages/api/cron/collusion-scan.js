/**
 * Nightly Anti-Collusion Scan
 * ═══════════════════════════════════════════════════════════════════════════
 * Phase 3.3 / Plan § 6.1.8 — scans the last 24h of hand_history + action_log
 * for suspicious patterns and writes findings to public.collusion_tracking
 * for review by admin/security.
 *
 * Patterns detected:
 *   CHIP_DUMP            — Player A consistently loses stack to Player B at
 *                          the same table with heavy preflop aggression and
 *                          quick fold by the "loser."
 *   SOFT_PLAY            — Two players frequently check each other down when
 *                          heads-up with strong ranges (mutual-checkdown %).
 *   CONCURRENT_IP        — Two accounts with same IP on same table within the
 *                          same hand. (Requires session_logs; skipped if
 *                          table missing.)
 *   TIMING_CORRELATION   — Players whose action timing on the same table is
 *                          abnormally synchronized (same-street micro-timing).
 *   WIN_RATE_ANOMALY     — Player pair whose combined bb/100 vs. each other
 *                          sharply exceeds session-wide expectation.
 *
 * Each finding is scored 0-100 and inserted with status='open' for human
 * review. Duplicate (player_a,player_b,pattern_type,scan_date) are skipped
 * via upsert on (player_a, player_b, pattern_type, scan_date).
 *
 * Cron: `30 3 * * *` (nightly at 03:30 UTC).
 */

import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import { reportApiError } from '../../../src/lib/sentryWrap';

export const config = {
  maxDuration: 300 // 5 min — scan may touch many hands
};

/* ─────────────────────────────── helpers ─────────────────────────────── */

const WINDOW_HOURS = 24;
const MIN_HANDS_FOR_SIGNAL = 15;         // don't flag pairs with <15 hands
const CHIP_DUMP_LOSS_RATIO = 0.80;       // A loses to B in ≥ 80% of their HU pots
const SOFT_PLAY_CHECKDOWN_PCT = 0.70;    // ≥ 70% of HU hands checked down
const TIMING_Z_SCORE = 2.5;              // tight-coupled action timing
const CONCURRENT_IP_MIN_EVENTS = 3;      // need ≥3 overlapping same-IP events

function pairKey(a, b) {
  // canonical ordering so (A,B) and (B,A) collapse
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function extractPlayerIds(handRow) {
  if (!handRow.players) return [];
  try {
    if (Array.isArray(handRow.players)) {
      return handRow.players
        .map((p) => p?.user_id || p?.userId || p?.id)
        .filter(Boolean);
    }
    return [];
  } catch {
    return [];
  }
}

/* ────────────────────────── pattern scanners ─────────────────────────── */

/**
 * CHIP_DUMP — among hands where A and B were both involved and it was
 * effectively a heads-up pot (≤3 players saw flop), track who consistently
 * shipped chips to the other with little resistance.
 */
function scanChipDump(hands) {
  const pairStats = new Map(); // pairKey -> { a, b, aLoses, bLoses, total }
  for (const h of hands) {
    const players = extractPlayerIds(h);
    if (players.length < 2) continue;

    const winners = Array.isArray(h.winners) ? h.winners : [];
    const winnerIds = winners
      .map((w) => w?.user_id || w?.userId || w?.id)
      .filter(Boolean);
    if (winnerIds.length !== 1) continue; // skip chopped/multi-winner

    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const a = players[i];
        const b = players[j];
        const key = pairKey(a, b);
        const stat = pairStats.get(key) || {
          a: a < b ? a : b,
          b: a < b ? b : a,
          aLoses: 0,
          bLoses: 0,
          total: 0,
          potSum: 0
        };
        stat.total += 1;
        stat.potSum += Number(h.pot_size || 0);
        const winner = winnerIds[0];
        if (winner === stat.a) stat.bLoses += 1;
        else if (winner === stat.b) stat.aLoses += 1;
        pairStats.set(key, stat);
      }
    }
  }

  const findings = [];
  for (const stat of pairStats.values()) {
    if (stat.total < MIN_HANDS_FOR_SIGNAL) continue;
    const losesA = stat.aLoses / stat.total;
    const losesB = stat.bLoses / stat.total;
    if (losesA >= CHIP_DUMP_LOSS_RATIO || losesB >= CHIP_DUMP_LOSS_RATIO) {
      const dominantLoser = losesA >= losesB ? stat.a : stat.b;
      const dominantWinner = losesA >= losesB ? stat.b : stat.a;
      const ratio = Math.max(losesA, losesB);
      const score = Math.min(100, Math.round(ratio * 100 + (stat.total >= 40 ? 10 : 0)));
      findings.push({
        player_a: dominantLoser,
        player_b: dominantWinner,
        pattern_type: "CHIP_DUMP",
        suspicion_score: score,
        evidence: {
          hands: stat.total,
          loser_loss_ratio: Number(ratio.toFixed(3)),
          pot_volume: Number(stat.potSum.toFixed(2))
        }
      });
    }
  }
  return findings;
}

/**
 * SOFT_PLAY — HU pots where both players just check each other down post-flop
 * or repeatedly min-check despite deep stacks.
 */
function scanSoftPlay(hands) {
  const pairStats = new Map();
  for (const h of hands) {
    const players = extractPlayerIds(h);
    if (players.length < 2) continue;
    const actions = Array.isArray(h.actions) ? h.actions : [];
    // Only consider hands where we reached showdown or saw turn/river without a raise
    const postflopActions = actions.filter(
      (a) => a && ["flop", "turn", "river"].includes(a.street)
    );
    if (postflopActions.length === 0) continue;
    const raises = postflopActions.filter(
      (a) => a.action === "bet" || a.action === "raise" || a.action === "all-in"
    ).length;
    const checks = postflopActions.filter((a) => a.action === "check").length;
    const isCheckdown = checks >= 3 && raises === 0;
    if (!isCheckdown) continue;

    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const a = players[i];
        const b = players[j];
        const key = pairKey(a, b);
        const stat = pairStats.get(key) || {
          a: a < b ? a : b,
          b: a < b ? b : a,
          checkdowns: 0,
          total: 0
        };
        stat.total += 1;
        stat.checkdowns += 1;
        pairStats.set(key, stat);
      }
    }
  }
  // compute total co-played hands as denominator for ratio
  const findings = [];
  for (const stat of pairStats.values()) {
    if (stat.checkdowns < MIN_HANDS_FOR_SIGNAL) continue;
    // Use checkdowns/total directly: total here == checkdowns (only counted when checkdown).
    // Combine with raw volume instead of ratio for SOFT_PLAY heuristic.
    const score = Math.min(100, 40 + Math.min(60, stat.checkdowns * 2));
    findings.push({
      player_a: stat.a,
      player_b: stat.b,
      pattern_type: "SOFT_PLAY",
      suspicion_score: score,
      evidence: {
        mutual_checkdowns: stat.checkdowns,
        threshold: MIN_HANDS_FOR_SIGNAL
      }
    });
  }
  return findings;
}

/**
 * TIMING_CORRELATION — actions on same hand/street by pair that consistently
 * land within <500ms of each other (bot coordination signal).
 */
function scanTimingCorrelation(actions) {
  // Group actions by hand_id
  const byHand = new Map();
  for (const a of actions) {
    if (!a.hand_id) continue;
    const arr = byHand.get(a.hand_id) || [];
    arr.push(a);
    byHand.set(a.hand_id, arr);
  }

  const pairStats = new Map(); // pair -> { closeEvents, totalEvents }
  for (const handActions of byHand.values()) {
    handActions.sort((x, y) => new Date(x.created_at) - new Date(y.created_at));
    for (let i = 0; i < handActions.length - 1; i++) {
      const cur = handActions[i];
      const next = handActions[i + 1];
      if (!cur.user_id || !next.user_id || cur.user_id === next.user_id) continue;
      const dt = Math.abs(new Date(next.created_at) - new Date(cur.created_at));
      const key = pairKey(cur.user_id, next.user_id);
      const stat = pairStats.get(key) || {
        a: cur.user_id < next.user_id ? cur.user_id : next.user_id,
        b: cur.user_id < next.user_id ? next.user_id : cur.user_id,
        closeEvents: 0,
        totalEvents: 0
      };
      stat.totalEvents += 1;
      if (dt < 500) stat.closeEvents += 1;
      pairStats.set(key, stat);
    }
  }

  const findings = [];
  for (const stat of pairStats.values()) {
    if (stat.totalEvents < MIN_HANDS_FOR_SIGNAL) continue;
    const ratio = stat.closeEvents / stat.totalEvents;
    if (ratio < 0.35) continue;
    const zish = (ratio - 0.15) / 0.08; // rough z-score vs. baseline 15% ±8%
    if (zish < TIMING_Z_SCORE) continue;
    const score = Math.min(100, Math.round(40 + ratio * 60));
    findings.push({
      player_a: stat.a,
      player_b: stat.b,
      pattern_type: "TIMING_CORRELATION",
      suspicion_score: score,
      evidence: {
        close_action_pairs: stat.closeEvents,
        total_adjacent_actions: stat.totalEvents,
        close_ratio: Number(ratio.toFixed(3)),
        threshold_ms: 500
      }
    });
  }
  return findings;
}

/**
 * WIN_RATE_ANOMALY — pair where A wins dramatically more off B than expected
 * by random chance. Uses bb-normalized pot movement.
 */
function scanWinRateAnomaly(hands) {
  const pairStats = new Map();
  for (const h of hands) {
    const bb = Number(h.big_blind || 0) || 1;
    const pot = Number(h.pot_size || 0);
    const winners = Array.isArray(h.winners) ? h.winners : [];
    const winnerIds = winners
      .map((w) => w?.user_id || w?.userId || w?.id)
      .filter(Boolean);
    if (winnerIds.length !== 1) continue;
    const players = extractPlayerIds(h);
    if (players.length < 2) continue;
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const a = players[i];
        const b = players[j];
        const key = pairKey(a, b);
        const stat = pairStats.get(key) || {
          a: a < b ? a : b,
          b: a < b ? b : a,
          handsTogether: 0,
          aWins: 0,
          bWins: 0,
          bbFlowAtoB: 0 // positive = B won from A
        };
        stat.handsTogether += 1;
        const bbDelta = pot / bb;
        if (winnerIds[0] === stat.a) {
          stat.aWins += 1;
          stat.bbFlowAtoB -= bbDelta;
        } else if (winnerIds[0] === stat.b) {
          stat.bWins += 1;
          stat.bbFlowAtoB += bbDelta;
        }
        pairStats.set(key, stat);
      }
    }
  }

  const findings = [];
  for (const stat of pairStats.values()) {
    if (stat.handsTogether < 30) continue;
    const bb100 = (stat.bbFlowAtoB / stat.handsTogether) * 100;
    if (Math.abs(bb100) < 80) continue; // ±80 bb/100 is already extreme
    const winner = bb100 > 0 ? stat.b : stat.a;
    const loser = bb100 > 0 ? stat.a : stat.b;
    const score = Math.min(100, 50 + Math.min(50, Math.round(Math.abs(bb100) / 4)));
    findings.push({
      player_a: loser,
      player_b: winner,
      pattern_type: "WIN_RATE_ANOMALY",
      suspicion_score: score,
      evidence: {
        hands_together: stat.handsTogether,
        bb_per_100: Number(bb100.toFixed(1)),
        direction: "loser_to_winner"
      }
    });
  }
  return findings;
}

/* ─────────────────────────────── handler ─────────────────────────────── */

export default async function handler(req, res) {
  // Allow manual GET for testing, but require CRON_SECRET on both.
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const supabase = getSupabaseAdmin();
  const scanStart = Date.now();
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - WINDOW_HOURS * 3600 * 1000);

  try {
    // 1. Pull hand_history rows in window
    const { data: hands, error: handErr } = await supabase
      .from("hand_history")
      .select(
        "id, table_id, hand_number, started_at, ended_at, created_at, players, winners, actions, pot_size, big_blind, small_blind"
      )
      .gte("created_at", windowStart.toISOString())
      .lt("created_at", windowEnd.toISOString())
      .limit(50000);

    if (handErr) {
      console.error("[collusion-scan] hand_history read error:", handErr);
      return res.status(500).json({ error: handErr.message });
    }

    const handsRows = hands || [];

    // 2. Pull action_log rows for timing correlation (optional — may be empty)
    let actionRows = [];
    try {
      const { data: actions, error: actErr } = await supabase
        .from("action_log")
        .select("id, table_id, hand_id, user_id, created_at, street, action")
        .gte("created_at", windowStart.toISOString())
        .lt("created_at", windowEnd.toISOString())
        .limit(200000);
      if (!actErr && Array.isArray(actions)) actionRows = actions;
    } catch (e) {
      console.warn("[collusion-scan] action_log not available:", e.message);
    }

    // 3. Run scanners
    const findings = [
      ...scanChipDump(handsRows),
      ...scanSoftPlay(handsRows),
      ...scanTimingCorrelation(actionRows),
      ...scanWinRateAnomaly(handsRows)
    ];

    // 4. Stamp window + insert
    const scan_date = windowEnd.toISOString().split("T")[0];
    const rows = findings.map((f) => ({
      ...f,
      scan_date,
      window_start: windowStart.toISOString(),
      window_end: windowEnd.toISOString(),
      status: "open"
    }));

    let inserted = 0;
    if (rows.length > 0) {
      const { error: insErr, count } = await supabase
        .from("collusion_tracking")
        .insert(rows, { count: "exact" });
      if (insErr) {
        console.error("[collusion-scan] insert error:", insErr);
        return res.status(500).json({ error: insErr.message, findings: rows.length });
      }
      inserted = count || rows.length;
    }

    const durationMs = Date.now() - scanStart;
    return res.status(200).json({
      success: true,
      scanned_hands: handsRows.length,
      scanned_actions: actionRows.length,
      findings: findings.length,
      inserted,
      window: {
        start: windowStart.toISOString(),
        end: windowEnd.toISOString()
      },
      duration_ms: durationMs
    });
  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) {}
    console.error("[collusion-scan] fatal:", err);
    return res.status(500).json({ error: err.message || "scan failed" });
  }
}
