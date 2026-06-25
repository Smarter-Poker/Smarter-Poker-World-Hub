// @ts-nocheck
'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Image from 'next/image';
import Link from 'next/link';
import useSWR from 'swr';
import { createClient } from '@supabase/supabase-js';
import { useEffect } from 'react';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../src/components/ui/MlbSubNav';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import SEOHead from '../../../src/components/seo/SEOHead';
import { BetScoreBadge } from '../../../src/components/mlb/BetScoreBadge';
import { teamLogo, type GameCard } from '../../../src/lib/mlb_data';
export type Tier = 'ELITE' | 'STRONG' | 'LEAN' | 'THIN' | 'PASS';

export const TIER_STYLE: Record<Tier, { text: string; chip: string }> = {
  ELITE: { text: 'text-[#00D4FF] drop-shadow-[0_0_8px_rgba(0,212,255,0.8)]', chip: 'border-[#00D4FF]/50 bg-[#00D4FF]/10 shadow-[0_0_15px_rgba(0,212,255,0.2)]' },
  STRONG: { text: 'text-[#34D399] drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]', chip: 'border-[#34D399]/50 bg-[#34D399]/10 shadow-[0_0_15px_rgba(52,211,153,0.2)]' },
  LEAN: { text: 'text-[#38BDF8] drop-shadow-[0_0_8px_rgba(56,189,248,0.8)]', chip: 'border-[#38BDF8]/50 bg-[#38BDF8]/10 shadow-[0_0_15px_rgba(56,189,248,0.2)]' },
  THIN: { text: 'text-[#F59E0B] drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]', chip: 'border-[#F59E0B]/50 bg-[#F59E0B]/10 shadow-[0_0_15px_rgba(245,158,11,0.2)]' },
  PASS: { text: 'text-[#64748B]', chip: 'border-[#3d4f5f] bg-[#0a0f16]' },
};

// ─── Helpers ─────────────────────────────────────────────────────

function getTeamName(fullName: string): string {
  if (!fullName) return '';
  if (fullName.endsWith('Red Sox')) return 'Red Sox';
  if (fullName.endsWith('White Sox')) return 'White Sox';
  if (fullName.endsWith('Blue Jays')) return 'Blue Jays';
  return fullName.split(' ').pop() ?? fullName;
}

function EdgeBadge({ g }: { g: GameCard }) {
  if (g.modelHome == null)
    return (
      <span className="rounded-sm bg-[#0d1117] border border-[#3d4f5f] px-1.5 py-0.5 text-[17px] font-black text-[#5a6a7a] capitalize tracking-widest shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
        Pending
      </span>
    );
  const ll = g.lineupState === 'confirmed';
  if (g.bet) {
    const hasKelly = g.bet.kelly_pct != null;
    return (
      <div className="flex items-center gap-1.5">
        <BetScoreBadge
          pWin={g.bet.winProb}
          price={g.bet.price}
          pMarket={g.bet.market}
          lineupLocked={ll}
        />
        {hasKelly && (
          <span className="rounded-sm bg-[#FFD700]/10 border border-[#FFD700] px-1.5 py-0.5 text-[17px] font-black text-[#FFD700] capitalize tracking-wider shadow-[0_0_8px_rgba(255,215,0,0.2)]">
            {g.bet.kelly_pct}%
          </span>
        )}
      </div>
    );
  }
  return (
    <BetScoreBadge
      pWin={g.scoreWinProb}
      price={g.scorePrice}
      pMarket={g.scoreMarket}
      lineupLocked={ll}
    />
  );
}

// ─── Supabase live-sync indicator ──────────────────────────────────────

const sbUrl = typeof window !== 'undefined' ? process.env.NEXT_PUBLIC_SUPABASE_URL || '' : '';
const sbAnonKey =
  typeof window !== 'undefined' ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '' : '';
const sb =
  typeof window !== 'undefined' && sbUrl && sbAnonKey ? createClient(sbUrl, sbAnonKey) : null;

function SyncIndicator({ onSync }: { onSync: () => void }) {
  const [hasUpdate, setHasUpdate] = useState(false);

  useEffect(() => {
    if (!sb) return;
    const channel = sb
      .channel('mlb-slate-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pred_market_output' }, () =>
        setHasUpdate(true)
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fact_games' }, () =>
        setHasUpdate(true)
      )
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, []);

  if (!hasUpdate) {
    return (
      <div className="fixed bottom-4 right-4 flex items-center gap-2 px-3 py-1.5 bg-[#0d1117] border border-[#3d4f5f] rounded-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)] z-50 pointer-events-none">
        <div className="w-2 h-2 rounded-full bg-[#3d4f5f]" />
        <span className="text-[17px] font-black text-[#5a6a7a] tracking-widest capitalize ">
          System Sync
        </span>
      </div>
    );
  }

  return (
    <button
      onClick={() => { try { navigator.vibrate(15); } catch(err) {} 
                  onSync();
                  setHasUpdate(false);
                }}
      className="fixed bottom-4 right-4 flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#1a2332] to-[#0d1117] border-2 border-[#00D4FF] rounded-sm shadow-[0_0_15px_rgba(0,212,255,0.4)] z-50 cursor-pointer hover:bg-[#00D4FF] group transition-all animate-pulse min-h-[44px]"
    >
      <div className="w-2.5 h-2.5 rounded-full bg-[#00D4FF] shadow-[0_0_8px_#00D4FF] group-hover:bg-[#0d1117]" />
      <span className="text-[18px] font-black text-[#00D4FF] tracking-widest capitalize  group-hover:text-[#0d1117]">
        Sync New Data
      </span>
    </button>
  );
}

