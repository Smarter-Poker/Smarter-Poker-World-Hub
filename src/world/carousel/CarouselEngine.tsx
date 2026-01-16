// @ts-nocheck
/* ═══════════════════════════════════════════════════════════════════════════
   HUB VANGUARD — POKERBROS CAROUSEL (SNAP + SMOOTH SCALE)
   Layout: Main fills screen, gaps between cards, snap-to-center, smooth scaling
   Mobile: Touch/Swipe enabled via native touch events on canvas
   ═══════════════════════════════════════════════════════════════════════════ */

import { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Group } from 'three';
import { POKER_IQ_ORBS } from '../../orbs/manifest/registry';
import { OrbCore } from './OrbCore';

const TOTAL_ORBS = POKER_IQ_ORBS.length; // 11

// ─────────────────────────────────────────────────────────────────────────────
// 🎠 SNAP CAROUSEL — MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────
interface CarouselEngineProps {
    onOrbSelect?: (id: string) => void;
    initialIndex?: number;
    onIndexChange?: (index: number) => void;
    isIntroComplete?: boolean;
}

export function CarouselEngine({ onOrbSelect, initialIndex = 0, onIndexChange, isIntroComplete = true }: CarouselEngineProps) {
    const groupRef = useRef<Group>(null);
    const [scrollPosition, setScrollPosition] = useState(initialIndex);
    const [targetPosition, setTargetPosition] = useState(initialIndex);
    const isDragging = useRef(false);
    const startX = useRef(0);
    const lastX = useRef(0);
    const velocityX = useRef(0);
    const lastTime = useRef(0);

    // Intro animation state
    const [introProgress, setIntroProgress] = useState(0);

    useEffect(() => {
        if (isIntroComplete) {
            // Animate cards flying in - FAST 800ms
            const startTime = Date.now();
            const duration = 800; // Reduced from 1500ms

            const animate = () => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(1, elapsed / duration);
                // Easing function for smooth deceleration
                const eased = 1 - Math.pow(1 - progress, 3);
                setIntroProgress(eased);

                if (progress < 1) {
                    requestAnimationFrame(animate);
                }
            };

            requestAnimationFrame(animate);
        }
    }, [isIntroComplete]);

    const { size, gl, viewport } = useThree();

    // Attach native touch/mouse handlers to canvas for reliable mobile swipe
    useEffect(() => {
        const canvas = gl.domElement;
        if (!canvas) return;

        const handleStart = (clientX: number) => {
            isDragging.current = true;
            startX.current = clientX;
            lastX.current = clientX;
            lastTime.current = Date.now();
            velocityX.current = 0;
            canvas.style.cursor = 'grabbing';
        };

        const handleMove = (clientX: number) => {
            if (!isDragging.current) return;

            const deltaX = clientX - lastX.current;
            const now = Date.now();
            const deltaTime = now - lastTime.current;

            // Calculate velocity for momentum
            if (deltaTime > 0) {
                velocityX.current = deltaX / deltaTime;
            }

            // Sensitivity scales with screen width for consistent feel
            const sensitivity = 0.003 * (1000 / size.width);
            const scrollDelta = -deltaX * sensitivity;

            setScrollPosition(prev => prev + scrollDelta);
            setTargetPosition(prev => prev + scrollDelta);

            lastX.current = clientX;
            lastTime.current = now;
        };

        const handleEnd = () => {
            if (!isDragging.current) return;
            isDragging.current = false;
            canvas.style.cursor = 'default';

            // Apply momentum based on velocity
            const absVelocity = Math.abs(velocityX.current);

            if (absVelocity > 0.5) {
                // Fast swipe - jump multiple cards
                const direction = velocityX.current > 0 ? -1 : 1;
                const swipeCards = Math.min(3, Math.ceil(absVelocity));
                setTargetPosition(prev => Math.round(prev) + (direction * swipeCards));
            } else if (absVelocity > 0.1) {
                // Medium speed - apply some momentum
                const momentum = -velocityX.current * 2;
                setTargetPosition(prev => Math.round(prev + momentum));
            } else {
                // Slow - snap to nearest
                setTargetPosition(prev => Math.round(prev));
            }
        };

        // Mouse events
        const onMouseDown = (e: MouseEvent) => handleStart(e.clientX);
        const onMouseMove = (e: MouseEvent) => handleMove(e.clientX);
        const onMouseUp = () => handleEnd();
        const onMouseLeave = () => handleEnd();

        // Touch events
        const onTouchStart = (e: TouchEvent) => {
            if (e.touches.length === 1) {
                handleStart(e.touches[0].clientX);
            }
        };
        const onTouchMove = (e: TouchEvent) => {
            if (e.touches.length === 1) {
                e.preventDefault(); // Prevent page scroll
                handleMove(e.touches[0].clientX);
            }
        };
        const onTouchEnd = () => handleEnd();

        // Add listeners
        canvas.addEventListener('mousedown', onMouseDown);
        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('mouseup', onMouseUp);
        canvas.addEventListener('mouseleave', onMouseLeave);
        canvas.addEventListener('touchstart', onTouchStart, { passive: false });
        canvas.addEventListener('touchmove', onTouchMove, { passive: false });
        canvas.addEventListener('touchend', onTouchEnd);
        canvas.addEventListener('touchcancel', onTouchEnd);

        return () => {
            canvas.removeEventListener('mousedown', onMouseDown);
            canvas.removeEventListener('mousemove', onMouseMove);
            canvas.removeEventListener('mouseup', onMouseUp);
            canvas.removeEventListener('mouseleave', onMouseLeave);
            canvas.removeEventListener('touchstart', onTouchStart);
            canvas.removeEventListener('touchmove', onTouchMove);
            canvas.removeEventListener('touchend', onTouchEnd);
            canvas.removeEventListener('touchcancel', onTouchEnd);
        };
    }, [gl.domElement, size.width]);

    // Track index changes and notify parent
    useEffect(() => {
        const currentIndex = Math.round(targetPosition);
        if (onIndexChange) {
            onIndexChange(currentIndex);
        }
    }, [targetPosition, onIndexChange]);

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
        // Only trigger click if we weren't dragging significantly
        const dragDistance = Math.abs(startX.current - lastX.current);
        if (dragDistance < 10 && Math.abs(offset) < 0.3) {
            console.log('🃏 Card Selected:', id);
            onOrbSelect?.(id);
        } else if (dragDistance < 10) {
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

    // Mobile detection: screen width < 768px typically
    const isMobile = size.width < 768;

    // Calculate scale based on viewport - make cards proportionally larger on mobile
    // On mobile, we want cards to fill ~60-70% of screen width
    const viewportScalingFactor = isMobile ? (1200 / size.width) : 1.0;

    // Vertical offset - center cards in the available space between header and footer
    // Mobile: position cards lower to fill center gap (was 2.5, too high)
    const verticalOffset = isMobile ? 0.5 : 2.8;

    return (
        <group ref={groupRef} position={[0, verticalOffset, isMobile ? 5 : 0]}>
            {visibleOrbs.map(({ config, offset }) => {
                const absOffset = Math.abs(offset);

                // SINGLE SMOOTH FORMULA - Consistent spacing throughout rotation
                // No jumps, no overlap, completely fluid

                // Scale: DRAMATICALLY larger on mobile for touch-friendly cards
                // Mobile: scale up to fill the viewport appropriately
                const baseScale = isMobile ? 14 : 8;  // Much larger on mobile
                const minScale = isMobile ? 6 : 3.5;
                const scaleRange = baseScale - minScale;
                let scale = baseScale - (absOffset * scaleRange / 2.5);
                scale = Math.max(minScale, scale); // Clamp to minimum

                // X Position: linear, consistent spacing
                // Much tighter spacing on mobile since cards are larger
                const spacing = isMobile ? 3.0 : 5.5;
                const xPos = offset * spacing;

                // Z Depth: smoothly moves back with distance
                const zPos = -absOffset * 1.5;

                // Y Position: slight drop for depth effect
                const yPos = -absOffset * 0.08;

                const isActive = absOffset < 0.3;

                return (
                    <group
                        key={config.id}
                        position={[
                            xPos * introProgress,
                            yPos * introProgress,
                            zPos * introProgress + (1 - introProgress) * 15
                        ]}
                        scale={scale * (0.1 + introProgress * 0.9)}
                        rotation={[0, (1 - introProgress) * Math.PI * 2, 0]}
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

