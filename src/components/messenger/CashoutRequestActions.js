import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';

// Dan 2026-10-23: a player's cashout request is a Requested Payout the agent
// accepts (chips to the agent wallet) or cancels (chips back to the player's
// wallet). The server decides who may act; this card only reads the live
// request and calls the existing cashier transitions.
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
    cashier_current_authority_required: 'Only The Player\'s Agent Can Decide This Request.',
    cashier_account_changed: 'Your Session Changed. Refresh And Try Again.',
    cashier_destination_wallet_unavailable: 'Your Agent Wallet Is Unavailable. Refresh And Try Again.',
};

export function formatChips(value) {
    const n = Number(value);
    return Number.isFinite(n)
        ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : 'Not Available';
}

function newOpId() {
    if (typeof window !== 'undefined' && window.crypto?.randomUUID) return window.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
}

export default function CashoutRequestActions({ cashoutId, currentUserId, theme: C, showDetails = true }) {
    const [card, setCard] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState(null);
    const [done, setDone] = useState(null);
    // One operation id per decision: a retry after a dropped response replays
    // the same operation instead of attempting a second one.
    const pendingOp = useRef(null);

    const load = useCallback(async () => {
        if (!UUID.test(cashoutId || '')) { setLoading(false); return; }
        const { data, error: readError } = await supabase.rpc('fn_cashout_request_card', { p_cashout_id: cashoutId });
        if (!readError && data && typeof data === 'object') setCard(data);
        setLoading(false);
    }, [cashoutId]);

    useEffect(() => { load(); }, [load]);

    const decide = async (action) => {
        if (!card || busy || !currentUserId) return;
        if (!pendingOp.current || pendingOp.current.action !== action) pendingOp.current = { action, id: newOpId() };
        setBusy(action);
        setError(null);
        const fn = action === 'accept' ? 'fn_cashout_approve_v2' : 'fn_cashout_release_v2';
        const { error: rpcError } = await supabase.rpc(fn, {
            p_cashout_id: card.cashout_id,
            p_club_id: card.club_id,
            p_amount: card.amount,
            p_expected_actor_id: currentUserId,
            p_op_id: pendingOp.current.id,
            p_note: null,
        });
        if (rpcError) {
            const code = Object.keys(ERROR_COPY).find((key) => String(rpcError.message || '').includes(key));
            setError(code ? ERROR_COPY[code] : 'Could Not Complete. Refresh To Check The Request.');
            if (code === 'cashier_request_already_terminal') pendingOp.current = null;
        } else {
            pendingOp.current = null;
            setDone(action === 'accept'
                ? `Accepted. ${formatChips(card.amount)} Chips Were Sent To Your Agent Wallet.`
                : `Cancelled. ${formatChips(card.amount)} Chips Were Returned To ${card.player_name || 'The Player'}'s Wallet.`);
        }
        setBusy(null);
        load();
    };

    if (loading || !card) return null;
    const status = String(card.status || '');
    const button = (primary) => ({
        flex: 1, minHeight: 40, borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: busy ? 'default' : 'pointer',
        border: primary ? 'none' : `1px solid ${C.border}`,
        background: primary ? '#1f9d55' : 'transparent',
        color: primary ? '#fff' : '#d64545',
        opacity: busy && busy !== (primary ? 'accept' : 'cancel') ? 0.5 : 1,
    });
    return <div data-testid="cashout-request-actions" style={{ marginTop: 10 }}>
        {showDetails && <dl style={{ margin: '0 0 8px', fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0' }}>
                <dt style={{ color: C.textSec }}>Player</dt><dd style={{ margin: 0, fontWeight: 600 }}>{card.player_name || 'Player'}</dd>
            </div>
            {card.player_note && <div style={{ padding: '4px 0' }}>
                <dt style={{ color: C.textSec }}>Note</dt><dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{card.player_note}</dd>
            </div>}
        </dl>}
        <p role="status" style={{ fontSize: 12, margin: '0 0 8px', color: status === 'pending' ? C.blue : C.textSec, fontWeight: 600 }}>
            {done || STATUS_COPY[status] || status}
        </p>
        {card.can_decide && status === 'pending' && !done && <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={button(true)} disabled={!!busy} onClick={() => decide('accept')}
                aria-label={`Accept ${formatChips(card.amount)} Chip Payout From ${card.player_name || 'Player'}`}>
                {busy === 'accept' ? 'Accepting...' : 'Accept'}
            </button>
            <button type="button" style={button(false)} disabled={!!busy} onClick={() => decide('cancel')}
                aria-label={`Cancel ${formatChips(card.amount)} Chip Payout From ${card.player_name || 'Player'}`}>
                {busy === 'cancel' ? 'Cancelling...' : 'Cancel'}
            </button>
        </div>}
        {error && <p role="alert" style={{ fontSize: 12, color: '#d64545', margin: '8px 0 0' }}>{error}</p>}
    </div>;
}
