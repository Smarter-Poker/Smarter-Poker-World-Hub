/* ═══════════════════════════════════════════════════════════════════════════
   ONBOARDING OVERLAY — Guided tour for first-time users
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// 📋 TOUR STEPS
// ─────────────────────────────────────────────────────────────────────────────
interface TourStep {
    id: string;
    title: string;
    description: string;
    target: string; // CSS selector or 'center' for centered
    position: 'top' | 'bottom' | 'left' | 'right' | 'center';
}

const TOUR_STEPS: TourStep[] = [
    {
        id: 'welcome',
        title: 'Welcome to Smarter Poker! 🎉',
        description: "Let's take a quick tour of your World Hub — your home base for everything poker.",
        target: 'center',
        position: 'center',
    },
    {
        id: 'carousel',
        title: 'Your World Cards',
        description: 'Swipe through different worlds to explore Training, Social, Clubs, and more. Click any card to dive in!',
        target: 'center',
        position: 'center',
    },
    {
        id: 'footer',
        title: 'Quick Access Bar',
        description: 'Your 6 most visited worlds are always at the bottom for quick access.',
        target: 'center',
        position: 'center',
    },
    {
        id: 'profile',
        title: 'Your Profile',
        description: 'Click here to view your profile, settings, and progress.',
        target: 'center',
        position: 'center',
    },
    {
        id: 'complete',
        title: "You're all set! 🚀",
        description: "Start exploring and become a smarter player. You've got this!",
        target: 'center',
        position: 'center',
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// 🎓 ONBOARDING OVERLAY COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
interface OnboardingOverlayProps {
    isOpen: boolean;
    onComplete: () => void;
}

export function OnboardingOverlay({ isOpen, onComplete }: OnboardingOverlayProps) {
    const [currentStep, setCurrentStep] = useState(0);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setIsVisible(true);
            setCurrentStep(0);
        }
    }, [isOpen]);

    const handleNext = () => {
        if (currentStep < TOUR_STEPS.length - 1) {
            setCurrentStep(currentStep + 1);
        } else {
            handleComplete();
        }
    };

    const handleSkip = () => {
        handleComplete();
    };

    const handleComplete = () => {
        setIsVisible(false);
        setTimeout(onComplete, 300);
    };

    if (!isOpen) return null;

    const step = TOUR_STEPS[currentStep];
    const progress = ((currentStep + 1) / TOUR_STEPS.length) * 100;

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.8)',
                backdropFilter: 'blur(5px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 2000,
                opacity: isVisible ? 1 : 0,
                transition: 'opacity 0.3s ease',
            }}
        >
            {/* Tour Card */}
            <div
                style={{
                    maxWidth: 450,
                    width: '90%',
                    background: 'linear-gradient(180deg, rgba(20, 40, 80, 0.98), rgba(10, 25, 50, 0.98))',
                    borderRadius: 20,
                    border: '2px solid rgba(0, 212, 255, 0.4)',
                    boxShadow: '0 20px 80px rgba(0, 0, 0, 0.6), 0 0 60px rgba(0, 212, 255, 0.15)',
                    padding: 32,
                    textAlign: 'center',
                }}
            >
                {/* Progress Bar */}
                <div
                    style={{
                        width: '100%',
                        height: 4,
                        background: 'rgba(255, 255, 255, 0.1)',
                        borderRadius: 2,
                        marginBottom: 24,
                        overflow: 'hidden',
                    }}
                >
                    <div
                        style={{
                            width: `${progress}%`,
                            height: '100%',
                            background: 'linear-gradient(90deg, #00d4ff, #00ff88)',
                            transition: 'width 0.5s ease',
                        }}
                    />
                </div>

                {/* Step Content */}
                <h2
                    style={{
                        fontFamily: 'Orbitron, sans-serif',
                        fontSize: 24,
                        fontWeight: 700,
                        color: '#ffffff',
                        margin: '0 0 12px 0',
                        textShadow: '0 0 20px rgba(0, 212, 255, 0.3)',
                    }}
                >
                    {step.title}
                </h2>
                <p
                    style={{
                        fontFamily: 'Inter, sans-serif',
                        fontSize: 15,
                        lineHeight: 1.6,
                        color: 'rgba(255, 255, 255, 0.8)',
                        margin: '0 0 28px 0',
                    }}
                >
                    {step.description}
                </p>

                {/* Buttons */}
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                    <button
                        onClick={handleSkip}
                        style={{
                            padding: '12px 24px',
                            background: 'transparent',
                            border: '1px solid rgba(255, 255, 255, 0.3)',
                            borderRadius: 8,
                            fontFamily: 'Inter, sans-serif',
                            fontSize: 14,
                            fontWeight: 600,
                            color: 'rgba(255, 255, 255, 0.7)',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.5)';
                            e.currentTarget.style.color = '#ffffff';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
                        }}
                    >
                        {currentStep === TOUR_STEPS.length - 1 ? 'Close' : 'Skip Tour'}
                    </button>
                    <button
                        onClick={handleNext}
                        style={{
                            padding: '12px 32px',
                            background: 'linear-gradient(135deg, #00d4ff, #0088cc)',
                            border: 'none',
                            borderRadius: 8,
                            fontFamily: 'Inter, sans-serif',
                            fontSize: 14,
                            fontWeight: 600,
                            color: '#ffffff',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            boxShadow: '0 4px 20px rgba(0, 212, 255, 0.3)',
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = '0 6px 25px rgba(0, 212, 255, 0.4)';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 212, 255, 0.3)';
                        }}
                    >
                        {currentStep === TOUR_STEPS.length - 1 ? "Let's Go!" : 'Next'}
                    </button>
                </div>

                {/* Step Indicator */}
                <div style={{ marginTop: 20, display: 'flex', gap: 6, justifyContent: 'center' }}>
                    {TOUR_STEPS.map((_, index) => (
                        <div
                            key={index}
                            style={{
                                width: index === currentStep ? 20 : 8,
                                height: 8,
                                borderRadius: 4,
                                background: index <= currentStep ? '#00d4ff' : 'rgba(255, 255, 255, 0.2)',
                                transition: 'all 0.3s ease',
                            }}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

export default OnboardingOverlay;
