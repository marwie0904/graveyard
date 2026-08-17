import { useEffect, useRef } from "react";
import { FONT_DISPLAY, FONT_TEXT, DOMAIN, ACCENT, DUSK, tint, inkOf } from "../tokens.js";
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
      <I size={size * 0.45} color={d.hue} strokeWidth={2} />
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
    <button onClick={onClick} style={{
      fontFamily: FONT_TEXT, fontSize: 14, fontWeight: 500,
      padding: "9px 15px", borderRadius: 999, cursor: "pointer",
      border: `1px solid ${active ? "transparent" : T.hair}`,
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
    quiet: { background: "transparent", color: T.muted, border: `1px solid ${T.hair}` },
  };
  return (
    <button onClick={onClick} className="gy-tap" style={{ ...base, ...kinds[kind], ...style }}>
      {children}
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
      border: `1.5px solid ${on ? tint(hue, 0.4) : T.hair}`,
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
      {/* the class only exists while selected, so adding it is what pops it */}
      <div className={on ? "gy-pop" : undefined} style={{
        width: 26, height: 26, borderRadius: 13, flexShrink: 0, background: on ? hue : T.sunken,
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
          border: `1px solid ${T.hair}`, borderRadius: 14, padding: "12px 14px",
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
    <button onClick={onClick} aria-pressed={on} aria-label={label} style={{
      flex: 1, minWidth: 0, padding: "2px 0", background: "none", border: "none",
      cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 7,
    }}>
      <span style={{
        fontFamily: FONT_TEXT, fontSize: 11, fontWeight: 500,
        color: on ? T.ink : dim ? T.hair : T.faint,
      }}>{label}</span>
      <span style={{
        width: 28, height: 28, borderRadius: 14, boxSizing: "border-box",
        background: on ? T.ink : "transparent",
        border: on ? "none" : `1.5px solid ${dim ? T.hair : T.faint}`,
        opacity: dim && !on ? 0.5 : 1,
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
              background: range ? DOMAIN.sleep.hue : "transparent",
              border: `1px solid ${range ? DOMAIN.sleep.hue : T.hair}`,
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
