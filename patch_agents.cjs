const fs = require('fs');

const rule = `
## Routing Operational Alerts
Operational alerts must never reach the owner's phone. A real alert reaches the store (public.operational_alert_events) and the board (v_ca_alert_board), never the owner's phone. Do not add triggers or code that page the owner for system issues, outages, or engine failures.
`;

for (const file of ['CLAUDE.md', 'AGENTS.md']) {
    if (fs.existsSync(file)) {
        let content = fs.readFileSync(file, 'utf8');
        if (!content.includes('Routing Operational Alerts')) {
            content += '\n' + rule;
            fs.writeFileSync(file, content);
        }
    }
}
