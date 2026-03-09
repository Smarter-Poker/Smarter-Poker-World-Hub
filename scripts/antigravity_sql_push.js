const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const args = process.argv.slice(2);
if (args.length === 0) {
    console.error('Usage: npm run db:push <path_to_sql_file_or_directory>');
    process.exit(1);
}

const targetPath = path.resolve(args[0]);
let sqlFiles = [];

if (fs.statSync(targetPath).isDirectory()) {
    sqlFiles = fs.readdirSync(targetPath)
        .filter(f => f.endsWith('.sql'))
        .map(f => path.join(targetPath, f))
        .sort(); // Run in alphabetical order
} else {
    sqlFiles = [targetPath];
}

if (sqlFiles.length === 0) {
    console.error(`No .sql files found at ${targetPath}`);
    process.exit(1);
}

const passwords = ['215SlalomCt!', 'Bek454545!!', 'gbpAM0n7jNBzY4Co'];
const projectRef = 'kuklfnapbkmacvwxktbh';

// Use the native 5432 listener to bypass IPv4 pooler blockers (ECONNREFUSED)
const connStrings = passwords.map(pw => `postgresql://postgres:${pw}@db.${projectRef}.supabase.co:5432/postgres`);

async function tryConnect(connStr) {
    const pool = new Pool({
        connectionString: connStr,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000
    });
    const client = await pool.connect();
    return { client, pool };
}

async function run() {
    let client, pool;

    for (const cs of connStrings) {
        const masked = cs.substring(0, 30) + '...';
        try {
            console.log(`[Anti-Gravity DB Push] Authenticating against native Postgres via IPv6 (:5432)...`);
            ({ client, pool } = await tryConnect(cs));
            console.log('✅ Connected successfully to production database.');
            break;
        } catch (e) {
            // Silently swallow auth failures and try the next known password key
        }
    }

    if (!client) {
        console.error('\n❌ CRITICAL: Could not connect to Postgres natively. Check credentials.');
        process.exit(1);
    }

    let successCount = 0;

    for (const sqlFile of sqlFiles) {
        console.log(`\n▶️ Executing SQL: ${path.basename(sqlFile)}`);
        const sql = fs.readFileSync(sqlFile, 'utf-8');
        try {
            await client.query(sql);
            console.log(`✅ Success: ${path.basename(sqlFile)} deployed.`);
            
            // Extract version from filename assuming pattern YYYYMMDD_name.sql
            const versionMatch = path.basename(sqlFile).match(/^(\d{14})/);
            if (versionMatch) {
               try {
                  await client.query(`INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('${versionMatch[1]}') ON CONFLICT DO NOTHING;`);
                  console.log(`   (Migration history synced for ${versionMatch[1]})`);
               } catch(e) {}
            }
            successCount++;
        } catch (e) {
            console.error(`❌ SQL Execution Error in ${path.basename(sqlFile)}:`, e.message);
        }
    }

    client.release();
    await pool.end();

    if (successCount === sqlFiles.length) {
        console.log(`\n🎉 All ${successCount} SQL migrations applied flawlessly.`);
        process.exit(0);
    } else {
         console.error(`\n⚠️ Finished with errors. ${successCount}/${sqlFiles.length} applied.`);
         process.exit(1);
    }
}

run().catch(e => {
    console.error('Fatal Error:', e.message);
    process.exit(1);
});
