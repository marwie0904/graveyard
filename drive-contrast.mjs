/* WCAG 2.1 1.4.3 (text contrast) and 1.4.11 (non-text contrast), measured on
   the pixels Chrome actually painted.

   WHY THIS EXISTS. src/tokens.test.js computes contrast from the token table:
   it pairs a foreground token with the background token a human said it prints
   on. That is arithmetic about intent. It cannot see a gradient, a
   mix-blend-mode bloom, a translucent scrim, an inherited opacity, or an
   rgba() literal written inline instead of taken from the table — and every
   one of those exists in this build. getComputedStyle() cannot see them
   either: it reports rgba(0,0,0,0) for any element that does not paint its own
   background, which is nearly all of them, and a naive driver would silently
   score that as white-on-white or pass it by.

   SO THE BACKDROP IS READ FROM THE FRAME, NOT FROM THE CASCADE:

     1. A stylesheet sets -webkit-text-fill-color: transparent on everything.
        That erases the glyphs and nothing else — it is not `color`, so
        currentColor-derived borders, marks and icons still paint, and layout
        does not move by a pixel.
     2. The viewport is screenshotted at deviceScaleFactor 1, so one image
        pixel is one CSS pixel, and decoded to RGBA in the page.
     3. Every rendered text node's line boxes come from Range.getClientRects(),
        which is tight to the glyph run rather than to the element's padding
        box. A grid of points across the middle 60% of each line box is read
        out of the frame. That is the composite: gradient, blooms, scrim,
        backdrop-filter, everything, exactly as painted.
     4. The foreground is getComputedStyle().color — or `fill` for SVG text,
        which is what Recharts paints the Dashboard's axis and legend labels
        with — composited at its own alpha times the product of every
        ancestor's opacity, over each sampled backdrop pixel.
     5. The reported ratio for a text run is its WORST sampled point. A
        gradient that clears the floor at one end and fails at the other is a
        failure, not an average.

   THRESHOLD. 4.5:1, or 3:1 where WCAG's large-text rule actually applies:
   computed font-size >= 24px, or >= 18.66px at font-weight >= 700. Computed,
   per element, from the rendered style — no blanket exemption for headings.

   ANIMATION. .gy-sky is a 26s alternating drift of the DUSK gradient with two
   screen-blended blooms on 19s and 24s clocks. One sample is one frame of
   that, not a measurement of it. On any screen where .gy-sky is mounted the
   driver PAUSES every running animation and steps a single shared timeline
   across 0..104s in 4s increments (27 frames) — 104s is two full alternating
   cycles of the drift and covers both blooms' cycles — screenshotting each
   frame and keeping the worst ratio per text run. On every other screen the
   same freeze runs once with t=0, which lands every finite entrance on its end
   state, so no frame is ever read while a screen is still fading in.

   NON-TEXT (1.4.11), reported separately and second, and only for the two
   things the criterion actually names. A control's BOUNDARY: the better of its
   own fill and its own painted border against the pixels immediately outside
   it, better rather than worse because an outlined button whose fill matches
   the card is still bounded. And the PAINT INSIDE a control against the
   control's own fill: the toggle knob on its track, the dot in a selected
   choice. Cards, sheets and washes are not measured at all rather than
   measured and excused. A row is called a failure only when the control
   carries no visible text (so the boundary is the only thing saying it is
   there) or the control declares a state through aria-pressed, -checked,
   -selected or -current (so the paint that changes is the whole of the state
   signal — a label says what a control is, never whether it is on). Every
   other row under 3:1 is printed with its ratio and explicitly not scored.

   SCOPE. The four screens the paper assesses (Dashboard, Plan, Reflection,
   Care) in both themes, each scrolled end to end, with the Dashboard measured
   twice — on tonight, and again through its own Trends select on All time,
   because its charts, meters and figures do not paint at all until a longer
   window is picked. Then, reported separately
   and labelled as OUTSIDE the assessed four, the screens that exist but the
   paper does not assess: welcome, the disclaimer, the quiz (which is where
   .gy-sky lives), the plan recommendation, the guided tour, the profile sheet,
   the time-edit sheet, the plan-adjust sheet, the quick-log sheet and the care
   player. Anything not reached is named at the end rather than dropped.

   Run against a dev server:  node drive-contrast.mjs [url]
   Exit code is the number of distinct failing text runs, capped at 250. */

import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";

/* ?seed is the app's own demo flag. Without it a freshly onboarded profile has
   no archived nights, the Dashboard is one empty state, and the charts, meters
   and day strip the paper's contrast claim covers never paint at all. */
const ARG = process.argv[2] ?? "http://127.0.0.1:5174/";
const TARGET = ARG.includes("seed") ? ARG : ARG + (ARG.includes("?") ? "&" : "?") + "seed";
const VIEW = { width: 430, height: 932 };
const SKY_FRAMES = 27;
const SKY_SPAN = 104000;

/* ------------------------------------------------------------------ probe */
/* Runs in the page with one decoded frame. Returns every text run it could
   read and every own-fill element it could pair with a surface. */
