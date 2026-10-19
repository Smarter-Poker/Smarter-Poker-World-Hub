import { useEffect, useRef, useState } from 'react';
import { addHandMarker, boundedPosition, playbackMessage, PLAYER_ORIGIN, timestamp } from '../../lib/videoLibraryPlayback.mjs';

// Both watch surfaces talk to the one existing embed. No replacement player,
// media download, made-up chapters, or second hidden iframe.
export function subscribeWatchPlayer(iframe, attemptPlayback = false) {
    const send = data => iframe?.contentWindow?.postMessage(JSON.stringify(data), PLAYER_ORIGIN);
    send({ event: 'listening' });
    for (const event of ['onStateChange', 'onError', 'onAutoplayBlocked']) {
        send({ event: 'command', func: 'addEventListener', args: [event] });
    }
    if (attemptPlayback && !document.hidden) send({ event: 'command', func: 'playVideo', args: [] });
}

export function WatchDescription({ text }) {
    const [expanded, setExpanded] = useState(false);
    if (!text) return null;
    const words = text.trim().split(/\s+/);
    const collapsible = words.length > 45;
    return <section className="vl-description" aria-label="Video Description">
        <p>{expanded || !collapsible ? text : words.slice(0, 45).join(' ')}</p>
        {collapsible && <button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? 'Show Less' : 'Show More'}</button>}
    </section>;
}

export default function WatchPlaybackTools({ iframeRef, active = true, attemptPlayback = true, initialSeekSeconds = 0, duration: catalogDuration = 0, nextTitle, onNext, autoplay, onAutoplayChange, mini, onMiniChange, onMarkersChange }) {
    const [position, setPosition] = useState(0);
    const [duration, setDuration] = useState(catalogDuration);
    const knownDurationRef = useRef(catalogDuration);
    const [ready, setReady] = useState(false);
    const initialSeekDoneRef = useRef(false);
    const [markers, setMarkers] = useState([]);
    useEffect(() => { onMarkersChange?.(markers); }, [markers, onMarkersChange]);
    const [countdown, setCountdown] = useState(null);
    const endedRef = useRef(false);
    const mutedFallbackRef = useRef(false);
    const [soundOff, setSoundOff] = useState(false);
    const nextRef = useRef(onNext);
    nextRef.current = onNext;
    const command = (func, args = []) => iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), PLAYER_ORIGIN);
    useEffect(() => {
        if (!ready || initialSeekDoneRef.current || !(initialSeekSeconds > 0)) return;
        const target = boundedPosition(initialSeekSeconds, duration);
        if (target !== null && target > 0) {
            initialSeekDoneRef.current = true;
            command('seekTo', [target, true]);
            setPosition(target);
        }
    }, [ready, initialSeekSeconds, duration]);
    // Loading a player is the only place that requests playback. Changing
    // Autoplay Next must never resume a video the viewer has paused.
    useEffect(() => {
        if (!active) return undefined;
        const iframe = iframeRef.current;
        subscribeWatchPlayer(iframe);
        const loaded = () => {
            mutedFallbackRef.current = false;
            subscribeWatchPlayer(iframe, attemptPlayback);
        };
        iframe?.addEventListener('load', loaded);
        return () => iframe?.removeEventListener('load', loaded);
    }, [active, iframeRef, attemptPlayback]);
    useEffect(() => {
        if (!active) return undefined;
        const receive = event => {
            const data = playbackMessage(event, iframeRef.current?.contentWindow);
            if (!data) return;
            if (data.event === 'onAutoplayBlocked' && attemptPlayback && !document.hidden && !mutedFallbackRef.current) {
                mutedFallbackRef.current = true;
                setSoundOff(true);
                command('mute');
                command('playVideo');
            }
            if (data.event === 'infoDelivery') {
                if (typeof data.info?.muted === 'boolean') setSoundOff(data.info.muted);
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
            window.removeEventListener('message', receive);
            document.removeEventListener('visibilitychange', visibility);
        };
    }, [active, iframeRef, autoplay, nextTitle, catalogDuration, attemptPlayback]);
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
        {soundOff && <p className="vl-sound-notice" role="status">Sound Starts Off. Turn It On In The Player.</p>}
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
