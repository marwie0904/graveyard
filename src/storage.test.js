import { describe, it, expect } from "vitest";
import { forNight } from "./storage.js";

describe("forNight", () => {
  const saved = {
    night: "2026-08-11",
    profile: { shiftStart: "22:00", shiftEnd: "07:00", sleepGoalHours: 7.5 },
    logs: [{ id: "caffeine-1", t: 1350, type: "caffeine", value: 1 }],
    reflection: { slept: "6-7h" },
    theme: true,
  };

  it("keeps the whole blob when the stamp is tonight", () => {
    expect(forNight(saved, "2026-08-11")).toEqual(saved);
  });

  it("keeps only the profile and the theme when the stamp is another night", () => {
    // last night's logs and reflection must not reach tonight's plan
    expect(forNight(saved, "2026-08-12")).toEqual({ profile: saved.profile, theme: true });
  });
});