const PROBE = async (b64) => {
  /* The frame is already captured, so the suppression stylesheet can come off
     while styles are read. It has to: SVG text is painted by `fill` and the
     sheet forces that fill to transparent, so reading the foreground with the
     sheet live would report every Recharts axis label as invisible. */
  const sheet = document.getElementById("gy-probe-hide");
  if (sheet) sheet.disabled = true;
  const img = await createImageBitmap(await (await fetch(b64)).blob());
  const cv = new OffscreenCanvas(img.width, img.height);
  const cx = cv.getContext("2d", { willReadFrequently: true });
  cx.drawImage(img, 0, 0);
  const D = cx.getImageData(0, 0, img.width, img.height).data;
  const W = img.width, H = img.height;
  const k = W / window.innerWidth;          // 1 at deviceScaleFactor 1

  /* The final scanline of a Chrome viewport screenshot comes back pure white
     whatever is on the page — verified against a dark screen where every other
     row is rgb(18,18,24). It is an artifact of the capture, not a pixel the
     app painted, so it is not readable and reads as out of bounds. Nothing
     else is masked: the last column and the first row are real. */
  const px = (x, y) => {
    x = Math.round(x * k); y = Math.round(y * k);
    if (x < 0 || y < 0 || x >= W || y >= H - 1) return null;
    const i = (y * W + x) * 4;
    return [D[i], D[i + 1], D[i + 2]];
  };
  const lum = ([r, g, b]) => {
    const f = (v) => (v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((m, n) => n - m);
    return (hi + 0.05) / (lo + 0.05);
  };
  const parse = (c) => {
    const m = String(c).match(/[\d.]+/g);
    return m ? [+m[0], +m[1], +m[2], m[3] === undefined ? 1 : +m[3]] : null;
  };
  const over = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3]));
  const painted = (cs) => cs.backgroundImage !== "none" || (parse(cs.backgroundColor)?.[3] ?? 0) > 0.03;
  const SVG = "http://www.w3.org/2000/svg";
  /* the product of every opacity above this node: text at 0.6 inside a card at
     0.8 is painted at 0.48 and the frame agrees, so the foreground has to */
  const stack = (el) => {
    let a = 1;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const o = parseFloat(getComputedStyle(n).opacity);
      if (!Number.isNaN(o)) a *= o;
    }
    return a;
  };

  /* short, stable, and enough to find the element again by hand */
  const sel = (el) => {
    const parts = [];
    for (let n = el; n && n.nodeType === 1 && parts.length < 6; n = n.parentElement) {
      if (n.id) { parts.unshift("#" + n.id); break; }
      let s = n.tagName.toLowerCase();
      const cls = (n.getAttribute("class") || "").trim().split(/\s+/).filter(Boolean)[0];
      if (cls) s += "." + cls;
      const sibs = n.parentElement ? [...n.parentElement.children].filter((c) => c.tagName === n.tagName) : [];
      if (sibs.length > 1) s += `:nth-of-type(${sibs.indexOf(n) + 1})`;
      parts.unshift(s);
    }
    return parts.join(">");
  };

  const inView = (r) => r.width > 0 && r.height > 0 &&
    r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth;

  /* ---- 1.4.3 --------------------------------------------------------- */
  const text = [];
  const skipped = { invisible: new Set(), occluded: new Set(), transparent: new Set() };
