# Phase 6 — Traceability

A plain-language summary of what changed, how it was checked, and what is still
wrong on purpose. No prior knowledge of this codebase assumed.

---

## What Phase 6 was for

GraveYard is a planning app for people who work night shifts. It builds a plan for
tonight — when to have your last caffeine, when to get up and move, when to sleep
— and each thing on that plan is called an **item**. There are 25 distinct items
the app can put on a plan.

The app is also the **artifact** for an academic paper: the working thing the
paper is about. A panel of examiners will read the paper and, if they want, open
the code.

The paper's central claim about its own method is that every recommendation the
app makes can be traced back to research. Chapter III states it directly: the
check is performed against citation identifiers *recorded on each plan item*, so
that it runs "against the running system rather than against separately
maintained documentation."

That sentence was not true. It was true of the design documents, which do discuss
which studies sit behind which rules. It was not true of the program. Nothing in
the code recorded where any recommendation came from, and nothing checked. You
could add a 26th item tomorrow, invented on the spot, and every test would still
pass.

**Traceability, in one sentence: each thing the app tells you to do carries, in
the code, the name of the study it came from — or an honest note saying there
isn't one.**

That second half is the phase. It was expected to be a small bookkeeping job. It
turned into the most useful finding in the project.

---

## What got built

Three things, and no screen. Nothing in this phase is visible to someone using
the app.

### 1. A `src` field on every plan item

Each item in the code already carried a `why` — the plain-English reason shown to
the user when they tap "Why this". It now carries a `src` beside it: a list of
short **citation keys**.

A citation key is a nickname for a study, made of the first author's surname and
the year. `burke2015` is Burke and colleagues, 2015. That is all it is — a label,
not the reference itself.

```js
{
  id: "caff-cutoff", at: s.cutoff, category: "caffeine",
  why: `Caffeine takes hours to clear, so stopping now leaves time…`,
  src: ["burke2015", "mchill2014"],
}
```

It is a list rather than one name because ten items rest on two studies and four
rest on three. The field sits directly after `why` on purpose: the paper's claim
is that the identifiers sit *alongside the user-facing rationale*, so the code
should look like that too.

The field costs nothing anywhere else. Plan items are never saved to disk and
never exported, so `src` adds no bytes to your saved file and needs no checking
when the app starts up — unlike every field the five earlier phases added.

### 2. `src/citations.js` — the file where a key means something

A new file holding one line per key. Fifteen lines: thirteen studies and two
markers.

```js
burke2015: "Burke et al. (2015) — evening caffeine doses delay melatonin
            secretion and phase-delay the clock.",
```

Every line is taken from `docs/research-summary.md`, which is this project's own
summary of the studies it read. That file is 29 lines long and it is the entire
evidence base for what the planner tells a shift worker to do.

Finding that out changed the phase. There are two bibliographies in this repo and
they are about different arguments: `reference-integration.md` is 575 lines about
*how the app was built and how it looks* — typography, colour, accessibility —
and the circadian researchers appear in it only as passing mentions. Thirteen of
the seventeen circadian authors in this project appear in `research-summary.md`
and nowhere else.

The two markers live in the same file as the studies, because the code reads them
the same way:

- `structural` — not a recommendation at all.
- `judgement` — a real recommendation with no study behind it.

`planner.js` never imports this file. The keys stay meaningless strings to the app
itself. The only thing that opens `citations.js` is the test, which is what a
certificate is supposed to look like.

### 3. Seven automated checks that fail the build

An item with no citation, or an item citing something that does not exist, now
stops the test suite. The seven are described under "How it was tested" below.

---

## The honest finding

This is the most important part of this summary, and it is not a feature.

Of the 25 things the app can put on a plan:

| | Items |
|---|---|
| Recommendations with a genuine supporting study | **13** |
| Structural — not recommendations at all | 2 |
| Recommendations marked `judgement` — no supporting study | **10** |

The 2 structural ones are `shift-start` and `end-shift`. They exist because a
shift has a beginning and an end. One states the plan's own boundaries; the other
is the button that switches the app into recovery mode. Neither tells you to do
anything, so neither needs a study.

