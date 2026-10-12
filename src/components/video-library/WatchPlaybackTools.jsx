import { useEffect, useRef, useState } from 'react';
import { addHandMarker, boundedPosition, playbackMessage, PLAYER_ORIGIN, timestamp } from '../../lib/videoLibraryPlayback.mjs';

// Both watch surfaces talk to the one existing embed. No replacement player,
// media download, made-up chapters, or second hidden iframe.
export function subscribeWatchPlayer(iframe) {
    const send = data => iframe?.contentWindow?.postMessage(JSON.stringify(data), PLAYER_ORIGIN);
    send({ event: 'listening' });
    for (const event of ['onStateChange', 'onError']) {
        send({ event: 'command', func: 'addEventListener', args: [event] });
    }
}

export function WatchDescription({ text }) {
    const [expanded, setExpanded] = useState(false);
    if (!text) return null;
    return <section className="vl-description" aria-label="Video Description">
        <p className={expanded ? '' : 'is-collapsed'}>{text}</p>
        <button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? 'Show Less' : 'Show More'}</button>
    </section>;
}

export default function WatchPlaybackTools({ iframeRef, active = true, duration: catalogDuration = 0, nextTitle, onNext, autoplay, onAutoplayChange, mini, onMiniChange }) {
    const [position, setPosition] = useState(0);
    const [duration, setDuration] = useState(catalogDuration);
    const knownDurationRef = useRef(catalogDuration);
    const [ready, setReady] = useState(false);
    const [markers, setMarkers] = useState([]);
    const [countdown, setCountdown] = useState(null);
    const endedRef = useRef(false);
    const nextRef = useRef(onNext);
    nextRef.current = onNext;
    const command = (func, args = []) => iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), PLAYER_ORIGIN);
    useEffect(() => {
        if (!active) return undefined;
        const iframe = iframeRef.current;
        const subscribe = () => subscribeWatchPlayer(iframe);
        subscribe();
        iframe?.addEventListener('load', subscribe);
        const receive = event => {
            const data = playbackMessage(event, iframeRef.current?.contentWindow);
            if (!data) return;
            if (data.event === 'infoDelivery') {
                const length = Number(data.info?.duration);
                if (Number.isFinite(length) && length > 0) knownDurationRef.current = length;
                const effectiveDuration = knownDurationRef.current;
                const current = boundedPosition(data.info?.currentTime, effectiveDuration);
                if (current !== null && effectiveDuration > 0) {
                    setDuration(effectiveDuration);
                    setPosition(current);
                    setReady(true);
                }
            }
            if (data.event === 'onStateChange') {
                if (data.info === 0) {
                    if (!endedRef.current && autoplay && nextTitle && !document.hidden) setCountdown(5);
                    endedRef.current = true;
                } else { endedRef.current = false; setCountdown(null); }
            }
            if (data.event === 'onError') { setCountdown(null); setReady(false); }
        };
        const visibility = () => { if (document.hidden) setCountdown(null); };
        window.addEventListener('message', receive);
        document.addEventListener('visibilitychange', visibility);
        return () => {
            iframe?.removeEventListener('load', subscribe);
            window.removeEventListener('message', receive);
            document.removeEventListener('visibilitychange', visibility);
        };
    }, [active, iframeRef, autoplay, nextTitle, catalogDuration]);
    useEffect(() => { if (!autoplay || !active) setCountdown(null); }, [autoplay, active]);
    useEffect(() => { setCountdown(null); }, [nextTitle]);
    useEffect(() => {
        if (countdown === null) return undefined;
        const timer = setTimeout(() => {
            if (countdown > 1) setCountdown(countdown - 1);
            else { setCountdown(null); if (!document.hidden && autoplay && active) nextRef.current?.(); }
        }, 1000);
        return () => clearTimeout(timer);
    }, [countdown, autoplay, active]);
    const seek = value => {
        const second = boundedPosition(value, duration);
        if (!ready || second === null) return;
        setCountdown(null);
        command('seekTo', [second, true]);
        setPosition(second);
    };
    return <section className="vl-playback-tools" aria-label="Playback Tools">
        <div className="vl-playback-buttons">
            <button type="button" onClick={() => onMiniChange(!mini)}>{mini ? 'Expand Player' : 'Mini-Player'}</button>
            {nextTitle && <label><input type="checkbox" checked={autoplay} onChange={event => onAutoplayChange(event.target.checked)} />Autoplay Next</label>}
        </div>
        <div className="vl-hand-timeline">
            <label>Hand Timeline <span>{timestamp(position)} / {timestamp(duration)}</span>
                <input type="range" aria-label="Seek Video" aria-valuetext={timestamp(position)} min="0" max={duration || 1} step="1" value={position} disabled={!ready} onChange={event => seek(event.target.value)} />
            </label>
            <div className="vl-timeline-marks" aria-hidden="true">{markers.map(second => <span key={second} style={{ left: `${duration > 0 ? second / duration * 100 : 0}%` }} />)}</div>
            <button type="button" disabled={!ready || markers.length >= 50} onClick={() => setMarkers(current => addHandMarker(current, position, duration))}>Mark This Hand</button>
            <p>{ready ? 'Hand Markers Last For This Viewing Session.' : 'Timeline Available When Playback Starts.'}</p>
            {markers.length > 0 && <ul aria-label="Hand Markers">{markers.map((second, index) => <li key={second}>
                <button type="button" onClick={() => seek(second)}>Hand {index + 1} · {timestamp(second)}</button>
                <button type="button" aria-label={`Remove Hand Marker At ${timestamp(second)}`} onClick={() => setMarkers(current => current.filter(value => value !== second))}>Remove</button>
            </li>)}</ul>}
        </div>
        {countdown !== null && <div className="vl-autoplay-countdown" role="status">
            <p>Up Next In {countdown}: {nextTitle}</p>
            <button type="button" onClick={() => { setCountdown(null); nextRef.current?.(); }}>Play Now</button>
            <button type="button" onClick={() => setCountdown(null)}>Cancel</button>
        </div>}
    </section>;
}
