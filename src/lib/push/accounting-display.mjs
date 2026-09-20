// Presentation restriction only. These markers never authorize an invoice,
// exempt preferences, certify a receipt or grant the accounting delivery path.
export function accountingDisplayPayload(payload = {}) {
    const data = payload.data && typeof payload.data === 'object' ? payload.data : {};
    const accounting = payload.event === 'accounting_invoice' || data.event === 'accounting_invoice' ||
        payload.accountingNotificationId != null || data.accountingNotificationId != null ||
        (typeof payload.tag === 'string' && payload.tag.startsWith('accounting:'));
    if (!accounting) return payload;
    const text = value => typeof value === 'string' ? value : undefined;
    // Allowlist rather than spreading source data: no title/body/image/action,
    // native custom notification fields or per-account badge count can leak.
    return {
        title: 'New Accounting Notice',
        body: 'Open Smarter Poker To View',
        url: payload.url || '/hub/messenger',
        tag: payload.tag || undefined,
        renotify: false,
        icon: '/notification-icon.png',
        badge: '/notification-icon.png',
        data: {
            event: 'accounting_invoice',
            outboxId: text(data.outboxId ?? payload.outboxId),
            accountingNotificationId: text(data.accountingNotificationId ?? payload.accountingNotificationId),
        },
    };
}
