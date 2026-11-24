import assert from "node:assert/strict";
import test from "node:test";

import { buildProfilePatch, textSizeOptions } from "../src/lib/settings.ts";

test("profile edits keep untouched fields and clear erased optional text", () => {
  assert.deepEqual(
    buildProfilePatch(
      {
        display_name: "Alice",
        intro: "I like gardening.",
        happy_to_help_with: "Plants",
      },
      { displayName: " Alice ", intro: "  ", helpWith: " Planting trees " },
    ),
    { intro: null, happy_to_help_with: "Planting trees" },
  );
});

test("saving a name does not normalize untouched text from an older profile", () => {
  assert.deepEqual(
    buildProfilePatch(
      { display_name: "Alice", intro: "  Hello.  ", happy_to_help_with: null },
      { displayName: "Ali", intro: "  Hello.  ", helpWith: "" },
    ),
    { display_name: "Ali" },
  );
});

test("text size options preserve a previously saved percentage", () => {
  assert.deepEqual(textSizeOptions(125), [100, 125, 150]);
  assert.deepEqual(textSizeOptions(140), [100, 125, 140, 150]);
  assert.deepEqual(textSizeOptions(200), [100, 125, 150, 200]);
});
