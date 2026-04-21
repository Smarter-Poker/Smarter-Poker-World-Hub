/**
 * RangeGrid -- 13x13 poker hand range visualization
 * =================================================
 * Props:
 *   range       Set<string>   -- hand codes in range (e.g. 'AKs', 'QQ')
 *   weights     Map|object    -- hand code to 0-1 weight for gradient coloring
 *   playerType  string|null   -- TAG / LAG / LP / TP / NIT / MANIAC badge
 *   heroHand    string|null   -- current hero hand to highlight with border
 *   position    string|null   -- position label shown in header
 *   compact     boolean       -- smaller font/cell size (default true)
 */

import React, { useMemo } from 'react';

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

function buildMatrix() {
  const grid = [];
  for (let r = 0; r < 13; r++) {
    const row = [];
    for (let c = 0; c < 13; c++) {
      if (r === c) row.push(RANKS[r] + RANKS[c]);
      else if (c > r) row.push(RANKS[r] + RANKS[c] + 's');
      else row.push(RANKS[c] + RANKS[r] + 'o');
    }
    grid.push(row);
  }
  return grid;
}

const MATRIX = buildMatrix();

// -- Standard opening ranges by position --

const RANGE_DATA = {
  utg: 'AA,KK,QQ,JJ,TT,99,88,AKs,AQs,AJs,ATs,KQs,AKo,AQo',
  mp: 'AA,KK,QQ,JJ,TT,99,88,77,AKs,AQs,AJs,ATs,A9s,KQs,KJs,QJs,AKo,AQo,AJo',
  co: 'AA,KK,QQ,JJ,TT,99,88,77,66,AKs,AQs,AJs,ATs,A9s,A8s,A7s,A6s,A5s,A4s,A3s,A2s,KQs,KJs,KTs,QJs,QTs,JTs,T9s,98s,87s,76s,AKo,AQo,AJo,ATo,KQo,KJo,QJo',
  btn: 'AA,KK,QQ,JJ,TT,99,88,77,66,55,44,33,22,AKs,AQs,AJs,ATs,A9s,A8s,A7s,A6s,A5s,A4s,A3s,A2s,KQs,KJs,KTs,K9s,K8s,K7s,K6s,K5s,QJs,QTs,Q9s,Q8s,JTs,J9s,J8s,T9s,T8s,98s,97s,87s,86s,76s,75s,65s,64s,54s,53s,43s,AKo,AQo,AJo,ATo,A9o,A8o,KQo,KJo,KTo,K9o,QJo,QTo,JTo,J9o,T9o,98o',
  sb: 'AA,KK,QQ,JJ,TT,99,88,77,66,55,AKs,AQs,AJs,ATs,A9s,A8s,A7s,A6s,A5s,A4s,A3s,A2s,KQs,KJs,KTs,K9s,K8s,QJs,QTs,Q9s,JTs,J9s,T9s,T8s,98s,97s,87s,86s,76s,65s,54s,AKo,AQo,AJo,ATo,A9o,KQo,KJo,QJo',
  bb: 'AA,KK,QQ,JJ,TT,99,88,77,66,55,44,33,22,AKs,AQs,AJs,ATs,A9s,A8s,A7s,A6s,A5s,A4s,A3s,A2s,KQs,KJs,KTs,K9s,K8s,K7s,K6s,K5s,K4s,K3s,K2s,QJs,QTs,Q9s,Q8s,Q7s,Q6s,JTs,J9s,J8s,J7s,T9s,T8s,T7s,98s,97s,96s,87s,86s,85s,76s,75s,65s,64s,54s,53s,43s,AKo,AQo,AJo,ATo,A9o,A8o,A7o,A6o,A5o,A4o,KQo,KJo,KTo,K9o,QJo,QTo,Q9o,JTo,J9o,T9o,T8o,98o,97o,87o,76o',
};

const RANGES = {};
for (const [pos, csv] of Object.entries(RANGE_DATA || {})) {
  RANGES[pos] = new Set(csv.split(','));
}

export function getOpeningRange(position) {
  const pos = String(position || '').toLowerCase();
  return RANGES[pos] || RANGES.mp;
}

// -- Color helpers --

function weightToColor(w) {
  if (w <= 0.5) {
    const t = w * 2;
    return `rgb(220,${Math.round(60 + t * 160)},${Math.round(30 + t * 10)})`;
  }
  const t = (w - 0.5) * 2;
  return `rgb(${Math.round(220 - t * 180)},${Math.round(220 - t * 30)},${Math.round(40 + t * 60)})`;
}

const TYPE_COLORS = {
  TAG: '#22c55e', LAG: '#f97316', LP: '#eab308', TP: '#3b82f6',
  NIT: '#6b7280', MANIAC: '#ef4444', UNK: '#6b7280',
};

export default function RangeGrid({
  range = null, weights = null, playerType = null,
  heroHand = null, position = null, compact = true,
}) {
  const weightMap = useMemo(() => {
    if (!weights) return null;
    if (weights instanceof Map) return weights;
    return new Map(Object.entries(weights || {}));
  }, [weights]);

  const rangeSet = useMemo(() => {
    if (!range) return null;
    if (range instanceof Set) return range;
    return new Set(Array.isArray(range) ? range : []);
  }, [range]);

  const sz = compact ? 'w-[20px] h-[18px] text-[7px]' : 'w-[22px] h-[20px] text-[8px]';

  return (
    <div className="inline-block bg-slate-900 rounded-lg p-2 shadow-xl border border-slate-700">
      <div className="flex items-center justify-between mb-1.5 px-0.5">
        <span className="text-[9px] text-white/60 uppercase tracking-wider font-semibold">
          {position ? `${position} Range` : 'Hand Range'}
        </span>
        {playerType && (
          <span
            className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded"
            style={{
              backgroundColor: (TYPE_COLORS[playerType] || '#6b7280') + '30',
              color: TYPE_COLORS[playerType] || '#6b7280',
            }}
          >
            {playerType}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-px">
        {MATRIX.map((row, r) => (
          <div key={r} className="flex gap-px">
            {row.map((code, c) => {
              const inRange = rangeSet ? rangeSet.has(code) : false;
              const w = weightMap ? weightMap.get(code) : null;
              const isHero = heroHand && code === heroHand;
              const isPair = r === c;
              const isSuited = c > r;
              let bg;
              if (w != null) bg = weightToColor(w);
              else if (inRange) bg = isPair ? '#16a34a' : isSuited ? '#15803d' : '#166534';
              else bg = '#1e293b';

              return (
                <div
                  key={code}
                  className={`${sz} flex items-center justify-center font-mono leading-none select-none rounded-sm`}
                  style={{
                    backgroundColor: bg,
                    color: inRange || w != null ? '#fff' : '#475569',
                    fontWeight: inRange ? 700 : 400,
                    outline: isHero ? '2px solid #facc15' : 'none',
                    outlineOffset: isHero ? '-1px' : undefined,
                  }}
                  title={`${code}${w != null ? ` (${(w * 100).toFixed(0)}%)` : ''}`}
                >
                  {code}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {rangeSet && (
        <div className="mt-1.5 text-[8px] text-white/50 text-center">
          {rangeSet.size} combos
        </div>
      )}
    </div>
  );
}
