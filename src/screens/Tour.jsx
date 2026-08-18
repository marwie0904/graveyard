import { FONT_TEXT } from "../tokens.js";
import { Btn, Card, Display, Eyebrow, useOverlay } from "../ui/index.jsx";

/* ============================================================================
   TOUR

   Six cards over the running app, not six pictures of it. Each step names the
   tab it belongs to, App switches there, and the card sits above the tab bar
   so the screen being described is the one underneath. That is the whole
   reason this is not a static screen: the plan on show is the user's own,
   built from the quiz they just answered.

   Runs once, from "Start my plan", and again from the profile sheet. Nothing
   about it is persisted — the only route into it is that button and that row,
   and neither is reachable by accident, so a "seen" flag would be a stored
   fact with no reader.
============================================================================ */

export const TOUR = [
  {
    tab: "dashboard",
    title: "This is what your nights add up to.",
    body: "The Dashboard counts everything from what you log, and nothing here is graded. A night you did not log draws no meter at all rather than a zero. Tonight is the rightmost chip of the day strip.",
  },
  {
    tab: "plan",
    title: "The plan is a list you answer.",
    body: "Every item on the Plan tab carries a time and three answers: Done, Skip, or Adjust. Done and Skip go on the record as they happened. Adjust changes the plan itself, so the next night is built differently rather than logged differently.",
  },
  {
    tab: "plan",
    title: "One item at a time, in order.",
    body: "The plan waits on the item it is standing on, and everything after it stays locked until that one is answered — done, skipped and adjusted all clear it. Answered items leave the list and fold into Already logged at the top, in the order you answered them.",
  },
  {
    tab: "plan",
    title: "Anything the plan never asked for.",
    body: "The plus button in the middle of the tab bar logs what just happened — coffee, water, a nap, feeling sleepy — stamped at the current time. It does not have to be a plan item to count: the plan reads your logs and moves around them, so a coffee at 4 AM changes what it suggests next.",
  },
  {
    tab: "log",
    title: "Fix the record, then look back on it.",
    body: "The Reflection tab is where a log gets its real time, a detail, or a correction — and where you add something with your own clock instead of now. At the end of the night, seven questions there shape the plan for the next one.",
  },
  {
    tab: "live",
    title: "Two minutes, guided.",
    body: "Care holds the breathing and movement resets, and suggests one based on the phase you are in and what you last logged. Finishing a movement reset here counts toward tonight's plan, so you never log it twice.",
  },
];

export default function Tour({ T, step, onGo, onClose }) {
  const ref = useOverlay(true, onClose);
  const s = TOUR[step];
  const last = step === TOUR.length - 1;

  return (
    <div onClick={onClose} style={{
      position: "absolute", inset: 0, background: "rgba(0,0,0,0.22)", zIndex: 55,
      display: "flex", alignItems: "flex-end",
    }}>
      {/* above the 78px tab bar, not over it: the plus button and the four tabs
          are half of what is being pointed at */}
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="App tour"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", padding: "0 12px 88px" }}>
        <Card T={T} style={{ padding: 18, boxShadow: "0 10px 30px rgba(0,0,0,0.22)" }}>
          <Eyebrow T={T}>Tour · {step + 1} of {TOUR.length}</Eyebrow>
          <Display T={T} size={23} as="h2">{s.title}</Display>
          <p style={{
            fontFamily: FONT_TEXT, fontSize: 14.5, lineHeight: 1.5, color: T.muted,
            margin: "9px 0 16px",
          }}>{s.body}</p>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn T={T} kind="quiet" style={{ fontSize: 14.5, padding: "13px 18px" }}
              onClick={() => (step ? onGo(step - 1) : onClose())}>
              {step ? "Back" : "Skip"}
            </Btn>
            <Btn T={T} kind="accent" style={{ flex: 1, fontSize: 14.5, padding: "13px 18px" }}
              onClick={() => (last ? onClose() : onGo(step + 1))}>
              {last ? "Start my night" : "Next"}
            </Btn>
          </div>
        </Card>
      </div>
    </div>
  );
}
