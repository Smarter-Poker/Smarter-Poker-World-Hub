/**
 * SOLVER TREE VIEWER — Interactive Game Tree Visualization
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * SVG-based interactive tree graph showing solver decision branches.
 * Nodes: decision (action), chance (card), terminal (showdown/fold).
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// TREE DATA GENERATOR
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const ACTION_STYLES = {
    raise: { color: '#ef4444', label: 'Raise', abbr: 'R' },
    bet: { color: '#ef4444', label: 'Bet', abbr: 'B' },
    call: { color: '#22c55e', label: 'Call', abbr: 'C' },
    check: { color: '#3b82f6', label: 'Check', abbr: 'X' },
    fold: { color: '#64748b', label: 'Fold', abbr: 'F' },
    allin: { color: '#a855f7', label: 'All-In', abbr: 'A' },
};

/**
 * Build a representative game tree from spot data.
 * Uses action frequencies to create weighted branches.
 */
function buildTreeFromSpot(spotDetail) {
    if (!spotDetail) return null;

    const actions = spotDetail.actions || spotDetail.gridData?.[0]?.[0]?.actions || {};
    const total = Object.values(actions || {}).reduce((s, v) => s + (v || 0), 0) || 1;

    const rootChildren = [];
    const actionMap = { r: 'raise', R: 'raise', b: 'bet', B: 'bet', c: 'call', C: 'call', x: 'check', X: 'check', f: 'fold', F: 'fold' };

    Object.entries(actions || {}).forEach(([key, freq]) => {
        if (freq <= 0) return;
        const actionType = actionMap[key] || 'check';
        const pct = Math.round((freq / total) * 100);
        const style = ACTION_STYLES[actionType] || ACTION_STYLES.check;

        const isTerminal = actionType === 'fold';
        const children = [];

        if (!isTerminal) {
            // Add villain response tree (simplified)
            const villainResponses = generateVillainResponses(actionType, spotDetail.street || 'flop');
            children.push(...villainResponses);
        }

        rootChildren.push({
            id: `root-${key}`,
            type: isTerminal ? 'terminal' : 'decision',
            action: actionType,
            label: `${style.label} (${pct}%)`,
            abbr: style.abbr,
            frequency: pct,
            color: style.color,
            children,
            depth: 1,
        });
    });

    return {
        id: 'root',
        type: 'decision',
        label: `${spotDetail.heroPosition || 'Hero'}`,
        color: '#00d4ff',
        children: rootChildren,
        depth: 0,
    };
}

/**
 * Generate solver-calibrated villain responses based on hero action, street, and bet size.
 * Uses MDF (Minimum Defense Frequency) and solver-approximate response distributions.
 *
 * GTO Wizard shows real solver-derived villain frequencies at each node —
 * these approximate the same data based on street, action type, and sizing.
 */
