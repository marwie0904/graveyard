# Phase 1 — Persist

The plan stops being a render and becomes an object. One module, one key, one
effect: `profile`, `logs`, `reflection` and the theme survive a refresh, and a
blob left over from last night surrenders its logs before it can pollute
tonight's plan.

Spec for Phase 1 of `docs/implementation-roadmap.md`. Builds on Phase 0
(`2026-08-11-night-identity-design.md`), which returns the night ID this phase
stores. Nothing is folded into an archive here; that is Phase 2.

---

## The problem, stated from the code

`App.jsx:2298` says it out loud:

```js
/* Nothing is persisted. The app boots to the quiz every time, by design:
   there is no backend, no database, and no storage of any kind. */
```

Every `useState` in the block at `App.jsx:2271` dies on refresh, including the
four that are not transient UI: `profile`, `logs`, `reflection` and
`themeOverride`. So the twelve-question quiz runs on every load, a tapped item
untaps itself, and `foldNight` folds a night that only ever lasted one session.

Two things are already free and worth naming so nobody builds them twice:

- **`overrides` needs no work.** It lives inside `profile` (`App.jsx:2242`), so
  persisting the profile persists the tuning knobs. The roadmap's note that
  adjusting a parameter is "currently pointless" is closed by this phase without
  a line of its own.
- **The export payload is the shape.** `App.jsx:2464` already serialises
  `{profile, logs, history, reflection}`. Matching it means Phase 3's import is a
  `setState` per field rather than a parser.

---

## The rule

**One key holds one blob, and the blob knows which night it is.**

```js
{ night, profile, logs, reflection, theme }
```

`night` is `nightOf(calculateShiftPhases(profile)).id` — the Phase 0 string. It
is a field of the same object it describes, not a key beside it, so no partial
write can leave the stamp disagreeing with the logs it stamps.

**A blob stamped with a different night is last night's.** Its profile and theme
survive; its logs and reflection do not. Tonight starts clean.

That is a deliberate loss, and it is not a regression: today those logs die on
refresh anyway. What it buys is that last night's done items cannot appear ticked
on tonight's plan, and last night's coffees cannot move tonight's cutoff. Phase 2
replaces the drop with a fold into the archive, at which point nothing is lost at
all — and it replaces it inside the one function that owns the rule.

`v1` in the key name is not a migration system. It is four characters that let a
future shape change orphan the old blob instead of crashing on it.

---

## The module

`src/storage.js`, in full:

```js
const KEY = "gy.v1";

/** Everything saved, or {} if there is nothing readable there. */
const load = () => {
  try { const v = localStorage.getItem(KEY); return v ? JSON.parse(v) : {}; }
  catch { return {}; }                       // private mode, quota, corrupt JSON
};

const save = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} };

/** Last night's blob keeps the profile and the theme; tonight's keeps everything.
    Phase 2 replaces the drop with a fold into the archive. */
const forNight = (s, id) => (s.night === id ? s : { profile: s.profile, theme: s.theme });

export { load, save, forNight };
```

`KEY` is not exported — nothing outside the module names it.

`forNight` is a one-line function with one caller, which is normally the shape to
inline. It stays because it is this phase's only actual rule, it is the only
thing here worth an assert, and Phase 2 grows its body into the fold rather than
deleting it.

---

## Boot

Read once, at import, above the component:

```js
/* Read once, at import. A blob stamped with a different night is last night's:
   the profile and the theme survive, the logs and the reflection do not, so
   tonight's plan starts clean. Folding them into an archive instead is Phase 2.
   The try/catch covers more than JSON. A blob that parses but is missing
   shiftStart throws inside calculateShiftPhases, at module scope, where no
   error boundary can catch it — a white screen before React has mounted.
   Falling back to the quiz is the honest failure. */
const boot = (() => {
  try {
    const s = load();
    if (!s.profile) return {};
    const { id, now } = nightOf(calculateShiftPhases(s.profile));
    return { ...forNight(s, id), now };
  } catch { return {}; }
})();
```

Six initialisers then change, and nothing else in the component does:

```js
const [screen, setScreen]   = useState(boot.profile ? "app" : "welcome");
const [profile, setProfile] = useState(boot.profile ?? null);
const [logs, setLogs]       = useState(boot.logs ?? []);
const [reflection, setReflection] = useState(boot.reflection ?? {});
const [themeOverride, setThemeOverride] = useState(boot.theme ?? null);
const [now, setNow]         = useState(boot.now ?? 0);
```

`now` is seeded from `boot` rather than left at `0` because the tick effect
(`App.jsx:2300`) only runs after the first paint. Without the seed, the restored
plan renders one frame at minute zero — during the mount animation, where it is
most likely to be seen. The value costs nothing: it comes out of the `nightOf`
call `boot` already makes for `id`.

### The trust boundary is wider than §2 of `app-design-basis.md` assumed

That document's `try/catch` guards `JSON.parse`. That is the easy failure. The
dangerous one is a blob that parses cleanly and is the wrong shape:
`toMin(undefined)` throws inside `calculateShiftPhases`, from module scope,
before React exists. One `catch` around the whole boot expression is the entire
schema validation this phase needs, and it is enough.

