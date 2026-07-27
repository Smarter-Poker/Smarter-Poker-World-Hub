/**
 * PokerPsychology — Poker Psychology & Mindset
 * Mental game fundamentals for peak performance
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const PSYCH_TOPICS = [
  { title: 'Tilt Management', icon: '◇', color: '#ef4444',
    detail: 'Tilt is the #1 profit killer in poker. It\'s not a character flaw — it\'s a predictable emotional response that can be managed with the right tools.',
    signs: 'Playing too many hands, calling too light, revenge-raising, chasing losses, playing above your stakes after a bad beat.',
    tools: 'Set a stop-loss (3 buy-ins). Take breaks every 90 minutes. Have a pre-session routine. Use breathing exercises.',
    science: 'Tilt triggers the amygdala (fight-or-flight), bypassing the prefrontal cortex (logical thinking). You literally can\'t think straight.' },
  { title: 'Bankroll Psychology', icon: '●', color: '#22c55e',
    detail: 'Playing with scared money guarantees you\'ll play scared poker. Proper bankroll removes the emotional weight from individual hands.',
    signs: 'Hesitating to make correct +EV plays. Avoiding big pots with strong hands. Playing too tight because "you can\'t afford to lose."',
    tools: 'Follow strict bankroll rules (20-30 buy-ins for cash). Separate poker bankroll from life money. Track results religiously.',
    science: 'Loss aversion: Losing $100 hurts 2.5x more than winning $100 feels good. Bankroll management counteracts this bias.' },
  { title: 'Results-Oriented Thinking', icon: '◆', color: '#3b82f6',
    detail: 'Judging decisions by their outcome (not their quality) is the most common thinking error in poker. A good decision can lose, and a bad decision can win.',
    signs: '"I should have folded" after a cooler. Changing strategy after a losing session. Celebrating bad plays that happened to win.',
    tools: 'Review decisions, not results. Ask "Would I make the same play again?" If yes, the result doesn\'t matter.',
    science: 'Outcome bias is a well-documented cognitive bias. The brain naturally attributes success to skill and failure to bad luck.' },
  { title: 'Focus & Flow State', icon: '⌁', color: '#f59e0b',
    detail: 'Peak poker performance comes in "flow state" — full immersion where decisions feel effortless. Getting there requires preparation.',
    signs: 'You\'re in flow when: time disappears, decisions feel automatic, you\'re reading opponents easily, there\'s no emotional noise.',
    tools: 'Warm up with hand reviews. Eliminate distractions (phone, TV, social media). Play at consistent times. Good sleep and nutrition.',
    science: 'Flow state increases dopamine and norepinephrine, enhancing pattern recognition and decision speed by up to 500%.' },
  { title: 'Dealing with Downswings', icon: '▼', color: '#8b5cf6',
    detail: 'Every poker player will experience prolonged losing periods. How you handle them determines whether you survive long-term.',
    signs: 'You\'re in a downswing when: your win rate drops significantly over 30k+ hands, but your play quality hasn\'t declined.',
    tools: 'Review hands with a coach. Drop down 1 stake temporarily. Reduce volume. Focus on study. Remember: variance is temporary.',
    science: 'A winning player with a 5bb/100 win rate can expect a 10+ buy-in downswing every ~50k hands. It\'s mathematically inevitable.' },
];

export default function PokerPsychology() {
  const [idx, setIdx] = useState(0);
  const t = PSYCH_TOPICS[idx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #ef4444, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Poker Psychology
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Master your mind to master the game.</p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {PSYCH_TOPICS.map((topic, i) => (
          <button key={i} onClick={() => setIdx(i)}
            style={{ padding: '6px 12px', borderRadius: 8, border: idx === i ? `2px solid ${topic.color}` : '1px solid rgba(255,255,255,0.06)',
              background: idx === i ? `${topic.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer',
              fontSize: 11, fontWeight: 700, color: idx === i ? topic.color : '#64748b' }}>
            {topic.icon} {topic.title}
          </button>
        ))}
      </div>

      <motion.div key={idx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: t.color, marginBottom: 8 }}>{t.icon} {t.title}</div>
        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 12 }}>{t.detail}</p>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: 'rgba(239,68,68,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #ef4444' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#ef4444' }}>WARNING SIGNS</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{t.signs}</div>
          </div>
          <div style={{ background: 'rgba(34,197,94,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #22c55e' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#22c55e' }}>TOOLS & TACTICS</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{t.tools}</div>
          </div>
          <div style={{ background: `${t.color}06`, borderRadius: 8, padding: 10, borderLeft: `3px solid ${t.color}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: t.color }}>THE SCIENCE</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{t.science}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
