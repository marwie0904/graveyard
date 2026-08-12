# Plan page on live persisted state (Phase 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tab that was asleep across the night boundary rolls when it comes back, instead of accepting taps onto last night's plan and filing them under last night — plus the two decisions that finish the phase: the view flags stay transient on purpose, and a past night says on screen where its plan went.

**Architecture:** One line of event registration and one line of cleanup inside the tick effect that already owns the roll (`App.jsx:2400-2402`); `tick` itself is untouched, so the id guard it already has is what keeps a resume that crosses nothing from folding anything. `Dashboard.jsx` grows a local `Note` component — the muted `Info` row it already writes out by hand three times — and the three hand-copied sites call it, which is what makes the fourth use (a past night, in the slot the plan would have occupied) nine lines instead of a fourth paste. `App.jsx`'s two view flags gain a comment and nothing else.

**Tech Stack:** Plain ES modules, React 18, Vitest 2, `localStorage`, Playwright (already in `node_modules`, driven by hand — not a test runner). No new dependencies.

## Global Constraints

- **No new dependencies.** Nothing added to `package.json`. Playwright is already installed and every existing driver is run with bare `node`.
- **No new stored field.** `gy.v1` holds exactly `{ night, profile, logs, reflection, theme, archive }` at the end of this phase, in that order. Part 2 is a decision *not* to write code; P4 asserts the key list.
- **Do not change `generateTimeline`.** It stays `(profile, logs, now)`. Nothing in this phase touches `planner.js`, `stats.js`, `storage.js` or `time.js`.
- **Do not change `tick`'s body, and do not roll inside `push()`.** The write stamp keeps reading `nightRef.current`. The whole fix is *when* `tick` runs, never *what it does*.
- **`visibilitychange` only, unguarded.** No `document.hidden` check, no `pageshow`, no `focus`, no shorter interval. Firing on hide as well as show is deliberate: it costs one tick that returns at the id comparison, and it rolls a page that is hidden after an unnoticed boundary on the way out rather than on the way back.
- **The cleanup must remove the listener.** The effect's dependency list is `[profile, logs, reflection, archive]`, so it re-registers on every log tap. A cleanup that only clears the interval leaks a closure holding a stale `logs` array per tap.
- **`Note` is local to `Dashboard.jsx`.** Nothing is added to `ui/index.jsx`, no new token, no new file. Its style object is copied byte-for-byte from the three rows it replaces, so the converted rows are pixel-identical.
- **No new unit tests.** Nothing pure changes this phase; see "Assumptions" 3. The existing suite is a regression gate, not a place to add coverage for an event listener.
- **The regression gate, restated in every task:** `npm test` is **96 passing** and `node drive-history.mjs` is **15/15 passed**. Both must be green at the end of every task.
- Spec: `docs/superpowers/specs/2026-08-13-plan-live-state-design.md`. Roadmap Phase 4: `docs/implementation-roadmap.md:249`. Phase 3 summary: `docs/phase-3-summary.md`.
- Unit test command: `npm test` (`vitest run`).
- End-to-end commands: `node drive-plan-state.mjs` (this phase) and `node drive-history.mjs` (Phase 3, regression). **The dev server is already running on `http://localhost:5174/`** — do not start another one; if it has died, `npm run dev -- --port 5174`.
- Line numbers below are from commit `f8d40bf` on branch `phase-4-plan-live-state`. Match on code, not on the number.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/App.jsx` | Modify (2 lines at one site, plus a 3-line comment at another) | The tick effect keeps owning the roll and now also hears the tab come back. The two view flags say why they are not persisted. |
| `src/screens/Dashboard.jsx` | Modify (+13 lines for `Note` and its comment, −18 across three converted sites, +6 at the plan slot) | Still the only file that knows what this screen's muted explanatory row looks like — now in one place instead of three, and one of its four uses is the answer to "where is this night's plan?". |
| `drive-plan-state.mjs` | Create (~245 lines) | The whole phase end to end, on a *suspended* clock against the running dev server. Grows one block per task. |
| `.gitignore` | Modify (1 line) | `drive*.mjs` is ignored with a `!drive-history.mjs` exception; the new driver needs the same exception or it is invisible to review. |

Three tasks, in this order because each leaves the tree green and the driver's checks then land in numeric order:

1. **The tick runs when the tab comes back.** The only code in the phase that does anything, and the only risky one. Alone, first, with P1–P3 and three mutation checks.
2. **The view flags are transient on purpose.** A comment, and the check that stops a future reviewer from "fixing" it. P4.
3. **The muted row becomes a component, and a past night says where the plan went.** P5, P6.

---

### Task 1: The tick runs when the tab comes back

**Files:**
- Modify: `src/App.jsx` — the tick effect's tail, lines 2400-2402.
- Create: `drive-plan-state.mjs` — the harness plus P1, P2, P3.
- Modify: `.gitignore` — one line, beside `!drive-history.mjs`.

**Interfaces:**
- Consumes: `archived(s) -> NightRecord[]` from `src/storage.js`, `nightOf(ph) -> { id, now }` and `forward(cur, next) -> string` from `src/time.js`, `calculateShiftPhases(profile)` from `src/planner.js`, `say(msg)` at `App.jsx:2447`. All five are already imported and already called by `tick`; this task calls none of them directly.
- Produces: nothing importable. The observable contract is that **a page which was hidden across a night boundary has folded that night before it accepts the first tap**, and that a page which was hidden across no boundary is byte-for-byte unchanged by coming back.

**Background the implementer needs:**

Phase 2 put the rollover on a 30-second `setInterval` (`App.jsx:2401`). `setInterval` does not accumulate missed fires, and `App.jsx` contains no `addEventListener` at all, so a page whose timers the browser stopped — a phone locked at 03:00 and unlocked at 15:20, a tab backgrounded all day — sits on last night's plan until the next interval fire *after* resume.

That is worse than a stale screen, and this is the part to hold in your head while you work: **the first tap on that stale plan is filed under the night that already ended.** The tap sets `logs`, `logs` is in the tick effect's dependency list, the effect re-runs, its immediate `tick()` finally notices the boundary, and `archived({ night: nightRef.current, ..., logs })` folds the whole array — the new tap included — under the old id. Driven against the app as it stands today, with the fixture below:

```
after tapping a movement reset on the stale plan:
  night=2026-08-13  logs=0  archive=["2026-08-12"]  moveDone=2  "0 of 20 done"
