import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("./BranchNavigator.tsx", import.meta.url), "utf8");
const file = ts.createSourceFile("BranchNavigator.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(file) === "handlePanelKeyDown") handler = node.initializer;
  ts.forEachChild(node, visit);
}
visit(file);
assert.ok(handler);
const js = ts.transpileModule(`(${handler.getText(file)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText.trim().replace(/;$/, "");

function navigator(count = 3) {
  const document = { activeElement: null };
  let closed = 0;
  const rows = Array.from({ length: count }, () => ({
    focus() { document.activeElement = this; }, scrollIntoView() {},
  }));
  const scope = {
    document, panelRef: { current: { querySelectorAll: () => rows } },
    onClose() { closed++; },
  };
  const run = new Function("scope", `with (scope) { return ${js}; }`)(scope);
  return {
    rows, document,
    get closed() { return closed; },
    key(key, composing = false) {
      run({ key, nativeEvent: { isComposing: composing }, preventDefault() {}, stopPropagation() {} });
    },
  };
}

test("arrows wrap visible branch rows; Home and End jump to the ends", () => {
  const n = navigator();
  n.key("ArrowDown");
  assert.equal(n.document.activeElement, n.rows[0]);
  n.key("ArrowUp");
  assert.equal(n.document.activeElement, n.rows[2]);
  n.key("ArrowDown");
  assert.equal(n.document.activeElement, n.rows[0]);
  n.key("End");
  assert.equal(n.document.activeElement, n.rows[2]);
  n.key("Home");
  assert.equal(n.document.activeElement, n.rows[0]);
});

test("Escape closes; Enter stays native; IME is untouched", () => {
  const n = navigator();
  n.key("ArrowDown", true);
  assert.equal(n.document.activeElement, null);
  n.key("Escape", true);
  n.key("Enter");
  assert.equal(n.closed, 0);
  n.key("Escape");
  assert.equal(n.closed, 1);
});

test("empty branch panels safely ignore navigation", () => {
  const n = navigator(0);
  for (const key of ["ArrowDown", "ArrowUp", "Home", "End"]) n.key(key);
  assert.equal(n.document.activeElement, null);
});
