# Phase 5 — The loop

A plain-language summary of what changed, how it was checked, and what is still
wrong on purpose. No prior knowledge of this codebase assumed.

---

## What Phase 5 was for

GraveYard is a planning app for people who work night shifts. It gives you a plan
for tonight — when to have your last caffeine, when to get up and move, when to
sleep — and it saves what you actually did. The saved list of finished nights is
called the **archive**.

How hard that plan pushes depends on one number: how many nights in a row you
have already worked. That run of nights is called a **stretch**, and tiredness
builds across it. So the deeper into a stretch you are, the earlier the plan tells
you to stop drinking caffeine, and the more often it tells you to get up and move.

Until this phase, every one of those decisions came from a questionnaire you
filled in once, on the day you installed the app. The app had four phases' worth
of real records sitting in the archive and read none of them. Phase 5 is the phase
where the app starts learning from itself: the stretch counts itself from the
nights on record, the answer you give in the nightly reflection actually changes
the next plan, and the app offers to correct a sleep goal its own measurements
disagree with.

---

## What got built

### 1. Counting the stretch

**Before.** The quiz asked "what night of your run is this?" once, during setup.
The answer was saved and then — this is the part worth stating plainly — **it
could never be changed again.** It was not in the settings screen, not in the
review screen, not in the adjustment sheet. Nothing in the app wrote it a second
time. The default answer is "first night", so in practice every user was frozen on
night one forever, and the two rules that depend on the number never fired at all
for anyone who took the default.

**Now.** The app counts the number itself, by walking backward from tonight
through the archive. The rule is short:

- A night with a record extends the run. Two nights in a row, three, four.
- **One missing night is bridged.** The run continues across it, and the bridged
  night itself is not counted.
- **Two missing nights in a row end the run.** Tonight is night one again.

One night is bridged because a night you worked but never opened the app on leaves
no record at all — it looks exactly like a night off. Rosters tend to give people
two or more nights off together, so a single hole in the middle of a run is more
likely to be a forgotten night than a real one.

That is the honest limitation, and it is not solvable with what the app stores:
**the app cannot tell a night off from a night you forgot to log.** Both are the
same thing in the archive — nothing.

Here is what the number actually does, on the app's own test profile (a shift from
22:00 to 06:00):

| | Gap between movement reminders | Caffeine cutoff |
|---|---|---|
| Night 1 | 120 minutes | 1:30 AM |
| Night 4 | 90 minutes | 12:30 AM |

Half an hour tighter on the movement reminders, and a full hour earlier on the
last caffeine. That is a real change to what a real shift worker is told to do,
which is why this piece landed on its own and got the most testing in the phase.

**The seed.** The quiz answer is not deleted. It is now a **seed** — the number of
nights that were already behind you before the archive starts. If you install the
app on the third night of a stretch and say so, tonight reads night 3 even though
the archive is empty. Tomorrow, with one night on record, it reads night 4.

The seed is thrown away the moment the archive contradicts it. As soon as the app
measures a real break in the run — two missing nights — the seed stops applying,
permanently, and the count is the archive's alone.

This is why the quiz answer is a seed and not simply a fallback. A fallback would
be used only while the archive is empty, which breaks on day two: the app would
say night 3 tonight and night 2 tomorrow. The number would go *down* while the
stretch went *up*, and the caffeine cutoff would relax by an hour on the fourth
night of a stretch. Seeding counts 3, 4, 5, 6 instead.

The counted number is deliberately **never saved to disk**. It is worked out fresh
every time the screen is drawn. Saving it would let a number nobody counted get
read back later as though somebody had.

### 2. The reflection now adjusts the plan properly

At the end of a shift the app asks a short reflection, and its last question is
"what should the plan change next shift?"

**Before.** Two of the four answers did something, and what they did was worse
than nothing. They quietly overwrote your answers to *completely different*
questions:

- "Earlier caffeine cutoff" set your **caffeine sensitivity** to "high". That is
  the answer to "how sensitive are you to caffeine?" — a statement about your
  body. It also moved the cutoff by two hours, under a message that implied one.
- "Fewer resets" set your job's **activity level** to "active", meaning up and
  moving for most of the shift. That is a statement of fact about your work, not
  a preference about reminders.

