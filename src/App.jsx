import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Moon, Pulse, Heart, Clock, Check,
  CaretRight, Plus, Wind, Eye, Bed, ArrowRight, ArrowLeft,
  X, ListChecks, Info, Footprints, ArrowCounterClockwise, Pencil,
  User, DownloadSimple, Bell, Target, ChartBar, FileText, Palette,
  Question, Lock, CaretDown, Play,
} from "./icons.jsx";
import { DAY, toMin, fmt, nextAfter, dur, nightOf } from "./time.js";
import { FONT_DISPLAY, FONT_TEXT, WARM, DARK, DOMAIN, tint } from "./tokens.js";
import {
  calculateShiftPhases, determineCurrentPhase, calculateCaffeineCutoff,
  movementInterval, ov, generateTimeline, generateAdvice, ADJUSTABLE,
} from "./planner.js";
import { materializeNights } from "./mockNights.js";
import { foldNight, achievements } from "./stats.js";
import { load, save, forNight, archived } from "./storage.js";
import { Card, Btn, Pill, Badge, Display, Eyebrow, Select, Arch, Choice } from "./ui/index.jsx";
import Dashboard from "./screens/Dashboard.jsx";

/* ============================================================================
   GRAVEYARD: a planner for the night shift
   quiz -> generated timeline -> live shift mode with adaptive logging -> reflection

   ARCHITECTURE NOTE
   Logs are the only mutable state. The timeline is a pure function of
   (profile, logs, now) and is recomputed on every render. Nothing is stored
   and mutated, so undo is free and every adaptation is traceable.
============================================================================ */

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
    mins: 3, cat: "movement", Icon: Pulse, logsAs: "move",
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
   The plus button answers "what happened right now?", so every entry gets an
   immediate reading of what it means for the rest of tonight. */

/* Only the five events that change what the rest of the plan does. Water,
   movement, sleepiness, stress, and screen strain are still loggable from the
   Reflection tab, but they do not belong in a one-tap sheet used at 3am. */
