# Rubric score breakdown

**53 / 60** at commit `main`, 21 August 2026. Twenty criteria, five domains, bands 0–3.

Band 3 requires confirmation independent of the researcher — a measurement, a passing test, or a standard's success criterion. Band 2 is "done correctly but only checked by eye."

> Two kinds of evidence carry the band 3s below, and they are named separately in every row
> rather than blurred together. **A suite assertion** runs on every change, but `vitest.config.js`
> is `environment: "node"` with no jsdom, so nothing in the suite renders anything: a suite
> assertion is a statement about data, arithmetic or source text. **A driver measurement** is
> taken by driving the built app in Chrome — rendered pixels for contrast, the accessibility tree
> for names and states — and is reproducible by running the driver, but it is dated to this
> assessment rather than continuously enforced. Where a row rests on a driver, it says so.

> The paper (`docs/sample-paper.html`) reported **52** with the band profile this file now
> corrects. Table 6 and the totals in the abstract, Chapter IV, Chapter V and Appendix B are
> updated to agree with the bands below.

| Domain | Score | Bands |
|---|---|---|
| A. Visual design | 10 / 12 | 2, 3, 3, 2 |
| B. Communication effectiveness | 11 / 12 | 3, 3, 3, 2 |
| C. Multimedia instruction | 10 / 12 | 2, 3, 3, 2 |
| D. Interaction and usability | 10 / 12 | 2, 2, 3, 3 |
| E. Accessibility | 12 / 12 | 3, 3, 3, 3 |
| **Total** | **53 / 60** | |

Thirteen criteria at band 3, seven at band 2, none below. Accessibility is the only domain at its maximum.

---

## A. Visual design — 10 / 12

| Criterion | Band | Why |
|---|---|---|
| A1 Hierarchy | 2 | Title, time and rationale are ranked by size and weight in one shared card, but the ranking was judged by inspection and there is no named type scale for a test to assert against. |
| A2 Non-text contrast | 3 | Every hue drawn as a mark rather than washed as a background — a Badge icon on its own tinted disc, the chart marks, the border on the plan's current item — clears 3:1 on `card`, `bg` and `sunken` in both themes, asserted by **73 rows per theme** in `src/tokens.test.js` (9 fixed control rows, 8 domains × 7, 8 chart rows) and independently measured on rendered pixels by `drive-contrast.mjs`, which pairs 150 control boundaries, 66 painted elements inside controls and 148 icons against the surface each sits on. The finding this row used to carry was wrong in both directions: the failing surface was the icon's own wash rather than the card, and six hues failed across both themes rather than three in the warm one. The active-state chip exception is recorded under Open findings and is not covered by this band. |
| A3 Grouping | 3 | Logged and open cover every plan item exactly once at every log depth, `planGate` partitions without overlap, the list is ordered by absolute minutes so a morning cannot precede the evening it follows, and the six phases tile the shift with every minute in exactly one — **61 passing suite assertions** in `src/grouping.test.js` across four shift shapes. What renders is the logged/open split, the folded reset card and the day strip's per-night grouping; phase banding was removed on purpose and no phase label renders anywhere, which `grouping.test.js:11-15` states in its own header. There is **no mutation tooling in this repository** — `package.json` carries no mutation dependency or script — so the previous claim that each of the 61 tests was confirmed to fail when mutated is withdrawn. |
| A4 Consistency | 2 | Five hand-rolled disclosures became one `Disclosure`, and a suite assertion bans a sixth appearing outside `ui/index.jsx` — padding ran 0, 9px and 12px, gaps 5, 8 and 10, and one had no caret at all. Reuse beyond that one class is unchecked: 25 raw buttons and 6 raw selects remain in `App.jsx`, and type, spacing and radius have no named scale — **19 distinct `fontSize` values, 20 radii and 15 gap values**, counting plain numeric literals across the four files that carry inline style (`App.jsx`, `ui/index.jsx`, `screens/Dashboard.jsx`, `screens/Tour.jsx`). |