Neither change was recorded anywhere, and neither could be undone. The only way
back was to notice that a quiz answer had silently changed and change it back.

**Now.** The answer writes a proper **adjustment** instead — an entry in the map
the app already keeps for exactly this, which is visible on screen and reversible
in one tap. Nothing writes a quiz answer any more.

Two safety rules make it well behaved:

- **The value is set from a fixed starting point, not nudged.** The app works out
  what the plan's own default is, adds the step to *that*, and stores the result.
  So pressing Save twice does not move the number twice, and answering the same
  thing on four nights running does not walk your caffeine cutoff off the end of
  the scale. When the value does not move, the message says so rather than
  claiming a change.
- **It is capped.** The value can never go past the top of the range the
  adjustment slider itself can express. It also never moves a number *backward*
  past one you set by hand — a number the user chose beats one the app derived.

**And it refuses when it cannot deliver.** Some answers cannot mean anything on
some profiles. If you told the app you do not use caffeine at all, there is no
cutoff on your plan to move earlier. If you told it naps are impossible, there is
no rest block to lengthen. Writing the adjustment anyway would set a number no
part of the plan reads, under a message announcing a change that did not happen.
So the app says so instead:

> "Caffeine is already off your plan, so there is nothing to move earlier."

> "You said naps are not possible, so the plan keeps rest short and quiet
> instead."

The message shown at that moment is the only thing the user sees, so it is the one
place the number has to be true.

### 3. You can see and undo every adjustment

The profile screen gains a card called **Plan adjustments**. It lists every
adjustment currently in force — its name, its value and its unit — with a single
button underneath: "Put them all back".

This is necessary rather than nice, and the reason is specific. Adjustments are
normally reached through the plan item they belong to: tap the item, move the
slider. But **some plan items only exist for some profiles.** The rest-length
adjustment has no item at all if your profile has neither a pre-shift nap nor a
deep-night rest window. Two others belong to reminders that only appear while the
app is actively nudging you about them.

So without this card an adjustment could be live, changing your plan, and
unreachable from every screen in the app. That is a trap, not a hypothetical one —
and this phase added a third thing that writes adjustments, which made a single
index of them overdue.

The card also filters what it shows. It lists only entries the plan can actually
read and whose value is really a number. That filter is doing real work, not
tidying: the saved file can be edited by hand, and an unknown name in that list
crashes the whole screen. See the mutation testing below, where exactly that was
confirmed.

Per-item undo stays where it already was, in the adjustment sheet, which shows a
live preview of where the item moves. This card is the index and the blanket undo.

### 4. The sleep goal proposal

Your sleep goal is one of four values you picked in the quiz: roughly 4.5, 5.5,
7.5 or 9.5 hours. The app has been measuring your actual average sleep from the
archive for two phases, and the Dashboard already draws the two numbers side by
side. It did nothing about the disagreement.

Now, once there are **five or more nights on record**, if your measured average
falls in a different band than the goal you typed in, the app offers to change it.
It uses the suggestion card that already exists on the Dashboard, with the Apply
and Keep current buttons that were already there. The text names both numbers and
the count behind them: *your last N nights average X hours, against the Y you set.*

**It offers. It does not change anything silently.** That matters more here than
anywhere else in the app, because the sleep goal is what defines when your night
ends. The app works out your wake time from it, and the wake time is the moment
one night is filed away and the next one's plan starts. Moving that number quietly
would redefine the user's day — their plan would clear and their night would be
archived at a different hour than yesterday, with nothing on screen to explain it.

**And it asks only once.** Say "Keep current" and the refusal is remembered: the
app never proposes that number again. Without that, the card would ask the same
question every single time the Dashboard was opened, because a disagreement
between a quiz answer and a months-long average does not go away by itself. That
nagging would be worse than doing nothing, since the Dashboard is the first screen
the app opens on. If the average later moves into a *different* band, that is new
information, and the app does ask again.

---

## How it was tested

Two kinds of test, answering different questions.

A **unit test** takes one function on its own, hands it an input, and checks the
output. It is fast — the whole suite runs in about three seconds — and it never
opens a browser. It can prove that a run of three recorded nights counts as night
four. It cannot prove that anything on screen is right.

