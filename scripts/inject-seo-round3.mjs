/**
 * SEO INJECTION — ROUND 3: Commander admin pages + any remaining pages with Head
 * All commander/ pages get noindex.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAGES_DIR = path.join(__dirname, '..', 'pages');

function processCommanderDirectory(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    let count = 0;

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules') continue;
            count += processCommanderDirectory(fullPath);
        } else if (entry.name.endsWith('.js') && !entry.name.startsWith('_')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            const relPath = path.relative(PAGES_DIR, fullPath).replace(/\\/g, '/');

            // Skip if already has SEOHead
            if (content.includes('SEOHead')) {
                console.log(`  ⏭  ${relPath} — already has SEOHead`);
                continue;
            }

            // Skip if no Head import
            if (!content.includes("import Head from 'next/head'")) {
                console.log(`  ⏭  ${relPath} — no Head import`);
                continue;
            }

            // Determine title from filename
            const baseName = path.basename(fullPath, '.js')
                .replace(/\[.*\]/, 'Details')
                .replace(/-/g, ' ')
                .replace(/\b\w/g, c => c.toUpperCase());
            const title = `Commander — ${baseName}`;

            // Calculate import depth
            const depth = relPath.split('/').length - 1;
            const prefix = '../'.repeat(depth);
            const importPath = `${prefix}src/components/seo/SEOHead`;

            // Replace Head import
            content = content.replace(
                /import Head from ['"]next\/head['"];?/,
                `import SEOHead from '${importPath}';`
            );

            // Replace <Head>...</Head> blocks
            const headBlockRegex = /<Head>([\s\S]*?)<\/Head>/;
            const match = content.match(headBlockRegex);
            if (match) {
                const innerContent = match[1];
                const fontLinks = innerContent.match(/<link[^>]*fonts[^>]*>/g);
                const seoAttrs = `title="${title}"\n                description="Club Commander poker room management tool."\n                noindex={true}`;

                if (fontLinks && fontLinks.length > 0) {
                    const replacement = `<SEOHead\n                ${seoAttrs}\n            >\n                ${fontLinks.join('\n                ')}\n            </SEOHead>`;
                    content = content.replace(headBlockRegex, replacement);
                } else {
                    content = content.replace(headBlockRegex, `<SEOHead\n                ${seoAttrs}\n            />`);
                }

                fs.writeFileSync(fullPath, content);
                console.log(`  ✅ ${relPath} — Commander SEO injected (noindex)`);
                count++;
            } else {
                console.log(`  ⚠  ${relPath} — has Head import but no Head block`);
            }
        }
    }
    return count;
}

console.log('═══════════════════════════════════════════════════════════════');
console.log('  SEO INJECTION — ROUND 3: Commander Admin Pages');
console.log('═══════════════════════════════════════════════════════════════\n');

const commanderDir = path.join(PAGES_DIR, 'commander');
const count = processCommanderDirectory(commanderDir);

console.log(`\n  ROUND 3 COMPLETE: ${count} Commander pages injected`);
