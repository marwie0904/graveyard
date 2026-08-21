# Accessibility test plan

Manual verification for the work committed in `45b1390`, which closed the six
open items in `docs/accessibility.md`.

This plan used to open by saying none of it had been checked in a browser or
against a real screen reader. Half of that is no longer true and half of it is
still exactly true, so the two halves are now stated apart.

**Checked in a browser, 20 August 2026.** Two drivers measure what the test
suite structurally cannot. `drive-contrast.mjs` reads contrast off the pixels
Chrome painted: it suppresses the glyphs with `-webkit-text-fill-color`,
screenshots the viewport at 1x, and samples every text run's line boxes out of
the decoded frame, so a gradient, a screen-blended bloom, a translucent scrim
or an inline `rgba()` literal is measured as painted rather than as intended.
`drive-names.mjs` resolves every rendered control through CDP's
`Accessibility.getPartialAXTree`, so the name, role and state it reports are
the ones Chrome computed for assistive technology, not the ones grepped off an
attribute. Both cover the four assessed screens in both themes, and report
separately on the screens outside that scope — ten for the contrast driver,
eleven for the names driver, which also reaches the profile sheet's export
fallback.

**Not checked against a screen reader, and that has not changed.** No assistive
technology has been run against this build — not VoiceOver, not TalkBack, not
Narrator, not a braille display. A name in Chrome's accessibility tree is a
name a screen reader is *able* to read. It is not a name anyone has heard, and
nothing below turns one into the other.

Tick through this once per release. Expected failures are marked; they are open
items, not regressions, and filing them again wastes a pass.

Sections 1, 2, 4 and 6 were run in a desktop browser on 2026-08-18 and passed.
Section 6 is now largely superseded by `drive-contrast.mjs`, which measures
more combinations than a human pass reaches. What is left in this plan is the
parts neither a browser nor a driver reaches: sections 3 and 5 need a real
screen reader to confirm the announcements and labels are *spoken* rather than
merely present in the tree, section 4's visual half needs eyes, and none of it
has been near an actual phone.

---

## What the drivers measured, and what they could not

Dated 20 August 2026, both drivers re-run against the dev server at commit
`cc70324` plus that day's uncommitted work in `src/`. Re-run them rather than
quoting these figures once the source moves.

**Text contrast, 1.4.3 — `drive-contrast.mjs`.** On the four assessed screens,
floor **4.65:1 warm** across 253 text runs and **4.69:1 dark** across 243, with
**zero** runs below their own computed threshold. The ten screens outside the
assessed four also returned zero below threshold, across fifteen
screen-and-theme passes. Thresholds are computed
per element from the rendered style — 4.5:1, or 3:1 where the computed size is
at least 24px, or 18.66px at weight 700 or above — with no blanket exemption
for headings. Where `.gy-sky` is mounted the driver freezes the animation and
steps one shared timeline across 27 frames of a 104s window, keeping the worst
frame per run.

**Name, role and state, 4.1.2 — `drive-names.mjs`.** **402 distinct rendered
controls, 0 with no accessible name**; 0 dropped from the tree as ignored, 0
inside an `aria-hidden` subtree. 82 of the 402 are on the assessed four.
`aria-pressed` is carried into the tree as `pressed` on **123 of 123**
declared, `aria-expanded` as `expanded` on **78 of 78**, with 14 further
controls carrying `expanded` implicitly from the native element. Only 101 of
the 402 names come from an attribute, so a source lint over `aria-label` would
have seen a quarter of them.

**Non-text contrast, 1.4.11 — `drive-contrast.mjs`.** 150 control boundaries,
66 painted elements inside controls and 148 icons measured against the pixels
of the surface each sits on, both themes. **Eleven rows under 3:1 that the
driver scores as material** remain open: nine state-bearing toggles and pills,
and two back-arrow glyphs on the onboarding sky at 2.98:1 and 2.99:1. A further
95 rows under 3:1 are printed with their ratios and explicitly not scored,
because a labelled control's faint edge and a wash behind an icon are not what
the criterion names.

### What the drivers declare they cannot reach

Named here because a measurement that does not state its own edges is worse
than one that is never taken.

- **15 form controls.** A `<select>`'s chosen option and an `<input>`'s value
  or placeholder are drawn by the browser into shadow content with no DOM text
  node, so no `Range` can bound them and the pixel method cannot sample them.
  Chiefly the Reflection selects. Their colours are `T.ink` / `T.faint` on
  `T.card`, which `src/tokens.test.js` asserts from the token table — that is
  arithmetic about intent, not a confirmation on pixels.
- **`aria-current`.** Declared on 11 controls, all of them `page`. CDP's
  accessibility property set has no entry for `current` at all, so the driver
  reads the attribute off the element and cannot confirm it reached the tree.
  That is a limit of the protocol, not a finding about the app, and the driver
  reports it as neither a pass nor a failure.
- **Which signal carries a state.** The contrast driver measures one state of a
  control and does not toggle it. Where a control changes its glyph or its
  label as well as its fill, the eleven material rows above need eyes to say
  which signal is doing the work.
- **Anything spoken.** Sections 3 and 5 below, entirely.

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

- **The quick-log sheet drops focus when its content swaps** from the pick list
  to the result view. The next Tab recovers and Escape still works. Recorded as
  a known ceiling.

### Closed since this plan was written — test these, do not skip them

The first two entries here used to be expected failures. They are not any more,
so a failure now is a regression and should be filed.

- **The care player is reachable by keyboard.** The activity row is a real
  `<button>` (`src/App.jsx:2065`), and `drive-names.mjs` counts 11 named
  controls on the Care screen where there were six. The circular play control
  inside the row is deliberately still not focusable: it is `aria-hidden` and
  decorative, because a button inside a button is invalid. Five stops on that
  screen is the intended result, not ten.
- **Closing the care player should return focus to the row that opened it.**
  The mechanism that made it drop to `body` is gone — the opener is now
  focusable and `useOverlay` restores to it (`src/ui/index.jsx:43`, `:62`). No
  one has pressed the keys to confirm that, which is what this line is for.

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

### Closed since this plan was written — test it, do not skip it

**Empty-night labels in the day strip** printed at roughly 1.08:1. Closed: the
emptiness moved onto the chip's circle and its `aria-label`, so the label now
prints `faint` on `bg` and is asserted at 4.5:1 as a row of its own in
`src/tokens.test.js`. A failure here is now a regression.

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
- **A real screen reader, on anything.** Repeated from the top because it is
  the one limit the drivers do not touch: `drive-names.mjs` confirms what Chrome
  computed, and no assistive technology has consumed it.
- **The five open items** in `docs/accessibility.md` are all closed as of
  20 August 2026, three of them Level A. Testing against them should now pass;
  a failure is a regression. Non-text contrast is what remains open, and it is
  recorded in two places that do not line up: the paper's Table 2 carries the
  reminder toggle's knob at 2.30:1 and an active pill at 1.28:1, both taken by
  hand, while `drive-contrast.mjs` scores eleven material rows of its own and
  reproduces neither of those two figures anywhere in its output. The two
  records have not been reconciled. That is unfinished work, not a
  disagreement anyone has resolved.
