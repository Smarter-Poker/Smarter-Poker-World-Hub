/**
 * IN-CALL SCREEN (2026-10-31) - mobile first.
 *
 * Replaces the side-by-side grid of src/components/video/LiveKitCall.jsx,
 * which on a portrait phone shrank both videos into two thin strips, offered a
 * Share Screen button phones cannot use, and had no way to start remote audio
 * when iOS blocks autoplay (the call connected but nobody could hear).
 *
 *   - remote camera fills the screen; your own camera is a small mirrored
 *     picture-in-picture in the corner
 *   - a voice call (or a camera that is off) shows the other person's photo
 *   - controls: mute, camera on/off, flip camera (when the device has more
 *     than one), end - all 60px round targets above the home indicator
 *   - "Tap To Turn On Sound" appears only when the browser blocked audio
 *   - status line: Calling... / Connecting... / Reconnecting... / 0:42
 *
 * Loaded client-side only (LiveKit touches window). All call state lives in
 * CallProvider; this screen only reports what it sees in the room.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    LiveKitRoom,
    RoomAudioRenderer,
    VideoTrack,
    useAudioPlayback,
    useConnectionState,
    useLocalParticipant,
    useRemoteParticipants,
    useRoomContext,
    useTracks,
} from '@livekit/components-react';
import { ConnectionState, DisconnectReason, Track, VideoPresets } from 'livekit-client';
import { Mic, MicOff, Video, VideoOff, PhoneOff, SwitchCamera, Volume2, ChevronDown, Maximize2 } from 'lucide-react';
import { authedFetch } from '../../lib/authUtils';
import { formatCallDuration } from '../../lib/calls/callRoom.mjs';

const RED = '#E53935';

function initials(name) {
    return String(name || '?').trim().slice(0, 1).toUpperCase() || '?';
}

function PeerPortrait({ peer, size = 128, pulse = false }) {
    return (
        <div style={{
            width: size, height: size, borderRadius: '50%', margin: '0 auto',
            background: peer?.avatar ? `url(${JSON.stringify(peer.avatar)}) center/cover` : 'linear-gradient(135deg, #1877F2 0%, #0a3d8f 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontSize: Math.round(size * 0.4), fontWeight: 700,
            boxShadow: '0 0 0 4px rgba(24,119,242,0.35), 0 0 40px rgba(24,119,242,0.35)',
            animation: pulse ? 'sp-call-pulse 1.6s ease-in-out infinite' : 'none',
        }} aria-hidden="true">
            {!peer?.avatar && initials(peer?.name)}
        </div>
    );
}

function RoundButton({ label, onClick, active = true, danger = false, children, disabled = false }) {
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            onClick={onClick}
            disabled={disabled}
            aria-pressed={danger ? undefined : !active}
            style={{
                width: 60, height: 60, borderRadius: '50%', border: 'none', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: danger ? RED : active ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.92)',
                color: danger ? 'white' : active ? 'white' : '#111',
                cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
                touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
                backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
            }}
        >
            {children}
        </button>
    );
}

function useElapsed(since) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!since) return undefined;
        setNow(Date.now());
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [since]);
    return since ? Math.max(0, Math.floor((now - since) / 1000)) : 0;
}

function statusText({ call, connection, remoteCount, elapsed, tokenError }) {
    if (tokenError) return tokenError;
    if (call.phase === 'outgoing') {
        if (call.creating) return 'Starting Call...';
        if (call.reach === 'ringing') return 'Ringing...';
        if (call.reach === 'push') return 'Ringing Their Phone...';
        if (call.reach === 'unreachable') return 'Not Reachable Right Now';
        return 'Calling...';
    }
    if (connection === ConnectionState.Reconnecting || connection === 'reconnecting') return 'Reconnecting...';
    if (connection !== ConnectionState.Connected && connection !== 'connected') return 'Connecting...';
    if (remoteCount === 0) return 'Waiting For Them To Join...';
    return formatCallDuration(elapsed);
}

/*
 * Minimized (2026-10-31): the call shrinks to a bar under the status bar so
 * the user can switch chats or leave Messenger while it continues. The room,
 * its audio and the call state stay mounted; only the full-screen media and
 * controls are hidden. Tapping the bar brings the call back.
 */
