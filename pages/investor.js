import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { motion, AnimatePresence } from 'framer-motion';

// Icons & Layout Library
import {
    TitleSlide,
    SplitSlide,
    TableSlide,
    GridSlide,
    FullImageSlide
} from '../src/components/pitch/SlideLayouts';

// =========================================================================
// MOCK UI COMPONENTS (Rendered inside the 3D Device Frames)
// =========================================================================


const MockHubCarousel = () => <img src="/images/pitch/hub_carousel.png" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} alt="Hub"  loading="lazy" />;
const MockClubCommander = () => <img src="/images/pitch/club_commander.png" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} alt="Club Commander"  loading="lazy" />;
const MockLiveArena = () => <img src="/images/pitch/live_arena.png" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} alt="Live Arena"  loading="lazy" />;
const MockGTO = () => <img src="/images/pitch/gto_training.png" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} alt="GTO Training"  loading="lazy" />;
const MockDiamondStore = () => <img src="/images/pitch/diamond_store.png" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} alt="Diamond Store"  loading="lazy" />;
const MockPioSolver = () => <img src="/images/pitch/pio_solver.png" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} alt="PioSolver"  loading="lazy" />;
const MockSocialFeed = () => <img src="/images/pitch/social_feed.png" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} alt="Social Feed"  loading="lazy" />;
const MockArcade = () => <img src="/images/pitch/arcade_hologram.png" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} alt="Arcade"  loading="lazy" />;
// 36-SLIDE DATA CONFIGURATION
// =========================================================================

const SLIDES = [
    { type: 'full-image', bgImage: '/images/pitch/v4_slide_01_title_1772657206089.png' },
    { type: 'full-image', bgImage: '/images/pitch/v4_slide_02_problem_1772657217174.png' },
    { type: 'full-image', bgImage: '/images/pitch/v4_slide_03_solution_1772657231291.png' },
    { type: 'full-image', bgImage: '/images/pitch/v4_slide_04_architecture_1772657248554.png' },
    { type: 'full-image', bgImage: '/images/pitch/v4_slide_05_world_hub_1772657260915.png' },
    { type: 'full-image', bgImage: '/images/pitch/v4_slide_06_near_me_1772657273400.png' },
    { type: 'full-image', bgImage: '/images/pitch/v4_slide_07_vs_atlas_1772657288949.png' },
    { type: 'full-image', bgImage: '/images/pitch/v4_slide_08_commander_1772657304115.png' },
    { type: 'full-image', bgImage: '/images/pitch/v4_slide_09_arena_1772657316171.png' },
    { type: 'full-image', bgImage: '/images/pitch/v4_slide_10_diamond_arena_1772657329877.png' },
    { type: 'full-image', bgImage: '/images/pitch/v4_slide_11_gto_1772657342074.png' },
    { type: 'full-image', bgImage: '/images/pitch/v4_slide_12_pio_farm_1772657358505.png' },
    { type: 'full-image', bgImage: '/images/pitch/v4_slide_13_jarvis_1772657389931.png' },
    { type: 'full-image', bgImage: '/images/pitch/v4_slide_14_social_1772657402291.png' },
    { type: 'full-image', bgImage: '/images/pitch/v4_slide_15_bankroll_1772657413797.png' },
    { type: 'full-image', bgImage: '/images/pitch/v4_slide_16_news_1772657426067.png' },
    { type: 'full-image', bgImage: '/images/pitch/v4_slide_17_economy_1772657442694.png' },
    { type: 'full-image', bgImage: '/images/pitch/v4_slide_18_store_1772657464365.png' },
    { type: 'full-image', bgImage: '/images/pitch/v4_slide_19_arcade_1772657486341.png' },
    { type: 'full-image', bgImage: '/images/pitch/v4_slide_20_microtasks_1772657500671.png' },
    { type: 'full-image', bgImage: '/images/pitch/v4_slide_21_market_1772657513252.png' },
    { type: 'full-image', bgImage: '/images/pitch/v4_slide_22_revenue_1772657526052.png' },
    { type: 'full-image', bgImage: '/images/pitch/v4_slide_23_traction_1772657539265.png' },
    { type: 'full-image', bgImage: '/images/pitch/v4_slide_24_landscape_1772657549334.png' },
    { type: 'full-image', bgImage: '/images/pitch/v4_slide_25_moats_1772657583706.png' },
    { type: 'full-image', bgImage: '/images/pitch/v4_slide_26_retention_1772657596435.png' },
    { type: 'full-image', bgImage: '/images/pitch/v4_slide_27_architecture_1772657609133.png' },
    { type: 'full-image', bgImage: '/images/pitch/v4_slide_28_security_1772657620228.png' },
    { type: 'full-image', bgImage: '/images/pitch/v4_slide_29_valuation_1772657633560.png' },
    { type: 'full-image', bgImage: '/images/pitch/v4_slide_30_funds_1772657646654.png' },
    { type: 'full-image', bgImage: '/images/pitch/v4_slide_31_roadmap_1772657660397.png' },
    { type: 'full-image', bgImage: '/images/pitch/v4_slide_32_economics_1772657671248.png' },
    { type: 'full-image', bgImage: '/images/pitch/v4_slide_33_team_1772657685623.png' },
    { type: 'full-image', bgImage: '/images/pitch/v4_slide_34_why_now_1772657696840.png' },
    { type: 'full-image', bgImage: '/images/pitch/v4_slide_35_risk_1772657710214.png' },
    { type: 'full-image', bgImage: '/images/pitch/v4_slide_36_the_ask_1772657725271.png' }
];

