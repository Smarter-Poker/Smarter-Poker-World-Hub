// @ts-nocheck
/* ═══════════════════════════════════════════════════════════════════════════
   HUB VANGUARD — POKERBROS CAROUSEL (SNAP + SMOOTH SCALE)
   Layout: Main fills screen, gaps between cards, snap-to-center, smooth scaling
   ═══════════════════════════════════════════════════════════════════════════ */

import { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useDrag } from '@use-gesture/react';
import { Group } from 'three';
import { POKER_IQ_ORBS } from '../../orbs/manifest/registry';
import { OrbCore } from './OrbCore';

const TOTAL_ORBS = POKER_IQ_ORBS.length; // 11

// ─────────────────────────────────────────────────────────────────────────────
// 🎠 SNAP CAROUSEL — MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────
interface CarouselEngineProps {
    onOrbSelect?: (id: string) => void;
}

export function CarouselEngine({ onOrbSelect }: CarouselEngineProps) {
    const groupRef = useRef<Group>(null);
    const [scrollPosition, setScrollPosition] = useState(0);
    const [targetPosition, setTargetPosition] = useState(0);
    const velocity = useRef(0);
    const isDragging = useRef(false);

    const { size, gl, viewport } = useThree();

    // Enhanced drag gesture handler with touch + momentum
    const bind = useDrag(({ delta: [x], down, first, last, velocity: [vx], direction: [dx], swipe: [sx] }) => {
        if (first) {
            isDragging.current = true;
            gl.domElement.style.cursor = 'grabbing';
        }

        if (down) {
            // Sensitivity scales with screen width for consistent feel
            const sensitivity = 0.01 * (1000 / size.width);
            velocity.current = -x * sensitivity;
            setScrollPosition(prev => prev + velocity.current);
            setTargetPosition(prev => prev + velocity.current);
        }

        if (last) {
            isDragging.current = false;
            gl.domElement.style.cursor = 'default';

            // Handle swipe gestures - jump multiple cards on fast swipe
            if (sx !== 0) {
                const swipeCards = Math.min(3, Math.ceil(Math.abs(vx) * 2));
                const newTarget = Math.round(scrollPosition) - (sx * swipeCards);
                setTargetPosition(newTarget);
            }
            // Apply momentum for slower drags
            else if (Math.abs(vx) > 0.1) {
                const momentum = -dx * Math.min(2, vx * 0.5);
                const newTarget = Math.round(scrollPosition + momentum);
                setTargetPosition(newTarget);
            }
            // Snap to nearest on release
            else {
                const nearestCard = Math.round(scrollPosition);
                setTargetPosition(nearestCard);
            }
        }
    }, {
        pointer: { touch: true },
        filterTaps: true,
        swipe: { distance: 50, velocity: 0.5 }, // Swipe thresholds
        axis: 'x', // Lock to horizontal
        preventDefault: true,
        eventOptions: { passive: false }, // Required for preventDefault on touch
    });

    // Smooth animation to target position (snap effect)
    useFrame(() => {
        if (!isDragging.current) {
            // Smoothly interpolate to target position
            const diff = targetPosition - scrollPosition;
            if (Math.abs(diff) > 0.001) {
                setScrollPosition(prev => prev + diff * 0.12); // Smooth snap
            } else {
                setScrollPosition(targetPosition);
            }
        }
    });

    const handleOrbClick = useCallback((id: string, offset: number) => {
        if (!isDragging.current && Math.abs(offset) < 0.3) {
            console.log('🃏 Card Selected:', id);
            onOrbSelect?.(id);
        } else if (!isDragging.current) {
            // Click on non-center card: snap to it
            const newTarget = Math.round(scrollPosition + offset);
            setTargetPosition(newTarget);
        }
    }, [onOrbSelect, scrollPosition]);

    // Calculate visible cards (5 total)
    const visibleOrbs = useMemo(() => {
        const result: { config: typeof POKER_IQ_ORBS[0]; offset: number; index: number }[] = [];

        for (let i = 0; i < TOTAL_ORBS; i++) {
            let offset = (i - scrollPosition) % TOTAL_ORBS;
            if (offset > TOTAL_ORBS / 2) offset -= TOTAL_ORBS;
            if (offset < -TOTAL_ORBS / 2) offset += TOTAL_ORBS;

            // Show 5 cards
            if (Math.abs(offset) <= 2.5) {
                result.push({ config: POKER_IQ_ORBS[i], offset, index: i });
            }
        }

        // Sort by depth (furthest cards render first)
        return result.sort((a, b) => Math.abs(b.offset) - Math.abs(a.offset));
    }, [scrollPosition]);

    // Calculate viewport-based positioning
    const halfVW = viewport.width / 2;

    // Vertical offset to shift carousel up (336px ≈ 2.8 units in 3D space)
    const verticalOffset = 2.8;

    return (
        <group ref={groupRef} position={[0, verticalOffset, 0]} {...(bind() as any)}>
            {visibleOrbs.map(({ config, offset }) => {
                const absOffset = Math.abs(offset);

                // SINGLE SMOOTH FORMULA - Consistent spacing throughout rotation
                // No jumps, no overlap, completely fluid

                // Scale: smoothly decreases from center (8) to edges (3.5)
                const maxScale = 8;
                const minScale = 3.5;
                const scaleRange = maxScale - minScale;
                let scale = maxScale - (absOffset * scaleRange / 2.5);
                scale = Math.max(minScale, scale); // Clamp to minimum

                // X Position: linear, consistent spacing
                const spacing = 5.5; // Fixed spacing multiplier
                const xPos = offset * spacing;

                // Z Depth: smoothly moves back with distance
                const zPos = -absOffset * 1.5;

                // Y Position: slight drop for depth effect
                const yPos = -absOffset * 0.08;

                const isActive = absOffset < 0.3;

                return (
                    <group
                        key={config.id}
                        position={[xPos, yPos, zPos]}
                        scale={scale}
                        onClick={(e) => {
                            e.stopPropagation();
                            handleOrbClick(config.id, offset);
                        }}
                        onPointerEnter={() => {
                            gl.domElement.style.cursor = 'pointer';
                        }}
                        onPointerLeave={() => {
                            if (!isDragging.current) {
                                gl.domElement.style.cursor = 'default';
                            }
                        }}
                    >
                        <OrbCore
                            color={config.color}
                            label={config.label}
                            gradient={config.gradient}
                            active={isActive}
                            imageUrl={config.imageUrl}
                        />
                    </group>
                );
            })}
        </group>
    );
}

// Legacy export
export const Carousel = CarouselEngine;
