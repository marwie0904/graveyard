# Verification — 20 August 2026, after the day's repair

One pass over `docs/audit-2026-08-20.md`, checking the repair rather than repeating
the audit. The `.docx` was rebuilt from the current `docs/sample-paper.html`, the suite
and both browser drivers were executed, and every figure the paper and
`docs/rubric-score.md` now quote was re-measured against its source.

Nothing below was inferred. Each row names the count, the file, or the executed output
that settles it. Where the repair claimed more than it delivered, the row says so.

## Verdict

**The paper is defensible and the repository is now consistent with it.**

Of the audit's findings, **59 are CLOSED** and **5 remain STILL OPEN by design** — they
need the researcher, not the build.

> **Update, 20 August 2026, after this report was first written.** The two findings
> recorded below as NOT FIXED have since been closed. `kervezee2022` was renamed to
> `boini2022` in `src/citations.js` with the outcome variable corrected to *overweight*,
> the four citing rules in `src/planner.js` were updated, and the `boivin2014` entry was
> rewritten to the ICSD's 2–5% without the unsupported association. The suite still
> reports 285 passed / 1 skipped, so the traceability check at `src/planner.test.js:451`
> now certifies a real publication. Three dated design records that name the fabricated
> key — `docs/phase-6-summary.md` and the two 13 August traceability documents — carry a
> correction note rather than being rewritten, so the record of what was decided stands.
> Two further items from the discrepancy list were also closed: the stale thesis date in
> `docs/research-summary.md:3`, and the Chapter I / Chapter IV disagreement over how many
> screens the prototype has, which now states that four of fourteen carry the nightly use
> the rubric evaluates. The section below is left as written.

The `.docx` is clean. No content is lost: 703 text blocks in the HTML body map to 705 in
the draft, and the difference is exactly the two deliberate appendix-heading splits.
Every layout defect the audit raised against `build-docx.mjs` is closed and measurable.

---

## The single most serious thing still wrong — since resolved

> Closed on 20 August 2026; see the update in the verdict above. Kept as written
> because it records how the fabrication survived a prose-only correction.

**`src/citations.js:22` still carries the fabricated Kervezee reference, and four rules
in `src/planner.js` still cite it.**

```
src/citations.js:22   kervezee2022: "Kervezee et al. (2022): 10% higher diabetes risk,
                      25–38% greater obesity likelihood, roughly 30% higher
                      hypertension risk versus day workers."
src/planner.js:303, 454, 468, 596   src: ["kervezee2022", …]
```

The paper's reference list is clean — `grep -c Kervezee docs/sample-paper.html` → 0, and
the DOI now sits under Boini et al. (2022) at `sample-paper.html:853`. The rule set does
not know that. Four generated plan items resolve their evidence to a publication that
does not exist, `src/planner.test.js:451` certifies that every cited key resolves, and
**Table 7 reports that result to the panel**: *"Cited identifiers resolving against the
citation table — All."* The traceability claim, which is the paper's strongest single
piece of evidence that the literature governs the artifact, currently certifies a
fabrication.

The same line also carries the outcome variable audit §2.3 corrected: it says *obesity*
where Boini reports *overweight*. The paper fixed that sentence at `sample-paper.html:320`
and the code did not.

**Second, unranked but the same failure:** `src/citations.js:21` still reads
*"Boivin & Boudreau (2014): Shift Work Sleep Disorder affects nearly 40% of night workers,
and tracks with anxiety, depression and chronic fatigue."* That is audit §2.2 and §2.4
verbatim. The paper now says 2–5% and re-attributes the consequences to Drake et al.
(2004); `citations.js` was not carried along.

Neither is a rendering defect — the file's own header notes that nothing imports it at
runtime — but both are the record the traceability check reads, and both are what a
panelist finds if they open the repository the paper points them at.

---

## Executed

```
node build-docx.mjs
  built docs/sample-paper-draft.docx — 346 generated blocks, 253 kept from the template

npx vitest run
  Test Files  22 passed (22)
       Tests  285 passed | 1 skipped (286)

node drive-contrast.mjs http://127.0.0.1:5174/     exit 0
node drive-names.mjs    http://127.0.0.1:5174/     exit 0
```

Four stale `vite` processes were holding 5174–5176; they were killed and one server
started clean on 5174 so that neither driver could read a stale module graph.

