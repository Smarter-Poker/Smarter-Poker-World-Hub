/* ═══════════════════════════════════════════════════════════════════════════
   MEMORY GAMES ORB — Interactive GTO Range Training System
   Orb #5: Sharpen your poker memory with range recall and pattern recognition
   💎 DIAMOND PAYOUT ENGINE INTEGRATED — Automatic rewards on correct answers
   🔐 85% MASTERY GATE — Score 85% to earn diamonds
   ═══════════════════════════════════════════════════════════════════════════ */

import { useRouter } from 'next/router';
import Head from 'next/head';
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

// ═══════════════════════════════════════════════════════════════════════════
// 💎 DIAMOND PAYOUT ENGINE — Local-first with Database Sync
// ═══════════════════════════════════════════════════════════════════════════
const DiamondPayoutEngine = {
    _localBalance: null,

    _initLocal() {
        if (typeof window === 'undefined') return;
        if (this._localBalance === null) {
            this._localBalance = parseInt(localStorage.getItem('diamond_balance') || '0', 10);
        }
    },

    _saveLocal() {
        if (typeof window === 'undefined') return;
        localStorage.setItem('diamond_balance', String(this._localBalance));
    },

    async awardDiamonds(amount, reason) {
        this._initLocal();
        this._localBalance += amount;
        this._saveLocal();
        return { success: true, diamonds: amount, new_balance: this._localBalance, reason };
    },

    async getBalance() {
        this._initLocal();
        return this._localBalance || 0;
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// 📊 GTO SCENARIOS — Answer Keys for Range Memory
// ═══════════════════════════════════════════════════════════════════════════
const SCENARIOS = [
    {
        id: 'utg-open-100bb',
        title: 'UTG RFI (100bb)',
        description: 'Select the standard Opening Range from Under the Gun.',
        difficulty: 'beginner',
        solution: {
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise',
            '99': 'raise', '88': 'raise', '77': 'raise', '66': 'raise',
            'AKs': 'raise', 'AQs': 'raise', 'AJs': 'raise', 'ATs': 'raise', 'A9s': 'raise',
            'A8s': 'raise', 'A7s': 'raise', 'A6s': 'raise', 'A5s': 'raise', 'A4s': 'raise',
            'A3s': 'raise', 'A2s': 'raise', 'AKo': 'raise', 'AQo': 'raise', 'AJo': 'raise',
            'KQs': 'raise', 'KJs': 'raise', 'KTs': 'raise', 'K9s': 'raise', 'KQo': 'raise',
            'QJs': 'raise', 'QTs': 'raise', 'Q9s': 'raise', 'JTs': 'raise', 'J9s': 'raise',
            'T9s': 'raise', '98s': 'raise', '87s': 'raise', '76s': 'raise', '65s': 'raise',
        }
    },
    {
        id: 'btn-vs-open-flat',
        title: 'BTN vs UTG Open (Flat Range)',
        description: 'Which hands do we just CALL with on the Button vs an EP Open?',
        difficulty: 'beginner',
        solution: {
            'JJ': 'call', 'TT': 'call', '99': 'call', '88': 'call', '77': 'call', '66': 'call',
            '55': 'call', '44': 'call', '33': 'call', '22': 'call',
            'AQs': 'call', 'AJs': 'call', 'ATs': 'call', 'A9s': 'call', 'A8s': 'call',
            'A5s': 'call', 'A4s': 'call', 'A3s': 'call', 'A2s': 'call',
            'KQs': 'call', 'KJs': 'call', 'KTs': 'call', 'QJs': 'call', 'QTs': 'call',
            'JTs': 'call', 'T9s': 'call', '98s': 'call', 'AQo': 'call', 'KQo': 'call',
        }
    },
    {
        id: 'sb-3bet-vs-btn',
        title: 'SB 3-Bet vs BTN Open',
        description: 'Which hands should you 3-bet from the SB facing a Button open?',
        difficulty: 'intermediate',
        solution: {
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise',
            'AKs': 'raise', 'AQs': 'raise', 'AJs': 'raise', 'ATs': 'raise',
            'A5s': 'raise', 'A4s': 'raise', 'AKo': 'raise', 'AQo': 'raise',
            'KQs': 'raise', 'KJs': 'raise', 'QJs': 'raise',
        }
    }
];

// ═══════════════════════════════════════════════════════════════════════════
// 🎴 POKER HAND GRID — All 169 starting hands
// ═══════════════════════════════════════════════════════════════════════════
const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

function getHandName(row, col) {
    if (row === col) return RANKS[row] + RANKS[col]; // Pairs: AA, KK, etc.
    if (row < col) return RANKS[row] + RANKS[col] + 's'; // Suited: AKs, AQs, etc.
    return RANKS[col] + RANKS[row] + 'o'; // Offsuit: AKo, AQo, etc.
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 ACTION COLORS
// ═══════════════════════════════════════════════════════════════════════════
const ACTION_COLORS = {
    fold: { bg: 'rgba(100, 100, 100, 0.3)', border: '#666', label: 'FOLD' },
    call: { bg: 'rgba(16, 185, 129, 0.4)', border: '#10B981', label: 'CALL' },
    raise: { bg: 'rgba(239, 68, 68, 0.4)', border: '#EF4444', label: 'RAISE' },
    raise_small: { bg: 'rgba(249, 115, 22, 0.4)', border: '#F97316', label: 'RAISE SM' },
    raise_big: { bg: 'rgba(168, 85, 247, 0.4)', border: '#A855F7', label: 'RAISE BIG' },
    all_in: { bg: 'rgba(220, 38, 127, 0.5)', border: '#DC2680', label: 'ALL IN' },
};

// ═══════════════════════════════════════════════════════════════════════════
// 🧮 GRADING ENGINE
// ═══════════════════════════════════════════════════════════════════════════
function gradeUserGrid(userGrid, solution) {
    let correctHands = 0;
    const missedHands = [];
    const extraHands = [];
    const wrongActionHands = [];

    // Check solution hands
    for (const [hand, correctAction] of Object.entries(solution)) {
        const userAction = userGrid[hand];
        if (!userAction) {
            missedHands.push(hand);
        } else if (userAction !== correctAction) {
            wrongActionHands.push(hand);
        } else {
            correctHands++;
        }
    }

    // Check extra hands
    for (const [hand, userAction] of Object.entries(userGrid)) {
        if (!solution[hand] && userAction !== 'fold') {
            extraHands.push(hand);
        }
    }

    const totalSolutionHands = Object.keys(solution).length;
    const score = totalSolutionHands > 0
        ? Math.round((correctHands / totalSolutionHands) * 100)
        : 0;

    return { score, correctHands, missedHands, extraHands, wrongActionHands };
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎮 MAIN MEMORY GAMES PAGE
// ═══════════════════════════════════════════════════════════════════════════
export default function MemoryGamesPage() {
    const router = useRouter();
    const [currentScenarioIndex, setCurrentScenarioIndex] = useState(0);
    const [userGrid, setUserGrid] = useState({});
    const [selectedAction, setSelectedAction] = useState('raise');
    const [gradeResult, setGradeResult] = useState(null);
    const [diamondBalance, setDiamondBalance] = useState(0);
    const [lastReward, setLastReward] = useState(null);
    const [mode, setMode] = useState('menu'); // 'menu' | 'play'

    const scenario = SCENARIOS[currentScenarioIndex];

    // Load diamond balance
    useEffect(() => {
        DiamondPayoutEngine.getBalance().then(setDiamondBalance);
    }, []);

    // Handle cell click
    const handleCellClick = (hand) => {
        if (gradeResult) return;
        setUserGrid(prev => {
            if (prev[hand] === selectedAction) {
                const { [hand]: _, ...rest } = prev;
                return rest;
            }
            return { ...prev, [hand]: selectedAction };
        });
    };

    // Submit and grade
    const handleSubmit = async () => {
        const result = gradeUserGrid(userGrid, scenario.solution);
        setGradeResult(result);

        // Award diamonds if passed 85%
        if (result.score >= 85) {
            const baseReward = 10;
            const accuracyBonus = Math.floor((result.score - 85) / 5) * 5;
            const totalReward = baseReward + accuracyBonus + (result.score === 100 ? 25 : 0);

            const reward = await DiamondPayoutEngine.awardDiamonds(totalReward, 'memory_matrix_pass');
            if (reward.success) {
                setDiamondBalance(reward.new_balance);
                setLastReward({ diamonds: totalReward, timestamp: Date.now() });
            }
        }
    };

    // Next level
    const handleNextLevel = () => {
        setCurrentScenarioIndex((prev) => (prev + 1) % SCENARIOS.length);
        setUserGrid({});
        setGradeResult(null);
        setLastReward(null);
    };

    // Retry
    const handleRetry = () => {
        setUserGrid({});
        setGradeResult(null);
        setLastReward(null);
    };

    // Start game
    const startGame = (index) => {
        setCurrentScenarioIndex(index);
        setUserGrid({});
        setGradeResult(null);
        setMode('play');
    };

    return (
        <>
            <Head>
                <title>Memory Games — Smarter.Poker</title>
                <meta name="description" content="Sharpen your poker memory with GTO range training" />
                <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
            </Head>

            <div style={styles.container}>
                {/* Background */}
                <div style={styles.bgGrid} />
                <div style={styles.bgGlow} />

                {/* Header */}
                <div style={styles.header}>
                    <button onClick={() => mode === 'play' ? setMode('menu') : router.push('/hub')} style={styles.backButton}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M19 12H5M12 19l-7-7 7-7" />
                        </svg>
                        <span>{mode === 'play' ? 'Back to Menu' : 'Hub'}</span>
                    </button>

                    <div style={styles.headerStats}>
                        <div style={{
                            ...styles.statBadge,
                            background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.2), rgba(138, 43, 226, 0.2))',
                            border: '1px solid rgba(0, 212, 255, 0.4)',
                            position: 'relative',
                        }}>
                            <span style={styles.statIcon}>💎</span>
                            <span style={{ ...styles.statValue, color: '#00D4FF' }}>
                                {diamondBalance.toLocaleString()}
                            </span>
                            {lastReward && Date.now() - lastReward.timestamp < 3000 && (
                                <div style={styles.rewardPopup}>+{lastReward.diamonds} 💎</div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Main Content */}
                <div style={styles.content}>
                    {mode === 'menu' ? (
                        /* MENU MODE */
                        <>
                            <div style={styles.titleSection}>
                                <div style={styles.orbIcon}>🧠</div>
                                <h1 style={styles.title}>Memory Matrix</h1>
                                <p style={styles.subtitle}>
                                    Master GTO ranges through visual memorization • 85% required to earn 💎
                                </p>
                            </div>

                            {/* Scenario Selection */}
                            <div style={styles.scenarioGrid}>
                                {SCENARIOS.map((s, idx) => (
                                    <div
                                        key={s.id}
                                        onClick={() => startGame(idx)}
                                        style={styles.scenarioCard}
                                    >
                                        <div style={styles.scenarioNumber}>Level {idx + 1}</div>
                                        <h3 style={styles.scenarioTitle}>{s.title}</h3>
                                        <p style={styles.scenarioDesc}>{s.description}</p>
                                        <div style={styles.scenarioDifficulty}>{s.difficulty}</div>
                                        <div style={styles.handsCount}>{Object.keys(s.solution).length} hands</div>
                                    </div>
                                ))}
                            </div>

                            {/* Mastery Gate Info */}
                            <div style={styles.masteryGate}>
                                <span style={styles.masteryIcon}>🔐</span>
                                <div>
                                    <div style={styles.masteryTitle}>85% Mastery Gate</div>
                                    <div style={styles.masteryDesc}>Score 85% or higher to earn diamonds and unlock achievements</div>
                                </div>
                            </div>
                        </>
                    ) : (
                        /* PLAY MODE */
                        <>
                            {/* Scenario Header */}
                            <div style={styles.playHeader}>
                                <div>
                                    <span style={styles.levelBadge}>Level {currentScenarioIndex + 1}</span>
                                    <h2 style={styles.playTitle}>{scenario.title}</h2>
                                    <p style={styles.playDesc}>{scenario.description}</p>
                                </div>
                                {gradeResult && (
                                    <div style={styles.scoreDisplay}>
                                        <span style={styles.scoreLabel}>Score</span>
                                        <span style={{
                                            ...styles.scoreValue,
                                            color: gradeResult.score >= 85 ? '#00ff88' : '#ff4757'
                                        }}>
                                            {gradeResult.score}%
                                        </span>
                                        <span style={{
                                            ...styles.passBadge,
                                            background: gradeResult.score >= 85 ? '#00ff88' : '#ff4757'
                                        }}>
                                            {gradeResult.score >= 85 ? '✓ PASSED' : '✗ FAILED'}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Action Buttons */}
                            <div style={styles.actionBar}>
                                {Object.entries(ACTION_COLORS).map(([action, { bg, border, label }]) => (
                                    <button
                                        key={action}
                                        onClick={() => setSelectedAction(action)}
                                        style={{
                                            ...styles.actionButton,
                                            background: selectedAction === action ? bg : 'rgba(0,0,0,0.3)',
                                            borderColor: selectedAction === action ? border : 'rgba(255,255,255,0.2)',
                                            color: selectedAction === action ? '#fff' : 'rgba(255,255,255,0.6)',
                                        }}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>

                            {/* 13x13 Range Grid */}
                            <div style={styles.gridContainer}>
                                <div style={styles.grid}>
                                    {RANKS.map((_, row) => (
                                        RANKS.map((_, col) => {
                                            const hand = getHandName(row, col);
                                            const userAction = userGrid[hand];
                                            const solutionAction = scenario.solution[hand];
                                            const actionStyle = userAction ? ACTION_COLORS[userAction] : null;

                                            // Feedback styling
                                            let feedbackStyle = {};
                                            if (gradeResult) {
                                                if (gradeResult.missedHands.includes(hand)) {
                                                    feedbackStyle = { boxShadow: 'inset 0 0 0 2px #3B82F6' };
                                                } else if (gradeResult.extraHands.includes(hand)) {
                                                    feedbackStyle = { boxShadow: 'inset 0 0 0 2px #EF4444' };
                                                } else if (gradeResult.wrongActionHands.includes(hand)) {
                                                    feedbackStyle = { boxShadow: 'inset 0 0 0 2px #F59E0B' };
                                                }
                                            }

                                            return (
                                                <div
                                                    key={hand}
                                                    onClick={() => handleCellClick(hand)}
                                                    style={{
                                                        ...styles.cell,
                                                        background: actionStyle?.bg || 'rgba(30, 30, 40, 0.5)',
                                                        borderColor: actionStyle?.border || 'rgba(255,255,255,0.1)',
                                                        cursor: gradeResult ? 'default' : 'pointer',
                                                        ...feedbackStyle,
                                                    }}
                                                >
                                                    {hand}
                                                </div>
                                            );
                                        })
                                    ))}
                                </div>
                            </div>

                            {/* Submit / Result Buttons */}
                            <div style={styles.submitArea}>
                                {!gradeResult ? (
                                    <button onClick={handleSubmit} style={styles.submitButton}>
                                        SUBMIT RANGE
                                    </button>
                                ) : (
                                    <div style={styles.resultButtons}>
                                        <button onClick={handleRetry} style={styles.retryButton}>
                                            RETRY
                                        </button>
                                        <button onClick={handleNextLevel} style={styles.nextButton}>
                                            NEXT LEVEL →
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Feedback Panel */}
                            {gradeResult && (
                                <div style={styles.feedbackPanel}>
                                    <div style={styles.feedbackRow}>
                                        <span style={styles.feedbackLabel}>✅ Correct</span>
                                        <span style={styles.feedbackValue}>{gradeResult.correctHands}</span>
                                    </div>
                                    <div style={styles.feedbackRow}>
                                        <span style={{ ...styles.feedbackLabel, color: '#3B82F6' }}>🔵 Missed</span>
                                        <span style={styles.feedbackValue}>{gradeResult.missedHands.length}</span>
                                    </div>
                                    <div style={styles.feedbackRow}>
                                        <span style={{ ...styles.feedbackLabel, color: '#EF4444' }}>🔴 Extra</span>
                                        <span style={styles.feedbackValue}>{gradeResult.extraHands.length}</span>
                                    </div>
                                    {gradeResult.score >= 85 && (
                                        <div style={styles.diamondReward}>
                                            💎 +{10 + Math.floor((gradeResult.score - 85) / 5) * 5 + (gradeResult.score === 100 ? 25 : 0)} Diamonds Earned!
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════
const styles = {
    container: {
        minHeight: '100vh',
        background: '#0a1628',
        fontFamily: 'Inter, -apple-system, sans-serif',
        position: 'relative',
        padding: '20px',
    },
    bgGrid: {
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundImage: `
            linear-gradient(rgba(0, 255, 255, 0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 255, 255, 0.02) 1px, transparent 1px)
        `,
        backgroundSize: '60px 60px',
        pointerEvents: 'none',
    },
    bgGlow: {
        position: 'fixed',
        top: '30%', left: '50%',
        width: '100%', height: '100%',
        transform: 'translate(-50%, -50%)',
        background: 'radial-gradient(ellipse at center, rgba(0, 255, 255, 0.08), transparent 60%)',
        pointerEvents: 'none',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
        position: 'relative',
        zIndex: 10,
    },
    backButton: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 16px',
        background: 'rgba(0, 212, 255, 0.1)',
        border: '1px solid rgba(0, 212, 255, 0.3)',
        borderRadius: 8,
        color: '#00D4FF',
        fontSize: 14,
        fontWeight: 500,
        cursor: 'pointer',
    },
    headerStats: {
        display: 'flex',
        gap: 12,
    },
    statBadge: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 14px',
        background: 'rgba(0, 0, 0, 0.3)',
        borderRadius: 20,
        border: '1px solid rgba(255, 255, 255, 0.1)',
    },
    statIcon: { fontSize: 16 },
    statValue: { fontSize: 14, fontWeight: 600, color: '#fff' },
    rewardPopup: {
        position: 'absolute',
        top: -30,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'linear-gradient(135deg, #00ff88, #00D4FF)',
        padding: '4px 12px',
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 700,
        color: '#0a1628',
        whiteSpace: 'nowrap',
        boxShadow: '0 4px 20px rgba(0, 255, 136, 0.4)',
    },
    content: {
        maxWidth: 1000,
        margin: '0 auto',
    },
    titleSection: {
        textAlign: 'center',
        marginBottom: 40,
    },
    orbIcon: {
        fontSize: 64,
        marginBottom: 16,
    },
    title: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 36,
        fontWeight: 800,
        color: '#fff',
        marginBottom: 12,
        textShadow: '0 0 20px rgba(0, 255, 255, 0.3)',
    },
    subtitle: {
        fontSize: 16,
        color: 'rgba(255, 255, 255, 0.6)',
    },
    scenarioGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 20,
        marginBottom: 40,
    },
    scenarioCard: {
        background: 'rgba(0, 0, 0, 0.3)',
        border: '1px solid rgba(0, 255, 255, 0.2)',
        borderRadius: 16,
        padding: 24,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
    },
    scenarioNumber: {
        fontSize: 12,
        fontFamily: 'Orbitron, sans-serif',
        color: '#00D4FF',
        marginBottom: 8,
    },
    scenarioTitle: {
        fontSize: 20,
        fontWeight: 700,
        color: '#fff',
        marginBottom: 8,
    },
    scenarioDesc: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.6)',
        marginBottom: 12,
    },
    scenarioDifficulty: {
        fontSize: 12,
        color: '#00ff88',
        textTransform: 'uppercase',
        marginBottom: 4,
    },
    handsCount: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.4)',
    },
    masteryGate: {
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        background: 'linear-gradient(135deg, rgba(0, 255, 136, 0.1), rgba(0, 212, 255, 0.1))',
        border: '1px solid rgba(0, 255, 136, 0.3)',
        borderRadius: 16,
        padding: 24,
    },
    masteryIcon: { fontSize: 32 },
    masteryTitle: {
        fontSize: 16,
        fontWeight: 700,
        color: '#00ff88',
        marginBottom: 4,
    },
    masteryDesc: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.6)',
    },
    playHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 24,
    },
    levelBadge: {
        fontSize: 12,
        fontFamily: 'Orbitron, sans-serif',
        color: '#00D4FF',
        marginBottom: 4,
        display: 'block',
    },
    playTitle: {
        fontSize: 28,
        fontWeight: 700,
        color: '#fff',
        marginBottom: 4,
    },
    playDesc: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.6)',
    },
    scoreDisplay: {
        textAlign: 'right',
    },
    scoreLabel: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.5)',
        display: 'block',
    },
    scoreValue: {
        fontSize: 48,
        fontFamily: 'Orbitron, sans-serif',
        fontWeight: 900,
    },
    passBadge: {
        display: 'inline-block',
        padding: '4px 12px',
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 700,
        color: '#0a1628',
        marginTop: 8,
    },
    actionBar: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 20,
        justifyContent: 'center',
    },
    actionButton: {
        padding: '10px 16px',
        borderRadius: 8,
        border: '2px solid',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
    },
    gridContainer: {
        overflowX: 'auto',
        marginBottom: 24,
    },
    grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(13, minmax(48px, 1fr))',
        gap: 2,
        minWidth: 650,
    },
    cell: {
        aspectRatio: '1',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 11,
        fontWeight: 600,
        color: '#fff',
        borderRadius: 4,
        border: '1px solid',
        transition: 'all 0.1s ease',
        userSelect: 'none',
    },
    submitArea: {
        display: 'flex',
        justifyContent: 'center',
        marginBottom: 24,
    },
    submitButton: {
        padding: '16px 48px',
        fontSize: 18,
        fontWeight: 700,
        background: 'linear-gradient(135deg, #fff, #ddd)',
        color: '#0a1628',
        border: 'none',
        borderRadius: 50,
        cursor: 'pointer',
        boxShadow: '0 0 30px rgba(255, 255, 255, 0.3)',
    },
    resultButtons: {
        display: 'flex',
        gap: 16,
    },
    retryButton: {
        padding: '14px 32px',
        fontSize: 16,
        fontWeight: 600,
        background: 'rgba(255, 255, 255, 0.1)',
        color: '#fff',
        border: '1px solid rgba(255, 255, 255, 0.3)',
        borderRadius: 12,
        cursor: 'pointer',
    },
    nextButton: {
        padding: '14px 32px',
        fontSize: 16,
        fontWeight: 600,
        background: 'linear-gradient(135deg, #00D4FF, #0088cc)',
        color: '#fff',
        border: 'none',
        borderRadius: 12,
        cursor: 'pointer',
        boxShadow: '0 0 20px rgba(0, 212, 255, 0.3)',
    },
    feedbackPanel: {
        background: 'rgba(0, 0, 0, 0.4)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 16,
        padding: 20,
        maxWidth: 400,
        margin: '0 auto',
    },
    feedbackRow: {
        display: 'flex',
        justifyContent: 'space-between',
        padding: '8px 0',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    },
    feedbackLabel: {
        fontSize: 14,
        color: '#00ff88',
    },
    feedbackValue: {
        fontSize: 14,
        fontWeight: 600,
        color: '#fff',
    },
    diamondReward: {
        marginTop: 16,
        padding: 16,
        background: 'linear-gradient(135deg, rgba(0, 255, 136, 0.2), rgba(0, 212, 255, 0.2))',
        borderRadius: 12,
        textAlign: 'center',
        fontSize: 16,
        fontWeight: 700,
        color: '#00ff88',
    },
};
