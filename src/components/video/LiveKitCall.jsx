/**
 * LiveKit Video Call Component
 * 
 * A seamless video calling experience using LiveKit.
 * Drop-in replacement for Jitsi with no prejoin screens or lobbies.
 */
import { useEffect, useState, useCallback } from 'react';
import {
    LiveKitRoom,
    VideoConference,
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
 * Fetches a LiveKit token from the server
 */
export async function getLiveKitToken(roomName, participantName, participantId) {
    const response = await fetch('/api/livekit/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomName, participantName, participantId }),
    });

    if (!response.ok) {
        const error = await response.json();
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
 */
export default function LiveKitCall({
    roomName,
    participantName,
    participantId,
    callType = 'video',
    otherUserName,
    onEnd,
}) {
    const [token, setToken] = useState(null);
    const [wsUrl, setWsUrl] = useState(null);
    const [error, setError] = useState(null);
    const [connecting, setConnecting] = useState(true);

    // Get LiveKit token on mount
    useEffect(() => {
        if (!roomName || !participantName) return;

        getLiveKitToken(roomName, participantName, participantId)
            .then(({ token, wsUrl }) => {
                setToken(token);
                setWsUrl(wsUrl);
                setConnecting(false);
            })
            .catch((err) => {
                console.error('LiveKit token error:', err);
                setError(err.message);
                setConnecting(false);
            });
    }, [roomName, participantName, participantId]);

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
                    <div>Connecting to call...</div>
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