An **end-to-end test**, also called a browser test, drives the real app in a real
browser the way a person would: it sets up saved data, opens the page, taps
things, and reads what actually rendered. Slower and fussier, and the only way to
check the parts of this phase that are screens rather than arithmetic. These are
run with a tool called Playwright, and two details make them trustworthy — the
browser's clock is faked, so a check can stand at one minute to a night boundary
and step across it on demand, and any JavaScript error on the page fails the check
it happened inside.

**Unit tests: 146, up from 96 at the start of the phase** — 50 added. Unlike Phase
4, this phase added a lot of plain, testable logic, so most of it is covered here.

**Browser checks: 12**, in `drive-loop.mjs`.

| | What it proves |
|---|---|
| L1 | Three consecutive nights on record read as "Night 4 of your stretch", and the same profile with an empty archive reads "Night 1" — with the movement gap at 90 minutes against 120, and five reminders against three. |
| L2 | A two-night hole nearest tonight ends the stretch and reads night one. Without this, a rule that never breaks a run would still pass L1. |
| L3 | A single missing night is bridged: records two and four nights back read as night three. |
| L4 | The quiz answer seeds the nights behind the archive and keeps counting *up* — a user who installed on night three and logs one night reads night 4, not night 2. |
| L5 | Neither the saved file nor the exported file carries the counted night, after a log, a profile edit and a rollover. |
| L6 | "Earlier caffeine cutoff" writes an adjustment, moves the cutoff item from 1:30 AM to 12:30 AM, and leaves the caffeine-sensitivity quiz answer alone. |
| L7 | Pressing Save a second time does not move the number again. |
| L8 | The Plan adjustments card lists only what the plan can read, ignores hand-edited junk without crashing, and "Put them all back" empties the list and returns the item to its original time. |
| L9 | An answer that can reach nothing is refused with a reason and writes no adjustment; "Fewer resets" writes a movement adjustment and leaves the job's activity level alone. |
| L10 | Six nights averaging about 5.4 hours against a 7.5-hour goal offer the change, naming both figures. Applying it moves the goal to 5.5 and moves the sleep item from 3:00 PM to 1:00 PM. |
| L11 | A refused band is remembered, and after a reload the card offers the next suggestion instead of the same one. |
| L12 | After applying a change that moves the wake boundary by two hours, the night's name never walks backward and the archive gains no duplicate. |

L2, L7 and L11 are the checks that make the suite capable of failing. Each one
goes red under a "fix" that does the right thing unconditionally — a stretch rule
that never breaks, an adjustment that moves every time it is pressed, a proposal
that always asks.

Phase 3's 15 checks in `drive-history.mjs` and Phase 4's 6 in
`drive-plan-state.mjs` were kept green throughout as the **regression gate** — a
fixed set of checks that must not move, to prove nothing else broke. Two
assertions inside `drive-plan-state.mjs` did have to change, and the reason is the
phase working: those checks roll the night, the roll writes a record, and from
that instant the archive says night two — which takes 15 minutes off the movement
gap and fits one more reminder into the shift. The plan they count afterwards is
21 items, not 20.

---

## Mutation testing

A test that passes tells you nothing until you know it is capable of failing. So
after everything was green, each new piece of logic was deliberately broken, the
checks were re-run to confirm the *right* one went red, and the break was undone.
That is mutation testing, and it is the strongest evidence in this phase — a check
that cannot fail is not a check, it is decoration that reports success no matter
what the code does.

Seventeen breaks, seventeen runs, all observed:

| Break | Result |
|---|---|
| Stop bridging a single missing night | One unit test red: "bridges one missing night without counting it". Nothing else moved. |
| Make the quiz seed permanent, so a measured break never kills it | One unit test red: "ends the stretch on two missing nights, and kills the seed with it". |
| Drop the cap on the seed | One unit test red: "clamps a seed the quiz could never have produced". A hand-edited answer of 999 would otherwise make every night night one thousand. |
| Stop counting the stretch at all | Browser checks **8/12** — L1, L3, L4 and L5 red, every line on screen reading "Night 1". L2 stays green, because L2 is the check that expects night one. |
| Stop stripping the count before the save | **11/12** — L5 red on the saved file gaining the key. |
| Stop stripping it before the export only | **11/12** — L5 red on the *exported* file alone, while the saved file stays clean. That is what proves the two exits are checked separately rather than together. |
| Put the old quiz-answer-only precedence back | 6 unit tests red, and **8/12** browser checks. |
| Step the adjustment each time instead of setting it from the default | 8 unit tests red — including "is idempotent: the same answer twice is the same number" — and **9/12**, with L6, L7 and L9 red. |
| Delete one of the two refusals | One unit test red: "refuses More rest on a profile that cannot nap, and says why". **11/12**, L9 red — the app wrote a rest adjustment on a profile that cannot nap. |
| Put the caffeine-sensitivity overwrite back | **9/12** — L6 red on the quiz answer having changed, with L7 and L9 red as collateral, because the second write clobbers the adjustment the first one made. |
| Break the value guard, so a hand-edited setting is trusted as a number | The most instructive break in the phase. With a hand-edited movement setting of `"x"`, the new value computes as `NaN` — literally "not a number" — and the shift it produces contains **zero movement reminders**, under a message reading "A reset every NaN minutes now." Measured directly: 0 reminders and a 17-item plan, against 3 reminders and a value of 150 with the guard in place. |
| Drop the number filter from the Plan adjustments card | **11/12** — L8 red, with the junk entry rendered on screen as "NaN minutes". |
| Drop the name filter from the same card | **The run does not finish at all.** The profile sheet white-screens — the app crashes trying to read a label for a name it does not know — so the card and its undo button never appear, and the driver dies at L8 after waiting 30 seconds for a button that is not there. Exactly the failure the filter exists to prevent, reproduced on demand. |
| Break the blanket undo, so it puts nothing back | **11/12** — L8 red on the list still being full and the card still on screen. |
| Forget the refused sleep band | 2 unit tests red, and **11/12** with L11 red: the app asked again. |
| Drop the ability to record a refusal at all | One unit test red, and **11/12** with L11 red on nothing being saved. |
| Drift the sleep bands away from the plan's own bands | 6 unit tests red, starting with the band no longer being its own value, and **9/12** with L10, L11 and L12 all red. This is the one that proves the proposal and the plan's description read the *same* definition, rather than two copies that happen to agree today. |

Every break produced a red check, every red check was the intended one or better,
and every break was reverted. The working tree was confirmed clean afterwards.

---

## What passed, and what failed

Everything passes. All four commands, run from the repo root against the dev
server on `http://localhost:5174/`:

```
$ npm test

 Test Files  6 passed (6)
      Tests  146 passed (146)
```

```
$ node drive-loop.mjs

12/12 passed
```

```
$ node drive-history.mjs

15/15 passed
```

```
$ node drive-plan-state.mjs

6/6 passed
```

| Suite | Result |
|---|---|
| Unit tests (`npm test`) | 146 of 146 passed (96 at the start of the phase) |
| Phase 5 browser checks (`node drive-loop.mjs`) | 12 of 12 passed |
| Phase 3 browser checks (`node drive-history.mjs`) | 15 of 15 passed |
| Phase 4 browser checks (`node drive-plan-state.mjs`) | 6 of 6 passed |

Nothing failed. What follows is the more useful list: things known to be thin or
wrong, that were found, and that were deliberately left alone.

- **The one-night bridge is a judgement call, not a measurement.** One missing
  night is forgiven and two are not, argued from how rosters usually hand out
  nights off — two or more together — rather than from any data. Left because
  there is no archive of real users to measure yet. The thing to look at when
  there is one is the distribution of gap lengths: mostly one-night gaps means
  people forget to log, mostly two- and three-night gaps means those are real
  nights off, and either reading is what should decide the proper fix.
- **Two or more unlogged nights inside a real stretch still reset the count to
  1.** Someone five nights deep who missed two of them gets night one's plan,
  with the caffeine cutoff an hour later than it should be. Left because the
  measured break has to win over a guess; the recourse is that both numbers it
  moves are adjustable by name, with a preview and a reset.
