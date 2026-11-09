/**
 * SEO INJECTION — ROUND 4: Auth & Admin final pages
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAGES_DIR = path.join(__dirname, '..', 'pages');

const FINAL_PAGES = {
    'auth/signin.js': {
        title: 'Sign In — Smarter.Poker',
        desc: 'Sign in to Smarter.Poker — the future of poker. Training, trivia, tournaments, and more.',
        canonical: '/auth/signin',
        noindex: true,
    },
    'auth/signup.js': {
        title: 'Create Account — Smarter.Poker',
        desc: 'Join Smarter.Poker — the future of poker. Free account with training, trivia, live games, and more.',
        canonical: '/auth/signup',
        noindex: false,
    },
    'auth/forgot-password.js': {
        title: 'Reset Password — Smarter.Poker',
        desc: 'Reset your Smarter.Poker password.',
        canonical: '/auth/forgot-password',
        noindex: true,
    },
    'admin/horse-analytics.js': {
        title: 'Horse Analytics Admin',
        desc: 'Internal analytics dashboard.',
        noindex: true,
    },
};

let count = 0;

for (const [relPath, config] of Object.entries(FINAL_PAGES)) {
    const filePath = path.join(PAGES_DIR, relPath);
    let content = fs.readFileSync(filePath, 'utf8');

    if (content.includes('SEOHead')) {
        console.log(`  ⏭  ${relPath} — already processed`);
        continue;
    }

    if (!content.includes("import Head from 'next/head'")) {
        console.log(`  ⚠  ${relPath} — no Head import found`);
        continue;
    }

    const depth = relPath.split('/').length - 1;
    const prefix = depth === 0 ? './' : '../'.repeat(depth);
    const importPath = `${prefix}src/components/seo/SEOHead`;

    // Replace import
    content = content.replace(
        /import Head from ['"]next\/head['"];?/,
        `import SEOHead from '${importPath}';`
    );

    // Build replacement 
    const attrs = [];
    attrs.push(`title="${config.title}"`);
    attrs.push(`description="${config.desc}"`);
    if (config.canonical) attrs.push(`canonical="${config.canonical}"`);
    if (config.noindex) attrs.push(`noindex={true}`);

    const seoTag = `<SEOHead\n                ${attrs.join('\n                ')}\n            />`;

    // Replace Head block
    const headBlockRegex = /<Head>([\s\S]*?)<\/Head>/;
    const match = content.match(headBlockRegex);
    if (match) {
        content = content.replace(headBlockRegex, seoTag);
        fs.writeFileSync(filePath, content);
        console.log(`  ✅ ${relPath} — SEO injected`);
        count++;
    } else {
        console.log(`  ⚠  ${relPath} — no Head block found`);
    }
}

console.log(`\n  ROUND 4 COMPLETE: ${count} final pages injected`);
