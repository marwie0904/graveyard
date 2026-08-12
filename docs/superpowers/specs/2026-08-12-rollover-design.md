# Phase 2 — Rollover

The night ends and becomes history. `forNight` stops dropping last night's logs
and folds them into an archive instead, the 30-second tick learns to notice the
boundary it currently sleeps through, and the write stamp stops being re-derived
from the clock.

Spec for Phase 2 of `docs/implementation-roadmap.md`. Builds on Phase 0
(`2026-08-11-night-identity-design.md`), which names the night, and Phase 1
(`2026-08-12-persistence-design.md`), which stores it. Nothing here reads the
archive into the Dashboard; that is Phase 3.

---

## The problem, stated from the code

Two halves, and the second is the dangerous one.

**The drop.** `storage.js:17` already says what it is waiting for:

```js
/* ponytail: Phase 2 replaces the drop with a fold into the archive, here. */
const forNight = (s, id) => (s.night === id ? s : { profile: s.profile, theme: s.theme });
```

A finished night's logs are discarded. `foldNight` (`stats.js:69`) already turns
exactly that data into a NightRecord and is already tested; nothing calls it with
last night's logs because last night's logs no longer exist by the time anything
could.

**The tick.** Phase 1 named this as its worst ceiling, and it is worse than one
misfiled entry. `App.jsx:2343` re-derives the stamp from the wall clock on every
write:

```js
save({
  night: nightOf(calculateShiftPhases(profile)).id,
  profile, logs, reflection, theme: themeOverride,
});
```

The tick rolls `now` onto the new night's axis on its own clock, but the write
effect does not depend on `now`. It fires on the next change to `logs` after the
boundary — and writes *the entire accumulated log set*, last night's and
tonight's together, under the new night ID. On the next reload `forNight` sees
that ID match and keeps all of it. Every night after is "tonight" until the app
is closed and reopened.

So the rollover check is not a refinement of the boot rule. It is the thing that
stops the boot rule being routed around.

---

## The rule

**The fold happens in one function, and both callers reach it.**

```js
import { foldNight } from "./stats.js";

/** Last night folded onto the front of the archive, newest first — the order
    every range slice in the app already assumes.
    dayOffset is dropped rather than stored: it is relative to tonight, so a
    stored one is wrong by morning, and `nights.find(x => x.dayOffset === off)`
    (Dashboard.jsx:179) would match every archived night against the strip's
    "Today" chip. Phase 3 computes it from the id.
    No night stamp means nothing to name the record; a night with neither logs
    nor a reflection has nothing to record. Both leave the archive alone, and
    the gap in the id sequence is the only trace an unworked night gets. */
export const archived = (s) => {
  const rec = s.night ? foldNight(s.profile, s.logs ?? [], s.reflection ?? {}) : null;
  if (!rec) return s.archive ?? [];
  const { dayOffset, ...night } = rec;
  return [{ ...night, id: s.night }, ...(s.archive ?? [])];
};

const forNight = (s, id) =>
  s.night === id ? s : { profile: s.profile, theme: s.theme, archive: archived(s) };
```

`foldNight` keeps its signature and its output. It returns `id: "tonight"` and
`dayOffset: 0`, both of which are correct for the caller it was written for and
wrong for a stored record; correcting them at the archive site is smaller than
growing its signature, and leaves its 45-row mock counterpart (`mockNights.js`)
alone. Its one edit is the empty guard, below.

`archived` is exported only because the tick needs it too. Inlining it back into
`forNight` and having the tick reconstruct a blob to call `forNight` with is the
same code arranged worse.

### Empty nights leave no record

A night that was neither logged nor reflected on archives nothing. That is one
line in `foldNight` (`stats.js:70`), and it is the phase's only edit to that
function:

```js
if (!logs.length && !Object.keys(reflection).length) return null;
```

It read `if (!logs.length)`, which was right when the only caller was the
Dashboard's live fold and wrong the moment a record went to disk. The reflection
Selects write straight to state with no log entry (`App.jsx:1458`), so a night
worked without tapping anything and then answered in full folded to `null`,
`archived` dropped it, and the tick's `setReflection({})` wiped the answers. A
night with seven answers is a night. Fixing the guard where both callers already
route through it is smaller than a second guard in `archived`, and the
Dashboard's `history` fold (`App.jsx:2404`) gets the same correction for free —
a reflection-only night now shows as tonight's card instead of "Nothing logged
yet", which is the truthful reading of it.

