import { useEffect, useRef } from "react";
import { FONT_DISPLAY, FONT_TEXT, DOMAIN, ACCENT, DUSK, tint, inkOf, fillOf } from "../tokens.js";
import { CaretDown, Check } from "../icons.jsx";
import { RANGES, STRIP_DAYS, dayOffsetOf } from "../stats.js";
import { FOCUSABLE, nextFocusIndex } from "../focus.js";

/* ------------------------------ shared UI bits ---------------------------- */

/* One overlay mechanism for all six of them: focus moves in when the sheet
   opens, Tab is trapped inside it, Escape closes it, and focus returns to
   whatever opened it. aria-modal on the panel is the half that matters on a
   phone — it is what stops VoiceOver and TalkBack swiping out of the sheet
   into the screen it covers, which no Tab trap can do.

   Native <dialog> was the obvious answer and lost on measurement, not taste.
   showModal() promotes the element to the browser's top layer, which is
   viewport-relative; these sheets are position:absolute inside a 430px phone
   frame centred in a letterbox, so the panel would leave the frame,
   ::backdrop would dim the whole window instead of just the phone, and the
   frame's screen-swap animation would stop applying to it. The frame is the
   prototype's whole conceit, so the trap is hand-rolled.

   ponytail: Tab and Shift-Tab only. Switch Control and the VoiceOver rotor
   walk the accessibility tree rather than the tab ring, and aria-modal is
   what covers them here. The upgrade is `inert` on everything the sheet
   covers, which wants one wrapper around the app chrome that does not exist
   yet. */
const openOverlays = [];

export function useOverlay(open, onClose) {
  const ref = useRef(null);
  /* held in a ref so the effect never has to depend on a handler that is a
     new closure every render */
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const el = open ? ref.current : null;
    if (!el) return;
    /* The profile sheet opens the time editor over itself, so two of these
       can be mounted at once. Only the top one listens, or they fight. */
    openOverlays.push(el);
    const returnTo = document.activeElement;
    (el.querySelector(FOCUSABLE) || el).focus();

    const onKey = (e) => {
      if (openOverlays[openOverlays.length - 1] !== el) return;
      if (e.key === "Escape") { e.preventDefault(); close.current(); return; }
      if (e.key !== "Tab") return;
      const f = [...el.querySelectorAll(FOCUSABLE)];
      const to = nextFocusIndex(f.length, f.indexOf(document.activeElement), e.shiftKey);
      e.preventDefault();
      (f[to] || el).focus();
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      openOverlays.splice(openOverlays.indexOf(el), 1);
      /* Safari does not focus a button on click so this is often <body>, and
         "Add details" closes the sheet by unmounting its own opener. */
      if (returnTo && returnTo !== document.body && returnTo.isConnected) returnTo.focus();
    };
  }, [open]);

  return ref;
}

