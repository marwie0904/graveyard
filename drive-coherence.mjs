/* C3 Coherence, band 3: "confirmed by a check that no decorative element
   renders during a guided activity."

   That is a claim about what is on screen while the player runs, so it is
   measured in a browser rather than read out of the source. A grep can say
   .gy-sky is not written into the player's tree; only a render can say nothing
   else drifted in behind it.

   Two properties, sampled twice on every step of all five activities:

     1. No CSS keyframe animation is running anywhere in the document. Every
        animation in index.html is decoration — the drifting dusk, the blooms,
        the badge, the entrance stagger, the spinner. The instruction moves by
        transition, not by keyframes, so "zero running animations" is the whole
        assertion and it needs no allowlist to soften it.

     2. The only running transitions are the two the instruction is made of:
        the ring's transform, which is the pacing, and the bar's width, which
        is the progress. Anything else transitioning is something decorative
        that has learned to move.

   playState, not the class list: .gy-in and .gy-out are `both`-filled, so
   getComputedStyle still names their keyframes long after they have finished.
   getAnimations() knows the difference between running and finished.

   Also inventories the player's visible text, which is the other half of the
   band: extraneous *material*, not only extraneous motion. The allowlist below
   is the copy the player is supposed to have; a tip, a quote or a streak count
   added later fails here rather than in a reviewer's judgement.

   Run it against a dev server:  node drive-coherence.mjs [url] */

import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { sequenceOf } from "./src/cues.js";

const TARGET = process.argv[2] ?? "http://127.0.0.1:5173/";

/* The activity table and its step labels, lifted from App.jsx the same way
   signaling.test.js lifts them and for the same reason: CARE is module-scope
   and unexported, and a transcription would drift. The step label is the
   instruction, so the copy inventory has to know each activity's own labels
   rather than treat them as strays. */
const src = readFileSync(new URL("./src/App.jsx", import.meta.url), "utf8");
const CARE = new Function("Wind", "Moon", "Pulse", "Footprints", "Eye",
  `return [${src.split("const CARE = [")[1].split("\n];")[0]}];`)();
const ACTIVITIES = CARE.map((a) => ({
  label: a.l, steps: new Set(sequenceOf(a).map((s) => s.l)),
}));

/* transform: the breathing ring. width: the progress bar. Both are the
   instruction itself; see the header. */
const INSTRUCTIONAL = new Set(["transform", "width"]);

const TEXT_OK = [
  /^Micro-care$/, /^Done\.$/, /^That counts\. Back to it\.$/,
  /^\d+$/, /^✓$/, /^\d+ min left$/,
  /^(Next step|Pause|Resume|Finish early|Log it and close)$/,
];

const b = await chromium.launch({ channel: "chrome" });
const p = await b.newPage({ viewport: { width: 430, height: 932 } });
const errs = [];
p.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));
await p.goto(TARGET, { waitUntil: "networkidle" });

/* ---- the measurement --------------------------------------------------- */
const sample = () => p.evaluate(() => {
  const dlg = document.querySelector('[role="dialog"]');
  const name = (a) => {
    const t = a.effect?.target;
    const el = t?.nodeType === 1 ? t : null;
    const where = el
      ? `${el.tagName.toLowerCase()}${el.getAttribute("class") ? "." + el.getAttribute("class").split(" ").join(".") : ""}${a.effect?.pseudoElement ?? ""}`
      : "(detached)";
    return { where, inPlayer: !!(el && dlg?.contains(el)) };
  };
  return {
    open: !!dlg,
    animations: document.getAnimations().filter((a) => a.playState === "running").map((a) => ({
      kind: a.constructor.name,            // CSSAnimation | CSSTransition | Animation
      prop: a.animationName ?? a.transitionProperty ?? "(script)",
      ...name(a),
    })),
    /* leaf text nodes only: a parent's innerText would re-report its children */
    text: dlg ? [...dlg.querySelectorAll("*")]
      .filter((el) => !el.children.length && el.textContent.trim())
      .map((el) => el.textContent.trim()) : [],
  };
});

/* ---- the instrument, checked against a screen that does drift ---------- */
/* "No decoration ran" is only worth something if this could have said
   otherwise. The welcome screen is an Arch, so the dusk and both blooms are
   running on it right now; if the sampler cannot see them there it cannot be
   trusted to have seen nothing later. */
const control = (await sample()).animations.filter((a) => a.kind === "CSSAnimation");

