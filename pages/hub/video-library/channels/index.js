import { useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import SEOHead from '../../../../src/components/video-library/VideoLibrarySEOHead';
import HubPageShell from '../../../../src/components/ui/HubPageShell';
import { getMenuConfig } from '../../../../src/config/hamburgerMenus';
import { buildVideoLibraryBreadcrumbs } from '../../../../src/lib/videoLibraryBreadcrumbs.mjs';

const UniversalHeader = dynamic(() => import('../../../../src/components/ui/UniversalHeader'), { ssr: false });
const HamburgerMenu = dynamic(() => import('../../../../src/components/ui/HamburgerMenu'), { ssr: false });

export async function getServerSideProps({ res }) {
    try {
        const { loadVideoLibraryChannels } = await import('../../../../src/lib/server/videoLibraryChannels');
        const payload = await loadVideoLibraryChannels({ limit: 50 });
        res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=1800');
        return {
            props: {
                channels: Array.isArray(payload?.channels) ? payload.channels : [],
            },
        };
    } catch (error) {
        console.warn('[video-channels-directory] catalog unavailable:', error?.message || error);
        res.setHeader('Cache-Control', 'public, s-maxage=60');
        return {
            props: {
                channels: [],
            },
        };
    }
}

export default function VideoLibraryChannelsDirectory({ channels = [] }) {
    const [menuOpen, setMenuOpen] = useState(false);
    const config = getMenuConfig('video-library', null, {}, {});
    const menuItems = (config.menuItems || []).filter(item => item.type !== 'toggle' && !(item.type === 'section' && item.label === 'Settings'));
    const header = <div className="vl-header-area"><div className="vl-global-header"><UniversalHeader pageDepth={2} onMenuClick={() => setMenuOpen(true)} /><HamburgerMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} direction="left" theme="dark" user={null} showProfile={false} menuItems={menuItems} bottomLinks={config.bottomLinks} /></div></div>;
    const breadcrumbs = buildVideoLibraryBreadcrumbs([
        ['World Hub', '/hub'],
        ['Video Library', '/hub/video-library'],
        ['Poker Channels', '/hub/video-library/channels'],
    ]);
    const itemList = {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: 'Verified Poker Channels In The Smarter.Poker Video Library',
        numberOfItems: channels.length,
        itemListElement: channels.map((ch, idx) => ({
            '@type': 'ListItem',
            position: idx + 1,
            name: ch.name,
            url: `https://smarter.poker${ch.path}`,
        })),
    };

    return (
        <>
            <SEOHead
                title="Poker Video Channels & Streams"
                description="Browse Verified Poker Video Channels, Live Streamers, And Tournament Broadcast Archives In The Smarter.Poker Video Library With Curated Watch Pages."
                canonical="https://smarter.poker/hub/video-library/channels"
                jsonLd={[breadcrumbs, itemList]}
            />
            <div className="video-library-page">
                <HubPageShell className="video-library" maxWidth={1760} header={header}>
                    <article className="vl-player-directory">
                        <nav className="vl-breadcrumbs" aria-label="Breadcrumb">
                            <Link href="/hub">World Hub</Link>
                            <span aria-hidden="true">/</span>
                            <Link href="/hub/video-library">Video Library</Link>
                            <span aria-hidden="true">/</span>
                            <span aria-current="page">Poker Channels</span>
                        </nav>
                        <h1>Poker Video Channels</h1>
                        <p>Explore Verified Poker Channels And Broadcast Archives In The Smarter.Poker Video Library.</p>
                        {channels.length > 0 ? (
                            <nav className="vl-player-directory-links" aria-label="Poker Channels">
                                {channels.map(ch => (
                                    <Link key={ch.id} className="vl-pill-button" href={ch.path}>
                                        {ch.name}
                                    </Link>
                                ))}
                            </nav>
                        ) : (
                            <p>Browse All Verified Channels Directly From The <Link href="/hub/video-library">Poker Video Library</Link>.</p>
                        )}
                    </article>
                </HubPageShell>
            </div>
        </>
    );
}
