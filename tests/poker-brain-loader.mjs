// Minimal loader hook to resolve extensionless relative imports
// (e.g., `./engine`) under pure Node ESM. The poker-brain source
// files are written for webpack/Next, which auto-resolves extensions.
// This keeps the test runnable without adding a bundler step.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as pathResolve } from 'node:path';

export async function resolve(specifier, context, nextResolve) {
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[cm]?js$/.test(specifier)) {
    const parentPath = context.parentURL ? fileURLToPath(context.parentURL) : process.cwd();
    const parentDir = dirname(parentPath);
    const candidate = pathResolve(parentDir, specifier + '.js');
    if (existsSync(candidate)) {
      return nextResolve('file://' + candidate, context);
    }
  }
  return nextResolve(specifier, context);
}
