# Real history (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Dashboard stops reading 45 authored nights and starts reading the archive Phase 2 fills — with a night id that cannot walk backward under it, a `dayOffset` computed rather than stored, a range that is a window of days rather than a count of records, and screens that survive having one night or none.

**Architecture:** `time.js` grows two pure one-liners, `forward` (the night id is monotonic) and `daysBetween` (whole days between two `"YYYY-MM-DD"` ids). `App.jsx`'s three night-id writers route through `forward`, and its `history` memo maps the archive through `daysBetween` instead of calling `materializeNights` — unless `?seed` is on the URL, which keeps the mock alive as a demo dataset without ever writing it to disk. `stats.js` renames `RANGES`'s `nights` field to `days`, exports `MIN_TREND`, and moves three achievements off tonight's logs and onto the records. `Dashboard.jsx` filters a window of days instead of slicing records, and gains an empty-window early return plus two `&&`s on the charts.

**Tech Stack:** Plain ES modules, React 18, Vitest 2, `localStorage`, Playwright (already in `node_modules`, driven by hand — not a test runner). No new dependencies.

## Global Constraints

- **No new dependencies.** Nothing added to `package.json`. Playwright is already installed and the existing drivers are run with bare `node`.
- **Do not change `generateTimeline`.** It stays `(profile, logs, now)`. Nothing in this phase touches `planner.js`.
- **Do not change `foldNight`'s signature.** It stays `foldNight(profile, logs, reflection)`. Its `id: "tonight"` and `dayOffset: 0` stay exactly as they are — they are correct for its caller, and only the archive is remapped.
- **Do not change `materializeNights`'s signature or its row shape.** It stays `materializeNights(profile)` returning `mock-N` ids and a `dayOffset` on every row. Its only edit in this phase is one added field.
- **`dayOffset` is never stored.** `storage.js`'s `archived` already strips it. It is derived at read time from the record's night id against `nightRef.current`.
- **One key.** `"gy.v1"`, holding `{ night, profile, logs, reflection, theme, archive }`. The seed never reaches it.
- **The archive is newest-first** and every record carries a `"YYYY-MM-DD"` `id`.
- **Vitest runs in `environment: "node"`** (`vitest.config.js`), include glob `src/**/*.test.js`. There is no DOM and no `localStorage`. Do not stub either, and do not add a render harness.
- **`MIN_TREND = 5`**, exported from `stats.js`. It replaces the two bare `5`s already inside `readPatterns`; do not invent a third threshold.
- **The seed flag is exactly `?seed`**, ungated by build mode. No `import.meta.env.DEV`.
- **Empty states use the app's own components.** `Display`, `Lead`, `RangeControl`, `Card`, `Info`, `FONT_TEXT`, `T.faint` — all already imported by `Dashboard.jsx`. No new component, no unstyled fallback, no `alert`.
- Spec: `docs/superpowers/specs/2026-08-13-real-history-design.md`. Roadmap Phase 3: `docs/implementation-roadmap.md:204`.
- Unit test command: `npm test` (`vitest run`). Single file: `npx vitest run src/time.test.js`.
- End-to-end command: `node drive-history.mjs`. **The dev server is already running on `http://localhost:5174/`** — do not start another one; if it has died, `npm run dev -- --port 5174`.
- Line numbers below are from commit `a758424` on branch `phase-3-real-history`. Match on code, not on the number.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/time.js` | Modify (+2 functions, ~12 lines with comments) | Still the only module that knows how a night id is shaped. Now also owns the two rules about comparing two of them. |
| `src/time.test.js` | Modify (~40 lines) | 6 `forward` cases, 6 `daysBetween` cases. |
| `src/stats.js` | Modify (~20 lines across 4 sites) | `RANGES` counts days. `MIN_TREND` is named once. Three achievements read the record instead of tonight's logs. `foldNight` records `endShift`. |
| `src/stats.test.js` | Modify (~90 lines) | `RANGES` shape, `foldNight`'s new field, `MIN_TREND` against `readPatterns`, and 9 achievement cases. |
| `src/mockNights.js` | Modify (1 line) | One literal field so the demo's "Home safe" is lit. |
| `src/App.jsx` | Modify (~30 lines across 5 sites) | Routes three night-id writers through `forward`, reads the `?seed` flag, swaps the memo, drops `history` from the export, passes `seeded` down. |
| `src/screens/Dashboard.jsx` | Modify (~40 lines across 6 sites) | A range is a window of days. An empty window says so. A chart with nothing to draw is absent. One line names how many nights are still missing. |
| `drive-history.mjs` | Create (~310 lines) | The whole phase end to end, on a faked clock against the running dev server. Grows one block per task; every check is written to stay green through the tasks that follow it. |

Five tasks, in this order because each one leaves the tree green and the next one needs it:

1. **The night id only moves forward.** Pure rule, its own tests, its own driver checks. Lands before the swap because a double-counted night is a row nobody looks at today and a wrong number on screen tomorrow.
2. **The record shape and the badges.** `endShift` on the NightRecord, three achievements moved onto the records, `MIN_TREND` named. All still driven by the mock, so nothing visible moves — which is exactly why it is safe to land here.
3. **A range is a window of days.** Against the dense mock a day window and a record slice select the same records, so this lands with no visible change and is in place before a sparse archive arrives.
4. **The swap.** `daysBetween`, the memo, the `?seed` flag, the export. This is the line the phase is named for.
5. **Empty states.** The actual work: a window with nothing in it, charts with nothing to draw, and the line that names the number.

---

### Task 1: The night id only moves forward

**Files:**
- Modify: `src/time.js` — append one exported function at the end of the file.
- Modify: `src/time.test.js` — append one `describe` block.
- Modify: `src/App.jsx` — the import at line 9, the boot expression at 2299-2307, the adopt effect at 2354-2357, the tick at 2372-2375.
- Create: `drive-history.mjs` — the harness plus this task's three checks.

**Interfaces:**
- Consumes: `nightOf(ph, d = new Date()) -> { id, now }` from `src/time.js`, where `id` is a zero-padded local `"YYYY-MM-DD"`. `calculateShiftPhases(profile) -> ph` from `src/planner.js`. `forNight(s, id)` and `archived(s)` from `src/storage.js`. All four are already imported in `App.jsx`.
- Produces:
  - `forward(cur: string | undefined, next: string) -> string` — exported from `src/time.js`. The later of the two ids, and `next` when `cur` is falsy. Never returns `undefined` for a string `next`.
  - No change to any other signature. The observable contract is that `gy.v1`'s `night` never names an earlier night than it did a moment ago.

**Background the implementer needs:**

`nightOf` derives the night from the profile's wake boundary, and the sheet at `App.jsx:2691` lets the user edit `shiftStart`, `shiftEnd`, `plannedSleep` and `sleepGoalHours` mid-night. Any of those can change *which night the current clock belongs to*, in either direction. Phase 2 built an adopt effect so a re-labelling is not mistaken for a rollover — but it adopts whatever id it is given, including an earlier one. The tick then only asks whether the id *differs*, so an edit that walks the night backward across a boundary folds the same night twice. Nothing dedupes.

**The guard goes on the ref, not on the fold.** The obvious alternative is to have `archived` refuse an id the archive already holds. One line, and the wrong one: the ref is read by three things and the fold is only one of them. The write stamp reads `nightRef.current`, so a backward ref writes the *live* blob under an older id and the next boot folds a duplicate through `forNight` anyway. Task 4 computes every `dayOffset` against the ref, so a backward ref shifts the whole day strip by a day. And the tick's roll condition is the ref. One guard where all three meet is smaller than three guards, and it is the root cause rather than one of its three symptoms.

**Three traps, all of which will bite you if you skip them:**

1. **The seed.** `nightRef` is `useRef(boot.night)` and `boot.night` is `undefined` on a fresh install. Every relational comparison against `undefined` is false, so a bare `next > cur` would leave the ref undefined forever: the write stamps `night: undefined`, the next boot's `forNight` sees a mismatch, `archived` returns early on the falsy `s.night`, and the logs are dropped. A fresh install would lose its first night on every reload. The `!cur` clause is the whole reason this is a tested helper instead of three inline `>`s.

2. **Do not advance the ref during render.** Moving it into the component body looks strictly better — the ref would be correct before Task 4's memo reads it, and an effect disappears. It also deletes the rollover. The *lag* between the clock's night and the ref is the signal the tick reads; advancing the ref on every render means the tick always sees a match and no night is ever folded. The adopt effect's narrow four-field dependency list is what keeps that lag intact for clock-driven changes. Leave both alone.

3. **Naming inside `tick`.** The destructured id has to be renamed to `seen`, because `const id = setInterval(tick, 30000)` is in the enclosing scope and the immediate `tick()` call runs *before* that initialiser. A bare `const { id } = ...` inside `tick` is a TDZ `ReferenceError` on the first call, not a shadowing bug you find later. (Phase 2 destructured it as `night` for the same reason; the name changes here because `night` is now the *result* of `forward`.)

**What this costs, stated plainly so you do not "fix" it later.** Phase 2's invariant — ref equals `nightOf(profile).id` except between a boundary and the tick — weakens to: **the ref is never behind the computed id, and is ahead of it only after an edit that moved the boundary backward.** The concrete cost, with real numbers verified against this profile: run a 04:00–12:00 shift sleeping 13:00 for 7h, stand at 14:00 on Aug 13 (night `2026-08-13`), then edit the shift to 22:00–06:00 (night `2026-08-12`). The ref holds at `2026-08-13`, the 15:00 boundary is swallowed, and two nights of logs merge into one record. Before this change the same sequence produced two records both stamped `2026-08-12`, one of which the day strip silently hid and both of which `rangeStats` counted. **A merged night reads long. A duplicated night is wrong twice over in every average, invisibly. Take the merge.** Do not add a guard for it.

It also closes the DST fall-back triple-roll for free. Phase 2 reproduced `2026-10-31 → 2026-11-01 → 2026-10-31 → 2026-11-01` under `TZ=America/New_York`; forward-only makes that one roll and two ignored crossings, which is what the night actually did.

- [ ] **Step 1: Write the failing tests**

Append to `src/time.test.js`, at the end of the file:

```js
describe("forward", () => {
  /* Ids are zero-padded local dates, so lexicographic order is chronological
     order and a bare > is the whole rule. */
  it("advances to a later night", () => {
    expect(forward("2026-08-12", "2026-08-13")).toBe("2026-08-13");
  });

  it("refuses a backward step, which is the entire point", () => {
    // a shift-time edit can walk nightOf backward; the ref must not follow
    expect(forward("2026-08-13", "2026-08-12")).toBe("2026-08-13");
  });

  it("holds when the night has not changed", () => {
    expect(forward("2026-08-13", "2026-08-13")).toBe("2026-08-13");
  });

  it("seeds from undefined, which a bare > gets wrong", () => {
    /* boot.night is undefined on a fresh install and every relational
       comparison against undefined is false, so without the !cur clause the
       ref would stay undefined forever and the first night would be dropped
       on every reload. */
    expect(forward(undefined, "2026-08-13")).toBe("2026-08-13");
  });

  it("advances across a year boundary", () => {
    expect(forward("2026-12-31", "2027-01-01")).toBe("2027-01-01");
  });

  it("orders single-digit days correctly, because the ids are padded", () => {
    // "2026-08-9" > "2026-08-10" lexicographically; "2026-08-09" is not
    expect(forward("2026-08-09", "2026-08-10")).toBe("2026-08-10");
    expect(forward("2026-08-10", "2026-08-09")).toBe("2026-08-10");
  });
});
```

Extend the import on line 2 of that file to include `forward`:

```js
import { DAY, toMin, fmt, nextAfter, overlap, dur, nightAxis, nightTick, nightOf, forward } from "./time.js";
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/time.test.js`

Expected: FAIL, 6 cases, each with `forward is not a function`.

- [ ] **Step 3: Write the implementation**

Append to the end of `src/time.js`:

```js
/** The night id only ever moves forward. Ids are zero-padded local dates, so
    lexicographic order is chronological order and a bare `>` is the whole rule
    — no parsing, no Date.
    The first clause is load-bearing, not a null-check habit: `"2026-08-13" >
    undefined` is false for every string, so without it a fresh profile would
    never seed the ref at all, and would lose its first night on every reload. */
