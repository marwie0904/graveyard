# Phase 4 — The Plan page on live persisted state

The roadmap says this phase was mostly absorbed by Phases 1–3 and lists three
items, two of them already struck through. Both strikes were checked against the
code rather than taken on trust. One holds. One does not, and the hole it leaves
is the only real work in the phase.

Spec for Phase 4 of `docs/implementation-roadmap.md`. Builds on Phase 0
(`2026-08-11-night-identity-design.md`), Phase 1
(`2026-08-12-persistence-design.md`), Phase 2 (`2026-08-12-rollover-design.md`)
and Phase 3 (`2026-08-13-real-history-design.md`). `generateTimeline` does not
change; its signature stays `(profile, logs, now)`.

Three parts, and only the first one is code that does anything:

1. A tab whose timer did not run across the boundary still shows last night.
2. `hideDone` and `showAllPlan` stay transient — decided, not omitted.
3. History stays a summary, and the screen says so where the plan would be.

This is a small phase. It should be.

---

## Verified: the `realNow` clamp is gone

`realNow` was deleted in `9f92379` ("realNow gives way to nightOf"). It mapped
the wall clock onto the plan axis by trying four candidate days and picking the
one *nearest the planned window* — `dist = t < ph.start - 180 ? (ph.start - 180)
- t : t > ph.sleepEnd ? t - ph.sleepEnd : 0`. That is the clamp: any clock
outside the plan was dragged to its edge.

Nothing replaced it with another one. `nightOf` (`time.js:56`) places the clock
by one modulo around the night's wake boundary and returns whatever that gives,
including a negative number. Driven against the real functions:

| Profile | Wall clock | `night` | `now` | phase |
|---|---|---|---|---|
| 22:00–06:00, sleep 07:30 ×7.5h | 14:00 | `2026-08-12` | 2280 | `sleep` |
| 22:00–06:00 | 19:30 | `2026-08-13` | 1170 | `pre` |
| 04:00–12:00, sleep 13:00 ×7h | 21:00 | `2026-08-14` | **−180** | `before` |
| 04:00–12:00 | 23:30 | `2026-08-14` | **−30** | `before` |

The negative values are the proof: −180 reaches `determineCurrentPhase`
unmodified and comes back `{key: "before", label: "Before plan"}`
(`planner.js:45`). `generateTimeline(profile, [], -180)` returns 20 items, none
of them `at <= now`, so `PlanTab` marks nothing as past and nothing as current
(`App.jsx:1231`) — the plan reads as entirely ahead of you, which is what 21:00
the evening before a 04:00 shift is. Opening the app outside the window no
longer insists you are mid-shift. **Nothing to do.**

## Not verified: last night still leaks into tonight on one path

The roadmap says this is gone "both ways" — `forNight` folds stale logs on boot,
and Phase 2's tick handles an app left open across the boundary. Two of the
three paths do hold:

- **Boot.** `forNight` (`storage.js:33`) folds and clears whenever the stored
  stamp is not the computed night, inside `boot` (`App.jsx:2299`). Covered by
  `drive-rollover.mjs` T1.
- **An app that is open and ticking.** The 30-second tick (`App.jsx:2380`)
  compares `forward(nightRef.current, seen)` against the ref and rolls. Covered
  by T3.

The third path is a page that is *open but whose timer did not run* — a phone
that locked at 03:00 and was unlocked at 15:20, a tab in the background all day.
`setInterval` does not accumulate missed fires, nothing in the app listens for
the tab coming back (`App.jsx` contains no `addEventListener` at all), so the
first correction is the next interval fire after resume.

Driven against the running app, with `page.clock.install` at 14:59 on a
22:00–06:00 profile (boundary 15:00), one plan item already ticked, and
then `page.clock.setFixedTime("15:20")` — which moves the wall clock without
running a single timer, exactly what a suspended tab does:

