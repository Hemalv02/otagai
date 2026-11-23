import assert from "node:assert/strict";
import test from "node:test";

import {
  composeDescription,
  visibleExtras,
  emptyDraftFields,
  isRiskyCategory,
  listingLendMode,
  mergeSuggestion,
  parseParts,
  suggestionFields,
  unsureKeys,
} from "../src/lib/listing-draft.ts";

const categories = [
  { id: "c1", slug: "hand_tools", names: {}, is_risky: false, children: [] },
  { id: "c2", slug: "ladders", names: {}, is_risky: true, children: [] },
];

const draft = {
  recognized: true,
  title: "Cordless drill",
  category_hint: "power tool",
  category_id: "c1",
  category_is_risky: false,
  parts: ["Drill", "Battery"],
  safety_notes: null,
  suggested_lend_mode: "lend",
  brand: "Makita",
  model: null,
  condition: "Light wear",
  details: null,
  unsure_fields: ["model", "parts"],
};

test("suggestionFields joins parts, maps nulls and keeps live categories", () => {
  assert.deepEqual(suggestionFields(draft, categories), {
    ...emptyDraftFields,
    title: "Cordless drill",
    categoryId: "c1",
    parts: "Drill\nBattery",
    brand: "Makita",
    condition: "Light wear",
  });
});

test("a category id that is not live is dropped", () => {
  const next = suggestionFields({ ...draft, category_id: "gone" }, categories);
  assert.equal(next.categoryId, "");
});

test("an edited title survives a retry while an untouched note is replaced", () => {
  const last = { ...emptyDraftFields, title: "Drill", safety: "Old note" };
  const current = { ...last, title: "My drill" };
  const next = { ...emptyDraftFields, title: "Drill 2", safety: "New note" };
  const merged = mergeSuggestion(current, last, next);
  assert.equal(merged.title, "My drill");
  assert.equal(merged.safety, "New note");
});

test("an empty field is filled", () => {
  const next = { ...emptyDraftFields, parts: "Drill" };
  assert.equal(
    mergeSuggestion(emptyDraftFields, emptyDraftFields, next).parts,
    "Drill",
  );
});

test("a dismissed field stays empty on retry", () => {
  const next = { ...emptyDraftFields, brand: "Makita" };
  const merged = mergeSuggestion(
    emptyDraftFields,
    emptyDraftFields,
    next,
    new Set(["brand"]),
  );
  assert.equal(merged.brand, "");
});

test("parseParts trims, drops blanks, dedupes and caps", () => {
  assert.deepEqual(parseParts(" Drill \n\n  \ndrill\nBattery"), [
    { label: "Drill", quantity: 1 },
    { label: "Battery", quantity: 1 },
  ]);
  const many = Array.from({ length: 31 }, (_, i) => `part ${i}`).join("\n");
  assert.equal(parseParts(many).length, 30);
  assert.equal(parseParts("x".repeat(121))[0].label.length, 120);
});

test("lend mode is help_only for skills and risky categories", () => {
  assert.equal(isRiskyCategory(categories, "c2"), true);
  assert.equal(isRiskyCategory(categories, "c1"), false);
  assert.equal(listingLendMode("tool", categories, "c2"), "help_only");
  assert.equal(listingLendMode("skill", categories, "c1"), "help_only");
  assert.equal(listingLendMode("tool", categories, "c1"), "lend");
});

test("unsureKeys maps the server fields to form fields", () => {
  assert.deepEqual([...unsureKeys(draft)].sort(), ["model", "parts"]);
  assert.deepEqual(
    [
      ...unsureKeys({ ...draft, unsure_fields: ["category", "safety_notes"] }),
    ].sort(),
    ["categoryId", "safety"],
  );
});

test("composeDescription appends only filled details and caps length", () => {
  const labels = { brand: "Brand", model: "Model", condition: "Condition" };
  const fields = {
    ...emptyDraftFields,
    brand: "Makita",
    details: "Has a case",
  };
  assert.equal(
    composeDescription("Mine", fields, labels, fields),
    "Mine\nBrand: Makita\nHas a case",
  );
  assert.equal(
    composeDescription("", emptyDraftFields, labels, emptyDraftFields),
    "",
  );
  assert.equal(
    composeDescription("x".repeat(2100), fields, labels, fields).length,
    2000,
  );
});

test("visibleExtras shows rows the photo suggested except dismissed ones", () => {
  const suggested = { ...emptyDraftFields, brand: "Makita", model: "X1" };
  assert.deepEqual(visibleExtras(suggested, new Set(["model"])), ["brand"]);
  assert.deepEqual(visibleExtras(emptyDraftFields, new Set()), []);
});

test("clearing a suggested field keeps its row but drops it from the description", () => {
  const labels = { brand: "Brand", model: "Model", condition: "Condition" };
  const suggested = { ...emptyDraftFields, brand: "Makita" };
  const cleared = { ...emptyDraftFields };
  assert.deepEqual(visibleExtras(suggested, new Set()), ["brand"]);
  assert.equal(
    composeDescription("Mine", cleared, labels, suggested, new Set()),
    "Mine",
  );
});

test("an edited suggested row is published with the edit", () => {
  const labels = { brand: "Brand", model: "Model", condition: "Condition" };
  const suggested = { ...emptyDraftFields, brand: "Makita" };
  const edited = { ...emptyDraftFields, brand: "My brand" };
  assert.equal(
    composeDescription("", edited, labels, suggested, new Set()),
    "Brand: My brand",
  );
});

test("an edit left over from an earlier photo is not published", () => {
  const labels = { brand: "Brand", model: "Model", condition: "Condition" };
  const latest = { ...emptyDraftFields, model: "X1" };
  const stale = { ...emptyDraftFields, brand: "Old edit", model: "X1" };
  assert.deepEqual(visibleExtras(latest, new Set()), ["model"]);
  assert.equal(
    composeDescription("", stale, labels, latest, new Set()),
    "Model: X1",
  );
});

test("a dismissed row is never published", () => {
  const labels = { brand: "Brand", model: "Model", condition: "Condition" };
  const fields = {
    ...emptyDraftFields,
    brand: "Makita",
    details: "Has a case",
  };
  assert.equal(
    composeDescription("Mine", fields, labels, fields, new Set(["brand"])),
    "Mine\nHas a case",
  );
});
