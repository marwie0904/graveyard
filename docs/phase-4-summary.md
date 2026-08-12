# Phase 4 — The Plan page on live persisted state

A plain-language summary of what changed, how it was checked, and what is still
wrong on purpose. No prior knowledge of this codebase assumed.

---

## What Phase 4 was for

GraveYard is a planning app for people who work night shifts. It gives you a plan
for tonight — when to drink caffeine, when to get up and move, when to sleep —
and it remembers what you actually did. The Plan page is the screen that shows
tonight's list.

This phase was supposed to be almost nothing. The roadmap listed three items and
had already crossed two of them out, on the grounds that earlier phases had
fixed them in passing. The job was to check that claim rather than trust it.

Two of the three really were done:

- **The clock is no longer forced into the plan's window.** An old function
  called `realNow` used to take the real time and drag it toward the planned
  shift, so opening the app at two in the afternoon insisted you were mid-shift.
  It was deleted in an earlier phase and nothing replaced it. Checked against the
  real functions: at 21:00 the evening before an 04:00 shift, the app now places
  you 180 minutes *before* the plan starts and marks nothing as current. That is
  correct, and there was nothing to do.
- **Stale items no longer survive a restart.** Close the app on Monday's plan and
  open it Wednesday, and Monday's ticked-off items do not carry over. That path
  was already covered.

The third crossed-out item did not hold, and finding out why became the whole
phase.

---

## The bug

### How it happened

The app checks the time every 30 seconds to ask one question: has tonight ended?
This is a **timer** — a piece of code the browser is asked to run again and again
on a fixed schedule.

Phones and laptops do not honour that schedule when a tab is out of sight. If you
lock your phone, or switch to another tab, the browser stops running the timer to
save battery. That much is expected. The part that causes trouble is what happens
when the tab comes back: the timer does not catch up. It does not fire once for
each schedule it missed. It simply resumes, as if no time had passed.

Nothing in the app was listening for the tab coming back. So the sequence was:

1. You open the app at three in the morning, mid-shift, and tick a few things off.
2. You lock your phone. The timer stops.
3. Your night ends at 15:00. Nothing notices, because nothing is running.
4. You unlock your phone at 15:20 and look at the screen.

What you saw was last night's plan, with last night's ticks still on it, twenty
minutes after last night had ended. Driven against the real app: at 15:20 the
page still read `1 of 20 done` and still believed the date was the previous night.

### Why it mattered more than a stale screen

A screen showing old information is annoying. This was worse, because the screen
still accepted taps.

When the night ends, the app **folds** it: it takes everything you logged,
summarises it into one record, files that record in your **archive** (the saved
list of past nights), and clears the plan so tonight starts clean. That fold is
what was overdue.

Tapping anything on the stale plan is what finally triggered it — and the tap got
swept up in the fold. The app filed the tap into the record for the night that
had already ended.

The result, measured on the real app before the fix:

```
after tapping one movement reset on the stale plan:
  archive record 2026-08-12 → moveDone: 2
  tonight's plan            → "0 of 20 done"
```

`moveDone: 2` is one reset you genuinely did last night, plus the one you just
tapped this afternoon. Both are in yesterday's record. Tonight shows nothing.

That is the part worth being clear about. Your history now contains a fact that
never happened — you did not get up and move at that point last night. And
tonight has lost a fact that did happen. Neither is visible from the screen; you
would just see a plan that says you have done nothing, and a chart, weeks later,
built partly on an event you never performed. An app whose entire purpose is to
be an honest record of your nights had a way to write a false one.

None of this was a mistake in any single line. The earlier phase deliberately
files a tap made just after the boundary under the night that just ended, because
across 30 seconds those two nights are genuinely indistinguishable. That rule is
right. The assumption underneath it — that the gap is only ever about 30 seconds —
is what broke. For a sleeping tab the gap had no limit at all.

### The fix

Two lines. Browsers already announce when a tab becomes visible again, with an
event called `visibilitychange`. The app now listens for it and runs the same
check it was already running on the timer:

```js
document.addEventListener("visibilitychange", tick);
```

plus the matching line that removes the listener again when the check is rebuilt.

Nothing else changed. The check itself is untouched, so the rule about where a
tap goes is untouched. The only thing that changed is *when* the check runs. The
gap is no longer unbounded — it is back to the 30 seconds the app always accepted.

The removal line is not tidiness. This check is rebuilt every time you tap
something, so without the removal the app would stack up one forgotten listener
per tap, each holding an out-of-date copy of your log, each ready to file its own
stale version of the night. That failure is checked for directly, below.

---

## What else was decided

Neither of these is code that does anything. Both are decisions that were open
and are now written down.

### The two view switches are not remembered, on purpose

The Plan page has two switches: "Remaining only" (hide what you have already
done) and "Resets grouped" (collapse the repeating movement reminders into one
row). Neither is saved. Reload the page and both go back to their defaults.

That was true before this phase, but nobody had decided it — it was simply never
written. The risk of leaving it that way is that a reviewer next year reads it as
an oversight and "fixes" it.

