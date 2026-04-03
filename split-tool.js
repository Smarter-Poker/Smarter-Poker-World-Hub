const fs = require('fs');
const code = fs.readFileSync('pages/hub/poker-near-me.js', 'utf8');
const lines = code.split('\n');
console.log(`Read ${lines.length} lines`);

// Let's create a new component file for PNMTabs
// Or we can just create it dynamically.

