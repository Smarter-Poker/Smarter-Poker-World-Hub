import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import SEOHead from '../../../../src/components/video-library/VideoLibrarySEOHead';
import HubPageShell from '../../../../src/components/ui/HubPageShell';
import VideoLibraryWorkspaceHeader from '../../../../src/components/video-library/VideoLibraryWorkspaceHeader';
import ChannelFollow from '../../../../src/components/video-library/ChannelFollow';
import LiveNow from '../../../../src/components/video-library/LiveNow';
import { getMenuConfig } from '../../../../src/config/hamburgerMenus';
import { getVideoMetaLine } from '../../../../src/lib/videoLibraryCards';
import { watchPath } from '../../../../src/lib/videoLibraryWatch.mjs';
import { buildChannelJsonLd } from '../../../../src/lib/videoLibraryChannels.mjs';
import VideoThumbnail from '../../../../src/components/video-library/VideoThumbnail';

const UniversalHeader = dynamic(() => import('../../../../src/components/ui/UniversalHeader'), { ssr: false });
const HamburgerMenu = dynamic(() => import('../../../../src/components/ui/HamburgerMenu'), { ssr: false });

export async function getServerSideProps({ params, res }) {
    try {
        const { loadVideoLibraryChannels } = await import('../../../../src/lib/server/videoLibraryChannels');
        const payload = await loadVideoLibraryChannels({ channelId: params?.channelId, limit: 30 });
        if (!payload.channel) return { notFound: true };
        if (params.channelId !== payload.channel.id) return { redirect: { destination: payload.channel.path, permanent: true } };
        res.setHeader('Cache-Control', 'public, s-maxage=60');
        return { props: { initial: payload } };
    } catch (error) {
        if (error.status === 404) return { notFound: true };
        res.statusCode = 503;
        res.setHeader('Cache-Control', 'no-store');
        console.warn('[video-channel] catalog unavailable:', error?.message || error);
        return { props: { unavailable: true } };
    }
}

// Page explanations live behind the mast's chrome "?" (Dan, 2026-11-27).
const CHANNEL_HELP_STEPS = Object.freeze([
    { id: 'channel', title: 'Verified Channel', body: 'Every Video Here Comes From This Channel And Passed The Verified Library Checks.', target: 'channel-identity' },
    { id: 'follow', title: 'Follow And Live', body: 'Follow Channels And Choose New Video Notifications. Notifications Appear In Your Smarter.Poker Inbox. Live Now Shows When The Channel Is Streaming, And Checked Shows When That Was Last Confirmed. Live Videos Open On YouTube.', target: 'channel-follow' },
    { id: 'videos', title: 'Newest Videos', body: 'The Newest Verified Videos From This Channel. Load More Brings In The Next Set.', target: 'channel-videos' },
]);