The rule the app follows is: **it saves what you told it, not where you were
standing in it.** Your shift times, your logs, your written reflection and your
light-or-dark theme are all things you chose about the app. Those are saved. The
two switches are a position in tonight's list, like a scroll position. Three
reasons this is the right call:

- Both switches say what they are doing on their own face. A control that reads
  "Showing everything" never leaves you wondering why the list looks like that.
- Saving one buys you a single tap after a reload and costs a permanent field in
  the saved file — a field that has to be checked on every load, forever, because
  a hand-edited `hideDone: "no"` would silently hide your whole plan.
- The default is the better opening state anyway. "Resets grouped" carried over
  from last night would open tomorrow's fresh plan as eight separate rows the
  design deliberately groups into one.

The deliverable was a three-line comment in the source saying exactly this, plus
a check that fails if anyone starts saving them.

### History stays a summary

The archive stores a summary of each night, not the plan it came from. So you
cannot open Tuesday and see what Tuesday's plan asked of you.

The roadmap suggested keeping it that way because storing plans "doubles
storage". Measured on this repo's own test profile, it is much worse than double:

| | Bytes | Compared to a summary |
|---|---|---|
| One night's summary, as the app writes it | 296 | 1× |
| That night's full plan, 20 items | 6,914 | **23×** |

A browser gives a page roughly 5MB of local storage. A year of summaries is about
106KB. A year of saved plans is about 2.4MB — half the budget. Worse, the app
rewrites its entire saved file on every single tap, so storing plans would put a
multi-megabyte save behind every tap on the Plan page.

So the answer is no. But "no" was being delivered as silence: tapping a past
night on the Dashboard showed the figures for that night and never mentioned that
a plan had ever existed. The change is one sentence, placed in the exact slot
where tonight's plan would have been:

> Only tonight has a plan. A finished night is kept as what you logged, not as
> the plan it came from.

It states the design rather than apologising for a gap. It deliberately does
*not* appear on a past night with nothing recorded — that screen already says
"No record for this night.", and a second explanation on an otherwise empty
screen is the app explaining itself twice.

Adding that line also cleaned something up. The muted grey explanatory row it
uses was written out by hand three times in the same file. It is now one small
component called `Note`, used four times. The change deletes more lines than it
adds.

---

## How it was tested

Two kinds of test, answering different questions.

A **unit test** takes one function on its own, hands it an input, and checks the
output. It is fast — the whole suite runs in about three seconds — and it never
opens a browser. It cannot tell you anything about what is on screen.

An **end-to-end test**, also called a browser test, drives the real app in a real
browser the way a person would: it sets up saved data, opens the page, clicks
things, and reads what actually rendered. Slower and fussier, and the only way to
check anything that is a screen rather than a calculation. These are run with a
tool called Playwright.

**No unit tests were added this phase, and that is the honest answer.** Nothing
this phase touched is a plain function. One change is an event listener, one is a
comment, one is a line of screen markup. The 96 existing unit tests were used as
a **regression gate** — a fixed set of checks that must stay green to prove
nothing else moved — along with the 15 browser checks from Phase 3.

The new browser checks live in `drive-plan-state.mjs`. There are six.

### What makes these checks unusual

Every other browser test in this repo speeds the clock up. Playwright calls that
`fastForward`, and it runs all the timers that were scheduled along the way. That
models a tab that is awake. It is the right tool for almost everything, and it
**cannot see this bug at all** — because a tab whose timers run would have
noticed the boundary on its own.

These checks use a different mode, `setFixedTime`, which moves the clock forward
*without running a single timer*. That is precisely what a suspended tab is: time
passed, nothing ran. It is the only way to hold the app still inside the broken
window and read what it is showing.

The checks stand at 14:59 on a profile whose night ends at 15:00, jump the clock
to 15:20 with the timers frozen, and then look.

| | What it proves |
|---|---|
| P1 | A tab that slept through the boundary is still stale at 15:20 — and then folds the night, clears the plan and shows the toast the moment it comes back. |
| P2 | The first tap after that resume lands in **tonight**, and the archived record's count is unchanged. This is the bug from the report, asserted from the fixed side. |
| P3 | A tab coming back without crossing a boundary changes nothing at all: no fold, no cleared plan, no toast. |
| P4 | Both view switches can be toggled, and the saved file gains no new field; after a reload both read their defaults again. |
| P5 | A past night with a record shows the "Only tonight has a plan." line and no plan; tonight still shows its plan. |
| P6 | A past night with no record says "No record for this night." and does **not** also show the new line. |

P3 is the one worth pointing at. P1 and P2 only prove that the app rolls the
night over when the tab returns. A careless fix that rolled the night over on
*every* return, boundary or not, would pass both of them and be badly wrong — it
would archive your night in progress and wipe your plan every time you unlocked
your phone. P3 is the check that exists to catch that.

---

## Mutation testing

A test that passes tells you nothing until you know it is capable of failing. So
after everything was green, each new piece of logic was deliberately broken, the
checks were re-run to confirm the *right* one went red, and the break was undone.
This is called mutation testing, and it is the strongest evidence in this phase —
stronger than the passing runs, because a check that cannot fail is not a check.
It is decoration that reports success no matter what the code does.

