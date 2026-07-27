# Graveyard redesign — design spec

**Date:** 2026-07-27
**Status:** approved, pending implementation plan
**Scope:** pure frontend. Mock data. No backend, no database, no persistence.

## Goal

Six changes to the night-shift planner, plus the restructuring needed to make
them work: Phosphor solid icons, tighter copy, fewer and coherently-derived
statistics, a new time-range control, a de-templated Plan page, and a
Reflection page built from selects instead of pill grids.

## Starting point

`src/App.jsx` is a single 4079-line file with one `export default function App()`
at line 2460. All eight screen components are declared inside `App`'s body, so
React sees a new function identity each render and remounts every subtree.
Dashboard statistics read from `seedHistory()` (line 776), which generates 56
nights from a `Math.sin` pseudo-random generator, and several displayed values
are not actually computed from it.

---

## 1. Icons: lucide-react → Phosphor solid

Replace `lucide-react` with `@phosphor-icons/react` (v2.1.10).

Introduce `src/icons.js` as the single import surface. It re-exports Phosphor
glyphs under the names the codebase already uses, so the ~180 call sites keep
their identifiers, `size` props, and `color` props unchanged.

Weight is set globally at the app root:

```jsx
<IconContext.Provider value={{ weight: "fill" }}>
```

**Exception:** four glyphs are structurally linear and become illegible blobs at
`fill`. These are re-exported pre-bound to `weight="regular"`:
`ChartBar`, `ListChecks`, `Pulse`, `Footprints`.

### Name mapping

Unchanged: `Moon, Coffee, Sun, Heart, Clock, Check, Plus, Wind, Eye, Bed, Car,
ArrowRight, ArrowLeft, X, ListChecks, Info, Footprints, Pencil, User, Bell,
Trophy, Target, FileText, Palette, Lock, Play`

Renamed:

| Current (lucide) | Phosphor |
|---|---|
| `Droplets` | `Drop` |
| `Activity` | `Pulse` |
| `Utensils` | `ForkKnife` |
| `ChevronRight` | `CaretRight` |
| `ChevronDown` | `CaretDown` |
| `Zap` | `Lightning` |
| `RotateCcw` | `ArrowCounterClockwise` |
| `Download` | `DownloadSimple` |
| `BarChart3` | `ChartBar` |
| `HelpCircle` | `Question` |

**Dropped as unused:** `ChevronLeft`, `Sunrise`, `Sparkles`, `Smile`.
Verified unreferenced outside the import statement. 40 imported → 36 used.

`lucide-react` is removed from `package.json`.

All 36 target names and `IconContext` were verified to exist in
`@phosphor-icons/react@2.1.10` (3045 exports) before this spec was written.
Note the package is ESM-only; it must be imported, not `require`d. Icons are
also exported with an `Icon` suffix (`MoonIcon`), but the bare names are used
here to keep call sites unchanged.

---

## 2. Copy reduction

- Every `why:` explainer (36 of them) is rewritten to **one sentence**. All 36
  are kept; reasoning-transparency is the app's differentiator.
- Card `msg:` strings tightened where they run past one line.
- Dashboard prose in `readPatterns` tightened to one sentence per field.
- **All 15 em dashes (`—`) removed.** Rewrite as a period or a comma. Do not
  substitute an en dash.
- The 5 existing en dashes (`–`) sit in numeric ranges (`5–6h`, `7–9h`) and are
  correct usage. They stay.

Rule for rewrites: preserve the causal claim, drop the elaboration. Example:

> Before: "Digestion slows overnight. Eating your largest meal before the shift
> means you are not relying on heavy food during the hours when it sits worst
> and interferes with sleep afterward."
>
> After: "Digestion slows overnight, so a large meal now sits better than one
> mid-shift."

---

## 3. Statistics from a coherent mock dataset

The requirement is that every displayed number be computed from one dataset
through one code path, rather than fabricated per-stat. It is **not** that the
data be real. Nothing persists; a refresh returns to the mock.

### 3.1 Replace the PRNG with an authored dataset — `src/mockNights.js`

`seedHistory()` and `rnd()` are deleted. In their place, a literal table of
**45 nights**, most recent last.

45 is chosen so the ranges stay meaningfully distinct: `1 month` (30) is a
strict subset of `All time` (45).

**Nights are stored as offsets relative to the profile, not as absolute clock
times.** A static table of absolute times would be wrong for any shift the user
did not happen to pick in the quiz. Each row stores:

```js
{
  dayOffset,          // nights back from today; mock rows are 1..45, tonight is 0
  sleepStartDelta,    // minutes from the profile's planned sleep time
  sleepHours,
  caffeineDeltas: [], // minutes from the profile's shift start
  moveDonePct,        // 0..1, multiplied by the profile's planned reset count
  restKind,           // "nap" | "quiet" | "none"
  groggy,
  water,
  sleepyWindow,       // "early" | "mid" | "deep" | "late"
  skippedMeal, heavyMeal, lateSnack, screenStrain, lateLightDone,
}
```

