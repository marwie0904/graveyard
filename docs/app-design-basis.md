# App Design Basis

What the drafted paper now obliges the code to be.

Companion to `sample-paper-draft.pdf` and `reference-integration.md`.

---

## The rule

Once a claim is in the paper, it is a spec. A thesis that describes an artifact the artifact does not match is not a documentation problem — it is a defense problem. So every design decision below traces to a sentence someone can read back to you.

Verified against `src/` on 2026-08-10. Three claims are currently false and one needs rewording.

---

## 1. Claim-to-code status

| # | Paper claim | Code | Action |
|---|---|---|---|
| 1 | Plan generation is "a pure function of profile, logs, and current time" | ✅ `generateTimeline(profile, logs, now)` | none |
| 2 | Four modules: time, planning, statistics, presentation | ✅ `time.js` / `planner.js` / `stats.js` / `screens/`+`ui/` | none |
| 3 | Unit tests over scheduling, statistics, time arithmetic | ✅ 4 test files | none |
| 4 | Logging reduced to "the five events that alter the plan" | ✅ | none |
| 5 | "user-adjustable planning parameters rather than a single fixed schedule" | ✅ `ADJUSTABLE`, 17 params | none |
| 6 | Items are content objects; appearance resolved at render | ✅ `category` → `DOMAIN[category]` | none |
| 7 | Colour is a redundant channel; each domain "carries a distinct icon" | ✅ 8 domains, 8 distinct icons | none |
| 8 | **"Local-only persistence of sleep, fatigue, and caffeine records"** | ❌ **no persistence of any kind** | §2 |
| 9 | **"citation identifiers recorded on each plan item"** | ❌ no `src` field | §3 |
| 10 | **Low-emphasis colours "fell below 4.5:1 and [were] adjusted"** | ❌ measured, not fixed | §4 |
| 11 | "audio breathing exercises, short movement videos" | ❌ text only | §5 |

Claims 1–7 hold today. Do not touch them to make them "better" — they are already load-bearing exactly as written.

---

## 2. Persistence — the one that matters

`logs` is `useState([])` in `App.jsx`. There is no `localStorage`, no `fetch`, no IndexedDB anywhere in `src/`. Every log dies on refresh.

Two consequences:

- The paper's security row in Table 1 is half true. "No transmission to a server" is correct, vacuously. "Local-only persistence" is not — there is nothing to persist to.
- `stats.js` and the sleep-history chart imply multi-night data. Right now they can only ever show the current session.

A night-shift planner that forgets your night is not a prototype of the thing described. This is the only gap that breaks the artifact rather than the write-up.

**Fix — persist `profile` and `logs`, nothing else:**

```js
// App.jsx, alongside the existing state
const [profile, setProfile] = useState(() => load("gy.profile", null));
const [logs,    setLogs]    = useState(() => load("gy.logs", []));

useEffect(() => save("gy.profile", profile), [profile]);
useEffect(() => save("gy.logs", logs), [logs]);
```

```js
// storage.js — the whole module
const load = (k, fallback) => {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }   // private mode, quota, corrupt JSON
};
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
export { load, save };
```

`try/catch` on both sides is not defensive padding — Safari private browsing throws on `setItem`, and a corrupt entry would otherwise white-screen the app on load. That is the trust boundary; keep it.

Skipped: IndexedDB, schema migrations, encryption, multi-device sync. Add IndexedDB when a single night's logs stop fitting in ~5 MB, which is roughly never. Add migrations the first time you change the log shape after someone real is using it.

**Then the paper's Table 1 becomes true as written.** Also worth one added sentence in Chapter III: logs never leave the device, so the study's ethical position ("no personal, sensitive, or identifiable data will be collected") holds for the app and not only the research.

---

## 3. Traceability — make the promise executable

Chapter III says the check "is performed against citation identifiers recorded on each plan item alongside its user-facing rationale, so that the check is executed against the running system rather than against separately maintained documentation."

That sentence describes something that does not exist yet. It is also the single most valuable thing in the whole integration, because it is the evidence that the circadian literature actually governs the artifact rather than decorating it.

**Fix — one field, one test:**

```js
// planner.js — add `src` beside the existing `why`
{
  id: "caff-cutoff",
  why: "Caffeine takes hours to clear, so stopping now leaves time…",
  src: ["burke2015", "mchill2014"],
}
```

```js
// planner.test.js
it("every plan item cites at least one source", () => {
  const { items } = generateTimeline(profile, [], 0);
  const bare = items.filter(i => !i.src?.length).map(i => i.id);
  expect(bare).toEqual([]);
});
```

That test *is* the traceability check. It fails the build when someone adds a recommendation without evidence, which is the property the paper claims.

Keep the keys as plain strings matching your reference list (`burke2015`, `oriyama2018`). Skipped: a citations registry module, BibTeX parsing, a generated appendix. Add the generator when you actually need the matrix as a table — it is a ten-line `map` over `items` at that point, not a subsystem.

