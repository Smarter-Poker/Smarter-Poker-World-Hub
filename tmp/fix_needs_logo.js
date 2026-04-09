const fs = require('fs');
const data = JSON.parse(fs.readFileSync('tmp/needs_logo.json', 'utf8'));

for (let v of data) {
    if (v.id === 2633) v.website = 'https://thelodgepokerclub.com/';
    if (v.id === 3116) v.website = 'https://roughriderpokertour.com/';
}

fs.writeFileSync('tmp/needs_logo.json', JSON.stringify(data, null, 2));
console.log('Fixed URLs in needs_logo.json');
