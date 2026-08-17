import {
  Moon, Coffee, Drop, Pulse, Sun, ForkKnife, Heart, Clock,
} from "./icons.jsx";

export const FONT_DISPLAY =
  '-apple-system, "SF Pro Display", BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif';
export const FONT_TEXT =
  '-apple-system, "SF Pro Text", BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif';

/* `hue` is the fill: icons, meters, chips and tint() washes, where the 3:1
   non-text floor applies. `ink` is the same colour moved in lightness until it
   clears 4.5:1 as text on the tinted chip it sits on, one value per theme and
   keyed by T.key. A hue is never a text colour; src/tokens.test.js holds that. */
export const DOMAIN = {
  sleep:    { hue: "#5E5CE6", ink: { warm: "#4F4DC2", dark: "#9493EE" }, label: "Sleep",    Icon: Moon },
  caffeine: { hue: "#C2683A", ink: { warm: "#904D2B", dark: "#D49270" }, label: "Caffeine", Icon: Coffee },
  water:    { hue: "#2C9FD4", ink: { warm: "#1D678A", dark: "#57B3DD" }, label: "Water",    Icon: Drop },
  movement: { hue: "#2FA96B", ink: { warm: "#1F6E46", dark: "#35BE78" }, label: "Movement", Icon: Pulse },
  light:    { hue: "#DDA02B", ink: { warm: "#815D19", dark: "#DFA637" }, label: "Light",    Icon: Sun },
  food:     { hue: "#DC6A55", ink: { warm: "#97493A", dark: "#E48E7E" }, label: "Food",     Icon: ForkKnife },
  recovery: { hue: "#9A5FD0", ink: { warm: "#7749A1", dark: "#B88FDE" }, label: "Recovery", Icon: Heart },
  shift:    { hue: "#6E7685", ink: { warm: "#585E6A", dark: "#9AA0AB" }, label: "Shift",    Icon: Clock },
};

/* muted and faint sit at the 4.5:1 floor for body text: muted against `sunken`
   and faint against `bg`, the darkest surface each is actually used on. */
export const WARM = {
  key: "warm",
  bg: "#F2F0EA",
  card: "#FFFFFF",
  sunken: "#EAE7DF",
  ink: "#16150F",
  muted: "#6A655D",
  faint: "#6F6B63",
  hair: "rgba(0,0,0,0.07)",
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
  muted: "#96939E",
  faint: "#8A8790",
  hair: "rgba(255,255,255,0.09)",
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
