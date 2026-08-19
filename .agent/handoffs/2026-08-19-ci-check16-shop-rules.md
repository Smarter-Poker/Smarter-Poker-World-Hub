# Handoff — add CI CHECK 16 (club shop rules suite) to build-safety-gate.yml

> **STATUS: NO LONGER BLOCKING.** The suite now runs in CI anyway:
> `__tests__/_test-guards-exist.test.mjs` (already in CHECK 8's explicit list)
> imports `tests/shop-item-rules.test.mjs`, so its 20 cases execute on every CI
> run, and the file is listed in that guard's REQUIRED_TEST_FILES so deleting it
> fails the build. `scripts/pre-push-hook.sh` CHECK 0b also runs it locally on
> any push that touches the shop.
>
> The block below is still worth applying when someone has a token with the
> `workflow` permission — a named CHECK 16 is clearer in the CI log than a
> suite riding inside the signup guard — but nothing is unprotected meanwhile.
> If CHECK 16 is added, drop the import from `_test-guards-exist.test.mjs`.

**Why this is a handoff:** the PAT available to the Cowork session lacks the
GitHub `workflow` scope, so the push is rejected with
`refusing to allow a Personal Access Token to create or update workflow
.github/workflows/build-safety-gate.yml without workflow scope`.
Everything else in this change set is already on `main`. This is the one file
that needs a token (or a human) with `workflow` scope.

**What it does:** runs `tests/shop-item-rules.test.mjs` (already on main, 20
cases, passing) in CI, and fails the build if the file has been deleted.
`src/lib/club-arena/shopItemRules.js` is the single validator shared by BOTH
admin write paths; before it existed the two disagreed and items created from
the World Hub granted nothing on redeem.

**Apply:** insert this block into `.github/workflows/build-safety-gate.yml`
immediately after the `CHECK 8: Auth-critical files exist` step (i.e. right
after the line `            __tests__/scroll-lock.test.mjs`):

```yaml
      # ═══════════════════════════════════════════════════════════════
      # CHECK 16: Club shop rules regression suite
      #
      # src/lib/club-arena/shopItemRules.js is the single validator shared by
      # BOTH admin write paths (manage-shop and shop-items). Before it existed
      # the two disagreed: items created from the World Hub granted nothing on
      # redeem, accepted any image URL, and could be hard-deleted along with
      # their purchase history (the item_id FK is ON DELETE CASCADE).
      #
      # Every assertion in the suite corresponds to a defect that actually
      # shipped during the 2026-08-19 audit rounds.
      # ═══════════════════════════════════════════════════════════════
      - name: "CHECK 16: Club shop item rules"
        run: |
          if [ ! -f tests/shop-item-rules.test.mjs ]; then
            echo "::error::tests/shop-item-rules.test.mjs is missing — the guard itself was deleted."
            exit 1
          fi
          node --test tests/shop-item-rules.test.mjs
```

**Verify:** `node --test tests/shop-item-rules.test.mjs` → `# pass 20  # fail 0`.

**Related, already shipped:** `scripts/pre-push-hook.sh` gained CHECK 0, which
rejects a commit whose author Vercel cannot resolve (the cause of a day of
BLOCKED deployments). That file is not under `.github/`, so it pushed normally.
