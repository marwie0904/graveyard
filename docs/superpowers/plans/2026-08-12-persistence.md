# Persistence (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the plan survive a refresh — `profile`, `logs`, `reflection` and the theme come back from `localStorage`, and a blob left over from a previous night gives up its logs before it can pollute tonight's plan.

**Architecture:** One new module, `src/storage.js`, holding `load`, `save`, and the single rule `forNight`. `App.jsx` reads the blob once at import time into a module-level `boot` constant, seeds six `useState` initialisers from it, and writes the whole blob back in one `useEffect`. One key, one blob, one write. Nothing is folded into an archive — that is Phase 2.

**Tech Stack:** Plain ES modules, React 18, Vitest 2, `localStorage`. No new dependencies.

## Global Constraints

- **No new dependencies.** `localStorage` and `JSON` only. Do not add `jsdom`, `idb`, or a state library.
- **One key.** `"gy.v1"`, holding `{ night, profile, logs, reflection, theme }`. Not one key per value.
- **`KEY` is not exported.** `load` and `save` close over it.
- **The log shape does not change.** `t` stays axis-minutes. Do not add a timestamp to `push()`.
- **Do not touch `generateTimeline`, `foldNight`, `materializeNights`, or `history`.** The mock history stays the mock history until Phase 3.
- **Vitest runs in `environment: "node"`** (`vitest.config.js`). There is no `localStorage` in tests. Do not stub one; see Task 1.
- Spec: `docs/superpowers/specs/2026-08-12-persistence-design.md`.
- Test command: `npm test` (`vitest run`). Single file: `npx vitest run src/storage.test.js`.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/storage.js` | Create (~14 lines) | The only module that knows `localStorage` exists. Reads, writes, and owns the one rule about what a stale blob keeps. |
| `src/storage.test.js` | Create (~20 lines) | Two assertions on `forNight`, the phase's only real logic. |
| `src/App.jsx` | Modify (~20 lines across 5 sites) | Boots from the blob, writes it back, and gains a Start over row. |

Three tasks. Task 1 is the module and stands alone. Task 2 is the wiring, which is the phase's actual deliverable. Task 3 is the Start over row, which a reviewer could reject without rejecting Task 2.

---

### Task 1: `src/storage.js` and its test

**Files:**
- Create: `src/storage.js`
- Test: `src/storage.test.js`

**Interfaces:**
- Consumes: nothing. No imports at all.
- Produces:
  - `load() -> object` — everything saved under the key, or `{}` if there is nothing readable there.
  - `save(v: object) -> void` — serialises `v` under the key. Never throws.
  - `forNight(s: object, id: string) -> object` — `s` unchanged if `s.night === id`, otherwise `{ profile, theme }` only.

**Background the implementer needs:**

The app currently persists nothing (`App.jsx:2298` says so in a comment). This module is the whole storage layer and it should stay this size.

The `try/catch` on both sides is not defensive padding. Safari in private browsing throws on `setItem`; a corrupt or half-written entry throws in `JSON.parse` and would white-screen the app on boot. That is a trust boundary and it is the entire reason this module exists rather than two inline calls.

`forNight` is the phase's one rule. A saved blob carries a `night` field — the `"YYYY-MM-DD"` string from `nightOf` (Phase 0). If the app boots and that stamp is not tonight, the blob is a previous night's: the profile and the theme are still true, but the logs and the reflection are not, and letting them through means last night's done items appear ticked on tonight's plan and last night's coffee moves tonight's cutoff. Dropping them loses nothing that is not already lost today, where a refresh kills them outright. Phase 2 replaces the drop with a fold into an archive, in this function.

It is a one-line function with one caller, which is normally the shape to inline. It stays separate because it is the only thing in this phase worth an assertion, and because Phase 2 grows its body rather than deleting it.

- [ ] **Step 1: Write the failing test**

Create `src/storage.test.js`:

```js
import { describe, it, expect } from "vitest";
import { forNight } from "./storage.js";

