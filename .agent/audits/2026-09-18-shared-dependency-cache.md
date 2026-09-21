# Dependency caches survive the next pull request

The September 18 inventory contained 47 World Hub caches totaling 10.76 GB,
with none on main. The installing jobs run only for pull requests. GitHub
scopes their caches to the individual merge ref, so a different PR cannot
restore them. Identical packages were repeatedly installed and cached.

The existing Build Safety Gate now populates lockfile-exact Node 24 and Node 20
dependency caches on protected main pushes. Each job restores first and installs
only on a miss, with lifecycle scripts disabled. The Node 24 safety check uses
the same key as the existing browser checks. Node 20 remains separately keyed.
No application build, deployment, scheduler, cleanup loop or new credential is
introduced. Registry credentials and environment files are outside the cache.

The new regression test checks producer/consumer key compatibility, guarded
installs, trusted main-only writes, bounded execution and invocation from the
existing required safety check. It failed on the original workflow.

GitHub cache storage remains limited to 10 GB per repository. Existing
accounting/release artifacts retain their original contents and retention.
Provider execution and cross-PR cache restoration are verified separately in
the task's delivery receipt; source alone does not establish a cache hit.
