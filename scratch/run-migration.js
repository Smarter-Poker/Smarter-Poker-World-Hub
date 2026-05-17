const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const dotenvPaths = [
    path.resolve(__dirname, '..', '.env.local'),
    path.resolve(__dirname, '..', '.env.prod'),
    path.resolve(__dirname, '..', '.env.production.local'),
];
try {
    const dotenv = require('dotenv');
    for (const envPath of dotenvPaths) {
        if (fs.existsSync(envPath)) {
            dotenv.config({ path: envPath });
        }
    }
} catch (_) {}

const migrationFile = 'supabase/migrations/20260517000001_harmonize_anti_farming_age_thresholds.sql';

console.log("Running migration via child process with all loaded env...");
const child = spawn('node', ['scripts/antigravity_sql_push.js', migrationFile], {
    env: { ...process.env },
    stdio: 'inherit'
});

child.on('close', (code) => {
    console.log(`Migration child process exited with code ${code}`);
    process.exit(code);
});