const QUICK = [
  { k: "caffeine", l: "Caffeine", cat: "caffeine" },
  { k: "meal", l: "Meal / snack", cat: "food" },
  { k: "nap", l: "Nap / quiet rest", cat: "sleep" },
  { k: "sleepStart", l: "Going to sleep", cat: "sleep" },
  { k: "endShift", l: "End shift", cat: "shift" },
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
    return `Caffeine logged. This fits your window, last call is ${fmt(cutoff)}.`;
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
    return !movementMode(profile).micro
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

/* Holds the outgoing view mounted for one exit animation, then swaps in the
   new one. The class flips out -> in, and a changed animation-name is what
   restarts the animation, so callers need no keys. Screens use the slower
   pair (the whole sheet drops out); steps inside a screen use the quick one.
   ponytail: these durations must stay in step with index.html. */
const SCREEN_OUT_MS = 300;
const STEP_OUT_MS = 190;

function useSwap(value, ms, inCls, outCls) {
  const [shown, setShown] = useState(value);
  const [out, setOut] = useState(false);
  useEffect(() => {
    if (value === shown) return;
    setOut(true);
    const t = setTimeout(() => { setShown(value); setOut(false); }, ms);
    return () => clearTimeout(t);
  }, [value, shown, ms]);
  return [shown, out ? outCls : inCls];
}

const useScreenSwap = (v) => useSwap(v, SCREEN_OUT_MS, "gy-in", "gy-out");
const useStepSwap = (v) => useSwap(v, STEP_OUT_MS, "gy-step", "gy-step-out");

/* --------------------------------- onboarding ----------------------------- */

/* A round back button that reads on the hero wash rather than on the sheet. */
function HeroBack({ onClick }) {
  return (
    <button onClick={onClick} aria-label="Back" style={{
      background: "rgba(255,255,255,0.18)", border: "none", width: 42, height: 42, borderRadius: 21,
      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    }}><ArrowLeft size={18} color="#FFFFFF" /></button>
  );
}

function Welcome({ onNext }) {
  const T = WARM;
  return (
    <Arch T={T} Icon={Moon} heroPad={92} pad="66px 26px 30px">
      <div style={{ textAlign: "center" }}>
        <Eyebrow T={T}>You're working</Eyebrow>
        <Display T={T} size={54} style={{ letterSpacing: "-0.04em" }}>graveyard.</Display>
        <p style={{
          fontFamily: FONT_TEXT, fontSize: 17, lineHeight: 1.5, color: T.muted, marginTop: 18,
        }}>
          This planner is built around the hours you actually work: caffeine,
          rest, movement, light, food, and a sleep window that gets protected.
        </p>
        <p style={{
          fontFamily: FONT_TEXT, fontSize: 15, lineHeight: 1.5, color: T.faint, marginTop: 14,
        }}>
          Fourteen quick questions. Then get a plan you can adjust.
        </p>
      </div>
      <div style={{ flex: 1, minHeight: 24 }} />
      <Btn T={T} kind="accent" full onClick={onNext}>Build my shift plan <ArrowRight size={18} /></Btn>
    </Arch>
  );
}

function Disclaimer({ onNext, onBack }) {
  const T = WARM;
  return (
    <Arch T={T} Icon={Info} nav={<HeroBack onClick={onBack} />} pad="66px 26px 30px">
      <div style={{ textAlign: "center" }}>
        <Eyebrow T={T}>Before you start</Eyebrow>
        <Display T={T} size={32}>What this is, and what it is not.</Display>
      </div>
      <Card T={T} style={{ marginTop: 24, padding: 20 }}>
        <p style={{ fontFamily: FONT_TEXT, fontSize: 15.5, lineHeight: 1.55, color: T.ink, margin: 0 }}>
          This planner provides general wellness and scheduling support based on
          research-informed principles. It does not provide medical advice, diagnosis,
          or treatment. For health conditions, medications, supplements, sleep disorders,
          or persistent fatigue, consult a qualified healthcare professional.
        </p>
      </Card>
      <div style={{ flex: 1, minHeight: 24 }} />
      <Btn T={T} kind="accent" full onClick={onNext}>I understand</Btn>
    </Arch>
  );
}

/* ----------------------------------- quiz --------------------------------- */

function Column({ T, items, selected, onPick, width, fmtItem }) {
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
}

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

  return (
    <div style={{ position: "relative", background: T.card, borderRadius: 22, padding: "0 10px" }}>
      <div style={{
        position: "absolute", left: 12, right: 12, top: "50%", height: 46,
        transform: "translateY(-50%)", borderRadius: 14, pointerEvents: "none",
        background: T.key === "warm" ? T.sunken : "rgba(255,255,255,0.06)",
      }} />
      <div style={{ position: "relative", display: "flex", justifyContent: "center", gap: 4 }}>
        <Column T={T} width={72} items={[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]}
          selected={cur.h} onPick={(h) => emit({ h })} />
        <Column T={T} width={72} items={[0, 15, 30, 45]} selected={cur.m}
          onPick={(m) => emit({ m })} fmtItem={(m) => String(m).padStart(2, "0")} />
        <Column T={T} width={72} items={["AM", "PM"]} selected={cur.ap} onPick={(ap) => emit({ ap })} />
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
    key: "nightInStretch", kind: "choice", q: "Which night of your stretch is tonight?",
    help: "Alertness and attention drop with each night worked in a row, so the plan asks less of you the deeper into a stretch you are.",
    options: [
      { v: 1, l: "First night", s: "Standard plan" },
      { v: 2, l: "Second night", s: "Slightly shorter gaps between resets" },
      { v: 3, l: "Third night", s: "Earlier caffeine cutoff, rest weighted heavier" },
      { v: 4, l: "Fourth or later", s: "Shortest resets, strongest sleep protection" },
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
    key: "caffeineSensitivity", kind: "choice", part: 2, q: "How sensitive are you to caffeine?",
    help: "This moves your cutoff by up to three hours. High sensitivity stops caffeine about eight hours before sleep; low, about five.",
    options: [
      { v: "low", l: "Not very", s: "Cutoff about five hours before sleep" },
      { v: "normal", l: "Average", s: "Cutoff about six hours before sleep" },
      { v: "high", l: "Very sensitive", s: "Cutoff about eight hours before sleep" },
    ],
  },
  {
    key: "movement", kind: "choice", part: 2, q: "How freely can you move during your shift?",
    help: "This sets how often resets are prompted, and whether they have to be doable without leaving your desk.",
    options: [
      { v: "desk", l: "I can rarely leave my desk", s: "Uses 30\u201360 second desk resets." },
      { v: "unpredictable", l: "Mostly seated, breaks are unpredictable", s: "Uses short backup resets." },
      { v: "seated", l: "Mostly seated, breaks when I need them", s: "Adds regular movement resets." },
      { v: "mixed", l: "About half seated", s: "Adds lighter movement reminders." },
      { v: "active", l: "Up and moving most of the shift", s: "Keeps movement reminders minimal." },
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
];

const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const toggleIn = (v, x) => {
  const arr = asList(v);
  return arr.includes(x) ? arr.filter((y) => y !== x) : [...arr, x];
};
function Quiz({ onDone, onBack }) {
  const T = WARM;
  const [i, setI] = useState(0);
  const [a, setA] = useState({
    shiftStart: "22:00", shiftEnd: "07:00", plannedSleep: "08:00",
    sleepGoalHours: 7.5, nightInStretch: 1, caffeine: "moderate",
    caffeineSensitivity: "normal", nap: "during",
    movement: "seated", lightEnv: "screens",
    commute: "drive", sleepiestTime: "deep",
  });
  /* The progress bar tracks the tap; the question body lags by one exit. */
  const [qi, qAnim] = useStepSwap(i);
  const q = QUESTIONS[qi];
  const pct = (i + 1) / QUESTIONS.length;

  const canNext = !q.multi || asList(a[q.key]).length > 0;
  const back = () => (i === 0 ? onBack() : setI(i - 1));
  const next = () => (i === QUESTIONS.length - 1 ? onDone(a) : setI(i + 1));

  const nav = (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <HeroBack onClick={back} />
      <div style={{
        flex: 1, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.24)", overflow: "hidden",
      }}>
        <div style={{ width: `${pct * 100}%`, height: "100%", background: "#FFFFFF", transition: "width 300ms ease" }} />
      </div>
      <span style={{
        fontFamily: FONT_TEXT, fontSize: 13, color: "rgba(255,255,255,0.8)", fontVariantNumeric: "tabular-nums",
      }}>{i + 1}/{QUESTIONS.length}</span>
    </div>
  );

  return (
    <Arch T={T} nav={nav} pad="60px 24px 28px">
      <div className={qAnim} style={{
        flex: 1, minHeight: 0, display: "flex", flexDirection: "column",
      }}>
      <div style={{ textAlign: "center" }}>
        <Eyebrow T={T}>{q.part === 2 ? "How you work the night" : "Your shift"}</Eyebrow>
        <Display T={T} size={28}>{q.q}</Display>
        {q.help && (
          <p style={{ fontFamily: FONT_TEXT, fontSize: 15, color: T.muted, marginTop: 10, lineHeight: 1.45 }}>{q.help}</p>
        )}
      </div>

      <div style={{ marginTop: 24, flex: 1, overflowY: "auto" }}>
        {q.kind === "time" ? (
          <div>
            <TimeWheel T={T} value={a[q.key]} onChange={(v) => setA({ ...a, [q.key]: v })} />
            <div style={{
              textAlign: "center", marginTop: 14, fontFamily: FONT_TEXT,
              fontSize: 13.5, color: T.faint,
            }}>Scroll or tap to set the time</div>
          </div>
        ) : (
          <div className="gy-list" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {q.options.map((o) => (
              <Choice key={o.v} T={T} label={o.l} sub={o.s}
                on={q.multi ? asList(a[q.key]).includes(o.v) : a[q.key] === o.v}
                onClick={() => setA({ ...a, [q.key]: q.multi ? toggleIn(a[q.key], o.v) : o.v })} />
            ))}
          </div>
        )}
      </div>
      </div>

      <Btn T={T} kind="accent" full onClick={canNext ? next : undefined}
        style={{ marginTop: 18, opacity: canNext ? 1 : 0.35, cursor: canNext ? "pointer" : "default" }}>
        {i === QUESTIONS.length - 1 ? "Build my plan" : "Continue"} <ArrowRight size={18} />
      </Btn>
    </Arch>
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
    why: "Caffeine cutoffs, light reduction, meal timing, and wind-down are all calculated backward from your sleep window, which is why this setting matters more than any other.",
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
    why: "Caffeine takes hours to clear, so a cup late in the shift is still working when your sleep window opens.",
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
      "Lighter drinks close to your sleep window",
    ],
    why: "Mild dehydration feels a lot like fatigue, and drinking steadily early means fewer bathroom trips breaking up the sleep you are protecting.",
    /* Nothing left to choose here: the timing numbers are adjustable instead. */
    controls: [],
  },
  {
    key: "movement", cat: "movement", title: "How often you get up",
    rule: "Short resets, often, rather than long breaks you will not take.",
    lines: (p) => [
      `A reset every ${movementInterval(p)} minutes`,
      movementMode(p).micro ? "Kept under a minute, no need to leave your desk" : "Two to three minutes each",
      "Shortened automatically if you start skipping them",
    ],
    why: "Long unbroken sitting adds stiffness and drowsiness on top of the night's own fatigue, and frequent short resets work better because they are the ones people actually do.",
    controls: [
      {
        key: "movement", q: "How freely can you move during your shift?",
        help: "Being stuck at your desk, or never knowing when a break lands, switches every reset to something you can do seated.",
        options: [
          { v: "desk", l: "Rarely leave my desk" }, { v: "unpredictable", l: "Breaks unpredictable" },
          { v: "seated", l: "Seated, breaks when needed" }, { v: "mixed", l: "About half seated" },
          { v: "active", l: "Up and moving" },
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
    why: "Bright light early supports alertness at no cost, while the same light near your sleep window tells your body the day is beginning.",
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
    why: "This is about timing rather than what you eat, because heavy food in the deep night or close to sleep tends to sit badly and make your sleep lighter.",
    /* Nothing left to choose here: the timing numbers are adjustable instead. */
    controls: [],
  },
  {
    key: "recovery", cat: "recovery", title: "Getting home and recovering",
    rule: "The end of the shift is the highest-risk part of the night, so it is handled separately.",
    lines: (p, ph) => [
      p.commute === "drive" ? "Safety check before you drive, with no skip option" : "Light kept low on the way home",
      `Sleep preparation at ${fmt(ph.sleepStart - 30)}`,
    ],
    why: "Sleepiness peaks toward the end of a night shift, exactly when most people commute, so the plan treats it as a safety matter.",
    controls: [
      {
        key: "commute", q: "How do you get home after work?",
        help: "Driving changes how the last part of the plan is handled.",
        options: [
          { v: "drive", l: "I drive" }, { v: "transit", l: "Public transport" },
          { v: "driven", l: "Someone drives me" }, { v: "walk", l: "Walk or bike" },
        ],
      },
],
  },
];

function Review({ T, profile, onSave, startAt = 0, single = false, onDone }) {
  const [i, setI] = useState(startAt);
  const [editing, setEditing] = useState(single);
  const [draft, setDraft] = useState(profile);

  const [si, segAnim] = useStepSwap(i);
  const seg = REVIEW[si];
  const d = DOMAIN[seg.cat];
  const ph = calculateShiftPhases(draft);
  const last = i === REVIEW.length - 1;

  const advance = () => {
    onSave(draft);
    if (single || last) onDone();
    else { setI(i + 1); setEditing(false); }
  };

  const nav = !single && (
    <div style={{ display: "flex", gap: 5 }}>
      {REVIEW.map((r, k) => (
        <div key={r.key} style={{
          flex: 1, height: 4, borderRadius: 2,
          background: k <= i ? "#FFFFFF" : "rgba(255,255,255,0.24)",
          transition: "background 300ms ease",
        }} />
      ))}
    </div>
  );

  return (
    <Arch T={T} Icon={d.Icon} nav={nav || undefined} pad="62px 22px 30px">
      <div className={segAnim} style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <div style={{ textAlign: "center", marginBottom: 14 }}>
        <div style={{
          fontFamily: FONT_TEXT, fontSize: 11, fontWeight: 700, letterSpacing: "0.13em",
          textTransform: "uppercase", color: d.hue,
        }}>{single ? "Adjust" : `${si + 1} of ${REVIEW.length}`} · {d.label}</div>
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
            <Check size={15} color={d.hue} weight="bold" style={{ flexShrink: 0 }} />
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
        <div className="gy-list" style={{ marginTop: 18 }}>
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
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        {!editing && (
          <Btn T={T} kind="soft" onClick={() => setEditing(true)} style={{ flex: 1 }}>
            <Pencil size={15} /> Adjust
          </Btn>
        )}
        <Btn T={T} kind="accent" onClick={advance} style={{ flex: editing ? 1 : 1.6 }}>
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
    </Arch>
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
    high: { t: "Caffeine gets tracked closely.", b: "You usually have four or more drinks, so the plan adds tracking, cutoff warnings, and water swaps. This is not about shaming caffeine use, it is about stopping it from spilling into the part of the shift that protects your sleep.",
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
    desk: { t: "Your resets stay desk-friendly.", b: "Since leaving your desk is difficult, the plan uses short seated resets: posture check, wrist stretch, neck release, eye rest, and breathing." },
    unpredictable: { t: "Your resets work without warning.", b: "Since you cannot count on when a break lands, the plan keeps every reset short enough to take at your desk the moment you get a gap." },
    seated: { t: "Your plan breaks up sitting often.", b: "Since most of your shift is seated but you can step away, the plan adds regular micro-resets: short breaks to stand, stretch, rest your eyes, and drink water. These are interruptions to sitting, not workouts." },
    mixed: { t: "Your plan adds moderate movement checks.", b: "Since your shift is partly seated, the plan adds movement reminders at the points that matter without crowding your checklist." },
    active: { t: "Movement reminders stay light.", b: "Since your shift already includes movement, the plan keeps movement prompts minimal and puts more weight on rest, hydration, and sleep protection." },
  }[profile.movement];

  const light = {
    screens: { t: "Screen care becomes part of the plan.", b: "Since your work is mostly screen-based, the plan adds eye breaks and screen comfort checks. Closer to sleep it will suggest lower brightness or a warmer display where that is possible." },
    bright: { t: "Late-shift light reduction matters.", b: "Since your workplace is bright, the plan focuses on cutting unnecessary light exposure as your sleep window gets closer." },
    dim: { t: "Dim light may need alertness checks.", b: "Since your workplace is dim, the plan watches for sleepiness and may suggest alertness-supportive light earlier in the shift where it is available." },
    mixed: { t: "Light prompts stay balanced.", b: "Since your light exposure changes through the night, the plan works on timing: alertness support earlier, light reduction later." },
  }[profile.lightEnv];

  const food = {
    t: "Eating gets decided in advance, not at 3 AM.",
    b: "The plan anchors your main meal before the shift, places one planned snack rather than leaving you to graze, and keeps late food light so digestion is not still working when you lie down.",
  };

  const water = "Water checks are paired with movement resets, and a long gap without one adds a prompt of its own.";

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

/* Collapsed by default. Seven of these expanded at once was a wall of prose
   before the user had done anything; the reasoning is still one tap away. */
function Section({ T, cat, title, body, items, adjustable, onAdjust }) {
  const [open, setOpen] = useState(false);
  return (
    <Card T={T} style={{ marginBottom: 8, padding: 15 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <Badge category={cat} T={T} size={32} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <button onClick={() => setOpen(!open)} style={{
            background: "none", border: "none", padding: 0, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
          }}>
            <span style={{
              flex: 1, fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 700, color: T.ink,
              letterSpacing: "-0.02em", lineHeight: 1.25,
            }}>{title}</span>
            <CaretDown size={14} color={T.faint} style={{
              flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 180ms ease",
            }} />
          </button>
          {open && (
          <p style={{ fontFamily: FONT_TEXT, fontSize: 14.5, lineHeight: 1.55, color: T.muted, margin: "8px 0 0" }}>
            {body}
          </p>
          )}
          {open && items && (
            <div style={{ marginTop: 12 }}>
              {items.map((it) => (
                <div key={it} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "4px 0" }}>
                  <Check size={14} color={DOMAIN[cat].hue} weight="bold"
                    style={{ flexShrink: 0, marginTop: 3 }} />
                  <span style={{ fontFamily: FONT_TEXT, fontSize: 14, color: T.ink, lineHeight: 1.4 }}>{it}</span>
                </div>
              ))}
            </div>
          )}
          {open && adjustable !== undefined && (
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
}

function Row({ T, k, v }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "9px 0", borderTop: `1px solid ${T.hair}` }}>
      <span style={{ fontFamily: FONT_TEXT, fontSize: 13.5, color: T.muted, width: 118, flexShrink: 0 }}>{k}</span>
      <span style={{ fontFamily: FONT_TEXT, fontSize: 13.5, fontWeight: 600, color: T.ink, flex: 1 }}>{v}</span>
    </div>
  );
}

/* A real slice of tonight's generated timeline, not a hand-written summary, so
   what the user previews is literally what the Plan tab will show. Movement
   resets repeat every couple of hours, so they collapse to one row. */
function TimelinePreview({ T, profile, ph }) {
  const { items } = generateTimeline(profile, [], ph.start);
  const seenMove = { n: 0 };
  const rows = items.filter((it) => {
    if (it.id.startsWith("move-")) { seenMove.n += 1; return seenMove.n === 1; }
    return true;
  }).slice(0, 8);

  return (
    <Card T={T} style={{ padding: "16px 16px 10px", marginBottom: 10 }}>
      {rows.map((it, k) => {
        const d = DOMAIN[it.category] || DOMAIN.shift;
        const repeats = it.id.startsWith("move-");
        return (
          <div key={it.id} style={{
            position: "relative", display: "flex", alignItems: "center", gap: 12, paddingBottom: 14,
          }}>
            {/* rail runs from under this badge to under the next one */}
            {k < rows.length - 1 && (
              <span style={{
                position: "absolute", left: 15, top: 32, bottom: -2, width: 2,
                borderRadius: 1, background: tint(d.hue, 0.28),
              }} />
            )}
            <Badge category={it.category} T={T} size={32} />
            <span style={{
              flex: 1, fontFamily: FONT_TEXT, fontSize: 14.5, color: T.ink,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{it.title}{repeats ? ", repeating" : ""}</span>
            <span style={{
              fontFamily: FONT_DISPLAY, fontSize: 13, fontWeight: 600, color: T.faint,
              fontVariantNumeric: "tabular-nums", flexShrink: 0,
            }}>{fmt(it.at)}</span>
          </div>
        );
      })}
    </Card>
  );
}

function Recommendation({ T, profile, revisit, onDone, onAdjust }) {
  const ph = calculateShiftPhases(profile);
  const r = buildRecommendation(profile, ph);

  return (
    <Arch T={T} Icon={Moon} pad="66px 20px 40px">
      <Eyebrow T={T}>{revisit ? "Your plan, explained" : "Your starting plan"}</Eyebrow>
      <Display T={T} size={32}>Your night-shift plan is ready.</Display>
      <p style={{ fontFamily: FONT_TEXT, fontSize: 15, lineHeight: 1.5, color: T.muted, margin: "10px 0 20px" }}>
        {fmt(ph.start)} to {fmt(ph.end)}, sleep protected from {fmt(ph.sleepStart)}.
      </p>

      <Eyebrow T={T}>Tonight's timeline</Eyebrow>
      <TimelinePreview T={T} profile={profile} ph={ph} />
      <p style={{
        fontFamily: FONT_TEXT, fontSize: 13, color: T.faint, margin: "0 4px 22px",
      }}>
        The full timeline lives in the Plan tab and adjusts as you log.
      </p>

      {/* three groups, not seven: sleep and caffeine are one decision, rest and
          movement are one, light and food are one */}
      <Eyebrow T={T}>Why these choices</Eyebrow>
      <Section T={T} onAdjust={onAdjust} cat="sleep" adjustable={0}
        title="Sleep and caffeine"
        body={`${r.sleepAnchor} ${r.caffeine.b}`}
        items={r.caffeine.items} />
      <Section T={T} onAdjust={onAdjust} cat="recovery" adjustable={3}
        title="Rest and movement"
        body={`${r.rest.b} ${r.movement.b}`}
        items={r.rest.items} />
      <Section T={T} onAdjust={onAdjust} cat="light" adjustable={4}
        title="Light and food"
        body={`${r.light.b} ${r.food.b}`} />

      <Eyebrow T={T}>Plan details</Eyebrow>
      <Card T={T} style={{ padding: "6px 18px 14px", marginBottom: 18 }}>
        <Row T={T} k="Plan type" v={r.p.type} />
        <Row T={T} k="Main focus" v={r.p.focus} />
        <Row T={T} k="Sleep" v={r.p.sleep} />
        <Row T={T} k="Caffeine" v={CAFFEINE_STRATEGY[profile.caffeine]} />
        <Row T={T} k="Rest" v={REST_STRATEGY[profile.nap]} />
      </Card>

      <Btn T={T} kind="accent" full onClick={onDone}>
        {revisit ? "Back to my plan" : "Start my plan"} <ArrowRight size={18} />
      </Btn>
    </Arch>
  );
}

/* One 22px slot, three states: waiting ring, spinning ring, filled check.
   The same filled-circle-and-white-check as a selected answer, so "done" reads
   the same everywhere. React reuses this div across states, so swapping the
   class is what fires the pop. */
function StepMark({ done, active, T }) {
  const hue = DOMAIN.movement.hue;
  if (done) {
    return (
      <div className="gy-pop" style={{
        width: 22, height: 22, borderRadius: 11, flexShrink: 0, background: hue,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}><Check size={12} color="#FFFFFF" weight="bold" /></div>
    );
  }
  return (
    <div className={active ? "gy-spin" : undefined} style={{
      width: 22, height: 22, borderRadius: 11, flexShrink: 0, boxSizing: "border-box",
      border: `2px solid ${active ? tint(hue, 0.22) : T.hair}`,
      borderTopColor: active ? hue : undefined,
    }} />
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
  /* A fragment, not a wrapper: the rows become direct children of the sheet,
     so they pick up its stagger instead of all arriving behind one container.
     The heavy bottom padding biases the centred block upward, off the floor. */
  return (
    <Arch T={T} Icon={Moon} center pad="64px 28px 190px">
      <Display T={T} size={30} style={{ marginBottom: 22, textAlign: "center" }}>Building your plan.</Display>
      {steps.map((s, k) => (
        <div key={s} style={{
          display: "flex", alignItems: "center", gap: 13, padding: "10px 0",
          opacity: k <= i ? 1 : 0.34, transition: "opacity 320ms ease",
        }}>
          <StepMark done={k < i} active={k === i} T={T} />
          <span style={{
            fontFamily: FONT_TEXT, fontSize: 15.5, color: k < i ? T.ink : T.muted,
            transition: "color 320ms ease",
          }}>{s}</span>
        </div>
      ))}
    </Arch>
  );
}

/* ------------------------------- timeline card ---------------------------- */

function TimelineItem({ item, T, status, onAct, now, showRail = true, inDeepNight = false }) {
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
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{
                fontFamily: FONT_TEXT, fontSize: 16, fontWeight: 600, color: T.ink,
                textDecoration: done ? "line-through" : "none",
              }}>{item.title}</span>
              {/* the circadian low used to label a whole phase band; with a flat
                  list it belongs on the items it actually covers */}
              {inDeepNight && (
                <span style={{
                  fontFamily: FONT_TEXT, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
                  textTransform: "uppercase", color: "#6C6BE8",
                  background: tint("#6C6BE8", 0.14), padding: "3px 8px", borderRadius: 999,
                }}>Circadian low</span>
              )}
            </div>
            <p style={{ fontFamily: FONT_TEXT, fontSize: 14, lineHeight: 1.45, color: T.muted, margin: "5px 0 0" }}>
              {item.msg}
            </p>
            {item.changed && (
              <div style={{
                display: "flex", alignItems: "flex-start", gap: 7, marginTop: 10,
                padding: "9px 11px", borderRadius: 12, background: tint(d.hue, 0.11),
              }}>
                <ArrowCounterClockwise size={13} color={d.hue} style={{ flexShrink: 0, marginTop: 2 }} />
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
                {done ? <><Check size={13} /> Done</> : <>Skipped, the plan adapted</>}
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

const LOG_TYPES = [
  { v: "wake", l: "Woke up", cat: "sleep", val: "ontime",
    details: ["Earlier", "On time", "Later"] },
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

function metaFor(l) {
  return LOG_TYPES.find((x) => x.v === l.type)
    || (l.type === "item"
      ? { l: l.value.status === "done" ? "Movement reset" : "Skipped a break", cat: l.value.category }
      : { l: l.type, cat: "shift" });
}

/* --------------------------------- plan --------------------------------- */
function PlanTab({
  T, plan, s, ph, profile, now, showAllPlan, setShowAllPlan, hideDone, setHideDone,
  setScreen, onAct, setAdjustDraft, setAdjusting,
}) {
  const moves = plan.items.filter((i) => i.id.startsWith("move-"));
  const others = plan.items.filter((i) => !i.id.startsWith("move-"));
  const collapsed = !showAllPlan && moves.length > 1;
  let display = collapsed
    ? [...others, { ...moves[0], recurring: moves }].sort((a, b) => a.at - b.at)
    : plan.items;
  if (hideDone) display = display.filter((i) => s.itemStatus(i.id) === "open" || i.recurring);

  /* One flat, time-ordered list. The old build grouped items into phase bands,
     which silently dropped anything falling outside every phase window while
     still counting it in "x of y done". A flat list cannot lose an item. */
  const inDeepNight = (at) =>
    !!ph.deepNight && at >= ph.deepNight[0] && at < ph.deepNight[1];

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
        <CaretRight size={17} color={T.faint} />
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

      {display.map((it) =>
        it.recurring ? (
          <RecurringCard key="recurring" item={it} T={T} gap={movementInterval(profile)}
            onExpand={() => setShowAllPlan(true)}
            onAdjust={() => { setAdjustDraft({}); setAdjusting(it.id); }} />
        ) : (
          <TimelineItem key={it.id} item={it} T={T} now={now}
            status={s.itemStatus(it.id)} onAct={onAct}
            inDeepNight={inDeepNight(it.at)} />
        )
      )}

      {!display.length && (
        <p style={{ fontFamily: FONT_TEXT, fontSize: 15, color: T.faint, lineHeight: 1.5 }}>
          Nothing left open. Switch to showing everything if you want to look back over the night.
        </p>
      )}
    </div>
  );
}

const REFLECT_QS = [
  { k: "slept", q: "How long did you sleep?", o: ["Under 5h", "5–6h", "7–9h", "Over 9h"] },
  { k: "rested", q: "How rested do you feel?", o: ["Not at all", "A little", "Fairly", "Very"] },
  { k: "sleepiest", q: "When were you most sleepy?", o: ["Early shift", "Mid-shift", "Deep night", "Last hours"] },
  { k: "caffeineImpact", q: "Did caffeine affect your sleep?", o: ["Yes", "Maybe", "No", "Had none"] },
  { k: "movement", q: "Did you complete your movement breaks?", o: ["Most", "Some", "Few", "None"] },
  { k: "napped", q: "Did you nap or rest?", o: ["Napped", "Quiet rest", "Neither"] },
  { k: "adjust", q: "What should the plan change next shift?", o: ["Earlier caffeine cutoff", "More rest", "Fewer resets", "Nothing"] },
];

function ReflectionBlock({ T, reflection, setReflection, push, profile, setProfile, say }) {
  return (
    <div>
      {/* selects rather than pill rows: seven questions of four options each ran
          to about five screens of scrolling, and an unanswered question now
          reads as unanswered instead of blending into the grid */}
      {REFLECT_QS.map((x) => (
        <Select key={x.k} T={T} label={x.q} options={x.o}
          value={reflection[x.k] ?? null}
          onChange={(v) => setReflection({ ...reflection, [x.k]: v })} />
      ))}
      <Btn T={T} full onClick={() => {
        if (reflection.slept === "Under 5h" || reflection.rested === "Not at all") push("sleepQuality", "poor");
        if (reflection.adjust === "Earlier caffeine cutoff") {
          setProfile({ ...profile, caffeineSensitivity: "high" });
          say("Caffeine cutoff moved earlier for the next shift.");
        } else if (reflection.adjust === "Fewer resets") {
          setProfile({ ...profile, movement: "active" });
          say("Resets spaced further apart for the next shift.");
        } else say("Saved. The next plan will use this.");
      }}>Save reflection</Btn>
    </div>
  );
}

/* ---------------------------------- log --------------------------------- */
function LogTab({
  T, logs, setLogs, profile, plan, now, s, ph, editingLog, setEditingLog, say,
  saveManualLog, clockToAbs, logDraft, setLogDraft, reflection, setReflection, push, setProfile,
}) {
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
        {/* thirteen pills wrapped to five rows before the time picker was even
            visible; one select keeps the whole control above the fold */}
        <Select T={T} label="What are you logging?" placeholder="Choose a type"
          value={t ? t.l : null}
          options={LOG_TYPES.map((x) => x.l)}
          onChange={(label) => {
            const found = LOG_TYPES.find((x) => x.l === label);
            setLogDraft({ ...logDraft, type: found ? found.v : logDraft.type, note: "" });
          }} />

        {t && t.details && (
          <Select T={T} label="Detail" placeholder="Optional"
            value={logDraft.note || null} options={t.details}
            onChange={(note) => setLogDraft({ ...logDraft, note: note || "" })} />
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
                <CaretRight size={15} color={T.faint}
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
                <ArrowCounterClockwise size={13} color={DOMAIN.recovery.hue} style={{ flexShrink: 0, marginTop: 4 }} />
                <span style={{ fontFamily: FONT_TEXT, fontSize: 14.5, color: T.ink, lineHeight: 1.5 }}>{c}</span>
              </div>
            ))}
          </Card>
        </>
      )}

      <Eyebrow T={T}>Daily reflection</Eyebrow>
      <ReflectionBlock T={T} reflection={reflection} setReflection={setReflection}
        push={push} profile={profile} setProfile={setProfile} say={say} />
    </div>
  );
}

/* --------------------------------- care --------------------------------- */
function LiveTab({ T, profile, plan, now, setPlaying }) {
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
}

/* ------------------------------ profile sheet ---------------------------- */
function ProfileRow({ T, Icon, l, sub, onClick, hue }) {
  return (
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
      {onClick && <CaretRight size={17} color={T.faint} />}
    </button>
  );
}

function ProfileSheet({
  T, profile, logs, history, ph, setProfileOpen, setProfile, setTimeEdit,
  themeOverride, setThemeOverride, setReview, setScreen, exportData, exportText,
}) {
  const badges = achievements(profile, logs, history);
  /* two taps, because this erases a profile rather than one log entry */
  const [armed, setArmed] = useState(false);

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
      <ProfileRow T={T} Icon={Pencil} hue={DOMAIN.sleep.hue} l="Edit profile"
        sub="Walk back through all seven segments"
        onClick={() => { setProfileOpen(false); setReview({ index: 0, single: false, back: "app" }); setScreen("review"); }} />
      <ProfileRow T={T} Icon={FileText} hue={DOMAIN.light.hue} l="Why this plan"
        sub={planSummary(profile).type}
        onClick={() => { setProfileOpen(false); setScreen("recommendation-revisit"); }} />
      <ProfileRow T={T} Icon={Bed} hue={DOMAIN.recovery.hue} l="Sleep schedule"
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
          Turning one off keeps it on your plan, it just stops nudging you.
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
      <ProfileRow T={T} Icon={DownloadSimple} hue={DOMAIN.water.hue} l="Export data"
        sub="Everything logged, as a JSON file" onClick={exportData} />
      <ProfileRow T={T} Icon={ArrowCounterClockwise} hue={DOMAIN.food.hue}
        l={armed ? "Tap again to erase everything" : "Start over"}
        sub={armed
          ? "Your profile, every night on record and tonight's logs. This cannot be undone."
          : "Erase everything and retake the quiz"}
        onClick={() => {
          if (!armed) { setArmed(true); return; }
          /* clear and reload rather than null the state: setProfile(null) leaves
             useScreenSwap rendering the app for another 300ms, and that render
             destructures a null plan */
          save({});
          location.reload();
        }} />
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
          <Question size={15} color={T.faint} style={{ flexShrink: 0, marginTop: 2 }} />
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
}

/* ---------------------------- quick log sheet ---------------------------- */
function Sheet({
  T, sheet, setSheet, setQuickResult, push, say, quickResult, setEditingLog,
  setTab, now, quickLog, setLogs,
}) {
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
              }}><ArrowCounterClockwise size={14} /> Undo</Btn>
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
}

/* ------------------------------- adjust sheet ---------------------------- */
function AdjustSheet({
  T, adjusting, setAdjusting, plan, profile, adjustDraft, setAdjustDraft,
  logs, now, setProfile, say, setReview, setScreen,
}) {
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
            }}><ArrowCounterClockwise size={15} /> Reset</Btn>
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
}

/* Read once, at import. A blob stamped with a different night is a previous
   night's: the profile, the theme and the archive survive it, and its logs and
   reflection are folded onto the front of that archive rather than dropped, so
   tonight's plan starts clean and last night is still on record.
   The try/catch covers more than JSON. A blob that parses but is missing
   shiftStart throws inside calculateShiftPhases, at module scope, where no error
   boundary can catch it — a white screen before React has mounted. Falling back
   to the quiz is the honest failure. That catch guards only a throw, and a
   profile missing sleepGoalHours does not throw: calculateShiftPhases returns
   sleepEnd = NaN, nightOf returns a NaN axis, and boot would otherwise render a
   plan that looks booted and re-persists its own NaN stamp on every mount, so
   the finite check below is the other half of schema validation for this
   phase. */
const boot = (() => {
  try {
    const s = load();
    if (!s.profile) return {};
    const { id, now } = nightOf(calculateShiftPhases(s.profile));
    if (!Number.isFinite(now)) return {};
    return { ...forNight(s, id), night: id, now };
  } catch (e) { console.warn("gy: discarding saved state", e); return {}; }
})();

export default function App() {
  const [screen, setScreen] = useState(boot.profile ? "app" : "welcome");
  const [tab, setTab] = useState("dashboard");
  const [profile, setProfile] = useState(boot.profile ?? null);
  const [logs, setLogs] = useState(boot.logs ?? []);
  /* seeded, not left at 0: the tick effect below only runs after the first
     paint, so without this the restored plan renders one frame at minute zero */
  const [now, setNow] = useState(boot.now ?? 0);
  const [sheet, setSheet] = useState(null);
  const [toast, setToast] = useState(null);
  const [answer, setAnswer] = useState(null);
  const [themeOverride, setThemeOverride] = useState(boot.theme ?? null);
  const [reflection, setReflection] = useState(boot.reflection ?? {});
  /* The archive is state because the write effect must fire when it grows.
     The night id is a ref because nothing renders it — only the three effects
     below read it, and re-rendering the app to change a string it never shows
     is work for nobody. */
  const [archive, setArchive] = useState(boot.archive ?? []);
  const nightRef = useRef(boot.night);
  const [review, setReview] = useState({ index: 0, single: false, back: "app" });
  const [whyOpen, setWhyOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [showAllPlan, setShowAllPlan] = useState(false);
  const [hideDone, setHideDone] = useState(true);
  const [exportText, setExportText] = useState(null);
  const [logDraft, setLogDraft] = useState({ type: "water", h: 12, m: 0, ap: "AM", note: "" });
  /* opens on tonight, the rightmost chip of the day strip */
  const [rangeKey, setRangeKey] = useState("d0");
  const [adjusting, setAdjusting] = useState(null);
  const [adjustDraft, setAdjustDraft] = useState({});
  const [quickResult, setQuickResult] = useState(null);
  const [playing, setPlaying] = useState(null);
  const [timeEdit, setTimeEdit] = useState(null);
  const [editingLog, setEditingLog] = useState(null);
  const [shownScreen, screenAnim] = useScreenSwap(screen);

  /* nightOf reads the wake boundary out of the profile, so editing your shift
     or sleep times can change which night the current clock belongs to. That is
     a re-labelling, not a rollover: adopt the new id without folding. Without
     this, changing your shift time at 3am looks exactly like a boundary
     crossing to the tick below, which would archive the night you are standing
     in and clear the plan under you. It covers the quiz too — profile goes null
     to set, this fires, and the first tick sees a match rather than rolling a
     night that never happened. Declared first on purpose: effects run in order,
     so the ref is correct before anything below reads it. */
  useEffect(() => {
    if (profile) nightRef.current = nightOf(calculateShiftPhases(profile)).id;
  }, [profile && profile.shiftStart, profile && profile.shiftEnd,
      profile && profile.plannedSleep, profile && profile.sleepGoalHours]);

  /* One key, one blob, one write. The stamp comes off the ref rather than the
     clock: between the boundary and the tick that answers it, the logs in hand
     are still last night's and have to be written under last night's name.
     Deriving it here from the clock is what let a single log tapped in that
     window carry a whole night across the boundary. The guard also means
     nothing reaches the device until the quiz is finished. */
  useEffect(() => {
    if (!profile) return;
    save({ night: nightRef.current, profile, logs, reflection, theme: themeOverride, archive });
  }, [profile, logs, reflection, themeOverride, archive]);

  useEffect(() => {
    if (!profile) return;
    const tick = () => {
      const { id: night, now } = nightOf(calculateShiftPhases(profile));
      setNow(now);
      if (night === nightRef.current) return;
      /* the night ended while the app was open: fold it, then start clean */
      const next = archived({ night: nightRef.current, profile, logs, reflection, archive });
      nightRef.current = night;
      setArchive(next);
      setLogs([]);
      setReflection({});
      /* only when something was actually folded — "last night is saved" is a
         lie for a night with nothing logged, and nothing visibly unticks */
      if (next.length > archive.length) say("Last night is saved. Tonight's plan starts fresh.");
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [profile, logs, reflection, archive]);

  const plan = useMemo(
    () => (profile ? generateTimeline(profile, logs, now) : null),
    [profile, logs, now]
  );
  const advice = useMemo(
    () => (plan ? generateAdvice(profile, logs, now, plan) : null),
    [plan, profile, logs, now]
  );

  /* Nights are derived, never stored. The mock supplies the past, folded from
     the profile so it follows whatever shift the quiz produced; tonight is
     folded from the live logs and sits at the front as the most recent night.
     Index 0 is the newest, which is what every range slice assumes. */
  const history = useMemo(() => {
    if (!profile) return [];
    const past = materializeNights(profile);
    const tonight = foldNight(profile, logs, reflection);
    return tonight ? [tonight, ...past] : past;
  }, [profile, logs, reflection]);

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
    const p = { ...a, chronotype: "neither" };
    setProfile(p);
    setNow(nightOf(calculateShiftPhases(p)).now);
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
  if (shownScreen === "welcome")
    return <Frame T={WARM} anim={screenAnim}><Welcome onNext={() => setScreen("disclaimer")} /></Frame>;
  if (shownScreen === "disclaimer")
    return <Frame T={WARM} anim={screenAnim}><Disclaimer onNext={() => setScreen("quiz")} onBack={() => setScreen("welcome")} /></Frame>;
  if (shownScreen === "quiz")
    return <Frame T={WARM} anim={screenAnim}><Quiz onDone={finishQuiz} onBack={() => setScreen("disclaimer")} /></Frame>;
  if (shownScreen === "generating")
    return <Frame T={WARM} anim={screenAnim}><Generating onDone={() => setScreen("recommendation")} /></Frame>;
  if (shownScreen === "recommendation" || shownScreen === "recommendation-revisit") {
    const revisit = shownScreen === "recommendation-revisit";
    const RT = revisit ? T : WARM;
    return (
      <Frame T={RT} anim={screenAnim}>
        <Recommendation
          T={RT} profile={profile} revisit={revisit}
          onDone={() => setScreen("app")}
          onAdjust={(idx) => {
            setReview({ index: idx, single: true, back: shownScreen });
            setScreen("review");
          }}
        />
      </Frame>
    );
  }
  if (shownScreen === "review") {
    const RT = review.single ? T : WARM;
    return (
      <Frame T={RT} anim={screenAnim}>
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

  /* ---------------------------------- log --------------------------------- */

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
    /* "Quiet rest" is a rest the user chose, not a nap they failed to take.
       It used to map to "couldnt", which told the plan the nap had failed. */
    if (t.v === "nap") value = note === "Woke groggy" ? "groggy" : note === "Quiet rest" ? "quiet" : "ok";
    if (t.v === "wake") value = note === "Earlier" ? "earlier" : note === "Later" ? "later" : "ontime";
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

  /* ------------------------------ profile sheet ---------------------------- */
  const exportData = () => {
    const payload = JSON.stringify({ app: "GraveYard", profile, logs, history, reflection, archive }, null, 2);
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

  /* -------------------------------- chrome -------------------------------- */
  const TABS = [
    { k: "dashboard", l: "Dashboard", Icon: ChartBar },
    { k: "plan", l: "Plan", Icon: ListChecks },
    { k: "log", l: "Reflection", Icon: FileText },
    { k: "live", l: "Care", Icon: Heart },
  ];

  return (
    <Frame T={T} raw anim={screenAnim}>
      {/* header, pinned */}
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
        {tab === "dashboard" && (
          <Dashboard T={T} profile={profile} nights={history}
            rangeKey={rangeKey} setRangeKey={setRangeKey} say={say} setProfile={setProfile}
            plan={plan} status={s.itemStatus} now={now} onOpenPlan={() => setTab("plan")} />
        )}
        {tab === "plan" && (
          <PlanTab
            T={T} plan={plan} s={s} ph={ph} profile={profile} now={now}
            showAllPlan={showAllPlan} setShowAllPlan={setShowAllPlan}
            hideDone={hideDone} setHideDone={setHideDone}
            setScreen={setScreen} onAct={onAct}
            setAdjustDraft={setAdjustDraft} setAdjusting={setAdjusting}
          />
        )}
        {tab === "log" && (
          <LogTab
            T={T} logs={logs} setLogs={setLogs} profile={profile} plan={plan} now={now}
            s={s} ph={ph} editingLog={editingLog} setEditingLog={setEditingLog} say={say}
            saveManualLog={saveManualLog} clockToAbs={clockToAbs}
            logDraft={logDraft} setLogDraft={setLogDraft}
            reflection={reflection} setReflection={setReflection} push={push} setProfile={setProfile}
          />
        )}
        {tab === "live" && <LiveTab T={T} profile={profile} plan={plan} now={now} setPlaying={setPlaying} />}
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

      {/* tab bar, pinned */}
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

      <Sheet
        T={T} sheet={sheet} setSheet={setSheet} setQuickResult={setQuickResult}
        push={push} say={say} quickResult={quickResult} setEditingLog={setEditingLog}
        setTab={setTab} now={now} quickLog={quickLog} setLogs={setLogs}
      />
      <AdjustSheet
        T={T} adjusting={adjusting} setAdjusting={setAdjusting} plan={plan} profile={profile}
        adjustDraft={adjustDraft} setAdjustDraft={setAdjustDraft} logs={logs} now={now}
        setProfile={setProfile} say={say} setReview={setReview} setScreen={setScreen}
      />
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
      {profileOpen && (
        <ProfileSheet
          T={T} profile={profile} logs={logs} history={history} ph={ph}
          setProfileOpen={setProfileOpen} setProfile={setProfile} setTimeEdit={setTimeEdit}
          themeOverride={themeOverride} setThemeOverride={setThemeOverride}
          setReview={setReview} setScreen={setScreen} exportData={exportData} exportText={exportText}
        />
      )}
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
                Show all {n} <CaretDown size={14} />
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

function Frame({ T, children, raw, anim }) {
  return (
    <div style={{
      height: "100dvh", width: "100%", background: T.key === "warm" ? "#DEDBD3" : "#08080B",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
      transition: "background 500ms ease", overflow: "hidden",
    }}>
      {/* In raw mode the tab bar is part of children, so the animation goes on
          the whole phone body; otherwise only the scrolling content moves. */}
      <div className={raw ? anim : undefined} style={{
        width: "100%", maxWidth: 430, height: "100dvh", background: T.bg,
        position: "relative", overflow: "hidden", transition: "background 500ms ease",
        paddingTop: 14, display: "flex", flexDirection: "column",
      }}>
        {raw ? children : (
          <div className={anim} style={{
            flex: 1, minHeight: 0, overflowY: "auto",
            display: "flex", flexDirection: "column",
          }}>{children}</div>
        )}
      </div>
    </div>
  );
}