## B. Communication effectiveness — 11 / 12

| Criterion | Band | Why |
|---|---|---|
| B1 Relevance | 3 | Caffeine cutoffs, reset spacing and item locking all respond to the profile, and every response is confirmed by suite assertion in `src/planner.test.js`. |
| B2 Clarity | 3 | Every generated instruction clears Flesch–Kincaid grade 8 (worst 7.19) across fourteen profiles, measured by suite assertion against a published threshold rather than judged. |
| B3 Inclusivity | 3 | Seventeen planning parameters vary by profile, an eight-profile matrix produces different plans, and each variation is confirmed by suite assertion. |
| B4 Language | 2 | Wording is plain and non-clinical with no diagnoses, but terminology is not enforced from a single checked source. |

## C. Multimedia instruction — 10 / 12

| Criterion | Band | Why |
|---|---|---|
| C1 Segmenting | 2 ↓ | Activities are split into named steps with pause, resume and a "Next step" control, and `src/signaling.test.js` proves by suite assertion that Next step lands on every real step boundary and stops exactly at the end. Band 3 asks for progression "under the user's command rather than a timer", and the timer still drives it: `src/App.jsx:120-124` is `setInterval(…, 1000)` with `running` defaulting to `true` and the step index derived from elapsed seconds, so Next step is a skip-ahead over a running clock rather than the means of advancing. Band 2's descriptor is met exactly; band 3's is not. |
| C2 Signaling | 3 ↑ | Countdown, progress and minutes-left are asserted well-formed across 75 steps and 784 frames, and every step has a cue. Those are assertions over a data literal and a transcription of the player's arithmetic rather than observations of an announcement, so they carried the row only to band 2. The announcement itself was observed on 21 August 2026 with VoiceOver in Chrome and is recorded in [`wcag-em-screenreader-2026-08-21.md`](wcag-em-screenreader-2026-08-21.md): with `sound` off, which is the configuration in which `src/App.jsx:206` resolves to `aria-live="polite"`, a step change announces without focus moving to it. With `sound` on the region is deliberately `off`, because the app speaks the step itself and a live region carrying the same text would have it read twice. |
| C3 Coherence | 3 | No keyframe animation runs anywhere in the document while an activity plays, and the only running transitions are the ring's pacing and the bar's progress — a **driver measurement** over 165 frames covering every step of all five activities, preceded by a control reading on a screen that does animate so a null result is distinguishable from a blind instrument, with the player's copy inventoried against its own step labels in the same pass. |
| C4 Modality | 2 | Guidance reaches a second channel: the player speaks each step and marks boundaries with a tone, on when the player opens with a control in its header to stop it, which is what WCAG 1.4.2 asks of audio that starts by itself. Cue coverage is asserted; delivery through the device is not, and the movement sequences remain text rather than video. |

## D. Interaction and usability — 10 / 12

| Criterion | Band | Why |
|---|---|---|
| D1 Status visibility | 2 | `done`, `skip` and `adjusted` now all call `say()` on the branch that writes the log entry, so every logged event returns a stated consequence; `src/announce.test.js` pins that by slicing to the `ITEM_STATUS` branch and requiring an unconditional `say(` inside it. Band 3 asks that the consequence shown be confirmed to match the change made, and it is not — and one class of stated value is known to diverge, since `sequenceOf` rounds to whole cycles so a card saying "2 min" runs 128s. |
| D2 User control | 2 | Entries can be amended or removed, activities paused, and overlays dismissed with focus returned to the opener. Those paths need a rendered DOM to exercise and the suite configures none, so they are confirmed by use rather than by test. |
| D3 Error prevention | 3 ↑ | `ov()` (`src/planner.js:113-124`) now rejects any non-finite value and clamps to the key's own slider range on the **read** path, which is the one place all seventeen `ADJUSTABLE` keys are read. `src/planner.test.js:211-227` walks every one of the seventeen keys at both ends and on a non-finite value, and asserts the key count is 17 so a new key cannot slip past the loop. This closes the reproducible out-of-memory crash on `moveGap: 0` and the silent loss of all movement items on `1e9`. |
| D4 Reliability | 3 | Plan generation is a pure function of profile, logs and time, and the suite passes over the assessed build: `Test Files 22 passed (22)`, `Tests 285 passed \| 1 skipped (286)`. |

