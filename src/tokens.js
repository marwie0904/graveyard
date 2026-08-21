import {
  Moon, Coffee, Drop, Pulse, Sun, ForkKnife, Heart, Clock,
} from "./icons.jsx";

export const FONT_DISPLAY =
  '-apple-system, "SF Pro Display", BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif';
export const FONT_TEXT =
  '-apple-system, "SF Pro Text", BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif';

/* Three values per domain, and each one is answering a different floor.

   `hue` is the wash: the argument to tint(), where the result is a background
   and nothing has to be legible against it.

   `fill` is the mark — the icon inside a Badge, a chart bar or dot, the border
   of the card the plan is currently on. 1.4.11 asks these for 3:1, and the
   surface they land on is not always the card: a Badge icon sits on tint(hue,
   T.tintA), which is the hue's own wash and therefore the worst case. So `fill`
   is the hue walked in lightness (saturation held, so the colour keeps its
   identity) until it clears 3:1 on `card`, `bg`, `sunken` and on that wash over
   each of them. Three of eight warm values and six of eight dark ones came back
   unchanged; the warm theme is the one that had to move, because a pale hue on
   a near-white card is the case with no headroom.

   `ink` is text: the same colour moved until it clears 4.5:1 on the tinted chip
   it sits on. A hue is never a text colour; src/tokens.test.js holds that. */
export const DOMAIN = {
  sleep:    { hue: "#5E5CE6", fill: { warm: "#5E5CE6", dark: "#6866E7" }, ink: { warm: "#4F4DC2", dark: "#9493EE" }, label: "Sleep",    Icon: Moon },
  caffeine: { hue: "#C2683A", fill: { warm: "#BB6438", dark: "#C2683A" }, ink: { warm: "#904D2B", dark: "#D49270" }, label: "Caffeine", Icon: Coffee },
  water:    { hue: "#2C9FD4", fill: { warm: "#2485B2", dark: "#2C9FD4" }, ink: { warm: "#1D678A", dark: "#57B3DD" }, label: "Water",    Icon: Drop },
  movement: { hue: "#2FA96B", fill: { warm: "#278E5A", dark: "#2FA96B" }, ink: { warm: "#1F6E46", dark: "#35BE78" }, label: "Movement", Icon: Pulse },
  light:    { hue: "#DDA02B", fill: { warm: "#A4761B", dark: "#DDA02B" }, ink: { warm: "#815D19", dark: "#DFA637" }, label: "Light",    Icon: Sun },
  food:     { hue: "#DC6A55", fill: { warm: "#D54D34", dark: "#DC6A55" }, ink: { warm: "#97493A", dark: "#E48E7E" }, label: "Food",     Icon: ForkKnife },
  recovery: { hue: "#9A5FD0", fill: { warm: "#9A5FD0", dark: "#9A5FD0" }, ink: { warm: "#7749A1", dark: "#B88FDE" }, label: "Recovery", Icon: Heart },
  shift:    { hue: "#6E7685", fill: { warm: "#6E7685", dark: "#717988" }, ink: { warm: "#585E6A", dark: "#9AA0AB" }, label: "Shift",    Icon: Clock },
};

/* muted and faint sit at the 4.5:1 floor for body text. faint is pinned by
   `bg`, the darkest surface it is used on. muted is pinned by something the
   token table could not see until a browser read the pixels: it also prints on
   a domain tint — the earned-achievement tiles and the Shift/Sleep time rows,
   which wash tint(hue, T.tintA) over `bg`. Measured on rendered pixels that
   pair ran 4.35:1 to 4.44:1 warm, so both values moved one step (warm darker,
   dark lighter) until the worst of the eight hues clears 4.5:1.

   `hair` and `edge` are both one-pixel lines and that is all they share.
   `hair` divides rows and cards, which 1.4.11 exempts as decoration, and it is
   deliberately near-invisible in 43 places. `edge` is the boundary of a
   control — an unselected Pill, Choice, Select or quiet Btn, and the ring on a
   night that logged nothing — which owes 3:1 on every surface it lands on.
   Raising `hair` to cover the second case was rejected: it would repaint every
   divider in the app to satisfy a rule those dividers are outside of. */
export const WARM = {
  key: "warm",
  bg: "#F2F0EA",
  card: "#FFFFFF",
  sunken: "#EAE7DF",
  ink: "#16150F",
  muted: "#67625B",
  faint: "#6F6B63",
  hair: "rgba(0,0,0,0.07)",
  edge: "#847F76",
  hero: "#191813",
  heroInk: "#F7F5F0",
  heroMuted: "rgba(247,245,240,0.62)",
  tintA: 0.12,
};

export const DARK = {
  key: "dark",
  bg: "#121218",
  card: "#1E1E26",
  sunken: "#191921",
  ink: "#EFEDE8",
  muted: "#9A97A1",
  faint: "#8A8790",
  hair: "rgba(255,255,255,0.09)",
  edge: "#767283",
  hero: "#2A2A5A",
  heroInk: "#F3F1FA",
  heroMuted: "rgba(243,241,250,0.62)",
  tintA: 0.2,
};

/* Onboarding accent and hero wash: dusk into sunrise, the arc of a night shift.
   Reuses the sleep and light hues so onboarding reads as the same system. */
export const ACCENT = DOMAIN.sleep.hue;
export const DUSK =
  `linear-gradient(168deg, #24244F 0%, ${DOMAIN.sleep.hue} 52%, ${DOMAIN.light.hue} 128%)`;

export const tint = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

/* Pill and Btn take a bare hue value rather than a domain key, so their label
   colour is looked up by value. Anything that is not a domain hue passes through. */
export const inkOf = (hue, T) =>
  Object.values(DOMAIN).find((d) => d.hue === hue)?.ink[T.key] || hue;

/* The same lookup for the mark. Call sites that draw a hue rather than wash
   with it — Badge's icon, the chart marks, a selected Choice's border — pass
   the hue they already hold and get back the value that clears 3:1. */
export const fillOf = (hue, T) =>
  Object.values(DOMAIN).find((d) => d.hue === hue)?.fill[T.key] || hue;