const shadowText = new Set();

  for (const el of document.querySelectorAll("*")) {
    const nodes = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
    if (!nodes.length) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility !== "visible" || cs.display === "none") { skipped.invisible.add(sel(el)); continue; }

    const alpha = stack(el);
    if (alpha < 0.005) { skipped.invisible.add(sel(el)); continue; }

    /* SVG text is painted by `fill`; `color` on it is whatever was inherited
       and has nothing to do with what is on screen. Recharts labels are the
       whole Dashboard, so getting this wrong would silently exempt the charts. */
    const fg = parse(el.namespaceURI === SVG ? cs.fill : cs.color);
    if (!fg) continue;
    fg[3] *= alpha;
    if (fg[3] < 0.02) { skipped.transparent.add(sel(el)); continue; }

    const fs = parseFloat(cs.fontSize);
    const fw = parseInt(cs.fontWeight, 10) || 400;
    const large = fs >= 24 || (fs >= 18.66 && fw >= 700);
    const need = large ? 3 : 4.5;

    for (const node of nodes) {
      const rg = document.createRange();
      rg.selectNodeContents(node);
      for (const r of rg.getClientRects()) {
        if (!inView(r) || r.width < 1 || r.height < 3) { skipped.invisible.add(sel(el)); continue; }
        /* Occlusion is checked at three points along the run, not one: a run
           that straddles the edge of an open sheet would otherwise be sampled
           against the sheet's own fill and reported as a failure that no eye
           can see. Any straddle drops the whole run and is counted. */
        const my = Math.min(window.innerHeight - 1, Math.max(0, r.top + r.height / 2));
        const probes = [r.left + 1, r.left + r.width / 2, r.right - 1]
          .map((x) => Math.min(window.innerWidth - 1, Math.max(0, x)));
        if (probes.some((x) => {
          const hit = document.elementFromPoint(x, my);
          return !hit || !(el.contains(hit) || hit.contains(el));
        })) { skipped.occluded.add(sel(el)); continue; }

        const nx = Math.min(11, Math.max(2, Math.round(r.width / 5)));
        const ny = 5;
        let worst = Infinity, best = 0, worstBg = null, at = null;
        for (let i = 0; i < nx; i++) {
          for (let j = 0; j < ny; j++) {
            const x = r.left + (r.width * (i + 0.5)) / nx;
            const y = r.top + r.height * 0.2 + (r.height * 0.6 * (j + 0.5)) / ny;
            const bg = px(x, y);
            if (!bg) continue;
            const v = ratio(over(fg, bg), bg);
            if (v < worst) { worst = v; worstBg = bg; at = [Math.round(x), Math.round(y)]; }
            if (v > best) best = v;
          }
        }
        if (!Number.isFinite(worst)) { skipped.invisible.add(sel(el)); continue; }
        text.push({
          sel: sel(el),
          text: node.textContent.replace(/\s+/g, " ").trim().slice(0, 48),
          color: el.namespaceURI === SVG ? cs.fill : cs.color,
          alpha: +alpha.toFixed(3), fs, fw, large, need,
          min: +worst.toFixed(2), max: +best.toFixed(2), at,
          box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
          bg: worstBg && `rgb(${worstBg.join(",")})`,
        });
      }
    }
  }

  /* ---- 1.4.11 -------------------------------------------------------- */
  /* Two questions, and only two, because they are the two the criterion asks:

       BOUNDARY  - can you tell the control is there? Measured as the better of
                   its own fill and its own painted border against the surface
                   immediately outside it. Better, not worse: a control whose
                   fill matches the card but whose border does not is still
                   bounded, and scoring it on the fill alone would fail every
                   outlined button in the app for no reason a user could see.
       MARK      - can you tell which state it is in? Any element whose nearest
                   painted ancestor is the control itself: the toggle knob on
                   its track, the dot in a selected choice, the fill of a chip.

     Everything else that paints — cards, washes, sheets — is out of scope for
     1.4.11 and is not measured here, rather than measured and excused. */
  const CTRL = 'button,a[href],input,select,textarea,summary,[role="button"],[role="link"],'
    + '[role="checkbox"],[role="radio"],[role="switch"],[role="tab"],[role="slider"],'
    + '[role="combobox"],[role="menuitem"],[role="option"],[tabindex]:not([tabindex="-1"])';
  const marks = [];
  for (const el of document.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    if (cs.visibility !== "visible" || cs.display === "none") continue;
    if (stack(el) < 0.99) continue;      // mid-fade; the frame is not its steady state
    const r = el.getBoundingClientRect();
    if (!inView(r) || r.width < 4 || r.height < 4) continue;
    if (r.width > window.innerWidth - 4 && r.height > window.innerHeight - 4) continue;

    let surf = null;
    for (let n = el.parentElement; n; n = n.parentElement) {
      if (painted(getComputedStyle(n))) { surf = n; break; }
    }
    if (!surf) continue;

    const isCtl = el.matches(CTRL);
    const isMark = surf.matches(CTRL);
    if (!isCtl && !isMark) continue;
    const bw = ["Top", "Right", "Bottom", "Left"].map((s) => parseFloat(cs[`border${s}Width`]) || 0);
    const bordered = bw.some((w) => w >= 1) && (parse(cs.borderTopColor)?.[3] ?? 0) > 0.05;
    /* Nothing drawn, nothing to measure: a layout wrapper inside a button is
       not a mark, and a button with neither fill nor border is identified by
       its label rather than by a boundary. */
    if (!painted(cs) && !bordered) continue;

    const sr = surf.getBoundingClientRect();
    const cxm = r.left + r.width / 2, cym = r.top + r.height / 2;
    /* per side: a point on the surface just outside, the painted border pixel,
       and a point clear of the border inside */
    const sides = [
      /* the -0.5 is the pixel centre: a 1px top border occupies the row from
         r.top to r.top+1, whose centre is r.top, and sampling r.top+0.5 rounds
         into the fill and reads the border as invisible */
      { out: [cxm, r.top - 4], edge: [cxm, r.top + bw[0] / 2 - 0.5], in: [cxm, r.top + bw[0] + 3], w: bw[0] },
      { out: [r.right + 4, cym], edge: [r.right - bw[1] / 2 - 0.5, cym], in: [r.right - bw[1] - 3, cym], w: bw[1] },
      { out: [cxm, r.bottom + 4], edge: [cxm, r.bottom - bw[2] / 2 - 0.5], in: [cxm, r.bottom - bw[2] - 3], w: bw[2] },
      { out: [r.left - 4, cym], edge: [r.left + bw[3] / 2 - 0.5, cym], in: [r.left + bw[3] + 3, cym], w: bw[3] },
    ];
    const usable = ([x, y]) => {
      if (x < sr.left || x > sr.right || y < sr.top || y > sr.bottom) return false;
      if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) return false;
      const hit = document.elementFromPoint(x, y);
      if (!hit || el.contains(hit)) return false;
      return hit === surf || (surf.contains(hit) && !painted(getComputedStyle(hit)));
    };

    let best = null;
    for (const s of sides) {
      if (!usable(s.out)) continue;
      const base = px(...s.out);
      if (!base) continue;
      for (const [what, pt] of [["fill", s.in], ["border", s.edge]]) {
        if (what === "border" && s.w < 1) continue;
        const ink = px(...pt);
        if (!ink) continue;
        const v = ratio(ink, base);
        if (!best || v > best.r) {
          best = { r: v, what, ink: `rgb(${ink.join(",")})`, base: `rgb(${base.join(",")})` };
        }
      }
    }
    if (!best) continue;

    const ctl = isMark ? surf : el;
    const state = ["aria-pressed", "aria-checked", "aria-selected", "aria-current"]
      .filter((a) => ctl.hasAttribute(a));
    marks.push({
      icon: !!ctl.querySelector("svg,img"),
      kind: isMark ? "paint inside a control" : "control boundary",
      sel: sel(el), on: sel(surf), via: best.what, state,
      ink: best.ink, base: best.base, r: +best.r.toFixed(2),
      ctl: ctl.tagName.toLowerCase() + (ctl.getAttribute("aria-label") ? `[${ctl.getAttribute("aria-label")}]` : ""),
      ctlText: (ctl.innerText || "").replace(/\s+/g, " ").trim().slice(0, 34),
    });
  }

  /* An icon-only button is identified by its icon, not by the disc behind it.
     Measuring only the disc would report every one of them as an unbounded
     control, which is the opposite of what a user sees, so the glyph itself is
     read: the best-contrasting pixel inside the graphic's box against the
     control's own fill just outside it. */
  for (const g of document.querySelectorAll("svg,img")) {
    const ctl = g.closest(CTRL);
    if (!ctl) continue;
    const cs = getComputedStyle(g);
    if (cs.visibility !== "visible" || cs.display === "none" || stack(g) < 0.99) continue;
    const r = g.getBoundingClientRect();
    const cr = ctl.getBoundingClientRect();
    if (!inView(r) || r.width < 4 || r.height < 4) continue;

    let base = null;
    for (const [x, y] of [[r.left - 3, r.top + r.height / 2], [r.right + 3, r.top + r.height / 2],
      [r.left + r.width / 2, r.top - 3], [r.left + r.width / 2, r.bottom + 3]]) {
      if (x < cr.left || x > cr.right || y < cr.top || y > cr.bottom) continue;
      if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) continue;
      const hit = document.elementFromPoint(x, y);
      if (!hit || g.contains(hit) || !ctl.contains(hit)) continue;
      base = px(x, y);
      if (base) break;
    }
    if (!base) continue;

    let ink = null, bestR = 0;
    for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) {
      const q = px(r.left + (r.width * (i + 0.5)) / 9, r.top + (r.height * (j + 0.5)) / 9);
      if (!q) continue;
      const v = ratio(q, base);
      if (v > bestR) { bestR = v; ink = q; }
    }
    if (!ink) continue;

    const state = ["aria-pressed", "aria-checked", "aria-selected", "aria-current"]
      .filter((a) => ctl.hasAttribute(a));
    marks.push({
      icon: true, kind: "graphic inside a control",
      sel: sel(g), on: sel(ctl), via: "glyph", state,
      ink: `rgb(${ink.join(",")})`, base: `rgb(${base.join(",")})`, r: +bestR.toFixed(2),
      ctl: ctl.tagName.toLowerCase() + (ctl.getAttribute("aria-label") ? `[${ctl.getAttribute("aria-label")}]` : ""),
      ctlText: (ctl.innerText || "").replace(/\s+/g, " ").trim().slice(0, 34),
    });
  }

  /* A <select>'s chosen option and an <input>'s value or placeholder are drawn
     by the browser into shadow content with no DOM text node, so no Range can
     bound them and this method cannot reach them. Counted rather than passed
     over in silence. */
  const shadow = [];
  for (const el of document.querySelectorAll("select,input,textarea")) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (cs.visibility !== "visible" || cs.display === "none" || !inView(r) || r.height < 4) continue;
    if (!(el.value || el.getAttribute("placeholder"))) continue;
    shadow.push(sel(el));
  }

  if (sheet) sheet.disabled = false;
  return {
    text, marks, shadow, frameW: W, frameH: H,
    skipped: {
      invisible: [...skipped.invisible], occluded: [...skipped.occluded],
      transparent: [...skipped.transparent],
    },
  };
};