The alternative — walking every date between the last stamp and now and writing
`{id, empty: true}` stubs — buys an explicit "off night" marker and costs date
arithmetic now plus a stretch rule committed to before there is an archive to
test it against. Every record carries its night ID, so a gap in the sequence is
visible to anything that looks. Phase 5 decides what a gap means when it has
data. This is the same answer Phase 0 gave about days off, for the same reason.

---

## The night ID moves into a ref

Phase 1 declined to hold the night ID in React state on the grounds that nothing
renders it. That still holds. It becomes a ref, because now something *reads* it.

```js
const nightRef = useRef(boot.night);
const [archive, setArchive] = useState(boot.archive ?? []);
```

`archive` is state rather than a ref: the write effect must fire when it changes.
It would in fact be flushed anyway, because the roll sets `logs` in the same
batch and `logs` is already a dependency — which is exactly the kind of
load-bearing coincidence that costs an hour to re-derive later. State is one
line and does not depend on a sibling.

Boot returns the ID it already computes, so the ref has something to seed from
on a rollover boot, where `forNight` no longer returns the blob's own stamp:

```js
return { ...forNight(s, id), night: id, now };
```

---

## A profile edit re-labels the night; it does not end it

This effect goes in first, above the write, and it is the reason the rest is
safe:

```js
/* nightOf reads the wake boundary out of the profile, so editing your shift or
   sleep times can change which night the current clock belongs to. That is a
   re-labelling, not a rollover: adopt the new id without folding. Without this,
   changing your shift time at 3am looks exactly like a boundary crossing to the
   tick below — it would archive the night you are standing in and clear the
   plan under you. */
useEffect(() => {
  if (profile) nightRef.current = nightOf(calculateShiftPhases(profile)).id;
}, [profile && profile.shiftStart, profile && profile.shiftEnd,
    profile && profile.plannedSleep, profile && profile.sleepGoalHours]);
```

The times are editable live from the sheet at `App.jsx:2685`, all four of them,
and its own copy promises only that "changing this rebuilds tonight's plan around
the new times."

Declaration order carries weight here, which is worth stating because it is
invisible: **adopt, then write, then tick.** React runs effects in the order they
appear, so within the commit that follows a time edit the ref is corrected before
anything reads it.

This also means `finishQuiz` needs no change. The profile goes from `null` to a
real one, this effect fires on that, and the ref is set before the tick effect
below ever runs — so the first tick after onboarding sees a match instead of
rolling a night that never happened. One effect owns the invariant rather than
two call sites remembering it.

---

## The tick

```js
useEffect(() => {
  if (!profile) return;
  const tick = () => {
    const { id: night, now } = nightOf(calculateShiftPhases(profile));
    setNow(now);
    if (night === nightRef.current) return;
    const next = archived({ night: nightRef.current, profile, logs, reflection, archive });
    nightRef.current = night;
    setArchive(next);
    setLogs([]);
    setReflection({});
    if (next.length > archive.length) say("Last night is saved. Tonight's plan starts fresh.");
  };
  tick();
  const id = setInterval(tick, 30000);
  return () => clearInterval(id);
}, [profile, logs, reflection, archive]);
```

The night ID is destructured as `night` because `id` is already the interval
handle two lines down.

**The dependency list collapses rather than growing.** It reads
`[profile && profile.shiftStart, ...]` today, naming three fields to avoid
rebuilding the interval when an unrelated part of the profile changes. Adding
`logs`, `reflection` and `archive` — which the roll reads — rebuilds it on every
log tap anyway, so the field list is now an optimisation that optimises nothing.
`profile` whole is one term instead of four, and it cannot miss a field `nightOf`
starts reading; the existing list already missed `sleepGoalHours`.

