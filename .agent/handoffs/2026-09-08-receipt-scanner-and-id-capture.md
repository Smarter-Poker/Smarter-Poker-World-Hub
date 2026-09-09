# HANDOFF: Receipt Scanner (World Hub) and ID Capture (Commander)

**Written** 2026-09-08 by the Cowork agent that built it.
**State of the work below: SHIPPED, MERGED, LIVE, EXERCISED AGAINST PRODUCTION.**
**You are not here to rebuild it. You are here for the OPEN ITEMS in section 6.**

Every number, SHA, path and count in this file was read off a command on
2026-09-08, not recalled. Where I could not verify something, it is in
section 10 under what was never proven, not asserted as fact anywhere else.

---

## 0. ORDERS

1. Read `AGENT-PLAYBOOK.md`, then `CLAUDE.md`, then
   `.agents/rules/00-agent-playbook.md`. The first and third are DIFFERENT
   files. The third is the RULE 1-8 book Dan audits against. I conflated them
   once and it cost a pass.
2. Do NOT develop in `~/Documents/Smarter-Poker-World-Hub`. That clone belongs
   to whoever is in it (on 2026-09-08 it was another agent, on branch
   `fix/the-world-hub-jackpot-said-zero`). Claim your own tree:
   ```bash
   cd ~/Documents/Smarter-Poker-World-Hub
   eval "$(bash scripts/agent-workspace.sh <you> fix/<slug>)"
   ```
3. Start with OPEN ITEM 1. It is a live production outage against paying
   users and the fix is six single-line changes.
4. One PR per item. Verify production serves each before starting the next.
   RULE 1: only `/api/health` serving your SHA counts as shipped.

---

## 1. WHAT ALREADY EXISTS (do not rebuild any of this)

### World Hub, `/hub/bankroll-manager`

| Path | Role |
|---|---|
| `src/lib/docscan/pipeline.mjs` | Detection + perspective correction. Pure, isomorphic, zero dependencies, runs under `node --test`. |
| `src/lib/docscan/scanWorker.js` | Worker entry. Same pipeline. |
| `src/lib/docscan/scanClient.js` | Worker facade, ping handshake, main-thread fallback. |
| `src/lib/docscan/imageSource.js` | Decode, EXIF orientation, memory cap, JPEG export. |
| `src/components/bankroll/DocumentScanner.jsx` | Camera, live outline, auto-capture, review, corner drag, filters. Portalled to `document.body`. |
| `src/components/bankroll/ReceiptScanner.jsx` | Upload, OCR, classification display, hand-off, abandon guard. |
| `src/components/bankroll/LiveCameraScanner.jsx` | Back-compat wrapper. Preserves `{onCapture, onClose}`. |
| `src/components/bankroll/DocumentCropper.jsx` | Back-compat wrapper. Preserves `{imageSrc, onConfirm, onCancel}`. |
| `src/lib/bankroll/receiptStorage.js` | The ONLY place that knows the bucket and object path. |
| `src/lib/bankroll/receiptRouting.mjs` | Pure. Classify, then route to a destination with a prefill. |
| `src/lib/gates/serverFeatureGate.js` | Server-side entitlement check. Fails closed. |
| `pages/api/bankroll/scan-receipt.js` | Vision OCR plus classification. |
| `__tests__/bankroll-document-scanner.test.mjs` | 46 tests. In `prebuild`. |
| `__tests__/bankroll-receipt-routing.test.mjs` | 21 tests. In `prebuild`. |

Verified 2026-09-08 in a clean worktree at `origin/main`:
```
node --test __tests__/bankroll-document-scanner.test.mjs   -> tests 46  pass 46  fail 0
node --test __tests__/bankroll-receipt-routing.test.mjs    -> tests 21  pass 21  fail 0
```

### Commander, `/commander/members`

Canonical source is the **`commander-shared` repo**. `smarter-poker-commander`
consumes a VENDORED COPY at `vendor/commander-shared/`, wired by
`"@smarter-poker/commander-shared": "file:vendor/commander-shared"`, and its
`src/components/commander/members/AddMemberModal.jsx` is a one-line re-export
shim pointing into that package.

