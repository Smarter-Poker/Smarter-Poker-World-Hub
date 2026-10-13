import { useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import SEOHead from '../../../../src/components/seo/SEOHead';
import HubPageShell from '../../../../src/components/ui/HubPageShell';
import { getMenuConfig } from '../../../../src/config/hamburgerMenus';
import { VIDEO_LIBRARY_PLAYERS } from '../../../../src/lib/videoLibraryPlayers.mjs';

const UniversalHeader = dynamic(() => import('../../../../src/components/ui/UniversalHeader'), { ssr: false });
const HamburgerMenu = dynamic(() => import('../../../../src/components/ui/HamburgerMenu'), { ssr: false });

export default function VideoLibraryPlayersDirectory() {
    const [menuOpen, setMenuOpen] = useState(false);
    const config = getMenuConfig('video-library', null, {}, {});
    const menuItems = (config.menuItems || []).filter(item => item.type !== 'toggle' && !(item.type === 'section' && item.label === 'Settings'));
    const header = <div className="vl-header-area"><div className="vl-global-header"><UniversalHeader pageDepth={2} onMenuClick={() => setMenuOpen(true)} /><HamburgerMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} direction="left" theme="dark" user={null} showProfile={false} menuItems={menuItems} bottomLinks={config.bottomLinks} /></div></div>;
    return <><SEOHead title="Poker Players | Video Library" description="Browse Verified Catalog Videos Naming Poker Players In Their Published Titles Or Tags." canonical="https://smarter.poker/hub/video-library/players" />
        <div className="video-library-page"><HubPageShell className="video-library" maxWidth={1760} header={header}>
            <article className="vl-player-directory">
                <nav className="vl-breadcrumbs" aria-label="Breadcrumb"><Link href="/hub">World Hub</Link><span aria-hidden="true">/</span><Link href="/hub/video-library">Video Library</Link><span aria-hidden="true">/</span><span aria-current="page">Poker Players</span></nav>
                <h1>Poker Players</h1><p>Explore Videos Naming These Players In Their Published Titles Or Tags.</p>
                <nav className="vl-player-directory-links" aria-label="Poker Players">{VIDEO_LIBRARY_PLAYERS.map(player => <Link key={player.id} className="vl-pill-button" href={player.path}>{player.name}</Link>)}</nav>
            </article>
        </HubPageShell></div>
    </>;
}