function MiniBar({ call, status, onExpand, onHangup, extras }) {
    return (
        <>
            <div role="region" aria-label={`Call With ${call.peer.name}`} style={{
                // Below the site header, right-aligned, so the menu, back
                // button and bottom navigation all stay usable.
                position: 'fixed', zIndex: 10050, right: 8, width: 'min(320px, calc(100vw - 16px))',
                top: 'calc(var(--sp-header-height, 54px) + env(safe-area-inset-top, 0px) + 6px)',
                display: 'flex', alignItems: 'center', gap: 10, padding: '6px 6px 6px 8px', minHeight: 56,
                borderRadius: 28, background: '#16a34a', color: 'white', boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
            }}>
                <button type="button" aria-label="Return To Call" onClick={onExpand} style={{
                    flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, minHeight: 44,
                    background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', textAlign: 'left', padding: 0,
                    touchAction: 'manipulation',
                }}>
                    <PeerPortrait peer={call.peer} size={40} />
                    <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{call.peer.name}</span>
                        <span role="status" aria-live="polite" style={{ fontSize: 13, opacity: 0.92 }}>{status}</span>
                    </span>
                    <Maximize2 size={18} aria-hidden="true" style={{ marginLeft: 'auto', flexShrink: 0 }} />
                </button>
                <button type="button" aria-label="End Call" onClick={onHangup} style={{
                    width: 44, height: 44, borderRadius: '50%', border: 'none', background: RED, color: 'white', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', touchAction: 'manipulation',
                }}><PhoneOff size={22} /></button>
            </div>
            {extras}
        </>
    );
}

function Shell({ call, status, children, controls, minimized = false, onMinimize, onExpand, onHangup, extras = null }) {
    if (minimized) return <MiniBar call={call} status={status} onExpand={onExpand} onHangup={onHangup} extras={extras} />;
    return (
        <div role="dialog" aria-modal="true" aria-label={`${call.callType === 'video' ? 'Video' : 'Voice'} Call With ${call.peer.name}`} style={{
            position: 'fixed', inset: 0, zIndex: 10050, background: '#0b0d12', color: 'white',
            display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
        }}>
            <style>{`@keyframes sp-call-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }`}</style>
            {children}
            {extras}
            {onMinimize && (
                <button type="button" aria-label="Minimize Call" title="Minimize Call" onClick={onMinimize} style={{
                    position: 'absolute', zIndex: 4, left: 8, top: 'calc(env(safe-area-inset-top, 0px) + 8px)',
                    width: 44, height: 44, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.16)', color: 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', touchAction: 'manipulation',
                }}><ChevronDown size={26} /></button>
            )}
            <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, zIndex: 3,
                padding: '12px 60px', paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)',
                background: 'linear-gradient(180deg, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0) 100%)',
                textAlign: 'center', pointerEvents: 'none',
            }}>
                <div style={{ fontSize: 18, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{call.peer.name}</div>
                <div style={{ fontSize: 14, opacity: 0.85, marginTop: 2 }} role="status" aria-live="polite">{status}</div>
            </div>
            <div style={{
                position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 3,
                padding: '20px 16px', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
                background: 'linear-gradient(0deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0) 100%)',
                display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 18, flexWrap: 'wrap',
            }}>
                {controls}
            </div>
        </div>
    );
}

function PortraitStage({ call, pulse }) {
    const unreachable = call.phase === 'outgoing' && call.reach === 'unreachable';
    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '120px 24px 160px', gap: 24 }}>
            <PeerPortrait peer={call.peer} size={136} pulse={pulse && !unreachable} />
            {unreachable && (
                <p role="status" style={{ margin: 0, maxWidth: 320, textAlign: 'center', fontSize: 15, lineHeight: 1.45, color: 'rgba(255,255,255,0.86)' }}>
                    {call.peer.name} Is Not On Smarter.Poker Right Now And Has Notifications Turned Off, So This Call Cannot Ring For Them. They Will See A Missed Call.
                </p>
            )}
        </div>
    );
}

// A phone switching Wi-Fi to cellular briefly leaves the room and rejoins.
const REMOTE_LEFT_GRACE_MS = 8000;
// An answered call where the other side never arrives is ended, not left
// on "Waiting For Them To Join..." forever.
const JOIN_TIMEOUT_MS = 25000;