// ─── Market Grades Panel ────────────────────────────────────────────

function MarketGradesPanel({ g }: { g: GameCard }) {
  const router = useRouter();

  // ML
  let mlScore = 0;
  let mlTier: Tier = 'PASS';
  let mlRec = 'Hold';
  let mlSide: 'home' | 'away' | null = null;
  let mlEv = 0;
  let mlFactors = '';
  const isLocked = g.lineupState === 'confirmed';

  if (g.bet && g.bet.edge != null) {
    mlScore = g.bet.bet_score ?? 0;
    mlTier = (g.bet.bet_tier as Tier) || 'PASS';
    mlEv = Number(Number(g.bet.ev_pct).toFixed(1)) || 0;
    try {
      const parsed = typeof g.bet.score_factors === 'string' ? JSON.parse(g.bet.score_factors) : g.bet.score_factors;
      if (Array.isArray(parsed)) mlFactors = parsed.map((f: any) => f.text).join('\n');
    } catch(e) {}
    
    const teamName = g.bet.team?.split(' ').pop() || 'Hold';
    const priceStr = g.bet.price != null ? (g.bet.price > 0 ? `+${g.bet.price}` : `${g.bet.price}`) : '';
    mlRec = mlScore > 0 ? `${teamName} ${priceStr}`.trim() : teamName;
    mlSide = g.bet.selection;
  }

  // RL
  let rlScore = 0;
  let rlTier: Tier = 'PASS';
  let rlRec = 'Hold';
  let rlEv = 0;
  let rlFactors = '';

  if (g.runLineBet && g.runLineBet.edge != null) {
    rlScore = g.runLineBet.bet_score ?? 0;
    rlTier = (g.runLineBet.bet_tier as Tier) || 'PASS';
    rlEv = Number(Number(g.runLineBet.ev_pct).toFixed(1)) || 0;
    try {
      const parsed = typeof g.runLineBet.score_factors === 'string' ? JSON.parse(g.runLineBet.score_factors) : g.runLineBet.score_factors;
      if (Array.isArray(parsed)) rlFactors = parsed.map((f: any) => f.text).join('\n');
    } catch(e) {}
    
    let teamName = '';
    let lineStr = '';
    const sel = String(g.runLineBet.selection || '');
    if (sel.startsWith('home')) {
      teamName = g.home.split(' ').pop() || 'Home';
      lineStr = sel.replace('home_', '');
    } else if (sel.startsWith('away')) {
      teamName = g.away.split(' ').pop() || 'Away';
      lineStr = sel.replace('away_', '');
    }
    const priceStr = g.runLineBet.price != null ? (g.runLineBet.price > 0 ? `+${g.runLineBet.price}` : `${g.runLineBet.price}`) : '';
    rlRec = rlScore > 0 ? `${teamName} ${lineStr} ${priceStr}`.trim() : `${teamName} ${lineStr}`.trim();
  }

  // O/U
  let ouScore = 0;
  let ouTier: Tier = 'PASS';
  let ouRec = 'Hold';
  let ouEv = 0;
  let ouFactors = '';

  if (g.totalBet && g.totalBet.edge != null) {
    ouScore = g.totalBet.bet_score ?? 0;
    ouTier = (g.totalBet.bet_tier as Tier) || 'PASS';
    ouEv = Number(Number(g.totalBet.ev_pct).toFixed(1)) || 0;
    try {
      const parsed = typeof g.totalBet.score_factors === 'string' ? JSON.parse(g.totalBet.score_factors) : g.totalBet.score_factors;
      if (Array.isArray(parsed)) ouFactors = parsed.map((f: any) => f.text).join('\n');
    } catch(e) {}

    let choice = '';
    let lineStr = '';
    const sel = String(g.totalBet.selection || '');
    if (sel.startsWith('over')) {
      choice = 'Over';
      lineStr = sel.replace('over_', '');
    } else if (sel.startsWith('under')) {
      choice = 'Under';
      lineStr = sel.replace('under_', '');
    }
    const priceStr = g.totalBet.price != null ? (g.totalBet.price > 0 ? `+${g.totalBet.price}` : `${g.totalBet.price}`) : '';
    ouRec = ouScore > 0 ? `${choice} ${lineStr} ${priceStr}`.trim() : `${choice} ${lineStr}`.trim();
  } else if (g.avgTotalLine) {
    ouRec = `O/U ${g.avgTotalLine}`;
  }

  const cells = [
    { label: 'Money Line', score: mlScore, tier: mlTier, rec: mlRec, ev: mlEv, factors: mlFactors },
    { label: 'Run Line', score: rlScore, tier: rlTier, rec: rlRec, ev: rlEv, factors: rlFactors },
    { label: 'Over / Under', score: ouScore, tier: ouTier, rec: ouRec, ev: ouEv, factors: ouFactors },
  ];

  return (
    <div className="mt-5 pt-4 border-t-2 border-[#2a3a4a] relative">
      <div className="absolute top-[-2px] left-1/2 -translate-x-1/2 w-12 h-[2px] bg-[#3d4f5f]" />

      {/* 3-column grade grid */}
      <div className="grid grid-cols-3 gap-2 mb-3 px-4 md:px-0">
        {cells.map(({ label, score, tier, rec, ev, factors }) => {
          const st = TIER_STYLE[tier] || TIER_STYLE.PASS;
          return (
            <div
              key={label}
              title={factors}
              className={`flex flex-col items-center justify-center rounded-sm border px-2 py-3 shadow-[inset_0_1px_3px_rgba(0,0,0,0.6)] ${tier === 'PASS' ? 'border-[#2a3a4a] bg-[#0a0a15]' : st.chip}`}
            >
              <span className="text-[21px] font-black capitalize tracking-widest text-[#7a8a9a] mb-1.5 opacity-90">
                {label}
              </span>
              <div className="flex flex-col items-center justify-center w-full">
                <span
                  className={`text-[47px] font-black leading-none text-slate-200 font-sans tracking-tight`}
                >
                  {score > 0 ? score : '—'}
                </span>
                <span
                  className={`text-[23px] font-black capitalize tracking-widest mt-1.5 text-center leading-tight ${st.text} drop-shadow-sm`}
                >
                  {score > 0 ? rec : 'PASS'}
                </span>
                {score > 0 && label === 'Money Line' && (
                  <span
                    className={`text-[18px] font-black tracking-widest capitalize mt-1 ${ev > 0 ? 'text-[#00C853]' : 'text-red-500'}`}
                  >
                    {ev > 0 ? '+' : ''}
                    {ev}% EV
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* See Prop Bets — div button avoids nested <a> inside the parent Link */}
      <div
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          router.push(`/hub/MLB-ANALYTICS/props?game=${g.gamePk}`);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            router.push(`/hub/MLB-ANALYTICS/props?game=${g.gamePk}`);
          }
        }}
        className="flex items-center justify-center gap-2 w-full py-2 bg-[#0a0a15] border border-[#2a3a4a] rounded-sm text-[18px] font-black capitalize tracking-widest text-[#8a9ba8] hover:border-[#00D4FF] hover:text-[#00D4FF] hover:shadow-[0_0_10px_rgba(0,212,255,0.1)] transition-all cursor-pointer select-none"
      >
        <span>See Prop Bets</span>
        <span className="text-[#3d4f5f] group-hover:text-[#00D4FF]">→</span>
      </div>
    </div>
  );
}

// ─── Filter Bar ──────────────────────────────────────────────────

interface FilterState {
  actionable: boolean;
  propsOnly: boolean;
  minEdge: number;
}

function FilterBar({
  edgesCount,
  filters,
  onFilter,
}: {
  edgesCount: number;
  filters: FilterState;
  onFilter: (f: FilterState) => void;
}) {
  return (
    <div className="relative flex flex-wrap items-center gap-4 px-4 py-3 mb-6 bg-gradient-to-b from-[#1a2332] to-[#0d1117] border-y-2 border-[#3d4f5f] shadow-[inset_0_2px_8px_rgba(0,0,0,0.8),0_4px_10px_rgba(0,0,0,0.5)] z-40">
      <div className="absolute top-[-4px] left-[10%] right-[10%] h-[2px] bg-gradient-to-r from-transparent via-[#3d4f5f] to-transparent opacity-50" />

      {/* Actionable */}
      <button
        onClick={() => { try { navigator.vibrate(15); } catch(err) {} return onFilter({ ...filters, actionable: !filters.actionable }); }}
        className={`flex items-center gap-2 px-3 py-1.5 border-2 rounded-sm transition-all ${
          filters.actionable
            ? 'bg-[#0d1117] border-[#00D4FF] shadow-[0_0_10px_rgba(0,212,255,0.3),inset_0_2px_4px_rgba(0,0,0,0.5)]'
            : 'bg-[#0d1117] border-[#2a3a4a] shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] hover:border-[#3d4f5f]'
        }`}
      >
        <div
          className={`w-2 h-2 rounded-full ${filters.actionable ? 'bg-[#00D4FF] shadow-[0_0_8px_#00D4FF]' : 'bg-[#2a3a4a]'}`}
        />
        <span
          className={`text-[18px] font-black capitalize tracking-widest ${filters.actionable ? 'text-[#00D4FF]' : 'text-[#5a6a7a]'}`}
        >
          Actionable ({edgesCount})
        </span>
      </button>

      {/* Props Only */}
      <button
        onClick={() => { try { navigator.vibrate(15); } catch(err) {} return onFilter({ ...filters, propsOnly: !filters.propsOnly }); }}
        className={`flex items-center gap-2 px-3 py-1.5 border-2 rounded-sm transition-all ${
          filters.propsOnly
            ? 'bg-[#0d1117] border-[#00BFFF] shadow-[0_0_10px_rgba(0,191,255,0.3),inset_0_2px_4px_rgba(0,0,0,0.5)]'
            : 'bg-[#0d1117] border-[#2a3a4a] shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] hover:border-[#3d4f5f]'
        }`}
      >
        <div
          className={`w-2 h-2 rounded-full ${filters.propsOnly ? 'bg-[#00BFFF] shadow-[0_0_8px_#00BFFF]' : 'bg-[#2a3a4a]'}`}
        />
        <span
          className={`text-[18px] font-black capitalize tracking-widest ${filters.propsOnly ? 'text-[#00BFFF]' : 'text-[#5a6a7a]'}`}
        >
          Player Props
        </span>
      </button>

      {/* Min Edge */}
      <div className="flex items-center gap-2 ml-auto bg-[#0d1117] border-2 border-[#2a3a4a] rounded-sm px-2 py-1 shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] hover:border-[#3d4f5f] transition-colors">
        <span className="text-[17px] font-black capitalize tracking-widest text-[#5a6a7a]">
          Min Edge:
        </span>
        <select
          value={filters.minEdge}
          onChange={(e) => onFilter({ ...filters, minEdge: parseFloat(e.target.value) })}
          className="bg-transparent border-none text-[21px] font-black text-[#00D4FF] outline-none cursor-pointer capitalize tracking-wider"
        >
          <option value="0" className="bg-[#0d1117] text-[#00D4FF]">
            Any
          </option>
          <option value="2" className="bg-[#0d1117] text-[#00D4FF]">
            &gt; 2%
          </option>
          <option value="5" className="bg-[#0d1117] text-[#00D4FF]">
            &gt; 5%
          </option>
          <option value="8" className="bg-[#0d1117] text-[#00D4FF]">
            &gt; 8%
          </option>
          <option value="10" className="bg-[#0d1117] text-[#00D4FF]">
            &gt; 10%
          </option>
        </select>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function MlbSlatePage() {
  const [filters, setFilters] = useState<FilterState>({
    actionable: false,
    propsOnly: false,
    minEdge: 0,
  });
  const { data, error, mutate } = useSWR('/api/mlb/dashboard', fetcher, {
    refreshInterval: 120000,
  });

  const isLoading = !data && !error;
  const fetchError = !!error;

  const date: string | null = data?.todayStr ?? null;
  const fullSlate: GameCard[] = data?.slateGames ?? [];

  const CST_TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  const slateStale = date != null && date !== CST_TODAY;

  const edgesCount = fullSlate.filter((g) => g.bet).length;

  // Apply filters
  let slate = fullSlate;
  if (filters.actionable) slate = slate.filter((g) => g.bet);
  if (filters.propsOnly) slate = slate.filter((g) => g.topProps && g.topProps.length > 0);
  if (filters.minEdge > 0) {
    slate = slate.filter((g) => {
      const hasGameEdge = g.bet && g.bet.edge >= filters.minEdge;
      const hasPropEdge = g.topProps && g.topProps.some((p) => p.edge >= filters.minEdge);
      return hasGameEdge || hasPropEdge;
    });
  }

  return (
    <div
      className="min-h-screen bg-[#0a0a15] pb-[70px] w-full max-w-[100vw] overflow-x-hidden box-border"
      style={{ fontFamily: "'Rajdhani', sans-serif" }}
    >
      <SEOHead
        title="MLB Analytics Vault — Daily Predictions & Best Bets | Smarter.Poker"
        description="AI-powered MLB predictions, daily best bets, player props, moneyline edges, and real-time analytics. Smarter.Poker MLB Analytics Vault delivers model-backed picks every day."
        canonical="/hub/MLB-ANALYTICS"
        jsonLd={{
          '@type': 'WebApplication',
          name: 'Smarter.Poker MLB Analytics Vault',
          url: 'https://smarter.poker/hub/MLB-ANALYTICS',
          applicationCategory: 'SportsApplication',
          operatingSystem: 'Web',
          description:
            'AI-powered MLB betting analytics, daily best bets, player props, and real-time model predictions.',
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
          provider: {
            '@type': 'Organization',
            name: 'Smarter.Poker',
            url: 'https://smarter.poker',
          },
        }}
        ogImage="/images/mlb/og.png"
      />
      <UniversalHeader
        pageDepth={2}
        onBackClick={() => {
          window.location.href = '/hub';
        }}
      />
      <MlbSubNav />

      <SyncIndicator onSync={() => mutate()} />

      <main className="mx-auto max-w-2xl bg-[#0a0a15] min-h-screen shadow-2xl relative pb-[70px] text-slate-300 w-full">
        {/* ── Header ───────────────────────────────────── */}
        <header className="relative px-4 pt-6 pb-4 bg-gradient-to-b from-[#1a2332] to-[#0d1117] border-b-[3px] border-[#3d4f5f] shadow-[0_8px_30px_rgba(0,0,0,0.8)] z-10">
          {/* Corner bolts */}
          <div className="absolute top-3 left-3 w-3 h-3 rounded-full bg-gradient-to-br from-[#5a6a7a] to-[#3a4a5a] border border-[#1a2a3a] shadow-[inset_0_1px_2px_rgba(255,255,255,0.2),0_2px_4px_rgba(0,0,0,0.5)]" />
          <div className="absolute top-3 right-3 w-3 h-3 rounded-full bg-gradient-to-br from-[#5a6a7a] to-[#3a4a5a] border border-[#1a2a3a] shadow-[inset_0_1px_2px_rgba(255,255,255,0.2),0_2px_4px_rgba(0,0,0,0.5)]" />

          <h1
            className="text-[51px] font-black tracking-[0.2em] capitalize text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.2)] text-center"
            style={{ fontFamily: "'Rajdhani', sans-serif" }}
          >
            MLB Analytics{' '}
            <span className="text-[#00D4FF] drop-shadow-[0_0_10px_rgba(0,212,255,0.6)]">Vault</span>
          </h1>

          <div className="flex flex-col items-center mt-3 mb-4 gap-3">
            <p className="text-[21px] text-[#5a6a7a] font-bold tracking-widest capitalize bg-[#0d1117] px-3 py-1 rounded-sm border border-[#2a3a4a] shadow-[inset_0_1px_3px_rgba(0,0,0,0.5)]">
              {isLoading ? 'Loading...' : (() => {
                if (!date) return 'NO DATA';
                const d = new Date(date + 'T00:00:00'); // Force local interpretation of the date string
                const formattedDate = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
                const day = d.getDate();
                const suffix = ["th", "st", "nd", "rd"][day % 10 > 3 ? 0 : (day % 100 - day % 10 !== 10) ? day % 10 : 0];
                return `${formattedDate}${suffix}`.toUpperCase();
              })()}
              {!isLoading && (
                <span className="ml-2">
                  ({fullSlate.length} TODAY)
                </span>
              )}
            </p>
          </div>

          {/* Bottom neon strip */}
          <div className="absolute bottom-0 left-[10%] right-[10%] h-[3px] bg-[#00D4FF] shadow-[0_0_10px_#00D4FF,0_0_20px_rgba(0,212,255,0.4)] rounded-t-full" />
        </header>

        {/* ── Stale / Error banners ─────────────────────── */}
        {slateStale && !fetchError && (
          <div className="mx-4 mt-5 rounded-sm border-2 border-amber-500/50 bg-[#1a1500] px-4 py-3 shadow-[0_0_15px_rgba(245,158,11,0.1),inset_0_2px_4px_rgba(0,0,0,0.5)] relative overflow-hidden">
            <div className="absolute left-0 top-0 w-1 h-full bg-amber-500 shadow-[0_0_10px_#f59e0b]" />
            <p className="text-[21px] font-black tracking-widest capitalize text-amber-500">
              Warning: Showing {date}
            </p>
            <p className="text-[18px] text-amber-600/70 mt-1 font-bold capitalize tracking-wider">
              Today&apos;s slate ({CST_TODAY}) is not initialized. Awaiting market data.
            </p>
          </div>
        )}

        {fetchError && (
          <div className="mx-4 mt-5 rounded-sm border-2 border-red-500/50 bg-[#1a0a0a] px-4 py-3 shadow-[0_0_15px_rgba(239,68,68,0.1),inset_0_2px_4px_rgba(0,0,0,0.5)] relative">
            <div className="absolute left-0 top-0 w-1 h-full bg-red-500 shadow-[0_0_10px_#ef4444]" />
            <p className="text-[21px] font-black tracking-widest capitalize text-red-500">
              System Error
            </p>
            <p className="text-[18px] text-red-400 mt-1 font-bold tracking-wider">
              Failed to establish secure connection to data vault. Retrying...
            </p>
          </div>
        )}



        {/* ── Loading Spinner ─────────────────────── */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center mt-20">
            <div className="w-8 h-8 rounded-full border-2 border-[#5a6a7a] border-t-[#00D4FF] animate-spin mb-4" />
            <span className="text-[#5a6a7a]  font-black tracking-widest text-[17px] capitalize">
              Initializing Slate Data...
            </span>
          </div>
        )}

        {/* ── Empty State ───────────────────────── */}
        {!isLoading && slate.length === 0 && !fetchError && (
          <div className="mx-4 mt-8 flex flex-col items-center justify-center p-8 border-2 border-dashed border-[#3d4f5f] rounded-sm bg-[#0d1117] opacity-60">
            <div className="w-8 h-8 rounded-full border-2 border-[#5a6a7a] border-t-[#00D4FF] animate-spin mb-3" />
            <p className="text-[22px] font-black tracking-widest capitalize text-[#5a6a7a]">
              {filters.actionable
                ? 'Zero Actionable Targets Detected'
                : 'Awaiting Nightly Pipeline Payload...'}
            </p>
          </div>
        )}

        {/* ── Game Cards ────────────────────────── */}
        {!isLoading && slate.length > 0 && (
          <div className="flex flex-col pt-2 gap-6">
            {slate.map((g) => (
              <Link
                key={g.gamePk}
                href={`/hub/MLB-ANALYTICS/game/${g.gamePk}`}
                className="block relative bg-gradient-to-b from-[#1a2332] to-[#0d1117] border-[3px] border-[#3d4f5f] rounded-lg mx-4 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),inset_0_-1px_0_rgba(0,0,0,0.5),0_8px_20px_rgba(0,0,0,0.6)] hover:border-[#00D4FF] transition-all duration-300 ease-out group hover:-translate-y-1 hover:shadow-[0_12px_25px_rgba(0,0,0,0.8),0_0_15px_rgba(0,212,255,0.15)]"
              >
                {/* Corner Screws */}
                <div className="absolute top-2 left-2 w-2 h-2 rounded-full bg-gradient-to-br from-[#5a6a7a] to-[#2a3a4a] border border-[#0a0a15] shadow-inner" />
                <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-gradient-to-br from-[#5a6a7a] to-[#2a3a4a] border border-[#0a0a15] shadow-inner" />
                <div className="absolute bottom-2 left-2 w-2 h-2 rounded-full bg-gradient-to-br from-[#5a6a7a] to-[#2a3a4a] border border-[#0a0a15] shadow-inner" />
                <div className="absolute bottom-2 right-2 w-2 h-2 rounded-full bg-gradient-to-br from-[#5a6a7a] to-[#2a3a4a] border border-[#0a0a15] shadow-inner" />

                {/* Left neon edge */}
                <div className="absolute top-[20%] bottom-[20%] left-[-2px] w-[3px] bg-[#00D4FF] rounded-r-md opacity-30 group-hover:opacity-100 group-hover:shadow-[0_0_12px_#00D4FF] transition-all" />

                {/* ── Game Header ────────────────── */}
                <div className="flex items-center justify-start mb-4 pl-2 border-b border-[#2a3a4a] pb-3">
                  <div className="flex flex-col min-w-0 w-full overflow-hidden">
                    <span
                      className="text-white font-black tracking-wider sm:tracking-[0.15em] capitalize group-hover:text-[#00D4FF] transition-colors drop-shadow-[0_0_2px_rgba(255,255,255,0.5)] whitespace-nowrap text-left"
                      style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 'clamp(11px, 3.2vw, 24px)' }}
                    >
                      {g.away} @ {g.home}
                    </span>
                  </div>
                </div>

                {/* ── Teams + Odds Grid ─────────────── */}
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  {/* Left: Away + Home stacked */}
                  <div className="flex flex-col gap-4 flex-1 min-w-0">
                    {/* Away Team */}
                    <div className="flex items-center gap-4">
                      <div className="w-[72px] h-[72px] bg-[#0a0a15] border border-[#3d4f5f] rounded-full flex items-center justify-center shadow-[inset_0_2px_4px_rgba(0,0,0,0.8),0_0_5px_rgba(0,212,255,0.1)] p-1 flex-shrink-0">
                        {teamLogo(g.awayId) ? (
                          <Image
                            unoptimized
                            width={100}
                            height={100}
                            src={teamLogo(g.awayId) ?? ''}
                            alt=""
                            className="h-full w-full object-contain brightness-125"
                          />
                        ) : (
                          <span className="text-[17px] text-[#5a6a7a] font-black">
                            {g.away?.slice(0, 3)}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col leading-tight whitespace-nowrap min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-[30px] font-black text-white tracking-wide group-hover:text-[#00D4FF] transition-colors">
                            {getTeamName(g.away)}
                          </span>
                          {g.awayRecord && (
                            <span className="text-[30px] text-[#8a9ba8] font-bold capitalize">
                              {g.awayRecord.wins}-{g.awayRecord.losses}
                              {g.awayStreak ? ` [${g.awayStreak}]` : ''}
                            </span>
                          )}
                        </div>
                        {g.awayStarter ? (
                          <span className="flex flex-col leading-tight min-w-0">
                            <span className="text-[20px] text-[#c5d0dc] font-bold capitalize ">P: {g.awayStarter.name}</span>
                            {g.awayStarter.wins != null && (
                              <span className="text-[16px] text-[#8a9ba8] font-semibold tracking-wide">{g.awayStarter.wins}-{g.awayStarter.losses}{g.awayStarter.era != null ? ` · ${g.awayStarter.era.toFixed(2)} ERA` : ''}{g.awayStarter.whip != null ? ` · ${g.awayStarter.whip.toFixed(2)} WHIP` : ''}</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-[20px] text-[#8a9ba8] font-bold capitalize">P: TBA</span>
                        )}
                      </div>
                    </div>

                    {/* Home Team */}
                    <div className="flex items-center gap-4">
                      <div className="w-[72px] h-[72px] bg-[#0a0a15] border border-[#3d4f5f] rounded-full flex items-center justify-center shadow-[inset_0_2px_4px_rgba(0,0,0,0.8),0_0_5px_rgba(0,212,255,0.1)] p-1 flex-shrink-0">
                        {teamLogo(g.homeId) ? (
                          <Image
                            unoptimized
                            width={100}
                            height={100}
                            src={teamLogo(g.homeId) ?? ''}
                            alt=""
                            className="h-full w-full object-contain brightness-125"
                          />
                        ) : (
                          <span className="text-[17px] text-[#5a6a7a] font-black">
                            {g.home?.slice(0, 3)}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col leading-tight whitespace-nowrap min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-[30px] font-black text-white tracking-wide group-hover:text-[#00D4FF] transition-colors">
                            {getTeamName(g.home)}
                          </span>
                          {g.homeRecord && (
                            <span className="text-[30px] text-[#8a9ba8] font-bold capitalize">
                              {g.homeRecord.wins}-{g.homeRecord.losses}
                              {g.homeStreak ? ` [${g.homeStreak}]` : ''}
                            </span>
                          )}
                        </div>
                        {g.homeStarter ? (
                          <span className="flex flex-col leading-tight min-w-0">
                            <span className="text-[20px] text-[#c5d0dc] font-bold capitalize ">P: {g.homeStarter.name}</span>
                            {g.homeStarter.wins != null && (
                              <span className="text-[16px] text-[#8a9ba8] font-semibold tracking-wide">{g.homeStarter.wins}-{g.homeStarter.losses}{g.homeStarter.era != null ? ` · ${g.homeStarter.era.toFixed(2)} ERA` : ''}{g.homeStarter.whip != null ? ` · ${g.homeStarter.whip.toFixed(2)} WHIP` : ''}</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-[20px] text-[#8a9ba8] font-bold capitalize">P: TBA</span>
                        )}
                      </div>
                    </div>
                  </div>

                </div>

                {/* ── Starting Time Box ─────────────── */}
                {g.firstPitch && (
                  <div className="flex justify-center mt-4">
                    <span
                      className="text-[20px] font-black text-white bg-[#0d1117] border border-[#3d4f5f] px-3 py-1.5 rounded-sm shadow-[inset_0_1px_3px_rgba(0,0,0,0.5)] whitespace-nowrap"
                      style={{ fontFamily: "'Rajdhani', sans-serif" }}
                    >
                      {new Date(g.firstPitch).toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                        timeZone: 'America/Chicago',
                        timeZoneName: 'short',
                      })}
                    </span>
                  </div>
                )}

                {/* ── Odds Grid ─────────────── */}
                <div className="flex gap-2 justify-center bg-[#0a0a15] p-2 rounded-sm border border-[#2a3a4a] shadow-[inset_0_2px_6px_rgba(0,0,0,0.8)] mt-4">
                    {/* Spread */}
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-col items-center justify-center bg-gradient-to-b from-[#1a2332] to-[#0d1117] border border-[#3d4f5f] rounded-sm w-[68px] h-[48px] shadow-[0_2px_4px_rgba(0,0,0,0.5)] group-hover:border-[#00D4FF]/50 transition-colors">
                        <span className="text-[13px] text-[#8a9ba8] font-black tracking-widest capitalize mb-0.5">
                          {g.avgAwaySpreadLine != null
                            ? g.avgAwaySpreadLine > 0
                              ? `+${g.avgAwaySpreadLine}`
                              : g.avgAwaySpreadLine
                            : '—'}
                        </span>
                        <span className="text-[15px] font-black text-white leading-none ">
                          {g.avgAwaySpreadOdds != null
                            ? g.avgAwaySpreadOdds > 0
                              ? `+${g.avgAwaySpreadOdds}`
                              : g.avgAwaySpreadOdds
                            : ''}
                        </span>
                      </div>
                      <div className="flex flex-col items-center justify-center bg-gradient-to-b from-[#1a2332] to-[#0d1117] border border-[#3d4f5f] rounded-sm w-[68px] h-[48px] shadow-[0_2px_4px_rgba(0,0,0,0.5)] group-hover:border-[#00D4FF]/50 transition-colors">
                        <span className="text-[13px] text-[#8a9ba8] font-black tracking-widest capitalize mb-0.5">
                          {g.avgHomeSpreadLine != null
                            ? g.avgHomeSpreadLine > 0
                              ? `+${g.avgHomeSpreadLine}`
                              : g.avgHomeSpreadLine
                            : '—'}
                        </span>
                        <span className="text-[15px] font-black text-white leading-none ">
                          {g.avgHomeSpreadOdds != null
                            ? g.avgHomeSpreadOdds > 0
                              ? `+${g.avgHomeSpreadOdds}`
                              : g.avgHomeSpreadOdds
                            : ''}
                        </span>
                      </div>
                    </div>

                    {/* Moneyline */}
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-col items-center justify-center bg-gradient-to-b from-[#1a2332] to-[#0d1117] border border-[#3d4f5f] rounded-sm w-[68px] h-[48px] shadow-[0_2px_4px_rgba(0,0,0,0.5)] group-hover:border-[#00D4FF]/50 transition-colors">
                        <span className="text-[17px] font-black text-[#00D4FF] leading-none  drop-shadow-[0_0_2px_rgba(0,212,255,0.4)]">
                          {g.avgAwayLine != null
                            ? g.avgAwayLine > 0
                              ? `+${g.avgAwayLine}`
                              : g.avgAwayLine
                            : '—'}
                        </span>
                      </div>
                      <div className="flex flex-col items-center justify-center bg-gradient-to-b from-[#1a2332] to-[#0d1117] border border-[#3d4f5f] rounded-sm w-[68px] h-[48px] shadow-[0_2px_4px_rgba(0,0,0,0.5)] group-hover:border-[#00D4FF]/50 transition-colors">
                        <span className="text-[17px] font-black text-[#00D4FF] leading-none  drop-shadow-[0_0_2px_rgba(0,212,255,0.4)]">
                          {g.avgHomeLine != null
                            ? g.avgHomeLine > 0
                              ? `+${g.avgHomeLine}`
                              : g.avgHomeLine
                            : '—'}
                        </span>
                      </div>
                    </div>

                    {/* Total */}
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-col items-center justify-center bg-gradient-to-b from-[#1a2332] to-[#0d1117] border border-[#3d4f5f] rounded-sm w-[68px] h-[48px] shadow-[0_2px_4px_rgba(0,0,0,0.5)] group-hover:border-[#00D4FF]/50 transition-colors">
                        <span className="text-[13px] text-[#8a9ba8] font-black tracking-widest capitalize mb-0.5">
                          {g.avgTotalLine != null ? `O ${g.avgTotalLine}` : '—'}
                        </span>
                        <span className="text-[15px] font-black text-white leading-none ">
                          {g.avgOverOdds != null
                            ? g.avgOverOdds > 0
                              ? `+${g.avgOverOdds}`
                              : g.avgOverOdds
                            : ''}
                        </span>
                      </div>
                      <div className="flex flex-col items-center justify-center bg-gradient-to-b from-[#1a2332] to-[#0d1117] border border-[#3d4f5f] rounded-sm w-[68px] h-[48px] shadow-[0_2px_4px_rgba(0,0,0,0.5)] group-hover:border-[#00D4FF]/50 transition-colors">
                        <span className="text-[13px] text-[#8a9ba8] font-black tracking-widest capitalize mb-0.5">
                          {g.avgTotalLine != null ? `U ${g.avgTotalLine}` : '—'}
                        </span>
                        <span className="text-[15px] font-black text-white leading-none ">
                          {g.avgUnderOdds != null
                            ? g.avgUnderOdds > 0
                              ? `+${g.avgUnderOdds}`
                              : g.avgUnderOdds
                            : ''}
                        </span>
                      </div>
                    </div>
                  </div>

                {/* ── Market Grades + Prop Bets Button ─── */}
                <MarketGradesPanel g={g} />
              </Link>
            ))}
          </div>
        )}

        {/* ── Footer ───────────────────────────────────── */}
        <div className="mt-12 px-4 py-4 text-center border-t-2 border-[#2a3a4a] bg-[#0d1117] shadow-[inset_0_4px_10px_rgba(0,0,0,0.5)]">
          <p className="text-[17px] font-black tracking-widest capitalize text-[#5a6a7a] ">
            {'// SYSTEM ALERTS: ANALYSIS ONLY. PROBABILITIES ARE ALGORITHMIC ESTIMATES.'}
          </p>
        </div>
      </main>
    </div>
  );
}
