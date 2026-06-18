function getWeekStart(d: string) {
    const date = new Date(d);
    const day = date.getUTCDay();
    const diff = date.getUTCDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), diff));
    return monday.toISOString().split('T')[0];
}

export async function fetchPortfolioStats(mlbDb: any, days?: number, market?: string) {
    // 1. Try to use the highly optimized Postgres RPC
    const args: any = {};
    if (days !== undefined) args.p_days = days;
    if (market !== undefined && market !== 'ALL') args.p_market = market;

    const { data: stats, error } = await mlbDb.rpc('get_portfolio_stats', args);

    if (!error && stats) {
        return stats;
    }

    console.warn('[MLB Portfolio] RPC get_portfolio_stats failed or missing. Falling back to JS aggregation...', error?.message);

    // 2. Fallback: JS Aggregation
    let allBets: any[] = [];
    let hasMore = true;
    let page = 0;
    const PAGE_SIZE = 1000;

    while (hasMore) {
        let query = mlbDb
            .from('sim_bets')
            .select('id, as_of_ts, pnl, result, stake, bankroll_after, market, selection, edge_pts');
            
        if (days !== undefined) {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - days);
            query = query.gte('as_of_ts', cutoff.toISOString());
        }
        if (market !== undefined && market !== 'ALL') {
            query = query.eq('market', market);
        }

        const { data, error: fetchErr } = await query
            .order('as_of_ts', { ascending: true })
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
            
        if (fetchErr) throw fetchErr;
        
        if (data && data.length > 0) {
            allBets = [...allBets, ...data];
            if (data.length < PAGE_SIZE) {
                hasMore = false;
            } else {
                page++;
            }
        } else {
            hasMore = false;
        }
    }

    const bets = allBets;

    let totalBets = bets.length;
    let wins = 0, losses = 0, pushes = 0;
    let totalPnl = 0;
    let peakBankroll = 1000;
    let maxDrawdown = 0;
    let totalStaked = 0;

    const weeksMap: Record<string, any> = {};

    for (const bet of bets) {
        const pnl = bet.pnl || 0;
        if (pnl > 0 || bet.result === 'WIN') wins++;
        else if (pnl < 0 || bet.result === 'LOSS') losses++;
        else pushes++;
        
        totalPnl += pnl;
        totalStaked += (bet.stake || 0);
        
        const b_after = bet.bankroll_after || 0;
        if (b_after > peakBankroll) peakBankroll = b_after;
        
        const currentDd = peakBankroll > 0 ? (peakBankroll - b_after) / peakBankroll : 0;
        if (currentDd > maxDrawdown) maxDrawdown = currentDd;

        if (bet.as_of_ts) {
            const wStart = getWeekStart(bet.as_of_ts);
            if (!weeksMap[wStart]) {
                weeksMap[wStart] = { weekOf: wStart, bets: 0, pnl: 0, bankroll: b_after };
            }
            weeksMap[wStart].bets++;
            weeksMap[wStart].pnl += pnl;
            weeksMap[wStart].bankroll = b_after; 
        }
    }
    
    const roi = totalStaked > 0 ? (totalPnl / totalStaked) * 100 : 0;
    const winRate = (wins + losses) > 0 ? (wins / (wins + losses)) * 100 : 0;
    const finalBankroll = 1000 + totalPnl;
    const weeklyCurve = Object.values(weeksMap).sort((a: any, b: any) => a.weekOf.localeCompare(b.weekOf));
    const recentBets = bets.slice(-20).reverse();

    return {
        totalBets, wins, losses, pushes, totalPnl, currentBankroll: finalBankroll,
        roi, peakBankroll, maxDrawdown: maxDrawdown * 100, winRate, weeklyCurve, recentBets
    };
}
