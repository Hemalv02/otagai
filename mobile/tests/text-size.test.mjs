import assert from "node:assert/strict";
import test from "node:test";

import { scaleTypographyMetrics as scale } from "../src/lib/text-size.ts";

test("scales both size and locale-specific line height", () => {
  assert.deepEqual(scale(18, 28, 125), { fontSize: 22.5, lineHeight: 35 });
  assert.deepEqual(scale(18, 34, 150), { fontSize: 27, lineHeight: 51 });
});

test("uses the default for missing or invalid legacy preferences", () => {
  for (const value of [undefined, null, Number.NaN, Infinity]) {
    assert.deepEqual(scale(18, 24, value), { fontSize: 18, lineHeight: 24 });
  }
});

test("limits effective scaling to the supported profile preference range", () => {
  assert.deepEqual(scale(20, 30, 60), { fontSize: 16, lineHeight: 24 });
  assert.deepEqual(scale(20, 30, 300), { fontSize: 40, lineHeight: 60 });
});
