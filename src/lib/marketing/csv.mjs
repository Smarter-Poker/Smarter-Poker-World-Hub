/**
 * Contact-list import parsing, shared by the Marketing tab (browser) and its
 * tests. Accepts a CSV or TSV pasted from Google Sheets or Excel, or a plain
 * list of addresses one per line.
 *
 * Header names are matched loosely ("Email", "E-mail", "Agent Name",
 * "Phone", "Downlines", "Number"...). Without a header row, any cell that
 * looks like an address is the email and any 10+ digit cell is the phone.
 */

export function parseDelimited(text) {
    const src = String(text || '').replace(/\r\n?/g, '\n');
    const first = src.split('\n', 1)[0] || '';
    const delim = first.includes('\t') ? '\t' : ',';
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        if (quoted) {
            if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
            else if (ch === '"') quoted = false;
            else cell += ch;
        } else if (ch === '"' && cell === '') quoted = true;
        else if (ch === delim) { row.push(cell.trim()); cell = ''; }
        else if (ch === '\n') { row.push(cell.trim()); rows.push(row); row = []; cell = ''; }
        else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell.trim()); rows.push(row); }
    return rows.filter((r) => r.some((c) => c !== ''));
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const FIELDS = [
    ['email', /^(e-?mail|email address)$/i],
    ['full_name', /^(name|full name|contact name)$/i],
    ['agent_name', /^(agent|agent name|username|screen name)$/i],
    ['phone', /^(phone|phone number|mobile|cell)$/i],
    ['external_id', /^(number|id|agent id|player id)$/i],
    ['downlines', /^(downlines?|players)$/i],
    ['notes', /^(notes?|payment tag.*)$/i],
];

export function rowsToContacts(text) {
    const rows = parseDelimited(text);
    if (!rows.length) return { contacts: [], skipped: 0 };
    const header = rows[0].map((h) => h.trim());
    const map = {};
    header.forEach((h, i) => {
        for (const [field, re] of FIELDS) if (re.test(h) && map[field] === undefined) map[field] = i;
    });
    const hasHeader = map.email !== undefined || map.phone !== undefined;
    const body = hasHeader ? rows.slice(1) : rows;
    const contacts = [];
    let skipped = 0;
    for (const r of body) {
        const c = {};
        if (hasHeader) {
            for (const [field] of FIELDS) if (map[field] !== undefined) c[field] = r[map[field]] || '';
        } else {
            c.email = r.find((v) => EMAIL_RE.test(v)) || '';
            c.phone = r.find((v) => v.replace(/\D/g, '').length >= 10 && !EMAIL_RE.test(v)) || '';
        }
        c.email = String(c.email || '').trim().toLowerCase();
        if (c.email && !EMAIL_RE.test(c.email)) c.email = '';
        if (c.downlines !== undefined) c.downlines = /^\d+$/.test(String(c.downlines).trim()) ? String(c.downlines).trim() : '';
        if (!c.email && !String(c.phone || '').replace(/\D/g, '')) { skipped++; continue; }
        contacts.push(c);
    }
    return { contacts, skipped };
}