The 10 are a different matter. They tell you to do things, and the research
corpus — the set of studies this project actually holds — contains nothing on:

- **hydration.** Not one source. Three items depend on it.
- **meal timing.** The corpus establishes that night workers face higher
  metabolic risk. It says nothing about *when* to eat.
- **visual ergonomics.** No source on eye strain or screen breaks.
- **drowsy driving.** No source. This is the serious one; see below.
- **bright light as a way to feel more awake.** The corpus covers light as a
  signal to your body clock. It does not cover using light as a stimulant.

### Why marking them is better than the two alternatives

**Inventing a citation** would have been easy and is the exact failure this phase
existed to prevent. There is always a study that *nearly* fits. `eye-break` is a
short break; one of the cited studies is about short breaks restoring alertness.
Attaching it would have passed every check in this suite. It would also have been
false — that study is about alertness, and the eye-break item's entire stated
reason is about eyes. A citation that survives a category match and fails a claim
match is **worse than no citation**, because it converts a gap somebody knows
about into a gap nobody can see. That borrow was specifically declined, and there
is a test that catches it (see T4b).

**Deleting the ten features** would have been the other way to make the check
pass. Drinking water, taking an eye break and deciding your snack in advance are
useful and harmless, and removing a third of the plan to get a green test is
optimising the artifact for the check instead of the check for the artifact. An
item that is quietly dropped teaches nobody anything. An item marked `judgement`
tells the next reader exactly which recommendations the literature is not behind.

There was a third temptation worth naming: labelling them `structural` instead.
It would have passed the same tests. It is also a lie, because these items do
recommend behaviour, and disguising a recommendation as navigation is precisely
the dishonesty that would make the paper's claim false in the way that looks
true.

### The claim the paper is now allowed to make

Stated plainly, because the difference matters:

> **Not** "every recommendation is backed by a study."
>
> **But** "every recommendation records whether it is."

The first is false and was always false. The second is true, checkable, and
checked on every build.

### The five that carry a study alongside the marker

Five of the ten judgement items are not bare. `pre-meal`, `caff-swap`, `snack`,
`food-late` and `commute` each carry one or two study keys *next to* `judgement`.

Those studies name the **risk** the rule is addressing. They do not support the
**rule**. `kervezee2022` genuinely establishes that night workers run higher
diabetes, obesity and hypertension risk — that is why the app talks about food at
all. It does not say your largest meal should come before the shift. That timing
is the app's judgement.

The code says so. The `judgement` line in `citations.js` reads, in part: "Where
study keys sit alongside this marker, they name the risk the rule addresses; they
do not support the rule." A reader who sees two names on an item and assumes the
item is evidenced is corrected by the file itself. And exactly five items are
allowed to do this — a sixth fails the build, because a sixth is how a borrowed
citation would get in.

---

## The one that most deserves a follow-up

`commute` is the warning the app shows about driving home after a night shift.

It is the most emphatic thing in the whole program. It is the **only** item with
`priority: true`. It is the **only** item you cannot skip — every other card in
the app has a skip button, and this one does not, on the branch where you told
the app you drive. Its own text says so: *"This is the one item in the plan with
no skip button."*

And the research corpus contains nothing about driving, drowsiness at the wheel,
or crash risk after a shift. That literature certainly exists. It is not in this
repository.

The phase did not soften the item and did not soften the finding:

- **It keeps its priority and keeps having no skip button.** It is right on the
  merits and it is the highest-stakes thing the app says. Weakening a correct
  safety warning to make a citation table tidier would be the wrong trade in an
  obvious direction.
- **Its citation is honest:** `["wickwire2021", "boivin2014", "judgement"]`. Those
  two studies establish that you are cognitively degraded and chronically
  fatigued after consecutive night shifts. That state is cited. The instruction
  about driving is not.
- **What it needs is a source in the paper's Chapter II** — one reference and one
  sentence, in a chapter that is being written anyway. That is an edit to the
  paper, not to the code. It is the single highest-value follow-up this phase
  produced.

Until that reference lands, the app's most consequential recommendation is design
judgement wearing a safety warning's emphasis. Finding that is what the phase was
for. A traceability check that surfaces nothing was not run.

---

## Two sentences that were rewritten

