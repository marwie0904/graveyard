import { DAY } from "./time.js";
import { calculateShiftPhases, calculateCaffeineCutoff, movementInterval } from "./planner.js";

/* An authored history, not a random one. Nights are stored as offsets from the
   user's own profile so the dataset follows whatever shift the quiz produced.
   `late` is minutes AFTER the computed cutoff, which is what makes a night
   count as late for any profile. Clean drinks are clamped below the cutoff for
   the same reason. */
const n = (dayOffset, sleepStartDelta, sleepHours, caffeine, late, moveDonePct, restKind, water, sleepyWindow, extra = {}) => ({
  dayOffset, sleepStartDelta, sleepHours, caffeine, late, moveDonePct, restKind, water, sleepyWindow,
  groggy: false, heavyMeal: false,
  screenStrain: 0, lateLightDone: true, ...extra,
});

export const MOCK_ROWS = [
  n(1,   10, 7.4, [25, 190],       null, 0.72, "nap",   3, "deep"),
  n(2,   55, 6.1, [30, 210],       45,   0.48, "none",  2, "late",  { screenStrain: 1 }),
  n(3,  -15, 7.9, [20, 160, 300],  null, 0.81, "quiet", 4, "mid"),
  n(4,   25, 7.1, [35, 240],       null, 0.66, "nap",   3, "deep",  { groggy: true }),
  n(5,   70, 5.9, [20, 180, 320],  60,   0.39, "none",  2, "deep"),
  n(6,    5, 7.6, [30, 200],       null, 0.75, "quiet", 4, "early"),
  n(7,  -25, 8.1, [25],            null, 0.88, "nap",   5, "mid"),
  n(8,   35, 6.9, [40, 220],       null, 0.61, "quiet", 3, "deep"),
  n(9,   80, 5.6, [25, 195, 340],  75,   0.35, "none",  1, "late",  { screenStrain: 1 }),
  n(10,  15, 7.3, [30, 175],       null, 0.70, "nap",   4, "deep"),
  n(11, -10, 7.8, [20, 150],       null, 0.79, "quiet", 4, "mid"),
  n(12,  40, 6.7, [35, 230],       null, 0.58, "none",  3, "deep",  { heavyMeal: true }),
  n(13,  65, 6.3, [30, 205],       40,   0.45, "quiet", 2, "late"),
  n(14,   0, 7.5, [25, 185],       null, 0.74, "nap",   4, "deep"),
  n(15,  20, 7.0, [30, 210, 310],  null, 0.64, "quiet", 3, "early"),
  n(16, -20, 8.3, [20],            null, 0.90, "nap",   5, "mid"),
  n(17,  75, 6.0, [35, 200],       55,   0.41, "none",  2, "deep",  { screenStrain: 1, lateLightDone: false }),
  n(18,  10, 7.2, [25, 170],       null, 0.69, "quiet", 4, "deep"),
  n(19,  30, 6.8, [40, 245],       null, 0.60, "nap",   3, "late",  { groggy: true }),
  n(20,  -5, 7.7, [20, 160],       null, 0.83, "quiet", 4, "mid"),
  n(21,  85, 5.5, [30, 215, 330],  90,   0.32, "none",  1, "late"),
  n(22,  15, 7.4, [25, 180],       null, 0.71, "nap",   4, "deep"),
  n(23,  45, 6.6, [35, 225],       null, 0.55, "none",  3, "deep",  { heavyMeal: true }),
  n(24, -15, 8.0, [20, 145],       null, 0.86, "quiet", 5, "early"),
  n(25,  25, 7.1, [30, 195],       null, 0.67, "nap",   3, "mid"),
  n(26,  60, 6.4, [25, 205],       35,   0.47, "quiet", 2, "late",  { screenStrain: 1 }),
  n(27,   5, 7.6, [30, 165],       null, 0.77, "nap",   4, "deep"),
  n(28,  35, 6.9, [40, 235],       null, 0.59, "none",  3, "deep"),
  n(29, -25, 8.2, [20],            null, 0.89, "quiet", 5, "mid"),
  n(30,  70, 6.0, [35, 210, 325],  65,   0.38, "none",  2, "late",  { lateLightDone: false }),
  n(31,  20, 7.3, [25, 175],       null, 0.73, "nap",   4, "deep"),
  n(32,   0, 7.9, [30, 155],       null, 0.82, "quiet", 4, "early"),
  n(33,  50, 6.5, [35, 240],       null, 0.53, "none",  3, "deep",  { heavyMeal: true }),
  n(34,  78, 5.8, [25, 200],       70,   0.36, "none",  1, "late",  { screenStrain: 1 }),
  n(35,  10, 7.5, [30, 185],       null, 0.76, "nap",   4, "deep"),
  n(36, -10, 8.1, [20, 150],       null, 0.87, "quiet", 5, "mid"),
  n(37,  40, 6.8, [40, 250],       null, 0.57, "quiet", 3, "deep"),
  n(38,  68, 6.2, [30, 195],       50,   0.43, "none",  2, "late"),
  n(39,  15, 7.2, [25, 180],       null, 0.70, "nap",   4, "deep",  { groggy: true }),
  n(40,  -5, 7.8, [30, 160],       null, 0.84, "quiet", 4, "early"),
  n(41,  30, 7.0, [35, 220],       null, 0.63, "nap",   3, "mid"),
  n(42,  48, 6.6, [40, 245],       null, 0.54, "none",  3, "deep",  { heavyMeal: true }),
  n(43,  82, 5.7, [25, 205, 335],  80,   0.34, "none",  1, "late",  { lateLightDone: false }),
  n(44,   8, 7.6, [30, 170],       null, 0.78, "quiet", 4, "deep"),
  n(45, -18, 8.0, [20, 140],       null, 0.85, "nap",   5, "mid"),
];

const clock = (abs) => ((Math.round(abs) % DAY) + DAY) % DAY;

export function materializeNights(profile) {
  const ph = calculateShiftPhases(profile);
  const cutoffAbs = calculateCaffeineCutoff(profile, ph);
  const gap = movementInterval(profile);
  const moveTotal = Math.max(1, Math.floor(ph.length / gap));

  return MOCK_ROWS.map((r) => {
    const sleepStartAbs = ph.sleepStart + r.sleepStartDelta;

    let caffeine = [];
    if (cutoffAbs !== null) {
      // Clamp planned drinks below the cutoff so "clean" stays clean even for
      // a high-sensitivity profile, whose cutoff lands much earlier.
      caffeine = r.caffeine.map((d) => clock(Math.min(ph.start + d, cutoffAbs - 30)));
      if (r.late !== null) caffeine.push(clock(cutoffAbs + r.late));
    }

    return {
      id: `mock-${r.dayOffset}`,
      dayOffset: r.dayOffset,
      sleepStart: clock(sleepStartAbs),
      wake: clock(sleepStartAbs + r.sleepHours * 60),
      sleepHours: r.sleepHours,
      sleepEstimated: false,
      cutoff: cutoffAbs === null ? null : clock(cutoffAbs),
      caffeine,
      moveDone: Math.round(moveTotal * r.moveDonePct),
      moveTotal,
      restKind: r.restKind,
      restMin: r.restKind === "nap" ? 20 : r.restKind === "quiet" ? 10 : 0,
      groggy: r.groggy,
      water: r.water,
      screenStrain: r.screenStrain,
      sleepyWindow: r.sleepyWindow,
      heavyMeal: r.heavyMeal,
      lateLightDone: r.lateLightDone,
      endShift: true,
    };
  });
}
