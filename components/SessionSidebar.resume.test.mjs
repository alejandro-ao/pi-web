import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("./SessionSidebar.tsx", import.meta.url), "utf8");
const file = ts.createSourceFile("SessionSidebar.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let open;
let searchKeyDown;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(file) === "handleSessionSearchKeyDown") searchKeyDown = node.initializer;
  if (ts.isBinaryExpression(node) && node.left.getText(file) === "openSessionSearchRef.current") open = node.right;
  ts.forEachChild(node, visit);
}
visit(file);
assert.ok(open);
assert.ok(searchKeyDown);
const keyDownJs = ts.transpileModule(`(${searchKeyDown.getText(file)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText.trim().replace(/;$/, "");
const js = ts.transpileModule(`(${open.getText(file)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText.trim().replace(/;$/, "");

test("resume always opens Sessions search and requests focus, including repeated opens", () => {
  let tab = "files";
  let menu = {};
  let searching = false;
  let focusRequest = 0;
  const scope = {
    setMenu(value) { menu = value; },
    switchTab(value) { tab = value; },
    setSessionSearchOpen(value) { searching = value; },
    setSessionSearchFocusRequest(fn) { focusRequest = fn(focusRequest); },
  };
  const run = new Function("scope", `with (scope) { return ${js}; }`)(scope);
  run();
  assert.equal(tab, "sessions");
  assert.equal(menu, null);
  assert.equal(searching, true);
  assert.equal(focusRequest, 1);
  run();
  assert.equal(searching, true);
  assert.equal(focusRequest, 2);
});

test("Escape closes search, clears the query and focuses chat; IME is untouched", () => {
  const calls = [];
  const scope = {
    setSessionSearchOpen: (value) => calls.push(["open", value]),
    setSessionSearchQuery: (value) => calls.push(["query", value]),
    sessionSearchOpen: true,
    sessionSearchInputRef: { current: {} },
    sessionsPanelRef: { current: { querySelectorAll: () => [] } },
    onFocusChat: () => calls.push(["chat-focus"]),
    searchButtonRef: { current: { focus: () => calls.push(["toggle-focus"]) } },
  };
  const run = new Function("scope", `with (scope) { return ${keyDownJs}; }`)(scope);
  const event = {
    key: "Escape", nativeEvent: {},
    preventDefault: () => calls.push(["prevent"]),
    stopPropagation: () => calls.push(["stop"]),
  };
  run({ ...event, nativeEvent: { isComposing: true } });
  run({ ...event, keyCode: 229 });
  run({ ...event, key: "Enter" });
  assert.deepEqual(calls, []);
  run(event);
  assert.deepEqual(calls, [["prevent"], ["stop"], ["open", false], ["query", ""], ["chat-focus"]]);
});

test("arrows navigate and wrap results; Enter in the input opens the first result", () => {
  const document = { activeElement: null };
  const input = {};
  const opened = [];
  const rows = Array.from({ length: 3 }, (_, index) => ({
    focus() { document.activeElement = this; },
    scrollIntoView() {},
    click() { opened.push(index); },
  }));
  const scope = {
    sessionSearchOpen: true, sessionSearchQuery: "query", document,
    sessionSearchInputRef: { current: input },
    sessionsPanelRef: { current: { querySelectorAll: () => rows } },
  };
  const run = new Function("scope", `with (scope) { return ${keyDownJs}; }`)(scope);
  const key = (key, composing = false) => run({ key, target: document.activeElement, nativeEvent: { isComposing: composing }, preventDefault() {}, stopPropagation() {} });
  document.activeElement = input;
  key("ArrowDown");
  assert.equal(document.activeElement, rows[0]);
  key("ArrowDown");
  assert.equal(document.activeElement, rows[1]);
  key("ArrowUp");
  key("ArrowUp");
  assert.equal(document.activeElement, rows[2]);
  key("ArrowDown");
  assert.equal(document.activeElement, rows[0]);
  // Result buttons retain native Enter activation.
  key("Enter");
  assert.deepEqual(opened, []);
  document.activeElement = input;
  key("Enter");
  assert.deepEqual(opened, [0]);
  key("ArrowDown", true);
  assert.equal(document.activeElement, input);
  rows.length = 0;
  key("ArrowDown");
  key("Enter");
  assert.deepEqual(opened, [0]);
  scope.sessionSearchQuery = "";
  key("ArrowDown");
  assert.equal(document.activeElement, input);
});
