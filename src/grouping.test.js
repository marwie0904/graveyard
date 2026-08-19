import { describe, it, expect } from "vitest";
import { DAY, fmt, nightOf } from "./time.js";
import {
  calculateShiftPhases, determineCurrentPhase, generateTimeline, planGate, ADJUSTABLE,
} from "./planner.js";

/* ---------------------------------------------------------------------------
   What groups on the Plan screen, and what stopped grouping.

   The rubric says plan items band under their shift phase. They do not, and
   have not since App.jsx:1708 replaced the bands with one flat, time-ordered
   list: banding silently dropped any item falling outside every phase window
   while still counting it in "x of y", so the screen could say "0 of 20" over
   a list of 19. No phase label renders anywhere in this build. Do not come to
   this file looking for the bands — come here for what shipped instead.

   What ships, and what this file pins:
     - the logged / open split PlanTab partitions plan.items into, and the
       open / blocked split planGate partitions it into. Both exhaustive, both
       disjoint. That is precisely the property the bands did not have.
     - the order, because a flat list's only structure is time, and this app's
       axis is absolute minutes that run negative before a midnight shift and
       past 1440 after one. A wall-clock sort scrambles it.
     - the phases, still real data driving advice and the deep-night overlay
       even though nothing bands the list. They tile — and the timeline can
       still place an item outside all of them, which is the receipt for why
       the bands are gone.
     - the count under the heading, which reads plan.items and never the
       rendered list, so folding the resets cannot move it.
     - nights, which do still group the day strip, and are a true partition of
       the clock.

   App.jsx has no DOM test setup in this project, so every assertion here goes
   through planner.js and time.js exports. Nothing below renders anything.
--------------------------------------------------------------------------- */

const P = {
  shiftStart: "22:00", shiftEnd: "06:00", plannedSleep: "07:30",
  sleepGoalHours: 7, caffeine: "moderate", caffeineSensitivity: "normal",
  nap: "both", movement: "mixed", lightEnv: "bright",
  commute: "drive", sleepiestTime: "deep", overrides: {},
};

/* Four shift shapes, not one. A grouping test that only ever sees a 22:00 start
   proves nothing about the two cases that actually break a flat list: a plan
   whose pre-shift block sits on the day before (midnight start, negative `at`)
   and a plan that never crosses midnight at all (day shift, no deep night). */
const PROFILES = [
  ["night shift crossing midnight", P],
  ["day shift, no deep night", { ...P, shiftStart: "06:00", shiftEnd: "14:00", plannedSleep: "15:00" }],
  ["evening into the small hours, desk-bound, no caffeine",
    { ...P, shiftStart: "19:00", shiftEnd: "03:00", plannedSleep: "04:00",
      sleepGoalHours: 5, movement: "desk", caffeine: "none", nap: "none", commute: "walk" }],
  ["starting at midnight, so the pre-shift block is negative",
    { ...P, shiftStart: "00:00", shiftEnd: "08:00", plannedSleep: "09:00",
      movement: "active", caffeine: "high" }],
];

const at = (p) => calculateShiftPhases(p).start;
const plan = (p, logs = [], now = at(p)) => generateTimeline(p, logs, now);
/* Same shape App.jsx pushes at :2967. `status` is only ever done, skipped or
   adjusted — never "open" — which is what makes logged and open complementary
   rather than merely usually disjoint. */
const itemLog = (id, status, t) => ({ id: `${id}-${t}`, t, type: "item", value: { id, status } });
const ids = (xs) => xs.map((x) => x.id ?? x).sort();

/* ------------------------------------------------------------------------- */

describe("the logged / open split the Plan screen renders", () => {
  /* PlanTab's own two lines, copied deliberately: `logged` is every item with a
     log against it, `open` is every item whose status is still open. If these
     two ever stop covering plan.items exactly once, an item is either invisible
     or drawn twice — the bug that killed the phase bands, reached by a
     different route. */
  const split = (items, s) => ({
    logged: items.map((item) => ({ item, log: s.itemLog(item.id) })).filter((r) => r.log),
    open: items.filter((i) => s.itemStatus(i.id) === "open"),
  });

  it.each(PROFILES)("%s: covers every item exactly once, at every log depth", (_n, p) => {
    const all = plan(p).items;
    /* Every depth, not just empty and full: a partition that holds at both ends
       and leaks in the middle is the shape a real regression takes. */
    for (let k = 0; k <= all.length; k++) {
      const logs = all.slice(0, k).map((i, j) => itemLog(i.id, "done", at(p) + j));
      const { items, state } = plan(p, logs);
      const { logged, open } = split(items, state);
      expect(ids([...logged.map((r) => r.item), ...open])).toEqual(ids(items));
      expect(logged.filter((r) => open.some((o) => o.id === r.item.id))).toEqual([]);
    }
  });

  it.each(PROFILES)("%s: answers of any kind leave the item on the logged side", (_n, p) => {
    const first = plan(p).items[0];
    for (const status of ["done", "skipped", "adjusted"]) {
      const { items, state } = plan(p, [itemLog(first.id, status, at(p))]);
      const { logged, open } = split(items, state);
      expect(logged.map((r) => r.item.id)).toContain(first.id);
      expect(open.map((i) => i.id)).not.toContain(first.id);
    }
  });
});

