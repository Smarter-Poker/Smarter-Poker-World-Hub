/**
 * inject-commander-shell.js
 * Injects CommanderPageShell into every Commander subpage that doesn't
 * already have it. Safe to re-run — idempotent.
 */
const fs = require('fs');
const path = require('path');

const COMMANDER_DIR = path.join(__dirname, '../pages/hub/commander');
const SHELL_IMPORT_RE = /CommanderPageShell/;

// Compute relative import path from a given file to the shell component
function getRelativePath(filePath) {
    const fileDir = path.dirname(filePath);
    const shellPath = path.join(__dirname, '../src/components/commander/CommanderPageShell');
    let rel = path.relative(fileDir, shellPath).replace(/\\/g, '/');
    if (!rel.startsWith('.')) rel = './' + rel;
    return rel;
}

// Find depth of a file relative to COMMANDER_DIR
function getDepth(filePath) {
    const rel = path.relative(COMMANDER_DIR, filePath);
    return rel.split(path.sep).length - 1; // subtract filename itself
}

// Gather all .js files in commander, excluding the top-level index
function getAllFiles(dir) {
    const files = [];
    function walk(d) {
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
            const fullPath = path.join(d, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath);
            } else if (entry.name.endsWith('.js')) {
                // Skip the top-level commander/index.js (already has HamburgerMenu)
                if (fullPath === path.join(COMMANDER_DIR, 'index.js')) continue;
                files.push(fullPath);
            }
        }
    }
    walk(dir);
    return files;
}

function injectShell(filePath) {
    const original = fs.readFileSync(filePath, 'utf8');

    // Skip if already injected
    if (SHELL_IMPORT_RE.test(original)) {
        console.log(`  SKIP (already has shell): ${path.relative(COMMANDER_DIR, filePath)}`);
        return;
    }

    const relPath = getRelativePath(filePath);

    // 1. Add import after the last existing import line
    // Find the position of the last `import ` line
    const lines = original.split('\n');
    let lastImportIdx = -1;
    for (let i = 0; i < lines.length; i++) {
        if (/^import\s/.test(lines[i])) lastImportIdx = i;
    }

    if (lastImportIdx === -1) {
        console.log(`  WARN (no imports found): ${path.relative(COMMANDER_DIR, filePath)}`);
        return;
    }

    // Insert import line after last import
    lines.splice(lastImportIdx + 1, 0, `import CommanderPageShell from '${relPath}';`);
    const withImport = lines.join('\n');

    // 2. Find the outermost return ( in the default export function
    //    and wrap the <> or <div ... or first JSX element with <CommanderPageShell>
    //
    //    Strategy: find "return (" then wrap the first top-level JSX element.
    //    We do this by finding the pattern:  return (\n    <> or return (\n    <SomeTag
    //    and wrapping the content between return ( and the matching ) with <CommanderPageShell>
    //
    //    Since parsing JSX properly needs a parser, we use a simpler heuristic:
    //    Find the last `return (` in the file (the page component return),
    //    then insert <CommanderPageShell> right after the `(` and `</>` or closing paren.
    //
    //    Actually safest approach: find `return (` in the export default function,
    //    then look for the first `<>` or `<div` on the next non-empty line,
    //    and wrap it.

    // Find "return (" — take the LAST occurrence (the component render return)
    const returnMatch = [...withImport.matchAll(/return\s*\(\s*\n/g)];
    if (returnMatch.length === 0) {
        console.log(`  WARN (no return() found): ${path.relative(COMMANDER_DIR, filePath)}`);
        return;
    }

    // Take the last return ( as the main component render
    const lastReturn = returnMatch[returnMatch.length - 1];
    const returnEnd = lastReturn.index + lastReturn[0].length;

    // Find what's at returnEnd — should be whitespace + JSX opener
    const afterReturn = withImport.slice(returnEnd);
    const firstJSXMatch = afterReturn.match(/^(\s*)(<(?:>|[A-Z][\w.]*|[a-z][\w.]*))/);
    if (!firstJSXMatch) {
        console.log(`  WARN (can't find JSX after return): ${path.relative(COMMANDER_DIR, filePath)}`);
        return;
    }

    const indent = firstJSXMatch[1];
    const openTag = firstJSXMatch[2];

    // Insert <CommanderPageShell> right before the first JSX element
    // and </CommanderPageShell> right before the closing ) of the return
    const insertPoint = returnEnd + indent.length;

    // Find the closing ); of this return block — look for the last `    );` or `  );` near end
    // We look for the LAST occurrence of `\n  );` or `\n    );` which closes the return
    const closingParen = withImport.lastIndexOf('\n  );');
    const closingParen2 = withImport.lastIndexOf('\n    );');
    const closingIdx = Math.max(closingParen, closingParen2);

    if (closingIdx === -1) {
        console.log(`  WARN (can't find closing ); ): ${path.relative(COMMANDER_DIR, filePath)}`);
        return;
    }

    // Build the result
    const before = withImport.slice(0, insertPoint);
    const middle = withImport.slice(insertPoint, closingIdx);
    const after = withImport.slice(closingIdx);

    const result = before +
        `<CommanderPageShell>\n${indent}` +
        middle.trimEnd() +
        `\n${indent}</CommanderPageShell>` +
        after;

    fs.writeFileSync(filePath, result, 'utf8');
    console.log(`  ✅ Injected: ${path.relative(COMMANDER_DIR, filePath)}`);
}

const files = getAllFiles(COMMANDER_DIR);
console.log(`\nInjecting CommanderPageShell into ${files.length} Commander subpages...\n`);
files.forEach(injectShell);
console.log('\nDone.\n');