```
at 14:59, plan tab:      night=2026-08-12 logs=2 archive=0  "1 of 20 done"
wall clock 15:20:        night=2026-08-12 logs=2 archive=0  "1 of 20 done"
after visibilitychange:  night=2026-08-12 logs=2 archive=0  "1 of 20 done"
```

Twenty minutes past the boundary, the Plan page is still last night's, with last
night's tick on it. That is the leak the roadmap struck through.

It is worse than a stale screen. Tapping a movement reset on that stale plan and
then letting the tick fire:

```
control (no tap):  archive[0] = { id: "2026-08-12", moveDone: 0, moveTotal: 4 }
tapped once:       archive[0] = { id: "2026-08-12", moveDone: 1, moveTotal: 4 }
```

The tap lands in the record for **the night that already ended**, and tonight's
plan reads `0 of 20 done`. The mechanism is not a bug in any one line: the tap
sets `logs`, `logs` is in the tick effect's dependency list, the effect re-runs,
its immediate `tick()` finally notices the boundary, and `archived({night:
nightRef.current, ..., logs})` folds the whole array — the new tap included —
under the old id. Every part of that is Phase 2 working as designed.

**Phase 2's rule is right; the window it assumed is not.** The write stamp reads
`nightRef.current` on purpose, so that a log tapped between the boundary and the
tick is filed under last night. Over thirty seconds that is correct — the two
nights are genuinely indistinguishable there. Over twelve hours it is a user
looking at a screen that says "tonight" and being filed into yesterday. The fix
is not to change where the log goes. It is to stop the window from being
unbounded.

---

## Part 1 — The tick runs when the tab comes back

Two lines, inside the effect that already exists (`App.jsx:2380`):

```js
  tick();
  const id = setInterval(tick, 30000);
  document.addEventListener("visibilitychange", tick);
  return () => { clearInterval(id); document.removeEventListener("visibilitychange", tick); };
```

`tick` is unchanged, and so is everything it calls. `visibilitychange` is the
platform's own answer to "this page came back", it fires before the user's
finger can reach an item, and it costs no state, no dependency and no new
function. The listener re-registers with the effect on every log tap, the same
as the interval already does.

**No `document.hidden` guard.** Firing on hide as well as show runs one extra
`tick` that almost always sees a matching id and returns at
`App.jsx:2389`. Guarding is a condition to read and to get backwards; not
guarding also means a page hidden *after* a boundary it has not yet noticed
rolls on the way out rather than on the way back.

**Not `pageshow`, not `focus`.** Two events of the same size go to the one that
is right on the edges, so this was decided rather than assumed. A hidden page is
the one whose timers the browser throttles or stops outright, which makes being
shown again the only resume the interval cannot answer by itself. Every other
one — a laptop waking with the tab still visible, a bfcache restore — starts the
interval again along with the page, so those land back inside the thirty seconds
this app already accepts. `pageshow` would shorten one of those bounded windows
(Safari can restore from bfcache without firing `visibilitychange`, which is why
the name stays on file) for the price of a second listener and a redundant tick
on every load, where the effect's own `tick()` has already run. `focus` fires on
every alt-tab and covers nothing the interval does not. Add `pageshow` next to
this line the first time a real device comes back stale.

### What it does not close

An app that stays *visible* across the boundary still has up to thirty seconds
of stale plan, because that is the tick interval and always was. That window is
Phase 2's deliberate one and stays deliberate. This change puts the resume case
back inside it instead of leaving it open for as long as the phone is in a
pocket.

And the honest size of the win, because it is the reason nothing more is
warranted: a page that resumes resumes its timers, so even without this the
interval catches up within thirty seconds of the unlock. What the two lines buy
is *those* thirty seconds — the ones with the screen already in front of a face
and a finger already moving. `setFixedTime` in the driver models a tab that
never resumes, which is how a check can stand still inside that window and read
it; a real phone passes through it at the worst possible moment instead.

---

## Part 2 — `hideDone` and `showAllPlan` stay transient, on purpose

