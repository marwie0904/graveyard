# Graveyard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the night-shift planner to Phosphor solid icons, tighter copy, two coherently-derived charts, a new time-range control, a flat Plan page, and a select-driven Reflection page — splitting the 4079-line `App.jsx` into focused modules along the way.

**Architecture:** Pure frontend, no backend, no database, no persistence. A 45-row authored mock dataset stores *offsets relative to the user's profile* and is materialized against whatever shift the quiz produced. Tonight's live logs fold into the same `NightRecord` shape and layer on as the most recent night. Pure logic (time, planner, mock, stats) moves into testable modules; screen components hoist to module scope so they stop remounting every render.

**Tech Stack:** React 18, Vite 6, Recharts 2, `@phosphor-icons/react` 2.1.10, Vitest (added in Task 1).

**Spec:** `docs/superpowers/specs/2026-07-27-graveyard-redesign-design.md`

## Global Constraints

- Pure frontend. No backend, no database, **no persistence of any kind**. A refresh returns to the mock dataset and an empty log. Do not add `localStorage`, `sessionStorage`, `IndexedDB`, or any storage module.
- **Zero em dashes (`—`) in `src/`.** Rewrite as a period or a comma. Never substitute an en dash.
- En dashes (`–`) in numeric ranges (`5–6h`, `7–9h`) are correct usage and stay.
- Every `why:` explainer is **exactly one sentence**. All 36 are kept.
- `@phosphor-icons/react` is **ESM-only**. Import it; never `require` it.
- Icons are imported *only* from `src/icons.js`. No file imports `@phosphor-icons/react` directly except `src/icons.js`.
- `lucide-react` must not appear in `package.json` or any import after Task 3.
- Any aggregate over an empty array returns `null`, never `±Infinity` or `NaN`. Every consumer renders a plain hyphen `"-"` for `null`.
- Mock rows store offsets relative to the profile. Never hardcode absolute clock times in `mockNights.js`.
- Every field in a `NightRecord` must be read by `rangeStats` or a chart. If nothing reads it, delete it.
- Screen components live at module scope, never inside `App`'s body.

---

## File Structure

| Module | Responsibility |
|---|---|
| `src/tokens.js` | `FONT_DISPLAY`, `FONT_TEXT`, `WARM`, `DARK`, `DOMAIN`, `tint` |
| `src/time.js` | `DAY`, `toMin`, `fmt`, `nextAfter`, `overlap`, `dur`, `nightAxis`, `nightTick` |
| `src/icons.js` | Phosphor re-exports under the codebase's existing names |
| `src/planner.js` | `calculateShiftPhases`, `calculateCaffeineCutoff`, `caffeineHours`, `movementInterval`, `sleepiestWindow`, `deriveState`, `generateTimeline`, `generateAdvice`, `ADJUSTABLE`, `ov` |
| `src/mockNights.js` | `MOCK_ROWS` (45 rows), `materializeNights(profile)` |
| `src/stats.js` | `foldNight`, `rangeStats`, `readPatterns`, `RANGES`, `SLEEPY_LABEL` |
| `src/ui/index.jsx` | `Card`, `Btn`, `Pill`, `Badge`, `Display`, `Eyebrow`, `Select`, `RangeControl` |
| `src/screens/Dashboard.jsx` | dashboard, 2 charts + 3 tiles + 4 panels |
| `src/screens/PlanTab.jsx` | flat timeline |
| `src/screens/LogTab.jsx` | log entry + reflection block |
| `src/screens/LiveTab.jsx` | care screen |
| `src/screens/Sheets.jsx` | `Sheet`, `AdjustSheet`, `ProfileSheet` |
| `src/App.jsx` | state, composition, routing |

---

## Task 1: Baseline — git, Vitest, and a safety net

Nothing else in this plan is safe without version control and a way to run tests. This task creates both and changes no product code.

**Files:**
- Create: `.gitignore`, `vitest.config.js`, `src/time.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `npm test` runs Vitest. A git repo with a baseline commit at the current working state.

- [ ] **Step 1: Initialise the repo and ignore build artefacts**

Create `.gitignore`:

```
node_modules
dist
*.png
drive*.mjs
shot-plan.mjs
check.mjs
```

Then:

```bash
git init
git add -A
git commit -m "chore: baseline before redesign"
```

- [ ] **Step 2: Add Vitest**

```bash
npm install -D vitest@^2.1.8
```

Add to `package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest"
```

Create `vitest.config.js`:

```js
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.js"] },
});
```

- [ ] **Step 3: Write a failing test against a module that does not exist yet**

Create `src/time.test.js`:

```js
import { describe, it, expect } from "vitest";
import { DAY, toMin, fmt, nextAfter, overlap, dur, nightAxis, nightTick } from "./time.js";

describe("toMin", () => {
  it("converts HH:MM to minutes past midnight", () => {
    expect(toMin("00:00")).toBe(0);
    expect(toMin("22:30")).toBe(1350);
  });
});

describe("fmt", () => {
  it("formats midnight as 12:00 AM, not 0:00 AM", () => {
    expect(fmt(0)).toBe("12:00 AM");
  });
  it("formats noon as 12:00 PM", () => {
    expect(fmt(720)).toBe("12:00 PM");
  });
  it("wraps past a day", () => {
    expect(fmt(DAY + 90)).toBe("1:30 AM");
  });
  it("handles negative absolute times", () => {
    expect(fmt(-30)).toBe("11:30 PM");
  });
});

describe("nextAfter", () => {
  it("returns the same instant when the clock time already matches", () => {
    expect(nextAfter(600, 600)).toBe(600);
  });
  it("rolls forward a day when the clock time has passed", () => {
    expect(nextAfter(1300, 360)).toBe(DAY + 360);
  });
});

describe("overlap", () => {
  it("returns the intersection", () => {
    expect(overlap([0, 100], [50, 200])).toEqual([50, 100]);
  });
  it("returns null when ranges only touch", () => {
    expect(overlap([0, 100], [100, 200])).toBeNull();
  });
});

describe("dur", () => {
  it("formats hours and minutes", () => {
    expect(dur(90)).toBe("1h 30m");
    expect(dur(120)).toBe("2h");
    expect(dur(45)).toBe("45m");
  });
});

describe("nightAxis / nightTick", () => {
  it("keeps an evening-to-morning span monotonic", () => {
    expect(nightAxis(toMin("22:00"))).toBeLessThan(nightAxis(toMin("06:00")) + DAY);
    expect(nightAxis(toMin("22:00"))).toBeLessThan(nightAxis(toMin("23:00")));
  });
  it("round-trips a tick label", () => {
    expect(nightTick(nightAxis(toMin("02:00")))).toBe("2a");
  });
});
```

- [ ] **Step 4: Run it and confirm it fails for the right reason**

Run: `npm test`
Expected: FAIL, `Failed to resolve import "./time.js"`.

- [ ] **Step 5: Create `src/time.js` by moving code out of `App.jsx`**

Cut lines 79-110 and 221-230 of `src/App.jsx` (the `DAY`/`toMin`/`fmt`/`nextAfter`/`overlap`/`dur` block and the `nightAxis`/`nightTick` block) into `src/time.js`, adding `export` to each. Do not change any logic. In `App.jsx`, add at the top:

```js
import { DAY, toMin, fmt, nextAfter, overlap, dur, nightAxis, nightTick } from "./time.js";
```

- [ ] **Step 6: Run the tests and the build**

Run: `npm test && npx vite build`
Expected: all tests PASS, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: add vitest, extract src/time.js"
```

---

## Task 2: Extract `src/tokens.js`

