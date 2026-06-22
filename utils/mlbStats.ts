function getWeekStart(d: string) {
    const date = new Date(d);
    const day = date.getUTCDay();
    const diff = date.getUTCDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), diff));
    return monday.toISOString().split('T')[0];
}

export async function fetchPortfolioStats(mlbDb: any, days?: number, market?: string) {
    // 1. Try to use the highly optimized Postgres RPC
    // We only use the RPC if days and market are undefined AND we don't need extras dynamically calculated.
    // However, since the UI now requires all extras to be dynamically calculated when filters are applied,
    // we bypass the RPC if ANY filter is applied to ensure consistency.
    let useRpc = days === undefined && (market === undefined || market === 'ALL');

    if (useRpc) {
        const [rpcRes, riskRes, marketRes, baselineRes, gradeRes, equityRes] = await Promise.all([
            mlbDb.rpc('get_portfolio_stats', {}),
            mlbDb.from('sim_risk_metrics').select('*').limit(1).maybeSingle(),
            mlbDb.from('sim_market_summary').select('*').order('bets', { ascending: false }),
            mlbDb.from('sim_baseline_compare').select('*').limit(1).maybeSingle(),
            mlbDb.from('sim_bet_grade_summary').select('*'),
            mlbDb.from('sim_equity_daily').select('day, bets, day_pnl, end_bankroll, drawdown').order('day', { ascending: true }),
        ]);

        if (!rpcRes.error && rpcRes.data) {
            const equityDaily = equityRes.data || [];
            const firstDay = equityDaily.length > 0 ? equityDaily[0].day : null;
            const lastDay = equityDaily.length > 0 ? equityDaily[equityDaily.length - 1].day : null;

            const TIER_ORDER: Record<string, number> = { ELITE: 0, STRONG: 1, LEAN: 2, THIN: 3, PASS: 4 };
            const gradeSummary = (gradeRes.data || []).slice().sort(
                (a: any, b: any) => (TIER_ORDER[a.bet_tier] ?? 99) - (TIER_ORDER[b.bet_tier] ?? 99)
            );

            return {
                ...rpcRes.data,
                riskMetrics: riskRes.error ? null : riskRes.data,
                marketSummary: marketRes.error ? [] : (marketRes.data || []),
                baseline: baselineRes.error ? null : baselineRes.data,
                gradeSummary: gradeRes.error ? [] : gradeSummary,
                equityDaily: equityRes.error ? [] : equityDaily,
                dataWindow: { firstDay, lastDay, days: equityDaily.length },
            };
        }
    }

    // 2. Fallback / Filtered: JS Aggregation
    let allBets: any[] = [];
    let hasMore = true;
    let page = 0;
    const PAGE_SIZE = 1000;

    let anchorCutoffIso: string | undefined;
    if (days !== undefined) {
        let maxQuery = mlbDb
            .from('sim_bets')
            .select('as_of_ts')
            .order('as_of_ts', { ascending: false })
            .limit(1);
        if (market !== undefined && market !== 'ALL') {
            maxQuery = maxQuery.eq('market', market);
        }
        const { data: maxRow } = await maxQuery.maybeSingle();
        if (maxRow?.as_of_ts) {
            const anchor = new Date(maxRow.as_of_ts);
            anchor.setDate(anchor.getDate() - days);
            anchorCutoffIso = anchor.toISOString();
        }
    }

    while (hasMore) {
        let query = mlbDb
            .from('sim_bets')
            .select('id, as_of_ts, pnl, result, stake, bankroll_after, market, selection, edge_pts, bet_score, bet_tier, game_pk');

        if (anchorCutoffIso) {
            query = query.gte('as_of_ts', anchorCutoffIso);
        }
        if (market !== undefined && market !== 'ALL') {
            query = query.eq('market', market);
        }

        const { data, error: fetchErr } = await query
            .order('as_of_ts', { ascending: true })
            .order('id', { ascending: true })
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
            
        if (fetchErr) {
            console.warn('[MLB Portfolio] fetch error on sim_bets:', fetchErr.message);
            break;
        }
        
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
    let peakBankroll = 1000; // start at 1000 for simulated bankroll
    let maxDrawdown = 0;
    let totalStaked = 0;
    let grossWon = 0;
    let grossLost = 0;
    
    let currentWinStreak = 0;
    let maxWinStreak = 0;
    let currentLossStreak = 0;
    let maxLossStreak = 0;

    const weeksMap: Record<string, any> = {};
    const daysMap: Record<string, any> = {};
    const marketsMap: Record<string, any> = {};
    const gradesMap: Record<string, any> = {};

    let firstDay: string | null = null;
    let lastDay: string | null = null;

    for (const bet of bets) {
        const pnl = bet.pnl || 0;
        const betStake = bet.stake || 0;
        
        if (pnl > 0 || bet.result === 'WIN') {
            wins++;
            grossWon += pnl;
            currentWinStreak++;
            currentLossStreak = 0;
            if (currentWinStreak > maxWinStreak) maxWinStreak = currentWinStreak;
        } else if (pnl < 0 || bet.result === 'LOSS') {
            losses++;
            grossLost += Math.abs(pnl);
            currentLossStreak++;
            currentWinStreak = 0;
            if (currentLossStreak > maxLossStreak) maxLossStreak = currentLossStreak;
        } else {
            pushes++;
            currentWinStreak = 0;
            currentLossStreak = 0;
        }
        
        totalPnl += pnl;
        totalStaked += betStake;
        
        // Use relative bankroll for the period since start
        const b_after = 1000 + totalPnl;
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
            
            const dStart = bet.as_of_ts.split('T')[0];
            if (!firstDay) firstDay = dStart;
            lastDay = dStart;
            
            if (!daysMap[dStart]) {
                daysMap[dStart] = { day: dStart, bets: 0, day_pnl: 0, end_bankroll: b_after, peak_bankroll: peakBankroll };
            }
            daysMap[dStart].bets++;
            daysMap[dStart].day_pnl += pnl;
            daysMap[dStart].end_bankroll = b_after;
            daysMap[dStart].peak_bankroll = peakBankroll;
        }
        
        const m = bet.market || 'Unknown';
        if (!marketsMap[m]) marketsMap[m] = { market: m, bets: 0, wins: 0, losses: 0, pnl: 0, staked: 0 };
        marketsMap[m].bets++;
        marketsMap[m].pnl += pnl;
        marketsMap[m].staked += betStake;
        if (pnl > 0 || bet.result === 'WIN') marketsMap[m].wins++;
        else if (pnl < 0 || bet.result === 'LOSS') marketsMap[m].losses++;

        const t = bet.bet_tier || 'PASS';
        if (!gradesMap[t]) gradesMap[t] = { bet_tier: t, bets: 0, wins: 0, losses: 0, pnl: 0, staked: 0 };
        gradesMap[t].bets++;
        gradesMap[t].pnl += pnl;
        gradesMap[t].staked += betStake;
        if (pnl > 0 || bet.result === 'WIN') gradesMap[t].wins++;
        else if (pnl < 0 || bet.result === 'LOSS') gradesMap[t].losses++;
    }
    
    const roi = totalStaked > 0 ? (totalPnl / totalStaked) * 100 : 0;
    const winRate = (wins + losses) > 0 ? (wins / (wins + losses)) * 100 : 0;
    const finalBankroll = 1000 + totalPnl;
    const weeklyCurve = Object.values(weeksMap).sort((a: any, b: any) => a.weekOf.localeCompare(b.weekOf));
    const recentBets = bets.slice(-20).reverse();
    
    // Extras computation
    const equityDailyArr = Object.values(daysMap).sort((a: any, b: any) => a.day.localeCompare(b.day));
    const equityDaily = equityDailyArr.map(d => ({
        ...d,
        drawdown: d.peak_bankroll > 0 ? ((d.peak_bankroll - d.end_bankroll) / d.peak_bankroll) * 100 : 0
    }));
    
    const bestDayObj = equityDailyArr.reduce((prev, current) => (prev.day_pnl > current.day_pnl) ? prev : current, {day_pnl: 0});
    const worstDayObj = equityDailyArr.reduce((prev, current) => (prev.day_pnl < current.day_pnl) ? prev : current, {day_pnl: 0});
    
    const riskMetrics = {
        profit_factor: grossLost > 0 ? grossWon / grossLost : grossWon > 0 ? 999 : 0,
        expectancy: totalBets > 0 ? totalPnl / totalBets : 0,
        avg_stake: totalBets > 0 ? totalStaked / totalBets : 0,
        longest_win_streak: maxWinStreak,
        longest_loss_streak: maxLossStreak,
        best_day: bestDayObj.day_pnl,
        worst_day: worstDayObj.day_pnl
    };
    
    const marketSummary = Object.values(marketsMap).map(m => ({
        ...m,
        roi: m.staked > 0 ? (m.pnl / m.staked) * 100 : 0
    })).sort((a, b) => b.bets - a.bets);
    
    const TIER_ORDER: Record<string, number> = { ELITE: 0, STRONG: 1, LEAN: 2, THIN: 3, PASS: 4 };
    const gradeSummary = Object.values(gradesMap).map(g => ({
        ...g,
        roi: g.staked > 0 ? (g.pnl / g.staked) * 100 : 0
    })).sort((a, b) => (TIER_ORDER[a.bet_tier] ?? 99) - (TIER_ORDER[b.bet_tier] ?? 99));

    // Calculate flat final bankroll dynamically for the baseline comparison
    // Assuming $10 flat unit size to roughly match a $1000 bankroll starting point.
    const unit_size = 10;
    const flat_final_bankroll = 1000 + (wins * unit_size) - (losses * unit_size * 1.10); // Approximation if avg odds are around -110

    return {
        totalBets, wins, losses, pushes, totalPnl, currentBankroll: finalBankroll,
        roi, peakBankroll, maxDrawdown: maxDrawdown * 100, winRate, weeklyCurve, recentBets,
        riskMetrics,
        marketSummary,
        baseline: { starting_bankroll: 1000, unit_size, flat_final_bankroll },
        gradeSummary,
        equityDaily,
        dataWindow: { firstDay, lastDay, days: equityDaily.length }
    };
}
