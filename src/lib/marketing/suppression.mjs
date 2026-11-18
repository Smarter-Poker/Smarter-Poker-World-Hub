/**
 * The do-not-email list, as the existing player senders use it (welcome-back
 * chips and player announcements). Campaigns read it inside the database.
 *
 * loadSuppressed returns null when the list cannot be read. Callers then send
 * NO promotional email that run and leave the receipt unmarked, so the next
 * hourly run tries again - sending to somebody who unsubscribed is the one
 * mistake this list exists to prevent, so an unreadable list fails closed.
 */
import { unsubscribeUrl } from './links.mjs';

export const SUPPRESSED_DETAIL = 'unsubscribed from promotional email';

export async function loadSuppressed(sb, emails) {
    const keys = [...new Set((emails || []).map((e) => String(e || '').trim().toLowerCase()).filter(Boolean))];
    if (!keys.length) return new Set();
    const { data, error } = await sb.from('sp_marketing_suppressions').select('email_key').in('email_key', keys);
    // The list not existing yet (migration 20261118170500 not installed) is not
    // "unreadable": nobody can have unsubscribed through a list that does not
    // exist, so the old behaviour stands. Any other error fails closed.
    if (error && isMissingTable(error)) return new Set();
    if (error) return null;
    return new Set((data || []).map((r) => r.email_key));
}

export function isMissingTable(error) {
    const code = String(error?.code || '');
    return code === '42P01' || code === 'PGRST205' || /could not find the table|relation .* does not exist/i.test(String(error?.message || ''));
}

export const isSuppressed = (set, email) => !!set && set.has(String(email || '').trim().toLowerCase());

/**
 * List-Unsubscribe headers. With a signing secret: the signed one-click link
 * first (Gmail and Yahoo's inbox button posts to it, RFC 8058) and the
 * settings page second. Without one: the settings page alone, as before.
 */
export function oneClickHeaders(email, fallbackUrl) {
    const signed = unsubscribeUrl(email);
    if (!signed) return { 'List-Unsubscribe': `<${fallbackUrl}>` };
    return { 'List-Unsubscribe': `<${signed}>, <${fallbackUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' };
}
