import { useEffect, useRef, useState } from 'react';
import { authedFetch, getAccessToken } from '../lib/authUtils';
import { CONTINUITY_PREFIX, createContinuityController, isMessageId } from '../lib/messengerContinuity.mjs';
import { broadcastSync, listenBroadcast } from '../lib/broadcastSync';

export default function useMessengerContinuity({ actorId, scope, workspace, identityRef }) {
    const [, render] = useState(0);
    const owner = useRef(null);
    const timers = useRef(new Map());
    if (owner.current?.scope !== scope) {
        const next = { scope, actorId, mounted: true };
        let storage = null;
        try { if (typeof window !== 'undefined') storage = window.localStorage; } catch { /* Reported if a local write is attempted. */ }
        next.controller = createContinuityController({ actorId, workspace, storage,
            isCurrent: () => owner.current === next && identityRef.current === actorId,
            changed: () => { if (next.mounted) render(value => value + 1); },
            committed: (conversationId, receipt) => broadcastSync('smarter_poker_continuity_sync', { actorId, conversationId, workspace,
                receipt: { field: receipt.field, revision: receipt.revision, ...(receipt.field === 'saved' ? { value: receipt.value } : {}) } }),
            request: async body => {
                const response = await authedFetch('/api/messenger/continuity', {
                    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAccessToken()}` },
                    body: JSON.stringify(body),
                });
                return { ok: response.ok, status: response.status, body: await response.json() };
            },
        });
        owner.current = next;
    }
    const controller = owner.current.controller;
    const flush = (conversationId, selectedController = controller) => {
        for (const [key, pending] of timers.current) {
            if (pending.controller !== selectedController) continue;
            if (conversationId && pending.conversationId !== conversationId) continue;
            clearTimeout(pending.timer); timers.current.delete(key);
            void pending.controller.write(pending.conversationId, pending.field);
        }
    };
    useEffect(() => {
        const activeOwner = owner.current;
        activeOwner.mounted = true;
        if (actorId) void controller.read();
        const refresh = () => { if (document.visibilityState === 'visible' && actorId) void controller.read(); };
        const stop = listenBroadcast('smarter_poker_continuity_sync', event => {
            if (event?.actorId === actorId) controller.acceptCommit(event.conversationId, event.receipt, event.workspace);
        });
        const storage = event => {
            const prefix = `${CONTINUITY_PREFIX}${actorId}:`;
            if (event.key?.startsWith(prefix) && isMessageId(event.key.slice(prefix.length))) controller.acceptLocal(event.key.slice(prefix.length));
        };
        const leaving = () => flush();
        window.addEventListener('storage', storage);
        window.addEventListener('focus', refresh);
        window.addEventListener('pagehide', leaving);
        return () => {
            flush();
            activeOwner.mounted = false;
            for (const [key, pending] of timers.current) if (pending.controller === controller) {
                clearTimeout(pending.timer); timers.current.delete(key);
            }
            stop(); window.removeEventListener('storage', storage); window.removeEventListener('focus', refresh); window.removeEventListener('pagehide', leaving);
        };
    }, [controller, actorId]);
    const edit = (conversationId, field, value) => {
        if (!controller.edit(conversationId, field, value)) return;
        const key = `${scope}:${conversationId}:${field}`;
        clearTimeout(timers.current.get(key)?.timer);
        const timer = setTimeout(() => { timers.current.delete(key); void controller.write(conversationId, field); }, field === 'draft' ? 600 : 400);
        timers.current.set(key, { timer, controller, conversationId, field });
    };
    return { controller, edit, flush };
}
