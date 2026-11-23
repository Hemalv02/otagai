import { supabase } from "@/lib/supabase";

const apiUrl = process.env.EXPO_PUBLIC_API_URL;

if (!apiUrl) {
  throw new Error("Set EXPO_PUBLIC_API_URL in mobile/.env.local.");
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
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

type Page<T> = { items: T[]; next_cursor: string | null };

type ListingRequestOptions = { authUserId?: string; signal?: AbortSignal };

async function request<T>(
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
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (data.session) {
    headers.set("Authorization", `Bearer ${data.session.access_token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${apiUrl}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "Could not reach Otagai. Check your connection.");
  }

  if (!response.ok) {
    let message = "Something went wrong. Please try again.";
    try {
      const body = (await response.json()) as { message?: unknown };
      if (typeof body.message === "string") {
        message = body.message;
      }
    } catch {
      message = `Request failed (${response.status}).`;
    }
    throw new ApiError(response.status, message);
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
    params: { q?: string; kind?: ListingKind; category_id?: string; cursor?: string; limit?: number },
    options?: ListingRequestOptions,
  ) => {
    const query = new URLSearchParams({ status: "active,lent_out" });
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
};
