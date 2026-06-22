import re

with open("pages/hub/MLB-ANALYTICS/players.tsx", "r") as f:
    code = f.read()

# 1. Imports
code = code.replace("import { ChevronRight, Search, X, AlertTriangle, Activity } from 'lucide-react';",
                    "import React from 'react';\nimport { ChevronRight, Search, X, AlertTriangle, Activity } from 'lucide-react';\nimport PageErrorBoundary from '../../../src/components/ui/PageErrorBoundary';")

# 2. React.memo for StatPill
code = code.replace(
    "const StatPill = ({ label, value }: { label: string; value: string | null }) => (",
    "const StatPill = React.memo(({ label, value }: { label: string; value: string | null }) => ("
)
code = re.sub(r'(<span\n\s*className="text-slate-300 text-\[14px\] font-extrabold tracking-wider"\n\s*style={{ fontFamily: \'"Rajdhani", sans-serif\' }}\n\s*>\n\s*{value \?\? \'--\'}\n\s*</span>\n\s*</div>\n\s*\);)', r'\1)', code)

# 3. React.memo for CardStat
code = code.replace(
    "const CardStat = ({ label, value, lead }: { label: string; value: string; lead?: boolean }) => (",
    "const CardStat = React.memo(({ label, value, lead }: { label: string; value: string; lead?: boolean }) => ("
)
code = re.sub(r'(<span\n\s*className={\`\$\{lead \? \'text-white text-\[18px\]\' : \'text-slate-300 text-\[14px\]\'\} font-extrabold tracking-wide\`}\n\s*>\n\s*{value}\n\s*</span>\n\s*</span>\n\s*\);)', r'\1)', code)


# 4. PlayerCard Grids and Memo
code = code.replace(
    "const PlayerCard = ({ player, type }: { player: PlayerProfile; type: 'hitters' | 'pitchers' }) => {",
    "const PlayerCard = React.memo(({ player, type }: { player: PlayerProfile; type: 'hitters' | 'pitchers' }) => {"
)
code = code.replace(
"""                <div className="flex items-center gap-x-3 gap-y-0.5 mt-1 flex-wrap">
                  <CardStat label="ERA" value={fmt2(player.era)} lead />
                  <CardStat label="W-L" value={`${fmtInt(player.w)}-${fmtInt(player.l)}`} lead />
                  <CardStat label="K" value={fmtInt(player.k)} lead />
                </div>
                <div className="flex items-center gap-x-3 gap-y-0.5 mt-0.5 flex-wrap">
                  <CardStat label="WHIP" value={fmt2(player.whip)} />
                  <CardStat label="IP" value={fmtIp(player.ip)} />
                  <CardStat label="SV" value={fmtInt(player.sv)} />
                  <CardStat label="FIP" value={fmt2(player.fip)} />
                </div>""",
"""                <div className="grid grid-cols-3 gap-x-3 gap-y-0.5 mt-1">
                  <CardStat label="ERA" value={fmt2(player.era)} lead />
                  <CardStat label="W-L" value={`${fmtInt(player.w)}-${fmtInt(player.l)}`} lead />
                  <CardStat label="K" value={fmtInt(player.k)} lead />
                </div>
                <div className="grid grid-cols-4 gap-x-3 gap-y-0.5 mt-0.5">
                  <CardStat label="WHIP" value={fmt2(player.whip)} />
                  <CardStat label="IP" value={fmtIp(player.ip)} />
                  <CardStat label="SV" value={fmtInt(player.sv)} />
                  <CardStat label="FIP" value={fmt2(player.fip)} />
                </div>"""
)
code = code.replace(
"""                <div className="flex items-center gap-x-3 gap-y-0.5 mt-1 flex-wrap">
                  <CardStat label="AVG" value={fmtAvg(player.avg)} lead />
                  <CardStat label="HR" value={fmtInt(player.hr)} lead />
                  <CardStat label="RBI" value={fmtInt(player.rbi)} lead />
                </div>
                <div className="flex items-center gap-x-3 gap-y-0.5 mt-0.5 flex-wrap">
                  <CardStat label="OBP" value={fmtAvg(player.obp)} />
                  <CardStat label="SLG" value={fmtAvg(player.slg)} />
                  <CardStat label="OPS" value={fmtAvg(player.ops)} />
                  <CardStat label="wRC+" value={fmtInt(player.wrc_plus)} />
                </div>""",
"""                <div className="grid grid-cols-3 gap-x-3 gap-y-0.5 mt-1">
                  <CardStat label="AVG" value={fmtAvg(player.avg)} lead />
                  <CardStat label="HR" value={fmtInt(player.hr)} lead />
                  <CardStat label="RBI" value={fmtInt(player.rbi)} lead />
                </div>
                <div className="grid grid-cols-4 gap-x-3 gap-y-0.5 mt-0.5">
                  <CardStat label="OBP" value={fmtAvg(player.obp)} />
                  <CardStat label="SLG" value={fmtAvg(player.slg)} />
                  <CardStat label="OPS" value={fmtAvg(player.ops)} />
                  <CardStat label="wRC+" value={fmtInt(player.wrc_plus)} />
                </div>"""
)
code = re.sub(r'(<ChevronRight\n\s*size=\{16\}\n\s*className="text-\[#00D4FF\]"\n\s*style={{ filter: \'drop-shadow\(0 0 2px rgba\(0,212,255,0\.5\)\)\' }}\n\s*\/>\n\s*<\/div>\n\s*<\/div>\n\s*<\/Link>\n\s*);\n};)', r'\1\n});', code)

