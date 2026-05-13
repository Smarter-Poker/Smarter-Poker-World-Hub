const fs = require('fs');
const path = '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/src/components/poker-near-me/VenueMap.jsx';
let content = fs.readFileSync(path, 'utf8');

// The venues count string
content = content.replace('{(venues || []).length} venues ready', '{(venues || []).length} Venues Ready');

// Gold colors to white/grey
// border: 1px solid rgba(212,168,83,0.3) -> border: 1px solid rgba(255,255,255,0.2)
content = content.replace(/rgba\(212,168,83,([0-9.]+)\)/g, 'rgba(255,255,255,$1)');

// Hex #d4a853 to #ffffff
content = content.replace(/#d4a853/gi, '#ffffff');

// #b8860b to #e2e8f0
content = content.replace(/#b8860b/gi, '#e2e8f0');

fs.writeFileSync(path, content);
console.log('Replaced map colors!');