The cost is that the interval restarts its 30-second countdown on each log tap,
and the immediate `tick()` on each re-run is a `setNow` to the same value, which
React bails out of. When the app sits idle across the boundary — the case this
exists for — no render happens, the effect does not re-run, and the closure holds
the logs that were current when the night ended.

The adopt effect above keeps its field list, and that asymmetry is deliberate:
see the ceiling below.

**The toast fires only when a record was folded.** A night with nothing logged
rolls silently: "Last night is saved" would be a lie, and nothing visibly
unticks, because there was nothing ticked. `say` already exists
(`App.jsx:2391`) and the roll is one call to it — no new component, no sheet to
dismiss for an event that fires roughly once.

---

## The write stamp stops watching the clock

```js
useEffect(() => {
  if (!profile) return;
  save({ night: nightRef.current, profile, logs, reflection, theme: themeOverride, archive });
}, [profile, logs, reflection, themeOverride, archive]);
```

This is the line that actually closes Phase 1's ceiling. A log tapped after the
boundary but before the tick previously went to disk under the *new* night ID
alongside all of last night's. Reading the ref means that write carries the old
ID — correct by construction, rather than corrected thirty seconds later.

It also drops a `calculateShiftPhases` call from the write path, which currently
runs on every log tap for a value nothing renders.

The invariant this depends on: **`nightRef.current` equals
`nightOf(profile).id` at all times except between a boundary crossing and the
tick that answers it.** The adopt effect holds one half, the tick holds the
other, and nothing else writes to the ref.

---

## The fold survives a crash between boot and the first write

Boot folds at import, before React mounts; the fold reaches disk only when the
write effect runs after mount. Nothing is lost in between. The raw logs are still
on disk under the old stamp, so the next boot folds them again from scratch.

That recovery works because the write clears `logs` and `reflection` in the same
blob it adds the archive to. Re-running `archived` against an already-rolled
blob hits the `!rec` branch — neither logs nor answers, nothing to fold — and
returns the archive unchanged.
Idempotent by re-derivation, not by a guard.

---

## Export

One word:

```js
JSON.stringify({ app: "GraveYard", profile, logs, history, reflection, archive }, null, 2)
```

The archive is otherwise invisible in the running app until Phase 3 swaps it into
`history`. This is the whole concession to that — enough to confirm a real night
landed without opening devtools, and it costs nothing to remove when `history`
becomes the archive.

**Start over is unaffected.** It calls `save({})`, and the archive lives in the
same blob, so "this cannot be undone" (`App.jsx:1992`) stays true without a line
of its own. Its copy says "Your profile, tonight's logs and your reflection" and
now erases a history too — the string needs the word.

---

## Tests

`src/storage.test.js`, seven assertions on `forNight` and `archived`:

| Case | Expect |
|---|---|
| stamp is tonight | `s` whole, archive included and untouched |
| stamp is another night | `{profile, theme, archive}` — no `logs`, no `reflection` |
| the folded record | `id === s.night`, and no `dayOffset` key at all |
| onto a non-empty archive | prepended: index 0 is the night just folded |
| no logs and no reflection | archive returned unchanged — no empty record |
| no logs, reflection answered | folded and prepended, sleep off the bucket |
| no `night` field | archive returned unchanged — nothing to name it |

The empty-night rule and the truncated-blob case are both "returns the input
unchanged", which is exactly the kind of behaviour that holds by accident until
someone reorders a branch. The reflection-only case sits next to the empty one
because the two differ by one field and the guard has to read both.

`src/stats.test.js` covers the same guard one level down: a fold of `[]` logs
against `{slept, sleepiest}` returns a record whose `sleepHours` came off
`BUCKET` with `sleepEstimated: true` and whose `sleepyWindow` came off the
reflection. That is the whole content of such a record, and it is the reason the
night is worth keeping.

**The fixture profile has to widen.** Today's (`storage.test.js:7`) is
`{shiftStart, shiftEnd, sleepGoalHours}`, which was enough when `forNight` never
looked inside it. `archived` calls `foldNight`, which calls
`calculateShiftPhases`, which throws on `toMin(undefined)` for a missing
`plannedSleep`. Use the shape `stats.test.js:5` already uses.

Still pure, still no `localStorage` stub, still `environment: "node"`.

