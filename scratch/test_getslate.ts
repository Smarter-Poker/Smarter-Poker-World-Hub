import { getSlate } from './src/lib/mlb_data.js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function run() {
    try {
        const slate = await getSlate('2026-06-19');
        console.log("Slate length:", slate?.length);
        if (slate?.length > 0) {
            console.log("First item sample:", JSON.stringify(slate[0]).substring(0, 200));
        }
    } catch (e) {
        console.error("Error:", e);
    }
}
run();
