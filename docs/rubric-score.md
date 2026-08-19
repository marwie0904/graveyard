# Rubric score breakdown

**52 / 60** at commit `main`, 19 August 2026. Twenty criteria, five domains, bands 0–3.

Band 3 requires confirmation independent of the researcher — a measurement, a passing test, or a standard's success criterion. Band 2 is "done correctly but only checked by eye."

> The paper (`docs/sample-paper.html`) still reports **38** and describes closed failures as open. It has not been updated for this build.

| Domain | Score | Bands |
|---|---|---|
| A. Visual design | 10 / 12 | 2, 3, 3, 2 |
| B. Communication effectiveness | 11 / 12 | 3, 3, 3, 2 |
| C. Multimedia instruction | 11 / 12 | 3, 3, 3, 2 |
| D. Interaction and usability | 10 / 12 | 2, 2, 3, 3 |
| E. Accessibility | 10 / 12 | 3, 2, 3, 2 |
| **Total** | **52 / 60** | |

---

## A. Visual design — 10 / 12

| Criterion | Band | Why |
|---|---|---|
| A1 Hierarchy | 2 | Title, time and rationale are ranked by size and weight in one shared card, but the ranking was judged by inspection rather than checked automatically. |
| A2 Non-text contrast | **3** ↑ | Every hue drawn as a mark rather than washed as a background — a Badge icon on its own tinted disc, the chart marks, the border on the plan's current item — now clears 3:1 on `card`, `bg` and `sunken` in both themes, asserted by 64 rows per theme. The finding this row used to carry was wrong in both directions: the failing surface is the icon's own wash, not the card, and six hues failed across both themes, not three in the warm one. |
| A3 Grouping | **3** ↑ | Logged and open cover every plan item exactly once at every log depth, `planGate` partitions without overlap, the list is ordered by absolute minutes so a morning cannot precede the evening it follows, and the six phases tile the shift with every minute in exactly one — 61 tests, each confirmed to fail when the property it names is mutated. The previous justification described phase banding, which this build removed on purpose. |
| A4 Consistency | 2 | Five hand-rolled disclosures became one `Disclosure`, and a test bans a sixth appearing outside `ui/index.jsx` — padding ran 0, 9px and 12px, gaps 5, 8 and 10, and one had no caret at all. Reuse beyond that one class is still unchecked, and the vocabulary is thinner than this row used to imply: 25 raw buttons and 6 raw selects remain in `App.jsx`, and type, spacing and radius have no named scale for a test to point at — 22 distinct font sizes, 21 radii, 15 gap values. |

## B. Communication effectiveness — 11 / 12

| Criterion | Band | Why |
|---|---|---|
| B1 Relevance | 3 | Caffeine cutoffs, reset spacing and item locking all respond to the profile, and every response is confirmed by automated test. |
| B2 Clarity | **3** ↑ | Every generated instruction now clears Flesch–Kincaid grade 8 (worst 7.19) across fourteen profiles, measured against a published threshold rather than judged. |
| B3 Inclusivity | 3 | Seventeen planning parameters vary by profile, an eight-profile matrix produces different plans, and each variation is test-confirmed. |
| B4 Language | 2 | Wording is plain and non-clinical with no diagnoses, but terminology is not enforced from a single checked source. |

## C. Multimedia instruction — 11 / 12

| Criterion | Band | Why |
|---|---|---|
| C1 Segmenting | 3 | Guided activities are split into named steps and a "Next step" control advances them on the user's command, confirmed by test and in a browser. |
| C2 Signaling | **3** ↑ | Every step of every activity is now proven to announce something, with countdown, progress and minutes-left asserted well-formed across 75 steps and 784 frames. |
| C3 Coherence | **3** ↑ | No keyframe animation runs anywhere in the document while an activity plays, and the only running transitions are the ring's pacing and the bar's progress — measured over 165 frames covering every step of all five activities, with the player's copy inventoried against its own step labels in the same pass. |
| C4 Modality | 2 | Guidance reaches a second channel: the player speaks each step and marks boundaries with a tone. On when the player opens, with a control in its header to stop it, which is what WCAG 1.4.2 asks of audio that starts by itself. (This row previously said "off by default"; the code has never done that.) |