**Not tested here:** the tick. It is a React effect over an interval and a wall
clock; asserting on it means a render harness and fake timers, which this repo
does not have and which would be a larger addition than the phase. The fold it
calls is the part with logic, and that is covered above. The tick itself is
verified by hand in the plan.

---

## What visibly changes

- Leave the app open across your wake time: the plan resets to tonight, the
  ticked items clear, and a toast says the night was saved.
- Close it and reopen it the next night: same, minus the toast.
- Export now contains an `archive` array with one entry per night that was
  logged or reflected on.
- One thing on the Dashboard changes: answer the reflection without logging
  anything and tonight is now a card rather than "Nothing logged yet", showing an
  estimated sleep figure and zeroes. The strip, the ranges and every average
  still read the 45-night mock — that swap is Phase 3, and it is where the empty
  states get built.

---

## What Phase 3 inherits

The shape is clean. An archived record is field-for-field what
`materializeNights` produces minus `dayOffset`, because both come out of the
same `foldNight`, so the swap is `history` reading `archive` and computing
`dayOffset` from the id. No mapping layer, no migration.

The sequencing is not, and both problems are in `Dashboard.jsx` rather than in
anything this phase wrote. They are invisible today because the mock is 45 dense
consecutive nights and a real archive is neither.

- **`nights.slice(0, spec.nights)` (`:181`) takes N records, not N nights.** On
  the mock those are the same thing. On a real archive an intermittent worker's
  "1 week" is the last seven nights they worked, which can span a month — and
  `wakeDrift` and every spread figure then describe a window nobody chose. The
  slice has to become a filter on the id's date.
- **`have = new Set(nights.map(x => x.dayOffset))` (`:174`) goes sparse.** The
  day strip has never had to render a chip with no record behind it, because the
  mock always had one. Real empty-chip states are Phase 3 work, not a detail of
  the swap.

## Known ceilings

- **Last night is folded against tonight's profile.** `archived` calls
  `foldNight(s.profile, ...)`, and `s.profile` is the current one. Change your
  shift times and last night's `cutoff` and `moveTotal` are recomputed from the
  new ones, so a record can drift after it is written. Fixing it means storing a
  profile snapshot per night, which roughly doubles the record to correct a
  number nothing reads yet.
- **No cap on archive growth.** About 250 bytes a night, so a year is ~90KB
  against localStorage's ~5MB, and the whole blob is re-serialised on every log
  tap. Sub-millisecond at that size. Revisit if a record ever grows to hold plan
  items.
- **A time edit within 30 seconds of the boundary absorbs the rollover.** The
  adopt effect moves the ref to the newly computed night, so the tick that would
  have folded now sees a match and the night simply continues — and because the
  write then stamps the merged logs under the new ID, the next boot sees a match
  too and does not catch it either. That is still the right trade against the
  alternative, where a mis-detected roll archives a live night and wipes the
  plan; this one loses a boundary nobody but the clock noticed.

  **It is also why the adopt effect keeps its four-field dependency list while
  the tick collapses to `profile`.** Collapsing both would save a line and widen
  this window from "edited a shift time" to "touched anything on the profile" —
  an adjusted planning parameter writes a new `profile` object, and that would
  be enough to swallow a rollover. The tick has no such hazard: it never adopts,
  so re-running it costs an interval rebuild and nothing else.
- **The night id can move backward, so one tab can fold the same night twice.**
  The adopt effect recomputes the id from the edited profile and has no notion of
  direction, and the tick only asks whether the id differs. Worked example, ids
  read off `nightOf`: at 03:00 on 2026-08-13 a profile of
  `{shiftStart: "04:00", shiftEnd: "06:00", plannedSleep: "07:30",
  sleepGoalHours: 7}` names the night `2026-08-13`; edit `shiftStart` to
  `"22:00"` and the same clock names it `2026-08-12`. So: run the 04:00 profile,
  let it roll at its 14:30 wake on Aug 12 — the archive gains `2026-08-12` —
  keep working into Aug 13, then at 03:00 change the shift start. Adopt walks the
  ref back to `2026-08-12`, and the next boundary folds a second record under
  that id. Nothing dedupes; `archived` prepends whatever it is handed.

  The cost lands in Phase 3, not here. `nights.find(x => x.dayOffset === off)`
  (`Dashboard.jsx:179`) takes the first copy in array order — the one folded
  most recently — so the day strip shows one of two nights with no sign there is
  another, and `rangeStats` counts the night twice in every average it feeds.
