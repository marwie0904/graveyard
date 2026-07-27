import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Moon, Coffee, Activity, Heart, Clock, Check,
  ChevronRight, ChevronLeft, Plus, Wind, Eye, Bed, Car, ArrowRight, ArrowLeft,
  X, ListChecks, Info, Zap, Sunrise, Footprints, Sparkles, RotateCcw, Pencil,
  User, Download, Bell, Trophy, Target, BarChart3, FileText, Palette,
  HelpCircle, Lock, Smile, ChevronDown, Play,
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, ComposedChart, XAxis, YAxis,
  ResponsiveContainer, Cell, CartesianGrid,
} from "recharts";
import { DAY, toMin, fmt, nextAfter, overlap, dur, nightAxis, nightTick } from "./time.js";
import { FONT_DISPLAY, FONT_TEXT, WARM, DARK, DOMAIN, tint } from "./tokens.js";

/* ============================================================================
   GRAVEYARD — a planner for the night shift
   quiz -> generated timeline -> live shift mode with adaptive logging -> reflection

   ARCHITECTURE NOTE
   Logs are the only mutable state. The timeline is a pure function of
   (profile, logs, now) and is recomputed on every render. Nothing is stored
   and mutated, so undo is free and every adaptation is traceable.
============================================================================ */

/* ----------------------------- planner functions -------------------------- */

/**
 * Phases are a partition of the plan: every minute belongs to exactly one.
 * The circadian low is NOT a phase — it is an overlay laid on top of whichever
 * phases it intersects, so shifts that never touch 02:00–05:00 simply have none.
 */
function calculateShiftPhases(profile) {
  const start = toMin(profile.shiftStart);
  let end = toMin(profile.shiftEnd);
  if (end <= start) end += DAY;
  const length = end - start;

  const sleepStart = nextAfter(end, toMin(profile.plannedSleep));
  const sleepEnd = sleepStart + profile.sleepGoalHours * 60;

  const phases = [
    { key: "pre",   label: "Pre-shift",     from: start - 180, to: start },
    { key: "early", label: "Early shift",   from: start, to: start + length * 0.25 },
    { key: "mid",   label: "Mid-shift",     from: start + length * 0.25, to: start + length * 0.75 },
    { key: "late",  label: "Late shift",    from: start + length * 0.75, to: end },
    { key: "post",  label: "Post-shift",    from: end, to: sleepStart },
    { key: "sleep", label: "Sleep",         from: sleepStart, to: sleepEnd },
  ];

  // circadian low overlay: clock 02:00–05:00, intersected with the shift
  let deepNight = null;
  for (let d = -1; d <= 2; d++) {
    const w = overlap([start, end], [d * DAY + 120, d * DAY + 300]);
    if (w && (!deepNight || w[1] - w[0] > deepNight[1] - deepNight[0])) deepNight = w;
  }

  // when there is no overlap, the hardest stretch falls back to the late shift,
  // since sleepiness on a night shift often peaks toward the end regardless
  const hardest = deepNight || [start + length * 0.75, end];
  // callers may override the fallback with the user's reported sleepiest time

  return { start, end, length, sleepStart, sleepEnd, phases, deepNight, hardest };
}

function determineCurrentPhase(now, ph) {
  const found = ph.phases.find((p) => now >= p.from && now < p.to);
  const phase = found || (now < ph.phases[0].from
    ? { key: "before", label: "Before plan" }
    : { key: "after", label: "Day off" });
  return { phase, inDeepNight: !!ph.deepNight && now >= ph.deepNight[0] && now < ph.deepNight[1] };
}

function caffeineHours(profile) {
  let hours = { low: 5, normal: 6, high: 8 }[profile.caffeineSensitivity] ?? 6;
  if (profile.sleepGoalHours <= 5) hours += 1; // short sleep -> protect it harder
  return ov(profile, "caffeineHours", hours);
}

function calculateCaffeineCutoff(profile, ph) {
  if (profile.caffeine === "none") return null;
  return ph.sleepStart - caffeineHours(profile) * 60;
}

function movementInterval(profile) {
  let base = 150;
  if (profile.sedentary === "most" || profile.sedentary === "desk") base = 90;
  else if (profile.sedentary === "some") base = 120;
  return ov(profile, "moveGap", base);
}

/* ------------------------- adjustable plan variables ----------------------
   Every number the planner uses has a default derived from the quiz, and can be
   overridden per user. Overrides live on the profile, so the timeline stays a
   pure function of (profile, logs, now) and every card can be tuned in place. */

const ADJUSTABLE = {
  preMealLead:   { l: "Meal before shift", unit: "min before shift start", min: 30, max: 300, step: 15 },
  preNapLead:    { l: "Nap before shift", unit: "min before shift start", min: 30, max: 240, step: 15 },
  hydrateLead:   { l: "Fill your bottle", unit: "min before shift start", min: 0, max: 180, step: 15 },
  caffeineOpen:  { l: "Window opens", unit: "min after shift start", min: 0, max: 180, step: 10 },
  caffeineHours: { l: "Stop caffeine", unit: "hours before sleep", min: 3, max: 10, step: 0.5, decimals: 1 },
  moveGap:       { l: "A reset every", unit: "minutes", min: 30, max: 180, step: 15 },
  moveLength:    { l: "Reset length", unit: "minutes", min: 1, max: 10, step: 1 },
  restLength:    { l: "Rest length", unit: "minutes", min: 10, max: 45, step: 5 },
  napBuffer:     { l: "Wake-up buffer", unit: "minutes after rest", min: 10, max: 45, step: 5 },
  lightUpLead:   { l: "Bright light from", unit: "min after shift start", min: 0, max: 180, step: 15 },
  lightDownLead: { l: "Start dimming", unit: "min before shift end", min: 30, max: 240, step: 15 },
  snackLead:     { l: "Planned snack", unit: "min after shift start", min: 60, max: 480, step: 15 },
  foodLateLead:  { l: "Keep food light from", unit: "min before shift end", min: 15, max: 180, step: 15 },
  windDownLead:  { l: "Wind-down starts", unit: "min before shift end", min: 0, max: 150, step: 15 },
  sleepPrepLead: { l: "Sleep prep", unit: "min before sleep", min: 10, max: 120, step: 10 },
  waterGap:      { l: "Nudge me after", unit: "minutes without water", min: 30, max: 240, step: 15 },
  eyeBreakSecs:  { l: "Eye break", unit: "seconds", min: 10, max: 60, step: 5 },
};

/** Read an override if the user set one, otherwise use the derived default. */
const ov = (profile, key, fallback) => {
  const v = (profile.overrides || {})[key];
  return v === undefined || v === null ? fallback : v;
};

/** Where the user says the night gets hardest, used to place the fatigue check-in. */
function sleepiestWindow(profile, ph) {
  const at = {
    start: ph.start + 30,
    middle: ph.start + ph.length * 0.5,
    deep: ph.deepNight ? ph.deepNight[0] + 30 : ph.start + ph.length * 0.6,
    end: ph.end - 60,
    varies: ph.start + ph.length * 0.6,
  }[profile.sleepiestTime];
  return Math.round(at ?? ph.start + ph.length * 0.6);
}

/* --------------------------- derived state from logs ---------------------- */

function deriveState(profile, logs, now, ph) {
  const cutoff = calculateCaffeineCutoff(profile, ph);
  const of = (t) => logs.filter((l) => l.type === t);

  const caffeineLogs = of("caffeine");
  const lateCaffeine = cutoff ? caffeineLogs.some((l) => l.t >= cutoff) : false;
  const nearCutoff = cutoff
    ? caffeineLogs.some((l) => l.t >= cutoff - 60 && l.t < cutoff)
    : false;

  const water = of("water");
  const lastWater = water.length ? Math.max(...water.map((l) => l.t)) : null;
  const waterGapMins = ov(profile, "waterGap", 90);
  const waterGap = lastWater !== null && now - lastWater > waterGapMins && now >= ph.start && now < ph.end;

  const itemLogs = of("item");
  const skippedMovement = itemLogs.filter(
    (l) => l.value.status === "skipped" && l.value.category === "movement"
  ).length;

  const wake = of("wake")[0] || null;
  const quality = of("sleepQuality").slice(-1)[0] || null;

  const endShift = of("endShift").length > 0;
  const sleepStarted = of("sleepStart").length > 0;

  const sleepProtection =
    endShift || lateCaffeine || (cutoff !== null && now >= cutoff) || now >= ph.phases[3].from;

  return {
    cutoff,
    caffeineLogs,
    lateCaffeine,
    nearCutoff,
    waterCount: water.length,
    lastWater,
    waterGap,
    waterGapMins,
    skippedMovement,
    napTaken: of("nap").some((l) => l.value !== "couldnt"),
    napFailed: of("nap").some((l) => l.value === "couldnt"),
    napGroggy: of("nap").some((l) => l.value === "groggy"),
    mealSkipped: of("meal").some((l) => l.value === "skipped"),
    heavyMeal: of("meal").find((l) => l.value === "heavy") || null,
    screenStrain: of("screen").length > 0,
    lastScreen: of("screen").length ? Math.max(...of("screen").map((l) => l.t)) : null,
    sleepy: of("sleepy"),
    stress: of("stress"),
    wokeEarly: wake ? wake.value === "earlier" : false,
    wokeLate: wake ? wake.value === "later" : false,
    poorSleep: quality ? quality.value === "poor" : false,
    endShift,
    sleepStarted,
    itemStatus: (id) => {
      const l = itemLogs.filter((x) => x.value.id === id).slice(-1)[0];
      return l ? l.value.status : "open";
    },
  };
}

/* ------------------------------ timeline builder -------------------------- */

function generateTimeline(profile, logs, now) {
  const ph = calculateShiftPhases(profile);
  const s = deriveState(profile, logs, now, ph);
  const items = [];
  const add = (o) => items.push(o);

  const canNapBefore = profile.nap === "before" || profile.nap === "both";
  const canNapDuring = profile.nap === "during" || profile.nap === "both";
  const microOnly = profile.breakControl === "low"
    || profile.breakControl === "unpredictable"
    || profile.sedentary === "desk";

  /* ---------- pre-shift ---------- */
  if (!s.wokeLate) {
    add({
      id: "pre-meal", at: ph.start - ov(profile, "preMealLead", 150), category: "food",
      adjust: [{ key: "preMealLead", def: 150 }],
      title: "Pre-shift meal",
      msg: "Eat your main meal now.",
      why: "Digestion slows overnight. Eating your largest meal before the shift means you are not relying on heavy food during the hours when it sits worst and interferes with sleep afterward.",
      actions: ["done", "skip", "adjust"],
    });
  } else {
    add({
      id: "pre-min", at: ph.start - 60, category: "food",
      title: "Short pre-shift routine",
      msg: "Eat something, fill a water bottle, get set up. That is all.",
      why: "When time is short, the three things that matter most are food, water, and a workspace you are not fighting.",
      changed: "Trimmed to essentials because you woke later than planned.",
      actions: ["done", "skip"],
    });
  }

  if (canNapBefore && (profile.sleepGoalHours <= 6 || s.wokeEarly || s.poorSleep)) {
    add({
      id: "pre-nap", at: ph.start - ov(profile, "preNapLead", 120), category: "sleep",
      adjust: [{ key: "preNapLead", def: 120 }, { key: "restLength", def: 25 }],
      title: s.napFailed ? "Quiet rest before shift" : "Pre-shift nap",
      msg: `${ov(profile, "restLength", 25)} minutes, ${s.napFailed ? "dim room, no screen, eyes closed" : "alarm set"}.`,
      why: "Sleeping less than about six hours before a night shift means starting with a deficit. A short nap now takes pressure off the deep-night hours, when that deficit is felt most.",
      changed: s.wokeEarly
        ? "Added because you woke earlier than planned, so sleep may have been short."
        : s.napFailed
        ? "Swapped from a nap to quiet rest because you could not sleep."
        : undefined,
      actions: ["done", "skip", "adjust"],
    });
  }

  add({
    id: "hydrate-start", at: ph.start - ov(profile, "hydrateLead", 45), category: "water",
    adjust: [{ key: "hydrateLead", def: 45 }],
    title: "Start hydration",
    msg: "Fill your bottle now.",
    why: "Drinking steadily from the start means fewer large drinks late, which is what usually causes bathroom trips that break up your sleep.",
    actions: ["done", "skip"],
  });

  add({
    id: "shift-start", at: ph.start, category: "shift",
    title: "Shift starts",
    msg: `Your plan runs ${fmt(ph.start)} to ${fmt(ph.end)}, with sleep protected from ${fmt(ph.sleepStart)}.`,
    actions: ["done"],
  });

  /* ---------- caffeine ---------- */
  if (profile.caffeine !== "none" && !s.lateCaffeine) {
    add({
      id: "caff-window", at: ph.start + ov(profile, "caffeineOpen", 20), category: "caffeine",
      adjust: [{ key: "caffeineOpen", def: 20 }, { key: "caffeineHours", def: caffeineHours(profile) }],
      title: "Best caffeine window",
      msg: `Clear of your sleep window. Last call is ${fmt(s.cutoff)}.`,
      why: "Caffeine is a short-term alertness tool, not a substitute for sleep. Used early it costs you nothing; used late it is still active when you are trying to fall asleep.",
      actions: ["logCaffeine", "skip", "adjust"],
    });
    if (profile.caffeine === "high") {
      add({
        id: "caff-swap", at: ph.start + ph.length * 0.4, category: "water",
        title: "Water swap",
        msg: "Try water first. Give it fifteen minutes.",
        why: "Mild dehydration feels a lot like fatigue, so the urge for another cup is often thirst. Fifteen minutes is long enough to tell the difference.",
        actions: ["done", "skip"],
      });
    }
  }
  if (s.cutoff) {
    add({
      id: "caff-cutoff", at: s.cutoff, category: "caffeine",
      adjust: [{ key: "caffeineHours", def: caffeineHours(profile) }],
      title: s.lateCaffeine ? "Caffeine is off the plan" : "Last caffeine cutoff",
      msg: s.lateCaffeine
        ? "The rest of tonight runs on water, movement, and lower light instead."
        : "Switch to water. Alertness from here comes from movement, light, and pacing.",
      why: `Caffeine takes hours to clear. Stopping now leaves enough time for it to fade before your sleep window opens at ${fmt(ph.sleepStart)}.`,
      changed: s.lateCaffeine
        ? "The plan switched to sleep protection because you logged caffeine inside the protected window."
        : undefined,
      actions: ["done", "adjust"],
    });
  }

  /* ---------- movement ---------- */
  const gap = movementInterval(profile);
  let n = 0;
  for (let t = ph.start + gap; t < ph.end - 20; t += gap) {
    n += 1;
    const shortened = s.skippedMovement >= 1;
    const desk = microOnly || s.skippedMovement >= 2;
    add({
      id: `move-${n}`, at: Math.round(t), category: "movement",
      adjust: [{ key: "moveGap", def: gap }, { key: "moveLength", def: 3 }],
      title: desk ? "60-second desk reset" : shortened ? "Short movement reset" : "Micro-care reset",
      msg: desk
        ? "Sit tall, roll your shoulders, unclench your jaw, stretch your wrists, look away from the screen for twenty seconds."
        : shortened
        ? "Ninety seconds. Stand, roll your shoulders, stretch your wrists, sip water."
        : `${ov(profile, "moveLength", 3)} minutes. Stand, stretch neck and shoulders, sip water, rest your eyes.`,
      why: "Long unbroken sitting adds stiffness and drowsiness on top of the fatigue the night is already causing. Short and frequent beats long and occasional, because it is the one you will actually do.",
      changed: s.skippedMovement >= 2
        ? "Shortened to a desk version because you skipped recent resets."
        : shortened
        ? "Shortened because you skipped the last one."
        : undefined,
      actions: ["done", "skip", "adjust"],
    });
  }

  /* ---------- light ---------- */
  add({
    id: "light-early", at: ph.start + ov(profile, "lightUpLead", 30), category: "light",
    adjust: [{ key: "lightUpLead", def: 30 }],
    title: "Alertness lighting",
    msg: profile.lightEnv === "dim"
      ? "If you can safely add a brighter lamp for the first few hours, it may help."
      : "Keep your workspace bright for the first part of the shift.",
    why: "Bright light early in the shift is one of the few alertness tools that costs nothing later. The same light close to your sleep window would work against you, which is why it is timed rather than constant.",
    actions: ["done", "skip", "adjust"],
  });
  add({
    id: "light-down", at: ph.end - ov(profile, "lightDownLead", 90), category: "light",
    adjust: [{ key: "lightDownLead", def: 90 }],
    title: "Start reducing light",
    msg: "Drop screen brightness, switch to a warmer display, turn off lighting you do not need.",
    why: "Light close to bedtime tells your body it is daytime and makes falling asleep harder. Cutting it early gives you a head start on a sleep window that already fights daylight.",
    actions: ["done", "skip"],
  });

  /* ---------- food ---------- */
  const snackDef = Math.round(ph.length * 0.45);
  const snackAt = s.heavyMeal ? s.heavyMeal.t + 150 : ph.start + ov(profile, "snackLead", snackDef);
  add({
    id: "snack", at: Math.round(snackAt), category: "food",
    adjust: [{ key: "snackLead", def: snackDef }],
    title: "Planned snack",
    msg: s.heavyMeal
      ? "Water and light movement first. Food later."
      : "Something small and planned. Protein plus fruit is enough.",
    why: "Deciding in advance is the point. Grazing through the night usually means eating more, later, and heavier than you meant to, all of which lands on your sleep.",
    changed: s.heavyMeal
      ? "Pushed later because you logged a heavy meal during the night."
      : s.mealSkipped
      ? "Added because you skipped a meal earlier."
      : undefined,
    actions: ["done", "skip", "adjust"],
  });
  add({
    id: "food-late", at: ph.end - ov(profile, "foodLateLead", 60), category: "food",
    adjust: [{ key: "foodLateLead", def: 60 }],
    title: "Keep late food light",
    msg: "If you are hungry, keep it small.",
    why: "A heavy meal shortly before sleep keeps digestion working while you are trying to rest, and tends to make the sleep you do get lighter.",
    actions: ["done", "skip"],
  });

  /* ---------- deep night ---------- */
  if (ph.deepNight) {
    add({
      id: "deep-warn", at: ph.deepNight[0], category: "recovery",
      title: "Entering the hardest stretch",
      msg: `Alertness bottoms out between ${fmt(ph.deepNight[0])} and ${fmt(ph.deepNight[1])}. Slow down and pace your tasks.`,
      why: "Your body clock runs a low point in these hours whether or not you slept well. Sleepiness and mistakes cluster here, so the plan asks less of you rather than more.",
      actions: ["done"],
    });
    const restAt = Math.round((ph.deepNight[0] + ph.deepNight[1]) / 2 - 20);
    add({
      id: "deep-rest", at: restAt, category: "sleep",
      adjust: [{ key: "restLength", def: s.napGroggy ? 15 : 20 }],
      title: canNapDuring && !s.napFailed ? "Nap or quiet rest" : "Quiet rest",
      msg: canNapDuring && !s.napFailed
        ? `${ov(profile, "restLength", s.napGroggy ? 15 : 20)} minutes, alarm set.`
        : "Sit back, close your eyes, slow your breathing for five minutes.",
      why: "Short rest is kept short on purpose. Past roughly half an hour you risk waking from deeper sleep, which leaves you groggier than before you lay down.",
      changed: s.napGroggy
        ? "Shortened because you reported grogginess after a previous rest."
        : s.napFailed
        ? "Swapped to quiet rest because you could not nap."
        : undefined,
      actions: ["logNap", "skip", "adjust"],
    });
    if (s.napTaken) {
      const napLog = logs.filter((l) => l.type === "nap").slice(-1)[0];
      add({
        id: "nap-buffer", at: napLog.t + ov(profile, "napBuffer", s.napGroggy ? 30 : 20), category: "water",
        adjust: [{ key: "napBuffer", def: s.napGroggy ? 30 : 20 }],
        title: "Wake-up buffer",
        msg: "Water and gentle movement before anything that needs focus.",
        why: "Grogginess right after waking is normal and temporary. A buffer keeps you from making decisions during the part of it you will not notice.",
        changed: "Added after the rest you logged.",
        actions: ["done", "skip"],
      });
    }
  } else {
    add({
      id: "hard-warn", at: ph.hardest[0], category: "recovery",
      title: "Hardest stretch ahead",
      msg: "Pace your tasks from here.",
      why: "Your shift misses the usual 2:00 AM to 5:00 AM low, but sleepiness on a night shift still builds toward the end. The last quarter is where it shows up for you.",
      actions: ["done"],
    });
  }

  /* ---------- fatigue check-in, placed where the user says it bites ---------- */
  const risky = s.poorSleep || s.wokeEarly || profile.sleepGoalHours <= 5;
  add({
    id: "checkin-1", at: sleepiestWindow(profile, ph), category: "recovery",
    title: "Fatigue check-in",
    msg: "How are you doing?",
    why: {
      start: "You said the start of the shift is when you feel it most, so the check-in sits early rather than in the middle.",
      middle: "You said the middle of the shift is where sleepiness hits, so the check-in is placed there rather than at the usual low point.",
      deep: "You said 2 to 5 AM is your worst stretch, which lines up with the body clock low point.",
      end: "You said the end of the shift is hardest. That is also when the commute happens, so this check-in feeds the safety handling.",
      varies: "Your sleepiest time changes, so this sits in the back half of the shift where it is most often reported.",
    }[profile.sleepiestTime] || "Fatigue is easier to work with when it is caught early.",
    changed: risky ? "Weighted heavier because your sleep was short or poor." : undefined,
    actions: ["done", "skip"],
  });

  /* ---------- wind-down and after ---------- */
  const windDef = ph.sleepStart - ph.end <= 60 ? 30 : 15;
  const windAt = ph.end - ov(profile, "windDownLead", windDef);
  add({
    id: "winddown", at: windAt, category: "sleep",
    adjust: [{ key: "windDownLead", def: windDef }],
    title: "Wind-down begins",
    msg: "Lower the light, no new caffeine, slow the pace of what you are doing.",
    why: "Going straight from a working night to bed rarely works. A deliberate slowdown gives your body a signal it can act on before you are lying in the dark waiting.",
    changed: ph.sleepStart - ph.end <= 60
      ? "Started before your shift ends because you sleep soon after work."
      : undefined,
    actions: ["done", "skip", "adjust"],
  });
  add({
    id: "end-shift", at: ph.end, category: "shift",
    title: "End of shift",
    msg: "Log this to switch the plan into recovery mode.",
    why: "Once the shift is logged as over, caffeine prompts stop and everything remaining is pointed at getting you home and asleep.",
    actions: ["endShift"],
  });
  add({
    id: "commute", at: ph.end + 5, category: "recovery",
    title: profile.commute === "drive" ? "Before you drive" : "Getting home",
    msg: profile.commute === "drive"
      ? "If you feel sleepy right now, do not start driving. Rest first, or arrange another way home."
      : "Keep light low on the way home. Sunglasses outdoors help.",
    why: profile.commute === "drive"
      ? "The drive home after a night shift falls at the end of a long stretch awake, which is when sleepiness is hardest to judge from the inside. This is the one item in the plan with no skip button."
      : "Daylight on the way home is a strong signal to your body that the day is starting, which makes the sleep you are about to attempt harder to fall into.",
    priority: profile.commute === "drive",
    actions: profile.commute === "drive" ? ["done", "adjust"] : ["done", "skip", "adjust"],
  });
  add({
    id: "sleep-prep", at: ph.sleepStart - ov(profile, "sleepPrepLead", 30), category: "sleep",
    adjust: [{ key: "sleepPrepLead", def: 30 }],
    title: "Sleep preparation",
    msg: "Dark room, cool, phone away. Blackout what you can.",
    why: "Daytime sleep competes with light, heat, and noise that night sleep does not. The darker and cooler you can make the room, the less of a disadvantage you start from.",
    actions: ["done", "skip"],
  });
  add({
    id: "sleep-window", at: ph.sleepStart, category: "sleep",
    title: `Sleep until ${fmt(ph.sleepEnd)}`,
    msg: `${dur(profile.sleepGoalHours * 60)} protected.`,
    why: "This window is the anchor the whole plan is built backward from. Everything timed tonight was timed to get you here in a state to use it.",
    actions: ["sleepStart"],
  });

  /* ---------- reactive inserts ---------- */
  if (s.waterGap) {
    add({
      id: "water-now", at: now + 1, category: "water",
      adjust: [{ key: "waterGap", def: 90 }],
      title: "Water check",
      msg: "Drink something now while you are thinking about it.",
      why: "Mild dehydration reads as tiredness, so a long gap makes the night feel harder than it is.",
      changed: `Added because it has been over ${s.waterGapMins} minutes since your last water.`,
      actions: ["logWater", "skip"],
    });
  }
  if (s.screenStrain && s.lastScreen && now - s.lastScreen < 120) {
    const late = now >= ph.phases[3].from;
    add({
      id: "eye-break", at: s.lastScreen + 2, category: "light",
      adjust: [{ key: "eyeBreakSecs", def: 20 }],
      title: "Eye break",
      msg: late
        ? `${ov(profile, "eyeBreakSecs", 20)} seconds on something far away. Drop your brightness while you are at it.`
        : `${ov(profile, "eyeBreakSecs", 20)} seconds looking at something at least twenty feet away.`,
      why: "Focusing at one close distance for hours is what makes eyes ache by the middle of a shift. Looking far away briefly lets the muscles doing that work release.",
      changed: "Added because you logged screen strain.",
      actions: ["done", "skip"],
    });
  }

  return {
    ph, state: s,
    items: items
      .filter((it) => !(s.lateCaffeine && it.category === "caffeine" && it.id === "caff-window"))
      .sort((a, b) => a.at - b.at),
  };
}

