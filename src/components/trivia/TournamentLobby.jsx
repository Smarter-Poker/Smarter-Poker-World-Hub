/**
 * WEEKLY TOURNAMENT — Scheduled competitive trivia
 * Entry: 25💎, Prize pool distributed to top 10
 */

import React, { useState, useEffect } from 'react';
import { Trophy, Gem, Users, Clock, Award } from 'lucide-react';
import MetalFrame from '../ui/MetalFrame';
import HexButton from '../ui/HexButton';

// Prize distribution (percentage of pool)
const PRIZE_DISTRIBUTION = [
    { place: 1, percent: 40, label: '1st' },
    { place: 2, percent: 20, label: '2nd' },
    { place: 3, percent: 12, label: '3rd' },
    { place: 4, percent: 8, label: '4th' },
    { place: 5, percent: 6, label: '5th' },
    { place: 6, percent: 5, label: '6th' },
    { place: 7, percent: 4, label: '7th' },
    { place: 8, percent: 3, label: '8th' },
    { place: 9, percent: 1.5, label: '9th' },
    { place: 10, percent: 0.5, label: '10th' }
];

export default function TournamentLobby({
    tournament = {},
    userDiamonds = 0,
    isRegistered = false,
    leaderboard = [],
    userRank = null,
    userScore = null,
    onRegister,
    onPlay
}) {
    const [timeLeft, setTimeLeft] = useState('');

    const {
        id,
        name = 'Weekly Tournament',
        entry_fee = 25,
        prize_pool = 0,
        max_players = 100,
        current_players = 0,
        starts_at,
        ends_at,
        status = 'upcoming'
    } = tournament;

    // Countdown timer
    useEffect(() => {
        if (!starts_at && !ends_at) return;

        const updateTimer = () => {
            const now = new Date();
            const target = status === 'upcoming' ? new Date(starts_at) : new Date(ends_at);
            const diff = target - now;

            if (diff <= 0) {
                setTimeLeft('Now!');
                return;
            }

            const hours = Math.floor(diff / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);

            if (hours > 24) {
                const days = Math.floor(hours / 24);
                setTimeLeft(`${days}d ${hours % 24}h`);
            } else if (hours > 0) {
                setTimeLeft(`${hours}h ${minutes}m`);
            } else {
                setTimeLeft(`${minutes}m ${seconds}s`);
            }
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [starts_at, ends_at, status]);

    const canAfford = userDiamonds >= entry_fee;
    const spotsLeft = max_players - current_players;

    return (
        <div className="tournament-lobby">
            <MetalFrame padding="0" showBolts={true} showNeonStrips={true}>
                {/* Header Banner */}
                <div className="tournament-banner">
                    <Trophy size={36} />
                    <div className="banner-text">
                        <h1>{name}</h1>
                        <span className="status-badge" data-status={status}>
                            {status === 'upcoming' ? 'Registration Open' :
                                status === 'active' ? 'In Progress' :
                                    status === 'complete' ? 'Finished' : status}
                        </span>
                    </div>
                </div>

                <div className="lobby-content">
                    {/* Timer & Stats */}
                    <div className="stats-grid">
                        <div className="stat-card">
                            <Clock size={20} />
                            <span className="stat-label">
                                {status === 'upcoming' ? 'Starts In' : 'Ends In'}
                            </span>
                            <span className="stat-value">{timeLeft}</span>
                        </div>
                        <div className="stat-card">
                            <Users size={20} />
                            <span className="stat-label">Players</span>
                            <span className="stat-value">{current_players}/{max_players}</span>
                        </div>
                        <div className="stat-card highlight">
                            <Gem size={20} />
                            <span className="stat-label">Prize Pool</span>
                            <span className="stat-value">{prize_pool.toLocaleString()} 💎</span>
                        </div>
                    </div>

                    {/* Your Status */}
                    {isRegistered && (
                        <div className="user-status">
                            <Award size={20} />
                            <div className="status-info">
                                <span className="status-label">Your Rank</span>
                                <span className="status-value">
                                    #{userRank || '-'} • {userScore || 0} pts
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Prize Distribution */}
                    <div className="prizes-section">
                        <h3>Prize Distribution</h3>
                        <div className="prizes-list">
                            {PRIZE_DISTRIBUTION.slice(0, 5).map((prize) => (
                                <div
                                    key={prize.place}
                                    className="prize-row"
                                    data-place={prize.place}
                                >
                                    <span className="prize-place">{prize.label}</span>
                                    <span className="prize-amount">
                                        {Math.floor(prize_pool * prize.percent / 100)} 💎
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Leaderboard Preview */}
                    {leaderboard.length > 0 && (
                        <div className="leaderboard-section">
                            <h3>Current Leaders</h3>
                            <div className="leaderboard-list">
                                {leaderboard.slice(0, 5).map((entry, idx) => (
                                    <div key={idx} className="lb-row">
                                        <span className="lb-rank">#{idx + 1}</span>
                                        <span className="lb-name">{entry.username}</span>
                                        <span className="lb-score">{entry.score} pts</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="actions-section">
                        {!isRegistered && status === 'upcoming' && (
                            <>
                                <div className="entry-fee">
                                    Entry Fee: <strong>{entry_fee} 💎</strong>
                                </div>
                                <HexButton
                                    label={canAfford ? 'Register Now' : 'Not Enough Diamonds'}
                                    icon={Trophy}
                                    onClick={onRegister}
                                    variant="primary"
                                    size="lg"
                                    fullWidth
                                    disabled={!canAfford || spotsLeft <= 0}
                                />
                                {!canAfford && (
                                    <p className="need-diamonds">
                                        You need {entry_fee - userDiamonds} more 💎
                                    </p>
                                )}
                            </>
                        )}

                        {isRegistered && status === 'active' && (
                            <HexButton
                                label="Play Tournament"
                                icon={Trophy}
                                onClick={onPlay}
                                variant="primary"
                                size="lg"
                                fullWidth
                            />
                        )}

                        {isRegistered && status === 'upcoming' && (
                            <div className="registered-badge">
                                <Award size={20} />
                                <span>You're Registered! Wait For Start.</span>
                            </div>
                        )}
                    </div>
                </div>
            </MetalFrame>

            <style jsx>{`
                .tournament-lobby {
                    max-width: 540px;
                    margin: 0 auto;
                }

                .tournament-banner {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    padding: 24px;
                    background: linear-gradient(135deg, rgba(251, 191, 36, 0.2), rgba(249, 115, 22, 0.15));
                    border-bottom: 1px solid rgba(251, 191, 36, 0.2);
                }

                .tournament-banner svg {
                    color: #fbbf24;
                }

                .banner-text h1 {
                    font-size: 22px;
                    font-weight: 700;
                    color: #fff;
                    margin: 0 0 4px 0;
                }

                .status-badge {
                    font-size: 12px;
                    font-weight: 600;
                    padding: 4px 10px;
                    border-radius: 4px;
                    text-transform: uppercase;
                }

                .status-badge[data-status="upcoming"] {
                    background: rgba(34, 197, 94, 0.2);
                    color: #22c55e;
                }

                .status-badge[data-status="active"] {
                    background: rgba(0, 212, 255, 0.2);
                    color: #00d4ff;
                }

                .status-badge[data-status="complete"] {
                    background: rgba(255, 255, 255, 0.1);
                    color: rgba(255, 255, 255, 0.5);
                }

                .lobby-content {
                    padding: 24px;
                }

                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 12px;
                    margin-bottom: 20px;
                }

                .stat-card {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 6px;
                    padding: 14px 10px;
                    background: rgba(0, 0, 0, 0.2);
                    border-radius: 10px;
                    text-align: center;
                }

                .stat-card.highlight {
                    background: rgba(0, 212, 255, 0.1);
                    border: 1px solid rgba(0, 212, 255, 0.2);
                }

                .stat-card svg {
                    color: rgba(255, 255, 255, 0.5);
                }

                .stat-card.highlight svg {
                    color: #00d4ff;
                }

                .stat-label {
                    font-size: 11px;
                    color: rgba(255, 255, 255, 0.5);
                    text-transform: uppercase;
                }

                .stat-value {
                    font-size: 16px;
                    font-weight: 700;
                    color: #fff;
                }

                .user-status {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 14px;
                    background: rgba(34, 197, 94, 0.1);
                    border: 1px solid rgba(34, 197, 94, 0.2);
                    border-radius: 10px;
                    margin-bottom: 20px;
                }

                .user-status svg {
                    color: #22c55e;
                }

                .status-label {
                    font-size: 12px;
                    color: rgba(255, 255, 255, 0.6);
                }

                .status-value {
                    font-size: 16px;
                    font-weight: 700;
                    color: #22c55e;
                }

                .prizes-section, .leaderboard-section {
                    margin-bottom: 20px;
                }

                .prizes-section h3, .leaderboard-section h3 {
                    font-size: 14px;
                    color: rgba(255, 255, 255, 0.7);
                    margin: 0 0 12px 0;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }

                .prizes-list {
                    background: rgba(0, 0, 0, 0.15);
                    border-radius: 10px;
                    overflow: hidden;
                }

                .prize-row {
                    display: flex;
                    justify-content: space-between;
                    padding: 10px 14px;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                }

                .prize-row:last-child {
                    border-bottom: none;
                }

                .prize-row[data-place="1"] { background: rgba(255, 215, 0, 0.1); }
                .prize-row[data-place="2"] { background: rgba(192, 192, 192, 0.08); }
                .prize-row[data-place="3"] { background: rgba(205, 127, 50, 0.08); }

                .prize-place {
                    font-weight: 600;
                    color: #fbbf24;
                }

                .prize-amount {
                    font-weight: 700;
                    color: #00d4ff;
                }

                .leaderboard-list {
                    background: rgba(0, 0, 0, 0.15);
                    border-radius: 10px;
                    overflow: hidden;
                }

                .lb-row {
                    display: flex;
                    align-items: center;
                    padding: 10px 14px;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                }

                .lb-row:last-child { border-bottom: none; }

                .lb-rank {
                    width: 36px;
                    font-weight: 700;
                    color: #fbbf24;
                }

                .lb-name {
                    flex: 1;
                    color: #fff;
                }

                .lb-score {
                    font-weight: 600;
                    color: #00d4ff;
                }

                .entry-fee {
                    text-align: center;
                    color: rgba(255, 255, 255, 0.6);
                    margin-bottom: 12px;
                }

                .entry-fee strong {
                    color: #00d4ff;
                }

                .need-diamonds {
                    text-align: center;
                    color: #ef4444;
                    font-size: 13px;
                    margin: 12px 0 0 0;
                }

                .registered-badge {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                    padding: 16px;
                    background: rgba(34, 197, 94, 0.1);
                    border: 1px solid rgba(34, 197, 94, 0.3);
                    border-radius: 10px;
                    color: #22c55e;
                    font-weight: 600;
                }
            `}</style>
        </div>
    );
}
