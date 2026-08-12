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

- **Real history** — Phase 3, shipped. `history` is `[tonight, ...archive]`. The
  45 authored mock nights are a dev seed behind `?seed` and nothing else.
- **The Plan page on live state** — Phase 4, shipped. It survives a refresh, a
  rollover, and a tab that slept through the boundary.

**Missing:** nothing on the original chain. What is left is Phase 5 — the app
reading its own archive instead of the quiz — and Phase 6's citation field.

So this was not a build-from-zero. It was: give time an identity, save it, roll it
over, and swap the mock for the real thing. All four are done.

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

## Phase 3 — Real history replaces the mock ✅ done

The Dashboard stops reading 45 authored nights and starts reading yours.

The swap itself is one line: `history` is `[tonight, ...archive]` instead of
`[tonight, ...materializeNights(profile)]`. Everything else in the phase is what
that line exposed.

What shipped:

- **The night ID only moves forward.** `forward(current, next)` in `time.js`, and
  one rule: the ID may move to a later night, never an earlier one. The IDs are
  zero-padded dates, so string comparison already puts them in time order and no
  date maths is involved. Landed *before* the swap, on purpose — the adopt effect
  recomputes the ID from an edited profile and the tick only asked whether it
  *differed*, so a shift-time edit across a boundary walked the ref backward and
  folded the same night twice. Harmless while nothing read the archive; a night
  counted twice in every average the moment something did. The guard sits at the
  one place the ID is stored, which three callers read.
- **The mock became a dev seed behind `?seed`.** Not deleted — 45 authored nights
  is how the Dashboard, the ranges and `stats.js` stay testable. Two rules: the
  seeded nights are never written to disk, and the screen labels itself "Demo
  data — 45 sample nights." This screen's standing rule is that no figure is ever
  fabricated, and 45 invented nights presented as history is the largest possible
  breach of it.
- **`dayOffset` is computed, not read.** Archived records deliberately do not
  carry it, because a night that was "1 day ago" when it was saved is "2 days ago"
  by morning. `daysBetween` derives it at render time against tonight.
- **A range is N *nights*, not N records.** `nights.slice(0, spec.nights)` was
  exact against 45 dense mock nights and wrong against a sparse archive — an
  intermittent worker's "1 week" could span a month. A window is now a span of
  days ending tonight. Three nights logged this week reads as three nights, which
  is thinner and true.
- **Empty states, which were the real work.** Day one has one night or none, and
  everything downstream assumed a populated array. A window with nothing in it
  says so and stops; a chart with nothing to draw is not drawn, because an empty
  frame is not a chart; below `MIN_TREND` (five, a number the app already used
  internally and now has a name for) one quiet line counts down.

Spec: `docs/superpowers/specs/2026-08-13-real-history-design.md`. Summary:
`docs/phase-3-summary.md`. Covered by 96 unit tests (up from 69) and 15
end-to-end checks in `drive-history.mjs`.

**What it cost, and what it deferred.** Editing your shift backward now merges
two nights into one record that reads as one long night. That is the accepted
price of the forward-only rule, and it is the better half of the trade: a merged
night reads long, where a duplicated night is wrong twice over and invisible. The
charts' bottom axis still treats a four-day gap as no gap, which needs a real
time scale rather than an empty-state phase. A hand-edited `gy.v1` is still
unvalidated, and last night is still summarised against tonight's profile —
both inherited, both untouched.

**Depends on:** Phases 0, 1 and 2 — all done.

---

## Phase 4 — Plan page on live persisted state ✅ done

Two of the three items really were absorbed by earlier phases. Checking the third
against the running app turned up a bug nobody knew about, and that became the
phase.

- ~~`realNow` clamps toward the plan window~~ — **verified gone.** `nightOf`
  places the clock honestly, including negative pre-shift minutes. Driven against
  the real functions: 21:00 the evening before an 04:00 shift gives `now = −180`,
  reaches `determineCurrentPhase` unmodified, and comes back "Before plan" with
  nothing marked current. Nothing to do.