export const forward = (cur, next) => (!cur || next > cur ? next : cur);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/time.test.js`

Expected: PASS. The file's existing `nightOf` cases must still pass — nothing above was touched.

- [ ] **Step 5: Route the three writers through it**

Four edits in `src/App.jsx`. Nothing else in the file changes.

**5a.** Line 9, extend the time import:

```js
import { DAY, toMin, fmt, nextAfter, dur, nightOf } from "./time.js";
```

becomes:

```js
import { DAY, toMin, fmt, nextAfter, dur, nightOf, forward } from "./time.js";
```

**5b.** Boot, `src/App.jsx:2305`. Change:

```js
    return { ...forNight(s, id), night: id, now };
```

to:

```js
    /* forward, not id: a stored night ahead of the computed one means the
       boundary moved backward under an edit, and re-folding the night we are
       standing in would duplicate a record the archive already holds. */
    const stamp = forward(s.night, id);
    return { ...forNight(s, stamp), night: stamp, now };
```

**5c.** The adopt effect, `src/App.jsx:2355`. Change:

```js
    if (profile) nightRef.current = nightOf(calculateShiftPhases(profile)).id;
```

to:

```js
    if (profile) nightRef.current = forward(nightRef.current, nightOf(calculateShiftPhases(profile)).id);
```

Leave the comment above it and the four-field dependency list below it exactly as they are.

**5d.** The tick, `src/App.jsx:2373-2375`. Change:

```js
      const { id: night, now } = nightOf(calculateShiftPhases(profile));
      setNow(now);
      if (night === nightRef.current) return;
```

to:

```js
      /* `seen` rather than `id`: `const id = setInterval(...)` is in scope below
         and the immediate tick() call runs before that initialiser, so a bare
         `id` here is a TDZ ReferenceError on the first call. */
      const { id: seen, now } = nightOf(calculateShiftPhases(profile));
      setNow(now);
      const night = forward(nightRef.current, seen);
      if (night === nightRef.current) return;
```

The rest of the tick body — `archived(...)`, `nightRef.current = night`, `setArchive`, `setLogs`, `setReflection`, the toast guard — is unchanged. `night` still holds the id to roll to; only where it comes from changed.

- [ ] **Step 6: Run the whole suite**

Run: `npm test`

Expected: PASS, with 6 new cases. Nothing in the suite imports `App.jsx`, so the suite is blind to Step 5 — Steps 7 through 9 are the real verification of it.

- [ ] **Step 7: Create the end-to-end driver**

Create `drive-history.mjs` at the repo root. This is the phase's whole driver; later tasks append blocks to it and change nothing above.

```js
/* Phase 3 checks, driven through a faked clock against the running dev server.
   Same pattern as drive-rollover.mjs: page.clock.install before goto,
   addInitScript seeding gy.v1, a record() tally, non-zero exit on failure.
   The dev server is already up on :5174.
   Run: node drive-history.mjs [url] */
import { chromium } from "playwright";

const URL = process.argv[2] || "http://localhost:5174/";

/* shift 22:00-06:00, sleep from 07:30 for 7.5h -> sleepEnd 15:00, so the night
   boundary is 15:00 local. Verified against nightOf: 02:00 and 14:59 on Aug 13
   both belong to night "2026-08-12"; 15:01 is "2026-08-13". */
const PROFILE = {
  shiftStart: "22:00", shiftEnd: "06:00", plannedSleep: "07:30", sleepGoalHours: 7.5,
  nightInStretch: 1, caffeine: "moderate", nap: "both", caffeineSensitivity: "normal",
  movement: "mixed", lightEnv: "bright", commute: "drive", sleepiestTime: "deep",
  chronotype: "neither", overrides: {},
};

/* The same person before a shift-time edit: 04:00-12:00, sleep 13:00 for 7h ->
   boundary 20:00. At 14:00 on Aug 13 this says "2026-08-13" where PROFILE says
   "2026-08-12", so editing one into the other is a one-day backward step. */
const EARLY = { ...PROFILE, shiftStart: "04:00", shiftEnd: "12:00", plannedSleep: "13:00", sleepGoalHours: 7 };

const LOGS = [
  { id: "caffeine-1", t: 1350, type: "caffeine", value: 1 },
  { id: "water-1", t: 1360, type: "water", value: 1 },
  { id: "item-1", t: 1370, type: "item", value: { id: "m1", status: "done", category: "movement" } },
];

const results = [];
const record = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `\n        ${detail}` : ""}`);
};

const seed = (blob) => `
  try { localStorage.setItem("gy.v1", ${JSON.stringify(JSON.stringify(blob))}); } catch {}
`;

const read = (page) => page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("gy.v1") || "{}");
  return {
    night: s.night ?? null,
    logs: (s.logs || []).length,
    ids: (s.archive || []).map((r) => r.id),
    archiveLen: (s.archive || []).length,
    text: document.body.textContent,
  };
});

/* A page with the clock frozen at `time`, localStorage pre-seeded — both before
   the app's first line runs. `query` carries the ?seed flag in Task 4. */
async function open(browser, { time, blob, tz, query = "" }) {
  const ctx = await browser.newContext({
    viewport: { width: 430, height: 932 },
    ...(tz ? { timezoneId: tz } : {}),
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // resource 404s (favicon) are noise; only script errors count against a check
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("Failed to load resource")) {
      errors.push("console: " + m.text());
    }
  });
  await page.clock.install({ time });
  if (blob !== undefined) await page.addInitScript(seed(blob));
  await page.goto(URL + query, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(400);
  return { ctx, page, errors };
}

/* fastForward takes hh:mm:ss. A bare "02:00" is TWO MINUTES, not two hours —
   this cost an afternoon in drive-rollover.mjs, so every call below is
   three-part on purpose. */

const browser = await chromium.launch({ channel: "chrome" });

/* ---- H1: a computed night behind the stored one does not fold ------------- */
{
  // stored 2026-08-13; PROFILE at 02:00 on Aug 13 computes 2026-08-12. Before
  // forward-only, boot saw a stamp mismatch and folded a SECOND 2026-08-13.
  const { ctx, page, errors } = await open(browser, {
    time: new Date("2026-08-13T02:00:00"),
    blob: { night: "2026-08-13", profile: PROFILE, logs: LOGS, reflection: {}, theme: null,
            archive: [{ id: "2026-08-13" }] },
  });
  const s = await read(page);
  record("H1 a computed night behind the stored one does not fold",
    s.night === "2026-08-13" && s.archiveLen === 1 &&
    new Set(s.ids).size === s.ids.length && s.logs === LOGS.length && !errors.length,
    `night=${s.night} ids=${JSON.stringify(s.ids)} logs=${s.logs} err=${errors.join(" || ") || "none"}`);
  await ctx.close();
}

/* ---- H2: the roadmap's worked example, through the real sheet ------------- */
{
  // EARLY at 14:00 on Aug 13 is night 2026-08-13. Editing the shift to
  // 22:00-06:00 makes nightOf say 2026-08-12. The ref must refuse it, the
  // 15:00 boundary is then swallowed, and the two nights merge into one —
  // the accepted cost, and much better than two records sharing an id.
  const { ctx, page, errors } = await open(browser, {
    time: new Date("2026-08-13T14:00:00"),
    blob: { night: "2026-08-13", profile: EARLY, logs: LOGS, reflection: {}, theme: null, archive: [] },
  });
  const before = await read(page);
  // profile sheet -> Shift time -> start 10 PM, end 6 AM
  await page.locator("button").filter({ hasText: /^$/ }).first().click();
  await page.waitForTimeout(300);
  await page.getByText("Shift time").click();
  await page.waitForTimeout(400);
  const startWheel = page.locator("div").filter({ hasText: /^Shift starts$/ }).last().locator("..");
  await startWheel.getByRole("button", { name: "10", exact: true }).click();
  await page.waitForTimeout(200);
  await startWheel.getByRole("button", { name: "PM", exact: true }).click();
  await page.waitForTimeout(400);
  const endWheel = page.locator("div").filter({ hasText: /^Shift ends$/ }).last().locator("..");
  await endWheel.getByRole("button", { name: "6", exact: true }).click();
  await page.waitForTimeout(200);
  await endWheel.getByRole("button", { name: "AM", exact: true }).click();
  await page.waitForTimeout(600);
  const edited = await read(page);
  const p = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("gy.v1"));
    return `${s.profile.shiftStart}-${s.profile.shiftEnd}`;
  });
  await page.clock.fastForward("02:00:00");   // 14:00 -> 16:00, past the new 15:00 boundary
  await page.waitForTimeout(500);
  const after = await read(page);
  record("H2 a shift edit that walks the night backward does not move the ref",
    p === "22:00-06:00" && before.night === "2026-08-13" &&
    edited.night === "2026-08-13" && after.night === "2026-08-13" &&
    after.archiveLen === 0 && after.logs === LOGS.length && !errors.length,
    `shift=${p} night ${before.night}->${edited.night}->${after.night} archive=${after.archiveLen} ids=${JSON.stringify(after.ids)} logs=${after.logs} err=${errors.join(" || ") || "none"}`);
  await ctx.close();
}

/* ---- H3: DST fall-back rolls once, not three times ------------------------ */
{
  // 02:00 shift, 21:00 sleep, 4.5h -> wake 01:30, which on 2026-11-01 in New
  // York happens twice. Phase 2 observed 10-31 -> 11-01 -> 10-31 -> 11-01.
  // The discriminating assertion is that the sequence never decreases; the
  // archive length does not discriminate, because the second fold has no logs
  // left to fold and archives nothing either way.
  const DST = { ...PROFILE, shiftStart: "02:00", shiftEnd: "10:00", plannedSleep: "21:00", sleepGoalHours: 4.5 };
  const { ctx, page, errors } = await open(browser, {
    tz: "America/New_York",
    time: new Date("2026-11-01T00:45:00-04:00"),
    blob: { night: "2026-10-31", profile: DST, logs: LOGS, reflection: {}, theme: null, archive: [] },
  });
  const seen = [];
  for (let i = 0; i < 14; i++) {
    await page.clock.fastForward("00:15:00");
    await page.waitForTimeout(150);
    seen.push((await read(page)).night);
  }
  const s = await read(page);
  const monotonic = seen.every((v, i) => i === 0 || v >= seen[i - 1]);
  record("H3 DST fall-back rolls once and never walks back",
    monotonic && s.ids.length === 1 && s.ids[0] === "2026-10-31" && !errors.length,
    `sequence=${JSON.stringify(seen)} ids=${JSON.stringify(s.ids)} err=${errors.join(" || ") || "none"}`);
  await ctx.close();
}

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log("failed: " + failed.map((r) => r.name).join(", ")); process.exit(1); }
```