describe("the count under the heading and the group below it are the same set", () => {
  /* The heading prints `logged.length` of `plan.items.length`. Both come off
     plan.items; neither comes off the folded list. That is the whole safety
     property, and it is checkable without rendering anything. */
  it.each(PROFILES)("%s: x + open = y, so nothing is counted that is not listed", (_n, p) => {
    const all = plan(p).items;
    for (const k of [0, 1, Math.floor(all.length / 2), all.length]) {
      const logs = all.slice(0, k).map((i, j) => itemLog(i.id, "done", at(p) + j));
      const { items, state } = plan(p, logs);
      const logged = items.filter((i) => state.itemLog(i.id));
      const open = items.filter((i) => state.itemStatus(i.id) === "open");
      expect(logged.length).toBe(k);
      expect(logged.length + open.length).toBe(items.length);
    }
  });

  /* A log that names no plan item — App.jsx writes three kinds: `move-manual-`
     and `skip-quick-` from the log sheet and quick actions, `care-<k>-` from a
     finished care card. They are movement work the user really did, and they
     deliberately do not touch tonight's count, because the count is over the
     plan, not over the night. Asserted so that a future "match the log to the
     nearest item" shortcut has to break a test rather than quietly inflate x.
     Note the first id starts with `move-`, the same prefix the reset fold keys
     on: it reaches the fold only if the fold ever reads logs instead of items. */
  it("ignores logs that name no plan item, including ones prefixed move-", () => {
    const t = at(P) + 200;
    const strays = [
      itemLog(`move-manual-${t}`, "done", t),
      itemLog(`skip-quick-${t}`, "skipped", t),
      itemLog(`care-box-${t}`, "done", t),
    ];
    const bare = plan(P);
    const withStrays = plan(P, strays);
    expect(withStrays.items.length).toBe(bare.items.length);
    expect(withStrays.items.filter((i) => withStrays.state.itemLog(i.id))).toEqual([]);
  });
});

describe("the movement fold, which is the one grouping left in the list", () => {
  /* PlanTab folds the still-open resets into one recurring card by testing
     `id.startsWith("move-")`. That prefix is load-bearing: an item that is not
     a reset but happens to start with it would be swallowed into the card and
     vanish from the list, and a reset renamed off it would be drawn twice —
     once flat, once inside the card. Pin the prefix to the category so either
     rename fails here instead of on the screen. */
  it.each(PROFILES)("%s: move- names exactly the movement resets, nothing else", (_n, p) => {
    const { items } = plan(p);
    expect(ids(items.filter((i) => i.id.startsWith("move-"))))
      .toEqual(ids(items.filter((i) => i.category === "movement")));
    expect(items.filter((i) => i.category === "movement").length).toBeGreaterThan(1);
  });

  it.each(PROFILES)("%s: resets and the rest partition the open list", (_n, p) => {
    const { items, state } = plan(p);
    const open = items.filter((i) => state.itemStatus(i.id) === "open");
    const moves = open.filter((i) => i.id.startsWith("move-"));
    const others = open.filter((i) => !i.id.startsWith("move-"));
    expect(ids([...moves, ...others])).toEqual(ids(open));
    /* The folded card is built from `moves[0]` and carries `recurring: moves`,
       so the card's own identity has to be one of the resets it stands for. */
    expect(moves).toContain(moves[0]);
  });

  /* The number the fold hides, stated out loud. Collapsed, the screen draws
     others.length + 1 rows where there are open.length items — so a denominator
     taken off the rendered list would be short by exactly moves.length - 1.
     This asserts the two numbers are genuinely distinguishable; if they were
     equal, the "counts the same set" test above would pass vacuously. */
  it.each(PROFILES)("%s: the folded list is strictly shorter than the count's set", (_n, p) => {
    const { items, state } = plan(p);
    const open = items.filter((i) => state.itemStatus(i.id) === "open");
    const moves = open.filter((i) => i.id.startsWith("move-"));
    expect(moves.length).toBeGreaterThan(1);
    expect(open.filter((i) => !i.id.startsWith("move-")).length + 1)
      .toBe(items.length - (moves.length - 1));
  });
});

