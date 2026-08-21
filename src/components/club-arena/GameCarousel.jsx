import React, { useRef, useState, useMemo, useEffect } from 'react';
import GameCard from './GameCard';

// ─────────────────────────────────────────────────────────────────────────────
// 🎠 DOM SNAP CAROUSEL — POKERBROS / WORLD HUB REPLICA
// ─────────────────────────────────────────────────────────────────────────────
// Reproduces the exact WorldHub CarouselEngine.tsx logic using 2D DOM Transforms.
// Supports infinite wrapping, smooth scaling, touch velocity, and snapping.
// ─────────────────────────────────────────────────────────────────────────────

export default function GameCarousel({ games, onGameSelect }) {
    const TOTAL_GAMES = games.length;
    
    // Core carousel state
    const [scrollPosition, setScrollPosition] = useState(0);
    const [targetPosition, setTargetPosition] = useState(0);
    
    // Touch/Mouse tracking
    const isDragging = useRef(false);
    const startX = useRef(0);
    const lastX = useRef(0);
    const velocityX = useRef(0);
    const lastTime = useRef(0);
    const containerRef = useRef(null);
    const rafRef = useRef(null);

    // Normalize scrollPosition when array length changes
    useEffect(() => {
        if (TOTAL_GAMES === 0) return;
        const normalised = ((scrollPosition % TOTAL_GAMES) + TOTAL_GAMES) % TOTAL_GAMES;
        if (Math.abs(normalised - scrollPosition) > 0.01) {
            setScrollPosition(normalised);
            setTargetPosition(Math.round(normalised));
        }
    }, [TOTAL_GAMES]);

    // Haptic feedback & active index tracking
    const activeIndex = Math.round(scrollPosition);
    const prevActiveIndex = useRef(activeIndex);
    useEffect(() => {
        if (activeIndex !== prevActiveIndex.current) {
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
                navigator.vibrate(30); // Subtle haptic tick on card snap
            }
            prevActiveIndex.current = activeIndex;
        }
    }, [activeIndex]);

    // Keyboard accessibility
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'ArrowLeft') {
                setTargetPosition(prev => Math.round(prev) - 1);
            } else if (e.key === 'ArrowRight') {
                setTargetPosition(prev => Math.round(prev) + 1);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Handle momentum & snapping in requestAnimationFrame
    useEffect(() => {
        const update = () => {
            if (!isDragging.current) {
                // Smoothly interpolate to target position
                setScrollPosition(prev => {
                    const diff = targetPosition - prev;
                    if (Math.abs(diff) > 0.001) {
                        return prev + diff * 0.12; // Smooth snap
                    }
                    return targetPosition;
                });
            }
            rafRef.current = requestAnimationFrame(update);
        };
        rafRef.current = requestAnimationFrame(update);
        return () => cancelAnimationFrame(rafRef.current);
    }, [targetPosition]);

    // Attach native DOM handlers
    useEffect(() => {
        const el = containerRef.current;
        if (!el || TOTAL_GAMES === 0) return;

        const handleStart = (clientX) => {
            isDragging.current = true;
            startX.current = clientX;
            lastX.current = clientX;
            lastTime.current = Date.now();
            velocityX.current = 0;
            el.style.cursor = 'grabbing';
        };

        const handleMove = (clientX) => {
            if (!isDragging.current) return;

            const deltaX = clientX - lastX.current;
            const now = Date.now();
            const deltaTime = now - lastTime.current;

            if (deltaTime > 0) {
                velocityX.current = deltaX / deltaTime;
            }

            // Sensitivity based on container width
            const sensitivity = 0.003 * (1000 / el.clientWidth);
            const scrollDelta = -deltaX * sensitivity;

            setScrollPosition(prev => prev + scrollDelta);
            setTargetPosition(prev => prev + scrollDelta);

            lastX.current = clientX;
            lastTime.current = now;
        };

        const handleEnd = () => {
            if (!isDragging.current) return;
            isDragging.current = false;
            el.style.cursor = 'grab';

            const absVelocity = Math.abs(velocityX.current);
            if (absVelocity > 0.5) {
                // Fast swipe - add momentum
                const momentum = velocityX.current * -5;
                setTargetPosition(prev => Math.round(prev + momentum));
            } else {
                // Slow - snap to nearest
                setTargetPosition(prev => Math.round(prev));
            }
        };

        const onMouseDown = (e) => handleStart(e.clientX);
        const onMouseMove = (e) => handleMove(e.clientX);
        const onMouseUp = () => handleEnd();
        const onMouseLeave = () => handleEnd();

        const onTouchStart = (e) => {
            if (e.touches.length === 1) handleStart(e.touches[0].clientX);
        };
        const onTouchMove = (e) => {
            if (e.touches.length === 1) {
                // Prevent vertical scroll while swiping carousel
                if (Math.abs(e.touches[0].clientX - startX.current) > 10) {
                    e.preventDefault();
                }
                handleMove(e.touches[0].clientX);
            }
        };
        const onTouchEnd = () => handleEnd();

        el.addEventListener('mousedown', onMouseDown);
        el.addEventListener('mousemove', onMouseMove);
        el.addEventListener('mouseup', onMouseUp);
        el.addEventListener('mouseleave', onMouseLeave);
        el.addEventListener('touchstart', onTouchStart, { passive: false });
        el.addEventListener('touchmove', onTouchMove, { passive: false });
        el.addEventListener('touchend', onTouchEnd);
        el.addEventListener('touchcancel', onTouchEnd);

        return () => {
            el.removeEventListener('mousedown', onMouseDown);
            el.removeEventListener('mousemove', onMouseMove);
            el.removeEventListener('mouseup', onMouseUp);
            el.removeEventListener('mouseleave', onMouseLeave);
            el.removeEventListener('touchstart', onTouchStart);
            el.removeEventListener('touchmove', onTouchMove);
            el.removeEventListener('touchend', onTouchEnd);
            el.removeEventListener('touchcancel', onTouchEnd);
        };
    }, [TOTAL_GAMES]);

    const handleCardClick = (game, offset) => {
        const dragDistance = Math.abs(startX.current - lastX.current);
        if (dragDistance < 10 && Math.abs(offset) < 0.3) {
            onGameSelect?.(game);
        } else if (dragDistance < 10) {
            setTargetPosition(Math.round(scrollPosition + offset));
        }
    };

    // Calculate visible cards
    const visibleCards = useMemo(() => {
        const result = [];
        if (TOTAL_GAMES === 0) return result;

        for (let i = 0; i < TOTAL_GAMES; i++) {
            let offset = (i - scrollPosition) % TOTAL_GAMES;
            if (offset > TOTAL_GAMES / 2) offset -= TOTAL_GAMES;
            if (offset < -TOTAL_GAMES / 2) offset += TOTAL_GAMES;

            // Render up to 5 cards
            if (Math.abs(offset) <= 2.5) {
                result.push({ game: games[i], offset, index: i });
            }
        }

        // Sort so middle elements are on top
        return result.sort((a, b) => Math.abs(b.offset) - Math.abs(a.offset));
    }, [scrollPosition, games, TOTAL_GAMES]);

    if (TOTAL_GAMES === 0) return null;

    return (
        <div 
            ref={containerRef}
            className="carousel-container"
            style={{
                position: 'relative',
                width: '100%',
                height: '460px',
                overflow: 'hidden',
                cursor: 'grab',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                touchAction: 'pan-y',
                WebkitUserSelect: 'none',
                userSelect: 'none'
            }}
        >
            {/* Desktop Navigation Arrows */}
            <button 
                onClick={(e) => { e.stopPropagation(); setTargetPosition(prev => Math.round(prev) - 1); }}
                style={{
                    position: 'absolute', left: 20, zIndex: 999, 
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    color: 'white', width: 44, height: 44, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', backdropFilter: 'blur(10px)', transition: 'background 0.2s',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                }}
                onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
            >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>

            {visibleCards.map(({ game, offset, index }) => {
                const absOffset = Math.abs(offset);
                const isActive = absOffset < 0.3;
                
                // Exactly matching WorldHub CarouselEngine Math:
                const maxScale = 1.0;
                const minScale = 0.65;
                const scaleRange = maxScale - minScale;
                let scale = maxScale - (absOffset * scaleRange / 2.5);
                scale = Math.max(minScale, scale);
                
                // X Position: linear spacing
                const spacingPercent = 65; 
                const xPos = offset * spacingPercent;

                // Z-index: center is highest
                const zIndex = 100 - Math.round(absOffset * 10);
                
                // Opacity fades out slightly on edges
                const opacity = 1 - (absOffset * 0.15);
                
                // Dim non-active cards
                const filter = isActive ? 'brightness(1) drop-shadow(0 0 20px rgba(0,255,136,0.15))' : 'brightness(0.5)';

                return (
                    <div
                        key={game.id || index}
                        onClick={(e) => {
                            e.stopPropagation();
                            handleCardClick(game, offset);
                        }}
                        style={{
                            position: 'absolute',
                            width: '240px', // Standard card width
                            transform: `translateX(${xPos}%) scale(${scale})`,
                            zIndex,
                            opacity,
                            filter,
                            transition: 'filter 0.3s ease', // Only filter transitions, transform handled by RAF
                            pointerEvents: 'auto',
                            willChange: 'transform, filter'
                        }}
                    >
                        {/* Wrapper blocks pointer events during drag */}
                        <div style={{ pointerEvents: isDragging.current ? 'none' : 'auto' }}>
                            <GameCard game={game} />
                        </div>
                    </div>
                );
            })}

            <button 
                onClick={(e) => { e.stopPropagation(); setTargetPosition(prev => Math.round(prev) + 1); }}
                style={{
                    position: 'absolute', right: 20, zIndex: 999, 
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    color: 'white', width: 44, height: 44, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', backdropFilter: 'blur(10px)', transition: 'background 0.2s',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                }}
                onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
            >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
        </div>
    );
}