**Files:**
- Create: `src/tokens.js`
- Modify: `src/App.jsx:26-75`

**Interfaces:**
- Consumes: nothing.
- Produces: `FONT_DISPLAY`, `FONT_TEXT`, `WARM`, `DARK`, `DOMAIN`, `tint(hex, alpha)`. `DOMAIN` keys: `sleep, caffeine, water, movement, light, food, recovery, shift`; each `{ hue, label, Icon }`.

- [ ] **Step 1: Move the token block**

Cut `App.jsx` lines 26-75 into `src/tokens.js`, exporting each binding. `DOMAIN` still imports its icons from `lucide-react` at this stage; Task 3 changes that. Add to `App.jsx`:

```js
import { FONT_DISPLAY, FONT_TEXT, WARM, DARK, DOMAIN, tint } from "./tokens.js";
```

- [ ] **Step 2: Verify the build**

Run: `npx vite build`
Expected: success, no unresolved imports.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "refactor: extract src/tokens.js"
```

---

## Task 3: Swap lucide-react for Phosphor solid

**Files:**
- Create: `src/icons.js`
- Modify: `src/App.jsx:1-8`, `src/tokens.js`, `src/main.jsx`, `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `src/icons.js` exporting these 36 names — `Moon, Coffee, Sun, Heart, Clock, Check, Plus, Wind, Eye, Bed, Car, ArrowRight, ArrowLeft, X, ListChecks, Info, Footprints, Pencil, User, Bell, Trophy, Target, FileText, Palette, Lock, Play, Drop, Pulse, ForkKnife, CaretRight, CaretDown, Lightning, ArrowCounterClockwise, DownloadSimple, ChartBar, Question`. All accept `size`, `color`, `style`.

- [ ] **Step 1: Install Phosphor, remove lucide**

```bash
npm install @phosphor-icons/react@2.1.10
npm uninstall lucide-react
```

- [ ] **Step 2: Create `src/icons.js`**

```js
import {
  Moon, Coffee, Sun, Heart, Clock, Check, Plus, Wind, Eye, Bed, Car,
  ArrowRight, ArrowLeft, X, Info, Pencil, User, Bell, Trophy, Target,
  FileText, Palette, Lock, Play, Drop, ForkKnife, CaretRight, CaretDown,
  Lightning, ArrowCounterClockwise, DownloadSimple, Question,
  ListChecks as ListChecksBase,
  ChartBar as ChartBarBase,
  Pulse as PulseBase,
  Footprints as FootprintsBase,
} from "@phosphor-icons/react";

export {
  Moon, Coffee, Sun, Heart, Clock, Check, Plus, Wind, Eye, Bed, Car,
  ArrowRight, ArrowLeft, X, Info, Pencil, User, Bell, Trophy, Target,
  FileText, Palette, Lock, Play, Drop, ForkKnife, CaretRight, CaretDown,
  Lightning, ArrowCounterClockwise, DownloadSimple, Question,
};

/* These four are structurally linear and turn into unreadable blobs at
   weight="fill", so they opt out of the global fill weight. */
export const ListChecks = (p) => <ListChecksBase weight="regular" {...p} />;
export const ChartBar   = (p) => <ChartBarBase   weight="regular" {...p} />;
export const Pulse      = (p) => <PulseBase      weight="regular" {...p} />;
export const Footprints = (p) => <FootprintsBase weight="regular" {...p} />;
```

Rename the file to `src/icons.jsx` since it contains JSX, and import it as `./icons.jsx`.

- [ ] **Step 3: Set the global fill weight**

In `src/main.jsx`:

```jsx
import React from "react";
import { createRoot } from "react-dom/client";
import { IconContext } from "@phosphor-icons/react";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <IconContext.Provider value={{ weight: "fill" }}>
      <App />
    </IconContext.Provider>
  </React.StrictMode>
);
```

- [ ] **Step 4: Rewrite the call sites**

In `App.jsx`, replace the `lucide-react` import block (lines 1-8) with an import from `./icons.jsx`. Apply these renames throughout `App.jsx` **and** `src/tokens.js`:

| Old | New |
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

Delete `ChevronLeft`, `Sunrise`, `Sparkles`, `Smile` entirely — they are imported but never used.

- [ ] **Step 5: Verify no lucide references and no stale names survive**

Run:

```bash
grep -rn "lucide" src/ package.json; \
grep -rnE "\b(Droplets|Activity|Utensils|ChevronRight|ChevronDown|Zap|RotateCcw|Download|BarChart3|HelpCircle|ChevronLeft|Sunrise|Sparkles|Smile)\b" src/
```

Expected: no output from either. (`Download` appears only as `DownloadSimple`, which the word boundary excludes.)

- [ ] **Step 6: Build and eyeball the result**

Run: `npx vite build && npx vite --port 5173 --host 127.0.0.1`
Load `http://127.0.0.1:5173/` and confirm icons render filled, and that the four exceptions (tab bar chart icon, plan checklist icon, movement pulse, footprints) are legible rather than solid blocks.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: replace lucide-react with phosphor solid icons"
```

---

## Task 4: Extract `src/planner.js` and fix the cutoff bugs

**Files:**
- Create: `src/planner.js`, `src/planner.test.js`
- Modify: `src/App.jsx:112-740`

**Interfaces:**
- Consumes: `src/time.js`, `src/tokens.js`.
- Produces:
  - `calculateShiftPhases(profile) -> { start, end, length, sleepStart, sleepEnd, phases, deepNight, hardest }`
  - `calculateCaffeineCutoff(profile, ph) -> number | null` (absolute minutes)
  - `caffeineHours(profile) -> number`
  - `movementInterval(profile) -> number`
  - `ov(profile, key, fallback) -> any`
  - `baseProfile(profile) -> profile` — same profile with `overrides` emptied
  - `deriveState(profile, logs, now, ph) -> state`
  - `generateTimeline(profile, logs, now) -> { ph, state, items }`
  - `generateAdvice(profile, logs, now, plan) -> { title, body, why, domain, next, phase, inDeepNight }`
  - `ADJUSTABLE`

- [ ] **Step 1: Write the failing tests**

Create `src/planner.test.js`:

```js
import { describe, it, expect } from "vitest";
import {
  calculateShiftPhases, calculateCaffeineCutoff, generateTimeline, baseProfile, caffeineHours,
} from "./planner.js";

const P = {
  shiftStart: "22:00", shiftEnd: "06:00", plannedSleep: "07:30",
  sleepGoalHours: 7, caffeine: "moderate", caffeineSensitivity: "normal",
  nap: "both", sedentary: "some", breakControl: "high", lightEnv: "bright",
  commute: "drive", mealPattern: "before", sleepiestTime: "deep", overrides: {},
};

describe("calculateShiftPhases", () => {
  it("handles a shift crossing midnight", () => {
    const ph = calculateShiftPhases(P);
    expect(ph.length).toBe(480);
    expect(ph.end).toBeGreaterThan(ph.start);
  });
  it("finds the 02:00-05:00 circadian low inside the shift", () => {
    const ph = calculateShiftPhases(P);
    expect(ph.deepNight).not.toBeNull();
    expect(ph.deepNight[1] - ph.deepNight[0]).toBe(180);
  });
  it("reports no deep night for a shift that misses 02:00-05:00", () => {
    const ph = calculateShiftPhases({ ...P, shiftStart: "06:00", shiftEnd: "14:00" });
    expect(ph.deepNight).toBeNull();
  });
});

