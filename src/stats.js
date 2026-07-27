import { DAY, nightAxis } from "./time.js";
import {
  calculateShiftPhases, calculateCaffeineCutoff, movementInterval, caffeineHours, ov,
} from "./planner.js";
import { Moon, Coffee, Pulse, Bed, Car, Trophy, Lightning } from "./icons.jsx";
import { DOMAIN } from "./tokens.js";

/* ============================================================================
   STATS: fold one night, aggregate a range, read the patterns out of it.

   Everything here reads NightRecords, the shape src/mockNights.js produces and
   foldNight reproduces for tonight. Nothing here assumes a value is present:
   a night with no sleep logged carries sleepHours: null, and a null must never
   be averaged in as a zero.
============================================================================ */

export const RANGES = [
  { key: "today", label: "Today",    nights: 1,   inMore: false },
  { key: "3d",    label: "3 days",   nights: 3,   inMore: false },
  { key: "1w",    label: "1 week",   nights: 7,   inMore: false },
  { key: "2w",    label: "2 weeks",  nights: 14,  inMore: true  },
  { key: "1m",    label: "1 month",  nights: 30,  inMore: true  },
  { key: "all",   label: "All time", nights: 999, inMore: true  },
];

export const SLEEPY_LABEL = {
  early: "Early shift", mid: "Mid-shift", deep: "Deep night", late: "Last hours",
};

const BUCKET = { "Under 5h": 4.5, "5–6h": 5.5, "7–9h": 8, "Over 9h": 9.5 };
const WINDOW_FROM_REFLECTION = {
  "Early shift": "early", "Mid-shift": "mid", "Deep night": "deep", "Last hours": "late",
};

/** Average that drops nulls rather than counting them as zero. Returns null
    when nothing usable is left, so callers can say "no data" instead of "0". */
const avgOf = (arr, pick) => {
  const vals = arr.map(pick).filter((v) => v !== null && v !== undefined && !Number.isNaN(v));
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
};

/** Math.min/Math.max over [] return +/-Infinity, which used to reach the DOM
    as "Moved by about -Infinity hours". Every spread goes through here. */
const spanHours = (vals) =>
  vals.length ? (Math.max(...vals) - Math.min(...vals)) / 60 : null;

const isLateNight = (h) =>
  h.cutoff !== null && h.cutoff !== undefined &&
  h.caffeine.some((c) => nightAxis(c) >= nightAxis(h.cutoff));

/* ------------------------------- fold a night ----------------------------- */

/** Fold tonight's logs into the same shape the mock produces. Returns null
    when nothing has been logged, so callers can simply not append it. */
export function foldNight(profile, logs, reflection = {}) {
  if (!logs.length) return null;

  const ph = calculateShiftPhases(profile);
  const cutoffAbs = calculateCaffeineCutoff(profile, ph);
  const gap = movementInterval(profile);
  const of = (t) => logs.filter((l) => l.type === t);
  const clock = (abs) => ((Math.round(abs) % DAY) + DAY) % DAY;

  const sleepLog = of("sleepStart").slice(-1)[0] || null;
  const wakeLog = of("wake").slice(-1)[0] || null;

  let sleepHours = null;
  let sleepEstimated = false;
  if (sleepLog && wakeLog && wakeLog.t > sleepLog.t) {
    sleepHours = Math.round(((wakeLog.t - sleepLog.t) / 60) * 10) / 10;
  } else if (BUCKET[reflection.slept] !== undefined) {
    sleepHours = BUCKET[reflection.slept];
    sleepEstimated = true;
  }

  const items = of("item");
  const napLog = of("nap").slice(-1)[0] || null;
  const restKind = !napLog ? "none" : napLog.value === "quiet" ? "quiet" : "nap";

  return {
    id: "tonight",
    dayOffset: 0,
    sleepStart: sleepLog ? clock(sleepLog.t) : null,
    wake: wakeLog ? clock(wakeLog.t) : null,
    sleepHours,
    sleepEstimated,
    cutoff: cutoffAbs === null ? null : clock(cutoffAbs),
    caffeine: of("caffeine").map((l) => clock(l.t)),
    moveDone: items.filter((l) => l.value.status === "done" && l.value.category === "movement").length,
    moveTotal: Math.max(1, Math.floor(ph.length / gap)),
    restKind,
    restMin: restKind === "nap" ? 20 : restKind === "quiet" ? 10 : 0,
    groggy: napLog ? napLog.value === "groggy" : false,
    water: of("water").length,
    screenStrain: of("screen").length,
    sleepyWindow: WINDOW_FROM_REFLECTION[reflection.sleepiest] ?? null,
    heavyMeal: of("meal").some((l) => l.value === "heavy"),
    /* The plan's light-category items are the late-light reminders: light-down,
       light-early and eye-break. Completing any of them counts. */
    lateLightDone: items.some((l) => l.value.category === "light" && l.value.status === "done"),
  };
}