Items with no evidence behind them (`shift-start`, `end-shift`) are navigational, not recommendations. Give them `src: ["structural"]` rather than exempting them in the test — an explicit marker is cheaper to audit than a special case.

---

## 4. Contrast — measured, not estimated

Full audit of `tokens.js` against WCAG 2.2 AA. **The light theme is the problem, not the dark theme** — the opposite of what I assumed in `reference-integration.md`.

**WARM (light) — text**

| Pair | Ratio | AA normal (4.5) |
|---|---|---|
| `faint` on `sunken` | **2.03** | fail |
| `faint` on `bg` | **2.20** | fail |
| `faint` on `card` | **2.51** | fail |
| `muted` on `sunken` | 3.81 | fail (large-text only) |
| `muted` on `bg` | 4.13 | fail (large-text only) |
| `ink` on any | ≥ 15 | pass |

**DARK — text**

| Pair | Ratio | AA normal (4.5) |
|---|---|---|
| `faint` on `card` | 3.17 | fail (large-text only) |
| `faint` on `sunken` | 3.35 | fail (large-text only) |
| `faint` on `bg` | 3.58 | fail (large-text only) |
| `muted`, `ink` on any | ≥ 4.9 | pass |

**Domain hues** — DARK passes 3.0 on every hue. WARM fails four:

| Domain | Hex | on `card` | on `bg` |
|---|---|---|---|
| `light` | `#DDA02B` | 2.30 | 2.02 |
| `water` | `#2C9FD4` | 2.99 | 2.63 |
| `movement` | `#2FA96B` | 3.00 | 2.63 |
| `food` | `#DC6A55` | 3.37 | 2.96 |

**Fix — darken the WARM low-emphasis values and the four WARM hues.** Two honest options for the hues, pick one and say which in the paper:

1. **Treat them as decorative.** They accompany an icon *and* a text label, so meaning never depends on the hue. Then 1.4.11 does not bite and no change is needed — but the paper must say the hue is decorative, not informational.
2. **Treat them as informational** and darken all four for the light theme.

Option 1 is defensible and free. Option 2 is safer under questioning. Do not claim option 1 while the UI uses hue alone anywhere — check the chart in `stats` before deciding, since a legend keyed by colour is exactly the case that breaks it.

`faint` is a hard fail in WARM regardless of that choice. Darken it.

Re-run after editing:

```bash
python3 docs/contrast-check.py     # write it from the audit in this section
```

**Report the findings, do not hide them.** Two named failures, fixed, is more credible than a bare conformance claim. That is already how the paper is written — keep it that way and just make the past tense true.

---

## 5. Multimodal content — build one or reword

Chapter II says the planner "delivers guidance in several media — text, audio breathing exercises, short movement videos, and visual timelines." Today it delivers text and timelines.

The DeRose argument does not require the media to exist — it is about the data model *affording* them, which is genuinely true and worth keeping. But the sentence as drafted describes shipped content.

**Two ways out. Take the second unless you want the demo.**

1. **Build the minimum honest version:** one audio breathing track on the `deep-rest` item. Native `<audio controls src="...">` inside the existing item card. No player component, no dependency, no abstraction over "media types" — one element, one file. That makes "audio breathing exercises" true, and one is enough for a prototype whose scope is explicitly limited.
2. **Reword to match the model:** change "delivers guidance in several media" to "is designed to deliver guidance in several media," and state in Chapter III's scope that the prototype implements text and timeline rendering, with audio and video content specified but not authored. Costs one sentence and zero code.

Do **not** build a content-type abstraction, a media registry, or a player component for content that does not exist yet. If you take option 1 and later add video, `<video>` is a second element, not a refactor.

---

## 6. Out of scope — say no in writing

The paper's Scope and Limitations already excludes these. Repeating them here so they do not creep in:

- **Push notifications / reminders.** The architecture affords it, the prototype does not do it. Chapter II's phrase "can be rendered as… a reminder notification" is a claim about the data model, which is true. Leave it.
- **Accounts, sync, backend.** Directly contradicts the local-only security requirement in Table 1.
- **Acceptance / end-user testing.** Explicitly out of scope per Module 5's definition. Building a feedback form invites the question of why you did not use it.
- **Effectiveness measurement.** The study makes no health-outcome claim. Any analytics that looks like outcome tracking undermines that position and raises an ethics question you have not cleared.

---

## 7. Order of work

1. **Persistence** (§2) — the only item that breaks the artifact. ~20 lines.
2. **`src` field + traceability test** (§3) — makes the paper's central methodological claim real.
3. **WARM contrast fixes** (§4) — mechanical; decide the hue question first.
4. **Multimodal: build one or reword** (§5) — reword unless you want it in the demo.

1–3 are a short afternoon. After them, every claim in `sample-paper-draft.pdf` is true of the code, which is the actual goal of this document.