/* ------------------------------------------------------------------ driver */
const b = await chromium.launch({ channel: "chrome" });
const p = await b.newPage({ viewport: VIEW, deviceScaleFactor: 1 });
const errs = [];
p.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));
p.on("console", (m) => { if (m.type() === "error" && !/favicon/i.test(m.text())) errs.push(m.text()); });
await p.goto(TARGET, { waitUntil: "networkidle" });

const hide = () => p.evaluate(() => {
  const s = document.createElement("style");
  s.id = "gy-probe-hide";
  /* -webkit-text-fill-color erases HTML glyphs without touching `color`, so
     currentColor borders and marks still paint. It does not reach SVG text,
     which is filled rather than coloured, so the Recharts axis and legend
     labels need the second rule or their own glyphs get sampled as though
     they were the backdrop. */
  s.textContent = "*,*::before,*::after{-webkit-text-fill-color:transparent!important;text-decoration-color:transparent!important;caret-color:transparent!important;}"
    + "text,tspan{fill:transparent!important;}";
  document.head.appendChild(s);
});
const show = () => p.evaluate(() => document.getElementById("gy-probe-hide")?.remove());
/* One shared clock. An animation that repeats forever — the sky's drift and
   its two blooms — is placed at t on that clock, which is what makes a stepped
   walk across the timeline a walk across the same timeline for all three. An
   animation that ends is jumped to its end instead: freezing an entrance at
   t=0 would screenshot a screen at opacity 0 and read the page background as
   though it were the backdrop of every element on it. */
