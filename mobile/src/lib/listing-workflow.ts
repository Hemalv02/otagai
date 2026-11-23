import type {
  ListingDetail,
  ListingKind,
  ListingStatus,
  ListingSummary,
} from "./api";

type MediaState = { id: string; status: string };
type ListingEditFields = Pick<ListingDetail, "title" | "availability_note">;

export function buildListingPatch(
  listing: ListingEditFields,
  title: string,
  availability: string,
) {
  const patch: { title?: string; availability_note?: string | null } = {};
  if (title !== listing.title) patch.title = title.trim();
  if (availability !== (listing.availability_note ?? "")) {
    patch.availability_note = availability.trim() || null;
  }
  return patch;
}

export function rebaseListingDraft(
  previous: ListingEditFields,
  updated: ListingEditFields,
  draft: { title: string; availability: string },
) {
  return {
    title: draft.title === previous.title ? updated.title : draft.title,
    availability:
      draft.availability === (previous.availability_note ?? "")
        ? (updated.availability_note ?? "")
        : draft.availability,
  };
}

export function reconcileListingRows(
  rows: ListingSummary[],
  listing: Pick<ListingDetail, "id" | "title" | "kind" | "status">,
  kind: "all" | ListingKind,
  status: "all" | ListingStatus,
) {
  if (
    (kind !== "all" && listing.kind !== kind) ||
    (status !== "all" && listing.status !== status)
  ) {
    return rows.filter((row) => row.id !== listing.id);
  }
  return rows.map((row) =>
    row.id === listing.id
      ? {
          ...row,
          title: listing.title,
          kind: listing.kind,
          status: listing.status,
        }
      : row,
  );
}

export async function prepareListingMedia({
  mediaId,
  upload,
  getMedia,
  onAccepted,
  signal,
  wait = () => new Promise<void>((resolve) => setTimeout(resolve, 1000)),
}: {
  mediaId: string | null;
  upload: () => Promise<MediaState>;
  getMedia: (id: string) => Promise<MediaState>;
  onAccepted: (id: string) => void;
  signal?: AbortSignal;
  wait?: () => Promise<void>;
}): Promise<string> {
  function checkCanceled() {
    if (signal?.aborted) throw new Error("Photo preparation canceled");
  }

  checkCanceled();
  let media = mediaId ? await getMedia(mediaId) : await upload();
  checkCanceled();
  onAccepted(media.id);
  if (!mediaId) media = await getMedia(media.id);
  for (let count = 0; count < 15; count++) {
    checkCanceled();
    if (media.status === "ready") return media.id;
    if (media.status !== "processing") throw new Error("Photo rejected");
    await wait();
    checkCanceled();
    media = await getMedia(media.id);
  }
  checkCanceled();
  if (media.status === "ready") return media.id;
  throw new Error("Photo is still processing");
}

export function createLatestRequest() {
  let generation = 0;
  let controller: AbortController | null = null;
  return {
    start() {
      controller?.abort();
      const own = ++generation;
      const current = new AbortController();
      controller = current;
      return {
        signal: current.signal,
        isCurrent: () => own === generation && !current.signal.aborted,
      };
    },
    cancel() {
      generation++;
      controller?.abort();
      controller = null;
    },
  };
}

export function mergeListingPages<T extends { id: string }>(
  existing: T[],
  incoming: T[],
): T[] {
  const result = [...existing];
  for (const row of incoming) {
    const index = result.findIndex((item) => item.id === row.id);
    if (index < 0) result.push(row);
    else result[index] = row;
  }
  return result;
}


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
  refreshError: BrowseErrorKind | null;
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
    refreshError: null,
  };
}

export function startFirstPage(state: BrowseState, key: string): BrowseState {
  if (state.key === key && state.status === "ready") {
    return { ...state, loadingMore: false, nextError: null, refreshError: null };
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
    rows: mergeListingPages([], page.items),
    nextCursor: page.next_cursor,
    loadingMore: false,
    firstError: null,
    nextError: null,
    refreshError: null,
  };
}

