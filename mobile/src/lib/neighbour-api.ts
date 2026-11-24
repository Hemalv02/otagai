import {
  ApiError,
  request,
  type Exchange,
  type Language,
  type Page,
} from "@/lib/api";

export { isUuid } from "@/lib/uuid";

type Person = { id: string; display_name: string };
export type PublicNeighbour = Person & {
  avatar_url: string | null;
  languages: Language[];
  intro: string | null;
  happy_to_help_with: string | null;
};
export type Pair = {
  i_helped_them: number;
  they_helped_me: number;
  last_exchange_at: string | null;
};
type Neighbour = Pair & { other: Person };
export type ThankYou = {
  id: string;
  exchange_id: string;
  from_user_id: string;
  to_user_id: string;
  note: string | null;
  lang: Language | null;
  gift_type: string;
  created_at: string;
};
export type ReportTarget = "user" | "listing" | "message" | "request";
export type ReportReason = "harassment" | "other";
type HistoryExchange = Exchange & { completed_at: string | null };
type NeighbourListing = {
  id: string;
  title: string;
  kind: string;
  lend_mode: "lend" | "help_only" | "lend_or_help";
  status: string;
  photo_url: string | null;
};

export function isUnavailable(error: unknown) {
  return error instanceof ApiError && [403, 404].includes(error.status);
}

export function partnerFor(exchange: Exchange, profileId: string) {
  if (exchange.requester_user_id === profileId) return exchange.helper_user_id;
  if (exchange.helper_user_id === profileId) return exchange.requester_user_id;
  return null;
}

function pagePath(
  path: string,
  filters: Record<string, string> = {},
  cursor?: string | null,
) {
  const query = new URLSearchParams({ limit: "20", ...filters });
  if (cursor) query.set("cursor", cursor);
  return `${path}?${query}`;
}

export function neighbourApi(authUserId: string) {
  function get<T>(path: string) {
    return request<T>(path, { authUserId });
  }
  function post<T>(path: string, body: unknown) {
    return request<T>(path, {
      authUserId,
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  return {
    neighbours: () => get<{ items: Neighbour[] }>("/users/me/neighbours"),
    profile: (id: string) =>
      get<PublicNeighbour>(`/users/${encodeURIComponent(id)}`),
    pair: (id: string) => get<Pair>(`/users/${encodeURIComponent(id)}/pair`),
    exchanges: (cursor?: string | null) =>
      get<Page<HistoryExchange>>(
        pagePath("/users/me/exchanges", { status: "completed" }, cursor),
      ),
    exchange: (id: string) =>
      get<Exchange>(`/exchanges/${encodeURIComponent(id)}`),
    listing: (id: string) =>
      get<{ title: string }>(`/listings/${encodeURIComponent(id)}`),
    listings: (id: string) =>
      get<Page<NeighbourListing>>(
        pagePath(`/users/${encodeURIComponent(id)}/listings`),
      ),
    request: (id: string) =>
      get<{ polite_text: string }>(`/requests/${encodeURIComponent(id)}`),
    thankYou: (id: string) =>
      get<ThankYou>(`/thank-yous/${encodeURIComponent(id)}`),
    sent: (cursor?: string | null) =>
      get<Page<ThankYou>>(
        pagePath("/users/me/thank-yous", { direction: "sent" }, cursor),
      ),
    sendThankYou: (
      exchangeId: string,
      note: string,
      lang: Language,
      aiDrafted: boolean,
    ) =>
      post<ThankYou>("/thank-yous", {
        exchange_id: exchangeId,
        gift_type: "note",
        note,
        lang,
        ai_drafted: aiDrafted,
      }),
    suggest: (
      helpedWith: string,
      language: Language,
      culturePack: "japan" | "bangladesh",
    ) =>
      post<{ note: string }>("/ai/thank-you-drafts", {
        helped_with: helpedWith,
        language,
        culture_pack: culturePack,
      }),
    report: (
      submissionId: string,
      targetType: ReportTarget,
      targetId: string,
      reason: ReportReason,
      details: string,
    ) =>
      post<{ id: string }>("/reports", {
        submission_id: submissionId,
        target_type: targetType,
        target_id: targetId,
        reason,
        ...(details.trim() ? { details: details.trim() } : {}),
      }),
    block: (id: string) => post<Person>("/users/me/blocks", { user_id: id }),
    blocks: (cursor?: string | null) =>
      get<Page<Person>>(pagePath("/users/me/blocks", {}, cursor)),
    unblock: (id: string) =>
      request<void>(`/users/me/blocks/${encodeURIComponent(id)}`, {
        authUserId,
        method: "DELETE",
      }),
  };
}

export async function optionalVisible<T>(
  result: Promise<T>,
): Promise<T | null> {
  try {
    return await result;
  } catch (error) {
    if (isUnavailable(error)) return null;
    throw error;
  }
}

export async function exchangeLabel(
  api: ReturnType<typeof neighbourApi>,
  exchange: Exchange,
) {
  const listing = exchange.listing_id
    ? await optionalVisible(api.listing(exchange.listing_id))
    : null;
  if (listing?.title) return listing.title;
  const source = await optionalVisible(api.request(exchange.request_id));
  return source?.polite_text ?? null;
}

export async function findSentNote(
  api: ReturnType<typeof neighbourApi>,
  exchangeId: string,
) {
  let cursor: string | null = null;
  do {
    const page: Page<ThankYou> = await api.sent(cursor);
    const existing = page.items.find((item) => item.exchange_id === exchangeId);
    if (existing) return existing;
    cursor = page.next_cursor;
  } while (cursor);
  return null;
}
