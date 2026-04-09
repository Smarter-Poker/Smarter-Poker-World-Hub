const fs = require('fs');
const p = 'pages/hub/poker-near-me.js';
let c = fs.readFileSync(p, 'utf8');

c = c.replace(/^\s*\}\);\/\*\*/, "/**");
fs.writeFileSync(p, c);