describe("forNight", () => {
  const saved = {
    night: "2026-08-11",
    profile: { shiftStart: "22:00", shiftEnd: "07:00", sleepGoalHours: 7.5 },
    logs: [{ id: "caffeine-1", t: 1350, type: "caffeine", value: 1 }],
    reflection: { slept: "6-7h" },
    theme: true,
  };

  it("keeps the whole blob when the stamp is tonight", () => {
    expect(forNight(saved, "2026-08-11")).toEqual(saved);
  });

  it("keeps only the profile and the theme when the stamp is another night", () => {
    // last night's logs and reflection must not reach tonight's plan
    expect(forNight(saved, "2026-08-12")).toEqual({ profile: saved.profile, theme: true });
  });
});
```

Two cases and no more. `load` and `save` get none: asserting that `JSON.parse` round-trips is testing the standard library, and asserting that an empty `catch` is empty needs a fake `localStorage` to throw from. Worse, such a stub covers only the safe half of the trust boundary — the dangerous half is a blob that parses cleanly but is missing `shiftStart`, which throws in Task 2's boot expression where no storage-level test reaches. Task 2 Step 7 verifies that path by hand.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/storage.test.js`

Expected: FAIL — `Failed to resolve import "./storage.js"`.

- [ ] **Step 3: Write the implementation**

Create `src/storage.js`:

```js
/* Everything the app remembers, in one key. try/catch on both sides is the
   trust boundary, not padding: Safari private browsing throws on setItem, and
   a corrupt entry would otherwise white-screen the app on boot. */
const KEY = "gy.v1";

/** Everything saved, or {} if there is nothing readable there. */
const load = () => {
  try { const v = localStorage.getItem(KEY); return v ? JSON.parse(v) : {}; }
  catch { return {}; }
};

const save = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} };

/** Last night's blob keeps the profile and the theme; tonight's keeps everything.
    Dropping stale logs loses nothing a refresh does not already lose today, and
    it keeps last night's ticked items off tonight's plan.
    ponytail: Phase 2 replaces the drop with a fold into the archive, here. */
const forNight = (s, id) => (s.night === id ? s : { profile: s.profile, theme: s.theme });

export { load, save, forNight };
```

`KEY` is deliberately not exported — nothing outside this module should name it.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/storage.test.js`

Expected: PASS, 2 tests.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`

Expected: PASS. Nothing imports `storage.js` yet, so no existing file can have moved.

- [ ] **Step 6: Commit**

```bash
git add src/storage.js src/storage.test.js
git commit -m "feat: one key holds everything the app remembers"
```

---

### Task 2: Boot from the blob and write it back

**Files:**
- Modify: `src/App.jsx` — import (after line 16), a new `boot` constant above line 2270, six `useState` initialisers (lines 2271–2280), and the comment at 2298–2299 which becomes the write effect.

**Interfaces:**
- Consumes: `load`, `save`, `forNight` from Task 1. `nightOf(ph, d) -> { id, now }` from `src/time.js` (Phase 0) and `calculateShiftPhases(profile) -> ph` from `src/planner.js`, both already imported in `App.jsx`.
- Produces: nothing importable. The observable contract is that a refresh restores the app, and that a blob stamped with another night restores only the profile and the theme.

**Background the implementer needs:**

`nightOf(calculateShiftPhases(profile))` returns `{ id, now }` — `id` is the `"YYYY-MM-DD"` name of the night, `now` is the app's absolute-minute axis position. Both come from one call, which is the point of Phase 0: two functions answering "which night is it" is how a log lands on the wrong night.

The read happens once, at module import, in a top-level constant rather than inside the component. Six initialisers need the same object, so re-reading per initialiser would mean six `getItem` calls and six chances to disagree.

