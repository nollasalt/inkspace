const assert = require("node:assert/strict"),
  esbuild = require("esbuild"),
  Module = require("node:module");
const compiled = esbuild.buildSync({
  entryPoints: ["src/interaction/index.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  write: false,
}).outputFiles[0].text;
const m = new Module("arrangement-test", module);
m._compile(compiled, "arrangement-test.cjs");
const { snapMove } = m.exports;
const b = { x: 0, y: 0, w: 1000, h: 500 },
  t = { x: 2000, y: 1000, w: 1000, h: 500 };
for (const scale of [0.1, 0.5, 1, 2, 8]) {
  const near = 4 / scale;
  const snapped = snapMove(b, 2000 - near, 1000 - near, [t], scale);
  assert(Math.abs(snapped.x - 2000) < 1e-8);
  assert(Math.abs(snapped.y - 1000) < 1e-8);
  assert.equal(snapped.guides.length, 2);
  assert.deepEqual(snapMove(b, 201, 101, [t], scale, true), {
    x: 201,
    y: 101,
    guides: [],
  });
}
assert.equal(
  snapMove(
    { x: 0, y: 0, w: 100, h: 50 },
    92,
    0,
    [{ x: 200, y: 0, w: 100, h: 50 }],
    1,
  ).x,
  92,
  "outside screen tolerance",
);
const spacing = snapMove(
  { x: 0, y: 0, w: 40, h: 30 },
  99,
  0,
  [
    { x: 0, y: 0, w: 40, h: 30 },
    { x: 200, y: 0, w: 40, h: 30 },
  ],
  1,
);
assert.equal(spacing.x, 100);
assert(spacing.guides.some((g) => g.spacing));
const delta = require("../vscode/notebook-delta.js");
const model = {
  title: "test",
  activePage: "p",
  pages: [
    {
      id: "p",
      view: { x: 0, y: 0, scale: 1 },
      document: {
        strokes: [],
        notes: [],
        shapes: [],
        blockState: [{ kind: "notes", id: "n", locked: false }],
        blockOrder: [{ kind: "notes", id: "n" }],
        bookmarks: [
          { id: "b", name: "region", rect: { x: 0, y: 0, w: 100, h: 100 } },
        ],
      },
    },
  ],
};
const before = delta.capture(model);
model.pages[0].document.blockState[0].locked = true;
model.pages[0].document.bookmarks[0].name = "renamed";
const patch = delta.diff(before, delta.capture(model));
assert(patch.pages[0].fields.blockState);
assert(patch.pages[0].fields.bookmarks);
assert.equal(before.pages[0].document.blockState[0].locked, false);
assert.deepEqual(delta.apply(before, patch), model);
console.log(
  "Arrangement: screen-space tolerance, bypass, equal gaps and metadata delta passed",
);