/* ------------------------------ advice engine ----------------------------- */

function generateAdvice(profile, logs, now, plan) {
  const { ph, state: s } = plan;
  const { phase, inDeepNight } = determineCurrentPhase(now, ph);
  const toSleep = ph.sleepStart - now;

  const next = plan.items.find((i) => i.at > now && s.itemStatus(i.id) === "open");

  let title = "You are on plan";
  let body = "Nothing is due right now. Keep the pace you are on.";
  let why = "The plan only speaks up when something is due. Quiet means nothing needs your attention.";
  let domain = "shift";

  if (phase.key === "pre") {
    const hard = ph.deepNight ? ph.deepNight[0] : ph.hardest[0];
    title = "Set up before you clock in";
    body = "Eat, fill your water bottle, and get your sleep space dark and cool.";
    why = `Decisions get worse as the night goes on. Anything you settle now is something you will not have to settle at ${fmt(hard)}, when choosing well is hardest.`;
    domain = "food";
  } else if (phase.key === "early") {
    title = "Alertness window";
    body = profile.caffeine === "none"
      ? "Good stretch for demanding tasks. Keep the light up and water going."
      : `Good stretch for demanding tasks. Caffeine is clear until ${fmt(s.cutoff)}.`;
    why = "The early hours of a night shift are the ones you have the most to work with. Front-loading the tasks that need care means less of them land in the low point.";
    domain = profile.caffeine === "none" ? "light" : "caffeine";
  } else if (inDeepNight) {
    title = "Circadian low";
    body = (profile.nap === "during" || profile.nap === "both") && !s.napFailed
      ? "Take your planned rest if you can, and pace the tasks that need care."
      : "No nap access, so: quiet rest, water, and slower pacing instead."; 
    why = "Your body clock runs its lowest point in these hours regardless of how well you slept. Alertness drops, mistakes cluster, and pushing harder tends to cost more than it returns.";
    domain = "sleep";
  } else if (phase.key === "mid") {
    title = "Keep the resets going";
    body = "Water and a movement reset roughly every hour.";
    why = "This is the steady middle. Nothing dramatic is needed, but unbroken sitting through it is what leaves you stiff and drowsy by the last hours.";
    domain = "movement";
  } else if (phase.key === "late") {
    title = "Sleep protection";
    body = `You are ${dur(toSleep)} from your sleep window. Water, light movement, lower brightness.`;
    why = "Caffeine taken now would still be working when you are trying to fall asleep, and bright light this close to bed tells your body the day is starting. Alertness from here has to come from movement and pacing instead.";
    domain = "sleep";
  } else if (phase.key === "post") {
    title = "Recovery mode";
    body = profile.commute === "drive"
      ? "Get home safely first. If you are sleepy, rest before you drive."
      : "Keep light low and food light.";
    why = "The shift is over but the sleep window is not open yet. What happens in this gap decides how quickly you fall asleep once you lie down.";
    domain = "recovery";
  } else if (phase.key === "sleep") {
    title = "Sleep window";
    body = "Dark, cool, phone away.";
    why = "Log your wake-up whenever you surface. That single answer is what shapes tomorrow's plan more than anything else you can tell the app.";
    domain = "sleep";
  }

  // log-driven overrides, strongest last
  if (s.waterGap) {
    title = "Water first";
    body = "Drink now, then carry on.";
    why = "It has been over ninety minutes. Mild dehydration reads as tiredness, so a long gap makes the rest of the night feel harder than it is.";
    domain = "water";
  }
  if (s.skippedMovement >= 2 && now >= ph.start && now < ph.end) {
    title = "Try a shorter reset";
    body = "Sixty seconds at your desk: sit tall, roll your shoulders, stretch your wrists, look away from the screen.";
    why = "Skipped breaks happen, and a plan that ignores that is a plan you stop using. The response is a smaller ask, not a repeated one.";
    domain = "movement";
  }
  if (s.lateCaffeine) {
    title = "Switched to sleep protection";
    body = "The rest of the plan is water, movement, and lower light.";
    why = "That caffeine will still be working when your sleep window opens. Nothing has gone wrong — it just means the tools for the rest of the night change.";
    domain = "sleep";
  }
  if (s.endShift) {
    title = "Shift logged as over";
    body = profile.commute === "drive"
      ? "Before anything else: if you feel sleepy, do not drive yet."
      : "Lower the light, keep food light, start winding down.";
    why = profile.commute === "drive"
      ? "The drive home lands at the end of a long stretch awake, which is when sleepiness is hardest to judge from the inside."
      : "Caffeine prompts are off. Everything remaining is pointed at getting you to sleep.";
    domain = profile.commute === "drive" ? "recovery" : "sleep";
  }

  return { title, body, why, domain, next, phase, inDeepNight };
}

function answerSleepy(profile, plan, now) {
  const { ph, state: s } = plan;
  const { phase, inDeepNight } = determineCurrentPhase(now, ph);
  if (phase.key === "early" || phase.key === "pre") {
    return {
      domain: "caffeine",
      title: "Still an alertness window",
      body: profile.caffeine === "none"
        ? "Stand up and move for two minutes, drink water, brighten your workspace if you can."
        : `Movement, water, and caffeine if you want it — you are clear until ${fmt(s.cutoff)}. Brighter light helps too.`,
      why: "This early in the shift, every alertness tool is still available to you without a cost later. That changes as the night goes on, which is why the answer to this question is not always the same.",
    };
  }
  if (inDeepNight) {
    return {
      domain: "sleep",
      title: "You are in the low point",
      body: (profile.nap === "during" || profile.nap === "both") && !s.napFailed
        ? "Take the planned rest — twenty minutes with an alarm, then a buffer before anything demanding."
        : "Eyes closed for five minutes, slow breathing, water, and pace your tasks down.",
      why: "Feeling sleepy here is expected rather than a sign something is wrong. Your body clock is at its lowest, and rest works better than stimulation at this hour.",
    };
  }
  return {
    domain: "sleep",
    title: "Close to your sleep window",
    body: `You are ${dur(Math.max(0, ph.sleepStart - now))} out. Move, drink water, slow the pace${
      profile.commute === "drive" ? ", and do not start driving while you feel like this" : ""
    }.`,
    why: "Caffeine now would still be active when you lie down, trading a difficult hour for a poor day's sleep. Movement and water buy alertness without borrowing from your sleep.",
  };
}

function answerStressed(profile) {
  if (profile.breakControl === "high" || profile.breakControl === "fixed") {
    return {
      domain: "recovery",
      title: "Take five",
      body: "Step away properly. Five minutes of slow breathing or a short walk, away from the screen.",
      why: "You told the plan you have real control over your breaks, so this suggestion uses it. A proper pause resets more than a shortened one.",
    };
  }
  return {
    domain: "recovery",
    title: "Micro-reset",
    body: "Three slow breaths, drop your shoulders, unclench your jaw, sip water, look away from the screen for twenty seconds.",
    why: "You told the plan you cannot easily step away, so this fits inside your work. Something you can actually do beats something better that you cannot.",
  };
}

/* ---------------------- sample history for the dashboard ------------------
   Deterministic so the same profile always produces the same past. Late
   caffeine is correlated with shorter sleep on purpose, because that is the
   pattern the dashboard is meant to be able to surface. */

const RANGES = [
  { key: "7", l: "7 nights", n: 7 },
  { key: "14", l: "14 nights", n: 14 },
  { key: "28", l: "4 weeks", n: 28 },
  { key: "56", l: "8 weeks", n: 56 },
];

