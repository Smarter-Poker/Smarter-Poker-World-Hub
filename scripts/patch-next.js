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

console.log('🏁 Build-Time Patching Completed.\n');
