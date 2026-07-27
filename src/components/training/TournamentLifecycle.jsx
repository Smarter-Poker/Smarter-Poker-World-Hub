/**
 * TournamentLifecycle — MTT Stage-by-Stage Guide
 * How to adjust your strategy through every tournament phase
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const MTT_STAGES = [
  { stage: 'Early Levels (100+ BB)', icon: '○', color: '#22c55e',
    blinds: 'Levels 1-4 | Antes: None/Small',
    strategy: 'Play tight. Build a tight image. Speculate with small pairs and suited connectors deep-stacked.',
    avoid: 'Don\'t gamble for your tournament life early. The chips you win now are worth less than chips saved.',
    key: 'Patience. Let recreational players bust each other. Accumulate steadily, not recklessly.' },
  { stage: 'Middle Levels (40-80 BB)', icon: '○', color: '#3b82f6',
    blinds: 'Levels 5-10 | Antes: Active',
    strategy: 'Open up. Steal blinds+antes. Start 3-betting wider. Accumulate chips for the push to the money.',
    avoid: 'Don\'t tighten up because "it\'s getting serious." Middle levels reward aggression.',
    key: 'Antes make stealing more profitable. Every pot has dead money. Attack passive tables.' },
  { stage: 'Bubble (Near the Money)', icon: '○', color: '#f59e0b',
    blinds: 'Varies | ICM: Maximum pressure',
    strategy: 'As big stack: ATTACK relentlessly. As medium/short: SURVIVE. Let others bust.',
    avoid: 'Don\'t risk your tournament with marginal hands as a medium stack. Survival = guaranteed payout.',
    key: 'ICM pressure is highest here. Big stacks should raise every hand. Short stacks need to shove or fold.' },
  { stage: 'In the Money (20-40 BB)', icon: '●', color: '#8b5cf6',
    blinds: 'Levels 12+ | Pay jumps matter',
    strategy: 'After the bubble bursts, play for the win, not laddering. Re-accumulate aggressively.',
    avoid: 'Don\'t play scared money. Min-cashing is not the goal — you want a deep run.',
    key: 'The payout structure is top-heavy. 1st place is 20-30% of the total pool. Play to win.' },
  { stage: 'Final Table (10 BB - Deep)', icon: '★', color: '#ef4444',
    blinds: 'High | ICM: Critical at pay jumps',
    strategy: 'Stack-aware poker. Use ICM to determine aggression. Big stacks bully, shorts find spots.',
    avoid: 'Don\'t punt your stack in a marginal spot with pay jumps looming.',
    key: 'Final table is where the REAL money is. Each elimination is worth thousands. Play smart, play tight near jumps.' },
];

export default function TournamentLifecycle() {
  const [stageIdx, setStageIdx] = useState(0);
  const stage = MTT_STAGES[stageIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #22c55e, #ef4444)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        ■ Tournament Lifecycle
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Adjust strategy through every MTT phase.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 16 }}>
        {MTT_STAGES.map((s, i) => (
          <button key={i} onClick={() => setStageIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: stageIdx === i ? `2px solid ${s.color}` : '1px solid rgba(255,255,255,0.06)',
              background: stageIdx === i ? `${s.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 14 }}>{s.icon}</div>
            <div style={{ fontSize: 7, fontWeight: 700, color: stageIdx === i ? s.color : '#64748b' }}>{s.stage.substring(0, 10)}</div>
          </button>
        ))}
      </div>

      <motion.div key={stageIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 24 }}>{stage.icon}</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: stage.color }}>{stage.stage}</span>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: '3px 8px' }}>
            <span style={{ fontSize: 9, color: '#94a3b8' }}>{stage.blinds}</span>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: 'rgba(34,197,94,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #22c55e' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e' }}>Strategy</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{stage.strategy}</div>
          </div>
          <div style={{ background: 'rgba(239,68,68,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #ef4444' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444' }}>Avoid</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{stage.avoid}</div>
          </div>
          <div style={{ background: `${stage.color}08`, borderRadius: 8, padding: 10, borderLeft: `3px solid ${stage.color}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: stage.color }}>Key Insight</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{stage.key}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