const freeze = (t) => p.evaluate((t) => {
  for (const a of document.getAnimations()) {
    try {
      a.pause();
      const tm = a.effect?.getComputedTiming?.() ?? {};
      a.currentTime = tm.iterations === Infinity ? t : (Number.isFinite(tm.endTime) ? tm.endTime : t);
    } catch {}
  }
}, t);
const thaw = () => p.evaluate(() => { for (const a of document.getAnimations()) { try { a.play(); } catch {} } });

/* the scroller that belongs to whatever is on top — a mounted but zero-sized
   dialog is not on top of anything */
const scrollTop0 = () => p.evaluate(() => {
  const dd = [...document.querySelectorAll('[role="dialog"]')].filter((x) => {
    const r = x.getBoundingClientRect(); const c = getComputedStyle(x);
    return r.width > 20 && r.height > 20 && c.visibility === "visible" && c.display !== "none";
  }).pop();
  const root = dd || document.body;
  for (const e of [root, ...root.querySelectorAll("*")]) {
    if (e.scrollHeight - e.clientHeight > 4) e.scrollTop = 0;
  }
});
const scrollDown = () => p.evaluate(() => {
  const dd = [...document.querySelectorAll('[role="dialog"]')].filter((x) => {
    const r = x.getBoundingClientRect(); const c = getComputedStyle(x);
    return r.width > 20 && r.height > 20 && c.visibility === "visible" && c.display !== "none";
  }).pop();
  const root = dd || document.body;
  const cands = [root, ...root.querySelectorAll("*")].filter((e) => {
    const cs = getComputedStyle(e);
    return e.scrollHeight - e.clientHeight > 4 && /auto|scroll/.test(cs.overflowY)
      && e.getBoundingClientRect().height > 60;
  });
  if (!cands.length) return false;
  const e = cands.sort((a, z) => (z.scrollHeight - z.clientHeight) - (a.scrollHeight - a.clientHeight))[0];
  const was = e.scrollTop;
  e.scrollTop = was + e.clientHeight * 0.72;
  return e.scrollTop > was + 1;
});

/* screen -> theme -> { runs: Map, marks: Map } */
const book = new Map();
const skipped = { invisible: new Set(), occluded: new Set(), transparent: new Set() };
const shadowText = new Set();
let frames = 0, animated = 0;

const record = (screen, theme, res) => {
  const key = `${screen} | ${theme}`;
  if (!book.has(key)) book.set(key, { runs: new Map(), marks: new Map() });
  const slot = book.get(key);
  for (const t of res.text) {
    const id = `${t.sel}::${t.text}`;
    const prev = slot.runs.get(id);
    if (!prev || t.min < prev.min) slot.runs.set(id, t);
  }
  for (const m of res.marks) {
    const id = `${m.sel}::${m.on}`;
    const prev = slot.marks.get(id);
    if (!prev || m.r < prev.r) slot.marks.set(id, m);
  }
  for (const kind of ["invisible", "occluded", "transparent"]) {
    for (const s of res.skipped[kind]) skipped[kind].add(`${key} ${s}`);
  }
  for (const s of res.shadow) shadowText.add(`${key} ${s}`);
};

/* GY_DUMP=<dir> writes the exact frame every failing sample was read out of,
   so a reader can look at the pixel rather than take the number on trust. */
const DUMP = process.env.GY_DUMP;
const shoot = async (screen, theme) => {
  const buf = await p.screenshot();
  frames++;
  const res = await p.evaluate(PROBE, "data:image/png;base64," + buf.toString("base64"));
  if (DUMP && res.text.some((t) => t.min < t.need)) {
    const name = `${screen}-${theme}-${frames}`.replace(/[^a-z0-9-]+/gi, "_");
    await writeFile(`${DUMP}/${name}.png`, buf);
  }
  return res;
};

/** One screen, one theme: scroll it end to end, and if .gy-sky is mounted walk
    the animation timeline at every scroll position. */
const measure = async (screen, theme) => {
  await p.waitForTimeout(700);
  await scrollTop0();
  await p.waitForTimeout(350);
  const sky = await p.evaluate(() => !!document.querySelector(".gy-sky"));
  if (sky) animated++;
  await hide();
  for (let pass = 0; pass < 14; pass++) {
    if (sky) {
      for (let f = 0; f < SKY_FRAMES; f++) {
        await freeze((SKY_SPAN * f) / (SKY_FRAMES - 1));
        record(screen, theme, await shoot(screen, theme));
      }
      await thaw();
    } else {
      await p.waitForTimeout(250);
      await freeze(0);          // finite entrances land on their end state
      record(screen, theme, await shoot(screen, theme));
      await thaw();
    }
    if (!(await scrollDown())) break;
    await p.waitForTimeout(320);
  }
  await show();
  await scrollTop0();
  const n = book.get(`${screen} | ${theme}`)?.runs.size ?? 0;
  process.stderr.write(`  measured ${screen} (${theme}): ${n} text runs${sky ? ", 27 animation frames per scroll position" : ""}\n`);
};

