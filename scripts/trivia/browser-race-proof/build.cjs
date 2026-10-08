const esbuild = require('esbuild');
const path = require('path');
const dir = __dirname;
const root = path.resolve(dir, '../../..');
module.exports = (output) =>
  esbuild.build({
    entryPoints: [path.join(dir, 'entry.jsx')],
    outfile: path.join(output, 'bundle.js'),
    bundle: true,
    jsx: 'automatic',
    loader: { '.js': 'jsx', '.css': 'local-css' },
    nodePaths: [path.join(root, 'node_modules')],
    define: { 'process.env': '{}', 'process.env.NODE_ENV': '"production"' },
    plugins: [
      {
        name: 'fixtures',
        setup(build) {
          build.onResolve({ filter: /^\/images\// }, (args) => ({
            path: args.path,
            external: true,
          }));
          build.onResolve({ filter: /^@smarter-poker\/commander-shared\// }, (args) => ({
            path: path.join(
              root,
              'node_modules/@smarter-poker/commander-shared/src',
              args.path.replace('@smarter-poker/commander-shared/', '') + '.js'
            ),
          }));
          build.onResolve(
            {
              filter:
                /(authUtils|AvatarContext|lib\/supabase$|services\/DiamondEngine|lib\/ownProfile)$/,
            },
            () => ({ path: path.join(dir, 'fixture.jsx') })
          );
          build.onResolve(
            {
              filter:
                /(seo\/SEOHead|ui\/UniversalHeader|transitions\/PageTransition|next\/router)$/,
            },
            () => ({ path: path.join(dir, 'chrome.jsx') })
          );
          build.onResolve({ filter: /hooks\/useTrainingBus$/ }, () => ({
            path: path.join(dir, 'training.js'),
          }));
        },
      },
    ],
  });
