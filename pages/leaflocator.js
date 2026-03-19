import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { motion, AnimatePresence } from 'framer-motion';
import { FullImageSlide } from '../src/components/pitch/SlideLayouts';

// =========================================================================
// LEAF LOCATOR — 32-SLIDE INVESTOR PITCH DECK
// Confidential & Proprietary
// =========================================================================

const SLIDES = [
    { type: 'full-image', bgImage: '/images/leaflocator/ll_slide_01_title_1773925000534.png' },
    { type: 'full-image', bgImage: '/images/leaflocator/ll_slide_02_problem_v2.png' },
    { type: 'full-image', bgImage: '/images/leaflocator/ll_slide_03_consumer_pain_v2.png' },
    { type: 'full-image', bgImage: '/images/leaflocator/ll_slide_04_dispensary_pain_1773925052800.png' },
    { type: 'full-image', bgImage: '/images/leaflocator/ll_slide_05_logistics_1773925064937.png' },
    { type: 'full-image', bgImage: '/images/leaflocator/ll_slide_06_solution_1773925075951.png' },
    { type: 'full-image', bgImage: '/images/leaflocator/ll_slide_07_master_plan_1773925108831.png' },
    { type: 'full-image', bgImage: '/images/leaflocator/ll_slide_08_moat_reviews_1773925121420.png' },
    { type: 'full-image', bgImage: '/images/leaflocator/ll_slide_09_moat_metrc_1773925135870.png' },
    { type: 'full-image', bgImage: '/images/leaflocator/ll_slide_10_moat_b2b_1773925167966.png' },
    { type: 'full-image', bgImage: '/images/leaflocator/ll_slide_11_moat_stealth_1773925182226.png' },
    { type: 'full-image', bgImage: '/images/leaflocator/ll_slide_12_phase1_aggregation_1773925199755.png' },
    { type: 'full-image', bgImage: '/images/leaflocator/ll_slide_13_price_engine_1773925238924.png' },
    { type: 'full-image', bgImage: '/images/leaflocator/ll_slide_14_search_1773925251765.png' },
    { type: 'full-image', bgImage: '/images/leaflocator/ll_slide_15_gamification_1773925264059.png' },
    { type: 'full-image', bgImage: '/images/leaflocator/ll_slide_16_ai_extras_1773925296475.png' },
    { type: 'full-image', bgImage: '/images/leaflocator/ll_slide_17_b2b_wholesale_1773925309296.png' },
    { type: 'full-image', bgImage: '/images/leaflocator/ll_slide_18_command_center_1773925322572.png' },
    { type: 'full-image', bgImage: '/images/leaflocator/ll_slide_19_sustainability_1773925357751.png' },
    { type: 'full-image', bgImage: '/images/leaflocator/ll_slide_20_shadow_delivery_1773925370840.png' },
    { type: 'full-image', bgImage: '/images/leaflocator/ll_slide_21_activation_flip_1773925382695.png' },
    { type: 'full-image', bgImage: '/images/leaflocator/ll_slide_22_customer_ux_1773925427814.png' },
    { type: 'full-image', bgImage: '/images/leaflocator/ll_slide_23_driver_app_1773925441301.png' },
    { type: 'full-image', bgImage: '/images/leaflocator/ll_slide_24_merchant_app_1773925457859.png' },
    { type: 'full-image', bgImage: '/images/leaflocator/ll_slide_25_ops_backend_1773925495722.png' },
    { type: 'full-image', bgImage: '/images/leaflocator/ll_slide_26_legal_1773925508558.png' },
    { type: 'full-image', bgImage: '/images/leaflocator/ll_slide_27_tech_stack_1_1773925523878.png' },
    { type: 'full-image', bgImage: '/images/leaflocator/ll_slide_28_tech_stack_2_1773925558078.png' },
    { type: 'full-image', bgImage: '/images/leaflocator/ll_slide_29_timeline_v2.png' },
    { type: 'full-image', bgImage: '/images/leaflocator/ll_slide_30_profit_centers_1773925584027.png' },
    { type: 'full-image', bgImage: '/images/leaflocator/ll_slide_31_financial_1773925618286.png' },
    { type: 'full-image', bgImage: '/images/leaflocator/ll_slide_32_zero_competition.png' },
    { type: 'full-image', bgImage: '/images/leaflocator/ll_slide_33_exit.png' },
    { type: 'full-image', bgImage: '/images/leaflocator/ll_slide_34_milestones.png' },
    { type: 'full-image', bgImage: '/images/leaflocator/ll_slide_35_why_now.png' },
    { type: 'full-image', bgImage: '/images/leaflocator/ll_slide_36_the_ask.png' },
];

