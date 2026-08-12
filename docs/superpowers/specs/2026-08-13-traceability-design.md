# Phase 6 — Traceability (the `src` field)

The last phase, and the only one whose deliverable is a sentence in the paper
becoming true rather than a behaviour on a screen.

Spec for Phase 6 of `docs/implementation-roadmap.md`, specified in
`docs/app-design-basis.md` §3. It is orthogonal to Phases 0–5: it touches no
stored state, no boundary, no derived number, and no rendered pixel.
**`generateTimeline` does not change; its signature stays `(profile, logs, now)`.**
It gains one field on the objects it already returns.

Chapter III of the draft says:

> The traceability check confirms that each planning rule corresponds to at
> least one supporting study, and is performed against **citation identifiers
> recorded on each plan item alongside its user-facing rationale**, so that the
> check is executed against the running system rather than against separately
> maintained documentation.

`src/planner.js` emits 25 distinct plan items and not one of them records a
citation identifier. The sentence is false today.

Four parts, and the third one is the phase:

1. `src: [...]` beside the existing `why:`, on every one of the 25.
2. `src/citations.js` — the keys resolve to something, and to nothing invented.
3. The mapping, item by item, against the sources this repo actually holds.
4. Four assertions in `planner.test.js` that fail the build when an item has no
   citation.

There is no fifth part. Nothing here is user-visible, and Part 5 below is the
argument for why not.

---

## The problem, stated from the code and the corpus

### Two bibliographies, and only one of them is about what the app recommends

The brief points at `docs/reference-integration.md` as where the citations live.
It is not, and finding that out changes the phase:

| Document | What is in it | Circadian entries |
|---|---|---|
| `docs/reference-integration.md` (575 lines) | Course materials — MMS 149/150/151/170/171/174 — plus DeRose, Dutton, Heinrich, WCAG. The evidence for **how the app was built and how it looks** | Burke, Oriyama, Dall'Ora, Wickwire appear only as passing mentions inside prose about the *other* argument. No entries. |
| `docs/research-summary.md` (29 lines) | The thesis's own summary. The evidence for **what the app recommends** | All of them, and this is the only place they exist. |
| `docs/sample-paper.html` reference list | The sections the course materials touch | *"[Circadian and occupational health sources from Chapters I–II are omitted from this excerpt.]"* |

Grepped for every author name in the corpus: `Burke McHill Oriyama Ruggiero
Geiger Dall Tucker Kervezee Boivin Wickwire Vetter Silvani Baron Owen Cho
Karasek Jonge`. Thirteen of the seventeen appear in `research-summary.md` and
nowhere else in the repo. **`research-summary.md` is the entire evidence base for
what the planner tells a shift worker to do**, and it holds author-year plus a
one-line finding — no volumes, no page numbers, no DOIs. That constraint decides
the shape of Part 2 and is the phase's hardest ceiling.

### The complete evidence base, verbatim from `research-summary.md`

Everything the planner is allowed to cite, and nothing else:

| Key | Finding as the corpus states it |
|---|---|
| `mchill2014` | Caffeine reliably boosts short-term alertness, but is a stimulant, not a circadian regulator |
| `burke2015` | Evening caffeine doses delay melatonin secretion and phase-delay the clock |
| `ruggiero2013` | Naps reduce sleepiness and improve vigilance despite transient sleep inertia |
| `geigerbrown2016` | Nap benefit, in the same finding |
| `oriyama2018` | Nap benefit varies by timing and duration |
| `dallora2020` | Micro-breaks — stretching, controlled breathing — restore alertness without disrupting workflow |
| `tucker2018` | The same finding |
| `cho2015` | Artificial Light Theory: blue-spectrum night light suppresses melatonin and shifts phase |
| `baron2015` | Circadian Rhythm Theory: chronodisruption drives sleep, metabolic and cardiovascular risk |
| `owen2010` | Sedentary Work Hypothesis: prolonged sitting compounds those effects |
| `boivin2014` | Shift Work Sleep Disorder affects nearly 40% of night workers; tracks with anxiety, depression, chronic fatigue |
| `kervezee2022` | 10% higher diabetes risk, 25–38% greater obesity likelihood, ~30% higher hypertension risk versus day workers |
| `wickwire2021` | Cognitive performance degrades with each consecutive night shift |

Three more are in the corpus and are deliberately **not** in the table:
`vetter2016` and `silvani2022` establish that night work produces chronodisruption
at all, and `dejonge2000`/Karasek is the Demand-Control anchor for user autonomy.
All three are framework-level: they justify the study, not any one rule. Putting
them on an item would be padding a citation count, which is the failure mode this
phase exists to prevent. They stay in the paper.

