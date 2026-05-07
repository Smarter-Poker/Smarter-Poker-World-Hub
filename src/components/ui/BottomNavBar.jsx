/**
 * BottomNavBar — Platform-Wide Fixed Bottom Navigation
 * Per Mobile Layout Standard SKILL.md
 * 
 * 56px fixed bar with 6 tabs: Home, Reels, Friends, Pages, Alerts, Profile
 * Includes env(safe-area-inset-bottom) for iPhone notch safety.
 * Active tab highlighted in blue based on current route.
 * 
 * USAGE: Import and render at the bottom of any hub page:
 *   import BottomNavBar from '../../src/components/ui/BottomNavBar';
 *   // ... inside return:
 *   <BottomNavBar />
 * 
 * IMPORTANT: The parent page container MUST have paddingBottom: 70
 * to prevent content from being hidden behind this bar.
 */

import Link from 'next/link';
import { useRouter } from 'next/router';
import { useUnreadCount } from '../../hooks/useUnreadCount';
// BUG-FIX-LIVE-6: useUnreadCount now exposes notificationCount + messageCount
// separately. The "Alerts" tab badge reflects unread NOTIFICATIONS, not
// messages — keeping it in sync with the global header notification bell.

export default function BottomNavBar() {
  const router = useRouter();
  const path = router.asPath;
  const { notificationCount } = useUnreadCount();

  // Determine which tab is active based on current path
  const isActive = (href) => {
    if (href === '/hub/social-media') return path === '/hub/social-media' || path.startsWith('/hub/social-media/');
    if (href === '/hub/social-pages') return path.startsWith('/hub/social-pages');
    if (href === '/hub/reels') return path.startsWith('/hub/reels');
    if (href === '/hub/friends') return path.startsWith('/hub/friends');
    if (href === '/hub/notifications') return path === '/hub/notifications';
    if (href === '/hub/profile') return path === '/hub/profile';
    return false;
  };

  const activeColor = '#1877f2';
  const inactiveColor = '#65676b';
  const tabStyle = (href) => ({
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    textDecoration: 'none', color: isActive(href) ? activeColor : inactiveColor,
    flex: 1, padding: '6px 4px', minWidth: 50, position: 'relative',
  });

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, height: 56,
      background: '#ffffff', borderTop: '1px solid #dddfe2',
      display: 'flex', justifyContent: 'space-around', alignItems: 'stretch',
      zIndex: 100,
      paddingBottom: 'env(safe-area-inset-bottom, 0px)'
    }}>
      {/* Home */}
      <Link href="/hub/social-media" style={tabStyle('/hub/social-media')}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1V9.5z" />
        </svg>
        <span style={{ fontSize: 10, marginTop: 2, fontWeight: isActive('/hub/social-media') ? 700 : 500 }}>Home</span>
      </Link>
      {/* Reels */}
      <Link href="/hub/reels" style={tabStyle('/hub/reels')}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <polygon points="10,8 16,12 10,16" fill="currentColor" stroke="none" />
        </svg>
        <span style={{ fontSize: 10, marginTop: 2, fontWeight: isActive('/hub/reels') ? 700 : 500 }}>Reels</span>
      </Link>
      {/* Friends */}
      <Link href="/hub/friends" style={tabStyle('/hub/friends')}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8" cy="8" r="3" />
          <circle cx="16" cy="8" r="3" />
          <path d="M8 11a4 4 0 00-4 4v2h8v-2a4 4 0 00-4-4z" />
          <path d="M16 11c1.5 0 2.8.8 3.5 2 .4.8.5 1.3.5 2v2h-6" />
        </svg>
        <span style={{ fontSize: 10, marginTop: 2, fontWeight: isActive('/hub/friends') ? 700 : 500 }}>Friends</span>
      </Link>
      {/* Pages (was "Clubs" — now routes to social-pages listing) */}
      <Link href="/hub/social-pages" style={tabStyle('/hub/social-pages')}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M12 8l1.5 3 3.5.5-2.5 2.5.5 3.5L12 16l-3 1.5.5-3.5-2.5-2.5 3.5-.5z" fill="currentColor" />
        </svg>
        <span style={{ fontSize: 10, marginTop: 2, fontWeight: isActive('/hub/social-pages') ? 700 : 500 }}>Pages</span>
      </Link>
      {/* Alerts — routes to actual notifications page */}
      <Link href="/hub/notifications" style={tabStyle('/hub/notifications')}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 01-3.46 0" />
        </svg>
        {notificationCount > 0 && (
          <div style={{
            position: 'absolute', top: 2, right: 'calc(50% - 18px)',
            background: '#f02849', color: 'white', borderRadius: 10,
            minWidth: 18, height: 18, fontSize: 11,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 600, padding: '0 5px',
          }}>{notificationCount > 99 ? '99+' : notificationCount}</div>
        )}
        <span style={{ fontSize: 10, marginTop: 2, fontWeight: isActive('/hub/notifications') ? 700 : 500 }}>Alerts</span>
      </Link>
      {/* Profile */}
      <Link href="/hub/profile" style={tabStyle('/hub/profile')}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20v-1a6 6 0 016-6h4a6 6 0 016 6v1" />
        </svg>
        <span style={{ fontSize: 10, marginTop: 2, fontWeight: isActive('/hub/profile') ? 700 : 500 }}>Profile</span>
      </Link>
    </nav>
  );
}
