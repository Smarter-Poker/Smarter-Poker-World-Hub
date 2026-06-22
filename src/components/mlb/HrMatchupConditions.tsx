import { CloudSun, ClipboardList } from 'lucide-react';

// 1 -> "1st", 2 -> "2nd", etc. (batting-order display).
const ordinal = (n: any): string => {
  const x = Number(n);
  if (!x || isNaN(x)) return '—';
  const s = ['th', 'st', 'nd', 'rd'];
  const v = x % 100;
  return x + (s[(v - 20) % 10] || s[v] || s[0]);
};

interface Weather {
  temp_f: number | null;
  humidity: number | null;
  wind_mph: number | null;
  wind_dir_deg: number | null;
  precip_prob: number | null;
  roof_state: string | null;
  summary?: string;
}
interface Lineup {
  batting_order: number | null;
  confirmed: boolean;
}

// Renders today's weather (HR-favorability summary) + this hitter's posted lineup status,
// from the /api/mlb/players/[id] matchup payload. Self-contained so it survives unrelated
// rewrites of the matchup section. Returns null when there's nothing to show.
export default function HrMatchupConditions({
  matchup,
  type,
}: {
  matchup: any;
  type: 'hitter' | 'pitcher';
}) {
  const w: Weather | null = matchup?.weather || null;
  // matchup.lineup is set (object OR null) only when the API enrichment ran for a game
  // scheduled today; undefined means we have no lineup data to speak to.
  const hasStatus = type === 'hitter' && matchup?.lineup !== undefined;
  const lu: Lineup | null = matchup?.lineup || null;
  if (!w && !hasStatus) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <CloudSun size={20} className="text-[#FFB800]" />
        <h2
          className="text-xl font-extrabold text-white tracking-widest capitalize m-0"
          style={{ fontFamily: '"Rajdhani", sans-serif' }}
        >
          Conditions &amp; Lineup Status
        </h2>
      </div>
      <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-4 shadow-[0_4px_15px_rgba(0,0,0,0.3)]">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {w && (
            <div className="bg-[#1a2332] border border-[#3d4f5f] rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <CloudSun size={15} className="text-[#FFB800]" />
                <span className="text-[13px] font-extrabold text-slate-400 tracking-widest">
                  Conditions
                </span>
              </div>
              {w.summary && (
                <div className="text-white font-bold text-[14px] leading-snug mb-1">{w.summary}</div>
              )}
              <div className="text-slate-500 text-[13px] font-bold">
                {w.temp_f != null ? `${Math.round(w.temp_f)}°F` : '—'}
                {w.wind_mph != null ? ` · Wind ${Math.round(w.wind_mph)} mph` : ''}
                {w.humidity != null ? ` · ${Math.round(w.humidity)}% RH` : ''}
                {w.roof_state ? ` · Roof ${w.roof_state}` : ''}
              </div>
            </div>
          )}
          {hasStatus && (
            <div className="bg-[#1a2332] border border-[#3d4f5f] rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <ClipboardList size={15} className="text-[#00D4FF]" />
                <span className="text-[13px] font-extrabold text-slate-400 tracking-widest">
                  Today&apos;s Status
                </span>
              </div>
              {lu ? (
                <div className="text-white font-bold text-[14px] leading-snug">
                  {lu.confirmed ? 'Confirmed Starter' : 'Projected Starter'} — Batting{' '}
                  {ordinal(lu.batting_order)}
                </div>
              ) : (
                <div className="text-slate-400 font-bold text-[14px] leading-snug">
                  Not In The Posted Lineup Yet
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
