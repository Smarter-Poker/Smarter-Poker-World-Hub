import GTOQuestionCard from '../GTOQuestionCard';
import PlayingCard from '../../poker/PlayingCard';

/**
 * PsychologyTiltControlUI — 1:1 Club Arena Poker Table Stage for Mental Game (psy-001..psy-020)
 * Renders the authentic Club Arena racetrack table (skin_carbon_ion-CEYiGucA-v6.png) with
 * Villain & Hero Club Arena seats, stacks, Dealer button, live Pot badge, and Club Arena
 * hole cards framed inside #SMARTERDESIGN brushed-steel chrome above the scenario card so
 * all 107 Training Games share one unified 1:1 Poker Arena experience.
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
    const potBb = Number.isFinite(Number(question?.scenario?.pot)) && Number(question.scenario.pot) > 0
        ? Number(question.scenario.pot)
        : 6.5;
    const stackBb = Number.isFinite(Number(question?.scenario?.stackDepth)) && Number(question.scenario.stackDepth) > 0
        ? Number(question.scenario.stackDepth)
        : 100;
    const heroPos = String(question?.scenario?.heroPosition || 'BTN').toUpperCase();
    const villainPos = String(question?.scenario?.villainPosition || 'CO').toUpperCase();
    const heroCards = Array.isArray(question?.scenario?.heroCards) && question.scenario.heroCards.length >= 2
        ? question.scenario.heroCards.slice(0, 2)
        : ['As', 'Kh'];

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
                gap: 8,
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
                    padding: '6px 14px',
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
                            background: 'radial-gradient(circle at 34% 28%, #ffffff 0%, #dfe8eb 42%, #6f7d83 72%, #cfd9dc 100%)',
                            color: '#11181c',
                            fontWeight: 900,
                            fontSize: 12,
                            border: '1px solid rgba(218, 234, 239, 0.88)',
                            boxShadow: '0 3px 8px rgba(0, 0, 0, 0.55)',
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
                        {`6-Max Cash · ${stackBb} BB`}
                    </span>
                </div>

                {tiltLevel && (
                    <span
                        data-psychology-tilt-badge="true"
                        style={{
                            padding: '3px 10px',
                            border: '1px solid rgba(134, 218, 255, 0.42)',
                            background: 'rgba(10, 24, 41, 0.85)',
                            color: '#86daff',
                            fontSize: 12,
                            fontWeight: 700,
                            borderRadius: 6,
                        }}
                    >
                        {[
                            `Pressure: ${tiltLevel}`,
                            emotionalState,
                            triggerType,
                        ].filter(Boolean).join(' · ')}
                    </span>
                )}
            </div>

            {/* 1:1 Club Arena Poker Table Stage (Real Racetrack Felt + Club Arena Seats + Hole Cards) */}
            <div
                style={{
                    position: 'relative',
                    padding: 'clamp(8px, 1.8vw, 16px)',
                    background:
                        'radial-gradient(ellipse 76% 64% at 50% 44%, #0f5138 0%, #093727 52%, #051d17 82%, #040d18 100%)',
                    border: '5px solid transparent',
                    borderImage: "url('/images/smarterdesign/chrome-readout.webp') 21 / 8px stretch",
                    boxShadow:
                        'inset 0 0 0 2px rgba(134, 218, 255, 0.16), inset 0 18px 46px rgba(0, 0, 0, 0.5), 0 18px 44px rgba(0, 0, 0, 0.55)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                }}
            >
                {/* Live 1:1 Club Arena Poker Table Felt Band */}
                <div
                    data-club-arena-racetrack="true"
                    style={{
                        position: 'relative',
                        width: '100%',
                        minHeight: 146,
                        borderRadius: 14,
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: 8,
                        padding: '10px clamp(12px, 3vw, 28px) 12px',
                        background:
                            'radial-gradient(ellipse 68% 82% at 50% 50%, rgba(16, 185, 129, 0.22) 0%, rgba(6, 52, 38, 0.62) 55%, rgba(4, 13, 24, 0.94) 100%)',
                        border: '1px solid rgba(134, 218, 255, 0.3)',
                        boxShadow: 'inset 0 0 28px rgba(0, 0, 0, 0.65)',
                    }}
                >
                    {/* Authentic Club Arena Carbon-Ion Racetrack Felt Backdrop */}
                    <div
                        aria-hidden="true"
                        style={{
                            position: 'absolute',
                            inset: 0,
                            backgroundImage: 'url("/hub/club-arena/assets/skin_carbon_ion-CEYiGucA-v6.png")',
                            backgroundSize: '100% 240%',
                            backgroundPosition: 'center',
                            backgroundRepeat: 'no-repeat',
                            opacity: 0.44,
                            pointerEvents: 'none',
                        }}
                    />

                    {/* Top Center Pot + Smarter.Poker Felt Watermark Row (zero overlap at 390px mobile) */}
                    <div
                        style={{
                            position: 'relative',
                            zIndex: 2,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 10,
                            flexWrap: 'wrap',
                        }}
                    >
                        <div
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '3px 12px',
                                borderRadius: 999,
                                background: 'rgba(4, 13, 24, 0.88)',
                                border: '1px solid rgba(134, 218, 255, 0.48)',
                                color: '#f2f7ff',
                                fontSize: 12,
                                fontWeight: 800,
                                letterSpacing: 0.4,
                                whiteSpace: 'nowrap',
                            }}
                        >
                            <span>{`POT ${potBb} BB`}</span>
                        </div>
                        <div
                            style={{
                                fontSize: 12,
                                fontWeight: 800,
                                color: 'rgba(134, 218, 255, 0.88)',
                                letterSpacing: 0.5,
                                textShadow: '0 1px 6px rgba(0, 0, 0, 0.85)',
                            }}
                        >
                            Smarter.Poker
                        </div>
                    </div>

                    {/* Seats Row: Villain Left vs Hero + Hole Cards Right */}
                    <div
                        style={{
                            position: 'relative',
                            zIndex: 2,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 12,
                            width: '100%',
                        }}
                    >
                        {/* Villain Club Arena Seat */}
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                flexShrink: 0,
                            }}
                        >
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <img
                                    src="/avatars/table/free_business.webp"
                                    alt={`${villainPos} seat`}
                                    width={48}
                                    height={48}
                                    style={{
                                        width: 48,
                                        height: 48,
                                        objectFit: 'contain',
                                        filter: 'drop-shadow(0 5px 5px rgba(0,0,0,0.82))',
                                    }}
                                />
                                <div
                                    style={{
                                        marginTop: -6,
                                        padding: '2px 10px',
                                        borderRadius: 7,
                                        background: 'linear-gradient(180deg, rgba(20,20,23,0.97) 0%, rgba(6,6,8,0.98) 100%)',
                                        border: '1px solid rgba(134, 218, 255, 0.55)',
                                        textAlign: 'center',
                                        lineHeight: 1.15,
                                        minWidth: 70,
                                    }}
                                >
                                    <div style={{ fontSize: 12, fontWeight: 800, color: '#ffffff' }}>{villainPos}</div>
                                    <div style={{ fontSize: 12, fontWeight: 800, color: '#dbe8f4' }}>{`${stackBb} BB`}</div>
                                </div>
                            </div>
                            <div aria-hidden="true" style={{ display: 'flex', alignItems: 'center' }}>
                                <img
                                    src="/hub/club-arena/cards/backs/table/classic_red.webp"
                                    alt=""
                                    width={22}
                                    height={32}
                                    style={{ width: 22, height: 32, borderRadius: 3, transform: 'rotate(-7deg)', boxShadow: '0 3px 8px rgba(0,0,0,0.65)' }}
                                />
                                <img
                                    src="/hub/club-arena/cards/backs/table/classic_red.webp"
                                    alt=""
                                    width={22}
                                    height={32}
                                    style={{ width: 22, height: 32, borderRadius: 3, marginLeft: -8, transform: 'rotate(7deg)', boxShadow: '0 3px 8px rgba(0,0,0,0.65)' }}
                                />
                            </div>
                        </div>

                        {/* Hero Club Arena Seat + Hole Cards */}
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                flexShrink: 0,
                            }}
                        >
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <img
                                    src="/avatars/table/free_cowboy.webp"
                                    alt={`Hero ${heroPos} seat`}
                                    width={50}
                                    height={50}
                                    style={{
                                        width: 50,
                                        height: 50,
                                        objectFit: 'contain',
                                        filter: 'drop-shadow(0 0 8px rgba(134, 218, 255, 0.55)) drop-shadow(0 5px 5px rgba(0,0,0,0.82))',
                                    }}
                                />
                                <div
                                    style={{
                                        marginTop: -6,
                                        padding: '2px 10px',
                                        borderRadius: 7,
                                        background: 'linear-gradient(180deg, rgba(20,20,23,0.97) 0%, rgba(6,6,8,0.98) 100%)',
                                        border: '1px solid rgba(134, 218, 255, 0.9)',
                                        boxShadow: '0 0 12px rgba(86, 216, 255, 0.32)',
                                        textAlign: 'center',
                                        lineHeight: 1.15,
                                        minWidth: 74,
                                    }}
                                >
                                    <div style={{ fontSize: 12, fontWeight: 800, color: '#ffffff' }}>{`HERO · ${heroPos}`}</div>
                                    <div style={{ fontSize: 12, fontWeight: 800, color: '#86daff' }}>{`${stackBb} BB`}</div>
                                </div>
                            </div>
                            <div
                                aria-label={`Hero cards ${heroCards.join(' ')}`}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 3, filter: 'drop-shadow(0 6px 10px rgba(0,0,0,0.72))' }}
                            >
                                {heroCards.map((card, i) => (
                                    <PlayingCard arena key={`${card}-${i}`} card={card} width={38} />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

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
