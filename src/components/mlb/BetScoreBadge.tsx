import { betScore, tier, TIER_STYLE } from "../../lib/betScore";

export function BetScoreBadge({
  pWin,
  price,
  score,
  tierName,
  vol = false,
  lineupLocked = true,
  pMarket = null,
  compact = false,
  pendingLabel = "Awaiting price",
}: {
  pWin?: number | null;
  price?: number | null;
  score?: number | null;
  tierName?: string | null;
  vol?: boolean;
  lineupLocked?: boolean;
  pMarket?: number | null;
  compact?: boolean;
  pendingLabel?: string;
}) {
  if (score == null && (pWin == null || price == null)) {
    return (
      <span className="rounded-[4px] bg-[linear-gradient(180deg,#0a0a15_0%,#1a2332_100%)] border border-[var(--metal-highlight)] shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] px-1.5 py-0.5 text-[17px] font-semibold text-slate-500 capitalize tracking-wider">
        {pendingLabel}
      </span>
    );
  }
  const s = score ?? betScore(pWin!, price!, { vol, lineupLocked, pMarket });
  const t = tierName ? (tierName.toUpperCase() as any) : tier(s);
  const st = TIER_STYLE[t as keyof typeof TIER_STYLE] || TIER_STYLE['PASS'];
  return (
    <span
      title={`Bet Score ${s}/100 — ${t}`}
      className={`inline-flex items-baseline gap-1 rounded-[5px] border px-2 py-0.5 ${st.chip} shadow-[inset_0_1px_2px_rgba(255,255,255,0.1),_inset_0_-1px_2px_rgba(0,0,0,0.3)]`}
    >
      <span className={`text-[29px] font-black leading-none ${st.text}`}>{s}</span>
      {!compact && <span className="text-[17px] font-bold opacity-60 text-slate-500">/100</span>}
      <span className={`text-[21px] font-black capitalize tracking-wide ${st.text}`}>· {t}</span>
    </span>
  );
}