Two items claimed something their sources did not support. Both were fixed by
changing the sentence, not by changing the citation.

**`light-early`** used to read:

> "Bright light early is one of the few alertness tools that costs nothing later,
> which is why it is timed rather than left on."

Its source, `cho2015`, is about light and the body clock: blue-spectrum light at
night suppresses melatonin and shifts your timing. It supports the *second* half
of that sentence — light this early is far enough from your sleep window not to
push it later. It says nothing at all about alertness, and the corpus has no
source anywhere on using light to feel more awake. Now:

> "Light this early is far enough from your sleep window that it will not push it
> later, which is why it is timed rather than left on."

**`winddown`** had the same defect one layer down, and it was nearly missed. The
instruction on the card is "Lower the light, no new caffeine, slow the pace" —
two of those three are cited. But the *reason* shown when you tap "Why this" was
only about the third:

> "Going straight from a working night to bed rarely works, so a deliberate
> slowdown gives your body a signal it can act on."

The paper's claim is that keys sit alongside *the user-facing rationale*. A key
that supports the instruction and not the rationale is half a citation. Now:

> "Lower light and no new caffeine both act on the same thing — the sleep window
> you are about to use — so the wind-down starts before the shift ends rather
> than after it."

**Why rewording was the right move.** The alternative was to hunt for a citation
that covers the alertness claim. There isn't one in this corpus, so it would have
meant attaching a source that covers half the sentence and hoping nobody read
both. A half-fitting citation is the failure mode of the entire phase in
miniature: it looks like rigour, it survives every automated check, and it is
false. Rewording costs one string each and leaves both items saying exactly what
their sources support. If a light-and-alertness source is ever added to Chapter
II, the original claim can come back with a key behind it.

Both rewrites landed in the same commit as the citation keys, deliberately.
Landing the keys first and the copy later would have left the project, for two
commits, in a state where two items cited a source for a claim it does not
support — inside the phase built to prevent exactly that.

---

## How it was tested

Two kinds of test, answering different questions.

A **unit test** takes one function on its own, hands it an input, and checks the
output. It is fast — the whole suite runs in about two and a half seconds — and
it never opens a browser.

An **end-to-end test**, also called a browser test, drives the real app in a real
browser the way a person would: it sets up saved data, opens the page, taps
things, and reads what actually rendered. Slower and fussier, and the only way to
check anything that is a screen rather than a calculation. These are run with a
tool called Playwright.

**This phase is unusual: the unit tests are the entire gate, and the browser test
proves nothing about citations.** That is stated here rather than buried, because
it would be easy to read `drive-cite.mjs` as a citation check. It is not one.

**Unit tests: 153, up from 146 at the start of the phase** — seven added, all
seven in one block called `traceability` inside `src/planner.test.js`.

The seven run against a **matrix** of eight profiles: eight different made-up
users, chosen so that between them they reach every item the planner can produce.
One profile is not enough, because 12 of the 25 items only appear under certain
conditions — you only see the nap-buffer item if you logged a nap. The eight
profiles produce 20, 20, 21, 21, 19, 21, 21 and 21 items, and between them they
cover all 25 exactly once.

| | What it proves |
|---|---|
| T1 | Every place in `planner.js` where an item is built contains a `src`. This one reads the source code as text rather than running it, which is the only way to see an item hidden behind a condition no test profile reaches. |
| T1b | The text scan still finds all 25 construction sites. Without it, renaming the function that builds items would leave T1 scanning nothing, finding no problems, and reporting success because it had stopped looking. |
| T2 | Every item the eight profiles actually produce has a non-empty `src`. T1 reads text; this one reads real output. |
| T2b | The field is a list, not a bare string. `src: "burke2015"` would pass T2 — a string has a length — and then be read one character at a time by everything downstream. |
| T3 | Every key an item cites exists in `citations.js`. Without this, `src: ["burke2016"]` passes T2 and points at nothing: a citation identifier that identifies no citation. |
| T4 | The ten `judgement` items and the two `structural` items are exactly the ones listed, frozen in two separate lists. Marking a new item evidence-free now fails the build until somebody edits that list on purpose. |
| T4b | Exactly five judgement items carry a study key alongside the marker. A sixth means somebody borrowed a citation because the category matched. This is the only check in the suite that can see that happen. |

