/**
 * LiveKit Token Generation API
 * 
 * Generates access tokens for users to join LiveKit video rooms.
 * Used for seamless 1:1 video calling in the Messenger.
 */
import { AccessToken } from 'livekit-server-sdk';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { roomName, participantName, participantId } = req.body;

    if (!roomName || !participantName) {
        return res.status(400).json({ error: 'Missing roomName or participantName' });
    }

    // LiveKit credentials from environment
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const wsUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || 'wss://smarter-poker-xxx.livekit.cloud';

    if (!apiKey || !apiSecret) {
        console.error('LiveKit API credentials not configured');
        return res.status(500).json({
            error: 'Video calling not configured. Please set LIVEKIT_API_KEY and LIVEKIT_API_SECRET.'
        });
    }

    try {
        // Create an access token
        const token = new AccessToken(apiKey, apiSecret, {
            identity: participantId || participantName,
            name: participantName,
            // Token expires in 1 hour
            ttl: '1h',
        });

        // Grant permissions for the room
        token.addGrant({
            roomJoin: true,
            room: roomName,
            canPublish: true,
            canSubscribe: true,
            canPublishData: true,
        });

        const jwt = await token.toJwt();

        return res.status(200).json({
            token: jwt,
            wsUrl: wsUrl,
        });
    } catch (error) {
        console.error('Error generating LiveKit token:', error);
        return res.status(500).json({ error: 'Failed to generate video token' });
    }
}