```

`moveDone: 2` is one seeded reset plus the one the user just tapped, both in yesterday's record, and tonight reads `0 of 20 done`. Every line of that is Phase 2 working exactly as designed. **Phase 2's rule is right; the window it assumed is not.** The write stamp reads `nightRef.current` on purpose so that a log tapped between the boundary and the tick is filed under last night — over thirty seconds those two nights are genuinely indistinguishable. Over twelve hours it is a user looking at a screen that says "tonight". The fix is not to change where the log goes; it is to stop the window from being unbounded.

**Three traps:**

1. **Do not "fix" it at the tap.** Rolling inside `push()` before appending the entry looks like the precise fix and is the wrong one: a second copy of the roll at a second site, ordered against React's batching of `setArchive`/`setLogs`, and it leaves the *screen* stale until something else notices. One listener on the effect that already owns the roll keeps the rule in one place.
2. **The cleanup has to remove the listener.** The dependency list is `[profile, logs, reflection, archive]`, so add/remove runs on every log tap. A missing `removeEventListener` leaks one closure per tap, each holding the `logs` array that was current when it was registered — and on the next resume the *oldest* listener fires first and folds its stale version of the night. P2's `vis` term is what catches this.
3. **A check that only asserts the roll cannot fail honestly.** A "fix" that rolls on every `visibilitychange` regardless of the id passes P1 and P2 and is badly wrong. P3 is the check that exists to fail it.

**What this does not close, so you do not go further.** An app that stays *visible* across the boundary still has up to thirty seconds of stale plan. That is Phase 2's interval, and it stays deliberate. And a real phone resumes its timers, so even without this change the interval catches up within thirty seconds of the unlock — what the two lines buy is *those* thirty seconds, with the screen already in front of a face and a finger already moving. `setFixedTime` in the driver models a tab that never resumes, which is how a check can stand still inside that window and read it.

- [ ] **Step 1: Un-ignore the new driver**

In `.gitignore`, change:

```
drive*.mjs
!drive-history.mjs
```

to:

```
drive*.mjs
!drive-history.mjs
!drive-plan-state.mjs
```

Do this first. `drive*.mjs` is ignored, so a driver written before this line exists is invisible to `git add` and to review, and there are already nineteen untracked `drive-*.mjs` files in this repo to prove how easy that is to miss.

- [ ] **Step 2: Write the failing driver**

Create `drive-plan-state.mjs` at the repo root. This is the phase's whole driver; Tasks 2 and 3 append blocks to it and change nothing above.

```js
/* Phase 4 checks, driven through a faked clock against the running dev server.
   Same pattern as drive-history.mjs: page.clock.install before goto,
   addInitScript seeding gy.v1, a record() tally, page.on("pageerror") failing
   the check it happened in, non-zero exit on failure. The dev server is
   already up on :5174.

   The one new idiom is page.clock.setFixedTime, which moves Date.now() WITHOUT
   running a single installed timer. That is a suspended tab exactly: the 30s
   interval never fires, so the page sits on last night's plan until something
   else wakes it. fastForward — every other driver's tool — reproduces an AWAKE
   tab, and a check built on it cannot see this bug at all.
   Run: node drive-plan-state.mjs [url] */
import { chromium } from "playwright";

const URL = process.argv[2] || "http://localhost:5174/";

/* shift 22:00-06:00, sleep from 07:30 for 7.5h -> sleepEnd 15:00, so the night
   boundary is 15:00 local. The fixture drive-rollover.mjs and drive-history.mjs
   already use: 14:59 on Aug 13 is night "2026-08-12", 15:01 is "2026-08-13".
   Verified against the running app: this profile generates a 20-item plan whose
   movement resets are titled "Micro-care reset", which is where every
   "1 of 20 done" below comes from. */
const PROFILE = {
  shiftStart: "22:00", shiftEnd: "06:00", plannedSleep: "07:30", sleepGoalHours: 7.5,
  nightInStretch: 1, caffeine: "moderate", nap: "both", caffeineSensitivity: "normal",
  movement: "mixed", lightEnv: "bright", commute: "drive", sleepiestTime: "deep",
  chronotype: "neither", overrides: {},
};

/* Two logs: one caffeine, and one movement reset already ticked. The ticked one
   is what makes the stale plan visibly stale ("1 of 20 done") and what makes the
   folded record read moveDone: 1 — so a tap misfiled into last night shows up as
   moveDone: 2, which is the assertion P2 turns on. `move-1` is a real plan item
   id: itemStatus matches on value.id (planner.js:192), so an invented id would
   tick nothing on screen. */
const LOGS = [
  { id: "caffeine-1", t: 1350, type: "caffeine", value: 1 },
  { id: "item-1", t: 1370, type: "item", value: { id: "move-1", status: "done", category: "movement" } },
];

const results = [];
const record = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `\n        ${detail}` : ""}`);
};

const seed = (blob) => `
  try { localStorage.setItem("gy.v1", ${JSON.stringify(JSON.stringify(blob))}); } catch {}
`;

/* Counts LIVE visibilitychange listeners. React runs an effect's cleanup before
   re-running the effect, so a correct implementation holds this at 1 through any
   number of log taps. A cleanup that only clears the interval makes it climb by
   one per tap, and each leaked closure holds the logs array that was current
   when it was registered — on the next resume the oldest one fires first and
   folds its own stale version of the night. Installed before the app's first
   line so it sees the first registration. */
const VIS_SPY = `
  window.__vis = 0;
  const add = document.addEventListener.bind(document);
  const rm = document.removeEventListener.bind(document);
  document.addEventListener = (t, f, o) => { if (t === "visibilitychange") window.__vis++; return add(t, f, o); };
  document.removeEventListener = (t, f, o) => { if (t === "visibilitychange") window.__vis--; return rm(t, f, o); };
