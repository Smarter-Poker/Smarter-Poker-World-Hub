import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import SEOHead from '../../../../src/components/seo/SEOHead';
import HubPageShell from '../../../../src/components/ui/HubPageShell';
import { useAvatar } from '../../../../src/contexts/AvatarContext';
import { getAuthUserId } from '../../../../src/lib/authUtils';
import { getMenuConfig } from '../../../../src/config/hamburgerMenus';
import { createVideoLibraryOwnerScope } from '../../../../src/lib/videoLibraryOwnerScope.mjs';
import { getVideoPlaylist, reorderVideoPlaylist } from '../../../../src/services/videoPlaylists';
import { shuffleQueueItems, playlistPath, MAX_QUEUE_ITEMS } from '../../../../src/lib/videoLibraryQueue.mjs';
import useVideoLibraryQueue from '../../../../src/components/video-library/useVideoLibraryQueue';
import { watchPath } from '../../../../src/lib/videoLibraryWatch.mjs';
import VideoThumbnail from '../../../../src/components/video-library/VideoThumbnail';
const UniversalHeader = dynamic(() => import('../../../../src/components/ui/UniversalHeader'), { ssr: false });
const HamburgerMenu = dynamic(() => import('../../../../src/components/ui/HamburgerMenu'), { ssr: false });
import { LEGACY_VIDEO_ID_ALIASES } from '../../../../src/data/videoLibraryCompatibility';
const canonicalId = id => LEGACY_VIDEO_ID_ALIASES[id] || id;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export default function VideoPlaylistPage() {
    const router = useRouter();
    const playlistId = typeof router.query.playlistId === 'string' ? router.query.playlistId : null;
    const { user } = useAvatar();
    const ownerId = user?.id || null;
    const scope = useRef(null);
    if (!scope.current) scope.current = createVideoLibraryOwnerScope(ownerId);
    scope.current.activate(ownerId);
    const identity = useRef({ ownerId, playlistId, generation: 0 });
    if (identity.current.ownerId !== ownerId || identity.current.playlistId !== playlistId) identity.current = { ownerId, playlistId, generation: identity.current.generation + 1 };
    const [state, setState] = useState(null);
    const [reload, setReload] = useState(0);
    const [menuOpen, setMenuOpen] = useState(false);
    const pending = useRef(null);
    const current = state?.ownerId === ownerId && state.playlistId === playlistId && state.generation === identity.current.generation ? state : null;
    const queue = useVideoLibraryQueue(ownerId);
    const menu = getMenuConfig('video-library', null, {}, {});
    const header = <div className="vl-header-area"><div className="vl-global-header"><UniversalHeader pageDepth={2} onMenuClick={() => setMenuOpen(true)} /><HamburgerMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} direction="left" theme="dark" user={null} showProfile={false} menuItems={(menu.menuItems || []).filter(item => item.type !== 'toggle')} bottomLinks={menu.bottomLinks} /></div></div>;
    useEffect(() => {
        if (!ownerId || !UUID.test(playlistId || '')) return;
        const token = scope.current.capture(ownerId);
        const generation = identity.current.generation;
        const controller = new AbortController();
        let active = true;
        const valid = () => active && scope.current.isCurrent(token) && identity.current.generation === generation;
        const deadline = setTimeout(() => controller.abort(), 15000);
        setState({ ownerId, playlistId, generation, status: 'loading' });
        void (async () => {
            try {
                if (getAuthUserId() !== ownerId) throw new Error('Sign In Again To Load Your Playlist.');
                const playlist = await getVideoPlaylist(ownerId, playlistId, controller.signal);
                if (!valid()) return;
                if (!playlist) throw new Error('This Playlist Is Unavailable For Your Profile.');
                if (playlist.items.length > 500) throw new Error('This Playlist Is Too Large To Load.');
                const ids = playlist.items.map(item => canonicalId(item.video_id)).filter(id => /^[A-Za-z0-9_-]{11}$/.test(id));
                const catalog = new Map();
                for (let offset = 0; offset < ids.length; offset += 60) {
                    const response = await fetch(`/api/video-library/catalog?${new URLSearchParams({ ids: ids.slice(offset, offset + 60).join(','), limit: '60' })}`, { signal: controller.signal, cache: 'no-store' });
                    const payload = await response.json();
                    if (!response.ok || !payload.success || !Array.isArray(payload.data)) throw new Error('Available Playlist Videos Could Not Load.');
                    for (const video of payload.data) if (ids.includes(video.videoId)) catalog.set(video.videoId, video);
                }
                if (valid()) setState({ ownerId, playlistId, generation, status: 'ready', playlist, catalog });
            } catch (error) { if (valid()) setState({ ownerId, playlistId, generation, status: 'error', error: controller.signal.aborted ? 'Playlist Loading Took Too Long. Try Again.' : error.message }); }
            finally { clearTimeout(deadline); }
        })();
        return () => { active = false; clearTimeout(deadline); controller.abort(); };
    }, [ownerId, playlistId, reload]);
    const reorder = async (index, direction) => {
        if (pending.current || current?.status !== 'ready') return;
        const token = scope.current.capture(ownerId);
        const generation = identity.current.generation;
        const controller = new AbortController();
        const deadline = setTimeout(() => controller.abort(), 15000);
        const request = { token, generation, controller };
        pending.current = request;
        const expected = current.playlist.items.map(item => item.video_id);
        const reordered = [...expected];
        [reordered[index], reordered[index + direction]] = [reordered[index + direction], reordered[index]];
        setState(previous => ({ ...previous, status: 'saving', notice: null }));
        try {
            if (getAuthUserId() !== ownerId) throw new Error('Your Profile Changed. Reload The Playlist.');
            const playlist = await reorderVideoPlaylist(ownerId, playlistId, expected, reordered, controller.signal);
            if (scope.current.isCurrent(token) && identity.current.generation === generation) setState(previous => ({ ...previous, playlist, status: 'ready', notice: 'Playlist Order Saved.' }));
        } catch { if (scope.current.isCurrent(token) && identity.current.generation === generation) setState(previous => ({ ...previous, status: 'error', error: 'Playlist Order Could Not Be Verified. Reload Before Trying Again.' })); }
        finally { clearTimeout(deadline); if (pending.current === request) pending.current = null; }
    };
    useEffect(() => () => { pending.current?.controller?.abort(); pending.current = null; }, [ownerId, playlistId]);
    const videos = current?.playlist?.items.flatMap(item => current.catalog?.has(canonicalId(item.video_id)) ? [current.catalog.get(canonicalId(item.video_id))] : []) || [];
    const play = async shuffle => {
        const items = shuffle ? shuffleQueueItems(videos) : videos;
        const started = queue.startQueue(items);
        if (!started) return;
        try { if (!await router.push(`${watchPath(started.items[0])}?play=1`)) throw new Error('Navigation Did Not Complete.'); }
        catch { setState(previous => ({ ...previous, notice: 'The Queue Is Saved. Open The First Video To Play.' })); }
    };
    return <><SEOHead title={current?.playlist?.name ? `${current.playlist.name} | Video Library` : 'Your Playlist | Video Library'} noindex /><div className="video-library-page"><HubPageShell className="video-library" maxWidth={1760} header={header}><article className="vl-playlist-page"><nav className="vl-breadcrumbs" aria-label="Breadcrumb"><Link href="/hub/video-library?filter=playlists">Playlists</Link><span aria-hidden="true">/</span><span aria-current="page" data-user-content>{current?.playlist?.name || 'Your Playlist'}</span></nav>
        {!ownerId ? <div className="vl-empty-state"><h1>Sign In To Open Your Playlist</h1><Link className="vl-pill-button" href={`/auth/login?redirect=${encodeURIComponent(playlistPath(playlistId || ''))}`}>Sign In</Link></div> : !UUID.test(playlistId || '') ? <div className="vl-empty-state"><h1>Playlist Unavailable</h1><Link href="/hub/video-library?filter=playlists">Browse Your Playlists</Link></div> : !current || current.status === 'loading' ? <p role="status">Loading Your Playlist</p> : current.status === 'error' ? <div className="vl-empty-state"><h1>Playlist Could Not Load</h1><p role="alert">{current.error}</p><button type="button" className="vl-pill-button" onClick={() => setReload(value => value + 1)}>Reload Playlist</button></div> : <><header className="vl-playlist-page-header"><h1 data-user-content>{current.playlist.name}</h1><p>{`${videos.length} Available Video${videos.length === 1 ? '' : 's'}`}</p><div className="vl-playlist-play-actions"><button type="button" className="vl-pill-button is-primary" disabled={!videos.length || current.status !== 'ready'} onClick={() => void play(false)}>Play All</button><button type="button" className="vl-pill-button" disabled={!videos.length || current.status !== 'ready'} onClick={() => void play(true)}>Shuffle</button></div><p>Playback Queue Is Saved For This Browser Session Only.{videos.length > MAX_QUEUE_ITEMS ? ` The First ${MAX_QUEUE_ITEMS} Videos Are Queued.` : ''}</p>{queue.error && <p role="alert">{queue.error}</p>}{current.notice && <p role="status">{current.notice}</p>}</header>
        {!current.playlist.items.length ? <div className="vl-empty-state"><h2>This Playlist Is Empty</h2><p>Save Videos From The Library To Build Your Playlist.</p><Link href="/hub/video-library">Browse Videos</Link></div> : <ol className="vl-playlist-video-list">{current.playlist.items.map((item, index) => { const video = current.catalog.get(canonicalId(item.video_id)); return <li key={item.id} className="vl-playlist-video-row"><span className="vl-playlist-position">{index + 1}</span>{video ? <Link href={watchPath(video)} className="vl-playlist-video-link"><div className="vl-playlist-thumb"><VideoThumbnail video={video} priority={index === 0} /></div><strong>{video.title}</strong></Link> : <span className="vl-playlist-unavailable">Video Currently Unavailable</span>}<div className="vl-playlist-reorder"><button type="button" className="vl-text-button" disabled={index === 0 || current.status !== 'ready'} aria-label={`Move Video ${index + 1} Up`} onClick={() => void reorder(index, -1)}>Move Up</button><button type="button" className="vl-text-button" disabled={index === current.playlist.items.length - 1 || current.status !== 'ready'} aria-label={`Move Video ${index + 1} Down`} onClick={() => void reorder(index, 1)}>Move Down</button></div></li>; })}</ol>}</>}
    </article></HubPageShell></div></>;
}