`useState(true)` and `useState(false)` (`App.jsx:2341`), never written to
`gy.v1`. The roadmap asks for that to be confirmed as a decision rather than an
omission. It is confirmed, and the whole diff is the comment above those two
lines, because "nobody has decided this" is what makes a reviewer persist it
next year:

```js
  /* Where you are standing in tonight's plan, not something you told the app:
     not persisted, and not reset at the roll. The pills name their own mode, so
     neither one needs remembering. Decided, not overlooked. */
  const [showAllPlan, setShowAllPlan] = useState(false);
  const [hideDone, setHideDone] = useState(true);
```

The rest of this part is why that comment says what it says.

**The rule: the blob stores what you told the app, not where you were standing
in it.** The profile, the logs, the reflection and the theme are all things the
user typed, tapped or chose about the app itself — `theme` is persisted
(`App.jsx:2330`) precisely because it is a preference and not a position.
`hideDone`, `showAllPlan`, `rangeKey` (`:2346`), `tab` (`:2321`), `logDraft`,
`editingLog` and `quickResult` are all positions in tonight's data. None of them
survive a reload today and none of them should start.

Three reasons, in the order they actually decide it:

- **The two flags are self-labelling.** The pills read "Remaining only" /
  "Showing everything" and "Resets grouped" / "Resets expanded"
  (`App.jsx:1407`, `:1411`). A control that states its own mode on its face
  never leaves a user wondering why the list looks like that. State that is
  legible on screen needs neither persisting nor resetting.
- **Persisting buys one tap and costs a schema field forever.** Storage is a
  trust boundary in this app (`storage.js:3`), so a persisted flag is a field
  `boot` has to validate — a hand-edited `hideDone: "no"` is truthy and would
  silently filter a plan. Three lines of coercion to save a tap that only
  happens on a refresh.
- **The default is the right opening state and the persisted value is not.**
  `hideDone: true` on a fresh plan hides nothing, because every item is open.
  `showAllPlan: true` carried in from last night opens tomorrow's plan as eight
  separate reset rows that the design deliberately groups.

**The rollover does not reset them either.** The tick clears `logs` and
`reflection` because those are the night; the flags belong to the person
looking, and re-collapsing a list under someone who just expanded it is its own
small surprise. The worry the roadmap names — `hideDone` staying on across a
rollover and hiding a fresh plan — is not reachable: `hideDone` filters on
`s.itemStatus(i.id) === "open"` (`App.jsx:1375`), the roll empties the logs, and
every item is therefore open. Driven: after the roll the page reads `0 of 20
done` with all twenty listed.

If either flag ever becomes a real preference — "I always want the resets
expanded" — it belongs on the profile next to `overrides`, where the quiz and
the edit sheet can reach it. Not in the transient blob.

---

## Part 3 — History is a summary, and the screen says where the plan went

The archive holds folded NightRecords, not plan items. The roadmap recommends
keeping it that way on the grounds that archiving item lists "doubles storage".
Measured, it is worse than that:

Measured on one profile (22:00–06:00, sleep 07:30 ×7.5h — the fixture the
drivers already use), serialised the way the blob is:

| | Bytes | Against a record |
|---|---|---|
| A folded NightRecord (18 fields, as `archived` writes it) | 296 | 1× |
| `plan.items` for that night, 20 items, as generated | 6,914 | **23×** |
| A trimmed `{id, at, category, title, status}` list | 1,863 | 6.3× |
| The raw logs for a busy night (20 entries) plus a profile snapshot | ~1,770 | 6× |

A year of records is 106KB. A year of item lists is **2.4MB**, against a
localStorage budget of about 5MB — and the whole blob is re-serialised on every
single log tap (`App.jsx:2375`), so the cost is not only the shelf space but a
multi-megabyte `JSON.stringify` behind every tap on the Plan page. The
recommendation stands, harder than the roadmap made it.