Six breaks, six runs, all observed:

| Break | Result |
|---|---|
| Remove the `visibilitychange` listener | **4/6** — P1 and P2 fail, P3–P6 pass. P2's failure detail reads `moveDone=[2] logs=0 done=0 of 20 done`: the original bug, reproduced exactly. |
| Disable the "has the night actually changed?" guard | **0/6** — every check fails. More destructive than expected: with nothing stopping it, the roll re-triggers its own check and the app spins into an endless update loop. P3 catches the intended fault; the loop catches the rest. |
| Drop the `removeEventListener` line | **5/6** — P2 alone fails, on its listener count: `vis=2->4`. Two taps, two forgotten listeners, exactly the leak the line prevents. |
| Save `hideDone` to the file | **5/6** — P4 alone fails, on the file's field list gaining `hideDone`. |
| Make the `Note` row render nothing | **5/6** on the new checks (P5 fails), and **12/15** on Phase 3's — R7, E2 and E3 all go red. Three of Phase 3's checks were already reading those rows, which is what made converting them safe rather than hopeful. |
| Replace the past-night line with nothing | **5/6** — P5 fails on `line=false`, P6 still passes. |

Every break produced a red check, every red check was the intended one or better,
and every break was reverted.

---

## What passed, and what failed

Everything passes. All three commands, run from the repo root against the dev
server on `http://localhost:5174/`:

```
$ npm test

 Test Files  6 passed (6)
      Tests  96 passed (96)
```

```
$ node drive-plan-state.mjs

6/6 passed
```

```
$ node drive-history.mjs

15/15 passed
```

| Suite | Result |
|---|---|
| Unit tests (`npm test`) | 96 of 96 passed |
| Phase 4 browser checks (`node drive-plan-state.mjs`) | 6 of 6 passed |
| Phase 3 browser checks (`node drive-history.mjs`) | 15 of 15 passed |

Nothing failed. What follows is the more useful list: things known to be thin,
that were found, and that were deliberately left alone.

- **A tab that stays visible can still be up to 30 seconds stale.** That is the
  timer's interval and always was. A tap inside those 30 seconds is still filed
  under last night on purpose, because across that gap the two nights genuinely
  are indistinguishable. This phase did not widen or narrow that window; it put
  the sleeping-tab case back inside it instead of leaving it open for as long as
  the phone was in a pocket.
- **The rollover message can be missed.** When the night rolls, the app shows a
  short message — "Last night is saved. Tonight's plan starts fresh." — for 2.6
  seconds. The new listener fires when a tab is hidden as well as when it is
  shown, which is deliberate: it means a page hidden just after an unnoticed
  boundary rolls on the way out rather than on the way back. The cost is that the
  message can be spent on a screen nobody is looking at. The plan is correct when
  you return; the explanation for why your ticks vanished is not. Making it
  durable means the message becomes saved state, which is a bigger change than
  the event it explains.
- **`pageshow` was considered and not added.** It is a second browser event, and
  it covers one case `visibilitychange` can miss: Safari restoring a page from
  its back-forward cache. It was left out because that hole is already bounded.
  A page restored that way starts its timers again along with the page, so it
  self-corrects within 30 seconds — the same 30 seconds the app already accepts
  everywhere else. The hidden-tab hole was different in kind: it had no bound at
  all. Adding `pageshow` would buy a shorter version of an already-short window,
  for a second listener and a redundant check on every page load. It is written
  down as the named next step, to be added the first time a real device comes
  back stale.
- **The archive is still summarised using tonight's settings.** A finished night
  records things like your caffeine cutoff by reading whatever your profile says
  at the moment of folding, so changing your shift times shifts the stored figures
  for a night already over. Inherited from Phase 2 and untouched here.
- **A hand-edited saved file is still unchecked.** Nothing the app writes can
  produce a broken one, but a person editing it by hand can. This phase adds no
  new stored field, which is the only thing it can honestly claim about this.
- **A past night is a summary, permanently as far as any shipped phase goes.**
  The Plan page is tonight's and has no other mode. The screen now says so; it
  still cannot show you what you were asked to do on Tuesday. The interesting
  alternative is not storing plans but storing the raw logs plus a snapshot of
  your settings, and rebuilding the plan on demand — six times a summary rather
  than 23, and it would fix the ceiling two items above. Phase 5 may want that
  snapshot for its own reasons; if it takes one, this becomes cheap and can be
  looked at again.

---

## What's next

`docs/implementation-roadmap.md` has two phases left. **Phase 5** is the loop —
the app reading its own archive instead of trusting what you typed into the
opening quiz. The count of consecutive nights worked starts counting itself from
the record, and the answers you write in your nightly reflection start changing
the next night's plan instead of going nowhere. It needed an archive worth
reading and a Plan page that stays honest across a boundary, which is what Phases
3 and 4 have now delivered. **Phase 6** is traceability: one citation field on
every plan item, and a test that fails the build when an item has none. It
depends on nothing and can land whenever.
