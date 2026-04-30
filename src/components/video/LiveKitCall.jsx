/**
 * LiveKit Video Call Component
 * 
 * A seamless video calling experience using LiveKit.
 * Drop-in replacement for Jitsi with no prejoin screens or lobbies.
 */
import { useEffect, useState, useCallback } from 'react';
import {
    LiveKitRoom,
    RoomAudioRenderer,
    ControlBar,
    useTracks,
    ParticipantTile,
    useParticipants,
    useRoomContext,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { Track } from 'livekit-client';

/**
 * Resolves an auth token: uses the provided token, or falls back to localStorage.
 */
function resolveAuthToken(authToken) {
    if (authToken) return authToken;
    // Fallback: read from localStorage directly (same logic as getAccessToken)
    if (typeof window === 'undefined') return null;
    try {
        const explicit = localStorage.getItem('smarter-poker-auth');
        if (explicit) {
            const parsed = JSON.parse(explicit);
            if (parsed?.access_token) return parsed.access_token;
        }
        const sbKeys = Object.keys(localStorage || {}).filter(
            k => k.startsWith('sb-') && k.endsWith('-auth-token')
        );
        if (sbKeys.length > 0) {
            const parsed = JSON.parse(localStorage.getItem(sbKeys[0]) || '{}');
            return parsed?.access_token || null;
        }
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
    return null;
}

/**
 * Fetches a LiveKit token from the server.
 * CRITICAL: Must include Authorization header — API requires JWT auth (BUG #247 fix).
 */
export async function getLiveKitToken(roomName, participantName, participantId, authToken) {
    const token = resolveAuthToken(authToken);
    if (!token) {
        throw new Error('Not authenticated — please sign in to make calls');
    }

    const response = await fetch('/api/livekit/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ roomName, participantName, participantId }),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(error.error || 'Failed to get video token');
    }

    return response.json();
}

/**
 * Simple 1:1 Video Call UI
 * Shows both participants side by side with minimal controls
 */
function VideoCallUI({ onLeave }) {
    const participants = useParticipants();
    const room = useRoomContext();
    const tracks = useTracks(
        [
            { source: Track.Source.Camera, withPlaceholder: true },
            { source: Track.Source.ScreenShare, withPlaceholder: false },
        ],
        { onlySubscribed: false }
    );
    
    // Auto-end call if the other participant leaves after joining
    const [hasOtherJoined, setHasOtherJoined] = useState(false);
    useEffect(() => {
        if (participants.length > 1) {
            setHasOtherJoined(true);
        } else if (hasOtherJoined && participants.length === 1) {
            // Other person left the room
            onLeave();
        }
    }, [participants.length, hasOtherJoined, onLeave]);

    return (
        <div style={{
            display: 'flex',
            flex: 1,
            flexDirection: 'column',
            background: '#111',
            overflow: 'hidden',
        }}>
            {/* Video Grid - 1:1 call layout */}
            <div style={{
                flex: 1,
                display: 'grid',
                gridTemplateColumns: participants.length === 1 ? '1fr' : '1fr 1fr',
                gap: 8,
                padding: 8,
                minHeight: 0,
            }}>
                {tracks
                    .filter(track => track.source === Track.Source.Camera)
                    .map((trackRef) => (
                        <ParticipantTile
                            key={trackRef.participant.sid}
                            trackRef={trackRef}
                            style={{
                                borderRadius: 12,
                                overflow: 'hidden',
                            }}
                        />
                    ))}
            </div>

            {/* Control Bar */}
            <div style={{
                padding: '12px 16px',
                background: 'rgba(0,0,0,0.8)',
                display: 'flex',
                justifyContent: 'center',
            }}>
                <ControlBar
                    variation="minimal"
                    controls={{
                        microphone: true,
                        camera: true,
                        screenShare: true,
                        leave: true,
                        settings: false,
                        chat: false,
                    }}
                />
            </div>

            {/* Audio renderer for remote participants */}
            <RoomAudioRenderer />
        </div>
    );
}

/**
 * LiveKit Video Call Modal
 * 
 * Props:
 * - roomName: Unique room identifier
 * - participantName: Display name of this user
 * - participantId: Unique user ID
 * - callType: 'video' or 'audio'
 * - otherUserName: Name of the person you're calling
 * - onEnd: Callback when call ends
 * - authToken: JWT auth token for API calls (falls back to localStorage)
 */
export default function LiveKitCall({
    roomName,
    participantName,
    participantId,
    callType = 'video',
    otherUserName,
    onEnd,
    authToken,
}) {
    const [token, setToken] = useState(null);
    const [wsUrl, setWsUrl] = useState(null);
    const [error, setError] = useState(null);
    const [connecting, setConnecting] = useState(true);

    // Get LiveKit token on mount
    useEffect(() => {
        if (!roomName || !participantName) return;

        getLiveKitToken(roomName, participantName, participantId, authToken)
            .then(({ token, wsUrl }) => {
                setToken(token);
                setWsUrl(wsUrl);
                setConnecting(false);
            })
            .catch((err) => {
                console.warn('LiveKit token error:', err);
                setError(err.message);
                setConnecting(false);
            });
    }, [roomName, participantName, participantId, authToken]);

    const handleDisconnect = useCallback(() => {
        onEnd?.();
    }, [onEnd]);

    // Loading state
    if (connecting) {
        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flex: 1,
                background: '#111',
                color: 'white',
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>📹</div>
                    <div>Connecting To Call...</div>
                </div>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flex: 1,
                background: '#111',
                color: 'white',
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
                    <div style={{ marginBottom: 16 }}>{error}</div>
                    <button
                        onClick={onEnd}
                        style={{
                            padding: '10px 20px',
                            background: '#E53935',
                            color: 'white',
                            border: 'none',
                            borderRadius: 8,
                            cursor: 'pointer',
                        }}
                    >
                        Close
                    </button>
                </div>
            </div>
        );
    }

    // No token yet
    if (!token || !wsUrl) {
        return null;
    }

    return (
        <LiveKitRoom
            token={token}
            serverUrl={wsUrl}
            connect={true}
            video={callType === 'video'}
            audio={true}
            onDisconnected={handleDisconnect}
            style={{
                display: 'flex',
                flex: 1,
                flexDirection: 'column',
            }}
        >
            <VideoCallUI onLeave={handleDisconnect} />
        </LiveKitRoom>
    );
}