`materializeNights(profile)` turns the table into `NightRecord`s against the
user's actual shift start, shift end, planned sleep, caffeine cutoff, and
movement interval. Change the shift in the quiz and the history moves with it.

**The dataset must encode the correlation the app exists to surface:** nights
whose `caffeineDeltas` place a drink after the computed cutoff carry roughly
1 to 1.5 fewer `sleepHours` than nights that stay clear of it. This is what
`readPatterns.mainPattern` reports. Author it deliberately rather than leaving
it to chance, and keep it noisy enough to look real. Roughly a quarter of
nights should cross the cutoff.

Vary `sleepyWindow` across all four values, weighted toward `deep`. The old
generator computed this field and then failed to return it, pinning every
sleepiness reading in the app to `"early"`.

### 3.2 Tonight layers on top

Tonight's real logs fold into a `NightRecord` via `foldNight(profile, logs,
reflection)` and appear as the most recent night, so logging visibly moves the
dashboard within a session. Held in React state only.

`nights = [...materializeNights(profile), foldNight(...)]` when tonight has any
logs, otherwise just the mock.

### 3.3 The NightRecord

The one shape both the mock and tonight produce, and the only shape `rangeStats`
reads:

```js
{
  id,
  dayOffset,         // 0 = tonight
  shiftStart, shiftEnd,
  sleepStart, wake,
  sleepHours,
  sleepEstimated,    // see 3.4; always false for mock nights
  cutoff,
  caffeine: [],
  moveDone, moveTotal,
  restKind, restMin, groggy,
  water,
  screenStrain,
  sleepyWindow,
  skippedMeal, heavyMeal, lateSnack, lateLightDone,
}
```

Every field is consumed by `rangeStats` or a chart. Any field nothing reads
should not be in the record. This is the rule the old code broke.

### 3.4 Tonight's sleep hours, and the honest fallback

Applies to the folded night only; mock nights always carry measured values.

Preferred: `wake − sleepStart` from actual log timestamps.

Fallback when either is missing: the midpoint of the reflection bucket
(`Under 5h`→4.5, `5–6h`→5.5, `7–9h`→8, `Over 9h`→9.5), with
`sleepEstimated: true`. Estimated nights render with a reduced-opacity bar and
are excluded from the caffeine-versus-sleep correlation, which requires
measured values on both sides.

If neither exists, `sleepHours` is `null`. Null nights are excluded from
averages, never counted as zero.

### 3.5 What survives on the dashboard

**Two charts:**
1. **When you slept** — stacked bars, sleep start to wake.
2. **Caffeine against your cutoff** — dots against a dashed cutoff line.

Removed as charts, retained as one-line figures: wake-time drift, movement
completion, rest blocks.

**Three tiles:** average sleep · nights caffeine crossed cutoff · movement %.
The "Most sleepy" tile is dropped; the sleepiness panel already states it.

**Panels:** 8 → 4 (sleep, caffeine, movement + rest combined, light + food
combined).

### 3.6 Thin-data guards

The mock guarantees a populated dashboard, so these guards cover the **Today**
view and defensive correctness rather than a cold start:

- **Today with nothing logged:** empty state naming what to log. No charts.
- **Any aggregate over an empty array returns `null`**, and every consumer
  renders a dash. `Math.min`/`Math.max` over `[]` returns `±Infinity`, which
  previously reached the render path as `domain={[Infinity, -Infinity]}`.
- `mainPattern` requires at least 5 nights in range and at least one night on
  each side of the cutoff comparison. Otherwise it falls back to a
  non-comparative line.

---

## 4. Time ranges

Replace `RANGES` (7/14/28/56 nights) with:

Inline row: **Today · 3 days · 1 week · More ▾**
Dropdown under More: **2 weeks · 1 month · All time**

`All time` = all 45 mock nights plus tonight. When the active range comes from
the dropdown, the More button displays that label so the selection stays
visible.

**Today** is a distinct view, not a one-night trend. It renders tonight's
figures with no charts: sleep before shift, caffeine logged against cutoff,
resets done of planned, rest taken, water count. Charts begin at 3 days.

Ranges filter on `dayOffset`, not array position.

---

## 5. Plan page

Remove the phase-band headers: the uppercase tracked label
(`PRE-SHIFT`, `EARLY SHIFT`, …) with its hairline rule. The `groups` mapping
over `ph.phases` goes away.

Items render as **one continuous time-ordered list**. Time in the left rail is
the only progression marker.

This also fixes a real defect: `PlanTab` dropped any item whose `at` fell
outside every phase window, while still counting it in "X of Y done". A
`preMealLead` above 180 minutes made the card vanish. A flat list cannot drop
items.

The "Circadian low" marker moves onto the affected item cards rather than
sitting on a section header.

Kept: the left time rail, the current-item border, the Done/Skip/Adjust
buttons.

---

## 6. Reflection page

Both pill stacks become selects.

1. **Daily reflection** — the 7 `REFLECT_QS` questions become 7 `<select>`
   elements in a label-above-control stack. Each defaults to an unselected
   placeholder so an unanswered question stays visibly unanswered.
2. **Add with your own time** — the 13-item `LOG_TYPES` grid becomes a single
   `<select>`. The `details` sub-options for caffeine, meal, and nap render as
   a second select that appears only when the parent selection has details.

Native `<select>` is used rather than a custom dropdown: it is accessible by
default, and on iOS it opens the native wheel picker, which suits a
one-handed app used at 3am.

Reflection answers feed tonight's folded NightRecord, so these controls are
load-bearing rather than cosmetic.

---

## 7. Restructuring

### 7.1 Hoist screen components

`Dashboard`, `PlanTab`, `LogTab`, `LiveTab`, `ProfileSheet`, `Sheet`,
`AdjustSheet`, `ReflectionBlock` move from `App`'s body to module scope, taking
their dependencies as props. Nested inner components (`Panel`, `Tile`, `Column`,
`Section`, `Row`) hoist alongside them.

This is required, not optional: remounting on every render currently resets
component state on each clock tick and drops focus from inputs after each
keystroke. Selects added in section 6 would inherit the same fault.

### 7.2 Split the file

| Module | Contents |
|---|---|
| `src/tokens.js` | `FONT_*`, `WARM`, `DARK`, `DOMAIN`, `tint` |
| `src/time.js` | `DAY`, `toMin`, `fmt`, `nextAfter`, `overlap`, `dur`, `nightAxis`, `nightTick` |
| `src/planner.js` | `calculateShiftPhases`, `generateTimeline`, `deriveState`, `generateAdvice`, `ADJUSTABLE`, `ov` |
| `src/mockNights.js` | the 45-row table, `materializeNights` |
| `src/stats.js` | `foldNight`, `rangeStats`, `readPatterns`, `achievements` |
| `src/icons.js` | Phosphor re-exports |
| `src/ui/` | `Card`, `Btn`, `Pill`, `Badge`, `Display`, `Eyebrow`, `Select` |
| `src/screens/` | one file per screen |
| `src/App.jsx` | state, composition, routing |

No storage module. Nothing is persisted.

---

## 8. Bugs fixed in passing

These sit inside code being rewritten anyway:

1. `if (s.cutoff)` (line 381) treats a legitimate cutoff of `0` as absent. Use
   `s.cutoff !== null`. Reachable with a 00:00–05:00 shift and 06:00 sleep.
2. `LOG_TYPES` hardcodes `val: "earlier"` for `wake`, so "woke later" is
   unreachable. Give it `details: ["Earlier", "On time", "Later"]`.
3. Manual "Quiet rest" maps to `"couldnt"` (= could not nap). Add a distinct
   `"quiet"` value.
4. `of("wake")[0]` takes the first wake log where `sleepQuality` takes the last.
   Use `.slice(-1)[0]`.
5. Two `adjust` specs pass override-contaminated defaults (`caffeineHours` at
   365, `moveGap` at 406), so "reset to default" never appears. Compute from an
   override-free profile.
6. `generateAdvice` hardcodes "ninety minutes" against an adjustable 30–240
   setting. Interpolate `s.waterGapMins`.
7. Clock-interval effect omits `sleepGoalHours` from its dependency array.

**Explicitly out of scope:** the unused `answerSleepy` / `answerStressed` /
`ProgressRing` code and the missing "now" tab they belong to. The unread
`chronotype` input. The persisted-but-unconsumed `mutedReminders`,
`remindStyle`, `remindLead` and the absent reminder system. Achievements
rebasing onto the new records.

---

## 9. Verification

1. `vite build` clean.
2. Playwright drive: quiz → plan → each tab, zero console errors.
3. Run the quiz twice with different shift times and confirm the mock history
   moves with the profile rather than staying fixed.
4. Confirm the sleepiness reading is not pinned to one value: it must vary
   across ranges, unlike the current build where all four ranges report
   "early shift".
5. Confirm `mainPattern` reports the caffeine/sleep correlation the dataset
   was authored to contain.
6. Today view with nothing logged renders its empty state with no `Infinity`,
   `NaN`, or `undefined` in the DOM.
7. Type five characters into the reflection note field and confirm all five
   land. This is the regression test for section 7.1.
8. Confirm no `—` remains in `src/`.
