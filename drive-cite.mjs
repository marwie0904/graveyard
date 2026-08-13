/* Phase 6 smoke test, not a gate. It proves ONE thing: adding `src` to every
   one of the 25 plan items broke no rendering. It does NOT check that any
   citation is correct, and it cannot — `src` never reaches the DOM,
   localStorage or the export, so there is nothing about the field itself a
   browser can see, and every defect this can catch, `npm test` catches first.
   The unit tests in src/planner.test.js are the real gate for the citations,
   and they are the only gate for them.

   Same pattern as drive-plan-state.mjs and drive-loop.mjs: page.clock.install
   before goto, addInitScript seeding gy.v1, a record() tally, pageerror and
   console errors failing the check they happened in, non-zero exit on failure.
   The dev server is already up on :5174.
   Run: node drive-cite.mjs [url] */
import { chromium } from "playwright";

const URL = process.argv[2] || "http://localhost:5174/";

const BASE = {
  shiftStart: "22:00", shiftEnd: "06:00", plannedSleep: "07:30", sleepGoalHours: 7,
  nightInStretch: 1, caffeine: "moderate", nap: "both", caffeineSensitivity: "normal",
  movement: "mixed", lightEnv: "bright", commute: "drive", sleepiestTime: "deep",
  chronotype: "neither", overrides: {},
};

/* Plan-axis minutes, not clock minutes: ph.start is 1320 for BASE. A log at
   t: 190 on a 22:00 shift is 19 hours before the plan and fires nothing, which
   is the trap drive-loop.mjs names and the reason every log time below is S + n. */
const S = 1320;

/* Wall clocks chosen so nightOf puts the app exactly where the unit matrix in
   planner.test.js stands. For every profile here the wake boundary is inside the
   same day, so `now` on the axis is the clock time (plus 1440 past midnight):
     22:00 on Aug 13 -> now = 1320 = ph.start
     01:20 on Aug 14 -> now = 1520 = ph.start + 200
     06:00 on Aug 13 -> now =  360 = ph.start of the 06:00-14:00 shift
   All three resolve to night "2026-08-13", which is why every blob is stamped
   with it: a stamp mismatch sends boot through forNight -> archived, folds the
   night away and clears the logs, and the count would fail for the wrong reason. */
const AT_START = new Date("2026-08-13T22:00:00");
const AT_PLUS_200 = new Date("2026-08-14T01:20:00");
const AT_EARLY = new Date("2026-08-13T06:00:00");

/* The spec's eight-profile matrix, and its verified item counts. Driven against
   the real generateTimeline and then against the real app. Their union is
   exactly the 25 ids of the mapping with move-N collapsed. */
const CASES = [
  ["C1 baseline", BASE, [], AT_START, 20],
  ["C2 woke late", BASE, [{ id: "w", t: S - 200, type: "wake", value: "later" }], AT_START, 20],
  ["C3 short goal, woke early", { ...BASE, sleepGoalHours: 5 },
    [{ id: "w", t: S - 200, type: "wake", value: "earlier" }], AT_START, 21],
  ["C4 high caffeine", { ...BASE, caffeine: "high" }, [], AT_START, 21],
  ["C5 no deep night", { ...BASE, shiftStart: "06:00", shiftEnd: "14:00", plannedSleep: "15:00" },
    [], AT_EARLY, 19],
  ["C6 nap logged", BASE, [{ id: "n", t: S + 180, type: "nap", value: "ok" }], AT_PLUS_200, 21],
  ["C7 water gap", BASE, [{ id: "wa", t: S, type: "water", value: 1 }], AT_PLUS_200, 21],
  ["C8 screen strain", BASE, [{ id: "sc", t: S + 190, type: "screen", value: 1 }], AT_PLUS_200, 21],
];

const results = [];
const record = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `\n        ${detail}` : ""}`);
};

const seed = (blob) => `
  try { localStorage.setItem("gy.v1", ${JSON.stringify(JSON.stringify(blob))}); } catch {}
`;

/* A page with the clock frozen at `time` and localStorage pre-seeded, both
   before the app's first line runs. */
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
  await page.addInitScript(seed(blob));
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(400);
  return { ctx, page, errors };
}

const browser = await chromium.launch({ channel: "chrome" });

for (const [name, profile, logs, time, expected] of CASES) {
  const { ctx, page, errors } = await open(browser, {
    time,
    blob: { night: "2026-08-13", profile, logs, reflection: {}, theme: null, archive: [] },
  });
  /* { exact: true }: the Dashboard's range view has a button called "Apply to
     next plan", so a loose name match on "Plan" is ambiguous and times out. */
  await page.getByRole("button", { name: "Plan", exact: true }).click();
  await page.waitForTimeout(300);
  /* PlanTab's own header — "0 of 20 logged." The item count is on the screen
     already, so this needs no instrumentation and reads the same number the
     user does. */
  const total = await page.evaluate(() => {
    const m = document.body.textContent.match(/\d+ of (\d+) logged/);
    return m ? Number(m[1]) : null;
  });
  record(`${name} renders ${expected} plan items with no page error`,
    total === expected && !errors.length,
    `items=${total} expected=${expected} err=${errors.join(" || ") || "none"}`);
  await ctx.close();
}

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log("failed: " + failed.map((r) => r.name).join(", ")); process.exit(1); }