`;

const read = (page) => page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("gy.v1") || "{}");
  const t = document.body.textContent;
  return {
    night: s.night ?? null,
    logs: (s.logs || []).length,
    ids: (s.archive || []).map((r) => r.id),
    moveDone: (s.archive || []).map((r) => r.moveDone),
    keys: Object.keys(s).join(","),
    // the Plan tab's headline, read as the user reads it: "1 of 20 done"
    done: (t.match(/\d+ of \d+ done/) || [null])[0],
    /* The rollover toast. With the clock fixed its 2.6s hide timer never fires,
       so it is still on screen when a check looks for it — and still there when
       the next click lands, which is harmless: it sits above the tab bar and
       intercepts nothing. Verified before this driver was written. */
    toast: t.includes("Last night is saved"),
    vis: window.__vis,
    text: t,
  };
});

/* A page with the clock frozen at `time`, localStorage pre-seeded and the
   listener spy armed — all before the app's first line runs. */
async function open(browser, { time, blob }) {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 } });
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
  await page.addInitScript(VIS_SPY);
  if (blob !== undefined) await page.addInitScript(seed(blob));
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(400);
  return { ctx, page, errors };
}

/* The Plan tab, by the label under its icon. */
const planTab = async (page) => {
  await page.getByRole("button", { name: "Plan" }).click();
  await page.waitForTimeout(300);
};

/* A tab coming back. document.hidden stays false and that is fine — the app
   deliberately does not read it, which is what makes this one line rather than
   a CDP dance. */
const resume = async (page) => {
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.waitForTimeout(500);
};

/* Tick one movement reset through the real UI. With hideDone on and more than
   one reset in the plan the resets sit behind a RecurringCard, so "Show all"
   comes first. The title span is two divs above the action row, hence the two
   `..` hops — the same shape as drive-history.mjs H2's wheel locator. Matching
   the title ROW's text instead would fail: it also carries the "Circadian low"
   badge. */
const tapReset = async (page) => {
  if (await page.getByRole("button", { name: /^Show all/ }).count())
    await page.getByRole("button", { name: /^Show all/ }).click();
  await page.waitForTimeout(300);
  const row = page.getByText("Micro-care reset", { exact: true }).first().locator("..").locator("..");
  await row.getByRole("button", { name: "Done", exact: true }).click();
  await page.waitForTimeout(500);
};

const STALE = { night: "2026-08-12", profile: PROFILE, logs: LOGS, reflection: {}, theme: null, archive: [] };

const browser = await chromium.launch({ channel: "chrome" });

/* ---- P1: a tab that slept through the boundary rolls when it comes back --- */
{
  const { ctx, page, errors } = await open(browser, {
    time: new Date("2026-08-13T14:59:00"), blob: STALE,
  });
  await planTab(page);
  // 14:59 -> 15:20 with the timers still stopped: this IS the suspended tab
  await page.clock.setFixedTime(new Date("2026-08-13T15:20:00"));
  await page.waitForTimeout(400);
  const stale = await read(page);
  await resume(page);
  const after = await read(page);
  record("P1 a suspended tab that crossed the boundary rolls on the way back",
    // the precondition: twenty minutes past the boundary and nothing has moved
    stale.night === "2026-08-12" && stale.done === "1 of 20 done" && stale.logs === 2 &&
    after.night === "2026-08-13" && after.ids.join(",") === "2026-08-12" &&
    after.logs === 0 && after.done === "0 of 20 done" && after.toast && !errors.length,
    `stale=${stale.night}/${stale.done}/${stale.logs} after=${after.night}/${after.done} ids=${JSON.stringify(after.ids)} logs=${after.logs} toast=${after.toast} err=${errors.join(" || ") || "none"}`);
  await ctx.close();
}

/* ---- P2: the first tap after the resume lands in TONIGHT ------------------ */
{
  /* The misfiling from the report, asserted from the fixed side. Before Part 1
     this reads moveDone=2 and "0 of 20 done": the tap itself triggers the roll
     and is folded into the night that already ended. */
  const { ctx, page, errors } = await open(browser, {
    time: new Date("2026-08-13T14:59:00"), blob: STALE,
  });
  await planTab(page);
  const armed = await read(page);
  await page.clock.setFixedTime(new Date("2026-08-13T15:20:00"));
  await page.waitForTimeout(400);
  await resume(page);
  await tapReset(page);
  const s = await read(page);
  record("P2 a reset tapped after the resume lands in tonight, not in the folded night",
    s.night === "2026-08-13" && s.ids.join(",") === "2026-08-12" &&
    s.moveDone.join(",") === "1" &&          // 2 means the tap was folded backwards
    s.logs === 1 && s.done === "1 of 20 done" &&
    /* one live listener, before and after two effect re-runs: the roll and the
       tap. A cleanup that forgets removeEventListener makes this climb. */
    s.vis === armed.vis && s.vis >= 1 && !errors.length,
    `night=${s.night} ids=${JSON.stringify(s.ids)} moveDone=${JSON.stringify(s.moveDone)} logs=${s.logs} done=${s.done} vis=${armed.vis}->${s.vis} err=${errors.join(" || ") || "none"}`);
  await ctx.close();
}

/* ---- P3: a resume that crosses no boundary changes nothing ---------------- */
{
  /* Without this, a listener that rolls unconditionally passes P1 and P2 and is
     badly wrong: every unlock would archive the night in progress and clear the
     plan under the user. 14:00 -> 14:30 is entirely inside night 2026-08-12. */
  const { ctx, page, errors } = await open(browser, {
    time: new Date("2026-08-13T14:00:00"), blob: STALE,
  });
  await planTab(page);
  await page.clock.setFixedTime(new Date("2026-08-13T14:30:00"));
  await page.waitForTimeout(300);
  await resume(page);
  const s = await read(page);
  record("P3 a resume that crosses no boundary folds nothing and says nothing",
    s.night === "2026-08-12" && s.ids.length === 0 && s.logs === 2 &&
    s.done === "1 of 20 done" && !s.toast && !errors.length,
    `night=${s.night} ids=${JSON.stringify(s.ids)} logs=${s.logs} done=${s.done} toast=${s.toast} err=${errors.join(" || ") || "none"}`);
  await ctx.close();
}

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log("failed: " + failed.map((r) => r.name).join(", ")); process.exit(1); }
```