// =========================================================================
// MAIN PAGE COMPONENT
// =========================================================================

export default function LeafLocatorPitchDeck() {
    const [currentSlide, setCurrentSlide] = useState(0);

    // Keyboard Navigation
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'ArrowRight' || e.key === ' ') {
                e.preventDefault();
                setCurrentSlide(s => Math.min(SLIDES.length - 1, s + 1));
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                setCurrentSlide(s => Math.max(0, s - 1));
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Touch/Swipe Navigation
    useEffect(() => {
        let touchStartX = 0;
        let touchEndX = 0;
        const handleTouchStart = (e) => { touchStartX = e.changedTouches[0].screenX; };
        const handleTouchEnd = (e) => {
            touchEndX = e.changedTouches[0].screenX;
            const diff = touchStartX - touchEndX;
            if (Math.abs(diff) > 50) {
                if (diff > 0) setCurrentSlide(s => Math.min(SLIDES.length - 1, s + 1));
                else setCurrentSlide(s => Math.max(0, s - 1));
            }
        };
        window.addEventListener('touchstart', handleTouchStart);
        window.addEventListener('touchend', handleTouchEnd);
        return () => {
            window.removeEventListener('touchstart', handleTouchStart);
            window.removeEventListener('touchend', handleTouchEnd);
        };
    }, []);

    const slide = SLIDES[currentSlide];

    return (
        <div className="ll-pitch-container" style={{ width: '100vw', height: '100vh', background: '#000', overflow: 'hidden', position: 'relative' }}>
            <Head>
                <title>Leaf Locator — Confidential Investor Pitch</title>
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
                <meta name="robots" content="noindex, nofollow" />
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
            </Head>

            {/* GLOBAL STYLES */}
            <style jsx global>{`
                .ll-pitch-container {
                    font-family: 'Inter', sans-serif;
                    user-select: none;
                    -webkit-user-select: none;
                }
                .ll-pitch-container::before {
                    content: '';
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: radial-gradient(ellipse at 50% 0%, rgba(0,200,83,0.03) 0%, transparent 60%);
                    pointer-events: none;
                    z-index: 0;
                }
            `}</style>

            {/* TOP CONTROLS — Branded Header */}
            <div style={{
                position: 'absolute', top: 0, left: 0, right: 0,
                padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                zIndex: 100,
                background: 'linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 70%, transparent 100%)'
            }}>
                {/* Logo */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                        width: 28, height: 28, borderRadius: 6,
                        background: 'linear-gradient(135deg, #00C853, #00E676)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 16, fontWeight: 900, color: '#000',
                        boxShadow: '0 0 12px rgba(0,200,83,0.4)'
                    }}>🌿</div>
                    <span style={{
                        color: '#00C853', fontWeight: 800, fontSize: 14, letterSpacing: 3,
                        textShadow: '0 0 10px rgba(0,200,83,0.3)'
                    }}>LEAF LOCATOR</span>
                    <span style={{
                        color: '#E02840', fontSize: 9, fontWeight: 700, letterSpacing: 2,
                        background: 'rgba(224,40,64,0.15)', padding: '2px 8px', borderRadius: 4,
                        border: '1px solid rgba(224,40,64,0.3)'
                    }}>CONFIDENTIAL</span>
                </div>

                {/* Slide Counter */}
                <div style={{ color: '#fff', opacity: 0.5, fontSize: 13, fontWeight: 500 }}>
                    Slide {currentSlide + 1} of {SLIDES.length}
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: 10 }}>
                    <button
                        onClick={() => window.print()}
                        style={{
                            background: 'rgba(0,200,83,0.08)', border: '1px solid rgba(0,200,83,0.4)',
                            color: '#00C853', padding: '6px 16px', borderRadius: 20, cursor: 'pointer',
                            fontSize: 12, fontWeight: 600, letterSpacing: 1,
                            backdropFilter: 'blur(8px)', transition: 'all 0.2s'
                        }}
                    >
                        Export PDF
                    </button>
                    <button
                        onClick={() => window.history.back()}
                        style={{
                            background: 'rgba(224,40,64,0.15)', border: '1px solid rgba(224,40,64,0.3)',
                            color: '#E02840', padding: '6px 16px', borderRadius: 20, cursor: 'pointer',
                            fontSize: 12, fontWeight: 600, letterSpacing: 1,
                            backdropFilter: 'blur(8px)', transition: 'all 0.2s'
                        }}
                    >
                        Exit
                    </button>
                </div>
            </div>

            {/* SLIDE CONTENT AREA */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={currentSlide}
                    initial={{ opacity: 0, x: 60 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -60 }}
                    transition={{ duration: 0.5, ease: "easeInOut" }}
                    style={{ width: '100%', height: '100%' }}
                >
                    <FullImageSlide {...slide} />
                </motion.div>
            </AnimatePresence>

            {/* BOTTOM PROGRESS BAR */}
            <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                height: 4, background: '#0a1a0f', zIndex: 100
            }}>
                <div style={{
                    width: `${((currentSlide + 1) / SLIDES.length) * 100}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #00C853, #00E676)',
                    transition: 'width 0.4s ease',
                    boxShadow: '0 0 8px rgba(0,200,83,0.5)'
                }} />
            </div>

            {/* DOT NAVIGATION (Bottom Center) */}
            <div style={{
                position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
                display: 'flex', gap: 4, zIndex: 100, padding: '4px 12px',
                background: 'rgba(0,0,0,0.5)', borderRadius: 20, backdropFilter: 'blur(8px)'
            }}>
                {SLIDES.map((_, i) => (
                    <button
                        key={i}
                        onClick={() => setCurrentSlide(i)}
                        style={{
                            width: i === currentSlide ? 18 : 6, height: 6,
                            borderRadius: 3, border: 'none', cursor: 'pointer',
                            background: i === currentSlide ? '#00C853' : 'rgba(255,255,255,0.2)',
                            transition: 'all 0.3s ease',
                            boxShadow: i === currentSlide ? '0 0 8px rgba(0,200,83,0.6)' : 'none'
                        }}
                    />
                ))}
            </div>

            {/* NAVIGATION OVERLAYS (Click left/right side to advance) */}
            <div
                onClick={() => setCurrentSlide(s => Math.max(0, s - 1))}
                style={{ position: 'absolute', top: '10%', bottom: '10%', left: 0, width: '15%', cursor: 'w-resize', zIndex: 90 }}
            />
            <div
                onClick={() => setCurrentSlide(s => Math.min(SLIDES.length - 1, s + 1))}
                style={{ position: 'absolute', top: '10%', bottom: '10%', right: 0, width: '15%', cursor: 'e-resize', zIndex: 90 }}
            />

            {/* VISIBLE ARROW BUTTONS */}
            <button
                onClick={() => setCurrentSlide(s => Math.max(0, s - 1))}
                style={{
                    position: 'absolute', top: '50%', left: 20, transform: 'translateY(-50%)',
                    width: 50, height: 50, borderRadius: '50%',
                    background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(0,200,83,0.3)',
                    color: '#00C853', fontSize: '28px', cursor: 'pointer', zIndex: 100,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: currentSlide === 0 ? 0 : 1,
                    pointerEvents: currentSlide === 0 ? 'none' : 'auto',
                    transition: 'all 0.3s', backdropFilter: 'blur(6px)',
                    boxShadow: '0 0 12px rgba(0,200,83,0.15)'
                }}
            >
                ‹
            </button>
            <button
                onClick={() => setCurrentSlide(s => Math.min(SLIDES.length - 1, s + 1))}
                style={{
                    position: 'absolute', top: '50%', right: 20, transform: 'translateY(-50%)',
                    width: 50, height: 50, borderRadius: '50%',
                    background: 'rgba(0,200,83,0.08)', border: '1px solid rgba(0,200,83,0.5)',
                    color: '#00C853', fontSize: '28px', cursor: 'pointer', zIndex: 100,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: currentSlide === SLIDES.length - 1 ? 0 : 1,
                    pointerEvents: currentSlide === SLIDES.length - 1 ? 'none' : 'auto',
                    transition: 'all 0.3s', backdropFilter: 'blur(6px)',
                    boxShadow: '0 0 12px rgba(0,200,83,0.2)'
                }}
            >
                ›
            </button>
        </div>
    );
}
