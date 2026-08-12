# Phase 3 — Real history

A plain-language summary of what changed, how it was checked, and what is still
wrong on purpose. No prior knowledge of this codebase assumed.

---

## What Phase 3 was for

GraveYard is a planning app for people who work night shifts. It has a Dashboard
that charts your past nights — how long you slept, when you drank caffeine, how
often you got up and moved. Until this phase, none of those nights were yours.
They were 45 nights written by hand for the demo, and the app showed them to
everybody, on the first run, before you had logged anything at all. Phase 2 had
already built the real thing quietly in the background: every night you finish
gets folded into a saved list called the **archive**. Nothing read it. Phase 3 is
the phase where the Dashboard stops reading the invented nights and starts
reading the ones you actually lived through.

---

## What got built

### A night id that only moves forward

Every night gets a name, called a **night id**: the calendar date the shift
starts on, written `2026-08-13`. The app works out which night "now" belongs to
from your shift times, so a shift running 22:00 Monday to 06:00 Tuesday is one
night, not two.

The danger was counting the same night twice. You can edit your shift times in
the app, at any hour. Move them far enough and the app's answer to "which night
is it?" moves backward by a day. The old code just accepted whatever answer it
got, then noticed the id had changed and filed the night away — a second time,
under a name the archive already held. While nothing read the archive, a
duplicate row was harmless. The moment the Dashboard reads it, a duplicated
night is counted twice in every average, and it is invisible: two rows, one
chip on screen, all your numbers quietly wrong.

The fix is one line, `forward(current, next)`, and one rule: the id may move to a
later night, never an earlier one. Because the ids are zero-padded dates,
comparing them as plain text already puts them in time order, so no date maths is
involved. The guard sits at the one place the id is stored, which three different
parts of the app all read, rather than at the three places that would each need
their own copy of it.

### The swap: invented nights out, your archive in

One line. The Dashboard's list of nights used to be *tonight plus 45 invented
nights*. It is now *tonight plus everything in your archive*. This is the change
the phase is named after, and it is the smallest change in it.

### The invented nights become a demo mode

The 45 hand-written nights were not deleted. They are good test data and they are
what makes the app demonstrable to somebody who has never opened it. They now
appear only when you add `?seed` to the end of the web address — for example
`http://localhost:5174/?seed`. Two rules about that flag: the demo nights are
never saved to disk, so they cannot outlive the flag or mix into your real
records, and the screen says so in plain text at the bottom — "Demo data — 45
sample nights." The Dashboard's own stated rule is that it never shows a made-up
figure, and 45 invented nights presented as your history would be the largest
possible breach of it.

### "How many days ago" is worked out, not stored

The day strip along the top of the Dashboard is a row of chips: Now, 1d, 2d, and
so on. Each saved night needs to know which chip it belongs to. Storing that
number with the night would be wrong by morning — a night that was "1 day ago"
when you saved it is "2 days ago" tomorrow. So the number is never stored. It is
worked out when the screen is drawn, by subtracting the night's date from
tonight's. That is a second one-line function, `daysBetween`.

### A range means "the last 7 days", not "the last 7 records"

The Dashboard has a window selector: 3 days, 1 week, 2 weeks, 1 month, all time.
It used to take the last N *records* in the list. Against 45 invented nights that
sat in an unbroken row, those two things are identical. Against a real archive
they are not. If you only logged seven nights over the past month, "1 week" would
have handed you all seven and labelled a month's worth of data as a week. Now a
window is a span of days ending tonight, and a night is in it if its date falls
inside. If you logged three nights this week, "1 week" says three nights — which
is thinner, and true.

### Empty states, for when you have barely any nights

This was the real work of the phase, not the swap. On day one you have one night,
or none. Everything downstream had been written assuming a full list. Without a
change, a brand-new user's Dashboard showed a headline figure reading "-", three
more figures reading "-", two chart frames with nothing drawn in them, and a
suggested plan adjustment worked out from no data. Nothing was factually wrong,
and all of it was noise. Now:

- A window with nothing in it says "No nights on record yet." and stops there.
- A chart with nothing to draw is not drawn at all. An empty frame is not a
  chart.
- Below five nights, one quiet line says how many are still missing: "4 more
  nights and these charts start reading as trends."

Five is not a new number. It is the threshold the app already used internally to
decide whether it was allowed to claim a pattern; this phase gave it a name
(`MIN_TREND`) instead of writing `5` in three places.

---

## How it was tested

Two kinds of test, and they answer different questions.

A **unit test** takes one function, hands it an input, and checks the output. It
is fast — the whole suite runs in about three seconds — and it never opens a
browser. It can prove that `forward("2026-08-13", "2026-08-12")` refuses to go
backward. It cannot prove that anything on screen is right.

An **end-to-end test** (also called a browser test) drives the real app in a real
browser, the way a person would: it sets up the saved data, opens the page,
clicks things, and reads what actually rendered. It is slower and fussier, and it
is the only way to check the parts of this phase that are screens rather than
maths. These live in one file, `drive-history.mjs`, driven by a tool called
Playwright. Two details make them trustworthy: the browser's clock is **faked**,
so a test can stand at 14:59 and jump two minutes forward to cross a night
boundary on demand, and any JavaScript error on the page fails the check it
happened in.

**Unit tests: 96 now, against 69 at the start of the phase** — 27 added.

**Browser checks: 15**, in three groups.

The night id group (4 checks):

