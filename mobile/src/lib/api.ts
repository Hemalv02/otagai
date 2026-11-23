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

export type Page<T> = { items: T[]; next_cursor: string | null };

export type Exchange = {
  id: string;
  requester_user_id: string;
  helper_user_id: string;
  listing_id: string | null;
  mode: string;
  status: string;
  due_at: string | null;
  scheduled_at: string | null;
  handed_over_at: string | null;
  returned_at: string | null;
  meet_place_note: string | null;
};

export type ListingDetail = {
  title: string;
  owner: { id: string; display_name: string } | null;
  photos: {
    media_id: string;
    thumb_url: string | null;
    display_url: string | null;
  }[];
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

function pageQuery(cursor?: string | null) {
  return new URLSearchParams({ limit: "20", ...(cursor ? { cursor } : {}) });
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw new ApiError(401, "Sign in again to continue.");
  }
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body) {
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

export const api = {
  getMyProfile: () => request<UserProfile>("/users/me"),
  updateNotificationPreferences: (preferences: NotificationPreferences) =>
    request<UserProfile>("/users/me", {
      method: "PATCH",
      body: JSON.stringify(preferences),
    }),
  listActiveExchanges: (cursor?: string | null) => {
    const query = pageQuery(cursor);
    query.set("status", "active");
    return request<Page<Exchange>>(`/users/me/exchanges?${query}`);
  },
  getExchange: (id: string) =>
    request<Exchange>(`/exchanges/${encodeURIComponent(id)}`),
  getListing: (id: string) =>
    request<ListingDetail>(`/listings/${encodeURIComponent(id)}`),
  getPublicProfile: (id: string) =>
    request<{ id: string; display_name: string }>(
      `/users/${encodeURIComponent(id)}`,
    ),
  recordLoanReturn: (id: string) =>
    request<Exchange>(`/exchanges/${encodeURIComponent(id)}/return`, {
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
};
