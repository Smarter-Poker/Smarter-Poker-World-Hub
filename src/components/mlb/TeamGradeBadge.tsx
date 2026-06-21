import { tier, TIER_STYLE } from '../../lib/betScore';

// Team power-rating badge. Uses the SAME tier() thresholds and TIER_STYLE colors
// as BetScoreBadge / every other MLB surface, so the grade scale
// (ELITE / STRONG / LEAN / THIN / PASS) is identical site-wide. The only
// difference is the input: a 0-100 team power_score from v_mlb_standings
// instead of a bet score.
export function TeamGradeBadge({
  score,
  compact = false,
}: {
  score: number | null | undefined;
  compact?: boolean;
}) {
  if (score == null || Number.isNaN(Number(score))) {
    return (
      <span className="rounded-[4px] bg-[linear-gradient(180deg,#0a0a15_0%,#1a2332_100%)] border border-[var(--metal-highlight)] shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
        N/A
      </span>
    );
  }
  const s = Math.round(Number(score));
  const t = tier(s);
  const st = TIER_STYLE[t];
  return (
    <span
      title={`Power rating ${s} — ${t}`}
      className={`inline-flex items-baseline gap-1 rounded-[5px] border px-2 py-0.5 ${st.chip} shadow-[inset_0_1px_2px_rgba(255,255,255,0.1),_inset_0_-1px_2px_rgba(0,0,0,0.3)]`}
    >
      <span className={`text-[17px] font-black leading-none ${st.text}`}>{s}</span>
      <span className={`text-[12px] font-black uppercase tracking-wide ${st.text}`}>· {t}</span>
    </span>
  );
}

export default TeamGradeBadge;
