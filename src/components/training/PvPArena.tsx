/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PVP ARENA — Competitive GTO Training Matches
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Phase GTO-CLONE: UI for PvPMatchEngine — heads-up competitive matches
 * with diamond entry fees, TrueSkill ratings, and seasonal leaderboards.
 *
 * Features:
 *   - Match format selector (Quick/Standard/Hyper/Championship)
 *   - Matchmaking lobby with diamond entry
 *   - Live match HUD with dual player scores
 *   - Match result screen with rating changes
 *   - Rank tier display (Iron → Diamond)
 *
 * @author Smarter.Poker Engineering
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Engine imports
import { PvPMatch, MATCH_FORMATS, MATCH_STATES, calculateRatingChange, getRankTier } from '../../engines/PvPMatchEngine';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface MatchedOpponent {
    name: string;
    rating: number;
    avatar?: string | null;
    id: string;
    _engine?: any;
}

interface PvPArenaProps {
    userId: string;
    userName: string;
    userRating?: number;
    userDiamonds?: number;
    onExit?: () => void;
    onDiamondsChange?: (delta: number) => void;
    /** Pre-matched opponent from lobby (looks like a real player) */
    matchedOpponent?: MatchedOpponent | null;
    /** Internal decision engine config (never rendered) */
    opponentEngine?: any;
}

type ArenaView = 'LOBBY' | 'MATCHMAKING' | 'IN_MATCH' | 'RESULT';