const rnd = (i, k) => {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

function seedHistory(profile, nights = 56) {
  const ph = calculateShiftPhases(profile);
  const cutoffClock = ((calculateCaffeineCutoff(profile, ph) ?? ph.end) % DAY + DAY) % DAY;
  const sleepClock = (ph.sleepStart % DAY + DAY) % DAY;
  const startClock = (ph.start % DAY + DAY) % DAY;
  const gap = movementInterval(profile);
  const plannedResets = Math.max(1, Math.floor(ph.length / gap));
  const canNap = profile.nap === "during" || profile.nap === "both";
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return Array.from({ length: nights }, (_, k) => {
    const i = nights - 1 - k; // 0 = most recent
    const drift = Math.round((rnd(i, 1) - 0.4) * 150);
    const lateShots = rnd(i, 2) < 0.3 ? 1 : 0;
    const shots = 1 + Math.floor(rnd(i, 3) * (profile.caffeine === "high" ? 4 : profile.caffeine === "moderate" ? 3 : 1));
    const caffeine = [];
    for (let c = 0; c < shots; c++) {
      caffeine.push((startClock + 30 + Math.floor(rnd(i, 10 + c) * (ph.length - 120))) % DAY);
    }
    if (lateShots) caffeine.push((cutoffClock + 20 + Math.floor(rnd(i, 20) * 90)) % DAY);

    // the correlation: late caffeine costs sleep
    const base = Math.max(3.6, Math.min(9.6, profile.sleepGoalHours + (rnd(i, 4) - 0.5) * 2.2));
    const sleepHours = Math.round((lateShots ? base - 1.2 : base) * 10) / 10;

    const sleepStart = (sleepClock + drift + DAY) % DAY;
    const restRoll = rnd(i, 5);
    const restKind = !canNap ? (restRoll < 0.45 ? "quiet" : "none")
      : restRoll < 0.5 ? "nap" : restRoll < 0.75 ? "quiet" : "none";
    const sleepyRoll = rnd(i, 6);
    const sleepyWindow = sleepyRoll < 0.18 ? "early" : sleepyRoll < 0.4 ? "mid"
      : sleepyRoll < 0.78 ? "deep" : "late";

    return {
      label: days[i % 7], idx: i,
      sleepStart, sleepEnd: (sleepStart + sleepHours * 60) % DAY,
      sleepHours, wake: (sleepStart + sleepHours * 60) % DAY,
      cutoff: cutoffClock, caffeine,
      restMin: restKind === "nap" ? 20 : restKind === "quiet" ? 10 : 0,
      restKind, groggy: restKind === "nap" && rnd(i, 7) < 0.25,
      moveTotal: plannedResets,
      moveDone: Math.round(plannedResets * (0.35 + rnd(i, 8) * 0.6)),
      water: Math.floor(rnd(i, 9) * 5),
      preShiftMeal: rnd(i, 11) < (profile.mealPattern === "before" ? 0.85 : 0.35),
      deepHeavyMeal: rnd(i, 12) < 0.22,
      skippedMeal: rnd(i, 13) < (profile.mealPattern === "skip" ? 0.6 : 0.18),
      lateSnack: rnd(i, 14) < 0.3,
      screenStrain: rnd(i, 15) < (profile.lightEnv === "screens" ? 0.5 : 0.2) ? 1 : 0,
      eyeBreaks: Math.floor(rnd(i, 16) * 4),
      lateLightDone: rnd(i, 17) < 0.55,
    };
  });
}

/* ------------------------------ pattern reading ---------------------------
   Descriptive, never accusatory. Nothing here says a behaviour caused an
   outcome; it says a pattern showed up and what the plan will do about it. */

function rangeStats(profile, hist) {
  const n = hist.length || 1;
  const avgSleep = hist.reduce((a, h) => a + h.sleepHours, 0) / n;
  const lateNights = hist.filter((h) => h.caffeine.some((c) => nightAxis(c) >= nightAxis(h.cutoff)));
  const cleanNights = hist.filter((h) => !lateNights.includes(h));
  const avgClean = cleanNights.length
    ? cleanNights.reduce((a, h) => a + h.sleepHours, 0) / cleanNights.length : null;
  const avgLate = lateNights.length
    ? lateNights.reduce((a, h) => a + h.sleepHours, 0) / lateNights.length : null;

  const starts = hist.map((h) => nightAxis(h.sleepStart));
  const spread = (Math.max(...starts) - Math.min(...starts)) / 60;
  const wakes = hist.map((h) => nightAxis(h.wake));
  const wakeDrift = (Math.max(...wakes) - Math.min(...wakes)) / 60;

  const moveDone = hist.reduce((a, h) => a + h.moveDone, 0);
  const moveTotal = hist.reduce((a, h) => a + h.moveTotal, 0) || 1;
  const movePct = Math.round((moveDone / moveTotal) * 100);

  const naps = hist.filter((h) => h.restKind === "nap").length;
  const quiets = hist.filter((h) => h.restKind === "quiet").length;
  const missed = hist.filter((h) => h.restKind === "none").length;
  const groggy = hist.filter((h) => h.groggy).length;

  const windows = ["early", "mid", "deep", "late"];
  const counts = windows.map((w) => hist.filter((h) => h.sleepyWindow === w).length);
  const sleepyWindow = windows[counts.indexOf(Math.max(...counts))];

  const waterAvg = hist.reduce((a, h) => a + h.water, 0) / n;
  const caffeineAvg = hist.reduce((a, h) => a + h.caffeine.length, 0) / n;

  return {
    n, avgSleep, lateCount: lateNights.length, avgClean, avgLate,
    spread, wakeDrift, movePct, moveDone, moveTotal,
    naps, quiets, missed, groggy, sleepyWindow, waterAvg, caffeineAvg,
    preShiftMeals: hist.filter((h) => h.preShiftMeal).length,
    deepHeavy: hist.filter((h) => h.deepHeavyMeal).length,
    skippedMeals: hist.filter((h) => h.skippedMeal).length,
    lateSnacks: hist.filter((h) => h.lateSnack).length,
    strain: hist.reduce((a, h) => a + h.screenStrain, 0),
    lateLightDone: hist.filter((h) => h.lateLightDone).length,
  };
}

const SLEEPY_LABEL = { early: "Early shift", mid: "Mid-shift", deep: "Deep night", late: "Last hours" };

function readPatterns(profile, st) {
  const sleepAvgLine =
    st.avgSleep < 5 ? "Your recent sleep average is in a high-fatigue range. The plan will prioritise rest, an earlier caffeine cutoff, and sleep protection."
    : st.avgSleep < 7 ? "Your sleep average suggests some sleep pressure may be building. The plan will add extra rest and fatigue checks."
    : st.avgSleep <= 9 ? "Your sleep average is holding. The plan will focus on protecting what is working."
    : "Your sleep average is long. This may reflect recovery sleep. The plan will track consistency and how rested you feel.";

  const sleepTiming =
    st.spread < 2 ? "Your sleep window stayed fairly consistent this period."
    : st.spread < 4 ? "Your sleep window drifted across the period. The plan will help protect a more stable sleep start."
    : "Sleep often started later than planned. Late caffeine, light, meals, or wind-down may be affecting this.";

  const wakeDrift =
    st.wakeDrift < 1.5 ? "Your wake times are fairly steady. That helps the planner keep your routine predictable."
    : st.wakeDrift < 3.5 ? "Your wake time is drifting. The plan will watch for late caffeine, delayed meals, and skipped wind-down."
    : "Your wake time moved a lot across this period. The plan may need flexible sleep protection rather than a rigid schedule.";

  const caffeine =
    profile.caffeine === "none" ? "No caffeine prompts are part of your plan, so this chart stays empty unless you log some."
    : st.lateCount === 0 ? "Caffeine stayed inside your planned window. Keep using the cutoff as your sleep boundary."
    : st.lateCount <= st.n * 0.25 ? `Caffeine crossed your cutoff on ${st.lateCount} nights. The plan will add earlier reminders and water swaps.`
    : "Caffeine crossed your cutoff often. This may be one reason your sleep window is harder to protect.";

  const movement =
    profile.breakControl === "low" || profile.breakControl === "unpredictable"
      ? `${st.movePct}% completed. Since breaks are hard to control, the plan uses 30 to 60 second micro-resets.`
    : st.movePct >= 70 ? "You completed most movement resets. The plan will keep the current reset frequency."
    : st.movePct >= 40 ? "You completed some resets. The plan may group them around natural break times."
    : "Resets were often skipped. The plan will make the next ones shorter and more desk-friendly.";

  const rest =
    st.groggy >= 3 ? "You felt groggy after some rests. The plan will add a wake-up buffer or shorten them."
    : st.quiets > st.naps ? "Quiet rest is your main recovery tool. The plan will keep rest blocks short and easy to finish."
    : st.missed > st.n * 0.5 ? "Rest blocks were often skipped. The plan can switch some naps to shorter quiet resets."
    : "Your rest blocks were used consistently. The plan will keep them in the same window.";

  const fatigue = {
    early: "Sleepiness often started early. The plan will check pre-shift sleep, food, and caffeine timing.",
    mid: "Sleepiness often appeared mid-shift. The plan will add movement, water, and rest before this window.",
    deep: "Sleepiness clustered in the deep-night window. The plan will protect your rest block.",
    late: "Sleepiness often appeared near the end of the shift. The plan will keep caffeine away from your sleep window and focus on safety, movement, and wind-down.",
  }[st.sleepyWindow];

  const foodHydration =
    st.deepHeavy > st.n * 0.3 ? "Heavy meals often landed in the deep-night window. The plan will move food prompts earlier where possible."
    : st.skippedMeals > st.n * 0.35 ? "Meals were skipped on several nights. The plan will add a planned snack before the hardest part of the shift."
    : st.waterAvg < st.caffeineAvg ? "Caffeine was logged more often than water. The plan will add water swaps after caffeine."
    : "Food and water stayed roughly on plan. The plan will keep reminders light.";

  const light =
    st.strain > st.n * 0.35 ? "Screen strain showed up often. The plan will add more eye breaks and screen comfort checks."
    : st.lateLightDone < st.n * 0.4 ? "Late-light reminders were often skipped. The plan will simplify them: lower brightness, warmer display, fewer unnecessary screens."
    : "You often completed the late-light reminders. The plan will keep protecting your sleep window this way.";

  /* main pattern: prefer a relationship over a bare number */
  let mainPattern;
  if (st.avgClean !== null && st.avgLate !== null && st.avgClean - st.avgLate > 0.4) {
    mainPattern = `Your sleep was shorter on nights when caffeine crossed the cutoff — ${st.avgLate.toFixed(1)}h against ${st.avgClean.toFixed(1)}h.`;
  } else if (st.wakeDrift >= 3.5) {
    mainPattern = "Your wake time moved across this period, which usually shows up before you feel it.";
  } else if (st.movePct < 40) {
    mainPattern = "Movement resets dropped off through this period, most often later in the shift.";
  } else {
    mainPattern = `Sleepiness clustered in the ${SLEEPY_LABEL[st.sleepyWindow].toLowerCase()} window.`;
  }

  /* two or three noticed items, strongest first, never more */
  const noticed = [];
  if (st.avgClean !== null && st.avgLate !== null && st.avgClean - st.avgLate > 0.4) {
    noticed.push("You slept longer on nights when caffeine stayed before the cutoff.");
  }
  if (st.movePct < 60) noticed.push("Movement resets were skipped most often in the second half of the shift.");
  if (st.sleepyWindow === "deep") noticed.push("Sleepiness was most common during the deep night, so the plan will protect your rest block.");
  if (st.sleepyWindow === "late") noticed.push("Sleepiness clustered near the end of your shifts, where the commute also sits.");
  if (st.wakeDrift >= 3) noticed.push("Your wake time drifted later across the period. The plan will strengthen wind-down reminders.");
  if (st.deepHeavy > st.n * 0.3) noticed.push("Heavy meals were logged close to sleep on several nights. The plan will move food prompts earlier.");
  if (!noticed.length) noticed.push("Nothing stood out this period. The plan will keep its current shape.");

  /* one concrete adjustment the user can accept or decline */
  let adjustment;
  if (st.lateCount > st.n * 0.2 && profile.caffeine !== "none") {
    adjustment = {
      text: "The next plan will move your final caffeine reminder an hour earlier and add a water swap after your last planned drink.",
      apply: (pr) => ({ ...pr, overrides: { ...(pr.overrides || {}), caffeineHours: caffeineHours(pr) + 1 } }),
      done: "Caffeine cutoff moved an hour earlier.",
    };
  } else if (st.avgSleep < 6) {
    adjustment = {
      text: "The next plan will start wind-down earlier and keep late-shift stimulation lower.",
      apply: (pr) => ({ ...pr, overrides: { ...(pr.overrides || {}), windDownLead: ov(pr, "windDownLead", 30) + 15 } }),
      done: "Wind-down starts 15 minutes earlier.",
    };
  } else if (st.movePct < 50) {
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
  } else if (st.strain > st.n * 0.35) {
    adjustment = {
      text: "The next plan will start light reduction earlier and add more eye breaks.",
      apply: (pr) => ({ ...pr, overrides: { ...(pr.overrides || {}), lightDownLead: ov(pr, "lightDownLead", 90) + 30 } }),
      done: "Light reduction starts 30 minutes earlier.",
    };
  } else {
    adjustment = {
      text: "Nothing needs changing yet. The plan will keep its current timing and keep watching.",
      apply: null, done: null,
    };
  }

  return { sleepAvgLine, sleepTiming, wakeDrift, caffeine, movement, rest, fatigue, foodHydration, light, mainPattern, noticed: noticed.slice(0, 3), adjustment };
}

/* ------------------------------- achievements ----------------------------- */

/** Earn-only. Nothing here can be lost, and nothing shows a streak count —
    a counter that resets is a punishment mechanic, and this app does not have one. */
function achievements(profile, logs, history) {
  const count = (t) => logs.filter((l) => l.type === t).length;
  const movesDone = logs.filter(
    (l) => l.type === "item" && l.value.status === "done" && l.value.category === "movement"
  ).length;
  const cleanNights = history.filter((h) =>
    h.caffeine.every((c) => nightAxis(c) < nightAxis(h.cutoff))
  ).length;

  return [
    { key: "first", Icon: Moon, hue: DOMAIN.sleep.hue, l: "First night",
      d: "You logged a night. That is the part most people skip.",
      got: history.length > 0 },
    { key: "week", Icon: Trophy, hue: DOMAIN.recovery.hue, l: "A full week",
      d: "Seven nights on record. Patterns need this much to show up.",
      got: history.length >= 7 },
    { key: "early", Icon: Coffee, hue: DOMAIN.caffeine.hue, l: "Stopped early",
      d: "Three nights where every cup landed before your cutoff.",
      got: cleanNights >= 3 },
    { key: "hard", Icon: Zap, hue: DOMAIN.light.hue, l: "Hard night",
      d: "You worked a night on under five hours of sleep and came back.",
      got: history.some((h) => h.sleepHours < 5) },
    { key: "rest", Icon: Bed, hue: DOMAIN.sleep.hue, l: "Took the rest",
      d: "You used a planned rest instead of pushing through.",
      got: count("nap") > 0 || history.some((h) => h.restMin > 0) },
    { key: "home", Icon: Car, hue: DOMAIN.recovery.hue, l: "Home safe",
      d: "You ran the end-of-shift check before heading home.",
      got: count("endShift") > 0 },
    { key: "reset", Icon: Activity, hue: DOMAIN.movement.hue, l: "Reset habit",
      d: "Five movement resets completed. Small ones count.",
      got: movesDone >= 5 },
  ];
}

/* --------------------------------- micro-care -----------------------------
   Short guided resets. Which one gets suggested depends on the phase and on
   what the user just said they feel, so the list is never a static menu. */

const CARE = [
  {
    k: "box", l: "Box breathing", sub: "4 in · 4 hold · 4 out · 4 hold",
    mins: 2, cat: "recovery", Icon: Wind, logsAs: null,
    cycle: [
      { l: "Breathe in", s: 4, scale: 1 }, { l: "Hold", s: 4, scale: 1 },
      { l: "Breathe out", s: 4, scale: 0.55 }, { l: "Hold", s: 4, scale: 0.55 },
    ],
  },
  {
    k: "478", l: "4-7-8 breathing", sub: "Downshift before rest",
    mins: 3, cat: "sleep", Icon: Moon, logsAs: null,
    cycle: [
      { l: "Breathe in", s: 4, scale: 1 }, { l: "Hold", s: 7, scale: 1 },
      { l: "Breathe out", s: 8, scale: 0.5 },
    ],
  },
  {
    k: "neck", l: "Neck and shoulders", sub: "Release desk tension",
    mins: 3, cat: "movement", Icon: Activity, logsAs: "move",
    steps: [
      { l: "Roll your shoulders back, slowly", s: 30 },
      { l: "Right ear toward right shoulder", s: 30 },
      { l: "Left ear toward left shoulder", s: 30 },
      { l: "Chin tuck, hold it", s: 30 },
      { l: "Squeeze shoulder blades together", s: 30 },
      { l: "Shake your arms out", s: 30 },
    ],
  },
  {
    k: "desk", l: "Desk mobility", sub: "Wake the body up",
    mins: 4, cat: "movement", Icon: Footprints, logsAs: "move",
    steps: [
      { l: "Stand up. Reach overhead", s: 30 },
      { l: "Side bend right, then left", s: 40 },
      { l: "Gentle spine twist, both sides", s: 40 },
      { l: "Hip hinge, hands on the desk", s: 40 },
      { l: "Calf raises, slow", s: 30 },
      { l: "Wrist circles, both directions", s: 30 },
      { l: "Walk on the spot", s: 30 },
    ],
  },
  {
    k: "eyes", l: "20-20-20 eye reset", sub: "For screen strain",
    mins: 1, cat: "light", Icon: Eye, logsAs: "eye",
    steps: [
      { l: "Look at something twenty feet away", s: 20 },
      { l: "Blink slowly, ten times", s: 20 },
      { l: "Palms over closed eyes", s: 20 },
    ],
  },
];

function suggestedCare(profile, plan, now, feeling) {
  const { ph, state: s } = plan;
  const { phase, inDeepNight } = determineCurrentPhase(now, ph);
  if (feeling === "sore") return "neck";
  if (feeling === "foggy") return "eyes";
  if (feeling === "stressed") return "box";
  if (feeling === "sleepy") return inDeepNight ? "478" : "desk";
  if (feeling === "wired" && (phase.key === "late" || phase.key === "post")) return "478";
  if (s.screenStrain) return "eyes";
  if (phase.key === "late" || phase.key === "post" || inDeepNight) return "478";
  if (s.skippedMovement >= 1) return "neck";
  return "box";
}

function CarePlayer({ T, activity, onClose, onDone }) {
  const seq = useMemo(() => {
    if (!activity.cycle) return activity.steps;
    const len = activity.cycle.reduce((a, c) => a + c.s, 0);
    const reps = Math.max(1, Math.round((activity.mins * 60) / len));
    return Array.from({ length: reps }).flatMap(() => activity.cycle);
  }, [activity]);

  const total = seq.reduce((a, x) => a + x.s, 0);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(true);
  const finished = elapsed >= total;

  useEffect(() => {
    if (!running || finished) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [running, finished]);

  let acc = 0, idx = 0;
  for (let k = 0; k < seq.length; k++) {
    if (elapsed < acc + seq[k].s) { idx = k; break; }
    acc += seq[k].s; idx = Math.min(k + 1, seq.length - 1);
  }
  const step = seq[Math.min(idx, seq.length - 1)];
  const left = Math.max(0, step.s - (elapsed - acc));
  const hue = DOMAIN[activity.cat].hue;
  const scale = finished ? 0.8 : step.scale !== undefined ? step.scale : 0.86;

  return (
    <div style={{
      position: "absolute", inset: 0, background: T.bg, zIndex: 90,
      display: "flex", flexDirection: "column", padding: "44px 24px 32px",
    }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <div style={{ flex: 1 }}>
          <Eyebrow T={T} color={hue}>Micro-care</Eyebrow>
          <Display T={T} size={26}>{activity.l}</Display>
        </div>
        <button onClick={onClose} style={{
          width: 38, height: 38, borderRadius: 19, border: "none", background: T.card,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        }}><X size={18} color={T.ink} /></button>
      </div>

      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 26,
      }}>
        <div style={{
          width: 220, height: 220, borderRadius: 110, position: "relative",
          background: tint(hue, 0.1), display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            position: "absolute", width: 220, height: 220, borderRadius: 110,
            background: tint(hue, 0.18), transform: `scale(${scale})`,
            transition: `transform ${finished ? 0.6 : step.s}s ease-in-out`,
          }} />
          <span style={{
            position: "relative", fontFamily: FONT_DISPLAY, fontSize: 46, fontWeight: 700,
            color: hue, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.03em",
          }}>{finished ? "✓" : left}</span>
        </div>

        <div style={{ textAlign: "center", minHeight: 54 }}>
          <div style={{
            fontFamily: FONT_DISPLAY, fontSize: 23, fontWeight: 700, color: T.ink,
            letterSpacing: "-0.02em",
          }}>{finished ? "Done." : step.l}</div>
          <div style={{ fontFamily: FONT_TEXT, fontSize: 14, color: T.muted, marginTop: 6 }}>
            {finished
              ? "That counts. Back to it."
              : `${Math.max(0, Math.ceil((total - elapsed) / 60))} min left`}
          </div>
        </div>
      </div>

      <div style={{ height: 4, borderRadius: 2, background: T.hair, marginBottom: 18 }}>
        <div style={{
          width: `${Math.min(100, (elapsed / total) * 100)}%`, height: "100%",
          borderRadius: 2, background: hue, transition: "width 1s linear",
        }} />
      </div>

      {finished ? (
        <Btn T={T} full onClick={onDone}>Log it and close</Btn>
      ) : (
        <div style={{ display: "flex", gap: 10 }}>
          <Btn T={T} kind="quiet" style={{ flex: 1 }} onClick={() => setRunning(!running)}>
            {running ? "Pause" : "Resume"}
          </Btn>
          <Btn T={T} style={{ flex: 1.4 }} onClick={() => setElapsed(total)}>Finish early</Btn>
        </div>
      )}
    </div>
  );
}

/* ---------------------- quick log: instant, one sentence ------------------
   The plus button answers "what happened right now?" — so every entry gets an
   immediate reading of what it means for the rest of tonight. */

const QUICK = [
  { k: "water", l: "Water", cat: "water" },
  { k: "caffeine", l: "Caffeine", cat: "caffeine" },
  { k: "meal", l: "Meal / snack", cat: "food" },
  { k: "nap", l: "Nap / quiet rest", cat: "sleep" },
  { k: "move", l: "Movement reset done", cat: "movement" },
  { k: "skip", l: "Skipped a break", cat: "movement" },
  { k: "sleepy", l: "Sleepy", cat: "recovery" },
  { k: "stress", l: "Stressed", cat: "recovery" },
  { k: "screen", l: "Screen strain", cat: "light" },
  { k: "endShift", l: "End shift", cat: "shift" },
  { k: "sleepStart", l: "Going to sleep", cat: "sleep" },
];

function quickAdvice(kind, profile, plan, now) {
  const { ph, state: s } = plan;
  const { phase, inDeepNight } = determineCurrentPhase(now, ph);
  const late = phase.key === "late" || phase.key === "post";
  const cutoff = s.cutoff;

  if (kind === "water") {
    return s.waterGap
      ? "Water logged. I will keep the next reminder light."
      : "Water logged. Your next hydration check stays on schedule.";
  }
  if (kind === "caffeine") {
    if (!cutoff) return "Caffeine logged. I will check the timing against your sleep window.";
    if (now >= cutoff) return "Caffeine logged. This is past your cutoff, so the rest of the plan will avoid caffeine and protect sleep.";
    if (now >= cutoff - 60) return "Caffeine logged. You are close to your cutoff, so I will switch later prompts toward water and wind-down.";
    return `Caffeine logged. This fits your window — last call is ${fmt(cutoff)}.`;
  }
  if (kind === "meal") {
    if (late) return "Meal logged. Since sleep is close, the plan will not prompt for heavier food again.";
    if (inDeepNight) return "Meal logged. I will keep the next food prompt light and pair it with water or movement.";
    return "Meal logged. The next food reminder will stay lighter.";
  }
  if (kind === "nap") return "Rest logged. I have added a wake-up buffer before anything demanding.";
  if (kind === "move") {
    return s.skippedMovement >= 2
      ? "Reset logged. I will keep the next one short and desk-friendly."
      : "Reset logged. Your next movement reminder stays on schedule.";
  }
  if (kind === "skip") {
    return s.skippedMovement >= 1
      ? "Skipped again. I will switch the next reset to a 60-second desk reset."
      : "Skipped. I will make the next reset shorter.";
  }
  if (kind === "sleepy") {
    if (phase.key === "early" || phase.key === "pre")
      return "You are still early in the shift. Try water, movement, and caffeine only if it fits your window.";
    if (inDeepNight)
      return "This is a common high-sleepiness window. Use your rest block if you have one.";
    return "You are close to sleep protection. Skip caffeine now and use movement, water, and wind-down.";
  }
  if (kind === "stress") {
    return profile.breakControl === "high" || profile.breakControl === "fixed"
      ? "Lower your shoulders, unclench your jaw, three slow breaths. If you can step away, take a three to five minute quiet reset."
      : "Lower your shoulders, unclench your jaw, and take three slow breaths where you are.";
  }
  if (kind === "screen") {
    return late
      ? "Look away from the screen, blink slowly, relax your face. Reduce brightness or switch to a warmer display if you can."
      : "Look away from the screen, blink slowly, and relax your face.";
  }
  if (kind === "endShift")
    return "Shift complete. Switching to recovery mode: commute check, light reduction, and sleep prep.";
  if (kind === "sleepStart")
    return "Sleep mode started. Log your wake-up later so the next plan can adjust.";
  return "Logged.";
}

/** Plain-language trace of what the user's logs actually changed in the plan. */
function planChanges(profile, plan, now) {
  const { ph, state: s } = plan;
  const out = [];
  if (s.lateCaffeine) out.push("Your late caffeine log moved the rest of the plan toward water, movement, and wind-down.");
  else if (s.nearCutoff) out.push("Caffeine close to your cutoff removed the later caffeine suggestions.");
  if (s.skippedMovement >= 2) out.push("Repeated skipped breaks changed your next reset to a 60-second desk reset.");
  else if (s.skippedMovement === 1) out.push("A skipped break shortened your next movement reset.");
  if (s.napFailed) out.push("Your could-not-nap log swapped the rest block to quiet rest.");
  if (s.napTaken) out.push("Your rest log added a wake-up buffer afterwards.");
  if (s.napGroggy) out.push("Grogginess after rest shortened future rest blocks and lengthened the buffer.");
  if (s.wokeLate) out.push("Waking later than planned trimmed your pre-shift routine to essentials.");
  if (s.wokeEarly) out.push("Waking earlier than planned added a pre-shift rest and an extra fatigue check-in.");
  if (s.poorSleep) out.push("Poor sleep tilted the plan toward alertness early and protection late.");
  if (s.heavyMeal) out.push("A heavy meal pushed your next food prompt later.");
  if (s.mealSkipped) out.push("A skipped meal added a planned snack.");
  if (s.screenStrain) out.push("Screen strain added an eye break.");
  if (s.waterGap) out.push("A long gap without water added a hydration check.");
  if (s.endShift) out.push("Ending your shift switched the plan into recovery mode.");
  return out;
}

/* --------------------------------- storage -------------------------------- */

const store = {
  async get(k) {
    try {
      const r = await window.storage.get(k);
      return r ? JSON.parse(r.value) : null;
    } catch { return null; }
  },
  async set(k, v) {
    try { await window.storage.set(k, JSON.stringify(v)); } catch { /* memory only */ }
  },
};

/** Map the wall clock onto this plan's absolute-minute scale, choosing the
    occurrence nearest the planned window. */
function realNow(ph) {
  const d = new Date();
  const clock = d.getHours() * 60 + d.getMinutes();
  const day0 = Math.floor(ph.start / DAY) * DAY;
  let best = null;
  for (let k = -1; k <= 2; k++) {
    const t = day0 + k * DAY + clock;
    const dist = t < ph.start - 180 ? (ph.start - 180) - t : t > ph.sleepEnd ? t - ph.sleepEnd : 0;
    if (!best || dist < best.dist) best = { t, dist };
  }
  return best.t;
}

/* ------------------------------ shared UI bits ---------------------------- */

function Badge({ category, T, size = 40 }) {
  const d = DOMAIN[category] || DOMAIN.shift;
  const I = d.Icon;
  return (
    <div style={{
      width: size, height: size, borderRadius: size / 2, flexShrink: 0,
      background: tint(d.hue, T.tintA),
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <I size={size * 0.45} color={d.hue} strokeWidth={2} />
    </div>
  );
}

function Card({ T, children, style, onClick, tone }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: tone || T.card, borderRadius: 22, padding: 16,
        boxShadow: T.key === "warm" ? "0 1px 2px rgba(0,0,0,0.04)" : "none",
        border: T.key === "dark" ? `1px solid ${T.hair}` : "none",
        cursor: onClick ? "pointer" : "default", ...style,
      }}
    >{children}</div>
  );
}

function Eyebrow({ children, T, color }) {
  return (
    <div style={{
      fontFamily: FONT_TEXT, fontSize: 11, fontWeight: 600, letterSpacing: "0.14em",
      textTransform: "uppercase", color: color || T.faint, marginBottom: 10,
    }}>{children}</div>
  );
}

function Display({ children, T, size = 34, style }) {
  return (
    <h1 style={{
      fontFamily: FONT_DISPLAY, fontSize: size, fontWeight: 700, letterSpacing: "-0.028em",
      lineHeight: 1.08, color: T.ink, margin: 0, ...style,
    }}>{children}</h1>
  );
}

function Pill({ children, T, hue, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      fontFamily: FONT_TEXT, fontSize: 14, fontWeight: 500,
      padding: "9px 15px", borderRadius: 999, cursor: "pointer",
      border: `1px solid ${active ? "transparent" : T.hair}`,
      background: active ? tint(hue || DOMAIN.shift.hue, T.tintA + 0.06) : T.card,
      color: active ? (hue || T.ink) : T.muted,
      display: "inline-flex", alignItems: "center", gap: 7, whiteSpace: "nowrap",
    }}>{children}</button>
  );
}

function Btn({ children, T, kind = "primary", onClick, hue, style, full }) {
  const base = {
    fontFamily: FONT_TEXT, fontSize: 16, fontWeight: 600, borderRadius: 999,
    padding: "14px 22px", border: "none", cursor: "pointer", width: full ? "100%" : undefined,
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
  };
  const kinds = {
    primary: { background: T.ink, color: T.bg },
    tinted: { background: tint(hue || DOMAIN.shift.hue, T.tintA + 0.04), color: hue || T.ink },
    quiet: { background: "transparent", color: T.muted, border: `1px solid ${T.hair}` },
  };
  return <button onClick={onClick} style={{ ...base, ...kinds[kind], ...style }}>{children}</button>;
}

function ProgressRing({ pct, T, size = 128, hue }) {
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={T.hair} strokeWidth={7} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={hue} strokeWidth={7}
        strokeLinecap="round" strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.max(0, Math.min(1, pct)))}
        style={{ transition: "stroke-dashoffset 500ms ease" }}
      />
    </svg>
  );
}

/* --------------------------------- onboarding ----------------------------- */

function Welcome({ onNext }) {
  const T = WARM;
  return (
    <div style={{ padding: "72px 24px 32px", minHeight: "100%", display: "flex", flexDirection: "column" }}>
      <Eyebrow T={T}>You're working</Eyebrow>
      <Display T={T} size={54} style={{ letterSpacing: "-0.04em" }}>graveyard.</Display>
      <p style={{
        fontFamily: FONT_TEXT, fontSize: 17, lineHeight: 1.5, color: T.muted, marginTop: 18,
      }}>
        This planner is built around the hours you actually work — caffeine,
        rest, movement, light, food, and a sleep window that gets protected.
      </p>
      <p style={{
        fontFamily: FONT_TEXT, fontSize: 15, lineHeight: 1.5, color: T.faint, marginTop: 14,
      }}>
        Fourteen quick questions. Then get a plan you can adjust.
      </p>
      <div style={{ flex: 1 }} />
      <Btn T={T} full onClick={onNext}>Build my shift plan <ArrowRight size={18} /></Btn>
    </div>
  );
}

function Disclaimer({ onNext, onBack }) {
  const T = WARM;
  return (
    <div style={{ padding: "56px 24px 32px", minHeight: "100%", display: "flex", flexDirection: "column" }}>
      <button onClick={onBack} style={{
        background: T.card, border: "none", width: 42, height: 42, borderRadius: 21,
        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 28,
      }}><ArrowLeft size={18} color={T.ink} /></button>
      <Eyebrow T={T}>Before you start</Eyebrow>
      <Display T={T} size={32}>What this is, and what it is not.</Display>
      <Card T={T} style={{ marginTop: 24, padding: 20 }}>
        <p style={{ fontFamily: FONT_TEXT, fontSize: 15.5, lineHeight: 1.55, color: T.ink, margin: 0 }}>
          This planner provides general wellness and scheduling support based on
          research-informed principles. It does not provide medical advice, diagnosis,
          or treatment. For health conditions, medications, supplements, sleep disorders,
          or persistent fatigue, consult a qualified healthcare professional.
        </p>
      </Card>
      <div style={{ flex: 1 }} />
      <Btn T={T} full onClick={onNext}>I understand</Btn>
    </div>
  );
}

/* ----------------------------------- quiz --------------------------------- */

/* iOS-style wheel: three snap columns, and every row is tappable so it works
   whether you scroll it or poke it. */
function TimeWheel({ T, value, onChange }) {
  const total = toMin(value);
  const h24 = Math.floor(total / 60);
  const cur = { h: h24 % 12 === 0 ? 12 : h24 % 12, m: total % 60, ap: h24 < 12 ? "AM" : "PM" };

  const emit = (next) => {
    const o = { ...cur, ...next };
    let h = o.h % 12;
    if (o.ap === "PM") h += 12;
    onChange(`${String(h).padStart(2, "0")}:${String(o.m).padStart(2, "0")}`);
  };

  const Column = ({ items, selected, onPick, width, fmtItem }) => {
    const ref = useRef(null);
    useEffect(() => {
      const el = ref.current && ref.current.querySelector("[data-on='1']");
      if (el && el.scrollIntoView) el.scrollIntoView({ block: "center" });
    }, [selected]);
    return (
      <div ref={ref} style={{
        width, height: 176, overflowY: "auto", scrollSnapType: "y mandatory",
        padding: "66px 0", scrollbarWidth: "none",
      }}>
        {items.map((it) => {
          const on = it === selected;
          return (
            <button key={String(it)} data-on={on ? "1" : "0"} onClick={() => onPick(it)}
              style={{
                display: "block", width: "100%", height: 44, scrollSnapAlign: "center",
                border: "none", background: "transparent", cursor: "pointer",
                fontFamily: FONT_DISPLAY, fontSize: on ? 26 : 20,
                fontWeight: on ? 700 : 500, fontVariantNumeric: "tabular-nums",
                color: on ? T.ink : T.faint, letterSpacing: "-0.02em",
                transition: "font-size 120ms ease, color 120ms ease",
              }}>{fmtItem ? fmtItem(it) : it}</button>
          );
        })}
      </div>
    );
  };

  return (
    <div style={{ position: "relative", background: T.card, borderRadius: 22, padding: "0 10px" }}>
      <div style={{
        position: "absolute", left: 12, right: 12, top: "50%", height: 46,
        transform: "translateY(-50%)", borderRadius: 14, pointerEvents: "none",
        background: T.key === "warm" ? T.sunken : "rgba(255,255,255,0.06)",
      }} />
      <div style={{ position: "relative", display: "flex", justifyContent: "center", gap: 4 }}>
        <Column width={72} items={[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]}
          selected={cur.h} onPick={(h) => emit({ h })} />
        <Column width={72} items={[0, 15, 30, 45]} selected={cur.m}
          onPick={(m) => emit({ m })} fmtItem={(m) => String(m).padStart(2, "0")} />
        <Column width={72} items={["AM", "PM"]} selected={cur.ap} onPick={(ap) => emit({ ap })} />
      </div>
    </div>
  );
}

