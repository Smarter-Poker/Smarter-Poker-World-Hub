/**
 * FIX ALL SEOHead IMPORT PATHS
 * Walks all pages/ and computes the correct path from each file to src/components/seo/SEOHead
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAGES_DIR = path.join(__dirname, '..', 'pages');
const PROJECT_ROOT = path.join(__dirname, '..');

function walkDir(dir) {
    const results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules') continue;
            results.push(...walkDir(fullPath));
        } else if (entry.name.endsWith('.js') || entry.name.endsWith('.jsx')) {
            results.push(fullPath);
        }
    }
    return results;
}

const allFiles = walkDir(PAGES_DIR);
let fixed = 0;

for (const filePath of allFiles) {
    let content = fs.readFileSync(filePath, 'utf8');

    // Only process files with SEOHead import
    const match = content.match(/import\s+(?:SEOHead|SEOHead,\s*\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/);
    if (!match) continue;

    const currentImport = match[1];

    // Calculate correct relative path from this file to SEOHead
    const fileDir = path.dirname(filePath);
    const seoHeadPath = path.join(PROJECT_ROOT, 'src', 'components', 'seo', 'SEOHead');
    const correctRelative = path.relative(fileDir, seoHeadPath);
    const correctImport = correctRelative.startsWith('.') ? correctRelative : './' + correctRelative;

    if (currentImport !== correctImport) {
        content = content.replace(currentImport, correctImport);
        fs.writeFileSync(filePath, content);
        const relPath = path.relative(PAGES_DIR, filePath);
        console.log(`  🔧 ${relPath}: "${currentImport}" → "${correctImport}"`);
        fixed++;
    }
}

console.log(`\n  Fixed ${fixed} import paths`);