describe("calculateCaffeineCutoff", () => {
  it("returns null when the user takes no caffeine", () => {
    const p = { ...P, caffeine: "none" };
    expect(calculateCaffeineCutoff(p, calculateShiftPhases(p))).toBeNull();
  });

  /* Regression: a cutoff of exactly 0 is legitimate, not "no cutoff".
     Shift 00:00-05:00, sleep 06:00, normal sensitivity -> sleepStart 360,
     cutoff 360 - 360 = 0. The old `if (s.cutoff)` dropped the card and
     silently disabled all caffeine sleep-protection. */
  it("treats a cutoff of 0 as a real cutoff", () => {
    const p = { ...P, shiftStart: "00:00", shiftEnd: "05:00", plannedSleep: "06:00" };
    const ph = calculateShiftPhases(p);
    expect(calculateCaffeineCutoff(p, ph)).toBe(0);

    const ids = generateTimeline(p, [], ph.start + 60).items.map((i) => i.id);
    expect(ids).toContain("caff-cutoff");
  });
});

describe("baseProfile", () => {
  it("strips overrides so defaults are computable", () => {
    const p = { ...P, overrides: { caffeineHours: 9 } };
    expect(caffeineHours(p)).toBe(9);
    expect(caffeineHours(baseProfile(p))).toBe(6);
  });
});

