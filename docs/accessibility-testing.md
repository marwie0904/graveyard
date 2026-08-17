# Accessibility test plan

Manual verification for the work committed in `45b1390`, which closed the six
open items in `docs/accessibility.md`. None of it was checked in a browser or
against a real screen reader — the automated suite covers the token contrast
table and the focus trap's arithmetic, and nothing else here can be asserted
from a test file.

Tick through this once per release. Expected failures are marked; they are open
items, not regressions, and filing them again wastes a pass.

Sections 1, 2, 4 and 6 were run in a desktop browser on 2026-08-18 and passed,
so the value left in this plan is mostly the parts a browser cannot reach:
section 3 needs a real screen reader to confirm the announcements are *spoken*
rather than merely present in the DOM, section 4's visual half needs eyes, and
none of it has been near an actual phone.

---

## Setup

```
npm run dev
```

Serves on `http://localhost:5174` unless that port is taken, in which case vite
bumps it and prints the real one — read the terminal. Note that `check.mjs` and
the `drive-*.mjs` Playwright drivers hardcode 5174 and will silently drive
whatever else is on it.

**Use Chrome for the keyboard passes.** Safari does not move focus to buttons
with Tab unless keyboard navigation is enabled in System Settings, so a Safari
keyboard pass reports failures that are Safari's defaults, not the app's.

**Use Safari with VoiceOver for the screen-reader passes** (`Cmd+F5` to toggle).
That pairing is the closest desktop proxy for how this behaves on iOS. The
rotor is `Ctrl+Opt+U`.

To return to onboarding at any point, in the console:

```js
localStorage.removeItem("gy.v1")
```

then reload.

---

## 0. Smoke test

The commit changed 160 lines of `src/App.jsx` across three unrelated concerns
and nothing rendered it. Establish the app still works before testing anything
subtle — a failure here is a regression from this work, not an accessibility
gap.

- [ ] Onboarding runs start to finish and a plan generates
- [ ] Plan tab: an item logs, and the count in the title updates
- [ ] Reflection tab: an answer saves, a logged entry opens for edit
- [ ] Care tab: an activity opens and the sequence plays and completes
- [ ] Dashboard: the day strip and the charts render, the range select works
- [ ] No errors in the console during any of the above

---

## 1. Visible focus — 2.4.7

Do this first. Every later keyboard test depends on being able to see where
focus is.

Click the page background, then press Tab repeatedly.

- [ ] Every stop shows a ring: 2px dark outline, 2px white halo outside it
- [ ] On rounded buttons the ring is **pill-shaped**, not a square box
- [ ] Visible on the warm page
- [ ] Visible on the dark page
- [ ] Visible on the dark hero band
- [ ] Visible on the dusk gradient in onboarding
- [ ] The `+` button in the tab bar shows a **complete** ring

That last one is not a spot check. It is the only focusable element in the app
that sets `boxShadow` inline, and the CSS rule uses `!important` to beat it.
Half a ring there means the override failed.

- [ ] Clicking a button with the **mouse** shows no ring

That is `:focus-visible` working as intended — a finger or a mouse must never
light it up.

---

## 2. Overlay focus management — 2.4.3

Six overlays: **care player**, **profile sheet**, **quick-log sheet** (tab-bar
`+`), **nap sheet**, **adjust sheet**, **time editor** (opens from inside the
profile sheet).

Run all five checks against each one.

| | care player | profile | quick-log | nap | adjust | time editor |
|---|---|---|---|---|---|---|
| Focus starts inside | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Tab wraps, never escapes | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Shift+Tab wraps backwards | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Escape closes | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Focus returns to the opener | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

"Never escapes" is the one that matters. Tab past the last control must return
to the first, not land on the screen behind — that screen is visually covered
and functionally unavailable, and a user who lands there gets no signal they
left.

### Nesting

The time editor opens from inside the profile sheet, so two traps are live at
once. This is the case most likely to be wrong.

- [ ] Open profile → open time editor → **Escape closes only the time editor**
- [ ] Focus lands back inside the profile sheet, which is still open
- [ ] A second Escape then closes the profile sheet

Both closing at once means the overlay stack is broken.

### Expected failures — do not file

- **The care player cannot be reached by keyboard at all.** The entire Care
  screen offers six focusable elements — the profile button and the five tab-bar
  buttons. Neither the activity rows nor the circular play controls inside them
  are buttons (open item 1). Open it with a mouse click, then test the trap from
  there.
