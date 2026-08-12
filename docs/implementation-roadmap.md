# Implementation Roadmap — Real Plan + Persistence

Getting from "the plan regenerates from scratch every refresh" to "the plan is a
thing that persists, rolls over, and accumulates into a history."

Not a spec. Phases, ordering, and why the order is what it is.

---

## Where we actually are

Worth stating plainly, because a lot more is already built than the persistence
gap suggests.

**Already done:**

- `generateTimeline(profile, logs, now)` — the real planner, pure, tested.
- `PlanTab` (`App.jsx:1365`) — already renders real `plan.items`, real statuses,
  real recurring-reset collapsing. The Plan page is not a mockup.
- `foldNight(profile, logs, reflection)` (`stats.js:69`) — folds live logs into
  the same NightRecord shape the mock produces, and since Phase 2 it folds
  finished nights into the archive through the same call.
- `deriveState` reactivity — skipped resets, late caffeine, groggy naps all
  already mutate the plan.
- **Night identity, persistence and rollover** — Phases 0, 1 and 2, shipped.
  `nightOf` (`time.js`) answers which night it is; `storage.js` keeps it, the
  profile, the logs and the reflection under one key, and folds a finished night
  onto the front of an archive instead of dropping it.

**Missing:**

- Real history. `history` is still 45 authored mock nights + tonight
  (`App.jsx:2404`). The archive exists and fills up; nothing reads it yet.

So this is not a build-from-zero. It is: give time an identity, save it, roll it
over, and swap the mock for the real thing. The first three are done, and only
the swap is left.

**Plan generation is not on this roadmap because it is finished.** No phase below
changes `generateTimeline` or its signature — it stays a pure function of
`(profile, logs, now)`. What the phases change is that its *inputs* become
durable and self-correcting, and its *outputs* stop being thrown away at refresh.
Two consequences worth naming, since they are the only places persistence touches
the engine at all:

- `nightInStretch` already drives real behavior (caffeine cutoff +1h from night 3,
  reset gap −30min at night 4). The rule is correct; the input is self-reported
  from the quiz. Phase 5 makes it count itself.
- The `overrides` map that `ADJUSTABLE` reads used to die on refresh, which made
  tuning a parameter pointless. It rides on the profile, so Phase 1 persisting
  the profile made it stick for free.

---

## Phase 0 — Night identity ✅ done

**The foundation. Nothing else is correct without it.**

`now` was minutes on an axis anchored to the profile's own shift start, and
`push()` stored `t: now`. That number was meaningless outside the current session
— a caffeine log at `t: 1350` could be tonight or eleven nights ago.

What shipped — `nightOf(phases, date)` in `src/time.js`, replacing `realNow`:

- A **night ID**: the local calendar date the shift *starts* on, derived from the
  wall clock and the profile, not stored per-log. Local dates on purpose;
  `toISOString` would report the UTC date, which is the wrong night for half the
  world for part of every day.
- One answer to **which night "now" belongs to**, and its position on the plan
  axis, from the same call. A shift starting 22:00 Monday and ending 07:00
  Tuesday is one night. The clock resolves forward into last night's arc or back
  into a pre-shift block that starts before midnight — `now` goes negative there,
  which is the axis working, not an error.
- The **night boundary** sits at the plan's own wake (`sleepEnd`), not midnight,
  capped at the next shift start so a profile whose planned sleep runs past it
  cannot file the first hour of a shift under the night before.

Spec: `docs/superpowers/specs/2026-08-11-night-identity-design.md`. Covered by
20 tests in `time.test.js`.

**Days off — deferred, on purpose.** Settled in that spec: there is no "neither".
The profile records shift times and nothing else, so the app cannot know a
Tuesday was not worked without inventing data. Every instant belongs to some
night; a night nobody worked simply accumulates no logs, and `foldNight` already
returns `null` for that.

That is the right answer for Phase 0 and a thin one for later. Three things a
work calendar would unlock, none of them worth building before there is an
archive to prove they are needed:

- **Stretch counting.** Phase 5 has `nightInStretch` count itself from the
  archive. Without off-days it can only count *nights logged*, so an off-night
  and a night you forgot to open the app are the same event.
- **Averages.** `stats.js` would divide by nights worked rather than nights
  elapsed. Today a week off drags every average toward null.
- **Pre-shift prompts.** The plan currently proposes a pre-shift meal on a
  Sunday it has no reason to believe you are working.

The cheapest version, when it comes: one `workDays` array on the profile, set in
the quiz. Not a calendar UI, not a scheduling engine. Do it only when the
archive shows enough unlogged nights to distort a real number — before that, it
is a question asked to fix a problem nobody has hit.

Deliberately *not* in this phase: changing the log shape. `t` stays axis-minutes.
A log's night is "the current one" while live, and "whichever archive record it
was folded into" afterwards. Adding a timestamp to every log is a bigger change
that buys nothing the night ID doesn't.

**Unblocked:** everything below.

---

## Phase 1 — Persist ✅ done

