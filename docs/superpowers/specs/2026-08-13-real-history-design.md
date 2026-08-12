# Phase 3 — Real history replaces the mock

`history` becomes `[tonight, ...archive]`. That is one line. The phase is
everything that line exposes: a night id that can walk backward, a `dayOffset`
that is no longer stored, a range that counted records and called them nights,
and a Dashboard that has never once rendered a day with nothing in it.

Spec for Phase 3 of `docs/implementation-roadmap.md`. Builds on Phase 0
(`2026-08-11-night-identity-design.md`), which names the night, Phase 1
(`2026-08-12-persistence-design.md`), which stores it, and Phase 2
(`2026-08-12-rollover-design.md`), which fills the archive. `generateTimeline`
does not change; its signature stays `(profile, logs, now)`.

Three parts, in this order, because the first one gets harder to fix once the
second lands:

1. The night id only moves forward.
2. The swap, and the mock demoted to a seed.
3. Empty states, which are the actual work.

---

## The problem, stated from the code

```js
const history = useMemo(() => {
  if (!profile) return [];
  const past = materializeNights(profile);      // 45 authored nights
  const tonight = foldNight(profile, logs, reflection);
  return tonight ? [tonight, ...past] : past;
}, [profile, logs, reflection]);
```

`App.jsx:2404`. Every night on that screen except the first one is fiction, and
the archive Phase 2 fills is visible only through the export. Swapping the two
sources is trivial. What is not trivial is that the mock is 45 dense,
consecutive, fully-populated nights, and every consumer downstream was written
against that shape without ever being told it was a shape:

- `nights.slice(0, spec.nights)` (`Dashboard.jsx:181`) is exact against 45 dense
  nights and means nothing against a sparse one.
- `have = new Set(nights.map(x => x.dayOffset))` (`:174`) has never had a hole
  in it, so the strip's empty chip has never rendered.
- `nights.find(x => x.dayOffset === off)` (`:179`) takes the first match, and the
  mock cannot produce two records with the same offset. The archive can.
- Both charts, every average, and seven achievements assume there is something
  there.

And the night id can move backward, which is the one defect that stops being
harmless the moment any of the above reads a real record.

---

## Part 1 — The night id only moves forward

Lands first, as its own change with its own tests, before a line of the swap.

### The rule

**The night id is monotonic. It never moves backward, and every writer routes
through one function.**

`src/time.js`:

```js
/** The night id only ever moves forward. Ids are zero-padded local dates, so
    lexicographic order is chronological order and a bare `>` is the whole rule
    — no parsing, no Date.
    The first clause is load-bearing, not a null-check habit: `"2026-08-13" >
    undefined` is false for every string, so without it a fresh profile would
    never seed the ref at all. */
export const forward = (cur, next) => (!cur || next > cur ? next : cur);
```

Three writers, all in `App.jsx`, all one word longer:

```js
// boot
const stamp = forward(s.night, id);
return { ...forNight(s, stamp), night: stamp, now };

// adopt
if (profile) nightRef.current = forward(nightRef.current, nightOf(calculateShiftPhases(profile)).id);

// tick
const { id: seen, now } = nightOf(calculateShiftPhases(profile));
setNow(now);
const night = forward(nightRef.current, seen);
if (night === nightRef.current) return;
```

The tick's existing comparison line does not change. Only where `night` comes
from changes, which is the smallest correct diff and keeps the rollover's shape
legible.

### Why the guard is on the ref rather than on the fold

The obvious alternative is to dedupe at the fold: have `archived` refuse an id
the archive already holds. One line, and it is the wrong line. The ref is read
by three things, and the fold is only one of them:

- The write stamp reads `nightRef.current`. A backward ref writes the *live*
  blob under an older id, so the next boot sees a stamp mismatch and folds a
  duplicate through `forNight` — a path a dedupe inside `archived` would also
  have to cover.
- Phase 3 computes every `dayOffset` against the ref. A backward ref shifts the
  entire day strip by a day.
- The tick's roll condition is the ref.

One guard where all three meet is a smaller diff than three guards, and it is
the root cause rather than the symptom: the id going backward is the bug, a
duplicate record is one of its three consequences.

### Three traps

**The seed.** `nightRef` is `useRef(boot.night)`, and `boot.night` is
`undefined` for a fresh install. Every relational comparison against `undefined`
is false, so `forward` without its `!cur` clause would leave the ref undefined
forever: the write stamps `night: undefined`, the next boot's `forNight` sees a
mismatch, `archived` returns early on the falsy `s.night`, and the logs are
dropped. A fresh install would lose its first night on every reload. This is why
the helper is tested rather than inlined as a `>` at three call sites.

