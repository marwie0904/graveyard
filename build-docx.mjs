/* The paper as a .docx in the BAMS Special Project template's own format.

   Not a conversion. The template (docs/report-template.docx) is opened, its
   front matter is kept exactly as it stands — title page, permission page,
   acceptance page, the UP seal, the section breaks that switch the page
   numbering from roman to arabic, the footers — and only the placeholder
   content inside it is replaced. The body is then generated from
   docs/sample-paper.html using paragraph recipes lifted out of the template
   itself, so a generated body paragraph is byte-for-byte the same
   WordprocessingML as a template body paragraph apart from its text.

   The recipes, read off the template:
     chapter heading   Arial 12 bold, centred, auto-numbered from numId 2
     section heading   Arial 12 bold, centred
     subheading        Arial 12 bold, left, double-spaced
     body paragraph    Arial 12, double-spaced, first line indented by a tab
     reference         Arial 12, double-spaced, first line indented 720 twips

   An earlier version of this script converted the HTML with html-to-docx. It
   produced a valid file in nobody's format in particular, and three separate
   schema faults Word rejected. Generating against the template is both more
   faithful and less code than fixing a converter's output.

   Run: node build-docx.mjs  ->  docs/sample-paper-draft.docx */

import { readFileSync, writeFileSync } from "node:fs";
import JSZip from "jszip";

const DOCS = new URL("./docs/", import.meta.url).pathname;

/* ------------------------------- recipes -------------------------------- */

const FONT = `<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Times New Roman" w:cs="Arial"/>`;
const LANG = `<w:lang w:eastAsia="en-PH"/>`;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const rPr = ({ b, i } = {}) =>
  `<w:rPr>${FONT}${b ? "<w:b/>" : ""}${i ? "<w:i/>" : ""}<w:sz w:val="24"/><w:szCs w:val="24"/>${LANG}</w:rPr>`;
const run = (t, o) => `<w:r>${rPr(o)}<w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
const tabRun = () => `<w:r>${rPr()}<w:tab/></w:r>`;

/* pPr children must appear in schema order: pStyle, numPr, spacing, ind, jc,
   rPr. Word rejects the document over a wrong order, not merely ignoring it. */
const P = (runs, { jc, dbl, b, numbered, ind } = {}) =>
  `<w:p><w:pPr><w:pStyle w:val="11"/>` +
  (numbered ? `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>` : "") +
  (dbl ? `<w:spacing w:line="480" w:lineRule="auto"/>` : "") +
  (ind ?? (numbered ? `<w:ind w:left="284" w:hanging="284"/>` : "")) +
  (jc ? `<w:jc w:val="${jc}"/>` : "") +
  rPr({ b }) + `</w:pPr>${runs}</w:p>`;

const chapterHead = (t) => P(run(t.toUpperCase(), { b: true }), { jc: "center", b: true, numbered: true });
const sectionHead = (t) => P(run(t, { b: true }), { jc: "center", b: true });
const subHead = (t) => P(run(t, { b: true }), { b: true, dbl: true });
const bodyPara = (runs) => P(tabRun() + runs, { dbl: true });
const flatPara = (runs, o = {}) => P(runs, { dbl: true, ...o });
const refPara = (runs) => P(runs, { dbl: true, ind: `<w:ind w:firstLine="720"/>` });
const blank = () => P("", {});

/* ------------------------- inline HTML -> runs -------------------------- */

const ENTITIES = { amp: "&", lt: "<", gt: ">", nbsp: " ", ndash: "–",
  mdash: "—", rsquo: "’", lsquo: "‘", ldquo: "“",
  rdquo: "”", hellip: "…", times: "×", deg: "°" };
const decode = (s) => s.replace(/&(\w+);/g, (m, e) => ENTITIES[e] ?? m)
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));

/* <b>/<strong> and <i>/<em> nest one level at most in this document, which is
   what lets a tag stack this small be correct. */
function runs(html) {
  const out = [];
  let b = 0, i = 0;
  const re = /<\/?(b|strong|i|em|code|span|sup|sub|a)\b[^>]*>|<br\s*\/?>/gi;
  let last = 0, m;
  const push = (text) => { if (text) out.push(run(decode(text), { b: b > 0, i: i > 0 })); };
  while ((m = re.exec(html))) {
    push(html.slice(last, m.index));
    last = m.index + m[0].length;
    const tag = (m[1] || "br").toLowerCase();
    const close = m[0].startsWith("</");
    if (tag === "b" || tag === "strong") b += close ? -1 : 1;
    else if (tag === "i" || tag === "em") i += close ? -1 : 1;
    else if (tag === "br") out.push(`<w:r>${rPr()}<w:br/></w:r>`);
  }
  push(html.slice(last));
  return out.join("");
}
const plain = (html) => decode(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();

/* -------------------------------- tables -------------------------------- */

const BORDER = ["top", "left", "bottom", "right", "insideH", "insideV"]
  .map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="000000"/>`).join("");