The `try/catch` around the boot expression is doing more work than the one inside `load`. `load` catches malformed JSON. The dangerous case is JSON that parses cleanly into the wrong shape: `calculateShiftPhases` calls `toMin(profile.shiftStart)`, which calls `.split(":")` on `undefined` and throws — at module scope, before React has mounted, where no error boundary exists. That is a white screen on every subsequent load with no way out but devtools. One `catch` returning `{}` turns it into "you get the quiz again", which is the honest failure. This is the entire schema validation Phase 1 needs.

Line numbers below are from commit `e140a60`; find the code by content if they have drifted.

- [ ] **Step 1: Add the storage import**

In `src/App.jsx`, immediately after line 16:

```js
import { foldNight, achievements } from "./stats.js";
```

add:

```js
import { load, save, forNight } from "./storage.js";
```

- [ ] **Step 2: Add the boot constant**

Immediately above `export default function App() {` (line 2270), insert:

```js
/* Read once, at import. A blob stamped with a different night is a previous
   night's: the profile and the theme survive it, the logs and the reflection do
   not, so tonight's plan starts clean. Folding them into an archive instead is
   Phase 2.
   The try/catch covers more than JSON. A blob that parses but is missing
   shiftStart throws inside calculateShiftPhases, at module scope, where no error
   boundary can catch it — a white screen before React has mounted. Falling back
   to the quiz is the honest failure, and it is the whole of schema validation
   for this phase. */
const boot = (() => {
  try {
    const s = load();
    if (!s.profile) return {};
    const { id, now } = nightOf(calculateShiftPhases(s.profile));
    return { ...forNight(s, id), now };
  } catch { return {}; }
})();
```

- [ ] **Step 3: Seed the six initialisers**

Step 2 pushed everything below it down by about thirteen lines. The line numbers
here are the pre-Step-2 ones; match on the code, not the number.

`src/App.jsx:2271`, change:

```js
  const [screen, setScreen] = useState("welcome");
```

to:

```js
  const [screen, setScreen] = useState(boot.profile ? "app" : "welcome");
```

`src/App.jsx:2273-2275`, change:

```js
  const [profile, setProfile] = useState(null);
  const [logs, setLogs] = useState([]);
  const [now, setNow] = useState(0);
```

to:

```js
  const [profile, setProfile] = useState(boot.profile ?? null);
  const [logs, setLogs] = useState(boot.logs ?? []);
  /* seeded, not left at 0: the tick effect below only runs after the first
     paint, so without this the restored plan renders one frame at minute zero */
  const [now, setNow] = useState(boot.now ?? 0);
```

`src/App.jsx:2279-2280`, change:

```js
  const [themeOverride, setThemeOverride] = useState(null);
  const [reflection, setReflection] = useState({});
```

to:

```js
  const [themeOverride, setThemeOverride] = useState(boot.theme ?? null);
  const [reflection, setReflection] = useState(boot.reflection ?? {});
```

Leave every other `useState` in that block exactly as it is. `tab`, `rangeKey`, `hideDone` and `showAllPlan` are transient UI and Phase 4 owns the question of what survives a refresh.

- [ ] **Step 4: Replace the "nothing is persisted" comment with the write effect**

`src/App.jsx:2298-2299`, replace these two lines:

```js
  /* Nothing is persisted. The app boots to the quiz every time, by design:
     there is no backend, no database, and no storage of any kind. */
```

with:

```js
  /* One key, one blob, one write. The night stamp is derived here rather than
     held in state: nothing renders it, and Phase 2 reads it from the tick below,
     which is where the rollover comparison belongs. The guard also means nothing
     reaches the device until the quiz is finished. */
  useEffect(() => {
    if (!profile) return;
    save({
      night: nightOf(calculateShiftPhases(profile)).id,
      profile, logs, reflection, theme: themeOverride,
    });
  }, [profile, logs, reflection, themeOverride]);
```

The `useEffect` that follows — the 30s tick — is untouched: its body, its `setInterval`, its cleanup and its dependency array all stay exactly as they are.

