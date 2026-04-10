# Poker Brain HUD — Rearchitecture Plan

## Deep Audit Findings (Root Causes)

After reading every file in src/lib/poker-brain/, src/components/poker-brain/, the template extraction script, and the actual template images, here are the **real root causes** why card detection has never worked:

### Root Cause 1: Templates Were Extracted With Placeholder Coordinates

The extraction script (`scripts/poker-brain/extract-templates.py`) has this comment on line 66:

> "PLACEHOLDER — MUST be replaced with actual measured coordinates"

The extraction used reference resolution 478x1065, but layout.json uses 480x1054 — they don't even match. The crop regions were never measured from actual game frames.

**Evidence:** The Kh.png template visually shows TWO overlapping cards (King AND part of the next card). The crop was too wide, capturing adjacent cards. Multiple templates likely have this problem — wrong crops = wrong dHash signatures = nothing matches at runtime.

### Root Cause 2: The Coordinate System Was Designed for a Problem That Doesn't Exist

The entire architecture assumes the emulator window could be any size, position, or aspect ratio. It uses:
- A "reference space" (480x1054) for the phone screen
- A table-finder that scans for gold ring + green felt every frame
- A dynamic transform that maps reference coords to capture coords via the detected table bounds
- A calibration overlay for manual adjustment

**But the emulator window NEVER moves.** The capture resolution is ALWAYS 468x932. The PokerBros card positions are ALWAYS the same pixels. This complexity is not just unnecessary — it's the primary source of bugs. The table-finder detects varying bounds frame-to-frame, the transform produces wrong scales, stale calibration overrides fight the transform, and every "fix" to one layer breaks another.

### Root Cause 3: dHash Matching Against Bad Templates Cannot Work

Even when regions are in approximately the right place (distances were 7-11 before the table-anchored transform was added), the matches are marginal because the templates themselves are wrong. dHash compares a 9x9 grayscale thumbnail hash — if the template was extracted from a different crop window than what the runtime sees, the hash will always differ by several bits.

The correct approach: extract templates from the EXACT same pixel pipeline that the runtime uses — same capture source, same crop coordinates, same scaling.

### Root Cause 4: No Ground-Truth Validation Exists

There is no automated test that verifies "given this known screenshot, detect these known cards." Every fix has been shipped blind — change code, push, hope for the best. Without a validation pipeline, bugs compound.

---

## Rearchitecture Plan

### Phase 1: Fixed Capture-Space Layout (Day 1)

**Goal:** Eliminate ALL coordinate transforms. Define every region in the actual 468x932 capture pixel space.

**Changes:**
1. Create `layout-capture.json` — a new layout file with ALL regions defined in 468x932 capture pixels. No reference space, no scaling.
2. Measure exact pixel positions by capturing a single frame from the running emulator and annotating it (I'll do this via the Chrome extension's JavaScript tool on the live HUD page).
3. In `matcher.js`, when the layout's `referenceSize` matches the video dimensions, skip ALL scaling (scaleX = scaleY = 1.0). Regions are used as-is.
4. In `HUD.jsx`, use `layout-capture.json` directly. Remove ALL table-anchored transform code (already partially done). Remove the table-finder from the card detection path entirely (keep it only for player count if needed).
5. Remove CalibrationOverlay's drag-to-move feature for now — fixed positions don't need runtime calibration. The overlay becomes read-only visualization.

**Deliverables:**
- `layout-capture.json` with pixel-perfect 468x932 coordinates for: 2 NLHE hole cards, 4/5/6 PLO hole cards, 5 board cards, pot/stack/blind OCR regions, 6 seat positions, 3 action buttons
- HUD.jsx with zero-transform detection loop
- Matcher receives capture-pixel regions and uses them directly

### Phase 2: Live Template Re-Extraction (Day 1-2)

**Goal:** Generate templates from the ACTUAL capture pipeline so dHash signatures match runtime crops exactly.

**Changes:**
1. Build a "Template Capture Mode" in the HUD — a special mode where:
   - The user plays a hand and the HUD captures frames
   - When a card is visible, the user clicks the card region and types the card identity (e.g., "Ah" for Ace of Hearts)
   - The HUD crops that exact region at the exact pixel coordinates from the capture, resizes to 64x88, and saves it as a template
   - After capturing all 52 cards + back + empty, the templates are complete

2. Alternatively (faster for initial setup): write a Node.js script that:
   - Takes a screenshot of the emulator via ADB (`adb exec-out screencap -p`)
   - Crops each card region at the KNOWN fixed coordinates
   - Resizes to 64x88 template size
   - Saves to `public/hub/poker-brain/templates/`
   - This can be run once to generate a perfect template set

3. The key insight: templates must be generated through the SAME pixel pipeline as runtime detection. If the runtime captures via `getDisplayMedia` and crops at specific coordinates, the templates must come from the same source at the same coordinates.

**Deliverables:**
- Template Capture Mode UI in HUD (or standalone script)
- Fresh 54-template set extracted from live capture
- Validation that dHash distance for correct matches is 0-5 (not 7-25)

### Phase 3: Ground-Truth Test Harness (Day 2)

**Goal:** Never ship blind again. Create an automated test that validates detection against known screenshots.

**Changes:**
1. Capture 5-10 reference frames from the running emulator at different game states (preflop, flop, turn, river, showdown, empty board, etc.)
2. Save them as PNG files in `test/poker-brain/fixtures/`
3. For each frame, record the ground truth: which cards are visible, at which positions
4. Write a test script that:
   - Loads each reference frame into a canvas
   - Runs the matcher against it using `layout-capture.json`
   - Asserts that detected cards match ground truth
   - Reports match distances for each region
