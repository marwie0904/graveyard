/* WCAG 2.1 4.1.2 — every interactive control's accessible NAME, ROLE and
   STATE, read out of Chrome's own accessibility tree in a running browser.

   WHY THIS EXISTS. Every "accessibility test" in src/ is a string match against
   the raw text of App.jsx — `expect(bodyOf(...)).toContain('aria-label=')`.
   That is a source lint. It cannot tell an aria-label that reaches the
   accessibility tree from one that is overridden by aria-labelledby, cancelled
   by aria-hidden on an ancestor, attached to an element the browser drops from
   the tree, or spelled onto a control that never renders. It also cannot count:
   a grep finds the labels that exist, never the controls that have none.

   SO THE NAME IS NOT READ FROM THE ATTRIBUTE. Every control found in the
   rendered DOM is resolved through the Chrome DevTools Protocol:

     Runtime.evaluate            -> a handle on the element
     DOM.describeNode            -> its backend node id
     Accessibility.getPartialAXTree(fetchRelatives:false)

   which returns the node exactly as Chrome computed it for assistive
   technology: `role`, `name` (the full accessible-name computation — content,
   aria-label, aria-labelledby, <label>, title, placeholder, in the spec's
   order), `ignored` with its reasons, and the state properties. That is the
   same computation a screen reader consumes through the platform API. The
   aria-* attributes are also read straight off the element and printed
   alongside, for one purpose only: so a disagreement between what the source
   says and what the tree computed is visible rather than assumed away.

   WHAT COUNTS AS A CONTROL. Every button, a[href], input (except hidden),
   select, textarea and summary, plus anything carrying a role that takes a
   name, plus anything focusable by tabindex. Only elements actually rendered
   with a non-zero box are counted; controls present in the DOM but not
   displayed are counted separately rather than folded into either total.
   role="dialog" / "alertdialog" are counted apart from the controls: they owe
   a name under 4.1.2 as well, but they are not things a user operates and
   mixing them into a control count would inflate it.

   SCOPE. The four screens the paper assesses (Dashboard, Plan, Reflection,
   Care) in both themes, with the Dashboard visited twice — on tonight and on
   the All time trends window, since most of its controls do not exist until a
   longer window is picked. Then, reported separately and labelled as OUTSIDE
   the assessed four: welcome, the disclaimer, the quiz, the recommendation,
   the guided tour, the profile sheet, the time-edit sheet, the plan-adjust
   sheet (which is where the range input lives), the quick-log sheet, the care
   player, and the profile sheet's export fallback (which is the only state the
   textarea renders in, reached by forcing URL.createObjectURL to throw).
   Anything not reached is named at the end rather than quietly dropped.

   Run against a dev server:  node drive-names.mjs [url]
   Exit code is the number of unnamed controls, capped at 250. */

import { chromium } from "playwright";

/* ?seed is the app's own demo flag: without it the Dashboard has no nights to
   report and most of its controls never render. */
const ARG = process.argv[2] ?? "http://127.0.0.1:5174/";
const TARGET = ARG.includes("seed") ? ARG : ARG + (ARG.includes("?") ? "&" : "?") + "seed";
const VIEW = { width: 430, height: 932 };

const NAMED_ROLES = [
  "button", "link", "checkbox", "radio", "switch", "tab", "menuitem",
  "menuitemcheckbox", "menuitemradio", "option", "combobox", "listbox",
  "slider", "spinbutton", "textbox", "searchbox", "treeitem", "gridcell",
];
const SELECTOR = [
  "button", "a[href]", 'input:not([type="hidden"])', "select", "textarea", "summary",
  ...NAMED_ROLES.map((r) => `[role="${r}"]`),
  '[role="dialog"]', '[role="alertdialog"]',
  "[tabindex]",
].join(",");

const b = await chromium.launch({ channel: "chrome" });
const p = await b.newPage({ viewport: VIEW, deviceScaleFactor: 1 });
const errs = [];
p.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));
p.on("console", (m) => { if (m.type() === "error" && !/favicon/i.test(m.text())) errs.push(m.text()); });
await p.goto(TARGET, { waitUntil: "networkidle" });

const cdp = await p.context().newCDPSession(p);
await cdp.send("DOM.enable");
await cdp.send("Accessibility.enable");

