/* The focus trap's only arithmetic, out here on its own so it can be tested:
   vitest runs node with no DOM, so the hook that uses this is not mountable
   but this is. */

/* Everything natively focusable the sheets actually contain. Disabled
   controls are excluded because the adjust sheet's − and + go disabled at the
   ends of their range, and a trap that parks focus on a dead button is a dead
   end. */
export const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/* Where Tab goes next inside a trapped panel. `i` is the index of what is
   focused now, or -1 for focus sitting on the panel itself or escaped out of
   it entirely. -1 is not a special case: forward it wraps to the first item,
   backward to the last, which is exactly what pulling focus back inside
   wants. */
export function nextFocusIndex(len, i, shift) {
  if (len < 1) return -1;
  if (shift) return i <= 0 ? len - 1 : i - 1;
  return i === -1 || i >= len - 1 ? 0 : i + 1;
}
