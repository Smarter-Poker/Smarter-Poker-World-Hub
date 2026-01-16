/* ═══════════════════════════════════════════════════════════════════════════
   SMARTER.POKER — WORLD NAVIGATION HEADER
   Consistent navigation for all Hub world pages
   
   Features:
   - Brain Icon (left) → Always navigates to /hub (Home)
   - Back Arrow (right of brain) → Returns to previous page in world hierarchy
   - Page Title (center, optional)
   ═══════════════════════════════════════════════════════════════════════════ */

import { useRouter } from 'next/router';

// Brain Icon SVG Component
const BrainIcon = ({ size = 32 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="brainGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#00D4FF" />
                <stop offset="100%" stopColor="#0066FF" />
            </linearGradient>
        </defs>
        <path
            d="M12 2C9.5 2 7.5 4 7.5 6.5C7.5 7.5 7.8 8.4 8.4 9.1C6.4 9.6 5 11.4 5 13.5C5 15.4 6.2 17 7.9 17.7C7.5 18.3 7.3 19 7.3 19.8C7.3 21.5 8.7 23 10.4 23C11.3 23 12.1 22.6 12.6 22C13.1 22.6 13.9 23 14.8 23C16.5 23 17.9 21.5 17.9 19.8C17.9 19 17.7 18.3 17.3 17.7C19 17 20.2 15.4 20.2 13.5C20.2 11.4 18.8 9.6 16.8 9.1C17.4 8.4 17.7 7.5 17.7 6.5C17.7 4 15.7 2 13.2 2H12Z"
            fill="url(#brainGradient)"
        />
        <path
            d="M12 6V18M9 10C9 10 10 12 12 12C14 12 15 10 15 10M9 14.5C9 14.5 10 13 12 13C14 13 15 14.5 15 14.5"
            stroke="#0a1628"
            strokeWidth="1.5"
            strokeLinecap="round"
        />
    </svg>
);

// Back Arrow SVG Component
const BackArrow = ({ size = 24 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
);

/**
 * WorldNavHeader - Navigation header for all Hub world pages
 * 
 * @param {Object} props
 * @param {string} props.title - Optional page title to display
 * @param {string} props.backTo - URL to navigate when back is pressed (if not provided, uses router.back())
 * @param {boolean} props.showBack - Whether to show the back arrow (default: true)
 * @param {string} props.backLabel - Label for back button (default: auto-detected from backTo)
 * @param {Object} props.style - Additional styles for the header container
 */
export function WorldNavHeader({
    title,
    backTo,
    showBack = true,
    backLabel,
    style = {}
}) {
    const router = useRouter();

    const handleHomeClick = () => {
        router.push('/hub');
    };

    const handleBackClick = () => {
        if (backTo) {
            router.push(backTo);
        } else {
            router.back();
        }
    };

    // Auto-detect back label from path
    const getBackLabel = () => {
        if (backLabel) return backLabel;
        if (backTo) {
            const segments = backTo.split('/').filter(Boolean);
            const lastSegment = segments[segments.length - 1];
            return lastSegment ? lastSegment.charAt(0).toUpperCase() + lastSegment.slice(1).replace(/-/g, ' ') : 'Back';
        }
        return 'Back';
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            height: 60,
            display: 'flex',
            alignItems: 'center',
            padding: '0 16px',
            background: 'linear-gradient(180deg, rgba(10, 22, 40, 0.98) 0%, rgba(10, 22, 40, 0.9) 100%)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderBottom: '1px solid rgba(0, 212, 255, 0.15)',
            zIndex: 1000,
            ...style,
        }}>
            {/* Left Section: Brain (Home) + Back */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Brain Icon - Home Button */}
                <button
                    onClick={handleHomeClick}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 44,
                        height: 44,
                        background: 'rgba(0, 212, 255, 0.1)',
                        border: '1px solid rgba(0, 212, 255, 0.3)',
                        borderRadius: 12,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                    }}
                    title="Back to Hub"
                >
                    <BrainIcon size={28} />
                </button>

                {/* Back Arrow - Previous Page */}
                {showBack && (
                    <button
                        onClick={handleBackClick}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '8px 12px',
                            background: 'transparent',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            borderRadius: 8,
                            color: 'rgba(255, 255, 255, 0.8)',
                            fontSize: 13,
                            fontFamily: 'Inter, -apple-system, sans-serif',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                        }}
                        title={`Back to ${getBackLabel()}`}
                    >
                        <BackArrow size={18} />
                        <span style={{
                            maxWidth: 100,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}>
                            {getBackLabel()}
                        </span>
                    </button>
                )}
            </div>

            {/* Center: Title */}
            {title && (
                <div style={{
                    position: 'absolute',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    fontFamily: 'Orbitron, sans-serif',
                    fontSize: 16,
                    fontWeight: 700,
                    color: '#fff',
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                }}>
                    {title}
                </div>
            )}

            {/* Right Section: Reserved for page-specific actions */}
            <div style={{ marginLeft: 'auto' }} />
        </div>
    );
}

/**
 * Simple Brain Home Button - For pages that only need the home button
 */
export function BrainHomeButton({ style = {} }) {
    const router = useRouter();

    return (
        <button
            onClick={() => router.push('/hub')}
            style={{
                position: 'fixed',
                top: 16,
                left: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 48,
                height: 48,
                background: 'rgba(10, 22, 40, 0.95)',
                border: '1px solid rgba(0, 212, 255, 0.3)',
                borderRadius: 12,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                zIndex: 1000,
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                ...style,
            }}
            title="Back to Hub"
        >
            <BrainIcon size={32} />
        </button>
    );
}

export default WorldNavHeader;
