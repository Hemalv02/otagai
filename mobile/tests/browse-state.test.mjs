import assert from "node:assert/strict";
import test from "node:test";

import {
  browseFilterKey,
  changeKind,
  firstPageFailed,
  firstPageLoaded,
  initialBrowseState,
  listingStatusLabel,
  nextPageFailed,
  nextPageLoaded,
  normalizeSearch,
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

test("a lent-out card shows the lent-out label instead of the lend label", () => {
  const labels = { yourListing: "Mine", lentOut: "Lent out", lendLabel: "Available to lend" };
  const lent = listingStatusLabel({ status: "lent_out" }, false, labels);
  assert.equal(lent, "Lent out");
  assert.ok(!lent.includes("Available to lend"));
  assert.equal(listingStatusLabel({ status: "active" }, false, labels), "Available to lend");
  assert.equal(listingStatusLabel({ status: "active" }, true, labels), "Mine · Available to lend");
  assert.equal(listingStatusLabel({ status: "lent_out" }, true, labels), "Mine · Lent out");
});
