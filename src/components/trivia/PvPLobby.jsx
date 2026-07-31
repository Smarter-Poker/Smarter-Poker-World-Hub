/**
 * PVP LOBBY — Find opponents and start 1v1 trivia battles
 * Entry stakes: 10-100 diamonds, winner takes 90% (10% rake)
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║ NOT CURRENTLY WIRED — presentational only                                ║
 * ╠══════════════════════════════════════════════════════════════════════════╣
 * ║ Phase 69 audit: zero imports anywhere in pages/ or src/. The real        ║
 * ║ PvP matchmaking + lobby logic lives inline in pages/hub/trivia/pvp.js,   ║
 * ║ which integrates Supabase realtime + the actual matchmaking RPC. This    ║
 * ║ component has hard-coded stakes (10/25/50/100) that may not match the    ║
 * ║ production stake schedule. The "Battle Starting In 3..." text used to be ║
 * ║ a fixed string with no countdown behind it; it now counts down for real. ║
 * ║ Verify with: grep -rn 'PvPLobby' pages/ src/                             ║
 * ║ — safe to delete as of Phase 69.                                          ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Swords, Gem, Users, Clock, Trophy, Loader2 } from 'lucide-react';
import MetalFrame from '../ui/MetalFrame';
import HexButton from '../ui/HexButton';

// Labels are plain text on purpose: bare emoji characters in JSX source break
// the SWC build (repo rule). The Gem icon carries the visual.
const STAKE_OPTIONS = [
    { amount: 10, label: '10', color: '#22c55e' },
    { amount: 25, label: '25', color: '#0ea5e9' },
    { amount: 50, label: '50', color: '#8b5cf6' },
    { amount: 100, label: '100', color: '#f97316' }
];

const RAKE_PERCENT = 10; // House takes 10%

export default function PvPLobby({
    userDiamonds = 0,
    onFindMatch,
    onCancel,
    matchFound = false,
    opponent = null,
    searching = false
}) {
    const [selectedStake, setSelectedStake] = useState(null);
    const [searchTime, setSearchTime] = useState(0);
    const [startIn, setStartIn] = useState(3);

    // Search timer
    useEffect(() => {
        if (!searching) {
            setSearchTime(0);
            return;
        }

        const timer = setInterval(() => {
            setSearchTime(prev => prev + 1);
        }, 1000);

        return () => clearInterval(timer);
    }, [searching]);

    // Real countdown once a match is found. The old fixed "3..." string never
    // moved, so the UI claimed a timer that did not exist.
    useEffect(() => {
        if (!matchFound) {
            setStartIn(3);
            return;
        }
        setStartIn(3);
        const timer = setInterval(() => {
            setStartIn(prev => (prev <= 1 ? 0 : prev - 1));
        }, 1000);
        return () => clearInterval(timer);
    }, [matchFound]);

    const handleStakeSelect = (stake) => {
        if (userDiamonds < stake.amount) return;
        setSelectedStake(stake);
    };

    const handleFindMatch = () => {
        if (!selectedStake) return;
        onFindMatch?.(selectedStake.amount);
    };

    const winAmount = selectedStake
        ? Math.floor(selectedStake.amount * 2 * (1 - RAKE_PERCENT / 100))
        : 0;

    return (
        <div className="pvp-lobby">
            <MetalFrame padding="32px" showBolts={true} showNeonStrips={true}>
                <div className="lobby-header">
                    <Swords size={48} className="pvp-icon" />
                    <h1>1v1 BATTLE</h1>
                    <p>Challenge Another Player. Winner Takes All!</p>
                </div>

                {!searching && !matchFound && (
                    <>
                        <div className="stake-section">
                            <h3>Select Your Stake</h3>
                            <div className="stake-grid">
                                {STAKE_OPTIONS.map((stake) => {
                                    const canAfford = userDiamonds >= stake.amount;
                                    const isSelected = selectedStake?.amount === stake.amount;

                                    return (
                                        <button
                                            key={stake.amount}
                                            className={`stake-btn ${isSelected ? 'selected' : ''} ${!canAfford ? 'disabled' : ''}`}
                                            onClick={() => handleStakeSelect(stake)}
                                            disabled={!canAfford}
                                            style={{ '--stake-color': stake.color }}
                                        >
                                            <Gem size={20} />
                                            <span className="stake-amount">{stake.amount}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {selectedStake && (
                            <div className="stake-info">
                                <div className="info-row">
                                    <span>Your Stake:</span>
                                    <span className="value">
                                        <Gem size={13} /> {selectedStake.amount.toLocaleString()}
                                    </span>
                                </div>
                                <div className="info-row">
                                    <span>If You Win:</span>
                                    <span className="value win">
                                        <Gem size={13} /> +{winAmount.toLocaleString()}
                                    </span>
                                </div>
                                <div className="info-row small">
                                    <span>House Rake:</span>
                                    <span>{RAKE_PERCENT}%</span>
                                </div>
                            </div>
                        )}

                        <div className="balance-display">
                            <Gem size={16} />
                            <span>Your Balance: {Number(userDiamonds || 0).toLocaleString()}</span>
                        </div>

                        <HexButton
                            label="Find Opponent"
                            icon={Swords}
                            onClick={handleFindMatch}
                            variant="primary"
                            size="lg"
                            fullWidth
                            disabled={!selectedStake}
                        />
                    </>
                )}

                {searching && !matchFound && (
                    <div className="searching-state">
                        <motion.div
                            className="search-spinner"
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        >
                            <Loader2 size={48} />
                        </motion.div>
                        <h3>Finding Opponent...</h3>
                        <p className="search-time">
                            <Clock size={16} />
                            {searchTime}s
                        </p>
                        <p className="search-stake">
                            Stake: {(selectedStake?.amount || 0).toLocaleString()}
                        </p>
                        <HexButton
                            label="Cancel"
                            onClick={onCancel}
                            variant="secondary"
                        />
                    </div>
                )}

                {matchFound && opponent && (
                    <div className="match-found">
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="match-banner"
                        >
                            <Trophy size={32} />
                            <h3>OPPONENT FOUND!</h3>
                        </motion.div>

                        <div className="opponent-card">
                            <div className="opponent-avatar">
                                {opponent.avatar ? (
                                    <img src={opponent.avatar} alt={opponent.username} />
                                ) : (
                                    <Users size={32} />
                                )}
                            </div>
                            <div className="opponent-info">
                                <span className="opponent-name">{opponent?.username || 'Opponent'}</span>
                                <span className="opponent-stats">
                                    {Number(opponent?.wins || 0).toLocaleString()}W -{' '}
                                    {Number(opponent?.losses || 0).toLocaleString()}L
                                </span>
                            </div>
                        </div>

                        <p className="starting-soon">
                            {startIn > 0 ? `Battle Starting In ${startIn}...` : 'Starting...'}
                        </p>
                    </div>
                )}
            </MetalFrame>

            <style>{`
                .pvp-lobby {
                    max-width: 480px;
                    margin: 0 auto;
                }

                .lobby-header {
                    text-align: center;
                    margin-bottom: 24px;
                }

                .pvp-icon {
                    color: #ef4444;
                    margin-bottom: 12px;
                }

                .lobby-header h1 {
                    font-size: 28px;
                    font-weight: 700;
                    color: #fff;
                    margin: 0 0 8px 0;
                }

                .lobby-header p {
                    color: rgba(255, 255, 255, 0.6);
                    margin: 0;
                }

                .stake-section {
                    margin-bottom: 20px;
                }

                .stake-section h3 {
                    font-size: 14px;
                    color: rgba(255, 255, 255, 0.7);
                    margin: 0 0 12px 0;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }

                .stake-grid {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 10px;
                }

                .stake-btn {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 6px;
                    padding: 16px 8px;
                    background: rgba(30, 41, 59, 0.8);
                    border: 2px solid rgba(255, 255, 255, 0.1);
                    border-radius: 12px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    color: #fff;
                }

                .stake-btn:hover:not(.disabled) {
                    border-color: var(--stake-color);
                }

                .stake-btn.selected {
                    border-color: var(--stake-color);
                    background: rgba(var(--stake-color), 0.15);
                    box-shadow: 0 0 20px rgba(var(--stake-color), 0.3);
                }

                .stake-btn.disabled {
                    opacity: 0.4;
                    cursor: not-allowed;
                }

                .stake-amount {
                    font-size: 18px;
                    font-weight: 700;
                }

                .stake-info {
                    background: rgba(0, 0, 0, 0.2);
                    border-radius: 12px;
                    padding: 16px;
                    margin-bottom: 16px;
                }

                .info-row {
                    display: flex;
                    justify-content: space-between;
                    padding: 8px 0;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                    color: rgba(255, 255, 255, 0.7);
                }

                .info-row:last-child {
                    border-bottom: none;
                }

                .info-row.small {
                    font-size: 12px;
                    color: rgba(255, 255, 255, 0.4);
                }

                .info-row .value {
                    font-weight: 700;
                    color: #fff;
                }

                .info-row .value.win {
                    color: #22c55e;
                }

                .balance-display {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    padding: 12px;
                    background: rgba(0, 212, 255, 0.1);
                    border-radius: 8px;
                    color: #00d4ff;
                    font-size: 14px;
                    margin-bottom: 20px;
                }

                .searching-state {
                    text-align: center;
                    padding: 20px 0;
                }

                .search-spinner {
                    color: #00d4ff;
                    margin-bottom: 16px;
                }

                .searching-state h3 {
                    font-size: 20px;
                    color: #fff;
                    margin: 0 0 12px 0;
                }

                .search-time {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    color: rgba(255, 255, 255, 0.5);
                    margin: 0 0 8px 0;
                }

                .search-stake {
                    color: #00d4ff;
                    font-weight: 600;
                    margin: 0 0 20px 0;
                }

                .match-found {
                    text-align: center;
                }

                .match-banner {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 12px;
                    padding: 16px;
                    background: linear-gradient(90deg, rgba(34, 197, 94, 0.2), rgba(34, 197, 94, 0.1));
                    border: 1px solid rgba(34, 197, 94, 0.3);
                    border-radius: 12px;
                    color: #22c55e;
                    margin-bottom: 20px;
                }

                .match-banner h3 {
                    font-size: 18px;
                    margin: 0;
                }

                .opponent-card {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    padding: 20px;
                    background: rgba(0, 0, 0, 0.2);
                    border-radius: 12px;
                    margin-bottom: 20px;
                }

                .opponent-avatar {
                    width: 56px;
                    height: 56px;
                    border-radius: 50%;
                    background: rgba(255, 255, 255, 0.1);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    overflow: hidden;
                    color: rgba(255, 255, 255, 0.5);
                }

                .opponent-avatar img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }

                .opponent-info {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }

                .opponent-name {
                    font-size: 18px;
                    font-weight: 700;
                    color: #fff;
                }

                .opponent-stats {
                    font-size: 13px;
                    color: rgba(255, 255, 255, 0.5);
                }

                .starting-soon {
                    font-size: 16px;
                    color: #fbbf24;
                    font-weight: 600;
                    animation: pulse 1s ease-in-out infinite;
                }

                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
            `}</style>
        </div>
    );
}