The corpus names **four** anchoring theories and this table keeps three, so the
criterion has to be stated before a reader finds the seam: a theory earns an item
key when the corpus states a **mechanism** an item can be checked against — blue
light suppresses melatonin (`cho2015`), prolonged sitting compounds the effects
(`owen2010`), chronodisruption drives the risk the whole plan is built around
(`baron2015`). Demand-Control names a relation between demand and autonomy that
no single item implements, which is why it sits with `vetter2016` and
`silvani2022` rather than on a card.

### What the corpus does not contain

Named now, because five items depend on it and no amount of reading will change
it:

- **Meal timing and night eating.** `kervezee2022` establishes the metabolic
  risk. Nothing establishes when to eat.
- **Hydration.** No source. Not one.
- **Visual ergonomics / eye strain.** No source. "Screen-heavy" appears once, as
  a description of the work, not an intervention.
- **Drowsy driving and post-shift commute crash risk.** No source. This is the
  serious one; see `commute` in Part 3.
- **Bright light as an alertness countermeasure.** `cho2015` covers light as a
  circadian input. It does not cover using light to feel more awake.

The thesis's stated gap — *"almost no study specifies **when** in the shift to
apply them"* — is not one of these. That gap is the thesis's contribution, and
Part 3's rule turns on the difference.

---

## Part 1 — The field

```js
{
  id: "caff-cutoff", at: s.cutoff, category: "caffeine",
  why: `Caffeine takes hours to clear, so stopping now leaves time…`,
  src: ["burke2015", "mchill2014"],
}
```

**An array of plain string keys.** Not a string: ten items carry two entries and
four carry three, and `"burke2015,mchill2014"` is a string somebody has to
split. Not an object: there is no second thing to say about a key that the
citation table cannot say once. `app-design-basis.md` §3 already picked the array
and already picked the key format (`burke2015`, `oriyama2018` — lowercase
surname, four-digit year); this spec is not going to re-litigate a shape two
documents have agreed on. Compound surnames follow the same rule the corpus
already sets with `mchill2014`: all lowercase, `geigerbrown2016`, `dallora2020`.

**No `designSrc`.** `reference-integration.md` §0 floats a second field for the
evidence about presentation. Declined. The answer would be the same on all 25
items — DeRose for the content-object model, Goli-Cruz for hierarchy and
contrast, WCAG for the palette — because those decisions are architectural and
made once, in `tokens.js` and `ui/index.jsx`, not per item. Twenty-five copies of
one answer is not traceability, it is a field that always says the same thing.
The paper already makes those citations in prose, in the Chapter II sections
`sample-paper.html` reproduces. The claim this phase repairs is the one about
planning rules and supporting studies.

**The field costs nothing at any trust boundary.** Checked rather than assumed: an
item log stores `{ id, status, category }` (`App.jsx:2551`), the archive stores
folded NightRecords, and the export writes
`{ app, profile: stored(profile), logs, reflection, archive }` (`App.jsx:2660`).
No plan item is ever serialised. `src` adds zero bytes to `gy.v1`, zero bytes to
the export, and needs no `boot` validation — unlike every field Phases 1–5 added.
The other half of the same check: `grep -c src src/App.jsx` returns **0**. The
string does not occur in the presentation layer at all, so no render path can be
reading it by accident.

---

## Part 2 — `src/citations.js`, and what it is honestly allowed to contain

One file, one export, one line per key:

```js
/* The keys `planner.js` cites, and nothing else. Not the bibliography — the
   full APA entries live in the paper's reference list and, for the design and
   engineering half, in docs/reference-integration.md §6.
   Each line records what docs/research-summary.md states about the source and
   no more. Do not add a volume, page range or DOI you have not read off the
   paper itself: a fabricated locator is the one failure this file exists to
   prevent. */
export const CITATIONS = {
  burke2015: "Burke et al. (2015) — evening caffeine delays melatonin secretion and phase-delays the clock.",
  // …12 more study keys…
  structural: "Not a recommendation. A navigational marker for a shift boundary.",
  judgement: "Design judgement, not evidence. No supporting study for this rule exists in the project's research corpus.",
};
```

**Why a file, and why this one.** The test has to resolve a key, so the table has
to be code — parsing a markdown table is a parser nobody asked for. It is not at
the top of `planner.js` because a reference list is data *about* the rules, not a
rule, and because the thesis needs to point at it as a file; `planner.js` never
imports it and the keys stay inert strings to it. Its only importer is the test,
which is what a certificate looks like.

