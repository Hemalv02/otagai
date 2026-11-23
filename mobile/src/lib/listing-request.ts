import type { Language, ListingDetail } from "./api";
import type { NewDirectRequest } from "./requests-api";

export type ListingRequestKind = "borrow" | "help";
export type ListingRequestState =
  | { mode: "actions"; actions: ListingRequestKind[] }
  | { mode: "readOnly"; reason: "own" | "paused" | "lent_out" | "noOwner" };

export const MAX_REQUEST_TEXT = 2000;

export function listingRequestState(
  listing: Pick<ListingDetail, "owner" | "status" | "lend_mode">,
  profileId: string | null | undefined,
): ListingRequestState {
  if (!listing.owner) return { mode: "readOnly", reason: "noOwner" };
  if (listing.owner.id === profileId)
    return { mode: "readOnly", reason: "own" };
  if (listing.status === "paused")
    return { mode: "readOnly", reason: "paused" };
  if (listing.status === "lent_out") {
    return { mode: "readOnly", reason: "lent_out" };
  }
  const actions: ListingRequestKind[] =
    listing.lend_mode === "lend"
      ? ["borrow"]
      : listing.lend_mode === "help_only"
        ? ["help"]
        : ["borrow", "help"];
  return { mode: "actions", actions };
}

export function isListingRequestKind(
  value: unknown,
): value is ListingRequestKind {
  return value === "borrow" || value === "help";
}

export function buildListingRequest(
  listing: Pick<ListingDetail, "id" | "owner" | "status" | "lend_mode">,
  kind: ListingRequestKind,
  text: string,
  lang: Language,
): NewDirectRequest | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > MAX_REQUEST_TEXT) return null;
  if (!listing.owner) return null;
  const state = listingRequestState(listing, null);
  if (state.mode !== "actions" || !state.actions.includes(kind)) return null;
  return {
    kind,
    raw_text: trimmed,
    lang,
    listing_id: listing.id,
    direct_to_user_id: listing.owner.id,
    ripple_max_stage: "direct",
  };
}

export type ListingRequestError =
  "unavailable" | "invalid" | "transient" | "auth" | "error";

export function listingRequestError(error: unknown): ListingRequestError {
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? (error as { status: unknown }).status
      : null;
  if (typeof status !== "number") return "error";
  if (status === 404 || status === 409) return "unavailable";
  if (status === 400 || status === 422) return "invalid";
  if (status === 401 || status === 403) return "auth";
  if (status === 0 || status === 408 || status === 429 || status >= 500) {
    return "transient";
  }
  return "error";
}

export function singleFlight<T>(
  run: () => Promise<T>,
): () => Promise<T | undefined> {
  let pending = false;
  return async () => {
    if (pending) return undefined;
    pending = true;
    try {
      return await run();
    } finally {
      pending = false;
    }
  };
}
