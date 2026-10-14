import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("./AppShell.tsx", import.meta.url), "utf8");
const file = ts.createSourceFile("AppShell.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let callback;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(file) === "handleSelectSession") callback = node.initializer.arguments[0];
  ts.forEachChild(node, visit);
}
visit(file);
assert.ok(callback);
const js = ts.transpileModule(`(${callback.getText(file)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText.trim().replace(/;$/, "");

function select({ same = false, restore = false, keepSidebarOpen = false } = {}) {
  const session = { id: "target", cwd: "/project" };
  const state = { focusOnMount: null, focused: 0, remounts: 0 };
  const scope = {
    selectedSession: same ? session : null,
    newSessionCwd: null, activeCwd: "/project", isMobile: true,
    activeNewSessionDraftKeyRef: { current: null },
    activeProjectKeyRef: { current: "/project" },
    branchLeafChangeFnRef: { current: null }, suppressCwdBumpRef: { current: false },
    chatInputRef: { current: { focus() { state.focused++; } } },
    workspaceKeyOf: (s) => s.cwd,
    window: { location: { search: "" } }, router: { replace() {} },
    setAutoFocusSelectedSession: (value) => { state.focusOnMount = value; },
    setSessionKey: () => { state.remounts++; },
  };
  for (const name of ["setSearchTarget", "invalidateWorkspaceRestore", "changeFileWorkspace", "setActiveTopPanel", "setSidebarOpen", "setNewSessionCwd", "setSelectedSession", "setBranchTree", "setBranchActiveLeafId", "setBranchSwitchLocked", "setSystemPrompt", "setSystemTools", "setSystemInfoLoading", "setInitialSessionRestored"]) scope[name] = () => {};
  const run = new Function("scope", `with (scope) { return ${js}; }`)(scope);
  run(session, restore, undefined, undefined, { keepSidebarOpen });
  return state;
}

test("selecting another session requests composer autofocus on mount", () => {
  assert.deepEqual(select(), { focusOnMount: true, focused: 0, remounts: 1 });
});

test("reselecting the current session focuses the existing composer without remounting", () => {
  assert.deepEqual(select({ same: true }), { focusOnMount: true, focused: 1, remounts: 0 });
});

test("automatic restores and keep-sidebar-open actions do not steal focus", () => {
  assert.equal(select({ restore: true }).focusOnMount, false);
  assert.equal(select({ keepSidebarOpen: true }).focusOnMount, false);
  assert.equal(select({ same: true, keepSidebarOpen: true }).focused, 0);
});
