/**
 * EV TREE VISUALIZER
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * GTO Wizard-style EV decision tree:
 * - Visual tree showing all decision points
 * - EV values at each node with color coding
 * - Optimal vs suboptimal path highlighting
 * - Collapsible branches
 * - Strategy frequencies at each node
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useState, useMemo } from 'react';

// ●●● PRESET SCENARIOS ●●●
const SCENARIOS = [
  {
    id: 'btn_cbet',
    label: 'BTN vs BB C-Bet',
    board: 'K♠ 8♦ 3♣',
    pot: 6.5,
    tree: {
      id: 'root', player: 'BTN', street: 'Flop', action: 'Decision', ev: 1.82, freq: 100,
      children: [
        {
          id: 'check', player: 'BTN', action: 'Check', ev: 0.95, freq: 38, optimal: false,
          children: [
            {
              id: 'bb_bet', player: 'BB', action: 'Bet 33%', ev: -0.42, freq: 55,
              children: [
                { id: 'btn_call', player: 'BTN', action: 'Call', ev: 0.18, freq: 65, optimal: true, children: [] },
                { id: 'btn_fold', player: 'BTN', action: 'Fold', ev: 0.00, freq: 25, children: [] },
                { id: 'btn_raise', player: 'BTN', action: 'Raise 3x', ev: 0.85, freq: 10, children: [] },
              ]
            },
            { id: 'bb_check', player: 'BB', action: 'Check', ev: 0.62, freq: 45, children: [] },
          ]
        },
        {
          id: 'bet33', player: 'BTN', action: 'Bet 33%', ev: 1.82, freq: 45, optimal: true,
          children: [
            { id: 'bb_fold33', player: 'BB', action: 'Fold', ev: 3.25, freq: 40, children: [] },
            {
              id: 'bb_call33', player: 'BB', action: 'Call', ev: 0.95, freq: 48, optimal: true,
              children: [
                { id: 'turn_node', player: 'BTN', action: 'Turn →', ev: 1.15, freq: 100, children: [] },
              ]
            },
            { id: 'bb_raise33', player: 'BB', action: 'Raise', ev: -1.20, freq: 12, children: [] },
          ]
        },
        {
          id: 'bet67', player: 'BTN', action: 'Bet 67%', ev: 1.55, freq: 12, optimal: false,
          children: [
            { id: 'bb_fold67', player: 'BB', action: 'Fold', ev: 3.25, freq: 52, children: [] },
            { id: 'bb_call67', player: 'BB', action: 'Call', ev: 0.42, freq: 38, children: [] },
            { id: 'bb_raise67', player: 'BB', action: 'Raise', ev: -2.10, freq: 10, children: [] },
          ]
        },
        {
          id: 'betpot', player: 'BTN', action: 'Bet Pot', ev: 0.82, freq: 5, optimal: false,
          children: [
            { id: 'bb_foldp', player: 'BB', action: 'Fold', ev: 3.25, freq: 60, children: [] },
            { id: 'bb_callp', player: 'BB', action: 'Call', ev: -0.55, freq: 32, children: [] },
            { id: 'bb_raisep', player: 'BB', action: 'Raise', ev: -3.40, freq: 8, children: [] },
          ]
        },
      ]
    }
  },
  {
    id: 'bb_defend',
    label: 'BB vs BTN Open',
    board: 'Preflop',
    pot: 2.5,
    tree: {
      id: 'root2', player: 'BB', street: 'Preflop', action: 'Facing 2.5x', ev: -0.35, freq: 100,
      children: [
        {
          id: 'fold', player: 'BB', action: 'Fold', ev: -1.00, freq: 38, optimal: false, children: []
        },
        {
          id: 'call', player: 'BB', action: 'Call', ev: -0.15, freq: 42, optimal: true,
          children: [
            { id: 'flop_node', player: 'BB', action: 'See Flop →', ev: -0.15, freq: 100, children: [] },
          ]
        },
        {
          id: '3bet', player: 'BB', action: '3-Bet 9bb', ev: 0.25, freq: 15, optimal: true,
          children: [
            { id: 'btn_fold3b', player: 'BTN', action: 'Fold', ev: 2.50, freq: 55, children: [] },
            { id: 'btn_call3b', player: 'BTN', action: 'Call', ev: -0.80, freq: 32, children: [] },
            { id: 'btn_4bet', player: 'BTN', action: '4-Bet', ev: -1.50, freq: 13, children: [] },
          ]
        },
        {
          id: 'squeeze', player: 'BB', action: 'All-In', ev: -0.85, freq: 5, optimal: false, children: []
        },
      ]
    }
  },
  {
    id: 'turn_barrel',
    label: 'Turn Barrel Decision',
    board: 'K♠ 8♦ 3♣ J♥',
    pot: 13.0,
    tree: {
      id: 'root3', player: 'BTN', street: 'Turn', action: 'Decision', ev: 2.45, freq: 100,
      children: [
        {
          id: 'check_t', player: 'BTN', action: 'Check', ev: 1.80, freq: 42, optimal: false,
          children: [
            { id: 'bb_bet_t', player: 'BB', action: 'Bet 50%', ev: -0.60, freq: 35, children: [] },
            { id: 'bb_check_t', player: 'BB', action: 'Check', ev: 1.80, freq: 65, children: [] },
          ]
        },
        {
          id: 'bet33_t', player: 'BTN', action: 'Bet 33%', ev: 2.45, freq: 35, optimal: true,
          children: [
            { id: 'bb_fold33_t', player: 'BB', action: 'Fold', ev: 6.50, freq: 35, children: [] },
            { id: 'bb_call33_t', player: 'BB', action: 'Call', ev: 1.20, freq: 52, children: [] },
            { id: 'bb_raise33_t', player: 'BB', action: 'Raise', ev: -2.80, freq: 13, children: [] },
          ]
        },
        {
          id: 'bet75_t', player: 'BTN', action: 'Bet 75%', ev: 2.15, freq: 18, optimal: false,
          children: [
            { id: 'bb_fold75_t', player: 'BB', action: 'Fold', ev: 6.50, freq: 48, children: [] },
            { id: 'bb_call75_t', player: 'BB', action: 'Call', ev: 0.35, freq: 42, children: [] },
            { id: 'bb_raise75_t', player: 'BB', action: 'Raise', ev: -4.20, freq: 10, children: [] },
          ]
        },
        {
          id: 'overbet_t', player: 'BTN', action: 'Overbet 150%', ev: 1.35, freq: 5, optimal: false,
          children: [
            { id: 'bb_fold_ob', player: 'BB', action: 'Fold', ev: 6.50, freq: 62, children: [] },
            { id: 'bb_call_ob', player: 'BB', action: 'Call', ev: -2.10, freq: 33, children: [] },
            { id: 'bb_raise_ob', player: 'BB', action: 'Raise', ev: -6.80, freq: 5, children: [] },
          ]
        },
      ]
    }
  },
];

// ●●● EV COLOR ●●●
function getEVColor(ev) {
  if (ev > 2) return '#22c55e';
  if (ev > 0.5) return '#34d399';
  if (ev > 0) return '#86efac';
  if (ev > -0.5) return '#fbbf24';
  if (ev > -1.5) return '#f97316';
  return '#ef4444';
}

// ●●● ACTION COLOR ●●●
function getActionColor(action) {
  if (action.includes('Bet') || action.includes('Raise') || action.includes('3-Bet') || action.includes('All-In') || action.includes('Overbet')) return '#ef4444';
  if (action.includes('Call')) return '#22c55e';
  if (action.includes('Fold')) return '#3b82f6';
  if (action.includes('Check')) return '#94a3b8';
  return '#f59e0b';
}

// ●●● TREE NODE COMPONENT ●●●
function TreeNodeView({ node, depth, expanded, toggleExpand }) {
  const [isHovered, setIsHovered] = useState(false);
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expanded[node.id] !== false; // default expanded

  return (
    <div style={{ marginLeft: depth * 24 }}>
      <div
        onClick={() => hasChildren && toggleExpand(node.id)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
          borderRadius: 6, cursor: hasChildren ? 'pointer' : 'default', marginBottom: 2,
          background: isHovered ? 'rgba(255,255,255,0.06)' : node.optimal ? 'rgba(34,197,94,0.06)' : 'transparent',
          border: node.optimal ? '1px solid rgba(34,197,94,0.15)' : '1px solid transparent',
          transition: 'all 0.15s',
        }}
      >
        {/* Expand icon */}
        {hasChildren ? (
          <span style={{ color: '#64748b', fontSize: 10, width: 12, textAlign: 'center', flexShrink: 0 }}>
            {isExpanded ? '●' : '▶'}
          </span>
        ) : (
          <span style={{ width: 12, flexShrink: 0 }} />
        )}

        {/* Player badge */}
        <span style={{
          padding: '2px 6px', borderRadius: 3, fontSize: 9, fontWeight: 700,
          background: node.player === 'BTN' ? 'rgba(59,130,246,0.15)' : 'rgba(239,68,68,0.15)',
          color: node.player === 'BTN' ? '#3b82f6' : '#ef4444',
          flexShrink: 0,
        }}>
          {node.player}
        </span>

        {/* Action */}
        <span style={{
          color: getActionColor(node.action), fontSize: 12, fontWeight: 700, flexShrink: 0,
        }}>
          {node.action}
        </span>

        {/* Frequency bar */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ flex: 1, height: 6, background: 'rgba(0,0,0,0.2)', borderRadius: 3, overflow: 'hidden', maxWidth: 80 }}>
            <div style={{
              width: `${node.freq}%`, height: '100%', borderRadius: 3,
              background: getActionColor(node.action), opacity: 0.6,
            }} />
          </div>
          <span style={{ color: '#64748b', fontSize: 9, fontWeight: 600 }}>{node.freq}%</span>
        </div>

        {/* EV */}
        <span style={{
          color: getEVColor(node.ev), fontSize: 12, fontWeight: 800, flexShrink: 0,
          minWidth: 50, textAlign: 'right',
        }}>
          {node.ev > 0 ? '+' : ''}{node.ev.toFixed(2)} bb
        </span>

        {/* Optimal marker */}
        {node.optimal && (
          <span style={{
            padding: '1px 5px', borderRadius: 3, fontSize: 8, fontWeight: 700,
            background: 'rgba(34,197,94,0.15)', color: '#22c55e',
          }}>
            GTO
          </span>
        )}
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div style={{ borderLeft: '1px solid rgba(255,255,255,0.06)', marginLeft: 5 }}>
          {node.children.map(child => (
            <TreeNodeView key={child.id} node={child} depth={depth + 1} expanded={expanded} toggleExpand={toggleExpand} />
          ))}
        </div>
      )}
    </div>
  );
}

