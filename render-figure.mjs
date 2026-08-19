/* Renders one element of a page to PNG for embedding in the report.

   Playwright is already a dev tool here, and the figures are laid out in HTML,
   so the page is shot rather than redrawn. deviceScaleFactor 4 puts a 650 CSS
   px figure — the width of the 6.5in text column — at roughly 400 dpi.

   node render-figure.mjs <src.html> <out.png> [selector]   default #fig */
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
const [src, out, sel = "#fig"] = process.argv.slice(2);
const b = await chromium.launch({ channel: "chrome" });
const p = await b.newPage({ deviceScaleFactor: 4 });
await p.goto(src.startsWith("file:") ? src : pathToFileURL(src).href, { waitUntil: "networkidle" });
const el = p.locator(sel).first();
const box = await el.boundingBox();
await el.screenshot({ path: out });
console.log(`rendered ${out} — ${Math.round(box.width)}x${Math.round(box.height)} css px`);
await b.close();
