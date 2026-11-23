import assert from "node:assert/strict";
import test from "node:test";

import { analyzeAsk, findAskMatches } from "../src/lib/ask-suggestions.ts";

const catalog = [
  {
    id: "drill",
    kind: "tool",
    fields: ["Hammer drill", "Masonry bits", "holes in walls"],
  },
  {
    id: "shelves",
    kind: "skill",
    fields: ["Hang shelves", "Fitting a shelf to a wall"],
  },
  { id: "grass", kind: "tool", fields: ["Grass cutter", "Trim the lawn"] },
  { id: "own", kind: "tool", own: true, fields: ["Drill for shelves"] },
];

test("asks only when the material matters and is missing", () => {
  assert.equal(
    analyzeAsk("I'd like to put up a shelf in my living room.").needsWall,
    true,
  );
  assert.deepEqual(analyzeAsk("Hang a shelf on a concrete wall"), {
    topic: "shelf",
    wall: "masonry",
    needsWall: false,
  });
  assert.equal(analyzeAsk("借りた道具で壁に棚を取り付けたい").needsWall, true);
  assert.equal(analyzeAsk("কংক্রিটের দেয়ালে তাক লাগাতে চাই").wall, "masonry");
  assert.equal(analyzeAsk("I need a drill for Saturday").needsWall, false);
  assert.equal(analyzeAsk("Help carrying a bag of rice").needsWall, false);
  assert.equal(analyzeAsk("Hang a shelf", "unsure").needsWall, false);
  assert.equal(analyzeAsk("Hang a shelf on concrete", "wood").wall, "wood");
});

test("suggests relevant tools and skills and excludes the actor’s listings", () => {
  assert.deepEqual(findAskMatches("Hang a shelf", "masonry", catalog), {
    tools: ["drill"],
    skills: ["shelves"],
  });
  assert.deepEqual(findAskMatches("Mow my lawn", undefined, catalog), {
    tools: ["grass"],
    skills: [],
  });
});

test("an unmatched task can proceed without attaching an unrelated listing", () => {
  assert.deepEqual(findAskMatches("Trim a hedge", undefined, catalog), {
    tools: [],
    skills: [],
  });
  assert.deepEqual(
    findAskMatches("Could someone look after my kitten?", undefined, catalog),
    {
      tools: [],
      skills: [],
    },
  );
  assert.deepEqual(findAskMatches("  ", undefined, catalog), {
    tools: [],
    skills: [],
  });
});
