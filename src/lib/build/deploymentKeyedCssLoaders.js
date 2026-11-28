/* Key Next's CSS and font loaders to the deployment they are built for.

   With Vercel skew protection on, Next bakes `?dpl=<deployment id>` into every
   url() its css-loader and next-font-loader write (fonts, images referenced
   from CSS). The id is a loader OPTION, and webpack's persistent build cache
   does not key a module on its loader options, so a build that restores
   .next/cache reuses CSS compiled for an EARLIER deployment.

   Measured on production 2026-11-27: the site-wide sheet served under
   dpl_6Gcp... carried dpl_EK4B... in all 148 of its url()s, while the HTML's
   font preloads carried dpl_6Gcp... . Every page therefore downloaded each
   preloaded font twice (once for the preload, once for the CSS that actually
   uses it), and the CSS kept pointing at a deployment that skew protection
   will eventually stop serving.

   Giving those loader entries an `ident` that contains the deployment id puts
   the id into the module request, so the cache misses for CSS (cheap) when the
   deployment changes and hits again on a rebuild of the same deployment. JS
   modules keep their cache. Reproduced and verified with two consecutive
   `next build --webpack` runs using different deploymentIds (the second kept
   the first id before this change and carries its own after it).

   Pinned by __tests__/site-wide-payload-budget.test.mjs. */

const KEYED_LOADER = /[\\/](css-loader|next-font-loader)[\\/]/;

function keyCssLoadersToDeployment(config, deploymentId) {
  if (!deploymentId || !config || !config.module || !Array.isArray(config.module.rules)) return 0;
  let keyed = 0;
  const seen = new WeakSet();

  const visitUse = (use) => {
    const list = Array.isArray(use) ? use : [use];
    for (const item of list) {
      if (!item || typeof item !== 'object' || seen.has(item)) continue;
      seen.add(item);
      if (
        typeof item.loader === 'string'
        && KEYED_LOADER.test(item.loader)
        && item.options
        && typeof item.options === 'object'
      ) {
        // Unique per entry: webpack maps an ident to ONE options object.
        item.ident = `dpl:${deploymentId}:${keyed}`;
        keyed += 1;
      }
    }
  };

  const visitRule = (rule) => {
    if (!rule || typeof rule !== 'object') return;
    if (rule.use) visitUse(rule.use);
    for (const key of ['oneOf', 'rules']) {
      if (Array.isArray(rule[key])) rule[key].forEach(visitRule);
    }
  };

  config.module.rules.forEach(visitRule);
  return keyed;
}

module.exports = { keyCssLoadersToDeployment, KEYED_LOADER };