interface MatchResult {
    winner: string;
    player1Score: number;
    player2Score: number;
    ratingChange: number;
    diamondsWon: number;
    handsPlayed: number;
    duration: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const TIER_COLORS: Record<string, string> = {
    Iron: '#6b7280',
    Bronze: '#cd7f32',
    Silver: '#c0c0c0',
    Gold: '#ffd700',
    Platinum: '#00d4ff',
    Diamond: '#a855f7',
};

const TIER_ICONS: Record<string, string> = {
    Iron: '●',
    Bronze: '●',
    Silver: '●',
    Gold: '●',
    Platinum: '◆',
    Diamond: '★',
};

const FORMAT_ICONS: Record<string, string> = {
    QUICK: '⌁',
    STANDARD: '◆',
    HYPER: '▲',
    CHAMPIONSHIP: '★',
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function PvPArena({
    userId,
    userName,
    userRating = 1200,
    userDiamonds = 0,
    onExit,
    onDiamondsChange,
    matchedOpponent = null,
    opponentEngine = null,
}: PvPArenaProps) {
    // If launched from pvp-lobby with a pre-matched opponent, skip LOBBY → straight to match
    const hasPreMatchedOpponent = !!matchedOpponent;
    const initialView: ArenaView = hasPreMatchedOpponent ? 'IN_MATCH' : 'LOBBY';
    const [view, setView] = useState<ArenaView>(initialView);
    const [selectedFormat, setSelectedFormat] = useState<string>('STANDARD');
    const [match, setMatch] = useState<any>(null);
    const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
    const [searchTime, setSearchTime] = useState(0);
    const [rating, setRating] = useState(userRating);
    const [activeOpponent, setActiveOpponent] = useState<MatchedOpponent | null>(matchedOpponent);

    const tier = useMemo(() => getRankTier(rating), [rating]);
    const tierColor = TIER_COLORS[tier?.name] || '#6b7280';
    const tierIcon = TIER_ICONS[tier?.name] || '●';

    // If launched with a pre-matched opponent, immediately start the match
    useEffect(() => {
        if (hasPreMatchedOpponent && matchedOpponent && !match) {
            const pvpMatch = new PvPMatch({
                matchId: `pvp_${Date.now()}`,
                format: selectedFormat,
                player1: { id: userId, name: userName, rating },
                player2: {
                    id: matchedOpponent.id || `opp_${Date.now()}`,
                    name: matchedOpponent.name || 'Opponent',
                    rating: matchedOpponent.rating || 1300,
                    // _engine stored internally for AI decisions, never visible
                    _engine: opponentEngine || matchedOpponent._engine,
                },
            });
            pvpMatch.start();
            setMatch(pvpMatch);
        }
    }, [hasPreMatchedOpponent, matchedOpponent]);

    // Matchmaking timer (only when using built-in lobby, not pre-matched path)
    useEffect(() => {
        if (view !== 'MATCHMAKING') return;
        const interval = setInterval(() => setSearchTime(t => t + 1), 1000);
        // Simulate finding a match after 3-5 seconds
        const timeout = setTimeout(() => {
            startMatch();
        }, 3000 + Math.random() * 2000);
        return () => { clearInterval(interval); clearTimeout(timeout); };
    }, [view]);

    const startMatchmaking = useCallback(() => {
        const format = MATCH_FORMATS[selectedFormat as keyof typeof MATCH_FORMATS];
        if (!format) return;
        if (userDiamonds < format.entryDiamonds) return;
        onDiamondsChange?.(-format.entryDiamonds);
        setSearchTime(0);
        setView('MATCHMAKING');
    }, [selectedFormat, userDiamonds, onDiamondsChange]);

    const startMatch = useCallback(() => {
        const opponentId = activeOpponent?.id || 'opponent';
        const opponentName = activeOpponent?.name || 'Opponent';
        const opponentRating = activeOpponent?.rating || (rating + Math.floor((Math.random() - 0.5) * 200));

        const pvpMatch = new PvPMatch({
            matchId: `pvp_${Date.now()}`,
            format: selectedFormat,
            player1: { id: userId, name: userName, rating },
            player2: {
                id: opponentId,
                name: opponentName,
                rating: opponentRating,
                _engine: opponentEngine || activeOpponent?._engine,
            },
        });
        pvpMatch.start();
        setMatch(pvpMatch);
        setView('IN_MATCH');
    }, [selectedFormat, userId, userName, rating, activeOpponent, opponentEngine]);

    const handleMatchComplete = useCallback((result: MatchResult) => {
        setMatchResult(result);
        setRating(prev => prev + result.ratingChange);
        if (result.diamondsWon > 0) {
            onDiamondsChange?.(result.diamondsWon);
        }
        setView('RESULT');
    }, [onDiamondsChange]);

    return (
        <div style={styles.container}>
            <AnimatePresence mode="wait">
                {view === 'LOBBY' && (
                    <LobbyView
                        key="lobby"
                        rating={rating}
                        tier={tier}
                        tierColor={tierColor}
                        tierIcon={tierIcon}
                        userDiamonds={userDiamonds}
                        selectedFormat={selectedFormat}
                        onSelectFormat={setSelectedFormat}
                        onStartMatch={startMatchmaking}
                        onExit={onExit}
                    />
                )}

                {view === 'MATCHMAKING' && (
                    <MatchmakingView
                        key="matchmaking"
                        format={selectedFormat}
                        searchTime={searchTime}
                        rating={rating}
                        tierColor={tierColor}
                        onCancel={() => {
                            const format = MATCH_FORMATS[selectedFormat as keyof typeof MATCH_FORMATS];
                            onDiamondsChange?.(format?.entryDiamonds || 0);
                            setView('LOBBY');
                        }}
                    />
                )}

                {view === 'IN_MATCH' && match && (
                    <MatchView
                        key="match"
                        match={match}
                        userId={userId}
                        onComplete={handleMatchComplete}
                    />
                )}

                {view === 'RESULT' && matchResult && (
                    <ResultView
                        key="result"
                        result={matchResult}
                        rating={rating}
                        tier={tier}
                        tierColor={tierColor}
                        tierIcon={tierIcon}
                        onPlayAgain={() => setView('LOBBY')}
                        onExit={onExit}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// LOBBY VIEW
// ═══════════════════════════════════════════════════════════════════════════

function LobbyView({
    rating, tier, tierColor, tierIcon, userDiamonds,
    selectedFormat, onSelectFormat, onStartMatch, onExit,
}: any) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            style={styles.lobbyContainer}
        >
            {/* Header */}
            <div style={styles.lobbyHeader}>
                <div>
                    <h2 style={styles.title}>PvP Arena</h2>
                    <p style={styles.subtitle}>Test your GTO skills against other players</p>
                </div>
                {onExit && (
                    <button onClick={onExit} style={styles.exitBtn}>✕</button>
                )}
            </div>

            {/* Player Info */}
            <div style={{ ...styles.playerCard, borderColor: tierColor }}>
                <div style={styles.playerInfo}>
                    <span style={{ fontSize: '24px' }}>{tierIcon}</span>
                    <div>
                        <div style={{ ...styles.tierLabel, color: tierColor }}>{tier?.name || 'Iron'}</div>
                        <div style={styles.ratingValue}>{rating} SR</div>
                    </div>
                </div>
                <div style={styles.diamondBalance}>
                    ◆ {userDiamonds.toLocaleString()}
                </div>
            </div>

            {/* Format Selection */}
            <div style={styles.formatGrid}>
                {Object.entries(MATCH_FORMATS || {}).map(([key, format]: [string, any]) => {
                    const isSelected = selectedFormat === key;
                    const canAfford = userDiamonds >= format.entryDiamonds;
                    return (
                        <motion.button
                            key={key}
                            whileHover={{ scale: canAfford ? 1.02 : 1 }}
                            whileTap={{ scale: canAfford ? 0.98 : 1 }}
                            onClick={() => canAfford && onSelectFormat(key)}
                            style={{
                                ...styles.formatCard,
                                borderColor: isSelected ? '#00d4ff' : 'rgba(255,255,255,0.1)',
                                background: isSelected
                                    ? 'rgba(0, 212, 255, 0.1)'
                                    : 'rgba(255,255,255,0.03)',
                                opacity: canAfford ? 1 : 0.5,
                                cursor: canAfford ? 'pointer' : 'not-allowed',
                            }}
                        >
                            <div style={{ fontSize: '20px', marginBottom: '8px' }}>
                                {FORMAT_ICONS[key] || '◆'}
                            </div>
                            <div style={{
                                fontSize: '13px',
                                fontWeight: 700,
                                color: isSelected ? '#00d4ff' : '#fff',
                                marginBottom: '4px',
                            }}>
                                {format.label}
                            </div>
                            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginBottom: '8px' }}>
                                {format.hands} hands • {format.stackBB}BB
                            </div>
                            <div style={{
                                fontSize: '12px',
                                fontWeight: 600,
                                color: '#ffd700',
                            }}>
                                ◆ {format.entryDiamonds}
                            </div>
                            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>
                                Prize: {format.prizeMultiplier}x
                            </div>
                        </motion.button>
                    );
                })}
            </div>

            {/* Play Button */}
            <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onStartMatch}
                style={{
                    ...styles.playButton,
                    opacity: userDiamonds >= (MATCH_FORMATS[selectedFormat as keyof typeof MATCH_FORMATS]?.entryDiamonds || 0) ? 1 : 0.5,
                }}
            >
                Find Opponent
            </motion.button>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MATCHMAKING VIEW
// ═══════════════════════════════════════════════════════════════════════════

function MatchmakingView({ format, searchTime, rating, tierColor, onCancel }: any) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={styles.matchmakingContainer}
        >
            <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                style={styles.spinner}
            >
                »
            </motion.div>
            <h3 style={{ color: '#fff', fontSize: '18px', fontWeight: 700, margin: '16px 0 8px' }}>
                Finding Opponent...
            </h3>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', margin: '0 0 8px' }}>
                {MATCH_FORMATS[format as keyof typeof MATCH_FORMATS]?.label || format}
            </p>
            <div style={{ color: tierColor, fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>
                Rating: {rating} SR
            </div>
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '12px', marginBottom: '24px' }}>
                Searching... {searchTime}s
            </div>
            <button onClick={onCancel} style={styles.cancelBtn}>
                Cancel
            </button>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MATCH VIEW (simplified — in production this would use real-time sync)
// ═══════════════════════════════════════════════════════════════════════════

function MatchView({ match, userId, onComplete }: any) {
    const [handNum, setHandNum] = useState(1);
    const [p1Score, setP1Score] = useState(0);
    const [p2Score, setP2Score] = useState(0);

    // Simulate match progression
    useEffect(() => {
        const interval = setInterval(() => {
            setHandNum(prev => {
                if (prev >= match.totalHands) {
                    clearInterval(interval);
                    // Generate result
                    const finalP1 = p1Score + (Math.random() > 0.4 ? 3 : -1);
                    const finalP2 = p2Score + (Math.random() > 0.5 ? 3 : -1);
                    const isWinner = finalP1 >= finalP2;
                    const ratingChange = calculateRatingChange(
                        match.player1.rating, match.player2.rating
                    );
                    const format = match.format;
                    onComplete({
                        winner: isWinner ? match.player1.id : match.player2.id,
                        player1Score: Math.round(finalP1),
                        player2Score: Math.round(finalP2),
                        ratingChange: isWinner ? ratingChange.winnerDelta : ratingChange.loserDelta,
                        diamondsWon: isWinner
                            ? Math.round(format.entryDiamonds * format.prizeMultiplier)
                            : 0,
                        handsPlayed: match.totalHands,
                        duration: Math.round((Date.now() - match.startTime) / 1000),
                    });
                    return prev;
                }
                // Simulate scoring
                setP1Score(s => s + (Math.random() > 0.4 ? Math.random() * 3 : -Math.random()));
                setP2Score(s => s + (Math.random() > 0.5 ? Math.random() * 3 : -Math.random()));
                return prev + 1;
            });
        }, 800);
        return () => clearInterval(interval);
    }, []);

    const progress = (handNum / match.totalHands) * 100;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={styles.matchContainer}
        >
            {/* Match Header */}
            <div style={styles.matchHeader}>
                <div style={styles.matchInfo}>
                    Hand {handNum}/{match.totalHands}
                </div>
            </div>

            {/* Score Display */}
            <div style={styles.scoreBoard}>
                <div style={styles.playerScore}>
                    <div style={{ fontSize: '12px', color: '#00d4ff', fontWeight: 600 }}>
                        {match.player1.name}
                    </div>
                    <div style={{ fontSize: '28px', fontWeight: 800, color: '#fff' }}>
                        {p1Score.toFixed(0)}
                    </div>
                </div>
                <div style={styles.vsLabel}>VS</div>
                <div style={styles.playerScore}>
                    <div style={{ fontSize: '12px', color: '#ef4444', fontWeight: 600 }}>
                        {match.player2.name}
                    </div>
                    <div style={{ fontSize: '28px', fontWeight: 800, color: '#fff' }}>
                        {p2Score.toFixed(0)}
                    </div>
                </div>
            </div>

            {/* Progress Bar */}
            <div style={styles.progressBarBg}>
                <motion.div
                    style={{ ...styles.progressBarFill, width: `${progress}%` }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.3 }}
                />
            </div>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// RESULT VIEW
// ═══════════════════════════════════════════════════════════════════════════

function ResultView({ result, rating, tier, tierColor, tierIcon, onPlayAgain, onExit }: any) {
    const isWinner = result.diamondsWon > 0;

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            style={styles.resultContainer}
        >
            {/* Victory/Defeat Header */}
            <motion.div
                initial={{ y: -30 }}
                animate={{ y: 0 }}
                style={{
                    fontSize: '48px',
                    marginBottom: '8px',
                    color: isWinner ? '#22c55e' : '#ef4444',
                }}
            >
                {isWinner ? '★' : '▼'}
            </motion.div>
            <h2 style={{
                color: isWinner ? '#22c55e' : '#ef4444',
                fontSize: '24px',
                fontWeight: 800,
                margin: '0 0 4px',
            }}>
                {isWinner ? 'VICTORY' : 'DEFEAT'}
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', margin: '0 0 24px' }}>
                {result.handsPlayed} hands played
            </p>

            {/* Score Comparison */}
            <div style={styles.resultScoreRow}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', color: '#00d4ff' }}>You</div>
                    <div style={{ fontSize: '24px', fontWeight: 800, color: '#fff' }}>
                        {result.player1Score}
                    </div>
                </div>
                <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.3)' }}>-</div>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', color: '#ef4444' }}>Opponent</div>
                    <div style={{ fontSize: '24px', fontWeight: 800, color: '#fff' }}>
                        {result.player2Score}
                    </div>
                </div>
            </div>