- [ ] **Step 3: Run the driver to verify it fails**

Run: `node drive-plan-state.mjs`

Expected: `1/3 passed`, exit 1. **P1 and P2 FAIL, P3 PASSES.**

The failure detail lines should read, near enough exactly:

- P1 — `after=2026-08-12/1 of 20 done ids=[] logs=2 toast=false`: the dispatched event reaches nothing, so twenty minutes past the boundary the page is still last night's.
- P2 — `moveDone=[2] logs=0 done=0 of 20 done`: the tap triggered the roll and was folded into `2026-08-12` on its way past.

If P1 fails on `stale=2026-08-12/null/2` instead, the Plan tab did not open — check that the tab bar button's label is still "Plan". If it fails on `stale=2026-08-12/0 of 20 done/2`, the seeded `move-1` no longer names a plan item.

- [ ] **Step 4: Add the listener**

`src/App.jsx:2400-2402`. Change:

```js
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [profile, logs, reflection, archive]);
```

to:

```js
    tick();
    const id = setInterval(tick, 30000);
    /* A hidden page is the one whose timers the browser stops, so being shown
       again is the only resume the interval cannot answer by itself — and it
       fires before a finger can reach an item. Unguarded on purpose: firing on
       hide too costs one tick that returns at the id comparison above. The
       removal is load-bearing, not tidiness — this effect re-registers on every
       log tap, and a listener left behind folds its own stale logs. */
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [profile, logs, reflection, archive]);
```

Nothing else in the file changes. `tick` is not touched, and neither is the dependency list.

Six comment lines for two code lines is already the ceiling — the long form of the argument (why not `pageshow`, why not `focus`, what the bfcache escalation is) lives in the spec's Part 1, in this task's Background, and in "Known ceilings". Do not expand it back out into the source.

- [ ] **Step 5: Run the driver to verify it passes**

Run: `node drive-plan-state.mjs`

Expected: `3/3 passed`, exit 0.

If P2 fails on `moveDone=[2]` while P1 passes, the listener is registered but the cleanup is wrong in a way that let a stale closure win — re-read Step 4's `return`. If P2 fails on `vis=1->3`, the cleanup clears the interval and not the listener.

- [ ] **Step 6: Mutation check — three breaks, three different reds**

Do all three. Each is one edit, one driver run, one revert. This is the step that proves the checks can fail.

1. **Comment out the `document.addEventListener` line.** Run `node drive-plan-state.mjs`. Expected: P1 and P2 FAIL, P3 passes, `1/3`. Restore.
2. **Disable the id guard** — `App.jsx:2389`, change `if (night === nightRef.current) return;` to `if (false && night === nightRef.current) return;`. Run. Expected: **P3 FAILS** (it folds a night that did not end and toasts about it). Restore.
3. **Drop the removal** — change the cleanup back to `return () => clearInterval(id);`. Run. Expected: **P2 FAILS** on its `vis` term (`vis=1->3`). Restore.

If mutation 2 leaves P3 green, P3 is asserting the wrong thing and the suite cannot catch a listener that rolls unconditionally — fix the check before going on.

- [ ] **Step 7: Run the regression gate**

Run: `npm test`

Expected: **96 passed**. Nothing in the suite imports `App.jsx`, so the suite is structurally blind to this task; it is here to prove nothing else moved.

Run: `node drive-history.mjs`

Expected: **15/15 passed**. Phase 3's checks all drive the same tick through `fastForward`, where the new listener never fires; a red here means the effect's shape changed rather than gained a line.

- [ ] **Step 8: Commit**

```bash
git add src/App.jsx drive-plan-state.mjs .gitignore
git commit -m "fix: a tab that slept through the boundary rolls when it comes back"
```

---

### Task 2: The two view flags are transient on purpose

**Files:**
- Modify: `src/App.jsx` — a comment above lines 2341-2342.
- Modify: `drive-plan-state.mjs` — one appended check.

**Interfaces:**
- Consumes: nothing new. `showAllPlan` and `hideDone` are already `useState` at `App.jsx:2341-2342` and are already passed to `PlanTab` at the render site.
- Produces: nothing importable, and deliberately no new field in `gy.v1`. The observable contract is that `Object.keys` of the stored blob stays `night,profile,logs,reflection,theme,archive`.

**Background the implementer needs:**

The roadmap asks for the two flags' absence from storage to be confirmed as a decision rather than an omission. It is confirmed, and **the whole diff is a comment**, because "nobody has decided this" is exactly what makes a reviewer persist it next year.

The rule the blob already follows: **it stores what you told the app, not where you were standing in it.** The profile, the logs, the reflection and the theme are things the user typed, tapped or chose about the app itself — `theme` is persisted (`App.jsx:2330`) precisely because it is a preference and not a position. `hideDone`, `showAllPlan`, `rangeKey` (`:2346`), `tab` (`:2321`), `logDraft`, `editingLog` and `quickResult` are all positions in tonight's data. None of them survive a reload today and none should start.

Three reasons, in the order that actually decides it:

