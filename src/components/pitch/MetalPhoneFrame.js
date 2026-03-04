import React from 'react';
import { motion } from 'framer-motion';

/**
 * 3D Titanium Phone Frame Mockup for the Investor Pitch Deck.
 * Uses CSS transforms to simulate physical depth, metallic gradients, 
 * and glowing cyan accents as requested by the user.
 */
export default function MetalPhoneFrame({
    children,
    width = 320,
    height = 650,
    className = "",
    perspective = 1000,
    rotation = { rotateY: -15, rotateX: 5 }
}) {
    return (
        <div style={{ perspective: `${perspective}px` }} className={`flex items-center justify-center ${className}`}>
            <motion.div
                initial={{ opacity: 0, scale: 0.9, ...rotation }}
                animate={{ opacity: 1, scale: 1, ...rotation }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                style={{
                    position: 'relative',
                    width,
                    height,
                    // The Outer Titanium Chassis
                    background: 'linear-gradient(135deg, #1a2332 0%, #2a3441 25%, #425264 50%, #2a3441 75%, #1a2332 100%)',
                    borderRadius: 45,
                    padding: 8,
                    boxShadow: `
                        20px 20px 60px rgba(0, 0, 0, 0.8),
                        inset -2px -2px 10px rgba(0, 0, 0, 0.5),
                        inset 2px 2px 10px rgba(255, 255, 255, 0.2)
                    `,
                    transformStyle: 'preserve-3d',
                }}
            >
                {/* Cyan Accent Seam / Inner Bezel */}
                <div style={{
                    position: 'absolute',
                    top: 6, bottom: 6, left: 6, right: 6,
                    borderRadius: 40,
                    background: 'linear-gradient(135deg, #0cebeb 0%, #20e3b2 50%, #29ffc6 100%)',
                    opacity: 0.6,
                    filter: 'blur(2px)',
                    zIndex: 0
                }} />

                {/* Inner Black Bezel */}
                <div style={{
                    position: 'relative',
                    width: '100%',
                    height: '100%',
                    backgroundColor: '#050D16',
                    borderRadius: 38,
                    border: '2px solid rgba(255, 255, 255, 0.1)',
                    overflow: 'hidden',
                    zIndex: 1,
                    boxShadow: 'inset 0 0 20px rgba(0,0,0,0.8)'
                }}>
                    {/* Dynamic Island / Notch */}
                    <div style={{
                        position: 'absolute',
                        top: 10,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: '30%',
                        height: 25,
                        backgroundColor: '#000',
                        borderRadius: 20,
                        zIndex: 10,
                        boxShadow: 'inset 0 -2px 5px rgba(255,255,255,0.1)'
                    }} />

                    {/* Left Volume Buttons (3D Edge) */}
                    <div style={{
                        position: 'absolute',
                        left: -10,
                        top: 120,
                        width: 4,
                        height: 40,
                        backgroundColor: '#425264',
                        borderTopLeftRadius: 3,
                        borderBottomLeftRadius: 3,
                        boxShadow: 'inset 1px 0 2px rgba(255,255,255,0.3)'
                    }} />
                    <div style={{
                        position: 'absolute',
                        left: -10,
                        top: 170,
                        width: 4,
                        height: 40,
                        backgroundColor: '#425264',
                        borderTopLeftRadius: 3,
                        borderBottomLeftRadius: 3,
                        boxShadow: 'inset 1px 0 2px rgba(255,255,255,0.3)'
                    }} />

                    {/* Right Power Button (3D Edge) */}
                    <div style={{
                        position: 'absolute',
                        right: -10,
                        top: 140,
                        width: 4,
                        height: 60,
                        backgroundColor: '#425264',
                        borderTopRightRadius: 3,
                        borderBottomRightRadius: 3,
                        boxShadow: 'inset -1px 0 2px rgba(255,255,255,0.3)'
                    }} />

                    {/* Screen Content Wrapper */}
                    <div style={{
                        width: '100%',
                        height: '100%',
                        position: 'relative',
                        zIndex: 5,
                        display: 'flex',
                        flexDirection: 'column',
                        overflowY: 'auto',
                        overflowX: 'hidden',
                        paddingTop: 45, // clear the dynamic island
                    }}>
                        {children}
                    </div>

                    {/* Screen Glare Overlay */}
                    <div style={{
                        position: 'absolute',
                        top: 0, left: 0, right: 0, bottom: 0,
                        background: 'linear-gradient(135deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0) 40%, rgba(255,255,255,0) 100%)',
                        pointerEvents: 'none',
                        zIndex: 20
                    }} />
                </div>
            </motion.div>
        </div>
    );
}