Profile, logs, reflection, theme, and the current night ID. Local only.

`src/storage.js` — one key (`gy.v1`), one blob, ~15 lines, `try/catch` on both
sides (Safari private mode throws on `setItem`, corrupt JSON would white-screen
the app on boot). That try/catch is the trust boundary; it is not defensive
padding. One write effect in `App.jsx`, one read at import.

What changed visibly:

- Boot with a saved profile → straight to the app, no quiz.
- Refresh mid-shift → the plan comes back with your done/skipped items intact.
- **Start over** in the profile sheet: two taps, wipes the key and reloads.

That second one is the point of the whole roadmap. It is the first moment the
plan is a real object rather than a render.

Two decisions worth recording, because Phase 2 inherited both:

- A blob stamped with a *different* night keeps the profile and the theme and
  drops the logs and the reflection (`forNight`). Tonight starts clean rather
  than inheriting last night's ticked items. Phase 2 replaced the drop with a
  fold into the archive, inside that same function — the one place the rule
  lived, so both of its callers got it at once.
- Boot validates more than JSON. A profile that parses but throws inside
  `calculateShiftPhases`, or one that yields a non-finite `now` (missing
  `sleepGoalHours` → `sleepEnd = NaN`), is discarded back to the quiz. Without
  the finite check the app rendered a plan that only *looked* booted and
  re-persisted its own NaN stamp on every mount.

Also closes the paper's false claim #8 ("local-only persistence of sleep,
fatigue, and caffeine records"), which `app-design-basis.md:28` flagged as the
one gap that broke the artifact rather than the write-up.

**Skipped:** IndexedDB, schema migrations, encryption, sync. Add migrations the
first time the log shape changes after someone real is using it.

Spec: `docs/superpowers/specs/2026-08-12-persistence-design.md`.

---

## Phase 2 — Rollover ✅ done

The night ends and becomes history.

What shipped — `archived(s)` in `storage.js`, and three effects in `App.jsx`
declared in a load-bearing order:

- **The fold.** `forNight` stops dropping a stale night's logs and folds them
  onto the *front* of an archive, newest first. The record is stamped with the
  night ID it came from and `dayOffset` is stripped, because that field is
  relative to tonight and would be wrong by morning.
- **The tick notices.** The 30-second tick compares the computed night to a
  `nightRef` and rolls when they differ: fold, clear, and one toast — but only
  when something was actually folded, since "last night is saved" is a lie for a
  night nobody logged.
- **The write stamp stops watching the clock.** It reads `nightRef.current`
  instead. This, not the fold, is what closes Phase 1's worst ceiling: a log
  tapped after the boundary but before the tick used to be written under the new
  night ID together with all of the previous night's.

Spec: `docs/superpowers/specs/2026-08-12-rollover-design.md`. Covered by 7 tests
in `storage.test.js` and 12 end-to-end checks driven against the running app on a
faked clock.

**The edge cases this phase listed, answered:**

- *A night with no logs.* It archives nothing, and the gap in the ID sequence is
  the only trace it gets — which is the same answer Phase 0 gave about days off.
  A night with **only a reflection** does archive: the guard in `foldNight` asks
  for neither logs nor reflection, because seven typed answers are a night.
- *Missed nights.* Still unanswered on purpose. Every record carries its night
  ID, so gaps are visible to anything that looks; Phase 5 decides what one means
  once there is an archive to measure rather than guess at.
- *The app open across the boundary.* Done, and it turned out to be the whole
  phase rather than an edge case.

**One trap worth recording, because it is not obvious.** `nightOf` derives the
night from the profile's wake boundary, and the sheet at `App.jsx:2685` lets the
user edit all four fields that feed it, mid-night. To a naive rollover check that
is indistinguishable from a boundary crossing — editing your shift time at 3am
would archive the night you are standing in and clear the plan under you. The fix
is a third effect that *adopts* the new ID without folding, declared above the
other two so React's effect order corrects the ref before anything reads it. A
profile edit re-labels the night; it does not end it.

**Depends on:** Phases 0 and 1 — both done.

---

## Phase 3 — Real history replaces the mock ← next

`history` becomes `[tonight, ...archive]` instead of
`[tonight, ...materializeNights(profile)]`.

**Do one thing first: make the night ID only move forward.** The adopt effect
recomputes the ID from the edited profile and the tick only asks whether it
*differs*, so a shift-time edit across a boundary can walk the ref backward and
fold the same night twice. Nothing dedupes. That is harmless while nothing reads
the archive, and stops being harmless the moment this phase does:
`nights.find(x => x.dayOffset === off)` (`Dashboard.jsx:179`) silently takes one
copy, and `rangeStats` counts the night twice in every average. Roll only when
the new ID sorts after the old — a small change, but it is a real rule about
time and deserves its own tests rather than being bolted onto the swap.

Demote the mock to a dev seed behind a flag rather than deleting it — 45 authored
nights is how the Dashboard, the ranges, and `stats.js` stay testable. It is a
good dataset; it just should not be the default.