/* ------------------------------ aggregate a range ------------------------- */

export function rangeStats(profile, nights) {
  const n = nights.length;
  if (!n) {
    return {
      n: 0, avgSleep: null, lateCount: 0, avgClean: null, avgLate: null,
      spread: null, wakeDrift: null, movePct: null, moveDone: 0, moveTotal: 0,
      naps: 0, quiets: 0, missed: 0, groggy: 0, sleepyWindow: null,
      waterAvg: null, caffeineAvg: null, deepHeavy: 0,
      strain: 0, lateLightDone: 0,
    };
  }

  const lateNights = nights.filter(isLateNight);
  const cleanNights = nights.filter((h) => !isLateNight(h));

  const avgSleep = avgOf(nights, (h) => h.sleepHours);
  const avgClean = avgOf(cleanNights, (h) => h.sleepHours);
  const avgLate = avgOf(lateNights, (h) => h.sleepHours);

  const starts = nights.map((h) => h.sleepStart).filter((v) => v !== null && v !== undefined)
    .map(nightAxis);
  const wakes = nights.map((h) => h.wake).filter((v) => v !== null && v !== undefined)
    .map(nightAxis);

  const moveDone = nights.reduce((a, h) => a + (h.moveDone || 0), 0);
  const moveTotal = nights.reduce((a, h) => a + (h.moveTotal || 0), 0);
  /* A lone night with nothing marked yet is a shift that has only just
     started, not one where every reset was skipped. moveTotal is a fixed
     total for the whole shift, so at minute one it is already nonzero while
     nothing has actually come due; without a real percentage to report,
     movePct stays null rather than reading 0%. */
  const noneDueYet = n === 1 && moveDone === 0;

  /* The mode of the window each record actually carries. The old code derived
     this and then dropped it on the floor, which pinned the whole app to
     "early" forever. */
  const windows = ["early", "mid", "deep", "late"];
  const counts = windows.map((w) => nights.filter((h) => h.sleepyWindow === w).length);
  const top = Math.max(...counts);
  const sleepyWindow = top > 0 ? windows[counts.indexOf(top)] : null;

  return {
    n,
    avgSleep,
    lateCount: lateNights.length,
    avgClean,
    avgLate,
    spread: spanHours(starts),
    wakeDrift: spanHours(wakes),
    movePct: moveTotal && !noneDueYet ? Math.round((moveDone / moveTotal) * 100) : null,
    moveDone,
    moveTotal,
    naps: nights.filter((h) => h.restKind === "nap").length,
    quiets: nights.filter((h) => h.restKind === "quiet").length,
    missed: nights.filter((h) => h.restKind === "none").length,
    groggy: nights.filter((h) => h.groggy).length,
    sleepyWindow,
    waterAvg: avgOf(nights, (h) => h.water),
    caffeineAvg: avgOf(nights, (h) => (h.caffeine ? h.caffeine.length : null)),
    deepHeavy: nights.filter((h) => h.heavyMeal).length,
    strain: nights.reduce((a, h) => a + (h.screenStrain || 0), 0),
    lateLightDone: nights.filter((h) => h.lateLightDone).length,
  };
}

