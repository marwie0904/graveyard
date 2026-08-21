# Traceability (Phase 6) Implementation Plan


> **Correction, 20 August 2026.** This document names `kervezee2022` as a source. That citation was fabricated: no such publication exists, and the DOI it carried (`10.3389/fpubh.2022.1034195`) belongs to Boini, Bourgkard, Ferrieres & Esquirol (2022), *What do we know about the effect of night-shift work on cardiovascular risk factors? An umbrella review.* The key is now `boini2022` in `src/citations.js` and the four rules in `src/planner.js` that cited it. The metabolic figures it carries were also wrong: the 25-38% range is for **overweight**, not obesity. This record is left as written; the reasoning it documents still holds under the corrected attribution.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A sentence in Chapter III becomes true of the running system — every one of the 25 plan items `planner.js` can emit records citation identifiers beside its user-facing rationale, the keys resolve against a file, and seven assertions — the spec's four plus three one-line guards on holes those four leave open — fail the build when an item is constructed without one or quietly relabels itself evidence-free.

**Architecture:** `src/citations.js` is a new module holding one exported object, `CITATIONS` — thirteen study keys taken verbatim from `docs/research-summary.md` plus the two markers `structural` and `judgement`. `planner.js` gains one line, `src: [...]`, inside each of its 25 `add({` blocks, and two `why` strings are reworded because their current copy claims things their sources do not support. **`planner.js` never imports `citations.js`**; the keys stay inert strings to it and `generateTimeline`'s signature stays `(profile, logs, now)`. `planner.test.js` gains one `describe("traceability")` holding an eight-profile matrix and the gate. `drive-cite.mjs` drives the same eight profiles through the running app and proves the added field broke no rendering.

**Tech Stack:** Plain ES modules, React 18, Vitest 2, `node:fs` (already available, `environment: "node"`), Playwright (already in `node_modules`, driven by hand — not a test runner). No new dependencies.

## Global Constraints