**The real work in this phase is empty states,** not the swap. Day one shows one
night. Everything downstream currently assumes a populated array:

- The 7-night strip on the Dashboard
- The `RANGES` selector (3d / 1w / 2w / 1m / all time)
- `achievements(profile, logs, history)`
- Every average and trend in `stats.js`

`stats.js` is already disciplined about nulls (`avgOf` drops them, `spanHours`
guards the `Infinity` case), so this is mostly UI copy — "three more nights and
this chart starts working" — rather than math.

Two things the mock hid, which a real archive exposes:

- **`dayOffset` has to be computed, not read.** Archived records deliberately do
  not carry it. Derive it from the night ID against tonight, or the day strip
  matches nothing.
- **A range is N *records*, not N nights.** `nights.slice(0, spec.nights)`
  (`Dashboard.jsx:181`) was exact against 45 dense mock nights and is not against
  a sparse archive — an intermittent worker's "1 week" can span a month, which
  makes `wakeDrift` and the spread figures mean something other than they say.
  The `have` set at `:174` goes sparse for the same reason, so the strip needs
  real empty chips rather than the mock's always-present ones.

---

## Phase 4 — Plan page on live persisted state

Largely free now that Phase 1 has landed, because `PlanTab` already renders real
data. What this phase covers is what *breaks* once state stops being ephemeral —
and two of the three are already answered:

- ~~`realNow` clamps toward the plan window~~ — gone. `nightOf` places the clock
  honestly, including negative pre-shift minutes, so opening the app at 14:00 no
  longer insists you are mid-shift.
- ~~Last night's done/skipped items leaking into tonight~~ — gone, both ways.
  `forNight` folds stale logs into the archive on boot, and Phase 2's tick does
  the same for an app left open across the boundary.
- Transient UI state (`hideDone`, `showAllPlan`) — currently not persisted, by
  omission rather than decision. Confirm that is what we want.

Then the additive part: reading a **past** night's plan, not just tonight's. The
archive holds folded NightRecords, not plan items, so this is a real decision —
either archive the item list too, or accept that history is a summary and the
Plan page is always "tonight."

Recommend: history is a summary. Archiving full item lists doubles storage for a
view nobody has asked for yet.

---

## Phase 5 — The loop

With persistence, the quiz answers stop being ground truth and the app can start
learning from itself. This is what makes it worth opening a second time.

- `nightInStretch` should count itself from the archive, not be asked nightly.
  It already drives real behavior (caffeine cutoff +1h at night 3, reset gap
  −30min at night 4) — it just currently depends on the user remembering. The
  raw material is there now: every record carries its night ID, so a stretch is a
  run of consecutive IDs and a gap is a break in that run. What a gap *means* is
  still the open question Phase 0 named — an off-night and a night you forgot to
  open the app look identical — but it can now be measured before being guessed.
- The reflection already asks "what should the plan change next shift?"
  (`REFLECT_QS`, `App.jsx:1439`) and the answer currently goes nowhere. Wire it
  to the `overrides` map that `ADJUSTABLE` already reads.
- Reflected sleep duration vs. the profile's claimed `sleepGoalHours` — after a
  week of archive, the app knows better than the quiz did.

**Depends on:** Phase 2 and 3. Do not attempt before there is an archive to read.

---

## Phase 6 — Traceability (`src` field)

Orthogonal to all of the above; can land any time. Cheap and it is a thesis
deliverable, so it should not wait for Phase 5.

One field on each plan item, one test that fails the build when an item has no
citation. Spec'd in `app-design-basis.md` §3. This is what makes the paper's
central methodological claim true of the running system.

---

## Order and dependencies

```
0 Night identity ──► 1 Persist ──► 2 Rollover ──► 3 Real history ──► 5 The loop
      ✅ done          ✅ done       ✅ done          next
                          │
                          └──────► 4 Plan page hardening (mostly absorbed)

6 Traceability ── independent, do it whenever
```

0 → 1 → 2 → 3 is a strict chain, and the first three links are in. 4 came nearly
free with 1 and 2 between them. 5 needs an archive with some nights in it. 6 is
unblocked today.

**Next is 3,** and it is the first phase whose real work is UI rather than data.
The swap itself is one line; the empty states behind it are the phase. Land the
forward-only night check before the swap, not after — it is the one defect that
gets harder to fix once the archive is being read, because by then a
double-counted night is a number on screen rather than a row nobody looks at.

---

## Out of scope for this roadmap

Tracked in `app-design-basis.md`, not here:

- WARM theme contrast fixes (§4)
- Multimodal content — build one audio track or reword the paper (§5)
- Push notifications, accounts, backend, acceptance testing (§6)

Worth noting: the export at `App.jsx:2547` serializes
`{profile, logs, history, reflection, archive}`. Now that persistence and the
archive exist, an import path is nearly free — but it is a Phase 3+
nice-to-have, not a phase. Until Phase 3 swaps the mock out, the export is also
the only way to see the archive without opening devtools.
