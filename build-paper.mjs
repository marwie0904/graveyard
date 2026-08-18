import { chromium } from "playwright";
import { readFileSync, writeFileSync, unlinkSync } from "fs";
import { execFileSync } from "child_process";
import { pathToFileURL } from "url";

const DOCS = "/Users/a1234/Business/Graveyard/docs";

/* Markdown subset covering exactly what docs/*.md use: ATX headings, hr,
   one level of nested bullets, pipe tables, bold, italic, code spans. Not a
   general parser, and does not need to be. */
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (s) =>
  esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");

function mdToHtml(md) {
  const out = [];
  const lines = md.split("\n");
  let list = 0; // open <ul> depth

  const closeLists = (to = 0) => { while (list > to) { out.push("</ul>"); list--; } };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^\s*$/.test(line)) { closeLists(); continue; }

    // table: header row, separator, then body until a non-pipe line
    if (/^\|/.test(line) && /^\|[\s:|-]+\|$/.test(lines[i + 1] || "")) {
      closeLists();
      const cells = (r) => r.split("|").slice(1, -1).map((c) => c.trim());
      out.push("<table><thead><tr>" +
        cells(line).map((c) => `<th>${inline(c)}</th>`).join("") + "</tr></thead><tbody>");
      i += 2;
      while (i < lines.length && /^\|/.test(lines[i])) {
        out.push("<tr>" + cells(lines[i]).map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>");
        i++;
      }
      i--;
      out.push("</tbody></table>");
      continue;
    }

    if (/^---+$/.test(line)) { closeLists(); out.push("<hr>"); continue; }

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { closeLists(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }

    const li = line.match(/^(\s*)[-*]\s+(.*)$/);
    if (li) {
      const want = li[1].length >= 2 ? 2 : 1;
      while (list < want) { out.push("<ul>"); list++; }
      closeLists(want);
      out.push(`<li>${inline(li[2])}</li>`);
      continue;
    }

    closeLists();
    out.push(`<p>${inline(line)}</p>`);
  }
  closeLists();
  return out.join("\n");
}

const SUMMARY_CSS = `
@page { size: letter; margin: 0.6in; }
@page { @bottom-center { content: counter(page); } }
body { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; font-size: 8.8pt;
       line-height: 1.4; color: #16150F; margin: 0; }
h1 { font-size: 15pt; margin: 0 0 2pt; letter-spacing: -0.02em; }
h2 { font-size: 11pt; margin: 12pt 0 4pt; padding-bottom: 2pt;
     border-bottom: 0.7pt solid #C8912A; page-break-after: avoid; }
h3 { font-size: 9.4pt; margin: 9pt 0 3pt; page-break-after: avoid; }
h4 { font-size: 8.8pt; margin: 7pt 0 2pt; page-break-after: avoid; }
p { margin: 0 0 5pt; }
ul { margin: 0 0 5pt; padding-left: 14pt; }
ul ul { margin: 1pt 0; }
li { margin-bottom: 1.5pt; }
hr { border: none; border-top: 0.5pt solid #D8D4CB; margin: 9pt 0; }
strong { font-weight: 600; }
code { font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 8.8pt;
       background: #F2F0EA; padding: 1pt 3pt; border-radius: 3px; }
table { border-collapse: collapse; width: 100%; font-size: 9pt; margin: 4pt 0 10pt;
        break-inside: avoid; }
th, td { border-top: 0.5pt solid #C9C4BA; padding: 5pt 7pt; text-align: left;
         vertical-align: top; }
thead th { border-bottom: 0.7pt solid #16150F; font-weight: 600; }
tbody tr:last-child td { border-bottom: 0.5pt solid #C9C4BA; }
`;

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
const pdf = { printBackground: true, preferCSSPageSize: true, format: "Letter" };

// --- the paper ---
// Two passes: the clean draft is printed once to find out which page each
// heading landed on, those numbers are written into the contents pages, and
// both variants are printed again. Chrome has no target-counter(), and a
// contents list with dashes in it is not a contents list.
const clean = () => page.evaluate(() => {
  document.body.classList.remove("annotated");
  document.querySelectorAll("aside").forEach((a) => a.remove());
});
const load = () => page.goto(pathToFileURL(`${DOCS}/sample-paper.html`).href,
                             { waitUntil: "networkidle" });

await load();
await clean();
const probe = `${DOCS}/.toc-probe.pdf`;
await page.pdf({ ...pdf, path: probe });

let pages = {};
try {
  execFileSync("pdftotext", ["-layout", probe, `${probe}.txt`]);
  const text = readFileSync(`${probe}.txt`, "utf8").split("\f");
  const keys = await page.evaluate(() =>
    [...document.querySelectorAll(".pn[data-toc]")].map((e) => [e.dataset.toc, !!e.dataset.fm]));
  // body headings are searched only past the abstract: the contents list spills
  // over two pages, and its own rows are typed exactly like the headings
  const afterAbstract = text.findIndex((pg) => /^\s*ABSTRACT\s*$/m.test(pg)) + 1;
  // a page that lists captions is not the page that carries them
  const index = /TABLE OF CONTENTS|LIST OF TABLES|LIST OF FIGURES|LIST OF APPENDICES/i;
  for (const [k, isFm] of new Map(keys)) {
    const from = isFm ? 0 : afterAbstract;
    const lit = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // a heading prints on a line of its own; a caption wraps, so fall back to a
    // loose match that skips the listing pages rather than pointing at them
    const exact = new RegExp(`^\\s*${lit}\\s*$`, "im");
    const loose = new RegExp(lit, "i");
    // chapter and front-matter headings print uppercase, contents rows do not,
    // so the case-sensitive form separates a heading from a row pointing at it
    const upper = new RegExp(`^\\s*${lit.toUpperCase()}\\s*$`, "m");
    // the listing pages name themselves, so only those keys may resolve to one
    const scope = text.slice(from);
    const ok = (pg) => isFm || !index.test(pg);
    let i = scope.findIndex((pg) => upper.test(pg) && ok(pg));
    if (i < 0) i = scope.findIndex((pg) => ok(pg) && exact.test(pg));
    if (i < 0) i = scope.findIndex((pg) => ok(pg) && loose.test(pg.replace(/\s+/g, " ")));
    if (i >= 0) pages[k] = from + i + 1;
  }
  unlinkSync(`${probe}.txt`);
} catch (e) {
  console.warn("contents page numbers skipped:", e.message.split("\n")[0]);
}
unlinkSync(probe);

await load();
await page.evaluate((map) => {
  document.querySelectorAll(".pn[data-toc]").forEach((e) => {
    if (map[e.dataset.toc]) e.textContent = map[e.dataset.toc];
  });
}, pages);
await page.pdf({ ...pdf, path: `${DOCS}/sample-paper-annotated.pdf` });
await clean();
await page.pdf({ ...pdf, path: `${DOCS}/sample-paper-draft.pdf` });

// --- the summary, rendered from its markdown ---
const tmp = `${DOCS}/.paper-summary.build.html`;
writeFileSync(tmp, `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<title>What the Paper Contains</title><style>${SUMMARY_CSS}</style></head><body>
${mdToHtml(readFileSync(`${DOCS}/paper-summary.md`, "utf8"))}
</body></html>`);
await page.goto(pathToFileURL(tmp).href, { waitUntil: "networkidle" });
await page.pdf({ ...pdf, path: `${DOCS}/paper-summary.pdf` });
unlinkSync(tmp);

await browser.close();
console.log("built sample-paper-annotated.pdf, sample-paper-draft.pdf, paper-summary.pdf");
