import assert from "node:assert/strict";
import test from "node:test";

import { buildTimingUpdate, buildWordingUpdate } from "../src/lib/request-edit.ts";

const localTime = (day, time) => ({ day, time });
const noTiming = { needed_from: null, needed_until: null };
const now = new Date(2028, 0, 4, 10).getTime();

test("wording updates only the published wording and trims surrounding space", () => {
  assert.deepEqual(buildWordingUpdate("Original", "  New wording  "), {
    polite_text: "New wording",
  });
  assert.equal(buildWordingUpdate("Original", "  "), null);
  assert.equal(buildWordingUpdate("Original", " Original "), null);
});

test("unchanged timing preserves existing precision and omitted fields", () => {
  const start = new Date(2028, 0, 3, 12, 0, 18).toISOString();
  const end = new Date(2028, 0, 6, 12, 0, 18).toISOString();
  assert.deepEqual(
    buildTimingUpdate(
      { needed_from: start, needed_until: end },
      { needed_from: localTime("2028-01-03", "12:00"), needed_until: null },
      now,
    ),
    { changes: { needed_until: null } },
  );
});

test("edited timing uses local time and permits a start without an end", () => {
  assert.deepEqual(
    buildTimingUpdate(noTiming, { needed_from: localTime("2028-01-03", "23:30") }, now),
    { changes: { needed_from: new Date(2028, 0, 3, 23, 30).toISOString() } },
  );
});

test("timing rejects incomplete inputs and an end in the past or before the start", () => {
  assert.deepEqual(
    buildTimingUpdate(noTiming, { needed_from: localTime("2028-01-04", "") }, now),
    { error: "incompleteTiming" },
  );
  assert.deepEqual(
    buildTimingUpdate(noTiming, { needed_until: localTime("2028-01-04", "10:00") }, now),
    { error: "invalidEndTime" },
  );
  assert.deepEqual(
    buildTimingUpdate(
      { ...noTiming, needed_from: new Date(2028, 0, 6, 10).toISOString() },
      { needed_until: localTime("2028-01-05", "10:00") },
      now,
    ),
    { error: "invalidEndTime" },
  );
});
