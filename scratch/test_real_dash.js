require('dotenv').config({ path: '.env.local' });
require('ts-node').register({ transpileOnly: true });

async function run() {
    try {
        const handler = require('../pages/api/mlb/dashboard.ts').default;
        const req = { method: 'GET' };
        let statusCode = 200;
        let responseData = null;
        const res = {
            status: function(code) { statusCode = code; return this; },
            json: function(data) { responseData = data; return this; },
            setHeader: function(key, val) { return this; }
        };
        await handler(req, res);
        console.log("Status:", statusCode);
        if (responseData && responseData.slateGames) {
            console.log("slateGames length:", responseData.slateGames.length);
            console.log("error?", responseData.error);
        } else {
            console.log("Response:", responseData);
        }
    } catch (e) {
        console.error("CRASH:", e);
    }
}
run();