The replay alternative — store the raw logs and a profile snapshot per night and
re-run `generateTimeline` to reconstruct the plan — is the interesting one,
because it is six times the record rather than twenty-eight, and it would fix
Phase 2's standing ceiling that last night is folded against tonight's profile.
It is still not this phase. It changes the archive's shape, invalidates
`storage.test.js`'s expectations, and buys a screen nobody has asked for. Phase
5 wants a profile snapshot for its own reasons; if it takes one, this becomes
cheap and can be reconsidered then.

### What the app does when someone taps a past night

Today: nothing. `MiniPlan` is gated on `off === 0` (`Dashboard.jsx:243`) with a
comment explaining the gate to developers, so a user tapping the "2d" chip gets
the sleep hero, the trio, "One night on its own is a snapshot, not a pattern.",
"In figures", and no mention anywhere that a plan ever existed. "We didn't build
it" is not a user-facing answer, and neither is silence.

One element, in the slot the plan would have occupied:

```jsx
{off === 0 ? (
  <MiniPlan T={T} plan={plan} status={status} now={now} onOpenPlan={onOpenPlan} />
) : (
  <Note T={T}>
    Only tonight has a plan. A finished night is kept as what you logged, not as
    the plan it came from.
  </Note>
)}
```

`Note` is the muted row this screen already uses to explain itself — `Info` at
13px, faint 12.5px text, `margin: "14px 4px 8px"` — written out by hand three
times in this one file (`:257`, `:379`, `:424`). This is its fourth use, so it
becomes nine lines beside `Figure` and `Lead`, where every other small piece of
this screen already lives, and those three sites call it instead. That is fewer
lines than pasting the block a fourth time, and it is the only version where the
new row cannot drift away from its siblings. No new token, nothing added to
`ui/index.jsx`, one ternary at the slot. The extraction is checked before it is
made: `drive-history.mjs` E2–E4 read the countdown row and R7 reads the demo-data
row, so two of the three converted sites already fail if the row changes shape.

It is placed where the missing thing was rather than at the foot of the page,
because the question is asked by the absence.

It does **not** appear on the empty past night (`off > 0` with no record). That
branch returns early at `Dashboard.jsx:196` with "No record for this night." /
"Nothing was logged that night, so there is nothing to read back.", which is a
complete answer already; adding a second explanation to a screen that has
nothing on it would be the app explaining itself twice.

---

## Out of scope

- **`generateTimeline` and every planner file.** Untouched, signature included.
- **Archiving plan items in any form**, including the replay variant above.
- **A past-night Plan tab, or making the Plan tab addressable by night.** Both
  follow only from a decision this spec declines.
- **An import path for the export.** Still a nice-to-have, still not a phase.
  The export itself (`App.jsx:2571`) does not change.
- **`rangeKey` persistence.** Named here so Phase 3's assumption 8 is closed by
  the rule in Part 2 rather than left open: it stays transient for the same
  reason as the flags, and it self-corrects across a rollover — the chips are
  relative offsets, so after a roll "Now" is the new empty night and "1d" is the
  night that just ended, which is what those labels mean.
- **The 30-second tick granularity**, and making the night id reactive state.
  Phase 3 named the cost of that and it has not changed.
- **Validating a hand-edited `gy.v1`.** Standing ceiling since Phase 2, untouched
  and unfixed by anything here.

---

## Edge cases, and their answers