- [ ] **Step 5: Verify a refresh restores the plan**

There is no `npm test` step here. Nothing in the suite imports `App.jsx` —
`share.test.js` reaches `screens/Dashboard.jsx` and no test goes further — so the
suite is structurally blind to this task. The dev server failing to compile is
the real check, and it happens on the next line.

Run: `npm run dev` and open the printed URL.

1. Complete the quiz with the default answers (22:00–07:00, sleep 08:00, 7.5h).
2. On the Plan tab, tick one item done and skip another.
3. Log a caffeine and a water from the `+` button.
4. Hard-refresh the page (Cmd-Shift-R).

Expected: the app comes back on the Dashboard — no welcome, no disclaimer, no quiz — and the Plan tab still shows the ticked item done and the skipped one skipped. The Reflection tab lists both logs.

- [ ] **Step 6: Verify a stale night drops the logs but keeps the profile**

In devtools → Application → Local Storage, find the `gy.v1` key and change its `"night"` value to `"2020-01-01"`. Refresh.

Expected: still no quiz — the profile survived — but the Plan tab's items are all untouched again and the Reflection tab is empty. That is `forNight` doing its job.

- [ ] **Step 7: Verify a corrupt blob falls back to the quiz rather than a white screen**

Two separate checks, refreshing after each:

1. Set the value of `gy.v1` to `not json at all`. Refresh. Expected: the welcome screen. This is `load`'s catch.
2. Set the value to `{"night":"2026-08-12","profile":{}}` — valid JSON, no `shiftStart`. Refresh. Expected: the welcome screen, **not** a blank page. This is the boot expression's catch, and it is the one that does not exist in `app-design-basis.md` §2.

If check 2 shows a blank page and a `Cannot read properties of undefined` in the console, the `try/catch` is in the wrong place — it must wrap the `nightOf(calculateShiftPhases(...))` call, not just the `load()`.

- [ ] **Step 8: Verify the theme and the adjusted parameters stick**

1. Open the profile sheet → Personalize → set the theme to "Always dark". Refresh. Expected: still dark.
2. On the Plan tab, open an item with an Adjust option, change a parameter, save. Refresh. Expected: the adjusted value is still in force. This one needs no code — `overrides` lives inside `profile` (`App.jsx:2242`) — and it closes the roadmap's note that tuning a parameter is currently pointless.

- [ ] **Step 9: Commit**

```bash
git add src/App.jsx
git commit -m "feat: the plan survives a refresh, and last night's logs do not"
```

---

### Task 3: Start over

**Files:**
- Modify: `src/App.jsx` — `ProfileSheet` (line 1776) gains one state variable and one row after the Export row at line 1984.

**Interfaces:**
- Consumes: `save` from Task 1, already imported by Task 2. `ProfileRow({ T, Icon, l, sub, onClick, hue })` from `App.jsx:1756`. `ArrowCounterClockwise` from `./icons.jsx`, already imported at `App.jsx:5`.
- Produces: nothing importable.

**Background the implementer needs:**

Task 2 makes a saved profile boot straight into the app, which removes the only route back to onboarding. The profile sheet's "Your data" section (`App.jsx:1983`) currently offers Export and nothing else. For a prototype that has to be demonstrated in front of people, being unable to show the quiz again without opening devtools is a real gap.

**Do not write this as `setProfile(null)` plus `setScreen("welcome")`.** It looks like the obvious version and it white-screens the app. `useScreenSwap` (`App.jsx:313`) holds the previous screen for `SCREEN_OUT_MS` — 300ms, `App.jsx:298` — while it animates out. During those 300ms `shownScreen` is still `"app"`, so none of the early returns at `App.jsx:2390-2429` fire, and execution reaches `const { ph, state: s } = plan;` at `App.jsx:2431` with `plan` null. Destructuring null throws and React unmounts the tree.