- **The two pills are self-labelling.** They read "Remaining only" / "Showing everything" and "Resets grouped" / "Resets expanded" (`App.jsx:1407`, `:1411`). A control that states its own mode on its face never leaves a user wondering why the list looks like that, and state that is legible on screen needs neither persisting nor resetting.
- **Persisting buys one tap and costs a schema field forever.** Storage is a trust boundary here (`storage.js:3`), so a persisted flag is a field `boot` has to validate — a hand-edited `hideDone: "no"` is truthy and would silently filter a plan.
- **The default is the right opening state and the persisted value is not.** `hideDone: true` on a fresh plan hides nothing, because every item is open. `showAllPlan: true` carried in from last night opens tomorrow's plan as eight separate reset rows the design deliberately groups.

**The rollover does not reset them either**, and that is the same decision seen from the other side. The tick clears `logs` and `reflection` because those are the night; the flags belong to the person looking, and re-collapsing a list under someone who just expanded it is its own small surprise. The worry the roadmap names — `hideDone` staying on and hiding a fresh plan — is not reachable: `hideDone` filters on `s.itemStatus(i.id) === "open"` (`App.jsx:1375`), the roll empties the logs, and every item is therefore open.

**Do not add `hideDone` to the write effect "while you are in there".** It is one word in an object literal and it silently widens the blob's schema, which the next migration has to carry.

**This task's check passes before the change and after it**, because the change is a comment. That is honest and it is the reason Step 4 exists: the mutation is what proves P4 can fail at all.

- [ ] **Step 1: Add the check**

In `drive-plan-state.mjs`, insert this block immediately **above** `await browser.close();`:

```js
/* ---- P4: the view flags are transient, and stay that way ------------------ */
{
  // STALE is only "stale" at 14:59; at 02:00 it is an ordinary mid-night blob
  const { ctx, page, errors } = await open(browser, {
    time: new Date("2026-08-13T02:00:00"), blob: STALE,
  });
  await planTab(page);
  await page.getByRole("button", { name: "Remaining only" }).click();
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: "Resets grouped" }).click();
  await page.waitForTimeout(300);
  const toggled = await read(page);
  /* Read the KEY LIST before the reload, not after: this context's init script
     re-seeds gy.v1 on every navigation, so a flag written into the blob would be
     wiped by the seed and a reload-only check would pass with the bug in place.
     The two halves are complementary — the key list catches a flag written into
     gy.v1, the reload catches one written anywhere else. */
  const stored = toggled.keys;
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(400);
  await planTab(page);
  const after = await read(page);
  record("P4 both view flags are transient: nothing stored, defaults on reload",
    toggled.text.includes("Showing everything") && toggled.text.includes("Resets expanded") &&
    stored === "night,profile,logs,reflection,theme,archive" &&
    after.text.includes("Remaining only") && after.text.includes("Resets grouped") &&
    !after.text.includes("Showing everything") && !after.text.includes("Resets expanded") &&
    !errors.length,
    `toggledTo="${["Showing everything", "Resets expanded"].filter((p) => toggled.text.includes(p)).join("+")}" keys=${stored} back="${["Remaining only", "Resets grouped"].filter((p) => after.text.includes(p)).join("+")}" err=${errors.join(" || ") || "none"}`);
  await ctx.close();
}
```

- [ ] **Step 2: Run the driver**

Run: `node drive-plan-state.mjs`

Expected: `4/4 passed`. P4 passes *before* the comment exists — it is asserting today's behaviour on purpose, so that the decision cannot be reversed by accident later.

If P4 fails on `toggledTo=""`, the pill labels have moved; read them off `App.jsx:1407` and `:1411`. If it fails on the key list, something in an earlier phase is already writing a field this plan does not know about — stop and report it rather than editing the expected string.

- [ ] **Step 3: Write the decision down**

`src/App.jsx:2341-2342`. Change:

```js
  const [showAllPlan, setShowAllPlan] = useState(false);
  const [hideDone, setHideDone] = useState(true);
```

to:

```js
  /* Where you are standing in tonight's plan, not something you told the app:
     not persisted, and not reset at the roll. The pills name their own mode, so
     neither one needs remembering. Decided, not overlooked. */
  const [showAllPlan, setShowAllPlan] = useState(false);
  const [hideDone, setHideDone] = useState(true);
```

Three lines, verbatim from the spec (`Part 2`) — the long form of the argument
lives there and in this task's Background, not in the source. Nothing else
changes. In particular the `save({ ... })` call at `App.jsx:2377` is untouched.

- [ ] **Step 4: Mutation check — persist the flag and watch P4 go red**

Temporarily make the omission a real omission:

1. `App.jsx:2342`, change `useState(true)` to `useState(boot.hideDone ?? true)`.
2. `App.jsx:2377`, add `hideDone` to the saved object: `save({ night: nightRef.current, profile, logs, reflection, theme: themeOverride, archive, hideDone });`.

Run: `node drive-plan-state.mjs`

Expected: **P4 FAILS** on `keys=night,profile,logs,reflection,theme,archive,hideDone` — and, because the init script re-seeds, *only* on that term, which is exactly why Step 1 reads the keys before the reload.

Revert both edits and re-run: `4/4 passed`.

- [ ] **Step 5: Run the regression gate**

