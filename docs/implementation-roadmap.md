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
- `PlanTab` (`App.jsx:1379`) — already renders real `plan.items`, real statuses,
  real recurring-reset collapsing. The Plan page is not a mockup.
- `foldNight(profile, logs, reflection)` (`stats.js:66`) — already folds live logs
  into the same NightRecord shape the mock produces. Half of "real history" exists.
- `deriveState` reactivity — skipped resets, late caffeine, groggy naps all
  already mutate the plan.

**Missing:**

- Any persistence at all. `App.jsx:2313` says so in a comment.
- Any notion of *which night* a log belongs to.
- Real history. `history` is 45 authored mock nights + tonight (`App.jsx:2336`).

So this is not a build-from-zero. It is: give time an identity, save it, roll it
over, and swap the mock for the real thing.

**Plan generation is not on this roadmap because it is finished.** No phase below
changes `generateTimeline` or its signature — it stays a pure function of
`(profile, logs, now)`. What the phases change is that its *inputs* become
durable and self-correcting, and its *outputs* stop being thrown away at refresh.
Two consequences worth naming, since they are the only places persistence touches
the engine at all:

- `nightInStretch` already drives real behavior (caffeine cutoff +1h from night 3,
  reset gap −30min at night 4). The rule is correct; the input is self-reported
  from the quiz. Phase 5 makes it count itself.
- The `overrides` map that `ADJUSTABLE` reads works today, but dies on refresh —
  so tuning a parameter is currently pointless. Phase 1 makes it stick.

---

## Phase 0 — Night identity

**The foundation. Nothing else is correct without it.**

Today `now` is minutes on an axis anchored to the profile's own shift start, and
`push()` stores `t: now`. That number is meaningless outside the current session
— a caffeine log at `t: 1350` could be tonight or eleven nights ago.

What this phase establishes:

- A **night ID**: the calendar date the shift *starts* on. Derived from the wall
  clock and the profile, not stored per-log.
- The rule for **which night "now" belongs to** — including the awkward cases: a
  shift that starts at 22:00 Monday and ends 07:00 Tuesday is one night, not two.
  Opening the app at 15:00 on a day off belongs to a night too; see below.
- Where the **night boundary** sits. Candidate: the plan's own `sleepEnd`, not
  midnight. Midnight falls in the middle of every shift this app exists for.

**Days off — deferred, on purpose.** Settled in
`superpowers/specs/2026-08-11-night-identity-design.md`: there is no "neither".
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

**Unblocks:** everything below. Do not start Phase 1 before this is settled.

---

## Phase 1 — Persist

Profile, logs, reflection, and the current night ID. Local only.

The module is already written out in `app-design-basis.md` §2 — ~10 lines,
`try/catch` on both sides (Safari private mode throws on `setItem`, corrupt JSON
would white-screen the app on boot). That try/catch is the trust boundary; it is
not defensive padding.

What changes visibly:

- Boot with a saved profile → straight to the app, no quiz.
- Refresh mid-shift → the plan comes back with your done/skipped items intact.

That second one is the point of the whole roadmap. It is the first moment the
plan is a real object rather than a render.

Also closes the paper's false claim #8 ("local-only persistence of sleep,
fatigue, and caffeine records"), which `app-design-basis.md:28` flags as the one
gap that breaks the artifact rather than the write-up.

**Skipped:** IndexedDB, schema migrations, encryption, sync. Add migrations the
first time the log shape changes after someone real is using it.

---

## Phase 2 — Rollover

The night ends and becomes history.

On boot and on the existing 30s tick: computed night ID ≠ stored night ID →
fold the finished night, append it to an archive, clear live logs, start clean.

Most of the work here is already done — `foldNight` exists and is tested. This
phase is the trigger, the archive write, and the edge cases:

- A night with no logs at all. `foldNight` already returns `null`; decide whether
  that archives as an off-night or vanishes.
- Missed nights. App not opened for four days — does the stretch reset?
- The app being open *across* the boundary, not just closed and reopened.

**Depends on:** Phase 0 (there is no rollover without an ID to compare) and
Phase 1 (nowhere to write the archive).

---

## Phase 3 — Real history replaces the mock

`history` becomes `[tonight, ...archive]` instead of
`[tonight, ...materializeNights(profile)]`.

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

---

## Phase 4 — Plan page on live persisted state

Largely free once Phase 1 lands, because `PlanTab` already renders real data.
What this phase covers is what *breaks* once state stops being ephemeral:

- `realNow` (`App.jsx:295`) clamps toward the plan window. Harmless today because
  the app boots into a fresh plan; visible once you open it at 14:00 on a day off
  and it insists you are mid-shift.
- Last night's done/skipped items leaking into tonight if rollover misses.
- Transient UI state (`hideDone`, `showAllPlan`) — decide what survives a refresh.

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
  −30min at night 4) — it just currently depends on the user remembering.
- The reflection already asks "what should the plan change next shift?"
  (`REFLECT_QS`, `App.jsx:1460`) and the answer currently goes nowhere. Wire it
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
                          │
                          └──────► 4 Plan page hardening

6 Traceability ── independent, do it whenever
```

0 → 1 → 2 → 3 is a strict chain. 4 is nearly free once 1 lands. 5 needs an
archive to exist. 6 is unblocked today.

**Start at 0, and settle it on paper before writing storage code.** The night
boundary and the missed-night rule are the two decisions that are expensive to
change once there is real user data sitting in localStorage under the old
assumption.

---

## Out of scope for this roadmap

Tracked in `app-design-basis.md`, not here:

- WARM theme contrast fixes (§4)
- Multimodal content — build one audio track or reword the paper (§5)
- Push notifications, accounts, backend, acceptance testing (§6)

Worth noting: the export at `App.jsx:2480` already serializes
`{profile, logs, history, reflection}`. Once persistence exists, an import path
is nearly free — but it is a Phase 3+ nice-to-have, not a phase.
