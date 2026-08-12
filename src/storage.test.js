import { describe, it, expect } from "vitest";
import { forNight, archived } from "./storage.js";

/* The full profile shape, not the three fields the old fixture carried:
   archived calls foldNight, which calls calculateShiftPhases, which throws on
   toMin(undefined) for a missing plannedSleep. This is the shape stats.test.js
   already uses. */
const profile = {
  shiftStart: "22:00", shiftEnd: "06:00", plannedSleep: "07:30",
  sleepGoalHours: 7, caffeine: "moderate", caffeineSensitivity: "normal",
  nap: "both", movement: "mixed", lightEnv: "bright",
  commute: "drive", sleepiestTime: "deep", overrides: {},
};

const saved = {
  night: "2026-08-11",
  profile,
  logs: [{ id: "caffeine-1", t: 1350, type: "caffeine", value: 1 }],
  reflection: { slept: "Under 5h" },
  theme: true,
  archive: [{ id: "2026-08-10" }],
};

describe("forNight", () => {
  it("keeps the whole blob when the stamp is tonight", () => {
    expect(forNight(saved, "2026-08-11")).toEqual(saved);
  });

  it("folds last night away, keeping the profile, the theme and the archive", () => {
    // logs and reflection must not survive; the archive must, one night longer
    const out = forNight(saved, "2026-08-12");
    expect(Object.keys(out).sort()).toEqual(["archive", "profile", "theme"]);
    expect(out.archive).toHaveLength(2);
  });
});

describe("archived", () => {
  it("stamps the record with the night it was, and drops dayOffset", () => {
    // a stored dayOffset is relative to tonight, so it is wrong by morning and
    // would match every archived night against the strip's "Today" chip
    const [rec] = archived(saved);
    expect(rec.id).toBe("2026-08-11");
    expect(rec).not.toHaveProperty("dayOffset");
  });

  it("puts the night just folded at the front, newest first", () => {
    expect(archived(saved).map((r) => r.id)).toEqual(["2026-08-11", "2026-08-10"]);
  });

  it("archives nothing for a night with neither logs nor a reflection", () => {
    // the gap in the id sequence is the only trace an unworked night gets
    expect(archived({ ...saved, logs: [], reflection: {} })).toEqual(saved.archive);
  });

  it("archives a night that was only reflected on", () => {
    // the reflection Selects write no log entry, so logs alone is not the test
    const [rec] = archived({ ...saved, logs: [] });
    expect(rec.id).toBe("2026-08-11");
    expect(rec.sleepHours).toBe(4.5);
  });

  it("archives nothing when there is no night to name the record", () => {
    // a blob written before the field existed, or a truncated write
    const { night, ...unnamed } = saved;
    expect(archived(unnamed)).toEqual(saved.archive);
  });
});