**Do not advance the ref during render.** Doing it in the component body instead
of the adopt effect looks strictly better — the ref would be correct before the
memo reads it, and an effect disappears. It also deletes the rollover. The lag
between the clock's night and the ref *is* the signal the tick reads; advancing
the ref on every render means the tick always sees a match and no night is ever
folded. The adopt effect's narrow four-field dependency list is what keeps that
lag intact for clock-driven changes, and Phase 2's ceiling on that asymmetry
still stands.

**Naming inside `tick`.** The destructured id has to be renamed —
`const { id: seen, ... }` — because `const id = setInterval(tick, 30000)` is in
the enclosing scope and the immediate `tick()` call runs before that
initialiser. A bare `id` inside `tick` is a TDZ `ReferenceError` on the first
call, not a shadowing bug you would find later.

### What it costs

A profile edit that walks the computed night backward now leaves the ref ahead
of `nightOf`. Phase 2's stated invariant — ref equals computed id except between
a boundary and the tick — weakens to: **the ref is never behind the computed
id, and is ahead of it only after an edit that moved the boundary backward.**

The concrete cost, using the roadmap's own worked example: run the 04:00
profile, roll at its 14:30 wake on Aug 12, keep working into Aug 13, then change
`shiftStart` to `"22:00"` at 03:00. The ref stays `2026-08-13`, `nightOf` says
`2026-08-12`, and the boundary that would have ended the night is swallowed —
two nights of logs merge into one record stamped `2026-08-13`. Before the fix
the same sequence produced two records both stamped `2026-08-12`, one of which
the day strip silently hid and both of which `rangeStats` counted.

A merged night is a night that reads long. A duplicated night is a number on
screen that is wrong twice over, in every average, invisibly. Take the merge.

**It also closes the DST fall-back triple-roll for free.** Phase 2 reproduced
`2026-10-31 → 2026-11-01 → 2026-10-31 → 2026-11-01` under
`TZ=America/New_York`. Forward-only makes that one roll and two ignored
crossings, which is what the night actually did.

---

## Part 2 — The swap

### `dayOffset` is computed, never read

Archived records deliberately carry no `dayOffset` (`storage.js:18`). It is
derived from the record's night id against the night the app is currently
standing in.

`src/time.js`:

```js
/** Whole days from b to a, both "YYYY-MM-DD".
    Date.parse reads a bare date as UTC midnight, and UTC has no DST, so the
    difference is an exact whole number of days by construction. Parsing these
    into local Dates is what would introduce the trap, not avoid it: a local DST
    day is 23 or 25 hours, so a week across one measures 6.958 days. Math.round
    is therefore not a DST fix — it is there so a hand-edited id that lost its
    zero-padding still lands on an integer rather than a fraction that matches
    no chip. */
export const daysBetween = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 864e5);
```

`nightOf` is untouched. Nothing in this phase needs to format a `Date` back into
an id.

### The memo

```js
/* Nights are derived, never stored. The archive supplies the past and carries
   no dayOffset — it is relative to tonight, so a stored one is wrong by
   morning — and tonight is folded from the live logs at the front.
   `now` is a dependency because the ref is not reactive and a boundary can pass
   with nothing logged: no logs to clear, no archive to grow, nothing else in
   this list moves, and every archived offset would sit a day out until the next
   tap. The tick is the only thing that fires there. */
const history = useMemo(() => {
  if (!profile) return [];
  const anchor = nightRef.current;
  const past = seeded
    ? materializeNights(profile)
    : archive.map((r) => ({ ...r, dayOffset: daysBetween(anchor, r.id) }));
  const tonight = foldNight(profile, logs, reflection);
  return tonight ? [tonight, ...past] : past;
}, [profile, logs, reflection, archive, now]);
```

`foldNight` is untouched here: it already returns `dayOffset: 0` and
`id: "tonight"`, both correct for the caller it was written for, and nothing
downstream needs tonight's record to carry a date id. Only the archive is
mapped.

The anchor cannot be undefined where it is used. `boot` sets `night` whenever
`boot.profile` exists, and when it does not, `archive` seeds to `[]` — so an
undefined anchor only ever maps an empty array.

**Recomputing every 30 seconds is the cost of `now` in that list.** It is one
`foldNight` and one map over an array that is a few dozen entries long, on the
same tick that already re-runs `generateTimeline`. Measurable against nothing.

