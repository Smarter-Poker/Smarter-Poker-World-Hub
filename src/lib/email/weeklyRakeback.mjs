import { sendEmail } from '../dailyDigest/delivery.mjs';

// Claims come exclusively from the weekly engine’s committed receipts. No address,
// message or chip amount is accepted from the HTTP request.
export async function deliverWeeklyRakebackEmails(db, send = sendEmail) {
    const { data, error } = await db.rpc('claim_weekly_rakeback_credit_emails');
    if (error || !Array.isArray(data)) throw new Error('Weekly rakeback receipt lookup failed');
    const results = await Promise.all(data.map(async row => {
        const receipt = row.receipt_id;
        if (!receipt || !row.claim || !row.address || !row.title || !row.body) return false;
        const result = await send({
            to: [row.address], from: 'Smarter.Poker <noreply@smarter.poker>',
            subject: row.title, text: row.body, idempotencyKey: `weekly-rakeback/${receipt}`,
        });
        const accepted = result.ok && !!result.id;
        const ack = await db.rpc('finish_weekly_rakeback_credit_email', {
            p_receipt: receipt, p_claim: row.claim, p_provider_id: accepted ? result.id : null,
            p_failure: accepted ? null : 'provider_acceptance_unconfirmed',
        });
        return accepted && !ack.error && ack.data === true;
    }));
    return { sent: results.filter(Boolean).length, unconfirmed: results.filter(x => !x).length };
}