- [ ] **Step 8: Run the driver**

Run: `node drive-history.mjs`

Expected: `3/3 passed`, exit 0.

If H2 fails with a locator timeout on `"10"` or `"PM"`, the profile-sheet button that opens it is not the first empty-text button on the page — open the app at :5174 by hand and confirm the avatar button in the header is still the only one with no text. If H2 fails on `night=2026-08-12`, the adopt effect at Step 5c was not changed, or `forward`'s arguments are the wrong way round.

- [ ] **Step 9: Verify the fresh-install seed by hand**

The `!cur` clause has no driver check, because a fresh install means walking the quiz. Do it once:

1. Open `http://localhost:5174/` in a private window (or clear `gy.v1` in devtools → Application → Local Storage) and complete the quiz.
2. Log one caffeine from the `+`.
3. In devtools, read `gy.v1`. Expected: `night` is today's night id, **not** `null` and not missing.
4. Hard-refresh. Expected: the log is still there.

If `night` is missing and the log vanishes on refresh, `forward` is missing its `!cur` clause.

- [ ] **Step 10: Commit**

```bash
git add src/time.js src/time.test.js src/App.jsx drive-history.mjs
git commit -m "feat: the night id only moves forward"
```

---

### Task 2: The record carries the end of the shift, and the badges read records

**Files:**
- Modify: `src/stats.js` — `foldNight`'s return (around line 114), `achievements` (348-378), and the two bare `5`s in `readPatterns` (260, 264). One new export.
- Modify: `src/mockNights.js` — one line in the returned object (around line 100).
- Modify: `src/stats.test.js` — append two `describe` blocks and extend the import.

**Interfaces:**
- Consumes: `isLateNight(h)` — module-private in `stats.js`, already defined at line 58. `materializeNights(profile)` from `src/mockNights.js`, already imported by `stats.test.js`.
- Produces:
  - `MIN_TREND: number` — exported from `src/stats.js`, value `5`. Task 5 imports it into `Dashboard.jsx`.
  - `foldNight(...)` returns one extra field, `endShift: boolean`. Signature unchanged.
  - `materializeNights(profile)` rows carry `endShift: true`. Signature and every other field unchanged.
  - `achievements(profile, logs, nights)` — signature unchanged. Three of its seven `got` expressions now read `nights` instead of `logs`.

**Background the implementer needs:**

`achievements` is where the real archive breaks something rather than just thinning it. Its own comment says "Earn-only. Nothing here can be lost", and after Task 4 that becomes visibly untrue for two of the seven badges.

- **Reset habit** counts five movement items in **tonight's logs**. Phase 2 clears the logs at the boundary, so the badge un-earns itself every morning. `moveDone` is already on every record, tonight's included, so summing the records both fixes it and deletes the logs-based computation.
- **Home safe** counts `endShift` in tonight's logs, same problem. It needs one new field on the record — the phase's only change to the NightRecord shape. This is not a new pattern: "Took the rest" already earns off a record field (`nights.some(h => h.restMin > 0)`), and since `foldNight` puts tonight at the front of `nights`, reading the field covers tonight too. No logs term is needed alongside it.
- **Stopped early** is a false badge the mock hid. `isLateNight` is false for a night with no caffeine at all, so three nights of drinking nothing earns "Three nights where every cup landed before your cutoff" — for zero cups. The mock had drinks on all 45 nights, so it never showed. Requiring a drink is one term.
- **First night**, **A full week**, **Hard night** and **Took the rest** are correct as written. Do not touch them.

`MIN_TREND` is not a new concept. `st.n >= 5` and `st.n < 5` are already written twice inside `readPatterns` as bare literals, deciding whether the function may claim a relationship. Task 5 needs the same number for its "N more nights" line, and three copies of a `5` in two files is a 3am bug. One named export replaces both literals. It is 5 and not 7: seven is the "full week" badge, a different claim.

**Why this lands before the swap.** Every change here is read through `history`, which is still `[tonight, ...45 mock nights]`. The mock has drinks on every night, `moveDone` on every night, and (after this task) `endShift: true` on every night, so all three badges stay lit and nothing visible moves. That is the point: the shape change is proved by tests while the screen is still the one everybody knows.

- [ ] **Step 1: Write the failing tests**

Extend the import at the top of `src/stats.test.js`:

```js
import { rangeStats, readPatterns, foldNight, RANGES, dayOffsetOf } from "./stats.js";
```

to:

```js
import {
  rangeStats, readPatterns, foldNight, achievements, RANGES, dayOffsetOf, MIN_TREND,
} from "./stats.js";
```

Then append at the end of the file:

```js
/* A NightRecord with only the fields achievements reads. Everything else on the
   real shape is irrelevant here and would only make the failures harder to read. */
const rec = (extra = {}) => ({
  id: "2026-08-11", sleepHours: 7, cutoff: 1290, caffeine: [1000],
  moveDone: 0, moveTotal: 4, restKind: "none", restMin: 0, endShift: false, ...extra,
});
const got = (badges, key) => badges.find((b) => b.key === key).got;

describe("MIN_TREND", () => {
  it("is the threshold readPatterns already used to decide it may claim a relationship", () => {
    expect(MIN_TREND).toBe(5);
  });

  it("suppresses the relationship claim at MIN_TREND - 1 nights", () => {
    const nights = materializeNights(P).slice(0, MIN_TREND - 1);
    const pat = readPatterns(P, rangeStats(P, nights));
    expect(pat.mainPattern).toBe(`${MIN_TREND - 1} nights on record, and patterns need about a week to show up.`);
  });

  it("stops suppressing it at MIN_TREND nights, so the constant and the branch cannot drift", () => {
    const nights = materializeNights(P).slice(0, MIN_TREND);
    const pat = readPatterns(P, rangeStats(P, nights));
    expect(pat.mainPattern).not.toMatch(/on record, and patterns need/);
  });
});

describe("foldNight endShift", () => {
  it("records the end-of-shift check so the badge survives the rollover", () => {
    const logs = [{ id: "e-1", t: 1800, type: "endShift", value: 1 }];
    expect(foldNight(P, logs, {}).endShift).toBe(true);
  });

  it("is false, not undefined, for a night that was logged but never ended", () => {
    const logs = [{ id: "w-1", t: 1400, type: "water", value: 1 }];
    expect(foldNight(P, logs, {}).endShift).toBe(false);
  });
});

describe("achievements", () => {
  it("returns all seven, none earned, for a user with nothing at all", () => {
    const badges = achievements(P, [], []);
    expect(badges).toHaveLength(7);
    expect(badges.every((b) => b.got === false)).toBe(true);
  });

  /* isLateNight is false for a night with no caffeine at all, so three nights of
     drinking nothing used to earn "every cup landed before your cutoff" for zero
     cups. The mock drank on all 45 nights, so it never showed. */
  it("does not earn Stopped early for three nights with no caffeine logged", () => {
    const nights = [rec({ caffeine: [] }), rec({ caffeine: [] }), rec({ caffeine: [] })];
    expect(got(achievements(P, [], nights), "early")).toBe(false);
  });

  it("earns Stopped early for three nights that each had a drink before the cutoff", () => {
    const nights = [rec(), rec(), rec()];
    expect(got(achievements(P, [], nights), "early")).toBe(true);
  });

  it("does not earn Stopped early at two clean nights", () => {
    expect(got(achievements(P, [], [rec(), rec()]), "early")).toBe(false);
  });

  /* The rollover-survival case: Phase 2 clears the logs at the boundary, so a
     badge that counts tonight's logs un-earns itself every morning. */
  it("earns Reset habit from the records when the logs are empty", () => {
    const nights = [rec({ moveDone: 3 }), rec({ moveDone: 2 })];
    expect(got(achievements(P, [], nights), "reset")).toBe(true);
  });

  it("does not earn Reset habit at four resets", () => {
    const nights = [rec({ moveDone: 3 }), rec({ moveDone: 1 })];
    expect(got(achievements(P, [], nights), "reset")).toBe(false);
  });

  it("earns Home safe from a record when the logs are empty", () => {
    expect(got(achievements(P, [], [rec({ endShift: true })]), "home")).toBe(true);
  });

  it("does not earn Home safe when no night on record ended the shift", () => {
    expect(got(achievements(P, [], [rec(), rec()]), "home")).toBe(false);
  });

  /* The mock is the demo, and a demo with a conspicuously dark "Home safe"
     across 45 nights reads as a bug. This is also the only assertion on
     materializeNights's new literal. */
  it("earns Home safe from the mock, so the seeded demo is not missing a badge", () => {
    expect(got(achievements(P, [], materializeNights(P)), "home")).toBe(true);
  });
});
```