---

## Part 3 — The mock becomes a seed

45 authored nights are how the Dashboard, the ranges and `stats.js` stay
testable, and the dataset encodes the app's headline claim on purpose
(`mockNights.test.js:44`). It is demoted, not deleted.

**The seed is a URL flag, read once beside `boot`:**

```js
const seeded = new URLSearchParams(location.search).has("seed");
```

**It goes in the memo, not into `archive` state.** Seeding the state would put
45 fictional nights through the write effect and onto the user's disk, where
they would outlive the flag. The memo is where fiction can exist without being
persisted.

**`materializeNights` keeps its signature and its shape.** Its rows already
carry `dayOffset` and `mock-N` ids, which is what the Dashboard wants, so the
memo branches once rather than restamping 45 rows with dates in order to measure
the same offsets straight back out. The version with an anchor parameter, date
ids and no `dayOffset` was considered so that the seed would exercise the
derivation Part 2 just wrote; it does not need to. `daysBetween` is unit-tested
directly, and R4 drives a real record carrying no `dayOffset` through the strip
— the same assertion, without changing a tested file or its suite.

Its one edit is `endShift: true` on the returned record, so the demo's "Home
safe" is lit rather than conspicuously dark across 45 nights.

**No `import.meta.env.DEV` gate.** This is a thesis prototype that gets
demonstrated from a built artifact; a flag that only works under `vite dev`
would not work in the room where it is needed.

**The seeded Dashboard says so.** The range view already ends with a muted
`Info` line ("Nothing here is a score, and nothing here is graded."); under the
flag it reads "Demo data — 45 sample nights. Reload without ?seed for your
own." One prop on `Dashboard`, one ternary, no new component. This is not
decoration: the screen's own rule is that no figure is ever fabricated
(`Dashboard.jsx:20`), and 45 invented nights presented as history is the largest
possible violation of it.

---

## Part 4 — A range is a window of days, not a count of records

`nights.slice(0, spec.nights)` takes N records. Against the mock those were the
same thing. Against a real archive, an intermittent worker's "1 week" is the
last seven nights they logged, which can span a month — and `wakeDrift`,
`spread` and every "N of M nights" figure then describe a window nobody chose.

**A range is every record whose night falls inside the window.**

```js
// RANGES, in stats.js — `nights` becomes `days`, because that is what it is
{ key: "1w", label: "1 week", days: 7 },
{ key: "all", label: "All time", days: Infinity },

// Dashboard.jsx
const hist = off === null
  ? nights.filter((h) => h.dayOffset >= 0 && h.dayOffset < spec.days)
  : (night ? [night] : []);
```

The field is renamed because its meaning changed and a field named `nights`
holding days is a 3am bug. `Infinity` replaces the `999` sentinel: as a record
count 999 was unreachable, as a day count it is a 2.7-year cliff, and `Infinity`
is one word with no cliff at all.

`st.n` is now the number of nights **logged** in the window, which is the right
denominator for every average — "3 nights" under a "1 week" title reads as three
nights logged in the last week, which is exactly true. That is also the answer
Phase 0 deferred about averages, arriving early and for free.

The `>= 0` term excludes future-dated records. It is reachable: a device clock
moved backward makes `forward` hold the stored night ahead of the computed one,
and a hand-edited archive is a documented trust boundary. A negative offset would
otherwise sit inside every window and inflate every average, so one comparison
buys the guard.

**What the day strip does with gaps: nothing new.** `DayChip` already takes a
`dim` prop and already renders an empty chip — hairline label, hairline border,
half opacity — and `RangeControl` already computes it from `have`. The state has
simply never been reachable, because the mock always had every offset. Tapping a
dim chip already lands on "No record for this night." /
"Nothing was logged that night, so there is nothing to read back."
(`Dashboard.jsx:196`). Phase 3's work on the strip is to verify it, not to build
it.

---

## Part 5 — Empty states

Day one shows one night, or none.

### A window with nothing in it

`rangeStats([])` returns its zero object and `readPatterns` handles every null,
so the range view already renders without throwing. What it renders is a hero
reading "-", a trio reading "-", two empty chart frames, a bullet saying nothing
stood out, and a card offering a plan adjustment derived from no data. Nothing
is wrong and everything is noise.

