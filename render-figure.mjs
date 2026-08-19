/* Renders one element of a page to PNG for embedding in the report.

   Playwright is already a dev tool here, and the figures are laid out in HTML,
   so the page is shot rather than redrawn. deviceScaleFactor 4 puts a 650 CSS
   px figure — the width of the 6.5in text column — at roughly 400 dpi.

   The width asked for is the width of the ELEMENT, not of the window. The paper
   reserves a right gutter for its margin notes, so an element is narrower than
   the viewport by a constant, and shooting at the window's own width laid the
   bar chart out at 1045 px for a column that is 650. The build then scaled it
   to fit and its 10pt labels printed at under 6pt. The viewport is measured and
   corrected once instead, which lands the element on its target whatever the
   gutter happens to be. An element of fixed width ignores this and is shot as
   it is.

   node render-figure.mjs <src.html> <out.png> [selector] [element width]
   defaults: #fig, 650 */
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
const [src, out, sel = "#fig", want = "650"] = process.argv.slice(2);
const target = +want;
const b = await chromium.launch({ channel: "chrome" });
const p = await b.newPage({ viewport: { width: target, height: 900 }, deviceScaleFactor: 4 });
await p.goto(src.startsWith("file:") ? src : pathToFileURL(src).href, { waitUntil: "networkidle" });
const el = p.locator(sel).first();
let box = await el.boundingBox();
if (Math.abs(box.width - target) > 1) {
  await p.setViewportSize({ width: Math.round(target + (target - box.width)), height: 900 });
  box = await el.boundingBox();
}
await el.screenshot({ path: out });
console.log(`rendered ${out} — ${Math.round(box.width)}x${Math.round(box.height)} css px`);
await b.close();
