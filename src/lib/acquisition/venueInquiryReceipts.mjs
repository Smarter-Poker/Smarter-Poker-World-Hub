// Server-only, on-demand aggregate. Never fetch message bodies or change flags.
const ADDRESS = 'support@smarter.poker';
const SUBJECT = 'Venue Onboarding';
const MAX_MESSAGES = 1000;
const DEADLINE_MS = 12000;

export const VENUE_INQUIRY_DEFINITION = 'Messages In The Support Inbox With Exact Subject Venue Onboarding, Addressed To support@smarter.poker, Received In This Window. Excludes Self-Sent Messages, Drafts, Deleted, Archived And Spam Mail. Counts Messages, Not Qualified Leads Or Activated Venues.';

export function isVenueInquiry(message, start, end) {
  const received = new Date(message.internalDate).getTime();
  const flags = new Set(message.flags || []);
  const envelope = message.envelope;
  const addressed = envelope?.to?.some(recipient => recipient.address?.toLowerCase() === ADDRESS);
  const selfSent = envelope?.from?.some(sender => sender.address?.toLowerCase() === ADDRESS);
  return Number.isFinite(received) && received >= Date.parse(start) && received < Date.parse(end)
    && envelope?.subject === SUBJECT && addressed && !selfSent
    && !flags.has('\\Draft') && !flags.has('\\Deleted');
}

export async function loadVenueInquiryReceipts({ start, end, password = process.env.SUPPORT_REPORTING_IMAP_PASSWORD,
  createClient, deadlineMs = DEADLINE_MS } = {}) {
  if (!password || !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(start) >= Date.parse(end)) return null;
  let client;
  let timer;
  try {
    const factory = createClient || (options => import('imapflow').then(({ ImapFlow }) => new ImapFlow(options)));
    client = await factory({
      host: 'mail.privateemail.com', port: 993, secure: true,
      auth: { user: ADDRESS, pass: password },
      logger: false, emitLogs: false, logRaw: false, disableAutoIdle: true,
      connectionTimeout: 6000, greetingTimeout: 6000, socketTimeout: 6000,
      tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
    });
    client.on('error', () => {}); // Error details can contain private protocol data.
    const read = async () => {
      await client.connect();
      await client.mailboxOpen('INBOX', { readOnly: true });
      // IMAP dates have day precision. Widen the search, then use INTERNALDATE
      // below for the precise UTC half-open report window.
      const ids = await client.search({
        since: new Date(Date.parse(start) - 86400000),
        before: new Date(Date.parse(end) + 86400000),
        subject: SUBJECT, deleted: false, draft: false,
      }, { uid: true });
      if (!Array.isArray(ids) || ids.length > MAX_MESSAGES || ids.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new Error('Unavailable');
      const expected = new Set(ids);
      if (expected.size !== ids.length) throw new Error('Unavailable');
      if (!ids.length) return 0;
      let total = 0;
      for await (const message of client.fetch(ids.join(','), { uid: true, internalDate: true, envelope: true, flags: true }, { uid: true })) {
        if (!expected.delete(message.uid) || !message.internalDate || !Number.isFinite(new Date(message.internalDate).getTime())
          || typeof message.envelope?.subject !== 'string') throw new Error('Incomplete Receipt Data');
        if (isVenueInquiry(message, start, end)) total++;
      }
      if (expected.size) throw new Error('Incomplete Receipt Data');
      return total;
    };
    return await Promise.race([read(), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Unavailable')), deadlineMs);
    })]);
  } catch { return null; }
  finally {
    clearTimeout(timer);
    try { client?.close(); } catch { /* No private protocol errors leave this module. */ }
  }
}
