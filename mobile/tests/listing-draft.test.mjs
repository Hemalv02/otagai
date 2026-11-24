import assert from "node:assert/strict";
import test from "node:test";
import {
  emptyDraftFields,
  mergeSuggestion,
  suggestionFields,
  parseParts,
  listingLendMode,
} from "../src/lib/listing-draft.ts";

const categories = [
  { id: "safe", is_risky: false },
  { id: "risk", is_risky: true },
];
test("suggestion retries preserve manual changes and refresh untouched fields", () => {
  const previous = {
    title: "Drill",
    categoryId: "safe",
    parts: "Battery",
    safety: "Old",
  };
  const next = {
    title: "New drill",
    categoryId: "risk",
    parts: "Charger",
    safety: "New",
  };
  assert.deepEqual(
    mergeSuggestion(
      { ...previous, title: "My edited drill", parts: "" },
      previous,
      next,
    ),
    { ...next, title: "My edited drill" },
  );
  assert.deepEqual(
    mergeSuggestion(emptyDraftFields, emptyDraftFields, next),
    next,
  );
});
test("only live categories can fill the form", () => {
  const draft = {
    title: "Drill",
    category_id: "stale",
    parts: ["Battery"],
    safety_notes: null,
  };
  assert.deepEqual(suggestionFields(draft, categories), {
    title: "Drill",
    categoryId: "",
    parts: "Battery",
    safety: "",
  });
  assert.equal(
    suggestionFields({ ...draft, category_id: "safe" }, categories).categoryId,
    "safe",
  );
});
test("parts are trimmed bounded and deduplicated after truncation", () => {
  const parts = parseParts(
    [
      " ",
      " Battery ",
      "battery",
      ...Array.from({ length: 40 }, (_, i) => `Part ${i}`),
      "x".repeat(121),
    ].join("\n"),
  );
  assert.equal(parts.length, 30);
  assert.deepEqual(parts[0], { label: "Battery", quantity: 1 });
  assert.equal(parseParts("x".repeat(121))[0].label.length, 120);
  assert.equal(parseParts("x".repeat(121) + "\n" + "x".repeat(122)).length, 1);
});
test("risky tools and all skills are help only", () => {
  assert.equal(listingLendMode("tool", categories, "safe"), "lend");
  assert.equal(listingLendMode("tool", categories, "risk"), "help_only");
  assert.equal(listingLendMode("skill", categories, "safe"), "help_only");
  assert.equal(
    listingLendMode("tool", categories, "safe", "help_only"),
    "help_only",
  );
});
