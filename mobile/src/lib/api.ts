import { fetch as expoFetch } from "expo/fetch";
import { Platform } from "react-native";

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

export async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
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

export const api = {
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
