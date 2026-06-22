const fs = require('fs');
const file = '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/pages/hub/MLB-ANALYTICS/hr-tracker.tsx';
let content = fs.readFileSync(file, 'utf-8');

// 1. imports
content = content.replace(
  "import { useState, useMemo, useCallback, useDeferredValue, useEffect } from 'react';",
  "import { useState, useMemo, useCallback, useDeferredValue, useEffect, memo } from 'react';"
);

// 2. EMPTY_ARRAY and PlayerRow
const playerRow = `
const EMPTY_ARRAY: HRPlayer[] = [];

const PlayerRow = memo(function PlayerRow({ p }: { p: HRPlayer }) {
  const cfg = STATUS_CONFIG[p.status] || STATUS_CONFIG.RECENT;
  const hasRate = p.games_per_hr != null && p.games_per_hr > 0;
  return (
    <tr
      className="hover:bg-[#1a2332]/60 transition-colors cursor-pointer group focus-within:ring-2 focus-within:ring-inset focus-within:ring-[#00D4FF]/60 relative"
    >
      {/* Player */}
      <td className="py-3 px-3 sticky left-0 z-10 bg-[#0d1117] group-hover:bg-[#131924] transition-colors">
        <div className="flex items-center gap-3">
          {/* absolute link overlay for a11y */}
          <Link
            href={\`/hub/MLB-ANALYTICS/players/\${p.player_id}\`}
            className="absolute inset-0 z-20"
            aria-label={\`\${p.full_name}, \${p.team_name}. View player details\`}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <div className="relative shrink-0">
            <img
              src={\`https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/\${p.player_id}/headshot/67/current\`}
              alt={p.full_name}
              loading="lazy"
              width={36}
              height={36}
              className="w-9 h-9 rounded-full object-cover border border-[#3d4f5f] group-hover:border-[#00D4FF] transition-all"
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = '/default-avatar.png';
              }}
            />
            {p.team_id ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={\`https://www.mlbstatic.com/team-logos/\${p.team_id}.svg\`}
                alt=""
                width={16}
                height={16}
                className="absolute -bottom-1 -right-1 w-4 h-4 bg-[#0d1117] rounded-full p-0.5"
                loading="lazy"
              />
            ) : null}
          </div>
          <div>
            <div className="text-white font-extrabold text-[23px] tracking-wider capitalize group-hover:text-[#00D4FF] transition-colors font-rajdhani">
              {p.full_name}
            </div>
            <div className="text-slate-500 text-[17px] font-bold">
              {p.team_name}
            </div>
          </div>
        </div>
      </td>

      {/* Status Badge */}
      <td className="py-3 px-3 text-center">
        <span
          className={\`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[17px] font-extrabold tracking-widest capitalize \${cfg.bg} \${cfg.color} border \${cfg.border} font-rajdhani\`}
        >
          <span className={\`w-1.5 h-1.5 rounded-full \${cfg.dot} shrink-0\`} />
          {cfg.label}
        </span>
      </td>

      {/* HR Count */}
      <td className="py-3 px-3 text-right">
        <span className="text-white font-extrabold text-[27px] font-rajdhani">
          {p.hr}
        </span>
      </td>

      {/* Games Per HR Rate */}
      <td className="py-3 px-3 text-right">
        <span className="text-[#00D4FF] font-extrabold text-[23px] font-rajdhani">
          {hasRate ? \`1 Per \${p.games_per_hr}g\` : '—'}
        </span>
      </td>

      {/* Games Since HR */}
      <td className="py-3 px-3 text-right">
        <span
          className={\`font-extrabold text-[23px] \${
            p.games_since_hr != null && hasRate
              ? p.games_since_hr > p.games_per_hr * 1.25
                ? 'text-[#FF4444]'
                : p.games_since_hr > p.games_per_hr * 0.75
                  ? 'text-[#FFB800]'
                  : 'text-slate-400'
              : 'text-slate-600'
          } font-rajdhani\`}
        >
          {p.games_since_hr != null ? \`\${p.games_since_hr}g\` : '—'}
        </span>
      </td>

      {/* Matchup */}
      <td className="py-3 px-3 text-right">
        {p.opp_pitcher_name ? (
          <div className="flex flex-col items-end">
            <span className="text-white font-bold text-[23px] truncate max-w-[120px]">
              Vs{' '}
              {p.opp_pitcher_name.split(' ').filter(Boolean).pop() ||
                p.opp_pitcher_name}
            </span>
            {p.opp_pitcher_hr9 != null && (
              <span className="text-slate-500 text-[17px] capitalize font-bold tracking-widest mt-0.5">
                {p.opp_pitcher_hr9.toFixed(2)} HR/9
              </span>
            )}
          </div>
        ) : (
          <span className="text-slate-600 text-[23px]">—</span>
        )}
      </td>

      {/* Matchup Due Score */}
      <td className="py-3 px-3 text-right">
        <div className="flex flex-col items-end gap-1">
          <span
            className={\`font-extrabold text-[27px] \${(p.matchup_due_score ?? p.due_score) > p.due_score ? 'text-[#FF4444]' : (p.matchup_due_score ?? p.due_score) < p.due_score ? 'text-[#00D4FF]' : cfg.color} font-rajdhani\`}
            style={{
              textShadow:
                (p.matchup_due_score ?? p.due_score) >= 1.25
                  ? '0 0 8px rgba(255,68,68,0.5)'
                  : '',
            }}
          >
            {(p.matchup_due_score ?? p.due_score) > 0
              ? \`\${(p.matchup_due_score ?? p.due_score).toFixed(2)}x\`
              : '—'}
          </span>
          {(p.matchup_due_score ?? p.due_score) > 0 && (
            <div className="w-16">
              <DueGauge score={p.matchup_due_score ?? p.due_score} />
            </div>
          )}
        </div>
      </td>

      {/* Raw Due Score */}
      <td className="py-3 px-3 text-right">
        <div className="flex flex-col items-end gap-1">
          <span className="font-extrabold text-[23px] text-slate-400 font-rajdhani">
            {p.due_score > 0 ? \`\${p.due_score.toFixed(2)}x\` : '—'}
          </span>
        </div>
      </td>
    </tr>
  );
});

export default function HRTrackerPage() {`;