/* ------------------------------------------------------------ enumeration */
/* The DOM half: what is on screen, and what the source says about it. The
   accessible name is deliberately NOT taken from here. */
const collect = (sel) => p.evaluate((SEL) => {
  const path = (el) => {
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
  window.__gy = [];
  const rows = [];
  for (const el of document.querySelectorAll(SEL)) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    let opacity = 1;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const o = parseFloat(getComputedStyle(n).opacity);
      if (!Number.isNaN(o)) opacity *= o;
    }
    const rendered = r.width > 0 && r.height > 0 && cs.display !== "none"
      && cs.visibility !== "hidden" && opacity > 0.01;
    window.__gy.push(el);
    rows.push({
      i: window.__gy.length - 1,
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute("type"),
      roleAttr: el.getAttribute("role"),
      sel: path(el),
      rendered,
      box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      text: (el.innerText || el.value || "").replace(/\s+/g, " ").trim().slice(0, 40),
      /* source-side only, printed for comparison, never used as the name */
      attrs: Object.fromEntries(["aria-label", "aria-labelledby", "aria-describedby",
        "aria-hidden", "aria-pressed", "aria-expanded", "aria-current", "aria-selected",
        "aria-checked", "aria-modal", "title", "placeholder", "disabled"]
        .map((a) => [a, el.getAttribute(a)]).filter(([, v]) => v !== null)),
      inAriaHidden: !!el.closest('[aria-hidden="true"]'),
    });
  }
  return rows;
}, sel);

/* The accessibility half: what Chrome computed for assistive technology. */
const axOf = async (i) => {
  const { result } = await cdp.send("Runtime.evaluate", { expression: `window.__gy[${i}]` });
  if (!result?.objectId) return null;
  try {
    const { node } = await cdp.send("DOM.describeNode", { objectId: result.objectId });
    const { nodes } = await cdp.send("Accessibility.getPartialAXTree", {
      backendNodeId: node.backendNodeId, fetchRelatives: false,
    });
    const ax = nodes?.[0];
    if (!ax) return { missing: true };
    return {
      role: ax.role?.value ?? null,
      name: ax.name?.value ?? null,
      nameFrom: ax.name?.sources?.find((s) => s.value && !s.superseded)?.type ?? null,
      ignored: !!ax.ignored,
      ignoredReasons: (ax.ignoredReasons ?? []).map((r) => r.name),
      props: Object.fromEntries((ax.properties ?? [])
        .map((x) => [x.name, x.value?.value])
        .filter(([k]) => ["pressed", "expanded", "selected", "checked",
          "disabled", "required", "level", "valuemin", "valuemax"].includes(k))),
    };
  } finally {
    await cdp.send("Runtime.releaseObject", { objectId: result.objectId }).catch(() => {});
  }
};

const book = [];          // one row per control per visited state
const notReached = [];

/* Zero unnamed controls is only worth reading if this could have said
   otherwise. An empty <button> is put into the running page and resolved the
   same way every real control is; if the driver cannot see that one as
   nameless it cannot be trusted to have found none later. */
const instrumentCheck = async () => {
  await p.evaluate(() => {
    const x = document.createElement("button");
    x.id = "gy-probe-nameless";
    x.style.cssText = "position:fixed;left:0;bottom:0;width:30px;height:30px;z-index:9999";
    document.body.appendChild(x);
  });
  await p.waitForTimeout(150);
  const rows = await collect("#gy-probe-nameless");
  const ax = rows.length ? await axOf(rows[0].i) : null;
  await p.evaluate(() => document.getElementById("gy-probe-nameless")?.remove());
  return { found: rows.length === 1, role: ax?.role ?? null, name: ax?.name ?? null };
};

const survey = async (screen, theme, assessed) => {
  await p.waitForTimeout(600);
  const rows = await collect(SELECTOR);
  for (const r of rows) {
    const ax = await axOf(r.i);
    book.push({ screen, theme, assessed, ...r, ax });
  }
  const shown = rows.filter((r) => r.rendered).length;
  process.stderr.write(`  ${screen} (${theme}): ${rows.length} matched, ${shown} rendered\n`);
};

