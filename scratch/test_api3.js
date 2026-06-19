require('dotenv').config({ path: '.env.local' });
require('ts-node').register({ transpileOnly: true });
const { getSlate } = require('./src/lib/mlb_data.ts');

async function run() {
    try {
        console.log("Fetching slate...");
        const slate = await getSlate('2026-06-19');
        console.log("Slate length:", slate?.length);
    } catch(e) {
        console.error("ERROR:", e);
    }
}
run();