export function firstPageFailed(
  state: BrowseState,
  key: string,
  errorKind: BrowseErrorKind,
): BrowseState {
  if (state.key === key && state.status === "ready" && errorKind !== "auth") {
    return {
      ...state,
      loadingMore: false,
      nextError: null,
      refreshError: errorKind,
    };
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
    rows: mergeListingPages(state.rows, page.items),
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

export function listingStatusLabel(
  listing: Pick<ListingSummary, "lend_mode" | "status">,
  own: boolean,
  labels: {
    yourListing: string;
    available: string;
    askForTime: string;
    lentOut: string;
    paused: string;
  },
) {
  return [own ? labels.yourListing : null, availabilityLabel(listing, labels)]
    .filter(Boolean)
    .join(" · ");
}

export function browseHeading(
  view: Pick<BrowseState, "status" | "rows" | "refreshError">,
  kind: KindFilter,
): "explore" | "noTools" | "noSkills" | "noResults" {
  if (view.status !== "ready" || view.rows.length > 0 || view.refreshError) {
    return "explore";
  }
  if (kind === "tool") return "noTools";
  if (kind === "skill") return "noSkills";
  return "noResults";
}

export function emptyMessage(
  filtersActive: boolean,
  query: string,
): "emptyQuery" | "emptyFiltered" | "emptyCircle" {
  if (query) return "emptyQuery";
  return filtersActive ? "emptyFiltered" : "emptyCircle";
}

export function selectAll(filters: BrowseFilters): BrowseFilters {
  return { ...filters, kind: "all", categoryId: "" };
}

export function selectCategory(
  filters: BrowseFilters,
  id: string,
): BrowseFilters {
  return { ...filters, categoryId: filters.categoryId === id ? "" : id };
}

const LISTING_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isListingId(id: string | undefined): id is string {
  return typeof id === "string" && LISTING_ID.test(id);
}

export type DetailContext = { account: string; id: string };
export type DetailState = DetailContext &
  (
    | { status: "loading" }
    | { status: "loaded"; listing: ListingDetail }
    | { status: "error"; errorKind: BrowseErrorKind }
  );
export type DetailView =
  | "loading"
  | "unavailable"
  | "retryable"
  | "auth"
  | "error"
  | "loaded";

export function detailView(state: DetailState, current: DetailContext): DetailView {
  if (!isListingId(current.id)) return "unavailable";
  if (!isCurrentDetail(state, current)) return "loading";
  if (state.status === "loaded") return "loaded";
  if (state.status === "loading") return "loading";
  if (state.errorKind === "transient") return "retryable";
  if (state.errorKind === "auth") return "auth";
  if (state.errorKind === "unavailable" || state.errorKind === "invalid") {
    return "unavailable";
  }
  return "error";
}

export function isCurrentDetail(response: DetailContext, current: DetailContext) {
  return response.account === current.account && response.id === current.id;
}

export function isListingOwner(
  listing: Pick<ListingDetail, "owner">,
  profileId: string | null | undefined,
) {
  return listing.owner !== null && listing.owner.id === profileId;
}

export function availabilityLabel(
  listing: Pick<ListingSummary, "lend_mode" | "status">,
  labels: {
    available: string;
    askForTime: string;
    lentOut: string;
    paused: string;
  },
) {
  if (listing.status === "lent_out") return labels.lentOut;
  if (listing.status === "paused") return labels.paused;
  return listing.lend_mode === "help_only" ? labels.askForTime : labels.available;
}

export function photoUrls(listing: Pick<ListingDetail, "photos">) {
  return listing.photos.flatMap((photo) => {
    const url = photo.display_url ?? photo.thumb_url;
    return url ? [{ id: photo.media_id, url }] : [];
  });
}

export function formatAvailableAgain(iso: string | null, locale: string) {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString(locale);
}

export const NEARBY_LIMIT = 3;
export const NEARBY_FETCH = 6;

export function nearbyRows(
  rows: ListingSummary[],
  profileId: string | null,
  limit: number,
) {
  return rows
    .filter((row) => row.owner_user_id !== profileId)
    .slice(0, limit);
}
