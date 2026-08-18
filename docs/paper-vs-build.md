# Paper vs. Build

What `docs/sample-paper.html` asserts or describes that the prototype does not yet do, as of 2026-08-14 (commit `e8db150`).

**Update, 2026-08-18.** `sample-paper.html` was rewritten as the full manuscript (Chapters I to III in the original's format) and the passages describing the artifact were restated against the current build. Rows below carry a *Paper now* line where that rewrite changed the discrepancy.

Every row was checked against the source, not inferred. `Declared` means the paper itself names the gap, so it is honest as written and only needs building. `Undeclared` means the paper reads as though the thing exists — those are the ones that can be contradicted in a defense.

---

## 1. Modalities

### 1.1 Audio breathing guidance — **declared**

- **Paper**: Ch. II, *Aesthetic grounding*. Heinrich's "aural landscape" (p. 752) is retained "as a stated design direction and not as a description of the implemented prototype."
- **Build**: no audio of any kind. `grep -rn "Audio\|speechSynthesis\|AudioContext" src/` returns nothing. `CarePlayer` (`src/App.jsx:103`) is a silent scaling circle, countdown, step label, and progress bar.
- **To close**: an audio track or spoken cue per `cycle` step in `CARE` (`src/App.jsx:36`). Note this pulls in WCAG obligations — see 2.4.

### 1.2 Movement videos — **claim withdrawn, feature still absent**

- **Paper**: previously listed "short movement videos" among the delivered media. That claim is gone; the *Micro-care screen* section now states the sequences "are rendered as timed text rather than as video."
- **Build**: `neck` and `desk` are arrays of `{l, s}` text steps (`src/App.jsx:53–77`).
- **Status**: no longer a contradiction. Listed here because `docs/research-summary.md` still says "short movement videos" and needs the same edit.

### 1.3 Reminders and notifications — **declared, not built**

- **Paper**: Ch. II, *Content architecture* — an item "can be rendered as a timeline entry, a reminder, or an exported record." `docs/research-summary.md` goes further and lists "a notification and reminder component" as an MVP component.
- **Build**: no `Notification`, no service worker, no scheduling. `REMINDERS` (`src/App.jsx:914`) is a list of **labels** used to describe the plan in copy — it delivers nothing.
- **Risk**: this is the largest undeclared gap. A night-shift tool whose whole premise is timing, that cannot interrupt the user at the right moment, invites the question directly.
- **To close**: build it. The claim side is closed.
- **Paper now**: declared. Ch. III, *Prototype development* — four of the five MVP components are present and "the notification and reminder component is not… the component is recorded as specified and unbuilt."

### 1.4 Printed plan — **partially true**

- **Paper**: "an exported record" (softened from "a printed plan").
- **Build**: JSON export exists (`exportData`, `src/App.jsx:2877`) plus a textarea fallback. No print stylesheet, no `@media print`, no human-readable export.
- **Status**: the sentence as now written is accurate. A literal *printed plan* is not implemented.

---

## 2. Accessibility

This section was re-checked against the source on 2026-08-18, after the
accessibility work described in `docs/accessibility.md`. The rest of the
document still reflects commit `e8db150`.

Three of these were, for four days, discrepancies in the safer direction: the
build did the thing and the paper still said it did not. The 2026-08-18 rewrite
of the paper closed all three. They are kept here with their measurements
because the audit section of Ch. III is written from them.

### 2.1 Contrast remediation — **closed in the build and in the paper**

- **Paper**: Ch. III, first audit finding — "2.51:1 in the light theme and 3.17:1 in the dark theme… remediation is outstanding rather than complete."
- **Build**: remediated in `src/tokens.js`. Every text token now clears 4.5:1 against the darkest surface it is actually used on:

| Token | Was | Now | Binding surface | Ratio |
|---|---|---|---|---|
| `WARM.faint` | `#A9A398` | `#6F6B63` | bg `#F2F0EA` | 2.20 → **4.65** |
| `WARM.muted` | `#78736A` | `#6A655D` | sunken `#EAE7DF` | 3.81 → **4.68** |
| `DARK.faint` | `#6E6B76` | `#8A8790` | card `#1E1E26` | 3.17 → **4.69** |
| `DARK.muted` | `#96939E` | unchanged | card `#1E1E26` | 5.49 |

- **Correction to the earlier draft of this section**: it named `bg` as `WARM.muted`'s worst ground at 4.13:1. The real floor is `sunken` at 3.81:1 — the token also prints the logged-count badge (`src/App.jsx:1497`) and two intro paragraphs on `T.sunken`. Fixed against that.
- **Guarded**: `src/tokens.test.js` asserts the full table in both themes, so the palette cannot regress silently.
- **Paper now**: rewritten as remediated, with the post-fix figures (2.20:1 and 3.17:1 before, 4.65:1 and 4.69:1 after) and the guard named.

### 2.2 Reduced motion — **closed in the build and in the paper**

- **Paper**: third audit finding — "the prototype does not honor the operating system's reduced-motion preference."
- **Build**: honored. `index.html` carries a `@media (prefers-reduced-motion: reduce)` block that stops the ambient animations and collapses the transitions.
- **Why the earlier entry said otherwise**: it grepped `src/` only. The app's sole global stylesheet lives in `index.html`, outside that path. Recorded here because the same blind spot would hide any future global CSS.
- **Mitigation also present and correctly claimed**: the pause control satisfies the moving-content criterion independently.
- **Paper now**: restated as remediated — the pause control and the honored reduced-motion setting are both claimed.

### 2.3 Domain hue used as text colour — **closed**

- **Was**: the Care screen rendered its duration label in `DOMAIN.caffeine.hue` on card at **3.94:1**. Other hues on the light card: `light` 2.30, `water` 2.99, `movement` 3.00, `food` 3.37.
- **Build**: each domain now carries an `ink` value per theme alongside `hue`, calibrated against the tinted chip — the worst ground any of them prints on, worse than plain card. Twelve `color:` call sites moved over. The `hue` values are unchanged and still used for icons, meters, chips and `tint()` washes, where the 3:1 non-text floor applies.
- **Two further failures found and fixed in passing**: `RangeControl`'s "Trends" chip printed `T.bg` on `DOMAIN.sleep.hue` at 4.44:1 warm and **3.69:1** dark; and the "Circadian low" badge (`src/App.jsx:1328`) carried a hardcoded `#6C6BE8` at **4.28:1** warm and **3.87:1** dark, theme-blind, now reading from the sleep `ink` at 6.62 and 6.04.
- **Worth recording as method, not just result**: the badge was missed by both the palette sweep and `src/tokens.test.js`, because neither can see a hex literal written into a component — one matched token-shaped expressions, the other iterates the token table. It surfaced only when every rendered text node was measured against its actual painted background in the running app. A second test now bans non-white colour literals outside `tokens.js`. If the WCAG-EM evaluation in 2.4 is run from the source alone, it will inherit the same blind spot.
- **Paper now**: in the paper, as the fourth finding, and kept for the method argument — a hex written into a component is invisible to a source-level audit, so the evaluation is performed against rendered screens.

### 2.4 WCAG-EM audit artifact — **procedure described, artifact missing**

- **Paper**: Ch. III now describes a preliminary review followed by a structured WCAG-EM evaluation "recorded in its report format."
- **Build**: no report exists. The contrast numbers above were computed for this document; nothing is stored in the repo.
- **Status**: unchanged, but the reason to defer has expired. The argument was that auditing against a long list of known failures would only document them a second time. That list is now five items, three of them two-line fixes (see 2.5).
- **To close**: fix 2.5's items 1 to 3, then run the WCAG-EM Report Tool over the implemented screens and put the output in an appendix. The scope statement must name only the four built screens.

### 2.5 Remaining AA gaps — **declared, not fixed**

Five open items, listed in full with priorities and rationale in `docs/accessibility.md`. Summarised here because the paper asserts a WCAG 2.2 AA target and these are what stands between the build and that claim. **Paper now**: declared — all five appear in Ch. III as Table 2, with criteria and levels, alongside two items declared rather than claimed (fixed type sizes, and the WCAG-EM artifact).

| # | Gap | Criterion | Where |
|---|---|---|---|
| 1 | Whole Care screen is keyboard-dead: 6 focusables, none of them its 5 activity rows or play controls | 2.1.1 **A** | `src/App.jsx:1932`, `:1804` |
| 2 | Six raw `<select>` time controls have no label | 3.3.2 / 4.1.2 **A** | `src/App.jsx:1764`–`:1775`, `:1829`–`:1844` |
| 3 | `Pill` lacks `aria-pressed`; `Section`'s disclosure lacks `aria-expanded` | 4.1.2 **A** | `src/ui/index.jsx:115`, `src/App.jsx:1029` |
| 4 | No announcement on screen change | 4.1.3 **AA** | route level; worst at `src/App.jsx:1201` |
| 5 | Empty-night labels in the day strip print at ~1.08:1 | 1.4.3 **AA** | `DayChip`, `src/ui/index.jsx` |

- **The sharpest of these is item 1**, and it measured worse than it reads. The Care screen exposes six focusable elements — the profile button and the five tab-bar buttons. Its five activity rows are not focusable and neither are the five circular play controls inside them, which look like buttons and are not. A keyboard or Switch Control user who lands on the screen that is the paper's central design contribution can do one thing: leave it.
- **Items 1 to 3 are all Level A**, and all three are places where a shared component already does the right thing and a hand-rolled call site does not. Small diffs.

---

## 3. Traceability

### 3.1 Micro-care activities carry no citation keys — **technically consistent, practically a hole**

- **Paper**: "the traceability check confirms that each planning rule corresponds to at least one supporting study, and is performed against citation identifiers recorded on each **plan item**."
- **Build**: plan items in `src/planner.js` carry `src: [...]` and `why:`, enforced by `src/planner.test.js:408–427` against `src/citations.js`. The five `CARE` entries (`src/App.jsx:36`) carry neither.
- **Status**: the sentence is literally true — care activities are not plan items. But they *are* recommendations, and `albulescu2022` / `tucker2003` already support stretching and controlled breathing.
- **To close**: add `src` and `why` to `CARE` and widen the test.
- **Paper now**: scoped. Ch. III says the check runs against "each generated plan item," and Comment 29 records the care activities as the outstanding case.

---

## 4. Assessment activities described but not performed

These are methodology, not code. All are written in the future-neutral present tense, which is standard, but none has been executed.

| Activity | Paper location | Status |
|---|---|---|
| Expert heuristic review | Ch. III, *Verification and Validation* | not conducted |
| Scenario-based testing | Ch. III, *Verification and Validation* | no artifact in repo |
| Evaluation instrument (adapted Goli-Cruz rubric) | Ch. III, *Verification and Validation* | not written |
| Traceability report output | Ch. III | test passes; no report is produced for the appendix |

Verification that **is** real: `planner.test.js`, `stats.test.js`, `time.test.js`, `storage.test.js`, `mockNights.test.js`, `share.test.js` — the paper's claim of "automated unit tests over the scheduling, statistics, and time-arithmetic modules" is accurate.

---

## 5. Specification artifacts referenced but absent

- **Functional requirements** — Table 1 covers non-functional requirements only. The paper cites MMS 149 Module 3's FR/NFR split but never lists the FRs. The Reflection and Care screens are now described in Ch. II, so the FR list is mostly written; it just is not gathered anywhere.
- **Use-case diagram** — suggested in `docs/reference-integration.md` §2.2, still absent.
- **Creative brief** — MMS 174 Module 4's seven headings; flagged in `reference-integration.md` §5.5, still absent.

---

## 6. Citation hygiene

- **Esteves year.** Cited as `(2025)`. The guide is labelled 3rd Trimester A.Y. 2025-2026 but its schedule runs 15 June – 5 September **2026**. Confirm before the reference list is final; it appears in `sample-paper.html` four times and in `reference-integration.md`.
- **MMS 149 module authorship** unresolved — the five module PDFs carry no author line; cited as anonymous corporate works. `reference-integration.md` §5.3.
- **DeRose pagination** — the available copy is a reprint with its own numbering; journal pages are 3–26. Section headings are used as locators instead, which is safe.
- **Course materials in the reference list** — flagged in Comment 2; confirm the panel accepts unpublished course materials.

---

## 7. Stale assets

- `reflection-tab.png` (repo root) shows the pre-`Select` pill grid and pill-row reflection questions. The current screen uses native `<select>` controls (`src/ui/index.jsx:160`). Do not source a figure from it — and note that the paper's Comment 22 argument depends on the native controls, so a stale screenshot actively contradicts the text.

---

## Priority

1. **2.5 items 1–3** — three Level A failures, all small diffs, and the last thing standing between the build and a clean audit. Item 1 is the one to fix first: it locks keyboard users out of the care player entirely.
2. **1.3 reminders** — now declared rather than implied, so the paper is safe either way. Still the largest thing the build does not do, and the premise of the thesis is timing.
3. **2.4** — run the WCAG-EM tool once 1 lands, and the procedure the paper describes becomes a procedure that was followed.
4. **3.1** — `src`/`why` on `CARE` is a small diff and removes the only place where a recommendation escapes the traceability claim.
5. **5** — the functional requirement list is mostly written across Ch. II and Ch. III and only needs gathering into one table; the use-case diagram and creative brief are still absent.
6. **6** — the Esteves year is a two-minute check that a panelist can catch in one.

Closed since this document was written: **2.1**, **2.2** and **2.3** in the build, then in the paper's audit section on 2026-08-18.
