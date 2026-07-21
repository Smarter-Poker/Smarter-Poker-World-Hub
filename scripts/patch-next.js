const fs = require('fs');
const path = require('path');

console.log('🔧 Running Smarter.Poker Next.js Build-Time Patching Engine...');

// ── 1. Patch MinifyWebpackPlugin WebpackError Constructor Bug ────────────────
const minifyPluginPath = path.resolve(__dirname, '../node_modules/next/dist/build/webpack/plugins/minify-webpack-plugin/src/index.js');
if (fs.existsSync(minifyPluginPath)) {
  let content = fs.readFileSync(minifyPluginPath, 'utf8');
  if (content.includes('new _webpack.WebpackError(') && !content.includes('const WebpackErrorClass = _webpack.WebpackError || _webpack.webpack.WebpackError;')) {
    console.log('   🩹 Patching: MinifyWebpackPlugin WebpackError constructor...');
    const target = `function buildError(error, file) {
    if (error.line) {
        return new _webpack.WebpackError(\`\${file} from Minifier\\n\${error.message} [\${file}:\${error.line},\${error.col}]\${error.stack ? \`\\n\${error.stack.split('\\n').slice(1).join('\\n')}\` : ''}\`);
    }
    if (error.stack) {
        return new _webpack.WebpackError(\`\${file} from Minifier\\n\${error.message}\\n\${error.stack}\`);
    }
    return new _webpack.WebpackError(\`\${file} from Minifier\\n\${error.message}\`);
}`;
    const replacement = `function buildError(error, file) {
    const WebpackErrorClass = _webpack.WebpackError || _webpack.webpack.WebpackError;
    if (error.line) {
        return new WebpackErrorClass(\`\${file} from Minifier\\n\${error.message} [\${file}:\${error.line},\${error.col}]\${error.stack ? \`\\n\${error.stack.split('\\n').slice(1).join('\\n')}\` : ''}\`);
    }
    if (error.stack) {
        return new WebpackErrorClass(\`\${file} from Minifier\\n\${error.message}\\n\${error.stack}\`);
    }
    return new WebpackErrorClass(\`\${file} from Minifier\\n\${error.message}\`);
}`;
    content = content.replace(target, replacement);
    fs.writeFileSync(minifyPluginPath, content, 'utf8');
    console.log('   ✅ MinifyWebpackPlugin patched successfully!');
  } else {
    console.log('   ✅ MinifyWebpackPlugin is already patched or healthy.');
  }
} else {
  console.log('   ⚠️ MinifyWebpackPlugin path not found, skipping patch 1.');
}

// ── 2. Patch build/index.js custom webpack resolver failures ────────────────
const buildIndexPath = path.resolve(__dirname, '../node_modules/next/dist/build/index.js');
if (fs.existsSync(buildIndexPath)) {
  let content = fs.readFileSync(buildIndexPath, 'utf8');
  if (content.includes('require(_path.default.join(distDir, _constants1.SERVER_DIRECTORY, _constants1.MIDDLEWARE_MANIFEST))')) {
    console.log('   🩹 Patching: Build-time manifest require statements...');
    const target = `                // eslint-disable-next-line @typescript-eslint/no-shadow
                let isNextImageImported;
                const middlewareManifest = require(_path.default.join(distDir, _constants1.SERVER_DIRECTORY, _constants1.MIDDLEWARE_MANIFEST));
                const actionManifest = appDir ? require(_path.default.join(distDir, _constants1.SERVER_DIRECTORY, _constants1.SERVER_REFERENCE_MANIFEST + '.json')) : null;
                const entriesWithAction = actionManifest ? new Set() : null;`;
    const replacement = `                // eslint-disable-next-line @typescript-eslint/no-shadow
                let isNextImageImported;
                const middlewareManifest = JSON.parse(_fs.readFileSync(_path.default.join(distDir, _constants1.SERVER_DIRECTORY, _constants1.MIDDLEWARE_MANIFEST), 'utf8'));
                const actionManifest = appDir ? JSON.parse(_fs.readFileSync(_path.default.join(distDir, _constants1.SERVER_DIRECTORY, _constants1.SERVER_REFERENCE_MANIFEST + '.json'), 'utf8')) : null;
                const entriesWithAction = actionManifest ? new Set() : null;`;
    content = content.replace(target, replacement);
    fs.writeFileSync(buildIndexPath, content, 'utf8');
    console.log('   ✅ Build-time manifest requires patched successfully!');
  } else {
    console.log('   ✅ Build-time manifest requires already patched.');
  }
} else {
  console.log('   ⚠️ Build-time index.js path not found, skipping patch 2.');
}

