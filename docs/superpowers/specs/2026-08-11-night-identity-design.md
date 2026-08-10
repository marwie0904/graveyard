# Phase 0 — Night Identity

Give time an identity. One function answers "which night is this, and where on
the plan's axis are we", and nothing else in the codebase is allowed to answer
it separately.

Spec for Phase 0 of `docs/implementation-roadmap.md`. Nothing below persists
anything; that is Phase 1.

---

## The problem, stated from the code

`now` is minutes on an axis whose zero is midnight of the day the shift starts.
`ph.start = toMin(profile.shiftStart)` is always in `[0, 1440)`, so that anchor
is the shift-start date by construction. A 22:00 shift is `now = 1320`, and
02:00 the following morning is `now = 1560`.

That axis is fine. What is missing is *which calendar date* zero refers to.
`push()` (`App.jsx:2347`) stores `t: now`, so a caffeine log at `t: 1350` could
be tonight or eleven nights ago.

There is also a second, quieter problem. `realNow` (`App.jsx:295`) already
decides which night the wall clock belongs to, by scanning four candidate day
offsets and picking whichever lands nearest the plan window:

```js
for (let k = -1; k <= 2; k++) {
  const t = day0 + k * DAY + clock;
  const dist = t < ph.start - 180 ? (ph.start - 180) - t : t > ph.sleepEnd ? t - ph.sleepEnd : 0;
  if (!best || dist < best.dist) best = { t, dist };
}
```

Adding a night ID beside it means two functions answering one question. When
they disagree, a log lands on the wrong night, and the disagreement is silent.
So Phase 0 does not add a second answer. It replaces the existing one.

---

## The rule

**A night is named by the calendar date its shift starts on, and it rolls over
at the plan's own wake time.**

Not midnight: midnight falls in the middle of every shift this app exists for.
Not shift start: the pre-shift block (meal, nap, hydrate — real plan items you
can tick off) happens before the shift and belongs to the night it prepares for.

Wake time is `ph.sleepEnd`, which `calculateShiftPhases` already computes. For a
22:00–07:00 shift sleeping 08:30 for 7.5h, wake is 16:00, so the night named
`2026-08-10` runs from 16:00 on the 10th to 16:00 on the 11th and contains the
whole arc: pre-shift, shift, post-shift, sleep.

### The awkward cases, answered

**A shift crossing midnight is one night.** 22:00 Monday to 07:00 Tuesday is
`2026-08-10` throughout, because both instants sit between Monday 16:00 and
Tuesday 16:00.

**Opening the app at 15:00 on a day off is not "neither".** The profile records
`shiftStart`, `shiftEnd`, `plannedSleep` and `sleepGoalHours`. It has no calendar
of which days are worked. The app cannot know a day is off, so inventing an
"off" state would mean inventing data. Every wall-clock instant belongs to some
night; a night nobody worked simply accumulates no logs. `foldNight` already
returns `null` for an empty log list, so an unworked night costs nothing.
Whether it archives as an off-night is Phase 2's decision, and this design keeps
it open.

**Sleep that runs past the next shift start** is incoherent but expressible:
plan sleep for 14:00 with a 9h goal and wake lands at 23:00, an hour after a
22:00 shift has begun. Left alone, the first hour of that shift files under the
night before. The boundary is capped at the next shift start, so this profile
rolls over exactly at shift start instead.

**Missed nights** are out of scope here, but Phase 0 makes them computable: the
ID is an ordered date string, so the gap between two nights is subtraction. The
policy — does a four-day gap reset `nightInStretch` — stays Phase 2's.

---

## The function

Lives in `src/time.js`. It takes `ph`, not `profile`, which keeps it pure time
arithmetic and avoids importing `planner.js` into the module `planner.js`
imports. Same shape as the `realNow(ph)` it replaces, so both call sites are a
one-word change.

```js
/** Which night the wall clock belongs to, and where that puts us on the plan's
    axis. The night is named by the date its shift starts on and rolls over at
    the plan's own wake time, so a shift that crosses midnight is one night.
    Wake is capped at the next shift start: a profile whose planned sleep runs
    past it must not file the first hour of a shift under the night before.
    ponytail: local dates throughout. toISOString would report the UTC date,
    which is the wrong night for half the world for part of every day. */
export function nightOf(ph, d = new Date()) {
  const clock = d.getHours() * 60 + d.getMinutes();
  const wake = Math.min(ph.sleepEnd, ph.start + DAY);
  const back = clock + DAY < wake;   // still inside last night's arc
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate() - (back ? 1 : 0));
  const p = (n) => String(n).padStart(2, "0");
  return {
    id: `${day.getFullYear()}-${p(day.getMonth() + 1)}-${p(day.getDate())}`,
    now: clock + (back ? DAY : 0),
  };
}
```