/* ---- onboarding, same walk as the sibling drivers ---------------------- */
await p.getByText("Build my shift plan").click().catch(() => {});
await p.waitForTimeout(300);
for (let s = 0; s < 30; s++) {
  const bt = await p.evaluate(() => [...document.querySelectorAll("button")]
    .map((x) => x.innerText.replace(/\s+/g, " ").trim()));
  const pick = bt.findIndex((t) => t && !/^(Back|Continue|Next)/i.test(t));
  if (pick >= 0) await p.locator("button").nth(pick).click().catch(() => {});
  await p.waitForTimeout(120);
  const a = p.locator("button").filter({ hasText: /Continue|Next|See my plan|Build/i }).first();
  if (await a.count()) await a.click().catch(() => {});
  await p.waitForTimeout(200);
  if (/plan is ready/i.test(await p.evaluate(() => document.body.innerText))) break;
}
await p.waitForTimeout(6500);
const start = p.getByText("Start my plan", { exact: false }).first();
if (await start.count()) { await start.scrollIntoViewIfNeeded(); await start.click(); }
await p.waitForTimeout(1000);

const tab = (name) => p.evaluate((n) => {
  const b = [...document.querySelectorAll("button")].find((x) => x.innerText.trim() === n);
  if (b) b.click();
}, name);

await tab("Care");
await p.waitForTimeout(700);
for (let i = 0; i < 8; i++) {          // the guided tour opens over the first run
  const skipped = await p.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /^Skip$/i.test(x.innerText.trim()));
    if (b) { b.click(); return true; }
    return false;
  });
  if (skipped) break;
  await p.waitForTimeout(250);
}
await p.waitForTimeout(600);

const offenders = [];
const strays = new Set();
let steps = 0, frames = 0;

/* One frame, judged. `at` names it in the report; nothing else differs between
   a step frame and the finished one. */
const judge = async ({ label, steps: labels }, at) => {
  const f = await sample();
  if (!f.open) { offenders.push(`${label}: the player closed early, at ${at}`); return false; }
  frames++;
  for (const a of f.animations) {
    if (a.kind === "CSSTransition" && INSTRUCTIONAL.has(a.prop) && a.inPlayer) continue;
    offenders.push(`${label} ${at}: ${a.kind} ${a.prop} on ${a.where}${a.inPlayer ? " (in player)" : ""}`);
  }
  for (const t of f.text) {
    if (t === label || labels.has(t) || TEXT_OK.some((r) => r.test(t))) continue;
    strays.add(`${label}: "${t}"`);
  }
  return true;
};

for (const activity of ACTIVITIES) {
  await tab("Care");
  await p.waitForTimeout(400);
  await p.getByText(activity.label).first().click();   // the card is titled and subtitled, so not exact
  await p.waitForTimeout(700);
  /* Spoken guidance is on by default and speaks through the machine running
     this, which is a lot of "Breathe in" for whoever is at the desk. Nothing
     measured here is audible, so the run turns it off. */
  await p.evaluate(() => {
    const t = [...document.querySelectorAll("button")]
      .find((x) => /^Spoken guidance on$/i.test(x.getAttribute("aria-label") || ""));
    t?.click();
  });

  for (let s = 0; s < 60; s++) {
    /* twice a step: on the change, and again once everything has settled */
    if (!await judge(activity, `step ${s + 1}`)) break;
    await p.waitForTimeout(700);
    if (!await judge(activity, `step ${s + 1} settled`)) break;
    steps++;
    const done = await p.evaluate(() => {
      const b = [...document.querySelectorAll('[role="dialog"] button')]
        .find((x) => x.innerText.trim() === "Next step");
      if (b) { b.click(); return false; }
      return true;
    });
    if (done) break;
  }
  await p.waitForTimeout(500);
  await judge(activity, "finished");     // the frame where the ✓ lands
  await p.evaluate(() => {
    const b = [...document.querySelectorAll('[role="dialog"] button')]
      .find((x) => /Log it and close|Close/i.test(x.innerText.trim() || x.getAttribute("aria-label") || ""));
    b?.click();
  });
  await p.waitForTimeout(500);
}

const blind = control.length ? [] : ["the sampler saw no animation on the welcome screen, where the dusk drifts — it cannot be trusted to have seen nothing in the player"];

console.log(`sampled ${frames} frames across ${steps} steps of ${ACTIVITIES.length} activities`);
console.log("control (welcome) :", control.length ? control.map((a) => `${a.prop} on ${a.where}`) : blind);
console.log("decorative motion :", offenders.length ? offenders : "none");
console.log("unlisted copy     :", strays.size ? [...strays] : "none");
console.log("page errors       :", errs.length ? errs : "none");
await b.close();
process.exit(offenders.length + strays.size + errs.length + blind.length ? 1 : 0);