# TeamSelectorRow Memo
code = code.replace(
    "const TeamSelectorRow = ({",
    "const TeamSelectorRow = React.memo(({"
)
code = re.sub(r'(<ChevronRight\n\s*size=\{18\}\n\s*className="text-slate-600 group-hover:text-\[#00D4FF\] transition-colors flex-shrink-0"\n\s*\/>\n\s*<\/button>\n\s*\);\n};)', r'\1\n});', code)

# SWR and State Hooks
swr_replacement = """  const { data: hittersData, error: hittersError, isLoading: hittersLoading } = useSWR('/api/mlb/hitters', fetcher, {
    revalidateOnFocus: false,
  });

  const { data: pitchersData, error: pitchersError, isLoading: pitchersLoading } = useSWR('/api/mlb/pitchers', fetcher, {
    revalidateOnFocus: false,
  });

  const { data: standingsData } = useSWR('/api/mlb/standings', fetcher, {
    revalidateOnFocus: false,
    refreshInterval: 3600000, // 1 hour (matches CDN cache)
  });

  const hitters = hittersData?.data || EMPTY_ARRAY;
  const pitchers = pitchersData?.data || EMPTY_ARRAY;
  const fetchError = hittersData?.fetchError || pitchersData?.fetchError || hittersError || pitchersError;
  const isLoading = hittersLoading || pitchersLoading;
  const hasError = !!hittersError || !!pitchersError;"""

code = re.sub(r'const { data, error, isLoading } = useSWR\(\'/api/mlb/players\', fetcher, \{[\s\S]*?const hasError = !!error;', swr_replacement, code)

# Strict types in sort
code = code.replace(
"""      list = list.slice().sort((a, b) => {
        const av = (a as any)[field];
        const bv = (b as any)[field];
        const an = av == null || isNaN(Number(av)) ? (asc ? Infinity : -Infinity) : Number(av);
        const bn = bv == null || isNaN(Number(bv)) ? (asc ? Infinity : -Infinity) : Number(bv);
        return asc ? an - bn : bn - an;
      });""",
"""      list = list.slice().sort((a, b) => {
        const av = a[field as keyof PlayerProfile];
        const bv = b[field as keyof PlayerProfile];
        const an = av == null || isNaN(Number(av)) ? (asc ? Infinity : -Infinity) : Number(av);
        const bn = bv == null || isNaN(Number(bv)) ? (asc ? Infinity : -Infinity) : Number(bv);
        return asc ? an - bn : bn - an;
      });"""
)

# Remove bad Tailwind scroll classes
code = code.replace('w-full max-w-[100vw] overflow-x-hidden box-border text-slate-200', 'w-full box-border text-slate-200')
code = code.replace('w-full max-w-[100vw] overflow-x-hidden box-border', 'w-full box-border')

# Wrap the page in Error Boundary
code = code.replace('<div className="min-h-screen', '<PageErrorBoundary>\n    <div className="min-h-screen')
code = code.replace('</BottomNavBar>\n    </div>\n  );\n}', '</BottomNavBar>\n    </div>\n    </PageErrorBoundary>\n  );\n}')

# Fix TeamSelectorRow React.memo ending correctly
# Wait, I used a regex that might miss or hit multiple. Let me be safer.

with open("pages/hub/MLB-ANALYTICS/players.tsx", "w") as f:
    f.write(code)
