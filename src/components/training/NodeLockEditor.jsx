/**
 * NODE LOCK EDITOR
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * GTO Wizard-style node locking — modify solver strategy at specific nodes:
 * - Visual game tree with clickable nodes
 * - Lock any node to a specific action/frequency
 * - See how downstream strategy changes
 * - Compare locked vs unlocked solver outputs
 * - Useful for studying exploitative adjustments
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useState, useCallback, useMemo } from 'react';

// ●●● SAMPLE GAME TREE ●●●
const DEFAULT_TREE = {
  id: 'root',
  street: 'Preflop',
  action: 'BTN opens 2.5x',
  player: 'BTN',
  children: [
    {
      id: 'bb_fold', street: 'Preflop', action: 'BB Folds', player: 'BB', freq: 55, ev: 0,
      locked: false, children: [],
    },
    {
      id: 'bb_call', street: 'Preflop', action: 'BB Calls', player: 'BB', freq: 35, ev: -0.3,
      locked: false,
      children: [
        {
          id: 'flop', street: 'Flop', action: 'Board: K♠ 8♦ 3♣', player: 'BOARD', children: [
            {
              id: 'bb_check', street: 'Flop', action: 'BB Checks', player: 'BB', freq: 100, ev: -0.4,
              locked: false,
              children: [
                { id: 'btn_bet33', street: 'Flop', action: 'BTN Bets 33%', player: 'BTN', freq: 45, ev: 0.6, locked: false, children: [
                  { id: 'bb_fold_f', street: 'Flop', action: 'BB Folds', player: 'BB', freq: 40, ev: 0, locked: false, children: [] },
                  { id: 'bb_call_f', street: 'Flop', action: 'BB Calls', player: 'BB', freq: 50, ev: -0.5, locked: false, children: [] },
                  { id: 'bb_raise_f', street: 'Flop', action: 'BB Raises', player: 'BB', freq: 10, ev: -0.2, locked: false, children: [] },
                ] },
                { id: 'btn_bet67', street: 'Flop', action: 'BTN Bets 67%', player: 'BTN', freq: 20, ev: 0.4, locked: false, children: [
                  { id: 'bb_fold_f2', street: 'Flop', action: 'BB Folds', player: 'BB', freq: 55, ev: 0, locked: false, children: [] },
                  { id: 'bb_call_f2', street: 'Flop', action: 'BB Calls', player: 'BB', freq: 40, ev: -0.7, locked: false, children: [] },
                  { id: 'bb_raise_f2', street: 'Flop', action: 'BB Raises', player: 'BB', freq: 5, ev: 0.3, locked: false, children: [] },
                ] },
                { id: 'btn_check', street: 'Flop', action: 'BTN Checks', player: 'BTN', freq: 35, ev: 0.1, locked: false, children: [] },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'bb_3bet', street: 'Preflop', action: 'BB 3-Bets', player: 'BB', freq: 10, ev: 0.8,
      locked: false, children: [
        { id: 'btn_fold_3b', street: 'Preflop', action: 'BTN Folds', player: 'BTN', freq: 55, ev: 0, locked: false, children: [] },
        { id: 'btn_call_3b', street: 'Preflop', action: 'BTN Calls', player: 'BTN', freq: 35, ev: -0.4, locked: false, children: [] },
        { id: 'btn_4bet', street: 'Preflop', action: 'BTN 4-Bets', player: 'BTN', freq: 10, ev: 1.2, locked: false, children: [] },
      ],
    },
  ],
};

// ●●● TREE NODE COMPONENT ●●●
function TreeNode({ node, depth, selectedNode, onSelect, locks, onToggleLock, onUpdateFreq }) {
  if (!node) return null;
  const isSelected = selectedNode === node.id;
  const isLocked = locks[node.id];
  const lockedFreq = locks[node.id]?.freq;
  const displayFreq = lockedFreq !== undefined ? lockedFreq : node.freq;
  const isBoard = node.player === 'BOARD';
  const playerColor = node.player === 'BTN' ? '#3b82f6' : node.player === 'BB' ? '#ef4444' : '#f59e0b';

  return (
    <div style={{ marginLeft: depth * 20 }}>
      <div
        onClick={() => onSelect(node.id)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
          marginBottom: 2, borderRadius: 6, cursor: 'pointer',
          background: isSelected ? 'rgba(59,130,246,0.15)' : isLocked ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.02)',
          border: isSelected ? '1px solid rgba(59,130,246,0.3)' : isLocked ? '1px solid rgba(245,158,11,0.2)' : '1px solid transparent',
          transition: 'all 0.15s',
        }}
      >
        {/* Lock indicator */}
        {isLocked && (
          <span style={{ color: '#f59e0b', fontSize: 10 }}>■</span>
        )}

        {/* Player badge */}
        {!isBoard && (
          <span style={{
            padding: '1px 5px', borderRadius: 3, background: `${playerColor}20`,
            color: playerColor, fontSize: 9, fontWeight: 700, minWidth: 28, textAlign: 'center',
          }}>
            {node.player}
          </span>
        )}

        {/* Action */}
        <span style={{
          color: isBoard ? '#f59e0b' : '#f1f5f9', fontSize: 12,
          fontWeight: isBoard ? 700 : 500, fontFamily: isBoard ? 'monospace' : 'inherit',
        }}>
          {node.action}
        </span>

        {/* Frequency */}
        {!isBoard && node.freq !== undefined && (
          <span style={{
            marginLeft: 'auto', color: isLocked ? '#f59e0b' : '#64748b',
            fontSize: 11, fontWeight: 600,
          }}>
            {displayFreq}%
          </span>
        )}

        {/* EV */}
        {node.ev !== undefined && !isBoard && (
          <span style={{
            color: node.ev >= 0 ? '#22c55e' : '#ef4444',
            fontSize: 10, fontWeight: 600, minWidth: 40, textAlign: 'right',
          }}>
            {node.ev >= 0 ? '+' : ''}{node.ev.toFixed(1)}
          </span>
        )}
      </div>

      {/* Children */}
      {node.children?.map(child => (
        <TreeNode key={child.id} node={child} depth={depth + 1}
          selectedNode={selectedNode} onSelect={onSelect}
          locks={locks} onToggleLock={onToggleLock} onUpdateFreq={onUpdateFreq} />
      ))}
    </div>
  );
}