// ●●● NODE STATS ●●●
function NodeStats({ tree }) {
  // Count nodes
  let totalNodes = 0, betNodes = 0, checkNodes = 0, foldNodes = 0;
  function countNodes(node) {
    totalNodes++;
    if (node.action.includes('Bet') || node.action.includes('Raise')) betNodes++;
    else if (node.action.includes('Check')) checkNodes++;
    else if (node.action.includes('Fold')) foldNodes++;
    (node.children || []).forEach(countNodes);
  }
  countNodes(tree);

  // Find best and worst EV paths
  let bestEV = -Infinity, worstEV = Infinity, bestAction = '', worstAction = '';
  (tree.children || []).forEach(child => {
    if (child.ev > bestEV) { bestEV = child.ev; bestAction = child.action; }
    if (child.ev < worstEV) { worstEV = child.ev; worstAction = child.action; }
  });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
      {[
        { label: 'Total Nodes', value: totalNodes, color: '#f1f5f9' },
        { label: 'Best Action', value: bestAction, sub: `+${bestEV.toFixed(2)}bb`, color: '#22c55e' },
        { label: 'Worst Action', value: worstAction, sub: `${worstEV.toFixed(2)}bb`, color: '#ef4444' },
      ].map((s, i) => (
        <div key={i} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 6, padding: 8, textAlign: 'center' }}>
          <div style={{ color: '#64748b', fontSize: 8, fontWeight: 600, textTransform: 'uppercase' }}>{s.label}</div>
          <div style={{ color: s.color, fontSize: 14, fontWeight: 800 }}>{s.value}</div>
          {s.sub && <div style={{ color: s.color, fontSize: 10, opacity: 0.7 }}>{s.sub}</div>}
        </div>
      ))}
    </div>
  );
}