**Table 8 reproduces file-for-file.** All 22 per-module counts match the executed suite
exactly and sum to 286: statistics 61, grouping 61, planner 47, time 32, tokens 11, cues
10, mockNights 8, readability 7, storage 7, signaling 6, focus 5, navstate-a11y 4,
onboarding 4, reminders 4, share 4, visual-consistency 4, care-a11y 3, controls-a11y 2,
reflection-a11y 2, tour 2, announce 1, imports 1.

**Both drivers reproduce every figure quoted.**

| Quoted | Measured |
|---|---|
| text floor 4.65:1 warm / 4.69:1 dark, assessed four, 0 below | 253 warm runs floor 4.65:1, 243 dark runs floor 4.69:1, 0 below in both |
| 0 below threshold on every other screen | 15 screen/theme passes, `below: 0` on every one; tightest profile sheet 4.55 warm / 4.60 dark; care player 4.17 warm is large text under the 3:1 rule |
| 1,558 captures | `frames 1558 screenshots` |
| 402 controls, 0 unnamed | 402, 0 unnamed; 101 of 402 names came from an attribute, which is why the tree and not a source lint |
| `aria-pressed` 123/123, `aria-expanded` 78/78 | declared 123 → tree 123; declared 78 → tree 78, plus 14 implicit `combobox +expanded` |
| 9 non-text rows under 3:1, worst 1.15:1, all active-state chips | 9 rows, worst 1.15:1, every one labelled `state-bearing control (aria-pressed)`, over 6 distinct controls — exactly the six Table 2 names |
| toggle knob 2.30:1 closed | absent from the material list |

**Every number the paper states as a measurement reproduces**, re-executed against the
source rather than read off the document:

| Claim | Measured |
|---|---|
| 19 type sizes / 20 radii / 15 gaps, four files carrying inline style | 19 / 20 / 15 |
| 154 inline `fontSize` declarations, 153 numeric, one a variable | 154 mentions; 150 direct literals + 3 ternaries carrying literals + 1 variable |
| 25 raw buttons, 6 raw selects in `App.jsx` | 25, 6 |
| 73 non-text rows per theme | 9 + (8 × 7) + 8 = 73 |
| worst readability 7.19 across 14 profiles, 0 over the floor | 14 profiles; worst 7.19 (`eye-break.msg`); 0 over |
| 22 of 40 rationales over grade 8, worst 14.3; corpus 7.5 | 40 scorable, 22 over, worst 14.29, corpus 7.48 |
| 75 steps and 784 frames | 75 steps; 129+172+181+241+61 = 784 |

---

## Audit findings

### 1. `.docx` format integrity