/* ------------------------------ pattern reading ---------------------------
   Descriptive, never accusatory. Nothing here says a behaviour caused an
   outcome; it says a pattern showed up and what the plan will do about it.
   Every line is one sentence, because these are read at 4am. */

export function readPatterns(profile, st) {
  const empty = st.n === 0;

  const sleepAvgLine =
    st.avgSleep === null ? "No sleep has been logged in this period yet, so there is no average to read."
    : st.avgSleep < 5 ? "Your recent sleep average sits in a high-fatigue range, so the plan will prioritise rest, an earlier caffeine cutoff, and sleep protection."
    : st.avgSleep < 7 ? "Your sleep average suggests some sleep pressure is building, so the plan will add extra rest and fatigue checks."
    : st.avgSleep <= 9 ? "Your sleep average is holding, so the plan will focus on protecting what is already working."
    : "Your sleep average is long in a way that often means recovery sleep, so the plan will track consistency and how rested you feel.";

  const sleepTiming =
    st.spread === null ? "No sleep starts have been logged in this period yet, so there is nothing to compare."
    : st.spread < 2 ? "Your sleep window stayed fairly consistent across this period."
    : st.spread < 4 ? "Your sleep window drifted across the period, so the plan will help protect a more stable sleep start."
    : "Sleep often started later than planned, which late caffeine, light, meals, or wind-down may all be feeding.";

  const wakeDrift =
    st.wakeDrift === null ? "No wake times have been logged in this period yet, so there is nothing to compare."
    : st.wakeDrift < 1.5 ? "Your wake times are fairly steady, which helps the planner keep your routine predictable."
    : st.wakeDrift < 3.5 ? "Your wake time is drifting, so the plan will watch for late caffeine, delayed meals, and skipped wind-down."
    : "Your wake time moved a lot across this period, so the plan may need flexible sleep protection rather than a rigid schedule.";

  const caffeine =
    profile.caffeine === "none" ? "No caffeine prompts are part of your plan, so this chart stays empty unless you log some."
    : empty ? "No caffeine has been logged in this period yet."
    : st.lateCount === 0 ? "Caffeine stayed inside your planned window, so keep using the cutoff as your sleep boundary."
    : st.lateCount <= st.n * 0.25 ? `Caffeine crossed your cutoff on ${st.lateCount} of ${st.n} nights, so the plan will add earlier reminders and water swaps.`
    : "Caffeine crossed your cutoff often, which may be one reason your sleep window is harder to protect.";

  const movement =
    /* One night with nothing marked yet is a shift that has barely started, not
       a shift where resets were skipped. movePct is null in this case too, so
       the Tile reads "-" rather than a premature 0%. */
    st.n === 1 && st.moveDone === 0 ? "Tonight has only just started, so there are no resets to read yet."
    : st.movePct === null ? "No movement resets have been logged in this period yet."
    : profile.breakControl === "low" || profile.breakControl === "unpredictable"
      ? `${st.movePct}% of resets were completed, and since breaks are hard to control the plan uses 30 to 60 second micro-resets.`
    : st.movePct >= 70 ? "You completed most movement resets, so the plan will keep the current reset frequency."
    : st.movePct >= 40 ? "You completed some resets, so the plan may group them around natural break times."
    : "Resets were often skipped, so the plan will make the next ones shorter and more desk-friendly.";

  const rest =
    empty ? "No rest blocks have been logged in this period yet."
    : st.groggy >= 3 ? "You felt groggy after some rests, so the plan will add a wake-up buffer or shorten them."
    : st.quiets > st.naps ? "Quiet rest is your main recovery tool, so the plan will keep rest blocks short and easy to finish."
    : st.missed > st.n * 0.5 ? "Rest blocks were often skipped, so the plan can switch some naps to shorter quiet resets."
    : "Your rest blocks were used consistently, so the plan will keep them in the same window.";

  const fatigue = {
    early: "Sleepiness often started early, so the plan will check pre-shift sleep, food, and caffeine timing.",
    mid: "Sleepiness often appeared mid-shift, so the plan will add movement, water, and rest before this window.",
    deep: "Sleepiness clustered in the deep-night window, so the plan will protect your rest block.",
    late: "Sleepiness often appeared near the end of the shift, so the plan will keep caffeine away from your sleep window and focus on safety, movement, and wind-down.",
  }[st.sleepyWindow] ?? "No sleepiest window has been recorded in this period yet.";

  const foodHydration =
    empty ? "No food or water has been logged in this period yet."
    : st.deepHeavy > st.n * 0.3 ? "Heavy meals often landed in the deep-night window, so the plan will move food prompts earlier where possible."
    : st.waterAvg !== null && st.caffeineAvg !== null && st.waterAvg < st.caffeineAvg
      ? "Caffeine was logged more often than water, so the plan will add water swaps after caffeine."
    : "Food and water stayed roughly on plan, so the plan will keep reminders light.";

  const light =
    empty ? "No light or screen care has been logged in this period yet."
    : st.strain > st.n * 0.35 ? "Screen strain showed up often, so the plan will add more eye breaks and screen comfort checks."
    : st.lateLightDone < st.n * 0.4 ? "Late-light reminders were often skipped, so the plan will simplify them to lower brightness, a warmer display, and fewer unnecessary screens."
    : "You often completed the late-light reminders, so the plan will keep protecting your sleep window this way.";

  /* main pattern: prefer a relationship over a bare number, and never claim a
     relationship from fewer nights than could possibly show one */
  const canCompare = st.n >= 5 && st.avgClean !== null && st.avgLate !== null;
  let mainPattern;
  if (canCompare && st.avgClean - st.avgLate > 0.4) {
    mainPattern = `You slept ${st.avgLate.toFixed(1)}h on nights when caffeine crossed the cutoff, against ${st.avgClean.toFixed(1)}h when it did not.`;
  } else if (st.n < 5) {
    mainPattern = `${st.n} ${st.n === 1 ? "night" : "nights"} on record, and patterns need about a week to show up.`;
  } else if (st.movePct !== null && st.movePct < 40) {
    mainPattern = "Movement resets dropped off through this period.";
  } else if (st.sleepyWindow !== null) {
    mainPattern = `Sleepiness clustered in the ${SLEEPY_LABEL[st.sleepyWindow].toLowerCase()} window.`;
  } else {
    mainPattern = "Nothing has separated itself from the rest of this period yet.";
  }

  /* two or three noticed items, strongest first, never more */
  const noticed = [];
  if (canCompare && st.avgClean - st.avgLate > 0.4) {
    noticed.push("You slept longer on nights when caffeine stayed before the cutoff.");
  }
  if (st.movePct !== null && st.movePct < 60) {
    noticed.push("Movement resets were skipped most often in the second half of the shift.");
  }
  if (st.sleepyWindow === "deep") {
    noticed.push("Sleepiness was most common during the deep night, so the plan will protect your rest block.");
  }
  if (st.sleepyWindow === "late") {
    noticed.push("Sleepiness clustered near the end of your shifts, where the commute also sits.");
  }
  if (st.wakeDrift !== null && st.wakeDrift >= 3) {
    noticed.push("Your wake time drifted later across the period, so the plan will strengthen wind-down reminders.");
  }
  if (!empty && st.deepHeavy > st.n * 0.3) {
    noticed.push("Heavy meals were logged close to sleep on several nights, so the plan will move food prompts earlier.");
  }
  if (!noticed.length) {
    noticed.push("Nothing stood out this period, so the plan will keep its current shape.");
  }

  /* one concrete adjustment the user can accept or decline */
  let adjustment;
  if (!empty && st.lateCount > st.n * 0.2 && profile.caffeine !== "none") {
    adjustment = {
      text: "The next plan will move your final caffeine reminder an hour earlier and add a water swap after your last planned drink.",
      apply: (pr) => ({ ...pr, overrides: { ...(pr.overrides || {}), caffeineHours: caffeineHours(pr) + 1 } }),
      done: "Caffeine cutoff moved an hour earlier.",
    };
  } else if (st.avgSleep !== null && st.avgSleep < 6) {
    adjustment = {
      text: "The next plan will start wind-down earlier and keep late-shift stimulation lower.",
      apply: (pr) => ({ ...pr, overrides: { ...(pr.overrides || {}), windDownLead: ov(pr, "windDownLead", 30) + 15 } }),
      done: "Wind-down starts 15 minutes earlier.",
    };
  } else if (st.movePct !== null && st.movePct < 50) {
    adjustment = {
      text: "The next plan will use shorter, desk-friendly resets so they are easier to finish.",
      apply: (pr) => ({ ...pr, overrides: { ...(pr.overrides || {}), moveLength: 2 } }),
      done: "Resets shortened to two minutes.",
    };
  } else if (st.sleepyWindow === "late") {
    adjustment = {
      text: "The next plan will move your fatigue check-in to the last part of the shift and add a late safety check.",
      apply: (pr) => ({ ...pr, sleepiestTime: "end" }),
      done: "Fatigue check-in moved to the late shift.",
    };
  } else if (!empty && st.strain > st.n * 0.35) {
    adjustment = {
      text: "The next plan will start light reduction earlier and add more eye breaks.",
      apply: (pr) => ({ ...pr, overrides: { ...(pr.overrides || {}), lightDownLead: ov(pr, "lightDownLead", 90) + 30 } }),
      done: "Light reduction starts 30 minutes earlier.",
    };
  } else {
    adjustment = {
      text: "Nothing needs changing yet, so the plan will keep its current timing and keep watching.",
      apply: null, done: null,
    };
  }

  return {
    sleepAvgLine, sleepTiming, wakeDrift, caffeine, movement, rest, fatigue,
    foodHydration, light, mainPattern, noticed: noticed.slice(0, 3), adjustment,
  };
}