`P` and the `materializeNights` import are already at the top of `src/stats.test.js`. Do not redeclare them.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/stats.test.js`

Expected: FAIL. `MIN_TREND` is undefined so its three cases throw; both `foldNight` cases fail on `undefined`; and of the achievement cases, "Stopped early for three nights with no caffeine", both Reset habit cases, both Home safe record cases and the mock case fail.

- [ ] **Step 3: Add `endShift` to both record producers**

In `src/stats.js`, in `foldNight`'s returned object, immediately after the `lateLightDone` line (around line 114):

```js
    lateLightDone: items.some((l) => l.value.category === "light" && l.value.status === "done"),
```

add:

```js
    /* On the record rather than read off tonight's logs: Phase 2 clears the logs
       at the boundary, and an earn-only badge that goes dark at 06:00
       contradicts the comment above achievements(). */
    endShift: of("endShift").length > 0,
```

In `src/mockNights.js`, in `materializeNights`'s returned object, immediately after the `lateLightDone` line (around line 100):

```js
      lateLightDone: r.lateLightDone,
```

add:

```js
      endShift: true,
```

- [ ] **Step 4: Name the threshold**

In `src/stats.js`, immediately below `STRIP_DAYS` (line 28):

```js
/* How many nights the strip offers, tonight included. */
export const STRIP_DAYS = 7;
```

add:

```js
/* The fewest nights readPatterns will claim a relationship from, and the number
   the Dashboard counts down to. Five, not seven: seven is the "full week"
   badge, which is a different claim. */
export const MIN_TREND = 5;
```

Then replace both literals inside `readPatterns`. Line 260:

```js
  const canCompare = st.n >= 5 && st.avgClean !== null && st.avgLate !== null;
```

becomes:

```js
  const canCompare = st.n >= MIN_TREND && st.avgClean !== null && st.avgLate !== null;
