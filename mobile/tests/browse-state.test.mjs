import assert from "node:assert/strict";
import test from "node:test";

import {
  browseFilterKey,
  browseHeading,
  changeKind,
  firstPageFailed,
  firstPageLoaded,
  formatAvailableAgain,
  initialBrowseState,
  listingStatusLabel,
  nextPageFailed,
  nextPageLoaded,
  normalizeSearch,
  selectAll,
  selectCategory,
  startFirstPage,
  startNextPage,
  visibleBrowseState,
} from "../src/lib/listing-workflow.ts";

const row = (id, title = id) => ({
  id,
  owner_user_id: "o",
  category_id: "c",
  lend_mode: "lend",
  title,
  kind: "tool",
  status: "active",
});
const filters = { account: "a", kind: "all", categoryId: "", q: "" };

test("a late next-page result from a superseded key is rejected", () => {
  const keyA = browseFilterKey(filters);
  const keyB = browseFilterKey({ ...filters, q: "drill" });
  const loadedB = firstPageLoaded(initialBrowseState(), keyB, {
    items: [row("9")],
    next_cursor: "c2",
  });
  const late = nextPageLoaded(loadedB, keyA, {
    items: [row("1")],
    next_cursor: null,
  });
  assert.equal(late, loadedB);
  assert.equal(nextPageFailed(loadedB, keyA, "transient"), loadedB);
  assert.deepEqual(late.rows.map((r) => r.id), ["9"]);
});

test("a stale loaded state is hidden when the account changes", () => {
  const keyA = browseFilterKey(filters);
  const keyB = browseFilterKey({ ...filters, account: "b" });
  const state = firstPageLoaded(startFirstPage(initialBrowseState(), keyA), keyA, {
    items: [row("1")],
    next_cursor: null,
  });
  const visible = visibleBrowseState(state, keyB);
  assert.equal(visible.status, "loading");
  assert.deepEqual(visible.rows, []);
});

test("a next-page failure keeps rows and the same cursor", () => {
  const key = browseFilterKey(filters);
  let state = firstPageLoaded(startFirstPage(initialBrowseState(), key), key, {
    items: [row("1")],
    next_cursor: "c2",
  });
  state = startNextPage(state, key);
  assert.equal(state.loadingMore, true);
  state = nextPageFailed(state, key, "transient");
  assert.deepEqual(state.rows.map((r) => r.id), ["1"]);
  assert.equal(state.nextCursor, "c2");
  assert.equal(state.nextError, "transient");
  assert.equal(state.loadingMore, false);
});

test("duplicate ids on the next page leave a single row", () => {
  const key = browseFilterKey(filters);
  let state = firstPageLoaded(startFirstPage(initialBrowseState(), key), key, {
    items: [row("1"), row("2")],
    next_cursor: "c2",
  });
  state = nextPageLoaded(startNextPage(state, key), key, {
    items: [row("2", "renamed"), row("3")],
    next_cursor: null,
  });
  assert.deepEqual(state.rows.map((r) => r.id), ["1", "2", "3"]);
  assert.equal(state.rows[1].title, "renamed");
  assert.equal(state.nextCursor, null);
});

test("a first-page failure with no rows is an error state", () => {
  const key = browseFilterKey(filters);
  const state = firstPageFailed(
    startFirstPage(initialBrowseState(), key),
    key,
    "auth",
  );
  assert.equal(state.status, "error");
  assert.equal(state.firstError, "auth");
});

test("a refocus refetch of the same key keeps loaded rows", () => {
  const key = browseFilterKey(filters);
  const loaded = firstPageLoaded(startFirstPage(initialBrowseState(), key), key, {
    items: [row("1")],
    next_cursor: "c2",
  });
  assert.equal(startFirstPage(loaded, key).rows.length, 1);
});

test("changing kind clears the category", () => {
  const next = changeKind({ ...filters, categoryId: "cat" }, "skill");
  assert.equal(next.kind, "skill");
  assert.equal(next.categoryId, "");
  const same = changeKind({ ...filters, categoryId: "cat" }, "all");
  assert.equal(same.categoryId, "cat");
});

test("any filter change produces a new key and fresh state", () => {
  const keyA = browseFilterKey(filters);
  const keyB = browseFilterKey({ ...filters, kind: "tool" });
  assert.notEqual(keyA, keyB);
  const loaded = firstPageLoaded(startFirstPage(initialBrowseState(), keyA), keyA, {
    items: [row("1")],
    next_cursor: "c2",
  });
  const next = startFirstPage(loaded, keyB);
  assert.equal(next.nextCursor, null);
  assert.deepEqual(next.rows, []);
});

test("search is trimmed and capped at 100 characters", () => {
  assert.equal(normalizeSearch("  drill  "), "drill");
  assert.equal(normalizeSearch("a".repeat(150)).length, 100);
});

