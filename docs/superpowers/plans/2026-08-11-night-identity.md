# Night Identity (Phase 0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every instant a night identity — the calendar date its shift starts on — and make that the codebase's single answer to "where are we on the plan's axis".

**Architecture:** One pure function, `nightOf(ph, d)`, added to `src/time.js`. It returns `{ id, now }`: `id` is the night's date string, `now` is the existing absolute-minute axis value. It *replaces* `realNow` in `App.jsx` rather than sitting beside it, because two functions answering "which night is it" is exactly how a log lands on the wrong night. Nothing is persisted — that is Phase 1.

**Tech Stack:** Plain ES modules, React 18, Vitest 2. No new dependencies.

## Global Constraints

- **No new dependencies.** Everything here is `Date` and arithmetic.
- **No new files.** `nightOf` goes in the existing `src/time.js`; its tests go in the existing `src/time.test.js`.
- **Local dates only.** Never `toISOString()` for a night ID — it reports the UTC date, which is the wrong night for half the world for part of every day.
- **The log shape does not change.** `t` stays axis-minutes. Do not add a timestamp to `push()`.
- **`nightOf` takes `ph`, not `profile`.** `ph` is the return of `calculateShiftPhases(profile)`. This keeps `time.js` free of a `planner.js` import (`planner.js` imports `time.js`; the reverse would be circular).
- Spec: `docs/superpowers/specs/2026-08-11-night-identity-design.md`.
- Test command: `npm test` (`vitest run`). Single file: `npx vitest run src/time.test.js`.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/time.js` | Modify (append ~12 lines) | Owns all time arithmetic. Gains `nightOf`, the one answer to "which night, and where on the axis". |
| `src/time.test.js` | Modify (append one `describe`) | Already covers this module. Gains the boundary table. |
| `src/App.jsx` | Modify (delete 14 lines, edit 3) | Loses `realNow`; its two call sites switch to `nightOf(...).now`. |

Two tasks. Task 1 is the function and can be reviewed and rejected on its own. Task 2 is the swap into the app, which only makes sense once Task 1 is green.

---

### Task 1: `nightOf` in `time.js`

**Files:**
- Modify: `src/time.js` (append at end of file, after `nightTick`)
- Test: `src/time.test.js` (append at end of file)

**Interfaces:**
- Consumes: `DAY` (already exported from `src/time.js`, value `1440`).
- Produces: `nightOf(ph, d = new Date()) -> { id: string, now: number }`.
  - `ph` — an object with numeric `start` and `sleepEnd` in absolute minutes, where 0 is midnight of the shift-start date. This is the shape `calculateShiftPhases(profile)` returns (`src/planner.js:40`); only those two fields are read.
  - `id` — `"YYYY-MM-DD"`, the calendar date the night's shift starts on.
  - `now` — absolute minutes on `ph`'s axis. Task 2 consumes this.

**Background the implementer needs:**

The app's clock is not a timestamp. `ph.start = toMin(profile.shiftStart)` is always in `[0, 1440)`, so the axis origin is midnight of the day the shift starts. A 22:00 shift is `now = 1320`; 02:00 the next morning is `now = 1560`, not `120`. `ph.sleepEnd` is when the plan says you wake, and for a night shift it is past 1440 — for a 22:00–07:00 shift sleeping 08:30 for 7.5h, `sleepEnd = 2400`, i.e. 16:00 the following day.

The rule being implemented: **a night is named by the date its shift starts on, and rolls over at the plan's own wake time.** So the night `2026-08-10` runs 16:00 Mon → 16:00 Tue and contains the whole arc: pre-shift, shift, post-shift, sleep. The entire rule is the expression `clock + DAY < wake` — if yesterday's night still has room for this clock time, we are still in it.

Two details that look like they could be dropped but must not be:

- `Math.min(ph.sleepEnd, ph.start + DAY)` caps the boundary at the next shift start. `plannedSleep` is a free time input (`App.jsx:456`) and `sleepGoalHours` is editable from the profile screen (`App.jsx:2662`), so a user can produce a 23:00 wake against a 22:00 shift. Without the cap, the first hour of that shift files under the night before.
- `new Date(y, m, d - 1)` — the `Date` constructor normalises `d - 1` across month and year boundaries. Constructing from local Y/M/D at midnight also keeps the arithmetic clear of DST.

- [ ] **Step 1: Write the failing tests**

Append to `src/time.test.js`. Note the import line at the top of that file also needs `nightOf` added to it.

Change line 2 of `src/time.test.js` from:

```js
import { DAY, toMin, fmt, nextAfter, overlap, dur, nightAxis, nightTick } from "./time.js";
```

to:

```js
import { DAY, toMin, fmt, nextAfter, overlap, dur, nightAxis, nightTick, nightOf } from "./time.js";
```

Then append:

```js
describe("nightOf", () => {
  /* 22:00-07:00 shift, sleep 08:30 for 7.5h: wake lands 16:00 the next day. */
  const night = { start: 1320, sleepEnd: 2400 };

  it("names the night after the date its shift starts on", () => {
    // Mon 10 Aug 2026, 22:30 - half an hour into the shift
    expect(nightOf(night, new Date(2026, 7, 10, 22, 30)))
      .toEqual({ id: "2026-08-10", now: 1350 });
  });

  it("keeps a shift that crosses midnight on one night", () => {
    // Tue 02:00 is still Monday's night
    expect(nightOf(night, new Date(2026, 7, 11, 2, 0)))
      .toEqual({ id: "2026-08-10", now: 1560 });
  });

  it("keeps the post-shift sleep on the night it belongs to", () => {
    // Tue 15:00, an hour before the planned wake
    expect(nightOf(night, new Date(2026, 7, 11, 15, 0)))
      .toEqual({ id: "2026-08-10", now: 2340 });
  });

  it("rolls over exactly at the planned wake time", () => {
    // Tue 16:00 is sleepEnd: the new night starts here, not a minute later
    expect(nightOf(night, new Date(2026, 7, 11, 16, 0)))
      .toEqual({ id: "2026-08-11", now: 960 });
  });

  it("rolls back across a year boundary", () => {
    expect(nightOf(night, new Date(2026, 0, 1, 0, 30)))
      .toEqual({ id: "2025-12-31", now: 1470 });
  });

  it("collapses the boundary to midnight when the shift starts there", () => {
    // 00:00-08:00 shift waking 16:30: there is no previous night to fall back to
    const midnight = { start: 0, sleepEnd: 990 };
    expect(nightOf(midnight, new Date(2026, 7, 11, 2, 0)))
      .toEqual({ id: "2026-08-11", now: 120 });
  });

  it("caps the boundary at the next shift start", () => {
    // sleep planned so late it ends 23:00, an hour after the 22:00 shift begins
    const late = { start: 1320, sleepEnd: 2820 };
    expect(nightOf(late, new Date(2026, 7, 10, 22, 0)))
      .toEqual({ id: "2026-08-10", now: 1320 });
  });
});
```

Why these seven and not more: each one is a distinct branch or edge. Rows 1 and 2 are the two sides of the `back` branch. Rows 3 and 4 bracket the boundary instant itself. Row 5 exercises `Date`'s rollover normalisation. Rows 6 and 7 are the two ways the boundary stops being wake time. A month-rollover case was deliberately cut — row 5 covers it strictly.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/time.test.js`

