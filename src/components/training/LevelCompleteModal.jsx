/**
 * LevelCompleteModal — Shows results after completing a training level
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * FUTURISTIC METAL UI - Phase 4 Update
 */

import React from 'react';

export default function LevelCompleteModal({
    level,
    passed,
    correctCount,
    totalQuestions,
    xpEarned, // legacy prop name — treated as diamondsEarned
    bestStreak,
    passThreshold,
    onNextLevel,
    onRetry,
    onExit,
    isMaxLevel = false,
}) {
    const accuracy = Math.round((correctCount / totalQuestions) * 100);

    return (
        <div className="level-modal-overlay smarterdesign">
            <div className="level-modal sp-training-modal-surface" role="dialog" aria-modal="true" aria-labelledby="level-complete-title">
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

                    <h2 id="level-complete-title" className={`title ${passed ? 'success' : 'warning'}`}>
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
                        <div className="xp-label">Diamonds Earned</div>
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

            <style dangerouslySetInnerHTML={{ __html: `
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
                    padding-top: max(env(safe-area-inset-top, 0px), 20px);
                    padding-bottom: max(env(safe-area-inset-bottom, 0px), 20px);
                    box-sizing: border-box;
                    animation: fadeIn 0.2s ease-out;
                }

                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }

                .level-modal {
                    position: relative;
                    background:
                        linear-gradient(165deg, #0c2031 0%, #06131f 48%, #020a12 100%) padding-box,
                        linear-gradient(135deg, #fbffff 0%, #647988 7%, #e6f7ff 14%, #17222a 25%, #a2b5bf 40%, #ffffff 49%, #4c6470 59%, #101a22 72%, #e6f4fa 88%, #718691 100%) border-box;
                    border: 3px solid transparent;
                    border-radius: 18px;
                    max-width: 420px;
                    width: 100%;
                    box-shadow: 
                        inset 0 1px 0 rgba(255,255,255,0.22),
                        inset 0 -1px 0 rgba(0,0,0,0.45),
                        0 20px 64px rgba(0,0,0,0.75),
                        0 0 40px rgba(0, 154, 227, 0.18);
                    animation: slideUp 0.3s ease-out;
                    font-family: var(--font-rajdhani, 'Rajdhani'), 'Inter', -apple-system, sans-serif;
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
                    font-size: 12px;
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
                    font-family: var(--sd-type, var(--font-rajdhani, 'Arial Narrow'), sans-serif);
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
                    color: #86daff; 
                    text-shadow: 0 0 20px rgba(134, 218, 255, 0.45);
                }

                .subtitle {
                    color: #c4d2df;
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
                    background: linear-gradient(180deg, #102438 0%, #050f19 100%);
                    border: 1px solid #688299;
                    border-top-color: #aec0d0;
                    border-radius: 10px;
                    padding: 12px;
                }

                .stat-value {
                    color: #f3f7fb;
                    font-size: 22px;
                    font-weight: 700;
                }

                .stat-label {
                    color: #b6c8d6;
                    font-size: 12px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    margin-top: 4px;
                }

                .xp-row {
                    background: linear-gradient(135deg, rgba(8, 124, 250, 0.16) 0%, rgba(5, 22, 38, 0.85) 100%);
                    border: 1px solid #56d8ff;
                    border-radius: 12px;
                    padding: 16px;
                    margin-bottom: 24px;
                }

                .xp-label {
                    color: #c4d2df;
                    font-size: 12px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }

                .xp-value {
                    color: #8de6ff;
                    font-size: 32px;
                    font-weight: 800;
                    text-shadow: 0 0 18px rgba(141, 230, 255, 0.45);
                }

                .button-row {
                    display: flex;
                    gap: 12px;
                }

                .btn {
                    flex: 1;
                    min-height: 48px;
                    padding: 12px 20px;
                    border-radius: 12px;
                    border: 2px solid transparent;
                    font-size: 16px;
                    font-weight: 700;
                    font-family: var(--font-rajdhani, 'Rajdhani'), sans-serif;
                    letter-spacing: 0.5px;
                    cursor: pointer;
                    transition: box-shadow 0.15s ease, filter 0.15s ease;
                }

                .btn-primary {
                    background:
                        linear-gradient(180deg, #51c9ff 0%, #0873ff 10%, #0648e2 38%, #022695 82%, #0b71c4 100%) padding-box,
                        linear-gradient(135deg, #fbffff 0%, #647988 7%, #e6f7ff 14%, #17222a 25%, #a2b5bf 40%, #ffffff 49%, #4c6470 59%, #101a22 72%, #e6f4fa 88%, #718691 100%) border-box;
                    color: #ffffff;
                    box-shadow: inset 0 1px 2px #b9efff, 0 4px 16px rgba(6, 115, 199, 0.35);
                }

                .btn-primary:hover {
                    box-shadow: inset 0 1px 2px #fff, 0 0 22px rgba(81, 201, 255, 0.45);
                }

                .btn-secondary {
                    background:
                        linear-gradient(180deg, #34434c 0%, #0d1b25 12%, #030a0e 52%, #07151d 86%, #142e3b 100%) padding-box,
                        linear-gradient(135deg, #fbffff 0%, #647988 7%, #e6f7ff 14%, #17222a 25%, #a2b5bf 40%, #ffffff 49%, #4c6470 59%, #101a22 72%, #e6f4fa 88%, #718691 100%) border-box;
                    color: #f3f7fb;
                    box-shadow: inset 0 1px 1px rgba(255,255,255,0.4), 0 3px 8px rgba(0,0,0,0.4);
                }

                .btn-secondary:hover {
                    box-shadow: inset 0 1px 1px rgba(255,255,255,0.6), 0 0 14px rgba(0, 138, 211, 0.28);
                }
            ` }} />
        </div>
    );
}