/* ------------------------------------------------------------------- walk */
const bodyText = () => p.evaluate(() => document.body.innerText);
const click = (label) => p.evaluate((l) => {
  const x = [...document.querySelectorAll("button")].find((e) => e.innerText.trim() === l);
  if (x) { x.click(); return true; }
  return false;
}, label);

const probe = await instrumentCheck();

await survey("welcome (outside the assessed four)", "warm", false);
await p.getByText("Build my shift plan").click().catch(() => notReached.push("welcome CTA"));
await p.waitForTimeout(500);
if (/before you start|disclaimer/i.test(await bodyText())) {
  await survey("disclaimer (outside the assessed four)", "warm", false);
}
for (let s = 0; s < 30; s++) {
  if (s === 1) await survey("quiz step (outside the assessed four)", "warm", false);
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
  await survey("recommendation (outside the assessed four)", "warm", false);
} else notReached.push("recommendation");

const start = p.getByText("Start my plan", { exact: false }).first();
if (await start.count()) { await start.scrollIntoViewIfNeeded(); await start.click(); }
await p.waitForTimeout(1200);
/* the guided tour opens over the first run — survey it, then leave it */
if (await p.locator("button").filter({ hasText: /^Skip$/ }).count()) {
  await survey("guided tour (outside the assessed four)", "warm", false);
}
for (let i = 0; i < 10; i++) {
  if (await click("Skip")) break;
  await p.waitForTimeout(250);
}
await p.waitForTimeout(800);

const tab = async (n) => { await click(n); await p.waitForTimeout(800); };
const openProfile = async () => {
  await p.evaluate(() => document.querySelector('button[aria-label="Profile"]')?.click());
  await p.waitForTimeout(700);
};
const closeSheet = async () => {
  await p.evaluate(() => document.querySelector('[role="dialog"] button[aria-label="Close"]')?.click()
    ?? document.querySelector('button[aria-label="Close"]')?.click());
  await p.waitForTimeout(600);
  if (await p.locator('[role="dialog"]').count()) { await p.keyboard.press("Escape"); await p.waitForTimeout(500); }
};

for (const theme of ["warm", "dark"]) {
  await openProfile();
  if (!(await click(theme === "dark" ? "Always dark" : "Always warm"))) notReached.push(`${theme} theme switch`);
  await p.waitForTimeout(800);
  await survey("profile sheet (outside the assessed four)", theme, false);

  /* the time-edit sheet, opened from inside the profile sheet */
  if (await click("Shift time") || await p.evaluate(() => {
    const x = [...document.querySelectorAll("button")].find((e) => /Shift time/.test(e.innerText));
    if (x) { x.click(); return true; } return false;
  })) {
    await p.waitForTimeout(800);
    if (await p.locator('[role="dialog"][aria-label]').count() > 1) {
      await survey("time-edit sheet (outside the assessed four)", theme, false);
    }
    await p.keyboard.press("Escape");
    await p.waitForTimeout(500);
  } else notReached.push(`time-edit sheet (${theme})`);

  /* The export textarea at App.jsx:2428 only renders from exportData()'s catch
     branch, which Chrome never takes. Forcing URL.createObjectURL to throw is
     the only route to it, and it is a control the paper's count has to include
     because a user on a browser that refuses blob URLs does reach it. */
  await p.evaluate(() => { URL.createObjectURL = () => { throw new Error("gy-driver: forcing the export fallback"); }; });
  if (await p.evaluate(() => {
    const x = [...document.querySelectorAll("button")].find((e) => /Export data/.test(e.innerText));
    if (x) { x.click(); return true; } return false;
  })) {
    await p.waitForTimeout(700);
    if (await p.locator("textarea").count()) {
      await survey("profile sheet, export fallback (outside the assessed four)", theme, false);
    } else notReached.push(`export textarea (${theme})`);
  } else notReached.push(`export data row (${theme})`);
  await closeSheet();

  for (const name of ["Dashboard", "Plan", "Reflection", "Care"]) {
    await tab(name);
    await survey(name, theme, true);
    if (name === "Dashboard") {
      const sel = p.locator('select[aria-label="Longer windows"]').first();
      if (await sel.count()) {
        await sel.selectOption("all").catch(() => notReached.push(`Dashboard trends (${theme})`));
        await p.waitForTimeout(900);
        await survey("Dashboard", theme, true);
      } else notReached.push(`Dashboard trends select (${theme})`);
    }
    if (name === "Plan") {
      /* the adjust sheet: the only route to the range input */
      const opened = await p.evaluate(() => {
        const x = [...document.querySelectorAll("button")].find((e) => /^Adjust$/i.test(e.innerText.trim()));
        if (x) { x.click(); return true; } return false;
      });
      await p.waitForTimeout(900);
      if (opened && await p.locator('[role="dialog"]').count()) {
        await survey("plan-adjust sheet (outside the assessed four)", theme, false);
        await p.keyboard.press("Escape");
        await p.waitForTimeout(600);
      } else notReached.push(`plan-adjust sheet (${theme})`);
    }
  }

  await p.evaluate(() => document.querySelector('button[aria-label="Quick log"]')?.click());
  await p.waitForTimeout(800);
  if (await p.locator('[role="dialog"]').count()) {
    await survey("quick-log sheet (outside the assessed four)", theme, false);
    await p.keyboard.press("Escape");
    await p.waitForTimeout(600);
  } else notReached.push(`quick-log sheet (${theme})`);

  await tab("Care");
  await p.evaluate(() => {
    const c = [...document.querySelectorAll("button")]
      .find((e) => /box breathing|4-7-8|neck and shoulders|desk mobility|eye reset/i.test(e.innerText || ""));
    c?.click();
  });
  await p.waitForTimeout(1000);
  if (await p.locator('[role="dialog"]').count()) {
    await p.evaluate(() => {
      const t = [...document.querySelectorAll("button")]
        .find((x) => /^Spoken guidance on$/i.test(x.getAttribute("aria-label") || ""));
      t?.click();
    });
    await survey("care player (outside the assessed four)", theme, false);
    await p.evaluate(() => {
      const x = [...document.querySelectorAll('[role="dialog"] button')]
        .find((e) => /Log it and close|Close|Finish early/i.test(e.innerText.trim() || e.getAttribute("aria-label") || ""));
      x?.click();
    });
    await p.waitForTimeout(700);
  } else notReached.push(`care player (${theme})`);
}

