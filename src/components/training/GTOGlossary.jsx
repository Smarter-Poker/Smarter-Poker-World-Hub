/**
 * GTOGlossary — Interactive GTO Poker Terminology Reference
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Searchable glossary of GTO and poker strategy terminology.
 * Categorized, with examples and related concepts.
 */
import React, { useState, useMemo } from 'react';

const TERMS = [
  { term: 'GTO', full: 'Game Theory Optimal', category: 'Core', def: 'A strategy that cannot be exploited. If you play GTO, opponent cannot gain EV by deviating from GTO. The Nash Equilibrium of poker.', related: ['Nash Equilibrium', 'Exploitative'] },
  { term: 'EV', full: 'Expected Value', category: 'Core', def: 'The average amount you expect to win or lose over many repetitions. Positive EV (+EV) means profitable long-term. The foundation of all poker decisions.', related: ['EV Loss', 'Chip EV'] },
  { term: 'MDF', full: 'Minimum Defense Frequency', category: 'Defense', def: 'The minimum % of your range you must continue with to prevent opponent from profiting with any two cards as a bluff. MDF = 1 - (Bet / (Pot + Bet)).', related: ['Alpha', 'Pot Odds'] },
  { term: 'Alpha', full: 'Breakeven Bluff %', category: 'Bluffing', def: 'The % of the time your bluff needs to succeed to break even. Alpha = Bet / (Bet + Pot). If villain folds more than alpha, your bluff prints money.', related: ['Fold Equity', 'MDF'] },
  { term: 'SPR', full: 'Stack-to-Pot Ratio', category: 'Sizing', def: 'Effective stack divided by pot. Low SPR (<3) = commit with top pair. High SPR (>10) = need sets+. Determines how many streets of value you can extract.', related: ['Geometric Sizing', 'Commitment'] },
  { term: 'Range Advantage', full: 'Range Advantage', category: 'Ranges', def: 'When one players range contains more strong hands than opponents on a given board. Example: BTN has range advantage on A-high boards (more Ax combos).', related: ['Nut Advantage', 'Equity Distribution'] },
  { term: 'Nut Advantage', full: 'Nut Advantage', category: 'Ranges', def: 'When one player has more of the very strongest hands (nuts). Different from range advantage — you can have range advantage without nut advantage.', related: ['Range Advantage', 'Polarized'] },
  { term: 'Capped Range', full: 'Capped Range', category: 'Ranges', def: 'A range that cannot contain the strongest hands due to previous actions. Example: BB flat-calling is capped (no AA/KK/AK which would 3-bet).', related: ['Uncapped', 'Range Construction'] },
  { term: 'Polarized', full: 'Polarized Range', category: 'Ranges', def: 'A range containing only very strong hands and bluffs, with no medium-strength hands. Used for large bet sizes. The opposite of merged.', related: ['Merged', 'Linear'] },
  { term: 'Merged', full: 'Merged/Linear Range', category: 'Ranges', def: 'A range that includes strong, medium, and some weak hands. Used for small bet sizes. No clear separation between value and bluff.', related: ['Polarized', 'Small Sizing'] },
  { term: 'ICM', full: 'Independent Chip Model', category: 'Tournament', def: 'Converts tournament chip stacks into $EV based on payout structure. Chips have diminishing value — your 1000th chip is worth less than your 1st.', related: ['Bubble Factor', 'Pay Jump'] },
  { term: 'Bubble Factor', full: 'Bubble Factor', category: 'Tournament', def: 'Multiplier showing how much more a lost chip costs vs. what a won chip gains. BF of 2.0 means losing a chip costs twice as much as winning one is worth.', related: ['ICM', 'Risk Premium'] },
  { term: 'Fold Equity', full: 'Fold Equity', category: 'Bluffing', def: 'The portion of your EV that comes from opponent folding. Even with 0% equity, fold equity alone can make a bluff profitable if villain folds enough.', related: ['Alpha', 'Semi-Bluff'] },
  { term: 'Semi-Bluff', full: 'Semi-Bluff', category: 'Bluffing', def: 'A bluff with a hand that has equity to improve (like a flush draw). Profits two ways: villain folds (fold equity) or you hit your draw (equity when called).', related: ['Fold Equity', 'Outs'] },
  { term: 'Blocker', full: 'Card Removal/Blocker', category: 'Advanced', def: 'Cards in your hand that reduce combinations of specific hands in opponents range. Holding A♠ blocks opponents nut flushes in spades.', related: ['Card Removal', 'Bluff Selection'] },
  { term: 'Node Lock', full: 'Node Lock', category: 'Solver', def: 'Fixing a players strategy at a specific decision point in a solver, then re-solving to see how the other player should exploit that fixed strategy.', related: ['Solver', 'Exploit'] },
  { term: 'Geometric Sizing', full: 'Geometric Bet Sizing', category: 'Sizing', def: 'Betting the same % of pot each street to go exactly all-in by the river. Mathematically optimal for maximizing the amount you can bet across streets.', related: ['SPR', 'All-In'] },
  { term: 'Equity Denial', full: 'Equity Denial', category: 'Core', def: 'Betting to force opponent to fold hands that have equity against you. Even if they fold, you gained EV by preventing them from realizing their equity.', related: ['Protection', 'Thin Value'] },
  { term: 'Runout', full: 'Runout', category: 'Core', def: 'The sequence of community cards that come after the current street. A "good runout" means the turn/river cards favor your range or hand.', related: ['Board Texture', 'Turn Impact'] },
  { term: 'Mixed Strategy', full: 'Mixed Strategy', category: 'Advanced', def: 'When GTO requires randomizing between actions at a certain frequency. Example: bet 60% of the time, check 40% with the same hand.', related: ['Pure Strategy', 'Indifference'] },
];

