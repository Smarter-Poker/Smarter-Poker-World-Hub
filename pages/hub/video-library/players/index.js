import { useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import SEOHead from '../../../../src/components/video-library/VideoLibrarySEOHead';
import HubPageShell from '../../../../src/components/ui/HubPageShell';
import VideoLibraryWorkspaceHeader from '../../../../src/components/video-library/VideoLibraryWorkspaceHeader';
import SmarterAccountUnlockGate from '../../../../src/components/seo/SmarterAccountUnlockGate';
import { getMenuConfig } from '../../../../src/config/hamburgerMenus';
import { buildVideoLibraryBreadcrumbs } from '../../../../src/lib/videoLibraryBreadcrumbs.mjs';
import { VIDEO_LIBRARY_PLAYERS } from '../../../../src/lib/videoLibraryPlayers.mjs';

const UniversalHeader = dynamic(() => import('../../../../src/components/ui/UniversalHeader'), { ssr: false });
const HamburgerMenu = dynamic(() => import('../../../../src/components/ui/HamburgerMenu'), { ssr: false });

// The explanation lives behind the mast's chrome "?" (Dan, 2026-11-27).
const PLAYERS_HELP_STEPS = Object.freeze([
    { id: 'players', title: 'Poker Players', body: 'Explore Videos Naming These Players In Their Published Titles Or Tags.', target: 'player-directory' },
]);

export default function VideoLibraryPlayersDirectory() {
    const [menuOpen, setMenuOpen] = useState(false);
    const config = getMenuConfig('video-library', null, {}, {});
    const menuItems = (config.menuItems || []).filter(item => item.type !== 'toggle' && !(item.type === 'section' && item.label === 'Settings'));
    const header = <div className="vl-header-area"><div className="vl-global-header"><UniversalHeader pageDepth={2} onMenuClick={() => setMenuOpen(true)} /><HamburgerMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} direction="left" theme="dark" user={null} showProfile={false} menuItems={menuItems} bottomLinks={config.bottomLinks} /></div></div>;
    return <><SEOHead title="Poker Players | Video Library" description="Browse Verified Smarter.Poker Video Library Recordings Naming Featured Poker Players In Their Published Cash Game And Tournament Titles Or Tags." canonical="https://smarter.poker/hub/video-library/players" jsonLd={buildVideoLibraryBreadcrumbs([['World Hub', '/hub'], ['Video Library', '/hub/video-library'], ['Poker Players', '/hub/video-library/players']])} />
        <div className="video-library-page"><HubPageShell className="video-library" maxWidth={1760} header={header}>
            <article className="vl-player-directory vl-console-page">
                <nav className="vl-breadcrumbs" aria-label="Breadcrumb"><Link href="/hub">World Hub</Link><span aria-hidden="true">/</span><Link href="/hub/video-library">Video Library</Link><span aria-hidden="true">/</span><span aria-current="page">Poker Players</span></nav>
                <VideoLibraryWorkspaceHeader title="Poker Players" eyebrow="Video Library" emblem="player" helpId="players" helpSteps={PLAYERS_HELP_STEPS} />
                <section className="vl-console-frame" data-tutorial="player-directory" aria-label="Poker Players Directory"><nav className="vl-player-directory-links" aria-label="Poker Players">{VIDEO_LIBRARY_PLAYERS.map(player => <Link key={player.id} className="vl-pill-button" href={player.path}>{player.name}</Link>)}</nav></section>
                <div style={{ marginTop: 24 }}>
                    <SmarterAccountUnlockGate
                        variant="video-drill"
                        context="video-library-players-index"
                        redirectPath="/hub/video-library/players"
                    />
                </div>
            </article>
        </HubPageShell></div>
    </>;
}