Run: `npm test` → expected **96 passed**.
Run: `node drive-history.mjs` → expected **15/15 passed**.

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx drive-plan-state.mjs
git commit -m "docs: the two view flags are transient because they are a position, not a preference"
```

---

### Task 3: The muted row becomes a component, and a past night says where the plan went

**Files:**
- Modify: `src/screens/Dashboard.jsx` — one new component after `Lead` (line 122), the plan slot at 243-245, and three converted rows at 257-263, 379-387 and 424-435.
- Modify: `drive-plan-state.mjs` — one appended block holding two checks. Tasks 1 and 2 have landed, so the file already holds P1–P4 and the totals below run to six.

**Interfaces:**
- Consumes: `Info` from `../icons.jsx`, `FONT_TEXT` from `../tokens.js`, `plural` (line 25) and `MIN_TREND` (imported line 7) — all already in scope in `Dashboard.jsx`. `T.faint` from the theme object the file already receives.
- Produces:
  - `Note({ T, children })` — module-private to `Dashboard.jsx`. Renders the muted `Info` row: `Info` at 13px, faint 12.5px text, `margin: "14px 4px 8px"`. Not exported, not added to `ui/index.jsx`.
  - No prop changes. `Dashboard`'s signature is untouched.

**Background the implementer needs:**

The archive holds folded NightRecords, not plan items, and this phase keeps it that way. Measured on this repo's own fixture profile: a folded record is 296 bytes, the `plan.items` for that night are 6,914 — **23×** — and the whole blob is re-serialised on every single log tap (`App.jsx:2377`), so archiving item lists would put a multi-megabyte `JSON.stringify` behind every tap on the Plan page. A year of records is 106KB; a year of item lists is 2.4MB against a ~5MB budget.

So the answer to "can I see Tuesday's plan?" is no. **Today the app's answer is silence:** `MiniPlan` is gated on `off === 0` (`Dashboard.jsx:243`) with a comment explaining the gate to developers, so a user tapping the "2d" chip gets the sleep hero, the trio, "One night on its own is a snapshot, not a pattern.", "In figures", and no mention anywhere that a plan ever existed. "We didn't build it" is not a user-facing answer and neither is silence. One sentence goes in the slot the plan would have occupied, because the question is asked by the absence.

**Why the component, and why it is not gold-plating.** The muted row is written out by hand three times in this one file (`:257`, `:379`, `:424`) — the same eight style properties and the same `<Info size={13} style={{ flexShrink: 0, marginTop: 2 }} />` each time. The new line is its fourth use. Extracting it makes the new use five lines instead of a fourth nine-line paste, deletes more than it adds, and is the only version where the new row cannot drift away from its siblings. It goes beside `Figure` and `Lead`, where every other small piece of this screen already lives. **Copy the style object byte-for-byte** — the rows it replaces are load-bearing pixels on a finished screen, and two of the three are already asserted by Phase 3's driver (`drive-history.mjs` E2/E4 read the countdown row, R7 reads the demo-data row), which is why the extraction is checked before it is made.

**It does not appear on the empty past night.** That branch returns early at `Dashboard.jsx:196` with "No record for this night." / "Nothing was logged that night, so there is nothing to read back.", which is a complete answer; a second explanation on a screen that has nothing on it would be the app explaining itself twice. P6 is that assertion.

**The wording is fixed:** "Only tonight has a plan. A finished night is kept as what you logged, not as the plan it came from." It states the design rather than apologising for a gap, which is how the rest of this app talks about what it does not keep.

- [ ] **Step 1: Add the two failing checks**

In `drive-plan-state.mjs`, add these two constants immediately below the `LOGS` constant near the top of the file:

```js
/* One full NightRecord as `archived` writes one — every field the Dashboard
   reads, and deliberately no dayOffset, which App.jsx computes from the id.
   Same shape as drive-history.mjs's REC, flat rather than a factory: this file
   has exactly one caller and never varies a field. */
const PAST = {
  id: "2026-08-10", sleepStart: 450, wake: 900, sleepHours: 7.5, sleepEstimated: false,
  cutoff: 1290, caffeine: [1140, 1230], moveDone: 2, moveTotal: 4,
  restKind: "nap", restMin: 20, groggy: false, water: 3, screenStrain: 0,
  sleepyWindow: "deep", heavyMeal: false, lateLightDone: true, endShift: true,
};

const LINE = "Only tonight has a plan.";
```

Then insert this block immediately **above** `await browser.close();`:

```js
/* ---- P5/P6: a past night says where its plan went ------------------------- */
{
  /* The anchor is 2026-08-12 (PROFILE at 02:00 on Aug 13), so this record
     answers the "2d" chip and the "4d" chip has nothing. Tonight has logs, so
     the "Now" chip has a record too and its MiniPlan renders — which is the
     half of P5 that proves the ternary did not replace the plan everywhere. */
  const { ctx, page, errors } = await open(browser, {
    time: new Date("2026-08-13T02:00:00"), blob: { ...STALE, archive: [PAST] },
  });
  await page.getByRole("button", { name: "2d", exact: true }).click();
  await page.waitForTimeout(300);
  const past = (await read(page)).text;
  await page.getByRole("button", { name: "Now", exact: true }).click();
  await page.waitForTimeout(300);
  const tonight = (await read(page)).text;
  record("P5 a finished night explains where its plan went, and tonight still has one",
    past.includes(LINE) && past.includes("not as the plan it came from") &&
    !past.includes("See all") && past.includes("In figures") &&
    tonight.includes("See all") && !tonight.includes(LINE) && !errors.length,
    `past: line=${past.includes(LINE)} seeAll=${past.includes("See all")} figures=${past.includes("In figures")} | now: seeAll=${tonight.includes("See all")} line=${tonight.includes(LINE)} err=${errors.join(" || ") || "none"}`);

  await page.getByRole("button", { name: "4d", exact: true }).click();
  await page.waitForTimeout(300);
  const empty = (await read(page)).text;
  record("P6 a past night with no record explains itself once, not twice",
    empty.includes("No record for this night.") && !empty.includes(LINE) &&
    !empty.includes("In figures") && !errors.length,
    `noRecord=${empty.includes("No record for this night.")} line=${empty.includes(LINE)} err=${errors.join(" || ") || "none"}`);
  await ctx.close();
}
```

- [ ] **Step 2: Run the driver to verify P5 fails**

Run: `node drive-plan-state.mjs`

Expected: `5/6 passed`, exit 1. **P5 FAILS** with `past: line=false seeAll=false figures=true`. **P6 PASSES** — it asserts an absence, and the absence is currently everywhere; it earns its keep the moment the line exists, and its mutation is in Step 5.

- [ ] **Step 3: Add the component**

In `src/screens/Dashboard.jsx`, immediately after the `Lead` function (which closes at line 122) and before the `MiniPlan` comment block, insert:

```jsx
/* The muted row this screen explains itself with, written out by hand three
   times before the fourth use asked for it. */
