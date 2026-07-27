/**
 * STUDY PLAN CURRICULUM
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Guided learning path with skill progression:
 * - 6 skill levels from Beginner to Elite
 * - Each level has modules with specific topics
 * - Track completion %, time invested, quiz scores
 * - Recommended next steps based on performance
 * - Unlock system — complete prerequisites to advance
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useState, useCallback, useMemo } from 'react';

// ●●● CURRICULUM DATA ●●●
const CURRICULUM = [
  {
    level: 1,
    name: 'Foundations',
    color: '#22c55e',
    icon: '1',
    desc: 'Core concepts every poker player must know',
    modules: [
      { id: 'pos', name: 'Position & Table Dynamics', topics: ['Why position matters', 'EP vs LP ranges', 'Blind play basics'], estimatedTime: '30 min', tool: 'Solutions' },
      { id: 'ranges', name: 'Starting Hand Selection', topics: ['Hand rankings', 'Open raising ranges', 'Tight vs loose'], estimatedTime: '45 min', tool: 'Solutions' },
      { id: 'pot_odds', name: 'Pot Odds & Basic Math', topics: ['Calculating pot odds', 'Outs counting', 'Break-even %'], estimatedTime: '40 min', tool: 'Drills' },
      { id: 'bet_types', name: 'Bet Types & Sizing Basics', topics: ['Value bets', 'Bluffs', 'Protection bets', 'Standard sizings'], estimatedTime: '35 min', tool: 'Sizing' },
    ],
  },
  {
    level: 2,
    name: 'Core Strategy',
    color: '#3b82f6',
    icon: '2',
    desc: 'Building a solid TAG foundation',
    modules: [
      { id: 'preflop_chart', name: 'Preflop Charts Mastery', topics: ['RFI by position', 'Calling ranges', '3-bet ranges'], estimatedTime: '60 min', tool: 'Solutions' },
      { id: 'cbet', name: 'C-Betting Strategy', topics: ['When to c-bet', 'Board texture reads', 'IP vs OOP c-bets'], estimatedTime: '50 min', tool: 'Drills' },
      { id: 'facing_cbet', name: 'Facing C-Bets', topics: ['Check-raise', 'Call vs fold', 'Float plays'], estimatedTime: '45 min', tool: 'Drills' },
      { id: 'sizing_basics', name: 'Bet Sizing Fundamentals', topics: ['1/3 vs 2/3 vs pot', 'When to go big', 'Sizing tells'], estimatedTime: '40 min', tool: 'Sizing' },
    ],
  },
  {
    level: 3,
    name: 'Intermediate',
    color: '#8b5cf6',
    icon: '3',
    desc: 'Multi-street play and range thinking',
    modules: [
      { id: 'multi_street', name: 'Multi-Street Planning', topics: ['Flop-to-river plan', 'SPR awareness', 'Stack-off ranges'], estimatedTime: '55 min', tool: 'Solver' },
      { id: 'board_texture', name: 'Board Texture Analysis', topics: ['Dry vs wet boards', 'Texture-based sizing', 'Range vs board interaction'], estimatedTime: '50 min', tool: 'Boards' },
      { id: 'three_bet', name: '3-Bet & 4-Bet Pots', topics: ['3-bet construction', 'Defending vs 3-bets', '4-bet bluffs'], estimatedTime: '60 min', tool: '3-Bet' },
      { id: 'river_play', name: 'River Decision Making', topics: ['Value vs bluff ratio', 'Thin value bets', 'River blocks'], estimatedTime: '45 min', tool: 'Drills' },
    ],
  },
  {
    level: 4,
    name: 'Advanced',
    color: '#f59e0b',
    icon: '4',
    desc: 'GTO concepts and solver-based play',
    modules: [
      { id: 'solver_study', name: 'Solver Output Reading', topics: ['Frequency interpretation', 'Mixed strategies', 'EV comparison'], estimatedTime: '70 min', tool: 'Postflop' },
      { id: 'range_analysis', name: 'Range vs Range Analysis', topics: ['Equity distributions', 'Range advantage', 'Nut advantage'], estimatedTime: '60 min', tool: 'Ranges' },
      { id: 'multiway', name: 'Multiway Pot Adjustments', topics: ['Tightening ranges', 'Reduced bluffing', 'Protection sizing'], estimatedTime: '45 min', tool: 'Multiway' },
      { id: 'exploits', name: 'Exploitative Adjustments', topics: ['Population reads', 'Archetype targeting', 'Deviate profitably'], estimatedTime: '50 min', tool: 'Opponents' },
    ],
  },
  {
    level: 5,
    name: 'Tournament',
    color: '#ef4444',
    icon: '5',
    desc: 'MTT-specific strategies and ICM',
    modules: [
      { id: 'icm_intro', name: 'ICM Fundamentals', topics: ['ICM model', 'Bubble factor', 'Risk premium'], estimatedTime: '55 min', tool: 'ICM' },
      { id: 'bubble', name: 'Bubble Play Mastery', topics: ['Big stack aggression', 'Medium stack survival', 'Short stack shoves'], estimatedTime: '60 min', tool: 'MTT' },
      { id: 'final_table', name: 'Final Table Strategy', topics: ['Pay jump ICM', 'Stack dynamics', 'Heads-up adjustments'], estimatedTime: '50 min', tool: 'MTT' },
      { id: 'push_fold', name: 'Push/Fold Nash Charts', topics: ['Push ranges by BB', 'Call ranges', 'ICM vs cEV'], estimatedTime: '45 min', tool: 'ICM' },
    ],
  },
  {
    level: 6,
    name: 'Elite',
    color: '#ec4899',
    icon: '6',
    desc: 'Mastering the meta — solver-level play',
    modules: [
      { id: 'overbets', name: 'Overbet Strategies', topics: ['When to overbet', 'Polarized ranges', 'Nut advantage exploitation'], estimatedTime: '60 min', tool: 'Sizing' },
      { id: 'nodes', name: 'Game Tree Navigation', topics: ['Decision nodes', 'Frequency balancing', 'Solver nodelock'], estimatedTime: '70 min', tool: 'Game Tree' },
      { id: 'hh_review', name: 'Hand History Deep Dive', topics: ['Session review protocol', 'Leak identification', 'EV tracking'], estimatedTime: '55 min', tool: 'Import' },
      { id: 'meta_game', name: 'Meta-Game & Population', topics: ['Player pool tendencies', 'Table dynamics', 'Timing tells'], estimatedTime: '45 min', tool: 'Analytics' },
    ],
  },
];

// ●●● MAIN COMPONENT ●●●
export default function StudyPlanCurriculum() {
  const [progress, setProgress] = useState({});
  const [expandedLevel, setExpandedLevel] = useState(1);
  const [activeModule, setActiveModule] = useState(null);

  const toggleModule = useCallback((moduleId) => {
    setProgress(prev => ({
      ...prev,
      [moduleId]: prev[moduleId] === 'completed' ? 'pending' : 'completed',
    }));
  }, []);

  const getLevelProgress = useCallback((level) => {
    const modules = CURRICULUM.find(c => c.level === level)?.modules || [];
    const completed = modules.filter(m => progress[m.id] === 'completed').length;
    return { completed, total: modules.length, pct: modules.length > 0 ? Math.round(completed / modules.length * 100) : 0 };
  }, [progress]);

  const overallProgress = useMemo(() => {
    const total = CURRICULUM.reduce((sum, c) => sum + c.modules.length, 0);
    const completed = Object.values(progress || {}).filter(p => p === 'completed').length;
    return { completed, total, pct: total > 0 ? Math.round(completed / total * 100) : 0 };
  }, [progress]);

  // Find recommended next
  const recommended = useMemo(() => {
    for (const level of CURRICULUM) {
      for (const mod of level.modules) {
        if (progress[mod.id] !== 'completed') {
          return { level, module: mod };
        }
      }
    }
    return null;
  }, [progress]);

  return (
    <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, margin: 0 }}>
          Study Plan
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 120, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3 }}>
            <div style={{
              width: `${overallProgress.pct}%`, height: '100%', borderRadius: 3,
              background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
              transition: 'width 0.3s',
            }} />
          </div>
          <span style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600 }}>
            {overallProgress.completed}/{overallProgress.total} ({overallProgress.pct}%)
          </span>
        </div>
      </div>

      {/* Recommended Next */}
      {recommended && (
        <div style={{
          background: 'rgba(59,130,246,0.08)', borderRadius: 8, padding: 12, marginBottom: 16,
          border: '1px solid rgba(59,130,246,0.15)', display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `${recommended.level.color}20`, color: recommended.level.color, fontWeight: 800, fontSize: 14,
          }}>
            {recommended.level.icon}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#64748b', fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>Recommended Next</div>
            <div style={{ color: '#f1f5f9', fontSize: 13, fontWeight: 600 }}>
              {recommended.module.name}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ color: '#64748b', fontSize: 11 }}>{recommended.module.estimatedTime}</span>
            <span style={{
              padding: '3px 8px', borderRadius: 4, background: `${recommended.level.color}15`,
              color: recommended.level.color, fontSize: 10, fontWeight: 700,
            }}>
              {recommended.module.tool}
            </span>
          </div>
        </div>
      )}

      {/* ●●● LEVEL CARDS ●●● */}
      {CURRICULUM.map(level => {
        const lp = getLevelProgress(level.level);
        const isExpanded = expandedLevel === level.level;
        const isLocked = level.level > 1 && getLevelProgress(level.level - 1).pct < 75;

        return (
          <div key={level.level} style={{
            background: 'rgba(0,0,0,0.15)', borderRadius: 10, marginBottom: 8,
            border: `1px solid ${isExpanded ? `${level.color}30` : 'rgba(255,255,255,0.04)'}`,
            opacity: isLocked ? 0.5 : 1,
            transition: 'all 0.2s',
          }}>
            {/* Level Header */}
            <div
              onClick={() => !isLocked && setExpandedLevel(isExpanded ? null : level.level)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                cursor: isLocked ? 'default' : 'pointer',
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: lp.pct === 100 ? level.color : `${level.color}20`,
                color: lp.pct === 100 ? '#fff' : level.color,
                fontWeight: 800, fontSize: 14,
                transition: 'all 0.3s',
              }}>
                {lp.pct === 100 ? '\u2713' : level.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#f1f5f9', fontSize: 14, fontWeight: 700 }}>{level.name}</span>
                  {isLocked && <span style={{ color: '#64748b', fontSize: 10 }}>Locked — complete {CURRICULUM[level.level - 2]?.name} first</span>}
                </div>
                <div style={{ color: '#94a3b8', fontSize: 11 }}>{level.desc}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: level.color, fontSize: 13, fontWeight: 700 }}>{lp.pct}%</div>
                <div style={{ color: '#64748b', fontSize: 10 }}>{lp.completed}/{lp.total}</div>
              </div>
              {/* Progress ring */}
              <svg width={32} height={32} style={{ transform: 'rotate(-90deg)' }}>
                <circle cx={16} cy={16} r={13} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={3} />
                <circle cx={16} cy={16} r={13} fill="none" stroke={level.color} strokeWidth={3}
                  strokeDasharray={`${lp.pct * 0.817} 100`} strokeLinecap="round" />
              </svg>
            </div>

            {/* Modules */}
            {isExpanded && !isLocked && (
              <div style={{ padding: '0 16px 12px 16px' }}>
                {level.modules.map(module => {
                  const isCompleted = progress[module.id] === 'completed';
                  return (
                    <div key={module.id} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0',
                      borderTop: '1px solid rgba(255,255,255,0.04)',
                    }}>
                      {/* Checkbox */}
                      <div
                        onClick={() => toggleModule(module.id)}
                        style={{
                          width: 20, height: 20, borderRadius: 5, cursor: 'pointer', marginTop: 2,
                          background: isCompleted ? level.color : 'transparent',
                          border: isCompleted ? 'none' : '2px solid rgba(255,255,255,0.15)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 0.2s', flexShrink: 0,
                        }}
                      >
                        {isCompleted && <span style={{ color: '#fff', fontSize: 12, fontWeight: 800 }}>\u2713</span>}
                      </div>

                      <div style={{ flex: 1 }}>
                        <div style={{
                          color: isCompleted ? '#64748b' : '#f1f5f9', fontSize: 13, fontWeight: 600,
                          textDecoration: isCompleted ? 'line-through' : 'none',
                        }}>
                          {module.name}
                        </div>
                        <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                          {module.topics.map((topic, i) => (
                            <span key={i} style={{
                              padding: '1px 6px', borderRadius: 3, background: 'rgba(255,255,255,0.04)',
                              color: '#64748b', fontSize: 10,
                            }}>
                              {topic}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                        <span style={{ color: '#64748b', fontSize: 10 }}>{module.estimatedTime}</span>
                        <span style={{
                          padding: '2px 6px', borderRadius: 3,
                          background: `${level.color}15`, color: level.color,
                          fontSize: 9, fontWeight: 700,
                        }}>
                          {module.tool}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
