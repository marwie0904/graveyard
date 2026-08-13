# What's new

Phases 3, 4, 5 and 6 of the roadmap are done. The short version: the app used to
show 45 invented nights and forget everything on refresh. Now it remembers the
nights you actually lived, learns from them, and can say where each of its
recommendations comes from.

Detail per phase is in `phase-3-summary.md` through `phase-6-summary.md`. This
file is just the features and how to try them.

---

## New features

**Your real history.** The Dashboard shows nights you actually logged, not demo
data. On day one you see one night, and the charts say how many more they need
instead of drawing a line through nothing.

**A demo mode.** The 45 sample nights still exist, behind `?seed` in the URL.
They never touch your saved data.

**Time ranges mean days.** "1 week" is the last 7 days, not the last 7 records.
If you skipped four nights, the average says so instead of quietly reaching back
a month.

**A tab left open overnight fixes itself.** Phones freeze background tabs. The
app now re-checks the moment you come back, so you never tap on yesterday's
plan. (Before this, that tap was filed into the wrong night's history.)

**The app counts your shift stretch itself.** It used to ask "what night of your
run is this?" once during setup, and you could never change the answer. Now it
counts from the nights it has recorded. This matters — night 1 gives you a
120-minute gap between movement reminders and a 1:30 AM caffeine cutoff; night 4
gives you 90 minutes and 12:30 AM.

**The reflection actually adjusts the plan.** Answering "what should the plan
change next shift?" now writes a real, visible, undoable adjustment.

**A "Plan adjustments" card.** In the profile sheet. Lists every adjustment
you've made with one button to put them all back.

**Sleep goal suggestions.** After five or more nights, if you're sleeping in a
different range than the goal you typed in, the app offers to change it. It
offers — it never changes it silently. Say no and it won't ask about that number
again.

**Every recommendation records its source.** Each plan item now carries citation
keys, listed in `src/citations.js`. Honest count: 13 of 25 items have a real
supporting study, 2 are structural, and 10 are marked `judgement` because the
research corpus has nothing on them. Nothing was invented to fill a gap.

---

## Try it yourself

Start the app:

```
npm run dev
```

Open whatever URL vite prints (usually `http://localhost:5173/`).

**1. See the empty states.** Profile sheet → *Start over* (two taps). Finish the
quiz. The Dashboard now shows one night, and a line reading something like "4
more nights and these charts start reading as trends."

**2. See the demo data.** Add `?seed` to the URL. 45 sample nights appear and a
muted line reads "Demo data — 45 sample nights." Remove `?seed` and your real
data is untouched.

**3. Check that it remembers.** Tick a few plan items, then refresh. They're
still ticked.

**4. Watch the reflection change the plan.** Log tab → reflection → answer
"What should the plan change next shift?" with *Earlier caffeine cutoff* → Save.
A message confirms it, and the caffeine cutoff on the Plan tab moves from
1:30 AM to 12:30 AM.

**5. Undo it.** Profile sheet → *Plan adjustments* → *Put them all back*. The
cutoff goes back to 1:30 AM and the card disappears.

**6. See a refusal.** Set caffeine to "none" in your profile, then answer
*Earlier caffeine cutoff* again. The app tells you there's nothing to move
rather than pretending it changed something.

**7. Look at a past night.** Dashboard → tap an older night in the day strip. It
tells you a finished night is kept as what you logged, not as the plan it came
from.

---

## Run the tests

```
npm test                     # 153 unit tests
```

The browser tests need the dev server running first, on port 5174:

```
node drive-history.mjs       # 15 checks — real history, ranges, empty states
node drive-plan-state.mjs    #  6 checks — the suspended-tab fix
node drive-loop.mjs          # 12 checks — stretch counting, adjustments
node drive-cite.mjs          #  8 checks — the citation change broke no rendering
```

41 browser checks in total. Each prints PASS/FAIL per line and exits non-zero if
anything fails.

---

## Known limits

Worth knowing before you trust a number on screen:

- The app can't tell a night off from a night you forgot to log. One missing
  night is bridged; two end your stretch count.
- A visible tab can still be up to 30 seconds behind at the moment a night ends.
- Nothing checks that a citation is the *right* one for its item — only that it
  exists and resolves.
- The commute warning is the only unskippable item and has no drowsy-driving
  source in the research corpus. That's a fix to the paper, not the code.

Each phase summary has the full list with the reasoning for each.