**Browser checks: 8**, in `drive-cite.mjs`. Each one loads one of the eight
profiles into the real app, opens the Plan tab, and reads the item count off the
screen — the app already prints "0 of 20 done." at the top of the plan, so the
number needed no special instrumentation. A JavaScript error anywhere on the page
fails the check it happened inside.

**Being explicit, because it matters: `drive-cite.mjs` is a smoke test, not a
citation check.** A smoke test asks one question — did anything obviously break?
The citation data never reaches the screen. It is never saved, never exported,
and the word `src` does not appear in the app's display code at all. There is
literally nothing about the field itself that a browser can see. Its only job is
to confirm that hand-editing 25 object literals in a 696-line file did not break
the app's rendering, and there is no defect it can catch that `npm test` does not
catch first and faster. **The unit tests are the only gate for the citations.**

Phase 3's 15 checks in `drive-history.mjs`, Phase 4's 6 in `drive-plan-state.mjs`
and Phase 5's 12 in `drive-loop.mjs` were kept green throughout as the
**regression gate** — a fixed set of checks that must not move, to prove nothing
else broke. None of them moved. All three are structurally blind to this phase,
which is the point: they are there to prove that adding a field to 25 object
literals changed nothing at all.

---

## Mutation testing

A test that passes tells you nothing until you know it is capable of failing. So
after everything was green, each new check was attacked directly: break the thing
it is supposed to catch, re-run, confirm the *right* check goes red, undo the
break. That is mutation testing, and in a phase whose entire deliverable is a
gate, an unmutated gate is a claim rather than a check.

Seven breaks, seven runs, all observed:

| Break | Result |
|---|---|
| Add a 26th plan item with no `src` at all | **All seven red.** T1 reports `["mutation-check"]`, T1b reports 26 sites instead of 25, T2 and T2b report the id once per profile, and T3, T4 and T4b fall over on an item with no field to read. This is the mutation the whole phase turns on. |
| Delete the `src` from `caff-swap`, an item only one of the eight profiles reaches | **6 failed, 35 passed of 41.** T1, T2 and T2b all report `["caff-swap"]`. T1b stays green, because the construction site is still there — the field is what left. This is the break that proves the matrix really reaches the conditional branches. |
| Relabel `hydrate-start` from `judgement` to `structural` | **1 failed, 40 passed.** T4 alone, on both lists at once. See below — this is the sharpest of the seven. |
| Mistype a key: `burke2015` → `burke2016` in `caff-cutoff` | **1 failed, 40 passed.** T3 alone, reporting `["burke2016"]`. Everything else stays green, which is exactly the point: nothing else in the suite can see a key that resolves to nothing. |
| Set a key to `"toString"` | **1 failed, 40 passed.** T3 alone, reporting `["toString"]`. See below — this is the other sharp one. |
| Borrow `dallora2020` onto `eye-break` because both are about short breaks | **1 failed, 40 passed.** T4b alone, reporting six items where five are allowed. T3 stays green (`dallora2020` is a real key) and T4 stays green (the item is still marked `judgement`). This is the trap the whole phase is built around, and T4b is the only line in the suite that can see it. |
| Delete the whole `hydrate-start` item and re-run the browser driver | **0/8 passed.** Every profile reads one item short: `items=19 expected=20`, `items=20 expected=21`, `items=18 expected=19`. If the driver had stayed at 8/8 with an item removed, it would not have been reading the plan at all. |

Every break produced a red check, every red check was the intended one, and every
break was reverted. The working tree was confirmed clean afterwards.

### The two sharpest ones

**`"toString"` is a key that resolves without existing.** The obvious way to write
T3 in JavaScript is `key in CITATIONS`. It is shorter and it reads better. It is
also wrong, because `in` does not only look inside the object you named — it
walks up a chain of built-in ancestors that every plain object in the language
inherits from. Those ancestors have names on them: `toString`, `constructor`,
`valueOf`. Measured directly on the real file:

```
"toString" in CITATIONS               -> true
Object.hasOwn(CITATIONS, "toString")  -> false
```

