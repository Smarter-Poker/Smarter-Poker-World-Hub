const fs = require('fs');
const { Client } = require('pg');
const { execSync } = require('child_process');

console.log('Extracting DATABASE_URL explicitly from Vercel production environment...');

let connStr = "";
try {
    // Pull just the DATABASE_URL value from Vercel. 
    // Warning: Must have vercel linked.
    const vercelOut = execSync('npx vercel env ls DATABASE_URL production', { encoding: 'utf-8' });

    // Vercel env ls outputs a table. The value is usually masked or not easily parsable. 
    // We can pull it direct using `vercel env pull` to a temp file, or it prints it to stdout.
    console.log("Vercel env ls output:", vercelOut);

    // Safer approach: use `vercel env pull` to a custom file and parse it.
    execSync('npx vercel env pull .env.vercel-db --environment production');

    const envFile = fs.readFileSync('.env.vercel-db', 'utf-8');
    const match = envFile.match(/DATABASE_URL="(.*?)"/);
    if (match) {
        connStr = match[1];
    } else {
        // Try unquoted
        const match2 = envFile.match(/DATABASE_URL=(.*)/);
        if (match2) connStr = match2[1];
    }

} catch (e) {
    console.error("Vercel extraction failed", e.message);
    process.exit(1);
}


if (!connStr) {
    console.error("No DATABASE_URL found! We are locked out.");
    process.exit(1);
}

console.log(`Trying connection to ${connStr.split('@')[1]}...`);
const sql = fs.readFileSync('supabase/migrations/20260309162811_hotfix_rpc_diamond_column.sql', 'utf-8');

async function run() {
    const client = new Client({
        connectionString: connStr,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 10000
    });

    try {
        await client.connect();
        console.log('CONNECTED to Supabase DB!');

        console.log('Executing DDL Patch...');
        await client.query(sql);
        console.log('✅ PATCH APPLIED SUCCESSFULLY. The add_diamonds_to_balance RPC is now fixed.');

    } catch (err) {
        console.error('❌ DB EXECUTION FAILED:', err.message);
    } finally {
        await client.end();
    }
}

run();
