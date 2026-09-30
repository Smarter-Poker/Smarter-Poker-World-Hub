/* Which addresses the article reader is allowed to fetch.
   Lifted out of pages/api/proxy.js so it can be tested against real URLs
   instead of by matching the text of the file it lives in. */
import dns from 'node:dns/promises';

export const ALLOWED_PROTOCOLS = ['http:', 'https:'];
export const BLOCKED_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '::1'];
const CONFIG = { ALLOWED_PROTOCOLS, BLOCKED_HOSTS };

/**
 * Every address family and spelling the host check has to cover.
 *
 * The first version of this checked the hostname STRING, which caught
 * 169.254.169.254 and 127.0.0.1 and missed everything else. Measured against
 * the shipped predicate on 2026-09-30, all of these were ALLOWED:
 *
 *   http://[::ffff:169.254.169.254]/   v4-mapped IPv6 spelling of the metadata address
 *   http://[::ffff:127.0.0.1]/         v4-mapped loopback
 *   http://[::]/                       unspecified, which reaches loopback
 *   http://[fd00::1]/ [fc00::1]        IPv6 unique-local, the private ranges
 *   http://[fe80::1]/                  link-local (the old startsWith('fe80:') could
 *                                      never match: URL.hostname keeps the brackets)
 *   http://169.254.169.254.nip.io/     a plain DNS name pointing at the metadata IP
 *   http://metadata.google.internal./  a trailing dot defeating the exact-match list
 *
 * So the check now runs on RESOLVED ADDRESSES, not on the text. A name is looked
 * up and every address it answers with is judged. That is what closes the DNS
 * spellings, which no amount of string matching can.
 *
 * Residual, stated rather than hidden: between this lookup and the fetch's own
 * resolution there is a window in which an attacker-controlled DNS record could
 * change answer (classic rebinding). Closing that needs connecting to the checked
 * IP directly with a Host header, which this reader does not do. The window is
 * narrow and the payoff here is a public article body, but it is not zero.
 */
export function ipv4Blocked(a, b) {
    if (a === 0) return true;                        // 0.0.0.0/8
    if (a === 10) return true;                       // private
    if (a === 127) return true;                      // loopback
    if (a === 169 && b === 254) return true;         // link-local, incl. cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;// private
    if (a === 192 && b === 168) return true;         // private
    if (a === 100 && b >= 64 && b <= 127) return true;// CGNAT 100.64/10
    if (a === 192 && b === 0) return true;           // 192.0.0.0/24 and 192.0.2.0/24
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking 198.18/15
    if (a >= 224) return true;                       // multicast and reserved 224/4, 240/4
    return false;
}

/** True when this literal address must never be fetched. Handles v4 and v6. */
export function isBlockedAddress(host) {
    const h = String(host || '').trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
    if (!h) return true;

    // Plain dotted IPv4.
    const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (v4) {
        const o = v4.slice(1).map(Number);
        if (o.some((n) => n > 255)) return true;
        return ipv4Blocked(o[0], o[1]);
    }

    if (h.includes(':')) {
        // IPv6. A v4-mapped or NAT64 address carries a v4 address inside it, in
        // either dotted or hex form, and must be judged as that v4 address.
        const mapped = h.match(/^(?:::ffff:|64:ff9b::)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
        if (mapped) return isBlockedAddress(mapped[1]);
        const hexMapped = h.match(/^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
        if (hexMapped) {
            const hi = parseInt(hexMapped[1], 16), lo = parseInt(hexMapped[2], 16);
            return ipv4Blocked((hi >> 8) & 0xff, hi & 0xff);
        }
        if (h === '::' || h === '::1') return true;              // unspecified, loopback
        const head = h.split(':')[0];
        if (/^fe[89ab]/.test(head)) return true;                 // fe80::/10 link-local
        if (/^f[cd]/.test(head)) return true;                    // fc00::/7 unique-local
        if (/^ff/.test(head)) return true;                       // ff00::/8 multicast
        return false;
    }

    return false; // a name, judged after resolution
}

export function isPrivateOrReservedHost(hostname) {
    // Retained because the file references it elsewhere. The literal-address
    // rules now live in isBlockedAddress, which covers IPv6 and the mapped
    // spellings this function never did. Decimal, octal and hex IPv4 spellings
    // are still handled here because URL parsing normalises most of them away.
    const h = String(hostname || '').trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
    const metadataHosts = ['169.254.169.254', 'metadata.google.internal', 'metadata.google', '100.100.100.200'];
    if (metadataHosts.includes(h)) return true;
    if (isBlockedAddress(h)) return true;
    if (/^\d+$/.test(h)) {                                  // decimal, e.g. 2130706433
        const num = parseInt(h, 10);
        if (num >= 0 && num <= 0xFFFFFFFF) return ipv4Blocked((num >>> 24) & 0xFF, (num >>> 16) & 0xFF);
    }
    if (h.split('.').some((p) => p.startsWith('0') && p.length > 1 && /^\d+$/.test(p))) return true; // octal
    if (/^0x[0-9a-f]+$/.test(h)) return true;               // hex
    return false;
}

/**
 * Whether this URL may be fetched, judged on RESOLVED ADDRESSES.
 *
 * Shared by the up-front check on the caller's URL and by every redirect hop,
 * which is the part the platform used to decide for us.
 */
export async function assertFetchableUrl(parsed) {
    if (!CONFIG.ALLOWED_PROTOCOLS.includes(parsed.protocol)) return false;
    const host = String(parsed.hostname || '').trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
    if (!host) return false;
    if (CONFIG.BLOCKED_HOSTS.includes(host)) return false;
    if (isPrivateOrReservedHost(host)) return false;

    // A literal address has already been judged above. A NAME has not: nothing
    // about the text of "169.254.169.254.nip.io" is suspicious, so resolve it
    // and judge what it actually points at.
    const isLiteral = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':');
    if (isLiteral) return true;

    let addrs;
    try {
        addrs = await dns.lookup(host, { all: true, verbatim: true });
    } catch {
        // A name that will not resolve cannot be fetched anyway. Refusing here
        // keeps the failure on the safe side rather than handing it to fetch.
        return false;
    }
    if (!addrs || !addrs.length) return false;
    return addrs.every((a) => !isBlockedAddress(a.address));
}

/**
 * fetch(), following redirects ourselves so the address check runs on EVERY hop.
 *
 * The platform used to follow them for us, which made the check above run once,
 * on the URL the caller supplied, and then follow wherever that host pointed.
 */
export async function fetchGuarded(startUrl, options, maxHops = 5) {
    let current = startUrl;
    // hop < maxHops, so maxHops=5 means at most 5 outbound requests, not 6.
    for (let hop = 0; hop < maxHops; hop++) {
        const response = await fetch(current, { ...options, redirect: 'manual' });
        const status = response.status;
        const location = response.headers.get('location');
        if (status < 300 || status > 399 || !location) return response;

        // Nothing reads a redirect body. Release it rather than leaving the
        // socket held open for the life of the invocation.
        try { await response.body?.cancel(); } catch { /* already drained */ }

        let next;
        try {
            next = new URL(location, current); // Location may be relative
        } catch {
            const err = new Error('Redirect target could not be parsed');
            err.code = 'BAD_REDIRECT';
            throw err;
        }
        if (!(await assertFetchableUrl(next))) {
            const err = new Error('Redirect pointed at an address that is not allowed');
            err.code = 'BLOCKED_REDIRECT';
            throw err;
        }
        current = next.toString();
    }
    const err = new Error('Too many redirects');
    err.code = 'TOO_MANY_REDIRECTS';
    throw err;
}