// ●●● MAIN COMPONENT ●●●
export default function NodeLockEditor() {
  const [selectedNode, setSelectedNode] = useState(null);
  const [locks, setLocks] = useState({});
  const [tree] = useState(DEFAULT_TREE);

  const findNode = useCallback((node, id) => {
    if (node.id === id) return node;
    for (const child of (node.children || [])) {
      const found = findNode(child, id);
      if (found) return found;
    }
    return null;
  }, []);

  const selected = selectedNode ? findNode(tree, selectedNode) : null;

  const toggleLock = useCallback((nodeId) => {
    setLocks(prev => {
      if (prev[nodeId]) {
        const next = { ...prev };
        delete next[nodeId];
        return next;
      }
      const node = findNode(tree, nodeId);
      return { ...prev, [nodeId]: { freq: node?.freq || 50, action: node?.action } };
    });
  }, [tree, findNode]);

  const updateLockedFreq = useCallback((nodeId, freq) => {
    setLocks(prev => ({
      ...prev,
      [nodeId]: { ...prev[nodeId], freq: Math.max(0, Math.min(100, freq)) },
    }));
  }, []);

  const lockCount = Object.keys(locks || {}).length;

  return (
    <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, margin: 0 }}>
          Node Lock Editor
        </h3>
        {lockCount > 0 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ color: '#f59e0b', fontSize: 12, fontWeight: 600 }}>
              {lockCount} node{lockCount !== 1 ? 's' : ''} locked
            </span>
            <button onClick={() => setLocks({})} style={{
              padding: '4px 10px', borderRadius: 4, border: 'none', cursor: 'pointer',
              background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontSize: 11, fontWeight: 600,
            }}>
              Unlock All
            </button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 16 }}>
        {/* ●●● GAME TREE ●●● */}
        <div style={{ flex: '1 1 400px', maxHeight: 500, overflowY: 'auto' }}>
          <div style={{ color: '#64748b', fontSize: 11, fontWeight: 600, marginBottom: 8, textTransform: 'uppercase' }}>
            Game Tree — BTN vs BB SRP (K♠ 8♦ 3♣)
          </div>
          <TreeNode node={tree} depth={0} selectedNode={selectedNode} onSelect={setSelectedNode}
            locks={locks} onToggleLock={toggleLock} onUpdateFreq={updateLockedFreq} />
        </div>

        {/* ●●● NODE DETAIL PANEL ●●● */}
        <div style={{ flex: '0 0 240px' }}>
          {selected ? (
            <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 12 }}>
              <div style={{ color: '#f1f5f9', fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
                {selected.action}
              </div>

              {selected.player !== 'BOARD' && (
                <>
                  {/* Current frequency */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ color: '#64748b', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>
                      Frequency
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="range" min={0} max={100}
                        value={locks[selected.id]?.freq ?? selected.freq ?? 50}
                        onChange={(e) => {
                          if (!locks[selected.id]) toggleLock(selected.id);
                          updateLockedFreq(selected.id, parseInt(e.target.value));
                        }}
                        style={{ flex: 1, accentColor: locks[selected.id] ? '#f59e0b' : '#3b82f6' }}
                      />
                      <span style={{
                        color: locks[selected.id] ? '#f59e0b' : '#f1f5f9',
                        fontSize: 16, fontWeight: 800, minWidth: 40, textAlign: 'right',
                      }}>
                        {locks[selected.id]?.freq ?? selected.freq ?? 50}%
                      </span>
                    </div>
                    {locks[selected.id] && selected.freq !== undefined && (
                      <div style={{ color: '#64748b', fontSize: 10, marginTop: 4 }}>
                        GTO: {selected.freq}% → Locked: {locks[selected.id].freq}%
                        <span style={{
                          marginLeft: 4,
                          color: locks[selected.id].freq > selected.freq ? '#22c55e' : '#ef4444',
                        }}>
                          ({locks[selected.id].freq > selected.freq ? '+' : ''}{locks[selected.id].freq - selected.freq}%)
                        </span>
                      </div>
                    )}
                  </div>

                  {/* EV */}
                  {selected.ev !== undefined && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ color: '#64748b', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>
                        Expected Value
                      </div>
                      <div style={{
                        color: selected.ev >= 0 ? '#22c55e' : '#ef4444',
                        fontSize: 20, fontWeight: 800,
                      }}>
                        {selected.ev >= 0 ? '+' : ''}{selected.ev.toFixed(2)} bb
                      </div>
                    </div>
                  )}

                  {/* Lock/Unlock button */}
                  <button onClick={() => toggleLock(selected.id)} style={{
                    width: '100%', padding: '8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                    background: locks[selected.id] ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                    color: locks[selected.id] ? '#ef4444' : '#f59e0b',
                    fontSize: 12, fontWeight: 700,
                  }}>
                    {locks[selected.id] ? 'Unlock Node' : 'Lock Node'}
                  </button>

                  {/* Quick lock presets */}
                  {locks[selected.id] && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ color: '#64748b', fontSize: 10, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase' }}>
                        Quick Set
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {[0, 25, 50, 75, 100].map(f => (
                          <button key={f} onClick={() => updateLockedFreq(selected.id, f)} style={{
                            flex: 1, padding: '4px', borderRadius: 4, border: 'none', cursor: 'pointer',
                            background: locks[selected.id]?.freq === f ? '#f59e0b' : 'rgba(255,255,255,0.06)',
                            color: locks[selected.id]?.freq === f ? '#000' : '#94a3b8',
                            fontSize: 10, fontWeight: 700,
                          }}>
                            {f}%
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Node path */}
              <div style={{ marginTop: 12, padding: '8px', borderRadius: 4, background: 'rgba(255,255,255,0.03)' }}>
                <div style={{ color: '#64748b', fontSize: 9, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Info</div>
                <div style={{ color: '#94a3b8', fontSize: 10 }}>Player: {selected.player}</div>
                <div style={{ color: '#94a3b8', fontSize: 10 }}>Street: {selected.street}</div>
                <div style={{ color: '#94a3b8', fontSize: 10 }}>Node ID: {selected.id}</div>
              </div>
            </div>
          ) : (
            <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 8, padding: 16, textAlign: 'center' }}>
              <div style={{ color: '#475569', fontSize: 13, marginBottom: 8 }}>Select a node</div>
              <div style={{ color: '#334155', fontSize: 11 }}>
                Click any action in the game tree to view details and lock frequencies.
              </div>
            </div>
          )}

          {/* Instructions */}
          <div style={{ marginTop: 12, background: 'rgba(0,0,0,0.1)', borderRadius: 6, padding: 8 }}>
            <div style={{ color: '#64748b', fontSize: 9, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>How It Works</div>
            <div style={{ color: '#475569', fontSize: 10, lineHeight: 1.5 }}>
              Lock a node to force a specific frequency. The solver recalculates downstream strategies to exploit the locked deviation. Use this to study how opponents deviate from GTO.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
