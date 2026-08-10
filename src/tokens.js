import {
  Moon, Coffee, Drop, Pulse, Sun, ForkKnife, Heart, Clock,
} from "./icons.jsx";

export const FONT_DISPLAY =
  '-apple-system, "SF Pro Display", BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif';
export const FONT_TEXT =
  '-apple-system, "SF Pro Text", BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif';

export const DOMAIN = {
  sleep:    { hue: "#5E5CE6", label: "Sleep",    Icon: Moon },
  caffeine: { hue: "#C2683A", label: "Caffeine", Icon: Coffee },
  water:    { hue: "#2C9FD4", label: "Water",    Icon: Drop },
  movement: { hue: "#2FA96B", label: "Movement", Icon: Pulse },
  light:    { hue: "#DDA02B", label: "Light",    Icon: Sun },
  food:     { hue: "#DC6A55", label: "Food",     Icon: ForkKnife },
  recovery: { hue: "#9A5FD0", label: "Recovery", Icon: Heart },
  shift:    { hue: "#6E7685", label: "Shift",    Icon: Clock },
};

export const WARM = {
  key: "warm",
  bg: "#F2F0EA",
  card: "#FFFFFF",
  sunken: "#EAE7DF",
  ink: "#16150F",
  muted: "#78736A",
  faint: "#A9A398",
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
  faint: "#6E6B76",
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
