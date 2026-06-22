import { getMlbSupabase } from '../../../utils/supabase/mlb';
import { explain, type ScoreFactor, type Tier } from '../../../src/lib/betScore';

// ── Timezone helpers (America/Chicago is the canonical slate timezone) ─────────
function chicagoYmd(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

// Half-open UTC range [start, end) for one slate date (YYYY-MM-DD).
//
// IMPORTANT: the analytics engine writes pred_props.as_of_ts as the slate's
// calendar date at UTC midnight (e.g. "2026-06-21" -> 2026-06-21T00:00:00Z).
// The slate is therefore keyed by the UTC *date* embedded in as_of_ts, NOT by
// a Chicago-local instant. The previous chicagoDayUtcRange() shifted that
// midnight-UTC value back through the Chicago offset (start = 05:00Z), which
// EXCLUDED the engine's main run and landed the fallback slate a day early
// (showing yesterday's date with a false "stale" banner). Keying strictly on
// the UTC day guarantees a row stored at <date>T00:00:00Z falls inside
// utcDayRange(<date>).
function utcDayRange(ymd: string): { startIso: string; endIso: string } {
  const start = new Date(`${ymd}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

// Slate date (YYYY-MM-DD) embedded in an as_of_ts value, read in UTC — matches
// the engine's "date @ UTC midnight" write convention.
function slateYmdFromTs(ts: string): string {
  return new Date(ts).toISOString().slice(0, 10);
}

// ── Over/Under side inference ──────────────────────────────────────────────────
// `rec` is freeform ("NO BET", "LEAN OVER", "BET (Quarter-Kelly: 1.8%)"...) and
// usually does NOT carry the side for actionable BETs, so we infer it from the
// model vs market probabilities (the value is on the side the model prices higher
// than the market), falling back to projection-vs-line, then the over coin-flip.
function inferSide(
  rec: string | null,
  pOver: number | null,
  pMarketOver: number | null,
  proj: number | null,
  line: number | null
): 'over' | 'under' {
  const r = (rec || '').toUpperCase();
  if (r.includes('UNDER')) return 'under';
  if (r.includes(' OVER') || r.startsWith('OVER')) return 'over';
  if (pOver != null && pMarketOver != null) return pOver >= pMarketOver ? 'over' : 'under';
  if (proj != null && line != null) return Number(proj) > Number(line) ? 'over' : 'under';
  if (pOver != null) return pOver >= 0.5 ? 'over' : 'under';
  return 'over';
}

// Fair American odds (integer) implied by a no-vig probability (0..1). Used to
// price the UNDER side honestly, since pred_props only stores the OVER price.
function fairAmericanFromProb(prob: number | null): number | null {
  if (prob == null || prob <= 0 || prob >= 1) return null;
  return prob > 0.5
    ? Math.round((-100 * prob) / (1 - prob))
    : Math.round((100 * (1 - prob)) / prob);
}

export default async function edgeHandler(req: Request) {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const mlbDb = getMlbSupabase();

    // ── Find best available slate (Chicago day) ──────────────────────────
    const today = chicagoYmd(new Date());
    const { startIso: todayStart, endIso: todayEnd } = utcDayRange(today);

    let slateDate = today;

    const { data: todayCheck, error: todayErr } = await mlbDb
      .from('pred_props')
      .select('as_of_ts')
      .gte('as_of_ts', todayStart)
      .lt('as_of_ts', todayEnd)
      .or('best_price.not.is.null,best_price_under.not.is.null')
      .limit(1);

    if (todayErr) {
      console.error('[API/MLB/Props] todayCheck error:', todayErr);
    }

    if (!todayCheck || todayCheck.length === 0) {
      // No priced props for today yet — fall back to the most recent slate.
      const { data: latestRow, error: latestErr } = await mlbDb
        .from('pred_props')
        .select('as_of_ts')
        .lt('as_of_ts', todayEnd)
        .or('best_price.not.is.null,best_price_under.not.is.null')
        .order('as_of_ts', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestErr) {
        console.error('[API/MLB/Props] latestRow error:', latestErr);
      }

      if (latestRow?.as_of_ts) {
        slateDate = slateYmdFromTs(latestRow.as_of_ts as string);
      }
    }

    const { startIso, endIso } = utcDayRange(slateDate);

    // A slate older than today (Chicago) is already played — a graded recap,
    // NOT a live actionable board. The UI shows results instead of bet badges.
    const isStale = slateDate < today;

    // ── 1. Fetch priced props for the slate ──────────────────────────────
    // Only rows with a posted price are gradeable / actionable.
    const propsRes = await mlbDb
      .from('pred_props')
      .select(
        'game_pk, as_of_ts, player_id, prop, line, proj_mean, prob_over, blended_over, market_novig_over, best_lines, best_price, best_book, best_price_under, best_book_under, best_lines_under, rec, kelly_pct, result, pnl'
      )
      .gte('as_of_ts', startIso)
      .lt('as_of_ts', endIso)
      .or('best_price.not.is.null,best_price_under.not.is.null')
      // PostgREST caps the result (~1000 rows) below some slates' priced count,
      // so order by model edge first — the highest-value props are always kept
      // within the cap instead of an arbitrary slice — before client Bet Score ranking.
      .order('edge_pts', { ascending: false, nullsFirst: false })
      .limit(2000);

    if (propsRes.error) {
      console.error('[API/MLB/Props] pred_props error:', propsRes.error);
      return new Response(JSON.stringify({ error: `Database error: ${propsRes.error.message}` }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, max-age=0',
        },
      });
    }

    const rawProps = propsRes.data || [];

    // De-duplicate to one row per (player_id, prop, line), keeping the most
    // recent as_of_ts. The engine currently writes a single run per slate day
    // (verified: zero duplicate keys), but an intraday re-price run would
    // otherwise surface a second card for the same prop — this keeps one card.
    const dedupMap = new Map<string, any>();
    for (const r of rawProps) {
      const key = `${r.player_id}|${r.prop}|${r.line}`;
      const prev = dedupMap.get(key);
      if (!prev || r.as_of_ts > prev.as_of_ts) {
        dedupMap.set(key, r);
      }
    }
    const slateProps: any[] = [...dedupMap.values()];

    // Extract unique player_ids
    const uniquePlayerIds = [
      ...new Set(slateProps.map((p) => p.player_id).filter((id): id is number => id != null)),
    ];

    // ── 2. Fetch Player Profiles & Stats ONLY for relevant players ────────
    const [hittersRes, pitchersRes, teamsRes, aggPitcherRes, aggBatterRes] = await Promise.all([
      uniquePlayerIds.length > 0
        ? mlbDb
            .from('v_hitter_profile')
            .select('player_id, full_name, team_id')
            .in('player_id', uniquePlayerIds)
            .limit(1000)
        : { data: [] },
      uniquePlayerIds.length > 0
        ? mlbDb
            .from('v_pitcher_profile')
            .select('player_id, full_name, team_id, fip, siera')
            .in('player_id', uniquePlayerIds)
            .limit(1000)
        : { data: [] },
      mlbDb.from('dim_teams').select('team_id, abbr').limit(100),
      uniquePlayerIds.length > 0
        ? mlbDb
            .from('agg_pitcher')
            .select('pitcher_id, w, l, era, so, h, bb, ip, as_of')
            .eq('window_kind', 'fg_season')
            .in('pitcher_id', uniquePlayerIds)
            .order('as_of', { ascending: false })
        : { data: [] },
      uniquePlayerIds.length > 0
        ? mlbDb
            .from('agg_batter')
            .select('batter_id, hr, rbi, avg, obp, slg, woba, wrc_plus, as_of')
            .eq('window_kind', 'fg_season')
            .eq('vs_hand', 'A')
            .in('batter_id', uniquePlayerIds)
            .order('as_of', { ascending: false })
        : { data: [] },
    ]);

    const hitters = hittersRes.data || [];
    const pitchers = pitchersRes.data || [];
    const dimTeams = teamsRes.data || [];
    const aggPitchers = aggPitcherRes.data || [];
    const aggBatters = aggBatterRes.data || [];

    // Surface partial-data degradation instead of silently rendering Player #<id>.
    for (const [label, r] of [
      ['v_hitter_profile', hittersRes],
      ['v_pitcher_profile', pitchersRes],
      ['dim_teams', teamsRes],
      ['agg_pitcher', aggPitcherRes],
      ['agg_batter', aggBatterRes],
    ] as const) {
      if ((r as any).error)
        console.error(`[API/MLB/Props] ${label} fetch error:`, (r as any).error);
    }

    // ── Team map: team_id → abbr ──────────────────────────────────────────
    const teamMap = new Map<number, string>();
    dimTeams.forEach((t) => teamMap.set(t.team_id, t.abbr));

    // ── agg_pitcher map: pitcher_id → {era, w, l, so, whip} (deduped) ─────
    const aggPitcherMap = new Map<
      number,
      {
        era: number | null;
        w: number | null;
        l: number | null;
        so: number | null;
        whip: number | null;
      }
    >();
    for (const row of aggPitchers) {
      if (row.pitcher_id != null && !aggPitcherMap.has(row.pitcher_id)) {
        let whip: number | null = null;
        if (row.h != null && row.bb != null && row.ip != null && Number(row.ip) > 0) {
          whip = (Number(row.h) + Number(row.bb)) / Number(row.ip);
        }
        aggPitcherMap.set(row.pitcher_id, {
          era: row.era != null ? Number(row.era) : null,
          w: row.w != null ? Number(row.w) : null,
          l: row.l != null ? Number(row.l) : null,
          so: row.so != null ? Number(row.so) : null,
          whip: whip,
        });
      }
    }

    // ── agg_batter map: batter_id → stats (deduped to latest row) ─────────
    const aggBatterMap = new Map<
      number,
      {
        avg: number | null;
        hr: number | null;
        rbi: number | null;
        obp: number | null;
        slg: number | null;
        woba: number | null;
        wrc_plus: number | null;
      }
    >();
    for (const row of aggBatters) {
      if (row.batter_id != null && !aggBatterMap.has(row.batter_id)) {
        aggBatterMap.set(row.batter_id, {
          avg: row.avg != null ? Number(row.avg) : null,
          hr: row.hr != null ? Number(row.hr) : null,
          rbi: row.rbi != null ? Number(row.rbi) : null,
          obp: row.obp != null ? Number(row.obp) : null,
          slg: row.slg != null ? Number(row.slg) : null,
          woba: row.woba != null ? Number(row.woba) : null,
          wrc_plus: row.wrc_plus != null ? Number(row.wrc_plus) : null,
        });
      }
    }

    // ── Player map ────────────────────────────────────────────────────────
    type PlayerEntry = {
      name: string;
      team: string;
      team_id: number | null;
      kind: 'hitter' | 'pitcher';
      avg?: number | null;
      hr?: number | null;
      rbi?: number | null;
      obp?: number | null;
      slg?: number | null;
      woba?: number | null;
      wrc_plus?: number | null;
      pa?: number | null;
      era?: number | null;
      fip?: number | null;
      siera?: number | null;
      w?: number | null;
      l?: number | null;
      so?: number | null;
      whip?: number | null;
    };

    const playerMap = new Map<number, PlayerEntry>();

    // Hitters — join counting stats from agg_batter
    for (const h of hitters) {
      if (!h.player_id) continue;
      const agg = aggBatterMap.get(h.player_id);
      playerMap.set(h.player_id, {
        name: h.full_name,
        team: teamMap.get(h.team_id) || '',
        team_id: h.team_id ?? null,
        kind: 'hitter',
        avg: agg?.avg ?? null,
        hr: agg?.hr ?? null,
        rbi: agg?.rbi ?? null,
        obp: agg?.obp ?? null,
        slg: agg?.slg ?? null,
        woba: agg?.woba ?? null,
        wrc_plus: agg?.wrc_plus ?? null,
      });
    }

    // Pitchers — join fip/siera from view + era/w/l/so/whip from agg_pitcher
    for (const p of pitchers) {
      if (!p.player_id) continue;
      const agg = aggPitcherMap.get(p.player_id);
      playerMap.set(p.player_id, {
        name: p.full_name,
        team: teamMap.get(p.team_id) || '',
        team_id: p.team_id ?? null,
        kind: 'pitcher',
        fip: p.fip != null ? Number(p.fip) : null,
        siera: p.siera != null ? Number(p.siera) : null,
        era: agg?.era ?? null,
        w: agg?.w ?? null,
        l: agg?.l ?? null,
        so: agg?.so ?? null,
        whip: agg?.whip ?? null,
      });
    }

    // ── Fallback: dim_players for any still-unresolved player_ids ─────────
    const unresolvedIds = uniquePlayerIds.filter((id) => !playerMap.has(id));

    if (unresolvedIds.length > 0) {
      const { data: fallback, error: fbErr } = await mlbDb
        .from('dim_players')
        .select('player_id, full_name')
        .in('player_id', unresolvedIds);
      if (fbErr) console.error('[API/MLB/Props] dim_players fallback error:', fbErr);
      for (const f of fallback || []) {
        if (f.player_id && !playerMap.has(f.player_id)) {
          const aggB = aggBatterMap.get(f.player_id);
          const aggP = aggPitcherMap.get(f.player_id);
          const kind = aggP ? 'pitcher' : 'hitter';

          playerMap.set(f.player_id, {
            name: f.full_name || `Player #${f.player_id}`,
            team: '',
            team_id: null,
            kind,
            avg: aggB?.avg ?? null,
            hr: aggB?.hr ?? null,
            rbi: aggB?.rbi ?? null,
            obp: aggB?.obp ?? null,
            slg: aggB?.slg ?? null,
            woba: aggB?.woba ?? null,
            wrc_plus: aggB?.wrc_plus ?? null,
            pa: null,
            era: aggP?.era ?? null,
            fip: null,
            siera: null,
            w: aggP?.w ?? null,
            l: aggP?.l ?? null,
            so: aggP?.so ?? null,
            whip: aggP?.whip ?? null,
          });
        }
      }
      // Final safety: never show "Unknown"
      for (const id of unresolvedIds) {
        if (!playerMap.has(id)) {
          const aggB = aggBatterMap.get(id);
          const aggP = aggPitcherMap.get(id);
          const kind = aggP ? 'pitcher' : 'hitter';
          playerMap.set(id, {
            name: `Player #${id}`,
            team: '',
            team_id: null,
            kind,
            avg: aggB?.avg ?? null,
            hr: aggB?.hr ?? null,
            rbi: aggB?.rbi ?? null,
            obp: aggB?.obp ?? null,
            slg: aggB?.slg ?? null,
            woba: aggB?.woba ?? null,
            wrc_plus: aggB?.wrc_plus ?? null,
            pa: null,
            era: aggP?.era ?? null,
            fip: null,
            siera: null,
            w: aggP?.w ?? null,
            l: aggP?.l ?? null,
            so: aggP?.so ?? null,
            whip: aggP?.whip ?? null,
          });
        }
      }
    }

    // ── Map + enrich + SCORE props (canonical Bet Score, single source of truth) ──
    const mappedProps = slateProps.map((p) => {
      const info = playerMap.get(p.player_id) || {
        name: p.player_id ? `Player #${p.player_id}` : 'TBA',
        team: '',
        team_id: null,
        kind: 'hitter' as const,
      };

      // Model win prob for the OVER side (prefer the calibrated/blended prob).
      const pOver =
        p.blended_over != null
          ? Number(p.blended_over)
          : p.prob_over != null
            ? Number(p.prob_over)
            : null;
      const pMarketOver = p.market_novig_over != null ? Number(p.market_novig_over) : null;

      const side = inferSide(p.rec, pOver, pMarketOver, p.proj_mean as any, p.line as any);
      const isOver = side === 'over';

      // Win prob / market prob for the RECOMMENDED side.
      const pWin = pOver == null ? null : isOver ? pOver : 1 - pOver;
      const pMarket = pMarketOver == null ? null : isOver ? pMarketOver : 1 - pMarketOver;

      // CRITICAL: pred_props.best_price is ALWAYS the best OVER price (the engine
      // only stores over prices). For an OVER rec it is the correct offered price.
      // For an UNDER rec there is NO stored under price, so pairing the under win
      // prob with the over price fabricates EV (the "phantom ELITE" bug). Use the
      // side-correct price: the real over price for overs; the no-vig FAIR under
      // price (derived from the market) for unders — an honest, price-shop-free
      // number reflecting only model-vs-market edge.
      const overPrice = p.best_price != null ? Number(p.best_price) : null;
      const underPrice = p.best_price_under != null ? Number(p.best_price_under) : null;
      // Use the side-correct REAL offered price now that the engine stores both
      // sides. Unders fall back to a vig-adjusted no-vig estimate only when a real
      // under price is missing — so the displayed price/EV is honest either way.
      let price = isOver
        ? overPrice
        : underPrice != null
          ? underPrice
          : fairAmericanFromProb(pMarket != null ? Math.min(0.985, pMarket + 0.023) : null);
      // Removed pathologically tight -600 clamping so heavy favorites still score.
      const priceIsReal = isOver ? overPrice != null : underPrice != null;

      // Canonical Bet Score (0-100) + tier — identical scale to every other surface.
      let bet_score: number | null = null;
      let bet_tier: Tier | null = null;
      let win_confidence: number | null = null;
      let ev_pct: number | null = null;
      let score_verdict: string | null = null;
      let score_factors: ScoreFactor[] = [];
      if (pWin != null && price != null && price !== 0) {
        const ex = explain(pWin, price, { pMarket, lineupLocked: true });
        bet_score = ex.betScore;
        bet_tier = ex.tier;
        win_confidence = ex.winConfidence;
        ev_pct = ex.evPct;
        score_verdict = ex.verdict;
        score_factors = ex.factors;
      }

      return {
        game_pk: p.game_pk,
        as_of_ts: p.as_of_ts,
        player_id: p.player_id,
        prop: p.prop,
        line: p.line,
        // Resolved player info
        player_name: info.name,
        team_abbr: info.team,
        team_id: info.team_id,
        player_kind: info.kind,
        // Canonical grade
        bet_score,
        bet_tier,
        win_confidence,
        ev_pct,
        score_verdict,
        score_factors,
        // Side + pricing (drives the BetScoreBadge on the client)
        side,
        isOver,
        p_win: pWin,
        p_market: pMarket,
        price,
        odds: price,
        kelly_pct: p.kelly_pct != null ? Number(p.kelly_pct) : null,
        model_proj: p.proj_mean,
        best_book: isOver ? p.best_book : (p.best_book_under ?? null),
        best_lines: isOver ? p.best_lines : (p.best_lines_under ?? null),
        price_estimated: !priceIsReal,
        was_bet: /^BET/i.test(String(p.rec || '')),
        // Graded outcome — present on closed/stale slates.
        result: (p.result as string) ?? null,
        pnl: p.pnl != null ? Number(p.pnl) : null,
        // Full stats payload
        stats: {
          avg: info.avg ?? null,
          hr: info.hr ?? null,
          rbi: info.rbi ?? null,
          obp: info.obp ?? null,
          slg: info.slg ?? null,
          woba: info.woba ?? null,
          wrc_plus: info.wrc_plus ?? null,
          pa: info.pa ?? null,
          era: info.era ?? null,
          fip: info.fip ?? null,
          siera: info.siera ?? null,
          w: info.w ?? null,
          l: info.l ?? null,
          so: info.so ?? null,
          whip: info.whip ?? null,
        },
      };
    });

    // Rank by Bet Score (desc), unscored last — same ordering principle as Best Bets.
    mappedProps.sort((a, b) => (b.bet_score ?? -1) - (a.bet_score ?? -1));

    // Slate-level stats (tier counts use the canonical thresholds).
    const scored = mappedProps.filter((p) => p.bet_score != null);
    const stats = {
      total: mappedProps.length,
      elite: scored.filter((p) => p.bet_tier === 'ELITE').length,
      strong: scored.filter((p) => p.bet_tier === 'STRONG').length,
      topScore: scored.reduce((m, p) => Math.max(m, p.bet_score ?? 0), 0),
      topLock: scored.reduce((m, p) => Math.max(m, p.win_confidence ?? 0), 0),
    };

    // Graded recap — the ENGINE'S ACTUAL BETS only (rec = "BET ..."), not every
    // priced prop, so the record/units reflect real model performance.
    const bets = mappedProps.filter(
      (p) => p.was_bet && (p.result === 'win' || p.result === 'loss')
    );
    const results = {
      graded: bets.length,
      wins: bets.filter((p) => p.result === 'win').length,
      losses: bets.filter((p) => p.result === 'loss').length,
      voided: mappedProps.filter((p) => p.was_bet && p.result === 'void').length,
      units: Math.round(bets.reduce((s, p) => s + (p.pnl ?? 0), 0) * 100) / 100,
    };

    return new Response(
      JSON.stringify({
        props: mappedProps,
        official_date: slateDate,
        is_stale: isStale,
        stats,
        results,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      }
    );
  } catch (err) {
    console.error('[API/MLB/Props] Unhandled error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  }
}

export const config = {
  runtime: 'edge',
};
