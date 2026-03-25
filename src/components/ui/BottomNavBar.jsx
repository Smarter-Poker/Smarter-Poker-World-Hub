/**
 * BottomNavBar — Platform-Wide Fixed Bottom Navigation
 * Per Mobile Layout Standard SKILL.md
 * 
 * 56px fixed bar with 6 tabs: Home, Reels, Friends, Clubs, Alerts, Profile
 * Includes env(safe-area-inset-bottom) for iPhone notch safety.
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

export default function BottomNavBar() {
  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, height: 56,
      background: '#ffffff', borderTop: '1px solid #dddfe2',
      display: 'flex', justifyContent: 'space-around', alignItems: 'stretch',
      zIndex: 100,
      paddingBottom: 'env(safe-area-inset-bottom, 0px)'
    }}>
      {/* Home */}
      <Link href="/hub/social-media" style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        textDecoration: 'none', color: '#65676b', flex: 1, padding: '6px 4px', minWidth: 50
      }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1V9.5z" />
        </svg>
        <span style={{ fontSize: 10, marginTop: 2, fontWeight: 500 }}>Home</span>
      </Link>
      {/* Reels */}
      <Link href="/hub/reels" style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        textDecoration: 'none', color: '#65676b', flex: 1, padding: '6px 4px', minWidth: 50
      }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <polygon points="10,8 16,12 10,16" fill="currentColor" stroke="none" />
        </svg>
        <span style={{ fontSize: 10, marginTop: 2, fontWeight: 500 }}>Reels</span>
      </Link>
      {/* Friends */}
      <Link href="/hub/friends" style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        textDecoration: 'none', color: '#65676b', flex: 1, padding: '6px 4px', minWidth: 50
      }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8" cy="8" r="3" />
          <circle cx="16" cy="8" r="3" />
          <path d="M8 11a4 4 0 00-4 4v2h8v-2a4 4 0 00-4-4z" />
          <path d="M16 11c1.5 0 2.8.8 3.5 2 .4.8.5 1.3.5 2v2h-6" />
        </svg>
        <span style={{ fontSize: 10, marginTop: 2, fontWeight: 500 }}>Friends</span>
      </Link>
      {/* Clubs */}
      <Link href="/hub/social-media?view=club-pages" style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        textDecoration: 'none', color: '#65676b', flex: 1, padding: '6px 4px', minWidth: 50
      }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M12 8l1.5 3 3.5.5-2.5 2.5.5 3.5L12 16l-3 1.5.5-3.5-2.5-2.5 3.5-.5z" fill="currentColor" />
        </svg>
        <span style={{ fontSize: 10, marginTop: 2, fontWeight: 500 }}>Clubs</span>
      </Link>
      {/* Alerts */}
      <Link href="/hub/social-media" style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        textDecoration: 'none', color: '#65676b', flex: 1, padding: '6px 4px', minWidth: 50
      }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 01-3.46 0" />
        </svg>
        <span style={{ fontSize: 10, marginTop: 2, fontWeight: 500 }}>Alerts</span>
      </Link>
      {/* Profile */}
      <Link href="/hub/profile" style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        textDecoration: 'none', color: '#65676b', flex: 1, padding: '6px 4px', minWidth: 50
      }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20v-1a6 6 0 016-6h4a6 6 0 016 6v1" />
        </svg>
        <span style={{ fontSize: 10, marginTop: 2, fontWeight: 500 }}>Profile</span>
      </Link>
    </nav>
  );
}