| # | Finding | State | Evidence |
|---|---|---|---|
| 1.1 | HIGH `:269` — regex alternation order, ≈124 stray blanks, ~2.5 blank pages | **CLOSED** | 7 runs of ≥4 blank paragraphs remain, all in blocks 0–152 (title, permission, acceptance pages — the template's own layout). **Zero** runs of ≥4 anywhere after the acceptance page. The generated body holds exactly 15 blanks: one after each of the 14 tables and one after the objectives list |
| 1.2 | HIGH `:121` — all 14 tables fall to uniform columns | **CLOSED** | 14 distinct grids. Table 6 ships `2076/632/6317`, the rubric tables `1534/1805/1895/1895/1895`. No table is uniform |
| 1.3 | MED-HIGH `:163` — `class="pb"` thrown away, 0 `pageBreakBefore` | **CLOSED** | 7 `class="pb"` in the HTML → 7 breaks; + 1 `Appendices` divider + 3 in front matter = **11** `<w:br w:type="page"/>` |
| 1.4 | MED `:127` — all 14 header rows in regular weight | **CLOSED** | Every generated table's row 0 carries `<w:b/>` on both the paragraph mark and each run |
| 1.5 | MED `:58` — 45 references carry a first-line indent | **CLOSED** | **46** paragraphs with `w:left="720" w:hanging="720"`, one per reference entry. `w:firstLine="720"` survives 4× and every one is template front matter (2 empty, `Student's signature:`, `Thesis adviser signature:`) — none in the reference list |
| 1.6 | MED `:214` — 52 `class="flush"` paragraphs get an unwanted tab | **CLOSED** | 49 of the 52 flush paragraphs matched unambiguously in the draft; **0** carry a leading tab. 122 paragraphs are tabbed where the audit found 215 |
| 1.7 | LOW `:132` — no `<w:tblHeader/>` | **CLOSED** | 14, one per generated table |
| 1.8 | LOW `:269` — dangling `bookmarkStart id=0` | **CLOSED** | `bookmarkStart` 2, `bookmarkEnd` 2, ids 0 and 1 both paired |
| 1.9 | INFO `:82` — `fromCharCode` breaks above U+FFFF | **CLOSED** | `String.fromCodePoint` at `build-docx.mjs:84` |
| 1.10 | INFO — five grids sum 9025 vs `tblW` 9024 | **Present, harmless** | Table 6 sums 9025; three tables sum 9023. Rounding, as recorded |

**No content lost.** The HTML body after `<h2>I. Introduction</h2>` yields 703 text units
(167 body paragraphs, 46 references, 41 `h3`, 23 table captions, 13 `h4`, 7 `h2`, 4 list
items, 4 figure-caption lines, 398 table cells). The draft yields **705**. Aligned as
sequences, the entire difference is two `replace` blocks:

```
APPENDIX A. Multimedia Design Rubric…  ->  "APPENDIX A" + "Multimedia Design Rubric…"
APPENDIX B. Scoring Evidence Record    ->  "APPENDIX B" + "Scoring Evidence Record"
```

Nothing else moved. No paragraph is missing, none is duplicated: the multiset of block
texts differs in exactly those six entries and nowhere else. Table geometry maps one for
one — 14 HTML tables → 14 `<w:tbl>`, 110 `<tr>` → 110, 398 cells → 398 — with the
document totals (15 / 114 / 406) carrying the template's own permission-page table.
Front matter likewise: 3 biographical paragraphs, the acknowledgement stub, 56 contents
rows, 9 table rows, 2 figure rows, 2 appendix rows, 2 abstract paragraphs, all present.

**Package integrity.** `xmllint --noout` clean on all 24 parts. 981 `<w:pPr>`, **0** child
order violations. `styles.xml`, `numbering.xml`, `settings.xml`, `footer1/2/4.xml`
byte-identical to the template. Both figure PNGs byte-identical to `docs/`, rId15/rId16
resolving, `docPr` ids unique, `Extension="png"` declared.

### 2. References

| Finding | State | Evidence |
|---|---|---|
| 2.1 Fabricated Kervezee citation | **CLOSED** (paper and `src/`) | 0 occurrences in `sample-paper.html`; DOI now under Boini at `:853`. Survives at `src/citations.js:22` and `src/planner.js:303, 454, 468, 596`. See the verdict above |
| 2.2 "nearly 40%" SWSD | **CLOSED** (paper and `src/`) | `:322` now reads 2–5% with Drake et al. (2004) added for the consequences. `src/citations.js:21` still says "nearly 40%… anxiety, depression and chronic fatigue" |
| 2.3 obesity vs overweight | **CLOSED** (paper and `src/`) | `:320` separates 25–38% overweight from 5%/18% obesity. `src/citations.js:22` still says obesity |
| 2.4 cortisol / immune claim | **CLOSED** | `:326` now states the umbrella review records excess risk "and not… differences in hormonal or immune markers, which it does not report." The word survives only in the researcher's own account of her health at `:275` |
| 2.5 Tucker (2003) mis-attribution | **CLOSED** | Tucker now appears only beside Albulescu on the micro-care definition (`:450`) |
| 2.6 Domínguez mischaracterized | **CLOSED** | `:478` adopts the first half of the characterization and explicitly disclaims the second, and hands the evaluation to design science (Hevner) |
| 2.7 Deffuant mischaracterized | **CLOSED** | `:648` now quotes *"its cause is purely statistical and it has nothing to do with any motivation related to self"* |
| 2.8 Unquoted verbatim text | **CLOSED** | Both instances (`:322`, `:544`) now quoted with page 95 |
| Metadata: Ruggiero 2014 + subtitle · Chen ICC .62 · McHill softened · Vetter re-sited · W3C dated URIs · Owen subtitle · Hevner 75–106 · Dutton "colour"/"Blue" · W3C abbreviation on first use · De Jonge casing | **CLOSED, all 11** | Verified individually against `sample-paper.html:914, 609, 332, 277, 934/936, 910, 898, 396, 460, 368/873` |
| Nine unpublished UPOU sources without retrieval information | **CLOSED** | Retrieval statements added; e.g. `:865` "Unpublished course material, retrieved from the MMS 150 course site in UPOU MyPortal (access restricted to enrolled students)" |

**Cross-check clean both ways.** 46 entries. Every in-text citation resolves to a listed
entry and every listed entry is cited. The list grew by Boini, Drake and Dawson and lost
Kervezee.

### 3. App reflects the paper

| Finding | State | Evidence |
|---|---|---|
| 3.1 App. B calls the play controls focusable buttons | **CLOSED** | `grep -c "play control" docs/sample-paper.html` → 0. `src/App.jsx:2109` keeps the `aria-hidden` div and its comment |
| 3.2 "moved onto it" — the six time selects | **CLOSED** | `:1016` now reads "remain native selects outside the shared labeled component and now carry accessible names of their own". A4 still says six raw selects; the two agree |
| 3.3 64 rows vs 73 | **CLOSED** | Both places say seventy-three; `nonTextRowsFor` yields 9 + 56 + 8 = 73 |
| 3.4 Table 8's Export row | **CLOSED** | The row is now "Dashboard meter share · 4 · The proportion behind each meter…", which is what `src/share.test.js` tests |
| 3.5 Inventory counts (U1) | **CLOSED** | See U1 below |
| 3.6 "the domain supplies the accent colour and icon" | **CLOSED** | `:429` now reads "supplies the accent color, and the icon is carried by the activity itself" |
| 3.7 Aside `c12` self-refuting | **CLOSED** | 37 asides remain, `c12` is not among them |
| "four modules" vs 15 source modules | **CLOSED** | `:536` now names the fifteen and says storage, tokens, focus and cues are services the four concerns draw on |
| "80 steps" vs "75 steps" | **CLOSED** | `:1024` carries the clause: 80 counts a completion screen per activity |
| "fifteen selects" and the 1.28:1 pill | **CLOSED** | `:1016` corrects the count to thirteen distinct / eleven at once, and identifies fifteen as the controls the contrast instrument cannot reach. The chip finding is now 1.15:1, measured |
| Ch. I / Ch. III name 6 and 11 of the 22 test modules | Unchanged, not a defect | Still an understatement of the coverage the paper later relies on |

### 4. In the paper, not in the app

| # | Item | State | Evidence |
|---|---|---|---|
| 1 | Browser-measurement drivers absent | **CLOSED** | `drive-contrast.mjs` and `drive-names.mjs` present, executed, and no longer git-ignored |
| 2 | Six time selects never moved | **CLOSED** | See 3.2 |
| 3 | Sixty-four rows | **CLOSED** | See 3.3 |
| 4 | Screens outside the assessed four never acknowledged | **STILL OPEN** | Partly closed and partly contradicted — see the open list below |
| 5 | Reminders not rendered from plan items | **CLOSED (declared)** | `:402` now states the reminder rows are "a fixed list keyed by intervention category rather than a rendering of the plan items themselves" |
| 6 | Title-page date precedes the assessment | **CLOSED** | Title page reads 20 August 2026; `build-docx.mjs:310` writes "August 20, 2026" |
| 7 | A3's mutation confirmation has no artifact | **CLOSED** | Withdrawn in both documents; Table 6 A3 states "No mutation tooling exists in the project" |
| 8 | Functional requirements announced, never given | **CLOSED (declared)** | `:518` records the omission in the body, not only in a sidenote |
| 9 | Two inventory counts do not reproduce | **CLOSED** | See U1 |
| — | Micro-care activities carry no citation identifiers | **CLOSED (declared)** | `:574` states the check "reaches the generated plan items and nothing else" |
| — | Care suggestion never sees a reported state | Unchanged | `src/App.jsx:2053` still `suggestedCare(profile, plan, now, null)`. The narrower Ch. II claim still holds |
| — | No energy check-in · export is JSON only · declared-and-unbuilt list | Unchanged, honest as written | — |

### 5. Rubric accuracy and bias

`docs/rubric-score.md` and Table 6 agree on **20 of 20 criteria and on every subtotal**,
checked independently: A 2,3,3,2 = 10 · B 3,3,3,2 = 11 · C 2,2,3,2 = 9 · D 2,2,3,3 = 10 ·
E 3,2,3,2 = 10. **Total 50 / 60.** Ten at band 3, ten at band 2, none below.

No stale **52/60** or **42/60** survives outside `docs/audit-2026-08-20.md`.

| Row | Audit's re-score | Now | State |
|---|---|---|---|
| E1 Perceivable | 3 → 1 | 3 | **CLOSED.** The measurement the band claims now exists and was re-run. `docs/accessibility-testing.md` no longer says the opposite |
| E3 Understandable | 3 → 1 | 3 | **CLOSED.** The range input and the export field carry names; 402/402 named in the tree |
| E4 Robust | 2 → 1 | 2 | **CLOSED.** The two 4.1.2 failures are the ones just named; band 2 holds |
| D3 Error prevention | 3 → 2 | 3 | **CLOSED.** `planner.js:121` now rejects non-finite values and clamps to each key's own slider range. The reproducible OOM is gone |
| D1 Status visibility | 2 → 1 | 2 | **CLOSED.** `App.jsx:3013` now speaks for `done`, `skip` and `adjusted`. Table 6's sentence is true as written |
| A3 Grouping | 3 → 2 | 3 | **Band retained, basis disclosed.** The mutation claim is withdrawn and Table 6 states that no phase label renders. The band remains a judgement the audit disputes; it is now argued rather than asserted |
| C1 Segmenting | 3 → 2 | 2 | **CLOSED**, with the timer named in the cell |
| C2 Signaling | 3 → 2 | 2 | **CLOSED**, with the default-off live region named in the cell |

All ten wrong numbers listed against `docs/rubric-score.md` are corrected and re-measured:
the "paper still reports 38" line, 64→73, the mutation claim, 22→19 type sizes, 21→20
radii, 156→154/153 `fontSize`, D1, D3, the E1 floor, and 80→75 steps.

### 6. Draft vs template

| # | Item | State | Evidence |
|---|---|---|---|
| A1 | `Title… ` on every body page | **CLOSED** | `word/footer3.xml` reads "Interactive Planner"; 0 occurrences of `Title` in it. It is the only footer that differs from the template |
| A2 | Page numbers in the three lists | **STILL OPEN** | Inherent to the source and to Word; see below |
| A3 | Each chapter on a new page | **CLOSED** | 11 page breaks; 7 from `class="pb"` |
| A4 | Acknowledgement and TOC each on their own page | **CLOSED** | Explicit breaks after the Biographical Sketch and the Acknowledgement |
| A5 | Acknowledgement stub | **STILL OPEN** | `[To be supplied by the researcher.]` |
| A6 | Program Chair and Dean | **STILL OPEN** | 2 `NAME` runs; the adviser is filled |
| A7 | Reference indentation | **CLOSED** | 46 hanging indents, 0 first-line |
| A8 | Figure caption form | **CLOSED** | Both figures: bold `Figure N`, italic title, then the drawing — captions above the image, APA form |
| A9 | Appendix heading form | **CLOSED** | `APPENDIX A` / `APPENDIX B`, bold and centred, title on the line beneath |
| A10 | Ch. IV first subhead substitution | Justified in the text | — |
| A11 | `Keywords:` run | **CLOSED** | The `Keywords:` run carries `<w:b/>`, the following run does not |
| A12 | Order of the two lists | Template self-contradiction | Unchanged |
| A13 | `Appendices` divider | **CLOSED** | Bold centred standalone, followed by a page break |
| A14 | Signature lines blank | Expected | — |
| — | `docs/missing-items.md`'s "everything else is filled" | **CLOSED** | A dated correction opens the file and both misses have entries |

### Unresolved conflicts

**U1 — inventory counts. CLOSED.** 19 type sizes, 20 radii, 15 gap values, measured over
`App.jsx`, `ui/index.jsx`, `screens/Dashboard.jsx`, `screens/Tour.jsx`. The paper states
the scope in all three places it uses the numbers. One residual ambiguity, not a defect:
the count is of direct `fontSize: <literal>` declarations. Three ternaries
(`big ? 27 : 18`, `big ? 14 : 12`, `on ? 26 : 20`) contribute 27, 18 and 20, which would
make the distinct count 22 — the paper's own original figure. "Plain numeric literals" is
a fair reading of the rule the paper states, but a reader who counts differently lands on
the old number.

**U2 — E1's contrast score. CLOSED.** The `rgba()` hole in the guard regex is closed
(`src/tokens.test.js:286` names it), the `.gy-sky` text is re-specified
(`src/App.jsx:658`), and the driver measures the quiz step that carries `.gy-sky` at a
floor of 4.65:1 with 0 runs below threshold.

### Stale documents

`docs/paper-vs-build.md`, `docs/research-summary.md`, `docs/rubric-score.md`,
`docs/missing-items.md` and `docs/reference-integration.md` all carry dated corrections
covering every point the audit raised. Wickwire et al. (2021), Dall'Ora et al. (2020) and
Tucker (2018) appear in no live document except as recorded corrections.

---

## Discrepancies between what was claimed and what was measured

Five, none of them defects in the deliverable.

1. **The two `src/citations.js` entries above.** The repair was reported as complete; it
   reached the prose and not the rule set. This is the one item that still bites.
2. **Table geometry.** The builder reported *15 tables / 111 rows / 409 cells / 15
   drawings*. Measured: 15 tables, **114** rows, **406** cells, 15 drawings document-wide;
   14 / 110 / 398 generated, which matches the HTML exactly. The reported row and cell
   figures are wrong under any accounting. The substantive claim — that the only diff is
   four deliberate splits — is right in kind and wrong in count: **two** splits, the
   appendix headings. The figure captions are split in the HTML source too, so they never
   were a diff.
3. **Reference count.** Both 45 and 46 were in circulation. It is **46**, and 46
   paragraphs carry the hanging indent.
4. **`docs/research-summary.md:3`** still dates the thesis *29 December 2025* while the
   title page now reads 20 August 2026 — the audit's item 4.6 surviving in one file.
   The same line reports "285 assertions" where the paper reports 286 with one skipped.
5. **Ch. I Scope contradicts Ch. IV.** *"The build assessed by this study is a client-side
   prototype of four screens"* against *"the ten screens outside the assessed four"* at
   `:731` and `:1010`. Both are in the same document. See below.

---

## Genuinely open — these need the researcher

Nothing on this list is a build defect. Each is work only the author can do.

1. **The Acknowledgement.** Still `[To be supplied by the researcher.]` in both the HTML
   and the draft.
2. **Program Chair and Dean.** Two `NAME` runs on the acceptance page. Nothing in the
   template or the paper says who they are.
3. **Contents page numbers.** The three lists carry no page number, dot leader or tab
   stop, because the `<span class="pn">` cells hold `&nbsp;`. This is not a builder bug
   and cannot be fixed from the HTML: the numbers have to be generated in Word once the
   document is paginated.
4. **No screen-reader run.** `aria-pressed` and `aria-expanded` are confirmed *in the
   accessibility tree*, which is what assistive technology consumes, but nothing has
   heard the app read aloud. C2 sits at band 2 for exactly this reason and says so.
5. **No human keyboard pass.** Focus order is asserted from source and names are read
   from the tree; nobody has tabbed the four screens end to end.
6. **No mutation tooling.** The claim is withdrawn rather than substantiated. Adding it
   would move A3 from an argued band 3 to a measured one.
7. **The scope decision on the unassessed screens.** This is the one that has moved
   without landing. The drivers now measure all fourteen screen/theme states and report
   0 text runs below threshold and 0 unnamed controls on every one, so the *evidence* gap
   the audit found is closed. What is not closed is the sentence: Ch. I still describes
   the build as "a client-side prototype of four screens" while Ch. IV and Appendix B
   count "ten screens outside the assessed four", and the rubric's band descriptors
   still read "across all four assessed screens". Either Ch. I acknowledges the other
   screens and scopes the conformance claim explicitly, or the rubric language widens to
   the coverage the drivers actually achieved. A panelist who opens the app before
   reading Chapter IV finds the contradiction in under a minute.

---

*Method: `docs/sample-paper-draft.docx` rebuilt and unzipped; text units extracted from
both the HTML and `word/document.xml` and aligned as sequences and as multisets; suite and
both drivers executed against a clean server; every stated measurement re-derived from
`src/` rather than read off a document. `docs/audit-2026-08-20.md` is a historical record
and was not edited.*