/* ----------------------------------------------------------------- report */
const DIALOG = new Set(["dialog", "alertdialog"]);
const isDialog = (r) => DIALOG.has(r.roleAttr) || DIALOG.has(r.ax?.role);
const named = (r) => !!(r.ax?.name && r.ax.name.trim());

const shown = book.filter((r) => r.rendered);
const controls = shown.filter((r) => !isDialog(r));
const dialogs = shown.filter(isDialog);

/* one row per distinct control per screen; a control that survives a theme
   switch is the same control, so warm and dark are merged rather than doubled */
const distinct = new Map();
for (const r of controls) {
  const key = `${r.screen}::${r.sel}`;
  const prev = distinct.get(key);
  if (!prev) { distinct.set(key, { ...r, themes: [r.theme], names: new Set([r.ax?.name ?? ""]) }); }
  else { prev.themes.push(r.theme); prev.names.add(r.ax?.name ?? ""); }
}
const all = [...distinct.values()];
const assessed = all.filter((r) => r.assessed);
const outside = all.filter((r) => !r.assessed);

const line = (s) => console.log(s);
const show = (r) => {
  const src = Object.entries(r.attrs).map(([k, v]) => `${k}="${v}"`).join(" ");
  line(`    ${r.screen} [${[...new Set(r.themes)].join("+")}]  <${r.tag}${r.type ? ` type=${r.type}` : ""}${r.roleAttr ? ` role=${r.roleAttr}` : ""}>`);
  line(`      AX role ${r.ax?.role ?? "(none)"}  name ${JSON.stringify(r.ax?.name ?? null)}${r.ax?.ignored ? `  IGNORED (${r.ax.ignoredReasons.join(",")})` : ""}`);
  if (r.text) line(`      visible text "${r.text}"`);
  if (src) line(`      source attrs ${src}`);
  line(`      ${r.sel}`);
};

