/**
 * 🎴 Card3D Component - Premium 3D Card with Perspective Effects
 * God-Mode Stack - Immersive card interactions
 * 
 * Features:
 * - CSS 3D transforms with perspective
 * - Mouse-tracking rotation (tilt towards cursor)
 * - Dynamic shadow depth
 * - Glassmorphism + gradient borders
 * - Glow effect on hover
 * - Smooth spring animations
 */

import { useState, useRef, useCallback } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';

// Spring config for smooth, natural movement
const SPRING_CONFIG = { stiffness: 400, damping: 30 };

export default function Card3D({
    children,
    className = '',
    style = {},
    glowColor = '#00D4FF',
    intensity = 'medium', // 'subtle', 'medium', 'intense'
    onClick,
    disabled = false,
}) {
    const cardRef = useRef(null);
    const [isHovered, setIsHovered] = useState(false);

    // Motion values for smooth mouse tracking
    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);

    // Spring-animated rotation values
    const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [15, -15]), SPRING_CONFIG);
    const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-15, 15]), SPRING_CONFIG);

    // Intensity multipliers
    const intensityScale = {
        subtle: 0.5,
        medium: 1,
        intense: 1.5,
    };
    const scale = intensityScale[intensity] || 1;

    // Handle mouse move for 3D tracking
    const handleMouseMove = useCallback((e) => {
        if (!cardRef.current || disabled) return;

        const rect = cardRef.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        // Normalize mouse position to -0.5 to 0.5
        const normalizedX = (e.clientX - centerX) / rect.width;
        const normalizedY = (e.clientY - centerY) / rect.height;

        mouseX.set(normalizedX * scale);
        mouseY.set(normalizedY * scale);
    }, [mouseX, mouseY, scale, disabled]);

    // Reset rotation on mouse leave
    const handleMouseLeave = useCallback(() => {
        setIsHovered(false);
        mouseX.set(0);
        mouseY.set(0);
    }, [mouseX, mouseY]);

    const handleMouseEnter = useCallback(() => {
        if (!disabled) setIsHovered(true);
    }, [disabled]);

    return (
        <motion.div
            ref={cardRef}
            className={`card-3d ${className}`}
            style={{
                perspective: 1000,
                transformStyle: 'preserve-3d',
                cursor: disabled ? 'default' : 'pointer',
                ...style,
            }}
            onMouseMove={handleMouseMove}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onClick={disabled ? undefined : onClick}
        >
            <motion.div
                style={{
                    rotateX: disabled ? 0 : rotateX,
                    rotateY: disabled ? 0 : rotateY,
                    transformStyle: 'preserve-3d',
                    width: '100%',
                    height: '100%',
                }}
            >
                {/* Card Content */}
                <motion.div
                    style={{
                        position: 'relative',
                        width: '100%',
                        height: '100%',
                        background: 'linear-gradient(135deg, rgba(20, 30, 50, 0.9), rgba(10, 20, 40, 0.95))',
                        borderRadius: 16,
                        border: `1px solid ${isHovered ? glowColor : 'rgba(255, 255, 255, 0.1)'}`,
                        backdropFilter: 'blur(10px)',
                        overflow: 'hidden',
                        transformStyle: 'preserve-3d',
                        transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
                        boxShadow: isHovered
                            ? `0 25px 50px rgba(0, 0, 0, 0.5), 0 0 30px ${glowColor}30`
                            : '0 10px 30px rgba(0, 0, 0, 0.3)',
                    }}
                    animate={{
                        scale: isHovered ? 1.02 : 1,
                    }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                >
                    {/* Gradient Border Overlay */}
                    <div
                        style={{
                            position: 'absolute',
                            inset: 0,
                            borderRadius: 16,
                            padding: 1,
                            background: isHovered
                                ? `linear-gradient(135deg, ${glowColor}80, transparent 50%, ${glowColor}40)`
                                : 'transparent',
                            WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                            WebkitMaskComposite: 'xor',
                            maskComposite: 'exclude',
                            opacity: isHovered ? 1 : 0,
                            transition: 'opacity 0.3s ease',
                            pointerEvents: 'none',
                        }}
                    />

                    {/* Glow Effect */}
                    <motion.div
                        style={{
                            position: 'absolute',
                            top: -50,
                            left: -50,
                            right: -50,
                            bottom: -50,
                            background: `radial-gradient(circle at 50% 50%, ${glowColor}20, transparent 60%)`,
                            pointerEvents: 'none',
                            opacity: isHovered ? 1 : 0,
                        }}
                        animate={{ opacity: isHovered ? 0.8 : 0 }}
                        transition={{ duration: 0.3 }}
                    />

                    {/* Shine Effect */}
                    <motion.div
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: '-100%',
                            width: '50%',
                            height: '100%',
                            background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent)',
                            transform: 'skewX(-20deg)',
                            pointerEvents: 'none',
                        }}
                        animate={{
                            left: isHovered ? '150%' : '-100%',
                        }}
                        transition={{ duration: 0.6, ease: 'easeInOut' }}
                    />

                    {/* Content */}
                    <div style={{ position: 'relative', zIndex: 1, height: '100%' }}>
                        {children}
                    </div>
                </motion.div>
            </motion.div>
        </motion.div>
    );
}