/* ---- onboarding, the same walk the sibling drivers use ------------------ */
const notReached = [];
const bodyText = () => p.evaluate(() => document.body.innerText);

await measure("welcome (outside the assessed four)", "warm");

await p.getByText("Build my shift plan").click().catch(() => notReached.push("welcome CTA"));
await p.waitForTimeout(500);
if (/disclaimer|before you start/i.test(await bodyText())) {
  await measure("disclaimer (outside the assessed four)", "warm");
}

/* one quiz step, measured before the walk clicks through it: this is the only
   text in the app that prints on .gy-sky */
for (let s = 0; s < 30; s++) {
  if (s === 1) await measure("quiz step (outside the assessed four, .gy-sky)", "warm");
  const bt = await p.evaluate(() => [...document.querySelectorAll("button")]
    .map((x) => x.innerText.replace(/\s+/g, " ").trim()));
  const pick = bt.findIndex((t) => t && !/^(Back|Continue|Next)/i.test(t));
  if (pick >= 0) await p.locator("button").nth(pick).click().catch(() => {});
  await p.waitForTimeout(140);
  const a = p.locator("button").filter({ hasText: /Continue|Next|See my plan|Build/i }).first();
  if (await a.count()) await a.click().catch(() => {});
  await p.waitForTimeout(220);
  if (/plan is ready/i.test(await bodyText())) break;
}
await p.waitForTimeout(6500);
if (/plan is ready/i.test(await bodyText())) {
  await measure("recommendation (outside the assessed four)", "warm");
} else {
  notReached.push("recommendation");
}

const start = p.getByText("Start my plan", { exact: false }).first();
if (await start.count()) { await start.scrollIntoViewIfNeeded(); await start.click(); }
await p.waitForTimeout(1200);
if (await p.locator("button").filter({ hasText: /^Skip$/ }).count()) {
  await measure("guided tour (outside the assessed four)", "warm");
}
for (let i = 0; i < 10; i++) {                       // the guided tour opens over the first run
  const done = await p.evaluate(() => {
    const x = [...document.querySelectorAll("button")].find((e) => /^Skip$/i.test(e.innerText.trim()));
    if (x) { x.click(); return true; }
    return false;
  });
  if (done) break;
  await p.waitForTimeout(250);
}
await p.waitForTimeout(700);

const tab = async (name) => {
  await p.evaluate((n) => {
    const x = [...document.querySelectorAll("button")].find((e) => e.innerText.trim() === n);
    x?.click();
  }, name);
  await p.waitForTimeout(800);
};
const openProfile = async () => {
  await p.evaluate(() => document.querySelector('button[aria-label="Profile"]')?.click());
  await p.waitForTimeout(700);
};
const closeProfile = async () => {
  await p.evaluate(() => document.querySelector('button[aria-label="Close"]')?.click());
  await p.waitForTimeout(700);
};
const setTheme = async (label) => {
  await openProfile();
  const ok = await p.evaluate((l) => {
    const x = [...document.querySelectorAll("button")].find((e) => e.innerText.trim() === l);
    if (x) { x.click(); return true; }
    return false;
  }, label);
  await p.waitForTimeout(900);
  return ok;
};

const TABS = [["Dashboard", "Dashboard"], ["Plan", "Plan"], ["Reflection", "Reflection"], ["Care", "Care"]];

for (const theme of ["warm", "dark"]) {
  if (!(await setTheme(theme === "dark" ? "Always dark" : "Always warm"))) {
    notReached.push(`${theme} theme switch`);
  }
  await measure(`profile sheet (outside the assessed four)`, theme);
  /* the time-edit sheet, opened from inside the profile sheet */
  if (await p.evaluate(() => {
    const x = [...document.querySelectorAll("button")].find((e) => /Shift time/.test(e.innerText));
    if (x) { x.click(); return true; } return false;
  })) {
    await p.waitForTimeout(800);
    await measure("time-edit sheet (outside the assessed four)", theme);
    await p.keyboard.press("Escape");
    await p.waitForTimeout(500);
  } else notReached.push(`time-edit sheet (${theme})`);
  await closeProfile();
  for (const [label, name] of TABS) {
    await tab(label);
    await measure(name, theme);
    /* The Dashboard opens on tonight, which on a fresh profile is one empty
       state. Its charts, meters and figures — most of its text — only paint
       once a longer window is picked, so the same screen is measured again
       through its own Trends select rather than left half-measured. */
    if (name === "Dashboard") {
      const sel = p.locator('select[aria-label="Longer windows"]').first();
      if (await sel.count()) {
        await sel.selectOption("all").catch(() => notReached.push(`Dashboard trends (${theme})`));
        await p.waitForTimeout(900);
        await measure(name, theme);
      } else notReached.push(`Dashboard trends select (${theme})`);
    }
    if (name === "Plan") {
      const opened = await p.evaluate(() => {
        const x = [...document.querySelectorAll("button")].find((e) => /^Adjust$/i.test(e.innerText.trim()));
        if (x) { x.click(); return true; } return false;
      });
      await p.waitForTimeout(900);
      if (opened && await p.locator('[role="dialog"]').count()) {
        await measure("plan-adjust sheet (outside the assessed four)", theme);
        await p.keyboard.press("Escape");
        await p.waitForTimeout(600);
      } else notReached.push(`plan-adjust sheet (${theme})`);
    }
  }
  /* the quick-log sheet and the care player: both overlay an assessed screen */
  await p.evaluate(() => document.querySelector('button[aria-label="Quick log"]')?.click());
  await p.waitForTimeout(800);
  if (await p.locator('[role="dialog"]').count()) {
    await measure("quick-log sheet (outside the assessed four)", theme);
    await p.keyboard.press("Escape");
    await p.waitForTimeout(600);
  } else notReached.push(`quick-log sheet (${theme})`);

  await tab("Care");
  await p.evaluate(() => {
    const c = [...document.querySelectorAll("button,[role='button']")]
      .find((e) => /box breathing|4-7-8|reset|shake|eye/i.test(e.innerText || ""));
    c?.click();
  });
  await p.waitForTimeout(1000);
  if (await p.locator('[role="dialog"]').count()) {
    await p.evaluate(() => {
      const t = [...document.querySelectorAll("button")]
        .find((x) => /^Spoken guidance on$/i.test(x.getAttribute("aria-label") || ""));
      t?.click();
    });
    await measure("care player (outside the assessed four)", theme);
    await p.evaluate(() => {
      const x = [...document.querySelectorAll('[role="dialog"] button')]
        .find((e) => /Log it and close|Close|Finish early/i.test(e.innerText.trim() || e.getAttribute("aria-label") || ""));
      x?.click();
    });
    await p.waitForTimeout(700);
  } else notReached.push(`care player (${theme})`);
}

