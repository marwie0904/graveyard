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

/* ---- E6: the caffeine chart is drawn when there IS something to draw ------ */
{
  /* E5's mirror. Without this, inverting the caffeine Panel's condition to
     `false` leaves the whole driver green: E5 asserts the absence and nothing
     asserts the presence. REC carries two cups and a cutoff, so the condition
     the Panel guards on is true through both terms. */
  const { ctx, page, errors } = await open(browser, {
    time: new Date("2026-08-13T02:00:00"),
    blob: { night: "2026-08-12", profile: PROFILE, logs: [], reflection: {}, theme: null,
            archive: [REC("2026-08-11"), REC("2026-08-10")] },
  });
  await page.selectOption('select[aria-label="Longer windows"]', "1w");
  await page.waitForTimeout(300);
  const note = await heroNote(page);
  const t = (await read(page)).text;
  record("E6 the caffeine chart is present when the window has caffeine in it",
    t.includes("Caffeine against cutoff") && t.includes("dots above the line landed late") &&
    note === "2 nights" && !errors.length,
    `caffeine=${t.includes("Caffeine against cutoff")} sub=${t.includes("dots above the line landed late")} note=${note} err=${errors.join(" || ") || "none"}`);
  await ctx.close();
}

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log("failed: " + failed.map((r) => r.name).join(", ")); process.exit(1); }