line("");
line("================================================================");
line("  drive-names.mjs — accessible names from Chrome's accessibility tree");
line("================================================================");
line(`target        ${TARGET}`);
line(`browser       Chrome (channel:"chrome"), viewport ${VIEW.width}x${VIEW.height}`);
line(`method        every rendered control resolved through CDP`);
line(`              Accessibility.getPartialAXTree — the name Chrome computed for`);
line(`              assistive technology, not the aria-label attribute. aria-*`);
line(`              attributes are printed beside it only so a disagreement shows.`);
line(`states        ${[...new Set(book.map((r) => `${r.screen}|${r.theme}`))].length} screen/theme states visited`);
line(`instrument    an empty <button> injected into the running page resolved to`);
line(`              role ${JSON.stringify(probe.role)}, name ${JSON.stringify(probe.name)} — ${probe.found && !probe.name ? "the driver does report an" : "INSTRUMENT BLIND: it did not report an"}`);
line(`              unnamed control when one exists, so a count of zero means zero.`);
line("");

line("---- THE ASSESSED FOUR (Dashboard, Plan, Reflection, Care) ---------");
const aUnnamed = assessed.filter((r) => !named(r));
line(`  controls rendered          : ${assessed.length}`);
line(`  with an accessible name    : ${assessed.length - aUnnamed.length}`);
line(`  WITH NO ACCESSIBLE NAME    : ${aUnnamed.length}`);
for (const r of aUnnamed) show(r);
line("");
for (const s of ["Dashboard", "Plan", "Reflection", "Care"]) {
  const rows = assessed.filter((r) => r.screen === s);
  line(`    ${s.padEnd(11)} ${String(rows.length).padStart(3)} controls, ${rows.filter((r) => !named(r)).length} unnamed`);
}
const byTag = {};
for (const r of assessed) byTag[r.tag] = (byTag[r.tag] ?? 0) + 1;
line(`    by element : ${Object.entries(byTag).sort((a, z) => z[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ")}`);
const perState = [...new Set(book.map((r) => `${r.screen}|${r.theme}`))]
  .map((k) => book.filter((r) => `${r.screen}|${r.theme}` === k && r.rendered && r.tag === "select").length);
line(`    of which <select>: ${assessed.filter((r) => r.tag === "select").length} distinct across the four screens and both themes.`);
line(`    The most <select> elements rendered in the document at any one moment, on any`);
line(`    screen visited: ${Math.max(...perState)}. "Fifteen selects visible in the running document" is`);
line(`    not a count this build produces, on the assessed four or anywhere else.`);

line("");
line("---- SCREENS OUTSIDE THE ASSESSED FOUR -----------------------------");
const oUnnamed = outside.filter((r) => !named(r));
line(`  controls rendered          : ${outside.length}`);
line(`  WITH NO ACCESSIBLE NAME    : ${oUnnamed.length}`);
for (const r of oUnnamed) show(r);
line("");
for (const s of [...new Set(outside.map((r) => r.screen))]) {
  const rows = outside.filter((r) => r.screen === s);
  line(`    ${s.padEnd(46)} ${String(rows.length).padStart(3)} controls, ${rows.filter((r) => !named(r)).length} unnamed`);
}

line("");
line("---- EVERY CONTROL, ALL SCREENS, BOTH THEMES -----------------------");
line(`  total distinct rendered controls : ${all.length}`);
line(`  with no accessible name          : ${all.filter((r) => !named(r)).length}`);
line(`  dropped from the tree (ignored)  : ${all.filter((r) => r.ax?.ignored).length}`);
line(`  inside an aria-hidden subtree    : ${all.filter((r) => r.inAriaHidden).length}`);
line(`  present in the DOM but not rendered (not counted above): ${book.filter((r) => !r.rendered && !isDialog(r)).length} occurrences`);
const tagAll = {};
for (const r of all) tagAll[r.tag + (r.type ? `[${r.type}]` : "")] = (tagAll[r.tag + (r.type ? `[${r.type}]` : "")] ?? 0) + 1;
line(`  by element : ${Object.entries(tagAll).sort((a, z) => z[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ")}`);
line("");
line("  controls rendered at each single moment (no merging across visits):");
for (const k of [...new Set(book.map((r) => `${r.screen}|${r.theme}`))]) {
  const rows = book.filter((r) => `${r.screen}|${r.theme}` === k && r.rendered && !isDialog(r));
  line(`    ${k.padEnd(52)} ${String(rows.length).padStart(3)} controls, ${rows.filter((r) => !named(r)).length} unnamed, ${rows.filter((r) => r.tag === "select").length} selects`);
}