/* ------------------------------------------------------------------ report */
const ASSESSED = new Set(["Dashboard", "Plan", "Reflection", "Care"]);
const rows = [...book.entries()].map(([key, slot]) => {
  const [screen, theme] = key.split(" | ");
  const runs = [...slot.runs.values()];
  const marks = [...slot.marks.values()];
  return {
    key, screen, theme, runs, marks,
    assessed: ASSESSED.has(screen),
    floor: runs.length ? Math.min(...runs.map((r) => r.min)) : null,
    fails: runs.filter((r) => r.min < r.need).sort((a, z) => a.min - z.min),
  };
});

const line = (s) => console.log(s);
const fmt = (r) => `${r.min.toFixed(2)}:1 (needs ${r.need}) ${r.fs}px/${r.fw}${r.large ? " large" : ""} ${r.color}${r.alpha < 1 ? ` x opacity ${r.alpha}` : ""} on ${r.bg} sampled at ${r.at?.join(",")} in box ${r.box?.join(",")}\n      ${r.sel}\n      "${r.text}"`;

line("");
line("================================================================");
line("  drive-contrast.mjs — WCAG 2.1 contrast, measured on rendered pixels");
line("================================================================");
line(`target        ${TARGET}`);
line(`browser       Chrome (channel:"chrome"), viewport ${VIEW.width}x${VIEW.height} @ 1x`);
line(`method        HTML glyphs suppressed with -webkit-text-fill-color and SVG`);
line(`              glyphs with fill:transparent, viewport screenshot decoded to`);
line(`              RGBA, every line box of every rendered text node sampled on a`);
line(`              grid, foreground (color, or fill for SVG text) composited at`);
line(`              colour-alpha x inherited-opacity over the WORST sampled pixel.`);
line(`              The frame's final scanline is discarded: Chrome returns it`);
line(`              white on every capture regardless of what the page painted.`);
line(`thresholds    4.5:1, or 3:1 where computed size >= 24px or >= 18.66px at weight >= 700`);
line(`frames        ${frames} screenshots; ${animated} screen/theme passes carried .gy-sky and were`);
line(`              sampled at ${SKY_FRAMES} frozen points across ${SKY_SPAN / 1000}s of its timeline`);
line("");

line("---- 1.4.3 TEXT CONTRAST, the four assessed screens ----------------");
for (const theme of ["warm", "dark"]) {
  const mine = rows.filter((r) => r.assessed && r.theme === theme);
  if (!mine.length) continue;
  const all = mine.flatMap((r) => r.runs);
  const fails = mine.flatMap((r) => r.fails);
  line("");
  line(`  ${theme.toUpperCase()} THEME`);
  for (const r of mine) {
    line(`    ${r.screen.padEnd(12)} ${String(r.runs.length).padStart(4)} text runs   floor ${r.floor === null ? "  n/a" : r.floor.toFixed(2) + ":1"}   below threshold: ${r.fails.length}`);
  }
  line(`    ${"TOTAL".padEnd(12)} ${String(all.length).padStart(4)} text runs   FLOOR ${all.length ? Math.min(...all.map((x) => x.min)).toFixed(2) + ":1" : "n/a"}   below threshold: ${fails.length}`);
  for (const f of fails.sort((a, z) => a.min - z.min)) line(`      FAIL ${fmt(f)}`);
}

line("");
line("---- 1.4.3 TEXT CONTRAST, screens outside the assessed four --------");
for (const r of rows.filter((x) => !x.assessed).sort((a, z) => a.key.localeCompare(z.key))) {
  line(`  ${r.key.padEnd(52)} ${String(r.runs.length).padStart(4)} runs  floor ${r.floor === null ? " n/a" : r.floor.toFixed(2) + ":1"}  below: ${r.fails.length}`);
  for (const f of r.fails) line(`      FAIL ${fmt(f)}`);
}

