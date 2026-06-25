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
  if (a === 0) return 1;
  return 1 + (a > 0 ? a / 100 : 100 / Math.abs(a));
}

// EV per $1 staked, in %. p = win prob (0..1), american = offered price.
export function evPct(p: number, american: number): number {
  const b = americanToDecimal(american) - 1;
  return (p * b - (1 - p)) * 100;
}

export function winConfidence(p: number): number {
  return Math.round(p * 1000) / 10;
}

export function betScore(pWin: number, american: number): number {
  const ev = evPct(pWin, american);
  // Pure linear scaling: 1% EV = 10 Score. Floor at 0.
  return Math.max(0, Math.round(ev * 10));
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
): { betScore: number; tier: Tier; winConfidence: number; evPct: number; verdict: string; factors: ScoreFactor[] } {
  const ev = evPct(pWin, american);
  const wc = winConfidence(pWin);
  const s = betScore(pWin, american);
  const t = tier(s);
  
  const factors: ScoreFactor[] = [];
  if (ev >= 8) factors.push({ dir: "up", text: `Strong expected value: +${ev.toFixed(1)}% return per $1 long-run.` });
  else if (ev >= 3) factors.push({ dir: "up", text: `Positive expected value: +${ev.toFixed(1)}% per $1.` });
  else if (ev >= 0) factors.push({ dir: "flat", text: `Thin expected value: +${ev.toFixed(1)}% — barely beats the price.` });
  else factors.push({ dir: "down", text: `Negative expected value: ${ev.toFixed(1)}% — the price is worse than the model's true win chance, losing money long-run.` });
  
  factors.push({ dir: "info", text: `Model raw baseline gives this a ${wc.toFixed(0)}% chance to hit.` });
  if (american > 0) factors.push({ dir: "up", text: `Plus-money price (+${american}) — pays more than even if it hits.` });
  
  return { betScore: s, tier: t, winConfidence: wc, evPct: Math.round(ev * 10) / 10, verdict: VERDICT[t], factors };
}
