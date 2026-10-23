const fs = require('fs');

const file = 'src/lib/push/push-gate.js';
let content = fs.readFileSync(file, 'utf8');

const allowlistCode = `
    // ── THE OWNER ALLOWLIST (2026-10-09) ─────────────────────────────
    if (opts.recipient === '47965354-0e56-43ef-931c-ddaab82af765' || opts.recipient === '9b027798-9532-403f-a5c1-15554ce2959c') {
        const allowedTypes = [
            'accounting_invoice', 'page_completion_nudge', 'financial_attestation',
            'estate_digest', 'waitlist_seat_open', 'financial_digest', 'achievement',
            'tournament_blinding_off', 'union_invoice', 'settlement',
            'diamond_spin_settlement', 'personal_assistant_audit_complete'
        ];
        if (!allowedTypes.includes(event)) {
            return { allowed: false, reason: 'owner_unlisted_type:' + (event || 'unknown') };
        }
    }
`;

content = content.replace(
    'const key = eventToTypeKey(event);',
    'const key = eventToTypeKey(event);' + allowlistCode
);

fs.writeFileSync(file, content);
