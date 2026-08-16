# Paper vs. Build

What `docs/sample-paper.html` asserts or describes that the prototype does not yet do, as of 2026-08-14 (commit `e8db150`).

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

### 1.3 Reminders and notifications — **undeclared**

- **Paper**: Ch. II, *Content architecture* — an item "can be rendered as a timeline entry, a reminder, or an exported record." `docs/research-summary.md` goes further and lists "a notification and reminder component" as an MVP component.
- **Build**: no `Notification`, no service worker, no scheduling. `REMINDERS` (`src/App.jsx:909`) is a list of **labels** used to describe the plan in copy — it delivers nothing.
- **Risk**: this is the largest undeclared gap. A night-shift tool whose whole premise is timing, that cannot interrupt the user at the right moment, invites the question directly.
- **To close**: either build it, or add one clause to the *Content architecture* paragraph in the same form used for audio.

### 1.4 Printed plan — **partially true**

- **Paper**: "an exported record" (softened from "a printed plan").
- **Build**: JSON export exists (`exportData`, `src/App.jsx:2877`) plus a textarea fallback. No print stylesheet, no `@media print`, no human-readable export.
- **Status**: the sentence as now written is accurate. A literal *printed plan* is not implemented.

---

## 2. Accessibility

### 2.1 Contrast remediation — **declared, with measured values**

- **Paper**: Ch. III, first audit finding — "2.51:1 in the light theme and 3.17:1 in the dark theme… remediation is outstanding rather than complete."
- **Build**: unchanged in `src/tokens.js`. Measured:

| Token | Value | On surface | Ratio | AA body text (4.5:1) |
|---|---|---|---|---|
| `WARM.faint` | `#A9A398` | card `#FFFFFF` | **2.51** | fail |
| `WARM.faint` | `#A9A398` | bg `#F2F0EA` | **2.20** | fail |
| `DARK.faint` | `#6E6B76` | card `#1E1E26` | **3.17** | fail |
| `DARK.faint` | `#6E6B76` | bg `#121218` | **3.58** | fail |
| `WARM.muted` | `#78736A` | bg `#F2F0EA` | **4.13** | fail |
| `WARM.muted` | `#78736A` | card `#FFFFFF` | 4.71 | pass |
| `DARK.muted` | `#96939E` | card `#1E1E26` | 5.49 | pass |

- **Note**: the earlier draft claimed this "was adjusted." It was not. The paper now says so.
- **Also not yet in the paper**: `WARM.muted` on `bg` at 4.13:1. It is used for the intro paragraphs on both the Reflection and Care screens (`src/App.jsx:1729`, `:1918`), which sit on `T.bg`. Add it to the finding or fix the token.

### 2.2 Reduced motion — **declared**

- **Paper**: third audit finding — "the prototype does not honor the operating system's reduced-motion preference."
- **Build**: no `prefers-reduced-motion` anywhere in `src/`. The `CarePlayer` circle transitions on every interval (`src/App.jsx:156–160`), and `screenAnim` animates tab changes.
- **Mitigation already present and claimed**: the pause control (`src/App.jsx:191`) satisfies the moving-content criterion. That part is true.

### 2.3 Domain hue used as text colour — **undeclared**

- **Build**: the Care screen renders the duration label in `DOMAIN.caffeine.hue` on card (`src/App.jsx:1952–1955`) = **3.94:1**, below 4.5:1 for normal-size text. Other domain hues on the light card: `light` 2.30, `water` 2.99, `movement` 3.00, `food` 3.37.
- **Status**: a fourth genuine finding the paper does not mention. Domain hues are safe as *icon and accent* fills; they are not safe as small text.

### 2.4 WCAG-EM audit artifact — **procedure described, artifact missing**

- **Paper**: Ch. III now describes a preliminary review followed by a structured WCAG-EM evaluation "recorded in its report format."
- **Build**: no report exists. The contrast numbers above were computed for this document; nothing is stored in the repo.
- **To close**: run the WCAG-EM Report Tool over the implemented screens and put the output in an appendix. The scope statement must name only the four built screens.

---

## 3. Traceability

### 3.1 Micro-care activities carry no citation keys — **technically consistent, practically a hole**

- **Paper**: "the traceability check confirms that each planning rule corresponds to at least one supporting study, and is performed against citation identifiers recorded on each **plan item**."
- **Build**: plan items in `src/planner.js` carry `src: [...]` and `why:`, enforced by `src/planner.test.js:408–427` against `src/citations.js`. The five `CARE` entries (`src/App.jsx:36`) carry neither.
- **Status**: the sentence is literally true — care activities are not plan items. But they *are* recommendations, and `dallora2020` / `tucker2018` already support stretching and controlled breathing.
- **To close**: add `src` and `why` to `CARE` and widen the test, or add one sentence scoping the check to the generated plan.

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

1. **1.3 reminders** — the only undeclared gap large enough to be challenged on its own.
2. **2.3 hue-as-text** — one more measured finding, cheap to add, strengthens the audit.
3. **2.1 / 2.2** — declared open; fixing the tokens and adding a `prefers-reduced-motion` guard would let both findings be reported as closed.
4. **3.1** — `src`/`why` on `CARE` is a small diff and removes the only place where a recommendation escapes the traceability claim.
5. **6** — the Esteves year is a two-minute check that a panelist can catch in one.
