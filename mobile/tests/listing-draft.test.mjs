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
  partsKeptOnPhotoChange,
  MAX_LISTING_DESCRIPTION,
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
    parts: "Drill × ?\nBattery × ?",
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
    composeDescription("Mine", fields, labels),
    "Mine\nBrand: Makita\nHas a case",
  );
  assert.equal(composeDescription("", emptyDraftFields, labels), "");
  const full = composeDescription(
    "x".repeat(MAX_LISTING_DESCRIPTION),
    fields,
    labels,
  );
  assert.ok(full.length > MAX_LISTING_DESCRIPTION);
  assert.match(full, /Brand: Makita/);
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
  assert.equal(composeDescription("Mine", cleared, labels), "Mine");
});

test("an edited suggested row is published with the edit", () => {
  const labels = { brand: "Brand", model: "Model", condition: "Condition" };
  const edited = { ...emptyDraftFields, brand: "My brand" };
  assert.equal(composeDescription("", edited, labels), "Brand: My brand");
});

test("a changed photo removes untouched suggestions and keeps manual edits", () => {
  const labels = { brand: "Brand", model: "Model", condition: "Condition" };
  const last = {
    ...emptyDraftFields,
    brand: "Old suggested brand",
    model: "X1",
  };
  const edited = { ...last, brand: "Reviewed brand" };
  const current = mergeSuggestion(edited, last, emptyDraftFields);
  assert.deepEqual(visibleExtras(current, new Set()), ["brand"]);
  assert.equal(
    composeDescription("", current, labels),
    "Brand: Reviewed brand",
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
    composeDescription("Mine", fields, labels, new Set(["brand"])),
    "Mine\nHas a case",
  );
});

test("structured suggested parts keep the measurable quantity through the editor", () => {
  const next = suggestionFields(
    {
      ...draft,
      part_items: [
        { label: "Drill bits", quantity: 2 },
        { label: "Battery", quantity: null },
      ],
    },
    categories,
  );
  assert.equal(next.parts, "Drill bits × 2\nBattery × ?");
  assert.deepEqual(parseParts(next.parts), [
    { label: "Drill bits", quantity: 2 },
    { label: "Battery", quantity: null },
  ]);
});

test("the help-only photo suggestion carries through publication", () => {
  assert.equal(
    listingLendMode("tool", categories, "c1", "help_only"),
    "help_only",
  );
});

test("a visible user edit is published when a new suggestion omits that detail", () => {
  const edited = { ...emptyDraftFields, brand: "Reviewed brand" };
  const labels = { brand: "Brand", model: "Model", condition: "Condition" };
  assert.equal(composeDescription("", edited, labels), "Brand: Reviewed brand");
});

test("editing one part does not keep prior unedited photo items", () => {
  const current = "Drill × 1\nDrill bits × 3\nCase × 1";
  const old = "Drill × 1\nDrill bits × 2";
  assert.equal(
    partsKeptOnPhotoChange(current, old),
    "Drill bits × 3\nCase × 1",
  );
});