// ●●● MAIN COMPONENT ●●●
export default function EVTreeVisualizer() {
  const [selectedScenario, setSelectedScenario] = useState(0);
  const [expanded, setExpanded] = useState({});

  const scenario = SCENARIOS[selectedScenario];

  const toggleExpand = (id) => {
    setExpanded(prev => ({ ...prev, [id]: prev[id] === false ? true : false }));
  };

  const expandAll = () => {
    const all = {};
    function walk(node) { all[node.id] = true; (node.children || []).forEach(walk); }
    walk(scenario.tree);
    setExpanded(all);
  };

  const collapseAll = () => {
    const all = {};
    function walk(node) { all[node.id] = false; (node.children || []).forEach(walk); }
    walk(scenario.tree);
    setExpanded(all);
  };

  try {
    return (
      <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, margin: 0 }}>EV Decision Tree</h3>
            <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
              {scenario.board} — Pot: {scenario.pot}bb
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={expandAll} style={{
              padding: '4px 8px', borderRadius: 4, border: 'none', cursor: 'pointer',
              background: 'rgba(255,255,255,0.06)', color: '#94a3b8', fontSize: 10, fontWeight: 600,
            }}>Expand All</button>
            <button onClick={collapseAll} style={{
              padding: '4px 8px', borderRadius: 4, border: 'none', cursor: 'pointer',
              background: 'rgba(255,255,255,0.06)', color: '#94a3b8', fontSize: 10, fontWeight: 600,
            }}>Collapse</button>
          </div>
        </div>

        {/* Scenario selector */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {SCENARIOS.map((s, i) => (
            <button key={s.id} onClick={() => { setSelectedScenario(i); setExpanded({}); }} style={{
              padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: selectedScenario === i ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
              color: selectedScenario === i ? '#3b82f6' : '#94a3b8',
              fontSize: 11, fontWeight: 600,
              border: selectedScenario === i ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
            }}>{s.label}</button>
          ))}
        </div>

        {/* Stats */}
        <NodeStats tree={scenario.tree} />

        {/* Legend */}
        <div style={{ display: 'flex', gap: 12, margin: '12px 0', flexWrap: 'wrap' }}>
          {[
            { color: '#ef4444', label: 'Bet/Raise' },
            { color: '#22c55e', label: 'Call' },
            { color: '#3b82f6', label: 'Fold' },
            { color: '#94a3b8', label: 'Check' },
          ].map((l, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: l.color }} />
              <span style={{ color: '#64748b', fontSize: 9 }}>{l.label}</span>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ padding: '1px 4px', borderRadius: 2, fontSize: 7, fontWeight: 700, background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>GTO</span>
            <span style={{ color: '#64748b', fontSize: 9 }}>= Optimal path</span>
          </div>
        </div>

        {/* Tree */}
        <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 8, padding: 12 }}>
          <TreeNodeView node={scenario.tree} depth={0} expanded={expanded} toggleExpand={toggleExpand} />
        </div>
      </div>
    );
  } catch (err) {
    return (
      <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
        <h3 style={{ color: '#f1f5f9', fontSize: 18, margin: 0 }}>EV Decision Tree</h3>
        <p style={{ color: '#64748b', fontSize: 13 }}>Component loading... Please refresh if this persists.</p>
      </div>
    );
  }
}