| Case | Answer |
|---|---|
| Phone locked before the boundary, unlocked after | `visibilitychange` runs the tick before the first tap: fold, clear, toast |
| Phone locked and unlocked without crossing a boundary | The tick returns at the id comparison. No fold, no toast, no cleared logs |
| The tab is hidden after the boundary but before the tick notices | It rolls on the way out. The toast expires unseen inside that ≤30s window; the plan is correct when the user returns |
| App visible across the boundary, user taps within 30s | Unchanged, and still deliberate: the tap is filed under last night, and the tick corrects the screen |
| A shift-time edit that moves the night backward, then a resume | `forward` (`time.js:74`) holds the ref, the tick sees a match, nothing folds. The new trigger reaches the same guard |
| Rollover while the Plan tab is open | The plan re-renders fresh, both view flags keep their values, the pills state what they are |
| `hideDone` on, everything done | The existing empty line: "Nothing left open. Switch to showing everything…" (`App.jsx:1430`) |
| Reload mid-night | Logs and reflection restore, both flags return to their defaults, `tab` returns to Dashboard. As designed |
| Quick-log "Undo" tapped after a roll cleared its entry | The filter matches nothing and the sheet closes. No error, no false claim |
| Tapping a past night that has a record | The new line, in the slot where tonight shows "Coming up" |
| Tapping a past night with no record | "No record for this night." only. The new line stays off |
| A profile whose plan starts before midnight | `now` is negative, every item reads as ahead of you, nothing is marked current |
| Two tabs, one suspended, one awake | Unchanged from Phase 2's last-write-wins ceiling. The resumed tab may fold a night the awake tab already folded; `archived` returns the archive untouched for an empty night, so the second fold is a no-op |

---

## Traps

**Do not "fix" the misfiled tap at the tap.** Rolling inside `push()` before
appending the entry looks like the precise fix and is the wrong one: it puts a
second copy of the roll at a second site, it has to be ordered against React's
batching of `setArchive`/`setLogs`, and it leaves the *screen* stale until
something else notices. One listener on the effect that already owns the roll
keeps the rule in one place, which is what made Phase 2's version survivable.

**Do not add `hideDone` to the write effect "while you are in there".** It is
one word in an object literal and it silently makes the blob's schema wider,
which the next migration has to carry. Part 2 is a decision to not write code;
the diff for it is a comment.

**The new listener re-registers on every log tap.** The effect's dependency list
is `[profile, logs, reflection, archive]`, so add/remove runs on each of them.
That is already true of the interval and is why the cleanup has to remove the
listener rather than only clearing the interval — a missing `removeEventListener`
leaks a closure holding a stale `logs` array on every tap, and each stale closure
would fold *its* version of the night on the next resume.

**A driver check that only asserts the roll cannot fail honestly.** A "fix" that
rolls on every `visibilitychange` regardless of the id passes any test that only
resumes across a boundary. The no-crossing check (P3 below) is what makes the
suite able to fail.

---

## Assumptions

Recorded because the human partner was unavailable. Each is the smallest choice
consistent with what the repo already does.

1. **The resume gap is in scope for this phase.** The roadmap struck the leak
   through; it is not fully struck. Verifying the claim was the assignment, and
   the path that survives it is the phase's work.
2. **`visibilitychange` alone, unguarded.** Reasoning in Part 1. `pageshow` is
   the named escalation, not a hedge to write now.
3. **The view flags are not persisted and not reset at rollover.** One rule,
   both directions, stated in Part 2.
4. **The past-night line is copy, not a feature.** No collapsed "what was
   planned" section, no derived reconstruction, no link. One sentence where the
   plan would be.
5. **The wording is "Only tonight has a plan."** It states the design rather
   than apologising for a gap, which is how the rest of this app talks about
   what it does not keep.
6. **No unit tests are added.** Nothing pure changes this phase; see below.
7. **The driver is `drive-plan-state.mjs`**, per the phase brief, and it is a new
   file rather than checks bolted onto `drive-history.mjs` — those are Phase 3's
   and should stay readable as such.

---

## How this gets tested

**Unit, `vitest`: nothing new, and that is the honest answer.** This phase adds
no pure function. Part 1 is an event listener on an existing effect, Part 2 is a
comment, Part 3 is a ternary in JSX — the same category of change Phases 2 and 3
both declined to unit-test, for the same reason: asserting on a React effect over
an interval and a wall clock needs a render harness this repo does not have. The
existing 96 tests are the regression gate and must stay green; the logic the new
trigger calls (`archived`, `foldNight`, `forward`) is already covered by
`storage.test.js`, `stats.test.js` and `time.test.js`.