function table(html, usableWidth) {
  const rows = [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(([, r]) =>
    [...r.matchAll(/<(th|td)([^>]*)>([\s\S]*?)<\/\1>/g)]
      .map(([, tag, attrs, cell]) => ({
        head: tag === "th", cell,
        pct: parseFloat((attrs.match(/width:([\d.]+)%/) || [])[1]) || null,
      })));
  if (!rows.length) return "";
  const cols = Math.max(...rows.map((r) => r.length));
  const pcts = rows[0].map((c) => c.pct);
  const widths = pcts.every(Boolean)
    ? pcts.map((p) => Math.round((p / 100) * usableWidth))
    : Array.from({ length: cols }, () => Math.round(usableWidth / cols));

  const cell = ({ head, cell }, w) =>
    `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr>` +
    P(runs(cell), { b: head }) + `</w:tc>`;

  return `<w:tbl><w:tblPr><w:tblW w:w="${usableWidth}" w:type="dxa"/>` +
    `<w:tblBorders>${BORDER}</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr>` +
    `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>` +
    rows.map((r) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>` +
      r.map((c, n) => cell(c, widths[n] ?? widths[0])).join("") + `</w:tr>`).join("") +
    `</w:tbl>`;
}

/* --------------------------- the paper's body --------------------------- */

const paper = readFileSync(`${DOCS}sample-paper.html`, "utf8")
  .replace(/<aside\b[^>]*>[\s\S]*?<\/aside>/g, "")
  /* Figure 2 is a bar chart drawn in CSS, so its bars are width percentages on
     empty spans and arrive here as nothing at all. render-figure.mjs shoots the
     same chart from the same page, and the picture stands in for it. The
     lookahead is what ends the match: the chart's own nested divs would
     otherwise stop a non-greedy [\s\S]*? at the first bar's closing tag. */
  .replace(/<div class="chart">[\s\S]*?<\/div>\s*(?=<p class="flush"><i>Figure 2\.)/,
    '<p><img src="figure2-domain-scores.png"></p>');

const between = (from, to) => {
  const a = paper.indexOf(from);
  const b = to ? paper.indexOf(to, a) : paper.length;
  return paper.slice(a, b);
};

/* Chapters I and V head their sections the way the template heads Rationale
   and Recommendations, centred; II, III and IV carry topic subheadings, which
   the template sets left and bold. */
const CENTRED_SECTIONS = new Set(["I", "V"]);

function convert(html, usableWidth) {
  const out = [];
  let chapter = "";
  const re = /<h([23])[^>]*>([\s\S]*?)<\/h\1>|<table[^>]*>[\s\S]*?<\/table>|<div class="figure">[\s\S]*?<\/div>|<div class="refs">[\s\S]*?<\/div>|<p([^>]*)>([\s\S]*?)<\/p>/g;
  let m;
  while ((m = re.exec(html))) {
    const chunk = m[0];

    if (m[1]) {                                   // heading
      const text = plain(m[2]);
      const num = text.match(/^(I|II|III|IV|V)\.\s+(.*)$/);
      if (m[1] === "2") {
        if (num) { chapter = num[1]; out.push(chapterHead(num[2])); }
        else { chapter = ""; out.push(sectionHead(text.toUpperCase())); }
      } else {
        /* chapter === "" is the appendix run, which the template centres too */
        out.push(chapter === "" || CENTRED_SECTIONS.has(chapter)
          ? sectionHead(text) : subHead(text));
      }
      continue;
    }

    if (chunk.startsWith("<table")) {
      const cap = chunk.match(/<caption>([\s\S]*?)<\/caption>/);
      if (cap) for (const line of cap[1].split(/<br\s*\/?>/)) out.push(flatPara(runs(line)));
      out.push(table(chunk, usableWidth), blank());
      continue;
    }

    if (chunk.startsWith('<div class="figure"')) {
      for (const [, , inner] of chunk.matchAll(/<p([^>]*)>([\s\S]*?)<\/p>/g)) {
        const img = inner.match(/<img[^>]*src="([^"]+)"/);
        out.push(img ? picture(img[1]) : flatPara(runs(inner), { jc: "center" }));
      }
      continue;
    }

    if (chunk.startsWith('<div class="refs"')) {
      for (const [, , inner] of chunk.matchAll(/<p([^>]*)>([\s\S]*?)<\/p>/g))
        out.push(refPara(runs(inner)));
      continue;
    }

    const text = m[4];
    if (plain(text)) out.push(bodyPara(runs(text)));
  }
  return out;
}

/* ------------------------------ the package ----------------------------- */

const zip = await JSZip.loadAsync(readFileSync(`${DOCS}report-template.docx`));
const doc = await zip.file("word/document.xml").async("string");

/* the body-level section properties, which must stay the last child of
   <w:body>; the wholesale body replacement below would otherwise drop them */
const pgSz = doc.match(/<w:pgSz w:w="(\d+)"/);
const pgMar = doc.match(/<w:pgMar[^>]*w:right="(\d+)"[^>]*w:left="(\d+)"/)
  ?? doc.match(/<w:pgMar[^>]*w:left="(\d+)"[^>]*w:right="(\d+)"/);
const usable = +pgSz[1] - (+pgMar[1] + +pgMar[2]);

/* ------------------------------- pictures -------------------------------- */

/* A PNG states its pixel dimensions in the IHDR chunk, which is always the
   first chunk: eight bytes of signature, four of length, four of type, then
   width and height as big-endian 32-bit integers. */
const pngSize = (buf) => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) });

const EMU_PER_TWIP = 635;
const rels = await zip.file("word/_rels/document.xml.rels").async("string");
let nextRel = Math.max(...[...rels.matchAll(/Id="rId(\d+)"/g)].map((m) => +m[1])) + 1;
const added = [];

/* Every figure is drawn at the width of the text column, whatever its pixel
   size, with the height following from its own aspect ratio. */
const picture = (file) => {
  const bytes = readFileSync(`${DOCS}${file}`);
  const { w, h } = pngSize(bytes);
  const cx = usable * EMU_PER_TWIP, cy = Math.round(cx * h / w);
  const id = `rId${nextRel++}`, name = file.replace(/[^\w.-]/g, "");
  added.push({ id, name, bytes });
  return `<w:p><w:pPr><w:pStyle w:val="11"/><w:jc w:val="center"/></w:pPr><w:r><w:drawing>` +
    `<wp:inline distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:docPr id="${nextRel}" name="${esc(name)}"/>` +
    `<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr><pic:cNvPr id="0" name="${esc(name)}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
};

const head = doc.slice(0, doc.indexOf("<w:body>") + 8);
const body = doc.slice(doc.indexOf("<w:body>") + 8, doc.lastIndexOf("</w:body>"));
const blocks = body.match(/<w:p [^>]*>[\s\S]*?<\/w:p>|<w:p>[\s\S]*?<\/w:p>|<w:p\/>|<w:tbl>[\s\S]*?<\/w:tbl>|<w:sectPr[^>]*>[\s\S]*?<\/w:sectPr>/g);

const SECTPR = blocks[blocks.length - 1].startsWith("<w:sectPr") ? blocks[blocks.length - 1] : "";

const textOf = (b) => (b.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
  .map((t) => t.replace(/<[^>]+>/g, "")).join("").replace(/\s+/g, " ").trim();

/* Headings only: the contents list carries rows reading "List of Tables" and
   "List of Figures" too, and matching on text alone anchors to the row rather
   than to the section it points at, which silently eats the rest of the list.
   A heading in this template is centred and bold; a contents row is neither. */
const isHeading = (b) => b.includes('<w:jc w:val="center"/>') && b.includes("<w:b/>");
const findHeading = (text) => {
  const at = blocks.findIndex((b) => isHeading(b) &&
    textOf(b).toLowerCase().startsWith(text.toLowerCase()));
  if (at < 0) throw new Error(`front matter heading not found: ${text}`);
  return at;
};

/* Every splice is planned against the pristine block list and applied last
   first, so that an earlier anchor is never shifted by a later edit. */
const edits = [];
const replaceAfter = (heading, stop, newBlocks) => {
  const at = findHeading(heading);
  let end = at + 1;
  while (end < blocks.length && !stop(blocks[end], textOf(blocks[end]))) end++;
  edits.push({ at: at + 1, count: end - (at + 1), newBlocks });
};

/* the template writes its filler as "Xxxxxxxx", one capital and the rest
   lower, so a case-sensitive X{4,} matches none of it and every placeholder
   survives the replacement that was meant to remove it */
/* Title-page and acceptance-page fields the template leaves blank. Each key is
   the full text of one run in the template, which is how they happen to be
   split, so an exact run match is enough and no run has to be re-cut.
   What is not here is not known: the program chair and the dean are still
   "NAME", and the permission classifications are still unticked. The adviser
   is filled from the title page, spelled exactly as the title page spells it,
   including the placement of the suffix. */
const TITLE = "INTERACTIVE PLANNER: CIRCADIAN-AWARE PLANNER FOR NIGHT-SHIFT WORKERS: TIMING CAFFEINE, NAPS, AND MICRO-CARE";
const FIELDS = {
  "GABRELLA ANG": "GABRELLA C. ANG",
  "Day Month Year": "August 20, 2026",
  "TITLE": TITLE,
  "AUTHOR’S NAME ": "Gabrella C. Ang ",
  "“XXXXXXXXXXXXXX”": `“${TITLE}”`,
  "is hereby accepted by the Faculty of Information and Communication Studies, U.P. Open University, in partial fulfillment of the requirements for the degree Course.":
    "is hereby accepted by the Faculty of Information and Communication Studies, U.P. Open University, in partial fulfillment of the requirements for the degree Bachelor of Arts in Multimedia Studies.",
};
const fillFields = (b) => b.replace(/(<w:t[^>]*>)([^<]*)(<\/w:t>)/g,
  (m, open, text, close) => FIELDS[text] ? open + esc(FIELDS[text]) + close : m);

const isPlaceholder = (t) => /^x{4,}/i.test(t);
const stopAtRealText = (b, t) => t && !isPlaceholder(t);

/* -- biographical sketch and acknowledgement -- */
const frontText = (heading) => {
  const first = paper.indexOf(`<h2>${heading}</h2>`);
  const next = paper.indexOf("<h2>", first + 5);
  return [...paper.slice(first, next).matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((x) => x[1]);
};
replaceAfter("Biographical Sketch", stopAtRealText,
  frontText("Biographical Sketch").map((t) => bodyPara(runs(t))).concat(blank()));
replaceAfter("Acknowledgement", stopAtRealText,
  frontText("Acknowledgement").map((t) => bodyPara(runs(t))).concat(blank()));

/* -- table of contents and the two lists -- */
const tocRows = (from, to) =>
  [...between(from, to).matchAll(/<p(?: class="([^"]*)")?><span>([\s\S]*?)<\/span>/g)]
    .map(([, cls, label]) => flatPara(
      ((cls ?? "").includes("l2") ? tabRun() : "") + run(plain(label)), { dbl: false }));

replaceAfter("TABLE OF CONTENTS", (b) => isHeading(b),
  tocRows("<h2>Table of Contents</h2>", "<h2>List of Tables</h2>").concat(blank()));
replaceAfter("List of Tables", (b) => isHeading(b),
  tocRows("<h2>List of Tables</h2>", "<h2>List of Figures</h2>").concat(blank()));
replaceAfter("List of Figures", (b) => isHeading(b),
  tocRows("<h2>List of Figures</h2>", "<h2>List of Appendices</h2>").concat(blank()));

/* -- abstract, up to the section break that starts the numbered body -- */
const abstractParas = [...between("<h2>Abstract</h2>", "<h2>I. Introduction")
  .matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((x) => x[1]);
replaceAfter("Abstract", (b) => b.includes("<w:sectPr"),
  abstractParas.map((t) => bodyPara(runs(t))).concat(blank()));

/* the front matter ends at the section break after the abstract; everything
   the template held after it is placeholder body, and is replaced wholesale */
const abstractAt = findHeading("Abstract");
const bodyStart = blocks.findIndex((b, i) => i > abstractAt && b.includes("<w:sectPr"));
/* That break shares its paragraph with the first item of the chapter
   numbering, so keeping the break as it stands spends "I." on an empty
   paragraph and opens the report at Chapter II. The numbering is stripped and
   the break kept. */
edits.push({
  at: bodyStart, count: blocks.length - bodyStart,
  newBlocks: [blocks[bodyStart].replace(/<w:numPr>[\s\S]*?<\/w:numPr>/, "")],
});

for (const e of edits.sort((a, b) => b.at - a.at)) blocks.splice(e.at, e.count, ...e.newBlocks);

const keep = blocks.map(fillFields);

/* Three signature blocks read "NAME" and are identical, so they are told apart
   by position: the first is the adviser, and the title page names them. The
   second and third are the program chair and the dean, and nothing in the
   template or the paper says who they are. */
const adviserAt = keep.findIndex((b) => textOf(b) === "NAME");
if (adviserAt >= 0) keep[adviserAt] = keep[adviserAt]
  .replace(/(<w:t[^>]*>)NAME(<\/w:t>)/, "$1BENIGNO JR. AGAPITO$2");
const tail = "";
const generated = convert(paper.slice(paper.indexOf("<h2>I. Introduction</h2>")), usable);

const out = head + keep.join("") + blank() + generated.join("") + SECTPR + "</w:body></w:document>";

/* the figures, their relationships, and the content type that lets Word know
   what a .png part is — the template already declares it for the UP seal, so
   the Default is only added if the package somehow lacks one */
for (const { id, name, bytes } of added) zip.file(`word/media/${name}`, bytes);
if (added.length) {
  zip.file("word/_rels/document.xml.rels", rels.replace("</Relationships>",
    added.map(({ id, name }) =>
      `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${name}"/>`
    ).join("") + "</Relationships>"));

  const ct = await zip.file("[Content_Types].xml").async("string");
  if (!/Extension="png"/.test(ct)) zip.file("[Content_Types].xml", ct.replace("<Types",
    (m) => m).replace(/(<Types[^>]*>)/,
    `$1<Default Extension="png" ContentType="image/png"/>`));
}

zip.file("word/document.xml", out);
writeFileSync(`${DOCS}sample-paper-draft.docx`,
  await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
console.log(`built docs/sample-paper-draft.docx — ${generated.length} generated blocks, ${keep.length} kept from the template`);
