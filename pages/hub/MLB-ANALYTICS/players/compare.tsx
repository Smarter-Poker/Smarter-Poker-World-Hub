import { useRouter } from 'next/router';
import { useState, useMemo } from 'react';
import useSWR from 'swr';
import { ArrowLeft, Search, X, GitCompareArrows } from 'lucide-react';
import MetalFrame from '../../../../src/components/ui/MetalFrame';
import BottomNavBar from '../../../../src/components/ui/BottomNavBar';
import UniversalHeader from '../../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../../src/components/ui/MlbSubNav';
import SEOHead from '../../../../src/components/seo/SEOHead';
import { glossaryFor } from '../../../../src/lib/mlbStatGlossary';

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

type Fmt = 'rate' | 'pct' | 'n2' | 'n1' | 'int' | 'ip';
const fmt = (kind: Fmt, v: any): string => {
  if (v == null || v === '' || isNaN(Number(v))) return '—';
  const n = Number(v);
  switch (kind) {
    case 'rate': return n.toFixed(3).replace(/^(-?)0\./, '$1.');
    case 'pct': return `${(n * 100).toFixed(1)}%`;
    case 'n2': return n.toFixed(2);
    case 'n1': return n.toFixed(1);
    case 'int': return String(Math.round(n));
    case 'ip': return String(v);
  }
};

type Row = [string, string, Fmt, 'up' | 'down'];
const HITTER_ROWS: Row[] = [
  ['AVG', 'AVG', 'rate', 'up'], ['OBP', 'OBP', 'rate', 'up'], ['SLG', 'SLG', 'rate', 'up'], ['OPS', 'OPS', 'rate', 'up'],
  ['HR', 'HR', 'int', 'up'], ['RBI', 'RBI', 'int', 'up'], ['R', 'R', 'int', 'up'], ['SB', 'SB', 'int', 'up'],
  ['wRC+', 'wRC+', 'int', 'up'], ['wOBA', 'wOBA', 'rate', 'up'], ['xwOBA', 'xwOBA', 'rate', 'up'], ['ISO', 'ISO', 'rate', 'up'],
  ['BB%', 'BB%', 'pct', 'up'], ['K%', 'K%', 'pct', 'down'], ['Barrel%', 'Barrel%', 'pct', 'up'], ['HardHit%', 'HardHit%', 'pct', 'up'],
  ['WAR', 'WAR', 'n1', 'up'],
];
const PITCHER_ROWS: Row[] = [
  ['W', 'W', 'int', 'up'], ['L', 'L', 'int', 'down'], ['ERA', 'ERA', 'n2', 'down'], ['WHIP', 'WHIP', 'n2', 'down'],
  ['FIP', 'FIP', 'n2', 'down'], ['xFIP', 'xFIP', 'n2', 'down'], ['SIERA', 'SIERA', 'n2', 'down'],
  ['K/9', 'K/9', 'n2', 'up'], ['BB/9', 'BB/9', 'n2', 'down'], ['HR/9', 'HR/9', 'n2', 'down'],
  ['K%', 'K%', 'pct', 'up'], ['BB%', 'BB%', 'pct', 'down'], ['IP', 'IP', 'ip', 'up'], ['SO', 'SO', 'int', 'up'],
  ['SV', 'SV', 'int', 'up'], ['WAR', 'WAR', 'n1', 'up'],
];

interface DirPlayer { player_id: number; full_name: string; team_id?: number; type: 'hitter' | 'pitcher'; }

