/**
 * Memory Campaign View - Level Selection Interface
 * Visual "Campaign Map" for unlocking and playing memory training levels
 */

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import MemoryGameClient from './MemoryGameClient';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface Chart {
    id: string;
    chart_name: string;
    category: string;
    position?: string;
    stack_depth?: number;
    topology?: string;
    created_at: string;
}

interface LevelProgress {
    chart_id: string;
    best_accuracy: number;
    is_unlocked: boolean;
    times_played: number;
    last_played_at?: string;
}

interface LevelCard {
    chart: Chart;
    levelIndex: number;
    isUnlocked: boolean;
    isMastered: boolean;
    bestAccuracy: number;
    timesPlayed: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function MemoryCampaignView() {
    const [levels, setLevels] = useState<LevelCard[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeLevel, setActiveLevel] = useState<LevelCard | null>(null);
    const [userId, setUserId] = useState<string | null>(null);

    useEffect(() => {
        initializeUser();
    }, []);

    const initializeUser = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            setUserId(user.id);
            loadCampaignData(user.id);
        } else {
            setLoading(false);
        }
    };

    const loadCampaignData = async (uid: string) => {
        setLoading(true);

        // Fetch all charts
        const { data: charts, error: chartsError } = await supabase
            .from('memory_charts_gold')
            .select('*');

        if (chartsError) {
            console.error('Failed to load charts:', chartsError);
            setLoading(false);
            return;
        }

        // Sort by stack_depth descending, then by hero_position (UTG -> BTN)
        const positionOrder = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
        const sortedCharts = charts?.sort((a, b) => {
            // Primary sort: stack_depth descending
            const stackDiff = (b.stack_depth || 0) - (a.stack_depth || 0);
            if (stackDiff !== 0) return stackDiff;

            // Secondary sort: hero_position (UTG -> BTN)
            const posA = positionOrder.indexOf(a.hero_position || a.position || '');
            const posB = positionOrder.indexOf(b.hero_position || b.position || '');
            return posA - posB;
        }) || [];

        // Fetch user progress
        const { data: progressData, error: progressError } = await supabase
            .from('user_level_progress')
            .select('*')
            .eq('user_id', uid);

        // Create progress map
        const progressMap = new Map<string, LevelProgress>();
        if (progressData && !progressError) {
            progressData.forEach((p: any) => {
                progressMap.set(p.chart_id, {
                    chart_id: p.chart_id,
                    best_accuracy: p.best_accuracy || 0,
                    is_unlocked: p.is_unlocked || false,
                    times_played: p.times_played || 0,
                    last_played_at: p.last_played_at,
                });
            });
        }

        // Build level cards with unlock logic
        const levelCards: LevelCard[] = [];
        sortedCharts.forEach((chart, index) => {
            const progress = progressMap.get(chart.id);
            const prevProgress = index > 0 ? progressMap.get(sortedCharts[index - 1].id) : null;

            // Level 1 is always unlocked
            // Level N is unlocked if Level N-1 has is_unlocked=true OR best_accuracy >= 85%
            const isUnlocked = index === 0
                ? true
                : (prevProgress?.is_unlocked || (prevProgress?.best_accuracy || 0) >= 0.85);

            // Calculate pass threshold for this level
            const passThreshold = Math.min(100, 85 + (index * 2)) / 100;
            const isMastered = (progress?.best_accuracy || 0) >= passThreshold;

            levelCards.push({
                chart,
                levelIndex: index,
                isUnlocked,
                isMastered,
                bestAccuracy: progress?.best_accuracy || 0,
                timesPlayed: progress?.times_played || 0,
            });
        });

        setLevels(levelCards);
        setLoading(false);
    };

    const handleLevelClick = (level: LevelCard) => {
        if (level.isUnlocked) {
            setActiveLevel(level);
        }
    };

    const handleLevelComplete = async (passed: boolean, accuracy: number) => {
        if (!activeLevel || !userId) return;

        // Update user progress in database
        const passThreshold = Math.min(100, 85 + (activeLevel.levelIndex * 2)) / 100;
        const shouldUnlock = passed && accuracy >= passThreshold;

        await supabase
            .from('user_level_progress')
            .upsert({
                user_id: userId,
                chart_id: activeLevel.chart.id,
                best_accuracy: Math.max(activeLevel.bestAccuracy, accuracy),
                is_unlocked: shouldUnlock,
                times_played: activeLevel.timesPlayed + 1,
                last_played_at: new Date().toISOString(),
            });

        // Reload campaign data
        loadCampaignData(userId);

        // Close game client
        setActiveLevel(null);
    };

    const handleExitGame = () => {
        setActiveLevel(null);
    };

    // ═══════════════════════════════════════════════════════════════════════
    // RENDER: GAME CLIENT (MODAL)
    // ═══════════════════════════════════════════════════════════════════════

    if (activeLevel) {
        return (
            <MemoryGameClient
                chartId={activeLevel.chart.id}
                levelIndex={activeLevel.levelIndex}
                onExit={handleExitGame}
                onLevelComplete={handleLevelComplete}
            />
        );
    }

    // ═══════════════════════════════════════════════════════════════════════
    // RENDER: CAMPAIGN MAP
    // ═══════════════════════════════════════════════════════════════════════

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
                <div className="text-center">
                    <div className="text-6xl mb-6 animate-pulse">🧠</div>
                    <h1 className="text-4xl font-black text-white mb-4">Loading Campaign...</h1>
                    <div className="text-purple-400">Preparing your training path</div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white p-8">
            {/* Header */}
            <div className="max-w-6xl mx-auto mb-12">
                <div className="text-center mb-8">
                    <h1 className="text-5xl font-black mb-4 bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
                        Memory Matrix Campaign
                    </h1>
                    <p className="text-xl text-slate-400">
                        Master GTO preflop ranges • Progress through {levels.length} levels
                    </p>
                </div>

                {/* Progress Stats */}
                <div className="flex justify-center gap-8 mb-8">
                    <div className="bg-slate-800/50 rounded-lg px-6 py-3 border border-slate-700">
                        <div className="text-sm text-slate-400">Levels Unlocked</div>
                        <div className="text-2xl font-bold text-cyan-400">
                            {levels.filter(l => l.isUnlocked).length}/{levels.length}
                        </div>
                    </div>
                    <div className="bg-slate-800/50 rounded-lg px-6 py-3 border border-slate-700">
                        <div className="text-sm text-slate-400">Levels Mastered</div>
                        <div className="text-2xl font-bold text-yellow-400">
                            {levels.filter(l => l.isMastered).length}/{levels.length}
                        </div>
                    </div>
                </div>
            </div>

            {/* Level Grid */}
            <div className="max-w-6xl mx-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {levels.map((level) => {
                        const passThreshold = Math.min(100, 85 + (level.levelIndex * 2));

                        return (
                            <div
                                key={level.chart.id}
                                onClick={() => handleLevelClick(level)}
                                className={`
                                    relative rounded-xl p-6 border-2 transition-all duration-300
                                    ${level.isMastered
                                        ? 'bg-gradient-to-br from-yellow-900/30 to-slate-800/30 border-yellow-500 shadow-lg shadow-yellow-500/20'
                                        : level.isUnlocked
                                            ? 'bg-gradient-to-br from-cyan-900/30 to-slate-800/30 border-cyan-500 hover:scale-105 hover:shadow-xl hover:shadow-cyan-500/30 cursor-pointer animate-pulse'
                                            : 'bg-slate-800/20 border-slate-700 opacity-50 cursor-not-allowed'
                                    }
                                `}
                            >
                                {/* Level Number Badge */}
                                <div className={`
                                    absolute -top-3 -left-3 w-12 h-12 rounded-full flex items-center justify-center font-black text-lg border-2
                                    ${level.isMastered
                                        ? 'bg-yellow-500 border-yellow-400 text-slate-900'
                                        : level.isUnlocked
                                            ? 'bg-cyan-500 border-cyan-400 text-slate-900'
                                            : 'bg-slate-700 border-slate-600 text-slate-400'
                                    }
                                `}>
                                    {level.levelIndex + 1}
                                </div>

                                {/* Status Icon */}
                                <div className="absolute -top-3 -right-3 text-3xl">
                                    {level.isMastered ? '⭐' : level.isUnlocked ? '🎯' : '🔒'}
                                </div>

                                {/* Chart Info */}
                                <div className="mt-4 mb-4">
                                    <h3 className="text-xl font-bold mb-2 truncate">
                                        {level.chart.chart_name}
                                    </h3>
                                    <div className="flex flex-wrap gap-2 mb-3">
                                        <span className="px-2 py-1 bg-slate-700 rounded text-xs">
                                            {level.chart.category}
                                        </span>
                                        {level.chart.position && (
                                            <span className="px-2 py-1 bg-slate-700 rounded text-xs">
                                                {level.chart.position}
                                            </span>
                                        )}
                                        {level.chart.stack_depth && (
                                            <span className="px-2 py-1 bg-slate-700 rounded text-xs">
                                                {level.chart.stack_depth}bb
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Stats */}
                                <div className="space-y-2 mb-4">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-400">Required:</span>
                                        <span className="font-bold text-cyan-400">{passThreshold}%</span>
                                    </div>
                                    {level.bestAccuracy > 0 && (
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-400">Best Score:</span>
                                            <span className={`font-bold ${level.isMastered ? 'text-yellow-400' : 'text-slate-300'}`}>
                                                {Math.round(level.bestAccuracy * 100)}%
                                            </span>
                                        </div>
                                    )}
                                    {level.timesPlayed > 0 && (
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-400">Attempts:</span>
                                            <span className="text-slate-300">{level.timesPlayed}</span>
                                        </div>
                                    )}
                                </div>

                                {/* Action Button */}
                                {level.isUnlocked ? (
                                    <button className={`
                                        w-full py-3 rounded-lg font-bold text-sm transition-all
                                        ${level.isMastered
                                            ? 'bg-yellow-500 hover:bg-yellow-400 text-slate-900'
                                            : 'bg-cyan-500 hover:bg-cyan-400 text-slate-900'
                                        }
                                    `}>
                                        {level.isMastered ? 'Play Again' : 'Start Level'}
                                    </button>
                                ) : (
                                    <div className="w-full py-3 rounded-lg bg-slate-700 text-slate-500 text-center text-sm font-bold">
                                        🔒 Complete Level {level.levelIndex}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
