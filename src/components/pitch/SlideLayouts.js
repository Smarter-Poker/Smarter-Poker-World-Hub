import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// =========================================================================
// 1. DIVERSE 3D DEVICE WRAPPERS
// =========================================================================

export const MetalPhoneFrame = ({ children, width = 280, height = 580, rotation = { rotateY: -15, rotateX: 5 } }) => (
    <div style={{ perspective: '1000px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <motion.div
            initial={{ opacity: 0, scale: 0.9, ...rotation }}
            animate={{ opacity: 1, scale: 1, ...rotation }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            style={{
                position: 'relative', width, height,
                background: 'linear-gradient(135deg, #1a2332 0%, #2a3441 25%, #425264 50%, #2a3441 75%, #1a2332 100%)',
                borderRadius: 40, padding: 6,
                boxShadow: '20px 20px 60px rgba(0, 0, 0, 0.8), inset -2px -2px 10px rgba(0,0,0,0.5)',
                transformStyle: 'preserve-3d',
            }}
        >
            <div style={{
                position: 'absolute', top: 4, bottom: 4, left: 4, right: 4,
                borderRadius: 36, background: 'linear-gradient(135deg, #0cebeb, #20e3b2, #29ffc6)',
                opacity: 0.5, filter: 'blur(2px)', zIndex: 0
            }} />
            <div style={{
                position: 'relative', width: '100%', height: '100%',
                backgroundColor: '#050D16', borderRadius: 34, border: '2px solid rgba(255,255,255,0.1)',
                overflow: 'hidden', zIndex: 1, display: 'flex', flexDirection: 'column'
            }}>
                <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: '30%', height: 20, backgroundColor: '#000', borderRadius: 10, zIndex: 10 }} />
                <div style={{ flex: 1, overflowY: 'auto', paddingTop: 35 }}>{children}</div>
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(255,255,255,0.15) 0%, transparent 40%)', pointerEvents: 'none', zIndex: 20 }} />
            </div>
        </motion.div>
    </div>
);