export default function VideoChannelPage({ initial, unavailable }) {
    const channel = initial?.channel;
    const [menuOpen, setMenuOpen] = useState(false);
    const [catalog, setCatalog] = useState(initial);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const requestRef = useRef(null);
    const channelRef = useRef(channel?.id);
    channelRef.current = channel?.id;
    useEffect(() => { setCatalog(initial); setError(null); setLoading(false); requestRef.current?.abort(); requestRef.current = null; return () => requestRef.current?.abort(); }, [initial]);
    const current = catalog?.channel?.id === channel?.id ? catalog : initial;
    const config = getMenuConfig('video-library', null, {}, {});
    const menuItems = (config.menuItems || []).filter(item => item.type !== 'toggle' && !(item.type === 'section' && item.label === 'Settings'));
    const header = <div className="vl-header-area"><div className="vl-global-header"><UniversalHeader pageDepth={2} onMenuClick={() => setMenuOpen(true)} /><HamburgerMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} direction="left" theme="dark" user={null} showProfile={false} menuItems={menuItems} bottomLinks={config.bottomLinks} /></div></div>;
    const loadMore = async () => {
        if (requestRef.current || !current?.pagination?.hasMore) return;
        const id = channel.id;
        const controller = new AbortController();
        let timedOut = false;
        const deadline = setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
        requestRef.current = controller;
        setLoading(true); setError(null);
        try {
            const response = await fetch(`/api/video-library/channels?${new URLSearchParams({ channelId: id, offset: String(current.pagination.nextOffset), limit: '30' })}`, { signal: controller.signal });
            const payload = await response.json();
            if (!response.ok || !payload.success || payload.channel?.id !== id || !Array.isArray(payload.data)) throw new Error(payload.error || 'More Channel Videos Could Not Load.');
            if (channelRef.current === id && !controller.signal.aborted) setCatalog(previous => ({ ...payload, data: [...new Map([...previous.data, ...payload.data].map(video => [video.videoId, video])).values()] }));
        } catch (failure) { if (channelRef.current === id && requestRef.current === controller && (!controller.signal.aborted || timedOut)) setError(timedOut ? 'More Channel Videos Took Too Long To Load. Try Again.' : failure.message || 'More Channel Videos Could Not Load.'); }
        finally { clearTimeout(deadline); if (requestRef.current === controller) { requestRef.current = null; setLoading(false); } }
    };
    if (unavailable || !channel) return <><SEOHead title="Channel Temporarily Unavailable" noindex /><div className="video-library-page"><HubPageShell className="video-library" maxWidth={1760} header={header}><div className="vl-console-page"><VideoLibraryWorkspaceHeader title="This Channel Could Not Load Right Now" eyebrow="Poker Channel" emblem="channel" /><div className="vl-console-frame vl-empty-state"><p>The Video Catalog Did Not Answer. Try Again In A Minute.</p><Link href="/hub/video-library" className="vl-pill-button">Browse The Video Library</Link></div></div></HubPageShell></div></>;
    return <><SEOHead title={`${channel.name} | Video Library`} description={channel.description || `Watch Verified Videos From ${channel.name} On Smarter.Poker.`} canonical={`https://smarter.poker${channel.path}`} jsonLd={buildChannelJsonLd(channel, current?.data || [])} />
        <div className="video-library-page"><HubPageShell className="video-library" maxWidth={1760} header={header}>
            <article className="vl-channel-page vl-console-page" data-channel-id={channel.id}>
                <nav className="vl-breadcrumbs" aria-label="Breadcrumb"><Link href="/hub">World Hub</Link><span aria-hidden="true">/</span><Link href="/hub/video-library">Video Library</Link><span aria-hidden="true">/</span><span aria-current="page">{channel.name}</span></nav>
                <VideoLibraryWorkspaceHeader title={channel.name} eyebrow="Poker Channel" emblem="channel" helpId="channel" helpSteps={CHANNEL_HELP_STEPS} />
                <section className="vl-console-frame vl-console-identity" data-tutorial="channel-identity" aria-label="Channel Overview"><div className="vl-channel-logo" aria-hidden="true">{channel.logo ? <img src={channel.logo} alt="" /> : <span>{channel.name.split(/\s+/).map(word => word[0]).join('').slice(0, 2)}</span>}</div>{channel.description && <p className="vl-console-copy">{channel.description}</p>}<dl className="vl-console-stats"><div className="vl-console-stat"><dt>Verified Videos Shown</dt><dd>{current.data.length.toLocaleString()}</dd></div></dl>{channel.externalUrl && <div className="vl-console-actions"><a href={channel.externalUrl} className="vl-pill-button" target="_blank" rel="noopener noreferrer">Visit The Original Channel</a></div>}</section>
                <section className="vl-console-frame" data-tutorial="channel-follow" aria-label="Follow And Live Status"><ChannelFollow key={channel.id} channelId={channel.id} channelPath={channel.path} />
                <LiveNow channelId={channel.id} /></section>
                <section className="vl-channel-videos vl-console-frame" data-tutorial="channel-videos" aria-labelledby="vl-channel-newest"><h2 id="vl-channel-newest" className="vl-console-frame-title">Newest Videos</h2>
                    {current.data.length ? <div className="vl-video-grid" id="video-library-grid">{current.data.map((video, index) => <div key={video.videoId} className="vl-video-card"><Link className="vl-video-link" href={watchPath(video)} aria-label={`Watch ${video.title}`}><div className="vl-video-thumb"><VideoThumbnail video={video} priority={index === 0} />{video.duration && <span className="vl-duration">{video.duration}</span>}</div></Link><div className="vl-card-info"><div className="vl-card-text"><h3 className="vl-card-title"><Link href={watchPath(video)}>{video.title}</Link></h3><p className="vl-card-meta">{getVideoMetaLine(video)}</p></div></div></div>)}</div> : <div className="vl-empty-state"><h3>No Verified Videos Right Now</h3></div>}
                    {error && <p role="alert">{error}</p>}{current.pagination.hasMore && <button type="button" className="vl-pill-button" disabled={loading} onClick={() => void loadMore()}>{loading ? 'Loading Videos' : error ? 'Retry Loading Videos' : 'Load More Videos'}</button>}
                </section>
            </article>
        </HubPageShell></div>
    </>;
}
