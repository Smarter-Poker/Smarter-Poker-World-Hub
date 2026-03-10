// src/contracts/orb6_wire.ts
import { z } from 'zod';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ORB-6: THE WIRE (WebRTC & Chat Engine)
 * Domain-Driven Contracts for Chat Deltas and WebRTC signaling.
 * Ensures zero-lag, delta-only updates across the EventBus and Supabase Realtime.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ─── CHAT DELTA ────────────────────────────────────────────────────────────────
// Broadcast ONLY delta updates (never full arrays)

export const ChatDeltaSchema = z.object({
    id: z.string().uuid(),
    conversation_id: z.string().uuid(),
    sender_id: z.string().uuid(),
    content: z.string().max(5000),           // Markdown/Text Content (e.g. [Image](url) or text)
    status: z.enum(['sending', 'sent', 'delivered', 'read', 'failed']),
    created_at: z.string().datetime(),
});

export type ChatDelta = z.infer<typeof ChatDeltaSchema>;


// ─── WEBRTC SIGNALING (incoming_call, call_ended) ──────────────────────────────
// Broadcast via Supabase channel `call-signal:${userId}`

export const WebRtcSignalSchema = z.object({
    callerId: z.string().uuid(),
    callerName: z.string(),
    callerAvatar: z.string().nullable(),
    callType: z.enum(['video', 'audio']),
    roomName: z.string(),        // LiveKit Room Name
});

export type WebRtcSignal = z.infer<typeof WebRtcSignalSchema>;


// ─── EVENT BUS SIGNALS ─────────────────────────────────────────────────────────

export const Orb6EventBusMap = {
    // Emitted when a message is successfully delivered/read
    'orb6:message_status_update': z.object({
        messageId: z.string().uuid(),
        status: z.enum(['delivered', 'read']),
    }),

    // Emitted when a new Delta chat event occurs
    'orb6:chat_delta': ChatDeltaSchema,

    // High-level signal events
    'orb6:webrtc_signal': z.object({
        event: z.enum(['incoming_call', 'call_ended', 'call_accepted', 'call_rejected']),
        payload: WebRtcSignalSchema.partial(),
    }),
};