export const TabletFrame = ({ children, width = 600, height = 450, rotation = { rotateY: 10, rotateX: 5 } }) => (
    <div style={{ perspective: '1000px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <motion.div
            initial={{ opacity: 0, scale: 0.9, ...rotation }}
            animate={{ opacity: 1, scale: 1, ...rotation }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            style={{
                position: 'relative', width, height,
                background: 'linear-gradient(135deg, #2a3441 0%, #1a2332 100%)',
                borderRadius: 24, padding: 12,
                boxShadow: '-15px 25px 50px rgba(0, 0, 0, 0.9), inset 2px 2px 5px rgba(255,255,255,0.2)',
                transformStyle: 'preserve-3d',
            }}
        >
            <div style={{
                position: 'relative', width: '100%', height: '100%',
                backgroundColor: '#0A1628', borderRadius: 16, border: '2px solid rgba(0, 180, 216, 0.3)',
                overflow: 'hidden', zIndex: 1, display: 'flex', flexDirection: 'column',
                boxShadow: 'inset 0 0 30px rgba(0,0,0,1)'
            }}>
                {children}
            </div>
        </motion.div>
    </div>
);

export const HolographicHUD = ({ children, width = 650, height = 450 }) => (
    <div style={{ perspective: '1200px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <motion.div
            initial={{ opacity: 0, rotateX: 20, y: 50 }}
            animate={{ opacity: 1, rotateX: 0, y: 0 }}
            transition={{ duration: 1, type: "spring" }}
            style={{
                position: 'relative', width, height,
                background: 'rgba(5, 13, 22, 0.7)',
                backdropFilter: 'blur(10px)',
                borderRadius: 12,
                border: '1px solid rgba(0, 212, 255, 0.4)',
                boxShadow: '0 0 40px rgba(0, 212, 255, 0.15), inset 0 0 20px rgba(0, 212, 255, 0.1)',
                padding: 2,
                transformStyle: 'preserve-3d',
            }}
        >
            {/* Hexagon tech patterns could go here */}
            {/* Corner brackets */}
            <div style={{ position: 'absolute', top: -2, left: -2, width: 20, height: 20, borderTop: '3px solid #00D4FF', borderLeft: '3px solid #00D4FF' }} />
            <div style={{ position: 'absolute', top: -2, right: -2, width: 20, height: 20, borderTop: '3px solid #00D4FF', borderRight: '3px solid #00D4FF' }} />
            <div style={{ position: 'absolute', bottom: -2, left: -2, width: 20, height: 20, borderBottom: '3px solid #00D4FF', borderLeft: '3px solid #00D4FF' }} />
            <div style={{ position: 'absolute', bottom: -2, right: -2, width: 20, height: 20, borderBottom: '3px solid #00D4FF', borderRight: '3px solid #00D4FF' }} />

            <div style={{ width: '100%', height: '100%', overflow: 'hidden', borderRadius: 10 }}>
                {children}
            </div>
        </motion.div>
    </div>
);

export const DesktopMonitor = ({ children, width = 700, height = 400 }) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
                width, height,
                background: '#000',
                border: '4px solid #1a2332',
                borderRadius: 12,
                padding: 4,
                boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
                position: 'relative'
            }}
        >
            <div style={{ width: '100%', height: '100%', background: '#050D16', overflow: 'hidden', borderRadius: 4 }}>
                {children}
            </div>
            {/* Monitor Stand */}
            <div style={{ position: 'absolute', bottom: -30, left: '50%', transform: 'translateX(-50%)', width: 60, height: 30, background: 'linear-gradient(to bottom, #1a2332, #0a1628)' }} />
            <div style={{ position: 'absolute', bottom: -40, left: '50%', transform: 'translateX(-50%)', width: 140, height: 10, background: '#1a2332', borderRadius: '4px 4px 0 0' }} />
        </motion.div>
    </div>
);


// =========================================================================
// 2. SLIDE LAYOUT COMPONENTS
// =========================================================================

export const SlideContainer = ({ children, bgImage }) => (
    <div className="pitch-slide-container" style={{
        width: '100%',
        height: '100vh',
        backgroundColor: '#050D16',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        padding: '60px 80px',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: "var(--font-inter), sans-serif" }}>
        {bgImage && (
            <img src={bgImage} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.25, zIndex: 0 }} alt="Background" />
        )}
        {/* Background ambient glow */}
        <div style={{ position: 'absolute', top: '-20%', left: '-10%', width: '60%', height: '60%', background: 'radial-gradient(circle, rgba(0,180,216,0.1) 0%, transparent 70%)', zIndex: 0 }} />
        <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%' }}>
            {children}
        </div>
    </div>
);

export const SlideHeader = ({ title, subtitle }) => (
    <div style={{ marginBottom: 40 }}>
        <h1 style={{ fontSize: '3rem', fontWeight: 800, margin: 0, color: '#FFFFFF', letterSpacing: '-1px' }}>
            {title}
        </h1>
        {subtitle && (
            <h2 style={{ fontSize: '1.5rem', fontWeight: 500, color: '#00B4D8', marginTop: 8, margin: 0 }}>
                {subtitle}
            </h2>
        )}
        <div style={{ width: 80, height: 4, background: 'linear-gradient(90deg, #00B4D8, #8040C0)', marginTop: 24, borderRadius: 2 }} />
    </div>
);

// Layout: Split Screen (Text Left, Visual Right)
export const SplitSlide = ({ title, subtitle, content, visual, visualType = 'phone', bgImage }) => (
    <SlideContainer bgImage={bgImage}>
        <SlideHeader title={title} subtitle={subtitle} />
        <div style={{ display: 'flex', gap: 60, flex: 1, alignItems: 'center' }}>
            <motion.div
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8 }}
                style={{ flex: 1, fontSize: '1.2rem', lineHeight: 1.6, color: 'rgba(255,255,255,0.9)' }}
            >
                {content}
            </motion.div>
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                {visualType === 'phone' && <MetalPhoneFrame>{visual}</MetalPhoneFrame>}
                {visualType === 'tablet' && <TabletFrame>{visual}</TabletFrame>}
                {visualType === 'hologram' && <HolographicHUD>{visual}</HolographicHUD>}
                {visualType === 'monitor' && <DesktopMonitor>{visual}</DesktopMonitor>}
                {visualType === 'none' && visual}
            </div>
        </div>
    </SlideContainer>
);