describe("generateTimeline", () => {
  it("returns items sorted by time", () => {
    const ph = calculateShiftPhases(P);
    const { items } = generateTimeline(P, [], ph.start);
    const times = items.map((i) => i.at);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });
  it("gives every item a unique id", () => {
    const ph = calculateShiftPhases(P);
    const ids = generateTimeline(P, [], ph.start).items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test`
Expected: FAIL, cannot resolve `./planner.js`.

- [ ] **Step 3: Move the planner block**

Cut `App.jsx` lines 112-219 and 232-740 into `src/planner.js` (everything from `calculateShiftPhases` through `answerStressed`, excluding the chart-time helpers already in `time.js`). Export the names in the Interfaces block. Import `DAY, toMin, fmt, nextAfter, overlap, dur` from `./time.js`.

**Do not move** `answerSleepy`, `answerStressed`, or `ProgressRing` — they are unused. Delete them.

- [ ] **Step 4: Apply the two cutoff fixes**

In `generateTimeline`, change:

```js
if (s.cutoff) {
```

to:

```js
if (s.cutoff !== null) {
```

Add and export:

```js
/** Same profile with overrides stripped, so a control can compute the value
    it would reset to. Without this, `def` echoes the current override and the
    "reset to default" affordance never appears. */
export const baseProfile = (profile) => ({ ...profile, overrides: {} });
```

Then in the `caff-window` and `caff-cutoff` adjust specs, replace `def: caffeineHours(profile)` with `def: caffeineHours(baseProfile(profile))`; in the movement loop, replace `def: gap` with `def: movementInterval(baseProfile(profile))`.

- [ ] **Step 5: Fix the hardcoded water copy**

In `generateAdvice`, the `s.waterGap` branch reads "It has been over ninety minutes" while the setting is adjustable 30-240. Replace with:

```js
why: `It has been over ${s.waterGapMins} minutes, and mild dehydration reads as tiredness.`,
```

- [ ] **Step 6: Run tests and build**

Run: `npm test && npx vite build`
Expected: all PASS, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "refactor: extract planner, fix zero-cutoff and override-default bugs"
```

---

## Task 5: The mock dataset

**Files:**
- Create: `src/mockNights.js`, `src/mockNights.test.js`

**Interfaces:**
- Consumes: `src/planner.js` (`calculateShiftPhases`, `calculateCaffeineCutoff`, `movementInterval`), `src/time.js` (`DAY`).
- Produces:
  - `MOCK_ROWS` — 45 rows, `dayOffset` 1..45
  - `materializeNights(profile) -> NightRecord[]`, oldest first

  `NightRecord`: `{ id, dayOffset, sleepStart, wake, sleepHours, sleepEstimated, cutoff, caffeine, moveDone, moveTotal, restKind, restMin, groggy, water, screenStrain, sleepyWindow, skippedMeal, heavyMeal, lateSnack, lateLightDone }`. All clock-time fields are minutes 0..1439.

- [ ] **Step 1: Write the failing tests**

Create `src/mockNights.test.js`:

```js
import { describe, it, expect } from "vitest";
import { MOCK_ROWS, materializeNights } from "./mockNights.js";
import { calculateShiftPhases, calculateCaffeineCutoff } from "./planner.js";
import { nightAxis } from "./time.js";

const P = {
  shiftStart: "22:00", shiftEnd: "06:00", plannedSleep: "07:30",
  sleepGoalHours: 7, caffeine: "moderate", caffeineSensitivity: "normal",
  nap: "both", sedentary: "some", breakControl: "high", lightEnv: "bright",
  commute: "drive", mealPattern: "before", sleepiestTime: "deep", overrides: {},
};

const isLate = (n) => n.cutoff !== null && n.caffeine.some((c) => nightAxis(c) >= nightAxis(n.cutoff));

describe("MOCK_ROWS", () => {
  it("has 45 rows with unique consecutive dayOffsets 1..45", () => {
    expect(MOCK_ROWS).toHaveLength(45);
    expect(MOCK_ROWS.map((r) => r.dayOffset)).toEqual(
      Array.from({ length: 45 }, (_, i) => i + 1)
    );
  });
  it("stores offsets, never absolute clock times", () => {
    for (const r of MOCK_ROWS) {
      expect(Math.abs(r.sleepStartDelta)).toBeLessThanOrEqual(120);
    }
  });
});

describe("materializeNights", () => {
  it("produces one record per row, all clock fields in range", () => {
    const nights = materializeNights(P);
    expect(nights).toHaveLength(45);
    for (const n of nights) {
      expect(n.sleepStart).toBeGreaterThanOrEqual(0);
      expect(n.sleepStart).toBeLessThan(1440);
      expect(n.wake).toBeGreaterThanOrEqual(0);
      expect(n.wake).toBeLessThan(1440);
      expect(n.sleepEstimated).toBe(false);
      expect(n.moveDone).toBeLessThanOrEqual(n.moveTotal);
    }
  });

  /* The whole point of the dataset: the app's headline claim must be true of it. */
  it("encodes the late-caffeine/short-sleep correlation", () => {
    const nights = materializeNights(P);
    const late = nights.filter(isLate);
    const clean = nights.filter((n) => !isLate(n));
    expect(late.length).toBeGreaterThanOrEqual(9);
    expect(late.length).toBeLessThanOrEqual(14);
    const avg = (a) => a.reduce((s, n) => s + n.sleepHours, 0) / a.length;
    const delta = avg(clean) - avg(late);
    expect(delta).toBeGreaterThan(1.0);
    expect(delta).toBeLessThan(1.9);
  });

  it("keeps clean nights clean for a high-sensitivity profile too", () => {
    const nights = materializeNights({ ...P, caffeineSensitivity: "high" });
    const late = nights.filter(isLate);
    expect(late.length).toBeGreaterThanOrEqual(9);
    expect(late.length).toBeLessThanOrEqual(14);
  });

  it("moves with the profile instead of staying fixed", () => {
    const a = materializeNights(P);
    const b = materializeNights({ ...P, plannedSleep: "10:00" });
    expect(a[0].sleepStart).not.toBe(b[0].sleepStart);
  });

  it("logs no caffeine when the profile takes none", () => {
    const nights = materializeNights({ ...P, caffeine: "none" });
    for (const n of nights) {
      expect(n.caffeine).toEqual([]);
      expect(n.cutoff).toBeNull();
    }
  });

  it("varies sleepyWindow across all four values", () => {
    const seen = new Set(materializeNights(P).map((n) => n.sleepyWindow));
    expect(seen).toEqual(new Set(["early", "mid", "deep", "late"]));
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test`
Expected: FAIL, cannot resolve `./mockNights.js`.

- [ ] **Step 3: Write `src/mockNights.js`**

```js
import { DAY } from "./time.js";
import { calculateShiftPhases, calculateCaffeineCutoff, movementInterval } from "./planner.js";

/* An authored history, not a random one. Nights are stored as offsets from the
   user's own profile so the dataset follows whatever shift the quiz produced.
   `late` is minutes AFTER the computed cutoff, which is what makes a night
   count as late for any profile. Clean drinks are clamped below the cutoff for
   the same reason. */
const n = (dayOffset, sleepStartDelta, sleepHours, caffeine, late, moveDonePct, restKind, water, sleepyWindow, extra = {}) => ({
  dayOffset, sleepStartDelta, sleepHours, caffeine, late, moveDonePct, restKind, water, sleepyWindow,
  groggy: false, skippedMeal: false, heavyMeal: false, lateSnack: false,
  screenStrain: 0, lateLightDone: true, ...extra,
});

export const MOCK_ROWS = [
  n(1,   10, 7.4, [25, 190],       null, 0.72, "nap",   3, "deep"),
  n(2,   55, 6.1, [30, 210],       45,   0.48, "none",  2, "late",  { screenStrain: 1 }),
  n(3,  -15, 7.9, [20, 160, 300],  null, 0.81, "quiet", 4, "mid"),
  n(4,   25, 7.1, [35, 240],       null, 0.66, "nap",   3, "deep",  { groggy: true }),
  n(5,   70, 5.9, [20, 180, 320],  60,   0.39, "none",  2, "deep",  { lateSnack: true }),
  n(6,    5, 7.6, [30, 200],       null, 0.75, "quiet", 4, "early"),
  n(7,  -25, 8.1, [25],            null, 0.88, "nap",   5, "mid"),
  n(8,   35, 6.9, [40, 220],       null, 0.61, "quiet", 3, "deep"),
  n(9,   80, 5.6, [25, 195, 340],  75,   0.35, "none",  1, "late",  { skippedMeal: true, screenStrain: 1 }),
  n(10,  15, 7.3, [30, 175],       null, 0.70, "nap",   4, "deep"),
  n(11, -10, 7.8, [20, 150],       null, 0.79, "quiet", 4, "mid"),
  n(12,  40, 6.7, [35, 230],       null, 0.58, "none",  3, "deep",  { heavyMeal: true }),
  n(13,  65, 6.3, [30, 205],       40,   0.45, "quiet", 2, "late"),
  n(14,   0, 7.5, [25, 185],       null, 0.74, "nap",   4, "deep"),
  n(15,  20, 7.0, [30, 210, 310],  null, 0.64, "quiet", 3, "early"),
  n(16, -20, 8.3, [20],            null, 0.90, "nap",   5, "mid"),
  n(17,  75, 6.0, [35, 200],       55,   0.41, "none",  2, "deep",  { screenStrain: 1, lateLightDone: false }),
  n(18,  10, 7.2, [25, 170],       null, 0.69, "quiet", 4, "deep"),
  n(19,  30, 6.8, [40, 245],       null, 0.60, "nap",   3, "late",  { groggy: true }),
  n(20,  -5, 7.7, [20, 160],       null, 0.83, "quiet", 4, "mid"),
  n(21,  85, 5.5, [30, 215, 330],  90,   0.32, "none",  1, "late",  { skippedMeal: true }),
  n(22,  15, 7.4, [25, 180],       null, 0.71, "nap",   4, "deep"),
  n(23,  45, 6.6, [35, 225],       null, 0.55, "none",  3, "deep",  { heavyMeal: true, lateSnack: true }),
  n(24, -15, 8.0, [20, 145],       null, 0.86, "quiet", 5, "early"),
  n(25,  25, 7.1, [30, 195],       null, 0.67, "nap",   3, "mid"),
  n(26,  60, 6.4, [25, 205],       35,   0.47, "quiet", 2, "late",  { screenStrain: 1 }),
  n(27,   5, 7.6, [30, 165],       null, 0.77, "nap",   4, "deep"),
  n(28,  35, 6.9, [40, 235],       null, 0.59, "none",  3, "deep"),
  n(29, -25, 8.2, [20],            null, 0.89, "quiet", 5, "mid"),
  n(30,  70, 6.0, [35, 210, 325],  65,   0.38, "none",  2, "late",  { lateLightDone: false }),
  n(31,  20, 7.3, [25, 175],       null, 0.73, "nap",   4, "deep"),
  n(32,   0, 7.9, [30, 155],       null, 0.82, "quiet", 4, "early"),
  n(33,  50, 6.5, [35, 240],       null, 0.53, "none",  3, "deep",  { heavyMeal: true }),
  n(34,  78, 5.8, [25, 200],       70,   0.36, "none",  1, "late",  { skippedMeal: true, screenStrain: 1 }),
  n(35,  10, 7.5, [30, 185],       null, 0.76, "nap",   4, "deep"),
  n(36, -10, 8.1, [20, 150],       null, 0.87, "quiet", 5, "mid"),
  n(37,  40, 6.8, [40, 250],       null, 0.57, "quiet", 3, "deep",  { lateSnack: true }),
  n(38,  68, 6.2, [30, 195],       50,   0.43, "none",  2, "late"),
  n(39,  15, 7.2, [25, 180],       null, 0.70, "nap",   4, "deep",  { groggy: true }),
  n(40,  -5, 7.8, [30, 160],       null, 0.84, "quiet", 4, "early"),
  n(41,  30, 7.0, [35, 220],       null, 0.63, "nap",   3, "mid"),
  n(42,  48, 6.6, [40, 245],       null, 0.54, "none",  3, "deep",  { heavyMeal: true }),
  n(43,  82, 5.7, [25, 205, 335],  80,   0.34, "none",  1, "late",  { skippedMeal: true, lateLightDone: false }),
  n(44,   8, 7.6, [30, 170],       null, 0.78, "quiet", 4, "deep"),
  n(45, -18, 8.0, [20, 140],       null, 0.85, "nap",   5, "mid"),
];

const clock = (abs) => ((Math.round(abs) % DAY) + DAY) % DAY;

export function materializeNights(profile) {
  const ph = calculateShiftPhases(profile);
  const cutoffAbs = calculateCaffeineCutoff(profile, ph);
  const gap = movementInterval(profile);
  const moveTotal = Math.max(1, Math.floor(ph.length / gap));

  return MOCK_ROWS.map((r) => {
    const sleepStartAbs = ph.sleepStart + r.sleepStartDelta;

    let caffeine = [];
    if (cutoffAbs !== null) {
      // Clamp planned drinks below the cutoff so "clean" stays clean even for
      // a high-sensitivity profile, whose cutoff lands much earlier.
      caffeine = r.caffeine.map((d) => clock(Math.min(ph.start + d, cutoffAbs - 30)));
      if (r.late !== null) caffeine.push(clock(cutoffAbs + r.late));
    }

    return {
      id: `mock-${r.dayOffset}`,
      dayOffset: r.dayOffset,
      sleepStart: clock(sleepStartAbs),
      wake: clock(sleepStartAbs + r.sleepHours * 60),
      sleepHours: r.sleepHours,
      sleepEstimated: false,
      cutoff: cutoffAbs === null ? null : clock(cutoffAbs),
      caffeine,
      moveDone: Math.round(moveTotal * r.moveDonePct),
      moveTotal,
      restKind: r.restKind,
      restMin: r.restKind === "nap" ? 20 : r.restKind === "quiet" ? 10 : 0,
      groggy: r.groggy,
      water: r.water,
      screenStrain: r.screenStrain,
      sleepyWindow: r.sleepyWindow,
      skippedMeal: r.skippedMeal,
      heavyMeal: r.heavyMeal,
      lateSnack: r.lateSnack,
      lateLightDone: r.lateLightDone,
    };
  });
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: all PASS. If the correlation assertion fails, adjust `sleepHours` on the 11 late rows (offsets 2, 5, 9, 13, 17, 21, 26, 30, 34, 38, 43) rather than loosening the assertion — the assertion encodes the requirement.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add authored 45-night mock dataset"
```

---

## Task 6: `src/stats.js` — fold, aggregate, read patterns

**Files:**
- Create: `src/stats.js`, `src/stats.test.js`
- Modify: `src/App.jsx` (delete `seedHistory`, `rnd`, `rangeStats`, `readPatterns`, `RANGES`, `SLEEPY_LABEL`, `achievements`)

**Interfaces:**
- Consumes: `src/planner.js`, `src/time.js`, `src/mockNights.js`.
- Produces:
  - `RANGES` — `[{ key, label, nights, inMore }]`
  - `SLEEPY_LABEL` — `{ early, mid, deep, late }` → display strings
  - `foldNight(profile, logs, reflection) -> NightRecord | null` (null when nothing logged)
  - `rangeStats(profile, nights) -> stats` — every aggregate `null` on empty input
  - `readPatterns(profile, stats) -> { sleepAvgLine, caffeine, movement, rest, fatigue, foodHydration, light, mainPattern, noticed, adjustment }`
  - `achievements(profile, logs, nights)`

- [ ] **Step 1: Write the failing tests**

Create `src/stats.test.js`:

```js
import { describe, it, expect } from "vitest";
import { rangeStats, readPatterns, foldNight, RANGES } from "./stats.js";
import { materializeNights } from "./mockNights.js";

const P = {
  shiftStart: "22:00", shiftEnd: "06:00", plannedSleep: "07:30",
  sleepGoalHours: 7, caffeine: "moderate", caffeineSensitivity: "normal",
  nap: "both", sedentary: "some", breakControl: "high", lightEnv: "bright",
  commute: "drive", mealPattern: "before", sleepiestTime: "deep", overrides: {},
};

describe("RANGES", () => {
  it("offers Today, 3 days, 1 week inline and the rest under More", () => {
    expect(RANGES.filter((r) => !r.inMore).map((r) => r.label))
      .toEqual(["Today", "3 days", "1 week"]);
    expect(RANGES.filter((r) => r.inMore).map((r) => r.label))
      .toEqual(["2 weeks", "1 month", "All time"]);
  });
});

describe("rangeStats on empty input", () => {
  /* Regression: Math.min/Math.max over [] returns -Infinity/Infinity, which
     previously reached the DOM as "Moved by about -Infinity hours" and as
     <YAxis domain={[Infinity, -Infinity]}>. */
  it("returns null rather than Infinity or NaN", () => {
    const st = rangeStats(P, []);
    expect(st.n).toBe(0);
    for (const k of ["avgSleep", "movePct", "wakeDrift", "sleepyWindow"]) {
      expect(st[k]).toBeNull();
    }
    expect(JSON.stringify(st)).not.toMatch(/Infinity|null,"NaN"|NaN/);
  });
});

describe("rangeStats on the mock", () => {
  const nights = materializeNights(P);

  it("computes an average in a plausible range", () => {
    const st = rangeStats(P, nights);
    expect(st.n).toBe(45);
    expect(st.avgSleep).toBeGreaterThan(5);
    expect(st.avgSleep).toBeLessThan(9);
  });

  /* Regression: the old seedHistory computed sleepyWindow and then failed to
     return it, so every range in the app reported "early" forever. */
  it("does not report the same sleepy window for every range", () => {
    const windows = [3, 7, 14, 45].map((k) => rangeStats(P, nights.slice(0, k)).sleepyWindow);
    expect(new Set(windows).size).toBeGreaterThan(1);
  });

  it("surfaces the caffeine correlation as the main pattern", () => {
    const pat = readPatterns(P, rangeStats(P, nights));
    expect(pat.mainPattern).toMatch(/caffeine/i);
  });

  it("suppresses the main pattern below five nights", () => {
    const pat = readPatterns(P, rangeStats(P, nights.slice(0, 3)));
    expect(pat.mainPattern).not.toMatch(/caffeine crossed the cutoff/i);
  });
});

describe("foldNight", () => {
  it("returns null when nothing was logged", () => {
    expect(foldNight(P, [], {})).toBeNull();
  });

  it("measures sleep from the sleepStart and wake logs", () => {
    const logs = [
      { id: "a", t: 450, type: "sleepStart", value: 1 },
      { id: "b", t: 450 + 7 * 60, type: "wake", value: "ontime" },
    ];
    const night = foldNight(P, logs, {});
    expect(night.sleepHours).toBeCloseTo(7, 1);
    expect(night.sleepEstimated).toBe(false);
  });

  it("falls back to the reflection bucket and flags the night estimated", () => {
    const logs = [{ id: "a", t: 450, type: "sleepStart", value: 1 }];
    const night = foldNight(P, logs, { slept: "5–6h" });
    expect(night.sleepHours).toBe(5.5);
    expect(night.sleepEstimated).toBe(true);
  });

  it("leaves sleepHours null when there is neither a log pair nor a bucket", () => {
    const night = foldNight(P, [{ id: "a", t: 100, type: "water", value: 1 }], {});
    expect(night.sleepHours).toBeNull();
  });

  it("excludes null-sleep nights from the average instead of counting them as zero", () => {
    const nights = materializeNights(P).slice(0, 4);
    const withNull = [...nights, { ...nights[0], id: "x", sleepHours: null }];
    expect(rangeStats(P, withNull).avgSleep).toBeCloseTo(rangeStats(P, nights).avgSleep, 5);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test`
Expected: FAIL, cannot resolve `./stats.js`.

- [ ] **Step 3: Write `src/stats.js`**

Start from the existing `rangeStats`/`readPatterns` in `App.jsx` (lines 834-998) and change these things:

```js
export const RANGES = [
  { key: "today", label: "Today",    nights: 1,   inMore: false },
  { key: "3d",    label: "3 days",   nights: 3,   inMore: false },
  { key: "1w",    label: "1 week",   nights: 7,   inMore: false },
  { key: "2w",    label: "2 weeks",  nights: 14,  inMore: true  },
  { key: "1m",    label: "1 month",  nights: 30,  inMore: true  },
  { key: "all",   label: "All time", nights: 999, inMore: true  },
];

export const SLEEPY_LABEL = {
  early: "Early shift", mid: "Mid-shift", deep: "Deep night", late: "Last hours",
};

const BUCKET = { "Under 5h": 4.5, "5–6h": 5.5, "7–9h": 8, "Over 9h": 9.5 };
const WINDOW_FROM_REFLECTION = {
  "Early shift": "early", "Mid-shift": "mid", "Deep night": "deep", "Last hours": "late",
};

const avgOf = (arr, pick) => {
  const vals = arr.map(pick).filter((v) => v !== null && v !== undefined && !Number.isNaN(v));
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
};
```

`rangeStats(profile, nights)` must guard every aggregate:

```js
export function rangeStats(profile, nights) {
  const n = nights.length;
  if (!n) {
    return {
      n: 0, avgSleep: null, lateCount: 0, avgClean: null, avgLate: null,
      wakeDrift: null, movePct: null, moveDone: 0, moveTotal: 0,
      naps: 0, quiets: 0, missed: 0, groggy: 0, sleepyWindow: null,
      waterAvg: null, caffeineAvg: null, deepHeavy: 0, skippedMeals: 0,
      lateSnacks: 0, strain: 0, lateLightDone: 0,
    };
  }
  // ... existing logic, but every Math.min/Math.max spread guarded by n > 0,
  // every average via avgOf, and sleepyWindow read from the record field.
}
```

`sleepyWindow` is now the mode of `nights.map(x => x.sleepyWindow)`, computed from the field the records actually carry.

In `readPatterns`, gate `mainPattern`:

```js
const canCompare = st.n >= 5 && st.avgClean !== null && st.avgLate !== null;
let mainPattern;
if (canCompare && st.avgClean - st.avgLate > 0.4) {
  mainPattern = `You slept ${st.avgLate.toFixed(1)}h on nights when caffeine crossed the cutoff, against ${st.avgClean.toFixed(1)}h when it did not.`;
} else if (st.n < 5) {
  mainPattern = `${st.n} ${st.n === 1 ? "night" : "nights"} on record. Patterns need about a week to show up.`;
} else if (st.movePct !== null && st.movePct < 40) {
  mainPattern = "Movement resets dropped off through this period.";
} else {
  mainPattern = `Sleepiness clustered in the ${SLEEPY_LABEL[st.sleepyWindow].toLowerCase()} window.`;
}
```

Rewrite every prose string in `readPatterns` to **one sentence** and remove em dashes, per the Global Constraints.

`foldNight`:

```js
/** Fold tonight's logs into the same shape the mock produces. Returns null
    when nothing has been logged, so callers can simply not append it. */
export function foldNight(profile, logs, reflection = {}) {
  if (!logs.length) return null;

  const ph = calculateShiftPhases(profile);
  const cutoffAbs = calculateCaffeineCutoff(profile, ph);
  const gap = movementInterval(profile);
  const of = (t) => logs.filter((l) => l.type === t);
  const clock = (abs) => ((Math.round(abs) % DAY) + DAY) % DAY;

  const sleepLog = of("sleepStart").slice(-1)[0] || null;
  const wakeLog = of("wake").slice(-1)[0] || null;

  let sleepHours = null;
  let sleepEstimated = false;
  if (sleepLog && wakeLog && wakeLog.t > sleepLog.t) {
    sleepHours = Math.round(((wakeLog.t - sleepLog.t) / 60) * 10) / 10;
  } else if (BUCKET[reflection.slept] !== undefined) {
    sleepHours = BUCKET[reflection.slept];
    sleepEstimated = true;
  }

  const items = of("item");
  const napLog = of("nap").slice(-1)[0] || null;
  const restKind = !napLog ? "none" : napLog.value === "quiet" ? "quiet" : "nap";

  return {
    id: "tonight",
    dayOffset: 0,
    sleepStart: sleepLog ? clock(sleepLog.t) : null,
    wake: wakeLog ? clock(wakeLog.t) : null,
    sleepHours,
    sleepEstimated,
    cutoff: cutoffAbs === null ? null : clock(cutoffAbs),
    caffeine: of("caffeine").map((l) => clock(l.t)),
    moveDone: items.filter((l) => l.value.status === "done" && l.value.category === "movement").length,
    moveTotal: Math.max(1, Math.floor(ph.length / gap)),
    restKind,
    restMin: restKind === "nap" ? 20 : restKind === "quiet" ? 10 : 0,
    groggy: napLog ? napLog.value === "groggy" : false,
    water: of("water").length,
    screenStrain: of("screen").length,
    sleepyWindow: WINDOW_FROM_REFLECTION[reflection.sleepiest] ?? null,
    skippedMeal: of("meal").some((l) => l.value === "skipped"),
    heavyMeal: of("meal").some((l) => l.value === "heavy"),
    lateSnack: false,
    lateLightDone: false,
  };
}
```

Delete `seedHistory` and `rnd` from `App.jsx` entirely.

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: derive all stats from NightRecords, drop the PRNG history"
```

---

## Task 7: UI primitives and the range control

**Files:**
- Create: `src/ui/index.jsx`
- Modify: `src/App.jsx` (remove the moved components)

**Interfaces:**
- Consumes: `src/tokens.js`, `src/icons.jsx`.
- Produces: `Card`, `Btn`, `Pill`, `Badge`, `Display`, `Eyebrow`, plus:
  - `Select({ T, label, value, onChange, options, placeholder })` — native `<select>`, `options` is `string[]`
  - `RangeControl({ T, value, onChange })` — `value` is a `RANGES` key; renders the three inline pills plus a More dropdown

- [ ] **Step 1: Move the existing primitives**

Move `Card` (line 1349), `Btn`, `Pill`, `Badge`, `Display`, `Eyebrow` from `App.jsx` into `src/ui/index.jsx` unchanged, adding `export`.

- [ ] **Step 2: Add `Select`**

```jsx
/* Native select rather than a custom dropdown: accessible by default, and on
   iOS it opens the system wheel picker, which suits one-handed use at 3am. */
export function Select({ T, label, value, onChange, options, placeholder = "Choose one" }) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      {label && (
        <div style={{ fontFamily: FONT_TEXT, fontSize: 14.5, fontWeight: 600, color: T.ink, marginBottom: 6 }}>
          {label}
        </div>
      )}
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        style={{
          width: "100%", appearance: "none", fontFamily: FONT_TEXT, fontSize: 15,
          color: value ? T.ink : T.faint, background: T.card,
          border: `1px solid ${T.hair}`, borderRadius: 14, padding: "12px 14px",
        }}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}
```

- [ ] **Step 3: Add `RangeControl`**

```jsx
export function RangeControl({ T, value, onChange }) {
  const inline = RANGES.filter((r) => !r.inMore);
  const more = RANGES.filter((r) => r.inMore);
  const activeMore = more.find((r) => r.key === value);

  return (
    <div style={{ display: "flex", gap: 7, alignItems: "center", marginBottom: 18 }}>
      {inline.map((r) => (
        <Pill key={r.key} T={T} hue={DOMAIN.sleep.hue} active={value === r.key}
          onClick={() => onChange(r.key)}>{r.label}</Pill>
      ))}
      <div style={{ position: "relative" }}>
        <select
          value={activeMore ? activeMore.key : ""}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          aria-label="More ranges"
          style={{
            appearance: "none", fontFamily: FONT_TEXT, fontSize: 13.5, fontWeight: 600,
            color: activeMore ? T.bg : T.muted,
            background: activeMore ? DOMAIN.sleep.hue : "transparent",
            border: `1px solid ${activeMore ? DOMAIN.sleep.hue : T.hair}`,
            borderRadius: 999, padding: "7px 26px 7px 13px",
          }}
        >
          <option value="">More</option>
          {more.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
        <CaretDown size={12} color={activeMore ? T.bg : T.muted}
          style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
      </div>
    </div>
  );
}
```

The More button shows the selected long-range label so the selection stays visible when it comes from the dropdown.

- [ ] **Step 4: Build**

Run: `npx vite build`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor: extract ui primitives, add Select and RangeControl"
```

---

## Task 8: Dashboard — two charts, three tiles, four panels

**Files:**
- Create: `src/screens/Dashboard.jsx`
- Modify: `src/App.jsx:2629-2857` (delete the inline `Dashboard`)

**Interfaces:**
- Consumes: `src/stats.js`, `src/ui/index.jsx`, `src/tokens.js`, `src/time.js`.
- Produces: `export default function Dashboard({ T, profile, nights, rangeKey, setRangeKey, say, setProfile })`.

- [ ] **Step 1: Create the component at module scope**

Move the body of the current inline `Dashboard`, then apply the changes below. It takes props; it closes over nothing.

- [ ] **Step 2: Cut to two charts**

Keep only:
1. **When you slept** — the stacked `BarChart`, unchanged in form. Add estimated-night treatment: `fill` uses `tint(DOMAIN.sleep.hue, 0.35)` when `d.estimated` is true, so a bucket-derived night is visibly not measured.
2. **Caffeine against your cutoff** — the `ComposedChart`, unchanged.

Delete the wake-drift `LineChart`, the movement `BarChart`, and the rest `BarChart`. Their panels become text-only, using the figures already on `st`.

Guard the sleep chart's domain, which previously produced `[Infinity, -Infinity]`:

```js
const bases = sleep.map((d) => d.base);
const lo = bases.length ? Math.min(...bases) - 40 : 0;
const hi = bases.length ? Math.max(...sleep.map((d) => d.base + d.len)) + 40 : DAY;
```

- [ ] **Step 3: Cut to three tiles**

```jsx
<Tile cat="sleep"     k="Average sleep"   v={st.avgSleep === null ? "-" : `${st.avgSleep.toFixed(1)}h`} />
<Tile cat="caffeine"  k="Cutoff crossed"  v={`${st.lateCount} ${st.lateCount === 1 ? "night" : "nights"}`} />
<Tile cat="movement"  k="Movement resets" v={st.movePct === null ? "-" : `${st.movePct}% done`} />
```

Delete the "Most sleepy" tile. Change the grid to `gridTemplateColumns: "1fr 1fr 1fr"` with `gap: 8`.

- [ ] **Step 4: Collapse eight panels to four**

Keep: **Sleep** (chart), **Caffeine** (chart), **Movement and rest** (text, combining `pat.movement` and `pat.rest`), **Light and food** (text, combining `pat.light` and `pat.foodHydration`). Delete the standalone "Sleep average", "Wake time drift", and "Sleepiness pattern" panels; fold the sleepiness sentence into the Sleep panel's `line`.

- [ ] **Step 5: Add the Today view**

When `rangeKey === "today"`, return early with a chartless summary before any chart renders:

```jsx
if (rangeKey === "today") {
  const t = nights.find((x) => x.dayOffset === 0);
  if (!t) {
    return (
      <div style={{ padding: "4px 20px 0" }}>
        <RangeControl T={T} value={rangeKey} onChange={setRangeKey} />
        <Eyebrow T={T}>Today</Eyebrow>
        <Display T={T} size={30} style={{ marginBottom: 8 }}>Nothing logged yet.</Display>
        <p style={{ fontFamily: FONT_TEXT, fontSize: 14.5, color: T.muted, lineHeight: 1.5 }}>
          Log caffeine, water, rest, or your sleep and tonight will appear here.
        </p>
      </div>
    );
  }
  // otherwise: tiles + plain figures for sleep, caffeine vs cutoff, resets, rest, water. No charts.
}
```

- [ ] **Step 6: Wire the range control**

Replace the `RANGES.map(...)` pill row with `<RangeControl T={T} value={rangeKey} onChange={setRangeKey} />`.

- [ ] **Step 7: Verify in the browser**

Run: `npx vite build && npx vite --port 5173 --host 127.0.0.1`

Check by hand:
- Exactly two charts render.
- Switching Today / 3 days / 1 week / More changes the numbers.
- Today with no logs shows the empty state.
- Search the rendered DOM for `Infinity`, `NaN`, `undefined`. Expected: none.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: rebuild dashboard with two charts, three tiles, new ranges"
```

---

## Task 9: Plan page — remove the phase bands

**Files:**
- Create: `src/screens/PlanTab.jsx`
- Modify: `src/App.jsx:2860-2947`

**Interfaces:**
- Consumes: `src/planner.js`, `src/ui/index.jsx`.
- Produces: `export default function PlanTab({ T, profile, plan, s, now, onAct, hideDone, setHideDone, showAllPlan, setShowAllPlan, setScreen, setAdjustDraft, setAdjusting })`.

- [ ] **Step 1: Replace grouping with a flat list**

Delete the `groups` construction and the phase-header markup (the uppercase label, the `<span>` hairline rule, and the "Circadian low" badge that sat on it). Render:

```jsx
{display.map((it) =>
  it.recurring ? (
    <RecurringCard key="recurring" item={it} T={T} gap={movementInterval(profile)}
      onExpand={() => setShowAllPlan(true)}
      onAdjust={() => { setAdjustDraft({}); setAdjusting(it.id); }} />
  ) : (
    <TimelineItem key={it.id} item={it} T={T} now={now}
      status={s.itemStatus(it.id)} onAct={onAct}
      inDeepNight={!!plan.ph.deepNight && it.at >= plan.ph.deepNight[0] && it.at < plan.ph.deepNight[1]} />
  )
)}
```

`display` is already sorted by `at`. This also fixes the defect where an item outside every phase window vanished from the page while still counting toward "X of Y done" — a flat list cannot drop items.

- [ ] **Step 2: Move the circadian-low marker onto the card**

In `TimelineItem`, when `inDeepNight` is true, render a small "Circadian low" chip in the card header beside the title, using the existing pill styling (`#6C6BE8` on `tint("#6C6BE8", 0.14)`).

- [ ] **Step 3: Verify no item is dropped**

Set the pre-shift meal to 300 minutes before the shift via the Adjust sheet, then confirm the card is still visible and the "X of Y done" denominator matches the number of cards on screen.

- [ ] **Step 4: Build, screenshot, commit**

```bash
npx vite build
git add -A && git commit -m "feat: flatten plan page, drop phase band headers"
```

---

## Task 10: Reflection page — selects

**Files:**
- Create: `src/screens/LogTab.jsx`
- Modify: `src/App.jsx:2949-3250`

**Interfaces:**
- Consumes: `src/ui/index.jsx` (`Select`), `src/stats.js`.
- Produces: `export default function LogTab({ T, profile, setProfile, logs, setLogs, plan, s, now, reflection, setReflection, logDraft, setLogDraft, say, push })` and a module-scope `ReflectionBlock`.

- [ ] **Step 1: Fix the two log-value bugs first**

In `LOG_TYPES`:

```js
{ v: "wake", l: "Woke up", cat: "sleep", val: "ontime",
  details: ["Earlier", "On time", "Later"] },
```

In `saveManualLog`, map the notes to values:

```js
if (t.v === "wake") value = note === "Earlier" ? "earlier" : note === "Later" ? "later" : "ontime";
if (t.v === "nap")  value = note === "Woke groggy" ? "groggy" : note === "Quiet rest" ? "quiet" : "ok";
```

`"quiet"` is a new distinct value. Previously "Quiet rest" mapped to `"couldnt"`, which told the plan the user *failed* to nap when they had deliberately rested.

**Do not edit `deriveState` for this.** It already reads `napTaken: some(l.value !== "couldnt")` and `napFailed: some(l.value === "couldnt")`, so introducing `"quiet"` makes both correct on its own: a quiet rest now counts as rest taken and no longer counts as a failed nap. Changing those predicates as well would double-apply the fix.

`"couldnt"` remains a valid value, still produced by the "could not sleep" path on the nap logging action in the timeline. Verify it is still reachable after this change; if nothing produces it, `napFailed` is dead and the swap-to-quiet-rest copy at the `deep-rest` card will never fire.

Also in `deriveState`, change `of("wake")[0]` to `of("wake").slice(-1)[0]` so a corrected entry wins, matching how `sleepQuality` already behaves.

- [ ] **Step 2: Replace the 13-pill grid with one select**

```jsx
<Select T={T} label="What are you logging?" placeholder="Choose a type"
  value={logDraft.type ? LOG_TYPES.find((x) => x.v === logDraft.type)?.l : null}
  options={LOG_TYPES.map((x) => x.l)}
  onChange={(label) => {
    const found = LOG_TYPES.find((x) => x.l === label);
    setLogDraft({ ...logDraft, type: found ? found.v : null, note: "" });
  }} />

{t?.details && (
  <Select T={T} label="Detail" placeholder="Optional"
    value={logDraft.note || null} options={t.details}
    onChange={(note) => setLogDraft({ ...logDraft, note })} />
)}
```

- [ ] **Step 3: Replace the reflection pills with seven selects**

```jsx
function ReflectionBlock({ T, reflection, setReflection, profile, setProfile, push, say }) {
  return (
    <div>
      {REFLECT_QS.map((x) => (
        <Select key={x.k} T={T} label={x.q} options={x.o}
          value={reflection[x.k] ?? null}
          onChange={(v) => setReflection({ ...reflection, [x.k]: v })} />
      ))}
      <Btn T={T} full onClick={() => { /* existing save logic, unchanged */ }}>
        Save reflection
      </Btn>
    </div>
  );
}
```

`ReflectionBlock` is module scope, not nested in `LogTab`.

- [ ] **Step 4: Verify the selects hold their value**

Run the app, open Reflection, answer all seven questions, wait past a minute boundary so the clock interval fires, and confirm no answer resets. This is the behavioural check for Task 11's hoisting.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: reflection and log picker become selects"
```

---

## Task 11: Hoist the remaining screens

**Files:**
- Create: `src/screens/LiveTab.jsx`, `src/screens/Sheets.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: everything above.
- Produces: `LiveTab`, `Sheet`, `AdjustSheet`, `ProfileSheet`, all at module scope taking explicit props.

- [ ] **Step 1: Move them out**

Move `LiveTab` (3253), `ProfileSheet` (3331), `Sheet` (3612), `AdjustSheet` (3722) and their nested helpers (`Column` inside `TimeWheel`, `Row` inside `ProfileSheet`, `Section`/`Row` inside `Recommendation`) to module scope. Every value each one closed over becomes a prop.

- [ ] **Step 2: Confirm nothing is left inside `App`**

Run:

```bash
grep -nE "^  const [A-Z][A-Za-z]+ = \(" src/App.jsx
```

Expected: no output. Any match is a component still nested in `App`'s body and will remount every render.

- [ ] **Step 3: Fix the clock-interval dependency**

The effect currently lists only `shiftStart`, `shiftEnd`, `plannedSleep`, so changing `sleepGoalHours` leaves the interval clamping against a stale `ph.sleepEnd`. Add `profile.sleepGoalHours` to the dependency array.

- [ ] **Step 4: The focus regression test**

Run the app, open Reflection, and type `abcde` into the note field in one go.
Expected: the field contains `abcde`. Before hoisting it kept only the last character, because every keystroke remounted the subtree.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor: hoist all screen components to module scope"
```

---

## Task 12: Copy pass

**Files:**
- Modify: `src/planner.js`, `src/stats.js`, `src/screens/*.jsx`

- [ ] **Step 1: Cut every `why:` to one sentence**

All 36 are kept. Preserve the causal claim, drop the elaboration:

> Before: "Digestion slows overnight. Eating your largest meal before the shift means you are not relying on heavy food during the hours when it sits worst and interferes with sleep afterward."
>
> After: "Digestion slows overnight, so a large meal now sits better than one mid-shift."

- [ ] **Step 2: Remove every em dash**

Run: `grep -rn "—" src/`

Rewrite each hit as a period or a comma. Do **not** substitute an en dash. Leave the 5 existing en dashes in numeric ranges (`5–6h`, `7–9h`) alone.

- [ ] **Step 3: Verify**

Run: `grep -rc "—" src/ | grep -v ":0" || echo "clean"`
Expected: `clean`.

Then confirm every `why` is a single sentence:

```bash
node -e '
const fs=require("fs");
for (const f of ["src/planner.js"]) {
  const m = fs.readFileSync(f,"utf8").match(/why: "(.*?)"/gs) || [];
  m.forEach((w,i) => {
    const sentences = (w.match(/\.\s/g) || []).length;
    if (sentences > 0) console.log(f, i, "MULTI-SENTENCE:", w.slice(0,70));
  });
  console.log(f, "checked", m.length, "why strings");
}'
```

Expected: 36 checked, no MULTI-SENTENCE lines.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "content: one-sentence explainers, no em dashes"
```

---

## Task 13: Full verification

- [ ] **Step 1: Test and build**

Run: `npm test && npx vite build`
Expected: all tests PASS, build clean.

- [ ] **Step 2: Drive the app end to end**

Reuse the Playwright driver pattern from this session (`chromium.launch({ channel: "chrome" })` — the cached Playwright browsers are build 1228 while the package expects 1234, so the bundled chromium will not launch). Walk: landing → 14 quiz questions → plan → each of the four tabs. Assert zero `pageerror` and zero `console.error` other than the favicon 404.

- [ ] **Step 3: Work the spec's verification list**

1. Run the quiz twice with different shift times; confirm mock history moves with the profile.
2. Confirm the sleepiness reading differs across at least two ranges.
3. Confirm `mainPattern` names the caffeine correlation at All time.
4. Today with nothing logged shows the empty state, no `Infinity`/`NaN`/`undefined` in the DOM.
5. Type five characters into the reflection note; all five land.
6. `grep -rn "—" src/` returns nothing.
7. `grep -rn "lucide" src/ package.json` returns nothing.
8. `grep -rn "localStorage\|sessionStorage\|indexedDB" src/` returns nothing.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "test: full verification pass"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §1 Icons | 3 |
| §2 Copy | 12 |
| §3.1 Mock dataset | 5 |
| §3.2 Tonight layers on | 6 (`foldNight`) |
| §3.3 NightRecord | 5, 6 |
| §3.4 Estimated sleep | 6, 8 (dimmed bar) |
| §3.5 Two charts, three tiles, four panels | 8 |
| §3.6 Thin-data guards | 6, 8 |
| §4 Ranges | 7 (`RangeControl`), 8 (Today) |
| §5 Plan page | 9 |
| §6 Reflection | 10 |
| §7.1 Hoisting | 10, 11 |
| §7.2 File split | 1, 2, 4, 5, 6, 7, 8, 9, 10, 11 |
| §8 Bugs 1-7 | 4 (1, 5, 6), 10 (2, 3, 4), 11 (7) |
| §9 Verification | 13 |

**Type consistency:** `NightRecord` fields are defined in Task 5 and consumed unchanged in Tasks 6 and 8. `RANGES` uses `{ key, label, nights, inMore }` in Tasks 6, 7, 8. `foldNight(profile, logs, reflection)` has the same signature in Tasks 6 and 13. `baseProfile` is defined in Task 4 and used only there.

**Known gap:** the spec's out-of-scope list stands. Achievements still read `logs` plus the new `nights` array; Task 6 keeps the function compiling against `NightRecord` but does not rebase its thresholds onto real data.
