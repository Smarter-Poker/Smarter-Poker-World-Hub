const fs = require('fs');
let file = fs.readFileSync('pages/hub/MLB-ANALYTICS/best-bets.tsx', 'utf8');

file = file.replace(/\s*\{\/\* Disclaimer \*\/\}/, 
`

        {/* Actions */}
        <div className="px-4 py-4 grid grid-cols-2 gap-3 mt-4">
          <Link
            href={\`/hub/MLB-ANALYTICS/game/\${bet.game_pk || bet.game_id}\`}
            className="flex items-center justify-center gap-2 bg-[#0d1117] border border-[#3d4f5f] p-3 rounded-sm hover:border-[#00D4FF] hover:bg-[#00D4FF]/10 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <Activity size={16} className="text-[#00D4FF]" />
            <span className="font-['Rajdhani'] text-[21px] font-black text-white capitalize tracking-widest leading-none">
              Matchup
            </span>
          </Link>
          {bet.player_id ? (
            <Link
              href={\`/hub/MLB-ANALYTICS/players/\${bet.player_id}\`}
              className="flex items-center justify-center gap-2 bg-[#0d1117] border border-[#3d4f5f] p-3 rounded-sm hover:border-[#FFD700] hover:bg-[#FFD700]/10 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <Zap size={16} className="text-[#FFD700]" />
              <span className="font-['Rajdhani'] text-[21px] font-black text-white capitalize tracking-widest leading-none">
                Profile
              </span>
            </Link>
          ) : (
            <div className="flex items-center justify-center gap-2 bg-[#0a0f1a] border border-[#2a3a4a] p-3 rounded-sm opacity-50 cursor-not-allowed">
              <Shield size={16} className="text-slate-500" />
              <span className="font-['Rajdhani'] text-[21px] font-black text-slate-500 capitalize tracking-widest leading-none">
                Team
              </span>
            </div>
          )}
        </div>

        {/* Disclaimer */}`);

if (!file.includes("import Link from 'next/link';")) {
  file = file.replace("import Head from 'next/head';", "import Head from 'next/head';\nimport Link from 'next/link';");
}

fs.writeFileSync('pages/hub/MLB-ANALYTICS/best-bets.tsx', file, 'utf8');
