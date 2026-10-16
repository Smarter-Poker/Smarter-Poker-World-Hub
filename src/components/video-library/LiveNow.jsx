import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { cleanVideoTitle } from '../../lib/videoLibraryCuration.mjs';
import VideoThumbnail from './VideoThumbnail';
import { channelPath } from '../../lib/videoLibraryChannels.mjs';

export default function LiveNow({ channelId }) {
    const [state, setState] = useState({ key: '', loading: true, data: [] });
    const [retry, setRetry] = useState(0);
    const generation = useRef(0);
    const key = channelId || 'featured';
    useEffect(() => {
        const current = ++generation.current;
        const controller = new AbortController();
        let timedOut = false;
        const deadline = setTimeout(() => { timedOut = true; controller.abort(); }, 45_000);
        setState({ key, loading: true, data: [] });
        const query = channelId ? `?channelId=${encodeURIComponent(channelId)}` : '';
        fetch(`/api/video-library/live${query}`, { signal: controller.signal, cache: 'no-store' })
            .then(async response => {
                const result = await response.json();
                if (!response.ok || !result.success || !Array.isArray(result.data)) throw new Error('Live status unavailable');
                if (generation.current === current) setState({ ...result, key, loading: false });
            }).catch(error => {
                if ((timedOut || error.name !== 'AbortError') && generation.current === current) setState({ key, loading: false, data: [], error: true });
            }).finally(() => clearTimeout(deadline));
        return () => { generation.current += 1; clearTimeout(deadline); controller.abort(); };
    }, [channelId, key, retry]);
    const visible = state.key === key ? state : { loading: true, data: [] };
    return <section className="vl-live-now" aria-label="Live Now">
        <div className="vl-live-heading"><h2>Live Now</h2><button type="button" disabled={visible.loading} onClick={() => setRetry(value => value + 1)}>Refresh Live Status</button></div>
        {visible.loading ? <p role="status">Checking Channel Live Status...</p> : visible.error ? <p role="alert">Live Status Is Temporarily Unavailable. Try Refreshing.</p> : <>
            {visible.data.length > 0 ? <div className="vl-live-grid">{visible.data.map(item => <article className="vl-live-card" key={item.videoId}>
                <a href={item.watchUrl} target="_blank" rel="noopener noreferrer" aria-label={`Watch ${cleanVideoTitle(item.title)} Live On YouTube`}>
                    <div className="vl-live-media"><VideoThumbnail video={{ videoId: item.videoId, thumbnail: item.thumbnail }} /><span className="vl-live-badge">Live</span></div><h3>{cleanVideoTitle(item.title)}</h3><span>Watch Live On YouTube</span>
                </a><Link className="vl-channel-link" href={channelPath(item.channelId)}>{item.channelName}</Link>
            </article>)}</div> : <p>No Verified Live Streams Right Now.</p>}
            {visible.unavailableChannels > 0 && <p className="vl-live-note">Live Status Could Not Be Confirmed For Some Channels.</p>}
            <p className="vl-live-note">{channelId ? 'Channel Live Status' : 'Featured Channel Live Status'} Checked {new Date(visible.checkedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. Live Videos Open On YouTube.</p>
        </>}
    </section>;
}