function Note({ T, children }) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 7, margin: "14px 4px 8px",
      fontFamily: FONT_TEXT, fontSize: 12.5, color: T.faint, lineHeight: 1.4,
    }}>
      <Info size={13} style={{ flexShrink: 0, marginTop: 2 }} />
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Convert the three hand-copied rows and fill the plan slot**

Four edits in the same file. Do them top to bottom so the line numbers below stay usable.

**4a — the plan slot, lines 242-245.** Change:

```jsx
        {/* the plan belongs to tonight, so it only shows on tonight */}
        {off === 0 && (
          <MiniPlan T={T} plan={plan} status={status} now={now} onOpenPlan={onOpenPlan} />
        )}
```

to:

```jsx
        {/* the plan belongs to tonight, so it only shows on tonight — and the
            slot it would have filled is where a past night gets told why */}
        {off === 0 ? (
          <MiniPlan T={T} plan={plan} status={status} now={now} onOpenPlan={onOpenPlan} />
        ) : (
          <Note T={T}>
            Only tonight has a plan. A finished night is kept as what you logged, not as
            the plan it came from.
          </Note>
        )}
```

**4b — the single-night closing row, lines 257-263.** Change:

```jsx
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 7, margin: "14px 4px 8px",
          fontFamily: FONT_TEXT, fontSize: 12.5, color: T.faint, lineHeight: 1.4,
        }}>
          <Info size={13} style={{ flexShrink: 0, marginTop: 2 }} />
          Charts need more than one night. Pick a window from Trends to see them.
        </div>
```

to:

```jsx
        <Note T={T}>Charts need more than one night. Pick a window from Trends to see them.</Note>
```

**4c — the countdown row, lines 379-387.** Change:

```jsx
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

to:

```jsx
      {st.n < MIN_TREND && (
        <Note T={T}>
          {plural(MIN_TREND - st.n, "more night", "more nights")} and these charts start reading as trends.
        </Note>
      )}
```

**Keep `{plural(...)}` and the sentence on one physical line, exactly as written above.** JSX drops the leading and trailing whitespace lines but keeps the space that sits *inside* a line, so this renders "4 more nights and these charts start reading as trends." — the exact string `drive-history.mjs` E2 asserts. Wrap the sentence onto its own line and JSX trims that line's leading whitespace instead, giving "4 more nightsand these…". Do not loosen E2 to absorb that: E2 is Phase 3's evidence, the exact string is the point, and Step 7 catches the mistake in seconds.

**4d — the range view's closing row, lines 424-435.** Change:

```jsx
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

to:

```jsx
      {/* Not decoration: this screen's rule is that no figure is ever
          fabricated, and 45 invented nights presented as history is the largest
          possible violation of it. */}
      <Note T={T}>
        {seeded
          ? "Demo data — 45 sample nights. Reload without ?seed for your own."
          : "Nothing here is a score, and nothing here is graded."}
      </Note>
```

`Info` and `FONT_TEXT` are still imported and still used — by `Note` now, and by nothing else in the file for `Info`. Leave both imports alone.

- [ ] **Step 5: Run the driver to verify it passes**

Run: `node drive-plan-state.mjs`

Expected: `6/6 passed`, exit 0.

If P5 fails on `seeAll=true` for the past night, the ternary was written the wrong way round. If P6 fails on `line=true`, the `Note` was added below the empty-night early return instead of inside the `night` branch — the early return at line 196 must still be the whole answer for a night with no record.

- [ ] **Step 6: Mutation check — two breaks, two reds**

1. **Empty the component** — make `Note` return `null` instead of the row. Run `node drive-plan-state.mjs` (expected: **P5 FAILS**) and `node drive-history.mjs` (expected: **E2 and R7 FAIL** — the countdown row and the demo-data row are two of the three converted sites, which is what makes the extraction checked rather than assumed). Restore.
2. **Break the ternary** — replace the `: (...)` branch with `: null`. Run `node drive-plan-state.mjs`. Expected: **P5 FAILS** on `line=false`, P6 still passes. Restore.

- [ ] **Step 7: Run the regression gate**

Run: `npm test`

Expected: **96 passed**. `share.test.js` imports this file for its `share` helper and is the only thing in the suite that would catch a syntax error here.

Run: `node drive-history.mjs`

Expected: **15/15 passed**, with E1, E2, E3, E4 and R7 green — those are the checks that read the converted rows.

- [ ] **Step 8: Look at the four rows in the browser**

The driver asserts text; this step is the one that catches a row that has drifted by two pixels. At `http://localhost:5174/?seed`:

1. The range view's closing row ("Demo data — 45 sample nights.") and, on a window with fewer than five nights, the countdown row — same indent, same faint grey, same gap after the `i` mark as before.
2. Reload without `?seed`, tap a past chip that has a record: "Only tonight has a plan. A finished night is kept as what you logged, not as the plan it came from." sits between "One night on its own is a snapshot, not a pattern." and "In figures", in the space where tonight shows "Coming up".
3. Tap a past chip with no record: one screen, one explanation, no new row.

- [ ] **Step 9: Commit**

```bash
git add src/screens/Dashboard.jsx drive-plan-state.mjs
git commit -m "feat: a finished night says it is kept as what you logged, not the plan it came from"
```

---

## Done when

- `node drive-plan-state.mjs` prints `6/6 passed` and exits 0.
- `npm test` still passes with **96** tests — no more and no fewer.
- `node drive-history.mjs` still prints `15/15 passed`.
- A tab suspended across the boundary folds the finished night the moment it comes back, before the first tap: `archive` gains `2026-08-12`, `logs` is empty, the plan reads `0 of 20 done`, and the toast fires once.
- A movement reset tapped after that resume is in **tonight's** logs, and the archived record's `moveDone` is unchanged.
- A resume that crosses no boundary changes nothing at all: no fold, no cleared logs, no toast.
- `gy.v1`'s keys are still `night,profile,logs,reflection,theme,archive` after both view pills have been toggled, and both pills read their defaults after a reload.
- A past night with a record says "Only tonight has a plan…" where tonight shows "Coming up"; a past night with no record says "No record for this night." and nothing else.
- `drive-plan-state.mjs` is tracked by git.