| Check | What it proves |
|---|---|
| H1 | A saved night ahead of the computed one is not filed away a second time. |
| H2 | Editing your shift time backward, through the real settings sheet, does not move the id backward. |
| H3 | The night the clocks go back — when 01:30 happens twice — rolls over once, not three times. |
| H4 | A full week of nights still reads as seven nights through the new day-based window. |

The swap group (5 checks):

| Check | What it proves |
|---|---|
| R2 | A patchy archive lights the right chips and dims the rest, and counts the right number of nights. |
| R3 | A night 20 days back is outside "1 week" and inside "1 month". |
| R4 | A night saved with no "days ago" number still lands on the correct chip. |
| R7 | `?seed` fills the charts, labels itself as demo data, and never writes those nights to disk. |
| R8 | The "Home safe" badge is still lit after a night boundary wiped the night's log entries. |

The empty-states group (6 checks):

| Check | What it proves |
|---|---|
| E1 | Someone with nothing on record gets two different honest screens, not one blank one. |
| E2 | One night reads as one night, with the countdown line and a real chart. |
| E3 | The countdown counts down — three nights on record says "2 more nights". |
| E4 | The countdown disappears at five nights. |
| E5 | Both charts are absent when there is nothing to draw, and the page still renders. |
| E6 | The caffeine chart is present when there *is* caffeine to draw. |

E6 was added last, to close a real gap. E5 proved the caffeine chart vanishes
when it should. Nothing proved it appears when it should — so a change that
deleted the chart outright would have left all 14 other checks green. This was
confirmed the honest way: the chart's draw condition was temporarily forced to
"never", E6 went red and everything else stayed green, and the change was undone.
A check that cannot fail is not a check.

---

## What passed, and what failed

Everything passes. Both commands, run from the repo root against the dev server:

```
$ npm test

 Test Files  6 passed (6)
      Tests  96 passed (96)
```

```
$ node drive-history.mjs

15/15 passed
```

| Suite | Result |
|---|---|
| Unit tests (`npm test`) | 96 of 96 passed |
| Browser checks (`node drive-history.mjs`) | 15 of 15 passed |

Nothing failed. What follows is the more useful list: things that are known to be
wrong or thin, that were found, and that were deliberately left alone. Each is
recorded rather than fixed because the fix costs more than the fault.

- **A "days ago" number can be stale for up to 30 seconds.** If you edit your
  shift time in a way that moves the night forward, the archived nights sit one
  column off on the day strip until the next 30-second tick corrects them.
  Fixing it properly means making the night id a piece of live screen state,
  which re-opens an ordering problem the previous phase spent real effort
  closing.
- **Editing your shift backward merges two nights into one.** This is the
  accepted price of the forward-only rule. Two nights of entries fold into one
  record and read as one long night. The alternative — the old behaviour — was
  two records with the same name, one of which the screen hides and both of which
  every average counts. A merged night reads long; a duplicated night is wrong
  twice over, invisibly.
- **The charts' bottom axis treats a gap between nights as no gap at all.** Two
  nights four days apart are drawn in neighbouring columns; only the "1d" and
  "5d" labels underneath say otherwise. A truthful axis means switching both
  charts to a real time scale, which is a chart project rather than an
  empty-state one.
- **`?seed` shows six nights in a seven-day window, not seven.** The demo data
  starts at "yesterday" and has no entry for tonight, so the "Now" chip is
  genuinely empty and the week holds six. Adding a demo night for tonight would
  put it at the same position as your real tonight, which is exactly the
  overlapping-position case the day strip handles worst.
- **The "Hard night" badge can never be earned from the demo data.** The badge is
  for working a shift on under five hours of sleep. The shortest night in the 45
  invented ones is 5.5 hours, so under `?seed` that badge stays dark forever. It
  is correct for real use and only misleading in a demo.
- **The charts' left-hand labels are clipped.** A three-character label like
  "10p" is drawn starting a few pixels outside the chart area, so its first
  character is cut off and it reads as "0p". Measured: two-character labels sit
  at or just inside the edge, three-character ones start between 2.5 and 5 pixels
  outside it. This predates Phase 3 — it is the chart's own margin and axis
  width, not anything this phase touched.
- **A hand-edited archive is still unchecked.** Nothing the app itself writes can
  produce a broken one, but a person editing the saved data by hand can: a value
  of the wrong type wipes everything on the next load, and two records sharing a
  name are counted twice. Closing this means validating the saved file's shape,
  which no phase has wanted to start.
- **Last night is summarised using tonight's settings.** A finished night records
  things like your caffeine cutoff, and it reads those from whatever your profile
  says at the moment of folding — so changing your shift shifts the stored
  figures for a night already over. This is inherited from Phase 2; the only
  change is that it is now visible on a chart instead of buried in an export
  file.
- **Two places build a night record, and nothing keeps them in step.** The real
  fold and the demo generator produce the same shape by hand. This phase added
  one field and had to add it to both. A single test comparing their field lists
  would catch the next drift, and is a one-liner somebody should write the next
  time that shape moves.

---

## What's next

`docs/implementation-roadmap.md` has three phases left. **Phase 4** hardens the
Plan page now that its data survives a refresh, and settles one real question:
whether you can re-open a past night's plan at all, or whether history stays a
summary. **Phase 5** is the loop — the app reading its own archive instead of
trusting the quiz, so the count of consecutive nights worked counts itself and
your reflection answers actually change the next plan. It needed an archive worth
reading, which is what Phase 3 just delivered. **Phase 6** is traceability: one
citation field on every plan item, and a test that fails the build when an item
has none. It depends on nothing and can land whenever.
