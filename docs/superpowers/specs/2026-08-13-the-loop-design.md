# Phase 5 — The loop

The first phase that changes what the plan tells a shift worker to do.

Three inputs stop being what the user typed once and start being what the app
measured: the night of the stretch, the one adjustable answer in the reflection,
and the sleep goal the whole plan is built backward from.

Spec for Phase 5 of `docs/implementation-roadmap.md`. Builds on Phase 0
(`2026-08-11-night-identity-design.md`), which names the night, Phase 1
(`2026-08-12-persistence-design.md`), which stores it, Phase 2
(`2026-08-12-rollover-design.md`), which fills the archive, Phase 3
(`2026-08-13-real-history-design.md`), which reads it, and Phase 4
(`2026-08-13-plan-live-state-design.md`), which keeps it honest across a
boundary. **`generateTimeline` does not change; its signature stays
`(profile, logs, now)`.** Everything below works by changing its inputs.

Three parts, in this order, because the first one is the one that moves a real
caffeine cutoff by an hour and the other two are built on the same rule about
what the app is allowed to change without asking:

1. The stretch counts itself, and the quiz answer becomes its seed.
2. The reflection's one adjustable answer writes an override instead of a quiz
   answer.
3. The sleep goal is proposed, once, and a refusal sticks.

---

## The problem, stated from the code

### `nightInStretch` is asked once and is then unreachable forever

```js
/* Nights already worked in this run. Profiles saved before this field existed
   read as night one, which is the same plan they got before. */
export const stretchNight = (profile) => profile.nightInStretch ?? 1;
```

`planner.js:53`. It drives three real behaviours: `caffeineHours` adds an hour
from night 3 (`:58`), `movementInterval` takes 15 minutes off the reset gap from
night 2 and 30 from night 4 (`:81`), and the fatigue check-in is weighted and
explains itself by the number (`:421`, `:434`).

The roadmap says the input "depends on the user remembering". It is worse than
that. `nightInStretch` is written in exactly one place — `finishQuiz`
(`App.jsx:2462`), from the question at `App.jsx:454` — and **nothing writes it
again.** It is not in `REVIEW` (`App.jsx:617`), not in the profile sheet, not in
the adjust sheet. Whatever a user answered on the day they installed the app is
the night the plan believes it is, permanently. The default is `1`, so in
practice every user is on night one forever, and the two rules above have never
fired for anyone who did not answer the quiz question with a lie that happens to
be true later.

So the bar this phase has to clear is not "a derived count is better than a
remembered one". It is "a derived count that is wrong sometimes is better than a
frozen one that is wrong every night after the first". That is a low bar, and it
is worth saying out loud before designing around edge cases.

### The reflection's answer does not go nowhere. It goes somewhere worse

```js
if (reflection.adjust === "Earlier caffeine cutoff") {
  setProfile({ ...profile, caffeineSensitivity: "high" });
  say("Caffeine cutoff moved earlier for the next shift.");
} else if (reflection.adjust === "Fewer resets") {
  setProfile({ ...profile, movement: "active" });
  say("Resets spaced further apart for the next shift.");
} else say("Saved. The next plan will use this.");
```

`App.jsx:1462`. The roadmap describes this answer as going nowhere. Two of its
four options go somewhere, and both of them **overwrite a quiz answer about the
user's body or their job**:

- `caffeineSensitivity: "high"` is the answer to "How sensitive are you to
  caffeine?". It moves `caffeineHours` from 6 to 8 — a **two-hour** move, not the
  hour the toast implies — and it is the value `REVIEW`'s caffeine segment shows
  back to the user as something they said.
- `movement: "active"` is the answer to "How freely can you move during your
  shift?", and "active" means *up and moving most of the shift*. One reflection
  answer about wanting fewer prompts rewrites a statement of fact about the job:
  the reset gap goes 90 → 150, `micro` flips to false, the movement segment of
  "Why this plan" changes, and `readPatterns`'s movement branch changes what it
  is allowed to say.

Neither is recorded as an adjustment anywhere, and the only way back is to
notice the quiz answer changed and change it again. `overrides` — the map that
exists for exactly this, that `ADJUSTABLE` describes, that the adjust sheet
already renders with a reset button, and that has persisted since Phase 1 — is
untouched by this code path.

"More rest" does nothing at all.

### The sleep goal is a quiz bucket that the archive has been contradicting in silence

`sleepGoalHours` is one of four bucket values (4.5, 5.5, 7.5, 9.5;
`App.jsx:446`). It sets `sleepEnd` (`planner.js:17`), which is the **night
boundary itself** (`time.js:58`), plus the caffeine bump under five hours, the
pre-shift nap under six, the `risky` weighting, the whole `planSummary` band, and
the Dashboard's hero denominator.

`rangeStats` has computed `avgSleep` from the archive since before Phase 3
(`stats.js:148`), and the Dashboard already draws it directly against the goal —
`8.1h / 7.5h goal` with a meter. The disagreement is already on screen as two
numbers side by side. What the app does about it is nothing.

---

## Part 1 — The stretch counts itself

### What a gap means

An off-night and a night you forgot to open the app are the same event in the
archive: no record, and a hole in the id sequence. Phase 0 deferred this and
named the eventual answer (one `workDays` array on the profile, set in the quiz)
and the condition for building it: *only when the archive shows enough unlogged
nights to distort a real number.* That condition is not met, and there is still
no archive of real users to measure. So this phase decides the meaning of a gap
by its consequences rather than by its truth.

**The rule: one missing night does not break a stretch. Two do.**

Both directions of error are real, and they are not symmetric:

| | The rule is wrong because | What the plan does |
|---|---|---|
| Undercount | a worked night was not logged | Caffeine cutoff an hour **later** than the stretch calls for, resets 15–30 minutes further apart, check-in not weighted |
| Overcount | a night off was counted | Cutoff an hour earlier, resets tighter |

