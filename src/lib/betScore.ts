// Bet-quality scoring — the single source of truth for the web app.
// Faithful TypeScript port of engine/model/bet_scoring.py so every surface
// (landing page, best bets, game page, props, model intel) shows the SAME
// 0-100 Bet Score + tier instead of the legacy "edge points" / "% Model Edge".
//
// Two independent axes:
//   betScore (0-100):  VALUE — "should I bet it" (EV x confidence haircut)
//   winConfidence (0-100): LIKELIHOOD — calibrated win prob, price-blind ("Top Lock")

export type Tier = "ELITE" | "STRONG" | "LEAN" | "THIN" | "PASS";

export function americanToDecimal(a: number): number {
  return 1 + (a > 0 ? a / 100 : 100 / Math.abs(a));
}

// EV per $1 staked, in %. p = win prob (0..1), american = offered price.
export function evPct(p: number, american: number): number {
  const b = americanToDecimal(american) - 1;
  return (p * b - (1 - p)) * 100;
}

export function winConfidence(p: number): number {
  return Math.round(Math.max(0, Math.min(1, p)) * 1000) / 10;
}

function evValue(ev: number): number {
  const e = Math.min(ev, 25);
  return 100 / (1 + Math.exp(-(e - 2) / 4));
}

function confidenceMult(
  ev: number,
  american: number,
  vol: boolean,
  lineupLocked: boolean,
  d: number | null
): number {
  let m = 1.0;
  if (!lineupLocked) m *= 0.88;
  if (vol) m *= 0.85;
  if (Math.abs(american) >= 250) m *= 0.9;
  if (ev > 20) m *= 0.85;
  
  if (d != null) {
    if (d > 0.15) m *= 0.85;
    else if (d > 0.08) m *= 0.90;
    else if (d > 0.05) m *= 0.95;
    
    if (lineupLocked && !vol && d <= 0.05) m *= 1.04;
  }
  return Math.max(0.4, Math.min(1.0, m));
}

export function betScore(
  pWin: number,
  american: number,
  opts: { vol?: boolean; lineupLocked?: boolean; pMarket?: number | null } = {},
): number {
  const { vol = false, lineupLocked = true, pMarket = null } = opts;
  
  let adjWin = pWin;
  let d: number | null = null;
  
  // STRICT FACTUAL AUDIT: Removed Bayesian shrinkage toward market. Using true model pWin.

  const ev = evPct(adjWin, american);
  const base = evValue(ev);
  const m = confidenceMult(ev, american, vol, lineupLocked, d);
  return Math.round(Math.max(1, Math.min(99, base * m)));
}

export function tier(score: number): Tier {
  return score >= 82 ? "ELITE" : score >= 68 ? "STRONG" : score >= 52 ? "LEAN" : score >= 38 ? "THIN" : "PASS";
}

export const TIER_STYLE: Record<Tier, { text: string; chip: string; glow: string }> = {
  ELITE: { text: "text-[var(--neon-cyan)]", chip: "text-[var(--neon-cyan)] bg-[#1a2332] border-[var(--neon-cyan)] shadow-[var(--glow-cyan)]", glow: "shadow-[var(--glow-cyan)]" },
  STRONG: { text: "text-emerald-400", chip: "text-emerald-400 bg-[#1a2332] border-emerald-500/50 shadow-[0_0_8px_rgba(52,211,153,0.3)]", glow: "" },
  LEAN: { text: "text-sky-400", chip: "text-sky-400 bg-[#0d1117] border-sky-600/50", glow: "" },
  THIN: { text: "text-amber-500", chip: "text-amber-500 bg-[#0d1117] border-amber-600/50", glow: "" },
  PASS: { text: "text-slate-400", chip: "text-slate-400 bg-[#0a0a15] border-[#3d4f5f]", glow: "" },
};

const VERDICT: Record<Tier, string> = {
  ELITE: "Elite bet — strong value backed by clean, trustworthy inputs.",
  STRONG: "Strong bet — solid value with only minor caveats.",
  LEAN: "Lean — real but modest value; size down.",
  THIN: "Thin — barely worth it; only if you have conviction.",
  PASS: "Pass — not worth it at this price.",
};

export type ScoreFactor = { dir: "up" | "down" | "flat" | "info"; text: string };

// Human-readable rationale (verdict + up/down/info factors). Mirrors bet_scoring.explain().
export function explain(
  pWin: number,
  american: number,
  opts: { vol?: boolean; lineupLocked?: boolean; pMarket?: number | null } = {},
): { betScore: number; tier: Tier; winConfidence: number; evPct: number; verdict: string; factors: ScoreFactor[] } {
  const { vol = false, lineupLocked = true, pMarket = null } = opts;
  
  let adjWin = pWin;
  let d = 0;
  // STRICT FACTUAL AUDIT: Removed Bayesian shrinkage toward market. Using true model pWin.

  const rawEv = evPct(pWin, american);
  const ev = evPct(adjWin, american);
  const wc = winConfidence(pWin);
  const s = betScore(pWin, american, opts);
  const t = tier(s);
  
  const factors: ScoreFactor[] = [];
  if (ev >= 8) factors.push({ dir: "up", text: `Strong expected value: +${ev.toFixed(1)}% return per $1 long-run.` });
  else if (ev >= 3) factors.push({ dir: "up", text: `Positive expected value: +${ev.toFixed(1)}% per $1.` });
  else if (ev >= 0) factors.push({ dir: "flat", text: `Thin expected value: +${ev.toFixed(1)}% — barely beats the price.` });
  else factors.push({ dir: "down", text: `Negative expected value: ${ev.toFixed(1)}% — the price is worse than the model's true win chance, losing money long-run.` });
  
  factors.push({ dir: "info", text: `Model raw baseline gives this a ${wc.toFixed(0)}% chance to hit.` });
  if (american > 0) factors.push({ dir: "up", text: `Plus-money price (+${american}) — pays more than even if it hits.` });
  if (Math.abs(american) >= 250) factors.push({ dir: "down", text: "Longshot price — lower hit rate and higher swing; keep the stake small." });
  if (vol) factors.push({ dir: "down", text: "High-variance matchup — the model flags wide outcome swings, so treat the edge as softer than it looks." });
  if (!lineupLocked) factors.push({ dir: "down", text: "Lineup / starter not confirmed yet — the edge can move before first pitch." });
  
  
  return { betScore: s, tier: t, winConfidence: wc, evPct: Math.round(ev * 10) / 10, verdict: VERDICT[t], factors };
}
