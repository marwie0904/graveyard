import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Moon, Pulse, Heart, Clock, Check,
  CaretRight, Plus, Wind, Eye, Bed, ArrowRight, ArrowLeft,
  X, ListChecks, Info, Footprints, ArrowCounterClockwise, Pencil,
  User, DownloadSimple, Bell, Target, ChartBar, FileText, Palette,
  Question, Lock, CaretDown, Play, SpeakerHigh, SpeakerSlash,
} from "./icons.jsx";
import { DAY, toMin, fmt, nextAfter, dur, nightOf, forward, daysBetween } from "./time.js";
import { sequenceOf, cueFor, DONE_CUE, tone, speak, hush } from "./cues.js";
import { FONT_DISPLAY, FONT_TEXT, WARM, DARK, DOMAIN, ACCENT, tint, fillOf } from "./tokens.js";
import {
  calculateShiftPhases, determineCurrentPhase, calculateCaffeineCutoff,
  movementInterval, movementMode, ov, generateTimeline, generateAdvice, ADJUSTABLE, stretchNight,
  reflectionAdjust, planGate,
} from "./planner.js";
import { materializeNights } from "./mockNights.js";
import { foldNight, achievements, countStretch, sleepBand } from "./stats.js";
import { load, save, forNight, archived } from "./storage.js";
import { Card, Btn, Pill, Badge, Display, Eyebrow, Select, Arch, Choice, Disclosure, useOverlay } from "./ui/index.jsx";
import Dashboard from "./screens/Dashboard.jsx";
import Tour, { TOUR } from "./screens/Tour.jsx";

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
  const ref = useOverlay(true, onClose);
  const seq = useMemo(() => sequenceOf(activity), [activity]);

  const total = seq.reduce((a, x) => a + x.s, 0);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(true);
  /* On when the player opens: the spoken step is the guidance, not an
     ornament, and a user who has to switch it on every time will not.
     WCAG 1.4.2 allows audio to start on its own provided there is a way to
     stop it, which is what the control in the header is for.
     ponytail: the choice is per-session. Move it to the profile if anyone asks. */
  const [sound, setSound] = useState(true);
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
  const d = DOMAIN[activity.cat];
  const hue = d.hue;
  const scale = finished ? 0.8 : step.scale !== undefined ? step.scale : 0.86;

  /* One cue per step change and one at the end. The tone marks the boundary for
     anyone not looking at the ring; the spoken label is the instruction itself,
     which is the point of having a second channel at all. */
  useEffect(() => {
    if (!sound || finished) return;
    tone();
    speak(cueFor(seq[idx]));
  }, [idx, sound, finished, seq]);

  useEffect(() => {
    if (!sound || !finished) return;
    tone(660, 240);
    speak(DONE_CUE);
  }, [finished, sound]);

  useEffect(() => hush, []); // stop mid-sentence if the sheet closes

  return (
    <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={activity.l} style={{
      position: "absolute", inset: 0, background: T.bg, zIndex: 90,
      display: "flex", flexDirection: "column", padding: "44px 24px 32px",
    }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <div style={{ flex: 1 }}>
          {/* an 11px uppercase caption is text, so it takes the domain's `ink`
              like the countdown and the sound button below it — the raw hue
              read 2.02:1 here for `light` in warm, against 5.25:1 for its ink */}
          <Eyebrow T={T} color={d.ink[T.key]}>Micro-care</Eyebrow>
          <Display T={T} size={26}>{activity.l}</Display>
        </div>
        <button
          onClick={() => { if (sound) hush(); setSound(!sound); }}
          aria-pressed={sound}
          aria-label={sound ? "Spoken guidance on" : "Spoken guidance off"}
          style={{
            width: 38, height: 38, borderRadius: 19, border: "none", marginRight: 8,
            background: sound ? tint(hue, 0.22) : T.card, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>{sound
            ? <SpeakerHigh size={17} color={d.ink[T.key]} />
            : <SpeakerSlash size={17} color={T.muted} />}</button>
        <button onClick={onClose} aria-label="Close" style={{
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
            color: d.ink[T.key], fontVariantNumeric: "tabular-nums", letterSpacing: "-0.03em",
          }}>{finished ? "✓" : left}</span>
        </div>

        {/* Step changes and completion announce here; the per-second number stays
            outside the region on purpose. With spoken guidance on the app says the
            step itself, so the region goes quiet rather than doubling it. */}
        <div aria-live={sound ? "off" : "polite"} style={{ textAlign: "center", minHeight: 54 }}>
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
          borderRadius: 2, background: d.fill[T.key], transition: "width 1s linear",
        }} />
      </div>

      {finished ? (
        <Btn T={T} full onClick={onDone}>Log it and close</Btn>
      ) : (
        <>
          {/* The clock was the only thing that could move the sequence on, so
              anyone reading slower than 30 seconds a step had no way to keep
              up or move ahead. `acc` is already the start of the current step,
              so the next one starts one step's length later; on the last step
              that lands exactly on total, and the min says so out loud.
              Its own row rather than a third button beside the other two:
              three of these labels do not fit a 375px phone without wrapping. */}
          <Btn T={T} kind="soft" full style={{ marginBottom: 10 }}
            onClick={() => setElapsed(Math.min(acc + step.s, total))}>Next step</Btn>
          <div style={{ display: "flex", gap: 10 }}>
            <Btn T={T} kind="quiet" style={{ flex: 1 }} onClick={() => setRunning(!running)}>
              {running ? "Pause" : "Resume"}
            </Btn>
            <Btn T={T} style={{ flex: 1.4 }} onClick={() => setElapsed(total)}>Finish early</Btn>
          </div>
        </>
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
          Thirteen quick questions, and the first one is optional.
          Then get a plan you can adjust.
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

      {/* Deliberately not "nothing is saved": it is saved, to localStorage,
          which is what survives the reload. The honest claim is the narrower
          one — it never leaves the device — and onboarding.test.js holds the
          codebase to it by failing on the first fetch anyone adds. */}
      <Card T={T} style={{ marginTop: 12, padding: 20 }}>
        <Eyebrow T={T}>Stored on this device</Eyebrow>
        <p style={{
          fontFamily: FONT_TEXT, fontSize: 15.5, lineHeight: 1.55, color: T.ink, margin: 0,
        }}>
          Everything you enter stays in this browser, on this device. There is no
          account, no server, and no analytics — nothing you enter is ever sent
          anywhere.
        </p>
        <p style={{
          fontFamily: FONT_TEXT, fontSize: 14, lineHeight: 1.5, color: T.muted, margin: "10px 0 0",
        }}>
          Clearing your browser data clears your plan with it.
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
          /* The size and weight jump was the whole of "this is the one".
             aria-pressed the way the day strip states its night, rather than a
             listbox: that would want roles on all three columns and on the
             wheel around them to say the same sentence out loud. */
          <button key={String(it)} data-on={on ? "1" : "0"} aria-pressed={on} onClick={() => onPick(it)}
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
  /* Optional, and optional for free: canNext only ever gates on `multi`, so a
     text question is skippable without a skip button. Nothing in the plan
     reads it — it is only ever the greeting on your own profile card. */
  {
    key: "name", kind: "text", eyebrow: "First things first",
    q: "What should we call you?",
    help: "Optional. It only ever appears on your own profile, on this device.",
    placeholder: "Your name",
  },
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
    help: "Alertness and attention drop with each night worked in a row, so the plan asks less of you the deeper into a stretch you are. Just tonight. After this the app counts it from the nights you log.",
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
        <Eyebrow T={T}>{q.eyebrow || (q.part === 2 ? "How you work the night" : "Your shift")}</Eyebrow>
        <Display T={T} size={28}>{q.q}</Display>
        {q.help && (
          <p style={{ fontFamily: FONT_TEXT, fontSize: 15, color: T.muted, marginTop: 10, lineHeight: 1.45 }}>{q.help}</p>
        )}
      </div>

      <div style={{ marginTop: 24, flex: 1, overflowY: "auto" }}>
        {q.kind === "text" ? (
          /* Same card-on-sunken field the profile sheet already uses for this
             exact value, so the one place you can edit it later looks like the
             place you first typed it. */
          <div style={{ background: T.card, borderRadius: 22, padding: "18px 20px" }}>
            <input value={a[q.key] || ""} placeholder={q.placeholder} autoFocus
              aria-label={q.q} enterKeyHint="next"
              onChange={(e) => setA({ ...a, [q.key]: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter" && canNext) next(); }}
              style={{
                width: "100%", border: "none", background: "transparent", outline: "none",
                fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 700, color: T.ink,
                letterSpacing: "-0.02em", padding: 0, "--gy-placeholder": T.faint,
              }} />
          </div>
        ) : q.kind === "time" ? (
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

      {/* Not-yet-answerable used to be opacity 0.35 over the whole button, which
          took its own white label down with it. `soft` is the same swap the
          rest of the app makes for a button with nothing behind it, and its
          ink-on-sunken pair is already in the token table at 4.68:1. */}
      <Btn T={T} kind={canNext ? "accent" : "soft"} full onClick={canNext ? next : undefined}
        style={{ marginTop: 18, cursor: canNext ? "pointer" : "default" }}>
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
          textTransform: "uppercase", color: d.ink[T.key],
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
            <Check size={15} color={d.fill[T.key]} weight="bold" style={{ flexShrink: 0 }} />
            <span style={{ fontFamily: FONT_TEXT, fontSize: 15, color: T.ink, lineHeight: 1.35 }}>{l}</span>
          </div>
        ))}
      </Card>

      <div style={{
        marginTop: 14, padding: "14px 16px", borderRadius: 18, background: tint(d.hue, 0.09),
      }}>
        <div style={{
          fontFamily: FONT_TEXT, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.13em",
          textTransform: "uppercase", color: d.ink[T.key], marginBottom: 7,
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

/* One four-way split, not two. readPatterns proposes a band and this names the
   plan type for it, so two hand-kept sets of cuts would eventually propose a
   band whose plan type is not the one the copy describes. sleepBand owns them;
   its four values are exactly these four keys. */
const PLAN_SUMMARY = {
  4.5: {
    band: "under5", type: "High-fatigue protection plan",
    focus: "Rest, safety, and sleep protection.",
    sleep: "Protect sleep as early as possible.",
    caffeine: "Earlier cutoff and no late-shift caffeine",
  },
  5.5: {
    band: "s56", type: "Short-sleep support plan",
    focus: "Add rest and protect sleep earlier.",
    sleep: "Use a nap or quiet rest if available.",
    caffeine: "Earlier caffeine window with a cutoff reminder",
  },
  7.5: {
    band: "s79", type: "Steady rhythm plan",
    focus: "Keep your routine stable.",
    sleep: "Maintain your sleep window.",
    caffeine: "Use caffeine early, protect sleep later",
  },
  9.5: {
    band: "over9", type: "Recovery-pattern plan",
    focus: "Support recovery, hold your timing.",
    sleep: "Track whether long sleep is recovery or routine.",
    caffeine: "Avoid late caffeine so sleep timing stays stable",
  },
};

function planSummary(profile) {
  return PLAN_SUMMARY[sleepBand(profile.sleepGoalHours)];
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

/* A row needs both halves: the plan has to schedule it, or the card's promise
   that it "keeps it on your plan" is over nothing, and the night record has to
   measure it, or the switch is a preference the app never counts. That leaves
   out wind-down and the fatigue check-in, which the record does not carry, and
   waking and the reflection, which are logged after the plan ends. The commute
   check has no row for the opposite reason: it is the one plan item with no
   skip button, so it must not be mutable from here either.

   Light passes both halves and was cut anyway, on the grounds that its nudges
   collapse into one lateLightDone boolean. That is the argument for one row per
   measured field, not for none — and caffeine already spends two rows on the
   one field it is measured by, because the plan schedules two distinct moments.
   Light schedules two the same way. reminders.test.js holds this now. */
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
  { k: "sleepWindow", l: "Sleep window", cat: "sleep" },
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
          {/* the heading wraps the button rather than sitting inside it, which
              a button's content model does not allow; font: inherit keeps the
              h3 from resizing the button, which index.html gives font: inherit */}
          <h3 style={{ margin: 0, font: "inherit" }}>
            {/* padding 0 because the row is already inset by the Card and has to
                stay on the Badge's top line, which is the one box property the
                shared control cannot know about */}
            <Disclosure T={T} kind="heading" label={title}
              open={open} onToggle={() => setOpen(!open)} style={{ padding: 0 }} />
          </h3>
          {open && (
          <p style={{ fontFamily: FONT_TEXT, fontSize: 14.5, lineHeight: 1.55, color: T.muted, margin: "8px 0 0" }}>
            {body}
          </p>
          )}
          {open && items && (
            <div style={{ marginTop: 12 }}>
              {items.map((it) => (
                <div key={it} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "4px 0" }}>
                  <Check size={14} color={DOMAIN[cat].fill[T.key]} weight="bold"
                    style={{ flexShrink: 0, marginTop: 3 }} />
                  <span style={{ fontFamily: FONT_TEXT, fontSize: 14, color: T.ink, lineHeight: 1.4 }}>{it}</span>
                </div>
              ))}
            </div>
          )}
          {open && adjustable !== undefined && (
            <button onClick={() => onAdjust(adjustable)} style={{
              background: "none", border: "none", cursor: "pointer", padding: "11px 0 0",
              fontFamily: FONT_TEXT, fontSize: 13, color: DOMAIN[cat].ink[T.key], fontWeight: 600,
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

      <Eyebrow T={T} as="h2">Tonight's timeline</Eyebrow>
      <TimelinePreview T={T} profile={profile} ph={ph} />
      <p style={{
        fontFamily: FONT_TEXT, fontSize: 13, color: T.faint, margin: "0 4px 22px",
      }}>
        The full timeline lives in the Plan tab and adjusts as you log.
      </p>

      {/* three groups, not seven: sleep and caffeine are one decision, rest and
          movement are one, light and food are one */}
      <Eyebrow T={T} as="h2">Why these choices</Eyebrow>
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

      <Eyebrow T={T} as="h2">Plan details</Eyebrow>
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
  /* the halo is a wash and takes `hue`; the filled disc and the spinner's
     leading arc are drawn and take `fill` */
  const { hue, fill } = DOMAIN.movement;
  if (done) {
    return (
      <div className="gy-pop" style={{
        width: 22, height: 22, borderRadius: 11, flexShrink: 0, background: fill[T.key],
        display: "flex", alignItems: "center", justifyContent: "center",
      }}><Check size={12} color="#FFFFFF" weight="bold" /></div>
    );
  }
  return (
    <div className={active ? "gy-spin" : undefined} style={{
      width: 22, height: 22, borderRadius: 11, flexShrink: 0, boxSizing: "border-box",
      border: `2px solid ${active ? tint(hue, 0.22) : T.hair}`,
      borderTopColor: active ? fill[T.key] : undefined,
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
        /* A step still to come was dimmed to 0.34, which took its label with it
           to 1.58:1 — a whole screen of text under the floor for two seconds.
           The dimming was redundant anyway: StepMark already says which step is
           running with a spinner and which are done with a check, and the label
           already goes from muted to ink as each one lands. */
        <div key={s} style={{
          display: "flex", alignItems: "center", gap: 13, padding: "10px 0",
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

/* The rail: one marker per item on a dotted spine, so what is left of the night
   reads as an ordered list rather than a pile of cards. Two states only, because
   the list only holds two — a solid dot with a halo for the one item the plan is
   waiting on, a hollow ring for everything locked behind it. Answered items are
   not here at all; they are folded into LoggedGroup at the top. */
function Rail({ T, current, last }) {
  return (
    <div style={{
      width: 24, flexShrink: 0, paddingTop: 17,
      display: "flex", flexDirection: "column", alignItems: "center",
    }}>
      {current ? (
        /* ACCENT, not the item's own hue: "you are here" has to read as one
           colour down the whole rail, and the shift domain's grey — the hue of
           the very first item every night — is the app's inactive colour. */
        <div className="gy-pop" style={{
          width: 20, height: 20, borderRadius: 10, background: ACCENT,
          boxShadow: `0 0 0 4px ${tint(ACCENT, 0.18)}`,
        }} />
      ) : (
        <div style={{
          width: 20, height: 20, borderRadius: 10, boxSizing: "border-box",
          border: `2px solid ${T.hair}`,
        }} />
      )}
      {/* Each row is its own flex line, so the spine can only reach the bottom
          of its own card. The negative margin is exactly the next rail's top
          padding, which is the gap it would otherwise leave under every card. */}
      {!last && <div style={{
        flex: 1, width: 0, borderLeft: `2px dotted ${T.hair}`, marginTop: 5, marginBottom: -17,
      }} />}
    </div>
  );
}

const ACT_LABEL = {
  done: { l: "Done", kind: "tinted" },
  skip: { l: "Skip", kind: "quiet" },
  adjust: { l: "Adjust", kind: "quiet" },
  logCaffeine: { l: "Log caffeine", kind: "tinted" },
  logWater: { l: "Log water", kind: "tinted" },
  logNap: { l: "Log rest", kind: "tinted" },
  endShift: { l: "End shift", kind: "tinted" },
  sleepStart: { l: "Going to sleep", kind: "tinted" },
};

/** What each way of answering an item is called once it is on the record. */
const LOGGED_AS = { done: "Done", skipped: "Skipped", adjusted: "Adjusted" };

/* The scheduled time and the domain, under the title, in one line. Shared with
   the expanded body of a logged row so a card and its folded version cannot
   drift apart. */
function ItemMeta({ item, T, d }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6, margin: "6px 0 0",
      fontFamily: FONT_TEXT, fontSize: 12.5, fontWeight: 500, color: T.faint,
    }}>
      <d.Icon size={13} color={d.fill[T.key]} />
      <span>{d.label}</span>
      <span aria-hidden>·</span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(item.at)}</span>
    </div>
  );
}

function TimelineItem({ item, T, onAct, onExpand, current, locked, blocker, last, inDeepNight = false }) {
  const d = DOMAIN[item.category] || DOMAIN.shift;
  const [open, setOpen] = useState(false);

  return (
    <div style={{ display: "flex", gap: 10 }}>
      <Rail T={T} current={current} last={last} />
      {/* Locked was `opacity: 0.72` over the whole card, which composited every
          descendant with it: muted fell to 3.23:1 warm / 3.47:1 dark and faint —
          ItemMeta, the domain label and the scheduled time — to 3.06:1 / 3.05:1.
          A container opacity is invisible to a token-pair contrast table, so it
          silently voided every guarantee the table makes, which is the same bug
          tokens.test.js already bans inside DayChip.

          `tone` instead, and `bg` rather than `sunken`: a locked card stops
          being a raised white surface and lies flush with the page, which is
          what "you cannot answer this yet" should look like. bg was picked over
          sunken because faint on sunken is 4.29:1 in warm — the one pair
          tokens.test.js deliberately leaves out of its table — while ink, muted
          and faint on bg are all already in it. Worst text on a locked card is
          now faint at 4.65:1 warm / 5.29:1 dark. */}
      <Card T={T} tone={locked ? T.bg : undefined} style={{
        flex: 1, minWidth: 0, marginBottom: 10, padding: 15,
        /* the one thing on the Plan screen that says which item the night is
           waiting on, and it was tint(d.hue, 0.5): 1.50:1 to 2.08:1 in warm,
           against a 3:1 floor 1.4.11 names state indicators in by name */
        border: current ? `1.5px solid ${d.fill[T.key]}` : (T.key === "dark" ? `1px solid ${T.hair}` : "none"),
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <h2 style={{
            fontFamily: FONT_TEXT, fontSize: 16, fontWeight: 600, color: T.ink, margin: 0,
          }}>{item.title}</h2>
          {/* the circadian low used to label a whole phase band; with a flat
              list it belongs on the items it actually covers */}
          {inDeepNight && (
            <span style={{
              fontFamily: FONT_TEXT, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
              textTransform: "uppercase", color: DOMAIN.sleep.ink[T.key],
              background: tint(DOMAIN.sleep.hue, 0.14), padding: "3px 8px", borderRadius: 999,
            }}>Circadian low</span>
          )}
        </div>
        {/* the scheduled time moved off the gutter and in here, because the
            gutter is the rail now and the rail carries state, not clock */}
        <ItemMeta item={item} T={T} d={d} />
        <p style={{ fontFamily: FONT_TEXT, fontSize: 14, lineHeight: 1.45, color: T.muted, margin: "7px 0 0" }}>
          {item.msg}
        </p>
        {item.changed && (
          <div style={{
            display: "flex", alignItems: "flex-start", gap: 7, marginTop: 10,
            padding: "9px 11px", borderRadius: 12, background: tint(d.hue, 0.11),
          }}>
            <ArrowCounterClockwise size={13} color={d.fill[T.key]} style={{ flexShrink: 0, marginTop: 2 }} />
            <span style={{ fontFamily: FONT_TEXT, fontSize: 13, lineHeight: 1.4, color: d.ink[T.key], fontWeight: 500 }}>
              {item.changed}
            </span>
          </div>
        )}
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {/* This one shipped without a caret while its three siblings had one,
              so the only expandable control the user meets on every card was
              the only one that did not look expandable. It gets the shared
              caret now, which is most of the point of there being one control. */}
          {item.why && (
            <Disclosure T={T} kind="quiet" label="Why this" lead={<Info size={13} color={T.faint} />}
              open={open} onToggle={() => setOpen(!open)} />
          )}
          {item.recurring && (
            <button onClick={onExpand} style={{
              background: "none", border: "none", padding: "9px 0 0", cursor: "pointer",
              fontFamily: FONT_TEXT, fontSize: 13, color: T.faint, fontWeight: 500,
              display: "flex", alignItems: "center", gap: 5,
            }}>
              <CaretDown size={13} /> Show all {item.recurring.length}
            </button>
          )}
        </div>
        {open && item.why && (
          <p style={{
            fontFamily: FONT_TEXT, fontSize: 13.5, lineHeight: 1.5, color: T.muted,
            margin: "8px 0 0", padding: "11px 13px", borderRadius: 12,
            background: T.key === "warm" ? T.sunken : "rgba(255,255,255,0.04)",
          }}>{item.why}</p>
        )}

        {!locked && (
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            {item.actions.map((act) => (
              <Btn key={act} T={T} kind={ACT_LABEL[act].kind} hue={d.hue}
                onClick={() => onAct(act, item)}
                style={{ fontSize: 13.5, padding: "8px 15px" }}>{ACT_LABEL[act].l}</Btn>
            ))}
          </div>
        )}
        {/* Locked, not hidden: the item still reads, it just cannot be answered
            out of order. The line naming what stands in the way is drawn once,
            on the first locked card, because the answer is the same for every
            card below it and repeating it turns the rest of the night into a
            wall of the same sentence. */}
        {locked && blocker && (
          <div style={{
            display: "flex", alignItems: "center", gap: 7, marginTop: 12,
            fontFamily: FONT_TEXT, fontSize: 13, color: T.faint,
          }}>
            <Lock size={13} />
            <span>Log “{blocker.title}” at {fmt(blocker.at)} first.</span>
          </div>
        )}
      </Card>
    </div>
  );
}

/* One answered item, folded to its title and when it was answered. Opening it
   shows what the item said and puts undo within reach — the two things you come
   back for. Everything else about the card belongs to items still ahead. */
function LoggedRow({ item, log, T, onAct, first }) {
  const [open, setOpen] = useState(false);
  const d = DOMAIN[item.category] || DOMAIN.shift;
  const status = log.value.status;
  return (
    <div style={{ borderTop: first ? "none" : `1px solid ${T.hair}` }}>
      <Disclosure T={T} label={item.title} open={open} onToggle={() => setOpen(!open)}
        lead={status === "done"
          ? <Check size={14} color={d.fill[T.key]} weight="bold" style={{ flexShrink: 0 }} />
          : <div style={{ width: 14, flexShrink: 0, display: "flex", justifyContent: "center" }}>
              <div style={{ width: 9, height: 2, borderRadius: 1, background: T.faint }} />
            </div>}
        trail={<span style={{
          flexShrink: 0, fontFamily: FONT_TEXT, fontSize: 12.5, color: T.faint,
          fontVariantNumeric: "tabular-nums",
        }}>{LOGGED_AS[status] || "Logged"} · {fmt(log.t)}</span>} />
      {open && (
        <div style={{ padding: "0 4px 14px 24px" }}>
          <ItemMeta item={item} T={T} d={d} />
          <p style={{ fontFamily: FONT_TEXT, fontSize: 14, lineHeight: 1.45, color: T.muted, margin: "7px 0 0" }}>
            {item.msg}
          </p>
          {item.why && (
            <p style={{
              fontFamily: FONT_TEXT, fontSize: 13.5, lineHeight: 1.5, color: T.muted,
              margin: "10px 0 0", padding: "11px 13px", borderRadius: 12,
              background: T.key === "warm" ? T.sunken : "rgba(255,255,255,0.04)",
            }}>{item.why}</p>
          )}
          <Btn T={T} kind="quiet" onClick={() => onAct("undo", item)}
            style={{ fontSize: 13, padding: "7px 14px", marginTop: 12 }}>
            <ArrowCounterClockwise size={14} /> Put it back
          </Btn>
        </div>
      )}
    </div>
  );
}

/* The recovery badge with a question mark clipped to its corner: the same round
   tinted disc every domain uses, plus the one mark that says it opens something
   rather than just labelling the row it sits in. */
function WhyBadge({ T, onClick, label }) {
  /* the disc is a wash and the two marks on it are drawn, so they split */
  const { hue, fill } = DOMAIN.recovery;
  return (
    <button onClick={onClick} aria-label={label} className="gy-tap" style={{
      position: "relative", flexShrink: 0, width: 38, height: 38, borderRadius: 19,
      border: "none", padding: 0, cursor: "pointer", background: tint(hue, T.tintA),
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <Heart size={18} color={fill[T.key]} />
      {/* Filled, not tinted: at 17px a low-contrast mark on a low-contrast disc
          reads as a smudge on the badge rather than as a second glyph. */}
      <span style={{
        position: "absolute", right: -3, bottom: -3, width: 17, height: 17, borderRadius: 9,
        background: fill[T.key], border: `2px solid ${T.bg}`, boxSizing: "border-box",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Question size={10} color="#FFFFFF" weight="bold" />
      </span>
    </button>
  );
}

/* Everything already answered, out of the way behind one row, with the reset
   grouping riding on the right of the same strip. Both are view state about the
   list below, so they share one bar rather than each claiming a row.
   The strip renders with nothing logged too: it is where the reset control
   lives, and that control has to exist from the first minute of the night. */
function LoggedGroup({ rows, T, onAct, resets, onToggleResets }) {
  const [open, setOpen] = useState(false);
  return (
    <Card T={T} style={{ marginBottom: 14, padding: "2px 12px" }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        {rows.length ? (
          /* flex 1 rather than the control's own full width: it shares this
             strip with the reset toggle to its right */
          <Disclosure T={T} kind="heading" label="Already logged"
            open={open} onToggle={() => setOpen(!open)} style={{ flex: 1, minWidth: 0 }}
            lead={<ListChecks size={17} color={T.muted} style={{ flexShrink: 0 }} />}
            trail={<span style={{
              fontFamily: FONT_TEXT, fontSize: 13, fontWeight: 600, color: T.muted,
              background: T.sunken, borderRadius: 999, padding: "2px 9px",
            }}>{rows.length}</span>} />
        ) : (
          <div style={{
            flex: 1, minWidth: 0, padding: "12px 4px", display: "flex", alignItems: "center", gap: 10,
            fontFamily: FONT_TEXT, fontSize: 15, color: T.faint,
          }}>
            <ListChecks size={17} color={T.faint} style={{ flexShrink: 0 }} />
            <span>Nothing logged yet</span>
          </div>
        )}
        {onToggleResets && (
          /* aria-label rather than a caption: it is the button's whole name, so
             it has to survive the label being an icon. */
          <button onClick={onToggleResets} aria-pressed={resets === "expanded"}
            aria-label={resets === "expanded" ? "Resets expanded" : "Resets grouped"}
            style={{
              flexShrink: 0, marginLeft: 6, width: 34, height: 34, borderRadius: 17, cursor: "pointer",
              border: `1px solid ${resets === "expanded" ? "transparent" : T.hair}`,
              background: resets === "expanded" ? tint(DOMAIN.movement.hue, T.tintA + 0.06) : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
            <Pulse size={17} color={resets === "expanded" ? DOMAIN.movement.fill[T.key] : T.faint} strokeWidth={2} />
          </button>
        )}
      </div>
      {open && rows.length > 0 && (
        <div style={{ borderTop: `1px solid ${T.hair}`, paddingTop: 2 }}>
          {rows.map((r, k) => (
            <LoggedRow key={r.item.id} item={r.item} log={r.log} T={T} onAct={onAct} first={k === 0} />
          ))}
        </div>
      )}
    </Card>
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

/* The row names the item and how it was answered. It used to read the status as
   a two-way movement flag, so a completed meal filed itself as "Movement reset"
   and everything not done as "Skipped a break". `title` only exists on entries
   written since, hence the category fallback for logs already on disk. */
function metaFor(l) {
  return LOG_TYPES.find((x) => x.v === l.type)
    || (l.type === "item"
      ? {
          l: `${LOGGED_AS[l.value.status] || "Logged"}: ${l.value.title || (DOMAIN[l.value.category] || DOMAIN.shift).label}`,
          cat: l.value.category,
        }
      : { l: l.type, cat: "shift" });
}

/* --------------------------------- plan --------------------------------- */
function PlanTab({
  T, plan, s, ph, profile, showAllPlan, setShowAllPlan, setScreen, onAct,
}) {
  /* The list is what is left. Answered items come out of it entirely and go to
     the group at the top, in the order they were answered rather than the order
     they were scheduled — that is the order you would look for them in. */
  const open = plan.items.filter((i) => s.itemStatus(i.id) === "open");
  const logged = plan.items
    .map((item) => ({ item, log: s.itemLog(item.id) }))
    .filter((r) => r.log)
    .sort((a, b) => a.log.t - b.log.t);

  const moves = open.filter((i) => i.id.startsWith("move-"));
  const others = open.filter((i) => !i.id.startsWith("move-"));
  const collapsed = !showAllPlan && moves.length > 1;
  /* `at` comes with the first still-open reset, so the grouped card carries
     that reset's own actions and walks down the list as the night goes, rather
     than sitting at the first reset's time all night. */
  const display = collapsed
    ? [...others, {
        ...moves[0], recurring: moves,
        msg: `Every ${movementInterval(profile)} minutes · ${moves.length} left, next at ${fmt(moves[0].at)}.`,
      }].sort((a, b) => a.at - b.at)
    : open;

  /* One flat, time-ordered list. The old build grouped items into phase bands,
     which silently dropped anything falling outside every phase window while
     still counting it in "x of y done". A flat list cannot lose an item. */
  const inDeepNight = (at) =>
    !!ph.deepNight && at >= ph.deepNight[0] && at < ph.deepNight[1];

  /* Over plan.items, never over `display`: folding the resets must not change
     which item the plan is waiting on. */
  const gate = planGate(plan.items, s.itemStatus);
  /* off `display`, not `plan.items`: the card that gets the explanation is the
     first locked one the user can actually see */
  const firstLocked = (display.find((i) => gate.locked(i.id)) || {}).id;

  return (
    <div style={{ padding: "4px 20px 0" }}>
      <Eyebrow T={T}>Tonight's plan</Eyebrow>
      {/* The plan's reasoning used to be a full card under the count — badge,
          title, chevron. It is one tap either way, and the count is what you
          open this tab for, so the card collapsed to the badge beside it and one
          caption line. The caption stays because the Plan tab is the only screen
          in the app that says which night of the stretch tonight is, and that is
          the fact the whole adaptive plan turns on. */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <WhyBadge T={T} onClick={() => setScreen("recommendation-revisit")} label="Why this plan" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Display T={T} size={32}>{logged.length} of {plan.items.length} logged.</Display>
          <div style={{ fontFamily: FONT_TEXT, fontSize: 13, color: T.muted, marginTop: 3 }}>
            {planSummary(profile).type} · Night {stretchNight(profile)} of your stretch
          </div>
        </div>
      </div>

      <LoggedGroup rows={logged} T={T} onAct={onAct}
        resets={collapsed ? "grouped" : "expanded"}
        onToggleResets={moves.length > 1 ? () => setShowAllPlan(!showAllPlan) : null} />

      {display.map((it, k) => (
        <TimelineItem key={it.id} item={it} T={T} onAct={onAct}
          onExpand={() => setShowAllPlan(true)}
          current={!!gate.blocker && gate.blocker.id === it.id}
          locked={gate.locked(it.id)}
          blocker={gate.locked(it.id) && it.id === firstLocked ? gate.blocker : null}
          last={k === display.length - 1}
          inDeepNight={inDeepNight(it.at)} />
      ))}

      {!display.length && (
        <p style={{ fontFamily: FONT_TEXT, fontSize: 15, color: T.faint, lineHeight: 1.5 }}>
          Nothing left open. The whole night is in Already logged above.
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
        /* An override, not a quiz answer. The two lines this replaced wrote
           caffeineSensitivity and movement — answers about the user's body and
           their job — from a question about what the plan should change. */
        const r = reflectionAdjust(profile, reflection.adjust);
        if (!r) { say("Saved. The next plan will use this."); return; }
        if (r.key) setProfile({ ...profile, overrides: { ...(profile.overrides || {}), [r.key]: r.value } });
        say(r.msg);
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

      <Eyebrow T={T} as="h2">Add with your own time</Eyebrow>
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

        {/* the clock icon and the colon are the whole label for a sighted user;
            read aloud the three are just three pop-up buttons in a row, and
            picking the wrong one writes a wrong time into what the plan is
            built from. role=group on the row rather than a fieldset: a fieldset
            brings its own box and margins and would knock the picker off the
            line it shares with Save. */}
        <div role="group" aria-label="Time of the new entry" style={{
          display: "flex", alignItems: "center", gap: 7, paddingTop: 14,
          borderTop: `1px solid ${T.hair}`,
        }}>
          <Clock size={16} color={T.faint} />
          <select value={logDraft.h} style={sel} aria-label="Hour"
            onChange={(e) => setLogDraft({ ...logDraft, h: Number(e.target.value) })}>
            {Array.from({ length: 12 }, (_, k) => k + 1).map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
          <span style={{ color: T.faint, fontFamily: FONT_DISPLAY, fontSize: 16 }}>:</span>
          <select value={logDraft.m} style={sel} aria-label="Minute"
            onChange={(e) => setLogDraft({ ...logDraft, m: Number(e.target.value) })}>
            {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
              <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
            ))}
          </select>
          <select value={logDraft.ap} style={sel} aria-label="AM or PM"
            onChange={(e) => setLogDraft({ ...logDraft, ap: e.target.value })}>
            <option value="AM">AM</option><option value="PM">PM</option>
          </select>
          <div style={{ flex: 1 }} />
          <Btn T={T} kind="tinted" hue={DOMAIN[t.cat].hue} onClick={saveManualLog}
            style={{ fontSize: 14, padding: "10px 18px" }}>Save</Btn>
        </div>
      </Card>

      <Eyebrow T={T} as="h2">Today's timeline</Eyebrow>
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
              {/* The fifth hand-rolled one, and the reason the guard in
                  visual-consistency.test.js is a ban rather than a list of
                  four: it did the same job as the logged row on the Plan tab
                  with a different caret, a different gap and a different type
                  size. Still a real button — correcting a time is the only
                  thing this screen can do to an entry, and a div gets no tab
                  stop and no Enter — because that is what Disclosure is.
                  The hairline stays a per-call-site override: it belongs to the
                  list, not to the control, and it survives only because the
                  control writes border:none before spreading this in. */}
              <Disclosure T={T} open={open} onToggle={() => setEditingLog(open ? null : l.id)}
                style={{ borderBottom: open ? "none" : `1px solid ${T.hair}` }}
                lead={<Badge category={meta.cat} T={T} size={30} />}
                label={<>
                  {meta.l}
                  {l.note && (
                    <div style={{ fontFamily: FONT_TEXT, fontSize: 12.5, color: T.faint, marginTop: 1 }}>
                      {l.note}
                    </div>
                  )}
                </>}
                trail={<span style={{
                  fontFamily: FONT_DISPLAY, fontSize: 14, fontWeight: 600, color: T.faint,
                  fontVariantNumeric: "tabular-nums",
                }}>{fmt(l.t)}</span>} />

              {open && (
                <div style={{ paddingTop: 12 }}>
                  <div role="group" aria-label="Time of this entry"
                    style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
                    <Clock size={15} color={T.faint} />
                    <select value={hh} style={sel} aria-label="Hour" onChange={(e) => {
                      const nt = clockToAbs(Number(e.target.value), m % 60, ap);
                      setLogs((L) => L.map((x) => (x.id === l.id ? { ...x, t: nt } : x)));
                    }}>
                      {Array.from({ length: 12 }, (_, k) => k + 1).map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                    <span style={{ color: T.faint, fontFamily: FONT_DISPLAY, fontSize: 16 }}>:</span>
                    <select value={Math.round((m % 60) / 5) * 5 % 60} style={sel} aria-label="Minute" onChange={(e) => {
                      const nt = clockToAbs(hh, Number(e.target.value), ap);
                      setLogs((L) => L.map((x) => (x.id === l.id ? { ...x, t: nt } : x)));
                    }}>
                      {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((mm) => (
                        <option key={mm} value={mm}>{String(mm).padStart(2, "0")}</option>
                      ))}
                    </select>
                    <select value={ap} style={sel} aria-label="AM or PM" onChange={(e) => {
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
                      fontFamily: FONT_TEXT, fontSize: 14.5,
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
          <Eyebrow T={T} as="h2">Today's pattern</Eyebrow>
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
          <Eyebrow T={T} as="h2">What your logs changed</Eyebrow>
          <Card T={T} style={{ padding: "6px 18px", marginBottom: 24 }}>
            {changes.map((c, k) => (
              <div key={c} style={{
                display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 0",
                borderTop: k === 0 ? "none" : `1px solid ${T.hair}`,
              }}>
                <ArrowCounterClockwise size={13} color={DOMAIN.recovery.fill[T.key]} style={{ flexShrink: 0, marginTop: 4 }} />
                <span style={{ fontFamily: FONT_TEXT, fontSize: 14.5, color: T.ink, lineHeight: 1.5 }}>{c}</span>
              </div>
            ))}
          </Card>
        </>
      )}

      <Eyebrow T={T} as="h2">Daily reflection</Eyebrow>
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
        const { hue, fill } = DOMAIN[c.cat];
        return (
          /* A real button, not a Card with an onClick: the row is the only way
             into the player, and as a div it was unreachable by keyboard or
             Switch Control — the whole screen offered six stops, none of them
             here. Card itself stays a div because it is a surface, not a
             control, everywhere else it is used, so its styling is repeated
             here instead. */
          <button key={c.k} onClick={() => setPlaying(c.k)} style={{
            width: "100%", background: T.card, borderRadius: 22, cursor: "pointer",
            boxShadow: T.key === "warm" ? "0 1px 2px rgba(0,0,0,0.04)" : "none",
            marginBottom: 10, padding: 14, display: "flex", alignItems: "center", gap: 13,
            textAlign: "left",
            /* the outline is the whole of "this is the one we suggest", the
               same job the current plan item's border does, so it stopped
               being a 0.45 wash of the hue for the same reason */
            border: on ? `1.5px solid ${fill[T.key]}` : "none",
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 22, flexShrink: 0,
              background: tint(hue, T.tintA),
              display: "flex", alignItems: "center", justifyContent: "center",
            }}><c.Icon size={20} color={fill[T.key]} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: FONT_TEXT, fontSize: 16, fontWeight: 600, color: T.ink,
                display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
              }}>
                {c.l}
                {on && (
                  <span style={{
                    fontFamily: FONT_TEXT, fontSize: 10, fontWeight: 700, letterSpacing: "0.09em",
                    textTransform: "uppercase", color: DOMAIN[c.cat].ink[T.key], background: tint(hue, 0.14),
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
              color: DOMAIN.caffeine.ink[T.key], whiteSpace: "nowrap",
            }}>{c.mins} min</span>
            {/* decorative now that the row itself is the control — a button
                inside a button is invalid, and a second stop here would only
                say the same thing twice */}
            <div aria-hidden style={{
              width: 40, height: 40, borderRadius: 20, flexShrink: 0, background: T.ink,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}><Play size={15} color={T.bg} fill={T.bg} /></div>
          </button>
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
      }}>
        {/* the disc behind it is the wash, the glyph on it is the mark; fillOf
            maps the hue the call site already holds onto the drawable one */}
        <Icon size={16} color={fillOf(hue, T)} />
      </div>
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
  themeOverride, setThemeOverride, setReview, setScreen, exportData, exportText, say,
  startTour,
}) {
  const badges = achievements(profile, logs, history);
  /* two taps, because this erases a profile rather than one log entry */
  const [armed, setArmed] = useState(false);
  const ref = useOverlay(true, () => setProfileOpen(false));
  /* The filter is the validation, not a formality: `overrides` comes off a
     hand-editable blob, ADJUSTABLE[k].l on an unknown key is a white screen
     inside this sheet, and a non-number renders as NaN. */
  const set = Object.entries(profile.overrides || {})
    .filter(([k, v]) => ADJUSTABLE[k] && typeof v === "number");
  /* Same trust boundary as `set`: a profile saved before a reminder row was
     dropped still carries its key, and a key with no row can never be turned
     back on, so the "All on" label would be stuck over an all-on card. */
  const muted = (profile.mutedReminders || []).filter((k) => REMINDERS.some((r) => r.k === k));

  return (
    <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Your profile" style={{
      position: "absolute", inset: 0, background: T.bg, zIndex: 80, overflowY: "auto",
      padding: "44px 20px 40px",
    }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 22 }}>
        <Display T={T} size={30} style={{ flex: 1 }}>You.</Display>
        <button onClick={() => setProfileOpen(false)} aria-label="Close" style={{
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
          {profile.name?.trim()
            ? <span style={{
                fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 700, color: DOMAIN.sleep.ink[T.key],
              }}>{profile.name.trim().charAt(0).toUpperCase()}</span>
            : <User size={24} color={DOMAIN.sleep.fill[T.key]} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <input value={profile.name || ""} placeholder="Add your name"
            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
            style={{
              width: "100%", border: "none", background: "transparent",
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

      <Eyebrow T={T} as="h2">Your setup</Eyebrow>
      <ProfileRow T={T} Icon={Pencil} hue={DOMAIN.sleep.hue} l="Edit profile"
        sub="Walk back through all seven segments"
        onClick={() => { setProfileOpen(false); setReview({ index: 0, single: false, back: "app" }); setScreen("review"); }} />
      <ProfileRow T={T} Icon={FileText} hue={DOMAIN.light.hue} l="Why this plan"
        sub={planSummary(profile).type}
        onClick={() => { setProfileOpen(false); setScreen("recommendation-revisit"); }} />
      <ProfileRow T={T} Icon={Question} hue={DOMAIN.movement.hue} l="Take the tour"
        sub="Six cards over the running app"
        onClick={startTour} />
      <ProfileRow T={T} Icon={Bed} hue={DOMAIN.recovery.hue} l="Sleep schedule"
        sub={`${dur(profile.sleepGoalHours * 60)} from ${fmt(ph.sleepStart)}`}
        onClick={() => { setProfileOpen(false); setReview({ index: 0, single: true, back: "app" }); setScreen("review"); }} />

      {/* The standing receipt for every override, from any of the three writers:
          the adjust sheet, the Dashboard's adjustment card and the reflection.
          It exists because the adjust sheet reaches a key only through a plan
          item that carries it, and several of those items are conditional — so
          an override can be live, changing the plan, and unreachable from every
          screen. Per-key undo stays in the adjust sheet, which offers it with a
          live preview; this is the index and the blanket undo. */}
      {set.length > 0 && (
        <>
          <div style={{ height: 18 }} />
          <Eyebrow T={T} as="h2">Plan adjustments</Eyebrow>
          <Card T={T} style={{ marginBottom: 8, padding: 16 }}>
            {set.map(([k, v], i) => (
              <div key={k} style={{
                display: "flex", alignItems: "baseline", gap: 11, padding: "10px 0",
                borderTop: i === 0 ? "none" : `1px solid ${T.hair}`,
              }}>
                <span style={{
                  flex: 1, fontFamily: FONT_TEXT, fontSize: 14.5, color: T.ink,
                }}>{ADJUSTABLE[k].l}</span>
                <span style={{
                  fontFamily: FONT_DISPLAY, fontSize: 14.5, fontWeight: 600, color: T.ink,
                  fontVariantNumeric: "tabular-nums", flexShrink: 0,
                }}>{ADJUSTABLE[k].decimals ? v.toFixed(1) : Math.round(v)} {ADJUSTABLE[k].unit}</span>
              </div>
            ))}
            <Btn T={T} kind="quiet" full style={{ marginTop: 12 }}
              onClick={() => { setProfile({ ...profile, overrides: {} }); say("Back to the plan's own timing."); }}>
              <ArrowCounterClockwise size={15} /> Put them all back
            </Btn>
          </Card>
        </>
      )}

      <div style={{ height: 18 }} />
      <Eyebrow T={T} as="h2">Achievements</Eyebrow>
      <p style={{ fontFamily: FONT_TEXT, fontSize: 13, color: T.faint, margin: "-4px 0 12px", lineHeight: 1.45 }}>
        Earned once, kept forever. No streaks to break.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginBottom: 20 }}>
        {badges.map((b) => (
          /* Unearned was the whole tile at opacity 0.5, which took its title to
             3.58:1 warm and its description to 2.16:1 — a badge you cannot read
             is a worse reward than one you have not got. Three things already
             say unearned without touching the text: no tint behind it, a
             hairline instead of a coloured border, and a padlock in place of
             the icon that carries its own "Not earned yet" label. */
          <div key={b.key} style={{
            background: b.got ? tint(b.hue, T.tintA) : T.card, borderRadius: 18, padding: 14,
            border: b.got ? `1px solid ${tint(b.hue, 0.28)}` : `1px solid ${T.hair}`,
          }}>
            {b.got
              ? <b.Icon size={19} color={fillOf(b.hue, T)} />
              : <Lock size={19} color={T.faint} aria-hidden={false} role="img" aria-label="Not earned yet" />}
            <div style={{
              fontFamily: FONT_TEXT, fontSize: 14.5, fontWeight: 600, color: T.ink, marginTop: 9,
            }}>{b.l}</div>
            <div style={{
              fontFamily: FONT_TEXT, fontSize: 12.5, color: T.muted, marginTop: 3, lineHeight: 1.35,
            }}>{b.d}</div>
          </div>
        ))}
      </div>

      <Eyebrow T={T} as="h2">Personalize</Eyebrow>
      <Card T={T} style={{ marginBottom: 8, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <Palette size={16} color={DOMAIN.light.fill[T.key]} />
          <h3 style={{ fontFamily: FONT_TEXT, fontSize: 15.5, fontWeight: 600, color: T.ink, margin: 0 }}>Theme</h3>
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
          <Bell size={16} color={DOMAIN.caffeine.fill[T.key]} />
          <h3 style={{ fontFamily: FONT_TEXT, fontSize: 15.5, fontWeight: 600, color: T.ink, margin: 0 }}>Reminders</h3>
          <div style={{ flex: 1 }} />
          <button onClick={() => setProfile({
            ...profile,
            mutedReminders: muted.length ? [] : REMINDERS.map((r) => r.k),
          })} style={{
            background: "none", border: "none", cursor: "pointer", padding: 0,
            fontFamily: FONT_TEXT, fontSize: 13, color: T.faint,
          }}>{muted.length ? "All on" : "All off"}</button>
        </div>
        <p style={{ fontFamily: FONT_TEXT, fontSize: 12.5, color: T.faint, margin: "0 0 12px", lineHeight: 1.4 }}>
          Turning one off keeps it on your plan, it just stops nudging you.
        </p>
        {REMINDERS.map((r, k) => {
          const on = !muted.includes(r.k);
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
                  size: 13, color: on ? DOMAIN[r.cat].fill[T.key] : T.faint,
                })}
              </div>
              <span style={{
                flex: 1, fontFamily: FONT_TEXT, fontSize: 14.5,
                color: on ? T.ink : T.faint,
              }}>{r.l}</span>
              {/* A bare track and knob: on and off were a background colour and
                  18px of travel and nothing else, and the button carried no name
                  either, because the row's label is a sibling span outside it. */}
              <button aria-pressed={on} aria-label={r.l} onClick={() => {
                setProfile({
                  ...profile,
                  mutedReminders: on ? [...muted, r.k] : muted.filter((x) => x !== r.k),
                });
              }} style={{
                width: 44, height: 26, borderRadius: 13, border: "none", cursor: "pointer",
                background: on ? DOMAIN[r.cat].fill[T.key] : T.hair, position: "relative",
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
      <Eyebrow T={T} as="h2">Your data</Eyebrow>
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
      <Eyebrow T={T} as="h2">About GraveYard</Eyebrow>
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
  const close = () => { setSheet(null); setQuickResult(null); };
  const ref = useOverlay(!!sheet, close);
  if (!sheet) return null;

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
        <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="How did the rest go?" onClick={(e) => e.stopPropagation()} style={{
          background: T.bg, width: "100%", borderRadius: "28px 28px 0 0",
          padding: "10px 20px 26px", maxHeight: "76%", overflowY: "auto",
        }}>
          <div style={{ width: 38, height: 5, borderRadius: 3, background: T.hair, margin: "6px auto 18px" }} />
          <Display T={T} size={24} as="h2" style={{ marginBottom: 16 }}>How did the rest go?</Display>
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
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Quick log" onClick={(e) => e.stopPropagation()} style={{
        background: T.bg, width: "100%", borderRadius: "28px 28px 0 0",
        padding: "10px 20px 26px", maxHeight: "80%", overflowY: "auto",
      }}>
        <div style={{ width: 38, height: 5, borderRadius: 3, background: T.hair, margin: "6px auto 18px" }} />

        {!done ? (
          <>
            <Display T={T} size={24} as="h2">Quick log.</Display>
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
                <Display T={T} size={24} as="h2" style={{ marginBottom: 2 }}>Logged.</Display>
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
  logs, now, setProfile, say, setReview, setScreen, onAct,
}) {
  const close = () => { setAdjusting(null); setAdjustDraft({}); };
  const ref = useOverlay(!!adjusting, close);
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

  return (
    <div onClick={close} style={{
      position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 70,
      display: "flex", alignItems: "flex-end",
    }}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Adjust ${item.title}`} onClick={(e) => e.stopPropagation()} style={{
        background: T.bg, width: "100%", borderRadius: "28px 28px 0 0",
        padding: "10px 20px 26px", maxHeight: "84%", overflowY: "auto",
      }}>
        <div style={{ width: 38, height: 5, borderRadius: 3, background: T.hair, margin: "6px auto 18px" }} />

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <Badge category={item.category} T={T} size={40} />
          <div style={{ flex: 1 }}>
            <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 21, fontWeight: 700, color: T.ink,
              letterSpacing: "-0.02em", margin: 0 }}>{item.title}</h2>
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
                    fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 700, color: d.ink[T.key],
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
                style={{ width: "100%", marginTop: 12, accentColor: d.fill[T.key] }} />
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
              onAct("adjusted", item);
              close();
              say("Back to the default timing.");
            }}><ArrowCounterClockwise size={15} /> Reset</Btn>
          )}
          {/* An adjustment counts as answering the item, so it is logged the
              same way Done and Skip are. Only when something actually changed:
              opening the sheet and closing it again is not an answer, and
              treating it as one would let the plan be walked through untouched. */}
          <Btn T={T} style={{ flex: 1.6 }} onClick={() => {
            if (dirty) {
              setProfile({ ...profile, overrides: merged });
              onAct("adjusted", item);
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
    /* forward, not id: a stored night ahead of the computed one means the
       boundary moved backward under an edit, and re-folding the night we are
       standing in would duplicate a record the archive already holds. */
    const stamp = forward(s.night, id);
    return { ...forNight(s, stamp), night: stamp, now };
  } catch (e) { console.warn("gy: discarding saved state", e); return {}; }
})();

/* Demo mode. Read once, beside boot, because it never changes without a reload.
   No import.meta.env.DEV gate: this is a thesis prototype that gets demonstrated
   from a built artifact, and a flag that only works under `vite dev` would not
   work in the room where it is needed. */
const seeded = new URLSearchParams(location.search).has("seed");

/* The counted night is not something the user told the app, so it is not
   something the app keeps. undefined is dropped by JSON.stringify, so this is
   the whole guard — and it is a trust boundary, not tidiness: a stored `stretch`
   comes back through forNight -> archived -> foldNight on boot, the one fold
   that never sees the memo, and would be inherited by any future reader as
   ground truth. Module scope because it closes over nothing. */
const stored = ({ stretch, ...p }) => p;

/* The four destinations of the tab bar. Module scope so the announcement below
   can name a tab without a second copy of its label: that effect is declared
   above the early returns, and a const built after them is still uninitialised
   on every screen that returned early. */
const TABS = [
  { k: "dashboard", l: "Dashboard", Icon: ChartBar },
  { k: "plan", l: "Plan", Icon: ListChecks },
  { k: "log", l: "Reflection", Icon: FileText },
  { k: "live", l: "Care", Icon: Heart },
];

/* What each screen calls itself on arrival. "generating" is missing on purpose:
   its four steps flip every 520ms, which no screen reader can follow, so that
   screen stays silent and the plan landing is what gets announced. */
const WHERE = {
  welcome: "Welcome to graveyard.",
  disclaimer: "Before you start.",
  quiz: "Setting up your plan.",
  recommendation: "Your plan is ready.",
  "recommendation-revisit": "Your plan.",
  review: "Adjusting your plan.",
};

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
  /* null when the tour is not running, otherwise the step it is on. Not
     persisted: the only two ways in are "Start my plan" and the profile row,
     so nothing has to remember that it already ran. */
  const [tourStep, setTourStep] = useState(null);
  /* Where you are standing in tonight's plan, not something you told the app:
     not persisted, and not reset at the roll. The pill names its own mode, so it
     does not need remembering. Decided, not overlooked. */
  const [showAllPlan, setShowAllPlan] = useState(false);
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
  const timeEditRef = useOverlay(!!timeEdit, () => setTimeEdit(null));

  /* Says where you just landed. A second live region, not the toast's near the
     bottom of this file: a destination and a confirmation are different
     messages, and one region carrying both means whichever arrives second wipes
     the other mid-sentence. The node sits in index.html rather than in this
     tree because every screen returns its own Frame — a region that mounts with
     the screen it announces is exactly the case the toast's comment warns
     about, while an effect runs on the early-return screens too. `screen`, not
     `shownScreen`: the announcement should not wait out the 300ms exit. */
  useEffect(() => {
    const t = TABS.find((x) => x.k === tab);
    const where = screen === "app" ? t && t.l : WHERE[screen];
    const region = document.getElementById("gy-where");
    if (region && where) region.textContent = where;
  }, [screen, tab]);

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
    if (profile) nightRef.current = forward(nightRef.current, nightOf(calculateShiftPhases(profile)).id);
  }, [profile && profile.shiftStart, profile && profile.shiftEnd,
      profile && profile.plannedSleep, profile && profile.sleepGoalHours]);

  /* What the archive says tonight is. Derived on every render, never stored:
     `stretch` beats `nightInStretch` in stretchNight, so a stored copy would be
     read back by the one fold that does not go through this memo (forNight on
     boot) and inherited by every future reader as a number nobody counted.
     `now` is in the list for the same reason the history memo has it: the ref is
     not reactive, and a boundary can pass with nothing logged, at which point the
     count must go up by one with nothing else here moving. */
  const planProfile = useMemo(
    () => (profile ? { ...profile, stretch: countStretch(archive, nightRef.current, profile.nightInStretch) } : null),
    [profile, archive, now]
  );

  /* One key, one blob, one write. The stamp comes off the ref rather than the
     clock: between the boundary and the tick that answers it, the logs in hand
     are still last night's and have to be written under last night's name.
     Deriving it here from the clock is what let a single log tapped in that
     window carry a whole night across the boundary. The guard also means
     nothing reaches the device until the quiz is finished. */
  useEffect(() => {
    if (!profile) return;
    save({ night: nightRef.current, profile: stored(profile), logs, reflection, theme: themeOverride, archive });
  }, [profile, logs, reflection, themeOverride, archive]);

  useEffect(() => {
    if (!profile) return;
    const tick = () => {
      /* `seen` rather than `id`: `const id = setInterval(...)` is in scope below
         and the immediate tick() call runs before that initialiser, so a bare
         `id` here is a TDZ ReferenceError on the first call. */
      const { id: seen, now } = nightOf(calculateShiftPhases(profile));
      setNow(now);
      const night = forward(nightRef.current, seen);
      if (night === nightRef.current) return;
      /* the night ended while the app was open: fold it, then start clean */
      /* planProfile, and the dependency list below deliberately does NOT gain
         it: at the instant of the roll nightRef.current is still last night, so
         the captured value holds the count for the night being folded, which is
         the right one. planProfile changes identity every time `now` advances a
         minute, so listing it would tear down and re-register this interval once
         a minute and buy nothing. */
      const next = archived({ night: nightRef.current, profile: planProfile, logs, reflection, archive });
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
    /* A hidden page is the one whose timers the browser stops, so being shown
       again is the only resume the interval cannot answer by itself — and it
       fires before a finger can reach an item. Unguarded on purpose: firing on
       hide too costs one tick that returns at the id comparison above. The
       removal is load-bearing, not tidiness — this effect re-registers on every
       log tap, and a listener left behind folds its own stale logs. */
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [profile, logs, reflection, archive]);

  const plan = useMemo(
    () => (planProfile ? generateTimeline(planProfile, logs, now) : null),
    [planProfile, logs, now]
  );
  const advice = useMemo(
    () => (plan ? generateAdvice(planProfile, logs, now, plan) : null),
    [plan, planProfile, logs, now]
  );

  /* Nights are derived, never stored. The archive supplies the past and carries
     no dayOffset — it is relative to tonight, so a stored one is wrong by
     morning — and tonight is folded from the live logs at the front. Index 0 is
     the newest, which is what every window and the day strip assume.
     `now` is a dependency because the ref is not reactive and a boundary can
     pass with nothing logged: no logs to clear, no archive to grow, nothing
     else in this list moves, and every archived offset would sit a day out
     until the next tap. The tick is the only thing that fires there.
     The seed branches here rather than seeding `archive` state, because state
     would put 45 fictional nights through the write effect and onto the user's
     disk, where they would outlive the flag. */
  const history = useMemo(() => {
    if (!planProfile) return [];
    const anchor = nightRef.current;
    const past = seeded
      ? materializeNights(planProfile)
      : archive.map((r) => ({ ...r, dayOffset: daysBetween(anchor, r.id) }));
    /* planProfile: foldNight writes moveTotal from movementInterval and cutoff
       from caffeineHours, so a record folded at the seed disagrees with the plan
       that produced it. */
    const tonight = foldNight(planProfile, logs, reflection);
    return tonight ? [tonight, ...past] : past;
  }, [planProfile, logs, reflection, archive, now]);

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

  /* The tour drives the tabs rather than illustrating them, so the step and
     the tab move together and there is only one place that decides which. */
  const goTour = (i) => { setTourStep(i); setTab(TOUR[i].tab); };
  const endTour = () => {
    setTourStep(null);
    setTab("plan");
    say("The tour is in your profile whenever you want it again.");
  };

  const finishQuiz = (a) => {
    /* Trimmed here and not on keystroke: the profile sheet edits the same
       field live, where eating a trailing space would stop you typing a name
       with two words in it. */
    const p = { ...a, name: (a.name || "").trim(), chronotype: "neither" };
    setProfile(p);
    setNow(nightOf(calculateShiftPhases(p)).now);
    setScreen("generating");
  };

  const onAct = (act, item) => {
    if (act === "undo") {
      setLogs((L) => L.filter((l) => !(l.type === "item" && l.value.id === item.id)));
      return;
    }
    /* One shape for all three ways of answering an item, so the timestamp, the
       undo and the gate all read the same entry. `title` is carried for the log
       list, which otherwise has only an id to name the row by. */
    const ITEM_STATUS = { done: "done", skip: "skipped", adjusted: "adjusted" };
    if (ITEM_STATUS[act]) {
      push("item", { id: item.id, status: ITEM_STATUS[act], category: item.category, title: item.title });
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
          T={RT} profile={planProfile} revisit={revisit}
          onDone={() => { setScreen("app"); if (!revisit) goTour(0); }}
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
          T={RT} profile={planProfile} onSave={setProfile}
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
    const payload = JSON.stringify({ app: "GraveYard", profile: stored(profile), logs, reflection, archive }, null, 2);
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
    setQuickResult({ kind, id: entry.id, advice: quickAdvice(kind, planProfile, plan, now) });
  };

  /* -------------------------------- chrome -------------------------------- */

  /* There was a gy-hushed class here that stopped the drifting dusk while a
     care session played. It never stopped anything: Arch, and so .gy-sky, is
     onboarding-only and never renders inside this shell. drive-coherence.mjs
     measures what it was there to promise — 165 frames across every step of
     every activity, no keyframe animation running anywhere in the document —
     which is a check the class could not have passed or failed. */
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
        <button onClick={() => setProfileOpen(true)} aria-label="Profile" style={{
          width: 38, height: 38, borderRadius: 19, border: "none", cursor: "pointer",
          background: tint(DOMAIN.sleep.hue, T.tintA),
          display: "flex", alignItems: "center", justifyContent: "center",
        }}><User size={18} color={DOMAIN.sleep.fill[T.key]} /></button>
      </div>

      {/* the only scrolling region */}
      <div style={{ flex: 1, overflowY: "auto", paddingTop: 12, paddingBottom: 28 }}>
        {tab === "dashboard" && (
          <Dashboard T={T} profile={planProfile} nights={history} seeded={seeded}
            rangeKey={rangeKey} setRangeKey={setRangeKey} say={say} setProfile={setProfile}
            plan={plan} status={s.itemStatus} now={now} onOpenPlan={() => setTab("plan")} />
        )}
        {tab === "plan" && (
          <PlanTab
            T={T} plan={plan} s={s} ph={ph} profile={planProfile}
            showAllPlan={showAllPlan} setShowAllPlan={setShowAllPlan}
            setScreen={setScreen} onAct={onAct}
          />
        )}
        {tab === "log" && (
          <LogTab
            T={T} logs={logs} setLogs={setLogs} profile={planProfile} plan={plan} now={now}
            s={s} ph={ph} editingLog={editingLog} setEditingLog={setEditingLog} say={say}
            saveManualLog={saveManualLog} clockToAbs={clockToAbs}
            logDraft={logDraft} setLogDraft={setLogDraft}
            reflection={reflection} setReflection={setReflection} push={push} setProfile={setProfile}
          />
        )}
        {tab === "live" && <LiveTab T={T} profile={planProfile} plan={plan} now={now} setPlaying={setPlaying} />}
      </div>

      {/* mounted up front, always — a live region that appears together with its text isn't reliably announced */}
      <div role="status" aria-live="polite" style={{
        position: "absolute", left: 20, right: 20, bottom: 96, zIndex: 50, pointerEvents: "none",
      }}>
        {toast && (
          <div style={{
            background: T.key === "warm" ? T.hero : T.card, color: T.key === "warm" ? T.heroInk : T.ink,
            borderRadius: 18, padding: "14px 17px", fontFamily: FONT_TEXT, fontSize: 14.5, lineHeight: 1.4,
            border: T.key === "dark" ? `1px solid ${T.hair}` : "none",
            boxShadow: "0 8px 26px rgba(0,0,0,0.18)",
          }}>{toast}</div>
        )}
      </div>

      {/* tab bar, pinned */}
      <div style={{
        flexShrink: 0, height: 78, zIndex: 45,
        background: T.key === "warm" ? "rgba(242,240,234,0.86)" : "rgba(18,18,24,0.86)",
        backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        borderTop: `1px solid ${T.hair}`,
        display: "flex", alignItems: "center", justifyContent: "space-around", padding: "0 8px",
      }}>
        {TABS.slice(0, 2).map((t) => <TabBtn key={t.k} t={t} T={T} tab={tab} setTab={setTab} />)}
        <button onClick={() => setSheet("log")} aria-label="Quick log" style={{
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
        T={T} adjusting={adjusting} setAdjusting={setAdjusting} plan={plan} profile={planProfile}
        adjustDraft={adjustDraft} setAdjustDraft={setAdjustDraft} logs={logs} now={now}
        setProfile={setProfile} say={say} setReview={setReview} setScreen={setScreen}
        onAct={onAct}
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
            <div ref={timeEditRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={timeEdit === "shift" ? "Shift time" : "Sleep time"} onClick={(e) => e.stopPropagation()} style={{
              background: T.bg, width: "100%", borderRadius: "28px 28px 0 0",
              padding: "10px 20px 26px", maxHeight: "86%", overflowY: "auto",
            }}>
              <div style={{ width: 38, height: 5, borderRadius: 3, background: T.hair, margin: "6px auto 18px" }} />
              <Display T={T} size={24} as="h2" style={{ marginBottom: 6 }}>
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
                  <TimeWheel T={T} value={planProfile[f.k]}
                    onChange={(v) => setProfile({ ...planProfile, [f.k]: v })} />
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
                      <Pill key={h} T={T} hue={DOMAIN.sleep.hue} active={planProfile.sleepGoalHours === h}
                        onClick={() => setProfile({ ...planProfile, sleepGoalHours: h })}>
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
      {tourStep !== null && (
        <Tour T={T} step={tourStep} onGo={goTour} onClose={endTour} />
      )}
      {profileOpen && (
        <ProfileSheet
          T={T} profile={planProfile} logs={logs} history={history} ph={ph}
          setProfileOpen={setProfileOpen} setProfile={setProfile} setTimeEdit={setTimeEdit}
          themeOverride={themeOverride} setThemeOverride={setThemeOverride}
          setReview={setReview} setScreen={setScreen} exportData={exportData} exportText={exportText}
          say={say} startTour={() => { setProfileOpen(false); goTour(0); }}
        />
      )}
    </Frame>
  );
}

function TabBtn({ t, T, tab, setTab }) {
  const on = tab === t.k;
  return (
    /* The active tab was spent entirely on ink, stroke weight and font weight,
       so which screen you were on was a thing only a sighted user knew.
       aria-current rather than role="tab": a tablist wants a wrapping
       container, a roving tabindex and arrow keys, and these five swap whole
       screens rather than panels inside one page, so "the current page" is the
       truer word for them anyway. It is not a boolean attribute — the way to
       say no is to leave it off, not to write "false". */
    <button onClick={() => setTab(t.k)} aria-current={on ? "page" : undefined} style={{
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
