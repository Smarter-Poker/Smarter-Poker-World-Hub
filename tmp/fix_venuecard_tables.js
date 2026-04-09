const fs = require('fs');
const p = 'src/components/poker-near-me/VenueCard.js';
let c = fs.readFileSync(p, 'utf8');

c = c.replace(/venue\.live_data\.tables_running !== 1/g, "Number(venue.live_data.tables_running) !== 1");
c = c.replace(/g\.tables_running === 1/g, "Number(g.tables_running) === 1");

fs.writeFileSync(p, c);
