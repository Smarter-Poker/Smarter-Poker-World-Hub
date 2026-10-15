import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import SEOHead from '../../../../src/components/seo/SEOHead';
import HubPageShell from '../../../../src/components/ui/HubPageShell';
import { getMenuConfig } from '../../../../src/config/hamburgerMenus';
import { getVideoMetaLine } from '../../../../src/lib/videoLibraryCards';
import { getVideoLibraryPlayer, matchesVideoPlayer } from '../../../../src/lib/videoLibraryPlayers.mjs';
import { watchPath } from '../../../../src/lib/videoLibraryWatch.mjs';
import VideoThumbnail from '../../../../src/components/video-library/VideoThumbnail';

const UniversalHeader = dynamic(() => import('../../../../src/components/ui/UniversalHeader'), { ssr: false });
const HamburgerMenu = dynamic(() => import('../../../../src/components/ui/HamburgerMenu'), { ssr: false });

export async function getServerSideProps({ params, res }) {
    if (!getVideoLibraryPlayer(params?.playerId)) return { notFound: true };
    try {
        const { loadVideoLibraryPlayer } = await import('../../../../src/lib/server/videoLibraryPlayers');
        const payload = await loadVideoLibraryPlayer({ playerId: params?.playerId, limit: 30 });
        if (!payload.player) return { notFound: true };
        if (params.playerId !== payload.player.id) return { redirect: { destination: payload.player.path, permanent: true } };
        res.setHeader('Cache-Control', 'public, s-maxage=60');
        return { props: { initial: payload } };
    } catch (error) {
        if (error.status === 404) return { notFound: true };
        res.statusCode = 503;
        res.setHeader('Cache-Control', 'no-store');
        console.warn('[video-player] catalog unavailable:', error?.message || error);
        return { props: { unavailable: true } };
    }
}

export default function VideoLibraryPlayerPage({ initial, unavailable }) {
    const player = initial?.player;
    const [menuOpen, setMenuOpen] = useState(false);
    const [catalog, setCatalog] = useState(initial);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const requestRef = useRef(null);
    const playerRef = useRef(player?.id);
    playerRef.current = player?.id;
    useEffect(() => { setCatalog(initial); setError(null); setLoading(false); requestRef.current?.abort(); requestRef.current = null; return () => requestRef.current?.abort(); }, [initial]);
    const current = catalog?.player?.id === player?.id ? catalog : initial;
    const config = getMenuConfig('video-library', null, {}, {});
    const menuItems = (config.menuItems || []).filter(item => item.type !== 'toggle' && !(item.type === 'section' && item.label === 'Settings'));
    const header = <div className="vl-header-area"><div className="vl-global-header"><UniversalHeader pageDepth={2} onMenuClick={() => setMenuOpen(true)} /><HamburgerMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} direction="left" theme="dark" user={null} showProfile={false} menuItems={menuItems} bottomLinks={config.bottomLinks} /></div></div>;
    const loadMore = async () => {
        if (requestRef.current || !current?.pagination?.hasMore) return;
        const id = player.id;
        const controller = new AbortController();
        let timedOut = false;
        const deadline = setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
        requestRef.current = controller;
        setLoading(true); setError(null);
        try {
            const response = await fetch(`/api/video-library/catalog?${new URLSearchParams({ playerId: id, offset: String(current.pagination.nextOffset), limit: '30' })}`, { signal: controller.signal });
            const payload = await response.json();
            if (!response.ok || !payload.success || payload.player?.id !== id || !Array.isArray(payload.data) || payload.data.some(video => !matchesVideoPlayer(video, id))) throw new Error(payload.error || 'More Player Videos Could Not Load.');
            if (playerRef.current === id && !controller.signal.aborted) setCatalog(previous => ({ ...payload, data: [...new Map([...previous.data, ...payload.data].map(video => [video.videoId, video])).values()] }));
        } catch (failure) { if (playerRef.current === id && requestRef.current === controller && (!controller.signal.aborted || timedOut)) setError(timedOut ? 'More Player Videos Took Too Long To Load. Try Again.' : failure.message || 'More Player Videos Could Not Load.'); }
        finally { clearTimeout(deadline); if (requestRef.current === controller) { requestRef.current = null; setLoading(false); } }
    };
    if (unavailable || !player) return <><SEOHead title="Player Temporarily Unavailable" noindex /><div className="video-library-page"><HubPageShell className="video-library" maxWidth={1760} header={header}><div className="vl-empty-state"><h1>This Player Could Not Load Right Now</h1><p>The Video Catalog Did Not Answer. Try Again In A Minute.</p><Link href="/hub/video-library" className="vl-pill-button">Browse The Video Library</Link></div></HubPageShell></div></>;
    return <><SEOHead title={`${player.name} | Video Library`} description={`Browse Verified Catalog Videos Naming ${player.name} In Their Titles Or Tags.`} canonical={`https://smarter.poker${player.path}`} />
        <div className="video-library-page"><HubPageShell className="video-library" maxWidth={1760} header={header}>
            <article className="vl-player-page" data-player-id={player.id}>
                <nav className="vl-breadcrumbs" aria-label="Breadcrumb"><Link href="/hub">World Hub</Link><span aria-hidden="true">/</span><Link href="/hub/video-library">Video Library</Link><span aria-hidden="true">/</span><Link href="/hub/video-library/players">Poker Players</Link><span aria-hidden="true">/</span><span aria-current="page">{player.name}</span></nav>
                <header className="vl-player-header"><div className="vl-player-logo" aria-hidden="true"><span>{player.name.split(/\s+/).map(word => word[0]).join('').slice(0, 2)}</span></div><div className="vl-player-meta"><h1>{player.name}</h1><p>Videos Whose Published Titles Or Tags Name This Player.</p><p>{`Showing ${current.data.length} Verified Video${current.data.length === 1 ? '' : 's'}`}</p></div></header>
                <section className="vl-player-videos" aria-labelledby="vl-player-newest"><h2 id="vl-player-newest">{`Videos Naming ${player.name}`}</h2>
                    {current.data.length ? <div className="vl-video-grid" id="video-library-grid">{current.data.map((video, index) => <div key={video.videoId} className="vl-video-card"><Link className="vl-video-link" href={watchPath(video)} aria-label={`Watch ${video.title}`}><div className="vl-video-thumb"><VideoThumbnail video={video} priority={index === 0} />{video.duration && <span className="vl-duration">{video.duration}</span>}</div></Link><div className="vl-card-info"><div className="vl-card-text"><h3 className="vl-card-title"><Link href={watchPath(video)}>{video.title}</Link></h3><p className="vl-card-meta">{getVideoMetaLine(video)}</p></div></div></div>)}</div> : <div className="vl-empty-state"><h3>No Verified Videos Right Now</h3><p>No Eligible Catalog Videos Currently Name This Player.</p></div>}
                    {error && <p role="alert">{error}</p>}{current.pagination.hasMore && <button type="button" className="vl-pill-button" disabled={loading} onClick={() => void loadMore()}>{loading ? 'Loading Videos' : error ? 'Retry Loading Videos' : 'Load More Videos'}</button>}
                </section>
            </article>
        </HubPageShell></div>
    </>;
}