| Path (in commander-shared) | Role |
|---|---|
| `src/lib/idscan/aamva.mjs` | AAMVA DL/ID parser. Pure. |
| `src/lib/idscan/pdf417.mjs` | Native BarcodeDetector facade, with the extension point for a WASM decoder. |
| `src/lib/docscan/*` | Same pipeline, plus the card-aspect hint (`CARD_ASPECT = 85.6/54`, `preferAspect`). |
| `src/components/commander/members/IdCaptureModal.jsx` | Front and back capture. Portalled. Nothing persists. |
| `src/components/commander/members/AddMemberModal.jsx` | Scan ID, hardware ID Scanner, or manual. |
| `tests/aamva.test.mjs`, `tests/idCapture.test.mjs` | 57 tests in that repo. |

---

## 2. THE FOUR ROOT CAUSES ALREADY FIXED

Understand these four or you will reintroduce them.

**1. The `images` bucket has no INSERT policy.**
Storage RLS allows INSERT only to `avatars, live-recordings, messenger_media,
social-media, stories, uploads, user-media`. `images` is not on that list, so
every browser upload to it returns `403 new row violates row-level security
policy`. Its ~117 existing objects predate the allowlist. Bankroll images now
go to `user-media/<uid>/bankroll/...` because that policy is
`foldername(name)[1] = auth.uid()`. **The leading `<uid>/` segment is
load-bearing, not decoration.** Everything about the bucket lives in
`receiptStorage.js` so the next move is one edit.

**2. `checkFeatureAccess` is a BROWSER gate being called from API routes.**
It reads `localStorage` (absent in Node), queries with the anon client (whose
RLS then refuses `profiles`), then "recovers" by fetching a RELATIVE url Node
cannot resolve. All three paths fail, it returns `hasAccess:false`, and the
route answers 403 to every user, including a VIP account holding 494,455
diamonds. `serverFeatureGate.js` replaces it: VIP first (honouring
`vip_expires_at`, with a 42703 fallback if the column is missing), then a
`daily_unlock_all` pass, then a feature pass. It fails CLOSED on error.

**3. Model ids in this repo are decorative.**
`grok-2-vision-latest` is rejected by the API. So is `grok-2-vision-1212`,
which I copied from a route that demonstrably works. The reason that route
works is that it goes through `getGrokClient()`, whose `MODEL_MAP` has NO
vision entry, so any unknown name falls through to the default and **`grok-3`
is what actually reads the image.** Always go through `getGrokClient()`. Never
hand-roll a fetch to `api.x.ai` with a model string you found in a file.

**4. A z-index cannot escape its stacking context.**
`ReceiptScanner` renders inside `.bankroll-modal-overlay`
(`position:fixed; z-index:9000`), which IS a stacking context. The global
header is `sticky; z-index:10050`. Raising the scanner from 10001 to 99999
changed NOTHING, measured twice on production, and its close button stayed
unclickable. Fixed with `createPortal(tree, document.body)`. The identical bug
sat in commander's `IdCaptureModal`, trapped inside `AddMemberModal`'s `z-50`,
and took the identical fix. **Symptom to recognise: the overlay paints but you
cannot click it.**

---

## 3. EVIDENCE (measured, not claimed)

Against `https://smarter.poker` signed in as Dan, 2026-09-08:

```
storage POST  -> 200   user-media/47965354-.../bankroll/1788886291436_0fsmsjcan.jpg
scan-receipt  -> 200   {"success":true,"document_type":"tournament_buyin",
                        "confidence":95,"buy_in":300,"fee":40,
                        "tournament_name":"Event #12 Sunday Deep Stack NLH"}
form          ->       Buy-In ($) = 300        <- the SESSION field, not an expense
                       venue = BELLAGIO POKER ROOM,  date = 2026-03-15
```
The $40 fee is correctly excluded from the buy-in field.

Hostile-state run, same session, per RULE 8:
- Three dead legacy `localStorage` keys injected and confirmed present: no effect.
- First storage POST forced to throw `Failed to fetch`:
  `attempt 1 FORCED NETWORK DROP` then `attempt 2 -> 200`. The user saw no
  error and the scan was never lost. OCR still returned 200 **because it runs
  in parallel with the upload, not after it.**
- Stale deep bookmarks `?tab=receipts&legacy=1` and `#scan`: both 200.
- Injected keys removed afterwards; real auth left intact.

Commander: the shipped production chunk was fetched and confirmed to contain
the privacy banner, the AAMVA parser and `createPortal`.

---

## 4. SHAs AND PULL REQUESTS (read 2026-09-08)

```
World Hub  main = 187ea197706ecb2f1ae5e1761b7b888211359eb3
World Hub  /api/health version = 187ea197706ecb2f1ae5e1761b7b888211359eb3   IDENTICAL
commander        main = c6bf4e9c0106671f6b41c3a8331a89adb1ce1d38
commander-shared main = a828dcd1243262468147d07ae4e60d052f88a49f
```