Ten lines, replacing ten lines. The whole rule is `clock + DAY < wake`: if
yesterday's night still has room for this clock time, we are still in it.

It needs no modular arithmetic. The boundary in clock terms works out to
`max(0, sleepEnd − DAY)`, which equals wake time when that is coherent and
collapses to midnight when it is not. A 00:00–08:00 shift gets a midnight
boundary for free, which is the right answer for that shift.

`new Date(y, m, d - 1)` normalises month and year rollover, and constructing
from local Y/M/D at midnight keeps it clear of DST minute arithmetic.

---

## What changes in App.jsx

Three edits, all mechanical:

1. Delete `realNow` (`App.jsx:293–306`).
2. `App.jsx:2317` — `setNow(realNow(calculateShiftPhases(profile)))` becomes
   `setNow(nightOf(calculateShiftPhases(profile)).now)`.
3. `App.jsx:2360` — same substitution in `finishQuiz`.

Nothing else. The 30s tick, the `useMemo` chain, `push()`, and the log shape are
untouched.

### The `id` is deliberately unused for one phase

Phase 0 returns `id` and nothing reads it until Phase 1 stores it. That is
intentional: returning both from one call is the mechanism that stops them
diverging, and splitting them into two functions to avoid a one-phase-long
unused field would reintroduce exactly the problem this design exists to
prevent. The tests read it.

### What visibly changes

Inside the plan window — pre-shift through wake — `nightOf().now` returns what
`realNow` returned. Verified against the default 22:00–07:00 profile at 19:00,
22:30, 02:00 and 15:00.

Outside the window the two differ, and the new one is right. At 20:00 with a
00:00–08:00 shift, `realNow` picks *yesterday* 20:00 (`now = −240`) because that
candidate sits closer to the pre-shift window; `nightOf` returns `now = 1200`,
four hours before tonight's shift. This is the `realNow` clamp the roadmap files
under Phase 4, arriving early as a side effect of having one definition instead
of two.

### Unchanged, checked

- `clockToAbs` (`App.jsx:2451`) resolves a manually entered clock time with
  `nextAfter(now − 720, …)`, relative to `now`. Still correct on the new axis.
- `foldNight` (`stats.js:66`) reduces `t` to a clock value with `% DAY`.
  Unaffected.
- Log shape. `t` stays axis-minutes, per the roadmap: a log's night is "the
  current one" while live and "whichever archive record it was folded into"
  afterwards.
- `materializeNights` and the mock history.

---

## Tests

Added to `src/time.test.js`. `ph` is a literal `{ start, sleepEnd }` — those two
fields are the entire contract, so the tests need no planner import.

| Fixture | Wall clock | Expect |
|---|---|---|
| night `{1320, 2400}` | Mon 22:30 | `2026-08-10`, `now 1350` |
| night `{1320, 2400}` | Tue 02:00 | `2026-08-10`, `now 1560` — crosses midnight, same night |
| night `{1320, 2400}` | Tue 15:00 | `2026-08-10`, `now 2340` — still asleep |
| night `{1320, 2400}` | Tue 16:00 | `2026-08-11`, `now 960` — rollover exactly at wake |
| night `{1320, 2400}` | Jan 1, 00:30 | `2025-12-31` — year rollover, and month rollover with it |
| midnight `{0, 990}` | 02:00 | today, `now 120` — boundary collapses to midnight |
| pathological `{1320, 2820}` | 22:00 | today, `now 1320` — capped at shift start |

These double as the UTC guard. `day` is always a local-midnight `Date`, so east
of UTC its `toISOString().slice(0, 10)` is the day before — every row above fails
against a `toISOString` implementation. West of UTC it would not, which is why
the format is spelled out rather than tested for.

Run: `npx vitest run`.

---

## Known ceilings

- **DST.** A jump moves one night's boundary by an hour. Local `Date` construction
  keeps the date arithmetic correct; only the boundary instant shifts. Not worth
  code in a codebase whose author is in a zone without DST.
- **Manual clock entry can leave the night.** `clockToAbs` picks the occurrence
  within ±12h of `now`, so entering 20:00 at 07:00 the next morning resolves to
  the *coming* 20:00, which is the next night. Pre-existing, unchanged, and only
  becomes visible once Phase 2 files logs by night.

## Skipped

- Persisting the night ID. Phase 1.
- Rollover on ID change. Phase 2.
- A timestamp on every log. The roadmap rules it out and the ID makes it
  unnecessary.
- Any notion of a work calendar or off-days. Would require asking the user for
  data the quiz does not collect.