            {/* Rating Change */}
            <div style={{
                ...styles.ratingChangeBox,
                borderColor: result.ratingChange >= 0 ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)',
                background: result.ratingChange >= 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '16px' }}>{tierIcon}</span>
                    <span style={{ color: tierColor, fontWeight: 600, fontSize: '14px' }}>
                        {tier?.name}
                    </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '16px', fontWeight: 700, color: '#fff' }}>
                        {rating} SR
                    </span>
                    <span style={{
                        fontSize: '13px',
                        fontWeight: 700,
                        color: result.ratingChange >= 0 ? '#22c55e' : '#ef4444',
                    }}>
                        {result.ratingChange >= 0 ? '+' : ''}{result.ratingChange}
                    </span>
                </div>
            </div>

            {/* Diamond Reward */}
            {result.diamondsWon > 0 && (
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.3, type: 'spring' }}
                    style={styles.diamondReward}
                >
                    ◆ +{result.diamondsWon} Diamonds
                </motion.div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '12px', marginTop: '24px', width: '100%' }}>
                <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={onPlayAgain}
                    style={styles.playAgainBtn}
                >
                    Play Again
                </motion.button>
                {onExit && (
                    <button onClick={onExit} style={styles.exitResultBtn}>
                        Exit
                    </button>
                )}
            </div>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const styles: Record<string, React.CSSProperties> = {
    container: {
        width: '100%',
        minHeight: '100%',
        background: 'linear-gradient(180deg, #0a0a15 0%, #0d1628 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '24px',
    },
    lobbyContainer: {
        width: '100%',
        maxWidth: '600px',
    },
    lobbyHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '24px',
    },
    title: {
        fontSize: '24px',
        fontWeight: 800,
        color: '#fff',
        margin: '0 0 4px',
    },
    subtitle: {
        fontSize: '13px',
        color: 'rgba(255,255,255,0.5)',
        margin: 0,
    },
    exitBtn: {
        background: 'rgba(255,255,255,0.1)',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: '8px',
        color: '#fff',
        width: '36px',
        height: '36px',
        fontSize: '16px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    playerCard: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 20px',
        background: 'rgba(255,255,255,0.03)',
        border: '2px solid',
        borderRadius: '12px',
        marginBottom: '24px',
    },
    playerInfo: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
    },
    tierLabel: {
        fontSize: '14px',
        fontWeight: 700,
    },
    ratingValue: {
        fontSize: '12px',
        color: 'rgba(255,255,255,0.5)',
    },
    diamondBalance: {
        fontSize: '16px',
        fontWeight: 700,
        color: '#ffd700',
    },
    formatGrid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '12px',
        marginBottom: '24px',
    },
    formatCard: {
        padding: '16px',
        border: '2px solid',
        borderRadius: '12px',
        textAlign: 'center' as const,
        cursor: 'pointer',
        transition: 'all 0.2s',
    },
    playButton: {
        width: '100%',
        padding: '16px',
        background: 'linear-gradient(135deg, #00d4ff, #0099cc)',
        border: 'none',
        borderRadius: '12px',
        color: '#fff',
        fontSize: '16px',
        fontWeight: 700,
        cursor: 'pointer',
        boxShadow: '0 0 20px rgba(0, 212, 255, 0.3)',
    },
    matchmakingContainer: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '400px',
    },
    spinner: {
        fontSize: '48px',
    },
    cancelBtn: {
        padding: '10px 24px',
        background: 'rgba(255,255,255,0.1)',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: '8px',
        color: '#fff',
        fontSize: '14px',
        cursor: 'pointer',
    },
    matchContainer: {
        width: '100%',
        maxWidth: '500px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
    },
    matchHeader: {
        width: '100%',
        textAlign: 'center' as const,
        marginBottom: '32px',
    },
    matchInfo: {
        fontSize: '14px',
        color: 'rgba(255,255,255,0.5)',
        fontWeight: 600,
    },
    scoreBoard: {
        display: 'flex',
        alignItems: 'center',
        gap: '24px',
        marginBottom: '32px',
    },
    playerScore: {
        textAlign: 'center' as const,
        minWidth: '100px',
    },
    vsLabel: {
        fontSize: '16px',
        fontWeight: 800,
        color: 'rgba(255,255,255,0.3)',
    },
    progressBarBg: {
        width: '100%',
        height: '6px',
        background: 'rgba(255,255,255,0.1)',
        borderRadius: '3px',
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        background: 'linear-gradient(90deg, #00d4ff, #22c55e)',
        borderRadius: '3px',
        transition: 'width 0.3s ease',
    },
    resultContainer: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        maxWidth: '400px',
        width: '100%',
    },
    resultScoreRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '24px',
        marginBottom: '24px',
    },
    ratingChangeBox: {
        width: '100%',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        border: '1px solid',
        borderRadius: '10px',
        marginBottom: '16px',
    },
    diamondReward: {
        fontSize: '18px',
        fontWeight: 700,
        color: '#ffd700',
        padding: '10px 20px',
        background: 'rgba(255, 215, 0, 0.1)',
        border: '1px solid rgba(255, 215, 0, 0.3)',
        borderRadius: '10px',
    },
    playAgainBtn: {
        flex: 1,
        padding: '14px',
        background: 'linear-gradient(135deg, #00d4ff, #0099cc)',
        border: 'none',
        borderRadius: '10px',
        color: '#fff',
        fontSize: '14px',
        fontWeight: 700,
        cursor: 'pointer',
    },
    exitResultBtn: {
        padding: '14px 24px',
        background: 'rgba(255,255,255,0.1)',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: '10px',
        color: '#fff',
        fontSize: '14px',
        cursor: 'pointer',
    },
};

export { PvPArena };