line("");
line("---- 1.4.11 NON-TEXT, control boundaries and state marks ----------");
const allMarks = new Map();
for (const r of rows) for (const m of r.marks) {
  const id = `${r.theme}::${m.sel}::${m.on}`;
  if (!allMarks.has(id) || m.r < allMarks.get(id).m.r) allMarks.set(id, { r, m });
}
/* Which rows are failures and which are only reported. Two ways a row can be
   a 1.4.11 failure, and both are properties of the element rather than of a
   judgement call:

     the control carries no visible text, so its boundary is the only thing
     that says it is there; or

     the control declares a state (aria-pressed / -checked / -selected /
     -current), which makes the paint that changes with that state the whole of
     the state signal — a label says what the control is, never whether it is on.

   Everything else is a faint edge on a control its own label already
   identifies, or a decorative wash behind an icon. Those are printed with
   their measured ratio and not scored, because calling them failures would be
   an interpretation, not a measurement. */
const why = (m) => {
  if (m.r >= 3) return null;
  if (m.kind === "graphic inside a control" && !m.ctlText) return "sole identifier: the icon, on a control with no visible label";
  if (m.kind === "control boundary" && !m.ctlText && !m.icon) return "sole identifier: the boundary, on a control with no label and no icon";
  if (m.state.length) return `state-bearing control (${m.state.join(",")})`;
  return null;
};
const rowsM = [...allMarks.values()];
const failsM = rowsM.filter((x) => why(x.m)).sort((a, z) => a.m.r - z.m.r);
const seenM = rowsM.filter((x) => x.m.r < 3 && !why(x.m)).sort((a, z) => a.m.r - z.m.r);

line(`  ${rowsM.filter((x) => x.m.kind === "control boundary").length} control boundaries, `
  + `${rowsM.filter((x) => x.m.kind === "paint inside a control").length} painted elements inside controls and `
  + `${rowsM.filter((x) => x.m.kind === "graphic inside a control").length} icons`);
line(`  measured, each against the pixels of the surface it sits on, in both themes.`);
line("");
line(`  UNDER 3:1 AND MATERIAL TO 1.4.11 (${failsM.length}). Each row names why it is material.`);
line(`  A "sole identifier" row is a failure outright: nothing else says the control is`);
line(`  there. A "state-bearing" row is a failure if this paint is what changes between`);
line(`  the two states; the driver measures one state and does not toggle it, so where a`);
line(`  control also changes glyph or label, a reader should confirm which signal is`);
line(`  doing the work. The toggle knobs below are the unambiguous case: the knob is the`);
line(`  only thing that moves.`);
for (const { r, m } of failsM) {
  line(`    ${m.r.toFixed(2)}:1 via ${m.via.padEnd(6)} ${m.ink} on ${m.base}  [${r.theme}] ${r.screen}`);
  line(`             ${m.ctl}${m.ctlText ? ` "${m.ctlText}"` : ""}  — ${why(m)}`);
  line(`             ${m.sel}`);
}
line("");
line(`  UNDER 3:1 BUT NOT SCORED (${seenM.length}) — a labelled control's faint edge, or a wash behind an icon:`);
for (const { r, m } of seenM) {
  line(`    ${m.r.toFixed(2)}:1 ${m.via.padEnd(6)} [${r.theme}] ${r.screen} — ${m.ctl} "${m.ctlText}"`);
}

if (process.env.GY_VERBOSE) {
  line("");
  line("---- every measurement, GY_VERBOSE ---------------------------------");
  for (const r of rows.sort((a, z) => a.key.localeCompare(z.key))) {
    for (const t of r.runs.sort((a, z) => a.min - z.min)) {
      line(`  ${t.min.toFixed(2)}:1 need ${t.need} ${String(t.fs).padStart(5)}px/${t.fw} ${t.color} on ${t.bg}  [${r.theme}] ${r.screen}  "${t.text}"`);
    }
  }
}

line("");
line("---- coverage ------------------------------------------------------");
line(`  assessed screens measured : ${[...new Set(rows.filter((r) => r.assessed).map((r) => r.screen))].join(", ") || "NONE"}`);
line(`  themes                    : ${[...new Set(rows.map((r) => r.theme))].join(", ")}`);
line(`  also measured (not in the paper's scope): ${[...new Set(rows.filter((r) => !r.assessed).map((r) => r.screen))].join(", ")}`);
line(`  NOT reached               : ${notReached.length ? notReached.join(", ") : "none"}`);
line(`  NOT measurable by this method: ${shadowText.size} form controls whose visible value or`);
line(`                              placeholder is browser shadow content with no DOM text`);
line(`                              node — chiefly the Reflection selects. Their colours are`);
line(`                              T.ink / T.faint on T.card, which src/tokens.test.js asserts`);
line(`                              from the table; this driver cannot confirm them on pixels.`);
line(`  elements skipped          : ${skipped.occluded.size} occluded by an overlay, ${skipped.transparent.size} fully transparent, ${skipped.invisible.size} zero-area or hidden (distinct element/screen/theme, not per frame)`);
line(`  page errors               : ${errs.length ? [...new Set(errs)].join(" | ") : "none"}`);
line("");

const totalFails = rows.reduce((n, r) => n + r.fails.length, 0);
await b.close();
process.exit(Math.min(250, totalFails));