## E. Accessibility — 12 / 12

| Criterion | Band | Why |
|---|---|---|
| E1 Perceivable | 3 | **Driver measurement.** `drive-contrast.mjs` suppresses glyph paint, screenshots the viewport at 1x, decodes it and samples every rendered text run's line boxes against the composited backdrop, taking the worst point of each run and applying WCAG's large-text rule per element from the computed style. Across the four assessed screens: **253 runs warm, floor 4.65:1; 243 runs dark, floor 4.69:1; 0 below threshold**. Across the ten screens outside the assessed four: also 0 below threshold, the tightest being the profile sheet at 4.55:1 warm and 4.60:1 dark. One warm run in the care player measures 4.17:1 and is large text under the 3:1 rule, not a failure. The token table asserts the same floors by suite assertion in both themes. |
| E2 Operable | 3 ↑ | The care and log rows are real buttons, the accessibility tree confirms their roles, and focus restores to its opener. Browser automation delivered no key events, so activation and tab order were inferred rather than measured — until the manual pass of 21 August 2026, recorded in [`wcag-em-keyboard-2026-08-21.md`](wcag-em-keyboard-2026-08-21.md). Chrome on macOS Tahoe 26.5.1: all four screens reachable by Tab and reversible by Shift+Tab, Enter and Space both activate, traversal in visual order, focus ring visible at every stop, no trap, and all six overlays hold focus, close on Escape and return it to the opener. 2.2.2 does not engage on the assessed screens; the reduced-motion block at `index.html:167` was verified on the onboarding path where it does. |
| E3 Understandable | 3 | **Driver measurement.** `drive-names.mjs` resolves every rendered control through CDP `Accessibility.getPartialAXTree` — the name Chrome computed for assistive technology, not the `aria-label` attribute — across 25 screen/theme states: **402 distinct rendered controls, 0 unnamed**; the four assessed screens **82 controls, 0 unnamed**; 0 dropped from the tree as ignored, 0 inside an `aria-hidden` subtree. An injected empty `<button>` resolved to name `""`, so the instrument does report an unnamed control when one exists and zero is a real zero. `lang="en"` is declared at `index.html:2`. The two 4.1.2 failures are closed: the range input (`src/App.jsx:2675`) and the export textarea (`:2441`) both carry names, the textarea reached by forcing `URL.createObjectURL` to throw, which is the only state it renders in. The count this row used to give — "fifteen visible selects" — is not a count this build produces: 13 distinct selects across the assessed four, and the most rendered in the document at any one moment on any screen is 11. Fifteen is the contrast driver's count of form controls whose value is browser shadow content and therefore unmeasurable on pixels. |
| E4 Robust | 3 ↑ | Name, role and state are confirmed in the tree rather than in source: `aria-pressed` declared on 123 controls and carried into the tree on **123/123**, `aria-expanded` on **78/78** plus 14 carried implicitly by native elements, every control named, none ignored. What the tree computes is now confirmed spoken. VoiceOver in Chrome on macOS Tahoe 26.5.1, 21 August 2026, recorded in [`wcag-em-screenreader-2026-08-21.md`](wcag-em-screenreader-2026-08-21.md): across the four screens, the six overlays and the activity player, no control failed to announce name and role, and all three live regions — the `#gy-where` route announcer, the toast, and the activity step — announced without taking focus. One caption-panel line transcribed as a worked example. `aria-current="page"` on the 11 nav controls is still the weak spot: CDP has no entry for it and this pass did not transcribe its wording, so it is carried under Not verified rather than claimed. |