5. This test runs before every push via the pre-push hook

**Deliverables:**
- `test/poker-brain/detection-test.js` — automated ground-truth validation
- 5-10 reference frames with known cards
- Pre-push hook integration

### Phase 4: Simplified Detection Loop (Day 2-3)

**Goal:** Clean up the HUD detection loop to be simple, predictable, and debuggable.

**Current state:** HUD.jsx is 1900+ lines with interleaved detection, OCR, state machine, decision engine, storage, and rendering logic. The detection loop alone spans 400+ lines with nested try/catch blocks, conditional transforms, and diagnostic dumps.

**Changes:**
1. Extract the detection loop into its own module: `detection-loop.js`
   - Input: video element, layout, matcher, variant
   - Output: `{ holeCards, boardCards, confidence, timing }`
   - No side effects, no state management, no rendering
   - Pure function: frame in, cards out

2. Extract OCR into its own loop module: `ocr-loop.js`
   - Input: video element, layout, OCR engine
   - Output: `{ pot, heroStack, blindLevel, gameVariant }`

3. HUD.jsx becomes a thin orchestrator:
   - Starts/stops the detection and OCR intervals
   - Feeds results to the state machine
   - Renders the UI
   - ~800 lines max instead of 1900+

4. Each module is independently testable with the ground-truth harness.

**Deliverables:**
- `detection-loop.js` — pure card detection function
- `ocr-loop.js` — pure OCR function
- `HUD.jsx` simplified to orchestration + rendering
- Each module has its own test

### Phase 5: Robust Matching Improvements (Day 3)

**Goal:** Make dHash matching more robust against capture quality variations.

**Changes:**
1. **Multi-hash approach:** Compute both dHash AND average hash (aHash) for each template. At runtime, compute both hashes for each crop and take the minimum distance across both hash types. This provides redundancy — if one hash function is sensitive to a particular distortion, the other may not be.

2. **Template augmentation:** For each template, also store hashes for:
   - The template shifted 1px in each direction (4 variants)
   - The template at 95% and 105% scale (2 variants)
   - Total: 7 hashes per template instead of 1
   - At runtime, compare against ALL variant hashes and take the minimum distance
   - This absorbs sub-pixel alignment differences without increasing runtime cost significantly (7x more comparisons but each is just a popcount on 64-bit integers)

3. **Adaptive threshold:** Instead of a fixed MATCH_THRESHOLD=12, use a relative threshold:
   - If the best match has distance D and the second-best match (different rank) has distance D2, accept the match if D2 - D >= 5 (clear winner) OR D <= 8 (very strong match)
   - This handles cases where the best match is correct at distance 10 but would be rejected by a fixed threshold of 8

4. **Confidence calibration:** After Phase 3's test harness validates the detection accuracy, tune the threshold empirically based on the actual distance distribution of correct vs incorrect matches.

**Deliverables:**
- Multi-hash matching (dHash + aHash)
- Template augmentation (7 variants per template)
- Adaptive threshold with gap-based acceptance
- Empirical threshold calibration from test data

---

## Implementation Order and Dependencies

```
Phase 1 (Fixed Layout)
  |
  v
Phase 2 (Live Templates) -----> Phase 3 (Test Harness)
  |                                |
  v                                v
Phase 4 (Clean Detection Loop)    Phase 5 (Robust Matching)
```

Phase 1 is the foundation — everything else builds on having correct, fixed pixel coordinates.
Phase 2 and 3 can partially overlap.
Phase 4 and 5 can be done in either order after 1-3.

## What Gets Deleted

- `table-finder.js` — removed from card detection path (may keep for player count)
- `card-localizer.js` — replaced by fixed layout; 723 lines of adaptive localization no longer needed
- `table-state-tracker.js` — temporal smoothing of table bounds is irrelevant with fixed positions
- Table-anchored transform in HUD.jsx (~120 lines) — already removed
- CalibrationOverlay drag-to-move — fixed positions don't need runtime calibration
- `layout.json` reference-space regions — replaced by `layout-capture.json` capture-space regions

## What Stays

- `matcher.js` — core dHash engine, enhanced in Phase 5
- `engine.js` — poker decision logic, no changes needed
- `state.js` — hand state machine, no changes needed
- `decision-bridge.js` — glue layer, no changes needed
- `storage.js` — persistence, no changes needed
- `ocr.js` — OCR engine, extracted into loop module in Phase 4
- `dealer-detect.js` — keeps working for dealer button detection
- `auto-table-state.js` — keeps working for player count
- `suit-color.js` — keeps working for suit verification
- `action-detect.js` — keeps working for action button detection
- `hand-strength-validator.js` — keeps working for sanity checks

## Success Criteria

1. **Phase 1 complete:** Debug panel shows regions landing exactly on card faces (verify via crop previews)
2. **Phase 2 complete:** dHash distance for correct card matches is 0-5 consistently
3. **Phase 3 complete:** Automated test passes with 100% accuracy on all reference frames
4. **Phase 4 complete:** HUD.jsx under 900 lines, detection loop is a standalone testable module
5. **Phase 5 complete:** Detection accuracy >= 99% on board cards, >= 97% on hole cards across 100+ test frames

## Estimated Timeline

- Phase 1: 2-3 hours (measure coordinates, create layout, wire up)
- Phase 2: 2-3 hours (build template capture, extract all 54 templates)
- Phase 3: 1-2 hours (capture reference frames, write test)
- Phase 4: 3-4 hours (refactor HUD into modules)
- Phase 5: 2-3 hours (implement multi-hash, augmentation, adaptive threshold)

**Total: ~12-15 hours of focused work across 2-3 sessions**