// Layout: Title / Hero Slide
export const TitleSlide = ({ title, subtitle, stats, bgImage }) => (
    <SlideContainer bgImage={bgImage}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', alignItems: 'center', textAlign: 'center' }}>
            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8 }}
            >
                <h1 style={{ fontSize: '5rem', fontWeight: 900, background: 'linear-gradient(to right, #fff, #00B4D8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0 }}>
                    {title}
                </h1>
                <h2 style={{ fontSize: '2rem', color: '#8040C0', marginTop: 20 }}>
                    {subtitle}
                </h2>

                {stats && (
                    <div style={{ display: 'flex', gap: 40, justifyContent: 'center', marginTop: 80 }}>
                        {stats.map((stat, i) => (
                            <div key={i} style={{ padding: '20px 40px', background: 'rgba(255,255,255,0.05)', borderRadius: 16, border: '1px solid rgba(255,255,255,0.1)' }}>
                                <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#00C87A' }}>{stat.value}</div>
                                <div style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 1 }}>{stat.label}</div>
                            </div>
                        ))}
                    </div>
                )}
            </motion.div>
        </div>
    </SlideContainer>
);

// Layout: Data Table Slide
export const TableSlide = ({ title, subtitle, columns, rows, bgImage }) => (
    <SlideContainer bgImage={bgImage}>
        <SlideHeader title={title} subtitle={subtitle} />
        <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            style={{ background: '#0A1628', borderRadius: 16, border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden' }}
        >
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                    <tr style={{ background: 'rgba(0, 180, 216, 0.1)' }}>
                        {columns.map((col, i) => (
                            <th key={i} style={{ padding: 20, textAlign: 'left', color: '#00B4D8', fontWeight: 600, borderBottom: '2px solid rgba(0,180,216,0.3)' }}>{col}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            {row.map((cell, j) => (
                                <td key={j} style={{ padding: '20px', color: j === 0 ? '#fff' : 'rgba(255,255,255,0.7)', fontWeight: j === 0 ? 600 : 400 }}>
                                    {cell === 'YES' ? <span style={{ color: '#00C87A' }}>✓</span> : cell === 'NO' ? <span style={{ color: '#E02840' }}>✗</span> : cell}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </motion.div>
    </SlideContainer>
);

// Layout: Full Visual Grid Slide
export const GridSlide = ({ title, subtitle, items, bgImage }) => (
    <SlideContainer bgImage={bgImage}>
        <SlideHeader title={title} subtitle={subtitle} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 30 }}>
            {items.map((item, i) => (
                <motion.div
                    key={i}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.1 }}
                    style={{
                        background: 'linear-gradient(135deg, #0D1F35 0%, #0A1628 100%)',
                        padding: 30,
                        borderRadius: 16,
                        border: '1px solid rgba(255,255,255,0.1)',
                        boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
                    }}
                >
                    <div style={{ width: 40, height: 4, background: '#00B4D8', borderRadius: 2, marginBottom: 20, boxShadow: '0 0 10px rgba(0,180,216,0.5)' }} />
                    <h3 style={{ fontSize: '1.5rem', margin: '0 0 10px 0', color: '#fff' }}>{item.title}</h3>
                    <p style={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.5, margin: 0 }}>{item.desc}</p>
                </motion.div>
            ))}
        </div>
    </SlideContainer>
);

// Layout: Full Image Cinematic Slide (V3)
export const FullImageSlide = ({ bgImage }) => (
    <div style={{
        width: '100vw',
        height: '100vh',
        backgroundColor: '#000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        position: 'relative'
    }}>
        <motion.img
            initial={{ opacity: 0, scale: 1.05 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.2, ease: "easeOut" }}
            src={bgImage}
            alt="Cinematic Slide"
            style={{
                width: '100vw',
                height: '100vh',
                objectFit: 'contain'
            }}
        />
    </div>
);
