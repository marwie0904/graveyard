import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/* App.jsx pulls its logic out of the sibling modules by name, and a name it
   calls but forgot to import is not a build error under Vite — it is a
   ReferenceError thrown at render, which React answers with a blank white
   screen. That is how `movementMode` shipped: only the fourth review segment
   and the stress advice call it, so every other screen looked fine. */
const src = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const MODULES = ["planner.js", "time.js", "tokens.js", "stats.js", "storage.js",
  "mockNights.js", "citations.js", "focus.js"];
const CONSUMERS = ["App.jsx", "ui/index.jsx", "screens/Dashboard.jsx", "screens/Tour.jsx"];

const exportsOf = (f) => [...src(f).matchAll(/^export (?:default )?(?:async )?(?:function|const|let|class) (\w+)/gm)]
  .map((m) => m[1]);

describe("cross-module imports", () => {
  it("imports every sibling-module name it calls", () => {
    const missing = CONSUMERS.flatMap((f) => {
      const text = src(f);
      const imported = new Set([...text.matchAll(/import\s+(?:\w+,\s*)?\{([^}]*)\}\s*from/g)]
        .flatMap((m) => m[1].split(",").map((s) => s.trim().split(/\s+as\s+/).pop())));
      return MODULES.flatMap(exportsOf).filter((name) =>
        !imported.has(name) &&
        // not declared locally in this file, and used as a bare identifier
        !new RegExp(`(?:function|const|let|class)\\s+${name}\\b`).test(text) &&
        new RegExp(`(?<![.\\w"'\`])${name}\\s*\\(`).test(text))
        .map((name) => `${f}: uses ${name} without importing it`);
    });
    expect(missing).toEqual([]);
  });
});