export function Badge({ category, T, size = 40 }) {
  const d = DOMAIN[category] || DOMAIN.shift;
  const I = d.Icon;
  return (
    <div style={{
      width: size, height: size, borderRadius: size / 2, flexShrink: 0,
      background: tint(d.hue, T.tintA),
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      {/* the icon is a mark, not a wash, and it lands on the hue's own tint —
          the worst surface the hue ever gets, and where `light` printed at
          2.09:1 in warm. `fill` is the same colour walked until it clears 3:1
          there; the disc behind it stays the raw hue. */}
      <I size={size * 0.45} color={d.fill[T.key]} strokeWidth={2} />
    </div>
  );
}

export function Card({ T, children, style, onClick, tone }) {
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

export function Eyebrow({ children, T, color, as: Tag = "div" }) {
  return (
    <Tag style={{
      fontFamily: FONT_TEXT, fontSize: 11, fontWeight: 600, letterSpacing: "0.14em",
      textTransform: "uppercase", color: color || T.faint, margin: "0 0 10px",
    }}>{children}</Tag>
  );
}

export function Display({ children, T, size = 34, style, as: Tag = "h1" }) {
  return (
    <Tag style={{
      fontFamily: FONT_DISPLAY, fontSize: size, fontWeight: 700, letterSpacing: "-0.028em",
      lineHeight: 1.08, color: T.ink, margin: 0, ...style,
    }}>{children}</Tag>
  );
}

export function Pill({ children, T, hue, active, onClick }) {
  return (
    <button onClick={onClick} aria-pressed={active} style={{
      fontFamily: FONT_TEXT, fontSize: 14, fontWeight: 500,
      padding: "9px 15px", borderRadius: 999, cursor: "pointer",
      /* unselected, the border is the only thing separating the pill from the
         card behind it, so it is `edge` and not the divider hairline */
      border: `1px solid ${active ? "transparent" : T.edge}`,
      background: active ? tint(hue || DOMAIN.shift.hue, T.tintA + 0.06) : T.card,
      color: active ? (hue ? inkOf(hue, T) : T.ink) : T.muted,
      display: "inline-flex", alignItems: "center", gap: 7, whiteSpace: "nowrap",
    }}>{children}</button>
  );
}

export function Btn({ children, T, kind = "primary", onClick, hue, style, full }) {
  const base = {
    fontFamily: FONT_TEXT, fontSize: 16, fontWeight: 600, borderRadius: 999,
    padding: "16px 22px", border: "none", cursor: "pointer", width: full ? "100%" : undefined,
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
  };
  const kinds = {
    primary: { background: T.ink, color: T.bg },
    accent: { background: ACCENT, color: "#FFFFFF" },
    soft: { background: T.sunken, color: T.ink },
    tinted: { background: tint(hue || DOMAIN.shift.hue, T.tintA + 0.04), color: hue ? inkOf(hue, T) : T.ink },
    // quiet has no fill at all: the border is the whole button
    quiet: { background: "transparent", color: T.muted, border: `1px solid ${T.edge}` },
  };
  return (
    <button onClick={onClick} className="gy-tap" style={{ ...base, ...kinds[kind], ...style }}>
      {children}
    </button>
  );
}

/* Five hand-rolled "open this" buttons across App.jsx, and they had drifted into
   five different controls: two caret glyphs, one of them missing its caret
   entirely, four paddings, four gaps and four type treatments for one gesture.
   The caret is deliberately not a prop — an expandable control with no
   affordance is the inconsistency this replaced, so every one of them gets the
   same one, and it is the same glyph and the same rotation everywhere.

   Three kinds, because the call sites are three roles and no more: the heading
   of a collapsible block, a row in a list of them, and a quiet inline action
   under a paragraph. Anything past that — padding, gap, caret side, a second
   line of label — is the drift, not a requirement. `style` is the one escape
   hatch, and it exists because two call sites need a box property the button
   cannot know about: the logged group shares its strip with the reset toggle
   and the log entry carries the row hairline. */
export function Disclosure({ T, open, onToggle, label, lead, trail, kind = "row", style }) {
  const kinds = {
    heading: { width: "100%", padding: "12px 4px", gap: 10,
      font: { fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.25, color: T.ink } },
    row: { width: "100%", padding: "12px 4px", gap: 10,
      font: { fontFamily: FONT_TEXT, fontSize: 14.5, color: T.ink } },
    quiet: { width: "auto", padding: "9px 0 0", gap: 5,
      font: { fontFamily: FONT_TEXT, fontSize: 13, fontWeight: 500, color: T.faint } },
  }[kind];

  return (
    <button onClick={onToggle} aria-expanded={open} style={{
      width: kinds.width, padding: kinds.padding, gap: kinds.gap,
      background: "none", border: "none", cursor: "pointer", textAlign: "left",
      display: "flex", alignItems: "center", ...style,
    }}>
      {lead}
      <div style={{ flex: 1, minWidth: 0, ...kinds.font }}>{label}</div>
      {trail}
      <CaretDown size={14} color={T.faint} style={{
        flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 180ms ease",
      }} />
    </button>
  );
}

/* Onboarding shell: a colored hero band with the content sheet arcing up into
   it. The arc is one elliptical border-radius rather than an SVG mask, so the
   sheet still scrolls and grows with its content. */
/* The arc's corners sit 42px below its apex, so anything above ~60px of top
   padding crowds the curve. That is the floor for every pad override below. */
export function Arch({ T, children, Icon, nav, center, heroPad = 22, pad = "64px 24px 30px" }) {
  return (
    <div style={{
      flex: "1 0 auto", minHeight: "100%", background: T.bg,
      display: "flex", flexDirection: "column",
    }}>
      {/* The wash extends 46px past its content so the arc cuts into gradient,
          not into a seam. That padding and the sheet's negative margin move
          together. backgroundImage rather than the background shorthand: the
          shorthand would reset the background-size/position the drift animates. */}
      <div className="gy-sky" style={{
        backgroundImage: DUSK, padding: `8px 18px ${heroPad + 46}px`,
        display: "flex", flexDirection: "column", gap: 22,
        "--gy-glow": DOMAIN.sleep.hue, "--gy-warm": DOMAIN.light.hue,
      }}>
        {nav && <div className="gy-hero">{nav}</div>}
        {Icon && (
          <div className="gy-badge" style={{
            alignSelf: "center", width: 84, height: 84, borderRadius: 42,
            background: "rgba(255,255,255,0.16)", border: "1px solid rgba(255,255,255,0.22)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Icon size={38} color="#FFFFFF" />
          </div>
        )}
      </div>
      {/* positioned so it paints over the sky, which is positioned for its
          blooms; without this the 46px overlap sits behind the gradient */}
      <div className="gy-sheet gy-stagger" style={{
        flex: "1 0 auto", background: T.bg, padding: pad, marginTop: -46,
        position: "relative", zIndex: 1,
        borderRadius: "50% 50% 0 0 / 42px 42px 0 0",
        display: "flex", flexDirection: "column",
        justifyContent: center ? "center" : undefined,
      }}>{children}</div>
    </div>
  );
}

/* One answer row. Single and multi select look identical on purpose: the
   trailing dot fills in either way, so nothing has to be learned twice. */
export function Choice({ T, label, sub, on, onClick, hue = ACCENT }) {
  return (
    <button onClick={onClick} aria-pressed={on} className="gy-tap" style={{
      width: "100%", textAlign: "left", cursor: "pointer", borderRadius: 999,
      padding: "13px 14px 13px 20px", display: "flex", alignItems: "center", gap: 12,
      /* the selected border was tint(hue, 0.4) — 1.77:1 warm, 1.54:1 dark —
         which drew the row's own outline below the 3:1 floor in the one state
         it is meant to shout about. The undiluted hue answered that and then
         sat one rule away from every other mark in the app, at 3.27:1 on the
         dark card with nothing holding it there; `fill` is the same colour
         walked per theme, 3.66:1, and it is the value the rest of the drawn
         marks read. The dot below takes it for the same reason. */
      border: `1.5px solid ${on ? fillOf(hue, T) : T.edge}`,
      background: on ? tint(hue, 0.08) : T.card,
      transition: "background 140ms ease, border-color 140ms ease",
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: FONT_TEXT, fontSize: 16, fontWeight: 600, color: T.ink }}>{label}</div>
        {sub && (
          <div style={{ fontFamily: FONT_TEXT, fontSize: 13.5, color: T.muted, marginTop: 3, lineHeight: 1.35 }}>
            {sub}
          </div>
        )}
      </div>
      {/* the class only exists while selected, so adding it is what pops it.
          Off, the dot was filled `sunken` — 1.24:1 on the card — so the half
          of the control that carries the on/off state was invisible until it
          switched on. It is the same unfilled ring the day strip uses. */}
      <div className={on ? "gy-pop" : undefined} style={{
        width: 26, height: 26, borderRadius: 13, flexShrink: 0, boxSizing: "border-box",
        background: on ? fillOf(hue, T) : "transparent",
        border: on ? "none" : `1.5px solid ${T.edge}`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>{on && <Check size={14} color="#FFFFFF" weight="bold" />}</div>
    </button>
  );
}

/* Native select rather than a custom dropdown: accessible by default, and on
   iOS it opens the system wheel picker, which suits one-handed use at 3am. */
export function Select({ T, label, value, onChange, options, placeholder = "Choose one" }) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      {label && (
        <div style={{ fontFamily: FONT_TEXT, fontSize: 14.5, fontWeight: 600, color: T.ink, marginBottom: 6 }}>
          {label}
        </div>
      )}
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        style={{
          width: "100%", appearance: "none", fontFamily: FONT_TEXT, fontSize: 15,
          color: value ? T.ink : T.faint, background: T.card,
          border: `1px solid ${T.edge}`, borderRadius: 14, padding: "12px 14px",
        }}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

/** What the current selection is called, which doubles as the screen's title. */
export function selectionLabel(value) {
  const off = dayOffsetOf(value);
  if (off === null) return (RANGES.find((r) => r.key === value) || RANGES[1]).label;
  if (off === 0) return "Tonight";
  if (off === 1) return "Last night";
  return `${off} nights ago`;
}

/* One night of the strip. The circle is the target, the label above it names
   the night; both are one button so the tap area is the whole column. */
function DayChip({ T, label, on, dim, onClick }) {
  return (
    <button onClick={onClick} aria-pressed={on} aria-label={dim ? `${label}, nothing logged` : label} style={{
      flex: 1, minWidth: 0, padding: "2px 0", background: "none", border: "none",
      cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 7,
    }}>
      {/* An empty night used to print its label in T.hair, about 1.08:1 — dim
          enough to say "nothing here" and too dim to read, and the night is
          still tappable so WCAG's inactive-control exception does not cover it.
          Lowering the label to some middle grey was rejected: anything that
          clears 4.5:1 stops reading as dimmed anyway, so the emptiness moved
          off text contrast entirely and onto the circle below and onto the
          aria-label. */}
      <span style={{
        fontFamily: FONT_TEXT, fontSize: 11, fontWeight: 500,
        color: on ? T.ink : T.faint,
      }}>{label}</span>
      {/* Empty then read 1.08:1 warm / 1.11:1 dark: `hair` is a divider colour
          and the opacity halved it again. Empty is now a dashed `edge` ring —
          the dash is what says "nothing here", so the colour is free to clear
          3:1, which the chip owes as a control that is still tappable. Dimming
          it further with opacity would put it straight back under the floor,
          which is why there is no opacity here any more. */}
      <span style={{
        width: 28, height: 28, borderRadius: 14, boxSizing: "border-box",
        background: on ? T.ink : "transparent",
        border: on ? "none" : `1.5px ${dim ? "dashed" : "solid"} ${dim ? T.edge : T.faint}`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>{on && <Check size={14} color={T.bg} weight="bold" />}</span>
    </button>
  );
}

/* The last seven nights as a strip, with the longer windows behind one select.
   Nights carry an offset and no calendar date — a shift that starts Tuesday
   evening and ends Wednesday morning has no honest weekday — so the strip
   counts back in days the way the charts already do. */
export function RangeControl({ T, value, onChange, have }) {
  const range = RANGES.find((r) => r.key === value);
  const days = Array.from({ length: STRIP_DAYS }, (_, i) => STRIP_DAYS - 1 - i);

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <h1 style={{
          fontFamily: FONT_DISPLAY, fontSize: 21, fontWeight: 700,
          letterSpacing: "-0.03em", color: T.ink, flex: 1, margin: 0,
        }}>{selectionLabel(value)}</h1>
        {/* held at "" so it always reads "Trends": which window is active is
            already spelled out by the title next to it, and a select showing
            "1 week" beside a title saying "1 week" is the same word twice */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <select
            value=""
            onChange={(e) => e.target.value && onChange(e.target.value)}
            aria-label="Longer windows"
            style={{
              appearance: "none", fontFamily: FONT_TEXT, fontSize: 13, fontWeight: 600,
              color: range ? "#FFFFFF" : T.muted,
              /* both the chip's fill and its outline are drawn, not washed, so
                 they take the sleep hue's `fill`: 4.44:1 on bg warm, 4.13:1
                 dark, and the white label on it clears 4.5:1 in both. */
              background: range ? DOMAIN.sleep.fill[T.key] : "transparent",
              border: `1px solid ${range ? DOMAIN.sleep.fill[T.key] : T.edge}`,
              borderRadius: 999, padding: "6px 25px 6px 12px",
            }}
          >
            <option value="">Trends</option>
            {RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
          <CaretDown size={11} color={range ? "#FFFFFF" : T.muted}
            style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 2 }}>
        {days.map((off) => (
          <DayChip key={off} T={T} label={off === 0 ? "Now" : `${off}d`}
            on={value === `d${off}`} dim={have ? !have.has(off) : false}
            onClick={() => onChange(`d${off}`)} />
        ))}
      </div>
    </div>
  );
}
