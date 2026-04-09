const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, '../pages/hub/poker-near-me-lobby.js');
let content = fs.readFileSync(p, 'utf8');

// Replace favorites[] usages with namespaced keys
content = content.replace(/!!favorites\[v\.id\]/g, "!!favorites['venue-' + v.id]");
content = content.replace(/!!favorites\[t\.id \|\| t\.tour_code\]/g, "!!favorites['tour-' + (t.id || t.tour_code)]");
content = content.replace(/!!favorites\[s\.id\]/g, "!!favorites['series-' + s.id]");

// Replace handleToggleFavorite usages
content = content.replace(/favorites\[id\]/g, "favorites[type + '-' + id]");
content = content.replace(/\[id\]: !wasFavorited/g, "[type + '-' + id]: !wasFavorited");
content = content.replace(/\[id\]: wasFavorited/g, "[type + '-' + id]: wasFavorited");

fs.writeFileSync(p, content);
console.log('Fixed favorites namespace in lobby');