Expected: 7 failures, all `TypeError: nightOf is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `src/time.js`:

```js
/** Which night the wall clock belongs to, and where that puts us on the plan's
    axis. The night is named by the date its shift starts on and rolls over at
    the plan's own wake time, so a shift crossing midnight is one night, not two.
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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/time.test.js`

Expected: PASS, 7 new tests green alongside the existing ones in that file.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`

Expected: PASS. Nothing else imports `nightOf` yet, so no other file can have moved.

- [ ] **Step 6: Commit**

```bash
git add src/time.js src/time.test.js
git commit -m "feat: nightOf names the night and places us on the plan's axis"
```

---

### Task 2: `nightOf` replaces `realNow` in `App.jsx`

**Files:**
- Modify: `src/App.jsx:9` (import), `src/App.jsx:293-306` (delete `realNow`), `src/App.jsx:2317`, `src/App.jsx:2360`

**Interfaces:**
- Consumes: `nightOf(ph, d) -> { id, now }` from Task 1.
- Produces: nothing new. `now` state keeps the same meaning and the same type. `id` is not read yet — Phase 1 stores it.

**Background the implementer needs:**

`realNow` currently picks among four candidate day offsets and keeps whichever lands nearest the plan window. That heuristic is the second answer to "which night is it", and the point of this task is that there is now only one. Line numbers below are from the current `main`; find the code by content if they have drifted.

Expect a visible behaviour change **outside** the plan window, and none inside it. Inside — pre-shift through wake — `nightOf().now` returns exactly what `realNow` returned. Outside, the old code could pick a nonsensical candidate: at 20:00 with a 00:00–08:00 shift it returns `now = -240` (yesterday 20:00) because that sits closer to the pre-shift window, where `nightOf` returns `1200`, four hours before tonight's shift. The new answer is the correct one. This is the `realNow` clamp the roadmap files under Phase 4, fixed early as a side effect.

`id` being returned and not read is deliberate for one phase — see the spec. Do not split the function to avoid it.

- [ ] **Step 1: Add `nightOf` to the time import**

`src/App.jsx:9`, change:

```js
import { DAY, toMin, fmt, nextAfter, dur } from "./time.js";
```

to:

```js
import { DAY, toMin, fmt, nextAfter, dur, nightOf } from "./time.js";
```

- [ ] **Step 2: Delete `realNow`**

Remove `src/App.jsx:293-306` in full, comment included:

```js
/** Map the wall clock onto this plan's absolute-minute scale, choosing the
    occurrence nearest the planned window. */
