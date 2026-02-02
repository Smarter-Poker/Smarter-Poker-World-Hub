/* ═══════════════════════════════════════════════════════════════════════════
   JARVIS ADVANCED TOOLBAR — All Phases 3-10+ tools in one toolbar
   Expanded with Phase 2 features: HandHistoryLibrary, PreflopCharts, ICMCalculator, etc.
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState } from 'react';
import { RangeVisualizer } from './RangeVisualizer';
import { EquityCalculator } from './EquityCalculator';
import { HandDiagram } from './HandDiagram';
import { PokerQuiz } from './PokerQuiz';
import { ScreenshotAnalyzer } from './ScreenshotAnalyzer';
import { HandHistoryParser } from './HandHistoryParser';
import { CustomRangeBuilder } from './CustomRangeBuilder';
import { ExportConversation } from './ExportConversation';
import { SessionCoach } from './SessionCoach';
import { OpponentProfiler } from './OpponentProfiler';
import { TournamentAdvisor } from './TournamentAdvisor';
import { MultiStreetPlanner } from './MultiStreetPlanner';
import { AIDebateMode } from './AIDebateMode';
import { TrainingProgressTracker } from './TrainingProgressTracker';
import { PioInsights } from './PioInsights';
// Phase 2 New Tools
import { HandHistoryLibrary } from './HandHistoryLibrary';
import { PreflopCharts } from './PreflopCharts';
import { ICMCalculator } from './ICMCalculator';
import { QuickReference } from './QuickReference';
import { DrillMode } from './DrillMode';
import { GoalTracker } from './GoalTracker';
import { TiltJournal } from './TiltJournal';
import { StudyPlanAI } from './StudyPlanAI';
import { SessionSummary } from './SessionSummary';
import { BankrollSync } from './BankrollSync';

interface Message {
    id: string;
    content: string;
    isUser: boolean;
    timestamp: Date;
}

interface JarvisAdvancedToolbarProps {
    messages: Message[];
    onAskQuestion: (question: string) => void;
    onScreenshotAnalysis?: (analysis: string) => void;
}

type ToolId =
    | 'range' | 'equity' | 'hand' | 'quiz'
    | 'screenshot' | 'history' | 'builder' | 'export'
    | 'session' | 'opponent' | 'tournament' | 'planner' | 'debate'
    | 'training' | 'pio'
    // Phase 2 tools
    | 'library' | 'preflop' | 'icm' | 'reference' | 'drill' | 'goals' | 'tilt' | 'study' | 'recap' | 'bankroll'
    | null;

const TOOLS = [
    // Row 1: Core Analysis
    { id: 'range' as ToolId, icon: '📊', label: 'Ranges', category: 'Analysis' },
    { id: 'equity' as ToolId, icon: '🎯', label: 'Equity', category: 'Analysis' },
    { id: 'hand' as ToolId, icon: '🃏', label: 'Hand', category: 'Analysis' },
    { id: 'quiz' as ToolId, icon: '🧠', label: 'Quiz', category: 'Training' },
    // Row 2: Import/Export
    { id: 'screenshot' as ToolId, icon: '📸', label: 'Screenshot', category: 'Import' },
    { id: 'history' as ToolId, icon: '📜', label: 'History', category: 'Import' },
    { id: 'builder' as ToolId, icon: '✏️', label: 'Builder', category: 'Tools' },
    { id: 'export' as ToolId, icon: '📤', label: 'Export', category: 'Share' },
    // Row 3: Advanced (Phase 9)
    { id: 'session' as ToolId, icon: '⏱️', label: 'Session', category: 'Live' },
    { id: 'opponent' as ToolId, icon: '🎭', label: 'Opponent', category: 'Profiling' },
    { id: 'tournament' as ToolId, icon: '🏆', label: 'MTT', category: 'Tournament' },
    { id: 'planner' as ToolId, icon: '📋', label: 'Planner', category: 'Strategy' },
    { id: 'debate' as ToolId, icon: '⚔️', label: 'Debate', category: 'AI' },
    // Row 4: Training Integration (Phase 5)
    { id: 'training' as ToolId, icon: '📈', label: 'Progress', category: 'Training' },
    { id: 'pio' as ToolId, icon: '🧮', label: 'PIO', category: 'GTO' },
    // Row 5: Phase 2 New Tools
    { id: 'library' as ToolId, icon: '📚', label: 'Library', category: 'History' },
    { id: 'preflop' as ToolId, icon: '🎲', label: 'Preflop', category: 'Charts' },
    { id: 'icm' as ToolId, icon: '⚖️', label: 'ICM', category: 'Tournament' },
    { id: 'reference' as ToolId, icon: '📋', label: 'Cheat Sheet', category: 'Reference' },
    { id: 'drill' as ToolId, icon: '🔥', label: 'Drill', category: 'Training' },
    { id: 'goals' as ToolId, icon: '🎯', label: 'Goals', category: 'Progress' },
    { id: 'tilt' as ToolId, icon: '😤', label: 'Tilt', category: 'Mental' },
    { id: 'study' as ToolId, icon: '📖', label: 'Study Plan', category: 'Learning' },
    { id: 'recap' as ToolId, icon: '📝', label: 'Recap', category: 'Session' },
    { id: 'bankroll' as ToolId, icon: '💰', label: 'Bankroll', category: 'Money' }
];

export function JarvisAdvancedToolbar({
    messages,
    onAskQuestion,
    onScreenshotAnalysis
}: JarvisAdvancedToolbarProps) {
    const [activeTool, setActiveTool] = useState<ToolId>(null);
    const [showAllTools, setShowAllTools] = useState(false);

    const visibleTools = showAllTools ? TOOLS : TOOLS.slice(0, 4);

    const handleAnalysis = (analysis: string) => {
        onScreenshotAnalysis?.(analysis);
        setActiveTool(null);
    };

    return (
        <div style={{ position: 'relative' }}>
            {/* Toolbar */}
            <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '4px',
                padding: '8px 12px',
                borderTop: '1px solid rgba(255, 215, 0, 0.1)',
                background: 'rgba(0, 0, 0, 0.2)'
            }}>
                <span style={{
                    fontSize: '10px',
                    color: 'rgba(255, 215, 0, 0.5)',
                    alignSelf: 'center',
                    marginRight: '4px'
                }}>
                    Tools:
                </span>

                {visibleTools.map(tool => (
                    <button
                        key={tool.id}
                        onClick={() => setActiveTool(activeTool === tool.id ? null : tool.id)}
                        style={{
                            padding: '5px 8px',
                            background: activeTool === tool.id
                                ? 'rgba(255, 215, 0, 0.2)'
                                : 'rgba(255, 215, 0, 0.05)',
                            border: activeTool === tool.id
                                ? '1px solid rgba(255, 215, 0, 0.4)'
                                : '1px solid rgba(255, 215, 0, 0.15)',
                            borderRadius: '6px',
                            color: activeTool === tool.id ? '#FFD700' : 'rgba(255, 255, 255, 0.7)',
                            fontSize: '10px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '3px',
                            transition: 'all 0.15s ease'
                        }}
                        title={tool.label}
                    >
                        <span>{tool.icon}</span>
                        <span>{tool.label}</span>
                    </button>
                ))}

                {/* Show More/Less */}
                <button
                    onClick={() => setShowAllTools(!showAllTools)}
                    style={{
                        padding: '5px 8px',
                        background: 'rgba(255, 215, 0, 0.05)',
                        border: '1px solid rgba(255, 215, 0, 0.15)',
                        borderRadius: '6px',
                        color: 'rgba(255, 215, 0, 0.7)',
                        fontSize: '10px',
                        cursor: 'pointer'
                    }}
                >
                    {showAllTools ? '◀ Less' : '▶ More'}
                </button>
            </div>

            {/* Active Tool Panel */}
            {activeTool && (
                <div style={{
                    position: 'absolute',
                    bottom: '100%',
                    left: '12px',
                    right: '12px',
                    marginBottom: '8px',
                    zIndex: 100,
                    maxHeight: '60vh',
                    overflowY: 'auto'
                }}>
                    {activeTool === 'range' && (
                        <RangeVisualizer onClose={() => setActiveTool(null)} />
                    )}
                    {activeTool === 'equity' && (
                        <EquityCalculator onClose={() => setActiveTool(null)} />
                    )}
                    {activeTool === 'hand' && (
                        <HandDiagram
                            board={['As', 'Kh', 'Qd']}
                            heroCards={['Ah', 'Kd']}
                            heroPosition="BTN"
                            villainPosition="BB"
                            potSize={150}
                            action="Hero bets $100"
                            onClose={() => setActiveTool(null)}
                        />
                    )}
                    {activeTool === 'quiz' && (
                        <PokerQuiz
                            onClose={() => setActiveTool(null)}
                            onEarnDiamonds={(amount) => console.log(`Earned ${amount} diamonds!`)}
                        />
                    )}
                    {activeTool === 'screenshot' && (
                        <ScreenshotAnalyzer
                            onAnalysis={handleAnalysis}
                            onClose={() => setActiveTool(null)}
                        />
                    )}
                    {activeTool === 'history' && (
                        <HandHistoryParser
                            onHandParsed={onAskQuestion}
                            onClose={() => setActiveTool(null)}
                        />
                    )}
                    {activeTool === 'builder' && (
                        <CustomRangeBuilder
                            onAskJarvis={onAskQuestion}
                            onClose={() => setActiveTool(null)}
                        />
                    )}
                    {activeTool === 'export' && (
                        <ExportConversation
                            messages={messages}
                            onClose={() => setActiveTool(null)}
                        />
                    )}
                    {activeTool === 'session' && (
                        <SessionCoach
                            onAskQuestion={onAskQuestion}
                            onClose={() => setActiveTool(null)}
                        />
                    )}
                    {activeTool === 'opponent' && (
                        <OpponentProfiler
                            onAskJarvis={onAskQuestion}
                            onClose={() => setActiveTool(null)}
                        />
                    )}
                    {activeTool === 'tournament' && (
                        <TournamentAdvisor
                            onAskJarvis={onAskQuestion}
                            onClose={() => setActiveTool(null)}
                        />
                    )}
                    {activeTool === 'planner' && (
                        <MultiStreetPlanner
                            onAskJarvis={onAskQuestion}
                            onClose={() => setActiveTool(null)}
                        />
                    )}
                    {activeTool === 'debate' && (
                        <AIDebateMode
                            onAskJarvis={onAskQuestion}
                            onClose={() => setActiveTool(null)}
                        />
                    )}
                    {activeTool === 'training' && (
                        <TrainingProgressTracker
                            onAskJarvis={onAskQuestion}
                            onClose={() => setActiveTool(null)}
                        />
                    )}
                    {activeTool === 'pio' && (
                        <PioInsights
                            onAskJarvis={onAskQuestion}
                            onClose={() => setActiveTool(null)}
                        />
                    )}
                    {/* Phase 2 New Tools */}
                    {activeTool === 'library' && (
                        <HandHistoryLibrary
                            onAskJarvis={onAskQuestion}
                            onClose={() => setActiveTool(null)}
                        />
                    )}
                    {activeTool === 'preflop' && (
                        <PreflopCharts
                            onAskJarvis={onAskQuestion}
                            onClose={() => setActiveTool(null)}
                        />
                    )}
                    {activeTool === 'icm' && (
                        <ICMCalculator
                            onAskJarvis={onAskQuestion}
                            onClose={() => setActiveTool(null)}
                        />
                    )}
                    {activeTool === 'reference' && (
                        <QuickReference
                            onAskJarvis={onAskQuestion}
                            onClose={() => setActiveTool(null)}
                        />
                    )}
                    {activeTool === 'drill' && (
                        <DrillMode
                            onAskJarvis={onAskQuestion}
                            onClose={() => setActiveTool(null)}
                        />
                    )}
                    {activeTool === 'goals' && (
                        <GoalTracker
                            onAskJarvis={onAskQuestion}
                            onClose={() => setActiveTool(null)}
                        />
                    )}
                    {activeTool === 'tilt' && (
                        <TiltJournal
                            onAskJarvis={onAskQuestion}
                            onClose={() => setActiveTool(null)}
                        />
                    )}
                    {activeTool === 'study' && (
                        <StudyPlanAI
                            onAskJarvis={onAskQuestion}
                            onClose={() => setActiveTool(null)}
                        />
                    )}
                    {activeTool === 'recap' && (
                        <SessionSummary
                            onAskJarvis={onAskQuestion}
                            onClose={() => setActiveTool(null)}
                        />
                    )}
                    {activeTool === 'bankroll' && (
                        <BankrollSync
                            onAskJarvis={onAskQuestion}
                            onClose={() => setActiveTool(null)}
                        />
                    )}
                </div>
            )}
        </div>
    );
}
