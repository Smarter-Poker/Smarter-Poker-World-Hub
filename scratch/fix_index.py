import re

with open("pages/hub/MLB-ANALYTICS/index.tsx", "r") as f:
    content = f.read()

# 1. Update getServerSideProps to fetch slateGames
slate_fetch = """
        // Fetch full slate for today
        const { data: slateGames } = await mlbDb
            .from('v_daily_slate')
            .select('*')
            .eq('official_date', todayStr)
            .order('event_time', { ascending: true });
"""

props_replacement = """
        return {
            props: {
                todayStr,
                topBets: topBets || [],
                lastUpdate,
                slateGames: slateGames || []
            }
        };
"""

content = content.replace("const lastUpdate = pipelineData && pipelineData.length > 0 ? pipelineData[0].run_at : null;", 
                          "const lastUpdate = pipelineData && pipelineData.length > 0 ? pipelineData[0].run_at : null;\n" + slate_fetch)

content = content.replace("""        return {
            props: {
                todayStr,
                topBets: topBets || [],
                lastUpdate
            }
        };""", props_replacement)

content = content.replace("""        return {
            props: {
                todayStr: new Date().toISOString().split('T')[0],
                topBets: [],
                lastUpdate: null
            }
        };""", """        return {
            props: {
                todayStr: new Date().toISOString().split('T')[0],
                topBets: [],
                lastUpdate: null,
                slateGames: []
            }
        };""")

# 2. Update component signature
content = content.replace("export default function MlbSlateDashboard({ todayStr, topBets, lastUpdate }: { todayStr: string, topBets: any[], lastUpdate: string | null }) {",
                          "export default function MlbSlateDashboard({ todayStr, topBets, lastUpdate, slateGames }: { todayStr: string, topBets: any[], lastUpdate: string | null, slateGames: any[] }) {")

# 3. Replace the Future Expansion placeholder with the actual grid
grid_jsx = """
                            {slateGames.length > 0 ? (
                                <div className="space-y-3">
                                    {slateGames.map((game: any, idx: number) => {
                                        const gameTime = new Date(game.event_time).toLocaleTimeString('en-US', {
                                            hour: 'numeric',
                                            minute: '2-digit',
                                            timeZoneName: 'short'
                                        });
                                        return (
                                            <div key={idx} className="p-4 rounded-lg bg-slate-50 border border-slate-100 flex flex-col gap-3">
                                                <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                                                    <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">{gameTime}</span>
                                                    <span className={`text-[10px] px-2 py-0.5 rounded-sm font-extrabold uppercase tracking-widest border ${game.status === 'Scheduled' || game.status === 'Pre-Game' ? 'bg-blue-100 text-blue-600 border-blue-200' : 'bg-purple-100 text-purple-600 border-purple-200'}`}>
                                                        {game.status}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <div className="flex flex-col gap-1 w-1/2">
                                                        <div className="flex justify-between items-center pr-4">
                                                            <span className="font-bold text-slate-700">{game.away_abbr || game.away_team}</span>
                                                            <span className="text-xs font-semibold text-slate-500">{game.away_pitcher || 'TBD'}</span>
                                                        </div>
                                                        <div className="flex justify-between items-center pr-4">
                                                            <span className="font-bold text-slate-700">{game.home_abbr || game.home_team}</span>
                                                            <span className="text-xs font-semibold text-slate-500">{game.home_pitcher || 'TBD'}</span>
                                                        </div>
                                                    </div>
                                                    <div className="w-px h-10 bg-slate-200 mx-2"></div>
                                                    <div className="flex flex-col gap-1 w-1/2 pl-2">
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-xs text-slate-400">Win Prob</span>
                                                            <span className="font-bold text-slate-800 text-sm">
                                                                {game.away_win_prob ? (game.away_win_prob * 100).toFixed(1) + '%' : '--'}
                                                            </span>
                                                        </div>
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-xs text-slate-400">Win Prob</span>
                                                            <span className="font-bold text-slate-800 text-sm">
                                                                {game.home_win_prob ? (game.home_win_prob * 100).toFixed(1) + '%' : '--'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="text-center py-12 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                                    <p className="text-slate-500 font-medium">Slate view is currently loading...</p>
                                    <p className="text-sm text-slate-400 mt-1">Check back once today's games are initialized.</p>
                                </div>
                            )}
"""

old_placeholder = """                            <div className="text-center py-12 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                                <p className="text-slate-500 font-medium">Slate view is currently loading...</p>
                                <p className="text-sm text-slate-400 mt-1">Check back once today's games are initialized.</p>
                            </div>"""

content = content.replace(old_placeholder, grid_jsx)

with open("pages/hub/MLB-ANALYTICS/index.tsx", "w") as f:
    f.write(content)