All twelve pull requests are MERGED (confirmed by `gh pr view`, one at a time):

| Repo | PR | Title |
|---|---|---|
| World Hub | #1592 | real document scanner for receipt capture |
| World Hub | #1609 | scanner defects found auditing what shipped |
| World Hub | #1612 | portal the scanner out of its parent stacking context |
| World Hub | #1619 | the scan saves, and reads itself |
| World Hub | #1623 | smart receipt classification and routing |
| World Hub | #1629 | OCR model fix |
| commander-shared | #65 | read ID details from a tablet camera or a hardware scanner |
| commander-shared | #66 | three defects found auditing what shipped |
| commander-shared | #67 | portal the capture modal out of its parent stacking context |
| commander | #122 | vendor ID capture from commander-shared |
| commander | #123 | vendor the ID capture audit fixes |
| commander | #124 | vendor the ID capture portal fix |

---

## 5. TRAPS IN THIS ESTATE (each of these cost me real time)

| Trap | What it looks like | What to do |
|---|---|---|
| **Squash-merge divergence** | `agent-autopilot.yml` squashes within about two minutes. Your branch then conflicts with `main` over files you already merged, and the diff shows DIRTY on things you never touched. | `git merge origin/main`, resolve hunk by hunk, and verify nothing `main` legitimately removed is being resurrected. I hit this three times. Never `--ours` a whole file. |
| **Merged is not landed (10.7)** | A push to an already-merged branch exits 0 and reaches nobody. | New branch off current `main` for every follow-up. `scripts/guard-merged-branch.sh` refuses it from `.husky/pre-push`. Verify files, not ticks: `git cat-file -e origin/main:<path>`. |
| **Pre-rebase hook** | `git rebase origin/main` is refused outright. | Use `git merge origin/main`. |
| **`_test-guards-exist`** | CI fails if any `__tests__/*.test.mjs` is not executed by a script. It rejected PR #1592 for exactly this. | Append new suites to `prebuild` in `package.json`. |
| **Title-case check** | `scripts/ci/check-title-case.mjs` fails on sentence-case UI copy. Scope is `pages, src, app, components`. | Title Case Forward-Facing Strings. |
| **Comment vs code in tests** | A test that greps the source for a defect will match the comment you wrote explaining that defect, and pass or fail for the wrong reason. Bit me repeatedly. | Strip comments first. Both new suites carry a `code()` helper that does. |
| **Em dashes** | `scripts/ci/check-ui-text.mjs` fails on them. Scope is `pages, src, app, components, lib, public`, extensions ts/tsx/js/jsx/css/html. `.agent/**` is NOT scanned, which is why this file may use them. | Hyphens in source. |
| **`.env.local`** | A fresh worktree has none. Builds emit Supabase FATALs and can stall. | `cp ~/Documents/Smarter-Poker-World-Hub/.env.local .` It is gitignored. Never commit it, never paste a value anywhere. |
| **`npm ci` rolls back** | Puppeteer's browser download is blocked on this Mac and takes the whole install down with it. | `PUPPETEER_SKIP_DOWNLOAD=1 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci` |
| **Long commands are killed** | The host shell tool times out near 90 seconds and kills backgrounded jobs with it. | Run builds and pushes inside `tmux new-session -d -s <name> "..."` and poll a log file. |
| **Sandbox git does not work** | The Linux sandbox cannot run git against a worktree, because `.git` there is a file pointing elsewhere. | Use the host terminal for anything git. |
| **`node` not on PATH in the host shell** | Bare `node --test` returns `command not found`. | Prefix with `export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"` and the nvm bin. |

---

## 6. OPEN ITEMS. THIS IS YOUR WORK.

### ITEM 1 (HIGHEST VALUE): six premium API routes 403 for every user

Root cause 2 is fixed in exactly one route. These six still call the browser
gate server-side, so they refuse everyone, VIP included. Confirmed 2026-09-08
by counting real calls on `origin/main`, one call in each:

```
pages/api/poker/player-notes.js            checkFeatureAccess(user.id,      'bankroll_pro')
pages/api/bankroll/export.js               checkFeatureAccess(_authUser.id, 'bankroll_pro')
pages/api/bankroll/tax-report.js           checkFeatureAccess(user.id,      'bankroll_pro')
pages/api/bankroll/projection.js           checkFeatureAccess(userId,       'bankroll_pro')
pages/api/bankroll/export-pdf.js           checkFeatureAccess(userId,       'bankroll_pro')
pages/api/bankroll/scan-dealer-document.js checkFeatureAccess(user.id,      'bankroll_pro')
```
`scan-receipt.js` shows zero real calls; its only remaining occurrence of that
name is inside the comment explaining why it was replaced.

