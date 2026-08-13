/* Phase 5 checks, driven through a faked clock against the running dev server.
   Same pattern as drive-plan-state.mjs: page.clock.install before goto,
   addInitScript seeding gy.v1, a record() tally, page.on("pageerror") failing
   the check it happened in, non-zero exit on failure. The dev server is
   already up on :5174.

   Two clock idioms, and they are not interchangeable. setFixedTime moves
   Date.now() WITHOUT running a single installed timer — a suspended tab.
   fastForward runs them, which is what a rollover needs. L4 and L5 use
   fastForward on purpose; every other check stands still.

   ONE LOCATOR TRAP, and it costs a confusing timeout: on the Dashboard's range
   view there is a button called "Apply to next plan", so
   getByRole("button", { name: "Plan" }) is ambiguous. Every tab click below
   passes { exact: true }.
   Run: node drive-loop.mjs [url] */
import { chromium } from "playwright";

const URL = process.argv[2] || "http://localhost:5174/";

/* shift 22:00-06:00, sleep from 07:30 for 7.5h -> sleepEnd 15:00, so the night
   boundary is 15:00 local. drive-history.mjs's fixture: 02:00 and 14:59 on
   Aug 13 both belong to night "2026-08-12"; 15:01 is "2026-08-13".
   Verified against planner.js for this profile — night 1: gap 120, 3 resets,
   cutoff 1:30 AM. Night 3: gap 105, 4 resets, cutoff 12:30 AM. Night 4+: gap 90,
   5 resets, cutoff 12:30 AM. Every expected value below comes off that table. */
const PROFILE = {
  shiftStart: "22:00", shiftEnd: "06:00", plannedSleep: "07:30", sleepGoalHours: 7.5,
  nightInStretch: 1, caffeine: "moderate", nap: "both", caffeineSensitivity: "normal",
  movement: "mixed", lightEnv: "bright", commute: "drive", sleepiestTime: "deep",
  chronotype: "neither", overrides: {},
};

/* Caffeine at 22:30 and water at 22:40, both well before any cutoff this phase
   can produce, so no check below is accidentally reading a lateCaffeine plan. */
const LOGS = [
  { id: "caffeine-1", t: 1350, type: "caffeine", value: 1 },
  { id: "water-1", t: 1360, type: "water", value: 1 },
];

/* Archive ids counted back from the night the fixture stands in. Date.parse
   reads a bare date as UTC midnight and toISOString reads it back the same way,
   so back(1) is exactly last night with no local-time drift. */
const back = (o) => new Date(Date.parse("2026-08-12") - o * 864e5).toISOString().slice(0, 10);

/* A full NightRecord as `archived` writes one — every field the Dashboard reads,
   and deliberately no dayOffset, which App.jsx computes from the id.
   countStretch reads only `id`; the rest is here because a half-filled record
   white-screens the Dashboard, which would fail a check for the wrong reason. */
const REC = (id, extra = {}) => ({
  id, sleepStart: 450, wake: 900, sleepHours: 7.5, sleepEstimated: false,
  cutoff: 1290, caffeine: [1140, 1230], moveDone: 2, moveTotal: 4,
  restKind: "nap", restMin: 20, groggy: false, water: 3, screenStrain: 0,
  sleepyWindow: "deep", heavyMeal: false, lateLightDone: true, endShift: true, ...extra,
});

const BLOB = (over = {}) => ({
  night: "2026-08-12", profile: PROFILE, logs: LOGS, reflection: {}, theme: null,
  archive: [], ...over,
});

const results = [];
const record = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `\n        ${detail}` : ""}`);
};

const seed = (blob) => `
  try { localStorage.setItem("gy.v1", ${JSON.stringify(JSON.stringify(blob))}); } catch {}
`;

/* exportData's only observable exit is a Blob handed to createObjectURL, so the
   spy is how L5 drives the second half of the stored() guard instead of
   assuming it. Installed before the app's first line. */
const EXPORT_SPY = `
  window.__export = null;
  const orig = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (b) => { b.text().then((t) => { window.__export = t; }); return orig(b); };