describe("planGate partitions the same list into open, current and locked", () => {
  /* Three buckets, and every item lands in exactly one: answered already, the
     single item being waited on, or locked behind it. The gate is computed over
     plan.items and never over the folded display — App.jsx:1712 says so — which
     is why folding the resets cannot change which item the plan is waiting on. */
  it.each(PROFILES)("%s: exactly one bucket per item, at every depth", (_n, p) => {
    const all = plan(p).items;
    for (let k = 0; k <= all.length; k++) {
      const logs = all.slice(0, k).map((i, j) => itemLog(i.id, "done", at(p) + j));
      const { items, state } = plan(p, logs);
      const gate = planGate(items, state.itemStatus);
      const buckets = items.map((i) => [
        state.itemStatus(i.id) !== "open" && !gate.locked(i.id),
        !!gate.blocker && gate.blocker.id === i.id,
        gate.locked(i.id),
      ].filter(Boolean).length);
      // report the offenders, not just a false: a failure nobody can read is a
      // failure somebody deletes
      expect(items.filter((_, j) => buckets[j] !== 1).map((i) => i.id)).toEqual([]);
      expect(gate.blocker ? gate.blocker.id : null).toBe(k < items.length ? items[k].id : null);
    }
  });

  it.each(PROFILES)("%s: locks nothing once the whole night is answered", (_n, p) => {
    const all = plan(p).items;
    const logs = all.map((i, j) => itemLog(i.id, "done", at(p) + j));
    const { items, state } = plan(p, logs);
    const gate = planGate(items, state.itemStatus);
    expect(gate.blocker).toBeNull();
    expect(items.filter((i) => gate.locked(i.id))).toEqual([]);
  });
});

