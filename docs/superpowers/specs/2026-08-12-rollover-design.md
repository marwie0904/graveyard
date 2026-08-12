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

A finished night's logs are discarded. `foldNight` (`stats.js:66`) already turns
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
    No night stamp means nothing to name the record; no logs means nothing to
    record. Both leave the archive alone, and the gap in the id sequence is the
    only trace an unworked night gets. */
export const archived = (s) => {
  const rec = s.night ? foldNight(s.profile, s.logs ?? [], s.reflection ?? {}) : null;
  if (!rec) return s.archive ?? [];
  const { dayOffset, ...night } = rec;
  return [{ ...night, id: s.night }, ...(s.archive ?? [])];
};

const forNight = (s, id) =>
  s.night === id ? s : { profile: s.profile, theme: s.theme, archive: archived(s) };
```

`foldNight` is untouched. It returns `id: "tonight"` and `dayOffset: 0`, both of
which are correct for the caller it was written for and wrong for a stored
record; correcting them at the archive site is smaller than growing its
signature, and leaves its 45-row mock counterpart (`mockNights.js`) alone.

`archived` is exported only because the tick needs it too. Inlining it back into
`forNight` and having the tick reconstruct a blob to call `forNight` with is the
same code arranged worse.

### Empty nights leave no record

A night with no logs archives nothing. `foldNight` already returns `null` for
that, so this costs zero lines.

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

That recovery works because the write clears `logs` in the same blob it adds the
archive to. Re-running `archived` against an already-rolled blob hits the
`!rec` branch — no logs, nothing to fold — and returns the archive unchanged.
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

`src/storage.test.js`, six assertions on `forNight` and `archived`:

| Case | Expect |
|---|---|
| stamp is tonight | `s` whole, archive included and untouched |
| stamp is another night | `{profile, theme, archive}` — no `logs`, no `reflection` |
| the folded record | `id === s.night`, and no `dayOffset` key at all |
| onto a non-empty archive | prepended: index 0 is the night just folded |
| no logs | archive returned unchanged — no empty record |
| no `night` field | archive returned unchanged — nothing to name it |

The last two are the empty-night rule and the truncated-blob case, and both are
"returns the input unchanged", which is exactly the kind of behaviour that holds
by accident until someone reorders a branch.

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
- Export now contains an `archive` array with one entry per logged night.
- Nothing on the Dashboard changes. The 7-night strip, the ranges and every
  average still read the 45-night mock — that swap is Phase 3, and it is where
  the empty states get built.

---

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
- **Multi-tab.** Last write still wins, and two tabs crossing the boundary can
  each fold the same night — the same Phase 1 ceiling, presenting as a duplicate
  record rather than as lost logs. A `storage` event listener is the fix when
  anyone is running two tabs, which nobody is.
- **A hand-edited `archive` that is not an array** throws where `logs` already
  does, after mount, with no in-app recovery. Same shape as Phase 1's open case
  and closed by the same schema validation neither phase wants to start.

## Skipped

- Off-night stubs and a nights-elapsed counter. Phase 5, once a gap in the
  archive can be measured rather than guessed at.
- Archiving plan item lists, so a past night's Plan page can be re-read. The
  roadmap already recommends against it: history is a summary.
- Retention limits, compaction, IndexedDB.
- Reading the archive into `history`, and the empty states that needs. Phase 3.
