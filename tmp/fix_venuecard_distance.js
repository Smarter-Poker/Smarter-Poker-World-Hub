const fs = require('fs');
const p = 'src/components/poker-near-me/VenueCard.js';
let c = fs.readFileSync(p, 'utf8');

c = c.replace(/                    \{venue\.distance_mi && \(/, "                    {venue.distance_mi != null && (");
fs.writeFileSync(p, c);