function RoomStage({ call, onHangup, onRemoteLeft, onJoinTimeout, onPermissionNote, minimized, onMinimize, onExpand }) {
    const room = useRoomContext();
    const connection = useConnectionState();
    const remotes = useRemoteParticipants();
    const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
    const { canPlayAudio, startAudio } = useAudioPlayback(room);
    const cameraTracks = useTracks(
        [{ source: Track.Source.Camera, withPlaceholder: false }, { source: Track.Source.ScreenShare, withPlaceholder: false }],
        { onlySubscribed: false },
    );
    const [facing, setFacing] = useState('user');
    const [canFlip, setCanFlip] = useState(false);
    const elapsed = useElapsed(call.answeredAt && remotes.length > 0 ? call.answeredAt : null);
    const hadRemote = useRef(false);

    useEffect(() => {
        if (remotes.length > 0) { hadRemote.current = true; return undefined; }
        if (!hadRemote.current) return undefined;
        const timer = setTimeout(() => { hadRemote.current = false; onRemoteLeft(); }, REMOTE_LEFT_GRACE_MS);
        return () => clearTimeout(timer);
    }, [remotes.length, onRemoteLeft]);

    useEffect(() => {
        if (call.phase !== 'active' || remotes.length > 0 || hadRemote.current) return undefined;
        const timer = setTimeout(() => onJoinTimeout(), JOIN_TIMEOUT_MS);
        return () => clearTimeout(timer);
    }, [call.phase, remotes.length, onJoinTimeout]);

    useEffect(() => {
        let cancelled = false;
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return undefined;
        navigator.mediaDevices.enumerateDevices()
            .then(devices => { if (!cancelled) setCanFlip(devices.filter(device => device.kind === 'videoinput').length > 1); })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [isCameraEnabled]);

    const remoteVideo = useMemo(() => {
        const remoteTracks = cameraTracks.filter(ref => !ref.participant.isLocal && ref.publication && !ref.publication.isMuted);
        return remoteTracks.find(ref => ref.source === Track.Source.ScreenShare) || remoteTracks.find(ref => ref.source === Track.Source.Camera) || null;
    }, [cameraTracks]);
    const localVideo = useMemo(() => cameraTracks.find(ref => ref.participant.isLocal && ref.source === Track.Source.Camera && ref.publication && !ref.publication.isMuted) || null, [cameraTracks]);

    const toggleMic = async () => {
        try { await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled); }
        catch { onPermissionNote('Microphone Is Blocked. Allow Microphone Access In Your Browser Settings.'); }
    };
    const toggleCamera = async () => {
        try { await localParticipant.setCameraEnabled(!isCameraEnabled, { facingMode: facing }); }
        catch { onPermissionNote('Camera Is Blocked. Allow Camera Access In Your Browser Settings.'); }
    };
    const flipCamera = async () => {
        const next = facing === 'user' ? 'environment' : 'user';
        const track = localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack;
        try {
            if (track?.restartTrack) await track.restartTrack({ facingMode: next });
            setFacing(next);
        } catch { onPermissionNote('Could Not Switch Cameras.'); }
    };

    const status = statusText({ call, connection, remoteCount: remotes.length, elapsed });

    return (
        <Shell
            call={call}
            status={status}
            minimized={minimized}
            onMinimize={onMinimize}
            onExpand={onExpand}
            onHangup={onHangup}
            extras={<>
                {!canPlayAudio && (
                    <button type="button" onClick={() => startAudio()} style={{
                        position: 'fixed', zIndex: 10051, left: '50%', transform: 'translateX(-50%)',
                        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 120px)',
                        display: 'flex', alignItems: 'center', gap: 8, minHeight: 48, padding: '0 20px',
                        borderRadius: 24, border: 'none', background: '#1877F2', color: 'white', fontSize: 16, fontWeight: 700,
                        cursor: 'pointer', touchAction: 'manipulation',
                    }}><Volume2 size={20} /> Tap To Turn On Sound</button>
                )}
                <RoomAudioRenderer />
            </>}
            controls={<>
                <RoundButton label={isMicrophoneEnabled ? 'Mute' : 'Unmute'} active={isMicrophoneEnabled} onClick={toggleMic}>
                    {isMicrophoneEnabled ? <Mic size={26} /> : <MicOff size={26} />}
                </RoundButton>
                <RoundButton label={isCameraEnabled ? 'Turn Camera Off' : 'Turn Camera On'} active={isCameraEnabled} onClick={toggleCamera}>
                    {isCameraEnabled ? <Video size={26} /> : <VideoOff size={26} />}
                </RoundButton>
                {isCameraEnabled && canFlip && (
                    <RoundButton label="Flip Camera" onClick={flipCamera}><SwitchCamera size={26} /></RoundButton>
                )}
                <RoundButton label="End Call" danger onClick={onHangup}><PhoneOff size={28} /></RoundButton>
            </>}
        >
            {remoteVideo ? (
                <div style={{ position: 'absolute', inset: 0, background: '#000' }}>
                    <VideoTrack trackRef={remoteVideo} style={{ width: '100%', height: '100%', objectFit: remoteVideo.source === Track.Source.ScreenShare ? 'contain' : 'cover' }} />
                </div>
            ) : (
                <PortraitStage call={call} pulse={call.phase === 'outgoing'} />
            )}
            {localVideo && (
                <div style={{
                    position: 'absolute', zIndex: 4, right: 12, width: 104, height: 148,
                    top: 'calc(env(safe-area-inset-top, 0px) + 72px)',
                    borderRadius: 14, overflow: 'hidden', background: '#222',
                    boxShadow: '0 6px 24px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.18)',
                }}>
                    <VideoTrack trackRef={localVideo} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: facing === 'user' ? 'scaleX(-1)' : 'none' }} />
                </div>
            )}
        </Shell>
    );
}