```

and line 264:

```js
  } else if (st.n < 5) {
```

becomes:

```js
  } else if (st.n < MIN_TREND) {
```

- [ ] **Step 5: Move three badges onto the records**

In `src/stats.js`, replace the body of `achievements` (lines 348-378) — the whole function, keeping its doc comment above untouched — with:

```js
export function achievements(profile, logs, nights) {
  const count = (t) => logs.filter((l) => l.type === t).length;
  /* Requiring a drink is what makes this badge true. isLateNight is false for a
     night with no caffeine at all, so three nights of drinking nothing used to
     earn "every cup landed before your cutoff" for zero cups; the mock drank on
     all 45 nights, so it never showed.
     The ?. is the hand-edited-archive trust boundary: isLateNight short-circuits
     on a null cutoff and would not throw there, so a bare .length would be a new
     way to white-screen the sheet. */
  const cleanNights = nights.filter((h) => h.caffeine?.length && !isLateNight(h)).length;

  return [
    { key: "first", Icon: Moon, hue: DOMAIN.sleep.hue, l: "First night",
      d: "You logged a night. That is the part most people skip.",
      got: nights.length > 0 },
    { key: "week", Icon: Trophy, hue: DOMAIN.recovery.hue, l: "A full week",
      d: "Seven nights on record. Patterns need this much to show up.",
      got: nights.length >= 7 },
    { key: "early", Icon: Coffee, hue: DOMAIN.caffeine.hue, l: "Stopped early",
      d: "Three nights where every cup landed before your cutoff.",
      got: cleanNights >= 3 },
    { key: "hard", Icon: Lightning, hue: DOMAIN.light.hue, l: "Hard night",
      d: "You worked a night on under five hours of sleep and came back.",
      got: nights.some((h) => h.sleepHours !== null && h.sleepHours < 5) },
    { key: "rest", Icon: Bed, hue: DOMAIN.sleep.hue, l: "Took the rest",
      d: "You used a planned rest instead of pushing through.",
      got: count("nap") > 0 || nights.some((h) => h.restMin > 0) },
    /* These two read the records, not tonight's logs: the rollover clears the
       logs, and an earn-only badge must not go dark at the boundary. foldNight
       puts tonight at the front of `nights`, so tonight is covered too. */
    { key: "home", Icon: Car, hue: DOMAIN.recovery.hue, l: "Home safe",
      d: "You ran the end-of-shift check before heading home.",
      got: nights.some((h) => h.endShift) },
    { key: "reset", Icon: Pulse, hue: DOMAIN.movement.hue, l: "Reset habit",
      d: "Five movement resets completed. Small ones count.",
      got: nights.reduce((a, h) => a + (h.moveDone || 0), 0) >= 5 },
  ];
}
```

The `movesDone` local is gone — nothing else used it. `count` stays: "Took the rest" still reads it.

- [ ] **Step 6: Run the whole suite**

Run: `npm test`

Expected: PASS, with 14 new cases. `mockNights.test.js` must still pass untouched — its assertions are about offsets, clock ranges and the late-caffeine correlation, none of which the added literal touches.

- [ ] **Step 7: Verify the badges by hand**

Run the driver first — `node drive-history.mjs` — expected `3/3 passed`, unchanged from Task 1.

Then, in the browser at `http://localhost:5174/` with a completed profile: open the profile sheet and look at Achievements. Expected: "First night", "A full week", "Stopped early", "Hard night", "Took the rest", "Home safe" and "Reset habit" all lit, because the mock is still driving `history` and now carries `endShift`. If "Home safe" is dark, `materializeNights` is missing its literal.

- [ ] **Step 8: Commit**

```bash
git add src/stats.js src/mockNights.js src/stats.test.js
git commit -m "feat: an earn-only badge stops un-earning itself at the boundary"
```

---

### Task 3: A range is a window of days, not a count of records

**Files:**
- Modify: `src/stats.js` — `RANGES` (lines 19-25).
- Modify: `src/screens/Dashboard.jsx` — the `hist` expression (lines 180-182).
- Modify: `src/stats.test.js` — the `RANGES` describe block (lines 12-18).
- Modify: `drive-history.mjs` — two helpers and one appended check.

**Interfaces:**
- Consumes: `RANGES` from `src/stats.js`, already imported by both `Dashboard.jsx` and `ui/index.jsx`.
- Produces: `RANGES` entries are now `{ key, label, days }`. The `nights` field is **gone** — nothing may read `spec.nights` after this task. `days` is `Infinity` for `"all"`. Keys and labels are unchanged, so `ui/index.jsx`'s select and `selectionLabel` need no edit.

**Background the implementer needs:**

`nights.slice(0, spec.nights)` takes N *records*. Against 45 dense consecutive mock nights those were the same thing. Against a real archive they are not: an intermittent worker's "1 week" becomes the last seven nights they logged, which can span a month — and `wakeDrift`, `spread` and every "N of M nights" figure then describe a window nobody chose.

**A range is every record whose night falls inside the window.** The field is renamed because its meaning changed, and a field named `nights` holding days is exactly the kind of thing somebody misreads at 3am. `Infinity` replaces the `999` sentinel: as a record count 999 was unreachable, as a day count it is a 2.7-year cliff, and `Infinity` is one word with no cliff at all.

The `>= 0` term excludes future-dated records, and it is reachable — a device clock moved backward makes `forward` hold the stored night ahead of the computed one, and a hand-edited archive is a documented trust boundary. A negative offset would otherwise sit inside every window and inflate every average. One comparison buys the guard; do not drop it because "the app cannot produce one".

`st.n` becomes the number of nights **logged** in the window, which is the right denominator for every average — "3 nights" under a "1 week" title reads as three nights logged in the last week, which is exactly true. That is also the answer Phase 0 deferred about averages, arriving early and for free.

**Why this lands before the swap and is still green.** The mock's offsets are 0 (tonight) through 45, dense and consecutive, so a day window and a record slice select the same records — with one honest exception: when nothing has been logged tonight, `foldNight` returns null, the old `slice(0, 7)` took mock offsets 1..7 (seven records) and the new filter takes 1..6 (six). That difference is the fix, not a regression. It is also why `?seed` shows six nights in a seven-day window in Task 4: the mock's offsets start at 1, so with nothing logged tonight the "Now" chip is genuinely empty. The driver check below runs with logs present, where the two agree exactly.

- [ ] **Step 1: Write the failing test**

In `src/stats.test.js`, replace the `RANGES` describe block (lines 12-18) with:

```js
describe("RANGES", () => {
  it("offers only multi-night windows, since one night is picked off the strip", () => {
    expect(RANGES.map((r) => r.label))
      .toEqual(["3 days", "1 week", "2 weeks", "1 month", "All time"]);
    expect(RANGES.every((r) => r.days > 1)).toBe(true);
  });

  /* The field is a span of days, not a count of records: against a sparse
     archive an intermittent worker's "1 week" would otherwise reach back a
     month, and every average would describe a window nobody chose. */
  it("measures a window in days and carries no record count", () => {
    // Infinity, not 999: unreachable as a record count, 2.7 years as a day count
    expect(RANGES.map((r) => r.days)).toEqual([3, 7, 14, 30, Infinity]);
    expect(RANGES.every((r) => r.nights === undefined)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/stats.test.js`

Expected: FAIL, two cases — `r.days` is `undefined`, so `days > 1` is false and the array is `[undefined × 5]`.

- [ ] **Step 3: Rename the field**

In `src/stats.js`, replace lines 17-25 — the comment and the array — with:

```js
/* Multi-night windows only. A single night is not a range: it is picked off
   the day strip as "d<offset>", which is why "Today" is not in this list.
   `days`, not a record count: a window is a span of nights ending tonight, so
   an intermittent worker's "1 week" is honestly thin rather than dishonestly
   dense. Infinity rather than a sentinel, because a sentinel that is a
   plausible number of days is a cliff. */
export const RANGES = [
  { key: "3d",  label: "3 days",   days: 3 },
  { key: "1w",  label: "1 week",   days: 7 },
  { key: "2w",  label: "2 weeks",  days: 14 },
  { key: "1m",  label: "1 month",  days: 30 },
  { key: "all", label: "All time", days: Infinity },
];
```

- [ ] **Step 4: Filter the window instead of slicing records**

In `src/screens/Dashboard.jsx`, replace lines 180-182:

```js
  const hist = off === null
    ? nights.slice(0, spec.nights)
    : (night ? [night] : []);
```

with:

```js
  /* A window of days ending tonight, not the first N records: a sparse archive
     makes those two different, and a slice would quietly stretch "1 week" over
     a month. The >= 0 term drops future-dated records, which a backward device
     clock or a hand-edited archive can both produce and which would otherwise
     sit inside every window and inflate every average. */
  const hist = off === null
    ? nights.filter((h) => h.dayOffset >= 0 && h.dayOffset < spec.days)
    : (night ? [night] : []);
```

- [ ] **Step 5: Run the whole suite**

Run: `npm test`

Expected: PASS. `share.test.js` imports `Dashboard.jsx` for its `share` helper and must still pass; if it fails to resolve, the edit above introduced a syntax error.

- [ ] **Step 6: Add the regression check to the driver**

In `drive-history.mjs`, add these two helpers immediately below the `read` function near the top of the file. Both are used again by Tasks 4 and 5 — do not inline them:

```js
/* The hero Stat's note — "7 nights" — read through the locator engine rather
   than the body text, because "7 nights" also appears in the badge copy. Stat
   renders the label span and the note span as siblings. Short timeout and a
   null on miss: an absent hero is a legitimate expected value, not a hang. */
const heroNote = (page) =>
  page.locator('span:text-is("Average sleep") + span')
    .textContent({ timeout: 1500 }).catch(() => null);

/* A full NightRecord as `archived` writes one: every field the Dashboard reads,
   and deliberately NO dayOffset — that is the field Task 4 computes. */
const REC = (id, extra = {}) => ({
  id, sleepStart: 450, wake: 900, sleepHours: 7.5, sleepEstimated: false,
  cutoff: 1290, caffeine: [1140, 1230], moveDone: 2, moveTotal: 4,
  restKind: "nap", restMin: 20, groggy: false, water: 3, screenStrain: 0,
  sleepyWindow: "deep", heavyMeal: false, lateLightDone: true, endShift: true, ...extra,
});
```

Then insert this block immediately **above** the `await browser.close();` line:

```js
/* ---- H4: a dense week is seven nights through a day window ---------------- */
{
  /* Six archived nights at offsets 1..6 plus tonight's logs. Deliberately a
     fixture that reads the same before and after Task 4's swap: the mock gives
     seven here today, the archive gives seven here tomorrow, so this check
     stays green instead of turning red two commits later. */
  const IDS = ["2026-08-11", "2026-08-10", "2026-08-09", "2026-08-08", "2026-08-07", "2026-08-06"];
  const { ctx, page, errors } = await open(browser, {
    time: new Date("2026-08-13T02:00:00"),
    blob: { night: "2026-08-12", profile: PROFILE, logs: LOGS, reflection: {}, theme: null,
            archive: IDS.map((id) => REC(id)) },
  });
  await page.selectOption('select[aria-label="Longer windows"]', "1w");
  await page.waitForTimeout(300);
  const week = await heroNote(page);
  record("H4 a dense week is seven nights through a day window",
    week === "7 nights" && !errors.length,
    `hero note=${week} err=${errors.join(" || ") || "none"}`);
  await ctx.close();
}
```

`RANGES.days` being `Infinity` rather than `999` has no end-to-end check and does not need one: it is a constant in an array, asserted directly in Step 1.

- [ ] **Step 7: Run the driver**

Run: `node drive-history.mjs`

Expected: `4/4 passed`.

If H4 reads `6 nights`, the blob's logs did not fold into tonight — check that `LOGS` is being seeded. If it reads `0 nights`, `spec.days` is undefined at the filter — the rename in Step 3 and the read in Step 4 disagree. If it reads `null`, the hero label text has moved and the `heroNote` selector needs updating.

- [ ] **Step 8: Commit**

```bash
git add src/stats.js src/screens/Dashboard.jsx src/stats.test.js drive-history.mjs
git commit -m "feat: a range is a window of days, not a count of records"
```

---

### Task 4: The swap

**Files:**
- Modify: `src/time.js` — append one exported function.
- Modify: `src/time.test.js` — append one `describe` block, extend the import.
- Modify: `src/App.jsx` — the time import at line 9, a new module constant beside `boot` (after line 2307), the `history` memo (2400-2409), `exportData`'s payload (2547), and the `<Dashboard>` props (2609-2611).
- Modify: `src/screens/Dashboard.jsx` — the component signature (165-168) and the closing `Info` row (385-391).
- Modify: `drive-history.mjs` — five appended checks and two helpers. `heroNote` and `REC` already exist from Task 3; do not redefine them.

**Interfaces:**
- Consumes: `forward` from Task 1 (already wired). `RANGES[].days` from Task 3. `nightRef` and `archive`, both already in `App.jsx`'s component body. `foldNight(profile, logs, reflection)` from `src/stats.js`, already imported.
- Produces:
  - `daysBetween(a: string, b: string) -> number` — exported from `src/time.js`. Whole days from `b` to `a`, both `"YYYY-MM-DD"`. Positive when `a` is later.
  - `Dashboard` gains one prop, `seeded: boolean`. Every other prop is unchanged.
  - `history` is now `[tonight, ...archive-with-computed-dayOffset]`, or the mock under `?seed`.

**Background the implementer needs:**

Archived records deliberately carry no `dayOffset` (`storage.js:27` strips it), because it is relative to tonight and a stored one is wrong by morning. It is derived from the record's night id against the night the app is currently standing in.

**Why `Date.parse` and not a `Date`.** `Date.parse` reads a bare `"YYYY-MM-DD"` as UTC midnight, and UTC has no DST, so the difference is an exact whole number of days by construction. Parsing these into *local* `Date`s is what would introduce the trap, not avoid it: a local DST day is 23 or 25 hours, so a week across one measures 6.958 days. `Math.round` is therefore **not** a DST fix — it is there so a hand-edited id that lost its zero-padding still lands on an integer rather than a fraction that matches no chip.

`nightOf` is untouched. Nothing in this phase needs to format a `Date` back into an id.

**Why the anchor is `nightRef.current` and not a fresh `nightOf`.** After a backward edit the two disagree, and offsets should count back from the night tonight's logs will actually be filed under. The anchor cannot be undefined where it is used: `boot` sets `night` whenever `boot.profile` exists, and when it does not, `archive` seeds to `[]`, so an undefined anchor only ever maps an empty array.

**Why `now` is in the memo's dependency list.** The ref is not reactive, and a boundary can pass with nothing logged — no logs to clear, no archive to grow, nothing else in that list moves. Every archived offset would sit a day out until the next tap. The tick is the only thing that fires there. The cost is one `foldNight` and one map over a few dozen entries every 30 seconds, on the same tick that already re-runs `generateTimeline`. Measurable against nothing.

**Why the seed goes in the memo and not into `archive` state.** Seeding the state would push 45 fictional nights through the write effect and onto the user's disk, where they would outlive the flag. The memo is where fiction can exist without being persisted.

**Why `materializeNights` keeps its shape.** Its rows already carry `dayOffset` and `mock-N` ids, which is what the Dashboard wants, so the memo branches once rather than restamping 45 rows with dates in order to measure the same offsets straight back out. `daysBetween` is unit-tested directly, and driver check R4 drives a real record carrying no `dayOffset` through the strip — the same assertion, without changing a tested file or its suite.

**Why the seeded Dashboard says so.** The screen's own stated rule (`Dashboard.jsx:20`) is that no figure is ever fabricated, and 45 invented nights presented as history is the largest possible violation of it. The range view already ends with a muted `Info` line; under the flag it says something else. One prop, one ternary, no new component.

**The export loses `history`.** Phase 2 added it as "the only way to see the archive without opening devtools" and said it costs nothing to remove once `history` becomes the archive. It is now the archive plus a derived field, and under `?seed` it is 45 nights of fiction — duplication in the good case and a lie in the other.

- [ ] **Step 1: Write the failing tests**

Extend the import on line 2 of `src/time.test.js` to include `daysBetween`:

```js
import { DAY, toMin, fmt, nextAfter, overlap, dur, nightAxis, nightTick, nightOf, forward, daysBetween } from "./time.js";
```

Append at the end of the file:

```js
describe("daysBetween", () => {
  it("counts whole days from the older id to the newer", () => {
    expect(daysBetween("2026-08-13", "2026-08-06")).toBe(7);
  });

  it("is zero for the same night", () => {
    expect(daysBetween("2026-08-13", "2026-08-13")).toBe(0);
  });

  /* Reachable: a device clock moved backward leaves the stored night ahead of
     the computed one, and a hand-edited archive can hold anything. The
     Dashboard's `dayOffset >= 0` filter is what acts on this. */
  it("goes negative for a record dated after the anchor", () => {
    expect(daysBetween("2026-08-06", "2026-08-13")).toBe(-7);
  });

  /* A local DST day is 23 or 25 hours, so a week across one measures 6.958
     days. Date.parse reads a bare date as UTC midnight and UTC has no DST, so
     this is exact by construction rather than by rounding. */
  it("returns a whole week across a DST boundary, not 6 or 8", () => {
    const d = daysBetween("2026-11-08", "2026-11-01");
    expect(d).toBe(7);
    expect(Number.isInteger(d)).toBe(true);
  });

  /* The one thing Math.round is actually for: a hand-edited id that lost its
     zero-padding parses as a LOCAL date, so the difference can be fractional. */
  it("still lands on an integer for an id that lost its zero-padding", () => {
    expect(daysBetween("2026-8-13", "2026-8-6")).toBe(7);
  });

  it("crosses a month boundary", () => {
    expect(daysBetween("2026-08-02", "2026-07-30")).toBe(3);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/time.test.js`

Expected: FAIL, 6 cases, `daysBetween is not a function`.

- [ ] **Step 3: Write `daysBetween`**

Append to `src/time.js`, below `forward`:

```js
/** Whole days from b to a, both "YYYY-MM-DD".
    Date.parse reads a bare date as UTC midnight, and UTC has no DST, so the
    difference is an exact whole number of days by construction. Parsing these
    into local Dates is what would introduce the trap, not avoid it: a local DST
    day is 23 or 25 hours, so a week across one measures 6.958 days. Math.round
    is therefore not a DST fix — it is there so a hand-edited id that lost its
    zero-padding still lands on an integer rather than a fraction that matches
    no chip. */
export const daysBetween = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 864e5);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/time.test.js`

Expected: PASS.

- [ ] **Step 5: Read the seed flag**

`src/App.jsx`, line 9, extend the time import:

```js
import { DAY, toMin, fmt, nextAfter, dur, nightOf, forward } from "./time.js";
```

becomes:

```js
import { DAY, toMin, fmt, nextAfter, dur, nightOf, forward, daysBetween } from "./time.js";
```

Then immediately below the closing `})();` of the `boot` expression (line 2307), add:

```js
/* Demo mode. Read once, beside boot, because it never changes without a reload.
   No import.meta.env.DEV gate: this is a thesis prototype that gets demonstrated
   from a built artifact, and a flag that only works under `vite dev` would not
   work in the room where it is needed. */
const seeded = new URLSearchParams(location.search).has("seed");
```

- [ ] **Step 6: Swap the memo**

`src/App.jsx:2400-2409`. Replace the comment and the memo, in full, with:

```js
  /* Nights are derived, never stored. The archive supplies the past and carries
     no dayOffset — it is relative to tonight, so a stored one is wrong by
     morning — and tonight is folded from the live logs at the front. Index 0 is
     the newest, which is what every window and the day strip assume.
     `now` is a dependency because the ref is not reactive and a boundary can
     pass with nothing logged: no logs to clear, no archive to grow, nothing
     else in this list moves, and every archived offset would sit a day out
     until the next tap. The tick is the only thing that fires there.
     The seed branches here rather than seeding `archive` state, because state
     would put 45 fictional nights through the write effect and onto the user's
     disk, where they would outlive the flag. */
  const history = useMemo(() => {
    if (!profile) return [];
    const anchor = nightRef.current;
    const past = seeded
      ? materializeNights(profile)
      : archive.map((r) => ({ ...r, dayOffset: daysBetween(anchor, r.id) }));
    const tonight = foldNight(profile, logs, reflection);
    return tonight ? [tonight, ...past] : past;
  }, [profile, logs, reflection, archive, now]);
```

`foldNight` is untouched: it already returns `dayOffset: 0` and `id: "tonight"`, both correct for this caller, and nothing downstream needs tonight's record to carry a date id. Only the archive is mapped.

- [ ] **Step 7: Take `history` out of the export**

`src/App.jsx:2547`. Change:

```js
    const payload = JSON.stringify({ app: "GraveYard", profile, logs, history, reflection, archive }, null, 2);
```

to:

```js
    const payload = JSON.stringify({ app: "GraveYard", profile, logs, reflection, archive }, null, 2);
```

- [ ] **Step 8: Tell the Dashboard it is showing a demo**

`src/App.jsx:2609-2611`, add the prop:

```js
          <Dashboard T={T} profile={profile} nights={history} seeded={seeded}
            rangeKey={rangeKey} setRangeKey={setRangeKey} say={say} setProfile={setProfile}
            plan={plan} status={s.itemStatus} now={now} onOpenPlan={() => setTab("plan")} />
```

In `src/screens/Dashboard.jsx`, add `seeded` to the destructured props (line 166):

```js
export default function Dashboard({
  T, profile, nights, rangeKey, setRangeKey, say, setProfile,
  plan, status, now, onOpenPlan, seeded,
}) {
```

and change the closing muted row of the range view (lines 385-391) so the text is a ternary:

```js
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 7, margin: "14px 4px 8px",
        fontFamily: FONT_TEXT, fontSize: 12.5, color: T.faint, lineHeight: 1.4,
      }}>
        <Info size={13} style={{ flexShrink: 0, marginTop: 2 }} />
        {/* Not decoration: this screen's rule is that no figure is ever
            fabricated, and 45 invented nights presented as history is the
            largest possible violation of it. */}
        {seeded
          ? "Demo data — 45 sample nights. Reload without ?seed for your own."
          : "Nothing here is a score, and nothing here is graded."}
      </div>
```

- [ ] **Step 9: Run the whole suite**

Run: `npm test`

Expected: PASS, with 6 new cases and nothing else moved.

- [ ] **Step 10: Add the swap's checks to the driver**

In `drive-history.mjs`, add these two helpers below `REC`. `heroNote` and `REC` are already there from Task 3 — leave them alone:

```js
/* The day strip, read off the DOM. DayChip's circle carries opacity 0.5 when it
   is dim and not selected, so the strip must be read with a WINDOW selected —
   otherwise the selected chip reports opaque whether it has a record or not. */
const strip = (page) => page.evaluate(() => {
  const out = {};
  for (const b of document.querySelectorAll("button[aria-label]")) {
    const l = b.getAttribute("aria-label");
    if (!/^(Now|\d+d)$/.test(l)) continue;
    const dot = b.querySelector("span:nth-child(2)");
    out[l] = dot ? getComputedStyle(dot).opacity !== "1" : null;   // true = dim
  }
  return out;
});

const badgeLit = (page, label) => page.evaluate((l) => {
  for (const g of document.querySelectorAll("div")) {
    if (getComputedStyle(g).display !== "grid") continue;
    const tile = [...g.children].find((c) => c.textContent.includes(l));
    if (tile) return getComputedStyle(tile).opacity === "1";
  }
  return null;
}, label);
```

Then insert this block immediately above `await browser.close();`:

```js
/* ---- R2: a sparse archive fills some chips and dims the rest -------------- */
{
  // anchor is 2026-08-12 (PROFILE at 02:00 on Aug 13), so these are offsets 1 and 4
  const { ctx, page, errors } = await open(browser, {
    time: new Date("2026-08-13T02:00:00"),
    blob: { night: "2026-08-12", profile: PROFILE, logs: [], reflection: {}, theme: null,
            archive: [REC("2026-08-11"), REC("2026-08-08")] },
  });
  await page.selectOption('select[aria-label="Longer windows"]', "1w");
  await page.waitForTimeout(300);
  const note = await heroNote(page);
  const chips = await strip(page);
  record("R2 a sparse archive lands on the right chips and counts the right nights",
    note === "2 nights" &&
    chips["1d"] === false && chips["4d"] === false &&
    chips["Now"] === true && chips["2d"] === true && chips["3d"] === true &&
    chips["5d"] === true && chips["6d"] === true && !errors.length,
    `note=${note} chips=${JSON.stringify(chips)} err=${errors.join(" || ") || "none"}`);
  await ctx.close();
}

/* ---- R3: the window is days, so an old record is out of a short one ------- */
{
  /* Two records, three days and twenty days back. A slice of the last N
     RECORDS would put both inside "1 week"; a window of days puts one. Both
     assertions read a populated hero on purpose, so Task 5's empty-window
     early return cannot change what this check sees. */
  const { ctx, page, errors } = await open(browser, {
    time: new Date("2026-08-13T02:00:00"),
    blob: { night: "2026-08-12", profile: PROFILE, logs: [], reflection: {}, theme: null,
            archive: [REC("2026-08-09"), REC("2026-07-23")] },   // offsets 3 and 20
  });
  await page.selectOption('select[aria-label="Longer windows"]', "1w");
  await page.waitForTimeout(300);
  const week = await heroNote(page);
  await page.selectOption('select[aria-label="Longer windows"]', "1m");
  await page.waitForTimeout(300);
  const month = await heroNote(page);
  record("R3 a record 20 days back is out of 1 week and inside 1 month",
    week === "1 night" && month === "2 nights" && !errors.length,
    `1w note=${week} 1m note=${month} err=${errors.join(" || ") || "none"}`);
  await ctx.close();
}

/* ---- R4: dayOffset is computed, never read ------------------------------- */
{
  // the seeded record carries no dayOffset at all; it must still answer the 3d chip
  const { ctx, page, errors } = await open(browser, {
    time: new Date("2026-08-13T02:00:00"),
    blob: { night: "2026-08-12", profile: PROFILE, logs: [], reflection: {}, theme: null,
            archive: [REC("2026-08-09")] },   // offset 3
  });
  await page.getByRole("button", { name: "3d", exact: true }).click();
  await page.waitForTimeout(300);
  const t = (await read(page)).text;
  record("R4 a record stored with no dayOffset selects on its computed chip",
    t.includes("In figures") && !t.includes("No record for this night.") && !errors.length,
    `figures=${t.includes("In figures")} empty=${t.includes("No record for this night.")} err=${errors.join(" || ") || "none"}`);
  await ctx.close();
}

/* ---- R7: ?seed is a view, never a write ---------------------------------- */
{
  const blob = { night: "2026-08-12", profile: PROFILE, logs: [], reflection: {}, theme: null,
                 archive: [REC("2026-08-11")] };
  const { ctx, page, errors } = await open(browser, {
    time: new Date("2026-08-13T02:00:00"), blob, query: "?seed",
  });
  await page.selectOption('select[aria-label="Longer windows"]', "1w");
  await page.waitForTimeout(300);
  const seededNote = await heroNote(page);
  const s = await read(page);
  const labelled = s.text.includes("Demo data — 45 sample nights.");
  /* Read the STORAGE while the flag is still on. The context's init script
     re-seeds gy.v1 on the next navigation, so checking it after the reload
     would mask exactly the bug this check exists for. */
  const seededStore = s.archiveLen;

  // same context, same storage, flag off
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(400);
  await page.selectOption('select[aria-label="Longer windows"]', "1w");
  await page.waitForTimeout(300);
  const realNote = await heroNote(page);
  const after = await read(page);
  record("R7 ?seed fills the ranges, says so, and never touches the archive",
    seededNote === "6 nights" && labelled && seededStore === 1 && realNote === "1 night" &&
    after.archiveLen === 1 && after.ids[0] === "2026-08-11" && !errors.length,
    `seeded=${seededNote} labelled=${labelled} storedUnderFlag=${seededStore} real=${realNote} stored=${JSON.stringify(after.ids)} err=${errors.join(" || ") || "none"}`);
  await ctx.close();
}

/* ---- R8: Home safe survives the boundary that clears the logs ------------- */
{
  const { ctx, page, errors } = await open(browser, {
    time: new Date("2026-08-13T14:59:00"),
    blob: { night: "2026-08-12", profile: PROFILE, theme: null, archive: [], reflection: {},
            logs: [...LOGS, { id: "end-1", t: 1800, type: "endShift", value: 1 }] },
  });
  await page.clock.fastForward("00:02:00");     // two minutes: 14:59 -> 15:01
  await page.waitForTimeout(400);
  const s = await read(page);
  await page.locator("button").filter({ hasText: /^$/ }).first().click();
  await page.waitForTimeout(400);
  const lit = await badgeLit(page, "Home safe");
  record("R8 Home safe is still lit after the rollover cleared the logs",
    s.logs === 0 && s.archiveLen === 1 && lit === true && !errors.length,
    `logsAfterRoll=${s.logs} archive=${s.archiveLen} homeSafeLit=${lit} err=${errors.join(" || ") || "none"}`);
  await ctx.close();
}
```

Note on R7's expected `"6 nights"`: `?seed` shows the 45 mock nights at offsets 1..45 with nothing logged tonight, so a 7-day window holds offsets 1 through 6 — six nights, and the "Now" chip is empty because there is no tonight to fold. That is the correct arithmetic for this fixture, not an off-by-one.

- [ ] **Step 11: Run the driver**

Run: `node drive-history.mjs`

Expected: `9/9 passed`. H1–H4 must still pass: H4's fixture was built to read the same before and after this swap, so if it flips to `1 night` the memo is reading `archive` but the fixture's six records are not being offset — check `daysBetween`'s argument order.

Failure map, in the order you will hit them:

- R2 reports every chip dim and `note=0 nights` → the memo is still calling `materializeNights` unconditionally, or `seeded` is truthy without the flag.
- R2 reports the right count but the wrong chips → the anchor is a fresh `nightOf` rather than `nightRef.current`, or `daysBetween`'s arguments are reversed (`daysBetween(r.id, anchor)` gives negative offsets, which the `>= 0` filter then eats — you would see `0 nights`).
- R4 reports `No record for this night.` → the map is not adding `dayOffset`, or it is spreading in the wrong order and the record's absent field is overwriting the computed one.
- R7 reports a stored archive of 46 → the seed went into `archive` state instead of the memo. This is the one failure that writes fiction to a user's disk; stop and fix it there.

- [ ] **Step 12: Verify the export by hand**

In the browser at `http://localhost:5174/`, open the profile sheet → "Your data" → Export data, and open the downloaded `graveyard-data.json`.

Expected: keys `app`, `profile`, `logs`, `reflection`, `archive` — and **no** `history`.

- [ ] **Step 13: Commit**

```bash
git add src/time.js src/time.test.js src/App.jsx src/screens/Dashboard.jsx drive-history.mjs
git commit -m "feat: the Dashboard reads the archive, and the mock becomes a seed"
```

---

### Task 5: Empty states

**Files:**
- Modify: `src/screens/Dashboard.jsx` — the stats import (line 7), the `readPatterns` call (185), a new early return at the top of the range section (after 262), the two `Panel`s (313-348), and one new row below them.
- Modify: `drive-history.mjs` — five appended checks.

**Interfaces:**
- Consumes: `MIN_TREND` from `src/stats.js` (Task 2). `Display`, `Lead`, `RangeControl`, `Card`, `Panel`, `Info`, `plural`, `FONT_TEXT` — all already in scope in `Dashboard.jsx`. `rangeStats([])` already returns its zero object and `readPatterns` already handles every null.
- Produces: nothing importable. The observable contract is that a day-one user's Dashboard renders no fabricated figure and no empty chart frame, and that it says how many nights are still missing.

**Background the implementer needs:**

Day one shows one night, or none. `rangeStats([])` returns its zero object and `readPatterns` handles every null, so the range view already renders without throwing. What it *renders* is a hero reading "-", a trio reading "-", two empty chart frames, a bullet saying nothing stood out, and a card offering a plan adjustment derived from no data. Nothing is wrong and everything is noise.

**The early return goes BELOW the `off !== null` block, not above it.** `hist` is `[]` for an empty single night too, and that case already has its own better copy ("Nothing logged yet." / "No record for this night.", `Dashboard.jsx:192-204`). Placed above, this would hijack it. This is the single easiest thing to get wrong in the task.

**The trap in `readPatterns`, so you do not write copy into a function nobody renders.** It returns twelve lines. The Dashboard renders three: `mainPattern`, `noticed` and `adjustment`. `sleepAvgLine`, `sleepTiming`, `wakeDrift`, `caffeine`, `movement`, `rest`, `fatigue`, `foodHydration` and `light` are computed and dropped on the floor — and several of them already contain exactly the empty-state sentence you will be tempted to write ("No sleep has been logged in this period yet…"). **Empty-state copy added there will not appear on any screen.** Deleting the nine dead lines is not this phase's job; knowing they are dead is.

`readPatterns` already supplies the rest of the sparse-data copy: "1 night on record, and patterns need about a week to show up." renders as the `Lead` under the hero with no change at all.

**Charts render from one datum.** A single bar is honest; hiding it would be the fabrication, in the other direction. A threshold of two would hide a real night for no reason.

There is no unit test in this task and that is deliberate: everything here is JSX, `App.jsx` has no component harness, and adding one for four conditionals is a larger change than the phase. The logic these conditions call — `rangeStats`, `readPatterns`, `MIN_TREND` — is pure and already covered. The driver is the verification.

- [ ] **Step 1: Import the threshold and move the `readPatterns` call**

`src/screens/Dashboard.jsx`, line 7. Change:

```js
import { RANGES, rangeStats, readPatterns, dayOffsetOf } from "../stats.js";
```

to:

```js
import { RANGES, rangeStats, readPatterns, dayOffsetOf, MIN_TREND } from "../stats.js";
```

Then **delete** line 185:

```js
  const pat = readPatterns(profile, st);
```

Leave `const st = rangeStats(profile, hist);` and `const rests = st.naps + st.quiets;` exactly where they are. `pat` is re-declared in Step 2, below the empty-window return, because above it its output is thrown away.

- [ ] **Step 2: Add the empty-window return**

In the range section, immediately after the `/* ------------------------------- range ---------------------------------- */` comment (line 264) and **before** `const chrono = [...hist].reverse();`, insert:

```js
  /* Below the single-night block on purpose: hist is [] for an empty single
     night too, and that case already has better copy above. Placed higher, this
     would hijack it.
     What renders without this is a hero reading "-", a trio reading "-", two
     empty chart frames, and a plan adjustment derived from no data — nothing
     wrong, and all of it noise. */
  if (!hist.length) {
    return (
      <div style={{ padding: "4px 20px 0" }}>
        <RangeControl T={T} value={rangeKey} onChange={setRangeKey} have={have} />
        <Display T={T} size={26} style={{ marginBottom: 8 }}>No nights on record yet.</Display>
        <Lead T={T}>Log tonight and this window fills in as you go.</Lead>
      </div>
    );
  }

  const pat = readPatterns(profile, st);
  const chrono = [...hist].reverse();
```

(The `const chrono` line already exists — do not duplicate it; the snippet shows it only so you can see where `pat` lands.)

Same components, same sizes, same two-element shape as the single-night empty branch at `Dashboard.jsx:192`.

- [ ] **Step 3: Draw a chart only when there is something to draw**

Wrap the sleep `Panel` (currently lines 313-332). Change its opening from:

```js
      <Panel T={T} title="When you slept" height={158}
```

to:

```js
      {/* the array is already filtered to records with both a start and a
          duration, so this is exactly "is there a bar to draw" */}
      {sleep.length > 0 && (
      <Panel T={T} title="When you slept" height={158}
```

and its closing `</Panel>` to:

```js
      </Panel>
      )}
```

Wrap the caffeine `Panel` (currently lines 334-348) the same way. Change:

```js
      <Panel T={T} title="Caffeine against cutoff" sub="dots above the line landed late">
```

to:

```js
      {/* a profile taking no caffeine has no cutoff line and no dots, and an
          axis with nothing on it is not a chart */}
      {hist.some((h) => h.caffeine.length || h.cutoff !== null) && (
      <Panel T={T} title="Caffeine against cutoff" sub="dots above the line landed late">
```

and its closing `</Panel>` to:

```js
      </Panel>
      )}
```

- [ ] **Step 4: Name the number of nights still missing**

Immediately after the caffeine `Panel`'s closing `)}` and **before** `<Head T={T}>What the plan noticed</Head>`, insert:

```js
      {st.n < MIN_TREND && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 7, margin: "14px 4px 8px",
          fontFamily: FONT_TEXT, fontSize: 12.5, color: T.faint, lineHeight: 1.4,
        }}>
          <Info size={13} style={{ flexShrink: 0, marginTop: 2 }} />
          {plural(MIN_TREND - st.n, "more night", "more nights")} and these charts start reading as trends.
        </div>
      )}
```

Same muted `Info` row the screen already ends with, and `plural` is already defined at line 25.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`

Expected: PASS, unchanged. `share.test.js` imports this file and is the only thing that would catch a syntax error here.

- [ ] **Step 6: Add the empty-state checks to the driver**

In `drive-history.mjs`, insert this block immediately above `await browser.close();`:

```js
/* ---- E1: nothing logged, ever -------------------------------------------- */
{
  const { ctx, page, errors } = await open(browser, {
    time: new Date("2026-08-13T02:00:00"),
    blob: { night: "2026-08-12", profile: PROFILE, logs: [], reflection: {}, theme: null, archive: [] },
  });
  const first = (await read(page)).text;            // opens on d0
  await page.selectOption('select[aria-label="Longer windows"]', "1w");
  await page.waitForTimeout(300);
  const window = (await read(page)).text;
  const chips = await strip(page);
  record("E1 a user with nothing on record gets two different honest screens",
    first.includes("Nothing logged yet.") &&
    window.includes("No nights on record yet.") &&
    !window.includes("Nothing here is a score") &&      // the full range view did not render
    Object.values(chips).every((dim) => dim === true) && !errors.length,
    `d0="${first.includes("Nothing logged yet.")}" 1w="${window.includes("No nights on record yet.")}" chips=${JSON.stringify(chips)} err=${errors.join(" || ") || "none"}`);
  await ctx.close();
}

/* ---- E2: one night, and it says how many are missing ---------------------- */
{
  /* The sleep pair is load-bearing: `sleep` is filtered on sleepStart AND
     sleepHours, and a reflection bucket alone gives hours with no start — so
     without these two logs the night is real but "When you slept" is correctly
     absent, and the assertion below would be asserting the wrong thing. */
  const SLEPT = [
    { id: "s-1", t: 450, type: "sleepStart", value: 1 },
    { id: "w-2", t: 450 + 7 * 60, type: "wake", value: "ontime" },
  ];
  const { ctx, page, errors } = await open(browser, {
    time: new Date("2026-08-13T02:00:00"),
    blob: { night: "2026-08-12", profile: PROFILE, logs: [...LOGS, ...SLEPT],
            reflection: { slept: "7–9h" }, theme: null, archive: [] },
  });
  await page.selectOption('select[aria-label="Longer windows"]', "1w");
  await page.waitForTimeout(300);
  const note = await heroNote(page);
  const t = (await read(page)).text;
  record("E2 one night renders as one night, with the countdown and a chart",
    note === "1 night" &&
    t.includes("1 night on record, and patterns need about a week to show up.") &&
    t.includes("4 more nights and these charts start reading as trends.") &&
    t.includes("When you slept") && !errors.length,
    `note=${note} lead=${t.includes("1 night on record")} countdown=${t.includes("4 more nights")} sleepChart=${t.includes("When you slept")} err=${errors.join(" || ") || "none"}`);
  await ctx.close();
}

/* ---- E3/E4: the countdown counts, and stops at MIN_TREND ------------------ */
{
  const ids = ["2026-08-11", "2026-08-10", "2026-08-09", "2026-08-08", "2026-08-07"];
  for (const [label, n, expected] of [["three", 3, "2 more nights"], ["five", 5, null]]) {
    const { ctx, page, errors } = await open(browser, {
      time: new Date("2026-08-13T02:00:00"),
      blob: { night: "2026-08-12", profile: PROFILE, logs: [], reflection: {}, theme: null,
              archive: ids.slice(0, n).map((id) => REC(id)) },
    });
    await page.selectOption('select[aria-label="Longer windows"]', "1w");
    await page.waitForTimeout(300);
    const t = (await read(page)).text;
    const hasLine = /\d+ more nights? and these charts start reading as trends\./.test(t);
    record(`E${expected ? 3 : 4} the countdown ${expected ? "counts down" : "is gone at MIN_TREND"} (${label} nights)`,
      (expected ? t.includes(expected) : !hasLine) && !errors.length,
      `note=${await heroNote(page)} line=${hasLine} err=${errors.join(" || ") || "none"}`);
    await ctx.close();
  }
}

/* ---- E5: a chart with nothing to draw is absent, not empty ---------------- */
{
  const NOCAF = { ...PROFILE, caffeine: "none" };
  const { ctx, page, errors } = await open(browser, {
    time: new Date("2026-08-13T02:00:00"),
    blob: { night: "2026-08-12", profile: NOCAF, logs: [], reflection: {}, theme: null,
            archive: [REC("2026-08-11", { sleepStart: null, wake: null, sleepHours: null,
                                          cutoff: null, caffeine: [] }),
                      REC("2026-08-10", { sleepStart: null, wake: null, sleepHours: null,
                                          cutoff: null, caffeine: [] })] },
  });
  await page.selectOption('select[aria-label="Longer windows"]', "1w");
  await page.waitForTimeout(300);
  const t = (await read(page)).text;
  record("E5 both charts are absent when there is nothing to draw, and the page still renders",
    !t.includes("When you slept") && !t.includes("Caffeine against cutoff") &&
    t.includes("What the plan noticed") && !errors.length,
    `sleep=${t.includes("When you slept")} caffeine=${t.includes("Caffeine against cutoff")} rest=${t.includes("What the plan noticed")} err=${errors.join(" || ") || "none"}`);
  await ctx.close();
}
```

- [ ] **Step 7: Run the driver**

Run: `node drive-history.mjs`

Expected: `14/14 passed`.

If E2 reports `sleepChart=false`, the sleep `Panel`'s condition is wrong — the fixture logs a sleep pair precisely so there is a bar to draw.

If E1's `1w` screen contains "Nothing here is a score", the early return is missing or is placed after the range view's JSX. If E1's `d0` screen reads "No nights on record yet." instead of "Nothing logged yet.", the early return was placed **above** the `off !== null` block and has hijacked the single-night copy — move it down.

- [ ] **Step 8: Look at all four states in the browser**

The driver asserts text; this step is the one that catches a layout that reads badly. At `http://localhost:5174/`, using devtools → Application → Local Storage to set `gy.v1` and refreshing between each:

1. `{"night":"2026-08-12","profile":<yours>,"logs":[],"reflection":{},"archive":[]}` → the "Now" chip screen reads "Nothing logged yet."; picking "1 week" from Trends reads "No nights on record yet." with one muted line under it and no chart frames.
2. Log one caffeine from the `+`, pick "1 week". Expected: a hero with a real figure, one bar in "When you slept" once you also log a sleep, the caffeine chart with one dot, and "4 more nights and these charts start reading as trends."
3. Open `http://localhost:5174/?seed`. Expected: every window populated and the closing line reads "Demo data — 45 sample nights. Reload without ?seed for your own."
4. Reload without the flag. Expected: back to your own thin archive, and `gy.v1` still holds only what you logged.

- [ ] **Step 9: Commit**

```bash
git add src/screens/Dashboard.jsx drive-history.mjs
git commit -m "feat: a window with nothing in it says so"
```

---

## Done when

- `npm test` passes, with 27 more cases than commit `a758424`: 6 `forward`, 6 `daysBetween`, 2 `RANGES` (replacing 1), 3 `MIN_TREND`, 2 `foldNight endShift`, and 9 `achievements`.
- `node drive-history.mjs` prints `14/14 passed` and exits 0.
- `gy.v1`'s `night` never names an earlier night than it did a moment ago, including across a DST fall-back and a shift-time edit that moves the boundary backward.
- The Dashboard's nights come from `archive`, with `dayOffset` computed against `nightRef.current` and never read from a stored field.
- A "1 week" window holds every record within seven days of tonight, and no others.
- A window with nothing in it says "No nights on record yet." A single night renders without an empty chart frame. Below five nights, one line names how many are missing.
- `?seed` fills every range, labels itself on screen, and leaves `gy.v1` untouched.
- The export contains `archive` and no longer contains `history`.
- "Home safe" and "Reset habit" are still lit after a boundary crossing that cleared the logs.

## Known ceilings

Record these; do not close them in this phase.

- **Offsets are one day stale for up to 30 seconds after a shift-time edit that moves the night forward.** The adopt effect writes the ref after the render that saw the new profile, and `now` in the memo's dependency list is what re-reads it. Visible as every archived chip sitting one column off until the next tick. Fixing it properly means the night id becomes state, which re-introduces the ordering hazard Phase 2 spent an effect closing.
- **A merged night after a backward edit.** Task 1's accepted cost. Two nights of logs fold into one record and read as one long night.
- **The charts' X axis is categorical, so a gap is invisible.** Records four days apart sit in adjacent columns; only the "1d"/"5d" labels say otherwise. A truthful axis means a numeric or time scale and a rewrite of both `Panel`s — a chart project, not an empty-state one.
- **A hand-edited archive is still unvalidated.** A non-array throws into boot's catch and drops everything, a string spreads into one-character "records", and a duplicate id double-counts (`find` takes the newest-folded, `rangeStats` counts both). Nothing the app writes can produce any of them.
- **Last night is still folded against tonight's profile**, so a record's `cutoff` and `moveTotal` drift when the shift changes. Phase 2's ceiling — now visible on screen rather than buried in the export.
- **`materializeNights` and `foldNight` are still two hand-kept shapes.** `endShift` had to be added to both. Nothing enforces the match; a test comparing key sets would, and is a one-liner somebody should write the next time the shape moves.

## Explicitly not in this plan

- Deleting the nine unrendered `readPatterns` lines. Real dead weight, unrelated to this phase.
- An import path for the exported JSON. Nearly free, still a nice-to-have.
- Off-night stubs, a `workDays` array, nights-elapsed averages, `nightInStretch` counting itself (Phase 5).
- Archiving plan item lists so a past night's Plan page can be re-read. The roadmap recommends against it and Phase 4 owns the question.
- Retention limits, compaction, IndexedDB, a `storage` event listener.
- Persisting `rangeKey`, `hideDone`, `showAllPlan` (Phase 4). `rangeKey` still resets to `d0` on reload.
- Any test of the three effects themselves. Asserting on a React effect over an interval and a wall clock needs a render harness this repo does not have; the logic they call is pure and covered, and their wiring is covered by `drive-history.mjs`.
- A dedupe guard inside `archived`. Task 1's background says why: the ref is the root cause and the duplicate record is one of its three symptoms.

## Assumptions taken without approval

The human partner was unavailable for the gates this plan would normally pause at. Each of these is the smallest choice consistent with the spec and with what the repo already does; each is cheap to reverse.

1. **The driver is `drive-history.mjs`.** The spec calls it `drive-real-history.mjs`; the phase brief calls it `drive-history.mjs`. Taken the brief's name, since it is the one the caller will type.
2. **Five tasks, in the order above.** The spec's five parts map to tasks 1, 4, 4, 3 and 5; the record-shape and achievements work (spec Part 5) was pulled forward to Task 2 so that it lands while the mock is still driving the screen and nothing visible can move. Reversible: it could equally be the last task.
3. **`h.caffeine?.length` in `achievements`, where the spec writes `h.caffeine.length`.** One character. `isLateNight` short-circuits on a null cutoff and so would not throw on a caffeine-less hand-edited record, which makes a bare `.length` a *new* way to white-screen the profile sheet at a trust boundary the spec itself names as an open ceiling.
4. **No test in `mockNights.test.js`.** The spec says leave it untouched; the added `endShift: true` is covered indirectly by the "Home safe from the mock" case in `stats.test.js`, which is where the badge that depends on it lives.
5. **Task 5 ships no unit tests.** Everything it adds is JSX in a repo with no component harness. Stated in the task rather than worked around. Adding one would mean `jsdom` plus a render library — two dependencies and a `vitest.config.js` change, against this plan's own "no new dependencies" constraint — to cover four conditionals the driver already drives.
6. **Under `?seed` the demo line replaces the "Nothing here is a score" line rather than joining it.** One muted row instead of two stacked ones. Both lines are honesty copy, and on a screen of 45 invented nights "this is demo data" is the load-bearing half; the disclaimer returns the moment the flag comes off.
7. **`?seed` shows six nights in a seven-day window, not seven.** `MOCK_ROWS` starts at offset 1 and the seeded demo has nothing logged tonight, so the "Now" chip is honestly empty. Not worked around: a mock row at offset 0 would sit at the same offset as `foldNight`'s tonight, which is the duplicate-offset case the strip and `rangeStats` handle worst.