**End to end, `drive-plan-state.mjs`,** a root-level Playwright driver on the
pattern `drive-rollover.mjs` and `drive-history.mjs` established:
`page.clock.install({ time })` before `goto`, `addInitScript` seeding `gy.v1`, a
`record(name, pass, detail)` tally, `page.on("pageerror")` failing the check it
happened in, non-zero exit on failure. Run against `npm run dev -- --port 5174`.

The one new idiom is **`page.clock.setFixedTime`**, which moves `Date.now()`
without running a single installed timer. That is the whole point: it reproduces
a suspended tab exactly, where `fastForward` — every other driver's tool —
reproduces an awake one. A check built on `fastForward` cannot see this bug.

| | Check |
|---|---|
| P1 | Seeded at 14:59 on the 15:00 boundary with one item done: `setFixedTime` to 15:20 leaves the stale plan on screen (the precondition), and a dispatched `visibilitychange` then folds `2026-08-12`, clears the logs, shows `0 of N done`, and toasts |
| P2 | Same setup; after the resume roll, tapping a movement reset lands in **tonight** — the archived `2026-08-12` record still reads `moveDone: 0` and tonight's plan shows the item done. This is the misfiling in the report, asserted from the fixed side |
| P3 | A `visibilitychange` that crosses no boundary changes nothing: archive length, logs and `night` all unmoved, no toast. Without this, a listener that rolls unconditionally passes P1 and P2 |
| P4 | Toggle both pills, reload: they read "Remaining only" and "Resets grouped" again, and `gy.v1` contains no `hideDone` or `showAllPlan` key. The Part 2 decision, made hard to reverse by accident |
| P5 | With a record two days back: the "2d" chip shows the "Only tonight has a plan." line and no "See all"; the "Now" chip shows "See all" and not the line |
| P6 | A past chip with no record shows "No record for this night." and **not** the new line |

P1 and P2 fail before Part 1 lands. P3 passes before and after — it exists to
stop a wrong fix from passing. P5 and P6 fail before Part 3.

**There is no check for the backward shift-time edit under the new trigger**,
which is the one that looked obligatory and is not. `visibilitychange` calls the
same `tick` the interval calls, so it reaches `forward` by the identical path P3
already drives; `forward` has its own unit tests and `drive-history.mjs` H2
already drives the edit itself through the real sheet. A check that can only
fail when one of those two fails is a check that cannot fail on its own.

---

## Known ceilings

- **A visible tab still has up to thirty seconds of stale plan.** Phase 2's
  interval, unchanged and still deliberate. A tap inside it is filed under last
  night by design.
- **The toast can be spent on a hidden page.** If the boundary passes and the
  tab is hidden before the interval fires, the roll happens on the hide event and
  the 2.6-second toast expires unseen. The plan is correct on return; the
  explanation for why the ticks vanished is not. Fixing it means the toast has to
  become durable state, which is a bigger change than the event it explains.
- **The archive is still folded against tonight's profile.** Phase 2's ceiling,
  and the reason the replay option in Part 3 is more interesting than it looks.
- **A hand-edited `gy.v1` is still unvalidated.** Unchanged. This phase adds no
  new stored field, which is the only thing it can honestly claim here.
- **A past night is a summary, permanently as far as any shipped phase is
  concerned.** The Plan page is tonight's and has no other mode. The screen now
  says so; it still cannot show you what you were asked to do on Tuesday.

## Skipped

- Persisting `hideDone`, `showAllPlan`, `rangeKey` or `tab`. Part 2.
- Resetting the view flags at rollover. Part 2.
- Archiving plan items, trimmed item lists, or logs-plus-profile replay. Part 3.
- A `pageshow` listener, a `focus` listener, a shorter tick.
- A driver check for the backward shift-time edit under the new trigger. It
  restates P3 through a function with its own unit tests.
- A shared harness for the drivers. The new file copies `record`, `seed`, `open`
  and the fixture the way all twenty existing `drive-*.mjs` do; extracting one
  would edit twenty files to save a hundred lines in one, and every one of those
  files is a finished phase's evidence.
- An import path, schema validation, retention limits, a `storage` event
  listener. All still standing, all still somebody else's phase.