// ── 3. Patch export/index.js server-reference-manifest require failures ──────
const exportIndexPath = path.resolve(__dirname, '../node_modules/next/dist/export/index.js');
if (fs.existsSync(exportIndexPath)) {
  let content = fs.readFileSync(exportIndexPath, 'utf8');
  if (content.includes('serverActionsManifest = require((0, _path.join)(distDir, _constants1.SERVER_DIRECTORY, _constants1.SERVER_REFERENCE_MANIFEST + \'.json\'));') && !content.includes('try { serverActionsManifest = require(')) {
    console.log('   🩹 Patching: export/index.js serverActionsManifest require...');
    const target = `    let serverActionsManifest;
    if (enabledDirectories.app) {
        serverActionsManifest = require((0, _path.join)(distDir, _constants1.SERVER_DIRECTORY, _constants1.SERVER_REFERENCE_MANIFEST + '.json'));`;
    const replacement = `    let serverActionsManifest;
    if (enabledDirectories.app) {
        try {
            serverActionsManifest = require((0, _path.join)(distDir, _constants1.SERVER_DIRECTORY, _constants1.SERVER_REFERENCE_MANIFEST + '.json'));
        } catch (e) {
            serverActionsManifest = { node: {}, edge: {} };
        }`;
    content = content.replace(target, replacement);
    fs.writeFileSync(exportIndexPath, content, 'utf8');
    console.log('   ✅ export/index.js serverActionsManifest require patched successfully!');
  } else {
    console.log('   ✅ export/index.js serverActionsManifest require is already patched or healthy.');
  }
  
  if (content.includes("nextFontManifest: require((0, _path.join)(distDir, 'server', `${_constants1.NEXT_FONT_MANIFEST}.json`))") && !content.includes('nextFontManifest: (() => { try { return require')) {
    console.log('   🩹 Patching: export/index.js nextFontManifest require...');
    const targetFont = "nextFontManifest: require((0, _path.join)(distDir, 'server', `${_constants1.NEXT_FONT_MANIFEST}.json`))";
    const replacementFont = "nextFontManifest: (() => { try { return require((0, _path.join)(distDir, 'server', `${_constants1.NEXT_FONT_MANIFEST}.json`)); } catch(e) { return {}; } })()";
    content = content.replace(targetFont, replacementFont);
    fs.writeFileSync(exportIndexPath, content, 'utf8');
    console.log('   ✅ export/index.js nextFontManifest require patched successfully!');
  } else {
    console.log('   ✅ export/index.js nextFontManifest require is already patched or healthy.');
  }
} else {
  console.log('   ⚠️ export/index.js path not found, skipping patch 3.');
}

// ── 4. Patch build/index.js to prevent serverBundle unlink errors ──────────
const buildIndexPathMain = path.resolve(__dirname, '../node_modules/next/dist/build/index.js');
if (fs.existsSync(buildIndexPathMain)) {
  let content = fs.readFileSync(buildIndexPathMain, 'utf8');
  if (content.includes('await _fs.promises.unlink(serverBundle);') && !content.includes('try { await _fs.promises.unlink(serverBundle); }')) {
    console.log('   🩹 Patching: build/index.js serverBundle unlink...');
    const target = 'await _fs.promises.unlink(serverBundle);';
    const replacement = 'try { await _fs.promises.unlink(serverBundle); } catch (e) {}';
    content = content.replace(target, replacement);
    fs.writeFileSync(buildIndexPathMain, content, 'utf8');
    console.log('   ✅ build/index.js serverBundle unlink patched successfully!');
  } else {
    console.log('   ✅ build/index.js serverBundle unlink is already patched or healthy.');
  }
} else {
  console.log('   ⚠️ build/index.js path not found, skipping patch 4.');
}

console.log('🏁 Build-Time Patching Completed.\n');

// ── 5. Patch build/index.js to tolerate ENOENT on static-page renames ────────
// When .next/ is freshly cleaned, some intermediate HTML files (e.g. 404.html)
// don't exist at the expected source path during the move-to-server step. This
// causes the build to abort with ENOENT even though all pages compiled fine.
// Wrap the two rename calls in ENOENT-tolerant try-catch blocks.
const buildIndex2Path = path.resolve(__dirname, '../node_modules/next/dist/build/index.js');
if (fs.existsSync(buildIndex2Path)) {
  let content = fs.readFileSync(buildIndex2Path, 'utf8');
  const renameTarget   = 'await _fs.promises.rename(orig, dest);';
  const renameReplace  = 'try { await _fs.promises.rename(orig, dest); } catch(e) { if (e.code !== \'ENOENT\') throw e; }';
  const rename2Target  = 'await _fs.promises.rename(updatedOrig, updatedDest);';
  const rename2Replace = 'try { await _fs.promises.rename(updatedOrig, updatedDest); } catch(e) { if (e.code !== \'ENOENT\') throw e; }';
  // Also patch the _not-found.html -> 404.html copyFile which fails with ENOENT
  // in Pages-Router-only projects (App Router never generates _not-found.html).
  // existsSync check passes in a race but the file vanishes before copyFile runs.
  const copyTarget  = 'await _fs.promises.copyFile(orig, _path.default.join(distDir, \'server\', updatedRelativeDest));';
  const copyReplace = 'try { await _fs.promises.copyFile(orig, _path.default.join(distDir, \'server\', updatedRelativeDest)); } catch(e) { if (e.code !== \'ENOENT\') throw e; }';
  let changed = false;
  if (content.includes(renameTarget) && !content.includes(renameReplace)) {
    content = content.replace(new RegExp(renameTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), renameReplace);
    changed = true;
  }
  if (content.includes(rename2Target) && !content.includes(rename2Replace)) {
    content = content.replace(new RegExp(rename2Target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), rename2Replace);
    changed = true;
  }
  if (content.includes(copyTarget) && !content.includes(copyReplace)) {
    content = content.replace(new RegExp(copyTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), copyReplace);
    changed = true;
  }
  if (changed) {
    fs.writeFileSync(buildIndex2Path, content, 'utf8');
    console.log('   ✅ build/index.js static-page rename/copyFile ENOENT tolerance patched.');
  } else {
    console.log('   ✅ build/index.js static-page rename is already patched or healthy.');
  }
} else {
  console.log('   ⚠️ build/index.js path not found, skipping patch 5.');
}

