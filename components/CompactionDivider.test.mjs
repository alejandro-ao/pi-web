import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const source = readFileSync(new URL("./MessageView.tsx", import.meta.url), "utf8");
const file = ts.createSourceFile("MessageView.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let component;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "CompactionMessageView") component = node;
  ts.forEachChild(node, visit);
}
visit(file);
assert.ok(component);
const js = ts.transpileModule(`(${component.getText(file)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText.trim().replace(/;$/, "");

function render(expanded, visible) {
  let stateIndex = 0;
  let focused = false;
  const changes = [];
  const scope = {
    React,
    useState: () => {
      const index = stateIndex++;
      const current = index === 0 ? expanded : visible;
      return [current, (value) => changes.push([index, typeof value === "function" ? value(current) : value])];
    },
    useRef: () => ({ current: { focus() { focused = true; } } }),
    useId: () => "summary-id",
    useEffect() {},
    useI18n: () => ({ t: (key) => ({ "chat.compacted": "Compacted", "chat.compactionSummaryEnd": "End of summary" }[key] ?? key) }),
    getMessageText: (content) => content,
    CompactionSummaryDetails: ({ summary }) => React.createElement("p", null, summary),
  };
  const run = new Function("scope", `with (scope) { return ${js}; }`)(scope);
  const tree = run({ message: { content: "Summary markdown", details: { tokensBefore: 123 } } });
  const top = tree.props.children[0];
  const split = tree.props.children[1];
  const bottom = visible ? split.props.children.props.children.props.children[1] : null;
  return { tree, top, bottom, changes, get focused() { return focused; } };
}

test("expanded summary sits between two clickable separator markers", () => {
  const view = render(true, true);
  const html = renderToStaticMarkup(view.tree);
  assert.match(html, /Compacted/);
  assert.match(html, /End of summary/);
  assert.match(html, /Summary markdown/);
  assert.equal((html.match(/class="compaction-divider-toggle"/g) ?? []).length, 2);
  view.bottom.props.onClick();
  assert.deepEqual(view.changes, [[0, false]]);
  assert.equal(view.focused, true);
  view.top.props.onClick();
  assert.deepEqual(view.changes.at(-1), [0, false]);
});

test("opening mounts details; closing keeps them inert during the fold animation", () => {
  const closed = render(false, false);
  closed.top.props.onClick();
  assert.deepEqual(closed.changes, [[1, true], [0, true]]);
  assert.doesNotMatch(renderToStaticMarkup(closed.tree), /Summary markdown|End of summary/);
  const closing = renderToStaticMarkup(render(false, true).tree);
  assert.match(closing, /data-expanded="false" aria-hidden="true" inert=""/);
  assert.match(closing, /Summary markdown/);
});