export default function CallScreen({ call, selfName, onHangup, onRemoteLeft, onConnectionLost, onFatal, onNotice }) {
    const handleJoinTimeout = useCallback(() => onFatal('They Did Not Join The Call'), [onFatal]);
    const [minimized, setMinimized] = useState(false);
    const minimize = useCallback(() => setMinimized(true), []);
    const expand = useCallback(() => setMinimized(false), []);
    const [connection, setConnection] = useState({ token: null, url: null, error: null });
    const lostRef = useRef(false);
    const isVideo = call.callType === 'video';

    useEffect(() => {
        // Wait until the server has accepted the call; a refused call never
        // joins a room.
        if (call.creating) return undefined;
        let cancelled = false;
        setConnection({ token: null, url: null, error: null });
        (async () => {
            try {
                const response = await authedFetch('/api/livekit/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ roomName: call.id, participantName: selfName || 'Player', participantId: call.selfId }),
                });
                const data = await response.json().catch(() => ({}));
                if (cancelled) return;
                if (!response.ok || !data.token || !data.wsUrl) {
                    const message = data.error || 'Could Not Connect The Call';
                    setConnection({ token: null, url: null, error: message });
                    onFatal(message);
                    return;
                }
                setConnection({ token: data.token, url: data.wsUrl, error: null });
            } catch {
                if (cancelled) return;
                setConnection({ token: null, url: null, error: 'Could Not Connect The Call' });
                onFatal('Could Not Connect The Call. Check Your Connection.');
            }
        })();
        return () => { cancelled = true; };
    }, [call.id, call.creating]); // eslint-disable-line react-hooks/exhaustive-deps

    const connectedRef = useRef(false);
    const handleDisconnected = useCallback(reason => {
        if (lostRef.current) return;
        lostRef.current = true;
        if (!connectedRef.current && reason !== DisconnectReason.DUPLICATE_IDENTITY) {
            onFatal('Could Not Connect The Call. Check Your Connection And Try Again.');
            return;
        }
        onConnectionLost(reason === DisconnectReason.DUPLICATE_IDENTITY);
    }, [onConnectionLost, onFatal]);

    const handleMediaFailure = useCallback(() => {
        onNotice(isVideo
            ? 'Camera Or Microphone Is Blocked. Allow Access In Your Browser Settings To Be Seen And Heard.'
            : 'Microphone Is Blocked. Allow Microphone Access In Your Browser Settings To Be Heard.');
    }, [isVideo, onNotice]);

    if (!connection.token) {
        return (
            <Shell
                call={call}
                status={statusText({ call, connection: 'connecting', remoteCount: 0, elapsed: 0, tokenError: connection.error })}
                minimized={minimized}
                onMinimize={minimize}
                onExpand={expand}
                onHangup={onHangup}
                controls={<RoundButton label="End Call" danger onClick={onHangup}><PhoneOff size={28} /></RoundButton>}
            >
                <PortraitStage call={call} pulse={call.phase === 'outgoing'} />
            </Shell>
        );
    }

    return (
        <LiveKitRoom
            token={connection.token}
            serverUrl={connection.url}
            connect
            audio
            video={isVideo ? { facingMode: 'user', resolution: VideoPresets.h720.resolution } : false}
            options={{ adaptiveStream: true, dynacast: true }}
            onConnected={() => { connectedRef.current = true; }}
            onDisconnected={handleDisconnected}
            onMediaDeviceFailure={handleMediaFailure}
            onError={error => console.warn('[CallScreen] room error:', error?.message || error)}
            /* Minimized, the room's own box must not cover the page; its
               fixed-position children (the bar, the audio) still render. */
            style={minimized ? { position: 'fixed', top: 0, left: 0, width: 0, height: 0, overflow: 'visible', zIndex: 10050 } : { position: 'fixed', inset: 0, zIndex: 10050 }}
        >
            <RoomStage call={call} onHangup={onHangup} onRemoteLeft={onRemoteLeft} onJoinTimeout={handleJoinTimeout} onPermissionNote={onNotice}
                minimized={minimized} onMinimize={minimize} onExpand={expand} />
        </LiveKitRoom>
    );
}
