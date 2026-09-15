const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CASHIER_ROLES = new Set(['owner', 'co_owner', 'admin', 'super_agent', 'agent', 'sub_agent']);
const REQUESTER_ROLES = new Set(['player', 'member', ...CASHIER_ROLES]);
const CASHIER_STATES = Object.freeze({
    hold: { state: 'held', status: 'generated', label: 'Chips Held', detail: 'Chips are held while the cashout is reviewed.' },
    approval: { state: 'approved', status: 'paid', label: 'Cashout Approved', detail: 'Chips were transferred to the approving cashier.' },
    cancellation: { state: 'refunded', status: 'paid', label: 'Chips Returned', detail: "The cashout was cancelled. Chips were returned to the player's wallet." },
    decline: { state: 'refunded', status: 'paid', label: 'Chips Returned', detail: "The cashout was declined. Chips were returned to the player's wallet." },
    expiry_refund: { state: 'refunded', status: 'paid', label: 'Chips Returned', detail: "The cashout expired. Chips were returned to the player's wallet." },
});
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const uuid = value => typeof value === 'string' && UUID.test(value);

// settlement_invoices is numeric(12,2). This bound is its existing transport
// range, not a new business limit; no floating-point arithmetic formats money.
function invoiceAmount(value) {
    const text = typeof value === 'number' && Number.isFinite(value) ? String(value) : value;
    if (typeof text !== 'string' || text.length > 13) return null;
    const match = /^(0|[1-9]\d{0,9})(?:\.(\d{1,2}))?$/.exec(text);
    return match ? `${match[1]}.${(match[2] || '').padEnd(2, '0')}` : null;
}

function timestamp(value) {
    if (typeof value !== 'string' || value.length > 32) return false;
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
    if (!match || !Number.isFinite(Date.parse(value))) return false;
    const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1] &&
        hour < 24 && minute < 60 && second < 60;
}

// The argument is a separate server receipt from the private database reader,
// not the message's user-supplied metadata. That reader joins the immutable
// cashier event to its invoice and overrides these fields from those records.
export function parseVerifiedCashierReceipt(receipt) {
    if (!object(receipt) || receipt.accounting_verified !== true || receipt.invoice_type !== 'cashier_cashout' ||
        receipt.cashier_verified !== true || !object(receipt.cashier)) return null;
    const c = parseCashierEvent(receipt.cashier);
    if (!c || c.invoice_id !== receipt.id || c.source_ledger_id !== receipt.source_ledger_id ||
        c.club_id !== receipt.club_id || invoiceAmount(receipt.amount) !== c.amount ||
        receipt.status !== CASHIER_STATES[c.event_kind].status ||
        receipt.chips_transferred !== (c.event_kind !== 'hold')) return null;
    return c;
}

