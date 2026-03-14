#!/usr/bin/env node
/**
 * Phase 8 Migration: Clean up remaining inline getStaffSession and getVenueId helpers.
 * 
 * Strategy:
 * 1. For files that already import from clientAuth: add getStaffSession/getVenueId to the import
 * 2. Remove inline getStaffSession/getVenueId definitions
 * 3. For files that don't import from clientAuth yet: add the import
 * 
 * DRY RUN: node scripts/migrate-helpers.js --dry
 * EXECUTE: node scripts/migrate-helpers.js
 */
const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry');
const ROOT = path.resolve(__dirname, '..');

let totalModified = 0;

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  const original = content;
  const relPath = path.relative(ROOT, filePath);

  const hasStaffSessionDef = /const getStaffSession = /.test(content);
  const hasVenueIdDef = /const getVenueId = /.test(content);
  if (!hasStaffSessionDef && !hasVenueIdDef) return;

  // Check what functions are used (to know what to import)
  const usesGetStaffSession = /getStaffSession\(\)/.test(content);
  const usesGetVenueId = /getVenueId\(\)/.test(content);

  // Build the needed imports list
  const needed = new Set();
  if (/getToken\(\)/.test(content)) needed.add('getToken');
  if (usesGetStaffSession) needed.add('getStaffSession');
  if (usesGetVenueId) needed.add('getVenueId');

  // 1. Update existing clientAuth import to include missing functions
  const importMatch = content.match(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]*clientAuth)['"]/);
  if (importMatch) {
    const currentImports = importMatch[1].split(',').map(s => s.trim()).filter(Boolean);
    const currentSet = new Set(currentImports);
    needed.forEach(fn => currentSet.add(fn));
    const newImportList = Array.from(currentSet).join(', ');
    content = content.replace(importMatch[0], `import { ${newImportList} } from '${importMatch[2]}'`);
  } else if (needed.size > 0) {
    // Need to add a new import — figure out relative path
    const dir = path.dirname(filePath);
    const clientAuthPath = path.join(ROOT, 'src/lib/commander/clientAuth');
    let rel = path.relative(dir, clientAuthPath).replace(/\\/g, '/');
    if (!rel.startsWith('.')) rel = './' + rel;
    const importLine = `import { ${Array.from(needed).join(', ')} } from '${rel}';`;
    // Add after last import
    const importLines = content.match(/^import .* from .*$/gm);
    if (importLines && importLines.length > 0) {
      const lastImport = importLines[importLines.length - 1];
      content = content.replace(lastImport, lastImport + '\n' + importLine);
    }
  }

  // 2. Remove inline getStaffSession definitions (all common patterns)
  if (hasStaffSessionDef) {
    // Pattern A: const getStaffSession = () => typeof window !== 'undefined'\n  ? localStorage... : '';
    content = content.replace(
      /^(\s*)const getStaffSession = \(\) => typeof window !== 'undefined'\n\s*\?[^\n]*\n?/gm,
      ''
    );
    // Pattern B: const getStaffSession = () => localStorage.getItem('commander_staff') || '';
    content = content.replace(
      /^(\s*)const getStaffSession = \(\) => localStorage\.getItem\('commander_staff'\) \|\| '';\n/gm,
      ''
    );
    // Pattern C: const getStaffSession = () => typeof window !== 'undefined' ? localStorage.getItem(...) : null;
    content = content.replace(
      /^(\s*)const getStaffSession = \(\) => typeof window !== 'undefined' \? localStorage\.getItem\('commander_staff'\)[^;]*;\n/gm,
      ''
    );
  }

  // 3. Remove inline getVenueId definitions (all common patterns)
  if (hasVenueIdDef) {
    // Pattern A: const getVenueId = () => { try { return JSON.parse(...)...; } catch { return ''; } };
    content = content.replace(
      /^(\s*)const getVenueId = \(\) => \{ try \{ return JSON\.parse\(localStorage\.getItem\('commander_staff'\) \|\| '\{\}'\)\.venue_id[^}]*\} catch[^}]*\};?\n/gm,
      ''
    );
    // Pattern B: one-liner try/catch
    content = content.replace(
      /^(\s*)const getVenueId = \(\) => \{ try \{ return JSON\.parse\(localStorage\.getItem\('commander_staff'\) \|\| '\{\}'\)\.venue_id \|\| '';\s*\} catch \{ return ''; \}\s*\};\n/gm,
      ''
    );
    // Pattern C: getStaff().venue_id
    content = content.replace(
      /^(\s*)const getVenueId = \(\) => getStaff\(\)\.venue_id \|\| '';\n/gm,
      ''
    );
  }

  if (content !== original) {
    totalModified++;
    console.log(`  MODIFIED: ${relPath}`);
    if (!DRY_RUN) {
      fs.writeFileSync(filePath, content, 'utf-8');
    }
  } else {
    console.log(`  NO-CHANGE: ${relPath}`);
  }
}

console.log(`Helper Migration Script ${DRY_RUN ? '(DRY RUN)' : '(LIVE)'}`);
console.log('='.repeat(60));

// Process all Commander files that have inline getStaffSession or getVenueId
const { execSync } = require('child_process');

try {
  const staffSessionFiles = execSync(`find pages/commander -name "*.js" -type f -exec grep -l "const getStaffSession = " {} \\;`, { cwd: ROOT, encoding: 'utf-8' })
    .trim().split('\n').filter(Boolean);
  console.log(`\nFiles with inline getStaffSession: ${staffSessionFiles.length}`);
  staffSessionFiles.forEach(f => processFile(path.join(ROOT, f)));
} catch { console.log('No files with inline getStaffSession'); }

try {
  const venueIdFiles = execSync(`find pages/commander -name "*.js" -type f -exec grep -l "const getVenueId = " {} \\;`, { cwd: ROOT, encoding: 'utf-8' })
    .trim().split('\n').filter(Boolean);
  console.log(`\nFiles with inline getVenueId: ${venueIdFiles.length}`);
  venueIdFiles.forEach(f => processFile(path.join(ROOT, f)));
} catch { console.log('No files with inline getVenueId'); }

console.log(`\n${'='.repeat(60)}`);
console.log(`Total files modified: ${totalModified}`);
console.log(DRY_RUN ? 'DRY RUN — no files were changed' : 'LIVE — files were modified');