- **A fall-back DST night folds three times.** Same root as the bullet above: the
  tick compares ids without direction, and on the night the local clock repeats
  an hour a boundary *inside* that hour is crossed forward, back, and forward
  again. Reproduced against `nightOf` under `TZ=America/New_York` on 2026-11-01
  with `{shiftStart: "01:30", shiftEnd: "07:30", plannedSleep: "00:00",
  sleepGoalHours: 8}` — a boundary at 01:30, since `nightOf` caps wake at
  `start + DAY` — ticking every fifteen minutes: the id goes `2026-10-31` →
  `2026-11-01` at 01:30 EDT, back to `2026-10-31` at 01:00 EST, and forward again
  at 01:30 EST. Three rolls where there should be one, so `setLogs([])` and
  `setReflection({})` fire twice more and anything logged in the repeated hour is
  wiped; a duplicate `2026-10-31` id is the same hazard as above.

  The profile that reaches it is narrow. The boundary is
  `min(sleepEnd, shiftStart + 24h)`, and for that to land strictly inside
  01:00–02:00 the shift has to start there or be a daytime one sleeping into it —
  a 22:00–06:00 night shift cannot get there at all. Spring forward is harmless:
  the clock stays monotonic, so the skipped hour is one crossing like any other.
  `time.js` mentions DST nowhere, and the fix is a directional check — roll only
  when the new id sorts after the old — which is a real rule about time this
  phase does not have the tests to hold up.
- **Multi-tab.** Last write still wins, and two tabs crossing the boundary can
  each fold the same night — the same Phase 1 ceiling, presenting as a duplicate
  record rather than as lost logs. A `storage` event listener is the fix when
  anyone is running two tabs, which nobody is. It is no longer the only way to
  get a duplicate id, which is why the two bullets above exist.
- **A hand-edited `archive` that is not an array** fails one of two ways, and
  neither is the one Phase 1's `logs` case fails. It throws inside `archived`,
  reached from `forNight` inside the `boot` expression at *module scope* — inside
  boot's own try, which catches it, warns, and drops the whole blob for the quiz.
  That is a silent total wipe rather than a white screen, and only on the
  rollover path: when the stamp still matches tonight, `forNight` returns the
  blob whole and the bad value flows into state untouched. A **string** archive
  does not throw at all — `[...("abc")]` is `['a','b','c']`, so three
  one-character strings sit in the array where records should be, and Phase 3
  will read them as nights. Closed by the same schema validation neither phase
  wants to start.
- **Both `boot` fallbacks now discard history, not just logs.** `App.jsx:2304`
  (`!Number.isFinite(now)`) and `:2306` (the catch) both `return {}`, so `archive`
  seeds to `[]`, the user lands on the quiz, and the first `setProfile` fires the
  write effect, which overwrites the stored blob with `archive: []`. One-way, and
  the finite path does not even log — only the catch warns. Not reachable today:
  every quiz and edit path sets all four fields `calculateShiftPhases` reads, so
  neither branch fires against a blob this app wrote. It is a schema-migration
  landmine rather than a bug. The next field `calculateShiftPhases` starts
  reading makes every stored profile a throw on the first boot after upgrade, and
  the throw now costs a year of history instead of a night of logs. Whatever
  Phase 3 or later adds to the profile has to bring a `boot` that carries the
  archive across a failed parse instead of returning `{}` — which means hoisting
  the loaded blob out of the `try`, since the catch cannot see it today.

## Skipped

- Off-night stubs and a nights-elapsed counter. Phase 5, once a gap in the
  archive can be measured rather than guessed at.
- Archiving plan item lists, so a past night's Plan page can be re-read. The
  roadmap already recommends against it: history is a summary.
- Retention limits, compaction, IndexedDB.
- Reading the archive into `history`, and the empty states that needs. Phase 3.