function GTOGlossary() {
  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState('All');
  const [expanded, setExpanded] = useState(null);

  const categories = useMemo(() => ['All', ...new Set(TERMS.map(t => t.category))], []);

  const filtered = useMemo(() => {
    return TERMS.filter(t => {
      const matchSearch = search === '' || t.term.toLowerCase().includes(search.toLowerCase()) || t.def.toLowerCase().includes(search.toLowerCase());
      const matchCat = selectedCat === 'All' || t.category === selectedCat;
      return matchSearch && matchCat;
    });
  }, [search, selectedCat]);

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#06b6d4' }}>GTO Glossary</h3>

        <input type="text" placeholder="Search terms..." value={search} onChange={e => setSearch(e.target.value)} style={{
          width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)',
          background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 13, marginBottom: 12, outline: 'none', boxSizing: 'border-box',
        }} />

        <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
          {categories.map(c => (
            <button key={c} onClick={() => setSelectedCat(c)} style={{
              padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer',
              background: selectedCat === c ? '#06b6d4' : 'rgba(255,255,255,0.06)',
              color: selectedCat === c ? '#000' : 'rgba(255,255,255,0.6)', border: 'none',
            }}>{c}</button>
          ))}
        </div>

        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>{filtered.length} terms</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 400, overflowY: 'auto' }}>
          {filtered.map((t, i) => (
            <div key={t.term} onClick={() => setExpanded(expanded === i ? null : i)} style={{
              padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, cursor: 'pointer',
              borderLeft: expanded === i ? '4px solid #06b6d4' : '4px solid transparent',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#06b6d4' }}>{t.term}</span>
                  {t.full !== t.term && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginLeft: 6 }}>{t.full}</span>}
                </div>
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 4 }}>{t.category}</span>
              </div>
              {expanded === i && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, marginBottom: 6 }}>{t.def}</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {t.related.map(r => (
                      <span key={r} onClick={e => { e.stopPropagation(); setSearch(r); }} style={{
                        fontSize: 9, padding: '2px 6px', borderRadius: 4,
                        background: 'rgba(6,182,212,0.1)', color: '#06b6d4', cursor: 'pointer',
                      }}>→ {r}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>GTO Glossary failed to load: {err.message}</div>;
  }
}

export default GTOGlossary;
