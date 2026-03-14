#!/usr/bin/env node
/**
 * Migration script: Replace inline getToken/getBearerToken helpers with clientAuth import.
 * 
 * Strategy:
 * 1. For files with getBearerToken: add import of getToken from clientAuth, 
 *    remove the getBearerToken definition, replace getBearerToken() calls with getToken()
 * 2. For files with inline getToken: add import of getToken from clientAuth,
 *    remove the inline getToken definition
 * 3. Also add getStaffSession import if the file uses getStaffSession() inline
 * 4. Also handle getVenueId if the file defines it inline
 * 
 * DRY RUN: node scripts/migrate-auth.js --dry
 * EXECUTE: node scripts/migrate-auth.js
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DRY_RUN = process.argv.includes('--dry');
const ROOT = path.resolve(__dirname, '..');

// ── Patterns for inline helpers ──
const BEARER_TOKEN_PATTERNS = [
  /^const getBearerToken = \(\) => typeof window !== 'undefined'\n\s*\? .*\n?/gm,
  /^const getBearerToken = \(\) => \{\n[\s\S]*?\n\s*\};?\n/gm,
  /^\s*const getBearerToken = \(\) => typeof window !== 'undefined'\n\s*\? .*\n?/gm,
];

const INLINE_GETTOKEN_PATTERNS = [
  // Arrow with SSR guard: const getToken = () => typeof window !== 'undefined'\n  ? localStorage... : null;
  /^\s*const getToken = \(\) => typeof window !== 'undefined'\n\s*\?[^\n]*\n?/gm,
  // Simple arrow: const getToken = () => localStorage.getItem(...)...;
  /^\s*const getToken = \(\) => localStorage\.getItem\([^\n]*;\n/gm,
  // Multi-line block function
  /^\s*const getToken = \(\) => \{\n[\s\S]*?\n\s*\};?\n/gm,
  // useCallback version
  /^\s*const getToken = useCallback\(\(\) => \{\n[\s\S]*?\n\s*\}, \[\]\);\n/gm,
];

function getImportPath(filePath) {
  const rel = path.relative(path.dirname(filePath), path.join(ROOT, 'src/lib/commander/clientAuth'));
  // Ensure it starts with ./ or ../
  const normalized = rel.replace(/\\/g, '/');
  return normalized.startsWith('.') ? normalized : './' + normalized;
}

function findFiles(pattern) {
  try {
    return execSync(`grep -rl "${pattern}" pages/commander/ --include="*.js"`, { cwd: ROOT, encoding: 'utf-8' })
      .trim().split('\n').filter(Boolean).map(f => path.join(ROOT, f));
  } catch { return []; }
}

// Files that already import from clientAuth 
function alreadyImportsClientAuth(content) {
  return /import.*from.*clientAuth/.test(content);
}

console.log(`Auth Migration Script ${DRY_RUN ? '(DRY RUN)' : '(LIVE)'}`);
console.log('='.repeat(60));

// Step 1: Find all files with getBearerToken
const bearerFiles = findFiles('getBearerToken');
console.log(`\nFiles with getBearerToken: ${bearerFiles.length}`);

let totalModified = 0;

for (const file of bearerFiles) {
  let content = fs.readFileSync(file, 'utf-8');
  const original = content;
  const importPath = getImportPath(file);
  
  // Skip if file already imports from clientAuth
  if (alreadyImportsClientAuth(content)) {
    console.log(`  SKIP (already imports): ${path.relative(ROOT, file)}`);
    continue;
  }

  // Remove inline getBearerToken definition
  // Pattern: const getBearerToken = () => typeof window !== 'undefined'
  //   ? (localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token') || '') : '';
  content = content.replace(
    /^(\s*)const getBearerToken = \(\) => typeof window !== 'undefined'\n\s*\? \(localStorage\.getItem\('commander_token'\) \|\| localStorage\.getItem\('sb-access-token'\) \|\| ''\) : '';\n/gm,
    ''
  );
  // Also handle patterns inside functions (indented)
  content = content.replace(
    /(\s+)const getBearerToken = \(\) => typeof window !== 'undefined'\n\s*\? \(localStorage\.getItem\('commander_token'\) \|\| localStorage\.getItem\('sb-access-token'\) \|\| ''\) : '';\n/gm,
    ''
  );

  // Replace all getBearerToken() calls with getToken()
  content = content.replace(/getBearerToken\(\)/g, 'getToken()');

  // Add import if not already present
  if (!alreadyImportsClientAuth(content)) {
    // Find the last import line
    const importLines = content.match(/^import .* from .*$/gm);
    if (importLines && importLines.length > 0) {
      const lastImport = importLines[importLines.length - 1];
      const importStatement = `import { getToken, getStaffSession } from '${importPath}';`;
      content = content.replace(lastImport, lastImport + '\n' + importStatement);
    }
  }

  if (content !== original) {
    totalModified++;
    console.log(`  MODIFIED: ${path.relative(ROOT, file)}`);
    if (!DRY_RUN) {
      fs.writeFileSync(file, content, 'utf-8');
    }
  } else {
    console.log(`  NO-CHANGE: ${path.relative(ROOT, file)}`);
  }
}

// Step 2: Find all files with inline getToken (not from clientAuth)
const tokenFiles = findFiles('const getToken = ');
console.log(`\nFiles with inline getToken: ${tokenFiles.length}`);

for (const file of tokenFiles) {
  let content = fs.readFileSync(file, 'utf-8');
  const original = content;
  const importPath = getImportPath(file);

  // Skip if file already imports from clientAuth
  if (alreadyImportsClientAuth(content)) {
    console.log(`  SKIP (already imports): ${path.relative(ROOT, file)}`);
    continue;
  }

  // Remove most common inline getToken patterns:

  // Pattern A: const getToken = () => typeof window !== 'undefined'
  //   ? localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token') : null;
  content = content.replace(
    /^(\s*)const getToken = \(\) => typeof window !== 'undefined'\n\s*\? localStorage\.getItem\('commander_token'\) \|\| localStorage\.getItem\('sb-access-token'\)[^;]*;\n/gm,
    ''
  );

  // Pattern B: const getToken = () => localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token');
  content = content.replace(
    /^(\s*)const getToken = \(\) => localStorage\.getItem\('commander_token'\) \|\| localStorage\.getItem\('sb-access-token'\);\n/gm,
    ''
  );

  // Pattern C: Multi-line block function (3-5 lines)
  content = content.replace(
    /^(\s*)const getToken = \(\) => \{\n\s*if \(typeof window === 'undefined'\) return (?:null|'');\n\s*return localStorage\.getItem\('commander_token'\) \|\| localStorage\.getItem\('sb-access-token'\)[^;]*;\n\s*\};\n/gm,
    ''
  );

  // Pattern D: useCallback version
  content = content.replace(
    /^(\s*)const getToken = useCallback\(\(\) => \{\n\s*if \(typeof window === 'undefined'\) return (?:null|'');\n\s*return localStorage\.getItem\('commander_token'\) \|\| localStorage\.getItem\('sb-access-token'\)[^;]*;\n\s*\}, \[\]\);\n/gm,
    ''
  );

  // Add import if content changed and not already present
  if (content !== original && !alreadyImportsClientAuth(content)) {
    const importLines = content.match(/^import .* from .*$/gm);
    if (importLines && importLines.length > 0) {
      const lastImport = importLines[importLines.length - 1];
      const importStatement = `import { getToken, getStaffSession } from '${importPath}';`;
      content = content.replace(lastImport, lastImport + '\n' + importStatement);
    }
  }

  if (content !== original) {
    totalModified++;
    console.log(`  MODIFIED: ${path.relative(ROOT, file)}`);
    if (!DRY_RUN) {
      fs.writeFileSync(file, content, 'utf-8');
    }
  } else {
    console.log(`  NO-CHANGE: ${path.relative(ROOT, file)}`);
  }
}

console.log(`\n${'='.repeat(60)}`);
console.log(`Total files modified: ${totalModified}`);
console.log(DRY_RUN ? 'DRY RUN — no files were changed' : 'LIVE — files were modified');