`;

const read = (page) => page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("gy.v1") || "{}");
  const p = s.profile || {};
  const t = document.body.textContent;
  return {
    night: s.night ?? null,
    logs: (s.logs || []).length,
    ids: (s.archive || []).map((r) => r.id),
    pkeys: Object.keys(p).join(","),
    ov: p.overrides || {},
    sens: p.caffeineSensitivity ?? null,
    movement: p.movement ?? null,
    goal: p.sleepGoalHours ?? null,
    asked: p.sleepGoalAsked ?? null,
    /* "Night 4 of your stretch" — the whole of Part 1's UI, read off the card
       that already explains the plan. */
    line: (t.match(/Night \d+ of your stretch/) || [null])[0],
    /* The recurring card: "Every 90 minutes · 5 tonight, next at 11:30 PM".
       Both numbers, because the gap is rendered by PlanTab from
       movementInterval(profile) and the count comes from the plan itself — a
       fix that hands one of them the seed and the other the count shows up as a
       disagreement between these two and nowhere else. */
    gap: (t.match(/Every (\d+) minutes/) || [null, null])[1],
    moves: (t.match(/Every \d+ minutes · (\d+) left/) || [null, null])[1],
    /* The caffeine cutoff item's own time, read as the timeline prints it —
       in the card's meta line after the title, not in a gutter before it. */
    cutoff: (t.match(/Last caffeine cutoff[^\d]*(\d+:\d\d [AP]M)/) || [null, null])[1],
    sleepUntil: (t.match(/Sleep until (\d+:\d\d [AP]M)/) || [null, null])[1],
    text: t,
  };
});

/* A page with the clock frozen at `time`, localStorage pre-seeded and the export
   spy armed — all before the app's first line runs. */
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
  await page.addInitScript(EXPORT_SPY);
  if (blob !== undefined) await page.addInitScript(seed(blob));
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(400);
  return { ctx, page, errors };
}

const tabTo = async (page, name) => {
  await page.getByRole("button", { name, exact: true }).click();
  await page.waitForTimeout(300);
};
const planTab = (page) => tabTo(page, "Plan");

/* The reflection's last question and its Save button. The Select is a native
   <select> wrapped in a <label>, so getByLabel finds it by the question. */
const answerReflection = async (page, answer) => {
  await tabTo(page, "Reflection");
  await page.getByLabel("What should the plan change next shift?").selectOption(answer);
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: "Save reflection" }).click();
  await page.waitForTimeout(500);
};

/* The Dashboard's multi-night window, which is where the adjustment card lives —
   the default "d0" chip is a single night and renders a different screen. */
const weekView = async (page) => {
  await tabTo(page, "Dashboard");
  await page.selectOption('select[aria-label="Longer windows"]', "1w");
  await page.waitForTimeout(400);
};

/* Six archived nights of 5.4h ending last night, against a 7.5h quiz bucket.
   sleepBand(5.4) is 5.5, so the proposal is live; with tonight's logs folded in
   the window holds seven records and the card says "last 7 nights". */
const SHORT_SLEEP = { archive: [1, 2, 3, 4, 5, 6].map((o) => REC(back(o), { sleepHours: 5.4 })) };

const T0200 = new Date("2026-08-13T02:00:00");

const browser = await chromium.launch({ channel: "chrome" });

/* ---- L1: the archive counts the stretch, and the plan moves with it ------- */
{
  /* Three consecutive nights ending last night, seed 1 -> night 4: gap 90,
     5 resets, against the same profile with an empty archive at gap 120 and 3.
     Two contexts rather than one edit, because the seed is identical in both and
     the archive is the only difference — which is the claim. */
  const deep = await open(browser, { time: T0200, blob: BLOB({ archive: [1, 2, 3].map((o) => REC(back(o))) }) });
  await planTab(deep.page);
  const d = await read(deep.page);
  await deep.ctx.close();

  const fresh = await open(browser, { time: T0200, blob: BLOB({ archive: [] }) });
  await planTab(fresh.page);
  const f = await read(fresh.page);
  await fresh.ctx.close();

  record("L1 three consecutive nights read as night four, and the reset gap moves 30 minutes with them",
    d.line === "Night 4 of your stretch" && d.gap === "90" && d.moves === "5" &&
    d.text.includes("Steady rhythm plan") &&
    f.line === "Night 1 of your stretch" && f.gap === "120" && f.moves === "3" &&
    !deep.errors.length && !fresh.errors.length,
    `deep=${d.line}/${d.gap}min/${d.moves} fresh=${f.line}/${f.gap}min/${f.moves} err=${[...deep.errors, ...fresh.errors].join(" || ") || "none"}`);
}

/* ---- L2: two missing nights end the stretch ------------------------------- */
{
  /* Without this, a rule that never breaks a run passes L1. Offsets 3, 4, 5:
     the two nights nearest tonight are empty, so the walk stops before it
     starts and the seed is dead. */
  const { ctx, page, errors } = await open(browser, {
    time: T0200, blob: BLOB({ archive: [3, 4, 5].map((o) => REC(back(o))) }),
  });
  await planTab(page);
  const s = await read(page);
  record("L2 a two-night hole nearest tonight ends the stretch and reads night one",
    s.line === "Night 1 of your stretch" && s.gap === "120" && s.moves === "3" && !errors.length,
    `line=${s.line} gap=${s.gap} moves=${s.moves} err=${errors.join(" || ") || "none"}`);
  await ctx.close();
}

/* ---- L3: one missing night is bridged ------------------------------------- */
{
  // offsets 1 and 3: the hole at 2 is forgiven and not counted, so this is 3
  const { ctx, page, errors } = await open(browser, {
    time: T0200, blob: BLOB({ archive: [1, 3].map((o) => REC(back(o))) }),
  });
  await planTab(page);
  const s = await read(page);
  record("L3 a single missing night is bridged without being counted",
    s.line === "Night 3 of your stretch" && s.gap === "105" && s.moves === "4" && !errors.length,
    `line=${s.line} gap=${s.gap} moves=${s.moves} err=${errors.join(" || ") || "none"}`);
  await ctx.close();
}

/* ---- L4: the seed carries across the first real rollover ------------------ */
{
  /* The regression the seed exists for. Install on night three, empty archive:
     tonight is 3. Cross the boundary with something logged and the archive gains
     one record — a FALLBACK reads 2 here and relaxes the caffeine cutoff by an
     hour on night four. fastForward, not setFixedTime: this check needs the
     30-second tick to actually fire. */
  const { ctx, page, errors } = await open(browser, {
    time: new Date("2026-08-13T14:59:00"),
    blob: BLOB({ profile: { ...PROFILE, nightInStretch: 3 }, archive: [] }),
  });
  await planTab(page);
  const before = await read(page);
  await page.clock.fastForward("00:05:00");   // 14:59 -> 15:04, past the boundary
  await page.waitForTimeout(600);
  const after = await read(page);
  record("L4 the quiz answer seeds the nights behind the archive and keeps counting up",
    before.line === "Night 3 of your stretch" &&
    after.line === "Night 4 of your stretch" &&
    after.night === "2026-08-13" && after.ids.join(",") === "2026-08-12" &&
    after.logs === 0 && !errors.length,
    `before=${before.line} after=${after.line} night=${after.night} ids=${JSON.stringify(after.ids)} err=${errors.join(" || ") || "none"}`);
  await ctx.close();
}

/* ---- L5: the count never reaches disk, by either exit --------------------- */
{
  /* Three writes in a row through planProfile-derived bases — a profile edit,
     an export, and a rollover — and neither exit may carry `stretch`. The
     profile edit is the reminders "All off" button, which is a
     setProfile({ ...profile, ... }) from the sheet that now receives
     planProfile. */
  const { ctx, page, errors } = await open(browser, {
    time: new Date("2026-08-13T14:59:00"),
    blob: BLOB({ archive: [1, 2, 3].map((o) => REC(back(o))) }),
  });
  await planTab(page);
  const armed = await read(page);
  // the avatar in the header is the only button on the page with no text
  await page.locator("button").filter({ hasText: /^$/ }).first().click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "All off" }).click();
  await page.waitForTimeout(300);
  await page.getByText("Export data", { exact: true }).click();
  await page.waitForFunction(() => window.__export !== null, null, { timeout: 3000 }).catch(() => {});
  const exported = await page.evaluate(() => {
    try { return Object.keys(JSON.parse(window.__export).profile).join(","); } catch { return null; }
  });
  await page.clock.fastForward("00:05:00");   // 14:59 -> 15:04, and the fold
  await page.waitForTimeout(600);
  const s = await read(page);
  record("L5 neither the write nor the export carries the counted night to disk",
    armed.line === "Night 4 of your stretch" &&                 // the memo did run
    s.pkeys.length > 0 && !s.pkeys.split(",").includes("stretch") &&
    exported !== null && !exported.split(",").includes("stretch") &&
    s.pkeys.split(",").includes("mutedReminders") &&            // the edit did land
    s.ids.join(",").startsWith("2026-08-12") && !errors.length,
    `stored=[${s.pkeys}] exported=[${exported}] ids=${JSON.stringify(s.ids)} err=${errors.join(" || ") || "none"}`);
  await ctx.close();
}

/* ---- L6/L7: the reflection writes an override, not a quiz answer ---------- */
{
  /* Empty archive, so this is night one and the plan's own default is 6 hours.
     Before this task the same taps set caffeineSensitivity: "high" — a
     TWO-hour move on a value REVIEW shows back as something the user said —
     and wrote nothing to overrides at all. */
  const { ctx, page, errors } = await open(browser, { time: T0200, blob: BLOB({ archive: [] }) });
  await planTab(page);
  const before = await read(page);
  await answerReflection(page, "Earlier caffeine cutoff");
  const toast = await read(page);
  await planTab(page);
  const after = await read(page);
  record("L6 Earlier caffeine cutoff writes an override, moves the item, and leaves the quiz answer alone",
    before.cutoff === "1:30 AM" && after.cutoff === "12:30 AM" &&
    after.ov.caffeineHours === 7 &&
    after.sens === "normal" &&                                  // "high" means the stomp is back
    toast.text.includes("Caffeine now stops 7 hours before sleep.") && !errors.length,
    `cutoff ${before.cutoff}->${after.cutoff} ov=${JSON.stringify(after.ov)} sens=${after.sens} toast=${toast.text.includes("Caffeine now stops 7 hours before sleep.")} err=${errors.join(" || ") || "none"}`);

  /* The button is still on screen. Without this, a `current + 1` implementation
     passes L6 and walks the cutoff an hour further every time it is pressed. */
  await answerReflection(page, "Earlier caffeine cutoff");
  const t2 = await read(page);
  await planTab(page);
  const twice = await read(page);
  record("L7 pressing Save a second time does not move the number again",
    twice.ov.caffeineHours === 7 && twice.cutoff === "12:30 AM" &&
    t2.text.includes("That is already where your plan is.") && !errors.length,
    `ov=${JSON.stringify(twice.ov)} cutoff=${twice.cutoff} toast=${t2.text.includes("That is already where your plan is.")} err=${errors.join(" || ") || "none"}`);
  await ctx.close();
}

/* ---- L8: the profile sheet lists what is overridden, and puts it all back -- */
{
  /* Seeded rather than driven through the reflection, so this check stands on
     its own: the card is the index for every writer of overrides, not just the
     one Task 3 added. The two junk entries are the trust boundary — `overrides`
     comes off a hand-editable blob, and ADJUSTABLE[k].l on an unknown key is a
     white screen inside the sheet. */
  const { ctx, page, errors } = await open(browser, {
    time: T0200,
    blob: BLOB({
      archive: [],
      profile: { ...PROFILE, overrides: { caffeineHours: 7, notAKey: 5, moveGap: "x" } },
    }),
  });
  await planTab(page);
  const before = await read(page);
  await page.locator("button").filter({ hasText: /^$/ }).first().click();
  await page.waitForTimeout(400);
  const sheet = await read(page);
  await page.getByRole("button", { name: /Put them all back/ }).click();
  await page.waitForTimeout(500);
  /* The sheet is left open on purpose. It is an absolutely-positioned overlay
     and the Plan tab is still mounted underneath it, so document.body.textContent
     carries both — which is a cheaper read than hunting for the sheet's own
     unlabelled X, and the header avatar cannot be clicked through the overlay. */
  const cleared = await read(page);
  record("L8 the receipt lists only the overrides the plan can read, and puts them all back",
    before.cutoff === "12:30 AM" &&
    sheet.text.includes("Plan adjustments") &&
    sheet.text.includes("Stop caffeine") && sheet.text.includes("7.0") &&
    sheet.text.includes("hours before sleep") &&
    !sheet.text.includes("A reset every") &&        // moveGap: "x" is not a number
    !sheet.text.includes("NaN") && !sheet.text.includes("notAKey") &&
    Object.keys(cleared.ov).length === 0 &&
    cleared.text.includes("Back to the plan's own timing.") &&
    !cleared.text.includes("Plan adjustments") &&  // empty set, no card at all
    cleared.cutoff === "1:30 AM" && !errors.length,
    `cutoff ${before.cutoff}->${cleared.cutoff} listed=${sheet.text.includes("Stop caffeine")} junk=${sheet.text.includes("A reset every") || sheet.text.includes("NaN")} ov=${JSON.stringify(cleared.ov)} cardGone=${!cleared.text.includes("Plan adjustments")} err=${errors.join(" || ") || "none"}`);
  await ctx.close();
}

/* ---- L9: an answer the plan cannot act on is refused out loud ------------- */
{
  /* nap: "none" -> deep-rest is a fixed "close your eyes for five minutes" and
     restLength reaches no item, so writing it would toast a change that did not
     happen. The second half is the other deleted stomp: "Fewer resets" used to
     rewrite `movement` to "active", a statement of fact about the job. */
  const { ctx, page, errors } = await open(browser, {
    time: T0200, blob: BLOB({ profile: { ...PROFILE, nap: "none" }, archive: [] }),
  });
  await answerReflection(page, "More rest");
  const refused = await read(page);
  await answerReflection(page, "Fewer resets");
  const gap = await read(page);
  await planTab(page);
  const plan = await read(page);
  record("L9 an unreachable answer is refused with a reason, and Fewer resets no longer rewrites the job",
    Object.keys(refused.ov).length === 0 &&
    refused.text.includes("You said naps are not possible, so the plan keeps rest short and quiet instead.") &&
    gap.ov.moveGap === 150 && gap.movement === "mixed" &&        // "active" means the stomp is back
    plan.gap === "150" && !errors.length,
    `refusedOv=${JSON.stringify(refused.ov)} said=${refused.text.includes("naps are not possible")} ov=${JSON.stringify(gap.ov)} movement=${gap.movement} gap=${plan.gap} err=${errors.join(" || ") || "none"}`);
  await ctx.close();
}

/* ---- L10: the goal is proposed, named in full, and applied on a tap ------- */
{
  const { ctx, page, errors } = await open(browser, { time: T0200, blob: BLOB(SHORT_SLEEP) });
  await weekView(page);
  const offered = await read(page);
  await planTab(page);
  const beforePlan = await read(page);
  await weekView(page);
  await page.getByRole("button", { name: "Apply to next plan" }).click();
  await page.waitForTimeout(500);
  const applied = await read(page);
  await planTab(page);
  const afterPlan = await read(page);
  record("L10 the sleep goal is proposed against both figures and moves the whole plan when applied",
    offered.text.includes("average 5.4h") && offered.text.includes("the 7.5h you set") &&
    offered.text.includes("work backward from 5.5h") &&
    beforePlan.sleepUntil === "3:00 PM" && beforePlan.text.includes("Steady rhythm plan") &&
    applied.goal === 5.5 && applied.text.includes("5.5h goal") &&
    afterPlan.sleepUntil === "1:00 PM" &&
    afterPlan.text.includes("Short-sleep support plan") &&      // planSummary read sleepBand
    !errors.length,
    `offered=${offered.text.includes("work backward from 5.5h")} goal=${applied.goal} sleep ${beforePlan.sleepUntil}->${afterPlan.sleepUntil} type=${afterPlan.text.includes("Short-sleep support plan")} err=${errors.join(" || ") || "none"}`);
  await ctx.close();
}

/* ---- L11: the refusal sticks across a reload ----------------------------- */
{
  /* Without this, "Keep current" is a toast and the same card asks the same
     question every time the Dashboard opens, forever — which is the nagging
     this part exists to avoid. The second page is a NEW context seeded with
     what the first one wrote, because this file's init script re-seeds gy.v1 on
     every navigation and a plain reload would wipe the refusal. */
  const first = await open(browser, { time: T0200, blob: BLOB(SHORT_SLEEP) });
  await weekView(first.page);
  await first.page.getByRole("button", { name: "Keep current" }).click();
  await first.page.waitForTimeout(500);
  const declined = await read(first.page);
  const carried = await first.page.evaluate(() => JSON.parse(localStorage.getItem("gy.v1")));
  await first.ctx.close();

  const again = await open(browser, { time: T0200, blob: carried });
  await weekView(again.page);
  const second = await read(again.page);
  await again.ctx.close();

  record("L11 a refused band is remembered, and the card moves on to the next adjustment",
    declined.asked === 5.5 && declined.goal === 7.5 &&
    declined.text.includes("Keeping your current plan.") &&
    second.asked === 5.5 &&
    !second.text.includes("work backward from 5.5h") &&
    second.text.includes("start wind-down earlier") &&
    !first.errors.length && !again.errors.length,
    `asked=${declined.asked} goal=${declined.goal} reasked=${second.text.includes("work backward from 5.5h")} next=${second.text.includes("start wind-down earlier")} err=${[...first.errors, ...again.errors].join(" || ") || "none"}`);
}

/* ---- L12: applying it across the boundary does not walk the night back ---- */
{
  /* 14:30 with a 7.5h goal is still night 2026-08-12 (boundary 15:00). Applying
     5.5h moves the wake boundary to 13:00, which has already passed, so nightOf
     now names 2026-08-13. The adopt effect watches sleepGoalHours, so this is a
     re-labelling and not a fold — Phase 2's rule, reached from a new button. The
     assertion is therefore about the id and the archive rather than about a
     record appearing: the sequence must never DECREASE (the direction `forward`
     exists to refuse, reachable by applying a LONGER goal), and no id may appear
     twice, which is what a second fold would produce in an archive every average
     reads. The old 15:00 boundary must also pass without waking anything up. */
  const { ctx, page, errors } = await open(browser, {
    time: new Date("2026-08-13T14:30:00"), blob: BLOB(SHORT_SLEEP),
  });
  await weekView(page);
  const before = await read(page);
  await page.getByRole("button", { name: "Apply to next plan" }).click();
  await page.waitForTimeout(700);
  const applied = await read(page);
  await page.clock.fastForward("01:00:00");   // 14:30 -> 15:30, past the OLD boundary
  await page.waitForTimeout(700);
  const later = await read(page);
  const seq = [before.night, applied.night, later.night];
  record("L12 moving the wake boundary never walks the night back and never duplicates an id",
    before.night === "2026-08-12" &&
    seq.every((v, i) => i === 0 || v >= seq[i - 1]) &&
    new Set(later.ids).size === later.ids.length &&
    later.ids.filter((id) => id === "2026-08-12").length <= 1 &&
    applied.goal === 5.5 && !errors.length,
    `sequence=${JSON.stringify(seq)} ids=${JSON.stringify(later.ids)} goal=${applied.goal} err=${errors.join(" || ") || "none"}`);
  await ctx.close();
}

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log("failed: " + failed.map((r) => r.name).join(", ")); process.exit(1); }
