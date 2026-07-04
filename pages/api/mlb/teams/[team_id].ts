import { getMlbSupabase } from '../../../../utils/supabase/mlb';
import { betScore, tier } from '../../../../src/lib/betScore';

// Canonical bet-side inference for a pred_props row (see pages/api/mlb/teams.ts).
function betInputsFromProp(
  p: any
): { pWin: number; price: number; pMarket: number | null; isOver: boolean } | null {
  const price = p.best_price != null ? Number(p.best_price) : NaN;
  if (!Number.isFinite(price) || price === 0) return null;
  const probOver = p.prob_over != null ? Number(p.prob_over) : NaN;
  if (!Number.isFinite(probOver)) return null;
  const mktOver = p.market_novig_over != null ? Number(p.market_novig_over) : null;
  let isOver: boolean;
  if (mktOver != null) isOver = probOver >= mktOver;
  else if (p.proj_mean != null && p.line != null) isOver = Number(p.proj_mean) > Number(p.line);
  else return null;

  const pWin = isOver ? probOver : 1 - probOver;
  if (!(pWin > 0 && pWin < 1)) return null;
  const pMarket = mktOver == null ? null : isOver ? mktOver : 1 - mktOver;
  // Plausibility clamp (mirrors teams.ts): a model-vs-market gap above 25 points on a
  // prop signals corrupt/degenerate model output (e.g. a team-level probability written
  // into every player row → "catcher 57% to steal, ELITE 97"), not a real edge.
  if (pMarket != null && Math.abs(pWin - pMarket) > 0.25) return null;
  return { pWin, price, pMarket, isOver };
}

function americanToDecimal(a: number): number {
  return 1 + (a > 0 ? a / 100 : 100 / Math.abs(a));
}

const num = (v: any) => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

