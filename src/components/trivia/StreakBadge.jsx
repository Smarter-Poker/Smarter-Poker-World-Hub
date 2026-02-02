/**
 * STREAK BADGE COMPONENT — Visual display for trivia streaks
 * Shows tier badge, multiplier, and progress to next tier
 */

import React from 'react';
import { Flame, Shield, ChevronUp, Zap } from 'lucide-react';
import { formatStreakDisplay, getNextTier, STREAK_TIERS } from '../../config/triviaStreakSystem';

export default function StreakBadge({
    streakDays = 0,
    size = 'md',
    showProgress = true,
    showMultiplier = true,
    animated = true
}) {
    const streak = formatStreakDisplay(streakDays);
    const nextTier = getNextTier(streakDays);

    // Size configs
    const sizes = {
        sm: { container: 'min-width: 100px', fontSize: '12px', iconSize: 14 },
        md: { container: 'min-width: 140px', fontSize: '14px', iconSize: 18 },
        lg: { container: 'min-width: 180px', fontSize: '16px', iconSize: 24 }
    };
    const sizeConfig = sizes[size] || sizes.md;

    // Calculate progress percentage
    const progressPercent = nextTier
        ? ((streakDays - (STREAK_TIERS.find(t => t.id === streak.tier)?.minDays || 0)) /
            (nextTier.minDays - (STREAK_TIERS.find(t => t.id === streak.tier)?.minDays || 0))) * 100
        : 100;

    return (
        <div className={`streak-badge ${animated && streak.isMilestone ? 'milestone' : ''}`}>
            {/* Main badge */}
            <div className="streak-main" style={{ borderColor: streak.color }}>
                <div className="streak-icon" style={{ background: `${streak.color}20` }}>
                    {streak.badge || <Flame size={sizeConfig.iconSize} style={{ color: streak.color }} />}
                </div>

                <div className="streak-info">
                    <div className="streak-days" style={{ color: streak.color }}>
                        {streakDays} Day{streakDays !== 1 ? 's' : ''}
                    </div>
                    <div className="streak-title">{streak.title}</div>
                </div>

                {showMultiplier && streak.multiplier > 1 && (
                    <div className="multiplier-badge" style={{
                        background: streak.color,
                        boxShadow: `0 0 15px ${streak.color}80`
                    }}>
                        <Zap size={10} />
                        {streak.multiplier}x
                    </div>
                )}
            </div>

            {/* Progress to next tier */}
            {showProgress && nextTier && streak.daysUntilNext > 0 && (
                <div className="streak-progress">
                    <div className="progress-bar">
                        <div
                            className="progress-fill"
                            style={{
                                width: `${progressPercent}%`,
                                background: `linear-gradient(90deg, ${streak.color}, ${nextTier.color})`
                            }}
                        />
                    </div>
                    <div className="progress-text">
                        <ChevronUp size={12} />
                        {streak.daysUntilNext} days to {nextTier.badge || nextTier.title}
                    </div>
                </div>
            )}

            <style jsx>{`
                .streak-badge {
                    font-family: 'Inter', sans-serif;
                    ${sizeConfig.container};
                }
                
                .streak-badge.milestone {
                    animation: pulse 1.5s ease-in-out infinite;
                }
                
                @keyframes pulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.03); }
                }
                
                .streak-main {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 10px 14px;
                    background: rgba(0, 0, 0, 0.4);
                    border: 1px solid;
                    border-radius: 8px;
                    position: relative;
                }
                
                .streak-icon {
                    width: 36px;
                    height: 36px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 8px;
                    font-size: 20px;
                }
                
                .streak-info {
                    flex: 1;
                }
                
                .streak-days {
                    font-size: ${sizeConfig.fontSize};
                    font-weight: 700;
                    text-shadow: 0 0 10px currentColor;
                }
                
                .streak-title {
                    font-size: 11px;
                    color: rgba(255, 255, 255, 0.6);
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                
                .multiplier-badge {
                    position: absolute;
                    top: -8px;
                    right: -8px;
                    padding: 2px 8px;
                    border-radius: 12px;
                    font-size: 11px;
                    font-weight: 700;
                    color: #000;
                    display: flex;
                    align-items: center;
                    gap: 2px;
                }
                
                .streak-progress {
                    margin-top: 8px;
                }
                
                .progress-bar {
                    height: 4px;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 2px;
                    overflow: hidden;
                }
                
                .progress-fill {
                    height: 100%;
                    border-radius: 2px;
                    transition: width 0.5s ease;
                }
                
                .progress-text {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    margin-top: 4px;
                    font-size: 10px;
                    color: rgba(255, 255, 255, 0.5);
                }
            `}</style>
        </div>
    );
}
