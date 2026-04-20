const fs = require('fs');
const xml = fs.readFileSync('test-feed.xml', 'utf8');
const pureSlug = "poker-strategy-with-jonathan-little-a-costly-preflop-mistake";
const items = xml.split('<item>');
for(let i=1; i<items.length; i++) {
    const item = items[i];
    if (item.includes(pureSlug)) {
        console.log("MATCH FOUND for slug!");
        const titleMatch = item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) || item.match(/<title>([\s\S]*?)<\/title>/);
        const contentMatch = item.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/) || item.match(/<content:encoded>([\s\S]*?)<\/content:encoded>/);
        console.log("TITLE:", !!titleMatch, "CONTENT:", !!contentMatch);
    }
}
