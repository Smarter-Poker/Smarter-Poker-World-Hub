const fs = require('fs');
const p = 'pages/hub/series/[id].js';
let c = fs.readFileSync(p, 'utf8');

c = c.replace(/import eventBus from '\.\.\/\.\.\/\.\.\/src\/lib\/eventBus';/, "import { eventBus } from '../../../src/engine/EventBus';");
fs.writeFileSync(p, c);