**The two markers live in the same object** because `structural` and `judgement`
are not sources but are read exactly like them. A second container would buy one
special case in the test for one saved line in the file, and §3 already settled
that trade — *"an explicit marker is cheaper to audit than a special case"*.

**What it may not contain.** The corpus gives author-year and a finding. It does
not give journal, volume, pages or DOI for a single circadian source, because
those live in Chapters I–II, which are not in this repo. Writing them from memory
would produce a file that looks more rigorous and is less true — precisely the
"looks true, is false" failure this phase is meant to close. The one-line form is
not laziness dressed up; it is the most the repo can prove.

---

## Part 3 — The mapping

### The rule that decides `judgement`

Every timing number in this planner is a synthesis, because the thesis's own
finding is that the literature does not specify timing. If "the exact minute is
not in a study" earned the marker, all 25 items would carry it and the marker
would mean nothing. So the line is drawn at the **intervention**, not the clock:

> `judgement` marks an item whose *intervention* has no supporting study in the
> corpus. It does not mark an item whose intervention is evidenced and whose
> *timing* is the study's own synthesis — that synthesis is the thesis's
> contribution, and the paper claims it as such.
>
> Where an array holds study keys **alongside** `judgement`, the studies name the
> risk the rule addresses. They do not support the rule.

That second clause is the part a hostile reader will test, so it is stated in the
file, in the test, and here.

### Recommendations with a genuine source — 13 of 25

| Item | `src` | Fit |
|---|---|---|
| `pre-nap` | `ruggiero2013`, `geigerbrown2016`, `oriyama2018` | Prophylactic pre-shift napping is squarely the nap literature; the item's own copy turns on duration, which is Oriyama's variable |
| `caff-window` | `mchill2014`, `burke2015` | The `why` is a paraphrase of both findings: alertness tool not a sleep substitute, and late doses are still working at bedtime |
| `caff-cutoff` | `burke2015`, `mchill2014` | The example in §3, unchanged. Clearance before the sleep window is Burke's mechanism |
| `move-N` | `dallora2020`, `tucker2018`, `owen2010` | Micro-breaks restoring alertness without disrupting workflow, against sitting that compounds the effects. The interval is the synthesis |
| `light-early` | `cho2015` | **Copy overreaches; see below** |
| `light-down` | `cho2015` | "Light close to bedtime tells your body it is daytime" is Cho restated |
| `deep-warn` | `baron2015` | Circadian Rhythm Theory is the mechanism the item names — a body clock that runs its own course whether or not you slept. The 02:00–05:00 bracket is the synthesis, per the rule above, not something the corpus states |
| `deep-rest` | `oriyama2018`, `ruggiero2013`, `geigerbrown2016` | Duration ceiling from Oriyama, the grogginess it warns about is Ruggiero's transient sleep inertia |
| `nap-buffer` | `ruggiero2013` | The buffer exists because sleep inertia is transient. Same clause |
| `checkin-1` | `wickwire2021`, `baron2015` | `baron2015` places it — the `deep` variant's copy cites the body-clock low. `wickwire2021` is the **stretch weighting** specifically: the `changed` string reads "night 3 of your stretch", which is Wickwire's across-shifts finding used across shifts. Compare `hard-warn`, which tries to borrow the same key *within* one |
| `winddown` | `cho2015`, `burke2015` | Two of its three instructions are lower the light and take no new caffeine. **Its `why` names only the unsupported third; see below** |
| `sleep-prep` | `cho2015`, `boivin2014` | Protecting daytime sleep from light. Heat and noise are unsupported and are secondary in the copy |
| `sleep-window` | `boivin2014`, `kervezee2022` | **The thinnest of the thirteen; see below.** `boivin2014` is a disorder *of* the sleep this window protects. `kervezee2022` names risk only |

**`light-early` is the one mismatch, and it is a copy problem, not a citation
problem.** Its `why` reads *"Bright light early is one of the few alertness tools
that costs nothing later"*. `cho2015` supports the second half — light this far
from the sleep window does not push it later — and says nothing about alertness.
A citation that supports half a sentence is the mismatched citation this phase is
supposed to prevent. Fix the sentence, not the key:

> "Light this early is far enough from your sleep window that it will not push it
> later, which is why it is timed rather than left on."

One string in `planner.js`. If a light-countermeasure source is later added to
Chapter II, the alertness claim can come back with a key behind it.

**`winddown` has the same defect one layer down, and it was nearly missed.** Its
`msg` is *"Lower the light, no new caffeine, slow the pace"* — two of three
cited. But its `why` is only about the third: *"Going straight from a working
night to bed rarely works, so a deliberate slowdown gives your body a signal it
can act on."* §3's claim is that the keys sit **alongside its user-facing
rationale**, so a key that supports the `msg` and not the `why` is half a
citation by the same argument that condemns `light-early`. Same fix, one string:

