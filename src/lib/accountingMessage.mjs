// Only the server may supply receipt, from accounting_invoice_deliveries.
export function verifyAccountingMessage(message, receipt) {
    const metadata = { ...message.media_metadata, accounting_verified: !!receipt };
    if (receipt) return { ...message, media_metadata: { ...metadata,
        invoice_id: receipt.id, issued_status: message.media_metadata?.status,
        status: receipt.status, chips_transferred: receipt.chips_transferred } };
    if (message.message_type === 'invoice') return { ...message, message_type: 'text',
        media_metadata: { ...metadata, kind: 'unverified_document' } };
    return { ...message, media_metadata: metadata };
}