test("a failed refresh of a ready list keeps rows and sets refreshError, not nextError", () => {
  const key = browseFilterKey(filters);
  const loaded = firstPageLoaded(initialBrowseState(), key, {
    items: [row("1")],
    next_cursor: null,
  });
  const failed = firstPageFailed(loaded, key, "transient");
  assert.equal(failed.status, "ready");
  assert.equal(failed.refreshError, "transient");
  assert.equal(failed.nextError, null);
  assert.deepEqual(failed.rows.map((r) => r.id), ["1"]);
  assert.equal(startFirstPage(failed, key).refreshError, null);
});

test("an auth failure on refresh clears rows into the first-page error state", () => {
  const key = browseFilterKey(filters);
  const loaded = firstPageLoaded(initialBrowseState(), key, {
    items: [row("1")],
    next_cursor: "c2",
  });
  const failed = firstPageFailed(loaded, key, "auth");
  assert.equal(failed.status, "error");
  assert.equal(failed.firstError, "auth");
  assert.deepEqual(failed.rows, []);
  assert.equal(failed.nextCursor, null);
  assert.equal(failed.refreshError, null);
});

const statusLabels = {
  yourListing: "Your listing",
  available: "Available",
  askForTime: "Ask for a time",
  lentOut: "Lent out",
  paused: "Paused",
};

test("a listing status reads as available, ask for a time, lent out or paused", () => {
  const label = (listing, own = false) => listingStatusLabel(listing, own, statusLabels);
  assert.equal(label({ lend_mode: "lend", status: "active" }), "Available");
  assert.equal(label({ lend_mode: "help_only", status: "active" }), "Ask for a time");
  assert.equal(label({ lend_mode: "lend_or_help", status: "active" }), "Available");
  assert.equal(label({ lend_mode: "help_only", status: "lent_out" }), "Lent out");
  assert.equal(label({ lend_mode: "lend", status: "paused" }), "Paused");
});

test("your own listing prefixes the status with Your listing", () => {
  const label = (listing) => listingStatusLabel(listing, true, statusLabels);
  assert.equal(label({ lend_mode: "lend", status: "active" }), "Your listing · Available");
  assert.equal(label({ lend_mode: "lend", status: "lent_out" }), "Your listing · Lent out");
});

test("the Browse heading is Explore until a ready empty result names what is missing", () => {
  const heading = (status, rows, refreshError, kind) =>
    browseHeading({ status, rows, refreshError }, kind);
  assert.equal(heading("loading", [], null, "all"), "explore");
  assert.equal(heading("error", [], null, "all"), "explore");
  assert.equal(heading("ready", [row("a")], null, "all"), "explore");
  assert.equal(heading("ready", [], null, "tool"), "noTools");
  assert.equal(heading("ready", [], null, "skill"), "noSkills");
  assert.equal(heading("ready", [], null, "all"), "noResults");
  assert.equal(heading("ready", [], "transient", "tool"), "explore");
});

test("choosing All clears the kind and the category and keeps the search", () => {
  assert.deepEqual(
    selectAll({ account: "a", kind: "tool", categoryId: "c1", q: "drill" }),
    { account: "a", kind: "all", categoryId: "", q: "drill" },
  );
});

test("choosing a category selects it, and choosing it again clears it", () => {
  const base = { account: "a", kind: "skill", q: "saw" };
  assert.deepEqual(selectCategory({ ...base, categoryId: "" }, "c1"), {
    ...base,
    categoryId: "c1",
  });
  assert.deepEqual(selectCategory({ ...base, categoryId: "c1" }, "c1"), {
    ...base,
    categoryId: "",
  });
  assert.deepEqual(selectCategory({ ...base, categoryId: "c1" }, "c2"), {
    ...base,
    categoryId: "c2",
  });
});

test("a failed refresh clears a stale next-page error", () => {
  const key = browseFilterKey(filters);
  const loaded = firstPageLoaded(initialBrowseState(), key, {
    items: [row("1")],
    next_cursor: "c2",
  });
  const nextFailed = nextPageFailed(startNextPage(loaded, key), key, "transient");
  assert.equal(nextFailed.nextError, "transient");
  const refreshFailed = firstPageFailed(nextFailed, key, "transient");
  assert.equal(refreshFailed.refreshError, "transient");
  assert.equal(refreshFailed.nextError, null);
});

test("a first page that lands while the next page loads replaces the rows", () => {
  const key = browseFilterKey(filters);
  const loaded = firstPageLoaded(initialBrowseState(), key, {
    items: [row("1")],
    next_cursor: "c2",
  });
  const loadingMore = startNextPage(loaded, key);
  const refreshed = firstPageLoaded(loadingMore, key, {
    items: [row("5"), row("6")],
    next_cursor: "c9",
  });
  assert.deepEqual(refreshed.rows.map((r) => r.id), ["5", "6"]);
  assert.equal(refreshed.nextCursor, "c9");
  assert.equal(refreshed.loadingMore, false);
});

test("an available-again date is formatted, and a malformed or missing one is omitted", () => {
  assert.equal(formatAvailableAgain("2026-12-05T12:00:00Z", "en-US"), "12/5/2026");
  assert.equal(formatAvailableAgain("not-a-date", "en-US"), null);
  assert.equal(formatAvailableAgain(null, "en-US"), null);
});