// Shape validation shared by the private invoice reader and the authenticated
// cashier RPC bridge. This alone never grants message verification or authority.
export function parseCashierEvent(c) {
    if (!object(c)) return null;
    const state = typeof c.event_kind === 'string' && Object.hasOwn(CASHIER_STATES, c.event_kind) ? CASHIER_STATES[c.event_kind] : null;
    if (!state || c.contract_version !== 1) return null;
    const idFields = ['event_id', 'invoice_id', 'cashout_id', 'escrow_id', 'source_transaction_id',
        'source_ledger_id', 'club_id', 'player_id', 'assigned_agent_id', 'issuer_representative_id'];
    if (!idFields.every(key => uuid(c[key])) || c.assigned_agent_id === c.player_id ||
        c.display_state !== state.state ||
        c.custody_movement_recorded !== true ||
        c.cashout_completed !== (c.event_kind === 'approval') ||
        c.refund_recorded !== (state.state === 'refunded') ||
        typeof c.amount !== 'string' || invoiceAmount(c.amount) !== c.amount || c.amount === '0.00' ||
        !timestamp(c.occurred_at) || !timestamp(c.issued_at)) return null;
    if (c.event_kind === 'hold') {
        if (c.hold_event_id !== null || c.hold_invoice_id !== null) return null;
    } else if (!uuid(c.hold_event_id) || !uuid(c.hold_invoice_id) ||
        c.hold_event_id === c.event_id || c.hold_invoice_id === c.invoice_id) return null;
    if (c.event_kind === 'expiry_refund') {
        if (c.actor_user_id !== null || c.actor_role !== 'system') return null;
    } else {
        if (!uuid(c.actor_user_id)) return null;
        if (c.event_kind === 'hold' || c.event_kind === 'cancellation') {
            if (c.actor_user_id !== c.player_id || !REQUESTER_ROLES.has(c.actor_role)) return null;
        } else if (c.actor_user_id === c.player_id || !CASHIER_ROLES.has(c.actor_role)) return null;
    }
    const held = c.event_kind === 'hold';
    const approved = c.event_kind === 'approval';
    if (c.ledger_from_type !== (held ? 'player_wallet' : 'escrow') ||
        c.ledger_from_entity_id !== (held ? c.player_id : c.escrow_id) ||
        c.ledger_to_type !== (held ? 'escrow' : approved ? 'agent_wallet' : 'player_wallet') ||
        c.ledger_to_entity_id !== (held ? c.escrow_id : approved ? c.actor_user_id : c.player_id)) return null;
    // Whitelist the contract. Counterparty balances and arbitrary metadata do
    // not become part of a verified cashier document.
    const keys = [...idFields, 'contract_version', 'actor_user_id', 'actor_role', 'event_kind',
        'display_state', 'amount', 'occurred_at', 'issued_at', 'hold_event_id', 'hold_invoice_id',
        'ledger_from_type', 'ledger_from_entity_id', 'ledger_to_type', 'ledger_to_entity_id',
        'custody_movement_recorded', 'cashout_completed', 'refund_recorded'];
    return Object.fromEntries(keys.map(key => [key, c[key]]));
}

export function cashierInvoiceDisplay(meta) {
    if (!object(meta) || meta.invoice_type !== 'cashier_cashout' || meta.accounting_verified !== true) return null;
    const cashier = parseVerifiedCashierReceipt({ ...meta, id: meta.invoice_id });
    if (!cashier) return { verified: false, label: 'Cashier Receipt', detail: 'Receipt details are unavailable.', amount: 'Not Available' };
    const state = CASHIER_STATES[cashier.event_kind];
    const [whole, fraction] = cashier.amount.split('.');
    return { verified: true, label: state.label, detail: state.detail,
        amount: `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction}` };
}

// Only the server may supply receipt, from accounting_invoice_deliveries.
export function verifyAccountingMessage(message, receipt) {
    const metadata = { ...message.media_metadata, accounting_verified: false };
    delete metadata.cashier;
    delete metadata.cashier_verified;
    const verified = object(receipt) && typeof receipt.id === 'string' && receipt.id.length > 0;
    if (verified) {
        const issuedStatus = message.media_metadata?.issued_status ?? message.media_metadata?.status;
        if (receipt.invoice_type === 'cashier_cashout' ||
            (receipt.invoice_type === undefined && metadata.invoice_type === 'cashier_cashout')) {
            const cashier = parseVerifiedCashierReceipt(receipt);
            return { ...message, media_metadata: {
                kind: 'accounting_invoice', accounting_verified: true, invoice_type: 'cashier_cashout',
                invoice_id: receipt.id, invoice_number: metadata.invoice_number,
                source_ledger_id: receipt.source_ledger_id, club_id: receipt.club_id,
                status: receipt.status, issued_status: issuedStatus, chips_transferred: receipt.chips_transferred,
                amount: cashier?.amount ?? null, currency: 'CHIPS',
                cashier_verified: cashier !== null, cashier,
            } };
        }
        return { ...message, media_metadata: { ...metadata, accounting_verified: true,
            ...(typeof receipt.invoice_type === 'string' ? { invoice_type: receipt.invoice_type } : {}),
            invoice_id: receipt.id, issued_status: issuedStatus,
            status: receipt.status, chips_transferred: receipt.chips_transferred } };
    }
    if (message.message_type === 'invoice') return { ...message, message_type: 'text',
        media_metadata: { ...metadata, kind: 'unverified_document' } };
    return { ...message, media_metadata: metadata };
}
