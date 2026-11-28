import GTOQuestionCard from '../GTOQuestionCard';
import PlayingCard from '../../poker/PlayingCard';

/**
 * PsychologyTiltControlUI — 1:1 Club Arena Poker Table Stage for Mental Game (psy-001..psy-020)
 * Wraps the scenario decision card inside the shared Club Arena emerald racetrack felt,
 * brushed-steel #SMARTERDESIGN bezel, dealer button, and 4-color Club Arena table cards
 * so all 107 Training Games share one unified 1:1 Poker Arena experience.
 */
export default function PsychologyTiltControlUI({
    gameId,
    gameName = 'Mental Game',
    question,
    onAnswer,
    showFeedback,
    feedbackResult,
    explanation,
    questionNumber,
    totalQuestions,
    level,
    onNextHand,
}) {
    if (!question) return null;

    const tiltMeta = question?.metadata || null;
    const tiltLevel = tiltMeta?.tiltLevel || null;
    const emotionalState = tiltMeta?.emotionalState || null;
    const triggerType = tiltMeta?.triggerType || null;

    return (
        <div
            className="smarterdesign"
            data-training-game-id={gameId}
            data-training-ui="psychology-scenario"
            data-club-arena-table-stage="true"
            style={{
                width: '100%',
                maxWidth: 1120,
                margin: '0 auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                fontFamily: "var(--font-inter, Inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            }}
        >
            {/* 1:1 Club Arena Table Header Strip */}
            <div
                className="sd-panel"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 8,
                    padding: '8px 14px',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span
                        style={{
                            width: 24,
                            height: 24,
                            borderRadius: '50%',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'linear-gradient(180deg, #f8fafc 0%, #cbd5e1 100%)',
                            color: '#040d18',
                            fontWeight: 900,
                            fontSize: 12,
                            border: '2px solid #0f172a',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.45)',
                            flexShrink: 0,
                        }}
                        aria-hidden="true"
                    >
                        D
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#f2f7ff' }}>
                        {gameName}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#86daff' }}>
                        6-Max Cash · 100 BB
                    </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {tiltLevel && (
                        <span
                            data-psychology-tilt-badge="true"
                            style={{
                                padding: '3px 10px',
                                border: '1px solid rgba(134, 218, 255, 0.42)',
                                background: 'rgba(10, 24, 41, 0.82)',
                                color: '#86daff',
                                fontSize: 12,
                                fontWeight: 700,
                            }}
                        >
                            {[
                                `Pressure: ${tiltLevel}`,
                                emotionalState,
                                triggerType,
                            ].filter(Boolean).join(' · ')}
                        </span>
                    )}
                    <div
                        aria-hidden="true"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                        <PlayingCard arena card="As" width={26} />
                        <PlayingCard arena card="Kh" width={26} />
                    </div>
                </div>
            </div>

            {/* 1:1 Club Arena Emerald Racetrack Felt Stage */}
            <div
                style={{
                    position: 'relative',
                    padding: 'clamp(10px, 2vw, 18px)',
                    background:
                        'radial-gradient(ellipse 76% 64% at 50% 44%, #0f5138 0%, #093727 52%, #051d17 82%, #040d18 100%)',
                    border: '5px solid transparent',
                    borderImage: "url('/images/smarterdesign/chrome-readout.webp') 21 / 8px stretch",
                    boxShadow:
                        'inset 0 0 0 2px rgba(134, 218, 255, 0.16), inset 0 18px 46px rgba(0, 0, 0, 0.5), 0 18px 44px rgba(0, 0, 0, 0.55)',
                }}
            >
                <GTOQuestionCard
                    gameId={gameId}
                    question={question}
                    level={level}
                    questionNumber={questionNumber}
                    totalQuestions={totalQuestions}
                    onAnswer={onAnswer}
                    showFeedback={showFeedback}
                    feedbackResult={feedbackResult}
                    explanation={explanation}
                    onNextHand={onNextHand}
                />
            </div>
        </div>
    );
}