async function edgeHandler(req: Request) {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const url = new URL(req.url);
    const segments = url.pathname.split('/');
    const id = decodeURIComponent(segments[segments.length - 1] || '').trim();

    // MLB team_ids are positive integers; reject anything else as a real 404.
    if (!/^[0-9]+$/.test(id)) {
      return new Response(JSON.stringify({ notFound: true }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const mlbDb = getMlbSupabase();

    // ── One round-trip. get_mlb_team_detail() returns:
    //    { team, stats, games, matchup: {..., markets:[raw h2h/total/run_line]}, props_raw, slate_date }.
    //    The Bet Score math (the only thing that can't live in SQL) stays here. ──
    let { data: dataRaw, error } = await mlbDb.rpc('get_mlb_team_detail', { p_team_id: Number(id) } as any);
    if (error && (error as any).code === '57014') {
      // Statement timeout under load — the RPC normally completes in ~3s but can cross
      // the role's statement_timeout when cache-cold. One retry rescues most of these.
      ({ data: dataRaw, error } = await mlbDb.rpc('get_mlb_team_detail', { p_team_id: Number(id) } as any));
    }
    const data = dataRaw as any;
    if (error) {
      console.error(`[API/MLB/Teams/${id}] rpc error:`, error.message, error.code, error.details, error.hint);
      return new Response(JSON.stringify({ error: 'Internal server error', rpc_error: error.message, rpc_code: error.code }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (!data || !data.team) {
      return new Response(JSON.stringify({ notFound: true }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const team: any = data.team;
    const stats = data.stats ?? null;
    const games = data.games || [];
    const slateDate = data.slate_date ?? null;
    const teamAbbr = team.abbr;

    // ── Matchup: canonical Bet Score for this team's side of moneyline + total + run line. ──
    let matchup: any = null;
    const mr: any = data.matchup;
    if (mr) {
      const isHome = mr.is_home;
      const side = isHome ? 'home' : 'away';
      const markets: any[] = mr.markets || [];
      const betObj = (r: any) =>
        r && r.model_prob != null && r.best_price != null
          ? {
              p_win: num(r.model_prob),
              price: num(r.best_price),
              p_market: num(r.market_novig_prob),
              rec: r.rec ?? null,
              edge_pts: num(r.edge_pts),
              best_book: r.best_book ?? null,
              selection: r.selection,
            }
          : null;
      const h2hRow = markets.find((r) => r.market === 'h2h' && r.selection === side) || null;
      const totalRow =
        markets
          .filter((r) => r.market === 'total' && r.best_price != null)
          .sort((a, b) => (Number(b.edge_pts) || -Infinity) - (Number(a.edge_pts) || -Infinity))[0] || null;
      const rlRow =
        markets
          .filter(
            (r) =>
              r.market === 'run_line' &&
              String(r.selection).startsWith(`${side}_`) &&
              r.best_price != null
          )
          .sort((a, b) => (Number(b.edge_pts) || -Infinity) - (Number(a.edge_pts) || -Infinity))[0] || null;
      const total: any = betObj(totalRow);
      if (total && totalRow) {
        const [sd, ln] = String(totalRow.selection).split('_');
        total.side = sd ? sd.toUpperCase() : null;
        total.line = ln != null && ln !== '' ? Number(ln) : null;
      }
      const run_line: any = betObj(rlRow);
      if (run_line && rlRow) {
        const ln = String(rlRow.selection).replace(`${side}_`, '');
        run_line.line = ln !== '' ? Number(ln) : null;
      }
      matchup = {
        game_pk: mr.game_pk,
        is_home: isHome,
        official_date: mr.official_date,
        first_pitch_utc: mr.first_pitch_utc,
        event_time: mr.event_time ?? null,
        status: mr.status ?? 'Scheduled',
        opponent: mr.opponent,
        opponent_abbr: mr.opponent_abbr,
        team_pitcher: mr.team_pitcher ?? null,
        opp_pitcher: mr.opp_pitcher ?? null,
        team_win_prob: num(mr.team_win_prob),
        opp_win_prob: num(mr.opp_win_prob),
        bet: betObj(h2hRow),
        total,
        run_line,
      };
    }

    // ── Props: canonical Bet Score per prop, ranked. ──
    // stolen_bases is excluded here exactly as in /api/mlb/props and /api/mlb/teams —
    // the engine's SB probabilities are team-level, not per-player, and grade absurdly.
    let propsData = ((data.props_raw || []) as any[])
      .filter((p: any) => p.prop !== 'stolen_bases' && p.prop_type !== 'stolen_bases')
      .map((p: any) => {
      const inputs = betInputsFromProp(p);
      let bet_score: number | null = null;
      let bet_tier: string | null = null;
      let ev_pct: number | null = null;
      let pWin: number | null = null;
      let price: number | null = null;
      let pMarket: number | null = null;
      let isOver: boolean | null = null;
      if (inputs) {
        bet_score = betScore(inputs.pWin, inputs.price);
        bet_tier = tier(bet_score);
        ev_pct = (inputs.pWin * americanToDecimal(inputs.price) - 1) * 100;
        pWin = inputs.pWin;
        price = inputs.price;
        pMarket = inputs.pMarket;
        isOver = inputs.isOver;
      }
      return {
        ...p,
        player_name: p.full_name || `Player #${p.player_id}`,
        team_abbr: teamAbbr,
        prop_type: p.prop,
        model_proj: p.proj_mean,
        side: isOver == null ? null : isOver ? 'OVER' : 'UNDER',
        p_win: pWin,
        price,
        p_market: pMarket,
        bet_score,
        bet_tier,
        ev_pct,
      };
    });
    propsData.sort(
      (a: any, b: any) =>
        (b.bet_score || 0) - (a.bet_score || 0) ||
        (Number(b.edge_pts) || 0) - (Number(a.edge_pts) || 0)
    );
    propsData = propsData.slice(0, 12);

    // Team-level grade = best prop Bet Score (header chip).
    const topProp = propsData.find((p: any) => p.bet_score != null) || null;
    team.grade = topProp
      ? {
          score: topProp.bet_score,
          tier: topProp.bet_tier,
          pWin: topProp.p_win,
          price: topProp.price,
          pMarket: topProp.p_market,
          edgeCount: propsData.filter((p: any) => p.bet_score != null).length,
        }
      : null;

    return new Response(
      JSON.stringify({ team, stats, games, matchup, props: propsData, slateDate }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          // Live betting data (odds, scores, lineups) + SWR already refreshes client-side every
          // 60s — never serve a stale edge copy (it caused empty stat boxes right after deploys).
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  } catch (err) {
    console.error('[API/MLB/Teams/[id]] Unhandled error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const rawProto = Array.isArray(req.headers['x-forwarded-proto'])
      ? req.headers['x-forwarded-proto'][0]
      : (req.headers['x-forwarded-proto'] || 'http');
    const protocol = rawProto.split(',')[0].trim();
    const host = req.headers.host || 'localhost';
    const url = `${protocol}://${host}${req.url}`;

    const safeHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) {
        safeHeaders[key] = value.join(', ');
      } else if (value !== undefined) {
        safeHeaders[key] = value;
      }
    }

    const requestOptions: RequestInit = {
      method: req.method,
      headers: safeHeaders,
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      requestOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }

    const request = new Request(url, requestOptions);
    const response = await edgeHandler(request);

    res.status(response.status);
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    const text = await response.text();
    if (text) {
      try {
        res.json(JSON.parse(text));
      } catch {
        res.send(text);
      }
    } else {
      res.end();
    }
  } catch (err: any) {
    console.error('API Polyfill Error:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
