import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Flame } from 'lucide-react';

interface Leader {
  player_id: number;
  full_name: string;
  team_id: number | null;
  hr_prob: number | null;
  game_pk: number | null;
}

const headshot = (id: number) =>
  `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_120,q_auto:best/v1/people/${id}/headshot/67/current`;

function LeaderCard({ rank, p }: { rank: number; p: Leader }) {
  const [img, setImg] = useState(headshot(p.player_id));
  const pct = p.hr_prob != null ? Math.round(p.hr_prob * 100) : null;
  // Rank tiers for the badge color.
  const badge =
    rank === 1 ? '#FFD700' : rank === 2 ? '#C0C0C0' : rank === 3 ? '#CD7F32' : '#00D4FF';
  return (
    <Link
      href={`/hub/MLB-ANALYTICS/players/${p.player_id}`}
      className="relative flex items-center gap-3 bg-[#1a2332] border border-[#3d4f5f] rounded-lg p-3 hover:border-[#00D4FF] transition-colors"
    >
      <span
        className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-extrabold text-[#0a0a15]"
        style={{ background: badge, fontFamily: '"Rajdhani", sans-serif' }}
      >
        {rank}
      </span>
      <div className="relative shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={img}
          onError={() => setImg('/default-avatar.png')}
          alt={p.full_name}
          loading="lazy"
          width={44}
          height={44}
          className="w-11 h-11 rounded-full object-cover bg-[#0d1117] border-[2px] border-[#3d4f5f]"
        />
        {p.team_id != null && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`https://www.mlbstatic.com/team-logos/${p.team_id}.svg`}
            alt="team"
            loading="lazy"
            width={18}
            height={18}
            className="absolute -bottom-1 -right-1 w-[18px] h-[18px] bg-[#0d1117] rounded-full p-[1px] border border-[#3d4f5f]"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div
          className="text-white font-extrabold text-[15px] truncate"
          style={{ fontFamily: '"Rajdhani", sans-serif' }}
        >
          {p.full_name}
        </div>
        <div className="text-slate-500 text-[12px] font-bold tracking-wide">HR Chance Today</div>
      </div>
      {pct != null && (
        <div className="shrink-0 text-right">
          <div
            className="text-[#00D4FF] font-extrabold text-[22px] leading-none"
            style={{ fontFamily: '"Rajdhani", sans-serif' }}
          >
            {pct}%
          </div>
        </div>
      )}
    </Link>
  );
}

export default function HrTodayLeaders({ limit = 24 }: { limit?: number }) {
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/mlb/hr-today?limit=${limit}`);
        const j = await res.json();
        if (!alive) return;
        setLeaders(Array.isArray(j.leaders) ? j.leaders : []);
      } catch {
        if (alive) setFailed(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [limit]);

  if (failed) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <Flame size={20} className="text-[#FF6B35]" />
        <h2
          className="text-xl font-extrabold text-white tracking-widest capitalize m-0"
          style={{ fontFamily: '"Rajdhani", sans-serif' }}
        >
          Most Likely To Homer Today
        </h2>
      </div>
      <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-4 shadow-[0_4px_15px_rgba(0,0,0,0.3)]">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-[68px] bg-[#1a2332] border border-[#3d4f5f] rounded-lg animate-pulse"
              />
            ))}
          </div>
        ) : leaders.length === 0 ? (
          <div className="text-slate-500 text-[14px] font-bold text-center py-3">
            No home-run projections posted yet for today&apos;s slate.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {leaders.map((p, i) => (
              <LeaderCard key={p.player_id} rank={i + 1} p={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
