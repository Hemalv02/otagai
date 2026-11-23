import type { ListingKind, ListingSummary } from "./api";

export type KindFilter = "all" | ListingKind;
export type BrowseErrorKind =
  | "transient"
  | "auth"
  | "invalid"
  | "unavailable"
  | "error";

export const SEARCH_MAX_LENGTH = 100;

export type BrowseFilters = {
  account: string;
  kind: KindFilter;
  categoryId: string;
  q: string;
};

export type BrowseState = {
  key: string;
  status: "loading" | "ready" | "error";
  rows: ListingSummary[];
  nextCursor: string | null;
  loadingMore: boolean;
  firstError: BrowseErrorKind | null;
  nextError: BrowseErrorKind | null;
};

export function normalizeSearch(raw: string) {
  return raw.trim().slice(0, SEARCH_MAX_LENGTH).trim();
}

export function browseFilterKey(filters: BrowseFilters) {
  return JSON.stringify([
    filters.account,
    filters.kind,
    filters.categoryId,
    filters.q,
  ]);
}

export function changeKind(
  filters: BrowseFilters,
  kind: KindFilter,
): BrowseFilters {
  if (kind === filters.kind) return filters;
  return { ...filters, kind, categoryId: "" };
}

export function initialBrowseState(key = ""): BrowseState {
  return {
    key,
    status: "loading",
    rows: [],
    nextCursor: null,
    loadingMore: false,
    firstError: null,
    nextError: null,
  };
}

export function startFirstPage(state: BrowseState, key: string): BrowseState {
  if (state.key === key && state.status === "ready") {
    return { ...state, loadingMore: false, nextError: null };
  }
  return initialBrowseState(key);
}

export function firstPageLoaded(
  state: BrowseState,
  key: string,
  page: { items: ListingSummary[]; next_cursor: string | null },
): BrowseState {
  return {
    key,
    status: "ready",
    rows: dedupeById([], page.items),
    nextCursor: page.next_cursor,
    loadingMore: false,
    firstError: null,
    nextError: null,
  };
}

export function firstPageFailed(
  state: BrowseState,
  key: string,
  errorKind: BrowseErrorKind,
): BrowseState {
  if (state.key === key && state.status === "ready") {
    return { ...state, loadingMore: false, nextError: errorKind };
  }
  return { ...initialBrowseState(key), status: "error", firstError: errorKind };
}

export function startNextPage(state: BrowseState, key: string): BrowseState {
  if (state.key !== key || state.status !== "ready" || !state.nextCursor) {
    return state;
  }
  return { ...state, loadingMore: true, nextError: null };
}

export function nextPageLoaded(
  state: BrowseState,
  key: string,
  page: { items: ListingSummary[]; next_cursor: string | null },
): BrowseState {
  if (state.key !== key || state.status !== "ready") return state;
  return {
    ...state,
    rows: dedupeById(state.rows, page.items),
    nextCursor: page.next_cursor,
    loadingMore: false,
    nextError: null,
  };
}

export function nextPageFailed(
  state: BrowseState,
  key: string,
  errorKind: BrowseErrorKind,
): BrowseState {
  if (state.key !== key || state.status !== "ready") return state;
  return { ...state, loadingMore: false, nextError: errorKind };
}

export function visibleBrowseState(
  state: BrowseState,
  currentKey: string,
): BrowseState {
  return state.key === currentKey ? state : initialBrowseState(currentKey);
}

export function canRetry(errorKind: BrowseErrorKind | null) {
  return errorKind === "transient";
}

function dedupeById(
  existing: ListingSummary[],
  incoming: ListingSummary[],
): ListingSummary[] {
  const result = [...existing];
  for (const row of incoming) {
    const index = result.findIndex((item) => item.id === row.id);
    if (index < 0) result.push(row);
    else result[index] = row;
  }
  return result;
}