## D. Interaction and usability — 10 / 12

| Criterion | Band | Why |
|---|---|---|
| D1 Status visibility | 2 | Every logged event returns a stated consequence, but the consequence shown is not confirmed to match the underlying change — and the care cards' stated minutes do not match what the player actually runs. |
| D2 User control | 2 | Entries can be amended or removed and activities paused, but those paths need a rendered DOM to test and none is configured. |
| D3 Error prevention | 3 | Overrides are clamped, invalid values ignored, and adjustments never move a hand-set number backward — all confirmed by test. |
| D4 Reliability | 3 | Plan generation is a pure function of profile, logs and time, and the full suite passes over the assessed build. |

## E. Accessibility — 10 / 12

| Criterion | Band | Why |
|---|---|---|
| E1 Perceivable | 3 | Every text token clears 4.5:1 in both themes, measured on rendered pixels in a live browser (4.65:1 warm, 5.29:1 dark) rather than computed from the token file alone. |
| E2 Operable | 2 | The care and log rows are real buttons and focus restores to its opener, but actual key-press activation has not been confirmed by a human. |
| E3 Understandable | 3 | Zero unnamed controls out of fifteen visible selects, verified in the live DOM, with both time-entry groups named. |
| E4 Robust | **2** ↑ | Four more stateful controls now report their state — the tab bar, the reminder switches, the time-wheel columns and one disclosure — but the new fixes are asserted in source, not yet confirmed in an assistive technology. |

---

## Open findings

- **The reminder toggle's knob is 2.30:1 against a lit track** in the dark theme — white on `light`'s fill, the same pair the domain hues used to fail as icons. Whether 1.4.11 reaches it is genuinely unsettled rather than deferred: the on/off state is already carried by the track's own colour change, which clears 3:1 against the card at 7.20, so the knob's position may be redundant rather than load-bearing. Recorded rather than argued, because a 1px ring on the knob closes it either way and costs less than the argument.
- **No named scale for type, spacing or radius.** Colour is tokenised and swept; geometry is not, so A1 has nothing to assert and A4 can only be checked one control class at a time. 156 inline `fontSize` literals across four files, in half-point steps. This is what holds A1 at 2 and caps A4.
- **22 of 40 rationale sentences exceed grade 8** when scored individually (worst 14.3), though the rationales read at grade 7.5 as a body of text — which is the unit the formula was fitted on. Left as a skipped test with a comment saying to fix it by shortening sentences, never by raising the threshold.
- **Care cards overstate their length.** `sequenceOf` rounds to whole cycle repetitions, so "Box breathing — 2 min" runs 128s and opens saying "3 min left". The countdown is internally honest; the label is not.
- **The active `Pill` has no 3:1 boundary** — transparent border over a 1.28:1 tint. Excluded on the grounds that its own label identifies it at ≥4.5:1; giving every active pill an outline is a design change, not a conformance one.

## Not verified

- **Keyboard activation and Tab traversal.** Browser automation delivered zero keydown events to the page, so Enter/Space and tab order are inferred from the elements being real focusable buttons, not measured. E2 stays at 2 until a human presses keys.
- **Screen-reader output.** The state attributes are confirmed present in the live DOM; whether VoiceOver speaks them is unconfirmed. This is what holds E4 at 2.
- **The visual result of the contrast changes.** `Choice`, `Pill`, `Select` and the day strip's empty ring changed colour and border style. Since then: five warm domain fills moved, locked plan cards recede by surface instead of by opacity, estimated sleep bars are outlined rather than faded, and four containers stopped dimming their own text. Contrast is measured throughout; whether any of it still looks right has not been checked by eye in a browser.
