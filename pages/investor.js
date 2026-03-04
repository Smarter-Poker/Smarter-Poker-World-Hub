import React, { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { motion, AnimatePresence } from 'framer-motion';

// Icons & Layout Library
import {
    SlideContainer,
    TitleSlide,
    SplitSlide,
    TableSlide,
    GridSlide,
    FullImageSlide,
    MetalPhoneFrame,
    TabletFrame,
    HolographicHUD,
    DesktopMonitor
} from '../src/components/pitch/SlideLayouts';

// =========================================================================
// MOCK UI COMPONENTS (Rendered inside the 3D Device Frames)
// =========================================================================


const MockHubCarousel = () => <img src="/images/pitch/hub_carousel.png" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} alt="Hub" />;
const MockClubCommander = () => <img src="/images/pitch/club_commander.png" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} alt="Club Commander" />;
const MockLiveArena = () => <img src="/images/pitch/live_arena.png" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} alt="Live Arena" />;
const MockGTO = () => <img src="/images/pitch/gto_training.png" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} alt="GTO Training" />;
const MockDiamondStore = () => <img src="/images/pitch/diamond_store.png" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} alt="Diamond Store" />;
const MockPioSolver = () => <img src="/images/pitch/pio_solver.png" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} alt="PioSolver" />;
const MockSocialFeed = () => <img src="/images/pitch/social_feed.png" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} alt="Social Feed" />;
const MockArcade = () => <img src="/images/pitch/arcade_hologram.png" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} alt="Arcade" />;
// 36-SLIDE DATA CONFIGURATION
// =========================================================================

const SLIDES = [
    { type: 'full-image', bgImage: '/images/pitch/v3_01_title.png' },
    { type: 'full-image', bgImage: '/images/pitch/v3_02_problem.png' },
    { type: 'full-image', bgImage: '/images/pitch/v3_03_architecture.png' },
    { type: 'full-image', bgImage: '/images/pitch/v3_04_hub.png' },
    { type: 'full-image', bgImage: '/images/pitch/v3_05_gps.png' },
    { type: 'full-image', bgImage: '/images/pitch/v3_06_commander.png' },
    { type: 'full-image', bgImage: '/images/pitch/v3_07_arena.png' },
    { type: 'full-image', bgImage: '/images/pitch/v3_08_data.png' },
    { type: 'full-image', bgImage: '/images/pitch/v3_09_diamond.png' },
    { type: 'full-image', bgImage: '/images/pitch/v3_10_pro.png' }
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