/**
 * Card3D Variant - Stats Card
 * Optimized for displaying stats with icons
 */
export function StatsCard3D({
    icon,
    label,
    value,
    trend,
    glowColor = '#00D4FF',
    onClick,
}) {
    return (
        <Card3D
            glowColor={glowColor}
            intensity="medium"
            onClick={onClick}
            style={{ minHeight: 120 }}
        >
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100%',
                padding: 20,
                gap: 8,
            }}>
                {/* Icon */}
                <div style={{
                    fontSize: 28,
                    transform: 'translateZ(20px)',
                }}>
                    {icon}
                </div>

                {/* Value */}
                <div style={{
                    fontSize: 28,
                    fontWeight: 800,
                    color: '#ffffff',
                    fontFamily: 'Orbitron, sans-serif',
                    transform: 'translateZ(30px)',
                    textShadow: `0 0 20px ${glowColor}60`,
                }}>
                    {value}
                </div>

                {/* Label */}
                <div style={{
                    fontSize: 12,
                    color: 'rgba(255, 255, 255, 0.6)',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                }}>
                    {label}
                </div>

                {/* Trend Indicator */}
                {trend && (
                    <div style={{
                        fontSize: 12,
                        color: trend > 0 ? '#00ff88' : '#ff4444',
                        fontWeight: 600,
                    }}>
                        {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%
                    </div>
                )}
            </div>
        </Card3D>
    );
}

/**
 * Card3D Variant - Feature Card
 * For orbs and feature showcases
 */
export function FeatureCard3D({
    title,
    description,
    icon,
    image,
    badge,
    glowColor = '#00D4FF',
    onClick,
}) {
    return (
        <Card3D
            glowColor={glowColor}
            intensity="intense"
            onClick={onClick}
            style={{ minHeight: 200 }}
        >
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                {/* Image/Icon Area */}
                <div style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: `linear-gradient(135deg, ${glowColor}10, transparent)`,
                    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                    position: 'relative',
                    overflow: 'hidden',
                }}>
                    {image ? (
                        <img
                            src={image}
                            alt={title}
                            style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                            }}
                        />
                    ) : (
                        <span style={{ fontSize: 48, transform: 'translateZ(20px)' }}>
                            {icon}
                        </span>
                    )}

                    {/* Badge */}
                    {badge && (
                        <div style={{
                            position: 'absolute',
                            top: 12,
                            right: 12,
                            background: glowColor,
                            color: '#000',
                            padding: '4px 10px',
                            borderRadius: 100,
                            fontSize: 10,
                            fontWeight: 700,
                            textTransform: 'uppercase',
                        }}>
                            {badge}
                        </div>
                    )}
                </div>

                {/* Content */}
                <div style={{ padding: 16 }}>
                    <h3 style={{
                        fontSize: 16,
                        fontWeight: 700,
                        color: '#fff',
                        marginBottom: 4,
                        fontFamily: 'Orbitron, sans-serif',
                    }}>
                        {title}
                    </h3>
                    {description && (
                        <p style={{
                            fontSize: 12,
                            color: 'rgba(255, 255, 255, 0.6)',
                            lineHeight: 1.4,
                            margin: 0,
                        }}>
                            {description}
                        </p>
                    )}
                </div>
            </div>
        </Card3D>
    );
}
