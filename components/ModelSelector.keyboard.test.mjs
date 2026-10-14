import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

// Exercise the actual selector handler against a small focusable DOM stand-in.
const source = readFileSync(new URL("./ModelSelector.tsx", import.meta.url), "utf8");
const file = ts.createSourceFile("ModelSelector.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler;
function visit(node) {
  if (ts.isJsxAttribute(node) && node.name.getText(file) === "onKeyDown") handler = node.initializer.expression;
  ts.forEachChild(node, visit);
}
visit(file);
assert.ok(handler);
const js = ts.transpileModule(`(${handler.getText(file)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText.trim().replace(/;$/, "");

function picker(count = 3) {
  const document = { activeElement: null };
  const input = { focus() { document.activeElement = input; } };
  let selected = -1;
  let closed = false;
  let filter = "";
  const rows = Array.from({ length: count }, (_, index) => ({
    focus() { document.activeElement = this; },
    scrollIntoView() {},
    click() { selected = index; },
  }));
  const scope = {
    open: true, document,
    panelRef: { current: { querySelectorAll: () => rows } },
    filterRef: { current: input },
    close() { closed = true; },
    setFilter(fn) { filter = fn(filter); },
  };
  const run = new Function("scope", `with (scope) { return ${js}; }`)(scope);
  input.focus();
  return {
    document, rows, input,
    get selected() { return selected; },
    get closed() { return closed; },
    get filter() { return filter; },
    key(key, extra = {}) {
      run({ key, target: document.activeElement, nativeEvent: {}, preventDefault() {}, stopPropagation() {}, ...extra });
    },
  };
}

test("arrows navigate and wrap model results, skipping provider headings and stars", () => {
  const p = picker();
  p.key("ArrowDown");
  assert.equal(p.document.activeElement, p.rows[0]);
  p.key("ArrowDown");
  assert.equal(p.document.activeElement, p.rows[1]);
  p.key("ArrowUp");
  p.key("ArrowUp");
  assert.equal(p.document.activeElement, p.rows[2]);
  p.key("ArrowDown");
  assert.equal(p.document.activeElement, p.rows[0]);
});

test("Enter from the filter selects the first result; Escape closes", () => {
  const p = picker();
  p.key("Enter");
  assert.equal(p.selected, 0);
  p.key("Escape");
  assert.equal(p.closed, true);
});

test("typing after navigation returns focus to the filter; IME is untouched", () => {
  const p = picker();
  p.key("ArrowDown");
  p.key("g");
  assert.equal(p.filter, "g");
  assert.equal(p.document.activeElement, p.input);
  p.key("Escape", { nativeEvent: { isComposing: true } });
  assert.equal(p.closed, false);
});

test("empty results safely ignore arrows and Enter", () => {
  const p = picker(0);
  p.key("ArrowDown");
  p.key("ArrowUp");
  p.key("Enter");
  assert.equal(p.selected, -1);
});