describe("the order is the grouping", () => {
  it.each(PROFILES)("%s: the list is non-decreasing in absolute time", (_n, p) => {
    const times = plan(p).items.map((i) => i.at);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  /* The axis is absolute minutes from the plan's own midnight, not clock time.
     A night shift runs past 1440 and a midnight shift runs below 0, so any sort
     that normalises to a wall clock — `at % DAY`, a formatted string, an
     unsigned compare — puts the morning before the evening it follows. Assert
     the wrong sort really is a different order, so this is a live regression and
     not a tautology. */
  it("keeps the morning after the evening it belongs to, past 1440", () => {
    const { items } = plan(P);
    expect(items.some((i) => i.at < DAY)).toBe(true);
    expect(items.some((i) => i.at >= DAY)).toBe(true);
    const clock = [...items].sort((a, b) => ((a.at % DAY) + DAY) % DAY - (((b.at % DAY) + DAY) % DAY));
    expect(clock.map((i) => i.id)).not.toEqual(items.map((i) => i.id));
    expect(fmt(items[0].at)).toMatch(/PM$/);
    expect(fmt(items[items.length - 1].at)).toMatch(/AM$/);
  });

  it("keeps the pre-shift block below zero for a shift that starts at midnight", () => {
    const p = PROFILES[3][1];
    const { items } = plan(p);
    expect(items[0].at).toBeLessThan(0);
    // negative is the axis working, not an error: it is the evening before
    expect(fmt(items[0].at)).toMatch(/PM$/);
    const unsigned = [...items].sort((a, b) => Math.abs(a.at) - Math.abs(b.at));
    expect(unsigned.map((i) => i.id)).not.toEqual(items.map((i) => i.id));
  });
});

describe("the phases still tile the shift, even though they no longer band it", () => {
  it.each(PROFILES)("%s: contiguous and non-overlapping from pre to sleep", (_n, p) => {
    const ph = calculateShiftPhases(p);
    expect(ph.phases.map((q) => q.key)).toEqual(["pre", "early", "mid", "late", "post", "sleep"]);
    expect(ph.phases[0].from).toBe(ph.start - 180);
    expect(ph.phases[ph.phases.length - 1].to).toBe(ph.sleepEnd);
    const seams = ph.phases.slice(1)
      .map((q, j) => [ph.phases[j].key, q.key, ph.phases[j].to, q.from])
      .filter(([, , a, b]) => a !== b);
    expect(seams).toEqual([]);
  });

  it.each(PROFILES)("%s: every minute of the plan is in exactly one phase", (_n, p) => {
    const ph = calculateShiftPhases(p);
    const bad = [];
    for (let t = ph.phases[0].from; t < ph.sleepEnd; t++) {
      const hits = ph.phases.filter((q) => t >= q.from && t < q.to);
      const named = determineCurrentPhase(t, ph).phase;
      if (hits.length !== 1 || named.key !== hits[0].key) bad.push([t, hits.map((q) => q.key), named.key]);
    }
    expect(bad).toEqual([]);
  });

  /* The true shape, stated rather than assumed: the phases tile the plan and
     nothing wider. `pre` opens exactly 180 minutes before the shift, and
     anything earlier than that is "before", which is not a phase — it is not in
     ph.phases at all. The next test is why that matters. */
  it.each(PROFILES)("%s: reports a non-phase outside the plan window", (_n, p) => {
    const ph = calculateShiftPhases(p);
    const keys = ph.phases.map((q) => q.key);
    expect(determineCurrentPhase(ph.phases[0].from - 1, ph).phase.key).toBe("before");
    expect(determineCurrentPhase(ph.sleepEnd, ph).phase.key).toBe("after");
    expect(keys).not.toContain("before");
    expect(keys).not.toContain("after");
  });

  it.each(PROFILES)("%s: the deep night is an overlay, not a seventh phase", (_n, p) => {
    const ph = calculateShiftPhases(p);
    expect(ph.phases.some((q) => q.key === "deepNight")).toBe(false);
    if (!ph.deepNight) return; // a day shift simply has none, which is the design
    const { phase, inDeepNight } = determineCurrentPhase(ph.deepNight[0], ph);
    expect(inDeepNight).toBe(true);
    expect(ph.phases.map((q) => q.key)).toContain(phase.key);
  });
});

/* This is the receipt for the whole file. The bands did not fail on an exotic
   profile — they failed on a slider the app ships. `preMealLead` runs to 300
   minutes and `preNapLead` to 240, both past the 180 that `pre` opens at, so a
   user who moves either to its own maximum gets a plan item that belongs to no
   phase. Banded, it rendered under no heading and was still in the denominator.
   Flat, it is simply the first row.
   If someone closes the hole by lowering a maximum to 180 or opening `pre`
   wider, this test fails, and that failure is the correct outcome: it says the
   escape is closed and this justification needs rewriting, not that the code
   broke. */
describe("an item can still fall outside every phase", () => {
  it.each([["preMealLead", "pre-meal"], ["preNapLead", "pre-nap"]])(
    "%s at its own maximum puts %s before the pre-shift window opens", (key, id) => {
      expect(ADJUSTABLE[key].max).toBeGreaterThan(180);
      const p = { ...P, overrides: { [key]: ADJUSTABLE[key].max }, sleepGoalHours: 5 };
      const ph = calculateShiftPhases(p);
      const { items, state } = plan(p, [], ph.start);
      const item = items.find((i) => i.id === id);
      expect(item.at).toBe(ph.start - ADJUSTABLE[key].max);
      expect(item.at).toBeLessThan(ph.phases[0].from);
      expect(determineCurrentPhase(item.at, ph).phase.key).toBe("before");
      // and the flat list still holds it, once, at the front
      expect(items[0].id).toBe(id);
      expect(items.filter((i) => i.id === id)).toHaveLength(1);
      expect(state.itemStatus(id)).toBe("open");
    });
});

/* The one grouping the rubric describes that is actually true of the build:
   logs group under their night in the day strip. nightOf is spot-checked in
   time.test.js; what is checked here is that it is a partition — every minute
   of a day belongs to exactly one night id, and the boundary is crossed once,
   at the plan's own wake time. Two flips in a day would put one shift's logs
   under two chips; zero would merge two nights into one. */
describe("nights partition the clock, which is what groups the day strip", () => {
  it.each(PROFILES)("%s: one boundary a day, at the wake time", (_n, p) => {
    const ph = calculateShiftPhases(p);
    const seen = [];
    for (let m = 0; m < DAY; m++) seen.push(nightOf(ph, new Date(2026, 7, 19, 0, m)).id);
    expect(new Set(seen).size).toBe(2);
    const flips = seen.filter((x, j) => j > 0 && x !== seen[j - 1]);
    expect(flips).toHaveLength(1);
    // wake is capped at the next shift start, so a long sleep cannot file the
    // first hour of a shift under the night before
    expect(seen.findIndex((x, j) => j > 0 && x !== seen[j - 1]))
      .toBe(Math.min(ph.sleepEnd, ph.start + DAY) % DAY);
  });
});
