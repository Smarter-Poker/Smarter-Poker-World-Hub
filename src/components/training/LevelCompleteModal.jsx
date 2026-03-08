/**
 * LevelCompleteModal — Shows results after completing a training level
 * ═══════════════════════════════════════════════════════════════════════════
 * FUTURISTIC METAL UI - Phase 4 Update
 */

import React from 'react';

export default function LevelCompleteModal({
    level,
    passed,
    correctCount,
    totalQuestions,
    xpEarned,
    bestStreak,
    passThreshold,
    onNextLevel,
    onRetry,
    onExit,
    isMaxLevel = false,
}) {
    const accuracy = Math.round((correctCount / totalQuestions) * 100);

    return (
        <div className="level-modal-overlay">
            <div className="level-modal">
                {/* Corner Bolts */}
                <div className="bolt bolt-tl" />
                <div className="bolt bolt-tr" />
                <div className="bolt bolt-bl" />
                <div className="bolt bolt-br" />

                {/* Neon Strips */}
                <div className="neon-strip neon-left" />
                <div className="neon-strip neon-right" />

                <div className="modal-content">
                    <div className="icon">
                        {passed ? '★' : '★'}
                    </div>

                    <h2 className={`title ${passed ? 'success' : 'warning'}`}>
                        {passed
                            ? (isMaxLevel ? 'Game Mastered!' : 'Level Complete!')
                            : 'Level Failed'}
                    </h2>

                    <p className="subtitle">
                        {passed
                            ? (isMaxLevel
                                ? 'You achieved 100% mastery!'
                                : `You passed Level ${level}!`)
                            : `You needed ${passThreshold}% to pass`}
                    </p>

                    <div className="stats-grid">
                        <div className="stat-box">
                            <div className="stat-value">{correctCount}/{totalQuestions}</div>
                            <div className="stat-label">Correct</div>
                        </div>
                        <div className="stat-box">
                            <div className="stat-value">{accuracy}%</div>
                            <div className="stat-label">Accuracy</div>
                        </div>
                        <div className="stat-box">
                            <div className="stat-value">{bestStreak}</div>
                            <div className="stat-label">Best Streak</div>
                        </div>
                        <div className="stat-box">
                            <div className="stat-value">Lv.{level}</div>
                            <div className="stat-label">Level</div>
                        </div>
                    </div>

                    <div className="xp-row">
                        <div className="xp-label">XP Earned</div>
                        <div className="xp-value">+{xpEarned}</div>
                    </div>

                    <div className="button-row">
                        <button className="btn btn-secondary" onClick={onExit}>
                            Exit
                        </button>
                        {passed ? (
                            isMaxLevel ? (
                                <button className="btn btn-primary" onClick={onExit}>
                                    Celebrate!
                                </button>
                            ) : (
                                <button className="btn btn-primary" onClick={onNextLevel}>
                                    Next Level
                                </button>
                            )
                        ) : (
                            <button className="btn btn-primary" onClick={onRetry}>
                                Try Again
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <style jsx>{`
                .level-modal-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(0,0,0,0.9);
                    backdrop-filter: blur(8px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 10000;
                    padding: 20px;
                    animation: fadeIn 0.2s ease-out;
                }

                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }

                .level-modal {
                    position: relative;
                    background: linear-gradient(180deg, #3d4f5f 0%, #1a2332 50%, #0d1117 100%);
                    border: 3px solid #3d4f5f;
                    border-radius: 16px;
                    max-width: 420px;
                    width: 100%;
                    box-shadow: 
                        inset 0 1px 0 rgba(255,255,255,0.1),
                        inset 0 -1px 0 rgba(0,0,0,0.3),
                        0 8px 40px rgba(0,0,0,0.6),
                        0 0 60px rgba(0, 212, 255, 0.15);
                    animation: slideUp 0.3s ease-out;
                    font-family: 'Rajdhani', 'Inter', -apple-system, sans-serif;
                }

                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(20px) scale(0.95); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }

                /* Corner Bolts */
                .bolt {
                    position: absolute;
                    width: 14px;
                    height: 14px;
                    background: radial-gradient(circle at 30% 30%, #6a7a8a 0%, #3a4a5a 60%, #1a2a3a 100%);
                    border-radius: 50%;
                    border: 1px solid rgba(255,255,255,0.15);
                    box-shadow: inset 0 1px 2px rgba(255,255,255,0.2), 0 2px 4px rgba(0,0,0,0.4);
                    z-index: 10;
                }

                .bolt::after {
                    content: '+';
                    position: absolute;
                    inset: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 9px;
                    color: #1a2a3a;
                    font-weight: bold;
                }

                .bolt-tl { top: 10px; left: 10px; }
                .bolt-tr { top: 10px; right: 10px; }
                .bolt-bl { bottom: 10px; left: 10px; }
                .bolt-br { bottom: 10px; right: 10px; }

                /* Neon Strips */
                .neon-strip {
                    position: absolute;
                    width: 4px;
                    top: 15%;
                    bottom: 15%;
                    background: #00D4FF;
                    border-radius: 2px;
                    box-shadow: 0 0 10px #00D4FF, 0 0 20px rgba(0, 212, 255, 0.6);
                    z-index: 5;
                    animation: neon-pulse 2s ease-in-out infinite;
                }

                .neon-left { left: 14px; }
                .neon-right { right: 14px; }

                @keyframes neon-pulse {
                    0%, 100% { opacity: 1; box-shadow: 0 0 10px #00D4FF, 0 0 20px rgba(0, 212, 255, 0.6); }
                    50% { opacity: 0.8; box-shadow: 0 0 15px #00D4FF, 0 0 30px rgba(0, 212, 255, 0.8); }
                }

                .modal-content {
                    padding: 32px 40px;
                    text-align: center;
                }

                .icon {
                    font-size: 64px;
                    margin-bottom: 16px;
                }

                .title {
                    font-family: 'Orbitron', 'Rajdhani', sans-serif;
                    font-size: 26px;
                    font-weight: 700;
                    margin: 0 0 8px;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }

                .title.success { 
                    color: #4ade80; 
                    text-shadow: 0 0 20px rgba(74, 222, 128, 0.5);
                }
                .title.warning { 
                    color: #fbbf24; 
                    text-shadow: 0 0 20px rgba(251, 191, 36, 0.5);
                }

                .subtitle {
                    color: #94a3b8;
                    font-size: 16px;
                    margin: 0 0 24px;
                }

                .stats-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 12px;
                    margin-bottom: 20px;
                }

                .stat-box {
                    background: linear-gradient(180deg, rgba(61, 79, 95, 0.2) 0%, rgba(13, 17, 23, 0.4) 100%);
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 10px;
                    padding: 12px;
                }

                .stat-value {
                    color: #fff;
                    font-size: 22px;
                    font-weight: 700;
                }

                .stat-label {
                    color: #64748b;
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    margin-top: 4px;
                }

                .xp-row {
                    background: linear-gradient(135deg, rgba(0, 212, 255, 0.1) 0%, rgba(0, 153, 204, 0.05) 100%);
                    border: 1px solid rgba(0, 212, 255, 0.3);
                    border-radius: 12px;
                    padding: 16px;
                    margin-bottom: 24px;
                }

                .xp-label {
                    color: #64748b;
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }

                .xp-value {
                    color: #00D4FF;
                    font-size: 32px;
                    font-weight: 800;
                    text-shadow: 0 0 20px rgba(0, 212, 255, 0.6);
                }

                .button-row {
                    display: flex;
                    gap: 12px;
                }

                .btn {
                    flex: 1;
                    padding: 14px 24px;
                    border-radius: 10px;
                    border: none;
                    font-size: 15px;
                    font-weight: 600;
                    font-family: 'Rajdhani', sans-serif;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .btn-primary {
                    background: linear-gradient(135deg, #00D4FF, #0099CC);
                    color: #000;
                    box-shadow: 0 0 15px rgba(0, 212, 255, 0.3);
                }

                .btn-primary:hover {
                    box-shadow: 0 0 25px rgba(0, 212, 255, 0.5);
                    transform: translateY(-1px);
                }

                .btn-secondary {
                    background: rgba(255,255,255,0.1);
                    color: #fff;
                    border: 1px solid rgba(255,255,255,0.2);
                }

                .btn-secondary:hover {
                    background: rgba(255,255,255,0.15);
                    border-color: rgba(255,255,255,0.3);
                }
            `}</style>
        </div>
    );
}