Clearing the blob and reloading avoids that with fewer lines than guarding it would take: no `!plan` early return, no `setLogs`/`setReflection` threaded into `ProfileSheet`'s props, and every other piece of state — the open sheet, a live toast, the selected tab and range — is gone by construction. No React state changes between `save({})` and the navigation, so Task 2's write effect cannot fire and overwrite the cleared blob on the way out.

`ProfileSheet` is rendered conditionally (`{profileOpen && <ProfileSheet ... />}`, `App.jsx:2661`), so its state unmounts with it and closing the sheet disarms the row for free.

There is no test step. `App.jsx` has no component test harness, and adding one for a two-tap button is a larger change than the button.

- [ ] **Step 1: Add the armed state**

`src/App.jsx:1780`, immediately after the `ProfileSheet` signature closes:

```js
}) {
  const badges = achievements(profile, logs, history);
```

change to:

```js
}) {
  const badges = achievements(profile, logs, history);
  /* two taps, because this erases a profile rather than one log entry */
  const [armed, setArmed] = useState(false);
```

- [ ] **Step 2: Add the row**

Task 2's import shifted this down a line. Match on the code.

`src/App.jsx:1984-1985`, after the Export row:

```js
      <ProfileRow T={T} Icon={DownloadSimple} hue={DOMAIN.water.hue} l="Export data"
        sub="Everything logged, as a JSON file" onClick={exportData} />
```

insert:

```js
      <ProfileRow T={T} Icon={ArrowCounterClockwise} hue={DOMAIN.food.hue}
        l={armed ? "Tap again to erase everything" : "Start over"}
        sub={armed
          ? "Your profile, tonight's logs and your reflection. This cannot be undone."
          : "Erase everything and retake the quiz"}
        onClick={() => {
          if (!armed) { setArmed(true); return; }
          /* clear and reload rather than null the state: setProfile(null) leaves
             useScreenSwap rendering the app for another 300ms, and that render
             destructures a null plan */
          save({});
          location.reload();
        }} />
```

`DOMAIN.food.hue` is the only red in `tokens.js`. The row is read by its label and icon, not by its hue, so borrowing the food colour for a destructive action reads correctly and adds no token.

- [ ] **Step 3: Verify the two taps in the running app**

Run: `npm run dev` if it is not still running. With a completed profile and at least one log:

1. Open the profile sheet → "Your data", tap the red Start over row once. Expected: the label becomes "Tap again to erase everything" and the subtitle names what goes. Nothing is erased.
2. Close the sheet with the X, reopen it. Expected: the row reads "Start over" again — the arming did not survive.
3. Tap it twice, then refresh once more. Expected: the welcome screen both times, and `gy.v1` reads `{}` in devtools → Application → Local Storage. The blob is gone, not just the state.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat: start over, two taps, from the profile sheet"
```

---

## Done when

- `npm test` passes, including 2 new `forNight` cases.
- A refresh mid-shift restores the plan with its done and skipped items, its logs, and its reflection.
- Editing the stored `night` to a past date drops the logs and the reflection and keeps the profile.
- Both corrupt-blob cases in Task 2 Step 7 land on the quiz, not a blank page.
- The theme choice and an adjusted planning parameter both survive a refresh.
- Start over needs two taps and leaves `{}` behind.
- Nothing is archived. Phase 2 has not been started.

## Explicitly not in this plan

- Rollover, folding a finished night, or any archive key (Phase 2).
- Replacing `materializeNights` with real history, or any empty state (Phase 3).
- Persisting `tab`, `hideDone`, `showAllPlan` or `rangeKey` (Phase 4).
- `nightInStretch` counting itself, or wiring the reflection to `overrides` (Phase 5).
- An import path for the exported JSON — nearly free once this blob shape exists, but Phase 3 at the earliest.
- IndexedDB, schema migrations, encryption, sync, or a `storage` event listener for multi-tab.
- Persisting a quiz in progress. `Quiz` holds its answers locally and a refresh at question seven restarts onboarding; that is accepted.