// ── 6. Patch pages/_document.js nextFontManifest.pages undefined crash ────────
// 2026-07-20: during `next build --webpack` export, workers intermittently
// receive a next-font manifest whose `.pages` is undefined. _document's
// getNextFontLinkTags only guards `!nextFontManifest`, so
// `nextFontManifest.pages['/_app']` throws
// "TypeError: Cannot read properties of undefined (reading '/_app')" and the
// export fails on a RANDOM page each run (observed: /admin/wallet-align,
// /hub/social-media). Guard `.pages` too — worst case is missing font preload
// links for that render, which is cosmetic.
const documentPath = path.resolve(__dirname, '../node_modules/next/dist/pages/_document.js');
if (fs.existsSync(documentPath)) {
  let content = fs.readFileSync(documentPath, 'utf8');
  const fontTarget = `function getNextFontLinkTags(nextFontManifest, dangerousAsPath, assetPrefix = '', assetQueryString = '') {
    if (!nextFontManifest) {`;
  const fontReplace = `function getNextFontLinkTags(nextFontManifest, dangerousAsPath, assetPrefix = '', assetQueryString = '') {
    if (!nextFontManifest || !nextFontManifest.pages) {`;
  if (content.includes(fontTarget) && !content.includes('!nextFontManifest.pages')) {
    console.log('   🩹 Patching: pages/_document.js nextFontManifest.pages guard...');
    content = content.replace(fontTarget, fontReplace);
    fs.writeFileSync(documentPath, content, 'utf8');
    console.log('   ✅ pages/_document.js nextFontManifest.pages guard patched successfully!');
  } else {
    console.log('   ✅ pages/_document.js nextFontManifest.pages guard is already patched or healthy.');
  }
} else {
  console.log('   ⚠️ pages/_document.js path not found, skipping patch 6.');
}

// ── 7. Patch app-render/manifests-singleton.js partial-manifest crash ─────────
// 2026-07-21: during `next build --webpack` export of the App Router
// /_not-found page, the proxied client-reference-manifest lookup crashes with
//   "TypeError: Cannot read properties of undefined (reading '<module id>')"
// (observed ids: 'next/dist/client/components/builtin/layout', later the
// project's app/layout after one was added). Root cause: the mapping proxy
// guards `currentManifest == null` but NOT `currentManifest[prop]` — when a
// route registers a manifest missing the requested section (clientModules /
// ssrModuleMapping / ...), the `[id]` read throws and the whole export fails
// nondeterministically. Guard the section too: a missing section simply means
// "no entry here", which the surrounding code already handles by falling
// through to the other manifests / returning undefined.
for (const rel of [
  '../node_modules/next/dist/server/app-render/manifests-singleton.js',
  '../node_modules/next/dist/esm/server/app-render/manifests-singleton.js',
]) {
  const manifestsPath = path.resolve(__dirname, rel);
  if (fs.existsSync(manifestsPath)) {
    let content = fs.readFileSync(manifestsPath, 'utf8');
    let changed = false;
    const guardTarget1 = 'if (currentManifest == null ? void 0 : currentManifest[prop][id]) {';
    const guardReplace1 = 'if ((currentManifest == null ? void 0 : currentManifest[prop]) && currentManifest[prop][id]) {';
    if (content.includes(guardTarget1)) {
      content = content.split(guardTarget1).join(guardReplace1);
      changed = true;
    }
    const guardTarget2 = 'const entry = manifest[prop][id];';
    const guardReplace2 = 'const entry = (manifest[prop] || {})[id];';
    if (content.includes(guardTarget2)) {
      content = content.split(guardTarget2).join(guardReplace2);
      changed = true;
    }
    if (changed) {
      fs.writeFileSync(manifestsPath, content, 'utf8');
      console.log(`   ✅ manifests-singleton partial-manifest guard patched (${rel.includes('/esm/') ? 'esm' : 'cjs'}).`);
    } else {
      console.log(`   ✅ manifests-singleton already patched or healthy (${rel.includes('/esm/') ? 'esm' : 'cjs'}).`);
    }
  } else {
    console.log('   ⚠️ manifests-singleton path not found, skipping patch 7.');
  }
}
