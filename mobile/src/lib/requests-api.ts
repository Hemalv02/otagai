import {
  actingForHeaders,
  type ContentLanguage,
  type Exchange,
  type Page,
  request,
} from "@/lib/api";

export type RequestStatus =
  "open" | "matched" | "in_progress" | "done" | "cancelled" | "expired";
export type ResponseKind = "offer" | "question" | "counter_time";
export type ResponseStatus =
  "pending" | "accepted" | "superseded" | "withdrawn" | "expired";

export type RequestSummary = {
  id: string;
  requester_user_id: string;
  kind: "help" | "borrow" | "borrow_with_help";
  polite_text: string;
  lang: ContentLanguage;
  status: RequestStatus;
  listing_id: string | null;
  direct_to_user_id: string | null;
  needed_from: string | null;
  needed_until: string | null;
  created_at: string;
};

export type NewDirectRequest = {
  kind: "borrow" | "help";
  raw_text: string;
  lang: ContentLanguage;
  listing_id: string;
  direct_to_user_id: string;
  ripple_max_stage: "direct";
};

export type RequestDetail = RequestSummary & {
  listing: { id: string; title: string } | null;
  raw_text: string;
  my_role: "requester" | "recipient";
  can_manage: boolean;
  can_chat: boolean;
  can_thank: boolean;
  my_response_status: ResponseStatus | null;
  my_response_id: string | null;
  exchange_id: string | null;
};

export type UpdateRequest = Partial<
  Pick<RequestDetail, "polite_text" | "needed_from" | "needed_until">
>;

export type IncomingRequest = {
  request: RequestSummary;
  seen: boolean;
  my_response_status: ResponseStatus | null;
};

export type RequestResponse = {
  id: string;
  responder_user_id: string;
  kind: ResponseKind;
  status: ResponseStatus;
  message: string | null;
  proposed_start: string | null;
};

export type SendResponse = {
  kind: ResponseKind;
  lang: ContentLanguage;
  message?: string;
  proposed_start?: string;
};

export type ExchangeDetail = Exchange & {
  mode: "help" | "loan";
  status:
    | "scheduled"
    | "active"
    | "returned"
    | "completed"
    | "cancelled"
    | "disputed";
};

function page<T>(path: string, cursor?: string, actingFor?: string) {
  const query = new URLSearchParams({ limit: "20" });
  if (cursor) query.set("cursor", cursor);
  return request<Page<T>>(`${path}?${query}`, {
    headers: actingForHeaders(actingFor),
  });
}

function post<T>(path: string, body?: object, actingFor?: string) {
  return request<T>(path, {
    method: "POST",
    headers: actingForHeaders(actingFor),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

export const requestsApi = {
  mine: (cursor?: string) => page<RequestSummary>("/users/me/requests", cursor),
  incoming: (cursor?: string) =>
    page<IncomingRequest>("/users/me/received-requests", cursor),
  detail: (id: string, actingFor?: string) =>
    request<RequestDetail>(`/requests/${id}`, {
      headers: actingForHeaders(actingFor),
    }),
  update: (id: string, body: UpdateRequest, actingFor?: string) =>
    request<RequestDetail>(`/requests/${id}`, {
      method: "PATCH",
      headers: actingForHeaders(actingFor),
      body: JSON.stringify(body),
    }),
  responses: (id: string, cursor?: string, actingFor?: string) =>
    page<RequestResponse>(`/requests/${id}/responses`, cursor, actingFor),
  respond: (id: string, body: SendResponse) =>
    post<RequestResponse>(`/requests/${id}/responses`, body),
  accept: (id: string, responseId: string, actingFor?: string) =>
    post<RequestResponse>(
      `/requests/${id}/responses/${responseId}/accept`,
      undefined,
      actingFor,
    ),
  withdraw: (id: string, responseId: string) =>
    post<RequestResponse>(`/requests/${id}/responses/${responseId}/withdraw`),
  cancel: (id: string, actingFor?: string) =>
    post<RequestDetail>(`/requests/${id}/cancel`, undefined, actingFor),
  markSeen: (id: string) =>
    request<IncomingRequest>(`/users/me/received-requests/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ seen: true }),
    }),
  person: (id: string, actingFor?: string) =>
    request<{ display_name: string }>(`/users/${id}`, {
      headers: actingForHeaders(actingFor),
    }),
  exchange: (id: string, actingFor?: string) =>
    request<ExchangeDetail>(`/exchanges/${id}`, {
      headers: actingForHeaders(actingFor),
    }),
  create: (body: NewDirectRequest, authUserId: string, signal?: AbortSignal) =>
    request<RequestSummary>("/requests", {
      method: "POST",
      body: JSON.stringify(body),
      authUserId,
      signal,
    }),
};
