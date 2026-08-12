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

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log("failed: " + failed.map((r) => r.name).join(", ")); process.exit(1); }