const QUESTIONS = [
  { key: "shiftStart", kind: "time", q: "What time does your shift start?", help: "Everything else is calculated from this." },
  { key: "shiftEnd", kind: "time", q: "What time does it end?" },
  { key: "plannedSleep", kind: "time", q: "What time do you plan to sleep after work?", help: "Caffeine, light, and food timing are worked backward from here." },
  {
    key: "sleepGoalHours", kind: "choice", q: "How long do you usually sleep after a night shift?",
    help: "Answer with what actually happens, not the target. Short sleep changes the whole plan.",
    options: [
      { v: 4.5, l: "Under 5 hours", s: "Plan shifts to higher fatigue risk" },
      { v: 5.5, l: "5 to 6 hours", s: "Adds a pre-shift nap and an earlier caffeine cutoff" },
      { v: 7.5, l: "7 to 9 hours", s: "Keeps the routine steady" },
      { v: 9.5, l: "More than 9 hours" },
    ],
  },
  {
    key: "caffeine", kind: "choice", q: "How much caffeine on a typical shift?",
    options: [
      { v: "none", l: "None", s: "Caffeine stays off the plan" },
      { v: "low", l: "One drink", s: "Light use" },
      { v: "moderate", l: "Two or three", s: "Moderate use" },
      { v: "high", l: "Four or more", s: "Adds water swaps and tracking" },
    ],
  },
  {
    key: "nap", kind: "choice", q: "Can you nap or rest before or during your shift?",
    options: [
      { v: "before", l: "Before work only" },
      { v: "during", l: "During my shift only" },
      { v: "both", l: "Both" },
      { v: "none", l: "Neither", s: "The plan will use quiet rest instead." },
    ],
  },
  {
    key: "sedentary", kind: "choice", part: 2, q: "How much of your shift is spent sitting?",
    help: "This decides whether you get standing breaks, walking breaks, or small desk stretches.",
    options: [
      { v: "most", l: "Mostly seated", s: "Adds regular movement resets." },
      { v: "some", l: "About half seated", s: "Adds lighter movement reminders." },
      { v: "little", l: "Mostly moving", s: "Keeps movement reminders minimal." },
      { v: "desk", l: "I cannot leave my desk much", s: "Uses desk-based resets instead." },
    ],
  },
  {
    key: "breakControl", kind: "choice", part: 2, q: "How much control do you have over your breaks?",
    help: "The plan should not suggest naps or walks you cannot realistically take.",
    options: [
      { v: "high", l: "I can take breaks when needed", s: "Plan can use flexible resets." },
      { v: "fixed", l: "I have fixed breaks", s: "Plan works around your break times." },
      { v: "unpredictable", l: "Breaks are unpredictable", s: "Plan uses short backup resets." },
      { v: "low", l: "I rarely get breaks", s: "Plan uses 30\u201360 second micro-resets." },
    ],
  },
  {
    key: "lightEnv", kind: "choice", part: 2, q: "What is your light situation at work?",
    help: "Light can support alertness early, but the plan should pull it back near your sleep window.",
    options: [
      { v: "screens", l: "Mostly screens", s: "Adds eye breaks and screen-light reminders." },
      { v: "bright", l: "Bright workplace lighting", s: "Adds late-shift light reduction." },
      { v: "dim", l: "Dim workplace lighting", s: "Adds alertness checks during sleepy hours." },
      { v: "mixed", l: "Mixed lighting", s: "Uses balanced light prompts." },
    ],
  },
  {
    key: "mealPattern", kind: "choice", part: 2, q: "How do you usually eat during a night shift?",
    help: "This helps head off heavy eating in the deep night or right before sleep.",
    options: [
      { v: "before", l: "A full meal before work", s: "Plan adds lighter snacks during the shift." },
      { v: "during", l: "Main meal during the shift", s: "Plan helps time it earlier when possible." },
      { v: "snack", l: "I mostly snack through the night", s: "Plan adds planned snack windows." },
      { v: "skip", l: "I often skip meals", s: "Plan adds a simple food reminder." },
    ],
  },
  {
    key: "hydration", kind: "choice", part: 2, q: "How often do you drink water during your shift?",
    help: "Water works well as a routine anchor, especially paired with movement breaks.",
    options: [
      { v: "lots", l: "Often", s: "Keeps hydration reminders light." },
      { v: "some", l: "Sometimes", s: "Adds water checks with breaks." },
      { v: "little", l: "Rarely", s: "Adds regular water reminders." },
      { v: "caffeine", l: "Mostly coffee or energy drinks", s: "Adds water swaps after caffeine." },
    ],
  },
  {
    key: "commute", kind: "choice", part: 2, q: "How do you usually get home after work?",
    help: "If you drive and end the shift sleepy, the plan puts safety ahead of everything else.",
    options: [
      { v: "drive", l: "I drive", s: "Adds a drowsiness check before you leave." },
      { v: "transit", l: "Public transport", s: "Adds wind-down and light management." },
      { v: "driven", l: "Someone drives me", s: "Adds recovery mode after the shift." },
      { v: "walk", l: "Walk or bike", s: "Adds a safety and energy check." },
      { v: "home", l: "I work from home", s: "Starts sleep prep right after the shift." },
    ],
  },
  {
    key: "sleepiestTime", kind: "choice", part: 2, q: "When do you usually feel most sleepy?",
    help: "This is where the fatigue check-in and rest get placed.",
    options: [
      { v: "start", l: "Start of shift" },
      { v: "middle", l: "Middle of shift" },
      { v: "deep", l: "Around 2\u20135 AM" },
      { v: "end", l: "End of shift" },
      { v: "varies", l: "It changes" },
    ],
  },
  {
    key: "goal", kind: "choice", part: 2, multi: true,
    q: "What do you want the planner to help with most?",
    help: "Pick as many as apply. This changes what gets shown first, not what gets planned.",
    options: [
      { v: "sleep", l: "Better sleep" },
      { v: "energy", l: "More energy" },
      { v: "caffeine", l: "Less caffeine dependence" },
      { v: "movement", l: "More movement" },
      { v: "eating", l: "Healthier eating" },
      { v: "stress", l: "Less stress" },
      { v: "routine", l: "A steadier routine" },
    ],
  },
];

const GOAL_LABEL = {
  sleep: "Better sleep", energy: "More energy", caffeine: "Less caffeine dependence",
  movement: "More movement", eating: "Healthier eating", stress: "Less stress",
  routine: "A steadier routine",
};

const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const toggleIn = (v, x) => {
  const arr = asList(v);
  return arr.includes(x) ? arr.filter((y) => y !== x) : [...arr, x];
};
const goalLabel = (profile) => {
  const g = asList(profile.goal).map((k) => GOAL_LABEL[k]).filter(Boolean);
  if (!g.length) return "No focus set";
  if (g.length <= 2) return g.join(" and ");
  return `${g[0]} and ${g.length - 1} more`;
};

