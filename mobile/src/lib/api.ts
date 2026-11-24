import { fetch as expoFetch } from "expo/fetch";
import { Platform } from "react-native";

import type { HomeView } from "@/lib/home-today";
import { supabase } from "@/lib/supabase";

const apiUrl = process.env.EXPO_PUBLIC_API_URL;

if (!apiUrl) {
  throw new Error("Set EXPO_PUBLIC_API_URL in mobile/.env.local.");
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type Language = "ja" | "en" | "bn";
export type Region = "jp" | "bd";

export type UserProfile = {
  id: string;
  kind: "self" | "managed";
  display_name: string;
  preferred_language: Language;
  languages: Language[];
  region: Region;
  timezone: string;
  age_band: string | null;
  intro: string | null;
  happy_to_help_with: string | null;
  accepts_money_orei: boolean;
  simple_mode: boolean;
  text_scale_percent: number;
  push_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  status: string;
  created_at: string;
};

export type NewProfile = {
  display_name: string;
  preferred_language: Language;
  region: Region;
  languages?: Language[];
  age_band?: string;
  happy_to_help_with?: string;
};

export type Circle = {
  id: string;
  region: Region;
  unit_type: string;
  name: string;
  name_translations: Partial<Record<Language, unknown>>;
};

export type CircleMembership = {
  circle_id: string;
  status: "pending" | "approved" | "rejected" | "removed" | "left";
  circle: Circle | null;
};

export type CircleJoin = { invite_code: string } | { circle_id: string };

export type Exchange = {
  id: string;
  request_id: string;
  response_id: string;
  requester_user_id: string;
  helper_user_id: string;
  listing_id: string | null;
  mode: string;
  status: string;
  due_at: string | null;
  scheduled_at: string | null;
  handed_over_at: string | null;
  returned_at: string | null;
  requester_confirmed_at: string | null;
  helper_confirmed_at: string | null;
  meet_place_note: string | null;
};

export type LoanExtension = {
  id: string;
  exchange_id: string;
  requested_by_user_id: string;
  new_due_at: string;
  message: string | null;
  status: "pending" | "accepted" | "declined";
  created_at: string;
  decided_at: string | null;
};

export type Notification = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export type NotificationPreferences = Pick<
  UserProfile,
  "push_enabled" | "quiet_hours_start" | "quiet_hours_end"
>;

export type Conversation = {
  id: string;
  request_id: string | null;
  response_id: string | null;
  status: string;
  participants: { user_id: string }[];
};

export type ChatMessage = {
  id: string;
  conversation_id: string;
  sender_user_id: string | null;
  kind: string;
  body: string | null;
  deleted: boolean;
  created_at: string;
};

function pageQuery(cursor?: string | null) {
  return new URLSearchParams({ limit: "20", ...(cursor ? { cursor } : {}) });
}

export type ProfileSummary = { id: string; display_name: string };

export type FamilyLink = {
  id: string;
  user_id: string;
  relative_user_id: string;
  relation: string;
  status: "pending" | "accepted" | "revoked";
  other: ProfileSummary | null;
  created_at: string;
  decided_at: string | null;
};

export type ProxyGrant = {
  id: string;
  member_user_id: string;
  caretaker_user_id: string;
  caretaker_role: string;
  can_post_requests: boolean;
  can_chat: boolean;
  can_thank_and_pay: boolean;
  can_view_activity: boolean;
  can_manage_listings: boolean;
  consent_method: string;
  consented_at: string;
  created_at: string;
  other: ProfileSummary | null;
};

export type RequestKind = "borrow" | "help" | "borrow_with_help";
export type RippleStage =
  | "direct"
  | "family"
  | "han"
  | "association"
  | "nearby";

export type RequestSummary = {
  id: string;
  requester_user_id: string;
  kind: RequestKind;
  status: string;
  polite_text: string;
  lang: Language;
  listing_id: string | null;
  direct_to_user_id: string | null;
  needed_from: string | null;
  needed_until: string | null;
  ripple_stage: RippleStage;
  ripple_max_stage: RippleStage;
  created_at: string;
};

export type Page<T> = { items: T[]; next_cursor: string | null };

const MAX_REQUEST_PAGES = 10;

type ListingRequestOptions = { authUserId?: string; signal?: AbortSignal };

export async function request<T>(
  path: string,
  { authUserId, ...init }: RequestInit & ListingRequestOptions = {},
): Promise<T> {
  if (init.signal?.aborted) throw new ApiError(0, "Request canceled.");
  const { data, error } = await supabase.auth.getSession();
  if (init.signal?.aborted) throw new ApiError(0, "Request canceled.");
  if (error || (authUserId && data.session?.user.id !== authUserId)) {
    throw new ApiError(401, "Sign in again to continue.");
  }
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (typeof init.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (data.session) {
    headers.set("Authorization", `Bearer ${data.session.access_token}`);
  }

  let response: Response;
  try {
    const fetcher =
      init.body instanceof FormData && Platform.OS !== "web"
        ? expoFetch
        : fetch;
    response = await fetcher(`${apiUrl}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "Could not reach Otagai. Check your connection.");
  }

  if (!response.ok) {
    let message = "Something went wrong. Please try again.";
    let code: string | undefined;
    let requestId: string | undefined;
    try {
      const body = (await response.json()) as {
        message?: unknown;
        code?: unknown;
        request_id?: unknown;
      };
      if (typeof body.message === "string") {
        message = body.message;
      }
      if (typeof body.code === "string") code = body.code;
      if (typeof body.request_id === "string") requestId = body.request_id;
    } catch {
      message = `Request failed (${response.status}).`;
    }
    throw new ApiError(response.status, message, code, requestId);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export type ListingKind = "tool" | "skill";
export type ListingStatus = "active" | "paused" | "lent_out";
export type CategoryNode = {
  id: string;
  slug: string;
  names: Record<string, unknown>;
  is_risky: boolean;
  children: CategoryNode[];
};
export type Media = {
  id: string;
  status: "processing" | "ready" | "rejected" | "deleted";
  urls: Record<string, string>;
};
export type LendMode = "lend" | "help_only" | "lend_or_help";
export type ListingSummary = {
  id: string;
  owner_user_id: string;
  category_id: string;
  lend_mode: LendMode;
  title: string;
  kind: ListingKind;
  status: ListingStatus;
  photo_url: string | null;
  available_again_at: string | null;
};
export type ListingDetail = {
  id: string;
  owner: { id: string; display_name: string } | null;
  category_id: string;
  description: string | null;
  safety_notes: string | null;
  lend_mode: LendMode;
  available_again_at: string | null;
  parts: { id: string; label: string; quantity: number }[];
  title: string;
  kind: ListingKind;
  status: ListingStatus;
  availability_note: string | null;
  photos: {
    media_id: string;
    thumb_url: string | null;
    display_url: string | null;
  }[];
};
export type CreateListingBody = {
  kind: ListingKind;
  category_id: string;
  title: string;
  lang: Language;
  lend_mode: "lend" | "help_only";
  media_ids: string[];
  description?: string;
  safety_notes?: string;
  availability_note?: string;
};

export const api = {
  listListings: (
    params: {
      q?: string;
      kind?: ListingKind;
      category_id?: string;
      cursor?: string;
      limit?: number;
      excludeOwn?: boolean;
      activeOnly?: boolean;
    },
    options?: ListingRequestOptions,
  ) => {
    const query = new URLSearchParams({
      status: params.activeOnly ? "active" : "active,lent_out",
    });
    if (params.excludeOwn) query.set("exclude_own", "true");
    if (params.q) query.set("q", params.q);
    if (params.kind) query.set("kind", params.kind);
    if (params.category_id) query.set("category_id", params.category_id);
    if (params.cursor) query.set("cursor", params.cursor);
    if (params.limit) query.set("limit", String(params.limit));
    return request<Page<ListingSummary>>(`/listings?${query}`, options);
  },
  listCategories: (kind: ListingKind, options?: ListingRequestOptions) =>
    request<{ items: CategoryNode[] }>(`/categories?kind=${kind}`, options),
  uploadListingPhoto: (body: FormData, options?: ListingRequestOptions) =>
    request<Media>("/media", { ...options, method: "POST", body }),
  getMedia: (id: string, options?: ListingRequestOptions) =>
    request<Media>(`/media/${encodeURIComponent(id)}`, options),
  createListing: (body: CreateListingBody, options?: ListingRequestOptions) =>
    request<ListingDetail>("/listings", {
      ...options,
      method: "POST",
      body: JSON.stringify(body),
    }),
  listMyListings: (
    params: {
      kind?: ListingKind;
      status?: ListingStatus;
      cursor?: string;
      limit?: number;
    },
    signal?: AbortSignal,
    authUserId?: string,
  ) => {
    const query = new URLSearchParams();
    if (params.kind) query.set("kind", params.kind);
    if (params.status) query.set("status", params.status);
    if (params.cursor) query.set("cursor", params.cursor);
    if (params.limit) query.set("limit", String(params.limit));
    return request<Page<ListingSummary>>(`/users/me/listings?${query}`, {
      signal,
      authUserId,
    });
  },
  getListing: (id: string, signal?: AbortSignal, authUserId?: string) =>
    request<ListingDetail>(`/listings/${encodeURIComponent(id)}`, {
      signal,
      authUserId,
    }),
  updateListing: (
    id: string,
    body: { title?: string; availability_note?: string | null },
    options?: ListingRequestOptions,
  ) =>
    request<ListingDetail>(`/listings/${encodeURIComponent(id)}`, {
      ...options,
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  pauseListing: (id: string, options?: ListingRequestOptions) =>
    request<ListingDetail>(`/listings/${encodeURIComponent(id)}/pause`, {
      ...options,
      method: "POST",
    }),
  resumeListing: (id: string, options?: ListingRequestOptions) =>
    request<ListingDetail>(`/listings/${encodeURIComponent(id)}/resume`, {
      ...options,
      method: "POST",
    }),
  deleteListing: (id: string, options?: ListingRequestOptions) =>
    request<void>(`/listings/${encodeURIComponent(id)}`, {
      ...options,
      method: "DELETE",
    }),
  getMyProfile: () => request<UserProfile>("/users/me"),
  updateNotificationPreferences: (preferences: NotificationPreferences) =>
    request<UserProfile>("/users/me", {
      method: "PATCH",
      body: JSON.stringify(preferences),
    }),
  listOpenLoanExchanges: (cursor?: string | null) => {
    const query = pageQuery(cursor);
    query.set("status", "scheduled,active,returned");
    return request<Page<Exchange>>(`/users/me/exchanges?${query}`);
  },
  getExchange: (id: string) =>
    request<Exchange>(`/exchanges/${encodeURIComponent(id)}`),
  listConversations: (cursor?: string | null) =>
    request<Page<Conversation>>(`/users/me/conversations?${pageQuery(cursor)}`),
  getConversation: (id: string) =>
    request<Conversation>(`/conversations/${encodeURIComponent(id)}`),
  listMessages: (id: string, before?: string | null) => {
    const query = new URLSearchParams({
      limit: "20",
      ...(before ? { before } : {}),
    });
    return request<Page<ChatMessage>>(
      `/conversations/${encodeURIComponent(id)}/messages?${query}`,
    );
  },
  sendMessage: (id: string, body: string, clientMessageId: string) =>
    request<ChatMessage>(`/conversations/${encodeURIComponent(id)}/messages`, {
      method: "POST",
      body: JSON.stringify({
        kind: "text",
        body,
        client_message_id: clientMessageId,
      }),
    }),
  markConversationRead: (id: string) =>
    request<unknown>(
      `/conversations/${encodeURIComponent(id)}/participants/me`,
      {
        method: "PATCH",
        body: JSON.stringify({ mark_read: true }),
      },
    ),
  getHome: () => request<HomeView>("/users/me/home"),
  getPublicProfile: (id: string) =>
    request<{ id: string; display_name: string }>(
      `/users/${encodeURIComponent(id)}`,
    ),
  advanceLoan: (id: string, action: "hand-over" | "return" | "confirm") =>
    request<Exchange>(`/exchanges/${encodeURIComponent(id)}/${action}`, {
      method: "POST",
    }),
  listExtensions: (id: string, cursor?: string | null) =>
    request<Page<LoanExtension>>(
      `/exchanges/${encodeURIComponent(id)}/extensions?${pageQuery(cursor)}`,
    ),
  requestExtension: (
    id: string,
    body: { new_due_at: string; message?: string },
  ) =>
    request<LoanExtension>(`/exchanges/${encodeURIComponent(id)}/extensions`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  decideExtension: (id: string, decision: "accept" | "decline") =>
    request<LoanExtension>(
      `/loan-extensions/${encodeURIComponent(id)}/${decision}`,
      { method: "POST" },
    ),
  listNotifications: (unreadOnly: boolean, cursor?: string | null) => {
    const query = pageQuery(cursor);
    if (unreadOnly) query.set("unread_only", "true");
    return request<Page<Notification>>(`/users/me/notifications?${query}`);
  },
  getUnreadCounts: () =>
    request<{ notifications: number; messages: number }>(
      "/users/me/unread-counts",
    ),
  markNotificationRead: (id: string) =>
    request<Notification>(`/users/me/notifications/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: "{}",
    }),
  markAllNotificationsRead: () =>
    request<void>("/users/me/notifications/read-all", { method: "POST" }),
  createProfile: (profile: NewProfile) =>
    request<UserProfile>("/users", {
      method: "POST",
      body: JSON.stringify(profile),
    }),
  previewCircleInvite: (code: string) =>
    request<{ circle: Circle; auto_approve: boolean }>(
      `/circle-invites/${encodeURIComponent(code)}`,
    ),
  findNearbyCircles: (latitude: number, longitude: number, cursor?: string) => {
    const query = new URLSearchParams({
      near: `${latitude.toFixed(4)},${longitude.toFixed(4)}`,
      ...(cursor ? { cursor } : {}),
    });
    return request<Page<Circle>>(`/circles?${query}`);
  },
  joinCircle: (target: CircleJoin) =>
    request<CircleMembership>("/users/me/memberships", {
      method: "POST",
      body: JSON.stringify(target),
    }),
  listMemberships: async () => {
    const items: CircleMembership[] = [];
    let cursor: string | null = null;
    do {
      const query = new URLSearchParams({ limit: "50" });
      if (cursor) query.set("cursor", cursor);
      const page: Page<CircleMembership> = await request(
        `/users/me/memberships?${query}`,
      );
      items.push(...page.items);
      cursor = page.next_cursor;
    } while (cursor);
    return items;
  },
  listFamilyLinks: async () =>
    (await request<{ items: FamilyLink[] }>("/users/me/family-links")).items,
  listCaretakerGrants: async () =>
    (
      await request<{ items: ProxyGrant[] }>(
        "/users/me/proxy-grants?as=caretaker",
      )
    ).items,
  listOpenRequests: async ({
    actingFor,
    signal,
  }: {
    actingFor?: string;
    signal?: AbortSignal;
  }) => {
    const headers: Record<string, string> = actingFor
      ? { "X-Acting-For": actingFor }
      : {};
    const items: RequestSummary[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const query = new URLSearchParams({ status: "open", limit: "50" });
      if (cursor) query.set("cursor", cursor);
      const page: Page<RequestSummary> = await request(
        `/users/me/requests?${query}`,
        { headers, signal },
      );
      items.push(...page.items);
      cursor = page.next_cursor;
      pages += 1;
    } while (cursor && pages < MAX_REQUEST_PAGES);
    return items;
  },
};