I READ the feature key rather than assuming it: **all six are `bankroll_pro`.**
I also checked the identity source, because RULE 5 forbids trusting
`req.query.userId`: `projection.js` line 50 is `const userId = _authUser.id`
(carrying a `BUG #240 FIX` comment) and `export-pdf.js` line 41 is
`const userId = user.id`. Both come from the JWT. There is no IDOR here, so
the change is genuinely one line each:

```js
import { checkServerFeatureAccess } from '../../../src/lib/gates/serverFeatureGate';
const access = await checkServerFeatureAccess(getSupabase(), userId, 'bankroll_pro');
```
Mind the relative depth: `pages/api/poker/` and `pages/api/bankroll/` are both
three levels down, so `../../../` is right for all six.

Verify by calling each endpoint from a signed-in browser and asserting it is
not 403. I deliberately scoped this out rather than touch seven routes inside
a scanner PR, but it is the most valuable thing left in this document.

### ITEM 2: two components still upload to the dead bucket

Confirmed on `origin/main`:
```
src/components/bankroll/DealerVault.jsx    293  .from('images')     <- UPLOAD, 403s today
src/components/bankroll/DealerVault.jsx    297  getPublicUrl        <- read, fine
src/components/bankroll/DealerVault.jsx    343  .remove()           <- old objects, leave
src/components/bankroll/TaxReportPanel.jsx 148  .from('images')     <- UPLOAD, 403s today
src/components/bankroll/TaxReportPanel.jsx 154  .from('images')     <- read/sign, fine
src/components/bankroll/TaxReportPanel.jsx 194  .remove()           <- old objects, leave
```
**W-2G upload and dealer-document upload are broken in production right now.**
Move only the UPLOAD path to `uploadBankrollImage(supabase, userId, blob,
contentType)` from `src/lib/bankroll/receiptStorage.js`, exactly as
`LogEntryModal.jsx` and `ReceiptScanner.jsx` already do. Do NOT blanket-replace
`from('images')`: the reads and the `.remove()` calls must keep pointing at
`images` or existing objects become unreachable and undeletable.

### ITEM 3: W-2G is classified but never filed

`receiptRouting.mjs` already returns `destination: 'tax'` with
`{gross_amount, federal_withheld, state_withheld, tax_year, source_description}`
prefilled. **Nothing inserts it into `w2g_forms`.** `bankroll-manager.js`
currently routes only `session` and `expense`. Wire the `tax` destination into
TaxReportPanel's existing insert path (which depends on ITEM 2 for its upload).
`autoFile` is deliberately `false` for W-2G and MUST stay false: a human
confirms a tax form, always.

### ITEM 4: iOS cannot read ID barcodes

`pdf417.mjs` uses the native Barcode Detection API. Safari on iOS and iPadOS
does not implement it. On an iPad the capture works, the crop is clean, and the
UI says plainly that the barcode could not be read and offers the wedge field
and manual entry. If Dan confirms iPads are actually in rooms, install a WASM
decoder at the extension point marked at the bottom of `pdf417.mjs`. Candidate
vetted but deliberately NOT added: `zxing-wasm` (MIT, maintained, npm
provenance, `./reader` subpath). I left it out because it is a multi-megabyte
dependency added to a SHARED package on the one platform I could not test.
That is Dan's call, not yours or mine.

### ITEM 5: front-of-ID capture is a visual check only

`IdCaptureModal` captures the front, shows it, and destroys it. Nothing is
extracted from it and nothing is stored, by design. Its only value is the
operator eyeballing the card against the barcode data. Dan asked for front and
back, so it stays. If anyone asks why there are two steps, that is the honest
answer.

### ITEM 6: World Hub's vendored commander-shared is stale, harmlessly, for now

`vendor/commander-shared/` in the World Hub contains `AddMemberModal.jsx` but
NOT `IdCaptureModal.jsx`, and no `idscan/` or `docscan/`. Verified: the
vendored `AddMemberModal.jsx` there is the OLD copy with no reference to
`IdCaptureModal`, so nothing is broken. There IS a live shim at
`src/components/commander/members/AddMemberModal.jsx` re-exporting it, but no
page in the World Hub imports that shim, so nothing renders it. **If someone
re-vendors `AddMemberModal.jsx` alone into the World Hub, the build fails with
module-not-found on `./IdCaptureModal`.** Loud, not silent. Vendor the whole
`idscan/` plus `docscan/` set or vendor none of it.