function Quiz({ onDone, onBack }) {
  const T = WARM;
  const [i, setI] = useState(0);
  const [a, setA] = useState({
    shiftStart: "22:00", shiftEnd: "07:00", plannedSleep: "08:00",
    sleepGoalHours: 7.5, caffeine: "moderate", nap: "during",
    sedentary: "most", breakControl: "high", lightEnv: "screens",
    mealPattern: "before", hydration: "some", commute: "drive",
    sleepiestTime: "deep", goal: ["sleep"],
  });
  const q = QUESTIONS[i];
  const pct = (i + 1) / QUESTIONS.length;

  const canNext = !q.multi || asList(a[q.key]).length > 0;
  const back = () => (i === 0 ? onBack() : setI(i - 1));
  const next = () => (i === QUESTIONS.length - 1 ? onDone(a) : setI(i + 1));

  return (
    <div style={{ padding: "56px 24px 32px", minHeight: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 30 }}>
        <button onClick={back} style={{
          background: T.card, border: "none", width: 42, height: 42, borderRadius: 21,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        }}><ArrowLeft size={18} color={T.ink} /></button>
        <div style={{ flex: 1, height: 4, borderRadius: 2, background: T.sunken, overflow: "hidden" }}>
          <div style={{ width: `${pct * 100}%`, height: "100%", background: T.ink, transition: "width 300ms ease" }} />
        </div>
        <span style={{ fontFamily: FONT_TEXT, fontSize: 13, color: T.faint, fontVariantNumeric: "tabular-nums" }}>
          {i + 1}/{QUESTIONS.length}
        </span>
      </div>

      <Eyebrow T={T}>{q.part === 2 ? "How you work the night" : "Your shift"}</Eyebrow>
      <Display T={T} size={28}>{q.q}</Display>
      {q.help && (
        <p style={{ fontFamily: FONT_TEXT, fontSize: 15, color: T.muted, marginTop: 10, lineHeight: 1.45 }}>{q.help}</p>
      )}

      <div style={{ marginTop: 26, flex: 1, overflowY: "auto" }}>
        {q.kind === "time" ? (
          <div>
            <TimeWheel T={T} value={a[q.key]} onChange={(v) => setA({ ...a, [q.key]: v })} />
            <div style={{
              textAlign: "center", marginTop: 14, fontFamily: FONT_TEXT,
              fontSize: 13.5, color: T.faint,
            }}>Scroll or tap to set the time</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {q.options.map((o) => {
              const on = q.multi ? asList(a[q.key]).includes(o.v) : a[q.key] === o.v;
              return (
                <button key={o.v}
                  onClick={() => setA({ ...a, [q.key]: q.multi ? toggleIn(a[q.key], o.v) : o.v })}
                  style={{
                    textAlign: "left", padding: "16px 18px", borderRadius: 18, cursor: "pointer",
                    border: `1.5px solid ${on ? T.ink : "transparent"}`, background: T.card,
                    display: "flex", alignItems: "center", gap: 12,
                  }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: FONT_TEXT, fontSize: 16.5, fontWeight: 600, color: T.ink }}>{o.l}</div>
                    {o.s && <div style={{ fontFamily: FONT_TEXT, fontSize: 13.5, color: T.muted, marginTop: 3 }}>{o.s}</div>}
                  </div>
                  {q.multi && (
                    <div style={{
                      width: 23, height: 23, borderRadius: 12, flexShrink: 0,
                      border: on ? "none" : `1.5px solid ${T.hair}`,
                      background: on ? T.ink : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>{on && <Check size={13} color={T.bg} strokeWidth={3.2} />}</div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <Btn T={T} full onClick={canNext ? next : undefined}
        style={{ marginTop: 18, opacity: canNext ? 1 : 0.35, cursor: canNext ? "pointer" : "default" }}>
        {i === QUESTIONS.length - 1 ? "Build my plan" : "Continue"} <ArrowRight size={18} />
      </Btn>
    </div>
  );
}

/* ------------------------------- plan review ------------------------------ */

const REVIEW = [
  {
    key: "sleep", cat: "sleep", title: "Your sleep window",
    rule: "Everything else is timed backward from when you sleep, not from when your shift ends.",
    lines: (p, ph) => [
      `Protected from ${fmt(ph.sleepStart)} to ${fmt(ph.sleepEnd)}`,
      `Wind-down starts ${fmt(ph.sleepStart - ph.end <= 60 ? ph.end - 30 : ph.end - 15)}`,
      p.sleepGoalHours <= 5 ? "Flagged as higher fatigue risk" : `${dur(p.sleepGoalHours * 60)} of sleep planned`,
    ],
    why: "Your sleep window is the anchor for the entire plan. Caffeine cutoffs, light reduction, meal timing, and wind-down are all calculated backward from it, which is why getting this one right matters more than any other setting.",
    controls: [{
      key: "chronotype", q: "Are you naturally more alert in the morning or the evening?",
      help: "Morning types tend to struggle more overnight, so the plan adds extra rest and fatigue check-ins.",
      options: [{ v: "morning", l: "Morning" }, { v: "evening", l: "Evening" }, { v: "neither", l: "Neither" }],
    }],
  },
  {
    key: "caffeine", cat: "caffeine", title: "Your caffeine plan",
    rule: "Caffeine stops far enough before sleep that it has faded by the time you lie down.",
    lines: (p, ph) => {
      const c = calculateCaffeineCutoff(p, ph);
      return p.caffeine === "none"
        ? ["Caffeine stays off your plan entirely", "Alertness comes from movement, light, and pacing"]
        : [
            `Best window opens ${fmt(ph.start + 20)}`,
            `Last cup by ${fmt(c)}`,
            p.caffeine === "high" ? "Water swaps added mid-shift" : "No caffeine suggestions after the cutoff",
          ];
    },
    why: "Caffeine is a short-term alertness tool, not a fix for a disrupted body clock. It takes hours to clear, so a cup late in the shift is still working when your sleep window opens.",
    controls: [{
      key: "caffeineSensitivity", q: "How sensitive are you to caffeine?",
      help: "This moves the cutoff. High sensitivity stops caffeine about eight hours before sleep; low, about five.",
      options: [{ v: "low", l: "Not very" }, { v: "normal", l: "Average" }, { v: "high", l: "Very sensitive" }],
    }],
  },
  {
    key: "water", cat: "water", title: "Your hydration",
    rule: "Water is front-loaded and paired with breaks, then eased off near sleep.",
    lines: (p, ph) => [
      `Bottle filled ${fmt(ph.start - 45)}`,
      "Water paired with every movement reset",
      p.bathroom === "yes" ? "Large drinks stop early to protect your sleep" : "Lighter drinks close to your sleep window",
    ],
    why: "Mild dehydration feels a lot like fatigue, which is why the urge for another coffee is often thirst. Front-loading also means fewer bathroom trips breaking up the sleep you are trying to protect.",
    controls: [
      {
        key: "hydration", q: "How often do you drink water during your shift?",
        options: [
          { v: "lots", l: "Often" }, { v: "some", l: "Sometimes" },
          { v: "little", l: "Rarely" }, { v: "caffeine", l: "Mostly coffee" },
        ],
      },
      {
        key: "bathroom", q: "Do bathroom trips interrupt your sleep?",
        help: "If yes, the plan moves hydration earlier and keeps late prompts small.",
        options: [{ v: "yes", l: "Yes, often" }, { v: "no", l: "Not really" }],
      },
    ],
  },
  {
    key: "movement", cat: "movement", title: "How often you get up",
    rule: "Short resets, often, rather than long breaks you will not take.",
    lines: (p) => [
      `A reset every ${movementInterval(p)} minutes`,
      p.breakControl === "low" ? "Kept under a minute, no need to leave your desk" : "Two to three minutes each",
      "Shortened automatically if you start skipping them",
    ],
    why: "Long unbroken sitting adds stiffness and drowsiness on top of the fatigue the night is already causing. Frequent short resets work better than occasional long ones, mostly because they are the ones people actually do.",
    controls: [
      {
        key: "sedentary", q: "How much of your shift is spent sitting?",
        options: [
          { v: "most", l: "Mostly seated" }, { v: "some", l: "About half" },
          { v: "little", l: "Mostly moving" }, { v: "desk", l: "Stuck at my desk" },
        ],
      },
      {
        key: "breakControl", q: "How much control do you have over your breaks?",
        help: "Low or unpredictable control switches every reset to something you can do without leaving your desk.",
        options: [
          { v: "high", l: "When I need one" }, { v: "fixed", l: "Fixed breaks" },
          { v: "unpredictable", l: "Unpredictable" }, { v: "low", l: "Rarely any" },
        ],
      },
    ],
  },
  {
    key: "light", cat: "light", title: "Light through the night",
    rule: "Brighter early, dimmer late. Light is timed, not constant.",
    lines: (p, ph) => [
      `Alertness lighting from ${fmt(ph.start + 30)}`,
      `Start dimming at ${fmt(ph.end - 90)}`,
      "Warmer screen settings before you head home",
    ],
    why: "Bright light early supports alertness at no cost. The same light close to your sleep window tells your body the day is beginning, which is the opposite of what you need after a night shift.",
    controls: [{
      key: "lightEnv", q: "What is your workspace lighting like?",
      options: [
        { v: "bright", l: "Bright overhead light" }, { v: "dim", l: "Dim" },
        { v: "screens", l: "Mostly screens" }, { v: "mixed", l: "Mixed" },
      ],
    }],
  },
  {
    key: "food", cat: "food", title: "When you eat",
    rule: "Main meal before the shift, something small and planned during it, light at the end.",
    lines: (p, ph) => [
      `Main meal at ${fmt(ph.start - 150)}`,
      `Planned snack around ${fmt(ph.start + ph.length * 0.45)}`,
      `Keep it light after ${fmt(ph.end - 60)}`,
    ],
    why: "This is about timing, not about what you eat or how much. Heavy food during the deep night or right before sleep tends to sit badly and make the sleep you get lighter.",
    controls: [{
      key: "mealPattern", q: "How do you usually eat during a night shift?",
      help: "If you tend to skip meals, the plan adds a planned snack rather than leaving a gap.",
      options: [
        { v: "before", l: "Full meal before work" }, { v: "during", l: "Main meal on shift" },
        { v: "snack", l: "I snack through" }, { v: "skip", l: "I often skip meals" },
      ],
    }],
  },
  {
    key: "recovery", cat: "recovery", title: "Getting home and recovering",
    rule: "The end of the shift is the highest-risk part of the night, so it is handled separately.",
    lines: (p, ph) => [
      p.commute === "drive" ? "Safety check before you drive, with no skip option" : "Light kept low on the way home",
      `Sleep preparation at ${fmt(ph.sleepStart - 30)}`,
      `Shown first: ${goalLabel(p).toLowerCase()}`,
    ],
    why: "Sleepiness on a night shift often peaks toward the end, which is exactly when most people commute. The plan treats that as a safety matter rather than another wellness prompt.",
    controls: [
      {
        key: "commute", q: "How do you get home after work?",
        help: "Driving changes how the last part of the plan is handled.",
        options: [
          { v: "drive", l: "I drive" }, { v: "transit", l: "Public transport" },
          { v: "driven", l: "Someone drives me" }, { v: "walk", l: "Walk or bike" },
        ],
      },
      {
        key: "goal", multi: true, q: "What matters most to you right now?",
        help: "Pick as many as apply. This decides what gets shown first, not what gets planned.",
        options: [
          { v: "sleep", l: "Better sleep" }, { v: "energy", l: "More energy" },
          { v: "caffeine", l: "Less caffeine" }, { v: "movement", l: "More movement" },
          { v: "eating", l: "Healthier eating" }, { v: "stress", l: "Less stress" },
          { v: "routine", l: "Steadier routine" },
        ],
      },
    ],
  },
];

function Review({ T, profile, onSave, startAt = 0, single = false, onDone }) {
  const [i, setI] = useState(startAt);
  const [editing, setEditing] = useState(single);
  const [draft, setDraft] = useState(profile);

  const seg = REVIEW[i];
  const d = DOMAIN[seg.cat];
  const ph = calculateShiftPhases(draft);
  const last = i === REVIEW.length - 1;

  const advance = () => {
    onSave(draft);
    if (single || last) onDone();
    else { setI(i + 1); setEditing(false); }
  };

  return (
    <div style={{ padding: "48px 22px 32px", minHeight: "100%", display: "flex", flexDirection: "column" }}>
      {!single && (
        <div style={{ display: "flex", gap: 5, marginBottom: 26 }}>
          {REVIEW.map((r, k) => (
            <div key={r.key} style={{
              flex: 1, height: 3, borderRadius: 2,
              background: k <= i ? DOMAIN[r.cat].hue : T.hair,
              transition: "background 300ms ease",
            }} />
          ))}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <Badge category={seg.cat} T={T} size={44} />
        <div>
          <div style={{
            fontFamily: FONT_TEXT, fontSize: 11, fontWeight: 700, letterSpacing: "0.13em",
            textTransform: "uppercase", color: d.hue,
          }}>{single ? "Adjust" : `${i + 1} of ${REVIEW.length}`}</div>
          <div style={{ fontFamily: FONT_TEXT, fontSize: 13, color: T.muted, marginTop: 2 }}>{d.label}</div>
        </div>
      </div>

      <Display T={T} size={30}>{seg.title}</Display>
      <p style={{ fontFamily: FONT_TEXT, fontSize: 15.5, lineHeight: 1.5, color: T.muted, margin: "10px 0 20px" }}>
        {seg.rule}
      </p>

      <Card T={T} style={{ padding: 6 }}>
        {seg.lines(draft, ph).map((l, k) => (
          <div key={k} style={{
            display: "flex", alignItems: "center", gap: 11, padding: "13px 14px",
            borderTop: k === 0 ? "none" : `1px solid ${T.hair}`,
          }}>
            <Check size={15} color={d.hue} strokeWidth={2.6} style={{ flexShrink: 0 }} />
            <span style={{ fontFamily: FONT_TEXT, fontSize: 15, color: T.ink, lineHeight: 1.35 }}>{l}</span>
          </div>
        ))}
      </Card>

      <div style={{
        marginTop: 14, padding: "14px 16px", borderRadius: 18, background: tint(d.hue, 0.09),
      }}>
        <div style={{
          fontFamily: FONT_TEXT, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.13em",
          textTransform: "uppercase", color: d.hue, marginBottom: 7,
        }}>Why this</div>
        <p style={{ fontFamily: FONT_TEXT, fontSize: 14, lineHeight: 1.5, color: T.muted, margin: 0 }}>
          {seg.why}
        </p>
      </div>

      {editing && (
        <div style={{ marginTop: 18 }}>
          {seg.controls.map((c) => (
            <div key={c.key} style={{ marginBottom: 18 }}>
              <div style={{ fontFamily: FONT_TEXT, fontSize: 15.5, fontWeight: 600, color: T.ink, marginBottom: 4 }}>
                {c.q}
              </div>
              {c.help && (
                <p style={{ fontFamily: FONT_TEXT, fontSize: 13, color: T.faint, margin: "0 0 10px", lineHeight: 1.4 }}>
                  {c.help}
                </p>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {c.options.map((o) => (
                  <Pill key={o.v} T={T} hue={d.hue}
                    active={c.multi ? asList(draft[c.key]).includes(o.v) : draft[c.key] === o.v}
                    onClick={() => setDraft({
                      ...draft,
                      [c.key]: c.multi ? toggleIn(draft[c.key], o.v) : o.v,
                    })}>{o.l}</Pill>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 20 }} />

      <div style={{ display: "flex", gap: 10 }}>
        {!editing && (
          <Btn T={T} kind="quiet" onClick={() => setEditing(true)} style={{ flex: 1 }}>
            <Pencil size={15} /> Adjust
          </Btn>
        )}
        <Btn T={T} onClick={advance} style={{ flex: editing ? 1 : 1.6 }}>
          {editing ? "Save and continue" : single ? "Done" : last ? "Build my plan" : "Sounds right"}
          {!editing && !last && !single && <ArrowRight size={17} />}
        </Btn>
      </div>
      {!single && (
        <button onClick={() => { onSave(draft); onDone(); }} style={{
          background: "none", border: "none", cursor: "pointer", marginTop: 12,
          fontFamily: FONT_TEXT, fontSize: 14, color: T.faint, padding: 6,
        }}>Skip the rest and show my plan</button>
      )}
    </div>
  );
}

/* ---------------------- recommendation page content ----------------------
   A modular text system: fixed sections, variable content. Every branch is
   selected from quiz answers, so two people never read the same page. */

function planSummary(profile) {
  const h = profile.sleepGoalHours;
  if (h <= 5) return {
    band: "under5", type: "High-fatigue protection plan",
    focus: "Rest, safety, and sleep protection.",
    sleep: "Protect sleep as early as possible.",
    caffeine: "Earlier cutoff and no late-shift caffeine",
  };
  if (h <= 6.5) return {
    band: "s56", type: "Short-sleep support plan",
    focus: "Add rest and protect sleep earlier.",
    sleep: "Use a nap or quiet rest if available.",
    caffeine: "Earlier caffeine window with a cutoff reminder",
  };
  if (h <= 9) return {
    band: "s79", type: "Steady rhythm plan",
    focus: "Keep your routine stable.",
    sleep: "Maintain your sleep window.",
    caffeine: "Use caffeine early, protect sleep later",
  };
  return {
    band: "over9", type: "Recovery-pattern plan",
    focus: "Support recovery, hold your timing.",
    sleep: "Track whether long sleep is recovery or routine.",
    caffeine: "Avoid late caffeine so sleep timing stays stable",
  };
}

const CAFFEINE_STRATEGY = {
  none: "No caffeine prompts unless you log one later.",
  low: "One optional window earlier in the shift.",
  moderate: "Timed caffeine with a sleep-protection cutoff.",
  high: "Tracking, cutoff warnings, and water swaps.",
};

const REST_STRATEGY = {
  before: "Pre-shift nap or quiet rest.",
  during: "In-shift nap or quiet rest.",
  both: "Pre-shift and in-shift rest options.",
  none: "Quiet rest, eye rest, and breathing instead of naps.",
};

const CAFFEINE_DESC = {
  none: "no caffeine during shifts", low: "light caffeine use",
  moderate: "moderate caffeine use", high: "heavy caffeine use",
};
const REMINDERS = [
  { k: "preMeal", l: "Pre-shift meal", cat: "food" },
  { k: "hydration", l: "Hydration checks", cat: "water" },
  { k: "caffeineOpen", l: "Caffeine window opens", cat: "caffeine" },
  { k: "caffeineCutoff", l: "Caffeine last call", cat: "caffeine" },
  { k: "movement", l: "Movement resets", cat: "movement" },
  { k: "rest", l: "Rest block", cat: "sleep" },
  { k: "snack", l: "Planned snack", cat: "food" },
  { k: "lightUp", l: "Alertness lighting", cat: "light" },
  { k: "lightDown", l: "Light reduction", cat: "light" },
  { k: "eyes", l: "Eye breaks", cat: "light" },
  { k: "checkin", l: "Fatigue check-in", cat: "recovery" },
  { k: "commute", l: "Commute safety check", cat: "recovery" },
  { k: "windDown", l: "Wind-down", cat: "sleep" },
  { k: "sleepWindow", l: "Sleep window", cat: "sleep" },
  { k: "wake", l: "Log your wake-up", cat: "sleep" },
  { k: "reflection", l: "Daily reflection", cat: "recovery" },
];

const REST_DESC = {
  before: "a pre-shift rest option", during: "an in-shift rest option",
  both: "rest options before and during", none: "no nap access",
};

/* timings the app may move are shown as a range, not a fixed number */
const gapRange = (g) => (g <= 45 ? `${g}` : `${g - 30}\u2013${g}`);

function buildRecommendation(profile, ph) {
  const p = planSummary(profile);
  const cutoff = calculateCaffeineCutoff(profile, ph);

  const sleepAnchor = {
    under5: "Because you usually sleep under five hours after a night shift, this plan treats your sleep as fragile and puts recovery first. It adds more rest prompts, reduces late stimulation, and checks in more often during the high-sleepiness stretch.",
    s56: "Because you usually sleep five to six hours, this plan adds extra protection around your sleep window. That may mean a rest block, an earlier caffeine cutoff, and a stronger wind-down.",
    s79: "Because you usually sleep seven to nine hours, this plan protects what already works. The goal is to avoid late-shift choices that could disrupt your sleep.",
    over9: "Because you usually sleep more than nine hours, this plan will watch whether the longer sleep is recovery after fatigue or simply your pattern. The goal is consistent timing without cutting rest you need.",
  }[p.band];

  const fatigue = {
    under5: { t: "Tonight starts with higher fatigue risk.", b: "Short sleep makes the night harder. The plan adds more fatigue check-ins, puts rest first where possible, and asks less of you late on. If you feel sleepy near the end, it will keep caffeine away from your sleep window and offer safer alternatives." },
    s56: { t: "Tonight needs extra support.", b: "Your usual sleep duration suggests sleep pressure will build during the shift. The plan adds rest, movement, hydration, and caffeine timing without pushing stimulation close to sleep." },
    s79: { t: "The plan will watch for changes.", b: "Your usual sleep duration gives the plan a stable starting point. If your night changes, the remaining checklist can shift toward rest, water, movement, and sleep protection." },
    over9: { t: "Tonight focuses on recovery balance.", b: "Longer sleep may reflect recovery from earlier fatigue. The plan keeps things gentle and asks you to log wake-up and sleep quality so future plans can adjust." },
  }[p.band];

  const caffeine = {
    none: { t: "Caffeine stays optional.", b: "You do not usually use caffeine during your shift, so the plan adds no caffeine prompts. If you log some later, it will check the timing against your sleep window and adjust the rest of the schedule.",
      items: ["No caffeine prompts by default", "Water reminders stay active", "Movement and light become your alertness tools", "Caffeine can still be logged by hand"] },
    low: { t: "Caffeine stays light and timed.", b: "You usually have one caffeinated drink, so the plan places it earlier in the shift if you want it. After that it switches to water, movement, and rest.",
      items: ["Optional caffeine window", "Log caffeine if you use it", "Water after caffeine", "No late-shift caffeine prompt"] },
    moderate: { t: "Caffeine gets a window and a cutoff.", b: "You usually have two or three drinks, so the plan treats caffeine as a timed alertness tool. It opens a window earlier in the shift and closes it before sleep protection begins.",
      items: ["First caffeine window", "Optional second log", `Final caffeine warning around ${cutoff ? fmt(cutoff) : "your cutoff"}`, "Switch to water", "No caffeine near your sleep window"] },
    high: { t: "Caffeine gets tracked closely.", b: "You usually have four or more drinks, so the plan adds tracking, cutoff warnings, and water swaps. This is not about shaming caffeine use — it is about stopping it from spilling into the part of the shift that protects your sleep.",
      items: ["Log each caffeine drink", "Water swap after caffeine", `Cutoff around ${cutoff ? fmt(cutoff) : "your cutoff"}`, "Late-shift no-caffeine reminder", "Sleep reflection after the shift"] },
  }[profile.caffeine];

  const rest = {
    before: { t: "Your rest window happens before work.", b: "Since you can rest before work, the plan places a nap or quiet rest block before your shift starts. That matters most on days you woke early or slept badly.",
      items: ["Pre-shift nap or quiet rest", "Wake-up buffer", "Hydration after rest", "Start shift mode"] },
    during: { t: "Your rest window happens during the shift.", b: "Since you can rest during your shift, the plan places a nap or quiet rest in the heavier part of the night. If sleep does not come, quiet rest still counts.",
      items: ["Nap or quiet rest", "Wake-up buffer", "Water after rest", "Gentle movement after waking", "Log how alert you feel"] },
    both: { t: "Your plan can use two rest options.", b: "Since you can rest before work and during your shift, the app picks the better one based on how the day is going. Poor sleep logged early leans toward a pre-shift nap; sleepiness mid-shift leans toward the in-shift block.",
      items: ["Pre-shift rest option", "In-shift rest option", "Wake-up buffer", "Log how you feel", "Rest timing adjusts over time"] },
    none: { t: "No nap access, so quiet rest replaces it.", b: "Naps are not available to you, so the plan does not force them. It uses short recovery resets instead: eye rest, breathing, low-stimulation pauses, water, and gentle movement.",
      items: ["Quiet rest block", "Eye rest", "Breathing reset", "Low-stimulation pause", "Gentle movement"] },
  }[profile.nap];

  const movement = {
    most: { t: "Your plan breaks up sitting often.", b: "Since most of your shift is seated, the plan adds regular micro-resets: short breaks to stand, stretch, rest your eyes, and drink water. These are interruptions to sitting, not workouts." },
    some: { t: "Your plan adds moderate movement checks.", b: "Since your shift is partly seated, the plan adds movement reminders at the points that matter without crowding your checklist." },
    little: { t: "Movement reminders stay light.", b: "Since your shift already includes movement, the plan keeps movement prompts minimal and puts more weight on rest, hydration, and sleep protection." },
    desk: { t: "Your resets stay desk-friendly.", b: "Since leaving your desk is difficult, the plan uses short seated resets: posture check, wrist stretch, neck release, eye rest, and breathing." },
  }[profile.sedentary];

  const light = {
    screens: { t: "Screen care becomes part of the plan.", b: "Since your work is mostly screen-based, the plan adds eye breaks and screen comfort checks. Closer to sleep it will suggest lower brightness or a warmer display where that is possible." },
    bright: { t: "Late-shift light reduction matters.", b: "Since your workplace is bright, the plan focuses on cutting unnecessary light exposure as your sleep window gets closer." },
    dim: { t: "Dim light may need alertness checks.", b: "Since your workplace is dim, the plan watches for sleepiness and may suggest alertness-supportive light earlier in the shift where it is available." },
    mixed: { t: "Light prompts stay balanced.", b: "Since your light exposure changes through the night, the plan works on timing: alertness support earlier, light reduction later." },
  }[profile.lightEnv];

  const food = {
    before: { t: "Your main meal is already anchored.", b: "Since you eat before work, the plan uses lighter snacks during the shift and keeps heavy food away from your sleep window." },
    during: { t: "Your shift meal gets timed earlier.", b: "Since your main meal happens during work, the plan tries to place it earlier in the shift and keeps late-shift food lighter." },
    snack: { t: "Snacks become planned instead of random.", b: "Since you tend to snack through the night, the plan adds planned snack windows and hydration checks to cut down fatigue-driven grazing." },
    skip: { t: "The plan adds simple food reminders.", b: "Since you often skip meals, the plan adds a basic food check so hunger does not build through the hardest part of the night." },
  }[profile.mealPattern];

  const water = {
    lots: "You already drink plenty, so hydration reminders stay light.",
    some: "Water checks are paired with movement breaks.",
    little: "Regular water reminders are added, paired with breaks.",
    caffeine: "Water swaps are added after caffeine, since most of your fluid is currently coffee or energy drinks.",
  }[profile.hydration];

  const startHere = {
    under5: "You usually sleep under five hours after a night shift, so this starts as a high-fatigue protection plan. Rest, safety, and sleep protection come first, and it will lean further that way if you log poor sleep or high sleepiness.",
    s56: "You usually sleep five to six hours after a night shift, so this starts as a short-sleep support plan. If you log poor sleep, late caffeine, skipped rest, or high sleepiness, the plan will adjust.",
    s79: "You usually sleep seven to nine hours after a night shift, so this starts as a steady rhythm plan. If you log poor sleep, late caffeine, skipped rest, or high sleepiness, the plan will adjust.",
    over9: "You usually sleep more than nine hours after a night shift, so this starts as a recovery-pattern plan. It will track whether that is recovery or routine, and adjust as your logs build up.",
  }[p.band];

  /* short checklist: always-on items plus the ones your answers add */
  const checklist = [
    `Shift: ${fmt(ph.start)} to ${fmt(ph.end)}`,
    `Sleep window: ${fmt(ph.sleepStart)}`,
    profile.caffeine === "none"
      ? "Water instead of caffeine prompts"
      : `Caffeine closes around ${fmt(cutoff)}`,
    {
      before: "Nap or quiet rest before the shift",
      during: "Nap or quiet rest during the shift",
      both: "Rest before or during, whichever fits",
      none: "Quiet rest in the hardest stretch",
    }[profile.nap],
    `Movement resets every ${gapRange(movementInterval(profile))} minutes`,
    `Light and screen brightness reduce around ${fmt(ph.end - ov(profile, "lightDownLead", 90))}`,
    "Planned snack and water checks",
    "Wind-down before sleep",
  ];
  if (p.band === "under5" || p.band === "s56") checklist.push("Extra fatigue check-in");
  if (profile.commute === "drive") checklist.push("Drowsiness check before you drive");
  checklist.push("Daily reflection after sleep");

  return { p, sleepAnchor, fatigue, caffeine, rest, movement, light, food, water, startHere, checklist, cutoff };
}

function Recommendation({ T, profile, revisit, onDone, onAdjust }) {
  const ph = calculateShiftPhases(profile);
  const r = buildRecommendation(profile, ph);

  const Section = ({ cat, title, body, items, adjustable }) => (
    <Card T={T} style={{ marginBottom: 12, padding: 18 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <Badge category={cat} T={T} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: 700, color: T.ink,
            letterSpacing: "-0.02em", lineHeight: 1.2,
          }}>{title}</div>
          <p style={{ fontFamily: FONT_TEXT, fontSize: 14.5, lineHeight: 1.55, color: T.muted, margin: "8px 0 0" }}>
            {body}
          </p>
          {items && (
            <div style={{ marginTop: 12 }}>
              {items.map((it) => (
                <div key={it} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "4px 0" }}>
                  <Check size={14} color={DOMAIN[cat].hue} strokeWidth={2.6}
                    style={{ flexShrink: 0, marginTop: 3 }} />
                  <span style={{ fontFamily: FONT_TEXT, fontSize: 14, color: T.ink, lineHeight: 1.4 }}>{it}</span>
                </div>
              ))}
            </div>
          )}
          {adjustable !== undefined && (
            <button onClick={() => onAdjust(adjustable)} style={{
              background: "none", border: "none", cursor: "pointer", padding: "11px 0 0",
              fontFamily: FONT_TEXT, fontSize: 13, color: DOMAIN[cat].hue, fontWeight: 600,
              display: "flex", alignItems: "center", gap: 5,
            }}><Pencil size={12} /> Adjust this</button>
          )}
        </div>
      </div>
    </Card>
  );

  const Row = ({ k, v }) => (
    <div style={{ display: "flex", gap: 12, padding: "9px 0", borderTop: `1px solid ${T.hair}` }}>
      <span style={{ fontFamily: FONT_TEXT, fontSize: 13.5, color: T.muted, width: 118, flexShrink: 0 }}>{k}</span>
      <span style={{ fontFamily: FONT_TEXT, fontSize: 13.5, fontWeight: 600, color: T.ink, flex: 1 }}>{v}</span>
    </div>
  );

  return (
    <div style={{ padding: "44px 20px 40px" }}>
      <Eyebrow T={T}>{revisit ? "Your plan, explained" : "Your starting plan"}</Eyebrow>
      <Display T={T} size={32}>Your night-shift plan is ready.</Display>
      <p style={{ fontFamily: FONT_TEXT, fontSize: 15.5, lineHeight: 1.5, color: T.muted, margin: "10px 0 18px" }}>
        Built from your answers: a {fmt(ph.start)} to {fmt(ph.end)} shift, a planned{" "}
        {fmt(ph.sleepStart)} sleep window, {CAFFEINE_DESC[profile.caffeine]}, and{" "}
        {REST_DESC[profile.nap]}.
      </p>

      <Card T={T} style={{ padding: "6px 18px 14px", marginBottom: 12 }}>
        <Row k="Plan type" v={r.p.type} />
        <Row k="Main focus" v={r.p.focus} />
        <Row k="Sleep" v={r.p.sleep} />
        <Row k="Caffeine" v={CAFFEINE_STRATEGY[profile.caffeine]} />
        <Row k="Rest" v={REST_STRATEGY[profile.nap]} />
      </Card>

      <div style={{
        padding: "16px 18px", borderRadius: 20, marginBottom: 22,
        background: tint(DOMAIN.sleep.hue, T.tintA),
      }}>
        <div style={{
          fontFamily: FONT_TEXT, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.13em",
          textTransform: "uppercase", color: DOMAIN.sleep.hue, marginBottom: 8,
        }}>Start here</div>
        <p style={{ fontFamily: FONT_TEXT, fontSize: 14.5, lineHeight: 1.55, color: T.ink, margin: 0 }}>
          {r.startHere}
        </p>
      </div>

      <Section cat="sleep" title="Your sleep window is the anchor." adjustable={0}
        body={`Your planned sleep time is ${fmt(ph.sleepStart)}. Caffeine, light, food, and wind-down are timed backward from that sleep window. ${r.sleepAnchor}`} />
      <Section cat="recovery" title={r.fatigue.t} body={r.fatigue.b} />
      <Section cat="caffeine" title={r.caffeine.t} body={r.caffeine.b} items={r.caffeine.items} adjustable={1} />
      <Section cat="sleep" title={r.rest.t} body={r.rest.b} items={r.rest.items} />
      <Section cat="movement" title={r.movement.t} body={r.movement.b} adjustable={3} />
      <Section cat="light" title={r.light.t} body={r.light.b} adjustable={4} />
      <Section cat="food" title={r.food.t} body={`${r.food.b} ${r.water}`} adjustable={5} />

      <Eyebrow T={T}>Tonight, in short</Eyebrow>
      <Card T={T} style={{ padding: "10px 18px", marginBottom: 18 }}>
        {r.checklist.map((c, k) => (
          <div key={c} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "11px 0",
            borderTop: k === 0 ? "none" : `1px solid ${T.hair}`,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: 3, background: T.faint, flexShrink: 0 }} />
            <span style={{ fontFamily: FONT_TEXT, fontSize: 14.5, color: T.ink }}>{c}</span>
          </div>
        ))}
      </Card>

      <div style={{ margin: "0 4px 24px" }}>
        <div style={{
          fontFamily: FONT_DISPLAY, fontSize: 19, fontWeight: 700, color: T.ink,
          letterSpacing: "-0.02em", marginBottom: 8,
        }}>This plan will change with you.</div>
        <p style={{ fontFamily: FONT_TEXT, fontSize: 14.5, lineHeight: 1.6, color: T.muted, margin: 0 }}>
          This is a starting plan, not a fixed rule. It works backward from your planned sleep
          and forward from your shift start. It will adjust when you log caffeine, sleepiness,
          meals, water, skipped breaks, rest, or the sleep you actually get.
        </p>
      </div>

      <Btn T={T} full onClick={onDone}>
        {revisit ? "Back to my plan" : "Start my plan"} <ArrowRight size={18} />
      </Btn>
    </div>
  );
}

function Generating({ onDone }) {
  const T = WARM;
  const steps = ["Digging up your shift", "Locating the 3 AM problem", "Timing caffeine backward from sleep", "Burying the busywork"];
  const [i, setI] = useState(0);
  useEffect(() => {
    if (i >= steps.length) { const t = setTimeout(onDone, 400); return () => clearTimeout(t); }
    const t = setTimeout(() => setI(i + 1), 520);
    return () => clearTimeout(t);
  }, [i]);
  return (
    <div style={{ padding: "0 28px", minHeight: "100%", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <Display T={T} size={30} style={{ marginBottom: 26 }}>Building your plan.</Display>
      {steps.map((s, k) => (
        <div key={s} style={{
          display: "flex", alignItems: "center", gap: 12, padding: "9px 0",
          opacity: k <= i ? 1 : 0.25, transition: "opacity 300ms ease",
        }}>
          {k < i
            ? <Check size={17} color={DOMAIN.movement.hue} />
            : <div style={{ width: 17, height: 17, borderRadius: 9, border: `2px solid ${T.faint}` }} />}
          <span style={{ fontFamily: FONT_TEXT, fontSize: 15.5, color: k < i ? T.ink : T.muted }}>{s}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------- timeline card ---------------------------- */

function TimelineItem({ item, T, status, onAct, now, showRail = true }) {
  const d = DOMAIN[item.category] || DOMAIN.shift;
  const [open, setOpen] = useState(false);
  const done = status === "done";
  const skipped = status === "skipped";
  const past = item.at <= now;
  const current = past && !done && !skipped;

  return (
    <div style={{ display: "flex", gap: 12, opacity: done || skipped ? 0.45 : 1, transition: "opacity 250ms ease" }}>
      {showRail && (
        <div style={{ width: 52, flexShrink: 0, paddingTop: 17, textAlign: "right" }}>
          <span style={{
            fontFamily: FONT_DISPLAY, fontSize: 14, fontWeight: 600, color: current ? d.hue : T.faint,
            fontVariantNumeric: "tabular-nums",
          }}>{fmt(item.at)}</span>
        </div>
      )}
      <Card T={T} style={{
        flex: 1, marginBottom: 10, padding: 15,
        border: current ? `1.5px solid ${tint(d.hue, 0.5)}` : (T.key === "dark" ? `1px solid ${T.hair}` : "none"),
      }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <Badge category={item.category} T={T} size={36} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: FONT_TEXT, fontSize: 16, fontWeight: 600, color: T.ink,
              textDecoration: done ? "line-through" : "none",
            }}>{item.title}</div>
            <p style={{ fontFamily: FONT_TEXT, fontSize: 14, lineHeight: 1.45, color: T.muted, margin: "5px 0 0" }}>
              {item.msg}
            </p>
            {item.changed && (
              <div style={{
                display: "flex", alignItems: "flex-start", gap: 7, marginTop: 10,
                padding: "9px 11px", borderRadius: 12, background: tint(d.hue, 0.11),
              }}>
                <RotateCcw size={13} color={d.hue} style={{ flexShrink: 0, marginTop: 2 }} />
                <span style={{ fontFamily: FONT_TEXT, fontSize: 13, lineHeight: 1.4, color: d.hue, fontWeight: 500 }}>
                  {item.changed}
                </span>
              </div>
            )}
            {item.why && (
              <button onClick={() => setOpen(!open)} style={{
                background: "none", border: "none", padding: "9px 0 0", cursor: "pointer",
                fontFamily: FONT_TEXT, fontSize: 13, color: T.faint, fontWeight: 500,
                display: "flex", alignItems: "center", gap: 5,
              }}>
                <Info size={13} /> Why this
              </button>
            )}
            {open && item.why && (
              <p style={{
                fontFamily: FONT_TEXT, fontSize: 13.5, lineHeight: 1.5, color: T.muted,
                margin: "8px 0 0", padding: "11px 13px", borderRadius: 12,
                background: T.key === "warm" ? T.sunken : "rgba(255,255,255,0.04)",
              }}>{item.why}</p>
            )}

            {!done && !skipped && (
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                {item.actions.map((act) => {
                  const map = {
                    done: { l: "Done", kind: "tinted" },
                    skip: { l: "Skip", kind: "quiet" },
                    adjust: { l: "Adjust", kind: "quiet" },
                    logCaffeine: { l: "Log caffeine", kind: "tinted" },
                    logWater: { l: "Log water", kind: "tinted" },
                    logNap: { l: "Log rest", kind: "tinted" },
                    endShift: { l: "End shift", kind: "tinted" },
                    sleepStart: { l: "Going to sleep", kind: "tinted" },
                  }[act];
                  return (
                    <Btn key={act} T={T} kind={map.kind} hue={d.hue}
                      onClick={() => onAct(act, item)}
                      style={{ fontSize: 13.5, padding: "8px 15px" }}>{map.l}</Btn>
                  );
                })}
              </div>
            )}
            {(done || skipped) && (
              <div style={{ fontFamily: FONT_TEXT, fontSize: 13, color: T.faint, marginTop: 9,
                display: "flex", alignItems: "center", gap: 6 }}>
                {done ? <><Check size={13} /> Done</> : <>Skipped — the plan adapted</>}
                <button onClick={() => onAct("undo", item)} style={{
                  background: "none", border: "none", cursor: "pointer", color: T.faint,
                  fontFamily: FONT_TEXT, fontSize: 13, textDecoration: "underline", padding: 0, marginLeft: 4,
                }}>undo</button>
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ----------------------------------- app ---------------------------------- */

export default function App() {
  const [screen, setScreen] = useState("welcome");
  const [tab, setTab] = useState("dashboard");
  const [profile, setProfile] = useState(null);
  const [logs, setLogs] = useState([]);
  const [now, setNow] = useState(0);
  const [sheet, setSheet] = useState(null);
  const [toast, setToast] = useState(null);
  const [answer, setAnswer] = useState(null);
  const [themeOverride, setThemeOverride] = useState(null);
  const [reflection, setReflection] = useState({});
  const [review, setReview] = useState({ index: 0, single: false, back: "app" });
  const [whyOpen, setWhyOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [showAllPlan, setShowAllPlan] = useState(false);
  const [hideDone, setHideDone] = useState(true);
  const [exportText, setExportText] = useState(null);
  const [logDraft, setLogDraft] = useState({ type: "water", h: 12, m: 0, ap: "AM", note: "" });
  const [range, setRange] = useState(28);
  const [adjusting, setAdjusting] = useState(null);
  const [adjustDraft, setAdjustDraft] = useState({});
  const [quickResult, setQuickResult] = useState(null);
  const [playing, setPlaying] = useState(null);
  const [timeEdit, setTimeEdit] = useState(null);
  const [editingLog, setEditingLog] = useState(null);

  /* restore */
  useEffect(() => {
    (async () => {
      const saved = await store.get("nsp:v1");
      if (saved && saved.profile) {
        setProfile(saved.profile);
        setLogs(saved.logs || []);
        setNow(realNow(calculateShiftPhases(saved.profile)));
        setScreen("app");
      }
    })();
  }, []);
  useEffect(() => {
    if (profile) store.set("nsp:v1", { profile, logs, now });
  }, [profile, logs, now]);
  useEffect(() => {
    if (profile && history.length === 0) setHistory(seedHistory(profile, 56));
  }, [profile]);
  useEffect(() => {
    if (!profile) return;
    const tick = () => setNow(realNow(calculateShiftPhases(profile)));
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [profile && profile.shiftStart, profile && profile.shiftEnd, profile && profile.plannedSleep]);

  const plan = useMemo(
    () => (profile ? generateTimeline(profile, logs, now) : null),
    [profile, logs, now]
  );
  const advice = useMemo(
    () => (plan ? generateAdvice(profile, logs, now, plan) : null),
    [plan, profile, logs, now]
  );

  const inShift = plan && now >= plan.ph.start && now < plan.ph.end;
  const autoTheme = inShift || (plan && now >= plan.ph.sleepStart && now < plan.ph.sleepEnd);
  const T = (themeOverride ?? autoTheme) ? DARK : WARM;

  const push = (type, value, note) => {
    const entry = {
      id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      t: now, type, value, note,
    };
    setLogs((L) => [...L, entry]);
    return entry;
  };
  const say = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2600); };

  const finishQuiz = (a) => {
    const p = { ...a, caffeineSensitivity: "normal", chronotype: "neither", bathroom: "no" };
    setProfile(p);
    setNow(realNow(calculateShiftPhases(p)));
    setScreen("generating");
  };

  const onAct = (act, item) => {
    if (act === "undo") {
      setLogs((L) => L.filter((l) => !(l.type === "item" && l.value.id === item.id)));
      return;
    }
    if (act === "done" || act === "skip") {
      push("item", { id: item.id, status: act === "done" ? "done" : "skipped", category: item.category });
      if (act === "skip" && item.category === "movement") say("Skipped breaks happen. The next reset will be shorter.");
      return;
    }
    if (act === "adjust") {
      if (item.adjust && item.adjust.length) {
        setAdjustDraft({});
        setAdjusting(item.id);
        return;
      }
      const idx = Math.max(0, REVIEW.findIndex((r) => r.cat === item.category));
      setReview({ index: idx, single: true, back: "app" });
      setScreen("review");
      return;
    }
    if (act === "logCaffeine") { logCaffeine(); return; }
    if (act === "logWater") { push("water", 1); say("Water logged."); return; }
    if (act === "logNap") { setSheet("nap"); return; }
    if (act === "endShift") { push("endShift", 1); say("Recovery mode. Caffeine prompts are off."); return; }
    if (act === "sleepStart") { push("sleepStart", 1); say("Sleep logged. Log your wake-up to shape the next plan."); return; }
  };

  const logCaffeine = () => {
    const cutoff = plan.state.cutoff;
    push("caffeine", 1);
    if (cutoff && now >= cutoff) {
      say("That is inside your sleep window. The rest of the plan switches to sleep protection.");
    } else if (cutoff && now >= cutoff - 60) {
      say("Close to your cutoff. Later caffeine suggestions are off.");
    } else {
      say("Logged. Still well inside your window.");
    }
  };

  /* --------------------------- pre-app screens ---------------------------- */
  if (screen === "welcome")
    return <Frame T={WARM}><Welcome onNext={() => setScreen("disclaimer")} /></Frame>;
  if (screen === "disclaimer")
    return <Frame T={WARM}><Disclaimer onNext={() => setScreen("quiz")} onBack={() => setScreen("welcome")} /></Frame>;
  if (screen === "quiz")
    return <Frame T={WARM}><Quiz onDone={finishQuiz} onBack={() => setScreen("disclaimer")} /></Frame>;
  if (screen === "generating")
    return <Frame T={WARM}><Generating onDone={() => setScreen("recommendation")} /></Frame>;
  if (screen === "recommendation" || screen === "recommendation-revisit") {
    const revisit = screen === "recommendation-revisit";
    const RT = revisit ? T : WARM;
    return (
      <Frame T={RT}>
        <Recommendation
          T={RT} profile={profile} revisit={revisit}
          onDone={() => setScreen("app")}
          onAdjust={(idx) => {
            setReview({ index: idx, single: true, back: screen });
            setScreen("review");
          }}
        />
      </Frame>
    );
  }
  if (screen === "review") {
    const RT = review.single ? T : WARM;
    return (
      <Frame T={RT}>
        <Review
          T={RT} profile={profile} onSave={setProfile}
          startAt={review.index} single={review.single}
          onDone={() => {
            const back = review.back || "app";
            setReview({ index: 0, single: false, back: "app" });
            setScreen(back);
          }}
        />
      </Frame>
    );
  }

  const { ph, state: s } = plan;
  const shiftPct = (now - ph.start) / ph.length;

  /* ------------------------------- dashboard ------------------------------ */
  const Dashboard = () => {
    const hist = history.slice(-range);
    const st = rangeStats(profile, hist);
    const pat = readPatterns(profile, st);
    const rangeLabel = (RANGES.find((r) => r.n === range) || RANGES[2]).l;
    const thin = Math.max(0, Math.floor(hist.length / 7) - 1);
    const axis = { fill: T.faint, fontSize: 10.5, fontFamily: FONT_TEXT };

    const sleep = hist.map((h) => ({
      day: h.label, base: nightAxis(h.sleepStart), len: h.sleepHours * 60, hours: h.sleepHours,
    }));
    const lo = Math.min(...sleep.map((d) => d.base)) - 40;
    const hi = Math.max(...sleep.map((d) => d.base + d.len)) + 40;
    const wake = hist.map((h) => ({ day: h.label, wake: nightAxis(h.wake) }));
    const caff = hist.map((h) => {
      const row = { day: h.label, cutoff: nightAxis(h.cutoff) };
      h.caffeine.slice(0, 5).forEach((c, k) => { row[`c${k + 1}`] = nightAxis(c); });
      return row;
    });
    const moves = hist.map((h) => ({
      day: h.label, pct: Math.round((h.moveDone / Math.max(1, h.moveTotal)) * 100),
    }));
    const rests = hist.map((h) => ({ day: h.label, mins: h.restMin, kind: h.restKind }));

    const Panel = ({ cat, title, sub, line, children, height = 160 }) => (
      <Card T={T} style={{ marginBottom: 12, padding: "16px 12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 6px 12px" }}>
          <Badge category={cat} T={T} size={30} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: FONT_TEXT, fontSize: 15, fontWeight: 600, color: T.ink }}>{title}</div>
            <div style={{ fontFamily: FONT_TEXT, fontSize: 12.5, color: T.muted, marginTop: 1 }}>{sub}</div>
          </div>
        </div>
        {children && <div style={{ height }}>{children}</div>}
        {line && (
          <p style={{
            fontFamily: FONT_TEXT, fontSize: 13.5, lineHeight: 1.5, color: T.muted,
            margin: "12px 6px 0", paddingTop: 12, borderTop: `1px solid ${T.hair}`,
          }}>{line}</p>
        )}
      </Card>
    );

    const Tile = ({ cat, k, v }) => (
      <div style={{
        background: tint(DOMAIN[cat].hue, T.tintA), borderRadius: 18, padding: "13px 14px",
      }}>
        <div style={{ fontFamily: FONT_TEXT, fontSize: 12, color: T.muted }}>{k}</div>
        <div style={{
          fontFamily: FONT_DISPLAY, fontSize: 21, fontWeight: 700, color: DOMAIN[cat].hue,
          letterSpacing: "-0.02em", marginTop: 3,
        }}>{v}</div>
      </div>
    );

    return (
      <div style={{ padding: "4px 20px 0" }}>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 18 }}>
          {RANGES.map((r) => (
            <Pill key={r.key} T={T} hue={DOMAIN.sleep.hue} active={range === r.n}
              onClick={() => setRange(r.n)}>{r.l}</Pill>
          ))}
        </div>

        <Eyebrow T={T}>{rangeLabel}</Eyebrow>
        <Display T={T} size={32} style={{ marginBottom: 6 }}>
          {st.avgSleep.toFixed(1)}h average sleep.
        </Display>
        <p style={{ fontFamily: FONT_TEXT, fontSize: 14.5, color: T.muted, lineHeight: 1.45, marginBottom: 16 }}>
          {profile.caffeine === "none"
            ? "No caffeine prompts in your plan this period."
            : `${st.lateCount} of ${st.n} nights had caffeine after your cutoff.`}
        </p>

        <div style={{
          padding: "14px 16px", borderRadius: 18, marginBottom: 18,
          background: tint(DOMAIN.recovery.hue, T.tintA),
        }}>
          <div style={{
            fontFamily: FONT_TEXT, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.13em",
            textTransform: "uppercase", color: DOMAIN.recovery.hue, marginBottom: 7,
          }}>Main pattern</div>
          <p style={{ fontFamily: FONT_TEXT, fontSize: 14.5, lineHeight: 1.5, color: T.ink, margin: 0 }}>
            {pat.mainPattern}
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginBottom: 20 }}>
          <Tile cat="sleep" k="Average sleep" v={`${st.avgSleep.toFixed(1)}h`} />
          <Tile cat="caffeine" k="Cutoff crossed" v={`${st.lateCount} nights`} />
          <Tile cat="movement" k="Movement resets" v={`${st.movePct}% done`} />
          <Tile cat="recovery" k="Most sleepy" v={SLEEPY_LABEL[st.sleepyWindow]} />
        </div>

        <Panel cat="sleep" title="Sleep average" sub={`Across ${st.n} nights`} line={pat.sleepAvgLine} />

        <Panel cat="sleep" title="When you slept"
          sub="Each bar is one sleep block, start to wake" line={pat.sleepTiming} height={170}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sleep} margin={{ left: -16, right: 8, top: 4, bottom: 0 }}>
              <CartesianGrid stroke={T.hair} vertical={false} />
              <XAxis dataKey="day" tick={axis} axisLine={false} tickLine={false} interval={thin} />
              <YAxis domain={[lo, hi]} tickFormatter={nightTick} tick={axis}
                axisLine={false} tickLine={false} width={40} />
              <Bar dataKey="base" stackId="a" fill="transparent" />
              <Bar dataKey="len" stackId="a" radius={[4, 4, 4, 4]}>
                {sleep.map((d, k) => (
                  <Cell key={k} fill={d.hours < 5 ? DOMAIN.food.hue : DOMAIN.sleep.hue} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel cat="light" title="Wake time drift"
          sub={`Moved by about ${st.wakeDrift.toFixed(1)} hours`} line={pat.wakeDrift}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={wake} margin={{ left: -14, right: 12, top: 8, bottom: 0 }}>
              <CartesianGrid stroke={T.hair} vertical={false} />
              <XAxis dataKey="day" tick={axis} axisLine={false} tickLine={false} interval={thin} />
              <YAxis tickFormatter={nightTick} tick={axis} axisLine={false} tickLine={false} width={40} />
              <Line type="monotone" dataKey="wake" stroke={DOMAIN.light.hue} strokeWidth={2.2}
                dot={hist.length > 20 ? false : { r: 3.5, fill: DOMAIN.light.hue, strokeWidth: 0 }} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>

        <Panel cat="caffeine" title="Caffeine against your cutoff"
          sub="Dots above the line landed too late" line={pat.caffeine}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={caff} margin={{ left: -14, right: 12, top: 8, bottom: 0 }}>
              <CartesianGrid stroke={T.hair} vertical={false} />
              <XAxis dataKey="day" tick={axis} axisLine={false} tickLine={false} interval={thin} />
              <YAxis tickFormatter={nightTick} tick={axis} axisLine={false} tickLine={false} width={40} />
              <Line dataKey="cutoff" stroke={DOMAIN.sleep.hue} strokeWidth={1.6}
                strokeDasharray="5 5" dot={false} />
              {["c1", "c2", "c3", "c4", "c5"].map((k) => (
                <Line key={k} dataKey={k} stroke="none"
                  dot={{ r: hist.length > 20 ? 2.8 : 4, fill: DOMAIN.caffeine.hue, strokeWidth: 0 }} />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </Panel>

        <Panel cat="movement" title="Movement resets"
          sub={`${st.moveDone} of ${st.moveTotal} completed`} line={pat.movement} height={130}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={moves} margin={{ left: -20, right: 12, top: 8, bottom: 0 }}>
              <CartesianGrid stroke={T.hair} vertical={false} />
              <XAxis dataKey="day" tick={axis} axisLine={false} tickLine={false} interval={thin} />
              <YAxis tick={axis} axisLine={false} tickLine={false} width={34} domain={[0, 100]} />
              <Bar dataKey="pct" radius={[4, 4, 0, 0]}>
                {moves.map((d, k) => (
                  <Cell key={k} fill={d.pct >= 60 ? DOMAIN.movement.hue : tint(DOMAIN.movement.hue, 0.4)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel cat="recovery" title="Rest blocks"
          sub={`${st.naps} naps · ${st.quiets} quiet rests · ${st.missed} missed`}
          line={pat.rest} height={130}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rests} margin={{ left: -20, right: 12, top: 8, bottom: 0 }}>
              <CartesianGrid stroke={T.hair} vertical={false} />
              <XAxis dataKey="day" tick={axis} axisLine={false} tickLine={false} interval={thin} />
              <YAxis tick={axis} axisLine={false} tickLine={false} width={34} />
              <Bar dataKey="mins" radius={[4, 4, 0, 0]}>
                {rests.map((d, k) => (
                  <Cell key={k} fill={d.kind === "nap" ? DOMAIN.sleep.hue
                    : d.kind === "quiet" ? DOMAIN.recovery.hue : T.hair} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel cat="recovery" title="Sleepiness pattern"
          sub={`Most common: ${SLEEPY_LABEL[st.sleepyWindow].toLowerCase()}`} line={pat.fatigue} />
        <Panel cat="food" title="Food and hydration"
          sub={`${st.waterAvg.toFixed(1)} water logs per shift`} line={pat.foodHydration} />
        <Panel cat="light" title="Light and screen care"
          sub={`${st.lateLightDone} of ${st.n} late-light reminders done`} line={pat.light} />

        <Eyebrow T={T}>What the plan noticed</Eyebrow>
        <Card T={T} style={{ padding: "6px 18px", marginBottom: 18 }}>
          {pat.noticed.map((nn, k) => (
            <div key={nn} style={{
              display: "flex", alignItems: "flex-start", gap: 10, padding: "13px 0",
              borderTop: k === 0 ? "none" : `1px solid ${T.hair}`,
            }}>
              <div style={{
                width: 6, height: 6, borderRadius: 3, background: DOMAIN.recovery.hue,
                flexShrink: 0, marginTop: 7,
              }} />
              <span style={{ fontFamily: FONT_TEXT, fontSize: 14.5, color: T.ink, lineHeight: 1.5 }}>{nn}</span>
            </div>
          ))}
        </Card>

        <Eyebrow T={T}>Next plan adjustment</Eyebrow>
        <Card T={T} style={{ padding: 18, marginBottom: 16 }}>
          <p style={{ fontFamily: FONT_TEXT, fontSize: 14.5, lineHeight: 1.55, color: T.ink, margin: 0 }}>
            {pat.adjustment.text}
          </p>
          {pat.adjustment.apply && (
            <div style={{ display: "flex", gap: 9, marginTop: 16 }}>
              <Btn T={T} style={{ flex: 1.4, fontSize: 14.5 }} onClick={() => {
                setProfile(pat.adjustment.apply(profile));
                say(pat.adjustment.done);
              }}>Apply to next plan</Btn>
              <Btn T={T} kind="quiet" style={{ flex: 1, fontSize: 14.5 }}
                onClick={() => say("Keeping your current plan.")}>Keep current</Btn>
            </div>
          )}
        </Card>

        <div style={{
          display: "flex", alignItems: "flex-start", gap: 8, margin: "0 4px 8px",
          fontFamily: FONT_TEXT, fontSize: 13, color: T.faint, lineHeight: 1.45,
        }}>
          <Info size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          Pattern tracking for sleep protection and recovery. Nothing here is a score,
          and nothing here is graded.
        </div>
      </div>
    );
  };

  /* --------------------------------- plan --------------------------------- */
  const PlanTab = () => {
    const moves = plan.items.filter((i) => i.id.startsWith("move-"));
    const others = plan.items.filter((i) => !i.id.startsWith("move-"));
    const collapsed = !showAllPlan && moves.length > 1;
    let display = collapsed
      ? [...others, { ...moves[0], recurring: moves }].sort((a, b) => a.at - b.at)
      : plan.items;
    if (hideDone) display = display.filter((i) => s.itemStatus(i.id) === "open" || i.recurring);

    const groups = ph.phases.map((p) => ({
      ...p, items: display.filter((i) => i.at >= p.from && i.at < p.to),
    })).filter((g) => g.items.length);

    const doneCount = plan.items.filter((i) => s.itemStatus(i.id) === "done").length;

    return (
      <div style={{ padding: "4px 20px 0" }}>
        <Eyebrow T={T}>Tonight's plan</Eyebrow>
        <Display T={T} size={32} style={{ marginBottom: 14 }}>
          {doneCount} of {plan.items.length} done.
        </Display>

        <Card T={T} onClick={() => setScreen("recommendation-revisit")}
          style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 13, padding: 15 }}>
          <Badge category="recovery" T={T} size={34} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: FONT_TEXT, fontSize: 15.5, fontWeight: 600, color: T.ink }}>
              Why this plan
            </div>
            <div style={{ fontFamily: FONT_TEXT, fontSize: 13, color: T.muted, marginTop: 2 }}>
              {planSummary(profile).type}
            </div>
          </div>
          <ChevronRight size={17} color={T.faint} />
        </Card>

        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          <Pill T={T} hue={DOMAIN.shift.hue} active={hideDone} onClick={() => setHideDone(!hideDone)}>
            {hideDone ? "Remaining only" : "Showing everything"}
          </Pill>
          {moves.length > 1 && (
            <Pill T={T} hue={DOMAIN.movement.hue} active={!collapsed}
              onClick={() => setShowAllPlan(!showAllPlan)}>
              {collapsed ? "Resets grouped" : "Resets expanded"}
            </Pill>
          )}
        </div>

        {groups.map((g) => {
          const overlaps = ph.deepNight && overlap([g.from, g.to], ph.deepNight);
          return (
            <div key={g.key} style={{ marginBottom: 22 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12, paddingLeft: 4 }}>
                <span style={{
                  fontFamily: FONT_TEXT, fontSize: 11, fontWeight: 700, letterSpacing: "0.13em",
                  textTransform: "uppercase", color: T.faint,
                }}>{g.label}</span>
                <span style={{ flex: 1, height: 1, background: T.hair }} />
                {overlaps && (
                  <span style={{
                    fontFamily: FONT_TEXT, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em",
                    textTransform: "uppercase", color: "#6C6BE8",
                    background: tint("#6C6BE8", 0.14), padding: "4px 9px", borderRadius: 999,
                  }}>Circadian low</span>
                )}
              </div>
              {g.items.map((it) =>
                it.recurring ? (
                  <RecurringCard key="recurring" item={it} T={T} gap={movementInterval(profile)}
                    onExpand={() => setShowAllPlan(true)}
                    onAdjust={() => { setAdjustDraft({}); setAdjusting(it.id); }} />
                ) : (
                  <TimelineItem key={it.id} item={it} T={T} now={now}
                    status={s.itemStatus(it.id)} onAct={onAct} />
                )
              )}
            </div>
          );
        })}

        {!groups.length && (
          <p style={{ fontFamily: FONT_TEXT, fontSize: 15, color: T.faint, lineHeight: 1.5 }}>
            Nothing left open. Switch to showing everything if you want to look back over the night.
          </p>
        )}
      </div>
    );
  };

  /* ---------------------------------- log --------------------------------- */
  const LOG_TYPES = [
    { v: "wake", l: "Woke up", cat: "sleep", val: "earlier" },
    { v: "sleepQuality", l: "Slept poorly", cat: "sleep", val: "poor" },
    { v: "caffeine", l: "Caffeine", cat: "caffeine", val: 1,
      details: ["Coffee", "Tea", "Energy drink", "Other"] },
    { v: "water", l: "Water", cat: "water", val: 1 },
    { v: "meal", l: "Meal or snack", cat: "food", val: "normal",
      details: ["Full meal", "Light snack", "Heavy meal"] },
    { v: "nap", l: "Nap or rest", cat: "sleep", val: "ok",
      details: ["Slept", "Quiet rest", "Woke groggy"] },
    { v: "move", l: "Movement break", cat: "movement", val: 1 },
    { v: "skip", l: "Skipped a break", cat: "movement", val: 1 },
    { v: "sleepy", l: "Felt sleepy", cat: "recovery", val: 1 },
    { v: "stress", l: "Felt stressed", cat: "recovery", val: 1 },
    { v: "screen", l: "Screen strain", cat: "light", val: 1 },
    { v: "endShift", l: "Ended shift", cat: "shift", val: 1 },
    { v: "sleepStart", l: "Went to sleep", cat: "sleep", val: 1 },
  ];

  const clockToAbs = (h12, m, ap) => {
    let h = h12 % 12;
    if (ap === "PM") h += 12;
    return nextAfter(now - 720, h * 60 + m);
  };

  const saveManualLog = () => {
    const t = LOG_TYPES.find((x) => x.v === logDraft.type);
    const at = clockToAbs(logDraft.h, logDraft.m, logDraft.ap);
    const note = logDraft.note || undefined;
    let value = t.val;
    if (t.v === "meal" && note === "Heavy meal") value = "heavy";
    if (t.v === "nap") value = note === "Woke groggy" ? "groggy" : note === "Quiet rest" ? "couldnt" : "ok";
    const id = `m${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    if (t.v === "move" || t.v === "skip") {
      setLogs((L) => [...L, { id, t: at, type: "item", note,
        value: { id: `${t.v}-manual-${at}`, status: t.v === "move" ? "done" : "skipped", category: "movement" } }]);
    } else {
      setLogs((L) => [...L, { id, t: at, type: t.v, value, note }]);
    }
    setLogDraft({ ...logDraft, note: "" });
    say(`${t.l} logged at ${fmt(at)}.`);
  };

  const metaFor = (l) =>
    LOG_TYPES.find((x) => x.v === l.type)
    || (l.type === "item"
      ? { l: l.value.status === "done" ? "Movement reset" : "Skipped a break", cat: l.value.category }
      : { l: l.type, cat: "shift" });

  const LogTab = () => {
    const t = LOG_TYPES.find((x) => x.v === logDraft.type);
    const entries = [...logs].sort((a2, b2) => b2.t - a2.t);
    const changes = planChanges(profile, plan, now);

    const sel = {
      fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 600, color: T.ink,
      background: T.key === "warm" ? T.sunken : "rgba(255,255,255,0.06)",
      border: "none", borderRadius: 12, padding: "9px 11px", cursor: "pointer",
    };

    /* today's pattern, read from the logs rather than asserted */
    const pattern = [];
    const sleepLog = logs.filter((l) => l.type === "sleepStart").slice(-1)[0];
    if (sleepLog) {
      const diff = Math.round(sleepLog.t - ph.sleepStart);
      pattern.push(diff === 0 ? "Sleep started on plan."
        : `Sleep started ${dur(Math.abs(diff))} ${diff > 0 ? "later" : "earlier"} than planned.`);
    }
    if (profile.caffeine !== "none") {
      pattern.push(s.lateCaffeine
        ? "Caffeine crossed your cutoff."
        : s.caffeineLogs.length ? "Caffeine stayed before your cutoff." : "No caffeine logged yet.");
    }
    if (s.skippedMovement) pattern.push(`You skipped ${s.skippedMovement} movement reset${s.skippedMovement > 1 ? "s" : ""}.`);
    if (s.sleepy.length) {
      const w = determineCurrentPhase(s.sleepy[s.sleepy.length - 1].t, ph);
      pattern.push(`You logged sleepiness during ${w.inDeepNight ? "the deep night" : w.phase.label.toLowerCase()}.`);
    }

    return (
      <div style={{ padding: "4px 20px 0" }}>
        <Eyebrow T={T}>Reflection</Eyebrow>
        <Display T={T} size={32} style={{ marginBottom: 8 }}>Look back on the night.</Display>
        <p style={{ fontFamily: FONT_TEXT, fontSize: 14.5, color: T.muted, marginBottom: 22, lineHeight: 1.45 }}>
          Review what happened, fix times, add detail, and see what your logs changed.
          For something happening right now, the plus button is faster.
        </p>

        <Eyebrow T={T}>Add with your own time</Eyebrow>
        <Card T={T} style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 14 }}>
            {LOG_TYPES.map((x) => (
              <Pill key={x.v} T={T} hue={DOMAIN[x.cat].hue} active={logDraft.type === x.v}
                onClick={() => setLogDraft({ ...logDraft, type: x.v, note: "" })}>{x.l}</Pill>
            ))}
          </div>

          {t.details && (
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 14 }}>
              {t.details.map((d) => (
                <Pill key={d} T={T} hue={DOMAIN[t.cat].hue} active={logDraft.note === d}
                  onClick={() => setLogDraft({ ...logDraft, note: logDraft.note === d ? "" : d })}>{d}</Pill>
              ))}
            </div>
          )}

          <div style={{
            display: "flex", alignItems: "center", gap: 7, paddingTop: 14,
            borderTop: `1px solid ${T.hair}`,
          }}>
            <Clock size={16} color={T.faint} />
            <select value={logDraft.h} style={sel}
              onChange={(e) => setLogDraft({ ...logDraft, h: Number(e.target.value) })}>
              {Array.from({ length: 12 }, (_, k) => k + 1).map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
            <span style={{ color: T.faint, fontFamily: FONT_DISPLAY, fontSize: 16 }}>:</span>
            <select value={logDraft.m} style={sel}
              onChange={(e) => setLogDraft({ ...logDraft, m: Number(e.target.value) })}>
              {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
                <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
              ))}
            </select>
            <select value={logDraft.ap} style={sel}
              onChange={(e) => setLogDraft({ ...logDraft, ap: e.target.value })}>
              <option value="AM">AM</option><option value="PM">PM</option>
            </select>
            <div style={{ flex: 1 }} />
            <Btn T={T} kind="tinted" hue={DOMAIN[t.cat].hue} onClick={saveManualLog}
              style={{ fontSize: 14, padding: "10px 18px" }}>Save</Btn>
          </div>
        </Card>

        <Eyebrow T={T}>Today's timeline</Eyebrow>
        {entries.length === 0 && (
          <p style={{ fontFamily: FONT_TEXT, fontSize: 15, color: T.faint, lineHeight: 1.5, marginBottom: 24 }}>
            Nothing logged yet. Anything you record reshapes the rest of the plan.
          </p>
        )}
        <div style={{ marginBottom: 24 }}>
          {entries.map((l) => {
            const meta = metaFor(l);
            const open = editingLog === l.id;
            const m = ((l.t % DAY) + DAY) % DAY;
            let hh = Math.floor(m / 60);
            const ap = hh < 12 ? "AM" : "PM";
            hh %= 12; if (hh === 0) hh = 12;
            return (
              <div key={l.id} style={{
                borderRadius: 16, background: open ? T.card : "transparent",
                padding: open ? 14 : 0, marginBottom: open ? 10 : 0,
              }}>
                <div onClick={() => setEditingLog(open ? null : l.id)} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "11px 4px",
                  borderBottom: open ? "none" : `1px solid ${T.hair}`, cursor: "pointer",
                }}>
                  <Badge category={meta.cat} T={T} size={30} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: FONT_TEXT, fontSize: 15, color: T.ink }}>{meta.l}</div>
                    {l.note && (
                      <div style={{ fontFamily: FONT_TEXT, fontSize: 12.5, color: T.faint, marginTop: 1 }}>
                        {l.note}
                      </div>
                    )}
                  </div>
                  <span style={{
                    fontFamily: FONT_DISPLAY, fontSize: 14, fontWeight: 600, color: T.faint,
                    fontVariantNumeric: "tabular-nums",
                  }}>{fmt(l.t)}</span>
                  <ChevronRight size={15} color={T.faint}
                    style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 150ms ease" }} />
                </div>

                {open && (
                  <div style={{ paddingTop: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
                      <Clock size={15} color={T.faint} />
                      <select value={hh} style={sel} onChange={(e) => {
                        const nt = clockToAbs(Number(e.target.value), m % 60, ap);
                        setLogs((L) => L.map((x) => (x.id === l.id ? { ...x, t: nt } : x)));
                      }}>
                        {Array.from({ length: 12 }, (_, k) => k + 1).map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                      <span style={{ color: T.faint, fontFamily: FONT_DISPLAY, fontSize: 16 }}>:</span>
                      <select value={Math.round((m % 60) / 5) * 5 % 60} style={sel} onChange={(e) => {
                        const nt = clockToAbs(hh, Number(e.target.value), ap);
                        setLogs((L) => L.map((x) => (x.id === l.id ? { ...x, t: nt } : x)));
                      }}>
                        {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((mm) => (
                          <option key={mm} value={mm}>{String(mm).padStart(2, "0")}</option>
                        ))}
                      </select>
                      <select value={ap} style={sel} onChange={(e) => {
                        const nt = clockToAbs(hh, m % 60, e.target.value);
                        setLogs((L) => L.map((x) => (x.id === l.id ? { ...x, t: nt } : x)));
                      }}>
                        <option value="AM">AM</option><option value="PM">PM</option>
                      </select>
                    </div>
                    <input value={l.note || ""} placeholder="Add a note"
                      onChange={(e) => setLogs((L) => L.map((x) => (x.id === l.id ? { ...x, note: e.target.value } : x)))}
                      style={{
                        width: "100%", padding: "11px 13px", borderRadius: 13, marginBottom: 10,
                        border: `1px solid ${T.hair}`, background: "transparent", color: T.ink,
                        fontFamily: FONT_TEXT, fontSize: 14.5, outline: "none",
                      }} />
                    <div style={{ display: "flex", gap: 8 }}>
                      <Btn T={T} kind="quiet" style={{ flex: 1, fontSize: 13.5 }} onClick={() => {
                        setLogs((L) => L.filter((x) => x.id !== l.id));
                        setEditingLog(null);
                        say("Entry removed. The plan recalculated.");
                      }}><X size={14} /> Delete</Btn>
                      <Btn T={T} kind="tinted" hue={DOMAIN[meta.cat].hue} style={{ flex: 1, fontSize: 13.5 }}
                        onClick={() => setEditingLog(null)}>Done</Btn>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {pattern.length > 0 && (
          <>
            <Eyebrow T={T}>Today's pattern</Eyebrow>
            <Card T={T} style={{ padding: "6px 18px", marginBottom: 24 }}>
              {pattern.map((pp, k) => (
                <div key={pp} style={{
                  display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 0",
                  borderTop: k === 0 ? "none" : `1px solid ${T.hair}`,
                }}>
                  <div style={{
                    width: 6, height: 6, borderRadius: 3, background: T.faint,
                    flexShrink: 0, marginTop: 7,
                  }} />
                  <span style={{ fontFamily: FONT_TEXT, fontSize: 14.5, color: T.ink, lineHeight: 1.5 }}>{pp}</span>
                </div>
              ))}
            </Card>
          </>
        )}

        {changes.length > 0 && (
          <>
            <Eyebrow T={T}>What your logs changed</Eyebrow>
            <Card T={T} style={{ padding: "6px 18px", marginBottom: 24 }}>
              {changes.map((c, k) => (
                <div key={c} style={{
                  display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 0",
                  borderTop: k === 0 ? "none" : `1px solid ${T.hair}`,
                }}>
                  <RotateCcw size={13} color={DOMAIN.recovery.hue} style={{ flexShrink: 0, marginTop: 4 }} />
                  <span style={{ fontFamily: FONT_TEXT, fontSize: 14.5, color: T.ink, lineHeight: 1.5 }}>{c}</span>
                </div>
              ))}
            </Card>
          </>
        )}

        <Eyebrow T={T}>Daily reflection</Eyebrow>
        <ReflectionBlock />
      </div>
    );
  };

  const REFLECT_QS = [
    { k: "slept", q: "How long did you sleep?", o: ["Under 5h", "5–6h", "7–9h", "Over 9h"] },
    { k: "rested", q: "How rested do you feel?", o: ["Not at all", "A little", "Fairly", "Very"] },
    { k: "sleepiest", q: "When were you most sleepy?", o: ["Early shift", "Mid-shift", "Deep night", "Last hours"] },
    { k: "caffeineImpact", q: "Did caffeine affect your sleep?", o: ["Yes", "Maybe", "No", "Had none"] },
    { k: "movement", q: "Did you complete your movement breaks?", o: ["Most", "Some", "Few", "None"] },
    { k: "napped", q: "Did you nap or rest?", o: ["Napped", "Quiet rest", "Neither"] },
    { k: "adjust", q: "What should the plan change next shift?", o: ["Earlier caffeine cutoff", "More rest", "Fewer resets", "Nothing"] },
  ];

  const ReflectionBlock = () => (
    <div>
      {REFLECT_QS.map((x) => (
        <div key={x.k} style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: FONT_TEXT, fontSize: 15.5, fontWeight: 600, color: T.ink, marginBottom: 9 }}>
            {x.q}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {x.o.map((o) => (
              <Pill key={o} T={T} hue={DOMAIN.recovery.hue} active={reflection[x.k] === o}
                onClick={() => setReflection({ ...reflection, [x.k]: o })}>{o}</Pill>
            ))}
          </div>
        </div>
      ))}
      <Btn T={T} full onClick={() => {
        if (reflection.slept === "Under 5h" || reflection.rested === "Not at all") push("sleepQuality", "poor");
        if (reflection.adjust === "Earlier caffeine cutoff") {
          setProfile({ ...profile, caffeineSensitivity: "high" });
          say("Caffeine cutoff moved earlier for the next shift.");
        } else if (reflection.adjust === "Fewer resets") {
          setProfile({ ...profile, sedentary: "little" });
          say("Resets spaced further apart for the next shift.");
        } else say("Saved. The next plan will use this.");
      }}>Save reflection</Btn>
    </div>
  );

  /* --------------------------------- care --------------------------------- */
  const LiveTab = () => {
    const suggested = suggestedCare(profile, plan, now, null);
    return (
      <div style={{ padding: "4px 20px 0" }}>
        <Eyebrow T={T}>Micro-care</Eyebrow>
        <Display T={T} size={32} style={{ marginBottom: 8 }}>Reset in two minutes.</Display>
        <p style={{ fontFamily: FONT_TEXT, fontSize: 15, color: T.muted, marginBottom: 20, lineHeight: 1.45 }}>
          Breathing and movement, guided. Tap to play.
        </p>
        {CARE.map((c) => {
          const on = c.k === suggested;
          const hue = DOMAIN[c.cat].hue;
          return (
            <Card T={T} key={c.k} onClick={() => setPlaying(c.k)} style={{
              marginBottom: 10, padding: 14, display: "flex", alignItems: "center", gap: 13,
              border: on ? `1.5px solid ${tint(hue, 0.45)}` : undefined,
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 22, flexShrink: 0,
                background: tint(hue, T.tintA),
                display: "flex", alignItems: "center", justifyContent: "center",
              }}><c.Icon size={20} color={hue} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: FONT_TEXT, fontSize: 16, fontWeight: 600, color: T.ink,
                  display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
                }}>
                  {c.l}
                  {on && (
                    <span style={{
                      fontFamily: FONT_TEXT, fontSize: 10, fontWeight: 700, letterSpacing: "0.09em",
                      textTransform: "uppercase", color: hue, background: tint(hue, 0.14),
                      padding: "3px 7px", borderRadius: 999,
                    }}>Suggested</span>
                  )}
                </div>
                <div style={{ fontFamily: FONT_TEXT, fontSize: 13.5, color: T.muted, marginTop: 2 }}>
                  {c.sub}
                </div>
              </div>
              <span style={{
                fontFamily: FONT_TEXT, fontSize: 13.5, fontWeight: 600,
                color: DOMAIN.caffeine.hue, whiteSpace: "nowrap",
              }}>{c.mins} min</span>
              <div style={{
                width: 40, height: 40, borderRadius: 20, flexShrink: 0, background: T.ink,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}><Play size={15} color={T.bg} fill={T.bg} /></div>
            </Card>
          );
        })}
        <p style={{
          fontFamily: FONT_TEXT, fontSize: 13, color: T.faint, lineHeight: 1.45,
          margin: "14px 4px 0",
        }}>
          Finishing a movement reset here counts toward tonight's plan.
        </p>
      </div>
    );
  };

  /* ------------------------------ profile sheet ---------------------------- */
  const exportData = () => {
    const payload = JSON.stringify({ app: "GraveYard", profile, logs, history, reflection }, null, 2);
    try {
      const blob = new Blob([payload], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "graveyard-data.json";
      a.click();
      URL.revokeObjectURL(url);
      say("Exported graveyard-data.json");
    } catch {
      setExportText(payload);
    }
  };

  const ProfileSheet = () => {
    const badges = achievements(profile, logs, history);
    const Row = ({ Icon, l, sub, onClick, hue }) => (
      <button onClick={onClick} style={{
        width: "100%", display: "flex", alignItems: "center", gap: 13, padding: "14px 16px",
        background: T.card, border: "none", borderRadius: 18, marginBottom: 8,
        cursor: onClick ? "pointer" : "default", textAlign: "left",
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: 17, flexShrink: 0,
          background: tint(hue, T.tintA), display: "flex", alignItems: "center", justifyContent: "center",
        }}><Icon size={16} color={hue} /></div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: FONT_TEXT, fontSize: 15.5, fontWeight: 600, color: T.ink }}>{l}</div>
          {sub && <div style={{ fontFamily: FONT_TEXT, fontSize: 13, color: T.muted, marginTop: 2 }}>{sub}</div>}
        </div>
        {onClick && <ChevronRight size={17} color={T.faint} />}
      </button>
    );

    return (
      <div style={{
        position: "absolute", inset: 0, background: T.bg, zIndex: 80, overflowY: "auto",
        padding: "44px 20px 40px",
      }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 22 }}>
          <Display T={T} size={30} style={{ flex: 1 }}>You.</Display>
          <button onClick={() => setProfileOpen(false)} style={{
            width: 38, height: 38, borderRadius: 19, border: "none", background: T.card,
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          }}><X size={18} color={T.ink} /></button>
        </div>

        <Card T={T} style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 54, height: 54, borderRadius: 27, flexShrink: 0,
            background: tint(DOMAIN.sleep.hue, T.tintA + 0.06),
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {profile.name
              ? <span style={{
                  fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 700, color: DOMAIN.sleep.hue,
                }}>{profile.name.trim().charAt(0).toUpperCase()}</span>
              : <User size={24} color={DOMAIN.sleep.hue} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <input value={profile.name || ""} placeholder="Add your name"
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
              style={{
                width: "100%", border: "none", background: "transparent", outline: "none",
                fontFamily: FONT_DISPLAY, fontSize: 21, fontWeight: 700, color: T.ink,
                letterSpacing: "-0.02em", padding: 0,
              }} />
            <div style={{ fontFamily: FONT_TEXT, fontSize: 13.5, color: T.muted, marginTop: 2 }}>
              {planSummary(profile).type}
            </div>
          </div>
        </Card>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginBottom: 20 }}>
          <button onClick={() => setTimeEdit("shift")} style={{
            textAlign: "left", border: "none", cursor: "pointer", borderRadius: 18, padding: 14,
            background: tint(DOMAIN.shift.hue, T.tintA),
          }}>
            <div style={{ fontFamily: FONT_TEXT, fontSize: 12, color: T.muted }}>Shift time</div>
            <div style={{
              fontFamily: FONT_DISPLAY, fontSize: 17, fontWeight: 700, color: T.ink,
              marginTop: 3, letterSpacing: "-0.02em",
            }}>{fmt(ph.start)} – {fmt(ph.end)}</div>
          </button>
          <button onClick={() => setTimeEdit("sleep")} style={{
            textAlign: "left", border: "none", cursor: "pointer", borderRadius: 18, padding: 14,
            background: tint(DOMAIN.sleep.hue, T.tintA),
          }}>
            <div style={{ fontFamily: FONT_TEXT, fontSize: 12, color: T.muted }}>Sleep time</div>
            <div style={{
              fontFamily: FONT_DISPLAY, fontSize: 17, fontWeight: 700, color: T.ink,
              marginTop: 3, letterSpacing: "-0.02em",
            }}>{fmt(ph.sleepStart)} · {dur(profile.sleepGoalHours * 60)}</div>
          </button>
        </div>

        <Eyebrow T={T}>Your setup</Eyebrow>
        <Row Icon={Pencil} hue={DOMAIN.sleep.hue} l="Edit profile"
          sub="Walk back through all seven segments"
          onClick={() => { setProfileOpen(false); setReview({ index: 0, single: false, back: "app" }); setScreen("review"); }} />
        <Row Icon={FileText} hue={DOMAIN.light.hue} l="Why this plan"
          sub={planSummary(profile).type}
          onClick={() => { setProfileOpen(false); setScreen("recommendation-revisit"); }} />
        <Row Icon={Target} hue={DOMAIN.movement.hue} l="Goal"
          sub={goalLabel(profile)}
          onClick={() => { setProfileOpen(false); setReview({ index: 6, single: true, back: "app" }); setScreen("review"); }} />
        <Row Icon={Bed} hue={DOMAIN.recovery.hue} l="Sleep schedule"
          sub={`${dur(profile.sleepGoalHours * 60)} from ${fmt(ph.sleepStart)}`}
          onClick={() => { setProfileOpen(false); setReview({ index: 0, single: true, back: "app" }); setScreen("review"); }} />

        <div style={{ height: 18 }} />
        <Eyebrow T={T}>Achievements</Eyebrow>
        <p style={{ fontFamily: FONT_TEXT, fontSize: 13, color: T.faint, margin: "-4px 0 12px", lineHeight: 1.45 }}>
          Earned once, kept forever. No streaks to break.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginBottom: 20 }}>
          {badges.map((b) => (
            <div key={b.key} style={{
              background: b.got ? tint(b.hue, T.tintA) : T.card, borderRadius: 18, padding: 14,
              opacity: b.got ? 1 : 0.5,
              border: b.got ? `1px solid ${tint(b.hue, 0.28)}` : `1px solid ${T.hair}`,
            }}>
              {b.got
                ? <b.Icon size={19} color={b.hue} />
                : <Lock size={19} color={T.faint} />}
              <div style={{
                fontFamily: FONT_TEXT, fontSize: 14.5, fontWeight: 600, color: T.ink, marginTop: 9,
              }}>{b.l}</div>
              <div style={{
                fontFamily: FONT_TEXT, fontSize: 12.5, color: T.muted, marginTop: 3, lineHeight: 1.35,
              }}>{b.d}</div>
            </div>
          ))}
        </div>

        <Eyebrow T={T}>Personalize</Eyebrow>
        <Card T={T} style={{ marginBottom: 8, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <Palette size={16} color={DOMAIN.light.hue} />
            <span style={{ fontFamily: FONT_TEXT, fontSize: 15.5, fontWeight: 600, color: T.ink }}>Theme</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {[
              { v: null, l: "Follow the shift" },
              { v: false, l: "Always warm" },
              { v: true, l: "Always dark" },
            ].map((o) => (
              <Pill key={String(o.v)} T={T} hue={DOMAIN.light.hue}
                active={themeOverride === o.v}
                onClick={() => setThemeOverride(o.v)}>{o.l}</Pill>
            ))}
          </div>
          <p style={{ fontFamily: FONT_TEXT, fontSize: 12.5, color: T.faint, margin: "10px 0 0", lineHeight: 1.4 }}>
            Following the shift turns the app dark when you clock in and warm again when you finish.
          </p>
        </Card>
        <Card T={T} style={{ marginBottom: 8, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <Bell size={16} color={DOMAIN.caffeine.hue} />
            <span style={{ fontFamily: FONT_TEXT, fontSize: 15.5, fontWeight: 600, color: T.ink }}>Reminders</span>
            <div style={{ flex: 1 }} />
            <button onClick={() => setProfile({
              ...profile,
              mutedReminders: (profile.mutedReminders || []).length ? [] : REMINDERS.map((r) => r.k),
            })} style={{
              background: "none", border: "none", cursor: "pointer", padding: 0,
              fontFamily: FONT_TEXT, fontSize: 13, color: T.faint,
            }}>{(profile.mutedReminders || []).length ? "All on" : "All off"}</button>
          </div>
          <p style={{ fontFamily: FONT_TEXT, fontSize: 12.5, color: T.faint, margin: "0 0 12px", lineHeight: 1.4 }}>
            Turning one off keeps it on your plan — it just stops nudging you.
          </p>
          {REMINDERS.map((r, k) => {
            const on = !(profile.mutedReminders || []).includes(r.k);
            return (
              <div key={r.k} style={{
                display: "flex", alignItems: "center", gap: 11, padding: "10px 0",
                borderTop: k === 0 ? "none" : `1px solid ${T.hair}`,
              }}>
                <div style={{
                  width: 26, height: 26, borderRadius: 13, flexShrink: 0,
                  background: tint(DOMAIN[r.cat].hue, on ? T.tintA : 0.05),
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {React.createElement(DOMAIN[r.cat].Icon, {
                    size: 13, color: on ? DOMAIN[r.cat].hue : T.faint,
                  })}
                </div>
                <span style={{
                  flex: 1, fontFamily: FONT_TEXT, fontSize: 14.5,
                  color: on ? T.ink : T.faint,
                }}>{r.l}</span>
                <button onClick={() => {
                  const muted = profile.mutedReminders || [];
                  setProfile({
                    ...profile,
                    mutedReminders: on ? [...muted, r.k] : muted.filter((x) => x !== r.k),
                  });
                }} style={{
                  width: 44, height: 26, borderRadius: 13, border: "none", cursor: "pointer",
                  background: on ? DOMAIN[r.cat].hue : T.hair, position: "relative",
                  transition: "background 160ms ease",
                }}>
                  <span style={{
                    position: "absolute", top: 3, left: on ? 21 : 3, width: 20, height: 20,
                    borderRadius: 10, background: "#fff", transition: "left 160ms ease",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  }} />
                </button>
              </div>
            );
          })}
        </Card>

        <Card T={T} style={{ marginBottom: 8, padding: 16 }}>
          <div style={{ fontFamily: FONT_TEXT, fontSize: 15.5, fontWeight: 600, color: T.ink, marginBottom: 10 }}>
            How you get reminded
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            {["Sound", "Vibrate", "Silent"].map((o) => (
              <Pill key={o} T={T} hue={DOMAIN.caffeine.hue} active={(profile.remindStyle || "Vibrate") === o}
                onClick={() => setProfile({ ...profile, remindStyle: o })}>{o}</Pill>
            ))}
          </div>
          <div style={{ fontFamily: FONT_TEXT, fontSize: 15.5, fontWeight: 600, color: T.ink, marginBottom: 10 }}>
            How far ahead
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[0, 5, 10, 15].map((o) => (
              <Pill key={o} T={T} hue={DOMAIN.caffeine.hue} active={(profile.remindLead ?? 5) === o}
                onClick={() => setProfile({ ...profile, remindLead: o })}>
                {o === 0 ? "On time" : `${o} min before`}
              </Pill>
            ))}
          </div>
        </Card>

        <div style={{ height: 12 }} />
        <Eyebrow T={T}>Your data</Eyebrow>
        <Row Icon={Download} hue={DOMAIN.water.hue} l="Export data"
          sub="Everything logged, as a JSON file" onClick={exportData} />
        {exportText && (
          <textarea readOnly value={exportText} style={{
            width: "100%", height: 150, borderRadius: 14, padding: 12, marginBottom: 8,
            fontFamily: "ui-monospace, monospace", fontSize: 11, background: T.card,
            color: T.muted, border: `1px solid ${T.hair}`, resize: "vertical",
          }} />
        )}

        <div style={{ height: 12 }} />
        <Eyebrow T={T}>About GraveYard</Eyebrow>
        <Card T={T} style={{ padding: 18 }}>
          <p style={{ fontFamily: FONT_TEXT, fontSize: 14.5, lineHeight: 1.55, color: T.ink, margin: 0 }}>
            GraveYard turns your shift into a timeline. It works backward from when you
            plan to sleep, so caffeine, light, food, and rest land where they help rather
            than where they cost you.
          </p>
          <p style={{ fontFamily: FONT_TEXT, fontSize: 14.5, lineHeight: 1.55, color: T.muted, margin: "12px 0 0" }}>
            Every recommendation carries a plain-language reason you can read and disagree with.
            The plan is a proposal, not an instruction.
          </p>
          <div style={{
            marginTop: 14, paddingTop: 14, borderTop: `1px solid ${T.hair}`,
            display: "flex", gap: 9, alignItems: "flex-start",
          }}>
            <HelpCircle size={15} color={T.faint} style={{ flexShrink: 0, marginTop: 2 }} />
            <p style={{ fontFamily: FONT_TEXT, fontSize: 13, lineHeight: 1.5, color: T.faint, margin: 0 }}>
              General wellness and scheduling support based on research-informed principles.
              Not medical advice, diagnosis, or treatment. For health conditions, medications,
              supplements, sleep disorders, or persistent fatigue, consult a qualified
              healthcare professional.
            </p>
          </div>
        </Card>
      </div>
    );
  };

  /* ---------------------------- quick log (the +) --------------------------- */
  const quickLog = (kind) => {
    let entry;
    if (kind === "move") {
      entry = push("item", { id: `move-quick-${now}`, status: "done", category: "movement" });
    } else if (kind === "skip") {
      entry = push("item", { id: `skip-quick-${now}`, status: "skipped", category: "movement" });
    } else if (kind === "nap") {
      entry = push("nap", "ok");
    } else if (kind === "meal") {
      entry = push("meal", "normal");
    } else {
      entry = push(kind, 1);
    }
    setQuickResult({ kind, id: entry.id, advice: quickAdvice(kind, profile, plan, now) });
  };

  const Sheet = () => {
    if (!sheet) return null;
    const close = () => { setSheet(null); setQuickResult(null); };

    if (sheet === "nap") {
      const rows = [
        { l: "Napped, felt fine", f: () => { push("nap", "ok"); say("Rest logged. A wake-up buffer was added."); } },
        { l: "Napped, woke groggy", f: () => { push("nap", "groggy"); say("Future rests shortened, buffer lengthened."); } },
        { l: "Could not nap", f: () => { push("nap", "couldnt"); say("Swapped to quiet rest. It still counts."); } },
      ];
      return (
        <div onClick={close} style={{
          position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 60,
          display: "flex", alignItems: "flex-end",
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: T.bg, width: "100%", borderRadius: "28px 28px 0 0",
            padding: "10px 20px 26px", maxHeight: "76%", overflowY: "auto",
          }}>
            <div style={{ width: 38, height: 5, borderRadius: 3, background: T.hair, margin: "6px auto 18px" }} />
            <Display T={T} size={24} style={{ marginBottom: 16 }}>How did the rest go?</Display>
            {rows.map((r) => (
              <button key={r.l} onClick={() => { r.f(); close(); }} style={{
                width: "100%", textAlign: "left", padding: "15px 17px", marginBottom: 8,
                borderRadius: 17, border: "none", background: T.card, cursor: "pointer",
                fontFamily: FONT_TEXT, fontSize: 15.5, fontWeight: 500, color: T.ink,
              }}>{r.l}</button>
            ))}
          </div>
        </div>
      );
    }

    const done = quickResult;
    const doneMeta = done && QUICK.find((q) => q.k === done.kind);

    return (
      <div onClick={close} style={{
        position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 60,
        display: "flex", alignItems: "flex-end",
      }}>
        <div onClick={(e) => e.stopPropagation()} style={{
          background: T.bg, width: "100%", borderRadius: "28px 28px 0 0",
          padding: "10px 20px 26px", maxHeight: "80%", overflowY: "auto",
        }}>
          <div style={{ width: 38, height: 5, borderRadius: 3, background: T.hair, margin: "6px auto 18px" }} />

          {!done ? (
            <>
              <Display T={T} size={24}>Quick log.</Display>
              <p style={{ fontFamily: FONT_TEXT, fontSize: 14, color: T.muted, margin: "8px 0 4px" }}>
                What happened just now?
              </p>
              <p style={{ fontFamily: FONT_TEXT, fontSize: 13, color: T.faint, margin: "0 0 16px" }}>
                Logged at {fmt(now)}. Use the Log tab to change the time or add details.
              </p>
              {QUICK.map((q) => (
                <button key={q.k} onClick={() => quickLog(q.k)} style={{
                  width: "100%", textAlign: "left", padding: "13px 15px", marginBottom: 8,
                  borderRadius: 17, border: "none", background: T.card, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 12,
                }}>
                  <Badge category={q.cat} T={T} size={32} />
                  <span style={{ fontFamily: FONT_TEXT, fontSize: 15.5, fontWeight: 500, color: T.ink }}>
                    {q.l}
                  </span>
                </button>
              ))}
            </>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <Badge category={doneMeta.cat} T={T} size={42} />
                <div>
                  <Display T={T} size={24} style={{ marginBottom: 2 }}>Logged.</Display>
                  <div style={{ fontFamily: FONT_TEXT, fontSize: 13.5, color: T.muted }}>
                    {doneMeta.l} at {fmt(now)}
                  </div>
                </div>
              </div>
              <div style={{
                background: tint(DOMAIN[doneMeta.cat].hue, T.tintA), borderRadius: 20, padding: 17,
              }}>
                <p style={{ fontFamily: FONT_TEXT, fontSize: 15, lineHeight: 1.55, color: T.ink, margin: 0 }}>
                  {done.advice}
                </p>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
                <Btn T={T} kind="quiet" style={{ flex: 1, fontSize: 14 }} onClick={() => {
                  setLogs((L) => L.filter((l) => l.id !== done.id));
                  close();
                  say("Undone.");
                }}><RotateCcw size={14} /> Undo</Btn>
                <Btn T={T} kind="quiet" style={{ flex: 1, fontSize: 14 }} onClick={() => {
                  setEditingLog(done.id);
                  close();
                  setTab("log");
                }}>Add details</Btn>
                <Btn T={T} style={{ flex: 1.2, fontSize: 14 }} onClick={() => { close(); setTab("plan"); }}>
                  View plan
                </Btn>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  /* ------------------------------- adjust sheet ---------------------------- */
  const AdjustSheet = () => {
    if (!adjusting) return null;
    const item = plan.items.find((i) => i.id === adjusting);
    if (!item || !item.adjust) return null;
    const d = DOMAIN[item.category] || DOMAIN.shift;

    const merged = { ...(profile.overrides || {}), ...adjustDraft };
    const preview = generateTimeline({ ...profile, overrides: merged }, logs, now);
    const previewItem = preview.items.find((i) => i.id === item.id) || item;
    const dirty = Object.keys(adjustDraft).length > 0;
    const customised = item.adjust.some((a) => merged[a.key] !== undefined && merged[a.key] !== a.def);

    const valueOf = (a) => (merged[a.key] === undefined ? a.def : merged[a.key]);
    const bump = (a, dir) => {
      const spec = ADJUSTABLE[a.key];
      const next = Math.min(spec.max, Math.max(spec.min,
        Math.round((valueOf(a) + dir * spec.step) * 10) / 10));
      setAdjustDraft({ ...adjustDraft, [a.key]: next });
    };

    const close = () => { setAdjusting(null); setAdjustDraft({}); };

    return (
      <div onClick={close} style={{
        position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 70,
        display: "flex", alignItems: "flex-end",
      }}>
        <div onClick={(e) => e.stopPropagation()} style={{
          background: T.bg, width: "100%", borderRadius: "28px 28px 0 0",
          padding: "10px 20px 26px", maxHeight: "84%", overflowY: "auto",
        }}>
          <div style={{ width: 38, height: 5, borderRadius: 3, background: T.hair, margin: "6px auto 18px" }} />

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <Badge category={item.category} T={T} size={40} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: FONT_DISPLAY, fontSize: 21, fontWeight: 700, color: T.ink,
                letterSpacing: "-0.02em" }}>{item.title}</div>
              <div style={{ fontFamily: FONT_TEXT, fontSize: 13, color: T.muted, marginTop: 2 }}>
                {previewItem.at === item.at
                  ? `Currently ${fmt(item.at)}`
                  : `${fmt(item.at)} → ${fmt(previewItem.at)}`}
              </div>
            </div>
          </div>

          {item.adjust.map((a) => {
            const spec = ADJUSTABLE[a.key];
            const val = valueOf(a);
            const isDefault = val === a.def;
            return (
              <Card T={T} key={a.key} style={{ marginBottom: 10, padding: "14px 16px" }}>
                <div style={{ fontFamily: FONT_TEXT, fontSize: 15, fontWeight: 600, color: T.ink }}>
                  {spec.l}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 12 }}>
                  <button onClick={() => bump(a, -1)} disabled={val <= spec.min} style={{
                    width: 40, height: 40, borderRadius: 20, border: `1px solid ${T.hair}`,
                    background: "transparent", cursor: val <= spec.min ? "default" : "pointer",
                    opacity: val <= spec.min ? 0.35 : 1,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 500, color: T.ink, lineHeight: 1,
                  }}>−</button>
                  <div style={{ flex: 1, textAlign: "center" }}>
                    <div style={{
                      fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 700, color: d.hue,
                      fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em",
                    }}>{spec.decimals ? val.toFixed(1) : Math.round(val)}</div>
                    <div style={{ fontFamily: FONT_TEXT, fontSize: 12, color: T.faint, marginTop: 1 }}>
                      {spec.unit}
                    </div>
                  </div>
                  <button onClick={() => bump(a, 1)} disabled={val >= spec.max} style={{
                    width: 40, height: 40, borderRadius: 20, border: `1px solid ${T.hair}`,
                    background: "transparent", cursor: val >= spec.max ? "default" : "pointer",
                    opacity: val >= spec.max ? 0.35 : 1,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 500, color: T.ink, lineHeight: 1,
                  }}>+</button>
                </div>
                <input type="range" min={spec.min} max={spec.max} step={spec.step} value={val}
                  onChange={(e) => setAdjustDraft({ ...adjustDraft, [a.key]: Number(e.target.value) })}
                  style={{ width: "100%", marginTop: 12, accentColor: d.hue }} />
                {!isDefault && (
                  <button onClick={() => setAdjustDraft({ ...adjustDraft, [a.key]: a.def })} style={{
                    background: "none", border: "none", cursor: "pointer", padding: "8px 0 0",
                    fontFamily: FONT_TEXT, fontSize: 12.5, color: T.faint,
                  }}>Back to the default of {spec.decimals ? a.def.toFixed(1) : Math.round(a.def)}</button>
                )}
              </Card>
            );
          })}

          <p style={{ fontFamily: FONT_TEXT, fontSize: 13, lineHeight: 1.5, color: T.faint, margin: "6px 4px 16px" }}>
            Changing this reshapes the rest of the plan, not just this card.
          </p>

          <div style={{ display: "flex", gap: 10 }}>
            {customised && (
              <Btn T={T} kind="quiet" style={{ flex: 1 }} onClick={() => {
                const next = { ...(profile.overrides || {}) };
                item.adjust.forEach((a) => { delete next[a.key]; });
                setProfile({ ...profile, overrides: next });
                close();
                say("Back to the default timing.");
              }}><RotateCcw size={15} /> Reset</Btn>
            )}
            <Btn T={T} style={{ flex: 1.6 }} onClick={() => {
              if (dirty) {
                setProfile({ ...profile, overrides: merged });
                say(`${item.title} moved to ${fmt(previewItem.at)}.`);
              }
              close();
            }}>{dirty ? "Save" : "Done"}</Btn>
          </div>

          <button onClick={() => {
            const idx = Math.max(0, REVIEW.findIndex((r) => r.cat === item.category));
            close();
            setReview({ index: idx, single: true, back: "app" });
            setScreen("review");
          }} style={{
            background: "none", border: "none", cursor: "pointer", marginTop: 14, width: "100%",
            fontFamily: FONT_TEXT, fontSize: 13.5, color: T.faint, padding: 6,
          }}>Change my answers instead</button>
        </div>
      </div>
    );
  };

  /* -------------------------------- chrome -------------------------------- */
  const TABS = [
    { k: "dashboard", l: "Dashboard", Icon: BarChart3 },
    { k: "plan", l: "Plan", Icon: ListChecks },
    { k: "log", l: "Reflection", Icon: FileText },
    { k: "live", l: "Care", Icon: Heart },
  ];

  return (
    <Frame T={T} raw>
      {/* header — pinned */}
      <div style={{
        flexShrink: 0, display: "flex", alignItems: "center", padding: "2px 20px 14px",
        background: T.bg, borderBottom: `1px solid ${T.hair}`,
      }}>
        <span style={{
          fontFamily: FONT_DISPLAY, fontSize: 21, fontWeight: 700, letterSpacing: "-0.035em",
          color: T.ink,
        }}>graveyard.</span>
        <div style={{ flex: 1 }} />
        <button onClick={() => setProfileOpen(true)} style={{
          width: 38, height: 38, borderRadius: 19, border: "none", cursor: "pointer",
          background: tint(DOMAIN.sleep.hue, T.tintA),
          display: "flex", alignItems: "center", justifyContent: "center",
        }}><User size={18} color={DOMAIN.sleep.hue} /></button>
      </div>

      {/* the only scrolling region */}
      <div style={{ flex: 1, overflowY: "auto", paddingTop: 12, paddingBottom: 28 }}>
        {tab === "dashboard" && <Dashboard />}
        {tab === "plan" && <PlanTab />}
        {tab === "log" && <LogTab />}
        {tab === "live" && <LiveTab />}
      </div>

      {toast && (
        <div style={{
          position: "absolute", left: 20, right: 20, bottom: 96, zIndex: 50,
          background: T.key === "warm" ? T.hero : T.card, color: T.key === "warm" ? T.heroInk : T.ink,
          borderRadius: 18, padding: "14px 17px", fontFamily: FONT_TEXT, fontSize: 14.5, lineHeight: 1.4,
          border: T.key === "dark" ? `1px solid ${T.hair}` : "none",
          boxShadow: "0 8px 26px rgba(0,0,0,0.18)",
        }}>{toast}</div>
      )}

      {/* tab bar — pinned */}
      <div style={{
        flexShrink: 0, height: 78, zIndex: 45,
        background: T.key === "warm" ? "rgba(242,240,234,0.86)" : "rgba(18,18,24,0.86)",
        backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        borderTop: `1px solid ${T.hair}`,
        display: "flex", alignItems: "center", justifyContent: "space-around", padding: "0 8px",
      }}>
        {TABS.slice(0, 2).map((t) => <TabBtn key={t.k} t={t} T={T} tab={tab} setTab={setTab} />)}
        <button onClick={() => setSheet("log")} style={{
          width: 54, height: 54, borderRadius: 27, background: T.ink, border: "none",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          marginTop: -14, boxShadow: "0 6px 18px rgba(0,0,0,0.22)",
        }}><Plus size={24} color={T.bg} /></button>
        {TABS.slice(2).map((t) => <TabBtn key={t.k} t={t} T={T} tab={tab} setTab={setTab} />)}
      </div>

      <Sheet />
      <AdjustSheet />
      {playing && (
        <CarePlayer
          T={T} activity={CARE.find((c) => c.k === playing)}
          onClose={() => setPlaying(null)}
          onDone={() => {
            const c = CARE.find((x) => x.k === playing);
            if (c.logsAs === "move") {
              push("item", { id: `care-${c.k}-${now}`, status: "done", category: "movement" });
              say("Reset logged. Your movement completion just went up.");
            } else if (c.logsAs === "eye") {
              push("item", { id: `care-${c.k}-${now}`, status: "done", category: "light" });
              say("Eye reset logged.");
            } else {
              push("care", c.k);
              say(`${c.l} logged.`);
            }
            setPlaying(null);
          }}
        />
      )}
      {timeEdit && (() => {
        const fields = timeEdit === "shift"
          ? [{ k: "shiftStart", l: "Shift starts" }, { k: "shiftEnd", l: "Shift ends" }]
          : [{ k: "plannedSleep", l: "Sleep starts" }];
        return (
          <div onClick={() => setTimeEdit(null)} style={{
            position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 95,
            display: "flex", alignItems: "flex-end",
          }}>
            <div onClick={(e) => e.stopPropagation()} style={{
              background: T.bg, width: "100%", borderRadius: "28px 28px 0 0",
              padding: "10px 20px 26px", maxHeight: "86%", overflowY: "auto",
            }}>
              <div style={{ width: 38, height: 5, borderRadius: 3, background: T.hair, margin: "6px auto 18px" }} />
              <Display T={T} size={24} style={{ marginBottom: 6 }}>
                {timeEdit === "shift" ? "Shift time." : "Sleep time."}
              </Display>
              <p style={{ fontFamily: FONT_TEXT, fontSize: 13.5, color: T.faint, margin: "0 0 16px" }}>
                Changing this rebuilds tonight's plan around the new times.
              </p>
              {fields.map((f) => (
                <div key={f.k} style={{ marginBottom: 16 }}>
                  <div style={{
                    fontFamily: FONT_TEXT, fontSize: 14.5, fontWeight: 600,
                    color: T.ink, marginBottom: 8,
                  }}>{f.l}</div>
                  <TimeWheel T={T} value={profile[f.k]}
                    onChange={(v) => setProfile({ ...profile, [f.k]: v })} />
                </div>
              ))}
              {timeEdit === "sleep" && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{
                    fontFamily: FONT_TEXT, fontSize: 14.5, fontWeight: 600,
                    color: T.ink, marginBottom: 8,
                  }}>How long you usually sleep</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {[4.5, 5.5, 7.5, 9.5].map((h) => (
                      <Pill key={h} T={T} hue={DOMAIN.sleep.hue} active={profile.sleepGoalHours === h}
                        onClick={() => setProfile({ ...profile, sleepGoalHours: h })}>
                        {h === 4.5 ? "Under 5h" : h === 5.5 ? "5 to 6h" : h === 7.5 ? "7 to 9h" : "Over 9h"}
                      </Pill>
                    ))}
                  </div>
                </div>
              )}
              <Btn T={T} full onClick={() => { setTimeEdit(null); say("Plan rebuilt around your new times."); }}>
                Done
              </Btn>
            </div>
          </div>
        );
      })()}
      {profileOpen && <ProfileSheet />}
    </Frame>
  );
}

function RecurringCard({ item, T, gap, onExpand, onAdjust }) {
  const d = DOMAIN.movement;
  const [open, setOpen] = useState(false);
  const n = item.recurring.length;
  return (
    <div style={{ display: "flex", gap: 12 }}>
      <div style={{ width: 52, flexShrink: 0, paddingTop: 17, textAlign: "right" }}>
        <span style={{
          fontFamily: FONT_DISPLAY, fontSize: 14, fontWeight: 600, color: T.faint,
          fontVariantNumeric: "tabular-nums",
        }}>{fmt(item.at)}</span>
      </div>
      <Card T={T} style={{ flex: 1, marginBottom: 10, padding: 15 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <Badge category="movement" T={T} size={36} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: FONT_TEXT, fontSize: 16, fontWeight: 600, color: T.ink }}>
              Movement resets
            </div>
            <p style={{ fontFamily: FONT_TEXT, fontSize: 14, lineHeight: 1.45, color: T.muted, margin: "5px 0 0" }}>
              Every {gap} minutes · {n} tonight, first at {fmt(item.at)}.
            </p>
            <button onClick={() => setOpen(!open)} style={{
              background: "none", border: "none", padding: "9px 0 0", cursor: "pointer",
              fontFamily: FONT_TEXT, fontSize: 13, color: T.faint, fontWeight: 500,
              display: "flex", alignItems: "center", gap: 5,
            }}><Info size={13} /> Why this</button>
            {open && (
              <p style={{
                fontFamily: FONT_TEXT, fontSize: 13.5, lineHeight: 1.5, color: T.muted,
                margin: "8px 0 0", padding: "11px 13px", borderRadius: 12,
                background: T.key === "warm" ? T.sunken : "rgba(255,255,255,0.04)",
              }}>{item.why}</p>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <Btn T={T} kind="tinted" hue={d.hue} onClick={onExpand}
                style={{ fontSize: 13.5, padding: "8px 15px" }}>
                Show all {n} <ChevronDown size={14} />
              </Btn>
              <Btn T={T} kind="quiet" onClick={onAdjust}
                style={{ fontSize: 13.5, padding: "8px 15px" }}>Adjust</Btn>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function TabBtn({ t, T, tab, setTab }) {
  const on = tab === t.k;
  return (
    <button onClick={() => setTab(t.k)} style={{
      background: "none", border: "none", cursor: "pointer", flex: 1,
      display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "6px 0",
    }}>
      <t.Icon size={21} color={on ? T.ink : T.faint} strokeWidth={on ? 2.2 : 1.8} />
      <span style={{
        fontFamily: FONT_TEXT, fontSize: 10.5, fontWeight: on ? 600 : 500, color: on ? T.ink : T.faint,
      }}>{t.l}</span>
    </button>
  );
}

function Frame({ T, children, raw }) {
  return (
    <div style={{
      height: "100dvh", width: "100%", background: T.key === "warm" ? "#DEDBD3" : "#08080B",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
      transition: "background 500ms ease", overflow: "hidden",
    }}>
      <div style={{
        width: "100%", maxWidth: 430, height: "100dvh", background: T.bg,
        position: "relative", overflow: "hidden", transition: "background 500ms ease",
        paddingTop: 14, display: "flex", flexDirection: "column",
      }}>
        {raw ? children : (
          <div style={{
            flex: 1, minHeight: 0, overflowY: "auto",
            display: "flex", flexDirection: "column",
          }}>{children}</div>
        )}
      </div>
    </div>
  );
}
