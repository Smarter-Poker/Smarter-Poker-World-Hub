/**
 * Timer Overlay Test - JUST THE TIMER
 * Testing positioning of the timer ring only
 */

// NOTE: `export const dynamic = 'force-dynamic'` used to live here. That is an
// App Router directive and is a no-op in the Pages Router, so this dev harness
// was fully reachable in production at /hub/trivia/timer-test. It is now gated
// server-side: getServerSideProps returns { notFound: true } in production, so
// the route renders the standard 404 instead of a half-built test page. The
// route is kept (not deleted) so local/preview timer tuning still works.

import { useState, useEffect, useRef, useCallback } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';

export async function getServerSideProps() {
    if (process.env.NODE_ENV === 'production') {
        return { notFound: true };
    }
    return { props: {} };
}

export default function TimerTest() {
    const [timeRemaining, setTimeRemaining] = useState(15);
    const [isRunning, setIsRunning] = useState(true);
    const startTimeRef = useRef(Date.now());
    const animationFrameRef = useRef(null);
    const TIME_LIMIT = 15;

    const updateTimer = useCallback(() => {
        if (!isRunning) return;

        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        const remaining = Math.max(0, TIME_LIMIT - elapsed);

        setTimeRemaining(remaining);

        if (remaining > 0) {
            animationFrameRef.current = requestAnimationFrame(updateTimer);
        }
    }, [isRunning]);

    useEffect(() => {
        if (isRunning) {
            startTimeRef.current = Date.now();
            animationFrameRef.current = requestAnimationFrame(updateTimer);
        }
        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [isRunning, updateTimer]);

    const handleReset = () => {
        setTimeRemaining(TIME_LIMIT);
        startTimeRef.current = Date.now();
        setIsRunning(true);
    };

    const progress = timeRemaining / TIME_LIMIT;
    const displaySeconds = Math.ceil(timeRemaining);
    const radius = 42;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference * (1 - progress);

    const getColor = () => {
        if (timeRemaining <= 3) return '#ef4444';
        if (timeRemaining <= 5) return '#f59e0b';
        return '#22d3ee';
    };

    // Defence in depth (after all hooks, so hook order is never conditional):
    // if this component is ever reached in a production bundle — e.g. a stale
    // client-side route manifest — render nothing rather than a test harness.
    if (process.env.NODE_ENV === 'production') return null;

    return (
        <>
            <SEOHead
                title="Timer Test"
                description="Trivia Timer Test Page."
                noindex={true}
            />

            <div style={{
                width: '100vw',
                height: '100vh', paddingBottom: 70,
                background: '#0a0a0a',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
            }}>
                {/* Frame Container */}
                <div style={{
                    position: 'relative',
                    width: '400px',
                    aspectRatio: '1 / 1',
                }}>
                    {/* Background Frame Image */}
                    <img
                        src="/images/trivia/blank-frame.png"
                        alt="Trivia Frame"
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain',
                        }}
                     loading="lazy" />

                    {/* TIMER OVERLAY - Adjust these values */}
                    <div style={{
                        position: 'absolute',
                        top: '5%',      // ADJUST THIS
                        right: '6%',    // ADJUST THIS
                        width: '14%',   // ADJUST THIS
                        aspectRatio: '1 / 1',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                    }}>
                        <svg
                            viewBox="0 0 100 100"
                            style={{
                                position: 'absolute',
                                width: '100%',
                                height: '100%',
                                transform: 'rotate(-90deg)',
                                filter: `drop-shadow(0 0 6px ${getColor()})`,
                            }}
                        >
                            <circle
                                cx="50"
                                cy="50"
                                r={radius}
                                fill="none"
                                stroke="rgba(34, 211, 238, 0.15)"
                                strokeWidth="5"
                            />
                            <circle
                                cx="50"
                                cy="50"
                                r={radius}
                                fill="none"
                                stroke={getColor()}
                                strokeWidth="5"
                                strokeLinecap="round"
                                strokeDasharray={circumference}
                                strokeDashoffset={strokeDashoffset}
                            />
                        </svg>
                        <span style={{
                            position: 'relative',
                            zIndex: 1,
                            fontSize: '20px',
                            fontWeight: '700',
                            fontFamily: 'Inter, sans-serif',
                            color: '#ffffff',
                            textShadow: `0 0 8px ${getColor()}`,
                        }}>
                            {displaySeconds}
                        </span>
                    </div>
                </div>

                {/* Reset Button */}
                <button
                    onClick={handleReset}
                    style={{
                        position: 'fixed',
                        bottom: 20,
                        right: 20,
                        padding: '12px 24px',
                        background: '#22d3ee',
                        color: '#000',
                        border: 'none',
                        borderRadius: 8,
                        cursor: 'pointer',
                        fontSize: 16,
                        fontWeight: 600,
                    }}
                >
                    Reset Timer
                </button>
              <BottomNavBar />
            </div>
        </>
    );
}