function realNow(ph) {
  const d = new Date();
  const clock = d.getHours() * 60 + d.getMinutes();
  const day0 = Math.floor(ph.start / DAY) * DAY;
  let best = null;
  for (let k = -1; k <= 2; k++) {
    const t = day0 + k * DAY + clock;
    const dist = t < ph.start - 180 ? (ph.start - 180) - t : t > ph.sleepEnd ? t - ph.sleepEnd : 0;
    if (!best || dist < best.dist) best = { t, dist };
  }
  return best.t;
}
```

Leave the `DAY` import alone — `App.jsx:1585` still uses it.

- [ ] **Step 3: Point the 30s tick at `nightOf`**

`src/App.jsx:2317`, inside the `useEffect` that starts the tick, change:

```js
    const tick = () => setNow(realNow(calculateShiftPhases(profile)));
```

to:

```js
    const tick = () => setNow(nightOf(calculateShiftPhases(profile)).now);
```

Leave the `setInterval(tick, 30000)`, the cleanup, and the dependency array exactly as they are.

- [ ] **Step 4: Point `finishQuiz` at `nightOf`**

`src/App.jsx:2360`, inside `finishQuiz`, change:

```js
    setNow(realNow(calculateShiftPhases(p)));
```

to:

```js
    setNow(nightOf(calculateShiftPhases(p)).now);
```

- [ ] **Step 5: Verify `realNow` is gone**

Run: `grep -rn "realNow" src/`

Expected: no output. Any hit is a call site this plan missed — fix it the same way before continuing.

- [ ] **Step 6: Run the whole suite**

Run: `npm test`

Expected: PASS. `App.jsx` has no component tests, so this is a regression check on `time`, `planner`, `stats`, `mockNights` and `share` — it proves nothing was broken, not that the swap works. Step 7 is what proves the swap.

- [ ] **Step 7: Verify in the running app**

Run: `npm run dev`, open the printed URL, complete the quiz with the default answers (22:00–07:00, sleep 08:00, 7.5h).

Check three things:
1. The Plan page renders a timeline — a blank or single-item plan means `now` landed outside the window.
2. The current-phase label matches the wall clock. Between 22:00 and 07:00 it reads a shift phase; mid-afternoon it reads Sleep; late evening it reads Pre-shift or Before plan.
3. Tick an item done, then hard-refresh. It comes back undone. That is correct for Phase 0 — persistence is Phase 1 — and confirms you have not accidentally implemented it early.

- [ ] **Step 8: Commit**

```bash
git add src/App.jsx
git commit -m "refactor: one answer to which night it is, realNow gives way to nightOf"
```

---

## Done when

- `npm test` passes with 7 new `nightOf` cases.
- `grep -rn "realNow" src/` is empty.
- The app boots to a rendered plan whose phase matches the wall clock.
- Nothing persists. Phase 1 has not been started.

## Explicitly not in this plan

- Storing the night ID (Phase 1), rollover on ID change (Phase 2), archive (Phase 2–3).
- A timestamp on every log — the roadmap rules it out and the ID makes it unnecessary.
- A work calendar or off-day concept — see the deferred note in `docs/implementation-roadmap.md`.
- Touching `generateTimeline`, `foldNight`, `clockToAbs`, or the mock history.
