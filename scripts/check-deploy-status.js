#!/usr/bin/env node
/**
 * Vercel Deploy Monitor
 * 
 * Checks for failed deployments and reports them.
 * Can be run as a cron job or manually after pushes.
 * 
 * Usage:
 *   node scripts/check-deploy-status.js
 *   node scripts/check-deploy-status.js --watch   (polls every 30s until Ready/Error)
 */

const { execSync } = require('child_process');

const COLORS = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    reset: '\x1b[0m',
    bold: '\x1b[1m',
};

function getDeployments() {
    try {
        const output = execSync('npx -y vercel ls hub-vanguard 2>/dev/null', {
            encoding: 'utf-8',
            timeout: 30000,
        });
        // Parse the deployment table
        const lines = output.split('\n').filter(l => l.includes('smarter-poker/hub-vanguard'));
        return lines.map(line => {
            const status = line.includes('● Ready') ? 'Ready'
                : line.includes('● Error') ? 'Error'
                : line.includes('● Building') ? 'Building'
                : line.includes('Canceled') ? 'Canceled'
                : 'Unknown';
            const urlMatch = line.match(/https:\/\/[^\s]+/);
            const ageMatch = line.match(/^\s*(\S+)\s/);
            return {
                age: ageMatch?.[1] || '?',
                url: urlMatch?.[0] || '',
                status,
                raw: line.trim(),
            };
        });
    } catch (e) {
        console.error(`${COLORS.red}Failed to fetch deployments:${COLORS.reset}`, e.message);
        return [];
    }
}

function displayStatus(deployments) {
    console.log(`\n${COLORS.bold}═══════════════════════════════════════════════════════`);
    console.log(`  VERCEL DEPLOYMENT STATUS — hub-vanguard`);
    console.log(`═══════════════════════════════════════════════════════${COLORS.reset}\n`);

    const latest = deployments[0];
    if (!latest) {
        console.log(`${COLORS.yellow}No deployments found.${COLORS.reset}`);
        return;
    }

    const statusColor = latest.status === 'Ready' ? COLORS.green
        : latest.status === 'Error' ? COLORS.red
        : latest.status === 'Building' ? COLORS.cyan
        : COLORS.yellow;

    console.log(`  Latest:  ${statusColor}● ${latest.status}${COLORS.reset}  (${latest.age} ago)`);
    console.log(`  URL:     ${latest.url}`);
    console.log('');

    // Count recent errors
    const recentErrors = deployments.filter(d => d.status === 'Error').length;
    const recentReady = deployments.filter(d => d.status === 'Ready').length;

    if (recentErrors > 3) {
        console.log(`${COLORS.red}  ⚠ WARNING: ${recentErrors} failed deployments detected!${COLORS.reset}`);
        console.log(`  This may indicate systemic build issues.`);
        console.log(`  Run: node -c on changed files to check for syntax errors.`);
    }

    console.log(`\n  Summary: ${COLORS.green}${recentReady} Ready${COLORS.reset} | ${COLORS.red}${recentErrors} Error${COLORS.reset} | ${deployments.length} total\n`);

    if (latest.status === 'Error') {
        console.log(`${COLORS.red}  ACTION REQUIRED: Latest deployment failed.${COLORS.reset}`);
        console.log(`  1. Check build logs: ${latest.url}`);
        console.log(`  2. Fix syntax errors and push again`);
        console.log(`  3. Or force redeploy: npm run deploy:force\n`);
        process.exit(1);
    }
}

async function watch() {
    console.log(`${COLORS.cyan}Watching for deployment completion... (Ctrl+C to stop)${COLORS.reset}\n`);
    let attempts = 0;
    const maxAttempts = 20; // 10 minutes max

    while (attempts < maxAttempts) {
        const deployments = getDeployments();
        const latest = deployments[0];

        if (latest && (latest.status === 'Ready' || latest.status === 'Error')) {
            displayStatus(deployments);
            process.exit(latest.status === 'Error' ? 1 : 0);
        }

        process.stdout.write(`  [${new Date().toLocaleTimeString()}] Status: ${latest?.status || 'Unknown'} — waiting...\r`);
        await new Promise(r => setTimeout(r, 30000));
        attempts++;
    }

    console.log(`\n${COLORS.yellow}Timed out after ${maxAttempts * 30}s. Check Vercel dashboard.${COLORS.reset}`);
}

// Main
const isWatch = process.argv.includes('--watch');

if (isWatch) {
    watch();
} else {
    const deployments = getDeployments();
    displayStatus(deployments);
}