- **The spec is the source of truth and its mapping is not to be re-derived.** `docs/superpowers/specs/2026-08-13-traceability-design.md`, Part 3. It has been integrity-checked against `docs/research-summary.md`, which is the entire evidence base for what the planner recommends. The mapping is reproduced verbatim in Task 1's table. **Type it. Do not improve it, do not add a key because a category matches, do not drop one that looks thin.** An improvised citation makes the paper's claim false in a way that looks true, which is the single failure this whole phase exists to prevent.
- **No new dependencies.** Nothing added to `package.json`. `acorn` is **not** installed here — only `esbuild`, via vite — so there is no AST walk. The source lint is four lines of `String.prototype.split`.
- **Do not change `generateTimeline`.** It stays `(profile, logs, now)`. One field is added to the objects it returns. Nothing reads it at runtime.
- **Do not make `planner.js` import `citations.js`.** It has no use for it, and an import would put a bibliography inside the module the paper describes as a pure function of three arguments. `citations.js`'s only importer is `planner.test.js`, which is what a certificate looks like.
- **`src` is an array of lowercase string keys** — `["burke2015", "mchill2014"]` — per `docs/app-design-basis.md` §3, which already picked both the field and the key format. Not a string: ten items carry two keys and four carry three. Not an object: there is no second thing to say about a key that `CITATIONS` cannot say once. Compound surnames are all lowercase, following the corpus's own `mchill2014`: `geigerbrown2016`, `dallora2020`.
- **`src` goes beside `why`, after it.** The paper's claim is that the identifiers sit *alongside the user-facing rationale*. `shift-start` is the one item with no `why` at all; its `src` goes after `msg`.
- **Do not invent bibliographic detail.** `citations.js` holds author-year and the one-line finding `research-summary.md` states, and nothing else. There is no journal, volume, page range or DOI for a single circadian source anywhere in this repo, because those live in Chapters I–II. Writing one from memory produces a file that looks more rigorous and is less true — a fabrication in the one file whose entire purpose is that nothing in it is fabricated.
- **Do not exempt `structural` in the test.** A `filter` that skips two ids is invisible at the call site and the next person adds a third. The marker is in the data, where a grep finds it. T4 is two frozen literals, not one union and not a count — the argument is in T4's own comment in Task 2, where it ships.
- **`src` costs nothing at any trust boundary and needs no `boot` validation** — unlike every field Phases 1–5 added. Checked rather than assumed: an item log stores `{ id, status, category }` (`App.jsx:2551`), the archive stores folded NightRecords, and the export writes `{ app, profile: stored(profile), logs, reflection, archive }`. No plan item is ever serialised, and `grep -c src src/App.jsx` returns **0**, so no render path can be reading it by accident. **Do not add persistence, migration or validation for this field.**
- **Vitest runs in `environment: "node"`** (`vitest.config.js`), include glob `src/**/*.test.js`. There is no DOM and no `localStorage`. `node:fs` and `import.meta.url` both work there — verified against this suite before this plan was written.
- **The regression gate, restated in every task:** `npm test` is **146 passing** at the start of this phase, `node drive-history.mjs` is **15/15 passed**, `node drive-plan-state.mjs` is **6/6 passed**, `node drive-loop.mjs` is **12/12 passed**. All four must be green at the end of every task, with the unit count rising to the number that task's step names. All four were run green on `70265cd` before this plan was written.
- **Every task ends with a mutation check.** Break the thing the task added, watch the intended test go red, restore. This was the strongest evidence in Phases 3, 4 and 5 and it is not optional here — in a phase whose deliverable is a gate, an unmutated gate is a claim, not a check.
- Spec: `docs/superpowers/specs/2026-08-13-traceability-design.md`. Field spec: `docs/app-design-basis.md` §3 (line 77). Roadmap Phase 6: `docs/implementation-roadmap.md:417`. Evidence base: `docs/research-summary.md` (29 lines — read it; it is short and it is the whole corpus).
- Unit test command: `npm test` (`vitest run`). Single file: `npx vitest run src/planner.test.js`.
- End-to-end commands: `node drive-cite.mjs` (this phase), `node drive-history.mjs`, `node drive-plan-state.mjs`, `node drive-loop.mjs` (regression). **The dev server is already running on `http://localhost:5174/`** — do not start another one; if it has died, `npm run dev -- --port 5174`.
- Line numbers below are from commit `70265cd` on branch `phase-6-traceability`. Match on code, not on the number.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/citations.js` | Create (~25 lines) | The only place a citation key means anything. One export, one line per key, holding exactly what `research-summary.md` states. Imported by the test and by nothing else. |
| `src/planner.js` | Modify (+25 `src:` lines, 2 `why` strings replaced) | Unchanged as a plan engine. Every item it constructs now records what the recommendation rests on, or records that nothing does. |
| `src/planner.test.js` | Modify (+2 imports, +1 `describe`, 7 cases) | Still the planner's suite. Now also the traceability check the paper describes — a source lint, an eight-profile runtime matrix, key resolution, and two frozen marker sets. |
| `drive-cite.mjs` | Create (~110 lines) | Smoke proof that adding a field to every plan item broke no rendering. Eight profiles through the real app, item counts and zero page errors. It proves nothing about whether a citation is right, and `npm test` catches every defect it can catch. |
| `.gitignore` | Modify (1 line) | `drive*.mjs` is ignored with three exceptions; the new driver needs a fourth or it is invisible to `git add` and to review. |

Three tasks, in this order because each leaves the tree green and the next one needs it:

1. **The table and the field.** `citations.js`, `src` on all 25 items, the two `why` rewrites, and the two assertions that gate exactly what this task adds (T1 and T2, plus one guard each). This is the task that carries the mapping.
2. **The keys have to mean something, and the markers have to stay honest.** T3 and T4, plus the assertion that catches a borrowed citation. Nothing in `src/` changes — this task is pure gate.
3. **Nothing broke.** `drive-cite.mjs` and the `.gitignore` line.

**Why the two `why` rewrites are in Task 1 and not with the driver.** They are two strings in `planner.js`, in the same edit pass as the 25 `src` lines, and they are the reason `light-early` and `winddown` are allowed to cite `cho2015` at all. Landing the keys in Task 1 and the copy two tasks later would leave the tree in a state where two items cite a source for a claim it does not support — across two commits, in the phase built to prevent exactly that. Same file, same pass, no intermediate lie.

---

### Task 1: The table and the field

**Files:**
- Create: `src/citations.js`
- Modify: `src/planner.js` — 25 insertions (one per `add({` block) and 2 replaced `why` strings.
- Modify: `src/planner.test.js` — one added import at line 1, one appended `describe` block.

**Interfaces:**
- Consumes: `generateTimeline(profile, logs, now) -> { ph, state, items }` and `calculateShiftPhases(profile) -> ph` from `./planner.js`, both already imported by `planner.test.js`. `P`, the profile fixture at `planner.test.js:7`, already at module scope there.
- Produces:
  - `CITATIONS` — exported from `src/citations.js`. A plain object, `Record<string, string>`, with exactly these 15 keys: `mchill2014`, `burke2015`, `ruggiero2013`, `geigerbrown2016`, `oriyama2018`, `dallora2020`, `tucker2018`, `cho2015`, `baron2015`, `owen2010`, `boivin2014`, `kervezee2022`, `wickwire2021`, `structural`, `judgement`. Task 2 imports it.
  - Every object `generateTimeline` returns in `items` carries `src: string[]`, non-empty. No other field is added, removed or changed.
  - `describe("traceability")` in `planner.test.js`, holding module-level constants `PH`, `E`, `PH_E`, `MATRIX`, `ALL`, `SRC` and `blocks`. **Task 2 appends `it` blocks inside this same `describe` and reuses `ALL`** — do not rename them.
- `citations.js` has no importer at the end of this task; Task 2 adds the only one. Deliberate, same shape as Phase 5's Task 1 — the tree is green either way.

**Background the implementer needs:**

**Where the evidence actually is.** The brief for this phase points at `docs/reference-integration.md`. It is the wrong document: that file is the evidence for *how the app was built and how it looks* — course materials, DeRose, Dutton, Heinrich, WCAG. Burke, Oriyama, Dall'Ora and Wickwire appear in it only as passing mentions inside prose about the other argument. `docs/research-summary.md` is 29 lines long and is the entire evidence base for **what the planner tells a shift worker to do**. Thirteen of the seventeen circadian authors in this repo appear there and nowhere else. It gives author-year plus a one-line finding — no volumes, no pages, no DOIs — and that constraint is why `citations.js` is one line per key. It is the most the repo can prove.

**The rule that decides `judgement`, because you will be tempted to apply it wrongly.** Every timing number in this planner is a synthesis; the thesis's own finding is that the literature does not specify timing. If "the exact minute is not in a study" earned the marker, all 25 items would carry it and the marker would mean nothing. The line is drawn at the **intervention**, not the clock:

> `judgement` marks an item whose *intervention* has no supporting study in the corpus. It does not mark an item whose intervention is evidenced and whose *timing* is the study's own synthesis — that synthesis is the thesis's contribution, and the paper claims it as such.
>
> Where an array holds study keys **alongside** `judgement`, the studies name the risk the rule addresses. They do not support the rule.

**The trap, stated once so you can recognise it in yourself.** `eye-break` is a short break. `dallora2020` is about short breaks. The fit is superficial and the item's actual claim is ocular, which Dall'Ora's finding is not about. A key that survives a category match and fails a claim match is **worse** than `judgement`, because it converts a known gap into a hidden one. The same applies to `hard-warn` and `wickwire2021` (Wickwire is across shifts; `hard-warn` is within one) and to `hydrate-start` and anything at all (hydration appears nowhere in the corpus, not once).

**What the corpus does not contain**, named now because five items depend on it: meal timing and night eating (`kervezee2022` gives the metabolic risk, nothing gives the timing); hydration, at all; visual ergonomics; drowsy driving and post-shift crash risk; and bright light as an *alertness* countermeasure, as opposed to a circadian input.

**The finding this phase produces, and it is not a code change.** `commute` is the only item in the plan with `priority: true`, the only one whose `actions` omits `skip` on the `drive` branch, and its own `why` says *"This is the one item in the plan with no skip button."* The corpus has nothing about driving, drowsiness at the wheel, or post-shift crash risk. The item keeps its priority and keeps having no skip button — it is right on the merits and it is the highest-stakes thing the app says — and its `src` is honest: `["wickwire2021", "boivin2014", "judgement"]`. **Chapter II needs a drowsy-driving source before the paper's traceability claim covers this item.** That is a paper edit, out of scope here, and it is the single highest-value item on the thesis's list after this phase ships. Do not attempt to fix it in code.

**`sleep-window` is the thinnest of the thirteen sourced items and clears the line by one key**, and the spec names this rather than hiding it. `kervezee2022` merely names a risk, which by the rule above belongs beside `judgement`; `boivin2014` does not — Shift Work Sleep Disorder is a disorder **of** the daytime sleep this item protects, so it names the impairment the rule directly counteracts. One key over the line is still over it. Do not move this item.

**Three sources are deliberately absent from the table**: `vetter2016` and `silvani2022` establish that night work produces chronodisruption at all, and `dejonge2000`/Karasek is the Demand-Control anchor for user autonomy. All three are framework-level — they justify the study, not any one rule. Putting them on an item would be padding a citation count, which is the failure mode this phase exists to prevent. They stay in the paper. This is also why three of the corpus's four anchoring theories earn item keys and Demand-Control does not: a theory earns a key when the corpus states a **mechanism** an item can be checked against.

- [ ] **Step 1: Create `src/citations.js`**

Create the file with exactly this content. Every finding is `research-summary.md`'s own wording; every author form is the one that file uses.

```js
/* The keys `planner.js` cites, and nothing else. Not the bibliography — the full
   APA entries live in the paper's reference list and, for the design and
   engineering half, in docs/reference-integration.md §6.
   Each line records what docs/research-summary.md states about the source and no
   more. Do not add a volume, page range or DOI you have not read off the paper
   itself: a fabricated locator is the one failure this file exists to prevent,
   and this file would be the worst possible place for it.
   Nothing imports this at runtime. planner.js does not know it exists; its only
   importer is planner.test.js, which is what a certificate looks like. */
export const CITATIONS = {
  mchill2014: "McHill et al. (2014) — caffeine reliably boosts short-term alertness, but is a stimulant, not a circadian regulator.",
  burke2015: "Burke et al. (2015) — evening caffeine doses delay melatonin secretion and phase-delay the clock.",
  ruggiero2013: "Ruggiero & Redeker (2013) — naps reduce sleepiness and improve vigilance despite transient sleep inertia.",
  geigerbrown2016: "Geiger-Brown et al. (2016) — nap benefit, in the same finding.",
  oriyama2018: "Oriyama & Miyakoshi (2018) — nap benefit varies by timing and duration.",
  dallora2020: "Dall'Ora et al. (2020) — micro-breaks such as stretching and controlled breathing restore alertness without disrupting workflow.",
  tucker2018: "Tucker (2018) — the same finding.",
  cho2015: "Cho et al. (2015), Artificial Light Theory — blue-spectrum night light suppresses melatonin and shifts phase.",
  baron2015: "Baron & Reid (2015), Circadian Rhythm Theory — chronodisruption drives sleep, metabolic and cardiovascular risk.",
  owen2010: "Owen et al. (2010), Sedentary Work Hypothesis — prolonged sitting compounds those effects.",
  boivin2014: "Boivin & Boudreau (2014) — Shift Work Sleep Disorder affects nearly 40% of night workers, and tracks with anxiety, depression and chronic fatigue.",
  kervezee2022: "Kervezee et al. (2022) — 10% higher diabetes risk, 25–38% greater obesity likelihood, roughly 30% higher hypertension risk versus day workers.",
  wickwire2021: "Wickwire et al. (2021) — cognitive performance degrades with each consecutive night shift.",

  /* Not sources. They are read exactly like sources, which is why they live in
     the same object rather than in a second container: a separate table would
     buy one special case in the test for one saved line here, and §3 already
     settled that trade — "an explicit marker is cheaper to audit than a special
     case". */
  structural: "Not a recommendation. A navigational marker for a shift boundary.",
  judgement: "Design judgement, not evidence. No supporting study for this rule exists in the project's research corpus. Where study keys sit alongside this marker, they name the risk the rule addresses; they do not support the rule.",
};
```

- [ ] **Step 2: Write the failing tests**

Add one import line at the top of `src/planner.test.js`, immediately below the `vitest` import on line 1:

```js
import { readFileSync } from "node:fs";
```

Then append at the end of the file:

```js
/* ------------------------------- traceability -----------------------------
   Phase 6. Chapter III claims the traceability check "is performed against
   citation identifiers recorded on each plan item alongside its user-facing
   rationale, so that the check is executed against the running system rather
   than against separately maintained documentation." This block is that check.
   The mapping itself is deliberately NOT duplicated here. A test asserting that
   planner.js equals a copy of planner.js proves nothing and doubles the
   maintenance; nothing automatable can check that burke2015 supports
   caff-cutoff. Part 3 of
   docs/superpowers/specs/2026-08-13-traceability-design.md is the mapping, and
   a reader with docs/research-summary.md open is the review it asks for. */
describe("traceability", () => {
  const PH = calculateShiftPhases(P);
  const E = { ...P, shiftStart: "06:00", shiftEnd: "14:00", plannedSleep: "15:00" };
  const PH_E = calculateShiftPhases(E);

  /* Eight profiles, chosen to reach every conditional branch, all built by
     spreading the P fixture this file already defines. Twelve of the 25 items
     are conditional, so one profile is not a matrix.
     Every log time is PH.start + n, never a bare integer: a log at t: 190 on a
     22:00 shift is 19 hours before the plan starts and fires nothing, which is
     how the spec's own first inventory silently missed two reactive inserts and
     came back with 24 ids instead of 25. */
  const MATRIX = [
    ["A baseline", P, [], PH.start],
    ["B woke late -> pre-min", P,
      [{ id: "w", t: PH.start - 200, type: "wake", value: "later" }], PH.start],
    ["C short goal + woke early -> pre-nap", { ...P, sleepGoalHours: 5 },
      [{ id: "w", t: PH.start - 200, type: "wake", value: "earlier" }], PH.start],
    ["D high caffeine -> caff-swap", { ...P, caffeine: "high" }, [], PH.start],
    ["E no deep night -> hard-warn", E, [], PH_E.start],
    ["F nap logged -> nap-buffer", P,
      [{ id: "n", t: PH.start + 180, type: "nap", value: "ok" }], PH.start + 200],
    ["G water gap -> water-now", P,
      [{ id: "wa", t: PH.start, type: "water", value: 1 }], PH.start + 200],
    ["H screen strain -> eye-break", P,
      [{ id: "s", t: PH.start + 190, type: "screen", value: 1 }], PH.start + 200],
  ];

  /* Every item any of the eight profiles emits, duplicates included. The union
     of their ids is exactly the 25 of Part 3 with move-N collapsed; A-H return
     20, 20, 21, 21, 19, 21, 21 and 21 items. Those counts are asserted by
     drive-cite.mjs against the running app, not here — pinning them in the unit
     suite would rot on the first legitimate new item. */
  const ALL = MATRIX.flatMap(([, p, logs, now]) => generateTimeline(p, logs, now).items);

  /* T1's corpus. Read as text on purpose: the runtime matrix cannot see an item
     behind a condition no profile reaches, and a coin-flip gate is not a gate.
     Reading source in a test is a lint, not a behaviour check. */
  const SRC = readFileSync(new URL("./planner.js", import.meta.url), "utf8");
  const blocks = SRC.split("add({").slice(1);

  /* T1. The assertion that actually fails when someone adds an uncited item, and
     the reason the other three can be simple. `add({` is the single construction
     idiom in planner.js — 25 occurrences, one items.push, and it is inside add. */
  it("constructs no plan item without a src, on any branch, reachable or not", () => {
    /* split("});")[0], NOT slice(0, indexOf("});")): indexOf returns -1 if a
       block ever loses its terminator, slice(0, -1) then searches the entire
       rest of the file, and the missing src passes. Same length, one fewer way
       to be wrong.
       No AST walk: acorn is not installed here — only esbuild, via vite — so a
       real parse means a new dependency for the same four lines. */
    const missing = blocks
      .map((b) => b.split("});")[0])
      .filter((b) => !b.includes("src:"))
      // report ids rather than blocks: a failure nobody can read is a failure
      // somebody deletes
      .map((b) => (b.match(/id: [`"]([^`"$]*)/) || [, "?"])[1]);
    expect(missing).toEqual([]);
  });

  /* T1b. The lint's own anchor. Without this, a refactor that renames add() or
     moves the construction site leaves `blocks` empty, `missing` trivially empty
     and T1 green — a gate reporting success because it stopped looking.
     The number is pinned, so a legitimate 26th item fails here too and the
     count is bumped in the same commit that adds it. That overrules the spec's
     edge-case row "someone adds a 26th item, cited -> passes all four": it
     passes all four, and then this one line asks you to say so on purpose. */
  it("still finds all 25 construction sites, so the lint cannot pass vacuously", () => {
    expect(blocks).toHaveLength(25);
  });

  /* T2. §3's own test, with a matrix behind it instead of one profile.
     `!i.src?.length` catches an empty array, undefined and null in one
     expression, which is why §3 wrote it that way. */
  it("emits no item without a src across the eight-profile matrix", () => {
    const bare = ALL.filter((i) => !i.src?.length).map((i) => i.id);
    expect(bare).toEqual([]);
  });

  /* T2b. The hole T2 leaves open: `!"burke2015"?.length` is false, so a single
     key written as a bare string passes T2 and is then read character by
     character by everything downstream. §3 picked the array; this is what makes
     that choice enforced rather than remembered.
     Shape only. A key that is empty, a number or null is T3's job in Task 2 —
     none of them survives Object.hasOwn — so this is one predicate, not two. */
  it("gives every item an array of keys, not a bare string", () => {
    const wrong = ALL.filter((i) => !Array.isArray(i.src)).map((i) => i.id);
    expect(wrong).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/planner.test.js`

Expected: FAIL, 3 of the 4 new cases.

- "constructs no plan item without a src" fails, listing all 25 ids — the honest reason, which is that no item has a `src` at all.
- "emits no item without a src across the eight-profile matrix" fails with the same ids.
- "gives every item an array of keys" fails with the same ids: `!Array.isArray(undefined)` is true for every item.
- "still finds all 25 construction sites" **passes** already, and is meant to. It is a guard on the lint's anchor, not on the field, and the 25 blocks exist today.

If the three failures list no ids at all, the matrix is producing no items and something above is wrong — check that `P` is still the fixture at the top of the file.

The 34 existing cases in this file must still pass.

- [ ] **Step 4: Rewrite the two `why` strings that overreach**

Two strings in `src/planner.js`. Both are copy problems, not citation problems, and both are why the item below is allowed to cite `cho2015` at all.

**4a — `light-early`, `planner.js:390`.** Its `why` claims an alertness benefit. `cho2015` covers light as a circadian *input* — it supports the second half of the sentence and says nothing about alertness, and the corpus has no bright-light-as-alertness-countermeasure source at all. A citation that supports half a sentence is the mismatched citation this phase is supposed to prevent. Fix the sentence, not the key. Change:

```js
    why: "Bright light early is one of the few alertness tools that costs nothing later, which is why it is timed rather than left on.",
```

to:

```js
    why: "Light this early is far enough from your sleep window that it will not push it later, which is why it is timed rather than left on.",
```

If a light-countermeasure source is later added to Chapter II, the alertness claim can come back with a key behind it.

**4b — `winddown`, `planner.js:506`.** Same defect one layer down, and the spec nearly missed it. Its `msg` is *"Lower the light, no new caffeine, slow the pace"* — two of those three are cited, by `cho2015` and `burke2015`. But its `why` is only about the third. §3's claim is that the keys sit **alongside the user-facing rationale**, so a key that supports the `msg` and not the `why` is half a citation by the same argument that condemns `light-early`. Change:

```js
    why: "Going straight from a working night to bed rarely works, so a deliberate slowdown gives your body a signal it can act on.",
```

to:

```js
    why: "Lower light and no new caffeine both act on the same thing — the sleep window you are about to use — so the wind-down starts before the shift ends rather than after it.",
```

The em dash matches the one already in `planner.js` and the twelve in `App.jsx`; it is house style, not a new character.

- [ ] **Step 5: Add `src` to all 25 items**

**This is the task. Copy the third column exactly.** Each row names the item, the exact existing line to insert *after*, and the exact line to insert. Indentation is part of the line — 4, 6 or 8 spaces, matching the block the item is constructed in. In every case the new line lands between the item's rationale and its `changed:`/`priority:`/`actions:` entry.

Work top to bottom through the file. Two rows (`light-early`, `winddown`) anchor on the strings you just rewrote in Step 4, so do Step 4 first.

#### The thirteen recommendations with a genuine source

| Item | Insert after this exact line | Insert this exact line |
|---|---|---|
| `pre-nap` | `      why: "Under about six hours before a night shift starts you in deficit, and a short nap now takes pressure off the deep-night hours.",` | `      src: ["ruggiero2013", "geigerbrown2016", "oriyama2018"],` |
| `caff-window` | `      why: "Caffeine is a short-term alertness tool rather than a substitute for sleep, so used early it costs nothing and used late it is still active when you lie down.",` | `      src: ["mchill2014", "burke2015"],` |
| `caff-cutoff` | ``      why: `Caffeine takes hours to clear, so stopping now leaves time for it to fade before your sleep window opens at ${fmt(ph.sleepStart)}.`,`` | `      src: ["burke2015", "mchill2014"],` |
| `move-${n}` | `      why: "Long unbroken sitting adds stiffness and drowsiness on top of the night's own fatigue, and short frequent resets beat long occasional ones because you will actually do them.",` | `      src: ["dallora2020", "tucker2018", "owen2010"],` |
| `light-early` | `    why: "Light this early is far enough from your sleep window that it will not push it later, which is why it is timed rather than left on.",` | `    src: ["cho2015"],` |
| `light-down` | `    why: "Light close to bedtime tells your body it is daytime, so cutting it early gives you a head start on a sleep window that already fights daylight.",` | `    src: ["cho2015"],` |
| `deep-warn` | `      why: "Your body clock runs its low point in these hours whether or not you slept well, so the plan asks less of you rather than more.",` | `      src: ["baron2015"],` |
| `deep-rest` | `      why: "Rest is kept short on purpose, because past roughly half an hour you risk waking from deeper sleep and feeling groggier than before.",` | `      src: ["oriyama2018", "ruggiero2013", "geigerbrown2016"],` |
| `nap-buffer` | `        why: "Grogginess right after waking is normal and brief, and a buffer keeps you from deciding anything during the part you will not notice.",` | `        src: ["ruggiero2013"],` |
| `checkin-1` | `    }[profile.sleepiestTime] || "Fatigue is easier to work with when it is caught early.",` | `    src: ["wickwire2021", "baron2015"],` |
| `winddown` | `    why: "Lower light and no new caffeine both act on the same thing — the sleep window you are about to use — so the wind-down starts before the shift ends rather than after it.",` | `    src: ["cho2015", "burke2015"],` |
| `sleep-prep` | `    why: "Daytime sleep competes with light, heat, and noise that night sleep does not, so the darker and cooler the room, the less of a disadvantage you start from.",` | `    src: ["cho2015", "boivin2014"],` |
| `sleep-window` | `    why: "This window is the anchor the whole plan is built backward from, and everything tonight was timed to get you here able to use it.",` | `    src: ["boivin2014", "kervezee2022"],` |

The fit for each, from the spec's Part 3, so a reviewer can check the row without opening a second document:

- `pre-nap` — prophylactic pre-shift napping is squarely the nap literature; the item's own copy turns on duration, which is Oriyama's variable.
- `caff-window` — the `why` is a paraphrase of both findings: alertness tool not a sleep substitute, and late doses are still working at bedtime.
- `caff-cutoff` — §3's own worked example, unchanged. Clearance before the sleep window is Burke's mechanism.
- `move-${n}` — micro-breaks restoring alertness without disrupting workflow, against sitting that compounds the effects. The interval is the synthesis. **One construction site, one `src`, N items carrying it.** The lint sees one block; the matrix sees `move-1..3` and each passes. The recurring card in `PlanTab` (`App.jsx:1381`) spreads `moves[0]`, so it carries `src` for free — not that anything renders it.
- `light-early` — after Step 4a, Cho restated. Before Step 4a it was half a sentence.
- `light-down` — "Light close to bedtime tells your body it is daytime" is Cho restated.
- `deep-warn` — Circadian Rhythm Theory is the mechanism the item names: a body clock that runs its own course whether or not you slept. The 02:00–05:00 bracket is the synthesis, not something the corpus states.
- `deep-rest` — duration ceiling from Oriyama; the grogginess it warns about is Ruggiero's transient sleep inertia.
- `nap-buffer` — the buffer exists because sleep inertia is transient. Same clause.
- `checkin-1` — `baron2015` places it (the `deep` variant's copy cites the body-clock low). `wickwire2021` is the **stretch weighting** specifically: the `changed` string reads "night 3 of your stretch", which is Wickwire's across-shifts finding used across shifts. Compare `hard-warn`, which tries to borrow the same key *within* one and does not get it.
- `winddown` — after Step 4b, two of its three instructions and now its rationale too.
- `sleep-prep` — protecting daytime sleep from light. Heat and noise are unsupported and are secondary in the copy.
- `sleep-window` — the thinnest of the thirteen; see this task's Background.

#### The two navigational items

| Item | Insert after this exact line | Insert this exact line |
|---|---|---|
| `shift-start` | ``    msg: `Your plan runs ${fmt(ph.start)} to ${fmt(ph.end)}, with sleep protected from ${fmt(ph.sleepStart)}.`,`` | `    src: ["structural"],` |
| `end-shift` | `    why: "Once the shift is logged as over, caffeine prompts stop and everything remaining is pointed at getting you home and asleep.",` | `    src: ["structural"],` |

`shift-start` is the one item in the file with no `why`, which is why its anchor is the `msg` line. Neither item recommends anything: one states the plan's own boundaries, the other is the button that switches the app into recovery mode.

#### The ten recommendations with no honest source

Not dropped. Marked, and named so the paper can name them too.

| Item | Insert after this exact line | Insert this exact line |
|---|---|---|
| `pre-meal` | `      why: "Digestion slows overnight, so your largest meal sits better before the shift than during it.",` | `      src: ["kervezee2022", "judgement"],` |
| `pre-min` | `      why: "When time is short, the three things that matter most are food, water, and a workspace you are not fighting.",` | `      src: ["judgement"],` |
| `hydrate-start` | `    why: "Drinking steadily from the start means fewer large drinks late, which is what usually causes bathroom trips that break up your sleep.",` | `    src: ["judgement"],` |
| `caff-swap` | `        why: "Mild dehydration feels a lot like fatigue, so fifteen minutes with water is long enough to tell thirst from tiredness.",` | `        src: ["mchill2014", "judgement"],` |
| `snack` | `    why: "Grazing through the night usually means eating more, later, and heavier than you meant to, so deciding in advance is the point.",` | `    src: ["kervezee2022", "judgement"],` |
| `food-late` | `    why: "A heavy meal shortly before sleep keeps digestion working while you are trying to rest, and tends to make the sleep you do get lighter.",` | `    src: ["kervezee2022", "judgement"],` |
| `hard-warn` | `      why: "Your shift misses the usual 2:00 AM to 5:00 AM low, but sleepiness still builds toward the end, and the last quarter is where it shows up for you.",` | `      src: ["judgement"],` |
| `commute` | `      : "Daylight on the way home is a strong signal to your body that the day is starting, which makes the sleep you are about to attempt harder to fall into.",` | `    src: ["wickwire2021", "boivin2014", "judgement"],` |
| `water-now` | `      why: "Mild dehydration reads as tiredness, so a long gap makes the night feel harder than it is.",` | `      src: ["judgement"],` |
| `eye-break` | `      why: "Focusing at one close distance for hours is what makes eyes ache by mid-shift, and looking far away briefly lets those muscles release.",` | `      src: ["judgement"],` |

`commute`'s `why` is a ternary spanning three lines; the anchor above is its **last** line, and the inserted line sits at 4 spaces (the ternary's branches are indented 6) so it lines up with `priority:` on the line after it.

Why each is unsourced rather than cited:

- `pre-meal` — metabolic risk in night workers is cited. "Largest meal before the shift" is not in the corpus.
- `pre-min` — a triage rule (food, water, a workspace) invented for the woke-late branch.
- `hydrate-start` — hydration appears nowhere in the corpus.
- `caff-swap` — reducing caffeine reliance is McHill. "Mild dehydration feels like fatigue" is not sourced.
- `snack` — same as `pre-meal`. Grazing behaviour is unsourced.
- `food-late` — same. Pre-sleep digestion is unsourced.
- `hard-warn` — the fallback for shifts missing 02:00–05:00. `planner.js:35` already calls it a heuristic in a comment: *"sleepiness on a night shift often peaks toward the end regardless."* Wickwire is across shifts, not within one.
- `commute` — see this task's Background. The state is cited; the driving recommendation is not.
- `water-now` — hydration again, reactively.
- `eye-break` — no visual-ergonomics source. It is *tempting* to borrow `dallora2020` on the grounds that an eye break is a micro-break. Declined: the item's entire stated rationale is ocular and Dall'Ora's finding is about alertness. That borrow is the mismatch this phase forbids.

**Why none of them is dropped.** `hydrate-start`, `snack` and `eye-break` are useful and harmless; the paper's scope names micro-care broadly, and deleting a third of the plan to make a test pass would be optimising the artifact for the check rather than the check for the artifact. `judgement` costs one array entry and makes the gap legible in the running system, which is the property being claimed.

**Why not `structural` for them.** `structural` would pass the same test and is a lie: these items recommend behaviour. Laundering a recommendation as navigation is the specific dishonesty that would make the paper's claim false in the way that looks true. T4, in Task 2, is what makes that impossible to do quietly.

- [ ] **Step 6: Run the whole suite**

Run: `npm test`

Expected: **150 passed** (146 + 4). If "constructs no plan item without a src" still fails, its failure message lists the ids it could not find a `src:` for — go back to those rows in Step 5.

- [ ] **Step 7: Mutation check — two breaks, two different reds**

Each is one edit, one `npx vitest run src/planner.test.js`, one revert.

1. **Add a 26th item with no `src` at all.** This is the mutation the whole phase turns on. Insert this immediately above the `return {` at the end of `generateTimeline` (`planner.js:574`):

```js
  add({
    id: "mutation-check", at: ph.start + 1, category: "water",
    title: "Delete me",
    msg: "Temporary.",
    why: "Temporary.",
    actions: ["done"],
  });
```

Expected: **four reds.** "constructs no plan item without a src" FAILS reporting `["mutation-check"]`; "still finds all 25 construction sites" FAILS with 26; "emits no item without a src" and "gives every item an array of keys" both FAIL too, because this item is unconditional and every matrix profile reaches it. Restore by deleting the block.

If T1 stays green here, the lint is not reading the file it thinks it is and the entire gate is decorative — stop and fix it before going on.

2. **Delete one `src` from a conditional item.** Remove the `src` line from `caff-swap` (only profile D reaches it).

Expected: **three reds** — "constructs no plan item without a src", "emits no item without a src" and "gives every item an array of keys", the first two reporting `["caff-swap"]`. "Still finds all 25 construction sites" stays green, because the block is still there. Restore.

The second break is what proves the matrix reaches the conditional branches at all; if only T1 goes red, profile D is not producing `caff-swap` and the matrix has drifted from the spec.

- [ ] **Step 8: Run the regression gate**

Run: `npm test` → expected **150 passed**.
Run: `node drive-history.mjs` → expected **15/15 passed**.
Run: `node drive-plan-state.mjs` → expected **6/6 passed**.
Run: `node drive-loop.mjs` → expected **12/12 passed**.

All three drivers are structurally blind to this task — `src` reaches no screen, no key and no export. They are here to prove that adding a field to twenty-five object literals moved nothing, which is worth confirming rather than asserting.

- [ ] **Step 9: Commit**

```bash
git add src/citations.js src/planner.js src/planner.test.js
git commit -m "feat: every plan item records what it rests on, or records that nothing does"
```

---

### Task 2: The keys have to resolve, and the markers have to stay honest

**Files:**
- Modify: `src/planner.test.js` — one added import at the top, three `it` blocks appended **inside** the existing `describe("traceability")` from Task 1.

**Interfaces:**
- Consumes:
  - `CITATIONS` from `./citations.js` (Task 1) — a plain object with 15 string keys, including the two markers `structural` and `judgement`.
  - `ALL` — the flat array of every item the eight-profile matrix emits, declared inside `describe("traceability")` in Task 1. Every element has `src: string[]`, non-empty, guaranteed by T2 and T2b.
- Produces: no runtime change of any kind. Nothing in `src/` outside the test file is touched by this task. `npm test` goes from 150 to 153.

**Background the implementer needs:**

Task 1 proved every item carries keys. This task proves the keys mean something and that the two evidence-free markers cannot spread quietly. Neither property is checkable by looking at `planner.js`, which is why they are here and not in a review checklist.

The argument for each of the three is in its own comment in Step 1, where it ships with the assertion instead of two screens above it. One thing that does not fit in a comment:

**What T4 buys, stated as friction rather than as safety.** Without it, `judgement` is a loophole: any future item passes T1–T3 by declaring itself evidence-free, and the traceability claim quietly degrades into "every item has a string on it". With it, marking a new item as judgement fails the build until someone edits a list sitting directly beneath a comment explaining what the marker means. That is the smallest thing that makes the decision conscious.

One thing to type exactly: T3 uses `Object.hasOwn`, **not** `k in CITATIONS`. The reason is in its comment.

- [ ] **Step 1: Write the failing tests**

Add one import to `src/planner.test.js`, immediately below the `readFileSync` import Task 1 added:

```js
import { CITATIONS } from "./citations.js";
```

Then append these three `it` blocks **inside** the existing `describe("traceability")` block, after the last `it` in it and before its closing `});`. They read `ALL`, which is declared at the top of that describe.

```js
  /* T3. Without this, src: ["burke2016"] passes T2 and points at nothing — a
     citation identifier that identifies no citation, which is the failure that
     would make the paper's claim false while looking like proof of it. It also
     catches the other direction: a key deleted from CITATIONS while an item
     still cites it.
     Object.hasOwn, NOT `k in CITATIONS`: `in` walks the prototype chain, so
     src: ["toString"] and src: ["constructor"] resolve against a plain object
     and this passes on a key that identifies nothing. Same length, and it is
     also the only guard on a key that is empty, a number or null, which is why
     T2b checks shape only. */
  it("resolves every key an item cites in CITATIONS", () => {
    const unknown = [...new Set(ALL.flatMap((i) => i.src))]
      .filter((k) => !Object.hasOwn(CITATIONS, k));
    expect(unknown).toEqual([]);
  });

  /* T4. Ten items whose intervention has no supporting study in the corpus, and
     two that are navigation rather than recommendation. Both lists are frozen
     here so that marking a new item evidence-free is a decision somebody makes
     on purpose, in this file, under this comment.
     TWO literals, not one set of twelve: a single union PASSES when an item is
     relabelled judgement -> structural, and that relabel is exactly the
     laundering Part 3 forbids ("structural would pass the same test and is a
     lie"). The assertion that exists to stop marker creep cannot be the one
     that cannot see it. A count would be worse than either — it passes when one
     item gains the marker and another loses it.
     The 13 sourced items are pinned by nothing but T1 and T3, on purpose: a
     third frozen list of 25 strings would rot and catch nothing. */
  const JUDGEMENT = [
    "caff-swap", "commute", "eye-break", "food-late", "hard-warn",
    "hydrate-start", "pre-meal", "pre-min", "snack", "water-now",
  ];
  const STRUCTURAL = ["end-shift", "shift-start"];
  const marked = (m) => [...new Set(ALL.filter((i) => i.src.includes(m)).map((i) => i.id))].sort();

  it("marks exactly ten items as design judgement and exactly two as navigational", () => {
    expect(marked("judgement")).toEqual(JUDGEMENT);
    expect(marked("structural")).toEqual(STRUCTURAL);
  });

  /* T4b. Clause 2 of the judgement rule: a study key may sit beside the marker
     to name the risk a judgement rule addresses, but it does not support the
     rule. Exactly five items do that. A sixth means somebody borrowed a citation
     because the CATEGORY matched — eye-break is a short break and dallora2020 is
     about short breaks, but the item's claim is ocular. A key that survives a
     category match and fails a claim match converts a known gap into a hidden
     one, which is worse than judgement, and this line is the only thing in the
     suite that can see it happen. */
  it("lets a study key name the risk beside judgement on exactly five items", () => {
    const withStudy = marked("judgement")
      .filter((id) => ALL.find((i) => i.id === id).src.length > 1);
    expect(withStudy).toEqual(["caff-swap", "commute", "food-late", "pre-meal", "snack"]);
  });
```

- [ ] **Step 2: Run the tests to verify they fail — and expect a surprise**

Run: `npx vitest run src/planner.test.js`

Expected: **all three PASS immediately.** Task 1 typed the mapping correctly, so these assertions describe a tree that already satisfies them.

That is not a reason to skip them and it is not a reason to trust them. It is the reason Step 3 exists: an assertion that has never been seen to fail is a comment. Do not commit until Step 3 has driven each of the three red and back.

If any of the three fails here, do **not** edit the test to match the code. Task 1 mistyped a key or a marker; open `docs/superpowers/specs/2026-08-13-traceability-design.md` Part 3 and Task 1's Step 5 tables, and fix `planner.js`.

- [ ] **Step 3: Mutation check — three breaks, three different reds**

Each is one edit in `src/planner.js`, one `npx vitest run src/planner.test.js`, one revert.

1. **Relabel a judgement item as navigational.** This is the mutation T4 exists for. In `hydrate-start`, change `src: ["judgement"],` to `src: ["structural"],`.

   Expected: **"marks exactly ten items as design judgement and exactly two as navigational" FAILS on both lists at once** — `judgement` comes back with 9 ids and `structural` with 3. T3 stays green, because `structural` is a real key. **A single frozen union of twelve would have passed this**, which is the whole argument for two literals. Restore.

2. **Mistype a key.** In `caff-cutoff`, change `"burke2015"` to `"burke2016"`.

   Expected: **"resolves every key an item cites in CITATIONS" FAILS**, reporting `["burke2016"]`. T1, T1b, T2, T2b and T4 all stay green — which is exactly the point: nothing else in the suite can see a key that resolves to nothing. Restore.

3. **Borrow a citation because the category matched.** In `eye-break`, change `src: ["judgement"],` to `src: ["dallora2020", "judgement"],` — the specific borrow the spec names as the trap the phase is built around.

   Expected: **"lets a study key name the risk beside judgement on exactly five items" FAILS**, reporting six ids with `eye-break` among them. T3 stays green (`dallora2020` is a real key) and T4 stays green (the item is still marked `judgement`). Restore.

If break 3 leaves the suite green, T4b is reading `src.length` on the wrong object and the trap is untested.

- [ ] **Step 4: Run the regression gate**

Run: `npm test` → expected **153 passed** (150 + 3).
Run: `node drive-history.mjs` → expected **15/15 passed**.
Run: `node drive-plan-state.mjs` → expected **6/6 passed**.
Run: `node drive-loop.mjs` → expected **12/12 passed**.

Nothing outside `planner.test.js` changed in this task, so any driver failure here is a leftover mutation from Step 3 that was not reverted. Check `git diff src/planner.js` — it must be empty.

- [ ] **Step 5: Commit**

```bash
git add src/planner.test.js
git commit -m "test: a citation key has to resolve, and an evidence-free marker has to be declared"
```

---

### Task 3: Nothing broke

**Files:**
- Create: `drive-cite.mjs` at the repo root.
- Modify: `.gitignore` — one line, beside `!drive-loop.mjs`.

**Interfaces:**
- Consumes: the running dev server on `http://localhost:5174/`, and `playwright` from `node_modules` (already installed; every existing driver is run with bare `node`). Nothing from Tasks 1 or 2 is imported — the driver does not touch `src/` at all.
- Produces: `node drive-cite.mjs` → `8/8 passed`, exit 0. No source file changes.

**Background the implementer needs:**

**State this plainly in review, because it is the point of the task: this driver is a smoke test, not a gate.** It proves that adding a field to every plan item broke no rendering. It proves nothing about whether a citation is correct, and there is no defect it can catch that `npm test` does not catch first and cheaper — a mis-inserted `src:` line is a syntax error vitest sees, and `src` reaches no screen (`grep -c src src/App.jsx` is 0). It is here because Tasks 1 and 2 hand-edit twenty-five object literals in a 671-line file and one end-to-end render of the real app is the cheapest confirmation that nothing structural moved. The unit tests are the real gate for the citations, and the only one.

What it reads: `PlanTab` renders `{doneCount} of {plan.items.length} done.` (`App.jsx:1397`) — the full item count, not the collapsed display list — so the number is on the screen already and needs no instrumentation.

The fixture has three traps (plan-axis log times, the chosen wall clocks, the night stamp) and they are documented in the driver's own comments in Step 2, where they stay with the constants they govern. **Read them before changing any constant.** The expected counts — A–H return 20, 20, 21, 21, 19, 21, 21, 21, union exactly the 25 ids with `move-N` collapsed — were driven against the real `generateTimeline` and then against the real app. If the planner has moved since, re-derive before trusting them.

- [ ] **Step 1: Un-ignore the new driver**

In `.gitignore`, change:

```
drive*.mjs
!drive-history.mjs
!drive-plan-state.mjs
!drive-loop.mjs
```

to:

```
drive*.mjs
!drive-history.mjs
!drive-plan-state.mjs
!drive-loop.mjs
!drive-cite.mjs
```

Do this first. `drive*.mjs` is ignored, so a driver written before this line exists is invisible to `git add` and to review, and there are already twenty untracked `drive-*.mjs` files in this repo to prove how easy that is to miss.

- [ ] **Step 2: Create the driver**

Create `drive-cite.mjs` at the repo root with exactly this content.

```js
/* Phase 6 smoke test, not a gate. It proves ONE thing: adding `src` to every
   one of the 25 plan items broke no rendering. It does NOT check that any
   citation is correct, and it cannot — `src` never reaches the DOM,
   localStorage or the export, so there is nothing about the field itself a
   browser can see, and every defect this can catch, `npm test` catches first.
   The unit tests in src/planner.test.js are the real gate for the citations,
   and they are the only gate for them.

   Same pattern as drive-plan-state.mjs and drive-loop.mjs: page.clock.install
   before goto, addInitScript seeding gy.v1, a record() tally, pageerror and
   console errors failing the check they happened in, non-zero exit on failure.
   The dev server is already up on :5174.
   Run: node drive-cite.mjs [url] */
import { chromium } from "playwright";

const URL = process.argv[2] || "http://localhost:5174/";

const BASE = {
  shiftStart: "22:00", shiftEnd: "06:00", plannedSleep: "07:30", sleepGoalHours: 7,
  nightInStretch: 1, caffeine: "moderate", nap: "both", caffeineSensitivity: "normal",
  movement: "mixed", lightEnv: "bright", commute: "drive", sleepiestTime: "deep",
  chronotype: "neither", overrides: {},
};

/* Plan-axis minutes, not clock minutes: ph.start is 1320 for BASE. A log at
   t: 190 on a 22:00 shift is 19 hours before the plan and fires nothing, which
   is the trap drive-loop.mjs names and the reason every log time below is S + n. */
const S = 1320;

/* Wall clocks chosen so nightOf puts the app exactly where the unit matrix in
   planner.test.js stands. For every profile here the wake boundary is inside the
   same day, so `now` on the axis is the clock time (plus 1440 past midnight):
     22:00 on Aug 13 -> now = 1320 = ph.start
     01:20 on Aug 14 -> now = 1520 = ph.start + 200
     06:00 on Aug 13 -> now =  360 = ph.start of the 06:00-14:00 shift
   All three resolve to night "2026-08-13", which is why every blob is stamped
   with it: a stamp mismatch sends boot through forNight -> archived, folds the
   night away and clears the logs, and the count would fail for the wrong reason. */
const AT_START = new Date("2026-08-13T22:00:00");
const AT_PLUS_200 = new Date("2026-08-14T01:20:00");
const AT_EARLY = new Date("2026-08-13T06:00:00");

/* The spec's eight-profile matrix, and its verified item counts. Driven against
   the real generateTimeline and then against the real app. Their union is
   exactly the 25 ids of the mapping with move-N collapsed. */
const CASES = [
  ["C1 baseline", BASE, [], AT_START, 20],
  ["C2 woke late", BASE, [{ id: "w", t: S - 200, type: "wake", value: "later" }], AT_START, 20],
  ["C3 short goal, woke early", { ...BASE, sleepGoalHours: 5 },
    [{ id: "w", t: S - 200, type: "wake", value: "earlier" }], AT_START, 21],
  ["C4 high caffeine", { ...BASE, caffeine: "high" }, [], AT_START, 21],
  ["C5 no deep night", { ...BASE, shiftStart: "06:00", shiftEnd: "14:00", plannedSleep: "15:00" },
    [], AT_EARLY, 19],
  ["C6 nap logged", BASE, [{ id: "n", t: S + 180, type: "nap", value: "ok" }], AT_PLUS_200, 21],
  ["C7 water gap", BASE, [{ id: "wa", t: S, type: "water", value: 1 }], AT_PLUS_200, 21],
  ["C8 screen strain", BASE, [{ id: "sc", t: S + 190, type: "screen", value: 1 }], AT_PLUS_200, 21],
];

const results = [];
const record = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `\n        ${detail}` : ""}`);
};

const seed = (blob) => `
  try { localStorage.setItem("gy.v1", ${JSON.stringify(JSON.stringify(blob))}); } catch {}
`;

/* A page with the clock frozen at `time` and localStorage pre-seeded, both
   before the app's first line runs. */
async function open(browser, { time, blob }) {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // resource 404s (favicon) are noise; only script errors count against a check
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("Failed to load resource")) {
      errors.push("console: " + m.text());
    }
  });
  await page.clock.install({ time });
  await page.addInitScript(seed(blob));
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(400);
  return { ctx, page, errors };
}

const browser = await chromium.launch({ channel: "chrome" });

for (const [name, profile, logs, time, expected] of CASES) {
  const { ctx, page, errors } = await open(browser, {
    time,
    blob: { night: "2026-08-13", profile, logs, reflection: {}, theme: null, archive: [] },
  });
  /* { exact: true }: the Dashboard's range view has a button called "Apply to
     next plan", so a loose name match on "Plan" is ambiguous and times out. */
  await page.getByRole("button", { name: "Plan", exact: true }).click();
  await page.waitForTimeout(300);
  /* PlanTab's own header — "0 of 20 done." (App.jsx:1397). The item count is on
     the screen already, so this needs no instrumentation and reads the same
     number the user does. */
  const total = await page.evaluate(() => {
    const m = document.body.textContent.match(/\d+ of (\d+) done/);
    return m ? Number(m[1]) : null;
  });
  record(`${name} renders ${expected} plan items with no page error`,
    total === expected && !errors.length,
    `items=${total} expected=${expected} err=${errors.join(" || ") || "none"}`);
  await ctx.close();
}

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log("failed: " + failed.map((r) => r.name).join(", ")); process.exit(1); }
```

- [ ] **Step 3: Run the driver**

Run: `node drive-cite.mjs`

Expected: `8/8 passed`, exit 0.

If every case reads `items=null`, the Plan tab did not open — check that the dev server is up on :5174 and that the seeded profile still satisfies whatever `App.jsx` requires before it leaves the quiz. If one case reads a count one lower than expected across the board, the seeded blob's night stamp no longer matches what `nightOf` computes and boot folded the logs away.

- [ ] **Step 4: Mutation check — prove the driver can see the plan**

One edit, one `node drive-cite.mjs`, one revert.

Comment out the whole `hydrate-start` `add({ ... });` block in `src/planner.js` (`planner.js:304-311`).

Expected: **all eight cases FAIL**, reporting `items=19 expected=20` for C1 and C2, `items=20 expected=21` for C3, C4, C6, C7 and C8, and `items=18 expected=19` for C5. Restore.

If the driver stays at `8/8` with an item removed, it is not reading the plan — the regex matched something else on the page and the check is decorative.

- [ ] **Step 5: Run the regression gate**

Run: `npm test` → expected **153 passed**, unchanged from Task 2.
Run: `node drive-cite.mjs` → expected **8/8 passed**.
Run: `node drive-history.mjs` → expected **15/15 passed**.
Run: `node drive-plan-state.mjs` → expected **6/6 passed**.
Run: `node drive-loop.mjs` → expected **12/12 passed**.

Then confirm the mutation was reverted: `git diff src/` must be empty. This task changes nothing under `src/`.

- [ ] **Step 6: Commit**

```bash
git add .gitignore drive-cite.mjs
git commit -m "test: eight profiles still render their plans with the citation field on every item"
```

---

## Out of scope

- **`generateTimeline`'s signature, and every existing behaviour.** One field is added to the objects it returns. Nothing reads it at runtime.
- **Any UI.** No screen, no disclosure, no key rendered anywhere. The claim being repaired is about where the check runs, not about what a user sees; the reader of a citation key is a panelist, not a shift worker at 03:00; and `judgement` would put a note on ten items saying the literature does not back them, which is the correct thing to tell an examiner and a strange thing to tell someone deciding whether to drink water. If a screenshot of in-app traceability is ever needed for the appendix, it is a `<details>` inside the existing "Why this" panel (`App.jsx:1288`) using `T.faint` at 12.5px — named here so it is not designed twice — and it is still not this phase.
- **A `designSrc` field**, or any second field about presentation. The answer would be the same on all 25 items, because those decisions are architectural and made once in `tokens.js` and `ui/index.jsx`. Twenty-five copies of one answer is not traceability.
- **`CARE`** (`App.jsx:36`) — the breathing and stretch player. It recommends behaviour and carries no citation, but it is not a plan item and the paper's claim is about plan items. Worth recording for whoever picks it up: `dallora2020` and `tucker2018` name *"stretching and controlled breathing"* explicitly, so box breathing, 4-7-8 and the neck sequence would map honestly if the claim is ever extended. **Do not extend it in this phase.**
- **`generateAdvice`'s six phase blocks and the reflection copy.** All recommend, none are plan items, none are in the paper's sentence.
- **`REVIEW`'s block copy** (`App.jsx:618`), read by the recommendation screen. Step 4a rewrites `light-early` for overreaching on alertness; `App.jsx:695` makes the *same* claim — *"Bright light early supports alertness at no cost"* — and a grep for the old wording will land on it. Leave it. It is not a plan item, it carries no `src`, and rewriting app copy this phase does not gate is scope creep dressed as consistency. Worth one line in the paper's own list of follow-ups, not a line of code here.
- **The `move-quick-*` and `skip-quick-*` log ids** (`App.jsx:2679`). They look like item ids in the log stream and never come from the planner.
- **Rewriting Chapter II to add a drowsy-driving source.** Named in Task 1's Background as the action this phase generates. It is a paper edit, not a code change.
- **Contrast (§4) and multimodal content (§5)** of `app-design-basis.md`. Both still open, neither is Phase 6.
- **Full APA entries, BibTeX, a citation registry module, a generated matrix appendix.** All of §3's skip list, still skipped.
- **An assertion that every key in `CITATIONS` is used by some item.** It guards a harmless failure — a dead line in a reference list — at the cost of another assertion.
- **A runtime guard in `add()` that throws on a missing `src`.** It moves a developer's mistake into the user's browser to save a test.

---

## Known ceilings

- **An item behind a condition no matrix profile reaches is invisible to T2, T3 and T4.** Only T1 sees it, and T1 sees text, not behaviour. An item added with `src: ["burke2016"]` behind a novel condition passes the whole suite. Closing this needs either symbolic execution of the planner or a matrix that grows with every new branch; the lint is the 80% for four lines. The escalation is to add a profile to the matrix whenever a branch is added, which is a habit, not a mechanism.
- **The mapping's quality is not testable.** T3 proves a key resolves; nothing proves it is the *right* key. Part 3 of the spec and a ten-minute read with `research-summary.md` open are the whole defence.
- **`citations.js` holds no full APA entries** for any circadian source, because the repo does not contain them. Anyone reconciling this file against Chapter I–II's reference list should expect to expand every line, and should treat a line that already looks complete as suspect.
- **Ten of 25 recommendations have no supporting study**, and after this phase that is a documented property of the running system rather than an undiscovered one. The paper must not claim "every plan item corresponds to a supporting study" without qualification; the true claim is that every plan item records whether it does.
- **`commute` — the plan's only unskippable, priority-flagged card — is one of the ten.** Until Chapter II gains a drowsy-driving source, the app's most consequential recommendation is design judgement wearing a safety warning's emphasis.
- **`structural` is unfalsifiable.** Nothing prevents a future recommendation being labelled navigational. T4's frozen set means it cannot happen quietly; it does not mean it cannot happen.
- **`drive-cite.mjs`'s counts are pinned to a planner that is allowed to change.** When a legitimate new item lands, all eight counts move at once. That is the driver's real ongoing job — telling you to re-read the matrix — and it is also the reason it is a smoke test rather than a gate.
- **`CARE`'s eight micro-care exercises carry no citation** and are outside the claim. If a panelist asks about the breathing exercises, the honest answer today is that they are not plan items and were not part of the traceability check.

---

## Assumptions

Recorded because the human partner was unavailable for the whole of this plan's writing. Every one is either the spec's own recorded assumption or the smallest choice consistent with what this repo already does.

1. **The spec's twelve assumptions are carried unchanged** — `src` as an array of lowercase keys, `citations.js` as the table, `judgement` beside `structural`, the intervention-not-the-clock rule, study keys allowed beside `judgement`, mechanism-earns-a-key for theory anchors, no item dropped, `commute` keeping its priority, the two `why` rewrites, `sleep-window` on the evidenced side, and the four assertions. See the spec's own Assumptions section for the argument behind each.
2. **The spec's Part 5 is overruled on one point, on the orchestrator's instruction rather than on the merits.** It concludes there should be no driver, because `src` never reaches the browser — and that reasoning still stands. `drive-cite.mjs` is a smoke test over twenty-five hand-edited object literals, not a check on the field: it says so in its own header, Task 3 says so in review, and there is no defect it catches that `npm test` misses first. It is kept because one command that renders the real app for eight profiles is cheap evidence for a thesis deliverable. Drop Task 3 and nothing about the phase's claim weakens. `.gitignore` changes only because of it, contrary to the spec's "Skipped" list.
3. **The two `why` rewrites land in Task 1, not with the driver.** The argument is at the end of the File Structure section, where the task order is set.
4. **Three assertions beyond the spec's four** — T1b (the lint's own anchor), T2b (array, not bare string) and T4b (exactly five study-keys-beside-judgement). Each closes a hole where an existing assertion passes for the wrong reason, each is one line, and T4b is the only thing in the suite that can see the borrowed-citation trap the spec names as the trap the phase is built around. T1b also pins the block count at 25, which overrules the spec's edge-case row saying a cited 26th item passes: it passes all four and then fails T1b until the number is bumped in the same commit. T3 additionally uses `Object.hasOwn` where the spec wrote no predicate at all — `in` walks the prototype chain and would resolve `src: ["toString"]`.
5. **The eight-profile matrix's construction is fixed in this plan** (which log types, which `t` offsets, which `now`) because the spec names the profiles but not the log shapes. The construction here was driven against the real `generateTimeline` and returns exactly the spec's 20, 20, 21, 21, 19, 21, 21, 21 with a 25-id union.
6. **`citations.js` uses the author forms `research-summary.md` itself uses** — `Ruggiero & Redeker`, `Geiger-Brown et al.`, `Oriyama & Miyakoshi`, `Baron & Reid`, `Boivin & Boudreau`, `Tucker` — rather than normalising them all to "et al.". Copying what the corpus says is the whole discipline of this file.
