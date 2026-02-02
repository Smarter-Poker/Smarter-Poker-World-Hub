/* CLUB ARENA — Shared Bottom Navigation Component
 * HARDENED: Single source of truth for bottom nav across all Club Arena pages
 * Uses clubIdParam (from URL) to render immediately without waiting for async data
 */
import Link from 'next/link';

const FB = {
    primary: '#2374E1',
    cardBg: '#242526',
    textSecondary: '#B0B3B8',
    border: '#3E4042'
};

const S = {
    bottomNav: {
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        background: FB.cardBg,
        borderTop: `1px solid ${FB.border}`,
        boxShadow: '0 -2px 10px rgba(0,0,0,0.3)'
    },
    bottomNavItems: {
        display: 'flex',
        justifyContent: 'space-around',
        padding: '6px 0'
    },
    bottomNavItem: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '2px',
        flex: 1,
        padding: '8px 4px',
        textDecoration: 'none',
        color: FB.textSecondary
    },
    bottomNavIcon: {
        width: '24px',
        height: '24px'
    },
    bottomNavLabel: {
        fontSize: '11px',
        fontWeight: 600
    }
};

// SVG Icons as inline components for cleaner JSX
const MessagesIcon = () => (
    <svg style={S.bottomNavIcon} viewBox="0 0 24 24" fill="currentColor">
        <path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4c0-1.1-.9-2-2-2z" />
    </svg>
);

const PlayersIcon = () => (
    <svg style={S.bottomNavIcon} viewBox="0 0 24 24" fill="currentColor">
        <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3z" />
    </svg>
);

const CashierIcon = () => (
    <svg style={S.bottomNavIcon} viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 14V6c0-1.1-.9-2-2-2H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2z" />
    </svg>
);

const DataIcon = () => (
    <svg style={S.bottomNavIcon} viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" />
    </svg>
);

const AdminIcon = () => (
    <svg style={S.bottomNavIcon} viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 00-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
    </svg>
);

/**
 * ClubArenaBottomNav - Hardened bottom navigation component
 * 
 * @param {string} clubId - The club ID from URL query param (required)
 * @param {string} activePage - Current page name: 'messages' | 'players' | 'cashier' | 'data' | 'admin'
 */
export default function ClubArenaBottomNav({ clubId, activePage }) {
    // HARDENED: Don't render if no clubId - prevents broken links
    if (!clubId) return null;

    const navItems = [
        { key: 'messages', label: 'Messages', href: `/hub/club-arena/messages?club=${clubId}`, Icon: MessagesIcon },
        { key: 'players', label: 'Players', href: `/hub/club-arena/players?club=${clubId}`, Icon: PlayersIcon },
        { key: 'cashier', label: 'Cashier', href: `/hub/club-arena/cashier?club=${clubId}`, Icon: CashierIcon },
        { key: 'data', label: 'Data', href: `/hub/club-arena/player-stats?club=${clubId}`, Icon: DataIcon },
        { key: 'admin', label: 'Admin', href: `/hub/club-arena/admin?club=${clubId}`, Icon: AdminIcon },
    ];

    return (
        <nav style={S.bottomNav}>
            <div style={S.bottomNavItems}>
                {navItems.map(({ key, label, href, Icon }) => (
                    <Link
                        key={key}
                        href={href}
                        style={{
                            ...S.bottomNavItem,
                            color: activePage === key ? FB.primary : FB.textSecondary
                        }}
                    >
                        <Icon />
                        <span style={S.bottomNavLabel}>{label}</span>
                    </Link>
                ))}
            </div>
        </nav>
    );
}