## Known ceilings

Record these; do not close them in this phase.

- **A visible tab still has up to thirty seconds of stale plan.** Phase 2's interval, unchanged and still deliberate. A tap inside that window is filed under last night by design, and the tick corrects the screen.
- **The toast can be spent on a hidden page.** If the boundary passes and the tab is hidden before the interval fires, the roll happens on the hide event and the 2.6-second toast expires unseen. The plan is correct on return; the explanation for why the ticks vanished is not. Making it durable means the toast becomes state, which is a bigger change than the event it explains.
- **Safari's bfcache restore may not fire `visibilitychange`.** `pageshow` is the named escalation — one line next to this one, the first time a real device comes back stale. Not written now.
- **The archive is still folded against tonight's profile.** Phase 2's ceiling. The logs-plus-profile-snapshot replay that would fix it is six times a record rather than twenty-three, and it is Phase 5's to reconsider if Phase 5 takes a snapshot for its own reasons.
- **A hand-edited `gy.v1` is still unvalidated.** Unchanged. This phase adds no stored field, which is the only thing it can honestly claim here.
- **A past night is a summary, permanently as far as any shipped phase is concerned.** The Plan page is tonight's and has no other mode. The screen now says so; it still cannot show you what you were asked to do on Tuesday.

## Explicitly not in this plan

- **Anything about `realNow` or the plan-axis clamp.** The roadmap's first struck-through item holds — verified in the spec against the real functions, table and all. There is no task for it because there is nothing to do.
- Archiving plan items in any form — full lists, trimmed `{id, at, category, title, status}` lists, or logs-plus-profile replay. 23×, 6.3× and 6× a record respectively, behind every log tap.
- A past-night Plan tab, or making the Plan tab addressable by night. Both follow only from a decision this phase declines.
- A `pageshow` listener, a `focus` listener, a `document.hidden` guard, or a shorter tick.
- Persisting `hideDone`, `showAllPlan`, `rangeKey` or `tab`, and resetting any of them at the roll. `rangeKey` self-corrects across a rollover — the chips are relative offsets, so after a roll "Now" is the new empty night and "1d" is the night that just ended, which is what those labels mean. That closes Phase 3's assumption 8.
- A driver check for the backward shift-time edit under the new trigger. `visibilitychange` calls the same `tick` the interval calls and reaches `forward` by the identical path P3 already drives; `forward` has six unit tests and `drive-history.mjs` H2 drives the edit through the real sheet.
- Any unit test of the effect itself. Asserting on a React effect over an interval and a wall clock needs a render harness this repo does not have — the same call Phases 2 and 3 both made.
- A shared harness for the drivers. The new file copies `record`, `seed` and `open` the way all twenty existing `drive-*.mjs` files do; extracting one would edit twenty finished phases' evidence to save a hundred lines in this one.
- An import path for the export, schema validation, retention limits, a `storage` event listener. All still standing, all still somebody else's phase.
- Deleting the nine unrendered `readPatterns` lines. Still real dead weight, still unrelated.

## Assumptions taken without approval

The human partner was unavailable for the gates this plan would normally pause at. Each is the smallest choice consistent with the spec and with what the repo already does; each is cheap to reverse.

1. **Three tasks, in this order.** The spec's three parts map one-to-one, the fix is alone and first because it is the only risky one, and Parts 2 and 3 follow in the order that makes the driver's checks read P1…P6 top to bottom. Task 2 could equally be last.
2. **The driver is `drive-plan-state.mjs`, a new file**, per the phase brief and spec assumption 7 — not checks bolted onto `drive-history.mjs`, which is Phase 3's evidence and should stay readable as such. `.gitignore` gains the matching exception in Task 1 rather than in a tidy-up commit, because a driver written before that line is invisible to `git add`.
3. **No unit tests are added.** Checked rather than assumed: the phase touches `App.jsx`'s effect (event registration), two `useState` calls (a comment), and JSX in `Dashboard.jsx`. The pure logic the new trigger reaches — `forward`, `archived`, `foldNight` — already has 96 tests behind it across `time.test.js`, `storage.test.js` and `stats.test.js`. `Dashboard.jsx`'s module-private `num` and `plural` are untested and stay that way: this phase does not touch either, and `plural`'s only new caller passes it the same arguments it already had.
4. **Every fixture fact in the driver was verified against the running app before this plan was written**, not inferred: the 20-item plan and its `1 of 20 done` headline, the `Micro-care reset` title and the two-`..` locator that finds its "Done" button, that `document.dispatchEvent(new Event("visibilitychange"))` reaches a `document` listener, that toggling both pills leaves `gy.v1`'s key list untouched, that a visible toast intercepts no click, and the pre-fix failure shape (`moveDone: 2`, `0 of 20 done`). If any of those strings drift, the check's detail line names which.
5. **P2 carries a live-listener count** (`window.__vis`, wrapped in an init script) as two extra terms rather than as a seventh check. The spec's six checks stand as written; without this the cleanup's `removeEventListener` has no mutation that can go red, and the spec itself names the leak as a trap. It asserts the count is *stable and at least one* rather than exactly one, so a listener registered by a future library cannot make it flaky.
6. **P4 reads the stored key list before the reload.** The context's init script re-seeds `gy.v1` on every navigation, so a reload-only check would pass with a persisted flag in place. Stated in the check's own comment because it is the kind of thing that gets "simplified" later.
7. **P5 asserts tonight's "See all" as well as the past night's line.** One extra term, and it is what stops a ternary written the wrong way round from passing by deleting `MiniPlan` everywhere.
8. **`Note` is not exported and not moved to `ui/index.jsx`.** It has one file's worth of callers, and the spec is explicit that nothing is added to the shared component module this phase.
