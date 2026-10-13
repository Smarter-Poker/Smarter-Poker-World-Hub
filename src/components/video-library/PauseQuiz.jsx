import { useEffect, useRef, useState } from 'react';
import { playbackMessage, PLAYER_ORIGIN, timestamp } from '../../lib/videoLibraryPlayback.mjs';
import { crossedDecisionMarker, decisionPlayerState, DECISION_ACTIONS, DECISION_FEEDBACK } from '../../lib/videoLibraryQuiz.mjs';

export default function PauseQuiz({ iframeRef, videoId, active = true, markers = [] }) {
    const [ready, setReady] = useState(false);
    const [autoPause, setAutoPause] = useState(false);
    const [prompt, setPrompt] = useState(null);
    const [choice, setChoice] = useState(null);
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');
    const state = useRef({ position: null, duration: 0, seen: new Set(), prompt: null, frame: null, playing: false, playerState: null, failed: false });
    const deadline = useRef(null);
    const clearDeadline = () => { clearTimeout(deadline.current); deadline.current = null; };
    const close = () => {
        clearDeadline(); state.current.prompt = null; setPrompt(null); setChoice(null); setReason('');
    };
    const command = func => {
        if (!active || document.hidden || !iframeRef.current?.contentWindow ||
            iframeRef.current.contentWindow !== state.current.frame) return false;
        try {
            state.current.frame.postMessage(JSON.stringify({ event: 'command', func, args: [] }), PLAYER_ORIGIN);
            if (func === 'playVideo') { state.current.playerState = null; state.current.playing = false; }
            return true;
        } catch { return false; }
    };
    const begin = marker => {
        if (!ready || !active || document.hidden || state.current.prompt) return;
        setError(''); setChoice(null); setReason('');
        // An idempotent pause on an already paused provider need not emit a
        // second state-change event. Its existing trusted acknowledgement counts.
        const next = { phase: state.current.playerState === 2 ? 'answer' : 'waiting', position: marker ?? state.current.position };
        state.current.prompt = next; setPrompt(next);
        if (!command('pauseVideo')) {
            close(); setError('The Player Could Not Be Paused. Try Again When Playback Is Available.'); return;
        }
        clearDeadline();
        if (next.phase === 'answer') return;
        deadline.current = setTimeout(() => {
            if (state.current.prompt?.phase !== 'waiting') return;
            close(); setError('The Player Did Not Confirm A Pause. The Quiz Was Cancelled.');
        }, 4000);
    };
    const beginRef = useRef(begin); beginRef.current = begin;
    useEffect(() => {
        clearDeadline();
        state.current = { position: null, duration: 0, seen: new Set(), prompt: null, frame: null, playing: false, playerState: null, failed: false };
        setReady(false); setPrompt(null); setChoice(null); setReason(''); setError(''); setAutoPause(false);
        return clearDeadline;
    }, [videoId]);
    useEffect(() => {
        if (!active) { close(); state.current.playerState = null; state.current.playing = false; state.current.position = null; setReady(false); return undefined; }
        const receive = event => {
            const data = playbackMessage(event, iframeRef.current?.contentWindow);
            if (!data) return;
            const playerState = decisionPlayerState(data);
            if (data.event === 'infoDelivery') {
                if (state.current.failed) return;
                if (state.current.frame && state.current.frame !== event.source) { close(); state.current.position = null; state.current.playing = false; state.current.playerState = null; }
                const length = Number(data.info?.duration);
                if (Number.isFinite(length) && length > 0) state.current.duration = length;
                const position = data.info?.currentTime;
                const duration = state.current.duration;
                if (playerState !== null) { state.current.playing = playerState === 1; state.current.playerState = playerState; }
                if (Number.isFinite(position) && position >= 0 && position <= duration && duration > 0) {
                    const previous = state.current.position;
                    state.current.position = position; state.current.frame = event.source; setReady(true);
                    if (autoPause && state.current.playing && !document.hidden && !state.current.prompt) {
                        const marker = crossedDecisionMarker(previous, position, duration, markers, state.current.seen);
                        if (marker !== null) { state.current.seen.add(marker); beginRef.current(marker); }
                    }
                }
            }
            if (playerState !== null) { state.current.playing = playerState === 1; state.current.playerState = playerState; }
            if (playerState === 2 && state.current.prompt?.phase === 'waiting') {
                clearDeadline();
                const next = { ...state.current.prompt, phase: 'answer' };
                state.current.prompt = next; setPrompt(next);
            } else if ([0, 1, 3, 5].includes(playerState) && state.current.prompt?.phase === 'answer') {
                close();
            }
            if (data.event === 'onError') { close(); state.current.failed = true; state.current.playing = false; state.current.playerState = null; setReady(false); setError('Playback Is Unavailable. The Quiz Was Cancelled.'); }
        };
        const hidden = () => { if (document.hidden) { close(); state.current.playing = false; state.current.playerState = null; state.current.position = null; } };
        const loaded = () => { close(); state.current.frame = null; state.current.position = null; state.current.duration = 0; state.current.failed = false; state.current.playing = false; state.current.playerState = null; setReady(false); };
        const iframe = iframeRef.current;
        iframe?.addEventListener?.('load', loaded);
        window.addEventListener('message', receive);
        document.addEventListener('visibilitychange', hidden);
        return () => { iframe?.removeEventListener?.('load', loaded); window.removeEventListener('message', receive); document.removeEventListener('visibilitychange', hidden); };
    }, [active, iframeRef, autoPause, markers]);
    const resume = () => {
        if (state.current.prompt?.phase !== 'answer' || !choice) return;
        if (!command('playVideo')) { setError('Playback Could Not Resume. Use The Player Controls.'); return; }
        close(); setError('');
    };
    return <section className="vl-pause-quiz" aria-label="What Would You Do?">
        <h3>What Would You Do?</h3>
        <p>Pause A Hand, Choose Your Action, Then Watch What Happens.</p>
        <p>Your Decision, Not A Solver Answer. Choices And Notes Last For This Viewing Session.</p>
        <button type="button" disabled={!ready || !active || !!prompt} onClick={() => begin(null)}>What Would You Do?</button>
        <label><input type="checkbox" checked={autoPause} disabled={!active} onChange={event => setAutoPause(event.target.checked)} />Pause At Hand Markers</label>
        {!ready && <p>Available When The Player Reports Its Timeline.</p>}
        {autoPause && markers.length === 0 && <p>Mark A Hand On The Timeline To Add A Decision Pause.</p>}
        {error && <p role="alert">{error}</p>}
        {prompt && <div className="vl-quiz-prompt" aria-label="Your Hand Decision" aria-live="polite">
            <h4>Decision At {timestamp(prompt.position)}</h4>
            {prompt.phase === 'waiting' ? <p>Waiting For The Player To Pause.</p> : <>
                <p>Use The Cards, Position, Stacks And Action Shown In The Video.</p>
                <div className="vl-quiz-actions" role="group" aria-label="Choose Your Action">{DECISION_ACTIONS.map(action =>
                    <button key={action} type="button" aria-pressed={choice === action} onClick={() => setChoice(action)}>{action}</button>)}</div>
                <label>Why This Decision?<textarea aria-label="Why This Decision?" data-user-content="true" maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></label>
                {choice && <div className="vl-quiz-feedback" role="status"><strong>You Chose {choice}.</strong><p>{DECISION_FEEDBACK[choice]}</p><p>No Correct Answer Is Assigned To This Hand. Continue Watching To Compare With The Video.</p></div>}
                <button type="button" disabled={!choice} onClick={resume}>Continue Watching</button>
            </>}
            <button type="button" onClick={() => { close(); setError(''); }}>Cancel Quiz</button>
        </div>}
    </section>;
}
