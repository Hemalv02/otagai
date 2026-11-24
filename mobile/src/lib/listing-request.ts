import type { Language, ListingDetail } from "./api";
import type { NewDirectRequest } from "./requests-api";

export type ListingRequestKind = "borrow" | "help";
export type ListingRequestState =
  | { mode: "actions"; actions: ListingRequestKind[] }
  | { mode: "readOnly"; reason: "own" | "paused" | "lent_out" | "noOwner" };

export function listingRequestState(
  listing: Pick<ListingDetail, "owner" | "status" | "lend_mode">,
  profileId: string | null | undefined,
): ListingRequestState {
  if (!listing.owner) return { mode: "readOnly", reason: "noOwner" };
  if (listing.owner.id === profileId)
    return { mode: "readOnly", reason: "own" };
  if (listing.status === "paused")
    return { mode: "readOnly", reason: "paused" };
  if (listing.status === "lent_out")
    return { mode: "readOnly", reason: "lent_out" };
  return {
    mode: "actions",
    actions:
      listing.lend_mode === "lend"
        ? ["borrow"]
        : listing.lend_mode === "help_only"
          ? ["help"]
          : ["borrow", "help"],
  };
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
  const state = listingRequestState(listing, null);
  const trimmed = text.trim();
  if (
    !trimmed ||
    trimmed.length > 2000 ||
    !listing.owner ||
    state.mode !== "actions" ||
    !state.actions.includes(kind)
  )
    return null;
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
      ? error.status
      : null;
  if (typeof status !== "number") return "error";
  if ([404, 409].includes(status)) return "unavailable";
  if ([400, 422].includes(status)) return "invalid";
  if ([401, 403].includes(status)) return "auth";
  if ([0, 408, 429].includes(status) || status >= 500) return "transient";
  return "error";
}

export function singleFlight<T, Args extends unknown[]>(
  run: (...args: Args) => Promise<T>,
): (...args: Args) => Promise<T | undefined> {
  let pending = false;
  return async (...args: Args) => {
    if (pending) return undefined;
    pending = true;
    try {
      return await run(...args);
    } finally {
      pending = false;
    }
  };
}
