import { FONT_DISPLAY, FONT_TEXT, DOMAIN, tint } from "../tokens.js";
import { CaretDown } from "../icons.jsx";
import { RANGES } from "../stats.js";

/* ------------------------------ shared UI bits ---------------------------- */

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

export function Eyebrow({ children, T, color }) {
  return (
    <div style={{
      fontFamily: FONT_TEXT, fontSize: 11, fontWeight: 600, letterSpacing: "0.14em",
      textTransform: "uppercase", color: color || T.faint, marginBottom: 10,
    }}>{children}</div>
  );
}

export function Display({ children, T, size = 34, style }) {
  return (
    <h1 style={{
      fontFamily: FONT_DISPLAY, fontSize: size, fontWeight: 700, letterSpacing: "-0.028em",
      lineHeight: 1.08, color: T.ink, margin: 0, ...style,
    }}>{children}</h1>
  );
}

export function Pill({ children, T, hue, active, onClick }) {
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

export function Btn({ children, T, kind = "primary", onClick, hue, style, full }) {
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

export function RangeControl({ T, value, onChange }) {
  const inline = RANGES.filter((r) => !r.inMore);
  const more = RANGES.filter((r) => r.inMore);
  const activeMore = more.find((r) => r.key === value);

  return (
    <div style={{ display: "flex", gap: 7, alignItems: "center", marginBottom: 18 }}>
      {inline.map((r) => (
        <Pill key={r.key} T={T} hue={DOMAIN.sleep.hue} active={value === r.key}
          onClick={() => onChange(r.key)}>{r.label}</Pill>
      ))}
      <div style={{ position: "relative" }}>
        <select
          value={activeMore ? activeMore.key : ""}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          aria-label="More ranges"
          style={{
            appearance: "none", fontFamily: FONT_TEXT, fontSize: 13.5, fontWeight: 600,
            color: activeMore ? T.bg : T.muted,
            background: activeMore ? DOMAIN.sleep.hue : "transparent",
            border: `1px solid ${activeMore ? DOMAIN.sleep.hue : T.hair}`,
            borderRadius: 999, padding: "7px 26px 7px 13px",
          }}
        >
          <option value="">More</option>
          {more.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
        <CaretDown size={12} color={activeMore ? T.bg : T.muted}
          style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
      </div>
    </div>
  );
}