---

## Open findings

- **Nine non-text rows remain under 3:1, all active-state chips.** Worst is **1.15:1** (the warm "Always warm" theme chip's tint against the card). Across both themes the nine cover about six distinct controls: the theme chips, the "Vibrate" and "5 min before" reminder chips, the Plan tab's "Resets grouped" toggle and the care player's spoken-guidance toggle. Two of the nine are therefore **not** the `Pill` component, so this is a class of active-state chip rather than one component. `Pill` sets `border: transparent` and a tinted fill when active, so the whole visual difference between chosen and not chosen is the tint plus the label moving from `muted` to `ink`. Excluded on the ground that each chip's own label identifies it at ≥4.5:1 and `aria-pressed` carries the state non-visually on all 123 such controls, confirmed in the tree; giving every active chip an outline is a design change rather than a conformance one. Recorded here because the exclusion is an argument, not a measurement.
- **`aria-current="page"` is unconfirmable through CDP.** Declared on the 11 tab-bar controls. Not a pass and not a failure; it needs an assistive technology or a different protocol.
- **No named scale for type, spacing or radius.** Colour is tokenised and swept; geometry is not, so A1 has nothing to assert and A4 can only be checked one control class at a time. **154 inline `fontSize` declarations** across the four files that carry inline style, 153 of them carrying a numeric literal and one a variable, in half-point steps. This is what holds A1 at 2 and caps A4.
- **22 of 40 rationale sentences exceed grade 8** when scored individually (worst 14.3), though the rationales read at grade 7.5 as a body of text — which is the unit the formula was fitted on. Left as a skipped assertion with a comment saying to fix it by shortening sentences, never by raising the threshold.
- **Care cards overstate their length.** `sequenceOf` rounds to whole cycle repetitions, so "Box breathing — 2 min" runs 128s and opens saying "3 min left". The countdown is internally honest; the label is not.
- **No mutation tooling exists.** `grep -rn "mutat" src/ *.mjs` finds only unrelated prose and `package.json` carries no mutation dependency or script. Any claim that a test was confirmed to fail under mutation is an unrecorded manual step, and none is made in this file or in the paper.

### Closed since the last score

- **The reminder toggle's knob**, previously 2.30:1 white-on-track in the dark theme, now carries a 1px `rgba(0,0,0,0.8)` ring. The ring clears 3:1 against every domain track in both themes (worst 3.59:1 warm, 3.95:1 dark; 6.93:1 on the hue where the knob measured 2.30:1), and `drive-contrast.mjs` no longer reports it under 3:1 in either theme.
- **The onboarding back glyph**, 2.98:1 → 5.96:1.
- **Six warm text-contrast failures on the profile sheet**, fixed at the token level (`src/tokens.js:59,75`) with a new row in the existing `rowsFor()` loop covering `muted` on tinted tiles for all eight hues.
- **The unbounded override read path**, which had a reproducible out-of-memory crash on `moveGap: 0`.
- **The two unnamed controls**, the plan-adjust range input and the export textarea.

## Not verified

- **`aria-current="page"` in speech.** CDP has no entry for it, so the driver cannot reach it, and the screen-reader pass of 21 August 2026 did not transcribe its spoken wording. The evaluator reported no failure on the eleven navigation controls and their name and role are covered by the 4.1.2 result, but the specific question of whether the active tab announces as the current page is still unquoted. One `VO+Right` onto an active tab with the caption panel open closes it.
- **Screen-reader coverage beyond VoiceOver in Chrome.** One reader, one browser. NVDA and JAWS compute some names differently and nothing here speaks to them.
- **The visual result of the contrast changes.** Contrast is measured throughout; whether any of it still looks right has not been checked by eye in a browser.
- **What the suite renders.** Nothing. `vitest.config.js` is still `environment: "node"` with no jsdom, so every suite assertion is over data, arithmetic or source text. All rendered-screen evidence in this file comes from the drivers, which run on demand rather than on every change.