Undercounting removes protection from someone who is four nights deep.
Overcounting asks a rested person to stop caffeine early. The house rule for this
phase is to fail toward the user's stated intent, and the stated intent of
someone who has opened this app at all is to be protected on a stretch — so the
bridge goes to the side that keeps counting.

The bridge also fits the shape of the data rather than a preference. Rosters
give two or more nights off together; a single night off inside a stretch is
rare. A single missing night in the middle of a run is far more likely to be a
night nobody opened the app — and the most common instance of it is the very
first one, last night, which Phase 2 already declines to archive when nothing was
logged.

And the error is bounded where it matters. The plan reads the number at three
thresholds only — 2, 3 and 4-or-more. A count that is one low across a bridged
night changes nothing at 5→4 or 6→5; it changes something only when it lands
exactly on a boundary.

### The rule, as code

`src/stats.js`, next to the other functions that read NightRecords:

```js
/** Which night of the current stretch tonight is, counted back from tonight.
    One night with no record is bridged, two end the run. The quiz answer seeds
    the nights that were already behind you when the archive starts, and counts
    only while `n - 1 === back.size` — true exactly while the walk has absorbed
    every record, which is to say while no break has ever been measured.
    Offsets rather than ids so the only date maths is daysBetween: a hand-edited
    id gives NaN and fails `> 0`, a duplicate lands in one Set slot, and a
    future-dated record is excluded by the comparison the day strip already uses.
    ponytail: the bridge is an unmeasured heuristic, argued in the spec from
    rosters. Upgrade path is `workDays`, once a real archive shows the
    distribution of gap lengths. */
export function countStretch(archive, tonight, seed) {
  const back = new Set(
    (archive || []).map((r) => daysBetween(tonight, r.id)).filter((d) => d > 0)
  );
  const first = Math.min(4, Math.max(1, Math.round(seed) || 1));

  let n = 1, miss = 0, d = 1;
  while (miss < 2) { if (back.has(d)) { n += 1; miss = 0; } else miss += 1; d += 1; }

  return n + (n - 1 === back.size ? first - 1 : 0);
}
```

The loop terminates without a cap: past the oldest record every step is a miss,
so the second one always arrives. `first` is clamped to the range the quiz can
express, because it comes off a profile that a hand-edited blob can write
anything into and an unclamped seed of 999 makes every night night one thousand.
The `|| 1` in the same expression is the other half of that boundary: `NaN` from
a missing or unparseable seed is falsy, and so is the 0 that is not a night.

### Why the quiz answer is a seed and not a fallback

The obvious cheap version is: use the derived count when the archive has
something, and the quiz answer when it does not. It is wrong on the second day,
which is the worst possible day for it to be wrong.

A user installs the app on night three of a stretch and answers "Third night".
Tonight reads 3. Tomorrow the archive holds one record, the derived count says 2,
and **the number goes down while the stretch goes up** — the plan relaxes the
caffeine cutoff by an hour on night four of a stretch. A user watching the app
learn would see it count 3, 2, 3, 4.

Seeding fixes that for one expression. The seed is not "the value to use when
there is no data", it is "how many nights of this stretch were already behind you
before the archive starts". Adding `first - 1` to the walk gives 3, 4, 5, 6.

And it expires correctly. The seed applies only while the walk absorbs the whole
archive — that is, while the archive is one unbroken (bridged) run reaching back
to its own beginning. The first measured break makes `n - 1 === back.size` false
forever, and from then on the count is the archive's alone. A user who takes two
nights off in week one never sees their install-day answer again.

### Where the derived count lives

`generateTimeline(profile, logs, now)` cannot see the archive and is not going
to be given it. So the count has to arrive on the profile, and the app builds a
second profile for planning:

```js
/* What the archive says tonight is. Derived on every render, never stored:
   `stretch` beats `nightInStretch` in stretchNight, so a stored copy would be
   read back by the one fold that does not go through this memo (forNight on
   boot) and inherited by every future reader as a number nobody counted. */
const planProfile = useMemo(
  () => (profile ? { ...profile, stretch: countStretch(archive, nightRef.current, profile.nightInStretch) } : null),
  [profile, archive, now]
);
```

`now` is in the dependency list for the same reason the `history` memo has it
(`App.jsx:2434`): `nightRef.current` is not reactive, and a boundary can pass
with nothing logged, at which point the count must go up by one with nothing else
in the list moving. The tick is the only thing that fires there.

The planner's one change is the precedence line:

```js
/* Counted, else told, else one. `stretch` is what the archive counted tonight
   and is never stored; `nightInStretch` is the quiz's seed and is. */
export const stretchNight = (p) => p.stretch ?? p.nightInStretch ?? 1;
```

`baseProfile` strips `overrides` and keeps `stretch`, which is correct and
load-bearing: the "default" the adjust sheet offers to return to is the plan's
own default *for tonight*, stretch included. An explicit `overrides.caffeineHours`
still wins over both, which is the right precedence — the user's own number beats
a derived one.

**Everything in the render tree gets `planProfile`.** Concretely, every place
`App.jsx` currently passes or uses `profile` except the two writes below: the
`plan` and `advice` memos (`:2418`, `:2422`), the `history` memo's `foldNight`
(`:2444`), the tick's `archived` call (`:2394`), and the `Dashboard`, `PlanTab`,
`LogTab`, `LiveTab`, `AdjustSheet` and `ProfileSheet` props.

Not a subset: `PlanTab`
computes `movementInterval(profile)` for the recurring card's "every N minutes"
(`App.jsx:1420`), `Dashboard` hands the profile to `readPatterns`, whose caffeine
adjustment computes `caffeineHours(pr) + 1`, and both of those disagree with the
plan on screen if they are handed a profile that says night one while the plan
was built for night four. A rule with exceptions is a rule somebody gets wrong at
3am; the rule is *the app plans, renders and folds with `planProfile`.*

### The one guard: the count never reaches disk

The cost of that rule is that `setProfile` bases are now planProfile-derived, so
a `stretch` key can ride into profile state and out to `gy.v1`. One expression,
at the two places that leave the app:

```js
/* The counted night is not something the user told the app, so it is not
   something the app keeps. undefined is dropped by JSON.stringify, so this is
   the whole guard. */
const stored = ({ stretch, ...p }) => p;
```

Declared beside the memo, and used by the write effect (`App.jsx:2380`) and by
`exportData` (`:2584`) — the only two paths out of the app. This is
the trust boundary, not tidiness: a stored `stretch` is read back by
`forNight` → `archived` → `foldNight` on boot, which is the one fold that never
sees the memo, and it would be inherited by any future reader as ground truth.

### Where the user sees it, and what they do when it is wrong

One interpolation, in the card that already exists to explain the plan
(`App.jsx:1392`, whose sub-line is `planSummary(profile).type`):

```jsx
{planSummary(profile).type} · Night {stretchNight(profile)} of your stretch
```

That is the whole UI. It reads "Steady rhythm plan · Night 4 of your stretch",
it is on the Plan tab above the plan it describes, and on night one it tells the
user the app is counting at all.

**No stretch editor.** It looked obligatory and it is not. When the count is
wrong — the archive says night one because the user worked three nights without
opening the app — the two numbers it would have moved are already adjustable, by
name, with a live preview and a reset: `caffeineHours` on `caff-window` and
`caff-cutoff`, and `moveGap` on every `move-N` and on the recurring card. A
stretch control would be a third way to reach the same two numbers, and it would
have to be an override, and an override on the stretch is exactly the frozen
number this part exists to delete — it would have to expire at the rollover,
which no other override does.

The seed is deliberately left in the quiz and only in the quiz. It is live for
one stretch and inert after the first measured break, so a settings control for
it would be dead UI within a week. Its `help` line changes to say so:

> "Just tonight. After this the app counts it from the nights you log."

---

## Part 2 — The reflection writes an override

### The mapping

`REFLECT_QS`'s last question offers four answers (`App.jsx:1446`). Read against
`ADJUSTABLE` (`planner.js:92`), three map onto a parameter and one does not need
to:

| Answer | Key | Value | Clean? |
|---|---|---|---|
| Earlier caffeine cutoff | `caffeineHours` | `caffeineHours(baseProfile(p)) + 1` | Conditionally. Same key and the same +1 the Dashboard's own caffeine adjustment already writes (`stats.js:316`), but there is no cutoff to move on a `caffeine: "none"` profile. See below |
| Fewer resets | `moveGap` | `movementInterval(baseProfile(p)) + 30` | Nearly. "Fewer" is spacing, not length — `moveLength` is the other reading, and the Dashboard already uses that one for *skipped* resets. Spacing is what the words say |
| More rest | `restLength` | `30` | Conditionally. See below |
| Nothing | — | — | — |

Both derived values are clamped to `ADJUSTABLE[key].max`. `caffeineHours` needs
it: high sensitivity plus short sleep plus a deep stretch is already 10, and +1
would leave the range the adjust sheet's slider can express.

**Two of the three only map for a profile the number can reach.** `restLength`
feeds `pre-nap` (which needs `nap` to be `before` or `both`) and `deep-rest`
(whose message only uses the number when `canNapDuring && !s.napFailed`). For
`nap: "none"` the deep-night item is a fixed "close your eyes for five minutes"
and the number changes nothing on screen. `caffeineHours` is the same shape one
answer over: `calculateCaffeineCutoff` returns null for `caffeine: "none"`, so
`caff-window` and `caff-cutoff` are both absent and nothing reads the hours at
all — and the reflection offers "Earlier caffeine cutoff" to every profile,
including that one. Writing either override anyway would set a value the plan
never reads and toast a change that did not happen — which is the same lie Phase
2 refused when it declined to say "last night is saved" for a night nobody
logged. So both are refused out loud:

> "You said naps are not possible, so the plan keeps rest short and quiet
> instead."

> "Caffeine is already off your plan, so there is nothing to move earlier."