> "Lower light and no new caffeine both act on the same thing — the sleep window
> you are about to use — so the wind-down starts before the shift ends rather
> than after it."

**`sleep-window` is the thinnest of the thirteen and clears the line by one key.**
Clause 2 above says keys that merely *name a risk* belong beside `judgement`, and
`kervezee2022` does exactly that here. `boivin2014` does not: Shift Work Sleep
Disorder is a disorder **of** the daytime sleep this item protects, so it names
the impairment the rule directly counteracts rather than an ambient consequence
of night work. One key over the line is still over it. A reader who reads it the
other way should move the item to `judgement`, taking that frozen list to eleven
and the sourced count to twelve — this is the one row in the table where the
opposite call is defensible, and it is named here rather than left for a panelist
to find.

### Navigational, not recommendations — 2 of 25

`shift-start` and `end-shift` → `["structural"]`.

Neither recommends anything: one states the plan's own boundaries, the other is
the button that switches the app into recovery mode. §3 already chose the marker
over a test exemption, for the reason that has held all through this repo — a
special case in a test is invisible, and a marker in the data is greppable.

### Recommendations with no honest source — 10 of 25

Not dropped. Marked, and named here so the paper can name them too.

| Item | `src` | Why there is nothing better |
|---|---|---|
| `pre-meal` | `kervezee2022`, `judgement` | Metabolic risk in night workers is cited. "Largest meal before the shift" is not in the corpus |
| `pre-min` | `judgement` | A triage rule — food, water, a workspace — invented for the woke-late branch |
| `hydrate-start` | `judgement` | Hydration appears nowhere in the corpus |
| `caff-swap` | `mchill2014`, `judgement` | Reducing caffeine reliance is McHill. "Mild dehydration feels like fatigue" is not sourced |
| `snack` | `kervezee2022`, `judgement` | Same as `pre-meal`. Grazing behaviour is unsourced |
| `food-late` | `kervezee2022`, `judgement` | Same. Pre-sleep digestion is unsourced |
| `hard-warn` | `judgement` | The fallback for shifts missing 02:00–05:00. `planner.js:35` already calls it a heuristic in a comment: *"sleepiness on a night shift often peaks toward the end regardless."* Wickwire is across shifts, not within one |
| `commute` | `wickwire2021`, `boivin2014`, `judgement` | **The finding of this phase; see below** |
| `water-now` | `judgement` | Hydration again, reactively |
| `eye-break` | `judgement` | No visual-ergonomics source. It is *tempting* to borrow `dallora2020` on the grounds that an eye break is a micro-break — declined, because the item's entire stated rationale is ocular and Dall'Ora's finding is about alertness. That borrow is exactly the mismatch the brief forbids |

**Why none of them is dropped.** The alternative was considered and is worse in
every case. `hydrate-start`, `snack` and `eye-break` are useful and harmless; the
paper's scope names micro-care broadly, and deleting a third of the plan to make
a test pass would be optimising the artifact for the check rather than the check
for the artifact. `judgement` costs one array entry and makes the gap legible in
the running system, which is the property being claimed. An item that is quietly
dropped teaches nobody anything; an item marked `judgement` tells the next reader
exactly which recommendations the literature is not behind.

**Why not `structural` for them.** `structural` would pass the same test and is a
lie: these items recommend behaviour. Laundering a recommendation as navigation
is the specific dishonesty that would make the paper's claim false in the way
that looks true.

### `commute` — the item the app takes most seriously has the thinnest citation

`commute` is the only item in the plan with `priority: true`, the only one whose
`actions` array omits `skip` on the `drive` branch, and its own `why` says so:
*"This is the one item in the plan with no skip button."* Its claim is that
post-shift sleepiness is hardest to judge from the inside, at the wheel.

The corpus has `wickwire2021` for cognitive degradation across a stretch and
`boivin2014` for chronic fatigue. It has **nothing about driving, drowsiness at
the wheel, or post-shift crash risk** — a literature that certainly exists and is
simply not in this repo.

The spec does not paper over this and does not weaken the item:

- The item keeps its priority and keeps having no skip button. It is right on the
  merits and it is the highest-stakes thing the app says.
- Its `src` is `["wickwire2021", "boivin2014", "judgement"]`. The state is cited;
  the driving recommendation is not.
