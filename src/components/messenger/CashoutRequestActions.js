import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';

// The canonical cashier transition owns authority and chip movement. Escalation
// shares the existing held request; it never creates a second payout.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS_COPY = {
    pending: 'Waiting For The Agent To Accept Or Cancel',
    approved: 'Accepted · Chips Sent To The Agent Wallet',
    completed: 'Accepted · Chips Sent To The Agent Wallet',
    rejected: "Cancelled · Chips Returned To The Player's Wallet",
    cancelled: "Withdrawn By The Player · Chips Returned To The Player's Wallet",
    expired: "Expired · Chips Returned To The Player's Wallet",
};
const ERROR_COPY = {
    cashier_request_already_terminal: 'This Request Was Already Decided.',
    cashier_current_authority_required: 'Your Current Role Cannot Decide This Request.',
    cashier_notice_board_manager_required: 'Only The Owner, Co-Owner Or Admin Can Decide A Board Request.',
    cashier_account_changed: 'Your Session Changed. Refresh And Try Again.',
    cashier_destination_wallet_unavailable: 'The Destination Wallet Is Unavailable. Refresh And Try Again.',
};
export function formatChips(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'Not Available';
}
function newOpId() {
    if (typeof window !== 'undefined' && window.crypto?.randomUUID) return window.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
}
export default function CashoutRequestActions({ cashoutId, currentUserId, theme: C, showDetails = true, initialCard = null, onChanged }) {
    const [card, setCard] = useState(initialCard);
    const [loading, setLoading] = useState(!initialCard);
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState(null);
    const [done, setDone] = useState(null);
    const pendingOp = useRef(null);
    const requestState = useRef({ alive: false, epoch: 0, busy: false });
    const load = useCallback(async () => {
        const scope = requestState.current, epoch = scope.epoch;
        if (!UUID.test(cashoutId || '')) { setLoading(false); return; }
        try {
            const { data, error: readError } = await supabase.rpc('fn_cashout_request_card', { p_cashout_id: cashoutId });
            if (!scope.alive || scope.epoch !== epoch) return;
            if (readError || !data || typeof data !== 'object') {
                setCard(null);
                setError('This Payout Is Unavailable. Refresh To Check Your Access.');
            } else { setCard(data); }
        } catch (_) {
            if (scope.alive && scope.epoch === epoch) setError('Could Not Refresh This Payout.');
        } finally { if (scope.alive && scope.epoch === epoch) setLoading(false); }
    }, [cashoutId]);
    useEffect(() => {
        const scope = requestState.current;
        scope.alive = true; scope.epoch++; scope.busy = false;
        pendingOp.current = null; setCard(initialCard); setDone(null); setError(null);
        void load();
        const refresh = () => void load();
        window.addEventListener('focus', refresh);
        window.addEventListener('online', refresh);
        return () => {
            scope.alive = false; scope.epoch++;
            window.removeEventListener('focus', refresh); window.removeEventListener('online', refresh);
        };
    }, [load, currentUserId]);
    useEffect(() => { if (initialCard) { setCard(initialCard); setDone(null); } }, [initialCard]);
    const decide = async (action) => {
        const scope = requestState.current, epoch = scope.epoch;
        if (!card || scope.busy || !currentUserId || (pendingOp.current && pendingOp.current.action !== action)) return;
        if (!pendingOp.current || pendingOp.current.action !== action) pendingOp.current = { action, id: newOpId() };
        scope.busy = true; setBusy(action); setError(null);
        const escalate = action === 'escalate';
        const fn = escalate ? 'fn_cashout_escalate_v2' : action === 'accept' ? 'fn_cashout_approve_v2' : 'fn_cashout_release_v2';
        try {
            const { error: rpcError } = await supabase.rpc(fn, {
                p_cashout_id: card.cashout_id, p_club_id: card.club_id,
                p_expected_actor_id: currentUserId, p_op_id: pendingOp.current.id,
                ...(!escalate ? { p_amount: card.amount, p_note: null } : {}),
            });
            if (!scope.alive || scope.epoch !== epoch) return;
            if (rpcError) {
                const code = Object.keys(ERROR_COPY).find((key) => String(rpcError.message || '').includes(key));
                setError(code ? ERROR_COPY[code] : 'Could Not Complete. Refresh To Check The Request.');
                if (code === 'cashier_request_already_terminal') pendingOp.current = null;
            } else {
                pendingOp.current = null;
                setDone(escalate ? 'Sent To Notice Board. The Original Request Remains Pending.' : action === 'accept'
                    ? `Accepted. ${formatChips(card.amount)} Chips Were Sent To ${card.is_escalated ? 'The Club Chip Bank' : 'Your Agent Wallet'}.`
                    : `Cancelled. ${formatChips(card.amount)} Chips Were Returned To ${card.player_name || 'The Player'}'s Wallet.`);
                onChanged?.();
            }
            await load();
        } catch (_) {
            if (scope.alive && scope.epoch === epoch) setError('The Result Is Unconfirmed. Refresh Or Retry The Same Action.');
        } finally {
            if (scope.alive && scope.epoch === epoch) { scope.busy = false; setBusy(null); }
        }
    };
    if (loading || !card) return error ? <p role="alert" style={{ color: C.textSec, fontSize: 12 }}>{error} <button type="button" onClick={() => void load()}>Refresh Payout</button></p> : null;
    const status = String(card.status || '');
    const escalated = card.is_escalated === true;
    const statusCopy = escalated && status === 'pending' ? 'On Notice Board · Awaiting Owner, Co-Owner Or Admin'
        : escalated && ['approved', 'completed'].includes(status) ? 'Accepted · Chips Sent To The Club Chip Bank' : STATUS_COPY[status] || status;
    const button = (primary) => ({
        flex: 1, minHeight: 40, borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: busy ? 'default' : 'pointer',
        border: primary ? 'none' : `1px solid ${C.border}`, background: primary ? '#1f9d55' : 'transparent',
        color: primary ? '#fff' : '#d64545',
    });
    return <div data-testid="cashout-request-actions" style={{ marginTop: 10 }}>
        {showDetails && <dl style={{ margin: '0 0 8px', fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0' }}>
                <dt style={{ color: C.textSec }}>Player</dt><dd style={{ margin: 0, fontWeight: 600 }}>{card.player_name || 'Player'}</dd>
            </div>
            {escalated && <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0' }}>
                <dt style={{ color: C.textSec }}>Payout</dt><dd style={{ margin: 0, fontWeight: 700 }}>{formatChips(card.amount)} Chips</dd>
            </div>}
            {card.player_note && <div style={{ padding: '4px 0' }}>
                <dt style={{ color: C.textSec }}>Note For Agent</dt><dd style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{card.player_note}</dd>
            </div>}
        </dl>}
        <p role="status" style={{ fontSize: 12, margin: '0 0 8px', color: status === 'pending' ? C.blue : C.textSec, fontWeight: 600 }}>{done || statusCopy}</p>
        {card.can_decide && status === 'pending' && !done && <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={button(true)} disabled={!!busy || (!!pendingOp.current && pendingOp.current.action !== 'accept')} onClick={() => decide('accept')} aria-label={`Accept ${formatChips(card.amount)} Chip Payout From ${card.player_name || 'Player'}`}>{busy === 'accept' ? 'Accepting...' : 'Accept'}</button>
            <button type="button" style={button(false)} disabled={!!busy || (!!pendingOp.current && pendingOp.current.action !== 'cancel')} onClick={() => decide('cancel')} aria-label={`${escalated ? 'Deny' : 'Cancel'} ${formatChips(card.amount)} Chip Payout From ${card.player_name || 'Player'}`}>{busy === 'cancel' ? 'Cancelling...' : escalated ? 'Deny' : 'Cancel'}</button>
        </div>}
        {card.can_escalate && !escalated && status === 'pending' && !done && <button type="button" disabled={!!busy || (!!pendingOp.current && pendingOp.current.action !== 'escalate')} onClick={() => decide('escalate')} style={{ ...button(false), width: '100%', color: C.blue, marginTop: 8 }}>{busy === 'escalate' ? 'Sending...' : 'Send To Notice Board'}</button>}
        {error && <p role="alert" style={{ fontSize: 12, color: '#d64545', margin: '8px 0 0' }}>{error} <button type="button" onClick={() => void load()}>Refresh Payout</button></p>}
    </div>;
}