`+30` on the reset gap rather than `+15`: one step of 15 removes at most one
reset from a whole shift, which reads as nothing happening and gets asked again
tomorrow. The reflection is a once-a-night control, not a slider. `restLength`
at a flat 30 rather than a step: 30 is the ceiling the `deep-rest` item's own
`why` already names ("past roughly half an hour you risk waking from deeper
sleep"), so it is the most rest the plan is willing to recommend, not a number
picked to be a number.

### Set, not increment

Every value above is *set from the plan's own default*, never incremented from
the current one, and never moved backward:

```js
/* What the reflection's one adjustable answer means, in plan numbers. Set from
   the plan's own default rather than stepped from the current value, so
   pressing Save twice does not move it twice and answering the same thing on
   four nights running does not walk the caffeine cutoff off the end of the
   scale. `no` returns the sentence to say instead, for the profiles on which
   the number would reach no item. */
const REFLECTION_ADJUST = {
  "Earlier caffeine cutoff": {
    key: "caffeineHours",
    to: (p) => caffeineHours(baseProfile(p)) + 1,
    say: (v) => `Caffeine now stops ${v} hours before sleep.`,
    no: (p) => p.caffeine === "none" && "Caffeine is already off your plan, so there is nothing to move earlier.",
  },
  "Fewer resets": {
    key: "moveGap",
    to: (p) => movementInterval(baseProfile(p)) + 30,
    say: (v) => `A reset every ${v} minutes now.`,
  },
  "More rest": {
    key: "restLength",
    to: () => 30,
    say: (v) => `Rest blocks are now ${v} minutes.`,
    no: (p) => p.nap === "none" && "You said naps are not possible, so the plan keeps rest short and quiet instead.",
  },
};

/** { key, value, msg } to apply, { key: null, msg } to explain, or null. */
export function reflectionAdjust(profile, answer) {
  const a = REFLECTION_ADJUST[answer];
  if (!a) return null;
  const no = a.no && a.no(profile);
  if (no) return { key: null, msg: no };
  /* Only an existing NUMERIC override holds the floor. Not the derived default:
     that would need restLength's per-item defaults (25, 20 or 15) to collapse
     into one number, and there is no honest one. Not `cur ?? -Infinity` either:
     `overrides` comes off a hand-editable blob, Math.max("x", 150) is NaN, ov()
     hands NaN to the planner as a real value, and a NaN reset gap emits zero
     movement resets for the whole shift.
     One Math.max covers all three because all three ask for a larger number —
     stop caffeine earlier, wait longer between resets, rest longer. An answer
     that asked for a smaller one would silently no-op here. */
  const cur = (profile.overrides || {})[a.key];
  const value = Math.min(
    ADJUSTABLE[a.key].max,
    Math.max(Number.isFinite(cur) ? cur : -Infinity, a.to(profile))
  );
  return { key: a.key, value, msg: value === cur ? "That is already where your plan is." : a.say(value) };
}
```

In `planner.js`, beside `ADJUSTABLE` and `ov`, because it is made of exactly
those two plus `caffeineHours`, `movementInterval` and `baseProfile` — and
because a table in `App.jsx` cannot be unit-tested (`App.jsx` reads `location`
at module scope and does not import under `environment: "node"`).

The call site replaces the two stomps entirely:

```js
<Btn T={T} full onClick={() => {
  if (reflection.slept === "Under 5h" || reflection.rested === "Not at all") push("sleepQuality", "poor");
  const r = reflectionAdjust(profile, reflection.adjust);
  if (!r) { say("Saved. The next plan will use this."); return; }
  if (r.key) setProfile({ ...profile, overrides: { ...(profile.overrides || {}), [r.key]: r.value } });
  say(r.msg);
}}>Save reflection</Btn>
```

`caffeineSensitivity` and `movement` are never written here again. That deletion
is the point of Part 2; the override is what replaces it.

`msg` names the resulting number rather than the direction — "Caffeine now stops
7 hours before sleep.", "A reset every 120 minutes now.", "Rest blocks are now 30
minutes." — and when the value does not move, it says so: "That is already where
your plan is." A toast that claims a change is the only thing the user sees at
the moment it happens, so it is the one place the number has to be true.

### The receipt

An override the user cannot see or undo is a trap, and this phase adds a second
writer of them (the reflection) beside the two that already exist (the adjust
sheet and the Dashboard's adjustment card). They need one place that lists them.

The adjust sheet is not that place, and this is a fact about the plan rather
than a preference: it reaches a key only through a plan item that carries it in
`adjust`, and several of those items are conditional. `restLength` has no item on
a profile with neither a pre-shift nap nor a deep-night window; `waterGap` and
`eyeBreakSecs` belong to reactive inserts that exist only while the app is
nudging about them. So an override can be live, changing the plan, and
unreachable from every screen — which is the trap, not a hypothetical one.

One card in the profile sheet, under its own `Eyebrow`, directly after the "Your
setup" rows:

```jsx
<Eyebrow T={T}>Plan adjustments</Eyebrow>
<Card T={T} style={{ marginBottom: 8, padding: 16 }}>
  {set.map(([k, v], i) => (
    <div key={k} style={{ display: "flex", alignItems: "baseline", gap: 11, padding: "10px 0",
      borderTop: i === 0 ? "none" : `1px solid ${T.hair}` }}>
      <span style={{ flex: 1, … }}>{ADJUSTABLE[k].l}</span>
      <span style={{ fontWeight: 600, … }}>{ADJUSTABLE[k].decimals ? v.toFixed(1) : Math.round(v)} {ADJUSTABLE[k].unit}</span>
    </div>
  ))}
  <Btn T={T} kind="quiet" full style={{ marginTop: 12 }}
    onClick={() => { setProfile({ ...profile, overrides: {} }); say("Back to the plan's own timing."); }}>
    <ArrowCounterClockwise size={15} /> Put them all back
  </Btn>
</Card>
```

Every piece of that already exists in this file: the row shape is the reminders
list's (`App.jsx:1923`), the button is the adjust sheet's reset
(`App.jsx:2255`), the icon is already imported, `ADJUSTABLE` carries the label,
the unit and the decimals. No new component, no new token.

```js
const set = Object.entries(profile.overrides || {}).filter(([k, v]) => ADJUSTABLE[k] && typeof v === "number");
```

The filter is the validation, not a formality: `overrides` comes off a
hand-editable blob, `ADJUSTABLE[k].l` on an unknown key is a white screen inside
the profile sheet, and a non-number would render as `NaN`. When `set` is empty
the whole block is absent — a card explaining that nothing has been adjusted is
noise on a screen that is already long.

**Per-key undo stays in the adjust sheet**, which already offers it with a live
preview of where the item moves ("Back to the default of 6.0", and Reset). This
card is the index and the blanket undo; duplicating a per-row reset would be a
second implementation of an affordance that exists three taps away.

**No provenance.** Recording which overrides the app wrote and which the user
wrote costs a parallel map on the profile forever, and buys nothing at the moment
of reversal — the user does not need to know who set a number to put it back. The
app announces every override it writes with a toast at the moment it writes it,
and this card is the standing receipt.

---

## Part 3 — The sleep goal

### Not silently

`sleepGoalHours` is not a preference the app may quietly correct. Three reasons,
in the order that decides it:

- **It moves the night boundary.** `sleepEnd = sleepStart + sleepGoalHours * 60`
  (`planner.js:17`) and `nightOf` rolls the night at `sleepEnd` (`time.js:58`).
  Changing it silently changes what time the user's night ends, which archives a
  record and clears the plan at a different hour than yesterday, with no cause
  the user can see. It is also the field the adopt effect watches
  (`App.jsx:2369`), so it is already known to be dangerous to move.
- **It is a number the user typed**, and the app's own copy says the plan is "a
  proposal, not an instruction" (`App.jsx:2020`).
- **It rewrites the whole explanation.** `planSummary` bands off it, so a silent
  change silently retitles "Why this plan".

Nagging is the other failure, and it is worse than doing nothing, because the
card that would do the nagging is on the screen the user opens first.

### Proposed through the mechanism that already proposes

`readPatterns` already returns `adjustment` — `{ text, apply, done }` — and the
Dashboard already renders it as a card with **Apply to next plan** and **Keep
current** (`Dashboard.jsx:417`). The sleep goal becomes the first branch of that
chain, ahead of the caffeine one, because every other adjustment in the list is
computed against a sleep window that this one moves.

```js
const band = st.avgSleep === null ? null : sleepBand(st.avgSleep);
if (st.n >= MIN_TREND && band !== null && band !== profile.sleepGoalHours
    && band !== profile.sleepGoalAsked) {
  adjustment = {
    text: `Your last ${st.n} nights average ${st.avgSleep.toFixed(1)}h, against the ${profile.sleepGoalHours}h you set. The plan can work backward from ${band}h instead.`,
    apply: (pr) => ({ ...pr, sleepGoalHours: band }),
    decline: (pr) => ({ ...pr, sleepGoalAsked: band }),
    done: `Sleep goal set to ${band}h. The plan is rebuilt around it.`,
  };
}
```

The text names both numbers and the count behind them. Nothing about this is
silent, and nothing about it happens without a tap.

### The gate is a band change, not a threshold

```js
/** The four values the quiz can express, and the cuts planSummary already bands
    on. sleepBand(x) === x for each of them, which is what makes
    `sleepBand(avg) !== goal` a complete trigger with no tolerance to tune. */
export const sleepBand = (h) => (h <= 5 ? 4.5 : h <= 6.5 ? 5.5 : h <= 9 ? 7.5 : 9.5);
```

No new threshold is invented. `MIN_TREND` (5) is the number `readPatterns`
already uses to decide whether it may claim a relationship at all, and the cuts
are `planSummary`'s own (`App.jsx:861`) — which stops using its four inline
comparisons and reads the band from this function instead
(`{ 4.5: "under5", 5.5: "s56", 7.5: "s79", 9.5: "over9" }[sleepBand(h)]` over the
four objects it already returns), so the two cannot drift. The band is what carries the meaning: crossing one changes the plan type,
where 0.3h of wobble does not, and the four values are what the quiz and the
sleep-time sheet already offer as pills (`App.jsx:2765`).

The proposal is symmetric. Someone who said "Under 5 hours" and has been getting
six is offered 5.5, which *reduces* protection — and that is right, because it is
five nights of measurement against one bucket picked before there was any, and
it is still a proposal with a Keep current beside it.

### The refusal sticks

"Keep current" is a toast and nothing else today, for every branch. That is
survivable for the five behavioural adjustments, which change as the data
changes. It is not survivable for this one: the disagreement between a quiz
bucket and a real average persists for months, so the same card would ask the
same question every time the Dashboard is opened, forever. That is the nagging
the phase is supposed to avoid.

`adjustment` gains an optional `decline`, the Dashboard calls it when present,
and the sleep branch is the only thing that sets one:

```jsx
<Btn T={T} kind="quiet" … onClick={() => {
  if (pat.adjustment.decline) setProfile(pat.adjustment.decline(profile));
  say("Keeping your current plan.");
}}>Keep current</Btn>
```

`sleepGoalAsked` holds the band that was refused. It is a persisted field on the
profile, which Phase 4's rule permits precisely: *the blob stores what you told
the app, not where you were standing in it* — a refusal is something the user
told the app. It suppresses the proposal for that band only, so new evidence
pointing at a *different* band asks again, and applying makes the condition false
by itself with nothing to clear.

---

## Out of scope

- **`generateTimeline`, and the planner beyond two lines.** `stretchNight` gains
  its precedence clause and `reflectionAdjust` is added beside `ADJUSTABLE`.
  Nothing inside `generateTimeline` moves, including the `changed` line the
  caffeine cutoff still does not have (see *Skipped*).
- **`workDays`, off-night marking, a calendar.** Phase 0's named escalation, and
  its condition — an archive that shows unlogged nights distorting a real number
  — is still not met. This part decides what a gap means *without* it, on
  purpose.
- **Averages over nights elapsed rather than nights logged.** Phase 3 answered
  that with the day window, and `st.n` is already the count of nights logged.
- **A stretch editor, and `nightInStretch` in `REVIEW` or the profile sheet.**
  Part 1.
- **Provenance on `overrides`.** Part 2.
- **Rendering the nine unrendered `readPatterns` lines**, `sleepAvgLine`
  included. Phase 3 named them dead; the hero already shows the average against
  the goal, and a sentence restating it is not what this phase adds.
- **Deferring the reflection's override to the next shift.** Overrides have one
  apply moment, which is now.
- **Schema validation of `gy.v1`, an import path, retention, IndexedDB.** All
  still standing, all still somebody else's phase.

---

## Edge cases, and their answers

| Case | Answer |
|---|---|
| Day one, empty archive, quiz says "Third night" | The walk absorbs nothing, the seed applies, tonight is night 3 |
| Day two, one record | Walk absorbs it, still nothing contradicting the seed: night 4. The number goes up, which is the whole reason for the seed |
| Nothing logged last night, records the night before | Bridged: the run continues, the bridged night does not count. Reads one low, which the 2/3/4 thresholds absorb |
| Two nights with no record | The stretch ends. Tonight is night 1, and the seed is dead from here on |
| First open in a week, worked all week without the app | Night 1. Wrong, and unfixable without `workDays` — the recourse is `caffeineHours` and `moveGap`, both adjustable by name |
| A night off on which the user logged water | Counted as a worked night; the stretch reads one high. Named as a ceiling |
| A record dated in the future | Dropped by `d > 0`, the same guard the day strip uses. Reachable from a backward device clock |
| Two records with the same id | One Set slot. `n - 1 === back.size` still holds, because the size is of the deduped set |
| A hand-edited id with no zero padding | `daysBetween` returns NaN, `NaN > 0` is false, the record drops out. No throw |
| `nightInStretch: 999` in a hand-edited blob | Clamped to 4, the most the quiz can express |
| A boundary passes with nothing logged | `now` moves in the memo's dependency list, the count goes up by one, the archive does not grow — and the walk bridges the empty night |
| A user with an explicit `caffeineHours` override on night 3 | The override wins. `ov` is above the stretch by design: the user's own number beats a derived one |
| `?seed` | The 45 mock nights are in `history`, not in `archive`; `countStretch` reads `archive`, so the demo shows the real count. Deliberate — a fabricated stretch would move a real caffeine cutoff |
| "Save reflection" pressed twice with the same answer | The value is set, not stepped, so the second press is a no-op and the toast says "That is already where your plan is." |
| "Earlier caffeine cutoff" on four nights running | Sets the same value four times. The cutoff does not walk off the scale |
| A hand-tuned `caffeineHours: 9`, then "Earlier caffeine cutoff" | `Math.max` holds 9. The plan does not argue with a number the user set |
| "More rest" on a `nap: "none"` profile | No override, and a toast that says why |
| "Earlier caffeine cutoff" on a `caffeine: "none"` profile | The same refusal. There is no cutoff item on that plan, so the override would be unread and the toast untrue |
| An override for a key `ADJUSTABLE` does not know | Filtered out of the receipt card. It still reaches `ov`, which returns it unread by any item |
| Sleep proposal on 4 nights | Not offered. `MIN_TREND` is 5 |
| Every night's sleep estimated from the reflection bucket | Counted. It is the user's own nightly answer to the same question the quiz asked once, which is better evidence than the quiz, not worse. `BUCKET`'s four values (4.5, 5.5, 8, 9.5) all band to a quiz value, so someone answering "7–9h" every night is never asked to change a 7.5h goal |
| Apply raises the goal from 5.5h to 7.5h at 3am | `sleepEnd` moves two hours later, `nightOf` can therefore name an earlier night, and `forward` (`time.js:74`) refuses the backward step. The night runs long and merges — Phase 3's accepted cost, now reachable from a button |
| Keep current, then reload | `sleepGoalAsked` is in the blob; the card offers the next adjustment in the chain instead |
| Keep current, then the average moves to a different band | Asked again. That is new information, not a repeat |
| A blob written before this phase | No `stretch` (it was never stored), no `sleepGoalAsked` (undefined, so the proposal is live). Nothing to migrate |

---

## Traps

**Do not store the count.** It is the whole failure mode of the field it
replaces. `stored()` at the write and at the export is the guard, and it exists
because `planProfile` is passed to every component that calls `setProfile` —
`Dashboard`'s adjustment apply, the adjust sheet, the reflection, `Review`'s
draft, the profile sheet's name field. The rule is *plan with `planProfile`,
persist with `stored(profile)`*, and the second half is one expression in two
places rather than an audit of six call sites that has to be re-run every time
somebody adds a seventh.

**Do not give `PlanTab`, `Dashboard` or `foldNight` the stored profile "because
they only display".** They compute. `PlanTab` renders the reset gap from
`movementInterval(profile)`, `readPatterns` builds its caffeine adjustment from
`caffeineHours(pr) + 1`, and `foldNight` writes `moveTotal` and `cutoff` into
the record. Hand any of them the seed while the plan was built from the count and
the screen disagrees with itself by an hour.

**The tick's fold must use `planProfile` too** (`App.jsx:2394`). At the instant
of the roll, `nightRef.current` is still last night and the memo's count was
computed against it, so the closure captured for that tick holds the count *for
the night being folded*. That is the correct number, and it arrives for free
provided the effect closes over `planProfile` rather than `profile`.

**`boot`'s fold cannot have it.** `forNight` → `archived` → `foldNight` runs at
module scope with the stored profile and no memo, so a night folded on boot is
folded at the seed's count. That is Phase 2's "last night is folded against
tonight's profile" ceiling, one field wider. Do not fix it by storing the count.

**Do not increment from the current value in the reflection.** Two presses of a
button that is still on screen after it was pressed is not an edge case, it is a
tap. `Math.max(current, fromDefault)` is idempotent and monotone in the direction
asked; `current + 1` is a ratchet with a clamp for a ceiling.

**Do not put the sleep proposal anywhere but the existing adjustment card.** A
banner, a modal, or a line under the hero all become the nag. The card is a slot
that already exists, is already read as "the app's current suggestion", and
already has a decline button one tap away from the apply.

**`sleepBand` and `planSummary` must be one function's worth of cuts.** They are
two four-way splits over the same field, and if they drift the app proposes a
band whose plan type is not the one the copy describes. `planSummary` reads
`sleepBand`; the test below pins the four fixed points.

---

## Assumptions

Recorded because the human partner was unavailable and the roadmap left the
central question open. Each is the smallest choice consistent with what the repo
already does.

1. **One missing night is bridged, two end the stretch.** Reasoning in Part 1:
   the two error directions are not symmetric, and rosters do not hand out single
   nights off.
2. **A bridged night does not count toward the number.** The count names nights
   that are on record; bridging preserves the run without inventing a night.
3. **The quiz answer becomes a seed for the nights before the archive, and it
   applies only while nothing on record contradicts it.** Not a fallback for an
   empty archive — that version counts down on day two.
4. **The derived count rides on a new field, `stretch`, not on
   `nightInStretch`.** A leak of the derived value into the seed's own field
   would compound; a leak into `stretch` is overwritten by the memo on the next
   render.
5. **`planProfile` goes everywhere in the render tree, and the write is the only
   guard.** A uniform rule with one enforcement point, rather than a per-component
   judgement call.
6. **No stretch editor.** The two numbers it moves are already adjustable by
   name, and any control for it would have to be an override that expires, which
   nothing else in `overrides` does.
7. **The quiz question stays, with one line of new help text.** Deleting it costs
   correctness on the first night of a stretch that started before the install.
8. **The reflection sets from the plan's default and never moves a number
   backward.** Idempotent under a double tap, bounded under repetition, and it
   does not overrule a hand-tuned value.
9. **An answer whose number no item reads is refused rather than silently
   written** — "More rest" on `nap: "none"`, "Earlier caffeine cutoff" on
   `caffeine: "none"`. The toast is the only thing the user sees; it has to be
   true.
10. **The override lands immediately, though the question says "next shift".**
    It is also true of the next shift, and deferring it means a pending-change
    field and a second apply moment for one word of copy.
11. **The receipt is one card with one blanket undo.** Per-key reset already
    exists in the adjust sheet with a preview.
12. **The sleep goal is proposed first in the existing adjustment chain**, gated
    on `MIN_TREND` and a band change. No new threshold, no new screen.
13. **A refusal is persisted (`sleepGoalAsked`).** Phase 4's rule: a decision the
    user made is not a position they were standing in.
14. **Estimated sleep counts toward the average.** It is the same self-report as
    the quiz, taken nightly instead of once, and splitting the average would mean
    a second average nobody asked for.
15. **`planSummary` reads `sleepBand`.** The alternative is two hand-kept
    four-way splits, which Phase 3 has already had to name once as a ceiling
    (`materializeNights` and `foldNight`).

---

## How this gets tested

**Unit, `vitest`, `environment: "node"`, no render harness.** This phase adds
real pure logic, so unlike Phase 4 it is mostly covered here. The 96 existing
tests stay green and are the regression gate.

`src/stats.test.js` — `countStretch`

| Case | Expect |
|---|---|
| `countStretch([], "2026-08-13", 1)` | 1 — day one, first night |
| `countStretch([], "2026-08-13", 3)` | 3 — day one, installed mid-stretch |
| One record at offset 1, seed 3 | 4 — the seed carries; the day-two regression |
| Records at offsets 1, 2, 3, seed 1 | 4 |
| Records at offsets 1, 2, 3, seed 3 | 6 |
| Records at offsets 1 and 3, seed 1 | 3 — the single hole is bridged and does not count |
| Records at offsets 1 and 4, seed 3 | 2 — a two-night hole ends the stretch, and kills the seed |
| Records at offsets 3, 4, 5 | 1 — first open in three nights |
| A record at offset 0 | Ignored. Tonight is never in the archive |
| A record dated in the future (offset −2) | Ignored, and does not extend the run |
| Two records with the same id | Counted once, and the seed condition still holds |
| A record with `id: "not-a-date"` | Ignored, no throw |
| `seed: 999` | Clamped to 4 |
| `seed: undefined` / `seed: "x"` | Treated as 1 |
| `tonight: undefined` | Every offset is NaN, the walk is empty, the seed is returned |
| Ten consecutive records | 11 — uncapped |

`src/stats.test.js` — `sleepBand` and the proposal

| Case | Expect |
|---|---|
| `sleepBand` of each of 4.5, 5.5, 7.5, 9.5 | Itself. The fixed-point property the trigger depends on |
| `sleepBand(5.0)`, `(6.6)`, `(9.1)` | 4.5, 7.5, 9.5 — the cuts are `planSummary`'s |
| `readPatterns` at `MIN_TREND` nights averaging 5.4h against a 7.5h goal | `adjustment.apply` sets `sleepGoalHours: 5.5`, and `text` names both numbers and the night count |
| The same at `MIN_TREND - 1` nights | The old chain, unchanged |
| The same with `sleepGoalAsked: 5.5` on the profile | Not proposed; the next branch is |
| The same with `sleepGoalAsked: 4.5` | Proposed — a different band is new information |
| `avgSleep === null` | Not proposed, no throw |
| `adjustment.decline` on the sleep branch | Returns a profile carrying `sleepGoalAsked` |
| `adjustment.decline` on every other branch | `undefined`, so the Dashboard's existing behaviour is unchanged |

`src/planner.test.js` — precedence and the reflection

| Case | Expect |
|---|---|
| `stretchNight({ stretch: 4, nightInStretch: 1 })` | 4 — counted beats told |
| `stretchNight({ nightInStretch: 3 })` | 3 — told beats nothing |
| `stretchNight({})` | 1 |
| `caffeineHours` / `movementInterval` driven off `stretch` | The existing `nightInStretch` describe, re-run through the new field: +1 hour at 3, −15 at 2, −30 at 4 |
| `baseProfile({ stretch: 4, overrides: {…} })` | Keeps `stretch`, drops `overrides` |
| `reflectionAdjust(P, "Earlier caffeine cutoff")` | `{ key: "caffeineHours", value: caffeineHours(baseProfile(P)) + 1 }` |
| Applied twice | The same value. Idempotent |
| With `overrides: { caffeineHours: 9 }` | 9 held — an existing override is never moved backward |
| With `overrides: { caffeineHours: 10 }`, the clamp | 10, and `msg` is the "already where your plan is" line |
| On a profile whose derived value exceeds the clamp | `ADJUSTABLE.caffeineHours.max` |
| `reflectionAdjust(P, "Fewer resets")` | `{ key: "moveGap", value: movementInterval(baseProfile(P)) + 30 }` |
| `reflectionAdjust(P, "More rest")` | `{ key: "restLength", value: 30 }` |
| `reflectionAdjust({ …P, nap: "none" }, "More rest")` | `key: null`, `msg` present |
| `reflectionAdjust({ …P, caffeine: "none" }, "Earlier caffeine cutoff")` | `key: null`, `msg` present |
| `reflectionAdjust(P, "Nothing")` / `undefined` / `"gibberish"` | `null` |

**End to end, `drive-loop.mjs`,** a root-level Playwright driver on the pattern
`drive-history.mjs` and `drive-plan-state.mjs` established: `page.clock.install({ time })`
before `goto`, `addInitScript` seeding `gy.v1`, a `record(name, pass, detail)`
tally, `page.on("pageerror")` failing the check it happened in, non-zero exit on
failure. Run against `npm run dev -- --port 5174`. `.gitignore` gains
`!drive-loop.mjs` beside the two existing exemptions.

The fixture is `drive-history.mjs`'s: 22:00–06:00, sleep 07:30 for 7.5h, so the
boundary is 15:00 and a clock at 14:59 on Aug 13 belongs to night `2026-08-12`.

| | Check |
|---|---|
| L1 | Archive of three consecutive nights ending last night, seed 1: the Plan tab reads "Night 4 of your stretch" and the recurring card reads the gap 30 minutes shorter than the same profile with an empty archive |
| L2 | The same archive with a two-night hole in it reads "Night 1". Without this, a rule that never breaks passes L1 |
| L3 | Records at offsets 1 and 3 read "Night 3" — the single hole is bridged |
| L4 | Empty archive, quiz answered "Third night": tonight reads "Night 3"; cross the boundary with something logged and it reads "Night 4", not "Night 2". The seed-carry regression |
| L5 | After logging, a profile edit and a rollover, `gy.v1`'s profile has no `stretch` key |
| L6 | Reflection "Earlier caffeine cutoff" + Save: the toast names the new number, `caff-cutoff` moves an hour earlier on the Plan tab, `gy.v1` has `overrides.caffeineHours`, and `caffeineSensitivity` is **unchanged**. Fails today |
| L7 | Save pressed a second time: the item does not move again and the override is the same number |
| L8 | The profile sheet lists "Stop caffeine · 7.0 hours before sleep"; "Put them all back" empties `overrides` and returns the item to its original time |
| L9 | Reflection "More rest" on a `nap: "none"` profile: no override written, and the toast says why |
| L10 | Six seeded nights averaging ~5.4h against a 7.5h goal: the "Next plan adjustment" card offers the goal change and names both figures; Apply writes `sleepGoalHours: 5.5`, the hero denominator and the sleep-window item both move |
| L11 | Keep current instead: `gy.v1` carries `sleepGoalAsked`, and after a reload the card shows the next adjustment rather than the same one |
| L12 | After L10's Apply — which moves the wake boundary two hours — the night id does not walk backward and the archive gains no duplicate id |

L2, L7 and L11 are the checks that make the suite able to fail: each one passes
under a "fix" that does the right thing unconditionally. Every check gets the
Phase 4 treatment — one deliberate break, one red, one revert — before the phase
is called done.

**Not tested:** the memo and the effects themselves, for the reason Phases 2, 3
and 4 all gave — asserting on a React memo over a ref and a wall clock needs a
render harness this repo does not have. The logic they call is pure and covered
above; the wiring is covered by the driver.

---

## Known ceilings

- **Two or more unlogged nights inside a real stretch reset the count.** The
  measured break wins, the plan drops back to night one, and the caffeine cutoff
  moves an hour later for someone who is five nights deep. The recourse is the
  two adjustable numbers; the fix is `workDays`, and its condition is still not
  met.
- **A night off on which anything was logged counts as a worked night.**
  Requiring evidence of a shift — `endShift` is on every record since Phase 3 —
  was considered and rejected: most users never tap it, so the strict rule would
  undercount, which is the unsafe direction.
- **The bridge is a heuristic, and it is unmeasured.** One night is forgiven,
  two are not, on an argument about rosters rather than on data. The thing to
  look at when there is a real archive is the distribution of gap lengths: a
  population of one-night gaps means users forget, a population of two-and-three
  means they are days off, and either reading is what should decide whether
  `workDays` gets built.
- **The count is ±1 across a bridged night.** It reads low, and only matters when
  it lands on 2, 3 or 4 exactly.
- **An override outlives the reason it was written.** "Earlier caffeine cutoff"
  on night 3 sets a number that includes the stretch's own +1, and it stays after
  the stretch ends. Visible in the receipt card, undone in two taps, not expired
  automatically — an override with a lifetime is a new concept and this phase
  declines to introduce one.
- **A night folded on boot is folded at the seed's count**, not the archive's,
  because `forNight` runs at module scope with no memo. Phase 2's ceiling, one
  field wider.
- **`sleepGoalAsked` is unvalidated**, like every other field in `gy.v1`. A
  hand-edited value only ever suppresses or fails to suppress a proposal.
- **Applying the sleep goal can merge two nights into one record**, when the new
  wake boundary moves backward across the current clock. Phase 3's accepted cost,
  now reachable from a button rather than only from the shift-time sheet.
- **The caffeine cutoff still does not say why it moved an hour.** The count is
  explained on the Plan tab and in the fatigue check-in's `changed` line, but the
  item that actually changed carries no reason, because writing one edits
  `generateTimeline`.
- **A hand-edited archive is still unvalidated.** `countStretch` tolerates
  garbage rows without throwing, which is one function's worth of hardening
  against a ceiling that stands unchanged.

## Skipped

- `workDays`, off-night stubs, nights-elapsed averages, pre-shift prompts that
  know about days off. Phase 0's list, still deferred, now with the measurement
  named that would settle it.
- A `changed` line on `caff-cutoff` explaining the stretch. It is three lines and
  it is the right copy; it edits `generateTimeline`, which this phase's brief
  rules out. The first thing to add when that rule lifts.
- A stretch control in `REVIEW`, the profile sheet, or `ADJUSTABLE`.
- Provenance on `overrides`, per-row reset in the receipt card, an expiry for
  overrides.
- Rendering `sleepAvgLine` or any of the other eight dead `readPatterns` lines.
- Splitting `avgSleep` into logged and estimated.
- Deferring the reflection's change to the next shift.
- A shared harness for the drivers. `drive-loop.mjs` copies `record`, `seed`,
  `open` and the fixture the way every existing `drive-*.mjs` does.
- An import path, schema validation, retention limits, a `storage` event
  listener. All still standing, all still somebody else's phase.