So an item citing the study "toString" would have been reported as a resolved,
valid citation by the shorter version. The test uses `Object.hasOwn`, which asks
only about the object itself. Same length, one fewer way to be wrong — and it is
also the only thing guarding against a key that is empty, a number, or null,
which is why the shape check (T2b) can be one line instead of two.

**Relabelling `judgement` as `structural` is invisible to the obvious test.** T4
freezes two lists — the ten judgement items and the two structural items —
separately. The tempting simplification is one list of twelve marked items, which
is fewer lines and reads the same.

It is not the same. Moving one item from `judgement` to `structural` changes
neither the total nor the combined membership. Measured on the real planner,
before and after the relabel:

```
before:  judgement 10   structural 2
after:   judgement  9   structural 3

merged list, before: caff-swap, commute, end-shift, eye-break, food-late,
                     hard-warn, hydrate-start, pre-meal, pre-min, shift-start,
                     snack, water-now
merged list, after:  caff-swap, commute, end-shift, eye-break, food-late,
                     hard-warn, hydrate-start, pre-meal, pre-min, shift-start,
                     snack, water-now
```

Identical, item for item. A single merged list passes that mutation without a
murmur — and that relabel is precisely the laundering the phase forbids, the one
move that turns "this recommendation has no evidence" into "this isn't a
recommendation." The check that exists to stop marker creep cannot be the one
check that cannot see it. Two lists, same number of lines.

---

## What passed, and what failed

Everything passes. All five commands, run from the repo root against the dev
server on `http://localhost:5174/`:

```
$ npm test

 Test Files  6 passed (6)
      Tests  153 passed (153)
```

```
$ node drive-cite.mjs

8/8 passed
```

```
$ node drive-history.mjs

15/15 passed
```

```
$ node drive-plan-state.mjs

6/6 passed
```

```
$ node drive-loop.mjs

12/12 passed
```

| Suite | Result |
|---|---|
| Unit tests (`npm test`) | 153 of 153 passed (146 at the start of the phase) |
| Phase 6 browser checks (`node drive-cite.mjs`) | 8 of 8 passed |
| Phase 3 browser checks (`node drive-history.mjs`) | 15 of 15 passed |
| Phase 4 browser checks (`node drive-plan-state.mjs`) | 6 of 6 passed |
| Phase 5 browser checks (`node drive-loop.mjs`) | 12 of 12 passed |

Nothing failed. What follows is the more useful list: things known to be thin,
that were found, and that were deliberately left alone.

- **Nothing anywhere proves a key is the *right* key for its item.** T3 proves a
  key resolves to a line in the citation file. It cannot tell whether that study
  actually supports that recommendation. An item citing a real study that has
  nothing to do with it passes every one of the seven checks. This is not a hole
  that can be closed by writing more tests — no program can read a paper and
  judge whether it backs a rule. The defence is the mapping table in the spec,
  which names all 25 items, the keys each one carries, and the argument for each
  fit, and a reader with `research-summary.md` open who can check the whole thing
  in about ten minutes. That review is what this phase is asking for; it is not
  something the build can do.
- **A study key borrowed onto one of the 13 sourced items is invisible to the
  whole suite.** T4b catches a borrowed citation on a `judgement` item, because
  exactly five of those are allowed to carry a study. There is no equivalent
  check on the thirteen evidenced items: adding `owen2010` to `sleep-window`
  today would pass all seven checks in silence. The thirteen are pinned by
  nothing but T1 and T3, on purpose — a third frozen list of 25 strings would rot
  on the first legitimate change and catch nothing the other two miss.
- **An item hidden behind a condition none of the eight profiles reaches is seen
  only by T1**, and T1 reads text, not behaviour. A new item added with a
  mistyped key behind a novel condition passes the whole suite: T1 sees that it
  has a `src` and cannot check what is in it, and T2, T3 and T4 never see the
  item at all. Closing this properly needs either a matrix that grows with every
  new branch or a much heavier analysis of the code; the text scan is the
  80 percent for four lines. The escalation is to add a profile to the matrix
  whenever a branch is added, which is a habit rather than a mechanism.