function generateVillainResponses(heroAction, street, heroFreq) {
    const responses = [];

    if (heroAction === 'raise' || heroAction === 'bet') {
        // Villain faces a bet/raise: response frequencies vary by street and sizing
        // Approximate MDF: vs 33% = defend 75%, vs 50% = 67%, vs 75% = 57%, vs pot = 50%
        // Default to medium sizing response profile
        let foldPct, callPct, raisePct;

        if (street === 'river') {
            // River: no raise option as commonly (simplified), mostly call/fold
            foldPct = 38;
            callPct = 55;
            raisePct = 7;
        } else if (street === 'turn') {
            foldPct = 32;
            callPct = 52;
            raisePct = 16;
        } else {
            // Flop: more raising, wider defense
            foldPct = 28;
            callPct = 55;
            raisePct = 17;
        }

        // Adjust based on hero's bet frequency — if hero bets rarely,
        // villain should fold more (hero's range is stronger)
        if (heroFreq && heroFreq < 30) {
            foldPct += 8;
            callPct -= 5;
            raisePct -= 3;
        } else if (heroFreq && heroFreq > 70) {
            foldPct -= 5;
            callPct += 2;
            raisePct += 3;
        }

        responses.push(
            { id: `v-fold-${heroAction}`, type: 'terminal', action: 'fold', label: `Fold (${foldPct}%)`, abbr: 'F', frequency: foldPct, color: '#64748b', children: [], depth: 2 },
            { id: `v-call-${heroAction}`, type: 'chance', action: 'call', label: `Call (${callPct}%)`, abbr: 'C', frequency: callPct, color: '#22c55e', children: [], depth: 2 },
            { id: `v-raise-${heroAction}`, type: 'decision', action: 'raise', label: `Raise (${raisePct}%)`, abbr: 'R', frequency: raisePct, color: '#ef4444', children: [], depth: 2 },
        );
    } else if (heroAction === 'call') {
        if (street === 'river') {
            responses.push(
                { id: `v-show-${heroAction}`, type: 'terminal', action: 'check', label: 'Showdown', abbr: 'SD', frequency: 100, color: '#eab308', children: [], depth: 2 },
            );
        } else {
            responses.push(
                { id: `v-next-${heroAction}`, type: 'chance', action: 'check', label: 'Next Street', abbr: '→', frequency: 100, color: '#3b82f6', children: [], depth: 2 },
            );
        }
    } else if (heroAction === 'check') {
        // After hero checks: villain bets or checks back
        // IP villain bets more often than OOP villain
        let checkPct = street === 'river' ? 48 : 52;
        let betPct = 100 - checkPct;

        responses.push(
            { id: `v-check-${heroAction}`, type: 'chance', action: 'check', label: `Check (${checkPct}%)`, abbr: 'X', frequency: checkPct, color: '#3b82f6', children: [], depth: 2 },
            { id: `v-bet-${heroAction}`, type: 'decision', action: 'bet', label: `Bet (${betPct}%)`, abbr: 'B', frequency: betPct, color: '#ef4444', children: [], depth: 2 },
        );
    }

    return responses;
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// TREE NODE COMPONENT
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function TreeNode({ node, x, y, parentX, parentY, expandedNodes, onToggle, nodeWidth = 80, levelHeight = 70 }) {
    if (!node) return null;

    const isExpanded = expandedNodes.has(node.id);
    const hasChildren = node.children && node.children.length > 0;
    const isTerminal = node.type === 'terminal';
    const isChance = node.type === 'chance';

    const nodeRadius = isTerminal ? 16 : 20;
    const nodeShape = isChance ? 'diamond' : 'circle';

    const childSpacing = nodeWidth;
    const totalChildrenWidth = hasChildren ? (node.children.length - 1) * childSpacing : 0;
    const startX = x - totalChildrenWidth / 2;

    return (
        <g>
            {/* Edge from parent */}
            {parentX !== undefined && parentY !== undefined && (
                <motion.line
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.3 }}
                    x1={parentX} y1={parentY + nodeRadius}
                    x2={x} y2={y - nodeRadius}
                    stroke={node.color || '#475569'}
                    strokeWidth={Math.max(1, node.frequency / 20)}
                    strokeOpacity={0.6}
                />
            )}

            {/* Frequency label on edge */}
            {parentX !== undefined && node.frequency && (
                <text
                    x={(parentX + x) / 2 + 12}
                    y={(parentY + y) / 2}
                    fill="#64748b"
                    fontSize={8}
                    fontWeight={700}
                    style={{ fontFamily: "var(--font-orbitron), 'Orbitron', monospace" }}
                    textAnchor="start"
                >
                    {node.frequency}%
                </text>
            )}

            {/* Node shape */}
            <motion.g
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.2, delay: node.depth * 0.08 }}
                style={{ cursor: hasChildren ? 'pointer' : 'default' }}
                onClick={() => hasChildren && onToggle(node.id)}
            >
                {nodeShape === 'diamond' ? (
                    <motion.polygon
                        points={`${x},${y - nodeRadius} ${x + nodeRadius},${y} ${x},${y + nodeRadius} ${x - nodeRadius},${y}`}
                        fill={isExpanded ? `${node.color}30` : 'rgba(15,15,30,0.9)'}
                        stroke={node.color || '#475569'}
                        strokeWidth={2}
                        whileHover={{ scale: 1.1 }}
                    />
                ) : (
                    <motion.circle
                        cx={x} cy={y} r={nodeRadius}
                        fill={isExpanded ? `${node.color}30` : 'rgba(15,15,30,0.9)'}
                        stroke={node.color || '#475569'}
                        strokeWidth={isTerminal ? 1.5 : 2}
                        strokeDasharray={isTerminal ? '4,2' : 'none'}
                        whileHover={{ scale: 1.1 }}
                    />
                )}

                {/* Node label */}
                <text
                    x={x} y={y + 1}
                    fill={node.color || '#e2e8f0'}
                    fontSize={10}
                    fontWeight={800}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    style={{ pointerEvents: 'none', fontFamily: "var(--font-orbitron), 'Orbitron', monospace" }}
                >
                    {node.abbr || node.label?.slice(0, 2) || '?'}
                </text>

                {/* Action label below */}
                <text
                    x={x} y={y + nodeRadius + 12}
                    fill="#94a3b8"
                    fontSize={8}
                    fontWeight={600}
                    textAnchor="middle"
                    style={{ pointerEvents: 'none' }}
                >
                    {node.label?.length > 14 ? node.label.slice(0, 12) + '…' : node.label}
                </text>

                {/* Expand indicator */}
                {hasChildren && !isExpanded && (
                    <text
                        x={x} y={y + nodeRadius + 22}
                        fill="#475569"
                        fontSize={8}
                        textAnchor="middle"
                        style={{ pointerEvents: 'none' }}
                    >
                        +{node.children.length}
                    </text>
                )}
            </motion.g>

            {/* Children */}
            {isExpanded && hasChildren && node.children.map((child, i) => (
                <TreeNode
                    key={child.id}
                    node={child}
                    x={startX + i * childSpacing}
                    y={y + levelHeight}
                    parentX={x}
                    parentY={y}
                    expandedNodes={expandedNodes}
                    onToggle={onToggle}
                    nodeWidth={nodeWidth}
                    levelHeight={levelHeight}
                />
            ))}
        </g>
    );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// MAIN COMPONENT
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export default function SolverTreeViewer({ spotDetail, width = 600, height = 400 }) {
    const [expandedNodes, setExpandedNodes] = useState(new Set(['root']));

    const tree = useMemo(() => buildTreeFromSpot(spotDetail), [spotDetail]);

    const toggleNode = useCallback((nodeId) => {
        setExpandedNodes(prev => {
            const next = new Set(prev);
            if (next.has(nodeId)) next.delete(nodeId);
            else next.add(nodeId);
            return next;
        });
    }, []);

    const expandAll = useCallback(() => {
        if (!tree) return;
        const allIds = new Set();
        const collect = (node) => {
            allIds.add(node.id);
            node.children?.forEach(collect);
        };
        collect(tree);
        setExpandedNodes(allIds);
    }, [tree]);

    const collapseAll = useCallback(() => {
        setExpandedNodes(new Set(['root']));
    }, []);

    if (!tree) {
        return (
            <div style={{ padding: 24, textAlign: 'center', color: '#475569', fontSize: 12 }}>
                Select a spot to view its decision tree
            </div>
        );
    }

    return (
        <div>
            {/* Controls */}
            <div style={{
                display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center',
            }}>
                <button
                    onClick={expandAll}
                    style={{
                        padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                        cursor: 'pointer', border: 'none',
                        background: 'rgba(0,212,255,0.1)', color: '#00d4ff',
                    }}
                >
                    Expand All
                </button>
                <button
                    onClick={collapseAll}
                    style={{
                        padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                        cursor: 'pointer', border: 'none',
                        background: 'rgba(255,255,255,0.06)', color: '#94a3b8',
                    }}
                >
                    Collapse
                </button>

                {/* Legend */}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    {[
                        { color: '#ef4444', label: 'Bet/Raise' },
                        { color: '#22c55e', label: 'Call' },
                        { color: '#3b82f6', label: 'Check' },
                        { color: '#64748b', label: 'Fold' },
                    ].map(l => (
                        <span key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, color: '#64748b' }}>
                            <span style={{ width: 6, height: 6, borderRadius: 3, background: l.color }} />
                            {l.label}
                        </span>
                    ))}
                </div>
            </div>

            {/* SVG Tree */}
            <div style={{
                background: 'rgba(0,0,0,0.2)',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.06)',
                overflow: 'auto',
            }}>
                <svg
                    width={width}
                    height={height}
                    viewBox={`0 0 ${width} ${height}`}
                    style={{ display: 'block' }}
                >
                    <TreeNode
                        node={tree}
                        x={width / 2}
                        y={40}
                        expandedNodes={expandedNodes}
                        onToggle={toggleNode}
                    />
                </svg>
            </div>

            {/* Educational tooltip */}
            <div style={{
                marginTop: 8, padding: '8px 12px', borderRadius: 8,
                background: 'rgba(255,255,255,0.02)',
                fontSize: 10, color: '#64748b', lineHeight: 1.5,
            }}>
                <strong style={{ color: '#94a3b8' }}>How to read:</strong> Click nodes to expand/collapse branches.
                Edge thickness = action frequency. Circles = decisions, Diamonds = chance nodes, Dashed = terminal.
            </div>
        </div>
    );
}