**Early return, matching the single-night empty branch exactly.** It goes
*below* the `off !== null` block, not above it: `hist` is `[]` for an empty
single night too, and that case already has its own better copy ("Nothing logged
yet." / "No record for this night."). Placed above, this would hijack it.

```jsx
if (!hist.length) {
  return (
    <div style={{ padding: "4px 20px 0" }}>
      <RangeControl T={T} value={rangeKey} onChange={setRangeKey} have={have} />
      <Display T={T} size={26} style={{ marginBottom: 8 }}>No nights on record yet.</Display>
      <Lead T={T}>Log tonight and this window fills in as you go.</Lead>
    </div>
  );
}
```

Same components, same sizes, same two-element shape as `Dashboard.jsx:192`. The
`readPatterns` call moves below this return, since its output is thrown away
above it.

### Charts

**A Panel renders only when it has something to draw.** Two `&&`s:

- sleep: `sleep.length > 0` — the array is already filtered to records with both
  a start and a duration.
- caffeine: `hist.some((h) => h.caffeine.length || h.cutoff !== null)` — a
  profile taking no caffeine has no cutoff line and no dots, and an axis with
  nothing on it is not a chart.

One bar is a chart. Nothing is fabricated by drawing it, and a threshold of two
would hide a real night for no reason.

### The one line that names the number

Below the charts, while the window holds fewer nights than a pattern needs:

```jsx
{st.n < MIN_TREND && (
  <div style={/* the existing muted Info row */}>
    <Info size={13} … />
    {plural(MIN_TREND - st.n, "more night", "more nights")} and these charts start reading as trends.
  </div>
)}
```

`MIN_TREND = 5`, exported from `stats.js`. It is not a new concept: `st.n >= 5`
and `st.n < 5` are already written twice inside `readPatterns` as bare literals
(`stats.js:260`, `:264`), and this replaces both. One named threshold in place of
two magic numbers and a third invented one.

`readPatterns` already supplies the rest of the sparse-data copy — "1 night on
record, and patterns need about a week to show up." renders as the Lead under
the hero with no change at all.

### The trap in `readPatterns`

It returns twelve lines. The Dashboard renders three: `mainPattern`, `noticed`
and `adjustment`. `sleepAvgLine`, `sleepTiming`, `wakeDrift`, `caffeine`,
`movement`, `rest`, `fatigue`, `foodHydration` and `light` are computed and
dropped on the floor, and several of them already contain exactly the empty-state
sentence somebody will be tempted to write ("No sleep has been logged in this
period yet…"). **Empty-state copy added there will not appear on any screen.**
Deleting the nine dead lines is not this phase's job; knowing they are dead is,
because otherwise this phase writes its copy into a function nobody renders.

### Achievements

`achievements(profile, logs, nights)` is the one place where the real archive
breaks something rather than just thinning it. Four of the seven need a look:

| Badge | Today | Phase 3 |
|---|---|---|
| First night | `nights.length > 0` | unchanged |
| A full week | `nights.length >= 7` | unchanged — seven records is what the copy claims |
| Stopped early | `cleanNights >= 3` | `nights.filter(h => h.caffeine.length && !isLateNight(h)).length >= 3` |
| Reset habit | 5 movement items in **tonight's logs** | `nights.reduce((a, h) => a + (h.moveDone \|\| 0), 0) >= 5` |
| Home safe | `count("endShift") > 0`, tonight's logs | `nights.some(h => h.endShift)` |
| Hard night, Took the rest | records + logs | unchanged |

**Stopped early** is a false badge the mock hid. `isLateNight` is false for a
night with no caffeine at all, so three nights of drinking nothing earns "Three
nights where every cup landed before your cutoff" — for zero cups. The mock had
drinks on all 45 nights, so it never showed. Requiring a drink is one term.

**Reset habit and Home safe silently un-earn themselves at every rollover,**
because both count tonight's logs and Phase 2 clears the logs at the boundary.
The comment above the function says "Earn-only. Nothing here can be lost", and
after the swap that becomes visibly untrue for two of the seven. Reset habit is
free: `moveDone` is already on every record, tonight's included, so summing the
records both fixes it and deletes the logs-based computation. Home safe needs one
new field.

**`endShift: of("endShift").length > 0` is the phase's only change to the
NightRecord shape.** One boolean, one line in `foldNight` and one in
`materializeNights`. It is not a new pattern: "Took the rest" already earns off
a record field rather than a log (`nights.some(h => h.restMin > 0)`), and since
`foldNight` puts tonight at the front of `nights`, reading the field covers
tonight as well — no logs term is needed alongside it. Demoting the badge would
be fewer lines and a worse app; what three lines buy is not a badge that lights
up at 06:00 and is gone by 15:00.

---

## Export

```js
JSON.stringify({ app: "GraveYard", profile, logs, reflection, archive }, null, 2)
```

`history` comes out. Phase 2 added it as "the only way to see the archive
without opening devtools" and said it costs nothing to remove once `history`
becomes the archive. It is now the archive plus a derived field, and under
`?seed` it is 45 nights of fiction, so exporting it is duplication in the good
case and a lie in the other.

---

## Edge cases, and their answers

| Case | Answer |
|---|---|
| Nothing logged, ever | The strip's chips are all dim, "Now" included; any window shows "No nights on record yet." |
| Tonight only, nothing archived | Hero and trio are real, `mainPattern` says "1 night on record", charts show one bar or are absent, the Info line says four more nights |
| A gap in the middle of a window | The window is a span of days; the missing nights are simply not in `hist`, `st.n` counts what is there, and the strip dims those chips |
| A record older than the window | Excluded by the filter. "All time" is `Infinity`, so nothing is ever unreachable |
| A record dated in the future | Excluded by `dayOffset >= 0`. Reachable via a backward device clock or a hand-edited blob |
| Two records with the same id | Cannot be produced by this app after Part 1. A hand-edited archive still can; `find` takes the newest-folded and `rangeStats` counts both — named as a ceiling, not guarded |
| A night with only a reflection | Already archives (Phase 2), already folds with an estimated sleep figure, shows as a normal record with `sleepEstimated` |
| A profile edit that moves the night backward | The ref holds; the night runs long and merges. Offsets are one day out for at most one tick |
| A shift-time edit that moves it forward | The ref advances without folding, every archived offset shifts by a day, and the memo picks it up on the next `setNow` |
| DST fall-back | One roll instead of three |
| `?seed` with a real archive underneath | The archive is untouched and unwritten; removing the flag restores it |
| `?seed` before the quiz | No profile, no memo, no seed. Finish the quiz, keep the flag on the URL |

---

## Assumptions

Recorded because the human partner was unavailable and the roadmap did not
state them. Each is the smallest choice consistent with what the repo already
does.

1. **The seed flag is `?seed`, ungated by build mode.** The roadmap says "behind
   a flag" and nothing more; the reasoning is in Part 3.
2. **The seeded state is labelled on screen.** Not requested. Taken because the
   Dashboard's own stated rule is that no figure is fabricated, and it reuses an
   existing muted line rather than adding UI.
3. **A range is a window of days anchored on tonight, not on the newest
   record.** "1 week" means the last seven nights, so an intermittent worker's
   week is honestly thin rather than dishonestly dense.
4. **`MIN_TREND` is 5**, taken from the threshold `readPatterns` already uses to
   decide whether it may claim a relationship. Not 7 — that is the "full week"
   badge, a different claim.
5. **Charts render from one datum.** A single bar is honest; hiding it would be
   the fabrication, in the other direction.
6. **`endShift` joins the NightRecord.** The only shape change, and only because
   an earn-only badge that un-earns itself contradicts the code's own stated
   rule.
7. **`dayOffset` is anchored on `nightRef.current`, not on a fresh `nightOf`.**
   After a backward edit the two disagree, and offsets should count back from
   the night tonight's logs will be filed under.
8. **`rangeKey` still resets to `d0` on reload.** Phase 4 owns which transient UI
   survives a refresh; this phase does not pre-empt it.

---

## How this gets tested

**Unit, `vitest`, `environment: "node"`, no render harness — same as every phase
before it.**

`src/time.test.js`

| Case | Expect |
|---|---|
| `forward("2026-08-12", "2026-08-13")` | the later id |
| `forward("2026-08-13", "2026-08-12")` | the held id, unchanged — a backward step is refused |
| `forward("2026-08-13", "2026-08-13")` | unchanged |
| `forward(undefined, "2026-08-13")` | the new id — the seed case, which a bare `>` gets wrong |
| `daysBetween("2026-08-13", "2026-08-06")` | 7 |
| `daysBetween` across a DST boundary | still a whole number of days, not 6 or 8 |
| `daysBetween(a, a)` | 0 |

`src/stats.test.js`

| Case | Expect |
|---|---|
| `achievements` with three nights and no caffeine logged | "Stopped early" not earned |
| `achievements` with three clean nights that each had a drink | earned |
| `achievements` with `logs: []` and records carrying `moveDone` | "Reset habit" earned from the records — the rollover-survival case |
| `achievements(profile, [], [])` | seven badges, none earned, no throw |
| `foldNight` with an `endShift` log | `endShift: true` |
| `readPatterns` at `MIN_TREND - 1` nights | `mainPattern` is the "N nights on record" line |
| `readPatterns` at `MIN_TREND` nights | it is not — the constant and the branch cannot drift apart |

`src/mockNights.test.js` — untouched. The signature does not change and neither
does the shape the suite asserts on. The one added field is the literal
`endShift: true`, which has nothing to get wrong; the branch that computes it
lives in `foldNight` and is covered above.

**End to end, `drive-real-history.mjs`,** a root-level Playwright driver on the
pattern `drive-rollover.mjs` established: `page.clock.install({ time })` before
`goto`, `addInitScript` seeding `gy.v1`, a `record(name, pass, detail)` tally and
a non-zero exit on failure. Run against `npm run dev -- --port 5174`, the URL the
existing drivers default to.

| | Check |
|---|---|
| R1 | Empty archive, no logs: the "1 week" window reads "No nights on record yet."; the "Now" chip reads "Nothing logged yet." |
| R2 | Archive seeded at offsets 1 and 4: chips 1 and 4 are filled, 2, 3, 5 and 6 are dim, and "1 week" reports 2 nights |
| R3 | A record 20 days back is absent from "1 week" and present in "1 month" — the window is days, not records |
| R4 | A record stored with **no** `dayOffset` and an id three days back selects on the "3d" chip |
| R5 | The roadmap's worked example — 04:00 profile, roll at 14:30, `shiftStart` to 22:00 at 03:00, cross the next boundary — leaves every archive id unique |
| R6 | The Phase 2 DST fixture (`America/New_York`, 2026-11-01, boundary at 01:30) rolls once, not three times |
| R7 | `?seed` fills every range and shows the demo line; reloading without it restores the real archive; `gy.v1` never contains the 45 |
| R8 | "Home safe" is still lit after a boundary crossing that cleared the logs |

R5 and R6 are the Part 1 checks and should pass before Part 2 is written; R1–R4
and R7–R8 fail until the swap lands.

**Not tested:** the three effects themselves, for the same reason Phase 2 gave —
asserting on a React effect over an interval and a wall clock needs a render
harness this repo does not have. The logic they call is pure and covered above;
their wiring is covered by the driver.

---

## Known ceilings

- **Offsets are one day stale for up to 30 seconds after a shift-time edit that
  moves the night forward.** The adopt effect writes the ref after the render
  that saw the new profile, and `now` in the memo's dependency list is what
  re-reads it. Visible as every archived chip sitting one column off until the
  next tick. Fixing it properly means the night id becomes state, which
  re-introduces the ordering hazard Phase 2 spent an effect closing.
- **A merged night after a backward edit.** Part 1's accepted cost, above. Two
  nights of logs fold into one record and read as one long night.
- **The charts' X axis is categorical, so a gap is invisible.** Records four days
  apart sit in adjacent columns; only the "1d"/"5d" labels say otherwise. A
  truthful axis means a numeric or time scale and a rewrite of both Panels,
  which is a chart project rather than an empty-state one.
- **A hand-edited archive is still unvalidated.** Phase 2's ceiling, now with
  teeth: a non-array throws into boot's catch and drops everything, a string
  spreads into one-character "records", and a duplicate id double-counts. Nothing
  the app writes can produce any of them. Closed by the schema validation no
  phase has wanted to start.
- **Last night is still folded against tonight's profile,** so a record's
  `cutoff` and `moveTotal` drift when the shift changes. Phase 2's ceiling,
  unchanged — but it is now visible on screen rather than buried in the export.
- **`materializeNights` and `foldNight` are still two hand-kept shapes.**
  `endShift` has to be added to both. Nothing enforces the match; a test that
  compares key sets would, and is a one-liner somebody should write the next time
  the shape moves.

## Skipped

- An import path for the exported JSON. Nearly free, still a nice-to-have.
- Off-night stubs, a `workDays` array, nights-elapsed averages. Phase 5, once a
  gap can be measured rather than guessed at.
- Archiving plan item lists so a past night's Plan page can be re-read. The
  roadmap recommends against it and Phase 4 owns the question.
- Deleting the nine unrendered `readPatterns` lines. Real dead weight, unrelated
  to this phase.
- Retention limits, compaction, IndexedDB, a `storage` event listener.
- Persisting `rangeKey`, `hideDone`, `showAllPlan`. Phase 4.