// =========================================================================
// MAIN PAGE COMPONENT
// =========================================================================

export default function InvestorPitchDeck() {
    const [currentSlide, setCurrentSlide] = useState(0);

    // Keyboard Navigation
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'ArrowRight' || e.key === 'Space') {
                setCurrentSlide(s => Math.min(SLIDES.length - 1, s + 1));
            } else if (e.key === 'ArrowLeft') {
                setCurrentSlide(s => Math.max(0, s - 1));
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const slide = SLIDES[currentSlide];

    return (
        <div className="pitch-deck-container" style={{ width: '100vw', height: '100vh', background: '#000', overflow: 'hidden', position: 'relative' }}>
            <Head>
                <title>Smarter.Poker Investor Pitch</title>
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
            </Head>


            {/* GLOBAL CAPITALIZATION STYLE */}
            <style jsx global>{`
                .pitch-deck-container * {
                    text-transform: capitalize !important;
                }
            `}</style>

            {/* TOP CONTROLS */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: 20, display: 'flex', justifyContent: 'space-between', zIndex: 100, background: 'linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)' }}>
                <div style={{ color: '#00B4D8', fontWeight: 'bold', letterSpacing: 2 }}>SMARTER.POKER</div>
                <div style={{ color: '#fff', opacity: 0.5 }}>Slide {currentSlide + 1} of {SLIDES.length}</div>
                <div style={{ display: 'flex', gap: 15 }}>
                    <button onClick={() => window.print()} style={{ background: 'transparent', border: '1px solid #00B4D8', color: '#00B4D8', padding: '5px 15px', borderRadius: 20, cursor: 'pointer' }}>Download PDF</button>
                    <button onClick={() => window.history.back()} style={{ background: '#E02840', border: 'none', color: '#fff', padding: '5px 15px', borderRadius: 20, cursor: 'pointer' }}>Exit</button>
                </div>
            </div>

            {/* SLIDE CONTENT AREA */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={currentSlide}
                    initial={{ opacity: 0, x: 50 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -50 }}
                    transition={{ duration: 0.5, ease: "easeInOut" }}
                    style={{ width: '100%', height: '100%', textTransform: 'capitalize' }}
                >
                    {slide.type === 'full-image' ? (
                        <FullImageSlide {...slide} />
                    ) : (
                        <>
                            {slide.type === 'title' && <TitleSlide {...slide} />}
                            {slide.type === 'split' && <SplitSlide {...slide} />}
                            {slide.type === 'table' && <TableSlide {...slide} />}
                            {slide.type === 'grid' && <GridSlide {...slide} />}
                        </>
                    )}
                </motion.div>
            </AnimatePresence>

            {/* BOTTOM PROGRESS BAR */}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: '#1a2332', zIndex: 100 }}>
                <div style={{ width: `${((currentSlide + 1) / SLIDES.length) * 100}%`, height: '100%', background: '#00B4D8', transition: 'width 0.3s' }} />
            </div>

            {/* NAVIGATION OVERLAYS (Click left/right side to advance) */}
            <div onClick={() => setCurrentSlide(s => Math.max(0, s - 1))} style={{ position: 'absolute', top: '10%', bottom: '10%', left: 0, width: '15%', cursor: 'w-resize', zIndex: 90 }} />
            <div onClick={() => setCurrentSlide(s => Math.min(SLIDES.length - 1, s + 1))} style={{ position: 'absolute', top: '10%', bottom: '10%', right: 0, width: '15%', cursor: 'e-resize', zIndex: 90 }} />

            {/* VISIBLE ARROW BUTTONS */}
            <button
                onClick={() => setCurrentSlide(s => Math.max(0, s - 1))}
                style={{
                    position: 'absolute', top: '50%', left: 20, transform: 'translateY(-50%)',
                    width: 50, height: 50, borderRadius: '50%',
                    background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)',
                    color: '#fff', fontSize: '28px', cursor: 'pointer', zIndex: 100,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: currentSlide === 0 ? 0 : 1, pointerEvents: currentSlide === 0 ? 'none' : 'auto',
                    transition: 'opacity 0.2s', backdropFilter: 'blur(4px)'
                }}
            >
                ‹
            </button>
            <button
                onClick={() => setCurrentSlide(s => Math.min(SLIDES.length - 1, s + 1))}
                style={{
                    position: 'absolute', top: '50%', right: 20, transform: 'translateY(-50%)',
                    width: 50, height: 50, borderRadius: '50%',
                    background: 'rgba(0,180,216,0.1)', border: '1px solid rgba(0,180,216,0.5)',
                    color: '#00B4D8', fontSize: '28px', cursor: 'pointer', zIndex: 100,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: currentSlide === SLIDES.length - 1 ? 0 : 1, pointerEvents: currentSlide === SLIDES.length - 1 ? 'none' : 'auto',
                    transition: 'opacity 0.2s', backdropFilter: 'blur(4px)'
                }}
            >
                ›
            </button>
        </div>
    );
}