/* ------------------------------- achievements ----------------------------- */

/** Earn-only. Nothing here can be lost, and nothing shows a streak count,
    because a counter that resets is a punishment mechanic and this app does
    not have one. */
export function achievements(profile, logs, nights) {
  const count = (t) => logs.filter((l) => l.type === t).length;
  const movesDone = logs.filter(
    (l) => l.type === "item" && l.value.status === "done" && l.value.category === "movement"
  ).length;
  const cleanNights = nights.filter((h) => !isLateNight(h)).length;

  return [
    { key: "first", Icon: Moon, hue: DOMAIN.sleep.hue, l: "First night",
      d: "You logged a night. That is the part most people skip.",
      got: nights.length > 0 },
    { key: "week", Icon: Trophy, hue: DOMAIN.recovery.hue, l: "A full week",
      d: "Seven nights on record. Patterns need this much to show up.",
      got: nights.length >= 7 },
    { key: "early", Icon: Coffee, hue: DOMAIN.caffeine.hue, l: "Stopped early",
      d: "Three nights where every cup landed before your cutoff.",
      got: cleanNights >= 3 },
    { key: "hard", Icon: Lightning, hue: DOMAIN.light.hue, l: "Hard night",
      d: "You worked a night on under five hours of sleep and came back.",
      got: nights.some((h) => h.sleepHours !== null && h.sleepHours < 5) },
    { key: "rest", Icon: Bed, hue: DOMAIN.sleep.hue, l: "Took the rest",
      d: "You used a planned rest instead of pushing through.",
      got: count("nap") > 0 || nights.some((h) => h.restMin > 0) },
    { key: "home", Icon: Car, hue: DOMAIN.recovery.hue, l: "Home safe",
      d: "You ran the end-of-shift check before heading home.",
      got: count("endShift") > 0 },
    { key: "reset", Icon: Pulse, hue: DOMAIN.movement.hue, l: "Reset habit",
      d: "Five movement resets completed. Small ones count.",
      got: movesDone >= 5 },
  ];
}
