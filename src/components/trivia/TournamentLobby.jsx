/**
 * WEEKLY TOURNAMENT — Scheduled competitive trivia
 * Entry: 25 diamonds. Prize pool distributed to the top finishers.
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║ NOT CURRENTLY WIRED — presentational only                                ║
 * ╠══════════════════════════════════════════════════════════════════════════╣
 * ║ Phase 69 audit: zero imports anywhere in pages/ or src/. The real        ║
 * ║ tournament lobby + bracket UI is implemented inline in                   ║
 * ║ pages/hub/trivia/tournaments.js (1803 lines), which uses the actual      ║
 * ║ trivia_tournaments / trivia_tournament_rounds tables + realtime          ║
 * ║ subscriptions. The PRIZE_DISTRIBUTION below is display-only and does NOT ║
 * ║ decide payouts — the authoritative schedule lives server-side in         ║
 * ║ pages/api/trivia/tournament-lifecycle.js (prizeSchedule / splitPrizePool)║
 * ║ and is the only thing that moves diamonds. Pass `prizeSchedule` in to    ║
 * ║ show the real numbers.                                                   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
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
    entryCount = null,      // live field size (tournament-enter returns entries_count)
    prizeSchedule = null,   // [{ place, percent, label }] from the server, optional
    onRegister,
    onPlay
}) {
    const [timeLeft, setTimeLeft] = useState('');

    const t = tournament || {};
    const name = t.name || 'Weekly Tournament';
    const entryFee = Number(t.entry_fee ?? 25) || 0;
    const prizePool = Number(t.prize_pool ?? 0) || 0;
    const status = t.status || 'upcoming';
    // The live trivia_tournaments table uses start_time / end_time; the older
    // schema used starts_at / ends_at. Accept either so the countdown works
    // instead of silently never starting.
    const startsAt = t.start_time || t.starts_at || null;
    const endsAt = t.end_time || t.ends_at || null;
    // max_players / current_players are not present on the live table. Only show
    // a field-size chip when the caller actually supplies real numbers.
    const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
    const maxPlayers = num(t.max_players);
    const currentPlayers = num(t.current_players) ?? num(entryCount);

    // Countdown timer
    useEffect(() => {
        if (!startsAt && !endsAt) return;

        const updateTimer = () => {
            const now = new Date();
            const rawTarget = status === 'upcoming' ? startsAt : endsAt;
            const target = rawTarget ? new Date(rawTarget) : null;
            const diff = target && !Number.isNaN(target.getTime()) ? target - now : 0;

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
    }, [startsAt, endsAt, status]);

    const canAfford = Number(userDiamonds || 0) >= entryFee;
    // Only a real cap can be "full". Previously undefined columns produced NaN,
    // and `NaN <= 0` is false, so this silently did nothing either way.
    const spotsLeft =
        maxPlayers != null && currentPlayers != null ? maxPlayers - currentPlayers : null;
    const isFull = spotsLeft != null && spotsLeft <= 0;

    // Display-only prize preview. The server's split is authoritative.
    const prizeRows = (Array.isArray(prizeSchedule) && prizeSchedule.length > 0
        ? prizeSchedule
        : PRIZE_DISTRIBUTION
    ).slice(0, 5);

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
                                    (status === 'complete' || status === 'completed') ? 'Finished' :
                                    status === 'cancelled' ? 'Cancelled' : status}
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
                        {currentPlayers != null && (
                            <div className="stat-card">
                                <Users size={20} />
                                <span className="stat-label">Players</span>
                                <span className="stat-value">
                                    {currentPlayers.toLocaleString()}
                                    {maxPlayers != null ? `/${maxPlayers.toLocaleString()}` : ''}
                                </span>
                            </div>
                        )}
                        <div className="stat-card highlight">
                            <Gem size={20} />
                            <span className="stat-label">Prize Pool</span>
                            <span className="stat-value">{prizePool.toLocaleString()}</span>
                        </div>
                    </div>

                    {/* Your Status */}
                    {isRegistered && (
                        <div className="user-status">
                            <Award size={20} />
                            <div className="status-info">
                                <span className="status-label">Your Rank</span>
                                <span className="status-value">
                                    #{userRank || '-'} - {Number(userScore || 0).toLocaleString()} pts
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Prize Distribution */}
                    <div className="prizes-section">
                        <h3>Prize Distribution</h3>
                        <div className="prizes-list">
                            {prizeRows.map((prize) => (
                                <div
                                    key={prize.place}
                                    className="prize-row"
                                    data-place={prize.place}
                                >
                                    <span className="prize-place">{prize.label}</span>
                                    <span className="prize-amount">
                                        {Math.floor((prizePool * (Number(prize.percent) || 0)) / 100).toLocaleString()}
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
                                        <span className="lb-name">{entry?.username || 'Player'}</span>
                                        <span className="lb-score">{Number(entry?.score || 0).toLocaleString()} pts</span>
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
                                    Entry Fee: <strong>{entryFee.toLocaleString()} diamonds</strong>
                                </div>
                                <HexButton
                                    label={canAfford ? 'Register Now' : 'Not Enough Diamonds'}
                                    icon={Trophy}
                                    onClick={onRegister}
                                    variant="primary"
                                    size="lg"
                                    fullWidth
                                    disabled={!canAfford || isFull}
                                />
                                {!canAfford && (
                                    <p className="need-diamonds">
                                        You need {Math.max(0, entryFee - Number(userDiamonds || 0)).toLocaleString()} more diamonds
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

            <style>{`
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
