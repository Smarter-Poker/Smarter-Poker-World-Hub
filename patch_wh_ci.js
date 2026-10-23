const fs = require('fs');
const file = '.github/workflows/build-safety-gate.yml';
let content = fs.readFileSync(file, 'utf8');

const step = `      - name: Law Test (No Operational Pushes to Owner)
        run: node scripts/ci/law-test-no-operational-pushes.mjs

`;
content = content.replace('      - name: Record Start Time', step + '      - name: Record Start Time');
fs.writeFileSync(file, content);