---

## Write

```js
useEffect(() => {
  if (!profile) return;                        // nothing to save before the quiz
  save({
    night: nightOf(calculateShiftPhases(profile)).id,
    profile, logs, reflection, theme: themeOverride,
  });
}, [profile, logs, reflection, themeOverride]);
```

The night ID is derived at write time rather than held in state. Nothing renders
it, and Phase 2 reads it from the tick, which is where the comparison belongs.

The guard is one line and it means nothing is written to the device until the
quiz is finished. For an app whose stated ethical position is about what it
stores, writing an empty record before the disclaimer has been read is a bad
look even when the record is empty.

---

## Start over

Once a saved profile boots straight into the app, there is no route back to the
quiz. The profile sheet's "Your data" section (`App.jsx:1983`) offers only
Export. For a prototype that has to be demonstrated, that is a real gap.

One `ProfileRow` beside Export. `ArrowCounterClockwise` is already imported
(`App.jsx:5`); the hue is `DOMAIN.food.hue`, the only red in `tokens.js`.

**Two taps, not a dialog.** The first tap changes the row to "Tap again to erase
everything"; the second calls `save({})` and then `location.reload()`. One
`useState` inside `ProfileSheet`, no new component, no native `confirm()`. The
sheet is conditionally rendered (`App.jsx:2661`), so closing it disarms the row.

**Reload, rather than nulling the state.** The obvious version —
`setProfile(null)` plus `setScreen("welcome")` — white-screens the app.
`useScreenSwap` holds the previous screen for `SCREEN_OUT_MS` (300ms,
`App.jsx:298`) while it animates out, so for those 300ms `shownScreen` is still
`"app"`, no early return fires, and the render reaches
`const { ph, state: s } = plan;` (`App.jsx:2431`) with `plan` null. Destructuring
null unmounts the tree.

Reloading sidesteps that with fewer lines than guarding it: no `!plan` early
return, no `setLogs`/`setReflection` threaded into `ProfileSheet`'s props, and
every other piece of state — open sheet, toast, tab, range — is gone by
construction rather than by remembering to reset it. No state changes between
`save({})` and the navigation, so the write effect cannot overwrite the cleared
blob on the way out. The cost is a full-page flash instead of the app's animated
swap, which for "erase everything" is the honest sound to make.

A no-confirm version would be shorter still and would match the existing
destructive control (Delete, `App.jsx:1638`). Not taken: that deletes one log
entry, this deletes a profile, a night of logs and a reflection. The second tap
is the cheapest thing standing between a mis-tap and all of it.

---

## Tests

`src/storage.test.js`, two assertions on `forNight`:

| Case | Expect |
|---|---|
| `forNight(s, s.night)` | returns `s` whole |
| `forNight(s, "2020-01-01")` | `{profile, theme}` only — no `logs`, no `reflection` |

Pure, no globals, no stub, runs in the existing `environment: "node"`
(`vitest.config.js`).

**No `localStorage` stub, and no tests on `load`/`save`.** A Map-backed fake
would let us assert that `JSON.parse` round-trips and that an empty `catch` is
empty. Worse, it would cover the safe half of the trust boundary and miss the
dangerous half — the wrong-shape blob throws in the boot expression, which no
storage-level test reaches. That path is verified by hand in the plan: paste
garbage into the key, reload, expect the quiz.

---

## What visibly changes

- Boot with a saved profile lands on the Dashboard. No welcome, no disclaimer,
  no quiz.
- Refresh mid-shift and the plan returns with its done and skipped items, the
  caffeine already counted, the reflection as typed.
- The theme choice from Personalize (`App.jsx:1893`) stops resetting.
- Adjusted planning parameters stick, because `overrides` rides in `profile`.

Closes false claim #8 in `app-design-basis.md:28` — "local-only persistence of
sleep, fatigue, and caffeine records" — which is the one gap that breaks the
artifact rather than the write-up.

---

## Known ceilings

- **The app left open across the boundary.** The stamp is written from the
  current night, so a log written at 17:00 the next night lands under the new ID
  beside yesterday's. The boot rule only fires on a fresh load. This is Phase 2's
  named case, unchanged by this phase.
- **A quiz in progress is not saved.** `Quiz` holds its answers locally; a
  refresh at question seven restarts onboarding. Persisting mid-quiz state buys
  nothing once the profile is the thing that sticks.
- **Multi-tab.** Two tabs each write the whole blob; last write wins. No
  `storage` event listener.
- **Nothing is encrypted.** Local-only, per Table 1 — the data never leaves the
  device, which is the position the paper actually takes.

## Skipped

- IndexedDB, schema migrations, sync. Add migrations the first time the log shape
  changes after someone real is using it.
- A `history` or archive key. Phase 2 owns the archive and should choose its own
  shape.
- Persisting `tab`, `hideDone`, `showAllPlan`, `rangeKey`. Transient UI, and
  Phase 4 owns the question of what survives a refresh.
- Storing the night ID in React state. Nothing renders it; Phase 2 adds the
  comparison at the tick, where it is used.
- An import path for the exported JSON. Nearly free once this shape exists, but
  it is a Phase 3 nice-to-have.
