import { DAY, toMin, fmt, nextAfter, overlap, dur } from "./time.js";

/* ----------------------------- planner functions -------------------------- */

/**
 * Phases are a partition of the plan: every minute belongs to exactly one.
 * The circadian low is NOT a phase, it is an overlay laid on top of whichever
 * phases it intersects, so shifts that never touch 02:00–05:00 simply have none.
 */
export function calculateShiftPhases(profile) {
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

export function determineCurrentPhase(now, ph) {
  const found = ph.phases.find((p) => now >= p.from && now < p.to);
  const phase = found || (now < ph.phases[0].from
    ? { key: "before", label: "Before plan" }
    : { key: "after", label: "Day off" });
  return { phase, inDeepNight: !!ph.deepNight && now >= ph.deepNight[0] && now < ph.deepNight[1] };
}

/* Nights already worked in this run. Profiles saved before this field existed
   read as night one, which is the same plan they got before. */
export const stretchNight = (profile) => profile.nightInStretch ?? 1;

export function caffeineHours(profile) {
  let hours = { low: 5, normal: 6, high: 8 }[profile.caffeineSensitivity] ?? 6;
  if (profile.sleepGoalHours <= 5) hours += 1; // short sleep -> protect it harder
  if (stretchNight(profile) >= 3) hours += 1;  // deficit compounds across a stretch
  return ov(profile, "caffeineHours", hours);
}

export function calculateCaffeineCutoff(profile, ph) {
  if (profile.caffeine === "none") return null;
  return ph.sleepStart - caffeineHours(profile) * 60;
}

/* One answer covers both how much you sit and how freely you can break, because
   the plan only ever asks two things of it: how often to prompt a reset, and
   whether that reset has to be doable without leaving the desk. */
export const MOVEMENT = {
  desk:          { base: 90,  micro: true },
  unpredictable: { base: 90,  micro: true },
  seated:        { base: 90,  micro: false },
  mixed:         { base: 120, micro: false },
  active:        { base: 150, micro: false },
};
export const movementMode = (profile) => MOVEMENT[profile.movement] ?? MOVEMENT.mixed;

export function movementInterval(profile) {
  let base = movementMode(profile).base;
  const night = stretchNight(profile);
  if (night >= 4) base -= 30;
  else if (night >= 2) base -= 15;
  return ov(profile, "moveGap", base);
}

/* ------------------------- adjustable plan variables ----------------------
   Every number the planner uses has a default derived from the quiz, and can be
   overridden per user. Overrides live on the profile, so the timeline stays a
   pure function of (profile, logs, now) and every card can be tuned in place. */

export const ADJUSTABLE = {
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
export const ov = (profile, key, fallback) => {
  const v = (profile.overrides || {})[key];
  return v === undefined || v === null ? fallback : v;
};

/** Same profile with overrides stripped, so a control can compute the value
    it would reset to. Without this, `def` echoes the current override and the
    "reset to default" affordance never appears. */
export const baseProfile = (profile) => ({ ...profile, overrides: {} });

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

export function deriveState(profile, logs, now, ph) {
  const cutoff = calculateCaffeineCutoff(profile, ph);
  const of = (t) => logs.filter((l) => l.type === t);

  const caffeineLogs = of("caffeine");
  /* `cutoff !== null`, not a truthiness test: a cutoff of exactly 0 is a real
     midnight cutoff, and treating it as absent silently disabled all caffeine
     sleep-protection for those shifts. */
  const hasCutoff = cutoff !== null;
  const lateCaffeine = hasCutoff ? caffeineLogs.some((l) => l.t >= cutoff) : false;
  const nearCutoff = hasCutoff
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

  /* last wins, so a corrected entry replaces the first, matching sleepQuality */
  const wake = of("wake").slice(-1)[0] || null;
  const quality = of("sleepQuality").slice(-1)[0] || null;

  const endShift = of("endShift").length > 0;
  const sleepStarted = of("sleepStart").length > 0;

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

export function generateTimeline(profile, logs, now) {
  const ph = calculateShiftPhases(profile);
  const s = deriveState(profile, logs, now, ph);
  const items = [];
  const add = (o) => items.push(o);

  const canNapBefore = profile.nap === "before" || profile.nap === "both";
  const canNapDuring = profile.nap === "during" || profile.nap === "both";
  const microOnly = movementMode(profile).micro;

  /* ---------- pre-shift ---------- */
  if (!s.wokeLate) {
    add({
      id: "pre-meal", at: ph.start - ov(profile, "preMealLead", 150), category: "food",
      adjust: [{ key: "preMealLead", def: 150 }],
      title: "Pre-shift meal",
      msg: "Eat your main meal now.",
      why: "Digestion slows overnight, so your largest meal sits better before the shift than during it.",
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
      why: "Under about six hours before a night shift starts you in deficit, and a short nap now takes pressure off the deep-night hours.",
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
      adjust: [{ key: "caffeineOpen", def: 20 }, { key: "caffeineHours", def: caffeineHours(baseProfile(profile)) }],
      title: "Best caffeine window",
      msg: `Clear of your sleep window. Last call is ${fmt(s.cutoff)}.`,
      why: "Caffeine is a short-term alertness tool rather than a substitute for sleep, so used early it costs nothing and used late it is still active when you lie down.",
      actions: ["logCaffeine", "skip", "adjust"],
    });
    if (profile.caffeine === "high") {
      add({
        id: "caff-swap", at: ph.start + ph.length * 0.4, category: "water",
        title: "Water swap",
        msg: "Try water first. Give it fifteen minutes.",
        why: "Mild dehydration feels a lot like fatigue, so fifteen minutes with water is long enough to tell thirst from tiredness.",
        actions: ["done", "skip"],
      });
    }
  }
  if (s.cutoff !== null) {
    add({
      id: "caff-cutoff", at: s.cutoff, category: "caffeine",
      adjust: [{ key: "caffeineHours", def: caffeineHours(baseProfile(profile)) }],
      title: s.lateCaffeine ? "Caffeine is off the plan" : "Last caffeine cutoff",
      msg: s.lateCaffeine
        ? "The rest of tonight runs on water, movement, and lower light instead."
        : "Switch to water. Alertness from here comes from movement, light, and pacing.",
      why: `Caffeine takes hours to clear, so stopping now leaves time for it to fade before your sleep window opens at ${fmt(ph.sleepStart)}.`,
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
      adjust: [{ key: "moveGap", def: movementInterval(baseProfile(profile)) }, { key: "moveLength", def: 3 }],
      title: desk ? "60-second desk reset" : shortened ? "Short movement reset" : "Micro-care reset",
      msg: desk
        ? "Sit tall, roll your shoulders, unclench your jaw, stretch your wrists, look away from the screen for twenty seconds."
        : shortened
        ? "Ninety seconds. Stand, roll your shoulders, stretch your wrists, sip water."
        : `${ov(profile, "moveLength", 3)} minutes. Stand, stretch neck and shoulders, sip water, rest your eyes.`,
      why: "Long unbroken sitting adds stiffness and drowsiness on top of the night's own fatigue, and short frequent resets beat long occasional ones because you will actually do them.",
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
    why: "Bright light early is one of the few alertness tools that costs nothing later, which is why it is timed rather than left on.",
    actions: ["done", "skip", "adjust"],
  });
  add({
    id: "light-down", at: ph.end - ov(profile, "lightDownLead", 90), category: "light",
    adjust: [{ key: "lightDownLead", def: 90 }],
    title: "Start reducing light",
    msg: "Drop screen brightness, switch to a warmer display, turn off lighting you do not need.",
    why: "Light close to bedtime tells your body it is daytime, so cutting it early gives you a head start on a sleep window that already fights daylight.",
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
    why: "Grazing through the night usually means eating more, later, and heavier than you meant to, so deciding in advance is the point.",
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
      why: "Your body clock runs its low point in these hours whether or not you slept well, so the plan asks less of you rather than more.",
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
      why: "Rest is kept short on purpose, because past roughly half an hour you risk waking from deeper sleep and feeling groggier than before.",
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
        why: "Grogginess right after waking is normal and brief, and a buffer keeps you from deciding anything during the part you will not notice.",
        changed: "Added after the rest you logged.",
        actions: ["done", "skip"],
      });
    }
  } else {
    add({
      id: "hard-warn", at: ph.hardest[0], category: "recovery",
      title: "Hardest stretch ahead",
      msg: "Pace your tasks from here.",
      why: "Your shift misses the usual 2:00 AM to 5:00 AM low, but sleepiness still builds toward the end, and the last quarter is where it shows up for you.",
      actions: ["done"],
    });
  }

  /* ---------- fatigue check-in, placed where the user says it bites ---------- */
  const deepStretch = stretchNight(profile) >= 3;
  const risky = s.poorSleep || s.wokeEarly || profile.sleepGoalHours <= 5 || deepStretch;
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
    changed: deepStretch
      ? `Weighted heavier because this is night ${stretchNight(profile)} of your stretch.`
      : risky
      ? "Weighted heavier because your sleep was short or poor."
      : undefined,
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
    why: "Going straight from a working night to bed rarely works, so a deliberate slowdown gives your body a signal it can act on.",
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
    why: "Daytime sleep competes with light, heat, and noise that night sleep does not, so the darker and cooler the room, the less of a disadvantage you start from.",
    actions: ["done", "skip"],
  });
  add({
    id: "sleep-window", at: ph.sleepStart, category: "sleep",
    title: `Sleep until ${fmt(ph.sleepEnd)}`,
    msg: `${dur(profile.sleepGoalHours * 60)} protected.`,
    why: "This window is the anchor the whole plan is built backward from, and everything tonight was timed to get you here able to use it.",
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
      why: "Focusing at one close distance for hours is what makes eyes ache by mid-shift, and looking far away briefly lets those muscles release.",
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

export function generateAdvice(profile, logs, now, plan) {
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
    why = `It has been over ${s.waterGapMins} minutes, and mild dehydration reads as tiredness.`;
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
    why = "That caffeine will still be working when your sleep window opens. Nothing has gone wrong, it just means the tools for the rest of the night change.";
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
