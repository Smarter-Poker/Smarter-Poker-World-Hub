/* ═══════════════════════════════════════════════════════════════════════════
   GLOBAL SEARCH — Quick access search overlay
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// 🔍 SEARCH ORB BUTTON — Same size as other HUD orbs
// ─────────────────────────────────────────────────────────────────────────────
interface SearchOrbProps {
    onClick: () => void;
    size?: number;
}

export function SearchOrb({ onClick, size = 48 }: SearchOrbProps) {
    const [isHovered, setIsHovered] = useState(false);
    const [glowOpacity, setGlowOpacity] = useState(0.3);

    // Gentle pulsing glow like other orbs
    useEffect(() => {
        let animFrame: number;
        const startTime = Date.now();

        const animate = () => {
            const elapsed = (Date.now() - startTime) / 1000;
            const pulse = (Math.sin(elapsed * 0.5) + 1) / 2;
            setGlowOpacity(0.2 + pulse * 0.3);
            animFrame = requestAnimationFrame(animate);
        };

        animate();
        return () => cancelAnimationFrame(animFrame);
    }, []);

    return (
        <button
            onClick={onClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
                width: size,
                height: size,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg, rgba(0, 40, 80, 0.8), rgba(0, 20, 50, 0.9))',
                border: '2px solid rgba(255, 255, 255, 0.8)',
                borderRadius: '50%',
                cursor: 'pointer',
                transition: 'transform 0.2s ease-out',
                transform: isHovered ? 'scale(1.1)' : 'scale(1)',
                boxShadow: `
                    0 0 ${8 + glowOpacity * 12}px rgba(0, 212, 255, ${glowOpacity}),
                    0 4px 16px rgba(0, 0, 0, 0.4)
                `,
                flexShrink: 0,
            }}
            title="Search (Ctrl+K)"
        >
            <svg
                width={size * 0.4}
                height={size * 0.4}
                viewBox="0 0 24 24"
                fill="none"
                stroke={isHovered ? '#00d4ff' : '#ffffff'}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
            </svg>
        </button>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔍 SEARCH OVERLAY
// ─────────────────────────────────────────────────────────────────────────────
interface SearchOverlayProps {
    isOpen: boolean;
    onClose: () => void;
}

export function SearchOverlay({ isOpen, onClose }: SearchOverlayProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<string[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);

    // Focus input when opened
    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    // Keyboard shortcut (Ctrl+K / Cmd+K)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                if (!isOpen) {
                    // Parent should handle opening
                }
            }
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    // Mock search results
    useEffect(() => {
        if (query.trim()) {
            // Simulate search
            const mockResults = [
                'Social Media',
                'Club Arena',
                'Training Games',
                'Trivia',
                'Bankroll Manager',
                'Diamond Arena',
            ].filter(r => r.toLowerCase().includes(query.toLowerCase()));
            setResults(mockResults);
        } else {
            setResults([]);
        }
    }, [query]);

    if (!isOpen) return null;

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.7)',
                backdropFilter: 'blur(5px)',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
                paddingTop: 120,
                zIndex: 1000,
            }}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    width: '100%',
                    maxWidth: 500,
                    background: 'linear-gradient(180deg, rgba(20, 30, 50, 0.98), rgba(10, 20, 40, 0.98))',
                    borderRadius: 16,
                    border: '1px solid rgba(0, 212, 255, 0.3)',
                    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5), 0 0 40px rgba(0, 212, 255, 0.1)',
                    overflow: 'hidden',
                }}
            >
                {/* Search Input */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '16px 20px',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                    }}
                >
                    <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#00d4ff"
                        strokeWidth="2"
                        style={{ marginRight: 12 }}
                    >
                        <circle cx="11" cy="11" r="8" />
                        <path d="M21 21l-4.35-4.35" />
                    </svg>
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Search clubs, players, content..."
                        style={{
                            flex: 1,
                            background: 'transparent',
                            border: 'none',
                            outline: 'none',
                            fontFamily: 'Inter, sans-serif',
                            fontSize: 16,
                            color: '#ffffff',
                        }}
                    />
                    <span
                        style={{
                            padding: '4px 8px',
                            background: 'rgba(255, 255, 255, 0.1)',
                            borderRadius: 4,
                            fontFamily: 'monospace',
                            fontSize: 11,
                            color: 'rgba(255, 255, 255, 0.5)',
                        }}
                    >
                        ESC
                    </span>
                </div>

                {/* Results */}
                {results.length > 0 && (
                    <div style={{ padding: '8px 0', maxHeight: 300, overflowY: 'auto' }}>
                        {results.map((result, index) => (
                            <div
                                key={result}
                                onClick={() => {
                                    console.log('Selected:', result);
                                    onClose();
                                }}
                                style={{
                                    padding: '12px 20px',
                                    cursor: 'pointer',
                                    background: index === 0 ? 'rgba(0, 212, 255, 0.1)' : 'transparent',
                                    transition: 'background 0.2s ease',
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.background = 'rgba(0, 212, 255, 0.1)';
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.background = index === 0 ? 'rgba(0, 212, 255, 0.1)' : 'transparent';
                                }}
                            >
                                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, color: '#ffffff' }}>
                                    {result}
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Empty state */}
                {query && results.length === 0 && (
                    <div style={{ padding: 40, textAlign: 'center' }}>
                        <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: 14 }}>
                            No results for "{query}"
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}

export default SearchOverlay;