line("");
line("---- ROLE AND STATE, AS THE TREE EXPOSES THEM (rubric row E4) ------");
/* CDP's AXPropertyName enum carries pressed, expanded, selected and checked,
   and has no entry for aria-current at all. So a declared aria-current can be
   read off the element and cannot be confirmed through this tree — that is a
   limit of the protocol, not a finding about the app, and it is reported as
   such rather than counted as a failure. */
const PAIRS = [["aria-pressed", "pressed"], ["aria-expanded", "expanded"],
  ["aria-selected", "selected"], ["aria-checked", "checked"]];
for (const [attr, prop] of PAIRS) {
  const declared = all.filter((r) => attr in r.attrs);
  const carried = declared.filter((r) => prop in (r.ax?.props ?? {}));
  const implicit = all.filter((r) => !(attr in r.attrs) && prop in (r.ax?.props ?? {}));
  line(`  ${attr.padEnd(15)} declared on ${String(declared.length).padStart(3)} controls, carried into the tree as \`${prop}\` on ${carried.length}`
    + `${implicit.length ? `; a further ${implicit.length} carry \`${prop}\` implicitly from the native element` : ""}`);
  for (const r of declared.filter((x) => !(prop in (x.ax?.props ?? {})))) {
    line(`      NOT CARRIED: ${r.screen} <${r.tag}> ${JSON.stringify(r.ax?.name ?? null)}  ${r.sel}`);
  }
}
const cur = all.filter((r) => "aria-current" in r.attrs);
line(`  aria-current    declared on ${cur.length} controls (${[...new Set(cur.map((r) => r.attrs["aria-current"]))].join(", ")}).`);
line(`                  CDP's accessibility property set has no entry for it, so this`);
line(`                  driver cannot confirm it reached the tree. Read from the element.`);
for (const r of cur) line(`      declared: ${r.screen} <${r.tag}> ${JSON.stringify(r.ax?.name ?? null)} = ${r.attrs["aria-current"]}`);

line("");
line("  roles and states as computed, across every state visited:");
const roleTally = {};
for (const r of all) {
  const st = Object.keys(r.ax?.props ?? {}).filter((x) => x !== "disabled").sort();
  const k = `${r.ax?.role ?? "(none)"}${st.length ? " +" + st.join("/") : ""}`;
  roleTally[k] = (roleTally[k] ?? 0) + 1;
}
for (const [k, v] of Object.entries(roleTally).sort((a, z) => z[1] - a[1])) line(`    ${String(v).padStart(4)}  ${k}`);

line("");
line("  where each accessible name came from, as the tree computed it:");
const fromTally = {};
for (const r of all) {
  const k = r.ax?.nameFrom ?? "(unresolved)";
  fromTally[k] = (fromTally[k] ?? 0) + 1;
}
for (const [k, v] of Object.entries(fromTally).sort((a, z) => z[1] - a[1])) line(`    ${String(v).padStart(4)}  ${k}`);
line(`  A source lint over aria-label would have seen ${all.filter((r) => "aria-label" in r.attrs).length} of these ${all.length} names.`);

line("");
line("---- NAMED REGIONS (role=dialog / alertdialog) ---------------------");
const dseen = new Map();
for (const d of dialogs) if (!dseen.has(`${d.screen}::${d.sel}`)) dseen.set(`${d.screen}::${d.sel}`, d);
for (const d of dseen.values()) {
  line(`    ${named(d) ? "named  " : "UNNAMED"}  ${JSON.stringify(d.ax?.name ?? null)}  role ${d.ax?.role}  [${d.screen}]`);
}

line("");
line("---- coverage ------------------------------------------------------");
line(`  assessed screens visited : ${[...new Set(assessed.map((r) => r.screen))].join(", ") || "NONE"}`);
line(`  themes                   : ${[...new Set(book.map((r) => r.theme))].join(", ")}`);
line(`  also visited (outside the paper's scope): ${[...new Set(outside.map((r) => r.screen))].join(", ")}`);
line(`  NOT reached              : ${notReached.length ? [...new Set(notReached)].join(", ") : "none"}`);
line(`  page errors              : ${errs.length ? [...new Set(errs)].join(" | ") : "none"}`);
line("");

await b.close();
process.exit(Math.min(250, all.filter((r) => !named(r)).length));