content = content.replace("export default function HRTrackerPage() {", playerRow);

// 3. players fallback
content = content.replace(
  "const players: HRPlayer[] = data?.players || [];",
  "const players: HRPlayer[] = data?.players || EMPTY_ARRAY;"
);

// 4. visibleCount
content = content.replace(
  `  const deferredSearch = useDeferredValue(searchQuery);

  useEffect(() => {
    setMounted(true);
  }, []);`,
  `  const deferredSearch = useDeferredValue(searchQuery);
  const [visibleCount, setVisibleCount] = useState(50);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setVisibleCount(50);
  }, [sortKey, sortDir, deferredSearch, statusFilter]);`
);

// 5. colHeader tooltips
content = content.replace(
  /const colHeader = \(col: SortKey, label: string, align: string = 'text-left'\) => \{/g,
  "const colHeader = (col: SortKey, label: string, align: string = 'text-left', tooltip?: string) => {"
);
content = content.replace(
  /<th\n        className=\{\`\$\{align\} py-3 px-3 whitespace-nowrap\`\}\n        aria-sort=\{active \? \(sortDir === 'desc' \? 'descending' : 'ascending'\) : 'none'\}\n        style=\{\{ fontFamily: '"Rajdhani", sans-serif' \}\}\n      >/g,
  `<th\n        className={\`\${align} py-3 px-3 whitespace-nowrap\`}\n        aria-sort={active ? (sortDir === 'desc' ? 'descending' : 'ascending') : 'none'}\n        style={{ fontFamily: '"Rajdhani", sans-serif' }}\n        title={tooltip}\n      >`
);

// 6. thead tooltips
content = content.replace(
  `                      <th\n                        className="text-center py-3 px-3 text-[17px] font-extrabold tracking-widest capitalize text-slate-400 font-rajdhani"\n                      >\n                        Status\n                      </th>\n                      {colHeader('hr', 'HR', 'text-right')}\n                      {colHeader('games_per_hr', 'Games/HR', 'text-right')}\n                      {colHeader('games_since_hr', 'Since HR', 'text-right')}\n                      <th\n                        className="text-right py-3 px-3 text-[17px] font-extrabold tracking-widest capitalize text-slate-400 font-rajdhani"\n                      >\n                        Matchup\n                      </th>\n                      {colHeader('matchup_due_score', 'Matchup Due', 'text-right')}\n                      {colHeader('due_score', 'Raw Due', 'text-right')}`,
  `                      <th\n                        className="text-center py-3 px-3 text-[17px] font-extrabold tracking-widest capitalize text-slate-400 font-rajdhani"\n                        title="Player's HR Due Status"\n                      >\n                        Status\n                      </th>\n                      {colHeader('hr', 'HR', 'text-right', 'Total Home Runs')}\n                      {colHeader('games_per_hr', 'Games/HR', 'text-right', 'Average Games Per Home Run')}\n                      {colHeader('games_since_hr', 'Since HR', 'text-right', 'Games Played Since Last Home Run')}\n                      <th\n                        className="text-right py-3 px-3 text-[17px] font-extrabold tracking-widest capitalize text-slate-400 font-rajdhani"\n                        title="Opponent Pitcher Context"\n                      >\n                        Matchup\n                      </th>\n                      {colHeader('matchup_due_score', 'Matchup Due', 'text-right', 'Due Score Adjusted for Pitcher & Park')}\n                      {colHeader('due_score', 'Raw Due', 'text-right', 'Raw Due Score (Games Since HR ÷ Games/HR)')}`
);

// 7. tbody map replacement
const originalMapStart = `                    {filtered.map((p) => {
                      const cfg = STATUS_CONFIG[p.status] || STATUS_CONFIG.RECENT;
                      const hasRate = p.games_per_hr != null && p.games_per_hr > 0;
                      return (
                        <tr`;

const originalMapEndRegex = /<tr[\s\S]*?<\/tr>\n\s*\);\n\s*\}\)\}/;

const newMap = `                    {filtered.slice(0, visibleCount).map((p) => (
                      <PlayerRow key={p.player_id} p={p} />
                    ))}`;

content = content.replace(originalMapEndRegex, newMap);

// 8. Load More button
content = content.replace(
  /<\/table>\n\s*<\/div>\n\n\s*\{filtered.length === 0 && \(/,
  `</table>\n              </div>\n\n              {visibleCount < filtered.length && (\n                <div className="p-4 border-t border-[#3d4f5f]/50 flex justify-center">\n                  <button\n                    onClick={() => setVisibleCount((prev) => prev + 50)}\n                    className="text-[17px] font-extrabold tracking-widest capitalize text-[#00D4FF] border border-[#00D4FF]/40 rounded-md px-6 py-2.5 hover:bg-[#00D4FF]/10 transition-colors"\n                    style={{ fontFamily: '"Rajdhani", sans-serif' }}\n                  >\n                    Load More\n                  </button>\n                </div>\n              )}\n\n              {filtered.length === 0 && (`
);

fs.writeFileSync(file, content);
console.log('updated');