**Read this before you vendor anything.** I said in an earlier draft that a
script named `check-vendor-upstream-sync.mjs` enforces upstream-first
ordering. **That script does not exist, in either repo.** What exists is
`scripts/check-vendor-drift.mjs` (both repos, wired into commander's
`ci.yml`), and its three checks are: A, no CJS syntax inside the ESM vendor
package; B, no caller bypassing a real local `src/` override; C, the installed
package is the vendor directory itself, symlinked rather than copied. **None of
them checks that upstream landed first.** Upstream-first is a discipline with
no guard behind it, so land the change in `commander-shared` and then vendor
it, and do not expect CI to catch you if you invert that. I am flagging my own
wrong claim here rather than deleting it, because CLAUDE.md section 1.3 records
exactly what a promised-but-absent safety net costs: someone reads it, assumes
they are covered, and stops checking.

---

## 7. DESIGN DECISIONS. DO NOT SILENTLY REVERSE THESE.

- **No OpenCV.** The pipeline is hand-written and dependency-free on purpose.
  OpenCV.js was removed from `_document.js` long ago and its absence was the
  original bug. Putting a ~9MB WASM download in front of a mobile-first capture
  reintroduces the problem it would claim to solve.
- **ID images NEVER persist.** No file input, because a `capture` input writes
  to the camera roll. No object URLs, no data URLs, no storage API, no upload.
  Buffers are zeroed on every exit path. The banner in the UI promises members
  this; four specific absences in the code are what keep the promise. Adding a
  file input to `IdCaptureModal` breaks it.
- **A buy-in is a SESSION, not an expense.** Filed as an expense the money lands
  in the wrong column twice: the session shows no investment and the bankroll
  shows a cost, so profit is wrong in both directions.
- **Nothing auto-files below 0.55 confidence** (`AUTOFILE_MIN_CONFIDENCE`), and
  nothing auto-files without a legible amount.
- **OCR runs in PARALLEL with the upload** so extracted data survives an upload
  retry. Do not move it back behind upload success.
- **Retry only what can succeed.** `isRetryableUploadError` refuses to retry an
  RLS refusal, a 401/403, a 413 or a duplicate. Retrying those shows the user
  three spinners and the same error.
- **The abandon guard is deliberate.** Once a scan is approved and not yet
  uploaded, `beforeunload` warns and closing requires confirmation. Dan asked
  for this explicitly. Do not quietly soften it.

---

## 8. A RULE CONFLICT FOR DAN. RAISE IT, DO NOT PICK A SIDE.

`.agents/rules/00-agent-playbook.md` RULE 1 orders the agent to use the
`schedule` tool to wait for CI. `CLAUDE.md` section 10.9 is a BINDING law from
Dan forbidding agents from using the Claude scheduler at all, because those
tasks belong to one account and die silently: `smarter-poker-cron-health` read
`enabled:true` while its `lastRunAt` sat at 2026-06-17, dead for two and a half
months. Following RULE 1 literally creates a timer that never fires.

I waited inline and confirmed the merges directly. **Tell Dan one of the two
documents needs editing. Do not resolve it quietly on your own judgement.**

---

## 9. VERIFY THE WORLD BEFORE YOU CHANGE IT

```bash
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
curl -s https://smarter.poker/api/health          # .version must equal main
cd ~/Documents/Smarter-Poker-World-Hub && git rev-parse origin/main
# then, inside YOUR worktree:
npx tsc --noEmit
node --test __tests__/bankroll-document-scanner.test.mjs   # expect 46 pass, 0 fail
node --test __tests__/bankroll-receipt-routing.test.mjs    # expect 21 pass, 0 fail
```

Test account is `daniel@bekavactrading.com`. The password lives in
`.env.local` and nowhere else. **Do not type it, do not paste it, do not put it
in a file or a commit.** The built-in browser already carries a signed-in
smarter.poker session. Reuse that session instead of authenticating.

---

## 10. WHAT WAS NEVER PROVEN

No physical device was ever used. No real camera, no iPad, no Android tablet,
no real driver licence, no hardware wedge scanner, no real thermal receipt.
Everything in section 3 is desktop Chrome against production using synthesised
images. **Live auto-capture on a phone, real PDF417 decoding, and the
keyboard-wedge input path are unexercised on hardware.** Say so plainly rather
than inheriting a claim I did not make.
