#!/usr/bin/env node
/**
 * Phase 9: Remove dead inline helper definitions from files that already import from clientAuth.
 * These are leftover definitions from Phase 7-8 where the regex didn't catch all patterns.
 * 
 * node scripts/remove-dead-helpers.js --dry
 * node scripts/remove-dead-helpers.js
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DRY_RUN = process.argv.includes('--dry');
const ROOT = path.resolve(__dirname, '..');
let totalModified = 0;

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  const original = content;
  const relPath = path.relative(ROOT, filePath);

  // Only touch files that already import from clientAuth
  if (!/import.*from.*clientAuth/.test(content)) return;

  // Add getVenueId to imports if file uses getVenueId() but only imports getToken/getStaffSession
  if (/getVenueId\(\)/.test(content) && !/getVenueId/.test(content.match(/import\s*\{([^}]+)\}\s*from[^']*clientAuth/)?.[1] || '')) {
    content = content.replace(
      /import\s*\{([^}]+)\}\s*from\s*(['"][^'"]*clientAuth['"]);?/,
      (match, imports, path) => {
        const fns = imports.split(',').map(s => s.trim()).filter(Boolean);
        if (!fns.includes('getVenueId')) fns.push('getVenueId');
        return `import { ${fns.join(', ')} } from ${path}`;
      }
    );
  }

  // Remove dead getBearerToken — module level (no indent)
  content = content.replace(
    /^const getBearerToken = \(\) => typeof window !== 'undefined'\n\s*\? \(localStorage\.getItem\('commander_token'\) \|\| localStorage\.getItem\('sb-access-token'\) \|\| ''\) : '';\n/gm,
    ''
  );
  // indented version (inside component)
  content = content.replace(
    /^\s+const getBearerToken = \(\) => typeof window !== 'undefined'\n\s*\? \(localStorage\.getItem\('commander_token'\) \|\| localStorage\.getItem\('sb-access-token'\) \|\| ''\) : '';\n/gm,
    ''
  );

  // Remove dead getToken — SSR guarded
  content = content.replace(
    /^\s*const getToken = \(\) => typeof window !== 'undefined'\n\s*\? localStorage\.getItem\('commander_token'\) \|\| localStorage\.getItem\('sb-access-token'\)[^;]*;\n/gm,
    ''
  );

  // Remove dead getToken — useCallback
  content = content.replace(
    /^\s*const getToken = useCallback\(\(\) => \{\n\s*if \(typeof window === 'undefined'\) return (?:null|'');\n\s*return localStorage\.getItem\('commander_token'\) \|\| localStorage\.getItem\('sb-access-token'\)[^;]*;\n\s*\}, \[\]\);\n/gm,
    ''
  );

  // Remove dead getVenueId — multi-line block
  content = content.replace(
    /^\s*const getVenueId = \(\) => \{\n\s*try \{\n\s*return JSON\.parse\(localStorage\.getItem\('commander_staff'\) \|\| '\{\}'\)\.venue_id[^}]*\}\n?\s*catch[^}]*\}\n?\s*\};\n/gm,
    ''
  );

  // Remove dead getVenueId — one-liner try/catch
  content = content.replace(
    /^\s*const getVenueId = \(\) => \{ try \{ return JSON\.parse\(localStorage\.getItem\('commander_staff'\) \|\| '\{\}'\)\.venue_id[^}]*\} catch[^}]*\};\n/gm,
    ''
  );

  // Clean up any resulting triple+ blank lines
  content = content.replace(/\n{3,}/g, '\n\n');

  if (content !== original) {
    totalModified++;
    console.log(`  MODIFIED: ${relPath}`);
    if (!DRY_RUN) fs.writeFileSync(filePath, content, 'utf-8');
  } else {
    console.log(`  NO-CHANGE: ${relPath}`);
  }
}

console.log(`Dead Helper Removal ${DRY_RUN ? '(DRY RUN)' : '(LIVE)'}`);
console.log('='.repeat(60));

// Find all Commander files with remaining inline defs
const files = execSync(
  `find pages/commander -name "*.js" -type f -exec grep -l "const getToken = \\|const getBearerToken = \\|const getStaffSession = \\|const getVenueId = " {} \\;`,
  { cwd: ROOT, encoding: 'utf-8' }
).trim().split('\n').filter(Boolean);

console.log(`Files with dead inline helpers: ${files.length}`);
files.forEach(f => processFile(path.join(ROOT, f)));

console.log(`\n${'='.repeat(60)}`);
console.log(`Total files modified: ${totalModified}`);
console.log(DRY_RUN ? 'DRY RUN' : 'LIVE');