- **Closing the care player drops focus to `body`**, because the row that opened
  it cannot hold focus. This resolves when item 1 lands; it is not a fault in the
  overlay hook.
- **The quick-log sheet drops focus when its content swaps** from the pick list
  to the result view. The next Tab recovers and Escape still works. Recorded as
  a known ceiling.

---

## 3. Live announcements — 4.1.3

VoiceOver on. The whole test is that these speak **without you moving the VO
cursor to them**.

- [ ] Log water → "Water logged." is spoken unprompted
- [ ] Undo an entry → the undo confirmation speaks
- [ ] Save a reflection answer → the confirmation speaks
- [ ] Export data → the export confirmation speaks
- [ ] Roll over to a new night → the rollover message speaks

### The care sequence

Start a session and listen without touching anything.

- [ ] Step changes announce ("Breathe in" → "Hold")
- [ ] Whole minutes announce ("2 min left")
- [ ] Completion announces
- [ ] The per-second counter does **not** announce

A number spoken every second is a failure — that counter sits outside the live
region deliberately, because a region firing every second cannot be listened to.

- [ ] Each announcement reads only what changed, not the whole block

The opposite failure: if you hear "Breathe in, 2 min left" in full every four
seconds, the region is behaving as atomic and needs the `role="status"` it was
deliberately not given.

---

## 4. Heading structure — 1.3.1

VoiceOver on, `Ctrl+Opt+U`, arrow to **Headings**.

- [ ] Dashboard lists one `h1` and its sections beneath
- [ ] Plan lists one `h1` and the timeline card titles
- [ ] Reflection lists one `h1` and five sections
- [ ] Recommendation lists one `h1`, its sections, and three nested `h3`s
- [ ] Profile sheet lists its own `h1` and sections
- [ ] No screen lists a heading **above** its title
- [ ] No title appears twice

Then the visual regression, which is the real risk — 22 elements became
headings and browsers apply default margins and font sizes to `h1`–`h6`:

- [ ] No spacing has shifted on any screen
- [ ] No text has changed size or weight

---

## 5. Icon labelling — 1.1.1

VoiceOver on. Navigate a timeline row with `Ctrl+Opt+→`.

- [ ] Row text is announced once, with no "image" or "graphic" between items
- [ ] Domain chips announce their label, not their glyph
- [ ] Back button announces "Back"
- [ ] Close buttons announce "Close"
- [ ] The header avatar announces "Profile"
- [ ] The tab-bar `+` announces "Quick log"
- [ ] An unearned achievement announces "Not earned yet"

That last is the one icon in the app deliberately left visible to assistive
technology — earned versus unearned is carried by the padlock and an opacity
change, and by nothing in text.

---

## 6. Contrast — 1.4.3

`src/tokens.test.js` asserts the token table in both themes. It cannot see
combinations nobody thought to add, so this pass is for the rest.

The theme follows shift phase, so force each one with the manual override in
the profile sheet.

- [ ] Warm: the faint intro paragraphs on Reflection and Care read cleanly
- [ ] Warm: the logged-count badge on its sunken ground reads cleanly
- [ ] Warm: domain-coloured text labels read cleanly
- [ ] Dark: all four of the above
- [ ] The "Trends" chip label reads cleanly in **both** themes
- [ ] Domain colours still look right as icons, meters and chip fills

The last one is the regression risk in the other direction: the fix split each
domain colour into a fill and a text value, and only text was meant to move.

### Expected failure — do not file

**Empty-night labels in the day strip** print at roughly 1.08:1. Open item 5,
and the honest fix is a redesign of the strip's empty state rather than a token
change.

---

## 7. Reduced motion regression

Already implemented before this work; confirm it was not broken by it.

System Settings → Accessibility → Display → **Reduce motion**, then reload.

- [ ] The breathing circle does not animate
- [ ] Ambient background motion stops
- [ ] Screen transitions collapse
- [ ] The care sequence still advances and still completes

That last one matters: reduce-motion must stop the animation, not the timer.

---

## What this plan does not cover

- **Real iOS and Android.** Everything here is a desktop proxy. VoiceOver on
  macOS and VoiceOver on iOS differ, and TalkBack differs from both.
- **Switch Control and Full Keyboard Access.** The focus trap follows Tab and
  Shift-Tab only; `aria-modal` is what covers tree-walking assistive tech. That
  ceiling is recorded in `docs/accessibility.md`.
- **The five open items** in `docs/accessibility.md`. Three of them are Level A.
  Testing against them will produce failures; they are known.
