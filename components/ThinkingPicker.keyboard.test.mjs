import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("./ChatInput.tsx", import.meta.url), "utf8");
const file = ts.createSourceFile("ChatInput.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler;
function visit(node) {
  if (ts.isJsxAttribute(node) && node.name.getText(file) === "onKeyDown"
    && node.initializer.getText(file).includes("closeThinkingPicker")) handler = node.initializer.expression;
  ts.forEachChild(node, visit);
}
visit(file);
assert.ok(handler);
const js = ts.transpileModule(`(${handler.getText(file)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText.trim().replace(/;$/, "");

function picker() {
  const document = { activeElement: null };
  let closed = false;
  const rows = Array.from({ length: 3 }, () => ({
    focus() { document.activeElement = this; }, scrollIntoView() {},
  }));
  const scope = {
    thinkingDropdownOpen: true, document,
    thinkingDropdownRef: { current: { querySelectorAll: () => rows } },
    closeThinkingPicker() { closed = true; },
  };
  const run = new Function("scope", `with (scope) { return ${js}; }`)(scope);
  return {
    scope, rows, document,
    get closed() { return closed; },
    key(key, composing = false) {
      run({ key, nativeEvent: { isComposing: composing }, preventDefault() {}, stopPropagation() {} });
    },
  };
}

test("reasoning picker arrows navigate option rows and wrap", () => {
  const p = picker();
  p.key("ArrowDown");
  assert.equal(p.document.activeElement, p.rows[0]);
  p.key("ArrowUp");
  assert.equal(p.document.activeElement, p.rows[2]);
  p.key("ArrowDown");
  assert.equal(p.document.activeElement, p.rows[0]);
  p.key("ArrowDown");
  assert.equal(p.document.activeElement, p.rows[1]);
});

test("Escape closes; IME and closed pickers leave keys alone", () => {
  const p = picker();
  p.key("Escape", true);
  assert.equal(p.closed, false);
  p.scope.thinkingDropdownOpen = false;
  p.key("Escape");
  assert.equal(p.closed, false);
  p.scope.thinkingDropdownOpen = true;
  p.key("Escape");
  assert.equal(p.closed, true);
});

test("Enter stays native so the focused SelectorRow button selects its level", () => {
  const p = picker();
  p.key("ArrowDown");
  p.key("Enter");
  assert.equal(p.document.activeElement, p.rows[0]);
  assert.equal(p.closed, false);
});
