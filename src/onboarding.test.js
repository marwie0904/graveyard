import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/* QUESTIONS and the welcome copy are both local to App.jsx and not
   importable. Read them out of the source the same way tour.test.js reads
   TABS. */
const app = readFileSync(new URL("App.jsx", import.meta.url), "utf8");
const questions = app.split("const QUESTIONS = [")[1].split("\n];")[0];
const keys = [...questions.matchAll(/key: "(\w+)"/g)].map((m) => m[1]);

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven",
  "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
  "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];

describe("the onboarding question count", () => {
  /* It has drifted once already: the welcome screen still promised fourteen
     questions after the quiz was cut to twelve. The number is spelled out
     because the whole app spells its numbers out, so nothing links the two. */
  it("is the number the welcome screen promises", () => {
    const said = app.match(/(\w+) quick questions/)[1].toLowerCase();
    expect(WORDS[keys.length]).toBe(said);
  });
});

describe("the name question", () => {
  it("is asked, as free text, before anything about the shift", () => {
    expect(keys[0]).toBe("name");
    expect(questions).toMatch(/key: "name", kind: "text"/);
  });

  /* Optional is the absence of a gate, not a flag: Quiz's canNext only ever
     blocks on `multi`, so a name question that grew one would silently become
     mandatory and trap anyone who would rather not give it. */
  it("is optional — nothing can block Continue on it", () => {
    const nameQ = questions.split('key: "name"')[1].split("},")[0];
    expect(nameQ).not.toMatch(/multi/);
  });
});

/* The disclaimer screen tells the user nothing they enter is ever sent
   anywhere. That is a promise about the code, so it is checked like one:
   the day someone adds a fetch, the claim on screen becomes a lie. */
describe("the privacy claim", () => {
  it("holds — nothing in the app can send anything anywhere", () => {
    const files = ["App.jsx", "icons.jsx", "main.jsx", "ui/index.jsx",
      "screens/Dashboard.jsx", "screens/Tour.jsx", "planner.js", "storage.js",
      "stats.js", "time.js", "tokens.js", "citations.js", "focus.js",
      "mockNights.js", "share.js"];
    const calls = files.flatMap((f) => {
      let text;
      try { text = readFileSync(new URL(f, import.meta.url), "utf8"); }
      catch { return []; }
      return text.split("\n")
        .map((line, i) => ({ line: line.trim(), at: `${f}:${i + 1}` }))
        .filter(({ line }) => /\b(fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource)\s*\(/.test(line))
        .map(({ line, at }) => `${at}  ${line}`);
    });
    expect(calls).toEqual([]);
  });
});