const PlayerPicker = ({ label, dir, selectedId, onPick, onClear }: {
  label: string; dir: DirPlayer[]; selectedId: number | null; onPick: (id: number) => void; onClear: () => void;
}) => {
  const [q, setQ] = useState('');
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    return dir.filter((p) => (p.full_name || '').toLowerCase().includes(s)).slice(0, 6);
  }, [q, dir]);
  const selected = selectedId ? dir.find((p) => p.player_id === selectedId) : null;

  return (
    <div className="flex-1 min-w-0">
      <div className="text-slate-400 text-[12px] font-extrabold tracking-widest mb-2" style={{ fontFamily: '"Rajdhani", sans-serif' }}>{label}</div>
      {selected ? (
        <div className="flex items-center gap-2 bg-[#1a2332] border border-[#3d4f5f] rounded-lg p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${selected.player_id}/headshot/67/current`} alt={selected.full_name} loading="lazy" width={36} height={36} className="w-9 h-9 rounded-full object-cover bg-[#0d1117]" />
          <span className="text-white font-extrabold text-[15px] truncate" style={{ fontFamily: '"Rajdhani", sans-serif' }}>{selected.full_name}</span>
          <button onClick={onClear} className="ml-auto text-slate-500 hover:text-[#00D4FF]" aria-label="Change player"><X size={16} /></button>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#00D4FF] pointer-events-none"><Search size={16} /></div>
          <input value={q} onChange={(e) => setQ(e.target.value)} aria-label={label} placeholder="Search a player..."
            className="w-full bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-lg py-2 pl-10 pr-3 text-white font-bold text-[15px] focus:outline-none focus:border-[#00D4FF]" />
          {matches.length > 0 && (
            <div className="absolute top-[calc(100%+4px)] left-0 right-0 bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-lg z-50 overflow-hidden divide-y divide-[#1e2d3d]">
              {matches.map((p) => (
                <button key={p.player_id} onClick={() => { onPick(p.player_id); setQ(''); }}
                  className="w-full flex items-center gap-2 p-2 hover:bg-[#1a2332] text-left">
                  {p.team_id ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`https://www.mlbstatic.com/team-logos/${p.team_id}.svg`} alt="" loading="lazy" width={22} height={22} className="w-[22px] h-[22px] object-contain" />
                  ) : <div className="w-[22px] h-[22px]" />}
                  <span className="text-slate-200 font-bold text-[14px] truncate">{p.full_name}</span>
                  <span className="ml-auto text-slate-600 text-[11px] font-bold uppercase">{p.type === 'pitcher' ? 'P' : 'H'}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default function ComparePage() {
  const router = useRouter();
  const a = router.query.a ? Number(router.query.a) : null;
  const b = router.query.b ? Number(router.query.b) : null;

  const { data: dirData } = useSWR('/api/mlb/players', fetcher, { refreshInterval: 300000, revalidateOnFocus: false });
  const directory: DirPlayer[] = useMemo(() => {
    const h = (dirData?.hitters || []).map((p: any) => ({ player_id: p.player_id, full_name: p.full_name, team_id: p.team_id, type: 'hitter' as const }));
    const pi = (dirData?.pitchers || []).map((p: any) => ({ player_id: p.player_id, full_name: p.full_name, team_id: p.team_id, type: 'pitcher' as const }));
    return [...h, ...pi];
  }, [dirData]);

  const { data: dA } = useSWR(a ? `/api/mlb/players/${a}` : null, fetcher, { revalidateOnFocus: false });
  const { data: dB } = useSWR(b ? `/api/mlb/players/${b}` : null, fetcher, { revalidateOnFocus: false });

  const setPick = (slot: 'a' | 'b', id: number | null) => {
    const next = { ...router.query } as Record<string, any>;
    if (id == null) delete next[slot]; else next[slot] = String(id);
    router.replace({ pathname: router.pathname, query: next }, undefined, { shallow: true });
  };

  const bothLoaded = dA?.player && dB?.player;
  const sameType = bothLoaded && dA.type === dB.type;
  const type: 'hitter' | 'pitcher' = dA?.type === 'pitcher' ? 'pitcher' : 'hitter';
  const rows = type === 'pitcher' ? PITCHER_ROWS : HITTER_ROWS;

  return (
    <div className="min-h-screen bg-[#0a0a15] pb-[70px] font-sans w-full max-w-[100vw] overflow-x-hidden box-border text-slate-200">
      <SEOHead title="Compare MLB Players — Side-by-Side Stats | Smarter.Poker" description="Compare any two MLB players side by side across advanced stats, with the better value highlighted." noindex={true} />
      <UniversalHeader pageDepth={2} onBackClick={() => router.push('/hub/MLB-ANALYTICS/players')} />
      <MlbSubNav />

      <div className="p-4 w-full max-w-4xl mx-auto box-border">
        <Link href="/hub/MLB-ANALYTICS/players" className="inline-flex items-center gap-1 text-[#00D4FF] text-[13px] font-extrabold tracking-widest hover:text-white transition-colors mb-4">
          <ArrowLeft size={14} /> Back to Database
        </Link>

        <div className="flex items-center gap-2 mb-6">
          <GitCompareArrows size={22} className="text-[#00D4FF]" />
          <h1 className="m-0 text-[31px] md:text-[39px] font-extrabold text-white tracking-wide" style={{ fontFamily: '"Rajdhani", sans-serif' }}>Compare Players</h1>
        </div>

        <MetalFrame className="p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <PlayerPicker label="Player A" dir={directory} selectedId={a} onPick={(id) => setPick('a', id)} onClear={() => setPick('a', null)} />
            <PlayerPicker label="Player B" dir={directory} selectedId={b} onPick={(id) => setPick('b', id)} onClear={() => setPick('b', null)} />
          </div>
        </MetalFrame>

        {!bothLoaded ? (
          <div className="text-center text-slate-500 font-bold text-sm tracking-wide py-10">
            Pick two players above to compare their {type === 'pitcher' ? 'pitching' : ''} stat lines side by side.
          </div>
        ) : !sameType ? (
          <div className="text-center text-[#FFB020] font-bold text-sm tracking-wide py-10">
            Those are a hitter and a pitcher — pick two of the same type to compare.
          </div>
        ) : (
          <MetalFrame className="p-2 sm:p-4">
            <div className="grid grid-cols-3 items-center gap-2 pb-3 mb-2 border-b border-[#2a3a4a]">
              <div className="text-center text-white font-extrabold text-[15px] truncate" style={{ fontFamily: '"Rajdhani", sans-serif' }}>{dA.player.full_name}</div>
              <div className="text-center text-slate-500 text-[11px] font-extrabold tracking-widest">STAT</div>
              <div className="text-center text-white font-extrabold text-[15px] truncate" style={{ fontFamily: '"Rajdhani", sans-serif' }}>{dB.player.full_name}</div>
            </div>
            {rows.map(([label, key, kind, dir]) => {
              const av = dA.season ? dA.season[key] : null;
              const bv = dB.season ? dB.season[key] : null;
              let aWin = false, bWin = false;
              if (av != null && bv != null && !isNaN(Number(av)) && !isNaN(Number(bv)) && Number(av) !== Number(bv)) {
                const aBetter = dir === 'up' ? Number(av) > Number(bv) : Number(av) < Number(bv);
                aWin = aBetter; bWin = !aBetter;
              }
              return (
                <div key={label} className="grid grid-cols-3 items-center gap-2 py-1.5 border-b border-[#1e2d3d] last:border-0">
                  <div className={`text-center text-[17px] font-extrabold ${aWin ? 'text-[#3ED598]' : 'text-slate-300'}`} style={{ fontFamily: '"Rajdhani", sans-serif' }}>{fmt(kind, av)}</div>
                  <div className="text-center text-slate-500 text-[12px] font-extrabold tracking-widest" title={glossaryFor(label)}>{label}</div>
                  <div className={`text-center text-[17px] font-extrabold ${bWin ? 'text-[#3ED598]' : 'text-slate-300'}`} style={{ fontFamily: '"Rajdhani", sans-serif' }}>{fmt(kind, bv)}</div>
                </div>
              );
            })}
            <div className="flex justify-between mt-3 pt-2 text-[12px]">
              <Link href={`/hub/MLB-ANALYTICS/players/${a}`} className="text-[#00D4FF] underline font-bold">Full profile</Link>
              <Link href={`/hub/MLB-ANALYTICS/players/${b}`} className="text-[#00D4FF] underline font-bold">Full profile</Link>
            </div>
          </MetalFrame>
        )}
      </div>
      <BottomNavBar />
    </div>
  );
}