- **Chapter II needs a drowsy-driving source before the paper's traceability
  claim covers this item.** That is one reference and one sentence in a chapter
  that is being written anyway, and it converts the plan's most consequential
  card from judgement into evidence. It is the single highest-value item on the
  thesis's list after this phase ships.

Finding this is what the phase was for. A traceability check that surfaces
nothing was not run.

### Count

| | Items |
|---|---|
| Recommendations with a genuine source | **13** |
| Navigational (`structural`) | 2 |
| Recommendations marked `judgement` | **10** — 5 of which carry a study naming the risk (`pre-meal`, `caff-swap`, `snack`, `food-late`, `commute`); the other 5 carry `judgement` alone |
| **Total distinct items the planner can emit** | **25** |

25 is verified, not counted by eye: `grep -c "add({" src/planner.js` returns 25,
`items.push` appears once and only inside `add` (`planner.js:261`), and driving
`generateTimeline` across a profile matrix returns a union of exactly 25 ids with
`move-N` collapsed.

---

## Part 4 — The gate

Appended to `planner.test.js` as one `describe("traceability")`. No new test
file: the block imports `generateTimeline` which is already imported there, and
adds one import of `CITATIONS`.

### The profile matrix

Eight profiles, chosen to reach every conditional branch, all built by spreading
the `P` fixture that file already defines:

| | Profile / logs | Reaches |
|---|---|---|
| A | `P`, no logs, `now = ph.start` | The 20-item baseline, `pre-meal`, `deep-warn`, `deep-rest` |
| B | `wake: "later"` log | `pre-min` |
| C | `sleepGoalHours: 5` + `wake: "earlier"` | `pre-nap` |
| D | `caffeine: "high"` | `caff-swap` |
| E | `06:00–14:00`, sleep `15:00` | `hard-warn` (no `deepNight`) |
| F | `nap` log at `ph.start + 180` | `nap-buffer` |
| G | one `water` log at `ph.start`, `now = ph.start + 200` | `water-now` |
| H | `screen` log at `ph.start + 190`, `now = ph.start + 200` | `eye-break` |

Driven against the real functions before writing this: A–H return 20, 20, 21, 21,
19, 21, 21 and 21 items, and their union is exactly the 25 in Part 3. Log times
are `ph.start + n`, not bare integers — a log at `t: 190` on a 22:00 shift is 19
hours before the plan and fires nothing, which is how the first draft of this
matrix silently missed two reactive inserts.

### The four assertions

**1. Every `add({` in the planner carries a `src`.** A source lint, four lines,
`node:fs` only:

```js
const text = readFileSync(new URL("./planner.js", import.meta.url), "utf8");
const missing = text.split("add({").slice(1)
  .filter((b) => !b.split("});")[0].includes("src:"));
expect(missing).toHaveLength(0);
```

`split("});")[0]`, not `slice(0, indexOf("});"))`: `indexOf` returns `-1` if a
block ever loses its terminator, `slice(0, -1)` then searches the entire rest of
the file, and the missing `src` passes. Same length, one fewer way to be wrong.
No parser: `acorn` is not installed here — only `esbuild`, via vite — so a real
AST walk means a new dependency for the same four lines.

This is the assertion that actually fails when someone adds an uncited item, and
it is the reason the other three can be simple. `add({` is the single
construction idiom in the file — verified, 25 occurrences, one `items.push`
inside `add` — so the anchor is exact. Also verified by running it: splitting on
`add({` and reading to the next `});` yields exactly 25 blocks with the right ids,
including the three awkward ones (`move-${n}`'s template-literal id,
`caff-cutoff`'s template literals, `checkin-1`'s nested `why` object). Reading
source in a test is a lint, not a behaviour check, and it is here because the
runtime matrix cannot see an item behind a condition no profile in the matrix
reaches. **Twelve of the existing 25 items are conditional**; a new one will be
too, and a coin-flip gate is not a gate.

**2. Every item across the matrix has a non-empty `src` array.** §3's own test,
now with a matrix behind it instead of one profile:

```js
const bare = items.filter((i) => !i.src?.length).map((i) => i.id);
expect(bare).toEqual([]);
```

**3. Every key resolves in `CITATIONS`.** Without this, `src: ["burke2016"]`
passes assertion 2 and points at nothing — a citation identifier that identifies
no citation, which is the failure that would make the paper's claim false while
looking like proof of it.

**4. The ids carrying `judgement` and the ids carrying `structural` each equal a
frozen literal** — the 10 and the 2 from Part 3, kept in **two** lists, not one
of twelve. This is the one that keeps the markers honest. Without it `judgement`
is a loophole: any future item can pass assertions 1–3 by declaring itself
evidence-free, and the traceability claim quietly becomes "every item has a
string on it". With it, marking a new item as judgement fails the build until
someone edits a list that sits directly beneath a comment explaining what the
marker means. That is the smallest thing that makes the decision conscious.