- **The citation file cannot carry full references, because this repository does
  not contain them.** `research-summary.md` gives author, year and a one-line
  finding, and nothing else — no journal, no volume, no page numbers, no DOI for
  a single circadian source. Those live in Chapters I and II of the paper, which
  are not in this repo. Writing them from memory would have produced a file that
  looks more rigorous and is less true, which is the exact "looks true, is false"
  failure this phase exists to close. Anyone reconciling `citations.js` against
  the paper's real reference list should expect to expand every line, and should
  treat any line that already looks complete as suspect.
- **`drive-cite.mjs`'s eight item counts are pinned to a planner that is allowed
  to change.** The moment a legitimate new item is added, all eight numbers move
  at once and the driver goes red for a reason that is not a bug. That is
  arguably its real ongoing job — telling you to re-read the profile matrix — and
  it is another reason it is a smoke test rather than a gate.
- **`sleep-window` is the mapping a reviewer could defensibly move.** It is the
  thinnest of the thirteen sourced items and it clears the line by exactly one
  key. It cites `kervezee2022`, which only names a risk — by the phase's own rule
  that belongs beside `judgement` — and `boivin2014`, which is the one carrying
  it: Shift Work Sleep Disorder is a disorder *of* the daytime sleep this item
  protects, so it names the impairment the rule directly counteracts rather than
  a general consequence of night work. One key over the line is still over it. A
  reader who reads it the other way should move the item to `judgement`, taking
  that list to eleven and the sourced count to twelve. It is named here rather
  than left for a panelist to find.
- **`structural` cannot be disproved.** Nothing stops a future recommendation
  being labelled navigational. T4's frozen list means it cannot happen quietly —
  the build fails until somebody edits a list sitting under a comment explaining
  what the marker means. It does not mean it cannot happen.
- **The eight micro-care exercises in the app carry no citation and are outside
  the claim.** The breathing and stretching player is not a plan item, and the
  paper's sentence is about plan items. Worth recording for whoever picks it up:
  two of the cited studies name "stretching and controlled breathing"
  explicitly, so box breathing and the neck sequence would map honestly if the
  claim is ever extended. It was deliberately not extended here.
- **One line of app copy still makes the claim `light-early` just stopped
  making.** The recommendation screen says "Bright light early supports alertness
  at no cost" — the same overreach, in a place this phase does not gate. Left
  alone: it is not a plan item, it carries no `src`, and rewriting copy the phase
  does not check is scope creep dressed as consistency. It belongs on the paper's
  own follow-up list.

Also deliberately skipped, and worth naming so nobody reads them as oversights: a
second field recording the design and typography sources (the answer would be
identical on all 25 items, because those decisions are architectural and made
once — 25 copies of one answer is not traceability); any user-visible display of
citations (the reader of a citation key is a panelist, not a shift worker at
three in the morning, and putting a note on ten items saying the literature does
not back them is the right thing to tell an examiner and a strange thing to tell
someone deciding whether to drink water); full reference entries, BibTeX, and a
generated traceability appendix; a check that every key in the citation file is
used by some item (it guards a harmless failure — a dead line in a reference
list); a frozen list of all 25 item ids; extending the claim to the advice
screens or the reflection copy; and a runtime guard that throws when an item has
no citation, which would move a developer's mistake into a user's browser to save
a test.

---

## What's next

Phase 6 was the last phase on `docs/implementation-roadmap.md`, and the roadmap
is now closed. What remains is of two kinds.

**The out-of-scope list the roadmap has always carried**, tracked in
`docs/app-design-basis.md` rather than as phases: contrast fixes for the warm
theme, multimodal content — either build one audio track or reword the paper's
claim about it — and push notifications, accounts, a backend and acceptance
testing. An import path for the exported file is nearly free now that persistence
and the archive exist, and is still a nice-to-have rather than a phase.

**And the follow-ups the phases themselves surfaced**, which is the more
interesting list. The highest-value one by a distance is this phase's own
finding: **Chapter II needs a drowsy-driving source.** One reference and one
sentence, in a chapter being written anyway, converts the app's most
consequential card — the only unskippable, highest-priority item in the plan —
from design judgement into evidence. It is a paper edit, not a code change, and
it is the single best thing anyone can do for this project's central claim.