- ~~Last night's items leaking into tonight~~ — **two of three paths held.** Boot
  folds stale logs, and an app that is open and ticking rolls on the tick. The
  third path did not: a page that is open but whose *timers did not run*.
  `setInterval` does not accumulate missed fires and `App.jsx` contained no
  `addEventListener` at all, so a phone locked at 03:00 and unlocked at 15:20 came
  back to last night's plan. Worse than a stale screen — the first tap on it set
  `logs`, re-ran the tick effect, and its immediate `tick()` folded the whole
  array *including the new tap* under the night that had already ended. Driven,
  that read `moveDone: 2` in yesterday's record with tonight showing "0 of 20
  done": a fact in your history that never happened, and one missing from tonight
  that did.
- **Transient UI state — confirmed as a decision.** `hideDone` and `showAllPlan`
  stay unpersisted and are not reset at the roll. The blob stores what you told
  the app, not where you were standing in it; `theme` is persisted precisely
  because it is a preference and not a position. The pills name their own mode,
  persisting one buys a tap and costs a validated schema field forever, and the
  defaults are the right opening state. The whole diff is the comment that says
  so, because "nobody has decided this" is what makes a reviewer persist it next
  year.

**The fix is two lines** inside the effect that already owns the roll: a
`visibilitychange` listener and its removal. `tick` is untouched, so the write
stamp still reads `nightRef.current` — the window was the bug, not the rule.
Phase 2's 30 seconds are right; the unbounded version of them was not.
Unguarded on `document.hidden` on purpose: firing on hide as well costs one tick
that returns at the ID comparison, and it rolls a page hidden after an unnoticed
boundary on the way out. The removal is load-bearing — the effect re-registers on
every log tap, and a leaked closure folds its own stale logs.

**On reading a past night's plan: history stays a summary,** and the roadmap
undersold the reason. Measured on this repo's own fixture, a folded record is 296
bytes and that night's `plan.items` are 6,914 — **23×**, not double. A year of
records is 106KB; a year of item lists is 2.4MB against a ~5MB budget, and the
whole blob is re-serialised on every log tap. The change is one sentence in the
slot the plan would have occupied: "Only tonight has a plan. A finished night is
kept as what you logged, not as the plan it came from." Silence was not a
user-facing answer.

Spec: `docs/superpowers/specs/2026-08-13-plan-live-state-design.md`. Summary:
`docs/phase-4-summary.md`. Covered by 6 end-to-end checks in
`drive-plan-state.mjs`, driven on `page.clock.setFixedTime` — which moves the
wall clock *without* running a timer, and is the only idiom that can see this bug
at all. Every check was mutation-tested: six deliberate breaks, six reds, six
reverts.

**What it cost, and what it deferred.** No new unit tests, because nothing pure
changed — the 96 existing tests and Phase 3's 15 checks were the regression gate.
A visible tab still has up to 30 seconds of stale plan, deliberately. The
rollover toast can be spent on a hidden page. `pageshow` is the named escalation
for Safari's bfcache restore and was not written: that hole self-corrects inside
the 30 seconds the app already accepts, where the hidden-tab hole had no bound at
all. Add it the first time a real device comes back stale.

**Depends on:** Phases 1 and 2 — both done.

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
      ✅ done          ✅ done       ✅ done         ✅ done            next
                          │
                          └──────► 4 Plan page hardening ✅ done

6 Traceability ── independent, do it whenever
```

0 → 1 → 2 → 3 is a strict chain and all four links are in. 4 came nearly free
with 1 and 2 between them — two of its three items needed only verifying, and the
third turned out to be a real bug that verifying is what found. 5 needs an
archive with some nights in it, and now there is one. 6 is still unblocked.

**Next is 5,** and it is the first phase that changes what the plan says rather
than where the plan lives. The raw material is finally there: every record
carries its night ID, so a stretch is a run of consecutive IDs and a gap is a
break in that run. Start with `nightInStretch` counting itself, because it
already drives real behavior and is the one input the quiz is worst at. What a
gap *means* is still the open question from Phase 0 — an off-night and a night
you forgot to open the app look identical — but it can now be measured before
being guessed.

---

## Out of scope for this roadmap

Tracked in `app-design-basis.md`, not here:

- WARM theme contrast fixes (§4)
- Multimodal content — build one audio track or reword the paper (§5)
- Push notifications, accounts, backend, acceptance testing (§6)

Worth noting: the export at `App.jsx:2547` serializes
`{profile, logs, history, reflection, archive}`. Now that persistence and the
archive exist, an import path is nearly free — but it is a nice-to-have, not a
phase. Since Phase 3 the Dashboard reads the archive directly, so the export is
no longer the only way to see it without opening devtools.