- **The app cannot tell a night off from a night you forgot to log.** They are
  the same thing in the archive: nothing. The eventual fix is a `workDays` list —
  telling the app which nights you are rostered on — and it is deliberately
  deferred. It was named as the answer two phases ago with a condition attached:
  build it when the archive shows enough unlogged nights to distort a real number.
  That condition still is not met, and this phase decided what a gap means
  *without* it on purpose.
- **A night off on which you logged anything counts as a worked night.** Requiring
  proof of a shift was considered and rejected: most people never tap the button
  that would provide it, so the strict rule would undercount, and undercounting is
  the direction that removes protection from someone who is genuinely tired.
- **The count reads one low across a bridged night.** It only matters when it
  lands exactly on 2, 3 or 4, which are the only thresholds the plan reads.
- **A night folded when the app first starts is still folded at the seed's
  count.** The one place the app files a finished night away on boot runs before
  the counting exists, so it uses the quiz answer. This was inherited from an
  earlier phase and is one field wider now. Left because the obvious fix is to
  save the count, and saving the count is the exact failure this part of the phase
  exists to delete.
- **An adjustment outlives the reason it was written.** Asking for an earlier
  caffeine cutoff on night 3 sets a number that already includes the stretch's own
  hour, and it stays after the stretch ends. It is visible in the new card and
  undone in two taps. Left because an adjustment with an expiry date is a new
  concept, and nothing else in the app has one.
- **A hand-edited saved file is still not validated.** Nothing the app writes can
  produce a broken one, but a person editing it by hand can. This phase hardened
  the three specific places where hand-edited garbage would have reached a real
  plan number — the stretch seed is capped, the adjustment floor must be a real
  number, and the new card filters what it lists — but the file as a whole is
  still taken on trust. That is a validation project no phase has wanted to start.
- **The one new saved field is unvalidated too**, in the same way. A hand-edited
  value there can only suppress a proposal, or fail to.
- **The caffeine cutoff does not explain on screen why it moved by an hour.** The
  Plan tab now says which night of your stretch it is, and the fatigue check-in
  explains its own weighting by the number, but the item that actually changed
  carries no reason. Left because writing that line means editing the plan
  generator, which this phase was explicitly not allowed to touch.
- **Applying the sleep goal can merge two nights into one record**, if the new
  wake time moves backward across the current clock. That is a cost an earlier
  phase accepted deliberately — a merged night reads long, where a duplicated
  night is wrong twice over and invisible — but it is now reachable from a button
  rather than only from the shift-time screen.
- **A hand-edited archive is still tolerated rather than checked.** The counting
  function drops garbage rows without crashing, which is one function's worth of
  hardening against a ceiling that stands unchanged.
- **The demo mode shows the real stretch count, not a fabricated one.** The 45
  sample nights behind `?seed` live somewhere the counting function does not read.
  That is deliberate: a fabricated stretch would move a real caffeine cutoff.
- **Nights whose sleep you estimated count toward the average** the sleep
  proposal is built on. That is on purpose: it is the same self-report the quiz
  took once, taken nightly instead, which is better evidence rather than worse.
  Left because splitting it means keeping a second average nobody asked for.
- **The reflection's change lands now, although the question says "next
  shift".** It is also true of the next shift. Deferring it would mean storing a
  pending change and inventing a second moment to apply it, for one word of copy.

Also deliberately skipped, and worth naming so nobody reads them as oversights: a
control for editing the stretch by hand (the two numbers it would move are already
adjustable by name, and any such control would have to be an adjustment that
expires, which nothing else does); a record of *who* set each adjustment, the app
or the user (it buys nothing at the moment of undoing one); a per-row undo in the
new card (the adjustment sheet already has one, three taps away); an expiry date
for adjustments; averaging over nights elapsed rather than nights logged (an
earlier phase already answered that with the day window); putting the nine
unrendered pattern sentences on screen, including the one that restates the sleep
average the Dashboard already draws; a shared harness for the three browser
drivers; and an import path, retention limits and schema validation for the saved
file — all still standing, all still somebody else's phase.

---

## What's next

`docs/implementation-roadmap.md` has one phase left. **Phase 6** is traceability:
one citation field on every plan item, and a test that fails the build when an
item does not have one. It is what makes the paper's central methodological claim
true of the running system. It depends on nothing and can land whenever.