Two lists rather than one because a single twelve-id set **passes** when an item
is relabelled from `judgement` to `structural` — the union does not move. That
relabel is precisely the laundering Part 3 forbids ("`structural` would pass the
same test and is a lie"), so the assertion that exists to stop marker creep
cannot be the one that cannot see it. Two literals are the same number of lines.

The frozen literals in the test are **only** the 12 marked ids — 10 `judgement`,
2 `structural`. Nothing else is pinned; the 13 sourced items are pinned by
nothing but T1 and T3, on purpose. The
mapping itself is not duplicated into the test — a test that asserts
`planner.js` equals a copy of `planner.js` proves nothing and doubles the
maintenance.

---

## Part 5 — Nothing is user-visible, and that is the right answer

**Decision: no UI. No `drive-cite.mjs`. No `.gitignore` change.**

The roadmap does not ask for UI, and the claim being repaired does not need it.
Read the sentence again: the check *"is performed against citation identifiers
recorded on each plan item"* so that it *"is executed against the running system
rather than against separately maintained documentation."* Every noun in that is
about where the check runs. None of it is about what a user sees. A data field
plus a test that fails the build satisfies it completely.

Four reasons it should stay that way:

- **The reader of a citation key is a panelist, not a shift worker at 03:00.**
  Every string in the plan is deliberately plain — "Sit tall, roll your
  shoulders, unclench your jaw". `burke2015, mchill2014` under that is a register
  break in an app whose entire copy discipline is not breaking register.
- **The artifact the panel wants is a matrix, and a matrix is a document.** §3
  already priced it: *"a ten-line `map` over `items` at that point, not a
  subsystem."* It is an appendix, generated once, not a screen maintained
  forever.
- **The "Why this" panel is already the item's rationale surface** and it is a
  disclosure the user opens (`App.jsx:1288`). Adding a second disclosure inside
  it, or a row of keys under the prose, adds a control to the densest card in the
  app to serve a reader who is not using the app.
- **`judgement` would be visible.** Ten items would carry a note saying the
  literature does not back them. That is the correct thing to tell an examiner
  and a strange thing to tell someone deciding whether to drink water.

**What would change this:** a request for a screenshot of in-app traceability for
the appendix. Then it is a `<details>` inside the existing "Why this" panel using
`T.faint` at 12.5px — named here so it is not designed twice — and it is still
not this phase.

**Why the unit test is a sufficient gate.** The property is a property of the
data `generateTimeline` returns. It is fully determined by `(profile, logs, now)`,
it never reaches the DOM, it never reaches `localStorage`, and it never reaches
the export. A Playwright driver against http://localhost:5174/ would boot a
browser, render a screen, and then assert something that the browser had no part
in producing. Every previous phase's driver existed because the thing under test
was a boundary, a timer or a screen; this phase has none of the three. A driver
here would be theatre, and it would be the slowest, flakiest possible way to
check a pure function.

---

## Out of scope

- **`generateTimeline`'s signature, and every existing behaviour.** One field is
  added to the objects it returns. Nothing reads it at runtime.
- **`CARE`** (`App.jsx:36`) — the breathing and stretch player. It recommends
  behaviour and it carries no citation, but it is not a plan item and the paper's
  claim is about plan items. Worth recording for whoever picks it up:
  `dallora2020` and `tucker2018` name *"stretching and controlled breathing"*
  explicitly, so box breathing, 4-7-8 and the neck sequence would map honestly if
  the claim is ever extended. Do not extend it in this phase.
- **The `move-quick-*` and `skip-quick-*` log ids** (`App.jsx:2679`). They look
  like item ids in the log stream and never come from the planner.
- **Rewriting Chapter II to add a drowsy-driving source.** Named in Part 3 as the
  action this phase generates. It is a paper edit, not a code change.
- **Contrast (§4) and multimodal content (§5)** of `app-design-basis.md`. Both
  still open, neither is Phase 6.

---

## Edge cases, and their answers

| Case | Answer |
|---|---|
| A profile that reaches only 18 items (`caffeine: "none"`) | Assertion 2 checks the items that exist. Absent items are not uncited items |
| `move-N` — a variable number of ids from one `add({` | One construction site, one `src`, N items carrying it. The lint sees one block; the matrix sees `move-1..5` and each passes |
| The recurring card in `PlanTab` (`App.jsx:1381`) | `{ ...moves[0], recurring: moves }` spreads the first move item, so it carries `src` for free. Not that anything renders it |
| A shift with no `deepNight` | `deep-warn`/`deep-rest` are replaced by `hard-warn`, which is `judgement`. Profile E in the matrix exists for exactly this |
| `caff-window` filtered out by late caffeine (`planner.js:577`) | It leaves the array before the test sees it. It is still cited; the filter is not a traceability event |
| An item whose `src` is `[]` | Assertion 2. `!i.src?.length` catches empty array, `undefined` and `null` in one expression, which is why §3 wrote it that way |
| An item with a key that is a typo | Assertion 3, provided the matrix reaches the item. See Known ceilings |
| A hand-edited `gy.v1` | Cannot reach `src`. No plan item is ever stored |
| Someone adds a 26th item, cited | Passes all four. Correct — that is the workflow working |
| Someone adds a 26th item, uncited | Assertion 1 fails at the construction site, whether or not any profile reaches it |
| Someone adds a 26th item marked `judgement` | Assertion 4 fails until the frozen list is edited. Deliberate friction |
| An item quietly relabelled `judgement` → `structural` | Assertion 4, because the two sets are frozen separately. A single twelve-id union would have passed this |
| `structural` used on something that recommends behaviour | Only if it is one of the two ids already in the frozen list — a judgement call made once, here. A third can never appear without editing that list |

---

## Traps

**Do not borrow a citation because the category matches.** `eye-break` is a short
break; `dallora2020` is about short breaks; the fit is superficial and the item's
actual claim is ocular. A key that survives a category match and fails a claim
match is worse than `judgement`, because it converts a known gap into a hidden
one. This is the single trap the whole phase is built around.

**Do not fill in the APA entries from memory.** `citations.js` will look thin next
to a real reference list and the temptation is to make it look finished. A volume
number nobody read is a fabrication in the one file whose purpose is that nothing
in it is fabricated.

**Do not exempt `structural` items in the test.** §3 called this and it is worth
restating: a `filter` in the test that skips two ids is invisible at the call
site, and the next person adds a third. The marker is in the data where a grep
finds it.

**Do not write the matrix with bare log times.** `{ t: 190 }` on a 22:00 shift is
19 hours before the plan starts. Two reactive inserts silently never fired while
this spec's own inventory script was being written, and the union came back 24
instead of 25. Every log time is `ph.start + n`.

**Do not let assertion 4 be "the count is 12", and do not let it be one set of
12.** A count passes when one item gains the marker and another loses it. A
single union passes when an item moves from `judgement` to `structural`. Two
frozen sets, compared as sets.

**Do not make `planner.js` import `citations.js`.** It has no use for it, and an
import would put a bibliography inside the module the paper describes as a pure
function of three arguments.

---

## Assumptions

Recorded because the human partner was unavailable. Each is the smallest choice
consistent with what the repo and the two design documents already do.

1. **`src` is an array of lowercase string keys**, per `app-design-basis.md` §3,
   which already wrote both the field and the key format. Not re-decided.
2. **The citation table is `src/citations.js`, one line per key**, holding only
   what `research-summary.md` states. Part 2. This is the assumption most likely
   to be revisited, and only by someone holding Chapters I–II.
3. **`judgement` is a second marker beside §3's `structural`.** §3 invented the
   marker pattern for navigational items; this extends it rather than inventing a
   second mechanism.
4. **The `judgement` line is drawn at the intervention, not the clock.** Part 3.
   Without this rule all 25 items qualify and the marker is worthless.
5. **A study key may sit beside `judgement`** to name the cited risk a
   judgement rule addresses. The array is read as "contains `judgement` ⇒
   evidence-free rule", regardless of what else is in it.
6. **A theory anchor earns an item key only when the corpus states a mechanism**
   an item can be checked against. Part 2. Three of the corpus's four anchoring
   theories qualify; Demand-Control does not.
7. **No item is dropped for lack of a source.** Part 3.
8. **`commute` keeps its priority and its missing skip button.** Its citation is
   marked honestly and the paper gains an action item.
9. **Two `why` strings are reworded** — `light-early` and `winddown` — rather
   than given keys that do not support them. Part 3.
10. **`sleep-window` stays on the evidenced side of the line.** Part 3, and the
    one mapping a reviewer could reasonably reverse.
11. **Nothing is user-visible, and there is no driver.** Part 5.
12. **The gate is four assertions in `planner.test.js`, source lint included.**
    The lint is the only one that closes the conditional-item hole, and the hole
    is the phase's whole point.

---

## How this gets tested

**Unit, `vitest`, `src/planner.test.js`.** One new `describe`, four assertions,
one eight-profile matrix. The existing 146 tests are the regression gate and must
stay green; adding a field to an object literal cannot move any of them, which is
itself worth confirming rather than asserting.

| | Assertion | Fails when |
|---|---|---|
| T1 | Every `add({` block in `planner.js` contains `src:` | A new item is constructed without a citation, on any branch, reachable or not |
| T2 | Every item across profiles A–H has a non-empty `src` | An existing item loses its field, or a matrix profile reaches an item the lint's textual scan misread |
| T3 | Every key in every item's `src` resolves in `CITATIONS` | A key is mistyped, or a key is removed from the table while an item still cites it |
| T4 | `{judgement ids}` and `{structural ids}` each equal their frozen literal | A new item declares itself evidence-free, or an existing one is quietly relabelled either way |

T1–T4 all fail before Part 1 lands, for the honest reason that no item has a
`src` at all. Each is also written against a specific wrong future — the "Fails
when" column is that future, and Part 4 argues each one. T2 is the only one that
would pass if the other three were deleted; it stays because it is §3's own test.

The matrix and the counts in this spec were driven against the real
`generateTimeline` rather than reasoned about: A–H return 20, 20, 21, 21, 19, 21,
21, 21 items and their union is exactly the 25 of Part 3 with `move-N` collapsed.
Re-run that before trusting the frozen lists if the planner has moved since.

**End to end: none, and no `drive-cite.mjs`.** Part 5 argues it in full.
`.gitignore` is unchanged — its `drive*.mjs` block and the three `!` exceptions
stay as they are.

**Verification the mapping is right is not automatable, and this spec is it.**
Part 3 is the artifact — 25 rows, each naming the claim, the key and the fit,
with the ten failures listed rather than hidden. No test can check that
`burke2015` supports `caff-cutoff`; a reader with `research-summary.md` open can,
in about ten minutes, which is the review this phase is asking for.

---

## Known ceilings

- **An item behind a condition no matrix profile reaches is invisible to T2, T3
  and T4.** Only T1 sees it, and T1 sees text, not behaviour. An item added with
  `src: ["burke2016"]` behind a novel condition passes the whole suite. Closing
  this needs either symbolic execution of the planner or a matrix that grows with
  every new branch; the lint is the 80% for four lines. The escalation is to add
  a profile to the matrix whenever a branch is added, which is a habit, not a
  mechanism.
- **`citations.js` holds no full APA entries** for any circadian source, because
  the repo does not contain them. Anyone reconciling this file against Chapter I–
  II's reference list should expect to expand every line, and should treat a line
  that already looks complete as suspect.
- **The mapping's quality is not testable.** T3 proves a key resolves; nothing
  proves it is the *right* key. Part 3 and the ten-minute read are the whole
  defence.
- **Ten of 25 recommendations have no supporting study**, and that is now a
  documented property of the running system rather than an undiscovered one. The
  paper must not claim "every plan item corresponds to a supporting study"
  without qualification; the true claim is that every plan item records whether
  it does.
- **`commute` — the plan's only unskippable, priority-flagged card — is one of
  the ten.** Until Chapter II gains a drowsy-driving source, the app's most
  consequential recommendation is design judgement wearing a safety warning's
  emphasis.
- **`structural` is unfalsifiable.** Nothing prevents a future recommendation
  being labelled navigational. T4's frozen set means it cannot happen quietly;
  it does not mean it cannot happen.
- **`CARE`'s eight micro-care exercises carry no citation** and are outside the
  claim. If a panelist asks about the breathing exercises, the honest answer today
  is that they are not plan items and were not part of the traceability check.

## Skipped

- `designSrc`, and any second field about presentation. Part 1.
- Full APA entries for the circadian sources — they are not in this repo and are
  not going to be invented into it — plus BibTeX, a citation registry module and
  a generated matrix appendix. All of §3's skip list, still skipped.
- Any UI, any driver, any `.gitignore` change.
- An assertion that every key in `CITATIONS` is used by some item. It guards a
  harmless failure — a dead line in a reference list — at the cost of a fifth
  assertion.
- An assertion pinning the full 25-id inventory. T1 catches the new uncited item
  and T4 catches marker creep; a third frozen list of 25 strings would rot and
  catch nothing the other two miss.
- Extending the claim to `CARE`, to `generateAdvice`'s six phase blocks, or to the
  reflection copy. All recommend, none are plan items, none are in the paper's
  sentence.
- A runtime guard in `add()` that throws on a missing `src`. It moves a
  developer's mistake into the user's browser to save a test.
