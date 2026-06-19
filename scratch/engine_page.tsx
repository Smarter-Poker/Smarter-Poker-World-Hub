export default async function Home(props: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const searchParams = await props.searchParams;
  const actionable = searchParams?.actionable === 'true';
  const propsOnly = searchParams?.propsOnly === 'true';
  const minEdge = parseFloat(searchParams?.minEdge as string) || 0;

  let date: string | null = null;
  let fullSlate: GameCard[] = [];
  let fetchError = false;

  try {
    date = await getLatestDate();
    fullSlate = date ? await getSlate(date) : [];
  } catch (err) {
    console.error("Failed to fetch slate:", err);
    fetchError = true;
  }

  const CST_TODAY = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" }); // CST
  const slateStale = date != null && date !== CST_TODAY;  
  
  const edgesCount = fullSlate.filter((g) => g.bet).length;
  let slate = fullSlate;

  if (actionable) {
    slate = slate.filter(g => g.bet);
  }
  if (propsOnly) {
    slate = slate.filter(g => g.topProps && g.topProps.length > 0);
  }
  if (minEdge > 0) {
    slate = slate.filter(g => {
      const hasGameEdge = g.bet && g.bet.edge >= minEdge;
      const hasPropEdge = g.topProps && g.topProps.some(p => p.edge >= minEdge);
      return hasGameEdge || hasPropEdge;
    });
  }

  return (
    <main className="mx-auto max-w-2xl bg-[#0a0a15] min-h-screen shadow-2xl relative pb-16 text-slate-300 font-['Rajdhani',sans-serif]">
      <LivePoller />
      
      {/* Header - Metal Vault Style */}
      <header className="relative px-4 pt-6 pb-4 bg-gradient-to-b from-[#1a2332] to-[#0d1117] border-b-[3px] border-[#3d4f5f] shadow-[0_8px_30px_rgba(0,0,0,0.8)] z-10">
        {/* Decorative Bolts */}
        <div className="absolute top-3 left-3 w-3 h-3 rounded-full bg-gradient-to-br from-[#5a6a7a] to-[#3a4a5a] border border-[#1a2a3a] shadow-[inset_0_1px_2px_rgba(255,255,255,0.2),0_2px_4px_rgba(0,0,0,0.5)]" />
        <div className="absolute top-3 right-3 w-3 h-3 rounded-full bg-gradient-to-br from-[#5a6a7a] to-[#3a4a5a] border border-[#1a2a3a] shadow-[inset_0_1px_2px_rgba(255,255,255,0.2),0_2px_4px_rgba(0,0,0,0.5)]" />

        <h1 className="text-3xl font-black tracking-[0.2em] uppercase text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.2)] text-center font-['Orbitron',sans-serif]">
          MLB Analytics <span className="text-[#00D4FF] drop-shadow-[0_0_10px_rgba(0,212,255,0.6)]">Vault</span>
        </h1>
        
        <div className="flex flex-col items-center mt-3 mb-4 gap-3">
          <p className="text-[12px] text-[#5a6a7a] font-bold tracking-widest uppercase bg-[#0d1117] px-3 py-1 rounded-sm border border-[#2a3a4a] shadow-[inset_0_1px_3px_rgba(0,0,0,0.5)]">
            SYS.DATE: {date ?? "NO DATA"} <span className="mx-2 text-[#3d4f5f]">|</span> {fullSlate.length} MAT
          </p>
        </div>
        
        <Link href="/best-bets" className="block w-full text-center relative overflow-hidden bg-gradient-to-b from-[#1a2332] to-[#0d1117] border-2 border-[#00D4FF] hover:bg-[#00D4FF] hover:text-[#0a0a15] text-[#00D4FF] font-black uppercase tracking-[0.2em] text-[12px] py-2.5 transition-all shadow-[0_0_15px_rgba(0,212,255,0.2),inset_0_1px_2px_rgba(255,255,255,0.1)] group rounded-sm">
           <span className="relative z-10 group-hover:text-[#0a0a15]">Execute Today&apos;s Best Bets</span>
           {/* Glint effect */}
           <div className="absolute top-0 -left-[100%] w-1/2 h-full bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-[45deg] group-hover:left-[200%] transition-all duration-700 ease-in-out" />
        </Link>

        {/* Bottom Neon Strip */}
        <div className="absolute bottom-0 left-[10%] right-[10%] h-[3px] bg-[#00D4FF] shadow-[0_0_10px_#00D4FF,0_0_20px_rgba(0,212,255,0.4)] rounded-t-full" />
      </header>

      {slateStale && !fetchError && (
        <div className="mx-4 mt-5 rounded-sm border-2 border-amber-500/50 bg-[#1a1500] px-4 py-3 shadow-[0_0_15px_rgba(245,158,11,0.1),inset_0_2px_4px_rgba(0,0,0,0.5)] relative overflow-hidden">
          <div className="absolute left-0 top-0 w-1 h-full bg-amber-500 shadow-[0_0_10px_#f59e0b]" />
          <p className="text-[12px] font-black tracking-widest uppercase text-amber-500"> Warning: Showing {date}</p>
          <p className="text-[11px] text-amber-600/70 mt-1 font-bold uppercase tracking-wider">Today&apos;s slate ({CST_TODAY}) is not initialized. Awaiting market data.</p>
        </div>
      )}

      {fetchError && (
        <div className="mx-4 mt-5 rounded-sm border-2 border-red-500/50 bg-[#1a0a0a] px-4 py-3 shadow-[0_0_15px_rgba(239,68,68,0.1),inset_0_2px_4px_rgba(0,0,0,0.5)] relative">
          <div className="absolute left-0 top-0 w-1 h-full bg-red-500 shadow-[0_0_10px_#ef4444]" />
          <p className="text-[12px] font-black tracking-widest uppercase text-red-500"> System Error</p>
          <p className="text-[11px] text-red-400 mt-1 font-bold tracking-wider">Failed to establish secure connection to data vault. Retrying...</p>
        </div>
      )}

      <FilterBar edgesCount={edgesCount} />

      {slate.length === 0 && !fetchError ? (
        <div className="mx-4 mt-8 flex flex-col items-center justify-center p-8 border-2 border-dashed border-[#3d4f5f] rounded-sm bg-[#0d1117] opacity-60">
          <div className="w-8 h-8 rounded-full border-2 border-[#5a6a7a] border-t-[#00D4FF] animate-spin mb-3" />
          <p className="text-[13px] font-black tracking-widest uppercase text-[#5a6a7a]">
            {actionable ? "Zero Actionable Targets Detected" : "Awaiting Nightly Pipeline Payload..."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col pt-2 gap-6">
          {slate.map((g) => (
            <Link key={g.gamePk} href={`/game/${g.gamePk}`}
              className="block relative bg-gradient-to-b from-[#1a2332] to-[#0d1117] border-[3px] border-[#3d4f5f] rounded-lg mx-4 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),inset_0_-1px_0_rgba(0,0,0,0.5),0_8px_20px_rgba(0,0,0,0.6)] hover:border-[#00D4FF] transition-all duration-300 ease-out group hover:-translate-y-1 hover:shadow-[0_12px_25px_rgba(0,0,0,0.8),0_0_15px_rgba(0,212,255,0.15)]">
              
              {/* Corner Screws */}
              <div className="absolute top-2 left-2 w-2 h-2 rounded-full bg-gradient-to-br from-[#5a6a7a] to-[#2a3a4a] border border-[#0a0a15] shadow-inner" />
              <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-gradient-to-br from-[#5a6a7a] to-[#2a3a4a] border border-[#0a0a15] shadow-inner" />
              <div className="absolute bottom-2 left-2 w-2 h-2 rounded-full bg-gradient-to-br from-[#5a6a7a] to-[#2a3a4a] border border-[#0a0a15] shadow-inner" />
              <div className="absolute bottom-2 right-2 w-2 h-2 rounded-full bg-gradient-to-br from-[#5a6a7a] to-[#2a3a4a] border border-[#0a0a15] shadow-inner" />

              {/* Neon Edge Indicator */}
              <div className="absolute top-[20%] bottom-[20%] left-[-2px] w-[3px] bg-[#00D4FF] rounded-r-md opacity-30 group-hover:opacity-100 group-hover:shadow-[0_0_12px_#00D4FF] transition-all" />

              {/* Header: Game Title & Time */}
              <div className="flex items-center justify-between mb-4 pl-2 border-b border-[#2a3a4a] pb-3">
                <div className="flex flex-col">
                  <span className="text-[15px] text-white font-black tracking-[0.15em] uppercase font-['Orbitron',sans-serif] group-hover:text-[#00D4FF] transition-colors drop-shadow-[0_0_2px_rgba(255,255,255,0.5)]">
                    {g.away} @ {g.home} 
                  </span>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="rounded-sm bg-[#0d1117] text-[#5a6a7a] text-[9px] font-black uppercase px-1.5 py-[2px] tracking-widest border border-[#2a3a4a]">SGP</span>
                    <span className="text-[10px] text-[#5a6a7a] font-black uppercase tracking-widest">ID:{g.gamePk}</span>
                    <div className="ml-1"><EdgeBadge g={g} /></div>
                    {g.lineupState === "projected" && (
                      <span className="ml-1 rounded-sm bg-[#0d1117] border border-[#3d4f5f] px-1.5 py-[2px] text-[9px] font-black text-[#8a9ba8] uppercase tracking-widest shadow-inner">Projected</span>
                    )}
                    {g.lineupState === "confirmed" && (
                      <span className="ml-1 rounded-sm bg-[#00FF00]/10 border border-[#00FF00]/40 px-1.5 py-[2px] text-[9px] font-black text-[#00FF00] uppercase tracking-widest shadow-[0_0_5px_rgba(0,255,0,0.2)]">Confirmed</span>
                    )}
                  </div>
                </div>
                {g.firstPitch && (
                  <div className="text-[11px] text-[#00D4FF] font-black uppercase tracking-widest whitespace-nowrap text-right bg-[#0a0a15] px-2 py-1 border border-[#2a3a4a] rounded-sm shadow-[inset_0_1px_3px_rgba(0,0,0,0.8)]">
                    {new Date(g.firstPitch).toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}
                  </div>
                )}
              </div>

              {/* Main Grid: Teams & Odds */}
              <div className="flex flex-col md:flex-row justify-between items-start gap-4 pl-2">
                
                {/* Left Side: Teams */}
                <div className="flex flex-col gap-5 min-w-0 flex-1">
                  {/* Away Team Info */}
                  <div className="flex items-center gap-4">
                    <div className="w-[36px] h-[36px] bg-[#0a0a15] border border-[#3d4f5f] rounded-full flex items-center justify-center shadow-[inset_0_2px_4px_rgba(0,0,0,0.8),0_0_5px_rgba(0,212,255,0.1)] p-1">
                      <Image unoptimized width={100} height={100} src={teamLogo(g.awayId) ?? ""} alt="" className="h-full w-full object-contain brightness-125" />
                    </div>
                    <div className="flex flex-col leading-tight whitespace-nowrap">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[18px] font-black text-white tracking-wide group-hover:text-[#00D4FF] transition-colors">{getTeamName(g.away)}</span>
                        {g.awayRecord && <span className="text-[11px] text-[#5a6a7a] font-black tracking-widest">{g.awayRecord.wins}-{g.awayRecord.losses}{g.awayStreak ? ` [${g.awayStreak}]` : ''}</span>}
                      </div>
                      <span className="text-[12px] text-[#8a9ba8] mt-1 font-bold font-mono uppercase">
                        P: {g.awayStarter ? `${g.awayStarter.name} ${g.awayStarter.wins != null ? `(${g.awayStarter.wins}-${g.awayStarter.losses}, ${g.awayStarter.era?.toFixed(2)})` : ""}` : "TBA"}
                      </span>
                    </div>
                  </div>
                  
                  {/* Home Team Info */}
                  <div className="flex items-center gap-4">
                    <div className="w-[36px] h-[36px] bg-[#0a0a15] border border-[#3d4f5f] rounded-full flex items-center justify-center shadow-[inset_0_2px_4px_rgba(0,0,0,0.8),0_0_5px_rgba(0,212,255,0.1)] p-1">
                      <Image unoptimized width={100} height={100} src={teamLogo(g.homeId) ?? ""} alt="" className="h-full w-full object-contain brightness-125" />
                    </div>
                    <div className="flex flex-col leading-tight whitespace-nowrap">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[18px] font-black text-white tracking-wide group-hover:text-[#00D4FF] transition-colors">{getTeamName(g.home)}</span>
                        {g.homeRecord && <span className="text-[11px] text-[#5a6a7a] font-black tracking-widest">{g.homeRecord.wins}-{g.homeRecord.losses}{g.homeStreak ? ` [${g.homeStreak}]` : ''}</span>}
                      </div>
                      <span className="text-[12px] text-[#8a9ba8] mt-1 font-bold font-mono uppercase">
                        P: {g.homeStarter ? `${g.homeStarter.name} ${g.homeStarter.wins != null ? `(${g.homeStarter.wins}-${g.homeStarter.losses}, ${g.homeStarter.era?.toFixed(2)})` : ""}` : "TBA"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Side: Odds Grid - Segmented Displays */}
                <div className="flex gap-2 self-start md:self-auto bg-[#0a0a15] p-2 rounded-sm border border-[#2a3a4a] shadow-[inset_0_2px_6px_rgba(0,0,0,0.8)]">
                  {/* Spread Column */}
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-col items-center justify-center bg-gradient-to-b from-[#1a2332] to-[#0d1117] border border-[#3d4f5f] rounded-sm w-[68px] h-[48px] shadow-[0_2px_4px_rgba(0,0,0,0.5)] group-hover:border-[#00D4FF]/50 transition-colors">
                      <span className="text-[10px] text-[#5a6a7a] font-black tracking-widest uppercase mb-0.5">{g.avgAwaySpreadLine != null ? (g.avgAwaySpreadLine > 0 ? `+${g.avgAwaySpreadLine}` : g.avgAwaySpreadLine) : "—"}</span>
                      <span className="text-[13px] font-black text-white leading-none font-mono">{g.avgAwaySpreadOdds != null ? (g.avgAwaySpreadOdds > 0 ? `+${g.avgAwaySpreadOdds}` : g.avgAwaySpreadOdds) : ""}</span>
                    </div>
                    <div className="flex flex-col items-center justify-center bg-gradient-to-b from-[#1a2332] to-[#0d1117] border border-[#3d4f5f] rounded-sm w-[68px] h-[48px] shadow-[0_2px_4px_rgba(0,0,0,0.5)] group-hover:border-[#00D4FF]/50 transition-colors">
                      <span className="text-[10px] text-[#5a6a7a] font-black tracking-widest uppercase mb-0.5">{g.avgHomeSpreadLine != null ? (g.avgHomeSpreadLine > 0 ? `+${g.avgHomeSpreadLine}` : g.avgHomeSpreadLine) : "—"}</span>
                      <span className="text-[13px] font-black text-white leading-none font-mono">{g.avgHomeSpreadOdds != null ? (g.avgHomeSpreadOdds > 0 ? `+${g.avgHomeSpreadOdds}` : g.avgHomeSpreadOdds) : ""}</span>
                    </div>
                  </div>

                  {/* Moneyline Column */}
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-col items-center justify-center bg-gradient-to-b from-[#1a2332] to-[#0d1117] border border-[#3d4f5f] rounded-sm w-[68px] h-[48px] shadow-[0_2px_4px_rgba(0,0,0,0.5)] group-hover:border-[#00D4FF]/50 transition-colors">
                      <span className="text-[14px] font-black text-[#00D4FF] leading-none font-mono drop-shadow-[0_0_2px_rgba(0,212,255,0.4)]">{g.avgAwayLine != null ? (g.avgAwayLine > 0 ? `+${g.avgAwayLine}` : g.avgAwayLine) : "—"}</span>
                    </div>
                    <div className="flex flex-col items-center justify-center bg-gradient-to-b from-[#1a2332] to-[#0d1117] border border-[#3d4f5f] rounded-sm w-[68px] h-[48px] shadow-[0_2px_4px_rgba(0,0,0,0.5)] group-hover:border-[#00D4FF]/50 transition-colors">
                      <span className="text-[14px] font-black text-[#00D4FF] leading-none font-mono drop-shadow-[0_0_2px_rgba(0,212,255,0.4)]">{g.avgHomeLine != null ? (g.avgHomeLine > 0 ? `+${g.avgHomeLine}` : g.avgHomeLine) : "—"}</span>
                    </div>
                  </div>

                  {/* Total Column */}
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-col items-center justify-center bg-gradient-to-b from-[#1a2332] to-[#0d1117] border border-[#3d4f5f] rounded-sm w-[68px] h-[48px] shadow-[0_2px_4px_rgba(0,0,0,0.5)] group-hover:border-[#00D4FF]/50 transition-colors">
                      <span className="text-[10px] text-[#5a6a7a] font-black tracking-widest uppercase mb-0.5">{g.avgTotalLine != null ? `O ${g.avgTotalLine}` : "—"}</span>
                      <span className="text-[13px] font-black text-white leading-none font-mono">{g.avgOverOdds != null ? (g.avgOverOdds > 0 ? `+${g.avgOverOdds}` : g.avgOverOdds) : ""}</span>
                    </div>
                    <div className="flex flex-col items-center justify-center bg-gradient-to-b from-[#1a2332] to-[#0d1117] border border-[#3d4f5f] rounded-sm w-[68px] h-[48px] shadow-[0_2px_4px_rgba(0,0,0,0.5)] group-hover:border-[#00D4FF]/50 transition-colors">
                      <span className="text-[10px] text-[#5a6a7a] font-black tracking-widest uppercase mb-0.5">{g.avgTotalLine != null ? `U ${g.avgTotalLine}` : "—"}</span>
                      <span className="text-[13px] font-black text-white leading-none font-mono">{g.avgUnderOdds != null ? (g.avgUnderOdds > 0 ? `+${g.avgUnderOdds}` : g.avgUnderOdds) : ""}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Props Section (HUD Sub-panel) */}
              {g.topProps && g.topProps.length > 0 && (
                <div className="mt-5 pt-4 border-t-2 border-[#2a3a4a] relative">
                  <div className="absolute top-[-2px] left-1/2 -translate-x-1/2 w-12 h-[2px] bg-[#3d4f5f]" />
                  <div className="grid gap-2">
                    {g.topProps.map((p, idx) => {
                      const hasKelly = p.kelly_pct != null;
                      return (
                      <div key={idx} className="flex justify-between items-center bg-[#0a0a15] border border-[#2a3a4a] rounded-sm shadow-[inset_0_1px_3px_rgba(0,0,0,0.6)] px-3 py-2 group-hover:border-[#00D4FF]/40 transition-colors relative overflow-hidden">
                        {/* Tiny scanline effect */}
                        <div className="absolute top-0 left-0 w-full h-[1px] bg-white/5 opacity-50" />
                        <span className="text-[11px] text-[#8a9ba8] font-black uppercase tracking-wider font-mono z-10">{p.name} <span className="text-[#3d4f5f] mx-1">|</span> <span className="text-[#00D4FF] drop-shadow-[0_0_2px_rgba(0,212,255,0.4)]">{p.prop.replace(/_/g, " ")}</span></span>
                        <div className="flex items-center gap-3 z-10">
                          <BetScoreBadge pWin={p.winProb} price={p.price} compact pendingLabel="\u2014" />
                          {hasKelly && <span className="rounded-sm bg-[#FFD700]/10 border border-[#FFD700]/40 px-1.5 py-[2px] text-[10px] font-black text-[#FFD700] shadow-[0_0_5px_rgba(255,215,0,0.15)]">{p.kelly_pct}%</span>}
                        </div>
                      </div>
                    )})}
                  </div>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
      
      {/* Footer / Status Bar */}
      <div className="mt-12 px-4 py-4 text-center border-t-2 border-[#2a3a4a] bg-[#0d1117] shadow-[inset_0_4px_10px_rgba(0,0,0,0.5)]">
        <p className="text-[10px] font-black tracking-widest uppercase text-[#5a6a7a] font-mono">
          {"// SYSTEM ALERTS: ANALYSIS ONLY. PROBABILITIES ARE ALGORITHMIC ESTIMATES."}
        </p>
      </div>
    </main>
  );
}
