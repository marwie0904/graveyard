import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { DOMAIN } from "./tokens.js";

const read = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const app = read("App.jsx");
const planner = read("planner.js");
const stats = read("stats.js");

const rows = [...app.split("const REMINDERS = [")[1].split("\n];")[0]
  .matchAll(/\{ k: "(\w+)", l: "([^"]+)", cat: "(\w+)" \}/g)]
  .map((m) => ({ k: m[1], l: m[2], cat: m[3] }));

/* Every category generateTimeline can put an item in. */
const scheduled = new Set([...planner.matchAll(/category: "(\w+)"/g)].map((m) => m[1]));

describe("the reminders card", () => {
  it("lists rows", () => {
    expect(rows.length).toBeGreaterThan(0);
  });

  /* The row renders DOMAIN[r.cat].Icon unguarded, so a cat with no domain is
     not a missing icon, it is a white screen over the whole profile sheet. */
  it("only names domains that exist", () => {
    expect(rows.filter((r) => !DOMAIN[r.cat]).map((r) => r.l)).toEqual([]);
  });

  /* The card promises "turning one off keeps it on your plan", which is a lie
     for a row over something the plan never schedules. */
  it("only offers switches over things the plan actually schedules", () => {
    expect(rows.filter((r) => !scheduled.has(r.cat)).map((r) => r.l)).toEqual([]);
  });

  /* The inverse of the rule that emptied it. Light was cut for collapsing into
     one lateLightDone boolean, but collapsing into one measured field is the
     argument for one row, not for none: the plan schedules the two light
     nudges for everyone, and the record counts whether they were taken. */
  it("covers light, which the plan schedules and the record measures", () => {
    expect(stats).toMatch(/lateLightDone/);
    expect(scheduled.has("light")).toBe(true);
    expect(rows.filter((r) => r.cat === "light").map((r) => r.l)).not.toEqual([]);
  });
});
