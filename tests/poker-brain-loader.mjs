// Minimal loader hook to resolve extensionless relative imports
// (e.g., `./engine`) under pure Node ESM. The poker-brain source
// files are written for webpack/Next, which auto-resolves extensions.
// This keeps the test runnable without adding a bundler step.
//
// Also mocks browser/Next.js-specific modules (supabase, etc.) that
// cannot be loaded in a pure Node.js environment.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as pathResolve } from 'node:path';

// Modules that need to be redirected to test mocks
const MOCK_MAP = {
  '../supabase': 'tests/mocks/supabase.mjs',
};

export async function resolve(specifier, context, nextResolve) {
  // Redirect mocked modules
  if (MOCK_MAP[specifier]) {
    const mockPath = pathResolve(process.cwd(), MOCK_MAP[specifier]);
    return nextResolve('file://' + mockPath, context);
  }

  // Resolve extensionless relative imports by appending .js
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
